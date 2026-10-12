"""Make the artwork Kiln's game templates use (static/templates/*.webp), once, by hand:
    python3 tools/template_art.py [--all] [name…]        (--all makes them again even if they exist)
Each picture has an art direction from static/templates/directions.json, the same ones the Style bible offers (cold
signal, neon cinema, oil and grief, gothic relic), picked to suit the template's mood. Cloudflare's free daily quota
first, then OpenRouter (OPENROUTER_KILN_TEMPLATES_KEY in ~/.config/uwf-apps/keys.env, a small budget the user set
aside), at most PAID_CAP dollars a run. The art is committed with Kiln; templates copy it into the new game
(demo_paths.js, templates.js), nothing is generated per user. art.json keeps each picture's full description."""
import base64, io, json, sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from cloud import cf_image, keys, post_json

OUT = Path(__file__).resolve().parent.parent / 'static' / 'templates'
DIRS = json.loads((OUT / 'directions.json').read_text())
PAID_CAP = 2.0
SCENE = 'A 2D video game background, no people, no text, no UI.'
GREEN = 'alone on a plain flat bright green background (#00b140), no shadow, no text.'
FIG = 'Full body, seen from the side facing right, standing, whole figure in frame, ' + GREEN + ' '
FIGL = FIG.replace('facing right', 'facing left')
ICON = 'A single {} as a game inventory icon, centred, ' + GREEN
CARD = 'Card art, centred, filling the frame: {}.'
# name: (direction, aspect, what)
ART = {
    # point & click kit: The Last Light
    'cottage': ('oil', '16:9', 'Interior of a fisherman\'s cottage at night, seen from the side like a stage: wooden plank floor across the bottom third, a small window on the left wall showing a moonlit sea, a wooden door on the right wall, a heavy wooden table in the middle, a worn red rug on the floor in front of it, one candle. ' + SCENE),
    'shore': ('oil', '16:9', 'A rocky shore at night seen from the side like a stage: sand across the bottom third, a dark sea and a cloudy moonlit sky, a tall white and red lighthouse on the right with a small door at its base, the stone corner of a cottage with a door on the far left. ' + SCENE),
    'keeper': ('oil', '3:4', FIG + 'A young lighthouse keeper in a navy wool sweater and an open yellow oilskin coat, dark trousers and boots, tired determined face.'),
    'fisherman': ('oil', '3:4', FIGL + 'An old bearded fisherman in a grey cable-knit sweater and a knitted cap, holding a pipe, weathered face.'),
    'item_key': ('oil', '1:1', ICON.format('old brass key')),
    'item_lamp': ('oil', '1:1', ICON.format('unlit brass oil lantern')),
    'item_oil': ('oil', '1:1', ICON.format('small green glass bottle of lamp oil with a cork')),
    'item_lit_lamp': ('oil', '1:1', ICON.format('brass oil lantern burning with a warm flame')),
    # point & click kit: Star Janitor
    'sj_closet': ('cold', '16:9', 'Interior of a cramped supply closet aboard a starship, seen from the side like a stage: metal grating floor across the bottom third, a mop bucket on the left, a softly glowing vending machine against the back wall in the middle, a heavy sliding metal door with a keycard slot on the right. ' + SCENE),
    'sj_bridge': ('cold', '16:9', 'The bridge of a starship seen from the side like a stage: a wide viewscreen of stars at the back, a captain\'s chair on the left, a control console in the middle, a red self-destruct button on a pedestal on the right, metal floor across the bottom third. ' + SCENE),
    'sj_hero': ('cold', '3:4', FIG + 'A lanky starship janitor in grey overalls with a name patch, short blond hair.'),
    'sj_captain': ('cold', '3:4', FIGL + 'A stern alien starship captain, pale green skin, three eyes, a long uniform coat, hands behind the back.'),
    'sj_coin': ('cold', '1:1', ICON.format('alien coin with a hole in the middle')),
    'sj_keycard': ('cold', '1:1', ICON.format('worn keycard with a red stripe')),
    'sj_cutters': ('cold', '1:1', ICON.format('pair of wire cutters')),
    # point & click kit: Bayou Noir
    'bn_bookshop': ('gothic', '16:9', 'Interior of a rare-book shop in the New Orleans French Quarter at night, seen from the side like a stage: wooden floor across the bottom third, tall bookshelves on the left, a cluttered desk with a green lamp and a newspaper in the middle, a front door with a glass pane on the right. ' + SCENE),
    'bn_cemetery': ('gothic', '16:9', 'An old New Orleans cemetery at night seen from the side like a stage: raised white stone tombs, fog, Spanish moss, a full moon, a large tomb in the middle with a snake carved on its door, a paved path across the bottom third. ' + SCENE),
    'bn_hero': ('gothic', '3:4', FIG + 'A rumpled bookshop owner in a worn brown leather jacket over a white shirt, jeans, tousled blond hair.'),
    'bn_priestess': ('gothic', '3:4', FIGL + 'A dignified older woman, a voodoo priestess in a long white dress and a bright headwrap, beads, wise expression.'),
    'bn_book': ('gothic', '1:1', ICON.format('old leather-bound book with a symbol on the cover')),
    'bn_note': ('gothic', '1:1', ICON.format('torn yellowed note covered in faded ink symbols')),
    'bn_translated': ('gothic', '1:1', ICON.format('folded paper with a snake symbol drawn in red ink')),
    'bn_chalk': ('gothic', '1:1', ICON.format('stick of white chalk')),
    # text adventure
    'cave_mouth': ('oil', '16:9', 'The dark mouth of a cave in a rainy hillside at dusk, a brass lantern lying in the mud in the foreground.'),
    'cave_deep': ('oil', '16:9', 'Deep inside a cave lit by warm lantern light, an old oak door set into the rock wall with a green copper handle.'),
    # interactive movie stills
    'fmv_intro': ('neon', '16:9', 'Cinematic still: a rain-soaked city street at night seen from a rooftop, a lone figure in a long coat at the edge.'),
    'fmv_corridor': ('neon', '16:9', 'Cinematic still: a long dim corridor in an abandoned office building at night, flickering lights, two doors at the far end.'),
    'fmv_trap': ('neon', '16:9', 'Cinematic still: a ceiling cracking and collapsing in a dark corridor, dust and falling debris lit by a neon sign.'),
    'fmv_exit': ('neon', '16:9', 'Cinematic still: a figure stepping out of a building into a cold blue dawn as the rain stops.'),
    # top-down
    'ranger': ('gothic', '1:1', 'Seen from directly above: a hooded penitent warrior carrying a glowing censer, ' + GREEN),
    'slime': ('gothic', '1:1', 'A grotesque blob of black ichor with a few glowing eyes, seen from slightly above, a game enemy ' + GREEN),
    'dungeon': ('gothic', '16:9', 'Seen from directly above: the stone floor of a crypt, worn flagstones with dark stains and candle wax, even and seamless, no walls, no objects.'),
    # push puzzles, runner, stacking
    'robot': ('cold', '3:4', FIG + 'A small boxy maintenance robot with one round eye, short legs, little arms.'),
    'lab': ('cold', '16:9', 'Background for a puzzle game: the inside of an empty research facility, clean walls and pipes, a large window at the back, uncluttered floor.'),
    'sky': ('neon', '16:9', 'Background for a game: a vast city skyline at night seen from the rooftops, distant towers and signs, low clouds, uncluttered middle.'),
    # match-3: relics
    'm3_red': ('gothic', '1:1', ICON.format('blood-red ruby heart reliquary')),
    'm3_yellow': ('gothic', '1:1', ICON.format('golden chalice')),
    'm3_green': ('gothic', '1:1', ICON.format('green glass votive candle')),
    'm3_blue': ('gothic', '1:1', ICON.format('blue enamel medallion')),
    'm3_purple': ('gothic', '1:1', ICON.format('amethyst crown')),
    'm3_orange': ('gothic', '1:1', ICON.format('bronze censer')),
    'm3_bg': ('gothic', '16:9', 'Background for a puzzle game: a dim cathedral nave lit by hundreds of candles, uncluttered middle.'),
    # card battler
    'cd_strike': ('gothic', '1:1', CARD.format('a sword slashing in an arc of light')),
    'cd_guard': ('gothic', '1:1', CARD.format('an iron shield with a holy emblem')),
    'cd_mend': ('gothic', '1:1', CARD.format('a vial of glowing healing liquid')),
    'cd_focus': ('gothic', '1:1', CARD.format('an open prayer book with glowing pages')),
    'cd_smash': ('gothic', '1:1', CARD.format('a great flail smashing down with sparks')),
    'cd_goblin': ('gothic', '3:4', 'A hunched hooded heretic with a curved knife, full body facing the viewer, a game enemy ' + GREEN),
    'cd_knight': ('gothic', '3:4', 'A skeletal knight in rusted ornate armour with a cracked shield, full body facing the viewer, a game enemy ' + GREEN),
    'cd_dragon': ('gothic', '3:4', 'A winged gargoyle of black stone with burning eyes, full body facing the viewer, a game boss ' + GREEN),
}


