import { SCARF_DEEP, SCARF_RED } from './hero.js'
import { BLOCK, ROOM } from './config.js'
import { CELL_SHADER } from './cells.js'
import { MASK_SIZE } from './backdrop.js'

export const RING_SLOTS = 6
export const RIPPLE_SLOTS = 4

const ROOM_PX = (ROOM * BLOCK).toFixed(1)
const CELL = BLOCK.toFixed(1)
const CELLS = ROOM.toFixed(1)
const vec3 = rgb => `vec3(${rgb.map(v => (v / 255).toFixed(4)).join(', ')})`
const floats = names => names.map(n => `uniform float ${n};`).join('\n')

export const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2(0.5 + 0.5 * position.x, 0.5 - 0.5 * position.y);
  gl_Position = vec4(position, 0.0, 1.0);
}`

const CELL_LOOKUPS = `
vec4 cellAt(vec2 c) { return texture2D(cells, (c + 0.5) / ${CELLS}); }
bool outside(vec2 c) { return c.x < 0.0 || c.y < 0.0 || c.x >= ${CELLS} || c.y >= ${CELLS}; }
float liquidOf(vec4 d) { return floor(d.g * 255.0 / ${CELL_SHADER.liquidStep.toFixed(1)} + 0.5); }
`

const LIQUID_TINTS = `
vec3 liquidTint(float kind) {
  if (kind < 1.5) return vec3(0.09, 0.36, 0.42);
  if (kind < 2.5) return vec3(1.0, 0.42, 0.12);
  if (kind < 3.5) return vec3(0.2, 0.11, 0.25);
  return vec3(0.36, 0.72, 0.16);
}
`

export const WORLD_ERA = ['far', 'near', 'wall', 'bands', 'relief', 'unmoor', 'bend']
export const WORLD_UNIFORMS = ['time', 'reach', 'lightOn', 'ambient', 'frontFloor', 'calm', ...WORLD_ERA]

export const WORLD = `
precision highp float;
varying vec2 uv;
uniform sampler2D terrain;
uniform sampler2D cells;
uniform sampler2D lightMap;
uniform sampler2D masks;
uniform sampler2D front;
uniform vec2 frontOrigin;
uniform vec2 frontScale;
uniform vec2 vanish;
uniform vec2 drift;
uniform vec3 airBase;
uniform vec3 airFar;
uniform vec3 airNear;
uniform vec3 airWall;
uniform vec3 airSide;
${floats(WORLD_UNIFORMS)}
${CELL_LOOKUPS}
${LIQUID_TINTS}

float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 lightAt(vec2 at) {
  vec3 l = texture2D(lightMap, at / ${ROOM_PX}).rgb;
  float peak = max(l.r, max(l.g, l.b));
  if (peak <= 0.0) return l;
  float grades = bands * 1.5;
  return l * (floor(peak * grades + 0.5) / grades) / peak;
}

vec3 shine(vec3 albedo, vec2 at, float fade, float floorLight) {
  vec3 l = lightAt(at) * fade;
  vec3 lit = albedo * (floorLight + l * 1.7) + l * l * 0.05;
  lit /= 1.0 + max(lit.r, max(lit.g, lit.b)) * 0.28;
  return mix(albedo, lit, lightOn);
}

vec3 farWall(vec2 p, vec2 dir) {
  vec2 back = p + dir;
  vec2 swirl = vec2(sin(back.y * 0.031 + time * 0.5), cos(back.x * 0.027 - time * 0.4)) * (unmoor * 5.0 + bend * 9.0);
  vec3 a = airBase;
  a = mix(a, airWall, wall * step(0.5, texture2D(masks, (back + swirl) / ${MASK_SIZE.toFixed(1)}).b));
  if (far > 0.002) {
    vec2 at = p + dir * 0.84 + drift * 0.4 + swirl * 0.8;
    a = mix(a, airFar, far * step(0.5, texture2D(masks, (at + vec2(37.0, 11.0)) / ${MASK_SIZE.toFixed(1)}).g));
  }
  if (near > 0.002) {
    vec2 at = p + dir * 0.62 + drift + swirl * 0.5;
    a = mix(a, airNear, near * step(0.5, texture2D(masks, at / ${MASK_SIZE.toFixed(1)}).r));
  }
  a = mix(airBase, a, calm);
  vec3 lit = shine(a * mix(1.0, 2.6, lightOn), back + swirl * 0.4, 0.8, ambient);
  if (reach > 0.001) lit *= 1.0 - texture2D(front, (back + frontOrigin) * frontScale).a * 0.5;
  return lit;
}

