import { BLOCK, ORIGIN, ROOM, VIEW } from './config.js'
import { LAYOUT, isTouchLayout } from './layout.js'
import { SCARF_DEEP, SCARF_RED } from './hero.js'
import { LIGHT_SIZE, ambientOf, buildLight } from './light.js'
import { save } from './store.js'

const RING_SLOTS = 6
const vec3 = rgb => `vec3(${rgb.map(v => (v / 255).toFixed(4)).join(', ')})`

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2(0.5 + 0.5 * position.x, 0.5 - 0.5 * position.y);
  gl_Position = vec4(position, 0.0, 1.0);
}`

const DISPLAY = `
precision mediump float;
varying vec2 uv;
uniform sampler2D scene;
uniform vec2 view;
uniform vec4 room;
uniform float depth;

void main() {
  vec3 colour = texture2D(scene, vec2(uv.x, 1.0 - uv.y)).rgb;
  float deep = smoothstep(0.35, 1.0, depth);
  bool inRoom = uv.x > room.x && uv.y > room.y && uv.x < room.z && uv.y < room.w;
  vec2 cell = fract(uv * view);
  float grid = step(0.86, cell.x) + step(0.86, cell.y);
  float lcd = (1.0 - smoothstep(0.0, 0.35, depth)) * 0.16;
  if (inRoom) colour *= 1.0 - min(grid, 1.0) * lcd;
  colour *= 1.0 - deep * 0.05 * (0.5 + 0.5 * sin(uv.y * view.y * 6.283));
  gl_FragColor = vec4(colour, 1.0);
}`

const FRAGMENT = `
precision highp float;
varying vec2 uv;
uniform sampler2D screen;
uniform sampler2D lightMap;
uniform vec2 view;
uniform vec4 room;
uniform float time;
uniform float depth;
uniform float pulse;
uniform float stop;
uniform vec3 zoom;
uniform vec4 rings[${RING_SLOTS}];
uniform float aberration;
uniform float flash;
uniform float desaturate;
uniform float hurt;
uniform vec2 lighting;

const vec3 GB0 = vec3(0.059, 0.200, 0.098);
const vec3 GB1 = vec3(0.188, 0.384, 0.188);
const vec3 GB2 = vec3(0.545, 0.675, 0.059);
const vec3 GB3 = vec3(0.804, 0.871, 0.569);
const vec3 SPOT = ${vec3(SCARF_RED)};
const vec3 SPOT_DEEP = ${vec3(SCARF_DEEP)};

float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 bright(vec2 p) {
  vec3 c = texture2D(screen, p).rgb;
  return c * smoothstep(0.82, 1.0, max(c.r, max(c.g, c.b)));
}

vec3 gameBoy(vec3 c) {
  float l = luma(c);
  if (l < 0.14) return GB0;
  if (l < 0.38) return GB1;
  if (l < 0.68) return GB2;
  return GB3;
}

vec2 worldWarp(vec2 p) {
  vec2 q = p;
  if (zoom.z > 0.0) {
    vec2 focus = zoom.xy;
    q = focus + (q - focus) / (1.0 + zoom.z);
  }
  for (int i = 0; i < ${RING_SLOTS}; i++) {
    vec4 ring = rings[i];
    if (ring.w == 0.0) continue;
    vec2 d = (q - ring.xy) * view;
    float away = length(d);
    float band = 1.0 - smoothstep(0.0, 9.0, abs(away - ring.z));
    if (away > 0.5) q -= (d / away) * band * ring.w / view;
  }
  return clamp(q, room.xy + 0.5 / view, room.zw - 0.5 / view);
}

