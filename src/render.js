import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { SPRITES } from './sprites.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const COLOURS = { white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a', magnet: '#6fd0ff' }
const BACKGROUND = '#07100e'

const TILE = {
  [M.BEDROCK]: 'bedrock', [M.ROCK]: 'rock', [M.MOSS]: 'moss', [M.PEAT]: 'peat',
  [M.WOOD]: 'wood', [M.METAL]: 'metal', [M.GATE]: 'gate', [M.SAND]: 'sand', [M.ASH]: 'ash',
  [M.SCRAP]: 'scrap', [M.VOLATILE]: 'volatile',
}

const hash = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 16) & 0xffff

const makeBackdrop = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = ROOM * BLOCK
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#0d1c1a'
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      if (hash(x, y) % 5 === 0) ctx.fillRect(x * BLOCK + 2, y * BLOCK + 2, 3, 1)
      if (hash(y, x) % 7 === 0) ctx.fillRect(x * BLOCK + 5, y * BLOCK + 5, 1, 2)
    }
  }
  return canvas
}

const backdrop = makeBackdrop()

const drawSolids = (ctx, world) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const name = TILE[matAt(world, x, y)]
      if (!name) continue
      const set = SPRITES.tiles[name]
      ctx.drawImage(set[hash(x, y) % set.length], x * BLOCK, y * BLOCK)
    }
  }
}

const drawWater = (ctx, world, time) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      if (matAt(world, x, y) !== M.WATER) continue
      ctx.fillStyle = 'rgba(16, 72, 84, 0.78)'
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      if (matAt(world, x, y - 1) === M.WATER) continue
      ctx.fillStyle = '#3f9aa2'
      for (let i = 0; i < BLOCK; i++) {
        const lift = Math.sin(time * 2.4 + (x * BLOCK + i) * 0.55) > 0.2 ? 0 : 1
        ctx.fillRect(x * BLOCK + i, y * BLOCK + lift, 1, 1)
      }
    }
  }
}

const drawGas = (ctx, world) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m !== M.SMOKE && m !== M.STEAM) continue
      ctx.fillStyle = m === M.SMOKE ? '#747a72' : '#c8d8d8'
      const thin = world.life[y * ROOM + x] < 1.5
      const gap = thin ? 4 : 2
      for (let py = 0; py < BLOCK; py += 2) {
        for (let px = (py / 2) % 2; px < BLOCK; px += gap) {
          ctx.fillRect(x * BLOCK + px, y * BLOCK + py, 1, 1)
        }
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
  for (let i = 3; i < 7; i++) {
    ctx.fillRect(Math.round(ax + p.aim.x * i), Math.round(ay + p.aim.y * i), 1, 1)
  }
}

const enemyFrame = (e, time) => {
  const facing = e.facing > 0 ? 0 : 1
  if (e.kind === 'crawler') return SPRITES.crawler[Math.floor(time * 6) % 2][facing]
  if (e.kind === 'spitter') return SPRITES.spitter[facing]
  return SPRITES.fish[0][facing]
}

const drawEnemies = (ctx, g) => {
  for (const e of g.enemies) {
    if (e.iframes > 0 && Math.floor(g.time * 20) % 2) continue
    const jitter = e.stun > 0 ? Math.round(Math.sin(g.time * 60)) : 0
    ctx.drawImage(enemyFrame(e, g.time), Math.round(e.x) + jitter, Math.round(e.y))
  }
}

const drawBolt = (ctx, bolt) => {
  ctx.fillStyle = COLOURS.charge
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
    ctx.fillStyle = Math.floor(g.time * 14) % 2 ? COLOURS.fire : COLOURS.charge
    ctx.fillRect(Math.round(f.x), Math.round(f.y), f.w, f.h)
  }
  for (const p of g.particles) {
    ctx.fillStyle = COLOURS[p.colour]
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
  }
  g.bolts.forEach(b => drawBolt(ctx, b))
}

