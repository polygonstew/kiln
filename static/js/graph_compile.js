// Logic graph → plain GDScript (one script per graph, extends Node). Every event node becomes one function
// (_on_start, _on_enter_coin…) holding its chain; _ready, _process, _unhandled_input and _kiln_message call them.
// Helpers (graph_nodes.js HELPERS) are added only when a node needs them, so the file stays short and readable.
//   the c object a node's run()/out() gets:
//   c.f            the node's field values (defaults filled in)
//   c.in(port)     the expression for a data input: the wired node's value, or the field as a literal
//   c.flow(port)   the statements of the chain leaving an exec output (same indent)
//   c.block(port)  the same, one indent in ("pass" if nothing is wired)
//   c.has(port)    is anything wired to that exec output?   c.wired(port)  …to that data input?
//   c.member(k, type, init)  a script variable for this node (flags, timestamps); returns its name
//   c.id(k)        a local name for this node (loop counters)
//   c.varType(v)   a graph variable's type;  c.res(path)  an asset path as res://
import { NODES, HELPERS, portsOf } from './graph_nodes.js';

const num = v => { const n = Number(v); return !isFinite(n) ? '0.0' : Number.isInteger(n) ? n + '.0' : String(n); };
export function literal(type, v) {
  if (type === 'num' || type === 'float') return num(v);
  if (type === 'int') return String(Math.round(Number(v) || 0));
  if (type === 'bool') return v === true || v === 'true' || v === 1 ? 'true' : 'false';
  if (type === 'any' && v !== '' && isFinite(Number(v))) return num(v);
  return JSON.stringify(String(v ?? ''));
}
const VAR_TYPES = { int: 'int', float: 'float', text: 'String', bool: 'bool' };
const tab = lines => lines.map(l => '\t' + l);
// a node's field values: what was set, else each field's / input's default
export function fieldsOf(n) {
  const N = NODES[n.type], f = {};
  for (const [id, , , def] of [...(N.ins || []), ...(N.ins2 || [])]) f[id] = def;
  for (const [id, , , def] of N.fields || []) f[id] = def;
  return { ...f, ...n.f };
}
const summary = n => { const f = fieldsOf(n), N = NODES[n.type]; const bits = (N.fields || []).map(([id]) => f[id]).filter(v => v !== '' && v != null); return N.label + (bits.length ? ': ' + bits.join(', ').replace(/^key:/, '') : ''); };

