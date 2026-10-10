// Animation previewer: plays any set of animations, used by Files and Animate.
import { h, $, api, rawURL, imgData, crop, checker, pref, clamp, toCanvas } from './core.js';
import { icon } from './icons.js';

const BGS = [['checker', 'Checker'], ['#000000', 'Black'], ['#ffffff', 'White'], ['#5f6b5c', 'Field'], ['#2b3a55', 'Night']];

export class Player {
  /* anims: [{name, fps, loop, frames: [ImageData|canvas]}] */
  constructor({ compact = false, height = 260, onFrame = null } = {}) {
    this.anims = []; this.cur = 0; this.i = 0; this.playing = true; this.dir = 1;
    this.pingpong = false; this.onion = false; this.flip = false; this.bounds = false;
    this.zoom = 0; this.bg = pref.get('player.bg', 'checker'); this.onFrame = onFrame; this.speed = 1;
    this.cv = h('canvas');
    this.scr = h('div', { class: 'scr', style: { height: height + 'px' } }, this.cv);
    this.fr = h('span', { class: 'fr' });
    const tb = (ic, title, fn, get) => { const b = h('button', { class: 'ibtn', title, onclick: () => { fn(); this.syncBtns(); } }, icon(ic)); b._get = get; return b; };
    this.btns = [
      tb('prev', 'Previous frame ( , )', () => { this.playing = false; this.step(-1); }),
      this.playBtn = h('button', { class: 'ibtn', title: 'Play / pause (space)', onclick: () => { this.playing = !this.playing; this.syncBtns(); } }),
      tb('next', 'Next frame ( . )', () => { this.playing = false; this.step(1); }),
      tb('pingpong', 'Ping-pong: play forward then back', () => this.pingpong = !this.pingpong, () => this.pingpong),
      tb('onion', 'Onion skin: show the frame before', () => this.onion = !this.onion, () => this.onion),
      tb('flip', 'Face the other way', () => this.flip = !this.flip, () => this.flip),
      tb('grid', 'Show frame bounds and baseline', () => this.bounds = !this.bounds, () => this.bounds),
    ];
    this.speedSel = h('select', { style: { width: '64px' }, title: 'Playback speed', onchange: () => this.speed = +this.speedSel.value },
      ...[[.25, '¼×'], [.5, '½×'], [1, '1×'], [2, '2×']].map(([v, l]) => h('option', { value: v }, l)));
    this.speedSel.value = 1;
    this.zoomSel = h('select', { style: { width: '66px' }, title: 'Zoom', onchange: () => { this.zoom = +this.zoomSel.value; this.draw(); } },
      h('option', { value: 0 }, 'Fit'), ...[1, 2, 3, 4, 6, 8, 12].map(z => h('option', { value: z }, z + '×')));
    this.bgSel = h('select', { style: { width: '78px' }, title: 'Background', onchange: () => { this.bg = this.bgSel.value; pref.set('player.bg', this.bg); this.draw(); } },
      ...BGS.map(([v, l]) => h('option', { value: v }, l)));
    this.bgSel.value = this.bg;
    this.list = h('div', { class: 'anims' });
    this.el = h('div', { class: 'player' }, this.scr,
      h('div', { class: 'ctl' }, ...this.btns, this.fr, h('span', { style: { flex: 1 } }), this.speedSel, this.zoomSel, compact ? null : this.bgSel),
      this.list);
    this.syncBtns();
    this.t = performance.now(); this.acc = 0;
    const tick = now => {
      if (!this.el.isConnected) { this.raf = requestAnimationFrame(tick); return; }
      const a = this.anims[this.cur];
      if (a && this.playing && a.frames.length > 1) {
        this.acc += (now - this.t) / 1000 * this.speed;
        const dt = 1 / (a.fps || 8);
        let n = 0;
        while (this.acc >= dt && n++ < 8) { this.acc -= dt; this.advance(); }
      }
      this.t = now;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    new ResizeObserver(() => this.draw()).observe(this.scr);
  }
  syncBtns() {
    this.playBtn.replaceChildren(icon(this.playing ? 'pause' : 'play'));
    for (const b of this.btns) if (b._get) b.classList.toggle('on', !!b._get());
  }
  set(anims, keepName = true) {
    const prev = this.anims[this.cur]?.name;
    this.anims = anims || [];
    let k = keepName ? this.anims.findIndex(a => a.name === prev) : -1;
    this.cur = k >= 0 ? k : 0;
    if (this.i >= (this.anims[this.cur]?.frames.length || 0)) this.i = 0;
    this.drawList(); this.draw();
  }
  select(i) { this.cur = i; this.i = 0; this.dir = 1; this.acc = 0; this.drawList(); this.draw(); }
  drawList() {
    this.list.replaceChildren(...this.anims.map((a, i) => h('button', { class: i === this.cur ? 'on' : '', onclick: () => this.select(i) },
      a.name, h('small', {}, `${a.frames.length}f · ${a.fps}fps${a.loop === false ? ' · once' : ''}`))));
    this.list.style.display = this.anims.length > 1 ? '' : 'none';
  }
  advance() {
    const a = this.anims[this.cur]; if (!a) return;
    const n = a.frames.length;
    if (this.pingpong && n > 1) {
      let j = this.i + this.dir;
      if (j >= n || j < 0) { this.dir *= -1; j = this.i + this.dir; }
      this.i = j;
    } else if (this.i + 1 >= n) {
      if (a.loop === false) { this.hold = (this.hold || 0) + 1; if (this.hold > Math.max(2, a.fps / 2)) { this.hold = 0; this.i = 0; } }
      else this.i = 0;
    } else this.i++;
    this.draw();
  }
  step(d) { const a = this.anims[this.cur]; if (!a) return; this.i = (this.i + d + a.frames.length) % a.frames.length; this.draw(); }
  draw() {
    const a = this.anims[this.cur];
    const W = this.scr.clientWidth || 300, H = this.scr.clientHeight || 200;
    const cv = this.cv, x = cv.getContext('2d');
    cv.width = W; cv.height = H;
    if (this.bg === 'checker') checker(x, W, H, 8); else { x.fillStyle = this.bg; x.fillRect(0, 0, W, H); }
    if (!a || !a.frames.length) { this.fr.textContent = '—'; return; }
    const f0 = a.frames[0], fw = f0.width, fh = f0.height;
    const z = this.zoom || Math.max(1, Math.floor(Math.min((W - 16) / fw, (H - 16) / fh)));
    const ox = Math.floor((W - fw * z) / 2), oy = Math.floor((H - fh * z) / 2);
    x.imageSmoothingEnabled = false;
    const put = (f, alpha) => {
      const c = f instanceof ImageData ? toCanvas(f) : f;
      x.save(); x.globalAlpha = alpha;
      if (this.flip) { x.translate(ox + fw * z, oy); x.scale(-1, 1); x.drawImage(c, 0, 0, fw * z, fh * z); }
      else x.drawImage(c, ox, oy, fw * z, fh * z);
      x.restore();
    };
    if (this.onion && a.frames.length > 1) put(a.frames[(this.i - 1 + a.frames.length) % a.frames.length], .28);
    put(a.frames[this.i] || f0, 1);
    if (this.bounds) {
      x.strokeStyle = '#ff5b2e'; x.lineWidth = 1;
      x.strokeRect(ox - .5, oy - .5, fw * z + 1, fh * z + 1);
      x.strokeStyle = '#9cc76b88'; x.beginPath(); x.moveTo(ox, oy + fh * z - .5); x.lineTo(ox + fw * z, oy + fh * z - .5); x.stroke();
    }
    this.fr.textContent = `${this.i + 1}/${a.frames.length}  ${fw}×${fh}  ${z}×`;
    if (this.onFrame) this.onFrame(this.i);
  }
  destroy() { cancelAnimationFrame(this.raf); }
}

/* Read an actor folder: manifest.json {w,h,anims:{name:{file,frames,fps,loop}}} with one
   horizontal strip PNG per animation (Pallid Mask / Kiln layout). */
export async function loadActor(dir) {
  const man = await (await fetch(rawURL(dir + '/manifest.json'))).json();
  const anims = [];
  for (const [name, a] of Object.entries(man.anims || {})) {
    try {
      const im = await imgData(rawURL(dir + '/' + (a.file || name + '.png')));
      const w = man.w || Math.floor(im.width / (a.frames || 1)), hh = man.h || im.height;
      const n = a.frames || Math.max(1, Math.floor(im.width / w));
      const frames = [];
      for (let i = 0; i < n; i++) frames.push(crop(im, i * w, 0, w, hh));
      anims.push({ name, fps: a.fps || 8, loop: a.loop !== false, frames });
    } catch { }
  }
  return { name: dir.split('/').pop(), w: man.w, h: man.h, anims, manifest: man };
}

// Slice a plain image into frames: a horizontal strip of square-ish frames, or a grid.
export function sliceGrid(im, cols, rows) {
  const fw = Math.floor(im.width / cols), fh = Math.floor(im.height / rows), out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(crop(im, c * fw, r * fh, fw, fh));
  return out;
}
export function guessStrip(im) {
  // a strip of square frames is the most common layout
  if (im.width > im.height * 1.5 && im.width % im.height === 0) return { cols: im.width / im.height, rows: 1 };
  return { cols: 1, rows: 1 };
}
