import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { ENEMY_DEFS } from './enemies.js'
import { SPRITES } from './sprites.js'
import { drawText, textWidth } from './font.js'
import { drawMenus, drawToast } from './screens.js'
import { drawHud } from './hud.js'
import { save } from './store.js'
import { RELIC_BY_ID } from './relics.js'
import { THEMES } from './generate.js'
import { keyOf } from './map.js'
import { scheme, skillKey, usesMouse } from './controls.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const COLOURS = {
  hurt: '#ff5a4a', heal: '#7dff8a',
  white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a',
  magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0',
}
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

const makeBackdrop = ({ bg, speck, pattern }) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = ROOM_PX
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
    const canvas = document.createElement('canvas')
    canvas.width = tile.width
    canvas.height = tile.height
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

const drawSolids = (ctx, world, depth, skin, theme) => {
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
}

const drawLiquids = (ctx, world, time) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m === M.VINE) {
        ctx.fillStyle = '#4f9c3a'
        ctx.fillRect(x * BLOCK + 3, y * BLOCK, 2, BLOCK)
        ctx.fillStyle = '#8ad05a'
        ctx.fillRect(x * BLOCK + (hash(x, y) % 2 ? 1 : 5), y * BLOCK + hash(y, x) % 6, 2, 2)
        continue
      }
      if (m !== M.WATER && m !== M.OIL && m !== M.LAVA && m !== M.ACID) continue
      ctx.fillStyle = { [M.WATER]: 'rgba(16, 72, 84, 0.78)', [M.OIL]: 'rgba(58, 34, 62, 0.92)', [M.LAVA]: '#d9481c', [M.ACID]: 'rgba(90, 190, 40, 0.85)' }[m]
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      if (matAt(world, x, y - 1) === m) continue
      ctx.fillStyle = { [M.WATER]: '#3f9aa2', [M.OIL]: '#a06ab0', [M.LAVA]: '#ffd24a', [M.ACID]: '#c8ff5a' }[m]
      for (let i = 0; i < BLOCK; i++) {
        const lift = Math.sin(time * 2.4 + (x * BLOCK + i) * 0.55) > 0.2 ? 0 : 1
        ctx.fillRect(x * BLOCK + i, y * BLOCK + lift, 1, 1)
      }
    }
  }
}

const GAS_COLOURS = { [M.SMOKE]: '#747a72', [M.STEAM]: '#c8d8d8', [M.METHANE]: '#a878c8' }

const drawGas = (ctx, world) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (!GAS_COLOURS[m]) continue
      ctx.fillStyle = GAS_COLOURS[m]
      const gap = world.life[y * ROOM + x] < 1.5 ? 4 : 2
      for (let py = 0; py < BLOCK; py += 2) {
        for (let px = (py / 2) % 2; px < BLOCK; px += gap) ctx.fillRect(x * BLOCK + px, y * BLOCK + py, 1, 1)
      }
    }
  }
}

const drawOverlays = (ctx, world, time) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      if (burningAt(world, x, y)) {
        const frame = (Math.floor(time * 9) + hash(x, y)) % SPRITES.flames.length
        ctx.drawImage(SPRITES.flames[frame], x * BLOCK, y * BLOCK)
      }
      if (chargedAt(world, x, y)) {
        ctx.fillStyle = COLOURS.charge
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(x * BLOCK + Math.floor(Math.random() * BLOCK), y * BLOCK + Math.floor(Math.random() * BLOCK), 1 + Math.floor(Math.random() * 2), 1)
        }
      }
    }
  }
}

const legsFor = (p, time) => {
  if (p.crouching) return 'crouch'
  if (!p.grounded) return 'jump'
  if (Math.abs(p.vx) < 8) return 'stand'
  return Math.floor(time * 10) % 2 ? 'stepA' : 'stepB'
}

