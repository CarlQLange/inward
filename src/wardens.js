import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, crushingAt, energize, ignite, matAt, puff, setCell } from './world.js'
import { WORLD_PX, cell, cellsUnder, centre, inWater, move, overlap, solidAt } from './physics.js'
import { burst, hurt } from './combat.js'
import { quake, zap } from './skills.js'
import { ENEMY_DEFS, ENEMY_TRAITS, STEPPERS, createEnemy } from './enemies.js'
import { blank, paint } from './room.js'

const E = TUNING.enemies

const toward = (from, to) => (to < from ? -1 : 1)
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const hop = (from, target, flight, gravity) => ({
  vx: (target.x - from.x) / flight,
  vy: (target.y - from.y) / flight - 0.5 * gravity * flight,
})

const lob = (g, from, target, flight, extra = {}) => g.fireballs.push({
  x: from.x - 2, y: from.y - 2, w: 4, h: 4,
  ...hop(from, target, flight, TUNING.fireball.gravity),
  age: 0, friendly: false, fromWarden: true, ...extra,
})

const floorWave = (g, x, floorY, dir) => g.fireballs.push({
  x, y: floorY - 7, w: 5, h: 6, vx: dir * 120, vy: 0,
  age: 0, straight: true, pellet: true, friendly: false, fromWarden: true, wave: true,
})

const bag = (e, names) => {
  if (!e.bag?.length) e.bag = names.map(n => [Math.random(), n]).sort((a, b) => a[0] - b[0]).map(([, n]) => n).filter((n, i) => i > 0 || n !== e.move)
  return e.bag.pop() ?? names[0]
}

const fighting = e => !e.asleep && e.stun <= 0

const runMoves = (g, e, dt, moves, pick) => {
  if (e.asleep) return
  if (e.stun > 0) {
    e.windup = false
    return
  }
  e.clock = (e.clock ?? 1) - dt
  const move_ = moves[e.move]
  if (e.stage === 'tell') {
    move_.telling?.(g, e, dt)
    if (e.clock > 0) return
    Object.assign(e, { stage: 'act', clock: move_.act ?? 0, windup: false })
    move_.start?.(g, e)
  } else if (e.stage === 'act') {
    move_.during?.(g, e, dt)
    if (e.clock > 0) return
    move_.end?.(g, e)
    Object.assign(e, { stage: 'rest', clock: move_.rest * (e.pace ?? 1) * (0.55 + 0.45 * (e.hp / e.maxHp)) })
  } else if (e.clock <= 0) {
    const next = pick(g, e)
    Object.assign(e, { move: next, stage: 'tell', clock: moves[next].tell, windup: true })
  }
}

const endMove = e => { e.clock = 0 }

const keepInside = e => {
  e.x = Math.max(3 * BLOCK, Math.min(WORLD_PX - 3 * BLOCK - e.w, e.x))
  e.y = Math.max(3 * BLOCK, Math.min(WORLD_PX - 4 * BLOCK - e.h, e.y))
}

const walkTo = (g, e, dt, speed, x) => {
  e.vy = Math.min(TUNING.player.maxFall, e.vy + E.gravity * dt)
  e.vx = Math.abs(x - centre(e).x) > 6 ? toward(centre(e).x, x) * speed : 0
  if (e.vx) e.facing = Math.sign(e.vx)
  move(g.world, e, dt)
}

const gasPuff = (g, x, y, range = [9, 13]) => puff(g.world, x, y, M.METHANE, range)

const nearFire = (g, e, reach) => cellsUnder(e, reach).some(([x, y]) => burningAt(g.world, x, y) || crushingAt(g.world, x, y))

const bellowsMoves = {
  charge: {
    tell: 0.75, act: 1.5, rest: 1.4,
    telling: (g, e) => { e.vx = 0; e.facing = toward(centre(e).x, centre(g.player).x) },
    during: (g, e) => {
      e.vx = e.facing * 125
      if (!e.hitWall) return
      e.stun = 1.3
      burst(g, centre(e).x, centre(e).y, 'gas', 14)
      endMove(e)
    },
    end: (g, e) => { e.vx = 0 },
  },
  spark: {
    tell: 0.6, act: 0.8, rest: 1.2,
    start: (g, e) => {
      lob(g, { x: centre(e).x + e.facing * 12, y: e.y + 4 }, centre(g.player), 0.8)
      e.sparks = 1
    },
    during: (g, e) => {
      if (e.sparks !== 1 || e.clock > 0.4) return
      e.sparks = 0
      lob(g, { x: centre(e).x + e.facing * 12, y: e.y + 4 }, centre(g.player), 0.9)
    },
  },
  slam: {
    tell: 0.8, act: 0.9, rest: 1.5,
    start: (g, e) => {
      Object.assign(e, { vy: -250, vx: (centre(g.player).x - centre(e).x) / 1.5, slamming: true })
    },
    during: (g, e) => {
      if (!e.slamming || !e.grounded || e.vy < 0) return
      e.slamming = false
      const c = centre(e)
      floorWave(g, c.x, e.y + e.h, -1)
      floorWave(g, c.x, e.y + e.h, 1)
      g.shake = Math.max(g.shake, 7)
      burst(g, c.x, e.y + e.h, 'pale', 18)
      e.vx = 0
      endMove(e)
    },
    end: (g, e) => { e.slamming = false },
  },
  bloat: {
    tell: 1.2, act: 0.1, rest: 1.2,
    telling: (g, e) => {
      e.vx = 0
      e.swell = 1
    },
    start: (g, e) => {
      e.swell = 0
      const x = cell(centre(e).x)
      const y = cell(e.y)
      for (let dy = -3; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) if (Math.abs(dx) + Math.abs(dy) < 6) gasPuff(g, x + dx, y + dy)
      burst(g, centre(e).x, centre(e).y, 'gas', 24)
    },
  },
}

