// Actor workshop: everything one game character needs, as a checklist you can tick off with one click each.
// Opened from Animate (Workshop button) for the actor that is open. Simple by default: a role picks the
// checklist; every item can still be done by hand in the editor.
import { BRAINS, defaultBrain } from './brains.js';
import { roll, sfxRow, play } from './sfx.js';
import { vfxRow, newVfx } from './vfx.js';
import { h, toast, imgData, pixelize, toCanvas, toDataURL, rgb, hex, luma, newImg, blit, bbox, select, seg, range, check, field } from './core.js';
import { enqueue } from './queue.js';
import { SETS } from './sheets.js';
import { stylePrompt } from './style.js';

// what the generator is asked to change for each animation (Forge "Making frames for…", locked to the actor)
export const POSES_FOR = {
  idle: ['standing still, relaxed'], walk: ['walking, left leg forward', 'walking, right leg forward'], run: ['running, leaning forward'],
  jump: ['jumping, knees tucked'], fall: ['falling, arms up'], land: ['crouching low'], crouch: ['crouching low'],
  attack: ['winding up a swing, weapon raised behind', 'striking forward, weapon fully extended'], attack2: ['striking forward, weapon fully extended'],
  dodge: ['crouching low'], hurt: ['recoiling in pain'], death: ['collapsed on the ground'], climb: ['seen from behind'], heal: ['casting a spell, hands raised'],
  fly: ['standing still, relaxed'], special: ['casting a spell, hands raised'], stagger: ['recoiling in pain'], talk: ['turned to face the viewer'], react: ['recoiling in pain'],
};
// Doom-style status faces: the HUD portrait switches between these as health drops
export const FACES = [
  ['healthy', 'Healthy', 'calm, determined expression'],
  ['hurt', 'Hurt', 'wincing in pain, a small cut on the cheek'],
  ['badly', 'Badly hurt', 'battered and bruised, blood running down the face, gritted teeth'],
  ['near', 'Near death', 'badly wounded and bloodied, one eye swollen shut, barely conscious'],
  ['dead', 'Dead', 'dead, eyes closed, ashen grey skin, head slumped'],
  ['grin', 'Grin', 'grinning fiercely, triumphant'],
  ['left', 'Look left', 'calm, glancing to the left side'],
  ['right', 'Look right', 'calm, glancing to the right side'],
];
const ROLES = [['hero', 'Player'], ['enemy', 'Enemy'], ['flyer', 'Flyer'], ['boss', 'Boss'], ['npc', 'NPC'], ['prop', 'Prop']];
const EXTRA = ['#8a1c1c', '#c0392b', '#4a2a3a'].map(rgb);      // blood and bruises the faces may use beyond the actor palette

const same = (a, b) => { if (a.width !== b.width || a.height !== b.height) return false; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false; return true; };
// missing / empty / not posed yet (every frame a copy of the first) / done
function animState(n) {
  if (!n) return 'missing';
  if (n.frames.every(f => !bbox(f))) return 'empty';
  if (n.frames.length > 1 && n.frames.every(f => same(f, n.frames[0]))) return 'unposed';
  return 'done';
}
const LABEL = { missing: 'missing', empty: 'empty', unposed: 'not posed yet', done: 'done' };

