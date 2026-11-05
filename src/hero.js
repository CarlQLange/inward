import { liquidAtPx, solidAt } from './physics.js'
import { vineAt } from './world.js'

export const SCARF_RED = [224, 24, 45]
export const SCARF_DEEP = [160, 15, 34]

const css = ([r, g, b]) => `rgb(${r},${g},${b})`
const RED = css(SCARF_RED)
const DEEP = css(SCARF_DEEP)

const SEGMENT = 2
const BEND = 3.3
const SEGMENTS_PER_HEART = 2
const SHRED_LIFE = 2.4

const DOME = 1
const DOME_SHADE = 2
const PLATE = 3
const GLOW = 4
const SUIT = 5
const SUIT_SHADE = 6
const BOOT = 7
const GUN = 8
const LAMP = 9
const KNOT = 10
const KNOT_DEEP = 11
const OUTLINE = 12

const PALETTE = ['', '#f4f8f2', '#a9b6b2', '#0c1416', '#ffd65c', '#dde5d8', '#8b9a96', '#47535c', '#79868c', '#fff3b4', RED, DEEP, '#081012']
const flat = colour => PALETTE.map((c, i) => (i === KNOT ? RED : i === KNOT_DEEP ? DEEP : i === OUTLINE ? c : colour))
const FLASH_WHITE = flat('#ffffff')
const FLASH_RED = flat('#ff6a58')
const GHOST = PALETTE.map(() => '#8fe6ff')

const SIZE = 56
const OX = 28
const OY = 42
const grid = new Uint8Array(SIZE * SIZE)

const plot = (x, y, c) => {
  const gx = Math.round(x) + OX
  const gy = Math.round(y) + OY
  if (gx >= 0 && gy >= 0 && gx < SIZE && gy < SIZE) grid[gy * SIZE + gx] = c
}

const rect = (x, y, w, h, c) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) plot(x + i, y + j, c)
}

const line = (x0, y0, x1, y1, c) => {
  const steps = Math.max(Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)))
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0
    plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)
  }
}

const outline = () => {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 0) continue
    const lit = v => v !== undefined && v !== 0 && v !== OUTLINE
    if (lit(grid[i - 1]) || lit(grid[i + 1]) || lit(grid[i - SIZE]) || lit(grid[i + SIZE])) grid[i] = OUTLINE
  }
}

const blit = (ctx, wx, wy, palette, skip = () => false) => {
  for (let y = 0; y < SIZE; y++) {
    if (skip(y)) continue
    let x = 0
    while (x < SIZE) {
      const c = grid[y * SIZE + x]
      if (c === 0) { x++; continue }
      let end = x + 1
      while (end < SIZE && grid[y * SIZE + end] === c) end++
      ctx.fillStyle = palette[c]
      ctx.fillRect(wx + x - OX, wy + y - OY, end - x, 1)
      x = end
    }
  }
}

const DOME_ROWS = [[-2, 5], [-3, 7], [-4, 9], [-4, 9], [-4, 9], [-4, 9], [-3, 7]]

const paintHelmet = (hx, hy, f, { lookX = 0, lookY = 0, visor = 'on', spin = 0 } = {}) => {
  const turn = (x, y) => {
    const dx = x - hx
    const dy = y - (hy + 3)
    if (spin === 1) return [hx - dy, hy + 3 + dx]
    if (spin === 2) return [hx - dx, hy + 3 - dy]
    if (spin === 3) return [hx + dy, hy + 3 - dx]
    return [x, y]
  }
  const put = (x, y, c) => plot(...turn(x, y), c)
  DOME_ROWS.forEach(([from, width], row) => {
    for (let i = 0; i < width; i++) {
      const across = from + i
      const back = across * f <= -3
      const rim = row === 6
      put(hx + across, hy + row, rim || back ? DOME_SHADE : DOME)
    }
  })
  put(hx - f * 5, hy + 3, GUN)
  put(hx - f * 5, hy + 4, GUN)
  put(hx - f * 2, hy + 6, PLATE)
  put(hx + f * 2, hy + 6, PLATE)
  put(hx - f * 1, hy + 1, DOME_SHADE)
  put(hx + f * 2, hy, DOME)
  if (visor === 'none') return
  const top = hy + 2 + Math.max(-1, Math.min(1, lookY))
  const front = Math.max(-1, Math.min(1, lookX))
  for (let i = -1; i <= 4; i++) {
    const c = hx + f * Math.min(4, i + front)
    put(c, top, PLATE)
    put(c, top + 1, PLATE)
    put(c, top + 2, PLATE)
  }
  if (visor === 'blink') return
  for (let i = 1; i <= 3; i++) put(hx + f * Math.min(3, i + front), top + 1, GLOW)
}

