import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'
import { cell, centre, liquidAtPx, solidAt } from './physics.js'
import { pick, rand, rnd } from './dice.js'
import { LIQUID, atMat, dustPuff, eraIndex, eraOf, glint, glitter, many, mix, roomForAmbient, spawn, stainCell } from './particles.js'
import { isTouchLayout } from './layout.js'

const T = TUNING.particles

export const MATERIAL_COLOURS = {
  [M.ROCK]: ['#8a9c3e', '#5e6e30'], [M.MOSS]: ['#a8c84a', '#6f8f30'], [M.PEAT]: ['#a8804a', '#7a5a2a'],
  [M.WOOD]: ['#c49a54', '#e4bc78'], [M.METAL]: ['#a4a9ac', '#d8dcde'], [M.SCRAP]: ['#b6a080', '#7f7058'],
  [M.SAND]: ['#e2d28c', '#b8a868'], [M.BEDROCK]: ['#4a5a50', '#343f38'], [M.ICE]: ['#bff2ff', '#ffffff'],
  [M.BRICK]: ['#7a8a50', '#566238'], [M.VOLATILE]: ['#f07ae0', '#ffc0f4'], [M.GATE]: ['#b6bbbd', '#e0e4e6'],
  [M.WATER]: ['#6fd0e0', '#bff2ff'], [M.OIL]: ['#a06ab0', '#5a3a66'], [M.LAVA]: ['#ff9a2e', '#ffe84a'], [M.ACID]: ['#c8ff5a', '#7fd030'],
  [M.ASH]: ['#8c8c84', '#5a5a54'], [M.VINE]: ['#6f9f40', '#a8c84a'], [M.FLOE]: ['#bff2ff', '#ffffff'], [M.RIME]: ['#d8f8ff', '#ffffff'],
  [M.STILL]: ['#8a9c3e', '#5e6e30'],
  [M.GLASS]: ['#d6f6f0', '#ffffff'], [M.MUD]: ['#8e7c60', '#5c4c3a'], [M.SNOW]: ['#eef4f4', '#c2d0d8'],
}

const coloursOf = mat => MATERIAL_COLOURS[mat] ?? ['#c9d4c0', '#8a9484']

const FAMILY = {
  [M.ROCK]: 'chip', [M.BRICK]: 'chip', [M.BEDROCK]: 'chip', [M.STILL]: 'chip',
  [M.MOSS]: 'clod', [M.PEAT]: 'clod', [M.MUD]: 'clod',
  [M.WOOD]: 'splinter', [M.VINE]: 'splinter',
  [M.METAL]: 'scrap', [M.GATE]: 'scrap', [M.SCRAP]: 'scrap',
  [M.SAND]: 'grain', [M.ASH]: 'grain', [M.SNOW]: 'grain',
  [M.ICE]: 'shard', [M.FLOE]: 'shard', [M.RIME]: 'shard', [M.GLASS]: 'shard',
  [M.VOLATILE]: 'crystal',
}

const PIECE = {
  chip: (g, x, y, vx, vy, colour, alt, size) => { spawn(g, 'chip', x, y, vx, vy, rand(0.7, 1.5), colour, alt, size).turn = rand(-14, 14) },
  clod: (g, x, y, vx, vy, colour, alt, size) => {
    const p = spawn(g, 'clod', x, y, vx, vy, rand(0.8, 1.5), colour, alt, size)
    p.turn = rand(-8, 8)
    p.tag = colour === MATERIAL_COLOURS[M.PEAT][0] || colour === MATERIAL_COLOURS[M.PEAT][1] ? 1 : 0
  },
  splinter: (g, x, y, vx, vy, colour, alt, size) => {
    const p = spawn(g, 'splinter', x, y, vx, vy, rand(1, 2.2), colour, alt, size)
    p.turn = rand(5, 10)
    p.tag = rand(30, 52)
  },
  scrap: (g, x, y, vx, vy, colour, alt, size) => { spawn(g, 'scrap', x, y, vx, vy, rand(1.1, 2), colour, alt, size).turn = rand(-22, 22) },
  grain: (g, x, y, vx, vy, colour, alt) => { spawn(g, 'grain', x, y, vx * 0.5, vy * 0.5, rand(0.9, 1.6), colour, alt, 1).tag = 1 },
  shard: (g, x, y, vx, vy, colour, alt, size) => { spawn(g, 'shard', x, y, vx, vy, rand(0.7, 1.3), colour, alt, size).turn = rand(14, 34) * (rnd() < 0.5 ? -1 : 1) },
  crystal: (g, x, y, vx, vy, colour, alt, size) => { spawn(g, 'crystal', x, y, vx * 0.7, vy * 0.7, rand(0.9, 1.6), colour, alt, size).turn = rand(-11, 11) },
  gib: (g, x, y, vx, vy, colour, alt, size) => { spawn(g, 'gib', x, y, vx, vy, rand(0.7, 1.4), colour, alt, size).turn = rand(-13, 13) },
  goo: (g, x, y, vx, vy, colour, alt, size) => { spawn(g, 'drop', x, y, vx * 0.8, vy * 0.8, rand(0.6, 1.1), colour, alt, size).tag = LIQUID.gore },
  feather: (g, x, y, vx, vy, colour, alt, size) => {
    const p = spawn(g, 'splinter', x, y, vx * 0.7, vy * 0.7, rand(1, 2.1), colour, alt, size)
    p.turn = rand(4, 7)
    p.tag = rand(18, 30)
  },
  puff: (g, x, y, vx, vy, colour) => { spawn(g, 'wisp', x, y, vx * 0.3, vy * 0.3 - 8, rand(0.5, 1.1), colour) },
  ink: (g, x, y, vx, vy, colour) => { spawn(g, 'smoke', x, y, vx * 0.2, rand(-34, -14), rand(0.5, 0.9), colour, colour, 2) },
  cinder: (g, x, y, vx, vy, colour) => { spawn(g, 'ember', x, y, vx * 0.3, vy * 0.2 - 10, rand(0.5, 1.2), '#ff9a2e', mix(colour, '#000000', 0.5)) },
  fizz: (g, x, y, vx, vy, colour) => { spawn(g, 'fizz', x, y, vx * 0.12, rand(-26, -10), rand(0.4, 0.8), colour, '#c8ff5a') },
}

const SPREAD = {
  chip: { speed: [25, 100], lift: 30, big: 0.42, count: 1 },
  clod: { speed: [20, 70], lift: 30, big: 0.45, count: 0.8 },
  splinter: { speed: [30, 95], lift: 50, big: 0.45, count: 1.2 },
  scrap: { speed: [55, 135], lift: 55, big: 0.4, count: 0.9 },
  grain: { speed: [10, 50], lift: 10, big: 0, count: 3 },
  shard: { speed: [45, 125], lift: 40, big: 0.35, count: 1.1 },
  crystal: { speed: [35, 95], lift: 45, big: 0.4, count: 0.9 },
}

const FLOURISH = {
  chip: (g, x, y, colours, n) => {
    for (let i = many(g, 1 + n * 0.3); i > 0; i--) dustPuff(g, x + rand(-3, 3), y + rand(-3, 3), rand(-18, 18), rand(-14, -2), mix(colours[1], '#8c9884', 0.5))
  },
  clod: (g, x, y, colours, n) => {
    for (let i = many(g, 1 + n * 0.3); i > 0; i--) dustPuff(g, x + rand(-3, 3), y, rand(-12, 12), rand(-10, -2), mix(colours[1], '#000000', 0.2), rand(0.3, 0.55))
  },
  splinter: () => {},
  scrap: (g, x, y, colours, n) => {
    for (let i = many(g, n * 0.6); i > 0; i--) {
      const a = rnd() * Math.PI * 2
      const v = rand(50, 150)
      spawn(g, 'spark', x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.12, 0.3), '#ffe84a', '#ffffff')
    }
  },
  grain: (g, x, y, colours, n) => {
    for (let i = many(g, 1 + n * 0.2); i > 0; i--) dustPuff(g, x, y, rand(-20, 20), rand(-8, 4), mix(colours[0], '#ffffff', 0.15), rand(0.22, 0.4))
  },
  shard: (g, x, y, colours, n) => {
    glint(g, x + rand(-2, 2), y + rand(-2, 2), '#bff2ff', 2)
    for (let i = many(g, n * 0.3); i > 0; i--) spawn(g, 'frost', x + rand(-4, 4), y + rand(-4, 4), rand(-14, 14), rand(-14, 0), rand(0.5, 1), '#d8f8ff', '#ffffff', rnd() < 0.4 ? 2 : 1)
  },
  crystal: (g, x, y, colours, n) => {
    for (let i = many(g, 1 + n * 0.4); i > 0; i--) glint(g, x + rand(-5, 5), y + rand(-5, 5), colours[0], rnd() < 0.3 ? 3 : 2, rand(0.16, 0.32))
    spawn(g, 'pop', x, y, 0, 0, 0.16, colours[1], colours[1], 6)
  },
}

