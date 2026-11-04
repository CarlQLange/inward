import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { energize, explode, ignite, matAt, puff, setCell } from './world.js'
import { WORLD_PX, cell, centre, forEachCell, hitsSolid, inCone, overlap } from './physics.js'
import { burst, hurt } from './combat.js'
import { chunks } from './feel.js'

const S = TUNING.skills

export const muzzle = p => ({ x: p.x + p.w / 2, y: p.y + (p.crouching ? 4 : 5) })

const owns = (p, node) => p.upgrades.has(node)
const rotate = ({ x, y }, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) })
const hostile = g => g.enemies.filter(e => !e.friendly && !e.ally)

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

const ring = (g, x, y, colour, count = 20, speed = 90) => {
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
    const struck = g.enemies.find(e => overlap(e, { x, y, w: 1, h: 1 }))
    const m = matAt(g.world, cell(x), cell(y))
    if (struck) return { x, y, last, struck, m }
    if (props(m).solid || (stopAtLiquid && props(m).liquid)) return { x, y, last, solid: true, m }
  }
  return { x, y, last, m: matAt(g.world, cell(x), cell(y)) }
}

const addEffect = (g, effect) => g.effects.push({ age: 0, ...effect })

const jagged = (from, to) => {
  const points = [from]
  const length = Math.hypot(to.x - from.x, to.y - from.y)
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

const shootBolt = (g, p, aim, energy) => {
  const start = muzzle(p)
  const hit = ray(g, start, aim, 340, true)
  zap(g, start, hit)
  if (owns(p, 'bolt.overcharge')) {
    for (let t = 8; t < Math.hypot(hit.x - start.x, hit.y - start.y); t += 8) ignite(g.world, cell(start.x + aim.x * t), cell(start.y + aim.y * t))
  }
  if (hit.struck) {
    hurt(g, hit.struck, 2, 'player')
    hit.struck.stun = Math.max(hit.struck.stun, 1)
    if (owns(p, 'bolt.arc')) {
      const near = hostile(g).filter(e => e !== hit.struck && Math.hypot(e.x - hit.x, e.y - hit.y) < S.bolt.arcReach).slice(0, 2)
      for (const e of near) {
        zap(g, hit, centre(e))
        hurt(g, e, 1, 'player')
        e.stun = Math.max(e.stun, 0.6)
      }
    }
  }
  energize(g.world, cell(hit.x), cell(hit.y), energy)
  ignite(g.world, cell(hit.x), cell(hit.y))
  burst(g, hit.x, hit.y, 'charge', 8)
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

const fling = (g, x, y, aim, speed, p) => {
  setCell(g.world, x, y, M.EMPTY)
  g.flung.push({
    x: x * BLOCK, y: y * BLOCK, w: 8, h: 8,
    vx: aim.x * speed, vy: aim.y * speed - 40, age: 0,
    charged: owns(p, 'repel.charged'),
    shrapnel: owns(p, 'repel.shrapnel'),
  })
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
  sparkle(g, from, p.aim, 'magnet')
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

const ember = (g, p) => {
  const fire = { napalm: owns(p, 'ember.napalm'), comet: owns(p, 'ember.comet') }
  lob(g, p, p.aim, fire)
  if (owns(p, 'ember.trio')) {
    lob(g, p, rotate(p.aim, 0.3), fire)
    lob(g, p, rotate(p.aim, -0.3), fire)
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
    } else if (m === M.LAVA) {
      g.world.notes?.add(`cool:${M.LAVA}`)
      setCell(g.world, x, y, M.ROCK)
    } else if (g.world.burn[y * ROOM + x] > 0) g.world.burn[y * ROOM + x] = 0
    else if (m === M.STEAM) setCell(g.world, x, y, M.WATER)
    else if (m === M.ROCK && owns(p, 'frost.brittle') && Math.random() < 0.5) setCell(g.world, x, y, M.SAND)
  })
  for (const e of g.enemies) {
    if (e.friendly || !covered(centre(e))) continue
    e.stun = Math.max(e.stun, S.frost.freeze)
    e.frozen = S.frost.freeze
    e.shatters = owns(p, 'frost.shatter')
  }
  sparkle(g, from, p.aim, 'frost', 20)
  g.pulse = Math.max(g.pulse, 0.4)
}

const BREAKS = new Set([M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.ICE, M.SAND, M.VOLATILE, M.BRICK, M.SCRAP, M.VINE])

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

const smash = (g, x, y) => {
  const m = matAt(g.world, x, y)
  if (m === M.VOLATILE) ignite(g.world, x, y)
  else if (m === M.ROCK) setCell(g.world, x, y, M.SAND)
  else if (BREAKS.has(m)) setCell(g.world, x, y, M.EMPTY)
  chunks(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, m, 7)
}

const hammer = (g, p) => {
  const from = muzzle(p)
  const width = owns(p, 'hammer.wide') ? 1 : 0
  const across = { x: -p.aim.y, y: p.aim.x }
  const bodyHigh = Math.abs(p.aim.x) > Math.abs(p.aim.y) && !p.crouching ? 1 : 0
  for (let reach = 1; reach <= S.hammer.reach; reach++) {
    for (let w = -width; w <= width; w++) {
      const x = cell(from.x + p.aim.x * reach * BLOCK + across.x * w * BLOCK)
      const y = cell(from.y + p.aim.y * reach * BLOCK + across.y * w * BLOCK)
      smash(g, x, y)
      if (bodyHigh) smash(g, x, y + 1)
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
  if (owns(p, 'hammer.slam') && !p.grounded && p.aim.y > 0) {
    p.vy = 320
    p.slam = true
  }
  g.shake = Math.max(g.shake, 3)
}

const GUSTED = new Set([M.SMOKE, M.STEAM, M.METHANE, M.ASH])

const relocate = (w, x, y, nx, ny) => {
  const a = y * ROOM + x
  const b = ny * ROOM + nx
  for (const f of [w.mat, w.burn, w.charge, w.refractory, w.life]) {
    f[b] = f[a]
    f[a] = 0
  }
}

const gust = (g, p) => {
  const scale = owns(p, 'gust.wide') ? 1.6 : 1
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.gust.reach * scale, S.gust.width * scale)
  const moved = []
  forEachCell((x, y, point) => {
    if (covered(point) && GUSTED.has(matAt(g.world, x, y))) moved.push([x, y])
  })
  moved.sort((a, b) => (b[0] * p.aim.x + b[1] * p.aim.y) - (a[0] * p.aim.x + a[1] * p.aim.y))
  const dx = Math.round(p.aim.x)
  const dy = Math.round(p.aim.y)
  for (const [x, y] of moved) {
    let steps = 0
    while (steps < 5 && matAt(g.world, x + dx * (steps + 1), y + dy * (steps + 1)) === M.EMPTY) steps++
    if (steps) relocate(g.world, x, y, x + dx * steps, y + dy * steps)
  }
  forEachCell((x, y, point) => {
    if (!covered(point) || g.world.burn[y * ROOM + x] <= 0) return
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
  if (owns(p, 'gust.cyclone') && p.aim.y > 0) {
    p.vy = -S.gust.lift
    p.jumpHeld = false
  }
  sparkle(g, from, p.aim, 'white', 18)
}

const blink = (g, p) => {
  const reach = owns(p, 'blink.long') ? S.blink.far : S.blink.reach
  const origin = centre(p)
  let target = null
  for (let d = reach; d > 4 && !target; d -= 2) {
    const box = { x: p.x + p.aim.x * d, y: p.y + p.aim.y * d, w: p.w, h: p.h }
    if (box.x > 1 && box.y > 1 && box.x + box.w < WORLD_PX - 1 && box.y + box.h < WORLD_PX - 1 && !hitsSolid(g.world, box)) target = box
  }
  if (!target) return
  if (owns(p, 'blink.ghost')) addEffect(g, { kind: 'decoy', x: origin.x - 4, y: origin.y - 8, life: 3, explosive: false })
  ring(g, origin.x, origin.y, 'white', 14, 60)
  p.x = target.x
  p.y = target.y
  p.vy = Math.min(p.vy, 0)
  p.iframes = Math.max(p.iframes, 0.25)
  const arrival = centre(p)
  ring(g, arrival.x, arrival.y, 'white', 14, 60)
  if (owns(p, 'blink.shock')) {
    for (const e of hostile(g)) {
      if (Math.hypot(centre(e).x - arrival.x, centre(e).y - arrival.y) > S.blink.shockReach) continue
      hurt(g, e, 2, 'player')
      e.stun = Math.max(e.stun, 0.6)
    }
    ring(g, arrival.x, arrival.y, 'charge', 24, 120)
  }
  g.pulse = Math.max(g.pulse, 0.5)
}

const grapple = (g, p) => {
  const from = muzzle(p)
  const hit = ray(g, from, p.aim, S.grapple.reach)
  zap(g, from, hit, 'pale')
  if (hit.struck) {
    const c = centre(p)
    const e = hit.struck
    const d = Math.max(1, Math.hypot(c.x - hit.x, c.y - hit.y))
    if (!e.heavy) {
      e.vx = ((c.x - hit.x) / d) * S.grapple.reel
      e.vy = ((c.y - hit.y) / d) * S.grapple.reel - 30
      e.shoved = 0.35
    }
    if (owns(p, 'grapple.reel')) e.stun = Math.max(e.stun, 1.2)
    if (owns(p, 'grapple.taser')) {
      zap(g, from, hit)
      hurt(g, e, 2, 'player')
    }
    return
  }
  if (!hit.solid) return
  const x = cell(hit.x)
  const y = cell(hit.y)
  if (owns(p, 'grapple.taser')) {
    zap(g, from, hit)
    energize(g.world, x, y, S.bolt.energy / 2)
  }
  if (owns(p, 'grapple.yank') && BREAKS.has(hit.m)) {
    setCell(g.world, x, y, M.EMPTY)
    if (hit.m === M.SCRAP || hit.m === M.ROCK) {
      g.flung.push({ x: x * BLOCK, y: y * BLOCK, w: 8, h: 8, vx: -p.aim.x * 200, vy: -p.aim.y * 200 - 30, age: 0 })
    }
    return
  }
  const c = centre(p)
  const d = Math.max(1, Math.hypot(hit.x - c.x, hit.y - c.y))
  p.vx = ((hit.x - c.x) / d) * S.grapple.pull
  p.vy = ((hit.y - c.y) / d) * S.grapple.pull
  p.jumpHeld = false
  p.zipping = d / S.grapple.pull
  p.drift = p.zipping + 0.15
}

const dash = (g, p) => {
  const aim = p.aim.y !== 0 && p.aim.x === 0 ? p.aim : { x: p.facing * Math.abs(p.aim.x || 1), y: p.aim.y * 0.7 }
  p.vx = aim.x * S.dash.speed
  p.vy = aim.y * S.dash.speed
  p.dashing = S.dash.time
  p.drift = S.dash.time + 0.1
  p.iframes = Math.max(p.iframes, S.dash.time + 0.05)
  p.jumpHeld = false
  g.pulse = Math.max(g.pulse, 0.3)
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
  if (owns(p, 'dash.flame')) puff(g.world, cell(p.x + p.w / 2), cell(p.y + p.h - 1), M.OIL, [1, 1])
  if (owns(p, 'dash.flame')) ignite(g.world, cell(p.x + p.w / 2), cell(p.y + p.h - 1))
  for (const e of hostile(g)) {
    if (!overlap(box, e) || e.iframes > 0) continue
    hurt(g, e, 2, 'player')
    e.stun = Math.max(e.stun, 0.4)
    if (owns(p, 'dash.chain')) p.skills.filter(s => s.kind === 'dash').forEach(s => { s.ready = 0 })
  }
}

export const recordTrail = (p, dt) => {
  p.trailClock = (p.trailClock ?? 0) + dt
  if (p.trailClock < 0.1) return
  p.trailClock = 0
  p.trail = [...(p.trail ?? []), { x: p.x, y: p.y, hp: p.hp }].slice(-S.rewind.keep)
}

const rewind = (g, p) => {
  const trail = p.trail ?? []
  if (trail.length === 0) return
  const steps = owns(p, 'rewind.far') ? S.rewind.farSteps : S.rewind.steps
  const past = trail[Math.max(0, trail.length - steps)]
  const here = centre(p)
  if (owns(p, 'rewind.burst')) explode(g.world, cell(here.x), cell(here.y), 1)
  ring(g, here.x, here.y, 'magnet', 18, 70)
  if (!hitsSolid(g.world, { x: past.x, y: past.y, w: p.w, h: p.h })) {
    p.x = past.x
    p.y = past.y
  }
  p.vx = 0
  p.vy = 0
  p.hp = owns(p, 'rewind.mend') ? Math.max(p.hp, past.hp) : p.hp
  p.iframes = Math.max(p.iframes, 0.4)
  g.pulse = 1
}

const aimedCell = (g, p, distance) => {
  const hit = ray(g, muzzle(p), p.aim, distance)
  return { x: cell(hit.last.x), y: cell(hit.last.y) }
}

const mason = (g, p) => {
  const { x, y } = aimedCell(g, p, S.mason.reach)
  const width = owns(p, 'mason.wide') ? 2 : 1
  const material = owns(p, 'mason.metal') ? M.METAL : owns(p, 'mason.rubble') ? M.SAND : M.ROCK
  const horizontal = Math.abs(p.aim.y) >= Math.abs(p.aim.x)
  for (let d = -width; d <= width; d++) {
    const cx = horizontal ? x + d : x
    const cy = horizontal ? y : y + d
    if (cx < 1 || cy < 1 || cx > ROOM - 2 || cy > ROOM - 2) continue
    if (props(matAt(g.world, cx, cy)).solid) continue
    if (overlap(p, { x: cx * BLOCK, y: cy * BLOCK, w: BLOCK, h: BLOCK })) continue
    setCell(g.world, cx, cy, material)
    burst(g, (cx + 0.5) * BLOCK, (cy + 0.5) * BLOCK, 'pale', 2)
  }
}

const seed = (g, p) => {
  const here = muzzle(p)
  const straightUp = p.aim.y < -0.5 && Math.abs(p.aim.x) < 0.8
  const { x, y } = straightUp ? { x: cell(here.x), y: cell(p.y + p.h - 1) } : aimedCell(g, p, S.seed.reach)
  const length = owns(p, 'seed.overgrowth') ? S.seed.big : S.seed.length
  setCell(g.world, x, y, M.VINE, length)
  if (owns(p, 'seed.overgrowth')) {
    setCell(g.world, x - 1, y, M.VINE, length / 2)
    setCell(g.world, x + 1, y, M.VINE, length / 2)
  }
  g.world.thorns = g.world.thorns || owns(p, 'seed.thorns')
  g.world.tinder = g.world.tinder || owns(p, 'seed.tinder')
  sparkle(g, muzzle(p), p.aim, 'pale', 8)
}

const spring = (g, p) => {
  const { x, y } = aimedCell(g, p, S.spring.reach)
  const count = owns(p, 'spring.flood') ? S.spring.big : S.spring.small
  p.pourOil = owns(p, 'spring.oilwell') ? !p.pourOil : false
  const liquid = p.pourOil ? M.OIL : M.WATER
  for (let n = 0; n < count; n++) {
    const cx = x + (n % 5) - 2
    const cy = y - Math.floor(n / 5)
    if (matAt(g.world, cx, cy) === M.EMPTY) setCell(g.world, cx, cy, liquid)
  }
  if (owns(p, 'spring.geyser') && p.aim.y > 0) {
    p.vy = -S.spring.lift
    p.jumpHeld = false
  }
  sparkle(g, muzzle(p), p.aim, 'magnet', 12)
}

const acid = (g, p) => {
  const flask = { acid: owns(p, 'acid.pool') ? S.acid.big : S.acid.small, fumes: owns(p, 'acid.fumes') }
  lob(g, p, p.aim, flask)
  if (owns(p, 'acid.brew')) {
    lob(g, p, rotate(p.aim, 0.35), flask)
    lob(g, p, rotate(p.aim, -0.35), flask)
  }
}

export const pourAcid = (g, x, y, count, fumes) => {
  for (let n = 0; n < count; n++) {
    const cx = x + (n % 3) - 1
    const cy = y - Math.floor(n / 3)
    if (!props(matAt(g.world, cx, cy)).solid) setCell(g.world, cx, cy, M.ACID)
    if (fumes) puff(g.world, cx, cy - 1, M.SMOKE, TUNING.world.smokeLife)
  }
}

const MELTS = new Set([M.ROCK, M.SAND, M.BRICK])
const FORGED = new Set([M.METAL, M.SCRAP, M.GATE])

const melt = (g, p) => {
  const from = muzzle(p)
  const reach = owns(p, 'melt.beam') ? S.melt.far : S.melt.reach
  const width = owns(p, 'melt.magma') ? 1 : 0
  const across = { x: -p.aim.y, y: p.aim.x }
  let end = from
  let solids = 0
  for (let d = 4; d < reach && solids < S.melt.depth; d += 4) {
    end = { x: from.x + p.aim.x * d, y: from.y + p.aim.y * d }
    let touched = false
    for (let w = -width; w <= width; w++) {
      const x = cell(end.x + across.x * w * BLOCK)
      const y = cell(end.y + across.y * w * BLOCK)
      const m = matAt(g.world, x, y)
      if (MELTS.has(m) || (FORGED.has(m) && owns(p, 'melt.forge'))) {
        setCell(g.world, x, y, M.LAVA)
        touched = true
      } else if (m === M.ICE) setCell(g.world, x, y, M.WATER)
      else if (m === M.WATER) setCell(g.world, x, y, M.STEAM, 2)
      else ignite(g.world, x, y)
    }
    if (touched) solids += 1
    const struck = g.enemies.find(e => !e.friendly && overlap(e, { x: end.x, y: end.y, w: 1, h: 1 }))
    if (struck) hurt(g, struck, 2, 'player')
  }
  zap(g, from, end, 'fire')
  g.pulse = Math.max(g.pulse, 0.5)
}

const TRANSMUTE = {
  [M.WATER]: M.OIL, [M.OIL]: M.ACID, [M.ACID]: M.LAVA, [M.LAVA]: M.ROCK,
}
const TRANSMUTE_SOLID = { [M.ROCK]: M.SAND, [M.SAND]: M.WATER, [M.ICE]: M.WATER, [M.WOOD]: M.VINE, [M.MOSS]: M.VINE, [M.PEAT]: M.OIL }

const alchemy = (g, p) => {
  const scale = owns(p, 'alchemy.wide') ? 1.6 : 1
  const from = muzzle(p)
  const covered = inCone(from, p.aim, S.alchemy.reach * scale, S.alchemy.width * scale)
  forEachCell((x, y, point) => {
    if (!covered(point)) return
    const m = matAt(g.world, x, y)
    const next = TRANSMUTE[m] ?? (owns(p, 'alchemy.solids') ? TRANSMUTE_SOLID[m] : undefined)
    if (next !== undefined) setCell(g.world, x, y, next)
    if (owns(p, 'alchemy.vapour') && (m === M.SMOKE || m === M.STEAM)) setCell(g.world, x, y, M.METHANE, 10)
  })
  sparkle(g, from, p.aim, 'gas', 20)
  g.pulse = Math.max(g.pulse, 0.5)
}

const well = (g, p) => {
  const hit = ray(g, muzzle(p), p.aim, S.well.reach)
  addEffect(g, {
    kind: 'well', x: hit.last.x, y: hit.last.y,
    life: owns(p, 'well.long') ? S.well.longLife : S.well.life,
    collapse: owns(p, 'well.collapse'),
    lodestone: owns(p, 'well.lodestone'),
  })
}

const swap = (g, p) => {
  const reach = owns(p, 'swap.reach') ? S.swap.far : S.swap.reach
  const covered = inCone(muzzle(p), p.aim, reach, S.swap.width)
  const target = g.enemies
    .filter(e => covered(centre(e)))
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
  if (!target) return
  const [ex, ey] = [target.x, target.y + target.h]
  const [px, py] = [p.x, p.y + p.h]
  target.x = px
  target.y = py - target.h
  p.x = ex
  p.y = ey - p.h
  target.stun = Math.max(target.stun, owns(p, 'swap.daze') ? 2 : 0.5)
  if (owns(p, 'swap.shock')) {
    zap(g, centre(p), centre(target))
    hurt(g, target, 2, 'player')
  }
  p.iframes = Math.max(p.iframes, 0.3)
  g.pulse = Math.max(g.pulse, 0.6)
}

const stop = (g, p) => {
  g.timeStop = owns(p, 'stop.long') ? S.stop.longTime : S.stop.time
  g.stopShatter = owns(p, 'stop.shatter')
  g.stopFury = owns(p, 'stop.fury')
  g.pulse = 1
}

const charmOne = (g, e, p) => {
  e.ally = owns(p, 'charm.long') ? S.charm.longTime : S.charm.time
  e.detonates = owns(p, 'charm.sacrifice')
  const c = centre(e)
  ring(g, c.x, c.y, 'gas', 12, 40)
}

const charm = (g, p) => {
  const covered = inCone(muzzle(p), p.aim, S.charm.reach, S.charm.width)
  const targets = hostile(g).filter(e => !e.heavy && covered(centre(e)))
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
  targets.slice(0, owns(p, 'charm.pack') ? 3 : 1).forEach(e => charmOne(g, e, p))
}

const decoy = (g, p) => {
  const hit = ray(g, muzzle(p), p.aim, S.decoy.reach)
  addEffect(g, {
    kind: 'decoy', x: hit.last.x - 4, y: hit.last.y - 8, life: S.decoy.life,
    explosive: owns(p, 'decoy.explosive'), gas: owns(p, 'decoy.gas'), loud: owns(p, 'decoy.loud'),
  })
}

const drone = (g, p) => {
  const make = phase => addEffect(g, {
    kind: 'drone', phase, x: p.x, y: p.y - 10, life: S.drone.life, reload: 0.2,
    sparks: owns(p, 'drone.sparks'), embers: owns(p, 'drone.embers'),
  })
  make(0)
  if (owns(p, 'drone.twin')) make(Math.PI)
}

const rod = (g, p) => {
  const hit = ray(g, muzzle(p), { x: p.aim.x || p.facing, y: 1 }, S.rod.reach)
  addEffect(g, {
    kind: 'rod', x: hit.last.x - 4, y: hit.last.y - 16, cx: cell(hit.x), cy: cell(hit.y), life: owns(p, 'rod.long') ? S.rod.longLife : S.rod.life, reload: 0.3,
    arcs: owns(p, 'rod.arc'), grounded: owns(p, 'rod.ground'),
  })
}

const mine = (g, p) => {
  const hit = ray(g, muzzle(p), p.aim, S.mine.reach)
  addEffect(g, {
    kind: 'mine', x: hit.last.x - 3, y: hit.last.y - 3, life: S.mine.life, arm: 0.5,
    cluster: owns(p, 'mine.cluster'), gas: owns(p, 'mine.gas'), wide: owns(p, 'mine.wide'),
  })
}

const SHATTERS = new Set([M.ICE, M.SAND, M.VOLATILE])

const roar = (g, p) => {
  const here = centre(p)
  const reach = owns(p, 'roar.wide') ? S.roar.far : S.roar.reach
  forEachCell((x, y, point) => {
    if (Math.hypot(point.x - here.x, point.y - here.y) > reach) return
    const m = matAt(g.world, x, y)
    if (m === M.VOLATILE) ignite(g.world, x, y)
    else if (SHATTERS.has(m) && m === M.ICE) setCell(g.world, x, y, M.WATER)
    else if (m === M.ROCK && owns(p, 'roar.crack') && Math.random() < 0.25) setCell(g.world, x, y, M.SAND)
    if (g.world.burn[y * ROOM + x] > 0 && owns(p, 'roar.snuff')) g.world.burn[y * ROOM + x] = 0
  })
  for (const e of g.enemies) {
    const c = centre(e)
    const d = Math.hypot(c.x - here.x, c.y - here.y)
    if (d > reach || e.friendly) continue
    e.stun = Math.max(e.stun, 1)
    if (!e.heavy) {
      e.vx = ((c.x - here.x) / Math.max(d, 1)) * 160
      e.vy = -60
      e.shoved = 0.3
    }
  }
  ring(g, here.x, here.y, 'white', 30, reach * 1.6)
  g.shake = Math.max(g.shake, 5)
  g.pulse = Math.max(g.pulse, 0.7)
}

const mirror = (g, p) => {
  addEffect(g, {
    kind: 'mirror', life: owns(p, 'mirror.long') ? S.mirror.longLife : S.mirror.life,
    spikes: owns(p, 'mirror.spikes'), burst: owns(p, 'mirror.burst'),
  })
}

const echo = (g, p) => {
  g.echo = owns(p, 'echo.twice') ? 2 : 1
  const here = centre(p)
  ring(g, here.x, here.y, 'gas', 16, 50)
}

const pact = (g, p) => {
  if (p.hp <= 1 && !owns(p, 'pact.safe')) return
  if (p.hp > 1) p.hp -= 1
  p.skills.forEach(s => { s.ready = 0 })
  if (owns(p, 'pact.frenzy')) p.frenzy = S.pact.frenzy
  if (owns(p, 'pact.mend')) p.mending = S.pact.frenzy
  const here = centre(p)
  ring(g, here.x, here.y, 'fire', 18, 80)
  g.pulse = 1
  g.shake = Math.max(g.shake, 3)
}

export const SKILLS = {
  bolt, repel, ember, frost, hammer, gust, blink, grapple, dash, rewind, mason, seed, spring, acid, melt, alchemy,
  well, swap, stop, charm, decoy, drone, rod, mine, roar, mirror, echo, pact,
}

const node = (id, name, text) => ({ id, name, text })

export const TREES = {
  bolt: [node('bolt.fork', 'FORK', 'THREE BOLTS AT ONCE'), node('bolt.overcharge', 'OVERCHARGE', 'RUNS FURTHER, LIGHTS WHAT IT CROSSES'), node('bolt.arc', 'ARC', 'LEAPS TO TWO NEARBY FOES')],
  repel: [node('repel.wide', 'WIDE FIELD', 'WIDER AND FURTHER'), node('repel.charged', 'LIVE SCRAP', 'THROWN SCRAP LANDS CHARGED'), node('repel.shrapnel', 'SHRAPNEL', 'THROWN SCRAP BURSTS ON LANDING')],
  ember: [node('ember.trio', 'TRIO', 'THREE EMBERS AT ONCE'), node('ember.napalm', 'NAPALM', 'SPILLS BURNING OIL'), node('ember.comet', 'COMET', 'EMBERS EXPLODE ON IMPACT')],
  frost: [node('frost.wide', 'BLIZZARD', 'WIDER AND FURTHER'), node('frost.brittle', 'BRITTLE ROCK', 'FROZEN ROCK CRUMBLES'), node('frost.shatter', 'SHATTER', 'FROZEN FOES BURST INTO SHARDS')],
  hammer: [node('hammer.wide', 'BROAD HEAD', 'THREE BLOCKS WIDE'), node('hammer.quake', 'QUAKE', 'SHAKES THE CEILING LOOSE'), node('hammer.slam', 'SLAM', 'AIM DOWN IN THE AIR TO PLUNGE')],
  gust: [node('gust.wide', 'GALE', 'WIDER AND FURTHER'), node('gust.bellows', 'BELLOWS', 'FLAMES LEAP FURTHER'), node('gust.cyclone', 'CYCLONE', 'AIM DOWN TO RIDE THE WIND UP')],
  blink: [node('blink.long', 'FAR STEP', 'TELEPORT MUCH FURTHER'), node('blink.shock', 'SHOCK STEP', 'ARRIVING HURTS WHAT IS NEARBY'), node('blink.ghost', 'AFTERIMAGE', 'LEAVES A DECOY BEHIND')],
  grapple: [node('grapple.yank', 'YANK', 'TEARS OUT THE BLOCK IT HITS'), node('grapple.taser', 'LIVE LINE', 'THE LINE CARRIES CHARGE'), node('grapple.reel', 'REEL', 'DAZES WHAT IT PULLS')],
  dash: [node('dash.ram', 'RAM', 'SMASHES THROUGH BLOCKS'), node('dash.flame', 'SCORCH', 'LEAVES A BURNING TRAIL'), node('dash.chain', 'CHAIN', 'HITTING A FOE RESETS IT')],
  rewind: [node('rewind.far', 'LONG MEMORY', 'GOES BACK TWICE AS FAR'), node('rewind.mend', 'UNDO', 'RESTORES THE HEARTS YOU HAD'), node('rewind.burst', 'WAKE', 'BLOWS UP WHERE YOU LEFT')],
  mason: [node('mason.wide', 'WIDE WALL', 'FIVE BLOCKS AT ONCE'), node('mason.metal', 'IRONWORK', 'BUILDS METAL THAT CONDUCTS'), node('mason.rubble', 'RUBBLE', 'BUILDS FALLING BLOCKS THAT CRUSH')],
  seed: [node('seed.overgrowth', 'OVERGROWTH', 'THREE LONGER VINES'), node('seed.thorns', 'THORNS', 'VINES HURT FOES'), node('seed.tinder', 'TINDER', 'BURNING VINES EXPLODE')],
  spring: [node('spring.flood', 'FLOOD', 'FAR MORE WATER'), node('spring.oilwell', 'OIL WELL', 'EVERY OTHER CAST POURS OIL'), node('spring.geyser', 'GEYSER', 'AIM DOWN TO BLAST UPWARD')],
  acid: [node('acid.pool', 'DEEP POOL', 'FAR MORE ACID'), node('acid.brew', 'THREE FLASKS', 'THROWS THREE AT ONCE'), node('acid.fumes', 'FUMES', 'ALSO RELEASES CHOKING SMOKE')],
  melt: [node('melt.beam', 'LONG BEAM', 'REACHES MUCH FURTHER'), node('melt.magma', 'MAGMA', 'THREE BLOCKS WIDE'), node('melt.forge', 'FORGE', 'ALSO MELTS METAL AND GATES')],
  alchemy: [node('alchemy.wide', 'WIDE WORKING', 'WIDER AND FURTHER'), node('alchemy.solids', 'TRANSMUTE', 'CHANGES SOLIDS TOO'), node('alchemy.vapour', 'VAPOUR', 'TURNS SMOKE INTO MARSH GAS')],
  well: [node('well.long', 'LONG PULL', 'LASTS MUCH LONGER'), node('well.collapse', 'COLLAPSE', 'EXPLODES WHEN IT ENDS'), node('well.lodestone', 'LODESTONE', 'ALSO DRAWS SAND AND GAS')],
  swap: [node('swap.reach', 'LONG SWAP', 'REACHES MUCH FURTHER'), node('swap.daze', 'DAZE', 'THE FOE IS LEFT STUNNED'), node('swap.shock', 'SHOCK', 'THE SWAP HURTS THEM')],
  stop: [node('stop.long', 'LONG PAUSE', 'TIME STAYS STOPPED LONGER'), node('stop.shatter', 'AFTERSHOCK', 'FOES ARE STUNNED WHEN IT ENDS'), node('stop.fury', 'FURY', 'YOUR SKILLS RECOVER IN STOPPED TIME')],
  charm: [node('charm.long', 'DEVOTION', 'LASTS MUCH LONGER'), node('charm.pack', 'PACK', 'CHARMS THREE AT ONCE'), node('charm.sacrifice', 'SACRIFICE', 'EXPLODES WHEN THE CHARM ENDS')],
  decoy: [node('decoy.explosive', 'BOOBY TRAP', 'EXPLODES WHEN IT ENDS'), node('decoy.gas', 'GASBAG', 'RELEASES MARSH GAS FIRST'), node('decoy.loud', 'WAR CRY', 'DRAWS FOES FROM FURTHER AWAY')],
  drone: [node('drone.twin', 'TWIN', 'TWO DRONES'), node('drone.sparks', 'TESLA', 'FIRES LIGHTNING AND CHARGES WATER'), node('drone.embers', 'FLAMER', 'FIRES EMBERS THAT LIGHT THINGS')],
  rod: [node('rod.long', 'SEASONED', 'LASTS MUCH LONGER'), node('rod.arc', 'ARCS', 'ZAPS NEARBY FOES'), node('rod.ground', 'GROUND', 'ALSO CHARGES THE WHOLE FLOOR')],
  mine: [node('mine.wide', 'BIG CHARGE', 'A BIGGER BLAST'), node('mine.cluster', 'CLUSTER', 'SCATTERS SMALLER MINES'), node('mine.gas', 'GAS MINE', 'RELEASES GAS AS IT GOES OFF')],
  roar: [node('roar.wide', 'BELLOW', 'REACHES MUCH FURTHER'), node('roar.crack', 'CRACK', 'SHATTERS ROCK INTO RUBBLE'), node('roar.snuff', 'SNUFF', 'PUTS OUT NEARBY FIRE')],
  mirror: [node('mirror.long', 'LONG SHIELD', 'LASTS MUCH LONGER'), node('mirror.spikes', 'SPIKES', 'HURTS WHAT TOUCHES YOU'), node('mirror.burst', 'BURST', 'SHOVES FOES WHEN IT ENDS')],
  echo: [node('echo.twice', 'CHORUS', 'THE NEXT SKILL FIRES THREE TIMES'), node('echo.quick', 'REVERB', 'RECOVERS MUCH FASTER'), node('echo.free', 'RESONANCE', 'THE ECHOED SKILL HAS NO COOLDOWN')],
  pact: [node('pact.frenzy', 'FRENZY', 'SHOOT TWICE AS FAST FOR A WHILE'), node('pact.mend', 'BLOOD MEAL', 'KILLS HEAL YOU FOR A WHILE'), node('pact.safe', 'LAST DROP', 'WORKS FREE AT ONE HEART')],
}

export const SKILL_NAMES = Object.fromEntries(Object.keys(SKILLS).map(k => [k, k.toUpperCase()]))

export const SKILL_DETAILS = {
  bolt: 'LIGHTNING. RUNS THROUGH WATER AND METAL.',
  repel: 'THROWS LOOSE METAL. FIXED METAL THROWS YOU.',
  ember: 'LOBS FIRE. WHATEVER BURNS WILL BURN.',
  frost: 'FREEZES WATER AND FOES. PUTS OUT FIRE.',
  hammer: 'BREAKS BLOCKS. ROCK BECOMES FALLING RUBBLE.',
  gust: 'BLOWS GAS, FOES AND FIREBALLS. FANS FLAMES.',
  blink: 'TELEPORT THROUGH ANYTHING, EVEN LOCKS.',
  grapple: 'HOOK A WALL TO FLY AT IT. HOOK A FOE TO REEL IT IN.',
  dash: 'A BURST OF SPEED THAT HITS WHAT YOU PASS.',
  rewind: 'GO BACK TO WHERE YOU WERE A MOMENT AGO.',
  mason: 'BUILD BLOCKS. BRIDGES, WALLS, TRAPS.',
  seed: 'GROWS A VINE YOU CAN CLIMB. IT ALSO BURNS.',
  spring: 'POURS WATER WHEREVER YOU AIM.',
  acid: 'THROWS ACID THAT EATS TERRAIN AND FOES.',
  melt: 'A BEAM THAT TURNS ROCK INTO LAVA.',
  alchemy: 'WATER TO OIL TO ACID TO LAVA TO ROCK.',
  well: 'A SMALL BLACK HOLE PULLS FOES AND SCRAP IN.',
  swap: 'TRADE PLACES WITH A FOE.',
  stop: 'STOPS TIME. ONLY YOU MOVE.',
  charm: 'A FOE FIGHTS FOR YOU FOR A WHILE.',
  decoy: 'A DUMMY THAT FOES ATTACK INSTEAD OF YOU.',
  drone: 'A SMALL HELPER THAT SHOOTS FOR YOU.',
  rod: 'PLANT A ROD THAT KEEPS PULSING CHARGE.',
  mine: 'A TRAP THAT BLOWS WHEN A FOE COMES NEAR.',
  roar: 'STUNS AND SCATTERS. SHATTERS ICE AND CRYSTAL.',
  mirror: 'A SHIELD THAT THROWS SHOTS BACK.',
  echo: 'YOUR NEXT SKILL FIRES AGAIN.',
  pact: 'ONE HEART RESETS EVERY SKILL.',
}

export const spillNapalm = (g, x, y) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1]]) {
    puff(g.world, x + dx, y + dy, M.OIL, [1, 1])
    ignite(g.world, x + dx, y + dy)
  }
}
