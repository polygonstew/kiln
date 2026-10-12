"""Services & keys: a new user connects the picture and writing services Forge uses, from Kiln (Edit → Services & keys…).
Keys are saved in ~/.config/kiln/keys.env (only the user can read it) and never sent back to the page: status() gives
"set" and the last 4 characters. test() makes one free call to check a key works."""
import os, urllib.request
from cloud import OWN, cf_env, keys, read_env

# the keys Kiln knows, by service
SERVICES = {
    'cloudflare': ['CF_ACCOUNT_ID', 'CF_API_TOKEN'],     # free daily pictures
    'openrouter': ['OPENROUTER_API_KEY'],                # paid pictures (backup) and writing
    'gemini': ['GEMINI_API_KEY'],                        # free writing help and Gloop's answers
    'groq': ['GROQ_API_KEY'],                            # free alternative for Gloop's answers
}


def status():
    k = {**keys(), **cf_env()}
    return {s: {n: ('…' + k[n][-4:]) if k.get(n) else '' for n in names} for s, names in SERVICES.items()}


def save(values):
    allowed = {n for names in SERVICES.values() for n in names}
    env = read_env(OWN)
    for n, v in values.items():
        if n in allowed and isinstance(v, str):
            v = v.strip()
            if v:
                env[n] = v
            else:
                env.pop(n, None)
    OWN.parent.mkdir(parents=True, exist_ok=True)
    OWN.write_text(''.join(f'{n}={v}\n' for n, v in env.items()))
    os.chmod(OWN, 0o600)
    return status()


def test(service):
    k = {**keys(), **cf_env()}
    try:
        if service == 'cloudflare':
            req = urllib.request.Request('https://api.cloudflare.com/client/v4/user/tokens/verify', headers={'Authorization': 'Bearer ' + k.get('CF_API_TOKEN', '')})
        elif service == 'openrouter':
            req = urllib.request.Request('https://openrouter.ai/api/v1/key', headers={'Authorization': 'Bearer ' + k.get('OPENROUTER_API_KEY', '')})
        elif service == 'gemini':
            req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models?key=' + k.get('GEMINI_API_KEY', ''))
        elif service == 'groq':
            req = urllib.request.Request('https://api.groq.com/openai/v1/models', headers={'Authorization': 'Bearer ' + k.get('GROQ_API_KEY', ''), 'User-Agent': 'kiln'})
        else:
            return {'ok': False, 'why': 'unknown service'}
        urllib.request.urlopen(req, timeout=15).read()
        return {'ok': True}
    except Exception as e:
        return {'ok': False, 'why': str(e)[:160]}
