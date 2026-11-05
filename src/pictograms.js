const ICONS = {
  FIRE: ['...#...', '..##...', '..###..', '.#####.', '.##.##.', '.#...#.', '..###..'],
  LAVA: ['..#....', '.###.#.', '.###.#.', '..#....', '#.#.#.#', '.#.#.#.', '#######'],
  ACID: ['...#...', '...#...', '..###..', '.#####.', '.##.##.', '.#####.', '..###..'],
  CHARGE: ['...##..', '..##...', '.##....', '.#####.', '...##..', '..##...', '.##....'],
  SMOKE: ['..##...', '.####..', '######.', '.######', '..#####', '.#...#.', '#.....#'],
  CRUSHED: ['.#####.', '#######', '#######', '.#####.', '...#...', '.#.#.#.', '..###..'],
  BITTEN: ['#.#.#.#', '#######', '.......', '.......', '.......', '#######', '#.#.#.#'],
  SHOT: ['.......', '#..###.', '..#####', '#.#####', '..#####', '#..###.', '.......'],
  BLOW: ['.......', '.##.##.', '.#####.', '.#####.', '.#####.', '..###..', '.......'],
  WATER: ['...#...', '...#...', '..###..', '.#####.', '.#####.', '.#####.', '..###..'],
  HEAL: ['.......', '.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  DEFAULT: ['...#...', '...#...', '...#...', '...#...', '...#...', '.......', '...#...'],
}

const struck = rows => rows.map((row, y) => [...row].map((c, x) => (x === y ? '#' : Math.abs(x - y) === 1 ? '.' : c)).join(''))

export const CAUSE_ICONS = {
  ...ICONS,
  ...Object.fromEntries(Object.entries(ICONS).map(([name, rows]) => [`${name}_NO`, struck(rows)])),
}

const INK = '#081012'

export const drawPictogram = (ctx, rows, x, y, colour, scale = 1) => {
  const left = Math.round(x) - 3 * scale
  const top = Math.round(y) - 3 * scale
  ctx.fillStyle = INK
  rows.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '#') ctx.fillRect(left + (i - 1) * scale, top + (j - 1) * scale, 3 * scale, 3 * scale)
  }))
  ctx.fillStyle = colour
  rows.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '#') ctx.fillRect(left + i * scale, top + j * scale, scale, scale)
  }))
}
