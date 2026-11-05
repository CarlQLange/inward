const SIZE = 15
export const CORE_RING = 7

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' }
const STEP = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }

export const ringOf = (x, y) => Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y)
export const keyOf = (x, y) => `${x},${y}`

const ringCells = r => {
  const hi = SIZE - 1 - r
  const cells = []
  for (let x = r; x < hi; x++) cells.push([x, r])
  for (let y = r; y < hi; y++) cells.push([hi, y])
  for (let x = hi; x > r; x--) cells.push([x, hi])
  for (let y = hi; y > r; y--) cells.push([r, y])
  return cells
}

const dirBetween = ([ax, ay], [bx, by]) =>
  Object.keys(STEP).find(d => STEP[d][0] === bx - ax && STEP[d][1] === by - ay)

const inwardDir = ([x, y], r) => {
  const hi = SIZE - 1 - r
  const corner = (x === r || x === hi) && (y === r || y === hi)
  if (corner) return null
  if (y === r) return 'down'
  if (y === hi) return 'up'
  if (x === r) return 'right'
  return 'left'
}

const GATES_PER_RING = [5, 4, 4, 3, 3, 2, 2]
const LOCK_CHANCE = [0.2, 0.4, 0.6, 0.75, 0.85, 0.95, 1]

export const buildMap = seed => {
  const rand = seeded(seed)
  const links = {}
  const link = (a, b, lock = null) => {
    const dir = dirBetween(a, b)
    ;(links[keyOf(...a)] ??= {})[dir] = { to: b, lock }
    ;(links[keyOf(...b)] ??= {})[OPPOSITE[dir]] = { to: a, lock: null }
  }
  const startX = 3 + Math.floor(rand() * 9)
  const startKey = keyOf(startX, 0)

  for (let r = 0; r < CORE_RING; r++) {
    const cells = ringCells(r)
    const broken = r === 0 ? -1 : Math.floor(rand() * cells.length)
    cells.forEach((cell, i) => {
      const next = cells[(i + 1) % cells.length]
      const touchesStartLeft = r === 0 && keyOf(...next) === startKey
      if (i !== broken && !touchesStartLeft) link(cell, next)
    })

    const candidates = cells.filter(cell => inwardDir(cell, r) && keyOf(...cell) !== startKey)
    const sideways = candidates.filter(cell => ['left', 'right'].includes(inwardDir(cell, r)))
    const spaced = candidates.map(cell => [rand(), cell]).sort((a, b) => a[0] - b[0]).map(([, cell]) => cell)
    const sure = sideways[Math.floor(rand() * sideways.length)]
    const chosen = [sure, ...spaced.filter(cell => cell !== sure)].slice(0, GATES_PER_RING[r])
    chosen.forEach((cell, i) => {
      const dir = inwardDir(cell, r)
      const to = [cell[0] + STEP[dir][0], cell[1] + STEP[dir][1]]
      const lock = r === CORE_RING - 1 ? 'seal' : i === 0 ? (r < 2 ? null : 'peat') : rand() < LOCK_CHANCE[r] ? 'any' : null
      link(cell, to, lock)
    })
  }
  return { start: [startX, 0], links }
}

const stepsFrom = (links, from, within) => {
  const dist = new Map([[keyOf(...from), 0]])
  const queue = [from]
  while (queue.length) {
    const here = queue.shift()
    for (const { to } of Object.values(links[keyOf(...here)] ?? {})) {
      const key = keyOf(...to)
      if (dist.has(key) || !within(to)) continue
      dist.set(key, dist.get(keyOf(...here)) + 1)
      queue.push(to)
    }
  }
  return dist
}

export const loopRooms = (map, from, ring) =>
  [...stepsFrom(map.links, from, ([x, y]) => ringOf(x, y) === ring)]
    .map(([key, steps]) => ({ cell: key.split(',').map(Number), steps }))

export const MAP_SIZE = SIZE
