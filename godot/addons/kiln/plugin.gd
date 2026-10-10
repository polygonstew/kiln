@tool
extends EditorPlugin
## Adds the Kiln dock (top right, next to Scene/Import).

var dock: Control

func _enter_tree() -> void:
	dock = preload("kiln_dock.gd").new()
	dock.name = "Kiln"
	dock.editor = get_editor_interface()
	dock.undo = get_undo_redo()
	add_control_to_dock(DOCK_SLOT_RIGHT_UL, dock)

func _exit_tree() -> void:
	if dock:
		remove_control_from_docks(dock)
		dock.queue_free()
