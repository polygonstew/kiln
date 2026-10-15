// Forge → Background: a whole parallax background from one description of a place. Kiln writes a prompt for each
// depth layer (sky, far, middle, near, ground, foreground), generates each one on a flat magenta it can remove, and
// shows them stacked and panning like the game will. Reroll any layer, rewrite its prompt, pick between tries; then
// "Make the scene" hands them to Scenes, whose look (one palette, dither, haze) makes the layers one picture and which
// writes the Godot parallax scene.
import { h, api, toast, emit, pref, imgData, toCanvas, toDataURL, keyBackground, uid, checker, artCtx } from './core.js';
import { engineSeg, genOne, trimFrame } from './forge_kit.js';
import { icon } from './icons.js';

const KEY = 'isolated on a plain flat magenta (#ff00ff) background, nothing else on the magenta';
// [id, label, scroll speed, prompt with {place} / {time}]
const LAYERS = [
  ['sky', 'Sky', .05, 'the sky over {place} at {time}: a wide gradient sky with clouds, moon or stars, no ground, no buildings, no trees'],
  ['far', 'Far', .2, 'far distant silhouettes of {place} on the horizon at {time}, low contrast, faded by haze, a wide panorama strip, ' + KEY],
  ['mid', 'Middle', .45, '{place} in the middle distance at {time}: shapes and silhouettes, a wide panorama strip along the bottom half, ' + KEY],
  ['near', 'Near', .7, 'large near details of {place} at {time}: trunks, pillars, buildings or rocks close by, a wide panorama strip, ' + KEY],
  ['ground', 'Ground', 1, 'the ground of {place}: one long band of earth, stones, roots and plants spanning the whole width along the bottom of the picture, wide landscape, ' + KEY],
  ['front', 'Foreground', 1.3, 'very dark foreground silhouettes of {place} (plants, rubble, railings) along the bottom edge, mostly empty above, ' + KEY],
];
const TIMES = [['dawn', 'Dawn'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']];
// what keying by the border colour leaves: anything still clearly magenta (the generator's magenta varies)
function unMagenta(im) {
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) { const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; if (r > 120 && b > 60 && g < Math.min(r, b) * .55) d[i + 3] = 0; }
  return im;
}
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'background';

export function openBackgroundMaker(host) {
  const DEF = () => ({ place: '', time: 'dusk', engine: 'cloud', on: { sky: true, far: true, mid: true, near: true, ground: true, front: false }, prompts: {} });
  const S = Object.assign(DEF(), pref.get('forge.bg', {}));
  const tries = {};          // layer id → [{ url, im (keyed) }], newest first; picked: layer id → index
  const picked = {};
  let pan = 0, busy = 0, solo = null;      // solo: the one layer shown in the preview (Alt+click an eye)
  const keep = () => pref.set('forge.bg', S);
  const fresh = () => { Object.assign(S, DEF()); for (const k of Object.keys(tries)) delete tries[k]; for (const k of Object.keys(picked)) delete picked[k]; solo = null; keep(); drawLeft(); };
  const ov = h('div', { class: 'workshop fm' }), cv = h('canvas', { class: 'pp-cv', title: 'The layers stacked and panning, as the game shows them' });
  const left = h('div', { class: 'pp-side' }), right = h('div', { class: 'pp-side' });
  const close = () => { cancelAnimationFrame(raf); ov.remove(); };
  ov.append(h('div', { class: 'pp-bar' }, h('b', {}, 'Background'), h('span', {}, 'one place, in depth layers'), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm ghost', title: 'Start a new background: clears the place, prompts and tries (scenes already made stay)', onclick: () => confirm('Start a new background?\n\nWhat is on this page is cleared; scenes already made stay.') && fresh() }, 'New'),
    h('button', { class: 'btn sm go', onclick: close }, 'Back to Forge')),
    h('div', { class: 'fm-body' }, left, h('div', { class: 'pp-stage' }, cv), right));
  host.append(ov);
  const promptFor = ([id, , , tpl]) => S.prompts[id] ?? tpl.replaceAll('{place}', S.place || 'a ruined city').replaceAll('{time}', S.time);

  function drawLeft() {
    const place = h('textarea', { rows: 3, placeholder: 'Where is it? e.g. "a drowned cathedral in a misty marsh"', oninput: e => { S.place = e.target.value; keep(); drawLayers(); } }, S.place);
    left.replaceChildren(
      h('div', { class: 'wk-card' }, h('h3', {}, 'The place'), place,
        h('div', { class: 'pp-row' }, ...TIMES.map(([k, l]) => h('button', { class: 'btn sm' + (S.time === k ? ' go' : ' ghost'), title: `Light it for ${l.toLowerCase()}`, onclick: () => { S.time = k; keep(); drawLeft(); } }, l))),
        h('p', { class: 'note' }, 'Every layer gets its own prompt from this (below); change any of them.')),
      h('div', { class: 'wk-card' }, h('h3', {}, 'Generator'), engineSeg(S.engine, v => { S.engine = v; keep(); }),
        h('button', { class: 'btn go wide', style: { marginTop: '8px' }, title: 'Generate every ticked layer (one image each)', onclick: () => LAYERS.filter(L => S.on[L[0]]).forEach(make) }, 'Generate the layers'),
        h('p', { class: 'note' }, 'One image per layer. Layers you like can stay while you reroll the others.')),
      h('div', { class: 'wk-card' }, h('h3', {}, 'Into the game'),
        h('button', { class: 'btn go wide', title: 'Send the picked layers to Scenes as a new scene (it keeps them in one look and writes the Godot parallax scene)', onclick: toScenes }, 'Make the scene'),
        h('p', { class: 'note' }, 'Scenes gives the layers one palette and dither, sets their haze and speed, adds weather if you like, and saves the Godot scene.')));
    drawLayers();
  }
  // each layer: on/off, its prompt, its tries (click to pick), reroll
  function drawLayers() {
    right.replaceChildren(h('div', { class: 'wk-card' }, h('h3', {}, 'Layers', h('span', { class: 'grow' }), h('small', {}, 'back to front')),
      ...LAYERS.map(L => {
        const [id, label] = L, t = tries[id] || [];
        const ta = h('textarea', { rows: 2, class: 'fm-prompt', title: 'This layer\'s prompt (Kiln wrote it from the place; change it freely)', oninput: e => { S.prompts[id] = e.target.value; keep(); } }, promptFor(L));
        return h('div', { class: 'fm-layer' + (S.on[id] ? '' : ' off') },
          h('div', { class: 'pp-row', style: { marginTop: 0 } },
            h('button', { class: 'lp-eye' + (solo === id ? ' solo' : ''), style: { color: S.on[id] ? 'var(--ink)' : '' }, title: 'Use this layer (show / hide) · Alt+click: preview only this one',
              onclick: e => { if (e.altKey) solo = solo === id ? null : id; else { S.on[id] = !S.on[id]; keep(); } drawLayers(); paint(); } }, icon(solo === id ? 'solo' : S.on[id] ? 'eye' : 'eyeoff')), h('b', {}, label),
            h('span', { class: 'grow' }),
            S.prompts[id] != null ? h('button', { class: 'ibtn', title: 'Back to Kiln\'s prompt for this layer', onclick: () => { delete S.prompts[id]; keep(); drawLayers(); } }, '↺') : '',
            h('button', { class: 'btn sm ghost', title: 'Generate this layer (again)', onclick: () => make(L) }, t.length ? 'Reroll' : 'Make')),
          S.on[id] ? ta : '',
          t.length ? h('div', { class: 'fm-tries' }, ...t.map((x, i) => { const c = toCanvas(x.im); c.className = 'fm-try' + ((picked[id] ?? 0) === i ? ' on' : ''); c.title = 'Use this one'; c.onclick = () => { picked[id] = i; drawLayers(); paint(); }; return c; })) : '');
      })));
  }
  async function make(L) {
    const [id, label] = L;
    if (!S.place.trim()) return toast('Describe the place first', 'bad');
    busy++; paint();
    try {
      const url = await genOne(S.engine, promptFor(L), 1024, 448, `background · ${label.toLowerCase()}`, 'text, watermark, frame, border, characters, people', id === 'sky' ? 'scene' : 'layer');
      let im = trimFrame(await imgData(url));
      if (id !== 'sky') im = unMagenta(keyBackground(im, 70, true));      // the magenta goes, everywhere
      (tries[id] ||= []).unshift({ url, im }); picked[id] = 0;
    } catch (e) { toast(`${label}: ${e.message}`, 'bad'); }
    busy--; drawLayers(); paint();
  }
  // the preview: picked layers back to front at 480×270, panning by depth
  let raf = 0;
  function paint() {
    const W = 480, H = 270, box = cv.parentElement, Z = Math.max(1, Math.floor(Math.min((box.clientWidth - 30) / W, (box.clientHeight - 30) / H)));
    cv.width = W; cv.height = H; cv.style.width = W * Z + 'px'; cv.style.height = H * Z + 'px';
    const x = cv.getContext('2d'); artCtx(x, Z);
    checker(x, W, H, 8, '#202020', '#262625');
    let any = false;
    for (const [id, , scroll] of LAYERS) {
      const t = tries[id]?.[picked[id] ?? 0]; if (!S.on[id] || !t || (solo && solo !== id)) continue;
      any = true;
      const c = toCanvas(t.im), lw = W * 2, ox = -((pan * scroll) % lw);      // two screens wide, like Scenes
      for (let dx = ox - lw; dx < W; dx += lw) x.drawImage(c, Math.round(dx), 0, lw, H);
    }
    if (!any) { x.fillStyle = '#8a8679'; x.font = '13px sans-serif'; x.fillText(busy ? 'Making layers…' : 'Describe a place and press Generate the layers', 20, H / 2); }
    else if (busy) { x.fillStyle = '#000a'; x.fillRect(0, H - 18, W, 18); x.fillStyle = '#f0c24b'; x.font = '11px sans-serif'; x.fillText(`Making ${busy} more layer${busy > 1 ? 's' : ''}…`, 8, H - 6); }
  }
  const tick = () => { pan += .6; paint(); raf = requestAnimationFrame(tick); };
  // Scenes takes the picked layers as image layers (each keeps its own scroll speed)
  async function toScenes() {
    const use = LAYERS.filter(([id]) => S.on[id] && tries[id]?.length);
    if (!use.length) return toast('Make some layers first', 'bad');
    const name = slug(prompt('Name for the scene', slug(S.place)) || '');
    if (!name) return;
    const layers = use.map(([id, label, scroll]) => {
      const im = tries[id][picked[id] ?? 0].im, c = document.createElement('canvas'), k = Math.min(1, 1600 / im.width);
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(toCanvas(im), 0, 0, c.width, c.height);
      return { id: uid(), name: id, kind: 'image', srcURL: c.toDataURL('image/png'), w: 960, h: 270, y: 0, scroll, repeat: true, visible: true, key: false, tol: 30 };
    });
    const haze = { dawn: '#d9a7a0', day: '#a9c4d9', dusk: '#8a7f99', night: '#2a3550' }[S.time];
    await api('/api/project', { id: 'scene-' + name, data: { meta: { kind: 'scene', name }, scene: { id: uid(), name, view: { w: 480, h: 270 }, look: 'paint', haze, hazeAmt: .3, tod: S.time === 'night' ? -.4 : 0, layers } } });
    close(); emit('open-scene', { id: 'scene-' + name });
    toast(`"${name}" is in Scenes: set its look, haze and weather there, then Save for Godot`, 'ok');
  }
  new ResizeObserver(() => paint()).observe(ov);
  drawLeft(); tick();
}
