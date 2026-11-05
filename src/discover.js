import { TUNING } from './config.js'
import { persist, save } from './store.js'
import { SKILL_NAMES } from './skills.js'
import { RELIC_BY_ID } from './relics.js'
import { KEYSTONE_BY_ID } from './keystones.js'
import { MUTATION_BY_ID } from './deep.js'
import { OMENS } from './omens.js'

const keyed = (kind, ids) => ids.map(id => `${kind}:${id}`)

export const BASE = new Set([
  ...keyed('skill', ['bolt', 'frost', 'seed', 'repel', 'hammer', 'ember', 'blink', 'grapple', 'gust', 'mine']),
  ...keyed('foe', ['crawler', 'spitter', 'fish', 'bat', 'turret', 'slug', 'tick']),
  ...keyed('inhabitant', ['mole', 'hermit']),
  ...keyed('warden', ['bellows', 'colossus', 'crucible']),
  ...keyed('relic', ['springs', 'feather', 'sack', 'spread', 'ricochet']),
  ...keyed('event', ['arena', 'chest']),
  ...keyed('keystone', ['echo', 'fists', 'stain', 'fourth', 'salamander', 'glutton', 'powder']),
])

export const LADDER = [
  'skill:flask', 'foe:bomber', 'event:vault', 'relic:claws', 'skill:float', 'skill:lens', 'skill:dash', 'foe:spore',
  'inhabitant:miner', 'skill:wick', 'omen:tinder', 'relic:fireboots', 'foe:crab', 'skill:link', 'skill:chime', 'event:flood',
  'skill:spring', 'foe:pillbug', 'skill:clay', 'keystone:quarry', 'relic:stomp', 'foe:gasbag', 'skill:burrow',
  'event:gasworks', 'omen:deluge', 'skill:mason', 'foe:imp', 'keystone:livewire', 'relic:rubber', 'foe:gnat',
  'event:collapse', 'warden:eel', 'skill:acid', 'omen:moon', 'keystone:overload', 'relic:incendiary', 'foe:slime',
  'foe:snapweed', 'relic:shock', 'skill:melt', 'keystone:wake', 'foe:dripper', 'event:altar', 'omen:bloom',
  'relic:frostshot', 'foe:emberbat', 'skill:rod', 'keystone:slough', 'foe:scrapper', 'relic:pierce', 'omen:rust',
  'skill:decoy', 'foe:jelly', 'foe:coil', 'warden:conductor', 'skill:swap', 'event:nest', 'relic:plate',
  'keystone:monomania', 'foe:stilt', 'skill:well', 'relic:chain', 'foe:puffer', 'skill:drone', 'relic:wind',
  'foe:worm', 'omen:swarm', 'skill:roar', 'relic:gem', 'keystone:breath', 'foe:mimic', 'foe:urchin', 'skill:charm',
  'relic:crown', 'warden:brood', 'skill:alchemy', 'foe:lantern', 'omen:glass', 'relic:skull', 'skill:mirror',
  'foe:shade', 'relic:acidskull', 'skill:stop', 'skill:rewind', 'keystone:onecut', 'relic:phoenix',
]

const CATALOGUE = [...BASE, ...LADDER]

export const isCatalogued = key => CATALOGUE.includes(key)
const KINDS = ['keystone', 'skill', 'relic', 'foe', 'inhabitant', 'event', 'warden', 'omen']
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
  const owned = save.found.filter(key => kindOf(key) === 'omen').map(idOf).filter(id => OMENS[id])
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
  keystone: id => KEYSTONE_BY_ID[id]?.name,
  mutation: id => MUTATION_BY_ID[id]?.name,
  omen: id => OMENS[id]?.name,
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
