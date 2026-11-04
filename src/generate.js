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
const SOLID = new Set(['#', 'R', 'm', 'p', 'w', 'M', 'G', 's', 'S', 'V', 'I'])

const walkFloors = (rand, range, pitChance) => {
  const segments = []
  const pits = []
  let x = 1
  let floor = range(HIGHEST_FLOOR + 3, LOWEST_FLOOR - 2)
  while (x < ROOM - 1) {
    const length = range(3, 6)
    const to = Math.min(x + length - 1, ROOM - 2)
    const last = ROOM - 2 - to < 4
    const end = last ? ROOM - 2 : to
    segments.push({ from: x, to: end, floor })
    if (last) break
    const gap = rand() < pitChance ? range(2, 3) : 0
    if (gap) pits.push({ from: end + 1, to: end + gap })
    x = end + gap + 1
    floor = clamp(floor + range(gap ? -2 : -3, 3), HIGHEST_FLOOR, LOWEST_FLOOR)
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
  return Math.min(...around.map(d => floors[x + d]).filter(f => f !== null && f !== undefined))
}

const carve = (grid, floors, range) => {
  const ceilings = new Array(ROOM).fill(1)
  for (let x = 1; x < ROOM - 1; x++) {
    const ceiling = clamp(nearestFloor(floors, x) - 7 - range(0, 3), 2, ROOM)
    const bottom = floors[x] === null ? WATER_BOTTOM : floors[x] - 1
    ceilings[x] = ceiling
    for (let y = ceiling; y <= bottom; y++) grid[y][x] = '.'
  }
  for (let blob = range(2, 4); blob > 0; blob--) {
    const cx = range(4, ROOM - 5)
    const cy = range(3, 10)
    const r = range(2, 4)
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (x <= 0 || x >= ROOM - 1 || y < 2) continue
        const floor = floors[x] ?? WATER_BOTTOM + 1
        if (y < floor && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          grid[y][x] = '.'
          ceilings[x] = Math.min(ceilings[x], y)
        }
      }
    }
  }
  return ceilings
}

const surfaceOf = (floors, pit) => Math.max(floors[pit.from - 1], floors[pit.to + 1]) + 1

const fillPits = (grid, pits, floors, oilChance, rand) => {
  for (const pit of pits) {
    const surface = surfaceOf(floors, pit)
    for (let x = pit.from; x <= pit.to; x++) {
      for (let y = surface; y <= WATER_BOTTOM; y++) grid[y][x] = '~'
    }
    if (rand() < oilChance) {
      for (let x = pit.from; x <= pit.to; x++) grid[surface][x] = 'o'
    }
  }
}

const addLedges = (grid, floors, ceilings, range, rand, count) => {
  for (let i = 0; i < count; i++) {
    const length = range(3, 5)
    const x = range(2, ROOM - 3 - length)
    const low = Math.min(...floors.slice(x, x + length).map(f => f ?? WATER_BOTTOM))
    const y = low - range(3, 5)
    const roof = Math.max(...ceilings.slice(x, x + length))
    if (y <= roof + 3) continue
    const material = rand() < 0.65 ? 'w' : 'R'
    for (let d = 0; d < length; d++) if (grid[y][x + d] === '.') grid[y][x + d] = material
  }
}