export const breakAt = (g, x, y, mat, n, awayX = 0, awayY = 0, push = 0) => {
  const family = FAMILY[mat] ?? 'chip'
  const colours = coloursOf(mat)
  const shape = SPREAD[family]
  const shaped = eraOf(g).shapes > 0
  for (let i = many(g, n * shape.count); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(shape.speed[0], shape.speed[1])
    const colour = pick(colours)
    PIECE[family](g, x + rand(-2, 2), y + rand(-2, 2), Math.cos(a) * v + awayX * push, Math.sin(a) * v - shape.lift + awayY * push, colour, shaped ? colours[1] : colour, rnd() < shape.big ? 2 : 1)
  }
  FLOURISH[family](g, x, y, colours, n)
}

const SCUFF = {
  chip: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 3); i > 0; i--) {
      const s = rand(-1, 1)
      const v = rand(25, 85)
      PIECE.chip(g, x, y, (bx + s * by) * v, (by - s * bx) * v - 20, pick(colours), colours[1], 1)
    }
    for (let i = many(g, 1.6); i > 0; i--) {
      const s = rand(-0.8, 0.8)
      const v = rand(60, 130)
      spawn(g, 'spark', x, y, (bx + s * by) * v, (by - s * bx) * v, rand(0.06, 0.14), '#f4f8f2').hits = 1
    }
    dustPuff(g, x + bx * 2, y + by * 2, bx * 9, by * 9 - 5, mix(colours[1], '#8c9884', 0.5))
  },
  clod: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 2.4); i > 0; i--) PIECE.clod(g, x, y, bx * rand(15, 45) + rand(-16, 16), by * rand(15, 45) - 20, pick(colours), colours[1], 1)
    dustPuff(g, x + bx * 2, y + by * 2, bx * 6, by * 6 - 4, mix(colours[1], '#000000', 0.2), 0.45)
  },
  splinter: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 3.4); i > 0; i--) {
      const s = rand(-1.3, 1.3)
      const v = rand(30, 90)
      PIECE.splinter(g, x, y, (bx + s * by) * v, (by - s * bx) * v - 20, pick(colours), colours[1], rnd() < 0.4 ? 2 : 1)
    }
  },
  scrap: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 6); i > 0; i--) {
      const s = rand(-0.9, 0.9)
      const v = rand(70, 170)
      spawn(g, 'spark', x, y, (bx + s * by) * v, (by - s * bx) * v, rand(0.12, 0.3), '#ffe84a', '#ffffff')
    }
    glint(g, x, y, '#ffe84a', 2, 0.12)
  },
  grain: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 8); i > 0; i--) PIECE.grain(g, x + rand(-2, 2), y + rand(-2, 2), bx * rand(20, 90) + rand(-16, 16), by * rand(20, 90) - 18, pick(colours), colours[1])
  },
  shard: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 3); i > 0; i--) {
      const s = rand(-1, 1)
      const v = rand(40, 110)
      PIECE.shard(g, x, y, (bx + s * by) * v, (by - s * bx) * v - 15, pick(colours), '#ffffff', 1)
    }
    glint(g, x, y, '#bff2ff', 2, 0.14)
  },
  crystal: (g, x, y, bx, by, colours) => {
    for (let i = many(g, 2.4); i > 0; i--) PIECE.crystal(g, x, y, bx * rand(25, 60) + rand(-25, 25), by * rand(25, 60) - 20, colours[0], colours[1], 1)
    glint(g, x, y, colours[0], 3, 0.2)
    spawn(g, 'pop', x, y, 0, 0, 0.14, colours[1], colours[1], 5)
  },
}

export const impactAt = (g, x, y, mat, vx, vy) => {
  const d = Math.hypot(vx, vy) || 1
  SCUFF[FAMILY[mat] ?? 'chip'](g, x, y, -vx / d, -vy / d, coloursOf(mat))
}

export const liquidOfColour = colour => {
  const rgb = colour.toLowerCase()
  if (rgb === '#ff9a2e' || rgb === '#ffd24a' || rgb === '#ffe84a') return LIQUID.lava
  if (rgb === '#c8ff5a' || rgb === '#8ae04a' || rgb === '#7fd030') return LIQUID.acid
  if (rgb === '#a06ab0' || rgb === '#5a3a66') return LIQUID.oil
  return LIQUID.water
}

const LIQUID_ALT = { [LIQUID.water]: '#e4fbff', [LIQUID.oil]: '#d8b0e0', [LIQUID.lava]: '#ffffff', [LIQUID.acid]: '#f0ffc0', [LIQUID.gore]: '#ffffff' }

export const dropOf = (g, x, y, vx, vy, colour, life = 1.2, size = 1) => {
  const tag = liquidOfColour(colour)
  spawn(g, 'drop', x, y, vx, vy, life, colour, LIQUID_ALT[tag], size).tag = tag
}

export const splashAt = (g, x, y, speed, colour = '#6fd0e0') => {
  const tag = liquidOfColour(colour)
  const count = Math.min(16, 4 + Math.abs(speed) / 14)
  for (let i = many(g, count); i > 0; i--) dropOf(g, x + rand(-3, 3), y, rand(-46, 46), -rand(30, 60 + Math.abs(speed) * 0.5), colour)
  if (tag === LIQUID.acid) for (let i = many(g, 3); i > 0; i--) spawn(g, 'fizz', x + rand(-5, 5), y, rand(-6, 6), rand(-22, -8), rand(0.35, 0.7), colour, '#f0ffc0')
  if (tag === LIQUID.lava) for (let i = many(g, 4); i > 0; i--) spawn(g, 'ember', x + rand(-5, 5), y, rand(-12, 12), rand(-40, -14), rand(0.4, 0.9), '#ffd24a', '#a03a18')
  g.ripples.push({ x, y, age: 0, power: Math.min(1, Math.abs(speed) / 160 + 0.3) })
  if (g.ripples.length > 6) g.ripples.shift()
}

const STEP_DUST = {
  grain: (g, x, y, colours) => { spawn(g, 'grain', x, y - 1, rand(-18, 18), rand(-30, -8), 0.34, pick(colours)) },
  shard: (g, x, y) => { spawn(g, 'frost', x, y - 1, rand(-16, 16), rand(-12, -2), 0.3, '#d8f8ff') },
  scrap: (g, x, y) => { spawn(g, 'spark', x, y - 1, rand(-34, 34), rand(-40, -8), 0.14, '#ffe84a') },
  clod: (g, x, y, colours) => { spawn(g, 'grain', x, y - 1, rand(-22, 22), rand(-26, -8), 0.3, pick(colours)) },
  splinter: (g, x, y, colours) => { dustPuff(g, x, y - 1, rand(-22, 22), rand(-10, -2), mix(colours[0], '#8c9884', 0.6), 0.3) },
}

export const dustOf = (g, x, y, count) => {
  const under = atMat(g, x, y + 2)
  const onWater = under === M.WATER
  const family = FAMILY[under]
  const colours = coloursOf(under)
  for (let i = many(g, count); i > 0; i--) {
    if (onWater) dropOf(g, x + rand(-3, 3), y, rand(-22, 22), rand(-34, -10), '#6fd0e0', 0.4, 0)
    else if (STEP_DUST[family]) STEP_DUST[family](g, x + rand(-2, 2), y, colours)
    else dustPuff(g, x + rand(-2, 2), y - 1, rand(-26, 26), rand(-14, -3), mix(colours[1], '#8c9884', 0.55), rand(0.3, 0.6))
  }
}

