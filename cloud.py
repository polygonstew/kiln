"""Kiln's cloud image engine: Cloudflare Workers AI FLUX.2 on its free daily quota first, then OpenRouter (paid, capped by
KILN_CLOUD_CAP, the spend kept in the settings file). Keys come from ~/.config/uwf-apps (keys.env, cloudflare.env).
cloud_image(prompt, aspect, init) → (png bytes, 'free' | 'paid', cost); keys() is shared with the writing help."""
import base64, json, os, time, urllib.request, uuid
from pathlib import Path
from store import settings, save_settings

HOME = Path.home()
CLOUD_CAP = float(os.environ.get('KILN_CLOUD_CAP', '2.00'))   # dollars of paid cloud images, ever
KEYS = HOME / '.config/uwf-apps/keys.env'
OWN = HOME / '.config/kiln/keys.env'       # Kiln's own keys, written by Services & keys (setup.py); win over the others


def read_env(path):
    env = {}
    try:
        for line in Path(path).read_text().splitlines():
            if '=' in line and not line.strip().startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip().replace('export ', '')] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return env


def keys():
    return {**read_env(KEYS), **read_env(OWN)}


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
    own = read_env(OWN)
    return {**read_env(CF_ENV), **{k: own[k] for k in ('CF_ACCOUNT_ID', 'CF_API_TOKEN') if own.get(k)}}


def has_cf():
    e = cf_env()
    return bool(e.get('CF_ACCOUNT_ID') and e.get('CF_API_TOKEN'))


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
