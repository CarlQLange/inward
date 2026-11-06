import { TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, energize, ignite, lavaAt, matAt, pour, setCell } from './world.js'
import { cell, cellsUnder, centre, overlap } from './physics.js'
import { MATERIAL_COLOURS, burstSparks, spark } from './fx.js'
import { hurt } from './combat.js'
import { zap } from './skills.js'

const keystone = (id, name, gift, cost, tint, glyph, extra = {}) => ({ id, name, gift, cost, tint, glyph, ...extra })

export const KEYSTONES = [
  keystone('echo', 'ECHO', 'SKILLS CAST TWICE', 'SKILLS RECHARGE AT HALF SPEED', '#6fd0ff', [
    '#...#....', '.#...#...', '..#...#..', '...#...#.', '....#...#', '...#...#.', '..#...#..', '.#...#...', '#...#....',
  ]),
  keystone('fists', 'BARE HANDS', 'SKILLS RECHARGE THREE TIMES AS FAST', 'YOUR GUN BECOMES A SHORT PUNCH', '#ff5a4a', [
    '..#.#.#..', '.########', '.########', '.########', '#########', '#.#######', '.#######.', '..#####..', '..#####..',
  ]),
  keystone('stain', 'STAIN', 'SHOTS ARE MADE OF WHAT YOU STAND ON', 'SHOTS DO NO DAMAGE OF THEIR OWN', '#c8ff5a', [
    '.........', '#...###..', '.#.#####.', '#..#####.', '.#.#####.', '#...###..', '....#.#..', '....#....', '......#..',
  ]),
  keystone('fourth', 'FOURTH HAND', 'A FOURTH SKILL SLOT', 'LOSE THREE HEARTS', '#f4f8f2', [
    '####.####', '####.####', '####.####', '####.####', '.........', '####.####', '####.####', '####.####', '####.####',
  ], { hearts: 3 }),
  keystone('salamander', 'SALAMANDER', 'STAND IN FIRE OR LAVA TO EAT THEM AND HEAL', 'WATER HURTS YOU', '#ff9a2e', [
    '....#....', '...##....', '..###.#..', '..#####..', '.#######.', '.###.###.', '.##...##.', '.###.###.', '..#####..',
  ]),
  keystone('glutton', 'GLUTTON', 'ANY MATERIAL NEAR YOU RECHARGES SKILLS', 'SKILLS RECHARGE ONLY NEAR MATERIAL', '#8ae04a', [
    '..####...', '.######..', '#####....', '####..#.#', '####.....', '#####....', '.######..', '..####...', '.........',
  ]),
  keystone('powder', 'POWDER', 'FOES EXPLODE WHEN THEY DIE', 'THE BLASTS HURT YOU TOO', '#f07ae0', [
    '#...#...#', '.#..#..#.', '..#.#.#..', '...###...', '#########', '...###...', '..#.#.#..', '.#..#..#.', '#...#...#',
  ]),
  keystone('overload', 'OVERLOAD', 'ROCK BURNS AND CARRIES CHARGE', 'FLOORS AND WALLS CAN BURN AWAY', '#ffb347', [
    '#########', '#####.###', '####.####', '###...###', '####.####', '###.#####', '##.######', '#########', '.........',
  ]),
  keystone('quarry', 'QUARRY', 'UNLIMITED BOMBS', 'NO MORE COINS', '#b6a080', [
    '.#####...', '#....##..', '......##.', '.....#.##', '....#...#', '...#....#', '..#......', '.#.......', '#........',
  ]),
  keystone('livewire', 'LIVE WIRE', 'YOU SHOCK FOES YOU TOUCH', 'YOU SET FIRE TO WHAT YOU STAND ON', '#ffe84a', [
    '.....##..', '....##...', '...##....', '..#####..', '....##...', '...##....', '..##.....', '.##......', '.#.......',
  ]),
  keystone('wake', 'THE WAKE', 'KILLED FOES FIGHT FOR YOU', 'CLEARING A ROOM GIVES NOTHING', '#c79ae0', [
    '..#####..', '.#######.', '.#..#..#.', '.#######.', '..#.#.#..', '.........', '....#....', '...###...', '..#.#.#..',
  ]),
  keystone('monomania', 'MONOMANIA', 'ONE SKILL, NO RECHARGE', 'LOSE YOUR OTHER SKILLS', '#f4f8f2', [
    '...###...', '..####...', '.#####...', '...###...', '...###...', '...###...', '...###...', '.#######.', '.#######.',
  ], { slots: 1 }),
  keystone('breath', 'HELD BREATH', 'TIME STOPS WHILE YOU STAND STILL', 'LOSE THREE HEARTS', '#bff2ff', [
    '#########', '.#.....#.', '..#...#..', '...#.#...', '....#....', '...#.#...', '..#.#.#..', '.#.###.#.', '#########',
  ], { hearts: 3 }),
  keystone('slough', 'SLOUGH', 'NEW SKILLS, FULLY EVOLVED', 'LOSE YOUR SKILLS', '#7dff8a', [
    '...#.....', '..##.....', '.#######.', '..##...#.', '...#...#.', '.#...#...', '.#...##..', '.#######.', '.....#...',
  ]),
  keystone('onecut', 'ONE CUT', 'ANY HIT KILLS A FOE', 'DROP TO TWO HEARTS', '#ff3a3a', [
    '.......##', '......###', '.....###.', '....###..', '...###...', '..###....', '#.##.....', '.##......', '#.#......',
  ], { hearts: 6 }),
]

