#!/usr/bin/env node
// Plays many headless runs with a simple bot and reports how the game behaves.
//   node scripts/soak.mjs --runs 40
//   node scripts/soak.mjs --runs 40 --god           never die, tests structure and softlocks
//   node scripts/soak.mjs --runs 40 --found rand    random progress along the ladder, exercises all content
//   node scripts/soak.mjs --runs 20 --career        one save carried across runs
//   node scripts/soak.mjs --warden bellows --gun    duels one warden, gun only
//   node scripts/soak.mjs --runs 12 --god --express --deeper --loops 2   skips walking to reach the Core, goes deeper
//   flags: --seed N --workers N --minutes N (sim limit per run) --omen id --ring N (quickstart)
//          --deeper always takes the deeper option, --stop always banks, otherwise the bot picks at random
//          --express warps to the next Warden, --loops N stops going deeper after N loops, --keystone id forces one
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir, cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

const parseArgs = argv => {
  const out = { runs: 20, seed: 1, workers: Math.max(1, cpus().length - 2), minutes: 45, found: '0' }
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

const worker = async ({ opts, from, to }) => {
  const store = {}
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } }
  const { createGame, step, jumpTo, takeKeystone } = await import('../src/game.js')
  const { save } = await import('../src/store.js')
  const { LADDER } = await import('../src/discover.js')
  const { props, M } = await import('../src/materials.js')
  const { matAt, setCell } = await import('../src/world.js')
  const { TUNING } = await import('../src/config.js')
  const { CORE_RING, keyOf, ringOf } = await import('../src/map.js')
  const { doorGoal, exitsFrom, pathTo } = await import('../src/reach.js')
  const { heartCap } = await import('../src/keystones.js')

  const TICK = 1 / 60
  const BLOCK = 8
  const ROOM = 28
  const cell = px => Math.floor(px / BLOCK)
  save.settings.controls = 'mouse'

  const solid = (w, x, y) => x < 0 || y < 0 || x >= ROOM || y >= ROOM || props(matAt(w, x, y)).solid === true

  const routeTo = (g, target, avoid) => {
    const start = keyOf(g.x, g.y)
    const prev = new Map([[start, null]])
    const queue = [[g.x, g.y]]
    while (queue.length) {
      const [x, y] = queue.shift()
      const key = keyOf(x, y)
      if (target(x, y)) {
        let k = key
        let first = null
        while (prev.get(k)) { first = prev.get(k).dir; k = prev.get(k).from }
        return first
      }
      for (const [dir, link] of Object.entries(g.map.links[key] ?? {})) {
        const next = keyOf(...link.to)
        if (prev.has(next) || avoid.has(`${key}:${dir}`)) continue
        if (link.lock === 'seal' && g.seals < 3) continue
        prev.set(next, { from: key, dir })
        queue.push(link.to)
      }
    }
    return null
  }

  const liveWarden = g => Object.values(g.wardens).find(w => !w.dead)

  const chooseDirection = (g, bot, avoid) => {
    const ring = g.deepestRing
    const here = keyOf(g.x, g.y)
    const quota = bot.ringQuota[ring] ??= 2 + Math.floor(Math.random() * 4)
    const seenHere = Object.values(g.rooms).filter(r => r.ring === ring && r.visited).length
    const warden = liveWarden(g)
    if (warden && (seenHere >= 2 || ring >= 6 || warden.x !== undefined)) {
      const dir = routeTo(g, (x, y) => x === warden.x && y === warden.y, avoid)
      if (dir) return dir
    }
    if (seenHere < quota) {
      const dir = routeTo(g, (x, y) => ringOf(x, y) === ring && !g.rooms[keyOf(x, y)]?.visited, avoid)
      if (dir) return dir
    }
    const inward = routeTo(g, (x, y) => ringOf(x, y) > ring, avoid)
    if (inward) return inward
    const next = routeTo(g, (x, y) => keyOf(x, y) !== here && !g.rooms[keyOf(x, y)]?.visited, avoid)
    if (next) return next
    bot.avoid.clear()
    bot.forceRing = ring
    return routeTo(g, (x, y) => ringOf(x, y) > ring, avoid) ?? Object.keys(g.map.links[here] ?? {})[0]
  }

  const lineClear = (w, a, b) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4)
    for (let i = 1; i < steps; i++) if (props(matAt(w, cell(a.x + ((b.x - a.x) * i) / steps), cell(a.y + ((b.y - a.y) * i) / steps))).solid) return false
    return true
  }

  const middle = e => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 })

  const targetFor = (g, bot, me) => {
    const living = g.enemies.filter(e => !e.friendly && !e.ally && !e.intangible && !e.plated && !e.stowed && !e.asleep && e.hp > 0 && !e.partOf)
    const seen = living.map(e => [Math.hypot(middle(e).x - me.x, middle(e).y - me.y), e]).filter(([d, e]) => d < 155 && lineClear(g.world, me, middle(e))).sort((a, b) => a[0] - b[0])
    const foe = seen[0]?.[1]
    if (bot.opts.gun !== true || bot.opts.lamps === true) {
      const lamp = g.enemies.find(e => e.prop && lineClear(g.world, me, middle(e)) && Math.hypot(middle(e).x - me.x, middle(e).y - me.y) < 150
        && living.some(f => Math.abs(middle(f).x - middle(e).x) < 28 && middle(f).y > middle(e).y))
      if (lamp && Math.random() < 0.5) return lamp
    }
    return foe
  }

  const CHARS = { [M.EMPTY]: '.', [M.BEDROCK]: '#', [M.ROCK]: 'R', [M.MOSS]: 'm', [M.PEAT]: 'p', [M.WOOD]: 'w', [M.METAL]: 'M', [M.GATE]: 'G', [M.SAND]: 's', [M.ASH]: ',', [M.WATER]: '~', [M.SMOKE]: ':', [M.STEAM]: ':', [M.SCRAP]: 'S', [M.VOLATILE]: 'V', [M.ICE]: 'I', [M.OIL]: 'o', [M.METHANE]: ':', [M.BRICK]: 'B', [M.LAVA]: 'L', [M.VINE]: 'v', [M.ACID]: 'A', [M.SOURCE]: 'W' }
  const asciiRoom = (g, room, from) => [
    `${room.layout} ring ${room.ring} event ${room.event} doors ${JSON.stringify(room.doors)} links ${Object.entries(room.links).map(([d, l]) => `${d}:${l.lock}`)} player ${from.x},${from.y} passed ${room.passed} cleared ${room.cleared}`,
    ...Array.from({ length: ROOM }, (_, y) => Array.from({ length: ROOM }, (_, x) => (x === from.x && y === from.y ? '@' : CHARS[matAt(g.world, x, y)])).join('')),
  ].join('\n')

  const expressRings = g => (g.loop ? TUNING.run.deep.wardenRings : TUNING.run.wardenRings)

  const nextStop = g => {
    if (g.seals >= 3) return [CORE_RING, CORE_RING]
    const ring = expressRings(g).find(r => !g.wardens[r]?.dead)
    const placed = g.wardens[ring]
    if (placed) return [placed.x, placed.y]
    const cells = Object.keys(g.map.links).map(key => key.split(',').map(Number)).filter(([x, y]) => ringOf(x, y) === ring)
    return cells[Math.floor(Math.random() * cells.length)]
  }

  const warp = (g, bot) => {
    if (!bot.opts.express || g.door || g.reveal || g.menus.length) return
    const room = g.rooms[keyOf(g.x, g.y)]
    if (room.sealed || (room.arena && !room.cleared)) return
    if (g.time - bot.enteredAt < 1.5) return
    const [x, y] = nextStop(g)
    if (x === g.x && y === g.y) return
    bot.enteredAt = g.time
    jumpTo(g, x, y)
  }

  const newBot = (g, opts) => ({
    opts, ringQuota: {}, plan: null, planAt: -1, room: null, enteredAt: 0, stuckAt: 0, stuckX: 0, stuckY: 0,
    avoid: new Set(), jumpHeld: false, skillClock: 0, bombClock: 0, softlocks: 0, softRooms: new Set(), assists: 0,
  })

  const planRoom = (g, bot, stats) => {
    const p = g.player
    const room = g.rooms[keyOf(g.x, g.y)]
    const from = { x: cell(middle(p).x), y: cell(p.y + p.h - 1) }
    const { parent, near, anchors, open: exitsOpen, locked: exitsLocked } = exitsFrom(g.world, room.doors, from)
    const isStart = keyOf(g.x, g.y) === keyOf(...g.map.start)
    if (!room.sealed && !isStart && exitsOpen.length === 0 && exitsLocked.length === 0 && g.time - bot.enteredAt > 2 && !bot.softRooms.has(room)) {
      bot.softRooms.add(room)
      bot.softlocks += 1
      stats.softlockRooms.push(`${room.layout}@${room.ring}:${room.event ?? '-'}:${Object.keys(room.doors).join('')}:${room.cleared ? 'after' : 'fresh'}`)
      if (stats.softMaps.length < 2) stats.softMaps.push(`reach ${parent.size} anchors ${JSON.stringify(anchors)}\n${asciiRoom(g, room, from)}`)
    }
    const dir = chooseDirection(g, bot, bot.avoid)
    const chosen = anchors.find(a => a.dir === dir)
    const usable = chosen && (chosen.locked ? near(chosen, 4) !== undefined : parent.has(chosen.y * ROOM + chosen.x))
    if (chosen && !usable && !room.noRoute) {
      room.noRoute = true
      stats.noRoute.push(`${room.layout}:${Object.keys(room.doors).join('')}`)
    }
    const wanted = chosen
    const errands = [...g.cards.map(c => ({ c, kind: 'card' })), ...g.wares.filter(w => w.price <= g.gold && (bot.opts.gun !== true)).map(c => ({ c, kind: 'ware' })), ...g.pickups.map(c => ({ c, kind: 'pickup' })), ...g.enemies.filter(e => e.friendly && !e.prop && !e.spent).map(c => ({ c, kind: 'talk' }))]
    const errand = errands
      .map(({ c }) => near({ x: cell(c.x + c.w / 2), y: cell(c.y + c.h - 1) }, 1.5))
      .find(k => k !== undefined && !bot.gaveUp?.has(k))
    return { parent, near, wanted, dir, errand, anchors, exitsOpen }
  }

  const clearDoorAndGo = (g, bot, dir) => {
    const room = g.rooms[keyOf(g.x, g.y)]
    const door = room.doors[dir]
    if (!door) return
    bot.assists += 1
    const goal = doorGoal(dir, door)
    for (const [x, y] of dir === 'left' || dir === 'right'
      ? [[0, door.row], [0, door.row + 1], [1, door.row], [1, door.row + 1], [ROOM - 1, door.row], [ROOM - 1, door.row + 1], [ROOM - 2, door.row], [ROOM - 2, door.row + 1]].filter(([x]) => (dir === 'left') === (x < 5))
      : [[door.col, 0], [door.col + 1, 0], [door.col, 1], [door.col + 1, 1], [door.col, ROOM - 1], [door.col + 1, ROOM - 1], [door.col, ROOM - 2], [door.col + 1, ROOM - 2]].filter(([, y]) => (dir === 'up') === (y < 5))) {
      if (matAt(g.world, x, y) !== M.BEDROCK || x === 0 || y === 0 || x === ROOM - 1 || y === ROOM - 1) setCell(g.world, x, y, M.EMPTY)
    }
    const p = g.player
    p.x = dir === 'left' ? 0.2 : dir === 'right' ? ROOM * BLOCK - p.w - 0.2 : goal.x * BLOCK + 1
    p.y = dir === 'up' ? 0.2 : dir === 'down' ? ROOM * BLOCK - p.h - 0.2 : (door.row + 2) * BLOCK - p.h
    p.vx = 0
    p.vy = 0
  }

  const steer = (g, bot, way, input) => {
    const p = g.player
    const me = middle(p)
    const gx = (way.x + 0.5) * BLOCK
    const dx = gx - me.x
    if (Math.abs(dx) > 2.5) input[dx > 0 ? 'right' : 'left'] = true
    const here = { x: cell(me.x), y: cell(p.y + p.h - 1) }
    const rising = way.y < here.y
    const ahead = cell(me.x + Math.sign(dx) * 7)
    const wall = solid(g.world, ahead, here.y) || solid(g.world, ahead, here.y - 1)
    const gap = !solid(g.world, ahead, here.y + 1) && Math.abs(way.x - here.x) > 1 && way.y <= here.y + 1
    const swimming = props(matAt(g.world, here.x, here.y)).liquid
    const wantsJump = rising || wall || gap || swimming
    const onVine = matAt(g.world, here.x, here.y) === M.VINE
    if (onVine) input[rising ? 'up' : 'down'] = way.y !== here.y
    else if (wantsJump && (p.grounded || swimming)) input.jump = !bot.jumpHeld
    else if (bot.jumpHeld && p.vy < 0) input.jump = true
    bot.jumpHeld = input.jump === true
  }

  const decide = (g, bot, stats) => {
    const input = {}
    const p = g.player
    const me = { x: p.x + p.w / 2, y: p.y + 5 }
    const room = g.rooms[keyOf(g.x, g.y)]
    if (bot.room !== room) {
      room.botVisits = (room.botVisits ?? 0) + 1
      if (room.botVisits > 8) stats.loops[`${room.layout}:${Object.keys(room.doors).join('')}:${room.sealed ? 'sealed' : room.cleared ? 'cleared' : 'open'}`] = room.botVisits
      if (bot.opts.trace) console.log(`t=${g.time.toFixed(0)} room ${g.x},${g.y} ring ${g.ring} ${room.layout} event=${room.event} doors=${Object.keys(room.doors)} locks=${Object.entries(room.links).map(([d, l]) => `${d}:${l.lock}`)} wardens=${JSON.stringify(g.wardens)} seals=${g.seals} hp=${p.hp}`)
      bot.room = room
      bot.enteredAt = g.time
      bot.plan = null
      room.botDone ??= new Set()
      bot.gaveUp = room.botDone
      bot.stuckAt = g.time
    }
    const wantedLock = bot.plan?.wanted?.locked && room.links[bot.plan.wanted.dir]?.lock === 'peat'
    const lampForLock = wantedLock ? g.enemies.find(e => e.prop && lineClear(g.world, me, middle(e))) : null
    const target = lampForLock ?? targetFor(g, bot, me)
    if (target) {
      input.pointer = middle(target)
      input.shoot = true
      if (bot.opts.gun !== true && p.skills.length) {
        bot.skillClock -= TICK
        if (bot.skillClock <= 0) {
          bot.skillClock = 0.9
          input[['skill', 'skill2', 'skill3', 'skill4'][Math.floor(Math.random() * p.skills.length)]] = true
        }
      }
    }
    if (room.sealed || (room.arena && !room.cleared && !room.sealed)) {
      const boss = g.enemies.find(e => e.warden)
      if (boss) {
        const c = middle(boss)
        input.pointer = target ? input.pointer : c
        if (!room.sealed) {
          bot.enteredAt = g.time
          if (p.y + p.h > room.arena.interior.y1) {
            input.jump = !bot.jumpHeld
            bot.jumpHeld = input.jump
          }
          const dx = (ROOM * BLOCK) / 2 - p.x
          if (Math.abs(dx) > 4) input[dx > 0 ? 'right' : 'left'] = true
          if (!p.grounded && p.vy < 0) input.jump = true
          else if (p.grounded && Math.random() < 0.05) input.jump = true
          if (p.y < room.arena.interior.y0) input.down = false
          return input
        }
        bot.enteredAt = g.time
        const dist = Math.abs(c.x - me.x)
        if (bot.opts.trace && Math.floor(g.time * 60) % 300 === 0) console.log(`  boss ${boss.kind} hp=${boss.hp} phase=${boss.phase} shield=${boss.shield} stage=${boss.stage}/${boss.move} at ${boss.x.toFixed(0)},${boss.y.toFixed(0)} me ${me.x.toFixed(0)},${me.y.toFixed(0)} clear=${lineClear(g.world, me, c)} shots=${g.shots.length}`)
        const away = c.x < me.x ? 'right' : 'left'
        const near = c.x < me.x ? 'left' : 'right'
        const blocked = !lineClear(g.world, me, c)
        if (p.hitWall) bot.sidestep = -(bot.sidestep ?? 1)
        if (blocked || (p.hitWall && dist < 50)) input[(bot.sidestep ?? 1) > 0 ? 'right' : 'left'] = true
        else if (p.keystones.has('fists')) input[near] = dist > 8
        else if (dist < 50) input[away] = true
        else if (dist > 110) input[near] = true
        else if (Math.random() < 0.02) input[Math.random() < 0.5 ? 'left' : 'right'] = true
        if (p.grounded && !bot.jumpHeld && (p.hitWall || Math.random() < 0.03 || g.fireballs.some(f => f.wave && Math.abs(f.x - me.x) < 22))) input.jump = true
        else if (bot.jumpHeld && p.vy < 0) input.jump = true
        if (props(matAt(g.world, cell(me.x), cell(p.y + p.h - 1))).liquid) input.jump = !bot.jumpHeld
        bot.jumpHeld = input.jump === true
        input.shoot = lineClear(g.world, me, input.pointer) && Math.hypot(input.pointer.x - me.x, input.pointer.y - me.y) < 160
        return input
      }
    }
    if (room.sealed) {
      bot.enteredAt = g.time
      bot.stuckAt = g.time
      const foe = g.enemies.find(e => !e.friendly && !e.ally && !e.partOf)
      if (foe && !target) {
        const dx = middle(foe).x - me.x
        if (Math.abs(dx) > 10) input[dx > 0 ? 'right' : 'left'] = true
      }
      if (p.grounded && !bot.jumpHeld && (p.hitWall || Math.random() < 0.04)) input.jump = true
      else if (bot.jumpHeld && p.vy < 0) input.jump = true
      bot.jumpHeld = input.jump === true
      return input
    }
    if (g.time - bot.planAt > 0.4 || !bot.plan) {
      bot.plan = planRoom(g, bot, stats)
      bot.planAt = g.time
      if (bot.opts.trace === 2 && room.arena) console.log(`    arena sealed=${room.sealed} cleared=${room.cleared} enemies=${g.enemies.map(e => `${e.kind}:${e.hp}:${e.asleep}`)} p=${p.x.toFixed(0)},${p.y.toFixed(0)}`)
      if (bot.opts.trace === 2) console.log(`    plan dir=${bot.plan.dir} wanted=${JSON.stringify(bot.plan.wanted)} errand=${bot.plan.errand} at ${cell(p.x)},${cell(p.y)} vy=${p.vy.toFixed(0)} reach=${bot.plan.parent.size} avoid=${[...bot.avoid]}`)
    }
    const { parent, near, wanted, errand } = bot.plan
    if (bot.opts.trace === 3 && g.time - bot.enteredAt < 0.5) console.log(`      ${g.x},${g.y} p ${p.x.toFixed(1)},${p.y.toFixed(1)} v ${p.vx.toFixed(0)},${p.vy.toFixed(0)} g=${p.grounded}`)
    const lingering = target && g.time - bot.enteredAt < 7
    const from = { x: cell(middle(p).x), y: cell(p.y + p.h - 1) }
    const goalKey = errand !== undefined && g.time - bot.enteredAt < 14
      ? errand
      : wanted && !wanted.locked && parent.has(wanted.y * ROOM + wanted.x) ? wanted.y * ROOM + wanted.x
        : wanted ? near(wanted, 4) : undefined
    if (Math.hypot(p.x - bot.stuckX, p.y - bot.stuckY) > 6) {
      bot.stuckX = p.x
      bot.stuckY = p.y
      bot.stuckAt = g.time
    }
    const stuckFor = g.time - bot.stuckAt
    if (goalKey === undefined && wanted === undefined) return input
    const path = goalKey === undefined ? [] : pathTo(parent, goalKey)
    const way = path[1] ?? path[0]
    const atGoal = goalKey !== undefined && Math.hypot(goalKey % ROOM - from.x, Math.floor(goalKey / ROOM) - from.y) <= 1.5
    if (errand !== undefined && goalKey === errand && atGoal) bot.gaveUp.add(errand)
    if (wanted && goalKey !== errand && atGoal) {
      if (wanted.locked) {
        const point = { x: (wanted.x + 0.5) * BLOCK, y: (wanted.y + 0.5) * BLOCK }
        input.pointer = point
        input.shoot = true
        bot.bombClock -= TICK
        if (p.bombs > 0 && bot.bombClock <= 0 && bot.opts.gun !== true) {
          input.bomb = true
          bot.bombClock = 1
        } else if (p.bombs === 0 && stuckFor > 4) {
          bot.stuckAt = g.time
          bot.plan = null
          if (bot.forceRing === g.deepestRing) {
            stats.lockedOut += 1
            stats.assistWhy.push(`${room.layout}:lockedout:${room.links[wanted.dir]?.lock}`)
            clearDoorAndGo(g, bot, wanted.dir)
          } else bot.avoid.add(`${keyOf(g.x, g.y)}:${wanted.dir}`)
        }
        return input
      }
      const push = { left: 'left', right: 'right' }[wanted.dir]
      if (push) input[push] = true
      if (wanted.dir === 'up') input.jump = !bot.jumpHeld
      bot.jumpHeld = input.jump === true
      if (wanted.dir === 'down' && p.grounded) input[Math.random() < 0.5 ? 'left' : 'right'] = true
    } else if (way && !(lingering && target && Math.random() < 0.4)) steer(g, bot, way, input)
    if (p.y < 18 && wanted?.dir !== 'up') input.jump = false
    if (stuckFor > 2 && Math.random() < 0.05) {
      input.jump = true
      input[Math.random() < 0.5 ? 'left' : 'right'] = true
    }
    const hopeless = wanted && !wanted.locked && !parent.has(wanted.y * ROOM + wanted.x) && g.time - bot.enteredAt > 10
    const overdue = hopeless || g.time - bot.enteredAt > (keyOf(g.x, g.y) === keyOf(...g.map.start) ? 25 : 35)
    if ((stuckFor > 9 || overdue) && wanted) {
      if (bot.opts.trace) console.log(`  t=${g.time.toFixed(0)} assist ${wanted.dir} stuck=${stuckFor.toFixed(0)} overdue=${overdue} locked=${wanted.locked} goal=${goalKey} at ${from.x},${from.y} errand=${errand} reach=${parent.size}`)
      stats.assistWhy.push(`${room.layout}:${room.sealed ? 'sealed' : wanted.locked ? 'locked' : parent.has(wanted.y * ROOM + wanted.x) ? 'route' : 'noroute'}:${overdue ? 'late' : 'still'}`)
      clearDoorAndGo(g, bot, wanted.dir)
      bot.stuckAt = g.time
    }
    return input
  }

  const sane = v => Number.isFinite(v)
  const insane = g => {
    const p = g.player
    if (![p.x, p.y, p.vx, p.vy, p.hp].every(sane)) return `player ${JSON.stringify([p.x, p.y, p.vx, p.vy, p.hp])}`
    const e = g.enemies.find(e => ![e.x, e.y, e.hp].every(sane))
    if (e) return `enemy ${e.kind} ${JSON.stringify([e.x, e.y, e.hp, e.vx, e.vy])}`
    const f = g.fireballs.find(f => ![f.x, f.y].every(sane))
    if (f) return `fireball ${JSON.stringify(f)}`
    return null
  }

  const answerChoice = (g, menu, opts) => {
    const stopNow = opts.stop === true || (opts.loops !== undefined && g.loop >= opts.loops)
    const pick = stopNow ? 'stop' : opts.deeper === true ? 'deeper' : Math.random() < 0.5 ? 'stop' : 'deeper'
    menu.items.find(item => item.id === pick).run(g)
  }

  const answerMenu = (g, opts) => {
    const menu = g.menus.at(-1)
    if (!menu) return
    if (menu.page === 'choice') {
      answerChoice(g, menu, opts)
      return
    }
    const real = menu.items.filter(i => !/NOT NOW|NOT TODAY/.test(i.card?.name ?? ''))
    const choice = real[Math.floor(Math.random() * real.length)] ?? menu.items[0]
    choice.run(g)
  }

  const setSave = (opts, career) => {
    if (career) return
    const count = opts.found === 'rand' ? Math.floor(Math.random() * (LADDER.length + 1)) : opts.found === 'all' ? LADDER.length : Number(opts.found) || 0
    save.found = LADDER.slice(0, count)
    if (opts.omen) save.found = [...new Set([...save.found, `omen:${opts.omen}`])]
    save.ghost = null
  }

  const emptyStats = () => ({ softlockRooms: [], softMaps: [], assistWhy: [], hits: {}, ticks: 0, lockedOut: 0, timeIn: {}, ringTime: {}, loops: {}, noRoute: [] })

  const playRun = (index, opts) => {
    Math.random = seededRandom(opts.seed * 1000003 + index * 7919)
    setSave(opts, opts.career)
    if (opts.omen) TUNING.run.omenBase = 5
    const quick = opts.warden ? (opts.warden === 'core' ? 7 : 1) : opts.ring ?? null
    const g = createGame(null, 'playing', quick)
    if (opts.god) g.player.hp = TUNING.player.hp
    if (opts.keystone) takeKeystone(g, opts.keystone)
    if (opts.warden && opts.warden !== 'core') {
      const spot = g.wardens[1]
      g.wardens[1].id = opts.warden
      delete g.rooms[keyOf(spot.x, spot.y)]
      jumpTo(g, spot.x, spot.y)
    }
    const bot = newBot(g, opts)
    const stats = emptyStats()
    const secretsAt = {}
    const roomsAt = []
    let lastRooms = g.roomsSeen
    let lastHp = g.player.hp
    let lastLevel = g.level
    const levelAt = []
    let error = null
    let nan = null
    let tickTotal = 0
    let tickMax = 0
    let tickSamples = 0
    const limit = opts.minutes * 60 / TICK
    const wardenLog = {}
    let timedOut = false
    const secrets = [...g.secrets]
    const wardenStart = {}
    for (let t = 0; t < limit && g.phase === 'playing'; t++) {
      stats.ticks = t
      if (g.menus.length) answerMenu(g, opts)
      warp(g, bot)
      const input = g.reveal ? {} : decide(g, bot, stats)
      const sample = t % 8 === 0
      const before = sample ? performance.now() : 0
      try {
        step(g, input, TICK)
      } catch (err) {
        error = `${err.message} :: ${(err.stack ?? '').split('\n').slice(1, 4).map(s => s.trim()).join(' < ')}`
        break
      }
      if (sample) {
        const took = performance.now() - before
        tickTotal += took
        tickSamples += 1
        tickMax = Math.max(tickMax, took)
      }
      if (t % 30 === 0) {
        nan = insane(g)
        if (nan) break
      }
      for (const key of g.foundThisRun) if (!(key in secretsAt)) secretsAt[key] = { t: t * TICK, rooms: g.roomsSeen }
      if (g.roomsSeen !== lastRooms) {
        roomsAt.push(t * TICK)
        lastRooms = g.roomsSeen
      }
      if (g.level !== lastLevel) {
        levelAt.push(g.roomsSeen)
        lastLevel = g.level
      }
      if (g.player.hp < lastHp) {
        const cause = `${g.player.lastCause ?? '?'}`
        stats.hits[cause] = (stats.hits[cause] ?? 0) + 1
        stats.ringHits = stats.ringHits ?? {}
        stats.ringHits[g.ring] = (stats.ringHits[g.ring] ?? 0) + 1
        const b = g.boss
        const fight = b && wardenStart[`${b.kind}${g.loop ? ` L${g.loop}` : ''}`]
        if (fight) fight.hits += 1
      }
      lastHp = g.player.hp
      const place = g.boss ? `boss` : g.reveal ? 'reveal' : g.menus.length ? 'menu' : g.rooms[keyOf(g.x, g.y)].sealed ? 'sealed' : g.rooms[keyOf(g.x, g.y)].visited && g.time - bot.enteredAt > 30 ? 'overstay' : 'walk'
      stats.timeIn[place] = (stats.timeIn[place] ?? 0) + TICK
      stats.ringTime[g.ring] = (stats.ringTime[g.ring] ?? 0) + TICK
      const boss = g.boss
      if (boss) {
        const fight = `${boss.kind}${g.loop ? ` L${g.loop}` : ''}`
        wardenStart[fight] ??= { t, hits: 0, ring: g.ring }
        wardenLog[fight] = {
          base: boss.kind, loop: g.loop,
          secs: (t - wardenStart[fight].t) * TICK, hits: wardenStart[fight].hits, ring: wardenStart[fight].ring,
          gun: boss.gunDamage ?? 0, world: boss.worldDamage ?? 0, hpLeft: boss.hp, maxHp: boss.maxHp, killed: false,
          wards: (boss.wards ?? []).map(w => w.school),
        }
      }
      for (const [fight, log] of Object.entries(wardenLog)) if (log.loop !== g.loop || !g.enemies.some(e => e.kind === log.base)) log.killed = true
      if (opts.warden && wardenLog[opts.warden]?.killed) break
      if (opts.loops !== undefined && g.loop > opts.loops) break
      if (opts.god) g.player.hp = heartCap(g.player)
    }
    if (g.phase === 'playing' && stats.ticks >= limit - 1) timedOut = true
    if (opts.trace) console.log(asciiRoom(g, g.rooms[keyOf(g.x, g.y)], { x: cell(g.player.x + 3), y: cell(g.player.y + g.player.h - 1) }), `p ${g.player.x},${g.player.y} v ${g.player.vx},${g.player.vy}`)
    return {
      index,
      phase: g.phase,
      timedOut,
      error,
      nan,
      seconds: stats.ticks * TICK,
      rooms: g.roomsSeen,
      ring: g.deepestRing,
      deathRing: g.phase === 'dead' ? g.ring : null,
      cause: g.phase === 'dead' ? g.player.lastCause ?? '?' : null,
      kills: g.kills,
      worldKills: g.environmentKills,
      level: g.level,
      score: g.score,
      chainPeak: g.chainPeak,
      gold: g.gold,
      seals: g.seals,
      loop: g.loop,
      where: `${g.rooms[keyOf(g.x, g.y)].layout} L${g.loop} seals ${g.seals}${g.boss ? ` ${g.boss.kind} ${Math.round((100 * g.boss.hp) / g.boss.maxHp)}%` : ''}`,
      keystones: [...g.player.keystones],
      tally: g.tally,
      omens: g.omens,
      mutations: g.mutations,
      clean: g.cleanClears,
      mercy: g.mercyBombs ?? 0,
      secrets,
      met: secretsAt,
      omen: g.omen,
      bands: g.bands,
      softlocks: bot.softlocks,
      softlockRooms: stats.softlockRooms,
      softMaps: stats.softMaps,
      assists: bot.assists,
      assistWhy: stats.assistWhy,
      lockedOut: stats.lockedOut,
      timeIn: stats.timeIn,
      loops: stats.loops,
      noRoute: stats.noRoute,
      ringTime: stats.ringTime,
      failedRooms: Object.values(g.rooms).filter(r => r.passed === false).map(r => `${r.layout}@${r.ring}`),
      hits: stats.hits,
      ringHits: stats.ringHits ?? {},
      wardens: wardenLog,
      levelRooms: levelAt,
      roomTimes: roomsAt,
      tickMean: tickSamples ? tickTotal / tickSamples : 0,
      tickMax,
    }
  }

  for (let i = from; i < to; i++) parentPort.postMessage(playRun(i, opts))
}

