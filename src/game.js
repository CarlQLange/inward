import { BLOCK, TUNING } from './config.js'
import { M, props } from './materials.js'
import { createWorld, ignite, matAt, puff, setCell, stepWorld, energize } from './world.js'
import { FIRST_ROOM } from './room.js'
import { generateRoom } from './generate.js'
import { WORLD_PX, cell, centre, hitsSolid, inWater, move, moveAxis, overlap, pushOutOfSolid } from './physics.js'
import { applyCrush, applyHazards, burst, hurt } from './combat.js'
import { ENEMY_DEFS, STEPPERS, clampToRoom, createEnemy, onDeath } from './enemies.js'
import { SKILLS, TREES, muzzle, spillNapalm } from './skills.js'

const P = TUNING.player
const R = TUNING.run
const CARD_SIZES = { core: [16, 16] }
const SKILL_KEYS = ['skill', 'skill2', 'skill3']
const ALL_SKILLS = Object.keys(SKILLS)

const shuffled = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v)

const readBest = () => {
  try {
    return Number(localStorage.getItem(R.bestKey)) || 0
  } catch {
    return 0
  }
}

const saveBest = score => {
  try {
    localStorage.setItem(R.bestKey, String(score))
  } catch {
    return
  }
}

const createPlayer = ({ x, row }) => ({
  x, y: row * BLOCK - P.height, w: 6, h: P.height,
  vx: 0, vy: 0, hp: P.hp, iframes: 0, stun: 0, facing: 1, crouching: false,
  grounded: false, sinceGround: 1, sinceJump: 1, jumpHeld: false,
  shotReady: 0, skills: [], upgrades: new Set(), aim: { x: 1, y: 0 }, drift: 0,
  wasJump: false, wasSkills: [false, false, false],
})

const createCard = g => ({ kind, x, row }) => {
  const resolved = kind === 'skill' ? g.cardPool.shift() ?? 'bolt' : kind
  const [w, h] = CARD_SIZES[resolved] ?? [12, 12]
  return { kind: resolved, x, y: row * BLOCK - h - 1, w, h }
}

const createWare = ({ kind, x, row }) => ({ kind, x, y: row * BLOCK - 13, w: 12, h: 12, price: TUNING.prices[kind] })

const lean = g => {
  const owned = new Set(g.player.skills.map(s => s.kind))
  return {
    metal: owned.has('repel') || owned.has('bolt'),
    water: owned.has('bolt') || owned.has('frost'),
    fuel: owned.has('ember') || owned.has('gust'),
    scrap: owned.has('repel'),
  }
}

