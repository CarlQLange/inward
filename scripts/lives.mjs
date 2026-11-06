#!/usr/bin/env node
// Measures how much the creatures live their own lives, region by region.
// Half the rooms the hero stands still by the door, half it wanders, shoots and casts, never dying.
// Per region it reports how foes spend their time, who kills them, how often they change the world and how often they hit the hero.
//   node scripts/lives.mjs --rooms 40
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus, homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

const argOf = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at < 0 ? fallback : Number(process.argv[at + 1])
}

const SECONDS = 30

const seededRandom = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const playRegion = async ({ theme, rooms }) => {
  const store = new Map()
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }
  const { TICK, BLOCK, ROOM } = await import('../src/config.js')
  const { save } = await import('../src/store.js')
  const { LADDER } = await import('../src/discover.js')
  const { createGame, jumpTo, step } = await import('../src/game.js')
  const { M, props } = await import('../src/materials.js')
  const { ringOf } = await import('../src/map.js')
  const { THEMES } = await import('../src/generate.js')
  save.found = [...LADDER]

  const SPILLS = new Set([M.OIL, M.ACID, M.METHANE])
  const stable = m => props(m).solid === true && !props(m).falls
  const fresh = (mat, old, i) => {
    const [x, y] = [i % ROOM, Math.floor(i / ROOM)]
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (old[(y + dy) * ROOM + x + dx] === mat) return false
    return true
  }
  const madeBy = (old, now, i, oldMats) => stable(old) !== stable(now) || (stable(old) && old !== now) || (old === M.EMPTY && SPILLS.has(now) && fresh(now, oldMats, i))
  const tally = { rooms: 0, ticks: { watch: 0, play: 0 }, foeTicks: 0, chasing: 0, still: 0, minds: {}, kills: 0, byHero: 0, byFoe: 0, bitten: 0, byWorld: 0, unaware: 0, changes: 0, hits: { watch: 0, play: 0 }, foesAtStart: 0, firstHit: [], acts: {} }
  const middle = e => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 })
  const counted = e => !e.friendly && !e.prop && !e.warden && !e.partOf

  const started = Date.now()
  for (let n = 0; n < rooms && Date.now() - started < 300000; n++) {
    Math.random = seededRandom(theme * 100003 + n * 7919 + 17)
    const watching = n % 2 === 0
    const mode = watching ? 'watch' : 'play'
    const g = createGame(null, 'playing', 1 + n % 5)
    g.menus.length = 0
    g.bands = [theme, theme, theme, theme]
    g.bandFoes = g.bands.map(() => [...THEMES[theme].foes].sort(() => Math.random() - 0.5).slice(0, 5))
    const wardens = new Set(Object.values(g.wardens).map(w => `${w.x},${w.y}`))
    const spots = Object.keys(g.map.links).filter(k => !wardens.has(k)).map(k => k.split(',').map(Number)).filter(([x, y]) => ringOf(x, y) >= 1 && ringOf(x, y) <= 5)
    const [x, y] = spots[Math.floor(Math.random() * spots.length)]
    delete g.rooms[`${x},${y}`]
    jumpTo(g, x, y)
    if (g.boss) continue
    tally.rooms++
    tally.foesAtStart += g.enemies.filter(counted).length
    const world = g.world
    world.counts = {}
    let before = Uint8Array.from(world.mat)
    let burnBefore = Float32Array.from(world.burn)
    const seen = new Set()
    const aware = new Set()
    let input = {}
    let hp = g.player.hp
    let firstHit = null
    for (let t = 0; t < SECONDS / TICK; t++) {
      if (!watching && t % 30 === 0) {
        input = { autofire: true }
        for (const k of ['left', 'right', 'jump', 'skill', 'skill2', 'skill3', 'shoot', 'up', 'down']) if (Math.random() < 0.3) input[k] = true
        input.aim = { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, free: true }
      }
      g.reveal = null
      g.menus.length = 0
      for (const e of g.enemies) if (counted(e)) seen.add(e)
      step(g, input, TICK)
      if (g.phase !== 'playing' || g.world !== world) break
      tally.ticks[mode]++
      if (g.player.hp < hp) {
        tally.hits[mode] += 1
        firstHit ??= t * TICK
      }
      g.player.hp = 8
      hp = g.player.hp
      const hero = middle(g.player)
      for (const e of g.enemies) {
        if (!counted(e)) continue
        tally.foeTicks++
        if (e.mind) tally.minds[e.mind] = (tally.minds[e.mind] ?? 0) + 1
        if (e.mind === 'hero') aware.add(e)
        const c = middle(e)
        const speed = Math.hypot(e.vx ?? 0, e.vy ?? 0)
        if (speed < 2) tally.still++
        else {
          const d = Math.max(1, Math.hypot(hero.x - c.x, hero.y - c.y))
          if (((hero.x - c.x) * e.vx + (hero.y - c.y) * e.vy) / (d * speed) > 0.6) tally.chasing++
        }
      }
      for (let i = 0; i < world.mat.length; i++) {
        if (world.mat[i] === before[i]) continue
        if (world.burn[i] > 0 || burnBefore[i] > 0 || !madeBy(before[i], world.mat[i], i, before)) continue
        const cx = (i % ROOM + 0.5) * BLOCK
        const cy = (Math.floor(i / ROOM) + 0.5) * BLOCK
        if (Math.hypot(cx - hero.x, cy - hero.y) < 4 * BLOCK) continue
        if (g.enemies.some(e => counted(e) && cx > e.x - BLOCK / 2 && cx < e.x + e.w + BLOCK / 2 && cy > e.y - BLOCK / 2 && cy < e.y + e.h + BLOCK / 2)) tally.changes++
      }
      before = Uint8Array.from(world.mat)
      burnBefore = Float32Array.from(world.burn)
      for (const e of [...seen]) {
        if (g.enemies.includes(e) && e.hp > 0) continue
        seen.delete(e)
        tally.kills++
        if (e.lastSource === 'player') tally.byHero++
        else if (e.lastBy) tally.byFoe++
        else if (e.lastCause === 'BITTEN') tally.bitten++
        else tally.byWorld++
        if (e.lastSource !== 'player' && e.mind !== undefined && !aware.has(e)) tally.unaware++
      }
    }
    if (firstHit !== null) tally.firstHit.push(firstHit)
    for (const [tag, count] of Object.entries(world.counts)) if (tag.startsWith('life.')) tally.acts[tag.slice(5)] = (tally.acts[tag.slice(5)] ?? 0) + count
  }
  return tally
}