const drawPlayer = (ctx, g) => {
  const p = g.player
  if (p.iframes > 0 && Math.floor(g.time * 16) % 2) return
  const frames = SPRITES.player[legsFor(p, g.time)]
  const x = Math.round(p.x) - 1
  const y = Math.round(p.y) - 1
  ctx.drawImage(frames[p.facing > 0 ? 0 : 1], x, y)
  ctx.fillStyle = COLOURS.white
  const ax = x + 4
  const ay = y + (p.crouching ? 5 : 6)
  for (let i = 3; i < 7; i++) ctx.fillRect(Math.round(ax + p.aim.x * i), Math.round(ay + p.aim.y * i), 1, 1)
  const choking = (p.smoked ?? 0) / TUNING.player.smokeTolerance
  if (choking > 0.1) {
    ctx.fillStyle = '#000'
    ctx.fillRect(x - 1, y - 5, 10, 3)
    ctx.fillStyle = choking > 0.66 ? COLOURS.hurt : '#c8c8b8'
    ctx.fillRect(x, y - 4, Math.round(8 * Math.min(1, choking)), 1)
  }
}

const enemyFrame = (e, time) => {
  const { sprite } = ENEMY_DEFS[e.kind]
  const walking = e.kind === 'crawler'
  const index = walking ? Math.floor(time * 6) % sprite.length : Math.min(e.frame, sprite.length - 1)
  return SPRITES.creatures[sprite[index]][e.facing > 0 ? 0 : 1]
}

const ELITE_COLOURS = { burning: COLOURS.fire, charged: COLOURS.charge, armoured: COLOURS.pale }

const drawEnemies = (ctx, g) => {
  for (const e of g.enemies) {
    if (e.iframes > 0 && Math.floor(g.time * 20) % 2) continue
    const jitter = e.stun > 0 && e.frozen <= 0 ? Math.round(Math.sin(g.time * 60)) : 0
    const x = Math.round(e.x + e.w / 2 - 14) + jitter
    const y = Math.round(e.y + e.h - 28)
    ctx.drawImage(enemyFrame(e, g.time), x, y)
    if (e.flash > 0) {
      ctx.globalAlpha = 0.75
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h)
      ctx.globalAlpha = 1
    }
    if (e.windup && e.stun <= 0 && !e.friendly) drawText(ctx, '!', e.x + e.w / 2 - 1, e.y - 8, Math.floor(g.time * 12) % 2 ? COLOURS.hurt : COLOURS.charge)
    if (e.aimAt && e.stun <= 0) {
      ctx.fillStyle = COLOURS.hurt
      const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 }
      const d = Math.hypot(e.aimAt.x - c.x, e.aimAt.y - c.y)
      for (let t = 6 + (g.time * 40) % 6; t < d; t += 6) ctx.fillRect(Math.round(c.x + ((e.aimAt.x - c.x) / d) * t), Math.round(c.y + ((e.aimAt.y - c.y) / d) * t), 1, 1)
    }
    if (e.frozen > 0) {
      ctx.fillStyle = 'rgba(160, 230, 255, 0.5)'
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h)
    }
    if (e.elite || e.ally) {
      ctx.strokeStyle = e.ally ? COLOURS.gas : ELITE_COLOURS[e.elite]
      ctx.lineWidth = 1
      ctx.strokeRect(Math.round(e.x) - 0.5, Math.round(e.y) - 0.5, e.w + 1, e.h + 1)
    }
    if (e.lit) drawText(ctx, '!', e.x + e.w / 2 - 1, e.y - 8, COLOURS.fire)
    if (e.friendly && !e.spent && e.kind !== 'mole') {
      const bob = Math.round(Math.sin(g.time * 4))
      drawText(ctx, '?', e.x + e.w / 2 - 1, e.y - 8 + bob, COLOURS.charge)
    }
  }
}

const drawBolt = (ctx, bolt) => {
  ctx.fillStyle = COLOURS[bolt.colour] ?? COLOURS.charge
  bolt.points.slice(1).forEach((b, i) => {
    const a = bolt.points[i]
    const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)))
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0
      ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t), 1, 1)
    }
  })
}

