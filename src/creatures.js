import { SPRITES, paintFrames, creatureClip } from './sprites.js'
import { artKind, artTop } from './cast.js'
import { setPixelSource } from './fx.js'
import { remainsOf } from './lives.js'
import { TUNING } from './config.js'

const HURT = '#ff5a4a'
const FIRE = '#ff9a2e'
const CHARGE = '#ffe84a'
const FROST = '#a0e6ff'
const GAS = '#c79ae0'
const MAGNET = '#6fd0ff'
const ELITE_COLOURS = { burning: FIRE, charged: CHARGE, magnetic: MAGNET }

const LAMP = paintFrames(['..c...', '..c...', '.cccc.', 'cyyyyc', 'cyyyyc', '.cccc.'], { c: '#5a5a52', y: '#ffd24a' })
const ORBIT = paintFrames(['..ss..', '.sSSs.', 'sSSSSs', 'sSSSds', '.sdds.', '..ss..'], { s: '#7a2a34', S: '#d94a5a', d: '#a03040' })
const IRON = { c: '#5a5a52', d: '#3a4650' }
const batteryFrame = lit => paintFrames(['...c....', '...c....', '.dddddd.', 'dyyyyyyd', 'dkkkkkkd', 'dyyyyyyd', 'dkkkkkkd', 'dyyyyyyd', '.dddddd.', '.c....c.'], { ...IRON, y: lit, k: '#7a6c18' })
const BATTERY = [batteryFrame('#ffe84a'), batteryFrame('#c8b42c')]
const TANK = paintFrames(['.....cc.....', '.dddddddddd.', 'dbbbbbbbbbbd', 'dwwwwwwwwwwd', 'dwWwwwwwwwwd', 'dwwwwwwwWwwd', 'dwwwwwwwwwwd', 'dbbbbbbbbbbd', '.dddddddddd.'], { ...IRON, b: '#6a7a80', w: '#2f8fa8', W: '#7fdce6' })
const CARBOY = paintFrames(['...cc...', '...cc...', '..gggg..', '...gg...', '.gGGGGg.', 'gGAAAAGg', 'gAaAAAAg', 'gAAAAaAg', 'gAAAAAAg', '.gggggg.'], { c: IRON.c, g: '#3a6a30', G: '#6a9a50', A: '#84d024', a: '#d8ff7a' })
const LADLE = paintFrames(['....cc....', '...c..c...', '..c....c..', 'dddddddddd', 'dYYYYYYYYd', '.dOOOOOOd.', '.dOOOOOOd.', '..dddddd..', '...dddd...'], { c: IRON.c, d: '#3a3230', Y: '#ffd24a', O: '#d9481c' })
const SANDBAG = paintFrames(['...cc...', '...cc...', '..tttt..', '.bbbbbb.', 'bBbbbbbb', 'bbbbsbbb', 'bbbbbbBb', 'bbsbbbbb', '.bbbbbb.', '..bbbb..'], { c: IRON.c, t: '#7a5a34', b: '#a8844e', B: '#c8a468', s: '#e2d28c' })
const still = frame => ({ idle: { fps: 0, loop: true, frames: [frame] } })
const LOCAL_ART = {
  lamp: still(LAMP), orbit: still(ORBIT), tank: still(TANK), carboy: still(CARBOY), ladle: still(LADLE), sandbag: still(SANDBAG),
  battery: { idle: { fps: 5, loop: true, frames: BATTERY } },
}

const clipOf = (kind, name) => LOCAL_ART[kind]?.[name] ?? creatureClip(artKind(kind), name)

const near = (e, g, reach) => Math.hypot(g.player.x - e.x, g.player.y - e.y) < reach

const STRIKE_AT = { bat: 38, fish: 30, worm: 30 }

const SPECIALS = {
  bat: (e, g) => (!e.awake ? 'idle' : near(e, g, STRIKE_AT.bat) && 'attack'),
  fish: (e, g) => near(e, g, STRIKE_AT.fish) && 'attack',
  worm: (e, g) => near(e, g, STRIKE_AT.worm) && 'attack',
  tick: e => (e.clung > 0 ? 'cling' : !e.grounded ? 'leap' : e.windup ? 'attack' : 'idle'),
  coil: (e, g, a) => (e.windup ? 'attack' : !e.grounded ? 'leap' : g.time - (a.landed ?? -1) < 0.25 ? 'land' : 'idle'),
  mimic: (e, g) => (!e.awake ? 'idle' : near(e, g, 22) ? 'attack' : 'move'),
  pillbug: e => e.ball > 0 && 'ball',
  puffer: e => e.swell > 0 && 'inflate',
  scrapper: e => !e.loaded && !e.windup && 'empty',
  bomber: e => e.lit > 0 && 'lit',
  lantern: e => e.lunging > 0 && 'attack',
  nest: e => e.cooldown < 0.5 && 'attack',
  urchin: e => e.flash > 0 && 'attack',
  brood: e => e.fallen && (e.grounded ? 'fallen' : 'falling'),
  core: e => e.phase > 0 && `idle${e.phase}`,
}

