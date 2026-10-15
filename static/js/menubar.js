// The classic menu bar: File · Edit · View · Tools · Help. Every item acts on the area you are in, by pressing
// that area's own buttons or keys, so all areas get the same menus without each one wiring them up.
import { $, h, emit, toast } from './core.js';
import { areaList, currentArea } from './wheel.js';
import { openHistory } from './history.js';
import { openSfxDesigner } from './sfx.js';
import { openVfxDesigner } from './vfx.js';
import { openDoctor, openTidy } from './doctor.js';
import { tour } from './tour.js';

const view = () => document.querySelector('.view.on');
const visibleButton = (re, root = view()) => [...(root?.querySelectorAll('button') || [])].find(b => b.offsetParent && re.test(b.textContent.trim()));
function press(re, what) { const b = visibleButton(re); if (b) b.click(); else toast(`${what} isn't available in ${areaList().find(a => a.id === currentArea())?.label || 'this area'}`); }
const key = (k, o = {}) => (view() || document).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
const go = id => emit('tab', id);
// File → New / Open / Save press the area's own button for it (marked data-file="new|open|save"), named after what
// the area holds; greyed out where the area has none (Stage, Files)
const NOUN = { animate: 'actor', scenes: 'scene', levels: 'level', hud: 'HUD', logic: 'graph', dialogue: 'dialogue', concepts: 'concept session', forge: 'image', menus: 'menus' };
const fileButton = kind => [...(view()?.querySelectorAll(`[data-file=${kind}]`) || [])].find(b => b.offsetParent && !b.disabled);
function fileItem(kind) {
  const b = fileButton(kind), noun = b?.dataset.noun || NOUN[currentArea()] || '', area = areaList().find(a => a.id === currentArea())?.label || 'this area';
  const label = kind === 'save' ? (b?.textContent.trim().replace(/^Save$/, 'Save ' + noun) || 'Save') : `${kind === 'new' ? 'New' : 'Open'} ${noun}`.trim() + (kind === 'open' ? '…' : '');
  return [label, b ? b.title || label : `${area} has nothing to ${kind} here`, () => b?.click(), kind === 'save' ? 'Ctrl+S' : '', !b];
}