export const KEYSTONE_BY_ID = Object.fromEntries(KEYSTONES.map(k => [k.id, k]))

const K = () => TUNING.run.keystones

export const hasKeystone = (p, id) => p.keystones?.has(id) === true
const carried = p => [...(p.keystones ?? [])].map(id => KEYSTONE_BY_ID[id])

export const heartCap = p => Math.max(1, carried(p).reduce((left, { hearts = 0 }) => left - hearts, TUNING.player.hp))

export const slotsOf = p => {
  if (hasKeystone(p, 'monomania')) return 1
  return TUNING.player.skillSlots + (hasKeystone(p, 'fourth') ? 1 : 0)
}

const CLASHES = {
  monomania: ['fourth', 'slough'],
  fourth: ['monomania'],
  slough: ['monomania'],
  fists: ['stain'],
  stain: ['fists'],
}

const FIREPROOF_MOOT = new Set(['livewire'])

const fits = p => k =>
  !hasKeystone(p, k.id) &&
  !(p.fireproof && FIREPROOF_MOOT.has(k.id)) &&
  !(CLASHES[k.id] ?? []).some(id => hasKeystone(p, id)) &&
  heartCap(p) - (k.hearts ?? 0) >= 2

export const openKeystones = (p, known) => KEYSTONES.filter(k => known.has(`keystone:${k.id}`)).filter(fits(p))

const MATTER = new Map([
  [M.LAVA, 0.8], [M.ACID, 0.8], [M.METHANE, 0.4], [M.SMOKE, 0.2], [M.STEAM, 0.3],
  [M.WATER, 0.2], [M.OIL, 0.2], [M.SCRAP, 0.1], [M.SAND, 0.1], [M.ASH, 0.1],
])

const matterAround = (g, p) => {
  const reach = K().gluttonReach
  const [cx, cy] = [cell(p.x + p.w / 2), cell(p.y + p.h / 2)]
  let total = 0
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const [x, y] = [cx + dx, cy + dy]
      total += burningAt(g.world, x, y) || chargedAt(g.world, x, y) ? 1 : MATTER.get(matAt(g.world, x, y)) ?? 0
    }
  }
  return total
}

const gluttonRate = (g, p) => {
  const fed = matterAround(g, p)
  if (fed > 0 && Math.random() < Math.min(0.5, fed * 0.04)) {
    const c = centre(p)
    const a = Math.random() * Math.PI * 2
    spark(g, c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26, -Math.cos(a) * 90, -Math.sin(a) * 90, '#8ae04a', 0.28)
  }
  return Math.min(K().gluttonMost, fed * K().gluttonEach)
}

export const rechargeRate = (g, p) =>
  (hasKeystone(p, 'fists') ? K().fistsRate : 1) *
  (hasKeystone(p, 'echo') ? K().echoRate : 1) *
  (hasKeystone(p, 'glutton') ? gluttonRate(g, p) : 1)

export const castWait = (p, whole) => (hasKeystone(p, 'monomania') ? Math.min(whole, K().monoWait) : whole)

export const crowdedOut = (g, p) => hasKeystone(p, 'monomania') && g.effects.length >= K().effectLimit

const NEARBY = [[0, 1], [1, 1], [-1, 1], [0, 0], [1, 0], [-1, 0]]

const feetCells = p => {
  const [x, y] = [cell(p.x + p.w / 2), cell(p.y + p.h - 1)]
  return NEARBY.map(([dx, dy]) => [x + dx, y + dy])
}

const swallow = (w, x, y) => {
  const m = matAt(w, x, y)
  if (m === M.LAVA) setCell(w, x, y, M.ROCK)
  else setCell(w, x, y, props(m).liquid ? M.EMPTY : M.ASH, props(m).liquid ? 0 : TUNING.world.ashLife)
}

const stepSalamander = (g, p, dt) => {
  const warm = p.hp < heartCap(p) ? cellsUnder(p, 1).filter(([x, y]) => burningAt(g.world, x, y) || lavaAt(g.world, x, y)) : []
  p.mendClock = warm.length ? (p.mendClock ?? 0) + dt : 0
  if (warm.length && p.mendClock >= K().salamanderBite) {
    p.mendClock = 0
    const [x, y] = warm[0]
    swallow(g.world, x, y)
    spark(g, (x + 0.5) * 8, (y + 0.5) * 8, 0, -40, '#ff9a2e')
    p.swallowed = (p.swallowed ?? 0) + 1
    if (p.swallowed >= K().salamanderMeal) {
      p.swallowed = 0
      p.hp += 1
      g.popups.push({ x: centre(p).x, y: p.y - 11, icon: 'HEAL', colour: 'heal', life: 1.2 })
    }
  }
  if (cellsUnder(p).some(([x, y]) => matAt(g.world, x, y) === M.WATER)) hurt(g, p, 1, 'world', 'WATER')
}

