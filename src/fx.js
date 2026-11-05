import { BLOCK, HUD_ANCHORS, ORIGIN, ROOM, TUNING } from './config.js'
import { rumble as padRumble } from './pad.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'
import { centre, liquidAtPx, solidAt } from './physics.js'
import { SCARF_RED, heroFired, heroOf, stepHero } from './hero.js'

const MAX_PARTICLES = 420
const MAX_RINGS = 6
const MAX_SCORCH = 14
const F = TUNING.feel

const rand = (lo, hi) => lo + Math.random() * (hi - lo)
const pick = list => list[Math.floor(Math.random() * list.length)]
const red = `rgb(${SCARF_RED.join(',')})`

export const MATERIAL_COLOURS = {
  [M.ROCK]: ['#8a9c3e', '#5e6e30'], [M.MOSS]: ['#a8c84a', '#6f8f30'], [M.PEAT]: ['#7a5a2a', '#54401e'],
  [M.WOOD]: ['#9d7a3e', '#c49a54'], [M.METAL]: ['#a4a9ac', '#d8dcde'], [M.SCRAP]: ['#b6a080', '#7f7058'],
  [M.SAND]: ['#e2d28c', '#b8a868'], [M.BEDROCK]: ['#4a5a50', '#343f38'], [M.ICE]: ['#bff2ff', '#ffffff'],
  [M.BRICK]: ['#7a8a50', '#566238'], [M.VOLATILE]: ['#f07ae0', '#ffc0f4'], [M.GATE]: ['#b6bbbd', '#e0e4e6'],
  [M.WATER]: ['#6fd0e0', '#bff2ff'], [M.OIL]: ['#a06ab0', '#5a3a66'], [M.LAVA]: ['#ff9a2e', '#ffe84a'], [M.ACID]: ['#c8ff5a', '#7fd030'],
}

const SPARKY = new Set([M.METAL, M.GATE, M.SCRAP, M.VOLATILE])
const COLOURS = { hurt: '#ff5a4a', heal: '#7dff8a', white: '#f4f8f2', pale: '#c9d4c0', fire: '#ff9a2e', charge: '#ffe84a', magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0' }
const paint = colour => COLOURS[colour] ?? colour

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

const add = (g, particle) => {
  if (g.particles.length < MAX_PARTICLES) g.particles.push(particle)
}

export const spark = (g, x, y, vx, vy, colour, life = rand(0.14, 0.34)) =>
  add(g, { kind: 'spark', x, y, vx, vy, life, max: life, colour: paint(colour) })

export const debris = (g, x, y, vx, vy, colour, size = 1, life = rand(1, 2.2)) =>
  add(g, { kind: 'debris', x, y, vx, vy, life, max: life, colour: paint(colour), size })

export const ember = (g, x, y, colour = '#ff9a2e') => {
  const life = rand(0.5, 1.3)
  add(g, { kind: 'ember', x, y, vx: rand(-8, 8), vy: rand(-34, -14), life, max: life, colour, seed: Math.random() * 9 })
}

export const smoke = (g, x, y, vx = 0, vy = rand(-16, -6), colour = '#8c9884') => {
  const life = rand(0.35, 0.9)
  add(g, { kind: 'smoke', x, y, vx, vy, life, max: life, colour })
}

export const drop = (g, x, y, vx, vy, colour) =>
  add(g, { kind: 'drop', x, y, vx, vy, life: 1.2, max: 1.2, colour: paint(colour) })

export const bubble = (g, x, y) => {
  const life = rand(0.8, 1.6)
  add(g, { kind: 'bubble', x, y, vx: 0, vy: rand(-26, -14), life, max: life, colour: '#bff2ff', seed: Math.random() * 9 })
}

export const burstSparks = (g, x, y, colour, count, speed = 70) => {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const v = rand(speed * 0.3, speed * 1.2)
    spark(g, x, y, Math.cos(a) * v, Math.sin(a) * v, colour)
  }
}

export const chipsAt = (g, x, y, material, count) => {
  const colours = MATERIAL_COLOURS[material] ?? ['#c9d4c0']
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const v = rand(25, 95)
    debris(g, x, y, Math.cos(a) * v, Math.sin(a) * v - 30, pick(colours), Math.random() < 0.25 ? 2 : 1, rand(0.5, 1.4))
  }
}

