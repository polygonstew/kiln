// Project: a hand-made Godot project opened as it is (first one: the RAD KID rebuild, ~/.jcodes/radkid-godot). Kiln writes
// none of its scenes or scripts; it runs what the project offers and shows the result:
//   Tuning  data/tuning.json as live sliders (the game reloads the file by itself)
//   Checks  tools/gates.sh, pass / fail and each gate's numbers against the run before
//   Clips   the baked animations, played on twos, with a rebake button (project_clips.js)
//   Talk    voice lines turned into mouth cues for the game (project_talk.js)
// The server side is project.py (/api/gp/...). Nothing here touches the asset folder.
import { h, api, toast, pref, sleep } from './core.js';
import { registerWheel, registerKeys } from './wheel.js';
import { clipsView } from './project_clips.js';
import { talkView } from './project_talk.js';

const V = {};
const S = { info: null, view: pref.get('gp.view', 'tuning'), rerun: pref.get('gp.rerun', false), filter: '', timers: {}, polling: false };
const VIEWS = [['tuning', 'Tuning', 'data/tuning.json as live sliders'], ['checks', 'Checks', 'tools/gates.sh: pass / fail and the numbers'],
  ['clips', 'Clips', 'Every baked animation, played on twos'], ['talk', 'Talk', 'Voice lines to mouth shapes']];
const q = () => '?root=' + encodeURIComponent(pref.get('gp.root', ''));
const body = extra => ({ root: pref.get('gp.root', '') || undefined, ...extra });

async function load() {
  try { S.info = await api('/api/gp/info' + q()); } catch (e) { S.info = null; S.err = e.message; }
  drawLeft(); drawView();
}

function drawLeft() {
  const i = S.info;
  const open = h('button', { class: 'btn sm ghost', 'data-file': 'open', 'data-noun': 'project', title: 'Open another Godot project (a folder with project.godot)', onclick: choose }, 'Open…');
  V.head.replaceChildren(h('h3', {}, h('span', { class: 'grow' }, i?.title || 'No project'), open),
    i ? h('div', { class: 'pj-path mono', title: i.root }, i.root.replace(/^\/home\/[^/]+/, '~'), i.branch ? h('small', {}, ' · ' + i.branch) : '') : h('p', { class: 'note' }, S.err || ''),
    i ? h('div', { class: 'row' }, h('button', { class: 'btn go', title: 'Open the game in a window. Tuning changes reach it while it runs', onclick: () => run(false) }, '▶ Run game'),
      i.running ? h('button', { class: 'btn', onclick: () => run(true) }, '■ Stop') : '') : '');
  V.nav.replaceChildren(h('h3', {}, 'In this project'),
    ...VIEWS.map(([id, label, tip]) => h('button', { class: 'pj-nav' + (S.view === id ? ' on' : ''), title: tip, onclick: () => go(id) }, label)));
}

async function choose() {
  const p = prompt('Godot project folder', S.info?.root || '~/.jcodes/radkid-godot');
  if (p) { pref.set('gp.root', p); load(); }
}
async function run(stop) {
  const r = await api('/api/gp/run', body({ stop })).catch(e => toast(e.message, 'bad'));
  if (r) { S.info.running = r.running; drawLeft(); }
}
function go(id) { S.view = id; pref.set('gp.view', id); drawLeft(); drawView(); }

function drawView() {
  if (!S.info) { V.main.replaceChildren(h('p', { class: 'note' }, 'Open a Godot project to begin.')); return; }
  ({ tuning: tuningView, checks: checksView, clips: () => clipsView(V.main, S.info, body), talk: () => talkView(V.main, S.info, body) })[S.view]();
}

// ------------------------------------------------- tuning ---
const range = home => {                                                        // a slider that reaches 2.5x the committed number
  const a = Math.abs(home) || 1, top = a * 2.5, mag = 10 ** Math.floor(Math.log10(top)), max = Math.ceil(top / mag) * mag;
  return { min: home < 0 ? -max : 0, max, step: Number.isInteger(home) && max >= 50 ? 1 : +(max / 200).toPrecision(2) };
};

