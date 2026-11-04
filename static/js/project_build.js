// Project → Build: the steps that take a while and touch the whole project. Bake all the art on the free GPU (rooms are remade after),
// or build the game (the project's tools/ship.sh: checks, web, Windows, its play page). One job at a time; the log follows along.
// The server side is bake_start() in project.py. Used by project.js.
import { h, api, toast, sleep } from './core.js';

const STEPS = [['art', 'Bake all the art', 'Rad, mouths, every set and the line-ups, on the free GPU: about 5 minutes'],
  ['build', 'Build the game', 'Runs the checks, then makes the web and Windows builds and updates the play page']];

export async function buildView(box, info, body) {
  const out = h('div', { class: 'pj-bake' });
  async function draw() {
    const b = await api('/api/gp/bake').catch(() => null);
    if (!b) return null;
    const label = b.running ? `Running: ${b.kind || 'bake'}` : b.ok === true ? `Finished: ${b.kind || 'bake'}` : b.ok === false ? `Stopped: ${b.kind || 'bake'}` : 'Nothing has run yet';
    box.replaceChildren(h('header', { class: 'pj-bar' }, h('b', {}, 'Build'), h('span', { class: 'faint' }, label)),
      h('div', { class: 'pj-gates' }, ...STEPS.map(([kind, name, tip]) => h('div', { class: 'pj-step' },
        h('button', { class: 'btn go', disabled: b.running, onclick: async () => {
          await api('/api/gp/bake', body({ kind })).catch(e => toast(e.message, 'bad'));
          follow();
        } }, name), h('span', { class: 'faint' }, tip)))), out);
    out.replaceChildren(b.log.length ? h('pre', { class: 'pj-log' }, b.log.slice(-14).join('\n')) : '');
    return b;
  }
  async function follow() {
    for (;;) {
      const b = await draw();
      if (!b?.running) return;
      await sleep(3000);
    }
  }
  await follow();
}
