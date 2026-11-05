import { BLOCK, ROOM, TUNING } from './config.js'
import { isTouchLayout } from './layout.js'
import { M } from './materials.js'
import { matAt } from './world.js'
import { cell, liquidAtPx, solidAt } from './physics.js'
import { CORE_RING } from './map.js'
import { rand, rnd } from './dice.js'
import { addToPile, drawMarks, stainBlock, stainCeiling, stainFloor, stainWall } from './marks.js'

const T = TUNING.particles
const LAST_ERA = T.eras.length - 1

export const eraIndex = g => Math.min(LAST_ERA, Math.max(0, Math.round((g.shownDepth ?? 0) * LAST_ERA)))
export const eraOf = g => T.eras[eraIndex(g)]
export const capOf = () => (isTouchLayout() ? T.touchCap : T.cap)
export const roomForAmbient = g => g.particles.length < capOf() * T.ambientFrom

export const many = (g, n) => {
  const want = n * eraOf(g).count * (isTouchLayout() ? T.touchCount : 1)
  const whole = Math.floor(want)
  return whole + (rnd() < want - whole ? 1 : 0)
}

const FOUR = [[48, 98, 48], [139, 172, 15], [205, 222, 145]]
const hexOf = ([r, g, b]) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
const parsed = new Map()

export const rgbOf = colour => {
  if (parsed.has(colour)) return parsed.get(colour)
  const short = colour.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)
  const long = colour.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  const fn = colour.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  const rgb = short ? short.slice(1).map(h => parseInt(h + h, 16))
    : long ? long.slice(1).map(h => parseInt(h, 16))
    : fn ? fn.slice(1).map(Number)
    : null
  parsed.set(colour, rgb)
  return rgb
}

const lumaOf = ([r, g, b]) => (0.3 * r + 0.59 * g + 0.11 * b) / 255
const fourShade = rgb => FOUR[lumaOf(rgb) < 0.3 ? 0 : lumaOf(rgb) < 0.62 ? 1 : 2]
const snapped = rgb => rgb.map(v => Math.round(v / 85) * 85)

const TONES = {
  four: colour => hexOf(fourShade(rgbOf(colour))),
  snap: colour => hexOf(snapped(rgbOf(colour))),
}

const toned = { four: new Map(), snap: new Map() }
let exempt = ''
export const keepColour = colour => { exempt = colour }

export const tone = (colour, era) => {
  if (era.tone === 'full' || colour === exempt || !rgbOf(colour)) return colour
  const seen = toned[era.tone]
  if (!seen.has(colour)) seen.set(colour, TONES[era.tone](colour))
  return seen.get(colour)
}

const mixed = new Map()
export const mix = (colour, other, amount) => {
  const key = `${colour}|${other}|${amount}`
  if (mixed.has(key)) return mixed.get(key)
  if (mixed.size > 600) mixed.clear()
  const a = rgbOf(colour) ?? [255, 255, 255]
  const b = rgbOf(other) ?? [255, 255, 255]
  const out = hexOf(a.map((v, i) => v + (b[i] - v) * amount))
  mixed.set(key, out)
  return out
}

const blank = () => ({ kind: 'spark', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, colour: '', alt: '', size: 1, spin: 0, turn: 0, seed: 0, hold: 0, hits: 0, rest: false, tag: 0, nx: 0, ny: 0, ref: null })
const pool = []
const OVERFLOW = blank()

export const spawn = (g, kind, x, y, vx, vy, life, colour, alt = colour, size = 1) => {
  const list = g.particles
  const cap = capOf()
  if (list.length >= cap || (list.length > cap * T.thinFrom && rnd() < T.thinning)) return OVERFLOW
  const era = eraOf(g)
  const p = pool.pop() ?? blank()
  const scaled = life * era.life * (isTouchLayout() ? T.touchLife : 1)
  p.kind = kind
  p.x = x
  p.y = y
  p.vx = vx
  p.vy = vy
  p.life = scaled
  p.max = scaled
  p.colour = tone(colour, era)
  p.alt = tone(alt, era)
  p.size = size
  p.spin = rnd() * 8
  p.turn = 0
  p.seed = rnd() * 9
  p.hold = 0
  p.hits = 0
  p.rest = false
  p.tag = 0
  p.nx = 0
  p.ny = 0
  p.ref = null
  list.push(p)
  return p
}

const PLAIN_WORDS = { fire: '#ff9a2e', charge: '#ffe84a', magnet: '#6fd0ff', frost: '#bff2ff', gas: '#c79ae0', hurt: '#ff5a4a', heal: '#7dff8a', white: '#f4f8f2', pale: '#c9d4c0' }

const adopt = p => {
  p.colour = PLAIN_WORDS[p.colour] ?? p.colour
  p.alt = p.colour
  p.kind = 'loose'
  p.max = p.life
  p.size = 1
  p.seed = rnd() * 9
  p.hold = 0
}

const pullOf = { x: 0, y: 0, strength: 0, atCore: false, cx: 0, cy: 0 }

