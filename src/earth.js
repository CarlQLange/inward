import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, lavaAt, matAt, setCell } from './world.js'
import { SOIL, cell, cellsUnder, centre, hitsSolid, moveAxis, moveThrough, overlap } from './physics.js'
import { burst, hurt } from './combat.js'
import { chunks } from './feel.js'
import { formOf, hostile, owns, thrown } from './skills.js'

const S = TUNING.skills
const C = S.clay
const B = S.burrow

const MUD_TINT = '#b8a684'
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const PICKS = new Set([M.SAND, M.ASH, M.SNOW, M.MUD])
const SOFTENS = new Set([M.SAND, M.ASH, M.SNOW])
const GRINDS = new Set([...SOIL, M.ROCK, M.MOSS])

const OFFSETS = (() => {
  const out = []
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 16) out.push([dx, dy])
  return out.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2) || a[1] - b[1])
})()

const inPlay = (x, y) => x >= 1 && y >= 1 && x <= ROOM - 2 && y <= ROOM - 2
const cellBox = (x, y) => ({ x: x * BLOCK, y: y * BLOCK, w: BLOCK, h: BLOCK })
const open = m => m === M.EMPTY || m === M.ASH || props(m).gas === true
const sticks = (w, x, y) => N4.some(([dx, dy]) => props(matAt(w, x + dx, y + dy)).solid || props(matAt(w, x + dx, y + dy)).liquid)
const end = f => {
  f.life = 0
  f.done = true
}

const soften = (g, x, y) => OFFSETS.filter(([dx, dy]) => dx * dx + dy * dy <= C.bogRadius ** 2).forEach(([dx, dy]) => {
  if (!SOFTENS.has(matAt(g.world, x + dx, y + dy))) return
  setCell(g.world, x + dx, y + dy, M.MUD)
  if (Math.random() < 0.3) chunks(g, (x + dx + 0.5) * BLOCK, (y + dy + 0.5) * BLOCK, M.MUD, 1)
})

const splat = (g, p, x, y, count) => {
  const mat = owns(p, 'clay.cast') ? M.BRICK : M.MUD
  let laid = 0
  for (const [dx, dy] of OFFSETS) {
    if (laid >= count) break
    const [cx, cy] = [x + dx, y + dy]
    const box = cellBox(cx, cy)
    if (!inPlay(cx, cy) || !open(matAt(g.world, cx, cy)) || overlap(p, box)) continue
    if (mat === M.BRICK && (!sticks(g.world, cx, cy) || g.enemies.some(e => overlap(e, box)))) continue
    setCell(g.world, cx, cy, mat)
    laid += 1
  }
  if (owns(p, 'clay.bog')) soften(g, x, y)
  chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, mat, 6)
}

const encase = (g, p, e) => {
  const [left, right] = [cell(e.x) - 1, cell(e.x + e.w - 0.01) + 1]
  const [top, bottom] = [cell(e.y) - 1, cell(e.y + e.h - 0.01) + 1]
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if ((x === left || x === right || y === top || y === bottom) && inPlay(x, y) && open(matAt(g.world, x, y)) && !overlap(p, cellBox(x, y))) setCell(g.world, x, y, M.BRICK)
    }
  }
  e.stun = Math.max(e.stun, C.castStun)
  chunks(g, centre(e).x, centre(e).y, M.BRICK, 8)
}

const fire = (g, e) => {
  hurt(g, e, C.bakeDamage, 'world', 'FIRE')
  chunks(g, centre(e).x, centre(e).y, M.BRICK, 8)
  if (e.heavy || e.warden) return
  e.stun = Math.max(e.stun, C.bakeHold)
  g.effects.push({ age: 0, kind: 'kiln', foe: e, life: C.bakeHold })
}

const daub = (g, p, e) => {
  if (owns(p, 'clay.cast')) {
    fire(g, e)
    return
  }
  g.effects.filter(f => f.kind === 'daub' && f.foe === e).forEach(end)
  g.effects.push({ age: 0, kind: 'daub', foe: e, life: C.daubTime, clock: 0 })
}

const smear = (g, p, e) => {
  hurt(g, e, C.damage, 'player')
  e.ablaze = 0
  const [x, y] = [cell(centre(e).x), cell(centre(e).y)]
  if (owns(p, 'clay.daub')) daub(g, p, e)
  else if (owns(p, 'clay.cast')) encase(g, p, e)
  else {
    e.stun = Math.max(e.stun, C.splatStun)
    splat(g, p, x, y, 6)
    return
  }
  if (owns(p, 'clay.bog')) soften(g, x, y + 1)
}