const bellows = (g, e, dt) => {
  if (e.asleep) return
  const roaming = e.stage === 'rest' || e.move === undefined
  if (roaming) {
    walkTo(g, e, dt, 18, centre(g.player).x)
  } else {
    e.vy = Math.min(TUNING.player.maxFall, e.vy + E.gravity * dt)
    move(g.world, e, dt)
  }
  e.leak = (e.leak ?? 0) - dt
  if (e.leak <= 0) {
    e.leak = 0.14
    gasPuff(g, cell(e.x + Math.random() * e.w), cell(e.y - 3), [10, 14])
  }
  if (nearFire(g, e, 12)) hurt(g, e, 2)
  runMoves(g, e, dt, bellowsMoves, () => bag(e, Object.keys(bellowsMoves)))
}

const loosenRoof = (g, count, power) => {
  const loose = []
  for (let y = 1; y < 10; y++) {
    for (let x = 2; x < ROOM - 2; x++) {
      if ([M.PEAT, M.ROCK].includes(matAt(g.world, x, y)) && matAt(g.world, x, y - 1) === M.SAND && !props(matAt(g.world, x, y + 1)).solid) loose.push([x, y])
    }
  }
  for (let i = 0; i < count && loose.length; i++) {
    const [x, y] = loose.splice(Math.floor(Math.random() * loose.length), 1)[0]
    setCell(g.world, x, y, M.SAND)
  }
  g.shake = Math.max(g.shake, power)
}

const colossusMoves = {
  stomp: {
    tell: 0.85, act: 0.1, rest: 1.3,
    start: (g, e) => {
      loosenRoof(g, 7, 7)
      const c = centre(e)
      floorWave(g, c.x, e.y + e.h, -1)
      floorWave(g, c.x, e.y + e.h, 1)
      burst(g, c.x, e.y + e.h, 'pale', 22)
    },
  },
  charge: {
    tell: 0.8, act: 2.2, rest: 1.2,
    telling: (g, e) => { e.facing = toward(centre(e).x, centre(g.player).x) },
    during: (g, e) => {
      e.vx = e.facing * 135
      if (!e.hitWall) return
      loosenRoof(g, 14, 12)
      e.stun = 2.2
      e.vx = 0
      burst(g, centre(e).x, e.y, 'pale', 30)
      endMove(e)
    },
    end: (g, e) => { e.vx = 0 },
  },
  hurl: {
    tell: 0.7, act: 0.5, rest: 1.1,
    start: (g, e) => {
      const them = centre(g.player)
      const from = { x: centre(e).x, y: e.y - 6 }
      const rocks = e.hp < e.maxHp / 2 ? [-24, 0, 24] : [0]
      rocks.forEach(spread => g.flung.push({
        x: from.x - 4, y: from.y - 4, w: 8, h: 8,
        ...hop(from, { x: them.x + spread, y: them.y }, 0.9, TUNING.flung.gravity),
        age: 0, thrower: e,
      }))
    },
  },
}

const colossus = (g, e, dt) => {
  if (e.asleep) return
  if (e.stage === 'rest' || e.stage === undefined) walkTo(g, e, dt, 20, centre(g.player).x)
  else {
    if (e.stage === 'tell') e.vx = 0
    e.vy = Math.min(TUNING.player.maxFall, e.vy + E.gravity * dt)
    move(g.world, e, dt)
  }
  runMoves(g, e, dt, colossusMoves, () => bag(e, ['stomp', 'charge', 'hurl', 'stomp']))
}

const COOL_AFTER = 5
const CRUMBLE_AFTER = 11

const coolLava = (g, e, dt) => {
  e.coolClock = (e.coolClock ?? 0) + dt
  if (e.coolClock < 0.5) return
  e.coolClock = 0
  const w = g.world
  e.cooled ??= []
  for (let i = 0; i < ROOM * ROOM; i++) {
    if (w.mat[i] !== M.LAVA) continue
    w.life[i] += 0.5
    if (w.life[i] < COOL_AFTER) continue
    setCell(w, i % ROOM, Math.floor(i / ROOM), M.ROCK)
    e.cooled.push({ i, age: 0 })
  }
  for (const c of e.cooled) c.age += 0.5
  for (const c of e.cooled.filter(c => c.age >= CRUMBLE_AFTER && w.mat[c.i] === M.ROCK)) setCell(w, c.i % ROOM, Math.floor(c.i / ROOM), M.ASH, TUNING.world.ashLife)
  e.cooled = e.cooled.filter(c => c.age < CRUMBLE_AFTER)
}

const crucibleMoves = {
  pour: {
    tell: 0.9, act: 2, rest: 1.3,
    during: (g, e, dt) => {
      e.vx = toward(centre(e).x, centre(g.player).x) * 14
      e.x += e.vx * dt
      e.pourClock = (e.pourClock ?? 0) + dt
      if (e.pourClock < 0.09 * (e.pace ?? 1)) return
      e.pourClock = 0
      const c = centre(e)
      const x = cell(c.x)
      const y = cell(e.y + e.h + 1)
      if (matAt(g.world, x, y) === M.EMPTY) setCell(g.world, x, y, M.LAVA)
    },
  },
  ladle: {
    tell: 0.7, act: 0.6, rest: 1.2,
    start: (g, e) => {
      const them = centre(g.player)
      const from = { x: centre(e).x, y: e.y + 2 }
      for (const spread of [-34, 0, 34]) lob(g, from, { x: them.x + spread, y: them.y }, 1.1, { lava: true })
    },
  },
  stride: {
    tell: 0.5, act: 1.3, rest: 1,
    start: (g, e) => { e.facing = centre(e).x < WORLD_PX / 2 ? 1 : -1 },
    during: (g, e, dt) => {
      e.x = Math.max(3 * BLOCK, Math.min(WORLD_PX - 3 * BLOCK - e.w, e.x + e.facing * 95 * dt))
      if (Math.random() < dt * 5) g.fireballs.push({ x: centre(e).x, y: e.y + e.h, w: 4, h: 4, vx: 0, vy: 40, age: 0, friendly: false, fromWarden: true, lava: true })
    },
  },
}

