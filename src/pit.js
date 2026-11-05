import { BLOCK, ORIGIN, ROOM, VIEW } from './config.js'
import { CORE_RING, MAP_SIZE, keyOf, ringOf } from './map.js'
import { M } from './materials.js'

const LEVEL = 0.95
const FOV = (40 * Math.PI) / 180
const FLOATS = 8
const SHAFT_HEIGHT = 16
const THUMB = ROOM
const ROOM_PX = ROOM * BLOCK
const SEAL_RINGS = [1, 3, 5]
const CORE_Z = -CORE_RING * LEVEL

const VERTEX = `
attribute vec3 position;
attribute vec2 texel;
attribute float kind;
attribute float ring;
attribute float height;
uniform mat4 camera;
varying vec2 vUv;
varying float vKind;
varying float vRing;
varying float vHeight;
varying vec3 vWorld;
void main() {
  vUv = texel;
  vKind = kind;
  vRing = ring;
  vHeight = height;
  vWorld = position;
  gl_Position = camera * vec4(position, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform sampler2D atlas;
uniform float time;
uniform float openRing;
uniform float sweep;
uniform vec2 here;
varying vec2 vUv;
varying float vKind;
varying float vRing;
varying float vHeight;
varying vec3 vWorld;

const vec3 CORE = vec3(0.0, 0.0, ${CORE_Z.toFixed(3)});
const vec3 TEAL = vec3(0.12, 0.62, 0.6);
const vec3 ROSE = vec3(0.86, 0.2, 0.5);

vec3 hueOf(float ring) { return mix(TEAL, ROSE, smoothstep(0.0, 7.0, ring)); }

void main() {
  float toCore = distance(vWorld, CORE);
  float coreLight = 1.0 / (1.0 + toCore * toCore * 0.09);
  float beat = 0.82 + 0.18 * sin(time * 2.6);
  vec3 hue = hueOf(vRing);
  float wave = exp(-pow((vRing - sweep) * 1.5, 2.0));
  float opened = step(vRing, openRing);
  vec3 colour;
  if (vKind < 0.5) {
    vec2 grid = abs(fract(vWorld.xy + 0.5) - 0.5);
    float edge = smoothstep(0.455, 0.5, max(grid.x, grid.y));
    colour = texture2D(atlas, vUv).rgb * (0.42 + coreLight * 1.5);
    colour = mix(colour, hue * (0.3 + opened * 0.8), edge);
    colour += hue * wave * 0.45;
    vec2 fromHere = abs(vWorld.xy - here);
    if (max(fromHere.x, fromHere.y) < 0.5) colour = mix(colour, vec3(1.0), (0.2 + 0.25 * sin(time * 7.0)) + edge * 0.6);
  } else if (vKind < 1.5) {
    float bands = 0.5 + 0.5 * sin(vHeight * 40.0 + time * 1.5 - vRing);
    colour = hue * (0.05 + 0.1 * bands + coreLight * 0.24 * vHeight);
    colour += hue * opened * smoothstep(0.9, 1.0, vHeight) * 1.3;
    colour += hue * wave * 0.95;
  } else if (vKind < 2.5) {
    vec2 grid = abs(fract(vWorld.xy + 0.5) - 0.5);
    float fade = 1.0 / (1.0 + dot(vWorld.xy, vWorld.xy) * 0.012);
    colour = TEAL * 0.09 * smoothstep(0.47, 0.5, max(grid.x, grid.y)) * fade;
  } else if (vKind > 3.5) {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float flicker = 0.75 + 0.25 * sin(vHeight * 30.0 - time * 7.0);
    colour = mix(vec3(0.7, 1.0, 1.0), ROSE, vHeight) * pow(across, 3.0) * pow(1.0 - vHeight, 2.5) * flicker * beat;
    gl_FragColor = vec4(colour, 1.0);
    return;
  } else {
    float d = length(vUv - 0.5) * 2.0;
    float rings = 0.5 + 0.5 * sin(d * 18.0 - time * 5.0);
    colour = mix(vec3(0.75, 1.0, 1.0) * 1.5, ROSE * (0.5 + rings), smoothstep(0.1, 0.9, d)) * beat;
  }
  colour += hue * coreLight * coreLight * 0.1 * beat;
  gl_FragColor = vec4(colour, 1.0);
}`

const compile = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

