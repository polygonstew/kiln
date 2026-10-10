// Procedural background layers. Everything tiles horizontally and is drawn at game resolution.
import { newImg, rgb, mix } from './core.js';

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const put = (im, x, y, c) => { x = ((x % im.width) + im.width) % im.width; if (y < 0 || y >= im.height) return; const i = (y * im.width + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255; };
const col = (im, x, y0, y1, c) => { for (let y = Math.max(0, Math.floor(y0)); y < Math.min(im.height, y1); y++) put(im, x, y, c); };
const rect = (im, x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(im, xx, yy, c); };
// periodic 1D value noise: sums of sines with integer frequencies wrap exactly at the width
function ridge(w, r, oct = 5, rough = 0.55) {
  const out = new Float32Array(w), ph = Array.from({ length: oct * 2 }, () => r() * Math.PI * 2);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = (1 << o) + Math.floor(r() * 2);
    for (let x = 0; x < w; x++) out[x] += amp * (Math.sin(2 * Math.PI * f * x / w + ph[o]) * 0.6 + Math.sin(2 * Math.PI * (f * 2 + 1) * x / w + ph[o + oct]) * 0.4);
    tot += amp; amp *= rough;
  }
  for (let x = 0; x < w; x++) out[x] /= tot;
  return out;
}

