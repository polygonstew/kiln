// Project → Clips: every baked animation of a Godot project (art/hollow/hollow.json) played on twos at 12 fps: pick a creature
// and a clip, step through it, see which drawings can hurt (gold), rebake on the free GPU. Used by project.js.
import { h, api, toast, thumbURL, sleep } from './core.js';

const C = { key: null, clip: null, frame: 0, playing: true, half: false, timer: 0, frames: [], samples: 48 };
const raw = p => '/api/fs/raw?path=' + encodeURIComponent(p);
const name = (root, key, clip, i) => `${root}/art/hollow/${key}/${clip}_${String(i).padStart(2, '0')}.png`;

export async function clipsView(box, info, body) {
  stop();
  const d = await api('/api/gp/clips?root=' + encodeURIComponent(info.root)).catch(e => (toast(e.message, 'bad'), null));
  if (!d) return;
  const keys = Object.keys(d.creatures);
  if (!keys.length) { box.replaceChildren(h('p', { class: 'note' }, 'No clips baked yet: art/hollow/hollow.json is not there.')); return; }
  if (!d.creatures[C.key]) { C.key = keys[0]; C.clip = null; }
  const list = h('div', { class: 'pj-clist' });
  const stage = h('div', { class: 'pj-cstage' });
  const drawList = () => list.replaceChildren(...keys.map(k => {
    const c = d.creatures[k], first = Object.keys(c.clips)[0];
    return h('button', { class: 'pj-cr' + (k === C.key ? ' on' : ''), title: Object.entries(c.clips).map(([n, v]) => `${n}: ${v.frames} drawings`).join(', '),
      onclick: () => { C.key = k; C.clip = null; drawList(); drawClip(); } },
    h('img', { src: thumbURL(name(d.root, k, first, 0), 128), loading: 'lazy', alt: '' }), h('span', {}, c.name));
  }));
  const bakeBox = h('div', { class: 'pj-bake' });

  async function drawClip() {
    stop();
    const c = d.creatures[C.key];
    if (!c.clips[C.clip]) C.clip = Object.keys(c.clips).find(n => n !== 'idle') || Object.keys(c.clips)[0];
    const m = c.clips[C.clip], cv = h('canvas', { width: c.size[0], height: c.size[1] }), read = h('span', { class: 'faint mono' });
    C.frames = []; C.frame = 0;
    for (let i = 0; i < m.frames; i++) { const im = new Image(); im.src = raw(name(d.root, C.key, C.clip, i)); C.frames.push(im); }
    await Promise.all(C.frames.map(im => im.decode().catch(() => {})));
    const hit = new Set(m.hit);
    const strip = h('div', { class: 'pj-strip' }, ...C.frames.map((im, i) => h('button', { class: hit.has(i) ? 'hit' : '', title: `Drawing ${i + 1}` + (hit.has(i) ? ': can hit' : ''),
      onclick: () => { C.playing = false; C.frame = i; paint(); sync(); } }, h('img', { src: im.src, alt: '' }))));
    const paint = () => {
      const x = cv.getContext('2d'), s = C.half ? 0.5 : 1;
      cv.width = c.size[0] * s; cv.height = c.size[1] * s;
      x.fillStyle = '#5f7684'; x.fillRect(0, 0, cv.width, cv.height);
      const gy = c.anchor[1] * s;
      x.fillStyle = '#4b5a5f'; x.fillRect(0, gy, cv.width, cv.height - gy);
      x.drawImage(C.frames[C.frame], 0, 0, cv.width, cv.height);
      read.textContent = `${C.frame + 1} / ${m.frames} · ${(m.frames / 12).toFixed(2)} s`;
      [...strip.children].forEach((b, i) => b.classList.toggle('on', i === C.frame));
    };
    const toggle = h('button', { class: 'btn sm' }, '');
    const sync = () => { toggle.textContent = C.playing ? '❚❚ Pause' : '▶ Play'; };
    toggle.onclick = () => { C.playing = !C.playing; sync(); };
    const size = h('button', { class: 'btn sm ghost', title: 'Sprites bake at twice the size the game draws them', onclick: () => { C.half = !C.half; size.textContent = C.half ? 'Game size' : 'Full size'; paint(); } }, C.half ? 'Game size' : 'Full size');
    const tabs = Object.keys(c.clips).map(n => h('button', { class: 'pj-nav mini' + (n === C.clip ? ' on' : ''), onclick: () => { C.clip = n; drawClip(); } }, n));
    stage.replaceChildren(h('header', { class: 'pj-bar' }, h('b', {}, c.name), ...tabs, toggle, size, read), h('div', { class: 'pj-cv' }, cv), strip, bakeBox);
    sync(); paint();
    const loop = () => {
      C.timer = setTimeout(() => {
        if (C.playing) {
          C.frame = C.frame + 1 < m.frames ? C.frame + 1 : 0;
          paint();
          if (C.frame === 0 && !m.loop) { C.timer = setTimeout(loop, 420); return; }   // a held breath between attacks
        }
        loop();
      }, 1000 / 12);
    };
    if (cv.isConnected) loop();
  }

  async function drawBake() {
    const b = await api('/api/gp/bake').catch(() => null);
    if (!b) return;
    const samples = h('input', { type: 'number', min: 4, max: 256, value: C.samples, title: 'Render samples: 16 to judge poses, 48 to keep', oninput: e => { C.samples = +e.target.value; } });
    const go = all => async () => {
      await api('/api/gp/bake', body({ creatures: all ? [] : [C.key], samples: C.samples })).catch(e => toast(e.message, 'bad'));
      watch();
    };
    bakeBox.replaceChildren(h('div', { class: 'row' }, h('b', {}, 'Rebake on the free GPU'), h('label', {}, 'samples ', samples),
      h('button', { class: 'btn sm', disabled: b.running, onclick: go(false) }, 'This creature'), h('button', { class: 'btn sm ghost', disabled: b.running, onclick: go(true) }, 'All of them')),
    b.log.length ? h('pre', { class: 'pj-log' }, b.log.slice(-8).join('\n')) : '');
    return b;
  }
  async function watch() {
    for (;;) {
      const b = await drawBake();
      if (!b?.running) { if (b?.ok) { toast('Rebaked: the new drawings are in'); clipsView(box, info, body); } return; }
      await sleep(4000);
    }
  }

  box.replaceChildren(h('div', { class: 'pj-clips' }, list, stage));
  drawList();
  await drawClip();
  watch();
}

function stop() { clearTimeout(C.timer); }
