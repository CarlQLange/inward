const paint = (rows, colours, flip = false) => {
  const h = rows.length
  const w = rows[0].length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (!colours[c]) return
    ctx.fillStyle = colours[c]
    ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1)
  }))
  return canvas
}

const pair = (rows, colours) => [paint(rows, colours), paint(rows, colours, true)]

const shaded = (dark, base, light) => ({ a: dark, b: base, c: light })

const ROCK_A = [
  'bbbbbbba', 'bcbbbbba', 'bbbbabba', 'bbbaabba',
  'bbabbbba', 'bbbbbcba', 'bbbbbbba', 'aaaaaaaa',
]
const ROCK_B = [
  'bbbabbba', 'bcbabbba', 'bbbbabba', 'aaabbbba',
  'bbbbbbba', 'bbcbbbba', 'bbbbbbba', 'aaaaaaaa',
]
const MOSS = [
  'ccbccbcc', 'cbbcbbba', 'bbbbabba', 'bbbaabba',
  'bbabbbba', 'bbbbbbba', 'bbbbbbba', 'aaaaaaaa',
]
const PEAT = [
  'bbbbabba', 'bcbbbbba', 'bbabbbba', 'bbbbbcba',
  'babbbbba', 'bbbbabba', 'bcbbbbba', 'aaaaaaaa',
]
const WOOD = [
  'abcbbcba', 'abcbbbba', 'abbbbcba', 'abcbbcba',
  'abcbbbba', 'abbbbcba', 'abcbbcba', 'abcbbbba',
]
const METAL = [
  'cccccccc', 'cabbbbab', 'cbbbbbbb', 'cbbbbbbb',
  'cbbbbbbb', 'cbbbbbbb', 'cabbbbab', 'cbbbbbba',
]
const GATE = [
  'abcabcab', 'abcabcab', 'abcabcab', 'abcabcab',
  'abcabcab', 'abcabcab', 'abcabcab', 'aaaaaaaa',
]
const BEDROCK = [
  'bbbbbbba', 'bbbbbbba', 'bbbbbbba', 'aaaaaaaa',
  'bbbabbbb', 'bbbabbbb', 'bbbabbbb', 'aaaaaaaa',
]
const SAND = [
  'bbcbbbbc', 'bbbbbabb', 'cbbbbbbb', 'bbbabbcb',
  'bbbbbbbb', 'bcbbbabb', 'bbbbbbbb', 'bbabbbcb',
]
const ASH = [
  '........', '..c.....', '.....c..', '........',
  '...b....', '.c...b..', '........', '..b...c.',
]

const FLAMES = [
  ['...f....', '..ff..f.', '..fgf.f.', '.fggffg.', '.fgyggf.', 'ffgyyggf', 'fggyyggf', 'ffggggff'],
  ['.....f..', '.f..ff..', '.ff.fgf.', '.fgffgf.', 'fggggyf.', 'fgyygyff', 'fgyyyggf', 'ffggggff'],
  ['..f.....', '..ff..f.', '.fgf.ff.', '.fgffgf.', '.fgggygf', 'ffgyyygf', 'fggyyggf', 'ffggggff'],
]

const PLAYER_TOP = [
  '...WW...', '..WWWW..', '..WKKW..', '..WWWW..', '...WW...',
  '.WWWWWW.', 'W.WWWW.W', 'W.WWWW.W', 'W.WWWW.W', '..WWWW..',
]
const LEGS = {
  stand: ['..W..W..', '..W..W..', '..W..W..', '..W..W..', '.WW..WW.', '........'],
  stepA: ['..W..W..', '.W....W.', '.W....W.', 'W......W', 'W.......', '........'],
  stepB: ['..W..W..', '..WW.W..', '...W.W..', '...WW...', '...WW...', '........'],
  jump: ['.WW..WW.', '.W....W.', '........', '........', '........', '........'],
}

const WHITE = { W: '#f4f8f2', K: '#10181a' }

const CROUCH = [
  '...WW...', '..WWWW..', '..WKKW..', '..WWWW..', '.WWWWWW.',
  'W.WWWW.W', '.WW..WW.', '.WW..WW.', '........',
]