if (!isMainThread) parentPort.postMessage({ theme: workerData.theme, tally: await playRegion(workerData) })
else {
  const rooms = argOf('rooms', 40)
  const { THEMES } = await import('../src/generate.js')
  const ids = [0, 1, 2, 3, 4, 5, 6]
  const queue = [...ids]
  const results = []
  const barFile = join(homedir(), '.claude/modprogress/core-lives')
  mkdirSync(dirname(barFile), { recursive: true })
  writeFileSync(barFile, `0 ${ids.length} regions\n`)
  const runNext = () => new Promise(resolve => {
    const pump = () => {
      const theme = queue.shift()
      if (theme === undefined) return resolve()
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { theme, rooms } })
      w.on('message', r => {
        results.push(r)
        writeFileSync(barFile, `${results.length} ${ids.length} regions\n`)
        console.log(`${results.length}/${ids.length} regions done`)
      })
      w.on('error', err => console.log(`region ${theme} failed: ${err.stack}`))
      w.on('exit', pump)
    }
    pump()
  })
  await Promise.all(Array.from({ length: Math.min(ids.length, Math.max(1, cpus().length - 2)) }, runNext))
  const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`.padStart(4)
  const perMin = (a, ticks) => (a / Math.max(1e-9, ticks / 3600)).toFixed(1).padStart(5)
  const row = (name, t) => {
    const minds = Object.entries(t.minds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, t.foeTicks)}`).join(' ')
    const median = [...t.firstHit].sort((a, b) => a - b)[Math.floor(t.firstHit.length / 2)]
    return [
      name.padEnd(15),
      `foes/room ${(t.foesAtStart / Math.max(1, t.rooms)).toFixed(1)}`,
      `| chasing ${pct(t.chasing, t.foeTicks)} still ${pct(t.still, t.foeTicks)}${minds ? ` | ${minds}` : ''}`,
      `| kills ${t.kills}: hero ${pct(t.byHero, t.kills)} foe ${pct(t.byFoe, t.kills)} bitten ${pct(t.bitten, t.kills)} world ${pct(t.byWorld, t.kills)} unaware ${t.unaware}`,
      `| foe edits/foe-min ${(t.changes / Math.max(1e-9, t.foeTicks / 3600)).toFixed(1)}`,
      ...(Object.keys(t.acts).length ? [`| acts/min ${Object.entries(t.acts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / Math.max(1e-9, (t.ticks.watch + t.ticks.play) / 3600)).toFixed(1)}`).join(' ')}`] : []),
      `| hero hits/min watch ${perMin(t.hits.watch, t.ticks.watch)} play ${perMin(t.hits.play, t.ticks.play)} first hit ${median === undefined ? '-' : `${median.toFixed(1)}s`}`,
    ].join(' ')
  }
  const sum = results.reduce((all, { tally: t }) => {
    for (const [k, v] of Object.entries(t)) {
      if (typeof v === 'number') all[k] = (all[k] ?? 0) + v
      else if (Array.isArray(v)) all[k] = [...(all[k] ?? []), ...v]
      else all[k] = Object.fromEntries([...new Set([...Object.keys(all[k] ?? {}), ...Object.keys(v)])].map(key => [key, (all[k]?.[key] ?? 0) + (v[key] ?? 0)]))
    }
    return all
  }, {})
  const lines = results.sort((a, b) => a.theme - b.theme).map(({ theme, tally }) => row(THEMES[theme].name.replace('THE ', ''), tally))
  console.log([...lines, row('ALL', sum)].join('\n'))
}
