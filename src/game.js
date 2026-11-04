import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, createWorld, crushingAt, energize, ignite, matAt, puff, stepWorld } from './world.js'
import { FIRST_ROOM } from './room.js'

const P = TUNING.player
const WORLD_PX = ROOM * BLOCK
const SIZES = { crawler: [10, 7], spitter: [14, 10], fish: [10, 6] }

const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

const centre = e => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 })
const cell = px => Math.floor(px / BLOCK)

const solidAt = (w, px, py) => props(matAt(w, cell(px), cell(py))).solid === true

const cellsUnder = ({ x, y, w, h }, margin = 0) => {
  const out = []
  for (let cy = cell(y - margin); cy <= cell(y + h - 0.01 + margin); cy++) {
    for (let cx = cell(x - margin); cx <= cell(x + w - 0.01 + margin); cx++) out.push([cx, cy])
  }
  return out
}

const hitsSolid = (world, box) => cellsUnder(box).some(([x, y]) => props(matAt(world, x, y)).solid)

const moveAxis = (world, e, axis, distance) => {
  const sign = Math.sign(distance)
  let left = Math.abs(distance)
  while (left > 0) {
    const step = Math.min(0.25, left)
    const next = { ...e, [axis]: e[axis] + sign * step }
    if (hitsSolid(world, next)) return true
    e[axis] = next[axis]
    left -= step
  }
  return false
}

const move = (world, e, dt) => {
  e.hitWall = moveAxis(world, e, 'x', e.vx * dt)
  if (e.hitWall) e.vx = 0
  const blocked = moveAxis(world, e, 'y', e.vy * dt)
  e.grounded = blocked && e.vy > 0
  if (blocked) e.vy = 0
}

const pushOutOfSolid = (world, e) => {
  for (let i = 0; i < 24 && hitsSolid(world, e); i++) e.y -= 1
}

const inWater = (world, e) => {
  const c = centre(e)
  return matAt(world, cell(c.x), cell(c.y)) === M.WATER
}

const burst = (g, x, y, colour, count) => {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 20 + Math.random() * 60
    g.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.35, colour })
  }
}

const hurt = (g, e, amount) => {
  if (e.iframes > 0 || e.hp <= 0) return
  e.hp -= amount
  e.iframes = e === g.player ? P.iframes : TUNING.enemyIframes
  const c = centre(e)
  burst(g, c.x, c.y, e === g.player ? 'white' : 'pale', 5)
}

const applyCrush = (g, e) => {
  if (!cellsUnder(e).some(([x, y]) => crushingAt(g.world, x, y))) return
  hurt(g, e, TUNING.world.crushDamage)
  e.stun = TUNING.world.crushStun
}

const applyHazards = (g, e, dt) => {
  const world = g.world
  const touching = cellsUnder(e, 1)
  if (touching.some(([x, y]) => chargedAt(world, x, y))) {
    hurt(g, e, 2)
    e.stun = 0.7
  }
  if (touching.some(([x, y]) => burningAt(world, x, y))) hurt(g, e, 1)
  const inSmoke = cellsUnder(e).some(([x, y]) => props(matAt(world, x, y)).harmful)
  e.smoked = inSmoke ? (e.smoked ?? 0) + dt : Math.max(0, (e.smoked ?? 0) - dt)
  if (e.smoked > P.smokeTolerance) {
    hurt(g, e, 1)
    e.smoked = 0
  }
}

const createEnemy = ({ kind, x, row }) => {
  const [w, h] = SIZES[kind]
  return {
    kind, w, h,
    x,
    y: row * BLOCK - h,
    vx: kind === 'crawler' ? TUNING.crawler.speed : 0,
    vy: 0,
    hp: TUNING[kind].hp,
    iframes: 0,
    stun: 0,
    cooldown: 1,
    facing: 1,
    airTime: 0,
    wander: Math.random() * 6,
  }
}

const createPlayer = ({ x, row }) => ({
  x, y: row * BLOCK - P.height, w: 6, h: P.height,
  vx: 0, vy: 0, hp: P.hp, iframes: 0, stun: 0, facing: 1, crouching: false,
  grounded: false, sinceGround: 1, sinceJump: 1, jumpHeld: false,
  shotReady: 0, boltReady: 0, hasCard: false, aim: { x: 1, y: 0 },
  wasJump: false, wasSkill: false,
})

