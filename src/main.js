import { TICK, VIEW } from './config.js'
import { createGame, depthHere, restart, step } from './game.js'
import { draw } from './render.js'
import { loadSprites } from './sprites.js'
import { save } from './store.js'
import { createPresenter } from './present.js'
import { device } from './controls.js'
import { listen, readInput } from './input.js'
import { rumble } from './pad.js'

await loadSprites()

let held = {}
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

if (new URLSearchParams(location.search).has('debug')) {
  window.addEventListener('keydown', e => {
    const depth = depthFromDigit(e.code)
    if (depth !== null) overrideDepth(depth)
    if (e.code === 'Digit0') overrideDepth(null)
  })
}

listen(screen)

const source = document.createElement('canvas')
source.width = VIEW.w
source.height = VIEW.h
const ctx = source.getContext('2d')
const present = createPresenter(screen)

const render = () => {
  draw(ctx, state, held.pointer)
  screen.style.cursor = device() === 'mouse' && state.menus.length > 0 ? 'default' : 'none'
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
  held = readInput()
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
  device,
  rumble,
  input: () => held,
  render,
  restart: () => restart(state),
  tick: (input = {}) => step(state, input, TICK),
  sim: (seconds, input = {}) => {
    for (let t = 0; t < seconds; t += TICK) step(state, input, TICK)
    render()
    return state
  },
}