const readPull = g => {
  const strength = eraOf(g).pull
  pullOf.strength = strength
  if (!strength) return
  const dx = CORE_RING - (g.x ?? CORE_RING)
  const dy = CORE_RING - (g.y ?? CORE_RING)
  const d = Math.hypot(dx, dy)
  pullOf.atCore = d === 0
  pullOf.x = d ? (dx / d) * strength : 0
  pullOf.y = d ? (dy / d) * strength : 0
  const core = pullOf.atCore ? g.enemies?.find(e => e.kind === 'core') : null
  pullOf.cx = core ? core.x + core.w / 2 : (ROOM * BLOCK) / 2
  pullOf.cy = core ? core.y + core.h / 2 : (ROOM * BLOCK) / 2
}

const drawn = (p, dt) => {
  if (!pullOf.strength) return
  if (!pullOf.atCore) {
    p.vx += pullOf.x * dt
    p.vy += pullOf.y * dt
    return
  }
  const dx = pullOf.cx - p.x
  const dy = pullOf.cy - p.y
  const d = Math.hypot(dx, dy) || 1
  p.vx += (dx / d) * pullOf.strength * dt
  p.vy += (dy / d) * pullOf.strength * dt
}

const WEST = 1
const SOUTH = 2

const air = (g, p, dt, gravity, terminal) => {
  const w = g.world
  const wet = liquidAtPx(w, p.x, p.y)
  p.vy = Math.min(wet ? terminal * 0.1 : terminal, p.vy + (wet ? gravity * 0.2 : gravity) * dt)
  if (wet) p.vx *= 1 - 4 * dt
  drawn(p, dt)
  let hit = 0
  const nx = p.x + p.vx * dt
  if (solidAt(w, nx, p.y)) {
    hit |= WEST
    p.x = p.vx > 0 ? cell(nx) * BLOCK - 1 : (cell(nx) + 1) * BLOCK
  } else p.x = nx
  const ny = p.y + p.vy * dt
  if (solidAt(w, p.x, ny)) {
    hit |= SOUTH
    p.y = p.vy > 0 ? cell(ny) * BLOCK - 1 : (cell(ny) + 1) * BLOCK
  } else p.y = ny
  return hit
}

const rebound = (p, hit, keep, rub) => {
  if (hit & WEST) p.vx *= -keep
  if (hit & SOUTH) {
    p.vy *= -keep
    p.vx *= rub
  }
}

const stillSupported = (g, p) => {
  if (!p.rest) return false
  if (solidAt(g.world, p.x, p.y + 1)) return true
  p.rest = false
  return false
}

const settle = p => {
  p.rest = true
  p.vx = 0
  p.vy = 0
  p.turn = 0
}

export const dustPuff = (g, x, y, vx, vy, colour, life = rand(0.2, 0.42)) => spawn(g, 'smoke', x, y, vx, vy, life, colour)

export const glitter = (g, x, y, colour, count, speed = 70) => {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2
    const v = rand(speed * 0.3, speed)
    spawn(g, 'spark', x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.1, 0.24), colour, '#ffffff').hits = 1
  }
}

export const glint = (g, x, y, colour, size = 2, life = 0.2) => spawn(g, 'glint', x, y, 0, 0, life, colour, '#ffffff', size)

const stain = (g, p, hit, colour, length) => {
  if (rnd() >= eraOf(g).marks) return
  const w = g.world
  if (hit & WEST) stainWall(w, p.x, p.y, Math.sign(p.vx) || 1, colour, length)
  else if (p.vy > 0) stainFloor(w, p.x, p.y, colour, length + 1)
  else stainCeiling(w, p.x, p.y, colour, length)
}

const fizzUp = (g, x, y, colour, alt, life = rand(0.35, 0.7)) => spawn(g, 'fizz', x, y, rand(-6, 6), rand(-22, -8), life, colour, alt)

const LIQUIDS = { water: 0, oil: 1, lava: 2, acid: 3, gore: 4 }
export const LIQUID = LIQUIDS

const toWall = (p, side, life) => {
  p.kind = 'run'
  p.nx = side
  p.vx = 0
  p.vy = rand(5, 16)
  p.life = life
  p.max = life
}

const land = {
  [LIQUIDS.water]: (g, p, hit) => {
    stain(g, p, hit, mix(p.colour, '#102028', 0.45), 2)
    if (p.size < 1) return
    for (let i = 0; i < 2; i++) spawn(g, 'drop', p.x, p.y - 1, rand(-34, 34) - p.vx * 0.2, rand(-46, -14), 0.35, p.colour, p.alt, 0).tag = p.tag
  },
  [LIQUIDS.oil]: (g, p, hit) => stain(g, p, hit, '#2c1c34', 4),
  [LIQUIDS.lava]: (g, p, hit) => {
    stain(g, p, hit, '#ff7a22', 2)
    for (let i = 0; i < 2; i++) spawn(g, 'ember', p.x, p.y - 1, rand(-10, 10), rand(-30, -10), rand(0.3, 0.7), '#ffd24a', '#a03a18')
  },
  [LIQUIDS.acid]: (g, p, hit) => {
    stain(g, p, hit, '#567a18', 3)
    for (let i = 0; i < 2; i++) fizzUp(g, p.x + rand(-1, 1), p.y - 1, p.colour, p.alt)
  },
  [LIQUIDS.gore]: (g, p, hit) => {
    stain(g, p, hit, mix(p.colour, '#000000', 0.45), 2)
    if (p.size >= 1) spawn(g, 'drop', p.x, p.y - 1, rand(-26, 26), rand(-30, -10), 0.3, p.colour, p.alt, 0).tag = p.tag
  },
}