const dress = (grid, { segments, pits }, floors, ceilings, depth, lean, rand, range) => {
  const help = 1 - depth
  for (const s of segments) {
    for (let x = s.from; x <= s.to; x++) if (rand() < 0.55) grid[s.floor][x] = 'm'
  }
  for (let x = 1; x < ROOM - 1; x++) {
    const roof = ceilings[x] - 1
    if (roof < 1 || grid[roof][x] !== 'R') continue
    if (rand() < 0.5 + (lean.fuel ? help * 0.3 : 0)) grid[roof][x] = 'p'
    if (roof > 1 && grid[roof - 1][x] === 'R' && rand() < 0.25) grid[roof - 1][x] = 'p'
    if (depth > 0.35 && rand() < depth * 0.14) grid[roof][x] = 'V'
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
  const seams = 1 + (lean.metal && rand() < help ? 1 : 0)
  for (let i = 0; i < seams; i++) {
    const seam = segments[range(0, segments.length - 1)]
    for (let x = seam.from; x <= seam.to; x++) grid[seam.floor][x] = 'M'
  }
  for (const pit of pits) {
    if (rand() > 0.7) continue
    const left = floors[pit.from - 1]
    const surface = surfaceOf(floors, pit)
    for (let y = left; y <= surface + 1; y++) grid[y][pit.from - 1] = 'M'
    for (let x = pit.from - 1; x >= 1 && floors[x] === left; x--) grid[left][x] = 'M'
  }
  if (depth > 0.45) {
    for (let pocket = range(1, 3); pocket > 0; pocket--) {
      const cx = range(4, ROOM - 5)
      const top = ceilings[cx]
      for (let y = top; y < top + 2; y++) {
        for (let x = cx - 2; x <= cx + 2; x++) if (grid[y]?.[x] === '.') grid[y][x] = 'g'
      }
    }
  }
}

const ROSTER = [
  { kind: 'crawler', from: 0, weight: 3 },
  { kind: 'spitter', from: 0.1, weight: 2 },
  { kind: 'bat', from: 0.1, weight: 2 },
  { kind: 'spore', from: 0.25, weight: 2 },
  { kind: 'slug', from: 0.25, weight: 2 },
]

const pickFoe = (depth, rand, enemies) => {
  const spitters = enemies.filter(e => e.kind === 'spitter').length
  const open = ROSTER.filter(r => depth >= r.from && (r.kind !== 'spitter' || spitters < 2))
  let roll = rand() * open.reduce((n, r) => n + r.weight, 0)
  return open.find(r => (roll -= r.weight) <= 0)?.kind ?? 'crawler'
}

const place = (x, row, kind) => ({ kind, x: x * BLOCK, row })

const populate = ({ segments, pits }, depth, lean, rand, range, grid, ceilings) => {
  const enemies = []
  for (const s of segments.slice(1)) {
    const chance = 0.4 + depth * 0.3
    for (let n = 0; n < 2; n++) {
      if (rand() < chance * (n ? 0.5 : 1)) {
        const kind = pickFoe(depth, rand, enemies)
        const flying = kind === 'bat' || kind === 'spore'
        const x = range(s.from, Math.max(s.from, s.to - 1))
        enemies.push(place(x, flying ? s.floor - 4 : s.floor, kind))
      }
    }
  }
  for (const pit of pits) {
    enemies.push(place(pit.from, WATER_BOTTOM - 1, depth > 0.25 && rand() < 0.5 ? 'jelly' : 'fish'))
  }
  if (depth > 0.4) {
    const x = range(6, ROOM - 8)
    enemies.push(place(x, Math.min(ROOM - 2, ceilings[x]), 'worm'))
  }
  for (const s of segments.slice(1, -1)) {
    if (rand() < (lean.scrap ? 0.9 : 0.5)) grid[s.floor - 1][range(s.from, s.to)] = 'S'
  }
  return enemies
}

const standing = grid => (x, y) => {
  const solid = (a, b) => a < 0 || b < 0 || a >= ROOM || b >= ROOM || SOLID.has(grid[b][a])
  const wet = (a, b) => grid[b]?.[a] === '~' || grid[b]?.[a] === 'o'
  return { solid, ok: !solid(x, y) && !solid(x, y - 1) && (solid(x, y + 1) || wet(x, y) || wet(x, y + 1)) }
}

const arcIsOpen = (solid, x0, y0, x1, y1) => {
  const top = Math.min(y0, y1) - 2
  for (let y = top; y <= y0; y++) if (solid(x0, y)) return false
  for (let y = top; y <= y1; y++) if (solid(x1, y)) return false
  const dir = Math.sign(x1 - x0)
  for (let x = x0 + dir; x !== x1 && dir !== 0; x += dir) {
    if (solid(x, top) || solid(x, top + 1)) return false
  }
  return true
}

const reachable = (grid, start) => {
  const seen = new Set([start.join()])
  const queue = [start]
  const at = standing(grid)
  while (queue.length) {
    const [x, y] = queue.pop()
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -3; dy <= 10; dy++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= ROOM || ny < 1 || ny >= ROOM || seen.has(`${nx},${ny}`)) continue
        if (dy === -3 && Math.abs(dx) > 3) continue
        const { solid, ok } = at(nx, ny)
        if (!ok || !arcIsOpen(solid, x, y, nx, ny)) continue
        seen.add(`${nx},${ny}`)
        queue.push([nx, ny])
      }
    }
  }
  return seen
}

