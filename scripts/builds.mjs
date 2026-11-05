#!/usr/bin/env node
// Forces a loadout and a region, drives it with a bot, and reports what it did.
//   node scripts/builds.mjs                                 every skill alone in every region, plus the bare gun
//   node scripts/builds.mjs --pairs ember+gust,bolt+rod     named pairs in every region
//   node scripts/builds.mjs --pairs all --rooms 2           every pair, a sweep
//   node scripts/builds.mjs --pairs ember:jet:torch+gust    forms follow the skill, separated by colons
//   node scripts/builds.mjs --forms                         each skill's four finished forms in every region
//   flags: --rooms N per cell, --ring N, --seconds N cap per room, --gunless, --nofood (bot ignores food), --starve (nothing feeds),
//          --waves (foes keep arriving near the hero, so kills measure killing power rather than walking; no clear times)
//          --regions 0,4 --seed N --workers N --out file (resume from a results file) --top N
// The bot walks to foes, shoots, and casts when a skill suits the moment. It never dodges, never sets up a
// combo on purpose and only goes looking for food when --nofood is off, so read kills per minute as
// comparative, not absolute, and treat hearts lost as what standing still in a fight costs.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, homedir } from 'node:os'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'

const parseArgs = argv => {
  const out = { rooms: 6, ring: 3, seconds: 40, seed: 1, workers: Math.max(1, cpus().length - 1), top: 14 }
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    out[key] = next === undefined || next.startsWith('--') ? true : Number.isNaN(Number(next)) ? next : Number(next)
  }
  return out
}

const seededRandom = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const hash = text => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7)

const parseLoadout = text => (text === 'gun' ? [] : text.split('+').map(token => {
  const [kind, ...forms] = token.split(':')
  return { kind, forms: forms.map(f => `${kind}.${f}`) }
}))