vec3 wallFace(vec2 p, vec2 dir, float z, vec2 c, vec2 sgn, bool across, vec4 d) {
  vec2 h = p + dir * z;
  float grade = floor(z * bands + 0.5) / bands;
  float lap = fract(z * 2.0);
  vec2 skin = across
    ? vec2((c.x + (sgn.x > 0.0 ? lap : 1.0 - lap)) * ${CELL}, h.y)
    : vec2(h.x, (c.y + (sgn.y > 0.0 ? lap : 1.0 - lap)) * ${CELL});
  vec4 t = texture2D(terrain, skin / ${ROOM_PX});
  vec3 albedo = t.rgb + airSide * (1.0 - t.a);
  float tone = across ? 0.5 : (sgn.y > 0.0 ? 0.72 : 0.26);
  albedo = mix(albedo, airSide, 1.0 - 0.65 * calm) * tone * mix(1.0, 0.34, grade);
  vec2 spot = across ? h - vec2(sgn.x * 3.0, 0.0) : h - vec2(0.0, sgn.y * 3.0);
  vec3 lit = shine(albedo * mix(1.0, 1.35, lightOn), spot, mix(1.0, 0.5, grade), ambient);
  return lit + (d.a > 0.5 ? vec3(0.32, 0.12, 0.03) * (1.0 - z) : vec3(0.0));
}

vec3 liquidSheet(vec2 p, vec2 dir, float z, float kind) {
  vec2 h = p + dir * z;
  float sway = step(0.72, fract((h.x + sin(z * 18.0 + time) * 3.0) * 0.06 + z * 3.0));
  vec3 tint = liquidTint(kind) * mix(1.0, 0.4, z) * (1.0 + sway * 0.45);
  return kind > 1.5 && kind < 2.5 ? tint : shine(tint, h - vec2(0.0, 3.0), 0.8, max(ambient, 0.55));
}

vec3 deep(vec2 p, vec2 dir) {
  vec2 c = floor(p / ${CELL});
  vec2 sgn = vec2(dir.x < 0.0 ? -1.0 : 1.0, dir.y < 0.0 ? -1.0 : 1.0);
  vec2 inverse = 1.0 / max(abs(dir), vec2(0.0001));
  vec2 ahead = (c + max(sgn, vec2(0.0))) * ${CELL};
  vec2 next = (ahead - p) * sgn * inverse;
  vec2 stride = ${CELL} * inverse;
  float started = liquidOf(cellAt(c));
  for (int i = 0; i < 12; i++) {
    float z = min(next.x, next.y);
    if (z >= 1.0) break;
    bool across = next.x < next.y;
    if (across) {
      c.x += sgn.x;
      next.x += stride.x;
    } else {
      c.y += sgn.y;
      next.y += stride.y;
    }
    if (outside(c)) return airBase * 0.3 * (1.0 - z);
    vec4 d = cellAt(c);
    if (d.r > 0.5) return wallFace(p, dir, z, c, sgn, across, d);
    float kind = liquidOf(d);
    if (kind > 0.5 && started < 0.5) return liquidSheet(p, dir, z, kind);
  }
  return farWall(p, dir);
}

float tileLuma(vec2 at) { return luma(texture2D(terrain, at).rgb); }

vec3 tileFront(vec4 tile, vec2 p) {
  vec3 albedo = tile.rgb;
  if (relief > 0.01) {
    float e = 1.0 / ${ROOM_PX};
    vec2 bump = vec2(tileLuma(uv - vec2(e, 0.0)) - tileLuma(uv + vec2(e, 0.0)), tileLuma(uv - vec2(0.0, e)) - tileLuma(uv + vec2(0.0, e)));
    float w = 5.0 / ${ROOM_PX};
    vec2 towards = vec2(
      luma(texture2D(lightMap, uv + vec2(w, 0.0)).rgb) - luma(texture2D(lightMap, uv - vec2(w, 0.0)).rgb),
      luma(texture2D(lightMap, uv + vec2(0.0, w)).rgb) - luma(texture2D(lightMap, uv - vec2(0.0, w)).rgb)
    );
    albedo *= 1.0 + clamp(dot(bump, towards) * 26.0, -0.75, 1.8) * relief;
  }
  return shine(albedo, p, 1.0, frontFloor);
}

