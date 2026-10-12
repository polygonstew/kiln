// The Rooms inspector (right panel): what the selected thing is and does. A hotspot: its name, what the hero says on
// a look, what a click does (say, pick up, talk, go to a room), what it needs first (an item used on it, a story flag),
// what it does then (set a flag, vanish, a sound, a message to Logic), when it is there at all, and what it shows (an
// actor or a picture). Also an entry, the walk area, the depth scale, and the room itself when nothing is picked.
import { h, field, select, check, range } from './core.js';
import { standOf } from './rooms_canvas.js';

export const DOES = [['say', 'Says something'], ['pick', 'Picks something up'], ['talk', 'Starts a conversation'], ['go', 'Goes to another room'], ['leave', 'Leaves: the game Flow goes on'], ['none', 'Nothing (only a look)']];
const flagName = s => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');

// x: { R, sel, lists: { items, rooms: {name: [entries]}, dialogues, actors, sounds, voices, pictures, flags }, changed(full),
//      select(id), remove(), newItem(), makeSound(), openItems(), goRoom(name) }
export function inspector(x) {
  const { R, sel, lists: Ls } = x;
  const q = R.hotspots.find(q => q.id === sel);
  if (q) return hotspotPanel(q, x);
  if (String(sel).startsWith('entry:')) {
    const e = R.entries.find(e => 'entry:' + e.name === sel);
    if (e) return h('div', { class: 'sec' }, h('h3', {}, 'Entry'),
      field('Name', h('input', { type: 'text', value: e.name, onchange: ev => { e.name = flagName(ev.target.value) || e.name; x.select('entry:' + e.name); x.changed(true); } }), 'An exit from another room names this to arrive here; "start" is where the game begins'),
      h('p', { class: 'note' }, `At ${e.x}, ${e.y}. Drag the flag to move it.`),
      h('button', { class: 'btn sm ghost danger', title: 'Remove this entry', onclick: x.remove }, 'Delete entry'));
  }
  if (sel === 'walk') return h('div', { class: 'sec' }, h('h3', {}, 'Walk area'),
    h('p', { class: 'note', style: { marginTop: 0 } }, `${R.walk.length} points. Click (Walk tool) to add a point on the nearest edge, drag a point to move it, right click to remove it, double click an edge to add one. Keep its edges from crossing.`),
    h('button', { class: 'btn sm ghost danger', title: 'Start the walk area again', onclick: () => { R.walk = []; x.changed(true); } }, 'Redraw from scratch'));
  if (sel === 'depth') {
    const D = R.depth;
    return h('div', { class: 'sec' }, h('h3', {}, 'Depth'),
      h('p', { class: 'note', style: { marginTop: 0 } }, 'People are smaller further back. Drag the two blue lines, or set them here.'),
      field('Far line', range(D.farY, 0, R.h, 1, v => { D.farY = +v; x.changed(); }, v => v + ' px')),
      field('Size there', range(D.farS, .1, 2, .05, v => { D.farS = +v; x.changed(); }, v => Math.round(v * 100) + '%')),
      field('Near line', range(D.nearY, 0, R.h, 1, v => { D.nearY = +v; x.changed(); }, v => v + ' px')),
      field('Size there', range(D.nearS, .1, 2, .05, v => { D.nearS = +v; x.changed(); }, v => Math.round(v * 100) + '%')));
  }
  const n = R.hotspots.length;
  return h('div', { class: 'sec' }, h('h3', {}, 'This room'),
    h('p', { class: 'note', style: { marginTop: 0 } }, `${R.w}×${R.h} px · ${n} thing${n === 1 ? '' : 's'} to click · ${R.entries.length} entr${R.entries.length === 1 ? 'y' : 'ies'} · walk area ${R.walk.length >= 3 ? R.walk.length + ' points' : 'not drawn yet'}`),
    h('ol', { class: 'note rm-how' },
      h('li', {}, R.bg ? 'Background ✓' : 'Pick a background (left).'),
      h('li', {}, R.walk.length >= 3 ? 'Walk area ✓' : 'Walk tool: click around the floor where people can walk.'),
      h('li', {}, n ? 'Hotspots ✓' : 'Hotspot tool: drag a box around something to look at or use.'),
      h('li', {}, 'Entry tool: where people arrive. "start" begins the game.'),
      h('li', {}, 'Depth: drag the blue lines so people shrink further back.')));
}

