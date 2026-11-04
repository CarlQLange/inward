import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { ENEMY_DEFS } from './enemies.js'
import { SPRITES } from './sprites.js'
import { drawText, textWidth } from './font.js'
import { drawMapGrid, drawMenus, drawToast } from './screens.js'
import { save } from './store.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const COLOURS = {
  white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a',
  magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0',
}
const BACKGROUND = '#07100e'
const ROOM_PX = ROOM * BLOCK

const TILE = {
  [M.BEDROCK]: 'bedrock', [M.ROCK]: 'rock', [M.MOSS]: 'moss', [M.PEAT]: 'peat',
  [M.WOOD]: 'wood', [M.METAL]: 'metal', [M.GATE]: 'gate', [M.SAND]: 'sand',
  [M.SCRAP]: 'scrap', [M.VOLATILE]: 'volatile', [M.ICE]: 'ice', [M.BRICK]: 'brick',
}

const hash = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 16) & 0xffff

const makeBackdrop = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = ROOM_PX
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, ROOM_PX, ROOM_PX)
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

const tileFor = (name, x, y, depth) => {
  const h = hash(x, y)
  if (name === 'rock') {
    if (depth > 0.5 && h % 6 === 0) return SPRITES.extra.fungus
    if (h % 13 === 0) return SPRITES.extra.bones
  }
  const set = SPRITES.tiles[name]
  return set[h % set.length]
}

const isBuried = (world, x, y) =>
  [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]
    .every(([dx, dy]) => props(matAt(world, x + dx, y + dy)).solid)

const drawSolids = (ctx, world, depth) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(world, x, y)
      if (m === M.ASH) ctx.drawImage(SPRITES.ash, x * BLOCK, y * BLOCK)
      const name = TILE[m]
      if (!name) continue
      ctx.drawImage(tileFor(name, x, y, depth), x * BLOCK, y * BLOCK)
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
      if (m !== M.WATER && m !== M.OIL) continue
      ctx.fillStyle = m === M.WATER ? 'rgba(16, 72, 84, 0.78)' : 'rgba(58, 34, 62, 0.92)'
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      if (matAt(world, x, y - 1) === m) continue
      ctx.fillStyle = m === M.WATER ? '#3f9aa2' : '#a06ab0'
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
}

const enemyFrame = (e, time) => {
  const { sprite } = ENEMY_DEFS[e.kind]
  const walking = e.kind === 'crawler'
  const index = walking ? Math.floor(time * 6) % sprite.length : Math.min(e.frame, sprite.length - 1)
  return SPRITES.creatures[sprite[index]][e.facing > 0 ? 0 : 1]
}

const drawEnemies = (ctx, g) => {
  for (const e of g.enemies) {
    if (e.iframes > 0 && Math.floor(g.time * 20) % 2) continue
    const jitter = e.stun > 0 && e.frozen <= 0 ? Math.round(Math.sin(g.time * 60)) : 0
    const x = Math.round(e.x + e.w / 2 - 14) + jitter
    const y = Math.round(e.y + e.h - 28)
    ctx.drawImage(enemyFrame(e, g.time), x, y)
    if (e.frozen > 0) {
      ctx.fillStyle = 'rgba(160, 230, 255, 0.5)'
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.w, e.h)
    }
    if (e.friendly && !e.spent && e.kind !== 'mole') {
      const bob = Math.round(Math.sin(g.time * 4))
      drawText(ctx, '?', e.x + e.w / 2 - 1, e.y - 8 + bob, COLOURS.charge)
    }
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
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 1
    ctx.strokeRect(card.x + 0.5, card.y + bob + 0.5, card.w - 1, card.h - 1)
    drawIcon(ctx, card.kind, card.x + 1, card.y + bob + 1, 10)
  }
}

const drawWares = (ctx, g) => {
  for (const w of g.wares) {
    drawIcon(ctx, w.kind === 'heart' ? 'heart' : 'rift', w.x, w.y, 12)
    drawText(ctx, w.price, w.x + 2, w.y - 7, g.gold >= w.price ? COLOURS.charge : COLOURS.pale)
  }
}

