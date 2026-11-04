import { ROOM, TUNING } from './config.js'
import { M, props, parseMaterial } from './materials.js'

const T = TUNING.world
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]]

const idx = (x, y) => y * ROOM + x
const inside = (x, y) => x >= 0 && y >= 0 && x < ROOM && y < ROOM
const between = ([lo, hi]) => lo + Math.random() * (hi - lo)

export const matAt = (w, x, y) => (inside(x, y) ? w.mat[idx(x, y)] : M.BEDROCK)
export const burningAt = (w, x, y) => inside(x, y) && w.burn[idx(x, y)] > 0
export const chargedAt = (w, x, y) => inside(x, y) && w.charge[idx(x, y)] > 0
export const crushingAt = (w, x, y) => inside(x, y) && w.crushing[idx(x, y)] === 1

export const createWorld = (rows, overloaded = false) => {
  const size = ROOM * ROOM
  const mat = new Uint8Array(size)
  const life = new Float32Array(size)
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const material = parseMaterial(c)
    mat[idx(x, y)] = material
    life[idx(x, y)] = props(material).startLife ?? 0
  }))
  return {
    mat,
    burn: new Float32Array(size),
    charge: new Float32Array(size),
    refractory: new Float32Array(size),
    life,
    moved: new Uint8Array(size),
    crushing: new Uint8Array(size),
    frontier: [],
    clocks: { fluid: 0, fire: 0, charge: 0 },
    flip: 0,
    burning: 0,
    charged: 0,
    events: [],
    drains: [],
    overloaded,
  }
}

const place = (w, i, mat, life = 0) => {
  w.mat[i] = mat
  w.burn[i] = 0
  w.charge[i] = 0
  w.life[i] = life
}

const swap = (w, a, b) => {
  for (const f of [w.mat, w.burn, w.charge, w.refractory, w.life]) {
    const held = f[a]
    f[a] = f[b]
    f[b] = held
  }
  w.moved[a] = w.moved[b] = 1
}

const isOpen = (w, x, y) => {
  const m = matAt(w, x, y)
  return m === M.EMPTY || props(m).gas === true
}

export const puff = (w, x, y, mat, range) => {
  if (matAt(w, x, y) === M.EMPTY) place(w, idx(x, y), mat, between(range))
}

export const setCell = (w, x, y, mat) => {
  if (inside(x, y)) place(w, idx(x, y), mat)
}

const flammabilityOf = (w, mat) => {
  if (w.overloaded && mat === M.ROCK) return T.overloadBurn
  return props(mat).flammability
}

const conductanceOf = (w, mat) => {
  if (w.overloaded && (mat === M.ROCK || mat === M.MOSS || mat === M.PEAT)) return 1
  return props(mat).conductance
}

export const ignite = (w, x, y) => {
  if (!inside(x, y)) return
  const i = idx(x, y)
  if (flammabilityOf(w, w.mat[i]) && w.burn[i] <= 0) {
    note(w, 'burn', w.mat[i])
    w.burn[i] = (props(w.mat[i]).burnTime ?? T.overloadBurnTime) * (0.7 + Math.random() * 0.6)
  }
}

export const energize = (w, x, y, energy) => {
  if (!inside(x, y)) return
  const i = idx(x, y)
  if (!conductanceOf(w, w.mat[i]) || w.refractory[i] > 0) return
  conduct(w, i, energy)
  w.frontier.push({ x, y, energy })
}

const note = (w, tag, mat) => w.notes?.add(`${tag}:${mat}`)

const conduct = (w, i, energy) => {
  note(w, 'conduct', w.mat[i])
  w.charge[i] = T.chargeTime
  w.refractory[i] = T.chargeRefractory
  if (props(w.mat[i]).opensWhenCharged) {
    place(w, i, M.EMPTY)
    w.events.push({ type: 'gate' })
  }
}

const fall = (w, x, y) => {
  const i = idx(x, y)
  const below = matAt(w, x, y + 1)
  const sinks = below === M.WATER && props(w.mat[i]).sinks === true
  if (below === M.WATER && w.mat[i] === M.ASH) {
    place(w, i, M.EMPTY)
    return
  }
  if (isOpen(w, x, y + 1) || sinks) {
    const heavy = props(w.mat[i]).solid === true
    note(w, 'fall', w.mat[i])
    swap(w, i, idx(x, y + 1))
    if (heavy) w.crushing[idx(x, y + 1)] = 1
    return
  }
  if (!props(w.mat[i]).slides) return
  const side = Math.random() < 0.5 ? 1 : -1
  for (const d of [side, -side]) {
    if (isOpen(w, x + d, y) && isOpen(w, x + d, y + 1)) {
      swap(w, i, idx(x + d, y))
      return
    }
  }
}

const drainsToward = (w, x, y, d) => {
  for (let k = 1; k <= T.flowReach; k++) {
    if (!isOpen(w, x + d * k, y)) return false
    if (isOpen(w, x + d * k, y + 1)) return true
  }
  return false
}

const flow = (w, x, y) => {
  const i = idx(x, y)
  const sinksThroughOil = w.mat[i] === M.WATER && matAt(w, x, y + 1) === M.OIL
  if (isOpen(w, x, y + 1) || sinksThroughOil) {
    swap(w, i, idx(x, y + 1))
    return
  }
  const side = Math.random() < 0.5 ? 1 : -1
  const dirs = [side, -side]
  const towardDrop = dirs.find(d => drainsToward(w, x, y, d))
  const stacked = matAt(w, x, y - 1) === w.mat[i]
  const spread = stacked ? dirs.find(d => isOpen(w, x + d, y)) : undefined
  const d = towardDrop ?? spread
  if (d !== undefined) swap(w, i, idx(x + d, y))
}

