import { ORIGIN, TICK, VIEW } from './config.js'
import { createGame, depthHere, restart, step } from './game.js'
import { draw } from './render.js'
import { loadSprites } from './sprites.js'
import { save } from './store.js'
import { createPresenter } from './present.js'
import { scheme, usesMouse } from './controls.js'

await loadSprites()

const held = {}
const state = createGame(null, 'title')
const screen = document.getElementById('screen')

const depthFromDigit = code => {
  const match = code.match(/^Digit([1-9])$/)
  return match ? (Number(match[1]) - 1) / 8 : null
}

const overrideDepth = depth => {
  state.depthOverride = depth
  state.depth = depth ?? depthHere(state)
}

window.addEventListener('keydown', e => {
  const action = scheme().bindings[e.code]
  if (action) {
    held[action] = true
    e.preventDefault()
  }
  const depth = depthFromDigit(e.code)
  if (depth !== null) overrideDepth(depth)
  if (e.code === 'Digit0') overrideDepth(null)
})
window.addEventListener('keyup', e => {
  const action = scheme().bindings[e.code]
  if (action) held[action] = false
})
window.addEventListener('blur', () => Object.keys(held).forEach(k => { held[k] = false }))

const pointerToRoom = e => {
  const box = screen.getBoundingClientRect()
  return {
    x: ((e.clientX - box.left) / box.width) * VIEW.w - ORIGIN.x,
    y: ((e.clientY - box.top) / box.height) * VIEW.h - ORIGIN.y,
  }
}

window.addEventListener('mousemove', e => { held.pointer = pointerToRoom(e) })
window.addEventListener('mousedown', e => {
  if (!usesMouse()) return
  held.pointer = pointerToRoom(e)
  if (e.button === 0) held.shoot = true
  if (e.button === 2) held.skill = true
})
window.addEventListener('mouseup', e => {
  if (e.button === 0) held.shoot = false
  if (e.button === 2) held.skill = false
})
window.addEventListener('contextmenu', e => { if (usesMouse()) e.preventDefault() })

const source = document.createElement('canvas')
source.width = VIEW.w
source.height = VIEW.h
const ctx = source.getContext('2d')
const present = createPresenter(screen)

const render = () => {
  draw(ctx, state, held.pointer)
  const { shaders } = save.settings
  const limit = { full: 1, soft: 0.5, off: 0.25 }[shaders]
  const pulse = { full: 1, soft: 0.4, off: 0 }[shaders]
  present(source, { ...state, depth: Math.min(state.shownDepth, limit), pulse: state.pulse * pulse, stop: state.timeStop > 0 ? 1 : 0 })
}

let last = performance.now()
let owed = 0
const frame = now => {
  owed += Math.min(0.1, (now - last) / 1000)
  last = now
  while (owed >= TICK) {
    step(state, held, TICK)
    owed -= TICK
  }
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.game = {
  state,
  render,
  restart: () => restart(state),
  tick: (input = {}) => step(state, input, TICK),
  sim: (seconds, input = {}) => {
    for (let t = 0; t < seconds; t += TICK) step(state, input, TICK)
    render()
    return state
  },
}