void main() {
  vec2 p = uv * ${ROOM_PX};
  vec4 tile = texture2D(terrain, uv);
  vec3 colour = vec3(0.0);
  if (tile.a < 0.995) colour = deep(p, (p - vanish) * reach) * (1.0 - tile.a);
  if (tile.a > 0.003) colour += tileFront(tile, p);
  gl_FragColor = vec4(colour, step(0.5, tile.a));
}`

export const OPTICS_ERA = ['cycle', 'blend', 'refract', 'reflect', 'haze', 'shafts', 'fog', 'ink', 'bands']
export const OPTICS_UNIFORMS = ['time', 'lightOn', 'gasOn', ...OPTICS_ERA]

const BAYER = `
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
`

export const OPTICS = `
precision highp float;
varying vec2 uv;
uniform sampler2D worldLayer;
uniform sampler2D cells;
uniform sampler2D fields;
uniform sampler2D lightMap;
uniform sampler2D noise;
uniform sampler2D front;
uniform vec2 frontOrigin;
uniform vec2 frontScale;
uniform vec4 ripples[${RIPPLE_SLOTS}];
uniform vec3 fogColour;
uniform vec3 beamColour;
${floats(OPTICS_UNIFORMS)}
${CELL_LOOKUPS}
${LIQUID_TINTS}
${BAYER}

vec4 worldAt(vec2 p) { return texture2D(worldLayer, vec2(p.x, ${ROOM_PX} - p.y) / ${ROOM_PX}); }
vec4 noiseAt(vec2 p) { return texture2D(noise, p / 64.0); }

float rippleLift(vec2 p) {
  float lift = 0.0;
  for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
    vec4 r = ripples[i];
    if (r.z <= 0.0 || abs(r.y - p.y) > 12.0) continue;
    float d = abs(p.x - r.x);
    float reachOut = r.w * 60.0;
    if (d > reachOut + 4.0) continue;
    lift += sin((d - reachOut) * 0.9) * 2.4 * r.z * exp(-r.w * 3.0) * exp(-d * 0.03);
  }
  return lift;
}

vec3 water(vec2 p, float below, float surfaceY) {
  vec2 chunk = floor(p);
  float ripple = sin(p.y * 0.42 + time * 1.7) + sin(p.x * 0.23 - time * 1.1) * 0.6;
  vec2 bent = vec2(ripple * 1.5 + (noiseAt(p * 0.6 + time * vec2(3.0, 1.0)).r - 0.5) * 2.6, ripple * 0.7) * refract;
  vec3 behind = worldAt(p + bent).rgb;

  float deepness = clamp(below / 42.0, 0.0, 1.0);
  vec3 tint = mix(vec3(0.09, 0.36, 0.42), vec3(0.04, 0.17, 0.26), deepness);
  float band = floor(mod(chunk.x * 0.5 + chunk.y + time * 7.0 + sin(chunk.y * 0.3) * 3.0, 12.0) / 4.0);
  vec3 cycled = tint * (0.82 + band * 0.2);
  tint = mix(tint, cycled, cycle);

  float clear = mix(0.0, mix(0.5, 0.74, refract) * (1.0 - deepness * 0.5), blend);
  vec3 colour = mix(tint, behind * vec3(0.62, 0.92, 1.0) + tint * 0.22, clear);

  if (refract > 0.01) {
    vec4 cn = noiseAt(p * 0.9 + time * vec2(2.4, -1.2));
    float caustic = pow(max(0.0, 1.0 - abs(cn.g + noiseAt(p * 1.3 - time * vec2(1.6, 2.2)).b - 1.0) * 5.0), 4.0);
    colour += vec3(0.22, 0.44, 0.46) * caustic * refract * (1.0 - deepness) * 0.45;
  }

  if (reflect > 0.01 && below < 40.0) {
    vec2 mirror = vec2(p.x + sin(p.y * 0.55 + time * 2.0) * (0.6 + below * 0.04), surfaceY * 2.0 - p.y);
    float strength = reflect * pow(1.0 - below / 40.0, 1.6) * 0.75;
    vec3 sky = worldAt(mirror).rgb;
    vec4 actor = texture2D(front, (mirror + frontOrigin) * frontScale);
    colour = mix(colour, sky * vec3(0.8, 0.95, 1.0), strength);
    colour = mix(colour, actor.rgb + colour * (1.0 - actor.a), strength * 0.9);
  }

  if (below < 1.0) colour = mod(chunk.x + floor(time * 7.0), 11.0) < 1.0 ? vec3(0.85, 0.97, 1.0) : mix(vec3(0.5, 0.86, 0.9), colour, 0.12);
  else if (below < 2.0 && refract > 0.01) colour += vec3(0.14, 0.26, 0.28) * refract;
  return colour;
}

