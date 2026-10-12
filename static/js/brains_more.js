// Brains for the other game paths (gametype.js): seen from above (topdown player, chaser, turret) and point & click
// (walker). Same shape as brains.js: a short, commented GDScript on a "Brain" node that drives its actor (the parent);
// the numbers are @export vars (sliders in the Workshop). brains.js merges these into BRAINS / BRAIN_GD.

// params: [name, label, min, max, step, default, hint]
export const MORE = {
  topdown: { label: 'Player (top-down)', desc: 'Seen from above: moves in eight directions (WASD / left stick), shoots where you aim (arrows / right stick), attack (X).',
    params: [['speed', 'Speed', 30, 240, 5, 80, 'px/s'], ['fire_rate', 'Shots per second', .5, 12, .5, 3, ''], ['accel', 'Grip', 200, 3000, 50, 900, 'how fast it gets to speed']] },
  chaser: { label: 'Chaser (top-down)', desc: 'Wanders until it sees the player, then runs at it. Hurts on touch.',
    params: [['speed', 'Speed', 5, 200, 5, 40, 'px/s'], ['sight', 'Sight', 20, 400, 10, 150, 'px']] },
  turret: { label: 'Turret (top-down boss)', desc: 'Drifts toward the player and fires its projectile at it in a fan. Hurts on touch.',
    params: [['speed', 'Drift speed', 0, 120, 5, 15, 'px/s (0 stays put)'], ['fire_every', 'Fires every', .2, 5, .1, 1.4, 's'], ['shots', 'Shots per volley', 1, 7, 2, 3, 'in a fan'], ['sight', 'Sight', 40, 500, 10, 220, 'px']] },
  runner: { label: 'Runner (endless)', desc: 'Runs right by itself, faster and faster; Space, a click or pad A jumps (higher while held). Falling off the level is the end.',
    params: [['speed', 'Start speed', 40, 400, 5, 140, 'px/s'], ['speed_up', 'Speeds up', 0, 20, .5, 3, 'px/s every second'], ['jump_height', 'Jump height', 8, 200, 2, 60, 'px']] },
  walker: { label: 'Walker (point & click)', desc: 'Walks where you click, around the room\'s walk area, smaller further away. The stick or arrows walk too.',
    params: [['speed', 'Walk speed', 20, 200, 5, 70, 'px/s up close']] },
};

const HEAD = (title, what) => `extends Node
## Kiln brain: ${title}. ${what}
## Sits on a "Brain" node under a Kiln actor (CharacterBody2D with juice.gd) and drives its parent.
## Change the numbers in Kiln's Workshop or in the Inspector; change the behaviour right here.
`;
// shared by the top-down brains: the walk animation for a direction (walk_up / walk_down when it has them)
const ANIM = `
func _walk_anim(v: Vector2) -> String:
\tif absf(v.y) > absf(v.x) and sprite.sprite_frames.has_animation("walk_up" if v.y < 0.0 else "walk_down"):
\t\treturn "walk_up" if v.y < 0.0 else "walk_down"
\treturn "run" if sprite.sprite_frames.has_animation("run") else "walk"

func _play(anim: String) -> void:
\tif sprite.sprite_frames.has_animation(anim) and sprite.animation != anim and sprite.animation != &"hurt":
\t\tsprite.play(anim)
`;
const TOUCH = `
# touching the player hurts it
func _touch() -> void:
\tfor i in actor.get_slide_collision_count():
\t\tvar other := actor.get_slide_collision(i).get_collider()
\t\tif other and other.is_in_group("player") and not actor.is_in_group("player") and other.has_method("hurt"):
\t\t\tother.hurt(actor.global_position)
`;