/* api from animate.js: actor(), changed(structure), pushUndo(), goto(name), makeMore(poses), save() */
export function openWorkshop(host, api) {
  const a = api.actor();
  const role = () => a.role || (a.kind === 'creature' ? 'enemy' : 'hero');
  const faces = () => (a.faces ||= { size: 32, engine: 'cloud', states: {} });
  const ov = h('div', { class: 'workshop' });
  const close = () => { ov.remove(); api.redraw(); };      // only real edits (they call api.changed) save the actor
  const draw = () => {
    const S = SETS[role()] || SETS.hero, have = new Map(a.anims.map(n => [n.name, n]));
    const rows = S.anims.map(([name, n, span, fps, loop]) => {
      const st = animState(have.get(name));
      return h('tr', { class: st },
        h('td', {}, name), h('td', {}, `${n}${span > 1 ? ' · 2 wide' : ''}`), h('td', { class: 'st' }, LABEL[st]),
        h('td', { class: 'acts' },
          st === 'missing' ? h('button', { class: 'btn sm', title: `Add "${name}" with ${n} frames, each starting from the first idle frame`, onclick: () => { addAnim(name, n, span, fps, loop); draw(); } }, 'Add') : null,
          a.identity?.ref ? h('button', { class: 'btn sm' + (st === 'done' ? ' ghost' : ' go'), title: 'Open Forge locked to this actor with poses for this animation', onclick: () => { close(); api.makeMore(POSES_FOR[name] || []); } }, 'Make with Forge') : null,
          st !== 'missing' ? h('button', { class: 'btn sm ghost', title: 'Edit it in the editor', onclick: () => { close(); api.goto(name); } }, 'Edit') : null));
    });
    const done = S.anims.filter(([n]) => animState(have.get(n)) === 'done').length;
    const extra = a.anims.filter(n => !S.anims.some(([m]) => m === n.name)).map(n => n.name);
    const ref = a.identity?.refSprite;
    ov.replaceChildren(
      h('header', {}, h('b', {}, 'Workshop'), h('span', {}, a.name), h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'Save the actor for the game (strips, Godot scene, faces)', onclick: () => api.save() }, 'Save ' + a.name),
        h('button', { class: 'btn sm go', title: 'Back to the pixel editor', onclick: close }, 'Back to editor')),
      h('div', { class: 'wk-body' },
        h('div', { class: 'wk-col' },
          h('div', { class: 'wk-card wk-id' },
            ref ? (() => { const c = h('canvas'); imgData(ref).then(im => toCanvas(im, 1, c)); return c; })() : h('div', { class: 'noref' }, 'no reference'),
            h('div', {}, h('div', { class: 'nm' }, a.name), h('div', { class: 'desc' }, a.desc || 'No description yet: add one in Animate → Identity. It keeps generated frames on-model.'),
              h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Role'), select(ROLES, role(), v => { a.role = v; api.changed(); draw(); })),
              !a.identity?.ref ? h('p', { class: 'note' }, 'Set a reference (Animate → Identity → Use this frame as reference) to generate frames and faces on-model.') : null)),
          h('div', { class: 'wk-card' }, h('h3', {}, 'Animations', h('span', { class: 'grow' }), h('small', {}, `${done}/${S.anims.length} done`)),
            h('table', { class: 'wk-anims' }, ...rows),
            extra.length ? h('p', { class: 'note' }, 'Also has: ' + extra.join(', ')) : null,
            S.anims.some(([n]) => !have.has(n)) ? h('button', { class: 'btn sm', title: 'Add every missing animation of this role at once', onclick: () => { for (const r of S.anims) if (!have.has(r[0])) addAnim(...r); draw(); } }, 'Add all missing') : null),
          reactCard(), brainCard(), soundCard(), fxCard(), projCard()),
        h('div', { class: 'wk-col' }, facesCard())));
  };
  /* ---- being hit ---- */
  function reactCard() {
    const R = a.react || { knockback: 60, iframes: .6 };
    const set = (k, v) => { a.react = { ...R, [k]: v }; api.changed(); };
    return h('div', { class: 'wk-card' }, h('h3', {}, 'When it gets hit'),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'In Godot, hurt(from_position) takes a hit: health goes down, it flashes, is knocked back and blinks while safe. At 0 it plays "death"; enemies vanish, the player\'s level restarts.'),
      field('Knockback', range(R.knockback, 0, 240, 5, v => set('knockback', v), v => v + ' px/s'), 'How hard a hit pushes it away'),
      field('Health', range(R.health ?? 3, 1, 20, 1, v => set('health', v), v => v + (v == 1 ? ' hit' : ' hits')), 'Hits it takes before dying (the player\'s health drives the HUD)'),
      field('Safe for', range(R.iframes, 0, 2, .05, v => set('iframes', v), v => (+v).toFixed(2) + ' s'), 'Invulnerable (blinking) after a hit'),
      have('hurt') ? null : h('p', { class: 'note' }, 'Tip: add a "hurt" animation (enemy and player roles include one).'));
  }
  /* ---- effects ---- */
  function fxCard() {
    const V = a.vfx || {};
    return h('div', { class: 'wk-card' }, h('h3', {}, 'Effects', h('small', {}, 'drawn by code')),
      V.hit ? vfxRow('When hit', V.hit, n => { a.vfx = { ...V, hit: n }; api.changed(); draw(); }, () => { a.vfx = { ...V, hit: null }; api.changed(); draw(); })
        : h('div', {}, h('p', { class: 'note', style: { marginTop: 0 } }, 'A spark, slash or splash where a hit lands (vfx_hit.tscn; spawned by hurt()). Projectile impacts are set under Projectiles.'),
          h('button', { class: 'btn sm', onclick: () => { a.vfx = { ...V, hit: newVfx(role() === 'hero' ? 'spark' : 'spark', 'blood') }; api.changed(); draw(); } }, '+ Hit effect')));
  }
  /* ---- sounds ---- */
  // event → the preset it starts from; which events a role gets by default
  const EVENTS = { jump: 'jump', attack: 'hit', hurt: 'hurt', shoot: 'shoot', die: 'die' };
  const roleEvents = () => ({ hero: ['jump', 'attack', 'hurt', 'die'], boss: ['attack', 'hurt', 'die'] }[role()] || ['hurt', 'die']).concat((a.projectiles || []).length ? ['shoot'] : []);
  function soundCard() {
    const S = a.sounds || {}, set = (ev, p, redraw) => { a.sounds = { ...(a.sounds || {}), [ev]: p }; api.changed(); if (redraw) draw(); };
    const missing = Object.keys(EVENTS).filter(ev => !S[ev]);
    return h('div', { class: 'wk-card' }, h('h3', {}, 'Sounds', h('small', {}, 'retro, made here'), h('span', { class: 'grow' }),
        Object.keys(S).length ? '' : h('button', { class: 'btn sm', title: 'A fitting sound for each thing this role does', onclick: () => { const n = {}; for (const ev of roleEvents()) n[ev] = roll(EVENTS[ev]); a.sounds = n; api.changed(); draw(); } }, 'Give it sounds')),
      Object.keys(S).length ? '' : h('p', { class: 'note', style: { marginTop: 0 } }, 'Jump, attack, hurt, shoot and die sounds. In Godot the actor plays them by itself (its brain plays jump and attack); saved as sfx_<event>.wav.'),
      ...Object.entries(S).map(([ev, p]) => sfxRow(ev, p, (n, redraw) => set(ev, n, redraw), () => { const { [ev]: _, ...rest } = a.sounds; a.sounds = rest; api.changed(); draw(); })),
      Object.keys(S).length && missing.length ? h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px' } }, ...missing.map(ev => h('button', { class: 'btn sm ghost', onclick: () => { const p = roll(EVENTS[ev]); set(ev, p, true); play(p); } }, '+ ' + ev))) : '');
  }
  /* ---- behaviour ---- */
  function brainCard() {
    const id = a.brain ?? defaultBrain(role()), B = BRAINS[id], P = (a.brainParams ||= {});
    return h('div', { class: 'wk-card' }, h('h3', {}, 'Behaviour', h('small', {}, 'what drives it in the game')),
      field('Brain', select([['', 'None (your own code)'], ...Object.entries(BRAINS).map(([k, b]) => [k, b.label])], id, v => { a.brain = v; api.changed(); draw(); })),
      B ? h('p', { class: 'note', style: { marginTop: 0 } }, B.desc, ' Script: _kiln/brains/' + id + '.gd (open it in Logic to change how it works).') : h('p', { class: 'note', style: { marginTop: 0 } }, 'No brain: the actor stands still until your own script moves it.'),
      ...(B ? B.params.map(([k, label, mn, mx, st, d, hint]) => field(label, range(P[k] ?? d, mn, mx, st, v => { P[k] = +v; api.changed(); }, v => k === 'turn_at_ledges' ? (+v ? 'yes' : 'no') : `${v} ${hint.split(' ')[0]}`), hint)) : []));
  }
  const have = name => a.anims.some(n => n.name === name);
  /* ---- projectiles ---- */
  function projCard() {
    const P = a.projectiles || [];
    return h('div', { class: 'wk-card' }, h('h3', {}, 'Projectiles', h('span', { class: 'grow' }),
        h('button', { class: 'btn sm', title: 'A new projectile: its own small animation (drawn in the editor) plus how it flies', onclick: addProjectile }, '+ Projectile')),
      P.length ? null : h('p', { class: 'note', style: { marginTop: 0 } }, 'Fireballs, arrows, thrown knives. Each is an animation of this actor plus speed, gravity and damage; saved as projectile_<name>.tscn. In Godot: shoot(direction).'),
      ...P.map((pj, i) => h('div', { class: 'wk-proj' },
        h('div', { class: 'wk-proj-h' }, h('b', {}, pj.name), h('small', {}, `animation "${pj.anim}"`), h('span', { class: 'grow' }),
          h('button', { class: 'btn sm ghost', title: 'Draw it in the editor', onclick: () => { ov.remove(); api.goto(pj.anim); } }, 'Draw'),
          h('button', { class: 'ibtn', title: 'Remove this projectile (its animation stays)', onclick: () => { api.pushUndo(); a.projectiles.splice(i, 1); api.changed(true); draw(); } }, '✕')),
        field('Speed', range(pj.speed, 20, 600, 10, v => { pj.speed = v; api.changed(); }, v => v + ' px/s')),
        field('Gravity', range(pj.gravity, 0, 2, .05, v => { pj.gravity = v; api.changed(); }, v => v ? (+v).toFixed(2) + '×' : 'none'), 'An arrow arcs, a fireball flies straight'),
        field('Lifetime', range(pj.lifetime, .2, 6, .1, v => { pj.lifetime = v; api.changed(); }, v => (+v).toFixed(1) + ' s')),
        field('Damage', range(pj.damage, 1, 10, 1, v => { pj.damage = v; api.changed(); })),
        field('Pierce', check('goes through what it hits', pj.pierce, v => { pj.pierce = v; api.changed(); })),
        pj.impact ? vfxRow('Impact', pj.impact, n => { pj.impact = n; api.changed(); draw(); }, () => { pj.impact = null; api.changed(); draw(); })
          : h('button', { class: 'btn sm ghost', onclick: () => { pj.impact = newVfx('explosion', 'fire', 24); api.changed(); draw(); } }, '+ Impact effect'))));
  }
  function addProjectile() {
    const name = (prompt('Name for the projectile', 'fireball') || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!name) return;
    api.pushUndo();
    // a starter orb in the actor's brightest colours so it shows up straight away; draw over it
    const pal = [...a.pal].sort((p, q) => luma(q) - luma(p)), hot = pal[0] || [255, 220, 120], mid = pal[1] || hot;
    const frames = Array.from({ length: 4 }, (_, f) => {
      const im = newImg(a.w, a.h), cx = a.w / 2, cy = a.h / 2, r = Math.max(2, Math.round(Math.min(a.w, a.h) / 10)) + (f % 2);
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const d = Math.hypot(x + .5 - cx, y + .5 - cy); if (d <= r) im.data.set([...(d < r * .55 ? hot : mid), 255], (y * a.w + x) * 4); }
      return im;
    });
    a.anims.push({ name: 'proj_' + name, fps: 12, loop: true, span: 1, frames });
    (a.projectiles ||= []).push({ name, anim: 'proj_' + name, speed: 180, gravity: 0, lifetime: 2, damage: 1, pierce: false });
    api.changed(true); draw();
  }
  function addAnim(name, n, span, fps, loop) {
    api.pushUndo();
    const base = (a.anims.find(x => /idle|stand/.test(x.name)) || a.anims[0])?.frames[0] || newImg(a.w, a.h);
    a.anims.push({ name, fps, loop, span, frames: Array.from({ length: n }, () => blit(newImg(a.w * span, a.h), base, Math.floor((a.w * span - base.width) / 2), 0)) });
    api.changed(true);
  }
  /* ---- faces ---- */
  let busy = {};
  function facesCard() {
    const F = faces(), grid = h('div', { class: 'wk-faces' });
    for (const [k, label] of FACES) {
      const url = F.states[k], cell = h('div', { class: 'face' + (url ? ' has' : '') + (busy[k] ? ' busy' : '') });
      if (url) { const c = h('canvas'); imgData(url).then(im => toCanvas(im, 1, c)); cell.append(c); } else cell.append(h('i', {}, busy[k] ? '…' : '?'));
      cell.append(h('span', {}, label), h('div', { class: 'facts' },
        h('button', { class: 'btn sm' + (url ? ' ghost' : ''), disabled: !a.identity?.ref || busy[k], title: url ? 'Make this face again' : 'Make this face from the reference', onclick: () => makeFace(k) }, url ? 'Again' : 'Make'),
        url ? h('button', { class: 'ibtn', title: 'Remove this face', onclick: () => { delete F.states[k]; api.changed(); draw(); } }, '✕') : null));
      grid.append(cell);
    }
    const missing = FACES.filter(([k]) => !F.states[k] && !busy[k]).length;
    return h('div', { class: 'wk-card' }, h('h3', {}, 'Status faces', h('span', { class: 'grow' }), h('small', {}, 'like the Doom marine')),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'Close-ups for the HUD portrait: it switches face as health drops. Made from the reference and kept in the actor\'s colours (plus blood and bruises).'),
      h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Size'), seg([[24, '24'], [32, '32'], [48, '48'], [64, '64']], F.size, v => { F.size = +v; api.changed(); draw(); })),
      h('label', { class: 'fld' }, h('span', { class: 'fl' }, 'Made by'), seg([['cloud', 'Cloud (best likeness)'], ['fast', 'This PC (free)']], F.engine || 'cloud', v => { F.engine = v; api.changed(); draw(); })),
      grid,
      a.identity?.ref && missing ? h('button', { class: 'btn go', title: 'Make every missing face (one cloud image each)', onclick: () => {
        const todo = FACES.filter(([k]) => !F.states[k] && !busy[k]);
        if (todo.length > 2 && F.engine !== 'fast' && !confirm(`Make ${todo.length} faces? One image each: the free daily quota first, then about 4¢ each from the capped budget.`)) return;
        todo.forEach(([k]) => makeFace(k));
      } }, `Make ${missing} missing face${missing > 1 ? 's' : ''}`) : null,
      h('p', { class: 'note' }, 'Saved with the actor as faces.png + faces.json (one cell per face, in this order).'));
  }
  function makeFace(k) {
    const st = FACES.find(f => f[0] === k);
    const prompt = `Close-up pixel art face portrait of this exact character from the reference image: ${a.desc || a.name}. ${st[2]}. Same design, colours and art style; head and shoulders filling the frame, facing the viewer, plain flat white background. ${stylePrompt()}`;
    busy[k] = true; draw();
    const F = faces(), local = F.engine === 'fast';
    const job = enqueue(local ? { engine: 'fast', prompt: `${a.desc || a.name}, close-up face portrait, ${st[2]}, ${stylePrompt()}`, w: 384, h: 384, steps: 4, batch: 1, init: a.identity.ref, denoise: .6 }
      : { engine: 'cloud', prompt, w: 512, h: 512, batch: 1, init: a.identity.ref, px: F.size }, `${a.name}: face ${st[1].toLowerCase()}`);
    job.done.then(async urls => {
      const im = await imgData(urls[0]);
      const r = pixelize(im, { w: F.size, h: F.size, fit: 'contain', anchor: 'center', lock: [...a.pal, ...EXTRA], key: true, tol: 38, outline: false });
      F.states[k] = toDataURL(r.img); delete busy[k]; api.changed(); if (ov.isConnected) draw();
      toast(`${a.name}: ${st[1]} face ready`, 'ok');
    }).catch(e => { delete busy[k]; if (ov.isConnected) draw(); toast(`Face "${st[1]}" failed: ${e?.message || e}`, 'bad'); });
  }
  draw();
  host.append(ov);
  return ov;
}

// faces.png (one size×size cell per face present, in FACES order) + faces.json, for the actor's folder
export async function facesFiles(a) {
  const F = a.faces; if (!F || !Object.keys(F.states || {}).length) return [];
  const keys = FACES.map(f => f[0]).filter(k => F.states[k]), strip = newImg(F.size * keys.length, F.size);
  for (let i = 0; i < keys.length; i++) blit(strip, await imgData(F.states[keys[i]]), i * F.size, 0);
  return [{ name: 'faces.png', b64: toDataURL(strip) }, { name: 'faces.json', text: JSON.stringify({ size: F.size, faces: keys }, null, 1) + '\n' }];
}
