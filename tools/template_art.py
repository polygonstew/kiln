"""Make the artwork Kiln's game templates use (static/templates/*.webp), once, by hand: python3 tools/template_art.py [name…]
Cloudflare's free daily quota first, then OpenRouter (OPENROUTER_KILN_TEMPLATES_KEY in ~/.config/uwf-apps/keys.env, a
small budget the user set aside for this). Pictures already made are skipped, so it can be run again after a failure.
The art is committed with Kiln; templates copy it into the new game (demo_paths.js), nothing is generated per user."""
import base64, io, json, sys
from PIL import Image
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from cloud import cf_image, keys, post_json

OUT = Path(__file__).resolve().parent.parent / 'static' / 'templates'
STYLE = 'Modern hand-painted 2D video game art, soft lighting, rich colour, clean readable shapes, no text, no UI, no watermark.'
FIG = 'Full body, seen from the side facing right, standing, on a plain flat white background, whole figure in frame, no shadow. '
ART = {   # name: (aspect, prompt)
    'cottage': ('16:9', 'Interior of a cosy fisherman\'s cottage at night, seen from the side like a stage: wooden plank floor across the bottom third, a small window on the left wall showing a moonlit sea, a wooden door on the right wall, a sturdy wooden table in the middle, a red woven rug on the floor in front of it, warm candle light. Empty of people.'),
    'shore': ('16:9', 'A rocky beach at night seen from the side like a stage: a sandy shore across the bottom third, a calm dark sea and a starry sky, a tall white and red striped lighthouse on the right with a small wooden door at its base, the corner of a stone cottage with a door on the far left. Empty of people.'),
    'keeper': ('3:4', FIG + 'A young lighthouse keeper in a navy wool sweater, yellow raincoat open, dark trousers and boots, short brown hair, friendly face.'),
    'fisherman': ('3:4', FIG.replace('facing right', 'facing left') + 'An old bearded fisherman in a grey cable-knit sweater and a knitted hat, holding a pipe, kind and weathered.'),
    'item_key': ('1:1', 'A single old brass key, game inventory icon, centred, on a plain flat white background.'),
    'item_lamp': ('1:1', 'A single unlit brass oil lantern with clear glass, game inventory icon, centred, on a plain flat white background.'),
    'item_oil': ('1:1', 'A single small green glass bottle of lamp oil with a cork, game inventory icon, centred, on a plain flat white background.'),
    'item_lit_lamp': ('1:1', 'A single brass oil lantern burning with a warm bright flame, glowing, game inventory icon, centred, on a plain flat white background.'),
    'cave_mouth': ('16:9', 'The dark mouth of a cave in a rainy hillside at dusk, a brass lantern lying in the mud in the foreground, moody and inviting.'),
    'cave_deep': ('16:9', 'Deep inside a cave lit by warm lantern light, an old oak door set into the rock wall with a green copper handle.'),
    'fmv_intro': ('16:9', 'Cinematic still: a rain-soaked neon city street at night seen from a rooftop, a lone figure in a long coat, film noir mood.'),
    'fmv_corridor': ('16:9', 'Cinematic still: a long dim corridor in an abandoned office building at night, flickering lights, two doors at the far end, tense mood.'),
    'fmv_trap': ('16:9', 'Cinematic still: a ceiling cracking and collapsing in a dark corridor, dust and falling debris, dramatic danger.'),
    'fmv_exit': ('16:9', 'Cinematic still: a figure stepping out of a building into a calm blue dawn, rain stopping, relief.'),
    'ranger': ('1:1', 'Top-down view from directly above of a small adventurer in a purple hooded cloak holding a glowing wand, game character on a plain flat white background.'),
    'slime': ('1:1', 'A cute round green slime monster with big eyes, seen from slightly above, game enemy on a plain flat white background.'),
    'dungeon': ('16:9', 'Seen from directly above: the stone floor of a dungeon room, worn flagstones with moss in the cracks, soft torchlight, seamless and even, no walls, no objects.'),
    'robot': ('3:4', FIG + 'A small friendly boxy maintenance robot with one big round teal eye, short legs, little arms, white and teal paint.'),
    'lab': ('16:9', 'Background for a puzzle game: the inside of a clean futuristic laboratory, teal and white, soft light, a large window at the back, uncluttered, empty floor.'),
    'sky': ('16:9', 'Background for a puzzle game: a bright sky with soft fluffy clouds and distant green hills at the bottom, cheerful, uncluttered middle.'),
    # point & click kit: Star Janitor (late-80s sci-fi comedy adventure)
    'sj_closet': ('16:9', 'Interior of a cramped supply closet aboard a retro sci-fi starship, seen from the side like a stage: metal grating floor across the bottom third, a mop bucket with grey water on the left, a glowing snack vending machine against the back wall in the middle, a sliding metal door with a keycard slot on the right. Goofy 1980s sci-fi comedy adventure mood. Empty of people.'),
    'sj_bridge': ('16:9', 'The bridge of a retro sci-fi starship seen from the side like a stage: a big viewscreen full of stars at the back, a captain\'s chair on the left, a control console in the middle, a big flashing red self-destruct button on a pedestal on the right, metal floor across the bottom third. Empty of people.'),
    'sj_hero': ('3:4', FIG + 'A lanky space janitor in grey overalls with a name patch, goofy determined face, short blond hair.'),
    'sj_captain': ('3:4', FIG.replace('facing right', 'facing left') + 'A pompous alien starship captain, green skin, three eyes, gold-trimmed uniform, hands behind his back.'),
    'sj_coin': ('1:1', 'A single shiny alien coin with a hole in the middle, game inventory icon, centred, on a plain flat white background.'),
    'sj_keycard': ('1:1', 'A single futuristic blue keycard with a chip, game inventory icon, centred, on a plain flat white background.'),
    'sj_cutters': ('1:1', 'A single pair of red-handled wire cutters, game inventory icon, centred, on a plain flat white background.'),
    # point & click kit: Bayou Noir (early-90s gothic mystery adventure)
    'bn_bookshop': ('16:9', 'Interior of a dusty rare-book shop in the New Orleans French Quarter at night, seen from the side like a stage: wooden floor across the bottom third, tall bookshelves on the left, a cluttered desk with a green lamp and a newspaper in the middle, a front door with a glass pane on the right. Gothic mystery mood. Empty of people.'),
    'bn_cemetery': ('16:9', 'An old New Orleans cemetery at night seen from the side like a stage: raised white stone tombs, fog, Spanish moss, a full moon, a large tomb in the middle with a snake symbol carved on its door, a paved path across the bottom third. Gothic mystery mood. Empty of people.'),
    'bn_hero': ('3:4', FIG + 'A charming rumpled bookshop owner in a worn brown leather jacket over a white T-shirt, jeans, tousled blond hair.'),
    'bn_priestess': ('3:4', FIG.replace('facing right', 'facing left') + 'A dignified older woman, a voodoo priestess in a long white dress and a colourful headwrap, beads, wise expression.'),
    'bn_book': ('1:1', 'A single old leather-bound book with a symbol on the cover, game inventory icon, centred, on a plain flat white background.'),
    'bn_note': ('1:1', 'A single torn yellowed paper note covered in faded ink symbols, game inventory icon, centred, on a plain flat white background.'),
    'bn_translated': ('1:1', 'A single folded paper with a snake symbol drawn in red ink, game inventory icon, centred, on a plain flat white background.'),
    'bn_chalk': ('1:1', 'A single stick of white chalk, game inventory icon, centred, on a plain flat white background.'),
}


