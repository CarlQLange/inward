import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { burningAt, chargedAt, crushingAt, energize, explode, ignite, lavaAt, matAt, puff, setCell } from './world.js'
import { WORLD_PX, cell, centre, forEachCell, hitsSolid, moveAxis, overlap } from './physics.js'
import { burst, hurt } from './combat.js'
import { MATERIAL_COLOURS, chipsAt, drop, fuseSpark, ripple, splash } from './fx.js'
import {
  BREAKS, blowCell, boreCell, charmOne, crackWorld, foesOnSegment, footCell, freezeWaterAround, hammerCell, hammerLands, hammerStrikes, heat, hostile, lay, lightFuse, muzzle,
  orbitFires, owns, prey, recordPast, releaseMatter, ring, ringBell, setAblaze, settleFuse, shardAt, shoutFront, smash, spend, spill, stepCascade, stepRoots, strike, turnToGlass, zap,
} from './skills.js'
import { endFloat, stepFloat } from './float.js'
import { endLink, stepLink } from './link.js'
import { clodLands, endKiln, stepBall, stepDaub, stepKiln } from './earth.js'
import { beamSparks, pealRings } from './matter.js'

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
  splash: (g, f, was, at, foe) => {
    splash(g, was.x, was.y, 120, f.colour)
    if (f.bottle) {
      plantBottle(g, f, was, foe)
      return
    }
    if (foe) {
      hurt(g, foe, S.flask.damage, 'player')
      foe.stun = Math.max(foe.stun, S.flask.stun)
    }
    if (foe && f.drip) coat(foe, f.mat, f.cells)
    else spill(g, cell(was.x), cell(was.y), f.mat, f.cells)
  },
  drop: (g, f, was, at, foe) => {
    if (foe && f.drip) coat(foe, f.mat, 1)
    else spill(g, cell(was.x), cell(was.y), f.mat, 1)
  },
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
  clod: (...args) => clodLands(...args),
}

const coat = (e, mat, cells) => {
  e.coat = { mat, cells: (e.coat?.mat === mat ? e.coat.cells : 0) + cells, clock: 0 }
}

const breakBottle = (g, f) => {
  if (f.done) return
  end(f)
  chipsAt(g, f.x, f.y, M.ICE, 5)
  splash(g, f.x, f.y, 90, MATERIAL_COLOURS[f.mat]?.[0])
  if (f.rider && f.rider.hp > 0 && f.drip) coat(f.rider, f.mat, f.cells)
  else spill(g, cell(f.x), cell(f.y), f.mat, f.cells)
}

const plantBottle = (g, f, at, foe) => {
  const standing = g.effects.filter(o => o.kind === 'bottle' && !o.done)
  standing.slice(0, Math.max(0, standing.length - S.flask.bottles + 1)).forEach(o => breakBottle(g, o))
  const c = foe ? centre(foe) : at
  g.effects.push({
    age: 0, kind: 'bottle', x: at.x, y: at.y, mat: f.mat, cells: f.cells, drip: f.drip, colour: f.colour,
    rider: foe ?? null, offset: { x: at.x - c.x, y: at.y - c.y }, falling: false, vy: 0, life: S.flask.bottleLife,
  })
}

const NEAR = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]

const heated = (w, x, y) => NEAR.some(([dx, dy]) => burningAt(w, x + dx, y + dy) || lavaAt(w, x + dx, y + dy)) || crushingAt(w, x, y)

const stepBottle = (g, f, dt) => {
  if (f.rider) {
    if (f.rider.hp <= 0) {
      f.rider = null
      f.falling = true
    } else Object.assign(f, { x: centre(f.rider).x + f.offset.x, y: centre(f.rider).y + f.offset.y })
  } else if (f.falling) {
    f.vy = Math.min(220, f.vy + TUNING.fireball.gravity * dt)
    if (props(matAt(g.world, cell(f.x), cell(f.y + f.vy * dt + 3))).solid) f.falling = false
    else f.y += f.vy * dt
  }
  const box = { x: f.x - 3, y: f.y - 3, w: 6, h: 6 }
  const shot = g.shots.find(s => overlap(s, box))
  if (shot) shot.life = 0
  const struck = shot || g.fireballs.some(b => overlap(b, box)) || g.flung.some(b => overlap(b, box)) || (f.rider && f.rider.iframes > 0 && f.age > 0.1)
  if (struck || heated(g.world, cell(f.x), cell(f.y))) breakBottle(g, f)
}

