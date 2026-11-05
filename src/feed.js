import { BLOCK, ROOM, TUNING } from './config.js'
import { M } from './materials.js'
import { centre } from './physics.js'
import { FREE, cooldownOf, handOf, hostile, streamOf } from './skills.js'
import { hasRelic } from './relics.js'
import { castWait } from './keystones.js'

const F = TUNING.feed
const CHARGE_GLOW = TUNING.world.chargeRefractory - F.chargeGlow

const made = (...mats) => {
  const set = new Set(mats)
  return (w, i) => set.has(w.mat[i])
}

const gone = (w, i) => {
  if (Math.random() >= F.biteChance) return
  w.mat[i] = M.EMPTY
  w.burn[i] = 0
  w.life[i] = 0
}

export const TASTES = {
  fire: { name: 'FIRE', colours: ['#ff9a2e', '#ffe84a'], flight: 'rise', cell: (w, i) => w.burn[i] > 0, bite: (w, i) => { w.burn[i] = Math.max(0.01, w.burn[i] - F.fireBite) } },
  charge: { name: 'CHARGE', colours: ['#ffe84a', '#f4f8f2'], flight: 'zig', cell: (w, i) => w.charge[i] > 0 || w.refractory[i] > CHARGE_GLOW },
  water: { name: 'WATER', colours: ['#6fd0ff', '#2f8fd0'], flight: 'drip', cell: made(M.WATER) },
  ice: { name: 'ICE', colours: ['#bff2ff', '#f4f8f2'], flight: 'shard', cell: made(M.ICE, M.FLOE, M.RIME) },
  lava: { name: 'LAVA', colours: ['#ff5a1c', '#ffb24a'], flight: 'blob', cell: made(M.LAVA) },
  scrap: { name: 'SCRAP', colours: ['#c9b48a', '#8a7a5a'], flight: 'tumble', cell: made(M.SCRAP) },
  moss: { name: 'MOSS', colours: ['#8ad05a', '#4f9c3a'], flight: 'leaf', cell: made(M.MOSS) },
  vine: { name: 'VINES', colours: ['#4f9c3a', '#8ad05a'], flight: 'leaf', cell: made(M.VINE), bite: gone },
  metal: { name: 'METAL', colours: ['#b6c6cc', '#6fd0ff'], flight: 'streak', cell: made(M.METAL, M.GATE) },
  rubble: { name: 'SAND AND ASH', colours: ['#d8c48a', '#9a9078'], flight: 'hop', cell: made(M.SAND, M.ASH), bite: gone },
  steam: { name: 'STEAM', colours: ['#dfe8e4', '#9fb0a8'], flight: 'puff', cell: made(M.STEAM), bite: gone },
  gas: { name: 'SMOKE AND GAS', colours: ['#c79ae0', '#8a8a78'], flight: 'curl', cell: made(M.SMOKE, M.METHANE), bite: gone },
  acid: { name: 'ACID AND OIL', colours: ['#8ae04a', '#c8f060'], flight: 'drip', cell: made(M.ACID, M.OIL), bite: gone },
  falling: { name: 'FALLING BLOCKS', colours: ['#f4f8f2', '#b0a890'], flight: 'shard', cell: (w, i) => w.crushing[i] === 1 },
  glass: { name: 'GLASS', colours: ['#d6f6f0', '#ffffff'], flight: 'shard', cell: made(M.GLASS) },
  mud: { name: 'MUD', colours: ['#8e7c60', '#b8a684'], flight: 'drip', cell: made(M.MUD) },
  snow: { name: 'SNOW', colours: ['#eef4f4', '#c2d0d8'], flight: 'puff', cell: made(M.SNOW) },
}

const DISTINCT = [M.WATER, M.OIL, M.LAVA, M.ACID, M.STEAM, M.SMOKE, M.METHANE]
const REACH_PX = F.reach * BLOCK

const within = (g, p, reach) => {
  const c = centre(p)
  return hostile(g).filter(e => !e.prop && Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < reach)
}