const crucible = (g, e, dt) => {
  if (e.asleep) return
  coolLava(g, e, dt)
  if (e.stage === 'rest' || e.stage === undefined) {
    const dx = centre(g.player).x - centre(e).x
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), 24 * dt)
    e.facing = dx < 0 ? -1 : 1
  }
  if (cellsUnder(e, 2).some(([x, y]) => matAt(g.world, x, y) === M.WATER)) {
    hurt(g, e, 3)
    if (e.stun <= 0) e.stun = 2.4
    for (const [x, y] of cellsUnder(e, 2)) {
      if (matAt(g.world, x, y) === M.WATER) puffSteam(g, x, y)
    }
    burst(g, centre(e).x, centre(e).y, 'pale', 12)
  }
  keepInside(e)
  runMoves(g, e, dt, crucibleMoves, () => bag(e, Object.keys(crucibleMoves)))
}

const puffSteam = (g, x, y) => setCell(g.world, x, y, M.STEAM, 2)

const SEGMENTS = 6
const SEG_GAP = 7

const eelInit = (g, e) => {
  if (e.bodied) return
  e.bodied = true
  e.trail = []
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = createEnemy({ kind: 'eelseg', x: e.x, y: e.y })
    Object.assign(seg, { partOf: 'eel', index: i, hp: 9999 })
    g.spawns.push(seg)
  }
}

const surfaceAt = (g, x) => {
  for (let y = 2; y < ROOM - 1; y++) if (matAt(g.world, x, y) === M.WATER) return y
  return ROOM - 3
}

const eelMoves = {
  leap: {
    tell: 0.7, act: 2.5, rest: 1.1,
    telling: (g, e) => {
      const them = centre(g.player)
      const x = cell(them.x)
      burst(g, them.x, surfaceAt(g, x) * BLOCK, 'pale', 1)
      e.vx *= 0.8
      e.vy *= 0.8
    },
    start: (g, e) => {
      const them = centre(g.player)
      const c = centre(e)
      const land = { x: them.x + (them.x - c.x) * 0.4, y: surfaceAt(g, cell(them.x)) * BLOCK + 4 }
      const flight = 1.1
      Object.assign(e, hop(c, land, flight, 300), { airborne: true, leaving: 0.35 })
      e.vy = Math.min(e.vy, -180)
    },
    during: (g, e, dt) => {
      e.vy += 300 * dt
      e.leaving = Math.max(0, e.leaving - dt)
      e.x += e.vx * dt
      e.y += e.vy * dt
      e.facing = e.vx < 0 ? -1 : 1
      if (e.leaving === 0 && e.vy > 0 && inWater(g.world, e)) {
        burst(g, centre(e).x, e.y, 'pale', 14)
        endMove(e)
      }
    },
    end: (g, e) => { e.airborne = false; e.vx *= 0.3; e.vy *= 0.2 },
  },
  electrify: {
    tell: 0.95, act: 0.5, rest: 1.3,
    telling: (g, e) => burst(g, centre(e).x, centre(e).y, 'charge', 1),
    start: (g, e) => {
      const c = centre(e)
      energize(g.world, cell(c.x), cell(c.y), 70)
      burst(g, c.x, c.y, 'charge', 24)
    },
  },
  spit: {
    tell: 0.65, act: 0.5, rest: 1,
    start: (g, e) => {
      const them = centre(g.player)
      const from = { x: centre(e).x, y: e.y }
      for (const spread of [-22, 0, 22]) lob(g, from, { x: them.x + spread, y: them.y }, 0.95, { pellet: true })
    },
  },
}

const eel = (g, e, dt) => {
  eelInit(g, e)
  e.trail = [{ x: e.x, y: e.y }, ...e.trail].slice(0, SEGMENTS * SEG_GAP + 2)
  if (e.asleep) return
  const airborne = e.stage === 'act' && e.move === 'leap'
  if (!airborne) {
    if (inWater(g.world, e)) {
      const them = centre(g.player)
      const c = centre(e)
      const goal = { x: them.x, y: Math.max(them.y + 18, surfaceAt(g, cell(c.x)) * BLOCK + 14) }
      const d = Math.max(1, dist(goal, c))
      const pace = e.stage === 'tell' ? 8 : 62
      e.vx = ((goal.x - c.x) / d) * pace
      e.vy = ((goal.y - c.y) / d) * pace
      const next = { x: e.x + e.vx * dt, y: e.y + e.vy * dt, w: e.w, h: e.h }
      if (inWater(g.world, next)) Object.assign(e, { x: next.x, y: next.y })
      if (e.vx) e.facing = e.vx < 0 ? -1 : 1
      e.stranded = 0
    } else {
      e.vx *= 0.9
      e.vy = Math.min(TUNING.player.maxFall, e.vy + E.gravity * dt)
      move(g.world, e, dt)
      e.stranded = (e.stranded ?? 0) + dt
      if (e.stranded > 0.8) {
        e.stranded = 0
        e.stun = Math.max(e.stun, 0.9)
        hurt(g, e, 1)
      }
    }
  }
  runMoves(g, e, dt, eelMoves, () => bag(e, ['leap', 'electrify', 'spit', 'leap']))
}

