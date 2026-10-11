// Puppet's "Head & mouth" card: the rig's heads (its own drawn head plus any added: other views, expressions) and
// its pixel mouths. Click a head or a mouth to show it from the current frame on (a key on the head / mouth row of
// the timeline). The big preview places the mouth (click) and a swapped head's neck (Shift+click). Each head can say
// which way it looks (front, back, left, right…): Look around / Turn around use that; Try mouths / heads test them.
import { h, toast, toCanvas, toDataURL, imgData, checker, newImg } from './core.js';
import { SHAPES, mouthShapes, faceColours, headFromImage, mirror } from './face.js';

const VIEWS = [['', 'other (an expression…)'], ['front', 'Front'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right'], ['3l', '¾ left'], ['3r', '¾ right'], ['up', 'Up'], ['down', 'Down']];
const viewName = v => VIEWS.find(x => x[0] === v)?.[1] || '';

// ctx: { R, im, parts, motion(), frame(), key(row, value), push(), save(), redraw(), refaced(), pickFile(cb), voice(), bakeMouths(), tryOut(list) }
export function faceCard(ctx) {
  const { R } = ctx, headIdx = R.bones.findIndex(b => b.name === 'head');
  let sel = ctx.sel || 'drawn';
  const card = h('div', { class: 'wk-card' });
  // the drawn head: the rig drawing's head pixels, cropped (and where that crop sits in the drawing)
  const drawnHead = () => {
    const { im, parts } = ctx; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (parts[y * im.width + x] === headIdx + 1) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 < 0) return null;
    const o = newImg(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (parts[y * im.width + x] === headIdx + 1) o.data.set(im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4), ((y - y0) * o.width + x - x0) * 4);
    return { im: o, x0, y0 };
  };
  const thumb = (im, on, title, caption, click) => h('div', { class: 'pp-headw' + (on ? ' on' : ''), title, onclick: click }, Object.assign(toCanvas(im), { className: 'pp-headt' }), h('small', {}, caption));
  // the drawn head's name and view live on the rig; added heads carry their own
  const metaOf = id => id === 'drawn' ? { name: R.drawnName || 'drawn head', view: R.drawnView ?? (R.facing === -1 ? 'left' : 'right') } : (R.heads || []).find(x => x.id === id) || {};
  const setMeta = (id, k, v) => { ctx.push(); if (id === 'drawn') R[k === 'name' ? 'drawnName' : 'drawnView'] = v; else (R.heads || []).find(x => x.id === id)[k] = v; ctx.save(); draw(); };
  const headFor = view => ['drawn', ...(R.heads || []).map(x => x.id)].find(id => metaOf(id).view === view);

  async function draw() {
    const dh = drawnHead(), heads = R.heads || [];
    const imgs = await Promise.all(heads.map(hd => imgData(hd.src)));
    const cur = sel === 'drawn' ? dh && { im: dh.im, mouth: R.mouthAt && [R.mouthAt[0] - dh.x0, R.mouthAt[1] - dh.y0], neck: null } : (() => { const i = heads.findIndex(x => x.id === sel), hd = heads[i]; return hd && { im: imgs[i], mouth: hd.mouth, neck: [hd.ax, hd.ay] }; })();
    const useHead = id => { sel = id; ctx.sel = id; if (ctx.motion()) { ctx.push(); ctx.key('_head', id); } draw(); };
    // the big preview: click = mouth spot, Shift+click = neck (swapped heads)
    const pv = h('canvas', { class: 'pp-headpv', title: 'Click the face to place the mouth. Shift+click: the neck (where this head joins the body)' });
    if (cur) {
      const Z = Math.max(2, Math.floor(180 / Math.max(cur.im.width, cur.im.height)));
      pv.width = cur.im.width * Z; pv.height = cur.im.height * Z;
      const x = pv.getContext('2d'); x.imageSmoothingEnabled = false; checker(x, pv.width, pv.height, Z * 2, '#5c5c66', '#66666f');
      x.drawImage(toCanvas(cur.im), 0, 0, pv.width, pv.height);
      const dot = (p, col) => { if (!p) return; x.fillStyle = col; x.strokeStyle = '#000'; x.beginPath(); x.arc((p[0] + .5) * Z, (p[1] + .5) * Z, Math.max(3, Z / 2), 0, 7); x.fill(); x.stroke(); };
      dot(cur.mouth, '#ff5b2e'); dot(cur.neck, '#e3b04b');
      pv.onpointerdown = e => {
        const r = pv.getBoundingClientRect(), p = [Math.floor((e.clientX - r.left) / Z), Math.floor((e.clientY - r.top) / Z)];
        ctx.push();
        if (e.shiftKey && sel !== 'drawn') { const hd = heads.find(x => x.id === sel); hd.ax = p[0]; hd.ay = p[1]; }
        else if (sel === 'drawn') R.mouthAt = [dh.x0 + p[0], dh.y0 + p[1]];
        else heads.find(x => x.id === sel).mouth = p;
        if (!R.mouths) makeMouths(Math.round(cur.im.width * .3));
        ctx.save(); ctx.refaced(); draw();
      };
    }
    card.replaceChildren(h('h3', {}, 'Head & mouth', h('span', { class: 'grow' }), h('small', {}, 'click: from this frame on')),
      h('div', { class: 'pp-heads' }, dh ? thumb(dh.im, sel === 'drawn', 'The drawn head: show it from this frame on', viewName(metaOf('drawn').view) || metaOf('drawn').name, () => useHead('drawn')) : '',
        ...heads.map((hd, i) => thumb(imgs[i], sel === hd.id, `${hd.name}: show it from this frame on`, viewName(hd.view) || hd.name, () => useHead(hd.id)))),
      h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'This head'),
        h('input', { type: 'text', value: metaOf(sel).name || '', title: 'Its name', style: { width: '100px' }, onchange: e => setMeta(sel, 'name', e.target.value.trim() || 'head') }),
        Object.assign(h('select', { onchange: e => setMeta(sel, 'view', e.target.value) }, ...VIEWS.map(([k, l]) => h('option', { value: k, selected: k === (metaOf(sel).view || '') }, l))), { title: 'Which way it looks: Look around and Turn around use this' })),
      h('div', { class: 'pp-row' },
        h('button', { class: 'btn sm ghost', title: 'Key the head track: front, left, right, front (heads marked with those views)', onclick: () => look(['front', 'left', 'right', 'front']) }, 'Look around'),
        h('button', { class: 'btn sm ghost', title: 'Key the head track: right, ¾ right, front, ¾ left, left, back (the ones you have)', onclick: () => look(['right', '3r', 'front', '3l', 'left', 'back']) }, 'Turn around'),
        h('button', { class: 'btn sm ghost', title: 'Flash through every head on the figure (nothing is keyed)', onclick: () => ctx.tryOut(['drawn', ...heads.map(x => x.id), 'drawn'].map(id => ({ _head: id }))) }, 'Try heads')),
      h('div', { class: 'pp-row' },
        h('button', { class: 'btn sm', title: 'Add a head from a picture (another view or expression); kits bring their spare heads by themselves', onclick: () => ctx.pickFile(addHead) }, '+ Head…'),
        h('button', { class: 'btn sm ghost', title: 'Add a mirrored copy of this head (for looking the other way)', onclick: mirrorHead }, 'Mirror'),
        sel !== 'drawn' ? h('button', { class: 'btn sm ghost danger', title: 'Remove this head', onclick: removeHead }, 'Remove') : ''),
      cur ? h('div', { class: 'pp-headbox' }, pv) : h('p', { class: 'note' }, 'The rig has no head bone.'),
      h('p', { class: 'note', style: { marginTop: '4px' } }, cur?.mouth ? 'Mouth placed (orange). ' + (sel !== 'drawn' ? 'Neck: gold (Shift+click).' : '') : 'Click the face to place the mouth.'),
      h('div', { class: 'pp-row' }, h('span', { class: 'lbl' }, 'Mouth size'),
        h('input', { type: 'range', min: 3, max: 12, value: R.mouths?.w || 5, title: 'Width of the mouth in pixels', onchange: e => { ctx.push(); makeMouths(+e.target.value); ctx.save(); ctx.refaced(); draw(); } })),
      R.mouths ? h('div', { class: 'pp-mouths' }, ...SHAPES.map(([k, say]) => h('button', { class: 'pp-mouth', title: `${k}: ${say} (key it here)`, onclick: () => { ctx.push(); ctx.key('_mouth', k); } },
        mouthThumb(R.mouths.shapes[k]), h('small', {}, k)))) : '',
      R.mouths ? h('div', { class: 'pp-row' }, h('button', { class: 'btn sm ghost', title: 'Flash through all nine mouths on the figure, with the head showing now (nothing is keyed)', onclick: () => ctx.tryOut([...SHAPES.map(([k]) => ({ _head: sel, _mouth: k })), { _head: sel, _mouth: 'X' }]) }, 'Try mouths'),
        h('button', { class: 'btn sm ghost', title: 'Fill this motion with simple talking (no sound): mouths that open and close', onclick: flap }, 'Talk without sound'),
        h('button', { class: 'btn sm go', title: 'Lip sync: pick a voice line (WAV, OGG, MP3); its mouth shapes are worked out from the sound', onclick: ctx.voice }, 'Voice line…'),
        h('button', { class: 'btn sm ghost', title: 'An animation "mouths" with one frame per mouth shape, for lip sync in Godot', onclick: ctx.bakeMouths }, 'Bake mouth set')) : '');
  }
  function mouthThumb(src) { const c = h('canvas'); imgData(src).then(im => { c.width = 12 * 3; c.height = 8 * 3; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(toCanvas(im), Math.floor((12 - im.width) / 2) * 3, Math.floor((8 - im.height) / 2) * 3, im.width * 3, im.height * 3); }); return c; }
  function makeMouths(w) {
    const shapes = mouthShapes(w, faceColours(ctx.im, ctx.parts, headIdx + 1));
    R.mouths = { w: Math.max(3, Math.min(12, w)), shapes: Object.fromEntries(Object.entries(shapes).map(([k, im]) => [k, toDataURL(im)])) };
  }
  async function addHead(url) {
    const hd = await headFromImage(url);
    if (!hd) return toast('No picture found there', 'bad');
    ctx.push();
    const id = 'h' + Date.now().toString(36);
    (R.heads ||= []).push({ id, name: 'head ' + (R.heads.length + 2), src: toDataURL(hd.im), ax: hd.ax, ay: hd.ay, mouth: null });
    sel = id; ctx.sel = id; ctx.save(); ctx.refaced(); draw(); toast('Head added: click its face to place the mouth', 'ok');
  }
  async function mirrorHead() {
    const dh = drawnHead(), src = sel === 'drawn' ? dh && { im: dh.im, ax: (R.bones[headIdx]?.x ?? 0) - dh.x0, ay: (R.bones[headIdx]?.y ?? 0) - dh.y0, mouth: R.mouthAt && [R.mouthAt[0] - dh.x0, R.mouthAt[1] - dh.y0] }
      : await (async () => { const hd = R.heads.find(x => x.id === sel); return { im: await imgData(hd.src), ax: hd.ax, ay: hd.ay, mouth: hd.mouth }; })();
    if (!src) return;
    ctx.push();
    const w = src.im.width, id = 'h' + Date.now().toString(36);
    (R.heads ||= []).push({ id, name: 'mirrored', src: toDataURL(mirror(src.im)), ax: w - 1 - src.ax, ay: src.ay, mouth: src.mouth && [w - 1 - src.mouth[0], src.mouth[1]] });
    sel = id; ctx.sel = id; ctx.save(); ctx.refaced(); draw();
  }
  function removeHead() {
    ctx.push(); R.heads = R.heads.filter(x => x.id !== sel);
    for (const m of R.motions || []) for (const [f, k] of Object.entries(m.keys?._head || {})) if (k.v === sel) delete m.keys._head[f];
    sel = 'drawn'; ctx.sel = sel; ctx.save(); ctx.refaced(); draw();
  }
  // Look around / Turn around: the heads with those views, keyed in turn across the motion (it grows if too short)
  function look(views) {
    const m = ctx.motion(); if (!m) return;
    const ids = views.map(headFor).filter(Boolean).filter((id, i, a) => id !== a[i - 1]);
    if (new Set(ids).size < 2) return toast('Mark at least two heads with their view first (This head: Front, Left, Right…)', 'bad');
    ctx.push();
    if (m.n < ids.length * 4) m.n = ids.length * 4;
    const step = Math.floor(m.n / ids.length);
    m.keys._head = {}; ids.forEach((id, i) => { m.keys._head[i * step] = { v: id, tween: false, ease: 0 }; });
    ctx.save(); ctx.redraw(); toast(`Head track: ${ids.map(id => viewName(metaOf(id).view)).join(' → ')}`, 'ok');
  }
  // simple talking without a sound: a mouth every two frames, never the same twice
  function flap() {
    const m = ctx.motion(); if (!m) return;
    ctx.push();
    const seq = ['C', 'B', 'D', 'X', 'E', 'B', 'C', 'A', 'D', 'B', 'F', 'X'];
    m.keys._mouth = {};
    for (let t = 0, i = 0; t < m.n; t += 2, i++) m.keys._mouth[t] = { v: seq[i % seq.length], tween: false, ease: 0 };
    ctx.save(); ctx.redraw(); toast(`"${m.name}" talks: ${Math.ceil(m.n / 2)} mouth keys`, 'ok');
  }
  draw();
  return card;
}
