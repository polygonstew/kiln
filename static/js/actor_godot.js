// Actor → Godot 4: the scene, scripts and shader Kiln writes for an actor. Everything here is plain text that
// Godot reads; the scripts are short and commented so a developer can open them and change them.
//   actorScene      <name>.tscn: CharacterBody2D (feet at 0) + AnimatedSprite2D + Body + Hurtbox / Hitbox areas
//   projectileScene projectile_<name>.tscn: Area2D flying one of the actor's animations
//   boxesOf         per-frame hit / hurt boxes in actor space (also written to manifest.json)
//   JUICE_GD        _kiln/actor/juice.gd: hit_flash, squash, shake, hurt, shoot, box following
//   PROJECTILE_GD   _kiln/actor/projectile.gd    FLASH_SHADER  _kiln/actor/hit_flash.gdshader   (paths: layout.js)
import { bbox } from './core.js';
import { BRAINS, defaultBrain } from './brains.js';
import { rtRes, brainPath, baseOf } from './layout.js';

// Godot 4 drop-in: CharacterBody2D (origin at the feet) + AnimatedSprite2D + body hitbox, with the same
// "juice" the Animate preview shows: hit_flash(), squash(), shake() from _kiln/actor/juice.gd.
export const JUICE_GD = `extends CharacterBody2D
## Kiln juice: the hit flash, squash and stretch and screen shake you previewed in Kiln's Animate.
## Call them from your gameplay code, e.g. when the player is hit: hit_flash(); shake()

@onready var sprite: AnimatedSprite2D = $Sprite
var _base_scale := Vector2.ONE
var _base_y := 0.0

func _ready() -> void:
\tadd_to_group("kiln_actors")      # level_tiles.gd hurts actors in this group on hazard tiles
\t_base_scale = sprite.scale
\t_base_y = sprite.position.y
\t_hitbox = get_node_or_null("Hitbox")
\t_hurtbox = get_node_or_null("Hurtbox")
\tif _hurtbox and _hurtbox.get_child_count() > 0:
\t\tvar c := _hurtbox.get_child(0) as CollisionShape2D
\t\t_body_box = [c.position.x, c.position.y, c.shape.size.x, c.shape.size.y]
\tif _hitbox:
\t\t_hitbox.area_entered.connect(_on_hitbox)
\tsprite.frame_changed.connect(_update_boxes)
\tsprite.animation_changed.connect(_update_boxes)
\t_update_boxes()

# ---------------------------------------------------------------- hit / hurt boxes (drawn in Kiln, per frame)
var _hitbox: Area2D
var _hurtbox: Area2D
var _body_box := []

## Moves the Hitbox / Hurtbox shapes to this frame's boxes (metadata "boxes", written by Kiln).
func _update_boxes() -> void:
\tvar all: Dictionary = get_meta("boxes", {})
\tvar frames: Array = all.get(String(sprite.animation), [])
\tvar b: Dictionary = frames[sprite.frame] if sprite.frame < frames.size() and frames[sprite.frame] is Dictionary else {}
\t_place(_hitbox, b.get("hit", []))
\tvar hurt_boxes: Array = b.get("hurt", [])
\t_place(_hurtbox, hurt_boxes if hurt_boxes.size() > 0 else ([_body_box] if _body_box.size() == 4 else []))

func _place(area: Area2D, rects: Array) -> void:
\tif area == null:
\t\treturn
\twhile area.get_child_count() < rects.size():
\t\tvar c := CollisionShape2D.new()
\t\tc.shape = RectangleShape2D.new()
\t\tarea.add_child(c)
\tvar flip := -1.0 if sprite.flip_h else 1.0
\tfor i in area.get_child_count():
\t\tvar c := area.get_child(i) as CollisionShape2D
\t\tif i < rects.size():
\t\t\tvar r: Array = rects[i]
\t\t\tc.position = Vector2(r[0] * flip, r[1])
\t\t\tc.shape = c.shape.duplicate() if c.shape.get_reference_count() > 1 else c.shape
\t\t\tc.shape.size = Vector2(r[2], r[3])
\t\tc.set_deferred("disabled", i >= rects.size())

## A hitbox touched someone's Hurtbox: hurt them (they ignore it while invulnerable).
func _on_hitbox(other: Area2D) -> void:
\tvar t := other.get_parent()
\tif other.name == "Hurtbox" and t != self and t.has_method("hurt"):
\t\tt.hurt(global_position)

## Flash the sprite (white by default) a few quick times.
func hit_flash(times: int = 2, color: Color = Color.WHITE) -> void:
\tvar m := sprite.material as ShaderMaterial
\tif m == null:
\t\treturn
\tm.set_shader_parameter("flash_color", color)
\tvar t := create_tween()
\tfor i in times:
\t\tt.tween_callback(m.set_shader_parameter.bind("flash", 1.0))
\t\tt.tween_interval(0.045)
\t\tt.tween_callback(m.set_shader_parameter.bind("flash", 0.0))
\t\tt.tween_interval(0.045)

## Squash and spring back, feet staying on the floor (a landing, a heavy hit).
func squash(amount: float = 0.25, duration: float = 0.42) -> void:
\tcreate_tween().tween_method(_apply_squash.bind(amount), 1.0, 0.0, duration)

func _apply_squash(k: float, amount: float) -> void:
\tvar e := sin(k * PI * 2.5) * k
\tvar s := Vector2(1.0 + amount * e, 1.0 - amount * 0.8 * e)
\tsprite.scale = _base_scale * s
\tsprite.position.y = _base_y * s.y

## Shake the active Camera2D (if there is one).
func shake(strength: float = 4.0, duration: float = 0.3) -> void:
\tvar cam := get_viewport().get_camera_2d()
\tif cam == null:
\t\treturn
\tvar t := create_tween()
\tvar steps := maxi(1, int(duration / 0.03))
\tfor i in steps:
\t\tvar k := 1.0 - float(i) / steps
\t\tt.tween_property(cam, "offset", Vector2(randf_range(-1, 1), randf_range(-1, 1)) * strength * k, 0.03)
\tt.tween_property(cam, "offset", Vector2.ZERO, 0.03)

# ---------------------------------------------------------------- being hit (set in Kiln's Workshop)
@export var knockback := 60.0              ## how far a hit pushes this actor (px/s)
@export var invulnerable_time := 0.6       ## seconds of blinking safety after a hit
@export var projectile: PackedScene        ## what shoot() fires (a Kiln projectile scene)
@export var hit_effect: PackedScene        ## spawned where a hit lands (Kiln Workshop → Effects)
@export var max_health := 3                ## hits it takes; the player's health also drives a Kiln HUD
var health := -1
var invulnerable := false
var dead := false
signal hurt_started(from_position: Vector2)
signal died

## Take a hit: lose health, flash, squash, shake, knockback away from the hit, blink while invulnerable, play "hurt".
func hurt(from_position: Vector2 = Vector2.INF, damage: int = 1) -> void:
\tif invulnerable or dead:
\t\treturn
\tif health < 0:
\t\thealth = max_health
\thealth = maxi(0, health - damage)
\t_tell_hud()
\tif health == 0:
\t\tdie()
\t\treturn
\tsfx("hurt")
\tvar c := sprite.global_position
\t_effect(hit_effect, c if from_position == Vector2.INF else c + (from_position - c).limit_length(6.0))
\thurt_started.emit(from_position)
\thit_flash()
\tsquash(0.18)
\tshake(3.0, 0.2)
\tif from_position != Vector2.INF:
\t\tvelocity = Vector2(signf(global_position.x - from_position.x) * knockback, -knockback * 0.4)
\tif sprite.sprite_frames.has_animation("hurt"):
\t\tsprite.play("hurt")
\t\tsprite.animation_finished.connect(_back_to_idle, CONNECT_ONE_SHOT)
\tinvulnerable = true
\tvar blink := create_tween().set_loops(maxi(1, int(invulnerable_time / 0.1)))
\tblink.tween_property(sprite, "modulate:a", 0.35, 0.05)
\tblink.tween_property(sprite, "modulate:a", 1.0, 0.05)
\tawait get_tree().create_timer(invulnerable_time).timeout
\tblink.kill()
\tsprite.modulate.a = 1.0
\tinvulnerable = false

## Out of health: play "death" (if it has one), then enemies disappear and the player's level restarts.
func die() -> void:
\tdead = true
\tdied.emit()
\tsfx("die")
\tvelocity = Vector2.ZERO
\tif sprite.sprite_frames.has_animation("death"):
\t\tsprite.sprite_frames.set_animation_loop("death", false)
\t\tsprite.play("death")
\t\tawait sprite.animation_finished
\tif is_in_group("player"):
\t\tget_tree().reload_current_scene()
\telse:
\t\tqueue_free()

## Spawn a Kiln effect scene (plays once, removes itself) at a point in the world.
func _effect(scene: PackedScene, at: Vector2) -> void:
\tif scene == null:
\t\treturn
\tvar e := scene.instantiate() as Node2D
\tget_parent().add_child(e)
\te.global_position = at

## Play one of this actor's sounds (made in Kiln's Workshop): "jump", "attack", "hurt", "shoot", "die".
func sfx(event: String) -> void:
\tvar p := get_node_or_null("Sfx_" + event) as AudioStreamPlayer2D
\tif p:
\t\tp.play()

## Heal (or set) health; the player's HUD follows.
func heal(amount: int = 1) -> void:
\thealth = mini(max_health, maxi(health, 0) + amount)
\t_tell_hud()

func _tell_hud() -> void:
\tif not is_in_group("player"):
\t\treturn
\tvar hud := get_tree().get_first_node_in_group("kiln_hud")
\tif hud and hud.has_method("set_health"):
\t\thud.set_health(float(health) / max_health)

func _back_to_idle() -> void:
\tif sprite.sprite_frames.has_animation("idle"):
\t\tsprite.play("idle")

## Fire this actor's projectile (or the one given) toward direction; returns it.
func shoot(direction := Vector2.RIGHT, scene: PackedScene = null) -> Node:
\tvar s := scene if scene else projectile
\tif s == null:
\t\treturn null
\tvar p := s.instantiate()
\tget_parent().add_child(p)
\tp.global_position = sprite.global_position + Vector2(signf(direction.x) * 10.0, 0)
\tif p.has_method("launch"):
\t\tp.launch(direction, self)
\tsfx("shoot")
\treturn p
`;
// shared by every projectile scene Kiln writes
export const PROJECTILE_GD = `extends Area2D
## Kiln projectile: flies, falls with gravity_scale, hits anything with hurt(), then disappears (unless pierce).

@export var speed := 160.0
@export var gravity_scale := 0.0
@export var lifetime := 2.0
@export var damage := 1
@export var pierce := false
@export var impact_effect: PackedScene   ## spawned where it hits (Kiln Workshop → Projectiles)
var velocity := Vector2.ZERO
var shooter: Node = null
signal hit(target: Node)

func _ready() -> void:
\tbody_entered.connect(_on_hit)
\tarea_entered.connect(_on_hit)
\tget_tree().create_timer(lifetime).timeout.connect(queue_free)
\tif velocity == Vector2.ZERO:
\t\tvelocity = Vector2(speed, 0)

func launch(direction: Vector2, from: Node = null) -> void:
\tshooter = from
\tvelocity = direction.normalized() * speed
\t$Sprite.flip_h = direction.x < 0

func _physics_process(delta: float) -> void:
\tvelocity.y += 980.0 * gravity_scale * delta
\tposition += velocity * delta

func _on_hit(other: Node) -> void:
\tif other is Area2D and other.name != "Hurtbox":
\t\treturn          # only bodies and Kiln Hurtboxes count, not hitboxes or other triggers
\tvar t := other if other.has_method("hurt") else other.get_parent()
\tif t == shooter:
\t\treturn
\thit.emit(t)
\tif t.has_method("hurt"):
\t\tt.hurt(global_position, damage)
\tif impact_effect:
\t\tvar e := impact_effect.instantiate() as Node2D
\t\tget_parent().add_child(e)
\t\te.global_position = global_position
\tif not pierce:
\t\tqueue_free()
`;
export const FLASH_SHADER = `shader_type canvas_item;
// Kiln hit flash: mixes the sprite toward flash_color while keeping its shape (alpha).
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0);

void fragment() {
\tvec4 c = texture(TEXTURE, UV);
\tCOLOR = vec4(mix(c.rgb, flash_color.rgb, flash), c.a);
}
`;
// lip sync: an actor with a "mouths" animation (Puppet → Bake mouth set) talks in time with its voice lines
export const LIPSYNC_GD = `extends Node
## Kiln lip sync: plays a voice line and moves the mouth with it. Sits on a "LipSync" node under a Kiln actor whose
## sprite has a "mouths" animation, one frame per mouth shape X A B C D E F G H (Kiln: Puppet → Bake mouth set).
##   $LipSync.say("res://sprites/miner/voice/hello.lipsync.json")   # the sound beside it plays, the mouth follows
## The .lipsync.json holds the sound's file name and cues: [[seconds, shape], ...] (Kiln works them out from the sound).
signal finished
const SHAPES := "XABCDEFGH"
@onready var sprite: AnimatedSprite2D = get_parent().get_node("Sprite")
var _player: AudioStreamPlayer2D
var _cues: Array = []
var _before := &""                 # what the sprite played before it talked

func say(lipsync_json: String) -> void:
\tvar d = JSON.parse_string(FileAccess.get_file_as_string(lipsync_json))
\tif not d is Dictionary:
\t\tpush_warning("Kiln lip sync: cannot read " + lipsync_json)
\t\treturn
\t_cues = d.get("cues", [])
\tif _player == null:
\t\t_player = AudioStreamPlayer2D.new()
\t\tadd_child(_player)
\t\t_player.finished.connect(_done)
\t_player.stream = load(lipsync_json.get_base_dir().path_join(d.get("sound", "")))
\tif sprite.animation != &"mouths":
\t\t_before = sprite.animation
\tsprite.play(&"mouths")
\tsprite.pause()
\t_player.play()

func talking() -> bool:
\treturn _player != null and _player.playing

func _process(_delta: float) -> void:
\tif not talking():
\t\treturn
\t# brains pick idle / walk every physics frame; this runs after them, so the mouth is what shows
\tif sprite.animation != &"mouths":
\t\tsprite.play(&"mouths")
\t\tsprite.pause()
\tvar t := _player.get_playback_position()
\tvar shape := "X"
\tfor c in _cues:                 # cues are in time order: the last one already started is the mouth now
\t\tif c[0] > t:
\t\t\tbreak
\t\tshape = c[1]
\tsprite.frame = maxi(0, SHAPES.find(shape))

func _done() -> void:
\tsprite.play(_before if _before != &"" else &"idle")
\tfinished.emit()
`;
export function actorScene(a, res, hb) {
  const start = (a.anims.find(n => /idle|stand/i.test(n.name)) || a.anims[0]).name;
  const base = baseOf(res), R = a.react || {}, pj = (a.projectiles || [])[0], br = brainOf(a);
  return `[gd_scene load_steps=${pj ? 8 : 7} format=3]\n\n[ext_resource type="SpriteFrames" path="${res}/${a.name}.tres" id="1"]\n`
    + (pj ? `[ext_resource type="PackedScene" path="${res}/projectile_${pj.name}.tscn" id="4"]\n` : '')
    + (br ? `[ext_resource type="Script" path="${base}${brainPath(br)}" id="5"]\n` : '')
    + Object.keys(a.sounds || {}).map(ev => `[ext_resource type="AudioStream" path="${res}/sfx_${ev}.wav" id="sfx_${ev}"]\n`).join('')
    + (a.vfx?.hit ? `[ext_resource type="PackedScene" path="${res}/vfx_hit.tscn" id="vfx_hit"]\n` : '')
    + (talks(a) ? `[ext_resource type="Script" path="${rtRes(base, 'lipsync')}" id="lip"]\n` : '')
    + `[ext_resource type="Script" path="${rtRes(base, 'juice')}" id="2"]\n[ext_resource type="Shader" path="${rtRes(base, 'flash')}" id="3"]\n\n`
    + `[sub_resource type="ShaderMaterial" id="flash"]\nshader = ExtResource("3")\nshader_parameter/flash = 0.0\nshader_parameter/flash_color = Color(1, 1, 1, 1)\n\n`
    + `[sub_resource type="RectangleShape2D" id="body"]\nsize = Vector2(${hb.w}, ${hb.h})\n\n`
    + `[sub_resource type="RectangleShape2D" id="hurt"]\nsize = Vector2(${hb.w}, ${hb.h})\n\n`
    + `[node name="${a.name}" type="CharacterBody2D"${(a.role || (a.kind === 'creature' ? 'enemy' : 'hero')) === 'hero' ? ' groups=["player"]' : ''}]\nscript = ExtResource("2")\nknockback = ${R.knockback ?? 60}.0\ninvulnerable_time = ${R.iframes ?? 0.6}\nmax_health = ${R.health ?? 3}\n${a.vfx?.hit ? 'hit_effect = ExtResource("vfx_hit")\n' : ''}${pj ? 'projectile = ExtResource("4")\n' : ''}`
    + (Object.keys(boxesOf(a)).length ? `metadata/boxes = ${JSON.stringify(boxesOf(a))}\n` : '') + '\n'
    + `[node name="Sprite" type="AnimatedSprite2D" parent="."]\nmaterial = SubResource("flash")\ntexture_filter = 1\nposition = Vector2(0, ${-a.h / 2})\nsprite_frames = ExtResource("1")\nanimation = &"${start}"\nautoplay = "${start}"\n\n`
    + `[node name="Body" type="CollisionShape2D" parent="."]\nposition = Vector2(${hb.x + hb.w / 2 - a.w / 2}, ${hb.y + hb.h / 2 - a.h})\nshape = SubResource("body")\n\n`
    + `[node name="Hurtbox" type="Area2D" parent="."]\n\n[node name="Shape" type="CollisionShape2D" parent="Hurtbox"]\nposition = Vector2(${hb.x + hb.w / 2 - a.w / 2}, ${hb.y + hb.h / 2 - a.h})\nshape = SubResource("hurt")\n\n`
    + `[node name="Hitbox" type="Area2D" parent="."]\n`
    + Object.keys(a.sounds || {}).map(ev => `\n[node name="Sfx_${ev}" type="AudioStreamPlayer2D" parent="."]\nstream = ExtResource("sfx_${ev}")\n`).join('')
    + (talks(a) ? `\n[node name="LipSync" type="Node" parent="."]\nscript = ExtResource("lip")\n` : '')
    + (br ? `\n[node name="Brain" type="Node" parent="."]\nscript = ExtResource("5")\n` + BRAINS[br].params.map(([k, , , , , d]) => {
      const v = (a.brainParams || {})[k] ?? d;
      return `${k} = ${k === 'turn_at_ledges' ? !!v : Number.isInteger(v) ? v.toFixed(1) : v}\n`;
    }).join('') : '');
}
// it can talk (lip sync) when it has the mouth set
export const talks = a => a.anims.some(n => n.name === 'mouths');
// the behaviour this actor runs: chosen in the Workshop, or the default for its role ('' = none)
export const brainOf = a => { const b = a.brain ?? defaultBrain(a.role || (a.kind === 'creature' ? 'enemy' : 'hero')); return BRAINS[b] ? b : ''; };
// per-frame boxes in the actor's local space ([centre x, centre y, w, h], feet at 0): { anim: [ {hit, hurt} | {} per frame ] }
export function boxesOf(a) {
  const out = {}, loc = (r, f) => [r.x + r.w / 2 - f.width / 2, r.y + r.h / 2 - a.h, r.w, r.h];
  for (const n of a.anims) {
    if (!n.frames.some(f => f.boxes && ((f.boxes.hit || []).length || (f.boxes.hurt || []).length))) continue;
    out[n.name] = n.frames.map(f => f.boxes ? { hit: (f.boxes.hit || []).map(r => loc(r, f)), hurt: (f.boxes.hurt || []).map(r => loc(r, f)) } : {});
  }
  return out;
}
// a projectile: Area2D flying one of the actor's animations (proj_<name>), with a round hit shape from its first frame
export function projectileScene(a, res, pj) {
  const base = baseOf(res), n = a.anims.find(x => x.name === pj.anim);
  const b = n && bbox(n.frames[0]), r = b ? Math.max(2, Math.round(Math.max(b.w, b.h) / 2)) : 4;
  const off = b ? `position = Vector2(${b.x + b.w / 2 - n.frames[0].width / 2}, ${b.y + b.h / 2 - n.frames[0].height / 2})\n` : '';
  return `[gd_scene load_steps=4 format=3]\n\n[ext_resource type="SpriteFrames" path="${res}/${a.name}.tres" id="1"]\n[ext_resource type="Script" path="${rtRes(base, 'projectile')}" id="2"]\n`
    + (pj.impact ? `[ext_resource type="PackedScene" path="${res}/vfx_${pj.name}_impact.tscn" id="3"]\n` : '') + '\n'
    + `[sub_resource type="CircleShape2D" id="c"]\nradius = ${r}.0\n\n`
    + `[node name="${pj.name}" type="Area2D"]\nscript = ExtResource("2")\nspeed = ${pj.speed}.0\ngravity_scale = ${pj.gravity}\nlifetime = ${pj.lifetime}\ndamage = ${pj.damage}\npierce = ${!!pj.pierce}\n${pj.impact ? 'impact_effect = ExtResource("3")\n' : ''}\n`
    + `[node name="Sprite" type="AnimatedSprite2D" parent="."]\ntexture_filter = 1\nsprite_frames = ExtResource("1")\nanimation = &"${pj.anim}"\nautoplay = "${pj.anim}"\n\n`
    + `[node name="Hit" type="CollisionShape2D" parent="."]\n${off}shape = SubResource("c")\n`;
}
