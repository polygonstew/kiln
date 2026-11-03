// Project → Talk: a voice line becomes mouth cues for the game. Type the line and one of Slate's voices says it, or open a sound;
// lipsync.js works out Kiln's nine shapes in the browser; toBlair() names them after the clay mouths the project baked
// (art/mouths/mouths.json); Save writes the cues to data/lines/<name>.json and the sound to art/voice/. game/mouth.gd plays them.
// Used by project.js.
import { h, api, toast, pref } from './core.js';
import { decode, analyse } from './lipsync.js';

// Kiln's shapes (face.js SHAPES) -> the replacement mouths. OO and W share a pucker: a quick one is W, a held one is U.
const BLAIR = { X: 'rest', A: 'mbp', B: 'e', C: 'e', D: 'ai', E: 'o', G: 'fv', H: 'l' };
export function toBlair(cues) {
  return cues.map(([t, s], i) => [t, s === 'F' ? ((cues[i + 1]?.[0] ?? t + 1) - t < 0.11 ? 'wq' : 'u') : BLAIR[s] || 'rest']);
}

const T = { line: null, playing: 0 };
const raw = p => '/api/fs/raw?path=' + encodeURIComponent(p);

export async function talkView(box, info, body) {
  const d = await api('/api/gp/lines?root=' + encodeURIComponent(info.root)).catch(e => (toast(e.message, 'bad'), null));
  if (!d) return;
  const M = d.mouths?.rad;
  if (!M) { box.replaceChildren(h('header', { class: 'pj-bar' }, h('b', {}, 'Talk')), h('p', { class: 'note', style: { padding: '14px 16px' } }, 'No mouths baked yet: art/mouths/mouths.json is not there.')); return; }
  const cv = h('canvas', { width: 220, height: 220 });
  const imgs = {};
  const head = new Image(); head.src = raw(`${d.root}/${M.head}`);
  await head.decode().catch(() => {});
  for (const n of Object.keys(M.shapes)) { imgs[n] = new Image(); imgs[n].src = raw(`${d.root}/art/mouths/rad/${n}.png`); await imgs[n].decode().catch(() => {}); }
  const paint = shape => {
    const x = cv.getContext('2d'), s = 2, ox = (cv.width - head.width * s) / 2, oy = (cv.height - head.height * s) / 2;
    x.clearRect(0, 0, cv.width, cv.height); x.fillStyle = '#5f7684'; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(head, ox, oy, head.width * s, head.height * s);
    const m = M.shapes[shape] || M.shapes.rest, im = imgs[shape] || imgs.rest, k = s * (M.scale || 1);   // mouths bake at twice the sprite size
    x.drawImage(im, ox + M.at[0] * s - m.anchor[0] * k, oy + M.at[1] * s - m.anchor[1] * k, im.width * k, im.height * k);
  };
  const say = h('span', { class: 'faint mono' }, '');
  const list = h('div', { class: 'pj-gates' });
  const play = (line, url) => {
    const a = new Audio(url); T.playing++;
    const me = T.playing;
    a.onplay = () => (function step() {
      if (me !== T.playing || a.ended) { paint('rest'); return; }
      const now = a.currentTime; let s = 'rest';
      for (const [t, n] of line.cues) { if (t > now) break; s = n; }
      paint(s); say.textContent = `${now.toFixed(2)} s  ${s}`;
      requestAnimationFrame(step);
    })();
    a.play().catch(e => toast(e.message, 'bad'));
  };
  const name = h('input', { placeholder: 'Line name', value: 'line_1' });
  const useSound = async (buf, ext, suggested) => {
    const sound = await decode(buf.slice(0)).catch(err => (toast('Could not read that sound: ' + err.message, 'bad'), null));
    if (!sound) return;
    const cues = toBlair(analyse(sound).cues);
    T.line = { cues, duration: sound.duration, url: URL.createObjectURL(new Blob([buf])), ext, buf };
    name.value = suggested.replace(/[^\w-]+/g, '_').slice(0, 32);
    say.textContent = `${sound.duration.toFixed(2)} s, ${cues.length} mouth changes`;
    save.disabled = false; play(T.line, T.line.url);
  };
  const pick = h('input', { type: 'file', accept: 'audio/*', style: { display: 'none' }, onchange: async e => {
    const f = e.target.files[0]; if (f) useSound(await f.arrayBuffer(), f.name.split('.').pop(), f.name.replace(/\.[^.]+$/, ''));
  } });
  // typed lines: Slate speaks them (Kokoro on this machine, nothing to pay for)
  const v = await api('/api/gp/voices').catch(() => ({ ok: false }));
  const typed = h('input', { class: 'pj-line', placeholder: 'What does he say?', value: pref.get('gp.line', '') });
  const voice = h('select', { title: 'Who says it (the voices in Slate)', onchange: () => pref.set('gp.voice', voice.value) },
    ...(v.kokoro || []).filter(n => /^[ab]m_/.test(n)).map(n => h('option', { value: 'kokoro|' + n }, n.slice(3))),
    ...(v.clones || []).map(c => h('option', { value: 'pocket|clone:' + c.slug }, c.name)),
    ...(v.kokoro || []).filter(n => !/^[ab]m_/.test(n)).map(n => h('option', { value: 'kokoro|' + n }, n.slice(3))));
  voice.value = pref.get('gp.voice', 'kokoro|am_puck');
  const speak = h('button', { class: 'btn go', title: 'Say it in this voice, and work out the mouths', onclick: async () => {
    const [engine, id] = voice.value.split('|');
    pref.set('gp.line', typed.value);
    speak.disabled = true; say.textContent = 'Speaking…';
    const r = await api('/api/gp/speak', body({ text: typed.value, engine, voice: id })).catch(e => (toast(e.message, 'bad'), null));
    speak.disabled = false;
    if (!r) { say.textContent = ''; return; }
    const bytes = Uint8Array.from(atob(r.b64), c => c.charCodeAt(0));
    useSound(bytes.buffer, r.ext, typed.value.split(/\s+/).slice(0, 4).join('_').toLowerCase());
  } }, 'Say it');
  const save = h('button', { class: 'btn go', disabled: true, 'data-file': 'save', 'data-noun': 'line', onclick: async () => {
    const bytes = new Uint8Array(T.line.buf); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const r = await api('/api/gp/line', body({ name: name.value, cues: T.line.cues, duration: T.line.duration, ext: T.line.ext, audio_b64: btoa(bin) })).catch(e => toast(e.message, 'bad'));
    if (r?.ok) { toast(`Saved data/lines/${r.name}.json`); talkView(box, info, body); }
  } }, 'Save for the game');
  list.replaceChildren(...d.lines.map(l => h('div', { class: 'pj-gate ok' }, h('button', { class: 'btn sm', disabled: !l.audio, onclick: () => play(l, raw(`${d.root}/${l.audio}`)) }, '▶'),
    h('span', { class: 'mono' }, l.name), h('div', {}, `${(+l.duration).toFixed(2)} s, ${l.cues.length} mouth changes`))));
  box.replaceChildren(h('header', { class: 'pj-bar' }, h('b', {}, 'Talk'), v.ok ? [typed, voice, speak] : h('span', { class: 'faint' }, 'Slate is not running: open a sound instead'),
    h('button', { class: 'btn ghost', title: 'Use a sound you already have', onclick: () => pick.click() }, 'Open a sound…'), name, save, say), pick,
    h('div', { class: 'pj-cv' }, cv), list);
  paint('rest');
}
