import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { acidAt, burningAt, chargedAt, crushingAt, ignite, lavaAt, matAt, tallyRule } from './world.js'
import { cell, cellsUnder, centre, inWater, overlap, solidAt } from './physics.js'
import { hurt } from './combat.js'
import { burstSparks } from './fx.js'
import { flameAt } from './matter.js'
import { anchorOf } from './cast.js'

const L = () => TUNING.enemies.lives

const BLOOD = '#ff5a4a'
const PALE = '#f4f8f2'

const quarries = new WeakMap()
const hosts = new WeakMap()
const sounds = new WeakMap()
const remainsByWorld = new WeakMap()
const ticks = new WeakMap()
const deaths = new WeakMap()

const listOf = (map, key) => {
  if (!map.has(key)) map.set(key, [])
  return map.get(key)
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export const clearBetween = (world, a, b) => {
  const steps = Math.ceil(dist(a, b) / 4)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (solidAt(world, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false
  }
  return true
}

export const tallyLife = (g, what, mat = M.EMPTY) => tallyRule(g.world, `life.${what}`, mat)

export const creatures = g => g.enemies.filter(o => o.hp > 0 && !o.friendly && !o.prop && !o.warden && !o.partOf && !o.stowed && !o.intangible)

export const nearest = (g, e, test, reach) => {
  const c = centre(e)
  let best = null
  let bestD = reach
  for (const o of creatures(g)) {
    if (o === e || !test(o)) continue
    const d = dist(centre(o), c)
    if (d < bestD) {
      best = o
      bestD = d
    }
  }
  return best
}

export const hunt = (e, target) => (target ? quarries.set(e, target) : quarries.delete(e))

export const preyOf = e => {
  const t = quarries.get(e)
  return t && t.hp !== undefined && t.hp > 0 ? t : null
}

export const quarryOf = e => {
  const t = quarries.get(e)
  if (!t) return null
  if (t.hp === undefined) return t
  return t.hp > 0 ? centre(t) : null
}

export const ride = (e, host) => (host ? hosts.set(e, host) : hosts.delete(e))
export const hostOf = e => {
  const h = hosts.get(e)
  return h && h.hp > 0 ? h : null
}

export const makeNoise = (g, x, y, reach, from = null) => listOf(sounds, g.world).push({ x, y, reach, at: g.time, from })

const heardNow = g => {
  const fresh = listOf(sounds, g.world).filter(s => g.time - s.at < L().echo)
  sounds.set(g.world, fresh)
  const blast = g.world.lastBlast
  const loud = blast && g.time - blast.at < L().echo ? [{ x: (blast.x + 0.5) * BLOCK, y: (blast.y + 0.5) * BLOCK, reach: (blast.reach + L().blastHeard) * BLOCK, at: blast.at, blast: true }] : []
  return [...fresh, ...loud]
}

export const noiseNear = (g, e, reach = Infinity) => {
  const c = centre(e)
  return heardNow(g)
    .filter(s => dist(s, c) < Math.min(reach, s.reach))
    .sort((a, b) => b.at - a.at)[0] ?? null
}

const glowOf = g => {
  const out = g.enemies.filter(o => o.hp > 0 && (o.kind === 'lamp' || o.kind === 'emberbat' || o.alight > 0)).map(o => ({ ...centre(o), warm: o.kind !== 'emberbat' }))
  for (const o of g.enemies) if (o.kind === 'lantern' && o.lure && o.hp > 0) out.push({ ...o.lure, wet: true })
  const w = g.world
  const hot = []
  for (let i = 0; i < w.mat.length; i++) if (w.burn[i] > 0 || w.mat[i] === M.LAVA) hot.push(i)
  const stride = Math.max(1, Math.ceil(hot.length / L().glows))
  for (let n = 0; n < hot.length; n += stride) out.push({ x: (hot[n] % ROOM + 0.5) * BLOCK, y: (Math.floor(hot[n] / ROOM) + 0.5) * BLOCK, hot: true, warm: true })
  return out
}

const onTick = g => {
  const seen = ticks.get(g)
  if (seen && seen.at === g.time && seen.world === g.world) return seen
  const p = g.player
  const fired = seen && p.shotReady > seen.shotReady + 0.01
  const state = { at: g.time, world: g.world, shotReady: p.shotReady, lights: glowOf(g) }
  ticks.set(g, state)
  if (fired) makeNoise(g, centre(p).x, centre(p).y, L().hear, 'hero')
  return state
}

export const lightsOf = g => onTick(g).lights

export const remainsOf = g => {
  const fresh = listOf(remainsByWorld, g.world).filter(r => g.time - r.at < L().remains.life && r.meat > 0)
  remainsByWorld.set(g.world, fresh)
  return fresh
}

const settle = (world, x, y, h) => {
  let bottom = y + h
  while (bottom < ROOM * BLOCK - BLOCK && !props(matAt(world, cell(x), cell(bottom + 1))).solid) bottom += 1
  return bottom - h
}

export const deathsOf = g => {
  if (!deaths.has(g)) deaths.set(g, { all: 0, foe: 0, world: 0, unaware: 0 })
  return deaths.get(g)
}

const noteDeath = (g, e) => {
  if (e.friendly || e.prop || e.warden || e.partOf) return
  const tally = deathsOf(g)
  tally.all += 1
  if (e.lastBy) tally.foe += 1
  else if (e.lastSource !== 'player') tally.world += 1
  if (e.lastSource !== 'player' && !(e.noticed > 0)) tally.unaware += 1
}

export const leaveRemains = (g, e) => {
  noteDeath(g, e)
  if (e.friendly || e.prop || e.warden || e.partOf || e.silent || e.kind === 'gnat' || e.kind === 'nest') return
  const R = L().remains
  const bodies = remainsOf(g)
  const c = centre(e)
  const h = Math.max(4, Math.round(e.h * 0.5))
  bodies.push({ kind: e.kind, x: c.x - e.w / 2, y: settle(g.world, c.x, e.y + e.h - h, h), w: e.w, h, facing: e.facing, meat: R.meat, at: g.time })
  if (bodies.length > R.most) bodies.shift()
  makeNoise(g, c.x, c.y, L().deathHeard)
}

export const bite = (g, by, victim, amount, cause = 'BITTEN') => {
  if (victim.iframes > 0 || victim.hp <= 0) return false
  hurt(g, victim, amount, 'world', cause)
  victim.lastBy = by.kind
  victim.grudge = L().grudge
  quarries.set(victim, by)
  if (!FIGHTERS.has(victim.kind) && !by.riding && !rooted(victim)) scare(victim, centre(by), L().fearFor)
  by.eating = 0.35
  const c = centre(victim)
  burstSparks(g, c.x, c.y, BLOOD, 4, 50)
  makeNoise(g, c.x, c.y, L().biteHeard)
  return true
}

export const eatRemains = (g, e, body, dt) => {
  e.vx = 0
  e.eating = 0.3
  e.chew = (e.chew ?? 0) - dt
  if (e.chew > 0) return
  e.chew = L().remains.bite
  body.meat -= 1
  burstSparks(g, body.x + body.w / 2, body.y + body.h / 2, BLOOD, 3, 30)
  if (body.meat <= 0) tallyLife(g, 'scavenge')
}

export const remainsNear = (g, e, reach) => {
  const c = centre(e)
  return remainsOf(g)
    .filter(r => Math.abs(r.y + r.h - (e.y + e.h)) < 2 * BLOCK && Math.abs(r.x + r.w / 2 - c.x) < reach)
    .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0] ?? null
}

export const touchingRemains = (e, body) => overlap({ x: e.x - 2, y: e.y, w: e.w + 4, h: e.h + 2 }, body)

export const cellNear = (g, e, reach, test) => {
  const c = centre(e)
  const cx = cell(c.x)
  const cy = cell(c.y)
  const r = Math.ceil(reach / BLOCK)
  let best = null
  let bestD = Infinity
  for (let y = Math.max(0, cy - r); y <= Math.min(ROOM - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(ROOM - 1, cx + r); x++) {
      if (!test(x, y, matAt(g.world, x, y))) continue
      const d = Math.hypot(x - cx, y - cy)
      if (d < bestD) {
        bestD = d
        best = { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK, cx: x, cy: y }
      }
    }
  }
  return best
}

export const exposed = (g, x, y) => [[0, -1], [1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => !props(matAt(g.world, x + dx, y + dy)).solid)

const FIGHTERS = new Set(['spitter', 'stilt', 'scrapper', 'turret', 'tick', 'crab', 'mimic', 'urchin', 'snapweed', 'worm'])
const SWIMMERS = new Set(['fish', 'jelly', 'puffer', 'lantern'])
const ROOTED = new Set(['turret', 'nest', 'snapweed', 'dripper', 'mimic', 'worm', 'spitter'])
const FIRE_BOLD = new Set(['imp', 'bomber'])

export const swims = e => SWIMMERS.has(e.kind)
export const rooted = e => e.riding === true || ROOTED.has(e.kind) || e.heavy || anchorOf(e.kind) === 'hang' || anchorOf(e.kind) === 'wall'

const UNBURNT = new Set(['imp', 'bomber', 'gnat', 'urchin'])

const canBurn = e => !e.fireproof && !swims(e) && !rooted(e) && !UNBURNT.has(e.kind)

const hazardAt = (g, e, x, y) =>
  crushingAt(g.world, x, y)
  || (!e.fireproof && !FIRE_BOLD.has(e.kind) && burningAt(g.world, x, y))
  || (!e.fireproof && lavaAt(g.world, x, y))
  || (!e.insulated && chargedAt(g.world, x, y))
  || (!e.acidproof && acidAt(g.world, x, y))

export const dangerAhead = (g, e, dir) => {
  const x = cell(dir > 0 ? e.x + e.w + 2 : e.x - 2)
  const top = cell(e.y)
  for (let y = top; y <= cell(e.y + e.h + 1); y++) if (hazardAt(g, e, x, y)) return true
  return false
}

const hazardCentre = (g, e) => {
  const c = centre(e)
  const cx = cell(c.x)
  const cy = cell(c.y)
  const r = L().fearCells
  let sx = 0
  let sy = 0
  let n = 0
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!hazardAt(g, e, x, y)) continue
      sx += x
      sy += y
      n += 1
    }
  }
  return n ? { x: (sx / n + 0.5) * BLOCK, y: (sy / n + 0.5) * BLOCK } : null
}

