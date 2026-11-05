import { BLOCK, ROOM } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { SPRITES } from './sprites.js'
import { drawText } from './font.js'
import { RELIC_BY_ID } from './relics.js'
import { THEMES } from './generate.js'
import { drawCreatures } from './creatures.js'

const GREEN = '#76d648'
const WHITE = '#f4f8f2'
const PALE = '#c9d4c0'
const YELLOW = '#ffe84a'
const MAGNET = '#6fd0ff'
const GAS = '#c79ae0'
const BACKGROUND = '#07100e'
const ROOM_PX = ROOM * BLOCK

const TILE = {
  [M.BEDROCK]: 'bedrock', [M.ROCK]: 'rock', [M.MOSS]: 'moss', [M.PEAT]: 'peat',
  [M.WOOD]: 'wood', [M.METAL]: 'metal', [M.GATE]: 'gate', [M.SAND]: 'sand',
  [M.SCRAP]: 'scrap', [M.VOLATILE]: 'volatile', [M.ICE]: 'ice', [M.BRICK]: 'brick', [M.SOURCE]: 'metal',
}

const hash = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 16) & 0xffff

const LOOKS = [
  { bg: '#07100e', speck: '#0f2218', tint: null, pattern: 'specks' },
  { bg: '#05101a', speck: '#0c2436', tint: 'rgba(40, 110, 170, 0.34)', pattern: 'drips' },
  { bg: '#120d06', speck: '#241a0c', tint: 'rgba(120, 80, 20, 0.34)', pattern: 'roots' },
  { bg: '#0b0d10', speck: '#1c2228', tint: 'rgba(120, 130, 150, 0.42)', pattern: 'grid' },
  { bg: '#150704', speck: '#2e0f08', tint: 'rgba(190, 60, 20, 0.4)', pattern: 'embers' },
  { bg: '#071218', speck: '#123040', tint: 'rgba(120, 210, 240, 0.4)', pattern: 'shards' },
  { bg: '#0e0616', speck: '#26103a', tint: 'rgba(150, 70, 210, 0.38)', pattern: 'shards' },
  { bg: '#10060c', speck: '#361026', tint: 'rgba(220, 50, 120, 0.3)', pattern: 'rings' },
]

const PATTERNS = {
  specks: (ctx, x, y) => {
    if (hash(x, y) % 5 === 0) ctx.fillRect(x * BLOCK + 2, y * BLOCK + 2, 3, 1)
    if (hash(y, x) % 7 === 0) ctx.fillRect(x * BLOCK + 5, y * BLOCK + 5, 1, 2)
  },
  drips: (ctx, x, y) => {
    if (hash(x, 3) % 4 === 0 && hash(x, y) % 3 !== 0) ctx.fillRect(x * BLOCK + 3, y * BLOCK, 1, 5)
  },
  roots: (ctx, x, y) => {
    if (hash(x, y) % 6 === 0) ctx.fillRect(x * BLOCK, y * BLOCK + 4, 8, 1)
    if (hash(y, x) % 6 === 0) ctx.fillRect(x * BLOCK + 4, y * BLOCK, 1, 8)
  },
  grid: (ctx, x, y) => {
    if (x % 4 === 0) ctx.fillRect(x * BLOCK, y * BLOCK, 1, 8)
    if (y % 4 === 0) ctx.fillRect(x * BLOCK, y * BLOCK, 8, 1)
    if (x % 4 === 0 && y % 4 === 0) ctx.fillRect(x * BLOCK - 1, y * BLOCK - 1, 3, 3)
  },
  embers: (ctx, x, y) => {
    if (hash(x, y) % 9 === 0) ctx.fillRect(x * BLOCK + 3, y * BLOCK + 2, 2, 2)
    if (y % 6 === 0) ctx.fillRect(x * BLOCK, y * BLOCK + 3, 8, 1)
  },
  shards: (ctx, x, y) => {
    if (hash(x, y) % 8 !== 0) return
    for (let i = 0; i < 5; i++) ctx.fillRect(x * BLOCK + i, y * BLOCK + 4 - i, 1, i * 2 + 1)
  },
  rings: (ctx, x, y) => {
    const d = Math.round(Math.hypot(x - 13.5, y - 13.5))
    if (d % 3 === 0) ctx.fillRect(x * BLOCK + 2, y * BLOCK + 2, 3, 3)
  },
}

const blank = (w, h) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