const eelseg = (g, e) => {
  const head = g.enemies.find(o => o.kind === 'eel')
  const spot = head?.trail?.[Math.min(head.trail.length - 1, (e.index + 1) * SEG_GAP)]
  if (!head || head.hp <= 0) {
    e.hp = 0
    return
  }
  if (!spot) return
  e.x = spot.x + 2
  e.y = spot.y + 1
  e.facing = head.facing
  e.asleep = head.asleep
}

const VINE_BAND = 4

const holdingVines = (g, e) => {
  const y0 = cell(e.y) - VINE_BAND
  let held = 0
  for (let y = y0; y <= cell(e.y); y++) {
    for (let x = cell(e.x); x <= cell(e.x + e.w - 1); x++) if (matAt(g.world, x, y) === M.VINE && !burningAt(g.world, x, y)) held++
  }
  return held
}

const regrowVines = (g, e) => {
  const c = cell(centre(e).x)
  for (let x = c - 4; x <= c + 3; x++) {
    let y = 1
    while (y < ROOM - 1 && props(matAt(g.world, x, y)).solid) y++
    for (; y < cell(e.y) + 1; y++) if (matAt(g.world, x, y) === M.EMPTY) setCell(g.world, x, y, M.VINE)
  }
}

const YOUNG = ['crawler', 'tick', 'spitter', 'tick']

const broodMoves = {
  spawn: {
    tell: 1, act: 0.2, rest: 1.4,
    start: (g, e) => {
      const alive = g.enemies.filter(o => o.spawned).length
      if (alive >= 4) return
      for (let n = 0; n < 2; n++) {
        const baby = createEnemy({ kind: YOUNG[Math.floor(Math.random() * YOUNG.length)], x: centre(e).x + (n ? 8 : -8), y: e.y + e.h })
        Object.assign(baby, { spawned: true, awake: true, cooldown: 1 })
        g.spawns.push(baby)
      }
      burst(g, centre(e).x, e.y + e.h, 'gas', 14)
    },
  },
  swing: {
    tell: 0.85, act: 2.4, rest: 1.4,
    telling: (g, e, dt) => { e.y += 18 * dt },
    during: (g, e, dt) => {
      e.swingTime = (e.swingTime ?? 0) + dt
      const reach = Math.sin(e.swingTime * 2.8) * 88
      e.x += (e.home.x + reach - e.x) * Math.min(1, dt * 8)
      e.y += (e.home.y + 26 + Math.abs(Math.cos(e.swingTime * 2.8)) * 40 - e.y) * Math.min(1, dt * 6)
    },
    end: (g, e) => { e.swingTime = 0 },
  },
  spit: {
    tell: 0.6, act: 0.5, rest: 1.1,
    start: (g, e) => {
      const them = centre(g.player)
      const from = { x: centre(e).x, y: e.y + e.h }
      for (const spread of [-26, 0, 26]) lob(g, from, { x: them.x + spread, y: them.y }, 0.8, { acid: 4 })
    },
  },
}

const brood = (g, e, dt) => {
  e.home ??= { x: e.x, y: e.y }
  if (e.asleep) return
  e.y = Math.max(e.y, 2 * BLOCK)
  if (e.fallen) {
    e.fallTime = (e.fallTime ?? 0) + dt
    if (!e.grounded) {
      e.vy = Math.min(TUNING.player.maxFall, e.vy + E.gravity * dt)
      e.vx = 0
      move(g.world, e, dt)
      if (e.grounded) {
        hurt(g, e, 6)
        e.stun = 4.5
        g.shake = Math.max(g.shake, 10)
        burst(g, centre(e).x, e.y + e.h, 'pale', 26)
      }
      return
    }
    if (e.stun > 0) return
    Object.assign(e, { y: e.y - 70 * dt, x: e.x + (e.home.x - e.x) * Math.min(1, dt) })
    if (e.y > e.home.y) return
    regrowVines(g, e)
    Object.assign(e, { fallen: false, grounded: false, y: e.home.y, stage: 'rest', clock: 1.5 })
    return
  }
  if (e.stage === 'rest' || e.stage === undefined) {
    const goal = { x: centre(g.player).x - e.w / 2, y: e.home.y }
    const pace = 16 * dt
    e.x += Math.max(-pace, Math.min(pace, e.home.x + (goal.x - e.home.x) * 0.25 - e.x))
    e.y += (goal.y - e.y) * Math.min(1, dt * 3)
    e.facing = centre(g.player).x < centre(e).x ? -1 : 1
  }
  const swinging = e.stage === 'act' && e.move === 'swing'
  if (!swinging && holdingVines(g, e) < 3) {
    Object.assign(e, { fallen: true, grounded: false, windup: false, vy: 0, stage: 'rest', clock: 2 })
    return
  }
  keepInside(e)
  runMoves(g, e, dt, broodMoves, () => bag(e, Object.keys(broodMoves)))
}

const stripColumns = () => Array.from({ length: 4 }, (_, i) => 2 + i * 6)
const STRIP_WIDTH = 5

const chargeStrip = (g, e, strip, floorRow) => {
  const x = strip + 2
  energize(g.world, x, floorRow, 12)
  burst(g, (x + 0.5) * BLOCK, floorRow * BLOCK, 'charge', 8)
}

const flashStrip = (g, strip, floorRow) => {
  const x = strip + Math.floor(Math.random() * STRIP_WIDTH)
  burst(g, (x + 0.5) * BLOCK, floorRow * BLOCK - 1, 'charge', 1)
}

