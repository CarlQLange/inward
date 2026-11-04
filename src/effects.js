import { BLOCK, TUNING } from './config.js'
import { M, props } from './materials.js'
import { energize, explode, ignite, matAt, puff, setCell } from './world.js'
import { cell, centre, forEachCell, overlap } from './physics.js'
import { burst, hurt } from './combat.js'
import { SKILLS, zap } from './skills.js'

const S = TUNING.skills

const hostiles = g => g.enemies.filter(e => !e.friendly && !e.ally)
const nearest = (list, x, y, reach) => list
  .map(e => [Math.hypot(centre(e).x - x, centre(e).y - y), e])
  .filter(([d]) => d < reach)
  .sort((a, b) => a[0] - b[0])[0]?.[1]

const blast = (g, x, y, reach) => explode(g.world, cell(x), cell(y), reach)

const pullToward = (e, x, y, force, dt) => {
  const c = centre(e)
  const d = Math.max(4, Math.hypot(x - c.x, y - c.y))
  e.vx = (e.vx ?? 0) + ((x - c.x) / d) * force * dt
  e.vy = (e.vy ?? 0) + ((y - c.y) / d) * force * dt
}

const stepWell = (g, f, dt) => {
  const W = S.well
  for (const e of g.enemies) {
    if (e.friendly || e.heavy || Math.hypot(centre(e).x - f.x, centre(e).y - f.y) > W.radius) continue
    pullToward(e, f.x, f.y, W.force, dt)
    e.shoved = Math.max(e.shoved, 0.1)
  }
  for (const b of g.fireballs) if (Math.hypot(b.x - f.x, b.y - f.y) < W.radius) pullToward(b, f.x, f.y, W.force * 1.5, dt)
  for (const b of g.flung) if (Math.hypot(b.x - f.x, b.y - f.y) < W.radius) pullToward(b, f.x, f.y, W.force * 1.5, dt)
  f.tick = (f.tick ?? 0) + dt
  if (f.tick < 0.15) return
  f.tick = 0
  const cx = cell(f.x)
  const cy = cell(f.y)
  const reach = Math.floor(W.radius / BLOCK)
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      const m = matAt(g.world, x, y)
      const loose = m === M.SCRAP || (f.lodestone && (m === M.SAND || props(m).gas))
      if (!loose || Math.hypot(x - cx, y - cy) > reach) continue
      if (m === M.SCRAP) {
        const d = Math.max(1, Math.hypot(cx - x, cy - y))
        setCell(g.world, x, y, M.EMPTY)
        g.flung.push({ x: x * BLOCK, y: y * BLOCK, w: 8, h: 8, vx: ((cx - x) / d) * 140, vy: ((cy - y) / d) * 140, age: 0 })
      } else if (Math.random() < 0.4) {
        const nx = x + Math.sign(cx - x)
        const ny = y + Math.sign(cy - y)
        if (matAt(g.world, nx, ny) === M.EMPTY) {
          const life = g.world.life[y * 28 + x]
          setCell(g.world, nx, ny, m, life)
          setCell(g.world, x, y, M.EMPTY)
        }
      }
    }
  }
}

const endWell = (g, f) => {
  if (f.collapse) blast(g, f.x, f.y, 2)
}

const endDecoy = (g, f) => {
  if (f.explosive) blast(g, f.x + 4, f.y + 8, 2)
}

const stepDecoy = (g, f, dt) => {
  f.tick = (f.tick ?? 0) + dt
  if (f.gas && f.tick > 0.25) {
    f.tick = 0
    puff(g.world, cell(f.x + 4), cell(f.y + 4), M.METHANE, [6, 10])
  }
}

const stepDrone = (g, f, dt) => {
  const p = g.player
  const a = g.time * 2.4 + f.phase
  f.x += (p.x + Math.cos(a) * 16 - f.x) * Math.min(1, dt * 6)
  f.y += (p.y - 8 + Math.sin(a) * 8 - f.y) * Math.min(1, dt * 6)
  f.reload -= dt
  if (f.reload > 0) return
  const target = nearest(hostiles(g), f.x, f.y, S.drone.range)
  if (!target) return
  f.reload = S.drone.fireEvery
  const t = centre(target)
  const d = Math.max(1, Math.hypot(t.x - f.x, t.y - f.y))
  if (f.sparks) {
    zap(g, { x: f.x, y: f.y }, t)
    hurt(g, target, 1, 'player')
    energize(g.world, cell(t.x), cell(t.y + 6), 14)
  } else if (f.embers) {
    g.fireballs.push({ x: f.x, y: f.y, w: 4, h: 4, vx: ((t.x - f.x) / d) * 150, vy: ((t.y - f.y) / d) * 150 - 40, age: 0, friendly: true })
  } else {
    g.shots.push({ x: f.x, y: f.y, w: 2, h: 2, vx: ((t.x - f.x) / d) * 220, vy: ((t.y - f.y) / d) * 220, life: 0.7 })
  }
}