const drawPickups = (ctx, g) => {
  for (const c of g.pickups) drawIcon(ctx, c.kind, Math.round(c.x), Math.round(c.y), c.w)
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

const drawLeftHud = (ctx, g) => {
  const x = 33
  for (let slot = 0; slot < TUNING.player.skillSlots; slot++) {
    const top = ORIGIN.y + slot * 40
    const skill = g.player.skills[slot]
    box(ctx, x, top, 32, 32)
    if (skill) ctx.drawImage(SPRITES.icons[skill.kind], x + 8, top + 8)
    const ready = skill ? 1 - Math.max(0, skill.ready) / TUNING.skills[skill.kind].every : 0
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ready * 6 > i ? GREEN : DIM
      ctx.fillRect(x + i * 5 + 1, top + 34, 4, 2)
    }
    drawText(ctx, 'CVB'[slot], x - 7, top + 2, skill ? GREEN : DIM)
  }
  for (let i = 0; i < TUNING.player.hp; i++) {
    ctx.drawImage(i < g.player.hp ? SPRITES.heart : SPRITES.heartEmpty, x - 7 + i * 8, ORIGIN.y + 122)
  }
  drawText(ctx, 'ESC MENU', x - 7, ORIGIN.y + 134, DIM)
  drawText(ctx, 'TAB SKILLS', x - 7, ORIGIN.y + 142, DIM)
}

const drawMinimap = (ctx, g, x) => {
  const span = 15 * 5 + 3
  box(ctx, x, ORIGIN.y, span, span)
  drawMapGrid(ctx, g, x + 2, ORIGIN.y + 2, 5)
}

const drawRightHud = (ctx, g) => {
  const span = 15 * 5 + 3
  const x = VIEW.w - 101 + Math.floor((101 - span) / 2)
  drawMinimap(ctx, g, x)
  let y = ORIGIN.y + span + 8
  drawText(ctx, 'SCORE', x, y, DIM)
  drawText(ctx, g.score, x + span - textWidth(String(g.score)), y, GREEN)
  y += 9
  drawText(ctx, 'BEST', x, y, DIM)
  drawText(ctx, g.best, x + span - textWidth(String(g.best)), y, DIM)
  y += 9
  drawIcon(ctx, 'coin', x, y - 1, 7)
  drawText(ctx, g.gold, x + 10, y, COLOURS.charge)
  const level = `L${g.level}`
  drawText(ctx, level, x + span - textWidth(level), y, GREEN)
  y += 8
  for (let i = 0; i < g.nextLevel; i++) {
    ctx.fillStyle = i < g.xp ? GREEN : DIM
    ctx.fillRect(x + Math.floor((i * span) / g.nextLevel), y, Math.max(1, Math.floor(span / g.nextLevel) - 1), 2)
  }
  y += 8
  if (g.chain > 1) {
    const text = `CHAIN X${g.chain}`
    drawText(ctx, text, x, y, COLOURS.charge)
    ctx.fillStyle = COLOURS.charge
    ctx.fillRect(x, y + 7, Math.floor((span * g.chainTime) / TUNING.run.chainWindow), 1)
  }
}

export const draw = (ctx, g) => {
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
  ctx.drawImage(backdrop, 0, 0)
  drawSolids(ctx, g.world, g.depth)
  drawCards(ctx, g)
  drawWares(ctx, g)
  drawPickups(ctx, g)
  drawFlung(ctx, g)
  drawEnemies(ctx, g)
  if (g.phase !== 'dead' && g.phase !== 'title') drawPlayer(ctx, g)
  drawLiquids(ctx, g.world, g.time)
  drawGas(ctx, g.world)
  drawOverlays(ctx, g.world, g.time)
  drawProjectiles(ctx, g)
  drawPopups(ctx, g)
  ctx.restore()
  if (g.phase !== 'title') {
    drawLeftHud(ctx, g)
    drawRightHud(ctx, g)
    if (g.menus.length === 0) drawToast(ctx, g)
  }
  drawMenus(ctx, g)
}