const makeBackdrop = ({ bg, speck, pattern }) => {
  const canvas = blank(ROOM_PX, ROOM_PX)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, ROOM_PX, ROOM_PX)
  ctx.fillStyle = speck
  for (let y = 0; y < ROOM; y++) for (let x = 0; x < ROOM; x++) PATTERNS[pattern](ctx, x, y)
  return canvas
}

const backdrops = LOOKS.map(makeBackdrop)
const tinted = LOOKS.map(() => new Map())

const tintTile = (theme, tile) => {
  const { tint } = LOOKS[theme]
  if (!tint) return tile
  const cache = tinted[theme]
  if (!cache.has(tile)) {
    const canvas = blank(tile.width, tile.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(tile, 0, 0)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, tile.width, tile.height)
    cache.set(tile, canvas)
  }
  return cache.get(tile)
}

const TINTED_TILES = new Set(['rock', 'bedrock', 'brick'])

const tileFor = (name, x, y, depth, skin) => {
  const h = hash(x, y)
  if (name === 'rock') {
    if (skin && h % 5 !== 0) return SPRITES.extra[skin]
    if (depth > 0.5 && h % 6 === 0) return SPRITES.extra.fungus
    if (h % 13 === 0) return SPRITES.extra.bones
  }
  const set = SPRITES.tiles[name]
  return set[h % set.length]
}

const isBuried = (world, x, y) =>
  [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    .every(([dx, dy]) => props(matAt(world, x + dx, y + dy)).solid)

const SCORCH_RADII = [7, 12, 18]

const scorchMark = SCORCH_RADII.map(radius => {
  const size = radius * 2 + 1
  const canvas = blank(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(6, 6, 5, 0.92)'
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - radius, y - radius) / radius
      const solid = d < 0.45
      const fringe = d < 1 && (x + y) % 2 === 0 && hash(x, y) % 100 > d * 90
      if (solid || fringe) ctx.fillRect(x, y, 1, 1)
    }
  }
  return canvas
})

const paintScorch = (ctx, world) => {
  ctx.globalCompositeOperation = 'source-atop'
  for (const { x, y, size } of world.scorches ?? []) {
    const mark = scorchMark[size] ?? scorchMark[0]
    ctx.drawImage(mark, x - Math.floor(mark.width / 2), y - Math.floor(mark.height / 2))
  }
  ctx.globalCompositeOperation = 'source-over'
}

const paintSolids = (ctx, world, depth, skin, theme) => {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(backdrops[theme], 0, 0)
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m === M.ASH) ctx.drawImage(SPRITES.ash, x * BLOCK, y * BLOCK)
      const name = TILE[m]
      if (!name) continue
      const tile = tileFor(name, x, y, depth, skin)
      ctx.drawImage(TINTED_TILES.has(name) ? tintTile(theme, tile) : tile, x * BLOCK, y * BLOCK)
      if (isBuried(world, x, y)) {
        ctx.fillStyle = 'rgba(5, 12, 10, 0.72)'
        ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      }
    }
  }
  paintScorch(ctx, world)
}

const cache = { canvas: blank(ROOM_PX, ROOM_PX), mat: new Uint8Array(ROOM * ROOM), world: null, key: '' }

const drawSolids = (ctx, world, depth, skin, theme) => {
  const key = `${theme}|${depth > 0.5}|${skin}|${world.scorches?.length ?? 0}`
  const stale = cache.world !== world || cache.key !== key || !world.mat.every((m, i) => m === cache.mat[i])
  if (stale) {
    paintSolids(cache.canvas.getContext('2d'), world, depth, skin, theme)
    cache.world = world
    cache.key = key
    cache.mat.set(world.mat)
  }
  ctx.drawImage(cache.canvas, 0, 0)
}

const LIQUID = {
  [M.WATER]: { body: 'rgba(14, 70, 88, 0.8)', deep: 'rgba(8, 40, 60, 0.45)', top: '#7fdce6', crest: '#d8f8ff' },
  [M.OIL]: { body: 'rgba(40, 22, 48, 0.94)', deep: 'rgba(14, 6, 20, 0.5)', top: '#a06ab0', crest: '#e6b8f0' },
  [M.LAVA]: { body: '#d9481c', deep: '#a82a10', top: '#ffd24a', crest: '#fff6c0' },
  [M.ACID]: { body: 'rgba(84, 186, 36, 0.88)', deep: 'rgba(40, 120, 20, 0.5)', top: '#c8ff5a', crest: '#f0ffc0' },
}