const paintGun = (shoulder, angle, recoil) => {
  const reach = 3 - recoil
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const elbow = { x: shoulder.x + dx * reach, y: shoulder.y + dy * reach }
  const tip = { x: shoulder.x + dx * (reach + 3), y: shoulder.y + dy * (reach + 3) }
  line(shoulder.x, shoulder.y, elbow.x, elbow.y, SUIT)
  line(elbow.x, elbow.y, tip.x, tip.y, GUN)
  plot(elbow.x - dy, elbow.y + dx, GUN)
  plot(tip.x, tip.y, LAMP)
  return tip
}

const paintFist = (shoulder, angle, recoil) => {
  const reach = 2 + recoil * 2
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const tip = { x: shoulder.x + dx * (reach + 2), y: shoulder.y + dy * (reach + 2) }
  line(shoulder.x, shoulder.y, tip.x, tip.y, SUIT)
  plot(tip.x, tip.y, LAMP)
  plot(tip.x + 1, tip.y, LAMP)
  plot(tip.x, tip.y + 1, LAMP)
  return tip
}

const paintBody = (pose, f) => {
  const { body, head, feet, height, hand } = pose
  if (hand) line(body.x - f, body.y + 1, body.x + hand.x, body.y + hand.y, SUIT_SHADE)
  rect(body.x - f * 2 - (f > 0 ? 1 : 0), body.y, 2, Math.min(3, height), GUN)
  feet.forEach(([fx, fy], i) => {
    const hip = body.x + (i === 0 ? -1 : 1)
    line(hip, body.y + height, fx, fy, i === 0 ? SUIT_SHADE : SUIT)
    plot(fx, fy, BOOT)
    plot(fx + f, fy, BOOT)
  })
  rect(body.x - 2, body.y, 5, height, SUIT)
  for (let r = 0; r < height; r++) plot(body.x - f * 2, body.y + r, SUIT_SHADE)
  if (height >= 3) rect(body.x - 2, body.y + height - 1, 5, 1, SUIT_SHADE)
  return head
}

const foot = (x, y) => [x, y]

