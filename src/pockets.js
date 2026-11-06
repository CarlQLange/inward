import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { explode, ignite, matAt, setCell, tallyRule } from './world.js'
import { chipsAt, dustAt } from './fx.js'

const P = TUNING.pockets

export const POCKET_KINDS = Object.keys(P.kinds)
export const POCKET_SLOTS = 4

const HOME = [
  ['cistern', 'nest', 'seam'],
  ['cistern', 'hopper', 'tar'],
  ['marsh', 'tar', 'cistern'],
  ['seam', 'marsh', 'hopper', 'seep'],
  ['vein', 'hopper', 'seam'],
  ['rime', 'cistern', 'seep'],
  ['seep', 'marsh', 'nest'],
]

const POURS = { cistern: M.WATER, hopper: M.SAND, rime: M.FLOE, marsh: M.METHANE, tar: M.OIL, vein: M.LAVA, seep: M.ACID }
const HEAVY = new Set(['hopper', 'vein', 'rime', 'seam'])
const SIZES = { nest: [3, 2], alcove: [2, 3], vein: [4, 2] }

const pick = list => list[Math.floor(Math.random() * list.length)]
const between = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const shuffled = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v)

const weighted = pool => {
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = Math.random() * total
  return pool.find(([, weight]) => (roll -= weight) < 0)?.[0] ?? pool.at(-1)?.[0]
}

const footprint = ({ x, y, w, h }) => Array.from({ length: w * h }, (_, i) => [x + (i % w), y + Math.floor(i / w)])
const covers = (pocket, x, y) => x >= pocket.x && y >= pocket.y && x < pocket.x + pocket.w && y < pocket.y + pocket.h
const middle = pocket => ({ x: pocket.x + pocket.w / 2, y: pocket.y + pocket.h / 2 })
const gapTo = (pocket, x, y) => Math.max(
  Math.max(pocket.x - x, x - (pocket.x + pocket.w - 1), 0),
  Math.max(pocket.y - y, y - (pocket.y + pocket.h - 1), 0),
)

const isOpen = m => m === M.EMPTY || props(m).gas === true

const clear = (world, spot) => footprint(spot).every(([x, y]) => world.mat[y * ROOM + x] === M.EMPTY)

const inView = (world, spot) => {
  const { x, y } = middle(spot)
  const dx = Math.sign(ROOM / 2 - x)
  const dy = Math.sign(ROOM / 2 - y)
  return [1, 2].every(k => isOpen(matAt(world, Math.floor(x + dx * k), Math.floor(y + dy * k))))
}

const nearDoor = (doors, { x, w }) => Object.entries(doors ?? {}).some(([dir, door]) =>
  dir === 'left' ? x < P.clearOfDoors
    : dir === 'right' ? x + w > ROOM - P.clearOfDoors
      : Math.abs(x + w / 2 - (door.col + 1)) < P.clearOfDoors / 2 + w / 2)

const crowds = (taken, spot) => taken.some(p =>
  Math.abs(p.x + p.w / 2 - spot.x - spot.w / 2) < (p.w + spot.w) / 2 + P.gap &&
  Math.abs(p.y + p.h / 2 - spot.y - spot.h / 2) < (p.h + spot.h) / 2 + P.gap)

const dropUnder = (world, { x, y, w, h }) => Math.min(...Array.from({ length: w }, (_, d) => {
  let fall = 0
  while (y + h + fall < ROOM && !props(matAt(world, x + d, y + h + fall)).solid) fall += 1
  return fall
}))

const onFloor = (world, { x, y, w, h }) =>
  Array.from({ length: w }, (_, d) => x + d).some(cx => [1, 2].some(k => props(matAt(world, cx, y + h - 1 + k)).solid))

