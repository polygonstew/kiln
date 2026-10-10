// Stage: drive an exported actor around a saved scene with the HUD on top.
// The strip underneath shows which animation is playing, its frames and timing.
import { $, h, api, toast, on, pref, clamp, field, select, check, toCanvas, imgData, rawURL, checker } from './core.js';
import { loadActor } from './player.js';
import { S as FS } from './files.js';

const ACTIONS = [['idle', 'Idle', 'idle|stand'], ['walk', 'Walk', 'walk'], ['run', 'Run', 'run|dash'], ['jump', 'Jump', 'jump|fall'], ['attack', 'Attack', 'attack|strike|slash|lunge'],
  ['hurt', 'Hurt', 'hurt|hit|damage'], ['crouch', 'Crouch', 'crouch|duck'], ['death', 'Death', 'death|die|dissolve']];
const KEYS = '← → walk · Shift run · Space / ↑ jump · Z attack · X hurt · ↓ crouch · K death';
let V = {}, actor = null, scene = null, hudImg = null, map = pref.get('stage.map', {}), st = null, keys = new Set(), mounted = false;
let scale = pref.get('stage.scale', 0), showBoxes = pref.get('stage.boxes', false);

export const stage = {
  id: 'stage', title: 'Stage', key: '6',
  mount(el) {
    el.className = 'view ws'; el.style.gridTemplateColumns = '280px 1fr'; mounted = true;
    V.left = h('aside', { class: 'l' });
    V.cv = h('canvas', { tabIndex: 0, style: { outline: 'none' } });
    V.vp = h('div', { class: 'viewport', style: { background: '#0b0b0a' } }, V.cv);
    V.strip = h('div', { class: 'frames', style: { minHeight: '84px' } });
    V.state = h('span', { class: 'mono', style: { fontSize: '12px' } });
    el.append(V.left, h('section', { class: 'stage' },
      h('div', { class: 'bar' }, V.state, h('span', { class: 'grow' }), h('span', { class: 'note', style: { margin: 0 } }, KEYS)),
      V.vp, h('div', { class: 'timeline' }, V.strip)));
    el.tabIndex = -1;
    const down = e => {
      if (e.target.matches('input,select,textarea')) return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'z', 'x', 'k', 'shift'].includes(k)) { keys.add(k); e.preventDefault(); }
      if (st && (k === ' ' || k === 'arrowup') && st.ground) { st.vy = -st.jumpV; st.ground = false; }
      if (st && k === 'z' && !st.lock) lockTo('attack');
      if (st && k === 'x' && !st.lock) lockTo('hurt');
      if (st && k === 'k') lockTo(st.act === 'death' ? 'idle' : 'death');
    };
    el.addEventListener('keydown', down);
    el.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());
    new ResizeObserver(() => draw()).observe(V.vp);
    let last = performance.now();
    const tick = t => { const dt = Math.min(.05, (t - last) / 1000); last = t; if (el.classList.contains('on')) { step(dt); draw(); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    drawLeft();
  },
  show() { drawLeft(); setTimeout(() => $('#v-stage')?.focus(), 30); },
};
on('saved', () => { if (mounted) drawLeft(); });

