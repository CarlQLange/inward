import { BLOCK, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, createWorld, encodeWorld, energize, explode, ignite, matAt, puff, restoreWorld, setCell, stepWorld, vineAt } from './world.js'
import { STARTERS, TITLE_ROOM } from './room.js'
import { THEMES, generateRoom } from './generate.js'
import { CORE_RING, OPPOSITE, buildMap, keyOf, ringOf } from './map.js'
import { WORLD_PX, cell, centre, hitsSolid, liquidAtPx, move, moveAxis, overlap, pushOutOfSolid } from './physics.js'
import { applyCrush, applyHazards, burst, hurt } from './combat.js'
import { ENEMY_DEFS, STEPPERS, clampToRoom, createEnemy, onDeath } from './enemies.js'
import { SKILLS, SKILL_DETAILS, SKILL_NAMES, cooldownOf, landSlam, muzzle, openFork, pourAcid, recordTrail, releaseMatter, ring, spillMatter, spillNapalm, stepDash, torchNear } from './skills.js'
import { dust } from './feel.js'
import { beginDoor, blastFx, coinMote, createFx, killFx, levelBurstDone, roomClearFx, shotFx, splash, stepFx, timeScale, wallHitFx, xpMotes } from './fx.js'
import { SKILL_ACTIONS, skillAction } from './controls.js'
import { RELICS, RELIC_BY_ID, hasRelic } from './relics.js'
import { stepEffectList } from './effects.js'
import { dropCard, openMenu, openMap, openPause, openSkills, openSummary, openSwap, openTitle, slotsFull, stepMenus } from './menus.js'
import { clearRun, knownNotes, loadRun, persist, recordRun, save, saveRun } from './store.js'

const P = TUNING.player
const R = TUNING.run
const CARD_SIZES = { core: [16, 16] }
const ALL_SKILLS = Object.keys(SKILLS)
const ALL_SKILLS_EVER = new Set([...ALL_SKILLS, 'echo', 'pact'])

const shuffled = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v)

const createPlayer = ({ x, row }) => ({
  x, y: row * BLOCK - P.height, w: 6, h: P.height,
  vx: 0, vy: 0, hp: P.hp, iframes: 0, stun: 0, facing: 1, crouching: false,
  grounded: false, sinceGround: 1, sinceJump: 1, jumpHeld: false,
  shotReady: 0, skills: [], upgrades: new Set(), relics: new Set(), aim: { x: 1, y: 0 }, drift: 0,
  wasJump: false, wasSkills: [false, false, false, false], bombs: P.startBombs, wasBomb: false,
  airJumps: 0, dashing: 0, trail: [], clinging: 0,
})

const nextRelic = g => g.relicPool.shift() ?? null

const createCard = g => ({ kind, x, row }) => {
  const resolved = kind === 'skill' ? g.cardPool.shift() ?? 'bolt' : kind
  const [w, h] = CARD_SIZES[resolved] ?? [12, 12]
  return { kind: resolved, x, y: row * BLOCK - h - 1, w, h, relic: kind === 'chest' || kind === 'altar' ? nextRelic(g) : undefined }
}

const createWare = g => ({ kind, x, row }) => ({
  kind, x, y: row * BLOCK - 13, w: 12, h: 12, price: TUNING.prices[kind],
  relic: kind === 'relic' ? nextRelic(g) : undefined,
})

const lean = g => {
  const owned = new Set(g.player.skills.map(s => s.kind))
  return {
    metal: owned.has('repel') || owned.has('bolt'),
    water: owned.has('bolt') || owned.has('frost'),
    fuel: owned.has('ember') || owned.has('gust'),
    scrap: owned.has('repel'),
  }
}

const depthFor = (g, ring) => {
  const distance = ring / CORE_RING
  return g.awake ? R.wakeDepth + (1 - R.wakeDepth) * distance : distance
}

