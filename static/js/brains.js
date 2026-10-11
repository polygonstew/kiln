// Brains: ready-made behaviours for actors (player platformer, patrol, flyer). Each is one short, commented
// GDScript that sits on a "Brain" node under a Kiln actor and drives it (its parent). Kiln picks the defaults;
// the numbers are sliders in the Workshop and @export vars in Godot, and the script itself is plain text you can
// open and change in Logic. Shared copies are written to sprites/_kiln/brains/<id>.gd.

// params: [name, label, min, max, step, default, hint]
export const BRAINS = {
  player: { label: 'Player (platformer)', desc: 'Run, jump (higher while held), coyote time, ladders, swimming, attack (X) and shoot (C).',
    params: [['speed', 'Run speed', 30, 240, 5, 90, 'px/s'], ['jump_height', 'Jump height', 8, 120, 2, 40, 'px'], ['jump_time', 'Time to top', .15, .8, .01, .35, 's'],
      ['coyote_time', 'Coyote time', 0, .2, .01, .08, 's to still jump after leaving a ledge']] },
  patrol: { label: 'Patrol (walker)', desc: 'Walks back and forth, turns at walls and ledges, hurts the player on touch.',
    params: [['speed', 'Walk speed', 5, 150, 5, 30, 'px/s'], ['turn_at_ledges', 'Turn at ledges', 0, 1, 1, 1, '1 = yes']] },
  flyer: { label: 'Flyer (chaser)', desc: 'Hovers in place with a gentle bob; flies at the player when it comes near, then drifts home.',
    params: [['speed', 'Fly speed', 10, 200, 5, 50, 'px/s'], ['sight', 'Sight', 20, 300, 10, 110, 'px'], ['bob', 'Bob', 0, 12, 1, 4, 'px']] },
};

const HEAD = (title, what) => `extends Node
## Kiln brain: ${title}. ${what}
## Sits on a "Brain" node under a Kiln actor (CharacterBody2D with juice.gd) and drives its parent.
## Change the numbers in Kiln's Workshop or in the Inspector; change the behaviour right here.
`;

