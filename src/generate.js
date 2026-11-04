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
  { kind: 'spitter', from: 0.2, weight: 2 },
  { kind: 'bat', from: 0.2, weight: 2 },
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
    const chance = 0.25 + depth * 0.45
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

const standing = (grid, extra) => (x, y) => {
  const solid = (a, b) => a < 0 || b < 0 || a >= ROOM || b >= ROOM || SOLID.has(grid[b][a])
  const wet = (a, b) => grid[b]?.[a] === '~' || grid[b]?.[a] === 'o'
  const stands = solid(x, y + 1) || wet(x, y) || wet(x, y + 1) || extra.has(`${x},${y}`)
  return { solid, ok: !solid(x, y) && !solid(x, y - 1) && stands }
}

const arcIsOpen = (solid, x0, y0, x1, y1) => {
  const top = Math.min(y0, y1) - 1
  for (let y = top; y <= y0; y++) if (y >= 0 && solid(x0, y)) return false
  for (let y = top; y <= y1; y++) if (y >= 0 && solid(x1, y)) return false
  const dir = Math.sign(x1 - x0)
  for (let x = x0 + dir; x !== x1 && dir !== 0; x += dir) {
    if ((top >= 0 && solid(x, top)) || solid(x, top + 1)) return false
  }
  return true
}

