import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { bake, energize, explode, ignite, matAt, puff, setCell, shatter, tallyRule } from './world.js'
import { WORLD_PX, cell, cellsUnder, centre, forEachCell, hitsSolid, inCone, overlap } from './physics.js'
import { burst, hurt } from './combat.js'
import { chunks } from './feel.js'
import { chipsAt } from './fx.js'
import { shotBox } from './cast.js'
import { feedEvent } from './feed.js'

const S = TUNING.skills

const form = (id, name, text, tint) => ({ id, name, text, tint })

const FIRE = '#ff9a2e'
const CHARGE = '#ffe84a'
const MAGNET = '#6fd0ff'
const COLD = '#bff2ff'
const GAS = '#c79ae0'
const ACID = '#8ae04a'
const STONE = '#c9d4c0'
const BLOOD = '#ff5a4a'
const WHITE = '#f4f8f2'

export const FORKS = {
  bolt: [
    [form('bolt.globe', 'GLOBE', 'A BALL OF LIGHTNING THAT DRIFTS', MAGNET), form('bolt.nail', 'NAIL', 'STICKS, LIGHTNING STRIKES IT', WHITE)],
    [form('bolt.leyden', 'LEYDEN', 'HOLD TO STORE BOLTS, RELEASE TO FIRE ALL', CHARGE), form('bolt.split', 'SPLIT', 'TURNS WATER TO GAS', GAS)],
  ],
  repel: [
    [form('repel.orbit', 'ORBIT', 'SCRAP CIRCLES YOU', STONE), form('repel.lode', 'LODE', 'PULLS INSTEAD OF PUSHING', BLOOD)],
    [form('repel.salvage', 'SALVAGE', 'KILLS LEAVE SCRAP', MAGNET), form('repel.shrapnel', 'SHRAPNEL', 'THROWN SCRAP EXPLODES', FIRE)],
  ],
  ember: [
    [form('ember.napalm', 'NAPALM', 'SPILLS BURNING OIL', GAS), form('ember.wisp', 'WISP', 'CRAWLS TOWARDS THINGS THAT BURN', MAGNET)],
    [form('ember.jet', 'JET', 'HOLD FOR A STREAM OF FIRE', WHITE), form('ember.torch', 'TORCH', 'BURNING FOES SET OTHERS ALIGHT', BLOOD)],
  ],
  frost: [
    [form('frost.floe', 'FLOE', 'AN ICE BLOCK THAT FALLS AND FLOATS', MAGNET), form('frost.glide', 'GLIDE', 'ICE FORMS UNDERFOOT', WHITE)],
    [form('frost.shatter', 'SHATTER', 'FROZEN FOES BLOW UP', FIRE), form('frost.brittle', 'BRITTLE', 'FROZEN ROCK CRUMBLES', STONE)],
  ],
  hammer: [
    [form('hammer.hurl', 'HURL', 'THROW IT, IT COMES BACK', MAGNET), form('hammer.slam', 'SLAM', 'PRESS DOWN IN THE AIR TO SLAM', BLOOD)],
    [form('hammer.tremor', 'TREMOR', 'BLOCKS ABOVE FALL', STONE), form('hammer.fuse', 'FUSE', 'HITS LEAVE A BOMB', FIRE)],
  ],
  gust: [
    [form('gust.siphon', 'SIPHON', 'PULLS IN, THEN BLOWS OUT', GAS), form('gust.twister', 'TWISTER', 'A WHIRLWIND THAT MOVES ALONG', WHITE)],
    [form('gust.kite', 'KITE', 'HOLD TO FLY', COLD), form('gust.squall', 'SQUALL', 'BLOWS LIQUIDS TOO', MAGNET)],
  ],
  blink: [
    [form('blink.anchor', 'ANCHOR', 'PRESS AGAIN TO RETURN', GAS), form('blink.trade', 'TRADE', 'SWAPS PLACES WITH BLOCKS TOO', STONE)],
    [form('blink.lance', 'LANCE', 'HURTS FOES ALONG THE PATH', CHARGE), form('blink.ghost', 'GHOST', 'LEAVES A DECOY', MAGNET)],
  ],
  grapple: [
    [form('grapple.yank', 'YANK', 'TEARS OUT BLOCKS', STONE), form('grapple.tether', 'TETHER', 'TIES TWO THINGS TOGETHER', GAS)],
    [form('grapple.sling', 'SLING', 'HOLD TO SWING, RELEASE TO LET GO', WHITE), form('grapple.catch', 'CATCH', 'GRABS A FOE. PRESS AGAIN TO THROW IT', BLOOD)],
  ],
  dash: [
    [form('dash.ram', 'RAM', 'SMASHES THROUGH BLOCKS', STONE), form('dash.tackle', 'TACKLE', 'CARRIES A FOE', BLOOD)],
    [form('dash.drive', 'DRIVE', 'HOLD TO KEEP DASHING', FIRE), form('dash.carom', 'CAROM', 'BOUNCES OFF WALLS', MAGNET)],
  ],
  rewind: [
    [form('rewind.epoch', 'EPOCH', 'THE ROOM GOES BACK TOO', GAS), form('rewind.wraith', 'WRAITH', 'A COPY OF YOU REPEATS YOUR MOVES', MAGNET)],
    [form('rewind.undo', 'UNDO', 'ALSO RESTORES LOST HEARTS', BLOOD), form('rewind.relive', 'RELIVE', 'RECHARGES YOUR OTHER SKILLS', WHITE)],
  ],
  mason: [
    [form('mason.cage', 'CAGE', 'WALLS IN A FOE', BLOOD), form('mason.span', 'SPAN', 'BUILDS UNTIL IT HITS A WALL', WHITE)],
    [form('mason.iron', 'IRON', 'BUILDS METAL', MAGNET), form('mason.rubble', 'RUBBLE', 'BLOCKS FALL AND CRUSH', STONE)],
  ],
  seed: [
    [form('seed.bough', 'BOUGH', 'GROWS A WOODEN BRIDGE', FIRE), form('seed.flytrap', 'FLYTRAP', 'EATS FOES AND SPITS THEM OUT', BLOOD)],
    [form('seed.thorns', 'THORNS', 'VINES HURT FOES', STONE), form('seed.tinder', 'TINDER', 'BURNING VINES EXPLODE', CHARGE)],
  ],
  spring: [
    [form('spring.geyser', 'GEYSER', 'A WATER JET THAT LIFTS YOU', WHITE), form('spring.font', 'FONT', 'LEAVES A SPRING THAT KEEPS FLOWING', STONE)],
    [form('spring.oil', 'OILWELL', 'POURS OIL', GAS), form('spring.slush', 'SLUSH', 'THE WATER FREEZES', COLD)],
  ],
  acid: [
    [form('acid.bore', 'BORE', 'EATS A STRAIGHT TUNNEL', WHITE), form('acid.rain', 'RAIN', 'A CLOUD THAT RAINS', GAS)],
    [form('acid.rust', 'RUST', 'METAL ROTS TO SCRAP', FIRE), form('acid.ferment', 'FERMENT', 'DISSOLVED BLOCKS TURN TO GAS', CHARGE)],
  ],
  melt: [
    [form('melt.slag', 'SLAG', 'LOBS LAVA THAT SETS', STONE), form('melt.fissure', 'FISSURE', 'SPLITS THE FLOOR', BLOOD)],
    [form('melt.forge', 'FORGE', 'MELTS METAL TOO', MAGNET), form('melt.flash', 'FLASH', 'TURNS WATER TO STEAM', WHITE)],
  ],
  alchemy: [
    [form('alchemy.transmute', 'TRANSMUTE', 'CHANGES SOLIDS TOO', STONE), form('alchemy.render', 'RENDER', 'TURNS WEAK FOES INTO MATERIAL', BLOOD)],
    [form('alchemy.vapour', 'VAPOUR', 'SMOKE BECOMES MARSH GAS', GAS), form('alchemy.contagion', 'CONTAGION', 'CHANGES SPREAD TO TOUCHING CELLS', ACID)],
  ],
  well: [
    [form('well.rogue', 'ROGUE', 'A DRIFTING BLACK HOLE', BLOOD), form('well.nova', 'NOVA', 'PUSHES EVERYTHING AWAY', WHITE)],
    [form('well.grind', 'GRINDER', 'HURTS FOES AT ITS CENTRE', STONE), form('well.lodestone', 'LODESTONE', 'DRAWS SAND, GAS, WATER', MAGNET)],
  ],
  swap: [
    [form('swap.shuffle', 'SHUFFLE', 'ALL FOES TRADE PLACES', GAS), form('swap.goat', 'SCAPEGOAT', 'OTHER FOES ATTACK IT', BLOOD)],
    [form('swap.recall', 'RECALL', 'PRESS AGAIN TO SWAP BACK', MAGNET), form('swap.ground', 'GROUND', 'THE GROUND UNDER YOU SWAPS TOO', STONE)],
  ],
  stop: [
    [form('stop.still', 'STILL', 'STOPS ONLY BLOCKS AND LIQUIDS', COLD), form('stop.hold', 'HOLD', 'STOPS ONLY FOES', GAS)],
    [form('stop.hang', 'HANG', 'SHOTS HANG UNTIL TIME RESTARTS', WHITE), form('stop.quake', 'QUAKE', 'BREAKS ICE WHEN TIME RESTARTS', BLOOD)],
  ],
  charm: [
    [form('charm.plague', 'PLAGUE', 'CHARM SPREADS TO FOES IT TOUCHES', ACID), form('charm.lure', 'LURE', 'ALL FOES CHASE IT', BLOOD)],
    [form('charm.pact', 'PACT', 'KILLS RESET ITS CHARM TIME', WHITE), form('charm.bond', 'BOND', 'CHARMED FOE TAKES YOUR HITS', MAGNET)],
  ],
  decoy: [
    [form('decoy.clone', 'CLONE', 'COPIES YOUR GUN', MAGNET), form('decoy.runner', 'RUNNER', 'RUNS OFF, FOES FOLLOW IT', WHITE)],
    [form('decoy.double', 'DOUBLE', 'PRESS AGAIN TO SWAP WITH THE DECOY', STONE), form('decoy.gas', 'GASBAG', 'LEAKS MARSH GAS', GAS)],
  ],
  drone: [
    [form('drone.sapper', 'SAPPER', 'CHASES A FOE, THEN EXPLODES', BLOOD), form('drone.mole', 'MOLE', 'CHEWS THROUGH ROCK', STONE)],
    [form('drone.magpie', 'MAGPIE', 'BRINGS YOU COINS', CHARGE), form('drone.sentry', 'SENTRY', 'STAYS IN PLACE, SHOOTS FAST', MAGNET)],
  ],
  rod: [
    [form('rod.magnet', 'MAGNET', 'DRAWS METAL AND FOES', BLOOD), form('rod.fence', 'FENCE', 'CHARGE ARCS BETWEEN TWO RODS', CHARGE)],
    [form('rod.arcs', 'ARCS', 'ZAPS NEARBY FOES', WHITE), form('rod.earth', 'EARTH', 'CHARGES THE FLOOR', STONE)],
  ],
  mine: [
    [form('mine.limpet', 'LIMPET', 'STICKS TO FOES', BLOOD), form('mine.wire', 'TRIPWIRE', 'A TRIPWIRE ACROSS A GAP', WHITE)],
    [form('mine.gas', 'GASMINE', 'BURSTS INTO MARSH GAS', GAS), form('mine.cryo', 'CRYO', 'FREEZES INSTEAD OF EXPLODING', COLD)],
  ],
  roar: [
    [form('roar.shout', 'SHOUT', 'SENDS A SHOCKWAVE FORWARD', WHITE), form('roar.crack', 'CRACK', 'SHATTERS ROCK', STONE)],
    [form('roar.swell', 'SWELL', 'HOLD FOR A BIGGER ROAR', BLOOD), form('roar.rime', 'RIME', 'ALSO FREEZES WHAT IT HITS', COLD)],
  ],
  mirror: [
    [form('mirror.pane', 'PANE', 'LEAVES A MIRROR STANDING', COLD), form('mirror.maw', 'MAW', 'TAKES IN SHOTS, THEN FIRES THEM BACK', BLOOD)],
    [form('mirror.parry', 'PARRY', 'SHORTER. EACH RETURNED SHOT RECHARGES IT', WHITE), form('mirror.seek', 'SEEK', 'RETURNED SHOTS CHASE FOES', BLOOD)],
  ],
  lens: [
    [form('lens.prism', 'PRISM', 'GLASS SPLITS THE BEAM IN THREE', MAGNET), form('lens.glance', 'GLANCE', 'BOUNCES OFF METAL', STONE)],
    [form('lens.kiln', 'KILN', 'TURNS ROCK AND BRICK TO GLASS', FIRE), form('lens.dazzle', 'DAZZLE', 'STUNS FOES INSTEAD OF BURNING THEM', WHITE)],
  ],
  chime: [
    [form('chime.volley', 'VOLLEY', 'SHARDS FLY AT FOES ONE BY ONE', BLOOD), form('chime.hover', 'HOVER', 'SHARDS HANG IN THE AIR UNTIL A FOE COMES NEAR', GAS)],
    [form('chime.bell', 'BELL', 'WALLS YOU IN GLASS. PRESS AGAIN TO BREAK IT', COLD), form('chime.statue', 'STATUE', 'FOES KILLED BY ITS SHARDS TURN TO GLASS', WHITE)],
  ],
}