vec3 lava(vec2 p, float below) {
  vec2 chunk = floor(p / mix(2.0, 1.0, refract)) * mix(2.0, 1.0, refract);
  vec4 warp = noiseAt(chunk * 0.5 + time * vec2(0.9, 0.4));
  float flow = noiseAt(chunk * 0.9 + (warp.rg - 0.5) * 22.0 * refract + time * vec2(-0.6, 0.5)).b;
  float v = mix(flow, fract(flow * 2.2 + time * 0.16), cycle);
  v *= v * mix(1.0, 1.15, refract);
  float steps = mix(4.0, 32.0, refract);
  v = floor(v * steps + 0.5) / steps;
  vec3 colour = v < 0.36 ? mix(vec3(0.42, 0.11, 0.05), vec3(0.85, 0.28, 0.11), v / 0.36)
    : v < 0.7 ? mix(vec3(0.85, 0.28, 0.11), vec3(1.0, 0.54, 0.18), (v - 0.36) / 0.34)
    : mix(vec3(0.98, 0.5, 0.16), vec3(1.0, 0.78, 0.28), (v - 0.7) / 0.3);
  if (below < 1.0) return mod(floor(p.x) + floor(time * 7.0), 11.0) < 1.0 ? vec3(1.0, 0.96, 0.75) : vec3(1.0, 0.82, 0.29);
  return colour;
}

vec3 oil(vec2 p, float below, vec3 behind) {
  vec2 chunk = floor(p);
  float sheen = noiseAt(chunk * 0.8 + time * vec2(1.0, 0.3)).g;
  vec3 film = 0.5 + 0.5 * cos(6.28 * (sheen * 1.4 + vec3(0.0, 0.33, 0.67)) + time * 0.4);
  vec3 colour = mix(vec3(0.16, 0.09, 0.19), vec3(0.09, 0.03, 0.12), clamp(below / 20.0, 0.0, 1.0));
  colour += step(0.8, sheen) * mix(vec3(0.16, 0.1, 0.22), film * 0.45, refract);
  if (below < 1.0) return mod(chunk.x + floor(time * 7.0), 11.0) < 1.0 ? vec3(0.9, 0.72, 0.94) : vec3(0.63, 0.42, 0.69);
  return mix(colour, behind, 0.06 * blend);
}

vec3 acid(vec2 p, float below, vec3 behind) {
  vec2 chunk = floor(p);
  float rise = noiseAt(vec2(chunk.x * 3.0, chunk.y * 3.0 + time * 30.0)).r;
  vec3 colour = mix(vec3(0.33, 0.73, 0.14), vec3(0.16, 0.47, 0.08), clamp(below / 24.0, 0.0, 1.0));
  colour = mix(colour, behind * vec3(0.6, 1.1, 0.5), 0.22 * blend);
  colour += step(0.82, rise) * vec3(0.5, 0.42, 0.18);
  if (below < 1.0) return mod(chunk.x + floor(time * 7.0), 11.0) < 1.0 ? vec3(0.94, 1.0, 0.75) : vec3(0.78, 1.0, 0.35);
  return colour;
}

vec3 gas(vec2 p, vec3 under, vec3 glow) {
  vec4 f = texture2D(fields, p / ${ROOM_PX});
  if (gasOn < 0.5 || (f.r + f.g + f.b < 0.02 && ink < 0.01)) return under;
  vec4 d = f;
  float curl = 0.0;
  if (ink > 0.01) {
    vec2 w = noiseAt(p * 0.35 + time * vec2(0.8, 2.2)).rg - 0.5;
    vec2 w2 = noiseAt(p * 0.8 - time * vec2(1.4, 3.2) + w * 40.0).ba - 0.5;
    d = mix(d, texture2D(fields, (p + (w + w2 * 0.6) * 26.0) / ${ROOM_PX}), ink);
    curl = noiseAt(p * 1.2 + (w2 - w) * 30.0 + time * vec2(0.3, 2.0)).r;
  }
  float mark = bayer4(p);
  vec3 smokeC = mix(vec3(0.45, 0.48, 0.45), vec3(0.015, 0.02, 0.035), ink);
  vec3 steamC = mix(vec3(0.78, 0.85, 0.85), vec3(0.72, 0.84, 0.9), ink);
  vec3 marshC = mix(vec3(0.69, 0.49, 0.85), vec3(0.34, 0.1, 0.62), ink);
  vec3 colour = under;
  float grain = mix(1.0, smoothstep(0.1, 0.75, curl + 0.15), ink);
  float smoke = mix(step(mark + 0.04, d.r * 0.9), smoothstep(0.18, 0.62, d.r * grain * 1.4) * 0.92, ink);
  float steam = mix(step(mark + 0.04, d.g * 0.8), smoothstep(0.2, 0.7, d.g * grain * 1.2) * 0.62, ink);
  float marsh = mix(step(mark + 0.04, d.b * 0.8), smoothstep(0.18, 0.66, d.b * grain * 1.4) * 0.72, ink);
  colour = mix(colour, marshC + glow * 0.3, marsh * mix(1.0, 0.85, blend));
  colour = mix(colour, steamC + glow * 0.2, steam);
  colour = mix(colour, smokeC + glow * 0.25, smoke);
  return colour;
}