const POSES = {
  idle: ({ h, f }) => {
    const breath = Math.sin(h.clock * 2.4) > 0.35 ? 1 : 0
    return { head: { x: 0, y: -15 + breath }, body: { x: 0, y: -8 + breath }, height: 4 - breath, feet: [foot(-2, -1), foot(2, -1)], hand: { x: -f * 3, y: 4 } }
  },
  run: ({ h, f }) => {
    const swing = a => foot(Math.round(Math.cos(a) * 3) * f, -1 - Math.round(Math.max(0, Math.sin(a)) * 2))
    const bob = Math.abs(Math.sin(h.stride)) > 0.6 ? -1 : 0
    return {
      head: { x: f, y: -15 + bob },
      body: { x: 0, y: -8 + bob },
      height: 4,
      feet: [swing(h.stride), swing(h.stride + Math.PI)],
      hand: { x: -Math.round(Math.cos(h.stride) * 3) * f, y: 3 },
    }
  },
  rise: ({ f }) => ({ head: { x: 0, y: -16 }, body: { x: 0, y: -9 }, height: 4, feet: [foot(-f, -2), foot(f * 2, -3)], hand: { x: -f * 3, y: 1 } }),
  fall: ({ f }) => ({ head: { x: 0, y: -15 }, body: { x: 0, y: -8 }, height: 4, feet: [foot(-3, -2), foot(3, -3)], hand: { x: -f * 3, y: -2 } }),
  crouch: ({ f }) => ({ head: { x: 0, y: -8 }, body: { x: 0, y: -3 }, height: 2, feet: [foot(-3, -1), foot(3, -1)], hand: { x: -f * 3, y: 1 } }),
  swim: ({ h, f }) => {
    const kick = a => foot(Math.round(Math.cos(a)) - f * 2, -1 - Math.round((Math.sin(a) + 1) * 1.5))
    return {
      head: { x: f, y: -15 + Math.round(Math.sin(h.clock * 3)) },
      body: { x: 0, y: -8 + Math.round(Math.sin(h.clock * 3)) },
      height: 4,
      feet: [kick(h.clock * 9), kick(h.clock * 9 + Math.PI)],
      hand: { x: -f * 3, y: Math.round(Math.sin(h.clock * 5) * 2) },
    }
  },
  climb: ({ h, f }) => {
    const step = Math.sin(h.stride)
    return {
      head: { x: 0, y: -15 },
      body: { x: 0, y: -8 + Math.round(step * 0.5) },
      height: 4,
      feet: [foot(-2, -1 - Math.round(Math.max(0, step) * 3)), foot(2, -1 - Math.round(Math.max(0, -step) * 3))],
      hand: { x: -f * 2, y: step > 0 ? -2 : -5 },
      visor: 'none',
    }
  },
  cling: ({ f }) => ({ head: { x: f, y: -15 }, body: { x: f, y: -8 }, height: 3, feet: [foot(f * 3, -2), foot(f * 3, -6)], hand: { x: f * 2, y: -2 } }),
  dash: ({ f }) => ({ head: { x: f * 3, y: -13 }, body: { x: f, y: -7 }, height: 3, feet: [foot(-f * 4, -3), foot(-f * 2, -2)], hand: { x: -f * 3, y: 1 } }),
  hurt: ({ f }) => ({ head: { x: -f * 2, y: -15 }, body: { x: 0, y: -8 }, height: 4, feet: [foot(f * 3, -2), foot(-f * 3, -1)], hand: { x: -f * 4, y: -3 } }),
}

const stanceOf = (g, p, h) => {
  const world = g.world
  const middle = p.x + p.w / 2
  if (h.hurt > 0.16) return 'hurt'
  if (p.dashing > 0) return 'dash'
  if (liquidAtPx(world, middle, p.y + p.h / 2)) return 'swim'
  if (p.crouching) return 'crouch'
  if (p.clinging > 0 && !p.grounded) return 'cling'
  if (!p.grounded && vineAt(world, Math.floor(middle / 8), Math.floor((p.y + p.h / 2) / 8))) return 'climb'
  if (!p.grounded) return p.vy < -20 ? 'rise' : 'fall'
  return Math.abs(p.vx) > 8 ? 'run' : 'idle'
}

const newHero = p => ({
  clock: 0,
  stride: 0,
  stance: 'idle',
  hp: p.hp,
  nodes: Array.from({ length: Math.max(1, p.hp) * SEGMENTS_PER_HEART + 1 }, (_, i) => {
    const x = p.x + 3 - p.facing * i * SEGMENT
    const y = p.y + 7
    return { x, y, px: x, py: y }
  }),
  shreds: [],
  ghosts: [],
  land: 0,
  recoil: 0,
  flash: 0,
  hurt: 0,
  blinkFor: 0,
  blink: 0,
  still: 0,
  headLag: 0,
  angle: Math.atan2(p.aim.y, p.aim.x),
  fired: null,
  firedFor: 0,
  wasGrounded: p.grounded,
  lastVy: 0,
  lastX: p.x,
  lastY: p.y + p.h,
  dead: null,
  tip: { x: p.x + 8, y: p.y + 8 },
  dtWas: 1 / 60,
})

const heroes = new WeakMap()

export const heroOf = p => {
  if (!heroes.has(p)) heroes.set(p, newHero(p))
  return heroes.get(p)
}

