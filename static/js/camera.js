// Camera: how the game's camera follows, in the spirit of Cinemachine. A dead zone (the player moves freely inside it,
// the camera only moves when they leave it), damping (how softly it catches up), look-ahead (it leans the way the
// player runs), a vertical bias, zoom, the mode (follow, room by room, one fixed screen, or scrolling by itself) and
// whether it stays inside the level. The middle shows it live: a runner crossing the screen and the camera answering.
// One setting for the game, and any level can have its own. Save writes camera/camera.json, which main.gd reads.
import { h, api, toast, on, field, range, select, check } from './core.js';
import { saveFiles } from './files.js';
import { projectBar } from './startover.js';
import { P, LOOK } from './gametype.js';
import { listScenes } from './playbuild.js';

const BASE = () => ({ mode: P().camera, dead_w: .2, dead_h: .3, damping: 5, look: 60, bias: 0, zoom: 1, confine: true, scroll: 60 });
const MODES = [['follow', 'Follows the player'], ['rooms', 'Room by room'], ['fixed', 'One fixed screen'], ['scroll', 'Scrolls by itself (runner, shmup)']];
let C = null, which = '', V = {}, mounted = false, raf = 0, t0 = 0, keepT = 0;

export const camera = {
  id: 'camera', title: 'Camera', key: '',
  mount(el) {
    el.className = 'view ws'; mounted = true;
    V.left = h('aside', { class: 'l' }); V.right = h('aside', { class: 'r' });
    V.cv = h('canvas', { class: 'cam-cv' });
    el.append(V.left, h('section', { class: 'stage' }, h('div', { class: 'bar' }, h('span', { class: 'lbl' }, 'How the camera follows (a live sketch)'), h('span', { class: 'grow' }),
      projectBar('camera-game', 'camera setup', { flush: flush, reload: load }),
      h('button', { 'data-file': 'save', 'data-noun': 'camera', class: 'btn sm go', title: 'Write camera/camera.json for the game', onclick: save }, 'Save')), h('div', { class: 'viewport' }, V.cv)), V.right);
    load();
  },
  show() { if (C) draw(); loop(); },
  hide() { cancelAnimationFrame(raf); },
  async saveProject() { await save(); },
};
on('root', () => { if (mounted) load(); });
async function load() {
  C = (await fetch('/api/project?id=camera-game').then(r => r.ok ? r.json() : null).catch(() => null))?.camera || { game: BASE(), levels: {} };
  V.levels = (await listScenes('levels')).map(([n]) => n);
  draw(); loop();
}
const cur = () => which ? (C.levels[which] ||= { ...C.game }) : C.game;
const flush = () => { clearTimeout(keepT); return C ? api('/api/project', { id: 'camera-game', data: { meta: { kind: 'camera', name: 'game' }, camera: C } }) : null; };
const keep = () => { clearTimeout(keepT); keepT = setTimeout(() => api('/api/project', { id: 'camera-game', data: { meta: { kind: 'camera', name: 'game' }, camera: C } }), 400); };

function draw() {
  const S = cur(), set = k => v => { S[k] = v; keep(); if (k === 'mode') draw(); };
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'For'), select([['', 'The whole game'], ...V.levels.map(n => [n, 'Level: ' + n])], which, v => { which = v; draw(); }),
      which ? h('button', { class: 'btn sm ghost', style: { marginTop: '6px' }, title: 'This level goes back to the game\'s camera', onclick: () => { delete C.levels[which]; which = ''; keep(); draw(); } }, 'Use the game\'s camera here') : ''),
    h('div', { class: 'sec' }, h('h3', {}, 'Mode'), select(MODES, S.mode, set('mode')),
      S.mode === 'scroll' ? field('Speed', range(S.scroll, 10, 400, 5, set('scroll'), v => v + ' px/s')) : '',
      field('', check('stays inside the level', S.confine, set('confine')))));
  V.right.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'Dead zone'), h('p', { class: 'note', style: { marginTop: 0 } }, 'The player moves freely inside the box; the camera moves only when they leave it.'),
      field('Width', range(S.dead_w, 0, .8, .02, set('dead_w'), v => Math.round(v * 100) + '%')), field('Height', range(S.dead_h, 0, .8, .02, set('dead_h'), v => Math.round(v * 100) + '%'))),
    h('div', { class: 'sec' }, h('h3', {}, 'Feel'),
      field('Damping', range(S.damping, 1, 20, .5, set('damping')), 'Low = floaty and soft, high = snappy'),
      field('Look-ahead', range(S.look, 0, 300, 5, set('look'), v => v + ' px'), 'Leans the way the player runs'),
      field('Bias', range(S.bias, -.4, .4, .02, set('bias'), v => (v > 0 ? 'lower ' : v < 0 ? 'higher ' : '') + Math.abs(Math.round(v * 100)) + '%'), 'Shows more ground or more sky'),
      field('Zoom', range(S.zoom, .5, 3, .05, set('zoom'), v => v.toFixed(2) + '×'))));
}