const pct = (list, q) => {
  if (list.length === 0) return 0
  const sorted = [...list].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
}
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0)
const fmt = v => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const spread = list => `${fmt(pct(list, 0.1))} / ${fmt(pct(list, 0.5))} / ${fmt(pct(list, 0.9))}`
const tally = list => list.reduce((map, k) => ({ ...map, [k]: (map[k] ?? 0) + 1 }), {})
const merge = maps => maps.reduce((all, m) => {
  for (const [k, v] of Object.entries(m)) all[k] = (all[k] ?? 0) + v
  return all
}, {})
const top = (map, n = 12) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'

const report = (results, opts, realSeconds) => {
  const out = []
  const line = text => out.push(text)
  line(`\n=== ${results.length} runs in ${realSeconds.toFixed(0)}s real ===`)
  line(`outcomes: ${top(tally(results.map(r => (r.timedOut ? 'timeout' : r.phase))))}`)
  line(`errors: ${results.filter(r => r.error).length}, NaNs: ${results.filter(r => r.nan).length}`)
  line(`timed out at: ${top(tally(results.filter(r => r.timedOut).map(r => r.where)), 8)}`)
  for (const [message, count] of Object.entries(tally(results.filter(r => r.error).map(r => r.error))).slice(0, 8)) line(`  x${count} ${message}`)
  for (const r of results.filter(r => r.nan).slice(0, 5)) line(`  nan: ${r.nan}`)
  line(`softlocks (no reachable exit): ${results.reduce((n, r) => n + r.softlocks, 0)} in ${results.filter(r => r.softlocks).length} runs. ${top(tally(results.flatMap(r => r.softlockRooms)), 8)}`)
  if (opts.maps) results.flatMap(r => r.softMaps).slice(0, Number(opts.maps) || 4).forEach(line)
  const without = results.filter(r => r.keystones.length === 0)
  const softBy = list => fmt(mean(list.map(r => r.softlocks / Math.max(1, r.rooms))) * 100)
  line(`softlocks per 100 rooms: no keystone ${softBy(without)} (${without.length} runs), any ${softBy(results.filter(r => r.keystones.length > 0))}. ${[...new Set(results.flatMap(r => r.keystones))].map(k => `${k} ${softBy(results.filter(r => r.keystones.includes(k)))}`).join(', ')}`)
  line(`generator gave up: ${top(tally(results.flatMap(r => r.failedRooms)), 8)}`)
  line(`bot teleports (stuck, not necessarily a softlock): mean ${fmt(mean(results.map(r => r.assists)))} per run`)
  line(`locked out (no bomb, no open gate, bot could not open the door): ${fmt(mean(results.map(r => r.lockedOut)))} per run`)
  line(`mercy bombs: ${fmt(mean(results.map(r => r.mercy)))} per run`)
  line(`  why: ${top(tally(results.flatMap(r => r.assistWhy)), 14)}`)
  const rooms = results.reduce((n, r) => n + r.rooms, 0)
  line(`wanted door not reachable by the bot's model on arrival: ${results.reduce((n, r) => n + r.noRoute.length, 0)} of ${rooms} rooms. ${top(tally(results.flatMap(r => r.noRoute)), 8)}`)
  line(`revisit loops: ${top(merge(results.map(r => r.loops)), 10)}`)
  line(`rooms per run (p10/p50/p90): ${spread(results.map(r => r.rooms))}`)
  line(`minutes per run: ${spread(results.map(r => r.seconds / 60))}`)
  const roomSecs = results.flatMap(r => r.roomTimes.map((t, i) => t - (r.roomTimes[i - 1] ?? 0)))
  line(`time split (minutes per run): ${Object.entries(merge(results.map(r => r.timeIn))).map(([k, v]) => `${k} ${fmt(v / 60 / results.length)}`).join(', ')}. by ring: ${Object.entries(merge(results.map(r => r.ringTime))).map(([k, v]) => `r${k} ${fmt(v / 60 / results.length)}`).join(', ')}`)
  line(`seconds per new room: ${spread(roomSecs)}`)
  line(`deepest ring: ${top(tally(results.map(r => `r${r.ring}`)), 9)}`)
  line(`deaths per ring: ${top(tally(results.filter(r => r.deathRing !== null).map(r => `r${r.deathRing}`)), 9)}`)
  line(`death causes: ${top(tally(results.filter(r => r.cause).map(r => r.cause)))}`)
  line(`hits by cause: ${top(merge(results.map(r => r.hits)))}`)
  line(`hits by ring: ${top(merge(results.map(r => r.ringHits)), 9)}`)
  const kills = results.reduce((n, r) => n + r.kills, 0)
  const world = results.reduce((n, r) => n + r.worldKills, 0)
  line(`kills: ${kills} (${fmt(mean(results.map(r => r.kills)))} per run), by the world ${world} (${kills ? ((100 * world) / kills).toFixed(0) : 0}%), by the gun and direct skills ${kills - world}`)
  line(`level reached: ${spread(results.map(r => r.level))}. rooms per level-up: ${spread(results.flatMap(r => r.levelRooms.map((v, i) => v - (r.levelRooms[i - 1] ?? 0))))}`)
  line(`score: ${spread(results.map(r => r.score))}. peak chain: ${spread(results.map(r => r.chainPeak))}. clean rooms per run: ${fmt(mean(results.map(r => r.clean)))}`)
  line(`seals broken: ${top(tally(results.map(r => `${r.seals}`)), 4)}`)
  line(`loops reached: ${top(tally(results.map(r => `L${r.loop}`)), 8)}. score by loop: ${[...new Set(results.map(r => r.loop))].sort().map(n => `L${n} ${spread(results.filter(r => r.loop === n).map(r => r.score))}`).join(', ')}`)
  line(`keystones taken: ${top(tally(results.flatMap(r => r.keystones)), 17)}`)
  line(`kills by school: ${top(merge(results.map(r => r.tally)), 6)}`)
  line(`mutations: ${top(tally(results.flatMap(r => r.mutations)), 6)}. stacked omens: ${top(tally(results.map(r => `${r.omens.length}`)), 6)}`)
  const planted = results.flatMap(r => r.secrets)
  const met = results.flatMap(r => Object.values(r.met))
  line(`secrets: ${planted.length} planted, ${met.length} met (${planted.length ? ((100 * met.length) / planted.length).toFixed(0) : 0}%). time to meet (s) ${spread(met.map(m => m.t))}, rooms to meet ${spread(met.map(m => m.rooms))}`)
  const missed = results.flatMap(r => r.secrets.filter(k => !(k in r.met)).map(k => `${k}`))
  line(`secrets not met: ${top(tally(missed), 10)}`)
  line(`omens: ${top(tally(results.map(r => r.omen ?? 'none')), 10)}`)
  const fights = results.flatMap(r => Object.entries(r.wardens).map(([kind, w]) => ({ kind, ...w })))
  for (const kind of [...new Set(fights.map(f => f.kind))].sort()) {
    const these = fights.filter(f => f.kind === kind)
    const killed = these.filter(f => f.killed)
    const dmg = these.reduce((n, f) => n + f.gun + f.world, 0) || 1
    line(`  warden ${kind}: ${these.length} fights, ${killed.length} killed, secs ${spread(killed.map(f => f.secs))}, hits ${spread(these.map(f => f.hits))}, damage from world ${((100 * these.reduce((n, f) => n + f.world, 0)) / dmg).toFixed(0)}%, wards ${top(tally(these.flatMap(f => f.wards ?? [])), 3)}`)
  }
  const ticks = results.map(r => r.tickMean)
  line(`ms per tick: mean ${mean(ticks).toFixed(3)}, worst run mean ${Math.max(...ticks).toFixed(3)}, worst single tick ${Math.max(...results.map(r => r.tickMax)).toFixed(2)} (budget 16.67)`)
  return out.join('\n')
}