const buildRoom = (g, index) => {
  const definition = index === 0 ? FIRST_ROOM : generateRoom(index, R.rooms, g.seed, lean(g))
  return {
    depth: index / (R.rooms - 1),
    doors: definition.doors,
    world: createWorld(definition.map),
    enemies: definition.enemies.map(createEnemy),
    cards: definition.cards.map(createCard(g)),
    wares: (definition.wares ?? []).map(createWare),
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
}

const leaveRoom = g => {
  g.flung.forEach(f => settleFlung(g, f))
  Object.assign(g.rooms[g.index], { enemies: g.enemies, cards: g.cards, wares: g.wares, pickups: g.pickups })
}

const enterRoom = (g, index) => {
  g.rooms[index] ??= buildRoom(g, index)
  const room = g.rooms[index]
  room.visited = true
  Object.assign(g, {
    index,
    world: room.world,
    enemies: room.enemies,
    cards: room.cards,
    wares: room.wares,
    pickups: room.pickups,
    depth: g.depthOverride ?? room.depth,
    shots: [], fireballs: [], flung: [], bolts: [], particles: [], popups: [],
  })
}

const walkThrough = (g, index, side) => {
  leaveRoom(g)
  enterRoom(g, index)
  const p = g.player
  const door = g.rooms[index].doors[side]
  p.x = side === 'left' ? 1 : WORLD_PX - p.w - 1
  p.y = (door + 2) * BLOCK - p.h
  p.vy = Math.min(p.vy, 0)
}

export const createGame = (depthOverride = null) => {
  const g = {
    depthOverride,
    seed: Math.floor(Math.random() * 1e9),
    cardPool: shuffled(ALL_SKILLS.filter(s => s !== 'bolt')),
    time: 0,
    phase: 'playing',
    phaseTime: 0,
    pause: 0,
    pulse: 0,
    shake: 0,
    rooms: new Array(R.rooms).fill(null),
    index: 0,
    player: createPlayer(FIRST_ROOM.spawn),
    flung: [],
    score: 0,
    best: readBest(),
    chain: 0,
    chainTime: 0,
    xp: 0,
    level: 1,
    nextLevel: R.firstLevel,
    gold: 0,
    kills: 0,
    environmentKills: 0,
    offer: null,
    pendingOffers: 0,
    menuHeld: {},
  }
  enterRoom(g, 0)
  return g
}

const availableUpgrades = p =>
  p.skills.flatMap(({ kind }) =>
    TREES[kind].filter(node => !p.upgrades.has(node.id)).map(node => ({ type: 'upgrade', skill: kind, node })))

const unownedSkills = g => {
  const owned = new Set(g.player.skills.map(s => s.kind))
  return ALL_SKILLS.filter(s => !owned.has(s))
}

const openOffer = (g, kinds = ['new', 'upgrade']) => {
  const p = g.player
  const options = []
  const roomForSkill = p.skills.length < P.skillSlots && unownedSkills(g).length > 0
  if (kinds.includes('new') && roomForSkill) options.push({ type: 'new' })
  if (kinds.includes('upgrade')) options.push(...shuffled(availableUpgrades(p)).slice(0, 3 - options.length))
  if (options.length === 0) {
    p.hp = Math.min(P.hp, p.hp + 2)
    g.score += 100
    return
  }
  g.offer = { options, selected: 0, armed: false }
}

const chooseOption = (g, option) => {
  const p = g.player
  if (option.type === 'new') {
    const kind = shuffled(unownedSkills(g))[0]
    p.skills.push({ kind, ready: 0 })
    g.cardPool = g.cardPool.filter(s => s !== kind)
  } else {
    p.upgrades.add(option.node.id)
  }
  g.offer = null
  g.pulse = 1
}

const stepOffer = (g, input) => {
  const offer = g.offer
  const pressed = key => input[key] && !g.menuHeld[key]
  if (!offer.armed) {
    offer.armed = !input.jump && !input.shoot
  } else {
    if (pressed('left')) offer.selected = (offer.selected + offer.options.length - 1) % offer.options.length
    if (pressed('right')) offer.selected = (offer.selected + 1) % offer.options.length
    if (pressed('jump') || pressed('shoot')) chooseOption(g, offer.options[offer.selected])
  }
  g.menuHeld = { left: input.left, right: input.right, jump: input.jump, shoot: input.shoot }
}

const addPopup = (g, x, y, text, colour = 'white') => g.popups.push({ x, y, text, colour, life: 1.1 })

const gainXp = (g, amount) => {
  g.xp += amount
  while (g.xp >= g.nextLevel) {
    g.xp -= g.nextLevel
    g.level += 1
    g.nextLevel = R.firstLevel + (g.level - 1) * R.levelGrowth
    g.pendingOffers += 1
    g.player.hp = Math.min(P.hp, g.player.hp + 1)
  }
}

const dropLoot = (g, e, count) => {
  const c = centre(e)
  for (let i = 0; i < count; i++) {
    g.pickups.push({
      kind: 'coin', x: c.x - 2, y: c.y - 2, w: 5, h: 5,
      vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 60,
    })
  }
  if (Math.random() < 0.12) g.pickups.push({ kind: 'heart', x: c.x - 3, y: c.y - 3, w: 7, h: 6, vx: 0, vy: -90 })
}

const onKill = (g, e) => {
  onDeath(g, e)
  const c = centre(e)
  burst(g, c.x, c.y, 'pale', 10)
  const def = ENEMY_DEFS[e.kind]
  if (e.friendly) {
    dropLoot(g, e, 5)
    return
  }
  const environmental = e.lastSource !== 'player'
  g.chain = g.chainTime > 0 ? g.chain + 1 : 1
  g.chainTime = R.chainWindow
  const points = def.value * g.chain * (environmental ? 2 : 1)
  g.score += points
  g.kills += 1
  if (environmental) g.environmentKills += 1
  gainXp(g, environmental ? R.environmentXp : 1)
  addPopup(g, c.x, c.y - 6, g.chain > 1 ? `${points} X${g.chain}` : String(points), environmental ? 'charge' : 'white')
  dropLoot(g, e, environmental ? 2 : 1)
}

const crouch = (world, p, wants) => {
  const drop = P.height - P.crouchHeight
  if (wants && !p.crouching) {
    Object.assign(p, { y: p.y + drop, h: P.crouchHeight, crouching: true })
  } else if (!wants && p.crouching && !hitsSolid(world, { x: p.x, y: p.y - drop, w: p.w, h: P.height })) {
    Object.assign(p, { y: p.y - drop, h: P.height, crouching: false })
  }
}

const aimFrom = (p, input) => {
  const x = input.left ? -1 : input.right ? 1 : 0
  const y = input.up ? -1 : input.down && !p.grounded ? 1 : 0
  if (x === 0 && y === 0) return { x: p.facing, y: 0 }
  const length = Math.hypot(x, y)
  return { x: x / length, y: y / length }
}

const shoot = (g, p) => {
  const from = muzzle(p)
  g.shots.push({ x: from.x - 1, y: from.y - 1, w: 2, h: 2, vx: p.aim.x * P.shotSpeed, vy: p.aim.y * P.shotSpeed, life: P.shotLife })
  p.shotReady = P.shotEvery
}

const useSkills = (g, p, input, stunned, dt) => {
  p.skills.forEach((skill, slot) => {
    skill.ready -= dt
    const pressed = input[SKILL_KEYS[slot]] === true
    if (!stunned && pressed && !p.wasSkills[slot] && skill.ready <= 0) {
      SKILLS[skill.kind](g, p)
      skill.ready = TUNING.skills[skill.kind].every
    }
  })
  SKILL_KEYS.forEach((key, slot) => { p.wasSkills[slot] = input[key] === true })
}

const finishRun = (g, phase) => {
  g.phase = phase
  g.phaseTime = 0
  g.newBest = g.score > g.best
  if (g.newBest) {
    g.best = g.score
    saveBest(g.score)
  }
}

const collectCards = (g, p) => {
  const touched = g.cards.find(c => overlap(p, c))
  if (!touched) return
  if (touched.kind === 'core') {
    g.score += R.coreBonus + p.hp * 100
    finishRun(g, 'cleared')
    return
  }
  g.cards = g.cards.filter(c => c !== touched)
  if (p.skills.length < P.skillSlots) p.skills.push({ kind: touched.kind, ready: 0 })
  else g.pendingOffers += 1
  g.pause = TUNING.cardPause
  g.pulse = 1
  g.shake = Math.max(g.shake, 3)
}

const talkToInhabitants = (g, p) => {
  for (const e of g.enemies) {
    if (!e.friendly || e.spent || !overlap(p, e)) continue
    if (e.kind === 'hermit' && availableUpgrades(p).length > 0) {
      e.spent = true
      openOffer(g, ['upgrade'])
    }
    if (e.kind === 'miner' && p.skills.length < P.skillSlots && unownedSkills(g).length > 0) {
      e.spent = true
      openOffer(g, ['new'])
    }
  }
}

const buyWares = (g, p) => {
  const ware = g.wares.find(w => overlap(p, w) && g.gold >= w.price)
  if (!ware) return
  g.gold -= ware.price
  g.wares = g.wares.filter(w => w !== ware)
  if (ware.kind === 'heart') p.hp = Math.min(P.hp, p.hp + 2)
  else g.pendingOffers += 1
  g.pulse = Math.max(g.pulse, 0.5)
}

const usePickups = (g, p, dt) => {
  for (const c of g.pickups) {
    c.vy = Math.min(200, c.vy + 300 * dt)
    moveAxis(g.world, c, 'x', c.vx * dt)
    if (moveAxis(g.world, c, 'y', c.vy * dt)) {
      c.vx *= 0.5
      c.vy = 0
    }
    if (!overlap(p, { x: c.x - 3, y: c.y - 3, w: c.w + 6, h: c.h + 6 })) continue
    c.taken = true
    if (c.kind === 'coin') g.gold += 1
    else p.hp = Math.min(P.hp, p.hp + 1)
  }
  g.pickups = g.pickups.filter(c => !c.taken)
}

const useDoors = (g, p) => {
  const { doors } = g.rooms[g.index]
  if (doors.right !== undefined && p.x + p.w >= WORLD_PX - 0.5) walkThrough(g, g.index + 1, 'left')
  else if (doors.left !== undefined && p.x <= 0.5) walkThrough(g, g.index - 1, 'right')
}

const stepPlayer = (g, input, dt) => {
  const p = g.player
  const world = g.world
  const swimming = inWater(world, p)
  applyCrush(g, p)
  const stunned = p.stun > 0
  crouch(world, p, input.down && !input.jump && p.grounded && !swimming)
  const wish = stunned ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0)
  const top = P.run * (swimming ? P.swimRun : 1)
  const towards = p.crouching ? 0 : wish * top
  const change = P.accel * dt * (p.drift > 0 ? 0.15 : 1)
  p.drift -= dt
  p.vx += Math.max(-change, Math.min(change, towards - p.vx))
  if (wish !== 0) p.facing = wish
  p.aim = aimFrom(p, input)

  const gravity = swimming ? P.gravity * P.swimGravity : P.gravity
  const maxFall = swimming ? P.swimMaxFall : P.maxFall
  p.vy = Math.min(maxFall, p.vy + gravity * dt)

  p.sinceGround = p.grounded ? 0 : p.sinceGround + dt
  p.sinceJump = input.jump && !p.wasJump ? 0 : p.sinceJump + dt
  if (!stunned && !p.crouching && p.sinceJump < P.buffer) {
    if (swimming) {
      p.vy = -P.swimStroke
      p.sinceJump = 1
    } else if (p.sinceGround < P.coyote) {
      p.vy = -P.jump
      p.jumpHeld = true
      p.sinceJump = 1
      p.sinceGround = 1
    }
  }
  if (p.jumpHeld && !input.jump) {
    if (p.vy < 0) p.vy *= P.jumpCut
    p.jumpHeld = false
  }
  p.wasJump = input.jump

  move(world, p, dt)
  pushOutOfSolid(world, p)

  p.shotReady -= dt
  if (!stunned && input.shoot && p.shotReady <= 0) shoot(g, p)
  useSkills(g, p, input, stunned, dt)
  p.iframes -= dt
  p.stun -= dt

  applyHazards(g, p, dt)
  collectCards(g, p)
  talkToInhabitants(g, p)
  buyWares(g, p)
  usePickups(g, p, dt)
  if (g.phase === 'playing') useDoors(g, p)
  if (p.hp <= 0 && g.phase === 'playing') {
    finishRun(g, 'dead')
    burst(g, p.x, p.y, 'white', 24)
  }
}

