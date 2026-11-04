import { TICK, VIEW } from './config.js'
import { createGame, restart, step } from './game.js'
import { draw } from './render.js'
import { loadSprites } from './sprites.js'
import { createPresenter } from './present.js'

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', Space: 'jump',
  KeyX: 'shoot', KeyJ: 'shoot',
  KeyC: 'skill', KeyK: 'skill',
  KeyV: 'skill2', KeyL: 'skill2',
  KeyB: 'skill3', KeyN: 'skill3',
}

await loadSprites()

const held = {}
const state = createGame()

const depthFromDigit = code => {
  const match = code.match(/^Digit([1-9])$/)
  return match ? (Number(match[1]) - 1) / 8 : null
}

const overrideDepth = depth => {
  state.depthOverride = depth
  if (depth !== null) state.depth = depth
  else state.depth = state.awake ? 0.25 + 0.75 * (state.index / (state.rooms.length - 1)) : state.index / (state.rooms.length - 1)
}

window.addEventListener('keydown', e => {
  if (KEYS[e.code]) {
    held[KEYS[e.code]] = true
    e.preventDefault()
  }
  const depth = depthFromDigit(e.code)
  if (depth !== null) overrideDepth(depth)
  if (e.code === 'Digit0') overrideDepth(null)
  if (e.code === 'KeyR') restart(state)
  if (e.code === 'KeyH') document.getElementById('hint').hidden ^= true
})
window.addEventListener('keyup', e => {
  if (KEYS[e.code]) held[KEYS[e.code]] = false
})
window.addEventListener('blur', () => Object.keys(held).forEach(k => { held[k] = false }))

const source = document.createElement('canvas')
source.width = VIEW.w
source.height = VIEW.h
const ctx = source.getContext('2d')
const present = createPresenter(document.getElementById('screen'))

const render = () => {
  draw(ctx, state)
  present(source, { ...state, depth: state.shownDepth })
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
