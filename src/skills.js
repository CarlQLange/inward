import { BLOCK, TUNING } from './config.js'
import { M, props } from './materials.js'
import { energize, ignite, matAt, puff, setCell } from './world.js'
import { cell, centre, forEachCell, inCone, overlap } from './physics.js'
import { burst, hurt } from './combat.js'

const S = TUNING.skills

export const muzzle = p => ({ x: p.x + p.w / 2, y: p.y + (p.crouching ? 4 : 5) })

const owns = (p, node) => p.upgrades.has(node)
const rotate = ({ x, y }, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) })

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

const shootBolt = (g, p, aim, energy) => {
  const start = muzzle(p)
  const points = [start]
  let { x, y } = start
  let struck = null
  for (let travelled = 0; travelled < 340; travelled += 2) {
    x += aim.x * 2
    y += aim.y * 2
    if (travelled % 10 === 0) points.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6 })
    struck = g.enemies.find(e => overlap(e, { x, y, w: 1, h: 1 }))
    const m = matAt(g.world, cell(x), cell(y))
    if (props(m).gas || owns(p, 'bolt.overcharge')) ignite(g.world, cell(x), cell(y))
    if (struck || props(m).solid || m === M.WATER) break
  }
  points.push({ x, y })
  g.bolts.push({ points, life: 0.22 })
  if (struck) {
    hurt(g, struck, 2, 'player')
    struck.stun = Math.max(struck.stun, 1)
  }
  energize(g.world, cell(x), cell(y), energy)
  ignite(g.world, cell(x), cell(y))
  burst(g, x, y, 'charge', 8)
}

const bolt = (g, p) => {
  const energy = S.bolt.energy * (1 + g.depth / 2) * (owns(p, 'bolt.overcharge') ? 1.8 : 1)
  shootBolt(g, p, p.aim, energy)
  if (owns(p, 'bolt.fork')) {
    shootBolt(g, p, rotate(p.aim, 0.45), energy / 2)
    shootBolt(g, p, rotate(p.aim, -0.45), energy / 2)
  }
  g.pulse = 1
}

const repel = (g, p) => {
  const R = S.repel
  const scale = owns(p, 'repel.wide') ? 1.6 : 1
  const from = muzzle(p)
  const covered = inCone(from, p.aim, R.reach * scale, R.width * scale)
  const near = inCone(from, p.aim, R.recoilReach, R.width)
  let recoil = false
  forEachCell((x, y, point) => {
    const m = matAt(g.world, x, y)
    if (m === M.METAL && near(point)) recoil = true
    if (m !== M.SCRAP || !covered(point)) return
    setCell(g.world, x, y, M.EMPTY)
    g.flung.push({
      x: x * BLOCK, y: y * BLOCK, w: 8, h: 8,
      vx: p.aim.x * R.fling, vy: p.aim.y * R.fling - 40, age: 0,
      charged: owns(p, 'repel.charged'),
    })
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
  sparkle(g, from, p.aim, 'magnet')
  g.pulse = Math.max(g.pulse, 0.6)
}

const lob = (g, p, aim) => {
  const from = muzzle(p)
  g.fireballs.push({
    x: from.x - 2, y: from.y - 2, w: 4, h: 4,
    vx: aim.x * S.ember.speed, vy: aim.y * S.ember.speed - S.ember.lift,
    age: 0, friendly: true, napalm: owns(p, 'ember.napalm'),
  })
}

const ember = (g, p) => {
  lob(g, p, p.aim)
  if (owns(p, 'ember.trio')) {
    lob(g, p, rotate(p.aim, 0.3))
    lob(g, p, rotate(p.aim, -0.3))
  }
  g.pulse = Math.max(g.pulse, 0.3)
}

const frost = (g, p) => {
  const scale = owns(p, 'frost.wide') ? 1.6 : 1
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.frost.reach * scale, S.frost.width * scale)
  forEachCell((x, y, point) => {
    if (!covered(point)) return
    const m = matAt(g.world, x, y)
    if (m === M.WATER) {
      g.world.notes?.add(`freeze:${M.WATER}`)
      setCell(g.world, x, y, M.ICE)
    }
    else if (g.world.burn[y * 28 + x] > 0) g.world.burn[y * 28 + x] = 0
    else if (m === M.STEAM) setCell(g.world, x, y, M.WATER)
    else if (m === M.ROCK && owns(p, 'frost.brittle') && Math.random() < 0.5) setCell(g.world, x, y, M.SAND)
  })
  for (const e of g.enemies) {
    if (e.friendly || !covered(centre(e))) continue
    e.stun = Math.max(e.stun, S.frost.freeze)
    e.frozen = S.frost.freeze
  }
  sparkle(g, from, p.aim, 'frost', 20)
  g.pulse = Math.max(g.pulse, 0.4)
}

const BREAKS = new Set([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.ICE, M.SAND, M.VOLATILE, M.BRICK, M.SCRAP])

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

const hammer = (g, p) => {
  const from = muzzle(p)
  const width = owns(p, 'hammer.wide') ? 1 : 0
  const across = { x: -p.aim.y, y: p.aim.x }
  for (let reach = 1; reach <= S.hammer.reach; reach++) {
    for (let w = -width; w <= width; w++) {
      const x = cell(from.x + p.aim.x * reach * BLOCK + across.x * w * BLOCK)
      const y = cell(from.y + p.aim.y * reach * BLOCK + across.y * w * BLOCK)
      const m = matAt(g.world, x, y)
      if (m === M.VOLATILE) ignite(g.world, x, y)
      else if (m === M.ROCK) setCell(g.world, x, y, M.SAND)
      else if (BREAKS.has(m)) setCell(g.world, x, y, M.EMPTY)
      burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, 'pale', 2)
    }
  }
  const covered = inCone(from, p.aim, (S.hammer.reach + 1) * BLOCK, BLOCK * (1 + width))
  for (const e of g.enemies) {
    if (!covered(centre(e))) continue
    hurt(g, e, 2, 'player')
    e.vx = p.aim.x * 160
    e.vy = p.aim.y * 160 - 60
    e.shoved = 0.3
  }
  if (owns(p, 'hammer.quake')) quake(g, 10)
  g.shake = Math.max(g.shake, 3)
}