const drawProjectiles = (ctx, g) => {
  ctx.fillStyle = COLOURS.white
  for (const s of g.shots) ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h)
  for (const f of g.fireballs) {
    ctx.fillStyle = f.acid ? '#8ae04a' : f.bomb ? COLOURS.pale : f.pellet ? COLOURS.magnet : Math.floor(g.time * 14) % 2 ? COLOURS.fire : COLOURS.charge
    ctx.fillRect(Math.round(f.x), Math.round(f.y), f.w, f.h)
  }
  for (const p of g.particles) {
    ctx.fillStyle = COLOURS[p.colour] ?? p.colour
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
  }
  g.bolts.forEach(b => drawBolt(ctx, b))
}

const drawIcon = (ctx, name, x, y, size) => {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(SPRITES.icons[name], x, y, size, size)
}

const drawCards = (ctx, g) => {
  const bob = Math.round(Math.sin(g.time * 3))
  for (const card of g.cards) {
    if (card.kind === 'core') {
      const pulse = Math.round(2 + Math.sin(g.time * 4) * 2)
      ctx.fillStyle = COLOURS.white
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

const drawWares = (ctx, g) => {
  for (const w of g.wares) {
    drawIcon(ctx, { heart: 'heart', bomb: 'bomb' }[w.kind] ?? (w.relic ? RELIC_BY_ID[w.relic].icon : 'rift'), w.x, w.y, 12)
    drawText(ctx, w.price, w.x + 2, w.y - 7, g.gold >= w.price ? COLOURS.charge : COLOURS.pale)
  }
}

const drawPickups = (ctx, g) => {
  for (const c of g.pickups) drawIcon(ctx, c.kind, Math.round(c.x), Math.round(c.y), c.w)
}

const EFFECT_SPRITE = { decoy: 28, rod: 29, mine: 30, drone: 27, well: 31 }

const drawEffects = (ctx, g) => {
  for (const f of g.effects) {
    if (f.kind === 'mirror') {
      const c = g.player
      ctx.strokeStyle = COLOURS.magnet
      ctx.lineWidth = 1
      ctx.strokeRect(Math.round(c.x) - 6.5, Math.round(c.y) - 6.5, c.w + 13, c.h + 13)
      continue
    }
    const sprite = EFFECT_SPRITE[f.kind]
    if (sprite === undefined) continue
    ctx.drawImage(SPRITES.creatures[sprite][0], Math.round(f.x + 4 - 14), Math.round(f.y + (f.kind === 'well' ? 14 : 16) - 28))
    if (f.kind === 'well') {
      ctx.strokeStyle = COLOURS.gas
      const r = 8 + Math.sin(g.time * 12) * 3
      ctx.strokeRect(Math.round(f.x - r) + 0.5, Math.round(f.y - r) + 0.5, r * 2, r * 2)
    }
  }
}

const drawFlung = (ctx, g) => {
  for (const f of g.flung) ctx.drawImage(SPRITES.tiles.scrap[0], Math.round(f.x), Math.round(f.y))
}

const drawPopups = (ctx, g) => {
  for (const p of g.popups) drawText(ctx, p.text, p.x - textWidth(String(p.text)) / 2, p.y, COLOURS[p.colour])
}

const box = (ctx, x, y, w, h, colour = GREEN) => {
  ctx.strokeStyle = colour
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

const drawLook = (ctx, g) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(0, 0, ROOM_PX, ROOM_PX)
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(g.world, x, y)
      const p = props(m)
      const hurts = burningAt(g.world, x, y) || chargedAt(g.world, x, y) || m === M.LAVA || m === M.ACID || p.harmful
      const blows = p.blast
      const burns = p.flammability
      const conducts = p.conductance
      const colour = hurts ? 'rgba(255, 50, 40, 0.8)' : blows ? 'rgba(220, 90, 255, 0.75)' : burns ? 'rgba(255, 150, 30, 0.5)' : conducts ? 'rgba(255, 235, 70, 0.45)' : null
      if (!colour) continue
      ctx.fillStyle = colour
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
    }
  }
  for (const e of g.enemies) {
    ctx.strokeStyle = e.friendly ? '#7dff8a' : e.ally ? COLOURS.gas : COLOURS.hurt
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(e.x) - 1.5, Math.round(e.y) - 1.5, e.w + 3, e.h + 3)
    drawText(ctx, e.kind.toUpperCase(), e.x - 4, e.y - 7, e.friendly ? '#7dff8a' : COLOURS.hurt)
  }
  ctx.fillStyle = COLOURS.hurt
  for (const f of g.fireballs) if (!f.friendly) ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, f.w + 2, f.h + 2)
}