export const createGame = (depth = TUNING.startDepth) => ({
  depth,
  time: 0,
  phase: 'playing',
  phaseTime: 0,
  pause: 0,
  pulse: 0,
  world: createWorld(FIRST_ROOM.map),
  player: createPlayer(FIRST_ROOM.spawn),
  enemies: FIRST_ROOM.enemies.map(createEnemy),
  card: { x: FIRST_ROOM.card.x, y: FIRST_ROOM.card.row * BLOCK - 11, w: 8, h: 10, taken: false },
  shots: [],
  fireballs: [],
  bolts: [],
  particles: [],
})

const aimFrom = (p, input) => {
  const x = input.left ? -1 : input.right ? 1 : 0
  const y = input.up ? -1 : input.down && !p.grounded ? 1 : 0
  if (x === 0 && y === 0) return { x: p.facing, y: 0 }
  const length = Math.hypot(x, y)
  return { x: x / length, y: y / length }
}

const muzzle = p => ({ x: p.x + p.w / 2, y: p.y + (p.crouching ? 4 : 5) })

const crouch = (world, p, wants) => {
  const drop = P.height - P.crouchHeight
  if (wants && !p.crouching) {
    Object.assign(p, { y: p.y + drop, h: P.crouchHeight, crouching: true })
  } else if (!wants && p.crouching && !hitsSolid(world, { ...p, y: p.y - drop, h: P.height })) {
    Object.assign(p, { y: p.y - drop, h: P.height, crouching: false })
  }
}

const shoot = (g, p) => {
  const from = muzzle(p)
  g.shots.push({ x: from.x - 1, y: from.y - 1, w: 2, h: 2, vx: p.aim.x * P.shotSpeed, vy: p.aim.y * P.shotSpeed, life: P.shotLife })
  p.shotReady = P.shotEvery
}

const cast = (g, p) => {
  const start = muzzle(p)
  const { x: dx, y: dy } = p.aim
  const points = [start]
  let { x, y } = start
  let struck = null
  for (let travelled = 0; travelled < WORLD_PX * 1.5; travelled += 2) {
    x += dx * 2
    y += dy * 2
    if (Math.floor(travelled / 10) !== Math.floor((travelled - 2) / 10)) {
      points.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6 })
    }
    struck = g.enemies.find(e => overlap(e, { x, y, w: 1, h: 1 }))
    const m = matAt(g.world, cell(x), cell(y))
    if (struck || props(m).solid || m === M.WATER) break
  }
  points.push({ x, y })
  g.bolts.push({ points, life: 0.22 })
  if (struck) {
    hurt(g, struck, 2)
    struck.stun = 1
  }
  const energy = TUNING.world.boltEnergy * (1 + g.depth / 2)
  energize(g.world, cell(x), cell(y), energy)
  ignite(g.world, cell(x), cell(y))
  burst(g, x, y, 'charge', 8)
  p.boltReady = P.boltEvery
  g.pulse = 1
}

const stepPlayer = (g, input, dt) => {
  const p = g.player
  const world = g.world
  const swimming = inWater(world, p)
  applyCrush(g, p)
  const stunned = p.stun > 0
  crouch(world, p, input.down && !input.jump && p.grounded && !swimming)
  const wish = stunned ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const top = P.run * (swimming ? P.swimRun : 1)
  const towards = p.crouching ? 0 : wish * top
  const change = P.accel * dt
  p.vx += Math.max(-change, Math.min(change, towards - p.vx))
  if (wish !== 0) p.facing = wish
  p.aim = aimFrom(p, input)

  const gravity = swimming ? P.gravity * P.swimGravity : P.gravity
  const maxFall = swimming ? P.swimMaxFall : P.maxFall
  p.vy = Math.min(maxFall, p.vy + gravity * dt)

  p.sinceGround = p.grounded ? 0 : p.sinceGround + dt
  p.sinceJump = input.jump && !p.wasJump ? 0 : p.sinceJump + dt
  if (!stunned && !p.crouching && p.sinceJump < P.buffer) {
    if (swimming) {
      p.vy = -P.swimStroke
      p.sinceJump = 1
    } else if (p.sinceGround < P.coyote) {
      p.vy = -P.jump
      p.jumpHeld = true
      p.sinceJump = 1
      p.sinceGround = 1
    }
  }
  if (p.jumpHeld && !input.jump) {
    if (p.vy < 0) p.vy *= P.jumpCut
    p.jumpHeld = false
  }
  p.wasJump = input.jump

  move(world, p, dt)
  pushOutOfSolid(world, p)

  p.shotReady -= dt
  p.boltReady -= dt
  if (!stunned && input.shoot && p.shotReady <= 0) shoot(g, p)
  if (!stunned && input.skill && !p.wasSkill && p.hasCard && p.boltReady <= 0) cast(g, p)
  p.wasSkill = input.skill
  p.iframes -= dt
  p.stun -= dt

  applyHazards(g, p, dt)
  if (!g.card.taken && overlap(p, g.card)) {
    g.card.taken = true
    p.hasCard = true
    g.pause = TUNING.cardPause
    g.pulse = 1
  }
  if (p.x + p.w >= WORLD_PX - 0.5) {
    g.phase = 'cleared'
    g.phaseTime = 0
  }
  if (p.hp <= 0) {
    g.phase = 'dead'
    g.phaseTime = 0
    burst(g, p.x, p.y, 'white', 24)
  }
}

