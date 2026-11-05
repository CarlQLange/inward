import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { energize, explode, ignite, matAt, puff, setCell } from './world.js'
import { WORLD_PX, cell, centre, forEachCell, hitsSolid, moveAxis, overlap } from './physics.js'
import { burst, hurt } from './combat.js'
import {
  BREAKS, blowCell, boreCell, charmOne, crackWorld, foesOnSegment, freezeWaterAround, hammerLands, hammerStrikes, heat, hostile, lay, orbitFires, owns,
  recordPast, releaseMatter, returnedShot, ring, setAblaze, shoutFront, smash, strike, zap,
} from './skills.js'

const S = TUNING.skills

const nearest = (list, x, y, reach) => list
  .map(e => [Math.hypot(centre(e).x - x, centre(e).y - y), e])
  .filter(([d]) => d < reach)
  .sort((a, b) => a[0] - b[0])[0]?.[1]

const blast = (g, x, y, reach) => explode(g.world, cell(x), cell(y), reach)
const end = f => {
  f.life = 0
  f.done = true
}

const pullToward = (e, x, y, force, dt) => {
  const c = centre(e)
  const d = Math.max(4, Math.hypot(x - c.x, y - c.y))
  e.vx = (e.vx ?? 0) + ((x - c.x) / d) * force * dt
  e.vy = (e.vy ?? 0) + ((y - c.y) / d) * force * dt
}

const conducting = (g, x, y, reach) => {
  const [cx, cy, span] = [cell(x), cell(y), Math.ceil(reach / BLOCK)]
  let best = null
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      const d = Math.hypot(dx, dy) * BLOCK
      if (d < reach && d < (best?.d ?? Infinity) && props(matAt(g.world, cx + dx, cy + dy)).conductance) {
        best = { d, x: (cx + dx + 0.5) * BLOCK, y: (cy + dy + 0.5) * BLOCK }
      }
    }
  }
  return best
}

const stepGlobe = (g, f, dt) => {
  const B = S.bolt
  f.vx += Math.sin(f.age * 2.3) * 40 * dt
  f.vy += Math.cos(f.age * 3.1) * 40 * dt
  if (moveAxis(g.world, f, 'x', f.vx * dt)) f.vx *= -1
  if (moveAxis(g.world, f, 'y', f.vy * dt)) f.vy *= -1
  const c = centre(f)
  ignite(g.world, cell(c.x), cell(c.y))
  const m = matAt(g.world, cell(c.x), cell(c.y))
  if (props(m).conductance) {
    strike(g, c, c)
    burst(g, c.x, c.y, 'charge', 16)
    end(f)
    return
  }
  f.clock -= dt
  if (f.clock > 0) return
  const foe = nearest(hostile(g), c.x, c.y, B.globeReach)
  const target = foe ? centre(foe) : conducting(g, c.x, c.y, B.globeReach)
  if (!target) return
  f.clock = B.globeEvery
  strike(g, c, target)
  if (foe) {
    hurt(g, foe, 1, 'player')
    foe.stun = Math.max(foe.stun, 0.5)
  }
}

const stepNail = (g, f, dt) => {
  if (f.target) {
    if (f.target.hp <= 0) f.target = null
    else Object.assign(f, centre(f.target))
  }
  f.clock -= dt
  f.warning = f.clock < S.bolt.nailWarn
  if (f.clock > 0) return
  f.clock = S.bolt.nailEvery
  const [x, y] = [cell(f.x), cell(f.y)]
  let top = y
  while (top > 0 && !props(matAt(g.world, x, top - 1)).solid) top--
  const from = { x: f.x, y: top * BLOCK }
  foesOnSegment(g, from, f, 3).forEach(e => {
    hurt(g, e, S.bolt.nailDamage, 'player')
    e.stun = Math.max(e.stun, 0.8)
  })
  strike(g, from, { x: f.x, y: f.y + 2 })
  g.shake = Math.max(g.shake, 2)
}

const stepThrown = (g, f, dt) => {
  f.vy += f.gravity * dt
  const was = { x: f.x + f.w / 2, y: f.y + f.h / 2 }
  f.x += f.vx * dt
  f.y += f.vy * dt
  const c = centre(f)
  const m = matAt(g.world, cell(c.x), cell(c.y))
  const foe = hostile(g).find(e => overlap(f, e))
  if (foe || props(m).solid || (f.splashes && props(m).liquid)) {
    LANDS[f.lands](g, f, was, c, foe)
    end(f)
  }
}

const LANDS = {
  floe: (g, f, was, at, foe) => {
    const p = g.player
    const [x, y] = [cell(was.x), cell(was.y)]
    ;[[0, 0], [1, 0], [0, -1], [1, -1]].forEach(([dx, dy]) => {
      if (!props(matAt(g.world, x + dx, y + dy)).solid && matAt(g.world, x + dx, y + dy) !== M.WATER) setCell(g.world, x + dx, y + dy, M.FLOE)
    })
    const c = { x: (x + 1) * BLOCK, y: y * BLOCK }
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const m = matAt(g.world, x + dx, y + dy)
        if (m === M.LAVA) setCell(g.world, x + dx, y + dy, M.ROCK)
        else if (m === M.ROCK && owns(p, 'frost.brittle') && Math.random() < 0.5) setCell(g.world, x + dx, y + dy, M.SAND)
        else if (g.world.burn[(y + dy) * ROOM + x + dx] > 0) g.world.burn[(y + dy) * ROOM + x + dx] = 0
      }
    }
    if (foe) hurt(g, foe, 3, 'world')
    hostile(g).filter(e => Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < 20).forEach(e => {
      e.stun = Math.max(e.stun, S.frost.freeze)
      e.frozen = S.frost.freeze
      e.shatters = owns(p, 'frost.shatter')
    })
    burst(g, c.x, c.y, '#bff2ff', 18)
  },
  bore: (g, f, was) => {
    const speed = Math.max(1, Math.hypot(f.vx, f.vy))
    g.effects.push({ age: 0, kind: 'bore', x: was.x, y: was.y, dx: f.vx / speed, dy: f.vy / speed, life: 999, travelled: 0, open: 0 })
  },
  cloud: (g, f, was) => {
    g.effects.push({ age: 0, kind: 'cloud', x: was.x, y: was.y, rise: S.acid.cloudHeight, life: S.acid.cloudLife, clock: 0 })
    burst(g, was.x, was.y, '#8ae04a', 12)
  },
  slag: (g, f, was, at, foe) => {
    const p = g.player
    const [x, y] = [cell(at.x), cell(at.y)]
    const budget = { flashes: S.melt.flashes }
    if (foe) hurt(g, foe, 3, 'player')
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1]]) heat(g, p, x + dx, y + dy, budget)
    const [lx, ly] = [cell(was.x), cell(was.y)]
    ;[[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]].slice(0, S.melt.slagCells).forEach(([dx, dy]) => {
      if (!props(matAt(g.world, lx + dx, ly + dy)).solid) setCell(g.world, lx + dx, ly + dy, M.LAVA)
    })
    g.effects.push({ age: 0, kind: 'setting', x: was.x, y: was.y, life: S.melt.slagSet, sets: M.LAVA })
    burst(g, at.x, at.y, 'fire', 14)
  },
}

