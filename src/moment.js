import { TUNING } from './config.js'
import { pitPlan, pitView } from './pit.js'
import { persist, save } from './store.js'

const R = TUNING.run

export const beginMoment = g => {
  const first = !save.seenPit
  const gainsDepth = g.seals === 1 && !g.loop
  g.moment = { t: 0, delay: R.momentDelay, plan: pitPlan(first), first, gainsDepth, tile: [g.x, g.y], landed: false }
  g.sealHold = true
  if (gainsDepth) g.depthDrive = 0
  g.player.iframes = Math.max(g.player.iframes, R.momentDelay + 1)
}

const spring = t => 1 + Math.sin(t * Math.PI * 2.5) * Math.exp(-t * 3.4) * R.momentSpring

const land = (g, m) => {
  m.landed = true
  g.white = 1
  g.pulse = 1
  g.shake = Math.max(g.shake, 9)
}

const finish = g => {
  g.moment = null
  g.depthDrive = null
  g.sealHold = false
  save.seenPit = true
  persist()
  ;(g.afterMoment ?? []).forEach(run => run())
  g.afterMoment = null
}

export const stepMoment = (g, dt, wantsSkip) => {
  const m = g.moment
  if (!m) return false
  if (m.delay > 0) {
    m.delay -= dt
    return false
  }
  m.t += dt
  if (wantsSkip && !m.first && m.t > 0.4 && m.t < m.plan.length - m.plan.plan.settle) m.t = m.plan.length - m.plan.plan.settle
  const { landed } = pitView(m.t, m.plan, m.tile)
  if (landed > 0 && !m.landed) land(g, m)
  if (landed > 0 && m.gainsDepth) g.depthDrive = landed * spring(landed)
  if (m.t >= m.plan.length) finish(g)
  return true
}

export const stagedMoment = g => (g.moment && g.moment.delay <= 0 && !g.moment.landed ? g.moment : null)

export const pausedOverPit = g => g.menus?.at(-1)?.page === 'pause' && (g.seals > 0 || g.loop > 0)