export const TREES = Object.fromEntries(Object.entries(FORKS).map(([kind, forks]) => [kind, forks.flat()]))

export const owns = (p, id) => p.upgrades.has(id)
const ownedForms = (p, kind) => TREES[kind].filter(f => owns(p, f.id))

export const openFork = (p, kind) => FORKS[kind].find(fork => !fork.some(f => owns(p, f.id))) ?? []

export const formOf = (p, kind) => {
  const taken = ownedForms(p, kind)
  const last = taken.at(-1)
  return { name: last?.name ?? kind.toUpperCase(), tint: last?.tint ?? null, stage: taken.length }
}

export const cooldownOf = (p, kind) => {
  const { every, forms = {} } = S[kind]
  return Math.max(every, ...ownedForms(p, kind).map(f => forms[f.id] ?? 0))
}

const TAP = { type: 'tap' }

const HANDS = {
  dash: { type: 'stock', most: S.dash.stock },
  mason: { type: 'stock', most: S.mason.stock },
  mine: { type: 'stock', most: S.mine.stock },
  'bolt.leyden': { type: 'swell', time: S.bolt.leydenTime },
  'roar.swell': { type: 'swell', time: S.roar.swellTime },
  'ember.jet': { type: 'stream', time: S.ember.jetTime },
  'gust.kite': { type: 'stream', time: S.gust.kiteTime },
  'dash.drive': { type: 'stream', time: S.dash.driveTime },
  'grapple.sling': { type: 'stream', time: S.grapple.slingTime },
  'frost.glide': { type: 'toggle', time: S.frost.glideTime },
  lens: { type: 'stream', time: S.lens.time },
}

export const handOf = (p, kind) => ownedForms(p, kind).map(f => HANDS[f.id]).filter(Boolean).at(-1) ?? HANDS[kind] ?? TAP

export const FREE = Symbol('free')

export const spend = (p, kind) => p.skills.filter(s => s.kind === kind).forEach(s => { s.ready = cooldownOf(p, kind) })

const hue = (p, kind, base) => formOf(p, kind).tint ?? base

export const hostile = g => g.enemies.filter(e => !e.friendly && !e.ally)

export const muzzle = p => ({ x: p.x + p.w / 2, y: p.y + (p.crouching ? 5 : 8) })

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const towards = (from, to) => {
  const d = Math.max(1, distance(from, to))
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d }
}
const nearestTo = (list, point, reach = Infinity) => list
  .map(e => [distance(centre(e), point), e])
  .filter(([d]) => d < reach)
  .sort((a, b) => a[0] - b[0])[0]?.[1]

const sparkle = (g, from, aim, colour, count = 14) => {
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 0.9
    const speed = 90 + Math.random() * 120
    g.particles.push({
      x: from.x, y: from.y,
      vx: (aim.x + spread * aim.y) * speed,
      vy: (aim.y - spread * aim.x) * speed,
      life: 0.3, colour,
    })
  }
}

export const ring = (g, x, y, colour, count = 20, speed = 90) => {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    g.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.35, colour })
  }
}

const ray = (g, from, aim, reach, stopAtLiquid = false) => {
  let { x, y } = from
  let last = { x, y }
  for (let travelled = 0; travelled < reach; travelled += 2) {
    last = { x, y }
    x += aim.x * 2
    y += aim.y * 2
    const struck = g.enemies.find(e => overlap(shotBox(e), { x, y, w: 1, h: 1 }))
    const m = matAt(g.world, cell(x), cell(y))
    if (struck) return { x, y, last, struck, m }
    if (props(m).solid || (stopAtLiquid && props(m).liquid)) return { x, y, last, solid: true, m }
  }
  return { x, y, last, m: matAt(g.world, cell(x), cell(y)) }
}

const addEffect = (g, effect) => g.effects.push({ age: 0, ...effect })

const lineCells = (from, to, visit) => {
  const length = distance(from, to)
  for (let d = 0; d < length; d += BLOCK / 2) visit(cell(from.x + ((to.x - from.x) * d) / length), cell(from.y + ((to.y - from.y) * d) / length))
}

const onSegment = (e, a, b, margin = 2) => {
  const c = centre(e)
  const length = Math.max(1, distance(a, b))
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / length ** 2))
  return distance(c, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }) < Math.max(e.w, e.h) / 2 + margin
}

export const foesOnSegment = (g, a, b, margin) => hostile(g).filter(e => onSegment(e, a, b, margin))

const jagged = (from, to) => {
  const points = [from]
  const length = distance(from, to)
  for (let d = 10; d < length; d += 10) {
    const t = d / length
    points.push({
      x: from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 6,
      y: from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 6,
    })
  }
  points.push(to)
  return points
}

export const zap = (g, from, to, colour = 'charge') => g.bolts.push({ points: jagged(from, to), life: 0.2, colour })

const FLOW = [[0, -1], [1, 0], [0, 1], [-1, 0]]

const floodFrom = (w, x, y, mat, most) => {
  const seen = new Set()
  const queue = [[x, y]]
  const found = []
  while (queue.length && found.length < most) {
    const [cx, cy] = queue.shift()
    const key = cy * ROOM + cx
    if (seen.has(key) || matAt(w, cx, cy) !== mat) continue
    seen.add(key)
    found.push([cx, cy])
    FLOW.forEach(([dx, dy]) => queue.push([cx + dx, cy + dy]))
  }
  return found
}

const splitWater = (g, x, y) => floodFrom(g.world, x, y, M.WATER, S.bolt.splitCells).forEach(([cx, cy]) => setCell(g.world, cx, cy, M.METHANE, TUNING.world.offgasLife))

export const strike = (g, from, to) => {
  const p = g.player
  const colour = hue(p, 'bolt', 'charge')
  const energy = S.bolt.energy * (1 + g.depth / 2)
  zap(g, from, to, colour)
  const [x, y] = [cell(to.x), cell(to.y)]
  if (owns(p, 'bolt.split')) splitWater(g, x, y)
  const earth = [0, 1, 2, 3].find(down => props(matAt(g.world, x, y + down)).conductance) ?? 0
  energize(g.world, x, y + earth, energy)
  ignite(g.world, x, y)
  burst(g, to.x, to.y, colour, 8)
}

const strikesHeld = p => (owns(p, 'bolt.leyden') ? 1 + Math.floor(p.power * S.bolt.leydenMost) : 1)

const looseStored = (g, start, first, count) => {
  const taken = new Set([first.struck])
  for (let n = 1; n < count; n++) {
    const next = nearestTo(hostile(g).filter(e => !taken.has(e)), first, S.bolt.leydenReach)
    const to = next ? centre(next) : { x: first.x + (Math.random() - 0.5) * 60, y: first.y + (Math.random() - 0.5) * 60 }
    strike(g, start, to)
    if (next) {
      taken.add(next)
      next.iframes = 0
      hurt(g, next, 2, 'player')
      next.stun = Math.max(next.stun, 1)
    }
  }
  g.shake = Math.max(g.shake, count)
}

const bolt = (g, p) => {
  const start = muzzle(p)
  if (owns(p, 'bolt.globe')) {
    for (let n = 0; n < strikesHeld(p); n++) addEffect(g, { kind: 'globe', x: start.x, y: start.y, w: 6, h: 6, vx: (p.aim.x + (n ? Math.random() - 0.5 : 0)) * S.bolt.globeSpeed, vy: (p.aim.y + (n ? Math.random() - 0.5 : 0)) * S.bolt.globeSpeed, life: S.bolt.globeLife, clock: 0 })
    g.pulse = Math.max(g.pulse, 0.5)
    return
  }
  const hit = ray(g, start, p.aim, 340, true)
  strike(g, start, hit)
  if (hit.struck) {
    hurt(g, hit.struck, 2, 'player')
    hit.struck.stun = Math.max(hit.struck.stun, 1)
  }
  if (owns(p, 'bolt.nail')) addEffect(g, { kind: 'nail', x: hit.last.x, y: hit.last.y, target: hit.struck, life: S.bolt.nailLife, clock: S.bolt.nailEvery })
  looseStored(g, start, hit, strikesHeld(p))
  g.pulse = 1
}

const flungFrom = (p, extra) => ({
  w: 8, h: 8, age: 0,
  shrapnel: owns(p, 'repel.shrapnel'),
  ...extra,
})

const fling = (g, x, y, aim, speed, p, extra = {}) => {
  setCell(g.world, x, y, M.EMPTY)
  g.flung.push(flungFrom(p, { x: x * BLOCK, y: y * BLOCK, vx: aim.x * speed, vy: aim.y * speed - 40, ...extra }))
}

const zipTo = (g, p, point, speed) => {
  const c = centre(p)
  const d = Math.max(1, distance(point, c))
  p.vx = ((point.x - c.x) / d) * speed
  p.vy = ((point.y - c.y) / d) * speed
  p.jumpHeld = false
  p.zipping = d / speed
  p.drift = p.zipping + 0.15
}

const shoveAway = (g, p) => {
  const R = S.repel
  const from = muzzle(p)
  const covered = inCone(from, p.aim, R.reach, R.width)
  const near = inCone(from, p.aim, R.recoilReach, R.width)
  let recoil = false
  forEachCell((x, y, point) => {
    const m = matAt(g.world, x, y)
    if (m === M.METAL && near(point)) recoil = true
    if (m === M.SCRAP && covered(point)) fling(g, x, y, p.aim, R.fling, p)
  })
  for (const e of g.enemies) {
    if (!e.magnetic || !covered(centre(e))) continue
    e.vx = p.aim.x * R.shove * (e.heavy ? 0.3 : 1)
    e.vy = p.aim.y * R.shove - 60
    e.shoved = R.shoveTime
  }
  if (recoil) {
    p.vx = -p.aim.x * R.recoil
    p.vy = -p.aim.y * R.recoil
    p.jumpHeld = false
    p.drift = TUNING.player.drift
  }
  sparkle(g, from, p.aim, hue(p, 'repel', 'magnet'))
}

const gatherScrap = (g, p) => {
  const here = centre(p)
  const loose = []
  forEachCell((x, y, point) => { if (matAt(g.world, x, y) === M.SCRAP && distance(point, here) < S.repel.gather) loose.push([x, y, point]) })
  const taken = loose.sort((a, b) => distance(a[2], here) - distance(b[2], here)).slice(0, S.repel.orbitMost)
  taken.forEach(([x, y, point]) => {
    setCell(g.world, x, y, M.EMPTY)
    zap(g, here, point, 'magnet')
  })
  return taken.length
}

const orbit = (g, p) => {
  const held = g.effects.find(f => f.kind === 'orbit')
  if (held) {
    held.firing = true
    return
  }
  const count = gatherScrap(g, p)
  if (count > 0) addEffect(g, { kind: 'orbit', held: count, life: 999, clock: 0 })
  else shoveAway(g, p)
}

export const orbitFires = (g, p) => {
  const c = centre(p)
  g.flung.push(flungFrom(p, { x: c.x - 4 + p.aim.x * 10, y: c.y - 6 + p.aim.y * 10, vx: p.aim.x * S.repel.fling, vy: p.aim.y * S.repel.fling - 60, safe: true }))
  sparkle(g, c, p.aim, hue(p, 'repel', 'magnet'), 5)
}

