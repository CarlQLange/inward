import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { drawBossBar, drawReveal } from './overlay.js'
import { SPRITES } from './sprites.js'
import { drawText, textWidth } from './font.js'
import { drawMenus, drawToast } from './screens.js'
import { drawHud, drawTouchControls } from './hud.js'
import { save } from './store.js'
import { RELIC_BY_ID } from './relics.js'
import { keyOf } from './map.js'
import { drawHero } from './hero.js'
import { cameraOffset, doorOffset, drawMotes, drawParticles } from './fx.js'
import { drawScene, liquidOverlay } from './scene.js'
import { CAUSE_ICONS, drawPictogram } from './pictograms.js'
import { drawSkillEffects } from './skillart.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const COLOURS = {
  hurt: '#ff5a4a', heal: '#7dff8a',
  white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a',
  magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0',
}
const ROOM_PX = ROOM * BLOCK

const drawBolt = (ctx, bolt) => {
  ctx.fillStyle = COLOURS[bolt.colour] ?? bolt.colour ?? COLOURS.charge
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
  ctx.fillStyle = s.colour ?? (s.friendly ? '#fff3b4' : COLOURS.pale)
  for (let i = 2; i <= 6; i++) ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1)
  ctx.fillStyle = s.colour ?? '#ffffff'
  ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h)
}

const fireballColour = (f, time) => {
  if (f.acid) return ['#8ae04a', '#d8ff80']
  if (f.bomb) return [COLOURS.pale, Math.floor(time * 14) % 2 ? COLOURS.hurt : '#ffffff']
  if (f.pellet) return f.friendly ? [COLOURS.magnet, '#ffffff'] : [COLOURS.hurt, Math.floor(time * 14) % 2 ? '#ffffff' : COLOURS.hurt]
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
    if (p.icon) drawPictogram(ctx, CAUSE_ICONS[p.icon] ?? CAUSE_ICONS.DEFAULT, p.x, p.y, COLOURS[p.colour], p.scale ?? 1)
    else drawText(ctx, p.text, p.x - textWidth(String(p.text)) / 2, p.y, COLOURS[p.colour])
  }
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
  }
  ctx.fillStyle = COLOURS.hurt
  for (const f of g.fireballs) if (!f.friendly) ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, f.w + 2, f.h + 2)
}

const drawReticle = (ctx, pointer) => {
  const x = Math.round(pointer.x)
  const y = Math.round(pointer.y)
  ctx.fillStyle = COLOURS.white
  for (const [dx, dy] of [[-4, 0], [-3, 0], [3, 0], [4, 0], [0, -4], [0, -3], [0, 3], [0, 4]]) ctx.fillRect(x + dx, y + dy, 1, 1)
}

const DOOR_VECTORS = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] }

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
  drawScene(ctx, g, { ...room, theme: g.phase === 'title' ? 0 : room.theme, world: g.world, enemies: g.enemies, cards: g.cards, wares: g.wares, pickups: g.pickups }, true)
  drawSkillEffects(ctx, g)
  drawProjectiles(ctx, g)
  drawHeroLayer(ctx, g)
  drawPopups(ctx, g)
  drawBossBar(ctx, g)
  if (pointer && g.phase === 'playing' && g.menus.length === 0) drawReticle(ctx, pointer)
  if (g.looking) drawLook(ctx, g)
  drawReveal(ctx, g)
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
    if (g.menus.at(-1)?.page !== 'pause') drawHud(ctx, g)
    drawMotes(ctx, g)
    if (g.menus.length === 0) drawToast(ctx, g)
  }
  drawMenus(ctx, g)
  drawTouchControls(ctx, g)
}
