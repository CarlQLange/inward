const ART = {
  crawler: [24, 17], spitter: [20, 21], fish: [20, 16], spore: [20, 20], bat: [26, 15], slug: [29, 17], jelly: [23, 17],
  worm: [24, 23], turret: [22, 13], bomber: [14, 24], imp: [23, 22], emberbat: [25, 19], slime: [21, 13], crab: [21, 22],
  nest: [14, 24], mimic: [19, 22], gasbag: [27, 24], tick: [10, 7], pillbug: [20, 14], stilt: [22, 28], snapweed: [12, 28],
  scrapper: [23, 24], dripper: [11, 21], shade: [22, 27], urchin: [22, 22], coil: [15, 26], lantern: [23, 22],
  mole: [19, 23], hermit: [14, 24], miner: [26, 23], cartographer: [24, 21], tinker: [22, 24], bloodletter: [15, 24],
  bellows: [66, 62], colossus: [68, 58], crucible: [65, 68], eel: [28, 26], eelseg: [18, 20], brood: [43, 68],
  conductor: [74, 64], core: [62, 61],
}

const ANCHORS = {
  fish: 'free', spore: 'free', bat: 'free', jelly: 'free', emberbat: 'free', gasbag: 'free', puffer: 'free', lantern: 'free',
  urchin: 'free', shade: 'free', gnat: 'free', core: 'free', eel: 'free', eelseg: 'free', orbit: 'free',
  snapweed: 'hang', dripper: 'hang', brood: 'hang', crucible: 'hang', lamp: 'hang', turret: 'wall',
}

const ART_ALIAS = { eel: 'eelhead', eelseg: 'eelbody' }

const REACH = 0.82

export const artKind = kind => ART_ALIAS[kind] ?? kind
export const anchorOf = kind => ANCHORS[kind] ?? 'ground'

const TOPS = {
  ground: (e, h) => e.y + e.h - h,
  hang: e => e.y,
  free: (e, h) => e.y + e.h / 2 - h / 2,
  wall: (e, h) => e.y + e.h / 2 - h / 2,
}

export const artTop = (e, height) => TOPS[anchorOf(e.kind)](e, height)

export const shotBox = e => {
  const art = ART[e.kind]
  if (!art) return e
  const w = Math.max(e.w, art[0] * REACH)
  const h = Math.max(e.h, art[1] * REACH)
  const top = artTop(e, art[1]) + (art[1] - h) / 2
  return { x: e.x + e.w / 2 - w / 2, y: Math.min(top, e.y), w, h: Math.max(h, e.y + e.h - Math.min(top, e.y)) }
}
