// Sparks for when you are stuck: questions to think about per section, themes to pick from, what games of a genre
// usually have, a dice roll for a game idea and a maker for names that sound like one place. All offline, all data.

export const QUESTIONS = {
  pitch: ['What is the one moment someone will tell their friend about?', 'If the game had a three-word poster, what would it say?',
    'Which game would your player have just finished before finding yours?', 'What does your game do that you have never seen done?',
    'Why make this game now, and why you?', 'What feeling should the first five minutes leave?', 'What would a perfect review of it say in one line?',
    'What would you cut first if you had half the time?', 'What is the smallest version of this that would still be fun?', 'Who is it NOT for?'],
  story: ['What does the hero want, and what do they actually need?', 'What has the hero lost before the game begins?', 'Who is hurt if the hero fails?',
    'What is the lie the villain believes?', 'What does the player learn about the world that the hero already knew?', 'Where is the midpoint twist?',
    'What does the ending cost?', 'Which scene would you cut last?', 'What question should the player still argue about after the end?',
    'What is the story without any words: only places and enemies?'],
  world: ['What is wrong with this world, and since when?', 'Who is in charge, and who wants them gone?', 'What do ordinary people eat, fear and pray to?',
    'What is the oldest thing in the world, and is it still there?', 'What was here before the current ruins?', 'What is forbidden, and who does it anyway?',
    'Which place would a player draw from memory?', 'What does money look like here?', 'What sound is always in the background?',
    'What is a rumour everyone believes that is not true?'],
  cast: ['What does each character want in their first scene?', 'Who lies, and about what?', 'Which character would the player miss?',
    'What does the villain think they are saving?', 'Who knows more than they say?', 'Which two characters should never meet, and what if they do?',
    'How does each one say "no"?', 'What does the hero do that only they would do?', 'Who is the player\'s first friend?', 'Who changes, and who refuses to?'],
  play: ['What is the one verb the whole game is built on?', 'What does the player do in the first 30 seconds?', 'What makes a fight hard but fair?',
    'What makes the player say "one more try"?', 'What new thing appears every few minutes?', 'How does the player know they got better?',
    'What does failing cost, and is it worth it?', 'What can the player do that enemies can too?', 'What would a speedrunner love?',
    'Which mechanic could you cut without losing the game?'],
  levels: ['Where does the first level teach without words?', 'Which level is the quiet one?', 'Where does the player see somewhere they cannot reach yet?',
    'What is the surprise in each level?', 'Where can the player rest?', 'Which shortcut feels best to open?', 'Which level is the hardest, and is it near the end?',
    'What does each level look and sound like in one word?', 'How does the player know where to go?', 'Which level would you show in a trailer?'],
  look: ['What three colours are this game?', 'Where does the light come from?', 'What is the silhouette of the hero against every background?',
    'What should never be in the picture?', 'Which old game does the art remember?', 'How does the screen show danger?',
    'What does the music do when nothing happens?', 'What does a hit sound like?', 'What is the loudest moment in the game?', 'What is the quietest?'],
  plan: ['What is the first thing someone else could play?', 'What could you finish this month?', 'What is the riskiest part, and can you test it first?',
    'What will you not make (no matter how tempting)?', 'Who will play it before it is finished?', 'What does "done" look like?',
    'Where will people find it: itch.io, Steam, a jam?', 'What would make you stop, and how do you avoid it?', 'What is the trailer\'s first shot?',
    'How many levels, enemies and bosses, really?'],
  notes: ['What did you think of in the shower?', 'What have you been avoiding deciding?', 'What would make this weirder?'],
};

