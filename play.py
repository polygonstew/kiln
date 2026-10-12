"""Kiln play builds: turn the asset folder into a small Godot game and export it for the web, to play in a browser.
Everything happens in build/ (a copy): the asset folder is only read. The page sends the generated main scene
and scripts; prepare() copies the assets and writes project.godot (release.py uses it too), build() exports for
the Stage and reports."""
import base64, json, os, re, shutil, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / 'build'
GAME, WEB = BUILD / 'game', BUILD / 'web'
ASSET_DIRS = ['sprites', 'backgrounds', 'levels', 'rooms', 'adventure', 'videos', 'pictures', 'rules', 'cards', 'hud', 'fonts', 'sfx', 'music', 'vfx', 'icons', 'scripts', 'tiles', 'menus', 'logic', 'dialogue', '_kiln']
STATE = {'running': False, 'log': [], 'ok': None, 'at': 0}

PROJECT = '''config_version=5

[application]
config/name="{name}"
config/version="{version}"
run/main_scene="res://kiln_main.tscn"
{icon}boot_splash/bg_color=Color(0, 0, 0, 1)
boot_splash/show_image=false

[display]
window/size/viewport_width={w}
window/size/viewport_height={h}
window/size/window_width_override={w3}
window/size/window_height_override={h3}
window/size/mode={mode}
window/stretch/mode="{stretch}"
window/stretch/scale_mode="{scale_mode}"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/canvas_textures/default_texture_filter={tex_filter}
textures/vram_compression/import_etc2_astc=true
'''
PRESETS = '''[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json"
exclude_filter=""
export_path="../web/index.html"

[preset.0.options]
variant/extensions_support=false
variant/thread_support=false
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
'''


def log(msg):
    STATE['log'].append(f'{time.strftime("%H:%M:%S")} {msg}')


def rewrite_paths(text):
    """Scenes saved outside a Godot project use folder-relative paths: make them res:// for the build."""
    dirs = '|'.join(ASSET_DIRS)
    text = re.sub(rf'path="({dirs})/', r'path="res://\1/', text)
    return re.sub(rf'= "({dirs})/', r'= "res://\1/', text)


def godot_bin():
    g = shutil.which('godot') or shutil.which('godot4')
    if not g:
        raise RuntimeError('Godot is not installed on this machine')
    return g


def prepare(game, asset_root, files, opts, say=None):
    """Make the Godot project in `game` (emptied first): the asset folders, the page's files (main scene, scripts),
    project.godot from opts {name, version, w, h, scale (window = scale × w), fullscreen, pixel_perfect, icon: PNG
    data URL}, then Godot's import. The asset folder is only read. say(line) reports progress (default: Play's log)."""
    say = say or log
    godot = godot_bin()
    if game.exists():
        shutil.rmtree(game)
    game.mkdir(parents=True)
    n = 0
    for d in ASSET_DIRS:
        if (asset_root / d).exists():
            shutil.copytree(asset_root / d, game / d, ignore=shutil.ignore_patterns('*.import', '.*'))
            n += sum(1 for _ in (game / d).rglob('*') if _.is_file())
    say(f'copied {n} asset files')
    for f in list(game.rglob('*.tscn')) + list(game.rglob('*.tres')):
        f.write_text(rewrite_paths(f.read_text(errors='ignore')))
    for name, text in files.items():
        p = game / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    icon = ''
    if str(opts.get('icon', '')).startswith('data:image/png;base64,'):
        png = base64.b64decode(opts['icon'].split(',', 1)[1])
        (game / 'icon.png').write_bytes(png)
        (game / 'icon.ico').write_bytes(ico(png))
        icon = 'config/icon="res://icon.png"\n'
    w, h, k = int(opts.get('w', 480)), int(opts.get('h', 270)), max(1, min(6, int(opts.get('scale', 3))))
    modern = opts.get('look') == 'modern'          # Modern look: smooth scaling and filtering; Pixel: sharp, whole pixels
    (game / 'project.godot').write_text(PROJECT.format(
        name=str(opts.get('name', 'Kiln demo')).replace('"', ''), version=str(opts.get('version', '1.0')).replace('"', ''), icon=icon,
        w=w, h=h, w3=w * k, h3=h * k, mode=3 if opts.get('fullscreen') else 0, scale_mode='integer' if opts.get('pixel_perfect', True) and not modern else 'fractional',
        stretch='canvas_items' if modern else 'viewport', tex_filter=1 if modern else 0))
    say('importing assets (Godot)…')
    r = subprocess.run([godot, '--headless', '--path', str(game), '--import'], capture_output=True, text=True, timeout=600)
    for e in [l for l in (r.stdout + r.stderr).splitlines() if 'ERROR' in l][:12]:
        say('  ' + e.strip()[:200])
    return godot