const drawCards = (ctx, g) => {
  const bob = Math.round(Math.sin(g.time * 3))
  for (const card of g.cards) {
    if (card.kind !== 'core') {
      ctx.drawImage(SPRITES.cards[card.kind], card.x, card.y + bob)
      continue
    }
    const pulse = Math.round(2 + Math.sin(g.time * 4) * 2)
    ctx.fillStyle = COLOURS.white
    ctx.fillRect(card.x - pulse, card.y - pulse, card.w + pulse * 2, card.h + pulse * 2)
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(card.x + 4, card.y + 4, card.w - 8, card.h - 8)
  }
}

const drawFlung = (ctx, g) => {
  for (const f of g.flung) ctx.drawImage(SPRITES.tiles.scrap[0], Math.round(f.x), Math.round(f.y))
}

const box = (ctx, x, y, w, h) => {
  ctx.strokeStyle = GREEN
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

const drawLeftHud = (ctx, g) => {
  const x = 33
  for (let slot = 0; slot < 2; slot++) {
    const top = ORIGIN.y + slot * 46
    const skill = g.player.skills[slot]
    box(ctx, x, top, 36, 36)
    if (skill) ctx.drawImage(SPRITES.icons[skill.kind], x + 10, top + 10)
    const ready = skill ? 1 - Math.max(0, skill.ready) / TUNING.skills[skill.kind].every : 0
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ready * 6 > i ? GREEN : DIM
      ctx.fillRect(x + i * 6, top + 39, 4, 3)
    }
  }
  for (let i = 0; i < TUNING.player.hp; i++) {
    ctx.drawImage(i < g.player.hp ? SPRITES.heart : SPRITES.heartEmpty, x - 4 + i * 9, ORIGIN.y + 94)
  }
}

const drawMinimap = (ctx, g) => {
  const size = 4
  const pitch = 5
  const span = 15 * pitch + 3
  const x = VIEW.w - 101 + Math.floor((101 - span) / 2)
  box(ctx, x, ORIGIN.y, span, span)
  for (let cy = 0; cy < 15; cy++) {
    for (let cx = 0; cx < 15; cx++) {
      const onLine = cy === 7 && cx < g.rooms.length
      const here = onLine && cx === g.index
      const seen = onLine && g.rooms[cx].visited
      const isCore = cx === 7 && cy === 7
      ctx.fillStyle = here ? COLOURS.white : seen ? GREEN : isCore ? DIM : '#123018'
      ctx.fillRect(x + 2 + cx * pitch, ORIGIN.y + 2 + cy * pitch, size, size)
    }
  }
}

const drawEnding = (ctx, g) => {
  if (g.phase === 'playing') return
  const wait = g.phase === 'dead' ? TUNING.deadPause : TUNING.clearedPause
  ctx.globalAlpha = Math.min(1, g.phaseTime / wait)
  ctx.fillStyle = g.phase === 'dead' ? '#000' : '#e8f4d8'
  ctx.fillRect(0, 0, ROOM * BLOCK, ROOM * BLOCK)
  ctx.globalAlpha = 1
}

export const draw = (ctx, g) => {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  ctx.save()
  ctx.translate(ORIGIN.x, ORIGIN.y)
  ctx.beginPath()
  ctx.rect(0, 0, ROOM * BLOCK, ROOM * BLOCK)
  ctx.clip()
  ctx.drawImage(backdrop, 0, 0)
  drawSolids(ctx, g.world)
  drawCards(ctx, g)
  drawFlung(ctx, g)
  drawEnemies(ctx, g)
  if (g.phase !== 'dead') drawPlayer(ctx, g)
  drawWater(ctx, g.world, g.time)
  drawGas(ctx, g.world)
  drawOverlays(ctx, g.world, g.time)
  drawProjectiles(ctx, g)
  drawEnding(ctx, g)
  ctx.restore()
  drawLeftHud(ctx, g)
  drawMinimap(ctx, g)
}
