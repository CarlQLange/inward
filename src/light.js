import { BLOCK, ROOM } from './config.js'
import { M, props } from './materials.js'
import { heroOf } from './hero.js'

export const LIGHT_SIZE = 112
const TEXEL = (ROOM * BLOCK) / LIGHT_SIZE
const AREA = LIGHT_SIZE * LIGHT_SIZE
const ROOM_PX = ROOM * BLOCK
const MARCH = 3
const GRAZE = 5

const channels = () => [new Float32Array(AREA), new Float32Array(AREA), new Float32Array(AREA)]
const live = channels()
const still = channels()
const beams = new Float32Array(AREA)
const bytes = new Uint8Array(AREA * 4)
const solid = new Uint8Array(ROOM * ROOM)

const FIRE = [1, 0.55, 0.2]
const LAVA = [1, 0.42, 0.14]
const CHARGE = [1, 0.92, 0.4]
const LAMP = [1, 0.86, 0.6]
const SHOT = [0.9, 0.9, 0.7]
const HOT_SHOT = [1, 0.5, 0.2]
const CORE = [0.45, 0.85, 1]
const ACID = [0.55, 1, 0.25]
const VOLATILE = [1, 0.45, 0.95]

const cellOf = (x, y) => (x < 0 || y < 0 || x >= ROOM_PX || y >= ROOM_PX ? 1 : solid[((y / BLOCK) | 0) * ROOM + ((x / BLOCK) | 0)])

const blocked = (x0, y0, x1, y1, length) => {
  const steps = Math.floor((length - GRAZE) / MARCH)
  if (steps < 1) return false
  const ux = ((x1 - x0) / length) * MARCH
  const uy = ((y1 - y0) / length) * MARCH
  let x = x0 + (ux / MARCH) * GRAZE
  let y = y0 + (uy / MARCH) * GRAZE
  for (let s = 0; s < steps; s++) {
    if (cellOf(x, y)) return true
    x += ux
    y += uy
  }
  return false
}

const lightStart = (px, py) => {
  if (!cellOf(px, py)) return [px, py]
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (!cellOf(px + dx * BLOCK, py + dy * BLOCK)) return [px + dx * BLOCK, py + dy * BLOCK]
  return [px, py]
}

const splat = (into, px, py, radius, [r, g, b], power = 1) => {
  const [red, green, blue] = into
  const x0 = Math.max(0, Math.floor((px - radius) / TEXEL))
  const x1 = Math.min(LIGHT_SIZE - 1, Math.ceil((px + radius) / TEXEL))
  const y0 = Math.max(0, Math.floor((py - radius) / TEXEL))
  const y1 = Math.min(LIGHT_SIZE - 1, Math.ceil((py + radius) / TEXEL))
  const inverse = 1 / (radius * radius)
  const [sx, sy] = lightStart(px, py)
  for (let y = y0; y <= y1; y++) {
    const ty = (y + 0.5) * TEXEL
    const dy = ty - py
    for (let x = x0; x <= x1; x++) {
      const tx = (x + 0.5) * TEXEL
      const dx = tx - px
      const fall = 1 - (dx * dx + dy * dy) * inverse
      if (fall <= 0) continue
      const reach = Math.hypot(sx - tx, sy - ty)
      if (reach > 0.001 && blocked(tx, ty, sx, sy, reach)) continue
      const v = fall * fall * power
      const i = y * LIGHT_SIZE + x
      red[i] += r * v
      green[i] += g * v
      blue[i] += b * v
    }
  }
}

const cone = (into, px, py, dir, reach, spread, [r, g, b], power) => {
  const [red, green, blue] = into
  const x0 = Math.max(0, Math.floor((px - reach) / TEXEL))
  const x1 = Math.min(LIGHT_SIZE - 1, Math.ceil((px + reach) / TEXEL))
  const y0 = Math.max(0, Math.floor((py - reach) / TEXEL))
  const y1 = Math.min(LIGHT_SIZE - 1, Math.ceil((py + reach) / TEXEL))
  for (let y = y0; y <= y1; y++) {
    const ty = (y + 0.5) * TEXEL
    const dy = ty - py
    for (let x = x0; x <= x1; x++) {
      const tx = (x + 0.5) * TEXEL
      const dx = tx - px
      const d = Math.hypot(dx, dy) || 1
      const along = (dx * dir.x + dy * dir.y) / d
      if (along < spread || d > reach) continue
      if (blocked(tx, ty, px, py, d)) continue
      const v = ((along - spread) / (1 - spread)) * (1 - d / reach) * power
      const i = y * LIGHT_SIZE + x
      red[i] += r * v
      green[i] += g * v
      blue[i] += b * v
    }
  }
}

const flicker = (x, y, time) => 0.75 + 0.25 * Math.sin(time * 13 + (x * 7 + y * 13))