const SHAPE_FRAMES = 8

const barDots = (length, a) => {
  const dots = []
  for (let i = 0; i < length; i++) {
    const t = i - (length - 1) / 2
    dots.push(Math.round(Math.cos(a) * t), Math.round(Math.sin(a) * t))
  }
  return dots
}

const bars = length => Array.from({ length: SHAPE_FRAMES }, (_, f) => barDots(length, (f / SHAPE_FRAMES) * Math.PI))

const turned = (dots, times) => {
  let out = dots
  for (let i = 0; i < times; i++) out = out.flatMap(([x, y]) => [[-y, x]])
  return out.flat()
}

const fourWays = dots => Array.from({ length: SHAPE_FRAMES }, (_, f) => turned(dots, Math.floor(f / 2)))

const SHAPES = {
  chip: [fourWays([[0, 0], [1, 0], [0, 1]]), fourWays([[0, 0], [1, 0], [-1, 0], [0, 1], [1, 1]])],
  scrap: [fourWays([[-1, 0], [0, 0], [1, 0], [1, 1]]), fourWays([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1]])],
  shard: [bars(3), bars(5)],
  splinter: [bars(3), bars(4)],
  crystal: [fourWays([[0, -1], [0, 0], [1, 0], [0, 1]]), fourWays([[0, -2], [-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [0, 1]])],
  gib: [fourWays([[0, 0], [1, 0]]), fourWays([[0, 0], [1, 0], [0, 1], [1, 1], [-1, 1]])],
  clod: [fourWays([[0, 0], [1, 0], [0, 1], [1, 1]]), fourWays([[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, -1]])],
}