const conductorMoves = {
  pattern: {
    tell: 0.95, act: 0.2, rest: 1.7,
    telling: (g, e) => {
      e.pattern ??= Math.random() < 0.5 ? [0, 2] : [1, 3]
      e.pattern.forEach(i => flashStrip(g, stripColumns()[i], e.floorRow))
    },
    start: (g, e) => {
      e.pattern.forEach(i => chargeStrip(g, e, stripColumns()[i], e.floorRow))
      overload(g, e)
      e.pattern = null
    },
  },
  sweep: {
    tell: 0.8, act: 1.3, rest: 1.8,
    telling: (g, e) => flashStrip(g, stripColumns()[e.facing > 0 ? 0 : 3], e.floorRow),
    start: (g, e) => { e.sweepAt = 0; e.sweepClock = 0 },
    during: (g, e, dt) => {
      e.sweepClock -= dt
      if (e.sweepClock > 0 || e.sweepAt > 3) return
      e.sweepClock = 0.28
      chargeStrip(g, e, stripColumns()[e.facing > 0 ? e.sweepAt : 3 - e.sweepAt], e.floorRow)
      e.sweepAt += 1
      overload(g, e)
    },
  },
  arc: {
    tell: 0.8, act: 0.2, rest: 1,
    telling: (g, e) => { e.aimAt = centre(g.player) },
    start: (g, e) => {
      const from = { x: centre(e).x, y: e.y + 4 }
      const to = e.aimAt ?? centre(g.player)
      e.aimAt = null
      zap(g, from, to)
      ignite(g.world, cell(to.x), cell(to.y))
      energize(g.world, cell(to.x), cell(to.y + 8), 8)
      if (dist(to, centre(g.player)) < 12) hurt(g, g.player, 1, 'world', 'CHARGE')
    },
  },
}

const overload = (g, e) => {
  if (!e.wet) return
  hurt(g, e, 4)
  e.stun = Math.max(e.stun, 1.6)
  burst(g, centre(e).x, centre(e).y, 'charge', 30)
}

const conductor = (g, e, dt) => {
  e.floorRow ??= cell(e.y + e.h + 1)
  if (e.asleep) return
  e.wet = cellsUnder(e, 2).some(([x, y]) => matAt(g.world, x, y) === M.WATER)
  e.insulated = !e.wet
  if (e.stage === 'rest' || e.stage === undefined) walkTo(g, e, dt, 12, centre(g.player).x)
  else {
    e.vy = Math.min(TUNING.player.maxFall, e.vy + E.gravity * dt)
    e.vx = 0
    move(g.world, e, dt)
    e.facing = centre(g.player).x < centre(e).x ? -1 : 1
  }
  runMoves(g, e, dt, conductorMoves, () => bag(e, Object.keys(conductorMoves)))
}

const CORE_PHASES = [1, 0.66, 0.33]

const coreNova = (g, e, count, speed) => {
  const c = centre(e)
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + e.spin
    g.fireballs.push({ x: c.x, y: c.y, w: 4, h: 4, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, straight: true, friendly: false, fromWarden: true })
  }
}

const coreMoves = {
  nova: {
    tell: 0.85, act: 0.2, rest: 1.2,
    start: (g, e) => coreNova(g, e, 8 + e.phase * 2, 80),
  },
  rain: {
    tell: 0.7, act: 0.9, rest: 1.1,
    during: (g, e, dt) => {
      e.rainClock = (e.rainClock ?? 0) - dt
      if (e.rainClock > 0) return
      e.rainClock = 0.18
      const x = centre(g.player).x + (Math.random() - 0.5) * 90
      g.fireballs.push({ x, y: 3 * BLOCK, w: 4, h: 4, vx: 0, vy: 40, age: 0, friendly: false, fromWarden: true })
    },
  },
  ground: {
    tell: 1, act: 0.2, rest: 1.3,
    telling: (g, e) => {
      const c = centre(g.player)
      burst(g, c.x + (Math.random() - 0.5) * 60, c.y + 8, 'charge', 1)
    },
    start: (g, e) => {
      const c = centre(g.player)
      energize(g.world, cell(c.x), cell(g.player.y + g.player.h + 2), 38)
      zap(g, centre(e), { x: c.x, y: g.player.y + g.player.h })
    },
  },
  lance: {
    tell: 0.8, act: 0.2, rest: 0.9,
    telling: (g, e) => { e.aimAt = centre(g.player) },
    start: (g, e) => {
      const to = e.aimAt ?? centre(g.player)
      e.aimAt = null
      zap(g, centre(e), to)
      ignite(g.world, cell(to.x), cell(to.y))
      if (dist(to, centre(g.player)) < 12) hurt(g, g.player, 1, 'world', 'CHARGE')
    },
  },
  spill: {
    tell: 0.8, act: 1.1, rest: 1.1,
    start: (g, e) => {
      e.spillIs = [M.LAVA, M.WATER, M.ACID, M.OIL][(e.spills = (e.spills ?? 0) + 1) % 4]
      e.spillX = cell(centre(g.player).x)
    },
    during: (g, e, dt) => {
      e.spillClock = (e.spillClock ?? 0) - dt
      if (e.spillClock > 0) return
      e.spillClock = 0.07
      const x = e.spillX + Math.floor(Math.random() * 5) - 2
      const y = [...Array(8).keys()].map(i => i + 2).find(row => matAt(g.world, x, row) === M.EMPTY)
      if (y !== undefined) setCell(g.world, x, y, e.spillIs)
    },
  },
  quake: {
    tell: 0.8, act: 0.1, rest: 1,
    start: (g, e) => {
      quake(g, 14, 9)
      const kinds = ['emberbat', 'bomber', 'bat', 'crawler'].filter(kind => g.known.has(`foe:${kind}`))
      const baby = createEnemy({ kind: kinds[Math.floor(Math.random() * kinds.length)], x: centre(e).x, y: e.y })
      Object.assign(baby, { spawned: true, awake: true })
      if (g.enemies.filter(o => o.spawned).length < 3) g.spawns.push(baby)
    },
  },
}

