import { ENEMY_DEFS } from './enemies.js'
import { SPRITES } from './sprites.js'
import { drawText } from './font.js'
import { setPixelSource } from './fx.js'

const HURT = '#ff5a4a'
const FIRE = '#ff9a2e'
const CHARGE = '#ffe84a'
const FROST = '#a0e6ff'
const GAS = '#c79ae0'
const PALE = '#c9d4c0'
const ELITE_COLOURS = { burning: FIRE, charged: CHARGE, armoured: PALE }

const creatureFrames = kind => frameIndex => {
  const { sprite } = ENEMY_DEFS[kind]
  return SPRITES.creatures[sprite[frameIndex % sprite.length]]
}

const creatureArt = (e, time) => {
  const { sprite } = ENEMY_DEFS[e.kind]
  const index = e.kind === 'crawler' ? Math.floor(time * 6) % sprite.length : Math.min(e.frame, sprite.length - 1)
  return creatureFrames(e.kind)(index)[e.facing > 0 ? 0 : 1]
}

const silhouettes = new WeakMap()

const silhouette = (art, colour) => {
  const byColour = silhouettes.get(art) ?? new Map()
  silhouettes.set(art, byColour)
  if (!byColour.has(colour)) {
    const canvas = document.createElement('canvas')
    canvas.width = art.width
    canvas.height = art.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(art, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, art.width, art.height)
    byColour.set(colour, canvas)
  }
  return byColour.get(colour)
}

const pixelCache = new WeakMap()

