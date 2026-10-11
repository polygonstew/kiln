// Stage: the playtest room. The real game (a Godot web build of the asset folder: playbuild.js + play.py) runs in
// the middle. On the left: what goes in the build, the player's numbers tuned live while you play (nothing is saved
// until "Keep in actor"), and buttons that jump to the thing to fix. Below the game: the build log and the game's
// own output. The page talks to the game through the bridge play.py puts in it (postMessage both ways).
import { h, api, toast, on, emit, pref, field, range, select, rawURL, download } from './core.js';
import { S as FS } from './files.js';
import { BRAINS } from './brains.js';
import { listScenes, findPlayer, buildGame } from './playbuild.js';

const GAME = { w: 480, h: 270 };
// what the player's body (juice.gd) takes: [key, label, min, max, step, default, unit]
const BODY = [['max_health', 'Health', 1, 20, 1, 3, 'hits'], ['knockback', 'Knockback', 0, 240, 5, 60, 'px/s'], ['invulnerable_time', 'Safe after a hit', 0, 2, .05, .6, 's']];
const START = [['none', 'Straight into the level'], ['title', 'A plain title screen'], ['menu', 'Your title menu (Menus)']];
const V = {};
let mounted = false, wantBuild = false, busy = false, built = false, live = false, stale = false, rec = null;
let lists = { levels: [], scenes: [], actors: [], huds: [] }, file = { brain: {}, body: {} };
const picks = () => pref.get('stage.build', { start: 'none' });
const setPick = (k, v) => { pref.set('stage.build', { ...picks(), [k]: v }); markStale(true); };
const nameOf = res => (res || '').split('/').pop().replace(/\.tscn$/, '');

on('play', () => { wantBuild = true; if (mounted) build(); });
on('saved', () => { if (mounted && built) markStale(true); });