const stepFuse = (g, f) => {
  if (f.rider) {
    if (f.rider.hp <= 0) f.rider = null
    else Object.assign(f, { x: centre(f.rider).x, y: centre(f.rider).y })
  }
  burst(g, f.x, f.y, 'fire', 1)
}

const endFuse = (g, f) => blast(g, f.x, f.y, 2)

const stepHurl = (g, f, dt) => {
  const p = g.player
  const H = S.hammer
  const target = f.out ? null : centre(p)
  const dir = target ? (() => {
    const d = Math.max(1, Math.hypot(target.x - f.x, target.y - f.y))
    return { x: (target.x - f.x) / d, y: (target.y - f.y) / d }
  })() : f.aim
  f.x += dir.x * H.hurlSpeed * dt
  f.y += dir.y * H.hurlSpeed * dt
  f.travelled += H.hurlSpeed * dt
  f.spin = f.age * 18
  const [x, y] = [cell(f.x), cell(f.y)]
  const m = matAt(g.world, x, y)
  if (BREAKS.has(m)) {
    smash(g, x, y)
    if (!f.landed) hammerLands(g, p, x, y, null)
    f.landed = true
  } else if (f.out && props(m).solid) f.out = false
  const foe = g.enemies.find(e => overlap(e, { x: f.x - 4, y: f.y - 4, w: 8, h: 8 }) && e.iframes <= 0)
  if (foe) {
    hammerStrikes(g, p, foe, dir)
    if (!f.landed) hammerLands(g, p, x, y, foe)
    f.landed = true
  }
  if (f.out && f.travelled > H.hurlReach) f.out = false
  if (!f.out && target && Math.hypot(target.x - f.x, target.y - f.y) < 8) end(f)
}

const stepOrbit = (g, f, dt) => {
  const p = g.player
  const c = centre(p)
  f.clock -= dt
  if (f.firing && f.clock <= 0) {
    f.clock = S.repel.orbitEvery
    f.held -= 1
    orbitFires(g, p)
    if (f.held <= 0) {
      end(f)
      return
    }
  }
  f.tiles = Array.from({ length: f.held }, (_, i) => {
    const a = f.age * 4 + (i / f.held) * Math.PI * 2
    return { x: c.x + Math.cos(a) * S.repel.orbitRadius - 2, y: c.y + Math.sin(a) * S.repel.orbitRadius - 2, w: 4, h: 4 }
  })
  for (const tile of f.tiles) {
    const foe = hostile(g).find(e => overlap(e, tile))
    if (foe) hurt(g, foe, 1, 'player')
    g.fireballs.filter(b => !b.friendly && overlap(b, tile)).forEach(b => { b.age = -1 })
  }
}

const stepWisp = (g, f, dt) => {
  const E = S.ember
  const c = centre(f)
  const m = matAt(g.world, cell(c.x), cell(c.y))
  if (m === M.WATER) {
    puff(g.world, cell(c.x), cell(c.y) - 1, M.STEAM, TUNING.world.steamLife)
    end(f)
    return
  }
  const grounded = hitsSolid(g.world, { x: f.x, y: f.y + 1, w: f.w, h: f.h })
  if (grounded) {
    const fuel = fuelNear(g, c.x, c.y, E.wispSeek)
    if (fuel) f.dir = fuel.x < c.x ? -1 : 1
    f.vx = f.dir * E.wispSpeed
    f.vy = 0
  } else f.vy = Math.min(200, f.vy + TUNING.fireball.gravity * dt)
  if (moveAxis(g.world, f, 'x', f.vx * dt)) {
    if (grounded) f.vy = -E.wispSpeed * 2.2
    else f.vx = 0
    if (props(matAt(g.world, cell(c.x + f.dir * 6), cell(c.y))).flammability) ignite(g.world, cell(c.x + f.dir * 6), cell(c.y))
  }
  if (moveAxis(g.world, f, 'y', f.vy * dt)) f.vy = 0
  f.clock -= dt
  if (f.clock <= 0) {
    f.clock = 0.08
    ignite(g.world, cell(c.x), cell(c.y))
    ignite(g.world, cell(c.x), cell(c.y + 6))
    g.particles.push({ x: c.x, y: c.y, vx: 0, vy: -30, life: 0.3, colour: 'fire' })
  }
  const foe = hostile(g).find(e => overlap(e, f))
  if (foe) {
    hurt(g, foe, 2, 'player')
    if (owns(g.player, 'ember.torch')) setAblaze(g, foe)
  }
}

const endWisp = (g, f) => {
  if (owns(g.player, 'ember.comet')) blast(g, f.x, f.y, 1)
}

const fuelNear = (g, x, y, reach) => {
  const [cx, cy, span] = [cell(x), cell(y), Math.ceil(reach / BLOCK)]
  let best = null
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      const i = (cy + dy) * ROOM + cx + dx
      const here = matAt(g.world, cx + dx, cy + dy)
      if (dx !== 0 && props(here).flammability && !(g.world.burn[i] > 0) && (!best || Math.abs(dx) < Math.abs(best.dx))) best = { dx, x: (cx + dx + 0.5) * BLOCK }
    }
  }
  return best
}

