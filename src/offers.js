import { TUNING } from './config.js'
import { DIETS, dietOf, eatsText } from './feed.js'
import { FORKS, SKILL_DETAILS, SKILL_NAMES, openFork, owns } from './skills.js'
import { RELIC_BY_ID } from './relics.js'

const R = TUNING.run

const MAKES = {
  bolt: ['charge'], ember: ['fire', 'gas'], frost: ['ice', 'stun'], hammer: ['rubble', 'falling'], seed: ['moss', 'fuel'], spring: ['water', 'pouring'], acid: ['acid'],
  melt: ['lava', 'steam'], alchemy: ['variety', 'acid'], well: ['crowd'], swap: ['crowd'], stop: ['stun'], charm: ['allyKill'], decoy: ['drawn'], drone: ['coin'],
  rod: ['charge'], mine: ['blast', 'blastKill'], roar: ['stun'], mirror: ['returned'],
  'repel.salvage': ['scrap'], 'mason.iron': ['metal'], 'mason.rubble': ['falling', 'rubble'], 'acid.rust': ['scrap'], 'acid.ferment': ['gas', 'fuel'], 'spring.oil': ['acid', 'fuel'],
  'spring.slush': ['ice'], 'bolt.split': ['gas', 'fuel'], 'hammer.tremor': ['falling'], 'hammer.fuse': ['blast', 'blastKill'], 'frost.shatter': ['blast', 'blastKill'],
  'seed.tinder': ['blast', 'blastKill'], 'melt.flash': ['blast', 'steam'], 'roar.rime': ['ice', 'stun'], 'alchemy.vapour': ['gas', 'fuel'], 'mine.gas': ['gas', 'fuel'], 'decoy.gas': ['gas', 'fuel'],
  'ember.napalm': ['fire'], 'melt.forge': ['lava'], 'acid.rain': ['pouring'], 'spring.font': ['pouring'],
  flask: ['pouring'], 'flask.leech': ['water'], wick: ['fire', 'blast'], 'wick.tow': ['blastKill'],
  float: ['falling', 'stun', 'air', 'worldKill'], 'float.flip': ['falling', 'worldKill'],
  link: ['worldKill', 'stun'], 'link.cable': ['fire', 'charge'], 'link.stake': ['fire', 'charge'],
  clay: ['mud'], 'clay.daub': ['stun'], 'clay.bog': ['mud'], 'clay.roll': ['falling'],
  'burrow.tunnel': ['falling'], 'burrow.grind': ['rubble', 'falling'], 'burrow.quicksand': ['stun', 'falling'], 'burrow.breach': ['air'],
  lens: ['glass', 'fire'], chime: ['flying', 'stun'], 'lens.kiln': ['glass'], 'lens.dazzle': ['stun'], 'chime.bell': ['glass'], 'chime.statue': ['glass'],
  repel: ['flying'], 'grapple.yank': ['flying'],
}

const REGION_FOOD = [
  ['moss', 'fire', 'gas', 'rubble', 'fuel'],
  ['water', 'charge', 'rubble', 'mud', 'pouring'],
  ['fire', 'gas', 'moss', 'acid', 'mud', 'fuel'],
  ['metal', 'scrap', 'charge', 'falling', 'blast', 'flying'],
  ['lava', 'water', 'steam', 'metal', 'scrap', 'glass', 'pouring'],
  ['ice', 'falling', 'water', 'snow'],
  ['blast', 'blastKill', 'gas', 'acid', 'glass', 'fuel', 'flying'],
]

const BAND_OF_RING = [0, 0, 1, 1, 2, 2, 3]

const weighted = (list, weightOf) => {
  const total = list.reduce((n, item) => n + weightOf(item), 0)
  let at = Math.random() * total
  for (const item of list) {
    at -= weightOf(item)
    if (at <= 0) return item
  }
  return list.at(-1)
}

const drawWeighted = (list, weightOf, count) => {
  const left = [...list]
  const out = []
  while (out.length < count && left.length) {
    const item = weighted(left, weightOf)
    out.push(item)
    left.splice(left.indexOf(item), 1)
  }
  return out
}

const madeBy = (p, kind) => [...(MAKES[kind] ?? []), ...FORKS[kind].flat().filter(f => owns(p, f.id)).flatMap(f => MAKES[f.id] ?? [])]

const touches = (a, b) => a.some(tag => b.includes(tag))

const engineWith = (p, kind) => p.skills.filter(({ kind: other }) =>
  other !== kind && (touches(madeBy(p, other), DIETS[kind]) || touches(MAKES[kind] ?? [], dietOf(p, other)))).length

const foodHere = g => REGION_FOOD[g.bands?.[BAND_OF_RING[g.ring]]] ?? []

const skillWeight = (g, kind) => 1 + R.leanEngine * engineWith(g.player, kind) + (touches(foodHere(g), DIETS[kind]) ? R.leanRegion : 0)

const newOption = kind => ({
  type: 'new', kind,
  card: { icon: kind, name: SKILL_NAMES[kind], text: SKILL_DETAILS[kind], sub: eatsText(kind), subBright: true },
})

const forkOptions = g => {
  const p = g.player
  const open = p.skills.map(s => s.kind).filter(kind => openFork(p, kind).length)
  if (open.length === 0) return []
  const kind = weighted(open, k => 1 + R.leanStarted * FORKS[k].flat().filter(f => owns(p, f.id)).length + R.leanEngine * engineWith(p, k))
  return openFork(p, kind).map(node => ({ type: 'upgrade', skill: kind, node }))
}

const relicOption = g => (g.relicPool.length ? [{ type: 'relic', relic: g.relicPool[0], card: { icon: RELIC_BY_ID[g.relicPool[0]].icon, name: RELIC_BY_ID[g.relicPool[0]].name, text: RELIC_BY_ID[g.relicPool[0]].text } }] : [])

const MEND = { type: 'mend' }

const hurting = g => g.player.hp <= TUNING.player.hp * R.mendBelow

const pickNew = (g, unowned, count) => drawWeighted(unowned, kind => skillWeight(g, kind), count).map(newOption)

const dealt = (g, options) => {
  const kept = options.slice(0, hurting(g) ? 2 : 3)
  return kept.length < 3 ? [...kept, MEND] : kept
}

const besideForks = (g, unowned, forks, slotsFull) =>
  [...pickNew(g, unowned, forks.length || slotsFull ? 1 : 2), ...relicOption(g)]

export const composeOffer = (g, kinds, unowned, slotsFull) => {
  if (!kinds.includes('upgrade') || g.player.skills.length === 0) return dealt(g, pickNew(g, unowned, 3))
  const forks = forkOptions(g)
  if (!kinds.includes('new')) return dealt(g, forks.length ? forks : relicOption(g))
  return dealt(g, [...forks, ...besideForks(g, unowned, forks, slotsFull)])
}
