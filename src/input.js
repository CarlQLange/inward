import { ORIGIN, TUNING, VIEW } from './config.js'
import { KEYS, device, touchKey, touchMouse } from './controls.js'
import { readPad } from './pad.js'

const I = TUNING.input

const MOUSE = { MouseLeft: ['shoot', 'click'], MouseRight: ['skill'] }
const actionsOf = code => MOUSE[code] ?? [KEYS[code]]

const down = new Set()
const flicked = new Set()
let pointer = null
let travel = 0
let lastMove = 0
let lastSeen = null

const consumes = e => !e.metaKey && !e.ctrlKey && KEYS[e.code] !== undefined

const press = code => {
  down.add(code)
  flicked.add(code)
}

const release = () => {
  down.clear()
  flicked.clear()
}

const toRoom = (screen, e) => {
  const box = screen.getBoundingClientRect()
  return {
    x: ((e.clientX - box.left) / box.width) * VIEW.w - ORIGIN.x,
    y: ((e.clientY - box.top) / box.height) * VIEW.h - ORIGIN.y,
  }
}

const noteTravel = e => {
  const now = performance.now()
  const step = lastSeen ? Math.hypot(e.clientX - lastSeen.x, e.clientY - lastSeen.y) : 0
  travel = (now - lastMove > I.mouseWindow ? 0 : travel) + step
  lastMove = now
  lastSeen = { x: e.clientX, y: e.clientY }
  if (travel >= I.mouseTravel) touchMouse()
}

export const listen = screen => {
  window.addEventListener('keydown', e => {
    if (!consumes(e)) return
    e.preventDefault()
    press(e.code)
    touchKey(e.code)
  })
  window.addEventListener('keyup', e => {
    down.delete(e.code)
    if (e.key === 'Meta') release()
  })
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', release)
  window.addEventListener('mousemove', e => {
    pointer = toRoom(screen, e)
    noteTravel(e)
  })
  window.addEventListener('mousedown', e => {
    pointer = toRoom(screen, e)
    touchMouse()
    press(e.button === 0 && !e.ctrlKey ? 'MouseLeft' : 'MouseRight')
  })
  window.addEventListener('mouseup', () => {
    down.delete('MouseLeft')
    down.delete('MouseRight')
  })
  window.addEventListener('contextmenu', e => e.preventDefault())
}

const fromHeld = () => {
  const held = Object.fromEntries([...down, ...flicked].flatMap(actionsOf).map(action => [action, true]))
  flicked.clear()
  return held
}

export const readInput = () => {
  const { aim, ...pad } = readPad(performance.now())
  const from = device()
  return {
    ...pad,
    ...fromHeld(),
    ...(from === 'pad' && aim ? { aim } : {}),
    ...(from === 'mouse' && pointer ? { pointer } : {}),
  }
}
