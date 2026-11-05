export const M = Object.freeze({
  EMPTY: 0, BEDROCK: 1, ROCK: 2, MOSS: 3, PEAT: 4, WOOD: 5, METAL: 6,
  GATE: 7, SAND: 8, ASH: 9, WATER: 10, SMOKE: 11, STEAM: 12, SCRAP: 13, VOLATILE: 14,
  ICE: 15, OIL: 16, METHANE: 17, BRICK: 18, LAVA: 19, VINE: 20, ACID: 21, SOURCE: 22,
  FLOE: 23, RIME: 24, STILL: 25, GLASS: 26, MUD: 27, SNOW: 28,
})

const PROPS = {
  [M.EMPTY]: {},
  [M.BEDROCK]: { solid: true },
  [M.ROCK]: { solid: true },
  [M.MOSS]: { solid: true, flammability: 0.9, burnTime: 2.2, burnsTo: M.ASH, smoke: 0.6 },
  [M.PEAT]: { solid: true, flammability: 0.45, burnTime: 4.5, burnsTo: M.ASH, smoke: 1.4 },
  [M.WOOD]: { solid: true, flammability: 0.7, burnTime: 3.5, burnsTo: M.EMPTY, smoke: 0.8 },
  [M.METAL]: { solid: true, conductance: 1 },
  [M.GATE]: { solid: true, conductance: 1, opensWhenCharged: true },
  [M.SAND]: { solid: true, falls: true, slides: true, sinks: true },
  [M.SCRAP]: { solid: true, falls: true, sinks: true, conductance: 1, magnetic: true },
  [M.VOLATILE]: { solid: true, flammability: 3, burnTime: 0.3, burnsTo: M.EMPTY, smoke: 0.5, blast: 2 },
  [M.ICE]: { solid: true, melts: true },
  [M.FLOE]: { solid: true, falls: true, floats: true, melts: true },
  [M.RIME]: { solid: true, expires: true, melts: true, startLife: 2.5 },
  [M.STILL]: { solid: true },
  [M.BRICK]: { solid: true },
  [M.GLASS]: { solid: true, clear: true, brittle: true },
  [M.MUD]: { thick: true, falls: true, sinks: true, smothers: true, bakes: true, conductance: 2 },
  [M.SNOW]: { solid: true, falls: true, slides: true, melts: true, smothers: true },
  [M.LAVA]: { liquid: true, hot: true },
  [M.VINE]: { flammability: 1.2, burnTime: 1, burnsTo: M.EMPTY, smoke: 0.3, climbable: true },
  [M.ACID]: { liquid: true, corrosive: true },
  [M.SOURCE]: { solid: true, source: true, startLife: 18 },
  [M.OIL]: { liquid: true, flammability: 2, burnTime: 1.6, burnsTo: M.EMPTY, smoke: 1 },
  [M.METHANE]: { gas: true, expires: true, flammability: 6, burnTime: 0.12, burnsTo: M.EMPTY, smoke: 0, blast: 1, startLife: 40 },
  [M.ASH]: { falls: true, expires: true },
  [M.WATER]: { liquid: true, conductance: 2 },
  [M.SMOKE]: { gas: true, expires: true, harmful: true },
  [M.STEAM]: { gas: true, expires: true },
}

export const props = mat => PROPS[mat]

export const MATERIAL_NAMES = {
  [M.BEDROCK]: 'BEDROCK', [M.ROCK]: 'ROCK', [M.MOSS]: 'MOSS', [M.PEAT]: 'PEAT', [M.WOOD]: 'WOOD',
  [M.METAL]: 'METAL', [M.SCRAP]: 'SCRAP', [M.SAND]: 'SAND', [M.WATER]: 'WATER', [M.OIL]: 'OIL',
  [M.ICE]: 'ICE', [M.FLOE]: 'FLOE', [M.RIME]: 'RIME', [M.SMOKE]: 'SMOKE', [M.STEAM]: 'STEAM', [M.METHANE]: 'MARSH GAS', [M.BRICK]: 'BRICKWORK', [M.LAVA]: 'LAVA', [M.VINE]: 'VINE', [M.ACID]: 'ACID', [M.SOURCE]: 'SPRINGHEAD', [M.GATE]: 'METAL GATE', [M.VOLATILE]: 'VOLATILE CRYSTAL',
  [M.GLASS]: 'GLASS', [M.MUD]: 'MUD', [M.SNOW]: 'SNOW',
}

const LEGEND = {
  '.': M.EMPTY, '#': M.BEDROCK, R: M.ROCK, m: M.MOSS, p: M.PEAT, w: M.WOOD,
  M: M.METAL, G: M.GATE, s: M.SAND, '~': M.WATER, S: M.SCRAP, V: M.VOLATILE, I: M.ICE, o: M.OIL, g: M.METHANE, B: M.BRICK, L: M.LAVA, A: M.ACID, W: M.SOURCE, v: M.VINE,
  x: M.GLASS, u: M.MUD, n: M.SNOW,
}

export const parseMaterial = char => LEGEND[char]
