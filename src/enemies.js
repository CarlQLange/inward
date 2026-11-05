import { BLOCK, ROOM, TUNING } from './config.js'
import { M } from './materials.js'
import { burningAt, energize, explode, ignite, matAt, puff, setCell } from './world.js'
import { cell, cellsUnder, centre, hitsSolid, inWater, move, overlap, solidAt, WORLD_PX } from './physics.js'
import { burst, hurt } from './combat.js'
import { decoyFor } from './effects.js'

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
  turret: { size: [12, 12], hp: 3, value: 30, magnetic: true, heavy: true, sprite: [16] },
  bomber: { size: [12, 10], hp: 1, value: 20, magnetic: true, sprite: [17] },
  imp: { size: [10, 12], hp: 2, value: 20, sprite: [18] },
  emberbat: { size: [12, 9], hp: 1, value: 25, fireproof: true, sprite: [19] },
  slime: { size: [12, 8], hp: 3, value: 20, sprite: [20] },
  crab: { size: [14, 10], hp: 3, value: 30, shielded: true, magnetic: true, sprite: [21] },
  nest: { size: [14, 12], hp: 8, value: 80, heavy: true, sprite: [22] },
  mimic: { size: [12, 10], hp: 5, value: 60, sprite: [25] },
  gasbag: { size: [12, 12], hp: 1, value: 15, sprite: [26] },
  tick: { size: [6, 5], hp: 1, value: 10, sprite: [0] },
  pillbug: { size: [12, 9], hp: 4, value: 25, magnetic: true, sprite: [21] },
  gnat: { size: [3, 3], hp: 1, value: 5, sprite: [7] },
  stilt: { size: [10, 24], hp: 4, value: 35, sprite: [18] },
  snapweed: { size: [10, 10], hp: 3, value: 25, sprite: [22] },
  scrapper: { size: [12, 13], hp: 4, value: 35, magnetic: true, sprite: [2] },
  dripper: { size: [10, 10], hp: 2, value: 20, sprite: [6] },
  shade: { size: [12, 14], hp: 3, value: 40, free: true, insulated: true, sprite: [14] },
  urchin: { size: [11, 11], hp: 3, value: 30, plated: true, sprite: [6] },
  coil: { size: [10, 12], hp: 3, value: 30, insulated: true, sprite: [16] },
  puffer: { size: [10, 8], hp: 2, value: 30, sprite: [4] },
  lantern: { size: [12, 10], hp: 4, value: 40, sprite: [5] },
  lamp: { size: [6, 8], hp: 1, value: 0, friendly: true, prop: true, free: true, sprite: [29] },
  mole: { size: [12, 14], hp: 3, value: 0, friendly: true, sprite: [10] },
  hermit: { size: [10, 14], hp: 3, value: 0, friendly: true, sprite: [11] },
  miner: { size: [10, 14], hp: 3, value: 0, friendly: true, sprite: [12] },
  cartographer: { size: [10, 14], hp: 3, value: 0, friendly: true, sprite: [11] },
  tinker: { size: [12, 14], hp: 3, value: 0, friendly: true, sprite: [12] },
  bloodletter: { size: [10, 16], hp: 3, value: 0, friendly: true, sprite: [10] },
}