const lode = (g, p) => {
  const R = S.repel
  const from = muzzle(p)
  const here = centre(p)
  const covered = inCone(from, p.aim, R.lodeReach, R.width * 1.5)
  forEachCell((x, y, point) => {
    if (matAt(g.world, x, y) === M.SCRAP && covered(point)) fling(g, x, y, towards(point, here), R.fling, p, { safe: true })
  })
  const caught = g.enemies.filter(e => e.magnetic && !e.heavy && covered(centre(e)))
  caught.forEach(e => {
    const pull = towards(centre(e), here)
    e.vx = pull.x * R.shove
    e.vy = pull.y * R.shove - 40
    e.shoved = R.shoveTime
  })
  const hit = ray(g, from, p.aim, R.lodeReach)
  if (hit.solid && (hit.m === M.METAL || hit.m === M.GATE) && caught.length === 0) {
    zap(g, from, hit, 'hurt')
    zipTo(g, p, hit.last, R.lodePull)
  }
  sparkle(g, { x: from.x + p.aim.x * 50, y: from.y + p.aim.y * 50 }, { x: -p.aim.x, y: -p.aim.y }, hue(p, 'repel', 'magnet'))
}

const repel = (g, p) => {
  if (owns(p, 'repel.orbit')) orbit(g, p)
  else if (owns(p, 'repel.lode')) lode(g, p)
  else shoveAway(g, p)
  g.pulse = Math.max(g.pulse, 0.6)
}

const lob = (g, p, aim, extra = {}) => {
  const from = muzzle(p)
  g.fireballs.push({
    x: from.x - 2, y: from.y - 2, w: 4, h: 4,
    vx: aim.x * S.ember.speed, vy: aim.y * S.ember.speed - S.ember.lift,
    age: 0, friendly: true, ...extra,
  })
}

export const setAblaze = (g, e) => {
  if (e.fireproof || e.heavy) return
  e.ablaze = S.ember.torchTime
  e.ablazeClock = 0
}

export const torchNear = (g, x, y, reach = 14) => hostile(g)
  .filter(e => distance(centre(e), { x, y }) < reach + e.w / 2)
  .forEach(e => setAblaze(g, e))

const looseWisp = (g, p) => {
  const from = muzzle(p)
  addEffect(g, { kind: 'wisp', x: from.x - 2, y: from.y - 2, w: 4, h: 4, vx: p.aim.x * S.ember.speed, vy: p.aim.y * S.ember.speed - S.ember.lift, dir: p.aim.x < 0 ? -1 : 1, life: S.ember.wispLife, clock: 0 })
}

const jetBlob = (g, p, count) => {
  if (owns(p, 'ember.wisp') && count % S.ember.jetWispEvery === 0) {
    looseWisp(g, p)
    return
  }
  const from = muzzle(p)
  const spread = (Math.random() - 0.5) * 0.25
  const aim = { x: p.aim.x + p.aim.y * spread, y: p.aim.y - p.aim.x * spread }
  lob(g, p, aim, { napalm: owns(p, 'ember.napalm') && count % S.ember.jetNapalmEvery === 0, vx: aim.x * S.ember.jetSpeed, vy: aim.y * S.ember.jetSpeed - S.ember.jetLift })
  g.particles.push({ x: from.x, y: from.y, vx: aim.x * 120, vy: aim.y * 120, life: 0.12, colour: WHITE })
}

const ember = (g, p) => {
  if (owns(p, 'ember.jet')) jetBlob(g, p, 1)
  else if (owns(p, 'ember.wisp')) looseWisp(g, p)
  else lob(g, p, p.aim, { napalm: owns(p, 'ember.napalm'), torch: owns(p, 'ember.torch') })
  g.pulse = Math.max(g.pulse, 0.3)
}

const freezeFoe = (g, p, e) => {
  e.stun = Math.max(e.stun, S.frost.freeze)
  e.frozen = S.frost.freeze
  e.shatters = owns(p, 'frost.shatter')
}

const chill = (g, p, x, y, freezesWater = true) => {
  const m = matAt(g.world, x, y)
  if (m === M.WATER && freezesWater) {
    g.world.notes?.add(`freeze:${M.WATER}`)
    setCell(g.world, x, y, M.ICE)
  } else if (m === M.LAVA) {
    g.world.notes?.add(`cool:${M.LAVA}`)
    setCell(g.world, x, y, M.ROCK)
  } else if (g.world.burn[y * ROOM + x] > 0) g.world.burn[y * ROOM + x] = 0
  else if (m === M.STEAM) setCell(g.world, x, y, M.WATER)
  else if (m === M.ROCK && owns(p, 'frost.brittle') && Math.random() < 0.5) setCell(g.world, x, y, M.SAND)
}

const frostCone = (g, p) => {
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.frost.reach, S.frost.width)
  forEachCell((x, y, point) => { if (covered(point)) chill(g, p, x, y) })
  for (const e of g.enemies) if (!e.friendly && covered(centre(e))) freezeFoe(g, p, e)
  sparkle(g, from, p.aim, hue(p, 'frost', 'frost'), 20)
}

const frost = (g, p) => {
  if (owns(p, 'frost.floe')) {
    thrown(g, p, p.aim, 'floe', { speed: S.frost.floeSpeed, lift: S.frost.floeLift, size: 8, colour: COLD, splashes: true })
  } else {
    frostCone(g, p)
    if (owns(p, 'frost.glide') && !g.effects.some(f => f.kind === 'glide')) addEffect(g, { kind: 'glide', life: 999 })
  }
  g.pulse = Math.max(g.pulse, 0.4)
}

export const thrown = (g, p, aim, lands, { speed, lift = 0, gravity = TUNING.fireball.gravity, size = 4, colour = WHITE, splashes = false }) => {
  const from = muzzle(p)
  addEffect(g, { kind: 'thrown', lands, x: from.x - size / 2, y: from.y - size / 2, w: size, h: size, vx: aim.x * speed, vy: aim.y * speed - lift, gravity, colour, splashes, life: 5 })
}

export const BREAKS = new Set([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.ICE, M.FLOE, M.RIME, M.SAND, M.VOLATILE, M.BRICK, M.SCRAP, M.VINE, M.GLASS, M.SNOW])

const shatterFrom = (g, x, y) => shatter(g.world, x, y, cell(centre(g.player).x), cell(centre(g.player).y))

export const quake = (g, count, power = 6) => {
  const loose = []
  forEachCell((x, y) => {
    const m = matAt(g.world, x, y)
    if ((m === M.PEAT || m === M.ROCK) && matAt(g.world, x, y + 1) === M.EMPTY && y < 26) loose.push([x, y])
  })
  for (let i = 0; i < count && loose.length; i++) {
    const [x, y] = loose.splice(Math.floor(Math.random() * loose.length), 1)[0]
    setCell(g.world, x, y, M.SAND)
  }
  g.shake = Math.max(g.shake, power)
}

export const smash = (g, x, y) => {
  const m = matAt(g.world, x, y)
  if (m === M.VOLATILE) ignite(g.world, x, y)
  else if (m === M.ROCK) setCell(g.world, x, y, M.SAND)
  else if (!shatterFrom(g, x, y) && BREAKS.has(m)) setCell(g.world, x, y, M.EMPTY)
  chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, m, 7)
  if (BREAKS.has(m)) feedEvent(g, 'smashed', (x + 0.5) * BLOCK, (y + 0.5) * BLOCK)
  return BREAKS.has(m)
}

const loosenColumn = (g, x, y) => {
  for (let up = 1; up <= S.hammer.tremorHeight; up++) {
    const m = matAt(g.world, x, y - up)
    if (m === M.BEDROCK || m === M.EMPTY) break
    if (m === M.ROCK || m === M.PEAT || m === M.MOSS || m === M.BRICK) setCell(g.world, x, y - up, M.SAND)
  }
  g.shake = Math.max(g.shake, 5)
}

const stickFuse = (g, at) => addEffect(g, { kind: 'fuse', life: S.hammer.fuseTime, ...at })

export const hammerLands = (g, p, x, y, foe) => {
  if (owns(p, 'hammer.tremor') && !foe) loosenColumn(g, x, y)
  if (owns(p, 'hammer.fuse')) stickFuse(g, foe ? { rider: foe, x: foe.x, y: foe.y } : { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK })
}

export const hammerStrikes = (g, p, e, aim) => {
  hurt(g, e, 2, 'player')
  e.vx = aim.x * 160
  e.vy = aim.y * 160 - 60
  e.shoved = 0.3
}

const hammer = (g, p) => {
  const from = muzzle(p)
  if (owns(p, 'hammer.hurl')) {
    if (g.effects.some(f => f.kind === 'hurl')) return
    addEffect(g, { kind: 'hurl', x: from.x, y: from.y, aim: p.aim, life: 999, out: true, travelled: 0, landed: false })
    return
  }
  const bodyHigh = Math.abs(p.aim.x) > Math.abs(p.aim.y) && !p.crouching ? 1 : 0
  let broke = null
  for (let reach = 1; reach <= S.hammer.reach; reach++) {
    const x = cell(from.x + p.aim.x * reach * BLOCK)
    const y = cell(from.y + p.aim.y * reach * BLOCK)
    if (smash(g, x, y)) broke ??= [x, y]
    if (bodyHigh && smash(g, x, y + 1)) broke ??= [x, y + 1]
  }
  const covered = inCone(from, p.aim, (S.hammer.reach + 1) * BLOCK, BLOCK)
  const struck = g.enemies.filter(e => covered(centre(e)))
  struck.forEach(e => hammerStrikes(g, p, e, p.aim))
  if (struck[0] || broke) hammerLands(g, p, broke?.[0], broke?.[1], struck[0])
  if (owns(p, 'hammer.slam') && !p.grounded && p.aim.y > 0) {
    p.vy = 320
    p.slam = true
  }
  g.shake = Math.max(g.shake, 3)
}

export const landSlam = (g, p) => {
  const [x, y] = [cell(p.x + 3), cell(p.y + p.h + 2)]
  explode(g.world, x, y, 1)
  if (owns(p, 'hammer.tremor')) [-2, -1, 0, 1, 2].forEach(dx => loosenColumn(g, x + dx, y))
  if (owns(p, 'hammer.fuse')) stickFuse(g, { x: x * BLOCK, y: (y - 1) * BLOCK })
  ring(g, p.x + 3, p.y + p.h, BLOOD, 22, 110)
  p.iframes = Math.max(p.iframes, 0.3)
}

const GASES = [M.SMOKE, M.STEAM, M.METHANE, M.ASH]
const LIQUIDS = [M.WATER, M.OIL, M.ACID]

const blowable = p => new Set(owns(p, 'gust.squall') ? [...GASES, ...LIQUIDS] : GASES)

const relocate = (w, x, y, nx, ny) => {
  const a = y * ROOM + x
  const b = ny * ROOM + nx
  for (const f of [w.mat, w.burn, w.charge, w.refractory, w.life]) {
    f[b] = f[a]
    f[a] = 0
  }
}

export const blowCell = (g, x, y, dx, dy, steps = 5) => {
  let moved = 0
  while (moved < steps && matAt(g.world, x + dx * (moved + 1), y + dy * (moved + 1)) === M.EMPTY) moved++
  if (moved) relocate(g.world, x, y, x + dx * moved, y + dy * moved)
}

const gustCone = (g, p) => {
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.gust.reach, S.gust.width)
  const moving = blowable(p)
  const moved = []
  forEachCell((x, y, point) => {
    if (covered(point) && moving.has(matAt(g.world, x, y))) moved.push([x, y])
  })
  moved.sort((a, b) => (b[0] * p.aim.x + b[1] * p.aim.y) - (a[0] * p.aim.x + a[1] * p.aim.y))
  const dx = Math.round(p.aim.x)
  const dy = Math.round(p.aim.y)
  moved.forEach(([x, y]) => blowCell(g, x, y, dx, dy))
  forEachCell((x, y, point) => {
    if (!covered(point) || g.world.burn[y * ROOM + x] <= 0) return
    ignite(g.world, x + dx, y + dy)
  })
  for (const e of g.enemies) {
    if (!covered(centre(e)) || e.heavy) continue
    e.vx = p.aim.x * S.gust.shove
    e.vy = p.aim.y * S.gust.shove - 40
    e.shoved = 0.35
  }
  for (const f of g.fireballs) {
    if (!covered(centre(f))) continue
    f.vx = p.aim.x * 180
    f.vy = p.aim.y * 180 - 40
    f.friendly = true
    f.age = 0
  }
  sparkle(g, from, p.aim, hue(p, 'gust', 'white'), 18)
}

