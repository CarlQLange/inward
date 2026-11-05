import { TICK, VIEW } from './config.js'
import { createGame, depthHere, restart, step } from './game.js'
import { draw, shakeOf, worldLayers } from './render.js'
import { loadSprites } from './sprites.js'
import { save } from './store.js'
import { createPresenter } from './present.js'
import './stage.js'
import { device, touchFinger } from './controls.js'
import { listen, readInput } from './input.js'
import { rumble } from './pad.js'
import { listenTouch } from './touch.js'
import { fitTouch, isTouchLayout, wantsTouch } from './layout.js'

await loadSprites()

if (wantsTouch()) touchFinger()

let held = {}
const state = createGame(null, 'title')

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

listen()
listenTouch(() => state.phase === 'playing' && state.menus.length === 0)

const source = document.createElement('canvas')
const ctx = source.getContext('2d')
let present = null

const shape = () => `${window.innerWidth}x${window.innerHeight}`
let shaped = ''

const layOut = () => {
  if (isTouchLayout() || wantsTouch()) fitTouch()
  source.width = VIEW.w
  source.height = VIEW.h
  const canvas = document.createElement('canvas')
  canvas.id = 'screen'
  document.getElementById('screen').replaceWith(canvas)
  present?.release?.()
  present = createPresenter(canvas)
  shaped = shape()
}

layOut()

const render = () => {
  draw(ctx, state, held.pointer)
  document.getElementById('screen').style.cursor = device() === 'mouse' && state.menus.length > 0 ? 'default' : 'none'
  const { shaders } = save.settings
  const limit = { full: 1, soft: 0.6, off: 0.36 }[shaders]
  const pulse = { full: 1, soft: 0.4, off: 0 }[shaders]
  const depth = Math.min(state.shownDepth, limit)
  const summary = state.menus.at(-1)?.page === 'summary' ? state.menus.at(-1) : null
  const desat = summary ? Math.min(state.desat, Math.max(0.3, 1 - summary.age * 0.7)) : state.desat
  present({ front: source, ...worldLayers(state, depth) }, { ...state, desat, depth, pulse: state.pulse * pulse, stop: state.timeStop > 0 ? 1 : state.held ? 0.3 : 0 }, shakeOf(state))
}

let last = performance.now()
let owed = 0
const frame = now => {
  if (isTouchLayout() && shape() !== shaped) layOut()
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
