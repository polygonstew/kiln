// One item per name: an actor, level or HUD never saves over a different one that already has its name.
// Each item carries an id; the server reports which id owns each saved name. A clash gets a free name (hero -> hero_2).
// Items saved before ids existed (owner unknown) can only be taken by an item that also has no id yet: the user's own old one.
import { api, uid, toast } from './core.js';

const owners = {};      // kind -> Map(name -> owner id | null)
export async function loadOwners(kind) {
  const ps = await api('/api/projects').catch(() => null);
  if (ps) owners[kind] = new Map(ps.filter(p => p.kind === kind).map(p => [p.name, p.sid || null]));
  return owners[kind];
}
// Make obj.name safe to save under. Returns true if it had to be renamed.
export function claim(kind, obj, slug) {
  const hadId = !!obj.id;
  if (!hadId) obj.id = uid();
  const m = owners[kind] || new Map(), base = slug(obj.name);
  const taken = n => m.has(n) && (m.get(n) ? m.get(n) !== obj.id : hadId);
  let n = base, i = 2;
  while (taken(n)) n = `${base}_${i++}`;
  m.set(n, obj.id); owners[kind] = m;
  if (n === obj.name) return false;
  toast(`"${obj.name}" is another ${kind}'s name, so this one is saved as "${n}"`);
  obj.name = n;
  return true;
}