export const flameAt = (g, x, y, up = 40) => {
  const big = rnd() < 0.35
  spawn(g, 'flame', x, y, rand(-14, 14), -rand(up * 0.5, up), rand(0.22, 0.42), '#ffe84a', '#ff9a2e', big ? 2 : 1)
}

export const emberAt = (g, x, y, colour = '#ff9a2e', fall = false) => {
  const p = spawn(g, 'ember', x, y, rand(-8, 8), fall ? rand(0, 20) : rand(-34, -14), rand(0.5, 1.3), colour, '#6e2414')
  p.tag = fall ? 1 : 0
}

export const ashAt = (g, x, y, colour = '#8c8c84') => spawn(g, 'ash', x, y, rand(-10, 10), rand(-16, -2), rand(1.2, 2.6), colour, colour, rnd() < 0.4 ? 2 : 1)

const fireBurst = (g, x, y, count, speed) => {
  if (count <= 1) {
    if (rnd() < eraOf(g).count) flameAt(g, x + rand(-2, 2), y, 30)
    return
  }
  for (let i = many(g, count * 0.6); i > 0; i--) flameAt(g, x + rand(-4, 4), y + rand(-3, 3), speed)
  for (let i = many(g, count * 0.5); i > 0; i--) emberAt(g, x + rand(-4, 4), y + rand(-3, 3), rnd() < 0.3 ? '#ffe84a' : '#ff9a2e')
  for (let i = many(g, count * 0.15); i > 0; i--) dustPuff(g, x + rand(-3, 3), y, rand(-8, 8), rand(-24, -8), '#5a5650', rand(0.4, 0.8))
}

const surfaceBeside = (g, x, y) => {
  const w = g.world
  for (let d = 1; d <= 6; d += 1) {
    if (solidAt(w, x, y + d)) return { x: Math.round(x), y: cell(y + d) * BLOCK - 1, nx: 0, ny: -1 }
  }
  for (const side of [1, -1]) {
    for (let d = 1; d <= 6; d += 1) {
      if (solidAt(w, x + side * d, y)) return { x: side > 0 ? cell(x + d) * BLOCK - 1 : (cell(x - d) + 1) * BLOCK, y: Math.round(y), nx: -side, ny: 0 }
    }
  }
  return null
}

export const crawlerAt = (g, x, y, nx, ny, colour = '#ffe84a', alt = '#a89418') => {
  const dir = rnd() < 0.5 ? 1 : -1
  const p = spawn(g, 'crawl', Math.round(x), Math.round(y), ny ? dir : 0, nx ? dir : 0, rand(0.2, 0.5), colour, alt)
  p.nx = nx
  p.ny = ny
  p.turn = rand(70, 170)
  p.tag = rnd() * 40
}

export const forkAt = (g, x, y, reach = 14, colour = '#ffe84a', alt = colour, life = 0.08) => {
  const a = rnd() * Math.PI * 2
  const d = rand(reach * 0.4, reach)
  spawn(g, 'fork', x, y, Math.cos(a) * d, Math.sin(a) * d, life, colour, alt)
}

const chargeBurst = (g, x, y, count) => {
  const surface = surfaceBeside(g, x, y)
  for (let i = many(g, count * 0.7); i > 0; i--) {
    const roll = rnd()
    if (surface && roll < 0.6) crawlerAt(g, surface.x, surface.y, surface.nx, surface.ny)
    else if (roll < 0.85) forkAt(g, x, y, 15)
    else spawn(g, 'spark', x, y, rand(-70, 70), rand(-70, 70), rand(0.06, 0.16), '#ffe84a', '#ffffff')
  }
}

const paleBurst = (g, x, y, count) => {
  const w = g.world
  const near = [[0, 0], [0, 2], [2, 0], [-2, 0], [0, -2], [0, 6], [6, 0], [-6, 0], [0, -6]].find(([dx, dy]) => solidAt(w, x + dx, y + dy))
  if (near) {
    const mat = atMat(g, x + near[0], y + near[1])
    const family = FAMILY[mat] ?? 'chip'
    const colours = coloursOf(mat)
    const shape = SPREAD[family]
    for (let i = many(g, count * shape.count * 0.7); i > 0; i--) {
      const a = rnd() * Math.PI * 2
      const v = rand(shape.speed[0] * 0.7, shape.speed[1] * 0.8)
      PIECE[family](g, x + rand(-1, 1), y + rand(-1, 1), Math.cos(a) * v, Math.sin(a) * v - shape.lift, pick(colours), colours[1], rnd() < shape.big * 0.5 ? 2 : 1)
    }
    if (count > 4) FLOURISH[family](g, x, y, colours, count * 0.5)
    return
  }
  for (let i = many(g, count); i > 0; i--) dustPuff(g, x + rand(-2, 2), y + rand(-2, 2), rand(-30, 30), rand(-20, 6), '#a8b0a0')
}

const starBurst = (g, x, y, count, speed) => {
  const spokes = many(g, count)
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    const v = (i % 2 ? 1.2 : 0.7) * speed * 1.4
    spawn(g, 'spark', x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.22, 0.5), '#f4f8f2', '#ffffff')
  }
  glint(g, x, y, '#f4f8f2', 4, 0.26)
}

const gasBurst = (g, x, y, count) => {
  for (let i = many(g, count); i > 0; i--) spawn(g, 'wisp', x + rand(-4, 4), y + rand(-4, 4), rand(-16, 16), rand(-22, -2), rand(0.5, 1.2), '#c79ae0', '#c79ae0', rnd() < 0.4 ? 2 : 1)
}

const frostBurst = (g, x, y, count) => {
  for (let i = many(g, count * 0.5); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(40, 120)
    PIECE.shard(g, x, y, Math.cos(a) * v, Math.sin(a) * v - 25, '#bff2ff', '#ffffff', rnd() < 0.3 ? 2 : 1)
  }
  for (let i = many(g, count * 0.6); i > 0; i--) spawn(g, 'frost', x + rand(-7, 7), y + rand(-7, 7), rand(-26, 26), rand(-22, 0), rand(0.6, 1.2), '#d8f8ff', '#ffffff', rnd() < 0.5 ? 2 : 1)
}

const acidBurst = (g, x, y, count) => {
  for (let i = many(g, count * 0.5); i > 0; i--) dropOf(g, x + rand(-3, 3), y + rand(-3, 3), rand(-36, 36), rand(-60, -15), '#8ae04a', 0.8)
  for (let i = many(g, count * 0.8); i > 0; i--) spawn(g, 'fizz', x + rand(-5, 5), y + rand(-3, 3), rand(-6, 6), rand(-24, -8), rand(0.35, 0.8), '#c8ff5a', '#f0ffc0')
}

const healBurst = (g, x, y, count) => {
  for (let i = many(g, count); i > 0; i--) spawn(g, 'mote', x + rand(-6, 6), y + rand(-6, 6), rand(-8, 8), rand(-34, -12), rand(0.4, 0.8), '#7dff8a')
}

const plantBurst = (g, x, y, count) => {
  for (let i = many(g, count); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(25, 80)
    PIECE.feather(g, x, y, Math.cos(a) * v, Math.sin(a) * v - 30, pick(['#8ad05a', '#5e9a38', '#b8e870']), '#d8ff90', rnd() < 0.4 ? 2 : 1)
  }
}

const bloodBurst = (g, x, y, count) => {
  for (let i = many(g, count); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(30, 110)
    if (rnd() < 0.35) PIECE.gib(g, x, y, Math.cos(a) * v, Math.sin(a) * v - 30, '#d04038', '#ff8a70', rnd() < 0.4 ? 2 : 1)
    else spawn(g, 'drop', x, y, Math.cos(a) * v, Math.sin(a) * v - 30, 0.7, '#d04038', '#ff8a70').tag = LIQUID.gore
  }
}

