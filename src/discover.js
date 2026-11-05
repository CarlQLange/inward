import { TUNING } from './config.js'
import { persist, save } from './store.js'
import { SKILL_NAMES } from './skills.js'
import { RELIC_BY_ID } from './relics.js'

const keyed = (kind, ids) => ids.map(id => `${kind}:${id}`)

export const BASE = new Set([
  ...keyed('skill', ['bolt', 'frost', 'seed', 'repel', 'hammer', 'ember', 'blink', 'grapple', 'gust', 'mine']),
  ...keyed('foe', ['crawler', 'spitter', 'fish', 'bat', 'turret', 'slug', 'tick']),
  ...keyed('inhabitant', ['mole', 'hermit']),
  ...keyed('warden', ['bellows', 'colossus', 'crucible']),
  ...keyed('relic', ['springs', 'feather', 'sack', 'hands', 'spread', 'ricochet', 'gills', 'coinmagnet']),
  ...keyed('event', ['arena', 'chest']),
])

export const LADDER = [
  'foe:bomber', 'event:vault', 'relic:claws', 'skill:dash', 'foe:spore', 'inhabitant:miner',
  'omen:tinder', 'relic:fireboots', 'foe:crab', 'event:flood', 'skill:spring', 'foe:pillbug',
  'relic:stomp', 'foe:gasbag', 'event:gasworks', 'omen:deluge', 'skill:mason', 'foe:imp',
  'relic:rubber', 'foe:gnat', 'inhabitant:cartographer', 'event:collapse', 'warden:eel', 'skill:acid',
  'omen:moon', 'relic:incendiary', 'foe:slime', 'foe:snapweed', 'relic:shock', 'skill:melt',
  'foe:dripper', 'event:altar', 'omen:bloom', 'relic:frostshot', 'foe:emberbat', 'skill:rod',
  'foe:scrapper', 'inhabitant:tinker', 'relic:pierce', 'omen:rust', 'skill:decoy', 'foe:jelly',
  'relic:battery', 'foe:coil', 'warden:conductor', 'skill:swap', 'event:nest', 'relic:plate',
  'omen:midas', 'foe:stilt', 'skill:well', 'relic:chain', 'foe:puffer', 'inhabitant:bloodletter',
  'skill:drone', 'relic:wind', 'foe:worm', 'omen:swarm', 'skill:roar', 'relic:gem',
  'foe:mimic', 'foe:urchin', 'skill:charm', 'relic:crown', 'warden:brood', 'skill:alchemy',
  'foe:lantern', 'omen:glass', 'relic:skull', 'skill:mirror', 'foe:shade', 'relic:acidskull',
  'skill:stop', 'relic:dice', 'omen:blackout', 'skill:rewind', 'relic:eye', 'skill:echo',
  'relic:phoenix', 'skill:pact',
]

const CATALOGUE = [...BASE, ...LADDER]
const KINDS = ['skill', 'relic', 'foe', 'inhabitant', 'event', 'warden', 'omen']
const kindOf = key => key.split(':')[0]
const idOf = key => key.split(':')[1]

export const knownFrom = secrets => new Set([...BASE, ...save.found, ...secrets])
export const isKnown = (g, kind, id) => g.known.has(`${kind}:${id}`)
export const knownOf = (g, kind) => [...g.known].filter(key => kindOf(key) === kind).map(idOf)

const unfound = () => LADDER.filter(key => !save.found.includes(key))

export const pickSecrets = () => {
  const R = TUNING.run
  const window = unfound().slice(0, R.secretWindow)
  const count = Math.random() < R.secretTwice ? 2 : 1
  const shuffled = window.map(key => [Math.random(), key]).sort((a, b) => a[0] - b[0]).map(([, key]) => key)
  const first = shuffled[0]
  const second = shuffled.find(key => key !== first && kindOf(key) !== kindOf(first))
  return [first, ...(count === 2 && second ? [second] : [])].filter(Boolean)
}

export const plantsFor = secrets => secrets.map((key, order) => ({ key, kind: kindOf(key), id: idOf(key), order, done: false }))

export const rollOmen = secrets => {
  const fresh = secrets.find(key => kindOf(key) === 'omen')
  if (fresh) return idOf(fresh)
  const R = TUNING.run
  const owned = save.found.filter(key => kindOf(key) === 'omen').map(idOf)
  if (owned.length === 0 || Math.random() > R.omenBase + owned.length * R.omenPerFound) return null
  return owned[Math.floor(Math.random() * owned.length)]
}

const announce = (g, reveal) => {
  if (g.reveal) g.revealQueue.push(reveal)
  else g.reveal = reveal
}

export const showReveal = (g, kind, id, fresh = false) =>
  announce(g, { kind, id, life: TUNING.run.revealLife, fresh })

export const meet = (g, kind, id) => {
  const key = `${kind}:${id}`
  if (!g.secrets.includes(key) || save.found.includes(key)) return false
  save.found.push(key)
  g.foundThisRun.push(key)
  showReveal(g, kind, id, true)
  persist()
  return true
}

const NAMES = {
  skill: id => SKILL_NAMES[id],
  relic: id => RELIC_BY_ID[id]?.name,
}

export const nameOf = (kind, id) => NAMES[kind]?.(id) ?? id.toUpperCase()

export const almanac = (reactions = []) => {
  const seen = new Set([...BASE, ...save.found])
  const groups = KINDS.map(kind => {
    const items = CATALOGUE.filter(key => kindOf(key) === kind).map(key => ({
      kind, id: idOf(key), name: nameOf(kind, idOf(key)), found: seen.has(key), base: BASE.has(key),
    }))
    return { kind, items, found: items.filter(i => i.found).length, total: items.length }
  })
  return {
    groups,
    found: groups.reduce((n, g) => n + g.found, 0),
    total: groups.reduce((n, g) => n + g.total, 0),
    reactions: { found: reactions.length, list: reactions },
  }
}
