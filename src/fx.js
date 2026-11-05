import { BLOCK, HUD_ANCHORS, ORIGIN, TUNING } from './config.js'
import { rumble as padRumble } from './pad.js'
import { isTouchLayout } from './layout.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'
import { centre, miredAtPx } from './physics.js'
import { SCARF_RED, heroFired, heroOf, stepHero } from './hero.js'
import { rand, rnd } from './dice.js'
import { dustPuff, keepColour, spawn, stepParticles } from './particles.js'
import { stepMarks } from './marks.js'
import {
  MATERIAL_COLOURS, ashAt, blastDebris, breakAt, burstOf, dropOf, dustOf, emberAt, emitWorld, followBolts, followProjectiles,
  hitOf, hurtMatter, hushCell, impactAt, killOf, muzzleOf, sloshAt, splashAt, swimBubble, watchWorld, wetAt,
} from './matter.js'

export { MATERIAL_COLOURS, setPixelSource } from './matter.js'
export { drawParticles } from './particles.js'
export { drawMarks } from './marks.js'

const MAX_RINGS = 6
const MAX_SCORCH = 14
const F = TUNING.feel

const red = `rgb(${SCARF_RED.join(',')})`
keepColour(red)

const COLOURS = { hurt: '#ff5a4a', heal: '#7dff8a', white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a', magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0' }
const paint = colour => COLOURS[colour] ?? colour
const liquidColourAt = (g, x, y) => {
  const mat = matAt(g.world, Math.floor(x / BLOCK), Math.floor(y / BLOCK))
  return props(mat).liquid ? MATERIAL_COLOURS[mat][0] : '#6fd0e0'
}

export const createFx = () => ({
  rings: [],
  motes: [],
  lights: [],
  ripples: [],
  zoom: { x: 112, y: 112, amount: 0, hold: 0 },
  kick: { x: 0, y: 0, vx: 0, vy: 0 },
  aberr: 0,
  white: 0,
  whiteCool: 0,
  blastCool: 0,
  desat: 0,
  slow: 0,
  slowScale: 1,
  doorPulse: 0,
  chainPunch: 0,
  chainSeen: 0,
  rumble: 0,
  levelBurst: null,
  pings: { xp: 0, coin: 0 },
  fxClock: 0,
  deathSeen: false,
  door: null,
  lastKill: null,
})

export const spark = (g, x, y, vx, vy, colour, life = rand(0.14, 0.34)) => spawn(g, 'spark', x, y, vx, vy, life, paint(colour), '#ffffff')

export const debris = (g, x, y, vx, vy, colour, size = 1, life = rand(0.7, 1.6)) => {
  spawn(g, 'chip', x, y, vx, vy, life, paint(colour), paint(colour), size).turn = rand(-14, 14)
}

export const ember = (g, x, y, colour = '#ff9a2e') => emberAt(g, x, y, colour)

export const smoke = (g, x, y, vx = 0, vy = rand(-16, -6), colour = '#8c9884') => dustPuff(g, x, y, vx, vy, colour, rand(0.35, 0.9))

export const ash = (g, x, y, colour) => ashAt(g, x, y, colour)

export const drop = (g, x, y, vx, vy, colour) => dropOf(g, x, y, vx, vy, paint(colour))

export const bubble = (g, x, y) => swimBubble(g, x, y)

export const burstSparks = (g, x, y, colour, count, speed = 70) => burstOf(g, x, y, paint(colour), count, speed)

export const chipsAt = (g, x, y, material, count) => {
  hushCell(g, x, y)
  breakAt(g, x, y, material, count)
}

export const dustAt = (g, x, y, count) => dustOf(g, x, y, count)

export const impact = (g, x, y, material, vx, vy) => impactAt(g, x, y, material, vx, vy)

export const splash = (g, x, y, speed, colour) => splashAt(g, x, y, speed, paint(colour ?? liquidColourAt(g, x, y)))

export const addLight = (g, x, y, radius, [r, gr, b], life) => {
  g.lights.push({ x, y, radius, r, g: gr, b, life, max: life })
  if (g.lights.length > 16) g.lights.shift()
}

const addRing = (g, x, y, speed, strength, life, width = 7) => {
  g.rings.push({ x, y, r: 0, speed, strength, life, max: life, width })
  if (g.rings.length > MAX_RINGS) g.rings.shift()
}

export const ripple = (g, x, y, speed, strength, life, width) => addRing(g, x, y, speed, strength, life, width)

export const punch = (g, dx, dy) => {
  g.kick.vx += dx * 66
  g.kick.vy += dy * 66
}