const magnetBurst = (g, x, y, count) => {
  for (let i = many(g, count); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const d = rand(8, 22)
    const p = spawn(g, 'filing', x + Math.cos(a) * d, y + Math.sin(a) * d, -Math.sin(a) * 50, Math.cos(a) * 50, 0.35, '#6fd0ff', '#d8f4ff')
    p.nx = x
    p.ny = y
  }
}

const radialSparks = (g, x, y, colour, count, speed) => {
  for (let i = many(g, count); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(speed * 0.3, speed * 1.2)
    spawn(g, 'spark', x, y, Math.cos(a) * v, Math.sin(a) * v, rand(0.14, 0.34), colour, '#ffffff')
  }
}

const BURSTS = {
  '#ff9a2e': fireBurst, '#ffe84a': chargeBurst, '#c9d4c0': paleBurst, '#f4f8f2': starBurst, '#ffffff': starBurst,
  '#c79ae0': gasBurst, '#bff2ff': frostBurst, '#a0e6ff': frostBurst, '#8ae04a': acidBurst, '#c8ff5a': acidBurst,
  '#7dff8a': healBurst, '#8ad05a': plantBurst, '#ff5a4a': bloodBurst, '#6fd0ff': magnetBurst,
}

export const burstOf = (g, x, y, colour, count, speed = 70) => {
  const recipe = BURSTS[colour]
  if (recipe) recipe(g, x, y, count, speed)
  else radialSparks(g, x, y, colour, count, speed)
}

const CHARRED = { flake: '#3a2c20', ash: '#8c8c84' }

const burntAt = (g, x, y, mat) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  const colours = coloursOf(mat)
  const family = FAMILY[mat]
  if (family === 'splinter') {
    for (let i = many(g, 3); i > 0; i--) PIECE.splinter(g, px + rand(-3, 3), py + rand(-3, 3), rand(-20, 20), rand(-30, 0), mix(colours[0], CHARRED.flake, 0.75), '#ff7a22', rnd() < 0.5 ? 2 : 1)
    for (let i = many(g, 3); i > 0; i--) emberAt(g, px + rand(-3, 3), py + rand(-3, 3), '#ffb04a', rnd() < 0.4)
  } else if (mat === M.MOSS) {
    for (let i = many(g, 4); i > 0; i--) ashAt(g, px + rand(-3, 3), py + rand(-3, 3), rnd() < 0.5 ? '#6f7f48' : CHARRED.ash)
    for (let i = many(g, 2); i > 0; i--) flameAt(g, px + rand(-3, 3), py)
  } else if (mat === M.PEAT) {
    for (let i = many(g, 3); i > 0; i--) dustPuff(g, px + rand(-3, 3), py, rand(-6, 6), rand(-26, -10), '#46423a', rand(0.6, 1.1)).size = 2
    for (let i = many(g, 2); i > 0; i--) emberAt(g, px + rand(-3, 3), py, '#ff7a22')
    for (let i = many(g, 2); i > 0; i--) ashAt(g, px, py)
  } else {
    for (let i = many(g, 3); i > 0; i--) emberAt(g, px + rand(-3, 3), py + rand(-3, 3))
    for (let i = many(g, 2); i > 0; i--) ashAt(g, px, py)
  }
  stainCell(g, x, y + 1, '#181410')
  stainCell(g, x, y - 1, '#181410')
}

const dissolvedAt = (g, x, y, mat) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  const colours = coloursOf(mat)
  for (let i = many(g, 6); i > 0; i--) spawn(g, 'fizz', px + rand(-4, 4), py + rand(-4, 4), rand(-8, 8), rand(-26, -8), rand(0.35, 0.8), pick(colours), '#c8ff5a')
  for (let i = many(g, 3); i > 0; i--) spawn(g, 'fizz', px + rand(-4, 4), py + rand(-2, 4), rand(-6, 6), rand(-20, -6), rand(0.3, 0.6), '#c8ff5a', '#f0ffc0')
  for (let i = many(g, 2); i > 0; i--) dropOf(g, px + rand(-3, 3), py + rand(0, 3), rand(-10, 10), rand(0, 20), '#8ae04a', 0.7)
  spawn(g, 'steam', px, py - 2, rand(-5, 5), -rand(14, 26), 0.5, '#b8d890')
  stainCell(g, x, y + 1, '#3f5a14')
}

const meltedAt = (g, x, y) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  for (let i = many(g, 3); i > 0; i--) dropOf(g, px + rand(-3, 3), py + rand(-1, 4), rand(-6, 6), rand(0, 26), '#bff2ff', 0.7)
  for (let i = many(g, 2); i > 0; i--) spawn(g, 'steam', px + rand(-3, 3), py, rand(-4, 4), -rand(12, 24), rand(0.3, 0.55), '#e4f4f4')
}

const frozenAt = (g, x, y) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  for (let i = many(g, 2.5); i > 0; i--) spawn(g, 'frost', px + rand(-4, 4), py + rand(-4, 4), rand(-10, 10), rand(-12, -2), rand(0.4, 0.9), '#d8f8ff', '#ffffff', rnd() < 0.5 ? 2 : 1)
  if (rnd() < 0.3) glint(g, px + rand(-3, 3), py + rand(-3, 3), '#bff2ff', 2, 0.18)
}

const hissAt = (g, x, y) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  for (let i = many(g, 3); i > 0; i--) spawn(g, 'steam', px + rand(-3, 3), py, rand(-8, 8), -rand(26, 50), rand(0.3, 0.6), '#eef4f4')
}

const crustedAt = (g, x, y) => {
  hissAt(g, x, y)
  const px = (x + 0.5) * BLOCK
  for (let i = many(g, 2); i > 0; i--) emberAt(g, px + rand(-3, 3), y * BLOCK, '#ffd24a')
  for (let i = many(g, 2); i > 0; i--) PIECE.chip(g, px + rand(-3, 3), y * BLOCK, rand(-30, 30), rand(-50, -20), '#3a3028', '#ff7a22', 1)
}

const glazedAt = (g, x, y) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  for (let i = many(g, 3); i > 0; i--) glint(g, px + rand(-3, 3), py + rand(-3, 3), '#ffffff', rnd() < 0.4 ? 3 : 2, rand(0.18, 0.32))
  spawn(g, 'pop', px, py, 0, 0, 0.16, '#d6f6f0', '#d6f6f0', 6)
  for (let i = many(g, 2); i > 0; i--) emberAt(g, px + rand(-3, 3), py - 2, '#ffd24a')
}

const soakedAt = (g, x, y) => {
  const px = (x + 0.5) * BLOCK
  const colours = coloursOf(M.MUD)
  for (let i = many(g, 3); i > 0; i--) PIECE.clod(g, px + rand(-3, 3), y * BLOCK, rand(-16, 16), rand(-34, -12), pick(colours), colours[1], 1)
}

const bakedAt = (g, x, y) => {
  hissAt(g, x, y)
  const px = (x + 0.5) * BLOCK
  for (let i = many(g, 3); i > 0; i--) PIECE.chip(g, px + rand(-3, 3), y * BLOCK, rand(-26, 26), rand(-46, -16), '#9a6a40', '#ff7a22', 1)
}

const grownAt = (g, x, y) => burstOf(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, '#8ad05a', 4)

const TURNS = new Map([
  [[M.SAND, M.GLASS], glazedAt], [[M.ICE, M.GLASS], glazedAt], [[M.FLOE, M.GLASS], glazedAt],
  [[M.SAND, M.MUD], soakedAt], [[M.ASH, M.MUD], soakedAt], [[M.MUD, M.BRICK], bakedAt],
  [[M.STEAM, M.SNOW], (g, x, y) => frozenAt(g, x, y)], [[M.ASH, M.MOSS], grownAt],
].map(([[was, now], fx]) => [was * 64 + now, fx]))