const inhale = (g, p) => {
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.gust.reach, S.gust.width)
  const moving = blowable(p)
  const held = p.lungs ?? []
  forEachCell((x, y, point) => {
    if (held.length >= S.gust.lungs || !covered(point) || !moving.has(matAt(g.world, x, y))) return
    held.push({ mat: matAt(g.world, x, y), life: g.world.life[y * ROOM + x] })
    g.particles.push({ x: point.x, y: point.y, vx: (from.x - point.x) * 3, vy: (from.y - point.y) * 3, life: 0.3, colour: GAS })
    setCell(g.world, x, y, M.EMPTY)
  })
  p.lungs = held
  return held.length > 0
}

const exhale = (g, p) => {
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.gust.reach, S.gust.width)
  const spots = []
  forEachCell((x, y, point) => { if (covered(point) && matAt(g.world, x, y) === M.EMPTY) spots.push([x, y, distance(point, from)]) })
  spots.sort((a, b) => a[2] - b[2])
  const blown = p.lungs.slice(0, spots.length)
  blown.forEach(({ mat, life }, i) => setCell(g.world, spots[i][0], spots[i][1], mat, life || TUNING.world.offgasLife))
  p.lungs = []
  for (const e of g.enemies) {
    if (!covered(centre(e)) || e.heavy) continue
    e.vx = p.aim.x * S.gust.shove
    e.vy = p.aim.y * S.gust.shove - 40
    e.shoved = 0.35
  }
  sparkle(g, from, p.aim, GAS, 18)
}

const gust = (g, p) => {
  if (owns(p, 'gust.siphon')) {
    if (p.lungs?.length) exhale(g, p)
    else if (!inhale(g, p)) gustCone(g, p)
    return
  }
  if (owns(p, 'gust.twister')) {
    const c = centre(p)
    const dir = p.aim.x < 0 ? -1 : p.aim.x > 0 ? 1 : p.facing
    addEffect(g, { kind: 'twister', x: c.x + dir * 14, y: p.y + p.h, dir, life: S.gust.twisterLife, clock: 0, fire: false })
    return
  }
  gustCone(g, p)
}

const swapCells = (w, ax, ay, bx, by) => {
  const a = ay * ROOM + ax
  const b = by * ROOM + bx
  for (const f of [w.mat, w.burn, w.charge, w.refractory, w.life]) [f[a], f[b]] = [f[b], f[a]]
}

const inPlay = (x, y) => x >= 1 && y >= 1 && x <= ROOM - 2 && y <= ROOM - 2
const movable = (w, x, y) => inPlay(x, y) && matAt(w, x, y) !== M.BEDROCK

const blockAround = (e, reach) => {
  const c = centre(e)
  const cells = []
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) cells.push([dx, dy])
  return { x: cell(c.x), y: cell(c.y), cells }
}

const tradeGround = (g, a, b) => {
  const from = blockAround(a, 1)
  const to = blockAround(b, 1)
  if (Math.abs(from.x - to.x) <= 2 && Math.abs(from.y - to.y) <= 2) return
  for (const [dx, dy] of from.cells) {
    if (movable(g.world, from.x + dx, from.y + dy) && movable(g.world, to.x + dx, to.y + dy)) swapCells(g.world, from.x + dx, from.y + dy, to.x + dx, to.y + dy)
  }
}

const tradeMatter = (g, p) => {
  const here = cellsUnder(p)
  for (let d = S.blink.reach; d > BLOCK * 2; d -= BLOCK) {
    const dx = Math.round((p.aim.x * d) / BLOCK)
    const dy = Math.round((p.aim.y * d) / BLOCK)
    const there = here.map(([x, y]) => [x + dx, y + dy])
    const apart = !there.some(([x, y]) => here.some(([hx, hy]) => hx === x && hy === y))
    if (!apart || !there.every(([x, y]) => movable(g.world, x, y))) continue
    here.forEach(([x, y]) => swapCells(g.world, x, y, x + dx, y + dy))
    p.x += dx * BLOCK
    p.y += dy * BLOCK
    return true
  }
  return false
}

const blinkTarget = (g, p) => {
  for (let d = S.blink.reach; d > 4; d -= 2) {
    const box = { x: p.x + p.aim.x * d, y: p.y + p.aim.y * d, w: p.w, h: p.h }
    if (box.x > 1 && box.y > 1 && box.x + box.w < WORLD_PX - 1 && box.y + box.h < WORLD_PX - 1 && !hitsSolid(g.world, box)) return box
  }
  return null
}

const fedByCrossing = (g, from, to) => {
  const solids = new Set()
  lineCells(from, to, (x, y) => { if (props(matAt(g.world, x, y)).solid) solids.add(y * ROOM + x) })
  solids.forEach(i => feedEvent(g, 'crossed', ((i % ROOM) + 0.5) * BLOCK, (Math.floor(i / ROOM) + 0.5) * BLOCK))
}

const arrive = (g, p, origin) => {
  p.vy = Math.min(p.vy, 0)
  p.iframes = Math.max(p.iframes, 0.25)
  const colour = hue(p, 'blink', 'white')
  const arrival = centre(p)
  ring(g, origin.x, origin.y, colour, 14, 60)
  ring(g, arrival.x, arrival.y, colour, 14, 60)
  if (owns(p, 'blink.lance')) {
    zap(g, origin, arrival, CHARGE)
    foesOnSegment(g, origin, arrival, 3).forEach(e => {
      hurt(g, e, S.blink.lanceDamage, 'player')
      e.stun = Math.max(e.stun, 0.6)
    })
    energize(g.world, cell(origin.x), cell(origin.y + 10), S.bolt.energy / 2)
    energize(g.world, cell(arrival.x), cell(arrival.y + 10), S.bolt.energy / 2)
  }
  if (owns(p, 'blink.ghost')) addEffect(g, { kind: 'decoy', x: origin.x - 4, y: origin.y - 8, life: 3 })
  g.pulse = Math.max(g.pulse, 0.5)
}

const blink = (g, p) => {
  const origin = centre(p)
  if (owns(p, 'blink.anchor')) {
    const anchor = g.effects.find(f => f.kind === 'anchor')
    if (anchor && !hitsSolid(g.world, { x: anchor.x, y: anchor.y, w: p.w, h: p.h })) {
      Object.assign(p, { x: anchor.x, y: anchor.y })
      anchor.life = 0
      anchor.done = true
      arrive(g, p, origin)
      return
    }
  }
  if (owns(p, 'blink.trade')) {
    if (tradeMatter(g, p)) arrive(g, p, origin)
    return
  }
  const target = blinkTarget(g, p)
  if (!target) return
  if (owns(p, 'blink.anchor')) {
    g.effects.filter(f => f.kind === 'anchor').forEach(f => { f.life = 0; f.done = true })
    addEffect(g, { kind: 'anchor', x: p.x, y: p.y, life: S.blink.anchorLife })
  }
  p.x = target.x
  p.y = target.y
  fedByCrossing(g, origin, centre(p))
  arrive(g, p, origin)
}

const grappleFoe = (g, p, from, hit) => {
  const e = hit.struck
  if (owns(p, 'grapple.tether')) {
    tetherFoe(g, e)
    return
  }
  const c = centre(p)
  const d = Math.max(1, distance(c, hit))
  if (!e.heavy) {
    e.vx = ((c.x - hit.x) / d) * S.grapple.reel
    e.vy = ((c.y - hit.y) / d) * S.grapple.reel - 30
    e.shoved = 0.35
  }
  if (owns(p, 'grapple.catch') && !e.heavy) addEffect(g, { kind: 'caught', foe: e, life: S.grapple.catchHold })
}

const tetherFoe = (g, e) => {
  const loose = g.effects.find(f => f.kind === 'tether' && !f.b && !f.point)
  if (loose && loose.a === e) return
  if (loose) {
    loose.b = e
    loose.life = S.grapple.tetherLife
    return
  }
  addEffect(g, { kind: 'tether', a: e, life: S.grapple.tetherLife })
  e.stun = Math.max(e.stun, 0.5)
}

const throwCaught = (g, p, caught) => {
  const e = caught.foe
  caught.life = 0
  caught.done = true
  e.vx = p.aim.x * S.grapple.catchThrow
  e.vy = p.aim.y * S.grapple.catchThrow - 40
  e.shoved = 0.7
  e.stun = Math.max(e.stun, 0.7)
  e.iframes = 0
  addEffect(g, { kind: 'hurled', foe: e, life: 0.7 })
  g.shake = Math.max(g.shake, 3)
}

const grapple = (g, p) => {
  const from = muzzle(p)
  const caught = g.effects.find(f => f.kind === 'caught' && !f.done)
  if (caught) {
    throwCaught(g, p, caught)
    return
  }
  const hit = ray(g, from, p.aim, S.grapple.reach)
  zap(g, from, hit, hue(p, 'grapple', 'pale'))
  if (hit.struck) {
    grappleFoe(g, p, from, hit)
    return owns(p, 'grapple.catch') && !hit.struck.heavy ? FREE : undefined
  }
  if (!hit.solid) return
  const x = cell(hit.x)
  const y = cell(hit.y)
  const loose = owns(p, 'grapple.tether') && g.effects.find(f => f.kind === 'tether' && !f.b && !f.point)
  if (loose) {
    loose.point = { x: hit.last.x, y: hit.last.y }
    loose.life = S.grapple.tetherLife
    return
  }
  if (owns(p, 'grapple.yank') && BREAKS.has(hit.m)) {
    if (!shatterFrom(g, x, y)) setCell(g.world, x, y, M.EMPTY)
    if (hit.m === M.SCRAP || hit.m === M.ROCK) g.flung.push(flungFrom(p, { x: hit.last.x - 4 - p.aim.x * 6, y: hit.last.y - 4 - p.aim.y * 6, vx: -p.aim.x * 200, vy: -p.aim.y * 200 - 30 }))
    return
  }
  if (owns(p, 'grapple.sling')) {
    addEffect(g, { kind: 'rope', x: hit.last.x, y: hit.last.y, length: Math.max(BLOCK * 2, distance(hit.last, centre(p))), life: 999 })
    return
  }
  zipTo(g, p, hit, S.grapple.pull)
}

const dash = (g, p) => {
  const aim = p.aim.y !== 0 && p.aim.x === 0 ? p.aim : { x: p.facing * Math.abs(p.aim.x || 1), y: p.aim.y * 0.7 }
  p.vx = aim.x * S.dash.speed
  p.vy = aim.y * S.dash.speed
  p.dashing = S.dash.time
  p.dashAim = aim
  p.drift = S.dash.time + 0.1
  p.iframes = Math.max(p.iframes, S.dash.time + 0.05)
  p.jumpHeld = false
  p.caroms = 0
  g.pulse = Math.max(g.pulse, 0.3)
}

const carry = (g, p, box) => {
  if (!p.carried) p.carried = hostile(g).find(e => !e.heavy && overlap(box, e)) ?? null
  if (!p.carried) return
  const e = p.carried
  e.x = p.x + p.w / 2 - e.w / 2 + p.dashAim.x * 8
  e.y = p.y + p.h / 2 - e.h / 2 + p.dashAim.y * 8
  e.stun = Math.max(e.stun, 0.3)
}

const flingCarried = (g, p) => {
  const e = p.carried
  p.carried = null
  e.iframes = 0
  hurt(g, e, S.dash.tackleDamage, 'player')
  e.vx = p.dashAim.x * S.dash.tackleThrow
  e.vy = p.dashAim.y * S.dash.tackleThrow - 50
  e.shoved = 0.6
  ring(g, e.x + e.w / 2, e.y + e.h / 2, BLOOD, 16, 90)
  g.shake = Math.max(g.shake, 4)
}

const caromOff = (g, p) => {
  p.caroms += 1
  p.dashAim = { x: -p.dashAim.x || -p.facing * 0.2, y: p.dashAim.y }
  p.facing = p.dashAim.x < 0 ? -1 : 1
  p.vx = p.dashAim.x * S.dash.speed
  p.vy = p.dashAim.y * S.dash.speed
  p.dashing = S.dash.time
  p.iframes = Math.max(p.iframes, S.dash.time + 0.05)
  ring(g, centre(p).x, centre(p).y, MAGNET, 12, 70)
  g.shake = Math.max(g.shake, 2)
}