export const ENEMY_TRAITS = {
  crawler: 'MAGNETS MOVE IT',
  spitter: 'BURSTS INTO FLAME',
  fish: 'DIES IN THE AIR',
  spore: 'BURSTS INTO GAS',
  bat: 'WAKES WHEN CLOSE',
  slug: 'LEAVES OIL',
  jelly: 'SHOCKS THE WATER',
  worm: 'EATS THROUGH TERRAIN',
  turret: 'FIRES STRAIGHT',
  bomber: 'LIGHTS ITS FUSE',
  imp: 'FREEZES WATER, SNUFFS FIRE',
  emberbat: 'LIGHTS WHAT IT PASSES',
  slime: 'LEAVES ACID',
  crab: 'SHIELD STOPS SHOTS',
  nest: 'BREEDS UNTIL DESTROYED',
  mimic: 'NOT A CHEST',
  gasbag: 'LEAKS GAS',
  tick: 'LEAPS, CLINGS TO WALLS',
  pillbug: 'ROLLS UP, DEFLECTS SHOTS',
  gnat: 'MOVES AS A FLOCK',
  stilt: 'LOBS FROM UP HIGH',
  snapweed: 'LUNGES DOWN, BURNS WELL',
  scrapper: 'THROWS SCRAP',
  dripper: 'DRIPS FROM CEILINGS',
  shade: 'DRIFTS THROUGH ROCK',
  urchin: 'STOMP OR BLAST ONLY',
  coil: 'CHARGES METAL',
  puffer: 'SWELLS, BURSTS SPINES',
  lantern: 'A LIGHT THAT LURES',
  mole: 'SELLS THINGS',
  hermit: 'TEACHES AN EVOLUTION',
  miner: 'TEACHES A SKILL',
  cartographer: 'REVEALS THE MAP',
  tinker: 'SWAPS A RELIC',
  bloodletter: 'HEARTS FOR A LEVEL',
  bellows: 'LIGHT ITS GAS',
  crucible: 'LAVA MAKES NEW GROUND',
  colossus: 'STOMPS LOOSEN THE ROOF',
  eel: 'SHOCKS ITS POOL',
  brood: 'BURN HER VINES',
  conductor: 'OVERLOAD IT WITH WATER',
  core: 'THE CENTRE',
}

