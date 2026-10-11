"""Tidy an asset folder into Kiln's current layout (static/js/layout.js): Kiln's runtime scripts together in _kiln/,
your content in its own folders. Older folders kept the runtime in sprites/_kiln/, menus/kiln_*.gd,
dialogue/kiln_dialogue.gd and a hud.gd in every HUD folder. plan() lists what would move; apply() rewrites every scene
and script that points at the old places, moves the files (with their Godot .uid files), and keeps a copy of
everything it changed or replaced in .trash/<time>-tidy/ with TIDY.md saying what happened."""
import shutil, time
from pathlib import Path

MOVES = [  # old place (from the asset folder) -> new place
    ('sprites/_kiln/juice.gd', '_kiln/actor/juice.gd'), ('sprites/_kiln/hit_flash.gdshader', '_kiln/actor/hit_flash.gdshader'),
    ('sprites/_kiln/projectile.gd', '_kiln/actor/projectile.gd'), ('sprites/_kiln/lipsync.gd', '_kiln/actor/lipsync.gd'),
    ('sprites/_kiln/vfx.gd', '_kiln/actor/vfx.gd'),
    ('sprites/_kiln/level_tiles.gd', '_kiln/level/level_tiles.gd'), ('sprites/_kiln/zone.gd', '_kiln/level/zone.gd'),
    ('menus/kiln_menu.gd', '_kiln/ui/menu.gd'), ('menus/kiln_settings.gd', '_kiln/ui/settings.gd'),
    ('dialogue/kiln_dialogue.gd', '_kiln/ui/dialogue.gd'),
]
TEXT = {'.tscn', '.tres', '.gd', '.gdshader'}
SKIP = {'.trash', '.godot', 'kiln'}       # backups, Godot's cache, Kiln's own projects


def plan(root):
    """[(old, new, what happens)] for this folder; empty when it is tidy already."""
    r = Path(root)
    steps = [(old, new) for old, new in MOVES if (r / old).exists()]
    brains = r / 'sprites/_kiln/brains'
    if brains.is_dir():
        steps += [(f'sprites/_kiln/brains/{f.name}', f'_kiln/brains/{f.name}') for f in sorted(brains.glob('*.gd'))]
    # every HUD had its own copy of the same script: the newest becomes the shared one
    for f in sorted(r.glob('hud/*/hud.gd'), key=lambda f: -f.stat().st_mtime):
        steps.append((str(f.relative_to(r)), '_kiln/ui/hud.gd'))
    taken, out = set(), []
    for old, new in steps:
        keep = not (r / new).exists() and new not in taken
        taken.add(new)
        out.append((old, new, 'moves' if keep else 'old copy to the backup (the new place already has one)'))
    return out


def apply(root, res_base):
    """res_base: how scenes name the asset folder ('res://…/' inside a Godot project, '' otherwise)."""
    r, steps = Path(root), plan(root)
    if not steps:
        return {'moved': 0, 'rewritten': 0, 'backup': ''}
    bak = r / '.trash' / f"{time.strftime('%Y%m%d-%H%M%S')}-tidy"
    bak.mkdir(parents=True)

    def keep(f):                       # a copy of a file before it changes
        dst = bak / f.relative_to(r)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dst)
    # 1. every scene and script that names an old place now names the new one ('res://…/sprites/_kiln/x' or 'sprites/_kiln/x')
    rewritten = []
    for f in r.rglob('*'):
        if not f.is_file() or f.suffix not in TEXT or SKIP & set(f.relative_to(r).parts):
            continue
        t = f.read_text(errors='ignore')
        n = t
        for old, new, _ in steps:
            n = n.replace(old, new)
        # Logic graphs found the dialogue runner beside the dialogue; it now has a fixed place
        n = n.replace('a_dialogue.get_base_dir().path_join("kiln_dialogue.gd")', f'"{res_base or "res://"}_kiln/ui/dialogue.gd"')
        if n != t:
            keep(f)
            f.write_text(n)
            rewritten.append(str(f.relative_to(r)))
    # 2. the files themselves (and Godot's .uid beside each); an old copy whose new place is taken goes to the backup
    moved = []
    for old, new, what in steps:
        for s, d in [(r / old, r / new), (r / (old + '.uid'), r / (new + '.uid'))]:
            if not s.exists():
                continue
            if what == 'moves':
                d.parent.mkdir(parents=True, exist_ok=True)
                s.rename(d)
            else:
                dst = bak / s.relative_to(r)
                dst.parent.mkdir(parents=True, exist_ok=True)
                s.rename(dst)
        moved.append(f'{old} → {new}' + ('' if what == 'moves' else ' (old copy in the backup)'))
    for d in ['sprites/_kiln/brains', 'sprites/_kiln']:
        try:
            (r / d).rmdir()
        except OSError:
            pass
    (bak / 'TIDY.md').write_text('# Kiln tidy\n\nKiln\'s runtime moved into _kiln/ (see _kiln/README.md).\n\n## Moved\n'
                                 + ''.join(f'- {m}\n' for m in moved) + '\n## Rewritten to the new places (originals here)\n'
                                 + ''.join(f'- {f}\n' for f in rewritten))
    return {'moved': len(moved), 'rewritten': len(rewritten), 'backup': str(bak.relative_to(r))}