const breakBottlesNear = (g, x, y, reach) => g.effects
  .filter(o => o.kind === 'bottle' && !o.done && Math.hypot(o.x - x, o.y - y) < reach)
  .forEach(o => breakBottle(g, o))

const fuseBox = ([x, y], margin = 0) => ({ x: x * BLOCK - margin, y: y * BLOCK - margin, w: BLOCK + margin * 2, h: BLOCK + margin * 2 })

const snuffs = (g, [x, y]) => {
  const p = props(matAt(g.world, x, y))
  return !p.flammability && !p.hot && (p.liquid || p.solid)
}

const bake = (g, [x, y]) => {
  const m = matAt(g.world, x, y)
  if (m !== M.EMPTY && !props(m).gas) return
  const box = fuseBox([x, y])
  if (overlap(g.player, box) || g.enemies.some(e => overlap(e, box))) return
  setCell(g.world, x, y, M.BRICK)
  chipsAt(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, M.BRICK, 2)
}

const letGoTowed = f => {
  f.towing.forEach(e => { e.stun = Math.max(e.stun, 0.4) })
  f.towing = []
}

const fuseBang = (g, f, x, y) => {
  const c = { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK }
  hostile(g).filter(e => Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < S.wick.radius).forEach(e => hurt(g, e, S.wick.damage, 'world', 'CRUSHED'))
  blast(g, c.x, c.y, S.wick.bang)
  letGoTowed(f)
  f.banged = true
}

const burnFuseCell = (g, f, i) => {
  const [x, y] = f.cells[i]
  NEAR.forEach(([dx, dy]) => ignite(g.world, x + dx, y + dy))
  const at = { x: (x + 0.5) * BLOCK, y: (y + 1) * BLOCK - 2 }
  fuseSpark(g, at.x, at.y)
  breakBottlesNear(g, at.x, at.y, BLOCK * 1.5)
  hostile(g).filter(e => !f.struck.includes(e) && overlap(e, fuseBox([x, y]))).forEach(e => {
    f.struck.push(e)
    hurt(g, e, S.wick.sparkDamage, 'player', 'FIRE')
  })
  if (i === f.end) fuseBang(g, f, x, y)
}

const catchFire = (g, f) => {
  const w = g.world
  for (let i = 0; i < f.cells.length; i++) {
    const [x, y] = f.cells[i]
    const box = fuseBox([x, y])
    const shot = g.shots.find(s => overlap(s, box))
    if (shot) shot.life = 0
    if (shot || heated(w, x, y) || chargedAt(w, x, y + 1) || g.fireballs.some(b => overlap(b, box))) {
      lightFuse(f, i)
      return
    }
  }
}

const towAlong = (g, f, s, dt) => {
  if (Math.sign(f.end - s.i) !== s.step) return
  const cellAt = f.cells[s.i]
  const reach = fuseBox(cellAt, 2)
  hostile(g).filter(e => !e.heavy && !e.prop && !e.warden && !e.partOf && !f.towing.includes(e) && overlap(e, reach)).slice(0, S.wick.towMost - f.towing.length).forEach(e => f.towing.push(e))
  f.towing = f.towing.filter(e => e.hp > 0)
  const to = { x: (cellAt[0] + 0.5) * BLOCK, y: (cellAt[1] + 1) * BLOCK }
  const most = S.wick.burnRate * BLOCK * 2 * dt
  f.towing.forEach(e => {
    const clamp = v => Math.max(-most, Math.min(most, v))
    moveAxis(g.world, e, 'y', clamp(to.y - (e.y + e.h)))
    moveAxis(g.world, e, 'x', clamp(to.x - centre(e).x))
    Object.assign(e, { vx: 0, vy: 0, stun: Math.max(e.stun, 0.25), shoved: Math.max(e.shoved ?? 0, 0.1) })
  })
}

