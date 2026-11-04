import { BLOCK, ROOM } from './config.js'

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const WATER_BOTTOM = 25
const LOWEST_FLOOR = 23
const HIGHEST_FLOOR = 9

const walkFloors = (rand, range) => {
  const segments = []
  const pits = []
  let x = 1
  let floor = range(HIGHEST_FLOOR + 3, LOWEST_FLOOR - 2)
  while (x < ROOM - 1) {
    const length = range(3, 6)
    const to = Math.min(x + length - 1, ROOM - 2)
    const remaining = ROOM - 2 - to
    const last = remaining < 4
    const end = last ? ROOM - 2 : to
    segments.push({ from: x, to: end, floor })
    if (last) break
    const gap = rand() < 0.55 ? range(1, 3) : 0
    if (gap) pits.push({ from: end + 1, to: end + gap })
    x = end + gap + 1
    floor = clamp(floor + range(-3, 3), HIGHEST_FLOOR, LOWEST_FLOOR)
  }
  return { segments, pits }
}

const floorsByColumn = ({ segments }) => {
  const floors = new Array(ROOM).fill(null)
  for (const s of segments) for (let x = s.from; x <= s.to; x++) floors[x] = s.floor
  return floors
}

const nearestFloor = (floors, x) => {
  const around = [0, -1, 1, -2, 2, -3, 3, -4, 4]
  const found = around.map(d => floors[x + d]).filter(f => f !== null && f !== undefined)
  return Math.min(...found)
}

const carve = (grid, floors, pits, rand, range) => {
  const ceilings = new Array(ROOM).fill(1)
  for (let x = 1; x < ROOM - 1; x++) {
    const lowestNearby = nearestFloor(floors, x)
    const ceiling = clamp(lowestNearby - 7 - range(0, 2), 2, ROOM)
    const bottom = floors[x] === null ? WATER_BOTTOM : floors[x] - 1
    ceilings[x] = ceiling
    for (let y = ceiling; y <= bottom; y++) grid[y][x] = '.'
  }
  for (let blob = range(1, 3); blob > 0; blob--) {
    const cx = range(4, ROOM - 5)
    const cy = range(3, 10)
    const r = range(2, 3)
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const floor = floors[x] ?? WATER_BOTTOM + 1
        if (y >= 2 && y < floor && x > 0 && x < ROOM - 1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          grid[y][x] = '.'
          ceilings[x] = Math.min(ceilings[x], y)
        }
      }
    }
  }
  return ceilings
}

const fillPits = (grid, pits, floors) => {
  for (const pit of pits) {
    const sides = [floors[pit.from - 1], floors[pit.to + 1]]
    const surface = Math.max(...sides) + 1
    for (let x = pit.from; x <= pit.to; x++) {
      for (let y = surface; y <= WATER_BOTTOM; y++) grid[y][x] = '~'
    }
  }
}

const dress = (grid, { segments, pits }, floors, ceilings, depth, rand, range) => {
  for (const s of segments) {
    for (let x = s.from; x <= s.to; x++) if (rand() < 0.55) grid[s.floor][x] = 'm'
  }
  for (let x = 1; x < ROOM - 1; x++) {
    if (rand() < 0.5 && ceilings[x] > 2 && grid[ceilings[x] - 1][x] === 'R') grid[ceilings[x] - 1][x] = 'p'
    if (rand() < 0.25 && ceilings[x] > 3 && grid[ceilings[x] - 2][x] === 'R') grid[ceilings[x] - 2][x] = 'p'
    if (depth > 0.4 && rand() < depth * 0.14 && ceilings[x] > 2) grid[ceilings[x] - 1][x] = 'V'
  }
  for (let run = range(1, 2); run > 0; run--) {
    const x = range(4, ROOM - 7)
    const y = ceilings[x] - 1
    if (y < 3) continue
    for (let d = 0; d < 3; d++) {
      if (grid[y][x + d] === '.' || grid[y - 1][x + d] === '.') continue
      grid[y][x + d] = 'p'
      grid[y - 1][x + d] = 's'
    }
  }
  const seam = segments[range(0, segments.length - 1)]
  for (let x = seam.from; x <= seam.to; x++) grid[seam.floor][x] = 'M'
  for (const pit of pits) {
    const left = floors[pit.from - 1]
    const right = floors[pit.to + 1]
    const surface = Math.max(left, right) + 1
    if (rand() < 0.7) {
      for (let y = left; y <= surface + 1; y++) grid[y][pit.from - 1] = 'M'
      for (let x = pit.from - 1; x >= 1 && floors[x] === left; x--) grid[left][x] = 'M'
    }
  }
}

const standingSpots = ({ segments }) => segments.slice(1)

const place = (x, row, kind) => ({ kind, x: x * BLOCK, row })

const populate = ({ segments, pits }, floors, depth, rand, range, grid) => {
  const enemies = []
  for (const s of standingSpots({ segments })) {
    if (s.to - s.from >= 2 && rand() < 0.55 + depth * 0.3) {
      enemies.push(place(range(s.from, s.to - 1), s.floor, 'crawler'))
    }
    if (rand() < 0.25 + depth * 0.3) enemies.push(place(s.from, s.floor, 'spitter'))
  }
  for (const pit of pits) {
    if (pit.to > pit.from && rand() < 0.7) enemies.push(place(pit.from, WATER_BOTTOM - 1, 'fish'))
  }
  for (const s of segments.slice(1, -1)) {
    if (rand() < 0.6) {
      const x = range(s.from, s.to)
      grid[s.floor - 1][x] = 'S'
    }
  }
  return enemies
}

const toRows = grid => grid.map(row => row.join(''))

export const generateRoom = (index, total, seed) => {
  const rand = seeded(seed + index * 7919)
  const range = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
  const depth = index / (total - 1)
  const core = index === total - 1

  const grid = Array.from({ length: ROOM }, (_, y) =>
    Array.from({ length: ROOM }, (_, x) => (x === 0 || y === 0 || x === ROOM - 1 || y === ROOM - 1 ? '#' : 'R')))

  const layout = walkFloors(rand, range)
  const floors = floorsByColumn(layout)
  const ceilings = carve(grid, floors, layout.pits, rand, range)
  fillPits(grid, layout.pits, floors)
  dress(grid, layout, floors, ceilings, depth, rand, range)
  const enemies = populate(layout, floors, depth, rand, range, grid)

  const first = layout.segments[0]
  const last = layout.segments[layout.segments.length - 1]
  const leftRow = first.floor - 2
  const rightRow = last.floor - 2
  grid[leftRow][0] = grid[leftRow + 1][0] = '.'
  if (!core) grid[rightRow][ROOM - 1] = grid[rightRow + 1][ROOM - 1] = '.'

  const midway = layout.segments[Math.floor(layout.segments.length / 2)]
  const cards = []
  if (index === 2) cards.push({ kind: 'repel', x: (midway.from + 1) * BLOCK, row: midway.floor })
  if (core) cards.push({ kind: 'core', x: (last.to - 2) * BLOCK, row: last.floor })

  grid[midway.floor - 1][midway.from + 1] = '.'
  grid[last.floor - 1][Math.max(last.from, last.to - 2)] = '.'

  return {
    map: toRows(grid),
    doors: core ? { left: leftRow } : { left: leftRow, right: rightRow },
    cards,
    enemies,
  }
}
