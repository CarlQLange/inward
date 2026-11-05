export const MASK_SIZE = 256

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255)

const hash = (x, y) => (Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 16) & 0xffff
const seeded = (a, b, lo, hi) => lo + ((hash(a, b) % 1000) / 1000) * (hi - lo)

const NEAR = '#ff0000'
const FAR = '#00ff00'
const WALL = '#0000ff'

const poly = (ctx, colour, points) => {
  ctx.fillStyle = colour
  ctx.beginPath()
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

const rect = (ctx, colour, x, y, w, h) => {
  ctx.fillStyle = colour
  ctx.fillRect(x, y, w, h)
}

const spike = (ctx, colour, x, y, w, h) => poly(ctx, colour, [[x - w / 2, y], [x + w / 2, y], [x + w * 0.1, y + h], [x - w * 0.1, y + h]])

const spikes = (ctx, colour, count, seed, reach, wide, floor = true) => {
  for (let i = 0; i < count; i++) {
    const x = (i / count) * MASK_SIZE + seeded(i, seed, -10, 10)
    const h = seeded(i, seed + 1, reach * 0.4, reach)
    const w = seeded(i, seed + 2, wide * 0.5, wide)
    spike(ctx, colour, x, 0, w, h)
    if (floor) spike(ctx, colour, x + 13, MASK_SIZE, w, -h * 0.8)
  }
}

const arches = (ctx, colour, count, y, h) => {
  const pitch = MASK_SIZE / count
  for (let i = 0; i < count; i++) {
    const x = i * pitch
    rect(ctx, colour, x, y, pitch * 0.22, h)
    ctx.fillStyle = colour
    ctx.beginPath()
    ctx.arc(x + pitch * 0.61, y + pitch * 0.42, pitch * 0.5, Math.PI, 0)
    ctx.arc(x + pitch * 0.61, y + pitch * 0.42, pitch * 0.38, 0, Math.PI, true)
    ctx.closePath()
    ctx.fill()
  }
}

const trunks = (ctx, colour, count, seed, wide) => {
  for (let i = 0; i < count; i++) {
    const x = (i / count) * MASK_SIZE + seeded(i, seed, -14, 14)
    const w = seeded(i, seed + 1, wide * 0.5, wide)
    rect(ctx, colour, x, 0, w, MASK_SIZE)
    for (let b = 0; b < 3; b++) {
      const y = seeded(i, seed + 2 + b, 0, MASK_SIZE)
      poly(ctx, colour, [[x + w / 2, y], [x + w / 2 + (b % 2 ? 30 : -30), y - 22], [x + w / 2 + (b % 2 ? 30 : -30), y - 18], [x + w / 2, y + 6]])
    }
  }
}

const girders = (ctx, colour, seed, pitch, thick) => {
  for (let i = 0; i < MASK_SIZE / pitch; i++) {
    const x = i * pitch + seeded(i, seed, -6, 6)
    rect(ctx, colour, x, 0, thick, MASK_SIZE)
    rect(ctx, colour, 0, i * pitch + 18, MASK_SIZE, thick * 0.7)
  }
}

const stacks = (ctx, colour, seed, count) => {
  for (let i = 0; i < count; i++) {
    const x = (i / count) * MASK_SIZE + seeded(i, seed, -8, 8)
    const w = seeded(i, seed + 1, 16, 34)
    const top = seeded(i, seed + 2, 40, 170)
    rect(ctx, colour, x, top, w, MASK_SIZE - top)
    rect(ctx, colour, x - 3, top, w + 6, 6)
  }
}

const shards = (ctx, colour, seed, count, reach) => {
  for (let i = 0; i < count; i++) {
    const x = seeded(i, seed, 0, MASK_SIZE)
    const y = seeded(i, seed + 1, 0, MASK_SIZE)
    const h = seeded(i, seed + 2, reach * 0.4, reach)
    const lean = seeded(i, seed + 3, -14, 14)
    poly(ctx, colour, [[x, y], [x + h * 0.22, y + h * 0.3], [x + lean, y + h], [x - h * 0.22, y + h * 0.3]])
  }
}

const circles = (ctx, colour, step, width) => {
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  for (let r = step; r < MASK_SIZE; r += step) {
    ctx.beginPath()
    ctx.arc(MASK_SIZE / 2, MASK_SIZE / 2, r, 0, Math.PI * 2)
    ctx.stroke()
  }
}

const slabs = (ctx, colour, seed, w, h) => {
  ctx.fillStyle = colour
  for (let row = 0; row < MASK_SIZE / h; row++) {
    for (let i = 0; i < MASK_SIZE / w; i++) {
      if (hash(i + seed, row) % 3 === 0) continue
      ctx.fillRect(i * w + (row % 2) * (w / 2), row * h, w - 2, h - 2)
    }
  }
}

const SCENERY = [
  ctx => {
    spikes(ctx, NEAR, 6, 3, 70, 44)
    spikes(ctx, FAR, 9, 8, 100, 30)
  },
  ctx => {
    arches(ctx, NEAR, 2, 50, 200)
    arches(ctx, FAR, 4, 92, 130)
  },
  ctx => {
    trunks(ctx, NEAR, 4, 21, 18)
    trunks(ctx, FAR, 7, 29, 8)
  },
  ctx => {
    girders(ctx, NEAR, 41, 86, 9)
    stacks(ctx, FAR, 47, 6)
  },
  ctx => {
    stacks(ctx, NEAR, 53, 4)
    stacks(ctx, FAR, 59, 8)
  },
  ctx => {
    spikes(ctx, NEAR, 7, 61, 130, 22)
    spikes(ctx, FAR, 13, 67, 80, 14, false)
  },
  ctx => {
    shards(ctx, NEAR, 71, 9, 90)
    shards(ctx, FAR, 79, 18, 60)
  },
  ctx => {
    circles(ctx, NEAR, 44, 7)
    circles(ctx, FAR, 26, 3)
  },
]

const makeMasks = theme => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = MASK_SIZE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE)
  ctx.globalCompositeOperation = 'lighter'
  slabs(ctx, WALL, theme * 11 + 2, 64, 32)
  const scene = SCENERY[theme] ?? SCENERY[0]
  for (const [dx, dy] of [[0, 0], [MASK_SIZE, 0], [-MASK_SIZE, 0], [0, MASK_SIZE], [0, -MASK_SIZE]]) {
    ctx.save()
    ctx.translate(dx, dy)
    scene(ctx)
    ctx.restore()
  }
  return canvas
}

