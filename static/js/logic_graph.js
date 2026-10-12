// Logic graphs in the Logic tab: the list of graphs (left), the board (graph_view.js, middle), and on the right the
// Add palette, the graph's variables and its script, compiled live (graph_compile.js) and checked by Godot. A graph is
// kept as a Kiln project while you work (kiln/graph-<name>.json); Save writes logic/<name>.gd, which ▶ Play runs.
import { h, api, toast, pref, rawURL, select } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { NODES, CATS, TEMPLATES } from './graph_nodes.js';
import { compile } from './graph_compile.js';
import { graphView } from './graph_view.js';
import { highlight } from './gdedit.js';
import { listScenes } from './playbuild.js';
import { openProjects } from './projects.js';
import { writeRuntime } from './layout.js';

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
const VAR_TYPES = [['int', 'whole number'], ['float', 'number'], ['text', 'text'], ['bool', 'yes / no']];
const KW = new Set('and or not if else elif for while func var const return true false null self in is as match pass break continue class extends signal await'.split(' '));

export function graphArea({ setMode, openScript }) {
  let cur = null, written = '', graphs = [], L = { zones: [], actors: [], sounds: [], voices: [], dialogues: [] }, resPrefix = 'res://', saveT = 0, codeT = 0;
  const gv = graphView({ onChange: changed, lists: () => ({ ...L, vars: cur?.g.vars || [] }) });
  const V = { name: h('span', { class: 'mono', style: { fontSize: '12px' } }), state: h('span', { class: 'mono dim', style: { fontSize: '11px' } }) };
  V.code = h('pre', { class: 'gd-hl lg-code' }); V.probs = h('div', { class: 'lg-probs' });
  const center = h('div', { class: 'lg-graph' },
    h('div', { class: 'bar' }, V.name, V.state, h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', title: 'Fit the whole graph on screen (F)', onclick: () => gv.frame() }, 'Show all'),
      h('button', { class: 'ibtn', title: 'Undo (Ctrl+Z)', onclick: () => gv.undo() }, '↶'), h('button', { class: 'ibtn', title: 'Redo (Ctrl+Y)', onclick: () => gv.redo() }, '↷'),
      h('button', { class: 'btn sm ghost', title: 'Copy the script into scripts/ as your own, to go on by hand (the graph stays as it is)', onclick: detach }, 'Make it my script'),
      h('button', { class: 'btn sm ghost danger', title: 'Delete this graph (its script goes to the .trash folder)', onclick: remove }, 'Delete'),
      h('button', { 'data-file': 'save', class: 'btn sm go', title: 'Write logic/<name>.gd for the game and let Godot check it (Ctrl+S)', onclick: save }, 'Save')),
    gv.el);
  center.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
  const listSec = h('div', { class: 'sec' }), side = h('div');

  /* ------------------------------------------------------------ the list ---- */
  async function refresh() {
    graphs = (await api('/api/projects').catch(() => [])).filter(p => p.kind === 'graph').sort((a, b) => a.name.localeCompare(b.name));
    drawList(); lists();
  }
  function drawList() {
    const tpl = Object.assign(select(Object.entries(TEMPLATES).map(([k, [l]]) => [k, l]), 'empty', () => {}), { title: 'What the new graph starts as (a working example to change)' });
    listSec.replaceChildren(h('h3', {}, 'Graphs', h('span', { class: 'grow' }), h('small', {}, graphs.length || '')),
      graphs.length ? '' : h('p', { class: 'note', style: { marginTop: 0 } }, 'Game logic without code: events (a zone, a key, a timer…) wired to actions (say, spawn, heal…). Kiln turns each graph into a short GDScript.'),
      ...graphs.map(p => h('button', { class: 'lg-file' + (cur?.name === p.name ? ' on' : ''), title: `Open the graph (its script: logic/${p.name}.gd)`, onclick: () => open(p.name) }, h('i', { class: 'lg-gi' }), p.name, h('small', {}, 'graph'))),
      h('div', { style: { marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, tpl,
        h('button', { 'data-file': 'new', class: 'btn sm', title: 'A new graph, starting from the picked example', onclick: () => create(tpl.value) }, 'New graph'),
        h('button', { 'data-file': 'open', class: 'btn sm ghost', title: 'Open, rename, copy, remove or bring back graphs', onclick: manage }, 'Open…')));
  }
  // what the node fields can pick from: zones in saved levels, saved actors, sounds
  async function lists() {
    const [projects, actors, g] = await Promise.all([api('/api/projects').catch(() => []), listScenes('sprites'), api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}))]);
    resPrefix = g.root ? 'res://' + FS.root.slice(g.root.length + 1) + '/' : 'res://';
    const zones = new Set();
    for (const p of projects.filter(p => p.kind === 'level')) {
      const d = await fetch('/api/project?id=' + encodeURIComponent(p.id)).then(r => r.ok ? r.json() : null).catch(() => null);
      for (const z of d?.level?.zones || []) if (z.name) zones.add(z.name);
    }
    const sounds = [], ls = async (dir, pick, label) => ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/' + dir)).catch(() => ({ items: [] }))).items || [])
      .filter(i => pick(i.name)).forEach(i => sounds.push([dir + '/' + i.name, label(i.name)]));
    await ls('sfx', n => /\.(wav|ogg|mp3)$/i.test(n), n => n.replace(/\.\w+$/, ''));
    for (const [n] of actors) await ls('sprites/' + n, x => /^sfx_.*\.wav$/.test(x), x => `${n}: ${x.slice(4, -4)}`);
    const voices = [];      // voice lines made in Puppet: sprites/<actor>/voice/<line>.lipsync.json
    for (const [n] of actors) ((await api('/api/fs?path=' + encodeURIComponent(`${FS.root}/sprites/${n}/voice`)).catch(() => ({ items: [] }))).items || [])
      .filter(i => i.name.endsWith('.lipsync.json')).forEach(i => voices.push([`sprites/${n}/voice/${i.name}`, `${n}: ${i.name.replace('.lipsync.json', '')}`]));
    const dialogues = projects.filter(p => p.kind === 'dialogue').map(p => [`dialogue/${p.name}.json`, p.name]);
    L = { zones: [...zones], actors: actors.map(([n, res]) => [res.replace(/^res:\/\//, ''), n]), sounds, voices, dialogues };
    gv.refresh();
  }
  // rename / copy / remove / restore: a graph's script is named after it, so the old one goes to .trash (Save writes the new)
  const trashScript = async n => { await api('/api/fs', { op: 'mkdir', path: FS.root + '/.trash' }); await api('/api/fs', { op: 'rename', path: `${FS.root}/logic/${n}.gd`, to: `${FS.root}/.trash/${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-logic__${n}.gd` }).catch(() => {}); };
  const manage = () => openProjects('graph', { current: cur?.name, open: p => open(p.name),
    renamed: n => { cur.name = n; written = ''; V.name.textContent = 'graph · ' + n; code(); }, removed: () => { cur = null; setMode('code'); },
    afterRename: async old => { await trashScript(old); toast('Open the renamed graph and Save to write its script', 'ok'); refresh(); }, afterRemove: async n => { await trashScript(n); refresh(); } });
  async function create(tpl) {
    const name = slug(prompt('Name for the graph (its script is logic/<name>.gd)', tpl === 'empty' ? 'level_logic' : tpl) || '');
    if (!name) return;
    if (graphs.some(p => p.name === name)) return toast(`There is already a graph "${name}"`, 'bad');
    cur = { name, g: JSON.parse(JSON.stringify(TEMPLATES[tpl][1])) };
    await keep(); await refresh(); open(name);
  }
  async function open(name) {
    const d = await fetch('/api/project?id=graph-' + encodeURIComponent(name)).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!d?.graph) return toast('Could not open the graph ' + name, 'bad');
    cur = { name, g: d.graph }; cur.g.vars ||= [];
    const have = ((await api('/api/fs?path=' + encodeURIComponent(FS.root + '/logic')).catch(() => ({ items: [] }))).items || []).some(i => i.name === name + '.gd');
    written = have ? await fetch(rawURL(`${FS.root}/logic/${name}.gd`)).then(r => r.ok ? r.text() : '').catch(() => '') : '';
    pref.set('logic.graph', name); setMode('graph');
    V.name.textContent = 'graph · ' + name;
    gv.load(cur.g); drawList(); drawSide(); code();
    V.probs.replaceChildren(h('p', { class: 'note' }, 'Godot checks the script when you save.'));
  }

  /* ------------------------------------------------------- keeping it ---- */
  function changed() { clearTimeout(saveT); saveT = setTimeout(keep, 1200); clearTimeout(codeT); codeT = setTimeout(code, 120); }
  const keep = () => cur && api('/api/project', { id: 'graph-' + cur.name, data: { meta: { kind: 'graph', name: cur.name }, graph: cur.g } }).catch(e => toast('Could not keep the graph: ' + e.message, 'bad'));
  function code() {
    if (!cur) return '';
    const text = compile(cur.g, { name: cur.name, resPrefix });
    V.code.innerHTML = highlight(text);
    V.state.textContent = text === written ? '' : written ? '● changed since the last Save' : '● not saved for the game yet';
    return text;
  }
  async function save() {
    if (!cur) return;
    clearTimeout(saveT); await keep();
    const text = code();
    try { await saveFiles('logic', [{ name: cur.name + '.gd', text }]); await writeRuntime({}); written = text; code(); toast(`Saved logic/${cur.name}.gd`, 'ok'); } catch (e) { return toast('Save failed: ' + e.message, 'bad'); }
    V.probs.replaceChildren(h('p', { class: 'note' }, 'Asking Godot…'));
    const r = await api('/api/godot/check', { root: FS.root, path: `logic/${cur.name}.gd`, text }).catch(e => ({ errors: [{ line: 0, msg: e.message }] }));
    if (r.godot === false) return V.probs.replaceChildren(h('p', { class: 'note' }, 'Godot is not installed here, so the script was not checked.'));
    V.probs.replaceChildren(r.ok ? h('p', { class: 'lg-ok' }, '✓ Godot finds no problems') : h('div', {}, ...r.errors.map(e => h('div', { class: 'lg-err' }, h('b', {}, e.line ? 'Line ' + e.line : 'Godot'), h('span', {}, e.msg)))));
  }
  async function remove() {
    if (!cur || !confirm(`Delete the graph "${cur.name}"? Its script logic/${cur.name}.gd goes to the .trash folder.`)) return;
    await api('/api/project/delete', { id: 'graph-' + cur.name });
    if (written) await api('/api/fs', { op: 'trash', path: `${FS.root}/logic/${cur.name}.gd` }).catch(() => {});
    toast(`Deleted the graph ${cur.name}`); cur = null; await refresh(); setMode('code');
  }
  async function detach() {
    if (!cur) return;
    let n = cur.name, k = 2; const have = (await api('/api/fs?path=' + encodeURIComponent(FS.root + '/scripts')).catch(() => ({ items: [] }))).items || [];
    while (have.some(i => i.name === n + '.gd')) n = `${cur.name}_${k++}`;
    const text = code().replace(/^## Logic graph .*\n## In your own.*\n/m, `## Started from the Logic graph "${cur.name}" (a copy: the graph and this file no longer follow each other).\n`);
    await saveFiles('scripts', [{ name: n + '.gd', text }]); toast(`Copied to scripts/${n}.gd`, 'ok'); openScript(`scripts/${n}.gd`);
  }

  /* ------------------------------------------------------- right panel ---- */
  function drawSide() {
    if (!cur) return side.replaceChildren();
    side.replaceChildren(
      h('div', { class: 'sec' }, h('h3', {}, 'Add a node', h('small', {}, 'or right-click the board')),
        ...CATS.map(([c, label, what]) => h('details', { class: 'lg-ref', open: c === 'event' || c === 'act' }, h('summary', {}, h('i', { class: 'lg-dot cat-' + c }), label, h('small', {}, ' ' + what)),
          h('div', { class: 'lg-pal' }, ...Object.keys(NODES).filter(t => NODES[t].cat === c).map(t => h('button', { class: 'lg-pi', title: NODES[t].hint || NODES[t].label, onclick: () => gv.addAtCentre(t) }, NODES[t].label)))))),
      h('div', { class: 'sec' }, h('h3', {}, 'Variables', h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost', title: 'A value the graph remembers (a score, a flag…)', onclick: addVar }, '+ Variable')), varRows()),
      h('div', { class: 'sec' }, h('h3', {}, 'Its script', h('small', {}, `logic/${cur.name}.gd`)), V.probs, V.code,
        h('p', { class: 'note' }, 'Plain GDScript, written again on every Save. Each event is one function; open it in Godot and follow it line by line.')));
  }
  function varRows() {
    const vs = cur.g.vars;
    if (!vs.length) return h('p', { class: 'note', style: { marginTop: 0 } }, 'None yet. Variables keep a value while the game runs (score, has_key, lives…).');
    return h('div', { class: 'lg-vars' }, ...vs.map((v, i) => h('div', { class: 'lg-var' },
      h('input', { type: 'text', value: v.name, title: 'Name (letters, numbers, _)', onchange: e => renameVar(v, e.target.value) }),
      select(VAR_TYPES, v.type, t => { v.type = t; varsChanged(); }),
      v.type === 'bool' ? h('input', { type: 'checkbox', checked: v.value === 'true', title: 'Starts as', onchange: e => { v.value = String(e.target.checked); varsChanged(); } })
        : h('input', { type: v.type === 'text' ? 'text' : 'number', value: v.value, title: 'Starts as', onchange: e => { v.value = e.target.value; varsChanged(); } }),
      h('button', { class: 'ibtn', title: 'Remove', onclick: () => { vs.splice(i, 1); varsChanged(); } }, '✕'))));
  }
  const varsChanged = () => { drawSide(); gv.refresh(); changed(); };
  function addVar() {
    let n = 'score', k = 2; while (cur.g.vars.some(v => v.name === n)) n = 'value_' + k++;
    cur.g.vars.push({ name: n, type: 'int', value: '0' }); varsChanged();
  }
  function renameVar(v, raw) {
    let n = slug(raw); if (/^\d/.test(n)) n = '_' + n;
    if (!n || KW.has(n) || cur.g.vars.some(x => x !== v && x.name === n)) { toast('That name can\'t be used', 'bad'); return drawSide(); }
    for (const node of cur.g.nodes) if (node.f?.var === v.name) node.f.var = n;      // nodes follow the rename
    v.name = n; varsChanged();
  }

  return { listSec, center, side, refresh, open, lists, current: () => cur?.name, remove: async name => { await open(name); remove(); },
    saveGraph: async name => { await lists(); await open(name); await save(); } };
}
