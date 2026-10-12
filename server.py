#!/usr/bin/env python3
"""Kiln: 2D game asset workbench. Serves the UI, drives ComfyUI, keeps the library.

Stdlib only. ComfyUI is expected at COMFY (default 127.0.0.1:8188).
"""
import base64, json, os, random, re, socket, struct, threading, time, urllib.request, urllib.parse, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import play
import release
import tidy
from checks import GODOT, list_scripts, check_script, doctor, snapshot, history, restore_copy

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
LIB = ROOT / 'library'
COMFY = os.environ.get('KILN_COMFY', '127.0.0.1:8188')
HOST = os.environ.get('KILN_HOST', '0.0.0.0')
PORT = int(os.environ.get('KILN_PORT', '8510'))
HOME = Path.home()
CLIENT = 'kiln-' + uuid.uuid4().hex[:8]

# Engines: which checkpoint + loras + prompt prefix. Checked against what ComfyUI has.
ENGINES = {
    'sprite': {'label': 'Sprite', 'ckpt': 'AllInOnePixel.safetensors', 'prefix': 'pixelsprite, ',
               'loras': [('lcm-lora-sdv1-5.safetensors', 1.0)]},
    'scene': {'label': 'Scene', 'ckpt': 'AllInOnePixel.safetensors', 'prefix': '16bitscene, ',
              'loras': [('lcm-lora-sdv1-5.safetensors', 1.0)]},
    'painted': {'label': 'Painted', 'ckpt': 'DreamShaper_8_pruned.safetensors', 'prefix': 'PixArFK, pixel art, ',
                'loras': [('lcm-lora-sdv1-5.safetensors', 1.0), ('PixelArtRedmond15V.safetensors', 0.9)]},
}
NEG = 'blurry, jpeg artifacts, smooth gradient, photo, 3d render, text, watermark, signature, frame, border'

CLOUD_CAP = float(os.environ.get('KILN_CLOUD_CAP', '2.00'))   # dollars of paid cloud images, ever
CLOUD_DIR = LIB / 'cloud'
KEYS = HOME / '.config/uwf-apps/keys.env'
JOBS = {}          # prompt_id -> {state, step, steps, images, err, t0}
LOCK = threading.Lock()


