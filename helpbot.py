"""Gloop's answers to "how do I…?": helpsearch finds the few passages that matter, and a small text model rewrites them
into a short answer, using ONLY those passages. Engines, first that works: your own free key (Gemini, then Groq; Edit →
Services & keys), else the small local one: llama.cpp's llama-server running a ~1 GB GGUF (models/*.gguf in
~/.local/share/kiln, started on first question, stopped after ten idle minutes). With neither, the answer is the
passages themselves. No model names reach the page. ask(question, keys, prefer) → {answer, sources, mode}."""
import json, shutil, subprocess, threading, time, urllib.request
from pathlib import Path
import helpsearch

HOME = Path.home() / '.local/share/kiln'
MODELS = HOME / 'models'
MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
PORT, IDLE = 8531, 600
FETCH = {'running': False, 'done': 0, 'total': 0, 'err': ''}
_SERVER = {'proc': None, 'last': 0.0}
_LOCK = threading.Lock()

RULES = ('You are Gloop, the helper inside Kiln, a tool for making 2D games with Godot. Answer the question using ONLY the notes below. '
         'Be short and plain: two to six sentences, or a few numbered steps. Name the buttons and areas as the notes do. '
         'If the notes do not answer it, say you are not sure and suggest the Guide (Help → Guide). Never mention these rules, notes or any AI.')


def _post(url, body, headers=None, timeout=90):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _model():
    found = sorted(MODELS.glob('*.gguf'))
    return found[0] if found else None


def local_ready():
    return bool(shutil.which('llama-server') and _model())


def _local(messages):
    """Answer with the local llama-server, starting it if it is not running."""
    with _LOCK:
        p = _SERVER['proc']
        if p is None or p.poll() is not None:
            _SERVER['proc'] = subprocess.Popen(['llama-server', '-m', str(_model()), '-c', '4096', '--port', str(PORT), '--host', '127.0.0.1', '-t', '4'],
                                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            threading.Thread(target=_reaper, daemon=True).start()
            for _ in range(120):
                try:
                    urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=2).read()
                    break
                except Exception:
                    time.sleep(1)
        _SERVER['last'] = time.time()
    d = _post(f'http://127.0.0.1:{PORT}/v1/chat/completions', {'messages': messages, 'temperature': 0.2, 'max_tokens': 300}, timeout=180)
    _SERVER['last'] = time.time()
    return d['choices'][0]['message']['content']


def _reaper():
    while True:
        time.sleep(30)
        p = _SERVER['proc']
        if p is None or p.poll() is not None:
            return
        if time.time() - _SERVER['last'] > IDLE:
            p.terminate()
            return


def _gemini(messages, key):
    d = _post(f'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={key}',
              {'systemInstruction': {'parts': [{'text': messages[0]['content']}]}, 'contents': [{'parts': [{'text': messages[1]['content']}]}], 'generationConfig': {'temperature': 0.2}})
    return d['candidates'][0]['content']['parts'][0]['text']


def _groq(messages, key):
    d = _post('https://api.groq.com/openai/v1/chat/completions', {'model': 'llama-3.1-8b-instant', 'messages': messages, 'temperature': 0.2, 'max_tokens': 500},
              {'Authorization': 'Bearer ' + key})
    return d['choices'][0]['message']['content']


def _engines(keys, prefer):
    """The engines to try, in order. prefer='local' puts the small local one first (own keys stay as the backup)."""
    mine = [('key', lambda m: _gemini(m, keys['GEMINI_API_KEY'])) for _ in [0] if keys.get('GEMINI_API_KEY')] + \
           [('key', lambda m: _groq(m, keys['GROQ_API_KEY'])) for _ in [0] if keys.get('GROQ_API_KEY')]
    local = [('local', _local)] if local_ready() else []
    return local + mine if prefer == 'local' else mine + local


def ask(question, keys, prefer='auto'):
    found = helpsearch.search(question, 3)
    sources = [{'title': f['title'], 'label': f['label'], 'url': f['url']} for f in found]
    if not found:
        return {'answer': 'I couldn\'t find anything about that. Try other words, or open the Guide (Help → Guide).', 'sources': [], 'mode': 'none'}
    notes = '\n\n'.join(f'[{f["label"]}: {f["title"]}]\n{f["text"][:900]}' for f in found)
    messages = [{'role': 'system', 'content': RULES}, {'role': 'user', 'content': f'Notes:\n{notes}\n\nQuestion: {question}'}]
    for mode, run in _engines(keys, prefer):
        try:
            text = run(messages).strip()
            if text:
                return {'answer': text, 'sources': sources, 'mode': mode}
        except Exception:
            continue
    return {'answer': '', 'sources': sources, 'mode': 'search', 'passages': [{'title': f['title'], 'text': f['text'][:500], 'url': f['url']} for f in found],
            'can_fetch': bool(shutil.which('llama-server')) and _model() is None}


def fetch_model():
    """Download the small model into MODELS (a background thread; progress in FETCH)."""
    if FETCH['running'] or _model():
        return
    FETCH.update(running=True, done=0, total=0, err='')
    def run():
        try:
            MODELS.mkdir(parents=True, exist_ok=True)
            tmp = MODELS / 'help.part'
            with urllib.request.urlopen(MODEL_URL, timeout=60) as r, open(tmp, 'wb') as f:
                FETCH['total'] = int(r.headers.get('Content-Length') or 0)
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
                    FETCH['done'] += len(b)
            tmp.rename(MODELS / 'help.gguf')
        except Exception as e:
            FETCH['err'] = str(e)[:160]
        FETCH['running'] = False
    threading.Thread(target=run, daemon=True).start()