const OTHERS = {
  variety: {
    colours: ['#c79ae0', '#8ae04a', '#6fd0ff', '#ff9a2e'], flight: 'curl',
    sense: (g, p) => {
      const c = centre(p)
      const found = new Map()
      const [cx, cy] = [Math.floor(c.x / BLOCK), Math.floor(c.y / BLOCK)]
      for (let y = Math.max(0, cy - F.reach); y <= Math.min(ROOM - 1, cy + F.reach); y++) {
        for (let x = Math.max(0, cx - F.reach); x <= Math.min(ROOM - 1, cx + F.reach); x++) {
          const m = g.world.mat[y * ROOM + x]
          if (DISTINCT.includes(m)) found.set(m, { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK })
        }
      }
      return { amount: found.size / F.full.variety, spots: [...found.values()] }
    },
  },
  stun: {
    colours: ['#bff2ff', '#ffe84a'], flight: 'zig',
    sense: (g, p) => {
      const dazed = within(g, p, REACH_PX * 2).filter(e => e.stun > 0 || e.frozen > 0)
      return { amount: dazed.length / F.full.stun, spots: dazed.map(centre) }
    },
  },
  crowd: {
    colours: ['#ff5a4a', '#f4f8f2'], flight: 'rise',
    sense: (g, p) => {
      const close = within(g, p, REACH_PX)
      return { amount: close.length / F.full.crowd, spots: close.map(centre) }
    },
  },
  drawn: {
    colours: ['#f4f8f2', '#c79ae0'], flight: 'curl',
    sense: g => {
      const standing = g.effects.filter(f => f.kind === 'decoy')
      const drawn = hostile(g).filter(e => !e.prop && standing.some(d => Math.hypot(d.x - e.x, d.y - e.y) < F.drawnReach))
      return { amount: standing.length ? drawn.length / F.full.drawn : 0, spots: drawn.map(centre) }
    },
  },
  still: {
    colours: ['#bff2ff', '#f4f8f2'], flight: 'gather',
    sense: (g, p) => {
      const c = centre(p)
      const stood = p.stood ?? 0
      return { amount: g.timeStop > 0 ? 0 : Math.max(0, (stood - F.stillAfter) / F.stillFull), spots: [{ x: c.x + Math.cos(g.time * 9) * 22, y: c.y + Math.sin(g.time * 9) * 22 }] }
    },
  },
  flying: {
    colours: ['#d6f6f0', '#c9b48a'], flight: 'tumble',
    sense: (g, p) => {
      const c = centre(p)
      const near = g.flung.filter(f => Math.hypot(f.x + f.w / 2 - c.x, f.y + f.h / 2 - c.y) < REACH_PX * 2)
      return { amount: near.length / F.full.flying, spots: near.map(f => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 })) }
    },
  },
  air: {
    colours: ['#f4f8f2', '#9fb0a8'], flight: 'streak',
    sense: (g, p) => {
      const c = centre(p)
      return { amount: p.grounded || (p.sinceGround ?? 0) < F.airAfter ? 0 : 1, spots: [{ x: c.x - p.vx * 0.2, y: c.y - p.vy * 0.2 + 10 }] }
    },
  },
}

const EVENTS = {
  blast: { colours: ['#ff9a2e', '#f4f8f2'], flight: 'rise', motes: 5 },
  blastKill: { colours: ['#ff5a4a', '#ff9a2e'], flight: 'blob', motes: 6 },
  hit: { colours: ['#ff5a4a', '#ffb0a0'], flight: 'gather', motes: 7 },
  returned: { colours: ['#6fd0ff', '#f4f8f2'], flight: 'streak', motes: 3 },
  allyKill: { colours: ['#c79ae0', '#ff5a4a'], flight: 'curl', motes: 5 },
  dashHit: { colours: ['#ffe84a', '#f4f8f2'], flight: 'zig', motes: 3 },
  smashed: { colours: ['#c9d4c0', '#9a9078'], flight: 'hop', motes: 2 },
  crossed: { colours: ['#c9d4c0', '#f4f8f2'], flight: 'shard', motes: 1 },
  coin: { colours: ['#ffe84a', '#d8a020'], flight: 'hop', motes: 1 },
}

export const DIETS = {
  ember: ['fire'], bolt: ['charge'], frost: ['water', 'ice'], melt: ['lava'], repel: ['scrap'], seed: ['moss', 'vine'], rod: ['metal'], mason: ['rubble'],
  spring: ['steam', 'ice'], gust: ['gas'], acid: ['acid'], hammer: ['smashed', 'falling'], alchemy: ['variety'], swap: ['stun'], roar: ['crowd'], decoy: ['drawn'],
  stop: ['still'], grapple: ['air'], mine: ['blastKill'], well: ['blast'], rewind: ['hit'], mirror: ['returned'], charm: ['allyKill'], dash: ['dashHit'],
  blink: ['crossed'], drone: ['coin'],
  clay: ['fire', 'lava'], burrow: ['mud', 'falling'],
}

