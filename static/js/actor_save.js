// Saving an actor: animation strips, manifest, packed sheet, Godot SpriteFrames + actor scene (actor_godot.js), shared
// scripts (juice, brains, effects, projectiles), sounds, faces, palette and CHARACTER.md into sprites/<name>/, plus the
// editable Kiln project. Animate calls saveActor(); nothing here touches the editor.
import { api, toast, newImg, toDataURL, blit, bbox, hex } from './core.js';
import { loadOwners, claim } from './owners.js';
import { facesFiles } from './workshop.js';
import { actorScene, projectileScene, boxesOf, brainOf, JUICE_GD, PROJECTILE_GD, FLASH_SHADER } from './actor_godot.js';
import { characterDoc } from './actor_tools.js';
import { BRAIN_GD } from './brains.js';
import { wav, synth } from './sfx.js';
import { vfxFiles, VFX_GD } from './vfx.js';
import { saveFiles, S as FS } from './files.js';

const slug = s => (s || 'actor').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'actor';

export async function saveActor(a, serialize, renamed) {
  await loadOwners('actor');
  if (claim('actor', a, slug)) renamed();
  const dir = `sprites/${a.name}`;
  const files = [], man = { w: a.w, h: a.h, source: 'kiln', anims: {} };
  for (const n of a.anims) {
    const W = n.frames[0].width;
    const strip = newImg(W * n.frames.length, a.h);
    n.frames.forEach((f, i) => blit(strip, f, i * W, 0));
    files.push({ name: `${n.name}.png`, b64: toDataURL(strip) });
    man.anims[n.name] = { file: `${n.name}.png`, frames: n.frames.length, fps: n.fps, loop: n.loop !== false, ...(W !== a.w ? { w: W } : {}) };
  }
  files.push({ name: 'manifest.json', text: JSON.stringify(man, null, 2) + '\n' });
  // packed sheet: one row per animation, plus an Aseprite-style JSON (frames + frameTags)
  const sheet = newImg(Math.max(...a.anims.map(n => n.frames.length * n.frames[0].width)), a.anims.length * a.h);
  const sj = { frames: {}, meta: { app: 'kiln', image: 'sheet.png', size: { w: sheet.width, h: sheet.height }, frameTags: [] } };
  let idx = 0;
  a.anims.forEach((n, r) => {
    const from = idx;
    n.frames.forEach((f, i) => {
      const W = f.width;
      blit(sheet, f, i * W, r * a.h);
      sj.frames[`${n.name}_${i}`] = { frame: { x: i * W, y: r * a.h, w: W, h: a.h }, duration: Math.round(1000 / n.fps) };
      idx++;
    });
    sj.meta.frameTags.push({ name: n.name, from, to: idx - 1, direction: 'forward' });
  });
  files.push({ name: 'sheet.png', b64: toDataURL(sheet) }, { name: 'sheet.json', text: JSON.stringify(sj, null, 1) + '\n' });
  // Godot 4 SpriteFrames
  const dest = FS.root + '/' + dir;
  const g = await api('/api/godot?path=' + encodeURIComponent(FS.root)).catch(() => ({}));
  const res = g.root ? 'res://' + dest.slice(g.root.length + 1) : dir;
  files.push({ name: `${a.name}.tres`, text: spriteFrames(a, res) });
  // body hitbox from the idle (or first) animation: the figure's box, trimmed to its core width
  // so a cape or a held weapon doesn't widen it
  const base = a.anims.find(n => /idle|stand/i.test(n.name)) || a.anims[0];
  const bbs = base.frames.map(bbox).filter(Boolean);
  if (bbs.length) {
    const med = k => bbs.map(b => b[k]).sort((p, q) => p - q)[bbs.length >> 1];
    const bh = med('h'), bw = Math.max(2, Math.round(med('w') * 0.6)), cx = med('x') + med('w') / 2;
    man.hitbox = { x: Math.round(cx - bw / 2), y: a.h - bh, w: bw, h: bh };
    if (Object.keys(boxesOf(a)).length) man.boxes = boxesOf(a);        // other engines: same boxes, centre-based, feet at 0
    files.find(f => f.name === 'manifest.json').text = JSON.stringify(man, null, 2) + '\n';
    files.push({ name: `${a.name}.tscn`, text: actorScene(a, res, man.hitbox) });
    await saveFiles('sprites/_kiln', [{ name: 'juice.gd', text: JUICE_GD }, { name: 'hit_flash.gdshader', text: FLASH_SHADER }, { name: 'projectile.gd', text: PROJECTILE_GD }]).catch(() => {});
    for (const pj of a.projectiles || []) files.push({ name: `projectile_${pj.name}.tscn`, text: projectileScene(a, res, pj) });
    for (const [ev, p] of Object.entries(a.sounds || {})) files.push({ name: `sfx_${ev}.wav`, b64: wav(synth(p)) });
    // effects: the hit effect and each projectile's impact, as one-shot scenes next to the actor
    const shared = res.replace(/\/[^/]+$/, '') + '/_kiln';
    if (a.vfx?.hit) files.push(...vfxFiles('vfx_hit', a.vfx.hit, res, shared));
    for (const pj of a.projectiles || []) if (pj.impact) files.push(...vfxFiles(`vfx_${pj.name}_impact`, pj.impact, res, shared));
    if (a.vfx?.hit || (a.projectiles || []).some(pj => pj.impact)) await saveFiles('sprites/_kiln', [{ name: 'vfx.gd', text: VFX_GD }]).catch(() => {});
    // the actor's brain script: written once, then it is yours to edit (Logic) and never overwritten
    const br = brainOf(a);
    if (br) {
      const have = await api('/api/fs?path=' + encodeURIComponent(FS.root + '/sprites/_kiln/brains')).catch(() => ({ items: [] }));
      if (!(have.items || []).some(i => i.name === br + '.gd')) await saveFiles('sprites/_kiln/brains', [{ name: br + '.gd', text: BRAIN_GD[br] }]).catch(() => {});
    }
  }
  if (a.identity?.ref) files.push({ name: 'reference.png', b64: a.identity.ref });
  files.push(...await facesFiles(a));
  files.push({ name: 'palette.hex', text: a.pal.map(c => hex(c).slice(1)).join('\n') + '\n' });
  files.push({ name: 'CHARACTER.md', text: await characterDoc(a, dir, base) });
  try {
    const r = await saveFiles(dir, files);
    // keep the editable source too
    await api('/api/project', { id: 'actor-' + a.name, data: serialize(a) });
    toast(`Saved ${files.length} files to ${dir}/${g.root ? ' (Godot paths)' : ''}`, 'ok');
    return r;
  } catch (e) { toast('Save failed: ' + e.message, 'bad'); }
}
function spriteFrames(a, res) {
  const ext = [], subs = [], animsOut = [];
  a.anims.forEach((n, ai) => {
    ext.push(`[ext_resource type="Texture2D" path="${res}/${n.name}.png" id="${ai + 1}"]`);
    const fr = n.frames.map((_, i) => {
      const id = `a${ai}_${i}`;
      const W = n.frames[0].width;
      subs.push(`[sub_resource type="AtlasTexture" id="${id}"]\natlas = ExtResource("${ai + 1}")\nregion = Rect2(${i * W}, 0, ${W}, ${a.h})`);
      return `{\n"duration": 1.0,\n"texture": SubResource("${id}")\n}`;
    });
    animsOut.push(`{\n"frames": [${fr.join(', ')}],\n"loop": ${n.loop !== false},\n"name": &"${n.name}",\n"speed": ${n.fps.toFixed(1)}\n}`);
  });
  return `[gd_resource type="SpriteFrames" load_steps=${ext.length + subs.length + 1} format=3]\n\n${ext.join('\n')}\n\n${subs.join('\n\n')}\n\n[resource]\nanimations = [${animsOut.join(', ')}]\n`;
}
