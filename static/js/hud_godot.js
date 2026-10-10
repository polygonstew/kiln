// HUD → Godot 4: a CanvasLayer scene built from real Control nodes (TextureProgressBar, NinePatchRect, Label…)
// plus hud.gd, the script your game calls: set_value("health", 0.5), set_number("score", 120), say("Monk", "…"),
// prompt("E", "Open"), toggle_inventory(), add_item("key"). Everything is positioned in game pixels.

const nodeName = s => (String(s || 'w').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'w');
const col = hex => { const n = parseInt(String(hex || '#ffffff').slice(1), 16); return `Color(${((n >> 16 & 255) / 255).toFixed(3)}, ${((n >> 8 & 255) / 255).toFixed(3)}, ${((n & 255) / 255).toFixed(3)}, 1)`; };

/* T: helpers from hud.js {render, sizeOf, invGeom, nine(w, style, fill, edge, edge2, corner) → ImageData, toDataURL, FONTS, diff(a, b)}
   Returns {files: [{name, b64|text}], fonts: [font keys used]} for hud/<name>/. res = res path of that folder, base = asset root res path. */
export function buildGodotHud(HUD, T, res, base) {
  const files = [], ext = [], subs = [], nodes = [], fonts = new Set(), items = [], seen = new Set();
  let nid = 0;
  const J = p => (base ? base + '/' : '') + p;          // a path under the asset root (relative when not inside Godot)
  const addExt = (type, path) => { const id = `e${++nid}`; ext.push(`[ext_resource type="${type}" path="${path}" id="${id}"]`); return id; };
  const addSub = (type, body) => { const id = `s${++nid}`; subs.push(`[sub_resource type="${type}" id="${id}"]\n${body}`); return id; };
  const png = (name, im) => { files.push({ name, b64: T.toDataURL(im) }); return addExt('Texture2D', `${res}/${name}`); };
  const fontRef = {}; const font = key => { fonts.add(key); return fontRef[key] ||= addExt('FontFile', J(`fonts/kiln_${key}_white.fnt`)); };
  const label = (name, parent, x, y, text, fontKey, color, extra = '') =>
    `[node name="${name}" type="Label" parent="${parent}"]\noffset_left = ${x}\noffset_top = ${y}\ntheme_override_colors/font_color = ${col(color)}\ntheme_override_colors/font_shadow_color = Color(0, 0, 0, 0.8)\ntheme_override_constants/shadow_offset_x = 1\ntheme_override_constants/shadow_offset_y = 1\ntheme_override_fonts/font = ExtResource("${font(fontKey)}")\ntheme_override_font_sizes/font_size = ${T.FONTS[fontKey].h}\ntext = ${JSON.stringify(text)}\n${extra}`;
  const nine = (name, parent, x, y, w, hh, tex, m) =>
    `[node name="${name}" type="NinePatchRect" parent="${parent}"]\noffset_left = ${x}\noffset_top = ${y}\noffset_right = ${x + w}\noffset_bottom = ${y + hh}\ntexture = ExtResource("${tex}")\npatch_margin_left = ${m}\npatch_margin_top = ${m}\npatch_margin_right = ${m}\npatch_margin_bottom = ${m}\n`;
  const rect = (name, parent, x, y, tex, extra = '') => `[node name="${name}" type="TextureRect" parent="${parent}"]\noffset_left = ${x}\noffset_top = ${y}\ntexture = ${tex.startsWith('S') ? `SubResource("${tex.slice(1)}")` : `ExtResource("${tex}")`}\nstretch_mode = 2\n${extra}`;

  for (const w of HUD.widgets) {
    let n = nodeName(w.name); while (seen.has(n)) n += '_'; seen.add(n);
    const P = `Screen`, X = w.x - 1, Y = w.y - 1, sz = T.sizeOf(w), vis = w.hidden ? 'visible = false\n' : '';
    if (w.type === 'bar') {
      const under = png(`${n}_frame.png`, T.render(w, 0, 'frame')), prog = png(`${n}_fill.png`, T.render({ ...w, back: null, edge: null, frame: 'none' }, 1, 'fill'));
      nodes.push(`[node name="${n}" type="TextureProgressBar" parent="${P}"]\n${vis}offset_left = ${X}\noffset_top = ${Y}\nmax_value = 1.0\nstep = 0.001\nvalue = ${w.value}\ntexture_under = ExtResource("${under}")\ntexture_progress = ExtResource("${prog}")\nmetadata/kiln = "bar"\n`);
      if (w.label) nodes.push(label('Label', `${P}/${n}`, 3, Math.max(0, Math.floor((w.h - T.FONTS[w.font].h) / 2)), w.label, w.font, w.edge));
    } else if (w.type === 'gauge') {
      const empty = T.render(w, 0), full = T.render(w, 1);
      const under = png(`${n}_track.png`, empty), prog = png(`${n}_arc.png`, T.diff(full, empty));
      const lift = w.label ? -4 : 0;
      nodes.push(`[node name="${n}" type="TextureProgressBar" parent="${P}"]\n${vis}offset_left = ${X}\noffset_top = ${Y}\nmax_value = 1.0\nstep = 0.001\nvalue = ${w.value}\nfill_mode = 4\nradial_initial_angle = ${(w.start + 90) % 360}.0\nradial_fill_degrees = ${w.end - w.start}.0\nradial_center_offset = Vector2(0, ${lift})\ntexture_under = ExtResource("${under}")\ntexture_progress = ExtResource("${prog}")\nmetadata/kiln = "gauge"\n`);
    } else if (w.type === 'pips') {
      const one = v => T.render({ ...w, count: 1 }, v), icons = [one(1), one(.5), one(0)], iw = icons[0].width;
      const strip = T.strip(icons), tex = png(`${n}_icons.png`, strip), step = 9 * w.scale + w.gap;
      nodes.push(`[node name="${n}" type="Control" parent="${P}"]\n${vis}offset_left = ${X}\noffset_top = ${Y}\nmetadata/kiln = "pips"\nmetadata/count = ${w.count}\nmetadata/halves = ${!!w.halves}\nmetadata/icon_w = ${iw}\nmetadata/value = ${w.value}\n`);
      const atlas = addSub('AtlasTexture', `atlas = ExtResource("${tex}")\nregion = Rect2(0, 0, ${iw}, ${icons[0].height})`);
      for (let i = 0; i < w.count; i++) nodes.push(rect(`Pip${i}`, `${P}/${n}`, i * step, 0, 'S' + atlas));
    } else if (w.type === 'counter') {
      nodes.push(label(n, P, X + 1, Y + 1, w.prefix + String(Math.round(w.num)).padStart(w.digits, '0'), w.font, w.color, `${vis}metadata/kiln = "counter"\nmetadata/prefix = ${JSON.stringify(w.prefix)}\nmetadata/digits = ${w.digits}\n`));
    } else if (w.type === 'text') {
      nodes.push(label(n, P, X + 1, Y + 1, w.text, w.font, w.color, vis));
    } else if (w.type === 'panel' || w.type === 'slot' || w.type === 'portrait') {
      const c = Math.max(3, w.corner || 3), W = w.type === 'panel' ? w.w : w.size, H = w.type === 'panel' ? w.h : w.size;
      const tex = png(`${n}_9slice.png`, T.nine(w.style, w.fill, w.edge, w.edge2, c));
      nodes.push(nine(n, P, X + 1, Y + 1 + (w.type === 'panel' ? 4 : 0), W, H, tex, c + 1).replace('\n', '\n' + vis));
      if (w.type === 'slot') {
        nodes.push(`[node name="Item" type="TextureRect" parent="${P}/${n}"]\noffset_left = 2\noffset_top = 2\noffset_right = ${W - 2}\noffset_bottom = ${H - 2}\nexpand_mode = 1\nstretch_mode = 5\n`);
        nodes.push(label('Count', `${P}/${n}`, W - 8, H - 8, w.count ? String(w.count) : '', 'tiny', w.edge));
      }
      if (w.type === 'portrait' && w.faces && T.facesMeta.get(w.faces)) {
        // status faces: an AtlasTexture over faces.png; hud.gd set_health() moves the region
        const fm = T.facesMeta.get(w.faces), atlas = addSub('AtlasTexture', `atlas = ExtResource("${addExt('Texture2D', J(w.faces.split('/').slice(-2).join('/') + '/faces.png'))}")\nregion = Rect2(0, 0, ${fm.size}, ${fm.size})`);
        nodes.push(`[node name="Face" type="TextureRect" parent="${P}/${n}"]\noffset_left = 3\noffset_top = 3\noffset_right = ${W - 3}\noffset_bottom = ${H - 3}\nexpand_mode = 1\nstretch_mode = 5\ntexture = SubResource("${atlas}")\nmetadata/faces = ${JSON.stringify(fm.faces).replace(/^\[/, 'PackedStringArray(').replace(/\]$/, ')')}\nmetadata/face_size = ${fm.size}\n`);
      } else if (w.type === 'portrait') nodes.push(`[node name="Face" type="TextureRect" parent="${P}/${n}"]\noffset_left = 3\noffset_top = 3\noffset_right = ${W - 3}\noffset_bottom = ${H - 3}\nexpand_mode = 1\nstretch_mode = 6\n${w.img ? `texture = ExtResource("${addExt('Texture2D', J(w.img.split('/').slice(-3).join('/')))}")\n` : ''}`);
    } else if (w.type === 'inventory') {
      const G = T.invGeom(w), frame = png(`${n}_frame.png`, T.nine(w.style, w.fill, w.edge, w.edge2, 4)), slot = png(`${n}_slot.png`, T.nine(w.slotStyle, w.slotFill, w.edge2, w.edge2, 2));
      const cur = png(`${n}_cursor.png`, T.cursor(w.size, w.cursor)), det = png(`${n}_details.png`, T.nine('line', w.detFill, w.edge2, null, 2));
      // the inventory starts hidden in the game: toggle_inventory() (or an input action named "inventory") opens it
      nodes.push(nine(n, P, X + 1, Y + 1, G.W, G.H, frame, 5) + `visible = false\nmetadata/kiln = "inventory"\nmetadata/cols = ${w.cols}\nmetadata/rows = ${w.rows}\nmetadata/size = ${w.size}\nmetadata/gap = ${w.gap}\n`);
      if (w.title) nodes.push(label('Title', `${P}/${n}`, w.pad, w.pad - 1, w.title, 'small', w.text));
      for (let i = 0; i < w.cols * w.rows; i++) {
        const s = G.slot(i);
        nodes.push(nine(`Slot${i}`, `${P}/${n}`, s.x, s.y, w.size, w.size, slot, 3));
        nodes.push(`[node name="Icon" type="TextureRect" parent="${P}/${n}/Slot${i}"]\noffset_left = 2\noffset_top = 2\noffset_right = ${w.size - 2}\noffset_bottom = ${w.size - 2}\nexpand_mode = 1\nstretch_mode = 5\n`);
        nodes.push(label('Count', `${P}/${n}/Slot${i}`, w.size - 9, w.size - 8, '', 'tiny', w.text));
      }
      nodes.push(rect('Cursor', `${P}/${n}`, G.slot(0).x - 1, G.slot(0).y - 1, cur));
      if (w.details) {
        const y0 = w.pad + G.tH + G.gH + w.pad;
        nodes.push(nine('Details', `${P}/${n}`, w.pad, y0, G.gW, G.dH, det, 3));
        nodes.push(label('Name', `${P}/${n}/Details`, 4, 2, '', 'small', w.cursor));
        nodes.push(label('Desc', `${P}/${n}/Details`, 4, 4 + T.FONTS.small.h, '', 'tiny', w.text, `offset_right = ${G.gW - 4}\nautowrap_mode = 2\n`));
      }
      for (const it of w.items || []) items.push({ id: it.id, name: it.name, desc: it.desc, count: it.count, icon: it.icon ? J(it.icon.split('/').slice(-3).join('/')) : '' });
    } else if (w.type === 'dialogue') {
      const ps = w.h - 10, frame = png(`${n}_frame.png`, T.nine(w.style, w.fill, w.edge, w.edge2, 4)), ff = png(`${n}_faceframe.png`, T.nine('line', w.detFill, w.edge2, null, 2));
      nodes.push(nine(n, P, X + 1, Y + 1, w.w, w.h, frame, 5) + `visible = false\nmetadata/kiln = "dialogue"\n`);
      nodes.push(nine('FaceFrame', `${P}/${n}`, 4, 4, ps, ps, ff, 3));
      nodes.push(`[node name="Face" type="TextureRect" parent="${P}/${n}/FaceFrame"]\noffset_left = 2\noffset_top = 2\noffset_right = ${ps - 2}\noffset_bottom = ${ps - 2}\nexpand_mode = 1\nstretch_mode = 6\n${w.img ? `texture = ExtResource("${addExt('Texture2D', J(w.img.split('/').slice(-3).join('/')))}")\n` : ''}`);
      nodes.push(label('Speaker', `${P}/${n}`, ps + 11, 4, w.speaker, w.font, w.nameColor));
      nodes.push(label('Line', `${P}/${n}`, ps + 11, 7 + T.FONTS[w.font].h, w.text, w.font, w.color, `offset_right = ${w.w - 8}\noffset_bottom = ${w.h - 4}\nautowrap_mode = 2\nvisible_characters = 0\n`));
    } else if (w.type === 'prompt') {
      const k = T.measure(w.key || ' ', w.font), kw = k.w + 6, kh = k.h + 5, cap = png(`${n}_key.png`, T.nine('bevel', w.fill, w.edge, null, 2));
      nodes.push(`[node name="${n}" type="Control" parent="${P}"]\noffset_left = ${X + 1}\noffset_top = ${Y + 1}\nvisible = false\nmetadata/kiln = "prompt"\n`);
      nodes.push(nine('Key', `${P}/${n}`, 0, 0, kw, kh, cap, 3));
      nodes.push(label('Letter', `${P}/${n}/Key`, 3, 1, w.key, w.font, w.keyColor));
      nodes.push(label('Action', `${P}/${n}`, kw + 4, Math.floor((kh - T.FONTS[w.font].h) / 2), w.text, w.font, w.color));
    }
  }
  const script = addExt('Script', `${res}/hud.gd`);
  const tscn = `[gd_scene load_steps=${ext.length + subs.length + 1} format=3]\n\n${ext.join('\n')}\n\n${subs.join('\n\n')}${subs.length ? '\n\n' : ''}`
    + `[node name="${nodeName(HUD.name)}" type="CanvasLayer"]\nscript = ExtResource("${script}")\nitems_json = "${res}/items.json"\n\n`
    + `[node name="Screen" type="Control" parent="."]\nlayout_mode = 3\noffset_right = ${HUD.view.w}\noffset_bottom = ${HUD.view.h}\nmouse_filter = 2\n\n` + nodes.join('\n');
  files.push({ name: `${HUD.name}.tscn`, text: tscn }, { name: 'hud.gd', text: HUD_GD }, { name: 'items.json', text: JSON.stringify(items, null, 1) + '\n' });
  return { files, fonts: [...fonts] };
}

