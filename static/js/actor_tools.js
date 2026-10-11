// Actor tools that work on a whole actor at once, outside the editor: CHARACTER.md (the notes that let a person
// or an agent come back and make more of this actor on-model) and shrinking an actor to game size.
import { bbox, rawURL, hex, newImg, blit, buildPalette, applyPalette, despeckle } from './core.js';
import { S as FS } from './files.js';

// CHARACTER.md: everything needed to come back later (a person or an agent) and make more of this
// actor on-model. The "## Notes" section is yours: it is kept when the file is rewritten.
export async function characterDoc(a, dir, base) {
  let notes = '';
  try { const old = await (await fetch(rawURL(FS.root + '/' + dir + '/CHARACTER.md'))).text(); const i = old.indexOf('## Notes'); if (i >= 0) notes = old.slice(i).trim(); } catch { }
  const id = a.identity || {}, fb = bbox(base.frames[0]);
  return `# ${a.name}

${a.desc?.trim() || '_No description yet. Add one in Animate → Identity; it is what keeps the generator on-model._'}

| | |
|---|---|
| Kind | ${a.kind || 'character'} |
| Frame | ${a.w}×${a.h} px, feet on the bottom row |
| Figure | ${id.figH || fb?.h || a.h} px tall${id.cell ? `; art drawn on ~${id.cell.toFixed(1)} px cells per 1024 px` : ''} |
| Palette | ${a.pal.length <= 32 ? `${a.pal.length} colours: ${a.pal.map(hex).join(' ')}` : `${a.pal.length} colours (full list in \`palette.hex\`)`} |
| Reference | ${id.ref ? '\`reference.png\` (the image new frames are redrawn from)' : 'none yet (Animate → Identity → Use this frame as reference)'} |

## Animations

${a.anims.map(n => `- **${n.name}**: ${n.frames.length} frame${n.frames.length > 1 ? 's' : ''} at ${n.fps} fps${n.loop === false ? ', plays once' : ''}${(n.span || 1) > 1 ? `, ${n.span} boxes wide (${n.frames[0].width}px)` : ''} (\`${n.name}.png\`)`).join('\n')}

## Making more of it (stay on-model)

1. Kiln → Animate → open **${a.name}** → **Make more frames**. Forge locks the reference, the palette above,
   the frame size and the pixel scale, and warns when height or colours drift.
2. The cloud prompt Kiln sends, if you need to do it by hand with \`reference.png\` attached:

   > Redraw this exact ${a.kind || 'character'} from the reference image: ${a.desc?.trim() || '<description>'}. Change: <pose or action>.
   > Keep the identical design, costume, proportions, colours, line weight and facing direction; only the pose or action changes.

3. Then pixelize with: palette locked to the colours above, figure ${id.figH || fb?.h || a.h} px tall, outline 1 px, feet on the floor.

## Files

\`${a.name}.tres\` Godot SpriteFrames · \`${a.name}.tscn\` CharacterBody2D + sprite + body hitbox, with \`hit_flash()\`, \`squash()\`, \`shake()\` (sprites/_kiln/juice.gd) · \`manifest.json\` · \`sheet.png\`/\`sheet.json\` (Aseprite-style) · one strip PNG per animation.

${notes || '## Notes\n\n_Your notes: personality, rules (e.g. "always holds the lantern in the left hand"), what to avoid. Kept when Kiln rewrites this file._'}
`;
}

// area-average downscale: each new pixel is the mean of the opaque pixels it covers (smooth on detailed art);
// it is opaque when at least half of its block was
function boxDown(im, tw, th) {
  const o = newImg(tw, th), sw = im.width / tw, sh = im.height / th, d = im.data;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    let r = 0, g = 0, b = 0, n = 0, all = 0;
    for (let yy = Math.floor(y * sh); yy < Math.max(Math.floor(y * sh) + 1, Math.floor((y + 1) * sh)); yy++)
      for (let xx = Math.floor(x * sw); xx < Math.max(Math.floor(x * sw) + 1, Math.floor((x + 1) * sw)); xx++) {
        const i = (yy * im.width + xx) * 4; all++;
        if (d[i + 3] >= 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      }
    if (n * 2 >= all) o.data.set([r / n, g / n, b / n, 255], (y * tw + x) * 4);
  }
  return o;
}

// every frame shrunk by the same amount onto one 15-colour palette built from all of them (consistent across
// animations); returns the actor's new size, palette and animations
export function shrinkActor(a, want) {
  const k = want / a.h, small = a.anims.map(n => n.frames.map(f => boxDown(f, Math.max(1, Math.round(f.width * k)), want)));
  const flat = small.flat(), all = newImg(flat.reduce((s, f) => s + f.width, 0), want);
  let x = 0; for (const f of flat) { blit(all, f, x, 0); x += f.width; }
  const pal = buildPalette(all, { hw: 'free', count: 15 });
  return { ...a, w: Math.max(1, Math.round(a.w * k)), h: want, pal, identity: undefined, faces: undefined,
    anims: a.anims.map((n, i) => ({ ...n, frames: small[i].map(f => despeckle(applyPalette(f, pal))) })) };
}

// the body box (default hurtbox): the idle pose's figure, trimmed to its core width, in a frame W wide
export function bodyBoxOf(actor, W) {
  const base = actor.anims.find(n => /idle|stand/i.test(n.name)) || actor.anims[0];
  const bbs = base.frames.map(bbox).filter(Boolean); if (!bbs.length) return null;
  const med = k => bbs.map(b => b[k]).sort((p, q) => p - q)[bbs.length >> 1];
  const bh = med('h'), bw = Math.max(2, Math.round(med('w') * .6)), cx = med('x') + med('w') / 2 + (W - base.frames[0].width) / 2;
  return { x: Math.round(cx - bw / 2), y: actor.h - bh, w: bw, h: bh };
}
// hitboxes for an attack: whatever sticks out past the body on each frame (the weapon, the slash); returns how many
export function guessHits(actor, n) {
  let made = 0;
  for (const f of n.frames) {
    const body = bodyBoxOf(actor, f.width); if (!body) break;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < f.height; y++) for (let x = 0; x < f.width; x++) {
      if (f.data[(y * f.width + x) * 4 + 3] < 128 || (x >= body.x - 1 && x < body.x + body.w + 1)) continue;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    const B = (f.boxes ||= { hit: [], hurt: [] });
    B.hit = x1 >= 0 && (x1 - x0 + 1) * (y1 - y0 + 1) >= 6 ? [{ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }] : [];
    if (B.hit.length) made++;
  }
  return made;
}