const stepGlide = (g, f) => {
  const p = g.player
  if (p.vy < 0 || p.crouching) return
  const y = cell(p.y + p.h + 0.5)
  for (let x = cell(p.x); x <= cell(p.x + p.w - 0.01); x++) {
    const m = matAt(g.world, x, y)
    if (m === M.EMPTY || props(m).gas || props(m).liquid) {
      setCell(g.world, x, y, M.RIME, props(M.RIME).startLife)
      g.particles.push({ x: (x + 0.5) * BLOCK, y: y * BLOCK, vx: -p.vx * 0.2, vy: 10, life: 0.3, colour: '#bff2ff' })
    }
  }
}

const stepTwister = (g, f, dt) => {
  const G = S.gust
  const p = g.player
  f.x += f.dir * G.twisterSpeed * dt
  const ahead = props(matAt(g.world, cell(f.x + f.dir * 4), cell(f.y - 4))).solid
  if (ahead) f.dir *= -1
  let floor = cell(f.y - 4)
  while (floor < ROOM - 1 && !props(matAt(g.world, cell(f.x), floor + 1)).solid) floor++
  f.y = (floor + 1) * BLOCK
  const column = { x: f.x - 8, y: f.y - G.twisterHeight, w: 16, h: G.twisterHeight }
  const liftBody = e => {
    e.vy = -G.twisterLift
    e.vx = (e.vx ?? 0) * 0.8 + Math.sin(f.age * 9) * 40
    if (e !== p) e.shoved = 0.2
  }
  g.enemies.filter(e => !e.heavy && !e.friendly && overlap(e, column)).forEach(liftBody)
  if (overlap(p, column)) {
    p.vy = Math.min(p.vy, -G.twisterLift * 0.8)
    p.jumpHeld = false
  }
  g.fireballs.filter(b => overlap(b, column)).forEach(b => {
    b.vy = -60
    b.friendly = true
  })
  f.clock -= dt
  if (f.clock > 0) return
  f.clock = 0.1
  const moving = owns(p, 'gust.squall') ? [M.SMOKE, M.STEAM, M.METHANE, M.ASH, M.WATER, M.OIL, M.ACID] : [M.SMOKE, M.STEAM, M.METHANE, M.ASH]
  for (let y = cell(column.y); y <= cell(column.y + column.h - 1); y++) {
    for (let x = cell(column.x) - 1; x <= cell(column.x + column.w) + 1; x++) {
      if (g.world.burn[y * ROOM + x] > 0) f.fire = true
      if (moving.includes(matAt(g.world, x, y))) blowCell(g, x, y, f.dir, y > cell(column.y) + 1 ? -1 : 0, 1)
      if (f.fire) ignite(g.world, x, y)
      if (f.fire && owns(p, 'gust.bellows')) ignite(g.world, x + f.dir * 2, y)
    }
  }
}

