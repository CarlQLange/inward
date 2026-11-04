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
const CROUCH = [
  '...WW...', '..WWWW..', '..WKKW..', '..WWWW..', '.WWWWWW.',
  'W.WWWW.W', '.WW..WW.', '.WW..WW.', '........',
]
const WHITE = { W: '#f4f8f2', K: '#10181a' }
const HEART = ['.gg.gg.', 'ggggggg', 'ggggggg', '.ggggg.', '..ggg..', '...g...']

const TILE_INDEX = {
  rock: [0, 1, 0, 1, 12], moss: [2], peat: [3], wood: [4], metal: [5], scrap: [6],
  bedrock: [7], sand: [8], volatile: [9], gate: [11], ice: [15],
}
const ICON_INDEX = {
  bolt: 0, repel: 1, ember: 2, frost: 7, hammer: 5, gust: 6, coin: 10, heart: 11, bomb: 9, rift: 15,
}

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

const flipped = source => {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext('2d')
  ctx.scale(-1, 1)
  ctx.drawImage(source, -source.width, 0)
  return canvas
}

export const SPRITES = {
  tiles: {},
  extra: {},
  creatures: [],
  icons: {},
  ash: paint(ASH, { b: '#5a5a52', c: '#8a8a80' }),
  flames: FLAMES.map(rows => paint(rows, { f: '#d9531c', g: '#ff9a2e', y: '#ffe84a' })),
  player: {
    ...Object.fromEntries(Object.entries(LEGS).map(([name, legs]) => [name, pair([...PLAYER_TOP, ...legs], WHITE)])),
    crouch: pair(CROUCH, WHITE),
  },
  heart: paint(HEART, { g: '#76d648' }),
  heartEmpty: paint(HEART, { g: '#26542a' }),
}

export const loadSprites = async () => {
  const [tiles, creatures, icons] = await Promise.all(
    ['tiles', 'creatures', 'icons'].map(name => loadImage(`assets/${name}.png`)),
  )
  for (const [name, indices] of Object.entries(TILE_INDEX)) {
    SPRITES.tiles[name] = indices.map(i => cutTile(tiles, i, 8))
  }
  SPRITES.extra.bones = cutTile(tiles, 13, 8)
  SPRITES.extra.fungus = cutTile(tiles, 14, 8)
  SPRITES.creatures = Array.from({ length: 16 }, (_, i) => {
    const sprite = cutTile(creatures, i, 28)
    return [sprite, flipped(sprite)]
  })
  for (const [name, index] of Object.entries(ICON_INDEX)) SPRITES.icons[name] = cutTile(icons, index, 16)
}
