import { eraIndex, eraOf, softDisc, tone } from './particles.js'

const WARNING_EDGE = '#10080a'
const HOT = '#ff5a4a'
const PALE = '#c9d4c0'
const FIRE = '#ff9a2e'
const CHARGE = '#ffe84a'
const MAGNET = '#6fd0ff'
const WHITE = '#ffffff'
const TRACER = '#fff3b4'
const BOLT_NAMES = { hurt: HOT, heal: '#7dff8a', white: '#f4f8f2', pale: PALE, fire: FIRE, charge: CHARGE, magnet: MAGNET, frost: '#bff2ff', gas: '#c79ae0' }

const glow = (ctx, x, y, radius, colour, strength) => {
  ctx.globalCompositeOperation = 'lighter'
  softDisc(ctx, Math.round(x), Math.round(y), radius, colour, strength)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

const trail = (ctx, x, y, ux, uy, from, to, step = 1) => {
  for (let i = from; i <= to; i += step) ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1)
}

const drawTracer = (ctx, s, g) => {
  const era = eraOf(g)
  const index = eraIndex(g)
  const speed = Math.hypot(s.vx, s.vy) || 1
  const ux = s.vx / speed
  const uy = s.vy / speed
  const x = s.x + s.w / 2
  const y = s.y + s.h / 2
  const length = 4 + era.tail
  if (index >= 6) {
    const px = Math.round(-uy)
    const py = Math.round(ux)
    ctx.fillStyle = '#ff5070'
    trail(ctx, x + px, y + py, ux, uy, 2, length - 1, 2)
    ctx.fillStyle = '#50d0ff'
    trail(ctx, x - px, y - py, ux, uy, 2, length - 1, 2)
  }
  ctx.fillStyle = tone(index >= 2 ? '#b89a50' : TRACER, era)
  trail(ctx, x, y, ux, uy, Math.floor(length / 2), length)
  ctx.fillStyle = tone(TRACER, era)
  trail(ctx, x, y, ux, uy, 2, Math.floor(length / 2))
  ctx.fillStyle = tone(WHITE, era)
  ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h)
  if (era.glow) glow(ctx, x, y, 3, TRACER, era.glow * 0.7)
}

const drawShrapnel = (ctx, s, g) => {
  const era = eraOf(g)
  const speed = Math.hypot(s.vx, s.vy) || 1
  ctx.fillStyle = tone(PALE, era)
  trail(ctx, s.x + s.w / 2, s.y + s.h / 2, s.vx / speed, s.vy / speed, 0, 3)
  ctx.fillStyle = tone(WHITE, era)
  ctx.fillRect(Math.round(s.x), Math.round(s.y), s.w, s.h)
}

export const drawShot = (ctx, s, g) => (s.friendly ? drawTracer(ctx, s, g) : drawShrapnel(ctx, s, g))

const DIAMOND = [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]
const DIAMOND_EDGE = [[0, -3], [-1, -2], [1, -2], [-2, -1], [2, -1], [-3, 0], [3, 0], [-2, 1], [2, 1], [-1, 2], [1, 2], [0, 3]]
const CROSS = [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]

const stamp = (ctx, x, y, dots) => {
  for (const [dx, dy] of dots) ctx.fillRect(x + dx, y + dy, 1, 1)
}

const threat = (ctx, f, g, body, core, heat) => {
  const era = eraOf(g)
  const x = Math.round(f.x + f.w / 2)
  const y = Math.round(f.y + f.h / 2)
  const spun = Math.floor(g.time * 10) % 2 === 0
  ctx.fillStyle = WARNING_EDGE
  stamp(ctx, x, y, DIAMOND_EDGE)
  stamp(ctx, x, y, DIAMOND)
  ctx.fillStyle = tone(body, era)
  stamp(ctx, x, y, spun ? DIAMOND : CROSS)
  ctx.fillStyle = tone(core, era)
  ctx.fillRect(x - (spun ? 0 : 1), y - (spun ? 0 : 1), spun ? 1 : 3, spun ? 1 : 3)
  if (!era.glow) return
  const pulse = 0.35 + 0.25 * Math.sin(g.time * 18)
  glow(ctx, x, y, 7, heat, era.glow * pulse)
}