const stepLiveWire = (g, p, dt) => {
  p.wireClock = (p.wireClock ?? 0) - dt
  if (p.wireClock > 0) return
  p.wireClock = K().wireEvery
  feetCells(p).forEach(([x, y]) => {
    energize(g.world, x, y, K().wireEnergy)
    if (props(matAt(g.world, x, y)).flammability) ignite(g.world, x, y)
  })
  const c = centre(p)
  const reach = { x: c.x + (Math.random() - 0.5) * 18, y: c.y + (Math.random() - 0.5) * 22 }
  zap(g, c, reach)
  const near = { x: p.x - K().wireReach, y: p.y - K().wireReach, w: p.w + K().wireReach * 2, h: p.h + K().wireReach * 2 }
  g.enemies.filter(e => !e.friendly && !e.ally && overlap(near, e)).forEach(e => {
    hurt(g, e, 2, 'world', 'CHARGE')
    e.stun = Math.max(e.stun, 0.7)
  })
}

const stepQuarry = (p, dt) => {
  p.quarryClock = Math.max(0, (p.quarryClock ?? 0) - dt)
  p.bombs = Math.max(p.bombs, 1)
}

export const bombReady = p => !hasKeystone(p, 'quarry') || !(p.quarryClock > 0)

export const bombThrown = p => {
  if (!hasKeystone(p, 'quarry')) return
  p.quarryClock = K().quarryWait
  p.bombs = Math.max(p.bombs, 2)
}

const stepStainSource = (g, p) => {
  if (!hasKeystone(p, 'stain')) return
  const [x, y] = [cell(p.x + p.w / 2), cell(p.y + p.h - 1)]
  const inside = matAt(g.world, x, y)
  const under = matAt(g.world, x, y + 1)
  const chosen = [inside, under].find(m => m !== M.EMPTY && !props(m).gas)
  if (chosen !== undefined) p.stain = chosen
}

export const stepKeystones = (g, p, dt) => {
  if (hasKeystone(p, 'salamander')) stepSalamander(g, p, dt)
  if (hasKeystone(p, 'livewire')) stepLiveWire(g, p, dt)
  if (hasKeystone(p, 'quarry')) stepQuarry(p, dt)
  stepStainSource(g, p)
}

const FIRES = new Set([M.MOSS, M.PEAT, M.WOOD, M.VINE])
const STONES = new Set([M.ROCK, M.BRICK, M.BEDROCK, M.SAND, M.ASH, M.STILL, M.GLASS, M.MUD])
const COLD = new Set([M.ICE, M.FLOE, M.RIME, M.SNOW])
const LIVE = new Set([M.METAL, M.GATE, M.SCRAP])

const spillInto = (g, x, y, material) => {
  if (!props(matAt(g.world, x, y)).solid) pour(g.world, x, y, material, K().stainPour)
  else pour(g.world, x, y - 1, material, K().stainPour)
}

export const stainColour = material => MATERIAL_COLOURS[material]?.[0] ?? '#c9d4c0'

const STAINS = [
  [m => m === M.WATER, (g, x, y) => spillInto(g, x, y, M.WATER)],
  [m => m === M.OIL, (g, x, y, foe) => {
    spillInto(g, x, y, M.OIL)
    if (foe) hurt(g, foe, 1, 'world', 'FIRE')
  }],
  [m => m === M.LAVA, (g, x, y, foe) => {
    spillInto(g, x, y, M.LAVA)
    if (foe) hurt(g, foe, 2, 'world', 'LAVA')
  }],
  [m => m === M.ACID, (g, x, y, foe) => {
    spillInto(g, x, y, M.ACID)
    if (foe) hurt(g, foe, 1, 'world', 'ACID')
  }],
  [m => FIRES.has(m), (g, x, y, foe) => {
    ignite(g.world, x, y)
    ignite(g.world, x, y + 1)
    if (foe) hurt(g, foe, 1, 'world', 'FIRE')
  }],
  [m => LIVE.has(m), (g, x, y, foe) => {
    energize(g.world, x, y, K().stainCharge)
    if (!foe) return
    hurt(g, foe, 1, 'world', 'CHARGE')
    foe.stun = Math.max(foe.stun, 0.7)
  }],
  [m => COLD.has(m), (g, x, y, foe) => {
    if (matAt(g.world, x, y) === M.WATER) setCell(g.world, x, y, M.ICE)
    if (foe) foe.stun = Math.max(foe.stun, 1.1)
  }],
  [m => STONES.has(m), (g, x, y, foe, s) => {
    if (!foe) return
    hurt(g, foe, 1, 'world', 'CRUSHED')
    if (foe.heavy) return
    foe.vx = Math.sign(s.vx || 1) * K().stainShove
    foe.vy = -60
    foe.shoved = 0.3
  }],
]

export const stainStrikes = (g, s, x, y, foe) => {
  const found = STAINS.find(([test]) => test(s.stain))
  burstSparks(g, s.x, s.y, stainColour(s.stain), 4)
  if (found) found[1](g, x, y, foe, s)
}
