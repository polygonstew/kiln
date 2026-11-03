"""Project mode: a hand-made Godot project opened as it is (Kiln does not write its scenes or scripts). The first one is the
RAD KID rebuild, ~/.jcodes/radkid-godot, and everything here only uses what that project already offers:
  tuning   data/tuning.json as live numbers (only the changed number is edited; the game reloads the file itself)
  checks   tools/gates.sh with pass / fail and the numbers each gate printed, against the run before
  run      the game in a window
  clips    art/hollow/hollow.json for the animation viewer; rebake = artdir/hollow_job.sh on Kaggle, then kaggle/collect_hollow.sh
  lines    voice lines: lip-sync cues (worked out in the browser, lipsync.js) saved to data/lines/
server.py sends /api/gp/<name> here: route(name, args) -> (http code, json). The page is static/js/project.js."""
import base64, json, os, re, shutil, subprocess, threading, time
from pathlib import Path

DEFAULT = os.environ.get('KILN_PROJECT') or str(Path.home() / '.jcodes' / 'radkid-godot')
GODOT = shutil.which('godot') or shutil.which('godot4')
LOCK = threading.Lock()
CHECKS = {'running': False, 'results': [], 'before': [], 'summary': '', 'at': 0, 'log': ''}
BAKE = {'running': False, 'log': [], 'ok': None, 'at': 0}
GAME = {'proc': None}


def root_of(a):
    """The project asked for (default: the RAD KID rebuild): under home, with a project.godot in it."""
    p = Path(a.get('root') or DEFAULT).expanduser().resolve()
    if not str(p).startswith(str(Path.home().resolve())) and not os.environ.get('KILN_PROJECT'):
        raise ValueError('projects live in your home folder')
    if not (p / 'project.godot').is_file():
        raise ValueError(f'no project.godot in {p}')
    return p


def git(r, *args):
    try:
        return subprocess.run(['git', '-C', str(r), *args], capture_output=True, text=True, timeout=8).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return ''


def info(a):
    r = root_of(a)
    title = ''
    if (r / 'data/title.json').is_file():
        title = json.loads((r / 'data/title.json').read_text()).get('title', '')
    if not title:
        m = re.search(r'config/name="([^"]*)"', (r / 'project.godot').read_text())
        title = m.group(1) if m else r.name
    return {'root': str(r), 'title': title, 'branch': git(r, 'rev-parse', '--abbrev-ref', 'HEAD'), 'godot': bool(GODOT),
            'has': {'tuning': (r / 'data/tuning.json').is_file(), 'checks': (r / 'tools/gates.sh').is_file(),
                    'clips': (r / 'art/hollow/hollow.json').is_file(), 'bake': (r / 'artdir/hollow_job.sh').is_file(),
                    'mouths': (r / 'art/mouths/mouths.json').is_file()},
            'running': running()}


# ------------------------------------------------- tuning ---
def _numbers(d):
    return {s: {k: v for k, v in sec.items() if isinstance(v, (int, float)) and not isinstance(v, bool)} for s, sec in d.items() if isinstance(sec, dict)}


def tuning(a):
    r = root_of(a)
    d = json.loads((r / 'data/tuning.json').read_text())
    home = git(r, 'show', 'HEAD:data/tuning.json')                  # the last commit: what "reset" goes back to
    try:
        h = _numbers(json.loads(home)) if home else {}
    except ValueError:
        h = {}
    return {'about': d.get('_about', ''), 'sections': _numbers(d), 'home': h}


def tuning_set(a):
    """Changes one number in place: the file keeps its layout, so a commit shows only what was tuned."""
    r = root_of(a)
    f = r / 'data/tuning.json'
    sec, key, val = str(a['section']), str(a['key']), float(a['value'])
    text = f.read_text()
    m = re.search(r'"%s"\s*:\s*\{' % re.escape(sec), text)
    if not m:
        raise ValueError(f'no section {sec}')
    end = text.index('}', m.end())
    block = text[m.end():end]
    num = re.compile(r'("%s"\s*:\s*)-?[\d.]+(?:[eE][-+]?\d+)?' % re.escape(key))
    if not num.search(block):
        raise ValueError(f'no number {sec}.{key}')
    show = str(int(val)) if val == int(val) and abs(val) < 1e15 else repr(round(val, 6))
    text = text[:m.end()] + num.sub(lambda g: g.group(1) + show, block, 1) + text[end:]
    json.loads(text)                                                # never write a broken file
    tmp = f.with_suffix('.json.kiln')
    tmp.write_text(text)
    was = int(f.stat().st_mtime)
    os.replace(tmp, f)
    t = max(int(time.time()), was + 1)                              # Godot compares whole seconds: always move it forward
    os.utime(f, (t, t))
    return {'ok': True, 'value': float(show)}


# ------------------------------------------------- checks ---
GATE = re.compile(r'^(PASS|FAIL)\s+(\S+)\s*(.*)$')
NUM = re.compile(r'-?\d+(?:\.\d+)?')


def parse_gates(text):
    """tools/gates.sh output -> ([{name, ok, text, numbers}], summary line)."""
    out, summary = [], ''
    for line in text.splitlines():
        m = GATE.match(line.strip())
        if m:
            out.append({'name': m.group(2), 'ok': m.group(1) == 'PASS', 'text': m.group(3), 'numbers': [float(x) for x in NUM.findall(m.group(3))]})
        elif line.startswith('GATES:'):
            summary = line[6:].strip()
    return out, summary


