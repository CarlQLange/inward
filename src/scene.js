import { BLOCK, ROOM } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { SPRITES, regionTiles } from './sprites.js'
import { drawText } from './font.js'
import { RELIC_BY_ID } from './relics.js'
import { drawCreatures } from './creatures.js'
import { drawSkillMatter } from './skillart.js'
import { standingFixtures } from './light.js'
import { airOf } from './backdrop.js'
import { SCARF_DEEP, SCARF_RED } from './hero.js'

const GREEN = '#76d648'
const WHITE = '#f4f8f2'
const PALE = '#c9d4c0'
const YELLOW = '#ffe84a'
const GAS = '#c79ae0'
const BACKGROUND = '#07100e'
const ROOM_PX = ROOM * BLOCK

const TILE = {
  [M.BEDROCK]: 'bedrock', [M.ROCK]: 'rock', [M.MOSS]: 'moss', [M.PEAT]: 'peat',
  [M.WOOD]: 'wood', [M.METAL]: 'metal', [M.GATE]: 'gate', [M.SAND]: 'sand',
  [M.SCRAP]: 'scrap', [M.VOLATILE]: 'volatile', [M.ICE]: 'ice', [M.BRICK]: 'brick', [M.SOURCE]: 'metal',
  [M.SNOW]: 'snow', [M.MUD]: 'mud',
}

const hash = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 16) & 0xffff

const TINTS = [
  null, 'rgba(40, 110, 170, 0.34)', 'rgba(120, 80, 20, 0.34)', 'rgba(120, 130, 150, 0.42)',
  'rgba(190, 60, 20, 0.4)', 'rgba(120, 210, 240, 0.4)', 'rgba(150, 70, 210, 0.38)', 'rgba(220, 50, 120, 0.3)',
]

const blank = (w, h) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

const tinted = TINTS.map(() => new Map())

