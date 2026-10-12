// What the game itself says, for the Game doc: the cast (each actor's role, description and first frame), the levels,
// scenes, HUDs, dialogues, Logic graphs, item icons, the controls and the style bible. Read from the asset folder when
// the doc opens (actor projects are cached by their save time, they can be large).
import { api } from './core.js';
import { S as FS } from './files.js';
import { ACTIONS } from './input_godot.js';
import { STYLE } from './style.js';

const ENEMY = ['enemy', 'boss', 'flyer'];
const cache = new Map();          // actor project id → { mtime, actor summary }
const ls = async p => ((await api('/api/fs?path=' + encodeURIComponent(p)).catch(() => ({ items: [] }))).items || []);
export const raw = p => '/api/fs/raw?path=' + encodeURIComponent(p);

async function actorOf(p) {
  const c = cache.get(p.id);
  if (c && c.mtime === p.mtime) return c.a;
  const d = await fetch('/api/project?id=' + encodeURIComponent(p.id)).then(r => r.ok ? r.json() : null).catch(() => null);
  const x = d?.actor || {};
  const a = { name: x.name || p.name, role: x.role || (x.kind === 'creature' ? 'enemy' : 'hero'), kind: x.kind || 'character', desc: x.desc || '', anims: (x.anims || []).map(n => n.name) };
  cache.set(p.id, { mtime: p.mtime, a });
  return a;
}
// an actor's first frame as a CSS background (its idle strip, saved for Godot), or null
export async function thumb(name) {
  const m = await fetch(raw(`${FS.root}/sprites/${name}/manifest.json`)).then(r => r.ok ? r.json() : null).catch(() => null);
  const a = m?.anims && (m.anims.idle || Object.values(m.anims)[0]);
  return a ? { backgroundImage: `url("${raw(`${FS.root}/sprites/${name}/${a.file}`)}")`, backgroundSize: `${a.frames * 100}% 100%` } : null;
}

export async function gameFacts() {
  const projects = await api('/api/projects').catch(() => []);
  const names = k => projects.filter(p => p.kind === k).map(p => p.name).sort();
  const cast = [];
  for (const p of projects.filter(p => p.kind === 'actor')) cast.push(await actorOf(p));
  const icons = [];
  for (const set of (await ls(FS.root + '/icons')).filter(i => i.dir))
    for (const f of (await ls(set.path)).filter(i => /\.png$/.test(i.name) && i.name !== 'sheet.png')) icons.push({ name: f.name.replace('.png', ''), path: f.path });
  return {
    cast, enemies: cast.filter(a => ENEMY.includes(a.role)),
    levels: names('level'), scenes: names('scene'), huds: names('hud'), dialogues: names('dialogue'), graphs: names('graph'), menus: names('menus').length > 0,
    icons, controls: ACTIONS.map(([id, what, keys, pad]) => ({ id, what, keys, pad })),
    style: { name: STYLE.name, words: STYLE.words, light: STYLE.light, hw: STYLE.hw, palette: STYLE.palette || [] },
  };
}

// pictures that can be the key art: each scene (drawn from its layers) and each actor
export const keyArtChoices = f => [...f.scenes.map(n => ({ kind: 'scene', name: n, label: 'Scene: ' + n })), ...f.cast.map(a => ({ kind: 'actor', name: a.name, label: 'Actor: ' + a.name }))];

// a scene's first screen, drawn from its saved layers (backgrounds/<scene>/scene.json), as a canvas; null if not saved
export async function sceneShot(name) {
  const dir = `${FS.root}/backgrounds/${name}`, s = await fetch(raw(dir + '/scene.json')).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!s?.layers) return null;
  const W = s.view?.w || 480, H = s.view?.h || 270, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  for (const L of s.layers.filter(l => l.visible !== false && l.file)) {
    const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = raw(`${dir}/${L.file}`); });
    if (!img) continue;
    x.globalAlpha = L.opacity ?? 1;
    x.globalCompositeOperation = { glow: 'lighter', light: 'screen', shade: 'multiply' }[L.blend] || 'source-over';
    x.drawImage(img, 0, L.y || 0, L.w || img.width, L.h || img.height);
  }
  return cv;
}
// an actor's first idle frame, scaled up by whole steps to fill a box, as a canvas
export async function actorShot(name, box = 256) {
  const m = await fetch(raw(`${FS.root}/sprites/${name}/manifest.json`)).then(r => r.ok ? r.json() : null).catch(() => null);
  const a = m?.anims && (m.anims.idle || Object.values(m.anims)[0]);
  if (!a) return null;
  const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = raw(`${FS.root}/sprites/${name}/${a.file}`); });
  if (!img) return null;
  const k = Math.max(1, Math.floor(box / Math.max(m.w, m.h))), cv = document.createElement('canvas'); cv.width = m.w * k; cv.height = m.h * k;
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, m.w, m.h, 0, 0, cv.width, cv.height);
  return cv;
}
