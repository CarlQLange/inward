import { BLOCK, ROOM, TUNING } from './config.js'
import { props } from './materials.js'
import { acidAt, burningAt, chargedAt, crushingAt, energize, ignite, lavaAt, matAt } from './world.js'
import { cell, cellsUnder, centre, moveAxis, overlap } from './physics.js'
import { hurt } from './combat.js'
import { SCHOOLS, schoolOf } from './wards.js'
import { tieGlint } from './matter.js'

const S = TUNING.skills.link
const SPREADS = new Set(['FIRE', 'CHARGE'])
const HOT = new Set(['FIRE', 'LAVA', 'SMOKE'])

export const linkable = e => !e.friendly && !e.ally && !e.prop && !e.partOf && !e.stowed && !e.intangible && !(e.link > 0)

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const nearestTo = (list, point, reach) => list
  .map(e => [distance(centre(e), point), e])
  .filter(([d]) => d < reach)
  .sort((a, b) => a[0] - b[0])
  .map(([, e]) => e)

export const chainFrom = (g, first) => {
  const chosen = [first]
  while (chosen.length < S.most) {
    const next = nearestTo(g.enemies.filter(e => linkable(e) && !chosen.includes(e)), centre(chosen.at(-1)), S.hop)[0]
    if (!next) break
    chosen.push(next)
  }
  return chosen
}

export const gatherAround = (g, point, reach) => nearestTo(g.enemies.filter(linkable), point, reach).slice(0, S.most)

export const knotOf = e => ({ x: e.x + e.w / 2, y: e.upside ? e.y + e.h + 2 : e.y - 2 })

const hubPoint = (g, f) => (f.hub === 'hero' ? knotOf(g.player) : f.hub ? { x: (f.hub.x + 0.5) * BLOCK, y: (f.hub.y + 0.5) * BLOCK } : null)

export const tiesOf = f => f.members
  .map((e, i) => (f.hub ? [f.hub, e] : i ? [f.members[i - 1], e] : null))
  .filter(Boolean)

export const endOf = (g, f, end) => (end === f.hub ? hubPoint(g, f) : knotOf(end))

export const linkOf = (g, e) => g.effects.find(f => f.kind === 'link' && !f.done && (f.members.includes(e) || (f.hub === 'hero' && e === g.player)))

const COLD = '#bff2ff'
const PALE = '#f4f8f2'

const hops = (f, from, to) => {
  if (f.hub) return from === f.hub ? [[f.hub, to, 0]] : [[from, f.hub, 0], [f.hub, to, 1]]
  const [a, b] = [f.members.indexOf(from), f.members.indexOf(to)]
  if (a < 0 || b < 0) return [[from, to, 0]]
  const step = Math.sign(b - a)
  return [[f.members[b - step], to, Math.abs(b - a) - 1]]
}

const pulse = (g, f, from, to, colour) => {
  hops(f, from, to).forEach(([a, b, delay]) => f.pulses.push({ from: a, to: b, age: -delay * S.hopTime, colour }))
  const at = endOf(g, f, to)
  if (at) tieGlint(g, at.x, at.y, colour)
}

const heatTie = (f, end, school) => {
  if (!f.cable || !SPREADS.has(school)) return
  f.live.set(end, { school, life: S.liveTime })
}

const touchHub = (g, f, school) => {
  if (!f.hub || f.hub === 'hero') return
  if (school === 'FIRE') ignite(g.world, f.hub.x, f.hub.y)
  if (school === 'CHARGE') energize(g.world, f.hub.x, f.hub.y, S.energy)
}

const sideEffects = (g, f, from, e, school, cause) => {
  const c = centre(e)
  if (HOT.has(cause) && !e.fireproof && !e.heavy) {
    e.ablaze = Math.max(e.ablaze ?? 0, S.burn)
    e.ablazeClock ??= 0
  }
  if (school === 'CHARGE') {
    const was = endOf(g, f, from) ?? c
    g.bolts.push({ points: [was, c], life: 0.18, colour: 'charge' })
    energize(g.world, cell(c.x), cell(e.y + e.h + 2), S.energy)
  }
}

const strike = (g, e, amount, source, cause) => {
  if (e.warden) hurt(g, e, amount, 'player', cause)
  else hurt(g, e, amount, source, cause)
}

const share = (g, f, from, amount, source, cause) => {
  if (f.passing) return
  f.passing = true
  const school = schoolOf(source, cause) ?? 'BLOW'
  for (const e of f.members) {
    if (e === from || e.hp <= 0) continue
    strike(g, e, amount, source, cause)
    sideEffects(g, f, from, e, school, cause)
    pulse(g, f, from, e, SCHOOLS[school] ?? PALE)
    heatTie(f, e, school)
  }
  touchHub(g, f, school)
  heatTie(f, from, school)
  f.passing = false
}