const STEP = {
  loose: (g, p, dt) => {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 200 * dt
  },
  chip: (g, p, dt) => {
    if (stillSupported(g, p)) return
    p.spin += p.turn * dt
    const falling = p.vy
    const hit = air(g, p, dt, 430, 300)
    if (!hit) return
    if ((hit & SOUTH) && falling > 0 && falling < 40) return settle(p)
    if (falling > 130 && !p.hits && eraOf(g).shapes > 1) dustPuff(g, p.x, p.y - 1, rand(-14, 14), rand(-10, -2), mix(p.colour, '#8c9884', 0.6))
    p.hits += 1
    p.turn *= 0.6
    rebound(p, hit, 0.34, 0.6)
  },
  shard: (g, p, dt) => {
    p.spin += p.turn * dt
    const hit = air(g, p, dt, 310, 280)
    if (!hit) return
    glitter(g, p.x, p.y - 1, p.colour, p.size > 1 ? many(g, 5) : many(g, 3), 80)
    stain(g, p, hit, '#d4f6ff', 2)
    p.life = 0
  },
  splinter: (g, p, dt) => {
    if (stillSupported(g, p)) return
    p.seed += dt * p.turn
    const sway = Math.sin(p.seed)
    p.spin = 4 + sway * 2.4
    p.vx *= 1 - 2.8 * dt
    p.vy = Math.min(p.tag || 44, p.vy + 190 * dt)
    drawn(p, dt)
    const drift = p.vy > 0 ? sway * 26 : 0
    const nx = p.x + (p.vx + drift) * dt
    if (!solidAt(g.world, nx, p.y)) p.x = nx
    const ny = p.y + p.vy * dt
    if (solidAt(g.world, p.x, ny)) {
      if (p.vy > 0) {
        p.y = cell(ny) * BLOCK - 1
        p.spin = 0
        settle(p)
      } else p.vy = 0
    } else p.y = ny
  },
  scrap: (g, p, dt) => {
    if (stillSupported(g, p)) return
    p.spin += p.turn * dt
    p.tag = Math.max(0, p.tag - dt)
    const falling = p.vy
    const speed = Math.hypot(p.vx, p.vy)
    const hit = air(g, p, dt, 470, 340)
    if (!hit) return
    if ((hit & SOUTH) && falling > 0 && falling < 46) return settle(p)
    if (speed > 50 && p.hits < 6) {
      p.tag = 0.07
      p.hits += 1
      const up = hit & SOUTH ? -1 : 0
      for (let i = many(g, 2.4); i > 0; i--) spawn(g, 'spark', p.x, p.y, rand(-70, 70), up * rand(20, 90), rand(0.08, 0.2), '#ffe84a', '#ffffff').hits = 1
    }
    p.turn = -p.turn * 0.8
    rebound(p, hit, 0.68, 0.82)
  },
  grain: (g, p, dt) => {
    p.vx *= 1 - 2.4 * dt
    const hit = air(g, p, dt, 340, 210)
    if (hit & WEST) p.vx = 0
    if (!(hit & SOUTH)) return
    if (p.vy > 0) {
      if (p.tag && eraOf(g).marks) addToPile(g.world, p.x, p.y, p.colour)
      p.life = 0
    } else p.vy = 0
  },
  clod: (g, p, dt) => {
    p.spin += p.turn * dt
    if (p.tag && rnd() < dt * 10 && eraOf(g).shapes > 1) dustPuff(g, p.x, p.y, rand(-4, 4), rand(-8, 2), mix(p.colour, '#000000', 0.25), 0.26)
    const hit = air(g, p, dt, 380, 300)
    if (!hit) return
    stain(g, p, hit, mix(p.colour, '#000000', 0.2), 3)
    for (let i = many(g, 2); i > 0; i--) spawn(g, 'grain', p.x, p.y - 1, rand(-34, 34), rand(-40, -10), rand(0.25, 0.5), p.alt)
    p.life = 0
  },
  crystal: (g, p, dt) => {
    p.spin += p.turn * dt
    const hit = air(g, p, dt, 140, 120)
    if (!hit) return
    glint(g, p.x, p.y, p.alt, 2)
    p.hits += 1
    if (p.hits > 2) {
      spawn(g, 'pop', p.x, p.y, 0, 0, 0.16, p.alt, p.alt, 4)
      p.life = 0
    }
    rebound(p, hit, 0.6, 0.85)
  },
  gib: (g, p, dt) => {
    p.spin += p.turn * dt
    p.seed -= dt
    if (p.seed < 0 && eraOf(g).shapes > 1) {
      p.seed = rand(0.05, 0.12)
      const d = spawn(g, 'drop', p.x, p.y, p.vx * 0.2, p.vy * 0.2, 0.35, p.alt, p.alt, 0)
      d.tag = LIQUIDS.gore
    }
    const hit = air(g, p, dt, 430, 320)
    if (!hit) return
    land[LIQUIDS.gore](g, p, hit)
    if (hit & WEST) toWall(p, Math.sign(p.vx) || 1, rand(0.5, 1.2))
    else p.life = 0
  },
  run: (g, p, dt) => {
    p.y += p.vy * dt
    const onWall = solidAt(g.world, p.x + p.nx, p.y)
    if (!onWall || solidAt(g.world, p.x, p.y + 1)) p.life = 0
  },
  spark: (g, p, dt) => {
    p.vx *= 1 - 3 * dt
    p.vy *= 1 - 3 * dt
    const hit = air(g, p, dt, 170, 400)
    if (!hit) return
    if (p.hits || eraOf(g).shapes < 2) p.life = 0
    p.hits = 1
    rebound(p, hit, 0.5, 0.7)
  },
  ember: (g, p, dt) => {
    p.seed += dt * 6
    p.x += (p.vx + Math.sin(p.seed) * 12) * dt
    p.y += p.vy * dt
    p.vy = p.tag ? Math.min(80, p.vy + 150 * dt) : p.vy * (1 - dt * 0.6)
    if (solidAt(g.world, p.x, p.y)) p.life = Math.min(p.life, 0.08)
  },
  ash: (g, p, dt) => {
    if (p.rest) return
    p.seed += dt * 2.2
    p.vy = Math.min(14, p.vy + 26 * dt)
    p.vx *= 1 - 1.6 * dt
    drawn(p, dt * 0.5)
    p.x += (p.vx + Math.sin(p.seed) * 13) * dt
    p.y += p.vy * dt
    if (solidAt(g.world, p.x, p.y)) {
      p.rest = true
      p.life = Math.min(p.life, 0.5)
    }
  },
  smoke: (g, p, dt) => {
    p.vx *= 1 - 3 * dt
    p.vy *= 1 - 1.2 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
  },
  steam: (g, p, dt) => {
    p.seed += dt * 4
    p.vy *= 1 - 0.9 * dt
    p.x += (p.vx + Math.sin(p.seed) * 9) * dt
    p.y += p.vy * dt
    if (solidAt(g.world, p.x, p.y)) p.life = Math.min(p.life, 0.08)
  },
  drop: (g, p, dt) => {
    const hit = air(g, p, dt, p.tag === LIQUIDS.oil ? 240 : 360, p.tag === LIQUIDS.oil ? 150 : 340)
    if (p.vy > 0 && liquidAtPx(g.world, p.x, p.y)) {
      if (p.size >= 1) g.ripples.push({ x: p.x, y: p.y, age: 0, power: 0.12 })
      if (g.ripples.length > 6) g.ripples.shift()
      p.life = 0
      return
    }
    if (!hit) return
    land[p.tag]?.(g, p, hit)
    if ((hit & WEST) && p.size >= 1 && p.tag !== LIQUIDS.lava) toWall(p, Math.sign(p.vx) || 1, rand(0.4, 0.9))
    else p.life = 0
  },
  bubble: (g, p, dt) => {
    p.seed += dt * 7
    p.x += Math.sin(p.seed) * 10 * dt
    p.y += p.vy * dt
    if (liquidAtPx(g.world, p.x, p.y)) return
    spawn(g, 'pop', p.x, p.y, 0, 0, 0.12, p.colour, p.colour, 3)
    p.life = 0
  },
  fizz: (g, p, dt) => {
    p.seed += dt * 16
    p.vy -= 46 * dt
    p.x += (p.vx + Math.sin(p.seed) * 16) * dt
    p.y += p.vy * dt
    const end = p.life - dt <= 0
    if (!end && !solidAt(g.world, p.x, p.y)) return
    spawn(g, 'pop', p.x, p.y, 0, 0, 0.1, p.alt, p.alt, 2)
    p.life = 0
  },
  crawl: (g, p, dt) => {
    const w = g.world
    p.seed += dt * 30
    let left = p.turn * dt
    while (left > 0) {
      const stride = Math.min(left, 1)
      left -= stride
      p.x += p.vx * stride
      p.y += p.vy * stride
      if (solidAt(w, p.x + p.vx, p.y + p.vy)) {
        const [tx, ty] = [p.vx, p.vy]
        p.vx = p.nx
        p.vy = p.ny
        p.nx = -tx
        p.ny = -ty
      } else if (!solidAt(w, p.x - p.nx, p.y - p.ny)) {
        const [tx, ty] = [p.vx, p.vy]
        p.x -= p.nx
        p.y -= p.ny
        p.vx = -p.nx
        p.vy = -p.ny
        p.nx = tx
        p.ny = ty
      }
    }
  },
  flame: (g, p, dt) => {
    p.seed += dt * 13
    p.vy *= 1 - 1.5 * dt
    p.x += (p.vx + Math.sin(p.seed) * 8) * dt
    p.y += p.vy * dt
    if (solidAt(g.world, p.x, p.y)) p.life = Math.min(p.life, 0.05)
  },
  wisp: (g, p, dt) => {
    p.seed += dt * 3
    p.vx *= 1 - dt
    p.vy *= 1 - 0.5 * dt
    p.x += (p.vx + Math.cos(p.seed) * 11) * dt
    p.y += (p.vy + Math.sin(p.seed) * 7) * dt
  },
  frost: (g, p, dt) => {
    p.seed += dt * 2.6
    p.vx *= 1 - 3 * dt
    p.vy = Math.min(11, p.vy + 40 * dt)
    p.x += (p.vx + Math.sin(p.seed) * 5) * dt
    p.y += p.vy * dt
    if (solidAt(g.world, p.x, p.y)) p.life = Math.min(p.life, 0.05)
  },
  filing: (g, p, dt) => {
    const dx = p.nx - p.x
    const dy = p.ny - p.y
    const d = Math.hypot(dx, dy) || 1
    p.vx += (dx / d) * 900 * dt
    p.vy += (dy / d) * 900 * dt
    p.vx *= 1 - 3 * dt
    p.vy *= 1 - 3 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (d < 3 && p.max - p.life > 0.08) p.life = 0
  },
  soul: (g, p, dt) => {
    p.seed += dt * 5
    p.vx += Math.cos(p.seed) * 170 * dt
    p.vy += Math.sin(p.seed) * 170 * dt - 34 * dt
    p.vx *= 1 - 1.5 * dt
    p.vy *= 1 - 1.5 * dt
    drawn(p, dt * 2)
    p.x += p.vx * dt
    p.y += p.vy * dt
  },
  mote: (g, p, dt) => {
    p.seed += dt
    p.x += (p.vx + Math.sin(p.seed) * 4) * dt
    p.y += (p.vy + Math.cos(p.seed * 0.7) * 3) * dt
  },
  ghost: (g, p, dt) => { p.spin += dt },
  fork: () => {},
  glint: () => {},
  pop: () => {},
  ray: (g, p, dt) => { p.spin += p.turn * dt },
}

