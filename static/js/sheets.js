// Animation sets and sheet templates: what animations an actor needs, how many frames each, how wide,
// and a template image with one box per frame to draw or generate into. A filled template comes back
// in by exact boxes: nothing is guessed, nothing is cut off, and art that spills past a box is reported.
import { h, crop, bbox, keyBackground, resizeNN } from './core.js';

// [name, frames, boxes wide, fps, loops]
export const SETS = {
  hero: { name: 'Metroidvania hero', note: 'Full move set for a soulslike platformer lead', anims: [
    ['idle', 6, 1, 8, true], ['walk', 8, 1, 10, true], ['run', 8, 1, 12, true], ['jump', 3, 1, 10, false], ['fall', 2, 1, 8, true],
    ['land', 2, 1, 12, false], ['attack', 6, 2, 12, false], ['attack2', 6, 2, 12, false], ['dodge', 6, 2, 14, false],
    ['hurt', 3, 1, 10, false], ['death', 8, 2, 8, false], ['crouch', 2, 1, 8, false], ['climb', 4, 1, 8, true], ['heal', 6, 1, 8, false]] },
  enemy: { name: 'Ground enemy', note: 'Walker / brute', anims: [
    ['idle', 4, 1, 6, true], ['walk', 6, 1, 8, true], ['attack', 6, 2, 10, false], ['hurt', 2, 1, 8, false], ['death', 6, 2, 8, false]] },
  flyer: { name: 'Flying enemy', note: 'Bat, drone, wraith', anims: [
    ['fly', 6, 1, 10, true], ['attack', 6, 2, 12, false], ['hurt', 2, 1, 8, false], ['death', 6, 1, 8, false]] },
  boss: { name: 'Boss', note: 'Big moves need the 2-wide box', anims: [
    ['idle', 6, 2, 6, true], ['walk', 8, 2, 8, true], ['attack', 8, 2, 10, false], ['attack2', 8, 2, 10, false],
    ['special', 10, 2, 10, false], ['stagger', 4, 2, 8, false], ['death', 12, 2, 8, false]] },
  npc: { name: 'NPC', note: 'Townsfolk, merchant', anims: [['idle', 4, 1, 4, true], ['talk', 4, 1, 6, true], ['react', 3, 1, 8, false]] },
  prop: { name: 'Animated prop', note: 'Torch, chest, door', anims: [['loop', 4, 1, 8, true], ['open', 5, 1, 10, false], ['broken', 1, 1, 1, false]] },
};

// One row per animation; a label band above each row; gaps between boxes so a border never touches art.
const M = 8, LBL = 15, GAP = 6;
export function layout(actor) {
  const rows = [];
  let y = M, W = 0;
  for (const n of actor.anims) {
    const fw = actor.w * (n.span || 1), cells = [];
    let x = M;
    for (let i = 0; i < n.frames.length; i++) { cells.push({ x, y: y + LBL, w: fw, h: actor.h }); x += fw + GAP; }
    rows.push({ name: n.name, cells, labelY: y });
    W = Math.max(W, x - GAP + M);
    y += LBL + actor.h + GAP;
  }
  return { w: Math.max(W, 64), h: y - GAP + M, rows };
}

// Template PNG: white boxes (draw or generate inside them), grey frame lines in the gaps, labels above.
export function makeTemplate(actor, { withArt = true, scale = 1 } = {}) {
  const L = layout(actor), cv = document.createElement('canvas');
  cv.width = L.w * scale; cv.height = L.h * scale;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#d9d9d6'; x.fillRect(0, 0, cv.width, cv.height);
  x.font = `${9 * scale}px monospace`; x.textBaseline = 'top';
  L.rows.forEach((r, ri) => {
    const n = actor.anims[ri];
    x.fillStyle = '#3a3a38';
    x.fillText(`${r.name}  ·  ${r.cells.length} frames${(n.span || 1) > 1 ? `  ·  ${n.span} wide` : ''}  ·  ${n.fps} fps`, M * scale, (r.labelY + 1) * scale);
    r.cells.forEach((c, i) => {
      x.fillStyle = '#ffffff'; x.fillRect(c.x * scale, c.y * scale, c.w * scale, c.h * scale);
      x.strokeStyle = '#8a8a86'; x.lineWidth = 1; x.strokeRect(c.x * scale - .5, c.y * scale - .5, c.w * scale + 1, c.h * scale + 1);
      if (withArt && n.frames[i] && bbox(n.frames[i])) x.drawImage(scaleUp(n.frames[i], scale), c.x * scale, c.y * scale);
      // centre tick under the box, floor tick to its left: just outside the box, so they guide without getting into the art
      x.fillStyle = '#c0392b';
      x.fillRect((c.x + c.w / 2) * scale - scale, (c.y + c.h + 2) * scale, 2 * scale, 2 * scale);
      x.fillRect((c.x - 3) * scale, (c.y + c.h) * scale - scale, 2 * scale, scale);
    });
  });
  return { canvas: cv, layout: L };
}
function scaleUp(f, k) {
  const c = document.createElement('canvas'); c.width = f.width * k; c.height = f.height * k;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const s = document.createElement('canvas'); s.width = f.width; s.height = f.height; s.getContext('2d').putImageData(f, 0, 0);
  x.drawImage(s, 0, 0, c.width, c.height); return c;
}

// Cut a filled template back into frames. The image may be the template at any whole or fractional scale
// (an AI redraw at 1024 px, say). Returns {frames: [[ImageData]], spill: ['walk 3', …], scale}.
export function readTemplate(img, actor) {
  const L = layout(actor), k = img.width / L.w;
  if (Math.abs(img.height / L.h - k) > 0.03 * k) throw new Error(`This image is ${img.width}×${img.height}; the template for ${actor.name} is ${L.w}×${L.h} (or a scaled copy). Did the animations change since it was made?`);
  const d = img.data, near = (i, c, t) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) <= t;
  const spill = [], frames = [];
  L.rows.forEach(r => {
    frames.push(r.cells.map((c, i) => {
      const X = Math.round(c.x * k), Y = Math.round(c.y * k), W = Math.round(c.w * k), H = Math.round(c.h * k);
      // the box's white is background when it reaches the box edge (flood), so enclosed white (eyes, glints) stays
      let cell = keyBackground(crop(img, X, Y, W, H), 30);
      if (Math.abs(k - 1) > 0.01) cell = resizeNN(cell, c.w, c.h);
      // a thin ring just outside the box should be template grey or frame line; anything else spilled out
      const ring = Math.max(2, Math.round(2 * k));
      let out = 0;
      for (let y = Y - ring; y < Y + H + ring; y++) for (let x = X - ring; x < X + W + ring; x++) {
        if (x >= X && y >= Y && x < X + W && y < Y + H) { x = X + W - 1; continue; }
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const j = (y * img.width + x) * 4;
        if (d[j + 3] >= 128 && !near(j, [217, 217, 214], 60) && !near(j, [138, 138, 134], 60) && !near(j, [255, 255, 255], 30) && !near(j, [58, 58, 56], 24) && !near(j, [192, 57, 43], 12)) out++;
      }
      if (out > (W + H) * 0.08) spill.push(`${r.name} ${i + 1}`);
      return bbox(cell) ? cell : null;     // empty box: keep the frame that is already there
    }));
  });
  return { frames, spill, scale: k };
}

export function download(canvas, name) {
  const a = h('a', { href: canvas.toDataURL('image/png'), download: name });
  document.body.append(a); a.click(); a.remove();
}
