// Where Kiln writes things in an asset folder. Your game content keeps its own folders (sprites/<actor>/,
// backgrounds/<scene>/, levels/<level>/, hud/<hud>/, menus/, dialogue/, logic/, sfx/, vfx/…). Kiln's runtime, the
// small commented GDScript every game shares, lives together in _kiln/ with a README:
//   _kiln/actor/   juice.gd (hurt, flash, knockback…), hit_flash.gdshader, projectile.gd, lipsync.gd, vfx.gd
//   _kiln/brains/  player.gd, patrol.gd, flyer.gd: behaviours, written once and then yours to change
//   _kiln/level/   level_tiles.gd (tile kinds, hazards), zone.gd (checkpoints, doors, messages…)
//   _kiln/ui/      hud.gd, menu.gd, settings.gd (KilnSettings), dialogue.gd (the dialogue runner)
//   _kiln/game/    input.gd (KilnInput: every action on keys and a gamepad)
// Every save takes its paths from here, so the layout is defined in this one place. An older asset folder (runtime in
// sprites/_kiln/, menus/kiln_menu.gd…) is moved here by File → Tidy game files (server: tidy.py).
import { api } from './core.js';
import { saveFiles, S as FS } from './files.js';
import { INPUT_GD } from './input_godot.js';

export const KILN = '_kiln';
const FILES = {
  juice: 'actor/juice.gd', flash: 'actor/hit_flash.gdshader', projectile: 'actor/projectile.gd', lipsync: 'actor/lipsync.gd', vfx: 'actor/vfx.gd',
  tiles: 'level/level_tiles.gd', zone: 'level/zone.gd',
  hud: 'ui/hud.gd', menu: 'ui/menu.gd', settings: 'ui/settings.gd', dialogue: 'ui/dialogue.gd',
  input: 'game/input.gd',
};
// a runtime file from the asset folder ('_kiln/actor/juice.gd'), and as a scene refers to it: base is '' (the asset
// folder is the project) or 'res://<where the asset folder sits in the Godot project>/'
export const rt = key => `${KILN}/${FILES[key]}`;
export const rtRes = (base, key) => base + rt(key);
export const brainPath = id => `${KILN}/brains/${id}.gd`;
// the base of a content folder's res path: 'res://assets/sprites/hero' → 'res://assets/', 'levels/room' → ''
export const baseOf = res => res.replace(/[^/]+\/[^/]+$/, '');

const README = `# _kiln: Kiln's runtime

Small, commented GDScript your game uses. Everything else in this asset folder is your content.

- \`actor/juice.gd\`: on every Kiln actor: hurt(), heal(), die(), shoot(), hit flash, squash, screen shake, hit boxes.
- \`actor/hit_flash.gdshader\`, \`actor/projectile.gd\`, \`actor/lipsync.gd\` (mouth in time with voice lines), \`actor/vfx.gd\`.
- \`brains/\`: what drives an actor (player controls, patrol, flyer). Written once, then yours to change (Kiln's Logic tab).
- \`level/level_tiles.gd\`: what a tile is (solid, ladder, hazard…); \`level/zone.gd\`: checkpoints, doors, messages.
- \`ui/hud.gd\`: the HUD's calls (set_health, say, add_item…); \`ui/menu.gd\` + \`ui/settings.gd\` (KilnSettings): menus and
  saved options; \`ui/dialogue.gd\`: plays conversations from dialogue/<name>.json.
- \`game/input.gd\` (KilnInput): every action (move, jump, attack, shoot, interact, pause, inventory) on keys and a gamepad.
  Set your own in Project Settings → Input Map; KilnInput only adds what is missing.

Kiln writes these again when it saves (so it can fix them), except \`brains/\`. Change behaviour in brains/ or in your own
scripts (scripts/, logic/), not here.
`;

export const writeReadme = () => saveFiles(KILN, [{ name: 'README.md', text: README }]);
// write runtime files: { key: text }, grouped by folder, with the README and the controls (input.gd) beside them
export async function writeRuntime(entries) {
  const byDir = {};
  for (const [k, text] of Object.entries({ ...entries, input: INPUT_GD })) { const p = rt(k), d = p.slice(0, p.lastIndexOf('/')); (byDir[d] ||= []).push({ name: p.slice(p.lastIndexOf('/') + 1), text }); }
  for (const [d, files] of Object.entries(byDir)) await saveFiles(d, files);
  await writeReadme();
}
// a brain is written once: an existing copy (here, or in the old sprites/_kiln/brains/) is kept, edits and all
export async function ensureBrain(id, text) {
  const list = async d => ((await api('/api/fs?path=' + encodeURIComponent(`${FS.root}/${d}`)).catch(() => ({ items: [] }))).items || []).map(i => i.name);
  if ((await list(`${KILN}/brains`)).includes(id + '.gd')) return;
  if ((await list('sprites/_kiln/brains')).includes(id + '.gd')) text = await fetch('/api/fs/raw?path=' + encodeURIComponent(`${FS.root}/sprites/_kiln/brains/${id}.gd`)).then(r => r.text());
  await saveFiles(`${KILN}/brains`, [{ name: id + '.gd', text }]);
}
