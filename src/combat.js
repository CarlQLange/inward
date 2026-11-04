import { TUNING } from './config.js'
import { props } from './materials.js'
import { burningAt, chargedAt, crushingAt, matAt } from './world.js'
import { cellsUnder, centre } from './physics.js'

export const burst = (g, x, y, colour, count) => {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 20 + Math.random() * 60
    g.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.25 + Math.random() * 0.35, colour })
  }
}

export const hurt = (g, e, amount, source = 'world') => {
  if (e.iframes > 0 || e.hp <= 0) return
  const isPlayer = e === g.player
  e.hp -= e.stun > 1 && !isPlayer ? amount * 2 : amount
  e.iframes = isPlayer ? TUNING.player.iframes : TUNING.enemyIframes
  if (!isPlayer) e.lastSource = source
  if (isPlayer) g.shake = Math.max(g.shake, 2)
  const c = centre(e)
  burst(g, c.x, c.y, isPlayer ? 'white' : 'pale', 5)
}

export const applyCrush = (g, e) => {
  if (!cellsUnder(e).some(([x, y]) => crushingAt(g.world, x, y))) return
  hurt(g, e, TUNING.world.crushDamage)
  e.stun = Math.max(e.stun, TUNING.world.crushStun)
}

export const applyHazards = (g, e, dt) => {
  const world = g.world
  const touching = cellsUnder(e, 1)
  if (!e.insulated && touching.some(([x, y]) => chargedAt(world, x, y))) {
    hurt(g, e, 2)
    e.stun = Math.max(e.stun, 0.7)
  }
  if (!e.fireproof && touching.some(([x, y]) => burningAt(world, x, y))) hurt(g, e, 1)
  const inSmoke = cellsUnder(e).some(([x, y]) => props(matAt(world, x, y)).harmful)
  e.smoked = inSmoke ? (e.smoked ?? 0) + dt : Math.max(0, (e.smoked ?? 0) - dt)
  if (e.smoked > TUNING.player.smokeTolerance) {
    hurt(g, e, 1)
    e.smoked = 0
  }
}
