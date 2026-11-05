import { BLOCK, ROOM, TUNING } from './config.js'
import { M } from './materials.js'
import { setCell, tallyRule } from './world.js'
import { centre } from './physics.js'
import { burstSparks, chipsAt } from './fx.js'

const L = TUNING.loose
const F = TUNING.flung
const CLUSTER = 4
const BINS = Math.ceil(ROOM / CLUSTER)
const MAGNETS = new Set([M.METAL, M.GATE])

const between = ([lo, hi]) => lo + Math.random() * (hi - lo)

const launch = (g, piece) => {
  if (g.flung.length < F.most) g.flung.push({ age: 0, ...piece })
}

const outward = (x, y, fromX, fromY, spread) => {
  const base = Math.atan2(y - fromY, x - fromX || (Math.random() - 0.5))
  const a = base + (Math.random() - 0.5) * spread
  return { x: Math.cos(a), y: Math.sin(a) }
}

const shards = (g, { x, y, fromX, fromY }) => {
  const cx = (x + 0.5) * BLOCK
  const cy = (y + 0.5) * BLOCK
  chipsAt(g, cx, cy, M.GLASS, 6)
  for (let n = 0; n < L.shards; n++) {
    const dir = outward(x, y, fromX, fromY, Math.PI * 0.8)
    const speed = between(L.shardSpeed)
    launch(g, {
      x: cx - 2, y: cy - 2, w: 4, h: 4, vx: dir.x * speed, vy: dir.y * speed - 30,
      mat: M.GLASS, shard: true, cause: 'CRUSHED', life: L.shardLife, damage: L.shardDamage, armed: L.armed,
    })
  }
}

const thrown = (g, { x, y, mat, fromX, fromY }) => {
  const dir = outward(x, y, fromX, fromY, 0.7)
  const speed = between(L.thrownSpeed)
  launch(g, { x: x * BLOCK, y: y * BLOCK, w: 8, h: 8, vx: dir.x * speed, vy: dir.y * speed - L.thrownLift, mat, armed: L.armed, cause: 'CRUSHED' })
}

export const LOOSE_EVENTS = { shatter: shards, throw: thrown }

const magnetsOf = w => {
  const n = new Uint16Array(BINS * BINS)
  const sx = new Float32Array(BINS * BINS)
  const sy = new Float32Array(BINS * BINS)
  for (let i = 0; i < w.mat.length; i++) {
    if (w.charge[i] <= 0 || !MAGNETS.has(w.mat[i])) continue
    const x = i % ROOM
    const y = (i - x) / ROOM
    const b = ((y / CLUSTER) | 0) * BINS + ((x / CLUSTER) | 0)
    n[b] += 1
    sx[b] += x
    sy[b] += y
  }
  const found = []
  for (let b = 0; b < n.length; b++) if (n[b]) found.push({ n: n[b], x: (sx[b] / n[b] + 0.5) * BLOCK, y: (sy[b] / n[b] + 0.5) * BLOCK })
  return found.sort((a, b) => b.n - a.n).slice(0, L.magnetsMost)
}

const nearest = (magnets, at, reach) => magnets
  .map(m => ({ m, d: Math.hypot(m.x - at.x, m.y - at.y) }))
  .filter(({ d }) => d < reach)
  .sort((a, b) => a.d - b.d)[0]

const pull = (body, at, { m, d }, dt) => {
  const k = Math.max(4, d)
  body.vx += ((m.x - at.x) / k) * L.magnetPull * dt
  body.vy += ((m.y - at.y) / k) * L.magnetPull * dt
}

const liftScrap = (g, magnet) => {
  const w = g.world
  const reach = L.magnetReach
  const mx = magnet.x / BLOCK
  const my = magnet.y / BLOCK
  for (let y = Math.max(1, Math.floor(my - reach)); y <= Math.min(ROOM - 2, Math.ceil(my + reach)); y++) {
    for (let x = Math.max(1, Math.floor(mx - reach)); x <= Math.min(ROOM - 2, Math.ceil(mx + reach)); x++) {
      if (w.mat[y * ROOM + x] !== M.SCRAP || w.charge[y * ROOM + x] > 0 || Math.random() > L.magnetLift) continue
      const dx = mx - (x + 0.5)
      const dy = my - (y + 0.5)
      const d = Math.hypot(dx, dy)
      if (d > reach || d < 1.5) continue
      setCell(w, x, y, M.EMPTY)
      tallyRule(w, 'magnet', M.SCRAP)
      launch(g, { x: x * BLOCK, y: y * BLOCK, w: 8, h: 8, vx: (dx / d) * L.magnetFling, vy: (dy / d) * L.magnetFling - 30, mat: M.SCRAP, safe: true, charged: true, cause: 'CRUSHED' })
    }
  }
}

const found = new WeakMap()

const magnetsNow = (g, dt) => {
  const w = g.world
  const seen = found.get(w) ?? { clock: 0, list: [] }
  found.set(w, seen)
  seen.clock -= dt
  if (seen.clock > 0) return { list: seen.list, fresh: false }
  seen.clock = L.magnetEvery
  seen.list = magnetsOf(w)
  return { list: seen.list, fresh: true }
}

export const stepMagnets = (g, dt) => {
  if (!g.world.charged) return
  const { list: magnets, fresh } = magnetsNow(g, dt)
  if (!magnets.length) return
  const reach = L.magnetReach * BLOCK
  for (const e of g.enemies) {
    if (!e.magnetic || e.heavy || e.friendly || e.stowed) continue
    const c = centre(e)
    const near = nearest(magnets, c, reach)
    if (!near) continue
    pull(e, c, near, dt)
    e.shoved = Math.max(e.shoved, 0.08)
  }
  for (const f of g.flung) {
    if (f.mat !== M.SCRAP) continue
    const at = { x: f.x + 4, y: f.y + 4 }
    const near = nearest(magnets, at, reach)
    if (near) pull(f, at, near, dt)
  }
  if (!fresh) return
  for (const magnet of magnets) {
    liftScrap(g, magnet)
    if (Math.random() < 0.5) burstSparks(g, magnet.x, magnet.y, 'magnet', 3)
  }
}
