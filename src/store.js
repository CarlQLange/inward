const KEY = 'block-run-save'
const OLD_BEST_KEY = 'block-run-best'

const RUN_VERSION = 2

const DEFAULTS = {
  version: 2,
  found: [],
  best: 0,
  runs: 0,
  hall: [],
  notes: [],
  settings: { autofire: true, shaders: 'full', shake: true, rumble: true },
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
      hall: Array.isArray(saved.hall) ? saved.hall : [],
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

const HALL_SIZE = 5

export const recordRun = run => {
  const newBest = run.score > save.best
  Object.assign(save, {
    best: Math.max(save.best, run.score),
    runs: save.runs + 1,
    hall: [...save.hall, run].sort((a, b) => b.score - a.score).slice(0, HALL_SIZE),
  })
  persist()
  return newBest
}