export const foeOf = (g, e) => {
  if (e.ally) {
    const others = g.enemies.filter(o => o !== e && !o.friendly && !o.ally)
    const closest = others.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0]
    return closest ? centre(closest) : centre(g.player)
  }
  const decoy = decoyFor(g)
  if (decoy) {
    const reach = decoy.loud ? 400 : TUNING.skills.decoy.range
    if (Math.hypot(decoy.x - e.x, decoy.y - e.y) < reach) return { x: decoy.x + 4, y: decoy.y + 8 }
  }
  return centre(g.player)
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
  const calm = 1 - g.ring / 7
  if (shoved(g, e, dt)) return
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  e.vx = 0
  move(g.world, e, dt)
  if (e.stun > 0) return
  const me = centre(e)
  const them = foeOf(g, e)
  e.facing = them.x < me.x ? -1 : 1
  e.cooldown -= dt
  e.frame = e.cooldown < 0.4 || e.cooldown > S.every - 0.3 ? 1 : 0
  e.windup = e.cooldown < TUNING.feel.windup
  if (e.cooldown > 0 || Math.hypot(them.x - me.x, them.y - me.y) > S.range) return
  const mouth = { x: me.x, y: e.y - 2 }
  const flight = S.flights.find(f => arcIsClear(g.world, mouth, launch(mouth, them, f), f))
  if (flight === undefined) return
  const { vx, vy } = launch(mouth, them, flight)
  g.fireballs.push({
    x: mouth.x - 2, y: mouth.y - 2, w: 4, h: 4,
    vx: vx + ((Math.random() - 0.5) * S.wobble * (1 + calm * S.calmWobble) * 2) / flight,
    vy, age: 0, friendly: Boolean(e.ally),
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
  const them = foeOf(g, e)
  const chasing = inWater(world, g.player) || Boolean(e.ally)
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
  e.windup = e.cooldown < TUNING.feel.windup
  if (e.windup) burst(g, centre(e).x, centre(e).y, 'charge', 1)
  if (e.cooldown > 0 || !inWater(g.world, e)) return
  e.cooldown = E.jelly.every
  const c = centre(e)
  energize(g.world, cell(c.x), cell(c.y), E.jelly.energy)
}

const flockPull = (g, e, reach = 40) => {
  if (!g.flocking) return { x: 0, y: 0 }
  const mates = g.enemies.filter(o => o !== e && !o.friendly && Math.hypot(o.x - e.x, o.y - e.y) < reach)
  if (mates.length === 0) return { x: 0, y: 0 }
  return {
    x: mates.reduce((sum, o) => sum + o.x - e.x, 0) / mates.length,
    y: mates.reduce((sum, o) => sum + o.y - e.y, 0) / mates.length,
  }
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
  const them = foeOf(g, e)
  e.wander += dt
  const pull = flockPull(g, e)
  const dx = them.x - me.x + pull.x
  const dy = them.y - me.y + Math.sin(e.wander * 3) * weave + pull.y
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

const lineClear = (world, a, b) => {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (solidAt(world, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false
  }
  return true
}

const turret = (g, e, dt) => {
  const T = E.turret
  if (e.stun > 0) return
  const me = centre(e)
  const them = foeOf(g, e)
  e.facing = them.x < me.x ? -1 : 1
  e.cooldown -= dt
  const d = Math.hypot(them.x - me.x, them.y - me.y)
  const lined = d <= T.range && lineClear(g.world, me, them)
  e.aimAt = lined && e.cooldown < TUNING.feel.windup * 1.4 ? them : null
  if (e.cooldown > 0 || !lined) return
  e.cooldown = T.every
  g.fireballs.push({
    x: me.x, y: me.y, w: 3, h: 3, vx: ((them.x - me.x) / d) * T.speed, vy: ((them.y - me.y) / d) * T.speed,
    age: 0, straight: true, pellet: true, friendly: Boolean(e.ally),
  })
}

const bomber = (g, e, dt) => {
  const B = E.bomber
  walker(B.speed)(g, e, dt)
  const me = centre(e)
  const them = foeOf(g, e)
  if (e.stun <= 0 && !e.lit) e.facing = them.x < me.x ? -1 : 1
  if (!e.lit && Math.hypot(them.x - me.x, them.y - me.y) < B.trigger) e.lit = B.fuse
  if (!e.lit) return
  e.lit -= dt
  burst(g, me.x, e.y, 'fire', 1)
  if (e.lit <= 0) e.hp = 0
}

const imp = (g, e, dt) => {
  const I = E.imp
  if (shoved(g, e, dt)) return
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  if (e.stun <= 0) {
    const me = centre(e)
    const them = foeOf(g, e)
    e.facing = them.x < me.x ? -1 : 1
    e.vx = e.facing * I.speed
    e.cooldown -= dt
    if (e.cooldown <= 0 && e.grounded) {
      e.vy = -I.hop
      e.cooldown = I.every
    }
  } else e.vx = 0
  move(g.world, e, dt)
  for (const [x, y] of cellsUnder({ x: e.x, y: e.y, w: e.w, h: e.h + 2 })) {
    const m = matAt(g.world, x, y)
    if (m === M.WATER) setCell(g.world, x, y, M.ICE)
    if (g.world.burn[y * ROOM + x] > 0) g.world.burn[y * ROOM + x] = 0
  }
}

const emberbat = (g, e, dt) => {
  const awake = Math.hypot(g.player.x - e.x, g.player.y - e.y) < E.emberbat.wakes || e.awake
  e.awake = awake
  if (!awake) return
  flyToward(g, e, dt, E.emberbat.speed, 26)
  const c = centre(e)
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = 0.25
  ignite(g.world, cell(c.x), cell(c.y))
  ignite(g.world, cell(c.x), cell(e.y + e.h + 2))
  burst(g, c.x, c.y, 'fire', 1)
}

const slime = (g, e, dt) => {
  walker(E.slime.speed)(g, e, dt)
  e.cooldown -= dt
  if (e.cooldown > 0 || e.stun > 0) return
  e.cooldown = E.slime.every
  const c = centre(e)
  puff(g.world, cell(c.x), cell(e.y + e.h - 1), M.ACID, [1, 1])
}

const crab = (g, e, dt) => {
  walker(E.crab.speed)(g, e, dt)
  const them = foeOf(g, e)
  if (e.stun <= 0 && e.shoved <= 0) e.facing = them.x < centre(e).x ? -1 : 1
}

const nest = (g, e, dt) => {
  const N = E.nest
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  if (e.stun > 0 || Math.hypot(g.player.x - e.x, g.player.y - e.y) > N.reach) return
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = N.every
  if (g.enemies.filter(o => o.spawned).length >= N.limit) return
  const kind = Math.random() < 0.5 ? 'bat' : 'crawler'
  const baby = createEnemy({ kind, x: e.x, row: 0 })
  baby.y = e.y - baby.h - 2
  baby.spawned = true
  baby.awake = true
  g.spawns.push(baby)
  burst(g, e.x + e.w / 2, e.y, 'gas', 6)
}

const mimic = (g, e, dt) => {
  const M_ = E.mimic
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  const near = Math.hypot(g.player.x - e.x, g.player.y - e.y) < M_.wakes
  if (near || e.hp < ENEMY_DEFS.mimic.hp) e.awake = true
  if (!e.awake || e.stun > 0) {
    e.vx = 0
    move(g.world, e, dt)
    return
  }
  const them = foeOf(g, e)
  e.facing = them.x < centre(e).x ? -1 : 1
  e.vx = e.facing * M_.speed
  e.cooldown -= dt
  if (e.grounded && e.cooldown <= 0) {
    e.vy = -M_.hop
    e.cooldown = 0.7
  }
  move(g.world, e, dt)
}

const gasbag = (g, e, dt) => {
  flyToward(g, e, dt, E.gasbag.speed, 6)
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = E.gasbag.every
  const c = centre(e)
  puff(g.world, cell(c.x), cell(c.y + 8), M.METHANE, [4, 7])
}

const hop = (from, target, flight, gravity) => ({
  vx: (target.x - from.x) / flight,
  vy: (target.y - from.y) / flight - 0.5 * gravity * flight,
})

const tick = (g, e, dt) => {
  const T = E.tick
  if (shoved(g, e, dt)) return
  if (e.clung > 0) {
    e.clung -= dt
    e.vx = 0
    e.vy = 0
  } else e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  if (e.hitWall && !e.grounded && !(e.clung > 0)) {
    e.clung = T.cling
    e.facing *= -1
  }
  if (e.grounded) e.vx = 0
  e.cooldown -= dt
  const set = e.grounded || e.clung > 0
  e.windup = set && e.cooldown < TUNING.feel.windup * 0.5
  if (!set || e.cooldown > 0 || e.stun > 0) return
  const me = centre(e)
  const them = foeOf(g, e)
  Object.assign(e, hop(me, { x: them.x, y: them.y - 12 }, T.flight, E.gravity), { clung: 0, cooldown: T.rest + Math.random() * 0.6, grounded: false })
  e.facing = e.vx < 0 ? -1 : 1
}

const curl = (e, away) => {
  const B = E.pillbug
  Object.assign(e, { ball: B.ball, plated: true, curlReady: B.again, vx: away * B.roll, vy: -120, frame: 1 })
}

const pillbug = (g, e, dt) => {
  const B = E.pillbug
  e.curlReady = Math.max(0, (e.curlReady ?? 0) - dt)
  if (e.hp < (e.hpSeen ?? e.hp) && !(e.ball > 0) && e.curlReady <= 0) curl(e, g.player.x < e.x ? 1 : -1)
  e.hpSeen = e.hp
  if (!(e.ball > 0)) {
    walker(B.speed)(g, e, dt)
    return
  }
  e.ball -= dt
  const [vx, vy] = [e.vx, e.vy + E.gravity * dt]
  e.vy = Math.min(P.maxFall, vy)
  move(g.world, e, dt)
  if (e.hitWall) e.vx = -vx * 0.9
  if (e.grounded) e.vy = -Math.abs(vy) * 0.65
  for (const o of g.enemies) {
    if (o !== e && !o.friendly && !o.ally && overlap(e, o)) hurt(g, o, 2)
  }
  if (e.ball <= 0) Object.assign(e, { plated: false, frame: 0, vx: 0 })
}

const gnat = (g, e, dt) => {
  const N = E.gnat
  if (e.stun > 0) return
  const them = foeOf(g, e)
  const me = centre(e)
  e.wander += dt
  const swooping = e.wander % N.swoop < N.swoopFor
  const flock = g.enemies.filter(o => o.kind === 'gnat' && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 30)
  const middle = flock.reduce((sum, o) => ({ x: sum.x + o.x, y: sum.y + o.y }), { x: e.x, y: e.y })
  const size = flock.length + 1
  const apart = flock.reduce((sum, o) => {
    const d = Math.max(1, Math.hypot(o.x - e.x, o.y - e.y))
    return d < 7 ? { x: sum.x + (e.x - o.x) / d, y: sum.y + (e.y - o.y) / d } : sum
  }, { x: 0, y: 0 })
  const orbit = swooping ? 0 : N.orbit
  const goal = { x: them.x + Math.cos(e.wander * 1.3) * orbit, y: them.y - 8 + Math.sin(e.wander * 1.7) * orbit * 0.6 }
  const wish = {
    x: (goal.x - me.x) * 0.6 + (middle.x / size - e.x) * 0.5 + apart.x * 26,
    y: (goal.y - me.y) * 0.6 + (middle.y / size - e.y) * 0.5 + apart.y * 26,
  }
  const length = Math.max(1, Math.hypot(wish.x, wish.y))
  e.vx += ((wish.x / length) * N.speed - e.vx) * Math.min(1, dt * 5)
  e.vy += ((wish.y / length) * N.speed - e.vy) * Math.min(1, dt * 5)
  e.facing = e.vx < 0 ? -1 : 1
  move(g.world, e, dt)
}

const stilt = (g, e, dt) => {
  const S = E.stilt
  walker(S.speed)(g, e, dt)
  if (e.stun > 0) return
  const top = { x: centre(e).x, y: e.y + 2 }
  const them = foeOf(g, e)
  e.cooldown -= dt
  e.windup = e.cooldown < TUNING.feel.windup
  if (e.cooldown > 0 || Math.hypot(them.x - top.x, them.y - top.y) > S.range) return
  e.cooldown = S.every
  const flight = S.flights.find(f => arcIsClear(g.world, top, launch(top, them, f), f))
  if (flight === undefined) return
  g.fireballs.push({ x: top.x - 2, y: top.y - 2, w: 4, h: 4, ...launch(top, them, flight), age: 0, pellet: true, friendly: Boolean(e.ally) })
}

const snapweed = (g, e, dt) => {
  const S = E.snapweed
  e.anchor ??= { x: e.x, y: e.y }
  if (!solidAt(g.world, e.anchor.x + e.w / 2, e.anchor.y - 2)) {
    e.hp = 0
    return
  }
  if (cellsUnder(e, 1).some(([x, y]) => burningAt(g.world, x, y))) hurt(g, e, 2)
  e.cooldown -= dt
  const them = foeOf(g, e)
  const me = centre(e)
  e.stage ??= 'rest'
  if (e.stun > 0) {
    e.stage = 'back'
    e.windup = false
  }
  if (e.stage === 'rest') {
    e.windup = false
    const under = Math.abs(them.x - me.x) < 16 && them.y > me.y && them.y - me.y < S.reach
    if (e.cooldown <= 0 && under) Object.assign(e, { stage: 'tell', clock: S.tell, windup: true })
  } else if (e.stage === 'tell') {
    e.clock -= dt
    if (e.clock <= 0) Object.assign(e, { stage: 'lunge', windup: false })
  } else if (e.stage === 'lunge') {
    e.vy = S.lunge
    e.vx = 0
    move(g.world, e, dt)
    if (e.grounded || e.y - e.anchor.y > S.reach) Object.assign(e, { stage: 'hold', clock: S.hold })
  } else if (e.stage === 'hold') {
    e.clock -= dt
    if (e.clock <= 0) e.stage = 'back'
  } else {
    e.y = Math.max(e.anchor.y, e.y - S.retract * dt)
    if (e.y <= e.anchor.y) Object.assign(e, { stage: 'rest', cooldown: S.every })
  }
}

const throwScrap = (g, e, them, spread = 0) => {
  const from = { x: centre(e).x, y: e.y - 6 }
  const flight = 0.8
  const G = TUNING.flung.gravity
  g.flung.push({ x: from.x - 4, y: from.y - 4, w: 8, h: 8, ...hop(from, { x: them.x + spread, y: them.y }, flight, G), age: 0, thrower: e })
}

const scrapper = (g, e, dt) => {
  const S = E.scrapper
  walker(S.speed)(g, e, dt)
  if (e.stun > 0) return
  const them = foeOf(g, e)
  const me = centre(e)
  e.loaded ??= true
  e.frame = e.loaded ? 0 : 1
  e.cooldown -= dt
  if (!e.loaded) {
    const heap = cellsUnder({ x: e.x - 8, y: e.y, w: e.w + 16, h: e.h }).find(([x, y]) => matAt(g.world, x, y) === M.SCRAP)
    if (heap) setCell(g.world, heap[0], heap[1], M.EMPTY)
    if (heap || e.cooldown < -S.reload) Object.assign(e, { loaded: true, cooldown: 0.6 })
    return
  }
  e.facing = them.x < me.x ? -1 : 1
  e.windup = e.cooldown < TUNING.feel.windup
  if (e.cooldown > 0 || Math.hypot(them.x - me.x, them.y - me.y) > S.range) return
  throwScrap(g, e, them)
  e.loaded = false
  e.cooldown = S.every
}

const dripper = (g, e, dt) => {
  const D = E.dripper
  e.drips ??= g.ring >= 2 && Math.random() < 0.4 ? M.ACID : M.OIL
  e.dropsLeft ??= D.drops
  if (!solidAt(g.world, centre(e).x, e.y - 2)) {
    e.hp = 0
    return
  }
  e.cooldown -= dt
  e.windup = e.dropsLeft > 0 && e.cooldown < 0.3
  if (e.cooldown > 0 || e.dropsLeft <= 0 || e.stun > 0) return
  e.cooldown = D.every
  e.dropsLeft -= 1
  puff(g.world, cell(centre(e).x), cell(e.y + e.h + 1), e.drips, [1, 1])
}

const shade = (g, e, dt) => {
  const me = centre(e)
  const them = foeOf(g, e)
  e.intangible = solidAt(g.world, me.x, me.y)
  if (e.stun > 0) return
  e.wander += dt
  const d = Math.max(1, Math.hypot(them.x - me.x, them.y - me.y))
  e.facing = them.x < me.x ? -1 : 1
  e.x += ((them.x - me.x) / d) * E.shade.speed * dt
  e.y += (((them.y - me.y) / d) * E.shade.speed + Math.sin(e.wander * 2) * 8) * dt
}

const coil = (g, e, dt) => {
  const C = E.coil
  if (shoved(g, e, dt)) return
  const airborne = !e.grounded
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  if (e.grounded && airborne && e.flying) {
    e.flying = false
    e.vx = 0
    const c = centre(e)
    energize(g.world, cell(c.x), cell(e.y + e.h + 2), C.energy)
    burst(g, c.x, e.y + e.h, 'charge', 5)
  }
  if (e.grounded) e.vx = 0
  e.cooldown -= dt
  e.windup = e.grounded && e.cooldown < TUNING.feel.windup
  if (!e.grounded || e.cooldown > 0 || e.stun > 0) return
  const them = foeOf(g, e)
  e.facing = them.x < centre(e).x ? -1 : 1
  Object.assign(e, { vx: e.facing * C.speed, vy: -C.hop, cooldown: C.every, flying: true })
}

const resize = (e, w, h) => {
  const c = centre(e)
  Object.assign(e, { w, h, x: c.x - w / 2, y: c.y - h / 2 })
}

const puffer = (g, e, dt) => {
  const F = E.puffer
  const [w, h] = ENEMY_DEFS.puffer.size
  if (!(e.swell > 0)) swim(g, e, dt, E.fish.speed * 0.7, E.fish.speed)
  e.cooldown -= dt
  const them = foeOf(g, e)
  const me = centre(e)
  const near = Math.hypot(them.x - me.x, them.y - me.y) < F.near
  if (e.swell > 0) {
    e.swell -= dt
    const grown = 1 + (1 - Math.max(0, e.swell) / F.tell)
    resize(e, w * grown, h * grown)
    if (e.swell > 0 || e.stun > 0) return
    for (let i = 0; i < F.spines; i++) {
      const a = (i / F.spines) * Math.PI * 2
      g.fireballs.push({ x: me.x, y: me.y, w: 3, h: 3, vx: Math.cos(a) * F.spineSpeed, vy: Math.sin(a) * F.spineSpeed, age: 0, straight: true, pellet: true, friendly: Boolean(e.ally) })
    }
    burst(g, me.x, me.y, 'pale', 12)
    resize(e, w, h)
    e.windup = false
    e.cooldown = F.every
    e.swell = 0
  } else if (near && e.cooldown <= 0 && inWater(g.world, e) && e.stun <= 0) {
    e.swell = F.tell
    e.windup = true
  }
}

const lantern = (g, e, dt) => {
  const L = E.lantern
  const me = centre(e)
  e.lure = { x: me.x + e.facing * 10, y: me.y - 12 + Math.sin(g.time * 2) * 2 }
  const them = foeOf(g, e)
  e.cooldown -= dt
  if (e.lunging > 0 && inWater(g.world, e) && e.stun <= 0) {
    e.lunging -= dt
    const d = Math.max(1, Math.hypot(them.x - me.x, them.y - me.y))
    const next = { x: e.x + ((them.x - me.x) / d) * L.lunge * dt, y: e.y + ((them.y - me.y) / d) * L.lunge * dt, w: e.w, h: e.h }
    if (!hitsSolid(g.world, next)) Object.assign(e, { x: next.x, y: next.y })
    e.windup = false
    return
  }
  swim(g, e, dt, E.fish.speed * 0.5, E.fish.speed * 0.5)
  const near = Math.hypot(them.x - e.lure.x, them.y - e.lure.y) < L.near
  e.windup = near && e.cooldown < 0.4
  if (near && e.cooldown <= 0 && e.stun <= 0) {
    e.lunging = L.lungeFor
    e.cooldown = L.every
  }
}

const lamp = (g, e) => {
  e.vx = 0
  e.vy = 0
}

const idle = (g, e, dt) => {
  if (shoved(g, e, dt)) return
  e.vx = 0
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  e.facing = g.player.x < e.x ? -1 : 1
}

export const STEPPERS = {
  crawler: walker(E.crawler.speed), spitter, fish, jelly, bat, spore, slug, worm,
  turret, bomber, imp, emberbat, slime, crab, nest, mimic, gasbag,
  tick, pillbug, gnat, stilt, snapweed, scrapper, dripper, shade, coil, puffer, lantern, lamp,
  urchin: walker(E.urchin.speed),
  mole: idle, hermit: idle, miner: idle, cartographer: idle, tinker: idle, bloodletter: idle,
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
  if (e.kind === 'slime') {
    for (const dx of [-1, 0, 1]) puff(g.world, x + dx, y, M.ACID, [1, 1])
  }
  if (e.kind === 'gasbag') {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) < 4) puff(g.world, x + dx, y + dy, M.METHANE, [8, 12])
  }
  if (e.kind === 'bomber') explode(g.world, x, y, 2)
  if (e.detonates) explode(g.world, x, y, 2)
  if (e.shatters) explode(g.world, x, y, 1)
  if (e.kind === 'snapweed') for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) ignite(g.world, x + dx, y + dy)
  if (e.kind === 'dripper') for (const dx of [-1, 0, 1, -2, 2]) puff(g.world, x + dx, y + 1, e.drips ?? M.OIL, [1, 1])
  if (e.kind === 'scrapper' && e.loaded) puff(g.world, x, y, M.SCRAP, [0, 0])
  if (e.kind === 'lamp') {
    g.fireballs.push({ x: e.x + 1, y: e.y + e.h, w: 4, h: 4, vx: 0, vy: 20, age: 0, friendly: true, fromWorld: true, napalm: true })
    burst(g, c.x, c.y, 'fire', 8)
  }
}

export const createEnemy = ({ kind, x, row, y }) => {
  const def = ENEMY_DEFS[kind]
  const [w, h] = def.size
  return {
    kind, w, h, x,
    y: y ?? row * BLOCK - h,
    vx: 0, vy: 0,
    hp: def.hp,
    magnetic: def.magnetic === true,
    heavy: def.heavy === true,
    friendly: def.friendly === true,
    insulated: def.insulated === true,
    fireproof: def.fireproof === true,
    shielded: def.shielded === true,
    plated: def.plated === true,
    warden: def.warden === true,
    prop: def.prop === true,
    free: def.free === true,
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
