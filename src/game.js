import { BLOCK, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, createWorld, encodeWorld, energize, explode, ignite, loosen, matAt, puff, restoreWorld, setCell, stepWorld, vineAt } from './world.js'
import { STARTERS, TITLE_ROOM } from './room.js'
import { beginMoment, stepMoment } from './moment.js'
import { LOCK_CELLS, THEMES, WATER_FOES, generateRoom } from './generate.js'
import { CORE_RING, OPPOSITE, buildMap, keyOf, loopRooms, ringOf } from './map.js'
import { WORLD_PX, cell, centre, hitsSolid, liquidAtPx, miredAtPx, move, moveAxis, nudgeOutOfSolid, overlap, pushOutOfSolid, solidAt, unbury } from './physics.js'
import { LOOSE_EVENTS, stepMagnets } from './loose.js'
import { applyCrush, applyHazards, burst, hurt, settled, steady } from './combat.js'
import { contactBox, shotBox } from './cast.js'
import { ENEMY_DEFS, STEPPERS, clampToRoom, createEnemy, lineClear, onDeath, puppeted, seatEnemy, settleFooting, steerPuppet } from './enemies.js'
import { swim } from './earth.js'
import { FORKS, SKILLS, SKILL_DETAILS, SKILL_NAMES, TREES, charmOne, cooldownOf, formOf, landSlam, muzzle, openFork, owns, pourAcid, recordTrail, releaseMatter, ring, salvage, burstGuts, spillNapalm, stepDash, torchNear, zap } from './skills.js'
import { feedColour, feedEvent, stepFeeds, stepHand } from './feed.js'
import { composeOffer } from './offers.js'
import { dust } from './feel.js'
import { beginDoor, blastFx, chipsAt, coinMote, createFx, fallFx, impact, killFx, levelBurstDone, roomClearFx, shotFx, slowMo, splash, stepFx, timeScale, wallHitFx, xpMotes } from './fx.js'
import { SKILL_ACTIONS, skillAction } from './controls.js'
import { RELICS, RELIC_BY_ID, hasRelic } from './relics.js'
import { stepEffectList } from './effects.js'
import { dropCard, openChoice, openMenu, openPause, openSummary, openSwap, openTitle, slotsFull, stepMenus } from './menus.js'
import { clearRun, knownNotes, loadRun, persist, recordRun, save, saveRun } from './store.js'
import { isCatalogued, isKnown, knownFrom, knownOf, meet, pickSecrets, plantsFor, rollOmen, showReveal } from './discover.js'
import { OMENS, applyOmens, omenFoes, omenTheme } from './omens.js'
import { buildArena, openArena, stepArena } from './wardens.js'
import { exitsFrom } from './reach.js'
import { stageFor } from './showcase.js'
import { KEYSTONE_BY_ID, bombReady, bombThrown, castWait, crowdedOut, hasKeystone, heartCap, openKeystones, rechargeRate, slotsOf, stainColour, stainStrikes, stepKeystones } from './keystones.js'
import { MUTATION_BY_ID, deepKill, mutateFoe, rollMutation, stepMutations } from './deep.js'
import { emptyTally, noteKill, outwitted, wardedAgainst } from './wards.js'
import { driftFoe, heroPull } from './float.js'
import { blastPockets, pocketAt, seedPockets, stepPockets } from './pockets.js'

const P = TUNING.player
const R = TUNING.run
const K = R.keystones
const DEEP = R.deep
const FLOAT = TUNING.skills.float
const ALL_SKILLS = Object.keys(SKILLS)
const ALL_SKILLS_EVER = new Set([...ALL_SKILLS, 'echo', 'pact', 'decoy', 'rod', 'mirror'])
const ALL_FORMS = new Set(Object.values(TREES).flat().map(f => f.id))

const shuffled = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v)

const createPlayer = ({ x, row }) => ({
  x, y: row * BLOCK - P.height, w: 6, h: P.height,
  vx: 0, vy: 0, hp: P.hp, iframes: 0, stun: 0, facing: 1, crouching: false,
  grounded: false, sinceGround: 1, sinceJump: 1, jumpHeld: false,
  shotReady: 0, skills: [], upgrades: new Set(), relics: new Set(), aim: { x: 1, y: 0 }, drift: 0,
  wasJump: false, wasSkills: [false, false, false, false], bombs: P.startBombs, wasBomb: false,
  airJumps: 0, dashing: 0, trail: [], clinging: 0, keystones: new Set(),
})

const nextRelic = g => g.relicPool.shift() ?? null

const createCard = g => ({ kind, x, row, relic }) => {
  const resolved = kind === 'skill' ? g.cardPool.shift() ?? 'chest' : kind
  return { kind: resolved, x, y: row * BLOCK - 13, w: 12, h: 12, relic: resolved === 'chest' || resolved === 'altar' ? relic ?? nextRelic(g) : undefined }
}

const createWare = g => ({ kind, x, row }) => ({
  kind, x, y: row * BLOCK - 12, w: 12, h: 12, price: TUNING.prices[kind],
  relic: kind === 'relic' ? nextRelic(g) : undefined,
})

const lean = g => {
  const owned = new Set(g.player.skills.map(s => s.kind))
  return {
    metal: owned.has('repel') || owned.has('bolt'),
    water: owned.has('bolt') || owned.has('frost') || owned.has('flask'),
    fuel: owned.has('ember') || owned.has('gust') || owned.has('wick'),
    scrap: owned.has('repel'),
  }
}

const depthFor = (g, ring) => {
  const distance = ring / CORE_RING
  const wake = g.loop ? DEEP.wake[Math.min(g.loop, DEEP.wake.length) - 1] : R.wakeDepth
  return g.awake ? wake + (1 - wake) * distance : distance
}

const LOCK_OPENERS = {
  peat: ['bolt', 'ember', 'hammer', 'melt', 'acid', 'blink', 'dash', 'wick', 'burrow', 'lens'],
  gate: ['bolt', 'acid', 'blink', 'melt', 'wick'],
  brick: ['hammer', 'melt', 'acid', 'blink', 'mine', 'wick'],
  ice: ['ember', 'hammer', 'melt', 'blink', 'alchemy', 'wick', 'lens', 'chime'],
  scrap: ['repel', 'hammer', 'well', 'grapple', 'acid', 'blink'],
}
const LOCKS = Object.keys(LOCK_OPENERS)

const pickLock = (g, depth) => {
  const owned = g.player.skills.map(s => s.kind)
  const usable = LOCKS.filter(lock => LOCK_OPENERS[lock].some(s => owned.includes(s)))
  const leaning = usable.length > 0 && Math.random() < (1 - depth) * R.lockLean
  const pool = leaning ? usable : LOCKS
  return pool[Math.floor(Math.random() * pool.length)]
}

const resolveLinks = (g, links, depth) =>
  Object.fromEntries(Object.entries(links).map(([dir, link]) => {
    if (link.lock === 'any') link.lock = pickLock(g, depth)
    return [dir, link]
  }))

const EVENTS = ['arena', 'flood', 'gasworks', 'collapse', 'vault', 'nest', 'altar', 'chest', 'chest']

const REWARDS = new Set(['arena', 'vault', 'altar', 'chest'])

const rollEvent = g => {
  if (Math.random() > R.eventChance) return null
  const open = EVENTS.filter(id => isKnown(g, 'event', id))
  const pick = list => list[Math.floor(Math.random() * list.length)] ?? null
  const rolled = pick(open)
  if (!REWARDS.has(rolled) || Math.random() < R.rewardKeep) return rolled
  return pick(open.filter(id => !REWARDS.has(id)))
}

const BAND_OF_RING = [0, 0, 1, 1, 2, 2, 3]

const regionFor = (g, ring) => (ring === CORE_RING ? CORE_RING : g.bands[BAND_OF_RING[ring]])

const chooseBands = starter => {
  const first = starter.theme ?? 0
  const others = shuffled([0, 1, 2, 3, 4, 5, 6].filter(t => t !== first))
  return [first, ...others.slice(0, 3)]
}

const chooseBandFoes = (bands, known, secrets) => bands.map(theme => {
  const local = THEMES[theme].foes.filter(kind => known.has(`foe:${kind}`))
  const fresh = local.filter(kind => secrets.includes(`foe:${kind}`))
  const rest = shuffled(local.filter(kind => !fresh.includes(kind)))
  return [...fresh, ...rest].slice(0, 5)
})

const MIN_RING = {
  spore: 1, gasbag: 1, bomber: 1, imp: 1, emberbat: 1, slime: 1, crab: 1, pillbug: 1, snapweed: 1, dripper: 1, gnat: 1, mimic: 1,
  stilt: 2, urchin: 2, coil: 2, scrapper: 2, jelly: 2, puffer: 2, shade: 3, lantern: 3, worm: 3,
}

const fitsRing = ring => kind => (MIN_RING[kind] ?? 0) <= ring

const regionTheme = (g, ring, index) => {
  const band = BAND_OF_RING[ring]
  const roster = (g.bandFoes[band] ?? []).filter(fitsRing(ring))
  return omenTheme(g.omens, {
    ...THEMES[index],
    roster: roster.length ? roster : ['crawler'],
    swimmers: WATER_FOES.filter(kind => isKnown(g, 'foe', kind)).filter(fitsRing(ring)),
    worm: isKnown(g, 'foe', 'worm') && fitsRing(ring)('worm'),
    mimics: isKnown(g, 'foe', 'mimic') && fitsRing(ring)('mimic'),
  })
}

const INHABITANTS = [
  ['hermit', () => R.hermitChance],
  ['miner', () => R.minerChance],
  ['mole', () => R.moleChance],
]

const rollInhabitant = g => INHABITANTS.find(([id, chance]) => isKnown(g, 'inhabitant', id) && Math.random() < chance())?.[0] ?? null

const rollSpecial = g => ({
  event: rollEvent(g),
  card: Math.random() < R.cardChance,
  inhabitant: rollInhabitant(g),
})

const PLANTERS = {
  skill: (special, id) => { special.plantCard = id },
  relic: (special, id) => { special.plantChest = id },
  foe: (special, id) => { special.force = id },
  event: (special, id) => { special.event = id },
  inhabitant: (special, id) => { special.inhabitant = id },
}

const REWARD_PLANTS = new Set(['skill', 'relic'])

const plantDue = (g, ring) => g.plants.find(plant =>
  !plant.done && PLANTERS[plant.kind] && g.roomsSeen >= (REWARD_PLANTS.has(plant.kind) ? R.plantRewardAfter : R.plantAfterRooms) &&
  (plant.order === 0 || ring >= R.plantAtRing))

const withPlant = (g, ring, special) => {
  const plant = plantDue(g, ring)
  if (!plant) return special
  PLANTERS[plant.kind](special, plant.id)
  plant.done = true
  return special
}

const ELITES = ['burning', 'charged', 'magnetic']

const makeElite = (g, ring) => e => {
  const chance = ring * TUNING.enemies.elite.chancePerRing + (g.loop ?? 0) * DEEP.eliteChance
  if (e.friendly || e.heavy || Math.random() > chance) return e
  const elite = ELITES[Math.floor(Math.random() * ELITES.length)]
  return {
    ...e,
    elite,
    hp: Math.ceil(e.hp * TUNING.enemies.elite.hp),
    fireproof: e.fireproof || elite === 'burning',
    insulated: e.insulated || elite === 'charged',
    magnetic: e.magnetic || elite === 'magnetic',
  }
}

const arenaFor = (g, key, ring) => {
  if (ring === CORE_RING) return 'core'
  return g.wardenAt[key] === undefined ? null : g.wardens[g.wardenAt[key]].id
}

const dressEnemy = (g, ring) => e => {
  const loop = g.loop ?? 0
  if (e.warden) {
    const hp = Math.ceil(e.hp * (ring === CORE_RING ? 1 : 1 + ring * R.wardenHpPerRing) * (1 + loop * DEEP.wardenHp))
    return { ...e, hp, maxHp: hp, asleep: true, pace: (TUNING.enemies.warden.pace[ring] ?? 1) * DEEP.pace ** loop, tier: loop > 0 || ring >= 5 ? 2 : ring >= 3 ? 1 : 0 }
  }
  const omen = omenFoes(g.omens)
  return {
    ...e,
    magnetic: e.magnetic || (Boolean(omen.magnetic) && !e.friendly),
    cooldown: e.cooldown + R.entryGrace,
    hp: e.friendly ? e.hp : Math.max(1, Math.ceil(e.hp * (1 + ring * R.hpPerRing) * (1 + loop * DEEP.foeHp) * (omen.hp ?? 1))),
  }
}

const crowding = e => (e.friendly || e.prop || e.warden || e.partOf ? 0 : e.kind === 'gnat' ? 0.2 : 1)

const NEST_FOES = new Set(['bat', 'emberbat', 'gnat', 'spore', 'slime', 'tick', 'crawler', 'pillbug', 'urchin', 'imp', 'gasbag', 'shade'])

