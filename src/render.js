import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { SPRITES } from './sprites.js'
import { drawText, textWidth } from './font.js'
import { drawMapGrid, drawMenus, drawToast } from './screens.js'
import { save } from './store.js'
import { RELIC_BY_ID } from './relics.js'
import { keyOf } from './map.js'
import { skillKey, scheme, usesMouse } from './controls.js'
import { drawHero, heroOf } from './hero.js'
import { cameraOffset, doorOffset, drawMotes, drawParticles } from './fx.js'
import { drawScene, liquidOverlay } from './scene.js'
import { CAUSE_ICONS, drawPictogram } from './pictograms.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const COLOURS = {
  hurt: '#ff5a4a', heal: '#7dff8a',
  white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a',
  magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0',
}
const ROOM_PX = ROOM * BLOCK

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

const drawShot = (ctx, s) => {
  const speed = Math.hypot(s.vx, s.vy) || 1
  const ux = s.vx / speed
  const uy = s.vy / speed
  const x = s.x + s.w / 2
  const y = s.y + s.h / 2
  ctx.fillStyle = s.friendly ? '#fff3b4' : COLOURS.pale
  for (let i = 2; i <= 6; i++) ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h)
}

const fireballColour = (f, time) => {
  if (f.acid) return ['#8ae04a', '#d8ff80']
  if (f.bomb) return [COLOURS.pale, Math.floor(time * 14) % 2 ? COLOURS.hurt : '#ffffff']
  if (f.pellet) return [COLOURS.magnet, '#ffffff']
  return Math.floor(time * 14) % 2 ? [COLOURS.fire, '#ffffff'] : [COLOURS.charge, COLOURS.fire]
}

const drawFireball = (ctx, f, time) => {
  const [body, core] = fireballColour(f, time)
  const x = Math.round(f.x)
  const y = Math.round(f.y)
  ctx.fillStyle = '#10080a'
  ctx.fillRect(x - 1, y - 1, f.w + 2, f.h + 2)
  const speed = Math.hypot(f.vx, f.vy) || 1
  ctx.fillStyle = body
  for (let i = 2; i <= 7; i += 2) ctx.fillRect(Math.round(f.x + f.w / 2 - (f.vx / speed) * i), Math.round(f.y + f.h / 2 - (f.vy / speed) * i), 1, 1)
  ctx.fillRect(x, y, f.w, f.h)
  ctx.fillStyle = core
  ctx.fillRect(x + 1, y + 1, Math.max(1, f.w - 2), Math.max(1, f.h - 2))
}

const drawProjectiles = (ctx, g) => {
  g.shots.forEach(s => drawShot(ctx, s))
  g.fireballs.forEach(f => drawFireball(ctx, f, g.time))
  drawParticles(ctx, g)
  g.bolts.forEach(b => drawBolt(ctx, b))
}

const drawIcon = (ctx, name, x, y, size) => {
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(SPRITES.icons[name], x, y, size, size)
}

const drawPopups = (ctx, g) => {
  for (const p of g.popups) {
    if (p.icon) drawPictogram(ctx, CAUSE_ICONS[p.icon] ?? CAUSE_ICONS.DEFAULT, p.x, p.y, COLOURS[p.colour])
    else drawText(ctx, p.text, p.x - textWidth(String(p.text)) / 2, p.y, COLOURS[p.colour])
  }
}