export const dustAt = (g, x, y, count) => {
  for (let i = 0; i < count; i++) smoke(g, x, y - 1, rand(-26, 26), rand(-14, -3))
}

export const impact = (g, x, y, material, vx, vy) => {
  const d = Math.hypot(vx, vy) || 1
  const backX = -vx / d
  const backY = -vy / d
  const colours = MATERIAL_COLOURS[material] ?? ['#c9d4c0']
  const sparks = SPARKY.has(material) ? 6 : 2
  for (let i = 0; i < sparks; i++) {
    const spread = rand(-0.9, 0.9)
    const v = rand(50, 150)
    spark(g, x, y, (backX + spread * backY) * v, (backY - spread * backX) * v, SPARKY.has(material) ? '#ffe84a' : '#f4f8f2')
  }
  if (SPARKY.has(material)) return
  for (let i = 0; i < 3; i++) {
    const spread = rand(-1, 1)
    const v = rand(25, 80)
    debris(g, x, y, (backX + spread * backY) * v, (backY - spread * backX) * v - 20, pick(colours), 1, rand(0.3, 0.9))
  }
  smoke(g, x + backX * 2, y + backY * 2, backX * 8, backY * 8 - 5)
}

export const splash = (g, x, y, speed, colour = '#6fd0e0') => {
  const count = Math.min(16, 4 + Math.abs(speed) / 14)
  for (let i = 0; i < count; i++) drop(g, x + rand(-3, 3), y, rand(-46, 46), -rand(30, 60 + Math.abs(speed) * 0.5), colour)
  g.ripples.push({ x, y, age: 0, power: Math.min(1, Math.abs(speed) / 160 + 0.3) })
  if (g.ripples.length > 6) g.ripples.shift()
}

export const addLight = (g, x, y, radius, [r, gr, b], life) => {
  g.lights.push({ x, y, radius, r, g: gr, b, life, max: life })
  if (g.lights.length > 16) g.lights.shift()
}

const addRing = (g, x, y, speed, strength, life, width = 7) => {
  g.rings.push({ x, y, r: 0, speed, strength, life, max: life, width })
  if (g.rings.length > MAX_RINGS) g.rings.shift()
}

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
  const trauma = Math.min(14, g.shake)
  const amp = (trauma * trauma) / 16
  const t = g.fxClock
  const wobbleX = Math.sin(t * 61.3) + Math.sin(t * 37.1 + 1.3) * 0.7
  const wobbleY = Math.sin(t * 53.7 + 2.1) + Math.sin(t * 43.9) * 0.7
  return { x: Math.round(wobbleX * amp * 0.6 + g.kick.x), y: Math.round(wobbleY * amp * 0.6 + g.kick.y) }
}

export const shotFx = (g, p, aim) => {
  heroFired(p, aim)
  const h = heroOf(p)
  const from = h.tip
  for (let i = 0; i < 3; i++) {
    const spread = rand(-0.6, 0.6)
    const v = rand(60, 140)
    spark(g, from.x + aim.x * 2, from.y + aim.y * 2, (aim.x + spread * aim.y) * v, (aim.y - spread * aim.x) * v, '#fff3b4', rand(0.05, 0.14))
  }
  smoke(g, from.x + aim.x * 3, from.y + aim.y * 3, aim.x * 12, aim.y * 12 - 4, '#a9b6b2')
  addLight(g, from.x, from.y, 26, [1, 0.85, 0.5], 0.07)
  punch(g, -aim.x * 0.7, -aim.y * 0.7)
  rumble(g, 0.08)
}

export const wallHitFx = (g, s, material) => impact(g, s.x, s.y, material, s.vx, s.vy)

let pixelSource = () => []
export const setPixelSource = source => { pixelSource = source }

const shatter = (g, e) => {
  const c = centre(e)
  const blast = e.heavy ? 1.6 : 1
  for (const { x, y, colour } of pixelSource(e)) {
    const dx = x - c.x
    const dy = y - c.y
    const d = Math.hypot(dx, dy) || 1
    const v = rand(30, 130) * blast
    debris(g, x, y, (dx / d) * v + (e.vx ?? 0) * 0.4, (dy / d) * v - rand(30, 90), colour, Math.random() < 0.3 ? 2 : 1, rand(1, 2.6))
  }
}