const rippleLift = (ripples, px, py, time) => {
  let lift = 0
  for (const r of ripples) {
    if (Math.abs(r.y - py) > 12) continue
    const d = Math.abs(px - r.x)
    const front = r.age * 60
    if (d > front + 4) continue
    lift += Math.sin((d - front) * 0.9) * 2.4 * r.power * Math.exp(-r.age * 3) * Math.exp(-d * 0.03)
  }
  return lift
}

const paintWaterBody = (ctx, x, y, time) => {
  const h = hash(x, y)
  const drift = Math.floor(time * 5 + h) % 16
  if (h % 3 === 0) {
    ctx.fillStyle = 'rgba(127, 220, 230, 0.32)'
    ctx.fillRect(x * BLOCK + (drift % BLOCK), y * BLOCK + (h % 7) + 1, 3, 1)
  }
}

const paintLavaBody = (ctx, x, y, time) => {
  const h = hash(x, y)
  for (let i = 0; i < 3; i++) {
    const t = time * (0.5 + i * 0.3) + h * 0.1 + i * 3
    const blobX = Math.floor(((Math.sin(t) + 1) / 2) * 6)
    const blobY = Math.floor(((Math.cos(t * 0.7 + h) + 1) / 2) * 6)
    ctx.fillStyle = i === 0 ? '#8c2410' : i === 1 ? '#ff8a2e' : '#ffc23a'
    ctx.fillRect(x * BLOCK + blobX, y * BLOCK + blobY, i === 0 ? 3 : 2, i === 0 ? 2 : 1)
  }
}

const paintOilBody = (ctx, x, y, time) => {
  const h = hash(x, y)
  if (Math.sin(time * 1.4 + h) < 0.4) return
  ctx.fillStyle = h % 2 ? '#6a4a90' : '#4a7a88'
  ctx.fillRect(x * BLOCK + h % 6, y * BLOCK + (h >> 3) % 6, 2, 1)
}

const paintAcidBody = (ctx, x, y, time) => {
  const h = hash(x, y)
  const rise = Math.floor((time * 6 + h) % 8)
  ctx.fillStyle = '#d8ff80'
  ctx.fillRect(x * BLOCK + h % 7, y * BLOCK + 7 - rise, 1, 1)
}

const BODY_DETAIL = { [M.WATER]: paintWaterBody, [M.LAVA]: paintLavaBody, [M.OIL]: paintOilBody, [M.ACID]: paintAcidBody }

const drawVine = (ctx, x, y) => {
  ctx.fillStyle = '#4f9c3a'
  ctx.fillRect(x * BLOCK + 3, y * BLOCK, 2, BLOCK)
  ctx.fillStyle = '#8ad05a'
  ctx.fillRect(x * BLOCK + (hash(x, y) % 2 ? 1 : 5), y * BLOCK + hash(y, x) % 6, 2, 2)
}

const drawLiquids = (ctx, world, time, ripples) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m === M.VINE) {
        drawVine(ctx, x, y)
        continue
      }
      const look = LIQUID[m]
      if (!look) continue
      const surface = matAt(world, x, y - 1) !== m
      ctx.fillStyle = look.body
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      if (!surface && matAt(world, x, y - 2) === m) {
        ctx.fillStyle = look.deep
        ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      }
      BODY_DETAIL[m](ctx, x, y, time)
      if (!surface) continue
      for (let i = 0; i < BLOCK; i++) {
        const px = x * BLOCK + i
        const lift = Math.sin(time * 2.4 + px * 0.55) > 0.2 ? 0 : 1
        const extra = ripples.length ? Math.round(rippleLift(ripples, px, y * BLOCK, time)) : 0
        const top = y * BLOCK + lift - extra
        ctx.fillStyle = look.top
        ctx.fillRect(px, top, 1, 1)
        if (extra !== 0) {
          ctx.fillStyle = look.body
          ctx.fillRect(px, top + 1, 1, Math.max(0, extra))
        }
        if ((px + Math.floor(time * 7)) % 11 === 0) {
          ctx.fillStyle = look.crest
          ctx.fillRect(px, top, 1, 1)
        }
      }
    }
  }
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
const GAS_COLOURS = { [M.SMOKE]: '#747a72', [M.STEAM]: '#c8d8d8', [M.METHANE]: '#b07cd8' }
const GAS_LEVELS = [1, 3, 5, 7]
const GAS_TILE = 16

const makeGasTile = (colour, level) => {
  const canvas = blank(GAS_TILE, GAS_TILE)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = colour
  for (let y = 0; y < GAS_TILE; y++) {
    for (let x = 0; x < GAS_TILE; x++) if (BAYER[y % 4][x % 4] < level) ctx.fillRect(x, y, 1, 1)
  }
  return canvas
}