export const clay = (g, p) => {
  thrown(g, p, p.aim, 'clod', { speed: C.speed, lift: C.lift, size: 5, colour: formOf(p, 'clay').tint ?? MUD_TINT, splashes: true })
  g.pulse = Math.max(g.pulse, 0.3)
}

export const clodLands = (g, f, was, at, foe) => {
  const p = g.player
  if (foe) {
    smear(g, p, foe)
    return
  }
  const landed = props(matAt(g.world, cell(at.x), cell(at.y))).solid
  if (owns(p, 'clay.roll') && landed) {
    const ball = { age: 0, kind: 'ball', x: was.x, y: was.y + 2, dir: Math.sign(f.vx) || p.facing, vy: 0, held: 0, clock: 0, spin: 0, life: C.rollLife }
    for (let lift = 0; lift < BLOCK * 2 && hitsSolid(g.world, ballBox(ball)); lift++) ball.y -= 1
    g.effects.push(ball)
    return
  }
  splat(g, p, cell(was.x), cell(was.y), 6)
}

const ballSize = f => Math.min(12, 5 + f.held * 0.45)

const ballBox = f => {
  const size = ballSize(f)
  return { x: f.x - size / 2, y: f.y - size, w: size, h: size }
}

const settleBall = (g, f) => {
  splat(g, g.player, cell(f.x), cell(f.y - ballSize(f) / 2), 6 + f.held)
  end(f)
}

const ahead = f => {
  const box = ballBox(f)
  const x = cell(f.dir > 0 ? box.x + box.w + 1 : box.x - 1)
  const [top, bottom] = [cell(box.y), cell(box.y + box.h - 0.01)]
  return Array.from({ length: bottom - top + 1 }, (_, k) => [x, top + k])
}

const gather = (g, f) => {
  for (const [x, y] of [...cellsUnder(ballBox(f)), ...ahead(f), [cell(f.x), cell(f.y + 1)]]) {
    if (f.held >= C.rollMost || !inPlay(x, y) || !PICKS.has(matAt(g.world, x, y))) continue
    chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, matAt(g.world, x, y), 2)
    setCell(g.world, x, y, M.EMPTY)
    f.held += 1
  }
}

export const stepBall = (g, f, dt) => {
  const w = g.world
  const box = ballBox(f)
  f.vy = Math.min(220, f.vy + TUNING.fireball.gravity * dt)
  if (moveAxis(w, box, 'y', f.vy * dt)) f.vy = 0
  const walled = moveAxis(w, box, 'x', f.dir * C.rollSpeed * dt)
  f.x = box.x + box.w / 2
  f.y = box.y + box.h
  f.spin += f.dir * dt * 12
  f.size = box.w
  f.clock -= dt
  if (f.clock <= 0) {
    f.clock = 0.08
    gather(g, f)
  }
  cellsUnder(box, 1).forEach(([x, y]) => { if (burningAt(w, x, y)) w.burn[y * ROOM + x] = 0 })
  const foe = hostile(g).find(e => overlap(e, box))
  if (foe) {
    hurt(g, foe, C.rollDamage + Math.floor(f.held / 6), 'player')
    foe.stun = Math.max(foe.stun, C.splatStun * 2)
    foe.ablaze = 0
    if (owns(g.player, 'clay.daub')) daub(g, g.player, foe)
    settleBall(g, f)
    return
  }
  const sunk = props(matAt(w, cell(f.x), cell(f.y - 2))).liquid
  const blocked = walled && [...cellsUnder(box), ...ahead(f)].some(([x, y]) => props(matAt(w, x, y)).solid && !PICKS.has(matAt(w, x, y)))
  if (sunk || f.life <= dt || blocked) settleBall(g, f)
}

const heated = (w, e) => cellsUnder(e, 1).some(([x, y]) => burningAt(w, x, y) || lavaAt(w, x, y))

export const stepDaub = (g, f, dt) => {
  const e = f.foe
  if (e.hp <= 0) {
    end(f)
    return
  }
  const w = g.world
  const c = centre(e)
  f.clock -= dt
  if (f.clock <= 0) {
    f.clock = C.dripEvery
    const [x, y] = [cell(c.x), cell(e.y + e.h - 1)]
    if (inPlay(x, y) && open(matAt(w, x, y))) setCell(w, x, y, M.MUD)
  }
  if (!e.grounded && !e.heavy) moveAxis(w, e, 'y', C.sag * dt)
  if (heated(w, e)) {
    fire(g, e)
    end(f)
  }
}

