import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { energize, ignite, matAt, puff, setCell } from './world.js'
import { cell, cellsUnder, centre, hitsSolid, inWater, move, solidAt, WORLD_PX } from './physics.js'
import { burst, hurt } from './combat.js'
import { quake } from './skills.js'

const P = TUNING.player
const E = TUNING.enemies

export const ENEMY_DEFS = {
  crawler: { size: [12, 9], hp: 2, value: 10, magnetic: true, sprite: [0, 1] },
  spitter: { size: [14, 12], hp: 4, value: 25, fireproof: false, sprite: [2, 3] },
  fish: { size: [12, 7], hp: 2, value: 10, sprite: [4, 5] },
  spore: { size: [10, 10], hp: 1, value: 15, sprite: [6] },
  bat: { size: [12, 8], hp: 1, value: 15, sprite: [7, 8] },
  slug: { size: [14, 8], hp: 3, value: 20, magnetic: true, sprite: [9] },
  jelly: { size: [12, 12], hp: 2, value: 30, insulated: true, sprite: [14] },
  worm: { size: [14, 14], hp: 5, value: 50, sprite: [15] },
  guardian: { size: [24, 28], hp: 24, value: 500, magnetic: true, heavy: true, sprite: [13] },
  mole: { size: [12, 14], hp: 3, value: 0, friendly: true, sprite: [10] },
  hermit: { size: [10, 14], hp: 3, value: 0, friendly: true, sprite: [11] },
  miner: { size: [10, 14], hp: 3, value: 0, friendly: true, sprite: [12] },
}

export const ENEMY_TRAITS = {
  crawler: 'METAL SHELL. MAGNETS MOVE IT.',
  spitter: 'BURSTS INTO FLAME WHEN KILLED.',
  fish: 'CHASES SWIMMERS. DIES IN THE AIR.',
  spore: 'BURSTS INTO MARSH GAS.',
  bat: 'SLEEPS UNTIL YOU COME CLOSE.',
  slug: 'LEAVES A TRAIL OF OIL.',
  jelly: 'SHOCKS THE WATER AROUND IT.',
  worm: 'EATS THROUGH TERRAIN TOWARD YOU.',
  guardian: 'ITS STOMP LOOSENS THE CEILING.',
  mole: 'SELLS THINGS. CARRIES COIN.',
  hermit: 'TEACHES WHAT YOU ALREADY KNOW.',
  miner: 'TEACHES SOMETHING NEW.',
}

const shoved = (g, e, dt) => {
  if (e.shoved <= 0) return false
  e.shoved -= dt
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  if (e.hitWall) {
    hurt(g, e, TUNING.flung.damage)
    e.shoved = 0
  }
  return true
}