const broodFor = (g, ring) => count => {
  const regions = shuffled([0, 1, 2, 3, 4, 5, 6])
    .map(region => THEMES[region].foes.filter(kind => NEST_FOES.has(kind) && isKnown(g, 'foe', kind) && fitsRing(ring)(kind)))
    .filter(kinds => kinds.length)
  const kinds = regions[0] ?? ['crawler']
  return Array.from({ length: count }, () => kinds[Math.floor(Math.random() * kinds.length)])
}

const floorUnder = (world, x, y) => {
  for (let row = y; row < WORLD_PX / BLOCK - 1; row++) if (props(matAt(world, x, row + 1)).solid) return row + 1
  return y + 1
}

const POCKET_HOOKS = {
  foe: (g, kind, x, y) => {
    const load = g.enemies.reduce((n, e) => n + crowding(e), 0)
    if (load >= R.foeLimit[g.ring] + TUNING.pockets.foeHeadroom) return false
    const def = ENEMY_DEFS[kind]
    const e = dressEnemy(g, g.ring)(createEnemy({ kind, x: x - def.size[0] / 2, y: y - def.size[1] / 2 }))
    g.enemies.push(e)
    knownNotes.add(`met:${kind}`)
    return true
  },
  chest: (g, pocket) => {
    const relic = nextRelic(g)
    if (!relic) return false
    const x = pocket.x + Math.floor(pocket.w / 2)
    g.cards.push({ kind: 'chest', x: x * BLOCK - 2, y: floorUnder(g.world, x, pocket.y + pocket.h - 1) * BLOCK - 13, w: 12, h: 12, relic })
    return true
  },
}

const thinFoes = (g, ring, extra, foes) => {
  const limit = R.foeLimit[ring] * (g.omens.includes('swarm') ? 1.6 : 1) + extra
  const kept = []
  const protectedKinds = new Set((g.secrets ?? []).map(key => key.split(':')[1]))
  let load = foes.filter(e => protectedKinds.has(e.kind)).reduce((n, e) => n + crowding(e), 0)
  for (const e of shuffled(foes)) {
    if (protectedKinds.has(e.kind) || crowding(e) === 0) kept.push(e)
    else if (load + crowding(e) <= limit) {
      load += crowding(e)
      kept.push(e)
    }
  }
  return kept
}

const buildRoom = (g, x, y) => {
  const key = keyOf(x, y)
  const ring = ringOf(x, y)
  const links = g.map.links[key] ?? {}
  const start = key === keyOf(...g.map.start) && !g.quick && !g.loop
  const depth = ring / CORE_RING
  const themeIndex = regionFor(g, ring)
  const arenaId = arenaFor(g, key, ring)
  const showcase = start || arenaId || ring === CORE_RING ? null : stageFor(g.showcase)
  if (showcase) g.showcase = null
  const special = start || arenaId ? {} : { ...withPlant(g, ring, rollSpecial(g)), ...(showcase ? { layouts: showcase.layouts, crowd: showcase.crowd } : {}) }
  const definition = arenaId
    ? buildArena(arenaId, links)
    : start
      ? g.starter
      : generateRoom({
        seed: g.seed + x * 7919 + y * 104723,
        depth,
        links: resolveLinks(g, links, depth),
        lean: showcase ? { ...lean(g), ...Object.fromEntries(Object.entries(showcase.lean).filter(([, on]) => on)), full: true } : lean(g),
        special,
        theme: regionTheme(g, ring, themeIndex),
        themeIndex,
      })
  const world = createWorld(definition.map, ring === CORE_RING || hasKeystone(g.player, 'overload'))
  world.drains = definition.drains ?? []
  world.cold = THEMES[themeIndex]?.cold === true
  if (!arenaId && !start && ring !== CORE_RING) {
    world.pockets = seedPockets(world, { ring, region: themeIndex, doors: definition.doors, brood: broodFor(g, ring), relics: g.relicPool.length > 0, prefer: showcase?.pockets })
  }
  return {
    x, y, ring, links,
    theme: themeIndex,
    event: special.event ?? null,
    safetyNet: start && g.starter.safetyNet,
    layout: definition.layout,
    passed: definition.passed ?? true,
    doors: definition.doors,
    world,
    arena: definition.arena,
    enemies: thinFoes(g, ring, showcase?.crowd ?? 0, definition.enemies.map(createEnemy).map(seatEnemy(world)).filter(Boolean)).map(makeElite(g, ring)).map(dressEnemy(g, ring)).map(e => mutateFoe(g, e, themeIndex)),
    cards: definition.cards.map(createCard(g)),
    wares: (definition.wares ?? []).map(createWare(g)),
    pickups: [],
    visited: false,
  }
}

const settleFlung = (g, f) => {
  if (f.shard) return
  const x = cell(f.x + f.w / 2)
  const y = cell(f.y + f.h / 2)
  const spot = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, -2]].find(([dx, dy]) => !props(matAt(g.world, x + dx, y + dy)).solid)
  if (!spot) return
  setCell(g.world, x + spot[0], y + spot[1], f.mat ?? M.SCRAP)
  if (f.live) energize(g.world, x + spot[0], y + spot[1], TUNING.skills.repel.currentEnergy)
}

const leaveRoom = g => {
  g.flung.forEach(f => settleFlung(g, f))
  Object.assign(g.rooms[keyOf(g.x, g.y)], { enemies: g.enemies, cards: g.cards, wares: g.wares, pickups: g.pickups })
}

const wardenRingsOf = g => (g.loop ? DEEP.wardenRings : R.wardenRings)

const placeWarden = (g, x, y) => {
  const ring = ringOf(x, y)
  const slot = wardenRingsOf(g).indexOf(ring)
  if (slot < 0 || g.wardens[ring] || ring < (g.quickRing ?? 0)) return
  const rooms = loopRooms(g.map, [x, y], ring).filter(r => r.steps > 0)
  const [near, far] = R.wardenWalk
  const close = rooms.filter(r => r.steps >= near && r.steps <= far)
  const pool = close.length ? close : rooms.sort((a, b) => b.steps - a.steps).slice(0, 1)
  if (pool.length === 0) return
  const { cell: spot } = pool[Math.floor(Math.random() * pool.length)]
  g.wardens[ring] = { id: g.wardenOrder[slot], x: spot[0], y: spot[1], dead: false }
  g.wardenAt[keyOf(...spot)] = ring
}

const openCoreSeals = (g, room) => {
  if (room.sealsOpen || g.seals < R.wardenRings.length) return
  for (const [dir, link] of Object.entries(room.links)) {
    if (link.lock !== 'seal' || !room.doors[dir]) continue
    room.sealsOpen = true
    for (const [x, y] of LOCK_CELLS[dir](room.doors[dir])) setCell(room.world, x, y, M.EMPTY)
  }
}

const meetInhabitants = (g, room) => {
  for (const e of room.enemies) {
    if (e.warden) meet(g, 'warden', e.kind)
    else if (e.friendly) meet(g, 'inhabitant', e.kind)
    else meet(g, 'foe', e.kind)
  }
  if (room.event) meet(g, 'event', room.event)
}

const enterRoom = (g, x, y) => {
  const key = keyOf(x, y)
  placeWarden(g, x, y)
  g.rooms[key] ??= buildRoom(g, x, y)
  if (g.player) g.player.iframes = Math.max(g.player.iframes, TUNING.feel.entryShield)
  g.player?.skills.forEach(skill => { skill.encore = 0 })
  const room = g.rooms[key]
  const firstVisit = !room.visited
  room.visited = true
  room.world.notes = knownNotes
  room.world.mat.forEach(m => knownNotes.add(`seen:${m}`))
  room.enemies.forEach(e => knownNotes.add(`met:${e.kind}`))
  openCoreSeals(g, room)
  if (firstVisit) g.roomsSeen += 1
  const warden = firstVisit && room.enemies.find(e => e.warden)
  Object.assign(g, {
    x, y,
    ring: room.ring,
    world: room.world,
    enemies: room.enemies,
    cards: room.cards,
    wares: room.wares,
    pickups: room.pickups,
    depth: g.depthOverride ?? depthFor(g, room.ring),
    shots: [], fireballs: [], flung: [], bolts: [], particles: [], popups: [], effects: (g.effects ?? []).filter(f => f.kind === 'orbit' && !f.done), spawns: [], rings: [], lights: [], ripples: [],
    timeStop: 0,
    wasHolding: false,
    boss: null,
    roomHp: g.player?.hp ?? P.hp,
  })
  if (firstVisit) {
    if (warden) showToast(g, `THE ${warden.kind.toUpperCase()}`)
    else if (room.theme !== g.lastTheme) showToast(g, THEMES[room.theme].name)
    g.lastTheme = room.theme
    if (g.phase === 'playing') meetInhabitants(g, room)
  }
  if (room.ring > g.deepestRing) {
    g.deepestRing = room.ring
    award(g, room.ring * R.ringBonus)
  }
}

const arriveBy = (g, dir, from) => {
  g.hinted = false
  beginDoor(g, dir, from)
  const p = g.player
  const door = g.rooms[keyOf(g.x, g.y)].doors[OPPOSITE[dir]]
  if (dir === 'right' || dir === 'left') {
    p.x = dir === 'right' ? 1 : WORLD_PX - p.w - 1
    p.y = (door.row + 2) * BLOCK - p.h
    p.vy = Math.min(p.vy, 0)
  } else {
    p.x = (door.col + 1) * BLOCK - p.w / 2
    p.y = dir === 'down' ? 1 : WORLD_PX - p.h - 1
    p.vy = dir === 'up' ? -P.jump : Math.max(p.vy, 0)
    p.grounded = false
    p.sinceGround = 1
    p.jumpHeld = false
  }
}

const walkThrough = (g, dir) => {
  const here = g.rooms[keyOf(g.x, g.y)]
  const [nx, ny] = here.links[dir].to
  releaseMatter(g)
  leaveRoom(g)
  enterRoom(g, nx, ny)
  arriveBy(g, dir, here)
  storeRun(g)
}

const RUN_FIELDS = [
  'seed', 'map', 'x', 'y', 'awake', 'roomsSeen', 'deepestRing', 'cardPool', 'score', 'chainPeak',
  'xp', 'level', 'nextLevel', 'gold', 'kills', 'environmentKills', 'pendingOffers', 'relicPool', 'lastTheme', 'quick', 'quickRing',
  'bands', 'bandFoes', 'omen', 'flocking', 'secrets', 'plants', 'foundThisRun', 'wardens', 'wardenAt', 'wardenOrder', 'seals', 'cleanClears', 'mercyBombs',
  'loop', 'omens', 'mutations', 'tally', 'recent', 'keystoneDue', 'bestBeaten', 'wardenWins', 'outwits',
]

const packRoom = room => ({
  x: room.x, y: room.y, ring: room.ring, doors: room.doors, visited: room.visited,
  theme: room.theme, event: room.event, sealed: room.sealed, cleared: room.cleared, safetyNet: room.safetyNet, healed: room.healed, layout: room.layout,
  arena: room.arena, sealCells: room.sealCells, hadFoes: room.hadFoes, hurtHere: room.hurtHere, sealsOpen: room.sealsOpen,
  enemies: room.enemies, cards: room.cards, wares: room.wares, pickups: room.pickups,
  drains: room.world.drains, world: encodeWorld(room.world), pockets: room.world.pockets,
})

const unpackRoom = (packed, map, overloaded) => {
  const world = restoreWorld(packed.world, packed.ring === CORE_RING || overloaded, packed.drains)
  world.cold = THEMES[packed.theme]?.cold === true
  world.pockets = packed.pockets ?? []
  const { pockets, ...rest } = packed
  return { ...rest, links: map.links[keyOf(packed.x, packed.y)] ?? {}, world }
}

const storeRun = g => {
  if (g.phase !== 'playing') return
  leaveRoom(g)
  g.flung = []
  saveRun({
    ...Object.fromEntries(RUN_FIELDS.map(f => [f, g[f]])),
    player: { ...g.player, upgrades: [...g.player.upgrades], relics: [...g.player.relics], keystones: [...g.player.keystones], trail: [] },
    rooms: Object.fromEntries(Object.entries(g.rooms).map(([key, room]) => [key, packRoom(room)])),
  })
  persist()
}

const showToast = (g, title, sub = '') => { g.toast = { title, sub, life: R.toastLife, born: R.toastLife } }

const ringCells = (map, ring) =>
  Object.keys(map.links)
    .map(key => key.split(',').map(Number))
    .filter(([x, y]) => ringOf(x, y) === ring)

const QUICK_SKIPS = new Set(['slough', 'monomania', 'fourth', 'overload', 'quarry'])

