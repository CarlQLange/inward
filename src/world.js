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
export const lavaAt = (w, x, y) => inside(x, y) && w.mat[idx(x, y)] === M.LAVA
export const acidAt = (w, x, y) => inside(x, y) && w.mat[idx(x, y)] === M.ACID
export const vineAt = (w, x, y) => inside(x, y) && w.mat[idx(x, y)] === M.VINE
export const crushingAt = (w, x, y) => inside(x, y) && w.crushing[idx(x, y)] === 1

export const restoreWorld = (encoded, overloaded, drains) => {
  const world = createWorld([], overloaded)
  ;[...encoded].forEach((c, i) => {
    const material = c.charCodeAt(0) - 48
    world.mat[i] = material
    const { startLife, expires } = props(material)
    world.life[i] = startLife ?? (expires ? 3 : 0)
  })
  world.drains = drains
  return world
}

export const encodeWorld = w => String.fromCharCode(...w.mat.map((m, i) => (m === M.STILL ? w.life[i] : m) + 48))

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
    drop: new Uint8Array(size),
    frontier: [],
    clocks: { fluid: 0, fire: 0, charge: 0 },
    flip: 0,
    burning: 0,
    charged: 0,
    events: [],
    drains: [],
    pours: [],
    pockets: [],
    overloaded,
  }
}

const place = (w, i, mat, life = 0) => {
  w.mat[i] = mat
  w.burn[i] = 0
  w.charge[i] = 0
  w.life[i] = life
  w.drop[i] = 0
}

const swap = (w, a, b) => {
  for (const f of [w.mat, w.burn, w.charge, w.refractory, w.life, w.drop]) {
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

const PULL = [[0, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]
const pullOf = (w, i) => PULL[w.lift?.[i] ?? 0]
const keeps = (w, i, x, y) => !w.lift?.[i] || (inside(x, y) && w.lift[idx(x, y)] > 0)
const openFrom = (w, i, x, y) => isOpen(w, x, y) && keeps(w, i, x, y)

export const puff = (w, x, y, mat, range) => {
  if (matAt(w, x, y) === M.EMPTY) place(w, idx(x, y), mat, between(range))
}

export const setCell = (w, x, y, mat, life = 0) => {
  if (inside(x, y)) place(w, idx(x, y), mat, life)
}

export const pour = (w, x, y, mat, cells) => {
  if (inside(x, y)) w.pours.push({ x, y, mat, left: cells, blocked: 0 })
}

export const loosen = (w, x, y) => {
  if (y < 2 || matAt(w, x, y) !== M.ICE || !isOpen(w, x, y + 1) || !props(matAt(w, x, y - 1)).solid) return false
  place(w, idx(x, y), M.FLOE)
  return true
}

const ACID_EATS = new Set([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.SAND, M.ICE, M.FLOE, M.RIME, M.BRICK, M.SCRAP, M.VINE, M.VOLATILE, M.METAL, M.GATE, M.SNOW, M.MUD])
export const dissolves = m => ACID_EATS.has(m)
const BLAST_BREAKS = [M.ROCK, M.SAND, M.BRICK, M.GATE, M.ICE, M.FLOE, M.RIME, M.SCRAP, M.SNOW]
const THROWN = new Set([M.SAND, M.SCRAP, M.FLOE, M.SNOW, M.MUD])
const ICY = new Set([M.ICE, M.FLOE, M.RIME])
const SLIDE = { [M.WATER]: T.slide.water, [M.ACID]: T.slide.acid, [M.OIL]: T.slide.oil, [M.LAVA]: T.slide.lava }
const WET = new Set([M.WATER, M.MUD])
const N8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]

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
    w.burn[i] = (props(w.mat[i]).burnTime ?? T.overloadBurnTime) * (0.7 + Math.random() * 0.6) * T.burnScale
  }
}

export const energize = (w, x, y, energy) => {
  if (!inside(x, y)) return
  const i = idx(x, y)
  if (!conductanceOf(w, w.mat[i]) || w.refractory[i] > 0) return
  conduct(w, i, energy)
  w.frontier.push({ x, y, energy })
}

const note = (w, tag, mat) => {
  w.notes?.add(`${tag}:${mat}`)
  if (w.counts) w.counts[tag] = (w.counts[tag] ?? 0) + 1
}