export const passOn = (g, from, amount, source, cause) => {
  const f = linkOf(g, from)
  if (f) share(g, f, from, amount, source, cause)
  else from.link = 0
}

const STATE_COLOURS = { frozen: COLD, stun: PALE, ablaze: '#ff9a2e' }

const passState = (g, f, from, field) => {
  const value = from[field]
  for (const e of f.members) {
    if (e === from || e.heavy || e.warden || e.hp <= 0 || (e[field] ?? 0) >= value || (field === 'ablaze' && e.fireproof)) continue
    e[field] = value
    if (field === 'frozen') {
      e.stun = Math.max(e.stun, value)
      e.shatters = e.shatters || from.shatters
    }
    if (field === 'ablaze') e.ablazeClock ??= 0
    pulse(g, f, from, e, STATE_COLOURS[field])
  }
}

const passShove = (g, f, from) => {
  for (const e of f.members) {
    if (e === from || e.heavy || e.warden || e.hp <= 0) continue
    e.vx = from.vx
    e.vy = from.vy
    e.shoved = Math.max(e.shoved ?? 0, from.shoved)
    pulse(g, f, from, e, SCHOOLS.BLOW)
  }
}

const RISES = [['frozen', 0.3], ['stun', 0.3], ['ablaze', 0.5]]

const snapshot = e => ({ frozen: e.frozen ?? 0, stun: e.stun ?? 0, ablaze: e.ablaze ?? 0, shoved: e.shoved ?? 0 })

const risenIn = (f, field, step) => f.members.find(e => f.seen.has(e) && (e[field] ?? 0) > f.seen.get(e)[field] + step)

const watchStates = (g, f) => {
  for (const [field, step] of RISES) {
    const from = risenIn(f, field, step)
    if (from) passState(g, f, from, field)
  }
  const shoved = f.members.find(e => f.seen.has(e) && (e.shoved ?? 0) > f.seen.get(e).shoved + 0.15 && Math.hypot(e.vx ?? 0, e.vy ?? 0) > 120)
  if (shoved) passShove(g, f, shoved)
  f.members.forEach(e => f.seen.set(e, snapshot(e)))
}

const CONTACTS = [
  ['FIRE', 1, (w, x, y) => burningAt(w, x, y)],
  ['LAVA', 2, (w, x, y) => lavaAt(w, x, y)],
  ['CHARGE', 2, (w, x, y) => chargedAt(w, x, y)],
  ['ACID', 1, (w, x, y) => acidAt(w, x, y)],
  ['CRUSHED', 2, (w, x, y) => crushingAt(w, x, y)],
]

const feel = (g, f, cells, from) => {
  for (const [cause, amount, test] of CONTACTS) {
    if ((f.waits[cause] ?? 0) > 0 || !cells.some(([x, y]) => test(g.world, x, y))) continue
    f.waits[cause] = f.hub === 'hero' ? S.yokeEvery : S.stakeEvery
    share(g, f, from, amount, 'world', cause)
  }
}

const feelHub = (g, f) => {
  if (f.hub === 'hero') feel(g, f, cellsUnder(g.player, 1), g.player)
  else if (f.hub) {
    feel(g, f, [[f.hub.x, f.hub.y]], f.hub)
    if (!props(matAt(g.world, f.hub.x, f.hub.y)).solid) f.hub = null
  }
}

const tieCells = (g, a, b) => {
  const length = distance(a, b)
  const out = []
  for (let d = 0; d < length; d += BLOCK / 2) {
    const x = cell(a.x + ((b.x - a.x) * d) / length)
    const y = cell(a.y + ((b.y - a.y) * d) / length)
    if (x >= 0 && y >= 0 && x < ROOM && y < ROOM && !out.some(([ox, oy]) => ox === x && oy === y)) out.push([x, y])
  }
  return out
}