const LOCK_OPENERS = {
  peat: ['bolt', 'ember', 'hammer', 'melt', 'acid', 'blink', 'dash'],
  gate: ['bolt', 'rod', 'acid', 'blink', 'melt'],
  brick: ['hammer', 'melt', 'acid', 'blink', 'mine'],
  ice: ['ember', 'hammer', 'melt', 'roar', 'blink', 'alchemy'],
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

const rollEvent = ring => (ring < CORE_RING && Math.random() < R.eventChance ? EVENTS[Math.floor(Math.random() * EVENTS.length)] : null)

const themeFor = (g, x, y, ring) => {
  if (ring === CORE_RING) return CORE_RING
  const wobble = Math.floor(((Math.sin(x * 12.9898 + y * 78.233 + g.seed) * 43758.5453) % 1 + 1) * 3) % 3
  return Math.min(CORE_RING - 1, Math.max(0, ring + (wobble === 2 ? 1 : wobble === 1 ? 0 : -1)))
}

const rollSpecial = ring => ({
  core: ring === CORE_RING,
  event: rollEvent(ring),
  card: ring < CORE_RING && Math.random() < R.cardChance,
  hermit: ring < CORE_RING && Math.random() < R.hermitChance,
  miner: ring < CORE_RING && Math.random() < R.minerChance,
  mole: ring < CORE_RING && Math.random() < R.moleChance,
})

const ELITES = ['burning', 'charged', 'armoured']

const makeElite = ring => e => {
  if (e.friendly || e.heavy || Math.random() > ring * TUNING.enemies.elite.chancePerRing) return e
  const elite = ELITES[Math.floor(Math.random() * ELITES.length)]
  return {
    ...e,
    elite,
    hp: Math.ceil(e.hp * TUNING.enemies.elite.hp),
    fireproof: e.fireproof || elite === 'burning',
    insulated: e.insulated || elite === 'charged',
    magnetic: e.magnetic || elite === 'armoured',
  }
}

const buildRoom = (g, x, y) => {
  const key = keyOf(x, y)
  const ring = ringOf(x, y)
  const links = g.map.links[key] ?? {}
  const start = key === keyOf(...g.map.start) && !g.quick
  const depth = ring / CORE_RING
  const themeIndex = themeFor(g, x, y, ring)
  const special = rollSpecial(ring)
  const definition = start
    ? g.starter
    : generateRoom({
      seed: g.seed + x * 7919 + y * 104723,
      depth,
      links: resolveLinks(g, links, depth),
      lean: lean(g),
      special,
      theme: THEMES[themeIndex],
      themeIndex,
    })
  const world = createWorld(definition.map, ring === CORE_RING)
  world.drains = definition.drains ?? []
  return {
    x, y, ring, links,
    theme: start ? g.starter.theme ?? 0 : themeIndex,
    event: start ? null : special.event,
    safetyNet: start && g.starter.safetyNet,
    layout: definition.layout,
    doors: definition.doors,
    world,
    enemies: definition.enemies.map(createEnemy).map(makeElite(ring)).map(e => ({
      ...e,
      cooldown: e.cooldown + R.entryGrace,
      hp: e.friendly ? e.hp : Math.ceil(e.hp * (1 + ring * R.hpPerRing)),
    })),
    cards: definition.cards.map(createCard(g)),
    wares: (definition.wares ?? []).map(createWare(g)),
    pickups: [],
    visited: false,
  }
}

const settleFlung = (g, f) => {
  const x = cell(f.x + 4)
  const y = cell(f.y + 4)
  const spot = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, -2]].find(([dx, dy]) => !props(matAt(g.world, x + dx, y + dy)).solid)
  if (!spot) return
  setCell(g.world, x + spot[0], y + spot[1], M.SCRAP)
  if (f.charged) energize(g.world, x + spot[0], y + spot[1], 30)
  if (f.shrapnel) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.shots.push({ x: f.x + 4, y: f.y + 4, w: 2, h: 2, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.3 })
    }
  }
}

const leaveRoom = g => {
  g.flung.forEach(f => settleFlung(g, f))
  Object.assign(g.rooms[keyOf(g.x, g.y)], { enemies: g.enemies, cards: g.cards, wares: g.wares, pickups: g.pickups })
}

const EVENT_TEXT = {
  arena: 'SOMETHING HERE WANTS YOU TO STAY.',
  flood: 'THE WATER IS RISING.',
  gasworks: 'THE AIR SMELLS WRONG.',
  collapse: 'THE ROOF WILL NOT HOLD.',
  nest: 'SOMETHING IS BREEDING HERE.',
  vault: 'A HOLLOW SOUND BEHIND THE ROCK.',
  altar: 'AN ALTAR. IT WANTS HEARTS.',
}

const enterRoom = (g, x, y) => {
  const key = keyOf(x, y)
  g.rooms[key] ??= buildRoom(g, x, y)
  if (g.player) g.player.iframes = Math.max(g.player.iframes, TUNING.feel.entryShield)
  const room = g.rooms[key]
  const firstVisit = !room.visited
  room.visited = true
  room.world.notes = knownNotes
  room.world.mat.forEach(m => knownNotes.add(`seen:${m}`))
  room.enemies.forEach(e => knownNotes.add(`met:${e.kind}`))
  if (firstVisit) g.roomsSeen += 1
  Object.assign(g, {
    x, y,
    ring: room.ring,
    world: room.world,
    enemies: room.enemies,
    cards: room.cards,
    wares: room.wares,
    pickups: room.pickups,
    depth: g.depthOverride ?? depthFor(g, room.ring),
    shots: [], fireballs: [], flung: [], bolts: [], particles: [], popups: [], effects: [], spawns: [], rings: [], lights: [], ripples: [],
    timeStop: 0,
    wasHolding: false,
  })
  if (firstVisit && room.theme !== g.lastTheme && !(room.ring > g.deepestRing)) showToast(g, THEMES[room.theme].name, EVENT_TEXT[room.event] ?? '')
  else if (firstVisit && room.event && EVENT_TEXT[room.event]) showToast(g, '', EVENT_TEXT[room.event])
  if (firstVisit) g.lastTheme = room.theme
  if (room.ring > g.deepestRing) {
    g.deepestRing = room.ring
    g.score += room.ring * R.ringBonus
    if (room.ring < CORE_RING) showToast(g, `RING ${room.ring + 1} OF ${CORE_RING}`, 'THE WORLD IS LESS PATIENT HERE.')
  }
}

const walkThrough = (g, dir) => {
  const here = g.rooms[keyOf(g.x, g.y)]
  const [nx, ny] = here.links[dir].to
  releaseMatter(g)
  leaveRoom(g)
  enterRoom(g, nx, ny)
  g.hinted = false
  beginDoor(g, dir, here)
  const p = g.player
  const door = g.rooms[keyOf(nx, ny)].doors[OPPOSITE[dir]]
  if (dir === 'right' || dir === 'left') {
    p.x = dir === 'right' ? 1 : WORLD_PX - p.w - 1
    p.y = (door.row + 2) * BLOCK - p.h
    p.vy = Math.min(p.vy, 0)
  } else {
    p.x = (door.col + 1) * BLOCK - p.w / 2
    p.y = dir === 'down' ? 1 : WORLD_PX - p.h - 1
    p.vy = dir === 'up' ? -P.jump : Math.max(p.vy, 0)
  }
  storeRun(g)
}

const RUN_FIELDS = [
  'seed', 'map', 'x', 'y', 'awake', 'roomsSeen', 'deepestRing', 'cardPool', 'score', 'chainPeak',
  'xp', 'level', 'nextLevel', 'gold', 'kills', 'environmentKills', 'pendingOffers', 'relicPool', 'lastTheme', 'quick', 'quickRing',
]