const ATTRIBUTES = [['position', 3], ['texel', 2], ['kind', 1], ['ring', 1], ['height', 1]]

const buildProgram = gl => {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  ATTRIBUTES.forEach(([name], i) => gl.bindAttribLocation(program, i, name))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  return program
}

const worldX = x => x - (MAP_SIZE - 1) / 2
const worldY = y => (MAP_SIZE - 1) / 2 - y
const levelOf = (x, y) => -ringOf(x, y) * LEVEL
const outside = (x, y) => x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE

const quad = (a, b, c, d) => [a, b, c, a, c, d].flat()

const tileQuad = (x, y) => {
  const [cx, cy, z] = [worldX(x), worldY(y), levelOf(x, y)]
  const ring = ringOf(x, y)
  const kind = ring === CORE_RING ? 3 : 0
  const [u0, v0] = [x / MAP_SIZE, y / MAP_SIZE]
  const [u1, v1] = kind === 3 ? [0, 0] : [(x + 1) / MAP_SIZE, (y + 1) / MAP_SIZE]
  const uv = kind === 3 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
  const corner = (dx, dy, [u, v]) => [cx + dx, cy + dy, z, u, v, kind, ring, 0]
  return quad(corner(-0.5, 0.5, uv[0]), corner(0.5, 0.5, uv[1]), corner(0.5, -0.5, uv[2]), corner(-0.5, -0.5, uv[3]))
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const wallQuads = (x, y) => SIDES.flatMap(([dx, dy]) => {
  const [nx, ny] = [x + dx, y + dy]
  if (outside(nx, ny) || levelOf(nx, ny) <= levelOf(x, y)) return []
  const [cx, cy] = [worldX(x) + dx * 0.5, worldY(y) - dy * 0.5]
  const [ax, ay] = dx === 0 ? [0.5, 0] : [0, 0.5]
  const [low, high] = [levelOf(x, y), levelOf(nx, ny)]
  const ring = ringOf(x, y)
  const corner = (sx, sy, z, h) => [cx + sx, cy + sy, z, 0, 0, 1, ring, h]
  return quad(corner(-ax, -ay, low, 0), corner(ax, ay, low, 0), corner(ax, ay, high, 1), corner(-ax, -ay, high, 1))
})

const REACH = 60
const RIM = MAP_SIZE / 2

const skirt = () => {
  const corner = (x, y) => [x, y, 0, 0, 0, 2, 0, 0]
  const bands = [
    [-REACH, RIM, REACH, REACH],
    [-REACH, -REACH, REACH, -RIM],
    [-REACH, -RIM, -RIM, RIM],
    [RIM, -RIM, REACH, RIM],
  ]
  return bands.flatMap(([x0, y0, x1, y1]) => quad(corner(x0, y1), corner(x1, y1), corner(x1, y0), corner(x0, y0)))
}

const shaftQuads = () => {
  const corner = (dx, dy, u, v) => [dx, dy, CORE_Z + v * SHAFT_HEIGHT, u, v, 4, CORE_RING, v]
  return [[0.5, 0], [0, 0.5]].flatMap(([ax, ay]) => quad(corner(-ax, -ay, 0, 0), corner(ax, ay, 1, 0), corner(ax, ay, 1, 1), corner(-ax, -ay, 0, 1)))
}

const buildMesh = () => {
  const cells = Array.from({ length: MAP_SIZE * MAP_SIZE }, (_, i) => [i % MAP_SIZE, Math.floor(i / MAP_SIZE)])
  return {
    solid: new Float32Array([...skirt(), ...cells.flatMap(([x, y]) => [...tileQuad(x, y), ...wallQuads(x, y)])]),
    shaft: new Float32Array(shaftQuads()),
  }
}

const normal = ([x, y, z]) => {
  const d = Math.hypot(x, y, z) || 1
  return [x / d, y / d, z / d]
}
const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d]
const dot = ([a, b, c], [d, e, f]) => a * d + b * e + c * f

const lookAt = (eye, target, up) => {
  const f = normal([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]])
  const s = normal(cross(f, up))
  const u = cross(s, f)
  return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]
}

const perspective = (fov, aspect, near, far) => {
  const t = 1 / Math.tan(fov / 2)
  return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]
}

const times = (a, b) => Array.from({ length: 16 }, (_, i) => {
  const [col, row] = [Math.floor(i / 4), i % 4]
  return [0, 1, 2, 3].reduce((sum, k) => sum + a[k * 4 + row] * b[col * 4 + k], 0)
})