export const stepDash = (g, p, dt) => {
  if (!(p.dashing > 0)) return
  p.dashing -= dt
  const box = { x: p.x - 2, y: p.y - 1, w: p.w + 4, h: p.h + 2 }
  if (owns(p, 'dash.ram')) {
    for (let y = cell(box.y); y <= cell(box.y + box.h); y++) {
      for (let x = cell(box.x); x <= cell(box.x + box.w); x++) if (BREAKS.has(matAt(g.world, x, y))) smash(g, x, y)
    }
  }
  if (owns(p, 'dash.carom') && p.hitWall && p.caroms < S.dash.caromMost) caromOff(g, p)
  if (owns(p, 'dash.tackle')) {
    carry(g, p, box)
    if (p.carried && (p.dashing <= 0 || p.hitWall)) {
      flingCarried(g, p)
      feedEvent(g, 'dashHit', box.x, box.y)
    }
    return
  }
  for (const e of hostile(g)) {
    if (!overlap(box, e) || e.iframes > 0) continue
    hurt(g, e, 2, 'player')
    e.stun = Math.max(e.stun, 0.4)
    feedEvent(g, 'dashHit', centre(e).x, centre(e).y)
  }
}

export const recordTrail = (p, dt) => {
  p.trailClock = (p.trailClock ?? 0) + dt
  if (p.trailClock < 0.1) return
  p.trailClock = 0
  p.trail = [...(p.trail ?? []), { x: p.x, y: p.y, hp: p.hp }].slice(-S.rewind.keep)
}

export const recordPast = (g, dt) => {
  if (!g.player.skills.some(s => s.kind === 'rewind') || !owns(g.player, 'rewind.epoch')) return
  g.pastClock = (g.pastClock ?? 0) + dt
  if (g.pastClock < S.rewind.snapEvery) return
  g.pastClock = 0
  const w = g.world
  g.past = [...(g.past ?? []).filter(s => s.world === w), {
    world: w,
    mat: w.mat.slice(),
    life: w.life.slice(),
    burn: w.burn.slice(),
    foes: g.enemies.map(e => [e, e.x, e.y]),
  }].slice(-S.rewind.snaps)
}

const restorePast = g => {
  const snapshot = (g.past ?? []).find(s => s.world === g.world)
  if (!snapshot) return false
  const w = g.world
  w.mat.set(snapshot.mat)
  w.life.set(snapshot.life)
  w.burn.set(snapshot.burn)
  w.charge.fill(0)
  w.frontier = []
  snapshot.foes.filter(([e]) => g.enemies.includes(e)).forEach(([e, x, y]) => Object.assign(e, { x, y, vx: 0, vy: 0 }))
  g.past = []
  return true
}

const rewind = (g, p) => {
  const trail = p.trail ?? []
  if (trail.length === 0) return
  const past = trail[Math.max(0, trail.length - S.rewind.steps)]
  const here = centre(p)
  const colour = hue(p, 'rewind', 'magnet')
  ring(g, here.x, here.y, colour, 18, 70)
  if (owns(p, 'rewind.relive')) {
    p.skills.filter(s => s.kind !== 'rewind').forEach(s => { s.ready = 0; s.gulp = 1 })
    ring(g, here.x, here.y, WHITE, 26, 130)
  }
  if (owns(p, 'rewind.epoch')) {
    if (restorePast(g)) ring(g, here.x, here.y, colour, 34, 180)
  } else {
    if (owns(p, 'rewind.wraith')) addEffect(g, { kind: 'wraith', path: trail.slice(-S.rewind.steps).map(({ x, y }) => ({ x, y })), w: p.w, h: p.h, x: past.x, y: past.y, life: Math.min(trail.length, S.rewind.steps) * 0.1 })
    if (!hitsSolid(g.world, { x: past.x, y: past.y, w: p.w, h: p.h })) {
      p.x = past.x
      p.y = past.y
    }
    p.vx = 0
    p.vy = 0
  }
  p.hp = owns(p, 'rewind.undo') ? Math.max(p.hp, past.hp) : p.hp
  p.iframes = Math.max(p.iframes, 0.4)
  g.pulse = 1
}

const aimedCell = (g, p, reach) => {
  const hit = ray(g, muzzle(p), p.aim, reach)
  return { x: cell(hit.last.x), y: cell(hit.last.y) }
}

const masonry = p => (owns(p, 'mason.iron') ? M.METAL : owns(p, 'mason.rubble') ? M.SAND : M.ROCK)

export const lay = (g, p, x, y, material) => {
  if (!inPlay(x, y) || props(matAt(g.world, x, y)).solid) return false
  if (overlap(p, { x: x * BLOCK, y: y * BLOCK, w: BLOCK, h: BLOCK })) return false
  setCell(g.world, x, y, material)
  burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 'pale', 2)
  return true
}

const cageFoe = (g, p, e) => {
  const [left, right] = [cell(e.x) - 1, cell(e.x + e.w - 0.01) + 1]
  const [top, bottom] = [cell(e.y) - 1, cell(e.y + e.h - 0.01) + 1]
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) if (x === left || x === right || y === top || y === bottom) lay(g, p, x, y, masonry(p))
  }
  e.stun = Math.max(e.stun, 0.6)
  ring(g, e.x + e.w / 2, e.y + e.h / 2, BLOOD, 14, 50)
}

const wallAt = (g, p) => {
  const { x, y } = aimedCell(g, p, S.mason.reach)
  const horizontal = Math.abs(p.aim.y) >= Math.abs(p.aim.x)
  for (let d = -1; d <= 1; d++) lay(g, p, horizontal ? x + d : x, horizontal ? y : y + d, masonry(p))
}

const walkway = (g, p) => {
  const c = centre(p)
  if (p.aim.y < -0.9) return { x: c.x, y: p.y - 2 }
  const dir = p.aim.x < 0 ? -1 : p.aim.x > 0 ? 1 : p.facing
  const below = p.y + p.h + 3
  const ledge = [1, 2, 3].some(k => !props(matAt(g.world, cell(c.x + dir * k * BLOCK), cell(below))).solid)
  return { x: c.x, y: ledge ? below : p.y + p.h - 4 }
}

const mason = (g, p) => {
  if (owns(p, 'mason.span')) {
    const from = walkway(g, p)
    addEffect(g, { kind: 'span', x: from.x + p.aim.x * BLOCK, y: from.y + p.aim.y * BLOCK, dx: p.aim.x, dy: p.aim.y, life: 999, clock: 0, laid: 0, skipped: 0, material: masonry(p), step: S.mason.spanStep, most: S.mason.spanMost })
    return
  }
  if (owns(p, 'mason.cage')) {
    const covered = inCone(muzzle(p), p.aim, S.mason.cageReach, S.mason.cageWidth)
    const foe = nearestTo(hostile(g).filter(e => !e.heavy && covered(centre(e))), centre(p))
    if (foe) {
      cageFoe(g, p, foe)
      return
    }
  }
  wallAt(g, p)
}

const seed = (g, p) => {
  const here = muzzle(p)
  g.world.thorns = g.world.thorns || owns(p, 'seed.thorns')
  g.world.tinder = g.world.tinder || owns(p, 'seed.tinder')
  sparkle(g, here, p.aim, hue(p, 'seed', 'pale'), 8)
  if (owns(p, 'seed.bough')) {
    const from = walkway(g, p)
    const dir = p.aim.x < 0 ? -1 : p.aim.x > 0 ? 1 : p.facing
    addEffect(g, { kind: 'span', x: from.x + dir * BLOCK, y: from.y, dx: dir, dy: 0, life: 999, clock: 0, laid: 0, skipped: 0, material: M.WOOD, step: S.seed.boughStep, most: S.seed.boughMost, vines: true })
    return
  }
  const straightUp = p.aim.y < -0.5 && Math.abs(p.aim.x) < 0.8
  const { x, y } = straightUp ? { x: cell(here.x), y: cell(p.y + p.h - 1) } : aimedCell(g, p, S.seed.reach)
  if (owns(p, 'seed.flytrap')) {
    let row = y
    while (row < ROOM - 2 && !props(matAt(g.world, x, row + 1)).solid) row++
    setCell(g.world, x, row, M.VINE, 0)
    addEffect(g, { kind: 'flytrap', cx: x, cy: row, x: (x + 0.5) * BLOCK, y: (row + 0.5) * BLOCK, life: S.seed.trapLife, reload: 0, held: null, chew: 0 })
    return
  }
  setCell(g.world, x, y, M.VINE, S.seed.length)
}

const pourLiquid = p => (owns(p, 'spring.oil') ? M.OIL : M.WATER)

const spring = (g, p) => {
  const { x, y } = aimedCell(g, p, S.spring.reach)
  const liquid = pourLiquid(p)
  sparkle(g, muzzle(p), p.aim, hue(p, 'spring', 'magnet'), 12)
  if (owns(p, 'spring.geyser')) {
    let row = y
    while (row < ROOM - 2 && !props(matAt(g.world, x, row + 1)).solid) row++
    addEffect(g, { kind: 'geyser', cx: x, floor: row, height: 0, clock: 0, liquid, life: S.spring.geyserLife })
    return
  }
  if (owns(p, 'spring.font')) {
    const fonts = g.effects.filter(f => f.kind === 'font')
    if (fonts.length >= 2) Object.assign(fonts[0], { life: 0, done: true })
    addEffect(g, { kind: 'font', cx: x, cy: y, x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK, liquid, clock: 0, life: S.spring.fontLife })
    return
  }
  for (let n = 0; n < S.spring.small; n++) {
    const cx = x + (n % 5) - 2
    const cy = y - Math.floor(n / 5)
    if (matAt(g.world, cx, cy) === M.EMPTY) setCell(g.world, cx, cy, liquid)
  }
  if (owns(p, 'spring.slush')) addEffect(g, { kind: 'setting', x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK, life: S.spring.setAfter })
}

export const freezeWaterAround = (g, x, y, radius) => {
  const [cx, cy] = [cell(x), cell(y)]
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius && matAt(g.world, cx + dx, cy + dy) === M.WATER) setCell(g.world, cx + dx, cy + dy, M.ICE)
    }
  }
}

const acid = (g, p) => {
  g.world.rusting = g.world.rusting || owns(p, 'acid.rust')
  g.world.offgas = g.world.offgas || owns(p, 'acid.ferment')
  if (owns(p, 'acid.bore')) thrown(g, p, p.aim, 'bore', { speed: S.acid.boreFlight, gravity: 0, colour: ACID })
  else if (owns(p, 'acid.rain')) thrown(g, p, p.aim, 'cloud', { speed: S.ember.speed, lift: S.ember.lift, colour: ACID })
  else lob(g, p, p.aim, { acid: S.acid.small })
}

export const pourAcid = (g, x, y, count) => {
  for (let n = 0; n < count; n++) {
    const cx = x + (n % 3) - 1
    const cy = y - Math.floor(n / 3)
    if (!props(matAt(g.world, cx, cy)).solid) setCell(g.world, cx, cy, M.ACID)
  }
}

const BORES = new Set([...BREAKS, M.METAL, M.GATE].filter(m => m !== M.GLASS))

export const boreCell = (g, x, y) => {
  const m = matAt(g.world, x, y)
  if (!BORES.has(m)) return m !== M.BEDROCK
  const metal = m === M.METAL || m === M.GATE
  const left = g.world.rusting && metal ? M.SCRAP : g.world.offgas ? M.METHANE : M.EMPTY
  setCell(g.world, x, y, left, left === M.METHANE ? TUNING.world.offgasLife : 0)
  burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, ACID, 3)
  return true
}

const MELTS = new Set([M.ROCK, M.SAND, M.BRICK])
const FORGED = new Set([M.METAL, M.SCRAP, M.GATE])

export const heat = (g, p, x, y, budget = { flashes: 0 }) => {
  const m = matAt(g.world, x, y)
  if (MELTS.has(m) || (FORGED.has(m) && owns(p, 'melt.forge'))) {
    setCell(g.world, x, y, M.LAVA)
    return true
  }
  if (props(m).melts) setCell(g.world, x, y, M.WATER)
  else if (m === M.WATER) {
    setCell(g.world, x, y, M.STEAM, 2)
    if (owns(p, 'melt.flash') && budget.flashes > 0) {
      budget.flashes -= 1
      explode(g.world, x, y, 1)
      ring(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, WHITE, 10, 70)
    }
  } else ignite(g.world, x, y)
  return false
}