const scare = (e, from, time) => {
  if (!(e.afraid > 0)) e.frightened = true
  e.afraid = Math.max(e.afraid ?? 0, time)
  e.fleeFrom = { x: from.x, y: from.y }
}

const feelFear = (g, e) => {
  if (rooted(e) || e.kind === 'shade') return
  const c = centre(e)
  const blast = g.world.lastBlast
  if (blast && g.time - blast.at < 0.05 && dist({ x: (blast.x + 0.5) * BLOCK, y: (blast.y + 0.5) * BLOCK }, c) < (blast.reach + L().blastHeard) * BLOCK) {
    scare(e, { x: (blast.x + 0.5) * BLOCK, y: (blast.y + 0.5) * BLOCK }, L().fearFor)
  }
  const blaze = g.enemies.find(o => o !== e && o.alight > 0 && dist(centre(o), c) < L().catchReach * 2)
  if (blaze && canBurn(e)) scare(e, centre(blaze), L().fearFor * 0.6)
  if ((e.sniff = (e.sniff ?? 0) - 1) > 0) return
  e.sniff = 3
  const hazard = hazardCentre(g, e)
  if (hazard) scare(e, hazard, L().fearFor * 0.5)
}

const touchesFire = (g, e) => cellsUnder({ x: e.x, y: e.y, w: e.w, h: e.h + 1 }).some(([x, y]) => burningAt(g.world, x, y) || lavaAt(g.world, x, y))