export const stepKiln = (g, f) => {
  const e = f.foe
  if (e.hp <= 0) {
    end(f)
    return
  }
  e.stun = Math.max(e.stun, 0.1)
  e.vx = 0
  e.vy = 0
}

export const endKiln = (g, f) => chunks(g, centre(f.foe).x, centre(f.foe).y, M.BRICK, 10)

const digs = new WeakMap()

const stateOf = (g, p) => {
  const was = digs.get(p)
  if (was?.world === g.world) return was
  const fresh = { world: g.world, lane: null, laneAge: 0, cells: [], inside: false, wake: 0, grinding: false }
  digs.set(p, fresh)
  return fresh
}

const soilOf = p => (owns(p, 'burrow.grind') ? GRINDS : SOIL)

const soilCells = (w, p, soil) => cellsUnder(p).filter(([x, y]) => soil.has(matAt(w, x, y))).map(([x, y]) => y * ROOM + x)

const spray = (g, p, count) => {
  const c = centre(p)
  const m = matAt(g.world, cell(c.x), cell(c.y))
  chunks(g, c.x, c.y, SOIL.has(m) ? m : M.SAND, count)
}

export const burrow = (g, p) => {
  p.digging = 0.12
  spray(g, p, 4)
}

export const digging = (g, p) => {
  p.digging = Math.max(p.digging ?? 0, 0.12)
  return true
}

const slot = (x, y, rows) => Array.from({ length: rows }, (_, k) => [x, y - k])

const exitLane = (w, p, soil) => {
  const rows = Math.ceil(p.h / BLOCK)
  const start = { x: cell(p.x + p.w / 2), y: cell(p.y + p.h - 1) }
  const passable = ({ x, y }) => slot(x, y, rows).every(([cx, cy]) => inPlay(cx, cy) && (!props(matAt(w, cx, cy)).solid || soil.has(matAt(w, cx, cy))))
  const clear = ({ x, y }) => slot(x, y, rows).every(([cx, cy]) => !props(matAt(w, cx, cy)).solid)
  const parent = new Map([[start.y * ROOM + start.x, null]])
  const queue = [start]
  for (let at = 0; at < queue.length; at++) {
    const here = queue[at]
    if (clear(here)) {
      const lane = []
      for (let k = here.y * ROOM + here.x; k !== null; k = parent.get(k)) lane.unshift({ x: k % ROOM, y: Math.floor(k / ROOM) })
      return lane
    }
    for (const [dx, dy] of N4) {
      const next = { x: here.x + dx, y: here.y + dy }
      const key = next.y * ROOM + next.x
      if (parent.has(key) || !passable(next)) continue
      parent.set(key, here.y * ROOM + here.x)
      queue.push(next)
    }
  }
  return null
}

export const surface = (g, p) => {
  const state = stateOf(g, p)
  const lane = hitsSolid(g.world, p) ? exitLane(g.world, p, soilOf(p)) : null
  state.lane = lane
  state.laneAge = 0
  p.digging = lane ? 1 : 0
}

const emerge = (g, p) => {
  spray(g, p, 6)
  if (!owns(p, 'burrow.breach')) return
  const speed = Math.hypot(p.vx, p.vy)
  const dir = speed > 1 ? { x: p.vx / speed, y: p.vy / speed } : { x: 0, y: -1 }
  p.vx = dir.x * B.breach
  p.vy = Math.min(dir.y * B.breach, -B.breach * 0.35)
  p.drift = B.breachDrift
  p.jumpHeld = false
  p.iframes = Math.max(p.iframes, 0.2)
  burst(g, centre(p).x, p.y + p.h, MUD_TINT, 10)
}