const worker = async () => {
  const store = {}
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } }
  const { TICK, BLOCK, ROOM, TUNING } = await import('../src/config.js')
  const { save } = await import('../src/store.js')
  const { LADDER } = await import('../src/discover.js')
  const { createGame, jumpTo, step } = await import('../src/game.js')
  const { THEMES } = await import('../src/generate.js')
  const { props } = await import('../src/materials.js')
  const { matAt } = await import('../src/world.js')
  const { createEnemy, seatEnemy } = await import('../src/enemies.js')
  const { keyOf, ringOf } = await import('../src/map.js')
  const { exitsFrom, pathTo } = await import('../src/reach.js')
  const feed = await import('../src/feed.js').catch(() => null)
  const skills = await import('../src/skills.js')
  save.found = [...LADDER]
  save.settings.controls = 'mouse'

  const cell = px => Math.floor(px / BLOCK)
  const middle = e => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 })
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const solid = (w, x, y) => x < 0 || y < 0 || x >= ROOM || y >= ROOM || props(matAt(w, x, y)).solid === true
  const lineClear = (w, a, b) => {
    const steps = Math.ceil(distance(a, b) / 4)
    for (let i = 1; i < steps; i++) if (props(matAt(w, cell(a.x + ((b.x - a.x) * i) / steps), cell(a.y + ((b.y - a.y) * i) / steps))).solid) return false
    return true
  }
  const fighting = e => !e.friendly && !e.prop && !e.ally && !e.partOf && e.hp > 0
  const targetable = e => fighting(e) && !e.intangible && !e.stowed && !e.asleep

  const REACH = {
    bolt: 150, repel: 56, ember: 110, frost: 48, hammer: 22, gust: 70, blink: 200, grapple: 125, dash: 60, mason: 40, seed: 60, spring: 50,
    acid: 110, melt: 56, alchemy: 48, well: 90, swap: 105, stop: 90, charm: 110, decoy: 120, drone: 150, rod: 70, mine: 50, roar: 60, mirror: 0, rewind: 0,
  }
  const WHEN = {
    rewind: (g, foe, bot) => g.time - bot.lastHit < 1.5,
    mirror: (g, foe, bot, me) => g.fireballs.some(b => !b.friendly && distance(b, me) < 42),
    stop: (g, foe, bot, me) => g.enemies.filter(targetable).filter(e => distance(middle(e), me) < 100).length >= 2,
    blink: (g, foe, bot, me) => foe && distance(middle(foe), me) > 80,
    drone: (g, foe) => Boolean(foe) && g.effects.filter(f => f.kind === 'drone').length < 2,
    seed: (g, foe, bot, me) => Boolean(foe) && distance(middle(foe), me) < 90,
  }

  const foodNear = (g, p, me, kinds) => {
    const tastes = kinds.flatMap(kind => feed.dietOf(p, kind).map(tag => feed.TASTES[tag]).filter(Boolean))
    if (tastes.length === 0) return null
    const [cx, cy] = [cell(me.x), cell(me.y)]
    let best = null
    let bestD = 14
    for (let y = Math.max(0, cy - 13); y < Math.min(ROOM, cy + 14); y++) {
      for (let x = Math.max(0, cx - 13); x < Math.min(ROOM, cx + 14); x++) {
        const d = Math.hypot(x - cx, y - cy)
        if (d < bestD && tastes.some(t => t.cell(g.world, y * ROOM + x))) {
          best = { x, y }
          bestD = d
        }
      }
    }
    return best
  }

  const cast = (g, bot, input, me, foe) => {
    g.player.skills.forEach((s, slot) => {
      const key = ['skill', 'skill2', 'skill3'][slot]
      const wants = WHEN[s.kind] ? WHEN[s.kind](g, foe, bot, me) : Boolean(foe) && distance(middle(foe), me) < REACH[s.kind] && lineClear(g.world, me, middle(foe))
      const hand = skills.handOf?.(g.player, s.kind) ?? { type: 'tap' }
      if (hand.type === 'stream') {
        input[key] = wants
      } else if (hand.type === 'swell') {
        const holding = (s.swell ?? 0) > 0
        input[key] = wants ? !(holding && s.swell >= hand.time * 0.7) : false
      } else if (hand.type === 'toggle') {
        input[key] = wants !== Boolean(s.flowing) && !bot.was[slot]
      } else {
        input[key] = wants && !bot.was[slot]
      }
      bot.was[slot] = input[key]
    })
  }

  const steer = (g, bot, way, input) => {
    const p = g.player
    const me = middle(p)
    const dx = (way.x + 0.5) * BLOCK - me.x
    if (Math.abs(dx) > 2.5) input[dx > 0 ? 'right' : 'left'] = true
    const here = { x: cell(me.x), y: cell(p.y + p.h - 1) }
    const rising = way.y < here.y
    const ahead = cell(me.x + Math.sign(dx) * 7)
    const wall = solid(g.world, ahead, here.y) || solid(g.world, ahead, here.y - 1)
    const gap = !solid(g.world, ahead, here.y + 1) && Math.abs(way.x - here.x) > 1 && way.y <= here.y + 1
    const swimming = props(matAt(g.world, here.x, here.y)).liquid
    if (props(matAt(g.world, here.x, here.y)).climbable) input[rising ? 'up' : 'down'] = way.y !== here.y
    else if ((rising || wall || gap || swimming) && (p.grounded || swimming)) input.jump = !bot.jumpHeld
    else if (bot.jumpHeld && p.vy < 0) input.jump = true
    bot.jumpHeld = input.jump === true
  }

  const plan = (g, bot, foe, me) => {
    const p = g.player
    const room = g.rooms[keyOf(g.x, g.y)]
    const from = { x: cell(me.x), y: cell(p.y + p.h - 1) }
    const { parent, near } = exitsFrom(g.world, room.doors, from)
    const hungry = feed?.dietOf && !bot.opts.nofood ? p.skills.filter(s => s.ready > 0.4).map(s => s.kind) : []
    const food = hungry.length ? foodNear(g, p, me, hungry) : null
    const c = food ? { x: food.x * BLOCK, y: food.y * BLOCK } : foe ? middle(foe) : me
    const goal = near({ x: cell(c.x), y: cell(c.y) }, food ? 1.5 : 3.5)
    return goal === undefined ? null : pathTo(parent, goal)
  }

  const decide = (g, bot) => {
    const input = {}
    const p = g.player
    const me = { x: p.x + p.w / 2, y: p.y + 5 }
    const foes = g.enemies.filter(targetable).sort((a, b) => distance(middle(a), me) - distance(middle(b), me))
    const foe = foes[0]
    if (foe) {
      input.pointer = middle(foe)
      input.shoot = !bot.opts.gunless && lineClear(g.world, me, middle(foe)) && distance(middle(foe), me) < 155
    }
    cast(g, bot, input, me, foe)
    if (g.time - bot.planAt > 0.5) {
      bot.path = plan(g, bot, foe ?? g.enemies.find(fighting), me)
      bot.planAt = g.time
    }
    const here = { x: cell(me.x), y: cell(p.y + p.h - 1) }
    const standoff = foe && distance(middle(foe), me) < 26
    const way = bot.path?.find(({ x, y }) => Math.hypot(x - here.x, y - here.y) >= 1.5)
    if (way && !standoff) steer(g, bot, way, input)
    if (Math.hypot(p.x - bot.stuckX, p.y - bot.stuckY) > 6) {
      bot.stuckX = p.x
      bot.stuckY = p.y
      bot.stuckAt = g.time
    }
    if (g.time - bot.stuckAt > 2 && Math.random() < 0.05) {
      input.jump = true
      input[Math.random() < 0.5 ? 'left' : 'right'] = true
    }
    return input
  }

  const spawnWave = (g, theme, opts, room) => {
    const p = g.player
    const me = middle(p)
    const from = { x: cell(me.x), y: cell(p.y + p.h - 1) }
    const { parent } = exitsFrom(g.world, room.doors, from)
    const spots = [...parent.keys()].map(k => ({ x: k % ROOM, y: Math.floor(k / ROOM) }))
      .filter(c => solid(g.world, c.x, c.y + 1) && Math.hypot(c.x - from.x, c.y - from.y) > 5 && Math.hypot(c.x - from.x, c.y - from.y) < 16)
    const at = spots[Math.floor(Math.random() * spots.length)]
    if (!at) return
    const roster = g.bandFoes[0]
    const e = createEnemy({ kind: roster[Math.floor(Math.random() * roster.length)], x: at.x * BLOCK, row: at.y + 1 })
    e.hp = Math.ceil(e.hp * (1 + opts.ring * TUNING.run.hpPerRing))
    g.enemies.push(e)
  }

  const playRoom = (loadout, theme, opts, tally) => {
    const g = createGame(null, 'playing', opts.ring)
    g.menus.length = 0
    g.bands = [theme, theme, theme, theme]
    g.bandFoes = g.bands.map(t => THEMES[t].foes.slice(0, 7))
    g.omen = null
    const wardens = new Set(Object.keys(g.wardenAt ?? {}))
    const spots = Object.keys(g.map.links).filter(k => !wardens.has(k)).map(k => k.split(',').map(Number)).filter(([x, y]) => ringOf(x, y) === opts.ring)
    const [x, y] = spots[Math.floor(Math.random() * spots.length)]
    delete g.rooms[keyOf(x, y)]
    const p = g.player
    p.skills = loadout.map(({ kind }) => ({ kind, ready: 0 }))
    p.upgrades = new Set(loadout.flatMap(l => l.forms))
    p.relics = new Set()
    p.fireproof = p.insulated = p.smokeproof = false
    jumpTo(g, x, y)
    g.reveal = null
    g.menus.length = 0
    g.pendingOffers = 0
    const foesAtStart = g.enemies.filter(fighting).length
    if (foesAtStart === 0) return false
    const bot = { opts, was: [], planAt: -1, path: null, lastHit: -9, stuckX: 0, stuckY: 0, stuckAt: 0, jumpHeld: false }
    const seen = new Set(g.enemies)
    const counted = new WeakSet()
    const here = g.world
    let hp = p.hp
    const prev = p.skills.map(() => 0)
    tally.rooms += 1
    let t = 0
    for (; t < opts.seconds / TICK; t++) {
      g.reveal = null
      g.menus.length = 0
      g.pendingOffers = 0
      g.cards = []
      g.wares = []
      if (opts.waves && t % 60 === 0 && g.enemies.filter(fighting).length < TUNING.run.foeLimit[opts.ring]) spawnWave(g, theme, opts, g.rooms[keyOf(g.x, g.y)])
      p.hp = Math.max(p.hp, 1)
      const input = decide(g, bot)
      step(g, input, TICK)
      if (g.world !== here || g.phase !== 'playing') {
        if (g.phase !== 'playing') tally.deaths += 1
        break
      }
      if (p.hp < hp) {
        tally.hits += hp - p.hp
        bot.lastHit = g.time
      }
      p.hp = TUNING.player.hp
      hp = p.hp
      p.skills.forEach((s, i) => {
        if (s.casts === undefined && s.ready > prev[i] + 0.01) tally.casts[s.kind] = (tally.casts[s.kind] ?? 0) + 1
        if (s.casts !== undefined) {
          tally.casts[s.kind] = (tally.casts[s.kind] ?? 0) + s.casts - prev[i]
          prev[i] = s.casts
        } else prev[i] = s.ready
        tally.fedTicks[s.kind] = (tally.fedTicks[s.kind] ?? 0) + (s.fed ?? 0)
      })
      for (const e of g.enemies) seen.add(e)
      for (const e of [...seen]) {
        if (e.hp > 0 || counted.has(e)) continue
        counted.add(e)
        if (e.friendly || e.prop || e.partOf) continue
        tally.kills += 1
        if (e.lastSource !== 'player') tally.worldKills += 1
      }
      if (!opts.waves && !g.enemies.some(fighting)) {
        tally.cleared += 1
        tally.clearSeconds += t * TICK
        break
      }
    }
    tally.ticks += t
    return true
  }

  parentPort.on('message', ({ id, loadout: text, theme, opts }) => {
    if (opts.starve && TUNING.feed) {
      Object.keys(TUNING.feed.gain).forEach(k => { TUNING.feed.gain[k] = 0 })
      Object.keys(TUNING.feed.refund).forEach(k => { TUNING.feed.refund[k] = 0 })
    }
    Math.random = seededRandom(opts.seed * 1000003 + hash(`${text}|${theme}`))
    const loadout = parseLoadout(text)
    const tally = { rooms: 0, ticks: 0, kills: 0, worldKills: 0, hits: 0, cleared: 0, clearSeconds: 0, deaths: 0, casts: {}, fedTicks: {} }
    let error = null
    try {
      let tries = 0
      while (tally.rooms < opts.rooms && tries++ < opts.rooms * 4) playRoom(loadout, theme, opts, tally)
    } catch (err) {
      error = `${err.message} :: ${(err.stack ?? '').split('\n').slice(1, 4).map(s => s.trim()).join(' < ')}`
    }
    parentPort.postMessage({ id, loadout: text, theme, tally, error })
  })
}

