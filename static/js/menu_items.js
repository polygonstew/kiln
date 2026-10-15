// Menus → one item's own look: size, text colour, highlight colour, font and alignment, each optional (empty = the
// screen's). Shown under the item when its ⚙ is pressed. Saved on the item: { size, color, hover, font, align }.
import { h, select } from './core.js';
import { BUNDLED } from './menu_fonts.js';

export const hasStyle = it => !!(it.size || it.color || it.hover || it.font || it.align);

// the controls for one item; changed() saves and redraws, fonts = the game's own fonts, screen = the screen's colours
export function itemStyle(it, screen, fonts, changed, useFont) {
  const colour = (key, label, fallback) => h('label', { class: 'mn-sf', title: label + ' (✕ = the screen\'s)' }, h('span', {}, label),
    h('input', { type: 'color', value: it[key] || fallback, oninput: e => { it[key] = e.target.value; changed(); } }),
    it[key] ? h('button', { class: 'ibtn', title: 'Back to the screen\'s colour', onclick: e => { e.preventDefault(); delete it[key]; changed(true); } }, '✕') : '');
  return h('div', { class: 'mn-style' },
    h('label', { class: 'mn-sf', title: 'Text size in pixels (empty = the screen\'s)' }, h('span', {}, 'Size'),
      h('input', { type: 'number', min: 6, max: 64, placeholder: screen.fontSize || 16, value: it.size || '', onchange: e => { e.target.value ? it.size = +e.target.value : delete it.size; changed(); } })),
    colour('color', 'Colour', screen.text || '#ebe3d0'), colour('hover', 'Highlight', screen.accent || '#ff5b2e'),
    h('label', { class: 'mn-sf' }, h('span', {}, 'Font'), select([['', 'Same as screen'], ...BUNDLED, ...fonts], it.font || '', async v => { v ? it.font = v : delete it.font; await useFont(v); changed(); })),
    h('label', { class: 'mn-sf' }, h('span', {}, 'Align'), select([['', 'Same as screen'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], it.align || '', v => { v ? it.align = v : delete it.align; changed(); })),
    h('button', { class: 'btn sm ghost', title: 'Forget this item\'s own look', onclick: () => { for (const k of ['size', 'color', 'hover', 'font', 'align']) delete it[k]; changed(true); } }, 'Reset'));
}