const applyQuickstart = (g, ring) => {
  const p = g.player
  const kinds = shuffled(knownOf(g, 'skill')).slice(0, Math.min(P.skillSlots, 1 + ring))
  p.skills = kinds.map(kind => ({ kind, ready: 0 }))
  for (let n = 0; n < ring * 2; n++) {
    const [pick] = shuffled(availableUpgrades(p))
    if (pick) p.upgrades.add(pick.node.id)
  }
  g.relicPool.splice(0, ring).forEach(id => p.relics.add(id))
  for (let n = 0; n < g.seals; n++) {
    const [pick] = shuffled(openKeystones(p, g.known).filter(k => !QUICK_SKIPS.has(k.id)))
    if (pick) p.keystones.add(pick.id)
  }
  applyRelic(p)
  p.hp = heartCap(p)
  p.bombs = 1 + ring
  g.gold = ring * 4
  g.level = 1 + ring * 2
  g.nextLevel = R.firstLevel + (g.level - 1) * R.levelGrowth
  g.cardPool = g.cardPool.filter(kind => !kinds.includes(kind))
  g.awake = true
}

const placeAtDoor = g => {
  const room = g.rooms[keyOf(g.x, g.y)]
  const [dir, door] = Object.entries(room.doors)[0]
  const p = g.player
  if (dir === 'left' || dir === 'right') {
    p.x = dir === 'left' ? 9 : WORLD_PX - p.w - 9
    p.y = (door.row + 2) * BLOCK - p.h
  } else {
    p.x = (door.col + 1) * BLOCK - p.w / 2
    p.y = dir === 'up' ? 9 : WORLD_PX - p.h - 9
  }
  p.iframes = TUNING.feel.entryShield * 2
}

const WARDEN_KINDS = ['bellows', 'colossus', 'crucible', 'eel', 'brood', 'conductor']

const chooseWardens = (known, secrets) => {
  const fresh = secrets.filter(key => key.startsWith('warden:')).map(key => key.split(':')[1])
  const owned = [...known].filter(key => key.startsWith('warden:')).map(key => key.split(':')[1]).filter(id => !fresh.includes(id))
  const order = [...fresh, ...shuffled(owned)].slice(0, R.wardenRings.length)
  return order[0] === 'crucible' ? [...order.slice(1, 2), 'crucible', ...order.slice(2)] : order
}

const createRun = (depthOverride, quickRing = null, discovering = false) => {
  const seed = Math.floor(Math.random() * 1e9)
  const map = buildMap(seed)
  const starter = STARTERS[Math.floor(Math.random() * STARTERS.length)]
  const firstCard = starter.cards[0].kind
  const fresh = discovering && quickRing === null
  const secrets = fresh ? pickSecrets() : []
  const known = knownFrom(secrets)
  const omen = fresh ? rollOmen(secrets) : null
  const omens = omen ? [omen] : []
  applyOmens(omens)
  const bands = chooseBands(starter)
  const g = {
    map,
    starter,
    quick: quickRing !== null,
    quickRing,
    taught: new Set(),
    hurtFlash: 0,
    hitstop: 0,
    looking: false,
    dustClock: 0,
    roomsSeen: 0,
    deepestRing: 0,
    depthOverride,
    awake: false,
    shownDepth: depthOverride ?? 0,
    seed,
    known,
    secrets,
    plants: plantsFor(secrets).map(plant => ({ ...plant, done: !PLANTERS[plant.kind] })),
    foundThisRun: [],
    reveal: null,
    revealQueue: [],
    omen,
    omens,
    flocking: omenFoes(omens).flock === true,
    loop: 0,
    mutations: [],
    tally: emptyTally(),
    recent: emptyTally(),
    keystoneDue: false,
    keystoneOffer: null,
    sealHold: false,
    bestBeaten: false,
    wardenWins: 0,
    outwits: 0,
    echoes: [],
    tempo: 1,
    bands,
    bandFoes: chooseBandFoes(bands, known, secrets),
    wardenOrder: chooseWardens(known, secrets),
    wardens: {},
    wardenAt: {},
    seals: quickRing === null ? 0 : R.wardenRings.filter(ring => ring < quickRing).length,
    boss: null,
    ending: null,
    cleanClears: 0,
    cardPool: shuffled(knownOf({ known }, 'skill').filter(s => s !== firstCard)),
    relicPool: shuffled(RELICS.map(r => r.id).filter(id => known.has(`relic:${id}`))),
    effects: [],
    spawns: [],
    timeStop: 0,
    matterHeld: false,
    evolving: null,
    past: [],
    lastTheme: bands[0],
    time: 0,
    phase: 'playing',
    phaseTime: 0,
    pause: 0,
    pulse: 0,
    shake: 0,
    rooms: {},
    player: createPlayer(starter.spawn),
    flung: [],
    score: 0,
    best: save.best,
    chain: 0,
    chainPeak: 0,
    chainTime: 0,
    xp: 0,
    level: 1,
    nextLevel: R.firstLevel,
    gold: 0,
    kills: 0,
    environmentKills: 0,
    menus: [],
    menuHeld: {},
    menuRepeat: {},
    wasPause: false,
    wasSkillsPage: false,
    pendingOffers: 0,
    moment: null,
    afterMoment: null,
    depthDrive: null,
    rekindle: 0,
    newBest: false,
    summaryShown: false,
    ...createFx(),
  }
  if (quickRing !== null) {
    applyQuickstart(g, quickRing)
    const cells = ringCells(map, quickRing)
    const [x, y] = cells[Math.floor(Math.random() * cells.length)]
    g.deepestRing = quickRing
    g.lastTheme = -1
    enterRoom(g, x, y)
    placeAtDoor(g)
    g.shownDepth = g.depth
  } else {
    enterRoom(g, ...map.start)
    if (save.runs === 0) g.toast = { prompts: ['move', 'jump', 'shoot'], life: 7, born: 7 }
    if (omen && !meet(g, 'omen', omen)) showReveal(g, 'omen', omen)
  }
  if (fresh) persist()
  return g
}

export const createGame = (depthOverride = null, phase = 'playing', quickRing = null) => {
  const g = createRun(depthOverride, quickRing, phase === 'playing')
  if (phase === 'title') {
    Object.assign(g, {
      phase: 'title', titleTime: 0, toast: null, shownDepth: 0.25,
      world: createWorld(TITLE_ROOM.map, false), enemies: [], cards: [], wares: [], pickups: [],
      player: { ...createPlayer(TITLE_ROOM.spawn), grounded: true },
    })
    openTitle(g)
  }
  return g
}

const availableUpgrades = p =>
  p.skills.flatMap(({ kind }) => openFork(p, kind).map(node => ({ type: 'upgrade', skill: kind, node })))

const unownedSkills = g => {
  const carried = new Set(g.player.skills.map(s => s.kind))
  const lying = new Set(g.cards.map(c => c.kind))
  return knownOf(g, 'skill').filter(s => !carried.has(s) && !lying.has(s))
}

const unveil = (g, kind, tint) => {
  const c = centre(g.player)
  ring(g, c.x, c.y, tint, 32, 150)
  ring(g, c.x, c.y, tint, 64, 90)
  slowMo(g, R.unveilSlow, R.unveilScale)
  g.pulse = 1
  g.shake = Math.max(g.shake, 4)
  g.player.iframes = Math.max(g.player.iframes, 1.2)
  g.showcase = kind
}

const evolve = (g, skill, node) => {
  g.player.upgrades.add(node.id)
  g.evolving = { skill, name: node.name, tint: node.tint, life: R.evolveLife }
  unveil(g, skill, node.tint)
}

const learn = (g, kind) => {
  const p = g.player
  p.skills.push({ kind, ready: 0 })
  g.cardPool = g.cardPool.filter(s => s !== kind)
  showToast(g, SKILL_NAMES[kind], SKILL_DETAILS[kind])
  g.toast.prompts = [skillAction(p.skills.length - 1)]
  unveil(g, kind, feedColour({ kind }))
  if (!g.awake) {
    g.awake = true
    g.depth = g.depthOverride ?? depthFor(g, g.ring)
  }
}

const learnOrSwap = (g, kind, onTake = () => {}, onLeave = () => {}) => {
  meet(g, 'skill', kind)
  if (!slotsFull(g.player)) {
    learn(g, kind)
    onTake(g)
    return
  }
  openSwap(g, kind, gm => {
    gm.cardPool = gm.cardPool.filter(s => s !== kind)
    showToast(gm, SKILL_NAMES[kind], SKILL_DETAILS[kind])
    unveil(gm, kind, feedColour({ kind }))
    onTake(gm)
  }, onLeave)
}

const OPTION_RESULTS = {
  new: (g, { kind }) => {
    learnOrSwap(g, kind, () => {}, gm => dropCard(gm, kind))
  },
  upgrade: (g, option) => {
    evolve(g, option.skill, option.node)
  },
  relic: g => gainRelic(g, nextRelic(g)),
  mend: g => {
    g.player.hp = heartCap(g.player)
    g.player.bombs += 1
    g.pulse = 1
  },
}

const chooseOption = (g, option) => {
  g.menus.pop()
  OPTION_RESULTS[option.type](g, option)
  if (g.menus.length === 0) {
    g.player.wasJump = true
    g.player.wasBomb = true
  }
}

const openOffer = (g, kinds = ['new', 'upgrade'], title = 'LEVEL UP') => {
  const options = composeOffer(g, kinds, unownedSkills(g), slotsFull(g.player))
  if (options.length === 0) return
  openMenu(g, {
    page: 'offer',
    layout: 'cards',
    back: false,
    title,
    items: options.map(option => ({ option, card: option.card, run: gm => chooseOption(gm, option) })),
  })
}

const addPopup = (g, x, y, text, colour = 'white') => g.popups.push({ x, y, text, colour, life: 1.1 })

const gainRelic = (g, id) => {
  if (!id) {
    g.score += 250
    g.gold += 8
    return
  }
  meet(g, 'relic', id)
  const p = g.player
  const found = RELIC_BY_ID[id]
  p.relics.add(id)
  applyRelic(p)
  showToast(g, found.name, found.text)
  g.pulse = 1
  g.shake = Math.max(g.shake, 3)
  g.pause = TUNING.cardPause
  knownNotes.add(`relic:${id}`)
}

const applyRelic = p => {
  p.fireproof = hasRelic(p, 'fireboots') || hasKeystone(p, 'salamander')
  p.insulated = hasRelic(p, 'rubber') || hasKeystone(p, 'livewire')
}

const gainXp = (g, amount) => {
  g.xp += amount
  while (g.xp >= g.nextLevel) {
    g.xp -= g.nextLevel
    g.level += 1
    g.nextLevel = R.firstLevel + (g.level - 1) * R.levelGrowth
    g.pendingOffers += 1
    g.player.hp = heartCap(g.player)
  }
}

const dropLoot = (g, e, base) => {
  const c = centre(e)
  const count = hasKeystone(g.player, 'quarry') ? 0 : base
  for (let i = 0; i < count; i++) {
    g.pickups.push({
      kind: 'coin', x: c.x - 2, y: c.y - 2, w: 5, h: 5,
      vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 60,
    })
  }
  if (Math.random() < 0.12) g.pickups.push({ kind: 'heart', x: c.x - 3, y: c.y - 3, w: 7, h: 6, vx: 0, vy: -90 })
  if (Math.random() < (g.player.bombs === 0 ? R.bombMercy : R.bombDropChance)) g.pickups.push({ kind: 'bomb', x: c.x - 3, y: c.y - 3, w: 7, h: 7, vx: 0, vy: -90 })
}

const offerRelics = g => {
  const picks = [nextRelic(g), nextRelic(g)].filter(Boolean)
  if (picks.length === 0) return
  openMenu(g, {
    page: 'offer',
    layout: 'cards',
    back: false,
    title: '',
    items: picks.map(id => ({
      card: { icon: RELIC_BY_ID[id].icon, name: RELIC_BY_ID[id].name, text: RELIC_BY_ID[id].text, sub: '' },
      run: gm => {
        gm.menus.pop()
        gm.relicPool.push(...picks.filter(other => other !== id))
        gainRelic(gm, id)
        gm.player.wasJump = true
      },
    })),
  })
}

const award = (g, points) => {
  g.score += points * (1 + g.loop)
  if (g.bestBeaten || g.quick || save.best <= 0 || g.score <= save.best) return
  g.bestBeaten = true
  g.pulse = 1
  showToast(g, 'BEST')
}

const leaveChest = g => {
  const c = centre(g.player)
  g.cards.push({ kind: 'chest', x: c.x - 6, y: c.y - 16, w: 12, h: 12, relic: nextRelic(g) })
}

const pickSlough = (g, p) => {
  const count = Math.max(1, p.skills.length)
  const kinds = shuffled(knownOf(g, 'skill').filter(kind => !p.skills.some(s => s.kind === kind))).slice(0, count)
  if (kinds.length === 0) return
  g.cardPool = [...g.cardPool.filter(kind => !kinds.includes(kind)), ...p.skills.map(s => s.kind)]
  p.skills = kinds.map(kind => ({ kind, ready: 0 }))
  kinds.forEach(kind => FORKS[kind].forEach(fork => p.upgrades.add(shuffled(fork)[0].id)))
}