void main() {
  vec2 p = uv * ${ROOM_PX};
  vec4 here = cellAt(floor(p / ${CELL}));
  vec4 under = cellAt(floor((p + vec2(0.0, 4.0)) / ${CELL}));
  float lift = 0.0;
  if (liquidOf(here) > 0.5 || liquidOf(under) > 0.5) {
    lift = (sin(time * 2.4 + floor(p.x) * 0.55) > 0.2 ? 0.0 : 1.0) + rippleLift(p);
    lift = floor(lift + 0.5);
  }
  vec2 raised = vec2(p.x, p.y + lift);
  vec4 cell = cellAt(floor(raised / ${CELL}));
  float kind = here.r > 0.5 ? 0.0 : liquidOf(cell);

  float heat = 0.0;
  if (haze > 0.01) heat = (texture2D(fields, (p + vec2(0.0, 13.0)) / ${ROOM_PX}).a + texture2D(fields, (p + vec2(0.0, 30.0)) / ${ROOM_PX}).a * 0.6) * haze;
  vec2 shimmer = vec2(0.0);
  if (heat > 0.01) {
    float wob = sin(p.y * 0.62 + time * 6.0 + noiseAt(p * 0.4 + vec2(0.0, time * 9.0)).r * 7.0);
    shimmer = vec2(wob * 2.2, (noiseAt(p * 0.5 - vec2(0.0, time * 6.0)).g - 0.5) * 2.0) * heat;
  }

  vec4 base = worldAt(p);
  vec3 colour = base.rgb;
  if (heat > 0.01) colour = worldAt(p + shimmer * (base.a > 0.5 ? 0.45 : 1.0)).rgb;

  if (kind > 0.5) {
    float surfaceY = (floor(raised.y / ${CELL}) - floor(cell.b * 255.0 / ${CELL_SHADER.surfaceStep.toFixed(1)} + 0.5)) * ${CELL} - lift;
    float below = p.y - surfaceY;
    if (kind < 1.5) colour = water(p, below, surfaceY);
    else if (kind < 2.5) colour = lava(p, below);
    else if (kind < 3.5) colour = oil(p, below, colour);
    else colour = acid(p, below, colour);
  }

  vec4 light = texture2D(lightMap, uv);

  if (fog > 0.01) {
    vec4 a = noiseAt(p * 0.28 + time * vec2(1.3, 0.4));
    vec4 b = noiseAt(p * 0.62 - time * vec2(2.1, 0.7) + a.rg * 8.0);
    float layered = smoothstep(0.42, 0.78, a.b) * 0.5 + smoothstep(0.5, 0.82, b.a) * 0.4;
    float floorBias = 0.55 + uv.y * 0.65;
    float density = fog * layered * floorBias * (base.a > 0.5 ? 0.22 : 0.6);
    colour = mix(colour, fogColour * (0.7 + light.rgb * 1.6), density);
  }

  if (shafts > 0.01 && light.a > 0.0) {
    float streak = 0.62 + 0.38 * noiseAt(vec2(p.x * 0.22 + p.y * 0.05, time * 1.4)).b;
    float dust = step(0.93, noiseAt(floor(p) * 2.2 + time * vec2(-1.0, 1.6)).r);
    colour += beamColour * light.a * streak * shafts * (base.a > 0.5 ? 0.12 : 0.42 + dust * 0.28);
  }

  colour = gas(p, colour, lightOn * light.rgb);
  gl_FragColor = vec4(colour, 1.0);
}`

export const FRAME_ERA = ['green', 'shades', 'posterise', 'ghost', 'bloom', 'saturate', 'unmoor', 'pit', 'bend']
export const FRAME_UNIFORMS = ['time', 'pulse', 'stop', 'aberration', 'flash', 'desaturate', 'hurt', 'forced', 'doorOn', 'halo', 'calm', 'coreGlow', ...FRAME_ERA]

export const FRAME = `
precision highp float;
varying vec2 uv;
uniform sampler2D roomNow;
uniform sampler2D roomOld;
uniform sampler2D front;
uniform sampler2D history;
uniform sampler2D lightMap;
uniform sampler2D noise;
uniform vec2 view;
uniform vec2 origin;
uniform vec2 shake;
uniform vec2 slideNew;
uniform vec2 slideOld;
uniform vec2 mapPos;
uniform vec3 zoom;
uniform vec3 pitColour;
uniform vec4 rings[${RING_SLOTS}];
${floats(FRAME_UNIFORMS)}

