const stage = ({ lean = {}, pockets = [], layouts = [], crowd = 0 }) => ({
  lean: { metal: false, water: false, fuel: false, scrap: false, ...lean },
  pockets,
  layouts,
  crowd,
})

const FOES = stage({ crowd: 3 })

const STAGES = {
  ember: stage({ lean: { fuel: true }, pockets: ['marsh', 'tar'] }),
  bolt: stage({ lean: { water: true, metal: true }, pockets: ['cistern', 'seam'] }),
  frost: stage({ lean: { water: true }, pockets: ['cistern'] }),
  melt: stage({ pockets: ['rime', 'vein'] }),
  repel: stage({ lean: { metal: true, scrap: true }, pockets: ['seam'] }),
  seed: stage({ lean: { water: true }, pockets: ['cistern'] }),
  mason: stage({ layouts: ['chasm', 'islands'] }),
  spring: stage({ lean: { water: true }, pockets: ['cistern', 'rime'], layouts: ['chimney'] }),
  gust: stage({ lean: { fuel: true }, pockets: ['marsh'] }),
  acid: stage({ lean: { metal: true }, pockets: ['seep'] }),
  hammer: stage({ pockets: ['hopper'], layouts: ['caves', 'hall'] }),
  alchemy: stage({ lean: { water: true, fuel: true }, pockets: ['cistern', 'tar', 'seep'] }),
  flask: stage({ lean: { water: true, fuel: true }, pockets: ['cistern', 'tar'] }),
  wick: stage({ lean: { fuel: true }, pockets: ['marsh', 'tar'] }),
  clay: stage({ lean: { water: true }, pockets: ['cistern', 'vein'] }),
  burrow: stage({ lean: { water: true }, pockets: ['hopper'], layouts: ['tunnels', 'caves'] }),
  lens: stage({ pockets: ['hopper', 'rime'] }),
  chime: stage({ pockets: ['rime'] }),
  grapple: stage({ layouts: ['chasm', 'chimney'] }),
  float: stage({ layouts: ['chasm', 'islands'] }),
  blink: stage({ layouts: ['tunnels', 'caves'] }),
  dash: stage({ crowd: 2, layouts: ['hall'] }),
  swap: FOES,
  roar: FOES,
  stop: FOES,
  charm: FOES,
  link: FOES,
  mine: FOES,
  well: FOES,
  drone: FOES,
  rewind: FOES,
}

export const stageFor = kind => STAGES[kind] ?? null