const openKeepOne = (g, p) => openMenu(g, {
  page: 'offer',
  layout: 'cards',
  back: false,
  title: '',
  items: p.skills.map((skill, slot) => ({
    card: { icon: skill.kind, tint: formOf(p, skill.kind).tint, name: formOf(p, skill.kind).name, text: '', prompt: skillAction(slot) },
    run: gm => {
      gm.menus.pop()
      p.skills.filter(s => s !== skill).forEach(s => dropCard(gm, s.kind))
      p.skills = [skill]
    },
  })),
})

const KEYSTONE_TAKEN = {
  fourth: g => {
    const [kind] = shuffled(unownedSkills(g))
    if (kind) learnOrSwap(g, kind, () => {}, gm => dropCard(gm, kind))
  },
  monomania: (g, p) => { if (p.skills.length > 1) openKeepOne(g, p) },
  slough: pickSlough,
  overload: g => Object.values(g.rooms).forEach(room => { room.world.overloaded = true }),
  quarry: g => { g.gold = 0 },
}

export const takeKeystone = (g, id) => {
  const p = g.player
  const found = KEYSTONE_BY_ID[id]
  p.keystones.add(id)
  applyRelic(p)
  p.hp = Math.min(p.hp, heartCap(p))
  const c = centre(p)
  ring(g, c.x, c.y, found.tint, 40, 170)
  g.pulse = 1
  g.shake = Math.max(g.shake, 8)
  p.iframes = Math.max(p.iframes, 1)
  KEYSTONE_TAKEN[id]?.(g, p)
  showToast(g, found.name, found.gift)
  if (!g.loop) leaveChest(g)
}

const rollKeystones = g => {
  const fresh = g.secrets.filter(key => key.startsWith('keystone:')).map(key => key.split(':')[1])
  const open = shuffled(openKeystones(g.player, g.known))
  return [...open.filter(k => fresh.includes(k.id)), ...open.filter(k => !fresh.includes(k.id))].slice(0, R.keystoneOffers)
}

const offerKeystones = g => {
  g.keystoneOffer ??= rollKeystones(g)
  if (g.keystoneOffer.map(k => meet(g, 'keystone', k.id)).some(Boolean)) return
  const picks = g.keystoneOffer
  g.keystoneDue = false
  g.keystoneOffer = null
  if (picks.length === 0) {
    leaveChest(g)
    return
  }
  openMenu(g, {
    page: 'offer',
    layout: 'cards',
    back: false,
    title: '',
    tall: true,
    items: picks.map(k => ({
      card: { icon: `key_${k.id}`, name: k.name, text: k.gift, cost: k.cost },
      run: gm => {
        gm.menus.pop()
        takeKeystone(gm, k.id)
        gm.player.wasJump = true
        gm.player.wasBomb = true
      },
    })),
  })
}

const onWardenKilled = (g, e) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  const p = g.player
  openArena(g, room)
  room.sealed = false
  room.cleared = true
  const outwit = outwitted(e)
  award(g, ENEMY_DEFS[e.kind].value * (outwit ? R.wards.outwitPays : 1))
  g.kills += 1
  g.wardenWins += 1
  g.outwits += outwit ? 1 : 0
  noteKill(g, e)
  if (e.lastSource !== 'player') g.environmentKills += 1
  g.pulse = 1
  g.shake = Math.max(g.shake, 14)
  fallFx(g, e)
  if (e.kind === 'core') {
    g.ending = { life: R.endingTime }
    p.iframes = R.endingTime + 1
    return
  }
  const ring = g.wardenAt[keyOf(g.x, g.y)]
  if (g.wardens[ring]) g.wardens[ring].dead = true
  g.seals += 1
  p.hp = heartCap(p)
  award(g, R.wardenBonus * g.seals)
  gainXp(g, g.nextLevel - g.xp)
  beginMoment(g)
  g.afterMoment = [() => showReveal(g, 'seal', e.kind), () => (g.loop ? offerRelics(g) : (g.keystoneDue = true))]
}

const killXp = (g, environmental) =>
  (environmental ? R.environmentXp : 1) * (1 + Math.min(R.chainXpCap, g.chain - 1) * R.chainXpStep)

const blastJustNow = (g, c) => {
  const recent = g.world.lastBlast && g.time - g.world.lastBlast.at < TUNING.feed.blastWindow ? [g.world.lastBlast] : []
  return [...recent, ...g.world.events.filter(event => event.type === 'blast')]
    .some(blast => Math.hypot(blast.x * BLOCK - c.x, blast.y * BLOCK - c.y) < (blast.reach + 3) * BLOCK)
}

const minedLately = (g, e) => e.minedAt !== undefined && g.time - e.minedAt < TUNING.feed.mineWindow

const feedOnKill = (g, e, c, environmental) => {
  if ((environmental && e.lastCause === 'CRUSHED' && blastJustNow(g, c)) || minedLately(g, e)) feedEvent(g, 'blastKill', c.x, c.y)
  if (!environmental) return
  feedEvent(g, 'worldKill', c.x, c.y)
  const ally = g.enemies.filter(o => o.ally > 0 && o !== e).map(o => [Math.hypot(centre(o).x - c.x, centre(o).y - c.y), o]).filter(([d]) => d < TUNING.feed.allyReach).sort((a, b) => a[0] - b[0])[0]?.[1]
  if (!ally) return
  feedEvent(g, 'allyKill', c.x, c.y)
}

const onKill = (g, e) => {
  if (e.partOf || e.silent) return
  onDeath(g, e)
  if (e.prop) return
  knownNotes.add(`killed:${e.kind}`)
  if (e.warden) {
    onWardenKilled(g, e)
    return
  }
  const c = centre(e)
  killFx(g, e)
  g.hitstop = Math.max(g.hitstop, TUNING.feel.killStop)
  const def = ENEMY_DEFS[e.kind]
  if (e.friendly) {
    dropLoot(g, e, 5)
    return
  }
  if (e.lastSource === 'bond') return
  if (e.kind === 'mimic') gainRelic(g, nextRelic(g))
  const p = g.player
  const environmental = e.lastSource !== 'player'
  noteKill(g, e)
  keystoneKill(g, e, p)
  deepKill(g, e)
  feedOnKill(g, e, c, environmental)
  if (hasRelic(p, 'sack')) burstGuts(g, e)
  if (owns(p, 'repel.salvage')) salvage(g, e)
  const gained = environmental ? R.worldChain : 1
  const before = g.chainTime > 0 ? g.chain : 0
  g.chain = before + gained
  g.chainTime = hasRelic(p, 'chain') ? Infinity : R.chainWindow
  if (hasRelic(p, 'skull') && Math.floor(g.chain / R.skullChain) > Math.floor(before / R.skullChain)) p.hp = Math.min(heartCap(p), p.hp + 1)
  g.chainPeak = Math.max(g.chainPeak, g.chain)
  const base = def.value * g.chain * (environmental ? R.worldScore : 1)
  const points = base * (1 + g.loop)
  award(g, base)
  g.kills += 1
  if (environmental) g.environmentKills += 1
  const earned = hasRelic(p, 'gem') ? (environmental ? killXp(g, true) * 2 : 0) : killXp(g, environmental)
  gainXp(g, earned)
  xpMotes(g, c, earned)
  if (environmental) {
    g.popups.push({ x: c.x - 8, y: c.y - 6, icon: e.lastCause, colour: 'charge', life: 1.1 })
    addPopup(g, c.x + 4, c.y - 8, points, 'charge')
  } else if (g.chain >= R.popupChain) addPopup(g, c.x, c.y - 8, points, 'white')
  dropLoot(g, e, environmental ? 2 : 1)
}

const wakeEnds = (g, e) => {
  const c = centre(e)
  e.hp = 0
  ring(g, c.x, c.y, 'gas', 10, 40)
}

const keystoneKill = (g, e, p) => {
  const c = centre(e)
  if (hasKeystone(p, 'powder')) explode(g.world, cell(c.x), cell(c.y), e.w > K.blastBigAbove ? K.blastBig : K.blastSmall)
  if (!hasKeystone(p, 'wake') || e.spawned || e.hatched || e.heavy) return
  if (g.enemies.filter(o => o.woken).length >= K.wakeMost) return
  const woken = createEnemy({ kind: e.kind, x: e.x, y: e.y })
  Object.assign(woken, { woken: true, silent: true, ally: K.wakeLife, hp: K.wakeHp, facing: e.facing })
  g.spawns.push(woken)
  ring(g, c.x, c.y, 'gas', 10, 40)
}

const stepMotionFeel = (g, p, input, dt, wasGrounded, falling, swimming) => {
  if (!wasGrounded && p.grounded && falling > 110) dust(g, p.x + p.w / 2, p.y + p.h, 7)
  g.dustClock -= dt
  if (p.grounded && Math.abs(p.vx) > 40 && g.dustClock <= 0) {
    g.dustClock = TUNING.feel.dustEvery
    dust(g, p.x + (p.vx > 0 ? 0 : p.w), p.y + p.h, 1)
  }
  if (swimming && !p.wasSwimming && Math.abs(falling) > 40) splash(g, p.x + p.w / 2, p.y + p.h / 2, falling)
  p.wasSwimming = swimming
}

const crouch = (world, p, wants) => {
  const drop = P.height - P.crouchHeight
  if (wants && !p.crouching) {
    Object.assign(p, { y: p.y + drop, h: P.crouchHeight, crouching: true })
  } else if (!wants && p.crouching && !hitsSolid(world, { x: p.x, y: p.y - drop, w: p.w, h: P.height })) {
    Object.assign(p, { y: p.y - drop, h: P.height, crouching: false })
  }
}

const snapToFlat = (x, y, snap) => {
  const angle = Math.atan2(Math.abs(y), Math.abs(x))
  const eased = Math.max(0, angle - snap) * (Math.PI / 2) / (Math.PI / 2 - snap)
  return { x: Math.sign(x) * Math.cos(eased), y: Math.sign(y) * Math.sin(eased) }
}

const stickAim = (p, { x, y, free }, planted) => {
  const F = TUNING.feel
  const lifted = free || planted || !p.grounded ? y : Math.min(0, y)
  if (!free && Math.abs(x) < 0.2 && lifted >= 0) return { x: p.facing, y: 0 }
  const aim = snapToFlat(x, lifted, free ? F.snapFree : p.grounded ? F.snapRun : F.snapAir)
  if (Math.abs(aim.x) > 0.05) p.facing = aim.x < 0 ? -1 : 1
  return aim
}

const aimFrom = (p, input) => {
  const F = TUNING.feel
  if (input.pointer) {
    const from = muzzle(p)
    const dx = input.pointer.x - from.x
    const dy = input.pointer.y - from.y
    const length = Math.hypot(dx, dy)
    if (length > 2) {
      if (Math.abs(dx) > 1) p.facing = dx < 0 ? -1 : 1
      p.assist = 0
      return { x: dx / length, y: dy / length }
    }
  }
  if (input.aim) {
    p.assist = F.assistStick
    return stickAim(p, input.aim, input.plant)
  }
  p.assist = F.assistAngle
  const x = input.left ? -1 : input.right ? 1 : 0
  const y = input.up ? -1 : input.down && (!p.grounded || input.plant) ? 1 : 0
  if (x === 0 && y === 0) return { x: p.facing, y: 0 }
  const length = Math.hypot(x, y)
  return { x: x / length, y: y / length }
}

const autoTarget = (g, p) => {
  const from = muzzle(p)
  let best = null
  let bestDistance = hasKeystone(p, 'fists') ? K.punchReach : TUNING.feel.autoReach
  for (const e of g.enemies) {
    if (e.friendly || e.prop || e.ally || e.intangible || e.plated || e.stowed || e.asleep || e.hp <= 0) continue
    const c = centre(e)
    const d = Math.hypot(c.x - from.x, c.y - from.y)
    if (d < bestDistance && lineClear(g.world, from, c)) {
      best = { x: (c.x - from.x) / d, y: (c.y - from.y) / d }
      bestDistance = d
    }
  }
  return best
}

const assisted = (g, p, aim) => {
  if (!p.assist) return aim
  const from = muzzle(p)
  const F = TUNING.feel
  let best = null
  let bestAngle = p.assist
  for (const e of g.enemies) {
    if (e.friendly || e.ally || e.intangible || e.plated || e.stowed || e.asleep) continue
    const c = centre(e)
    const dx = c.x - from.x
    const dy = c.y - from.y
    const d = Math.hypot(dx, dy)
    if (d > F.assistReach || d < 1) continue
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * aim.x + dy * aim.y) / d)))
    if (angle < bestAngle) {
      bestAngle = angle
      best = { x: dx / d, y: dy / d }
    }
  }
  return best ?? aim
}

const ASSISTED_SKILLS = new Set(['bolt', 'swap', 'charm', 'grapple', 'melt', 'ember', 'acid', 'mine', 'frost', 'clay'])