const vec3 GB0 = vec3(0.059, 0.200, 0.098);
const vec3 GB1 = vec3(0.188, 0.384, 0.188);
const vec3 GB2 = vec3(0.545, 0.675, 0.059);
const vec3 GB3 = vec3(0.804, 0.871, 0.569);
const vec3 SPOT = ${vec3(SCARF_RED)};
const vec3 SPOT_DEEP = ${vec3(SCARF_DEEP)};
const float SIZE = ${ROOM_PX};

float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 gameBoy(float l) {
  if (l < 0.14) return GB0;
  if (l < 0.38) return GB1;
  if (l < 0.68) return GB2;
  return GB3;
}

float shadeLevel(float l) {
  if (l < 0.14) return 0.05;
  if (l < 0.38) return 0.24;
  if (l < 0.68) return 0.52;
  return 0.86;
}

vec3 handheld(vec3 c) {
  if (green < 0.001 && shades < 0.001) return c;
  float l = luma(c);
  vec3 kept = c * shadeLevel(l) / max(l, 0.03);
  vec3 toned = mix(c, min(kept, vec3(1.0)), shades);
  return mix(toned, gameBoy(l), green);
}

vec4 noiseAt(vec2 p) { return texture2D(noise, p / 64.0); }

bool inSquare(vec2 r) { return r.x >= 0.0 && r.y >= 0.0 && r.x < SIZE && r.y < SIZE; }
vec4 rawRoom(sampler2D tex, vec2 r) { return vec4(texture2D(tex, vec2(r.x, SIZE - r.y) / SIZE).rgb, 1.0); }

vec4 roomAt(vec2 r) {
  r -= shake;
  if (doorOn > 0.5) {
    vec2 n = r - slideNew;
    if (inSquare(n)) return rawRoom(roomNow, n);
    vec2 o = r - slideOld;
    if (inSquare(o)) return rawRoom(roomOld, o);
    return vec4(0.0);
  }
  if (inSquare(r)) return rawRoom(roomNow, r);
  return vec4(0.0);
}

float slotDrift(float slot, float side) {
  float h = fract(sin(slot * 12.9898 + side * 78.233) * 43758.5453);
  if (h < 0.72) return 0.0;
  return (0.5 + 0.5 * sin(time * (0.28 + h * 0.5) + h * 40.0)) * (4.0 + h * 34.0) * unmoor;
}

vec4 frayedRoom(vec2 r) {
  vec2 s = r - shake;
  vec4 inner = roomAt(r);
  if (doorOn > 0.5) return inSquare(s) ? inner : vec4(0.0);
  if (unmoor < 0.01) return inner;
  vec2 out_ = max(-s, s - SIZE);
  float away = max(out_.x, out_.y);
  bool sideways = out_.x > out_.y;
  float along = sideways ? s.y : s.x;
  float side = sideways ? (s.x < 0.0 ? 1.0 : 2.0) : (s.y < 0.0 ? 3.0 : 4.0);
  float slot = floor(along / ${CELL});
  if (away >= 0.0) {
    if (along < 0.0 || along >= SIZE) return vec4(0.0);
    float d = slotDrift(slot, side);
    if (d <= 0.0 || away < d - ${CELL} || away >= d) return vec4(0.0);
    float into = ${CELL} - (d - away);
    vec2 src = sideways ? vec2(s.x < 0.0 ? into : SIZE - 0.5 - into, s.y) : vec2(s.x, s.y < 0.0 ? into : SIZE - 0.5 - into);
    vec4 chip = rawRoom(roomNow, src);
    float rimmed = step(away, d - ${CELL} + 1.0);
    return vec4((chip.rgb + pitColour * (0.1 + rimmed * 0.3)) * (1.0 - d / 70.0), 1.0);
  }
  float inset = min(min(s.x, s.y), min(SIZE - s.x, SIZE - s.y));
  if (inset < ${CELL}) {
    bool sidewaysIn = min(s.x, SIZE - s.x) < min(s.y, SIZE - s.y);
    float alongIn = sidewaysIn ? s.y : s.x;
    float sideIn = sidewaysIn ? (s.x < ${CELL} ? 1.0 : 2.0) : (s.y < ${CELL} ? 3.0 : 4.0);
    if (slotDrift(floor(alongIn / ${CELL}), sideIn) > ${CELL} * 0.8) return vec4(0.0);
  }
  return inner;
}