const OPEN = new Set([M.EMPTY, M.WATER, M.OIL, M.LAVA, M.ACID, M.SMOKE, M.STEAM, M.METHANE, M.VINE, M.ASH])

const MATERIAL_SHADES = {
  [M.EMPTY]: '#0a1214', [M.BEDROCK]: '#2a3230', [M.ROCK]: '#4a5a44', [M.MOSS]: '#6f9a3c', [M.PEAT]: '#6a4c26', [M.WOOD]: '#8d6a34',
  [M.METAL]: '#9aa2a8', [M.GATE]: '#c8ccd0', [M.SAND]: '#c8b878', [M.ASH]: '#3a3a36', [M.WATER]: '#2a88a0', [M.SMOKE]: '#20282a',
  [M.STEAM]: '#20282a', [M.SCRAP]: '#a08c6c', [M.VOLATILE]: '#e060d0', [M.ICE]: '#a8e6f8', [M.OIL]: '#5a3a70', [M.METHANE]: '#3a2a50',
  [M.BRICK]: '#6c7a48', [M.LAVA]: '#ff7a24', [M.VINE]: '#4f9c3a', [M.ACID]: '#88d830', [M.SOURCE]: '#9aa2a8', [M.FLOE]: '#a8e6f8',
  [M.RIME]: '#a8e6f8', [M.STILL]: '#88a0b0',
}

const AROUND = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const isBuried = (world, x, y) => AROUND.every(([dx, dy]) => {
  const m = world.mat[(y + dy) * ROOM + x + dx]
  return m === undefined || !OPEN.has(m)
})

const paintAtlas = (canvas, g) => {
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#04080a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let my = 0; my < MAP_SIZE; my++) {
    for (let mx = 0; mx < MAP_SIZE; mx++) {
      const world = g.rooms[keyOf(mx, my)]?.world
      if (!world) continue
      for (let y = 0; y < ROOM; y++) {
        for (let x = 0; x < ROOM; x++) {
          ctx.fillStyle = isBuried(world, x, y) && !OPEN.has(world.mat[y * ROOM + x]) ? '#10181a' : MATERIAL_SHADES[world.mat[y * ROOM + x]] ?? '#000'
          ctx.fillRect(mx * THUMB + x, my * THUMB + y, 1, 1)
        }
      }
    }
  }
}

const cameraMatrix = view => {
  const aspect = VIEW.w / VIEW.h
  const lens = perspective(FOV, aspect, 0.05, 200)
  const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, view.shift[0], view.shift[1], 0, 1]
  return times(times(shift, lens), lookAt(view.eye, view.target, view.up))
}

export const tileTransform = (view, [x, y]) => {
  const model = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, worldX(x) - 0.5, worldY(y) + 0.5, levelOf(x, y) + 0.002, 1]
  return new Float32Array(times(cameraMatrix(view), model))
}

export const createPit = gl => {
  const program = buildProgram(gl)
  const mesh = buildMesh()
  const solidBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, solidBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.solid, gl.STATIC_DRAW)
  const shaftBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, shaftBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.shaft, gl.STATIC_DRAW)
  const U = Object.fromEntries(['camera', 'time', 'openRing', 'sweep', 'atlas', 'here'].map(name => [name, gl.getUniformLocation(program, name)]))

  const atlasCanvas = document.createElement('canvas')
  atlasCanvas.width = atlasCanvas.height = MAP_SIZE * THUMB
  const atlas = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, atlas)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const refresh = g => {
    paintAtlas(atlasCanvas, g)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, atlas)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, atlasCanvas)
  }

  const bindMesh = buffer => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    ATTRIBUTES.reduce((offset, [, size], i) => {
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, FLOATS * 4, offset * 4)
      return offset + size
    }, 0)
  }

  const draw = (view, { time, seals = 0, sweep = -5, tile = null }) => {
    gl.useProgram(program)
    ATTRIBUTES.forEach((_, i) => gl.enableVertexAttribArray(i))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, atlas)
    gl.uniform1i(U.atlas, 0)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.DEPTH_TEST)
    gl.uniformMatrix4fv(U.camera, false, new Float32Array(cameraMatrix(view)))
    gl.uniform1f(U.time, time)
    gl.uniform1f(U.openRing, seals > 0 ? SEAL_RINGS[Math.min(seals, SEAL_RINGS.length) - 1] : -1)
    gl.uniform1f(U.sweep, sweep)
    gl.uniform2f(U.here, tile ? worldX(tile[0]) : 99, tile ? worldY(tile[1]) : 99)
    bindMesh(solidBuffer)
    gl.drawArrays(gl.TRIANGLES, 0, mesh.solid.length / FLOATS)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.depthMask(false)
    bindMesh(shaftBuffer)
    gl.drawArrays(gl.TRIANGLES, 0, mesh.shaft.length / FLOATS)
    gl.depthMask(true)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    ATTRIBUTES.forEach((_, i) => { if (i > 0) gl.disableVertexAttribArray(i) })
  }

  return { refresh, draw }
}

