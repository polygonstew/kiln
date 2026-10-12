// Point & click → Godot: the files a room and the items become. A room (rooms.js) is saved as rooms/<name>/<name>.tscn:
// Background, Walk (a NavigationRegion2D: the walk area cut into triangles), Entries (Marker2Ds), Hotspots (hotspot.gd
// with its shape, where to stand and what it shows) and Front; the items and combinations go to adventure/items.json.
// The runtime scripts are in adventure_gd.js; adventureRuntime() hands them to a build or a save.
import { ROOM_GD, HOTSPOT_GD, ADVENTURE_GD } from './adventure_gd.js';

export const ADVENTURE = '_kiln/adventure/adventure.gd';
const ROOM = '_kiln/adventure/room.gd', HOTSPOT = '_kiln/adventure/hotspot.gd';
export const adventureRuntime = () => ({ [ADVENTURE]: ADVENTURE_GD, [ROOM]: ROOM_GD, [HOTSPOT]: HOTSPOT_GD });

// Ear clipping: a simple outline [[x, y]…] → triangles [[i, j, k]…], each turning the same way as the outline.
// A crossed outline stops early (the walk area then misses a piece; Rooms warns about crossed edges).
export function triangulate(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const turn = Math.sign(pts.reduce((s, p, i) => { const q = pts[(i + 1) % n]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) || 1;
  const cross = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * turn;
  const same = (p, q) => p[0] === q[0] && p[1] === q[1];
  const inside = (p, a, b, c) => !same(p, a) && !same(p, b) && !same(p, c) && cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const idx = [...pts.keys()], out = [];
  while (idx.length > 3) {
    let cut = false;
    for (let i = 0; i < idx.length && !cut; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length], [a, b, c] = [pts[ia], pts[ib], pts[ic]];
      if (cross(a, b, c) <= 0 || idx.some(j => inside(pts[j], a, b, c))) continue;   // not an ear: bent inwards, or something inside
      out.push([ia, ib, ic]); idx.splice(i, 1); cut = true;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([...idx]);
  return out;
}

// do two edges of an outline cross? (the walk area must not)
export function crossed(pts) {
  const n = pts.length, ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const [a, b, c, d] = [pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]];
    if (ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)) return true;
  }
  return false;
}

const vec = pts => `PackedVector2Array(${pts.map(p => `${p[0]}, ${p[1]}`).join(', ')})`;
const str = s => JSON.stringify(String(s ?? ''));
const nodeName = s => String(s || 'thing').replace(/[^A-Za-z0-9_]/g, '_');
export const centre = poly => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2)]; };

