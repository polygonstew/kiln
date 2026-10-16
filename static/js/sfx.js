// Retro sound effects, made from numbers in the spirit of sfxr: a tone (square, saw, sine or noise) with a pitch
// sweep, an envelope, vibrato, an arpeggio jump and a low-pass filter. Presets roll fresh variations; sounds are
// stored as their parameters (tiny) and written as 16-bit WAV files Godot plays as they are.
import { h, toast } from './core.js';
import { saveFiles } from './files.js';

const SR = 22050, R = (a, b) => a + Math.random() * (b - a), pick = (...o) => o[Math.floor(Math.random() * o.length)];
const BASE = { wave: 'square', f0: 440, f1: 440, attack: 0, sustain: .1, punch: 0, decay: .2, duty: .5, vibDepth: 0, vibSpeed: 0, arpAt: 0, arpMul: 1, lowpass: 1, volume: .5 };

// each preset rolls a new variation
export const PRESETS = {
  coin: () => ({ wave: 'square', f0: R(800, 1500), f1: 0, sustain: R(.03, .08), decay: R(.15, .3), arpAt: R(.04, .09), arpMul: R(1.3, 1.6), duty: R(.3, .5) }),
  jump: () => ({ wave: 'square', f0: R(220, 380), f1: R(550, 900), sustain: R(.04, .1), decay: R(.1, .2), duty: R(.25, .5) }),
  shoot: () => ({ wave: pick('saw', 'square'), f0: R(1100, 2000), f1: R(150, 400), sustain: R(.02, .08), decay: R(.1, .25), duty: R(.2, .5) }),
  hit: () => ({ wave: pick('noise', 'square'), f0: R(300, 700), f1: R(80, 200), sustain: R(.01, .05), decay: R(.08, .2), punch: R(.2, .6), lowpass: R(.6, 1) }),
  hurt: () => ({ wave: pick('square', 'saw'), f0: R(400, 700), f1: R(90, 200), sustain: R(.02, .06), decay: R(.12, .25), lowpass: R(.6, .9), duty: R(.3, .6) }),
  explosion: () => ({ wave: 'noise', f0: R(80, 260), f1: R(20, 60), sustain: R(.08, .2), decay: R(.35, .7), punch: R(.3, .7), volume: .6 }),
  die: () => ({ wave: pick('square', 'saw'), f0: R(500, 800), f1: R(40, 90), sustain: R(.05, .15), decay: R(.5, .9), vibDepth: R(.05, .15), vibSpeed: R(6, 14) }),
  powerup: () => ({ wave: 'square', f0: R(250, 400), f1: R(800, 1300), sustain: R(.15, .3), decay: R(.2, .35), vibDepth: R(.02, .08), vibSpeed: R(10, 20) }),
  blip: () => ({ wave: pick('square', 'sine'), f0: R(500, 1100), f1: 0, sustain: R(.02, .05), decay: R(.03, .08), duty: .5 }),
};
export const roll = kind => ({ ...BASE, ...PRESETS[kind](), kind });

// parameters → Float32 samples (mono, SR)
export function synth(p) {
  p = { ...BASE, ...p };
  const T = p.attack + p.sustain + p.decay, n = Math.max(1, Math.round(T * SR)), out = new Float32Array(n);
  const f1 = p.f1 || p.f0, a = Math.min(1, p.lowpass * p.lowpass);
  let ph = 0, y = 0, noise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / T;
    let f = p.f0 * Math.pow(f1 / p.f0, k);
    if (p.arpAt && t >= p.arpAt) f *= p.arpMul;
    if (p.vibDepth) f *= 1 + p.vibDepth * Math.sin(2 * Math.PI * p.vibSpeed * t);
    const prev = ph; ph += f / SR;
    if (Math.floor(ph * 2) !== Math.floor(prev * 2)) noise = Math.random() * 2 - 1;
    const fr = ph % 1;
    const x = p.wave === 'square' ? (fr < p.duty ? 1 : -1) : p.wave === 'saw' ? 2 * fr - 1 : p.wave === 'sine' ? Math.sin(2 * Math.PI * fr) : noise;
    const env = t < p.attack ? t / p.attack : t < p.attack + p.sustain ? 1 + p.punch * (1 - (t - p.attack) / Math.max(1e-6, p.sustain)) : Math.max(0, 1 - (t - p.attack - p.sustain) / p.decay);
    y += a * (x - y);
    out[i] = Math.max(-1, Math.min(1, y * env * p.volume));
  }
  return out;
}
// 16-bit mono PCM WAV as a data URL
export function wav(samples) {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2)), s = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); b.setUint32(4, 36 + samples.length * 2, true); s(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, SR, true); b.setUint32(28, SR * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, 'data'); b.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => b.setInt16(44 + i * 2, v * 32767, true));
  let bin = ''; const u = new Uint8Array(b.buffer); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}