/* ------------------------------------------------------------ loading ---- */
async function listDirs(sub) {
  const r = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + sub)).catch(() => ({ items: [] }));
  return r.items.filter(i => i.dir && i.ok);
}
async function drawLeft() {
  const [actors, scenes] = await Promise.all([listDirs('sprites'), listDirs('backgrounds')]);
  const huds = (await api('/api/fs?path=' + encodeURIComponent(FS.root + '/hud')).catch(() => ({ items: [] }))).items.filter(i => i.dir);
  const cur = pref.get('stage.pick', {});
  // first visit: start with something on stage rather than an empty floor
  if (!('actor' in cur) && actors.length) cur.actor = actors[0].path;
  if (!('scene' in cur) && scenes.length) cur.scene = scenes[0].path;
  const mapBox = h('div');
  const drawMap = () => {
    if (!actor) { mapBox.replaceChildren(h('p', { class: 'note' }, 'Pick an actor to see how its animations map to actions.')); return; }
    const names = actor.anims.map(a => a.name);
    mapBox.replaceChildren(...ACTIONS.map(([k, l]) => field(l, select([['', '— none —'], ...names.map(n => [n, n])], animFor(k)?.name || '', v => { map[actor.name] = { ...(map[actor.name] || {}), [k]: v }; pref.set('stage.map', map); }))));
  };
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'On stage'),
      field('Actor', select([['', 'Pick…'], ...actors.map(a => [a.path, a.name])], cur.actor || '', async v => { pref.set('stage.pick', { ...pref.get('stage.pick', {}), actor: v }); await pickActor(v); drawMap(); })),
      field('Scene', select([['', 'Plain floor'], ...scenes.map(a => [a.path, a.name])], cur.scene || '', v => { pref.set('stage.pick', { ...pref.get('stage.pick', {}), scene: v }); pickScene(v); })),
      field('HUD', select([['', 'None'], ...huds.map(a => [a.path, a.name])], cur.hud || '', v => { pref.set('stage.pick', { ...pref.get('stage.pick', {}), hud: v }); pickHud(v); })),
      field('Zoom', select([[0, 'Fit'], [1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], scale, v => { scale = +v; pref.set('stage.scale', scale); })),
      field('Show', check('frame boxes', showBoxes, v => { showBoxes = v; pref.set('stage.boxes', v); })),
      actors.length ? null : h('p', { class: 'note' }, 'Save an actor from Animate and it appears here.')),
    h('div', { class: 'sec' }, h('h3', {}, 'Actions → animations'), mapBox,
      h('p', { class: 'note' }, 'Matched by name; change any here. Looping animations repeat, one-shots (attack, hurt, death) play once and hand back control.')),
    h('div', { class: 'sec' }, h('h3', {}, 'How it plays'),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Each frame shows for 1 ÷ fps seconds. An 8-frame walk at 8 fps takes one second per cycle; the timing strip below lights the frame on screen and shows its duration. If feet slide, the walk fps and the walk speed disagree: speed ≈ stride ÷ cycle time.')));
  if (cur.actor && !actor) { await pickActor(cur.actor); drawMap(); } else drawMap();
  if (cur.scene && !scene) pickScene(cur.scene);
  if (cur.hud && !hudImg) pickHud(cur.hud);
}
async function pickActor(p) {
  if (!p) { actor = null; st = null; return; }
  try {
    actor = await loadActor(p); actor.name = p.split('/').pop();
    const view = scene?.view || { w: 384, h: 216 };
    st = { x: view.w / 2, y: 0, vx: 0, vy: 0, face: 1, ground: true, act: 'idle', t: 0, lock: null, jumpV: 230, speed: 60 };
  } catch { toast('Could not load that actor', 'bad'); }
}
async function pickScene(p) {
  if (!p) { scene = null; return; }
  try {
    const sj = await (await fetch(rawURL(p + '/scene.json'))).json();
    for (const l of sj.layers) l.cv = toCanvas(await imgData(rawURL(p + '/' + l.file)));
    scene = sj;
  } catch { toast('Could not load that scene', 'bad'); }
}
async function pickHud(p) { hudImg = null; if (!p) return; try { hudImg = toCanvas(await imgData(rawURL(p + '/hud.png'))); } catch { } }

