"""Kiln game releases (File → Export game): the game ▶ Play builds, exported for players. Targets: a web zip ready for
itch.io (index.html at the top; no threads, so no special server headers), Linux and Windows builds (one program file
each with the game packed inside), macOS (an ad-hoc signed .app: players right-click → Open the first time), and the
Godot project itself as a zip. Works in build/ship (a copy: the asset folder is only read); the zips land in
build/releases/ for the page to download."""
import re, shutil, subprocess, time, zipfile
from pathlib import Path
import play

SHIP, WORK, OUT = play.BUILD / 'ship', play.BUILD / 'ship_out', play.BUILD / 'releases'
STATE = {'running': False, 'log': [], 'ok': None, 'made': []}

# [id, label, what the player gets, Godot export template it needs]
TARGETS = [
    ('web', 'Web', 'a zip with index.html: upload to itch.io as an HTML game, or any web host', 'web_nothreads_release.zip'),
    ('windows', 'Windows', 'one .exe (64-bit) with your icon, zipped', 'windows_release_x86_64.exe'),
    ('linux', 'Linux', 'one program file (64-bit), zipped', 'linux_release.x86_64'),
    ('macos', 'macOS', 'an .app (Intel and Apple Silicon); unsigned, so players right-click → Open the first time', 'macos.zip'),
    ('project', 'Godot project', 'the game as a Godot 4 project, to keep working on it in Godot itself', ''),
]
# Godot preset per target: platform name, file it writes ({slug}), its options
PRESETS = {
    'web': ('Web', 'index.html', 'variant/extensions_support=false\nvariant/thread_support=false\n'
            'html/canvas_resize_policy=2\nhtml/focus_canvas_on_start=true\nhtml/export_icon=true\n'),
    'windows': ('Windows Desktop', '{slug}.exe', 'binary_format/embed_pck=true\nbinary_format/architecture="x86_64"\n'
                'debug/export_console_wrapper=0\napplication/modify_resources=true\napplication/icon="{ico}"\n'
                'application/file_version="{v4}"\napplication/product_version="{v4}"\n'
                'application/product_name="{name}"\napplication/file_description="{name}"\n'),
    'linux': ('Linux', '{slug}.x86_64', 'binary_format/embed_pck=true\nbinary_format/architecture="x86_64"\n'),
    'macos': ('macOS', '{slug}.zip', 'binary_format/architecture="universal"\napplication/bundle_identifier="org.kiln.{ident}"\n'
              'application/short_version="{version}"\napplication/version="{version}"\ncodesign/codesign=1\n'),
}


def say(msg):
    STATE['log'].append(f'{time.strftime("%H:%M:%S")} {msg}')


def templates_dir():
    """Where this Godot keeps its export templates (Editor → Manage Export Templates installs them)."""
    try:
        v = subprocess.run([play.godot_bin(), '--version'], capture_output=True, text=True, timeout=20).stdout.strip()
    except Exception:
        return None
    m = re.match(r'(\d+\.\d+(?:\.\d+)?)\.(\w+)', v)
    return Path.home() / '.local/share/godot/export_templates' / f'{m[1]}.{m[2]}' if m else None


def targets():
    """Each target with whether it can be made here (its template installed) and why not."""
    t = templates_dir()
    out = []
    for tid, label, what, tpl in TARGETS:
        ok = not tpl or bool(t and (t / tpl).exists())
        out.append({'id': tid, 'label': label, 'what': what, 'ok': ok,
                    'why': '' if ok else f'needs Godot\'s export templates ({tpl}): Godot → Editor → Manage Export Templates → Download'})
    return out


def releases():
    """The zips made so far, newest first."""
    if not OUT.exists():
        return []
    fs = sorted(OUT.glob('*.zip'), key=lambda f: -f.stat().st_mtime)
    return [{'file': f.name, 'mb': round(f.stat().st_size / 1e6, 1), 'at': int(f.stat().st_mtime)} for f in fs]


