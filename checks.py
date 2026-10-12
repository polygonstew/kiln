"""Kiln checks: GDScript listing and checking with the real Godot, the Doctor's look through the asset folder,
and snapshots (earlier versions of saved items). Plain functions that take paths; server.py routes to them."""
import json, re, shutil, subprocess, tempfile, time, uuid
from pathlib import Path


# ------------------------------------------------- GDScript: list scripts, check them with the real Godot ---
GODOT = shutil.which('godot') or shutil.which('godot4')


def list_scripts(r):
    """Every .gd file under the asset folder r (Godot caches skipped), relative to it."""
    return sorted(str(p.relative_to(r)) for p in r.rglob('*.gd') if not any(x.startswith('.') for x in p.relative_to(r).parts))


def check_script(base, rel, text):
    """Parse-check GDScript with `godot --check-only` in a scratch project whose folders link to the Godot
    project (or the asset folder) `base`, so res:// paths resolve and nothing real is written. {ok, errors: [{line, msg}]}"""
    if not GODOT:
        return {'ok': None, 'errors': [], 'godot': False}
    base = Path(base)
    with tempfile.TemporaryDirectory(prefix='kiln-check-') as tmp:
        t = Path(tmp)
        (t / 'project.godot').write_text('config_version=5\n[application]\nconfig/name="kiln-check"\n')
        for c in base.iterdir():
            if not c.name.startswith('.') and c.name != 'project.godot':
                (t / c.name).symlink_to(c)
        name = re.sub(r'[^\w.-]', '_', Path(rel or 'script.gd').name)
        (t / '__kiln_check').mkdir()
        (t / '__kiln_check' / name).write_text(text)
        try:
            out = subprocess.run([GODOT, '--headless', '--path', tmp, '--check-only', '-s', f'res://__kiln_check/{name}'],
                                 capture_output=True, text=True, timeout=45)
        except subprocess.TimeoutExpired:
            return {'ok': None, 'errors': [{'line': 0, 'msg': 'Godot took too long to answer'}], 'godot': True}
        log, errors = out.stdout + out.stderr, []
        for m in re.finditer(r'SCRIPT ERROR: (?:Parse Error: )?(.+?)\n\s+at: [^\n]*?__kiln_check/[^:\n]+:(\d+)\)', log):
            e = {'line': int(m.group(2)), 'msg': m.group(1).strip()}
            if e not in errors:
                errors.append(e)
        return {'ok': not errors, 'errors': errors, 'godot': True}


# ------------------------------------------------- Doctor: what is wrong or odd in the asset folder ---
def doctor(r, groot):
    """Findings for asset folder r (inside Godot project groot, or None): [{level: bad|warn|info, kind, msg, path, fix}]."""
    out = []
    def rel(p):
        return str(p.relative_to(r)) if str(p).startswith(str(r)) else str(p)
    # 1. scenes / resources pointing at files that are not there
    for f in list(r.rglob('*.tscn')) + list(r.rglob('*.tres')):
        if any(x.startswith('.') for x in f.relative_to(r).parts):
            continue
        for m in re.finditer(r'path="([^"]+)"', f.read_text(errors='ignore')):
            ref = m.group(1)
            if ref.startswith('res://'):
                if not groot:
                    continue
                target = Path(groot) / ref[6:]
            elif ref.startswith('uid://'):
                continue
            else:
                target = r / ref
            if not target.exists():
                out.append({'level': 'bad', 'kind': 'missing', 'msg': f'{f.name} needs {ref}, which is not there', 'path': rel(f), 'fix': 'show'})
    # 2. actors: frame size and colour count
    for man in sorted((r / 'sprites').glob('*/manifest.json')) if (r / 'sprites').exists() else []:
        try:
            m = json.loads(man.read_text())
        except Exception:
            continue
        name, w, h = man.parent.name, m.get('w', 0), m.get('h', 0)
        if max(w, h) > 128:
            out.append({'level': 'warn', 'kind': 'big', 'msg': f'{name}: frames are {w}×{h}; game sprites are usually 16–96 px tall', 'path': rel(man.parent), 'fix': 'shrink', 'name': name})
        pal = man.parent / 'palette.hex'
        if pal.exists():
            n = len([l for l in pal.read_text().split() if l.strip()])
            if n > 32:
                out.append({'level': 'warn', 'kind': 'colours', 'msg': f'{name}: {n} colours (retro consoles allowed 3–15 per sprite)', 'path': rel(man.parent), 'fix': 'shrink', 'name': name})
    # 3. loose images directly in sprites/ (not part of an actor)
    for img in sorted((r / 'sprites').glob('*.png')) if (r / 'sprites').exists() else []:
        out.append({'level': 'info', 'kind': 'loose', 'msg': f'{img.name} is loose in sprites/ (not part of an actor)', 'path': rel(img), 'fix': 'show'})
    # 4. Kiln projects: never saved for Godot (one line per kind), too big as sprites, or very large files
    unsaved = {}
    for pj in sorted((r / 'kiln').glob('*.json')) if (r / 'kiln').exists() else []:
        kind, _, nm = pj.stem.partition('-')
        folder = {'actor': 'sprites', 'scene': 'backgrounds', 'level': 'levels', 'room': 'rooms', 'hud': 'hud'}.get(kind)
        if folder and nm and not (r / folder / nm).exists():
            unsaved.setdefault(kind, []).append(nm)
            if kind == 'actor' and pj.stat().st_size < 30e6:      # not exported, so no manifest: read its size from the project
                try:
                    a = json.loads(pj.read_text()).get('actor', {})
                    if max(a.get('w', 0), a.get('h', 0)) > 128:
                        out.append({'level': 'warn', 'kind': 'big', 'msg': f'{nm}: frames are {a["w"]}×{a["h"]}; game sprites are usually 16–96 px tall', 'path': rel(pj), 'fix': 'shrink', 'name': nm})
                except Exception:
                    pass
    for kind, names in unsaved.items():
        out.append({'level': 'info', 'kind': 'unsaved', 'msg': f'{len(names)} {kind}{"s" if len(names) > 1 else ""} only in Kiln, never saved for Godot: {", ".join(names[:6])}{"…" if len(names) > 6 else ""}', 'path': 'kiln', 'fix': 'open', 'kindOf': kind})
    for pj in sorted((r / 'kiln').glob('*.json')) if (r / 'kiln').exists() else []:
        if pj.stat().st_size > 40e6:
            out.append({'level': 'info', 'kind': 'heavy', 'msg': f'{pj.name} is {pj.stat().st_size / 1e6:.0f} MB, which makes saving slow (big AI layers)', 'path': rel(pj), 'fix': 'show'})
    return out