export const zoomPunch = (g, x, y, amount, hold = 0) => {
  if (amount < g.zoom.amount) return
  Object.assign(g.zoom, { x, y, amount, hold })
}

export const slowMo = (g, time, scale) => {
  if (g.slow > time && g.slowScale <= scale) return
  g.slow = time
  g.slowScale = scale
}

export const timeScale = g => {
  if (!(g.slow > 0)) return 1
  const ease = Math.min(1, g.slow / 0.14)
  return g.slowScale + (1 - g.slowScale) * (1 - ease)
}

const shakeTo = (g, amount) => { g.shake = Math.max(g.shake, amount) }
const rumble = (g, amount) => {
  g.rumble = Math.max(g.rumble, amount)
  padRumble(amount, 90 + amount * 220)
}

export const cameraOffset = g => {
  const trauma = Math.min(11, g.shake)
  const amp = ((trauma * trauma) / 22) * (isTouchLayout() ? 0.8 : 1)
  const t = g.fxClock
  const wobbleX = Math.sin(t * 61.3) + Math.sin(t * 37.1 + 1.3) * 0.7
  const wobbleY = Math.sin(t * 53.7 + 2.1) + Math.sin(t * 43.9) * 0.7
  return { x: Math.round(wobbleX * amp * 0.6 + g.kick.x), y: Math.round(wobbleY * amp * 0.6 + g.kick.y) }
}

export const shotFx = (g, p, aim) => {
  heroFired(p, aim)
  const h = heroOf(p)
  const from = h.tip
  muzzleOf(g, from.x, from.y, aim)
  addLight(g, from.x, from.y, 26, [1, 0.85, 0.5], 0.07)
  punch(g, -aim.x * 0.35, -aim.y * 0.35)
  rumble(g, 0.08)
}

export const wallHitFx = (g, s, material) => impact(g, s.x, s.y, material, s.vx, s.vy)

export const woundFx = (g, e) => hitOf(g, e)

export const hitFx = (g, e) => {
  g.aberr = Math.max(g.aberr, 0.2)
  shakeTo(g, 1.7)
  rumble(g, 0.15)
  hitOf(g, e)
}

export const killFx = (g, e) => {
  const c = centre(e)
  killOf(g, e)
  const p = centre(g.player)
  const d = Math.hypot(c.x - p.x, c.y - p.y) || 1
  punch(g, ((c.x - p.x) / d) * 1.1, ((c.y - p.y) / d) * 1.1)
  shakeTo(g, e.heavy ? 10 : 4)
  rumble(g, e.heavy ? 1 : 0.35)
  g.aberr = Math.max(g.aberr, e.heavy ? 0.7 : 0.35)
  addLight(g, c.x, c.y, e.heavy ? 70 : 30, [1, 0.95, 0.8], 0.14)
  if (e.heavy) {
    addRing(g, c.x, c.y, 260, 7, 0.45)
    g.white = Math.max(g.white, 1)
    zoomPunch(g, c.x, c.y, 0.1)
    slowMo(g, 0.45, 0.3)
  }
  g.lastKill = { x: c.x, y: c.y }
}

export const fallFx = (g, e) => {
  const c = centre(e)
  killOf(g, e)
  burstOf(g, c.x, c.y, '#ffffff', 44, 90)
}

export const roomClearFx = g => {
  const at = g.lastKill ?? centre(g.player)
  if (g.chain >= TUNING.feel.grandClear) {
    slowMo(g, 0.55, 0.22)
    zoomPunch(g, at.x, at.y, 0.13, 0.3)
  }
  g.doorPulse = 1.8
  addRing(g, at.x, at.y, 240, 3.5, 0.5, 9)
  rumble(g, 0.5)
}

const CAUSE_KICK = { CHARGE: 1, CRUSHED: 1.4, LAVA: 0.9 }

export const hurtFx = (g, p, cause) => {
  const c = centre(p)
  shakeTo(g, 6.5)
  rumble(g, 0.8)
  g.aberr = 0.7
  punch(g, -p.facing * 1.5 * (CAUSE_KICK[cause] ?? 1), -0.8)
  zoomPunch(g, c.x, c.y, 0.025)
  hurtMatter(g, c, cause, red)
  g.popups.push({ x: c.x, y: p.y - 14, icon: cause, life: 1.1, colour: 'hurt', scale: 2 })
}

