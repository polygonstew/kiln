// Point & click templates: pick a kit (adventure_kits.js: The Last Light, Star Janitor, Bayou Noir), look at every
// picture it uses (rooms, people, items) and keep it, make a new one from the same description with your generator,
// pick your own picture, or cut one out of a sheet; then Kiln builds the whole game from it in a new folder: rooms
// with their walk areas and hotspots, people who walk (a few frames made from the one picture), items with pictures,
// the conversations, the menus and the flow, all in the Modern look.
import { h, toast, imgData, uid } from './core.js';
import { enqueue } from './queue.js';
import { KITS } from './adventure_kits.js';
import { pickPicture, pickFromSheet } from './pictures.js';
import { cutout } from './cutout.js';
import { newGameFolder } from './demo_paths.js';
import { DEFAULTS as MENU_DEFAULTS } from './menus.js';

const ART = name => `/templates/${name}.webp`;
const STYLE = 'Modern hand-painted 2D video game art, soft lighting, rich colour, clean readable shapes, no text, no UI, no watermark.';
const W = 1280, H = 720;

export async function openAdventureKits() {
  const desc = await fetch('/templates/art.json').then(r => r.json()).catch(() => ({}));
  let kitId = 'lighthouse';
  const pics = {};                         // art name → the URL to use (the kit's own unless changed)
  const body = h('div', { class: 'body' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(980px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Point & click: start from a kit'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
  const slots = K => [...K.rooms.map(r => [r.art, 'Room: ' + r.name, 'room']), [K.hero.art, 'Hero: ' + K.hero.name, 'person'], ...K.npcs.map(n => [n.art, 'Person: ' + n.name, 'person']),
    ...K.items.map(([id, name, , art]) => [art, 'Item: ' + name, 'item'])];
  // a new picture from the same description, through Kiln's generator queue (the job tray shows it)
  async function remake(art) {
    const d = desc[art]; if (!d) return toast('No description for that picture', 'bad');
    const [a, b] = d.aspect.split(':').map(Number), w = a >= b ? 1024 : Math.round(1024 * a / b / 8) * 8, hh = a >= b ? Math.round(1024 * b / a / 8) * 8 : 1024;
    toast('Making a new picture (see the job tray)…');
    const job = enqueue({ engine: 'cloud', engine_hint: d.aspect === '16:9' ? 'scene' : 'sprite', prompt: `${d.prompt} ${STYLE}`, neg: '', w, h: hh, batch: 1, steps: 4, fast: true, seed: -1 }, 'Template: ' + art);
    const [url] = await job.done; pics[art] = url; draw();
  }
  function draw() {
    const K = KITS[kitId];
    body.replaceChildren(
      h('div', { class: 'kit-cards' }, ...Object.entries(KITS).map(([id, k]) => h('button', { class: 'kit-card' + (id === kitId ? ' on' : ''), onclick: () => { kitId = id; draw(); } },
        h('img', { src: pics[k.rooms[0].art] || ART(k.rooms[0].art) }), h('b', {}, k.title), h('small', {}, k.blurb), h('i', {}, 'Feels like ' + k.like)))),
      h('h3', { style: { margin: '16px 0 4px' } }, 'Its pictures'),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Keep them, make new ones from the same description, or use your own: a picture, or one cut out of a sheet. People and items lose their plain background by themselves; for people, a side view facing right works best (see the character guide).'),
      h('div', { class: 'kit-slots' }, ...slots(K).map(([art, label, kind]) => h('div', { class: 'kit-slot k-' + kind },
        h('img', { src: pics[art] || ART(art), title: desc[art]?.prompt || '' }), h('b', {}, label),
        h('span', {}, h('button', { class: 'btn sm ghost', title: 'Make a new picture from the same description', onclick: () => remake(art) }, 'New'),
          h('button', { class: 'btn sm ghost', title: 'Your own picture', onclick: () => pickPicture(label, u => { pics[art] = u; draw(); }) }, 'Mine…'),
          kind !== 'room' ? h('button', { class: 'btn sm ghost', title: 'Cut it out of a sheet of pictures', onclick: () => pickFromSheet(label, u => { pics[art] = u; draw(); }) }, 'Sheet…') : '',
          pics[art] ? h('button', { class: 'ibtn', title: 'Back to the kit\'s picture', onclick: () => { delete pics[art]; draw(); } }, '↺') : '')))),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center' } },
        h('button', { class: 'btn go', onclick: () => { m.remove(); build(K, pics); } }, `Make ${K.title}`),
        h('button', { class: 'btn ghost', title: 'What a character needs, and how to clean up pictures', onclick: () => import('./guide_actor.js').then(g => g.openActorGuide('adventure')) }, 'Character guide')));
  }
  draw();
}

/* ------------------------------------------------------------ building the game ---- */
const canvasOf = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
const fromImageData = im => { const c = canvasOf(im.width, im.height); c.getContext('2d').putImageData(im, 0, 0); return c; };
async function roomPicture(url) {           // the background, smoothly fitted to the 1280×720 room
  const c = canvasOf(W, H), x = c.getContext('2d'), src = fromImageData(await imgData(url));
  x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, W, H);
  return c.toDataURL('image/webp', .9);
}
// a person from one picture: cut out, ~270 px tall (a third of the 720 px room); idle breathes, walk sways and bobs (paper-puppet style)
function personFrames(cut) {
  const pad = 12, fw = cut.width + pad * 2, fh = cut.height + pad, src = fromImageData(cut);
  const frame = (angle, bob, sy = 1) => { const c = canvasOf(fw, fh), x = c.getContext('2d');
    x.translate(fw / 2, fh); x.rotate(angle * Math.PI / 180); x.scale(1, sy); x.drawImage(src, -cut.width / 2, -cut.height - bob); return c.toDataURL('image/png'); };
  return { w: fw, h: fh, anims: [
    { name: 'idle', fps: 2, loop: true, span: 1, frames: [frame(0, 0), frame(0, 0, .985)], boxes: [null, null] },
    { name: 'walk', fps: 6, loop: true, span: 1, frames: [frame(-2.5, 0), frame(0, 4), frame(2.5, 0), frame(0, 4)], boxes: [null, null, null, null] }] };
}
async function build(K, pics) {
  const g = await newGameFolder(K.title.toLowerCase().replace(/\W+/g, '_'), `the ${K.title} kit`, { path: 'adventure', look: 'modern' });
  if (!g) return;
  const pic = art => pics[art] || ART(art), px = ([fx, fy]) => [Math.round(fx * W), Math.round(fy * H)];
  g.step('People: cut out of their pictures, given an idle and a walk…');
  const actor = async (name, art, role) => {
    const P = personFrames(cutout(await imgData(pic(art)), { height: 270 }));
    await g.put('actor-' + name, { meta: { kind: 'actor', name, thumb: P.anims[0].frames[0] }, actor: { id: uid(), name, w: P.w, h: P.h, role, desc: art, pal: [], anims: P.anims, react: { knockback: 0, iframes: .5, health: 3 } } });
  };
  await actor(K.hero.name, K.hero.art, 'hero');
  for (const n of K.npcs) await actor(n.name, n.art, 'npc');
  g.step('Items and their pictures…');
  const icons = [];
  for (const [id, , , art] of K.items) icons.push({ name: id + '.png', b64: fromImageData(cutout(await imgData(pic(art)), { height: 96 })).toDataURL('image/png') });
  await g.files('icons/kit', icons);
  await g.put('items-adventure', { meta: { kind: 'items', name: 'adventure' }, items: { items: K.items.map(([id, name, look]) => ({ id, name, look, icon: `icons/kit/${id}.png` })),
    combos: K.combos.map(([a, b, makes, text]) => ({ a, b, makes, text })) } });
  g.step('Rooms: pictures, walk areas, hotspots, entries…');
  const iconOf = art => (K.items.find(i => i[3] === art) || [])[0];
  for (const r of K.rooms) {
    const [farY, farS, nearY, nearS] = r.depth;
    const hotspots = r.hotspots.map(([name, title, [x0, y0, x1, y1], o]) => {
      const q = { id: uid(), name, title, poly: [px([x0, y0]), px([x1, y0]), px([x1, y1]), px([x0, y1])], does: 'say', look: '', text: '', ...o };
      if (o.stand) q.stand = px(o.stand);
      if (o.dialogue) q.dialogue = `dialogue/${o.dialogue}.json`;
      if (typeof o.shows === 'string') q.shows = o.shows.startsWith('npc:') ? { kind: 'actor', name: o.shows.slice(4) } : { kind: 'picture', path: `icons/kit/${iconOf(o.shows)}.png`, scale: .45 };
      return q;
    });
    await g.put('room-' + r.name, { meta: { kind: 'room', name: r.name }, room: { id: uid(), name: r.name, w: W, h: H, bg: await roomPicture(pic(r.art)), fg: null, music: '',
      walk: r.walk.map(px), depth: { farY: Math.round(farY * H), farS, nearY: Math.round(nearY * H), nearS },
      entries: Object.entries(r.entries).map(([name, p]) => { const [x, y] = px(p); return { name, x, y }; }), hotspots } });
  }
  g.step('Conversations…');
  for (const [name, T] of Object.entries(K.talks)) {
    const beats = T.beats.map(([who, text, then, does], i) => ({ id: 'b' + (i + 1), who, text, voice: '', next: then === 'end' ? 'end' : '', do: (does || []).map(([k, v]) => ({ k, v })),
      choices: Array.isArray(then) ? then.map(([t, next, cond]) => ({ text: t, next: next === 'end' ? 'end' : 'b' + next, do: [], if: cond ? { k: Object.keys(cond)[0], v: Object.values(cond)[0] } : undefined })) : [] }));
    await g.put('dialogue-' + name, { meta: { kind: 'dialogue', name }, dialogue: { name, cast: T.cast.map(([c, actor]) => ({ name: c, actor })), beats } });
  }
  const menus = MENU_DEFAULTS(); menus.title.title = K.menu; menus.title.dim = .35; menus.title.fontSize = 22;
  await g.put('menus-game', { meta: { kind: 'menus', name: 'game' }, menus });
  const leave = K.rooms.flatMap(r => r.hotspots).find(q => q[3].does === 'leave')[0];
  await g.put('flow-game', { meta: { kind: 'flow', name: 'game' }, flow: { id: uid(), start: 't', links: [{ from: 't', out: 'done', to: 'a' }, { from: 'a', out: leave, to: 'e' }],
    nodes: [{ id: 't', kind: 'menu', name: 'Title', x: 0, y: 0, menu: 'title', picture: `rooms/${K.rooms[1].name}/background.webp` }, { id: 'a', kind: 'room', name: K.title, x: 260, y: 0, room: K.rooms[0].name, entry: 'start' },
      { id: 'e', kind: 'end', name: 'The end', x: 520, y: 0, text: K.end }] } });
  await g.finish({ level: `res://rooms/${K.rooms[0].name}/${K.rooms[0].name}.tscn`, player: `res://sprites/${K.hero.name}/${K.hero.name}.tscn` });
}
