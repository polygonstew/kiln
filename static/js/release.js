// Export game (File menu): the game the Stage plays, made for players. Name, version and an icon (an actor's first
// frame or an item icon, scaled up with square pixels), the window (size, fullscreen, sharp pixels), then which
// targets: Web (itch.io), Windows, Linux, macOS, the Godot project. The server (release.py) exports each one into a
// zip; they appear here to download. What goes in the game (level, player, HUD, menus) is the Stage's choice.
import { h, api, pref, field, check, seg, toast, emit } from './core.js';
import { S as FS } from './files.js';
import { gameFiles, gamePicks } from './playbuild.js';

const SIZES = [[2, '2×', '960×540'], [3, '3×', '1440×810'], [4, '4×', '1920×1080']];
const DEFAULT_ON = ['web', 'windows', 'linux'];
const nameOf = res => (res || '').split('/').pop().replace(/\.tscn$/, '');
const ago = t => { const s = Date.now() / 1000 - t; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t * 1000).toLocaleDateString(); };
const ls = async p => ((await api('/api/fs?path=' + encodeURIComponent(p)).catch(() => ({ items: [] }))).items || []);
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

// images that make a good icon: each actor's first frame (idle first), then item icons
async function iconChoices() {
  const out = [];
  for (const d of (await ls(FS.root + '/sprites')).filter(i => i.dir && !i.name.startsWith('_'))) {
    const m = await fetch('/api/fs/raw?path=' + encodeURIComponent(`${d.path}/manifest.json`)).then(r => r.ok ? r.json() : null).catch(() => null);
    const a = m?.anims && (m.anims.idle || Object.values(m.anims)[0]);
    if (a?.file) out.push({ label: d.name, src: `${d.path}/${a.file}`, fw: m.w, fh: m.h });
  }
  for (const set of (await ls(FS.root + '/icons')).filter(i => i.dir))
    for (const f of (await ls(set.path)).filter(i => /\.png$/.test(i.name) && i.name !== 'sheet.png')) out.push({ label: f.name.replace('.png', ''), src: f.path });
  return out;
}
// the icon: the picture's first frame, trimmed to what is drawn, scaled by whole steps into 256×256 (square pixels)
async function iconPNG(c) {
  const img = await loadImg('/api/fs/raw?path=' + encodeURIComponent(c.src));
  const fw = Math.min(c.fw || img.width, img.width), fh = Math.min(c.fh || img.height, img.height);
  const cv = h('canvas', { width: fw, height: fh }), x = cv.getContext('2d');
  x.drawImage(img, 0, 0, fw, fh, 0, 0, fw, fh);
  const d = x.getImageData(0, 0, fw, fh).data;
  let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let i = 0; i < fw; i++) if (d[(y * fw + i) * 4 + 3] > 8) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) { x0 = y0 = 0; x1 = fw - 1; y1 = fh - 1; }
  const w = x1 - x0 + 1, hh = y1 - y0 + 1, k = Math.max(1, Math.floor(232 / Math.max(w, hh)));
  const o = h('canvas', { width: 256, height: 256 }), ox = o.getContext('2d');
  ox.imageSmoothingEnabled = false;
  ox.drawImage(cv, x0, y0, w, hh, Math.round((256 - w * k) / 2), Math.round((256 - hh * k) / 2), w * k, hh * k);
  return o.toDataURL('image/png');
}

