// Effect sprites: hit sparks, slashes, dust, explosions, sparkles and impact rings, drawn by code at game size
// in a 3-colour set (hot, mid, dark). Each effect is a one-shot animation; in Godot it is a scene that plays where
// it is placed and removes itself (_kiln/actor/vfx.gd). Actors spawn theirs on a hit, projectiles on impact.
import { h, newImg, toDataURL, toCanvas, toast, api } from './core.js';
import { writeRuntime, rtRes } from './layout.js';
import { saveFiles, S as FS } from './files.js';

export const COLOURS = {
  fire: [[255, 255, 220], [255, 196, 60], [214, 78, 30]], ice: [[240, 255, 255], [140, 220, 255], [60, 118, 220]],
  magic: [[255, 232, 255], [198, 120, 255], [108, 50, 200]], blood: [[255, 228, 228], [220, 40, 40], [118, 12, 22]],
  dust: [[232, 222, 202], [170, 155, 130], [108, 94, 80]], electric: [[255, 255, 255], [255, 248, 120], [118, 178, 255]],
};
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const put = (im, x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < im.width && y < im.height) im.data.set([c[0], c[1], c[2], 255], (y * im.width + x) * 4); };
const disc = (im, cx, cy, r, c, keep = () => true) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && keep(x, y)) put(im, x, y, c); };
const ring = (im, cx, cy, r, w, c) => { for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d > r - w) put(im, x, y, c); } };
const line = (im, x0, y0, x1, y1, c) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let i = 0; i <= n; i++) put(im, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const fade = k => (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + .5) / 16 >= k;      // ordered-dither fade: k = 0 solid … 1 gone

// kind → (size, [hot, mid, dark], rnd) → frames
export const KINDS = {
  spark(s, [H, M], r) {
    const c = s / 2, rays = Array.from({ length: 6 + Math.floor(r() * 4) }, (_, i) => ({ a: (i / 7 + r() * .12) * Math.PI * 2, l: .7 + r() * .5 }));
    return Array.from({ length: 6 }, (_, t) => {
      const im = newImg(s, s);
      if (t < 2) disc(im, c, c, s * (t ? .1 : .18), t ? M : H);
      for (const q of rays) { const r0 = s * .07 * (t + .5) * q.l, r1 = r0 + s * .2 * q.l * (1 - t / 6); if (t < 5) line(im, c + Math.cos(q.a) * r0, c + Math.sin(q.a) * r0, c + Math.cos(q.a) * r1, c + Math.sin(q.a) * r1, t < 2 ? H : M); }
      return im;
    });
  },
  slash(s, [H, M, D]) {
    // a crescent swept across the frame: grows, sweeps, thins out; thickest in its middle
    const cx = s * .18, cy = s / 2, R = s * .62, W = s * .16;
    const spans = [[-1, -.45], [-1, .15], [-.8, .85], [-.15, 1], [.5, 1]];
    return spans.map(([a0, a1], t) => {
      const im = newImg(s, s), w = W * [1, 1, .9, .6, .35][t];
      for (let a = a0; a <= a1; a += .01) {
        const k = Math.sin(Math.PI * (a - a0) / (a1 - a0)) * w;
        for (let d = 0; d < k; d++) put(im, cx + Math.cos(a) * (R - d), cy + Math.sin(a) * (R - d), d < 1.5 ? H : t > 2 ? D : M);
      }
      return im;
    });
  },
  dust(s, [, M, D], r) {
    const puffs = Array.from({ length: 4 }, (_, i) => ({ dx: (i - 1.5) * .22 + (r() - .5) * .1, up: .1 + r() * .15, r: .1 + r() * .06 }));
    return Array.from({ length: 6 }, (_, t) => {
      const im = newImg(s, s), k = t / 6;
      for (const p of puffs) disc(im, s / 2 + p.dx * s * (1 + k * 1.2), s * (.8 - p.up * k * 1.5), s * p.r * (1 + k * .9), t < 3 ? M : D, fade(Math.max(0, k - .25) * 1.4));
      return im;
    });
  },
  explosion(s, [H, M, D], r) {
    // flash → fireball → breaks into puffs that rise and dither away
    const c = s / 2, puffs = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 + r() * .6; return { x: Math.cos(a) * .2, y: Math.sin(a) * .2, r: .12 + r() * .06 }; });
    return Array.from({ length: 8 }, (_, t) => {
      const im = newImg(s, s);
      if (t === 0) disc(im, c, c, s * .14, H);
      else if (t < 3) { disc(im, c, c, s * (.24 + t * .09), M); disc(im, c, c, s * (.15 + t * .05), H); }
      else {
        const k = (t - 3) / 4;
        for (const p of puffs) disc(im, c + p.x * s * (1 + k), c + p.y * s * (1 + k) - k * s * .12, s * p.r * (1 + k * .5), k < .4 ? M : D, fade(Math.max(0, k - .15) * 1.2));
        if (t < 5) disc(im, c, c, s * .1 * (5 - t), H);
      }
      return im;
    });
  },
  sparkle(s, [H, M], r) {
    const c = s / 2, dots = Array.from({ length: 3 }, () => [c + (r() - .5) * s * .7, c + (r() - .5) * s * .7]);
    return Array.from({ length: 6 }, (_, t) => {
      const im = newImg(s, s), k = [1, 2, 3, 3, 2, 1][t] * s / 16;
      line(im, c - k * 2, c, c + k * 2, c, t > 3 ? M : H); line(im, c, c - k * 2, c, c + k * 2, t > 3 ? M : H);
      if (t === 2 || t === 3) { line(im, c - k, c - k, c + k, c + k, M); line(im, c - k, c + k, c + k, c - k, M); put(im, c, c, H); }
      dots.forEach(([x, y], i) => { if ((t + i) % 3 === 0) put(im, x, y, M); });
      return im;
    });
  },
  ring(s, [H, M, D]) {
    return Array.from({ length: 5 }, (_, t) => { const im = newImg(s, s); ring(im, s / 2, s / 2, s * (.12 + t * .09), t < 2 ? 2 : 1, [H, M, M, D, D][t]); return im; });
  },
};
export const VFX_KINDS = Object.keys(KINDS);
export const makeFrames = (v, size = v.size || 24) => KINDS[v.kind](size, COLOURS[v.colours] || COLOURS.fire, rng(v.seed || 1));
export const newVfx = (kind = 'spark', colours = 'fire', size = 24) => ({ kind, colours, size, seed: Math.floor(Math.random() * 1e9) });