const rise = (g, p, state, dt) => {
  const w = g.world
  state.laneAge += dt
  const next = state.lane[0]
  const done = () => {
    state.lane = null
    p.digging = 0
  }
  if (!next || state.laneAge > B.surfaceLimit) {
    done()
    return
  }
  const target = { x: next.x * BLOCK + (BLOCK - p.w) / 2, y: (next.y + 1) * BLOCK - p.h }
  const d = Math.hypot(target.x - p.x, target.y - p.y)
  if (d < 1.5) {
    Object.assign(p, { x: target.x, y: target.y, vx: 0, vy: 0 })
    state.lane.shift()
  } else {
    p.vx = ((target.x - p.x) / d) * B.surfaceSpeed
    p.vy = ((target.y - p.y) / d) * B.surfaceSpeed
    moveThrough(w, p, Math.min(dt, d / B.surfaceSpeed), m => soilOf(p).has(m))
  }
  if (owns(p, 'burrow.grind')) grind(g, soilCells(w, p, GRINDS))
  if (!hitsSolid(w, p)) {
    done()
    emerge(g, p)
  }
}

const grind = (g, keys) => keys.filter(k => {
  const m = g.world.mat[k]
  if (m !== M.ROCK && m !== M.MOSS) return false
  const [x, y] = [k % ROOM, Math.floor(k / ROOM)]
  setCell(g.world, x, y, M.SAND)
  chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, m, 2)
  return true
}).length > 0

const tunnelBehind = (g, state, now, soil) => {
  const kept = new Set(now)
  state.cells.filter(k => !kept.has(k) && soil.has(g.world.mat[k]) && props(g.world.mat[k]).solid).forEach(k => setCell(g.world, k % ROOM, Math.floor(k / ROOM), M.EMPTY))
}

const sink = (g, e) => {
  const w = g.world
  const feet = cell(e.y + e.h)
  const head = cell(e.y)
  for (let x = cell(e.x); x <= cell(e.x + e.w - 0.01); x++) {
    for (let k = 0; k < B.sinkDepth; k++) {
      const m = matAt(w, x, feet + k)
      if (!SOIL.has(m) || !inPlay(x, feet + k)) break
      setCell(w, x, feet + k, M.EMPTY)
      if (props(m).falls && open(matAt(w, x, head - 1 - k))) setCell(w, x, head - 1 - k, m)
    }
  }
  e.stun = Math.max(e.stun, B.sinkStun)
  e.vx = 0
  e.sunk = g.time + B.sinkEvery
  chunks(g, centre(e).x, e.y + e.h, M.SAND, 6)
}

const sinkAbove = (g, p) => {
  const c = centre(p)
  for (const e of hostile(g)) {
    if (e.heavy || e.warden || e.partOf || e.prop || e.stowed || e.free || (e.sunk ?? 0) > g.time) continue
    const feet = e.y + e.h
    const below = p.y - feet
    if (Math.abs(centre(e).x - c.x) > BLOCK * 1.5 || below < -2 || below > B.sinkReach * BLOCK) continue
    if (SOIL.has(matAt(g.world, cell(centre(e).x), cell(feet + 1)))) sink(g, e)
  }
}

const steer = input => {
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const y = (input.down ? 1 : 0) - (input.up || input.jump ? 1 : 0)
  const d = Math.hypot(x, y) || 1
  return { x: x / d, y: y / d }
}

const paceIn = (w, p, state) => (state.grinding ? B.rockSpeed : matAt(w, cell(centre(p).x), cell(centre(p).y)) === M.MUD ? B.mudSpeed : B.speed)

export const swim = (g, p, input, dt) => {
  const w = g.world
  const state = stateOf(g, p)
  if (state.lane) {
    rise(g, p, state, dt)
    return
  }
  p.digging -= dt
  const soil = soilOf(p)
  if (state.inside) {
    const dir = steer(input)
    const pace = paceIn(w, p, state)
    p.vx = dir.x * pace
    p.vy = dir.y * pace
  }
  moveThrough(w, p, dt, m => soil.has(m))
  const now = soilCells(w, p, soil)
  state.grinding = owns(p, 'burrow.grind') && grind(g, now)
  if (owns(p, 'burrow.tunnel')) tunnelBehind(g, state, now, soil)
  const inside = now.length > 0
  if (inside && !state.inside) spray(g, p, 5)
  if (!inside && state.inside) emerge(g, p)
  if (inside) {
    state.wake -= dt
    if (state.wake <= 0 && Math.hypot(p.vx, p.vy) > 1) {
      state.wake = B.wakeEvery
      spray(g, p, 1)
    }
    if (owns(p, 'burrow.quicksand')) sinkAbove(g, p)
  }
  state.inside = inside
  state.cells = now
  if (p.digging <= 0 && inside && hitsSolid(w, p)) surface(g, p)
}