const GUSTED = new Set([M.SMOKE, M.STEAM, M.METHANE, M.ASH])

const gust = (g, p) => {
  const scale = owns(p, 'gust.wide') ? 1.6 : 1
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.gust.reach * scale, S.gust.width * scale)
  const moved = []
  forEachCell((x, y, point) => {
    if (covered(point) && GUSTED.has(matAt(g.world, x, y))) moved.push([x, y])
  })
  const far = ([x, y]) => (x * p.aim.x + y * p.aim.y)
  moved.sort((a, b) => far(b) - far(a))
  const dx = Math.round(p.aim.x)
  const dy = Math.round(p.aim.y)
  for (const [x, y] of moved) {
    let step = 0
    while (step < 5 && matAt(g.world, x + dx * (step + 1), y + dy * (step + 1)) === M.EMPTY) step++
    if (step) relocate(g.world, x, y, x + dx * step, y + dy * step)
  }
  forEachCell((x, y, point) => {
    if (!covered(point) || g.world.burn[y * 28 + x] <= 0) return
    const reach = owns(p, 'gust.bellows') ? 3 : 1
    for (let k = 1; k <= reach; k++) ignite(g.world, x + dx * k, y + dy * k)
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
  sparkle(g, from, p.aim, 'white', 18)
}

const relocate = (w, x, y, nx, ny) => {
  const a = y * 28 + x
  const b = ny * 28 + nx
  for (const f of [w.mat, w.burn, w.charge, w.refractory, w.life]) {
    f[b] = f[a]
    f[a] = 0
  }
}

export const SKILLS = { bolt, repel, ember, frost, hammer, gust }

export const TREES = {
  bolt: [
    { id: 'bolt.fork', name: 'FORK', text: 'THREE BOLTS AT ONCE' },
    { id: 'bolt.overcharge', name: 'OVERCHARGE', text: 'RUNS FURTHER, LIGHTS WHAT IT CROSSES' },
  ],
  repel: [
    { id: 'repel.wide', name: 'WIDE FIELD', text: 'WIDER AND FURTHER' },
    { id: 'repel.charged', name: 'LIVE SCRAP', text: 'THROWN SCRAP LANDS CHARGED' },
  ],
  ember: [
    { id: 'ember.trio', name: 'TRIO', text: 'THREE EMBERS AT ONCE' },
    { id: 'ember.napalm', name: 'NAPALM', text: 'SPILLS BURNING OIL WHERE IT LANDS' },
  ],
  frost: [
    { id: 'frost.wide', name: 'BLIZZARD', text: 'WIDER AND FURTHER' },
    { id: 'frost.brittle', name: 'BRITTLE ROCK', text: 'FROZEN ROCK CRUMBLES' },
  ],
  hammer: [
    { id: 'hammer.wide', name: 'BROAD HEAD', text: 'THREE BLOCKS WIDE' },
    { id: 'hammer.quake', name: 'QUAKE', text: 'SHAKES THE CEILING LOOSE' },
  ],
  gust: [
    { id: 'gust.wide', name: 'GALE', text: 'WIDER AND FURTHER' },
    { id: 'gust.bellows', name: 'BELLOWS', text: 'FLAMES LEAP FURTHER' },
  ],
}

export const SKILL_NAMES = {
  bolt: 'BOLT', repel: 'REPEL', ember: 'EMBER', frost: 'FROST', hammer: 'HAMMER', gust: 'GUST',
}

export const SKILL_DETAILS = {
  bolt: 'LIGHTNING. RUNS THROUGH WATER AND METAL.',
  repel: 'THROWS LOOSE METAL. FIXED METAL THROWS YOU.',
  ember: 'LOBS FIRE. WHATEVER BURNS WILL BURN.',
  frost: 'FREEZES WATER AND FOES. PUTS OUT FIRE.',
  hammer: 'BREAKS BLOCKS. ROCK BECOMES FALLING RUBBLE.',
  gust: 'BLOWS GAS, FOES AND FIREBALLS. FANS FLAMES.',
}

export const spillNapalm = (g, x, y) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1]]) {
    puff(g.world, x + dx, y + dy, M.OIL, [1, 1])
    ignite(g.world, x + dx, y + dy)
  }
}
