// Kiln shell: tabs, wordmark, routing between workspaces.
import { $, h, on, emit, pref, toast } from './core.js';
import { drawText } from './text.js';
import { initTray } from './queue.js';
import { files, loadSettings } from './files.js';
import { editStyle } from './style.js';
import { initWheel, registerWheel } from './wheel.js';
import './quick.js';
import './sendto.js';
import { initMenus } from './menubar.js';
import { offerTour, endTour } from './tour.js';
import { initJourney } from './journey.js';
import './gametype.js';        // the game's path (kind of game): tint, tabs, brains per role
import { initTop, markTab } from './topbar.js';

const mods = [files];
const optional = ['gamedoc', 'flow', 'forge', 'animate', 'scenes', 'levels', 'rooms', 'cards', 'hud', 'stage', 'concepts', 'logic', 'dialogue', 'menus'];
const views = {};
let cur = null;

function wordmark() {
  const cv = $('#mark'); cv.width = 40; cv.height = 16;
  const x = cv.getContext('2d');
  drawText(x, 'KILN', 2, 1, { font: 'small', color: '#ff5b2e', shadow: '#5a1f0d', spacing: 1, scale: 1 });
  x.fillStyle = '#e6e2d6'; x.fillRect(2, 13, 34, 1);
}

function show(id) {
  const m = mods.find(m => m.id === id) || mods[0];
  if (!views[m.id]) {
    const el = h('div', { class: 'view', id: 'v-' + m.id });
    $('#views').append(el);
    m.mount(el);
    views[m.id] = el;
  }
  for (const [k, el] of Object.entries(views)) el.classList.toggle('on', k === m.id);
  markTab(m.id);
  if (cur !== m.id) { endTour(); mods.find(x => x.id === cur)?.hide?.(); cur = m.id; m.show?.(); pref.set('tab', m.id); location.hash = m.id; setTimeout(() => cur === m.id && offerTour(m.id), 1200); }
  views[m.id].focus({ preventScroll: true });
}

async function boot() {
  wordmark();
  initTray();
  for (const n of optional) {
    try { const mod = await import(`./${n}.js`); mods.push(mod[n]); } catch (e) { if (!/Failed to fetch|Importing a module/.test(e.message)) console.error(n, e); }
  }
  initTop(mods, show);    // the game chip, the path's tabs, More
  try { await loadSettings(); } catch (e) { toast('Server not answering: ' + e.message, 'bad'); }
  on('tab', id => show(id));
  $('#stylechip').onclick = editStyle;
  initJourney();         // the "Your game" chip: how far the game has come, and what to make next
  // cross-tab requests switch to the tab that handles them
  const route = { 'open-actor': 'animate', 'slice-sheet': 'animate', 'forge-image': 'forge', 'open-scene': 'scenes', 'scene-layer': 'scenes', 'use-palette': 'forge', 'to-animate': 'animate', 'forge-for': 'forge', 'level-tileset': 'levels', 'forge-guide': 'forge', 'make-actor': 'forge', 'open-level': 'levels', 'open-room': 'rooms', 'open-dialogue': 'dialogue', 'tune-actor': 'animate', 'play': 'stage' };
  for (const [ev, tab] of Object.entries(route)) on(ev, () => { if (mods.some(m => m.id === tab)) show(tab); });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = mods.find(m => m.key === e.key);
    if (m) { show(m.id); e.preventDefault(); }
  });
  initWheel(() => mods.map(m => ({ id: m.id, label: m.title, key: m.key })), () => cur);
  initMenus();
  // workspaces without their own wheel entries still get their main buttons as tools
  for (const m of mods) if (!['animate', 'forge', 'levels', 'scenes', 'concepts'].includes(m.id)) registerWheel(m.id, () => ({
    tools: [...(views[m.id]?.querySelectorAll('button.btn.go, button.btn:not(.ghost):not(.sm)') || [])].filter(b => b.offsetParent && b.textContent.trim()).slice(0, 10)
      .map(b => ({ label: b.textContent.trim().slice(0, 24), hint: b.title, run: () => b.click() })),
  }));
  show(location.hash.slice(1) || pref.get('tab', 'files'));
  const hello = sessionStorage.getItem('kiln.hello'); sessionStorage.removeItem('kiln.hello');      // after New game / Open game
  if (hello) toast(hello, 'ok');
  if (sessionStorage.getItem('kiln.play')) { sessionStorage.removeItem('kiln.play'); setTimeout(() => emit('play'), 800); }     // a demo just made: play it
}
boot();