const landedAt = (g, x, y, mat) => {
  const px = (x + 0.5) * BLOCK
  const py = (y + 1) * BLOCK - 1
  const family = FAMILY[mat]
  const colours = coloursOf(mat)
  if (family === 'grain') {
    for (let i = many(g, 6); i > 0; i--) PIECE.grain(g, px + rand(-5, 5), y * BLOCK - 1, rand(-70, 70), rand(-30, -6), pick(colours), colours[1])
  } else if (family === 'scrap') {
    FLOURISH.scrap(g, px, py, colours, 4)
  } else if (family === 'shard') {
    SCUFF.shard(g, px, py, 0, -1, colours)
  }
  for (let i = many(g, 3); i > 0; i--) dustPuff(g, px + rand(-5, 5), py, rand(-22, 22), rand(-12, -2), mix(colours[1], '#8c9884', 0.5))
}

const pouringAt = (g, x, y, mat) => {
  if (mat !== M.SAND) return
  const colours = coloursOf(mat)
  for (let i = many(g, 2); i > 0; i--) PIECE.grain(g, (x + rnd()) * BLOCK, y * BLOCK + 2, rand(-12, 12), rand(30, 80), pick(colours), colours[1])
}

const ignitedAt = (g, x, y, mat) => {
  const px = (x + 0.5) * BLOCK
  const py = y * BLOCK
  if (mat === M.MOSS) {
    for (let i = many(g, 3); i > 0; i--) spawn(g, 'grain', px + rand(-3, 3), py, rand(-26, 26), rand(-46, -20), 0.3, rnd() < 0.5 ? '#c8e85a' : '#ffb04a')
  }
  if (mat === M.OIL) for (let i = many(g, 2); i > 0; i--) dustPuff(g, px + rand(-3, 3), py, rand(-6, 6), rand(-24, -12), '#201820', rand(0.5, 0.9)).size = 2
  flameAt(g, px + rand(-3, 3), py + 3, 46)
}

const chargedAt = (g, x, y, mat) => {
  const w = g.world
  const px = (x + 0.5) * BLOCK
  const py = (y + 0.5) * BLOCK
  if (!props(mat).solid) {
    if (matAt(w, x, y - 1) !== mat) {
      forkAt(g, px, y * BLOCK, 12, '#ffe84a', '#bff2ff', 0.1)
      if (rnd() < 0.3) spawn(g, 'spark', px, y * BLOCK, rand(-40, 40), rand(-70, -14), 0.14, '#ffe84a', '#ffffff')
    }
    return
  }
  const open = [[0, -1], [1, 0], [-1, 0], [0, 1]].filter(([dx, dy]) => !props(matAt(w, x + dx, y + dy)).solid)
  if (!open.length) return
  const [nx, ny] = pick(open)
  const along = rand(0, BLOCK - 1)
  const ex = ny ? x * BLOCK + along : nx > 0 ? (x + 1) * BLOCK : x * BLOCK - 1
  const ey = nx ? y * BLOCK + along : ny > 0 ? (y + 1) * BLOCK : y * BLOCK - 1
  crawlerAt(g, ex, ey, nx, ny)
  if (eraOf(g).glow > 0.5 && rnd() < 0.25) forkAt(g, px, py, 12, '#ffe84a', '#bff2ff', 0.07)
}

const SIZE = ROOM * ROOM
const watched = new WeakMap()
const lastBlast = { x: 0, y: 0, at: -1 }
export const noteBlast = (g, x, y) => Object.assign(lastBlast, { x, y, at: g.fxClock })

const stateOf = w => {
  if (!watched.has(w)) {
    watched.set(w, { mat: w.mat.slice(), burn: Uint8Array.from(w.burn, v => (v > 0 ? 1 : 0)), charge: Uint8Array.from(w.charge, v => (v > 0 ? 1 : 0)), fell: new Uint8Array(SIZE), quiet: new Uint8Array(SIZE) })
    return { fresh: true, ...watched.get(w) }
  }
  return watched.get(w)
}

export const hushCell = (g, x, y) => {
  if (!g.world) return
  const cx = cell(x)
  const cy = cell(y)
  if (cx >= 0 && cy >= 0 && cx < ROOM && cy < ROOM) stateOf(g.world).quiet[cy * ROOM + cx] = 1
}

const changedList = new Int16Array(SIZE)

const acidBy = (s, w, x, y) => {
  for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
    if (matAt(w, x + dx, y + dy) === M.ACID) return true
    const j = (y + dy) * ROOM + x + dx
    if (j >= 0 && j < SIZE && s.mat[j] === M.ACID) return true
  }
  return false
}

const movedTo = (w, s, was, i, step) => {
  const j = i + step
  return j >= 0 && j < SIZE && w.mat[j] === was && s.mat[j] !== was
}

const ICY = new Set([M.ICE, M.FLOE, M.RIME])
const THAWS = new Set([...ICY, M.SNOW])

const cellChanged = (g, w, s, i, was, now) => {
  const x = i % ROOM
  const y = Math.floor(i / ROOM)
  const turned = TURNS.get(was * 64 + now)
  if (turned) {
    turned(g, x, y)
    return true
  }
  const before = props(was)
  const after = props(now)
  if (before.falls || before.floats) {
    if (movedTo(w, s, was, i, ROOM)) {
      s.fell[i + ROOM] = 1
      s.fell[i] = 0
      pouringAt(g, x, y, was)
      return true
    }
    if (movedTo(w, s, was, i, -ROOM) || movedTo(w, s, was, i, 1) || movedTo(w, s, was, i, -1)) return false
  }
  if (was === M.WATER) {
    if (ICY.has(now)) frozenAt(g, x, y)
    else if (now === M.STEAM) hissAt(g, x, y)
    else return false
    return true
  }
  if (was === M.LAVA) {
    if (!after.solid) return false
    crustedAt(g, x, y)
    return true
  }
  if (now === M.RIME || now === M.ICE) {
    frozenAt(g, x, y)
    return true
  }
  if (!before.solid && was !== M.VINE) return false
  if (THAWS.has(was) && now === M.WATER) {
    meltedAt(g, x, y)
    return true
  }
  if (s.quiet[i]) return false
  if (s.burn[i]) burntAt(g, x, y, was)
  else if (acidBy(s, w, x, y)) dissolvedAt(g, x, y, was)
  else if (before.expires) glitter(g, (x + 0.5) * BLOCK, (y + 0.5) * BLOCK, '#d8f8ff', many(g, 2), 40)
  else {
    const px = (x + 0.5) * BLOCK
    const py = (y + 0.5) * BLOCK
    const recent = g.fxClock - lastBlast.at < 0.12
    const dx = px - lastBlast.x
    const dy = py - lastBlast.y
    const d = Math.hypot(dx, dy) || 1
    breakAt(g, px, py, was, recent ? 3 : 5, recent ? dx / d : 0, recent ? dy / d : 0, recent ? 90 : 0)
  }
  return true
}

export const watchWorld = g => {
  const w = g.world
  const s = stateOf(w)
  if (s.fresh) return
  let changes = 0
  let solids = 0
  for (let i = 0; i < SIZE; i++) {
    if (w.mat[i] === s.mat[i]) continue
    changedList[changes++] = i
    if (props(s.mat[i]).solid) solids += 1
  }
  let budget = T.watchBudget
  if (solids <= T.watchSkipAbove) {
    for (let n = 0; n < changes && budget > 0; n++) {
      const i = changedList[n]
      if (cellChanged(g, w, s, i, s.mat[i], w.mat[i])) budget -= 1
    }
  }
  for (let i = 0; i < SIZE; i++) {
    const burning = w.burn[i] > 0 ? 1 : 0
    const charged = w.charge[i] > 0 ? 1 : 0
    if (burning && !s.burn[i] && budget > 0) {
      ignitedAt(g, i % ROOM, Math.floor(i / ROOM), w.mat[i])
      budget -= 1
    }
    if (charged && !s.charge[i] && budget > 0 && rnd() < eraOf(g).count) {
      chargedAt(g, i % ROOM, Math.floor(i / ROOM), w.mat[i])
      budget -= 0.5
    }
    s.burn[i] = burning
    s.charge[i] = charged
    s.quiet[i] = 0
    if (s.fell[i]) {
      s.fell[i] += 1
      if (s.fell[i] > 14) {
        s.fell[i] = 0
        if (props(w.mat[i]).falls && props(w.mat[i]).solid && budget > 0) {
          landedAt(g, i % ROOM, Math.floor(i / ROOM), w.mat[i])
          budget -= 1
        }
      }
    }
  }
  s.mat.set(w.mat)
}