const MENUS = () => [
  ['File', [
    ['New game…', 'A new, empty game folder (the one open now stays as it is)', () => import('./games.js').then(m => m.newGame())],
    ['Open game…', 'Switch to another of your games', () => import('./games.js').then(m => m.openGame())],
    ['Delete game…', 'Delete this game, or start over with an empty one (asks you to type its name; a copy is kept unless you say otherwise)', () => import('./games.js').then(m => m.deleteGame())],
    ['Kind of game…', 'The path of this game: side-scroller, top-down shooter, one-screen puzzler, point & click adventure or the Wild card', () => import('./gametype.js').then(m => m.choosePath())],
    null,
    fileItem('new'), fileItem('open'), fileItem('save'),
    ['Save all for Godot', 'Save every actor, scene, HUD, level, menu, dialogue and graph again, each by its own area', () => import('./saveall.js').then(m => m.openSaveAll())],
    ['History…', 'Earlier versions of your actors, scenes, levels and HUDs: bring one back as a copy', openHistory],
    null,
    ['Export game…', 'Your game for players: Web (itch.io), Windows, Linux, macOS, or the Godot project, each as a zip to download', () => import('./release.js').then(m => m.openRelease())],
    ['New game from a template…', 'A small complete game of this kind in a new folder (yours stays as it is), made with every area, then played in the Stage', () => import('./demo.js').then(m => import('./gametype.js').then(g => m.makeDemo({ ...g.GAME })))],
    null,
    ['Cut a sprite sheet…', 'Open a sheet and cut it into frames', () => { go('animate'); setTimeout(() => press(/^Cut a sprite sheet/, 'Cut a sheet'), 300); }],
    ['Add concept images…', 'Upload or paste images onto a concept board', () => { go('concepts'); setTimeout(() => document.querySelector('#v-concepts .cdrop')?.click(), 300); }],
    null,
    ['Asset folder…', 'Choose where Kiln saves (point it into your Godot project)', () => { go('files'); setTimeout(() => press(/^Change$/, 'Change folder'), 300); }],
  ]],
  ['Edit', [
    ['Undo', 'Undo the last change (Ctrl+Z)', () => key('z', { ctrlKey: true }), 'Ctrl+Z'],
    ['Redo', 'Redo (Ctrl+Y)', () => key('y', { ctrlKey: true }), 'Ctrl+Y'],
    null,
    ['Find anything…', 'Areas, actions, actors, scenes, files', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })), 'Ctrl+K'],
    ['Style bible…', 'The look every asset shares: words, palette, outline, light', () => $('#stylechip')?.click()],
    ['Services & keys…', 'Connect the picture and writing services Forge uses (step by step)', () => import('./setup.js').then(m => m.openSetup())],
  ]],
  ['View', [
    ...areaList().map(a => [a.label, `Go to ${a.label}`, () => go(a.id), a.key]),
    null,
    ['Command wheel', 'Tools, guides and areas around the cursor', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', shiftKey: true })), 'Shift+A'],
    ['Generation queue', 'What is being generated and how long it will take', () => $('#jobs')?.click()],
  ]],
  ['Tools', [
    ['Concept board', 'Images from meta.ai and others, with notes', () => go('concepts')],
    ['Batch → sprites', 'A whole concept session into one consistent set', () => { go('concepts'); setTimeout(() => press(/^Batch/, 'Batch'), 400); }],
    ['Forge: roll an enemy idea', 'A random grim enemy description', () => { go('forge'); setTimeout(() => press(/Roll$/, 'Roll'), 300); }],
    null,
    ['Desk (your apps)', 'Your home apps as windows', () => window.open('/desk', '_blank')],
    ['Doctor…', 'Check the asset folder: missing files, sprites too big or too colourful, loose images, unsaved items', openDoctor],
    ['Tidy game files…', 'Put Kiln\'s runtime scripts together in _kiln/ (older asset folders had them in sprites/_kiln/, menus/, hud/…)', openTidy],
    ['Effects…', 'Make effect sprites (sparks, slashes, dust, explosions, sparkles) as one-shot Godot scenes', openVfxDesigner],
    ['Sound effects…', 'Make retro sound effects (coin, jump, explosion…) and save them as .wav', openSfxDesigner],
    ['Godot plugin…', 'Install the Kiln dock into your Godot project (or download it)', godotPlugin],
  ]],
  ['Help', [
    ['Tour this area', 'Bubbles that walk you through the area you are in, part by part', () => tour(currentArea()), 'Shift+F1'],
    ['Guide', 'How every area works, with pictures; searchable', () => window.open('/help', '_blank'), 'F1'],
    ['Into Godot', 'How what you make here reaches your Godot project', () => window.open('/help#godot', '_blank')],
    ['Gloop', 'Your little helper: what to do next, tours and guides', () => import('./helper.js').then(m => m.callGloop())],
    ['Ask Gloop…', 'Type a "how do I…?" question; the answer comes from this guide', () => import('./ask.js').then(m => m.openAsk())],
    ['Character guide', 'What pictures a character needs, and how to clean them up', () => import('./guide_actor.js').then(m => m.openActorGuide())],
    ['Rule book', 'How to play this game, written from what is in it; shown by the game\'s "How to play"', () => import('./rules.js').then(m => m.openRules())],
    ['Physics guide', 'How bodies, joints and ragdolls work, with examples to build', () => import('./guide_physics.js').then(m => m.openPhysicsGuide())],
    ['Shortcuts', 'Keys and mouse for the area you are in', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })), '?'],
    ['For developers', 'Code map, API, events, tests', () => window.open('/help#dev', '_blank')],
  ]],
];