def ico(png):
    """A Windows .ico holding one PNG (any size up to 256; Windows scales it)."""
    w, h = int.from_bytes(png[16:20], 'big'), int.from_bytes(png[20:24], 'big')
    entry = bytes([w % 256, h % 256, 0, 0, 1, 0, 32, 0]) + len(png).to_bytes(4, 'little') + (22).to_bytes(4, 'little')
    return b'\0\0\1\0\1\0' + entry + png


def build(asset_root, files, opts):
    """▶ Play: asset_root (Path), files {name: text} for the game root (main scene, scripts); a debug web build."""
    STATE.update(running=True, log=[], ok=None, at=time.time())
    try:
        godot = prepare(GAME, asset_root, files, opts)
        (GAME / 'export_presets.cfg').write_text(PRESETS)
        if WEB.exists():
            shutil.rmtree(WEB)
        WEB.mkdir(parents=True)
        log('exporting for the web…')
        r = subprocess.run([godot, '--headless', '--path', str(GAME), '--export-debug', 'Web', str(WEB / 'index.html')], capture_output=True, text=True, timeout=900)
        out = r.stdout + r.stderr
        for e in [l for l in out.splitlines() if 'ERROR' in l][:12]:
            log('  ' + e.strip()[:200])
        if not (WEB / 'index.html').exists():
            raise RuntimeError('the export made no game (see the lines above)')
        size = sum(f.stat().st_size for f in WEB.iterdir()) / 1e6
        log(f'done: {size:.1f} MB, play it at /play/')
        STATE['ok'] = True
    except Exception as e:
        log('FAILED: ' + str(e)[:300])
        STATE['ok'] = False
    finally:
        STATE['running'] = False


MIME = {'.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream',
        '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon'}


# Put into the game page when it is served, so Kiln's Stage (the page around it) can talk to the game: the tuning
# numbers and screenshot requests go in (main.gd reads kilnTune / kilnCmd), game output and screenshots come out.
BRIDGE = b"""<script>
window.kilnTune = ''; window.kilnCmd = '';
window.kilnSend = (k, v) => parent.postMessage({ kiln: k, v }, location.origin);
addEventListener('message', e => { const d = e.data || {}; if (d.kiln === 'tune') kilnTune = d.v; if (d.kiln === 'cmd') kilnCmd = d.v; });
for (const k of ['log', 'warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { kilnSend('log', { k, t: a.map(String).join(' ') }); o(...a); }; }
addEventListener('error', e => kilnSend('log', { k: 'error', t: e.message }));
if (parent !== window) kilnSend('ready');
</script>"""


_SECURE = {}


def secure_url(port):
    """Kiln's https address, when `tailscale serve` puts one in front of this port (browsers only run Godot web
    games on a secure page; plain http works only on localhost). '' when there is none. Checked once a minute."""
    if time.time() - _SECURE.get('at', 0) < 60:
        return _SECURE['url']
    url = os.environ.get('KILN_SECURE_URL', '')
    if not url and shutil.which('tailscale'):
        try:
            r = subprocess.run(['tailscale', 'serve', 'status', '--json'], capture_output=True, text=True, timeout=5)
            for host, web in (json.loads(r.stdout or '{}').get('Web') or {}).items():
                if any(str(h.get('Proxy', '')).rstrip('/').endswith(f':{port}') for h in (web.get('Handlers') or {}).values()):
                    url = 'https://' + host.removesuffix(':443')
        except Exception:
            pass
    _SECURE.update(at=time.time(), url=url)
    return url


def built():
    return (WEB / 'index.html').exists()


def serve(rel):
    """A file of the last web build: (bytes, content type) or None. The game page gets the Stage bridge."""
    p = (WEB / (rel or 'index.html')).resolve()
    if not str(p).startswith(str(WEB.resolve())) or not p.is_file():
        return None
    data = p.read_bytes()
    if p.name == 'index.html':
        data = data.replace(b'<head>', b'<head>' + BRIDGE, 1)
    return data, MIME.get(p.suffix, 'application/octet-stream')
