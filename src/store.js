const KEY = 'block-run-save'
const OLD_BEST_KEY = 'block-run-best'

const DEFAULTS = {
  best: 0,
  bestChain: 0,
  runs: 0,
  coresReached: 0,
  deepest: 0,
  worldKills: 0,
  notes: [],
  settings: { shaders: 'full', shake: true },
}

const read = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const oldBest = Number(localStorage.getItem(OLD_BEST_KEY)) || 0
    return {
      ...DEFAULTS,
      ...saved,
      best: Math.max(saved.best ?? 0, oldBest),
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