export function compile(g, { name = 'logic', resPrefix = 'res://' } = {}) {
  const nodes = g.nodes.filter(n => NODES[n.type]), byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const into = (id, port) => g.wires.find(w => w.to[0] === id && w.to[1] === port && byId[w.from[0]]);
  const outOf = (id, port) => g.wires.find(w => w.from[0] === id && w.from[1] === port && byId[w.to[0]]);
  const vars = (g.vars || []).filter(v => /^[a-z_]\w*$/i.test(v.name));
  const uses = new Set(), members = new Map(), short = id => id.replace(/\W/g, '');

  function ctx(n, seen) {
    const N = NODES[n.type], P = portsOf(n.type), f = fieldsOf(n);
    for (const u of N.use || []) uses.add(u);
    return {
      f, has: port => !!outOf(n.id, port), wired: port => !!into(n.id, port),
      id: k => `${k}_${short(n.id)}`,
      varType: v => VAR_TYPES[vars.find(x => x.name === v)?.type] || 'float',
      res: p => resPrefix + p,
      in(port, asType) {
        const p = P.find(q => q.id === port && q.dir === 'in'), w = into(n.id, port);
        if (!w) return literal(asType === 'String' ? 'text' : asType || p?.type, f[port]);
        const src = byId[w.from[0]], sp = portsOf(src.type).find(q => q.id === w.from[1]);
        if (seen.has(src.id)) return literal(p?.type, f[port]);           // a value loop: fall back to the field
        let e = NODES[src.type].out?.[w.from[1]]?.(ctx(src, new Set([...seen, src.id]))) ?? literal(p?.type, f[port]);
        if (p?.type === 'text' && sp && sp.type !== 'text') e = `str(${e})`;      // numbers, yes/no and variables read as text
        if (asType === 'int') e = `int(${e})`;
        return e;
      },
      flow: port => chain(n.id, port, seen),
      block: port => { const b = chain(n.id, port, seen); return tab(b.length ? b : ['pass']); },
      member(k, type, init) { const v = `_${k}_${short(n.id)}`; members.set(v, `var ${v}: ${type} = ${init}`); return v; },
    };
  }
  // the statements from an exec output onwards
  function chain(id, port, seen) {
    const w = outOf(id, port); if (!w) return [];
    const t = byId[w.to[0]];
    if (seen.has(t.id)) return [`pass  # the chain loops back to "${NODES[t.type].label}" here`];
    const N = NODES[t.type], c = ctx(t, new Set([...seen, t.id]));
    if (!N.run) return [];
    const lines = N.run(c);
    return N.cat === 'act' ? [...lines, ...c.flow('then')] : lines;
  }

  // events → functions, and the calls that start them
  const ready = [], frame = [], input = [], message = [], funcs = [], taken = new Set();
  for (const n of nodes.filter(n => NODES[n.type].cat === 'event')) {
    const ev = NODES[n.type].ev({ ...n, f: fieldsOf(n) }, { res: p => resPrefix + p });
    let fn = '_on_' + ev.name, k = 2; while (taken.has(fn)) fn = `_on_${ev.name}_${k++}`; taken.add(fn);
    for (const u of ev.use || []) uses.add(u);
    const body = chain(n.id, 'then', new Set([n.id]));
    // unused parameters get a leading _ (Godot's convention, and no warnings)
    const params = (ev.params || '').split(',').filter(Boolean).map(p => { const nm = p.split(':')[0].trim(); return nm.startsWith('_') || body.some(l => new RegExp(`\\b${nm}\\b`).test(l)) ? p.trim() : '_' + p.trim(); }).join(', ');
    funcs.push(`# ${summary(n)}`, `func ${fn}(${params}) -> void:`, ...tab(body.length ? body : ['pass']), '');
    if (ev.hook) ready.push(...ev.hook(fn));
    if (ev.frame) frame.push(`${fn}(delta)`);
    if (ev.input) input.push(`if ${ev.input}:`, `\t${fn}()`);
    if (ev.message != null) message.push(`if message == ${JSON.stringify(ev.message)}:`, `\t${fn}()`);
  }
  const helpers = Object.keys(HELPERS).filter(k => uses.has(k));

  const out = [
    'extends Node',
    `## Logic graph "${name}", made in Kiln's Logic tab. Change the graph there: Kiln writes this file again on every save.`,
    '## In your own Godot project, put it on a Node in the level scene (or make it an Autoload). Kiln\'s ▶ Play adds it by itself.',
    '',
  ];
  if (vars.length) out.push('# variables (Logic → Variables)', ...vars.map(v => `var ${v.name}: ${VAR_TYPES[v.type] || 'float'} = ${literal(v.type === 'text' ? 'text' : v.type, v.value)}`), '');
  if (members.size) out.push('# what "Only the first time" and "At most every" remember', ...members.values(), '');
  out.push('func _ready() -> void:', '\tadd_to_group("kiln_logic")   # so "Send a message" reaches this graph',
    '\tawait get_tree().process_frame   # the level, the player and the HUD are ready after this', ...tab(ready), '');
  if (frame.length) out.push('func _process(delta: float) -> void:', ...tab(frame), '');
  if (input.length) out.push('func _unhandled_input(event: InputEvent) -> void:', ...tab(input), '');
  out.push('func _kiln_message(message: String) -> void:   # "Send a message" from any graph', ...tab(message.length ? message : ['pass']), '');
  if (funcs.length) out.push('# ---- events: one function per event node', '', ...funcs);
  // helpers that load Kiln's runtime find it in _kiln/ (layout.js), under the asset folder's place in the project
  if (helpers.length) out.push('# ---- helpers', '', ...helpers.flatMap(k => [HELPERS[k].replaceAll('{{KILN}}', resPrefix + '_kiln/'), '']));
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
