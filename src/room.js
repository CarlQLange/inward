import { BLOCK, ROOM } from './config.js'

const at = (x, row) => ({ x: x * BLOCK, row })

export const blank = () => Array.from({ length: ROOM }, (_, y) =>
  Array.from({ length: ROOM }, (_, x) => (x === 0 || y === 0 || x === ROOM - 1 || y === ROOM - 1 ? '#' : 'R')))

export const paint = (grid, x0, y0, x1, y1, tile) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = tile
}

const build = (rects, doorRow) => {
  const grid = blank()
  rects.forEach(([x0, y0, x1, y1, tile]) => paint(grid, x0, y0, x1, y1, tile))
  grid[doorRow][ROOM - 1] = grid[doorRow + 1][ROOM - 1] = '.'
  return grid.map(row => row.join(''))
}

const PEAT_WALL = {
  name: 'PEAT WALL',
  safetyNet: true,
  map: [
    '############################',
    '#RRRRRRRRRRRRRRRRRRRRRRRRRR#',
    '#RRRRRRpppppppppppRRRRRRRRR#',
    '#RRRR............wpp......R#',
    '#RRR.............wpp......R#',
    '#RR..............wpp......R#',
    '#R...............wpp......R#',
    '#................wpp......R#',
    '#................wppRRRRRRR#',
    '#.............ssswppRRRRRRR#',
    '#........mmmmmmmmmmmRRRRRRR#',
    '#........pppppppppppRRRRRRR#',
    '#...............RRRRRRRRRRR#',
    '#....mmm...................#',
    '#....RRR...................#',
    '#............RRR...........#',
    '#mmm.....RRR..............G.',
    '#RRR......................G.',
    '#...................MMMMMMM#',
    '#...........MMMMMMMMMRRRRRR#',
    '#RRRRRRR~~~~~~~~~~~~MRRRRRR#',
    '#RRRRRRR~~~~~~~~~~~~MRRRRRR#',
    '#RRRRRRR~~~~~~~~~~~~MRRRRRR#',
    '#RRRRRRR~~~~~~~~~~~~MRRRRRR#',
    '#RRRRRRR~~~~~~~~~~~~MRRRRRR#',
    '#RRRRRRR~~~~~~~~~~~~MRRRRRR#',
    '#RRRRRRRRRRRRRRRRRRRRRRRRRR#',
    '############################',
  ],
  spawn: at(5, 20),
  doors: { right: { row: 16 } },
  cards: [{ kind: 'bolt', ...at(23, 8) }],
  wares: [],
  enemies: [
    { kind: 'crawler', ...at(10, 16) },
    { kind: 'crawler', ...at(23, 18) },
    { kind: 'spitter', ...at(9, 10) },
    { kind: 'spitter', ...at(14, 15) },
    { kind: 'fish', ...at(12, 23) },
    { kind: 'fish', ...at(16, 22) },
  ],
}

const LAVA_CROSSING = {
  name: 'LAVA CROSSING',
  theme: 4,
  map: build([
    [1, 6, 26, 19, '.'],
    [1, 20, 8, 21, 'm'],
    [9, 20, 20, 25, 'L'],
    [21, 20, 26, 21, 'M'],
    [12, 14, 16, 14, 'R'],
  ], 18),
  spawn: at(2, 20),
  doors: { right: { row: 18 } },
  cards: [{ kind: 'frost', ...at(6, 20) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(4, 20) }, { kind: 'crawler', ...at(23, 20) }],
}

const CHIMNEY = {
  name: 'CHIMNEY',
  theme: 2,
  map: build([
    [1, 2, 26, 23, '.'],
    [1, 24, 26, 25, 'm'],
    [22, 8, 26, 9, 'R'],
    [1, 15, 5, 15, 'R'],
    [13, 19, 16, 19, 'w'],
  ], 6),
  spawn: at(3, 24),
  doors: { right: { row: 6 } },
  cards: [{ kind: 'seed', ...at(10, 24) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(16, 24) }, { kind: 'bat', ...at(20, 20) }],
}

const JUNKYARD = {
  name: 'JUNKYARD',
  theme: 3,
  map: build([
    [1, 4, 26, 19, '.'],
    [1, 20, 26, 21, 'M'],
    [23, 12, 26, 13, 'R'],
    [9, 19, 10, 19, 'S'],
    [14, 18, 15, 19, 'S'],
    [18, 19, 18, 19, 'S'],
  ], 10),
  spawn: at(2, 20),
  doors: { right: { row: 10 } },
  cards: [{ kind: 'repel', ...at(6, 20) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(12, 20) }, { kind: 'crawler', ...at(20, 20) }],
}

const QUARRY = {
  name: 'QUARRY',
  theme: 1,
  map: build([
    [1, 8, 23, 19, '.'],
    [1, 20, 23, 21, 'R'],
    [24, 14, 26, 19, 'B'],
    [6, 15, 10, 15, 'R'],
    [14, 12, 18, 12, 'w'],
    [14, 10, 18, 11, 's'],
  ], 18),
  spawn: at(2, 20),
  doors: { right: { row: 18 } },
  cards: [{ kind: 'hammer', ...at(8, 15) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(14, 20) }, { kind: 'spitter', ...at(16, 12) }],
}

const GAS_POCKET = {
  name: 'GAS POCKET',
  theme: 2,
  map: build([
    [1, 7, 24, 18, '.'],
    [25, 15, 26, 18, 'p'],
    [1, 19, 7, 20, 'm'],
    [8, 19, 18, 24, '~'],
    [8, 18, 18, 18, 'w'],
    [19, 19, 26, 19, 'm'],
    [19, 20, 26, 20, 'R'],
    [10, 7, 22, 9, 'g'],
  ], 17),
  spawn: at(2, 19),
  doors: { right: { row: 17 } },
  cards: [{ kind: 'ember', ...at(5, 19) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(13, 18) }, { kind: 'fish', ...at(12, 23) }],
}

const SOLID_WALL = {
  name: 'SOLID WALL',
  theme: 0,
  map: build([
    [1, 7, 18, 19, '.'],
    [23, 7, 26, 19, '.'],
    [1, 20, 26, 21, 'm'],
    [5, 15, 8, 15, 'R'],
    [12, 12, 15, 12, 'w'],
  ], 18),
  spawn: at(2, 20),
  doors: { right: { row: 18 } },
  cards: [{ kind: 'blink', ...at(13, 12) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(9, 20) }, { kind: 'crawler', ...at(16, 20) }],
}

const CHASM = {
  name: 'CHASM',
  theme: 1,
  map: build([
    [1, 8, 17, 19, '.'],
    [18, 8, 26, 12, '.'],
    [1, 20, 8, 21, 'R'],
    [9, 20, 17, 25, '~'],
  ], 11),
  spawn: at(2, 20),
  doors: { right: { row: 11 } },
  cards: [{ kind: 'grapple', ...at(6, 20) }],
  wares: [],
  enemies: [{ kind: 'crawler', ...at(4, 20) }, { kind: 'fish', ...at(12, 22) }],
}

export const STARTERS = [PEAT_WALL, LAVA_CROSSING, CHIMNEY, JUNKYARD, QUARRY, GAS_POCKET, SOLID_WALL, CHASM]