// [theme, what it asks]
export const THEMES = [
  ['Debt', 'what is owed, and who collects'], ['Decay', 'everything rots: what is worth keeping?'], ['Faith', 'what you believe when it costs you'],
  ['Guilt', 'something done that cannot be undone'], ['Home', 'losing it, finding it, making it'], ['Memory', 'what we keep, what we forget, what we invent'],
  ['Power', 'who has it, what it does to them'], ['Sacrifice', 'what you give up for others'], ['Isolation', 'alone, and what that does'],
  ['Revenge', 'the wound and the cost of answering it'], ['Family', 'the one you are born into, the one you choose'], ['Identity', 'who you are when nobody tells you'],
  ['Corruption', 'small compromises that add up'], ['Hope', 'reasons to keep going in a ruined place'], ['Freedom', 'what it costs and who pays'],
  ['Death', 'mortality, grief, what comes after'], ['Obsession', 'wanting one thing too much'], ['Nature vs. machine', 'what is grown and what is built'],
  ['Order vs. chaos', 'rules that protect and rules that choke'], ['Inheritance', 'what the past leaves you, wanted or not'], ['Trust', 'who to believe, and why'],
  ['Redemption', 'earning back what was lost'], ['Greed', 'more, and what it eats'], ['Fear', 'what we do to not feel it'],
  ['Hunger', 'need, and what it makes people do'], ['Exile', 'being cast out, and coming back'], ['Ritual', 'habits that hold a world together'],
  ['Truth', 'hidden, bent, or too heavy to carry'], ['Growing up', 'leaving childhood behind'], ['Duty', 'what you must do vs. what you want'],
  ['Madness', 'when the mind is the dungeon'], ['Survival', 'living through it at any price'], ['Legacy', 'what remains after you'],
  ['Transformation', 'becoming something else'], ['Loneliness of power', 'the higher you climb, the fewer you trust'], ['Small kindness', 'tiny acts in a cruel world'],
];

// what a game of each genre usually has: [genre, [[thing, why]]]
export const GENRES = [
  ['Platformer', [['Tight jump', 'variable height, coyote time, jump buffering'], ['Hazards', 'spikes, pits, moving blades'], ['Collectibles', 'something to find off the main path'],
    ['Checkpoints', 'short distances between tries'], ['Moving platforms', 'timing and rhythm'], ['A new idea per level', 'each level teaches one twist']]],
  ['Metroidvania', [['Ability gates', 'doors that open with a new power'], ['A map', 'rooms revealed as you go'], ['Shortcuts', 'one-way doors that loop back'],
    ['Save rooms', 'safe places between dangers'], ['Backtracking rewards', 'old places, new paths'], ['Upgrades', 'health and power found in the world'], ['Bosses as gates', 'a fight before each new region']]],
  ['Soulslike', [['Stamina', 'every action costs'], ['Lose your souls', 'drop currency on death, get it back'], ['Bonfires', 'rest, respawn the enemies'],
    ['Readable enemies', 'wind-ups you learn'], ['Item lore', 'the story told in item text'], ['Hard bosses', 'patterns, phases, arenas']]],
  ['Roguelike', [['Random rooms', 'a new layout each run'], ['Run upgrades', 'pick one of three'], ['Meta progress', 'unlocks that last between runs'],
    ['Short runs', '15 to 40 minutes'], ['Synergies', 'items that combine'], ['Death as teacher', 'every run shows something new']]],
  ['Top-down adventure', [['Dungeons', 'a key, a lock, a boss'], ['Tools as keys', 'bombs, hookshot, lamp'], ['Overworld', 'places between dungeons'],
    ['Hearts', 'health found and earned'], ['Secrets', 'walls that crack, caves behind waterfalls'], ['NPC hints', 'people who point the way']]],
  ['Puzzle platformer', [['One rule', 'a single mechanic explored fully'], ['No fail cost', 'restart instantly'], ['Aha moments', 'the solution is in the room'],
    ['Teach, test, twist', 'each idea in three steps'], ['Optional hard rooms', 'for players who want more']]],
  ['Action / beat \'em up', [['Combos', 'moves that chain'], ['Crowds', 'several enemies at once'], ['Grabs and throws', 'use enemies as weapons'],
    ['Weapons on the ground', 'pick up, use, drop'], ['Score', 'style and speed rewarded']]],
  ['Shoot \'em up', [['Bullet patterns', 'readable, beautiful, dangerous'], ['Power-ups', 'spread, laser, options'], ['Bombs', 'clear the screen in a pinch'],
    ['Score chaining', 'reward risky play'], ['Bosses with phases', 'patterns change as they break']]],
];

