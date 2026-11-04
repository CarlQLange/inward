export const M = Object.freeze({
  EMPTY: 0, BEDROCK: 1, ROCK: 2, MOSS: 3, PEAT: 4, WOOD: 5, METAL: 6,
  GATE: 7, SAND: 8, ASH: 9, WATER: 10, SMOKE: 11, STEAM: 12, SCRAP: 13, VOLATILE: 14,
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
  [M.VOLATILE]: { solid: true, flammability: 3, burnTime: 0.3, burnsTo: M.EMPTY, smoke: 0.5, explodes: true },
  [M.ASH]: { falls: true, expires: true },
  [M.WATER]: { liquid: true, conductance: 2 },
  [M.SMOKE]: { gas: true, expires: true, harmful: true },
  [M.STEAM]: { gas: true, expires: true },
}

export const props = mat => PROPS[mat]

const LEGEND = {
  '.': M.EMPTY, '#': M.BEDROCK, R: M.ROCK, m: M.MOSS, p: M.PEAT, w: M.WOOD,
  M: M.METAL, G: M.GATE, s: M.SAND, '~': M.WATER, S: M.SCRAP, V: M.VOLATILE,
}

export const parseMaterial = char => LEGEND[char]