function hotspotPanel(q, x) {
  const { R, lists: Ls } = x, on = (k, full) => v => { q[k] = v; x.changed(full); };
  const text = (k, ph, rows = 2) => h('textarea', { rows, value: q[k] || '', placeholder: ph, onchange: e => { q[k] = e.target.value; x.changed(); } });
  const line = (k, ph, title, clean = s => s) => h('input', { type: 'text', value: q[k] || '', placeholder: ph, title, list: 'rm-flags', onchange: e => { q[k] = clean(e.target.value); e.target.value = q[k]; x.changed(true); } });
  const itemSel = (k, none) => select([['', none], ...Ls.items.map(i => [i.id, i.name]), ['+', '+ New item…']], q[k] || '', v => { if (v === '+') { const id = x.newItem(); q[k] = id || ''; } else q[k] = v; x.changed(true); });
  const fl = h('datalist', { id: 'rm-flags' }, ...Ls.flags.map(f => h('option', { value: f })));
  const others = Object.keys(Ls.rooms).filter(n => n !== R.name);
  const shows = q.shows || {};
  return h('div', {}, fl,
    h('div', { class: 'sec' }, h('h3', {}, 'Hotspot', h('span', { class: 'grow' }), h('button', { class: 'btn sm ghost danger', title: 'Remove this hotspot (Ctrl+Z brings it back)', onclick: x.remove }, 'Delete')),
      field('Name', h('input', { type: 'text', value: q.title || '', placeholder: 'Door', onchange: e => { q.title = e.target.value; q.name = flagName(e.target.value) || q.name; x.changed(true); } }), 'Shown under the cursor'),
      field('Look', text('look', `What the hero says looking at it (right click). Empty: "It's ${(q.title || 'a thing').toLowerCase()}."`), 'Right click in the game'),
      Ls.voices.length ? field('Voice', select([['', 'No voice line'], ...Ls.voices], q.lookVoice || '', on('lookVoice')), 'A voice line (Puppet → Voice line…): the hero\'s mouth moves with it') : ''),
    h('div', { class: 'sec' }, h('h3', {}, 'Click it'),
      field('It', select(DOES, q.does || 'say', v => { q.does = v; if (v === 'pick' && q.vanish === undefined) q.vanish = true; x.changed(true); })),
      q.does === 'pick' ? [field('Gives', itemSel('item', 'Pick an item…'), 'Your items: Rooms → Items'), field('Says', text('text', 'Said after (optional): "Got it."'))]
        : q.does === 'talk' ? [field('Conversation', select([['', Ls.dialogues.length ? 'Pick one…' : 'Make one in Dialogue first'], ...Ls.dialogues], q.dialogue || '', on('dialogue', true)), 'Made in Dialogue; its choices can give items and set flags'),
          h('p', { class: 'note' }, 'Tip: Shows → the person, so they stand here.')]
        : q.does === 'go' ? [field('To room', select([['', others.length ? 'Pick a room…' : 'Make another room first'], ...others.map(n => [n, n])], q.room || '', v => { q.room = v; q.entry = (Ls.rooms[v] || [])[0] || 'start'; x.changed(true); }), 'Save that room too'),
          q.room ? field('Arrive at', select((Ls.rooms[q.room] || ['start']).map(n => [n, n]), q.entry || 'start', on('entry')), 'An entry in that room') : '']
          : q.does === 'leave' ? [field('Says', text('text', 'Said on the way out (optional)')), h('p', { class: 'note' }, `Ends this part of the game: in Flow, the room's outcome "${q.name}" leads on.`)]
          : q.does === 'say' ? field('Says', text('text', 'What the hero says when using it')) : ''),
    h('div', { class: 'sec' }, h('h3', {}, 'Needs first', h('small', {}, 'a puzzle')),
      field('An item', itemSel('needs', 'Nothing'), 'Used on it: click the item, then this'),
      q.needs ? field('', check('the item is used up', !!q.takes, on('takes'))) : '',
      field('A flag', line('needsFlag', 'e.g. talked_to_miner', 'A story flag that must be set (by another hotspot or a conversation)', flagName)),
      q.needs || q.needsFlag ? field('Until then', text('lockedText', 'Said until then: "It\'s locked."')) : ''),
    h('div', { class: 'sec' }, h('h3', {}, 'Then'),
      field('Sets flag', line('setsFlag', 'e.g. door_open', 'A story flag other hotspots and conversations can check', flagName)),
      field('', check('vanishes (picked up, used up)', !!q.vanish, on('vanish', true))),
      field('Sound', select([['', 'None'], ...Ls.sounds, ['+', '+ Make a sound…']], q.sound || '', async v => { if (v === '+') { q.sound = await x.makeSound() || ''; } else q.sound = v; x.changed(true); }), 'Played when used'),
      field('Logic', h('input', { type: 'text', value: q.message || '', placeholder: 'message name', title: 'Sent to Logic graphs: "When a message arrives"', onchange: e => { q.message = e.target.value.trim(); x.changed(); } }), 'For anything else: a Logic graph hears it')),
    h('div', { class: 'sec' }, h('h3', {}, 'Story'),
      field('Only when', line('when', 'flag', 'Only here while this flag is set (e.g. an open door)', flagName)),
      field('Gone when', line('unless', 'flag', 'Gone once this flag is set (e.g. the closed door)', flagName))),
    h('div', { class: 'sec' }, h('h3', {}, 'Shows'),
      field('', select([['', 'Nothing (it is in the background)'], ...Ls.actors.map(a => ['actor:' + a, 'Actor: ' + a]), ...Ls.pictures.map(p => ['picture:' + p, 'Picture: ' + p.split('/').pop()])],
        shows.kind ? `${shows.kind}:${shows.name || shows.path}` : '', v => { const [k, ...rest] = v.split(':'), n = rest.join(':'); q.shows = !k ? {} : k === 'actor' ? { kind: 'actor', name: n, flip: !!shows.flip } : { kind: 'picture', path: n }; x.changed(true); }),
        'Stands at the bottom of the shape; hidden with the hotspot'),
      shows.kind === 'actor' ? field('', check('faces left', !!shows.flip, v => { q.shows.flip = v; x.changed(true); })) : '',
      shows.kind === 'picture' ? field('Size', range(shows.scale || 1, .1, 2, .05, v => { q.shows.scale = v; x.changed(); }, v => Math.round(v * 100) + '%')) : '',
      h('p', { class: 'note' }, `The hero walks to the white "stand" mark first (${standOf(q).join(', ')}): drag it.`)));
}
