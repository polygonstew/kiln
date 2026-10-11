"""Kiln play builds: turn the asset folder into a small Godot game and export it for the web, to play in a browser.
Everything happens in build/ (a copy): the asset folder is only read. The page sends the generated main scene
and scripts; this module copies the assets, writes project.godot and export settings, runs Godot and reports."""
import json, re, shutil, subprocess, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / 'build'
GAME, WEB = BUILD / 'game', BUILD / 'web'
ASSET_DIRS = ['sprites', 'backgrounds', 'levels', 'hud', 'fonts', 'sfx', 'vfx', 'scripts', 'tiles', 'menus']
STATE = {'running': False, 'log': [], 'ok': None, 'at': 0}

PROJECT = '''config_version=5

[application]
config/name="{name}"
run/main_scene="res://kiln_main.tscn"

[display]
window/size/viewport_width={w}
window/size/viewport_height={h}
window/size/window_width_override={w3}
window/size/window_height_override={h3}
window/stretch/mode="viewport"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/canvas_textures/default_texture_filter=0
'''
PRESETS = '''[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter=""
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


def build(asset_root, files, opts):
    """asset_root: the asset folder (Path). files: {name: text} written into the game root (main scene, scripts)."""
    STATE.update(running=True, log=[], ok=None, at=time.time())
    try:
        godot = shutil.which('godot') or shutil.which('godot4')
        if not godot:
            raise RuntimeError('Godot is not installed on this machine')
        if GAME.exists():
            shutil.rmtree(GAME)
        GAME.mkdir(parents=True)
        n = 0
        for d in ASSET_DIRS:
            if (asset_root / d).exists():
                shutil.copytree(asset_root / d, GAME / d, ignore=shutil.ignore_patterns('*.import', '.*'))
                n += sum(1 for _ in (GAME / d).rglob('*') if _.is_file())
        log(f'copied {n} asset files')
        for f in list(GAME.rglob('*.tscn')) + list(GAME.rglob('*.tres')):
            f.write_text(rewrite_paths(f.read_text(errors='ignore')))
        for name, text in files.items():
            p = GAME / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        w, h = int(opts.get('w', 480)), int(opts.get('h', 270))
        (GAME / 'project.godot').write_text(PROJECT.format(name=opts.get('name', 'Kiln demo').replace('"', ''), w=w, h=h, w3=w * 3, h3=h * 3))
        (GAME / 'export_presets.cfg').write_text(PRESETS)
        log('importing assets (Godot)…')
        r = subprocess.run([godot, '--headless', '--path', str(GAME), '--import'], capture_output=True, text=True, timeout=600)
        errs = [l for l in (r.stdout + r.stderr).splitlines() if 'ERROR' in l or 'SCRIPT ERROR' in l]
        for e in errs[:12]:
            log('  ' + e.strip()[:200])
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


def serve(rel):
    """A file of the last web build: (bytes, content type) or None."""
    p = (WEB / (rel or 'index.html')).resolve()
    if not str(p).startswith(str(WEB.resolve())) or not p.is_file():
        return None
    return p.read_bytes(), MIME.get(p.suffix, 'application/octet-stream')