/* Each generator: {name, note, params:[[key,label,default,min,max,step|'color']], make(w,h,p)} */
export const GENS = {
  sky: {
    name: 'Sky', note: 'Gradient sky, optional stars and moon', scroll: 0,
    params: [['top', 'Top', '#0d1026', 'color'], ['bottom', 'Horizon', '#5a3a5e', 'color'], ['stars', 'Stars', 40, 0, 300, 1], ['moon', 'Moon', 1, 0, 1, 1], ['seed', 'Seed', 1, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), a = rgb(p.top), b = rgb(p.bottom);
      for (let y = 0; y < h; y++) { const c = mix(a, b, Math.pow(y / (h - 1), 1.4)); for (let x = 0; x < w; x++) put(im, x, y, c); }
      const star = mix(b, [255, 255, 255], .8);
      for (let i = 0; i < p.stars; i++) { const x = Math.floor(r() * w), y = Math.floor(r() * h * .6); put(im, x, y, r() < .2 ? [255, 255, 255] : star); }
      if (p.moon) { const mx = Math.floor(w * (.2 + r() * .5)), my = Math.floor(h * .18), R = Math.max(4, Math.round(h * .07)); const mc = mix(b, [255, 250, 230], .9);
        for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R && (x + R * .35) ** 2 + (y - R * .2) ** 2 > (R * .75) ** 2) put(im, mx + x, my + y, mc); }
      return im;
    },
  },
  mountains: {
    name: 'Mountains', note: 'Jagged ridge with lit edges', scroll: .15,
    params: [['color', 'Rock', '#3b3350', 'color'], ['light', 'Lit edge', '#6c5a7a', 'color'], ['height', 'Height', .55, .1, .95, .01], ['rough', 'Rough', .6, .3, .8, .01], ['seed', 'Seed', 3, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), n = ridge(w, r, 6, p.rough), c = rgb(p.color), l = rgb(p.light);
      for (let x = 0; x < w; x++) {
        const top = h - (p.height * h * (0.55 + 0.45 * n[x]));
        col(im, x, top, h, c);
        const slope = n[(x + 1) % w] - n[x];
        if (slope < 0) col(im, x, top, top + Math.min(4, 1 + Math.round(-slope * 60)), l);
      }
      return im;
    },
  },
  hills: {
    name: 'Hills', note: 'Rolling soft hills', scroll: .35,
    params: [['color', 'Grass', '#2e4a3a', 'color'], ['light', 'Top', '#4b6b4d', 'color'], ['height', 'Height', .35, .1, .8, .01], ['seed', 'Seed', 5, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), n = ridge(w, r, 3, .4), c = rgb(p.color), l = rgb(p.light);
      for (let x = 0; x < w; x++) { const top = h - p.height * h * (.6 + .4 * n[x]); col(im, x, top, h, c); col(im, x, top, top + 2, l); }
      return im;
    },
  },
  city: {
    name: 'City', note: 'Skyline with lit windows and antennas', scroll: .3,
    params: [['color', 'Buildings', '#1c1a26', 'color'], ['window', 'Windows', '#e8b44a', 'color'], ['height', 'Height', .6, .2, .95, .01], ['lit', 'Lit', .25, 0, 1, .01], ['seed', 'Seed', 7, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), wc = rgb(p.window);
      let x = 0;
      while (x < w) {
        const bw = 10 + Math.floor(r() * 26), bh = Math.floor(h * p.height * (.35 + r() * .65));
        const top = h - bh;
        rect(im, x, top, bw, bh, c);
        if (r() < .35) col(im, x + Math.floor(bw / 2), top - 3 - Math.floor(r() * 8), top, c);
        if (r() < .25) rect(im, x + 2, top - 2, bw - 4, 2, c);
        for (let wy = top + 3; wy < h - 3; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (r() < p.lit) put(im, wx, wy, wc);
        x += bw + (r() < .3 ? 1 + Math.floor(r() * 3) : 0);
      }
      return im;
    },
  },
  forest: {
    name: 'Forest', note: 'Pines in a dense row', scroll: .55,
    params: [['color', 'Trees', '#16261f', 'color'], ['light', 'Rim', '#2c4436', 'color'], ['height', 'Height', .5, .15, .95, .01], ['seed', 'Seed', 11, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), l = rgb(p.light);
      for (let i = 0; i < w / 5; i++) {
        const cx = Math.floor(r() * w), th = Math.floor(h * p.height * (.5 + r() * .5)), top = h - th, half = Math.max(3, Math.floor(th / 4.5));
        for (let y = top; y < h; y++) {
          const t = (y - top) / th, wdt = Math.floor(half * t + ((y - top) % 6 < 2 ? 0 : 1));
          for (let dx = -wdt; dx <= wdt; dx++) put(im, cx + dx, y, dx === -wdt && t < .9 ? l : c);
        }
      }
      for (let x = 0; x < w; x++) col(im, x, h - 3, h, c);
      return im;
    },
  },
  cathedral: {
    name: 'Cathedral', note: 'Gothic spires, buttresses and lancet windows', scroll: .25,
    params: [['color', 'Stone', '#1a1518', 'color'], ['window', 'Windows', '#9c2a22', 'color'], ['height', 'Height', .8, .3, .98, .01], ['seed', 'Seed', 13, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), wc = rgb(p.window);
      let x = 0;
      while (x < w) {
        const bw = 18 + Math.floor(r() * 30), bh = Math.floor(h * p.height * (.3 + r() * .5)), top = h - bh;
        rect(im, x, top, bw, bh, c);
        // spire: tall triangle with a cross-arm
        const sx = x + Math.floor(bw / 2), sh = Math.floor(bh * (.4 + r() * .6));
        for (let y = 0; y < sh; y++) { const ww = Math.floor((y / sh) * bw * .22); for (let dx = -ww; dx <= ww; dx++) put(im, sx + dx, top - sh + y, c); }
        rect(im, sx - 2, top - sh - 4, 1, 4, c); rect(im, sx - 3, top - sh - 3, 3, 1, c);
        // flanking pinnacles
        for (const px of [x + 1, x + bw - 2]) { const ph = 4 + Math.floor(r() * 10); for (let y = 0; y < ph; y++) put(im, px, top - y, c); }
        // lancet windows
        const nw = Math.max(1, Math.floor(bw / 7));
        for (let k = 0; k < nw; k++) {
          const wx = x + 3 + k * 7, wy = top + 6, wh = Math.min(bh - 10, 10 + Math.floor(r() * 10));
          if (wx + 3 >= x + bw) break;
          for (let y = 0; y < wh; y++) for (let dx = 0; dx < 3; dx++) if (!(y === 0 && dx !== 1)) put(im, wx + dx, wy + y, wc);
        }
        // rose window on the bigger blocks
        if (bw > 34) { const rx = x + Math.floor(bw / 2), ry = top + Math.floor(bh * .3), R = 4; for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) { const d = xx * xx + yy * yy; if (d <= R * R && (d > 4 || (xx + yy) % 2 === 0)) put(im, rx + xx, ry + yy, wc); } }
        x += bw + Math.floor(r() * 4);
      }
      return im;
    },
  },
  clouds: {
    name: 'Clouds', note: 'Flat-bottomed cloud bank', scroll: .08,
    params: [['color', 'Cloud', '#8b7a96', 'color'], ['shade', 'Shade', '#5d4f6b', 'color'], ['y', 'Height', .35, .05, .9, .01], ['amount', 'Amount', .5, .1, 1, .01], ['seed', 'Seed', 17, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), s = rgb(p.shade), base = Math.floor(h * p.y);
      for (let i = 0; i < w / 30 * p.amount * 3; i++) {
        const cx = Math.floor(r() * w), R = 4 + Math.floor(r() * 12), cy = base - Math.floor(r() * R);
        for (let y = -R; y <= 0; y++) for (let x = -R * 2; x <= R * 2; x++) if ((x / 2) ** 2 + y * y <= R * R) put(im, cx + x, cy + y + R, y > -2 ? s : c);
      }
      return im;
    },
  },
  fog: {
    name: 'Fog band', note: 'Dithered mist, sits between layers', scroll: .45,
    params: [['color', 'Fog', '#9a8fa6', 'color'], ['y', 'Height', .7, .1, 1, .01], ['depth', 'Thickness', .25, .05, .6, .01]],
    make(w, h, p) {
      const im = newImg(w, h), c = rgb(p.color), y0 = Math.floor(h * p.y - h * p.depth), y1 = Math.floor(h * p.y);
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let y = Math.max(0, y0); y < Math.min(h, y1 + Math.floor(h * p.depth * .5)); y++) {
        const t = y < y1 ? (y - y0) / (y1 - y0) : 1 - (y - y1) / (h * p.depth * .5);
        for (let x = 0; x < w; x++) if (B[(y & 3) * 4 + (x & 3)] / 16 < t * .75) put(im, x, y, c);
      }
      return im;
    },
  },
  ground: {
    name: 'Ground', note: 'Walkable ground: uneven top with a lit lip, cobbles, soil and roots, or rubble, and puddles', scroll: 1,
    params: [['color', 'Earth', '#221c1a', 'color'], ['light', 'Top', '#4a3a32', 'color'], ['height', 'Height', .14, .03, .5, .01],
      ['bumps', 'Bumps', .25, 0, 1, .05], ['texture', 'Texture (0 none, 1 cobbles, 2 soil, 3 rubble)', 1, 0, 3, 1], ['puddles', 'Puddles', .2, 0, 1, .05], ['seed', 'Seed', 19, 1, 9999, 1]],
    make(w, h, p) {
      if (p.texture === undefined) {   // ground layers made before these options: draw exactly as they always looked
        const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), l = rgb(p.light), top = h - Math.floor(h * p.height);
        rect(im, 0, top, w, h - top, c);
        for (let x = 0; x < w; x++) { put(im, x, top, l); if (r() < .3) put(im, x, top + 1, l); if (r() < .05) put(im, x, top + 2 + Math.floor(r() * (h - top - 2)), l); }
        return im;
      }
      const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), l = rgb(p.light), dk = mix(c, [0, 0, 0], .45), md = mix(c, l, .35);
      const base = h - Math.floor(h * p.height), amp = Math.max(0, Math.round(p.bumps * Math.min(6, h * p.height * .4)));
      const n = ridge(w, r, 4, .5), top = Array.from({ length: w }, (_, x) => base + Math.round(n[x] * amp));
      for (let x = 0; x < w; x++) {
        col(im, x, top[x], h, c);
        put(im, x, top[x], l);                                           // lit lip
        if (top[x + 1 < w ? x + 1 : 0] > top[x] || r() < .35) put(im, x, top[x] + 1, mix(l, c, .5));
        put(im, x, top[x] + 2, dk);                                      // a thin shadow under the lip
      }
      const tex = Math.round(p.texture);
      if (tex === 1) {        // cobbles: rows of rounded stones, offset every row
        const ch = 4, cw = 7;
        for (let y0 = base + 4, row = 0; y0 < h; y0 += ch, row++) for (let x0 = (row % 2) * 3 - 3; x0 < w; x0 += cw + Math.floor(r() * 2)) {
          for (let x = x0; x < x0 + cw; x++) { put(im, x, y0, dk); if (r() < .5) put(im, x, y0 + 1, md); }
          col(im, x0, y0, y0 + ch, dk);
        }
      } else if (tex === 2) { // soil with roots and stones
        for (let i = 0; i < w / 6; i++) { let x = Math.floor(r() * w), y = base + 3 + Math.floor(r() * (h - base)); const len = 4 + Math.floor(r() * 10); for (let k = 0; k < len; k++) { put(im, x, y, dk); x += r() < .5 ? 1 : -1; y += r() < .6 ? 1 : 0; } }
        for (let i = 0; i < w / 10; i++) { const x = Math.floor(r() * w), y = base + 4 + Math.floor(r() * (h - base)); rect(im, x, y, 2, 1, md); put(im, x, y + 1, dk); }
      } else if (tex === 3) { // rubble: broken blocks with lit tops
        for (let i = 0; i < w / 8; i++) { const x = Math.floor(r() * w), y = base + 3 + Math.floor(r() * (h - base)), bw = 2 + Math.floor(r() * 4), bh = 1 + Math.floor(r() * 3); rect(im, x, y, bw, bh, md); for (let k = 0; k < bw; k++) put(im, x + k, y, l); for (let k = 0; k < bw; k++) put(im, x + k, y + bh, dk); }
      }
      // puddles: flat dark pools on the surface with a reflected light streak
      const pc = mix(dk, [40, 60, 90], .25), shine = mix(l, [200, 220, 255], .4);
      for (let i = 0; i < Math.round(p.puddles * w / 60); i++) {
        const x0 = Math.floor(r() * w), pw = 6 + Math.floor(r() * 14), y = top[x0] + 1;
        for (let x = x0; x < x0 + pw; x++) { put(im, x, y, pc); put(im, x, y + 1, pc); if ((x - x0) % 5 === 2) put(im, x, y, shine); }
      }
      return im;
    },
  },
  fore: {
    name: 'Foreground', note: 'Dark silhouettes in front of the play area: grass, railings, pillars or hanging chains', scroll: 1.3,
    params: [['color', 'Silhouette', '#050406', 'color'], ['kind', 'Kind (0 grass, 1 railings, 2 pillars, 3 chains)', 0, 0, 3, 1], ['density', 'Density', .4, .05, 1, .05],
      ['height', 'Height', .25, .05, .8, .01], ['seed', 'Seed', 41, 1, 9999, 1]],
    make(w, h, p) {
      const im = newImg(w, h), r = rng(p.seed), c = rgb(p.color), edge = mix(c, [255, 255, 255], .22), k = Math.round(p.kind), H = Math.round(h * p.height);
      if (k === 0) {          // tufts of tall grass and weeds along the bottom
        for (let x = 0; x < w; x++) if (r() < p.density) { const t = Math.round(H * (.3 + r() * .7)); let xx = x; for (let y = h - 1; y > h - t; y--) { put(im, xx, y, c); if (r() < .25) xx += r() < .5 ? 1 : -1; } }
        for (let x = 0; x < w; x++) col(im, x, h - 3, h, c);
      } else if (k === 1) {   // iron railings with spear tips and a top bar
        const gap = Math.max(4, Math.round(10 - p.density * 6)), y0 = h - H;
        for (let x = 0; x < w; x += gap) { col(im, x, y0, h, c); put(im, x, y0 - 1, c); put(im, x - 1, y0, c); put(im, x + 1, y0, c); put(im, x, y0 - 2, edge); }
        for (let x = 0; x < w; x++) { put(im, x, y0 + 3, c); put(im, x, h - 6, c); }
      } else if (k === 2) {   // thick pillars / tree trunks passing close to the camera
        const n = Math.max(1, Math.round(p.density * 4));
        for (let i = 0; i < n; i++) { const x0 = Math.floor(i * w / n + r() * w / n * .5), pw = 10 + Math.floor(r() * 18); for (let x = x0; x < x0 + pw; x++) col(im, x, 0, h, c); col(im, x0 + pw - 1, 0, h, edge); }
      } else {                // chains and vines hanging from the top
        for (let x = 2; x < w; x += 2) if (r() < p.density * .5) { const len = Math.round(H * (.4 + r() * .9)); for (let y = 0; y < len; y++) put(im, x, y, (y % 3 === 0) ? edge : c); if (r() < .3) { put(im, x - 1, len, c); put(im, x + 1, len, c); put(im, x, len + 1, c); } }
      }
      return im;
    },
  },
};

