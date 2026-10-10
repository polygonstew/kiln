@tool
extends VBoxContainer
## Kiln dock: talks to the Kiln server over HTTP (it runs on this machine or your LAN).
## Settings live in Project Settings → kiln/: server_url, assets_dir.

const KINDS := [["Actors", "sprites"], ["Scenes", "backgrounds"], ["Levels", "levels"], ["HUDs", "hud"]]

var editor: EditorInterface
var undo: EditorUndoRedoManager
var http: HTTPRequest
var status: Label
var url_edit: LineEdit
var tree: Tree
var _pending := ""

func _ready() -> void:
	_setting("kiln/server_url", "http://127.0.0.1:8510")
	_setting("kiln/assets_dir", "res://assets")
	add_theme_constant_override("separation", 6)
	status = Label.new(); status.text = "Kiln: not checked yet"; status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(status)
	url_edit = LineEdit.new(); url_edit.text = ProjectSettings.get_setting("kiln/server_url"); url_edit.tooltip_text = "Where Kiln runs"
	url_edit.text_submitted.connect(func(t): ProjectSettings.set_setting("kiln/server_url", t); ProjectSettings.save(); _check())
	add_child(url_edit)
	var row := HBoxContainer.new(); add_child(row)
	_btn(row, "Check", "Is Kiln running, and where does it save?", _check)
	_btn(row, "Open Kiln", "Open Kiln in your browser", func(): OS.shell_open(_url()))
	_btn(row, "Link here", "Make Kiln save straight into this project (kiln/assets_dir)", _link)
	_btn(row, "Rescan", "Pick up files Kiln just saved", func(): editor.get_resource_filesystem().scan(); _list())
	tree = Tree.new(); tree.hide_root = true; tree.size_flags_vertical = Control.SIZE_EXPAND_FILL; tree.custom_minimum_size = Vector2(0, 260)
	tree.columns = 2; tree.set_column_expand(1, false); tree.set_column_custom_minimum_width(1, 60)
	tree.button_clicked.connect(_on_add)
	tree.item_activated.connect(func(): var it := tree.get_selected(); if it and it.get_metadata(0): editor.open_scene_from_path(it.get_metadata(0)))
	add_child(tree)
	var hint := Label.new(); hint.text = "Double-click opens a scene; + adds it to the open scene."; hint.modulate = Color(1, 1, 1, 0.6); hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(hint)
	http = HTTPRequest.new(); add_child(http)
	http.request_completed.connect(_on_reply)
	_list()
	_check()

func _setting(key: String, value) -> void:
	if not ProjectSettings.has_setting(key):
		ProjectSettings.set_setting(key, value)
		ProjectSettings.set_initial_value(key, value)

func _btn(parent: Node, text: String, tip: String, fn: Callable) -> void:
	var b := Button.new(); b.text = text; b.tooltip_text = tip; b.pressed.connect(fn); parent.add_child(b)

func _url() -> String:
	return str(ProjectSettings.get_setting("kiln/server_url")).trim_suffix("/")

func _assets() -> String:
	return str(ProjectSettings.get_setting("kiln/assets_dir")).trim_suffix("/")

# ---------------------------------------------------------------- talking to Kiln
func _check() -> void:
	_pending = "settings"
	http.cancel_request()
	if http.request(_url() + "/api/settings") != OK:
		status.text = "Kiln: can't reach " + _url()

func _link() -> void:
	var path := ProjectSettings.globalize_path(_assets())
	DirAccess.make_dir_recursive_absolute(path)
	_pending = "link"
	http.cancel_request()
	http.request(_url() + "/api/fs", ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify({"op": "root", "path": path, "scaffold": true}))

func _on_reply(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code >= 400:
		status.text = "Kiln: not answering at %s (is the kiln service running?)" % _url()
		return
	var data = JSON.parse_string(body.get_string_from_utf8())
	if _pending == "link":
		status.text = "Kiln now saves into " + _assets() + ". Save something in Kiln, then Rescan."
		editor.get_resource_filesystem().scan()
		return
	var root := str(data.get("root", "")) if data is Dictionary else ""
	var here := ProjectSettings.globalize_path(_assets())
	if root.begins_with(here.trim_suffix("/")):
		status.text = "Kiln connected: it saves into this project (%s)." % _assets()
	else:
		status.text = "Kiln connected, but it saves into %s, not this project. Press Link here." % root
	print("Kiln: ", status.text)

# ---------------------------------------------------------------- what Kiln has made
func _list() -> void:
	tree.clear()
	var top := tree.create_item()
	for k in KINDS:
		var group := tree.create_item(top); group.set_text(0, k[0]); group.set_selectable(0, false)
		var dir := DirAccess.open(_assets() + "/" + k[1])
		var n := 0
		if dir:
			for name in dir.get_directories():
				var scene := "%s/%s/%s/%s.tscn" % [_assets(), k[1], name, name]
				if not FileAccess.file_exists(scene):
					continue
				var it := tree.create_item(group); it.set_text(0, name); it.set_metadata(0, scene); it.set_tooltip_text(0, scene)
				it.add_button(1, get_theme_icon("Add", "EditorIcons"), 0, false, "Add to the open scene")
				n += 1
		if n == 0:
			var none := tree.create_item(group); none.set_text(0, "(none saved yet)"); none.set_selectable(0, false); none.set_custom_color(0, Color(1, 1, 1, 0.4))

func _on_add(item: TreeItem, _col: int, _id: int, _button: int) -> void:
	var path = item.get_metadata(0)
	var root := editor.get_edited_scene_root()
	if path == null or root == null:
		status.text = "Open a scene first, then add."
		return
	var node: Node = load(path).instantiate()
	node.name = item.get_text(0)
	undo.create_action("Add Kiln " + item.get_text(0))
	undo.add_do_method(root, "add_child", node, true)
	undo.add_do_method(node, "set_owner", root)
	undo.add_do_reference(node)
	undo.add_undo_method(root, "remove_child", node)
	undo.commit_action()
	status.text = "Added %s to %s." % [item.get_text(0), root.name]