export const stepParticles = (g, dt) => {
  readPull(g)
  const list = g.particles
  let kept = 0
  for (let i = 0; i < list.length; i++) {
    const p = list[i]
    if (p.kind === undefined) adopt(p)
    if (p.hold > 0) p.hold -= dt
    else {
      STEP[p.kind](g, p, dt)
      p.life -= dt
    }
    if (p.life > 0) list[kept++] = p
    else if (pool.length < 600) {
      p.ref = null
      pool.push(p)
    }
  }
  list.length = kept
}

const actorCells = new Uint8Array(ROOM * ROOM)
let actorList = []

const paintActors = g => {
  for (const key of actorList) actorCells[key] = 0
  actorList = []
  const add = e => {
    if (!e || e.stowed) return
    const left = Math.max(0, cell(e.x - 2))
    const right = Math.min(ROOM - 1, cell(e.x + e.w + 2))
    const top = Math.max(0, cell(e.y - 2))
    const bottom = Math.min(ROOM - 1, cell(e.y + e.h + 2))
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        actorCells[y * ROOM + x] = 1
        actorList.push(y * ROOM + x)
      }
    }
  }
  add(g.player)
  g.enemies?.forEach(add)
}

const overActor = (x, y) => {
  const cx = x >> 3
  const cy = y >> 3
  return cx >= 0 && cy >= 0 && cx < ROOM && cy < ROOM && actorCells[cy * ROOM + cx] === 1
}

let ink = ''
const dot = (ctx, colour, x, y, w = 1, h = 1) => {
  if (colour !== ink) {
    ctx.fillStyle = colour
    ink = colour
  }
  ctx.fillRect(x, y, w, h)
}

export const softDisc = (ctx, x, y, radius, colour, alpha) => {
  ctx.fillStyle = colour
  ink = colour
  for (let layer = radius > 3 ? 3 : 2; layer > 0; layer--) {
    const r = Math.max(1, Math.round((radius * layer) / (radius > 3 ? 3 : 2)))
    const narrow = Math.ceil(r * 0.6)
    ctx.globalAlpha = alpha * 0.5
    ctx.fillRect(x - r, y - narrow, r * 2 + 1, narrow * 2 + 1)
    ctx.fillRect(x - narrow, y - r, narrow * 2 + 1, r - narrow)
    ctx.fillRect(x - narrow, y + narrow + 1, narrow * 2 + 1, r - narrow)
  }
}