export const tallyRule = (w, tag, mat) => note(w, tag, mat)

const turn = (w, i, mat, tag) => {
  note(w, tag, mat)
  place(w, i, mat)
}

export const shatter = (w, x, y, fromX = x, fromY = y + 1) => {
  if (!inside(x, y) || !props(w.mat[idx(x, y)]).brittle) return false
  turn(w, idx(x, y), M.EMPTY, 'shatter')
  w.events.push({ type: 'shatter', x, y, fromX, fromY })
  return true
}

const throwCell = (w, x, y, fromX, fromY) => {
  const i = idx(x, y)
  const mat = w.mat[i]
  turn(w, i, M.EMPTY, 'throw')
  w.events.push({ type: 'throw', x, y, mat, fromX, fromY })
}

export const bake = (w, x, y) => {
  if (!inside(x, y)) return false
  const i = idx(x, y)
  const m = w.mat[i]
  if (m === M.SAND) turn(w, i, M.GLASS, 'glaze')
  else if (m === M.MUD) turn(w, i, M.BRICK, 'bake')
  else if (props(m).melts) turn(w, i, M.WATER, 'melt')
  else if (flammabilityOf(w, m) && w.burn[i] <= 0) ignite(w, x, y)
  else return false
  return true
}

const bubble = (w, i) => {
  if (w.mat[i] !== M.WATER || Math.random() > T.bubble) return
  const above = i - ROOM
  if (w.mat[above] !== M.EMPTY) return
  note(w, 'bubble', M.WATER)
  place(w, above, M.METHANE, 10)
}

const conduct = (w, i, energy) => {
  note(w, 'conduct', w.mat[i])
  bubble(w, i)
  w.charge[i] = T.chargeTime
  w.refractory[i] = T.chargeRefractory
  if (props(w.mat[i]).opensWhenCharged) {
    place(w, i, M.EMPTY)
    w.events.push({ type: 'gate' })
  }
}

const soak = (w, x, y, mat) => {
  if (mat === M.SAND) {
    if (Math.random() > T.soak || !N4.some(([dx, dy]) => matAt(w, x + dx, y + dy) === M.WATER)) return false
    turn(w, idx(x, y), M.MUD, 'soak')
    return true
  }
  if (mat !== M.ASH || Math.random() > T.regrow || !props(matAt(w, x, y + 1)).solid) return false
  if (!N8.some(([dx, dy]) => WET.has(matAt(w, x + dx, y + dy)))) return false
  turn(w, idx(x, y), M.MOSS, 'regrow')
  return true
}

const DROWNS = { [M.ASH]: [M.MUD, 'soak'], [M.SNOW]: [M.WATER, 'melt'] }

const fall = (w, x, y) => {
  const i = idx(x, y)
  const mat = w.mat[i]
  const p = props(mat)
  const [gx, gy] = pullOf(w, i)
  const below = matAt(w, x + gx, y + gy)
  if (p.floats && matAt(w, x - gx, y - gy) === M.WATER) {
    swap(w, i, idx(x - gx, y - gy))
    return
  }
  if (below === M.WATER && DROWNS[mat]) {
    turn(w, i, ...DROWNS[mat])
    return
  }
  if (soak(w, x, y, mat)) return
  const sinks = below === M.WATER && p.sinks === true && keeps(w, i, x + gx, y + gy)
  if (openFrom(w, i, x + gx, y + gy) || sinks) {
    const j = idx(x + gx, y + gy)
    note(w, 'fall', mat)
    swap(w, i, j)
    if (w.drop[j] < 255) w.drop[j] += 1
    if (p.solid && !p.soft) w.crushing[j] = 1
    return
  }
  if (p.solid && !p.soft && w.drop[i] >= T.shatterDrop) shatter(w, x + gx, y + gy, x, y)
  w.drop[i] = 0
  if (!p.slides && !(p.thick && Math.random() < T.mudSlump)) return
  const side = Math.random() < 0.5 ? 1 : -1
  for (const d of [side, -side]) {
    if (openFrom(w, i, x + d * gy, y + d * gx) && openFrom(w, i, x + d * gy + gx, y + d * gx + gy)) {
      swap(w, i, idx(x + d * gy, y + d * gx))
      return
    }
  }
}

