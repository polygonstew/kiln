// Bitmap text: draw, measure, and build BMFont atlases from the bundled fonts.
import { FONTS } from './fonts.js';
export { FONTS };

export function measure(text, font = 'body', spacing = 0) {
  const F = FONTS[font];
  let w = 0, line = 0, lines = 1;
  for (const ch of text) {
    if (ch === '\n') { w = Math.max(w, line); line = 0; lines++; continue; }
    const g = F.glyphs[ch] || F.glyphs['?'];
    line += g[0] + spacing;
  }
  w = Math.max(w, line);
  return { w: Math.max(0, w - spacing), h: lines * F.h + (lines - 1) * 1, lineH: F.h + 1 };
}

// Plot glyph pixels with a callback (x, y). Used for fill, shadow and outline passes.
function plot(text, font, spacing, cb) {
  const F = FONTS[font];
  let x = 0, y = 0;
  for (const ch of text) {
    if (ch === '\n') { x = 0; y += F.h + 1; continue; }
    const g = F.glyphs[ch] || F.glyphs['?'];
    for (let r = 0; r < F.h; r++) {
      const bits = g[r + 1];
      if (!bits) continue;
      for (let c = 0; c < F.w; c++) if (bits >> (F.w - 1 - c) & 1) cb(x + c, y + r);
    }
    x += g[0] + spacing;
  }
}

/* Draw text into a 2D context at (x, y) (top-left), integer scale, crisp.
   opts: {font, color, scale, spacing, shadow: color, outline: color, align: 'left'|'center'|'right', width} */
export function drawText(ctx, text, x, y, opts = {}) {
  const font = opts.font || 'body', s = opts.scale || 1, sp = opts.spacing || 0;
  const m = measure(text, font, sp);
  if (opts.align === 'center') x -= Math.floor(m.w * s / 2);
  if (opts.align === 'right') x -= m.w * s;
  const dot = c => (px, py) => { ctx.fillStyle = c; ctx.fillRect(x + px * s, y + py * s, s, s); };
  if (opts.outline) {
    const o = dot(opts.outline);
    plot(text, font, sp, (px, py) => { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) o(px + dx, py + dy); });
  }
  if (opts.shadow) plot(text, font, sp, (px, py) => dot(opts.shadow)(px + 1, py + 1));
  plot(text, font, sp, dot(opts.color || '#fff'));
  return m;
}

/* BMFont (text format) atlas for engines: Godot, Unity (with a plugin), LÖVE, MonoGame.
   Returns {canvas, fnt}. */
export function buildBMFont(font, { color = '#ffffff', outline = null, shadow = null, name = font } = {}) {
  const F = FONTS[font];
  const chars = Object.keys(F.glyphs);
  const pad = (outline ? 1 : 0) + (shadow ? 1 : 0);
  const cw = F.w + pad * 2, ch = F.h + pad * 2;
  const cols = 16, rows = Math.ceil(chars.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * cw; cv.height = rows * ch;
  const x = cv.getContext('2d');
  const lines = [];
  chars.forEach((c, i) => {
    const gx = (i % cols) * cw, gy = Math.floor(i / cols) * ch;
    drawText(x, c, gx + pad, gy + pad, { font, color, outline, shadow });
    const adv = F.glyphs[c][0];
    lines.push(`char id=${c.charCodeAt(0)} x=${gx} y=${gy} width=${cw} height=${ch} xoffset=${-pad} yoffset=${-pad} xadvance=${adv} page=0 chnl=15`);
  });
  const fnt = [
    `info face="${name}" size=${F.h} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=0,0 outline=${outline ? 1 : 0}`,
    `common lineHeight=${F.h + 1} base=${F.base} scaleW=${cv.width} scaleH=${cv.height} pages=1 packed=0`,
    `page id=0 file="${name}.png"`,
    `chars count=${chars.length}`,
    ...lines, '',
  ].join('\n');
  return { canvas: cv, fnt };
}