const MOVE_CLIPS = { bellows: { spark: 'bloat' }, crucible: { ladle: 'bubble', spatter: 'bubble', drown: 'bubble' }, eel: { leap: 'move' } }

const FRIENDLY_REACH = 34

const telling = e => Boolean(e.windup || e.aimAt || e.stage === 'tell' || e.stage === 'lunge')
const striking = e => telling(e) || e.stage === 'act'

const attackClip = e => {
  const named = MOVE_CLIPS[e.kind]?.[e.move] ?? e.move
  return named && clipOf(e.kind, named) ? named : 'attack'
}

const wanted = (e, g, a) => {
  if (e.friendly && near(e, g, FRIENDLY_REACH)) return 'greet'
  if (e.eating > 0 && clipOf(e.kind, 'attack')) return 'attack'
  const special = SPECIALS[e.kind]?.(e, g, a)
  if (special) return special
  if (striking(e)) return attackClip(e)
  return Math.hypot(e.vx ?? 0, e.vy ?? 0) > 2 ? 'move' : 'idle'
}

const FALLBACK = ['idle', 'move']

const resolved = (kind, name) => [name, ...FALLBACK].find(n => clipOf(kind, n)) ?? Object.keys(LOCAL_ART[kind] ?? {})[0]

const LOW = new Set(['idle', 'move', 'empty', 'idle1', 'idle2'])

const PACE = 0.85

const frameRate = (e, clip) => {
  if (e.frozen > 0 || e.asleep) return 0
  if (!clip.walk) return clip.fps * (e.stun > 0 ? 0.3 : 1)
  const speed = Math.abs(e.vx ?? 0)
  const [frame] = clip.frames
  return speed < 1 ? 0 : Math.max(2.5, (speed / (frame[0].width * PACE)) * clip.frames.length)
}

const frameAt = (clip, a, chosen, tell) => {
  const at = Math.floor(a.clipTime)
  const last = clip.frames.length - 1
  if (clip.loop) return at % clip.frames.length
  if (chosen && tell && clip.hold !== undefined) return Math.min(at, clip.hold)
  if (chosen && clip.sustain) {
    const [from, to] = clip.sustain
    return at <= to ? at : from + (at - from) % (to - from + 1)
  }
  return Math.min(at, last)
}

const stepClip = (e, a, g, dt) => {
  const name = resolved(e.kind, wanted(e, g, a))
  const playing = a.clip && clipOf(e.kind, a.clip)
  const unfinished = playing && !playing.loop && LOW.has(name) && Math.floor(a.clipTime) < playing.frames.length
  if (!unfinished && name !== a.clip) {
    a.clip = name
    a.clipTime = 0
  }
  const clip = clipOf(e.kind, a.clip)
  const chosen = a.clip === name
  const tell = telling(e)
  a.clipTime += frameRate(e, clip) * dt
  if (chosen && tell && !clip.loop && clip.hold !== undefined) a.clipTime = Math.min(a.clipTime, clip.hold + 0.99)
  a.frame = clip.frames[frameAt(clip, a, chosen, tell)]
  return clip
}

const artFor = e => {
  const a = anims.get(e)
  const frame = a?.frame ?? clipOf(e.kind, resolved(e.kind, 'idle')).frames[0]
  return frame[e.facing > 0 ? 0 : 1]
}

const anims = new WeakMap()

const silhouettes = new WeakMap()

const silhouette = (art, colour) => {
  const byColour = silhouettes.get(art) ?? new Map()
  silhouettes.set(art, byColour)
  if (!byColour.has(colour)) {
    const canvas = document.createElement('canvas')
    canvas.width = art.width
    canvas.height = art.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(art, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, art.width, art.height)
    byColour.set(colour, canvas)
  }
  return byColour.get(colour)
}

const pixelCache = new WeakMap()