const packRoom = room => ({
  x: room.x, y: room.y, ring: room.ring, doors: room.doors, visited: room.visited,
  theme: room.theme, event: room.event, sealed: room.sealed, cleared: room.cleared, safetyNet: room.safetyNet, healed: room.healed, layout: room.layout,
  enemies: room.enemies, cards: room.cards, wares: room.wares, pickups: room.pickups,
  drains: room.world.drains, world: encodeWorld(room.world),
})

const unpackRoom = (packed, map) => ({
  ...packed,
  links: map.links[keyOf(packed.x, packed.y)] ?? {},
  world: restoreWorld(packed.world, packed.ring === CORE_RING, packed.drains),
})

const storeRun = g => {
  if (g.phase !== 'playing') return
  leaveRoom(g)
  g.flung = []
  saveRun({
    ...Object.fromEntries(RUN_FIELDS.map(f => [f, g[f]])),
    player: { ...g.player, upgrades: [...g.player.upgrades], relics: [...g.player.relics], trail: [] },
    rooms: Object.fromEntries(Object.entries(g.rooms).map(([key, room]) => [key, packRoom(room)])),
  })
  persist()
}

const showToast = (g, title) => { g.toast = { title, life: R.toastLife, born: R.toastLife } }

const ringCells = (map, ring) =>
  Object.keys(map.links)
    .map(key => key.split(',').map(Number))
    .filter(([x, y]) => ringOf(x, y) === ring)

const applyQuickstart = (g, ring) => {
  const p = g.player
  const kinds = shuffled(ALL_SKILLS).slice(0, Math.min(P.skillSlots, 1 + ring))
  p.skills = kinds.map(kind => ({ kind, ready: 0 }))
  for (let n = 0; n < ring * 2; n++) {
    const [pick] = shuffled(availableUpgrades(p))
    if (pick) p.upgrades.add(pick.node.id)
  }
  g.relicPool.splice(0, ring).forEach(id => p.relics.add(id))
  applyRelic(p)
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

const createRun = (depthOverride, quickRing = null) => {
  const seed = Math.floor(Math.random() * 1e9)
  const map = buildMap(seed)
  const starter = STARTERS[Math.floor(Math.random() * STARTERS.length)]
  const firstCard = starter.cards[0].kind
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
    cardPool: shuffled(ALL_SKILLS.filter(s => s !== firstCard)),
    relicPool: shuffled(RELICS.map(r => r.id)),
    effects: [],
    spawns: [],
    timeStop: 0,
    matterHeld: false,
    evolving: null,
    past: [],
    lastTheme: 0,
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
    g.toast = { title: `QUICKSTART: RING ${quickRing + 1}`, text: 'RECORDS ARE NOT KEPT.', life: 6 }
    g.shownDepth = g.depth
  } else {
    enterRoom(g, ...map.start)
    g.toast = { title: starter.name, text: '', prompts: [['move', 'MOVE'], ['jump', 'JUMP'], ['shoot', 'SHOOT'], ['look', 'LOOK']], life: 8 }
  }
  return g
}