const fireShot = (g, p, aim, life = P.shotLife) => {
  const from = muzzle(p)
  const stain = hasKeystone(p, 'stain') ? p.stain ?? M.ROCK : undefined
  g.shots.push({
    x: from.x - 1, y: from.y - 1, w: 2, h: 2, vx: aim.x * P.shotSpeed, vy: aim.y * P.shotSpeed,
    life: hasKeystone(p, 'fists') ? K.punchLife : life,
    power: hasKeystone(p, 'fists') ? K.punchPower : 1,
    bounces: hasRelic(p, 'ricochet') ? 3 : 0, friendly: true,
    ...(stain === undefined ? {} : { stain, colour: stainColour(stain) }),
  })
}

const turned = ({ x, y }, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) })

const shoot = (g, p) => {
  const aim = assisted(g, p, p.aim)
  const scatter = hasRelic(p, 'spread')
  if (scatter) for (let n = 0; n < R.scatterShots; n++) fireShot(g, p, turned(aim, (n - (R.scatterShots - 1) / 2) * 0.2), R.scatterLife)
  else fireShot(g, p, aim)
  shotFx(g, p, aim)
  p.shotReady = hasKeystone(p, 'fists') ? K.punchEvery : P.shotEvery * (scatter ? 3 : 1)
}

const fireSkill = (g, p, kind) => {
  const aim = p.aim
  if (ASSISTED_SKILLS.has(kind)) p.aim = assisted(g, p, aim)
  const result = SKILLS[kind](g, p)
  p.aim = aim
  return result
}

const castSkill = (g, p, skill) => {
  if (crowdedOut(g, p)) return undefined
  const result = fireSkill(g, p, skill.kind)
  if (hasKeystone(p, 'echo')) g.echoes.push({ kind: skill.kind, at: g.time + K.echoDelay })
  return result
}

const stepEchoes = (g, p, stunned) => {
  const due = g.echoes.filter(echo => echo.at <= g.time)
  if (due.length === 0) return
  g.echoes = g.echoes.filter(echo => echo.at > g.time)
  if (stunned) return
  due.forEach(({ kind }) => {
    const c = centre(p)
    ring(g, c.x, c.y, formOf(p, kind).tint ?? '#6fd0ff', 8, 60)
    fireSkill(g, p, kind)
  })
}

const useSkills = (g, p, input, stunned, dt) => {
  stepFeeds(g, p, dt)
  stepEchoes(g, p, stunned)
  const boost = rechargeRate(g, p)
  p.skills.forEach((skill, slot) => stepHand(g, p, skill, input[SKILL_ACTIONS[slot]] === true, p.wasSkills[slot], stunned, dt, castSkill, boost))
  SKILL_ACTIONS.forEach((key, slot) => { p.wasSkills[slot] = input[key] === true })
}

const runEntry = (g, phase) => ({
  score: g.score,
  won: phase === 'cleared',
  loop: g.loop,
  ring: g.deepestRing,
  chain: g.chainPeak,
  kills: g.kills,
  world: g.environmentKills,
  keys: [...g.player.keystones],
  skills: g.player.skills.map(s => [s.kind, formOf(g.player, s.kind).tint]),
})

const finishRun = (g, phase) => {
  clearRun()
  g.phase = phase
  g.phaseTime = 0
  g.bestBefore = save.best
  g.newBest = !g.quick && recordRun(runEntry(g, phase))
  g.best = save.best
}

const collectCards = (g, p) => {
  for (const c of g.cards) if (c.declined && !overlap(p, c)) c.declined = false
  const touched = g.cards.find(c => overlap(p, c) && !c.declined)
  if (!touched) return
  if (touched.kind === 'chest') {
    g.cards = g.cards.filter(c => c !== touched)
    gainRelic(g, touched.relic)
    return
  }
  touched.declined = true
  if (touched.kind === 'altar') {
    openAltar(g, touched)
    return
  }
  const take = gm => {
    gm.cards = gm.cards.filter(c => c !== touched)
    gm.pause = TUNING.cardPause
  }
  learnOrSwap(g, touched.kind, take)
}

const openAltar = (g, altar) => {
  const found = RELIC_BY_ID[altar.relic]
  if (!found) return
  openMenu(g, {
    page: 'offer',
    layout: 'cards',
    back: false,
    title: 'ALTAR',
    items: [
      {
        card: { icon: found.icon, name: found.name, text: found.text, sub: `COSTS ${R.altarPrice} HEARTS` },
        run: gm => {
          gm.menus.pop()
          if (gm.player.hp <= R.altarPrice) {
            return
          }
          gm.player.hp -= R.altarPrice
          gm.cards = gm.cards.filter(c => c !== altar)
          gainRelic(gm, altar.relic)
        },
      },
      { card: { name: 'NO', text: '', sub: '' }, run: gm => { gm.menus.pop() } },
    ],
  })
}

const talkToInhabitants = (g, p) => {
  for (const e of g.enemies) {
    if (!e.friendly || e.prop || e.spent || !overlap(p, e)) continue
    if (e.kind === 'hermit' && p.skills.length > 0) {
      e.spent = true
      openOffer(g, ['upgrade'], 'HERMIT')
    }
    if (e.kind === 'miner' && unownedSkills(g).length > 0) {
      e.spent = true
      openOffer(g, ['new'], 'MINER')
    }
  }
}

const buyWares = (g, p) => {
  const ware = g.wares.find(w => overlap(p, w) && g.gold >= w.price)
  if (!ware) return
  g.gold -= ware.price
  g.wares = g.wares.filter(w => w !== ware)
  if (ware.kind === 'heart') p.hp = Math.min(heartCap(p), p.hp + 2)
  else if (ware.kind === 'bomb') p.bombs += 1
  else if (ware.kind === 'relic') gainRelic(g, ware.relic)
  else g.pendingOffers += 1
  g.pulse = Math.max(g.pulse, 0.5)
}

const usePickups = (g, p, dt) => {
  for (const c of g.pickups) {
    c.age = (c.age ?? 0) + dt
    if (c.kind === 'coin' && c.age > R.coinSettle) {
      const dx = p.x - c.x
      const dy = p.y - c.y
      const d = Math.max(1, Math.hypot(dx, dy))
      if (d < R.coinReach) {
        c.x += (dx / d) * 140 * dt
        c.y += (dy / d) * 140 * dt
        c.vy = 0
      }
    }
    c.vy = Math.min(200, c.vy + 300 * dt)
    moveAxis(g.world, c, 'x', c.vx * dt)
    if (moveAxis(g.world, c, 'y', c.vy * dt)) {
      c.vx *= 0.5
      c.vy = c.vy > 40 ? -c.vy * 0.4 : 0
    }
    c.spilt = Math.max(0, (c.spilt ?? 0) - dt)
    if (c.spilt > 0 || !overlap(p, { x: c.x - 3, y: c.y - 3, w: c.w + 6, h: c.h + 6 })) continue
    c.taken = true
    if (c.kind === 'coin') {
      g.gold += 1
      coinMote(g, c.x, c.y)
      feedEvent(g, 'coin', c.x, c.y)
    } else if (c.kind === 'bomb') p.bombs += 1
    else p.hp = Math.min(heartCap(p), p.hp + 1)
  }
  g.pickups = g.pickups.filter(c => !c.taken)
}

const stepCore = (g, dt) => {
  if (!g.world.overloaded || Math.random() > TUNING.world.overloadCrumble * dt) return
  const x = 1 + Math.floor(Math.random() * 26)
  const y = 1 + Math.floor(Math.random() * 26)
  if (matAt(g.world, x, y) === M.ROCK && !props(matAt(g.world, x, y + 1)).solid) setCell(g.world, x, y, M.SAND)
}

const crumble = (g, count) => {
  for (let n = 0; n < count; n++) {
    const x = 1 + Math.floor(Math.random() * 26)
    const y = 1 + Math.floor(Math.random() * 26)
    if (props(matAt(g.world, x, y)).solid) setCell(g.world, x, y, M.SAND)
  }
}

const stepEnding = (g, dt) => {
  g.ending.life -= dt
  g.player.iframes = 1
  crumble(g, 2)
  g.shake = Math.max(g.shake, 6)
  g.pulse = Math.max(g.pulse, 0.6)
  if (Math.random() < dt * 8) {
    const x = 2 + Math.floor(Math.random() * 24)
    const y = 2 + Math.floor(Math.random() * 20)
    burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 'fire', 12)
  }
  if (g.ending.life > 0) return
  g.ending.asking = true
  openChoice(g, { bank: bankOf(g), deeper: g.loop + 2, stop: stopHere, go: descend })
}

const bankOf = g => (R.coreBonus + g.player.hp * R.heartBonus) * (1 + g.loop) + Math.floor(g.score * R.bankShare)

const stopHere = g => {
  g.menus.length = 0
  g.banked = bankOf(g)
  g.score += g.banked
  g.ending = null
  finishRun(g, 'cleared')
}

const holdChoice = (g, dt) => {
  g.player.iframes = 1
  crumble(g, 1)
  stepWorld(g.world, dt, g.depth)
  handleWorldEvents(g)
  const deeper = g.menus.at(-1)?.selected === 1
  g.depth = deeper ? 1 : 0
  if (deeper) {
    g.shake = Math.max(g.shake, 2)
    g.pulse = Math.max(g.pulse, 0.25)
  }
}

const rollDeepOmen = g => {
  const owned = Object.keys(OMENS).filter(id => isKnown(g, 'omen', id) && !g.omens.includes(id))
  const others = Object.keys(OMENS).filter(id => !g.omens.includes(id))
  const pool = owned.length ? owned : others
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

const deepBands = previous => {
  const themes = shuffled([0, 1, 2, 3, 4, 5, 6])
  const fresh = [...themes.filter(t => !previous.includes(t)), ...themes.filter(t => previous.includes(t))]
  return fresh.slice(0, previous.length)
}

const landingRoom = map => {
  const cells = ringCells(map, DEEP.startRing)
  const open = cells.filter(([x, y]) => map.links[keyOf(x, y)]?.up)
  const pool = open.length ? open : cells
  return pool[Math.floor(Math.random() * pool.length)]
}

const deepSecrets = (g, omen) => {
  const strange = shuffled(WARDEN_KINDS.filter(id => !isKnown(g, 'warden', id)))[0]
  return [
    ...g.secrets,
    ...(omen && !isKnown(g, 'omen', omen) ? [`omen:${omen}`] : []),
    ...(strange ? [`warden:${strange}`] : []),
  ]
}

const descend = g => {
  const p = g.player
  const from = g.rooms[keyOf(g.x, g.y)]
  const omen = rollDeepOmen(g)
  const mutation = rollMutation(g)
  const omens = omen ? [...g.omens, omen] : g.omens
  const secrets = deepSecrets(g, omen)
  const known = knownFrom(secrets)
  const bands = deepBands(g.bands)
  const seed = Math.floor(Math.random() * 1e9)
  const map = buildMap(seed)
  applyOmens(omens)
  g.menus.length = 0
  Object.assign(g, {
    loop: g.loop + 1, seed, map, bands, omens, secrets, known,
    omen: g.omen ?? omen,
    flocking: omenFoes(omens).flock === true,
    mutations: mutation ? [...g.mutations, mutation] : g.mutations,
    bandFoes: chooseBandFoes(bands, known, secrets),
    wardenOrder: chooseWardens(known, secrets),
    wardens: {}, wardenAt: {}, seals: 0, rooms: {},
    ending: null, boss: null,
    deepestRing: DEEP.startRing, lastTheme: -1, keystoneDue: true,
  })
  const [x, y] = landingRoom(map)
  p.hp = Math.min(heartCap(p), p.hp + DEEP.heal)
  enterRoom(g, x, y)
  if (g.rooms[keyOf(x, y)].doors.up) arriveBy(g, 'down', from)
  else placeAtDoor(g)
  if (omen && !meet(g, 'omen', omen)) showReveal(g, 'omen', omen)
  if (mutation) showReveal(g, 'mutation', mutation)
  g.pulse = 1
  g.shake = Math.max(g.shake, 10)
  storeRun(g)
}

const LOCK_HINTS = { [M.PEAT]: 'FIRE', [M.GATE]: 'CHARGE', [M.BRICK]: 'CRUSHED', [M.ICE]: 'FIRE', [M.SCRAP]: 'CRUSHED' }

const doorPoint = (dir, door) => ({
  left: [BLOCK, (door.row + 1) * BLOCK],
  right: [WORLD_PX - BLOCK, (door.row + 1) * BLOCK],
  up: [(door.col + 1) * BLOCK, BLOCK],
  down: [(door.col + 1) * BLOCK, WORLD_PX - BLOCK],
}[dir])

const doorCell = (dir, door) => ({
  left: [1, door.row], right: [26, door.row], up: [door.col, 1], down: [door.col, 26],
}[dir])

const stepLockHints = (g, dt) => {
  g.hintClock = (g.hintClock ?? 0) - dt
  if (g.hintClock > 0) return
  const room = g.rooms[keyOf(g.x, g.y)]
  const c = centre(g.player)
  for (const [dir, door] of Object.entries(room.doors)) {
    const hint = LOCK_HINTS[matAt(g.world, ...doorCell(dir, door))]
    if (!hint) continue
    const [dx, dy] = doorPoint(dir, door)
    if (Math.hypot(c.x - dx, c.y - dy) > R.hintReach) continue
    g.popups.push({ x: Math.max(12, Math.min(WORLD_PX - 12, dx)), y: Math.max(12, dy - 14), icon: hint, colour: 'charge', life: 1.2 })
    g.hintClock = 1.3
    return
  }
}

const throwBomb = (g, p, input) => {
  const pressed = input.bomb && !p.wasBomb
  p.wasBomb = input.bomb
  if (!pressed || p.bombs <= 0 || !bombReady(p)) return
  p.bombs -= 1
  bombThrown(p)
  const from = muzzle(p)
  g.fireballs.push({
    x: from.x - 2, y: from.y - 2, w: 4, h: 4,
    vx: p.aim.x * 150, vy: p.aim.y * 150 - 70,
    age: 0, friendly: true, bomb: true,
  })
}

const doorCells = (dir, door) => {
  const [x, y] = doorCell(dir, door)
  return dir === 'left' || dir === 'right' ? [[x, y], [x, y + 1]] : [[x, y], [x + 1, y]]
}

const sealRoom = (g, room) => {
  room.sealed = true
  room.sealCells = Object.entries(room.doors).flatMap(([dir, door]) => doorCells(dir, door))
  for (const [x, y] of room.sealCells) {
    setCell(g.world, x, y, M.BRICK)
    burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 'blood', 5)
  }
  g.shake = Math.max(g.shake, 6)
}

