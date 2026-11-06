import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, energize, explode, ignite, matAt, pour, puff, setCell } from './world.js'
import { cell, cellsUnder, centre, hitsSolid, inWater, move, overlap, solidAt, WORLD_PX } from './physics.js'
import { burst, hurt } from './combat.js'
import { chipsAt, splash } from './fx.js'
import { decoyFor } from './effects.js'
import { aimSpot, zap } from './skills.js'
import { anchorOf } from './cast.js'
import {
  awayFrom, bite, cellNear, clearBetween, creatures, dangerAhead, dist, eatRemains, exposed, feel, firstFright, grudgeOf, hostOf, hunt,
  leaveRemains, lightsOf, nearest, noiseNear, preyOf, quarryOf, remainsNear, ride, swims, tallyLife, touchingRemains,
} from './lives.js'

const P = TUNING.player
const E = TUNING.enemies
const L = E.lives

export const ENEMY_DEFS = {
  crawler: { size: [22, 12], hp: 2, value: 10, magnetic: true },
  spitter: { size: [20, 16], hp: 4, value: 25, fireproof: false },
  fish: { size: [18, 12], hp: 2, value: 10 },
  spore: { size: [14, 14], hp: 1, value: 15 },
  bat: { size: [20, 12], hp: 1, value: 15 },
  slug: { size: [27, 13], hp: 3, value: 20, magnetic: true },
  jelly: { size: [14, 16], hp: 2, value: 30, insulated: true },
  worm: { size: [16, 18], hp: 5, value: 50 },
  turret: { size: [20, 13], hp: 3, value: 30, magnetic: true, heavy: true },
  bomber: { size: [14, 20], hp: 1, value: 20, magnetic: true },
  imp: { size: [12, 22], hp: 2, value: 20 },
  emberbat: { size: [20, 14], hp: 1, value: 25, fireproof: true },
  slime: { size: [20, 13], hp: 3, value: 20, acidproof: true },
  crab: { size: [20, 16], hp: 3, value: 30, shielded: true, magnetic: true },
  nest: { size: [16, 22], hp: 8, value: 80, heavy: true },
  mimic: { size: [19, 16], hp: 5, value: 60 },
  gasbag: { size: [14, 16], hp: 1, value: 15 },
  tick: { size: [8, 6], hp: 1, value: 10 },
  pillbug: { size: [18, 11], hp: 4, value: 25, magnetic: true },
  gnat: { size: [3, 3], hp: 1, value: 5 },
  stilt: { size: [24, 26], hp: 4, value: 35 },
  snapweed: { size: [10, 10], hp: 3, value: 25 },
  scrapper: { size: [16, 20], hp: 4, value: 35, magnetic: true },
  dripper: { size: [10, 10], hp: 2, value: 20 },
  shade: { size: [14, 20], hp: 3, value: 40, free: true, insulated: true },
  urchin: { size: [16, 16], hp: 3, value: 30, plated: true },
  coil: { size: [16, 22], hp: 3, value: 30, insulated: true },
  puffer: { size: [14, 10], hp: 2, value: 30 },
  lantern: { size: [18, 16], hp: 4, value: 40 },
  lamp: { size: [6, 8], hp: 1, value: 0, friendly: true, prop: true, free: true },
  battery: { size: [8, 10], hp: 1, value: 0, friendly: true, prop: true, free: true },
  tank: { size: [12, 9], hp: 1, value: 0, friendly: true, prop: true, free: true },
  carboy: { size: [8, 10], hp: 1, value: 0, friendly: true, prop: true, free: true },
  ladle: { size: [10, 9], hp: 1, value: 0, friendly: true, prop: true, free: true },
  sandbag: { size: [8, 10], hp: 1, value: 0, friendly: true, prop: true, free: true },
  mole: { size: [14, 22], hp: 3, value: 0, friendly: true },
  hermit: { size: [14, 22], hp: 3, value: 0, friendly: true },
  miner: { size: [14, 20], hp: 3, value: 0, friendly: true },
}

export const ENEMY_TRAITS = {
  crawler: 'MAGNETS PULL IT',
  spitter: 'BURSTS INTO FLAME',
  fish: 'DIES IN THE AIR',
  spore: 'BURSTS INTO GAS',
  bat: 'WAKES WHEN CLOSE',
  slug: 'LEAVES OIL',
  jelly: 'SHOCKS THE WATER',
  worm: 'DIGS THROUGH BLOCKS',
  turret: 'FIRES STRAIGHT',
  bomber: 'LIGHTS ITS FUSE',
  imp: 'FREEZES WATER, SNUFFS FIRE',
  emberbat: 'LIGHTS WHAT IT PASSES',
  slime: 'LEAVES ACID',
  crab: 'ITS SHIELD STOPS SHOTS FROM THE FRONT',
  nest: 'BREEDS UNTIL DESTROYED',
  mimic: 'LOOKS LIKE A CHEST',
  gasbag: 'LEAKS GAS',
  tick: 'LEAPS, CLINGS TO WALLS',
  pillbug: 'ROLLS UP, DEFLECTS SHOTS',
  gnat: 'MOVES AS A FLOCK',
  stilt: 'LOBS FROM UP HIGH',
  snapweed: 'LUNGES DOWN, BURNS WELL',
  scrapper: 'THROWS SCRAP',
  dripper: 'DRIPS FROM CEILINGS',
  shade: 'DRIFTS THROUGH ROCK',
  urchin: 'ONLY STOMPS AND BLASTS HURT IT',
  coil: 'CHARGES METAL',
  puffer: 'SWELLS, BURSTS SPINES',
  lantern: 'LUNGES WHEN YOU NEAR ITS LIGHT',
  mole: 'SELLS THINGS',
  hermit: 'TEACHES AN EVOLUTION',
  miner: 'TEACHES A SKILL',
  bellows: 'LIGHT ITS GAS',
  crucible: 'LAVA MAKES NEW GROUND',
  colossus: 'STOMPS LOOSEN THE ROOF',
  eel: 'SHOCKS ITS POOL',
  brood: 'BURN ITS VINES TO DROP IT',
  conductor: 'OVERLOAD IT WITH WATER',
  core: 'THE CENTRE',
}

export const foeOf = (g, e) => {
  if (e.ally) {
    const others = g.enemies.filter(o => o !== e && !o.friendly && !o.ally)
    const closest = others.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0]
    return closest ? centre(closest) : centre(g.player)
  }
  const quarry = quarryOf(e)
  if (quarry) return quarry
  const decoy = decoyFor(g)
  if (decoy) {
    const reach = decoy.loud ? 400 : TUNING.skills.blink.ghostRange
    if (Math.hypot(decoy.x - e.x, decoy.y - e.y) < reach) return { x: decoy.x + 4, y: decoy.y + 8 }
  }
  return centre(g.player)
}

export const puppeted = e => e.puppet && e.ally > 0 && !(e.shoved > 0) && ['ground', 'free'].includes(anchorOf(e.kind))