const poseFor = (g, p, h) => {
  const f = p.facing
  const pose = { ...POSES[h.stance]({ h, f }) }
  const squash = Math.round(h.land * 3)
  if (squash > 0 && h.stance !== 'crouch') {
    pose.head = { ...pose.head, y: pose.head.y + squash }
    pose.body = { ...pose.body, y: pose.body.y + squash }
    pose.height = Math.max(2, pose.height - Math.floor(squash / 2))
    pose.feet = [foot(-2 - squash, -1), foot(2 + squash, -1)]
  }
  pose.head = { ...pose.head, y: pose.head.y + Math.round(h.headLag) }
  return pose
}

const angleOf = (p, aim) => Math.atan2(p.upside ? -aim.y : aim.y, aim.x)

const armAngle = (p, h) => angleOf(p, h.firedFor > 0 && h.fired ? h.fired : p.aim)

const closeAngle = (from, to, rate) => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * Math.min(1, rate)
}

const anchorOf = (p, h, pose) => ({
  x: p.x + 3 + pose.body.x - p.facing,
  y: p.y + p.h + pose.body.y,
})

const stepNodes = (world, nodes, dt, dtWas, force, pinned) => {
  const scale = dt / dtWas
  nodes.forEach((n, i) => {
    if (i === 0 && pinned) return
    const wet = liquidAtPx(world, n.x, n.y)
    const [ax, ay] = force(n, i, wet)
    const keep = (wet ? 0.86 : 0.965) * scale
    const nx = n.x + (n.x - n.px) * keep + ax * dt * dt
    const ny = n.y + (n.y - n.py) * keep + ay * dt * dt
    n.px = n.x
    n.py = n.y
    n.x = nx
    n.y = ny
  })
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1]
      const b = nodes[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const err = (d - SEGMENT) / d
      if (i === 1 && pinned) {
        b.x -= dx * err
        b.y -= dy * err
      } else {
        a.x += dx * err * 0.5
        a.y += dy * err * 0.5
        b.x -= dx * err * 0.5
        b.y -= dy * err * 0.5
      }
    }
  }
  for (let i = 2; i < nodes.length; i++) {
    const a = nodes[i - 2]
    const b = nodes[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy) || 1
    if (d >= BEND) continue
    const push = ((BEND - d) / d) * 0.5
    b.x += dx * push
    b.y += dy * push
  }
  nodes.forEach((n, i) => {
    if ((i === 0 && pinned) || !solidAt(world, n.x, n.y) || solidAt(world, n.px, n.py)) return
    if (!solidAt(world, n.px, n.y)) n.x = n.px
    else if (!solidAt(world, n.x, n.py)) n.y = n.py
    else {
      n.x = n.px
      n.y = n.py
    }
  })
}

const tearScarf = (h, count, clock) => {
  const cut = Math.max(1, h.nodes.length - count)
  const torn = h.nodes.splice(cut).map(n => ({ ...n, px: n.px - (Math.random() - 0.5) * 2, py: n.py + Math.random() * 1.2 }))
  if (torn.length > 1) h.shreds.push({ nodes: torn, age: 0, seed: clock * 13.7 })
}

const growScarf = h => {
  const tail = h.nodes.at(-1)
  h.nodes.push({ x: tail.x, y: tail.y + 1, px: tail.x, py: tail.y + 1 })
}

const syncScarf = (p, h) => {
  const want = Math.max(1, p.hp) * SEGMENTS_PER_HEART + 1
  if (p.hp < h.hp) {
    h.hurt = 0.32
    h.blinkFor = p.iframes
    tearScarf(h, h.nodes.length - want, h.clock)
  } else if (h.nodes.length < want) growScarf(h)
  h.hp = p.hp
}