/* ------------------------------------------------------------- update ---- */
function animFor(k) {
  if (!actor) return null;
  const m = map[actor.name]?.[k];
  if (m) return actor.anims.find(a => a.name === m) || null;
  const re = new RegExp(ACTIONS.find(a => a[0] === k)[2], 'i');
  return actor.anims.find(a => re.test(a.name)) || null;
}
function lockTo(k) {
  const a = animFor(k); if (!a) return toast(`No ${k} animation mapped`);
  st.lock = k; st.act = k; st.t = 0;
}
function floorY() {
  if (!scene) return (V.view?.h || 216) - 16;
  const g = scene.layers.filter(l => l.scroll >= 1).pop();
  if (!g) return scene.view.h - 8;
  // first opaque row of the ground layer under the actor is the floor
  const x = g.cv.getContext('2d'), col = Math.floor(scene.view.w / 2) % g.cv.width;
  const d = x.getImageData(col, 0, 1, g.cv.height).data;
  for (let y = 0; y < g.cv.height; y++) if (d[y * 4 + 3] > 128) return g.y + y;
  return scene.view.h - 8;
}
function step(dt) {
  if (!st || !actor) return;
  const run = keys.has('shift'), l = keys.has('arrowleft'), r = keys.has('arrowright'), crouch = keys.has('arrowdown');
  if (!st.lock || st.lock === 'attack' && !st.ground) {
    const sp = (run ? 2.1 : 1) * st.speed;
    st.vx = (r ? sp : 0) - (l ? sp : 0);
    if (st.vx) st.face = Math.sign(st.vx);
  } else st.vx = 0;
  if (crouch && st.ground && !st.lock) st.vx = 0;
  st.vy += 620 * dt; st.y += st.vy * dt; st.x += st.vx * dt;
  if (st.y >= 0) { st.y = 0; st.vy = 0; st.ground = true; } else st.ground = false;
  // choose the animation
  let want = st.lock || (!st.ground ? 'jump' : crouch ? 'crouch' : st.vx ? (run ? 'run' : 'walk') : 'idle');
  if (!animFor(want)) want = want === 'run' ? 'walk' : want === 'crouch' ? 'idle' : want;
  if (!animFor(want)) want = 'idle';
  if (want !== st.act) { st.act = want; st.t = 0; }
  st.t += dt;
  const a = animFor(st.act);
  if (a && st.lock && a.loop === false && st.t >= a.frames.length / a.fps) { if (st.lock !== 'death') { st.lock = null; st.t = 0; } else st.t = (a.frames.length - .01) / a.fps; }
  else if (a && st.lock && a.loop !== false && st.t >= a.frames.length / a.fps) { st.lock = null; st.t = 0; }
}
/* --------------------------------------------------------------- draw ---- */
let lastStrip = '';
function draw() {
  if (!V.cv) return;
  const view = scene?.view || { w: 384, h: 216 };
  V.view = view;
  const W = V.vp.clientWidth - 24, H = V.vp.clientHeight - 24;
  const zf = Math.min(W / view.w, H / view.h), z = scale || (zf >= 2 ? Math.floor(zf) : Math.max(.5, zf));
  V.cv.width = view.w; V.cv.height = view.h; V.cv.style.width = Math.round(view.w * z) + 'px'; V.cv.style.height = Math.round(view.h * z) + 'px';
  const x = V.cv.getContext('2d'); x.imageSmoothingEnabled = false;
  const camX = st ? st.x - view.w / 2 : 0;
  if (scene) {
    x.fillStyle = '#000'; x.fillRect(0, 0, view.w, view.h);
    for (const l of scene.layers) {
      if (l.visible === false) continue;
      let ox = -camX * l.scroll;
      if (l.repeat !== false) { const w = l.cv.width; ox = ((ox % w) + w) % w - w; for (; ox < view.w; ox += w) x.drawImage(l.cv, Math.round(ox), l.y); }
      else x.drawImage(l.cv, Math.round(ox), l.y);
    }
  } else {
    checker(x, view.w, view.h, 8, '#20201e', '#262624');
    x.fillStyle = '#3a3936'; x.fillRect(0, floorY(), view.w, view.h);
    x.fillStyle = '#4c4a45'; for (let gx = -((camX % 16) + 16) % 16; gx < view.w; gx += 16) x.fillRect(Math.round(gx), floorY(), 1, 3);
  }
  if (actor && st) {
    const a = animFor(st.act) || actor.anims[0];
    const fi = a.loop === false || st.lock ? Math.min(a.frames.length - 1, Math.floor(st.t * a.fps)) : Math.floor(st.t * a.fps) % a.frames.length;
    const f = a.frames[fi], c = toCanvas(f);
    const fx = Math.round(view.w / 2 - f.width / 2), fy = Math.round(floorY() + st.y - f.height + 1);
    x.save();
    if (st.face < 0) { x.translate(fx + f.width, fy); x.scale(-1, 1); x.drawImage(c, 0, 0); } else x.drawImage(c, fx, fy);
    x.restore();
    if (showBoxes) { x.strokeStyle = '#ff5b2e'; x.lineWidth = 1; x.strokeRect(fx + .5, fy + .5, f.width - 1, f.height - 1); }
    V.state.textContent = `${st.act} → "${a.name}" · frame ${fi + 1}/${a.frames.length} · ${a.fps} fps · ${(1000 / a.fps).toFixed(0)} ms each · ${(a.frames.length / a.fps).toFixed(2)} s ${a.loop === false ? 'once' : 'loop'}${st.ground ? '' : ' · airborne'}`;
    const key = a.name + fi;
    if (key !== lastStrip) {
      lastStrip = key;
      const th = 56, zz = th / f.height;
      V.strip.replaceChildren(...a.frames.map((fr, i) => {
        const cc = toCanvas(fr); cc.style.height = th + 'px'; cc.style.width = Math.round(fr.width * zz) + 'px';
        return h('div', { class: 'frame' + (i === fi ? ' on' : '') }, cc, h('span', { class: 'n' }, `${i + 1} · ${(1000 / a.fps).toFixed(0)}ms`));
      }));
    }
  } else V.state.textContent = 'Pick an actor on the left';
  if (hudImg) x.drawImage(hudImg, 0, 0);
}