const rise = (w, x, y) => {
  const i = idx(x, y)
  if (matAt(w, x, y - 1) === M.EMPTY) {
    swap(w, i, idx(x, y - 1))
    return
  }
  const d = Math.random() < 0.5 ? 1 : -1
  if (matAt(w, x + d, y) === M.EMPTY) swap(w, i, idx(x + d, y))
}

const ageOut = (w, i, dt) => {
  w.life[i] -= dt
  if (w.life[i] <= 0) place(w, i, M.EMPTY)
}

const stepFluids = (w, dt) => {
  w.moved.fill(0)
  w.crushing.fill(0)
  for (const i of w.drains) if (!props(w.mat[i]).solid || props(w.mat[i]).falls) place(w, i, M.EMPTY)
  w.flip ^= 1
  const column = k => (w.flip ? k : ROOM - 1 - k)
  for (let y = ROOM - 2; y >= 1; y--) {
    for (let k = 0; k < ROOM; k++) {
      const x = column(k)
      const i = idx(x, y)
      if (w.moved[i]) continue
      const p = props(w.mat[i])
      if (p.expires && !p.gas) ageOut(w, i, dt)
      if (p.falls && w.mat[i] !== M.EMPTY) fall(w, x, y)
      else if (p.liquid) flow(w, x, y)
    }
  }
  for (let y = 1; y < ROOM - 1; y++) {
    for (let k = 0; k < ROOM; k++) {
      const x = column(k)
      const i = idx(x, y)
      if (w.moved[i] || !props(w.mat[i]).gas) continue
      ageOut(w, i, dt)
      if (w.mat[i] !== M.EMPTY) rise(w, x, y)
    }
  }
}

const emitSmoke = (w, x, y) => {
  const spot = [[0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => matAt(w, x + dx, y + dy) === M.EMPTY)
  if (spot) puff(w, x + spot[0], y + spot[1], M.SMOKE, T.smokeLife)
}

const explode = (w, x, y, reach) => {
  w.events.push({ type: 'blast', x, y, reach })
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (!inside(nx, ny)) continue
      const n = idx(nx, ny)
      w.crushing[n] = 1
      ignite(w, nx, ny)
      if (reach > 1 && [M.ROCK, M.SAND, M.BRICK].includes(w.mat[n])) place(w, n, M.EMPTY)
    }
  }
}

const burnOut = (w, x, y) => {
  const i = idx(x, y)
  const mat = w.mat[i]
  const { burnsTo = M.ASH, blast } = props(mat)
  place(w, i, burnsTo, burnsTo === M.ASH ? T.ashLife : 0)
  if (blast) {
    note(w, 'blast', mat)
    explode(w, x, y, blast)
  }
}

const stepFire = (w, dt, excite) => {
  let burning = 0
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = idx(x, y)
      if (w.burn[i] <= 0) continue
      burning++
      w.burn[i] -= dt
      const p = props(w.mat[i])
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        const other = matAt(w, nx, ny)
        const flam = flammabilityOf(w, other)
        if (flam && Math.random() < flam * excite * dt) ignite(w, nx, ny)
        if (other === M.WATER && !p.liquid && Math.random() < T.quench * dt) {
          w.burn[i] = 0
          place(w, idx(nx, ny), M.STEAM, between(T.steamLife))
        }
        if (other === M.ICE && Math.random() < T.melt * dt) {
          note(w, 'melt', M.ICE)
          place(w, idx(nx, ny), M.WATER)
        }
      }
      if (Math.random() < (p.smoke ?? 1) * dt) emitSmoke(w, x, y)
      if (w.burn[i] <= 0 && w.mat[i] !== M.EMPTY) {
        const quenched = N4.some(([dx, dy]) => matAt(w, x + dx, y + dy) === M.STEAM)
        if (!quenched) burnOut(w, x, y)
      }
    }
  }
  w.burning = burning
}

const stepCharge = (w, dt) => {
  let charged = 0
  for (let i = 0; i < w.charge.length; i++) {
    if (w.charge[i] > 0) { w.charge[i] -= dt; charged++ }
    if (w.refractory[i] > 0) w.refractory[i] -= dt
  }
  w.charged = charged
  const next = []
  for (const { x, y, energy } of w.frontier) {
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (!inside(nx, ny)) continue
      const n = idx(nx, ny)
      const cost = conductanceOf(w, w.mat[n])
      if (cost && w.refractory[n] <= 0 && energy > cost) {
        conduct(w, n, energy)
        next.push({ x: nx, y: ny, energy: energy - cost })
      } else if (flammabilityOf(w, w.mat[n]) && Math.random() < T.spark) {
        ignite(w, nx, ny)
      }
    }
  }
  w.frontier = next
}

const every = (w, clock, rate, dt, run) => {
  w.clocks[clock] += dt
  const period = 1 / rate
  while (w.clocks[clock] >= period) {
    w.clocks[clock] -= period
    run(period)
  }
}

export const stepWorld = (w, dt, depth) => {
  const excite = 1 + depth * T.exciteAtCore
  every(w, 'fluid', T.fluidRate, dt, step => stepFluids(w, step))
  every(w, 'fire', T.fireRate, dt, step => stepFire(w, step, excite))
  every(w, 'charge', T.chargeRate, dt, step => stepCharge(w, step))
}