const scarfForce = (p, h) => {
  const speed = Math.hypot(p.vx, p.vy)
  const lift = Math.min(1, speed / 70)
  const windX = -p.vx * 1.1 - p.facing * 78 * (1 - lift)
  const windY = -p.vy * 0.28
  const wave = 22 + speed * 0.8
  return (n, i, wet) => {
    const along = i / h.nodes.length
    if (wet) return [Math.sin(h.clock * 2 + i * 0.5) * 14, -36]
    return [
      windX + Math.sin(h.clock * 2.1 + i * 0.3) * 12,
      34 + 30 * (1 - lift) + windY + Math.sin(h.clock * (5 + lift * 6) - i * 0.85) * wave * along,
    ]
  }
}

const SHRED_FORCE = (shred, clock) => (n, i) => [
  Math.sin(clock * 5 + shred.seed + i * 0.8) * 70,
  46 + Math.sin(clock * 3 + shred.seed) * 30,
]

const addGhost = (g, p, h, pose) => {
  h.ghosts.push({
    x: Math.round(p.x + 3), y: Math.round(p.y + p.h), f: p.facing, pose, angle: h.angle, life: 0.2,
  })
  if (h.ghosts.length > 6) h.ghosts.shift()
}

const dieHero = (p, h, pose) => {
  const f = p.facing
  h.dead = {
    t: 0,
    x: Math.round(p.x + 3),
    y: Math.round(p.y + p.h),
    f,
    pose,
    helmet: { x: p.x + 3 + pose.head.x, y: p.y + p.h + pose.head.y, vx: -f * 42 + p.vx * 0.3, vy: -170, spin: 0, turn: 0, rest: 0 },
  }
  h.nodes[0].py += 3
}

const stepHelmet = (world, helmet, dt) => {
  if (helmet.rest) {
    helmet.rest += dt
    return
  }
  helmet.vy = Math.min(260, helmet.vy + 460 * dt)
  const nx = helmet.x + helmet.vx * dt
  if (solidAt(world, nx, helmet.y + 3)) helmet.vx *= -0.5
  else helmet.x = nx
  const ny = helmet.y + helmet.vy * dt
  const bottom = ny + 7
  if (helmet.vy > 0 && solidAt(world, helmet.x, bottom)) {
    helmet.y = Math.floor(bottom / 8) * 8 - 7
    if (helmet.vy < 60) {
      helmet.rest = dt
      helmet.spin = 1
      helmet.vx = 0
    } else {
      helmet.vy *= -0.45
      helmet.vx *= 0.7
    }
  } else if (helmet.vy < 0 && solidAt(world, helmet.x, ny)) helmet.vy = 0
  else helmet.y = ny
  helmet.turn += dt * Math.abs(helmet.vx) * 0.32
  if (!helmet.rest) helmet.spin = Math.floor(helmet.turn) % 4
}