const stepEnemies = (g, dt) => {
  for (const e of g.enemies) {
    applyCrush(g, e)
    STEPPERS[e.kind](g, e, dt)
    if (e.kind !== 'worm') pushOutOfSolid(g.world, e)
    clampToRoom(e)
    e.iframes -= dt
    e.stun -= dt
    e.frozen -= dt
    applyHazards(g, e, dt)
    if (!e.friendly && e.stun <= 0 && overlap(e, g.player)) hurt(g, g.player, 1)
  }
  for (const e of g.enemies) if (e.hp <= 0) onKill(g, e)
  g.enemies = g.enemies.filter(e => e.hp > 0)
}

const stepShots = (g, dt) => {
  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    const victim = g.enemies.find(e => overlap(s, e))
    if (victim) {
      hurt(g, victim, 1, 'player')
      s.life = 0
    } else if (props(matAt(g.world, cell(s.x), cell(s.y))).solid) {
      burst(g, s.x, s.y, 'pale', 2)
      s.life = 0
    }
  }
  g.shots = g.shots.filter(s => s.life > 0)
}

const landFireball = (g, f) => {
  const x = cell(f.x + 2)
  const y = cell(f.y + 2)
  for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
    ignite(g.world, x + dx, y + dy)
    if (matAt(g.world, x + dx, y + dy) === M.ICE) setCell(g.world, x + dx, y + dy, M.WATER)
  }
  if (f.napalm) spillNapalm(g, x, y - 1)
  burst(g, f.x + 2, f.y + 2, 'fire', 6)
  f.age = -1
}

