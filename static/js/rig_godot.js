// Rig → Godot 4: the puppet as real Godot bones. A Skeleton2D with one Bone2D per bone (same names, same joints),
// each holding a Sprite2D of its pixels, and an AnimationPlayer with every motion as rotation tracks (one key per
// frame, so eases and holds come out exactly). Godot then animates it smoothly; the baked frames stay the pixel version.
import { toDataURL, api } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { poseAt } from './timeline.js';
import { SHARP } from './gametype.js';
import { writeRuntime, rtRes, baseOf } from './layout.js';

// the puppet's head views and mouths in Godot (rig_face.gd on the rig's root): show_head(), set_mouth(), say()
export const RIG_FACE_GD = `extends Node2D
## Kiln puppet face: the head views and pixel mouths Puppet made, as sprites on the head bone (Head_<view>, Mouth_<shape>).
##   show_head("front")      # one of the Head_* sprites; "" puts the drawn head back
##   set_mouth("A")          # one of X A B C D E F G H
##   say("res://sprites/miner/voice/hello.lipsync.json")   # plays the voice line, the mouth follows its cues
const SHAPES := "XABCDEFGH"
var _cues: Array = []
var _player: AudioStreamPlayer

func show_head(view: String) -> void:
\tvar heads := find_children("Head_*", "Sprite2D")
\tfor n in heads:
\t\tn.visible = n.name == "Head_" + view
\tif heads.size() and heads[0].get_parent().has_node("Part"):
\t\theads[0].get_parent().get_node("Part").visible = view == ""

func set_mouth(shape: String) -> void:
\tfor n in find_children("Mouth_*", "Sprite2D"):
\t\tn.visible = n.name == "Mouth_" + shape

func say(lipsync_json: String) -> void:
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(lipsync_json))
\tif not d is Dictionary:
\t\treturn
\t_cues = d.get("cues", [])
\tif _player:
\t\t_player.queue_free()
\t_player = AudioStreamPlayer.new()
\t_player.stream = load(lipsync_json.get_base_dir().path_join(d.get("sound", "")))
\t_player.finished.connect(set_mouth.bind("X"))
\tadd_child(_player)
\t_player.play()

func _process(_delta: float) -> void:
\tif _player == null or not _player.playing:
\t\treturn
\tvar t := _player.get_playback_position()
\tvar shape := "X"
\tfor c in _cues:
\t\tif c[0] > t:
\t\t\tbreak
\t\tshape = c[1]
\tset_mouth(shape)
`;

const safe = n => (n || 'bone').replace(/[^A-Za-z0-9_]/g, '_');

// each bone's pixels as its own cropped image: { names: {bone id: node name}, files: [{name, b64}], sprites: {bone id: {x0, y0, w, h}} }
// (the skeleton export and the ragdoll, ragdoll_godot.js, both use it)
export function cutParts(R, im, parts, prefix) {
  const names = {}, used = new Set(), files = [], sprites = {};
  for (const b of R.bones) { let n = safe(b.name), k = 2; while (used.has(n)) n = safe(b.name) + '_' + k++; used.add(n); names[b.id] = n; }
  R.bones.forEach((b, i) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (parts[y * im.width + x] === i + 1) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 < 0) return;
    const w = x1 - x0 + 1, hh = y1 - y0 + 1, o = new ImageData(w, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (parts[(y0 + y) * im.width + x0 + x] === i + 1) o.data.set(im.data.subarray(((y0 + y) * im.width + x0 + x) * 4, ((y0 + y) * im.width + x0 + x) * 4 + 4), (y * w + x) * 4);
    files.push({ name: `${prefix}${names[b.id]}.png`, b64: toDataURL(o) }); sprites[b.id] = { x0, y0, w, h: hh };
  });
  return { names, files, sprites };
}

