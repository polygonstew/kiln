// Add a video from the computer (Flow's video scenes, Menus' moving background): it is uploaded into videos/.src/, then
// the server (video.py, ffmpeg) turns it into videos/<name>.ogv, the format Godot plays. then(file) gets "videos/<name>.ogv".
import { h, api, toast } from './core.js';
import { saveFiles, S as FS } from './files.js';

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');

export function addVideo(then) {
  const file = h('input', { type: 'file', accept: 'video/*', onchange: async () => {
    const f = file.files[0]; if (!f) return;
    const name = slug(prompt('Name for this video', f.name.replace(/\.\w+$/, '')) || ''); if (!name) return;
    toast(`Uploading ${f.name}…`);
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
    const ext = (f.name.match(/\.\w+$/) || ['.mp4'])[0].toLowerCase();
    await saveFiles('videos/.src', [{ name: name + ext, b64 }]);
    const r = await api('/api/video', { path: `${FS.root}/videos/.src/${name}${ext}`, name }).catch(e => ({ err: e.message }));
    if (r.err) return toast('Could not convert it: ' + r.err, 'bad');
    toast('Converting it for Godot (Ogg Theora)…');
    for (;;) {
      await new Promise(ok => setTimeout(ok, 1500));
      const st = await api('/api/video/status').catch(() => ({}));
      if (st.running) continue;
      if (st.ok) { toast(`${st.file} is ready`, 'ok'); await then(st.file); } else toast('Conversion failed: ' + (st.log || []).slice(-1)[0], 'bad');
      break;
    }
  } });
  file.click();
}
