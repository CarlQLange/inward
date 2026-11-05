import { TUNING } from './config.js'

//                 asleep ring0 ring1 ring2 ring3 ring4 ring5 ring6 core
const LADDER = {
  green:          [1,     0,    0,    0,    0,    0,    0,    0,    0],
  shades:         [1,     1,    0,    0,    0,    0,    0,    0,    0],
  posterise:      [0,     0,    1,    0.55, 0,    0,    0,    0,    0],
  lcd:            [1,     1,    0.5,  0,    0,    0,    0,    0,    0],
  ghost:          [0.5,   0.5,  0.22, 0,    0,    0,    0,    0,    0],
  scanline:       [0,     0,    0,    0.5,  0.25, 0,    0,    0,    0],

  detail:         [0,     0,    0.06, 0.42, 0.6,  0.8,  0.9,  1,    1],
  buried:         [0.4,   0.4,  0.5,  0.68, 0.76, 0.78, 0.8,  0.8,  0.8],
  raised:         [0.2,   0.2,  0.1,  0,    0,    0,    0,    0,    0],
  bands:          [2,     2,    3,    4,    6,    10,   16,   32,   32],
  far:            [0,     0,    1,    1,    1,    1,    1,    1,    1],
  near:           [0,     0,    0,    1,    1,    1,    1,    1,    1],
  wall:           [0,     0,    0,    0,    0.35, 0.5,  0.8,  1,    1],
  parallax:       [0,     0,    0.3,  1,    1,    1,    1,    1.2,  1.4],
  cycle:          [0,     0,    0,    1,    1,    0.5,  0.3,  0.3,  0.3],
  blend:          [0,     0,    0,    1,    1,    1,    1,    1,    1],
  depth:          [0,     0,    0.16, 0.22, 0.27, 0.32, 0.38, 0.46, 0.56],

  light:          [0,     0,    0,    0,    1,    1,    1,    1,    1],
  ambient:        [1,     1,    1,    1,    0.42, 0.44, 0.42, 0.42, 0.46],
  fixtures:       [0,     0,    0,    0,    1,    1,    1,    1,    0],

  refract:        [0,     0,    0,    0,    0,    1,    1,    1,    1],
  reflect:        [0,     0,    0,    0,    0,    1,    1,    1,    1],
  haze:           [0,     0,    0,    0,    0,    1,    1,    1.2,  1.5],
  bloom:          [0,     0,    0,    0,    0.12, 0.8,  0.85, 0.95, 1.1],
  saturate:       [1,     1,    1,    1,    1.05, 1.15, 1.2,  1.3,  1.4],

  shafts:         [0,     0,    0,    0,    0,    0,    1,    1,    0.7],
  fog:            [0,     0,    0,    0,    0,    0.1,  1,    1,    1],
  ink:            [0,     0,    0,    0,    0,    0,    1,    1,    1],

  relief:         [0,     0,    0,    0,    0,    0.15, 0.3,  1,    1.2],
  unmoor:         [0,     0,    0,    0,    0,    0,    0,    1,    1.3],
  pit:            [0,     0,    0,    0,    0,    0,    0.12, 1,    1.3],

  bend:           [0,     0,    0,    0,    0,    0,    0,    0,    1],
}

export const ERA_KEYS = Object.keys(LADDER)

const LAST = LADDER.green.length - 1
const WAKE = TUNING.run.wakeDepth

const FADED_BY_POWER = ['lcd', 'ghost', 'scanline', 'posterise', 'refract', 'reflect', 'haze', 'bloom', 'shafts', 'fog', 'relief', 'unmoor', 'pit', 'bend', 'depth', 'parallax', 'cycle']

export const rowOf = depth => (depth <= WAKE ? depth / WAKE : 1 + ((depth - WAKE) / (1 - WAKE)) * (LAST - 1))

const sample = (values, row) => {
  const at = Math.max(0, Math.min(LAST, row))
  const low = Math.min(LAST - 1, Math.floor(at))
  return values[low] + (values[low + 1] - values[low]) * (at - low)
}

export const eraAt = (depth, power = 1) => {
  const row = rowOf(depth)
  const era = Object.fromEntries(ERA_KEYS.map(key => [key, sample(LADDER[key], row)]))
  era.row = row
  for (const key of FADED_BY_POWER) era[key] *= power
  return era
}

export const depthAmount = g => g.depthDrive ?? (g.seals > 0 && g.phase !== 'cleared' ? 1 : 0)

export const tileLook = depth => {
  const row = Math.round(rowOf(depth))
  return {
    row,
    detail: LADDER.detail[row],
    buried: LADDER.buried[row],
    raised: LADDER.raised[row],
    variety: row >= 3,
    fixtures: LADDER.fixtures[row] > 0,
  }
}