const box = (ctx, x, y, w, h, colour = GREEN) => {
  ctx.strokeStyle = colour
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

const drawLeftHud = (ctx, g) => {
  const x = 33
  for (let slot = 0; slot < TUNING.player.skillSlots; slot++) {
    const top = ORIGIN.y + slot * 38
    const skill = g.player.skills[slot]
    box(ctx, x, top, 32, 32)
    if (skill) ctx.drawImage(SPRITES.icons[skill.kind], x + 8, top + 8)
    const ready = skill ? 1 - Math.max(0, skill.ready) / TUNING.skills[skill.kind].every : 0
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ready * 6 > i ? GREEN : DIM
      ctx.fillRect(x + i * 5 + 1, top + 34, 4, 2)
    }
    drawText(ctx, skillKey(slot), x - 7, top + 2, skill ? GREEN : DIM)
  }
  for (let i = 0; i < TUNING.player.hp; i++) {
    const jolt = g.hurtFlash > 0.4 ? Math.round((Math.random() - 0.5) * 3) : 0
    ctx.drawImage(i < g.player.hp ? SPRITES.heart : SPRITES.heartEmpty, x - 7 + (i % 4) * 9 + jolt, ORIGIN.y + 152 + Math.floor(i / 4) * 7)
  }
  drawText(ctx, 'ESC MENU', x - 7, ORIGIN.y + 168, DIM)
  drawText(ctx, 'TAB SKILLS', x - 7, ORIGIN.y + 175, DIM)
  drawText(ctx, 'M MAP', x - 7, ORIGIN.y + 182, DIM)
  drawText(ctx, 'SHIFT LOOK', x - 7, ORIGIN.y + 189, DIM)
  const { jump, shoot, bomb } = scheme().labels
  drawText(ctx, `${jump} JUMP`, x - 7, ORIGIN.y + 198, DIM)
  drawText(ctx, `${shoot} SHOOT`, x - 7, ORIGIN.y + 205, DIM)
  drawText(ctx, `${bomb} BOMB`, x - 7, ORIGIN.y + 212, DIM)
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
  drawIcon(ctx, 'bomb', x + 28, y - 1, 7)
  drawText(ctx, g.player.bombs, x + 38, y, COLOURS.pale)
  const level = `L${g.level}`
  drawText(ctx, level, x + span - textWidth(level), y, GREEN)
  y += 8
  for (let i = 0; i < g.nextLevel; i++) {
    ctx.fillStyle = i < g.xp ? (g.pings.xp > 0.3 ? '#ffffff' : GREEN) : DIM
    ctx.fillRect(x + Math.floor((i * span) / g.nextLevel), y, Math.max(1, Math.floor(span / g.nextLevel) - 1), 2)
  }
  y += 8
  y += 12
  let n = 0
  for (const id of g.player.relics) {
    drawIcon(ctx, RELIC_BY_ID[id].icon, x + (n % 8) * 10, y + Math.floor(n / 8) * 10, 9)
    n += 1
  }
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

const DOOR_VECTORS = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] }

const drawChain = (ctx, g) => {
  if (g.chain < 2) return
  const scale = Math.min(5, 2 + Math.floor(g.chain / 4)) + (g.chainPunch > 0.4 ? 1 : 0)
  const text = `${g.chain}`
  const width = (textWidth(text) + 4) * scale
  const x = ROOM_PX - width - 8
  const y = 10
  const fresh = g.chainPunch > 0.55
  ctx.globalAlpha = fresh ? 1 : 0.82
  drawText(ctx, 'X', x + 1, y + 1, '#04100c', scale)
  drawText(ctx, text, x + 4 * scale + 1, y + 1, '#04100c', scale)
  drawText(ctx, 'X', x, y, fresh ? '#ffffff' : COLOURS.charge, scale)
  drawText(ctx, text, x + 4 * scale, y, fresh ? '#ffffff' : COLOURS.charge, scale)
  ctx.globalAlpha = 1
  const left = g.chainTime / TUNING.run.chainWindow
  ctx.fillStyle = COLOURS.charge
  ctx.fillRect(x, y + 5 * scale + 2, Math.min(width, Math.round(width * left)), 1)
}

