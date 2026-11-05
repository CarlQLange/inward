import { TUNING } from './config.js'
import { props } from './materials.js'
import { acidAt, burningAt, chargedAt, crushingAt, explode, lavaAt, matAt, vineAt } from './world.js'
import { cell, cellsUnder, centre } from './physics.js'
import { burstSparks, hitFx, hurtFx } from './fx.js'

export const burst = burstSparks

const TEACH = {
  FIRE: 'FIRE BURNS WHAT TOUCHES IT. STAY OFF BURNING BLOCKS.',
  LAVA: 'LAVA BURNS AS LONG AS YOU STAND IN IT.',
  ACID: 'ACID EATS BLOCKS AND SKIN ALIKE.',
  CHARGE: 'CHARGE RUNS THROUGH WATER AND METAL. GET OFF THEM.',
  SMOKE: 'BREATHE SMOKE TOO LONG AND IT HURTS. WATCH THE BAR.',
  CRUSHED: 'FALLING BLOCKS AND BLASTS HURT. LOOK UP.',
  BITTEN: 'TOUCHING A FOE HURTS, UNLESS IT IS STUNNED.',
  SHOT: 'THEIR SHOTS CAN BE DODGED. WATCH FOR THE WARNING.',
}

const hurtPlayer = (g, p, cause) => {
  p.hp -= 1
  p.iframes = TUNING.player.iframes
  p.lastCause = cause
  g.hurtFlash = 1
  g.hitstop = Math.max(g.hitstop, TUNING.feel.hurtStop)
  p.vy = -TUNING.feel.hurtKick
  p.vx = -p.facing * TUNING.feel.hurtShove
  p.drift = 0.2
  p.jumpHeld = false
  const here = centre(p)
  hurtFx(g, p, cause)
  if (!g.taught.has(cause) && TEACH[cause]) {
    g.taught.add(cause)
    g.toast = { title: cause, text: TEACH[cause], life: TUNING.run.toastLife }
  }
  if (p.relics.has('plate')) explode(g.world, cell(here.x), cell(here.y), 1)
}

export const hurt = (g, e, amount, source = 'world', cause = 'BITTEN') => {
  if (e.iframes > 0 || e.hp <= 0) return
  if (e === g.player) {
    hurtPlayer(g, e, cause)
    return
  }
  e.hp -= e.stun > 1 ? amount * 2 : amount
  e.iframes = TUNING.enemyIframes
  e.flash = TUNING.feel.enemyFlash
  e.lastSource = source
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