export async function openRelease() {
  const S = Object.assign({ name: FS.root.split('/').pop(), version: '1.0', scale: 3, fullscreen: false, pixel: true, on: DEFAULT_ON, icon: '' }, pref.get('release', {}));
  const keep = () => pref.set('release', S);
  const body = h('div', { class: 'body rl' });
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m && !busy) m.remove(); } }, h('div', { style: { width: 'min(760px, 96vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Export your game'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
  body.append(h('p', { class: 'note' }, 'Getting your game ready…'));
  let busy = false, st = await api('/api/release/status');
  const pick = await gamePicks(), choices = await iconChoices();
  if (!S.icon || !choices.some(c => c.src === S.icon)) S.icon = (choices.find(c => c.label === nameOf(pick.player)) || choices[0])?.src || '';
  const logEl = h('pre', { class: 'play-log', style: { display: 'none' } }), made = h('div');

  function draw() {
    const icons = h('div', { class: 'rl-icons' }, ...choices.slice(0, 40).map(c => {
      const b = h('button', { class: 'rl-icon' + (c.src === S.icon ? ' on' : ''), title: c.label, onclick: () => { S.icon = c.src; keep(); draw(); } });
      iconPNG(c).then(u => b.style.backgroundImage = `url(${u})`).catch(() => b.remove());
      return b;
    }), h('button', { class: 'rl-icon none' + (S.icon ? '' : ' on'), title: 'No icon (Godot\'s own)', onclick: () => { S.icon = ''; keep(); draw(); } }, 'none'));
    const what = [pick.level ? 'level ' + nameOf(pick.level) : pick.bg ? 'background ' + nameOf(pick.bg) : 'a flat floor',
      pick.player ? 'player ' + nameOf(pick.player) : 'no player', pick.hud ? 'HUD ' + nameOf(pick.hud) : 'no HUD',
      { menu: 'your title menu', title: 'a plain title', none: 'straight into play' }[pick.start || 'none']];
    body.replaceChildren(
      h('div', { class: 'rl-cols' },
        h('div', {},
          h('h3', {}, 'The game'),
          field('Name', h('input', { type: 'text', value: S.name, oninput: e => { S.name = e.target.value; keep(); } }), 'On the window, the icon and the files'),
          field('Version', h('input', { type: 'text', value: S.version, style: { width: '90px' }, oninput: e => { S.version = e.target.value; keep(); } })),
          h('div', { class: 'fl', style: { margin: '10px 0 6px' } }, 'Icon'), icons,
          h('p', { class: 'note' }, 'In it: ', what.join(' · '), '. ', h('a', { href: '#', title: 'Choose the level, player, HUD and start in the Stage', onclick: e => { e.preventDefault(); m.remove(); emit('tab', 'stage'); } }, 'Change in the Stage'), '.')),
        h('div', {},
          h('h3', {}, 'The window'),
          field('Size', seg(SIZES.map(([k, l, t]) => [k, l, t]), S.scale, v => { S.scale = v; keep(); }), 'Your 480×270 game, scaled up'),
          check('Start fullscreen', S.fullscreen, v => { S.fullscreen = v; keep(); }),
          check('Sharp pixels (whole-number scaling; black bars on odd screens)', S.pixel, v => { S.pixel = v; keep(); }),
          h('h3', { style: { marginTop: '14px' } }, 'For'),
          ...st.targets.map(t => h('label', { class: 'chk rl-t' + (t.ok ? '' : ' off'), title: t.why || t.what },
            h('input', { type: 'checkbox', disabled: !t.ok, checked: t.ok && S.on.includes(t.id), onchange: e => { S.on = e.target.checked ? [...new Set([...S.on, t.id])] : S.on.filter(x => x !== t.id); keep(); } }),
            h('span', {}, h('b', {}, t.label), h('small', {}, t.ok ? t.what : t.why)))))),
      h('div', { class: 'rl-go' },
        h('button', { class: 'btn go', disabled: busy, title: 'Export for every ticked target (a minute or two)', onclick: run }, busy ? 'Exporting…' : 'Export'),
        h('span', { class: 'note' }, 'Uses what is saved in your asset folder: ', h('a', { href: '#', onclick: e => { e.preventDefault(); m.remove(); import('./saveall.js').then(x => x.openSaveAll()); } }, 'Save all'), ' first if you changed things.')),
      logEl, made);
    drawMade();
  }
  function drawMade() {
    const rows = (st.releases || []).slice(0, 10);
    made.replaceChildren(...(rows.length ? [h('h3', {}, 'Ready to download'), h('div', { class: 'rl-made' }, ...rows.map(r => h('a', { class: 'rl-zip', href: '/api/release/file?f=' + encodeURIComponent(r.file), download: r.file, title: 'Download ' + r.file },
      h('b', {}, r.file), h('small', {}, `${r.mb} MB · ${ago(r.at)}`)))),
      h('p', { class: 'note' }, 'On itch.io: Kind of project → HTML, upload the -web zip, tick "played in the browser", set the size to the window above and turn on the fullscreen button. Desktop zips are uploaded as downloads.')] : []));
  }
  async function run() {
    const want = st.targets.filter(t => t.ok && S.on.includes(t.id)).map(t => t.id);
    if (!want.length) return toast('Tick at least one target', 'bad');
    busy = true; draw(); logEl.style.display = ''; logEl.textContent = 'Preparing…';
    try {
      const c = choices.find(x => x.src === S.icon);
      const opts = { name: S.name.trim() || 'My game', version: S.version.trim() || '1.0', w: 480, h: 270, scale: S.scale, fullscreen: S.fullscreen, pixel_perfect: S.pixel, icon: c ? await iconPNG(c) : '' };
      const files = await gameFiles({ ...pick, name: opts.name }, true);
      const r = await api('/api/release', { root: FS.root, files, opts, targets: want }).catch(e => ({ err: e.message }));
      if (r.err) throw new Error(r.err);
      for (;;) {
        await new Promise(ok => setTimeout(ok, 1500));
        st = await api('/api/release/status').catch(() => st);
        logEl.textContent = st.log.join('\n'); logEl.scrollTop = logEl.scrollHeight;
        if (!st.running) break;
      }
      toast(st.ok ? `Exported: ${st.made.map(x => x.label).join(', ')}` : 'The export failed: see the log', st.ok ? 'ok' : 'bad');
    } catch (e) { toast(e.message, 'bad'); }
    busy = false; const log = logEl.textContent; draw(); logEl.style.display = ''; logEl.textContent = log;
  }
  draw();
}