const doused = (g, e) => inWater(g.world, e) || cellsUnder(e, 1).some(([x, y]) => [M.WATER, M.MUD, M.SNOW].includes(matAt(g.world, x, y)))

const feelFire = (g, e, dt) => {
  if (canBurn(e) && touchesFire(g, e) && !(e.alight > 0)) {
    e.alight = L().burnFor
    e.burnt = L().burnHurt
    tallyLife(g, 'catch')
  }
  if (!(e.alight > 0)) return
  if (doused(g, e)) {
    e.alight = 0
    burstSparks(g, centre(e).x, e.y, PALE, 8, 40)
    return
  }
  e.alight -= dt
  e.burnt = (e.burnt ?? L().burnHurt) - dt
  if (e.burnt <= 0) {
    e.burnt = L().burnHurt
    hurt(g, e, 1, 'world', 'FIRE')
  }
  e.trail = (e.trail ?? 0) - dt
  if (e.trail <= 0) {
    e.trail = L().burnTrail
    const c = centre(e)
    ignite(g.world, cell(c.x - (e.facing ?? 1) * e.w * 0.6), cell(e.y + e.h + 2))
    ignite(g.world, cell(c.x - (e.facing ?? 1) * e.w * 0.6), cell(c.y))
    flameAt(g, c.x, e.y + 2)
  }
  for (const o of g.enemies) {
    if (o !== e && canBurn(o) && !o.friendly && !o.prop && !o.warden && !(o.alight > 0) && overlap(e, o) && Math.random() < L().catch * dt * 10) {
      o.alight = L().burnFor * 0.8
      o.burnt = L().burnHurt
      tallyLife(g, 'spread')
    }
  }
}