const pixelsOf = art => {
  if (pixelCache.has(art)) return pixelCache.get(art)
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  ctx.canvas.width = art.width
  ctx.canvas.height = art.height
  ctx.drawImage(art, 0, 0)
  const { data } = ctx.getImageData(0, 0, art.width, art.height)
  const pixels = []
  for (let y = 0; y < art.height; y += 2) {
    for (let x = 0; x < art.width; x += 2) {
      const i = (y * art.width + x) * 4
      if (data[i + 3] > 128) pixels.push({ dx: x, dy: y, colour: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})` })
    }
  }
  pixelCache.set(art, pixels)
  return pixels
}

const artOrigin = (e, art) => ({
  x: Math.round(e.x + e.w / 2 - art.width / 2),
  y: Math.round(artTop(e, art.height)),
})

setPixelSource(e => {
  const art = artFor(e)
  const { x, y } = artOrigin(e, art)
  return pixelsOf(art).map(({ dx, dy, colour }) => ({ x: x + dx, y: y + dy, colour }))
})

const animOf = (e, time) => {
  if (!anims.has(e)) anims.set(e, { stretch: 0, speed: 0, grounded: e.grounded, walked: e.grounded === true, vy: 0, flash: 0, last: time })
  return anims.get(e)
}

const SPRING = 340
const DAMP = 22

const stepAnim = (e, a, time) => {
  const dt = Math.min(0.05, Math.max(0, time - a.last))
  a.last = time
  if (e.grounded && !a.grounded) a.landed = time
  if ((e.flash ?? 0) > a.flash) a.stretch = -0.34
  a.flash = e.flash ?? 0
  if (e.grounded) a.walked = true
  if (e.grounded && !a.grounded && a.vy > 50) a.stretch = -Math.min(0.42, a.vy / 420)
  if (!e.grounded && a.grounded && e.vy < -40) {
    a.stretch = 0.32
  }
  a.grounded = e.grounded
  a.vy = e.vy
  a.speed += (-SPRING * a.stretch - DAMP * a.speed) * dt
  a.stretch += a.speed * dt
  return dt
}

const poseOf = (e, a, time, clip) => {
  if (e.frozen > 0) return { sx: 1, sy: 1, lean: 0, bob: 0 }
  const flyer = !a.walked
  const phase = time * 8 + (e.wander ?? 0)
  const windup = e.windup && e.stun <= 0 && !e.friendly
  const swell = windup ? 0.03 + Math.sin(time * 26) * 0.02 : e.lit ? 0.03 + Math.sin(time * 40) * 0.03 : 0
  const airborne = !flyer && !e.grounded ? Math.max(-0.06, Math.min(0.1, -e.vy / 1800)) : 0
  const drifting = flyer && !e.heavy && Math.hypot(e.vx ?? 0, e.vy ?? 0) > 1
  const stretch = a.stretch + airborne
  return {
    sx: 1 + swell - stretch * 0.75,
    sy: 1 + swell + stretch,
    lean: Math.round(Math.max(-2, Math.min(2, (e.vx ?? 0) / 22))),
    bob: drifting ? Math.round(Math.sin(phase) * 1.2) : 0,
  }
}

const stamp = (ctx, art, x, y, { sx, sy, lean, bob }) => {
  const w = Math.max(1, Math.round(art.width * sx))
  const h = Math.max(1, Math.round(art.height * sy))
  const left = x + Math.round((art.width - w) / 2)
  const top = y + art.height - h + bob
  const waist = Math.floor(h * 0.62)
  const srcWaist = Math.floor(art.height * 0.62)
  ctx.drawImage(art, 0, 0, art.width, srcWaist, left + lean, top, w, waist)
  ctx.drawImage(art, 0, srcWaist, art.width, art.height - srcWaist, left, top + waist, w, h - waist)
}

const ring = (ctx, art, x, y, pose, colour) => {
  const mask = silhouette(art, colour)
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) stamp(ctx, mask, x + dx, y + dy, pose)
}

const warned = e => (e.windup || e.startle > 0) && e.stun <= 0 && !e.friendly

const telegraphColour = (e, time) => {
  const pattern = e.lit ? [FIRE, null, '#ffffff', null] : warned(e) ? [HURT, null, '#ffffff', null] : null
  return pattern ? pattern[Math.floor(time * (e.lit ? 26 : 18)) % 4] : null
}

const drawBurning = (ctx, e, art, at, y, pose, time) => {
  const beat = Math.floor(time * 12 + (e.wander ?? 0) * 3)
  ctx.globalAlpha = 0.3 + (beat % 2) * 0.12
  stamp(ctx, silhouette(art, FIRE), at, y, pose)
  ctx.globalAlpha = 1
  const tongues = Math.max(1, Math.round(art.width / 9))
  for (let i = 0; i < tongues; i++) {
    const flame = SPRITES.flames[(beat + i) % SPRITES.flames.length]
    const x = Math.round(at + ((i + 0.5) / tongues) * art.width - 4)
    ctx.drawImage(flame, x, Math.round(y + art.height * 0.45 - 8 - ((beat + i) % 2)))
  }
}

const DEAD = '#141414'

const drawRemains = (ctx, g) => {
  const R = TUNING.enemies.lives.remains
  for (const r of remainsOf(g)) {
    const frames = clipOf(r.kind, resolved(r.kind, 'idle'))?.frames
    if (!frames) continue
    const art = frames[0][r.facing > 0 ? 0 : 1]
    const h = Math.max(2, Math.round(art.height * (0.35 + 0.35 * (r.meat / R.meat))))
    const x = Math.round(r.x + r.w / 2 - art.width / 2)
    const bottom = Math.round(r.y + r.h)
    ctx.globalAlpha = Math.min(1, (R.life - (g.time - r.at)) / 4)
    ctx.save()
    ctx.translate(0, bottom * 2 - h)
    ctx.scale(1, -1)
    ctx.drawImage(art, x, bottom - h, art.width, h)
    ctx.globalAlpha *= 0.55
    ctx.drawImage(silhouette(art, DEAD), x, bottom - h, art.width, h)
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

const STALK = '#4a7a2a'
const STALK_SHADE = '#2a4a18'

const stalk = (ctx, e, top) => {
  const x = Math.round(e.x + e.w / 2)
  const from = Math.round(e.anchor.y)
  if (top <= from) return
  ctx.fillStyle = STALK_SHADE
  ctx.fillRect(x - 2, from, 4, top - from + 2)
  ctx.fillStyle = STALK
  ctx.fillRect(x - 1, from, 2, top - from + 2)
}

const molten = (d, i) => d[i + 3] > 128 && d[i] > 180 && d[i + 1] > 60 && d[i + 2] < 110 && d[i] - d[i + 2] > 100

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]

const tips = new WeakMap()

const findTip = art => {
  const { width: w, height: h } = art
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  ctx.canvas.width = w
  ctx.canvas.height = h
  ctx.drawImage(art, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  const seen = new Uint8Array(w * h)
  let largest = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !molten(data, start * 4)) continue
    const blob = []
    const queue = [start]
    seen[start] = 1
    while (queue.length) {
      const at = queue.pop()
      const [x, y] = [at % w, Math.floor(at / w)]
      blob.push([x, y])
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx
        const ny = y + dy
        const next = ny * w + nx
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[next] || !molten(data, next * 4)) continue
        seen[next] = 1
        queue.push(next)
      }
    }
    if (blob.length > largest.length) largest = blob
  }
  const low = Math.max(...largest.map(([, y]) => y))
  if (!largest.length || low < h * 0.6) return null
  const foot = largest.filter(([, y]) => y >= low - 1).map(([x]) => x)
  const widths = Array.from({ length: 8 }, (_, k) => largest.filter(([, y]) => y === low - 4 - k).length).filter(n => n > 0).sort((p, q) => p - q)
  const tones = largest.map(([x, y]) => (y * w + x) * 4).map(i => [data[i], data[i + 1], data[i + 2]]).sort((p, q) => p[0] + p[1] * 2 - q[0] - q[1] * 2)
  const tone = at => `rgb(${tones[Math.floor(at * (tones.length - 1))].join(',')})`
  return {
    x: foot.reduce((sum, x) => sum + x, 0) / foot.length + 0.5,
    y: low + 1,
    w: widths[Math.floor(widths.length / 2)] ?? 3,
    edge: tone(0.12),
    body: tone(0.5),
    core: tone(0.9),
  }
}

const tipOf = art => {
  if (!tips.has(art)) tips.set(art, findTip(art))
  return tips.get(art)
}

const onPose = (art, x, y, { sx, sy, lean, bob }, point) => {
  const w = Math.max(1, Math.round(art.width * sx))
  const h = Math.max(1, Math.round(art.height * sy))
  const left = x + Math.round((art.width - w) / 2)
  const top = y + art.height - h + bob
  const waist = Math.floor(h * 0.62)
  const srcWaist = Math.floor(art.height * 0.62)
  const below = point.y >= srcWaist
  return {
    x: left + point.x * (w / art.width) + (below ? 0 : lean),
    y: below ? top + waist + (point.y - srcWaist) * ((h - waist) / (art.height - srcWaist)) : top + point.y * (waist / srcWaist),
  }
}

const drawPour = (ctx, g, e, art, x, y, pose) => {
  const stream = e.stream
  const tip = tipOf(art)
  const from = tip ? onPose(art, x, y, pose, tip) : { x: stream.x, y: stream.top }
  const width = Math.max(2, Math.min(6, tip?.w ?? 3))
  const { edge = '#c8401a', body = '#ff8a24', core = '#ffe84a' } = tip ?? {}
  const time = g.time
  const bottom = Math.max(stream.bottom, Math.round(from.y) + 1)
  for (let row = Math.round(from.y) - 2; row < bottom; row++) {
    const left = Math.round(from.x - width / 2 + Math.sin(row * 0.16 - time * 9) * 0.7)
    ctx.fillStyle = edge
    ctx.fillRect(left - 1, row, width + 2, 1)
    ctx.fillStyle = body
    ctx.fillRect(left, row, width, 1)
    ctx.fillStyle = core
    if (width > 2) ctx.fillRect(left + 1, row, width - 2, 1)
    if (Math.floor(row - time * 140) % 11 === 0) ctx.fillRect(left, row, width, 2)
  }
  for (let i = 0; i < 4; i++) {
    const t = (time * 2.6 + i / 4) % 1
    const side = i % 2 ? 1 : -1
    ctx.fillStyle = i < 2 ? core : body
    ctx.fillRect(Math.round(from.x + side * (width / 2 + 1 + t * (4 + i * 2))), Math.round(bottom - 1 - Math.sin(t * Math.PI) * (3 + i)), 1, 1)
  }
}

const BIG_FLASH = 0.4

const drawOne = (ctx, g, e) => {
  const time = g.time
  const a = animOf(e, time)
  const dt = stepAnim(e, a, time)
  const clip = stepClip(e, a, g, dt)
  const art = artFor(e)
  const pose = poseOf(e, a, time, clip)
  const jitter = e.stun > 0 && e.frozen <= 0 ? Math.round(Math.sin(time * 60)) : 0
  const { x, y } = artOrigin(e, art)
  const at = x + jitter
  if (e.stowed) return
  if (e.anchor) stalk(ctx, e, y)
  if (e.intangible) ctx.globalAlpha = 0.35
  if (e.upside) {
    ctx.save()
    ctx.translate(0, y * 2 + art.height)
    ctx.scale(1, -1)
  }
  if (e.stream) drawPour(ctx, g, e, art, at, y, pose)
  if (e.elite || e.ally) ring(ctx, art, at, y, pose, e.ally ? GAS : ELITE_COLOURS[e.elite])
  stamp(ctx, art, at, y, pose)
  ctx.globalAlpha = 1
  const overlay = e.flash > 0 ? '#ffffff' : telegraphColour(e, time)
  if (overlay) {
    ctx.globalAlpha = e.warden ? BIG_FLASH : 1
    stamp(ctx, silhouette(art, overlay), at, y, pose)
    ctx.globalAlpha = 1
  }
  if (e.frozen > 0) {
    ctx.globalAlpha = 0.6
    stamp(ctx, silhouette(art, FROST), at, y, pose)
    ctx.globalAlpha = 1
  }
  if (e.alight > 0) drawBurning(ctx, e, art, at, y, pose, time)
  if (e.upside) ctx.restore()
  if (e.aimAt && e.stun <= 0) {
    ctx.fillStyle = HURT
    const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 }
    const d = Math.hypot(e.aimAt.x - c.x, e.aimAt.y - c.y)
    for (let t = 6 + (time * 40) % 6; t < d; t += 6) ctx.fillRect(Math.round(c.x + ((e.aimAt.x - c.x) / d) * t), Math.round(c.y + ((e.aimAt.y - c.y) / d) * t), 1, 1)
  }
  if (e.friendly && !e.spent && e.kind !== 'mole') {
    const bob = Math.round(Math.sin(time * 4))
    ctx.fillStyle = CHARGE
    ctx.fillRect(Math.round(e.x + e.w / 2) - 1, y - 5 + bob, 2, 2)
  }
}

export const drawCreatures = (ctx, g, enemies, remains = true) => {
  if (remains) drawRemains(ctx, g)
  for (const e of enemies) drawOne(ctx, g, e)
}
