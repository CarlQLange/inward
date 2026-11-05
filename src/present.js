import { BLOCK, ORIGIN, ROOM, VIEW } from './config.js'
import { LAYOUT, isTouchLayout } from './layout.js'
import { LIGHT_SIZE, ambientOf, buildLight } from './light.js'
import { save } from './store.js'
import { createCellLayers, refreshCells } from './cells.js'
import { ERA_KEYS, depthAmount, eraAt } from './era.js'
import { MASK_SIZE, airOf, masksFor } from './backdrop.js'
import { DISPLAY, FRAME, FRAME_UNIFORMS, OPTICS, OPTICS_UNIFORMS, QUAD, QUAD_VERTEX, RING_SLOTS, RIPPLE_SLOTS, VERTEX, WORLD, WORLD_UNIFORMS } from './shaders.js'

const POWER = { full: 1, soft: 0.6, off: 0 }
const SIZE = ROOM * BLOCK
const NOISE_SIZE = 64
const PIT_COLOUR = [0.34, 0.62, 0.58]
const MAP_CENTRE = 7

const compile = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

const createProgram = (gl, fragment, vertex = VERTEX) => {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(program, 0, 'position')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  return program
}

const fitTouchCanvas = canvas => {
  const { pixel, dpr } = LAYOUT
  canvas.style.width = `${(VIEW.w * pixel) / dpr}px`
  canvas.style.height = `${(VIEW.h * pixel) / dpr}px`
  canvas.width = VIEW.w * pixel
  canvas.height = VIEW.h * pixel
}

const fitCanvas = canvas => {
  if (isTouchLayout()) {
    fitTouchCanvas(canvas)
    return
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const fit = Math.min(window.innerWidth / VIEW.w, window.innerHeight / VIEW.h)
  const scale = Math.max(1 / dpr, Math.floor(fit * dpr) / dpr)
  canvas.style.width = `${VIEW.w * scale}px`
  canvas.style.height = `${VIEW.h * scale}px`
  canvas.width = VIEW.w * scale * dpr
  canvas.height = VIEW.h * scale * dpr
}

const createTexture = (gl, filter, wrap = gl.CLAMP_TO_EDGE) => {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
  return tex
}

const createTarget = (gl, w, h) => {
  const tex = createTexture(gl, gl.NEAREST)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fbo, w, h }
}

const noiseBytes = () => {
  const hash = (x, y, c) => {
    const n = Math.imul(((x + NOISE_SIZE) % NOISE_SIZE) * 374761393 + ((y + NOISE_SIZE) % NOISE_SIZE) * 668265263 + c * 2147483, 1274126177)
    return ((n ^ (n >>> 13)) >>> 0) % 1000 / 1000
  }
  const lattice = (x, y, c, cell) => {
    const [ax, ay] = [Math.floor(x / cell), Math.floor(y / cell)]
    const [fx, fy] = [x / cell - ax, y / cell - ay]
    const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)]
    const wrap = NOISE_SIZE / cell
    const at = (i, j) => hash(((ax + i) % wrap) * cell, ((ay + j) % wrap) * cell, c)
    return (at(0, 0) * (1 - sx) + at(1, 0) * sx) * (1 - sy) + (at(0, 1) * (1 - sx) + at(1, 1) * sx) * sy
  }
  const bytes = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      for (let c = 0; c < 4; c++) {
        const v = lattice(x, y, c, 16) * 0.55 + lattice(x, y, c + 4, 8) * 0.3 + lattice(x, y, c + 8, 4) * 0.15
        bytes[(y * NOISE_SIZE + x) * 4 + c] = Math.min(255, Math.max(0, (v - 0.5) * 2.1 + 0.5) * 255)
      }
    }
  }
  return bytes
}

const programOf = (gl, source, samplers, uniforms, extras = [], vertex) => {
  const program = createProgram(gl, source, vertex)
  gl.useProgram(program)
  samplers.forEach((name, unit) => gl.uniform1i(gl.getUniformLocation(program, name), unit))
  const at = Object.fromEntries([...uniforms, ...extras].map(name => [name, gl.getUniformLocation(program, name)]))
  return { program, samplers, at, floats: uniforms.map(name => [name, at[name]]) }
}

let stageHook = null
export const setStage = fn => { stageHook = fn }