const meltBeam = (g, p) => {
  const from = muzzle(p)
  const budget = { flashes: S.melt.flashes }
  let end = from
  let solids = 0
  for (let d = 4; d < S.melt.reach && solids < S.melt.depth; d += 4) {
    end = { x: from.x + p.aim.x * d, y: from.y + p.aim.y * d }
    if (heat(g, p, cell(end.x), cell(end.y), budget)) solids += 1
    const struck = g.enemies.find(e => !e.friendly && overlap(shotBox(e), { x: end.x, y: end.y, w: 1, h: 1 }))
    if (struck) hurt(g, struck, 2, 'player')
  }
  zap(g, from, end, hue(p, 'melt', 'fire'))
}

const melt = (g, p) => {
  if (owns(p, 'melt.slag')) thrown(g, p, p.aim, 'slag', { speed: S.melt.slagSpeed, lift: S.melt.slagLift, size: 5, colour: '#ff7a1c', splashes: true })
  else if (owns(p, 'melt.fissure')) addEffect(g, { kind: 'fissure', x: cell(centre(p).x), y: cell(p.y + p.h + 2), dir: p.aim.x < 0 ? -1 : p.aim.x > 0 ? 1 : p.facing, life: 999, clock: 0, laid: 0, budget: { flashes: S.melt.flashes } })
  else meltBeam(g, p)
  g.pulse = Math.max(g.pulse, 0.5)
}

const TRANSMUTE = { [M.WATER]: M.OIL, [M.OIL]: M.ACID, [M.ACID]: M.LAVA, [M.LAVA]: M.ROCK }
const TRANSMUTE_SOLID = { [M.ROCK]: M.SAND, [M.SAND]: M.WATER, [M.ICE]: M.WATER, [M.FLOE]: M.WATER, [M.WOOD]: M.VINE, [M.MOSS]: M.VINE, [M.PEAT]: M.OIL }

const MATTER = {
  crawler: M.SCRAP, crab: M.SCRAP, bomber: M.SCRAP, turret: M.SCRAP, spitter: M.LAVA, slug: M.OIL, slime: M.ACID, gasbag: M.METHANE, spore: M.METHANE,
  fish: M.WATER, jelly: M.WATER, imp: M.ICE, worm: M.SAND, nest: M.PEAT, mimic: M.WOOD,
}

export const spillMatter = (g, e, count = 4) => {
  const mat = MATTER[e.kind] ?? M.ASH
  const c = centre(e)
  const life = props(mat).gas ? TUNING.world.offgasLife : props(mat).expires ? TUNING.world.ashLife : 0
  ;[[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]].slice(0, count).forEach(([dx, dy]) => {
    if (matAt(g.world, cell(c.x) + dx, cell(c.y) + dy) === M.EMPTY) setCell(g.world, cell(c.x) + dx, cell(c.y) + dy, mat, life)
  })
}

const renderFoes = (g, p, covered) => {
  for (const e of hostile(g)) {
    if (e.heavy || !covered(centre(e))) continue
    if (e.hp <= S.alchemy.renderHp) {
      spillMatter(g, e, 6)
      e.hp = 0
      e.lastSource = 'world'
      burst(g, centre(e).x, centre(e).y, BLOOD, 14)
    } else hurt(g, e, 1, 'player')
  }
}

const alchemy = (g, p) => {
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.alchemy.reach, S.alchemy.width)
  const changed = new Map()
  forEachCell((x, y, point) => {
    if (!covered(point)) return
    const m = matAt(g.world, x, y)
    const next = TRANSMUTE[m] ?? (owns(p, 'alchemy.transmute') ? TRANSMUTE_SOLID[m] : undefined)
    if (next !== undefined) {
      setCell(g.world, x, y, next)
      changed.set(`${m}>${next}`, { from: m, to: next, frontier: [...(changed.get(`${m}>${next}`)?.frontier ?? []), [x, y]] })
    }
    if (owns(p, 'alchemy.vapour') && (m === M.SMOKE || m === M.STEAM)) setCell(g.world, x, y, M.METHANE, 10)
  })
  if (owns(p, 'alchemy.render')) renderFoes(g, p, covered)
  if (owns(p, 'alchemy.contagion')) changed.forEach(change => addEffect(g, { kind: 'contagion', ...change, most: props(change.from).solid ? S.alchemy.spreadSolid : S.alchemy.spreadMost, life: 999, clock: 0, laid: 0 }))
  sparkle(g, from, p.aim, hue(p, 'alchemy', 'gas'), 20)
  g.pulse = Math.max(g.pulse, 0.5)
}

const well = (g, p) => {
  const hit = ray(g, muzzle(p), p.aim, S.well.reach)
  const rogue = owns(p, 'well.rogue')
  const nova = owns(p, 'well.nova')
  addEffect(g, {
    kind: 'well', x: hit.last.x, y: hit.last.y,
    vx: rogue ? p.aim.x * S.well.rogueSpeed : 0,
    vy: rogue ? p.aim.y * S.well.rogueSpeed : 0,
    life: rogue ? S.well.rogueLife : nova ? S.well.novaLife : S.well.life,
    nova, colour: hue(p, 'well', null),
    grinder: owns(p, 'well.grind'),
    lodestone: owns(p, 'well.lodestone'),
  })
}

const swapBodies = (g, a, b, stun) => {
  const [ax, ay] = [a.x + a.w / 2, a.y + a.h]
  const [bx, by] = [b.x + b.w / 2, b.y + b.h]
  a.x = bx - a.w / 2
  a.y = by - a.h
  b.x = ax - b.w / 2
  b.y = ay - b.h
  if (a !== g.player) a.stun = Math.max(a.stun, stun)
  if (b !== g.player) b.stun = Math.max(b.stun, stun)
}

const trade = (g, p, a, b) => {
  if (owns(p, 'swap.ground')) tradeGround(g, a, b)
  const is = centre(b)
  swapBodies(g, a, b, 0.5)
  ring(g, is.x, is.y, hue(p, 'swap', GAS), 10, 40)
}

const swapBack = (g, p, recall) => {
  recall.life = 0
  recall.done = true
  if (recall.foe.hp > 0) trade(g, p, recall.foe, p)
  else if (!hitsSolid(g.world, { x: recall.x, y: recall.y, w: p.w, h: p.h })) Object.assign(p, { x: recall.x, y: recall.y })
  p.iframes = Math.max(p.iframes, 0.3)
  ring(g, centre(p).x, centre(p).y, MAGNET, 14, 80)
}

const swap = (g, p) => {
  const recall = g.effects.find(f => f.kind === 'recall' && !f.done)
  if (recall) {
    swapBack(g, p, recall)
    return
  }
  const foes = hostile(g).filter(e => !e.heavy)
  if (owns(p, 'swap.shuffle') && foes.length > 1) {
    const order = foes.map(e => [Math.random(), e]).sort((a, b) => a[0] - b[0]).map(([, e]) => e)
    order.slice(1).forEach((e, i) => trade(g, p, order[i], e))
    g.pulse = 1
    return
  }
  const covered = inCone(muzzle(p), p.aim, S.swap.reach, S.swap.width)
  const target = nearestTo(g.enemies.filter(e => covered(centre(e))), centre(p))
  if (!target) return
  const [fromX, fromY] = [p.x, p.y]
  trade(g, p, target, p)
  p.iframes = Math.max(p.iframes, 0.3)
  if (owns(p, 'swap.goat')) {
    addEffect(g, { kind: 'lure', loud: true, follow: target, x: target.x, y: target.y, life: S.swap.goatTime })
    target.goat = S.swap.goatTime
  }
  g.pulse = Math.max(g.pulse, 0.6)
  if (owns(p, 'swap.recall')) {
    addEffect(g, { kind: 'recall', foe: target, x: fromX, y: fromY, life: S.swap.recallTime })
    return FREE
  }
}

const STILLED = new Set([M.WATER, M.OIL, M.LAVA, M.ACID])

const holdMatter = g => {
  const w = g.world
  const p = g.player
  forEachCell((x, y) => {
    const m = matAt(w, x, y)
    const body = { x: x * BLOCK, y: y * BLOCK, w: BLOCK, h: BLOCK }
    if (!STILLED.has(m) || overlap(p, body)) return
    setCell(w, x, y, M.STILL, m)
  })
  g.matterHeld = true
}

export const releaseMatter = g => {
  if (!g.matterHeld) return
  const w = g.world
  forEachCell((x, y) => {
    if (matAt(w, x, y) === M.STILL) setCell(w, x, y, w.life[y * ROOM + x])
  })
  g.matterHeld = false
}

const stop = (g, p) => {
  if (owns(p, 'stop.still')) {
    holdMatter(g)
    addEffect(g, { kind: 'still', life: S.stop.stillTime })
  } else if (owns(p, 'stop.hold')) {
    g.enemies.filter(e => !e.friendly).forEach(e => {
      const held = e.heavy ? S.stop.heavyHold : S.stop.holdTime
      e.stun = Math.max(e.stun, held)
      e.frozen = Math.max(e.frozen, held)
    })
    addEffect(g, { kind: 'hold', life: S.stop.holdTime })
  } else {
    g.timeStop = S.stop.time
  }
  g.pulse = 1
}

const ICY = new Set([M.ICE, M.FLOE, M.RIME])

export const crackWorld = g => {
  forEachCell((x, y) => {
    const m = matAt(g.world, x, y)
    if (ICY.has(m)) {
      setCell(g.world, x, y, M.WATER)
      chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, m, 3)
    }
    if (m === M.VOLATILE) ignite(g.world, x, y)
  })
  g.enemies.filter(e => !e.friendly).forEach(e => { e.stun = Math.max(e.stun, 1.5) })
  const c = centre(g.player)
  ring(g, c.x, c.y, BLOOD, 40, 220)
  g.shake = Math.max(g.shake, 8)
  g.pulse = 1
}

export const charmOne = (g, e, p) => {
  e.ally = S.charm.time
  e.plague = owns(p, 'charm.plague')
  e.pact = owns(p, 'charm.pact')
  e.bond = owns(p, 'charm.bond')
  if (owns(p, 'charm.lure')) addEffect(g, { kind: 'lure', loud: true, follow: e, x: e.x, y: e.y, life: S.charm.time })
  const c = centre(e)
  ring(g, c.x, c.y, hue(p, 'charm', 'gas'), 12, 40)
}

const charm = (g, p) => {
  const covered = inCone(muzzle(p), p.aim, S.charm.reach, S.charm.width)
  const target = nearestTo(hostile(g).filter(e => !e.heavy && covered(centre(e))), centre(p))
  if (target) charmOne(g, target, p)
}

const tradeWithDecoy = (g, p, standing) => {
  const spot = [0, 2, 4, 6, 8, 10, 12, 14, 16].map(up => ({ x: standing.x + 4 - p.w / 2, y: standing.y + 16 - p.h - up }))
    .find(at => !hitsSolid(g.world, { ...at, w: p.w, h: p.h }))
  if (!spot) return false
  const origin = centre(p)
  standing.x = p.x + p.w / 2 - 4
  standing.y = p.y + p.h - 16
  standing.traded = true
  Object.assign(p, spot)
  p.vy = Math.min(p.vy, 0)
  p.iframes = Math.max(p.iframes, 0.3)
  ring(g, origin.x, origin.y, STONE, 12, 60)
  ring(g, centre(p).x, centre(p).y, STONE, 12, 60)
  return true
}

const decoy = (g, p) => {
  const standing = owns(p, 'decoy.double') && g.effects.find(f => f.kind === 'decoy' && !f.done)
  if (standing) return tradeWithDecoy(g, p, standing) ? undefined : FREE
  const hit = ray(g, muzzle(p), p.aim, S.decoy.reach)
  const clone = owns(p, 'decoy.clone')
  addEffect(g, {
    kind: 'decoy', x: hit.last.x - 4, y: hit.last.y - 8,
    life: clone ? S.decoy.cloneLife : S.decoy.life,
    clone,
    runner: owns(p, 'decoy.runner'),
    dir: p.aim.x < 0 ? -1 : p.aim.x > 0 ? 1 : p.facing,
    vy: 0,
    double: owns(p, 'decoy.double'),
    gas: owns(p, 'decoy.gas'),
  })
  if (owns(p, 'decoy.double')) return FREE
}

