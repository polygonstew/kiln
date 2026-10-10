// Motion generators: turn one drawn frame into a starting animation.
// They do the mechanical part (timing, offsets, squash, dissolves) so you only touch up.
import { newImg, cloneImg, bbox, blit, crop, resizeNN, flipX, BAYER4, luma } from './core.js';

const get = (im, x, y) => { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return null; const i = (y * im.width + x) * 4; return im.data[i + 3] < 128 ? null : [im.data[i], im.data[i + 1], im.data[i + 2]]; };
const set = (im, x, y, c) => { if (x < 0 || y < 0 || x >= im.width || y >= im.height) return; const i = (y * im.width + x) * 4; if (!c) { im.data[i + 3] = 0; return; } im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; };
const wave = (k, n) => (1 - Math.cos(2 * Math.PI * k / n)) / 2;      // 0..1..0 over a loop

// Scale the sprite about its feet (bottom centre of its bounding box).
function squash(im, sx, sy) {
  const b = bbox(im); if (!b) return cloneImg(im);
  const part = crop(im, b.x, b.y, b.w, b.h);
  const w = Math.max(1, Math.round(b.w * sx)), hh = Math.max(1, Math.round(b.h * sy));
  const o = newImg(im.width, im.height);
  return blit(o, resizeNN(part, w, hh), Math.round(b.x + b.w / 2 - w / 2), b.y + b.h - hh);
}