const pixelsOf = art => {
  if (pixelCache.has(art)) return pixelCache.get(art)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  ctx.canvas.width = art.width
  ctx.canvas.height = art.height
  ctx.drawImage(art, 0, 0)
  const { data } = ctx.getImageData(0, 0, art.width, art.height)
  const pixels = []
  for (let y = 0; y < art.height; y += 2) {
    for (let x = 0; x < art.width; x += 2) {
      const i = (y * art.width + x) * 4
      if (data[i + 3] > 128) pixels.push({ dx: x, dy: y, colour: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` })
    }
  }
  pixelCache.set(art, pixels)
  return pixels
}

const artOrigin = (e, art) => ({
  x: Math.round(e.x + e.w / 2 - art.width / 2),
  y: Math.round(e.y + e.h - art.height),
})

setPixelSource(e => {
  const art = creatureArt(e, 0)
  const { x, y } = artOrigin(e, art)
  return pixelsOf(art).map(({ dx, dy, colour }) => ({ x: x + dx, y: y + dy, colour }))
})

const anims = new WeakMap()

const animOf = (e, time) => {
  if (!anims.has(e)) anims.set(e, { stretch: 0, speed: 0, grounded: e.grounded, walked: e.grounded === true, vy: 0, flash: 0, last: time })
  return anims.get(e)
}

const SPRING = 340
const DAMP = 22

const stepAnim = (e, a, time) => {
  const dt = Math.min(0.05, Math.max(0, time - a.last))
  a.last = time
  if ((e.flash ?? 0) > a.flash) a.stretch = -0.34
  a.flash = e.flash ?? 0
  if (e.grounded) a.walked = true
  if (e.grounded && !a.grounded && a.vy > 50) a.stretch = -Math.min(0.42, a.vy / 420)
  if (!e.grounded && a.grounded && e.vy < -40) a.stretch = 0.32
  a.grounded = e.grounded
  a.vy = e.vy
  a.speed += (-SPRING * a.stretch - DAMP * a.speed) * dt
  a.stretch += a.speed * dt
}

const poseOf = (e, a, time) => {
  if (e.frozen > 0) return { sx: 1, sy: 1, lean: 0, bob: 0 }
  const moving = Math.abs(e.vx) > 2
  const flyer = !a.walked
  const phase = time * 8 + (e.wander ?? 0)
  const windup = e.windup && e.stun <= 0 && !e.friendly
  const swell = windup ? 0.12 + Math.sin(time * 26) * 0.04 : e.lit ? 0.14 + Math.sin(time * 40) * 0.08 : 0
  const crouched = !flyer && e.grounded && e.cooldown < 0.14 && e.cooldown > 0 && (e.kind === 'imp' || e.kind === 'mimic') ? -0.28 : 0
  const airborne = !flyer && !e.grounded ? Math.max(-0.12, Math.min(0.2, -e.vy / 900)) : 0
  const flap = flyer ? Math.sin(phase * 1.4) * 0.07 : 0
  const stretch = a.stretch + crouched + airborne + flap
  return {
    sx: 1 + swell - stretch * 0.75,
    sy: 1 + swell + stretch,
    lean: Math.round(Math.max(-2, Math.min(2, (e.vx ?? 0) / 22))),
    bob: flyer ? Math.round(Math.sin(phase) * 1.2) : moving && e.grounded ? -Math.round(Math.abs(Math.sin(phase)) * 1) : 0,
  }
}

const stamp = (ctx, art, x, y, { sx, sy, lean, bob }) => {
  const w = Math.max(1, Math.round(art.width * sx))
  const h = Math.max(1, Math.round(art.height * sy))
  const left = x + Math.round((art.width - w) / 2)
  const top = y + art.height - h + bob
  const waist = Math.floor(h * 0.62)
  const srcWaist = Math.floor(art.height * 0.62)
  ctx.drawImage(art, 0, 0, art.width, srcWaist, left + lean, top, w, waist)
  ctx.drawImage(art, 0, srcWaist, art.width, art.height - srcWaist, left, top + waist, w, h - waist)
}

const ring = (ctx, art, x, y, pose, colour) => {
  const mask = silhouette(art, colour)
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) stamp(ctx, mask, x + dx, y + dy, pose)
}

const telegraphColour = (e, time) => {
  if (e.lit) return Math.floor(time * 20) % 2 ? '#ffffff' : FIRE
  if (e.windup && e.stun <= 0 && !e.friendly) return Math.floor(time * 13) % 2 ? '#ffffff' : HURT
  return null
}

const drawOne = (ctx, g, e) => {
  const time = g.time
  const a = animOf(e, time)
  stepAnim(e, a, time)
  if (e.iframes > 0 && (e.flash ?? 0) <= 0 && Math.floor(time * 24) % 2) return
  const art = creatureArt(e, time)
  const pose = poseOf(e, a, time)
  const jitter = e.stun > 0 && e.frozen <= 0 ? Math.round(Math.sin(time * 60)) : 0
  const { x, y } = artOrigin(e, art)
  const at = x + jitter
  if (e.elite || e.ally) ring(ctx, art, at, y, pose, e.ally ? GAS : ELITE_COLOURS[e.elite])
  stamp(ctx, art, at, y, pose)
  if (e.flash > 0) stamp(ctx, silhouette(art, '#ffffff'), at, y, pose)
  else {
    const warning = telegraphColour(e, time)
    if (warning) stamp(ctx, silhouette(art, warning), at, y, pose)
  }
  if (e.frozen > 0) {
    ctx.globalAlpha = 0.6
    stamp(ctx, silhouette(art, FROST), at, y, pose)
    ctx.globalAlpha = 1
  }
  if (e.aimAt && e.stun <= 0) {
    ctx.fillStyle = HURT
    const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 }
    const d = Math.hypot(e.aimAt.x - c.x, e.aimAt.y - c.y)
    for (let t = 6 + (time * 40) % 6; t < d; t += 6) ctx.fillRect(Math.round(c.x + ((e.aimAt.x - c.x) / d) * t), Math.round(c.y + ((e.aimAt.y - c.y) / d) * t), 1, 1)
  }
  if (e.friendly && !e.spent && e.kind !== 'mole') {
    const bob = Math.round(Math.sin(time * 4))
    drawText(ctx, '?', e.x + e.w / 2 - 1, e.y - 8 + bob, CHARGE)
  }
}

export const drawCreatures = (ctx, g, enemies) => {
  for (const e of enemies) drawOne(ctx, g, e)
}
