// Ragdolls: an actor rigged in Puppet can fall apart when it dies. Each bone's pixels become a RigidBody2D, each joint a
// PinJoint2D (damped, so limbs swing heavily instead of whirling: Godot's joint angle limits make 2D physics blow up),
// saved next to the actor as ragdoll.tscn; juice.gd swaps
// the actor for it in die() and flings it with the actor's speed. The pieces hit the level but not each other.
import { imgData } from './core.js';
import { partsFromB64 } from './rig.js';
import { cutParts } from './rig_godot.js';
import { rtRes, baseOf } from './layout.js';
import { SHARP } from './gametype.js';

export const RAGDOLL_GD = `extends Node2D
## Kiln ragdoll: the pieces of a Puppet-rigged actor (one RigidBody2D per bone, PinJoint2Ds at the joints) that
## juice.gd drops in when the actor dies. fling() sets them moving; after linger seconds they fade away (0 = stay).

@export var linger := 4.0
@export var spin := 6.0          ## how much the pieces tumble

func fling(velocity: Vector2) -> void:
\tfor b in get_children():
\t\tif b is RigidBody2D:
\t\t\tb.linear_velocity = velocity + Vector2(randf_range(-40.0, 40.0), randf_range(-60.0, 0.0))
\t\t\tb.angular_velocity = randf_range(-spin, spin)
\tif linger > 0.0:
\t\tawait get_tree().create_timer(linger).timeout
\t\tvar t := create_tween()
\t\tt.tween_property(self, "modulate:a", 0.0, 0.6)
\t\tt.tween_callback(queue_free)
`;

// files for sprites/<actor>/: rag_<bone>.png pieces and ragdoll.tscn; res = the actor folder as scenes refer to it
export async function ragdollFiles(a, res) {
  const R = a.rig, im = await imgData(R.src), parts = partsFromB64(R.parts, im.width * im.height);
  const { names, files, sprites } = cutParts(R, im, parts, 'rag_');
  const ox = -Math.round(im.width / 2), oy = -im.height;                 // the actor's origin: feet, centred
  const byId = Object.fromEntries(R.bones.map(b => [b.id, b])), bodies = R.bones.filter(b => sprites[b.id]);
  const ext = [`[ext_resource type="Script" path="${rtRes(baseOf(res), 'ragdoll')}" id="s"]`, ...bodies.map(b => `[ext_resource type="Texture2D" path="${res}/rag_${names[b.id]}.png" id="t${b.id}"]`)];
  const subs = bodies.map(b => `[sub_resource type="RectangleShape2D" id="r${b.id}"]\nsize = Vector2(${Math.max(2, sprites[b.id].w * .8).toFixed(1)}, ${Math.max(2, sprites[b.id].h * .8).toFixed(1)})\n`);
  const nodes = [`[node name="${a.name}_ragdoll" type="Node2D"]\nscript = ExtResource("s")\n`];
  for (const b of bodies) {
    const s = sprites[b.id];
    nodes.push(`[node name="${names[b.id]}" type="RigidBody2D" parent="."]\nposition = Vector2(${b.x + ox}, ${b.y + oy})\ncollision_layer = 2\ncollision_mask = 1\nmass = ${Math.max(.3, s.w * s.h / 400).toFixed(2)}\nangular_damp = 3.0\n`,
      `[node name="Part" type="Sprite2D" parent="${names[b.id]}"]\n${SHARP()}centered = false\nposition = Vector2(${s.x0 - b.x}, ${s.y0 - b.y})\ntexture = ExtResource("t${b.id}")\n`,
      `[node name="Shape" type="CollisionShape2D" parent="${names[b.id]}"]\nposition = Vector2(${s.x0 + s.w / 2 - b.x}, ${s.y0 + s.h / 2 - b.y})\nshape = SubResource("r${b.id}")\n`);
  }
  // a joint where each bone meets its parent (both need pieces)
  for (const b of bodies) {
    const p = b.parent != null ? byId[b.parent] : null;
    if (!p || !sprites[p.id]) continue;
    nodes.push(`[node name="Joint_${names[b.id]}" type="PinJoint2D" parent="."]\nposition = Vector2(${b.x + ox}, ${b.y + oy})\nnode_a = NodePath("../${names[p.id]}")\nnode_b = NodePath("../${names[b.id]}")\nsoftness = 0.1\n`);
  }
  files.push({ name: 'ragdoll.tscn', text: `[gd_scene load_steps=${ext.length + subs.length + 1} format=3]\n\n${ext.join('\n')}\n\n${subs.join('\n')}\n${nodes.join('\n')}` });
  return files;
}