export const stepHero = (g, p, dt, carried = false) => {
  const h = heroOf(p)
  h.clock += dt
  const dtStep = Math.max(1e-4, dt)
  const dead = g.phase === 'dead'
  if (!dead) syncScarf(p, h)
  const sole = { x: p.x, y: p.y + p.h }
  const jump = Math.hypot(sole.x - h.lastX, sole.y - h.lastY)
  if (jump > 14 && !dead) {
    const shiftX = sole.x - h.lastX
    const shiftY = sole.y - h.lastY
    if (jump > 64 && g.door) {
      for (const n of h.nodes) {
        n.x += shiftX
        n.y += shiftY
        n.px += shiftX
        n.py += shiftY
      }
    } else {
      for (let i = 1; i <= 3; i++) {
        const t = i / 4
        h.ghosts.push({ x: Math.round(h.lastX + shiftX * t + 3), y: Math.round(h.lastY + shiftY * t), f: p.facing, pose: h.pose ?? poseFor(g, p, h), angle: h.angle, life: 0.25 })
      }
    }
  }
  h.lastX = sole.x
  h.lastY = sole.y
  h.land = Math.max(0, h.land - dt / 0.16)
  h.recoil = Math.max(0, h.recoil - dt / 0.11)
  h.flash = Math.max(0, h.flash - dt)
  h.hurt = Math.max(0, h.hurt - dt)
  h.blinkFor = Math.max(0, h.blinkFor - dt)
  h.firedFor = Math.max(0, h.firedFor - dt)
  h.headLag *= Math.exp(-dt * 18)
  if (p.grounded && !h.wasGrounded && h.lastVy > 70 && !carried) {
    h.land = Math.min(1, h.lastVy / 240)
    h.headLag = 0
  }
  if (!p.grounded && h.wasGrounded && p.vy < -60) h.headLag = 1.4
  h.wasGrounded = p.grounded
  if (!carried) h.lastVy = p.vy
  h.stride += Math.abs(p.grounded ? p.vx : p.vy) * dt * (h.stance === 'run' ? 0.24 : 0.2)
  if (!dead && !h.dead) {
    h.stance = stanceOf(g, p, h)
    h.still = h.stance === 'idle' ? h.still + dt : 0
    if (Math.random() < dt * 0.3) h.blink = 0.09
    h.blink = Math.max(0, h.blink - dt)
    h.angle = closeAngle(h.angle, armAngle(p, h), dt * 34)
  }
  const pose = poseFor(g, p, h)
  h.pose = pose
  if (p.dashing > 0 && !carried && Math.floor(h.clock * 30) % 2 === 0) addGhost(g, p, h, pose)
  for (const ghost of h.ghosts) ghost.life -= dt
  h.ghosts = h.ghosts.filter(ghost => ghost.life > 0)
  if (dead && !h.dead) dieHero(p, h, pose)
  if (h.dead) {
    h.dead.t += dt
    stepHelmet(g.world, h.dead.helmet, dt)
    stepNodes(g.world, h.nodes, dtStep, h.dtWas, (n, i) => [Math.sin(h.clock * 2.4 + i * 0.6) * 22, 62], false)
  } else {
    const anchor = anchorOf(p, h, pose)
    const root = h.nodes[0]
    root.x = anchor.x
    root.y = anchor.y
    stepNodes(g.world, h.nodes, dtStep, h.dtWas, scarfForce(p, h), true)
  }
  for (const shred of h.shreds) {
    shred.age += dt
    stepNodes(g.world, shred.nodes, dtStep, h.dtWas, SHRED_FORCE(shred, h.clock), false)
  }
  h.shreds = h.shreds.filter(shred => shred.age < SHRED_LIFE)
  h.dtWas = dtStep
  return h
}

export const heroFired = (p, aim) => {
  const h = heroOf(p)
  h.recoil = 1
  h.flash = 0.07
  h.fired = aim
  h.firedFor = 0.22
  h.angle = angleOf(p, aim)
}

const drawScarfRun = (ctx, nodes, thickFrom) => {
  nodes.forEach((n, i) => {
    if (i === 0) return
    const a = nodes[i - 1]
    const x0 = Math.round(a.x)
    const y0 = Math.round(a.y)
    const x1 = Math.round(n.x)
    const y1 = Math.round(n.y)
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    const thick = i < thickFrom
    ctx.fillStyle = i % 5 === 4 ? DEEP : RED
    for (let s = 0; s <= steps; s++) {
      const x = x0 + Math.round(((x1 - x0) * s) / steps)
      const y = y0 + Math.round(((y1 - y0) * s) / steps)
      ctx.fillRect(x, y, 1, thick ? 2 : 1)
    }
  })
}

const drawKnot = (ctx, x, y) => {
  ctx.fillStyle = RED
  ctx.fillRect(x - 2, y - 1, 5, 2)
  ctx.fillStyle = DEEP
  ctx.fillRect(x - 2, y, 5, 1)
}

const drawFlash = (ctx, tip, h, angle) => {
  const size = h.flash > 0.035 ? 4 : 2
  const x = Math.round(tip.x + Math.cos(angle) * 1.5)
  const y = Math.round(tip.y + Math.sin(angle) * 1.5)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - 1, y - 1, 3, 3)
  ctx.fillStyle = '#fff3b4'
  for (let i = 1; i <= size; i++) {
    ctx.fillRect(Math.round(x + Math.cos(angle) * (i + 1)), Math.round(y + Math.sin(angle) * (i + 1)), 1, 1)
    if (i > 2) continue
    ctx.fillRect(Math.round(x + Math.cos(angle + 1.57) * i), Math.round(y + Math.sin(angle + 1.57) * i), 1, 1)
    ctx.fillRect(Math.round(x + Math.cos(angle - 1.57) * i), Math.round(y + Math.sin(angle - 1.57) * i), 1, 1)
  }
}