const glowX = new Float32Array(T.glowCap)
const glowY = new Float32Array(T.glowCap)
const glowR = new Uint8Array(T.glowCap)
const glowA = new Float32Array(T.glowCap)
const glowC = new Array(T.glowCap)
let glows = 0
let glowLimit = 0

const halo = (x, y, radius, colour, strength) => {
  if (glows >= glowLimit) return
  glowX[glows] = x
  glowY[glows] = y
  glowR[glows] = radius
  glowA[glows] = strength
  glowC[glows] = colour
  glows += 1
}

const flushGlows = ctx => {
  if (!glows) return
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < glows; i++) {
    softDisc(ctx, glowX[i], glowY[i], glowR[i], glowC[i], glowA[i])
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  glows = 0
}

const lit = (era, p, radius, colour, strength = 0.8) => {
  if (era.glow) halo(Math.round(p.x), Math.round(p.y), radius, colour, era.glow * strength)
}

const square = (ctx, p) => {
  const s = p.size >= 2 ? 2 : 1
  dot(ctx, p.colour, Math.round(p.x), Math.round(p.y) - s + 1, s, s)
}

const tumble = (ctx, p, era, set, clock, top = p.colour) => {
  if (era.shapes === 0) return square(ctx, p)
  const frames = SHAPES[set][p.size >= 2 ? 1 : 0]
  const whole = era.shapes === 1 ? Math.floor(p.seed) * 2 + (Math.floor(clock * 7 + p.seed) & 1) * 2 : Math.floor(p.spin)
  const dots = frames[((whole % SHAPE_FRAMES) + SHAPE_FRAMES) % SHAPE_FRAMES]
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  for (let i = 0; i < dots.length; i += 2) dot(ctx, top, x + dots[i], y + dots[i + 1])
  if (era.shapes > 1 && p.alt !== top) dot(ctx, p.alt, x + dots[0], y + dots[1])
}

const line = (ctx, colour, ax, ay, bx, by) => {
  const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0
    dot(ctx, colour, Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t))
  }
}

const jitter = (seed, spread) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * spread

const SMOKE_DOTS = [
  [0, 0, 1, 0],
  [0, 0, 1, 0, 0, 1, 1, 1],
  [0, -1, -1, 0, 0, 0, 1, 0, 0, 1],
  [-1, 0, 1, 0, 0, -1, 2, 1],
  [-2, 1, 2, -1],
]

const billow = (ctx, p, era, grow) => {
  const age = 1 - p.life / p.max
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  if (overActor(x, y)) return
  if (era.soft) {
    const r = 1 + Math.round(age * grow) + (p.size >= 2 ? 1 : 0)
    softDisc(ctx, x, y, r, p.colour, (1 - age) * 0.6)
    ctx.globalAlpha = 1
    return
  }
  if (era.shapes === 0) return dot(ctx, p.colour, x, y, 2, 2)
  const dots = SMOKE_DOTS[Math.min(SMOKE_DOTS.length - 1, Math.floor(age * SMOKE_DOTS.length))]
  for (let i = 0; i < dots.length; i += 2) dot(ctx, p.colour, x + dots[i], y + dots[i + 1])
}

const FLAME_RAMP = ['#ffffff', '#ffe84a', '#ff9a2e', '#d4481c', '#6e2414']
const flameColour = (age, era) => tone(FLAME_RAMP[Math.min(FLAME_RAMP.length - 1, Math.floor(age * FLAME_RAMP.length))], era)

const RING_DOTS = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]]

