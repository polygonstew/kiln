// Tours: speech-bubble walkthroughs of each area, pointing at its parts in order (Back / Next / Done).
// Start: KILN menu → Help → Tour this area, right-click → Help, or Shift+F1. Each area offers its tour once,
// the first time it is opened. A step's target is 'h3:Heading' (that panel section), 'btn:Label' (a button),
// 'stage' (the middle work area) or 'tab' (the area's tab); steps whose target is not on screen are skipped.
import { h, pref } from './core.js';

const T = {
  files: [['tab', 'Files', 'Your asset folder, laid out the way Godot reads it. Everything Kiln makes lands here.'],
    ['stage', 'The folder', 'Click to see a file, double-click to open a folder or use an image. Drop files from your computer to copy them in.'],
    ['h3:How the asset folder is laid out', 'Where things go', 'sprites/ for actors, backgrounds/ for scenes, levels/, hud/, fonts/: the same layout every time, so Godot scenes find their files.']],
  forge: [['h3:Describe it', 'Describe it', 'Say what you want in plain words, then pick what it is and which way it faces. The style bible is added to every prompt so things match.'],
    ['h3:Guide image', 'Guide image', 'Optional: an image whose shape or design the new thing should follow.'],
    ['h3:Generator', 'Generator', 'Cloud draws best (free daily quota first); This PC is free but slower. Then Generate.'],
    ['stage', 'Source → sprite', 'Left: the generated or opened image. Right: the real game sprite it becomes, pixel for pixel.'],
    ['h3:Hardware', 'Hardware look', 'Pick a console: colours and limits follow it (NES, Game Boy, SNES…).'],
    ['h3:Clean-up', 'Clean-up', 'Background removal, outline and stray pixels. The Mask keeps parts that share the background colour.'],
    ['h3:Use it', 'Use it', 'Send the sprite on: a new actor in Animate (with a set of animations to pose), a layer, a tile…']],
  animate: [['h3:Actor', 'The actor', 'One character with all its animations. Open, New, its name and frame size.'],
    ['h3:Tools', 'Draw', 'Left click adds, right click removes, the mouse wheel rolls through colours, middle click picks one.'],
    ['stage', 'The frame', 'The editor. Below it: the animations (tabs) and the frame strip; Shift/Ctrl+click picks several frames, Ping-pong plays them back.'],
    ['btn:Puppet', 'Puppet', 'Bones: rig this frame, pose it on a Flash-style timeline with tweens, make walk / run / attack from the rig, bake to frames.'],
    ['btn:Workshop', 'Workshop', 'Everything this actor needs as a checklist: animations, status faces, behaviour, sounds, effects, projectiles.'],
    ['h3:Preview', 'Preview', 'Plays live, the way the game will show it.'],
    ['h3:Identity', 'Identity', 'Describe the actor and set a reference frame: new frames are then drawn on-model.'],
    ['h3:Save to asset folder', 'Save for Godot', 'Writes strips, a SpriteFrames .tres and a ready CharacterBody2D scene.']],
  scenes: [['h3:Start from', 'Start from', 'A whole scene in one click, to change from there.'],
    ['h3:Add a layer', 'Add layers', 'Sky, mountains, city, ground, weather… made by code, tiling and scrolling at their own speed.'],
    ['stage', 'Preview', 'The camera pans so you can judge depth. Pick an actor at the top to check scale.'],
    ['h3:Layers', 'Layers', 'Back to front. Drag to reorder; each layer\'s scroll speed sets how far away it feels.'],
    ['h3:Save to asset folder', 'Save for Godot', 'A Parallax2D scene with every layer, weather as particles.']],
  levels: [['h3:Level', 'The level', 'Name, size in tiles and a scene from Scenes as its background.'],
    ['h3:Paint', 'Paint', 'Tiles, Things (player start, actors) or Zones (checkpoints, doors, messages, pits).'],
    ['h3:Tiles', 'Tiles', 'Pick a tile and set what it does (solid, one-way, ladder, hazard…). Autotile builds edges that join up as you paint.'],
    ['tools:levels', 'Tools', 'Brush (B, sizes 1–3), Rectangle (R), Line (L), Fill (G), Pick (I), Select (M: copy, cut, stamp, clear) and undo / redo (Ctrl+Z / Ctrl+Y).'],
    ['stage', 'The map', 'Left click paints, right click erases, the wheel rolls tiles, Space+drag pans, + and − zoom.'],
    ['h3:Save to asset folder', 'Save for Godot', 'A TileSet with collision and a scene with a TileMapLayer, things and zones.']],
  hud: [['h3:Add', 'Add widgets', 'Health bars, gauges, pips, counters, portraits, inventory, dialogue.'],
    ['stage', 'The screen', 'Drag widgets into place at game resolution.'],
    ['h3:Widgets', 'Widgets', 'Every widget and its settings; a portrait can show an actor\'s status faces.'],
    ['h3:Save to asset folder', 'Save for Godot', 'A CanvasLayer scene plus hud.gd: set_health(), say(), add_item()…']],
  stage: [['h3:On stage', 'On stage', 'Pick an actor, a scene and a HUD and play them together.'],
    ['stage', 'Play', 'Arrow keys move, the buttons below act. This is how the game will feel.'],
    ['h3:Actions → animations', 'Actions', 'Which animation each action plays.']],
  concepts: [['h3:Session', 'Sessions', 'A board per idea, saved with its images and notes.'],
    ['h3:Make images on', 'Image sites', 'Open an image site on your own device, then paste or upload what you make here.'],
    ['stage', 'The board', 'Each image can become a sprite, a guide, frames or a whole actor.'],
    ['h3:Notes', 'Notes', 'Lore and ideas that stay with the session.']],
  logic: [['h3:Scripts', 'Scripts', 'Every GDScript in the asset folder: brains (yours to change), Kiln\'s own, and yours.'],
    ['stage', 'The editor', 'Tab indents, Ctrl+/ comments, Ctrl+S saves and the real Godot checks it.'],
    ['h3:Problems', 'Problems', 'What Godot found, with the line; click one to jump there.'],
    ['h3:Kiln reference', 'Reference', 'What Kiln\'s scripts give you: click a line to insert it.']],
  menus: [['h3:Screens', 'Screens', 'The title menu, options and pause. Switch each on or off.'],
    ['h3:This screen', 'Look', 'Title, what is behind it (a scene or colour), dim, text size, colours, layout.'],
    ['h3:Items', 'Items', 'Buttons (start, options, back, quit…), volume sliders, fullscreen, on/off options, the controls list.'],
    ['stage', 'Preview', 'At game size, laid out the way the game builds it.'],
    ['h3:Save to asset folder', 'Save', 'Scenes in menus/ plus the scripts; ▶ Play shows the title menu first and Esc pauses.']],
};