const passes = (grid, doors, goals) => {
  const seen = reachable(grid, [0, doors.left + 1])
  const near = ([gx, gy]) => [...seen].some(k => {
    const [x, y] = k.split(',').map(Number)
    return Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1
  })
  const door = doors.right === undefined || seen.has(`27,${doors.right + 1}`)
  return door && goals.every(near)
}

const attempt = (index, total, seed, lean) => {
  const rand = seeded(seed + index * 7919)
  const range = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
  const depth = index / (total - 1)
  const help = 1 - depth
  const core = index === total - 1

  const grid = Array.from({ length: ROOM }, (_, y) =>
    Array.from({ length: ROOM }, (_, x) => (x === 0 || y === 0 || x === ROOM - 1 || y === ROOM - 1 ? '#' : 'R')))

  const layout = walkFloors(rand, range, 0.45 + (lean.water ? help * 0.3 : 0))
  const floors = floorsByColumn(layout)
  const ceilings = carve(grid, floors, range)
  fillPits(grid, layout.pits, floors, depth > 0.2 || lean.fuel ? 0.35 + (lean.fuel ? help * 0.3 : 0) : 0, rand)
  addLedges(grid, floors, ceilings, range, rand, range(2, 4))
  dress(grid, layout, floors, ceilings, depth, lean, rand, range)
  const enemies = populate(layout, depth, lean, rand, range, grid, ceilings)

  const first = layout.segments[0]
  const last = layout.segments[layout.segments.length - 1]
  const midway = layout.segments[Math.floor(layout.segments.length / 2)]
  const leftRow = first.floor - 2
  const rightRow = last.floor - 2
  grid[leftRow][0] = grid[leftRow + 1][0] = '.'
  if (!core) grid[rightRow][ROOM - 1] = grid[rightRow + 1][ROOM - 1] = '.'
  for (const s of [first, last]) {
    for (let x = s.from; x <= Math.min(s.from + 2, s.to); x++) {
      if (grid[s.floor - 1][x] === 'S') grid[s.floor - 1][x] = '.'
    }
  }

  const cards = []
  const wares = []
  const goals = []
  const mark = (s, offset) => {
    const x = Math.min(s.from + offset, s.to)
    if (grid[s.floor - 1][x] !== '#') grid[s.floor - 1][x] = '.'
    goals.push([x, s.floor - 1])
    return x
  }
  if (index === 2 || index === 5) cards.push({ kind: 'skill', x: mark(midway, 1) * BLOCK, row: midway.floor })
  if (core) {
    cards.push({ kind: 'core', x: mark(last, 1) * BLOCK, row: last.floor })
    enemies.push(place(Math.max(midway.from, midway.to - 3), midway.floor, 'guardian'))
  }
  if (index === 3) {
    enemies.push(place(mark(midway, 0), midway.floor, 'mole'))
    wares.push({ kind: 'heart', x: mark(midway, 2) * BLOCK, row: midway.floor })
    if (midway.to - midway.from >= 4) wares.push({ kind: 'upgrade', x: mark(midway, 4) * BLOCK, row: midway.floor })
  }
  if (index === 1 || index === 4) enemies.push(place(mark(midway, 1), midway.floor, 'hermit'))
  if (index === 3 || index === 6) enemies.push(place(mark(last, 2), last.floor, 'miner'))

  const doors = core ? { left: leftRow } : { left: leftRow, right: rightRow }
  return { grid, doors, goals, definition: { map: grid.map(row => row.join('')), doors, cards, wares, enemies } }
}

const NO_LEAN = { metal: false, water: false, fuel: false, scrap: false }

export const generateRoom = (index, total, seed, lean = NO_LEAN) => {
  let result = attempt(index, total, seed, lean)
  for (let tries = 1; tries < 40 && !passes(result.grid, result.doors, result.goals); tries++) {
    result = attempt(index, total, seed + tries * 104729, lean)
  }
  return result.definition
}
