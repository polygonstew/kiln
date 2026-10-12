// Physics things for Levels: real rigid bodies (a box, a ball, a plank, a seesaw on its pivot), pressure buttons and the
// gates they open. Placed in Levels → Things like crates; each becomes plain Godot physics nodes (RigidBody2D,
// PinJoint2D, Area2D, AnimatableBody2D) drawn as simple shapes in its colour. Players shove bodies by walking into them
// (the brains apply an impulse). While any button in a level is held down (by a box, the player, anyone), every gate
// in it is open. An entity: { type: 'body', shape, colour, x, y } | { type: 'button', x, y } | { type: 'gate', x, y }.

export const SHAPES = {   // shape: [label, w, h in tiles, default colour, what]
  box: ['Box', 1, 1, '#c8894a', 'A wooden box: push it, stack it, drop it on a button'],
  ball: ['Ball', 1, 1, '#e05d5d', 'A bouncy ball that rolls down slopes'],
  plank: ['Plank', 4, .5, '#8a6a4a', 'A loose plank: a bridge, a ramp, a lever'],
  seesaw: ['Seesaw', 6, .5, '#6aa5d9', 'A plank on a pivot: drop weight on one end to fling the other'],
};

export const BUTTON_GD = `extends Area2D
## Kiln button: a plate on the floor. Anything with weight standing on it (a box, a ball, the player, any actor) holds
## it down; while any button in the level is down, every gate in the level (gate.gd) is open. Logic graphs hear
## "button_down:<name>" and "button_up:<name>".
signal pressed
signal released
var _on := 0

func _ready() -> void:
\tadd_to_group("kiln_buttons")
\tbody_entered.connect(_in)
\tbody_exited.connect(_out)

func is_down() -> bool:
\treturn _on > 0

func _in(body: Node) -> void:
\tif body is TileMapLayer or body is StaticBody2D:
\t\treturn                          # the floor and the gates don't count
\t_on += 1
\tif _on == 1:
\t\t_changed(true)

func _out(body: Node) -> void:
\tif body is TileMapLayer or body is StaticBody2D:
\t\treturn
\t_on = maxi(0, _on - 1)
\tif _on == 0:
\t\t_changed(false)

func _changed(down: bool) -> void:
\t$Plate.position.y = 3.0 if down else 0.0
\tif down:
\t\tpressed.emit()
\telse:
\t\treleased.emit()
\tget_tree().call_group("kiln_gates", "check")
\tget_tree().call_group("kiln_logic", "_kiln_message", ("button_down:" if down else "button_up:") + name)
`;

export const GATE_GD = `extends AnimatableBody2D
## Kiln gate: a door that slides up out of the way while any button in the level (button.gd) is held down, and back
## down when none is. Bodies and players are pushed along as it moves.
@export var lift := 48.0      ## px it rises when open
@export var speed := 140.0    ## px/s
@onready var shut := position
var open := false

func _ready() -> void:
\tadd_to_group("kiln_gates")

func check() -> void:
\topen = get_tree().get_nodes_in_group("kiln_buttons").any(func(b): return b.is_down())

func _physics_process(delta: float) -> void:
\tposition = position.move_toward(shut + (Vector2(0, -lift) if open else Vector2.ZERO), speed * delta)
`;

const poly = pts => `PackedVector2Array(${pts.map(p => p.map(v => +v.toFixed(2)).join(', ')).join(', ')})`;
const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const circle = r => Array.from({ length: 20 }, (_, i) => [Math.cos(i * Math.PI / 10) * r, Math.sin(i * Math.PI / 10) * r]);
const col = hx => { const n = parseInt(hx.slice(1), 16); return `Color(${((n >> 16) / 255).toFixed(3)}, ${((n >> 8 & 255) / 255).toFixed(3)}, ${((n & 255) / 255).toFixed(3)}, 1)`; };
const dark = hx => '#' + hx.slice(1).match(/../g).map(c => Math.round(parseInt(c, 16) * .6).toString(16).padStart(2, '0')).join('');