const clamp01 = v => Math.max(0, Math.min(1, v))
const ease = v => {
  const t = clamp01(v)
  return t * t * t * (t * (6 * t - 15) + 10)
}
const mix = (a, b, t) => a + (b - a) * t
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t))

const tileCentre = ([x, y]) => [worldX(x), worldY(y), levelOf(x, y)]
const closeDistance = () => (VIEW.h / 2 / ROOM_PX) / Math.tan(FOV / 2)
const roomShift = () => [((ORIGIN.x + ROOM_PX / 2) / VIEW.w) * 2 - 1, 1 - ((ORIGIN.y + ROOM_PX / 2) / VIEW.h) * 2]

const orbit = (target, distance, pitch, yaw, shift) => {
  const lean = Math.sin(pitch)
  const eye = [target[0] + distance * lean * Math.sin(yaw), target[1] - distance * lean * Math.cos(yaw), target[2] + distance * Math.cos(pitch)]
  return { eye, target, up: [-Math.sin(yaw), Math.cos(yaw), 0], shift }
}

const PIT_CENTRE = [0, 0, CORE_Z * 0.5]
const WIDE = 21
const wideDistance = () => WIDE * Math.max(1, 1.6 / (VIEW.w / VIEW.h))
const TILT = 0.92
const QUARTER = Math.PI / 2

const FIRST = { hold: 0.5, pull: 1.9, turns: 4, turn: 0.72, rest: 0.1, dive: 1.5, settle: 1.5 }
const LATER = { hold: 0.15, pull: 1, turns: 1, turn: 0.72, rest: 0.1, dive: 1, settle: 0.5 }

const lengthOf = plan => plan.hold + plan.pull + plan.turns * (plan.turn + plan.rest) + plan.dive + plan.settle

export const pitPlan = first => {
  const plan = first ? FIRST : LATER
  return { plan, length: lengthOf(plan) }
}

export const pitView = (t, { plan }, tile) => {
  const close = tileCentre(tile)
  const pullEnd = plan.hold + plan.pull
  const turnsEnd = pullEnd + plan.turns * (plan.turn + plan.rest)
  const diveEnd = turnsEnd + plan.dive
  const out = ease((t - plan.hold) / plan.pull)
  const back = ease((t - turnsEnd) / plan.dive)
  const away = out * (1 - back)
  const spent = clamp01((t - pullEnd) / (turnsEnd - pullEnd)) * plan.turns
  const whole = Math.floor(spent)
  const part = ease(clamp01((spent - whole) * (plan.turn + plan.rest) / plan.turn))
  const yaw = (Math.min(whole, plan.turns) + (whole < plan.turns ? part : 0)) * QUARTER * (plan.turns === 4 ? 1 : 0)
  const swing = plan.turns === 1 ? Math.sin(Math.min(1, spent) * Math.PI) * QUARTER * 0.5 : 0
  const distance = Math.exp(mix(Math.log(closeDistance()), Math.log(wideDistance()), away))
  const framing = roomShift().map(v => v * (1 - clamp01(away * 2)))
  const focus = away * away * away
  return {
    view: orbit(mix3(close, PIT_CENTRE, focus), distance, TILT * away, yaw + swing, framing),
    away,
    liveAmount: 1 - clamp01((away - 0.25) * 3),
    sweep: mix(-2, CORE_RING + 3, clamp01((t - pullEnd * 0.8) / (diveEnd - pullEnd))),
    landed: clamp01((t - diveEnd) / plan.settle),
  }
}

export const overview = time => orbit(PIT_CENTRE, wideDistance() * 0.92, TILT * 0.8, time * 0.12, [0, 0])