def prompt(name):
    d, aspect, what = ART[name]
    return aspect, f'{what} Art style: {DIRS[d]["words"]}. Avoid: {DIRS[d]["avoid"]}.'


def openrouter(text, aspect):
    key = keys().get('OPENROUTER_KILN_TEMPLATES_KEY')
    if not key:
        return None, 0
    d = post_json('https://openrouter.ai/api/v1/chat/completions', {
        'model': 'google/gemini-2.5-flash-image', 'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': text}]}],
        'modalities': ['image', 'text'], 'image_config': {'aspect_ratio': aspect}, 'usage': {'include': True}}, {'Authorization': f'Bearer {key}'})
    cost = float((d.get('usage') or {}).get('cost') or 0.04)
    for ch in d.get('choices', []):
        for im in (ch.get('message') or {}).get('images') or []:
            u = (im.get('image_url') or {}).get('url', '')
            if u.startswith('data:'):
                return base64.b64decode(u.split(',', 1)[1]), cost
    return None, cost


def main(args):
    redo = '--all' in args
    names = [a for a in args if not a.startswith('--')] or list(ART)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'art.json').write_text(json.dumps({n: dict(zip(('aspect', 'prompt'), prompt(n))) for n in ART}, indent=1) + '\n')
    spent = 0.0
    for name in names:
        f = OUT / f'{name}.webp'
        if f.exists() and not redo:
            continue
        aspect, text = prompt(name)
        data, err = cf_image(text, aspect)
        route = 'free'
        if not data:
            if spent >= PAID_CAP:
                print(f'{name}: skipped (paid cap ${PAID_CAP} reached this run)', flush=True)
                continue
            data, cost = openrouter(text, aspect)
            spent += cost; route = f'paid ${cost:.3f}'
        if data:
            Image.open(io.BytesIO(data)).convert('RGB').save(f, quality=86, method=6); print(f'{name}: {route}', flush=True)
        else:
            print(f'{name}: failed ({err})', flush=True)
    print(f'paid this run: ${spent:.3f}')


if __name__ == '__main__':
    main(sys.argv[1:])