const stepWell = (g, f, dt) => {
  const W = S.well
  const away = f.nova ? -1 : 1
  f.x += (f.vx ?? 0) * dt
  f.y += (f.vy ?? 0) * dt
  for (const e of g.enemies) {
    if (e.friendly || e.heavy || Math.hypot(centre(e).x - f.x, centre(e).y - f.y) > W.radius) continue
    pullToward(e, f.x, f.y, W.force * away, dt)
    e.shoved = Math.max(e.shoved, 0.1)
  }
  for (const b of g.fireballs) {
    if (Math.hypot(b.x - f.x, b.y - f.y) >= W.radius) continue
    pullToward(b, f.x, f.y, W.force * 1.5 * away, dt)
    if (f.nova) b.friendly = true
  }
  for (const b of g.flung) if (Math.hypot(b.x - f.x, b.y - f.y) < W.radius) pullToward(b, f.x, f.y, W.force * 1.5 * away, dt)
  const p = g.player
  if (f.nova && Math.hypot(centre(p).x - f.x, centre(p).y - f.y) < W.radius) {
    pullToward(p, f.x, f.y, -W.novaKick, dt)
    p.drift = Math.max(p.drift, 0.1)
  }
  f.tick = (f.tick ?? 0) + dt
  if (f.tick < 0.15) return
  f.tick = 0
  const cx = cell(f.x)
  const cy = cell(f.y)
  const reach = Math.floor(W.radius / BLOCK)
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      const m = matAt(g.world, x, y)
      const loose = m === M.SCRAP || (f.lodestone && (m === M.SAND || props(m).gas || m === M.WATER || m === M.OIL))
      if (!loose || Math.hypot(x - cx, y - cy) > reach) continue
      if (m === M.SCRAP) {
        const d = Math.max(1, Math.hypot(cx - x, cy - y))
        setCell(g.world, x, y, M.EMPTY)
        g.flung.push({ x: x * BLOCK, y: y * BLOCK, w: 8, h: 8, vx: ((cx - x) / d) * 140 * away, vy: ((cy - y) / d) * 140 * away, age: 0 })
      } else if (Math.random() < 0.4) {
        const nx = x + Math.sign(cx - x) * away
        const ny = y + Math.sign(cy - y) * away
        if (matAt(g.world, nx, ny) === M.EMPTY) {
          const life = g.world.life[y * ROOM + x]
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

const copyShots = (g, f) => {
  const here = { x: f.x + 4, y: f.y + 6 }
  const fresh = g.shots.filter(s => s.friendly && !s.copied)
  fresh.forEach(s => { s.copied = true })
  if (!f.clone) return
  g.shots.push(...fresh.map(s => ({ ...s, x: here.x, y: here.y, copied: true, passed: undefined })))
  if (fresh.length) g.particles.push({ x: here.x, y: here.y, vx: 0, vy: 0, life: 0.1, colour: 'magnet' })
}

const runDecoy = (g, f, dt) => {
  const box = { x: f.x, y: f.y, w: 8, h: 16 }
  f.vy = Math.min(TUNING.player.maxFall, f.vy + TUNING.player.gravity * dt)
  if (moveAxis(g.world, box, 'x', f.dir * S.decoy.runSpeed * dt)) f.dir *= -1
  if (moveAxis(g.world, box, 'y', f.vy * dt)) f.vy = 0
  f.x = Math.max(BLOCK, Math.min(WORLD_PX - BLOCK * 2, box.x))
  f.y = box.y
}

const stepDecoy = (g, f, dt) => {
  copyShots(g, f)
  if (f.runner) runDecoy(g, f, dt)
  f.tick = (f.tick ?? 0) + dt
  if (f.gas && f.tick > 0.25) {
    f.tick = 0
    puff(g.world, cell(f.x + 4), cell(f.y + 4), M.METHANE, [6, 10])
  }
}

const stepLure = (g, f) => {
  const e = f.follow
  if (!e || e.hp <= 0 || (!e.ally && !e.goat)) {
    end(f)
    return
  }
  f.x = e.x
  f.y = e.y
  hostile(g).filter(o => o !== e && overlap(o, e) && e.iframes <= 0).forEach(() => hurt(g, e, 1, 'world'))
}

const droneFire = (g, f, target) => {
  const t = centre(target)
  const d = Math.max(1, Math.hypot(t.x - f.x, t.y - f.y))
  if (f.sparks) {
    zap(g, { x: f.x, y: f.y }, t)
    hurt(g, target, 1, 'player')
    energize(g.world, cell(t.x), cell(t.y + 6), 14)
  } else if (f.embers) {
    g.fireballs.push({ x: f.x, y: f.y, w: 4, h: 4, vx: ((t.x - f.x) / d) * 150, vy: ((t.y - f.y) / d) * 150 - 40, age: 0, friendly: true })
  } else {
    g.shots.push({ x: f.x, y: f.y, w: 2, h: 2, vx: ((t.x - f.x) / d) * 220, vy: ((t.y - f.y) / d) * 220, life: 0.7, friendly: true, copied: true })
  }
}

const sapperBursts = (g, f) => {
  const c = { x: f.x + 4, y: f.y + 4 }
  blast(g, c.x, c.y, 2)
  if (f.sparks) {
    hostile(g).filter(e => Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < 70).forEach(e => {
      zap(g, c, centre(e))
      hurt(g, e, 2, 'player')
    })
    energize(g.world, cell(c.x), cell(c.y + 8), S.bolt.energy)
  }
  if (f.embers) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) puff(g.world, cell(c.x) + dx, cell(c.y) + dy, M.OIL, [1, 1])
    for (let dx = -3; dx <= 3; dx++) ignite(g.world, cell(c.x) + dx, cell(c.y))
  }
  end(f)
}

const stepSapper = (g, f, dt) => {
  const target = nearest(hostile(g), f.x, f.y, Infinity)
  const p = g.player
  const c = target ? centre(target) : { x: p.x + Math.cos(g.time * 2.4) * 16, y: p.y - 8 }
  const d = Math.max(1, Math.hypot(c.x - f.x, c.y - f.y))
  const speed = target ? S.drone.sapperSpeed : d * 4
  f.x += ((c.x - f.x) / d) * speed * dt
  f.y += ((c.y - f.y) / d) * speed * dt
  if (target && overlap({ x: f.x, y: f.y, w: 8, h: 8 }, target)) sapperBursts(g, f)
}

const endDrone = (g, f) => {
  if (f.sapper) sapperBursts(g, f)
}

const stepMoleDrone = (g, f, dt) => {
  const target = nearest(hostile(g), f.x, f.y, S.drone.range)
  const c = target ? centre(target) : null
  const steer = c ? { x: (c.x - f.x) / Math.max(1, Math.hypot(c.x - f.x, c.y - f.y)), y: (c.y - f.y) / Math.max(1, Math.hypot(c.x - f.x, c.y - f.y)) } : f.aim
  f.x = Math.max(BLOCK * 1.5, Math.min(WORLD_PX - BLOCK * 1.5, f.x + steer.x * S.drone.moleSpeed * dt))
  f.y = Math.max(BLOCK * 1.5, Math.min(WORLD_PX - BLOCK * 1.5, f.y + steer.y * S.drone.moleSpeed * dt))
  ;[[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => {
    const [x, y] = [cell(f.x) + dx, cell(f.y) + dy]
    if (BREAKS.has(matAt(g.world, x, y))) smash(g, x, y)
  })
  f.reload -= dt
  if (f.reload > 0 || !target) return
  f.reload = S.drone.fireEvery
  droneFire(g, f, target)
}

const stepDrone = (g, f, dt) => {
  if (f.sapper) {
    stepSapper(g, f, dt)
    return
  }
  if (f.mole) {
    stepMoleDrone(g, f, dt)
    return
  }
  const p = g.player
  const a = g.time * 2.4 + f.phase
  f.x += (p.x + Math.cos(a) * 16 - f.x) * Math.min(1, dt * 6)
  f.y += (p.y - 8 + Math.sin(a) * 8 - f.y) * Math.min(1, dt * 6)
  f.reload -= dt
  if (f.reload > 0) return
  const target = nearest(hostile(g), f.x, f.y, S.drone.range)
  if (!target) return
  f.reload = S.drone.fireEvery
  droneFire(g, f, target)
}

const stepRod = (g, f, dt) => {
  const R = S.rod
  const top = { x: f.x + 4, y: f.y + 1 }
  const mid = { x: f.x + 4, y: f.y + 9 }
  if (f.magnet) {
    g.enemies.filter(e => e.magnetic && !e.heavy && Math.hypot(centre(e).x - top.x, centre(e).y - top.y) < R.pullReach).forEach(e => {
      pullToward(e, top.x, top.y, R.pull, dt)
      e.shoved = Math.max(e.shoved, 0.1)
    })
    g.fireballs.filter(b => b.pellet && Math.hypot(b.x - top.x, b.y - top.y) < R.pullReach).forEach(b => pullToward(b, top.x, top.y, R.pull, dt))
  }
  const partner = f.fence && g.effects.find(o => o.kind === 'rod' && o !== f && o.life > 0)
  if (partner) {
    const other = { x: partner.x + 4, y: partner.y + 9 }
    f.partner = other
    foesOnSegment(g, mid, other, 2).forEach(e => {
      hurt(g, e, R.fenceDamage, 'player')
      e.stun = Math.max(e.stun, 0.4)
    })
  } else f.partner = null
  f.reload -= dt
  if (f.reload > 0) return
  f.reload = R.pulseEvery
  energize(g.world, f.cx, f.cy, R.energy)
  if (f.grounded) {
    forEachCell((x, y) => {
      if (Math.abs(y - f.cy) <= 1 && Math.abs(x - f.cx) <= 6 && props(matAt(g.world, x, y)).solid && matAt(g.world, x, y) !== M.BEDROCK && g.world.refractory[y * ROOM + x] <= 0) {
        g.world.charge[y * ROOM + x] = 0.2
      }
    })
  }
  burst(g, top.x, top.y, f.magnet ? 'hurt' : 'charge', 4)
  if (partner) zap(g, mid, f.partner)
  if (f.magnet) {
    const scrap = []
    forEachCell((x, y) => { if (matAt(g.world, x, y) === M.SCRAP && Math.hypot((x + 0.5) * BLOCK - top.x, (y + 0.5) * BLOCK - top.y) < R.pullReach) scrap.push([x, y]) })
    scrap.slice(0, 3).forEach(([x, y]) => {
      const d = Math.max(1, Math.hypot((x + 0.5) * BLOCK - top.x, (y + 0.5) * BLOCK - top.y))
      setCell(g.world, x, y, M.EMPTY)
      g.flung.push({ x: x * BLOCK, y: y * BLOCK, w: 8, h: 8, vx: ((top.x - x * BLOCK) / d) * 180, vy: ((top.y - y * BLOCK) / d) * 180 - 20, age: 0, safe: true })
    })
  }
  if (!f.arcs) return
  const target = nearest(hostile(g), top.x, top.y, R.range)
  if (!target) return
  zap(g, top, centre(target))
  hurt(g, target, 1)
  target.stun = Math.max(target.stun, 0.5)
}

const detonateMine = (g, f, at = { x: f.x + 3, y: f.y + 3 }) => {
  const radius = S.mine.radius
  const near = hostile(g).filter(e => Math.hypot(centre(e).x - at.x, centre(e).y - at.y) < radius)
  if (f.cryo) {
    near.forEach(e => {
      e.stun = Math.max(e.stun, S.frost.freeze)
      e.frozen = S.frost.freeze
    })
    freezeWaterAround(g, at.x, at.y, Math.ceil(radius / BLOCK))
    ring(g, at.x, at.y, '#bff2ff', 24, 120)
    forEachCell((x, y, point) => {
      if (Math.hypot(point.x - at.x, point.y - at.y) < radius && g.world.burn[y * ROOM + x] > 0) g.world.burn[y * ROOM + x] = 0
    })
    return
  }
  near.forEach(e => hurt(g, e, S.mine.damage))
  if (f.gas) {
    for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) puff(g.world, cell(at.x) + dx, cell(at.y) + dy, M.METHANE, [2, 4])
  }
  blast(g, at.x, at.y, 2)
}

const stepMine = (g, f, dt) => {
  if (f.rider) {
    if (f.rider.hp <= 0) f.rider = null
    else Object.assign(f, { x: centre(f.rider).x - 3, y: centre(f.rider).y - 3 })
  }
  f.arm -= dt
  if (f.arm > 0) return
  if (f.rider) {
    detonateMine(g, f)
    end(f)
    return
  }
  const c = { x: f.x + 3, y: f.y + 3 }
  const crossed = f.wire && foesOnSegment(g, f.anchor, f.wire, 0)[0]
  if (crossed) {
    detonateMine(g, f, centre(crossed))
    end(f)
  } else if (hostile(g).some(e => Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < S.mine.trigger)) {
    detonateMine(g, f)
    end(f)
  }
}

const bounced = (g, p, b) => {
  b.friendly = true
  b.age = 0
  returnedShot(g, p, b)
}

const stepMirror = (g, f) => {
  const p = g.player
  p.iframes = Math.max(p.iframes, 0.05)
  const box = { x: p.x - 8, y: p.y - 8, w: p.w + 16, h: p.h + 16 }
  for (const b of g.fireballs) {
    if (b.friendly || !overlap(b, box)) continue
    if (f.maw) {
      b.age = -1
      f.swallowed += 1
      burst(g, centre(p).x, centre(p).y, 'hurt', 4)
      continue
    }
    b.vx *= -1.2
    b.vy = Math.min(b.vy * -1, -40)
    bounced(g, p, b)
  }
}

const endMirror = (g, f) => {
  const p = g.player
  const c = centre(p)
  if (!f.maw) return
  for (let i = 0; i < f.swallowed; i++) {
    const a = Math.atan2(p.aim.y, p.aim.x) + (i - (f.swallowed - 1) / 2) * 0.22
    const shot = { x: c.x - 2, y: c.y - 2, w: 3, h: 3, vx: Math.cos(a) * S.mirror.shotReturn, vy: Math.sin(a) * S.mirror.shotReturn, age: 0, straight: true, pellet: true, friendly: true }
    returnedShot(g, p, shot)
    g.fireballs.push(shot)
  }
  ring(g, c.x, c.y, '#ff5a4a', 16, 90)
}

const stepPane = (g, f) => {
  const half = S.mirror.paneHalf
  const across = { x: -f.ny, y: f.nx }
  const crossing = b => {
    const c = centre(b)
    const [dx, dy] = [c.x - f.x, c.y - f.y]
    const along = dx * across.x + dy * across.y
    const depth = dx * f.nx + dy * f.ny
    const toward = b.vx * f.nx + b.vy * f.ny
    return Math.abs(along) < half && Math.abs(depth) < 5 && toward * depth < 0
  }
  const reflect = b => {
    const v = b.vx * f.nx + b.vy * f.ny
    b.vx -= 2 * v * f.nx
    b.vy -= 2 * v * f.ny
  }
  for (const b of g.fireballs) {
    if (!crossing(b)) continue
    reflect(b)
    bounced(g, g.player, b)
  }
  for (const s of g.shots) {
    if (!crossing(s)) continue
    reflect(s)
    s.life = Math.max(s.life, TUNING.player.shotLife)
    s.friendly = true
    returnedShot(g, g.player, { ...s, w: s.w, h: s.h })
    if (owns(g.player, 'mirror.blaze')) g.fireballs.push({ x: s.x, y: s.y, w: 3, h: 3, vx: s.vx, vy: s.vy, age: 0, straight: true, friendly: true })
  }
  for (const b of g.flung) if (crossing(b)) reflect(b)
}

const stepSpan = (g, f, dt) => {
  f.clock -= dt
  while (f.clock <= 0 && !f.done) {
    f.clock += f.step
    const [x, y] = [cell(f.x), cell(f.y)]
    const solid = props(matAt(g.world, x, y)).solid
    const blocked = solid && (f.laid > 0 || f.skipped >= 3)
    if (f.laid >= f.most || blocked || x < 1 || y < 1 || x > ROOM - 2 || y > ROOM - 2) {
      end(f)
      return
    }
    if (solid) f.skipped += 1
    else if (lay(g, g.player, x, y, f.material)) {
      f.laid += 1
      if (f.vines && f.laid % 3 === 0 && matAt(g.world, x, y + 1) === M.EMPTY) setCell(g.world, x, y + 1, M.VINE, 0)
    }
    f.x += f.dx * BLOCK
    f.y += f.dy * BLOCK
  }
}

const stepFlytrap = (g, f, dt) => {
  const T = S.seed
  if (matAt(g.world, f.cx, f.cy) !== M.VINE) {
    end(f)
    return
  }
  if (f.held) stepHeldFoe(g, f, dt)
  f.reload -= dt
  if (f.reload > 0 || f.held) return
  const shot = g.fireballs.find(b => !b.friendly && Math.hypot(b.x - f.x, b.y - f.y) < T.trapReach)
  if (shot) {
    shot.age = -1
    f.ammo = (f.ammo ?? 0) + 1
    f.reload = 0.2
    f.bite = 0.25
  }
  const foe = nearest(hostile(g).filter(e => !e.heavy), f.x, f.y, T.trapReach)
  if (foe) {
    f.held = foe
    f.chew = T.trapChew
    f.bite = 0.25
    burst(g, f.x, f.y, '#8ad05a', 10)
    return
  }
  if (f.ammo > 0) spitAmmo(g, f)
}

const spitAmmo = (g, f) => {
  const target = nearest(hostile(g), f.x, f.y, Infinity)
  if (!target) return
  const t = centre(target)
  const d = Math.max(1, Math.hypot(t.x - f.x, t.y - f.y))
  g.fireballs.push({ x: f.x, y: f.y - 8, w: 4, h: 4, vx: ((t.x - f.x) / d) * S.seed.trapSpit, vy: ((t.y - f.y + 8) / d) * S.seed.trapSpit, age: 0, friendly: true, straight: true })
  f.ammo -= 1
  f.reload = 0.5
}

const stepHeldFoe = (g, f, dt) => {
  const T = S.seed
  const e = f.held
  if (e.hp <= 0) {
    f.held = null
    return
  }
  e.x = f.x - e.w / 2
  e.y = f.y - e.h - 2
  e.vx = 0
  e.vy = 0
  e.stun = Math.max(e.stun, 0.2)
  f.chew -= dt
  if (f.chew > 0) return
  hurt(g, e, 2, 'world')
  const victim = nearest(hostile(g).filter(o => o !== e), f.x, f.y, Infinity)
  const to = victim ? centre(victim) : { x: f.x + (Math.random() < 0.5 ? -60 : 60), y: f.y - 40 }
  const d = Math.max(1, Math.hypot(to.x - f.x, to.y - f.y))
  e.vx = ((to.x - f.x) / d) * T.trapSpit
  e.vy = ((to.y - f.y) / d) * T.trapSpit - 40
  e.shoved = 0.5
  e.stun = 0
  f.held = null
  f.reload = T.trapReload
  f.bite = 0.25
  burst(g, f.x, f.y - 8, '#8ad05a', 12)
}

const endFlytrap = (g, f) => {
  if (f.held) f.held.stun = 0
}

const launchColumn = (g, f, top) => {
  const column = { x: f.cx * BLOCK, y: top * BLOCK, w: BLOCK, h: (f.floor - top + 1) * BLOCK }
  const p = g.player
  g.enemies.filter(e => !e.heavy && !e.friendly && overlap(e, column)).forEach(e => {
    e.vy = -S.spring.lift
    e.shoved = 0.45
  })
  if (overlap(p, column)) {
    p.vy = -S.spring.lift
    p.jumpHeld = false
    p.drift = 0.1
  }
}

const stepGeyser = (g, f, dt) => {
  f.clock -= dt
  if (f.clock > 0) return
  f.clock = 0.03
  if (f.height < S.spring.geyserHeight) {
    const y = f.floor - f.height
    if (props(matAt(g.world, f.cx, y)).solid) f.height = S.spring.geyserHeight
    else {
      setCell(g.world, f.cx, y, f.liquid)
      f.height += 1
    }
    g.particles.push({ x: (f.cx + 0.5) * BLOCK, y: y * BLOCK, vx: (Math.random() - 0.5) * 60, vy: -80, life: 0.4, colour: '#f4f8f2' })
  }
  launchColumn(g, f, f.floor - f.height)
}

const endGeyser = (g, f) => {
  if (owns(g.player, 'spring.slush')) freezeWaterAround(g, (f.cx + 0.5) * BLOCK, (f.floor - 4) * BLOCK, S.spring.setRadius + 1)
}

const stepFont = (g, f, dt) => {
  f.clock -= dt
  if (f.clock > 0) return
  f.clock = S.spring.fontEvery
  if (matAt(g.world, f.cx, f.cy) === M.EMPTY) setCell(g.world, f.cx, f.cy, f.liquid)
  if (Math.random() < 0.5 && matAt(g.world, f.cx, f.cy + 1) === M.EMPTY) setCell(g.world, f.cx, f.cy + 1, f.liquid)
  f.since = (f.since ?? 0) + S.spring.fontEvery
  if (owns(g.player, 'spring.slush') && f.since > S.spring.setAfter) {
    f.since = 0
    freezeWaterAround(g, f.x, f.y + BLOCK * 2, S.spring.setRadius)
  }
}

const endSetting = (g, f) => {
  if (f.sets === M.LAVA) {
    const [cx, cy] = [cell(f.x), cell(f.y)]
    for (let dy = -3; dy <= 4; dy++) {
      for (let dx = -3; dx <= 3; dx++) if (matAt(g.world, cx + dx, cy + dy) === M.LAVA) setCell(g.world, cx + dx, cy + dy, M.ROCK)
    }
    return
  }
  freezeWaterAround(g, f.x, f.y, S.spring.setRadius)
}

const stepBore = (g, f, dt) => {
  const A = S.acid
  f.travelled += A.boreSpeed * dt
  f.x += f.dx * A.boreSpeed * dt
  f.y += f.dy * A.boreSpeed * dt
  const across = { x: -f.dy, y: f.dx }
  const cells = [[0, 0], [1, 1]].map(([k]) => [cell(f.x + across.x * k * BLOCK), cell(f.y + across.y * k * BLOCK)])
  const passable = cells.map(([x, y]) => boreCell(g, x, y))
  if (Math.random() < 0.15 && matAt(g.world, cells[0][0], cells[0][1]) === M.EMPTY) setCell(g.world, cells[0][0], cells[0][1], M.ACID)
  hostile(g).filter(e => overlap(e, { x: f.x - 4, y: f.y - 4, w: 8, h: 8 })).forEach(e => hurt(g, e, 1, 'world', 'ACID'))
  if (!passable[0] || f.travelled > A.boreMost * BLOCK) end(f)
}

const stepCloud = (g, f, dt) => {
  const A = S.acid
  const above = props(matAt(g.world, cell(f.x), cell(f.y - 6))).solid
  if (!above && f.rise > 0) {
    f.y -= 40 * dt
    f.rise -= 40 * dt
  }
  f.x += Math.sin(f.age * 1.4) * 12 * dt
  f.clock -= dt
  if (f.clock > 0) return
  f.clock = A.cloudEvery
  const x = cell(f.x + (Math.random() - 0.5) * 18)
  const y = cell(f.y + 6)
  if (matAt(g.world, x, y) === M.EMPTY) setCell(g.world, x, y, M.ACID)
}

const stepFissure = (g, f, dt) => {
  const M_ = S.melt
  f.clock -= dt
  while (f.clock <= 0 && !f.done) {
    f.clock += M_.fissureStep
    if (f.laid >= M_.fissureMost) {
      end(f)
      return
    }
    f.x += f.dir
    const surface = [-1, -2, 0, 1, 2, 3].map(dy => f.y + dy).find(y => props(matAt(g.world, f.x, y)).solid && !props(matAt(g.world, f.x, y - 1)).solid)
    if (surface === undefined || matAt(g.world, f.x, surface) === M.BEDROCK) {
      end(f)
      return
    }
    f.y = surface
    heat(g, g.player, f.x, surface, f.budget)
    heat(g, g.player, f.x, surface + 1, f.budget)
    ignite(g.world, f.x, surface - 1)
    burst(g, (f.x + 0.5) * BLOCK, surface * BLOCK, 'fire', 4)
    g.shake = Math.max(g.shake, 2)
    f.laid += 1
  }
}

const stepContagion = (g, f, dt) => {
  const A = S.alchemy
  f.clock -= dt
  if (f.clock > 0) return
  f.clock = A.spreadStep
  const next = []
  for (const [x, y] of f.frontier) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      if (matAt(g.world, x + dx, y + dy) !== f.from || f.laid >= A.spreadMost) continue
      setCell(g.world, x + dx, y + dy, f.to)
      f.laid += 1
      next.push([x + dx, y + dy])
      g.particles.push({ x: (x + dx + 0.5) * BLOCK, y: (y + dy + 0.5) * BLOCK, vx: 0, vy: -20, life: 0.3, colour: '#8ae04a' })
    }
  }
  f.frontier = next
  if (next.length === 0) end(f)
}