const reachable = (grid, start, extra) => {
  const seen = new Set([start.join()])
  const queue = [start]
  const at = standing(grid, extra)
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

const passes = (grid, anchors, goals) => {
  const extra = new Set(anchors.map(a => a.join()))
  const sets = anchors.map(a => reachable(grid, a, extra))
  const joined = sets.every(seen => anchors.every(a => seen.has(a.join())))
  if (!joined || sets.length === 0) return joined
  const near = ([gx, gy]) => [...sets[0]].some(k => {
    const [x, y] = k.split(',').map(Number)
    return Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1
  })
  return goals.every(near)
}

const shaft = (grid, c, top, bottom) => {
  for (let y = Math.max(top, 1); y <= bottom; y++) {
    for (let x = c; x <= c + 3; x++) grid[y][x] = '.'
  }
  let side = 0
  for (let y = bottom - 2; y >= top + 2; y -= 3) {
    grid[y][c + side] = grid[y][c + side + 1] = 'R'
    side = side === 0 ? 2 : 0
  }
}

const widestSegment = (segments, rand) =>
  [...segments].sort((a, b) => (b.to - b.from) + rand() - (a.to - a.from) - rand())[0]

const addDoors = (grid, links, layout, floors) => {
  const doors = {}
  const anchors = []
  const first = layout.segments[0]
  const last = layout.segments[layout.segments.length - 1]
  if (links.left) {
    const row = first.floor - 2
    grid[row][0] = grid[row + 1][0] = '.'
    doors.left = { row }
    anchors.push([1, row + 1])
  }
  if (links.right) {
    const row = last.floor - 2
    grid[row][ROOM - 1] = grid[row + 1][ROOM - 1] = '.'
    doors.right = { row }
    anchors.push([ROOM - 2, row + 1])
  }
  return { doors, anchors, floors }
}

const addVerticalDoors = (grid, links, layout, floors, doors, anchors, rand) => {
  const columnFor = () => {
    const s = widestSegment(layout.segments, rand)
    return clamp(s.from, 2, ROOM - 6)
  }
  if (links.up) {
    const c = columnFor()
    const floor = floors[c + 1] ?? floors[c] ?? WATER_BOTTOM
    shaft(grid, c, 0, floor - 1)
    grid[0][c + 1] = grid[0][c + 2] = '.'
    doors.up = { col: c + 1 }
    anchors.push([c + 1, 1])
  }
  if (links.down) {
    const c = columnFor()
    const floor = Math.min(...[c, c + 1, c + 2, c + 3].map(x => floors[x] ?? WATER_BOTTOM))
    shaft(grid, c, floor, ROOM - 2)
    grid[ROOM - 1][c + 1] = grid[ROOM - 1][c + 2] = '.'
    doors.down = { col: c + 1 }
    anchors.push([c + 1, ROOM - 2])
  }
}

const LOCK_CELLS = {
  left: ({ row }) => [[0, row], [0, row + 1], [1, row], [1, row + 1]],
  right: ({ row }) => [[ROOM - 1, row], [ROOM - 1, row + 1], [ROOM - 2, row], [ROOM - 2, row + 1]],
  up: ({ col }) => [[col, 0], [col + 1, 0], [col, 1], [col + 1, 1]],
  down: ({ col }) => [[col, ROOM - 1], [col + 1, ROOM - 1], [col, ROOM - 2], [col + 1, ROOM - 2]],
}
const LOCK_TILES = { peat: 'p', gate: 'G', brick: 'B', ice: 'I', scrap: 'S' }

const applyLocks = (grid, links, doors, layout, enemies) => {
  const first = layout.segments[0]
  const last = layout.segments[layout.segments.length - 1]
  for (const [dir, link] of Object.entries(links)) {
    if (!link.lock || !doors[dir]) continue
    for (const [x, y] of LOCK_CELLS[dir](doors[dir])) grid[y][x] = LOCK_TILES[link.lock]
    if (link.lock !== 'peat') continue
    const s = dir === 'left' ? first : last
    const toward = dir === 'left' ? s.from + 2 : s.to - 2
    if (dir === 'left' || dir === 'right') {
      enemies.push(place(clamp(toward, s.from, s.to) - (dir === 'left' ? 0 : 1), s.floor, 'spitter'))
      for (let x = Math.min(toward, dir === 'left' ? 1 : ROOM - 2); x <= Math.max(toward, dir === 'left' ? 1 : ROOM - 2); x++) {
        if (grid[s.floor][x] === 'R' || grid[s.floor][x] === 'M') grid[s.floor][x] = 'm'
      }
    }
  }
}

const attempt = ({ seed, depth, links, lean, special }) => {
  const rand = seeded(seed)
  const range = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
  const help = 1 - depth

  const grid = Array.from({ length: ROOM }, (_, y) =>
    Array.from({ length: ROOM }, (_, x) => (x === 0 || y === 0 || x === ROOM - 1 || y === ROOM - 1 ? '#' : 'R')))

  const layout = walkFloors(rand, range, 0.45 + (lean.water ? help * 0.3 : 0))
  const floors = floorsByColumn(layout)
  const ceilings = carve(grid, floors, range)
  fillPits(grid, layout.pits, floors, depth > 0.2 || lean.fuel ? 0.35 + (lean.fuel ? help * 0.3 : 0) : 0, rand)
  addLedges(grid, floors, ceilings, range, rand, range(2, 4))
  dress(grid, layout, floors, ceilings, depth, lean, rand, range)
  const enemies = populate(layout, depth, lean, rand, range, grid, ceilings)

  const { doors, anchors } = addDoors(grid, links, layout, floors)
  addVerticalDoors(grid, links, layout, floors, doors, anchors, rand)

  const first = layout.segments[0]
  const last = layout.segments[layout.segments.length - 1]
  const midway = layout.segments[Math.floor(layout.segments.length / 2)]
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
  if (special.card) cards.push({ kind: 'skill', x: mark(midway, 1) * BLOCK, row: midway.floor })
  if (special.core) {
    cards.push({ kind: 'core', x: mark(last, 1) * BLOCK, row: last.floor })
    enemies.push(place(Math.max(midway.from, midway.to - 3), midway.floor, 'guardian'))
  }
  if (special.mole) {
    enemies.push(place(mark(midway, 0), midway.floor, 'mole'))
    wares.push({ kind: 'heart', x: mark(midway, 2) * BLOCK, row: midway.floor })
    if (midway.to - midway.from >= 4) wares.push({ kind: 'upgrade', x: mark(midway, 4) * BLOCK, row: midway.floor })
  }
  if (special.hermit) enemies.push(place(mark(first, 2), first.floor, 'hermit'))
  if (special.miner) enemies.push(place(mark(last, 2), last.floor, 'miner'))

  const ok = passes(grid, anchors, goals)
  applyLocks(grid, links, doors, layout, enemies)

  const drains = []
  grid[0].forEach((c, x) => { if (c !== '#') drains.push(x) })
  grid[ROOM - 1].forEach((c, x) => { if (c !== '#') drains.push((ROOM - 1) * ROOM + x) })
  return { ok, definition: { map: grid.map(row => row.join('')), doors, cards, wares, enemies, drains } }
}

const NO_LEAN = { metal: false, water: false, fuel: false, scrap: false }

export const generateRoom = ({ seed, depth, links, lean = NO_LEAN, special = {} }) => {
  let result = attempt({ seed, depth, links, lean, special })
  for (let tries = 1; tries < 60 && !result.ok; tries++) {
    result = attempt({ seed: seed + tries * 104729, depth, links, lean, special })
  }
  return { ...result.definition, passed: result.ok }
}