export const createGame = (depthOverride = null, phase = 'playing', quickRing = null) => {
  const g = createRun(depthOverride, quickRing)
  if (phase === 'title') {
    Object.assign(g, {
      phase: 'title', titleTime: 0, toast: null, shownDepth: 0.25,
      world: createWorld(TITLE_ROOM.map, false), enemies: [], cards: [], wares: [], pickups: [],
      player: createPlayer(TITLE_ROOM.spawn),
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
  return ALL_SKILLS.filter(s => !carried.has(s) && !lying.has(s))
}

const evolve = (g, skill, node) => {
  const p = g.player
  p.upgrades.add(node.id)
  g.evolving = { skill, name: node.name, tint: node.tint, life: R.evolveLife }
  const c = centre(p)
  ring(g, c.x, c.y, node.tint, 32, 150)
  g.pulse = 1
  g.shake = Math.max(g.shake, 4)
  p.iframes = Math.max(p.iframes, 0.6)
}

const arrivesEvolved = (g, kind) => {
  const p = g.player
  if (!hasRelic(p, 'dice')) return
  const [node] = shuffled(openFork(p, kind))
  if (node) evolve(g, kind, node)
}

const learn = (g, kind) => {
  const p = g.player
  p.skills.push({ kind, ready: 0 })
  g.cardPool = g.cardPool.filter(s => s !== kind)
  showToast(g, SKILL_NAMES[kind], SKILL_DETAILS[kind])
  g.toast.prompts = [[skillAction(p.skills.length - 1), '']]
  arrivesEvolved(g, kind)
  g.pulse = 1
  g.shake = Math.max(g.shake, 3)
  if (!g.awake) {
    g.awake = true
    g.depth = g.depthOverride ?? depthFor(g, g.ring)
  }
}

const learnOrSwap = (g, kind, onTake = () => {}, onLeave = () => {}) => {
  if (!slotsFull(g.player)) {
    learn(g, kind)
    onTake(g)
    return
  }
  openSwap(g, kind, gm => {
    gm.cardPool = gm.cardPool.filter(s => s !== kind)
    showToast(gm, `${SKILL_NAMES[kind]}: LEARNED`, SKILL_DETAILS[kind])
    arrivesEvolved(gm, kind)
    onTake(gm)
  }, onLeave)
}

const OPTION_RESULTS = {
  new: g => {
    const kind = shuffled(unownedSkills(g))[0]
    learnOrSwap(g, kind, () => {}, gm => dropCard(gm, kind))
  },
  upgrade: (g, option) => {
    evolve(g, option.skill, option.node)
  },
  relic: g => gainRelic(g, nextRelic(g)),
  mend: g => {
    g.player.hp = P.hp
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

const forkChoices = p => {
  const open = shuffled(availableUpgrades(p))
  const chosen = open[0]?.skill
  return [...open.filter(o => o.skill === chosen), ...open.filter(o => o.skill !== chosen)]
}

const fallbacks = g => [...(g.relicPool.length ? [{ type: 'relic', relic: g.relicPool[0] }] : []), { type: 'mend' }]

const offersFor = (g, kinds) => {
  const p = g.player
  const forks = kinds.includes('upgrade') ? forkChoices(p) : []
  const fresh = kinds.includes('new') && unownedSkills(g).length > 0 ? [{ type: 'new' }] : []
  const third = slotsFull(p) ? [...forks.slice(2), ...fresh] : [...fresh, ...forks.slice(2)]
  const rest = kinds.length > 1 && p.skills.length > 0 ? fallbacks(g) : []
  return [...forks.slice(0, 2), ...third, ...rest].slice(0, 3)
}

const openOffer = (g, kinds = ['new', 'upgrade'], title = 'LEVEL UP') => {
  const options = offersFor(g, kinds)
  if (options.length === 0) return
  openMenu(g, {
    page: 'offer',
    layout: 'cards',
    back: false,
    title,
    items: options.map(option => ({ option, run: gm => chooseOption(gm, option) })),
  })
}

const addPopup = (g, x, y, text, colour = 'white') => g.popups.push({ x, y, text, colour, life: 1.1 })

const gainRelic = (g, id) => {
  if (!id) {
    g.score += 250
    showToast(g, 'AN EMPTY CHEST', 'YOU HAVE FOUND EVERYTHING THERE IS.')
    return
  }
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
  p.fireproof = hasRelic(p, 'fireboots')
  p.insulated = hasRelic(p, 'rubber')
  p.smokeproof = hasRelic(p, 'gills')
}

const gainXp = (g, amount) => {
  g.xp += amount
  while (g.xp >= g.nextLevel) {
    g.xp -= g.nextLevel
    g.level += 1
    g.nextLevel = R.firstLevel + (g.level - 1) * R.levelGrowth
    g.pendingOffers += 1
    g.player.hp = Math.min(P.hp, g.player.hp + R.levelHeal)
  }
}

const dropLoot = (g, e, base) => {
  const c = centre(e)
  for (let i = 0; i < base; i++) {
    g.pickups.push({
      kind: 'coin', x: c.x - 2, y: c.y - 2, w: 5, h: 5,
      vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 60,
    })
  }
  if (Math.random() < 0.12) g.pickups.push({ kind: 'heart', x: c.x - 3, y: c.y - 3, w: 7, h: 6, vx: 0, vy: -90 })
  if (Math.random() < R.bombDropChance) g.pickups.push({ kind: 'bomb', x: c.x - 3, y: c.y - 3, w: 7, h: 7, vx: 0, vy: -90 })
}

const onKill = (g, e) => {
  onDeath(g, e)
  knownNotes.add(`killed:${e.kind}`)
  const c = centre(e)
  killFx(g, e)
  g.hitstop = Math.max(g.hitstop, TUNING.feel.killStop)
  const def = ENEMY_DEFS[e.kind]
  if (e.friendly) {
    dropLoot(g, e, 5)
    return
  }
  if (e.kind === 'mimic') gainRelic(g, nextRelic(g))
  const p = g.player
  const environmental = e.lastSource !== 'player'
  if (hasRelic(p, 'battery') && environmental) p.skills.forEach(s => { s.ready = 0 })
  if (hasRelic(p, 'sack')) spillMatter(g, e, 3)
  g.chain = g.chainTime > 0 ? g.chain + 1 : 1
  g.chainTime = hasRelic(p, 'chain') ? Infinity : R.chainWindow
  if (hasRelic(p, 'skull') && g.chain % R.skullChain === 0) p.hp = Math.min(P.hp, p.hp + 1)
  g.chainPeak = Math.max(g.chainPeak, g.chain)
  const points = def.value * g.chain * (environmental ? 2 : 1)
  g.score += points
  g.kills += 1
  if (environmental) g.environmentKills += 1
  const earned = hasRelic(p, 'gem') ? (environmental ? R.worldXpSworn : 0) : (environmental ? R.environmentXp : 1)
  gainXp(g, earned)
  xpMotes(g, c, earned)
  addPopup(g, c.x, c.y - 6, g.chain > 1 ? `${points} X${g.chain}` : String(points), environmental ? 'charge' : 'white')
  dropLoot(g, e, environmental ? 2 : 1)
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

const assisted = (g, p, aim) => {
  if (!p.assist) return aim
  const from = muzzle(p)
  const F = TUNING.feel
  let best = null
  let bestAngle = p.assist
  for (const e of g.enemies) {
    if (e.friendly || e.ally) continue
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

const ASSISTED_SKILLS = new Set(['bolt', 'swap', 'charm', 'grapple', 'melt', 'ember', 'acid', 'mine', 'frost'])

const fireShot = (g, p, aim, life = P.shotLife) => {
  const from = muzzle(p)
  g.shots.push({
    x: from.x - 1, y: from.y - 1, w: 2, h: 2, vx: aim.x * P.shotSpeed, vy: aim.y * P.shotSpeed, life,
    bounces: hasRelic(p, 'ricochet') ? 3 : 0, friendly: true,
  })
}

const turned = ({ x, y }, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) })

const shoot = (g, p) => {
  const aim = assisted(g, p, p.aim)
  const scatter = hasRelic(p, 'spread')
  if (scatter) {
    for (let n = 0; n < R.scatterShots; n++) fireShot(g, p, turned(aim, (n - (R.scatterShots - 1) / 2) * 0.2), R.scatterLife)
    p.vx -= aim.x * R.scatterKick
    p.vy -= aim.y * R.scatterKick
    p.drift = Math.max(p.drift, 0.15)
    p.jumpHeld = false
  } else fireShot(g, p, aim)
  shotFx(g, p, aim)
  p.shotReady = P.shotEvery * (scatter ? 3 : 1)
}

const castSkill = (g, p, skill) => {
  const aim = p.aim
  if (ASSISTED_SKILLS.has(skill.kind)) p.aim = assisted(g, p, aim)
  SKILLS[skill.kind](g, p)
  p.aim = aim
  skill.ready = cooldownOf(p, skill.kind)
}

const nearFire = (g, p) => {
  const reach = Math.ceil(R.hotHandsReach / BLOCK)
  const [cx, cy] = [cell(p.x + p.w / 2), cell(p.y + p.h / 2)]
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) if (burningAt(g.world, cx + dx, cy + dy)) return true
  }
  return false
}

const useSkills = (g, p, input, stunned, dt) => {
  const rate = hasRelic(p, 'hands') && nearFire(g, p) ? R.hotHandsRate : 1
  p.skills.forEach((skill, slot) => {
    skill.ready -= dt * rate
    const pressed = input[SKILL_ACTIONS[slot]] === true
    if (!stunned && pressed && !p.wasSkills[slot] && skill.ready <= 0) castSkill(g, p, skill)
  })
  SKILL_ACTIONS.forEach((key, slot) => { p.wasSkills[slot] = input[key] === true })
}

const finishRun = (g, phase) => {
  clearRun()
  g.phase = phase
  g.phaseTime = 0
  g.newBest = !g.quick && recordRun({
    score: g.score,
    chainPeak: g.chainPeak,
    roomReached: g.ring + 1,
    reachedCore: phase === 'cleared',
    worldKills: g.environmentKills,
  })
  g.best = save.best
}

const collectCards = (g, p) => {
  for (const c of g.cards) if (c.declined && !overlap(p, c)) c.declined = false
  const touched = g.cards.find(c => overlap(p, c) && !c.declined)
  if (!touched) return
  if (touched.kind === 'core') {
    g.score += R.coreBonus + p.hp * 100
    finishRun(g, 'cleared')
    return
  }
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
    title: 'THE ALTAR ASKS',
    items: [
      {
        card: { icon: found.icon, name: found.name, text: found.text, sub: `COSTS ${R.altarPrice} HEARTS` },
        run: gm => {
          gm.menus.pop()
          if (gm.player.hp <= R.altarPrice) {
            showToast(gm, 'THE ALTAR REFUSES', 'YOU HAVE TOO LITTLE TO GIVE.')
            return
          }
          gm.player.hp -= R.altarPrice
          gm.cards = gm.cards.filter(c => c !== altar)
          gainRelic(gm, altar.relic)
        },
      },
      { card: { name: 'NOT TODAY', text: 'KEEP YOUR BLOOD', sub: '' }, run: gm => { gm.menus.pop() } },
    ],
  })
}

const talkToInhabitants = (g, p) => {
  for (const e of g.enemies) {
    if (!e.friendly || e.spent || !overlap(p, e)) continue
    if (e.kind === 'hermit' && availableUpgrades(p).length > 0) {
      e.spent = true
      openOffer(g, ['upgrade'], 'THE HERMIT TEACHES')
    }
    if (e.kind === 'miner' && unownedSkills(g).length > 0) {
      e.spent = true
      openOffer(g, ['new'], 'THE MINER TEACHES')
    }
  }
}

const buyWares = (g, p) => {
  const ware = g.wares.find(w => overlap(p, w) && g.gold >= w.price)
  if (!ware) return
  g.gold -= ware.price
  g.wares = g.wares.filter(w => w !== ware)
  if (ware.kind === 'heart') p.hp = Math.min(P.hp, p.hp + 2)
  else if (ware.kind === 'bomb') p.bombs += 1
  else if (ware.kind === 'relic') gainRelic(g, ware.relic)
  else g.pendingOffers += 1
  g.pulse = Math.max(g.pulse, 0.5)
}

const stepMagnetism = (g, p, dt) => {
  if (!hasRelic(p, 'coinmagnet')) return
  const c = centre(p)
  const pulled = [...g.enemies.filter(e => e.magnetic && !e.heavy && !e.friendly), ...g.fireballs.filter(f => f.pellet && !f.friendly)]
  for (const e of pulled) {
    const [dx, dy] = [c.x - centre(e).x, c.y - centre(e).y]
    const d = Math.max(4, Math.hypot(dx, dy))
    if (d > R.magnetReach) continue
    e.vx += (dx / d) * R.magnetPull * dt
    e.vy += (dy / d) * R.magnetPull * dt
    if (e.kind) e.shoved = Math.max(e.shoved, 0.05)
  }
}

const usePickups = (g, p, dt) => {
  stepMagnetism(g, p, dt)
  for (const c of g.pickups) {
    c.age = (c.age ?? 0) + dt
    if (c.kind === 'coin' && c.age > R.coinSettle) {
      const dx = p.x - c.x
      const dy = p.y - c.y
      const d = Math.max(1, Math.hypot(dx, dy))
      if (d < (hasRelic(p, 'coinmagnet') ? R.magnetReach : R.coinReach)) {
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
    } else if (c.kind === 'bomb') p.bombs += 1
    else p.hp = Math.min(P.hp, p.hp + 1)
  }
  g.pickups = g.pickups.filter(c => !c.taken)
}

const stepCore = (g, dt) => {
  for (const card of g.cards) {
    if (card.kind !== 'core') continue
    const dx = g.player.x - card.x
    const dy = g.player.y - card.y
    const length = Math.max(1, Math.hypot(dx, dy))
    card.x += (dx / length) * R.corePull * dt
    card.y += (dy / length) * R.corePull * dt
  }
  if (!g.world.overloaded || Math.random() > TUNING.world.overloadCrumble * dt) return
  const x = 1 + Math.floor(Math.random() * 26)
  const y = 1 + Math.floor(Math.random() * 26)
  if (matAt(g.world, x, y) === M.ROCK && !props(matAt(g.world, x, y + 1)).solid) setCell(g.world, x, y, M.SAND)
}

const LOCK_HINTS = {
  [M.PEAT]: ['PEAT PLUG', 'FIRE WILL CLEAR THIS.'],
  [M.GATE]: ['METAL GATE', 'OPENS WHEN CHARGED. A BOMB ALSO WORKS.'],
  [M.BRICK]: ['BRICKWORK', 'NEEDS A HAMMER OR A BLAST.'],
  [M.ICE]: ['ICE PLUG', 'MELT IT, BREAK IT, OR BLOW IT UP.'],
  [M.SCRAP]: ['SCRAP HEAP', 'THROW IT, BREAK IT, OR BLOW IT UP.'],
}

const doorPoint = (dir, door) => ({
  left: [BLOCK, (door.row + 1) * BLOCK],
  right: [WORLD_PX - BLOCK, (door.row + 1) * BLOCK],
  up: [(door.col + 1) * BLOCK, BLOCK],
  down: [(door.col + 1) * BLOCK, WORLD_PX - BLOCK],
}[dir])

const doorCell = (dir, door) => ({
  left: [1, door.row], right: [26, door.row], up: [door.col, 1], down: [door.col, 26],
}[dir])

const stepLockHints = g => {
  if (g.hinted) return
  const room = g.rooms[keyOf(g.x, g.y)]
  const c = centre(g.player)
  for (const [dir, door] of Object.entries(room.doors)) {
    const hint = LOCK_HINTS[matAt(g.world, ...doorCell(dir, door))]
    if (!hint) continue
    const [dx, dy] = doorPoint(dir, door)
    if (Math.hypot(c.x - dx, c.y - dy) > R.hintReach) continue
    showToast(g, hint[0], hint[1])
    g.hinted = true
    return
  }
}

const throwBomb = (g, p, input) => {
  const pressed = input.bomb && !p.wasBomb
  p.wasBomb = input.bomb
  if (!pressed || p.bombs <= 0) return
  p.bombs -= 1
  const from = muzzle(p)
  g.fireballs.push({
    x: from.x - 2, y: from.y - 2, w: 4, h: 4,
    vx: p.aim.x * 150, vy: p.aim.y * 150 - 70,
    age: 0, friendly: true, bomb: true,
  })
}

const sealRoom = (g, room) => {
  room.sealed = true
  for (const [dir, door] of Object.entries(room.doors)) {
    const [x, y] = doorCell(dir, door)
    setCell(g.world, x, y, M.BRICK)
    if (dir === 'left' || dir === 'right') setCell(g.world, x, y + 1, M.BRICK)
    else setCell(g.world, x + 1, y, M.BRICK)
  }
  g.shake = Math.max(g.shake, 6)
  showToast(g, 'THE WAY OUT IS GONE', 'KILL EVERYTHING.')
}

const unsealRoom = (g, room) => {
  room.sealed = false
  room.cleared = true
  for (const [dir, door] of Object.entries(room.doors)) {
    const [x, y] = doorCell(dir, door)
    setCell(g.world, x, y, M.EMPTY)
    if (dir === 'left' || dir === 'right') setCell(g.world, x, y + 1, M.EMPTY)
    else setCell(g.world, x + 1, y, M.EMPTY)
  }
  const c = centre(g.player)
  g.cards.push({ kind: 'chest', x: c.x - 6, y: c.y - 16, w: 12, h: 12, relic: nextRelic(g) })
  showToast(g, 'THE ROOM LETS GO', 'IT LEAVES SOMETHING BEHIND.')
  g.pulse = 1
}

const stepRoomEvents = (g, dt) => {
  const room = g.rooms[keyOf(g.x, g.y)]
  const foesLeft = g.enemies.some(e => !e.friendly && !e.ally && !e.spawned)
  if (foesLeft) room.hadFoes = true
  if (room.hadFoes && !foesLeft && !room.healed) {
    room.healed = true
    const p = g.player
    if (p.hp < P.hp) {
      p.hp = Math.min(P.hp, p.hp + TUNING.feel.roomClearHeal)
      const c = centre(p)
      g.popups.push({ x: c.x, y: g.player.y - 11, icon: 'HEAL', colour: 'heal', life: 1.2 })
    }
    roomClearFx(g)
  }
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

const quakeRoom = g => {
  const candidates = []
  g.world.mat.forEach((m, i) => {
    if (m === M.PEAT && g.world.mat[i + 28] === M.EMPTY) candidates.push(i)
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

const useDoors = (g, p) => {
  const { doors } = g.rooms[keyOf(g.x, g.y)]
  if (doors.right && p.x + p.w >= WORLD_PX - 0.5) walkThrough(g, 'right')
  else if (doors.left && p.x <= 0.5) walkThrough(g, 'left')
  else if (doors.down && p.y + p.h >= WORLD_PX - 0.5) walkThrough(g, 'down')
  else if (doors.up && p.y <= 0.5) walkThrough(g, 'up')
}

const stepPlayer = (g, input, dt) => {
  const p = g.player
  const world = g.world
  const middle = p.x + p.w / 2
  const swimming = liquidAtPx(world, middle, p.y + p.h / 2)
  const wading = liquidAtPx(world, middle, p.y + p.h - 1)
  const headUnder = liquidAtPx(world, middle, p.y - 4)
  applyCrush(g, p)
  const stunned = p.stun > 0
  const plant = input.plant && p.grounded
  crouch(world, p, input.down && !input.jump && p.grounded && !swimming && !plant)
  const wish = stunned ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const fins = hasRelic(p, 'gills') && swimming ? 1.5 : 1
  const top = P.run * fins * (swimming ? P.swimRun : 1)
  const towards = p.crouching || plant ? 0 : wish * top
  const change = P.accel * dt * (p.drift > 0 ? 0.15 : 1)
  p.drift -= dt
  p.vx += Math.max(-change, Math.min(change, towards - p.vx))
  if (wish !== 0 && !input.pointer && !input.aim?.free) p.facing = wish
  p.aim = aimFrom(p, input)

  const vine = vineAt(world, cell(middle), cell(p.y + p.h / 2))
  const climbing = vine && !input.jump && (input.up || input.down)
  const floating = input.jump && hasRelic(p, 'feather') && p.vy > 0
  const gravity = swimming ? P.gravity * P.swimGravity : P.gravity
  const maxFall = swimming ? P.swimMaxFall : floating ? R.featherFall : vine ? R.vineSlide : P.maxFall
  if (climbing) p.vy = input.up ? -R.climbSpeed : R.climbSpeed
  else if (p.dashing <= 0 && !(p.zipping > 0)) p.vy = Math.min(maxFall, p.vy + gravity * dt)
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
      p.vy = -P.jump
      p.jumpHeld = true
      p.sinceJump = 1
    } else if (swimming) {
      p.vy = -P.swimStroke
      p.sinceJump = 1
    } else if (p.sinceGround < P.coyote || vine) {
      p.vy = -P.jump
      p.jumpHeld = true
      p.sinceJump = 1
      p.sinceGround = 1
    } else if (p.clinging > 0) {
      p.vy = -P.jump
      p.vx = -p.facing * R.wallKick
      p.drift = 0.18
      p.facing *= -1
      p.jumpHeld = true
      p.sinceJump = 1
      p.clinging = 0
    } else if (p.airJumps > 0) {
      p.airJumps -= 1
      p.vy = -P.jump * 0.9
      p.jumpHeld = true
      p.sinceJump = 1
      burst(g, p.x + 3, p.y + p.h, 'pale', 4)
    }
  }
  if (p.jumpHeld && !input.jump) {
    if (p.vy < 0) p.vy *= P.jumpCut
    p.jumpHeld = false
  }
  p.wasJump = input.jump

  const falling = p.vy
  const wasGrounded = p.grounded
  if (input.jump && !p.wasJumpFeel && p.sinceJump === 1) dust(g, p.x + p.w / 2, p.y + p.h, 4)
  p.wasJumpFeel = input.jump
  move(world, p, dt)
  pushOutOfSolid(world, p)
  stepMotionFeel(g, p, input, dt, wasGrounded, falling, swimming)
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
  recordTrail(p, dt)

  p.shotReady -= dt
  if (!input.shoot) p.holdFire = false
  if (!stunned && input.shoot && !p.holdFire && p.shotReady <= 0) shoot(g, p)
  useSkills(g, p, input, stunned, dt)
  if (!stunned) throwBomb(g, p, input)
  p.iframes -= dt
  p.stun -= dt

  applyHazards(g, p, dt)
  collectCards(g, p)
  talkToInhabitants(g, p)
  buyWares(g, p)
  usePickups(g, p, dt)
  if (g.phase === 'playing') useDoors(g, p)
  if (p.hp <= 0 && g.phase === 'playing' && hasRelic(p, 'phoenix')) {
    p.relics.delete('phoenix')
    p.hp = R.phoenixHearts
    p.iframes = 2
    const c = centre(p)
    explode(world, cell(c.x), cell(c.y), 2)
    showToast(g, 'THE PHOENIX BURNS', 'NOT THIS TIME.')
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

const stepEnemies = (g, dt) => {
  for (const e of g.enemies) {
    e.flash = Math.max(0, (e.flash ?? 0) - dt)
    applyCrush(g, e)
    STEPPERS[e.kind](g, e, dt)
    if (e.kind !== 'worm') pushOutOfSolid(g.world, e)
    clampToRoom(e)
    e.iframes -= dt
    e.stun -= dt
    e.frozen -= dt
    if (e.ally > 0) {
      e.ally -= dt
      if (e.ally <= 0) {
        e.ally = 0
        if (e.detonates) e.hp = 0
      }
    }
    stepElite(g, e, dt)
    applyHazards(g, e, dt)
    if (e.friendly || e.stun > 0) continue
    if (e.ally) {
      const foe = g.enemies.find(o => o !== e && !o.friendly && !o.ally && overlap(e, o))
      if (foe) {
        hurt(g, foe, 1)
        hurt(g, e, 1)
      }
    } else if (overlap(e, g.player)) hurt(g, g.player, 1, 'world', 'BITTEN')
  }
  for (const e of g.enemies) if (e.hp <= 0) onKill(g, e)
  g.enemies = [...g.enemies.filter(e => e.hp > 0), ...g.spawns]
  g.spawns = []
}

const shotEffects = (g, s, x, y, victim) => {
  const p = g.player
  if (!s.friendly) return
  if (hasRelic(p, 'incendiary')) ignite(g.world, x, y)
  if (hasRelic(p, 'shock')) energize(g.world, x, y, R.shockShot)
  if (victim && hasRelic(p, 'frostshot')) victim.stun = Math.max(victim.stun, 0.4)
  if (hasRelic(p, 'acidskull') && !victim && Math.random() < R.acidShot) {
    const m = matAt(g.world, x, y)
    if ([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.BRICK, M.SAND, M.ICE, M.SCRAP].includes(m)) setCell(g.world, x, y, M.EMPTY)
  }
}

const stepShots = (g, dt) => {
  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    const victim = g.enemies.find(e => overlap(s, e) && !e.ally && !s.passed?.has(e))
    if (victim) {
      const blocked = victim.shielded && victim.stun <= 0 && Math.sign(s.vx) === -victim.facing
      if (blocked) {
        s.vx *= -1
        burst(g, s.x, s.y, 'pale', 3)
      } else {
        hurt(g, victim, 1, 'player')
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
      wallHitFx(g, s, matAt(g.world, cell(s.x), cell(s.y)))
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
  if (f.comet) explode(g.world, x, y, 1)
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
    } else if (props(m).solid) {
      landFireball(g, f)
    } else if (props(m).flammability && !f.pellet && !f.acid && !f.bomb) {
      ignite(g.world, x, y)
      f.age = -1
    } else if (!f.friendly && overlap(f, g.player)) {
      hurt(g, g.player, 1, 'world', 'SHOT')
      f.age = -1
    } else if (f.friendly || f.age > TUNING.fireball.friendlyAfter) {
      const victim = g.enemies.find(e => !e.friendly && overlap(f, e))
      if (victim) {
        hurt(g, victim, 2, f.friendly ? 'player' : 'world')
        landFireball(g, f)
      }
    }
  }
  g.fireballs = g.fireballs.filter(f => f.age >= 0)
}

const stepFlung = (g, dt) => {
  const F = TUNING.flung
  for (const f of g.flung) {
    f.age += dt
    f.vy += F.gravity * dt
    const blocked = moveAxis(g.world, f, 'x', f.vx * dt) || moveAxis(g.world, f, 'y', f.vy * dt)
    const victim = g.enemies.find(e => overlap(f, e))
    if (victim) {
      hurt(g, victim, F.damage)
      victim.stun = Math.max(victim.stun, F.stun)
    }
    if (!f.safe && f.age > F.friendlyAfter && overlap(f, g.player)) hurt(g, g.player, F.damage, 'world', 'CRUSHED')
    if (blocked) {
      settleFlung(g, f)
      burst(g, f.x + 4, f.y + 4, 'pale', 6)
      f.age = -1
    }
  }
  g.flung = g.flung.filter(f => f.age >= 0)
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
  if (g.toast) {
    g.toast.life -= dt
    if (g.toast.life <= 0) g.toast = null
  }
  g.shake = Math.max(0, g.shake - dt * 14)
  g.chainTime = Math.max(0, g.chainTime - dt)
  if (g.chainTime === 0) g.chain = 0
}

const handleWorldEvents = g => {
  for (const event of g.world.events) {
    g.pulse = Math.max(g.pulse, event.type === 'blast' ? 0.12 + event.reach * 0.1 : 1)
    if (event.type === 'blast') blastFx(g, event)
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
export const depthHere = g => depthFor(g, g.ring)
export const newRun = reset
export const startFromTitle = reset
export const saveAndQuit = g => {
  storeRun(g)
  Object.assign(g, createGame(g.depthOverride, 'title'))
}
export const continueRun = g => {
  const saved = loadRun()
  if (!saved) {
    reset(g)
    return
  }
  const fresh = createRun(g.depthOverride)
  saved.taught = new Set()
  const known = ({ kind }) => SKILLS[kind] || !ALL_SKILLS_EVER.has(kind)
  const rooms = Object.fromEntries(Object.entries(saved.rooms).map(([key, room]) => {
    const unpacked = unpackRoom(room, saved.map)
    return [key, { ...unpacked, cards: unpacked.cards.filter(known) }]
  }))
  saved.cardPool = saved.cardPool.filter(kind => SKILLS[kind])
  const player = { ...saved.player, skills: saved.player.skills.filter(known).slice(0, P.skillSlots), upgrades: new Set(saved.player.upgrades), relics: new Set(saved.player.relics), wasJump: true }
  Object.assign(g, fresh, saved, { rooms, player, menus: [], flung: [], phase: 'playing', toast: null, best: save.best, starter: fresh.starter })
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

export const step = (g, input, realDt) => {
  g.looking = input.look === true && g.phase === 'playing' && g.menus.length === 0
  const dt = (g.looking ? realDt * TUNING.feel.lookSlow : realDt) * timeScale(g)
  g.time += dt
  stepEffects(g, dt)
  stepFx(g, realDt, dt)
  const { pausePressed, skillsPressed } = edges(g, input)
  if (g.door) return
  if (g.phase === 'title') stepTitle(g, dt)
  if (g.phase === 'dead' || g.phase === 'cleared') {
    g.phaseTime += dt
    stepWorld(g.world, dt, g.depth)
    handleWorldEvents(g)
    if (g.phaseTime > TUNING.feel.deathHold && !g.summaryShown) {
      g.summaryShown = true
      openSummary(g)
    }
  }
  if (g.menus.length > 0) {
    stepMenus(g, input)
    return
  }
  if (g.pause > 0) {
    g.pause -= dt
    return
  }
  if (g.phase !== 'playing') return
  if (g.hitstop > 0) {
    g.hitstop -= dt
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
    openSkills(g)
    return
  }
  if (input.map && !g.wasMap) {
    g.wasMap = true
    g.menuHeld = { ...input }
    openMap(g)
    return
  }
  g.wasMap = input.map
  if (g.pendingOffers > 0 && levelBurstDone(g)) {
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
  stepLockHints(g)
  stepPlayer(g, input, dt)
  if (g.phase !== 'playing') return
  stepShots(g, dt)
  stepEffectList(g, stopped ? 0 : dt)
  if (stopped) return
  stepEnemies(g, dt)
  stepFireballs(g, dt)
  stepFlung(g, dt)
}