const FORMS_OF = FORKS => Object.entries(FORKS).flatMap(([kind, [a, b]]) => a.flatMap(x => b.map(y => `${kind}:${x.id.split('.')[1]}:${y.id.split('.')[1]}`)))

const rate = (n, seconds) => (seconds > 0 ? (60 * n) / seconds : 0)
const seconds = t => t.ticks / 60
const kpm = t => rate(t.kills, seconds(t))
const hpm = t => rate(t.hits, seconds(t))
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
const pad = (v, n = 6) => String(v).padStart(n)
const f1 = v => v.toFixed(1)

const report = (results, regions, names, opts) => {
  const lines = []
  const at = (loadout, theme) => results.find(r => r.loadout === loadout && r.theme === theme)?.tally
  const gun = Object.fromEntries(regions.map(t => [t, at('gun', t) ? kpm(at('gun', t)) : null]))
  const loadouts = [...new Set(results.map(r => r.loadout))]
  const errors = results.filter(r => r.error)
  lines.push(`\n${results.length} cells, ${errors.length} with errors`)
  errors.slice(0, 8).forEach(r => lines.push(`  ${r.loadout} in ${r.theme}: ${r.error}`))
  const short = t => names[t].replace('THE ', '').slice(0, 7)
  lines.push(`\nkills per minute (world kill share in the totals)\n${'loadout'.padEnd(26)}${regions.map(t => pad(short(t), 8)).join('')}    mean  spread`)
  const rows = loadouts.map(l => {
    const cells = regions.map(t => at(l, t))
    const kills = cells.map(c => (c ? kpm(c) : 0))
    return { l, kills, avg: mean(kills), spread: Math.max(...kills) / Math.max(0.5, Math.min(...kills)), cells }
  }).sort((a, b) => b.avg - a.avg)
  rows.slice(0, opts.limit ?? 400).forEach(r => lines.push(`${r.l.padEnd(26)}${r.kills.map(k => pad(f1(k), 8)).join('')}  ${pad(f1(r.avg))}  ${pad(f1(r.spread))}`))
  const total = t => regions.map(r => at(t, r)).filter(Boolean)
  const castsPerMinute = c => (c ? rate(Object.values(c.casts).reduce((a, b) => a + b, 0), seconds(c)) : 0)
  const fedShare = c => (c ? (100 * Math.max(0, ...Object.values(c.fedTicks))) / Math.max(1, c.ticks) : 0)
  lines.push(`\ncasts per minute by region, then the most-fed skill's mean fullness (0 to 100)`)
  rows.filter(r => r.l !== 'gun').forEach(({ l, cells }) => lines.push(`${l.padEnd(26)}${cells.map(c => pad(castsPerMinute(c).toFixed(0), 5)).join('')}   |${cells.map(c => pad(fedShare(c).toFixed(0), 4)).join('')}`))
  lines.push(`\nper loadout: seconds to clear, share of rooms cleared, hearts lost per minute, casts per minute and mean fullness per skill`)
  rows.forEach(({ l }) => {
    const cells = total(l)
    const sum = key => cells.reduce((n, c) => n + c[key], 0)
    const s = sum('ticks') / 60
    const kinds = [...new Set(cells.flatMap(c => [...Object.keys(c.casts), ...Object.keys(c.fedTicks)]))]
    const per = kinds.map(k => `${k} ${f1(rate(cells.reduce((n, c) => n + (c.casts[k] ?? 0), 0), s))}/${((100 * cells.reduce((n, c) => n + (c.fedTicks[k] ?? 0), 0)) / Math.max(1, sum('ticks'))).toFixed(0)}%`).join(' ')
    lines.push(`${l.padEnd(26)} clear ${pad(f1(sum('clearSeconds') / Math.max(1, sum('cleared'))), 5)}s ${pad(`${((100 * sum('cleared')) / Math.max(1, sum('rooms'))).toFixed(0)}%`, 4)}  hearts ${pad(f1(rate(sum('hits'), s)), 5)}  world ${pad(`${((100 * sum('worldKills')) / Math.max(1, sum('kills'))).toFixed(0)}%`, 4)}  ${per}`)
  })
  if (Object.values(gun).some(v => v !== null)) {
    lines.push(`\nkills per minute against the bare gun in the same region, best cells first`)
    const cells = results.filter(r => r.loadout !== 'gun').map(r => ({ ...r, kpm: kpm(r.tally), over: kpm(r.tally) / Math.max(0.5, gun[r.theme] ?? 1) }))
    cells.sort((a, b) => b.over - a.over).slice(0, opts.top).forEach(c => {
      const elsewhere = regions.filter(t => t !== c.theme).map(t => at(c.loadout, t)).filter(Boolean).map(x => kpm(x))
      lines.push(`${c.loadout.padEnd(26)} in ${short(c.theme).padEnd(8)} ${f1(c.kpm).padStart(5)} kpm, x${f1(c.over)} the gun; mean elsewhere ${f1(mean(elsewhere))}`)
    })
    const singles = rows.filter(r => r.l !== 'gun').map(r => {
      const overs = regions.map((t, i) => r.kills[i] / Math.max(0.5, gun[t] ?? 1))
      return { l: r.l, overs, best: Math.max(...overs), worst: Math.min(...overs), wins: overs.filter(o => o > 1.5).length }
    })
    lines.push(`\nabove x1.5 the gun in every region: ${singles.filter(s => s.worst > 1.5).map(s => s.l).join(', ') || 'none'}`)
    lines.push(`never above x1.2 the gun anywhere: ${singles.filter(s => s.best < 1.2).map(s => s.l).join(', ') || 'none'}`)
  }
  return lines.join('\n')
}

