import { BLOCK, ROOM } from './config.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'

export const WORLD_PX = ROOM * BLOCK

export const overlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const centre = e => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 })
export const cell = px => Math.floor(px / BLOCK)

export const solidAt = (w, px, py) => props(matAt(w, cell(px), cell(py))).solid === true

export const cellsUnder = ({ x, y, w, h }, margin = 0) => {
  const out = []
  for (let cy = cell(y - margin); cy <= cell(y + h - 0.01 + margin); cy++) {
    for (let cx = cell(x - margin); cx <= cell(x + w - 0.01 + margin); cx++) out.push([cx, cy])
  }
  return out
}

export const hitsSolid = (world, box) => cellsUnder(box).some(([x, y]) => props(matAt(world, x, y)).solid)

export const moveAxis = (world, e, axis, distance) => {
  const sign = Math.sign(distance)
  let left = Math.abs(distance)
  while (left > 0) {
    const step = Math.min(0.25, left)
    const next = { x: e.x, y: e.y, w: e.w, h: e.h, [axis]: e[axis] + sign * step }
    if (hitsSolid(world, next)) return true
    e[axis] = next[axis]
    left -= step
  }
  return false
}

export const move = (world, e, dt) => {
  e.hitWall = moveAxis(world, e, 'x', e.vx * dt)
  if (e.hitWall) e.vx = 0
  const blocked = moveAxis(world, e, 'y', e.vy * dt)
  e.grounded = blocked && e.vy > 0
  if (blocked) e.vy = 0
}

export const pushOutOfSolid = (world, e) => {
  for (let i = 0; i < 24 && hitsSolid(world, e); i++) e.y -= 1
}

export const inWater = (world, e) => {
  const c = centre(e)
  return matAt(world, cell(c.x), cell(c.y)) === M.WATER
}

export const liquidAtPx = (world, px, py) => props(matAt(world, cell(px), cell(py))).liquid === true

export const inCone = (from, aim, reach, width) => point => {
  const dx = point.x - from.x
  const dy = point.y - from.y
  const along = dx * aim.x + dy * aim.y
  const across = Math.abs(dx * aim.y - dy * aim.x)
  return along > 0 && along <= reach && across <= width
}

export const forEachCell = visit => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) visit(x, y, { x: (x + 0.5) * BLOCK, y: (y + 0.5) * BLOCK })
  }
}