const stepCrawler = (g, e, dt) => {
  const C = TUNING.crawler
  e.vy = Math.min(P.maxFall, e.vy + C.gravity * dt)
  if (e.stun > 0) {
    move(g.world, { ...e, vx: 0 }, 0)
    e.vx = 0
  } else {
    e.vx = e.facing * C.speed
    const ahead = e.x + (e.facing > 0 ? e.w + 1 : -1)
    const noFloor = e.grounded && !solidAt(g.world, ahead, e.y + e.h + 2)
    if (e.hitWall || noFloor) {
      e.facing *= -1
      e.vx = e.facing * C.speed
    }
  }
  move(g.world, e, dt)
}

const launch = (from, target, flight) => ({
  vx: (target.x - from.x) / flight,
  vy: (target.y - from.y) / flight - 0.5 * TUNING.fireball.gravity * flight,
})

const arcIsClear = (world, from, { vx, vy }, flight) => {
  for (let t = 0.03; t < flight; t += 0.03) {
    const x = from.x + vx * t
    const y = from.y + vy * t + 0.5 * TUNING.fireball.gravity * t * t
    if (solidAt(world, x, y)) return false
  }
  return true
}

const findFlight = (world, from, target) =>
  TUNING.spitter.flights.find(flight => arcIsClear(world, from, launch(from, target, flight), flight))

const spit = (g, from, target, flight) => {
  const { vx, vy } = launch(from, target, flight)
  g.fireballs.push({
    x: from.x - 2, y: from.y - 2, w: 4, h: 4,
    vx: vx + ((Math.random() - 0.5) * TUNING.spitter.wobble * 2) / flight,
    vy,
    age: 0,
  })
}

const stepSpitter = (g, e, dt) => {
  const S = TUNING.spitter
  e.vy = Math.min(P.maxFall, e.vy + S.gravity * dt)
  e.vx = 0
  move(g.world, e, dt)
  if (e.stun > 0) return
  const me = centre(e)
  const them = centre(g.player)
  e.facing = them.x < me.x ? -1 : 1
  e.cooldown -= dt
  if (e.cooldown > 0 || Math.hypot(them.x - me.x, them.y - me.y) > S.range) return
  const mouth = { x: me.x, y: e.y - 2 }
  const flight = findFlight(g.world, mouth, them)
  if (flight === undefined) return
  spit(g, mouth, them, flight)
  e.cooldown = S.every
}

const stepFish = (g, e, dt) => {
  const F = TUNING.fish
  const world = g.world
  if (!inWater(world, e)) {
    e.vy = Math.min(P.maxFall, e.vy + 400 * dt)
    e.vx *= 0.9
    move(world, e, dt)
    e.airTime += dt
    if (e.airTime > F.airDamageEvery) {
      hurt(g, e, 1)
      e.airTime = 0
    }
    return
  }
  e.airTime = 0
  if (e.stun > 0) return
  const me = centre(e)
  const them = centre(g.player)
  const chasing = inWater(world, g.player)
  e.wander += dt
  const dx = chasing ? them.x - me.x : Math.cos(e.wander) * 20
  const dy = chasing ? them.y - me.y : Math.sin(e.wander * 0.7) * 10
  const length = Math.max(1, Math.hypot(dx, dy))
  const speed = chasing ? F.chase : F.speed
  const step = { ...e, x: e.x + (dx / length) * speed * dt, y: e.y + (dy / length) * speed * dt }
  if (dx !== 0) e.facing = dx < 0 ? -1 : 1
  if (inWater(world, step) && !hitsSolid(world, step)) {
    e.x = step.x
    e.y = step.y
  }
}

