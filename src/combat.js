import { TUNING } from './config.js'
import { props } from './materials.js'
import { acidAt, burningAt, chargedAt, crushingAt, explode, lavaAt, matAt, vineAt } from './world.js'
import { cell, cellsUnder, centre } from './physics.js'
import { rumble } from './pad.js'
import { burstSparks, hitFx, hurtFx } from './fx.js'
import { feedEvent } from './feed.js'

export const burst = burstSparks

const spillCoins = (g, p, count) => {
  g.gold -= count
  const here = centre(p)
  for (let i = 0; i < count; i++) {
    g.pickups.push({ kind: 'coin', x: here.x - 2, y: here.y - 2, w: 5, h: 5, vx: (Math.random() - 0.5) * 160, vy: -70 - Math.random() * 70 })
  }
}

const bonded = g => g.enemies.find(e => e.ally > 0 && e.bond && e.hp > 0)

const hurtPlayer = (g, p, cause) => {
  const paid = p.relics.has('crown') && g.gold >= TUNING.run.crownHit
  const stand = bonded(g)
  if (stand) {
    stand.hp -= TUNING.skills.charm.bondCost
    stand.flash = TUNING.feel.enemyFlash
    g.bolts.push({ points: [centre(p), centre(stand)], life: 0.2, colour: '#6fd0ff' })
  } else if (paid) spillCoins(g, p, TUNING.run.crownHit)
  else p.hp -= 1
  feedEvent(g, 'hit', centre(p).x, centre(p).y)
  if (p.relics.has('chain')) {
    g.chain = 0
    g.chainTime = 0
  }
  p.iframes = TUNING.player.iframes
  p.lastCause = cause
  g.hitNote = { cause, life: 1.6 }
  g.hurtFlash = 1
  rumble(p.hp <= 0 ? 1 : 0.7, p.hp <= 0 ? 400 : 180)
  g.hitstop = Math.max(g.hitstop, TUNING.feel.hurtStop)
  p.vy = -TUNING.feel.hurtKick
  p.vx = -p.facing * TUNING.feel.hurtShove
  p.drift = 0.2
  p.jumpHeld = false
  const here = centre(p)
  hurtFx(g, p, cause)
  if (p.relics.has('plate')) explode(g.world, cell(here.x), cell(here.y), 1)
}

const hurtWarden = (g, e, amount, source) => {
  const fromWorld = source !== 'player'
  if (e.hp <= 0 || e.asleep || e.shield > 0 || (fromWorld && e.iframes > 0)) return
  e.hp -= (e.stun > 1 ? 2 : 1) * amount * (fromWorld ? TUNING.enemies.warden.world : 1)
  e.sinceHit = 0
  if (fromWorld) {
    e.iframes = TUNING.enemyIframes
    e.worldDamage = (e.worldDamage ?? 0) + amount * TUNING.enemies.warden.world
  } else e.gunDamage = (e.gunDamage ?? 0) + amount
  e.flash = TUNING.feel.enemyFlash
  e.lastSource = source
  const c = centre(e)
  burst(g, c.x, c.y, 'pale', 3)
}

export const hurt = (g, e, amount, source = 'world', cause = 'BITTEN') => {
  if (e.partOf) {
    const body = g.enemies.find(o => o.warden)
    if (body) hurtWarden(g, body, amount, source)
    return
  }
  if (e.warden) {
    hurtWarden(g, e, amount, source)
    return
  }
  if (e.iframes > 0 || e.hp <= 0) return
  if (e === g.player) {
    hurtPlayer(g, e, cause)
    return
  }
  e.hp -= e.stun > 1 ? amount * 2 : amount
  e.iframes = TUNING.enemyIframes
  e.flash = TUNING.feel.enemyFlash
  e.lastSource = source
  e.lastCause = cause
  if (source === 'player') g.hitstop = Math.max(g.hitstop, TUNING.feel.hitStop)
  hitFx(g, e)
}

export const applyCrush = (g, e) => {
  if (!cellsUnder(e).some(([x, y]) => crushingAt(g.world, x, y))) return
  hurt(g, e, TUNING.world.crushDamage, 'world', 'CRUSHED')
  e.stun = Math.max(e.stun, e === g.player ? 0.15 : TUNING.world.crushStun)
}

export const applyHazards = (g, e, dt) => {
  const world = g.world
  const touching = cellsUnder(e, 1)
  if (!e.insulated && touching.some(([x, y]) => chargedAt(world, x, y))) {
    hurt(g, e, 2, 'world', 'CHARGE')
    e.stun = Math.max(e.stun, e === g.player ? 0.2 : 0.7)
  }
  const burning = cellsUnder({ x: e.x, y: e.y, w: e.w, h: e.h + 1 })
  if (!e.fireproof && burning.some(([x, y]) => burningAt(world, x, y))) hurt(g, e, 1, 'world', 'FIRE')
  if (!e.fireproof && burning.some(([x, y]) => lavaAt(world, x, y))) hurt(g, e, 2, 'world', 'LAVA')
  if (burning.some(([x, y]) => acidAt(world, x, y))) hurt(g, e, 1, 'world', 'ACID')
  if (world.thorns && e !== g.player && cellsUnder(e).some(([x, y]) => vineAt(world, x, y))) hurt(g, e, 1)
  const inSmoke = cellsUnder(e).some(([x, y]) => props(matAt(world, x, y)).harmful)
  e.smoked = inSmoke && !e.smokeproof ? (e.smoked ?? 0) + dt : Math.max(0, (e.smoked ?? 0) - dt)
  if (e.smoked > TUNING.player.smokeTolerance) {
    hurt(g, e, 1, 'world', 'SMOKE')
    e.smoked = 0
  }
}
