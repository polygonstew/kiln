// Dialogue preview: plays a conversation the way the game will (dialogue_godot.js runner): lines typed out in a box,
// Space / click to go on, choices as buttons, conditions and effects on pretend items and flags (tick them to try
// every branch), and each voice line played with the speaker's mouth moving (its baked "mouths" strip + the cues).
import { h, rawURL, imgData, toCanvas } from './core.js';
import { S as FS } from './files.js';
import { gameJSON } from './dialogue_godot.js';
import { shapeAt } from './lipsync.js';

const SHAPES = 'XABCDEFGH';

export function dialoguePlayer() {
  let G = null, beat = null, typing = 0, shown = 0, audio = null, raf = 0, mouths = null;
  const state = { items: new Set(), flags: new Set() };
  const who = h('div', { class: 'dp-who' }), text = h('div', { class: 'dp-text' }), face = h('canvas', { class: 'dp-face' });
  const choices = h('div', { class: 'dp-choices' }), more = h('div', { class: 'dp-more' }, '▼'), sim = h('div', { class: 'dp-sim' });
  const box = h('div', { class: 'dp-box', tabIndex: 0, title: 'Click or Space: go on', onclick: next, onkeydown: e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); } } },
    face, h('div', { class: 'dp-body' }, who, text, more), choices);
  const el = h('div', { class: 'dp' }, box, h('div', { class: 'dp-bar' }, h('button', { class: 'btn sm', title: 'From the first line', onclick: () => start() }, '↺ From the top'), h('span', { class: 'grow' })), sim);

  function load(d) { G = gameJSON(d, ''); drawSim(d); start(); }
  function start() { stop(); state.flags.clear(); if (G) show(G.start); }
  function stop() { audio?.pause(); audio = null; cancelAnimationFrame(raf); clearInterval(typing); }
  const allowed = c => { const [k, v] = Object.entries(c || {})[0] || []; return !k || (k === 'item' ? state.items.has(v) : k === 'noitem' ? !state.items.has(v) : k === 'flag' ? state.flags.has(v) : k === 'noflag' ? !state.flags.has(v) : true); };
  const apply = list => { for (const e of list || []) { const [k, v] = Object.entries(e)[0]; if (k === 'give') state.items.add(v); if (k === 'take') state.items.delete(v); if (k === 'flag') state.flags.add(v); if (k === 'unflag') state.flags.delete(v); } drawSimState(); };

  async function show(id) {
    stop(); beat = G?.beats[id];
    if (!beat) { who.textContent = ''; text.textContent = '(the end)'; choices.replaceChildren(); more.style.visibility = 'hidden'; face.style.display = 'none'; return; }
    apply(beat.do);
    who.textContent = beat.who || ''; text.textContent = ''; shown = 0; more.style.visibility = 'hidden';
    typing = setInterval(() => { shown++; text.textContent = beat.text.slice(0, shown); if (shown >= beat.text.length) { clearInterval(typing); typing = 0; afterTyping(); } }, 28);
    choices.replaceChildren();
    face.style.display = 'none'; mouths = null;
    if (beat.voice) speak(beat);
  }
  function afterTyping() {
    const cs = (beat.choices || []).filter(c => allowed(c.if));
    if (cs.length) choices.replaceChildren(...cs.map(c => h('button', { class: 'dp-choice', onclick: e => { e.stopPropagation(); apply(c.do); show(c.next); } }, '▸ ' + c.text)));
    else more.style.visibility = 'visible';
  }
  function next() {
    if (!beat) return;
    if (typing) { clearInterval(typing); typing = 0; text.textContent = beat.text; afterTyping(); return; }
    if ((beat.choices || []).some(c => allowed(c.if))) return;      // waiting for a choice
    show(beat.next);
  }
  // the voice: the sound plays; the speaker's mouths strip (one frame per shape) follows the cues
  async function speak(b) {
    const cues = await fetch(rawURL(FS.root + '/' + b.voice)).then(r => r.json()).catch(() => null);
    if (!cues || beat !== b) return;
    audio = new Audio(rawURL(FS.root + '/' + b.voice.replace(/[^/]+$/, '') + cues.sound)); audio.play().catch(() => {});
    if (b.actor) {
      const strip = await imgData(rawURL(`${FS.root}/sprites/${b.actor}/mouths.png`)).catch(() => null);
      if (strip && beat === b) {
        const fw = strip.width / 9, cv = toCanvas(strip), Z = Math.max(1, Math.floor(96 / Math.max(fw, strip.height)));
        face.width = fw * Z; face.height = strip.height * Z; face.style.display = '';
        const x = face.getContext('2d'); x.imageSmoothingEnabled = false;
        const tick = () => { const i = Math.max(0, SHAPES.indexOf(shapeAt(cues.cues, audio?.currentTime || 0))); x.clearRect(0, 0, face.width, face.height); x.drawImage(cv, i * fw, 0, fw, strip.height, 0, 0, face.width, face.height); if (audio && !audio.ended) raf = requestAnimationFrame(tick); };
        tick();
      }
    }
  }
  // pretend items and flags, to try every branch (the ones this dialogue mentions)
  function drawSim(d) {
    const items = new Set(), flags = new Set();
    for (const b of d.beats) for (const x of [...(b.do || []), ...(b.choices || []).flatMap(c => [...(c.do || []), c.if || {}])]) {
      if (['give', 'take', 'item', 'noitem'].includes(x.k) && x.v) items.add(x.v);
      if (['flag', 'unflag', 'noflag'].includes(x.k) && x.v) flags.add(x.v);
    }
    sim.replaceChildren(items.size ? h('div', {}, h('span', { class: 'lbl' }, 'Has items '), ...[...items].map(v => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: state.items.has(v), onchange: e => { e.target.checked ? state.items.add(v) : state.items.delete(v); } }), ' ' + v))) : '',
      h('div', { class: 'dp-flags' }));
    drawSimState();
  }
  const drawSimState = () => { const f = sim.querySelector('.dp-flags'); if (f) f.textContent = state.flags.size ? 'Flags set: ' + [...state.flags].join(', ') : ''; sim.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = state.items.has(c.parentElement.textContent.trim()); }); };
  return { el, load, stop };
}
