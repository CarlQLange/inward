import { BLOCK, TUNING } from './config.js'
import { isTouchLayout } from './layout.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'
import { cell } from './physics.js'
import { rnd } from './dice.js'

const T = TUNING.particles

const memory = new WeakMap()
const storeOf = w => {
  if (!memory.has(w)) memory.set(w, { marks: [], piles: new Map() })
  return memory.get(w)
}

const solid = (w, x, y) => props(matAt(w, x, y)).solid === true

const blotch = (length, across) => {
  const dots = []
  const from = -Math.floor(length / 2)
  for (let i = 0; i < length; i++) {
    if (i && i < length - 1 && rnd() < 0.15) continue
    const inset = rnd() < 0.3 ? 1 : 0
    dots.push(across ? inset : from + i, across ? from + i : inset)
  }
  return dots
}

const leave = (w, x, y, colour, dots, cx, cy, life) => {
  const { marks } = storeOf(w)
  marks.push({ x: Math.round(x), y: Math.round(y), colour, dots, cx, cy, mat: matAt(w, cx, cy), life, max: life })
  const cap = isTouchLayout() ? T.touchMarks : T.marks
  if (marks.length > cap) marks.shift()
}

export const stainFloor = (w, x, y, colour, length = 3, life = T.markLife) => {
  const cy = cell(y + 1)
  const cx = cell(x)
  if (solid(w, cx, cy)) leave(w, x, cy * BLOCK, colour, blotch(length, false), cx, cy, life)
}

export const stainWall = (w, x, y, side, colour, length = 3, life = T.markLife) => {
  const cx = cell(x + side)
  const cy = cell(y)
  if (solid(w, cx, cy)) leave(w, side > 0 ? cx * BLOCK : (cx + 1) * BLOCK - 1, y, colour, blotch(length, true), cx, cy, life)
}

export const stainCeiling = (w, x, y, colour, length = 2, life = T.markLife) => {
  const cy = cell(y - 1)
  const cx = cell(x)
  if (solid(w, cx, cy)) leave(w, x, (cy + 1) * BLOCK - 1, colour, blotch(length, false).map((v, i) => (i % 2 ? -v : v)), cx, cy, life)
}

export const stainBlock = (w, cx, cy, colour, life = T.markLife) => {
  if (!solid(w, cx, cy)) return
  const dots = []
  for (let n = 0; n < 7; n++) dots.push(Math.floor(rnd() * BLOCK), Math.floor(rnd() * BLOCK))
  leave(w, cx * BLOCK, cy * BLOCK, colour, dots, cx, cy, life)
}

const pileAt = (piles, x, y) => piles.get(x + y * 1024)?.h ?? 0

const standing = (w, x, y) => solid(w, cell(x), cell(y + 1)) && !solid(w, cell(x), cell(y))

export const addToPile = (w, x, y, colour) => {
  const { piles } = storeOf(w)
  const rx = Math.round(x)
  const ry = Math.round(y)
  if (!standing(w, rx, ry)) return
  const here = pileAt(piles, rx, ry)
  const side = [rx - 1, rx + 1, rx - 2, rx + 2].find(sx => standing(w, sx, ry) && pileAt(piles, sx, ry) < here)
  const at = here >= 1 && side !== undefined ? side : rx
  const key = at + ry * 1024
  const pile = piles.get(key)
  if (pile) {
    pile.h = Math.min(T.pileHeight, pile.h + 1)
    pile.life = T.pileLife
    pile.colour = colour
    return
  }
  if (piles.size >= T.piles) piles.delete(piles.keys().next().value)
  piles.set(key, { x: at, y: ry, h: 1, colour, life: T.pileLife, tile: matAt(w, cell(at), cell(ry + 1)) })
}

export const stepMarks = (g, dt) => {
  const w = g.world
  if (!w) return
  const store = storeOf(w)
  store.marks = store.marks.filter(m => (m.life -= dt) > 0 && matAt(w, m.cx, m.cy) === m.mat)
  for (const [key, pile] of store.piles) {
    pile.life -= dt
    if (pile.life <= 0 && pile.h > 0) {
      pile.h -= 1
      pile.life = 4
    }
    if (pile.h <= 0 || matAt(w, cell(pile.x), cell(pile.y + 1)) !== pile.tile || solid(w, cell(pile.x), cell(pile.y)) || matAt(w, cell(pile.x), cell(pile.y)) === M.WATER) store.piles.delete(key)
  }
}

export const drawMarks = (ctx, g) => {
  const w = g.world
  if (!w) return
  const { marks, piles } = storeOf(w)
  for (const m of marks) {
    ctx.globalAlpha = Math.min(0.75, (m.life / m.max) * 2)
    ctx.fillStyle = m.colour
    for (let i = 0; i < m.dots.length; i += 2) ctx.fillRect(m.x + m.dots[i], m.y + m.dots[i + 1], 1, 1)
  }
  ctx.globalAlpha = 1
  for (const pile of piles.values()) {
    ctx.fillStyle = pile.colour
    ctx.fillRect(pile.x, pile.y - pile.h + 1, 1, pile.h)
  }
}
