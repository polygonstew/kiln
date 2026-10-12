"""Writing help for the Game doc: a few short ideas for one part of the document, from a free text model. Free engines
only, tried in order (the user's rule for home apps): Gemini's free tier (two models), then a free OpenRouter model.
Never a paid one, and no model names reach the page. ideas(...) → a list of strings."""
import json, re, urllib.request

GEMINI = ('gemini-3.8-flash', 'gemini-flash-lite-latest')
OPENROUTER_FREE = 'google/gemma-4-31b-it:free'


def _post(url, body, headers, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _ask(prompt, keys):
    """The model's text answer, trying each free engine in turn; raises when none answers."""
    last = None
    for m in GEMINI if keys.get('GEMINI_API_KEY') else ():
        try:
            d = _post(f'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={keys["GEMINI_API_KEY"]}',
                      {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseMimeType': 'application/json', 'temperature': 1.0}}, {})
            return d['candidates'][0]['content']['parts'][0]['text']
        except Exception as e:
            last = e
    if keys.get('OPENROUTER_FREE_KEY'):
        try:
            d = _post('https://openrouter.ai/api/v1/chat/completions', {'model': OPENROUTER_FREE, 'messages': [{'role': 'user', 'content': prompt}]},
                      {'Authorization': 'Bearer ' + keys['OPENROUTER_FREE_KEY']}, timeout=90)
            return d['choices'][0]['message']['content']
        except Exception as e:
            last = e
    raise RuntimeError('the idea helper is busy right now, try again in a minute' if last else 'no free text engine is set up')


def ideas(keys, part, section, doc, text='', n=3):
    """n different suggestions for one part ("Logline", "Places"…) of one section, fitting what the doc says so far."""
    prompt = (f'You help a solo developer write the design document for their 2D pixel-art video game.\n'
              f'What the document says so far:\n{doc[:6000] or "(nothing yet)"}\n\n'
              f'Suggest {n} different ideas for "{part}" in the "{section}" section.'
              + (f' What they wrote there already: "{text[:1500]}". Build on it, don\'t repeat it.' if text.strip() else '')
              + ' Fit the game\'s genre, tone and world; be concrete and surprising, not generic. Each idea is one to three'
              ' sentences of plain text (a list part: start with a short name, then a colon). Answer with a JSON array of strings only.')
    raw = _ask(prompt, keys)
    m = re.search(r'\[.*\]', raw, re.S)
    try:
        out = json.loads(m.group(0) if m else raw)
    except Exception:
        out = [l.strip('-*• ').strip() for l in raw.splitlines() if l.strip()]
    return [str(x).strip() for x in out if str(x).strip()][:n]