const STEPPERS = { crawler: stepCrawler, spitter: stepSpitter, fish: stepFish }

const spitterBursts = (g, e) => {
  const c = centre(e)
  const reach = TUNING.spitter.burst
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) ignite(g.world, cell(c.x) + dx, cell(c.y) + dy)
  }
  burst(g, c.x, c.y, 'fire', 16)
}

const stepEnemies = (g, dt) => {
  for (const e of g.enemies) {
    applyCrush(g, e)
    STEPPERS[e.kind](g, e, dt)
    pushOutOfSolid(g.world, e)
    e.iframes -= dt
    e.stun -= dt
    applyHazards(g, e, dt)
    if (e.stun <= 0 && overlap(e, g.player)) hurt(g, g.player, 1)
  }
  for (const e of g.enemies) {
    if (e.hp > 0) continue
    if (e.kind === 'spitter') spitterBursts(g, e)
    const c = centre(e)
    burst(g, c.x, c.y, 'pale', 10)
  }
  g.enemies = g.enemies.filter(e => e.hp > 0)
}

const stepShots = (g, dt) => {
  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    const victim = g.enemies.find(e => overlap(s, e))
    if (victim) {
      hurt(g, victim, 1)
      s.life = 0
    } else if (solidAt(g.world, s.x, s.y)) {
      burst(g, s.x, s.y, 'pale', 2)
      s.life = 0
    }
  }
  g.shots = g.shots.filter(s => s.life > 0)
}

const landFireball = (g, f) => {
  const x = cell(f.x + 2)
  const y = cell(f.y + 2)
  for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) ignite(g.world, x + dx, y + dy)
  burst(g, f.x + 2, f.y + 2, 'fire', 6)
  f.age = -1
}

const stepFireballs = (g, dt) => {
  for (const f of g.fireballs) {
    f.age += dt
    f.vy += TUNING.fireball.gravity * dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    const m = matAt(g.world, cell(f.x + 2), cell(f.y + 2))
    if (m === M.WATER) {
      puff(g.world, cell(f.x + 2), cell(f.y + 2) - 1, M.STEAM, TUNING.world.steamLife)
      f.age = -1
    } else if (props(m).solid) {
      landFireball(g, f)
    } else if (overlap(f, g.player)) {
      hurt(g, g.player, 1)
      f.age = -1
    } else if (f.age > TUNING.fireball.friendlyAfter) {
      const victim = g.enemies.find(e => overlap(f, e))
      if (victim) {
        hurt(g, victim, 1)
        f.age = -1
      }
    }
  }
  g.fireballs = g.fireballs.filter(f => f.age >= 0)
}

const stepEffects = (g, dt) => {
  for (const b of g.bolts) b.life -= dt
  g.bolts = g.bolts.filter(b => b.life > 0)
  for (const p of g.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 200 * dt
    p.life -= dt
  }
  g.particles = g.particles.filter(p => p.life > 0)
  g.pulse = Math.max(0, g.pulse - dt * 2.5)
}

const reset = g => Object.assign(g, createGame(g.depth))

export const restart = reset

export const step = (g, input, dt) => {
  g.time += dt
  stepEffects(g, dt)
  if (g.pause > 0) {
    g.pause -= dt
    return
  }
  if (g.phase !== 'playing') {
    g.phaseTime += dt
    stepWorld(g.world, dt, g.depth)
    const wait = g.phase === 'dead' ? TUNING.deadPause : TUNING.clearedPause
    if (g.phaseTime > wait) reset(g)
    return
  }
  stepWorld(g.world, dt, g.depth)
  if (g.world.gateOpened) {
    g.world.gateOpened = false
    g.pulse = 1
  }
  stepPlayer(g, input, dt)
  if (g.phase !== 'playing') return
  stepEnemies(g, dt)
  stepShots(g, dt)
  stepFireballs(g, dt)
}
