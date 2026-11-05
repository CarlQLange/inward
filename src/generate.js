import { BLOCK, ROOM, TUNING } from './config.js'

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
const SOLID = new Set(['#', 'R', 'm', 'p', 'w', 'M', 'G', 's', 'S', 'V', 'I', 'B', 'W'])

export const LAYOUTS = {
  caves: { length: [3, 6], gap: [2, 3], pits: 0.45, rise: [-3, 3], headroom: [7, 10], blobs: [2, 4], ledges: [2, 5] },
  hall: { length: [6, 10], gap: [2, 2], pits: 0.1, rise: [-1, 1], headroom: [13, 17], blobs: [0, 1], ledges: [1, 2], pillars: true },
  tunnels: { length: [4, 7], gap: [2, 2], pits: 0.15, rise: [-2, 2], headroom: [3, 4], blobs: [0, 0], ledges: [0, 0], buried: true },
  islands: { length: [2, 4], gap: [2, 3], pits: 0.95, rise: [-2, 2], headroom: [9, 13], blobs: [3, 5], ledges: [1, 2] },
  terraces: { length: [3, 5], gap: [2, 2], pits: 0, rise: [2, 3], headroom: [8, 10], blobs: [1, 2], ledges: [0, 1], stairs: true },
  chasm: { length: [4, 6], gap: [2, 2], pits: 0, rise: [0, 0], headroom: [11, 15], blobs: [2, 3], ledges: [1, 2], bridge: true },
  cistern: { length: [2, 3], gap: [2, 3], pits: 1, rise: [-1, 1], headroom: [10, 14], blobs: [2, 4], ledges: [2, 3], low: true },
  chimney: { length: [4, 7], gap: [2, 2], pits: 0.2, rise: [-1, 1], headroom: [16, 20], blobs: [2, 3], ledges: [6, 9], low: true },
}
const THEME_LAYOUTS = [
  ['caves', 'hall', 'terraces', 'chimney', 'caves'],
  ['cistern', 'cistern', 'islands', 'chasm', 'hall'],
  ['caves', 'tunnels', 'islands', 'terraces'],
  ['tunnels', 'hall', 'terraces', 'chasm'],
  ['chasm', 'hall', 'islands', 'chimney'],
  ['chimney', 'terraces', 'chasm', 'tunnels'],
  ['tunnels', 'islands', 'chimney', 'caves'],
  ['hall', 'chasm'],
]

const walkBridge = (layout, range) => {
  const floor = range(14, 19)
  const left = range(4, 6)
  const right = range(4, 6)
  return {
    segments: [{ from: 1, to: left, floor }, { from: ROOM - 1 - right, to: ROOM - 2, floor }],
    pits: [{ from: left + 1, to: ROOM - 2 - right }],
    bridge: { from: left + 1, to: ROOM - 2 - right, row: floor },
  }
}

