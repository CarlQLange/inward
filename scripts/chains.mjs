#!/usr/bin/env node
// Measures which world systems actually fire in each region, using a bot that wanders, shoots and casts.
// The second line per region counts the newer rules per room minute and the loose matter each room starts with.
//   node scripts/chains.mjs --rooms 60
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus, homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

const argOf = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at < 0 ? fallback : Number(process.argv[at + 1])
}

const SECONDS = 25
const RULES = ['glaze', 'fuse', 'shatter', 'soak', 'bake', 'smother', 'snow', 'throw', 'regrow', 'magnet']
const MATTER = ['sand', 'mud', 'snow', 'glass']

const playRegion = async ({ theme, rooms }) => {
  const store = new Map()
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }
  const { TICK } = await import('../src/config.js')
  const { save } = await import('../src/store.js')
  const { LADDER } = await import('../src/discover.js')
  const { createGame, jumpTo, step } = await import('../src/game.js')
  const { M, props } = await import('../src/materials.js')
  const { ringOf } = await import('../src/map.js')
  const { THEMES } = await import('../src/generate.js')
  save.found = [...LADDER]

  const tally = { ticks: 0, burning: 0, charged: 0, falling: 0, acid: 0, kills: {}, rocks: 0, opened: 0, fuel: 0, conductors: 0, loose: 0, cells: 0, rooms: 0, props: {}, rules: {}, matter: {} }
  const MATS = { sand: M.SAND, mud: M.MUD, snow: M.SNOW, glass: M.GLASS }
  const count = (w, wanted) => w.mat.reduce((n, m) => n + (wanted(m) ? 1 : 0), 0)

  const started = Date.now()
  for (let n = 0; n < rooms && Date.now() - started < 240000; n++) {
    const g = createGame(null, 'playing', 1 + n % 6)
    g.menus.length = 0
    g.bands = [theme, theme, theme, theme]
    g.bandFoes = g.bands.map(() => [...THEMES[theme].foes].sort(() => Math.random() - 0.5).slice(0, 5))
    const spots = Object.keys(g.map.links).map(k => k.split(',').map(Number)).filter(([x, y]) => ringOf(x, y) >= 1 && ringOf(x, y) <= 5)
    const [x, y] = spots[Math.floor(Math.random() * spots.length)]
    delete g.rooms[`${x},${y}`]
    jumpTo(g, x, y)
    const w0 = g.world
    w0.counts = {}
    for (const [name, mat] of Object.entries(MATS)) tally.matter[name] = (tally.matter[name] ?? 0) + count(w0, m => m === mat)
    tally.rooms++
    tally.fuel += count(w0, m => props(m).flammability > 0)
    tally.conductors += count(w0, m => props(m).conductance > 0)
    tally.loose += count(w0, m => props(m).falls && props(m).solid)
    tally.cells += w0.mat.length
    for (const e of g.enemies) if (e.prop) tally.props[e.kind] = (tally.props[e.kind] ?? 0) + 1
    const rockAtStart = count(w0, m => m === M.ROCK)
    const gatesAtStart = count(w0, m => m === M.GATE)

    let input = {}
    const seen = new Set()
    for (let t = 0; t < SECONDS / TICK; t++) {
      if (t % 30 === 0) {
        input = { autofire: true }
        for (const k of ['left', 'right', 'jump', 'skill', 'skill2', 'skill3', 'shoot', 'up', 'down']) if (Math.random() < 0.3) input[k] = true
        const prop = g.enemies.find(e => e.prop)
        input.aim = prop && Math.random() < 0.4
          ? { x: prop.x - g.player.x, y: prop.y - g.player.y, free: true }
          : { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, free: true }
      }
      g.player.hp = 8
      g.reveal = null
      g.menus.length = 0
      for (const e of g.enemies) seen.add(e)
      const here = g.world
      step(g, input, TICK)
      if (g.phase !== 'playing' || g.world !== here) break
      tally.ticks++
      if (here.burning > 0) tally.burning++
      if (here.charged > 0) tally.charged++
      if (here.crushing.some(v => v)) tally.falling++
      if (here.mat.includes(M.ACID)) tally.acid++
      for (const e of [...seen]) {
        if (g.enemies.includes(e) || e.hp > 0) continue
        seen.delete(e)
        if (e.friendly || e.prop) continue
        const cause = e.lastSource === 'player' ? 'gun' : e.lastCause ?? '?'
        tally.kills[cause] = (tally.kills[cause] ?? 0) + 1
      }
    }
    for (const [tag, n] of Object.entries(w0.counts)) tally.rules[tag] = (tally.rules[tag] ?? 0) + n
    tally.rocks += Math.max(0, count(g.world, m => m === M.ROCK) - rockAtStart)
    tally.opened += Math.max(0, gatesAtStart - count(g.world, m => m === M.GATE))
  }
  return tally
}

if (!isMainThread) parentPort.postMessage({ theme: workerData.theme, tally: await playRegion(workerData) })
else {
  const rooms = argOf('rooms', 60)
  const { THEMES } = await import('../src/generate.js')
  const ids = [0, 1, 2, 3, 4, 5, 6]
  const queue = [...ids]
  const results = []
  const barFile = join(homedir(), '.claude/modprogress/core-chains')
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
  const rows = results.sort((a, b) => a.theme - b.theme).map(({ theme, tally: t }) => [
    THEMES[theme].name.replace('THE ', '').padEnd(15),
    `burn ${pct(t.burning, t.ticks)}`, `charge ${pct(t.charged, t.ticks)}`, `fall ${pct(t.falling, t.ticks)}`, `acid ${pct(t.acid, t.ticks)}`,
    `| fuel ${pct(t.fuel, t.cells)}`, `conduct ${pct(t.conductors, t.cells)}`, `loose ${pct(t.loose, t.cells)}`,
    `| new rock ${(t.rocks / t.rooms).toFixed(1)}`, `gates ${(t.opened / t.rooms).toFixed(1)}`,
    `| props ${Object.entries(t.props).map(([k, v]) => `${k} ${(v / t.rooms).toFixed(2)}`).join(' ') || 'none'}`,
    `| kills ${Object.entries(t.kills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  ].join(' '))
  const minutes = t => Math.max(1e-9, (t.ticks / 60) / 60)
  const rules = results.map(({ theme, tally: t }) => [
    ''.padEnd(15),
    RULES.map(tag => `${tag} ${((t.rules[tag] ?? 0) / minutes(t)).toFixed(1)}`).join(' '),
    `| per room ${MATTER.map(name => `${name} ${((t.matter[name] ?? 0) / t.rooms).toFixed(1)}`).join(' ')}`,
  ].join(' '))
  console.log(rows.flatMap((row, i) => [row, rules[i]]).join('\n'))
}
