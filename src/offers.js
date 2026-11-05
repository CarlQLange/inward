import { TUNING } from './config.js'
import { DIETS, TASTES, dietOf, eatsText } from './feed.js'
import { FORKS, SKILL_DETAILS, SKILL_NAMES, formOf, openFork, owns } from './skills.js'
import { RELIC_BY_ID } from './relics.js'

const R = TUNING.run

const MAKES = {
  bolt: ['charge'], ember: ['fire', 'gas'], frost: ['ice', 'stun'], hammer: ['rubble', 'falling'], seed: ['moss'], spring: ['water'], acid: ['acid'],
  melt: ['lava', 'steam'], alchemy: ['variety', 'acid'], well: ['crowd'], swap: ['crowd'], stop: ['stun'], charm: ['allyKill'], decoy: ['drawn'], drone: ['coin'],
  rod: ['charge'], mine: ['blast', 'blastKill'], roar: ['stun'], mirror: ['returned'],
  'repel.salvage': ['scrap'], 'mason.iron': ['metal'], 'mason.rubble': ['falling', 'rubble'], 'acid.rust': ['scrap'], 'acid.ferment': ['gas'], 'spring.oil': ['acid'],
  'spring.slush': ['ice'], 'bolt.split': ['gas'], 'hammer.tremor': ['falling'], 'hammer.fuse': ['blast', 'blastKill'], 'frost.shatter': ['blast', 'blastKill'],
  'seed.tinder': ['blast', 'blastKill'], 'melt.flash': ['blast', 'steam'], 'roar.rime': ['ice', 'stun'], 'alchemy.vapour': ['gas'], 'mine.gas': ['gas'], 'decoy.gas': ['gas'],
  'ember.napalm': ['fire'], 'melt.forge': ['lava'],
  float: ['falling', 'stun', 'air', 'worldKill'], 'float.flip': ['falling', 'worldKill'],
  link: ['worldKill', 'stun'], 'link.cable': ['fire', 'charge'], 'link.stake': ['fire', 'charge'],
}

const REGION_FOOD = [
  ['moss', 'fire', 'gas', 'rubble'],
  ['water', 'charge', 'rubble'],
  ['fire', 'gas', 'moss', 'acid'],
  ['metal', 'scrap', 'charge', 'falling', 'blast'],
  ['lava', 'water', 'steam', 'metal', 'scrap'],
  ['ice', 'falling', 'water'],
  ['blast', 'blastKill', 'gas', 'acid'],
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
const foodAhead = g => REGION_FOOD[g.bands?.[Math.min(3, BAND_OF_RING[g.ring] + 1)]] ?? []

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

const tasteOptions = (g, count) => {
  const p = g.player
  const ahead = foodAhead(g)
  const here = foodHere(g)
  const all = p.skills.flatMap(({ kind }) => {
    const eats = dietOf(p, kind)
    if ((p.diet?.[kind]?.length ?? 0) >= R.dietMost) return []
    return Object.keys(TASTES).filter(tag => !eats.includes(tag)).map(tag => ({ kind, tag }))
  })
  const weight = ({ kind, tag }) => 1 + (ahead.includes(tag) ? R.leanRegion * 2 : 0) + (here.includes(tag) ? R.leanRegion : 0)
    + (p.skills.some(s => s.kind !== kind && madeBy(p, s.kind).includes(tag)) ? R.leanEngine * 2 : 0)
  const seen = new Set()
  return drawWeighted(all, weight, count * 4).filter(({ kind }) => {
    if (seen.has(kind) && seen.size < count) return false
    seen.add(kind)
    return true
  }).slice(0, count).map(({ kind, tag }) => ({
    type: 'taste', kind, tag,
    card: { icon: kind, tint: TASTES[tag].colours[0], name: TASTES[tag].name, text: `ALSO RECHARGES ${formOf(p, kind).name}` },
  }))
}

const reformOptions = (g, count) => {
  const p = g.player
  const all = p.skills.flatMap(({ kind }) => FORKS[kind].flatMap(fork => {
    const taken = fork.find(f => owns(p, f.id))
    return taken ? fork.filter(f => f !== taken).map(node => ({ type: 'reform', skill: kind, node, drop: taken })) : []
  }))
  return drawWeighted(all, () => 1, count).map(option => ({
    ...option,
    card: { icon: option.skill, tint: option.node.tint, name: option.node.name, text: option.node.text, sub: `REPLACES ${option.drop.name}`, subBright: true },
  }))
}

const relicOption = g => (g.relicPool.length ? [{ type: 'relic', relic: g.relicPool[0], card: { icon: RELIC_BY_ID[g.relicPool[0]].icon, name: RELIC_BY_ID[g.relicPool[0]].name, text: RELIC_BY_ID[g.relicPool[0]].text } }] : [])

const hurting = g => g.player.hp <= TUNING.player.hp * R.mendBelow

const pickNew = (g, unowned, count) => drawWeighted(unowned, kind => skillWeight(g, kind), count).map(newOption)

const late = (g, unowned, full) => {
  const fresh = pickNew(g, unowned, full ? 1 : 2)
  const tastes = tasteOptions(g, 2)
  const pool = [...tastes, ...fresh, ...relicOption(g)]
  const backstop = reformOptions(g, 3)
  return [...drawWeighted(pool, () => 1, 3), ...backstop].slice(0, 3)
}

export const composeOffer = (g, kinds, unowned, slotsFull) => {
  const p = g.player
  const wantsNew = kinds.includes('new')
  const wantsForm = kinds.includes('upgrade')
  if (!wantsForm) return pickNew(g, unowned, 3)
  const forks = forkOptions(g)
  if (!wantsNew) return [...forks, ...tasteOptions(g, 3 - forks.length), ...reformOptions(g, 3)].slice(0, 3)
  if (p.skills.length === 0) return pickNew(g, unowned, 3)
  const third = () => (slotsFull
    ? drawWeighted([...tasteOptions(g, 1), ...pickNew(g, unowned, 1)], () => 1, 1)
    : [...pickNew(g, unowned, 1), ...tasteOptions(g, 1)].slice(0, 1))
  const dealt = forks.length ? [...forks, ...third()] : late(g, unowned, slotsFull)
  if (dealt.length === 0) return [{ type: 'mend' }]
  return hurting(g) ? [...dealt.slice(0, 2), { type: 'mend' }] : dealt
}

export const offerExists = (g, unowned) => forkOptions(g).length > 0 || tasteOptions(g, 1).length > 0 || unowned.length > 0

export const addTaste = (p, kind, tag) => {
  p.diet = { ...p.diet, [kind]: [...(p.diet?.[kind] ?? []), tag] }
}