# ------------------------------------------------- snapshots: earlier versions of every saved item ---
HIST_KEEP, HIST_GAP, HIST_CAP = 5, 600, 1 << 30     # newest 5 per item, one per 10 minutes, 1 GB in all


def snapshot(f, new_text=None):
    """Before f (a project file) is overwritten, keep its current version in kiln/history/<id>/<stamp>.json."""
    if not f.exists():
        return
    h = f.parent / 'history' / f.stem
    snaps = sorted(h.glob('*.json')) if h.exists() else []
    if snaps and time.time() - snaps[-1].stat().st_ctime < HIST_GAP:
        return
    if new_text is not None and f.stat().st_size == len(new_text) and f.read_text() == new_text:
        return                                          # nothing changed
    h.mkdir(parents=True, exist_ok=True)
    shutil.copy2(f, h / (time.strftime('%Y%m%d-%H%M%S', time.localtime(f.stat().st_mtime)) + '.json'))
    for old in sorted(h.glob('*.json'))[:-HIST_KEEP]:
        old.unlink()
    alls = sorted(f.parent.glob('history/*/*.json'), key=lambda p: p.stat().st_ctime)
    total = sum(p.stat().st_size for p in alls)
    for p in alls:                                      # over the cap: oldest go, but every item keeps its newest
        if total <= HIST_CAP:
            break
        if p != max(p.parent.glob('*.json')):
            total -= p.stat().st_size
            p.unlink()


def history(pdir, pid):
    h = pdir / 'history' / re.sub(r'[^\w.-]', '_', pid)
    return [{'stamp': p.stem, 'size': p.stat().st_size} for p in sorted(h.glob('*.json'), reverse=True)] if h.exists() else []


def restore_copy(pdir, pid, stamp):
    """Bring an earlier version back as a NEW item (<name>_<stamp>): nothing current is overwritten."""
    pid, stamp = re.sub(r'[^\w.-]', '_', pid), re.sub(r'[^\w-]', '_', stamp)
    d = json.loads((pdir / 'history' / pid / f'{stamp}.json').read_text())
    kind = d.get('meta', {}).get('kind') or pid.split('-')[0]
    name = f"{d.get('meta', {}).get('name') or pid.split('-', 1)[-1]}_{stamp[4:8]}_{stamp[9:13]}"
    d.setdefault('meta', {})['name'] = name
    if isinstance(d.get(kind), dict):
        d[kind]['name'] = name
        d[kind]['id'] = uuid.uuid4().hex[:12]
    nid = f'{kind}-{re.sub(r"[^a-z0-9_]+", "_", name.lower())}'
    (pdir / f'{nid}.json').write_text(json.dumps(d))
    return {'ok': True, 'id': nid, 'name': name, 'kind': kind}