const flicker = (g, seed = 0) => Math.floor(g.time * 18 + seed) % 2 === 0

const DRAW_HOSTILE = {
  wave: (ctx, f, g) => {
    const era = eraOf(g)
    const x = Math.round(f.x)
    const y = Math.round(f.y)
    ctx.fillStyle = WARNING_EDGE
    ctx.fillRect(x - 1, y - 1, f.w + 2, f.h + 2)
    ctx.fillStyle = tone(flicker(g) ? HOT : WHITE, era)
    ctx.fillRect(x, y, f.w, f.h)
    if (era.glow) glow(ctx, x + f.w / 2, y + f.h / 2, 6, HOT, era.glow * 0.5)
  },
  pellet: (ctx, f, g) => threat(ctx, f, g, HOT, flicker(g) ? WHITE : '#ffd0c0', HOT),
  acid: (ctx, f, g) => threat(ctx, f, g, '#8ae04a', flicker(g) ? '#f0ffc0' : '#c8ff5a', '#8ae04a'),
  bomb: (ctx, f, g) => threat(ctx, f, g, PALE, flicker(g) ? HOT : WHITE, HOT),
  lava: (ctx, f, g) => threat(ctx, f, g, FIRE, flicker(g) ? WHITE : '#ffe84a', '#ff7a22'),
  flame: (ctx, f, g) => threat(ctx, f, g, FIRE, flicker(g) ? WHITE : CHARGE, '#ff7a22'),
}

const tailBehind = (ctx, f, colour, length, step = 2) => {
  const speed = Math.hypot(f.vx, f.vy) || 1
  ctx.fillStyle = colour
  trail(ctx, f.x + f.w / 2, f.y + f.h / 2, f.vx / speed, f.vy / speed, 2, length, step)
}

const DRAW_FRIENDLY = {
  pellet: (ctx, f, g) => {
    const era = eraOf(g)
    tailBehind(ctx, f, tone(MAGNET, era), 3 + era.tail, 1)
    const x = Math.round(f.x)
    const y = Math.round(f.y)
    ctx.fillStyle = tone(MAGNET, era)
    ctx.fillRect(x, y, f.w, f.h)
    ctx.fillStyle = tone(WHITE, era)
    ctx.fillRect(x + 1, y + 1, Math.max(1, f.w - 2), Math.max(1, f.h - 2))
    if (era.glow) glow(ctx, x + f.w / 2, y + f.h / 2, 4, MAGNET, era.glow * 0.5)
  },
  acid: (ctx, f, g) => {
    const era = eraOf(g)
    const x = Math.round(f.x)
    const y = Math.round(f.y)
    ctx.fillStyle = tone('#8ae04a', era)
    ctx.fillRect(x, y, f.w, f.h - 1)
    ctx.fillRect(x + 1, y + f.h - 1, Math.max(1, f.w - 2), 1)
    ctx.fillStyle = tone('#f0ffc0', era)
    ctx.fillRect(x + 1, y, 1, 1)
  },
  bomb: (ctx, f, g) => DRAW_HOSTILE.bomb(ctx, f, g),
  lava: (ctx, f, g) => {
    const era = eraOf(g)
    tailBehind(ctx, f, tone('#ff7a22', era), 4)
    const x = Math.round(f.x)
    const y = Math.round(f.y)
    ctx.fillStyle = tone(FIRE, era)
    ctx.fillRect(x, y, f.w, f.h)
    ctx.fillStyle = tone(flicker(g) ? '#ffe84a' : WHITE, era)
    ctx.fillRect(x + 1, y + 1, Math.max(1, f.w - 2), Math.max(1, f.h - 2))
    if (era.glow) glow(ctx, x + f.w / 2, y + f.h / 2, 5, FIRE, era.glow * 0.6)
  },
  flame: (ctx, f, g) => {
    const era = eraOf(g)
    const x = Math.round(f.x + f.w / 2)
    const y = Math.round(f.y + f.h / 2)
    const speed = Math.hypot(f.vx, f.vy) || 1
    const ux = f.vx / speed
    const uy = f.vy / speed
    const length = (f.comet ? 8 : 4) + era.tail
    if (era.shapes > 0) {
      for (let i = 1; i <= length; i++) {
        const age = i / length
        ctx.fillStyle = tone(age < 0.35 ? CHARGE : age < 0.7 ? FIRE : '#a03a18', era)
        const wag = era.shapes > 1 ? Math.round(Math.sin(g.time * 30 + i) * Math.min(1, i / 3)) : 0
        ctx.fillRect(Math.round(x - ux * i - uy * wag), Math.round(y - uy * i + ux * wag), 1, 1)
      }
    }
    ctx.fillStyle = tone(flicker(g) ? FIRE : CHARGE, era)
    ctx.fillRect(x - 2, y - 1, 4, 2)
    ctx.fillRect(x - 1, y - 2, 2, 4)
    ctx.fillStyle = tone(flicker(g, 1) ? WHITE : CHARGE, era)
    ctx.fillRect(x - 1, y - 1, 2, 2)
    if (era.glow) glow(ctx, x, y, f.comet ? 8 : 5, FIRE, era.glow * 0.65)
  },
}