const SMOULDER = {
  [M.WOOD]: (g, x, y) => {
    emberAt(g, (x + rnd()) * BLOCK, y * BLOCK, rnd() < 0.3 ? '#ffe84a' : '#ff9a2e')
    if (rnd() < 0.2) PIECE.splinter(g, (x + rnd()) * BLOCK, (y + 1) * BLOCK - 1, rand(-10, 10), rand(-6, 10), '#2c2018', '#ff7a22', 1)
  },
  [M.MOSS]: (g, x, y) => {
    if (rnd() < 0.5) ashAt(g, (x + rnd()) * BLOCK, y * BLOCK, '#7a8a50')
    else flameAt(g, (x + rnd()) * BLOCK, y * BLOCK + 2, 30)
  },
  [M.PEAT]: (g, x, y) => {
    if (rnd() < 0.6) dustPuff(g, (x + rnd()) * BLOCK, y * BLOCK, rand(-4, 4), rand(-20, -8), '#4a463c', rand(0.6, 1.1)).size = 2
    else emberAt(g, (x + rnd()) * BLOCK, y * BLOCK, '#ff7a22')
  },
  [M.VINE]: (g, x, y) => { emberAt(g, (x + rnd()) * BLOCK, y * BLOCK + 4, '#ffb04a', true) },
  [M.OIL]: (g, x, y) => {
    if (rnd() < 0.5) dustPuff(g, (x + rnd()) * BLOCK, y * BLOCK, rand(-4, 4), rand(-30, -14), '#181018', rand(0.5, 0.9))
    else flameAt(g, (x + rnd()) * BLOCK, y * BLOCK + 2, 40)
  },
}

const smoulderDefault = (g, x, y) => emberAt(g, (x + rnd()) * BLOCK, y * BLOCK, rnd() < 0.3 ? '#ffe84a' : '#ff9a2e')

export const emitWorld = g => {
  if (!roomForAmbient(g)) return
  const w = g.world
  const era = eraOf(g)
  for (let n = 0; n < era.samples; n++) {
    const i = Math.floor(rnd() * SIZE)
    const x = i % ROOM
    const y = Math.floor(i / ROOM)
    const mat = w.mat[i]
    if (w.burn[i] > 0) {
      if (rnd() < 0.25) (SMOULDER[mat] ?? smoulderDefault)(g, x, y)
    } else if (mat === M.LAVA && matAt(w, x, y - 1) !== M.LAVA) {
      if (rnd() < 0.12) emberAt(g, (x + rnd()) * BLOCK, y * BLOCK, '#ffd24a')
      else if (era.glow && rnd() < 0.03) dropOf(g, (x + rnd()) * BLOCK, y * BLOCK - 1, rand(-26, 26), rand(-90, -50), '#ff9a2e', 1)
    } else if (mat === M.ACID && matAt(w, x, y - 1) !== M.ACID) {
      if (rnd() < 0.25) spawn(g, 'fizz', (x + rnd()) * BLOCK, y * BLOCK - 1, rand(-5, 5), rand(-22, -8), rand(0.3, 0.7), '#c8ff5a', '#f0ffc0')
    } else if (w.charge[i] > 0 && rnd() < 0.3) {
      chargedAt(g, x, y, mat)
    } else if (mat === M.WATER && matAt(w, x, y + 1) !== M.WATER && !props(matAt(w, x, y + 1)).solid && rnd() < 0.12) {
      dropOf(g, (x + rnd()) * BLOCK, (y + 1) * BLOCK, 0, 10, '#6fd0e0', 0.8)
    } else if (mat === M.MUD && matAt(w, x, y - 1) !== M.MUD && !props(matAt(w, x, y - 1)).solid) {
      if (rnd() < 0.05) spawn(g, 'pop', (x + rnd()) * BLOCK, y * BLOCK, 0, 0, 0.2, '#7a5c3a', '#7a5c3a', 3)
    } else if (ICY.has(mat) && matAt(w, x, y + 1) === M.EMPTY && era.tail > 2 && rnd() < 0.05) {
      dropOf(g, (x + rnd()) * BLOCK, (y + 1) * BLOCK, 0, 6, '#bff2ff', 0.7)
    } else if (mat === M.EMPTY && era.soft && rnd() < 0.015) {
      spawn(g, 'mote', (x + rnd()) * BLOCK, (y + rnd()) * BLOCK, rand(-3, 3), rand(-3, 3), rand(1.4, 3), '#c4d4cc')
    }
  }
}

export const FOE_MATTER = {
  crawler: 'gib', spitter: 'gib', fish: 'gib', spore: 'puff', bat: 'feather', slug: 'goo', jelly: 'goo', worm: 'gib', turret: 'scrap',
  bomber: 'scrap', imp: 'shard', emberbat: 'cinder', slime: 'goo', crab: 'chip', nest: 'splinter', mimic: 'splinter', gasbag: 'puff',
  tick: 'chip', pillbug: 'chip', gnat: 'feather', stilt: 'chip', snapweed: 'splinter', scrapper: 'scrap', dripper: 'goo', shade: 'ink',
  urchin: 'chip', coil: 'scrap', puffer: 'puff', lantern: 'crystal', lamp: 'scrap', battery: 'scrap', tank: 'scrap', carboy: 'shard',
  ladle: 'scrap', sandbag: 'clod', mole: 'gib', hermit: 'gib', miner: 'gib', cartographer: 'gib', tinker: 'gib', bloodletter: 'gib', orbit: 'gib',
  bellows: 'scrap', colossus: 'chip', crucible: 'scrap', eel: 'gib', eelseg: 'gib', brood: 'gib', conductor: 'scrap', core: 'crystal',
}

let pixelSource = () => []
export const setPixelSource = source => { pixelSource = source }

const paletteCache = new Map()
const paletteOf = e => {
  if (paletteCache.has(e.kind)) return paletteCache.get(e.kind)
  const pixels = pixelSource(e)
  if (!pixels.length) return ['#c9d4c0', '#8a9484']
  const colours = [0, 0.2, 0.4, 0.6, 0.8].map(t => pixels[Math.floor(pixels.length * t)].colour)
  paletteCache.set(e.kind, colours)
  return colours
}

export const hitOf = (g, e) => {
  const c = centre(e)
  const family = FOE_MATTER[e.kind] ?? 'gib'
  const colours = paletteOf(e)
  const here = pick(colours)
  const a = rnd() * Math.PI * 2
  for (let i = many(g, 2); i > 0; i--) {
    const b = a + rand(-1, 1)
    const v = rand(40, 110)
    PIECE[family === 'gib' ? 'goo' : family](g, c.x, c.y, Math.cos(b) * v, Math.sin(b) * v - 20, here, pick(colours), 1)
  }
  for (let i = many(g, 3); i > 0; i--) {
    const b = rnd() * Math.PI * 2
    const v = rand(40, 110)
    spawn(g, 'spark', c.x, c.y, Math.cos(b) * v, Math.sin(b) * v, rand(0.1, 0.22), rnd() < 0.5 ? '#ffffff' : '#c9d4c0', '#ffffff').hits = 1
  }
  if (FLOURISH[family] && eraOf(g).shapes > 1) FLOURISH[family](g, c.x, c.y, colours, 1)
}

const deathOf = e => {
  if (e.frozen > 0) return 'frozen'
  if (e.ablaze > 0) return 'burnt'
  return { FIRE: 'burnt', LAVA: 'burnt', CHARGE: 'shocked', ACID: 'dissolved', CRUSHED: 'crushed', SMOKE: 'choked' }[e.lastCause] ?? 'broken'
}