const tintTile = (theme, tile) => {
  const tint = TINTS[theme]
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

const TINTED_TILES = new Set(['bedrock', 'brick'])

const MUTING = { rock: [0.34, 0.8], bedrock: [0.34, 0.72] }
const LIGHT_MUTING = [0.08, 0.95]
const LOUD = new Set(['volatile', 'gate'])
const shaped = new Map()

const shapedTile = (tile, name, detail) => {
  const key = Math.round(detail * 20)
  const cache = shaped.get(tile) ?? new Map()
  shaped.set(tile, cache)
  if (cache.has(key)) return cache.get(key)
  const loud = LOUD.has(name)
  const [grey, dim] = loud ? [0, 1] : MUTING[name] ?? LIGHT_MUTING
  const keep = loud ? Math.max(detail, 0.5) : detail
  const canvas = blank(tile.width, tile.height)
  const c = canvas.getContext('2d', { willReadFrequently: true })
  c.drawImage(tile, 0, 0)
  const image = c.getImageData(0, 0, tile.width, tile.height)
  const { data } = image
  const solidPixels = Array.from({ length: data.length / 4 }, (_, i) => i * 4).filter(i => data[i + 3] > 127)
  const mean = [0, 1, 2].map(k => solidPixels.reduce((sum, i) => sum + data[i + k], 0) / Math.max(1, solidPixels.length))
  for (let i = 0; i < data.length; i += 4) {
    const flat = [0, 1, 2].map(k => mean[k] + (data[i + k] - mean[k]) * keep)
    const luma = flat[0] * 0.3 + flat[1] * 0.59 + flat[2] * 0.11
    flat.forEach((v, k) => { data[i + k] = (v + (luma - v) * grey) * dim })
    data[i + 3] = 255
  }
  c.putImageData(image, 0, 0)
  cache.set(key, canvas)
  return canvas
}

const tileFor = (name, x, y, theme, look) => {
  const h = hash(x, y)
  if (name === 'rock') {
    if (look.variety && h % 17 === 0) return SPRITES.extra.bones
    const tiles = regionTiles(theme)
    if (tiles.length) return tiles[look.variety && h % 5 === 0 ? 1 : 0]
  }
  const set = SPRITES.tiles[name]
  return set[look.variety ? h % set.length : 0]
}

const isSolid = (world, x, y) => props(matAt(world, x, y)).solid === true

const isBuried = (world, x, y) =>
  [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    .every(([dx, dy]) => isSolid(world, x + dx, y + dy))

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

const SCORCH_ALPHA = 0.5

const paintScorch = (ctx, world) => {
  ctx.globalAlpha = SCORCH_ALPHA
  ctx.globalCompositeOperation = 'source-atop'
  for (const { x, y, size } of world.scorches ?? []) {
    const mark = scorchMark[size] ?? scorchMark[0]
    ctx.drawImage(mark, x - Math.floor(mark.width / 2), y - Math.floor(mark.height / 2))
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

const paintEdges = (ctx, world, x, y) => {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
  if (!isSolid(world, x, y - 1)) ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, 1)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
  if (!isSolid(world, x - 1, y)) ctx.fillRect(x * BLOCK, y * BLOCK, 1, BLOCK)
  if (!isSolid(world, x + 1, y)) ctx.fillRect(x * BLOCK + BLOCK - 1, y * BLOCK, 1, BLOCK)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  if (!isSolid(world, x, y + 1)) ctx.fillRect(x * BLOCK, y * BLOCK + BLOCK - 1, BLOCK, 1)
}

const GLASS_FILL = 'rgba(150, 214, 206, 0.22)'
const GLASS_FRAME = 'rgba(214, 246, 240, 0.92)'
const GLASS_GLINT = '#ffffff'

const paintGlass = (ctx, world, x, y) => {
  const px = x * BLOCK
  const py = y * BLOCK
  const pane = (dx, dy) => matAt(world, x + dx, y + dy) === M.GLASS
  ctx.fillStyle = GLASS_FILL
  ctx.fillRect(px, py, BLOCK, BLOCK)
  ctx.fillStyle = GLASS_FRAME
  if (!pane(0, -1)) ctx.fillRect(px, py, BLOCK, 1)
  if (!pane(0, 1)) ctx.fillRect(px, py + BLOCK - 1, BLOCK, 1)
  if (!pane(-1, 0)) ctx.fillRect(px, py, 1, BLOCK)
  if (!pane(1, 0)) ctx.fillRect(px + BLOCK - 1, py, 1, BLOCK)
  if ((x + y) % 2) return
  ctx.fillStyle = GLASS_GLINT
  for (let k = 0; k < 3; k++) ctx.fillRect(px + 2 + k, py + 5 - k, 1, 1)
}

const TOPS = {
  [M.MUD]: { colour: '#b8a684', rows: 1 },
  [M.SNOW]: { colour: '#ffffff', rows: 2 },
}

const paintTop = (ctx, world, x, y, m) => {
  const above = matAt(world, x, y - 1)
  if (above === m || props(above).solid) return
  const { colour, rows } = TOPS[m]
  const h = hash(x, y)
  ctx.fillStyle = colour
  ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, 1)
  for (let k = 0; k < BLOCK; k++) if (rows > 1 && (h >> k) & 1) ctx.fillRect(x * BLOCK + k, y * BLOCK + 1, 1, 1)
}

const paintFixture = (ctx, x, y, [r, g, b]) => {
  const px = x * BLOCK + 3
  const py = y * BLOCK
  ctx.fillStyle = '#1a1c1c'
  ctx.fillRect(px + 1, py, 1, 3)
  ctx.fillStyle = `rgb(${r * 255}, ${g * 255}, ${b * 255})`
  ctx.fillRect(px, py + 3, 3, 3)
  ctx.fillStyle = '#fffbe8'
  ctx.fillRect(px + 1, py + 4, 1, 1)
}

const paintTerrain = (ctx, world, theme, look, seed) => {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, ROOM_PX, ROOM_PX)
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m === M.ASH) ctx.drawImage(SPRITES.ash, x * BLOCK, y * BLOCK)
      if (m === M.GLASS) {
        paintGlass(ctx, world, x, y)
        continue
      }
      const name = TILE[m]
      if (!name) continue
      const tile = tileFor(name, x, y, theme, look)
      const toned = TINTED_TILES.has(name) ? tintTile(theme, tile) : tile
      if (isBuried(world, x, y) && !props(m).falls) {
        ctx.drawImage(shapedTile(toned, name, 0), x * BLOCK, y * BLOCK)
        ctx.fillStyle = `rgba(5, 12, 10, ${look.buried})`
        ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      } else {
        ctx.drawImage(shapedTile(toned, name, name === 'scrap' ? look.detail * 0.55 : look.detail), x * BLOCK, y * BLOCK)
        if (look.raised) {
          ctx.fillStyle = `rgba(255, 255, 255, ${look.raised})`
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
        }
        if (TOPS[m]) paintTop(ctx, world, x, y, m)
        else paintEdges(ctx, world, x, y)
      }
    }
  }
  if (look.fixtures) for (const { x, y } of standingFixtures(world, seed)) paintFixture(ctx, x, y, airOf(theme).fixture)
  paintScorch(ctx, world)
}