const sightOf = e => L().sights[e.kind] ?? L().sight

const seesHero = (g, e) => {
  const reach = sightOf(e)
  if (!reach) return false
  const p = g.player
  if (swims(e) && !inWater(g.world, p)) return false
  const c = centre(e)
  const h = centre(p)
  if (dist(c, h) > reach) return false
  if (L().blind.includes(e.kind)) return true
  e.look = (e.look ?? 0) - 1
  if (e.look > 0) return e.saw === true
  e.look = L().look
  e.saw = clearBetween(g.world, c, h)
  return e.saw
}

const hitByHero = e => e.lastSource === 'player' && e.flash > 0

const ALARMS = new Set(['hero', 'bait'])

const hearsAlarm = (g, e) => !L().deaf.includes(e.kind) && heardNow(g).some(s => ALARMS.has(s.from) && dist(s, centre(e)) < s.reach)

const startle = (g, e) => {
  e.startle = L().startle
  const c = centre(e)
  e.facing = centre(g.player).x < c.x ? -1 : 1
  if (e.grounded && !rooted(e) && !hostOf(e)) e.vy = -L().startleHop
  hunt(e, null)
}

export const feel = (g, e, dt) => {
  onTick(g)
  e.startle = Math.max(0, (e.startle ?? 0) - dt)
  e.eating = Math.max(0, (e.eating ?? 0) - dt)
  e.grudge = Math.max(0, (e.grudge ?? 0) - dt)
  e.afraid = Math.max(0, (e.afraid ?? 0) - dt)
  feelFire(g, e, dt)
  feelFear(g, e)
  const was = e.noticed > 0
  if ((e.spawned && g.boss) || seesHero(g, e) || hitByHero(e) || hearsAlarm(g, e)) e.noticed = L().attention
  else e.noticed = Math.max(0, (e.noticed ?? 0) - dt)
  if (!was && e.noticed > 0) startle(g, e)
  if (e.alight > 0 && !rooted(e)) return 'burning'
  if (e.afraid > 0) return 'afraid'
  if (e.noticed > 0) return 'hero'
  return 'calm'
}

export const grudgeOf = e => (e.grudge > 0 ? preyOf(e) : null)

export const awayFrom = (e, from) => {
  const c = centre(e)
  const dx = c.x - from.x
  const dy = c.y - from.y
  const d = Math.max(1, Math.hypot(dx, dy))
  return { x: dx / d, y: dy / d }
}

export const firstFright = e => {
  const first = e.frightened === true
  e.frightened = false
  return first
}