// the live sketch: a level strip, a runner going left and right and jumping, and the camera following with these settings
function loop() {
  cancelAnimationFrame(raf);
  const step = now => {
    if (!V.cv.isConnected || !C) return;
    const S = cur(), L0 = LOOK(), vw = L0.w / S.zoom, vh = L0.h / S.zoom, Wd = L0.w * 3, Hd = L0.h * 1.4;
    const vp = V.cv.parentElement, k = Math.min((vp.clientWidth - 40) / Wd, (vp.clientHeight - 40) / Hd);
    V.cv.width = Wd * k; V.cv.height = Hd * k;
    const x = V.cv.getContext('2d'), t = (now - (t0 ||= now)) / 1000;
    const px = Wd / 2 + Math.sin(t * .45) * Wd * .4, vx = Math.cos(t * .45), py = Hd * .78 - Math.max(0, Math.sin(t * 2.2)) * L0.h * .25;
    // where the camera wants to be: the dead zone and look-ahead decide, the damping eases toward it (a sketch of main.gd)
    V.cam ||= { x: px, y: py };
    const want = { x: V.cam.x, y: V.cam.y }, dzw = vw * S.dead_w / 2, dzh = vh * S.dead_h / 2, aim = px + Math.sign(vx) * S.look, aimY = py - vh * S.bias;
    if (S.mode === 'fixed') { want.x = Wd / 2; want.y = Hd - vh / 2; }
    else if (S.mode === 'rooms') { want.x = (Math.floor(px / vw) + .5) * vw; want.y = Hd - vh / 2; }
    else if (S.mode === 'scroll') { want.x = (vw / 2 + (t * S.scroll) % (Wd - vw)); want.y = Hd - vh / 2; }
    else { if (aim > want.x + dzw) want.x = aim - dzw; if (aim < want.x - dzw) want.x = aim + dzw; if (aimY > want.y + dzh) want.y = aimY - dzh; if (aimY < want.y - dzh) want.y = aimY + dzh; }
    const a = 1 - Math.exp(-S.damping / 60);
    V.cam.x += (want.x - V.cam.x) * a; V.cam.y += (want.y - V.cam.y) * a;
    if (S.confine) { V.cam.x = Math.max(vw / 2, Math.min(Wd - vw / 2, V.cam.x)); V.cam.y = Math.max(vh / 2, Math.min(Hd - vh / 2, V.cam.y)); }
    x.setTransform(k, 0, 0, k, 0, 0);
    x.fillStyle = '#121214'; x.fillRect(0, 0, Wd, Hd);
    x.fillStyle = '#26262c'; for (let i = 0; i < Wd; i += 64) x.fillRect(i, Hd * .78 + 2, 60, Hd);          // the ground
    x.fillStyle = '#1b1b20'; for (let i = 0; i < 9; i++) x.fillRect((i * 397) % Wd, Hd * .3 + (i * 131) % (Hd * .4), 120, 18);
    const cx = V.cam.x - vw / 2, cy = V.cam.y - vh / 2, ac = getComputedStyle(document.documentElement).getPropertyValue('--ember').trim() || '#ff5b2e';
    x.fillStyle = '#ffffff08'; x.fillRect(cx, cy, vw, vh);
    x.lineWidth = 3 / k; x.strokeStyle = ac; x.strokeRect(cx, cy, vw, vh);                                   // the screen
    if (S.mode === 'follow') { x.setLineDash([8 / k, 6 / k]); x.strokeStyle = '#ffffff55'; x.strokeRect(V.cam.x - dzw, V.cam.y + vh * S.bias - dzh, dzw * 2, dzh * 2); x.setLineDash([]); }
    x.fillStyle = '#e6e2d6'; x.fillRect(px - 10, py - 40, 20, 40);                                           // the runner
    if (S.look && S.mode === 'follow') { x.strokeStyle = ac + '88'; x.beginPath(); x.moveTo(px, py - 20); x.lineTo(px + Math.sign(vx) * S.look, py - 20); x.stroke(); }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

async function save() {
  clearTimeout(keepT); await api('/api/project', { id: 'camera-game', data: { meta: { kind: 'camera', name: 'game' }, camera: C } });
  await saveFiles('camera', [{ name: 'camera.json', text: JSON.stringify(C, null, 1) + '\n' }]);
  toast('Saved camera/camera.json', 'ok');
}