def http(method, path, body=None, headers=None, timeout=30):
    req = urllib.request.Request(f'http://{COMFY}{path}', data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def comfy_json(path):
    return json.loads(http('GET', path))


# ------------------------------------------------------------ comfy websocket ---
def ws_listen():
    """Minimal websocket client for ComfyUI progress messages. Reconnects forever."""
    host, port = COMFY.split(':')
    while True:
        try:
            s = socket.create_connection((host, int(port)), timeout=10)
            key = base64.b64encode(os.urandom(16)).decode()
            s.sendall((f'GET /ws?clientId={CLIENT} HTTP/1.1\r\nHost: {COMFY}\r\nUpgrade: websocket\r\n'
                       f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
            buf = b''
            while b'\r\n\r\n' not in buf:
                buf += s.recv(4096)
            buf = buf.split(b'\r\n\r\n', 1)[1]
            s.settimeout(None)

            def need(n):
                nonlocal buf
                while len(buf) < n:
                    d = s.recv(65536)
                    if not d:
                        raise ConnectionError
                    buf += d

            while True:
                need(2)
                op, ln = buf[0] & 0x0F, buf[1] & 0x7F
                off = 2
                if ln == 126:
                    need(4); ln = struct.unpack('>H', buf[2:4])[0]; off = 4
                elif ln == 127:
                    need(10); ln = struct.unpack('>Q', buf[2:10])[0]; off = 10
                need(off + ln)
                payload, buf = buf[off:off + ln], buf[off + ln:]
                if op == 1:
                    on_msg(json.loads(payload))
                elif op == 8:
                    raise ConnectionError
        except Exception:
            time.sleep(3)


def on_msg(m):
    t, d = m.get('type'), m.get('data') or {}
    pid = d.get('prompt_id')
    with LOCK:
        j = JOBS.get(pid)
        if not j:
            return
        if t == 'progress':
            j['state'], j['step'], j['steps'] = 'running', d.get('value', 0), d.get('max', 0)
        elif t == 'executing' and d.get('node') is not None:
            j['state'] = 'running'
            j['node'] = d.get('node')
        elif t == 'execution_error':
            j['state'], j['err'] = 'error', d.get('exception_message', 'generation failed')


# ------------------------------------------------------------------ workflows ---
def upload_init(b64png):
    raw = base64.b64decode(b64png.split(',', 1)[-1])
    name = f'kiln_init_{uuid.uuid4().hex[:10]}.png'
    bnd = uuid.uuid4().hex
    body = (f'--{bnd}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
            f'Content-Type: image/png\r\n\r\n').encode() + raw + \
           f'\r\n--{bnd}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{bnd}--\r\n'.encode()
    r = json.loads(http('POST', '/upload/image', body, {'Content-Type': f'multipart/form-data; boundary={bnd}'}))
    return r['name']


def build(req):
    eng = ENGINES.get(req.get('engine'), ENGINES['sprite'])
    w = max(256, min(1024, int(req.get('w', 512)) // 8 * 8))
    h = max(256, min(1024, int(req.get('h', 512)) // 8 * 8))
    seed = int(req.get('seed', -1))
    if seed < 0:
        seed = random.randint(0, 2**31 - 1)
    lcm = bool(req.get('fast', True))
    steps = int(req.get('steps') or (6 if lcm else 22))
    cfg = float(req.get('cfg') or (1.6 if lcm else 7.0))
    g = {
        'ck': {'class_type': 'CheckpointLoaderSimple', 'inputs': {'ckpt_name': eng['ckpt']}},
    }
    model, clip = ['ck', 0], ['ck', 1]
    for i, (lname, s) in enumerate(eng['loras']):
        if 'lcm' in lname and not lcm:
            continue
        g[f'l{i}'] = {'class_type': 'LoraLoader', 'inputs': {'model': model, 'clip': clip, 'lora_name': lname,
                                                              'strength_model': s, 'strength_clip': s}}
        model, clip = [f'l{i}', 0], [f'l{i}', 1]
    g['pos'] = {'class_type': 'CLIPTextEncode', 'inputs': {'clip': clip, 'text': eng['prefix'] + req.get('prompt', '')}}
    g['neg'] = {'class_type': 'CLIPTextEncode', 'inputs': {'clip': clip, 'text': (req.get('neg') or '') + ', ' + NEG}}
    denoise = 1.0
    if req.get('init'):
        g['li'] = {'class_type': 'LoadImage', 'inputs': {'image': upload_init(req['init'])}}
        g['sc'] = {'class_type': 'ImageScale', 'inputs': {'image': ['li', 0], 'upscale_method': 'nearest-exact',
                                                           'width': w, 'height': h, 'crop': 'center'}}
        g['lat'] = {'class_type': 'VAEEncode', 'inputs': {'pixels': ['sc', 0], 'vae': ['ck', 2]}}
        lat = ['lat', 0]
        if int(req.get('batch', 1)) > 1:
            g['rb'] = {'class_type': 'RepeatLatentBatch', 'inputs': {'samples': lat, 'amount': int(req['batch'])}}
            lat = ['rb', 0]
        denoise = float(req.get('denoise', 0.5))
    else:
        g['lat'] = {'class_type': 'EmptyLatentImage', 'inputs': {'width': w, 'height': h,
                                                                 'batch_size': max(1, min(4, int(req.get('batch', 1))))}}
        lat = ['lat', 0]
    g['ks'] = {'class_type': 'KSampler', 'inputs': {
        'model': model, 'positive': ['pos', 0], 'negative': ['neg', 0], 'latent_image': lat, 'seed': seed,
        'steps': steps, 'cfg': cfg, 'sampler_name': 'lcm' if lcm else 'euler_ancestral',
        'scheduler': 'sgm_uniform' if lcm else 'normal', 'denoise': denoise}}
    g['dec'] = {'class_type': 'VAEDecode', 'inputs': {'samples': ['ks', 0], 'vae': ['ck', 2]}}
    g['out'] = {'class_type': 'SaveImage', 'inputs': {'images': ['dec', 0], 'filename_prefix': 'kiln/k'}}
    return g, seed, steps


# --------------------------------------------------------------- cloud engine ---
def keys():
    env = {}
    try:
        for line in KEYS.read_text().splitlines():
            if '=' in line and not line.strip().startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip().replace('export ', '')] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return env


def post_json(url, body, headers, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', **headers}, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def cloud_spent():
    return float(settings().get('cloud_spent', 0))


CF_ENV = HOME / '.config/uwf-apps/cloudflare.env'
# Cloudflare Workers AI free tier: 10,000 neurons/day (resets 00:00 UTC). Measured 2026-10-10:
# flux-2-klein-4b ~110 neurons/image (~90/day), flux-2-klein-9b ~1,390 (~7/day) but it is the one that
# redraws a reference in a new pose and stays on-model. So: new things -> 4b, frames from a reference -> 9b.
CF_NEW = ('@cf/black-forest-labs/flux-2-klein-4b', '@cf/black-forest-labs/flux-2-klein-9b')
CF_REF = ('@cf/black-forest-labs/flux-2-klein-9b',)
CF_FREE = 10000
_or_info = {'t': 0, 'v': None}
_cf_info = {'t': 0, 'v': None}


def multipart(fields):
    bnd = uuid.uuid4().hex
    out = b''
    for k, v in fields.items():
        if isinstance(v, bytes):
            out += (f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"; filename="{k}.png"\r\n'
                    f'Content-Type: image/png\r\n\r\n').encode() + v + b'\r\n'
        else:
            out += f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    return out + f'--{bnd}--\r\n'.encode(), f'multipart/form-data; boundary={bnd}'


def cf_dims(aspect):
    a, b = (int(x) for x in aspect.split(':'))
    if a >= b:
        return 1024, max(256, round(1024 * b / a / 16) * 16)
    return max(256, round(1024 * a / b / 16) * 16), 1024


def cf_env():
    env = {}
    try:
        for line in CF_ENV.read_text().splitlines():
            if '=' in line:
                k, v = line.split('=', 1); env[k.strip()] = v.strip().strip('"')
    except Exception:
        pass
    return env


def cf_used():
    """Neurons used today (UTC) from Cloudflare's analytics, cached 2 min. None if unknown."""
    if time.time() - _cf_info['t'] < 120:
        return _cf_info['v']
    env, v = cf_env(), None
    if env.get('CF_ACCOUNT_ID'):
        q = ('{viewer{accounts(filter:{accountTag:"%s"}){aiInferenceAdaptiveGroups(limit:50,filter:{date_geq:"%s"})'
             '{sum{totalNeurons}}}}}' % (env['CF_ACCOUNT_ID'], time.strftime('%Y-%m-%d', time.gmtime())))
        try:
            d = post_json('https://api.cloudflare.com/client/v4/graphql', {'query': q}, {'Authorization': f'Bearer {env["CF_API_TOKEN"]}'}, timeout=8)
            v = sum(g['sum']['totalNeurons'] for g in d['data']['viewer']['accounts'][0]['aiInferenceAdaptiveGroups'])
        except Exception:
            v = None
    _cf_info.update(t=time.time(), v=v)
    return v


def cf_image(prompt, aspect, init_b64=None):
    env = cf_env()
    if not env.get('CF_ACCOUNT_ID') or not env.get('CF_API_TOKEN'):
        return None, 'cloudflare: no key'
    w, h = cf_dims(aspect)
    f = {'prompt': prompt, 'width': w, 'height': h}
    if init_b64:
        f['input_image_0'] = base64.b64decode(init_b64.split(',', 1)[-1])
    body, ctype = multipart(f)
    errs = []
    for model in (CF_REF if init_b64 else CF_NEW):
        try:
            req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{env["CF_ACCOUNT_ID"]}/ai/run/{model}',
                                         data=body, method='POST', headers={'Authorization': f'Bearer {env["CF_API_TOKEN"]}', 'Content-Type': ctype})
            with urllib.request.urlopen(req, timeout=150) as r:
                d = json.loads(r.read())
            img = (d.get('result') or {}).get('image')
            if img:
                _cf_info['t'] = 0
                return base64.b64decode(img), None
            errs.append(f'{model}: no image')
        except urllib.error.HTTPError as ex:
            msg = ex.read()[:300]
            errs.append(f'{model}: {ex.code} {msg[:160]!r}')
            if b'daily free allocation' in msg:
                break
        except Exception as ex:
            errs.append(f'{model}: {ex}')
    return None, '; '.join(errs)


def free_today():
    s = settings(); day = time.strftime('%Y-%m-%d', time.gmtime())
    return s.get('free_n', 0) if s.get('free_day') == day else 0


def note_free():
    s = settings(); day = time.strftime('%Y-%m-%d', time.gmtime())
    s['free_n'] = (s.get('free_n', 0) if s.get('free_day') == day else 0) + 1
    s['free_day'] = day; save_settings(s)


def openrouter_left():
    """Smallest of: OpenRouter key limit left, account credit left (cached 2 min). None if unknown."""
    if time.time() - _or_info['t'] < 120:
        return _or_info['v']
    ok = keys().get('OPENROUTER_API_KEY'); v = None
    if ok:
        try:
            hd = {'Authorization': f'Bearer {ok}'}
            kd = json.loads(urllib.request.urlopen(urllib.request.Request('https://openrouter.ai/api/v1/key', headers=hd), timeout=8).read())['data']
            cd = json.loads(urllib.request.urlopen(urllib.request.Request('https://openrouter.ai/api/v1/credits', headers=hd), timeout=8).read())['data']
            v = float(cd['total_credits']) - float(cd['total_usage'])
            if kd.get('limit_remaining') is not None:
                v = min(v, float(kd['limit_remaining']))
        except Exception:
            v = None
    _or_info.update(t=time.time(), v=v)
    return v


def cloud_image(prompt, aspect, init_b64=None):
    """Cloudflare FLUX.2 (free daily quota) first, then OpenRouter Gemini (paid, capped).
    The direct Gemini key has no image quota on the free tier (always 429), so it is not tried.
    Returns (png bytes, route, cost)."""
    data, err = cf_image(prompt, aspect, init_b64)
    if data:
        note_free()
        return data, 'free', 0.0
    errs = [err]
    env = keys()
    ok = env.get('OPENROUTER_API_KEY')
    if ok:
        if cloud_spent() >= CLOUD_CAP:
            raise RuntimeError(f'free quota used up for today and the paid budget (${CLOUD_CAP:.2f}) is spent; the local generator still works')
        content = [{'type': 'text', 'text': prompt}]
        if init_b64:
            content.append({'type': 'image_url', 'image_url': {'url': init_b64 if init_b64.startswith('data:') else 'data:image/png;base64,' + init_b64}})
        d = post_json('https://openrouter.ai/api/v1/chat/completions', {
            'model': 'google/gemini-2.5-flash-image', 'messages': [{'role': 'user', 'content': content}],
            'modalities': ['image', 'text'], 'image_config': {'aspect_ratio': aspect}, 'usage': {'include': True}},
            {'Authorization': f'Bearer {ok}'})
        cost = float((d.get('usage') or {}).get('cost') or 0.04)
        s = settings(); s['cloud_spent'] = round(cloud_spent() + cost, 4); save_settings(s)
        _or_info['t'] = 0
        for ch in d.get('choices', []):
            for im in ch.get('message', {}).get('images', []) or []:
                u = im.get('image_url', {}).get('url', '')
                if u.startswith('data:'):
                    return base64.b64decode(u.split(',', 1)[1]), 'paid', cost
        errs.append('openrouter: no image')
    raise RuntimeError('; '.join(e for e in errs if e) or 'no cloud keys configured')


def submit_cloud(req):
    pid = 'cloud-' + uuid.uuid4().hex[:12]
    n = max(1, min(4, int(req.get('batch', 1))))
    with LOCK:
        JOBS[pid] = {'state': 'running', 'step': 0, 'steps': n, 'images': [], 'err': None, 't0': time.time(), 'seed': 0}
    w, h = int(req.get('w', 512)), int(req.get('h', 512))
    r = w / h
    aspect = min(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '3:2', '2:3'],
                 key=lambda a: abs(int(a.split(':')[0]) / int(a.split(':')[1]) - r))
    prompt = req.get('prompt', '')
    hint = req.get('engine_hint')
    if hint == 'scene':
        prompt = f'{prompt}. 2D side-scrolling video game background, wide, no characters, no text, no UI.'
    elif hint == 'layer':          # one depth layer of a background, on a colour Kiln removes (Forge → Background)
        prompt = f'{prompt}. One layer of a 2D side-scrolling video game background: scenery only, crisp pixel art, flat colours, no characters, no text, no UI.'
    elif hint == 'texture':        # a surface for tiles (Forge → Tileset)
        prompt = (f'{prompt}. Seamless pixel art texture for a 2D game tileset: the surface fills the whole image edge to edge, '
                  'crisp square pixels, flat colours, nothing standing on it, no characters, no text, no frame.')
    else:
        px = int(req.get('px') or 0)
        grid = f'about {px} art pixels tall, ' if 16 <= px <= 256 else ''
        prompt = (f'{prompt}. Pixel art game sprite: exactly one figure, the whole thing in frame and centred, '
                  f'drawn on a coarse grid of big square pixels ({grid}every pixel a crisp solid square), '
                  'hard edges, flat colours, no anti-aliasing, no gradients, no soft glow, no ground shadow. '
                  'Pure flat white #FFFFFF background. No text.')

    def work():
        CLOUD_DIR.mkdir(parents=True, exist_ok=True)
        for i in range(n):
            try:
                data, route, cost = cloud_image(prompt, aspect, req.get('init'))
                fn = f'{pid}-{i}.png'
                (CLOUD_DIR / fn).write_bytes(data)
                with LOCK:
                    JOBS[pid]['images'].append('/api/cloudimg?f=' + fn)
                    JOBS[pid]['step'] = i + 1
            except Exception as ex:
                with LOCK:
                    JOBS[pid].update(state='error', err=str(ex)[:300])
                return
        with LOCK:
            JOBS[pid]['state'] = 'done'
    threading.Thread(target=work, daemon=True).start()
    return pid, 0


FAST = os.environ.get('KILN_FAST', '127.0.0.1:8511')


def submit_fast(req):
    """The "Fast" engine (fast/serve.py): the pixel model kept loaded, so no per-job model load."""
    pid = 'fast-' + uuid.uuid4().hex[:12]
    n = max(1, min(4, int(req.get('batch', 1))))
    steps = int(req.get('steps') or 4)
    with LOCK:
        JOBS[pid] = {'state': 'queued', 'step': 0, 'steps': steps * n, 'images': [], 'err': None, 't0': time.time(), 'seed': 0}
    prefix = '16bitscene, ' if req.get('engine_hint') in ('scene', 'layer', 'texture') else 'pixelsprite, '
    body = {'prompt': prefix + req.get('prompt', ''), 'neg': ((req.get('neg') or '') + ', ' + NEG).strip(', '), 'w': req.get('w', 384), 'h': req.get('h', 384),
            'steps': steps, 'seed': int(req.get('seed', -1)), 'batch': n, 'init': req.get('init'), 'denoise': req.get('denoise', 0.5)}

    def poll():
        while JOBS.get(pid, {}).get('state') in ('queued', 'running'):
            try:
                p = json.loads(urllib.request.urlopen(f'http://{FAST}/progress', timeout=3).read())
                with LOCK:
                    if JOBS[pid]['state'] in ('queued', 'running') and p['busy']:
                        JOBS[pid].update(state='running', step=min(p['step'], steps * n))
            except Exception:
                pass
            time.sleep(1)

    def work():
        CLOUD_DIR.mkdir(parents=True, exist_ok=True)
        try:
            d = post_json(f'http://{FAST}/gen', body, {}, timeout=1800)
            urls = []
            for i, b in enumerate(d['images']):
                fn = f'{pid}-{i}.png'
                (CLOUD_DIR / fn).write_bytes(base64.b64decode(b))
                urls.append('/api/cloudimg?f=' + fn)
            with LOCK:
                JOBS[pid].update(state='done', images=urls, seed=d.get('seed', 0), step=steps * n)
        except Exception as ex:
            msg = str(ex)
            if 'Connection refused' in msg:
                msg = 'the Fast engine is not running (systemctl --user start kiln-fast)'
            elif hasattr(ex, 'read'):
                try: msg = json.loads(ex.read()).get('err', msg)
                except Exception: pass
            with LOCK:
                JOBS[pid].update(state='error', err=msg[:300])
    threading.Thread(target=work, daemon=True).start()
    threading.Thread(target=poll, daemon=True).start()
    return pid, -1


def submit(req):
    if req.get('engine') == 'cloud':
        return submit_cloud(req)
    if req.get('engine') == 'fast':
        return submit_fast(req)
    g, seed, steps = build(req)
    r = json.loads(http('POST', '/prompt', json.dumps({'prompt': g, 'client_id': CLIENT}).encode(),
                        {'Content-Type': 'application/json'}))
    pid = r['prompt_id']
    with LOCK:
        JOBS[pid] = {'state': 'queued', 'step': 0, 'steps': steps, 'images': [], 'err': None,
                     't0': time.time(), 'seed': seed}
    return pid, seed


def job(pid):
    with LOCK:
        j = dict(JOBS.get(pid) or {})
    if not j:
        return None
    if j['state'] not in ('done', 'error') and not pid.startswith(('cloud-', 'fast-')):
        try:
            h = comfy_json(f'/history/{pid}').get(pid)
        except Exception:
            h = None
        if h:
            st = h.get('status', {})
            if st.get('status_str') == 'error':
                msg = next((m[1].get('exception_message') for m in st.get('messages', [])
                            if m[0] == 'execution_error'), 'generation failed')
                j.update(state='error', err=msg)
            else:
                imgs = []
                for out in h.get('outputs', {}).values():
                    for im in out.get('images', []):
                        imgs.append('/api/view?' + urllib.parse.urlencode(
                            {'filename': im['filename'], 'subfolder': im['subfolder'], 'type': im['type']}))
                if imgs:
                    j.update(state='done', images=imgs)
            with LOCK:
                JOBS[pid].update(state=j['state'], images=j['images'], err=j['err'])
        elif j['state'] == 'queued':
            try:
                q = comfy_json('/queue')
                ahead = [x[1] for x in q.get('queue_pending', [])] + [x[1] for x in q.get('queue_running', [])]
                j['ahead'] = ahead.index(pid) if pid in ahead else 0
            except Exception:
                pass
    j['elapsed'] = round(time.time() - j['t0'], 1)
    return j


_build = [0, 0]


def build_id():
    """Newest change time of Kiln's own web files: an open tab compares it to see that Kiln was updated."""
    if time.time() - _build[1] > 5:
        _build[:] = [int(max(f.stat().st_mtime for f in STATIC.rglob('*') if f.is_file())), time.time()]
    return _build[0]


def status():
    s = {'comfy': False, 'engines': {}, 'missing': [], 'build': build_id()}
    try:
        info = comfy_json('/object_info/CheckpointLoaderSimple')
        ckpts = set(info['CheckpointLoaderSimple']['input']['required']['ckpt_name'][0])
        loras = set(comfy_json('/object_info/LoraLoader')['LoraLoader']['input']['required']['lora_name'][0])
        s['comfy'] = True
        for k, e in ENGINES.items():
            miss = [e['ckpt']] if e['ckpt'] not in ckpts else []
            miss += [l for l, _ in e['loras'] if l not in loras]
            s['engines'][k] = {'label': e['label'], 'ok': not miss, 'missing': miss}
        q = comfy_json('/queue')
        s['queue'] = len(q.get('queue_pending', [])) + len(q.get('queue_running', []))
    except Exception as ex:
        s['err'] = str(ex)
    try:
        f = json.loads(urllib.request.urlopen(f'http://{FAST}/health', timeout=2).read())
        s['fast'] = {'ok': bool(f.get('ok')), 'loaded': bool(f.get('loaded'))}
    except Exception:
        s['fast'] = {'ok': False}
    k = keys()
    cap_left = max(0, CLOUD_CAP - cloud_spent()); acct = openrouter_left()
    used = cf_used() if CF_ENV.exists() else None
    s['cloud'] = {'ok': CF_ENV.exists() or bool(k.get('OPENROUTER_API_KEY')), 'free': CF_ENV.exists(), 'free_today': free_today(),
                  'free_left': None if used is None else max(0, round(1 - used / CF_FREE, 3)),
                  'cap': CLOUD_CAP, 'spent': round(cloud_spent(), 2), 'account': None if acct is None else round(acct, 2),
                  'left': round(cap_left if acct is None else min(cap_left, acct), 2)}
    return s


# ------------------------------------------------- Godot plugin (godot/addons/kiln) ---
PLUGIN = ROOT / 'godot' / 'addons' / 'kiln'


def plugin_zip():
    import io, zipfile
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in PLUGIN.iterdir():
            if f.is_file():
                z.write(f, f'addons/kiln/{f.name}')
    return b.getvalue()


def plugin_install(path):
    """Copy the Kiln add-on into the Godot project that contains `path` and switch it on in project.godot."""
    root = godot_root(path)
    if not root:
        raise ValueError('that folder is not inside a Godot project (no project.godot above it)')
    dst = Path(root) / 'addons' / 'kiln'
    dst.mkdir(parents=True, exist_ok=True)
    for f in PLUGIN.iterdir():
        if f.is_file():
            (dst / f.name).write_bytes(f.read_bytes())
    pg = Path(root) / 'project.godot'
    text, entry = pg.read_text(), 'res://addons/kiln/plugin.cfg'
    if entry not in text:
        m = re.search(r'(\[editor_plugins\][^\[]*?enabled=PackedStringArray\()([^)]*)\)', text, re.S)
        if m:
            inner = m.group(2).strip()
            text = text[:m.start()] + m.group(1) + (inner + ', ' if inner else '') + f'"{entry}")' + text[m.end():]
        else:
            text = text.rstrip() + f'\n\n[editor_plugins]\n\nenabled=PackedStringArray("{entry}")\n'
        pg.write_text(text)
    return {'project': root, 'addon': str(dst)}


# ------------------------------------------------- desk: which home apps are running ---
DESK_PORTS = (8440, 8450, 8460, 8461, 8470, 8480, 8490, 8500, 8510, 8790, 8430)


def apps_up():
    out = {}
    for p in DESK_PORTS:
        try:
            with socket.create_connection(('127.0.0.1', p), timeout=.3):
                out[p] = True
        except OSError:
            out[p] = False
    return out


# ------------------------------------------------- quick switcher index ---
_idx = {'t': 0, 'root': None, 'v': []}


def file_index():
    """Every file and folder in the asset folder (up to 4000; .trash skipped), cached 10 s, for Ctrl+K."""
    root = Path(settings().get('root', ''))
    if time.time() - _idx['t'] < 10 and _idx['root'] == root:
        return _idx['v']
    out = []
    if root.is_dir():
        for dp, dns, fns in os.walk(root):
            dns[:] = sorted(d for d in dns if not d.startswith('.'))
            for d in dns:
                out.append({'name': d, 'path': os.path.join(dp, d), 'dir': True})
            for f in sorted(fns):
                if not f.startswith('.'):
                    out.append({'name': f, 'path': os.path.join(dp, f), 'dir': False})
            if len(out) > 4000:
                break
    _idx.update(t=time.time(), root=root, v=out[:4000])
    return _idx['v']


# ------------------------------------------------- downloads inbox ---
INBOX = [HOME / 'Downloads']


def inbox(since):
    """Images saved to ~/Downloads (or <asset folder>/concepts/<session>/) after `since` (unix time), newest first: pick up anything the user saves
    from a website (no scraping: they generate and save, Kiln notices)."""
    out = []
    dirs = list(INBOX)
    croot = Path(settings().get('root', '')) / 'concepts'     # Kiln Studio saves concept images here, per session
    if croot.is_dir():
        dirs += [d for d in croot.iterdir() if d.is_dir()]
    for d in dirs:
        try:
            for f in d.iterdir():
                if f.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp', '.gif') and f.is_file():
                    m = f.stat().st_mtime
                    if m > since:
                        out.append({'name': f.name, 't': m, 'url': '/api/fs/raw?path=' + urllib.parse.quote(str(f)) + f'&t={int(m)}'})
        except Exception:
            pass
    return sorted(out, key=lambda x: -x['t'])[:12]


# ----------------------------------------------------------------- filesystem ---
def safe_dest(p):
    """Absolute export dir must live under the home dir; relative ones go in library/."""
    p = Path(os.path.expanduser(p))
    if not p.is_absolute():
        p = Path(settings()['root']) / p
    p = p.resolve()
    if not (str(p).startswith(str(HOME) + os.sep)):
        raise ValueError('export folder must be inside your home folder')
    return p


def write_files(dest, files):
    d = safe_dest(dest)
    d.mkdir(parents=True, exist_ok=True)
    out = []
    for f in files:
        name = f['name']
        if '..' in Path(name).parts or name.startswith('/'):
            raise ValueError('bad file name ' + name)
        fp = d / name
        fp.parent.mkdir(parents=True, exist_ok=True)
        if 'b64' in f:
            fp.write_bytes(base64.b64decode(f['b64'].split(',', 1)[-1]))
        else:
            fp.write_text(f.get('text', ''))
        out.append(str(fp))
    return str(d), out


# ---------------------------------------------------------------- file manager ---
# Standard engine-ready layout inside an asset root. `role` tells the UI what a folder is for.
LAYOUT = {
    'sprites': 'Characters and objects: one folder per actor, a strip PNG per animation + manifest.json',
    'backgrounds': 'Parallax scenes: one folder per scene, a PNG per layer + scene.json (+ Godot .tscn)',
    'tiles': 'Tilesets: tileset PNG + tileset.json',
    'levels': 'Levels: one folder per level: tileset PNG, Godot TileSet .tres (solid tiles collide), .tscn with a TileMapLayer, level.json',
    'hud': 'Bars, gauges, panels, icons: PNG parts + hud.json (9-slice margins, fill rects)',
    'fonts': 'Bitmap fonts: atlas PNG + BMFont .fnt (Godot, Unity, LÖVE read it)',
    'palettes': 'Palettes as .hex (one colour per line) + swatch PNG',
    'kiln': 'Kiln source projects (editable). Engines can ignore this folder',
    '_kiln': 'Kiln runtime: the small commented scripts every game uses (actor/, brains/, level/, ui/; see its README)',
}
SETTINGS = LIB / 'settings.json'


def settings():
    try:
        s = json.loads(SETTINGS.read_text())
    except Exception:
        s = {}
    s.setdefault('root', str(LIB / 'games' / 'untitled'))
    s.setdefault('bookmarks', [])
    return s


def save_settings(s):
    SETTINGS.write_text(json.dumps(s, indent=1))


def in_home(p):
    p = Path(os.path.expanduser(str(p))).resolve()
    if not (str(p) == str(HOME) or str(p).startswith(str(HOME) + os.sep)):
        raise ValueError('only folders inside your home folder')
    return p


def scaffold(root):
    r = in_home(root)
    for k in LAYOUT:
        (r / k).mkdir(parents=True, exist_ok=True)
    readme = r / 'ASSETS.md'
    if not readme.exists():
        readme.write_text('# Asset folder (made by Kiln)\n\n' + '\n'.join(f'- `{k}/` {v}' for k, v in LAYOUT.items()) + '\n')
    return str(r)


def describe(p, root):
    """What a folder is, for the badges in the file manager."""
    rel = p.relative_to(root).parts if p != root else ()
    if not rel:
        return {'role': 'root'}
    if len(rel) == 1 and rel[0] in LAYOUT:
        return {'role': rel[0], 'help': LAYOUT[rel[0]]}
    if len(rel) == 2 and rel[0] == 'sprites':
        man = p / 'manifest.json'
        if man.exists():
            try:
                m = json.loads(man.read_text())
                return {'role': 'actor', 'ok': True, 'info': f"{len(m.get('anims', {}))} anims · {m.get('w')}×{m.get('h')}"}
            except Exception:
                return {'role': 'actor', 'ok': False, 'info': 'manifest.json unreadable'}
        return {'role': 'actor', 'ok': False, 'info': 'no manifest.json yet'}
    if len(rel) == 2 and rel[0] == 'backgrounds':
        ok = (p / 'scene.json').exists()
        return {'role': 'scene', 'ok': ok, 'info': 'scene.json' if ok else 'no scene.json yet'}
    return {}


def fs_list(path):
    s = settings()
    root = in_home(s['root'])
    p = in_home(path or root)
    if not p.exists() and str(p).startswith(str(root)):
        # a folder this asset folder does not have yet (a fresh one has no concepts/, menus/…): empty, not an error
        return {'path': str(p), 'root': str(root), 'parent': str(p.parent), 'items': [], 'here': {}}
    if not p.is_dir():
        raise ValueError('not a folder')
    items = []
    for c in sorted(p.iterdir(), key=lambda c: (not c.is_dir(), c.name.lower())):
        if c.name.startswith('.') or c.suffix == '.import':
            continue
        st = c.stat()
        it = {'name': c.name, 'path': str(c), 'dir': c.is_dir(), 'size': st.st_size, 'mtime': st.st_mtime}
        if c.is_dir():
            try:
                it['count'] = sum(1 for x in c.iterdir() if not x.name.startswith('.') and x.suffix != '.import')
            except Exception:
                it['count'] = 0
            if str(c).startswith(str(root)):
                it.update(describe(c, root))
        items.append(it)
    info = describe(p, root) if str(p).startswith(str(root)) else {}
    return {'path': str(p), 'root': str(root), 'parent': str(p.parent) if p != HOME else None, 'items': items, 'here': info}


def fs_op(b):
    op = b.get('op')
    if op == 'mkdir':
        in_home(b['path']).mkdir(parents=True, exist_ok=True)
    elif op == 'rename':
        src, dst = in_home(b['path']), in_home(b['to'])
        if dst.exists():
            raise ValueError(f'{dst.name} already exists')
        src.rename(dst)
    elif op == 'trash':
        # never hard-delete: move into <root>/.trash/<timestamp>-name
        src = in_home(b['path'])
        t = in_home(settings()['root']) / '.trash'
        t.mkdir(parents=True, exist_ok=True)
        src.rename(t / f"{time.strftime('%Y%m%d-%H%M%S')}-{src.name}")
    elif op == 'root':
        s = settings()
        s['root'] = scaffold(b['path']) if b.get('scaffold') else str(in_home(b['path']))
        save_settings(s)
    elif op == 'scaffold':
        scaffold(b.get('path') or settings()['root'])
    elif op == 'bookmark':
        s = settings()
        pth = str(in_home(b['path']))
        s['bookmarks'] = [x for x in s['bookmarks'] if x['path'] != pth]
        if not b.get('remove'):
            s['bookmarks'].append({'path': pth, 'name': b.get('name') or Path(pth).name})
        save_settings(s)
    else:
        raise ValueError('unknown op')
    return {'ok': True}


def godot_root(path):
    """The Godot project folder (has project.godot) containing `path`, if any."""
    p = in_home(path)
    for d in [p, *p.parents]:
        if (d / 'project.godot').exists():
            return str(d)
        if d == HOME:
            break
    return None


def fs_raw(path):
    p = in_home(path)
    return p.read_bytes(), TYPES.get(p.suffix.lower(), 'application/octet-stream')


def proj_dir():
    return in_home(settings()['root']) / 'kiln'


_meta = {}   # path -> (mtime, meta): project files can be ~90 MB (scenes), so read each one once per change


def list_projects():
    d = proj_dir()
    d.mkdir(parents=True, exist_ok=True)
    res = []
    for f in sorted(d.glob('*.json'), key=lambda f: -f.stat().st_mtime):
        m = f.stat().st_mtime
        if _meta.get(str(f), (None,))[0] == m:
            meta = _meta[str(f)][1]
        else:
            try:
                d = json.loads(f.read_text())
                meta = dict(d.get('meta', {}))
                # which scene/level/actor this file belongs to, so the editor never saves a different one over it
                body = next((d[k] for k in ('scene', 'level', 'actor', 'hud') if isinstance(d.get(k), dict)), {})
                meta.setdefault('sid', body.get('id'))
            except Exception:
                meta = {}
            _meta[str(f)] = (m, meta)
        res.append({'id': f.stem, 'kind': meta.get('kind', '?'), 'name': meta.get('name', f.stem), 'sid': meta.get('sid'),
                    'thumb': meta.get('thumb'), 'mtime': f.stat().st_mtime})
    return res


# ---------------------------------------------------------------------- http ---
TYPES = {'.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain', '.md': 'text/plain', '.fnt': 'text/plain', '.hex': 'text/plain', '.tscn': 'text/plain', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
         '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype='application/json'):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        try:
            if u.path == '/api/status':
                return self.send(200, status())
            if u.path == '/api/job':
                j = job(q.get('id'))
                return self.send(200 if j else 404, j or {'err': 'unknown job'})
            if u.path == '/api/view':
                raw = http('GET', '/view?' + u.query)
                return self.send(200, raw, 'image/png')
            if u.path == '/api/fs':
                return self.send(200, fs_list(q.get('path')))
            if u.path == '/api/fs/raw':
                if not in_home(q['path']).is_file():
                    return self.send(404, {'err': 'no such file'})
                raw, ct = fs_raw(q['path'])
                return self.send(200, raw, ct)
            if u.path == '/api/scripts':
                root = q.get('root') or settings()['root']
                return self.send(200, {'root': str(in_home(root)), 'scripts': list_scripts(in_home(root)), 'godot': bool(GODOT)})
            if u.path == '/api/tidy':
                r = in_home(q.get('root') or settings()['root'])
                return self.send(200, {'steps': tidy.plan(r)})
            if u.path == '/api/release/status':
                return self.send(200, {**release.STATE, 'targets': release.targets(), 'releases': release.releases()})
            if u.path == '/api/release/file':
                data = release.file(q.get('f', ''))
                return self.send(200, data, 'application/zip') if data else self.send(404, {'err': 'no such release'})
            if u.path == '/api/play/status':
                return self.send(200, {**play.STATE, 'built': play.built(), 'secure': play.secure_url(PORT)})
            if u.path == '/play' or u.path.startswith('/play/'):
                got = play.serve(u.path[6:].lstrip('/'))
                return self.send(200, *got) if got else self.send(404, {'err': 'no build yet: press Play in Kiln'})
            if u.path == '/api/doctor':
                r = in_home(q.get('root') or settings()['root'])
                return self.send(200, doctor(r, godot_root(str(r))))
            if u.path == '/api/history':
                return self.send(200, history(proj_dir(), q.get('id', '')))
            if u.path == '/api/godot':
                return self.send(200, {'root': godot_root(q.get('path') or settings()['root'])})
            if u.path == '/api/settings':
                s = settings()
                s['layout'] = LAYOUT
                s['home'] = str(HOME)
                s['games'] = str(LIB / 'games')      # where new asset folders go (the demo game)
                return self.send(200, s)
            if u.path == '/godot-plugin.zip':
                return self.send(200, plugin_zip(), 'application/zip')
            if u.path == '/api/apps':
                return self.send(200, {'up': apps_up()})
            if u.path == '/api/index':
                return self.send(200, {'items': file_index()})
            if u.path == '/api/inbox':
                return self.send(200, {'items': inbox(float(q.get('since') or 0))})
            if u.path == '/api/cloudimg':
                f = CLOUD_DIR / Path(q.get('f', '')).name
                return self.send(200, f.read_bytes(), 'image/png') if f.exists() else self.send(404, {'err': 'gone'})
            if u.path == '/api/projects':
                return self.send(200, list_projects())
            if u.path == '/api/project':
                f = proj_dir() / (re.sub(r'[^\w.-]', '_', q.get('id', '')) + '.json')
                return self.send(200, f.read_bytes()) if f.exists() else self.send(404, {'err': 'not found'})
            path = 'index.html' if u.path == '/' else 'desk.html' if u.path in ('/desk', '/desk/') else 'help.html' if u.path in ('/help', '/help/') else u.path.lstrip('/')
            fp = (STATIC / path).resolve()
            if str(fp).startswith(str(STATIC)) and fp.is_file():
                return self.send(200, fp.read_bytes(), TYPES.get(fp.suffix, 'application/octet-stream'))
            self.send(404, {'err': 'not found'})
        except Exception as ex:
            self.send(500, {'err': str(ex)})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        try:
            b = self.body()
            if u.path == '/api/gen':
                pid, seed = submit(b)
                return self.send(200, {'id': pid, 'seed': seed})
            if u.path == '/api/cancel':
                http('POST', '/queue', json.dumps({'delete': [b.get('id')]}).encode(), {'Content-Type': 'application/json'})
                with LOCK:
                    running = JOBS.get(b.get('id'), {}).get('state') == 'running'
                if running:
                    http('POST', '/interrupt', b'{}', {'Content-Type': 'application/json'})
                with LOCK:
                    if b.get('id') in JOBS:
                        JOBS[b['id']].update(state='error', err='cancelled')
                return self.send(200, {'ok': True})
            if u.path == '/api/project':
                pid = re.sub(r'[^\w.-]', '_', b['id'])
                d = proj_dir()
                d.mkdir(parents=True, exist_ok=True)
                text = json.dumps(b['data'])
                snapshot(d / f'{pid}.json', text)
                (d / f'{pid}.json').write_text(text)
                return self.send(200, {'ok': True})
            if u.path == '/api/tidy':
                r = in_home(b.get('root') or settings()['root'])
                g = godot_root(str(r))
                base = ('res://' + (str(r.relative_to(g)) + '/' if str(r) != g else '')) if g else ''
                return self.send(200, tidy.apply(r, base))
            if u.path == '/api/release':
                if release.STATE['running']:
                    return self.send(409, {'err': 'an export is already running'})
                threading.Thread(target=release.release, args=(in_home(b.get('root') or settings()['root']), b.get('files', {}), b.get('opts', {}), b.get('targets', [])), daemon=True).start()
                return self.send(200, {'ok': True})
            if u.path == '/api/play/build':
                if play.STATE['running']:
                    return self.send(409, {'err': 'a build is already running'})
                threading.Thread(target=play.build, args=(in_home(b.get('root') or settings()['root']), b.get('files', {}), b.get('opts', {})), daemon=True).start()
                return self.send(200, {'ok': True})
            if u.path == '/api/history/restore':
                return self.send(200, restore_copy(proj_dir(), b['id'], b['stamp']))
            if u.path == '/api/godot/check':
                r = in_home(b.get('root') or settings()['root'])
                return self.send(200, check_script(godot_root(str(r)) or r, b.get('path', ''), b.get('text', '')))
            if u.path == '/api/godot/install':
                return self.send(200, plugin_install(b.get('path') or settings().get('root')))
            if u.path == '/api/project/delete':
                f = proj_dir() / (re.sub(r'[^\w.-]', '_', b['id']) + '.json')
                if f.exists():
                    f.unlink()
                return self.send(200, {'ok': True})
            if u.path == '/api/fs':
                return self.send(200, fs_op(b))
            if u.path == '/api/export':
                d, files = write_files(b['dest'], b['files'])
                return self.send(200, {'dir': d, 'files': files})
            self.send(404, {'err': 'not found'})
        except Exception as ex:
            self.send(500, {'err': str(ex)})


if __name__ == '__main__':
    LIB.mkdir(exist_ok=True)
    scaffold(settings()['root'])
    threading.Thread(target=ws_listen, daemon=True).start()
    threading.Thread(target=list_projects, daemon=True).start()   # warm the project list cache (big scene files)
    print(f'Kiln on http://{HOST}:{PORT}  (ComfyUI {COMFY})', flush=True)
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