// scene text for a level's physics things: { ext, subs, nodes }; at(key) → a runtime script's res path
export function physicsParts(ents, T, at) {
  const things = ents.filter(e => ['body', 'button', 'gate'].includes(e.type));
  if (!things.length) return { ext: '', subs: '', nodes: '' };
  const subs = [], nodes = [], n = {};
  const name = k => `${k}_${n[k] = (n[k] || 0) + 1}`;
  const shapeNode = (parent, id, def, at0 = '0, 0') => `[node name="Shape" type="CollisionShape2D" parent="${parent}"]\nposition = Vector2(${at0})\nshape = SubResource("${id}")\n`;
  const look = (parent, pts, c, at0 = '0, 0') => `[node name="Look" type="Polygon2D" parent="${parent}"]\nposition = Vector2(${at0})\ncolor = ${col(c)}\npolygon = ${poly(pts)}\n\n`
    + `[node name="Edge" type="Line2D" parent="${parent}/Look"]\npoints = ${poly([...pts, pts[0]])}\nwidth = 2.0\ndefault_color = ${col(dark(c))}\n`;
  things.forEach((e, i) => {
    if (e.type === 'body') {
      const [, tw, th, c0] = SHAPES[e.shape] || SHAPES.box, c = e.colour || c0, w = tw * T, h = th * T, nm = name(e.shape), sid = `ph${i}`;
      if (e.shape === 'seesaw') {
        const piv = name('pivot'), pts = [[-T / 2, T / 2], [0, -T / 2], [T / 2, T / 2]];
        subs.push(`[sub_resource type="ConvexPolygonShape2D" id="${sid}p"]\npoints = ${poly(pts)}\n`, `[sub_resource type="RectangleShape2D" id="${sid}"]\nsize = Vector2(${w}, ${h})\n`);
        nodes.push(`[node name="${piv}" type="StaticBody2D" parent="."]\nposition = Vector2(${e.x}, ${e.y - T / 2})\n`, shapeNode(piv, `${sid}p`), look(piv, pts, dark(c)),
          `[node name="${nm}" type="RigidBody2D" parent="."]\nposition = Vector2(${e.x}, ${e.y - T - h / 2})\nmass = 3.0\n`, shapeNode(nm, sid), look(nm, rect(w, h), c),
          `[node name="${nm}_pin" type="PinJoint2D" parent="."]\nposition = Vector2(${e.x}, ${e.y - T - h / 2})\nnode_a = NodePath("../${piv}")\nnode_b = NodePath("../${nm}")\n`);
        return;
      }
      const ball = e.shape === 'ball';
      subs.push(ball ? `[sub_resource type="CircleShape2D" id="${sid}"]\nradius = ${w / 2}\n` : `[sub_resource type="RectangleShape2D" id="${sid}"]\nsize = Vector2(${w}, ${h})\n`);
      if (ball) subs.push(`[sub_resource type="PhysicsMaterial" id="${sid}m"]\nbounce = 0.55\n`);
      nodes.push(`[node name="${nm}" type="RigidBody2D" parent="."]\nposition = Vector2(${e.x}, ${e.y - h / 2})\nmass = ${e.shape === 'plank' ? 1.5 : 1}.0\n${ball ? `physics_material_override = SubResource("${sid}m")\n` : ''}`,
        shapeNode(nm, sid), look(nm, ball ? circle(w / 2) : rect(w, h), c));
    } else if (e.type === 'button') {
      const nm = name('button'), sid = `ph${i}`;
      subs.push(`[sub_resource type="RectangleShape2D" id="${sid}"]\nsize = Vector2(${T * 1.6}, ${T / 2})\n`);
      nodes.push(`[node name="${nm}" type="Area2D" parent="."]\nposition = Vector2(${e.x}, ${e.y - T / 4})\nscript = ExtResource("ph_button")\n`, shapeNode(nm, sid),
        `[node name="Plate" type="Node2D" parent="${nm}"]\n`, look(`${nm}/Plate`, rect(T * 1.6, T / 4), '#e5534b', `0, ${T / 8}`));
    } else {
      const nm = name('gate'), sid = `ph${i}`;
      subs.push(`[sub_resource type="RectangleShape2D" id="${sid}"]\nsize = Vector2(${T}, ${T * 3})\n`);
      nodes.push(`[node name="${nm}" type="AnimatableBody2D" parent="."]\nposition = Vector2(${e.x}, ${e.y - T * 1.5})\nscript = ExtResource("ph_gate")\nlift = ${T * 3}.0\n`, shapeNode(nm, sid), look(nm, rect(T, T * 3), '#7c8794'));
    }
  });
  const usesBtn = things.some(e => e.type === 'button'), usesGate = things.some(e => e.type === 'gate');
  return {
    ext: (usesBtn ? `[ext_resource type="Script" path="${at('button')}" id="ph_button"]\n` : '') + (usesGate ? `[ext_resource type="Script" path="${at('gate')}" id="ph_gate"]\n` : ''),
    subs: subs.map(s => s + '\n').join(''), nodes: nodes.join('\n') + '\n', runtime: { ...(usesBtn ? { button: BUTTON_GD } : {}), ...(usesGate ? { gate: GATE_GD } : {}) },
  };
}

// draw them on the Levels map (z: zoom)
export function drawPhysics(x, ents, T, z) {
  for (const e of ents) {
    x.save(); x.lineWidth = 2;
    if (e.type === 'body') {
      const [, tw, th, c0] = SHAPES[e.shape] || SHAPES.box, c = e.colour || c0, w = tw * T * z, h = th * T * z, cx = e.x * z, by = e.y * z;
      x.fillStyle = c; x.strokeStyle = dark(c);
      if (e.shape === 'ball') { x.beginPath(); x.arc(cx, by - w / 2, w / 2, 0, 7); x.fill(); x.stroke(); }
      else if (e.shape === 'seesaw') { x.fillStyle = dark(c); x.beginPath(); x.moveTo(cx - T * z / 2, by); x.lineTo(cx, by - T * z); x.lineTo(cx + T * z / 2, by); x.fill(); x.fillStyle = c; x.fillRect(cx - w / 2, by - T * z - h, w, h); x.strokeRect(cx - w / 2, by - T * z - h, w, h); }
      else { x.fillRect(cx - w / 2, by - h, w, h); x.strokeRect(cx - w / 2, by - h, w, h); }
    } else if (e.type === 'button') { x.fillStyle = '#e5534b'; x.fillRect((e.x - T * .8) * z, (e.y - T / 4) * z, T * 1.6 * z, T / 4 * z); }
    else if (e.type === 'gate') { x.fillStyle = '#7c8794'; x.strokeStyle = '#4a5260'; x.fillRect((e.x - T / 2) * z, (e.y - T * 3) * z, T * z, T * 3 * z); x.strokeRect((e.x - T / 2) * z, (e.y - T * 3) * z, T * z, T * 3 * z); }
    x.restore();
  }
}