const DEATH_LOOK = {
  frozen: { family: () => 'shard', colour: c => mix(c, '#bff2ff', 0.55), alt: () => '#ffffff' },
  burnt: { family: f => f, colour: c => mix(c, '#241810', 0.72), alt: () => '#ff7a22' },
  dissolved: { family: () => 'fizz', colour: c => mix(c, '#c8ff5a', 0.2), alt: c => c },
  choked: { family: () => 'ink', colour: c => mix(c, '#2a2a28', 0.5), alt: c => c },
  shocked: { family: f => f, colour: c => c, alt: () => '#ffe84a' },
  crushed: { family: f => f, colour: c => c, alt: c => c },
  broken: { family: f => f, colour: c => c, alt: c => mix(c, '#ffffff', 0.35) },
}

const DEATH_EXTRA = {
  frozen: (g, c) => {
    frostBurst(g, c.x, c.y, 8)
    glint(g, c.x, c.y, '#bff2ff', 4, 0.28)
  },
  burnt: (g, c) => {
    for (let i = many(g, 9); i > 0; i--) emberAt(g, c.x + rand(-6, 6), c.y + rand(-6, 6), rnd() < 0.3 ? '#ffe84a' : '#ff9a2e')
    for (let i = many(g, 6); i > 0; i--) ashAt(g, c.x + rand(-5, 5), c.y + rand(-5, 5))
    for (let i = many(g, 4); i > 0; i--) dustPuff(g, c.x + rand(-5, 5), c.y + rand(-5, 5), rand(-6, 6), rand(-30, -12), '#3c3830', rand(0.6, 1.1)).size = 2
  },
  shocked: (g, c, e) => {
    for (let i = many(g, 6); i > 0; i--) forkAt(g, c.x, c.y, Math.max(e.w, e.h) + 6, '#ffe84a', '#bff2ff', rand(0.06, 0.16))
    for (let i = many(g, 6); i > 0; i--) spawn(g, 'spark', c.x, c.y, rand(-120, 120), rand(-120, 60), rand(0.08, 0.2), '#ffe84a', '#ffffff')
    chargeBurst(g, c.x, e.y + e.h - 1, 10)
  },
  dissolved: (g, c, e) => {
    acidBurst(g, c.x, c.y + e.h / 3, 8)
    for (let i = many(g, 3); i > 0; i--) spawn(g, 'steam', c.x + rand(-5, 5), c.y, rand(-6, 6), -rand(16, 30), rand(0.4, 0.7), '#b8d890')
  },
  choked: (g, c) => {
    for (let i = many(g, 5); i > 0; i--) dustPuff(g, c.x + rand(-5, 5), c.y + rand(-5, 5), rand(-8, 8), rand(-24, -6), '#5a5a54', rand(0.5, 0.9)).size = 2
  },
  crushed: (g, c, e) => {
    for (let i = many(g, 5); i > 0; i--) dustPuff(g, c.x + rand(-6, 6), e.y + e.h - 1, rand(-40, 40), rand(-6, 0), '#8c9884', rand(0.25, 0.45))
  },
  broken: () => {},
}

const DEATH_TINT = { frozen: '#bff2ff', burnt: '#ff9a2e', shocked: '#ffe84a', dissolved: '#c8ff5a', choked: '#7a7a70', crushed: '#c9d4c0', broken: '#f4f8f2' }
const DEATH_RAYS = { burnt: () => '#ff9a2e', broken: c => mix(c, '#ffffff', 0.35), crushed: c => mix(c, '#ffffff', 0.35) }

const SPEEDS = { crushed: [1.2, 0.2], dissolved: [0.2, 0.2], frozen: [1.1, 1], shocked: [1.1, 1.1], burnt: [0.85, 0.9], choked: [0.3, 0.3], broken: [1, 1] }

const raysFrom = (g, x, y, count, length, colour) => {
  const offset = rnd() * Math.PI * 2
  for (let i = 0; i < count; i++) {
    const p = spawn(g, 'ray', x, y, 0, 0, rand(0.09, 0.2), colour, colour, length * rand(0.45, 1))
    p.spin = offset + (i / count) * Math.PI * 2 + rand(-0.3, 0.3)
    p.turn = rand(-1.6, 1.6)
    p.tag = rand(0.012, 0.03)
  }
}

export const killOf = (g, e) => {
  const c = centre(e)
  const era = eraOf(g)
  const index = eraIndex(g)
  const death = deathOf(e)
  const family = FOE_MATTER[e.kind] ?? 'gib'
  const look = DEATH_LOOK[death]
  const made = PIECE[look.family(family)] ?? PIECE.gib
  const [outward, upward] = SPEEDS[death]
  const grand = e.heavy || e.warden
  const blast = grand ? 1.6 : 1
  const pixels = pixelSource(e)
  const budget = era.pieces * (isTouchLayout() ? T.touchCount : 1) * (grand ? 2 : 1)
  const stride = Math.max(1, pixels.length / budget)
  const holdFor = index >= 5 ? 0.05 : 0
  const startAt = g.particles.length
  for (let i = 0; i < pixels.length; i += stride) {
    const { x, y, colour } = pixels[Math.floor(i)]
    const dx = x - c.x
    const dy = y - c.y
    const d = Math.hypot(dx, dy) || 1
    const v = rand(30, 130) * blast
    made(g, x, y, (dx / d) * v * outward + (e.vx ?? 0) * 0.4, (dy / d) * v * outward - rand(30, 90) * upward, look.colour(colour), era.shapes ? look.alt(colour) : look.colour(colour), rnd() < 0.3 + index * 0.04 ? 2 : 1)
  }
  if (holdFor) for (let i = startAt; i < g.particles.length; i++) g.particles[i].hold = holdFor * (0.6 + rnd() * 0.8)
  DEATH_EXTRA[death](g, c, e)
  if (index >= 2) {
    for (let i = many(g, 5); i > 0; i--) {
      const a = rnd() * Math.PI * 2
      const v = rand(30, 110)
      spawn(g, 'spark', c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.14, 0.34), '#ffffff')
    }
  }
  if (index >= 3) glint(g, c.x, c.y, '#ffffff', grand ? 6 : 3, 0.2)
  if (index >= 4) spawn(g, 'pop', c.x, c.y, 0, 0, 0.22, pick(paletteOf(e)), '#ffffff', Math.max(e.w, e.h) + 8)
  if (index >= 5 && pixels.length) {
    const p = spawn(g, 'ghost', c.x, c.y, 0, 0, 0.16, DEATH_TINT[death], '#ffffff', 0.7)
    p.ref = pixels
    p.life = p.max = 0.16
  }
  if (index >= 6 && DEATH_RAYS[death]) {
    const colours = paletteOf(e)
    raysFrom(g, c.x, c.y, isTouchLayout() ? 3 : index >= 7 ? 7 : 4, 22 + Math.max(e.w, e.h) * 1.3, DEATH_RAYS[death](pick(colours)))
    for (let i = many(g, 6); i > 0; i--) {
      const a = rnd() * Math.PI * 2
      const v = rand(40, 120)
      spawn(g, 'soul', c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.6, 1.1), pick(colours), mix(pick(colours), '#000000', 0.3))
    }
  }
}

export const blastDebris = (g, px, py, reach, materials) => {
  const index = eraIndex(g)
  noteBlast(g, px, py)
  for (let i = many(g, 2 + reach * 2); i > 0; i--) {
    const mat = pick(materials.length ? materials : [M.ROCK])
    const a = rnd() * Math.PI * 2
    const family = FAMILY[mat] ?? 'chip'
    const colours = coloursOf(mat)
    const v = rand(50, 120 + reach * 40)
    PIECE[family](g, px + rand(-6, 6), py + rand(-6, 6), Math.cos(a) * v, Math.sin(a) * v - 50, pick(colours), colours[1], rnd() < 0.4 ? 2 : 1)
  }
  const sparks = many(g, 8 + reach * 5)
  for (let i = 0; i < sparks; i++) {
    const a = rnd() * Math.PI * 2
    const v = rand(50, 130 + reach * 30)
    spawn(g, 'spark', px, py, Math.cos(a) * v, Math.sin(a) * v, rand(0.14, 0.4), i % 3 ? '#ffe84a' : '#ff9a2e', '#ffffff')
  }
  for (let i = many(g, 3 + reach * 3); i > 0; i--) flameAt(g, px + rand(-10, 10), py + rand(-10, 10), 60)
  for (let i = many(g, 3 + reach * 3); i > 0; i--) emberAt(g, px + rand(-10, 10), py + rand(-10, 10))
  for (let i = many(g, 3 + reach * 2); i > 0; i--) dustPuff(g, px + rand(-10, 10), py + rand(-10, 10), rand(-22, 22), rand(-26, -4), '#64686a', rand(0.5, 1)).size = 2
  if (index >= 3) spawn(g, 'pop', px, py, 0, 0, 0.24, '#ffd24a', '#ffffff', 14 + reach * 10)
  if (index >= 6) raysFrom(g, px, py, isTouchLayout() ? 4 : 8, 34 + reach * 14, '#ffd8a0')
}