export const MOTIONS = [
  {
    id: 'breathe', name: 'Breathe', note: 'Idle: the upper body sinks a pixel and rises', anim: 'idle', fps: 6,
    params: [['frames', 'Frames', 4, 2, 8, 1], ['amp', 'Pixels', 1, 1, 3, 1], ['waist', 'Waist line', 0.55, 0.3, 0.8, 0.05]],
    make(im, p) {
      const b = bbox(im); if (!b) return [im];
      const waist = b.y + Math.round(b.h * p.waist);
      return Array.from({ length: p.frames }, (_, k) => {
        const off = Math.round(p.amp * wave(k, p.frames));
        const o = cloneImg(im);
        if (!off) return o;
        for (let y = waist; y >= b.y - off; y--) for (let x = 0; x < im.width; x++) set(o, x, y, get(im, x, y - off));
        return o;
      });
    },
  },
  {
    id: 'bob', name: 'Hover', note: 'Floating things: the whole sprite drifts up and down', anim: 'idle', fps: 8,
    params: [['frames', 'Frames', 6, 2, 12, 1], ['amp', 'Pixels', 2, 1, 6, 1]],
    make(im, p) { return Array.from({ length: p.frames }, (_, k) => blit(newImg(im.width, im.height), im, 0, -Math.round(p.amp * Math.sin(2 * Math.PI * k / p.frames)))); },
  },
  {
    id: 'walk', name: 'Walk', note: 'Scissors the legs below the hips and bobs the body. A rough base to touch up', anim: 'walk', fps: 8,
    params: [['frames', 'Frames', 6, 4, 8, 2], ['stride', 'Stride', 2, 1, 5, 1], ['hip', 'Hip line', 0.6, 0.4, 0.8, 0.05]],
    make(im, p) {
      const b = bbox(im); if (!b) return [im];
      const hip = b.y + Math.round(b.h * p.hip), cx = b.x + b.w / 2, legH = b.y + b.h - hip;
      return Array.from({ length: p.frames }, (_, k) => {
        const ph = Math.sin(2 * Math.PI * k / p.frames);
        const bob = Math.abs(Math.cos(2 * Math.PI * k / p.frames)) > 0.7 ? 0 : 1;   // body dips while legs pass
        const o = newImg(im.width, im.height);
        // body
        for (let y = b.y; y < hip; y++) for (let x = b.x; x < b.x + b.w; x++) set(o, x, y + bob, get(im, x, y));
        // legs: the half of the leg area in front of the centre swings one way, the back half the other
        for (let y = hip; y < b.y + b.h; y++) {
          const depth = (y - hip + 1) / legH;
          for (let x = b.x; x < b.x + b.w; x++) {
            const c = get(im, x, y); if (!c) continue;
            const side = x >= cx ? 1 : -1;
            const dx = Math.round(side * ph * p.stride * depth);
            const lift = side * ph > 0.3 && depth > 0.7 ? -1 : 0;
            set(o, x + dx, y + lift + (y === hip ? bob : 0), c);
          }
        }
        return o;
      });
    },
  },
  {
    id: 'jump', name: 'Jump arc', note: 'Crouch, stretch up, hang, stretch down, land', anim: 'jump', fps: 10,
    params: [['amt', 'Squash', 0.15, 0.05, 0.3, 0.01]],
    make(im, p) {
      const a = p.amt;
      return [[1, 1], [1 + a, 1 - a], [1 - a * .6, 1 + a], [1, 1], [1 - a * .4, 1 + a * .7], [1 + a * 1.2, 1 - a * 1.2], [1 + a * .4, 1 - a * .4], [1, 1]].map(([sx, sy]) => squash(im, sx, sy));
    },
  },
  {
    id: 'lunge', name: 'Lunge', note: 'Attack: lean back to wind up, snap forward, recover', anim: 'attack', fps: 14,
    params: [['reach', 'Reach', 3, 1, 8, 1]],
    make(im, p) {
      const b = bbox(im); if (!b) return [im];
      const lean = (shiftTop, dx) => {
        const o = newImg(im.width, im.height);
        for (let y = 0; y < im.height; y++) {
          const t = b.h ? clampN((b.y + b.h - y) / b.h, 0, 1) : 0;
          const s = Math.round(shiftTop * t) + dx;
          for (let x = 0; x < im.width; x++) { const c = get(im, x, y); if (c) set(o, x + s, y, c); }
        }
        return o;
      };
      const r = p.reach;
      return [lean(0, 0), lean(-Math.ceil(r / 2), 0), lean(-r, -1), lean(r, Math.ceil(r / 2)), lean(r, r), lean(Math.ceil(r / 2), Math.ceil(r / 2)), lean(0, 1), lean(0, 0)];
    },
  },
  {
    id: 'hit', name: 'Hurt', note: 'Flash white, knocked back, settle', anim: 'hurt', fps: 12,
    params: [['back', 'Knockback', 2, 1, 6, 1]],
    make(im, p) {
      const white = cloneImg(im);
      for (let i = 0; i < white.data.length; i += 4) if (white.data[i + 3] >= 128) white.data[i] = white.data[i + 1] = white.data[i + 2] = 255;
      return [white, blit(newImg(im.width, im.height), im, -p.back, 0), blit(newImg(im.width, im.height), im, -Math.ceil(p.back / 2), 0), cloneImg(im)];
    },
  },
  {
    id: 'death', name: 'Dissolve', note: 'Death: slumps and breaks apart in an ordered pattern', anim: 'death', fps: 10,
    params: [['frames', 'Frames', 7, 3, 12, 1], ['fall', 'Slump', 0.25, 0, 0.6, 0.05]],
    make(im, p) {
      return Array.from({ length: p.frames }, (_, k) => {
        const t = k / (p.frames - 1);
        const o = squash(im, 1 + p.fall * t * 0.6, 1 - p.fall * t);
        if (t > 0.15) for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) if (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5 < (t - 0.15) / 0.85) set(o, x, y, null);
        return o;
      });
    },
  },
  {
    id: 'spin', name: 'Spin', note: 'Coins and pickups: turns around its middle, darker on the back', anim: 'spin', fps: 12,
    params: [['frames', 'Frames', 8, 4, 12, 2]],
    make(im, p) {
      const b = bbox(im); if (!b) return [im];
      const part = crop(im, b.x, b.y, b.w, b.h), back = flipX(part);
      for (let i = 0; i < back.data.length; i += 4) for (let c = 0; c < 3; c++) back.data[i + c] = Math.round(back.data[i + c] * 0.6);
      return Array.from({ length: p.frames }, (_, k) => {
        const c = Math.cos(2 * Math.PI * k / p.frames), w = Math.max(1, Math.round(Math.abs(c) * b.w));
        return blit(newImg(im.width, im.height), resizeNN(c >= 0 ? part : back, w, b.h), Math.round(b.x + b.w / 2 - w / 2), b.y);
      });
    },
  },
  {
    id: 'shake', name: 'Shake', note: 'Tremble, charge-up, or being hit hard', anim: 'shake', fps: 20,
    params: [['frames', 'Frames', 4, 2, 8, 1], ['amp', 'Pixels', 1, 1, 3, 1]],
    make(im, p) { const seq = [[1, 0], [-1, 0], [0, -1], [-1, 1], [1, 1], [0, 0], [1, -1], [-1, -1]]; return Array.from({ length: p.frames }, (_, k) => blit(newImg(im.width, im.height), im, seq[k % 8][0] * p.amp, seq[k % 8][1] * p.amp)); },
  },
  {
    id: 'blink', name: 'Flicker', note: 'Invulnerable after a hit: visible, gone, visible', anim: 'flicker', fps: 15,
    params: [['frames', 'Frames', 2, 2, 6, 1]],
    make(im, p) { return Array.from({ length: p.frames }, (_, k) => k % 2 ? newImg(im.width, im.height) : cloneImg(im)); },
  },
  {
    id: 'cycle', name: 'Colour cycle', note: 'Fire, water, magic: the brightest colours rotate', anim: 'glow', fps: 10,
    params: [['frames', 'Frames', 4, 2, 8, 1], ['n', 'Colours', 4, 2, 8, 1]],
    make(im, p) {
      const cols = new Map();
      for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) cols.set(im.data[i] << 16 | im.data[i + 1] << 8 | im.data[i + 2], 1);
      const ramp = [...cols.keys()].map(k => [k >> 16 & 255, k >> 8 & 255, k & 255]).sort((a, b) => luma(b) - luma(a)).slice(0, p.n);
      const key = c => c[0] << 16 | c[1] << 8 | c[2];
      const idx = new Map(ramp.map((c, i) => [key(c), i]));
      return Array.from({ length: p.frames }, (_, k) => {
        const o = cloneImg(im);
        for (let i = 0; i < o.data.length; i += 4) if (o.data[i + 3] >= 128) {
          const j = idx.get(o.data[i] << 16 | o.data[i + 1] << 8 | o.data[i + 2]);
          if (j === undefined) continue;
          const c = ramp[(j + k) % ramp.length]; o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2];
        }
        return o;
      });
    },
  },
  {
    id: 'turn', name: 'Rotate 90°', note: 'Thrown weapons and projectiles: four quarter turns', anim: 'spin', fps: 12,
    params: [],
    make(im) {
      const out = [cloneImg(im)];
      let cur = im;
      for (let r = 0; r < 3; r++) {
        const o = newImg(im.width, im.height), n = Math.min(im.width, im.height), ox = (im.width - n) >> 1, oy = (im.height - n) >> 1;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) set(o, ox + n - 1 - y, oy + x, get(cur, ox + x, oy + y));
        out.push(o); cur = o;
      }
      return out;
    },
  },
];
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
