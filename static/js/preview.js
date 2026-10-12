// Play in place: a small window of the game you can dock beside whatever you are editing (Layout ▾ → Add a panel →
// Preview). ▶ builds the game (the same build as the Stage, playbuild.js) and plays it right there; it marks itself
// out of date when you save something. Godot web games only run on a secure page: elsewhere it links to Kiln's
// https address, as the Stage does.
import { h, api, on } from './core.js';
import { buildGame, gamePicks } from './playbuild.js';
import { LOOK } from './gametype.js';

const frames = new Set();
on('saved', () => { for (const f of frames) f.stale(); });

export function previewPanel() {
  const frame = h('iframe', { class: 'pv-frame', title: 'Your game', allow: 'autoplay; fullscreen; gamepad' });
  const state = h('small', { class: 'pv-state' }, 'Not built yet');
  const go = h('button', { class: 'btn sm go', title: 'Build the game and play it here', onclick: run }, '▶ Play');
  const box = h('div', { class: 'pv-box', style: { aspectRatio: `${LOOK().w} / ${LOOK().h}` } }, frame);
  const el = h('div', { class: 'sec pv' }, h('h3', {}, 'Preview', h('span', { class: 'grow' }), go), box, state);
  const me = { stale: () => { state.textContent = 'Changed since: ▶ to build again'; } };
  frames.add(me);
  async function run() {
    if (!window.isSecureContext) { const st = await api('/api/play/status').catch(() => ({})); state.replaceChildren('Games play only on Kiln\'s secure address', st.secure ? h('a', { href: st.secure, target: '_blank' }, ' (open it)') : ''); return; }
    go.disabled = true; state.textContent = 'Building…';
    const ok = await buildGame(await gamePicks(), log => { state.textContent = (log || []).slice(-1)[0] || 'Building…'; });
    go.disabled = false;
    if (ok) { frame.src = '/play/?t=' + Date.now(); state.textContent = 'Playing: click it for keys'; } else state.textContent = 'The build failed: see the Stage for the log';
  }
  return el;
}
