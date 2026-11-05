import { TUNING } from './config.js'
import { ENEMY_DEFS } from './enemies.js'
import { centre } from './physics.js'
import { burstSparks } from './fx.js'

export const SCHOOLS = {
  SHOT: '#fff3b4',
  BLOW: '#ff8a6a',
  FIRE: '#ff9a2e',
  CHARGE: '#ffe84a',
  CRUSHED: '#d8c88c',
  ACID: '#c8ff5a',
}

const WORLD_SCHOOLS = { FIRE: 'FIRE', LAVA: 'FIRE', SMOKE: 'FIRE', CHARGE: 'CHARGE', CRUSHED: 'CRUSHED', ACID: 'ACID' }

export const schoolOf = (source, cause) => {
  if (cause === 'SHOT') return 'SHOT'
  if (cause === 'WEAK') return null
  return WORLD_SCHOOLS[cause] ?? 'BLOW'
}

const W = () => TUNING.run.wards

export const emptyTally = () => Object.fromEntries(Object.keys(SCHOOLS).map(s => [s, 0]))

export const noteKill = (g, e) => {
  const school = schoolOf(e.lastSource, e.lastCause)
  if (!school) return
  g.tally[school] += 1
  for (const s of Object.keys(g.recent)) g.recent[s] *= W().forget
  g.recent[school] += 1
}

const ranked = counts => Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([s]) => s)

export const favourite = g => ranked(g.recent)[0] ?? 'SHOT'

const shareFor = g => {
  const base = W().byRing[g.ring] ?? 1
  return Math.max(W().floor, base - (g.loop ?? 0) * W().perLoop)
}

const allowed = e => school => !(ENEMY_DEFS[e.kind].weakTo ?? []).includes(school)

export const readBuild = (g, e) => {
  const share = shareFor(g)
  if (share >= 1) return
  const schools = ranked(g.recent).filter(allowed(e))
  const count = (g.loop ?? 0) >= W().secondAtLoop ? 2 : 1
  const worn = (schools.length ? schools : ['SHOT'].filter(allowed(e))).slice(0, count)
  e.wards = worn.map(school => ({ school, share }))
  e.taken = {}
  e.reading = W().readTime
}

export const adaptWards = (g, e) => {
  const top = ranked(e.taken ?? {}).filter(allowed(e))[0]
  e.taken = {}
  if (!top) return
  const share = shareFor(g)
  const held = (e.wards ?? []).filter(w => w.school !== top).slice(0, 1).map(w => ({ ...w, share: Math.min(1, w.share + W().fade) }))
  e.wards = [{ school: top, share }, ...held]
  e.reading = W().readTime
}

export const wardShare = (e, school) => e.wards?.find(w => w.school === school)?.share ?? 1

export const wardedAgainst = (g, e, school) => {
  const body = e.partOf ? g.enemies.find(o => o.warden) : e
  return Boolean(body) && wardShare(body, school) < 1
}

export const stepWard = (e, dt) => {
  e.wardHit = Math.max(0, (e.wardHit ?? 0) - dt)
  e.wardPop = Math.max(0, (e.wardPop ?? 0) - dt)
  e.reading = Math.max(0, (e.reading ?? 0) - dt)
}

export const bounced = (g, e, school) => {
  const c = centre(e)
  const colour = SCHOOLS[school]
  e.wardHit = W().flash
  burstSparks(g, c.x, c.y, colour, 4, 110)
  if (e.wardPop > 0) return
  e.wardPop = W().popEvery
  g.popups.push({ x: c.x + (Math.random() - 0.5) * e.w * 0.6, y: e.y - 6, icon: `${school}_NO`, colour: 'pale', life: 0.8 })
}