function target(area, spec) {
  const v = document.querySelector('#v-' + area);
  if (spec === 'tab') return document.querySelector(`#tabs [data-id="${area}"]`);
  if (spec === 'stage') return v?.querySelector(':scope > section.stage');
  if (spec.startsWith('tools:')) return v?.querySelector('.lv-tools');
  const [kind, text] = [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)];
  if (kind === 'h3') return [...(v?.querySelectorAll('h3') || [])].find(e => e.offsetParent && e.childNodes[0]?.textContent.trim() === text)?.closest('.sec') || null;
  if (kind === 'btn') return [...(v?.querySelectorAll('button') || [])].find(e => e.offsetParent && e.textContent.trim().startsWith(text)) || null;
  return null;
}

let cur = null;
export function tour(area) {
  endTour();
  const steps = (T[area] || []).map(([spec, title, text]) => ({ el: target(area, spec), title, text })).filter(s => s.el && s.el.getBoundingClientRect().width);
  if (!steps.length) return;
  pref.set('tour.seen.' + area, true);
  const ring = h('div', { class: 'tour-ring' }), bub = h('div', { class: 'tour-bub' });
  const veil = h('div', { class: 'tour-veil', onclick: () => endTour() });
  document.body.append(veil, ring, bub);
  let i = 0;
  const show = () => {
    const s = steps[i]; s.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = s.el.getBoundingClientRect();
    Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
    bub.replaceChildren(h('div', { class: 'tour-n' }, `${i + 1} / ${steps.length}`), h('b', {}, s.title), h('p', {}, s.text),
      h('div', { class: 'tour-b' }, h('button', { class: 'btn sm ghost', onclick: () => endTour() }, 'Skip'), h('span', { class: 'grow' }),
        i ? h('button', { class: 'btn sm ghost', onclick: () => { i--; show(); } }, 'Back') : '',
        h('button', { class: 'btn sm go', onclick: () => { if (++i >= steps.length) endTour(); else show(); } }, i === steps.length - 1 ? 'Done' : 'Next')));
    // beside the target: right of it if there is room, else left, else below; always on screen
    const b = bub.getBoundingClientRect(), gap = 14;
    let x = r.right + gap, y = r.top;
    if (x + b.width > innerWidth - 8) x = r.left - b.width - gap;
    if (x < 8) { x = Math.min(innerWidth - b.width - 8, Math.max(8, r.left)); y = r.bottom + gap; if (y + b.height > innerHeight - 8) y = r.top - b.height - gap; }
    bub.style.left = x + 'px'; bub.style.top = Math.max(8, Math.min(y, innerHeight - b.height - 8)) + 'px';
  };
  const key = e => { if (e.key === 'Escape') endTour(); else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (++i >= steps.length) endTour(); else show(); } else if (e.key === 'ArrowLeft' && i) { i--; show(); } };
  window.addEventListener('keydown', key, true);
  cur = { parts: [veil, ring, bub], key };
  show();
}
export function endTour() { if (!cur) return; cur.parts.forEach(p => p.remove()); window.removeEventListener('keydown', cur.key, true); cur = null; }
// the first visit to an area: a small offer, not the tour itself
export function offerTour(area) {
  if (!T[area] || pref.get('tour.seen.' + area, false) || document.querySelector('.tour-offer')) return;
  const b = h('div', { class: 'tour-offer' }, h('span', {}, 'New here? '), h('button', { class: 'btn sm go', onclick: () => { b.remove(); tour(area); } }, 'Take the tour'),
    h('button', { class: 'btn sm ghost', onclick: () => { pref.set('tour.seen.' + area, true); b.remove(); } }, 'No thanks'), h('small', {}, 'Shift+F1 any time'));
  document.body.append(b); setTimeout(() => b.remove(), 15000);
}
