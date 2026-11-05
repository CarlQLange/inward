const ART = {
  crawler: [23, 12], spitter: [21, 17], fish: [21, 18], spore: [20, 20], bat: [29, 19], slug: [26, 18], jelly: [17, 21],
  worm: [17, 25], turret: [22, 13], bomber: [15, 24], imp: [22, 26], emberbat: [28, 20], slime: [22, 17], crab: [24, 18],
  nest: [16, 24], mimic: [22, 16], gasbag: [15, 24], tick: [10, 6], pillbug: [20, 12], stilt: [27, 27], snapweed: [12, 26],
  scrapper: [20, 24], dripper: [12, 20], shade: [20, 24], urchin: [21, 20], coil: [20, 26], lantern: [24, 21],
  mole: [22, 24], hermit: [17, 22], miner: [22, 22], cartographer: [25, 21], tinker: [21, 24], bloodletter: [16, 24],
  bellows: [66, 65], colossus: [69, 59], crucible: [54, 68], eel: [28, 26], eelseg: [16, 19], brood: [43, 65],
  conductor: [48, 66], core: [64, 54],
}

const ANCHORS = {
  fish: 'free', spore: 'free', bat: 'free', jelly: 'free', emberbat: 'free', gasbag: 'free', puffer: 'free', lantern: 'free',
  urchin: 'free', shade: 'free', gnat: 'free', core: 'free', eel: 'free', eelseg: 'free', orbit: 'free',
  snapweed: 'hang', dripper: 'hang', brood: 'hang', crucible: 'hang', lamp: 'hang', battery: 'hang', tank: 'hang', carboy: 'hang', ladle: 'hang', sandbag: 'hang', turret: 'wall',
}

const ART_ALIAS = { eel: 'eelhead', eelseg: 'eelbody' }

const REACH = 0.82

export const artKind = kind => ART_ALIAS[kind] ?? kind
export const anchorOf = kind => ANCHORS[kind] ?? 'ground'

const OUTLINE = 1

const TOPS = {
  ground: (e, h) => e.y + e.h - h + OUTLINE,
  hang: e => e.y - OUTLINE,
  free: (e, h) => e.y + e.h / 2 - h / 2,
  wall: (e, h) => e.y + e.h / 2 - h / 2,
}

export const artTop = (e, height) => TOPS[e.fallen ? 'ground' : anchorOf(e.kind)](e, height)

export const shotBox = e => {
  const art = ART[e.kind]
  if (!art) return e
  const w = Math.max(e.w, art[0] * REACH)
  const h = Math.max(e.h, art[1] * REACH)
  const top = artTop(e, art[1]) + (art[1] - h) / 2
  return { x: e.x + e.w / 2 - w / 2, y: Math.min(top, e.y), w, h: Math.max(h, e.y + e.h - Math.min(top, e.y)) }
}

const CONTACT_INSET = 0.2

export const contactBox = e => ({
  x: e.x + e.w * CONTACT_INSET,
  y: e.y + e.h * CONTACT_INSET,
  w: e.w * (1 - CONTACT_INSET * 2),
  h: e.h * (1 - CONTACT_INSET * 2),
})