export const steerPuppet = (g, e, dt) => {
  const C = TUNING.skills.charm
  const to = aimSpot(g, g.player, C.puppetReach)
  const c = centre(e)
  const free = anchorOf(e.kind) === 'free'
  const dx = to.x - c.x
  if (Math.abs(dx) > 2) e.facing = Math.sign(dx)
  e.vx = Math.abs(dx) > 3 ? Math.sign(dx) * C.puppetSpeed : 0
  e.vy = free ? (Math.abs(to.y - c.y) > 3 ? Math.sign(to.y - c.y) * C.puppetSpeed : 0) : Math.min(P.maxFall, e.vy + E.gravity * dt)
  move(g.world, e, dt)
  if (!free && e.hitWall && e.grounded) e.vy = -C.puppetJump
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

const fall = (e, dt) => {
  e.vy = Math.min(P.maxFall, e.vy + E.gravity * dt)
}

const floorAhead = (g, e, dir) => solidAt(g.world, e.x + (dir > 0 ? e.w + 1 : -1), e.y + e.h + 2)

const walk = (g, e, dt, speed) => {
  if (shoved(g, e, dt)) return
  fall(e, dt)
  if (e.stun > 0) {
    e.vx = 0
  } else {
    e.vx = e.facing * speed
    const blocked = dir => (e.grounded && !floorAhead(g, e, dir)) || dangerAhead(g, e, dir)
    if (e.hitWall || blocked(e.facing)) {
      e.facing *= -1
      e.vx = blocked(e.facing) ? 0 : e.facing * speed
    }
  }
  move(g.world, e, dt)
}

const walker = speed => (g, e, dt) => walk(g, e, dt, speed)

const stand = (g, e, dt) => {
  if (shoved(g, e, dt)) return
  fall(e, dt)
  e.vx = 0
  move(g.world, e, dt)
}

const walkTo = (g, e, dt, x, speed) => {
  const c = centre(e)
  if (Math.abs(x - c.x) < 2) {
    stand(g, e, dt)
    return true
  }
  const toward = x < c.x ? -1 : 1
  e.facing = toward
  walk(g, e, dt, speed)
  if (e.facing !== toward) e.bored = L.bored
  return false
}

const wander = (g, e, dt, speed) => {
  e.rest = (e.rest ?? 0) - dt
  if (e.rest > 0) {
    stand(g, e, dt)
    return
  }
  if (Math.random() < dt / L.restEvery) {
    e.rest = L.restFor * (0.5 + Math.random())
    if (Math.random() < 0.5) e.facing *= -1
  }
  walk(g, e, dt, speed)
}

const onLevel = (e, reach = 1) => (x, y) => {
  const feet = cell(e.y + e.h - 1)
  return y >= cell(e.y) - reach + 1 && y <= feet + reach
}

const beside = (e, spot, slack = 6) => Math.abs(spot.x - centre(e).x) < e.w / 2 + slack && Math.abs(spot.y - centre(e).y) < e.h / 2 + BLOCK

const seek = (g, e, dt, find) => {
  e.seek = (e.seek ?? Math.random() * L.seek) - dt
  if (e.seek <= 0 || (e.goal && !find.still(e.goal))) {
    e.seek = L.seek
    e.goal = e.bored > 0 ? null : find.near()
  }
  return e.goal
}

const lookFor = (g, e, reach, test, level = 1) => ({
  near: () => cellNear(g, e, reach, (x, y, m) => onLevel(e, level)(x, y) && test(x, y, m)),
  still: spot => test(spot.cx, spot.cy, matAt(g.world, spot.cx, spot.cy)),
})

const scavenge = (g, e, dt, speed) => {
  if (e.bored > 0) return false
  const body = remainsNear(g, e, L.scavenge)
  if (!body) return false
  if (touchingRemains(e, body)) {
    stand(g, e, dt)
    e.facing = body.x + body.w / 2 < centre(e).x ? -1 : 1
    eatRemains(g, e, body, dt)
  } else walkTo(g, e, dt, body.x + body.w / 2, speed)
  return true
}

const graze = (g, e, dt, speed, find, eat) => {
  const goal = seek(g, e, dt, find)
  if (!goal) return false
  if (!beside(e, goal)) {
    walkTo(g, e, dt, goal.x, speed)
    return true
  }
  stand(g, e, dt)
  e.facing = goal.x < centre(e).x ? -1 : 1
  e.eating = 0.3
  e.chew = (e.chew ?? L.chew) - dt
  if (e.chew > 0) return true
  e.chew = L.chew
  eat(goal)
  e.goal = null
  return true
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

const thrower = e => (e.ally ? undefined : e.kind)

const spitter = (g, e, dt) => {
  const S = E.spitter
  const calm = 1 - g.ring / 7
  if (shoved(g, e, dt)) return
  fall(e, dt)
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
    vy, age: 0, friendly: Boolean(e.ally), foe: thrower(e),
  })
  e.cooldown = S.every * (1 + calm * S.calmDelay)
}

const holdFire = (g, e, dt) => {
  e.cooldown = Math.max(TUNING.feel.windup + 0.1, e.cooldown - dt)
  e.windup = false
  e.aimAt = null
}

const territorial = (g, e, dt) => {
  const intruder = grudgeOf(e) ?? nearest(g, e, o => o.kind !== 'spitter' && !o.fireproof && !swims(o) && !o.riding && dist(centre(o), centre(e)) > L.spitFrom, L.territory)
  hunt(e, intruder)
  if (intruder) {
    spitter(g, e, dt)
    return
  }
  stand(g, e, dt)
  holdFire(g, e, dt)
}

const swimBy = (g, e, dt, goal, pace) => {
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
  e.wander += dt
  const dx = goal ? goal.x - me.x : Math.cos(e.wander) * 20
  const dy = goal ? goal.y - me.y : Math.sin(e.wander * 0.7) * 10
  const length = Math.max(1, Math.hypot(dx, dy))
  const step = { x: e.x + (dx / length) * pace * dt, y: e.y + (dy / length) * pace * dt, w: e.w, h: e.h }
  e.vx = (dx / length) * pace
  e.vy = (dy / length) * pace
  if (dx !== 0) e.facing = dx < 0 ? -1 : 1
  if (inWater(world, step) && !hitsSolid(world, step)) {
    e.x = step.x
    e.y = step.y
  }
}

const swim = (g, e, dt, speed, chaseSpeed) => {
  const chasing = inWater(g.world, g.player) || Boolean(e.ally) || Boolean(quarryOf(e))
  swimBy(g, e, dt, chasing ? foeOf(g, e) : null, chasing ? chaseSpeed : speed)
}

const fish = (g, e, dt) => swim(g, e, dt, E.fish.speed, E.fish.chase)

const school = (g, e, dt) => {
  hunt(e, null)
  const lure = g.enemies.find(o => o.kind === 'lantern' && o.lure && o.hp > 0 && dist(o.lure, centre(e)) < L.lure && clearBetween(g.world, o.lure, centre(e)))
  if (lure) {
    swimBy(g, e, dt, lure.lure, E.fish.speed)
    return
  }
  const mates = g.enemies.filter(o => o !== e && o.kind === 'fish' && dist(centre(o), centre(e)) < L.school)
  if (mates.length === 0) {
    swimBy(g, e, dt, null, E.fish.speed * 0.8)
    return
  }
  const middle = mates.reduce((sum, o) => ({ x: sum.x + centre(o).x / mates.length, y: sum.y + centre(o).y / mates.length }), { x: 0, y: 0 })
  e.wander += dt
  swimBy(g, e, dt, { x: middle.x + Math.cos(e.wander * 0.6) * 18, y: middle.y + Math.sin(e.wander * 0.9) * 6 }, E.fish.speed * 0.8)
}

const jelly = (g, e, dt, near) => {
  swim(g, e, dt, E.fish.speed * 0.6, E.fish.speed)
  e.cooldown -= dt
  e.windup = near && e.cooldown < TUNING.feel.windup
  if (e.windup) burst(g, centre(e).x, centre(e).y, 'charge', 1)
  if (e.cooldown > 0 || !near || !inWater(g.world, e)) return
  e.cooldown = E.jelly.every
  const c = centre(e)
  energize(g.world, cell(c.x), cell(c.y), E.jelly.energy)
}