const player = {
  ...Object.fromEntries(
    Object.entries(LEGS).map(([name, legs]) => [name, pair([...PLAYER_TOP, ...legs], WHITE)]),
  ),
  crouch: pair(CROUCH, WHITE),
}

const CRAWLER = [
  [
    '...bbbb...', '..bcbbbb..', '.bbkbbbbb.', '.bbbbbbbb.',
    '.bbbbbbbb.', 'b.b.bb.b.b', '.b..b...b.',
  ],
  [
    '...bbbb...', '..bcbbbb..', '.bbkbbbbb.', '.bbbbbbbb.',
    '.bbbbbbbb.', '.b.b..b.b.', 'b...b..b..',
  ],
]
const CRAWLER_C = { b: '#c9a24a', c: '#efd98a', k: '#10181a' }

const SPITTER = [
  '....bbbbbb....', '...bbbbbbbb...', '..bbbbbbbbbb..', '..bkkbbbbkkb..',
  '..bbbbbbbbbb..', '...bbffffbb...', '..bbbffffbbb..', '.bbbbbbbbbbbb.',
  '.b.bb.bb.bb.b.', 'b..b..b..b..b.',
]
const SPITTER_C = { b: '#c7825a', k: '#10181a', f: '#ff9a2e' }

const FISH = [
  ['....bbb...', 'b..bbbbb..', 'bbbbkbbbb.', 'bbbbbbbbb.', 'b..bbbbb..', '....bbb...'],
]
const FISH_C = { b: '#7fc9c0', k: '#10181a' }

const CARD = [
  'gggggggg', 'g......g', 'g...yy.g', 'g..yy..g', 'g.yyyy.g',
  'g..yy..g', 'g.yy...g', 'g.y....g', 'g......g', 'gggggggg',
]
const CARD_C = { g: '#76d648', y: '#ffe84a' }

const BOLT_ICON = [
  '...........yyyy.', '..........yyyy..', '.........yyyy...', '........yyyy....',
  '.......yyyy.....', '......yyyyyyyy..', '.....yyyyyyyy...', '.........yyy....',
  '........yyy.....', '.......yyy......', '......yyy.......', '.....yyy........',
  '....yy..........', '...yy...........', '..y.............', '................',
]

const HEART = ['.gg.gg.', 'ggggggg', 'ggggggg', '.ggggg.', '..ggg..', '...g...']

export const SPRITES = {
  tiles: {
    rock: [paint(ROCK_A, shaded('#2d3a16', '#5f7128', '#8a9c3e')), paint(ROCK_B, shaded('#2d3a16', '#5f7128', '#8a9c3e'))],
    moss: [paint(MOSS, shaded('#2d3a16', '#5f7128', '#a8c84a'))],
    peat: [paint(PEAT, shaded('#2f3618', '#556427', '#6f7d33'))],
    wood: [paint(WOOD, shaded('#3a2a14', '#7a5a2a', '#9d7a3e'))],
    metal: [paint(METAL, shaded('#2a2e30', '#70767a', '#a4a9ac'))],
    gate: [paint(GATE, shaded('#1c2022', '#70767a', '#b6bbbd'))],
    bedrock: [paint(BEDROCK, shaded('#111a16', '#27332b', '#27332b'))],
    sand: [paint(SAND, shaded('#8a7a44', '#c7b26a', '#e2d28c'))],
    ash: [paint(ASH, shaded('#000', '#5a5a52', '#8a8a80'))],
  },
  flames: FLAMES.map(rows => paint(rows, { f: '#d9531c', g: '#ff9a2e', y: '#ffe84a' })),
  player,
  crawler: CRAWLER.map(rows => pair(rows, CRAWLER_C)),
  spitter: pair(SPITTER, SPITTER_C),
  fish: FISH.map(rows => pair(rows, FISH_C)),
  card: paint(CARD, CARD_C),
  boltIcon: paint(BOLT_ICON, { y: '#ffe84a' }),
  heart: paint(HEART, { g: '#76d648' }),
  heartEmpty: paint(HEART, { g: '#26542a' }),
}