export const stage = {
  id: 'stage', title: 'Stage', key: '6',
  mount(el) {
    el.className = 'view ws'; el.style.gridTemplateColumns = '290px 1fr'; mounted = true;
    V.left = h('aside', { class: 'l' });
    V.status = h('span', { class: 'mono faint', style: { fontSize: '12px' } });
    V.bar = h('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } });
    V.frame = h('iframe', { title: 'The game', allow: 'autoplay; fullscreen', style: { border: '0', background: '#000', display: 'none', imageRendering: 'pixelated' } });
    V.empty = h('div', { class: 'empty' });
    V.vp = h('div', { class: 'viewport', style: { background: '#0b0b0a' } }, V.frame, V.empty);
    V.blog = h('div'); V.glog = h('div');
    V.log = h('pre', { class: 'play-log', style: { maxHeight: 'none', height: '130px', border: 0 } }, V.blog, V.glog);
    el.append(V.left, h('section', { class: 'stage' },
      h('div', { class: 'bar' }, V.status, h('span', { class: 'grow' }), V.bar),
      V.vp,
      h('div', { class: 'timeline' }, h('div', { class: 'bar', style: { minHeight: '30px', padding: '3px 12px' } }, h('span', { class: 'lbl' }, 'Build log and game output'), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm ghost', title: 'Clear the game output', onclick: () => V.glog.replaceChildren() }, 'Clear')), V.log)));
    new ResizeObserver(fit).observe(V.vp);
    V.frame.addEventListener('load', () => { if (live) V.frame.contentWindow.focus(); });
    window.addEventListener('message', fromGame);
    drawBar(); drawEmpty();
    if (wantBuild) build();
  },
  async show() {
    await drawLeft();
    const st = await api('/api/play/status').catch(() => ({}));
    built = !!st.built;
    if (st.running && !busy) follow();      // a build started elsewhere (or before a reload)
    else if (built && !live && !busy) load();
    drawBar(); drawEmpty();
  },
  hide() { unload(); rec?.stop(); },
};

/* ------------------------------------------------------- the game frame ---- */
function load() { live = true; V.frame.src = '/play/?t=' + Date.now(); V.frame.style.display = ''; V.empty.style.display = 'none'; fit(); }
function unload() { live = false; V.frame.src = 'about:blank'; V.frame.style.display = 'none'; drawEmpty(); }
function fit() {
  if (!V.frame) return;
  const W = V.vp.clientWidth - 24, H = V.vp.clientHeight - 24, z = Math.min(W / GAME.w, H / GAME.h);
  const s = z >= 1 ? Math.max(1, Math.floor(z)) : z;     // whole-number zoom keeps the pixels square
  V.frame.style.width = Math.round(GAME.w * s) + 'px'; V.frame.style.height = Math.round(GAME.h * s) + 'px';
}
function drawEmpty() {
  if (!V.empty) return;
  V.empty.style.display = live ? 'none' : '';
  V.empty.replaceChildren(busy ? h('h2', {}, 'Building…') : h('h2', {}, built ? 'The game is paused' : 'Nothing built yet'),
    h('p', {}, busy ? 'Godot is exporting your asset folder for the web. Watch the log below.' : built ? 'It stops while you are in another area.' : 'Build a small game from your asset folder (the level, player and HUD on the left) and play it right here. It takes 10 s to a minute; your files are only read.'),
    busy ? '' : h('button', { class: 'btn go', title: built ? 'Start the last build again' : 'Build the game with Godot and play it here', onclick: () => built ? load() : build() }, built ? '▶ Play' : '▶ Build and play'));
}
function drawBar() {
  if (!V.bar) return;
  V.status.textContent = busy ? 'building…' : live ? 'playing · click the game for the keys' : built ? 'built' : 'not built yet';
  V.bar.replaceChildren(
    h('button', { class: 'btn sm' + (stale || !built ? ' go' : ''), disabled: busy, title: 'Build the game again from the asset folder (after saving changes in other areas)', onclick: build }, busy ? 'Building…' : built ? (stale ? 'Rebuild •' : 'Rebuild') : '▶ Build'),
    h('button', { class: 'btn sm', disabled: !built || busy, title: 'Start the game over (no rebuild)', onclick: load }, 'Restart'),
    h('button', { class: 'btn sm', disabled: !live, title: 'Save a screenshot of the game (PNG, 3× size)', onclick: () => send('cmd', 'shot') }, 'Screenshot'),
    h('button', { class: 'btn sm' + (rec ? ' go' : ''), disabled: !live, title: rec ? 'Stop and save the video' : 'Record the playtest as a video (WebM, up to 30 s)', onclick: record }, rec ? '■ Stop' : '● Record'),
    h('a', { class: 'btn sm ghost', href: '/play/', target: '_blank', title: 'Open the last build in its own tab' }, 'Open in a tab'));
}
function markStale(v) { stale = v && built; drawBar(); }
const send = (kiln, v) => V.frame.contentWindow?.postMessage({ kiln, v }, location.origin);

function fromGame(e) {
  if (e.source !== V.frame?.contentWindow || !e.data?.kiln) return;
  const { kiln, v } = e.data;
  if (kiln === 'ready') sendTune();
  if (kiln === 'log') logLine(v.k, v.t);
  if (kiln === 'shot') saveShot(v);
}
function logLine(k, t) {
  V.glog.append(h('div', { style: { color: k === 'error' ? 'var(--bad, #e5534b)' : k === 'warn' ? '#d9a54a' : '' } }, t));
  while (V.glog.childElementCount > 300) V.glog.firstChild.remove();
  V.log.scrollTop = V.log.scrollHeight;
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
function saveShot(b64) {
  const img = new Image();
  img.onload = () => {
    const c = h('canvas', { width: img.width * 3, height: img.height * 3 }), x = c.getContext('2d');
    x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, c.width, c.height);
    download(`playtest-${stamp()}.png`, c.toDataURL('image/png')); toast('Screenshot saved', 'ok');
  };
  img.src = 'data:image/png;base64,' + b64;
}
function record() {
  if (rec) return rec.stop();
  const cv = V.frame.contentDocument?.querySelector('canvas');
  if (!cv?.captureStream) return toast('Start the game first', 'bad');
  const chunks = [], mr = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' });
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = () => { rec = null; drawBar(); if (chunks.length) { download(`playtest-${stamp()}.webm`, new Blob(chunks, { type: 'video/webm' })); toast('Video saved', 'ok'); } };
  mr.start(500); rec = mr; drawBar();
  setTimeout(() => rec === mr && mr.stop(), 30000);
  V.frame.contentWindow.focus();
}

/* -------------------------------------------------------------- building ---- */
async function build() {
  wantBuild = false;
  if (busy) return;
  busy = true; unload(); drawBar(); V.blog.textContent = ''; V.glog.replaceChildren();
  const p = picks();
  const ok = await buildGame({ ...p, name: FS.root.split('/').pop() }, lines => { V.blog.textContent = lines.join('\n') + '\n'; V.log.scrollTop = V.log.scrollHeight; });
  done(ok);
}
async function follow() {      // a build already running: show its log until it ends
  busy = true; drawBar(); drawEmpty();
  for (;;) {
    await new Promise(ok => setTimeout(ok, 1200));
    const st = await api('/api/play/status').catch(() => null);
    if (st) V.blog.textContent = st.log.join('\n') + '\n';
    if (st && !st.running) return done(!!st.ok);
  }
}
function done(ok) {
  busy = false; built = built || ok; stale = false;
  if (ok && V.vp.offsetParent) { load(); toast('Built: playing in the Stage', 'ok'); } else if (ok) toast('The game is built: open Stage to play', 'ok'); else toast('The build failed: see the log', 'bad');
  drawBar(); drawEmpty();
}

/* ------------------------------------------------------------ left panel ---- */
async function drawLeft() {
  const [levels, scenes, actors, huds] = await Promise.all(['levels', 'backgrounds', 'sprites', 'hud'].map(listScenes));
  lists = { levels, scenes, actors, huds };
  const p = picks(), fresh = !('player' in p);
  // first visit: the player actor, the first level / background / HUD
  if (fresh) pref.set('stage.build', { ...p, player: await findPlayer(actors), level: levels[0]?.[1] || '', bg: scenes[0]?.[1] || '', hud: huds[0]?.[1] || '' });
  const P = picks();
  const jump = (title, fn, on) => h('button', { class: 'ibtn', title, disabled: !on, onclick: fn }, '↗');
  const row = (label, opts, key, none, title, go, hint) => field(label, h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
    select([['', none], ...opts.map(([n, p]) => [p, n])], P[key] || '', v => { setPick(key, v); drawLeft(); }), jump(title, () => go(nameOf(P[key])), !!P[key])), hint);
  const menus = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/menus')).catch(() => ({ items: [] }));
  V.left.replaceChildren(
    h('div', { class: 'sec' }, h('h3', {}, 'In the game'),
      row('Level', levels, 'level', 'No level (a flat floor)', 'Open this level in Levels', n => emit('open-level', n), levels.length ? '' : 'Save a level in Levels and it appears here'),
      P.level ? '' : row('Background', scenes, 'bg', 'None', 'Open this scene in Scenes', n => emit('open-scene', `${FS.root}/backgrounds/${n}`)),
      row('Player', actors, 'player', 'Nobody', 'Open this actor in Animate', n => emit('open-actor', `${FS.root}/sprites/${n}`), actors.length ? 'Arrows, Space jumps, X attacks, C shoots' : 'Save an actor in Animate and it appears here'),
      row('HUD', huds, 'hud', 'None', 'Open the HUD area', () => emit('tab', 'hud')),
      field('Starts with', select(START.filter(s => s[0] !== 'menu' || (menus.items || []).some(i => i.name === 'title.tscn')), P.start || 'none', v => setPick('start', v))),
      h('p', { class: 'note' }, 'Changes here, or saving in other areas, need a Rebuild. Esc pauses when you have a pause menu.')),
    await tuneSection(nameOf(P.player)));
}

/* ---------------------------------------------------------------- tuning ---- */
// the actor's saved numbers, read from its scene: the root node (juice.gd) and its Brain node
async function readFile(name) {
  const t = name ? await fetch(rawURL(`${FS.root}/sprites/${name}/${name}.tscn`)).then(r => r.ok ? r.text() : '').catch(() => '') : '';
  const block = head => {
    const i = t.indexOf(head), o = {};
    if (i < 0) return o;
    const j = t.indexOf('\n[', i + 1);
    for (const m of t.slice(i, j < 0 ? undefined : j).matchAll(/^(\w+) = (-?[\d.]+)$/gm)) o[m[1]] = +m[2];
    return o;
  };
  return { brain: block('[node name="Brain"'), body: block(`[node name="${name}"`) };
}
const tunes = () => pref.get('stage.tune', {});
function values(name) {       // saved numbers with the playtest changes on top
  const over = tunes()[name] || {}, out = { brain: {}, body: {} };
  for (const [k, , , , , d] of BRAINS.player.params) out.brain[k] = over.brain?.[k] ?? file.brain[k] ?? d;
  for (const [k, , , , , d] of BODY) out.body[k] = over.body?.[k] ?? file.body[k] ?? d;
  return out;
}
function sendTune() { const n = nameOf(picks().player); if (n) send('tune', JSON.stringify(values(n))); }

async function tuneSection(name) {
  if (!name) return h('div', { class: 'sec' }, h('h3', {}, 'Tune the player'), h('p', { class: 'note', style: { marginTop: 0 } }, 'Pick a player to tune how it moves and takes hits.'));
  file = await readFile(name);
  const over = tunes()[name] || { brain: {}, body: {} }, val = values(name), changed = Object.keys(over.brain || {}).length + Object.keys(over.body || {}).length;
  const set = (where, k, v) => {
    const all = tunes(), o = all[name] || { brain: {}, body: {} };
    o[where] = { ...o[where], [k]: v };
    if (v === (file[where][k] ?? null)) delete o[where][k];
    pref.set('stage.tune', { ...all, [name]: o }); sendTune(); drawKeep();
  };
  const slider = (where, [k, label, min, max, step, d, unit]) => field(label, range(val[where][k], min, max, step, v => set(where, k, v), v => unit.length < 6 ? `${v} ${unit}` : v), unit.length < 6 ? '' : unit);
  const keepBox = h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px' } });
  const drawKeep = () => {
    const o = tunes()[name] || {}, n = Object.keys(o.brain || {}).length + Object.keys(o.body || {}).length;
    keepBox.replaceChildren(
      h('button', { class: 'btn sm go', disabled: !n, title: `Write these numbers into ${name} (its Workshop settings) and save it`, onclick: keep }, n ? `Keep in ${name} (${n})` : 'Nothing changed'),
      h('button', { class: 'btn sm ghost', disabled: !n, title: 'Back to the saved numbers', onclick: () => { const all = tunes(); delete all[name]; pref.set('stage.tune', all); sendTune(); drawLeft(); } }, 'Reset'));
  };
  const keep = () => {
    const v = values(name);
    emit('tune-actor', { name, brain: v.brain, react: { health: v.body.max_health, knockback: v.body.knockback, iframes: v.body.invulnerable_time } });
    const all = tunes(); delete all[name]; pref.set('stage.tune', all);
  };
  drawKeep();
  return h('div', { class: 'sec' }, h('h3', {}, 'Tune the player', h('span', { class: 'grow' }), h('small', {}, name + (changed ? ' · changed' : ''))),
    h('p', { class: 'note', style: { marginTop: 0, marginBottom: '8px' } }, 'These change the game while you play. Nothing is saved until Keep.'),
    ...BRAINS.player.params.map(p => slider('brain', p)), ...BODY.map(p => slider('body', p)), keepBox);
}