const DRAW = {
  loose: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    dot(ctx, p.colour, x, y)
    const speed = Math.hypot(p.vx, p.vy)
    if (era.tail && speed > 40) {
      const tail = Math.min(era.tail, speed / 40)
      for (let i = 1; i <= tail; i++) dot(ctx, p.colour, Math.round(p.x - (p.vx / speed) * i), Math.round(p.y - (p.vy / speed) * i))
    }
    lit(era, p, 2, p.colour, 0.4)
  },
  chip: (ctx, p, era, clock) => tumble(ctx, p, era, 'chip', clock),
  shard: (ctx, p, era, clock) => {
    tumble(ctx, p, era, 'shard', clock, Math.floor(p.spin) % 4 === 0 && era.shapes > 1 ? '#ffffff' : p.colour)
    if (era.glow > 0.5 && Math.floor(p.spin) % 4 === 0) lit(era, p, 2, '#bff2ff', 0.5)
  },
  splinter: (ctx, p, era, clock) => tumble(ctx, p, era, 'splinter', clock),
  scrap: (ctx, p, era, clock) => {
    tumble(ctx, p, era, 'scrap', clock, p.tag > 0 ? '#ffffff' : p.colour)
    if (p.tag > 0) lit(era, p, 3, '#ffe84a', 0.7)
  },
  grain: (ctx, p) => dot(ctx, p.colour, Math.round(p.x), Math.round(p.y)),
  clod: (ctx, p, era, clock) => tumble(ctx, p, era, 'clod', clock),
  crystal: (ctx, p, era, clock) => {
    const shimmer = Math.floor(clock * 12 + p.seed) % 3
    tumble(ctx, p, era, 'crystal', clock, era.shapes > 1 ? [p.colour, p.alt, '#ffffff'][shimmer] : p.colour)
    lit(era, p, p.size >= 2 ? 3 : 2, p.colour, 0.35)
  },
  gib: (ctx, p, era, clock) => tumble(ctx, p, era, 'gib', clock),
  run: (ctx, p) => dot(ctx, p.colour, Math.round(p.x), Math.round(p.y), 1, 2),
  spark: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    const speed = Math.hypot(p.vx, p.vy)
    if (era.tail && speed > 30 && p.life > p.max * 0.25) {
      const tail = Math.min(era.tail, speed / 36)
      for (let i = 1; i <= tail; i++) dot(ctx, p.colour, Math.round(p.x - (p.vx / speed) * i), Math.round(p.y - (p.vy / speed) * i))
    }
    dot(ctx, era.shapes > 1 && p.life > p.max * 0.5 ? p.alt : p.colour, x, y)
    lit(era, p, 2, p.colour, 0.55)
  },
  ember: (ctx, p, era) => {
    const age = 1 - p.life / p.max
    if (age > 0.6 && Math.sin(p.seed * 5) < -0.3) return
    const hot = age < 0.35 ? p.colour : age < 0.7 ? mix(p.colour, '#c04418', 0.6) : p.alt
    dot(ctx, tone(hot, era), Math.round(p.x), Math.round(p.y))
    if (age < 0.7) lit(era, p, 2, p.colour, 0.5)
  },
  ash: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    dot(ctx, p.colour, x, y)
    if (era.shapes > 1 && p.size >= 2) dot(ctx, p.colour, x + (Math.sin(p.seed) > 0 ? 1 : -1), y)
  },
  smoke: (ctx, p, era) => billow(ctx, p, era, 3),
  steam: (ctx, p, era) => billow(ctx, p, era, 2),
  drop: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    dot(ctx, p.colour, x, y)
    if (era.shapes > 0 && p.size >= 1) {
      const speed = Math.hypot(p.vx, p.vy)
      if (speed > 70) dot(ctx, p.colour, Math.round(p.x - p.vx / speed), Math.round(p.y - p.vy / speed))
      if (era.shapes > 1) dot(ctx, p.alt, x, y)
    }
    if (p.tag === LIQUID.lava) lit(era, p, 2, '#ff9a2e', 0.7)
  },
  bubble: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (era.shapes < 2 || p.size < 2) return dot(ctx, p.colour, x, y)
    dot(ctx, p.colour, x - 1, y)
    dot(ctx, p.colour, x + 1, y)
    dot(ctx, p.colour, x, y - 1)
    dot(ctx, p.colour, x, y + 1)
  },
  fizz: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    if (era.shapes < 2 || p.life > p.max * 0.5) {
      dot(ctx, p.colour, x, y)
      return
    }
    dot(ctx, p.colour, x - 1, y)
    dot(ctx, p.colour, x + 1, y)
    dot(ctx, p.colour, x, y - 1)
    dot(ctx, p.colour, x, y + 1)
    lit(era, p, 2, p.colour, 0.15)
  },
  pop: (ctx, p, era) => {
    const r = Math.max(1, (1 - p.life / p.max) * p.size)
    for (const [ux, uy] of RING_DOTS) dot(ctx, p.colour, Math.round(p.x + ux * r), Math.round(p.y + uy * r))
    if (r < 6) lit(era, p, Math.ceil(r) + 1, p.colour, 0.3)
  },
  crawl: (ctx, p, era, clock) => {
    if (Math.floor(clock * 40 + p.tag) % 5 === 0) return
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    const reach = 2 + era.tail
    for (let i = 1; i <= reach; i++) {
      const wobble = Math.round(jitter(Math.floor(clock * 24) + i + p.tag, 1.4))
      dot(ctx, i < 3 ? p.colour : p.alt, Math.round(x - p.vx * i + p.nx * Math.abs(wobble)), Math.round(y - p.vy * i + p.ny * Math.abs(wobble)))
    }
    dot(ctx, '#ffffff', x, y)
    lit(era, p, 3, p.colour, 0.7)
  },
  fork: (ctx, p, era, clock) => {
    const tick = Math.floor(clock * 30) + p.seed
    let ax = p.x
    let ay = p.y
    const joints = era.shapes > 1 ? 3 : 2
    for (let i = 1; i <= joints; i++) {
      const t = i / joints
      const bx = p.x + p.vx * t + (i < joints ? jitter(tick + i, 5) : 0)
      const by = p.y + p.vy * t + (i < joints ? jitter(tick + i + 9, 5) : 0)
      line(ctx, p.colour, ax, ay, bx, by)
      ax = bx
      ay = by
    }
    lit(era, p, 4, p.alt, 0.5)
  },
  flame: (ctx, p, era) => {
    const age = 1 - p.life / p.max
    const colour = flameColour(age, era)
    const tall = era.shapes === 0 ? 1 : Math.max(1, Math.round(p.size * (1 - age) * 3))
    dot(ctx, colour, Math.round(p.x), Math.round(p.y) - tall + 1, 1, tall)
    if (era.shapes > 1 && tall > 1 && p.size >= 2) dot(ctx, colour, Math.round(p.x) + 1, Math.round(p.y) - tall + 2, 1, tall - 1)
    if (age < 0.6) lit(era, p, p.size >= 2 ? 4 : 2, '#ff9a2e', 0.5)
  },
  wisp: (ctx, p, era) => billow(ctx, p, era, 4),
  frost: (ctx, p, era) => {
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    dot(ctx, p.colour, x, y)
    if (era.shapes < 2 || p.size < 2) return
    const flip = Math.sin(p.seed) > 0
    dot(ctx, p.alt, x + (flip ? 1 : -1), y - 1)
    dot(ctx, p.alt, x + (flip ? -1 : 1), y + 1)
    dot(ctx, p.alt, x, y - (flip ? 1 : 0))
  },
  glint: (ctx, p, era) => {
    const up = 1 - Math.abs(1 - (p.life / p.max) * 2)
    const arm = Math.round(up * p.size)
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    dot(ctx, p.alt, x, y)
    if (era.shapes === 0) return
    for (let i = 1; i <= arm; i++) {
      dot(ctx, p.colour, x + i, y)
      dot(ctx, p.colour, x - i, y)
      dot(ctx, p.colour, x, y + i)
      dot(ctx, p.colour, x, y - i)
    }
    lit(era, p, arm + 2, p.colour, 0.7)
  },
  filing: (ctx, p, era) => {
    const speed = Math.hypot(p.vx, p.vy) || 1
    dot(ctx, p.colour, Math.round(p.x), Math.round(p.y))
    if (era.shapes > 0) dot(ctx, p.alt, Math.round(p.x - p.vx / speed), Math.round(p.y - p.vy / speed))
  },
  soul: (ctx, p, era) => {
    const speed = Math.hypot(p.vx, p.vy) || 1
    const tail = Math.min(era.tail, speed / 22)
    for (let i = 1; i <= tail; i++) dot(ctx, i > 2 ? p.alt : p.colour, Math.round(p.x - (p.vx / speed) * i), Math.round(p.y - (p.vy / speed) * i))
    dot(ctx, '#ffffff', Math.round(p.x), Math.round(p.y))
    lit(era, p, 3, p.colour, 0.6)
  },
  mote: (ctx, p) => {
    const up = 1 - Math.abs(1 - (p.life / p.max) * 2)
    ctx.globalAlpha = up * 0.5
    dot(ctx, p.colour, Math.round(p.x), Math.round(p.y))
    ctx.globalAlpha = 1
  },
  ghost: (ctx, p, era) => {
    const age = 1 - p.life / p.max
    const swell = 1 + age * p.size
    ctx.globalAlpha = (1 - age) * 0.9
    const dots = p.ref
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i]
      dot(ctx, age < 0.25 ? p.colour : d.colour, Math.round(p.x + (d.x - p.x) * swell), Math.round(p.y + (d.y - p.y) * swell), 2, 2)
    }
    ctx.globalAlpha = 1
  },
  ray: () => {},
}