const drainsToward = (w, i, x, y, d) => {
  const [gx, gy] = pullOf(w, i)
  for (let k = 1; k <= T.flowReach; k++) {
    if (!openFrom(w, i, x + d * k * gy, y + d * k * gx)) return false
    if (openFrom(w, i, x + d * k * gy + gx, y + d * k * gx + gy)) return true
  }
  return false
}

const flow = (w, x, y) => {
  const i = idx(x, y)
  const [gx, gy] = pullOf(w, i)
  const sinksThroughOil = w.mat[i] === M.WATER && matAt(w, x + gx, y + gy) === M.OIL && keeps(w, i, x + gx, y + gy)
  if (openFrom(w, i, x + gx, y + gy) || sinksThroughOil) {
    swap(w, i, idx(x + gx, y + gy))
    return
  }
  const side = Math.random() < 0.5 ? 1 : -1
  const dirs = [side, -side]
  const towardDrop = dirs.find(d => drainsToward(w, i, x, y, d))
  const stacked = matAt(w, x - gx, y - gy) === w.mat[i]
  const spread = stacked ? dirs.find(d => openFrom(w, i, x + d * gy, y + d * gx)) : undefined
  const d = towardDrop ?? spread
  if (d === undefined) return
  const sideways = k => [x + k * d * gy, y + k * d * gx]
  const fallsAt = k => {
    const [sx, sy] = sideways(k)
    return openFrom(w, i, sx + gx, sy + gy)
  }
  let k = 1
  while (k < (SLIDE[w.mat[i]] ?? 1) && openFrom(w, i, ...sideways(k + 1)) && !fallsAt(k)) k++
  swap(w, i, idx(...sideways(k)))
}

const rise = (w, x, y) => {
  const i = idx(x, y)
  const [gx, gy] = pullOf(w, i)
  if (matAt(w, x - gx, y - gy) === M.EMPTY && keeps(w, i, x - gx, y - gy)) {
    swap(w, i, idx(x - gx, y - gy))
    return
  }
  const d = Math.random() < 0.5 ? 1 : -1
  if (matAt(w, x + d * gy, y + d * gx) === M.EMPTY && keeps(w, i, x + d * gy, y + d * gx)) swap(w, i, idx(x + d * gy, y + d * gx))
}

const ageOut = (w, i, dt) => {
  w.life[i] -= dt
  if (w.life[i] > 0) return
  if (w.mat[i] === M.STEAM && w.cold && Math.random() < T.snowfall) {
    turn(w, i, M.SNOW, 'snow')
    return
  }
  const condenses = w.mat[i] === M.STEAM && props(w.mat[i - ROOM] ?? M.EMPTY).solid === true && Math.random() < T.rain
  if (condenses) note(w, 'rain', M.STEAM)
  place(w, i, condenses ? M.WATER : M.EMPTY)
}

const stepLava = (w, x, y, dt) => {
  const i = idx(x, y)
  for (const [dx, dy] of N4) {
    const nx = x + dx
    const ny = y + dy
    const other = matAt(w, nx, ny)
    if (other === M.WATER) {
      note(w, 'cool', M.LAVA)
      place(w, idx(nx, ny), M.STEAM, between(T.steamLife))
      place(w, i, M.ROCK)
      return true
    }
    if (other === M.SAND && Math.random() < T.glaze) turn(w, idx(nx, ny), M.GLASS, 'glaze')
    else if (ICY.has(other) && Math.random() < T.iceGlass) turn(w, idx(nx, ny), M.GLASS, 'glaze')
    else if (props(other).melts) place(w, idx(nx, ny), M.WATER)
    else if (props(other).bakes && Math.random() < T.lavaBake) turn(w, idx(nx, ny), M.BRICK, 'bake')
    if (props(other).flammability && Math.random() < T.lavaBurn * dt * 8) ignite(w, nx, ny)
  }
  const [gx, gy] = pullOf(w, i)
  const thin = props(matAt(w, x + gx, y + gy)).solid && matAt(w, x - gx, y - gy) === M.EMPTY
  if (thin && Math.random() < T.lavaCrust * dt) {
    note(w, 'crust', M.LAVA)
    place(w, i, M.ROCK)
    return true
  }
  return !openFrom(w, i, x + gx, y + gy) && Math.random() > T.lavaFlow
}

const SOURED = 1