let ctx = null;
export function play(p) {
  try {
    ctx ||= new AudioContext();
    const d = synth(p), buf = ctx.createBuffer(1, d.length, SR); buf.copyToChannel(d, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
  } catch (e) { toast('This browser cannot play sound: ' + e.message, 'bad'); }
}

// a row of controls for one sound: preset, play, roll again, and a few knobs that matter most
export function sfxRow(label, p, set, remove) {
  const knob = (k, lab, mn, mx, st) => h('label', { class: 'sfx-k', title: lab }, h('span', {}, lab),
    h('input', { type: 'range', min: mn, max: mx, step: st, value: p[k], oninput: e => { p[k] = +e.target.value; set(p, false); }, onchange: () => play(p) }));
  return h('div', { class: 'sfx-row' },
    h('div', { class: 'sfx-h' }, h('b', {}, label),
      h('select', { title: 'Kind of sound', onchange: e => { set(roll(e.target.value), true); } }, ...Object.keys(PRESETS).map(k => h('option', { value: k, selected: k === p.kind }, k))),
      h('button', { class: 'btn sm', title: 'Play', onclick: () => play(p) }, '▶'),
      h('button', { class: 'btn sm ghost', title: 'Roll a new variation of this kind', onclick: () => { const n = roll(p.kind || 'blip'); set(n, true); play(n); } }, '⚂'),
      remove ? h('button', { class: 'ibtn', title: 'No sound for this', onclick: remove }, '✕') : ''),
    h('div', { class: 'sfx-ks' }, knob('f0', 'Pitch', 40, 2400, 10), knob('f1', 'Sweep to', 0, 2400, 10), knob('decay', 'Length', .03, 1.2, .01), knob('lowpass', 'Bright', .1, 1, .01),
      h('label', { class: 'sfx-k', title: 'Wave' }, h('span', {}, 'Wave'), h('select', { onchange: e => { p.wave = e.target.value; set(p, false); play(p); } }, ...['square', 'saw', 'sine', 'noise'].map(w => h('option', { value: w, selected: w === p.wave }, w))))));
}

// Tools → Sound effects…: make loose sounds (UI, pickups, doors) and save them to sfx/<name>.wav
export function openSfxDesigner() {
  let p = roll('coin');
  const body = h('div', { class: 'body' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(560px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Sound effects'), h('button', { class: 'ibtn', onclick: () => m.remove() }, '✕')), body));
  const name = h('input', { type: 'text', value: 'coin', style: { width: '160px' } });
  const draw = () => body.replaceChildren(
    h('div', { class: 'sfx-presets' }, ...Object.keys(PRESETS).map(k => h('button', { class: 'btn sm' + (p.kind === k ? ' on' : ''), onclick: () => { p = roll(k); name.value = k; draw(); play(p); } }, k))),
    sfxRow('Sound', p, (n, redraw) => { p = n; if (redraw) draw(); }),
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px' } }, h('span', { class: 'faint' }, 'sfx/'), name, h('span', { class: 'faint' }, '.wav'), h('span', { class: 'grow' }),
      h('button', { class: 'btn go', onclick: async () => { const n = name.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'sound'; await saveFiles('sfx', [{ name: n + '.wav', b64: wav(synth(p)) }]); toast(`Saved sfx/${n}.wav`, 'ok'); } }, 'Save')),
    h('p', { class: 'note' }, 'Click a kind to roll a new one, ⚂ for another variation of it. In Godot: an AudioStreamPlayer with this file, or $Sound.play().'));
  draw(); document.body.append(m); play(p);
}