const foodOf = (p, kind) => {
  const extra = p.diet?.[kind] ?? []
  const fire = hasRelic(p, 'hands') ? ['fire'] : []
  return [...new Set([...DIETS[kind], ...extra, ...fire])]
}

export const dietOf = foodOf

const EATS = {
  variety: 'DIFFERENT LIQUIDS AND GASES', stun: 'STUNNED FOES', crowd: 'FOES CLOSE TO YOU', drawn: 'FOES NEAR THE DECOY', still: 'STANDING STILL', air: 'BEING IN THE AIR', blast: 'BLASTS', blastKill: 'KILLS BY BLASTS',
  flying: 'FLYING BLOCKS AND SHARDS', hit: 'TAKING HITS', returned: 'RETURNED SHOTS', allyKill: 'KILLS BY CHARMED FOES', dashHit: 'DASH HITS', crossed: 'BLINKS THROUGH WALLS', coin: 'COINS', smashed: 'BROKEN BLOCKS',
}

const named = tag => EATS[tag] ?? TASTES[tag].name

export const eatsText = kind => `RECHARGE: ${named(DIETS[kind][0])}`

export const eatsLine = (p, kind) => `RECHARGE: ${foodOf(p, kind).map(named).join(', ')}`

const lookOf = tag => TASTES[tag] ?? OTHERS[tag] ?? EVENTS[tag]

export const feedColour = skill => lookOf(skill.meal?.tag ?? DIETS[skill.kind][0]).colours[0]

const launch = (g, spot, look) => {
  const motes = (g.feedMotes ??= [])
  if (spot.i !== undefined) look.bite?.(g.world, spot.i)
  if (motes.length >= F.motesMost) return
  motes.push({
    x: spot.x, y: spot.y, fromX: spot.x, fromY: spot.y, age: 0, life: F.moteLife * (0.8 + Math.random() * 0.5),
    colour: look.colours[Math.floor(Math.random() * look.colours.length)], flight: look.flight, seed: Math.random() * 6.28,
  })
}

const stepMotes = (g, p, dt) => {
  if (!g.feedMotes?.length) return
  const c = centre(p)
  for (const m of g.feedMotes) {
    m.age += dt
    const t = Math.min(1, m.age / m.life)
    const pull = t * t
    const { x, y } = FLIGHTS[m.flight](m, t)
    m.x = m.fromX + (c.x - m.fromX) * pull + x * (1 - pull)
    m.y = m.fromY + (c.y - m.fromY) * pull + y * (1 - pull)
  }
  g.feedMotes = g.feedMotes.filter(m => m.age < m.life)
}

const FLIGHTS = {
  rise: (m, t) => ({ x: Math.sin(m.seed + t * 9) * 2, y: -t * 14 }),
  zig: (m, t) => ({ x: (Math.floor(t * 8) % 2 ? 3 : -3), y: (Math.floor(t * 8 + m.seed) % 2 ? 3 : -3) }),
  drip: (m, t) => ({ x: 0, y: t * (1 - t) * 18 }),
  shard: (m, t) => ({ x: Math.cos(m.seed) * t * 12, y: Math.sin(m.seed) * t * 12 }),
  blob: (m, t) => ({ x: Math.sin(m.seed) * 2, y: -Math.sin(t * Math.PI) * 10 }),
  tumble: (m, t) => ({ x: Math.cos(m.seed + t * 14) * 4, y: Math.sin(m.seed + t * 14) * 4 }),
  leaf: (m, t) => ({ x: Math.sin(m.seed + t * 7) * 6, y: t * 4 }),
  streak: () => ({ x: 0, y: 0 }),
  hop: (m, t) => ({ x: 0, y: -Math.abs(Math.sin(t * 9)) * 6 }),
  puff: (m, t) => ({ x: Math.sin(m.seed + t * 4) * 5, y: -t * 8 }),
  curl: (m, t) => ({ x: Math.cos(m.seed + t * 10) * (1 - t) * 9, y: Math.sin(m.seed + t * 10) * (1 - t) * 9 }),
  gather: (m, t) => ({ x: Math.cos(m.seed + t * 5) * (1 - t) * 4, y: Math.sin(m.seed + t * 5) * (1 - t) * 4 }),
}