const findSpot = (world, kind, doors, taken, low) => {
  const [w, h] = SIZES[kind] ?? [Math.random() < 0.5 ? 2 : 3, 2]
  const spots = []
  for (let y = 2; y <= ROOM - 3 - h; y++) {
    for (let x = 2; x <= ROOM - 2 - w; x++) {
      const spot = { x, y, w, h }
      if (!clear(world, spot) || !inView(world, spot) || crowds(taken, spot)) continue
      if (HEAVY.has(kind) && (nearDoor(doors, spot) || dropUnder(world, spot) < P.heavyDrop)) continue
      spots.push(spot)
    }
  }
  const liked = spots.filter(spot => onFloor(world, spot) === (low && !HEAVY.has(kind)))
  return liked.length ? pick(liked) : spots.length ? pick(spots) : null
}

const pickKind = (ring, region, relics, taken) => {
  const home = HOME[region] ?? []
  return weighted(Object.entries(P.kinds)
    .filter(([kind, k]) => k.ring <= ring && (kind !== 'alcove' || relics) && !taken.some(p => p.kind === kind))
    .map(([kind, k]) => [kind, (k.chance ?? 1) * (home.includes(kind) ? P.home : 1)]))
}

const makePocket = (kind, spot, ring, brood) => {
  const stock = between(P.kinds[kind].stock)
  const weeping = POURS[kind] && ring >= P.weepFrom && Math.random() < P.weeping
  return {
    kind, ...spot, stock, full: stock, crack: weeping ? P.seepAt + 0.05 : 0, open: false, stir: 0, due: 0,
    ...(kind === 'nest' ? { brood: brood(stock) } : {}),
  }
}

export const seedPockets = (world, { ring, region, doors, brood, relics, prefer = [] }) => {
  const [first, second] = P.count[Math.min(ring, P.count.length - 1)]
  const fits = prefer.filter(kind => P.kinds[kind].ring <= ring).slice(0, 2)
  const wanted = Math.max(fits.length, [first, second, ring >= 4 ? P.third : 0].filter(chance => Math.random() < chance).length)
  const pockets = []
  for (let n = 0; n < wanted; n++) {
    const kind = fits[n] ?? pickKind(ring, region, relics, pockets)
    const spot = kind && findSpot(world, kind, doors, pockets, n % 2 === 0)
    if (spot) pockets.push(makePocket(kind, spot, ring, brood))
  }
  return pockets
}

export const pocketAt = (world, x, y) => (world.pockets ?? []).find(p => !p.open && covers(p, x, y)) ?? null

const rubble = (g, pocket, count) => {
  const { x, y } = middle(pocket)
  chipsAt(g, x * BLOCK, y * BLOCK, M.ROCK, count)
  dustAt(g, x * BLOCK, y * BLOCK, Math.ceil(count / 2))
}

const breach = (g, pocket, hooks) => {
  pocket.open = true
  pocket.crack = 1
  tallyRule(g.world, 'breach', POCKET_KINDS.indexOf(pocket.kind))
  rubble(g, pocket, 10)
  g.shake = Math.max(g.shake, 3)
  g.pulse = Math.max(g.pulse, 0.25)
  if (pocket.kind === 'alcove' && hooks.chest(g, pocket)) pocket.stock = 0
}

const blow = (g, pocket, by) => {
  const { x, y } = middle(pocket)
  const w = g.world
  pocket.by = by
  pocket.open = true
  pocket.crack = 1
  pocket.stock = 0
  tallyRule(w, 'breach', POCKET_KINDS.indexOf(pocket.kind))
  for (const [cx, cy] of footprint(pocket)) {
    if (!isOpen(matAt(w, cx, cy))) continue
    setCell(w, cx, cy, M.METHANE, props(M.METHANE).startLife)
    ignite(w, cx, cy)
  }
  explode(w, Math.floor(x), Math.floor(y), P.gasBlast)
  rubble(g, pocket, 14)
}

const beamed = (g, pocket) => g.effects.some(f => f.kind === 'beam' && (f.segments ?? []).some(([a, b]) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  for (let d = 0; d <= length; d += 4) {
    const t = length ? d / length : 0
    if (covers(pocket, Math.floor((a.x + (b.x - a.x) * t) / BLOCK), Math.floor((a.y + (b.y - a.y) * t) / BLOCK))) return true
  }
  return false
}))