const drawSubmerged = (ctx, g, p) => {
  for (let y = Math.floor((p.y - 2) / BLOCK); y <= Math.floor((p.y + p.h) / BLOCK); y++) {
    for (let x = Math.floor((p.x - 4) / BLOCK); x <= Math.floor((p.x + p.w + 4) / BLOCK); x++) {
      const colour = liquidOverlay(matAt(g.world, x, y))
      if (!colour || matAt(g.world, x, y) === M.LAVA) continue
      ctx.globalAlpha = 0.42
      ctx.fillStyle = colour
      ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK)
      ctx.globalAlpha = 1
    }
  }
}

const carryOffset = g => {
  if (!g.door) return { x: 0, y: 0 }
  const fade = 1 - doorOffset(g).t
  const [ux, uy] = DOOR_VECTORS[g.door.dir]
  const { x, y } = g.door.heroFrom
  return {
    x: Math.round((x - (g.player.x - ux * ROOM_PX)) * fade),
    y: Math.round((y - (g.player.y - uy * ROOM_PX)) * fade),
  }
}

const drawHeroLayer = (ctx, g) => {
  const p = g.player
  const carry = carryOffset(g)
  ctx.translate(carry.x, carry.y)
  drawHero(ctx, g, p)
  ctx.translate(-carry.x, -carry.y)
  drawSubmerged(ctx, g, p)
  const choking = (p.smoked ?? 0) / TUNING.player.smokeTolerance
  if (choking > 0.1 && g.phase === 'playing') {
    const x = Math.round(p.x) - 1
    const y = Math.round(p.y) - 1
    ctx.fillStyle = '#000'
    ctx.fillRect(x - 1, y - 5, 10, 3)
    ctx.fillStyle = choking > 0.66 ? COLOURS.hurt : '#c8c8b8'
    ctx.fillRect(x, y - 4, Math.round(8 * Math.min(1, choking)), 1)
  }
}

const oldRoom = document.createElement('canvas')
oldRoom.width = oldRoom.height = ROOM_PX
let snapped = null

const snapshotDoor = (g, door) => {
  if (snapped === door) return
  snapped = door
  const ctx = oldRoom.getContext('2d')
  ctx.imageSmoothingEnabled = false
  drawScene(ctx, g, door.from, false)
}

const drawRoom = (ctx, g, pointer) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  const slide = doorOffset(g)
  if (slide) {
    const [ux, uy] = DOOR_VECTORS[slide.dir]
    snapshotDoor(g, g.door)
    ctx.drawImage(oldRoom, Math.round(ux * slide.t * ROOM_PX), Math.round(uy * slide.t * ROOM_PX))
    ctx.translate(Math.round(-ux * (1 - slide.t) * ROOM_PX), Math.round(-uy * (1 - slide.t) * ROOM_PX))
  }
  drawScene(ctx, g, { ...room, world: g.world, enemies: g.enemies, cards: g.cards, wares: g.wares, pickups: g.pickups }, true)
  drawChain(ctx, g)
  if (g.phase !== 'title') drawHeroLayer(ctx, g)
  drawProjectiles(ctx, g)
  drawPopups(ctx, g)
  if (usesMouse() && pointer && g.phase === 'playing' && g.menus.length === 0) drawReticle(ctx, pointer)
  if (g.looking) drawLook(ctx, g)
}

export const draw = (ctx, g, pointer) => {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  const shake = save.settings.shake ? cameraOffset(g) : { x: 0, y: 0 }
  ctx.save()
  ctx.translate(ORIGIN.x + shake.x, ORIGIN.y + shake.y)
  ctx.beginPath()
  ctx.rect(0, 0, ROOM_PX, ROOM_PX)
  ctx.clip()
  drawRoom(ctx, g, pointer)
  ctx.restore()
  if (g.phase !== 'title') {
    drawLeftHud(ctx, g)
    drawRightHud(ctx, g)
    drawMotes(ctx, g)
    if (g.menus.length === 0) drawToast(ctx, g)
    if (g.looking) drawLookLegend(ctx)
  }
  drawMenus(ctx, g)
}
