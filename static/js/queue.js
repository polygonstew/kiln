// Generation queue: submits to the server, polls progress, shows the tray in the top bar.
import { $, h, api, toast, pref, emit } from './core.js';

export const Q = { jobs: [], health: null };
const ENGINE_LABEL = { sprite: 'Sprite model', scene: 'Scene model', painted: 'Painted model', cloud: 'Cloud' };

// Seconds per diffusion step at 512×512 on this machine, learnt from finished jobs.
function perStep() { return pref.get('perStep', 30); }
function overhead() { return pref.get('overhead', 30); }
export function estimate(req) {
  if (req.engine === 'cloud') return 20 * (req.batch || 1);
  const px = (req.w || 512) * (req.h || 512) / (512 * 512);
  const steps = req.steps || (req.fast === false ? 22 : 4);
  const batch = req.batch || 1;
  return Math.round(overhead() + steps * perStep() * px * batch * (req.init ? (req.denoise || .5) : 1));
}
export const fmtSecs = s => s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

export function enqueue(req, label) {
  const job = { key: Math.random().toString(36).slice(2), label, req, state: 'sending', step: 0, steps: req.steps || 4, images: [], eta: estimate(req), t0: Date.now() };
  Q.jobs.unshift(job);
  Q.jobs = Q.jobs.slice(0, 40);
  job.done = new Promise((res, rej) => { job.res = res; job.rej = rej; });
  job.done.catch(() => { });
  api('/api/gen', req).then(r => { job.id = r.id; job.seed = r.seed; job.state = 'queued'; render(); loop(); })
    .catch(e => { job.state = 'error'; job.err = e.message; job.rej(e); render(); toast('Could not start: ' + e.message, 'bad'); });
  render();
  return job;
}
export function cancel(job) {
  if (job.id) api('/api/cancel', { id: job.id }).catch(() => { });
  job.state = 'error'; job.err = 'cancelled'; job.rej(new Error('cancelled')); render();
}

let looping = false;
async function loop() {
  if (looping) return;
  looping = true;
  while (Q.jobs.some(j => j.id && (j.state === 'queued' || j.state === 'running'))) {
    for (const j of Q.jobs.filter(j => j.id && (j.state === 'queued' || j.state === 'running'))) {
      try {
        const s = await api('/api/job?id=' + j.id);
        if (s.state === 'running' && j.state !== 'running') j.tRun = Date.now();
        if (s.step > j.step && s.step === 1) j.tStep1 = Date.now();
        Object.assign(j, { state: s.state, step: s.step || 0, steps: s.steps || j.steps, ahead: s.ahead, err: s.err });
        if (s.state === 'done') {
          j.images = s.images; j.secs = (Date.now() - (j.tRun || j.t0)) / 1000;
          learn(j);
          j.res(j.images);
          emit('job-done', j);
        }
        if (s.state === 'error') { j.rej(new Error(s.err || 'failed')); toast('Generation failed: ' + (s.err || ''), 'bad'); }
      } catch { }
    }
    render();
    await new Promise(r => setTimeout(r, 1500));
  }
  looping = false;
  render();
}
function learn(j) {
  const px = (j.req.w || 512) * (j.req.h || 512) / (512 * 512) * (j.req.batch || 1) * (j.req.init ? (j.req.denoise || .5) : 1);
  if (!j.tStep1 || !j.steps || j.steps < 2) return;
  const stepSecs = (Date.now() - j.tStep1) / 1000 / (j.steps - 1) / px;
  const over = Math.max(5, j.secs - stepSecs * j.steps * px);
  pref.set('perStep', Math.round((perStep() * 2 + stepSecs) / 3 * 10) / 10);
  pref.set('overhead', Math.round((overhead() * 2 + over) / 3));
}
const remaining = j => {
  if (j.state === 'running' && j.tRun) return Math.max(0, j.eta - (Date.now() - j.tRun) / 1000);
  return j.eta;
};

export function render() {
  const el = $('#jobs');
  if (!el) return;
  const active = Q.jobs.filter(j => ['sending', 'queued', 'running'].includes(j.state));
  const run = active.find(j => j.state === 'running');
  const h0 = Q.health;
  const dotCls = active.length ? 'busy' : h0 == null ? '' : h0.comfy ? 'ok' : 'bad';
  el.replaceChildren(h('i', { class: 'dot ' + dotCls }),
    h('span', {}, active.length ? (run ? `${run.step}/${run.steps} · ~${fmtSecs(remaining(run))}` : `${active.length} waiting`) + (active.length > 1 ? ` · ${active.length} jobs` : '')
      : h0 == null ? 'checking…' : h0.comfy ? 'Generator ready' : 'Generator offline'));
  el.title = h0 && !h0.comfy ? 'ComfyUI is not answering on :8188. Kiln tools still work; generation waits for it.' : 'Generation jobs';
  const p = $('#jobpanel');
  if (p && p.classList.contains('open')) drawPanel(p);
}
function drawPanel(p) {
  if (!Q.jobs.length) { p.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'No jobs yet'), 'Images you generate in Forge and Scenes queue here. One runs at a time; on this CPU expect one to two minutes each.')); return; }
  p.replaceChildren(...Q.jobs.map(j => {
    const pct = j.state === 'done' ? 100 : j.state === 'running' ? Math.round(j.step / j.steps * 100) : 0;
    const st = j.state === 'done' ? `done in ${fmtSecs(j.secs || 0)}` : j.state === 'error' ? (j.err || 'failed') : j.state === 'running' ? `step ${j.step}/${j.steps} · ~${fmtSecs(remaining(j))} left` : j.state === 'queued' ? `waiting${j.ahead ? ` · ${j.ahead} ahead` : ''} · ~${fmtSecs(j.eta)}` : 'sending…';
    return h('div', { class: 'job' },
      j.images[0] ? h('img', { src: j.images[0] }) : h('div', { class: 'ph' }),
      h('div', {}, h('div', { class: 't' }, j.label), h('div', { class: 's' }, `${ENGINE_LABEL[j.req.engine] || ''} · ${st}`), h('div', { class: 'bar' }, h('i', { style: { width: pct + '%' } }))),
      ['queued', 'running', 'sending'].includes(j.state) ? h('button', { class: 'btn sm ghost', onclick: () => cancel(j) }, 'Cancel') : h('span'));
  }));
}
export function initTray() {
  const panel = h('div', { id: 'jobpanel' });
  document.body.append(panel);
  $('#jobs').onclick = e => { e.stopPropagation(); panel.classList.toggle('open'); render(); };
  document.addEventListener('click', e => { if (!panel.contains(e.target)) panel.classList.remove('open'); });
  const ping = () => api('/api/status').then(s => { Q.health = s; render(); emit('health', s); }).catch(() => { Q.health = { comfy: false }; render(); });
  ping(); setInterval(ping, 15000);
  setInterval(() => { if (Q.jobs.some(j => j.state === 'running')) render(); }, 1000);
}
