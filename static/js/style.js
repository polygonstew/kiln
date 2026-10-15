// Style bible: one art direction for the whole game, stored in <asset folder>/kiln/style.json.
// Every generator reads it, so sprites, poses, items and scenes come out as one family.
import { $, h, api, toast, emit, on, hex, rgb, PALETTES, HARDWARE, field, seg, select } from './core.js';

const DEFAULT = {
  name: 'Untitled style',
  words: 'detailed 16-bit pixel art, crisp hard edges, limited palette, strong silhouette',
  avoid: 'blurry, painterly smudges, gradients, anti-aliasing, 3d render, photo',
  light: 'top-left',
  outline: 'outer',
  hw: 'snes',
  palette: null,            // null = free; else array of [r,g,b] every asset is pulled into
  paletteName: '',
  scale: 0,                 // character height in pixels for a human-sized actor (0 = not fixed)
};
export let STYLE = { ...DEFAULT };
const LIGHT = { 'top-left': 'lit from the top left', 'top-right': 'lit from the top right', top: 'lit from above', back: 'rim lit from behind', flat: 'flat lighting' };

export async function loadStyle() {
  try {
    const r = await fetch('/api/project?id=style');
    STYLE = r.ok ? { ...DEFAULT, ...(await r.json()) } : { ...DEFAULT };
  } catch { STYLE = { ...DEFAULT }; }
  chip(); emit('style', STYLE);
  return STYLE;
}
async function saveStyle() {
  await api('/api/project', { id: 'style', data: { ...STYLE, meta: { kind: 'style', name: STYLE.name } } });
  chip(); emit('style', STYLE);
}
// Words added to every generation prompt.
export function stylePrompt() { return [STYLE.words, LIGHT[STYLE.light]].filter(Boolean).join(', '); }
export function styleAvoid() { return STYLE.avoid || ''; }

function chip() {
  let c = $('#stylechip');
  if (!c) return;
  c.replaceChildren(h('b', {}, 'Style'), h('span', {}, STYLE.name),
    h('span', { class: 'sw' }, ...(STYLE.palette || []).slice(0, 8).map(p => h('i', { style: { background: hex(p), width: '6px', height: '12px', border: 0 } }))));
}

export function editStyle() {
  const s = { ...STYLE, palette: STYLE.palette ? STYLE.palette.map(c => c.slice()) : null };
  const palBox = h('div');
  const drawPal = () => palBox.replaceChildren(
    s.palette ? h('div', { class: 'sw big' }, ...s.palette.map((c, i) => h('i', { title: hex(c) + ' · click to remove', style: { background: hex(c) }, onclick: () => { s.palette.splice(i, 1); if (!s.palette.length) s.palette = null; drawPal(); } })))
      : h('p', { class: 'note' }, 'No master palette: each asset picks its own colours (within the hardware limit).'),
    h('div', { class: 'btns' },
      select([['', 'Use a preset palette…'], ...Object.entries(PALETTES).map(([k, p]) => [k, p.name])], '', v => { if (v) { s.palette = PALETTES[v].colors.map(c => c.slice()); s.paletteName = PALETTES[v].name; drawPal(); } }),
      h('button', { class: 'btn sm', onclick: () => { const i = h('input', { type: 'color' }); i.onchange = () => { (s.palette = s.palette || []).push(rgb(i.value)); drawPal(); }; i.click(); } }, '+ colour'),
      s.palette ? h('button', { class: 'btn sm ghost', onclick: () => { s.palette = null; drawPal(); } }, 'No master palette') : null));
  drawPal();
  const words = h('textarea', { rows: 3, value: s.words, oninput: e => s.words = e.target.value });
  const avoid = h('textarea', { rows: 2, value: s.avoid, oninput: e => s.avoid = e.target.value });
  const name = h('input', { type: 'text', value: s.name, oninput: e => s.name = e.target.value });
  const scale = h('input', { type: 'number', value: s.scale || '', min: 0, max: 256, placeholder: 'off', style: { width: '80px' }, oninput: e => s.scale = +e.target.value || 0 });
  // art directions to start from (static/templates/directions.json; the template pictures were made with them)
  const dirs = h('div', { class: 'sb-dirs' });
  fetch('/templates/directions.json').then(r => r.json()).then(D => dirs.replaceChildren(...Object.entries(D).map(([k, d]) => h('button', { class: 'sb-dir', title: d.words,
    onclick: () => { Object.assign(s, { name: d.name, words: d.words, avoid: d.avoid, light: d.light }); name.value = s.name; words.value = s.words; avoid.value = s.avoid; for (const b of dirs.children) b.classList.toggle('on', b === dirs.children[Object.keys(D).indexOf(k)]); } },
    h('b', {}, d.name), h('small', {}, 'in the spirit of ' + d.inspired))))).catch(() => {});
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(640px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Style bible'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body' },
      h('p', { class: 'note', style: { marginTop: 0 } }, 'The look every asset in this game shares. Forge, pose frames and Scenes add these words to their prompts and pull colours into the master palette, so a new enemy matches the hero drawn last week.'),
      h('div', { class: 'fld wide' }, h('span', { class: 'fl' }, 'Start from an art direction'), dirs),
      field('Name', name),
      h('div', { class: 'fld wide' }, h('span', { class: 'fl' }, 'Style words (added to every prompt)'), words),
      h('div', { class: 'fld wide' }, h('span', { class: 'fl' }, 'Always avoid'), avoid),
      field('Light from', seg(Object.keys(LIGHT).map(k => [k, k.replace('-', ' ')]), s.light, v => s.light = v)),
      field('Outline', seg([['none', 'None'], ['outer', '1px'], ['thick', 'Round']], s.outline, v => s.outline = v)),
      field('Hardware', seg(Object.entries(HARDWARE).map(([k, H]) => [k, H.name.replace('Master System', 'SMS')]), s.hw, v => s.hw = v)),
      field('Hero height', h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, scale, h('span', { class: 'note', style: { margin: 0 } }, 'px tall for a person; other actors scale to match'))),
      h('div', { class: 'fld wide' }, h('span', { class: 'fl' }, 'Master palette'), palBox)),
    h('footer', {}, h('button', { class: 'btn ghost', onclick: () => m.remove() }, 'Cancel'),
      h('button', { class: 'btn go', onclick: async () => { Object.assign(STYLE, s); await saveStyle(); m.remove(); toast('Style saved for this asset folder', 'ok'); } }, 'Save style'))));
  document.body.append(m);
  // Start over / Put back: the kept style goes to .trash and the default comes back (loaded when asked, startover.js reads files.js)
  import('./startover.js').then(({ projectBar }) => m.querySelector('footer').prepend(projectBar('style', 'style bible', { reload: async () => { m.remove(); await loadStyle(); } })));
}
on('root', () => loadStyle());