/* Ready-made scenes: a stack of generated layers, far to near. */
export const PRESETS = {
  pallid: { name: 'Flesh cathedral', layers: [['sky', { top: '#0a0608', bottom: '#3b1216', stars: 0, moon: 1 }], ['clouds', { color: '#4a1c1f', shade: '#2a0f12', y: .3 }], ['cathedral', { color: '#120c0e', window: '#b3121e', height: .85 }], ['fog', { color: '#5a3436', y: .78 }], ['city', { color: '#0a0708', window: '#7a1018', lit: .12, height: .45 }], ['ground', { color: '#0b0809', light: '#3a2224' }]] },
  dusk: { name: 'Mountain dusk', layers: [['sky', { top: '#1d2340', bottom: '#d9825b', stars: 15, moon: 0 }], ['mountains', { color: '#5a4a6e', light: '#9a6f7e', height: .7 }], ['mountains', { color: '#3a3150', light: '#5a4766', height: .45, seed: 9 }], ['forest', { color: '#1c1a2a', light: '#2e2a40', height: .38 }], ['ground', { color: '#141220', light: '#2e2840' }]] },
  night: { name: 'Night city', layers: [['sky', { top: '#05060f', bottom: '#202650', stars: 120, moon: 1 }], ['city', { color: '#141631', window: '#5e6bb0', lit: .18, height: .7 }], ['fog', { color: '#2e3466', y: .7 }], ['city', { color: '#08080f', window: '#ffcf5c', lit: .3, height: .5, seed: 21 }], ['ground', { color: '#07070c', light: '#262a44' }]] },
  wood: { name: 'Deep wood', layers: [['sky', { top: '#2b4a3c', bottom: '#b8c99a', stars: 0, moon: 0 }], ['hills', { color: '#5b7a5a', light: '#7c9a6d', height: .55 }], ['forest', { color: '#2f4a38', light: '#4a6b4b', height: .7 }], ['fog', { color: '#a6b894', y: .75, depth: .2 }], ['forest', { color: '#14221a', light: '#24372a', height: .55, seed: 31 }], ['ground', { color: '#16201a', light: '#34483a' }]] },
};