// The menus live under the KILN logo: click it for File · Edit · View · Tools · Help, hover one for its items.
// Install the Godot add-on into the project the asset folder lives in; otherwise hand over the zip.
async function godotPlugin() {
  const g = await fetch('/api/godot?path=' + encodeURIComponent(document.querySelector('#rootchip')?.dataset.root || '')).then(r => r.json()).catch(() => ({}));
  if (g.root && confirm(`Install the Kiln plugin into ${g.root}/addons/kiln and switch it on?\n\nIn Godot you then get a "Kiln" dock (top right): link, list and add Kiln's assets.`)) {
    const r = await fetch('/api/godot/install', { method: 'POST', body: JSON.stringify({}) }).then(r => r.json()).catch(e => ({ err: e.message }));
    return r.err ? toast(r.err, 'bad') : toast('Installed: reopen the project in Godot to see the Kiln dock', 'ok');
  }
  const a = h('a', { href: '/godot-plugin.zip', download: 'kiln-godot-plugin.zip' }); document.body.append(a); a.click(); a.remove();
  toast('Downloaded the plugin: unzip it into your Godot project (it makes addons/kiln), then Project Settings → Plugins → Kiln → On', 'ok');
}
let open = null;
function close() { open?.root.remove(); open?.sub?.remove(); $('#logo')?.classList.remove('on'); open = null; }
function item(it) {      // [label, tooltip, action, key?, greyed out?]
  return it === null ? h('i', { class: 'mb-sep' })
    : h('button', { title: it[1], class: it[4] ? 'off' : '', onclick: () => { if (it[4]) return; close(); it[2](); } }, h('span', {}, it[0]), it[3] ? h('kbd', {}, it[3]) : '');
}
function showSub(row, items) {
  open.sub?.remove();
  open.root.querySelectorAll('.mb-grp').forEach(g => g.classList.toggle('on', g === row));
  const sub = h('div', { class: 'mb-panel' }, ...items.map(item));
  const r = row.getBoundingClientRect();
  sub.style.left = r.right + 'px'; sub.style.top = (r.top - 5) + 'px';
  document.body.append(sub); open.sub = sub;
  const sr = sub.getBoundingClientRect();
  if (sr.bottom > innerHeight - 6) sub.style.top = Math.max(6, innerHeight - 6 - sr.height) + 'px';
}
function showMenu() {
  close();
  const logo = $('#logo'), r = logo.getBoundingClientRect(), menus = MENUS();
  const root = h('div', { class: 'mb-panel mb-root' }, ...menus.map(([name, items]) => {
    const row = h('button', { class: 'mb-grp', onclick: () => showSub(row, items) }, h('span', {}, name), h('b', {}, '›'));
    row.onmouseenter = () => showSub(row, items);
    return row;
  }));
  root.style.left = (r.left + 4) + 'px'; root.style.top = r.bottom + 'px';
  document.body.append(root); logo.classList.add('on'); open = { root };
  showSub(root.firstChild, menus[0][1]);          // File open straight away
}
export function initMenus() {
  const logo = $('#logo'); if (!logo) return;
  logo.onclick = e => { e.stopPropagation(); open ? close() : showMenu(); };
  document.addEventListener('pointerdown', e => { if (open && !open.root.contains(e.target) && !open.sub?.contains(e.target) && !e.target.closest('#logo')) close(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) { close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.defaultPrevented) {     // Ctrl+S saves for the game, not the web page
      e.preventDefault();
      const b = fileButton('save');
      b ? b.click() : toast(`Nothing to save in ${areaList().find(a => a.id === currentArea())?.label || 'this area'}: it keeps itself`);
    }
    if (e.key === 'F1' && e.shiftKey) { e.preventDefault(); tour(currentArea()); }
    else if (e.key === 'F1') { e.preventDefault(); window.open('/help', '_blank'); }
  });
}