const growTrail = (g, f) => {
  const [x, y] = footCell(g.player)
  let [lx, ly] = f.cells.at(-1)
  while ((lx !== x || ly !== y) && f.cells.length < S.wick.trailMost) {
    lx += Math.sign(x - lx)
    ly += Math.sign(y - ly)
    f.cells.push([lx, ly])
  }
}

const advanceSpark = (g, f, s) => {
  const next = s.i + s.step
  if (!f.cells[next] || f.burnt[next]) {
    s.out = true
    return
  }
  if (f.kiln) bake(g, f.cells[s.i])
  s.i = next
  f.burnt[next] = true
  if (snuffs(g, f.cells[next])) {
    s.out = true
    const [x, y] = f.cells[next]
    burst(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, '#9fb0a8', 4)
    return
  }
  burnFuseCell(g, f, next)
}

const stepWick = (g, f, dt) => {
  const W = S.wick
  if (f.laying) {
    if (f.trail) growTrail(g, f)
    else f.laid = Math.min(f.cells.length, f.laid + W.layRate * dt)
    const held = g.player.skills.some(s => s.kind === 'wick' && s.holding)
    if (!held && (f.trail || f.laid >= f.cells.length)) settleFuse(g)
    return
  }
  if (!f.lit) catchFire(g, f)
  if (!f.lit) return
  f.fresh.splice(0).forEach(i => burnFuseCell(g, f, i))
  for (const s of f.sparks) {
    s.clock += dt * W.burnRate
    while (s.clock >= 1 && !s.out) {
      s.clock -= 1
      advanceSpark(g, f, s)
    }
    if (f.tow && !s.out) towAlong(g, f, s, dt)
    if (s.out && f.kiln && s.i !== f.end) bake(g, f.cells[s.i])
  }
  f.sparks = f.sparks.filter(s => !s.out)
  if (f.sparks.length > 0) return
  letGoTowed(f)
  end(f)
}

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
  if (BREAKS.has(m) || m === M.MUD) {
    hammerCell(g, p, x, y)
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
    burst(g, c.x, c.y, 'fire', 1)
  }
  const foe = hostile(g).find(e => overlap(e, f))
  if (foe) {
    hurt(g, foe, 2, 'player')
    if (owns(g.player, 'ember.torch')) setAblaze(g, foe)
  }
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
  const y = Math.ceil((p.y + p.h) / BLOCK)
  for (let x = cell(p.x); x <= cell(p.x + p.w - 0.01); x++) {
    const m = matAt(g.world, x, y)
    if (m === M.EMPTY || props(m).gas || props(m).liquid) {
      setCell(g.world, x, y, M.RIME, props(M.RIME).startLife)
      burst(g, (x + 0.5) * BLOCK, y * BLOCK, '#bff2ff', 1)
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
  if (f.grinder) grindCentre(g, f, dt)
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

const grindCentre = (g, f, dt) => {
  const W = S.well
  f.grind = (f.grind ?? 0) - dt
  if (f.grind > 0) return
  f.grind = W.grindEvery
  const held = hostile(g).filter(e => !e.heavy && Math.hypot(centre(e).x - f.x, centre(e).y - f.y) < W.grindReach + e.w / 2)
  held.forEach(e => {
    e.iframes = 0
    hurt(g, e, W.grindDamage * held.length, 'world', 'CRUSHED')
    e.stun = Math.max(e.stun, 0.4)
    g.particles.push({ x: centre(e).x, y: centre(e).y, vx: (f.x - centre(e).x) * 4, vy: (f.y - centre(e).y) * 4, life: 0.2, colour: '#c9d4c0' })
  })
  if (held.length) g.shake = Math.max(g.shake, 1 + held.length)
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
  g.shots.push({ x: f.x, y: f.y, w: 2, h: 2, vx: ((t.x - f.x) / d) * 220, vy: ((t.y - f.y) / d) * 220, life: 0.7, friendly: true, copied: true })
}

const fetchCoin = (g, f, dt) => {
  const p = g.player
  const coin = f.carrying ?? nearest(g.pickups.filter(c => c.kind === 'coin' && !c.taken), f.x, f.y, S.drone.magpieReach)
  if (!coin || coin.taken) {
    f.carrying = null
    return false
  }
  const carrying = f.carrying === coin
  const to = carrying ? centre(p) : centre(coin)
  const d = Math.max(1, Math.hypot(to.x - f.x, to.y - f.y))
  f.x += ((to.x - f.x) / d) * S.drone.magpieSpeed * dt
  f.y += ((to.y - f.y) / d) * S.drone.magpieSpeed * dt
  if (!carrying && d < 8) f.carrying = coin
  if (carrying) Object.assign(coin, { x: f.x, y: f.y + 8, vx: 0, vy: 0, age: 1 })
  return true
}

const stepSentry = (g, f, dt) => {
  f.reload -= dt
  if (f.reload > 0) return
  const target = nearest(hostile(g), f.x, f.y, S.drone.range)
  if (!target) return
  f.reload = S.drone.sentryEvery
  droneFire(g, f, target)
}

const endDrone = (g, f) => {
  if (f.load) dropLoad(g, f)
}

const stepMoleDrone = (g, f, dt) => {
  if (f.sentry) f.reload -= dt
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

const CARRIED = new Set([M.SAND, M.SCRAP])

const flyTo = (f, to, speed, dt) => {
  const d = Math.max(1, Math.hypot(to.x - f.x, to.y - f.y))
  const step = Math.min(d, speed * dt)
  f.x += ((to.x - f.x) / d) * step
  f.y += ((to.y - f.y) / d) * step
  return d
}

const looseNear = (g, at, reach) => {
  const [cx, cy, span] = [cell(at.x), cell(at.y), Math.ceil(reach / BLOCK)]
  let best = null
  for (let y = Math.max(1, cy - span); y <= Math.min(ROOM - 2, cy + span); y++) {
    for (let x = Math.max(1, cx - span); x <= Math.min(ROOM - 2, cx + span); x++) {
      const d = Math.hypot(x - cx, y - cy) * BLOCK
      if (d < reach && d < (best?.d ?? Infinity) && CARRIED.has(matAt(g.world, x, y)) && !props(matAt(g.world, x, y - 1)).solid) best = { x, y, d }
    }
  }
  return best
}

const dropLoad = (g, f) => {
  g.flung.push({ x: f.x - 4, y: f.y + 4, w: 8, h: 8, vx: 0, vy: 40, age: 0, mat: f.load, safe: true, by: 'drone', cause: 'CRUSHED' })
  f.load = null
}

const gullFetch = (g, f, dt) => {
  const D = S.drone
  const from = f.sentry ? f.home : g.player
  const spot = looseNear(g, from, f.sentry ? D.sentryReach : D.gullReach)
  if (!spot) return false
  const at = { x: (spot.x + 0.5) * BLOCK, y: (spot.y - 0.5) * BLOCK }
  if (flyTo(f, at, D.gullSpeed, dt) > 3) return true
  f.load = matAt(g.world, spot.x, spot.y)
  setCell(g.world, spot.x, spot.y, M.EMPTY)
  chipsAt(g, at.x, at.y + BLOCK / 2, f.load, 3)
  return true
}

const gullCarry = (g, f, dt) => {
  const D = S.drone
  const foe = nearest(prey(g).filter(e => !f.sentry || Math.abs(centre(e).x - f.home.x) < D.gullDrop * 3), f.x, f.y, Infinity)
  if (!foe) {
    if (f.sentry) flyTo(f, f.home, D.gullSpeed, dt)
    return Boolean(f.sentry)
  }
  const over = { x: centre(foe).x, y: Math.max(BLOCK * 1.5, foe.y - D.gullHover) }
  flyTo(f, f.sentry ? f.home : over, D.gullSpeed, dt)
  if (Math.abs(f.x - centre(foe).x) < D.gullDrop && f.y < centre(foe).y) dropLoad(g, f)
  return true
}

const stepGull = (g, f, dt) => {
  f.reload -= dt
  const target = nearest(hostile(g), f.x, f.y, S.drone.range)
  if (target && f.reload <= 0) {
    f.reload = f.sentry ? S.drone.sentryEvery : S.drone.fireEvery
    droneFire(g, f, target)
  }
  return f.load ? gullCarry(g, f, dt) : gullFetch(g, f, dt)
}

const stepDrone = (g, f, dt) => {
  if (f.gull && stepGull(g, f, dt)) return
  if (f.sentry && !f.mole) {
    stepSentry(g, f, dt)
    return
  }
  if (f.magpie && fetchCoin(g, f, dt)) return
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
  if (f.launch) {
    launchFrom(g, at, near)
    return
  }
  near.forEach(e => hurt(g, e, S.mine.damage, 'world', 'CRUSHED'))
  blast(g, at.x, at.y, 2)
}

const launchFrom = (g, at, foes) => {
  const p = g.player
  foes.filter(e => !e.heavy && !e.prop).forEach(e => {
    Object.assign(e, { vx: (centre(e).x - at.x) * 3, vy: -S.mine.launch, shoved: 0.6, stun: Math.max(e.stun, 0.6) })
    g.effects.push({ age: 0, kind: 'tossed', foe: e, life: 3 })
  })
  if (Math.hypot(centre(p).x - at.x, centre(p).y - at.y) < S.mine.radius) {
    p.vy = -S.mine.launch
    p.jumpHeld = false
    p.drift = Math.max(p.drift, 0.2)
  }
  ring(g, at.x, at.y, '#d8ecff', 18, 110)
  g.shake = Math.max(g.shake, 3)
}

const stepTossed = (g, f) => {
  const e = f.foe
  if (e.hp <= 0) {
    end(f)
    return
  }
  if (!e.grounded || f.age < S.mine.launchLanding) return
  e.iframes = 0
  hurt(g, e, S.mine.launchDamage, 'world', 'CRUSHED')
  hostile(g).filter(o => o !== e && overlap(o, e)).forEach(o => hurt(g, o, S.mine.launchDamage, 'world', 'CRUSHED'))
  ring(g, centre(e).x, e.y + e.h, '#c9d4c0', 12, 70)
  g.shake = Math.max(g.shake, 3)
  end(f)
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
  const stepped = f.launch && overlap(g.player, { x: f.x - 2, y: f.y - 2, w: 10, h: 10 })
  if (crossed) {
    detonateMine(g, f, centre(crossed))
    end(f)
  } else if (stepped || hostile(g).some(e => Math.hypot(centre(e).x - c.x, centre(e).y - c.y) < S.mine.trigger)) {
    detonateMine(g, f)
    end(f)
  }
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
    drop(g, (f.cx + 0.5) * BLOCK, y * BLOCK, (Math.random() - 0.5) * 60, -80, MATERIAL_COLOURS[f.liquid]?.[0] ?? '#6fd0e0')
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
  const F = S.melt
  f.clock -= dt
  while (f.clock <= 0 && !f.done) {
    f.clock += F.fissureStep
    if (f.laid >= F.fissureMost) {
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
    heat(g, g.player, f.x, surface - 1, f.budget)
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
      if (matAt(g.world, x + dx, y + dy) !== f.from || f.laid >= f.most) continue
      setCell(g.world, x + dx, y + dy, f.to)
      f.laid += 1
      next.push([x + dx, y + dy])
      burst(g, (x + dx + 0.5) * BLOCK, (y + dy + 0.5) * BLOCK, '#8ae04a', 1)
    }
  }
  f.frontier = next
  if (next.length === 0) end(f)
}

const stepCaught = (g, f) => {
  const p = g.player
  const e = f.foe
  if (e.hp <= 0) {
    end(f)
    spend(p, 'grapple')
    return
  }
  const at = muzzle(p)
  e.x = at.x + p.aim.x * 10 - e.w / 2
  e.y = at.y + p.aim.y * 10 - e.h / 2
  e.vx = 0
  e.vy = 0
  e.stun = Math.max(e.stun, 0.2)
  e.iframes = Math.max(e.iframes, 0.1)
  f.from = at
  f.to = centre(e)
}

const endCaught = g => spend(g.player, 'grapple')

const stepHurled = (g, f) => {
  const e = f.foe
  if (e.hp <= 0) {
    end(f)
    return
  }
  const struck = hostile(g).filter(o => o !== e && overlap(o, e))
  if (struck.length || e.hitWall) {
    struck.forEach(o => {
      o.iframes = 0
      hurt(g, o, S.grapple.catchDamage, 'world')
      o.stun = Math.max(o.stun, 0.6)
    })
    e.iframes = 0
    hurt(g, e, S.grapple.catchDamage, 'world', 'CRUSHED')
    ring(g, centre(e).x, centre(e).y, '#ff5a4a', 14, 90)
    g.shake = Math.max(g.shake, 4)
    end(f)
  }
}

const stepRope = (g, f) => {
  const c = centre(g.player)
  f.from = { x: f.x, y: f.y }
  f.to = c
}

const endRecall = g => spend(g.player, 'swap')

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
    if (f.travelled > f.range || cell(f.x) < 1 || cell(f.y) < 1 || cell(f.x) > ROOM - 2 || cell(f.y) > ROOM - 2) end(f)
  }
}

const endMatter = g => releaseMatter(g)

const stepBeam = (g, f) => beamSparks(g, f)

const stepPeal = (g, f) => {
  if (f.rung) return
  f.rung = true
  pealRings(g, f)
  ripple(g, f.x, f.y, S.chime.reach * 4, f.broke ? 3 : 1.5, S.chime.ringTime, 5)
}

const stepVolley = (g, f, dt) => {
  const C = S.chime
  if (!f.pieces.length) {
    end(f)
    return
  }
  f.clock -= dt
  if (f.clock > 0) return
  const foes = prey(g)
  const shot = f.pieces.map((piece, i) => [i, nearest(foes, piece.x, piece.y, C.volleyReach)]).find(([, foe]) => foe)
  if (!shot) return
  shardAt(g, f.pieces.splice(shot[0], 1)[0], shot[1])
  f.clock = C.volleyEvery
}

const stepHover = (g, f) => {
  const foes = prey(g)
  f.pieces = f.pieces.filter(piece => {
    const foe = nearest(foes, piece.x, piece.y, S.chime.hoverReach)
    if (foe) shardAt(g, piece, foe)
    return !foe
  })
  if (!f.pieces.length) end(f)
}

const dropPieces = (g, f) => f.pieces.forEach(piece => shardAt(g, { ...piece, from: { x: piece.x, y: piece.y - BLOCK } }))

const stepFence = (g, f, dt) => {
  if (!f.b) return
  const B = S.bolt
  f.clock -= dt
  if (f.clock > 0) return
  f.clock = B.fenceEvery
  zap(g, f.a, f.b, '#ff9a2e')
  foesOnSegment(g, f.a, f.b, 2).forEach(e => {
    hurt(g, e, B.fenceDamage, 'player', 'CHARGE')
    e.stun = Math.max(e.stun, B.fenceStun)
  })
  for (const post of [f.a, f.b]) [0, 1].forEach(down => energize(g.world, cell(post.x), cell(post.y) + down, B.energy / 2))
}

const stepPillar = (g, f, dt) => {
  const P = S.mason
  f.clock -= dt
  while (f.clock <= 0 && !f.done) {
    f.clock += P.pillarStep
    const y = f.floor - 1 - f.laid
    if (f.laid >= P.pillarMost || y < 1 || props(matAt(g.world, f.x, y)).solid) {
      end(f)
      return
    }
    const box = { x: f.x * BLOCK, y: y * BLOCK, w: BLOCK, h: BLOCK }
    const bodies = [g.player, ...g.enemies.filter(e => !e.prop && !e.stowed)].filter(b => overlap(b, box))
    if (bodies.some(b => b.heavy || b.warden || b.partOf)) {
      end(f)
      return
    }
    const stuck = bodies.filter(b => moveAxis(g.world, b, 'y', box.y - (b.y + b.h)))
    bodies.forEach(b => { b.vy = Math.min(b.vy ?? 0, 0) })
    if (stuck.length) {
      stuck.filter(b => b !== g.player).forEach(e => {
        e.iframes = 0
        hurt(g, e, P.pillarDamage, 'world', 'CRUSHED')
        e.stun = Math.max(e.stun, 0.6)
      })
      end(f)
      return
    }
    setCell(g.world, f.x, y, f.material)
    chipsAt(g, box.x + BLOCK / 2, box.y + BLOCK, f.material, 2)
    f.laid += 1
  }
}

const STEP = {
  well: stepWell, drone: stepDrone, mine: stepMine, tossed: stepTossed, fence: stepFence, pillar: stepPillar,
  globe: stepGlobe, nail: stepNail, thrown: stepThrown, hurl: stepHurl, orbit: stepOrbit, wisp: stepWisp, glide: stepGlide,
  twister: stepTwister, lure: stepLure, span: stepSpan, flytrap: stepFlytrap, geyser: stepGeyser, font: stepFont,
  bore: stepBore, cloud: stepCloud, fissure: stepFissure, contagion: stepContagion, cascade: (...args) => stepCascade(...args), roots: (...args) => stepRoots(...args), wraith: stepWraith, shout: stepShout,
  caught: stepCaught, hurled: stepHurled, rope: stepRope, wick: stepWick, bottle: stepBottle, float: stepFloat, link: stepLink,
  ball: (...args) => stepBall(...args), daub: (...args) => stepDaub(...args), kiln: (...args) => stepKiln(...args),
  beam: stepBeam, peal: stepPeal, volley: stepVolley, hover: stepHover, statues: g => turnToGlass(g),
}
const END = {
  drone: endDrone, flytrap: endFlytrap,
  geyser: endGeyser, setting: endSetting, still: endMatter, caught: endCaught, recall: endRecall, bottle: breakBottle, float: endFloat, link: endLink,
  kiln: (...args) => endKiln(...args),
  volley: dropPieces, hover: dropPieces, bell: g => ringBell(g),
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
  if (Math.random() < dt * 14) burst(g, c.x, e.y, 'fire', 1)
  e.ablazeClock += dt
  if (e.ablazeClock > E.torchEvery) {
    e.ablazeClock = 0
    hurt(g, e, 1, 'world', 'FIRE')
  }
  g.enemies.filter(o => o !== e && !o.friendly && !o.ablaze && overlap(o, e)).forEach(o => setAblaze(g, o))
}

const stepAlly = (g, e) => {
  if (e.plague) hostile(g).filter(o => !o.heavy && overlap(o, e)).forEach(o => charmOne(g, o, g.player))
}

const stepCoat = (g, e, dt) => {
  const c = e.coat
  c.clock -= dt
  if (c.clock > 0) return
  c.clock = S.flask.dripEvery
  const [x, y] = [cell(centre(e).x), cell(e.y + e.h - 1)]
  const spot = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1]].find(([dx, dy]) => matAt(g.world, x + dx, y + dy) === M.EMPTY)
  if (spot) setCell(g.world, x + spot[0], y + spot[1], c.mat)
  drop(g, centre(e).x + (Math.random() - 0.5) * e.w, e.y + e.h - 2, (Math.random() - 0.5) * 30, 10, MATERIAL_COLOURS[c.mat]?.[0] ?? '#6fd0e0')
  c.cells -= 1
  if (c.cells <= 0) e.coat = null
}

const stepCreatures = (g, dt) => {
  if (g.evolving) g.evolving.life -= dt
  for (const e of g.enemies) {
    if (e.coat) stepCoat(g, e, dt)
    if (e.ablaze > 0) stepAblaze(g, e, dt)
    if (e.ally > 0) stepAlly(g, e)
    if (e.goat > 0) e.goat -= dt
  }
  for (const f of g.flung) if (f.charged && Math.random() < dt * 30) burst(g, f.x + Math.random() * 8, f.y + Math.random() * 8, 'charge', 1)
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

export const decoyFor = g => g.effects.find(f => f.kind === 'ghost' || f.kind === 'lure')

export const igniteAround = (g, x, y) => {
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) ignite(g.world, x + dx, y + dy)
}