// the dice: a game idea in one sentence
const HEROES = ['a disgraced bell-ringer', 'a retired monster hunter', 'a child made of clay', 'the last lamplighter', 'a thief with a borrowed face', 'a knight who cannot die',
  'a gravedigger\'s apprentice', 'a lost courier', 'a witch without magic', 'a broken automaton', 'a plague doctor', 'a runaway acolyte', 'a smuggler\'s daughter', 'a drowned sailor'];
const PLACES = ['a drowned cathedral', 'a city built on a sleeping giant', 'a mine that goes down forever', 'a carnival that never closes', 'an orbiting monastery',
  'a forest that eats the roads', 'a prison inside a clock', 'a sunken library', 'a village under endless snow', 'a tower of stacked houses', 'a swamp of old battlefields', 'a train that never stops'];
const WANTS = ['to silence the bells', 'to find their stolen name', 'to bury a god', 'to bring back the sun', 'to pay an impossible debt', 'to get home before dawn',
  'to break a curse they started', 'to deliver one last letter', 'to wake the sleeping king', 'to escape their own legend', 'to feed the town one more winter'];
const TWISTS = ['but every death rewinds the city one hour', 'but the monsters are the townsfolk at night', 'but their shadow fights back', 'but light itself is running out',
  'but the map rearranges itself', 'but every ally asks a price', 'but they are the villain of an older story', 'but the weapon is a lantern', 'but sound wakes the dead',
  'but the world is a painting that is drying'];
const pick = a => a[Math.floor(Math.random() * a.length)];
export function rollIdea() { const who = pick(HEROES); return `${who[0].toUpperCase()}${who.slice(1)} in ${pick(PLACES)} wants ${pick(WANTS)}, ${pick(TWISTS)}.`; }

// names that sound like they come from one place: syllables of a flavour
const FLAVOURS = {
  Gothic: [['Vel', 'Mor', 'Ash', 'Grav', 'Sor', 'Cal', 'Dra', 'Neth', 'Ul', 'Bel'], ['a', 'e', 'o', 'i', 'ae', 'y'], ['moor', 'grave', 'thorn', 'reach', 'mire', 'holm', 'cairn', 'wick', 'mourne', 'vault']],
  Northern: [['Hal', 'Thor', 'Sig', 'Bjor', 'Ulf', 'Eir', 'Ska', 'Fen', 'Rag', 'Grim'], ['a', 'i', 'e', 'o'], ['heim', 'fjord', 'gard', 'vik', 'stad', 'mark', 'holt', 'by']],
  Desert: [['Kha', 'Zar', 'Am', 'Sul', 'Tam', 'Nef', 'Ir', 'Qa', 'Sah', 'Rak'], ['a', 'i', 'u', 'ee'], ['dun', 'zar', 'kesh', 'rah', 'mir', 'ab', 'tem', 'sut']],
  Fae: [['Lys', 'Eil', 'Wyn', 'Fae', 'Thal', 'Mire', 'Syl', 'Aru', 'Ninn', 'Ola'], ['a', 'ie', 'ia', 'e', 'ae'], ['wyn', 'dell', 'thir', 'lune', 'vale', 'riel', 'sae', 'mere']],
  Machine: [['Kor', 'Vex', 'Tal', 'Zen', 'Rho', 'Cy', 'Ox', 'Ter', 'Nul', 'Ix'], ['-', 'o', 'a', 'i', ''], ['9', 'tek', 'core', 'grid', 'nex', 'plex', 'trax', 'on', 'ium']],
};
export const FLAVOUR_NAMES = Object.keys(FLAVOURS);
export function makeNames(flavour, n = 8) {
  const [a, b, c] = FLAVOURS[flavour] || FLAVOURS.Gothic, out = new Set();
  while (out.size < n) { const s = pick(a) + (Math.random() < .5 ? pick(b) : '') + pick(c); out.add(s[0].toUpperCase() + s.slice(1).toLowerCase()); }
  return [...out];
}
