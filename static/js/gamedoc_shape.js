// What a game doc holds: its sections and the parts of each. A part is
//   ['text', key, label, hint, rows]          a piece of writing
//   ['list', key, label, hint, fields]        entries (name + text, optionally a link to a level/scene, a done tick)
//   ['themes', key, label, hint]              theme tags (picked from the Themes spark or typed)
//   ['facts', kind, label, hint]              read from the game itself: cast, enemies, controls, levels, systems, look
//   ['keyart', key, label, hint]              a picture for the pitch: a scene, an actor or any image
// Keys are stored as "<section>.<key>" in the doc (gamedoc.js). Changing a label is safe; changing a key loses its text.

export const SECTIONS = [
  { id: 'pitch', title: 'Pitch', blurb: 'The game in a minute: what you say when someone asks "what are you making?"', parts: [
    ['text', 'title', 'Title', 'The name on the box', 1],
    ['text', 'logline', 'Logline', 'One sentence: who wants what, against what. "A disgraced bell-ringer climbs a drowned cathedral to silence the bells that woke the dead."', 2],
    ['text', 'genre', 'Genre', 'e.g. gothic action platformer, metroidvania, cosy farming sim', 1],
    ['text', 'hook', 'The hook', 'What makes it different from every other game like it?', 3],
    ['text', 'compare', 'It is like…', '"Hollow Knight meets Castlevania", "Celeste with a shotgun"', 1],
    ['text', 'tone', 'Tone and mood', 'Three words, e.g. lonely, rotten, hopeful', 1],
    ['text', 'audience', 'Who it is for', 'Who would love this, and where do they play?', 2],
    ['list', 'pillars', 'Pillars', 'Three to five rules every choice must serve, e.g. "Every hit hurts", "The city is the puzzle"', ['name', 'text']],
    ['keyart', 'keyart', 'Key art', 'The picture at the top of the pitch'],
  ] },
  { id: 'story', title: 'Story', blurb: 'What happens, and what it is about underneath.', parts: [
    ['text', 'premise', 'Premise', 'The situation when the game begins', 3],
    ['list', 'beats', 'Beats', 'The big moments in order: the start, the turns, the end', ['name', 'text']],
    ['text', 'ending', 'Ending', 'How it ends (or the endings, if there are several)', 3],
    ['themes', 'themes', 'Themes', 'What it is about underneath: pick from the list on the right or type your own'],
  ] },
  { id: 'world', title: 'World & lore', blurb: 'Where it happens, who lives there and what came before. Your lore bible.', parts: [
    ['text', 'setting', 'Setting', 'Where and when: the place, its age, what is wrong with it', 4],
    ['list', 'places', 'Places', 'Regions, towns, dungeons: link them to your levels and scenes', ['name', 'text', 'link']],
    ['list', 'factions', 'Factions', 'Groups who want things: churches, guilds, gangs, monsters', ['name', 'text']],
    ['list', 'history', 'History', 'What happened before: one era or event each', ['name', 'text']],
    ['text', 'rules', 'How the world works', 'Magic, machines, gods, money: the rules and what they cost', 3],
    ['list', 'glossary', 'Words of the world', 'Names and terms only this world uses', ['name', 'text']],
  ] },
  { id: 'cast', title: 'Characters', blurb: 'Who is in it. Actors you made appear here by themselves.', parts: [
    ['facts', 'cast', 'Your actors', 'Everyone you made in Forge or Animate: what they want, what is wrong with them, how they talk'],
    ['list', 'people', 'More characters', 'People not drawn yet', ['name', 'text']],
  ] },
  { id: 'play', title: 'Mechanics', blurb: 'What the player does, and how the game answers.', parts: [
    ['text', 'loop', 'Core loop', 'What the player does over and over, e.g. explore → fight → find a key → open a shortcut', 2],
    ['list', 'verbs', 'Verbs', 'What the player can do: jump, attack, dash, talk…', ['name', 'text']],
    ['facts', 'controls', 'Controls', 'The keys and gamepad buttons your game uses (KilnInput)'],
    ['text', 'combat', 'Combat', 'How fights work: health, damage, knockback, bosses', 3],
    ['facts', 'enemies', 'Enemies', 'Your actors with an enemy, boss or flyer role'],
    ['list', 'items', 'Items', 'Pickups, keys, upgrades, money', ['name', 'text']],
    ['text', 'progress', 'Progression', 'How the player grows: abilities, upgrades, new areas', 3],
    ['text', 'fail', 'Failing and saving', 'What happens on death? Checkpoints? Saves?', 2],
    ['facts', 'systems', 'Rules in the game', 'Your Logic graphs and dialogues'],
  ] },
  { id: 'levels', title: 'Levels', blurb: 'Where the player goes, in what order, and how it feels.', parts: [
    ['facts', 'levels', 'Your levels', 'Every level you made in Levels, with notes'],
    ['list', 'flow', 'Order of play', 'The path through the game, area by area', ['name', 'text', 'link']],
    ['text', 'pacing', 'Pacing', 'Where it is quiet, where it is hard, where it surprises', 3],
  ] },
  { id: 'look', title: 'Look & sound', blurb: 'How it looks and sounds. The style bible and your scenes come in by themselves.', parts: [
    ['facts', 'look', 'Style', 'From the style bible (top bar) and your scenes'],
    ['text', 'art', 'Art direction', 'Shapes, light, colour, references', 3],
    ['text', 'music', 'Music', 'Instruments, mood, references', 2],
    ['text', 'sound', 'Sound', 'How things should sound', 2],
  ] },
  { id: 'plan', title: 'Plan', blurb: 'How big it is and how it gets finished.', parts: [
    ['text', 'scope', 'Scope', 'How big: hours of play, levels, enemies, bosses', 2],
    ['list', 'milestones', 'Milestones', 'Steps to a finished game; tick them off', ['name', 'text', 'done']],
    ['list', 'risks', 'Risks', 'What could sink it, and what you will do about it', ['name', 'text']],
    ['list', 'questions', 'Open questions', 'Things not decided yet', ['name', 'text']],
  ] },
  { id: 'notes', title: 'Notes', blurb: 'Anything else: scraps, links, ideas for later.', parts: [
    ['text', 'notes', 'Notes', 'Anything', 14],
  ] },
];

// how much of a section is written: [parts with something in them, parts that can be written]
export function filled(sec, doc) {
  const own = sec.parts.filter(p => p[0] === 'text' || p[0] === 'list' || p[0] === 'themes');
  const has = own.filter(([kind, key]) => { const v = doc.v[`${sec.id}.${key}`]; return kind === 'text' ? !!v?.trim() : !!v?.length; });
  return [has.length, own.length];
}