const stepTether = (g, f, dt) => {
  const G = S.grapple
  const p = g.player
  if (f.a.hp <= 0 || f.b?.hp <= 0) {
    end(f)
    return
  }
  const from = centre(f.a)
  const to = f.b ? centre(f.b) : f.point
  f.from = from
  f.to = to ?? centre(p)
  if (!to) return
  const d = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y))
  const pull = { x: (to.x - from.x) / d, y: (to.y - from.y) / d }
  const haul = (e, dir) => {
    if (e.heavy) return
    moveAxis(g.world, e, 'x', dir.x * G.tetherPull * dt)
    moveAxis(g.world, e, 'y', dir.y * G.tetherPull * dt)
    e.stun = Math.max(e.stun, 0.2)
    e.vy = 0
  }
  if (d > 6) haul(f.a, pull)
  if (f.b && d > 6) haul(f.b, { x: -pull.x, y: -pull.y })
  if (f.b && overlap(f.a, f.b)) {
    f.a.iframes = 0
    f.b.iframes = 0
    hurt(g, f.a, G.tetherDamage, 'world')
    hurt(g, f.b, G.tetherDamage, 'world')
    ring(g, from.x, from.y, '#c79ae0', 16, 90)
    g.shake = Math.max(g.shake, 4)
    if (owns(p, 'grapple.taser')) energize(g.world, cell(from.x), cell(from.y + 6), S.bolt.energy / 2)
    end(f)
  }
  f.clock = (f.clock ?? 0) - dt
  if (f.clock > 0) return
  f.clock = 0.6
  if (owns(p, 'grapple.taser')) {
    zap(g, from, to)
    hurt(g, f.a, 1, 'player')
    if (f.b) hurt(g, f.b, 1, 'player')
  }
  if (owns(p, 'grapple.wick')) {
    setAblaze(g, f.a)
    if (f.b) setAblaze(g, f.b)
  }
}