vec3 pitView(vec2 px) {
  if (pit < 0.002) return vec3(0.0);
  vec2 centre = origin + SIZE * 0.5;
  vec2 m = (px - centre) / 58.0 + mapPos;
  vec2 fold = abs(m);
  float s = max(fold.x, fold.y);
  float ring = floor(s + 0.5);
  float shade = pow(max(0.0, 1.0 - ring / 8.0), 1.6);
  vec2 inTile = abs(fract(m + 0.5) - 0.5);
  float seam = smoothstep(0.44, 0.5, max(inTile.x, inTile.y));
  float rim = smoothstep(0.42, 0.5, abs(fract(s + 0.5) - 0.5));
  vec2 towards = fold.x > fold.y ? vec2(sign(m.x), 0.0) : vec2(0.0, sign(m.y));
  float wallShade = 0.75 + 0.25 * dot(towards, vec2(0.4, -0.9));
  vec3 colour = pitColour * (0.012 + shade * 0.15) * wallShade;
  colour *= 1.0 - seam * 0.6;
  colour += pitColour * rim * (0.03 + shade * 0.22);
  colour += vec3(0.4, 0.85, 1.0) * coreGlow * exp(-s * 1.1) * 0.32 * (0.7 + 0.3 * sin(time * 1.7));
  float dust = step(0.985, noiseAt(floor(px) + vec2(0.0, -floor(time * 7.0))).r);
  colour += pitColour * dust * 0.6;
  return colour * pit * calm;
}

vec3 bright(vec2 r) {
  vec3 c = roomAt(r).rgb;
  return c * smoothstep(0.62, 1.0, max(c.r, max(c.g, c.b)));
}