const gasTiles = Object.fromEntries(Object.entries(GAS_COLOURS).map(([m, colour]) => [m, GAS_LEVELS.map(level => makeGasTile(colour, level))]))
const GAS_DRIFT = { [M.SMOKE]: 3, [M.STEAM]: 6, [M.METHANE]: 1.6 }

const isGas = (world, x, y) => props(matAt(world, x, y)).gas === true

const drawGas = (ctx, world, time) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      const tiles = gasTiles[m]
      if (!tiles) continue
      const around = isGas(world, x - 1, y) + isGas(world, x + 1, y) + isGas(world, x, y - 1) + isGas(world, x, y + 1)
      const life = world.life[y * ROOM + x]
      const swell = Math.round(Math.sin(x * 0.8 + time * 0.7) + Math.cos(y * 1.1 - time * 0.5))
      const level = Math.max(0, Math.min(3, Math.floor(around / 2) + (life > 1.5 ? 1 : 0) - (life < 0.6 ? 1 : 0) + swell))
      const drift = Math.floor(time * GAS_DRIFT[m])
      const sway = Math.floor(Math.sin(time * 0.8 + y * 0.5) * 2)
      const sx = (x * BLOCK + sway + 64) % BLOCK
      const sy = (y * BLOCK + drift) % BLOCK
      ctx.drawImage(tiles[level], sx, sy, BLOCK, BLOCK, x * BLOCK, y * BLOCK, BLOCK, BLOCK)
    }
  }
}

const drawArc = (ctx, x, y) => {
  let px = x * BLOCK + Math.floor(Math.random() * BLOCK)
  let py = y * BLOCK + Math.floor(Math.random() * BLOCK)
  const steps = 3 + Math.floor(Math.random() * 3)
  const dx = Math.random() < 0.5 ? 1 : -1
  ctx.fillStyle = YELLOW
  for (let i = 0; i < steps; i++) {
    ctx.fillRect(px, py, 2, 1)
    px += dx * (1 + Math.floor(Math.random() * 2))
    py += Math.floor(Math.random() * 3) - 1
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(px, py, 1, 1)
}

const drawBurning = (ctx, world, x, y, time) => {
  const h = hash(x, y)
  const pulse = Math.floor(time * 11 + h) % 3
  ctx.fillStyle = ['rgba(255, 96, 24, 0.62)', 'rgba(255, 170, 40, 0.5)', 'rgba(200, 40, 16, 0.6)'][pulse]
  ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
  const frame = (Math.floor(time * 9) + h) % SPRITES.flames.length
  ctx.drawImage(SPRITES.flames[frame], x * BLOCK, y * BLOCK)
  if (props(matAt(world, x, y - 1)).solid) return
  const tongue = SPRITES.flames[(frame + 1) % SPRITES.flames.length]
  const height = 3 + (Math.floor(time * 13 + h * 3) % 3)
  ctx.drawImage(tongue, 0, 0, BLOCK, height + 2, x * BLOCK, y * BLOCK - height, BLOCK, height + 2)
}

const drawOverlays = (ctx, world, time) => {
  const busy = world.charged > 80
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      if (burningAt(world, x, y)) drawBurning(ctx, world, x, y, time)
      if (chargedAt(world, x, y)) {
        if (!busy || hash(x, y) % 3 === 0) drawArc(ctx, x, y)
        if (Math.random() < 0.35) {
          ctx.fillStyle = 'rgba(255, 232, 74, 0.28)'
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
        }
      }
    }
  }
}

const drawIcon = (ctx, name, x, y, size) => {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(SPRITES.icons[name], x, y, size, size)
}

const drawCards = (ctx, time, cards) => {
  const bob = Math.round(Math.sin(time * 3))
  for (const card of cards) {
    if (card.kind === 'core') {
      const pulse = Math.round(2 + Math.sin(time * 4) * 2)
      ctx.fillStyle = WHITE
      ctx.fillRect(card.x - pulse, card.y - pulse, card.w + pulse * 2, card.h + pulse * 2)
      ctx.fillStyle = BACKGROUND
      ctx.fillRect(card.x + 4, card.y + 4, card.w - 8, card.h - 8)
      drawIcon(ctx, 'rift', card.x, card.y, 16)
      continue
    }
    if (card.kind === 'chest' || card.kind === 'altar') {
      drawIcon(ctx, card.kind, card.x, card.y, 12)
      continue
    }
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 1
    ctx.strokeRect(card.x + 0.5, card.y + bob + 0.5, card.w - 1, card.h - 1)
    drawIcon(ctx, card.kind, card.x + 1, card.y + bob + 1, 10)
  }
}