const unsealRoom = (g, room) => {
  room.sealed = false
  room.cleared = true
  for (const [x, y] of room.sealCells ?? []) setCell(g.world, x, y, M.EMPTY)
  g.doorPulse = 1.8
  const c = centre(g.player)
  g.cards.push({ kind: 'chest', x: c.x - 6, y: c.y - 16, w: 12, h: 12, relic: nextRelic(g) })
  g.pulse = 1
}

const sealArena = (g, room) => {
  room.sealed = true
  room.sealCells = room.arena.seals
  for (const [x, y] of room.arena.seals) setCell(g.world, x, y, M.BEDROCK)
  g.shake = Math.max(g.shake, 8)
}

const rewardClean = (g, room) => {
  const p = g.player
  const c = centre(p)
  const coins = hasKeystone(p, 'quarry') ? 0 : R.cleanCoins + room.ring
  for (let i = 0; i < coins; i++) {
    g.pickups.push({ kind: 'coin', x: c.x - 2, y: c.y - 14, w: 5, h: 5, vx: (Math.random() - 0.5) * 90, vy: -70 - Math.random() * 50 })
  }
  g.chain = Math.max(1, g.chain + 1)
  g.chainPeak = Math.max(g.chainPeak, g.chain)
  g.chainTime = Math.max(g.chainTime, R.cleanChain)
  g.cleanClears += 1
  g.pulse = Math.max(g.pulse, 0.6)
  burst(g, c.x, c.y, 'charge', 14)
}

const stepRoomEvents = (g, dt) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  const p = g.player
  if (p.hp < g.roomHp) room.hurtHere = true
  g.roomHp = p.hp
  const foesLeft = g.enemies.some(e => !e.friendly && !e.ally && !e.spawned && !e.partOf)
  if (foesLeft) room.hadFoes = true
  if (room.hadFoes && !foesLeft && !room.healed) {
    room.healed = true
    const unpaid = hasKeystone(p, 'wake')
    if (!room.hurtHere && !unpaid) rewardClean(g, room)
    if (p.hp < heartCap(p) && !unpaid) {
      p.hp = Math.min(heartCap(p), p.hp + TUNING.feel.roomClearHeal)
      const c = centre(p)
      g.popups.push({ x: c.x, y: g.player.y - 11, icon: 'HEAL', colour: 'heal', life: 1.2 })
    }
    roomClearFx(g)
  }
  stepPockets(g, dt, POCKET_HOOKS)
  if (room.arena) stepArena(g, room, dt, sealArena)
  if (room.event === 'arena' && !room.cleared) {
    const hostile = g.enemies.some(e => !e.friendly && !e.ally)
    const inside = g.player.x > 32 && g.player.x < WORLD_PX - 40 && g.player.y > 8 && g.player.y < WORLD_PX - 24
    if (!room.sealed && hostile && inside) sealRoom(g, room)
    if (room.sealed) room.sealedFor = (room.sealedFor ?? 0) + dt
    if (room.sealed && (!hostile || room.sealedFor > R.arenaLimit)) unsealRoom(g, room)
  }
  if (room.event === 'collapse' && !room.cleared) {
    room.clock = (room.clock ?? 0) + dt
    if (room.clock > R.collapseEvery) {
      room.clock = 0
      quakeRoom(g)
    }
  }
}

const QUAKES = new Set([M.PEAT, M.GATE, M.ICE])

const quakeRoom = g => {
  const candidates = []
  g.world.mat.forEach((m, i) => {
    if (QUAKES.has(m) && i >= 56 && g.world.mat[i + 28] === M.EMPTY && g.world.mat[i - 28] !== M.EMPTY) candidates.push(i)
  })
  for (let n = 0; n < 6 && candidates.length; n++) {
    const i = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]
    setCell(g.world, i % 28, Math.floor(i / 28), M.SAND)
  }
  g.shake = Math.max(g.shake, 4)
}

const stepFirstRoom = (g, dt) => {
  if (!g.rooms[keyOf(g.x, g.y)].safetyNet || g.player.skills.length > 0) return
  const wallStands = g.cards.length > 0 && g.world.mat.some((m, i) => m === M.PEAT && i % 28 === 18)
  const fireLeft = g.world.burning > 0 || g.enemies.some(e => e.kind === 'spitter')
  g.rekindle = wallStands && !fireLeft ? g.rekindle + dt : 0
  if (g.rekindle < R.rekindleAfter) return
  g.rekindle = 0
  g.enemies.push(createEnemy({ kind: 'spitter', x: 15 * BLOCK, row: 5 }))
  knownNotes.add('met:spitter')
}

const carveEscape = (g, p, anchors) => {
  const free = anchors.filter(a => !a.locked)
  const from = { x: cell(p.x + p.w / 2), y: cell(p.y + p.h - 1) }
  const goal = free.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0]
  if (!goal) return
  const clear = (x, y, then = M.EMPTY) => { if (matAt(g.world, x, y) !== M.BEDROCK) setCell(g.world, x, y, then) }
  for (let y = Math.min(from.y, goal.y) - 1; y <= Math.max(from.y, goal.y); y++) clear(from.x, y, M.VINE)
  const step = Math.sign(goal.x - from.x)
  for (let x = from.x + step; step !== 0 && x !== goal.x + step; x += step) {
    clear(x, goal.y)
    clear(x, goal.y - 1)
    if (!props(matAt(g.world, x, goal.y + 1)).solid) setCell(g.world, x, goal.y + 1, M.ROCK)
  }
  g.shake = Math.max(g.shake, 6)
}

const stepMercy = (g, p, dt) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  g.mercyClock = (g.mercyClock ?? 0) - dt
  if (g.mercyClock > 0 || room.sealed || !p.grounded || keyOf(g.x, g.y) === keyOf(...g.map.start)) return
  g.mercyClock = R.mercyEvery
  const from = { x: cell(p.x + p.w / 2), y: cell(p.y + p.h - 1) }
  const { open, locked, anchors } = exitsFrom(g.world, room.doors, from)
  if (open.length > 0) {
    room.boxedIn = 0
    return
  }
  room.boxedIn = (room.boxedIn ?? 0) + 1
  if (locked.length === 0 && room.boxedIn >= R.boxedInLimit) {
    carveEscape(g, p, anchors)
    g.escapes = [...(g.escapes ?? []), `${room.layout}@${room.ring}:${room.cleared ? 'after' : 'fresh'}`]
    room.boxedIn = 0
    return
  }
  if (p.bombs > 0 || (room.boxedIn < 2 && locked.length === 0) || g.pickups.some(c => c.kind === 'bomb')) return
  g.pickups.push({ kind: 'bomb', x: p.x, y: p.y - 10, w: 7, h: 7, vx: 0, vy: -60 })
  g.mercyBombs = (g.mercyBombs ?? 0) + 1
}

const useDoors = (g, p) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  if (room.sealed && room.arena) return
  const open = dir => room.doors[dir] && (room.links[dir]?.lock !== 'seal' || g.seals >= R.wardenRings.length)
  const leave = dir => {
    if (room.sealed) Object.assign(room, { sealed: false, sealedFor: 0 })
    walkThrough(g, dir)
  }
  if (open('right') && p.x + p.w >= WORLD_PX - 0.5) leave('right')
  else if (open('left') && p.x <= 0.5) leave('left')
  else if (open('down') && p.y + p.h >= WORLD_PX - 0.5) leave('down')
  else if (open('up') && p.y <= 0.5) leave('up')
}

const seatPlayer = (world, p, wish, dt) => {
  if (!p.grounded || wish !== 0) return
  const under = p.y + p.h + 1
  const leftHeld = solidAt(world, p.x + 0.5, under)
  const rightHeld = solidAt(world, p.x + p.w - 0.5, under)
  if (leftHeld && rightHeld) return
  const middleHeld = solidAt(world, p.x + p.w / 2, under)
  if (middleHeld || (!leftHeld && !rightHeld)) return
  const next = { ...p, x: p.x + (leftHeld ? -1 : 1) * R.ledgeSeat * dt }
  if (!hitsSolid(world, next)) p.x = next.x
}