const walker = speed => (g, e, dt) => {
  if (shoved(g, e, dt)) return
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  if (e.stun > 0) {
    e.vx = 0
  } else {
    e.vx = e.facing * speed
    const ahead = e.x + (e.facing > 0 ? e.w + 1 : -1)
    const noFloor = e.grounded && !solidAt(g.world, ahead, e.y + e.h + 2)
    if (e.hitWall || noFloor) {
      e.facing *= -1
      e.vx = e.facing * speed
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

const spitter = (g, e, dt) => {
  const S = E.spitter
  const distance = g.index / (TUNING.run.rooms - 1)
  const calm = 1 - distance
  if (shoved(g, e, dt)) return
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  e.vx = 0
  move(g.world, e, dt)
  if (e.stun > 0) return
  const me = centre(e)
  const them = centre(g.player)
  e.facing = them.x < me.x ? -1 : 1
  e.cooldown -= dt
  e.frame = e.cooldown < 0.4 || e.cooldown > S.every - 0.3 ? 1 : 0
  if (e.cooldown > 0 || Math.hypot(them.x - me.x, them.y - me.y) > S.range) return
  const mouth = { x: me.x, y: e.y - 2 }
  const flight = S.flights.find(f => arcIsClear(g.world, mouth, launch(mouth, them, f), f))
  if (flight === undefined) return
  const { vx, vy } = launch(mouth, them, flight)
  g.fireballs.push({
    x: mouth.x - 2, y: mouth.y - 2, w: 4, h: 4,
    vx: vx + ((Math.random() - 0.5) * S.wobble * (1 + calm * S.calmWobble) * 2) / flight,
    vy, age: 0,
  })
  e.cooldown = S.every * (1 + calm * S.calmDelay)
}

const swim = (g, e, dt, speed, chaseSpeed) => {
  const world = g.world
  if (!inWater(world, e)) {
    e.vy = Math.min(P.maxFall, e.vy + 400 * dt)
    e.vx *= 0.9
    move(world, e, dt)
    e.airTime += dt
    if (e.airTime > E.fish.airDamageEvery) {
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
  const pace = chasing ? chaseSpeed : speed
  const step = { x: e.x + (dx / length) * pace * dt, y: e.y + (dy / length) * pace * dt, w: e.w, h: e.h }
  if (dx !== 0) e.facing = dx < 0 ? -1 : 1
  if (inWater(world, step) && !hitsSolid(world, step)) {
    e.x = step.x
    e.y = step.y
  }
}

const fish = (g, e, dt) => swim(g, e, dt, E.fish.speed, E.fish.chase)

const jelly = (g, e, dt) => {
  swim(g, e, dt, E.fish.speed * 0.6, E.fish.speed)
  e.cooldown -= dt
  if (e.cooldown > 0 || !inWater(g.world, e)) return
  e.cooldown = E.jelly.every
  const c = centre(e)
  energize(g.world, cell(c.x), cell(c.y), E.jelly.energy)
}

const flyToward = (g, e, dt, speed, weave) => {
  if (shoved(g, e, dt)) return
  if (e.stun > 0) {
    e.vx *= 0.8
    e.vy = Math.min(P.maxFall, e.vy + 300 * dt)
    move(g.world, e, dt)
    return
  }
  const me = centre(e)
  const them = centre(g.player)
  e.wander += dt
  const dx = them.x - me.x
  const dy = them.y - me.y + Math.sin(e.wander * 3) * weave
  const length = Math.max(1, Math.hypot(dx, dy))
  e.facing = dx < 0 ? -1 : 1
  e.vx = (dx / length) * speed
  e.vy = (dy / length) * speed
  move(g.world, e, dt)
}

const bat = (g, e, dt) => {
  const awake = Math.hypot(g.player.x - e.x, g.player.y - e.y) < E.bat.wakes || e.awake
  e.awake = awake
  if (!awake) return
  e.frame = Math.floor(e.wander * 8) % 2
  flyToward(g, e, dt, E.bat.speed, 30)
}

const spore = (g, e, dt) => flyToward(g, e, dt, E.spore.speed, 8)

const slug = (g, e, dt) => {
  walker(E.slug.speed)(g, e, dt)
  e.cooldown -= dt
  if (e.cooldown > 0 || e.stun > 0) return
  e.cooldown = E.slug.every
  const c = centre(e)
  puff(g.world, cell(c.x), cell(e.y + e.h - 1), M.OIL, [1, 1])
}

const DIGS = new Set([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.SAND, M.ICE, M.VOLATILE, M.SCRAP])

const worm = (g, e, dt) => {
  if (e.stun > 0) return
  const me = centre(e)
  const them = centre(g.player)
  const dist = Math.hypot(them.x - me.x, them.y - me.y)
  if (dist > E.worm.wakes) return
  e.facing = them.x < me.x ? -1 : 1
  e.x = Math.max(BLOCK, Math.min(WORLD_PX - BLOCK - e.w, e.x + ((them.x - me.x) / dist) * E.worm.speed * dt))
  e.y = Math.max(BLOCK, Math.min(WORLD_PX - BLOCK - e.h, e.y + ((them.y - me.y) / dist) * E.worm.speed * dt))
  for (const [x, y] of cellsUnder(e)) {
    const m = matAt(g.world, x, y)
    if (m === M.VOLATILE) ignite(g.world, x, y)
    else if (DIGS.has(m)) {
      setCell(g.world, x, y, M.EMPTY)
      burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 'pale', 3)
    }
  }
}

const guardian = (g, e, dt) => {
  walker(E.guardian.speed)(g, e, dt)
  const them = centre(g.player)
  const me = centre(e)
  if (e.stun <= 0 && Math.abs(them.x - me.x) > 16) e.facing = them.x < me.x ? -1 : 1
  e.cooldown -= dt
  if (e.cooldown > 0 || e.stun > 0 || !e.grounded) return
  e.cooldown = E.guardian.every
  quake(g, 12, 7)
  burst(g, me.x, e.y + e.h, 'pale', 18)
  if (g.player.grounded) {
    hurt(g, g.player, 1)
    g.player.stun = 0.25
  }
}

const idle = (g, e, dt) => {
  if (shoved(g, e, dt)) return
  e.vx = 0
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  e.facing = g.player.x < e.x ? -1 : 1
}

export const STEPPERS = {
  crawler: walker(E.crawler.speed), spitter, fish, jelly, bat, spore, slug, worm, guardian,
  mole: idle, hermit: idle, miner: idle,
}

export const onDeath = (g, e) => {
  const c = centre(e)
  const x = cell(c.x)
  const y = cell(c.y)
  if (e.kind === 'spitter') {
    const reach = E.spitter.burst
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) ignite(g.world, x + dx, y + dy)
    }
    burst(g, c.x, c.y, 'fire', 16)
  }
  if (e.kind === 'spore') {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1]]) puff(g.world, x + dx, y + dy, M.METHANE, [8, 12])
    burst(g, c.x, c.y, 'gas', 14)
  }
  if (e.kind === 'slug') {
    for (const dx of [-1, 0, 1]) puff(g.world, x + dx, y, M.OIL, [1, 1])
  }
  if (e.kind === 'guardian') {
    for (let i = 0; i < 40; i++) burst(g, e.x + Math.random() * e.w, e.y + Math.random() * e.h, 'white', 2)
    g.shake = 10
    g.pulse = 1
  }
}

export const createEnemy = ({ kind, x, row }) => {
  const def = ENEMY_DEFS[kind]
  const [w, h] = def.size
  return {
    kind, w, h, x,
    y: row * BLOCK - h,
    vx: 0, vy: 0,
    hp: def.hp,
    magnetic: def.magnetic === true,
    heavy: def.heavy === true,
    friendly: def.friendly === true,
    insulated: def.insulated === true,
    iframes: 0, stun: 0, frozen: 0, shoved: 0, frame: 0,
    cooldown: 1 + Math.random(),
    facing: Math.random() < 0.5 ? 1 : -1,
    airTime: 0,
    wander: Math.random() * 6,
    lastSource: 'world',
  }
}

export const clampToRoom = e => {
  e.x = Math.max(0, Math.min(ROOM * BLOCK - e.w, e.x))
  e.y = Math.max(0, Math.min(ROOM * BLOCK - e.h, e.y))
}

export const isFlammableGas = m => props(m).gas === true && Boolean(props(m).flammability)
