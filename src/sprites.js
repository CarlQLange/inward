const paint = (rows, colours) => {
  const h = rows.length
  const w = rows[0].length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (!colours[c]) return
    ctx.fillStyle = colours[c]
    ctx.fillRect(x, y, 1, 1)
  }))
  return canvas
}

const ASH = [
  '........', '..c.....', '.....c..', '........',
  '...b....', '.c...b..', '........', '..b...c.',
]

const FLAMES = [
  ['...f....', '..ff..f.', '..fgf.f.', '.fggffg.', '.fgyggf.', 'ffgyyggf', 'fggyyggf', 'ffggggff'],
  ['.....f..', '.f..ff..', '.ff.fgf.', '.fgffgf.', 'fggggyf.', 'fgyygyff', 'fgyyyggf', 'ffggggff'],
  ['..f.....', '..ff..f.', '.fgf.ff.', '.fgffgf.', '.fgggygf', 'ffgyyygf', 'fggyyggf', 'ffggggff'],
]

const HEART = ['.gg.gg.', 'ggggggg', 'ggggggg', '.ggggg.', '..ggg..', '...g...']

const TILE_INDEX = {
  rock: [0, 1], brick: [12], moss: [2], peat: [3], wood: [4], metal: [5], scrap: [6],
  bedrock: [7], sand: [8], volatile: [9], gate: [11], ice: [15],
}
const ICON_INDEX = {
  icons: { bolt: 0, repel: 1, ember: 2, spring: 3, seed: 4, hammer: 5, gust: 6, frost: 7, acid: 8, bomb: 9, coin: 10, heart: 11, rift: 15 },
  icons2: { blink: 0, grapple: 1, dash: 2, rewind: 3, mason: 4, melt: 5, alchemy: 6, well: 7, swap: 8, stop: 9, charm: 10, decoy: 11, drone: 12, rod: 13, mine: 14, roar: 15 },
  icons3: { mirror: 0, echo: 1, pact: 2, fireboots: 3, rubber: 4, gills: 5, springs: 6, claws: 7, feather: 8, coinmagnet: 9, sack: 10, hands: 11, battery: 12, plate: 13, phoenix: 14, incendiary: 15 },
  icons4: { shock: 0, frostshot: 1, pierce: 2, spread: 3, ricochet: 4, stomp: 5, chest: 6, altar: 7, gem: 8, skull: 9, crown: 10, acidskull: 11, wind: 12, dice: 13, eye: 14, chain: 15 },
}

const SIGN_NAMES = [
  'cause_fire', 'cause_lava', 'cause_acid', 'cause_charge', 'cause_smoke', 'cause_crushed', 'cause_bitten', 'cause_shot',
  'omen_tinder', 'omen_deluge', 'omen_blackout', 'omen_rust', 'omen_bloom', 'omen_swarm', 'omen_moon', 'omen_midas', 'omen_glass',
  'map_skull', 'seal', 'seal_broken', 'map_core', 'almanac', 'discovery',
]

const REGION_NAMES = ['moss', 'drowned', 'peat', 'workings', 'foundry', 'ice', 'crystal', 'core']

const loadImage = src => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = src
})

const cutTile = (atlas, index, size) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(atlas, (index % 4) * size, Math.floor(index / 4) * size, size, size, 0, 0, size, size)
  return canvas
}

const cutBox = (atlas, [x, y, w, h]) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(atlas, x, y, w, h, 0, 0, w, h)
  return canvas
}

const flipped = source => {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  ctx.scale(-1, 1)
  ctx.drawImage(source, -source.width, 0)
  return canvas
}

export const paintFrames = (rows, colours) => {
  const sprite = paint(rows, colours)
  return [sprite, flipped(sprite)]
}

export const SPRITES = {
  tiles: {},
  extra: {},
  creatures: [],
  cast: {},
  regions: {},
  icons: {},
  ash: paint(ASH, { b: '#5a5a52', c: '#8a8a80' }),
  flames: FLAMES.map(rows => paint(rows, { f: '#d9531c', g: '#ff9a2e', y: '#ffe84a' })),
  heart: paint(HEART, { g: '#76d648' }),
  heartEmpty: paint(HEART, { g: '#26542a' }),
}

let castAliases = {}

const castEntry = kind => SPRITES.cast[castAliases[kind] ?? kind]

export const creatureFrames = kind => castEntry(kind)?.frames ?? []

export const creatureAnchor = kind => castEntry(kind)?.anchor ?? 'ground'

export const creatureSize = kind => {
  const [first] = creatureFrames(kind)
  return first ? { w: first[0].width, h: first[0].height } : { w: 0, h: 0 }
}

export const regionTiles = region => SPRITES.regions[typeof region === 'number' ? REGION_NAMES[region] : region] ?? []

const loadCast = async () => {
  const [atlas, { aliases, creatures }] = await Promise.all([
    loadImage('assets/cast.png'),
    fetch('assets/cast.json').then(response => response.json()),
  ])
  castAliases = aliases
  SPRITES.cast = Object.fromEntries(Object.entries(creatures).map(([kind, { anchor, frames }]) => [kind, {
    anchor,
    frames: frames.map(box => {
      const sprite = cutBox(atlas, box)
      return [sprite, flipped(sprite)]
    }),
  }]))
}

export const loadSprites = async () => {
  const sheets = ['tiles', 'tiles2', 'signs', 'creatures', 'creatures2', 'icons', 'icons2', 'icons3', 'icons4']
  const loaded = Object.fromEntries(await Promise.all(sheets.map(async name => [name, await loadImage(`assets/${name}.png`)])))
  const { tiles, creatures, creatures2 } = loaded
  for (const [name, indices] of Object.entries(TILE_INDEX)) {
    SPRITES.tiles[name] = indices.map(i => cutTile(tiles, i, 8))
  }
  SPRITES.extra.bones = cutTile(tiles, 13, 8)
  SPRITES.extra.fungus = cutTile(tiles, 14, 8)
  SPRITES.extra.charred = cutTile(tiles, 10, 8)
  SPRITES.extra.brick = cutTile(tiles, 12, 8)
  SPRITES.extra.ice = cutTile(tiles, 15, 8)
  SPRITES.extra.crystal = cutTile(tiles, 9, 8)
  SPRITES.creatures = [creatures, creatures2].flatMap(sheet => Array.from({ length: 16 }, (_, i) => {
    const sprite = cutTile(sheet, i, 28)
    return [sprite, flipped(sprite)]
  }))
  for (const [sheet, names] of Object.entries(ICON_INDEX)) {
    for (const [name, index] of Object.entries(names)) SPRITES.icons[name] = cutTile(loaded[sheet], index, 16)
  }
  SIGN_NAMES.forEach((name, index) => { SPRITES.icons[name] = cutTile(loaded.signs, index, 16) })
  REGION_NAMES.forEach((name, index) => {
    SPRITES.regions[name] = [cutTile(loaded.tiles2, index * 2, 8), cutTile(loaded.tiles2, index * 2 + 1, 8)]
  })
  await loadCast()
}
