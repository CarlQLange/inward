import { BLOCK, ROOM } from './config.js'
import { M } from './materials.js'
import { heroOf } from './hero.js'

export const LIGHT_SIZE = 56
const TEXEL = (ROOM * BLOCK) / LIGHT_SIZE
const AREA = LIGHT_SIZE * LIGHT_SIZE
const red = new Float32Array(AREA)
const green = new Float32Array(AREA)
const blue = new Float32Array(AREA)
const bytes = new Uint8Array(AREA * 3)

const FIRE = [1, 0.55, 0.2]
const LAVA = [1, 0.42, 0.14]
const CHARGE = [1, 0.92, 0.4]
const LAMP = [1, 0.86, 0.6]
const SHOT = [0.9, 0.9, 0.7]
const HOT_SHOT = [1, 0.5, 0.2]
const CORE = [0.45, 0.85, 1]
const ACID = [0.55, 1, 0.25]
const VOLATILE = [1, 0.45, 0.95]

const splat = (px, py, radius, [r, g, b], power = 1) => {
  const cx = px / TEXEL
  const cy = py / TEXEL
  const reach = radius / TEXEL
  const x0 = Math.max(0, Math.floor(cx - reach))
  const x1 = Math.min(LIGHT_SIZE - 1, Math.ceil(cx + reach))
  const y0 = Math.max(0, Math.floor(cy - reach))
  const y1 = Math.min(LIGHT_SIZE - 1, Math.ceil(cy + reach))
  const inverse = 1 / (reach * reach)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const fall = 1 - (dx * dx + dy * dy) * inverse
      if (fall <= 0) continue
      const v = fall * fall * power
      const i = y * LIGHT_SIZE + x
      red[i] += r * v
      green[i] += g * v
      blue[i] += b * v
    }
  }
}

const cone = (px, py, dir, reach, spread, [r, g, b], power) => {
  const cx = px / TEXEL
  const cy = py / TEXEL
  const far = reach / TEXEL
  const x0 = Math.max(0, Math.floor(cx - far))
  const x1 = Math.min(LIGHT_SIZE - 1, Math.ceil(cx + far))
  const y0 = Math.max(0, Math.floor(cy - far))
  const y1 = Math.min(LIGHT_SIZE - 1, Math.ceil(cy + far))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.hypot(dx, dy) || 1
      const along = (dx * dir.x + dy * dir.y) / d
      if (along < spread || d > far) continue
      const v = ((along - spread) / (1 - spread)) * (1 - d / far) * power
      const i = y * LIGHT_SIZE + x
      red[i] += r * v
      green[i] += g * v
      blue[i] += b * v
    }
  }
}

const flicker = (x, y, time) => 0.75 + 0.25 * Math.sin(time * 13 + (x * 7 + y * 13))

const worldLights = (g, time) => {
  const w = g.world
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const px = (x + 0.5) * BLOCK
      const py = (y + 0.5) * BLOCK
      if (w.burn[i] > 0) splat(px, py, 26, FIRE, 0.55 * flicker(x, y, time))
      else if (w.charge[i] > 0) splat(px, py, 16, CHARGE, 0.5)
      else if (w.mat[i] === M.LAVA) {
        if (w.mat[i - ROOM] !== M.LAVA) splat(px, py, 26, LAVA, 0.5)
      } else if (w.mat[i] === M.ACID && w.mat[i - ROOM] !== M.ACID) splat(px, py, 14, ACID, 0.22)
      else if (w.mat[i] === M.VOLATILE) splat(px, py, 12, VOLATILE, 0.22)
    }
  }
}

const omenOf = g => String(g.omen?.id ?? g.omen ?? '').toLowerCase()

export const ambientOf = g => {
  if (g.ambient !== undefined) return g.ambient
  return omenOf(g) === 'blackout' ? 0.12 : null
}

const actorLights = (g, dark) => {
  const p = g.player
  const dead = g.phase === 'dead'
  if (p && g.phase !== 'title' && !dead) {
    const h = heroOf(p)
    const tip = h.tip
    const dir = { x: Math.cos(h.angle), y: Math.sin(h.angle) }
    splat(p.x + 3, p.y + p.h / 2, dark ? 46 : 34, LAMP, dark ? 0.8 : 0.4)
    cone(tip.x, tip.y, dir, dark ? 120 : 76, 0.82, LAMP, dark ? 1.3 : 0.65)
    if (h.flash > 0) splat(tip.x, tip.y, 30, LAMP, 1.1)
  }
  for (const s of g.shots) splat(s.x, s.y, 12, SHOT, 0.5)
  for (const f of g.fireballs) splat(f.x + 2, f.y + 2, 18, f.pellet ? SHOT : f.acid ? ACID : HOT_SHOT, 0.65)
  for (const b of g.bolts) for (const point of b.points) splat(point.x, point.y, 14, CHARGE, 0.4)
  for (const e of g.enemies) {
    if (e.light) splat(e.x + e.w / 2, e.y + e.h / 2, e.light.radius ?? 24, e.light.colour ?? FIRE, e.light.power ?? 0.6)
    else if (e.kind === 'emberbat' || e.elite === 'burning') splat(e.x + e.w / 2, e.y + e.h / 2, 22, FIRE, 0.5)
    else if (e.elite === 'charged') splat(e.x + e.w / 2, e.y + e.h / 2, 18, CHARGE, 0.35)
  }
  for (const card of g.cards) if (card.kind === 'core') splat(card.x + 8, card.y + 8, 70, CORE, 0.8)
  for (const l of g.lights) splat(l.x, l.y, l.radius, [l.r, l.g, l.b], (l.life / l.max) * 1.3)
}

export const buildLight = (g, time) => {
  red.fill(0)
  green.fill(0)
  blue.fill(0)
  const dark = ambientOf(g) !== null
  if (g.world) worldLights(g, time)
  actorLights(g, dark)
  for (let i = 0; i < AREA; i++) {
    bytes[i * 3] = Math.min(255, red[i] * 255)
    bytes[i * 3 + 1] = Math.min(255, green[i] * 255)
    bytes[i * 3 + 2] = Math.min(255, blue[i] * 255)
  }
  return bytes
}