// The room scene. R: the room project; at(rel) → how a scene refers to a file of the asset folder ('sfx/door.wav' →
// 'sfx/door.wav' or 'res://…/sfx/door.wav'); res: the room's folder as at() gives it. Only what differs from the
// defaults in hotspot.gd is written, so the scene reads like a list of what each thing does.
export function roomScene(R, at, res) {
  const ext = [], subs = [], nodes = [], ids = {};
  const use = (type, rel) => { const k = type + ':' + rel; if (!ids[k]) { ids[k] = 'r' + (Object.keys(ids).length + 1); ext.push(`[ext_resource type="${type}" path="${at(rel)}" id="${ids[k]}"]`); } return `ExtResource("${ids[k]}")`; };
  const roomRes = use('Script', ROOM), hotRes = use('Script', HOTSPOT);
  const D = R.depth || {};
  nodes.push(`[node name="${nodeName(R.name)}" type="Node2D"]\nscript = ${roomRes}\nsize = Vector2(${R.w}, ${R.h})\nfar_y = ${D.farY ?? Math.round(R.h * .55)}.0\nfar_scale = ${D.farS ?? .6}\nnear_y = ${D.nearY ?? R.h}.0\nnear_scale = ${D.nearS ?? 1}\n`
    + (R.music ? `music = ${use('AudioStream', R.music)}\n` : ''));
  if (R.bg) nodes.push(`[node name="Background" type="Sprite2D" parent="."]\ntexture_filter = 1\ntexture = ExtResource("bg")\ncentered = false\n`);
  if ((R.walk || []).length >= 3) {
    const tris = triangulate(R.walk);
    subs.push(`[sub_resource type="NavigationPolygon" id="walk"]\nvertices = ${vec(R.walk)}\npolygons = Array[PackedInt32Array]([${tris.map(t => `PackedInt32Array(${t.join(', ')})`).join(', ')}])\n`
      + `outlines = Array[PackedVector2Array]([${vec(R.walk)}])\nagent_radius = 0.0\n`);
    nodes.push(`[node name="Walk" type="NavigationRegion2D" parent="."]\nnavigation_polygon = SubResource("walk")\n`);
  }
  nodes.push(`[node name="Entries" type="Node2D" parent="."]\n`);
  for (const e of R.entries || []) nodes.push(`[node name="${nodeName(e.name)}" type="Marker2D" parent="Entries"]\nposition = Vector2(${e.x}, ${e.y})\n`);
  nodes.push(`[node name="Hotspots" type="Node2D" parent="."]\n`);
  const names = new Set();
  for (const q of R.hotspots || []) {
    let n = nodeName(q.name || q.title); while (names.has(n)) n += '_2'; names.add(n);
    const [cx, cy] = centre(q.poly), path = `Hotspots/${n}`;
    const props = [['title', str(q.title || q.name)], ['look', q.look && str(q.look)], ['look_voice', q.lookVoice && str(at(q.lookVoice))], ['does', q.does !== 'say' && str(q.does || 'say')],
      ['text', q.text && str(q.text)], ['item', q.does === 'pick' && q.item && str(q.item)], ['dialogue', q.does === 'talk' && q.dialogue && str(at(q.dialogue))],
      ['room', q.does === 'go' && q.room && str(at(`rooms/${q.room}/${q.room}.tscn`))], ['entry', q.does === 'go' && q.entry && q.entry !== 'start' && str(q.entry)],
      ['needs', q.needs && str(q.needs)], ['needs_flag', q.needsFlag && str(q.needsFlag)], ['locked_text', q.lockedText && str(q.lockedText)], ['takes', q.needs && q.takes && 'true'],
      ['sets_flag', q.setsFlag && str(q.setsFlag)], ['vanish', q.vanish && 'true'], ['when', q.when && str(q.when)], ['unless', q.unless && str(q.unless)],
      ['sound', q.sound && use('AudioStream', q.sound)], ['message', q.message && str(q.message)]].filter(([, v]) => v);
    nodes.push(`[node name="${n}" type="Area2D" parent="Hotspots"]\nposition = Vector2(${cx}, ${cy})\nscript = ${hotRes}\n${props.map(([k, v]) => `${k} = ${v}`).join('\n')}\n`);
    nodes.push(`[node name="Shape" type="CollisionPolygon2D" parent="${path}"]\npolygon = ${vec(q.poly.map(p => [p[0] - cx, p[1] - cy]))}\n`);
    const st = q.stand || [cx, Math.max(...q.poly.map(p => p[1]))];
    nodes.push(`[node name="Stand" type="Marker2D" parent="${path}"]\nposition = Vector2(${st[0] - cx}, ${st[1] - cy})\n`);
    const sh = q.shows || {};
    if (sh.kind === 'actor' && sh.name) nodes.push(`[node name="${nodeName(sh.name)}" parent="${path}" instance=${use('PackedScene', `sprites/${sh.name}/${sh.name}.tscn`)}]\nposition = Vector2(0, ${Math.max(...q.poly.map(p => p[1])) - cy})\n${sh.flip ? 'scale = Vector2(-1, 1)\n' : ''}`);
    if (sh.kind === 'picture' && sh.path) nodes.push(`[node name="Picture" type="Sprite2D" parent="${path}"]\ntexture_filter = 1\ntexture = ${use('Texture2D', sh.path)}\n`);
  }
  if (R.fg) nodes.push(`[node name="Front" type="Sprite2D" parent="."]\nz_index = 10\ntexture_filter = 1\ntexture = ExtResource("fg")\ncentered = false\n`);
  if (R.bg) ext.push(`[ext_resource type="Texture2D" path="${res}/background.png" id="bg"]`);
  if (R.fg) ext.push(`[ext_resource type="Texture2D" path="${res}/front.png" id="fg"]`);
  return `[gd_scene load_steps=${ext.length + subs.length + 1} format=3]\n\n${ext.join('\n')}\n\n${subs.map(s => s + '\n').join('')}${nodes.join('\n')}`;
}

// adventure/items.json: { items: [{ id, name, look, icon }], combos: [{ a, b, makes, text }] }; resAt(rel) → a res:// path
export function itemsJSON(I, resAt) {
  return JSON.stringify({ items: (I.items || []).map(it => ({ id: it.id, name: it.name, look: it.look || '', icon: it.icon ? resAt(it.icon) : '' })),
    combos: (I.combos || []).filter(c => c.a && c.b && c.makes) }, null, 1) + '\n';
}