// frames → strip PNG + a scene that plays once and frees itself; `res` = where the files will be (res:// or relative)
// base: where the asset folder sits in the Godot project ('' or 'res://…/'), for the shared vfx.gd
export function vfxFiles(name, v, res, base) {
  const fr = makeFrames(v), s = v.size || 24, strip = newImg(s * fr.length, s);
  fr.forEach((f, i) => { for (let y = 0; y < s; y++) strip.data.set(f.data.subarray(y * s * 4, (y + 1) * s * 4), (y * strip.width + i * s) * 4); });
  const subs = fr.map((_, i) => `[sub_resource type="AtlasTexture" id="f${i}"]\natlas = ExtResource("1")\nregion = Rect2(${i * s}, 0, ${s}, ${s})\n\n`).join('');
  const anim = `[{"frames": [${fr.map((_, i) => `{"duration": 1.0, "texture": SubResource("f${i}")}`).join(', ')}], "loop": false, "name": &"default", "speed": 16.0}]`;
  const tscn = `[gd_scene load_steps=${fr.length + 4} format=3]\n\n[ext_resource type="Texture2D" path="${res}/${name}.png" id="1"]\n[ext_resource type="Script" path="${rtRes(base, 'vfx')}" id="2"]\n\n${subs}`
    + `[sub_resource type="SpriteFrames" id="sf"]\nanimations = ${anim}\n\n[node name="${name}" type="AnimatedSprite2D"]\ntexture_filter = 1\nsprite_frames = SubResource("sf")\nscript = ExtResource("2")\n`;
  return [{ name: name + '.png', b64: toDataURL(strip) }, { name: name + '.tscn', text: tscn }];
}
export const VFX_GD = `extends AnimatedSprite2D
## Kiln effect: plays once where it is placed, then removes itself. Spawn it with:
##   var e = preload("res://…/vfx_hit.tscn").instantiate(); get_parent().add_child(e); e.global_position = where

func _ready() -> void:
\tanimation_finished.connect(queue_free)
\tplay("default")
`;

// a small looping preview of an effect
export function vfxPreview(v, scale = 3) {
  const fr = makeFrames(v), s = v.size || 24, cv = h('canvas', { width: s, height: s, class: 'vfx-pv', style: { width: s * scale + 'px', height: s * scale + 'px' } });
  let i = 0; const x = cv.getContext('2d');
  const tick = () => { if (!cv.isConnected && i > 0) return; x.clearRect(0, 0, s, s); x.drawImage(toCanvas(fr[i % fr.length]), 0, 0); i++; setTimeout(tick, i % fr.length ? 70 : 400); };
  tick(); return cv;
}
// kind / colours / size pickers + 🎲 for one effect slot
export function vfxRow(label, v, set, remove) {
  const sel = (opts, val, f) => h('select', { onchange: e => f(e.target.value) }, ...opts.map(o => h('option', { value: o, selected: String(o) === String(val) }, o)));
  return h('div', { class: 'vfx-row' }, vfxPreview(v),
    h('div', { class: 'vfx-c' }, h('b', {}, label),
      h('div', { class: 'vfx-s' }, sel(VFX_KINDS, v.kind, k => set({ ...v, kind: k })), sel(Object.keys(COLOURS), v.colours, c => set({ ...v, colours: c })), sel([16, 24, 32, 48], v.size, z => set({ ...v, size: +z })),
        h('button', { class: 'btn sm ghost', title: 'Another variation', onclick: () => set({ ...v, seed: Math.floor(Math.random() * 1e9) }) }, '🎲'),
        remove ? h('button', { class: 'ibtn', title: 'No effect', onclick: remove }, '✕') : '')));
}

// Tools → Effects…: make loose effects (pickups, doors, magic) into vfx/<name>/
export function openVfxDesigner() {
  let v = newVfx();
  const name = h('input', { type: 'text', value: 'spark', style: { width: '150px' } }), body = h('div', { class: 'body' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(520px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Effects'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')), body));
  const draw = () => body.replaceChildren(vfxRow('Effect', v, n => { if (n.kind !== v.kind) name.value = n.kind; v = n; draw(); }),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' } }, h('span', { class: 'faint' }, 'vfx/'), name, h('span', { class: 'grow' }),
      h('button', { class: 'btn go', onclick: async () => {
        const n = name.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'effect';
        const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
        const base = g.root ? 'res://' + FS.root.slice(g.root.length + 1) + '/' : '';
        await writeRuntime({ vfx: VFX_GD });
        await saveFiles(`vfx/${n}`, vfxFiles(n, v, base + `vfx/${n}`, base));
        toast(`Saved vfx/${n}/${n}.tscn`, 'ok');
      } }, 'Save')),
    h('p', { class: 'note' }, 'A one-shot animation. In Godot, instance vfx/<name>.tscn where it should happen; it plays and removes itself.'));
  draw(); document.body.append(m);
}