const runCables = (g, f, dt) => {
  for (const [a, b] of tiesOf(f)) {
    const [pa, pb] = [endOf(g, f, a), endOf(g, f, b)]
    const cells = tieCells(g, pa, pb)
    const heat = f.live.get(b)
    if (!heat) {
      const caught = cells.find(([x, y]) => burningAt(g.world, x, y) || chargedAt(g.world, x, y))
      if (caught && (f.cool.get(b) ?? 0) <= g.time) {
        f.cool.set(b, g.time + S.stakeEvery)
        const school = chargedAt(g.world, caught[0], caught[1]) ? 'CHARGE' : 'FIRE'
        f.live.set(b, { school, life: S.liveTime })
        hurt(g, b, school === 'CHARGE' ? 2 : 1, 'world', school)
      }
      continue
    }
    heat.life -= dt
    if (heat.life <= 0) f.live.delete(b)
    for (const [x, y] of cells) {
      if (heat.school === 'FIRE') ignite(g.world, x, y)
      else energize(g.world, x, y, S.energy)
    }
    const segment = { x: Math.min(pa.x, pb.x) - 2, y: Math.min(pa.y, pb.y) - 2, w: Math.abs(pb.x - pa.x) + 4, h: Math.abs(pb.y - pa.y) + 4 }
    g.enemies.filter(e => !f.members.includes(e) && !e.friendly && !e.prop && overlap(e, segment) && crosses(e, pa, pb))
      .forEach(e => hurt(g, e, heat.school === 'CHARGE' ? 2 : 1, 'world', heat.school))
  }
}

const crosses = (e, a, b) => {
  const c = centre(e)
  const length = Math.max(1, distance(a, b))
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / length ** 2))
  return distance(c, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) < Math.max(e.w, e.h) / 2 + 2
}

const movable = (g, f, end) => end !== f.hub && end !== g.player && !end.heavy && !end.warden

const haul = (g, e, dx, dy) => {
  const most = S.ropeHaul
  moveAxis(g.world, e, 'x', Math.max(-most, Math.min(most, dx)))
  moveAxis(g.world, e, 'y', Math.max(-most, Math.min(most, dy)))
}

const pullRopes = (g, f) => {
  for (const [a, b] of tiesOf(f)) {
    const [pa, pb] = [endOf(g, f, a), endOf(g, f, b)]
    const d = distance(pa, pb)
    const length = f.lengths.get(b)
    if (!length || d <= length) continue
    const excess = d - length
    const [ux, uy] = [(pb.x - pa.x) / d, (pb.y - pa.y) / d]
    const [ma, mb] = [movable(g, f, a), movable(g, f, b)]
    if (!ma && !mb) continue
    const [sa, sb] = ma && mb && a.grounded !== b.grounded ? (a.grounded ? [1, 0] : [0, 1]) : ma && mb ? [0.5, 0.5] : [ma ? 1 : 0, mb ? 1 : 0]
    if (sb) haul(g, b, -ux * excess * sb, -uy * excess * sb)
    if (sa) haul(g, a, ux * excess * sa, uy * excess * sa)
    if (mb && uy < -0.5 && excess > 2) b.vy = Math.min(b.vy ?? 0, -40)
  }
}

export const measureRopes = (g, f) => {
  f.lengths = new Map(tiesOf(f).map(([a, b]) => [b, Math.max(S.ropeLeast, Math.min(S.ropeMost, distance(endOf(g, f, a), endOf(g, f, b)) * S.ropeSlack))]))
}

const prune = (g, f) => {
  const gone = f.members.filter(e => e.hp <= 0 || !g.enemies.includes(e))
  if (gone.length === 0) return
  gone.forEach(e => { e.link = 0 })
  f.members = f.members.filter(e => !gone.includes(e))
  if (f.rope) measureRopes(g, f)
}

export const stepLink = (g, f, dt) => {
  prune(g, f)
  if (f.members.length < (f.hub ? 1 : 2)) {
    f.life = 0
    return
  }
  Object.keys(f.waits).forEach(key => { f.waits[key] -= dt })
  f.members.forEach(e => { e.link = f.life })
  if (f.hub === 'hero') g.player.link = f.life
  watchStates(g, f)
  feelHub(g, f)
  if (f.cable) runCables(g, f, dt)
  if (f.rope) pullRopes(g, f)
  f.pulses.forEach(p => { p.age += dt })
  f.pulses = f.pulses.filter(p => p.age < S.hopTime)
}

export const endLink = (g, f) => {
  f.members.forEach(e => { e.link = 0 })
  if (f.hub === 'hero') g.player.link = 0
}

export const tieUp = (g, members, hub, options) => {
  const f = { age: 0, kind: 'link', members, hub, life: S.life, seen: new Map(), waits: {}, live: new Map(), cool: new Map(), pulses: [], ...options }
  members.forEach(e => {
    e.link = f.life
    f.seen.set(e, snapshot(e))
  })
  if (hub === 'hero') g.player.link = f.life
  if (f.rope) measureRopes(g, f)
  const first = hub ?? members[0]
  members.filter(e => e !== first).forEach(e => pulse(g, f, first, e, f.colour))
  g.effects.push(f)
  return f
}
