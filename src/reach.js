import { ROOM } from './config.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'

const solid = (w, x, y) => x < 0 || y < 0 || x >= ROOM || y >= ROOM || props(matAt(w, x, y)).solid === true
const swimmable = (w, x, y) => [M.WATER, M.OIL, M.MUD].includes(matAt(w, x, y))

export const keyAt = (x, y) => y * ROOM + x
export const cellOf = key => ({ x: key % ROOM, y: Math.floor(key / ROOM) })

const standable = (w, extra) => (x, y) => {
  if (solid(w, x, y) || solid(w, x, y - 1) || matAt(w, x, y) === M.LAVA) return false
  return solid(w, x, y + 1) || swimmable(w, x, y) || swimmable(w, x, y + 1) || matAt(w, x, y) === M.VINE || extra.has(keyAt(x, y))
}

const arcOpen = (w, x0, y0, x1, y1) => {
  const dir = Math.sign(x1 - x0)
  const crossing = r => {
    for (let y = r; y <= y0; y++) if (y >= 0 && solid(w, x0, y)) return false
    for (let y = r; y <= y1; y++) if (y >= 0 && solid(w, x1, y)) return false
    for (let x = x0 + dir; x !== x1 && dir !== 0; x += dir) if ((r >= 0 && solid(w, x, r)) || solid(w, x, r + 1)) return false
    return true
  }
  const top = Math.min(y0, y1) - 1
  for (let r = top; r >= Math.max(top - 2, y0 - 5); r--) if (crossing(r)) return true
  return false
}

export const search = (w, from, extra) => {
  const can = standable(w, extra)
  const parent = new Map([[keyAt(from.x, from.y), -1]])
  const queue = [from]
  for (let at = 0; at < queue.length; at++) {
    const { x, y } = queue[at]
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -4; dy <= 26; dy++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= ROOM || ny < 1 || ny >= ROOM) continue
        if ((dy === -3 && Math.abs(dx) > 3) || (dy === -4 && Math.abs(dx) > 2)) continue
        const key = keyAt(nx, ny)
        if (parent.has(key) || !can(nx, ny) || !arcOpen(w, x, y, nx, ny)) continue
        parent.set(key, keyAt(x, y))
        queue.push({ x: nx, y: ny })
      }
    }
  }
  return parent
}

export const pathTo = (parent, goal) => {
  const path = []
  for (let k = goal; k !== -1 && k !== undefined; k = parent.get(k)) path.unshift(cellOf(k))
  return path
}

export const doorGoal = (dir, door) => ({
  left: { x: 1, y: door.row + 1 },
  right: { x: ROOM - 2, y: door.row + 1 },
  up: { x: door.col, y: 1 },
  down: { x: door.col, y: ROOM - 2 },
}[dir])

export const doorBlocked = (w, dir, door) => {
  const { x, y } = doorGoal(dir, door)
  return solid(w, x, y) || ((dir === 'left' || dir === 'right') && solid(w, x, y - 1))
}

export const exitsFrom = (w, doors, from) => {
  const anchors = Object.entries(doors).map(([dir, door]) => ({ dir, ...doorGoal(dir, door), locked: doorBlocked(w, dir, door) }))
  const extra = new Set(anchors.filter(a => !a.locked).map(a => keyAt(a.x, a.y)))
  extra.add(keyAt(from.x, from.y))
  const parent = search(w, from, extra)
  const near = (t, reach) => [...parent.keys()]
    .map(k => ({ k, d: Math.hypot((k % ROOM) - t.x, Math.floor(k / ROOM) - t.y) }))
    .filter(c => c.d <= reach)
    .sort((a, b) => a.d - b.d)[0]?.k
  const open = anchors.filter(a => !a.locked && parent.has(keyAt(a.x, a.y)))
  const locked = anchors.filter(a => a.locked && near(a, 4) !== undefined)
  return { parent, near, anchors, open, locked }
}