def zip_dir(src, dest, skip=()):
    """Zip a folder's contents (top level = the folder's insides); program files keep their run permission."""
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(src.rglob('*')):
            rel = f.relative_to(src)
            if not f.is_file() or rel.parts[0] in skip:
                continue
            info = zipfile.ZipInfo(str(rel), time.localtime(f.stat().st_mtime)[:6])
            info.external_attr = (0o755 if f.stat().st_mode & 0o111 else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, f.read_bytes())


def release(asset_root, files, opts, want):
    """Export the game for every target in `want`. opts as play.prepare (name, version, scale, fullscreen,
    pixel_perfect, icon)."""
    STATE.update(running=True, log=[], ok=None, made=[])
    try:
        godot = play.prepare(SHIP, asset_root, files, opts, say)
        name = re.sub(r'["\\]', '', str(opts.get('name') or 'My game'))
        version = re.sub(r'[^\w.-]', '', str(opts.get('version') or '1.0')) or '1.0'
        slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_') or 'game'
        nums = (re.findall(r'\d+', version) + ['0'] * 4)[:4]
        fill = {'slug': slug, 'name': name, 'version': version, 'v4': '.'.join(nums), 'ident': slug.replace('_', '-'),
                'ico': 'res://icon.ico' if (SHIP / 'icon.ico').exists() else ''}
        cfg = []
        for i, tid in enumerate(t for t in want if t in PRESETS):
            platform, fname, options = PRESETS[tid]
            cfg.append(f'[preset.{i}]\n\nname="{tid}"\nplatform="{platform}"\nrunnable=false\nexport_filter="all_resources"\n'
                       f'include_filter="*.json"\nexclude_filter=""\nexport_path="export/{tid}/{fname.format(**fill)}"\n\n'
                       f'[preset.{i}.options]\n\n{options.format(**fill)}')
        (SHIP / 'export_presets.cfg').write_text('\n'.join(cfg))
        OUT.mkdir(parents=True, exist_ok=True)
        ok = targets()
        for tid in want:
            label = next((t['label'] for t in ok if t['id'] == tid), tid)
            if not next((t['ok'] for t in ok if t['id'] == tid), False):
                say(f'{label}: skipped (export templates missing)')
                continue
            dest = OUT / f'{slug}-{version}-{tid}.zip'
            if tid == 'project':
                zip_dir(SHIP, dest, skip=('.godot',))
            else:
                out = WORK / tid
                shutil.rmtree(out, ignore_errors=True)
                out.mkdir(parents=True)
                path = out / PRESETS[tid][1].format(**fill)
                say(f'{label}: exporting…')
                r = subprocess.run([godot, '--headless', '--path', str(SHIP), '--export-release', tid, str(path)],
                                   capture_output=True, text=True, timeout=900)
                for e in [l for l in (r.stdout + r.stderr).splitlines() if 'ERROR' in l][:8]:
                    say('  ' + e.strip()[:200])
                if not path.exists():
                    say(f'{label}: FAILED (see the lines above)')
                    continue
                if tid == 'macos':
                    shutil.move(str(path), dest)          # Godot already zips the .app
                else:
                    zip_dir(out, dest)
            mb = round(dest.stat().st_size / 1e6, 1)
            say(f'{label}: {dest.name} ({mb} MB)')
            STATE['made'].append({'target': tid, 'label': label, 'file': dest.name, 'mb': mb})
        STATE['ok'] = bool(STATE['made'])
        say('done' if STATE['ok'] else 'nothing was made')
    except Exception as e:
        say('FAILED: ' + str(e)[:300])
        STATE['ok'] = False
    finally:
        STATE['running'] = False


def file(name):
    """A finished zip's bytes, or None."""
    p = (OUT / name).resolve()
    return p.read_bytes() if p.parent == OUT.resolve() and p.suffix == '.zip' and p.is_file() else None