const CORE_MOVES = [['nova', 'rain'], ['ground', 'lance', 'nova'], ['spill', 'quake', 'ground', 'nova']]

const coreInit = (g, e) => {
  if (e.bodied) return
  e.bodied = true
  e.spin = 0
  e.phase = 0
  e.home = { x: e.x, y: e.y }
  for (let i = 0; i < 4; i++) {
    const stone = createEnemy({ kind: 'orbit', x: e.x, y: e.y })
    Object.assign(stone, { partOf: 'core', index: i, hp: 9999, plated: true })
    g.spawns.push(stone)
  }
}

const core = (g, e, dt) => {
  coreInit(g, e)
  e.spin += dt * (0.8 + e.phase * 0.5)
  if (e.asleep) return
  e.shield = Math.max(0, (e.shield ?? 0) - dt)
  coolLava(g, e, dt)
  const share = e.hp / e.maxHp
  const due = CORE_PHASES.findLastIndex(limit => share <= limit)
  if (due > e.phase) {
    Object.assign(e, { phase: due, shield: 2, stage: 'rest', clock: 2.2, windup: false, aimAt: null, bag: [] })
    g.pulse = 1
    g.shake = Math.max(g.shake, 12)
    burst(g, centre(e).x, centre(e).y, 'white', 40)
    coreNova(g, e, 16, 60)
    quake(g, 10, 8)
  }
  const them = centre(g.player)
  const c = centre(e)
  const goal = { x: them.x, y: Math.min(them.y - 44, 19 * BLOCK) }
  const d = Math.max(1, dist(goal, c))
  const drift = (e.stage === 'rest' ? 30 : 14) + e.phase * 6
  if (d > 6 && fighting(e)) {
    e.x += ((goal.x - c.x) / d) * drift * dt
    e.y += ((goal.y - c.y) / d) * drift * dt
  }
  keepInside(e)
  runMoves(g, e, dt, coreMoves, () => bag(e, CORE_MOVES[e.phase]))
}

const orbit = (g, e) => {
  const body = g.enemies.find(o => o.kind === 'core')
  if (!body || body.hp <= 0) {
    e.hp = 0
    return
  }
  const live = 4 - body.phase
  e.asleep = body.asleep
  e.stowed = e.index >= live
  const c = centre(body)
  const a = body.spin + (e.index / live) * Math.PI * 2
  if (e.stowed) {
    e.x = c.x - e.w / 2
    e.y = c.y - e.h / 2
    return
  }
  e.x = c.x + Math.cos(a) * 28 - e.w / 2
  e.y = c.y + Math.sin(a) * 28 - e.h / 2
}

Object.assign(ENEMY_DEFS, {
  bellows: { size: [34, 26], hp: 240, value: 800, heavy: true, warden: true, sprite: [26] },
  colossus: { size: [30, 34], hp: 270, value: 800, heavy: true, magnetic: true, warden: true, sprite: [13] },
  crucible: { size: [24, 18], hp: 200, value: 800, heavy: true, free: true, fireproof: true, warden: true, sprite: [16] },
  eel: { size: [14, 10], hp: 210, value: 800, heavy: true, free: true, insulated: true, warden: true, sprite: [15] },
  eelseg: { size: [10, 8], hp: 9999, value: 0, heavy: true, free: true, insulated: true, part: true, sprite: [15] },
  brood: { size: [28, 22], hp: 210, value: 800, heavy: true, free: true, warden: true, sprite: [22] },
  conductor: { size: [18, 40], hp: 160, value: 800, heavy: true, insulated: true, warden: true, sprite: [16] },
  core: { size: [26, 26], hp: 600, value: 3000, heavy: true, free: true, warden: true, sprite: [31] },
  orbit: { size: [8, 8], hp: 9999, value: 0, heavy: true, free: true, fireproof: true, insulated: true, part: true, sprite: [6] },
})

Object.assign(STEPPERS, { bellows, colossus, crucible, eel, eelseg, brood, conductor, core, orbit })

Object.assign(ENEMY_TRAITS, {
  bellows: 'LEAKS GAS. LIGHT IT.',
  colossus: 'ITS STOMPS BRING DOWN THE ROOF. THE ROOF HURTS IT TOO.',
  crucible: 'POURS LAVA. FEARS WATER.',
  eel: 'SHOCKS THE WATER. BURNS WHEN IT LEAPS THROUGH FIRE.',
  brood: 'HANGS BY VINES. VINES BURN.',
  conductor: 'CHARGES THE FLOOR. WATER TURNS IT ON ITSELF.',
  core: 'THE ROCK ANSWERS TO IT.',
})

const FRAME_DOOR_ROW = floor => floor - 2

const openDoors = (grid, links, { floor, roof, sideRow = FRAME_DOOR_ROW(floor) }) => {
  const doors = {}
  const seals = []
  const exits = []
  const clears = []
  if (links.left) {
    for (const y of [sideRow, sideRow + 1]) for (const x of [0, 1]) { grid[y][x] = '.'; seals.push([x, y]) }
    doors.left = { row: sideRow }
  }
  if (links.right) {
    for (const y of [sideRow, sideRow + 1]) for (const x of [ROOM - 1, ROOM - 2]) { grid[y][x] = '.'; seals.push([x, y]) }
    doors.right = { row: sideRow }
  }
  if (links.up) {
    paint(grid, 12, 1, 15, roof - 1, '.')
    grid[0][13] = grid[0][14] = '.'
    doors.up = { col: 13 }
    for (let x = 12; x <= 15; x++) seals.push([x, roof - 1])
    for (let y = roof; y < floor; y++) for (let x = 12; x <= 15; x++) clears.push([x, y])
    let left = true
    for (let y = floor - 3; y >= 2; y -= 3) {
      exits.push([left ? 12 : 15, y])
      left = !left
    }
  }
  if (links.down) {
    paint(grid, 12, floor, 15, ROOM - 2, '.')
    grid[ROOM - 1][13] = grid[ROOM - 1][14] = '.'
    doors.down = { col: 13 }
    for (let x = 12; x <= 15; x++) seals.push([x, floor])
  }
  return { doors, seals, exits, clears }
}