const scanCells = (g, p, eaters) => {
  const w = g.world
  const c = centre(p)
  const [cx, cy] = [Math.floor(c.x / BLOCK), Math.floor(c.y / BLOCK)]
  const R = F.reach
  for (let y = Math.max(0, cy - R); y <= Math.min(ROOM - 1, cy + R); y++) {
    for (let x = Math.max(0, cx - R); x <= Math.min(ROOM - 1, cx + R); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue
      const i = y * ROOM + x
      for (const eater of eaters) {
        for (const tag of eater.cells) {
          if (!TASTES[tag].cell(w, i)) continue
          eater.amount += 1 / F.full[tag]
          eater.hits += 1
          eater.tag ??= tag
          const spot = { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK, i, look: TASTES[tag] }
          if (eater.spots.length < F.spotsKept) eater.spots.push(spot)
          else if (Math.random() < F.spotsKept / eater.hits) eater.spots[Math.floor(Math.random() * F.spotsKept)] = spot
          break
        }
      }
    }
  }
}

const scan = (g, p) => {
  const eaters = p.skills.map(skill => {
    const food = foodOf(p, skill.kind)
    return { skill, food, cells: food.filter(tag => TASTES[tag]), others: food.filter(tag => OTHERS[tag]), amount: 0, hits: 0, spots: [], tag: null }
  })
  scanCells(g, p, eaters)
  for (const eater of eaters) {
    for (const tag of eater.others) {
      const { amount, spots } = OTHERS[tag].sense(g, p)
      if (amount <= 0) continue
      eater.amount += amount
      eater.tag ??= tag
      eater.spots.push(...spots.slice(0, F.spotsKept))
    }
    const fullness = Math.min(1, eater.amount)
    eater.skill.meal = { amount: fullness * (F.gain[eater.skill.kind] ?? F.gain.all), tag: eater.tag ?? eater.food[0] }
    eater.skill.hunger = fullness
    if (fullness <= 0 || eater.spots.length === 0) continue
    const fallback = lookOf(eater.skill.meal.tag)
    const count = Math.ceil(fullness * F.motesPerScan)
    for (let n = 0; n < count; n++) {
      const spot = eater.spots[Math.floor(Math.random() * eater.spots.length)]
      launch(g, spot, spot.look ?? fallback)
    }
  }
}

export const stepFeeds = (g, p, dt) => {
  p.stood = p.grounded && Math.abs(p.vx) < F.stillSpeed ? (p.stood ?? 0) + dt : 0
  p.feedClock = (p.feedClock ?? 0) - dt
  if (p.feedClock <= 0) {
    p.feedClock = F.scanEvery
    scan(g, p)
  }
  for (const skill of p.skills) {
    skill.fed = (skill.fed ?? 0) + ((skill.hunger ?? 0) - (skill.fed ?? 0)) * Math.min(1, dt * 8)
    skill.gulp = Math.max(0, (skill.gulp ?? 0) - dt * 3)
  }
  stepMotes(g, p, dt)
}

const stored = (p, skill, amount) => {
  if (hasRelic(p, 'battery')) skill.spare = Math.min(F.spareMost, (skill.spare ?? 0) + amount)
}

export const feedEvent = (g, event, x, y, amount = 1) => {
  const p = g.player
  for (const skill of p.skills) {
    if (!DIETS[skill.kind].includes(event)) continue
    const whole = cooldownOf(p, skill.kind)
    const refund = F.refund[event] * whole * amount
    if (skill.ready <= 0) stored(p, skill, refund / whole)
    skill.ready -= refund
    skill.gulp = 1
    skill.meal = { amount: skill.meal?.amount ?? 0, tag: event }
    const look = EVENTS[event]
    for (let n = 0; n < look.motes; n++) launch(g, { x: x + (Math.random() - 0.5) * BLOCK, y: y + (Math.random() - 0.5) * BLOCK }, look)
  }
}

const rateOf = (skill, boost = 1, p = null) => (1 + (p?.keystones?.has('glutton') ? 0 : skill.meal?.amount ?? 0)) * boost

