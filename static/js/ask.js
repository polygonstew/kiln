// Ask Gloop (Help → Ask Gloop…, or "Ask me…" on Gloop): type a "how do I…?" question, get a short answer made from
// Kiln's own guide and docs, with links to where it came from. Server: helpbot.py (/api/ask). With no engine yet the
// answer is the matching passages, plus a button to download the small helper that runs on this computer.
import { h, api, toast } from './core.js';

const open = url => url.startsWith('/') ? window.open(url, '_blank') : window.open(url, '_blank', 'noopener');

export function openAsk(prefill = '') {
  document.querySelector('.gloop')?.remove();
  const out = h('div', { class: 'gl-ans' });
  const input = h('input', { type: 'search', placeholder: 'Ask me: how do I make the camera follow?', value: prefill, onkeydown: e => { if (e.key === 'Enter') go(); else if (e.key === 'Escape') close(); } });
  const close = () => { g.classList.add('out'); setTimeout(() => g.remove(), 350); };
  const links = (list) => h('div', { class: 'gl-src' }, ...list.map(s => s.url ? h('a', { href: '#', title: s.label, onclick: e => { e.preventDefault(); open(s.url); } }, s.title) : h('span', { title: s.label }, s.title)));
  async function go() {
    const q = input.value.trim();
    if (!q) return;
    out.replaceChildren(h('p', { class: 'note' }, 'Looking it up…'));
    const r = await api('/api/ask', { q }).catch(() => null);
    if (!r) return out.replaceChildren(h('p', {}, 'I couldn\'t reach Kiln just now. Try again in a moment.'));
    out.replaceChildren(
      r.answer ? h('p', { class: 'gl-text' }, r.answer) : h('p', { class: 'note' }, 'Here is what the guide says about that:'),
      ...(r.passages || []).map(p => h('div', { class: 'gl-pass' }, h('b', {}, p.title), h('p', {}, p.text))),
      r.sources.length ? links(r.sources) : '',
      r.can_fetch ? h('button', { class: 'btn sm', onclick: e => fetchHelper(e.target) }, 'Get my little brain (about 1 GB) for real answers') : '');
  }
  async function fetchHelper(btn) {
    await api('/api/ask/fetch', {});
    const tick = async () => {
      const s = await api('/api/ask/status');
      if (s.fetch.err) { btn.textContent = 'Download stopped: ' + s.fetch.err; return; }
      if (s.local) { btn.remove(); toast('Ready: ask me again', 'ok'); return; }
      btn.textContent = s.fetch.total ? `Downloading… ${Math.round(100 * s.fetch.done / s.fetch.total)}%` : 'Downloading…';
      setTimeout(tick, 1500);
    };
    tick();
  }
  const g = h('div', { class: 'gloop gl-ask' }, h('div', { class: 'gl-say' }, input, out,
    h('div', { class: 'gl-btns' }, h('button', { class: 'btn sm go', onclick: go }, 'Ask'), h('button', { class: 'btn sm ghost', onclick: close }, 'Bye'))), h('div', { class: 'gl-slime', title: 'Gloop' }));
  import('./helper.js').then(m => { g.querySelector('.gl-slime').innerHTML = m.SLIME; });
  document.body.append(g);
  input.focus();
  if (prefill) go();
}