export const hitFx = (g, e) => {
  const c = centre(e)
  g.aberr = Math.max(g.aberr, 0.35)
  shakeTo(g, 2.4)
  rumble(g, 0.15)
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2
    const v = rand(40, 110)
    spark(g, c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, Math.random() < 0.5 ? '#ffffff' : 'pale')
  }
}

export const killFx = (g, e) => {
  const c = centre(e)
  shatter(g, e)
  burstSparks(g, c.x, c.y, '#ffffff', 8, 100)
  for (let i = 0; i < 3; i++) smoke(g, c.x + rand(-4, 4), c.y + rand(-4, 4))
  const p = centre(g.player)
  const d = Math.hypot(c.x - p.x, c.y - p.y) || 1
  punch(g, ((c.x - p.x) / d) * 1.6, ((c.y - p.y) / d) * 1.6)
  shakeTo(g, e.heavy ? 12 : 5)
  rumble(g, e.heavy ? 1 : 0.35)
  g.aberr = Math.max(g.aberr, e.heavy ? 1 : 0.6)
  addLight(g, c.x, c.y, e.heavy ? 70 : 30, [1, 0.95, 0.8], 0.14)
  if (e.heavy) {
    addRing(g, c.x, c.y, 260, 7, 0.45)
    g.white = Math.max(g.white, 1)
    zoomPunch(g, c.x, c.y, 0.14)
    slowMo(g, 0.45, 0.3)
  }
  g.lastKill = { x: c.x, y: c.y }
}

export const roomClearFx = g => {
  const at = g.lastKill ?? centre(g.player)
  if (g.chain >= TUNING.feel.grandClear) {
    slowMo(g, 0.55, 0.22)
    zoomPunch(g, at.x, at.y, 0.2, 0.3)
  }
  g.doorPulse = 1.8
  addRing(g, at.x, at.y, 240, 3.5, 0.5, 9)
  rumble(g, 0.5)
}

const CAUSE_KICK = { CHARGE: 1, CRUSHED: 1.4, LAVA: 0.9 }

export const hurtFx = (g, p, cause) => {
  const c = centre(p)
  shakeTo(g, 8)
  rumble(g, 0.8)
  g.aberr = 1
  punch(g, -p.facing * 2 * (CAUSE_KICK[cause] ?? 1), -1)
  zoomPunch(g, c.x, c.y, 0.05)
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2
    const v = rand(30, 110)
    spark(g, c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, i % 2 ? red : '#ffffff', rand(0.2, 0.4))
  }
  g.popups.push({ x: c.x, y: p.y - 11, icon: cause, life: 1.1, colour: 'hurt' })
}

export const blastFx = (g, { x, y, reach }) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  const heavy = reach >= 2
  shakeTo(g, 5 + reach * 2.5)
  rumble(g, heavy ? 1 : 0.6)
  g.aberr = Math.max(g.aberr, heavy ? 1 : 0.7)
  addRing(g, px, py, 190 + reach * 55, 3 + reach * 2.2, 0.32 + reach * 0.06, 6 + reach)
  addLight(g, px, py, 40 + reach * 22, [1, 0.72, 0.36], 0.28)
  burstSparks(g, px, py, '#ffe84a', 8 + reach * 5, 130 + reach * 30)
  burstSparks(g, px, py, '#ff9a2e', 5 + reach * 4, 90)
  const around = []
  for (let dy = -reach - 1; dy <= reach + 1; dy++) {
    for (let dx = -reach - 1; dx <= reach + 1; dx++) {
      const m = matAt(g.world, x + dx, y + dy)
      if (props(m).solid && m !== M.BEDROCK) around.push(m)
    }
  }
  const chunks = 6 + reach * 7
  for (let i = 0; i < chunks; i++) {
    const a = Math.random() * Math.PI * 2
    const v = rand(50, 120 + reach * 40)
    const colours = MATERIAL_COLOURS[pick(around.length ? around : [M.ROCK])] ?? ['#8a9c3e']
    debris(g, px + rand(-6, 6), py + rand(-6, 6), Math.cos(a) * v, Math.sin(a) * v - 50, pick(colours), Math.random() < 0.4 ? 2 : 1, rand(0.8, 2))
  }
  for (let i = 0; i < 3 + reach * 3; i++) ember(g, px + rand(-10, 10), py + rand(-10, 10))
  for (let i = 0; i < 3 + reach * 2; i++) smoke(g, px + rand(-10, 10), py + rand(-10, 10), rand(-22, 22), rand(-26, -4), '#747a72')
  const scorches = (g.world.scorches ??= [])
  scorches.push({ x: Math.round(px), y: Math.round(py), size: Math.min(2, reach) })
  if (scorches.length > MAX_SCORCH) scorches.shift()
  if (g.blastCool <= 0) {
    g.hitstop = Math.max(g.hitstop, heavy ? F.blastStop * 1.5 : F.blastStop)
    g.blastCool = 0.3
    if (heavy) zoomPunch(g, px, py, 0.1)
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
    zoomPunch(g, c.x, c.y, 0.16)
    addRing(g, c.x, c.y, 200, 3.5, 0.45, 8)
    addLight(g, c.x, c.y, 70, [0.6, 1, 0.5], 0.5)
    g.pulse = 1
    shakeTo(g, 5)
    rumble(g, 0.6)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      const v = i % 2 ? 150 : 95
      spark(g, c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, i % 2 ? '#7dff8a' : '#ffffff', 0.42)
    }
    return false
  }
  if (g.levelBurst > 0) return false
  g.levelBurst = null
  return true
}

