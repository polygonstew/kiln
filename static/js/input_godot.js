// The game's controls: named actions, each on the keyboard and on a gamepad, in one small runtime script
// (_kiln/game/input.gd, class KilnInput). KilnInput.ensure() adds the actions a project doesn't have yet, so a Kiln
// game plays with keys or a pad out of the box; whatever is set in Godot's Input Map wins. Brains, menus, the HUD,
// the dialogue runner and Logic graphs all use these names. ACTIONS (here) is what Kiln's pickers offer.

// [action, what it does, keys, pad] for pickers and docs (the GDScript below is the real mapping)
export const ACTIONS = [
  ['move_left', 'Move left', '← / A', 'left stick, D-pad'], ['move_right', 'Move right', '→ / D', 'left stick, D-pad'],
  ['move_up', 'Up (climb, menus)', '↑ / W', 'left stick, D-pad'], ['move_down', 'Down (crouch, climb)', '↓ / S', 'left stick, D-pad'],
  ['jump', 'Jump', 'Space / Z', 'A'], ['attack', 'Attack', 'X / J', 'X'], ['shoot', 'Shoot', 'C / K', 'B'],
  ['interact', 'Interact (talk, open)', 'E', 'Y'], ['pause', 'Pause', 'Esc / P', 'Start'], ['inventory', 'Inventory', 'I / Tab', 'Back'],
];

export const INPUT_GD = `class_name KilnInput
extends RefCounted
## Kiln input: the game's actions, each on the keyboard and on a gamepad (Xbox names; any pad works).
## KilnInput.ensure() adds the ones the project doesn't have yet; set them in Project → Project Settings → Input Map
## to change them (yours win). Brains, menus, the HUD, dialogue and Logic graphs use these names.
##   move_left / move_right / move_up / move_down   arrows or WASD · left stick or D-pad
##   jump       Space, Z    · A          attack    X, J   · X          shoot   C, K · B
##   interact   E           · Y          pause     Esc, P · Start      inventory   I, Tab · Back

static func ensure() -> void:
\tvar actions := {
\t\t"move_left": [key(KEY_LEFT), key(KEY_A), pad(JOY_BUTTON_DPAD_LEFT), stick(JOY_AXIS_LEFT_X, -1.0)],
\t\t"move_right": [key(KEY_RIGHT), key(KEY_D), pad(JOY_BUTTON_DPAD_RIGHT), stick(JOY_AXIS_LEFT_X, 1.0)],
\t\t"move_up": [key(KEY_UP), key(KEY_W), pad(JOY_BUTTON_DPAD_UP), stick(JOY_AXIS_LEFT_Y, -1.0)],
\t\t"move_down": [key(KEY_DOWN), key(KEY_S), pad(JOY_BUTTON_DPAD_DOWN), stick(JOY_AXIS_LEFT_Y, 1.0)],
\t\t"jump": [key(KEY_SPACE), key(KEY_Z), pad(JOY_BUTTON_A)],
\t\t"attack": [key(KEY_X), key(KEY_J), pad(JOY_BUTTON_X)],
\t\t"shoot": [key(KEY_C), key(KEY_K), pad(JOY_BUTTON_B)],
\t\t"interact": [key(KEY_E), pad(JOY_BUTTON_Y)],
\t\t"pause": [key(KEY_ESCAPE), key(KEY_P), pad(JOY_BUTTON_START)],
\t\t"inventory": [key(KEY_I), key(KEY_TAB), pad(JOY_BUTTON_BACK)],
\t}
\tfor action in actions:
\t\tif InputMap.has_action(action):
\t\t\tcontinue
\t\tInputMap.add_action(action, 0.35)          # 0.35: how far a stick must tilt to count
\t\tfor event in actions[action]:
\t\t\tInputMap.action_add_event(action, event)

static func key(code: Key) -> InputEvent:
\tvar e := InputEventKey.new()
\te.physical_keycode = code
\treturn e

static func pad(button: JoyButton) -> InputEvent:
\tvar e := InputEventJoypadButton.new()
\te.button_index = button
\treturn e

static func stick(axis: JoyAxis, direction: float) -> InputEvent:
\tvar e := InputEventJoypadMotion.new()
\te.axis = axis
\te.axis_value = direction
\treturn e
`;