const sour = (w, i) => {
  note(w, 'sour', M.ACID)
  place(w, i, M.ACID, SOURED)
}

export const rotOf = (w, m) => (w.rusting && m === M.METAL ? M.SCRAP : M.EMPTY)

const stepAcid = (w, x, y) => {
  const i = idx(x, y)
  const soured = w.life[i] === SOURED
  for (const [dx, dy] of N4) {
    const nx = x + dx
    const ny = y + dy
    const other = matAt(w, nx, ny)
    if (other === M.WATER && w.souring) {
      if (Math.random() < T.sour) sour(w, idx(nx, ny))
      continue
    }
    if (other === M.WATER) {
      place(w, i, M.WATER)
      return true
    }
    if (!soured && ACID_EATS.has(other) && Math.random() < T.acidEat) {
      note(w, 'dissolve', other)
      place(w, idx(nx, ny), rotOf(w, other))
      if (Math.random() < T.acidSpent) {
        place(w, i, M.EMPTY)
        return true
      }
    }
  }
  return false
}

const stepSource = (w, x, y, dt) => {
  const i = idx(x, y)
  w.life[i] -= dt
  const [gx, gy] = pullOf(w, i)
  if (w.life[i] <= 0 || matAt(w, x + gx, y + gy) !== M.EMPTY || Math.random() > T.sourceFlow) return
  place(w, idx(x + gx, y + gy), M.WATER)
}

const growVine = (w, x, y) => {
  const i = idx(x, y)
  if (w.life[i] <= 0) return
  const options = [[0, -1], [0, -1], [0, -1], [1, 0], [-1, 0]].filter(([dx, dy]) => matAt(w, x + dx, y + dy) === M.EMPTY)
  if (options.length === 0) {
    w.life[i] = 0
    return
  }
  const [dx, dy] = options[Math.floor(Math.random() * options.length)]
  place(w, idx(x + dx, y + dy), M.VINE, w.life[i] - 1)
  w.life[i] = 0
}

const growMoss = w => {
  for (let n = 0; n < T.growthTries; n++) tryMoss(w)
}

const tryMoss = w => {
  const x = 1 + Math.floor(Math.random() * (ROOM - 2))
  const y = 1 + Math.floor(Math.random() * (ROOM - 2))
  if (w.mat[idx(x, y)] !== M.ROCK || Math.random() > T.growth * ROOM) return
  const around = N4.map(([dx, dy]) => matAt(w, x + dx, y + dy))
  if ((!T.mossAnywhere && !around.includes(M.WATER)) || !around.includes(M.EMPTY)) return
  note(w, 'grow', M.MOSS)
  place(w, idx(x, y), M.MOSS)
}

const stepPours = w => {
  w.pours = w.pours.filter(p => {
    if (isOpen(w, p.x, p.y)) {
      place(w, idx(p.x, p.y), p.mat)
      p.left -= 1
    } else p.blocked += 1
    return p.left > 0 && p.blocked < T.pourPatience
  })
}

const freezes = (w, x, y) => {
  if (Math.random() > T.snowFreeze || !N4.some(([dx, dy]) => ICY.has(matAt(w, x + dx, y + dy)))) return false
  turn(w, idx(x, y), M.SNOW, 'snow')
  return true
}

const stepFluids = (w, dt) => {
  w.moved.fill(0)
  w.crushing.fill(0)
  stepPours(w)
  for (const i of w.drains) if (!props(w.mat[i]).solid || props(w.mat[i]).falls) place(w, i, M.EMPTY)
  w.flip ^= 1
  const column = k => (w.flip ? k : ROOM - 1 - k)
  for (let y = ROOM - 2; y >= 1; y--) {
    for (let k = 0; k < ROOM; k++) {
      const x = column(k)
      const i = idx(x, y)
      if (w.moved[i]) continue
      const p = props(w.mat[i])
      if (p.expires && !p.gas) ageOut(w, i, w.mat[i] === M.ASH && props(w.mat[i + ROOM]).solid ? dt * T.ashSettle : dt)
      if (p.falls && w.mat[i] !== M.EMPTY) fall(w, x, y)
      else if (p.hot) {
        if (!stepLava(w, x, y, dt)) flow(w, x, y)
      } else if (p.corrosive) {
        if (!stepAcid(w, x, y)) flow(w, x, y)
      } else if (p.source) stepSource(w, x, y, dt)
      else if (p.climbable) growVine(w, x, y)
      else if (p.liquid) flow(w, x, y)
    }
  }
  for (let y = 1; y < ROOM - 1; y++) {
    for (let k = 0; k < ROOM; k++) {
      const x = column(k)
      const i = idx(x, y)
      if (w.moved[i] || !props(w.mat[i]).gas) continue
      if (w.mat[i] === M.STEAM && freezes(w, x, y)) continue
      ageOut(w, i, dt)
      if (w.mat[i] !== M.EMPTY) rise(w, x, y)
    }
  }
}

