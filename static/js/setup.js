// Services & keys (Edit → Services & keys…): step by step, connect the services Forge paints and writes with. Free
// daily pictures (Cloudflare), a paid backup (OpenRouter) and free writing help (Gemini). Paste a key, Save, Test.
// Keys stay on this computer (server: setup.py → ~/.config/kiln/keys.env); the page only ever sees the last 4 characters.
import { h, api, toast } from './core.js';

const CARDS = [
  ['cloudflare', 'Free pictures every day', 'Cloudflare gives about 90 pictures a day for free.', [
    ['Make a free account at', 'https://dash.cloudflare.com/sign-up'],
    ['Copy your Account ID (right side of the dashboard home) into the first box', 'https://dash.cloudflare.com'],
    ['Create an API token with the "Workers AI" template, copy it into the second box', 'https://dash.cloudflare.com/profile/api-tokens']],
    [['CF_ACCOUNT_ID', 'Account ID'], ['CF_API_TOKEN', 'API token']]],
  ['openrouter', 'Backup pictures (paid, a few cents each)', 'When the free pictures run out for the day. Add a little credit ($5 lasts a long time).', [
    ['Make an account and add credit at', 'https://openrouter.ai/settings/credits'],
    ['Create a key and paste it below', 'https://openrouter.ai/settings/keys']],
    [['OPENROUTER_API_KEY', 'Key']]],
  ['gemini', 'Writing help (free)', 'Names, descriptions, ideas and conversations.', [
    ['Sign in with a Google account and press "Create API key"', 'https://aistudio.google.com/apikey']],
    [['GEMINI_API_KEY', 'Key']]],
];

export async function openSetup() {
  const st = await api('/api/keys');
  const body = h('div', { class: 'body su-body' }, h('p', { class: 'note', style: { marginTop: 0 } }, 'Kiln works without these (draw, cut sheets, build levels). They let Forge paint and write for you. Your keys stay on this computer.'),
    ...CARDS.map(([id, title, why, steps, fields]) => {
      const inputs = fields.map(([n, label]) => [n, h('input', { type: 'password', placeholder: st[id][n] ? 'saved ' + st[id][n] + ' (paste to replace)' : label, autocomplete: 'off' })]);
      const state = h('span', { class: 'su-state' + (Object.values(st[id]).every(Boolean) ? ' ok' : '') }, Object.values(st[id]).every(Boolean) ? 'Connected' : 'Not set up');
      return h('section', { class: 'su-card' }, h('h3', {}, title, h('span', { class: 'grow' }), state), h('p', { class: 'note' }, why),
        h('ol', {}, ...steps.map(([t, url]) => h('li', {}, t + ' ', h('a', { href: url, target: '_blank', rel: 'noopener' }, url.replace('https://', ''))))),
        ...inputs.map(([n, i], k) => h('label', { class: 'su-field' }, h('span', {}, fields[k][1]), i)),
        h('div', { class: 'btns' },
          h('button', { class: 'btn sm go', onclick: async () => {
            const v = Object.fromEntries(inputs.filter(([, i]) => i.value.trim()).map(([n, i]) => [n, i.value]));
            if (!Object.keys(v).length) return toast('Paste a key first');
            await api('/api/keys', { save: v }); m.remove(); openSetup(); toast('Saved', 'ok');
          } }, 'Save'),
          h('button', { class: 'btn sm ghost', onclick: async () => { const r = await api('/api/keys', { test: id }); toast(r.ok ? 'Works' : 'Did not work: ' + r.why, r.ok ? 'ok' : 'bad'); } }, 'Test')));
    }));
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { style: { width: 'min(620px, 94vw)' } },
    h('header', {}, h('span', { class: 'grow' }, 'Services & keys'), h('button', { class: 'ibtn', title: 'Close', onclick: () => m.remove() }, '✕')), body));
  document.body.append(m);
}