const dug = (g, pocket) => g.enemies.some(e => e.kind === 'worm' && !e.friendly &&
  gapTo(pocket, Math.floor((e.x + e.w / 2) / BLOCK), Math.floor((e.y + e.h / 2) / BLOCK)) === 0)

const HEATED = {
  marsh: (g, pocket) => blow(g, pocket, 'heat'),
  tar: (g, pocket) => { pocket.lit = true },
  rime: (g, pocket) => { pocket.melted = true },
  nest: (g, pocket, step) => { pocket.stir += step * 2 },
}

const feel = (g, pocket, step) => {
  const w = g.world
  let heat = false
  let lava = false
  let charge = false
  let crush = false
  let acid = 0
  const own = POURS[pocket.kind]
  for (let y = pocket.y - 1; y <= pocket.y + pocket.h; y++) {
    for (let x = pocket.x - 1; x <= pocket.x + pocket.w; x++) {
      if (x < 0 || y < 0 || x >= ROOM || y >= ROOM) continue
      const i = y * ROOM + x
      const m = w.mat[i]
      if (w.burn[i] > 0) heat = true
      if (m === M.LAVA && own !== M.LAVA) lava = true
      if (w.charge[i] > 0) charge = true
      if (covers(pocket, x, y) && w.crushing[i] && m !== own && !props(m).slides) crush = true
      if (m !== M.ACID || pocket.open) continue
      acid += 1
      if (Math.random() < P.acidSpent) setCell(w, x, y, M.EMPTY)
    }
  }
  heat ||= beamed(g, pocket)
  if ((heat || lava) && HEATED[pocket.kind]) HEATED[pocket.kind](g, pocket, step)
  if (pocket.open) return
  if (charge && pocket.kind === 'marsh') {
    blow(g, pocket, 'charge')
    return
  }
  const digging = dug(g, pocket)
  const causes = [
    ['heat', heat ? P.heatCrack * step : 0],
    ['lava', lava ? P.lavaCrack * step : 0],
    ['dig', digging ? P.digCrack * step : 0],
    ['acid', acid * P.acidCrack * step],
    ['charge', charge && pocket.kind === 'seam' ? P.chargeCrack * step : 0],
    ['crush', crush ? P.crushCrack : 0],
  ].filter(([, amount]) => amount > 0)
  for (const [cause, amount] of causes) crackBy(pocket, cause, amount)
}

const crackBy = (pocket, cause, amount) => {
  pocket.crack += amount
  pocket.by = cause
}

const stir = (g, pocket, dt) => {
  if (pocket.kind !== 'nest' || pocket.open || !g.player) return
  const p = g.player
  const near = gapTo(pocket, (p.x + p.w / 2) / BLOCK, (p.y + p.h / 2) / BLOCK) <= P.stirNear
  pocket.stir = clamp(pocket.stir + (near ? P.stirRate : -P.stirFade) * dt, 0, 1.2)
  if (pocket.stir >= 1) crackBy(pocket, 'stir', P.hatch * dt)
}

const freeCell = (w, pocket, rising) => {
  const rows = Array.from({ length: pocket.h }, (_, d) => (rising ? pocket.y + d : pocket.y + pocket.h - 1 - d))
  for (const y of rows) {
    for (const x of shuffled(Array.from({ length: pocket.w }, (_, d) => pocket.x + d))) {
      const m = matAt(w, x, y)
      if (rising ? m === M.EMPTY : isOpen(m)) return [x, y]
    }
  }
  return null
}

const pourMatter = (g, pocket) => {
  const w = g.world
  const mat = pocket.melted ? M.WATER : pocket.kind === 'rime' && pocket.stock % 3 === 0 ? M.SNOW : POURS[pocket.kind]
  const spots = pocket.melted ? P.thawShare : 1
  let placed = false
  for (let n = 0; n < spots; n++) {
    const spot = freeCell(w, pocket, props(mat).gas === true)
    if (!spot) break
    setCell(w, spot[0], spot[1], mat, props(mat).startLife ?? 0)
    if (pocket.lit) ignite(w, spot[0], spot[1])
    placed = true
  }
  return placed
}