def _run_checks(r):
    t = time.time()
    try:
        p = subprocess.run(['bash', 'tools/gates.sh'], cwd=r, capture_output=True, text=True, timeout=240)
        log = p.stdout + p.stderr
    except subprocess.TimeoutExpired:
        log = 'the checks took over 4 minutes and were stopped'
    res, summary = parse_gates(log)
    with LOCK:
        CHECKS.update(running=False, before=CHECKS['results'], results=res, summary=summary or 'no result: see the log', log=log[-4000:], at=time.time(), took=round(time.time() - t, 1))


def checks_start(a):
    r = root_of(a)
    with LOCK:
        if CHECKS['running']:
            return {'ok': True, 'already': True}
        CHECKS['running'] = True
    threading.Thread(target=_run_checks, args=(r,), daemon=True).start()
    return {'ok': True}


def checks(a):
    with LOCK:
        return dict(CHECKS)


# ------------------------------------------------- run the game ---
def running():
    p = GAME['proc']
    return bool(p and p.poll() is None)


def run(a):
    if a.get('stop'):
        if running():
            GAME['proc'].terminate()
        return {'ok': True, 'running': False}
    if running():
        return {'ok': True, 'running': True}
    if not GODOT:
        raise ValueError('Godot is not installed')
    r = root_of(a)
    env = dict(os.environ)
    env.setdefault('DISPLAY', ':0')
    env.setdefault('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}')
    GAME['proc'] = subprocess.Popen([GODOT, '--path', str(r)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    if not running():
        raise ValueError('the game closed straight away: is this machine showing a desktop?')
    return {'ok': True, 'running': True}


# ------------------------------------------------- clips and baking ---
def clips(a):
    r = root_of(a)
    f = r / 'art/hollow/hollow.json'
    return {'root': str(r), **json.loads(f.read_text())} if f.is_file() else {'root': str(r), 'creatures': {}}


def _say(line):
    with LOCK:
        BAKE['log'] = (BAKE['log'] + [line.rstrip()])[-200:]


def _run_bake(r, keys):
    ok = False
    try:
        env = dict(os.environ, RK_JOB='artdir/hollow_job.sh')
        for cmd in (['bash', 'kaggle/run.sh'], ['bash', 'kaggle/collect_hollow.sh', *keys]):
            _say('$ ' + ' '.join(cmd))
            p = subprocess.Popen(cmd, cwd=r, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in p.stdout:
                _say(line)
            if p.wait() != 0:
                _say(f'stopped: exit {p.returncode}')
                return
        ok = True
    finally:
        (r / 'artdir/hollow_job.env').unlink(missing_ok=True)
        with LOCK:
            BAKE.update(running=False, ok=ok, at=time.time())


def bake_start(a):
    """Bakes creatures on the free GPU: writes the job's settings, runs it, unpacks the frames into the project."""
    r = root_of(a)
    keys = [re.sub(r'\W', '', k) for k in a.get('creatures') or []]
    samples = max(4, min(256, int(a.get('samples', 48))))
    with LOCK:
        if BAKE['running']:
            return {'ok': True, 'already': True}
        BAKE.update(running=True, log=[], ok=None)
    lines = [f'RK_SAMPLES={samples}'] + ([f'RK_ONLY="{" ".join(keys)}"'] if keys else [])
    (r / 'artdir/hollow_job.env').write_text('\n'.join(lines) + '\n')
    threading.Thread(target=_run_bake, args=(r, keys), daemon=True).start()
    return {'ok': True}


def bake(a):
    with LOCK:
        return dict(BAKE)


# ------------------------------------------------- voice lines ---
def lines(a):
    r = root_of(a)
    d = r / 'data/lines'
    out = []
    if d.is_dir():
        for f in sorted(d.glob('*.json')):
            j = json.loads(f.read_text())
            out.append({'name': f.stem, 'duration': j.get('duration', 0), 'cues': j.get('cues', []), 'audio': j.get('audio', '')})
    mouths = r / 'art/mouths/mouths.json'
    return {'root': str(r), 'lines': out, 'mouths': json.loads(mouths.read_text()) if mouths.is_file() else None}


def line_save(a):
    """A voice line for the game: cues [[seconds, shape], ...] + the sound. The game plays it with game/mouth.gd."""
    r = root_of(a)
    name = re.sub(r'[^\w-]', '_', a['name'])[:40]
    if not name:
        raise ValueError('name the line first')
    rel = ''
    if a.get('audio_b64'):
        ext = re.sub(r'\W', '', a.get('ext', 'ogg'))[:5]
        v = r / 'art/voice'
        v.mkdir(parents=True, exist_ok=True)
        (v / f'{name}.{ext}').write_bytes(base64.b64decode(a['audio_b64']))
        rel = f'art/voice/{name}.{ext}'
    d = r / 'data/lines'
    d.mkdir(parents=True, exist_ok=True)
    f = d / f'{name}.json'
    if not rel and f.is_file():
        rel = json.loads(f.read_text()).get('audio', '')
    f.write_text(json.dumps({'cues': a['cues'], 'duration': a.get('duration', 0), 'audio': rel}) + '\n')
    return {'ok': True, 'name': name}


GET = {'info': info, 'tuning': tuning, 'checks': checks, 'clips': clips, 'bake': bake, 'lines': lines}
POST = {'tuning': tuning_set, 'checks': checks_start, 'run': run, 'bake': bake_start, 'line': line_save}


def route(name, a, post=False):
    fn = (POST if post else GET).get(name)
    if not fn:
        return 404, {'err': f'no such thing: {name}'}
    try:
        return 200, fn(a)
    except (ValueError, KeyError, OSError) as e:
        return 400, {'err': str(e)}
