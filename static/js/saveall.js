// Save all: every Kiln project in the asset folder written again for Godot, each by its own area (the same Save you
// would press there), in an order where later things find earlier ones: actors and scenes before the levels that
// place them, the HUD before the dialogue that talks in it. Used by File → Save all and by the demo game.
import { h, api, emit, toast } from './core.js';

const ORDER = [['actor', 'animate'], ['scene', 'scenes'], ['hud', 'hud'], ['level', 'levels'], ['menus', 'menus'], ['dialogue', 'dialogue'], ['room', 'rooms'], ['graph', 'logic'], ['flow', 'flow']];

// onStep(text) hears what is being saved; resolves to { saved, failed: [names] }
export async function saveAll(onStep = () => {}) {
  const projects = await api('/api/projects').catch(() => []);
  let saved = 0; const failed = [];
  for (const [kind, area] of ORDER) {
    const mine = projects.filter(p => p.kind === kind);
    if (!mine.length) continue;
    emit('tab', area);                                   // the area is on screen (and set up) while it saves
    const mod = (await import(`./${area}.js`))[area];
    for (const p of mine) {
      onStep(`${kind}: ${p.name}`);
      try { await mod.saveProject(p.id); saved++; } catch (e) { failed.push(`${kind} ${p.name}: ${e.message}`); }
    }
  }
  return { saved, failed };
}

// File → Save all: a small window that shows the steps as they happen
export async function openSaveAll() {
  const log = h('div', { class: 'play-log', style: { maxHeight: '260px' } });
  const m = h('div', { class: 'modal' }, h('div', { style: { width: 'min(520px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Save all for Godot')), h('div', { class: 'body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Every actor, scene, HUD, level, menu, dialogue, room, graph and the flow is saved again, each by its own area.'), log)));
  document.body.append(m);
  const r = await saveAll(t => log.append(h('div', {}, '… ' + t)));
  log.append(h('div', { class: r.failed.length ? '' : 'lg-ok' }, r.failed.length ? `Saved ${r.saved}; these failed:` : `✓ Saved ${r.saved} items`), ...r.failed.map(f => h('div', { style: { color: 'var(--bad)' } }, f)));
  m.querySelector('.body').append(h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => m.remove() }, 'Close'));
  toast(`Saved ${r.saved} items for Godot`, r.failed.length ? 'bad' : 'ok');
}
