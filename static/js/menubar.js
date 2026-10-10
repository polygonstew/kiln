// The classic menu bar: File · Edit · View · Tools · Help. Every item acts on the area you are in, by pressing
// that area's own buttons or keys, so all areas get the same menus without each one wiring them up.
import { $, h, emit, toast } from './core.js';
import { areaList, currentArea } from './wheel.js';

const view = () => document.querySelector('.view.on');
const visibleButton = (re, root = view()) => [...(root?.querySelectorAll('button') || [])].find(b => b.offsetParent && re.test(b.textContent.trim()));
function press(re, what) { const b = visibleButton(re); if (b) b.click(); else toast(`${what} isn't available in ${areaList().find(a => a.id === currentArea())?.label || 'this area'}`); }
const key = (k, o = {}) => (view() || document).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
const go = id => emit('tab', id);

const MENUS = () => [
  ['File', [
    ['New…', 'New actor, scene, level, HUD or concept session (in the area you are in)', () => press(/^New$/, 'New')],
    ['Open…', 'Open a saved one', () => press(/^Open( image)?$/, 'Open')],
    ['Save', 'Save what you are working on for the game (Ctrl+S)', () => press(/^Save /, 'Save'), 'Ctrl+S'],
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
  ]],
  ['Help', [
    ['Guide', 'How every area works, with pictures; searchable', () => window.open('/help', '_blank'), 'F1'],
    ['Into Godot', 'How what you make here reaches your Godot project', () => window.open('/help#godot', '_blank')],
    ['Shortcuts', 'Keys and mouse for the area you are in', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })), '?'],
    ['For developers', 'Code map, API, events, tests', () => window.open('/help#dev', '_blank')],
  ]],
];

let open = null;
function close() { open?.panel.remove(); open?.btn.classList.remove('on'); open = null; }
function show(btn, items) {
  close();
  const panel = h('div', { class: 'mb-panel' }, ...items.map(it => it === null ? h('i', { class: 'mb-sep' })
    : h('button', { title: it[1], onclick: () => { close(); it[2](); } }, h('span', {}, it[0]), it[3] ? h('kbd', {}, it[3]) : '')));
  const r = btn.getBoundingClientRect();
  panel.style.left = r.left + 'px'; panel.style.top = r.bottom + 'px';
  document.body.append(panel); btn.classList.add('on'); open = { btn, panel };
}
export function initMenus() {
  const nav = $('#menus'); if (!nav) return;
  const draw = () => nav.replaceChildren(...MENUS().map(([name, items]) => {
    const b = h('button', { class: 'mb' }, name);
    b.onclick = e => { e.stopPropagation(); open?.btn === b ? close() : show(b, MENUS().find(m => m[0] === name)[1]); };
    b.onmouseenter = () => { if (open && open.btn !== b) show(b, MENUS().find(m => m[0] === name)[1]); };     // slide across like a desktop menu bar
    return b;
  }));
  draw();
  document.addEventListener('pointerdown', e => { if (open && !open.panel.contains(e.target) && !e.target.closest('#menus')) close(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) { close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); press(/^Save /, 'Save'); }     // Ctrl+S saves for the game, not the web page
    if (e.key === 'F1') { e.preventDefault(); window.open('/help', '_blank'); }
  });
}
