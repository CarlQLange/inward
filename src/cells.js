import { ROOM } from './config.js'
import { M, props } from './materials.js'

const AREA = ROOM * ROOM
const LIQUID_CLASS = { [M.WATER]: 1, [M.LAVA]: 2, [M.OIL]: 3, [M.ACID]: 4 }
const LIQUID_STEP = 32
const SURFACE_STEP = 16
const FLOW_STEP = 4
const GAS_SCALE = { [M.SMOKE]: 0.5, [M.STEAM]: 0.7, [M.METHANE]: 0.05 }
const GAS_CHANNEL = { [M.SMOKE]: 0, [M.STEAM]: 1, [M.METHANE]: 2 }

export const CELL_SHADER = { liquidStep: LIQUID_STEP, surfaceStep: SURFACE_STEP, flowStep: FLOW_STEP, size: ROOM }

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

const FLOW = { still: 0, falling: 1, stream: 2, landing: 3 }

const matOf = (world, x, y) => (x < 0 || y < 0 || x >= ROOM || y >= ROOM ? M.BEDROCK : world.mat[y * ROOM + x])
const airy = (world, x, y) => {
  const m = matOf(world, x, y)
  return !props(m).solid && !props(m).thick && !LIQUID_CLASS[m]
}

const STREAM_LEAST = 3

const sheer = (world, x, y, m) => {
  const sideOpen = airy(world, x - 1, y) || airy(world, x + 1, y)
  const walled = matOf(world, x - 1, y) === m && matOf(world, x + 1, y) === m
  return sideOpen && !walled
}

const writeFlow = (world, flow) => {
  flow.fill(FLOW.still)
  for (let x = 0; x < ROOM; x++) {
    let run = 0
    for (let y = ROOM - 1; y >= -1; y--) {
      const m = y >= 0 ? world.mat[y * ROOM + x] : M.EMPTY
      const liquid = y >= 0 && LIQUID_CLASS[m]
      if (liquid && airy(world, x, y + 1)) flow[y * ROOM + x] = FLOW.falling
      const continues = liquid && run > 0 && world.mat[(y + run) * ROOM + x] === m && sheer(world, x, y, m)
      const starts = liquid && sheer(world, x, y, m) && !props(matOf(world, x, y + 1)).solid
      if (continues) run += 1
      else {
        if (run >= STREAM_LEAST) for (let k = 1; k <= run; k++) if (flow[(y + k) * ROOM + x] === FLOW.still) flow[(y + k) * ROOM + x] = FLOW.stream
        run = starts ? 1 : 0
      }
    }
  }
  for (let y = 1; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const above = flow[i - ROOM]
      if (LIQUID_CLASS[world.mat[i]] && flow[i] === FLOW.still && world.mat[i - ROOM] === world.mat[i] && (above === FLOW.falling || above === FLOW.stream)) flow[i] = FLOW.landing
    }
  }
}

const flowScratch = new Uint8Array(AREA)

const writeCells = (world, out) => {
  writeFlow(world, flowScratch)
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const m = world.mat[i]
      const p = props(m)
      const kind = LIQUID_CLASS[m] ?? 0
      let surface = 0
      if (kind) for (let up = y - 1; up >= 0 && world.mat[up * ROOM + x] === m && surface < 15; up--) surface++
      out[i * 4] = (p.solid && !p.clear) || p.thick ? 255 : 0
      out[i * 4 + 1] = kind * LIQUID_STEP + flowScratch[i] * FLOW_STEP
      out[i * 4 + 2] = surface * SURFACE_STEP
      out[i * 4 + 3] = world.burn[i] > 0 || world.charge[i] > 0 ? 255 : 0
    }
  }
}

const writeFields = (layers, world, out) => {
  out.fill(0)
  layers.gas = false
  layers.hot = false
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const i = y * ROOM + x
      const m = world.mat[i]
      const channel = GAS_CHANNEL[m]
      if (channel !== undefined) {
        out[i * 4 + channel] = Math.min(255, 110 + world.life[i] * GAS_SCALE[m] * 145)
        layers.gas = true
      }
      const hot = world.burn[i] > 0 ? 255 : m === M.LAVA ? 200 : 0
      if (hot) layers.hot = true
      out[i * 4 + 3] = hot
    }
  }
}

export const refreshCells = (layers, world) => {
  writeCells(world, layers.cells.scratch)
  writeFields(layers, world, layers.fields.scratch)
  swapIfChanged(layers.cells)
  swapIfChanged(layers.fields)
}