const stepPlayer = (g, input, dt) => {
  const p = g.player
  const world = g.world
  const middle = p.x + p.w / 2
  const [pullX, pullY] = heroPull(p)
  const down = pullY < 0 ? -1 : 1
  p.upside = down < 0
  const swimming = liquidAtPx(world, middle, p.y + p.h / 2)
  const wading = liquidAtPx(world, middle, down > 0 ? p.y + p.h - 1 : p.y + 1)
  const mired = miredAtPx(world, middle, down > 0 ? p.y + p.h - 1 : p.y + 1)
  const headUnder = liquidAtPx(world, middle, down > 0 ? p.y - 4 : p.y + p.h + 4)
  if (!(p.digging > 0)) applyCrush(g, p)
  const stunned = p.stun > 0
  const plant = input.plant && p.grounded
  crouch(world, p, input.down && !input.jump && p.grounded && !swimming && !plant && down > 0)
  const wish = stunned ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const top = P.run * (swimming ? P.swimRun : 1)
  const towards = p.crouching || plant ? 0 : wish * top
  const change = P.accel * dt * (p.drift > 0 ? 0.15 : 1)
  p.drift -= dt
  p.vx += Math.max(-change, Math.min(change, towards - p.vx))
  if (wish !== 0 && !input.pointer && !input.aim?.free) p.facing = wish
  p.aim = aimFrom(p, input)

  const vine = vineAt(world, cell(middle), cell(p.y + p.h / 2))
  const climbing = vine && !input.jump && !(p.zipping > 0) && (input.up || input.down)
  const floating = input.jump && hasRelic(p, 'feather') && p.vy > 0
  const gravity = swimming ? P.gravity * P.swimGravity : P.gravity
  const maxFall = swimming ? P.swimMaxFall : floating ? R.featherFall : vine ? R.vineSlide : P.maxFall
  if (climbing) p.vy = input.up ? -R.climbSpeed : R.climbSpeed
  else if (p.dashing <= 0 && !(p.zipping > 0)) {
    p.vy = down * Math.min(down > 0 ? maxFall : Math.min(maxFall, FLOAT.heroRise), down * p.vy + gravity * dt)
    p.vx += pullX * gravity * FLOAT.sideways * dt
  }
  p.zipping = Math.max(0, (p.zipping ?? 0) - dt)
  if (hasRelic(p, 'wind') && props(matAt(world, cell(middle), cell(p.y + p.h / 2))).gas) p.vy = Math.max(-R.updraft, p.vy - P.gravity * 2.2 * dt)

  const pushingWall = !p.grounded && hasRelic(p, 'claws') && p.hitWall && wish !== 0
  p.clinging = pushingWall ? R.clingGrace : Math.max(0, p.clinging - dt)
  if (pushingWall) p.vy = Math.min(p.vy, R.clingSlide)
  if (p.grounded) p.airJumps = hasRelic(p, 'springs') ? 1 : 0

  p.sinceGround = p.grounded ? 0 : p.sinceGround + dt
  p.sinceJump = input.jump && !p.wasJump ? 0 : p.sinceJump + dt
  if (!stunned && !p.crouching && p.sinceJump < P.buffer) {
    if (wading && !headUnder) {
      p.vy = -P.jump * down
      p.jumpHeld = true
      p.sinceJump = 1
    } else if (swimming) {
      p.vy = -P.swimStroke * down
      p.sinceJump = 1
    } else if (p.sinceGround < P.coyote || vine) {
      p.vy = -P.jump * down
      p.jumpHeld = true
      p.sinceJump = 1
      p.sinceGround = 1
    } else if (mired) {
      p.vy = -P.swimStroke * down
      p.sinceJump = 1
    } else if (p.clinging > 0) {
      p.vy = -P.jump * down
      p.vx = -p.facing * R.wallKick
      p.drift = 0.18
      p.facing *= -1
      p.jumpHeld = true
      p.sinceJump = 1
      p.clinging = 0
    } else if (p.airJumps > 0) {
      p.airJumps -= 1
      p.vy = -P.jump * 0.9 * down
      p.jumpHeld = true
      p.sinceJump = 1
      burst(g, p.x + 3, p.y + p.h, 'pale', 4)
    }
  }
  if (p.jumpHeld && !input.jump) {
    if (p.vy * down < 0) p.vy *= P.jumpCut
    p.jumpHeld = false
  }
  p.wasJump = input.jump

  const falling = p.vy
  const wasGrounded = p.grounded
  if (input.jump && !p.wasJumpFeel && p.sinceJump === 1) dust(g, p.x + p.w / 2, p.y + p.h, 4)
  p.wasJumpFeel = input.jump
  if (p.digging > 0) swim(g, p, input, dt)
  else {
    move(world, p, dt, down, P.mudDrag)
    pushOutOfSolid(world, p, down)
    if (hitsSolid(world, p)) unbury(world, p)
  }
  stepMotionFeel(g, p, input, dt, wasGrounded, falling, swimming)
  if (down > 0) seatPlayer(world, p, wish, dt)
  stepDash(g, p, dt)
  if (p.slam && p.grounded) {
    p.slam = false
    landSlam(g, p)
  }
  if (hasRelic(p, 'stomp') && falling > R.stompSpeed) {
    const under = { x: p.x, y: p.y + p.h - 2, w: p.w, h: 4 }
    const victim = g.enemies.find(e => !e.friendly && !e.ally && overlap(under, e))
    if (victim) {
      hurt(g, victim, R.stompDamage, 'player')
      victim.stun = Math.max(victim.stun, 0.5)
      p.vy = -R.stompBounce
      p.iframes = Math.max(p.iframes, 0.15)
    }
  }
  if (falling > R.stompSpeed) {
    const under = { x: p.x, y: p.y + p.h - 2, w: p.w, h: 4 }
    const spiny = g.enemies.find(e => e.kind === 'urchin' && overlap(under, e))
    if (spiny) {
      hurt(g, spiny, ENEMY_DEFS.urchin.hp * 4)
      p.vy = -R.stompBounce
      p.iframes = Math.max(p.iframes, 0.2)
    }
  }
  recordTrail(p, dt)

  const breath = g.held && g.tempo > 0 ? 1 / g.tempo : 1
  p.shotReady -= dt * breath
  if (!input.shoot) p.holdFire = false
  const target = input.autofire && !input.shoot && !stunned ? autoTarget(g, p) : null
  const steered = p.aim
  if (target) {
    p.aim = target
    p.assist = 0
    if (Math.abs(target.x) > 0.05) p.facing = target.x < 0 ? -1 : 1
  }
  if (!stunned && (input.shoot || target) && !p.holdFire && p.shotReady <= 0) shoot(g, p)
  p.aim = steered
  useSkills(g, p, input, stunned, dt * breath)
  if (!stunned) throwBomb(g, p, input)
  p.iframes -= dt
  p.stun -= dt

  applyHazards(g, p, dt)
  stepKeystones(g, p, dt)
  stepMercy(g, p, dt)
  collectCards(g, p)
  talkToInhabitants(g, p)
  buyWares(g, p)
  usePickups(g, p, dt)
  if (g.phase === 'playing') useDoors(g, p)
  if (p.hp <= 0 && g.phase === 'playing' && hasRelic(p, 'phoenix')) {
    p.relics.delete('phoenix')
    p.hp = Math.min(heartCap(p), R.phoenixHearts)
    p.iframes = 2
    const c = centre(p)
    explode(world, cell(c.x), cell(c.y), 2)
    g.pulse = 1
    g.shake = 10
  }
  if (p.hp <= 0 && g.phase === 'playing') {
    finishRun(g, 'dead')
    burst(g, p.x, p.y, 'white', 24)
  }
}

const stepElite = (g, e, dt) => {
  if (!e.elite || e.stun > 0) return
  e.eliteClock = (e.eliteClock ?? 0) + dt
  const c = centre(e)
  if (e.elite === 'burning' && e.eliteClock > 0.3) {
    e.eliteClock = 0
    ignite(g.world, cell(c.x), cell(e.y + e.h + 2))
  }
  if (e.elite === 'charged' && e.eliteClock > TUNING.enemies.elite.chargeEvery) {
    e.eliteClock = 0
    energize(g.world, cell(c.x), cell(e.y + e.h + 2), TUNING.enemies.elite.chargeEnergy)
    burst(g, c.x, c.y, 'charge', 6)
  }
}

const puppetStep = (g, e, dt) => {
  const { x, y, vx, vy } = e
  STEPPERS[e.kind](g, e, dt)
  Object.assign(e, { x, y, vx, vy })
  steerPuppet(g, e, dt)
}

const allyBites = (g, e, foe) => {
  const before = foe.hp
  hurt(g, foe, 1)
  hurt(g, e, 1)
  if (e.plague && !foe.heavy && foe.hp > 0 && foe.hp < before) charmOne(g, foe, g.player)
}

const stepEnemies = (g, dt) => {
  for (const e of g.enemies) {
    e.flash = Math.max(0, (e.flash ?? 0) - dt)
    applyCrush(g, e)
    steady(e, dt)
    if (e.floated > 0) driftFoe(g, e, dt)
    else if (puppeted(e)) puppetStep(g, e, dt)
    else STEPPERS[e.kind](g, e, dt)
    stepMutations(g, e, dt)
    if (e.kind !== 'worm' && !e.free) nudgeOutOfSolid(g.world, e)
    settleFooting(g, e, dt)
    clampToRoom(e)
    e.iframes -= dt
    e.stun -= dt
    e.frozen -= dt
    settled(e)
    if (e.ally > 0) {
      e.ally -= dt
      if (e.ally <= 0) e.ally = 0
      if (e.ally === 0 && e.woken) wakeEnds(g, e)
    }
    stepElite(g, e, dt)
    applyHazards(g, e, dt)
    if (e.friendly || e.stun > 0 || e.asleep || e.intangible || e.stowed) continue
    if (e.ally) {
      const foe = g.enemies.find(o => o !== e && !o.friendly && !o.ally && overlap(e, o))
      if (foe) allyBites(g, e, foe)
    } else if (overlap(contactBox(e), g.player)) hurt(g, g.player, 1, 'world', 'BITTEN')
  }
  for (const e of g.enemies) if (e.hp <= 0) onKill(g, e)
  g.enemies = [...g.enemies.filter(e => e.hp > 0), ...g.spawns]
  g.spawns = []
}

const arcOn = (g, victim) => {
  const from = centre(victim)
  const next = g.enemies
    .filter(o => o !== victim && o.hp > 0 && !o.friendly && !o.ally && !o.intangible)
    .map(o => [Math.hypot(centre(o).x - from.x, centre(o).y - from.y), o])
    .filter(([d]) => d < R.shockArc)
    .sort((a, b) => a[0] - b[0])[0]?.[1]
  if (!next) return
  zap(g, from, centre(next))
  hurt(g, next, 1, 'world', 'CHARGE')
}

const shotEffects = (g, s, x, y, victim) => {
  const p = g.player
  if (!s.friendly) return
  if (hasRelic(p, 'incendiary')) ignite(g.world, x, y)
  if (hasRelic(p, 'shock')) energize(g.world, x, y, R.shockShot)
  if (victim && hasRelic(p, 'incendiary') && !victim.fireproof) victim.alight = Math.max(victim.alight ?? 0, TUNING.enemies.lives.burnFor)
  if (victim && hasRelic(p, 'shock')) arcOn(g, victim)
  if (victim && hasRelic(p, 'frostshot')) victim.stun = Math.max(victim.stun, 0.4)
  if (hasRelic(p, 'acidskull') && !victim && Math.random() < R.acidShot) {
    const m = matAt(g.world, x, y)
    if ([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.BRICK, M.SAND, M.ICE, M.SCRAP].includes(m)) setCell(g.world, x, y, M.EMPTY)
  }
}

const deflect = (g, s, victim, dt) => {
  const c = centre(victim)
  const d = Math.max(1, Math.hypot(s.x - c.x, s.y - c.y))
  const speed = Math.hypot(s.vx, s.vy)
  s.vx = ((s.x - c.x) / d) * speed
  s.vy = ((s.y - c.y) / d) * speed
  s.x += s.vx * dt * 2
  s.y += s.vy * dt * 2
  impact(g, s.x, s.y, M.METAL, -s.vx, -s.vy)
}

const landShot = (g, s, victim) => {
  if (s.loosed) victim.iframes = 0
  if (s.stain === undefined || victim.prop) hurt(g, victim, s.power ?? 1, 'player', 'SHOT')
  else stainStrikes(g, s, cell(s.x), cell(s.y), victim)
}

const stepShots = (g, dt) => {
  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    const victim = g.enemies.find(e => overlap(s, shotBox(e)) && !e.ally && !e.intangible && !e.stowed && !s.passed?.has(e))
    if (victim) {
      const blocked = victim.shielded && victim.stun <= 0 && Math.sign(s.vx) === -victim.facing
      if (victim.plated) deflect(g, s, victim, dt)
      else if (blocked) {
        s.vx *= -1
        impact(g, s.x, s.y, M.METAL, -s.vx, -s.vy)
      } else if (s.stain === undefined && (victim.ward === 'SHOT' || wardedAgainst(g, victim, 'SHOT'))) {
        landShot(g, s, victim)
        ;(s.passed ??= new Set()).add(victim)
        deflect(g, s, victim, dt)
      } else {
        landShot(g, s, victim)
        if (!victim.heavy) {
          victim.vx = Math.sign(s.vx) * TUNING.feel.shotKnock
          victim.shoved = Math.max(victim.shoved, 0.07)
        }
        shotEffects(g, s, cell(s.x), cell(s.y), victim)
        if (hasRelic(g.player, 'pierce')) (s.passed ??= new Set()).add(victim)
        else s.life = 0
      }
    } else if (props(matAt(g.world, cell(s.x), cell(s.y))).solid && (matAt(g.world, cell(s.x), cell(s.y)) === M.BEDROCK || !hasRelic(g.player, 'pierce'))) {
      shotEffects(g, s, cell(s.x), cell(s.y))
      if (s.stain !== undefined) stainStrikes(g, s, cell(s.x - s.vx * dt), cell(s.y - s.vy * dt))
      wallHitFx(g, s, matAt(g.world, cell(s.x), cell(s.y)))
      if (loosen(g.world, cell(s.x), cell(s.y))) burst(g, s.x, s.y, 'pale', 5)
      if (s.bounces > 0) {
        s.bounces -= 1
        const hitX = props(matAt(g.world, cell(s.x - s.vx * dt), cell(s.y))).solid
        if (hitX) s.vy *= -1
        else s.vx *= -1
        s.x -= s.vx * dt * 2
        s.y -= s.vy * dt * 2
      } else s.life = 0
    } else if (matAt(g.world, cell(s.x), cell(s.y)) === M.WATER && hasRelic(g.player, 'frostshot')) {
      setCell(g.world, cell(s.x), cell(s.y), M.ICE)
      s.life = 0
    }
  }
  g.shots = g.shots.filter(s => s.life > 0)
}

const landFireball = (g, f) => {
  const x = cell(f.x + 2)
  const y = cell(f.y + 2)
  if (f.bomb) {
    explode(g.world, x, y, 2)
    f.age = -1
    return
  }
  if (f.pellet) {
    burst(g, f.x + 1, f.y + 1, 'pale', 2)
    f.age = -1
    return
  }
  if (f.acid) {
    pourAcid(g, x, y - 1, f.acid)
    f.age = -1
    return
  }
  if (f.lava) {
    for (const dx of f.drop ? [0] : [0, 1, -1]) puff(g.world, x + dx, y - 1, M.LAVA, [0, 0])
    splash(g, f.x + 2, f.y + 2, 70, '#ff9a2e')
    f.age = -1
    return
  }
  for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
    ignite(g.world, x + dx, y + dy)
    if (matAt(g.world, x + dx, y + dy) === M.ICE) setCell(g.world, x + dx, y + dy, M.WATER)
  }
  if (f.napalm) spillNapalm(g, x, y - 1)
  if (f.torch) torchNear(g, f.x + 2, f.y + 2)
  burst(g, f.x + 2, f.y + 2, 'fire', 6)
  f.age = -1
}