const stepWraith = (g, f) => {
  const i = Math.min(f.path.length - 1, Math.floor(f.age / 0.1))
  Object.assign(f, f.path[i])
  hostile(g).filter(e => overlap(e, f)).forEach(e => {
    hurt(g, e, S.rewind.wraithDamage, 'player')
    e.stun = Math.max(e.stun, 0.5)
  })
}

const stepShout = (g, f, dt) => {
  const R = S.roar
  f.clock -= dt
  while (f.clock <= 0 && !f.done) {
    f.clock += R.shoutStep
    f.x += f.aim.x * BLOCK
    f.y += f.aim.y * BLOCK
    f.travelled += BLOCK
    shoutFront(g, g.player, f)
    g.particles.push({ x: f.x, y: f.y, vx: f.aim.x * 40, vy: f.aim.y * 40, life: 0.25, colour: '#f4f8f2' })
    if (f.travelled > R.shoutRange || cell(f.x) < 1 || cell(f.y) < 1 || cell(f.x) > ROOM - 2 || cell(f.y) > ROOM - 2) end(f)
  }
}

const endMatter = g => releaseMatter(g)

const STEP = {
  well: stepWell, decoy: stepDecoy, drone: stepDrone, rod: stepRod, mine: stepMine, mirror: stepMirror,
  globe: stepGlobe, nail: stepNail, thrown: stepThrown, fuse: stepFuse, hurl: stepHurl, orbit: stepOrbit, wisp: stepWisp, glide: stepGlide,
  twister: stepTwister, lure: stepLure, pane: stepPane, span: stepSpan, flytrap: stepFlytrap, geyser: stepGeyser, font: stepFont,
  bore: stepBore, cloud: stepCloud, fissure: stepFissure, contagion: stepContagion, tether: stepTether, wraith: stepWraith, shout: stepShout,
}
const END = {
  well: endWell, decoy: endDecoy, mirror: endMirror, fuse: endFuse, wisp: endWisp, drone: endDrone, flytrap: endFlytrap,
  geyser: endGeyser, setting: endSetting, still: endMatter,
}

