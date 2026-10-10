#!/usr/bin/env python3
"""Kiln: 2D game asset workbench. Serves the UI, drives ComfyUI, keeps the library.

Stdlib only. ComfyUI is expected at COMFY (default 127.0.0.1:8188).
"""
import base64, json, os, random, re, socket, struct, threading, time, urllib.request, urllib.parse, uuid
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

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
    if req.get('engine_hint') == 'scene':
        prompt = f'{prompt}. 2D side-scrolling video game background, wide, no characters, no text, no UI.'
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


def submit(req):
    if req.get('engine') == 'cloud':
        return submit_cloud(req)
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
    if j['state'] not in ('done', 'error') and not pid.startswith('cloud-'):
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


def status():
    s = {'comfy': False, 'engines': {}, 'missing': []}
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
    k = keys()
    cap_left = max(0, CLOUD_CAP - cloud_spent()); acct = openrouter_left()
    used = cf_used() if CF_ENV.exists() else None
    s['cloud'] = {'ok': CF_ENV.exists() or bool(k.get('OPENROUTER_API_KEY')), 'free': CF_ENV.exists(), 'free_today': free_today(),
                  'free_left': None if used is None else max(0, round(1 - used / CF_FREE, 3)),
                  'cap': CLOUD_CAP, 'spent': round(cloud_spent(), 2), 'account': None if acct is None else round(acct, 2),
                  'left': round(cap_left if acct is None else min(cap_left, acct), 2)}
    return s


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
    'hud': 'Bars, gauges, panels, icons: PNG parts + hud.json (9-slice margins, fill rects)',
    'fonts': 'Bitmap fonts: atlas PNG + BMFont .fnt (Godot, Unity, LÖVE read it)',
    'palettes': 'Palettes as .hex (one colour per line) + swatch PNG',
    'kiln': 'Kiln source projects (editable). Engines can ignore this folder',
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


def list_projects():
    d = proj_dir()
    d.mkdir(parents=True, exist_ok=True)
    res = []
    for f in sorted(d.glob('*.json'), key=lambda f: -f.stat().st_mtime):
        try:
            meta = json.loads(f.read_text()).get('meta', {})
        except Exception:
            meta = {}
        res.append({'id': f.stem, 'kind': meta.get('kind', '?'), 'name': meta.get('name', f.stem),
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
                raw, ct = fs_raw(q['path'])
                return self.send(200, raw, ct)
            if u.path == '/api/godot':
                return self.send(200, {'root': godot_root(q.get('path') or settings()['root'])})
            if u.path == '/api/settings':
                s = settings()
                s['layout'] = LAYOUT
                s['home'] = str(HOME)
                return self.send(200, s)
            if u.path == '/api/cloudimg':
                f = CLOUD_DIR / Path(q.get('f', '')).name
                return self.send(200, f.read_bytes(), 'image/png') if f.exists() else self.send(404, {'err': 'gone'})
            if u.path == '/api/projects':
                return self.send(200, list_projects())
            if u.path == '/api/project':
                f = proj_dir() / (re.sub(r'[^\w.-]', '_', q.get('id', '')) + '.json')
                return self.send(200, f.read_bytes()) if f.exists() else self.send(404, {'err': 'not found'})
            path = 'index.html' if u.path == '/' else u.path.lstrip('/')
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
                (d / f'{pid}.json').write_text(json.dumps(b['data']))
                return self.send(200, {'ok': True})
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
    print(f'Kiln on http://{HOST}:{PORT}  (ComfyUI {COMFY})', flush=True)
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