const drone = (g, p) => {
  const sapper = owns(p, 'drone.sapper')
  const mole = owns(p, 'drone.mole')
  const sentry = owns(p, 'drone.sentry')
  const flying = g.effects.filter(f => f.kind === 'drone')
  flying.slice(0, Math.max(0, flying.length - S.drone.most + 1)).forEach(f => { f.life = 0 })
  const spot = sentry ? ray(g, muzzle(p), p.aim, S.drone.sentryReach).last : { x: p.x, y: p.y - 10 }
  addEffect(g, {
    kind: 'drone', phase: flying.length * 2.1, x: spot.x, y: spot.y, reload: 0.2,
    life: sapper ? S.drone.sapperLife : mole ? S.drone.moleLife : sentry ? S.drone.sentryLife : S.drone.life,
    sapper, mole, sentry, aim: p.aim, magpie: owns(p, 'drone.magpie'),
  })
}

const rod = (g, p) => {
  const hit = ray(g, muzzle(p), { x: p.aim.x || p.facing, y: 1 }, S.rod.reach)
  const fence = owns(p, 'rod.fence')
  if (fence) {
    const rods = g.effects.filter(f => f.kind === 'rod')
    if (rods.length >= 2) Object.assign(rods[0], { life: 0, done: true })
  }
  addEffect(g, {
    kind: 'rod', x: hit.last.x - 4, y: hit.last.y - 16, cx: cell(hit.x), cy: cell(hit.y), life: S.rod.life, reload: 0.3,
    arcs: owns(p, 'rod.arcs'), grounded: owns(p, 'rod.earth'), magnet: owns(p, 'rod.magnet'), fence,
  })
}

const wireEnd = (g, last) => {
  const [x, y] = [cell(last.x), cell(last.y)]
  const solid = (dx, dy) => props(matAt(g.world, x + dx, y + dy)).solid
  const dir = solid(-1, 0) ? [1, 0] : solid(1, 0) ? [-1, 0] : solid(0, 1) ? [0, -1] : solid(0, -1) ? [0, 1] : [1, 0]
  let steps = 1
  while (steps < ROOM && !solid(dir[0] * steps, dir[1] * steps)) steps++
  return { x: (x + dir[0] * (steps - 1) + 0.5) * BLOCK, y: (y + dir[1] * (steps - 1) + 0.5) * BLOCK }
}

const mine = (g, p) => {
  const limpet = owns(p, 'mine.limpet')
  const hit = ray(g, muzzle(p), p.aim, limpet || owns(p, 'mine.wire') ? S.mine.farReach : S.mine.reach)
  const rider = limpet && hit.struck && !hit.struck.friendly ? hit.struck : null
  addEffect(g, {
    kind: 'mine', x: hit.last.x - 3, y: hit.last.y - 3, life: rider ? S.mine.limpetFuse + 0.2 : S.mine.life, arm: rider ? S.mine.limpetFuse : 0.5,
    rider, limpet, wire: owns(p, 'mine.wire') && hit.solid ? wireEnd(g, hit.last) : null, anchor: { x: hit.last.x, y: hit.last.y },
    gas: owns(p, 'mine.gas'), cryo: owns(p, 'mine.cryo'),
  })
  if (limpet) zap(g, muzzle(p), hit.last, BLOOD)
}

const SHATTERS = new Set([M.ICE, M.FLOE, M.RIME, M.SAND, M.VOLATILE, M.GLASS])

export const roarCell = (g, p, x, y) => {
  const m = matAt(g.world, x, y)
  if (m === M.VOLATILE) ignite(g.world, x, y)
  else if (ICY.has(m) && !owns(p, 'roar.rime')) setCell(g.world, x, y, M.WATER)
  else if (m === M.ROCK && owns(p, 'roar.crack') && Math.random() < 0.25) setCell(g.world, x, y, M.SAND)
  if (owns(p, 'roar.rime')) {
    if (m === M.WATER) setCell(g.world, x, y, M.ICE)
    if (g.world.burn[y * ROOM + x] > 0) g.world.burn[y * ROOM + x] = 0
  }
}

export const roarFoe = (g, p, e, away, shove) => {
  if (e.friendly) return
  e.stun = Math.max(e.stun, 1)
  if (!e.heavy) {
    e.vx = away.x * shove
    e.vy = away.y * shove * 0.4 - 60
    e.shoved = 0.3
  }
  if (owns(p, 'roar.rime')) freezeFoe(g, p, e)
}

const shoutBreaks = (g, x, y) => {
  const m = matAt(g.world, x, y)
  if (SHATTERS.has(m) && m !== M.VOLATILE && !shatterFrom(g, x, y)) {
    setCell(g.world, x, y, m === M.SAND ? M.EMPTY : M.WATER)
    chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, m, 3)
  }
}

export const shoutFront = (g, p, f) => {
  const across = { x: -f.aim.y, y: f.aim.x }
  for (let w = -1; w <= 1; w++) {
    const [x, y] = [cell(f.x + across.x * w * BLOCK), cell(f.y + across.y * w * BLOCK)]
    roarCell(g, p, x, y)
    shoutBreaks(g, x, y)
  }
  g.enemies.filter(e => !f.struck.includes(e) && distance(centre(e), f) < 14).forEach(e => {
    f.struck.push(e)
    roarFoe(g, p, e, f.aim, S.roar.shoutShove)
  })
}

const roarSize = p => (owns(p, 'roar.swell') ? S.roar.swellMin + (S.roar.swellMax - S.roar.swellMin) * p.power : 1)

const roar = (g, p) => {
  const here = centre(p)
  const size = roarSize(p)
  if (owns(p, 'roar.shout')) {
    addEffect(g, { kind: 'shout', x: here.x, y: here.y, aim: p.aim, clock: 0, life: 999, travelled: 0, struck: [], range: S.roar.shoutRange * size })
    g.shake = Math.max(g.shake, 4)
    return
  }
  const reach = S.roar.reach * size
  forEachCell((x, y, point) => {
    if (distance(point, here) <= reach) {
      roarCell(g, p, x, y)
      if (size > S.roar.swellBreaks) shoutBreaks(g, x, y)
    }
  })
  for (const e of g.enemies) {
    const c = centre(e)
    if (distance(c, here) <= reach) {
      roarFoe(g, p, e, towards(here, c), 160 * size)
      if (size > S.roar.swellBreaks) hurt(g, e, 2, 'player')
    }
  }
  ring(g, here.x, here.y, hue(p, 'roar', 'white'), 30, reach * 1.6)
  g.shake = Math.max(g.shake, 5 * size)
  g.pulse = Math.max(g.pulse, 0.7)
}

const mirror = (g, p) => {
  if (owns(p, 'mirror.pane')) {
    const from = muzzle(p)
    g.effects.filter(f => f.kind === 'pane').forEach(f => { f.life = 0 })
    addEffect(g, { kind: 'pane', x: from.x + p.aim.x * S.mirror.paneReach, y: from.y + p.aim.y * S.mirror.paneReach, nx: p.aim.x, ny: p.aim.y, life: S.mirror.paneLife })
    return
  }
  addEffect(g, { kind: 'mirror', life: owns(p, 'mirror.parry') ? S.mirror.parryLife : S.mirror.life, maw: owns(p, 'mirror.maw'), parry: owns(p, 'mirror.parry'), swallowed: 0 })
}

export const returnedShot = (g, p, b) => {
  feedEvent(g, 'returned', centre(b).x, centre(b).y)
  if (owns(p, 'mirror.parry')) p.skills.filter(s => s.kind === 'mirror').forEach(s => { s.ready = 0 })
  if (owns(p, 'mirror.seek')) addEffect(g, { kind: 'seeker', shot: b, life: S.mirror.seekLife })
}

const SALVAGE_SPOTS = [[0, 0], [1, 0], [-1, 0], [0, -1]]

export const salvage = (g, e) => {
  const c = centre(e)
  SALVAGE_SPOTS.filter(([dx, dy]) => matAt(g.world, cell(c.x) + dx, cell(c.y) + dy) === M.EMPTY)
    .slice(0, S.repel.salvageCells)
    .forEach(([dx, dy]) => setCell(g.world, cell(c.x) + dx, cell(c.y) + dy, M.SCRAP))
  burst(g, c.x, c.y, STONE, 8)
}

const held = (g, kind) => g.effects.find(f => f.kind === kind && !f.done)

const METALS = new Set([M.METAL, M.GATE])
const KILNED = new Set([M.ROCK, M.BRICK])

const shines = m => {
  const q = props(m)
  if (m === M.EMPTY || m === M.GLASS) return true
  if (q.flammability || q.hot) return false
  return Boolean(q.gas || q.liquid)
}

const turnBy = ({ x, y }, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) })

const bounceOff = (w, aim, [cx, cy], [nx, ny]) => {
  const hard = (x, y) => METALS.has(matAt(w, x, y))
  const flipX = nx !== cx && (ny === cy || hard(nx, cy))
  const flipY = ny !== cy && (nx === cx || hard(cx, ny))
  const both = !flipX && !flipY
  return { x: flipX || both ? -aim.x : aim.x, y: flipY || both ? -aim.y : aim.y }
}

const beamFrom = (g, p, start, dir, reach, splits, bounces, out, foes, tone = 0) => {
  const L = S.lens
  let { x, y } = start
  let from = { x, y }
  let here = [cell(x), cell(y)]
  let aim = dir
  for (let travelled = 0; travelled < reach; travelled += 2) {
    x += aim.x * 2
    y += aim.y * 2
    const foe = foes.find(([, box]) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h)?.[0]
    if (foe) {
      out.segments.push([from, { x, y }, tone])
      out.ends.push({ foe, x, y })
      return
    }
    const next = [cell(x), cell(y)]
    if (next[0] === here[0] && next[1] === here[1]) continue
    const m = matAt(g.world, next[0], next[1])
    if (METALS.has(m) && bounces > 0 && owns(p, 'lens.glance')) {
      x -= aim.x * 2
      y -= aim.y * 2
      out.segments.push([from, { x, y }, tone])
      out.turns.push({ x, y })
      aim = bounceOff(g.world, aim, here, next)
      from = { x, y }
      bounces -= 1
      continue
    }
    if (!shines(m)) {
      out.segments.push([from, { x, y }, tone])
      out.ends.push({ cell: next, m, x, y })
      return
    }
    if (m === M.GLASS && splits > 0 && owns(p, 'lens.prism') && out.segments.length < L.beamsMost) {
      out.segments.push([from, { x, y }, tone])
      out.turns.push({ x, y })
      from = { x, y }
      for (const side of [-1, 1]) beamFrom(g, p, { x, y }, turnBy(aim, side * L.spread), reach - travelled, splits - 1, bounces, out, foes, side)
      splits -= 1
    }
    here = next
  }
  out.segments.push([from, { x, y }, tone])
}

const heats = new WeakMap()

const heatOf = w => {
  if (!heats.has(w)) heats.set(w, { heat: new Float32Array(ROOM * ROOM), at: new Float32Array(ROOM * ROOM) })
  return heats.get(w)
}

const warm = (heat, at, now, dt) => Math.max(0, heat - Math.max(0, now - at - S.lens.gap) * S.lens.cool) + dt

const needOf = (p, m) => {
  const L = S.lens
  if (props(m).flammability) return L.lightAfter
  if (m === M.SAND) return L.glazeAfter
  if (m === M.MUD) return L.bakeAfter
  if (props(m).melts) return L.meltAfter
  if (KILNED.has(m) && owns(p, 'lens.kiln')) return L.kilnAfter
  return null
}

const heatCell = (g, p, { cell: [x, y], m }, dt) => {
  const i = y * ROOM + x
  const need = needOf(p, m)
  if (need === null || g.world.burn[i] > 0) return false
  const stock = heatOf(g.world)
  stock.heat[i] = warm(stock.heat[i], stock.at[i], g.time, dt)
  stock.at[i] = g.time
  if (stock.heat[i] < need) return false
  stock.heat[i] = 0
  if (KILNED.has(m)) {
    setCell(g.world, x, y, M.GLASS)
    tallyRule(g.world, 'glaze', m)
    return true
  }
  return bake(g.world, x, y)
}