export const hurtMatter = (g, c, cause, scarf) => {
  for (let i = many(g, 5) + 2; i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(30, 90)
    PIECE.feather(g, c.x, c.y, Math.cos(a) * v, Math.sin(a) * v - 25, scarf, scarf, rnd() < 0.5 ? 2 : 1)
  }
  for (let i = many(g, 5); i > 0; i--) {
    const a = rnd() * Math.PI * 2
    const v = rand(30, 110)
    spawn(g, 'spark', c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.14, 0.3), '#ffffff', '#ffffff')
  }
  if (cause === 'CHARGE') for (let i = many(g, 4); i > 0; i--) forkAt(g, c.x, c.y, 13, '#ffe84a', '#bff2ff', 0.14)
  if (cause === 'FIRE' || cause === 'LAVA') for (let i = many(g, 6); i > 0; i--) emberAt(g, c.x + rand(-4, 4), c.y + rand(-4, 4))
  if (cause === 'ACID') for (let i = many(g, 6); i > 0; i--) spawn(g, 'fizz', c.x + rand(-4, 4), c.y + rand(-4, 4), rand(-6, 6), rand(-24, -8), rand(0.35, 0.7), '#c8ff5a', '#f0ffc0')
}

export const muzzleOf = (g, x, y, aim) => {
  const index = eraIndex(g)
  for (let i = many(g, 3); i > 0; i--) {
    const spread = rand(-0.6, 0.6)
    const v = rand(60, 140)
    spawn(g, 'spark', x + aim.x * 2, y + aim.y * 2, (aim.x + spread * aim.y) * v, (aim.y - spread * aim.x) * v, rand(0.05, 0.14), '#fff3b4', '#ffffff').hits = 1
  }
  if (index >= 1) dustPuff(g, x + aim.x * 3, y + aim.y * 3, aim.x * 12, aim.y * 12 - 4, '#a9b6b2', 0.3)
  if (index >= 3) glint(g, x + aim.x * 2, y + aim.y * 2, '#fff3b4', 2, 0.07)
}

const seenBolts = new WeakSet()

export const followBolts = g => {
  for (const b of g.bolts) {
    if (seenBolts.has(b)) continue
    seenBolts.add(b)
    const end = b.points.at(-1)
    if (!end) continue
    if (eraOf(g).shapes > 0) glint(g, end.x, end.y, '#ffe84a', 3, 0.14)
    const surface = surfaceBeside(g, end.x, end.y)
    for (let i = many(g, 2); i > 0; i--) {
      if (surface) crawlerAt(g, surface.x, surface.y, surface.nx, surface.ny)
      else spawn(g, 'spark', end.x, end.y, rand(-70, 70), rand(-70, 40), rand(0.08, 0.2), '#ffe84a', '#ffffff')
    }
  }
}

const FIREBALL_TRAIL = {
  acid: (g, f) => { spawn(g, 'fizz', f.x + rand(0, 4), f.y + 3, rand(-8, 8), rand(-8, 8), 0.3, '#c8ff5a', '#f0ffc0') },
  lava: (g, f) => { emberAt(g, f.x + rand(0, 4), f.y + rand(0, 4), '#ffd24a') },
  bomb: (g, f) => { spawn(g, 'spark', f.x + 2, f.y - 1, rand(-20, 20), rand(-40, -14), 0.14, '#ffd24a') },
  flame: (g, f) => {
    if (rnd() < 0.6) emberAt(g, f.x + rand(0, 4), f.y + rand(0, 4), rnd() < 0.4 ? '#ffe84a' : '#ff9a2e')
    else dustPuff(g, f.x + 2, f.y + 2, f.vx * 0.05, f.vy * 0.05 - 8, '#5a5650', 0.35)
  },
}

const trailOf = f => {
  if (f.pellet || f.wave) return null
  if (f.acid) return FIREBALL_TRAIL.acid
  if (f.lava) return FIREBALL_TRAIL.lava
  if (f.bomb) return FIREBALL_TRAIL.bomb
  return FIREBALL_TRAIL.flame
}

export const followProjectiles = (g, dt) => {
  const era = eraOf(g)
  const rate = dt * 24 * era.count
  for (const f of g.fireballs) {
    const trail = trailOf(f)
    if (trail && rnd() < rate) trail(g, f)
  }
  if (!era.glow) return
  for (const s of g.shots) {
    if (s.friendly && rnd() < dt * 18 * era.glow) spawn(g, 'spark', s.x + rand(-1, 2), s.y + rand(-1, 2), s.vx * 0.04 + rand(-10, 10), s.vy * 0.04 + rand(-10, 10), rand(0.08, 0.16), '#fff3b4', '#ffffff').hits = 1
  }
}

export const sloshAt = (g, x, y, vx) => {
  const colours = coloursOf(M.MUD)
  PIECE.clod(g, x + rand(-2, 2), y, -vx * 0.3 + rand(-14, 14), rand(-40, -16), pick(colours), colours[1], rnd() < 0.3 ? 2 : 1)
}

export const swimBubble = (g, x, y) => spawn(g, 'bubble', x, y, 0, rand(-26, -14), rand(0.8, 1.6), '#bff2ff', '#bff2ff', rnd() < 0.5 ? 2 : 1)

export const wetAt = (g, x, y) => liquidAtPx(g.world, x, y)

const BEAM_WARM = '#fff3b4'

export const beamSparks = (g, f) => {
  const era = eraOf(g)
  const index = eraIndex(g)
  const colour = f.tint ?? BEAM_WARM
  for (const end of f.ends ?? []) {
    if (end.changed) {
      glitter(g, end.x, end.y, colour, many(g, 5), 60)
      if (index >= 2) spawn(g, 'pop', end.x, end.y, 0, 0, 0.18, colour, '#ffffff', 8)
      continue
    }
    if (rnd() > 0.5 * era.count) continue
    const burns = !f.dazzle && (end.foe || props(end.m).flammability)
    if (burns) emberAt(g, end.x + rand(-2, 2), end.y + rand(-2, 2), rnd() < 0.5 ? '#ffe84a' : '#ff9a2e')
    else spawn(g, 'spark', end.x, end.y, rand(-30, 30), rand(-50, -10), rand(0.08, 0.18), colour, '#ffffff').hits = 1
    if (index >= 3 && rnd() < 0.3) glint(g, end.x, end.y, colour, 2, 0.08)
  }
  if (index >= 1) for (const turn of f.turns ?? []) if (rnd() < 0.25) glint(g, turn.x, turn.y, '#ffffff', index >= 3 ? 3 : 1, 0.1)
  if (index < 5 || !f.segments?.length || rnd() > 0.35) return
  const [a, b] = pick(f.segments)
  const t = rnd()
  spawn(g, 'mote', a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, rand(-4, 4), rand(-6, 2), rand(0.6, 1.2), '#fff3d0')
}

export const pealRings = (g, f) => {
  const index = eraIndex(g)
  const colour = f.tint ?? '#d6f6f0'
  if (index >= 2) spawn(g, 'pop', f.x, f.y, 0, 0, 0.28, colour, '#ffffff', TUNING.skills.chime.reach)
  if (index >= 6 && f.broke) raysFrom(g, f.x, f.y, isTouchLayout() ? 4 : 8, 30, mix(colour, '#ffffff', 0.4))
}