export const blastFx = (g, { x, y, reach }) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  const heavy = reach >= 2
  shakeTo(g, 4 + reach * 1.9)
  rumble(g, heavy ? 1 : 0.6)
  g.aberr = Math.max(g.aberr, heavy ? 0.7 : 0.35)
  addRing(g, px, py, 190 + reach * 55, 3 + reach * 2.2, 0.32 + reach * 0.06, 6 + reach)
  addLight(g, px, py, 40 + reach * 22, [1, 0.72, 0.36], 0.28)
  const around = []
  for (let dy = -reach - 1; dy <= reach + 1; dy++) {
    for (let dx = -reach - 1; dx <= reach + 1; dx++) {
      const m = matAt(g.world, x + dx, y + dy)
      if (props(m).solid && m !== M.BEDROCK) around.push(m)
    }
  }
  blastDebris(g, px, py, reach, around)
  const scorches = (g.world.scorches ??= [])
  scorches.push({ x: Math.round(px), y: Math.round(py), size: Math.min(2, reach) })
  if (scorches.length > MAX_SCORCH) scorches.shift()
  if (g.blastCool <= 0) {
    g.hitstop = Math.max(g.hitstop, heavy ? F.blastStop * 1.5 : F.blastStop)
    g.blastCool = 0.3
    if (heavy) zoomPunch(g, px, py, 0.07)
  }
  if (heavy && g.whiteCool <= 0) {
    g.white = 1
    g.whiteCool = 0.45
  }
}

export const levelBurstDone = g => {
  if (g.levelBurst === null) {
    const p = g.player
    const c = centre(p)
    g.levelBurst = F.levelBurst
    p.iframes = Math.max(p.iframes, F.levelBurst + 0.4)
    slowMo(g, F.levelBurst, 0.25)
    zoomPunch(g, c.x, c.y, 0.11)
    addRing(g, c.x, c.y, 200, 3.5, 0.45, 8)
    addLight(g, c.x, c.y, 70, [0.6, 1, 0.5], 0.5)
    g.pulse = 1
    shakeTo(g, 4)
    rumble(g, 0.6)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      const v = i % 2 ? 150 : 95
      spawn(g, 'spark', c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.42, i % 2 ? '#7dff8a' : '#ffffff', '#ffffff').hits = 1
    }
    return false
  }
  if (g.levelBurst > 0) return false
  g.levelBurst = null
  return true
}

const launchMote = (g, x, y, target, colour) => {
  if (g.motes.length > 60) return
  const a = rnd() * Math.PI * 2
  const v = rand(40, 110)
  g.motes.push({ x: x + ORIGIN.x, y: y + ORIGIN.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: rand(-0.06, 0), target, colour })
}

export const xpMotes = (g, { x, y }, amount) => {
  const count = Math.min(9, 2 + amount * 2)
  for (let i = 0; i < count; i++) launchMote(g, x, y, 'xp', i % 3 ? '#76d648' : '#d8ffb0')
}

export const coinMote = (g, x, y) => launchMote(g, x, y, 'coin', '#ffe84a')

const stepMotes = (g, dt) => {
  for (const m of g.motes) {
    m.age += dt
    const to = HUD_ANCHORS[m.target]
    const dx = to.x - m.x
    const dy = to.y - m.y
    const d = Math.hypot(dx, dy) || 1
    const pull = Math.max(0, m.age) * 10
    const speed = 120 + Math.max(0, m.age) * 520
    const ease = Math.min(1, pull * dt * 12)
    m.vx += ((dx / d) * speed - m.vx) * ease
    m.vy += ((dy / d) * speed - m.vy) * ease
    m.x += m.vx * dt
    m.y += m.vy * dt
    if (d < 6 && m.age > 0.1) {
      m.done = true
      g.pings[m.target] = 1
    }
  }
  g.motes = g.motes.filter(m => !m.done)
}

const splashShots = g => {
  for (const s of g.shots) {
    if (s.wet || !wetAt(g, s.x, s.y)) continue
    s.wet = true
    splash(g, s.x, s.y, 40)
  }
}

const stepHeroSide = (g, dt) => {
  const p = g.player
  if (g.phase === 'title') return
  const was = heroOf(p)
  const fell = was.lastVy
  const grounded = was.wasGrounded
  const h = stepHero(g, p, dt)
  if (g.phase !== 'playing') return
  if (h.stance === 'swim' && rnd() < dt * 2.4) bubble(g, p.x + 3 + p.facing * 3, p.y + 4)
  if (miredAtPx(g.world, p.x + p.w / 2, p.y + p.h - 1) && rnd() < dt * (2 + Math.abs(p.vx) * 0.25)) sloshAt(g, p.x + p.w / 2, p.y + p.h - 4, p.vx)
  if (h.stance === 'cling' && rnd() < dt * 22) dustPuff(g, p.x + (p.facing > 0 ? p.w : 0), p.y + p.h - 2, -p.facing * 12, -20, '#8c9884', 0.14)
  if (!grounded && p.grounded && fell > 235) {
    const c = p.x + p.w / 2
    shakeTo(g, 2.6)
    punch(g, 0, 1)
    dustAt(g, c - 3, p.y + p.h, 4)
    dustAt(g, c + 3, p.y + p.h, 4)
  }
}