const terrain = { canvas: blank(ROOM_PX, ROOM_PX), drawn: new Uint8Array(ROOM * ROOM), world: null, key: '', version: 0 }

const drawnMat = m => (props(m).solid || props(m).thick || m === M.ASH ? m : 0)

export const terrainLayer = (world, theme, look, seed) => {
  const key = `${theme}|${look.row}|${seed}|${world.scorches?.length ?? 0}|${world.scorches?.at(-1)?.x}`
  const stale = terrain.world !== world || terrain.key !== key || !world.mat.every((m, i) => drawnMat(m) === terrain.drawn[i])
  if (stale) {
    paintTerrain(terrain.canvas.getContext('2d'), world, theme, look, seed)
    terrain.world = world
    terrain.key = key
    world.mat.forEach((m, i) => { terrain.drawn[i] = drawnMat(m) })
    terrain.version += 1
  }
  return terrain
}

const LIQUID_TINT = { [M.WATER]: 'rgba(14, 70, 88, 0.3)', [M.OIL]: 'rgba(40, 22, 48, 0.42)', [M.ACID]: 'rgba(84, 186, 36, 0.3)', [M.MUD]: 'rgba(84, 56, 28, 0.86)' }

export const drawSubmergedTint = (ctx, world) => {
  ctx.globalCompositeOperation = 'source-atop'
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const tint = LIQUID_TINT[matAt(world, x, y)]
      if (!tint) continue
      ctx.fillStyle = tint
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

const drawVine = (ctx, x, y) => {
  ctx.fillStyle = '#3f8432'
  ctx.fillRect(x * BLOCK + 3, y * BLOCK, 2, BLOCK)
  ctx.fillStyle = '#7ab84e'
  ctx.fillRect(x * BLOCK + (hash(x, y) % 2 ? 1 : 5), y * BLOCK + hash(y, x) % 6, 2, 2)
}

const drawVines = (ctx, world) => {
  for (let y = 0; y < ROOM; y++) for (let x = 0; x < ROOM; x++) if (matAt(world, x, y) === M.VINE) drawVine(ctx, x, y)
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

const drawGlint = (ctx, x, y, time, m) => {
  const h = hash(x, y)
  const beat = Math.sin(time * (m === M.VOLATILE ? 5 : 1.3) + h)
  if (beat < 0.55) return
  ctx.fillStyle = m === M.VOLATILE ? '#ffd8fa' : '#ffffff'
  const at = Math.floor(time * 2 + h) % 6
  ctx.fillRect(x * BLOCK + 1 + at, y * BLOCK + 1 + ((h >> 2) % 5), m === M.VOLATILE ? 2 : 1, 1)
  if (m === M.VOLATILE && beat > 0.9) {
    ctx.fillStyle = 'rgba(255, 120, 240, 0.35)'
    ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
  }
}

const drawOverlays = (ctx, world, time) => {
  const busy = world.charged > 80
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m === M.VOLATILE || m === M.ICE || m === M.GLASS) drawGlint(ctx, x, y, time, m)
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

const EFFECT_SPRITE = { ghost: 28, mine: 30, drone: 27, well: 31 }

const drawEffects = (ctx, time, effects) => {
  for (const f of effects) {
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

const FLUNG_TILE = { ...TILE, [M.FLOE]: 'ice' }

const ICE_SHARD = '#bff2ff'

const drawShard = (ctx, f) => {
  const x = Math.round(f.x)
  const y = Math.round(f.y)
  const tilt = Math.floor(f.age * 18) % 2
  ctx.fillStyle = f.mat === M.ICE ? ICE_SHARD : GLASS_FRAME
  ctx.fillRect(x + 1, y, 2, 4)
  ctx.fillRect(x, y + 1 + tilt, 4, 2 - tilt)
  ctx.fillStyle = GLASS_GLINT
  ctx.fillRect(x + 1 + tilt, y + 1, 1, 1)
}

const drawFlung = (ctx, flung) => {
  for (const f of flung) {
    if (f.shard) drawShard(ctx, f)
    else ctx.drawImage((SPRITES.tiles[FLUNG_TILE[f.mat]] ?? SPRITES.tiles.scrap)[0], Math.round(f.x), Math.round(f.y))
  }
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

const SEAL = [SCARF_DEEP, SCARF_RED].map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`)

const drawSeals = (ctx, world, cells, time) => {
  const bright = Math.floor(time * 4) % 2 === 0
  for (const [x, y] of cells) {
    if (!props(matAt(world, x, y)).solid) continue
    const [px, py] = [x * BLOCK, y * BLOCK]
    ctx.fillStyle = '#1a0808'
    ctx.fillRect(px, py, BLOCK, BLOCK)
    ctx.fillStyle = SEAL[bright ? 1 : 0]
    for (const bar of [1, 5]) ctx.fillRect(px + bar, py, 2, BLOCK)
    ctx.fillStyle = SEAL[1]
    ctx.fillRect(px, py + 3, BLOCK, 1)
  }
}

const drawMarks = (ctx, enemies, time) => {
  ctx.fillStyle = SEAL[1]
  for (const e of enemies) {
    if (e.friendly || e.ally || e.prop) continue
    const x = Math.round(e.x + e.w / 2)
    const y = Math.round(e.y) - 6 - (Math.floor(time * 3) % 2)
    ctx.fillRect(x - 2, y, 5, 1)
    ctx.fillRect(x - 1, y + 1, 3, 1)
    ctx.fillRect(x, y + 2, 1, 1)
  }
}

export const drawActors = (ctx, g, room, live) => {
  const { world } = room
  const time = g.time
  if (live) drawSkillMatter(ctx, g)
  drawVines(ctx, world)
  drawCards(ctx, time, room.cards)
  drawWares(ctx, room.wares, g.gold)
  drawPickups(ctx, time, room.pickups)
  if (live) {
    drawFlung(ctx, g.flung)
    drawEffects(ctx, time, g.effects)
  }
  drawCreatures(ctx, g, room.enemies.filter(e => !e.free))
  drawOverlays(ctx, world, time)
  drawCreatures(ctx, g, room.enemies.filter(e => e.free), false)
  if (live && room.sealed && room.sealCells) drawSeals(ctx, world, room.sealCells, g.fxClock)
  if (live && room.sealed && room.event === 'arena') drawMarks(ctx, room.enemies, g.fxClock)
  if (live) drawDoorPulse(ctx, room.doors, g.doorPulse, g.fxClock)
}
