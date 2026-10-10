// GDScript editor: a plain <textarea> over a highlighted copy of the same text (so typing, selection, undo and
// the browser's find all stay native), with line numbers, Godot-style tab indents, auto-indent after ":",
// Ctrl+/ to comment lines, Ctrl+S to save, and error marks from Godot's own checker.
import { h } from './core.js';

const KW = new Set(('func var const if elif else for while match return pass break continue class_name extends signal enum static '
  + 'await in not and or is as self super true false null preload load breakpoint when void').split(' '));
const TOKEN = /(#[^\n]*)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\$[\w/]+|%\w+|\$"[^"\n]*")|(@\w+)|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|(\b[A-Za-z_]\w*\b)(\s*\()?/g;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src) {
  let out = '', last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += esc(src.slice(last, m.index)); last = m.index + m[0].length;
    const [all, com, str, node, ann, num, id, call] = m;
    if (com) out += `<i class="c">${esc(com)}</i>`;
    else if (str) out += `<i class="s">${esc(str)}</i>`;
    else if (node) out += `<i class="n">${esc(node)}</i>`;
    else if (ann) out += `<i class="a">${esc(ann)}</i>`;
    else if (num) out += `<i class="d">${num}</i>`;
    else if (KW.has(id)) out += `<i class="k">${id}</i>` + esc(call || '');
    else if (/^[A-Z]/.test(id)) out += `<i class="t">${id}</i>` + esc(call || '');
    else if (call) out += `<i class="f">${id}</i>` + esc(call);
    else out += esc(all);
  }
  return out + esc(src.slice(last)) + '\n';
}

export function gdEditor({ text = '', onChange, onSave }) {
  const ta = h('textarea', { spellcheck: false, autocapitalize: 'off', autocomplete: 'off', wrap: 'off' });
  const pre = h('pre', { class: 'gd-hl', 'aria-hidden': 'true' }), gut = h('div', { class: 'gd-gut' });
  const el = h('div', { class: 'gd-ed' }, gut, h('div', { class: 'gd-wrap' }, pre, ta));
  let errs = [];
  const render = () => {
    pre.innerHTML = highlight(ta.value);
    const n = ta.value.split('\n').length, bad = new Map(errs.map(e => [e.line, e.msg]));
    gut.innerHTML = Array.from({ length: n }, (_, i) => bad.has(i + 1) ? `<b title="${esc(bad.get(i + 1))}">${i + 1}</b>` : `<span>${i + 1}</span>`).join('');
    sync();
  };
  const sync = () => { pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`; gut.style.transform = `translateY(${-ta.scrollTop}px)`; };
  const insert = s => { ta.focus(); document.execCommand('insertText', false, s); };      // keeps the browser's undo
  const lineStart = i => ta.value.lastIndexOf('\n', i - 1) + 1;
  // replace whole selected lines through fn(lines) and keep them selected
  const editLines = fn => {
    const a = lineStart(ta.selectionStart), e0 = ta.value.indexOf('\n', ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && ta.value[ta.selectionEnd - 1] === '\n' ? 1 : 0));
    const b = e0 < 0 ? ta.value.length : e0, rep = fn(ta.value.slice(a, b).split('\n')).join('\n');
    ta.setSelectionRange(a, b); insert(rep); ta.setSelectionRange(a, a + rep.length);
  };
  ta.addEventListener('input', () => { render(); onChange?.(ta.value); });
  ta.addEventListener('scroll', sync);
  ta.addEventListener('keydown', e => {
    const multi = ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n');
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) editLines(L => L.map(l => l.replace(/^(\t| {1,4})/, '')));
      else if (multi) editLines(L => L.map(l => l ? '\t' + l : l));
      else insert('\t');
    } else if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault();
      const line = ta.value.slice(lineStart(ta.selectionStart), ta.selectionStart), ind = line.match(/^\s*/)[0];
      insert('\n' + ind + (/:\s*(#.*)?$/.test(line) ? '\t' : ''));
    } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      editLines(L => { const all = L.filter(l => l.trim()).every(l => /^\s*#/.test(l)); return L.map(l => !l.trim() ? l : all ? l.replace(/^(\s*)# ?/, '$1') : l.replace(/^(\s*)/, '$1# ')); });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); onSave?.(); }
  });
  const api = {
    el,
    get: () => ta.value,
    set(t) { ta.value = t; errs = []; ta.scrollTop = 0; render(); },
    mark(list) { errs = list || []; render(); },
    insert,
    goLine(n) { const L = ta.value.split('\n'); const i = L.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0); ta.focus(); ta.setSelectionRange(i, i + (L[n - 1] || '').length); ta.scrollTop = Math.max(0, (n - 6) * 19); sync(); },
    focus: () => ta.focus(),
  };
  api.set(text);
  return api;
}
