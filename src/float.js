import { BLOCK, ROOM, TUNING } from './config.js'
import { M } from './materials.js'
import { matAt } from './world.js'
import { cell, centre, move } from './physics.js'
import { hurt } from './combat.js'
import { anchorOf } from './cast.js'
import { bubblePop, liftMote, slamAt } from './matter.js'
import { spend } from './skills.js'
import { roomForAmbient } from './particles.js'

const S = TUNING.skills.float
const E = TUNING.enemies
const P = TUNING.player

export const UP = 1
const RIGHT = 2
const DOWN = 3
const LEFT = 4

export const PULLS = [[0, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]

export const pullFromAim = aim => (Math.abs(aim.x) > Math.abs(aim.y) ? (aim.x > 0 ? RIGHT : LEFT) : aim.y > 0 ? DOWN : UP)

const ANCHORED = new Set(['hang', 'wall'])

const floatable = e => !e.heavy && !e.warden && !e.partOf && !e.prop && !e.friendly && !e.stowed && !e.intangible && !e.asleep
  && e.kind !== 'worm' && !ANCHORED.has(anchorOf(e.kind))

const within = (f, point) => Math.hypot(point.x - f.x, point.y - f.y) < f.r

export const pullNow = (g, f) => {
  if (f.flip) return Math.floor(f.age / S.flipEvery) % 2 ? DOWN : UP
  if (f.tilt && f.carry) return pullFromAim(g.player.aim)
  return f.pull
}

const paintLift = (g, f, pull) => {
  const w = g.world
  w.lift ??= new Uint8Array(ROOM * ROOM)
  const [cx, cy] = [cell(f.x), cell(f.y)]
  const reach = Math.ceil(f.r / BLOCK)
  for (let y = Math.max(0, cy - reach); y <= Math.min(ROOM - 1, cy + reach); y++) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(ROOM - 1, cx + reach); x++) {
      if (within(f, { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK })) w.lift[y * ROOM + x] = pull
    }
  }
}

const turnAround = (list, f, [gx, gy], gravity, dt) => {
  for (const b of list) {
    if (b.straight || !within(f, centre(b))) continue
    b.vx += gx * gravity * dt
    b.vy += (gy - 1) * gravity * dt
  }
}

const ambience = (g, f, [gx, gy]) => {
  if (!roomForAmbient(g) || Math.random() > 0.5) return
  const a = Math.random() * Math.PI * 2
  const d = Math.sqrt(Math.random()) * f.r * 0.9
  liftMote(g, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, gx, gy, f.colour)
}

export const stepFloat = (g, f, dt) => {
  const p = g.player
  if (f.carry) Object.assign(f, centre(p))
  const pull = pullNow(g, f)
  f.shown = pull
  paintLift(g, f, pull)
  if (within(f, centre(p))) p.pull = pull
  for (const e of g.enemies) {
    if (!floatable(e) || !within(f, centre(e))) continue
    e.floated = S.dropTime
    e.pull = pull
  }
  turnAround(g.fireballs, f, PULLS[pull], TUNING.fireball.gravity, dt)
  turnAround(g.flung, f, PULLS[pull], TUNING.flung.gravity, dt)
  ambience(g, f, PULLS[pull])
}

export const endFloat = (g, f) => {
  bubblePop(g, f.x, f.y, f.r, f.colour)
  if (f.snare && !f.released) spend(g.player, 'float')
}

const slamDamage = speed => Math.min(S.slamMost, 1 + Math.floor((speed - S.slam) / S.slamStep))

const along = (v, g) => (g === 0 ? 0 : v * g)

export const driftFoe = (g, e, dt) => {
  const code = e.pull ?? 0
  const [gx, gy] = PULLS[code]
  e.pull = 0
  e.upside = code === UP
  e.floated = code ? S.dropTime : e.floated - dt
  e.vx = (e.vx ?? 0) + gx * E.gravity * dt
  e.vy = (e.vy ?? 0) + gy * E.gravity * dt
  if (gx === 0) e.vx *= 1 - S.drift * dt
  if (gy === 0) e.vy *= 1 - S.drift * dt
  const cap = code === UP ? S.rise : P.maxFall
  e.vx = Math.max(-cap, Math.min(cap, e.vx))
  e.vy = Math.max(-cap, Math.min(cap, e.vy))
  const before = { x: e.vx, y: e.vy }
  move(g.world, e, dt)
  const struck = gy ? (along(before.y, gy) > 0 && e.vy === 0 ? Math.abs(before.y) : 0) : (along(before.x, gx) > 0 && e.hitWall ? Math.abs(before.x) : 0)
  if (struck > S.slam) slam(g, e, struck, gx, gy)
  e.stun = Math.max(e.stun, 0.12)
  if ((!code && e.grounded) || e.floated <= 0) {
    e.floated = 0
    e.upside = false
  }
}

const slam = (g, e, speed, gx, gy) => {
  const c = centre(e)
  const at = { x: c.x + gx * e.w / 2, y: c.y + gy * e.h / 2 }
  e.iframes = 0
  hurt(g, e, slamDamage(speed), 'world', 'CRUSHED')
  slamAt(g, at.x, at.y, gx, gy, matAt(g.world, cell(at.x + gx * 2), cell(at.y + gy * 2)) || M.ROCK)
  g.shake = Math.max(g.shake, 2)
}

export const heroPull = p => {
  const code = p.pull ?? 0
  p.pull = 0
  return PULLS[code]
}