const stepRod = (g, f, dt) => {
  f.reload -= dt
  if (f.reload > 0) return
  f.reload = S.rod.pulseEvery
  energize(g.world, f.cx, f.cy, S.rod.energy)
  if (f.grounded) {
    forEachCell((x, y) => {
      if (Math.abs(y - f.cy) <= 1 && Math.abs(x - f.cx) <= 6 && props(matAt(g.world, x, y)).solid && g.world.refractory[y * 28 + x] <= 0) {
        g.world.charge[y * 28 + x] = 0.2
      }
    })
  }
  const top = { x: f.x + 4, y: f.y + 1 }
  burst(g, top.x, top.y, 'charge', 4)
  if (!f.arcs) return
  const target = nearest(hostiles(g), top.x, top.y, S.rod.range)
  if (!target) return
  zap(g, top, centre(target))
  hurt(g, target, 1)
  target.stun = Math.max(target.stun, 0.5)
}

const detonateMine = (g, f) => {
  for (const e of hostiles(g)) {
    if (Math.hypot(centre(e).x - f.x, centre(e).y - f.y) < S.mine.radius) hurt(g, e, S.mine.damage)
  }
  if (f.gas) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, -1]]) puff(g.world, cell(f.x) + dx, cell(f.y) + dy, M.METHANE, [2, 4])
  blast(g, f.x + 3, f.y + 3, f.wide ? 3 : 2)
  if (!f.cluster) return
  for (let i = 0; i < 4; i++) {
    g.effects.push({ kind: 'mine', age: 0, x: f.x + (i - 1.5) * 18, y: f.y - 8, life: 8, arm: 0.5, vx: 0, armed: true })
  }
}

const stepMine = (g, f, dt) => {
  f.arm -= dt
  if (f.arm > 0) return
  const c = { x: f.x + 3, y: f.y + 3 }
  if (hostiles(g).some(e => Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < S.mine.trigger)) {
    detonateMine(g, f)
    f.life = 0
    f.done = true
  }
}

const stepMirror = (g, f) => {
  const p = g.player
  p.iframes = Math.max(p.iframes, 0.05)
  const box = { x: p.x - 8, y: p.y - 8, w: p.w + 16, h: p.h + 16 }
  for (const b of g.fireballs) {
    if (b.friendly || !overlap(b, box)) continue
    b.friendly = true
    b.vx *= -1.2
    b.vy = Math.min(b.vy * -1, -40)
    b.age = 0
  }
  if (f.spikes) for (const e of hostiles(g)) if (overlap(e, box)) hurt(g, e, 1, 'player')
}

const endMirror = (g, f) => {
  if (!f.burst) return
  const c = centre(g.player)
  for (const e of hostiles(g)) {
    const t = centre(e)
    const d = Math.hypot(t.x - c.x, t.y - c.y)
    if (d > 50 || e.heavy) continue
    e.vx = ((t.x - c.x) / Math.max(1, d)) * 200
    e.vy = -80
    e.shoved = 0.35
  }
}

const stepRepeat = (g, f) => {
  if (f.age < f.delay || f.done) return
  f.done = true
  f.life = 0
  SKILLS[f.skill](g, g.player)
}

const STEP = { well: stepWell, decoy: stepDecoy, drone: stepDrone, rod: stepRod, mine: stepMine, mirror: stepMirror, repeat: stepRepeat }
const END = { well: endWell, decoy: endDecoy, mirror: endMirror }

export const stepEffectList = (g, dt) => {
  for (const f of g.effects) {
    f.age += dt
    f.life -= dt
    STEP[f.kind]?.(g, f, dt)
    if (f.life <= 0 && !f.done) {
      f.done = true
      END[f.kind]?.(g, f)
    }
  }
  g.effects = g.effects.filter(f => f.life > 0)
}

export const decoyFor = g => g.effects.find(f => f.kind === 'decoy')

export const igniteAround = (g, x, y) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) ignite(g.world, x + dx, y + dy)
}
