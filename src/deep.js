import { BLOCK, TUNING } from './config.js'
import { props } from './materials.js'
import { matAt } from './world.js'
import { WORLD_PX, cell, centre } from './physics.js'
import { burstSparks } from './fx.js'
import { createEnemy } from './enemies.js'

const mutation = (id, name, tint, glyph) => ({ id, name, tint, glyph })

export const MUTATIONS = [
  mutation('spite', 'SPITE', '#ff5a4a', [
    '....#....', '.#..#..#.', '..#.#.#..', '...###...', '####.####', '...###...', '..#.#.#..', '.#..#..#.', '....#....',
  ]),
  mutation('hatch', 'HATCH', '#c8ff5a', [
    '...###...', '..#####..', '.#######.', '.###.###.', '.##...##.', '.........', '#..#.#..#', '.##...##.', '#..#.#..#',
  ]),
  mutation('kindled', 'KINDLED', '#ff9a2e', [
    '....#....', '...##....', '..####...', '..#####..', '.#######.', '.........', '##.##.##.', '#########', '.........',
  ]),
  mutation('stalker', 'STALKER', '#c79ae0', [
    '.........', '..#####..', '.#.....#.', '#..###..#', '#..###..#', '#..###..#', '.#.....#.', '..#####..', '.........',
  ]),
]

export const MUTATION_BY_ID = Object.fromEntries(MUTATIONS.map(m => [m.id, m]))

const D = () => TUNING.run.deep

const hasMutation = (g, id) => g.mutations?.includes(id) === true

export const rollMutation = g => {
  const open = MUTATIONS.filter(m => !g.mutations.includes(m.id))
  return open[Math.floor(Math.random() * open.length)]?.id ?? null
}

const spitAt = (g, e) => {
  const c = centre(e)
  const them = centre(g.player)
  const d = Math.max(1, Math.hypot(them.x - c.x, them.y - c.y))
  g.fireballs.push({
    x: c.x - 2, y: c.y - 2, w: 4, h: 4,
    vx: ((them.x - c.x) / d) * D().spiteSpeed, vy: ((them.y - c.y) / d) * D().spiteSpeed,
    age: 0, straight: true, pellet: true, friendly: false, fromWarden: true,
  })
}

const hatch = (g, e) => {
  const c = centre(e)
  for (const side of [-1, 1]) {
    const baby = createEnemy({ kind: 'tick', x: c.x + side * 6, y: e.y })
    Object.assign(baby, { spawned: true, awake: true, cooldown: 0.8, hatched: true })
    g.spawns.push(baby)
  }
}

export const deepKill = (g, e) => {
  if (!g.mutations?.length || e.warden || e.partOf || e.ally) return
  if (hasMutation(g, 'spite')) spitAt(g, e)
  if (hasMutation(g, 'hatch') && !e.hatched && e.w >= D().hatchFrom) hatch(g, e)
}

const STILL_KINDS = new Set(['turret', 'nest', 'snapweed', 'dripper', 'mimic', 'worm', 'fish', 'jelly'])

const spotNear = (g, target) => {
  for (let tries = 0; tries < 8; tries++) {
    const a = Math.random() * Math.PI * 2
    const x = target.x + Math.cos(a) * D().stalkNear
    const y = target.y + Math.sin(a) * D().stalkNear * 0.6
    const clear = [[0, 0], [8, 0], [0, 8], [8, 8]].every(([dx, dy]) => !props(matAt(g.world, cell(x + dx), cell(y + dy))).solid)
    if (clear && x > BLOCK && x < WORLD_PX - 2 * BLOCK && y > BLOCK && y < WORLD_PX - 2 * BLOCK) return { x, y }
  }
  return null
}

const stepStalker = (g, e, dt) => {
  if (STILL_KINDS.has(e.kind) || e.heavy || e.spawned) return
  e.stalk = (e.stalk ?? D().stalkEvery * (0.6 + Math.random())) - dt
  if (e.stalkTo) {
    if (e.stalk <= 0) {
      burstSparks(g, centre(e).x, centre(e).y, '#c79ae0', 8)
      Object.assign(e, { x: e.stalkTo.x, y: e.stalkTo.y, stalkTo: null, stalk: D().stalkEvery, stun: Math.max(e.stun, 0.25) })
      burstSparks(g, centre(e).x, centre(e).y, '#c79ae0', 8)
    } else if (Math.random() < dt * 30) burstSparks(g, e.stalkTo.x + 4, e.stalkTo.y + 4, '#c79ae0', 1, 40)
    return
  }
  if (e.stalk > 0) return
  e.stalkTo = spotNear(g, centre(g.player))
  e.stalk = D().stalkTell
}

export const stepMutations = (g, e, dt) => {
  if (!g.mutations?.length || e.friendly || e.ally || e.warden || e.partOf || e.prop || e.asleep) return
  if (hasMutation(g, 'stalker')) stepStalker(g, e, dt)
}

export const mutateFoe = (g, e, theme) => {
  if (!g.mutations?.length || e.friendly || e.heavy || e.prop || e.warden) return e
  if (!hasMutation(g, 'kindled') || e.elite) return e
  return { ...e, elite: D().kindledFire.includes(theme) ? 'burning' : 'charged', fireproof: true, insulated: true }
}
