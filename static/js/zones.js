// Zones for Levels: rectangles that do something when the player walks in (checkpoint, door, message,
// deadly pit, or a named event for your own code). Drawn and edited in Levels → Paint → Zones, exported as
// Area2D nodes running _kiln/zone.gd. A zone is { id, kind, x, y, w, h (level px, tile-snapped), name, text, target, once }.
import { h, field, seg, select, check } from './core.js';

// [id, label, colour, what it does]
export const ZONE_KINDS = [
  ['checkpoint', 'Checkpoint', '#9cc76b', 'Remembers this spot: a deadly zone brings the player back here'],
  ['door', 'Door', '#6fb3d9', 'Goes to another level (the player appears at its start)'],
  ['message', 'Message', '#e3b04b', 'Shows text in the HUD dialogue box (or prints it)'],
  ['deadly', 'Deadly', '#e5534b', 'Pits and void: hurts the player and puts it back at the last checkpoint'],
  ['event', 'Event', '#c06bd6', 'Only a signal, triggered(name, body): hook up your own code'],
];
const colour = k => (ZONE_KINDS.find(r => r[0] === k) || ZONE_KINDS[4])[2];
export const zoneAt = (zones, px, py) => [...zones].reverse().find(z => px >= z.x && py >= z.y && px < z.x + z.w && py < z.y + z.h);

export function drawZones(x, zones, z, selId, active) {
  x.save(); x.font = `${Math.max(9, 4 * z)}px monospace`; x.textBaseline = 'top';
  for (const q of zones) {
    const c = colour(q.kind), on = q.id === selId;
    x.globalAlpha = active ? 1 : .45;
    x.fillStyle = c + (on ? '40' : '22'); x.fillRect(q.x * z, q.y * z, q.w * z, q.h * z);
    x.strokeStyle = c; x.lineWidth = on ? 2 : 1; x.setLineDash(on ? [] : [4, 3]); x.strokeRect(q.x * z + .5, q.y * z + .5, q.w * z - 1, q.h * z - 1);
    x.fillStyle = c; x.fillText((q.name || q.kind) + (q.kind === 'door' && q.target ? ' → ' + q.target : ''), q.x * z + 3, q.y * z + 3);
  }
  x.restore();
}

// the editor for one zone; levels: names of saved levels (door targets)
export function zonePanel(q, levels, changed, remove) {
  const name = h('input', { type: 'text', value: q.name || '', placeholder: q.kind, onchange: () => { q.name = name.value.replace(/[^A-Za-z0-9_]+/g, '_'); changed(); } });
  const text = h('textarea', { rows: 3, value: q.text || '', placeholder: 'What the message says', onchange: () => { q.text = text.value; changed(); } });
  return h('div', { class: 'zone-ed' },
    field('Does', select(ZONE_KINDS.map(([id, l]) => [id, l]), q.kind, v => { q.kind = v; changed(true); }), (ZONE_KINDS.find(r => r[0] === q.kind) || [])[3]),
    field('Name', name, q.kind === 'event' ? 'The event name your code receives' : 'Node name in Godot'),
    q.kind === 'message' ? field('Text', text) : null,
    q.kind === 'door' ? field('Goes to', select([['', 'Pick a level…'], ...levels.map(n => [n, n])], q.target || '', v => { q.target = v; changed(true); }), 'Save that level too') : null,
    field('Once', check('only the first time', !!q.once, v => { q.once = v; changed(); })),
    h('button', { class: 'btn sm ghost danger', onclick: remove }, 'Delete zone'));
}

// scene text: one Area2D per zone; base = path prefix of the asset folder ('' or 'res://…/')
export function zoneNodes(zones, base, extId) {
  return zones.map((q, i) => {
    const n = (q.name || `${q.kind}_${i + 1}`).replace(/[^A-Za-z0-9_]/g, '_');
    const target = q.kind === 'door' && q.target ? `${base}levels/${q.target}/${q.target}.tscn` : '';
    return `[node name="${n}" type="Area2D" parent="Zones"]\nposition = Vector2(${q.x + q.w / 2}, ${q.y + q.h / 2})\nscript = ExtResource("${extId}")\n`
      + `kind = "${q.kind}"\nevent_name = "${q.name || ''}"\ntarget = "${target}"\ntext = ${JSON.stringify(q.text || '')}\nonce = ${!!q.once}\n\n`
      + `[node name="Shape" type="CollisionShape2D" parent="Zones/${n}"]\nshape = SubResource("zone${i}")\n\n`;
  }).join('');
}
export const zoneShapes = zones => zones.map((q, i) => `[sub_resource type="RectangleShape2D" id="zone${i}"]\nsize = Vector2(${q.w}, ${q.h})\n\n`).join('');

export const ZONE_GD = `extends Area2D
## Kiln zone: a rectangle in a level that does something when the player (group "player") walks in.
##   checkpoint  remembers this spot: a "deadly" zone puts the player back here
##   door        changes to another level (target); the player appears at that level's PlayerStart
##   message     shows text in a Kiln HUD's dialogue box (group "kiln_hud"), or prints it
##   deadly      pits, void: hurts the player and puts it back at the last checkpoint; other Kiln actors are removed
##   event       only emits triggered(): connect it to your own code
## Every zone emits triggered(event_name, body) whatever its kind.

@export_enum("checkpoint", "door", "message", "deadly", "event") var kind := "event"
@export var event_name := ""
@export_file("*.tscn") var target := ""
@export_multiline var text := ""
@export var once := false
signal triggered(event_name: String, body: Node)
var _done := false

func _ready() -> void:
\tbody_entered.connect(_on_body)

func _on_body(body: Node) -> void:
\tvar is_player := body.is_in_group("player")
\tif _done or not (is_player or (kind == "deadly" and body.is_in_group("kiln_actors"))):
\t\treturn
\tif once:
\t\t_done = true
\ttriggered.emit(event_name if event_name != "" else kind, body)
\tmatch kind:
\t\t"checkpoint":
\t\t\tbody.set_meta("checkpoint", global_position + Vector2(0, _size().y / 2))
\t\t"door":
\t\t\tif target != "":
\t\t\t\tget_tree().call_deferred("change_scene_to_file", target)
\t\t"message":
\t\t\tvar hud := get_tree().get_first_node_in_group("kiln_hud")
\t\t\tif hud and hud.has_method("say"):
\t\t\t\thud.say("", text)
\t\t\telse:
\t\t\t\tprint(text)
\t\t"deadly":
\t\t\tif not is_player:
\t\t\t\tbody.queue_free()
\t\t\t\treturn
\t\t\tif body.has_method("hurt"):
\t\t\t\tbody.hurt()
\t\t\tvar start := get_parent().get_parent().get_node_or_null("PlayerStart") as Node2D
\t\t\tbody.global_position = body.get_meta("checkpoint", start.global_position if start else body.global_position)
\t\t\tif body is CharacterBody2D:
\t\t\t\tbody.velocity = Vector2.ZERO

func _size() -> Vector2:
\tvar s := get_node_or_null("Shape") as CollisionShape2D
\treturn (s.shape as RectangleShape2D).size if s else Vector2.ZERO
`;