async function tuningView() {
  const t = await api('/api/gp/tuning' + q()).catch(e => (toast(e.message, 'bad'), null));
  if (!t) return;
  const status = h('span', { class: 'faint' }, t.about);
  const list = h('div', { class: 'pj-tuning' });
  const send = (sec, key, val, mark) => {
    clearTimeout(S.timers[sec + key]);
    S.timers[sec + key] = setTimeout(async () => {
      const r = await api('/api/gp/tuning', body({ section: sec, key, value: val })).catch(e => (toast(e.message, 'bad'), null));
      if (!r) return;
      t.sections[sec][key] = r.value; mark();
      status.textContent = `${sec}.${key} = ${r.value}: saved, the running game has it within half a second`;
      if (S.rerun) { clearTimeout(S.timers.rerun); S.timers.rerun = setTimeout(startChecks, 900); }
    }, 160);
  };
  const row = (sec, key) => {
    const val = t.sections[sec][key], home = t.home[sec]?.[key] ?? val, R = range(home);
    const num = h('input', { type: 'number', value: val, step: R.step, title: 'Type any number, it can go past the slider' });
    const slide = h('input', { type: 'range', min: R.min, max: R.max, step: R.step, value: val });
    const back = h('button', { class: 'ibtn', title: `Back to ${home} (the last commit)` }, '↺');
    const el = h('div', { class: 'pj-row' }, h('label', { title: `${sec}.${key}` }, key), slide, num, back);
    const mark = () => el.classList.toggle('moved', t.sections[sec][key] !== home);
    const set = (v, from) => { if (from !== num) num.value = v; if (from !== slide) slide.value = v; send(sec, key, v, mark); };
    slide.oninput = () => set(+slide.value, slide);
    num.oninput = () => { if (num.value !== '' && Number.isFinite(+num.value)) set(+num.value, num); };
    back.onclick = () => set(home);
    mark();
    return el;
  };
  const draw = () => {
    const f = S.filter.toLowerCase();
    list.replaceChildren(...Object.keys(t.sections).map(sec => {
      const keys = Object.keys(t.sections[sec]).filter(k => !f || (sec + '.' + k).includes(f));
      return keys.length ? h('section', {}, h('h3', {}, sec, h('small', {}, ` ${keys.length}`)), ...keys.map(k => row(sec, k))) : '';
    }));
  };
  const find = h('input', { placeholder: 'Find a number…', value: S.filter, oninput: e => { S.filter = e.target.value; draw(); } });
  const auto = h('label', { class: 'pj-check', title: 'Run the checks again after every change' },
    h('input', { type: 'checkbox', checked: S.rerun, onchange: e => { S.rerun = e.target.checked; pref.set('gp.rerun', S.rerun); } }), 'Re-check after a change');
  draw();
  V.main.replaceChildren(h('header', { class: 'pj-bar' }, h('b', {}, 'Tuning'), find, auto, status), list);
}

// ------------------------------------------------- checks ---
async function startChecks() { await api('/api/gp/checks', body({})).catch(e => toast(e.message, 'bad')); pollChecks(); }

async function pollChecks() {
  if (S.polling) return;
  S.polling = true;
  for (;;) {
    const c = await api('/api/gp/checks').catch(() => null);
    if (S.view === 'checks' && c) drawChecks(c);
    if (!c?.running) break;
    await sleep(600);
  }
  S.polling = false;
}

function drawChecks(c) {
  const was = Object.fromEntries((c.before || []).map(g => [g.name, g]));
  const fails = c.results.filter(g => !g.ok).length;
  const head = h('header', { class: 'pj-bar' }, h('b', {}, 'Checks'),
    h('button', { class: 'btn go', disabled: c.running, onclick: startChecks }, c.running ? 'Running…' : '▶ Run the checks'),
    c.summary ? h('span', { class: 'pj-sum' + (fails ? ' bad' : ' ok') }, c.summary) : h('span', { class: 'faint' }, 'tools/gates.sh has not run yet'));
  const rows = c.results.map(g => {
    const b = was[g.name], moved = b && b.text !== g.text;
    return h('div', { class: 'pj-gate ' + (g.ok ? 'ok' : 'bad') }, h('b', {}, g.ok ? 'PASS' : 'FAIL'), h('span', { class: 'mono' }, g.name),
      h('div', {}, g.text, moved ? h('small', {}, 'before: ' + b.text) : ''));
  });
  V.main.replaceChildren(head, h('div', { class: 'pj-gates' }, ...rows));
}
async function checksView() { const c = await api('/api/gp/checks').catch(() => null); if (c) drawChecks(c); if (c?.running) pollChecks(); }

export const project = {
  id: 'project', title: 'Project',
  mount(el) {
    el.className = 'view ws';
    V.head = h('div', { class: 'sec' }); V.nav = h('div', { class: 'sec' });
    V.main = h('section', { class: 'stage pj-main' });
    el.append(h('aside', { class: 'l' }, V.head, V.nav), V.main);
    load();
  },
  show() { if (V.main) load(); },
};

registerWheel('project', () => ({
  tools: VIEWS.map(([id, label, tip]) => ({ label, hint: tip, on: S.view === id, run: () => go(id) })),
  guides: [{ label: 'Run game', run: () => run(false) }, { label: 'Stop game', run: () => run(true) },
    { label: 'Run the checks', run: () => { go('checks'); startChecks(); } }],
}));
registerKeys('project', [['Wheel', 'Tuning, Checks, Clips, Talk, Run game, Run the checks']]);
