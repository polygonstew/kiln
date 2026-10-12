// Sound tools: a sound or a piece of music, listened to and tidied (server: audio.py, ffmpeg): trim the silence, fade in
// and out, even out the loudness, save as .ogg (music: small) or .wav (effects) into music/ or sfx/, or open it in
// Audacity for hand edits. From the asset shelf (click a sound) or "+ Sound" (one from your computer).
import { h, api, toast, emit } from './core.js';
import { S as FS, saveFiles } from './files.js';

const slug = s => String(s || 'sound').toLowerCase().replace(/\.\w+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sound';

export function openSoundTools(rel) {
  const o = { trim: true, normalize: true, fade_in: 0, fade_out: 1, to: /^music\//.test(rel) ? 'music' : 'sfx' };
  const name = h('input', { type: 'text', value: slug(rel.split('/').pop()) + (rel.startsWith('music/') || rel.startsWith('sfx/') ? '_tidy' : ''), style: { width: '160px' } });
  const audio = h('audio', { controls: true, src: '/api/fs/raw?path=' + encodeURIComponent(FS.root + '/' + rel), style: { width: '100%' } });
  const num = (k, label, max) => h('label', { class: 'chk' }, label, h('input', { type: 'number', min: 0, max, step: .5, value: o[k], style: { width: '60px' }, onchange: e => { o[k] = +e.target.value; } }), 's');
  const tick = (k, label) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: o[k], onchange: e => { o[k] = e.target.checked; } }), h('span', {}, label));
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(560px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Sound tools: ' + rel.split('/').pop()), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')),
    h('div', { class: 'body st-body' }, audio,
      tick('trim', 'Trim the silence at both ends'), tick('normalize', 'Even out the loudness (the same level as the game\'s other sounds)'),
      h('div', { class: 'st-row' }, num('fade_in', 'Fade in', 20), num('fade_out', 'Fade out', 20)),
      h('div', { class: 'st-row' }, h('span', {}, 'Save as'), h('select', { onchange: e => { o.to = e.target.value; } }, h('option', { value: 'music', selected: o.to === 'music' }, 'music/ (.ogg)'), h('option', { value: 'sfx', selected: o.to === 'sfx' }, 'sfx/ (.wav)')), name),
      h('div', { class: 'st-row' },
        h('button', { class: 'btn go', onclick: async () => {
          const dest = `${o.to}/${slug(name.value)}.${o.to === 'music' ? 'ogg' : 'wav'}`;
          const r = await api('/api/audio', { path: FS.root + '/' + rel, dest, ...o }).catch(e => ({ err: e.message }));
          if (r.err) return toast('Could not: ' + r.err, 'bad');
          audio.src = '/api/fs/raw?path=' + encodeURIComponent(FS.root + '/' + dest) + '&t=' + Date.now(); toast('Saved ' + dest, 'ok'); emit('saved', FS.root);
        } }, 'Make it'),
        h('button', { class: 'btn ghost', title: 'Edit it by hand in Audacity on this computer', onclick: () => api('/api/audio/open', { path: FS.root + '/' + rel }).then(() => toast('Opening Audacity…'), e => toast(e.message, 'bad')) }, 'Open in Audacity'),
        h('button', { class: 'btn ghost', title: 'Your Cutroom editor: it opens its window; drag the sound onto an audio layer', onclick: () => api('/api/audio/open', { path: FS.root + '/' + rel, app: 'cutroom' }).then(() => toast('Opening Cutroom: drag the sound in (it is in ' + rel.split('/')[0] + '/)'), e => toast(e.message, 'bad')) }, 'Open in Cutroom')))));
  document.body.append(m);
}

// a sound from the computer: into music/ (long) or sfx/ (short), then the tools
export function addSound() {
  const f = h('input', { type: 'file', accept: 'audio/*', onchange: async () => {
    const file = f.files[0]; if (!file) return;
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    const dir = file.size > 400000 ? 'music' : 'sfx', n = slug(file.name) + (file.name.match(/\.\w+$/) || ['.wav'])[0].toLowerCase();
    await saveFiles(dir, [{ name: n, b64 }]); openSoundTools(`${dir}/${n}`);
  } });
  f.click();
}