const lampAt = (x, roof) => ({ kind: 'lamp', x: x * BLOCK + 1, y: roof * BLOCK })

const postWithTank = (grid, x, floor, roof, width = 5) => {
  paint(grid, x, roof + 3, x + width - 1, roof + 3, 'w')
  paint(grid, x, roof + 1, x, roof + 2, 'w')
  paint(grid, x + width - 1, roof + 1, x + width - 1, roof + 2, 'w')
  paint(grid, x + 1, roof + 1, x + width - 2, roof + 2, '~')
  const post = x + Math.floor(width / 2)
  paint(grid, post, roof + 4, post, floor - 1, 'w')
}

const ARENAS = {
  bellows: () => {
    const floor = 24
    const roof = 12
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    paint(grid, 2, roof - 1, 25, roof - 1, 'p')
    paint(grid, 2, floor, 25, floor, 'm')
    paint(grid, 2, floor + 1, 25, floor + 2, 'p')
    paint(grid, 2, 18, 6, 18, 'w')
    paint(grid, 21, 18, 25, 18, 'w')
    paint(grid, 10, 19, 17, 19, 'R')
    return { grid, floor, roof, boss: { x: 12, row: floor }, lamps: [5, 10, 17, 22] }
  },
  colossus: () => {
    const floor = 24
    const roof = 8
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    paint(grid, 2, roof - 1, 25, roof - 1, 'p')
    paint(grid, 2, roof - 3, 25, roof - 2, 's')
    paint(grid, 2, floor, 25, floor, 'M')
    paint(grid, 4, floor - 1, 5, floor - 1, 'S')
    paint(grid, 22, floor - 1, 23, floor - 1, 'S')
    paint(grid, 3, 17, 7, 17, 'R')
    paint(grid, 20, 17, 24, 17, 'R')
    return { grid, floor, roof, boss: { x: 12, row: floor }, lamps: [6, 12, 16, 21] }
  },
  crucible: () => {
    const floor = 24
    const roof = 4
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    paint(grid, 2, floor, 25, floor, 'M')
    postWithTank(grid, 2, floor, roof)
    postWithTank(grid, 8, floor, roof)
    postWithTank(grid, 17, floor, roof)
    paint(grid, 12, 18, 15, 18, 'R')
    paint(grid, 22, 18, 24, 18, 'R')
    return { grid, floor, roof, boss: { x: 12, y: 10 * BLOCK }, lamps: [7, 16] }
  },
  eel: () => {
    const floor = 26
    const roof = 4
    const sideRow = 11
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    paint(grid, 2, 15, 25, floor - 1, '~')
    paint(grid, 2, 13, 5, 25, 'R')
    paint(grid, 22, 13, 25, 25, 'R')
    paint(grid, 8, 14, 11, 14, 'w')
    paint(grid, 16, 14, 19, 14, 'M')
    paint(grid, 12, 9, 15, 9, 'w')
    paint(grid, 7, 15, 11, 15, 'o')
    paint(grid, 16, 15, 20, 15, 'o')
    paint(grid, 18, 15, 18, 25, 'M')
    return { grid, floor, roof, sideRow, boss: { x: 13, y: 20 * BLOCK }, lamps: [9, 18], inner: { y1: 25 } }
  },
  brood: () => {
    const floor = 24
    const roof = 5
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    paint(grid, 2, floor, 25, floor, 'm')
    paint(grid, 2, floor + 1, 25, floor + 1, 'p')
    for (const x of [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) paint(grid, x, roof, x, 10, 'v')
    paint(grid, 3, 17, 7, 17, 'w')
    paint(grid, 20, 17, 24, 17, 'w')
    paint(grid, 11, 19, 16, 19, 'w')
    return { grid, floor, roof, boss: { x: 10, y: 10 * BLOCK }, lamps: [8, 19] }
  },
  conductor: () => {
    const floor = 24
    const roof = 6
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    stripColumns().forEach(x => paint(grid, x, floor, x + STRIP_WIDTH - 1, floor, 'M'))
    ;[7, 13, 19, 25].forEach(x => paint(grid, x, floor, x, floor + 1, 'B'))
    postWithTank(grid, 5, floor, roof)
    postWithTank(grid, 17, floor, roof)
    paint(grid, 2, 17, 3, 17, 'B')
    paint(grid, 24, 17, 25, 17, 'B')
    paint(grid, 12, 17, 14, 17, 'B')
    return { grid, floor, roof, boss: { x: 13, row: floor }, lamps: [10, 15, 22] }
  },
  core: () => {
    const floor = 24
    const roof = 3
    const grid = blank()
    paint(grid, 2, roof, 25, floor - 1, '.')
    paint(grid, 2, floor, 25, floor + 1, 'R')
    paint(grid, 3, 19, 7, 19, 'w')
    paint(grid, 20, 19, 24, 19, 'w')
    paint(grid, 11, 16, 16, 16, 'B')
    paint(grid, 4, 12, 7, 12, 'B')
    paint(grid, 20, 12, 23, 12, 'B')
    paint(grid, 2, floor - 1, 3, floor - 1, 'V')
    paint(grid, 24, floor - 1, 25, floor - 1, 'V')
    return { grid, floor, roof, boss: { x: 13, y: 7 * BLOCK }, lamps: [] }
  },
}

export const buildArena = (id, links) => {
  const plan = ARENAS[id]()
  const { doors, seals, exits, clears } = openDoors(plan.grid, links, plan)
  const drains = []
  plan.grid[0].forEach((c, x) => { if (c !== '#') drains.push(x) })
  plan.grid[ROOM - 1].forEach((c, x) => { if (c !== '#') drains.push((ROOM - 1) * ROOM + x) })
  const interior = {
    x0: 2 * BLOCK, x1: 26 * BLOCK,
    y0: plan.roof * BLOCK, y1: (plan.inner?.y1 ?? plan.floor) * BLOCK,
  }
  return {
    map: plan.grid.map(row => row.join('')),
    doors, drains,
    cards: [], wares: [],
    enemies: [{ kind: id, x: plan.boss.x * BLOCK, row: plan.boss.row, y: plan.boss.y }, ...plan.lamps.map(x => lampAt(x, plan.roof))],
    layout: `arena-${id}`,
    spare: { x: 14 * BLOCK, y: (plan.floor - 2) * BLOCK },
    arena: { id, seals, exits, clears, interior, shape: plan.grid.map(row => row.join('')), lamps: plan.lamps.map(x => lampAt(x, plan.roof)), lampClock: 0, watch: 0 },
  }
}

const reachableFrom = (g, start) => {
  const seen = new Set([start.y * ROOM + start.x])
  const queue = [start]
  while (queue.length) {
    const { x, y } = queue.pop()
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx
      const ny = y + dy
      const key = ny * ROOM + nx
      if (nx < 0 || ny < 0 || nx >= ROOM || ny >= ROOM || seen.has(key) || props(matAt(g.world, nx, ny)).solid) continue
      seen.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return seen
}

const keepWardenReachable = (g, warden) => {
  const p = centre(g.player)
  const c = centre(warden)
  const open = reachableFrom(g, { x: cell(p.x), y: cell(p.y) })
  const touches = cellsUnder(warden, 2).some(([x, y]) => open.has(y * ROOM + x))
  if (touches) return
  const steps = Math.ceil(dist(p, c) / 4)
  for (let i = 0; i <= steps; i++) {
    const x = cell(p.x + ((c.x - p.x) * i) / steps)
    const y = cell(p.y + ((c.y - p.y) * i) / steps)
    for (const [dx, dy] of [[0, 0], [0, -1]]) {
      if (matAt(g.world, x + dx, y + dy) !== M.BEDROCK && props(matAt(g.world, x + dx, y + dy)).solid) setCell(g.world, x + dx, y + dy, M.EMPTY)
    }
  }
}

const restock = (g, arena, dt) => {
  arena.lampClock += dt
  if (arena.lampClock < TUNING.run.lampRespawn) return
  arena.lampClock = 0
  for (const lamp of arena.lamps) {
    const spot = createEnemy(lamp)
    if (solidAt(g.world, spot.x + 2, spot.y + 2) || !solidAt(g.world, spot.x + 2, spot.y - 2)) continue
    if (g.enemies.some(o => o.kind === 'lamp' && overlap(o, spot))) continue
    g.spawns.push(spot)
    burst(g, spot.x + 2, spot.y + 4, 'fire', 4)
  }
}

export const stepArena = (g, room, dt, seal) => {
  const { arena } = room
  const warden = g.enemies.find(o => o.warden)
  const p = g.player
  const { interior: i } = arena
  const inside = p.x > i.x0 && p.x + p.w < i.x1 && p.y >= i.y0 && p.y + p.h <= i.y1
  if (!room.sealed && !room.cleared && warden && inside) {
    seal(g, room)
    warden.asleep = false
    g.enemies.filter(o => o.partOf).forEach(o => { o.asleep = false })
  }
  g.boss = room.sealed ? warden : null
  if (!room.sealed || !warden) return
  warden.sinceHit = (warden.sinceHit ?? 0) + dt
  restock(g, arena, dt)
  arena.watch += dt
  if (arena.watch < 2) return
  arena.watch = 0
  keepWardenReachable(g, warden)
  if (warden.sinceHit > E.warden.stuck) {
    warden.sinceHit = 0
    warden.stun = Math.max(warden.stun, 2)
    if (warden.kind !== 'eel') {
      warden.x = Math.max(3 * BLOCK, Math.min(WORLD_PX - 3 * BLOCK - warden.w, centre(p).x - warden.w / 2))
    }
  }
}

const settleArena = (g, arena) => {
  for (let y = 1; y < ROOM - 1; y++) {
    for (let x = 1; x < ROOM - 1; x++) {
      const m = matAt(g.world, x, y)
      if (props(m).solid && m !== M.BEDROCK && arena.shape[y][x] === '.') {
        setCell(g.world, x, y, M.EMPTY)
        if (Math.random() < 0.2) burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 'pale', 2)
      }
      if (m === M.LAVA || m === M.ACID) setCell(g.world, x, y, M.EMPTY)
    }
  }
}

export const openArena = (g, room) => {
  const { arena } = room
  settleArena(g, arena)
  for (const [x, y] of [...arena.seals, ...arena.clears]) setCell(g.world, x, y, M.EMPTY)
  for (const [x, y] of arena.exits) if (!props(matAt(g.world, x, y)).solid) setCell(g.world, x, y, M.ROCK)
  g.enemies.forEach(o => {
    if (!o.spawned && !o.partOf) return
    o.hp = 0
    o.silent = true
  })
  g.fireballs = g.fireballs.filter(f => f.friendly)
  g.boss = null
}