const drawDead = (ctx, g, p, h) => {
  const { t, x, y, f, helmet } = h.dead
  grid.fill(0)
  const slump = Math.min(1, t / 0.5)
  const height = Math.max(1, Math.round(4 - slump * 3))
  const bodyY = -Math.round(8 - slump * 6)
  paintBody({ body: { x: 0, y: bodyY }, head: { x: 0, y: 0 }, height, feet: [foot(-2 - Math.round(slump * 2), -1), foot(2 + Math.round(slump * 2), -1)] }, f)
  if (slump >= 1) plot(f * 5, -1, GUN)
  if (slump >= 1) plot(f * 6, -1, GUN)
  outline()
  blit(ctx, x, y, PALETTE)
  grid.fill(0)
  const glow = helmet.rest && helmet.rest > 1 ? 'blink' : 'on'
  paintHelmet(0, 0, f, { spin: helmet.spin, visor: glow, lookX: 0, lookY: 0 })
  outline()
  blit(ctx, Math.round(helmet.x), Math.round(helmet.y), PALETTE)
}

const shredVisible = shred => shred.age < SHRED_LIFE - 0.5 || Math.floor(shred.age * 18) % 2 === 0

export const drawScarfShreds = (ctx, p) => {
  for (const shred of heroOf(p).shreds) if (shredVisible(shred)) drawScarfRun(ctx, shred.nodes, 0)
}

export const drawHero = (ctx, g, p) => {
  const h = heroOf(p)
  if (!h.pose) h.pose = poseFor(g, p, h)
  const f = p.facing
  const wx = Math.round(p.x + 3)
  const wy = Math.round(p.y + p.h)
  for (const ghost of h.ghosts) {
    grid.fill(0)
    paintBody(ghost.pose, ghost.f)
    paintHelmet(ghost.pose.head.x, ghost.pose.head.y, ghost.f, { visor: 'none' })
    const step = ghost.life < 0.09 ? 2 : 1
    blit(ctx, ghost.x, ghost.y, GHOST, y => (y + ghost.x) % (step + 1) === step)
  }
  drawScarfShreds(ctx, p)
  drawScarfRun(ctx, h.nodes, Math.min(6, Math.ceil(h.nodes.length / 2)))
  if (h.dead) {
    drawDead(ctx, g, p, h)
    return
  }
  if (h.blinkFor > 0 && Math.floor(h.clock * 18) % 2) return
  const pose = h.pose
  grid.fill(0)
  paintBody(pose, f)
  const look = h.still > 5 && Math.sin(h.clock * 0.9) > 0.6
    ? { lookX: -1, lookY: 0 }
    : { lookX: Math.round(Math.cos(h.angle) * f), lookY: Math.round(Math.sin(h.angle) * 1.4) }
  const visor = pose.visor ?? (h.blink > 0 ? 'blink' : 'on')
  paintHelmet(pose.head.x, pose.head.y, f, { ...look, visor })
  const shoulder = { x: pose.body.x + f, y: pose.body.y + 1 }
  const tip = (p.keystones?.has('fists') ? paintFist : paintGun)(shoulder, h.angle, h.recoil > 0.45 ? 2 : h.recoil > 0 ? 1 : 0)
  outline()
  const palette = h.hurt > 0.26 ? FLASH_WHITE : h.hurt > 0.2 ? FLASH_RED : PALETTE
  blit(ctx, wx, wy, palette)
  const anchor = anchorOf(p, h, pose)
  drawKnot(ctx, Math.round(anchor.x + f), Math.round(anchor.y))
  h.tip = { x: wx + tip.x, y: wy + tip.y }
  if (h.flash > 0) drawFlash(ctx, h.tip, h, h.angle)
}

export const heroTip = p => heroOf(p).tip