export const BRAIN_GD = {
  player: HEAD('player (platformer)', 'Keyboard / gamepad: arrows or stick, Space / A to jump,\n## X to attack, C to shoot (actions "attack" and "shoot" are added if your project has none).') + `
@export var speed := 90.0         ## run speed, px/s
@export var jump_height := 40.0   ## px
@export var jump_time := 0.35     ## seconds to the top of a jump
@export var coyote_time := 0.08   ## seconds you can still jump after walking off a ledge
@export var climb_speed := 60.0   ## on ladders, px/s

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var gravity := 0.0
var jump_velocity := 0.0
var _coyote := 0.0
var _climbing := false

func _ready() -> void:
\tretune()
\t_add_key("attack", KEY_X)
\t_add_key("shoot", KEY_C)

## Work out gravity and jump speed from the jump numbers (call again after changing them, as Kiln's Stage does).
func retune() -> void:
\tgravity = 2.0 * jump_height / (jump_time * jump_time)   # the jump reaches jump_height in jump_time
\tjump_velocity = -gravity * jump_time

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\tvar dir := Input.get_axis("ui_left", "ui_right")
\tvar tiles := get_tree().get_first_node_in_group("kiln_tiles")
\tvar here: String = tiles.kind_at(actor.global_position + Vector2(0, -4)) if tiles else ""
\t# ladders: up or down on a ladder tile starts climbing, leaving the ladder stops it
\tif here == "ladder" and (Input.is_action_pressed("ui_up") or Input.is_action_pressed("ui_down")):
\t\t_climbing = true
\tif here != "ladder":
\t\t_climbing = false
\tif _climbing:
\t\tactor.velocity = Vector2(dir * speed * 0.5, Input.get_axis("ui_up", "ui_down") * climb_speed)
\telse:
\t\tactor.velocity.y += gravity * (0.35 if here == "water" else 1.0) * delta
\t\t_coyote = coyote_time if actor.is_on_floor() else _coyote - delta
\t\tif Input.is_action_just_pressed("ui_accept") and (_coyote > 0.0 or here == "water"):
\t\t\tactor.velocity.y = jump_velocity * (0.6 if here == "water" else 1.0)
\t\t\t_coyote = 0.0
\t\t\t_sound("jump")
\t\tif Input.is_action_just_released("ui_accept") and actor.velocity.y < 0.0:
\t\t\tactor.velocity.y *= 0.5   # let go early for a short hop
\t\tactor.velocity.x = move_toward(actor.velocity.x, dir * speed, speed * 10.0 * delta)
\tactor.move_and_slide()
\tif dir != 0.0:
\t\tsprite.flip_h = dir < 0.0
\tif Input.is_action_just_pressed("attack"):
\t\t_play("attack", true)
\t\t_sound("attack")
\tif Input.is_action_just_pressed("shoot") and actor.has_method("shoot"):
\t\tactor.shoot(Vector2(-1.0 if sprite.flip_h else 1.0, 0.0))
\t_animate(dir)

func _animate(dir: float) -> void:
\tif _busy():
\t\treturn
\tif _climbing:
\t\t_play("climb")
\telif not actor.is_on_floor():
\t\t_play("jump" if actor.velocity.y < 0.0 else "fall")
\telif dir != 0.0:
\t\t_play("run" if sprite.sprite_frames.has_animation("run") else "walk")
\telse:
\t\t_play("idle")

# attack and hurt play to the end before anything else
func _busy() -> bool:
\treturn sprite.is_playing() and sprite.animation in [&"attack", &"hurt"] and sprite.frame < sprite.sprite_frames.get_frame_count(sprite.animation) - 1

func _play(anim: String, restart := false) -> void:
\tif not sprite.sprite_frames.has_animation(anim):
\t\treturn
\tif restart:
\t\tsprite.sprite_frames.set_animation_loop(anim, false)
\tif restart or sprite.animation != anim:
\t\tsprite.play(anim)

func _sound(event: String) -> void:
\tif actor.has_method("sfx"):
\t\tactor.call("sfx", event)

func _add_key(action: String, key: Key) -> void:
\tif InputMap.has_action(action):
\t\treturn
\tInputMap.add_action(action)
\tvar e := InputEventKey.new()
\te.physical_keycode = key
\tInputMap.action_add_event(action, e)
`,
  patrol: HEAD('patrol', 'Walks back and forth, turns at walls and (optionally) ledges, hurts the player on touch.') + `
@export var speed := 30.0
@export var turn_at_ledges := true
@export var gravity := 900.0

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var dir := -1.0

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\tactor.velocity.y += gravity * delta
\tif actor.get("invulnerable"):
\t\tactor.velocity.x = move_toward(actor.velocity.x, 0.0, 300.0 * delta)   # let the knockback play out
\telse:
\t\tactor.velocity.x = dir * speed
\tactor.move_and_slide()
\tif actor.is_on_wall() or (turn_at_ledges and actor.is_on_floor() and not _ground_ahead()):
\t\tdir = -dir
\tsprite.flip_h = dir < 0.0
\tif sprite.sprite_frames.has_animation("walk") and sprite.animation != &"hurt":
\t\tsprite.play("walk")
\tfor i in actor.get_slide_collision_count():
\t\tvar other := actor.get_slide_collision(i).get_collider()
\t\tif other and other.is_in_group("player") and not actor.is_in_group("player") and other.has_method("hurt"):
\t\t\tother.hurt(actor.global_position)

func _ground_ahead() -> bool:
\tvar from := actor.global_position + Vector2(dir * 6.0, -2.0)
\tvar q := PhysicsRayQueryParameters2D.create(from, from + Vector2(0, 10), actor.collision_mask, [actor.get_rid()])
\treturn not actor.get_world_2d().direct_space_state.intersect_ray(q).is_empty()
`,
  flyer: HEAD('flyer', 'Hovers and bobs; chases the player inside sight, drifts home outside it. Hurts on touch.') + `
@export var speed := 50.0
@export var sight := 110.0   ## px
@export var bob := 4.0       ## px

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
@onready var home := actor.global_position
var _t := 0.0

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\t_t += delta
\tvar player := get_tree().get_first_node_in_group("player") as Node2D
\tvar goal := home + Vector2(0, sin(_t * 2.0) * bob)
\tif player and player.global_position.distance_to(actor.global_position) < sight:
\t\tgoal = player.global_position + Vector2(0, -8)
\tif not actor.get("invulnerable"):
\t\tactor.velocity = actor.velocity.move_toward((goal - actor.global_position).limit_length(speed), speed * 4.0 * delta)
\tactor.move_and_slide()
\tif absf(actor.velocity.x) > 1.0:
\t\tsprite.flip_h = actor.velocity.x < 0.0
\tfor i in actor.get_slide_collision_count():
\t\tvar other := actor.get_slide_collision(i).get_collider()
\t\tif other and other.is_in_group("player") and not actor.is_in_group("player") and other.has_method("hurt"):
\t\t\tother.hurt(actor.global_position)
`,
};

// role → the brain Kiln picks unless you choose another
export const defaultBrain = role => ({ hero: 'player', enemy: 'patrol', flyer: 'flyer', boss: 'patrol' })[role] || '';