const drawRays = (ctx, g) => {
  let drawing = false
  for (const p of g.particles) {
    if (p.kind !== 'ray' || p.hold > 0) continue
    if (!drawing) {
      ctx.globalCompositeOperation = 'lighter'
      drawing = true
    }
    const up = Math.min(1, (p.life / p.max) * 1.5)
    const a = p.spin
    const half = p.tag
    ctx.globalAlpha = up * 0.38
    ctx.fillStyle = p.colour
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + Math.cos(a - half) * p.size, p.y + Math.sin(a - half) * p.size)
    ctx.lineTo(p.x + Math.cos(a + half) * p.size, p.y + Math.sin(a + half) * p.size)
    ctx.closePath()
    ctx.fill()
  }
  if (!drawing) return
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ink = ''
}

export const drawParticles = (ctx, g) => {
  drawMarks(ctx, g)
  const era = eraOf(g)
  const clock = g.fxClock ?? 0
  paintActors(g)
  ink = ''
  glows = 0
  glowLimit = Math.min(T.glowCap, isTouchLayout() ? T.touchGlowCap : T.glowCap)
  for (const p of g.particles) {
    if (p.kind === undefined) adopt(p)
    if (p.hold > 0) {
      dot(ctx, '#ffffff', Math.round(p.x), Math.round(p.y), 1, 1)
      continue
    }
    const fadeFrom = Math.min(0.3, p.max * 0.5)
    if (p.life < fadeFrom) {
      if (!era.alpha) {
        if (Math.floor(clock * 22) & 1) continue
      } else if (p.kind !== 'mote' && p.kind !== 'ghost') ctx.globalAlpha = Math.max(0.15, p.life / fadeFrom)
    }
    DRAW[p.kind](ctx, p, era, clock)
    ctx.globalAlpha = 1
  }
  drawRays(ctx, g)
  flushGlows(ctx)
  ink = ''
}

export const liquidTagOf = mat => ({ [M.WATER]: LIQUID.water, [M.OIL]: LIQUID.oil, [M.LAVA]: LIQUID.lava, [M.ACID]: LIQUID.acid })[mat] ?? LIQUID.water
export const stainCell = (g, cx, cy, colour) => { if (rnd() < eraOf(g).marks) stainBlock(g.world, cx, cy, colour) }
export const atMat = (g, x, y) => matAt(g.world, cell(x), cell(y))