const heatFoe = (g, p, e, dt) => {
  const L = S.lens
  if (owns(p, 'lens.dazzle')) {
    if (e.heavy) return false
    e.stun = Math.max(e.stun, L.dazzle)
    return false
  }
  e.lensHeat = warm(e.lensHeat ?? 0, e.lensAt ?? g.time, g.time, dt)
  e.lensAt = g.time
  e.lensClock = (e.lensClock ?? L.foeEvery) + dt
  if (e.lensClock >= L.foeEvery) {
    e.lensClock = 0
    hurt(g, e, L.foeDamage, 'player', 'FIRE')
  }
  if (e.lensHeat < L.igniteAfter || e.ablaze > 0) return false
  setAblaze(g, e)
  return true
}

const shine = (g, p, dt) => {
  const out = { segments: [], ends: [], turns: [] }
  const foes = hostile(g).filter(e => !e.intangible && !e.stowed).map(e => [e, shotBox(e)])
  beamFrom(g, p, muzzle(p), p.aim, S.lens.reach, S.lens.splits, S.lens.bounces, out, foes)
  out.ends.forEach(end => { end.changed = end.foe ? heatFoe(g, p, end.foe, dt) : heatCell(g, p, end, dt) })
  const beam = held(g, 'beam')
  if (beam) Object.assign(beam, out, { life: S.lens.linger })
  else addEffect(g, { kind: 'beam', ...out, life: S.lens.linger, tint: hue(p, 'lens', null), dazzle: owns(p, 'lens.dazzle') })
  return true
}

const lens = (g, p) => {
  shine(g, p, 0)
}

const lensFlow = (g, p, dt) => shine(g, p, dt)

const ringing = m => m === M.GLASS || m === M.VOLATILE || ICY.has(m)

const chimeCells = (g, here) => {
  const found = []
  forEachCell((x, y, point) => {
    const m = matAt(g.world, x, y)
    const d = distance(point, here)
    if (d <= S.chime.reach && ringing(m)) found.push({ x, y, d, m })
  })
  return found.sort((a, b) => a.d - b.d).slice(0, S.chime.most)
}

const piecesOf = ({ x, y, m }, here) => Array.from({ length: S.chime.shards }, (_, n) => ({
  x: (x + 0.5) * BLOCK + (n - 1) * 2, y: (y + 0.5) * BLOCK, mat: m === M.GLASS ? M.GLASS : M.ICE, from: here, seed: Math.random() * 6.28,
}))

const outwardFrom = piece => {
  const C = S.chime
  const a = Math.atan2(piece.y - piece.from.y, piece.x - piece.from.x || Math.random() - 0.5) + (Math.random() - 0.5) * C.scatter
  const v = C.speed[0] + Math.random() * (C.speed[1] - C.speed[0])
  return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - C.lift }
}

const lobAt = (from, to, speed) => {
  const t = Math.max(1, distance(from, to)) / speed
  return { vx: (to.x - from.x) / t, vy: (to.y - from.y) / t - 0.5 * TUNING.flung.gravity * t }
}

const watchStatues = g => {
  const watch = held(g, 'statues')
  if (watch) watch.life = Math.max(watch.life, S.chime.statueWatch)
  else addEffect(g, { kind: 'statues', life: S.chime.statueWatch })
}

export const prey = g => hostile(g).filter(e => !e.prop && !e.intangible && !e.stowed)

export const shardAt = (g, piece, foe = null) => {
  const C = S.chime
  const { vx, vy } = foe ? lobAt(piece, centre(foe), C.aimSpeed) : outwardFrom(piece)
  if (g.flung.length >= TUNING.flung.most) return
  g.flung.push({
    x: piece.x - 2, y: piece.y - 2, w: 4, h: 4, vx, vy, age: 0, life: C.life,
    mat: piece.mat, shard: true, safe: true, by: 'chime', cause: 'CRUSHED', damage: C.damage, armed: 0,
  })
  if (owns(g.player, 'chime.statue')) watchStatues(g)
}

export const turnToGlass = g => {
  const p = g.player
  const inset = S.chime.statueInset
  for (const e of g.enemies) {
    if (e.hp > 0 || e.flungBy !== 'chime' || e.lastCause !== 'CRUSHED' || e.statue || e.warden || e.partOf || e.prop) continue
    e.statue = true
    cellsUnder({ x: e.x + inset, y: e.y + inset, w: Math.max(1, e.w - inset * 2), h: Math.max(1, e.h - inset * 2) })
      .filter(([x, y]) => inPlay(x, y) && !props(matAt(g.world, x, y)).solid && !overlap(p, { x: x * BLOCK, y: y * BLOCK, w: BLOCK, h: BLOCK }))
      .forEach(([x, y]) => setCell(g.world, x, y, M.GLASS))
  }
}

const gather = (g, kind, pieces, life) => {
  const keep = held(g, kind)
  if (keep) {
    keep.pieces = [...keep.pieces, ...pieces].slice(-S.chime.piecesMost)
    keep.life = life
  } else if (pieces.length) addEffect(g, { kind, pieces: pieces.slice(-S.chime.piecesMost), life, clock: 0 })
}

const bellAround = (g, p) => {
  const [x0, x1] = [cell(p.x) - 1, cell(p.x + p.w - 0.01) + 1]
  const [y0, y1] = [cell(p.y) - 1, cell(p.y + p.h - 0.01) + 1]
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || y === y0 || y === y1) lay(g, p, x, y, M.GLASS)
  }
}

const peal = (g, p) => {
  const here = centre(p)
  const pieces = []
  for (const found of chimeCells(g, here)) {
    if (found.m === M.VOLATILE) {
      ignite(g.world, found.x, found.y)
      continue
    }
    setCell(g.world, found.x, found.y, M.EMPTY)
    tallyRule(g.world, 'shatter', found.m)
    chipsAt(g, (found.x + 0.5) * BLOCK, (found.y + 0.5) * BLOCK, found.m, 3)
    pieces.push(...piecesOf(found, here))
  }
  if (owns(p, 'chime.hover')) gather(g, 'hover', pieces, S.chime.hoverLife)
  else if (owns(p, 'chime.volley')) gather(g, 'volley', pieces, S.chime.volleyLife)
  else pieces.forEach(piece => shardAt(g, piece))
  addEffect(g, { kind: 'peal', x: here.x, y: here.y, life: S.chime.ringTime, broke: pieces.length, tint: hue(p, 'chime', null) })
  g.shake = Math.max(g.shake, pieces.length ? 3 : 1)
  g.pulse = Math.max(g.pulse, 0.4)
}

export const ringBell = g => peal(g, g.player)

const chime = (g, p) => {
  const bell = held(g, 'bell')
  if (owns(p, 'chime.bell') && !bell) {
    bellAround(g, p)
    addEffect(g, { kind: 'bell', life: S.chime.bellLife })
    return FREE
  }
  if (bell) Object.assign(bell, { life: 0, done: true })
  peal(g, p)
}

const jetFlow = (g, p, dt, skill) => {
  skill.clock = (skill.clock ?? 0) + dt
  while (skill.clock > S.ember.jetEvery) {
    skill.clock -= S.ember.jetEvery
    skill.count = (skill.count ?? 0) + 1
    jetBlob(g, p, skill.count)
  }
  return true
}

const kiteLift = (g, p, dt, skill) => {
  const G = S.gust
  p.vx += p.aim.x * G.kiteSteer * dt
  p.vy -= (p.aim.y > 0.5 ? G.kiteHover : 1) * G.kiteThrust * dt
  p.vy = Math.max(p.vy, -G.kiteMost)
  p.vx = Math.max(-G.kiteMost, Math.min(G.kiteMost, p.vx))
  p.drift = Math.max(p.drift, 0.1)
  p.jumpHeld = false
  skill.clock = (skill.clock ?? 0) + dt
  if (skill.clock > G.kiteEvery && !owns(p, 'gust.siphon') && !owns(p, 'gust.twister')) {
    skill.clock = 0
    gustCone(g, p)
  }
  return true
}

const driveOn = (g, p) => {
  const aim = p.aim.y !== 0 && p.aim.x === 0 ? p.aim : { x: p.facing * Math.abs(p.aim.x || 1), y: p.aim.y * 0.7 }
  p.vx = aim.x * S.dash.driveSpeed
  p.vy = aim.y * S.dash.driveSpeed
  p.dashing = 0.05
  p.dashAim = aim
  p.drift = 0.15
  p.iframes = Math.max(p.iframes, 0.1)
  p.jumpHeld = false
  return true
}

const swing = (g, p, dt) => {
  const rope = held(g, 'rope')
  if (!rope) return false
  const c = centre(p)
  const away = { x: c.x - rope.x, y: c.y - rope.y }
  const d = Math.max(1, Math.hypot(away.x, away.y))
  rope.length = Math.max(BLOCK * 2, rope.length - S.grapple.slingReel * dt)
  p.jumpHeld = false
  p.drift = Math.max(p.drift, 0.1)
  if (d <= rope.length) return true
  const out = { x: away.x / d, y: away.y / d }
  const outward = p.vx * out.x + p.vy * out.y
  if (outward > 0) {
    p.vx -= outward * out.x
    p.vy -= outward * out.y
  }
  p.vx -= out.x * S.grapple.slingPull * (d - rope.length) * dt
  p.vy -= out.y * S.grapple.slingPull * (d - rope.length) * dt
  return true
}

const letGo = (g, p) => {
  const rope = held(g, 'rope')
  if (!rope) return
  rope.life = 0
  rope.done = true
  p.drift = Math.max(p.drift, S.grapple.slingDrift)
}

const glideOn = g => held(g, 'glide') !== undefined

const glideOff = g => {
  const glide = held(g, 'glide')
  if (glide) Object.assign(glide, { life: 0, done: true })
}

const STREAMS = {
  'ember.jet': { run: jetFlow },
  'gust.kite': { run: kiteLift },
  'dash.drive': { run: driveOn },
  'grapple.sling': { run: swing, stop: letGo },
  'frost.glide': { run: glideOn, stop: glideOff },
  lens: { run: lensFlow },
}

export const streamOf = (p, kind) => ownedForms(p, kind).map(f => STREAMS[f.id]).filter(Boolean).at(-1) ?? STREAMS[kind]

export const SKILLS = {
  bolt, repel, ember, frost, hammer, gust, blink, grapple, dash, rewind, mason, seed, spring, acid, melt, alchemy,
  well, swap, stop, charm, decoy, drone, rod, mine, roar, mirror,
  lens, chime,
}

export const SKILL_NAMES = Object.fromEntries(Object.keys(SKILLS).map(k => [k, k.toUpperCase()]))

export const SKILL_DETAILS = {
  bolt: 'LIGHTNING. WATER AND METAL CARRY IT.',
  repel: 'PUSHES METAL, OR PUSHES YOU OFF METAL.',
  ember: 'LOBS FIRE.',
  frost: 'FREEZES WATER AND FOES.',
  hammer: 'BREAKS BLOCKS.',
  gust: 'BLOWS GAS AND FOES.',
  blink: 'TELEPORT THROUGH ANYTHING.',
  grapple: 'HOOK WALLS AND FOES.',
  dash: 'A BURST THAT HITS.',
  rewind: 'GO BACK A FEW SECONDS.',
  mason: 'BUILDS BLOCKS.',
  seed: 'GROWS A CLIMBABLE VINE.',
  spring: 'POURS WATER.',
  acid: 'DISSOLVES BLOCKS AND HURTS FOES.',
  melt: 'TURNS ROCK TO LAVA.',
  alchemy: 'CHANGES LIQUIDS.',
  well: 'A SMALL BLACK HOLE.',
  swap: 'TRADE PLACES WITH A FOE.',
  stop: 'STOPS TIME.',
  charm: 'A FOE FIGHTS FOR YOU.',
  decoy: 'A DUMMY THAT FOES ATTACK.',
  drone: 'A HELPER THAT SHOOTS.',
  rod: 'PULSES CHARGE.',
  mine: 'EXPLODES WHEN A FOE COMES NEAR.',
  roar: 'STUNS AND SCATTERS.',
  mirror: 'THROWS SHOTS BACK.',
  lens: 'HOLD FOR A BEAM THAT HEATS WHAT IT HITS.',
  chime: 'BREAKS NEARBY GLASS AND ICE INTO FLYING SHARDS.',
}

export const spillNapalm = (g, x, y) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1]]) {
    puff(g.world, x + dx, y + dy, M.OIL, [1, 1])
    ignite(g.world, x + dx, y + dy)
  }
}
