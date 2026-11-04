import { BLOCK, ORIGIN, ROOM, VIEW } from './config.js'

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2(0.5 + 0.5 * position.x, 0.5 - 0.5 * position.y);
  gl_Position = vec4(position, 0.0, 1.0);
}`

const FRAGMENT = `
precision highp float;
varying vec2 uv;
uniform sampler2D screen;
uniform vec2 view;
uniform vec4 room;
uniform float time;
uniform float depth;
uniform float pulse;

const vec3 GB0 = vec3(0.059, 0.200, 0.098);
const vec3 GB1 = vec3(0.188, 0.384, 0.188);
const vec3 GB2 = vec3(0.545, 0.675, 0.059);
const vec3 GB3 = vec3(0.804, 0.871, 0.569);

float noise(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 bright(vec2 p) {
  vec3 c = texture2D(screen, p).rgb;
  return c * smoothstep(0.55, 0.95, max(c.r, max(c.g, c.b)));
}

vec3 gameBoy(vec3 c) {
  float l = luma(c);
  if (l < 0.14) return GB0;
  if (l < 0.38) return GB1;
  if (l < 0.68) return GB2;
  return GB3;
}

void main() {
  float deep = smoothstep(0.35, 1.0, depth);
  float core = smoothstep(0.8, 1.0, depth);
  vec2 p = uv;

  float band = floor(p.y * view.y / 6.0);
  float tear = step(0.95, noise(band + floor(time * 9.0)));
  p.x += core * tear * 0.014 * (noise(band) - 0.5);
  p.x += sin(p.y * 46.0 + time * 2.2) * deep * deep * 0.0016;

  vec2 fromCentre = p - 0.5;
  float spread = (depth * depth * 1.3 + pulse * 2.2) / view.x;
  vec3 colour = vec3(
    texture2D(screen, p + fromCentre * spread * 2.0).r,
    texture2D(screen, p).g,
    texture2D(screen, p - fromCentre * spread * 2.0).b
  );

  float glow = smoothstep(0.2, 0.8, depth) + pulse * 0.8;
  if (glow > 0.01) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      vec2 d = vec2(cos(a), sin(a)) / view;
      sum += bright(p + d * 2.0) + bright(p + d * 4.5);
    }
    colour += sum / 16.0 * glow;
  }

  float grey = luma(colour);
  colour = mix(vec3(grey), colour, 1.0 + deep * 0.7);
  colour = mix(colour, colour.brg, deep * deep * (0.5 + 0.5 * sin(time * 0.4)) * 0.35);

  bool inRoom = uv.x > room.x && uv.y > room.y && uv.x < room.z && uv.y < room.w;
  float lit = step(0.02, luma(colour));
  float handheld = 1.0 - smoothstep(0.0, 0.25, depth);
  if (handheld > 0.0 && (inRoom || lit > 0.5)) {
    colour = mix(colour, gameBoy(colour), handheld);
  }

  vec2 cell = fract(uv * view);
  float grid = step(0.86, cell.x) + step(0.86, cell.y);
  float lcd = (1.0 - smoothstep(0.0, 0.35, depth)) * 0.16;
  if (inRoom) colour *= 1.0 - min(grid, 1.0) * lcd;

  colour *= 1.0 - deep * 0.14 * (0.5 + 0.5 * sin(uv.y * view.y * 6.283));

  float reach = length(fromCentre);
  colour += vec3(0.08, 0.32, 0.38) * core * (0.5 + 0.5 * sin(time * 1.7)) * pow(max(0.0, 1.0 - reach * 2.0), 2.0) * 0.7;
  colour *= 1.0 - deep * 0.3 * reach * reach;

  gl_FragColor = vec4(colour, 1.0);
}`

const compile = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

const createProgram = gl => {
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  return program
}

const fitCanvas = canvas => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const fit = Math.min(window.innerWidth / VIEW.w, window.innerHeight / VIEW.h)
  const scale = Math.max(1 / dpr, Math.floor(fit * dpr) / dpr)
  canvas.style.width = `${VIEW.w * scale}px`
  canvas.style.height = `${VIEW.h * scale}px`
  canvas.width = VIEW.w * scale * dpr
  canvas.height = VIEW.h * scale * dpr
}

export const createPresenter = canvas => {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
  const program = createProgram(gl)
  gl.useProgram(program)

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const uniform = name => gl.getUniformLocation(program, name)
  const size = ROOM * BLOCK
  gl.uniform2f(uniform('view'), VIEW.w, VIEW.h)
  gl.uniform4f(
    uniform('room'),
    ORIGIN.x / VIEW.w, ORIGIN.y / VIEW.h,
    (ORIGIN.x + size) / VIEW.w, (ORIGIN.y + size) / VIEW.h,
  )
  const time = uniform('time')
  const depth = uniform('depth')
  const pulse = uniform('pulse')

  const resize = () => {
    fitCanvas(canvas)
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  window.addEventListener('resize', resize)
  resize()

  return (source, state) => {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.uniform1f(time, state.time)
    gl.uniform1f(depth, state.depth)
    gl.uniform1f(pulse, state.pulse)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}