const HUD_GD = `extends CanvasLayer
## Kiln HUD. Call these from your game:
##   set_value("health", 0.5)      bars, gauges, pips (0..1)
##   set_number("score", 120)      counters      set_text("title", "…")
##   say("Monk", "The bells…")      dialogue box (types out; ui_accept skips / closes; emits dialogue_finished)
##   prompt("E", "Open") / hide_prompt()
##   toggle_inventory(), add_item("key"), remove_item("flask"), has_item("key")
## The inventory opens with an input action named "inventory" if your project has one; arrows move, ui_cancel closes.

signal dialogue_finished
signal item_used(id: String)

@export_file("*.json") var items_json := ""
@export var chars_per_second := 40.0

var item_db := {}          # id -> {name, desc, icon, count}
var bag: Array = []         # [{id, count}] in slot order
var _sel := 0
var _typing := false

func _ready() -> void:
	add_to_group("kiln_hud")      # Kiln zones (message) find the HUD through this group
	for n in _all(self):
		if n.get_meta("kiln", "") == "pips":
			for p in n.get_children():
				p.texture = p.texture.duplicate()     # each pip shows its own state
			set_value(n.name, float(n.get_meta("value", 1.0)))
	if items_json != "" and FileAccess.file_exists(items_json):
		var data = JSON.parse_string(FileAccess.get_file_as_string(items_json))
		if data is Array:
			for it in data:
				item_db[it.id] = it
				if int(it.get("count", 0)) > 0:
					bag.append({"id": it.id, "count": int(it.count)})
	_refresh_inventory()

func _all(n: Node) -> Array:
	var out := [n]
	for c in n.get_children():
		out.append_array(_all(c))
	return out

func _w(widget: String) -> Node:
	return get_node_or_null("Screen/" + widget)

func set_value(widget: String, v: float) -> void:
	var n := _w(widget)
	if n == null:
		return
	v = clampf(v, 0.0, 1.0)
	if n is TextureProgressBar:
		n.value = v
	elif n.get_meta("kiln", "") == "pips":
		var count := int(n.get_meta("count")); var iw := int(n.get_meta("icon_w")); var filled := v * count
		for i in count:
			var f := clampf(filled - i, 0.0, 1.0)
			var state := 0 if f >= 1.0 else (1 if f >= 0.5 and n.get_meta("halves") else 2)
			var pip: TextureRect = n.get_child(i)
			pip.texture.region.position.x = state * iw

## Health for the whole HUD: the "health" bar (if any) and every status-face portrait (healthy → hurt → … → dead).
func set_health(v: float) -> void:
	set_value("health", v)
	_health = clampf(v, 0.0, 1.0)
	if _face_override == "":
		_show_faces(_face_for_health())

## Show one face for a while (e.g. "grin" after a kill), then back to the health face.
func show_face(face: String, seconds := 1.2) -> void:
	_face_override = face
	_show_faces(face)
	await get_tree().create_timer(seconds).timeout
	_face_override = ""
	_show_faces(_face_for_health())

var _health := 1.0
var _face_override := ""

func _face_for_health() -> String:
	var want := "dead" if _health <= 0.0 else ("near" if _health < 0.25 else ("badly" if _health < 0.5 else ("hurt" if _health < 0.75 else "healthy")))
	return want

func _show_faces(want: String) -> void:
	var order := ["dead", "near", "badly", "hurt", "healthy"]
	for n in _all(self):
		if n is TextureRect and n.has_meta("faces"):
			var faces: PackedStringArray = n.get_meta("faces")
			var pick := want
			if not faces.has(pick) and order.has(pick):
				for i in range(order.find(pick), order.size()):
					if faces.has(order[i]):
						pick = order[i]
						break
			var idx := faces.find(pick)
			if idx >= 0:
				n.texture.region.position.x = idx * int(n.get_meta("face_size"))

func set_number(widget: String, value: int) -> void:
	var n := _w(widget)
	if n is Label:
		n.text = str(n.get_meta("prefix", "")) + str(value).pad_zeros(int(n.get_meta("digits", 1)))

func set_text(widget: String, text: String) -> void:
	var n := _w(widget)
	if n is Label:
		n.text = text

# ---------------------------------------------------------------- dialogue
func _dialogue() -> Node:
	for n in _all(self):
		if n.get_meta("kiln", "") == "dialogue":
			return n
	return null

func say(speaker: String, text: String, face: Texture2D = null) -> void:
	var d := _dialogue()
	if d == null:
		return
	d.get_node("Speaker").text = speaker
	var line: Label = d.get_node("Line")
	line.text = text
	line.visible_characters = 0
	if face:
		d.get_node("FaceFrame/Face").texture = face
	d.visible = true
	_typing = true

func _process(delta: float) -> void:
	if _typing:
		var line: Label = _dialogue().get_node("Line")
		line.visible_characters += max(1, int(chars_per_second * delta))
		if line.visible_characters >= line.text.length():
			line.visible_characters = -1
			_typing = false

# ---------------------------------------------------------------- prompt
func prompt(key: String, action: String) -> void:
	for n in _all(self):
		if n.get_meta("kiln", "") == "prompt":
			n.get_node("Key/Letter").text = key
			n.get_node("Action").text = action
			n.visible = true

func hide_prompt() -> void:
	for n in _all(self):
		if n.get_meta("kiln", "") == "prompt":
			n.visible = false

# ---------------------------------------------------------------- inventory
func _inv() -> Node:
	for n in _all(self):
		if n.get_meta("kiln", "") == "inventory":
			return n
	return null

func toggle_inventory() -> void:
	var inv := _inv()
	if inv:
		inv.visible = not inv.visible
		_refresh_inventory()

func add_item(id: String, count := 1) -> void:
	for s in bag:
		if s.id == id:
			s.count += count
			_refresh_inventory()
			return
	bag.append({"id": id, "count": count})
	_refresh_inventory()

func remove_item(id: String, count := 1) -> bool:
	for i in bag.size():
		if bag[i].id == id:
			bag[i].count -= count
			if bag[i].count <= 0:
				bag.remove_at(i)
			_refresh_inventory()
			return true
	return false

func has_item(id: String) -> bool:
	return bag.any(func(s): return s.id == id)

func _refresh_inventory() -> void:
	var inv := _inv()
	if inv == null:
		return
	var cols := int(inv.get_meta("cols")); var rows := int(inv.get_meta("rows"))
	_sel = clampi(_sel, 0, cols * rows - 1)
	for i in cols * rows:
		var slot := inv.get_node("Slot%d" % i)
		var s = bag[i] if i < bag.size() else null
		var info = item_db.get(s.id, {}) if s else {}
		var icon := str(info.get("icon", ""))
		slot.get_node("Icon").texture = load(icon) if icon != "" and ResourceLoader.exists(icon) else null
		slot.get_node("Count").text = str(s.count) if s and s.count > 1 else ""
	var cur: Control = inv.get_node("Cursor")
	var target: Control = inv.get_node("Slot%d" % _sel)
	cur.position = target.position - Vector2(1, 1)
	if inv.has_node("Details"):
		var s = bag[_sel] if _sel < bag.size() else null
		var info = item_db.get(s.id, {}) if s else {}
		inv.get_node("Details/Name").text = str(info.get("name", ""))
		inv.get_node("Details/Desc").text = str(info.get("desc", ""))

func _unhandled_input(e: InputEvent) -> void:
	var d := _dialogue()
	if d and d.visible and e.is_action_pressed("ui_accept"):
		if _typing:
			d.get_node("Line").visible_characters = -1
			_typing = false
		else:
			d.visible = false
			dialogue_finished.emit()
		get_viewport().set_input_as_handled()
		return
	if InputMap.has_action("inventory") and e.is_action_pressed("inventory"):
		toggle_inventory()
		get_viewport().set_input_as_handled()
		return
	var inv := _inv()
	if inv == null or not inv.visible:
		return
	var cols := int(inv.get_meta("cols")); var n := cols * int(inv.get_meta("rows"))
	if e.is_action_pressed("ui_right"): _sel = (_sel + 1) % n
	elif e.is_action_pressed("ui_left"): _sel = (_sel - 1 + n) % n
	elif e.is_action_pressed("ui_down"): _sel = (_sel + cols) % n
	elif e.is_action_pressed("ui_up"): _sel = (_sel - cols + n) % n
	elif e.is_action_pressed("ui_accept") and _sel < bag.size(): item_used.emit(bag[_sel].id)
	elif e.is_action_pressed("ui_cancel"): inv.visible = false
	else: return
	_refresh_inventory()
	get_viewport().set_input_as_handled()
`;
