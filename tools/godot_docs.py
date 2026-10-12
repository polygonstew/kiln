"""Build static/help/godot_classes.txt: a short plain-text note per Godot class that Kiln's games use, for the help
answers (helpbot.py). Run it after a Godot upgrade:  python3 tools/godot_docs.py   (reads `godot --version`, downloads
that release's class XML from GitHub: the installed build has no descriptions).
Each class: a "## Name (inherits X)" line, the brief + the start of the description, then property / method / signal names."""
import re, subprocess, sys, urllib.request
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
CLASSES = '''CharacterBody2D Camera2D AnimatedSprite2D Sprite2D Area2D CollisionShape2D CollisionPolygon2D RigidBody2D StaticBody2D
TileMapLayer TileSet Skeleton2D Bone2D AnimationPlayer Animation SpriteFrames CanvasLayer Control Label Button Timer
AudioStreamPlayer AudioStreamPlayer2D VideoStreamPlayer Polygon2D Node2D Marker2D GPUParticles2D PointLight2D RayCast2D
InputMap Input PinJoint2D TextureProgressBar TextureRect Tween Line2D Parallax2D HBoxContainer VBoxContainer PanelContainer
NinePatchRect ColorRect LineEdit SceneTree PackedScene ResourceLoader FileAccess DirAccess JSON OS Engine Node'''.split()


def plain(t):
    t = re.sub(r'\[(/?)(code|codeblock|b|i|kbd|gdscript|csharp)[^\]]*\]', '', t or '')
    t = re.sub(r'\[(?:member|method|signal|constant|enum|param|class|annotation|theme_item)\s+([^\]]+)\]', r'\1', t)
    t = re.sub(r'\[([A-Z]\w*)\]', r'\1', t)
    return re.sub(r'\[/?[a-z_]+[^\]]*\]', '', t)


def main():
    v = subprocess.run(['godot', '--version'], capture_output=True, text=True).stdout.strip().split('.')
    tag = '.'.join(v[:3]) + '-stable' if 'stable' in v else 'master'
    out = []
    for name in CLASSES:
        try:
            xml = urllib.request.urlopen(f'https://raw.githubusercontent.com/godotengine/godot/{tag}/doc/classes/{name}.xml', timeout=30).read()
        except Exception:
            print('missing', name, file=sys.stderr)
            continue
        c = ET.fromstring(xml)
        desc = re.sub(r'\s+', ' ', plain((c.findtext('brief_description') or '') + ' ' + (c.findtext('description') or ''))).strip()
        names = lambda tag, item: ', '.join(sorted(x.get('name') for x in c.findall(f'{tag}/{item}'))[:40])
        out.append(f'## {name} (inherits {c.get("inherits") or "nothing"})\n{desc[:1000]}\n'
                   f'Properties: {names("members", "member")}\nMethods: {names("methods", "method")}\nSignals: {names("signals", "signal")}\n')
    (ROOT / 'static/help/godot_classes.txt').write_text('\n'.join(out))
    print(len(out), 'classes, tag', tag)


main()