const CLUSTER = 3
const BINS = Math.ceil(ROOM / CLUSTER)
const FIRE_BUDGET = 10
const CHARGE_BUDGET = 6

const emptyBins = () => ({ n: new Uint16Array(BINS * BINS), x: new Float32Array(BINS * BINS), y: new Float32Array(BINS * BINS) })
const fireBins = emptyBins()
const chargeBins = emptyBins()

const clearBins = bins => {
  bins.n.fill(0)
  bins.x.fill(0)
  bins.y.fill(0)
}

const addToBin = (bins, x, y) => {
  const at = ((y / CLUSTER) | 0) * BINS + ((x / CLUSTER) | 0)
  bins.n[at] += 1
  bins.x[at] += x
  bins.y[at] += y
}

const strongest = (bins, budget) => {
  const used = []
  for (let i = 0; i < bins.n.length; i++) if (bins.n[i] > 0) used.push(i)
  return used.sort((a, b) => bins.n[b] - bins.n[a]).slice(0, budget)
    .map(i => ({ n: bins.n[i], x: bins.x[i] / bins.n[i], y: bins.y[i] / bins.n[i] }))
}

const fireLights = (w, time) => {
  clearBins(fireBins)
  clearBins(chargeBins)
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      if (w.burn[i] > 0) addToBin(fireBins, x, y)
      else if (w.charge[i] > 0) addToBin(chargeBins, x, y)
    }
  }
  for (const { n, x, y } of strongest(fireBins, FIRE_BUDGET)) {
    const swell = Math.sqrt(n)
    splat(live, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 34 + swell * 5, FIRE, (0.42 + swell * 0.22) * flicker(x, y, time))
  }
  for (const { n, x, y } of strongest(chargeBins, CHARGE_BUDGET)) {
    const swell = Math.sqrt(n)
    splat(live, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 18 + swell * 4, CHARGE, 0.3 + swell * 0.14)
  }
}

const stillLights = w => {
  for (let i = 0; i < 3; i++) still[i].fill(0)
  const clusters = new Map()
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const m = w.mat[i]
      const top = y > 0 && w.mat[i - ROOM] !== m
      if ((m === M.LAVA || m === M.ACID) && top) {
        const key = `${m}${(x / CLUSTER) | 0},${y}`
        const c = clusters.get(key) ?? { m, n: 0, x: 0, y }
        c.n += 1
        c.x += x
        clusters.set(key, c)
      } else if (m === M.VOLATILE && (x + y) % 2 === 0) splat(still, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 14, VOLATILE, 0.28)
    }
  }
  for (const { m, n, x, y } of clusters.values()) {
    const px = (x / n + 0.5) * BLOCK
    const py = (y - 0.5) * BLOCK
    if (m === M.LAVA) splat(still, px, py, 44, LAVA, 0.42 * Math.sqrt(n))
    else splat(still, px, py, 20, ACID, 0.12 * Math.sqrt(n))
  }
}

const hash = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 16) & 0xffff

const cellSolid = (w, x, y) => x < 0 || y < 0 || x >= ROOM || y >= ROOM || props(w.mat[y * ROOM + x]).solid === true

const opaque = m => (props(m).solid && !props(m).clear) || props(m).thick === true

const cellOpaque = (w, x, y) => x < 0 || y < 0 || x >= ROOM || y >= ROOM || opaque(w.mat[y * ROOM + x])

const fixturesCache = new WeakMap()

export const fixturesOf = (w, seed) => {
  if (fixturesCache.has(w)) return fixturesCache.get(w)
  const spots = []
  for (let y = 1; y < ROOM - 2; y++) {
    for (let x = 1; x < ROOM - 1; x++) {
      if (!cellSolid(w, x, y - 1) || cellSolid(w, x, y) || cellSolid(w, x, y + 1)) continue
      if (w.mat[y * ROOM + x] !== M.EMPTY) continue
      spots.push({ x, y, rank: hash(x + seed, y * 3 + seed) })
    }
  }
  const taken = []
  for (const spot of spots.sort((a, b) => a.rank - b.rank)) {
    if (taken.length >= 4) break
    if (taken.every(t => Math.hypot(t.x - spot.x, t.y - spot.y) > 9)) taken.push(spot)
  }
  fixturesCache.set(w, taken)
  return taken
}

export const standingFixtures = (w, seed) => fixturesOf(w, seed).filter(({ x, y }) => cellSolid(w, x, y - 1) && !cellSolid(w, x, y))

const fixtureLights = (w, seed, colour) => {
  for (const { x, y } of standingFixtures(w, seed)) splat(still, (x + 0.5) * BLOCK, (y + 0.4) * BLOCK, 74, colour, 0.8)
}

const BEAM_SPACING = 6