void main() {
  vec2 px = uv * view;
  vec2 rp = px - origin;
  bool inRoom = inSquare(rp);

  vec2 zoomed = rp;
  if (zoom.z > 0.0) zoomed = zoom.xy + (rp - zoom.xy) / (1.0 + zoom.z);

  vec2 warped = zoomed;
  for (int i = 0; i < ${RING_SLOTS}; i++) {
    vec4 ring = rings[i];
    if (ring.w == 0.0) continue;
    vec2 d = warped - ring.xy;
    float away = length(d);
    float band = 1.0 - smoothstep(0.0, 9.0, abs(away - ring.z));
    if (away > 0.5) warped -= (d / away) * band * ring.w;
  }

  if (bend > 0.001) {
    vec2 toCore = vec2(SIZE * 0.5) - warped;
    float dist = length(toCore);
    float pull = (1.2 + sin(time * 1.1 - dist * 0.035)) * 1.6 * bend;
    float edgeBias = smoothstep(46.0, 150.0, dist);
    warped += (toCore / max(dist, 1.0)) * pull * edgeBias + vec2(-toCore.y, toCore.x) / max(dist, 1.0) * sin(time * 0.6) * 2.4 * bend * edgeBias;
  }

  vec4 f = texture2D(front, (inRoom ? zoomed + origin : px) / view);

  vec4 w = frayedRoom(warped);
  vec3 world = w.rgb;
  if (w.a > 0.5) {
    vec2 fromCentre = warped / SIZE - 0.5;
    float kick = pulse * 1.1 + aberration * 1.2 + bloom * bloom * 0.35;
    if (kick > 0.01) {
      vec2 spread = fromCentre * kick * 2.0;
      world.r = roomAt(warped + spread).r;
      world.b = roomAt(warped - spread).b;
    }
    float glow = bloom * 0.8 + pulse * 0.45;
    if (glow > 0.01) {
      vec3 sum = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7854;
        vec2 d = vec2(cos(a), sin(a));
        sum += bright(warped + d * 2.0) + bright(warped + d * 4.5);
      }
      world += sum / 16.0 * glow;
    }
    float grey = luma(world);
    world = mix(vec3(grey), world, saturate);
    if (posterise > 0.001) {
      float levels = mix(32.0, 8.0, posterise);
      vec3 stepped = floor(world * levels + 0.5) / levels;
      world = mix(world, stepped, smoothstep(0.1, 0.2, luma(world)));
    }
    vec2 fromMiddle = warped / SIZE - 0.5;
    world *= 1.0 - bloom * 0.3 * dot(fromMiddle, fromMiddle) * 2.0;
  } else {
    world = pitView(px);
  }

  if (halo > 0.001 && inRoom && f.a < 0.5) {
    vec2 e = 1.0 / view;
    vec2 q = (zoomed + origin) * e;
    float near = max(max(texture2D(front, q + vec2(e.x, 0.0)).a, texture2D(front, q - vec2(e.x, 0.0)).a), max(texture2D(front, q + vec2(0.0, e.y)).a, texture2D(front, q - vec2(0.0, e.y)).a));
    world *= 1.0 - near * halo;
  }

  if (w.a > 0.5) world = handheld(world);

  vec3 actor = f.rgb;
  float spot = 0.0;
  if (f.a > 0.001) {
    vec3 plain = actor / f.a;
    spot = f.a > 0.98 ? max(step(distance(plain, SPOT), 0.012), step(distance(plain, SPOT_DEEP), 0.012)) : 0.0;
    actor = handheld(plain) * f.a;
    if (forced > 0.001 && inRoom) {
      vec3 l = texture2D(lightMap, zoomed / SIZE).rgb;
      actor *= mix(vec3(1.0), clamp(l * 2.4 + 0.1, 0.0, 1.0), forced);
    }
  }
  vec3 colour = actor + world * (1.0 - f.a);

  float stopped = luma(colour);
  colour = mix(colour, vec3(stopped * 0.75, stopped * 0.95, stopped * 1.25), stop * 0.85);

  if (inRoom) {
    vec3 paper = mix(vec3(1.0), GB3, green);
    colour = mix(colour, paper, flash);
    vec2 edge = min(rp, SIZE - rp) / SIZE;
    float rim = 1.0 - smoothstep(0.0, 0.22, min(edge.x, edge.y));
    colour = mix(colour, SPOT, clamp(hurt * (0.03 + rim * 0.58), 0.0, 1.0));
  }

  float dull = luma(colour);
  colour = mix(colour, vec3(dull * 0.92), desaturate);
  if (spot > 0.5) colour = f.rgb;

  if (ghost > 0.001 && inRoom) colour = mix(colour, texture2D(history, vec2(uv.x, 1.0 - uv.y)).rgb, ghost);
  gl_FragColor = vec4(colour, 1.0);
}`

export const DISPLAY = `
precision mediump float;
varying vec2 uv;
uniform sampler2D scene;
uniform vec2 view;
uniform vec4 room;
uniform float lcd;
uniform float scanline;

void main() {
  vec3 colour = texture2D(scene, vec2(uv.x, 1.0 - uv.y)).rgb;
  bool inRoom = uv.x > room.x && uv.y > room.y && uv.x < room.z && uv.y < room.w;
  vec2 cell = fract(uv * view);
  float grid = step(0.86, cell.x) + step(0.86, cell.y);
  if (inRoom) colour *= 1.0 - min(grid, 1.0) * lcd * 0.2;
  colour *= 1.0 - scanline * 0.16 * step(0.5, cell.y);
  gl_FragColor = vec4(colour, 1.0);
}`

export const QUAD_VERTEX = `
attribute vec2 position;
uniform mat4 transform;
varying vec2 uv;
void main() {
  uv = position;
  gl_Position = transform * vec4(position, 0.0, 1.0);
}`

export const QUAD = `
precision mediump float;
varying vec2 uv;
uniform sampler2D roomNow;
uniform sampler2D front;
uniform vec4 actorRect;
uniform float actors;
uniform float opacity;

void main() {
  vec3 world = texture2D(roomNow, vec2(uv.x, 1.0 - uv.y)).rgb;
  vec4 f = texture2D(front, actorRect.xy + uv * actorRect.zw) * actors;
  gl_FragColor = vec4((f.rgb + world * (1.0 - f.a)) * opacity, opacity);
}`
