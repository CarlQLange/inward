import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, matAt } from './world.js'
import { pausedOverPit } from './moment.js'
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
import { drawActors, drawSubmergedTint, terrainLayer } from './scene.js'
import { tileLook } from './era.js'
import { CAUSE_ICONS, drawPictogram } from './pictograms.js'
import { drawSkillEffects } from './skillart.js'
import { drawBolt, drawFireball, drawShot } from './projectiles.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const COLOURS = {
  hurt: '#ff5a4a', heal: '#7dff8a',
  white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a',
  magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0',
}
const ROOM_PX = ROOM * BLOCK

const drawProjectiles = (ctx, g) => {
  drawParticles(ctx, g)
  g.shots.forEach(s => drawShot(ctx, s, g))
  g.fireballs.forEach(f => drawFireball(ctx, f, g))
  g.bolts.forEach(b => drawBolt(ctx, b, g))
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

const drawRoom = (ctx, g, pointer) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  const slide = doorOffset(g)
  if (slide) {
    const [ux, uy] = DOOR_VECTORS[slide.dir]
    const [ox, oy] = [Math.round(ux * slide.t * ROOM_PX), Math.round(uy * slide.t * ROOM_PX)]
    ctx.translate(ox, oy)
    drawActors(ctx, g, g.door.from, false)
    ctx.translate(-ox, -oy)
    ctx.translate(Math.round(-ux * (1 - slide.t) * ROOM_PX), Math.round(-uy * (1 - slide.t) * ROOM_PX))
  }
  drawActors(ctx, g, { ...room, world: g.world, enemies: g.enemies, cards: g.cards, wares: g.wares, pickups: g.pickups }, true)
  drawSkillEffects(ctx, g)
  drawProjectiles(ctx, g)
  drawHeroLayer(ctx, g)
  drawSubmergedTint(ctx, g.world)
  drawPopups(ctx, g)
  drawBossBar(ctx, g)
  if (pointer && g.phase === 'playing' && g.menus.length === 0) drawReticle(ctx, pointer)
  if (g.looking) drawLook(ctx, g)
  drawReveal(ctx, g)
}

export const shakeOf = g => (save.settings.shake ? cameraOffset(g) : { x: 0, y: 0 })

export const worldLayers = (g, depth) => {
  const theme = g.phase === 'title' ? 0 : g.rooms[keyOf(g.x, g.y)]?.theme ?? 0
  const seed = (g.x ?? 0) * 31 + (g.y ?? 0)
  return { terrain: terrainLayer(g.world, theme, tileLook(depth), seed), theme, seed }
}

export const draw = (ctx, g, pointer) => {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, VIEW.w, VIEW.h)
  const shake = shakeOf(g)
  ctx.save()
  ctx.translate(ORIGIN.x + shake.x, ORIGIN.y + shake.y)
  ctx.beginPath()
  ctx.rect(0, 0, ROOM_PX, ROOM_PX)
  ctx.clip()
  if (!pausedOverPit(g)) drawRoom(ctx, g, pointer)
  ctx.restore()
  if (g.phase !== 'title') {
    if (g.menus.at(-1)?.page !== 'pause') drawHud(ctx, g)
    drawMotes(ctx, g)
    if (g.menus.length === 0) drawToast(ctx, g)
  }
  drawMenus(ctx, g)
  drawTouchControls(ctx, g)
}