const drifting = (g, e, dt) => {
  hunt(e, null)
  const c = centre(e)
  const company = [g.player, ...creatures(g)].filter(o => o !== e && dist(centre(o), c) < L.pulseReach && inWater(g.world, o))
  jelly(g, e, dt, company.length > 0)
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

const flyTo = (g, e, dt, spot, speed, weave = 6) => {
  hunt(e, spot)
  flyToward(g, e, dt, speed, weave)
}

const hover = (g, e, dt, speed) => {
  e.home ??= centre(e)
  e.wander += dt
  flyTo(g, e, dt, { x: e.home.x + Math.cos(e.wander * 0.5) * L.hover, y: e.home.y + Math.sin(e.wander * 0.8) * L.hover * 0.5 }, speed)
}

const bat = (g, e, dt) => {
  Object.assign(e, { awake: true, upside: false, roosting: false })
  e.frame = Math.floor(e.wander * 8) % 2
  flyToward(g, e, dt, E.bat.speed, 30)
}

const INSECTS = new Set(['gnat', 'tick', 'spore'])

const roost = (g, e, dt) => {
  e.awake = false
  if (noiseNear(g, e, L.wakeHeard) || lightsOf(g).some(l => l.hot && dist(l, centre(e)) < L.wakeHeat)) {
    Object.assign(e, { roosting: false, upside: false, restless: 0 })
    return
  }
  if (e.upside) {
    e.vx = 0
    e.vy = 0
    return
  }
  e.vx = 0
  e.vy = -E.bat.speed * 0.6
  move(g.world, e, dt)
  if (e.vy === 0) e.upside = true
}

const batLife = (g, e, dt) => {
  e.roosting ??= Math.random() < L.roost
  if (e.roosting) {
    roost(g, e, dt)
    return
  }
  e.awake = true
  e.upside = false
  e.frame = Math.floor(e.wander * 8) % 2
  const prey = nearest(g, e, o => INSECTS.has(o.kind) && !o.riding, L.prey)
  if (prey) {
    e.restless = 0
    hunt(e, prey)
    flyToward(g, e, dt, E.bat.speed * 0.85, 12)
    if (overlap(e, prey) && bite(g, e, prey, 1)) tallyLife(g, 'prey')
    return
  }
  e.restless = (e.restless ?? 0) + dt
  if (e.restless > L.restless) Object.assign(e, { roosting: true, restless: 0 })
  hover(g, e, dt, E.bat.speed * 0.4)
}

const spore = (g, e, dt) => {
  e.seeded = false
  flyToward(g, e, dt, E.spore.speed, 8)
}

const FUEL = new Set([M.MOSS, M.PEAT, M.WOOD])
const SPREADS_ON = new Set([M.ROCK, M.ASH])

const sprout = (g, e, dt) => {
  e.vx = 0
  e.vy = 0
  e.grow = (e.grow ?? L.sporeGrow) - dt
  if (e.grow <= 0) {
    e.grow = L.sporeGrow
    const c = centre(e)
    const spot = cellsUnder(e, BLOCK * 2)
      .filter(([x, y]) => SPREADS_ON.has(matAt(g.world, x, y)) && exposed(g, x, y))
      .sort((a, b) => Math.hypot((a[0] + 0.5) * BLOCK - c.x, (a[1] + 0.5) * BLOCK - c.y) - Math.hypot((b[0] + 0.5) * BLOCK - c.x, (b[1] + 0.5) * BLOCK - c.y))[0]
    if (spot) {
      setCell(g.world, spot[0], spot[1], M.MOSS)
      chipsAt(g, (spot[0] + 0.5) * BLOCK, (spot[1] + 0.5) * BLOCK, M.MOSS, 3)
      tallyLife(g, 'sprout', M.MOSS)
    }
  }
  e.gas = (e.gas ?? L.sporeGas) - dt
  if (e.gas <= 0) {
    e.gas = L.sporeGas
    puff(g.world, cell(centre(e).x), cell(e.y) - 1, M.METHANE, [6, 10])
  }
}

const sporeLife = (g, e, dt) => {
  if (e.seeded) {
    sprout(g, e, dt)
    return
  }
  const goal = seek(g, e, dt, lookFor(g, e, L.reach, (x, y, m) => FUEL.has(m) && exposed(g, x, y), ROOM))
  if (!goal) {
    hover(g, e, dt, E.spore.speed)
    return
  }
  if (Math.hypot(goal.x - centre(e).x, goal.y - centre(e).y) < BLOCK + e.w / 2) {
    e.seeded = true
    e.goal = null
    burst(g, centre(e).x, centre(e).y, 'gas', 4)
    return
  }
  flyTo(g, e, dt, goal, E.spore.speed, 4)
}

const oilTrail = (g, e, dt, matter, every) => {
  e.cooldown -= dt
  if (e.cooldown > 0 || e.stun > 0) return
  e.cooldown = every
  const c = centre(e)
  puff(g.world, cell(c.x), cell(e.y + e.h - 1), matter, [1, 1])
}

const slug = (g, e, dt) => {
  walk(g, e, dt, E.slug.speed)
  oilTrail(g, e, dt, M.OIL, E.slug.every)
}

const GRAZED = new Set([M.MOSS, M.VINE])

const eatCell = what => g => spot => {
  const m = matAt(g.world, spot.cx, spot.cy)
  setCell(g.world, spot.cx, spot.cy, M.EMPTY)
  chipsAt(g, spot.x, spot.y, m, 4)
  tallyLife(g, what, m)
}

const slugLife = (g, e, dt) => {
  if (!graze(g, e, dt, E.slug.speed, lookFor(g, e, L.reach, (x, y, m) => GRAZED.has(m) && exposed(g, x, y)), eatCell('graze')(g))) wander(g, e, dt, E.slug.speed)
  oilTrail(g, e, dt, M.OIL, E.slug.every)
}

const DIGS = new Set([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.SAND, M.ICE, M.VOLATILE, M.SCRAP, M.SNOW])

const dig = (g, e, dt, them) => {
  const me = centre(e)
  const d = Math.max(1, Math.hypot(them.x - me.x, them.y - me.y))
  e.facing = them.x < me.x ? -1 : 1
  e.vx = ((them.x - me.x) / d) * E.worm.speed
  e.vy = ((them.y - me.y) / d) * E.worm.speed
  e.x = Math.max(BLOCK, Math.min(WORLD_PX - BLOCK - e.w, e.x + e.vx * dt))
  e.y = Math.max(BLOCK, Math.min(WORLD_PX - BLOCK - e.h, e.y + e.vy * dt))
  for (const [x, y] of cellsUnder(e)) {
    const m = matAt(g.world, x, y)
    if (m === M.VOLATILE) ignite(g.world, x, y)
    else if (DIGS.has(m)) {
      setCell(g.world, x, y, M.EMPTY)
      chipsAt(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, m, 2)
      if (e.mind !== 'hero') tallyLife(g, 'dig', m)
    }
  }
}

const worm = (g, e, dt) => {
  e.vx = 0
  e.vy = 0
  if (e.stun > 0) return
  const me = centre(e)
  if (e.mind === 'hero') {
    hunt(e, null)
    dig(g, e, dt, centre(g.player))
    return
  }
  const stepping = grudgeOf(e) ?? nearest(g, e, o => o.grounded && Math.abs(o.vx) > 4 && !o.riding, L.wormFeels)
  const sound = stepping ? centre(stepping) : noiseNear(g, e, L.wormHears)
  if (!sound || Math.hypot(sound.x - me.x, sound.y - me.y) < 3) return
  hunt(e, stepping)
  dig(g, e, dt, sound)
  for (const o of creatures(g)) {
    if (o !== e && overlap(e, o) && bite(g, e, o, 2)) tallyLife(g, 'prey')
  }
}

export const lineClear = clearBetween

const lined = (g, e, them) => {
  const me = centre(e)
  return Math.hypot(them.x - me.x, them.y - me.y) <= E.turret.range && (them.x - me.x) * e.facing > 0 && lineClear(g.world, me, them)
}

const turret = (g, e, dt) => {
  const T = E.turret
  if (e.stun > 0) return
  const me = centre(e)
  const them = foeOf(g, e)
  e.cooldown -= dt
  const d = Math.hypot(them.x - me.x, them.y - me.y)
  const sighted = lined(g, e, them)
  e.aimAt = sighted && e.cooldown < TUNING.feel.windup * 1.4 ? them : null
  if (e.cooldown > 0 || !sighted) return
  e.cooldown = T.every
  g.fireballs.push({
    x: me.x, y: me.y, w: 3, h: 3, vx: ((them.x - me.x) / d) * T.speed, vy: ((them.y - me.y) / d) * T.speed,
    age: 0, straight: true, pellet: true, friendly: Boolean(e.ally), foe: thrower(e),
  })
}

const sentry = (g, e, dt) => {
  if (e.mind === 'hero' && lined(g, e, centre(g.player))) {
    hunt(e, null)
    turret(g, e, dt)
    return
  }
  const target = nearest(g, e, o => o.kind !== 'turret' && lined(g, e, centre(o)) && !o.riding, E.turret.range)
  hunt(e, target)
  if (target) turret(g, e, dt)
  else holdFire(g, e, dt)
}

const fuseCatches = (g, e) => cellsUnder(e, 1).some(([x, y]) => burningAt(g.world, x, y) || chargedAt(g.world, x, y)) || e.hp < (e.hpSeen ?? e.hp)

const fuse = (g, e, dt) => {
  if (!e.lit && fuseCatches(g, e)) e.lit = E.bomber.fuse
  e.hpSeen = e.hp
  if (!e.lit) return false
  e.lit -= dt
  burst(g, centre(e).x, e.y, 'fire', 1)
  if (e.lit <= 0) e.hp = 0
  return true
}

const bomber = (g, e, dt) => {
  const B = E.bomber
  walk(g, e, dt, B.speed)
  const me = centre(e)
  const them = foeOf(g, e)
  if (e.stun <= 0 && !e.lit) e.facing = them.x < me.x ? -1 : 1
  if (!e.lit && Math.hypot(them.x - me.x, them.y - me.y) < B.trigger) e.lit = B.fuse
  fuse(g, e, dt)
}

const curious = (g, e, dt) => {
  const B = E.bomber
  if (fuse(g, e, dt)) {
    walk(g, e, dt, B.speed * 1.4)
    return
  }
  const c = centre(e)
  const sound = e.bored > 0 ? null : noiseNear(g, e, L.curious) ?? lightsOf(g).filter(l => !l.wet && Math.abs(l.y - c.y) < 3 * BLOCK && dist(l, c) < L.curious).sort((a, b) => dist(a, c) - dist(b, c))[0]
  if (sound) walkTo(g, e, dt, sound.x, B.speed * 0.8)
  else wander(g, e, dt, B.speed * L.calmPace)
}

const hopTo = (g, e, dt, them, speed) => {
  const I = E.imp
  if (shoved(g, e, dt)) return
  fall(e, dt)
  if (e.stun <= 0) {
    const me = centre(e)
    if (Math.abs(them.x - me.x) > 3) e.facing = them.x < me.x ? -1 : 1
    e.vx = Math.abs(them.x - me.x) > 3 ? e.facing * speed : 0
    e.cooldown -= dt
    if (e.cooldown <= 0 && e.grounded && e.vx !== 0) {
      e.vy = -I.hop
      e.cooldown = I.every
    }
  } else e.vx = 0
  holdEdge(g, e)
  move(g.world, e, dt)
}

const chill = (g, e, reach = 0) => {
  let snuffed = false
  for (const [x, y] of cellsUnder({ x: e.x - reach, y: e.y - reach, w: e.w + reach * 2, h: e.h + 2 + reach })) {
    const m = matAt(g.world, x, y)
    if (m === M.WATER && y >= cell(e.y + e.h)) setCell(g.world, x, y, M.ICE)
    if (g.world.burn[y * ROOM + x] > 0) {
      g.world.burn[y * ROOM + x] = 0
      snuffed = true
    }
  }
  if (snuffed) {
    burst(g, centre(e).x, e.y, 'pale', 3)
    tallyLife(g, 'snuff')
  }
}

const imp = (g, e, dt) => {
  hopTo(g, e, dt, foeOf(g, e), E.imp.speed)
  chill(g, e)
}

const pool = g => (x, y, m) => m === M.WATER && matAt(g.world, x, y - 1) === M.EMPTY

const impLife = (g, e, dt) => {
  const goal = seek(g, e, dt, {
    near: () => {
      const blaze = cellNear(g, e, L.firewatch, (x, y) => burningAt(g.world, x, y))
      return blaze ? { ...blaze, fire: true } : cellNear(g, e, L.reach, (x, y, m) => onLevel(e, 2)(x, y) && pool(g)(x, y, m))
    },
    still: spot => (spot.fire ? burningAt(g.world, spot.cx, spot.cy) : pool(g)(spot.cx, spot.cy, matAt(g.world, spot.cx, spot.cy))),
  })
  if (goal) hopTo(g, e, dt, goal, E.imp.speed * (goal.fire ? 1.2 : L.calmPace))
  else wander(g, e, dt, E.imp.speed * L.calmPace * 0.5)
  chill(g, e, goal?.fire ? BLOCK : 0)
}

const emberbat = (g, e, dt) => {
  e.awake = true
  flyToward(g, e, dt, E.emberbat.speed, 26)
  const c = centre(e)
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = 0.25
  ignite(g.world, cell(c.x), cell(c.y))
  ignite(g.world, cell(c.x), cell(e.y + e.h + 2))
  burst(g, c.x, c.y, 'fire', 1)
}

const singe = (g, e) => {
  for (const o of g.enemies) {
    if (o !== e && o.kind === 'gnat' && overlap(e, o) && bite(g, e, o, 1, 'FIRE')) tallyLife(g, 'prey')
  }
}

const emberLife = (g, e, dt) => {
  e.awake = false
  singe(g, e)
  const c = centre(e)
  const warm = lightsOf(g).filter(l => l.warm && dist(l, c) > 2 && dist(l, c) < L.warmth)
    .sort((a, b) => dist(a, c) - dist(b, c))[0]
  if (warm) {
    e.cold = 0
    e.goal = null
    if (dist(warm, c) > L.perch) flyTo(g, e, dt, { x: warm.x, y: warm.y - L.perch * 0.6 }, E.emberbat.speed * 0.6, 6)
    else {
      e.wander += dt
      e.vx = Math.cos(e.wander * 2) * 6
      e.vy = Math.sin(e.wander * 3) * 4
      move(g.world, e, dt)
    }
    return
  }
  e.cold = (e.cold ?? 0) + dt
  if (e.cold < L.kindle) {
    hover(g, e, dt, E.emberbat.speed * 0.4)
    return
  }
  const fuel = seek(g, e, dt, lookFor(g, e, L.warmth, (x, y, m) => props(m).flammability > 0 && !props(m).gas && exposed(g, x, y), ROOM))
  if (!fuel) {
    hover(g, e, dt, E.emberbat.speed * 0.4)
    return
  }
  if (dist(fuel, c) > BLOCK + e.w / 2) {
    flyTo(g, e, dt, fuel, E.emberbat.speed * 0.7, 4)
    return
  }
  ignite(g.world, fuel.cx, fuel.cy)
  burst(g, fuel.x, fuel.y, 'fire', 6)
  tallyLife(g, 'kindle', matAt(g.world, fuel.cx, fuel.cy))
  e.cold = 0
  e.goal = null
}

const slime = (g, e, dt) => {
  walk(g, e, dt, E.slime.speed)
  oilTrail(g, e, dt, M.ACID, E.slime.every)
}

const CORRODES = new Set([M.GATE, M.SCRAP])

const corrode = g => spot => {
  const open = [[0, -1], [-1, 0], [1, 0]].map(([dx, dy]) => [spot.cx + dx, spot.cy + dy]).find(([x, y]) => matAt(g.world, x, y) === M.EMPTY)
  if (!open) return
  puff(g.world, open[0], open[1], M.ACID, [1, 1])
  tallyLife(g, 'corrode', matAt(g.world, spot.cx, spot.cy))
}

const slimeLife = (g, e, dt) => {
  if (!graze(g, e, dt, E.slime.speed, lookFor(g, e, L.reach, (x, y, m) => CORRODES.has(m) && exposed(g, x, y), 2), corrode(g))) {
    wander(g, e, dt, E.slime.speed)
    oilTrail(g, e, dt, M.ACID, E.slime.every)
  }
}

const crab = (g, e, dt) => {
  walk(g, e, dt, E.crab.speed)
  const them = foeOf(g, e)
  if (e.stun <= 0 && e.shoved <= 0) e.facing = them.x < centre(e).x ? -1 : 1
}

const WALKERS = new Set(['crawler', 'slug', 'pillbug', 'slime', 'bomber', 'imp', 'scrapper', 'stilt', 'coil', 'crab', 'tick', 'urchin'])

const pinch = (g, e, dt) => {
  e.nip = (e.nip ?? 0) - dt
  if (e.nip > 0) return
  const claws = { x: e.facing > 0 ? e.x + e.w / 2 : e.x - 4, y: e.y, w: e.w / 2 + 4, h: e.h }
  const victim = creatures(g).find(o => o !== e && o.kind !== 'crab' && WALKERS.has(o.kind) && overlap(claws, o))
  if (!victim) return
  e.nip = L.biteEvery
  if (bite(g, e, victim, 1)) tallyLife(g, 'quarrel')
}

const crabLife = (g, e, dt) => {
  pinch(g, e, dt)
  if (!scavenge(g, e, dt, E.crab.speed)) wander(g, e, dt, E.crab.speed * L.calmPace)
}

const nest = (g, e, dt) => {
  const N = E.nest
  fall(e, dt)
  move(g.world, e, dt)
  if (e.mind === 'hero' || e.hp < (e.hpSeen ?? e.hp) || noiseNear(g, e, N.reach)) e.disturbed = L.disturbed
  e.hpSeen = e.hp
  e.disturbed = Math.max(0, (e.disturbed ?? 0) - dt)
  if (e.stun > 0 || e.disturbed <= 0) return
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = N.every
  if (g.enemies.filter(o => o.spawned).length >= N.limit) return
  const kind = Math.random() < 0.5 ? 'bat' : 'crawler'
  const baby = createEnemy({ kind, x: e.x, row: 0 })
  baby.y = e.y - baby.h - 2
  Object.assign(baby, { spawned: true, awake: true, roosting: false, noticed: e.mind === 'hero' ? L.attention : 0 })
  g.spawns.push(baby)
  burst(g, e.x + e.w / 2, e.y, 'gas', 6)
}

const mimic = (g, e, dt) => {
  const M_ = E.mimic
  fall(e, dt)
  if (e.mind !== 'hero') {
    e.awake = false
    e.vx = 0
    move(g.world, e, dt)
    e.nip = (e.nip ?? 0) - dt
    const victim = e.nip <= 0 && creatures(g).find(o => o !== e && !o.heavy && overlap(e, o))
    if (victim && bite(g, e, victim, 2)) {
      e.nip = L.biteEvery
      tallyLife(g, 'prey')
    }
    return
  }
  e.awake = true
  if (e.stun > 0) {
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
  holdEdge(g, e)
  move(g.world, e, dt)
}

const gasbag = (g, e, dt) => {
  flyToward(g, e, dt, E.gasbag.speed, 6)
  leak(g, e, dt, E.gasbag.every)
}

const leak = (g, e, dt, every) => {
  e.cooldown -= dt
  if (e.cooldown > 0) return
  e.cooldown = every
  const c = centre(e)
  puff(g.world, cell(c.x), cell(c.y + 8), M.METHANE, [4, 7])
}

const rise = (g, e, dt) => {
  e.home ??= centre(e)
  e.wander += dt
  flyTo(g, e, dt, { x: e.home.x + Math.sin(e.wander * 0.3) * L.hover * 1.5, y: BLOCK * 2 }, E.gasbag.speed * 0.7, 3)
  leak(g, e, dt, L.gasbagLeak)
}

const hop = (from, target, flight, gravity) => ({
  vx: (target.x - from.x) / flight,
  vy: (target.y - from.y) / flight - 0.5 * gravity * flight,
})

const tick = (g, e, dt) => {
  const T = E.tick
  dismount(e)
  if (shoved(g, e, dt)) return
  if (e.clung > 0) {
    e.clung -= dt
    e.vx = 0
    e.vy = 0
  } else fall(e, dt)
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

const HOSTS = new Set(['crawler', 'slug', 'pillbug', 'crab', 'stilt', 'scrapper', 'bomber', 'imp', 'slime', 'coil', 'bat'])

const dismount = e => {
  if (!e.riding) return
  e.riding = false
  ride(e, null)
}

const riding = (g, e, dt) => {
  const host = hostOf(e)
  if (!host || !e.riding) {
    dismount(e)
    return false
  }
  Object.assign(e, { x: host.x + host.w / 2 - e.w / 2 + (e.seat ?? 0), y: host.y - e.h + 2, vx: host.vx, vy: 0, grounded: false, clung: 0, windup: false, facing: host.facing })
  e.suck = (e.suck ?? L.hostBite) - dt
  if (e.suck <= 0) {
    e.suck = L.hostBite
    bite(g, e, host, 1)
    host.grudge = 0
    tallyLife(g, 'feed')
  }
  return true
}

const parasite = (g, e, dt) => {
  if (riding(g, e, dt)) return
  const host = grudgeOf(e) ?? nearest(g, e, o => HOSTS.has(o.kind) && !(o.alight > 0) && !g.enemies.some(t => t.riding && hostOf(t) === o), L.hostReach)
  hunt(e, host)
  if (!host) {
    stand(g, e, dt)
    return
  }
  tick(g, e, dt)
  if (!e.grounded && overlap(e, host)) {
    ride(e, host)
    Object.assign(e, { riding: true, seat: (Math.random() - 0.5) * host.w * 0.5, suck: L.hostBite })
    tallyLife(g, 'ride')
  }
}

const curl = (e, away) => {
  const B = E.pillbug
  Object.assign(e, { ball: B.ball, plated: true, curlReady: B.again, vx: away * B.roll, vy: -120, frame: 1 })
}

const roll = (g, e, dt) => {
  const [vx, vy] = [e.vx, e.vy + E.gravity * dt]
  e.ball -= dt
  e.vy = Math.min(P.maxFall, vy)
  move(g.world, e, dt)
  if (e.hitWall) e.vx = -vx * 0.9
  if (e.grounded) e.vy = -Math.abs(vy) * 0.65
  for (const o of g.enemies) {
    if (o !== e && !o.friendly && !o.ally && !o.prop && overlap(e, o) && bite(g, e, o, 2)) tallyLife(g, 'bowl')
  }
  if (e.ball <= 0) Object.assign(e, { plated: false, frame: 0, vx: 0 })
}

const flinch = (g, e, from) => {
  if (e.hp < (e.hpSeen ?? e.hp) && !(e.ball > 0) && e.curlReady <= 0) curl(e, from.x < e.x ? 1 : -1)
  e.hpSeen = e.hp
}

const pillbug = (g, e, dt) => {
  e.curlReady = Math.max(0, (e.curlReady ?? 0) - dt)
  flinch(g, e, g.player)
  if (e.ball > 0) roll(g, e, dt)
  else walk(g, e, dt, E.pillbug.speed)
}

const pillbugLife = (g, e, dt) => {
  e.curlReady = Math.max(0, (e.curlReady ?? 0) - dt)
  flinch(g, e, preyOf(e) ?? g.player)
  if (e.ball > 0) {
    roll(g, e, dt)
    return
  }
  if (scavenge(g, e, dt, E.pillbug.speed)) return
  if (!graze(g, e, dt, E.pillbug.speed, lookFor(g, e, L.reach, (x, y, m) => m === M.ASH), eatCell('ash')(g))) wander(g, e, dt, E.pillbug.speed * L.calmPace)
}

const swarm = (g, e, dt, goal, orbit, swoop) => {
  const N = E.gnat
  const me = centre(e)
  const flock = g.enemies.filter(o => o.kind === 'gnat' && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 30)
  const middle = flock.reduce((sum, o) => ({ x: sum.x + o.x, y: sum.y + o.y }), { x: e.x, y: e.y })
  const size = flock.length + 1
  const apart = flock.reduce((sum, o) => {
    const d = Math.max(1, Math.hypot(o.x - e.x, o.y - e.y))
    return d < 7 ? { x: sum.x + (e.x - o.x) / d, y: sum.y + (e.y - o.y) / d } : sum
  }, { x: 0, y: 0 })
  const ring = swoop ? 0 : orbit
  const spot = { x: goal.x + Math.cos(e.wander * 1.3) * ring, y: goal.y + Math.sin(e.wander * 1.7) * ring * 0.6 }
  const wish = {
    x: (spot.x - me.x) * 0.6 + (middle.x / size - e.x) * 0.5 + apart.x * 26,
    y: (spot.y - me.y) * 0.6 + (middle.y / size - e.y) * 0.5 + apart.y * 26,
  }
  const length = Math.max(1, Math.hypot(wish.x, wish.y))
  e.vx += ((wish.x / length) * N.speed - e.vx) * Math.min(1, dt * 5)
  e.vy += ((wish.y / length) * N.speed - e.vy) * Math.min(1, dt * 5)
  e.facing = e.vx < 0 ? -1 : 1
  move(g.world, e, dt)
}

const gnat = (g, e, dt) => {
  const N = E.gnat
  if (e.stun > 0) return
  e.wander += dt
  const them = foeOf(g, e)
  swarm(g, e, dt, { x: them.x, y: them.y - 8 }, N.orbit, e.wander % N.swoop < N.swoopFor)
}

const moth = (g, e, dt) => {
  if (e.stun > 0) return
  e.wander += dt
  e.home ??= centre(e)
  e.orbit ??= L.mothOrbit[0] + Math.random() * (L.mothOrbit[1] - L.mothOrbit[0])
  const c = centre(e)
  const light = lightsOf(g).filter(l => !l.wet && dist(l, c) < L.moth).sort((a, b) => dist(a, c) - dist(b, c))[0]
  swarm(g, e, dt, light ?? { x: e.home.x, y: e.home.y + Math.sin(e.wander * 0.4) * 10 }, light ? e.orbit : E.gnat.orbit * 0.6, false)
}

const stilt = (g, e, dt) => {
  const S = E.stilt
  walk(g, e, dt, S.speed)
  if (e.stun > 0) return
  const top = { x: centre(e).x, y: e.y + 2 }
  const them = foeOf(g, e)
  e.cooldown -= dt
  e.windup = e.cooldown < TUNING.feel.windup
  if (e.cooldown > 0 || Math.hypot(them.x - top.x, them.y - top.y) > S.range) return
  e.cooldown = S.every
  const flight = S.flights.find(f => arcIsClear(g.world, top, launch(top, them, f), f))
  if (flight === undefined) return
  g.fireballs.push({ x: top.x - 2, y: top.y - 2, w: 4, h: 4, ...launch(top, them, flight), age: 0, pellet: true, friendly: Boolean(e.ally), foe: thrower(e) })
}

const SMALL = new Set(['crawler', 'tick', 'slug', 'pillbug', 'slime', 'bomber', 'gnat'])

const wade = (g, e, dt) => {
  const prey = grudgeOf(e) ?? nearest(g, e, o => SMALL.has(o.kind) && !o.riding, E.stilt.range)
  hunt(e, prey)
  if (prey) {
    stilt(g, e, dt)
    return
  }
  wander(g, e, dt, E.stilt.speed)
  holdFire(g, e, dt)
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
  const me = centre(e)
  const under = them => Math.abs(them.x - me.x) < 16 && them.y > me.y && them.y - me.y < S.reach
  e.stage ??= 'rest'
  if (e.stage === 'rest') {
    const hero = centre(g.player)
    hunt(e, under(hero) && !e.ally ? null : nearest(g, e, o => o.kind !== 'snapweed' && under(centre(o)) && !swims(o), S.reach * 1.5))
  }
  const them = foeOf(g, e)
  if (e.stun > 0) {
    e.stage = 'back'
    e.windup = false
  }
  if (e.stage === 'rest') {
    e.windup = false
    if (e.cooldown <= 0 && under(them)) Object.assign(e, { stage: 'tell', clock: S.tell, windup: true })
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
  if (e.stage !== 'lunge' && e.stage !== 'hold') return
  for (const o of creatures(g)) {
    if (o !== e && o.kind !== 'snapweed' && overlap(e, o) && bite(g, e, o, 2)) tallyLife(g, 'prey')
  }
}

const throwScrap = (g, e, them, spread = 0) => {
  const from = { x: centre(e).x, y: e.y - 6 }
  const flight = 0.8
  const G = TUNING.flung.gravity
  g.flung.push({ x: from.x - 4, y: from.y - 4, w: 8, h: 8, ...hop(from, { x: them.x + spread, y: them.y }, flight, G), age: 0, thrower: e })
}

const heapBeside = (g, e) => cellsUnder({ x: e.x - 8, y: e.y, w: e.w + 16, h: e.h }).find(([x, y]) => matAt(g.world, x, y) === M.SCRAP)

const scrapper = (g, e, dt) => {
  const S = E.scrapper
  walk(g, e, dt, S.speed)
  if (e.stun > 0) return
  const them = foeOf(g, e)
  const me = centre(e)
  e.loaded ??= true
  e.frame = e.loaded ? 0 : 1
  e.cooldown -= dt
  if (!e.loaded) {
    const heap = heapBeside(g, e)
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

const stash = (g, e) => {
  const floor = cell(e.y + e.h + 1)
  const x = cell(e.home.x)
  for (const dx of [1, -1, 2, -2, 0, 3, -3]) {
    for (let y = floor - 1; y > floor - 4; y--) {
      if (matAt(g.world, x + dx, y) !== M.EMPTY || !props(matAt(g.world, x + dx, y + 1)).solid) continue
      setCell(g.world, x + dx, y, M.SCRAP)
      chipsAt(g, (x + dx + 0.5) * BLOCK, (y + 0.5) * BLOCK, M.SCRAP, 3)
      tallyLife(g, 'hoard', M.SCRAP)
      return true
    }
  }
  return false
}

const hoard = (g, e, dt) => {
  const S = E.scrapper
  e.home ??= { x: centre(e).x, y: e.y + e.h }
  e.loaded ??= true
  e.frame = e.loaded ? 0 : 1
  const intruder = e.loaded ? grudgeOf(e) ?? nearest(g, e, o => o.kind !== 'scrapper' && !o.riding && dist(centre(o), e.home) < L.hoard, S.range) : null
  hunt(e, intruder)
  if (intruder) {
    scrapper(g, e, dt)
    return
  }
  holdFire(g, e, dt)
  if (e.loaded) {
    if (e.bored > 0) e.home = { x: centre(e).x, y: e.y + e.h }
    if (!walkTo(g, e, dt, e.home.x, S.speed)) return
    if (stash(g, e)) e.loaded = false
    else e.home = { x: e.home.x + e.facing * BLOCK * 3, y: e.home.y }
    return
  }
  const far = (x, y) => Math.hypot((x + 0.5) * BLOCK - e.home.x, (y + 0.5) * BLOCK - e.home.y) > 3 * BLOCK
  const pile = seek(g, e, dt, lookFor(g, e, L.reach, (x, y, m) => m === M.SCRAP && far(x, y) && exposed(g, x, y)))
  if (!pile) {
    wander(g, e, dt, S.speed * L.calmPace)
    return
  }
  if (!beside(e, pile, 8)) {
    walkTo(g, e, dt, pile.x, S.speed)
    return
  }
  stand(g, e, dt)
  setCell(g.world, pile.cx, pile.cy, M.EMPTY)
  chipsAt(g, pile.x, pile.y, M.SCRAP, 3)
  e.loaded = true
  e.goal = null
}

const dripper = (g, e, dt) => {
  const D = E.dripper
  e.drips ??= g.ring >= 2 && Math.random() < 0.4 ? M.ACID : M.OIL
  e.dropsLeft ??= D.drops
  if (!solidAt(g.world, centre(e).x, e.y - 2)) {
    e.hp = 0
    return
  }
  const c = centre(e)
  const below = [g.player, ...creatures(g)].some(o => o !== e && Math.abs(centre(o).x - c.x) < L.dripBelow && o.y > e.y && lineClear(g.world, c, centre(o)))
  e.cooldown -= dt
  e.windup = below && e.dropsLeft > 0 && e.cooldown < 0.3
  if (e.dropsLeft <= 0 || e.stun > 0) return
  if (below ? e.cooldown > 0 : e.cooldown > -L.dripIdle) return
  e.cooldown = D.every
  e.dropsLeft -= 1
  puff(g.world, cell(c.x), cell(e.y + e.h + 1), e.drips, [1, 1])
}

const shy = (g, e) => {
  const c = centre(e)
  return lightsOf(g).filter(l => dist(l, c) < L.shadeLight).sort((a, b) => dist(a, c) - dist(b, c))[0]
}

const inLight = (g, spot) => lightsOf(g).some(l => dist(l, spot) < L.shadeLight * 0.8)

const shade = (g, e, dt) => {
  const me = centre(e)
  e.intangible = solidAt(g.world, me.x, me.y)
  if (e.stun > 0) return
  e.wander += dt
  e.home ??= me
  const glare = shy(g, e)
  const them = glare ? { x: me.x * 2 - glare.x, y: me.y * 2 - glare.y } : e.mind === 'hero' ? foeOf(g, e) : { x: e.home.x + Math.cos(e.wander * 0.3) * 40, y: e.home.y + Math.sin(e.wander * 0.2) * 24 }
  const pace = E.shade.speed * (glare ? 1.6 : e.mind === 'hero' ? 1 : 0.5)
  const d = Math.max(1, Math.hypot(them.x - me.x, them.y - me.y))
  e.facing = them.x < me.x ? -1 : 1
  const next = { x: me.x + ((them.x - me.x) / d) * pace * dt, y: me.y + (((them.y - me.y) / d) * pace + Math.sin(e.wander * 2) * 8) * dt }
  if (!glare && e.mind === 'hero' && inLight(g, next)) return
  e.vx = (next.x - me.x) / dt
  e.vy = (next.y - me.y) / dt
  e.x += next.x - me.x
  e.y += next.y - me.y
}

const SPINY_FOOD = new Set([M.SNOW, M.MOSS])

const urchin = (g, e, dt) => {
  e.nip = (e.nip ?? 0) - dt
  if (e.nip <= 0) {
    const touched = creatures(g).filter(o => o !== e && o.kind !== 'urchin' && overlap(e, o))
    for (const o of touched) bite(g, e, o, 1)
    if (touched.length) {
      e.nip = L.spineEvery
      tallyLife(g, 'spines')
    }
  }
  if (!graze(g, e, dt, E.urchin.speed, lookFor(g, e, L.reach, (x, y, m) => SPINY_FOOD.has(m) && exposed(g, x, y)), eatCell('graze')(g))) walk(g, e, dt, E.urchin.speed)
}

const coil = (g, e, dt) => {
  const C = E.coil
  if (shoved(g, e, dt)) return
  const airborne = !e.grounded
  fall(e, dt)
  move(g.world, e, dt)
  if (e.grounded && airborne && e.flying) {
    e.flying = false
    e.vx = 0
    const c = centre(e)
    energize(g.world, cell(c.x), cell(e.y + e.h + 2), C.energy)
    burst(g, c.x, e.y + e.h, 'charge', 5)
    if (e.mind !== 'hero') tallyLife(g, 'charge')
  }
  if (e.grounded) e.vx = 0
  e.cooldown -= dt
  e.windup = e.grounded && e.cooldown < TUNING.feel.windup
  if (!e.grounded || e.cooldown > 0 || e.stun > 0) return
  const them = foeOf(g, e)
  e.facing = them.x < centre(e).x ? -1 : 1
  Object.assign(e, { vx: e.facing * C.speed, vy: -C.hop, cooldown: C.every, flying: true })
}

const CONDUCTS = new Set([M.METAL, M.SCRAP, M.WATER, M.GATE])

const spark = (g, e, dt) => {
  const me = centre(e)
  e.wander += dt
  const metal = seek(g, e, dt, {
    near: () => cellNear(g, e, L.coilReach, (x, y, m) => CONDUCTS.has(m) && matAt(g.world, x, y - 1) === M.EMPTY && Math.abs((x + 0.5) * BLOCK - me.x) > BLOCK * 2),
    still: spot => CONDUCTS.has(matAt(g.world, spot.cx, spot.cy)) && Math.abs(spot.x - centre(e).x) > BLOCK,
  })
  hunt(e, metal ?? { x: me.x + Math.sign(Math.sin(e.wander * 0.4) || 1) * 40, y: me.y })
  coil(g, e, dt)
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
      g.fireballs.push({ x: me.x, y: me.y, w: 3, h: 3, vx: Math.cos(a) * F.spineSpeed, vy: Math.sin(a) * F.spineSpeed, age: 0, straight: true, pellet: true, friendly: Boolean(e.ally), foe: thrower(e) })
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

const bristle = (g, e, dt) => {
  if (!(e.swell > 0)) hunt(e, nearest(g, e, o => o.kind !== 'puffer' && swims(o), E.puffer.near))
  if (!preyOf(e) && !(e.swell > 0)) {
    swimBy(g, e, dt, null, E.fish.speed * 0.5)
    e.cooldown -= dt
    return
  }
  puffer(g, e, dt)
}

const lantern = (g, e, dt) => {
  const L_ = E.lantern
  const me = centre(e)
  e.lure = { x: me.x + e.facing * 10, y: me.y - 12 + Math.sin(g.time * 2) * 2 }
  const them = foeOf(g, e)
  e.cooldown -= dt
  if (e.lunging > 0 && inWater(g.world, e) && e.stun <= 0) {
    e.lunging -= dt
    const d = Math.max(1, Math.hypot(them.x - me.x, them.y - me.y))
    const next = { x: e.x + ((them.x - me.x) / d) * L_.lunge * dt, y: e.y + ((them.y - me.y) / d) * L_.lunge * dt, w: e.w, h: e.h }
    if (!hitsSolid(g.world, next)) Object.assign(e, { x: next.x, y: next.y })
    e.windup = false
    const prey = preyOf(e)
    if (prey && overlap(e, prey) && bite(g, e, prey, 2)) tallyLife(g, 'prey')
    return
  }
  swim(g, e, dt, E.fish.speed * 0.5, E.fish.speed * 0.5)
  const near = Math.hypot(them.x - e.lure.x, them.y - e.lure.y) < L_.near
  e.windup = near && e.cooldown < 0.4
  if (near && e.cooldown <= 0 && e.stun <= 0) {
    e.lunging = L_.lungeFor
    e.cooldown = L_.every
  }
}

const angle = (g, e, dt) => {
  if (!(e.lunging > 0)) {
    const lure = e.lure ?? centre(e)
    hunt(e, nearest(g, e, o => swims(o) && o.kind !== 'lantern' && dist(centre(o), lure) < E.lantern.near * 1.3, L.lure))
  }
  if (preyOf(e)) {
    lantern(g, e, dt)
    return
  }
  const me = centre(e)
  e.lure = { x: me.x + e.facing * 10, y: me.y - 12 + Math.sin(g.time * 2) * 2 }
  swimBy(g, e, dt, null, E.fish.speed * 0.4)
  e.cooldown -= dt
  e.windup = false
}

const lamp = (g, e) => {
  e.vx = 0
  e.vy = 0
}

const idle = (g, e, dt) => {
  if (shoved(g, e, dt)) return
  e.vx = 0
  fall(e, dt)
  move(g.world, e, dt)
  e.facing = g.player.x < e.x ? -1 : 1
}

const speedOf = e => E[e.kind]?.speed ?? 24

const panic = (g, e, dt) => {
  dismount(e)
  hunt(e, null)
  e.windup = false
  e.wander += dt
  if (Math.random() < dt * L.panicTurn) e.facing *= -1
  const speed = Math.max(L.panicMin, speedOf(e) * L.panicPace)
  if (anchorOf(e.kind) === 'free') {
    e.vx = e.facing * speed
    e.vy = Math.sin(e.wander * 7) * speed
    move(g.world, e, dt)
    if (e.hitWall) e.facing *= -1
    return
  }
  if (shoved(g, e, dt)) return
  fall(e, dt)
  e.vx = e.facing * speed
  move(g.world, e, dt)
  if (e.hitWall) {
    if (e.grounded && Math.random() < 0.5) e.vy = -L.panicHop
    else e.facing *= -1
  }
}

const flee = (g, e, dt, attack) => {
  dismount(e)
  e.windup = false
  const away = awayFrom(e, e.fleeFrom ?? centre(g.player))
  const first = firstFright(e)
  if (first) burst(g, centre(e).x, e.y, 'pale', 3)
  if (e.kind === 'pillbug') {
    if (first && !(e.ball > 0)) curl(e, away.x >= 0 ? 1 : -1)
    if (e.ball > 0) roll(g, e, dt)
    else attack(g, e, dt)
    return
  }
  const speed = Math.max(L.fearMin, speedOf(e) * L.fearPace)
  if (swims(e)) {
    const c = centre(e)
    swimBy(g, e, dt, { x: c.x + away.x * 40, y: c.y + away.y * 40 }, speed)
    return
  }
  if (anchorOf(e.kind) === 'free') {
    e.vx = away.x * speed
    e.vy = away.y * speed - 10
    e.facing = e.vx < 0 ? -1 : 1
    move(g.world, e, dt)
    return
  }
  if (shoved(g, e, dt)) return
  fall(e, dt)
  e.facing = away.x >= 0 ? 1 : -1
  e.vx = e.facing * speed
  move(g.world, e, dt)
  if (e.hitWall && e.grounded) e.vy = -L.panicHop
}

const kind = (attack, life, own = false) => ({ attack, life, own })

const KINDS = {
  crawler: kind(walker(E.crawler.speed), (g, e, dt) => scavenge(g, e, dt, E.crawler.speed) || wander(g, e, dt, E.crawler.speed * L.calmPace)),
  spitter: kind(spitter, territorial),
  fish: kind(fish, school),
  jelly: kind((g, e, dt) => jelly(g, e, dt, true), drifting),
  bat: kind(bat, batLife),
  spore: kind(spore, sporeLife),
  slug: kind(slug, slugLife),
  worm: kind(worm, worm, true),
  turret: kind(turret, sentry, true),
  bomber: kind(bomber, curious),
  imp: kind(imp, impLife),
  emberbat: kind(emberbat, emberLife),
  slime: kind(slime, slimeLife),
  crab: kind(crab, crabLife),
  nest: kind(nest, nest, true),
  mimic: kind(mimic, mimic, true),
  gasbag: kind(gasbag, rise),
  tick: kind(tick, parasite),
  pillbug: kind(pillbug, pillbugLife),
  gnat: kind(gnat, moth),
  stilt: kind(stilt, wade),
  snapweed: kind(snapweed, snapweed, true),
  scrapper: kind(scrapper, hoard),
  dripper: kind(dripper, dripper, true),
  shade: kind(shade, shade, true),
  urchin: kind(urchin, urchin, true),
  coil: kind(coil, spark),
  puffer: kind(puffer, bristle),
  lantern: kind(lantern, angle),
}

const tame = e => e.ally || e.friendly || e.prop || e.warden || e.partOf

const lived = ({ attack, life, own }) => (g, e, dt) => {
  if (tame(e)) {
    hunt(e, null)
    attack(g, e, dt)
    return
  }
  e.mind = feel(g, e, dt)
  e.bored = Math.max(0, (e.bored ?? 0) - dt)
  if (e.stun > 0 && !own) {
    attack(g, e, dt)
    return
  }
  if (e.mind === 'burning') {
    panic(g, e, dt)
    return
  }
  if (e.mind === 'afraid') {
    flee(g, e, dt, attack)
    return
  }
  if (e.mind === 'hero' && !own) {
    hunt(e, null)
    attack(g, e, dt)
    return
  }
  const before = e.cooldown
  life(g, e, dt, attack)
  if (e.mind === 'calm' && e.cooldown > before + 0.05) e.cooldown += (e.cooldown - before) * (L.calmSlow - 1)
}

export const STEPPERS = {
  ...Object.fromEntries(Object.entries(KINDS).map(([name, k]) => [name, lived(k)])),
  lamp, battery: lamp, tank: lamp, carboy: lamp, ladle: lamp, sandbag: lamp,
  mole: idle, hermit: idle, miner: idle,
}

const exposedConductor = (world, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => !props(matAt(world, x + dx, y + dy)).solid)

const conductorsNear = (world, x, y, reach) => {
  const found = []
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.hypot(dx, dy)
      if (d <= reach && props(matAt(world, x + dx, y + dy)).conductance && exposedConductor(world, x + dx, y + dy)) found.push({ x: x + dx, y: y + dy, d })
    }
  }
  return found.sort((a, b) => a.d - b.d)
}

const inSight = (world, from, x, y) => {
  const to = { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK }
  const d = Math.max(1, Math.hypot(from.x - to.x, from.y - to.y))
  return lineClear(world, from, { x: to.x + ((from.x - to.x) / d) * BLOCK, y: to.y + ((from.y - to.y) / d) * BLOCK })
}

const discharge = (g, e, c) => {
  const B = E.battery
  const here = { x: cell(c.x), y: cell(c.y) }
  const arcs = conductorsNear(g.world, here.x, here.y, B.reach)
    .filter(spot => inSight(g.world, c, spot.x, spot.y))
    .reduce((picked, spot) => (picked.length < B.arcs && picked.every(o => Math.hypot(o.x - spot.x, o.y - spot.y) >= B.gap) ? [...picked, spot] : picked), [])
  for (const { x, y } of arcs) {
    zap(g, c, { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK })
    energize(g.world, x, y, B.energy)
  }
  const foe = g.enemies
    .filter(o => !o.friendly && !o.ally && !o.intangible && o.hp > 0 && lineClear(g.world, c, centre(o)))
    .map(o => [Math.hypot(centre(o).x - c.x, centre(o).y - c.y), o])
    .filter(([d]) => d < B.reach * BLOCK)
    .sort((a, b) => a[0] - b[0])[0]?.[1]
  if (foe) {
    zap(g, c, centre(foe))
    hurt(g, foe, B.foeDamage, 'world', 'CHARGE')
  }
  burst(g, c.x, c.y, 'charge', 12)
  g.pulse = Math.max(g.pulse, 0.5)
}

const VATS = { tank: [M.WATER, '#6fd0e0'], carboy: [M.ACID, '#c8ff5a'], ladle: [M.LAVA, '#ff9a2e'], sandbag: [M.SAND, '#e2d28c'] }

const spill = (g, e, c) => {
  const [matter, colour] = VATS[e.kind]
  pour(g.world, cell(c.x), cell(e.y + e.h + 1), matter, E.vat[e.kind])
  if (props(matter).liquid) splash(g, c.x, e.y + e.h, 60, colour)
  else chipsAt(g, c.x, e.y + e.h, matter, 8)
}

export const onDeath = (g, e) => {
  const c = centre(e)
  const x = cell(c.x)
  const y = cell(c.y)
  leaveRemains(g, e)
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
  if (e.kind === 'snapweed') for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) ignite(g.world, x + dx, y + dy)
  if (e.kind === 'dripper') for (const dx of [-1, 0, 1, -2, 2]) puff(g.world, x + dx, y + 1, e.drips ?? M.OIL, [1, 1])
  if (e.kind === 'scrapper' && e.loaded) puff(g.world, x, y, M.SCRAP, [0, 0])
  if (e.kind === 'battery') discharge(g, e, c)
  if (VATS[e.kind]) spill(g, e, c)
  if (e.kind === 'lamp') {
    g.fireballs.push({ x: e.x + 1, y: e.y + e.h, w: 4, h: 4, vx: 0, vy: 20, age: 0, friendly: true, fromWorld: true, napalm: true })
    burst(g, c.x, c.y, 'fire', 8)
  }
}

const supportAt = (world, e, x, y) => {
  let held = 0
  for (let px = 0; px < e.w; px++) if (solidAt(world, x + px, y + e.h + 1)) held += 1
  return held / e.w
}

export const support = (world, e) => supportAt(world, e, e.x, e.y)

const clearAt = (world, e, x, y) => !hitsSolid(world, { x, y, w: e.w, h: e.h })

const STEPS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8]

const findSeat = (world, e, wanted) => {
  const row = Math.round((e.y + e.h) / BLOCK)
  for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6]) {
    const y = (row + dy) * BLOCK - e.h
    for (const dx of STEPS) {
      const x = e.x + dx * BLOCK
      if (x >= BLOCK && x + e.w <= WORLD_PX - BLOCK && clearAt(world, e, x, y) && supportAt(world, e, x, y) >= wanted) return { x, y }
    }
  }
  return null
}

const mountTurret = (world, e) => {
  const y = e.y
  const scan = dir => {
    let x = e.x
    while (x > 0 && x + e.w < WORLD_PX && !hitsSolid(world, { x: x + dir, y, w: e.w, h: e.h })) x += dir
    return x > 0 && x + e.w < WORLD_PX ? x : null
  }
  const left = scan(-1)
  const right = scan(1)
  const useLeft = left !== null && (right === null || e.x - left <= right - e.x)
  if (left === null && right === null) return e
  return { ...e, x: useLeft ? left : right, facing: useLeft ? 1 : -1, mounted: true }
}

export const seatEnemy = world => e => {
  if (e.kind === 'turret') return mountTurret(world, e)
  if (anchorOf(e.kind) !== 'ground' || e.free || e.prop || e.warden) return e
  const spot = findSeat(world, e, 1) ?? findSeat(world, e, 0.85)
  if (spot) return { ...e, ...spot }
  return e.friendly ? e : null
}

const FOOTING_SLIDE = 60
const FOOTING_MIN = 0.7

export const settleFooting = (g, e, dt) => {
  if (!e.grounded || e.free || e.prop || e.clung > 0 || e.riding || anchorOf(e.kind) !== 'ground') return
  const under = e.y + e.h + 1
  if (Math.abs(e.vx) > 1 && solidAt(g.world, e.x + (e.vx > 0 ? e.w + 1 : -1), under)) return
  const held = []
  for (let px = 0; px < e.w; px++) if (solidAt(g.world, e.x + px, under)) held.push(px)
  if (held.length === 0 || held.length >= e.w * FOOTING_MIN) return
  const middle = (held[0] + held.at(-1)) / 2
  const wide = held.at(-1) - held[0] + 1 >= e.w * FOOTING_MIN
  const towardFloor = middle < e.w / 2 ? -1 : 1
  const step = (wide ? towardFloor : -towardFloor) * FOOTING_SLIDE * dt
  const spot = [step, -step].find(by => clearAt(g.world, e, e.x + by, e.y))
  if (spot !== undefined) e.x += spot
}

const holdEdge = (g, e) => {
  if (!e.grounded || e.vx === 0) return
  const dir = Math.sign(e.vx)
  if (solidAt(g.world, e.x + (dir > 0 ? e.w + 1 : -1), e.y + e.h + 2)) return
  const below = centre(g.player).y > e.y + e.h + BLOCK
  e.vx = below && e.mind !== 'calm' ? e.vx * 1.8 : 0
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
    acidproof: def.acidproof === true,
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
