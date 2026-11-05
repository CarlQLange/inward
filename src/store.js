const KEY = 'block-run-save'
const OLD_BEST_KEY = 'block-run-best'

const RUN_VERSION = 2

const DEFAULTS = {
  version: 2,
  found: [],
  ghost: null,
  best: 0,
  bestChain: 0,
  runs: 0,
  coresReached: 0,
  deepest: 0,
  worldKills: 0,
  notes: [],
  settings: { shaders: 'full', shake: true, controls: 'keys' },
}

const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const oldBest = Number(localStorage.getItem(OLD_BEST_KEY)) || 0
    return {
      ...DEFAULTS,
      ...saved,
      best: Math.max(saved.best ?? 0, oldBest),
      found: Array.isArray(saved.found) ? saved.found : [],
      settings: { ...DEFAULTS.settings, ...saved.settings },
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export const save = read()
export const knownNotes = new Set(save.notes)

export const persist = () => {
  save.notes = [...knownNotes]
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    return
  }
}

const RUN_KEY = 'block-run-current'

export const saveRun = run => {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({ ...run, version: RUN_VERSION }))
  } catch {
    return
  }
}

export const loadRun = () => {
  try {
    const run = JSON.parse(localStorage.getItem(RUN_KEY))
    return run?.version === RUN_VERSION ? run : null
  } catch {
    return null
  }
}

export const clearRun = () => {
  try {
    localStorage.removeItem(RUN_KEY)
  } catch {
    return
  }
}

export const hasRun = () => loadRun() !== null

export const recordRun = ({ score, chainPeak, roomReached, reachedCore, worldKills }) => {
  const newBest = score > save.best
  Object.assign(save, {
    best: Math.max(save.best, score),
    bestChain: Math.max(save.bestChain, chainPeak),
    runs: save.runs + 1,
    coresReached: save.coresReached + (reachedCore ? 1 : 0),
    deepest: Math.max(save.deepest, roomReached),
    worldKills: save.worldKills + worldKills,
  })
  persist()
  return newBest
}