const kindOf = f => {
  if (f.wave) return 'wave'
  if (f.pellet) return 'pellet'
  if (f.acid) return 'acid'
  if (f.bomb) return 'bomb'
  if (f.lava) return 'lava'
  return 'flame'
}

export const drawFireball = (ctx, f, g) => {
  const kind = kindOf(f)
  const table = f.friendly ? DRAW_FRIENDLY : DRAW_HOSTILE
  ;(table[kind] ?? DRAW_HOSTILE.flame)(ctx, f, g)
}

const rasterLine = (ctx, ax, ay, bx, by, width = 1) => {
  const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0
    ctx.fillRect(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t), width, width)
  }
}

const shiver = (seed, spread) => {
  const v = Math.sin(seed * 91.17) * 4375.5453
  return (v - Math.floor(v) - 0.5) * spread
}

const FORK_EVERY = 3

const drawForks = (ctx, points, tick, reach) => {
  for (let i = 1; i < points.length - 1; i += FORK_EVERY) {
    const a = points[i]
    if (shiver(tick + i, 1) < -0.1) continue
    const ex = a.x + shiver(tick + i * 3, reach)
    const ey = a.y + shiver(tick + i * 7, reach)
    rasterLine(ctx, a.x, a.y, ex, ey)
  }
}

const pathOf = (ctx, points) => {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
}

export const drawBolt = (ctx, bolt, g) => {
  const era = eraOf(g)
  const index = eraIndex(g)
  const colour = BOLT_NAMES[bolt.colour] ?? bolt.colour ?? CHARGE
  const tick = Math.floor(g.time * 30)
  const shake = index >= 2 ? 1 + (index >= 5 ? 1 : 0) : 0
  const points = shake ? bolt.points.map((p, i) => (i === 0 || i === bolt.points.length - 1 ? p : { x: p.x + shiver(tick + i, shake * 2), y: p.y + shiver(tick + i + 40, shake * 2) })) : bolt.points
  if (era.glow) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = colour
    ctx.lineJoin = 'bevel'
    ctx.globalAlpha = era.glow * 0.34
    ctx.lineWidth = index >= 6 ? 5 : 3
    pathOf(ctx, points)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.fillStyle = tone(colour, era)
  if (index >= 2) drawForks(ctx, points, tick, 6 + index)
  for (let i = 1; i < points.length; i++) rasterLine(ctx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y)
  if (index >= 4) {
    ctx.fillStyle = WHITE
    for (let i = 1; i < points.length; i++) {
      if (i % 2 || index >= 6) rasterLine(ctx, points[i - 1].x, points[i - 1].y, points[i].x, points[i].y)
    }
  }
  if (!era.glow) return
  const start = points[0]
  const end = points[points.length - 1]
  glow(ctx, start.x, start.y, 5, colour, era.glow * 0.6)
  glow(ctx, end.x, end.y, 7, colour, era.glow * 0.8)
}
