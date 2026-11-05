import { paintFrames, creatureClip } from './sprites.js'
import { artKind, artTop } from './cast.js'
import { WORLD_PX, solidAt } from './physics.js'
import { setPixelSource } from './fx.js'

const HURT = '#ff5a4a'
const FIRE = '#ff9a2e'
const CHARGE = '#ffe84a'
const FROST = '#a0e6ff'
const GAS = '#c79ae0'
const PALE = '#c9d4c0'
const ELITE_COLOURS = { burning: FIRE, charged: CHARGE, armoured: PALE }

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

const MOVE_CLIPS = { bellows: { spark: 'bloat' }, crucible: { stride: 'move' }, eel: { leap: 'move' } }

const FRIENDLY_REACH = 34

const telling = e => Boolean(e.windup || e.aimAt || e.stage === 'tell' || e.stage === 'lunge')
const striking = e => telling(e) || e.stage === 'act'

const attackClip = e => {
  const named = MOVE_CLIPS[e.kind]?.[e.move] ?? e.move
  return named && clipOf(e.kind, named) ? named : 'attack'
}

const wanted = (e, g, a) => {
  if (e.friendly && near(e, g, FRIENDLY_REACH)) return 'greet'
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

const telegraphColour = (e, time) => {
  const pattern = e.lit ? [FIRE, null, '#ffffff', null] : e.windup && e.stun <= 0 && !e.friendly ? [HURT, null, '#ffffff', null] : null
  return pattern ? pattern[Math.floor(time * (e.lit ? 26 : 18)) % 4] : null
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

const BIG_FLASH = 0.4
const STILT_FEET = [-0.42, 0, 0.42]

const drawStilts = (ctx, g, e, art, at, y) => {
  const bottom = y + art.height - 1
  const middle = at + art.width / 2
  for (const spread of STILT_FEET) {
    const x = Math.round(middle + spread * art.width)
    let floor = bottom
    while (floor < WORLD_PX && !solidAt(g.world, x, floor + 1)) floor += 1
    ctx.fillStyle = '#26262a'
    ctx.fillRect(x - 1, bottom, 3, floor - bottom + 1)
    ctx.fillStyle = '#8a8a90'
    ctx.fillRect(x, bottom, 1, floor - bottom + 1)
  }
}

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
  if (e.elite || e.ally) ring(ctx, art, at, y, pose, e.ally ? GAS : ELITE_COLOURS[e.elite])
  stamp(ctx, art, at, y, pose)
  ctx.globalAlpha = 1
  if (e.kind === 'crucible') drawStilts(ctx, g, e, art, at, y)
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

export const drawCreatures = (ctx, g, enemies) => {
  for (const e of enemies) drawOne(ctx, g, e)
}