const stepAblaze = (g, e, dt) => {
  const E = S.ember
  e.ablaze -= dt
  const c = centre(e)
  if (matAt(g.world, cell(c.x), cell(c.y)) === M.WATER) {
    e.ablaze = 0
    return
  }
  ignite(g.world, cell(c.x), cell(e.y + e.h + 2))
  ignite(g.world, cell(c.x), cell(c.y))
  if (Math.random() < dt * 14) g.particles.push({ x: c.x, y: e.y, vx: (Math.random() - 0.5) * 30, vy: -40, life: 0.3, colour: 'fire' })
  e.ablazeClock += dt
  if (e.ablazeClock > E.torchEvery) {
    e.ablazeClock = 0
    hurt(g, e, 1, 'world', 'FIRE')
  }
  g.enemies.filter(o => o !== e && !o.friendly && !o.ablaze && overlap(o, e)).forEach(o => setAblaze(g, o))
}

const stepAlly = (g, e, dt) => {
  const p = g.player
  if (e.plague) {
    hostile(g).filter(o => !o.heavy && overlap(o, e)).forEach(o => charmOne(g, o, p))
  }
  if (e.volt > 0) {
    e.volt -= dt
    if (e.volt > 0) return
    e.volt = S.charm.voltEvery
    const c = centre(e)
    const target = nearest(hostile(g), c.x, c.y, S.charm.voltReach)
    energize(g.world, cell(c.x), cell(e.y + e.h + 2), TUNING.enemies.elite.chargeEnergy)
    burst(g, c.x, c.y, 'charge', 5)
    if (!target) return
    zap(g, c, centre(target))
    hurt(g, target, 1, 'world')
  }
}