const stepDanger = g => {
  const low = g.phase === 'playing' && g.player.hp <= 2
  g.danger = low ? 0.13 + Math.sin(g.fxClock * 6) * 0.07 : 0
}

const stepDeath = (g, realDt) => {
  if (g.phase !== 'dead') return
  g.desat = Math.min(1, g.desat + realDt * 0.9)
  if (g.deathSeen) return
  g.deathSeen = true
  const c = centre(g.player)
  slowMo(g, 1.1, 0.28)
  zoomPunch(g, c.x, c.y, 0.16, 0.9)
  shakeTo(g, 9)
  rumble(g, 1)
  g.white = 1
  g.aberr = 0.5
  addRing(g, c.x, c.y, 200, 5, 0.5, 8)
  addLight(g, c.x, c.y, 60, [1, 0.3, 0.25], 0.6)
  hurtMatter(g, c, g.player.lastCause, red)
  hurtMatter(g, c, null, red)
}

const decayCamera = (g, realDt) => {
  const k = g.kick
  k.vx += (-520 * k.x - 40 * k.vx) * realDt
  k.vy += (-520 * k.y - 40 * k.vy) * realDt
  k.x += k.vx * realDt
  k.y += k.vy * realDt
  g.zoom.hold -= realDt
  if (g.zoom.hold <= 0) g.zoom.amount *= Math.exp(-realDt * 6)
  g.aberr *= Math.exp(-realDt * 9)
  g.rumble = Math.max(0, g.rumble - realDt * 4)
  g.white = Math.max(0, g.white - realDt * 24)
  g.whiteCool -= realDt
  g.blastCool -= realDt
  g.slow = Math.max(0, g.slow - realDt)
  g.doorPulse = Math.max(0, g.doorPulse - realDt)
  g.chainPunch = Math.max(0, g.chainPunch - realDt * 5)
  g.pings.xp = Math.max(0, g.pings.xp - realDt * 5)
  g.pings.coin = Math.max(0, g.pings.coin - realDt * 5)
  if (g.levelBurst > 0) g.levelBurst -= realDt
}

const stepRings = (g, realDt) => {
  for (const r of g.rings) {
    r.r += r.speed * realDt
    r.life -= realDt
  }
  g.rings = g.rings.filter(r => r.life > 0)
  for (const l of g.lights) l.life -= realDt
  g.lights = g.lights.filter(l => l.life > 0)
  for (const r of g.ripples) r.age += realDt
  g.ripples = g.ripples.filter(r => r.age < 1.4)
}

export const stepFx = (g, realDt, dt) => {
  g.fxClock += realDt
  decayCamera(g, realDt)
  stepRings(g, realDt)
  stepMotes(g, realDt)
  stepDeath(g, realDt)
  stepDanger(g)
  if (g.chain > g.chainSeen) g.chainPunch = 1
  g.chainSeen = g.chain
  if (g.door) {
    g.door.t += realDt
    stepHero(g, g.player, realDt, true)
    if (g.door.t >= g.door.time) g.door = null
    return
  }
  const held = g.hitstop > 0 || g.pause > 0 || (g.menus.length > 0 && g.phase === 'playing')
  if (held) return
  stepParticles(g, dt)
  stepHeroSide(g, dt)
  if (g.world) {
    stepMarks(g, dt)
    watchWorld(g)
    emitWorld(g)
    followProjectiles(g, dt)
    followBolts(g)
  }
  if (g.phase === 'playing') splashShots(g)
}

export const drawMotes = (ctx, g) => {
  for (const m of g.motes) {
    const speed = Math.hypot(m.vx, m.vy) || 1
    ctx.fillStyle = m.colour
    ctx.fillRect(Math.round(m.x), Math.round(m.y), 2, 2)
    ctx.fillRect(Math.round(m.x - (m.vx / speed) * 3), Math.round(m.y - (m.vy / speed) * 3), 1, 1)
  }
}

export const beginDoor = (g, dir, from) => {
  g.door = { dir, from, t: 0, time: F.doorTime, heroFrom: { x: g.player.x, y: g.player.y } }
}

export const doorOffset = g => {
  if (!g.door) return null
  const t = Math.min(1, g.door.t / g.door.time)
  return { t: t * t * (3 - 2 * t), dir: g.door.dir }
}