const made = new Map()
export const masksFor = theme => {
  if (!made.has(theme)) made.set(theme, makeMasks(theme))
  return made.get(theme)
}

const AIRS = [
  { air: '#070f0d', far: '#0c1a15', near: '#0f2119', wall: '#0b1713', side: '#21331f', fog: '#1d3a2c', beam: '#b9e29a', fixture: [0.9, 0.95, 0.5] },
  { air: '#05101a', far: '#0a1c2a', near: '#0c2234', wall: '#091826', side: '#17303f', fog: '#1a3e58', beam: '#a4dcf0', fixture: [0.55, 0.85, 1] },
  { air: '#120d06', far: '#20170b', near: '#2a1d0d', wall: '#1a130a', side: '#33240f', fog: '#3a2c14', beam: '#e8cc84', fixture: [1, 0.72, 0.32] },
  { air: '#0b0d10', far: '#161a1f', near: '#1b2026', wall: '#13171c', side: '#2a2f35', fog: '#2d3540', beam: '#d8e0ea', fixture: [1, 0.86, 0.6] },
  { air: '#150704', far: '#280e07', near: '#341208', wall: '#200b06', side: '#40170c', fog: '#4c1d0e', beam: '#ffb066', fixture: [1, 0.5, 0.2] },
  { air: '#071218', far: '#0e2530', near: '#123140', wall: '#0c1f29', side: '#1f4150', fog: '#2f5a70', beam: '#c8f4ff', fixture: [0.6, 0.92, 1] },
  { air: '#0e0616', far: '#1c0d2c', near: '#26113a', wall: '#170a25', side: '#311c47', fog: '#3a2058', beam: '#e0b4ff', fixture: [0.82, 0.5, 1] },
  { air: '#10060c', far: '#240d1c', near: '#36102a', wall: '#1c0a15', side: '#41152f', fog: '#4c1838', beam: '#ff9ac8', fixture: [1, 0.4, 0.7] },
]

const asColours = look => Object.fromEntries(Object.entries(look).map(([k, v]) => [k, typeof v === 'string' ? hex(v) : v]))
const COLOURS = AIRS.map(asColours)

export const airOf = theme => COLOURS[theme] ?? COLOURS[0]