const LEGEND = [
  ['RED HURTS', '#ff3228'], ['PURPLE EXPLODES', '#dc5aff'], ['ORANGE BURNS', '#ff961e'], ['YELLOW CONDUCTS', '#ffeb46'],
]

const drawLookLegend = ctx => {
  ctx.fillStyle = '#000'
  ctx.fillRect(16, ORIGIN.y + 150, 84, 70)
  LEGEND.forEach(([text, colour], i) => drawText(ctx, text, 20, ORIGIN.y + 154 + i * 10, colour))
}

const drawReticle = (ctx, pointer) => {
  const x = Math.round(pointer.x)
  const y = Math.round(pointer.y)
  ctx.fillStyle = COLOURS.white
  for (const [dx, dy] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) ctx.fillRect(x + dx, y + dy, 1, 1)
}

export const draw = (ctx, g, pointer) => {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  const shake = save.settings.shake ? g.shake : 0
  const shakeX = shake > 0.5 ? Math.round((Math.random() - 0.5) * shake) : 0
  const shakeY = shake > 0.5 ? Math.round((Math.random() - 0.5) * shake) : 0
  ctx.save()
  ctx.translate(ORIGIN.x + shakeX, ORIGIN.y + shakeY)
  ctx.beginPath()
  ctx.rect(0, 0, ROOM_PX, ROOM_PX)
  ctx.clip()
  const theme = g.phase === 'title' ? 0 : g.rooms[keyOf(g.x, g.y)]?.theme ?? 0
  ctx.drawImage(backdrops[theme], 0, 0)
  drawSolids(ctx, g.world, g.depth, THEMES[theme]?.skin, theme)
  drawCards(ctx, g)
  drawWares(ctx, g)
  drawPickups(ctx, g)
  drawFlung(ctx, g)
  drawEffects(ctx, g)
  drawEnemies(ctx, g)
  if (g.phase !== 'dead' && g.phase !== 'title') drawPlayer(ctx, g)
  drawLiquids(ctx, g.world, g.time)
  drawGas(ctx, g.world)
  drawOverlays(ctx, g.world, g.time)
  drawProjectiles(ctx, g)
  drawPopups(ctx, g)
  if (usesMouse() && pointer && g.phase === 'playing' && g.menus.length === 0) drawReticle(ctx, pointer)
  if (g.looking) drawLook(ctx, g)
  if (g.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255, 40, 30, ${0.45 * g.hurtFlash})`
    ctx.fillRect(0, 0, ROOM_PX, ROOM_PX)
  }
  const low = g.phase === 'playing' && g.player.hp <= 2
  if (low) {
    ctx.fillStyle = `rgba(255, 40, 30, ${0.22 + Math.sin(g.time * 6) * 0.14})`
    for (const [x, y, w, h] of [[0, 0, ROOM_PX, 4], [0, ROOM_PX - 4, ROOM_PX, 4], [0, 0, 4, ROOM_PX], [ROOM_PX - 4, 0, 4, ROOM_PX]]) ctx.fillRect(x, y, w, h)
  }
  ctx.restore()
  if (g.phase !== 'title') {
    if (g.menus.at(-1)?.page !== 'pause') drawHud(ctx, g)
    if (g.menus.length === 0) drawToast(ctx, g)
    if (g.looking) drawLookLegend(ctx)
  }
  drawMenus(ctx, g)
}