export const createPresenter = canvas => {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)

  const frameExtras = ['view', 'origin', 'shake', 'slideNew', 'slideOld', 'mapPos', 'zoom', 'pitColour', 'rings']
  const worldProgram = programOf(gl, WORLD, ['terrain', 'cells', 'lightMap', 'masks', 'front'], WORLD_UNIFORMS, ['frontOrigin', 'frontScale', 'vanish', 'drift', 'airBase', 'airFar', 'airNear', 'airWall', 'airSide'])
  const opticsProgram = programOf(gl, OPTICS, ['worldLayer', 'cells', 'fields', 'lightMap', 'noise', 'front'], OPTICS_UNIFORMS, ['frontOrigin', 'frontScale', 'ripples', 'fogColour', 'beamColour'])
  const frameProgram = programOf(gl, FRAME, ['roomNow', 'roomOld', 'front', 'history', 'lightMap', 'noise'], FRAME_UNIFORMS, frameExtras)
  const displayProgram = programOf(gl, DISPLAY, ['scene'], ['lcd', 'scanline'], ['view', 'room'])
  const quadProgram = programOf(gl, QUAD, ['roomNow', 'front'], ['actors', 'opacity'], ['transform', 'actorRect'], QUAD_VERTEX)

  const triangle = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const square = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, square)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  const useBuffer = buffer => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }
  gl.enableVertexAttribArray(0)
  useBuffer(triangle)

  const worldTarget = createTarget(gl, SIZE, SIZE)
  const roomTargets = [createTarget(gl, SIZE, SIZE), createTarget(gl, SIZE, SIZE)]
  const frameTargets = [createTarget(gl, VIEW.w, VIEW.h), createTarget(gl, VIEW.w, VIEW.h)]

  const textures = {
    front: createTexture(gl, gl.NEAREST),
    terrain: createTexture(gl, gl.NEAREST),
    cells: createTexture(gl, gl.NEAREST),
    fields: createTexture(gl, gl.LINEAR),
    light: createTexture(gl, gl.LINEAR),
    masks: createTexture(gl, gl.NEAREST, gl.REPEAT),
    noise: createTexture(gl, gl.LINEAR, gl.REPEAT),
  }

  const premultiplied = on => gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, on ? 1 : 0)
  const uploadBytes = (tex, size, bytes) => {
    premultiplied(false)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
  }
  const uploadCanvas = (tex, source) => {
    premultiplied(true)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  uploadBytes(textures.noise, NOISE_SIZE, noiseBytes())
  uploadBytes(textures.light, LIGHT_SIZE, new Uint8Array(LIGHT_SIZE * LIGHT_SIZE * 4))
  uploadBytes(textures.fields, ROOM, new Uint8Array(ROOM * ROOM * 4))
  uploadBytes(textures.cells, ROOM, new Uint8Array(ROOM * ROOM * 4))

  const cellLayers = createCellLayers()
  const shown = { terrain: -1, theme: -1, door: null, room: 0, frame: 0, vanish: [SIZE / 2, SIZE / 2], lit: false }

  const resize = () => fitCanvas(canvas)
  window.addEventListener('resize', resize)
  resize()
  const release = () => {
    window.removeEventListener('resize', resize)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  const ringData = new Float32Array(RING_SLOTS * 4)
  const rippleData = new Float32Array(RIPPLE_SLOTS * 4)

  const bind = ({ samplers }, bound) => samplers.forEach((name, unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, bound[name])
  })

  const setFloats = ({ floats }, values) => {
    for (const [name, location] of floats) if (values[name] !== undefined) gl.uniform1f(location, values[name])
  }

  const passInto = (target, pass, bound, values) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, target.w, target.h)
    gl.useProgram(pass.program)
    bind(pass, bound)
    setFloats(pass, values)
  }

  const refreshLayers = (layers, state, era, lit) => {
    if (shown.terrain !== layers.terrain.version) {
      uploadCanvas(textures.terrain, layers.terrain.canvas)
      shown.terrain = layers.terrain.version
    }
    if (shown.theme !== layers.theme) {
      uploadCanvas(textures.masks, masksFor(layers.theme))
      shown.theme = layers.theme
    }
    if (state.world) {
      refreshCells(cellLayers, state.world)
      if (cellLayers.cells.changed) uploadBytes(textures.cells, ROOM, cellLayers.cells.bytes)
      if (cellLayers.fields.changed) uploadBytes(textures.fields, ROOM, cellLayers.fields.bytes)
    }
    if (lit) {
      const fixture = era.fixtures > 0 ? airOf(layers.theme).fixture : null
      uploadBytes(textures.light, LIGHT_SIZE, buildLight(state, state.time, { fixture, seed: layers.seed, shafts: era.shafts > 0 }))
    } else if (shown.lit) uploadBytes(textures.light, LIGHT_SIZE, new Uint8Array(LIGHT_SIZE * LIGHT_SIZE * 4))
    shown.lit = lit
  }

  const heroOffset = state => {
    const p = state.player
    if (!p || state.phase === 'title') return [0, 0]
    return [p.x + p.w / 2 - SIZE / 2, p.y + p.h / 2 - SIZE / 2]
  }

  const drawWorld = (state, era, lighting, layers) => {
    const air = airOf(layers.theme)
    const [hx, hy] = heroOffset(state)
    const want = [SIZE / 2 + hx * 0.16, SIZE / 2 + hy * 0.12]
    shown.vanish = state.vanish ?? shown.vanish.map((v, i) => v + (want[i] - v) * 0.08)
    passInto(worldTarget, worldProgram, {
      terrain: textures.terrain, cells: textures.cells, lightMap: textures.light, masks: textures.masks, front: textures.front,
    }, {
      ...era,
      time: state.time,
      reach: era.depth * depthAmount(state),
      lightOn: lighting.amount,
      ambient: lighting.ambient,
      frontFloor: lighting.front,
      calm: isTouchLayout() ? 0.7 : 1,
    })
    const { at } = worldProgram
    gl.uniform2f(at.frontOrigin, ORIGIN.x, ORIGIN.y)
    gl.uniform2f(at.frontScale, 1 / VIEW.w, 1 / VIEW.h)
    gl.uniform2f(at.vanish, shown.vanish[0], shown.vanish[1])
    gl.uniform2f(at.drift, -hx * 0.12 * era.parallax, -hy * 0.08 * era.parallax)
    gl.uniform3fv(at.airBase, air.air)
    gl.uniform3fv(at.airFar, air.far)
    gl.uniform3fv(at.airNear, air.near)
    gl.uniform3fv(at.airWall, air.wall)
    gl.uniform3fv(at.airSide, air.side)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const uploadRipples = state => {
    rippleData.fill(0)
    ;(state.ripples ?? []).slice(-RIPPLE_SLOTS).forEach((r, i) => {
      rippleData[i * 4] = r.x
      rippleData[i * 4 + 1] = r.y
      rippleData[i * 4 + 2] = r.power
      rippleData[i * 4 + 3] = r.age
    })
    gl.uniform4fv(opticsProgram.at.ripples, rippleData)
  }

  const drawOptics = (state, era, lighting, target, layers) => {
    const air = airOf(layers.theme)
    passInto(target, opticsProgram, {
      worldLayer: worldTarget.tex, cells: textures.cells, fields: textures.fields, lightMap: textures.light, noise: textures.noise, front: textures.front,
    }, { ...era, haze: cellLayers.hot ? era.haze : 0, gasOn: cellLayers.gas ? 1 : 0, time: state.time, lightOn: lighting.amount })
    const { at } = opticsProgram
    gl.uniform2f(at.frontOrigin, ORIGIN.x, ORIGIN.y)
    gl.uniform2f(at.frontScale, 1 / VIEW.w, 1 / VIEW.h)
    gl.uniform3fv(at.fogColour, air.fog)
    gl.uniform3fv(at.beamColour, air.beam)
    uploadRipples(state)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const uploadRings = (state, power) => {
    ringData.fill(0)
    ;(state.rings ?? []).slice(-RING_SLOTS).forEach((ring, i) => {
      ringData[i * 4] = ring.x
      ringData[i * 4 + 1] = ring.y
      ringData[i * 4 + 2] = ring.r
      ringData[i * 4 + 3] = ring.strength * (ring.life / ring.max) * power
    })
    gl.uniform4fv(frameProgram.at.rings, ringData)
  }

  const DOOR_VECTORS = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] }

  const slides = state => {
    if (!state.door) return { on: 0, now: [0, 0], old: [0, 0] }
    const raw = Math.min(1, state.door.t / state.door.time)
    const t = raw * raw * (3 - 2 * raw)
    const [ux, uy] = DOOR_VECTORS[state.door.dir]
    return {
      on: 1,
      now: [Math.round(-ux * (1 - t) * SIZE), Math.round(-uy * (1 - t) * SIZE)],
      old: [Math.round(ux * t * SIZE), Math.round(uy * t * SIZE)],
    }
  }

  const drawFrame = (state, era, lighting, roomNow, roomOld, target, history, shake, power) => {
    passInto(target, frameProgram, {
      roomNow: roomNow.tex, roomOld: roomOld.tex, front: textures.front, history: history.tex, lightMap: textures.light, noise: textures.noise,
    }, {
      ...era,
      time: state.time,
      pulse: state.pulse,
      stop: state.stop ?? 0,
      aberration: (state.aberr ?? 0) * power,
      flash: Math.min(0.42, state.white ?? 0) * Math.max(power, 0.25),
      desaturate: state.desat ?? 0,
      hurt: Math.max(state.hurtFlash ?? 0, state.danger ?? 0),
      forced: state.menus?.length ? 0 : lighting.forced,
      doorOn: slides(state).on,
      halo: Math.min(0.5, era.bloom * 0.55 + era.fog * 0.2 + (era.far + era.near) * 0.08),
      calm: isTouchLayout() ? 0.65 : 1,
      coreGlow: 0.9,
    })
    const { at } = frameProgram
    const slide = slides(state)
    gl.uniform2f(at.view, VIEW.w, VIEW.h)
    gl.uniform2f(at.origin, ORIGIN.x, ORIGIN.y)
    gl.uniform2f(at.shake, shake.x, shake.y)
    gl.uniform2f(at.slideNew, slide.now[0], slide.now[1])
    gl.uniform2f(at.slideOld, slide.old[0], slide.old[1])
    gl.uniform2f(at.mapPos, (state.x ?? MAP_CENTRE) - MAP_CENTRE, (state.y ?? MAP_CENTRE) - MAP_CENTRE)
    gl.uniform3f(at.zoom, state.zoom?.x ?? 112, state.zoom?.y ?? 112, (state.zoom?.amount ?? 0) * power)
    gl.uniform3fv(at.pitColour, PIT_COLOUR)
    uploadRings(state, power)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const drawDisplay = (era, frame) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(displayProgram.program)
    bind(displayProgram, { scene: frame.tex })
    const { at } = displayProgram
    gl.uniform2f(at.view, VIEW.w, VIEW.h)
    gl.uniform4f(at.room, ORIGIN.x / VIEW.w, ORIGIN.y / VIEW.h, (ORIGIN.x + SIZE) / VIEW.w, (ORIGIN.y + SIZE) / VIEW.h)
    gl.uniform1f(at.lcd, era.lcd)
    gl.uniform1f(at.scanline, era.scanline)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  const lightingOf = (state, era) => {
    const dark = ambientOf(state)
    if (dark !== null) return { ambient: dark, amount: 1, front: dark, forced: 1 }
    return { ambient: era.ambient, amount: era.light, front: 0.55 + era.ambient * 0.25, forced: 0 }
  }

  const stageApi = (roomNow, frame, draw) => ({
    gl,
    target: frame,
    world: () => roomNow.tex,
    actors: () => textures.front,
    drawFrame: draw,
    drawRoom: (transform, { actors = true, opacity = 1 } = {}) => {
      gl.useProgram(quadProgram.program)
      bind(quadProgram, { roomNow: roomNow.tex, front: textures.front })
      const { at } = quadProgram
      gl.uniformMatrix4fv(at.transform, false, transform)
      gl.uniform4f(at.actorRect, ORIGIN.x / VIEW.w, ORIGIN.y / VIEW.h, SIZE / VIEW.w, SIZE / VIEW.h)
      gl.uniform1f(at.actors, actors ? 1 : 0)
      gl.uniform1f(at.opacity, opacity)
      useBuffer(square)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.disable(gl.BLEND)
      useBuffer(triangle)
    },
  })

  const present = (layers, state, shake = { x: 0, y: 0 }) => {
    const power = POWER[save.settings.shaders] ?? 1
    const era = eraAt(state.depth, power)
    const lighting = lightingOf(state, era)
    if (state.door !== shown.door) {
      if (state.door) shown.room = 1 - shown.room
      shown.door = state.door ?? null
    }
    const roomNow = roomTargets[shown.room]
    const roomOld = roomTargets[1 - shown.room]
    uploadCanvas(textures.front, layers.front)
    refreshLayers(layers, state, era, lighting.amount > 0 || era.shafts > 0)
    drawWorld(state, era, lighting, layers)
    drawOptics(state, era, lighting, roomNow, layers)
    shown.frame = 1 - shown.frame
    const frame = frameTargets[shown.frame]
    const history = frameTargets[1 - shown.frame]
    const composed = () => drawFrame(state, era, lighting, roomNow, roomOld, frame, history, shake, power)
    composed()
    if (stageHook) stageHook(stageApi(roomNow, frame, composed), state)
    drawDisplay(era, frame)
  }
  present.release = release
  return present
}