void main() {
  float deep = smoothstep(0.35, 1.0, depth);
  float core = smoothstep(0.8, 1.0, depth);
  vec2 pix = uv;
  bool inRoom = uv.x > room.x && uv.y > room.y && uv.x < room.z && uv.y < room.w;
  vec2 p = inRoom ? worldWarp(pix) : pix;

  vec3 centre = texture2D(screen, p).rgb;
  float spot = max(step(distance(centre, SPOT), 0.012), step(distance(centre, SPOT_DEEP), 0.012));

  vec2 fromCentre = p - 0.5;
  float kick = inRoom ? pulse * 0.7 + aberration * 0.9 : 0.0;
  float spread = kick / view.x;
  vec3 colour = vec3(
    texture2D(screen, p + fromCentre * spread * 2.0).r,
    centre.g,
    texture2D(screen, p - fromCentre * spread * 2.0).b
  );

  float glow = inRoom ? smoothstep(0.3, 0.9, depth) * 0.4 + pulse * 0.35 : 0.0;
  if (glow > 0.01) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      vec2 d = vec2(cos(a), sin(a)) / view;
      sum += bright(p + d * 2.0) + bright(p + d * 4.5);
    }
    colour += sum / 16.0 * glow;
  }

  if (inRoom && lighting.y > 0.001) {
    vec2 lightUv = (p - room.xy) / (room.zw - room.xy);
    vec3 light = texture2D(lightMap, lightUv).rgb;
    float peak = max(light.r, max(light.g, light.b));
    if (peak > 0.0) light *= (floor(peak * 7.0 + 0.5) / 7.0) / peak;
    float already = luma(colour);
    vec3 lit = colour * (lighting.x + light * (1.1 - already)) + light * light * 0.07 * (1.0 - already);
    colour = mix(colour, lit, lighting.y);
  }

  float grey = luma(colour);
  colour = mix(vec3(grey), colour, 1.0 + deep * 0.2);

  float lit = step(0.02, luma(colour));
  float handheld = 1.0 - smoothstep(0.0, 0.25, depth);
  if (handheld > 0.0 && (inRoom || lit > 0.5)) {
    colour = mix(colour, gameBoy(colour), handheld);
  }

  float reach = length(fromCentre);
  colour += vec3(0.08, 0.32, 0.38) * core * (0.5 + 0.5 * sin(time * 1.7)) * pow(max(0.0, 1.0 - reach * 2.0), 2.0) * 0.2;
  colour *= 1.0 - deep * 0.12 * reach * reach;

  float stopped = luma(colour);
  colour = mix(colour, vec3(stopped * 0.75, stopped * 0.95, stopped * 1.25), stop * 0.85);

  if (inRoom) {
    vec3 paper = mix(vec3(1.0), GB3, handheld);
    colour = mix(colour, paper, flash);
    vec2 edge = min(uv - room.xy, room.zw - uv) / (room.zw - room.xy);
    float rim = 1.0 - smoothstep(0.0, 0.22, min(edge.x, edge.y));
    colour = mix(colour, SPOT, clamp(hurt * rim * 0.5, 0.0, 1.0));
  }

  float dull = luma(colour);
  colour = mix(colour, vec3(dull * 0.92), desaturate);
  colour = mix(colour, centre, spot);
  gl_FragColor = vec4(colour, 1.0);
}`

const compile = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

const createProgram = (gl, fragment) => {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
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

const texture = (gl, unit, filter) => {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

const POWER = { full: 1, soft: 0.5, off: 0 }
const SIZE = ROOM * BLOCK
const toUvX = x => (ORIGIN.x + x) / VIEW.w
const toUvY = y => (ORIGIN.y + y) / VIEW.h

export const createPresenter = canvas => {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  const program = createProgram(gl, FRAGMENT)
  const display = createProgram(gl, DISPLAY)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  texture(gl, 2, gl.NEAREST)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, VIEW.w, VIEW.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const target = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, target)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gl.getParameter(gl.TEXTURE_BINDING_2D), 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  texture(gl, 1, gl.LINEAR)
  texture(gl, 0, gl.NEAREST)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

  gl.useProgram(display)
  const shown = name => gl.getUniformLocation(display, name)
  gl.uniform1i(shown('scene'), 2)
  gl.uniform2f(shown('view'), VIEW.w, VIEW.h)
  gl.uniform4f(shown('room'), toUvX(0), toUvY(0), toUvX(SIZE), toUvY(SIZE))
  const shownDepth = shown('depth')

  gl.useProgram(program)
  const uniform = name => gl.getUniformLocation(program, name)
  gl.uniform1i(uniform('screen'), 0)
  gl.uniform1i(uniform('lightMap'), 1)
  gl.uniform2f(uniform('view'), VIEW.w, VIEW.h)
  gl.uniform4f(uniform('room'), toUvX(0), toUvY(0), toUvX(SIZE), toUvY(SIZE))
  const time = uniform('time')
  const depth = uniform('depth')
  const pulse = uniform('pulse')
  const stop = uniform('stop')
  const zoom = uniform('zoom')
  const rings = uniform('rings')
  const aberration = uniform('aberration')
  const flash = uniform('flash')
  const desaturate = uniform('desaturate')
  const hurt = uniform('hurt')
  const lighting = uniform('lighting')
  const ringData = new Float32Array(RING_SLOTS * 4)

  const resize = () => fitCanvas(canvas)
  window.addEventListener('resize', resize)
  resize()
  const release = () => {
    window.removeEventListener('resize', resize)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  const uploadLight = state => {
    gl.activeTexture(gl.TEXTURE1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, LIGHT_SIZE, LIGHT_SIZE, 0, gl.RGB, gl.UNSIGNED_BYTE, buildLight(state, state.time))
    gl.activeTexture(gl.TEXTURE0)
  }

  const uploadRings = (state, power) => {
    ringData.fill(0)
    ;(state.rings ?? []).slice(-RING_SLOTS).forEach((ring, i) => {
      ringData[i * 4] = toUvX(ring.x)
      ringData[i * 4 + 1] = toUvY(ring.y)
      ringData[i * 4 + 2] = ring.r
      ringData[i * 4 + 3] = ring.strength * (ring.life / ring.max) * power
    })
    gl.uniform4fv(rings, ringData)
  }

  const lightLevels = state => {
    const dark = ambientOf(state)
    if (dark !== null) return [dark, 1]
    const amount = Math.min(1, Math.max(0, (state.depth - 0.3) / 0.4))
    return [1 - 0.2 * state.depth * state.depth, amount]
  }

  const present = (source, state) => {
    const power = POWER[save.settings.shaders] ?? 1
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    const [ambient, amount] = lightLevels(state)
    if (amount > 0) uploadLight(state)
    uploadRings(state, power)
    gl.uniform1f(time, state.time)
    gl.uniform1f(depth, state.depth)
    gl.uniform1f(pulse, state.pulse)
    gl.uniform1f(stop, state.stop ?? 0)
    gl.uniform3f(zoom, toUvX(state.zoom?.x ?? 112), toUvY(state.zoom?.y ?? 112), (state.zoom?.amount ?? 0) * power)
    gl.uniform1f(aberration, (state.aberr ?? 0) * power)
    gl.uniform1f(flash, Math.min(0.28, state.white ?? 0) * Math.max(power, 0.25))
    gl.uniform1f(desaturate, state.desat ?? 0)
    gl.uniform1f(hurt, Math.max(state.hurtFlash ?? 0, state.danger ?? 0))
    gl.uniform2f(lighting, ambient, amount)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    gl.viewport(0, 0, VIEW.w, VIEW.h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(display)
    gl.uniform1f(shownDepth, state.depth)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.useProgram(program)
  }
  present.release = release
  return present
}