const walkFloors = (rand, range, pitChance, layout) => {
  if (layout.bridge) return walkBridge(layout, range)
  const segments = []
  const pits = []
  let x = 1
  const climbing = rand() < 0.5
  let floor = layout.stairs
    ? (climbing ? LOWEST_FLOOR : HIGHEST_FLOOR + 1)
    : layout.low ? range(LOWEST_FLOOR - 3, LOWEST_FLOOR) : range(HIGHEST_FLOOR + 3, LOWEST_FLOOR - 2)
  while (x < ROOM - 1) {
    const length = range(...layout.length)
    const to = Math.min(x + length - 1, ROOM - 2)
    const last = ROOM - 2 - to < 3
    const end = last ? ROOM - 2 : to
    segments.push({ from: x, to: end, floor })
    if (last) break
    const gap = rand() < pitChance ? range(...layout.gap) : 0
    if (gap) pits.push({ from: end + 1, to: end + gap })
    x = end + gap + 1
    const step = layout.stairs ? (climbing ? -1 : 1) * range(...layout.rise) : range(gap ? Math.max(-2, layout.rise[0]) : layout.rise[0], layout.rise[1])
    floor = clamp(floor + step, HIGHEST_FLOOR, LOWEST_FLOOR)
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
  const near = around.map(d => floors[x + d]).filter(f => f !== null && f !== undefined)
  return near.length ? Math.min(...near) : Math.min(...floors.filter(f => f !== null))
}

const carve = (grid, floors, range, layout) => {
  const ceilings = new Array(ROOM).fill(1)
  for (let x = 1; x < ROOM - 1; x++) {
    const ceiling = clamp(nearestFloor(floors, x) - range(...layout.headroom), 2, ROOM)
    const bottom = floors[x] === null ? WATER_BOTTOM : floors[x] - 1
    ceilings[x] = ceiling
    for (let y = ceiling; y <= bottom; y++) grid[y][x] = '.'
  }
  for (let blob = range(...layout.blobs); blob > 0; blob--) {
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

const fillPits = (grid, pits, floors, oilChance, lavaChance, rand) => {
  for (const pit of pits) {
    const surface = surfaceOf(floors, pit)
    pit.lava = rand() < lavaChance
    for (let x = pit.from; x <= pit.to; x++) {
      for (let y = surface; y <= WATER_BOTTOM; y++) grid[y][x] = pit.lava ? 'L' : '~'
    }
    if (!pit.lava && rand() < oilChance) {
      for (let x = pit.from; x <= pit.to; x++) grid[surface][x] = 'o'
    }
  }
}

const addLedges = (grid, floors, ceilings, range, rand, count, theme) => {
  for (let i = 0; i < count; i++) {
    const length = range(3, 5)
    const x = range(2, ROOM - 3 - length)
    const low = Math.min(...floors.slice(x, x + length).map(f => f ?? WATER_BOTTOM))
    const y = low - range(3, 5)
    const roof = Math.max(...ceilings.slice(x, x + length))
    if (y <= roof + 3) continue
    const material = rand() < 0.7 ? theme.ledge : 'R'
    for (let d = 0; d < length; d++) if (grid[y][x + d] === '.') grid[y][x + d] = material
  }
}

const addPillars = (grid, floors, ceilings, range, material) => {
  for (let x = range(5, 7); x < ROOM - 5; x += range(6, 8)) {
    const floor = floors[x]
    if (floor === null || floor === undefined) continue
    const hanging = floor - range(3, 5)
    for (let y = ceilings[x]; y <= hanging; y++) {
      grid[y][x] = material
      grid[y][x + 1] = material
    }
  }
}

const layRail = (grid, ceilings, from, to) => {
  for (let x = Math.max(1, from); x <= Math.min(ROOM - 2, to); x++) {
    const here = ceilings[x] - 1
    const next = x < to ? ceilings[x + 1] - 1 : here
    for (let y = Math.min(here, next); y <= Math.max(here, next); y++) if (y >= 1 && grid[y][x] === 'R') grid[y][x] = 'M'
  }
}

const hangLoad = (grid, ceilings, x, theme) => {
  const { strut = 'p', load = 's', rail = false } = theme.hopper ?? {}
  if (rail) layRail(grid, ceilings, x - 5, x + 7)
  for (let d = 0; d < 3; d++) {
    const y = ceilings[x + d] - 1
    if (y < 3 || grid[y - 1][x + d] === '.') continue
    grid[y][x + d] = strut
    grid[y - 1][x + d] = load
  }
}

const dress = (grid, { segments, pits }, floors, ceilings, depth, lean, rand, range, theme) => {
  const help = 1 - depth
  for (const s of segments) {
    for (let x = s.from; x <= s.to; x++) if (rand() < 0.6) grid[s.floor][x] = theme.top
  }
  for (let x = 1; x < ROOM - 1; x++) {
    const roof = ceilings[x] - 1
    if (roof < 1 || grid[roof][x] !== 'R') continue
    const peat = (theme.peat ?? 0) + (lean.fuel ? help * 0.3 : 0)
    if (rand() < peat) grid[roof][x] = 'p'
    if (roof > 1 && grid[roof - 1][x] === 'R' && rand() < peat / 2) grid[roof - 1][x] = 'p'
    if (rand() < (theme.volatile ?? 0) + (depth > 0.35 ? depth * 0.1 : 0)) grid[roof][x] = 'V'
  }
  for (let run = range(1, 2); run > 0; run--) hangLoad(grid, ceilings, range(4, ROOM - 7), theme)
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
  if (rand() < (theme.gas ?? 0) + (depth > 0.45 ? 0.3 : 0)) {
    for (let pocket = range(1, 3); pocket > 0; pocket--) {
      const cx = range(4, ROOM - 5)
      const top = ceilings[cx]
      for (let y = top; y < top + 2; y++) {
        for (let x = cx - 2; x <= cx + 2; x++) if (grid[y]?.[x] === '.') grid[y][x] = 'g'
      }
    }
  }
}

export const THEMES = [
  { name: 'THE MOSS CAVES', top: 'm', ledge: 'w', skin: null, pits: 0, peat: 0.4, props: { lamp: 0.6, tank: 0.2 }, flourish: 'roots', foes: ['crawler', 'spitter', 'bat', 'slug', 'tick', 'snapweed', 'gnat', 'pillbug', 'spore', 'mimic'] },
  { name: 'THE DROWNED HALLS', top: 'R', ledge: 'R', bridge: 'B', skin: 'brick', pits: 0.3, oil: 0.1, hopper: { strut: 'G', load: 's', rail: true }, props: { battery: 0.7, tank: 0.35, lamp: 0.1 }, flourish: 'seepage', foes: ['crawler', 'slug', 'bat', 'imp', 'gasbag', 'dripper', 'pillbug', 'coil', 'tick'] },
  { name: 'THE PEAT BOG', top: 'p', ledge: 'w', skin: 'fungus', pits: 0.1, oil: 0.3, peat: 0.6, props: { lamp: 0.6, tank: 0.15 }, flourish: 'bog', foes: ['spitter', 'spore', 'slug', 'gasbag', 'emberbat', 'gnat', 'snapweed', 'dripper', 'tick'] },
  { name: 'THE OLD WORKINGS', top: 'M', ledge: 'M', bridge: 'M', skin: 'brick', pits: -0.1, gas: 0.3, scrap: 0.4, hopper: { strut: 'G', load: 'S', rail: true }, props: { battery: 0.8, carboy: 0.25, lamp: 0.1 }, flourish: 'struts', foes: ['turret', 'crawler', 'bomber', 'crab', 'gasbag', 'scrapper', 'coil', 'stilt', 'pillbug'] },
  { name: 'THE FOUNDRY', top: 'M', ledge: 'M', bridge: 'M', skin: 'charred', pits: 0.15, lava: 0.7, scrap: 0.3, hopper: { strut: 'G', load: 'S', rail: true }, props: { ladle: 0.5, tank: 0.5, battery: 0.3 }, flourish: 'forge', foes: ['turret', 'bomber', 'crab', 'slime', 'scrapper', 'coil', 'stilt', 'crawler'] },
  { name: 'THE ICE SHAFTS', top: 'I', ledge: 'I', bridge: 'I', skin: 'ice', pits: 0.2, hopper: { strut: 'I', load: 's' }, props: { carboy: 0.3, tank: 0.2, lamp: 0.1 }, flourish: 'icicles', foes: ['imp', 'crab', 'slime', 'bat', 'urchin', 'stilt', 'shade', 'tick', 'crawler'] },
  { name: 'THE CRYSTAL HOLLOW', top: 'R', ledge: 'V', bridge: 'R', skin: 'crystal', pits: 0.1, gas: 0.4, volatile: 0.2, hopper: { strut: 'V', load: 'S' }, props: { battery: 0.35, carboy: 0.3, lamp: 0.25 }, flourish: 'crystals', foes: ['spore', 'emberbat', 'bomber', 'turret', 'slime', 'shade', 'urchin', 'gnat', 'bat'] },
  { name: 'THE CORE', top: 'R', ledge: 'R', skin: 'charred', pits: 0, lava: 0.5, volatile: 0.1, foes: [] },
]

export const WATER_FOES = ['fish', 'jelly', 'puffer', 'lantern']

const HABITAT = {
  bat: 'air', spore: 'air', emberbat: 'air', gasbag: 'air', gnat: 'air', shade: 'air',
  snapweed: 'ceiling', dripper: 'ceiling',
  fish: 'water', jelly: 'water', puffer: 'water', lantern: 'water',
}
const GROUP = { gnat: 5 }

const FLOURISHES = {
  roots: ({ grid, ceilings, range, depth }) => {
    for (let n = range(2, 4); n > 0; n--) {
      const x = range(3, ROOM - 4)
      hangVine(grid, x, ceilings[x], range(2, 5))
    }
  },
  seepage: ({ grid, floors, ceilings, range, rand }) => {
    for (let x = 2; x < ROOM - 2; x++) {
      const floor = floors[x]
      if (floor !== null && floor >= LOWEST_FLOOR - 1 && grid[floor - 1][x] === '.' && rand() < 0.8) grid[floor - 1][x] = '~'
    }
    const x = range(4, ROOM - 5)
    hangVine(grid, x, ceilings[x], range(1, 3))
  },
  bog: ({ grid, floors, ceilings, range, rand }) => {
    for (let n = range(1, 3); n > 0; n--) {
      const x = range(3, ROOM - 4)
      hangVine(grid, x, ceilings[x], range(2, 4))
    }
    for (let x = 2; x < ROOM - 2; x++) {
      const floor = floors[x]
      if (floor !== null && rand() < 0.5 && grid[floor + 1]?.[x] === 'R') grid[floor + 1][x] = 'p'
    }
  },
  struts: ({ grid, floors, ceilings, range }) => {
    for (let n = range(1, 2); n > 0; n--) {
      const x = range(4, ROOM - 6)
      const floor = floors[x]
      if (floor === null || floor - ceilings[x] < 6) continue
      for (let y = floor - 4; y >= ceilings[x]; y--) if (grid[y][x] === '.') grid[y][x] = 'M'
    }
  },
  forge: ({ grid, floors, range }) => {
    for (let n = range(1, 2); n > 0; n--) {
      const x = range(4, ROOM - 5)
      const floor = floors[x]
      if (floor === null || floor === undefined || floors[x + 1] !== floor) continue
      if (grid[floor - 1][x] === '.' && grid[floor - 1][x + 1] === '.') grid[floor - 1][x] = grid[floor - 1][x + 1] = 'S'
    }
  },
  icicles: ({ grid, ceilings, range, rand }) => {
    for (let x = 2; x < ROOM - 2; x++) {
      if (rand() > 0.22) continue
      for (let y = ceilings[x], n = range(1, 3); n > 0 && grid[y]?.[x] === '.'; y++, n--) grid[y][x] = 'I'
    }
  },
  crystals: ({ grid, floors, ceilings, rand, depth }) => {
    const chance = depth < 0.3 ? 0.06 : 0.14
    for (let x = 2; x < ROOM - 2; x++) {
      if (rand() < chance && grid[ceilings[x]]?.[x] === '.') grid[ceilings[x]][x] = 'V'
      const floor = floors[x]
      if (floor !== null && rand() < chance && grid[floor - 1][x] === '.') grid[floor - 1][x] = 'V'
    }
  },
}

const hangVine = (grid, x, ceiling, length) => {
  for (let y = ceiling; y < ceiling + length; y++) {
    if (grid[y]?.[x] !== '.') return
    grid[y][x] = 'v'
  }
}

const pickFoe = (theme, rand, enemies) => {
  const spitters = enemies.filter(e => e.kind === 'spitter').length
  const open = theme.roster.filter(kind => kind !== 'spitter' || spitters < 2)
  return open[Math.floor(rand() * open.length)] ?? 'crawler'
}

const place = (x, row, kind) => ({ kind, x: x * BLOCK, row })

const placeFoe = (kind, s, grid, ceilings, range, enemies) => {
  const x = range(s.from, Math.max(s.from, s.to - 1))
  const habitat = HABITAT[kind]
  for (let n = GROUP[kind] ?? 1; n > 0; n--) {
    if (habitat === 'ceiling') {
      const roof = ceilings[x]
      if (grid[roof]?.[x] === '.') enemies.push({ kind, x: x * BLOCK, y: roof * BLOCK })
    } else enemies.push(place(x, habitat === 'air' ? s.floor - 4 : s.floor, kind))
  }
}

const populate = ({ segments, pits }, depth, lean, rand, range, grid, ceilings, theme) => {
  const enemies = []
  const crowd = theme.crowd ?? 1
  for (const s of segments.slice(1)) {
    const chance = (0.3 + depth * 0.45) * crowd
    for (let n = 0; n < 2 * crowd; n++) {
      if (rand() < chance * (n ? 0.5 : 1)) placeFoe(pickFoe(theme, rand, enemies), s, grid, ceilings, range, enemies)
    }
  }
  const swimmers = theme.swimmers ?? ['fish']
  for (const pit of pits) {
    if (pit.lava) continue
    enemies.push(place(pit.from, WATER_BOTTOM - 1, swimmers[Math.floor(rand() * swimmers.length)]))
  }
  if (theme.worm && depth > 0.4 && rand() < 0.5) {
    const x = range(6, ROOM - 8)
    enemies.push(place(x, Math.min(ROOM - 2, ceilings[x]), 'worm'))
  }
  for (const s of segments.slice(1, -1)) {
    if (rand() < (lean.scrap ? 0.9 : 0.5) + (theme.scrap ?? 0)) grid[s.floor - 1][range(s.from, s.to)] = 'S'
  }
  return enemies
}

const FUEL = new Set(['p', 'w', 'm', 'o', 'g', 'v', 'V'])
const CONDUCTS = new Set(['M', 'G', 'S', '~'])

const firstBelow = (grid, x, ceiling) => {
  for (let y = ceiling; y < ROOM - 1; y++) if (grid[y][x] !== '.') return grid[y][x]
  return '#'
}

const conductorNear = (grid, x, ceiling) => {
  const { reach } = TUNING.enemies.battery
  for (let y = Math.max(1, ceiling - 1); y <= Math.min(ROOM - 2, ceiling + reach); y++) {
    const span = reach - Math.abs(y - ceiling)
    for (let cx = Math.max(1, x - span); cx <= Math.min(ROOM - 2, x + span); cx++) if (CONDUCTS.has(grid[y][cx])) return true
  }
  return false
}

const PROP_SPOTS = {
  lamp: (grid, x, ceiling) => FUEL.has(firstBelow(grid, x, ceiling)),
  battery: conductorNear,
  tank: (grid, x, ceiling) => firstBelow(grid, x, ceiling) === 'L',
  ladle: (grid, x, ceiling) => firstBelow(grid, x, ceiling) === '~',
}
const PROP_OFFSET = { lamp: 1, battery: 0, tank: -2, carboy: 0, ladle: -1 }

const hangProps = (grid, ceilings, rand, range, enemies, theme, event) => {
  const spots = Array.from({ length: ROOM - 6 }, (_, i) => i + 3)
    .filter(x => grid[ceilings[x]]?.[x] === '.' && ceilings[x] > 1 && grid[ceilings[x]][x - 1] === '.' && grid[ceilings[x]][x + 1] === '.')
  const held = theme.hopper?.strut === 'G' && event === 'collapse' ? { battery: 1 } : {}
  for (const [kind, chance] of Object.entries({ ...theme.props, ...held })) {
    if (rand() > chance) continue
    const fits = PROP_SPOTS[kind]
    const liked = fits ? spots.filter(x => fits(grid, x, ceilings[x])) : spots
    const pool = liked.length ? liked : spots
    for (let n = kind === 'lamp' ? range(1, 2) : 1; n > 0 && pool.length; n--) {
      const x = pool[Math.floor(rand() * pool.length)]
      enemies.push({ kind, x: x * BLOCK + PROP_OFFSET[kind], y: ceilings[x] * BLOCK })
    }
  }
}

const rot = (grid, rand, share) => {
  for (let y = 1; y < ROOM - 1; y++) {
    for (let x = 1; x < ROOM - 1; x++) if (grid[y][x] === 'M' && rand() < share) grid[y][x] = 'S'
  }
}

const standing = (grid, extra) => (x, y) => {
  const solid = (a, b) => a < 0 || b < 0 || a >= ROOM || b >= ROOM || SOLID.has(grid[b][a])
  const wet = (a, b) => ['~', 'o'].includes(grid[b]?.[a])
  const stands = solid(x, y + 1) || wet(x, y) || wet(x, y + 1) || grid[y]?.[x] === 'v' || extra.has(`${x},${y}`)
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

const shaft = (grid, c, top, bottom, ladders) => {
  for (let y = Math.max(top, 1); y <= bottom; y++) {
    for (let x = c; x <= c + 3; x++) grid[y][x] = ladders && (x === c + 1 || x === c + 2) ? 'v' : '.'
  }
  let side = 0
  let last = top
  const ledge = y => {
    grid[y][c + side] = 'R'
    side = side === 0 ? 3 : 0
    last = y
  }
  for (let y = top + (top === 0 ? 4 : 3); y <= bottom - 1; y += 3) ledge(y)
  if (last > top && last < bottom - 2) ledge(bottom - 2)
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

const addVerticalDoors = (grid, links, layout, floors, doors, anchors, rand, ladders) => {
  const columnFor = () => {
    const s = widestSegment(layout.segments, rand)
    return clamp(s.from, 2, ROOM - 6)
  }
  if (links.up) {
    const c = columnFor()
    const floor = floors[c + 1] ?? floors[c] ?? WATER_BOTTOM
    shaft(grid, c, 0, floor - 1, ladders)
    grid[0][c + 1] = grid[0][c + 2] = '.'
    doors.up = { col: c + 1 }
    anchors.push([c + 1, 1])
  }
  if (links.down) {
    const c = columnFor()
    const floor = Math.min(...[c, c + 1, c + 2, c + 3].map(x => floors[x] ?? WATER_BOTTOM))
    shaft(grid, c, floor, ROOM - 2, ladders)
    grid[ROOM - 1][c + 1] = grid[ROOM - 1][c + 2] = '.'
    doors.down = { col: c + 1 }
    anchors.push([c + 1, ROOM - 2])
  }
}

export const LOCK_CELLS = {
  left: ({ row }) => [[0, row], [0, row + 1], [1, row], [1, row + 1]],
  right: ({ row }) => [[ROOM - 1, row], [ROOM - 1, row + 1], [ROOM - 2, row], [ROOM - 2, row + 1]],
  up: ({ col }) => [[col, 0], [col + 1, 0], [col, 1], [col + 1, 1]],
  down: ({ col }) => [[col, ROOM - 1], [col + 1, ROOM - 1], [col, ROOM - 2], [col + 1, ROOM - 2]],
}
const LOCK_TILES = { peat: 'p', gate: 'G', brick: 'B', ice: 'I', scrap: 'S', seal: '#' }

const hangLockLamp = (grid, ceilings, dir, enemies) => {
  const columns = dir === 'left' ? [2, 3, 4] : [ROOM - 3, ROOM - 4, ROOM - 5]
  const x = columns.find(c => grid[ceilings[c]]?.[c] === '.')
  if (x !== undefined) enemies.push({ kind: 'lamp', x: x * BLOCK + 1, y: ceilings[x] * BLOCK })
}

const applyLocks = (grid, links, doors, layout, enemies, ceilings) => {
  const first = layout.segments[0]
  const last = layout.segments[layout.segments.length - 1]
  for (const [dir, link] of Object.entries(links)) {
    if (!link.lock || !doors[dir]) continue
    for (const [x, y] of LOCK_CELLS[dir](doors[dir])) grid[y][x] = LOCK_TILES[link.lock]
    if (link.lock !== 'peat') continue
    if (dir === 'left' || dir === 'right') hangLockLamp(grid, ceilings, dir, enemies)
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

const addVault = (grid, floors, ceilings, range) => {
  for (let tries = 0; tries < 30; tries++) {
    const x = range(3, ROOM - 8)
    const y = range(2, ROOM - 7)
    const clear = () => {
      for (let cy = y - 1; cy <= y + 4; cy++) {
        for (let cx = x - 1; cx <= x + 5; cx++) if (grid[cy]?.[cx] !== 'R') return false
      }
      return true
    }
    if (!clear()) continue
    for (let cy = y; cy <= y + 2; cy++) for (let cx = x; cx <= x + 3; cx++) grid[cy][cx] = '.'
    return { x: x + 1, row: y + 3 }
  }
  return null
}

const EVENT_SETUP = {
  flood: (grid, layout, ceilings, range) => {
    for (let n = 0; n < 2; n++) {
      const x = range(3, ROOM - 4)
      const y = Math.max(1, ceilings[x] - 1)
      grid[y][x] = 'W'
    }
  },
  gasworks: (grid, layout, ceilings, range) => {
    for (let n = 0; n < 6; n++) {
      const cx = range(3, ROOM - 4)
      const top = ceilings[cx]
      for (let y = top; y < top + 3; y++) for (let x = cx - 2; x <= cx + 2; x++) if (grid[y]?.[x] === '.') grid[y][x] = 'g'
    }
  },
  collapse: (grid, layout, ceilings, range, theme) => {
    const { strut = 'p', load = 's' } = theme.hopper ?? {}
    for (let x = 1; x < ROOM - 1; x++) {
      const y = ceilings[x] - 1
      if (y > 1 && grid[y][x] === 'R') grid[y][x] = strut
      if (y > 2 && grid[y - 1][x] === 'R') grid[y - 1][x] = load
    }
  },
}

const attempt = ({ seed, depth, links, lean, special, theme: region, themeIndex }) => {
  const aquatic = HABITAT[special.force] === 'water'
  const theme = aquatic ? { ...region, lava: 0 } : region
  const rand = seeded(seed)
  const range = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
  const help = 1 - depth

  const grid = Array.from({ length: ROOM }, (_, y) =>
    Array.from({ length: ROOM }, (_, x) => (x === 0 || y === 0 || x === ROOM - 1 || y === ROOM - 1 ? '#' : 'R')))

  const layoutName = aquatic ? 'cistern' : THEME_LAYOUTS[themeIndex][Math.floor(rand() * THEME_LAYOUTS[themeIndex].length)]
  const shape = LAYOUTS[layoutName]
  const layout = walkFloors(rand, range, clamp(shape.pits + (theme.pits ?? 0) + (lean.water ? help * 0.2 : 0), 0, 1), shape)
  const floors = floorsByColumn(layout)
  const ceilings = carve(grid, floors, range, shape)
  const gentle = depth < 0.3
  fillPits(grid, layout.pits, floors, (theme.oil ?? 0) + (lean.fuel ? help * 0.3 : 0.1), (theme.lava ?? 0) * (gentle ? 0.5 : 1), rand)
  addLedges(grid, floors, ceilings, range, rand, range(...shape.ledges), theme)
  if (shape.pillars) addPillars(grid, floors, ceilings, range, theme.ledge === 'w' ? 'w' : 'R')
  if (layout.bridge) {
    const planks = layout.pits[0].lava ? 'M' : theme.bridge ?? 'w'
    for (let x = layout.bridge.from; x <= layout.bridge.to; x++) grid[layout.bridge.row][x] = planks
  }
  dress(grid, layout, floors, ceilings, depth, lean, rand, range, theme)
  if (theme.rust) rot(grid, rand, theme.rust)
  if (theme.shards) for (const s of layout.segments) if (rand() < theme.shards) grid[s.floor][range(s.from, s.to)] = 'V'
  FLOURISHES[theme.flourish]?.({ grid, floors, ceilings, range, rand, depth })
  for (let n = theme.vines ?? 0; n > 0; n--) {
    const x = range(2, ROOM - 3)
    hangVine(grid, x, ceilings[x], range(3, 8))
  }
  const enemies = populate(layout, depth, lean, rand, range, grid, ceilings, theme)
  if (special.force) {
    const kind = special.force
    if (aquatic) {
      const pit = layout.pits.find(p => !p.lava)
      if (pit) enemies.push(place(pit.from, WATER_BOTTOM - 1, kind))
    } else placeFoe(kind, layout.segments[Math.floor(layout.segments.length / 2)], grid, ceilings, range, enemies)
  }
  hangProps(grid, ceilings, rand, range, enemies, theme, special.event)
  EVENT_SETUP[special.event]?.(grid, layout, ceilings, range, theme)

  const { doors, anchors } = addDoors(grid, links, layout, floors)
  addVerticalDoors(grid, links, layout, floors, doors, anchors, rand, special.ladders)

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
  if (special.plantCard) cards.push({ kind: special.plantCard, x: mark(midway, 3) * BLOCK, row: midway.floor })
  if (special.plantChest) cards.push({ kind: 'chest', relic: special.plantChest, x: mark(midway, 2) * BLOCK, row: midway.floor })
  if (special.inhabitant === 'mole') {
    enemies.push(place(mark(midway, 0), midway.floor, 'mole'))
    wares.push({ kind: 'bomb', x: mark(midway, 2) * BLOCK, row: midway.floor })
    if (midway.to - midway.from >= 4) wares.push({ kind: 'heart', x: mark(midway, 4) * BLOCK, row: midway.floor })
    if (midway.to - midway.from >= 5) wares.push({ kind: 'upgrade', x: mark(midway, 5) * BLOCK, row: midway.floor })
    wares.push({ kind: 'relic', x: mark(first, 1) * BLOCK, row: first.floor })
  } else if (special.inhabitant) enemies.push(place(mark(first, 2), first.floor, special.inhabitant))
  if (special.event === 'nest') enemies.push(place(Math.max(midway.from, midway.to - 2), midway.floor, 'nest'))
  if (special.event === 'altar') cards.push({ kind: 'altar', x: mark(midway, 1) * BLOCK, row: midway.floor })
  if (special.event === 'chest') {
    const x = mark(midway, 1)
    if (theme.mimics && rand() < 0.3) enemies.push(place(x, midway.floor, 'mimic'))
    else cards.push({ kind: 'chest', x: x * BLOCK, row: midway.floor })
  }
  if (special.event === 'vault') {
    const vault = addVault(grid, floors, ceilings, range)
    if (vault) cards.push({ kind: 'chest', x: vault.x * BLOCK, row: vault.row })
  }
  if (special.event === 'arena') {
    for (const s of layout.segments.slice(1)) placeFoe(pickFoe(theme, rand, enemies), s, grid, ceilings, range, enemies)
  }
  const spare = mark(last, 1)

  const ok = passes(grid, anchors, goals)
  applyLocks(grid, links, doors, layout, enemies, ceilings)

  const drains = []
  grid[0].forEach((c, x) => { if (c !== '#') drains.push(x) })
  grid[ROOM - 1].forEach((c, x) => { if (c !== '#') drains.push((ROOM - 1) * ROOM + x) })
  return { ok, definition: { map: grid.map(row => row.join('')), doors, cards, wares, enemies, drains, layout: layoutName, spare: { x: spare * BLOCK, y: (last.floor - 1) * BLOCK } } }
}

const NO_LEAN = { metal: false, water: false, fuel: false, scrap: false }

export const generateRoom = ({ seed, depth, links, lean = NO_LEAN, special = {}, theme = THEMES[0], themeIndex = 0 }) => {
  const tryWith = (tries, extra = {}) => attempt({ seed: seed + tries * 104729, depth, links, lean, special: { ...special, ...extra }, theme, themeIndex })
  let result = tryWith(0)
  for (let tries = 1; tries < 50 && !result.ok; tries++) result = tryWith(tries, tries > 25 ? { ladders: true } : {})
  return { ...result.definition, passed: result.ok }
}