const stepFireballs = (g, dt) => {
  for (const f of g.fireballs) {
    f.age += dt
    if (!f.straight) f.vy += TUNING.fireball.gravity * dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    const x = cell(f.x + 2)
    const y = cell(f.y + 2)
    const m = matAt(g.world, x, y)
    if (m === M.WATER && !f.bomb && !f.pellet && !f.acid) {
      puff(g.world, x, y - 1, M.STEAM, TUNING.world.steamLife)
      f.age = -1
    } else if (props(m).solid || (f.bomb && pocketAt(g.world, x, y))) {
      landFireball(g, f)
    } else if (props(m).flammability && !f.pellet && !f.acid && !f.bomb) {
      ignite(g.world, x, y)
      f.age = -1
    } else if (!f.friendly && overlap(f, g.player)) {
      hurt(g, g.player, 1, 'world', 'SHOT')
      f.age = -1
    } else if (f.friendly || f.age > TUNING.fireball.friendlyAfter) {
      const victim = g.enemies.find(e => !e.friendly && !e.intangible && !e.stowed && !(f.fromWarden && (e.warden || e.partOf)) && overlap(f, e))
      if (victim) {
        hurt(g, victim, 2, f.friendly && !f.fromWorld ? 'player' : 'world')
        if (f.foe && f.foe !== victim.kind) victim.lastBy = f.foe
        landFireball(g, f)
      }
    }
  }
  g.fireballs = g.fireballs.filter(f => f.age >= 0)
}

const stepFlung = (g, dt) => {
  const F = TUNING.flung
  stepMagnets(g, dt)
  for (const f of g.flung) {
    f.age += dt
    f.vy += F.gravity * dt
    const hitX = moveAxis(g.world, f, 'x', f.vx * dt)
    const hitY = moveAxis(g.world, f, 'y', f.vy * dt)
    const fresh = f.age < F.grace
    if (fresh && hitX) f.vx *= -0.3
    if (fresh && hitY) f.vy = 0
    const blocked = !fresh && (hitX || hitY)
    const victim = g.enemies.find(e => e !== f.thrower && !e.stowed && !e.intangible && !(f.thrower?.warden && e.partOf) && overlap(f, e))
    if (victim) {
      victim.flungBy = f.by
      hurt(g, victim, f.damage ?? F.damage, 'world', f.live ? 'CHARGE' : f.cause)
      if (f.thrower && !f.thrower.warden && !f.thrower.ally) victim.lastBy = f.thrower.kind
      victim.stun = Math.max(victim.stun, f.live ? TUNING.skills.repel.currentStun : F.stun)
      if (f.shard) f.life = 0
    }
    if (!f.safe && f.age > (f.armed ?? F.friendlyAfter) && overlap(f, g.player)) hurt(g, g.player, F.damage, 'world', 'CRUSHED')
    if (blocked || f.life <= f.age) {
      settleFlung(g, f)
      chipsAt(g, f.x + f.w / 2, f.y + f.h / 2, f.mat ?? M.SCRAP, f.shard ? 2 : 5)
      f.age = -1
    }
  }
  g.flung = g.flung.filter(f => f.age >= 0)
}

const stepChain = (g, dt) => {
  g.chainTime = Math.max(0, g.chainTime - dt)
  if (g.chainTime === 0) g.chain = 0
}

const stepEffects = (g, dt) => {
  if (g.timeStop > 0) g.timeStop -= dt
  for (const b of g.bolts) b.life -= dt
  g.bolts = g.bolts.filter(b => b.life > 0)
  for (const p of g.popups) {
    p.y -= 14 * dt
    p.life -= dt
  }
  g.popups = g.popups.filter(p => p.life > 0)
  g.pulse = Math.max(0, g.pulse - dt * 2.5)
  g.hurtFlash = Math.max(0, g.hurtFlash - dt * 3.5)
  g.shownDepth += (g.depth - g.shownDepth) * Math.min(1, dt * 1.6)
  if (g.hitNote) {
    g.hitNote.life -= dt
    if (g.hitNote.life <= 0) g.hitNote = null
  }
  if (g.toast) {
    g.toast.life -= dt
    if (g.toast.life <= 0) g.toast = null
  }
  g.shake = Math.max(0, g.shake - dt * 14)
  stepChain(g, dt)
}

const handleWorldEvents = g => {
  for (const event of g.world.events) {
    if (LOOSE_EVENTS[event.type]) {
      LOOSE_EVENTS[event.type](g, event)
      continue
    }
    g.pulse = Math.max(g.pulse, event.type === 'blast' ? 0.12 + event.reach * 0.1 : 1)
    if (event.type === 'blast') {
      blastPockets(g, event)
      blastFx(g, event)
      g.world.lastBlast = { ...event, at: g.time }
      feedEvent(g, 'blast', (event.x + 0.5) * BLOCK, (event.y + 0.5) * BLOCK)
    }
  }
  g.world.events.length = 0
}

export const quickstart = ring => g => {
  clearRun()
  Object.assign(g, createGame(g.depthOverride, 'playing', ring))
  g.player.wasJump = true
  g.player.shotReady = 0.2
}

const reset = g => {
  clearRun()
  Object.assign(g, createGame(g.depthOverride, 'playing', g.quickRing ?? null))
  g.player.wasJump = true
  g.player.shotReady = 0.2
}

export const restart = reset
export const jumpTo = (g, x, y) => {
  enterRoom(g, x, y)
  placeAtDoor(g)
}
export const depthHere = g => depthFor(g, g.ring)
export const newRun = reset
export const startFromTitle = reset
export const saveAndQuit = g => {
  storeRun(g)
  Object.assign(g, createGame(g.depthOverride, 'title'))
}
const PICKUPS = new Set(['coin', 'bomb', 'heart'])

const withKnownRelic = thing => (thing.relic && !RELIC_BY_ID[thing.relic] ? { ...thing, relic: null } : thing)

export const continueRun = g => {
  const saved = loadRun()
  if (!saved) {
    reset(g)
    return
  }
  const fresh = createRun(g.depthOverride)
  const omens = (saved.omens ?? (saved.omen ? [saved.omen] : [])).filter(id => OMENS[id])
  const keystones = new Set((saved.player.keystones ?? []).filter(id => KEYSTONE_BY_ID[id]))
  applyOmens(omens)
  saved.taught = new Set()
  const known = ({ kind }) => SKILLS[kind] || !ALL_SKILLS_EVER.has(kind)
  const rooms = Object.fromEntries(Object.entries(saved.rooms).map(([key, room]) => {
    const unpacked = unpackRoom(room, saved.map, keystones.has('overload'))
    return [key, {
      ...unpacked,
      enemies: unpacked.enemies.filter(e => STEPPERS[e.kind]),
      cards: unpacked.cards.filter(known).map(withKnownRelic),
      wares: unpacked.wares.map(withKnownRelic),
      pickups: unpacked.pickups.filter(c => PICKUPS.has(c.kind)),
    }]
  }))
  saved.cardPool = saved.cardPool.filter(kind => SKILLS[kind])
  const relics = new Set(saved.player.relics.filter(id => RELIC_BY_ID[id]))
  const player = { ...saved.player, skills: saved.player.skills.filter(known).slice(0, slotsOf({ keystones })), upgrades: new Set(saved.player.upgrades.filter(id => ALL_FORMS.has(id))), relics, keystones, wasJump: true }
  const secrets = (saved.secrets ?? []).filter(isCatalogued)
  Object.assign(g, fresh, saved, {
    rooms, player, omens, secrets,
    omen: OMENS[saved.omen] ? saved.omen : null,
    relicPool: saved.relicPool.filter(id => RELIC_BY_ID[id]),
    mutations: (saved.mutations ?? []).filter(id => MUTATION_BY_ID[id]),
    plants: (saved.plants ?? []).filter(plant => isCatalogued(plant.key)),
    menus: [], flung: [], phase: 'playing', toast: null, best: save.best, starter: fresh.starter, known: knownFrom(secrets),
  })
  enterRoom(g, saved.x, saved.y)
  g.shownDepth = g.depth
}
export const returnToTitle = g => {
  clearRun()
  persist()
  Object.assign(g, createGame(g.depthOverride, 'title'))
}

const stepTitle = (g, dt) => {
  g.titleTime += dt
  g.shownDepth = 0.3 + Math.sin(g.time * 0.25) * 0.25
  stepWorld(g.world, dt, 0.25)
  g.world.events.length = 0
  g.titleSpark = (g.titleSpark ?? 1) - dt
  if (g.titleSpark > 0) return
  g.titleSpark = 2.4 + Math.random() * 2
  energize(g.world, 2 + Math.floor(Math.random() * 24), 10, 40)
}

const edges = (g, input) => {
  const pausePressed = input.pause && !g.wasPause
  const skillsPressed = input.skills && !g.wasSkillsPage
  g.wasPause = input.pause
  g.wasSkillsPage = input.skills
  return { pausePressed, skillsPressed }
}

const STILL_INPUTS = ['left', 'right', 'up', 'down', 'jump', 'shoot', 'bomb', ...SKILL_ACTIONS]

const breathing = (g, input) => {
  const p = g.player
  if (!hasKeystone(p, 'breath') || g.phase !== 'playing' || g.menus.length > 0 || g.ending) return false
  return !STILL_INPUTS.some(key => input[key]) && p.grounded && Math.abs(p.vx) < 12
}

const stepTempo = (g, input) => {
  g.held = breathing(g, input)
  g.tempo += ((g.held ? K.breathTempo : 1) - g.tempo) * 0.3
  return g.tempo
}

export const step = (g, input, realDt) => {
  if (stepMoment(g, realDt, input.jump || input.shoot)) {
    if (g.moment?.landed) stepFx(g, realDt, 0)
    return
  }
  g.looking = input.look === true && g.phase === 'playing' && g.menus.length === 0
  const dt = (g.looking ? realDt * TUNING.feel.lookSlow : realDt) * timeScale(g) * stepTempo(g, input) * TUNING.feel.tempo
  g.time += dt
  stepEffects(g, dt)
  stepFx(g, realDt, dt)
  const { pausePressed, skillsPressed } = edges(g, input)
  if (g.door) return
  if (g.reveal) {
    g.reveal.life -= realDt
    if (g.reveal.life <= 0) g.reveal = g.revealQueue.shift() ?? null
    return
  }
  if (g.phase === 'title') stepTitle(g, dt)
  if (g.phase === 'cleared') {
    g.depth = 0
    crumble(g, 1)
  }
  if (g.phase === 'dead' || g.phase === 'cleared') {
    g.phaseTime += dt
    stepWorld(g.world, dt, g.depth)
    handleWorldEvents(g)
    if (g.phaseTime > (g.phase === 'cleared' ? TUNING.feel.clearedHold : TUNING.feel.deathHold) && !g.summaryShown) {
      g.summaryShown = true
      openSummary(g)
    }
  }
  if (g.ending?.asking) holdChoice(g, dt)
  if (g.menus.length > 0) {
    stepMenus(g, input)
    return
  }
  if (g.pause > 0) {
    g.pause -= dt
    return
  }
  if (g.phase !== 'playing') return
  if (g.ending) stepEnding(g, dt)
  if (g.phase !== 'playing') return
  if (g.hitstop > 0) {
    g.hitstop -= dt / TUNING.feel.tempo
    return
  }
  if (g.keystoneDue && !g.sealHold && !g.ending) {
    offerKeystones(g)
    return
  }
  if (pausePressed) {
    g.menuHeld = { ...input }
    storeRun(g)
    openPause(g)
    return
  }
  if (skillsPressed) {
    g.menuHeld = { ...input }
    openPause(g)
    return
  }
  if (input.map && !g.wasMap) {
    g.wasMap = true
    g.menuHeld = { ...input }
    openPause(g)
    return
  }
  g.wasMap = input.map
  if (g.pendingOffers > 0 && levelBurstDone(g) && !g.sealHold) {
    g.pendingOffers -= 1
    openOffer(g)
    return
  }
  const stopped = g.timeStop > 0
  if (!stopped) {
    if (!g.matterHeld) stepWorld(g.world, dt, g.depth)
    handleWorldEvents(g)
    stepCore(g, dt)
    stepFirstRoom(g, dt)
    stepRoomEvents(g, dt)
  }
  stepLockHints(g, dt)
  stepPlayer(g, input, dt / TUNING.feel.tempo)
  if (g.phase !== 'playing') return
  stepShots(g, dt / TUNING.feel.tempo)
  stepEffectList(g, stopped ? 0 : dt)
  if (stopped) return
  stepEnemies(g, dt)
  stepFireballs(g, dt)
  stepFlung(g, dt)
}