export async function exportSkeleton(a, R, im, parts) {
  if (!R.bones.length) throw new Error('the rig has no bones');
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const dir = `sprites/${a.name}/rig`, res = g.root ? 'res://' + (FS.root + '/' + dir).slice(g.root.length + 1) : dir;
  const { names, files, sprites } = cutParts(R, im, parts, 'part_');
  const byId = Object.fromEntries(R.bones.map(b => [b.id, b])), path = b => { const out = []; let q = b; while (q) { out.unshift(names[q.id]); q = q.parent != null ? byId[q.parent] : null; } return out.join('/'); };
  const ext = R.bones.filter(b => sprites[b.id]).map(b => `[ext_resource type="Texture2D" path="${res}/part_${names[b.id]}.png" id="p${b.id}"]`).join('\n');
  // one Animation per motion: every bone's rotation (radians) and the root's position, a key per frame
  const anims = (R.motions || []).map((m, mi) => {
    const dt = 1 / m.fps, times = Array.from({ length: m.n }, (_, t) => +(t * dt).toFixed(4)), poses = times.map((_, t) => poseAt(m, t));
    const tr = [];
    for (const b of R.bones) tr.push([`Skeleton2D/${path(b)}:rotation`, poses.map(p => ((p[b.id] || 0) * Math.PI / 180).toFixed(5))]);
    const root = R.bones.find(b => b.parent == null);
    if (root) tr.push([`Skeleton2D/${path(root)}:position`, poses.map(p => `Vector2(${root.x + (p._root?.dx || 0)}, ${root.y + (p._root?.dy || 0)})`)]);
    const tracks = tr.map(([np, vals], k) => `tracks/${k}/type = "value"\ntracks/${k}/imported = false\ntracks/${k}/enabled = true\ntracks/${k}/path = NodePath("${np}")\ntracks/${k}/interp = 1\ntracks/${k}/loop_wrap = true\n`
      + `tracks/${k}/keys = {\n"times": PackedFloat32Array(${times.join(', ')}),\n"transitions": PackedFloat32Array(${times.map(() => 1).join(', ')}),\n"update": 1,\n"values": [${vals.join(', ')}]\n}`).join('\n');
    return { id: `anim${mi}`, name: safe(m.name), text: `[sub_resource type="Animation" id="anim${mi}"]\nresource_name = "${safe(m.name)}"\nlength = ${(m.n * dt).toFixed(4)}\nloop_mode = ${m.loop ? 1 : 0}\nstep = ${dt.toFixed(4)}\n${tracks}\n` };
  });
  const lib = anims.length ? `[sub_resource type="AnimationLibrary" id="lib"]\n_data = {\n${anims.map(x => `"${x.name}": SubResource("${x.id}")`).join(',\n')}\n}\n` : '';
  // bones: each Bone2D sits at its joint relative to its parent's joint (rest pose: no rotation)
  const nodes = R.bones.slice().sort((u, v) => path(u).split('/').length - path(v).split('/').length).map(b => {
    const par = b.parent != null ? byId[b.parent] : null, px = par ? par.x : 0, py = par ? par.y : 0, parent = par ? `Skeleton2D/${path(par)}` : 'Skeleton2D';
    const len = Math.hypot(b.tx - b.x, b.ty - b.y), ang = Math.atan2(b.ty - b.y, b.tx - b.x) * 180 / Math.PI;
    let s = `[node name="${names[b.id]}" type="Bone2D" parent="${parent}"]\nposition = Vector2(${b.x - px}, ${b.y - py})\nrest = Transform2D(1, 0, 0, 1, ${b.x - px}, ${b.y - py})\nauto_calculate_length_and_angle = false\nlength = ${Math.max(1, len).toFixed(2)}\nbone_angle = ${ang.toFixed(2)}\n`;
    if (sprites[b.id]) s += `\n[node name="Part" type="Sprite2D" parent="Skeleton2D/${path(b)}"]\nz_index = ${Math.round(b.z)}\n${SHARP()}centered = false\nposition = Vector2(${sprites[b.id].x0 - b.x}, ${sprites[b.id].y0 - b.y})\ntexture = ExtResource("p${b.id}")\n`;
    return s;
  }).join('\n');
  // the head views and mouths, on the head bone (hidden until shown), and rig_face.gd to switch them
  const hi = Math.max(0, R.bones.findIndex(b => /head/i.test(b.name))), hb = R.bones[hi] || R.bones[R.bones.length - 1], faceExt = [];
  let face = '';
  if (hb && ((R.heads || []).length || Object.keys(R.mouths?.shapes || {}).length)) {
    const at = `Skeleton2D/${path(hb)}`;
    for (const hd of R.heads || []) { const n = safe(hd.view || hd.name || hd.id); files.push({ name: `head_${n}.png`, b64: hd.src }); faceExt.push(`[ext_resource type="Texture2D" path="${res}/head_${n}.png" id="h_${n}"]`);
      face += `\n[node name="Head_${n}" type="Sprite2D" parent="${at}"]\nvisible = false\nz_index = ${Math.round(hb.z) + 1}\n${SHARP()}centered = false\nposition = Vector2(${-hd.ax}, ${-hd.ay})\ntexture = ExtResource("h_${n}")\n`; }
    const mp = R.mouthAt || [hb.x, hb.y];
    for (const [k, src] of Object.entries(R.mouths?.shapes || {})) { files.push({ name: `mouth_${k}.png`, b64: src }); faceExt.push(`[ext_resource type="Texture2D" path="${res}/mouth_${k}.png" id="m_${k}"]`);
      face += `\n[node name="Mouth_${k}" type="Sprite2D" parent="${at}"]\nvisible = ${k === 'X'}\nz_index = ${Math.round(hb.z) + 2}\n${SHARP()}position = Vector2(${mp[0] - hb.x}, ${mp[1] - hb.y})\ntexture = ExtResource("m_${k}")\n`; }
    faceExt.push(`[ext_resource type="Script" path="${rtRes(baseOf(res.replace(/\/rig$/, '')), 'rigface')}" id="rf"]`);
    await writeRuntime({ rigface: RIG_FACE_GD });
  }
  const first = anims[0]?.name;
  const tscn = `[gd_scene load_steps=${R.bones.length + anims.length + faceExt.length + 2} format=3]\n\n${ext}\n${faceExt.join('\n')}\n\n${anims.map(x => x.text).join('\n')}\n${lib}\n`
    + `[node name="${safe(a.name)}_rig" type="Node2D"]\n${face ? 'script = ExtResource("rf")\n' : ''}\n[node name="Skeleton2D" type="Skeleton2D" parent="."]\nposition = Vector2(${-Math.round(im.width / 2)}, ${-im.height})\n\n${nodes}\n${face}\n`
    + `[node name="AnimationPlayer" type="AnimationPlayer" parent="."]\n${lib ? 'libraries = {\n"": SubResource("lib")\n}\n' : ''}${first ? `autoplay = "${first}"\n` : ''}`;
  files.push({ name: `${a.name}_rig.tscn`, text: tscn });
  await saveFiles(dir, files);
  return { path: `${dir}/${a.name}_rig.tscn` };
}