const pourOre = (g, pocket) => {
  const spot = freeCell(g.world, pocket, false)
  if (!spot) return false
  const [x, y] = spot
  if (pocket.stock % P.scrapEvery === 0) setCell(g.world, x, y, M.SCRAP)
  else g.pickups.push({ kind: 'coin', x: x * BLOCK + 2, y: y * BLOCK + 2, w: 5, h: 5, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 50 })
  return true
}

const hatch = (g, pocket, hooks) => {
  const { x, y } = middle(pocket)
  const kind = pocket.brood?.[pocket.stock - 1] ?? 'crawler'
  if (!hooks.foe(g, kind, x * BLOCK, y * BLOCK)) return false
  rubble(g, pocket, 4)
  return true
}

const EMIT = {
  seam: pourOre,
  nest: hatch,
  alcove: (g, pocket, hooks) => hooks.chest(g, pocket),
}

const flow = (g, pocket, dt, hooks) => {
  const seeping = !pocket.open && pocket.crack >= P.seepAt
  if (!pocket.open && !seeping) return
  pocket.due += P.kinds[pocket.kind].rate * dt * (pocket.open ? 1 : P.seepShare)
  const emit = EMIT[pocket.kind] ?? pourMatter
  while (pocket.due >= 1 && pocket.stock > 0) {
    if (!emit(g, pocket, hooks)) {
      pocket.due = 0
      return
    }
    pocket.due -= 1
    pocket.stock -= 1
  }
}

const senses = new WeakMap()

export const stepPockets = (g, dt, hooks) => {
  const w = g.world
  if (!w.pockets?.length) return
  const clock = (senses.get(w) ?? 0) + dt * P.senseRate
  const ticks = Math.floor(clock)
  senses.set(w, clock - ticks)
  for (const pocket of w.pockets) {
    if (pocket.stock <= 0) continue
    if (ticks > 0) feel(g, pocket, ticks / P.senseRate)
    stir(g, pocket, dt)
    if (!pocket.open && pocket.crack >= 1) breach(g, pocket, hooks)
    flow(g, pocket, dt, hooks)
  }
}

export const blastPockets = (g, { x, y, reach }) => {
  for (const pocket of g.world.pockets ?? []) {
    if (pocket.stock <= 0) continue
    const gap = gapTo(pocket, x, y)
    if (gap <= reach + P.blastNear) {
      if (pocket.kind === 'marsh') blow(g, pocket, 'blast')
      else if (!pocket.open) crackBy(pocket, 'blast', Math.max(0, 1 - pocket.crack))
    } else if (pocket.kind === 'nest' && !pocket.open && gap <= reach + P.stirReach) pocket.stir += P.stirBlast
  }
}

export const strikePocket = (g, x, y) => {
  const pocket = pocketAt(g.world, x, y)
  if (!pocket || pocket.stock <= 0) return false
  crackBy(pocket, 'hammer', P.hammerCrack)
  if (pocket.kind === 'nest') pocket.stir += P.stirBlast
  rubble(g, pocket, 5)
  return true
}

const KIND_ID = Object.fromEntries(POCKET_KINDS.map((kind, i) => [kind, i + 1]))

export const pocketUniforms = (world, boxes, states) => {
  boxes.fill(0)
  states.fill(0)
  ;(world?.pockets ?? []).slice(0, POCKET_SLOTS).forEach((p, i) => {
    boxes.set([p.x * BLOCK, p.y * BLOCK, p.w * BLOCK, p.h * BLOCK], i * 4)
    const level = p.open ? p.stock / Math.max(1, p.full) : p.kind === 'nest' ? Math.min(1, p.stir) : 0
    states.set([KIND_ID[p.kind], Math.min(1, p.crack), p.open ? 1 : 0, level], i * 4)
  })
}