const stepCreatures = (g, dt) => {
  if (g.evolving) g.evolving.life -= dt
  for (const e of g.enemies) {
    if (e.ablaze > 0) stepAblaze(g, e, dt)
    if (e.ally > 0) stepAlly(g, e, dt)
    if (e.goat > 0) e.goat -= dt
  }
  for (const f of g.flung) if (f.charged && Math.random() < dt * 30) g.particles.push({ x: f.x + Math.random() * 8, y: f.y + Math.random() * 8, vx: 0, vy: 0, life: 0.1, colour: 'charge' })
}

const stepHeldTime = g => {
  const p = g.player
  const holding = g.timeStop > 0 || g.effects.some(f => f.kind === 'still' || f.kind === 'hold')
  if (holding && owns(p, 'stop.hang')) {
    g.shots.filter(s => s.friendly && !s.hung).forEach(s => {
      s.hung = { vx: s.vx, vy: s.vy }
      s.vx = 0
      s.vy = 0
      s.life = 99
    })
  }
  if (!holding && g.wasHolding) {
    g.shots.filter(s => s.hung).forEach(s => {
      Object.assign(s, s.hung, { hung: null, life: TUNING.player.shotLife })
    })
    if (owns(p, 'stop.quake')) crackWorld(g)
  }
  g.wasHolding = holding
}

export const stepEffectList = (g, dt) => {
  stepHeldTime(g)
  stepCreatures(g, dt)
  recordPast(g, dt)
  for (const f of g.effects) {
    f.age += dt
    f.life -= dt
    if (!f.done) STEP[f.kind]?.(g, f, dt)
    if (f.life <= 0 && !f.finished) {
      f.finished = true
      if (!f.done || f.kind === 'still') END[f.kind]?.(g, f)
      f.done = true
    }
  }
  g.effects = g.effects.filter(f => f.life > 0)
}

export const decoyFor = g => g.effects.find(f => f.kind === 'decoy' || f.kind === 'lure')

export const igniteAround = (g, x, y) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) ignite(g.world, x + dx, y + dy)
}

