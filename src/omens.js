import { TUNING } from './config.js'

const plus = (field, amount) => theme => ({ ...theme, [field]: (theme[field] ?? 0) + amount })

export const OMENS = {
  tinder: {
    name: 'TINDER',
    tuning: { world: { excite: 2.4 } },
    gen: theme => ({ ...theme, top: 'p', ledge: 'w', peat: 0.7, props: { ...theme.props, lamp: 0.8 }, oil: (theme.oil ?? 0) + 0.4 }),
  },
  deluge: {
    name: 'DELUGE',
    tuning: { world: { quench: 6, burnScale: 0.45 } },
    gen: theme => ({ ...theme, pits: (theme.pits ?? 0) + 0.6, lava: 0, oil: 0 }),
  },
  rust: {
    name: 'RUST',
    gen: theme => ({ ...theme, rust: 0.6, scrap: (theme.scrap ?? 0) + 0.4 }),
    foes: { magnetic: true },
  },
  bloom: {
    name: 'BLOOM',
    tuning: { world: { growth: 0.2, mossAnywhere: true, growthTries: 4 } },
    gen: plus('vines', 4),
  },
  swarm: {
    name: 'SWARM',
    gen: theme => ({ ...theme, crowd: 2 }),
    foes: { hp: 0.5, flock: true },
  },
  moon: {
    name: 'MOON',
    tuning: {
      player: { gravity: 290, maxFall: 170 },
      enemies: { gravity: 250 },
      fireball: { gravity: 130 },
      flung: { gravity: 180 },
    },
  },
  glass: {
    name: 'CRYSTAL',
    tuning: { world: { blastBonus: 1 } },
    gen: theme => ({ ...theme, volatile: (theme.volatile ?? 0) + 0.3, shards: 0.5 }),
  },
}

const BASELINE = structuredClone(TUNING)

export const applyOmens = ids => {
  for (const [section, values] of Object.entries(BASELINE)) {
    if (typeof values === 'object') Object.assign(TUNING[section], structuredClone(values))
  }
  for (const id of ids) {
    for (const [section, values] of Object.entries(OMENS[id]?.tuning ?? {})) Object.assign(TUNING[section], values)
  }
}

export const omenTheme = (ids, theme) => ids.reduce((shaped, id) => OMENS[id]?.gen?.(shaped) ?? shaped, theme)

export const omenFoes = ids => ids.reduce((all, id) => {
  const foes = OMENS[id]?.foes ?? {}
  return { ...all, ...foes, hp: (all.hp ?? 1) * (foes.hp ?? 1) }
}, {})