def openrouter(prompt, aspect):
    key = keys().get('OPENROUTER_KILN_TEMPLATES_KEY')
    if not key:
        return None, 0
    d = post_json('https://openrouter.ai/api/v1/chat/completions', {
        'model': 'google/gemini-2.5-flash-image', 'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}],
        'modalities': ['image', 'text'], 'image_config': {'aspect_ratio': aspect}, 'usage': {'include': True}}, {'Authorization': f'Bearer {key}'})
    cost = float((d.get('usage') or {}).get('cost') or 0.04)
    for ch in d.get('choices', []):
        for im in (ch.get('message') or {}).get('images') or []:
            u = (im.get('image_url') or {}).get('url', '')
            if u.startswith('data:'):
                return base64.b64decode(u.split(',', 1)[1]), cost
    return None, cost


def main(names):
    OUT.mkdir(parents=True, exist_ok=True)
    # the descriptions, for Kiln's "make new pictures" in a template (the same words, the user's own generator)
    (OUT / 'art.json').write_text(json.dumps({n: {'aspect': a, 'prompt': p} for n, (a, p) in ART.items()}, indent=1) + '\n')
    spent = 0.0
    for name in names or ART:
        f = OUT / f'{name}.webp'
        if f.exists():
            continue
        aspect, prompt = ART[name]
        data, err = cf_image(f'{prompt} {STYLE}', aspect)
        route = 'free'
        if not data:
            data, cost = openrouter(f'{prompt} {STYLE}', aspect)
            spent += cost; route = f'paid ${cost:.3f}'
        if data:
            Image.open(io.BytesIO(data)).convert('RGB').save(f, quality=86, method=6); print(f'{name}: {route}', flush=True)
        else:
            print(f'{name}: failed ({err})', flush=True)
    print(f'paid this run: ${spent:.3f}')


if __name__ == '__main__':
    main(sys.argv[1:])