const launchMote = (g, x, y, target, colour) => {
  if (g.motes.length > 60) return
  const a = Math.random() * Math.PI * 2
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

const hitsWorld = (g, x, y) => solidAt(g.world, x, y)

const STEPPERS = {
  plain: (g, p, dt) => {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 200 * dt
  },
  spark: (g, p, dt) => {
    p.vx *= 1 - 3.2 * dt
    p.vy = p.vy * (1 - 3.2 * dt) + 170 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (hitsWorld(g, p.x, p.y)) p.life = 0
  },
  debris: (g, p, dt) => {
    if (p.rest && hitsWorld(g, p.x, p.y + 1)) return
    p.rest = false
    const wet = liquidAtPx(g.world, p.x, p.y)
    p.vy = Math.min(wet ? 26 : 300, p.vy + (wet ? 80 : 420) * dt)
    const nx = p.x + p.vx * dt
    if (hitsWorld(g, nx, p.y)) p.vx *= -0.45
    else p.x = nx
    const ny = p.y + p.vy * dt
    if (hitsWorld(g, p.x, ny)) {
      if (p.vy > 0 && Math.abs(p.vy) < 36) {
        p.rest = true
        p.vx = 0
        p.vy = 0
      } else {
        p.vy *= -0.42
        p.vx *= 0.65
      }
    } else p.y = ny
  },
  ember: (g, p, dt) => {
    p.seed += dt * 6
    p.x += (p.vx + Math.sin(p.seed) * 12) * dt
    p.y += p.vy * dt
    p.vy *= 1 - dt * 0.6
  },
  smoke: (g, p, dt) => {
    p.vx *= 1 - 3 * dt
    p.vy *= 1 - 1.2 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  },
  drop: (g, p, dt) => {
    p.vy += 340 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.vy > 0 && (hitsWorld(g, p.x, p.y) || liquidAtPx(g.world, p.x, p.y))) p.life = 0
  },
  bubble: (g, p, dt) => {
    p.seed += dt * 7
    p.x += Math.sin(p.seed) * 10 * dt
    p.y += p.vy * dt
    if (!liquidAtPx(g.world, p.x, p.y)) p.life = 0
  },
}

const stepParticles = (g, dt) => {
  for (const p of g.particles) {
    STEPPERS[p.kind ?? 'plain'](g, p, dt)
    p.life -= dt
  }
  g.particles = g.particles.filter(p => p.life > 0)
  if (g.particles.length > MAX_PARTICLES) g.particles.splice(0, g.particles.length - MAX_PARTICLES)
}

const splashShots = g => {
  for (const s of g.shots) {
    if (s.wet || !liquidAtPx(g.world, s.x, s.y)) continue
    s.wet = true
    splash(g, s.x, s.y, 40)
  }
}