const fire = (g, p, skill, whole, cast) => {
  p.power = skill.swell ?? 0
  skill.casts = (skill.casts ?? 0) + 1
  skill.ready = whole
  if (cast(g, p, skill) === FREE) skill.ready = F.freeAfter
}

const startFlow = (g, p, skill, whole, cast) => {
  const waiting = skill.ready
  fire(g, p, skill, whole, cast)
  skill.ready = waiting + whole * F.flowCost
  skill.flowing = true
}

const flow = ({ g, p, skill, hand, whole, pressed, stunned, dt, cast }, holding) => {
  const stream = streamOf(p, skill.kind)
  skill.ready = Math.max(0, skill.ready - dt * (skill.meal?.amount ?? 0))
  if (skill.flowing) {
    if (holding && !stunned && skill.ready < whole && stream.run(g, p, dt, skill)) skill.ready += (dt * whole) / hand.time
    else {
      skill.flowing = false
      stream.stop?.(g, p)
    }
    return
  }
  skill.ready = Math.max(0, skill.ready - dt)
  if (pressed && !stunned && skill.ready < whole * F.flowRestart) startFlow(g, p, skill, whole, cast)
}

const HANDS = {
  tap: ({ g, p, skill, whole, pressed, stunned, dt, cast, boost }) => {
    skill.ready -= dt * rateOf(skill, boost, p)
    if (skill.ready < 0) {
      stored(p, skill, (dt * (skill.meal?.amount ?? 0)) / whole)
      skill.ready = 0
    }
    if (!pressed || stunned) return
    if (skill.ready <= 0) fire(g, p, skill, whole, cast)
    else if ((skill.spare ?? 0) >= 1) {
      skill.spare -= 1
      const waiting = skill.ready
      fire(g, p, skill, whole, cast)
      skill.ready = waiting
    }
  },
  stock: ({ g, p, skill, hand, whole, pressed, stunned, dt, cast, boost }) => {
    skill.stock ??= hand.most
    if (skill.stock < hand.most) {
      skill.ready -= dt * rateOf(skill, boost, p)
      while (skill.ready <= 0 && skill.stock < hand.most) {
        skill.stock += 1
        skill.ready += whole
      }
    }
    if (skill.stock >= hand.most) skill.ready = 0
    if (!pressed || stunned || skill.stock <= 0) return
    const waiting = skill.ready
    skill.stock -= 1
    fire(g, p, skill, whole, cast)
    skill.ready = waiting > 0 ? waiting : whole
  },
  stream: hands => flow(hands, hands.down),
  toggle: hands => flow(hands, !hands.pressed),
  swell: ({ g, p, skill, hand, whole, down, pressed, stunned, dt, cast, boost }) => {
    if (skill.swelling) {
      skill.swell = Math.min(1, (skill.swell ?? 0) + (dt * rateOf(skill, boost, p)) / hand.time)
      if (down && !stunned) return
      skill.swelling = false
      fire(g, p, skill, whole, cast)
      skill.swell = 0
      return
    }
    skill.ready = Math.max(0, skill.ready - dt * rateOf(skill, boost, p))
    if (pressed && !stunned && skill.ready <= 0) {
      skill.swelling = true
      skill.swell = 0
    }
  },
}

export const stepHand = (g, p, skill, down, was, stunned, dt, cast, boost = 1) => {
  const hand = handOf(p, skill.kind)
  HANDS[hand.type]({ g, p, skill, hand, whole: castWait(p, cooldownOf(p, skill.kind)), down, pressed: down && !was, stunned, dt, cast, boost })
}

export const waitingOf = (p, skill) => {
  const hand = handOf(p, skill.kind)
  const whole = cooldownOf(p, skill.kind)
  if (hand.type === 'stock' && (skill.stock ?? hand.most) > 0) return 0
  if (hand.type === 'stream' || hand.type === 'toggle') return Math.max(0, Math.min(1, skill.ready / whole))
  if ((skill.spare ?? 0) >= 1) return 0
  return Math.max(0, Math.min(1, skill.ready / whole))
}

export const pipsOf = (p, skill) => {
  const hand = handOf(p, skill.kind)
  if (hand.type === 'stock') return { have: skill.stock ?? hand.most, most: hand.most }
  const spare = Math.floor(skill.spare ?? 0)
  return spare > 0 ? { have: spare, most: F.spareMost } : null
}