const stepFireballs = (g, dt) => {
  for (const f of g.fireballs) {
    f.age += dt
    f.vy += TUNING.fireball.gravity * dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    const x = cell(f.x + 2)
    const y = cell(f.y + 2)
    const m = matAt(g.world, x, y)
    if (m === M.WATER) {
      puff(g.world, x, y - 1, M.STEAM, TUNING.world.steamLife)
      f.age = -1
    } else if (props(m).solid) {
      landFireball(g, f)
    } else if (props(m).flammability) {
      ignite(g.world, x, y)
      f.age = -1
    } else if (!f.friendly && overlap(f, g.player)) {
      hurt(g, g.player, 1)
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
    if (f.age > F.friendlyAfter && overlap(f, g.player)) {
      hurt(g, g.player, F.damage)
      g.player.stun = F.stun
    }
    if (blocked) {
      settleFlung(g, f)
      burst(g, f.x + 4, f.y + 4, 'pale', 6)
      f.age = -1
    }
  }
  g.flung = g.flung.filter(f => f.age >= 0)
}

const stepEffects = (g, dt) => {
  for (const b of g.bolts) b.life -= dt
  g.bolts = g.bolts.filter(b => b.life > 0)
  for (const p of g.particles) {
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.vy += 200 * dt
    p.life -= dt
  }
  g.particles = g.particles.filter(p => p.life > 0)
  for (const p of g.popups) {
    p.y -= 14 * dt
    p.life -= dt
  }
  g.popups = g.popups.filter(p => p.life > 0)
  g.pulse = Math.max(0, g.pulse - dt * 2.5)
  g.shake = Math.max(0, g.shake - dt * 14)
  g.chainTime = Math.max(0, g.chainTime - dt)
  if (g.chainTime === 0) g.chain = 0
}

const handleWorldEvents = g => {
  for (const event of g.world.events) {
    g.pulse = Math.max(g.pulse, event.type === 'blast' ? 0.5 + event.reach * 0.25 : 1)
    if (event.type !== 'blast') continue
    g.shake = Math.max(g.shake, 3 + event.reach * 2)
    burst(g, (event.x + 0.5) * BLOCK, (event.y + 0.5) * BLOCK, 'fire', 8 + event.reach * 6)
  }
  g.world.events.length = 0
}

const reset = g => Object.assign(g, createGame(g.depthOverride))

export const restart = reset

export const step = (g, input, dt) => {
  g.time += dt
  stepEffects(g, dt)
  if (g.offer) {
    stepOffer(g, input)
    return
  }
  if (g.pause > 0) {
    g.pause -= dt
    return
  }
  if (g.pendingOffers > 0) {
    g.pendingOffers -= 1
    openOffer(g)
    return
  }
  if (g.phase !== 'playing') {
    g.phaseTime += dt
    stepWorld(g.world, dt, g.depth)
    handleWorldEvents(g)
    const confirm = input.jump || input.shoot
    if ((g.phaseTime > 0.8 && confirm) || g.phaseTime > 12) reset(g)
    return
  }
  stepWorld(g.world, dt, g.depth)
  handleWorldEvents(g)
  stepPlayer(g, input, dt)
  if (g.phase !== 'playing') return
  stepEnemies(g, dt)
  stepShots(g, dt)
  stepFireballs(g, dt)
  stepFlung(g, dt)
}