export const MORE_GD = {
  topdown: HEAD('player (top-down)', 'Twin-stick: move with WASD / left stick, shoot with the arrows / right stick\n## (or C / pad B toward where you face), attack X / pad X. Needs a projectile (Workshop → Projectiles) to shoot.') + `
@export var speed := 80.0       ## px/s
@export var fire_rate := 3.0    ## shots per second
@export var accel := 900.0      ## how fast it gets to speed (lower = slippery)

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var facing := Vector2.DOWN
var _cool := 0.0

func _ready() -> void:
\tKilnInput.ensure()
\tKilnInput.twin_stick()     # the arrow keys aim instead of move
\tactor.motion_mode = CharacterBody2D.MOTION_MODE_FLOATING   # seen from above: no floor, no gravity

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\tvar dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
\tactor.velocity = actor.velocity.move_toward(dir * speed, accel * delta)   # knockback fades into this
\tactor.move_and_slide()
\tfor i in actor.get_slide_collision_count():     # physics things get shoved
\t\tvar c := actor.get_slide_collision(i)
\t\tif c.get_collider() is RigidBody2D:
\t\t\tc.get_collider().apply_central_impulse(-c.get_normal() * 12.0)
\tif dir != Vector2.ZERO:
\t\tfacing = dir
\tvar aim := Input.get_vector("aim_left", "aim_right", "aim_up", "aim_down")
\tif aim == Vector2.ZERO and Input.is_action_pressed("shoot"):
\t\taim = facing
\t_cool -= delta
\tif aim != Vector2.ZERO and _cool <= 0.0 and actor.has_method("shoot"):
\t\tactor.shoot(aim.normalized())
\t\t_cool = 1.0 / fire_rate
\tvar look := aim if aim != Vector2.ZERO else dir
\tif absf(look.x) > 0.1:
\t\tsprite.flip_h = look.x < 0.0
\tif Input.is_action_just_pressed("attack") and sprite.sprite_frames.has_animation("attack"):
\t\tsprite.sprite_frames.set_animation_loop("attack", false)
\t\tsprite.play("attack")
\t\tactor.sfx("attack")
\tif sprite.animation == &"attack" and sprite.is_playing():
\t\treturn
\t_play(_walk_anim(dir) if dir != Vector2.ZERO else "idle")
` + ANIM,

  chaser: HEAD('chaser (top-down)', 'Wanders about; when the player comes within sight it runs at it. Hurts on touch.') + `
@export var speed := 40.0    ## px/s
@export var sight := 150.0   ## px

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var _wander := Vector2.ZERO
var _t := 0.0

func _ready() -> void:
\tactor.motion_mode = CharacterBody2D.MOTION_MODE_FLOATING

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\tvar want := Vector2.ZERO
\tvar player := get_tree().get_first_node_in_group("player") as Node2D
\tif player and player.global_position.distance_to(actor.global_position) < sight:
\t\twant = actor.global_position.direction_to(player.global_position) * speed
\telse:
\t\t_t -= delta
\t\tif _t <= 0.0:              # a new idea every second or two: stroll somewhere, or stand
\t\t\t_t = randf_range(1.0, 2.5)
\t\t\t_wander = Vector2.from_angle(randf() * TAU) * speed * 0.4 if randf() < 0.6 else Vector2.ZERO
\t\twant = _wander
\tactor.velocity = actor.velocity.move_toward(want, speed * 6.0 * delta)
\tactor.move_and_slide()
\tif actor.is_on_wall():
\t\t_wander = -_wander
\tif absf(actor.velocity.x) > 1.0:
\t\tsprite.flip_h = actor.velocity.x < 0.0
\t_play(_walk_anim(actor.velocity) if actor.velocity.length() > 2.0 else "idle")
\t_touch()
` + ANIM + TOUCH,

  turret: HEAD('turret (top-down boss)', 'Drifts toward the player and fires its projectile at it, a fan of shots at a time.\n## Needs a projectile (Workshop → Projectiles). Hurts on touch.') + `
@export var speed := 15.0       ## px/s; 0 stays put
@export var fire_every := 1.4   ## seconds between volleys
@export var shots := 3.0        ## per volley, in a fan
@export var sight := 220.0      ## px

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var _cool := 1.0

func _ready() -> void:
\tactor.motion_mode = CharacterBody2D.MOTION_MODE_FLOATING

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\tvar player := get_tree().get_first_node_in_group("player") as Node2D
\tvar near := player != null and player.global_position.distance_to(actor.global_position) < sight
\tvar to := actor.global_position.direction_to(player.global_position) if near else Vector2.ZERO
\tactor.velocity = actor.velocity.move_toward(to * speed, 300.0 * delta)
\tactor.move_and_slide()
\tif near:
\t\tsprite.flip_h = to.x < 0.0
\t\t_cool -= delta
\t\tif _cool <= 0.0 and actor.has_method("shoot"):
\t\t\t_cool = fire_every
\t\t\tfor i in int(shots):           # a fan: 15° between shots, centred on the player
\t\t\t\tactor.shoot(to.rotated(deg_to_rad((i - (shots - 1) / 2.0) * 15.0)))
\t\t\tif sprite.sprite_frames.has_animation("attack"):
\t\t\t\tsprite.sprite_frames.set_animation_loop("attack", false)
\t\t\t\tsprite.play("attack")
\tif not (sprite.animation == &"attack" and sprite.is_playing()):
\t\t_play(_walk_anim(actor.velocity) if actor.velocity.length() > 2.0 else "idle")
\t_touch()
` + ANIM + TOUCH,

  runner: HEAD('runner (endless)', 'Runs right by itself and speeds up; jump with Space / a click / pad A (hold for higher).\n## Falling below the level ends the run (the actor dies, so the level starts again).') + `
@export var speed := 140.0       ## px/s at the start
@export var speed_up := 3.0      ## px/s faster every second
@export var jump_height := 60.0  ## px

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var gravity := 1400.0
var _run := 0.0

func _ready() -> void:
\tKilnInput.ensure()

func _physics_process(delta: float) -> void:
\tif actor.get("dead"):
\t\treturn
\t_run += delta
\tactor.velocity.x = speed + speed_up * _run
\tactor.velocity.y += gravity * delta
\tvar jump := Input.is_action_just_pressed("jump") or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
\tif jump and actor.is_on_floor():
\t\tactor.velocity.y = -sqrt(2.0 * gravity * jump_height)
\t\tif actor.has_method("sfx"):
\t\t\tactor.sfx("jump")
\tif Input.is_action_just_released("jump") and actor.velocity.y < 0.0:
\t\tactor.velocity.y *= 0.5
\tactor.move_and_slide()
\tif actor.global_position.y > actor.get_viewport_rect().size.y * 2.0 and actor.has_method("die"):
\t\tactor.die()
\tvar anim := "run" if actor.is_on_floor() else ("jump" if actor.velocity.y < 0.0 else "fall")
\tif not sprite.sprite_frames.has_animation(anim):
\t\tanim = "walk" if sprite.sprite_frames.has_animation("walk") else "idle"
\tif sprite.animation != anim:
\t\tsprite.play(anim)
`,

  walker: HEAD('walker (point & click)', 'Walks where it is told (walk_to, called by the adventure runtime when you click),\n## around the room\'s walk area (its NavigationRegion2D), and gets smaller further away (the room\'s depth scale).\n## The stick or the arrow keys walk it too.') + `
@export var speed := 70.0   ## px/s at full size (it walks slower when it is smaller, further away)
signal arrived              ## reached the end of a walk_to()

@onready var actor: CharacterBody2D = get_parent()
@onready var sprite: AnimatedSprite2D = actor.get_node("Sprite")
var path := PackedVector2Array()
var _then := Callable()

func _ready() -> void:
\tKilnInput.ensure()

## Walk to a point along the walk area, then call then() (if given).
func walk_to(point: Vector2, then := Callable()) -> void:
\tvar room := _room()
\tpath = NavigationServer2D.map_get_path(_map(), actor.global_position, point, true) if room and room.has_walk() else PackedVector2Array([point])
\tif path.size() and path[0].distance_to(actor.global_position) < 1.0:
\t\tpath.remove_at(0)
\t_then = then
\tif path.is_empty():
\t\t_arrive()

## Stop walking (a new click, a conversation).
func stop() -> void:
\tpath = PackedVector2Array()
\t_then = Callable()

func _physics_process(delta: float) -> void:
\tvar room := _room()
\tvar k: float = room.scale_at(actor.global_position.y) if room else 1.0
\tvar step := speed * k * delta
\tvar dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
\tvar moved := Vector2.ZERO
\tif dir != Vector2.ZERO:                  # stick / keys: straight, kept inside the walk area
\t\tstop()
\t\tvar to := actor.global_position + dir * step
\t\tif room and room.has_walk():
\t\t\tto = NavigationServer2D.map_get_closest_point(_map(), to)
\t\tmoved = to - actor.global_position
\t\tactor.global_position = to
\telif path.size():
\t\tvar to := actor.global_position.move_toward(path[0], step)
\t\tmoved = to - actor.global_position
\t\tactor.global_position = to
\t\tif to.distance_to(path[0]) < 0.5:
\t\t\tpath.remove_at(0)
\t\t\tif path.is_empty():
\t\t\t\t_arrive()
\tactor.scale = Vector2(k, k)
\tif absf(moved.x) > 0.05:
\t\tsprite.flip_h = moved.x < 0.0
\tif moved.length() > 0.01:
\t\tvar up := moved.y < 0.0 and absf(moved.y) > absf(moved.x)
\t\tvar down := moved.y > 0.0 and absf(moved.y) > absf(moved.x)
\t\t_play("walk_up" if up and _has("walk_up") else "walk_down" if down and _has("walk_down") else "walk")
\telif not (actor.has_node("LipSync") and actor.get_node("LipSync").talking()):
\t\t_play("idle")

## Turn to face a point (a hotspot being looked at).
func face(point: Vector2) -> void:
\tif absf(point.x - actor.global_position.x) > 2.0:
\t\tsprite.flip_h = point.x < actor.global_position.x

func _arrive() -> void:
\tvar f := _then
\t_then = Callable()
\tarrived.emit()
\tif f.is_valid():
\t\tf.call()

func _room() -> Node:
\treturn get_tree().get_first_node_in_group("kiln_room")

func _map() -> RID:
\treturn actor.get_world_2d().navigation_map

func _has(anim: String) -> bool:
\treturn sprite.sprite_frames.has_animation(anim)

func _play(anim: String) -> void:
\tif _has(anim) and sprite.animation != anim:
\t\tsprite.play(anim)
`,
};
