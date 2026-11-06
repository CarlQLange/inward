#!/usr/bin/env node
// Checks that creatures stand on the blocks they appear to stand on.
//   node scripts/footing.mjs --rooms 300 --seconds 12 --seed 1
const store = new Map()
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
}

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at < 0 ? fallback : Number(process.argv[at + 1])
}
const rooms = arg('rooms', 300)
const seconds = arg('seconds', 12)
let seed = arg('seed', 1)
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const { TICK } = await import('../src/config.js')
const { save } = await import('../src/store.js')
const { LADDER } = await import('../src/discover.js')
const { anchorOf } = await import('../src/cast.js')
const { createGame, jumpTo, step } = await import('../src/game.js')
const { ENEMY_DEFS, support } = await import('../src/enemies.js')
const { hitsSolid, solidAt } = await import('../src/physics.js')
await import('../src/wardens.js')

save.found = [...LADDER]
const stats = {}
const statOf = kind => (stats[kind] ??= { ticks: 0, poor: 0, air: 0, buried: 0, stuck: 0, longest: 0, seen: 0 })
const streaks = new WeakMap()
const SETTLE_TICKS = 30
let sample = {}
const planted = Object.keys(ENEMY_DEFS).filter(k => anchorOf(k) === 'ground' && !ENEMY_DEFS[k].free && !ENEMY_DEFS[k].prop)
let lost = 0
let total = 0

const picture = (g, e) => {
  const rows = []
  const col = Math.floor(e.x / 8)
  const row = Math.floor(e.y / 8)
  for (let y = row - 2; y <= row + 5; y++) {
    let line = ''
    for (let x = col - 5; x <= col + 7; x++) line += solidAt(g.world, x * 8, y * 8) ? '#' : '.'
    rows.push(line)
  }
  return `${e.kind} x=${e.x.toFixed(1)} y=${e.y.toFixed(1)} w=${e.w} h=${e.h} vx=${e.vx.toFixed(0)} facing=${e.facing} col=${col}\n${rows.join('\n')}`
}

const started = Date.now()
for (let n = 0; n < rooms; n++) {
  const ring = n % 7
  const g = createGame(null, 'playing', ring)
  g.menus.length = 0
  const loop = Object.keys(g.map.links).map(k => k.split(',').map(Number))
  const [x, y] = loop[Math.floor(Math.random() * loop.length)]
  jumpTo(g, x, y)
  const room = g.rooms[`${x},${y}`]
  total += room.enemies.length
  room.enemies.forEach(e => { if (planted.includes(e.kind)) statOf(e.kind).seen += 1 })
  for (let t = 0; t < seconds / TICK; t++) {
    g.player.hp = 8
    g.player.iframes = 1
    g.reveal = null
    g.menus.length = 0
    g.pendingOffers = 0
    step(g, {}, TICK)
    for (const e of g.enemies) {
      if (!planted.includes(e.kind) || e.warden) continue
      const s = statOf(e.kind)
      if (e.grounded) {
        const held = support(g.world, e)
        s.ticks += 1
        const streak = held < 0.65 && Math.abs(e.vx) <= 1 ? (streaks.get(e) ?? 0) + 1 : 0
        streaks.set(e, streak)
        s.longest = Math.max(s.longest, streak)
        if (streak > SETTLE_TICKS) {
          s.stuck += 1
          if (streak === SETTLE_TICKS + 1 && !sample[e.kind]) sample[e.kind] = picture(g, e)
        }
        if (held < 0.65) s.poor += 1
        if (held === 0) s.air += 1
      }
      if (e.kind !== 'worm' && hitsSolid(g.world, e)) s.buried += 1
    }
    if (g.phase !== 'playing') break
  }
  if (n % 50 === 49) console.log(`${n + 1}/${rooms} rooms, ${((Date.now() - started) / 1000).toFixed(0)}s`)
}
const rows = Object.entries(stats).sort((a, b) => b[1].stuck / Math.max(1, b[1].ticks) - a[1].stuck / Math.max(1, a[1].ticks))
console.log('kind           seen   ticks  hanging%  settling%  on-air%  buried%  longest-ticks')
for (const [kind, s] of rows) {
  const pct = v => ((100 * v) / Math.max(1, s.ticks)).toFixed(2).padStart(9)
  console.log(`${kind.padEnd(14)}${String(s.seen).padStart(5)}${String(s.ticks).padStart(8)}${pct(s.stuck)}${pct(s.poor - s.stuck)}${pct(s.air)}${pct(s.buried)}   ${s.longest}`)
}
console.log(`foes in rooms: ${total}`)
if (process.argv.includes('--samples')) console.log(Object.values(sample).join('\n\n'))
