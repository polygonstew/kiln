"""Find what Kiln's own words say about a question: the guide (static/help.html), the docs (FORMATS, ARCHITECTURE,
DEVELOPING, CONSISTENCY) and a short note per Godot class Kiln writes (static/help/godot_classes.txt, made by
tools/godot_docs.py). Each is cut into small sections and ranked with BM25: plain Python, no embedding model.
search(question, n) → [{title, text, label, url}], best first."""
import html, math, re
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
DOCS = ('FORMATS', 'ARCHITECTURE', 'DEVELOPING', 'CONSISTENCY')   # the logs (RESUME, LOOP, HANDOFF) are notes for the developer
STOP = set('a an the is are was be to of in on for and or it its this that how do does can i my me you your with what where when why which as at by from not if so'.split())
_INDEX = {}      # {'sig': files' mtimes, 'docs': [...], 'df': Counter, 'avg': float}


def _words(t):
    out = []
    for w in re.findall(r'[a-z0-9_]+', t.lower()):
        if w not in STOP:
            out.append(re.sub(r'(ing|ed|es|s)$', '', w) if len(w) > 4 else w)
    return out


def _cut(text, cap=1400):
    """One section's text → pieces of at most `cap` characters, split at paragraph ends."""
    parts, cur = [], ''
    for p in re.split(r'(?<=\n)', text):
        if cur and len(cur) + len(p) > cap:
            parts.append(cur)
            cur = ''
        cur += p
    return parts + [cur] if cur.strip() else parts


def _guide():
    raw = (HERE / 'static/help.html').read_text()
    for sec in re.finditer(r'<section id="([^"]+)"[^>]*>(.*?)</section>', raw, re.S):
        sid, body = sec.groups()
        body = re.sub(r'<(script|style|svg)\b.*?</\1>', '', body, flags=re.S)
        for part in re.split(r'(?=<h[123][ >])', body):
            m = re.match(r'<h[123][^>]*>(.*?)</h[123]>', part, re.S)
            title = html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else sid
            text = html.unescape(re.sub(r'[ \t]+', ' ', re.sub(r'<(?:br|/p|/li|/h\d|/tr)[^>]*>', '\n', re.sub(r'<kbd[^>]*>(.*?)</kbd>', r'[\1]', part))))
            text = re.sub(r'\n\s*\n+', '\n', re.sub(r'<[^>]+>', '', text)).strip()
            for piece in _cut(text):
                if len(piece) > 40:
                    yield {'title': title, 'text': piece, 'label': 'Guide', 'url': f'/help#{sid}'}


def _markdown(name):
    p = HERE / 'docs' / f'{name}.md'
    for part in re.split(r'(?m)^(?=#{1,3} )', p.read_text()):
        title = part.splitlines()[0].lstrip('# ').strip() if part.startswith('#') else name
        for piece in _cut(part):
            if len(piece) > 40:
                yield {'title': title, 'text': piece, 'label': f'{name}.md', 'url': ''}


def _godot():
    p = HERE / 'static/help/godot_classes.txt'
    for part in p.read_text().split('\n## ') if p.exists() else ():
        title = part.lstrip('# ').splitlines()[0].split(' (')[0]
        yield {'title': title, 'text': part.lstrip('# '), 'label': 'Godot', 'url': f'https://docs.godotengine.org/en/stable/classes/class_{title.lower()}.html'}


def _index():
    files = [HERE / 'static/help.html', HERE / 'static/help/godot_classes.txt', *(HERE / 'docs' / f'{n}.md' for n in DOCS)]
    sig = [p.stat().st_mtime if p.exists() else 0 for p in files]
    if _INDEX.get('sig') != sig:
        docs = [*_guide(), *(d for n in DOCS for d in _markdown(n)), *_godot()]
        for d in docs:
            d['tf'] = Counter(_words(d['text']) + _words(d['title']) * 3)      # a hit in the title counts triple
            d['len'] = sum(d['tf'].values())
        _INDEX.update(sig=sig, docs=docs, df=Counter(w for d in docs for w in d['tf']), avg=sum(d['len'] for d in docs) / max(1, len(docs)))
    return _INDEX


def search(question, n=4):
    ix = _index()
    q = _words(question)
    if not q:
        return []
    N, scored = len(ix['docs']), []
    for d in ix['docs']:
        s = 0.0
        for w in q:
            f = d['tf'].get(w, 0)
            if f:
                idf = math.log(1 + (N - ix['df'][w] + .5) / (ix['df'][w] + .5))
                s += idf * f * 2.2 / (f + 1.2 * (.25 + .75 * d['len'] / ix['avg']))
        if s > 0:
            scored.append((s, d))
    scored.sort(key=lambda x: -x[0])
    return [{k: d[k] for k in ('title', 'text', 'label', 'url')} for _, d in scored[:n]]