const emitSmoke = (w, x, y) => {
  const spot = [[0, -1], [1, 0], [-1, 0]].find(([dx, dy]) => matAt(w, x + dx, y + dy) === M.EMPTY)
  if (spot) puff(w, x + spot[0], y + spot[1], M.SMOKE, T.smokeLife)
}

export const explode = (w, x, y, reach) => {
  w.events.push({ type: 'blast', x, y, reach })
  const ring = reach + 1
  let thrown = 0
  for (let dy = -ring; dy <= ring; dy++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (!inside(nx, ny)) continue
      const n = idx(nx, ny)
      if (shatter(w, nx, ny, x, y)) continue
      if ((dx || dy) && thrown < T.throwMost && THROWN.has(w.mat[n]) && Math.random() < T.throwChance) {
        throwCell(w, nx, ny, x, y)
        thrown += 1
        continue
      }
      if (Math.max(Math.abs(dx), Math.abs(dy)) > reach) continue
      w.crushing[n] = 1
      ignite(w, nx, ny)
      if (reach > 1 && BLAST_BREAKS.includes(w.mat[n])) place(w, n, M.EMPTY)
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
    explode(w, x, y, blast + T.blastBonus)
  }
}

const stepFire = (w, dt, excite) => {
  growMoss(w)
  let burning = 0
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = idx(x, y)
      if (w.burn[i] <= 0) continue
      burning++
      w.burn[i] -= dt
      const p = props(w.mat[i])
      let doused = false
      for (const [dx, dy] of N4) {
        const nx = x + dx
        const ny = y + dy
        const other = matAt(w, nx, ny)
        const q = props(other)
        const flam = flammabilityOf(w, other)
        if (flam && Math.random() < flam * excite * dt) ignite(w, nx, ny)
        if (other === M.WATER && !p.liquid && Math.random() < T.quench * dt) {
          w.burn[i] = 0
          doused = true
          place(w, idx(nx, ny), M.STEAM, between(T.steamLife))
        }
        if (q.smothers && Math.random() < T.smother * dt) {
          w.burn[i] = 0
          doused = true
          note(w, 'smother', other)
        }
        if (q.bakes && Math.random() < T.bake * dt) turn(w, idx(nx, ny), M.BRICK, 'bake')
        else if (q.melts && Math.random() < T.melt * dt) {
          note(w, 'melt', M.ICE)
          place(w, idx(nx, ny), M.WATER)
        }
      }
      if (Math.random() < (p.smoke ?? 1) * dt) emitSmoke(w, x, y)
      if (w.burn[i] <= 0 && w.mat[i] !== M.EMPTY) {
        const quenched = doused || N4.some(([dx, dy]) => matAt(w, x + dx, y + dy) === M.STEAM)
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
    const live = conductanceOf(w, w.mat[idx(x, y)])
    for (const [dx, dy] of N4) {
      const nx = x + dx
      const ny = y + dy
      if (!inside(nx, ny)) continue
      const n = idx(nx, ny)
      const cost = conductanceOf(w, w.mat[n])
      if (cost && w.refractory[n] <= 0 && energy > cost) {
        conduct(w, n, energy)
        next.push({ x: nx, y: ny, energy: energy - cost })
      } else if (live && w.mat[n] === M.SAND && Math.random() < T.fuse) {
        turn(w, n, M.GLASS, 'fuse')
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
  const excite = T.excite + depth * T.exciteAtCore
  every(w, 'fluid', T.fluidRate, dt, step => stepFluids(w, step))
  every(w, 'fire', T.fireRate, dt, step => stepFire(w, step, excite))
  every(w, 'charge', T.chargeRate, dt, step => stepCharge(w, step))
  w.lift = null
}