const emitWorld = g => {
  const w = g.world
  const size = ROOM * ROOM
  const samples = 26
  for (let n = 0; n < samples; n++) {
    const i = Math.floor(Math.random() * size)
    const x = i % ROOM
    const y = Math.floor(i / ROOM)
    if (w.burn[i] > 0 && Math.random() < 0.2) ember(g, (x + Math.random()) * BLOCK, y * BLOCK, Math.random() < 0.3 ? '#ffe84a' : '#ff9a2e')
    else if (w.mat[i] === M.LAVA && matAt(w, x, y - 1) !== M.LAVA && Math.random() < 0.12) ember(g, (x + Math.random()) * BLOCK, y * BLOCK, '#ffd24a')
    else if (w.mat[i] === M.ACID && Math.random() < 0.06) ember(g, (x + Math.random()) * BLOCK, y * BLOCK, '#c8ff5a')
    else if (w.charge[i] > 0 && w.mat[i] === M.WATER && Math.random() < 0.1) spark(g, (x + Math.random()) * BLOCK, (y + Math.random()) * BLOCK, rand(-30, 30), rand(-60, 10), '#ffe84a', 0.12)
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
  if (h.stance === 'swim' && Math.random() < dt * 2.4) bubble(g, p.x + 3 + p.facing * 3, p.y + 4)
  if (h.stance === 'cling' && Math.random() < dt * 22) spark(g, p.x + (p.facing > 0 ? p.w : 0), p.y + p.h - 2, -p.facing * 12, -20, 'pale', 0.14)
  if (!grounded && p.grounded && fell > 235) {
    const c = p.x + p.w / 2
    shakeTo(g, 3.2)
    punch(g, 0, 1.3)
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
  zoomPunch(g, c.x, c.y, 0.2, 0.9)
  shakeTo(g, 11)
  rumble(g, 1)
  g.white = 1
  g.aberr = 1
  addRing(g, c.x, c.y, 200, 5, 0.5, 8)
  addLight(g, c.x, c.y, 60, [1, 0.3, 0.25], 0.6)
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
  if (g.world) emitWorld(g)
  if (g.phase === 'playing') splashShots(g)
}

const drawSpark = (ctx, p) => {
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  ctx.fillStyle = p.colour
  ctx.fillRect(x, y, 1, 1)
  const speed = Math.hypot(p.vx, p.vy)
  if (speed < 30 || p.life < p.max * 0.3) return
  const tail = Math.min(4, speed / 40)
  for (let i = 1; i <= tail; i++) ctx.fillRect(Math.round(p.x - (p.vx / speed) * i), Math.round(p.y - (p.vy / speed) * i), 1, 1)
}

const drawDebris = (ctx, p, clock) => {
  if (p.life < 0.3 && Math.floor(clock * 22) % 2) return
  ctx.fillStyle = p.max - p.life < 0.05 ? '#ffffff' : p.colour
  ctx.fillRect(Math.round(p.x), Math.round(p.y) - p.size + 1, p.size, p.size)
}

const drawEmber = (ctx, p) => {
  if (Math.sin(p.seed * 3) < -0.75) return
  ctx.fillStyle = p.life < p.max * 0.35 ? '#a03a18' : p.colour
  ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
}

const SMOKE_DOTS = [
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]],
  [[-1, 0], [1, 0], [0, -1], [2, 1]],
  [[-2, 1], [2, -1]],
]

const drawSmoke = (ctx, p) => {
  const stage = Math.min(SMOKE_DOTS.length - 1, Math.floor((1 - p.life / p.max) * SMOKE_DOTS.length))
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  ctx.fillStyle = p.colour
  for (const [dx, dy] of SMOKE_DOTS[stage]) ctx.fillRect(x + dx, y + dy, 1, 1)
}

const drawDot = (ctx, p) => {
  ctx.fillStyle = p.colour
  ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
}

const drawPlain = (ctx, p) => {
  ctx.fillStyle = paint(p.colour)
  ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
}

const DRAWERS = { plain: drawPlain, spark: drawSpark, debris: drawDebris, ember: drawEmber, smoke: drawSmoke, drop: drawDot, bubble: drawDot }

export const drawParticles = (ctx, g) => {
  for (const p of g.particles) DRAWERS[p.kind ?? 'plain'](ctx, p, g.fxClock)
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