const main = async () => {
  const opts = parseArgs(process.argv.slice(2))
  const started = Date.now()
  const total = opts.runs
  const results = []
  const progressFile = `${homedir()}/.claude/modprogress/core-soak`
  const writeProgress = done => {
    if ((Date.now() - started) / 1000 < 60 && done < total) return
    mkdirSync(`${homedir()}/.claude/modprogress`, { recursive: true })
    writeFileSync(progressFile, `${done} ${total} runs\n`)
  }
  const workerCount = opts.career ? 1 : Math.min(opts.workers, total)
  const share = Math.ceil(total / workerCount)
  const heartbeat = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000
    const rate = results.length / Math.max(1, elapsed)
    const left = rate > 0 ? (total - results.length) / rate : NaN
    process.stdout.write(`${results.length}/${total} runs, ${(rate * 60).toFixed(1)} runs/min, ${Number.isFinite(left) ? `${left.toFixed(0)}s left` : 'starting'}\n`)
    writeProgress(results.length)
  }, 5000)
  await Promise.all(Array.from({ length: workerCount }, (_, n) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { opts, from: n * share, to: Math.min(total, (n + 1) * share) } })
    w.on('message', r => {
      results.push(r)
      if (r.error) process.stdout.write(`run ${r.index} error: ${r.error}\n`)
    })
    w.on('error', reject)
    w.on('exit', resolve)
  })))
  clearInterval(heartbeat)
  writeProgress(total)
  process.stdout.write(`${report(results, opts, (Date.now() - started) / 1000)}\n`)
}

if (isMainThread) await main()
else await worker(workerData)