const drawWares = (ctx, wares, gold) => {
  for (const w of wares) {
    drawIcon(ctx, { heart: 'heart', bomb: 'bomb' }[w.kind] ?? (w.relic ? RELIC_BY_ID[w.relic].icon : 'rift'), w.x, w.y, 12)
    drawText(ctx, w.price, w.x + 2, w.y - 7, gold >= w.price ? YELLOW : PALE)
  }
}

const drawPickups = (ctx, time, pickups) => {
  for (const c of pickups) {
    if (c.kind !== 'coin') {
      drawIcon(ctx, c.kind, Math.round(c.x), Math.round(c.y), c.w)
      continue
    }
    const spin = Math.abs(Math.cos(time * 7 + c.x))
    const w = Math.max(1, Math.round(c.w * spin))
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(SPRITES.icons.coin, Math.round(c.x + (c.w - w) / 2), Math.round(c.y), w, c.h)
  }
}

const EFFECT_SPRITE = { decoy: 28, rod: 29, mine: 30, drone: 27, well: 31 }

const drawEffects = (ctx, time, effects, player) => {
  for (const f of effects) {
    if (f.kind === 'mirror') {
      ctx.strokeStyle = MAGNET
      ctx.lineWidth = 1
      ctx.strokeRect(Math.round(player.x) - 6.5, Math.round(player.y) - 6.5, player.w + 13, player.h + 13)
      continue
    }
    const sprite = EFFECT_SPRITE[f.kind]
    if (sprite === undefined) continue
    ctx.drawImage(SPRITES.creatures[sprite][0], Math.round(f.x + 4 - 14), Math.round(f.y + (f.kind === 'well' ? 14 : 16) - 28))
    if (f.kind === 'well') {
      ctx.strokeStyle = GAS
      const r = 8 + Math.sin(time * 12) * 3
      ctx.strokeRect(Math.round(f.x - r) + 0.5, Math.round(f.y - r) + 0.5, r * 2, r * 2)
    }
  }
}

const drawFlung = (ctx, flung) => {
  for (const f of flung) ctx.drawImage(SPRITES.tiles.scrap[0], Math.round(f.x), Math.round(f.y))
}

const DOOR_BARS = {
  left: door => [0, door.row * BLOCK, 2, BLOCK * 2],
  right: door => [ROOM_PX - 2, door.row * BLOCK, 2, BLOCK * 2],
  up: door => [door.col * BLOCK, 0, BLOCK * 2, 2],
  down: door => [door.col * BLOCK, ROOM_PX - 2, BLOCK * 2, 2],
}

const drawDoorPulse = (ctx, doors, amount, time) => {
  if (amount <= 0 || !doors) return
  const on = Math.floor(time * 10) % 2 === 0 || amount < 0.5
  if (!on) return
  ctx.fillStyle = amount > 1 ? '#ffffff' : '#7dff8a'
  for (const [dir, door] of Object.entries(doors)) {
    const [x, y, w, h] = DOOR_BARS[dir](door)
    ctx.fillRect(x, y, w, h)
    const across = w > h
    const reach = Math.round((1 - Math.min(1, amount / 1.8)) * 8)
    if (across) ctx.fillRect(x, dir === 'up' ? y + 2 + reach : y - 2 - reach, w, 1)
    else ctx.fillRect(dir === 'left' ? x + 2 + reach : x - 2 - reach, y, 1, h)
  }
}

export const drawScene = (ctx, g, room, live) => {
  const { world, theme } = room
  const time = g.time
  drawSolids(ctx, world, g.depth, THEMES[theme]?.skin, theme)
  drawCards(ctx, time, room.cards)
  drawWares(ctx, room.wares, g.gold)
  drawPickups(ctx, time, room.pickups)
  if (live) {
    drawFlung(ctx, g.flung)
    drawEffects(ctx, time, g.effects, g.player)
  }
  drawCreatures(ctx, g, room.enemies)
  drawLiquids(ctx, world, time, live ? g.ripples : [])
  drawGas(ctx, world, time)
  drawOverlays(ctx, world, time)
  if (live) drawDoorPulse(ctx, room.doors, g.doorPulse, g.fxClock)
}

export const liquidOverlay = m => LIQUID[m]?.body
