import { ROOM } from './config.js'
import { M, props } from './materials.js'

const AREA = ROOM * ROOM
const LIQUID_CLASS = { [M.WATER]: 1, [M.LAVA]: 2, [M.OIL]: 3, [M.ACID]: 4 }
const LIQUID_STEP = 32
const SURFACE_STEP = 16
const GAS_SCALE = { [M.SMOKE]: 0.5, [M.STEAM]: 0.7, [M.METHANE]: 0.05 }
const GAS_CHANNEL = { [M.SMOKE]: 0, [M.STEAM]: 1, [M.METHANE]: 2 }

export const CELL_SHADER = { liquidStep: LIQUID_STEP, surfaceStep: SURFACE_STEP, size: ROOM }

const emptyLayer = () => ({ bytes: new Uint8Array(AREA * 4), scratch: new Uint8Array(AREA * 4), changed: true })

const swapIfChanged = layer => {
  const { bytes, scratch } = layer
  layer.changed = !scratch.every((v, i) => v === bytes[i])
  if (layer.changed) {
    layer.bytes = scratch
    layer.scratch = bytes
  }
  return layer
}

export const createCellLayers = () => ({ cells: emptyLayer(), fields: emptyLayer() })

const writeCells = (world, out) => {
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const m = world.mat[i]
      const p = props(m)
      const kind = LIQUID_CLASS[m] ?? 0
      let surface = 0
      if (kind) for (let up = y - 1; up >= 0 && world.mat[up * ROOM + x] === m && surface < 15; up--) surface++
      out[i * 4] = p.solid ? 255 : 0
      out[i * 4 + 1] = kind * LIQUID_STEP
      out[i * 4 + 2] = surface * SURFACE_STEP
      out[i * 4 + 3] = world.burn[i] > 0 || world.charge[i] > 0 ? 255 : 0
    }
  }
}

const writeFields = (world, out) => {
  out.fill(0)
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const m = world.mat[i]
      const channel = GAS_CHANNEL[m]
      if (channel !== undefined) out[i * 4 + channel] = Math.min(255, 110 + world.life[i] * GAS_SCALE[m] * 145)
      const hot = world.burn[i] > 0 ? 255 : m === M.LAVA ? 200 : 0
      out[i * 4 + 3] = hot
    }
  }
}

export const refreshCells = (layers, world) => {
  writeCells(world, layers.cells.scratch)
  writeFields(world, layers.fields.scratch)
  swapIfChanged(layers.cells)
  swapIfChanged(layers.fields)
}
