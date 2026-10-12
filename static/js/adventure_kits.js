// Point & click template kits: a whole small adventure as data (rooms, people, items, a puzzle chain, a talk, the
// flow), with its pictures in static/templates/<art>.webp (made once by tools/template_art.py; art.json keeps how each
// was described, so Kiln can make new ones). Positions are fractions of the room's size, so any picture size fits.
// templates.js builds a game from a kit; demo_paths.js is the other paths' templates.
// Hotspot: [name, title, [x0, y0, x1, y1], { look, does, text, item, needs, takes, setsFlag, when, unless, room, entry, dialogue, shows, stand }]

export const KITS = {
  lighthouse: {
    title: 'The Last Light', like: 'a cosy, quiet mystery', blurb: 'A keeper, a dark lighthouse, a key under the rug, a lamp with no oil and an old fisherman who has some.',
    menu: 'THE LAST LIGHT', end: 'The light shines again. Every boat comes home.',
    hero: { name: 'keeper', art: 'keeper' }, npcs: [{ name: 'tam', art: 'fisherman' }],
    items: [['key', 'Brass key', 'Warm from my pocket. It opens the lighthouse.', 'item_key'], ['lamp', 'Empty lamp', 'Not a drop of oil in it.', 'item_lamp'],
      ['oil', 'Lamp oil', 'Old Tam\'s last bottle.', 'item_oil'], ['lit_lamp', 'Lit lamp', 'It burns bright.', 'item_lit_lamp']],
    combos: [['lamp', 'oil', 'lit_lamp', 'The lamp burns bright.']],
    rooms: [
      { name: 'cottage', art: 'cottage', walk: [[.02, .8], [.98, .76], [1, 1], [0, 1]], depth: [.76, .85, 1, 1.05], entries: { start: [.22, .9], from_shore: [.84, .86] },
        hotspots: [
          ['window', 'Window', [.11, .06, .3, .45], { look: 'The sea is calm tonight. Too calm.', does: 'none' }],
          ['rug', 'Rug', [.17, .66, .8, .83], { look: 'A dusty old rug. Something makes a lump under it.', text: 'I lift the corner of the rug. A key!', setsFlag: 'rug_moved' }],
          ['key', 'Brass key', [.42, .72, .5, .8], { when: 'rug_moved', does: 'pick', item: 'key', text: 'The lighthouse key!', vanish: true, shows: 'item_key' }],
          ['lamp', 'Lamp', [.52, .4, .6, .52], { look: 'My old oil lamp.', does: 'pick', item: 'lamp', text: 'Empty. I need oil for it.', vanish: true, shows: 'item_lamp', stand: [.56, .84] }],
          ['door', 'Door', [.72, .03, .92, .66], { look: 'Out to the shore.', does: 'go', room: 'shore', entry: 'from_cottage', stand: [.82, .84] }]] },
      { name: 'shore', art: 'shore', walk: [[0, .82], [1, .82], [1, 1], [0, 1]], depth: [.82, .85, 1, 1.05], entries: { from_cottage: [.12, .9], start: [.12, .9] },
        hotspots: [
          ['sea', 'Sea', [.12, .55, .78, .78], { look: 'Somewhere out there, boats are waiting for the light.', does: 'none' }],
          ['cottage', 'Cottage', [0, .3, .1, .82], { look: 'Home.', does: 'go', room: 'cottage', entry: 'from_shore', stand: [.1, .9] }],
          ['tam', 'Old Tam', [.44, .55, .56, .95], { look: 'Old Tam. He knows everybody\'s business.', does: 'talk', dialogue: 'tam', shows: 'npc:tam', stand: [.36, .93] }],
          ['door_shut', 'Lighthouse door', [.84, .6, .89, .76], { look: 'The lighthouse. Locked.', unless: 'lighthouse_open', needs: 'key', takes: true, setsFlag: 'lighthouse_open', lockedText: 'Locked. The key is somewhere at home.', text: 'The key turns. The door creaks open.', stand: [.86, .88] }],
          ['lighthouse', 'Lighthouse', [.84, .6, .89, .76], { look: 'Dark as a well inside.', when: 'lighthouse_open', needs: 'lit_lamp', lockedText: 'It\'s pitch black in there. I need a light.', does: 'leave', text: 'Up the stairs I go.', stand: [.86, .88] }]] }],
    talks: { tam: { cast: [['Old Tam', 'tam']], beats: [['Old Tam', 'Evening, keeper. The light\'s gone out again.'],
      ['Old Tam', 'What do you need?', [['Have you any lamp oil?', 3, { noflag: 'got_oil' }], ['Nothing. Goodnight, Tam.', 'end']]],
      ['Old Tam', 'My last bottle. Get that light burning, or the boats won\'t make it home.', null, [['give', 'oil'], ['flag', 'got_oil']]]] } },
  },
  starjanitor: {
    title: 'Star Janitor', like: 'a late-80s sci-fi comedy (think Space Quest)', blurb: 'A janitor locked in a supply closet, a vending machine that sells the wrong things, a pompous alien captain and a self-destruct countdown.',
    menu: 'STAR JANITOR', end: 'Snip. The countdown stops. The janitor saves the galaxy, again. Nobody notices.',
    hero: { name: 'janitor', art: 'sj_hero' }, npcs: [{ name: 'captain', art: 'sj_captain' }],
    items: [['coin', 'Alien coin', 'Currency of nine planets. Smells of mop water.', 'sj_coin'], ['keycard', 'Keycard', 'Says CAPTAIN. Somebody will want this back.', 'sj_keycard'],
      ['cutters', 'Wire cutters', 'Red handles. Red wire. Coincidence?', 'sj_cutters']],
    combos: [],
    rooms: [
      { name: 'closet', art: 'sj_closet', walk: [[0, .84], [1, .84], [1, 1], [0, 1]], depth: [.84, .9, 1, 1.05], entries: { start: [.33, .93], from_bridge: [.8, .93] },
        hotspots: [
          ['bucket', 'Mop bucket', [.1, .6, .28, .84], { look: 'Grey water. Something glints at the bottom.', does: 'pick', item: 'coin', text: 'Eugh. A coin!', setsFlag: 'fished', unless: 'fished' }],
          ['vending', 'Vending machine', [.37, .1, .59, .78], { look: 'Space snacks. And, somehow, keycards.', needs: 'coin', takes: true, does: 'pick', item: 'keycard', lockedText: 'Exact change only.', text: 'Clunk. A keycard? Who stocks these?', setsFlag: 'bought' }],
          ['door_shut', 'Door', [.69, .1, .97, .85], { look: 'Locked from outside. Classic.', unless: 'door_open', needs: 'keycard', setsFlag: 'door_open', lockedText: 'It wants a keycard.', text: 'Beep. Whoosh.', stand: [.78, .92] }],
          ['door', 'Door', [.69, .1, .97, .85], { look: 'To the bridge.', when: 'door_open', does: 'go', room: 'bridge', entry: 'from_closet', stand: [.8, .93] }]] },
      { name: 'bridge', art: 'sj_bridge', walk: [[0, .82], [1, .82], [1, 1], [0, 1]], depth: [.82, .9, 1, 1.05], entries: { from_closet: [.08, .93], start: [.08, .93] },
        hotspots: [
          ['back', 'Closet', [0, .3, .05, .95], { look: 'Back to my closet.', does: 'go', room: 'closet', entry: 'from_bridge', stand: [.05, .93] }],
          ['screen', 'Viewscreen', [.08, .05, .92, .38], { look: 'Stars. Lots of them. All about to get a lot closer.', does: 'none' }],
          ['chair', 'Captain\'s chair', [.1, .4, .3, .9], { look: 'Still warm. Smells of cologne and fear.', does: 'none' }],
          ['console', 'Console', [.36, .45, .6, .75], { look: 'Blinking lights. One says DOOM.', does: 'none' }],
          ['captain', 'Captain', [.62, .45, .74, .95], { look: 'Captain Zorbulon. Three eyes, no ideas.', does: 'talk', dialogue: 'captain', shows: 'npc:captain', stand: [.56, .94] }],
          ['button', 'Self-destruct', [.79, .44, .93, .92], { look: 'SELF-DESTRUCT. Counting down. Of course it is.', needs: 'cutters', does: 'leave', lockedText: 'I can\'t just press it again. I need to cut a wire.', text: 'Red wire. Always the red wire.', stand: [.76, .94] }]] }],
    talks: { captain: { cast: [['Captain', 'captain']], beats: [['Captain', 'A JANITOR? On MY bridge? We are about to explode, you know.'],
      ['Captain', 'Well? Speak, mop-person.', [['I can fix the self-destruct.', 3, { noflag: 'got_cutters' }], ['Nice uniform.', 4]]],
      ['Captain', 'You? Fine. Take my lucky wire cutters. Do NOT cut the blue one.', 'end', [['give', 'cutters'], ['flag', 'got_cutters']]],
      ['Captain', 'I know. Gold trim. Now leave.', 'end']] } },
  },
  bayou: {
    title: 'Bayou Noir', like: 'an early-90s gothic mystery (think Gabriel Knight)', blurb: 'A bookshop owner, a torn note in an old symbol, a book that reads it, a priestess in a foggy cemetery and a tomb that should stay shut.',
    menu: 'BAYOU NOIR', end: 'The chalk snake glows. The tomb opens, and the real mystery begins…',
    hero: { name: 'gabe', art: 'bn_hero' }, npcs: [{ name: 'mambo', art: 'bn_priestess' }],
    items: [['book', 'Book of symbols', 'Old, leather, full of snakes and crosses.', 'bn_book'], ['note', 'Torn note', 'Symbols. I can\'t read them. Yet.', 'bn_note'],
      ['translated', 'Read note', 'The snake sign: the tomb of the serpent.', 'bn_translated'], ['chalk', 'White chalk', 'To draw a sign of my own.', 'bn_chalk']],
    combos: [['book', 'note', 'translated', 'The note matches a page in the book: the serpent\'s tomb.']],
    rooms: [
      { name: 'bookshop', art: 'bn_bookshop', walk: [[0, .86], [1, .86], [1, 1], [0, 1]], depth: [.86, .9, 1, 1.05], entries: { start: [.4, .93], from_cemetery: [.82, .93] },
        hotspots: [
          ['shelves', 'Bookshelves', [.02, .05, .34, .85], { look: 'Folklore, occult, a lot of dust.', does: 'pick', item: 'book', text: 'This one has the old symbols in it.', unless: 'got_book', setsFlag: 'got_book', stand: [.22, .93] }],
          ['newspaper', 'Newspaper', [.46, .5, .6, .6], { look: 'VOODOO MURDERS IN THE QUARTER. Again.', does: 'none' }],
          ['note', 'Torn note', [.62, .5, .68, .58], { look: 'A torn note under the lamp.', does: 'pick', item: 'note', text: 'Grandmother\'s handwriting…', vanish: true, shows: 'bn_note' }],
          ['door', 'Door', [.72, .05, .98, .88], { look: 'The Quarter, and beyond it the cemetery.', does: 'go', room: 'cemetery', entry: 'from_bookshop', stand: [.82, .93] }]] },
      { name: 'cemetery', art: 'bn_cemetery', walk: [[0, .84], [1, .84], [1, 1], [0, 1]], depth: [.84, .88, 1, 1.05], entries: { from_bookshop: [.07, .93], start: [.07, .93] },
        hotspots: [
          ['back', 'The Quarter', [0, .3, .05, .95], { look: 'Back to the shop.', does: 'go', room: 'bookshop', entry: 'from_cemetery', stand: [.05, .93] }],
          ['moon', 'Moon', [.68, .02, .82, .26], { look: 'Full moon. Of course.', does: 'none' }],
          ['tomb_left', 'Old tomb', [.12, .48, .25, .8], { look: 'LAVEAU, the name half worn away.', does: 'none' }],
          ['mambo', 'Priestess', [.26, .5, .36, .95], { look: 'She has been watching me since I came in.', does: 'talk', dialogue: 'mambo', shows: 'npc:mambo', stand: [.4, .94] }],
          ['tomb', 'Serpent tomb', [.42, .28, .63, .8], { look: 'A snake carved into the door.', needs: 'chalk', does: 'leave', lockedText: 'It won\'t budge. There must be a ritual to it.', text: 'I draw the serpent sign…', stand: [.52, .93] }]] }],
    talks: { mambo: { cast: [['Priestess', 'mambo']], beats: [['Priestess', 'You have your grandmother\'s eyes, child. What are you looking for?'],
      ['Priestess', 'Speak.', [['Show her the read note.', 3, { item: 'translated' }], ['Nothing. Just walking.', 4]]],
      ['Priestess', 'The serpent\'s tomb. Draw his sign on the door with this, and only if you are ready.', 'end', [['give', 'chalk'], ['flag', 'got_chalk']]],
      ['Priestess', 'Nobody just walks here at midnight.', 'end']] } },
  },
};