const main = async () => {
  const opts = parseArgs(process.argv.slice(2))
  const { SKILLS, FORKS } = await (async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    return import('../src/skills.js')
  })()
  const { THEMES } = await import('../src/generate.js')
  const kinds = Object.keys(SKILLS)
  const regions = typeof opts.regions === 'string' ? opts.regions.split(',').map(Number) : typeof opts.regions === 'number' ? [opts.regions] : [0, 1, 2, 3, 4, 5, 6]
  const allPairs = kinds.flatMap((a, i) => kinds.slice(i + 1).map(b => `${a}+${b}`))
  const wanted = opts.pairs === 'all' ? allPairs : typeof opts.pairs === 'string' ? opts.pairs.split(',') : opts.forms ? FORMS_OF(FORKS) : kinds
  const loadouts = ['gun', ...wanted]
  const cells = loadouts.flatMap(loadout => regions.map(theme => ({ loadout, theme })))
  const results = []
  if (opts.out && existsSync(opts.out)) {
    for (const line of readFileSync(opts.out, 'utf8').split('\n').filter(Boolean)) results.push(JSON.parse(line))
  }
  const done = new Set(results.map(r => `${r.loadout}|${r.theme}`))
  const queue = cells.filter(c => !done.has(`${c.loadout}|${c.theme}`)).map((c, id) => ({ ...c, id }))
  const total = queue.length
  const started = Date.now()
  const barFile = `${homedir()}/.claude/modprogress/core-builds`
  mkdirSync(`${homedir()}/.claude/modprogress`, { recursive: true })
  let finished = 0
  const say = () => {
    const secs = (Date.now() - started) / 1000
    const left = finished ? ((total - finished) * secs) / finished : NaN
    process.stdout.write(`${finished}/${total} cells, ${(finished / Math.max(1, secs) * 60).toFixed(0)} per minute, ${Number.isFinite(left) ? `${left.toFixed(0)}s left` : 'starting'}\n`)
    writeFileSync(barFile, `${finished} ${total} cells\n`)
  }
  const beat = setInterval(say, 10000)
  await Promise.all(Array.from({ length: Math.min(opts.workers, Math.max(1, total)) }, () => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { role: 'cell' } })
    const next = () => {
      const job = queue.shift()
      if (!job) {
        w.terminate().then(resolve)
        return
      }
      w.postMessage({ ...job, opts })
    }
    w.on('message', r => {
      results.push(r)
      if (opts.out) appendFileSync(opts.out, `${JSON.stringify(r)}\n`)
      finished += 1
      next()
    })
    w.on('error', err => {
      process.stdout.write(`worker failed: ${err.stack}\n`)
      reject(err)
    })
    next()
  })))
  clearInterval(beat)
  say()
  writeFileSync(barFile, `${total} ${total} cells\n`)
  process.stdout.write(`${report(results.filter(r => loadouts.includes(r.loadout) && regions.includes(r.theme)), regions, Object.fromEntries(THEMES.map((t, i) => [i, t.name])), opts)}\n`)
}

if (isMainThread) await main()
else await worker(workerData)