const stillBeams = (w, seed) => {
  beams.fill(0)
  const slope = (hash(seed, 91) % 2 ? 1 : -1) * (0.18 + (hash(seed, 17) % 30) / 100)
  const slots = Array.from({ length: Math.floor(ROOM / BEAM_SPACING) }, (_, i) => 2 + i * BEAM_SPACING + hash(seed + i, 5) % BEAM_SPACING)
  for (const slot of slots) {
    if (slot >= ROOM - 1) continue
    let first = 1
    while (first < ROOM - 1 && cellOpaque(w, slot, first)) first++
    if (first >= ROOM - 2) continue
    if (first > 12) continue
    const width = 4 + (hash(slot, seed) % 3) * 2
    const x0 = (slot + 0.5) * BLOCK
    const y0 = first * BLOCK
    let y = y0
    let x = x0
    let run = 0
    while (run < 190 && !cellOf(x, y)) {
      const fade = 1 - run / 190
      for (let a = -width; a <= width; a += 1) {
        const tx = (x + a) / TEXEL | 0
        const ty = y / TEXEL | 0
        if (tx < 0 || ty < 0 || tx >= LIGHT_SIZE || ty >= LIGHT_SIZE) continue
        const edge = 1 - Math.abs(a) / (width + 1)
        const i = ty * LIGHT_SIZE + tx
        beams[i] = Math.max(beams[i], edge * edge * fade)
      }
      y += 1
      x += slope
      run += 1
    }
  }
}

const actorLights = g => {
  const p = g.player
  const dead = g.phase === 'dead'
  if (p && g.phase !== 'title' && !dead) {
    const h = heroOf(p)
    const tip = h.tip
    const dir = { x: Math.cos(h.angle), y: Math.sin(h.angle) }
    splat(live, p.x + 3, p.y + p.h / 2, 34, LAMP, 0.34)
    cone(live, tip.x, tip.y, dir, 68, 0.82, LAMP, 0.38)
    if (h.flash > 0) splat(live, tip.x, tip.y, 30, LAMP, 1.1)
  }
  for (const s of g.shots) splat(live, s.x, s.y, 12, SHOT, 0.5)
  for (const f of g.fireballs) splat(live, f.x + 2, f.y + 2, 18, f.pellet ? SHOT : f.acid ? ACID : HOT_SHOT, 0.65)
  for (const b of g.bolts) for (const point of b.points) splat(live, point.x, point.y, 14, CHARGE, 0.4)
  for (const e of g.enemies) {
    if (e.light) splat(live, e.x + e.w / 2, e.y + e.h / 2, e.light.radius ?? 24, e.light.colour ?? FIRE, e.light.power ?? 0.6)
    else if (e.kind === 'emberbat' || e.elite === 'burning') splat(live, e.x + e.w / 2, e.y + e.h / 2, 22, FIRE, 0.5)
    else if (e.elite === 'charged') splat(live, e.x + e.w / 2, e.y + e.h / 2, 18, CHARGE, 0.35)
  }
  for (const card of g.cards) if (card.kind === 'core') splat(live, card.x + 8, card.y + 8, 70, CORE, 0.8)
  for (const l of g.lights) splat(live, l.x, l.y, l.radius, [l.r, l.g, l.b], (l.life / l.max) * 1.3)
}

const memo = { world: null, solidKey: null, seed: -1, fixture: null, beams: false }

const stillChanged = w => {
  const changed = memo.world !== w || !w.mat.every((m, i) => m === memo.solidKey[i])
  if (!changed) return false
  memo.world = w
  memo.solidKey = (memo.solidKey?.length === w.mat.length ? memo.solidKey : new Uint8Array(w.mat.length))
  memo.solidKey.set(w.mat)
  for (let i = 0; i < solid.length; i++) solid[i] = opaque(w.mat[i]) ? 1 : 0
  return true
}

export const buildLight = (g, time, { fixture, seed, shafts }) => {
  const w = g.world
  if (w) {
    const changed = stillChanged(w)
    const fresh = changed || memo.seed !== seed || memo.fixture !== fixture || memo.beams !== shafts
    if (fresh) {
      memo.seed = seed
      memo.fixture = fixture
      memo.beams = shafts
      stillLights(w)
      if (fixture) fixtureLights(w, seed, fixture)
      if (shafts) stillBeams(w, seed)
      else beams.fill(0)
    }
  }
  for (let c = 0; c < 3; c++) live[c].set(still[c])
  if (w) fireLights(w, time)
  actorLights(g)
  const [red, green, blue] = live
  for (let i = 0; i < AREA; i++) {
    bytes[i * 4] = Math.min(255, red[i] * 255)
    bytes[i * 4 + 1] = Math.min(255, green[i] * 255)
    bytes[i * 4 + 2] = Math.min(255, blue[i] * 255)
    bytes[i * 4 + 3] = beams[i] * 255
  }
  return bytes
}
