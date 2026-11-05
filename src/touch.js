import { ORIGIN, VIEW } from './config.js'
import { LAYOUT, isTall } from './layout.js'
import { touchFinger } from './controls.js'
import { save } from './store.js'

const STICK = 18
const DEAD = 0.18
const RUN = 0.3
const STEEP = 1.2
const CLIMB = 0.55
const DRAG = 5
const SLOP = 7

const edges = () => {
  const { inset } = LAYOUT
  return { left: inset.left + 4, right: VIEW.w - inset.right - 4, top: inset.top + 3, bottom: VIEW.h - inset.bottom - 4 }
}

export const pauseButton = () => {
  const { left, top } = edges()
  return { action: 'pause', x: left + 8, y: top + 7, r: 8 }
}

export const stickRest = () => {
  const { left, bottom } = edges()
  return { x: left + 30, y: bottom - 30 }
}

export const touchButtons = () => {
  const { right, bottom } = edges()
  const skillRow = bottom - 74
  const extras = isTall()
    ? [{ action: 'bomb', x: right - 118, y: bottom - 22, r: 12 }, { action: 'look', x: right - 118, y: bottom - 56, r: 12 }]
    : [{ action: 'bomb', x: right - 84, y: bottom - 106, r: 12 }, { action: 'look', x: right - 52, y: bottom - 106, r: 12 }]
  return [
    { action: 'jump', x: right - 25, y: bottom - 25, r: 24 },
    { action: 'shoot', x: right - 76, y: bottom - 22, r: 22 },
    { action: 'skill', x: right - 20, y: skillRow, r: 14 },
    { action: 'skill2', x: right - 52, y: skillRow, r: 14 },
    { action: 'skill3', x: right - 84, y: skillRow, r: 14 },
    ...(touchView.slots > 3 ? [{ action: 'skill4', x: right - 20, y: skillRow - 30, r: 14 }] : []),
    ...extras,
  ]
}

const fingers = new Map()
const flicked = new Set()
let tap = null

export const touchView = { stick: null, held: new Set(), aim: null, slots: 3 }

const toView = (screen, touch) => {
  const box = screen.getBoundingClientRect()
  return { x: ((touch.clientX - box.left) / box.width) * VIEW.w, y: ((touch.clientY - box.top) / box.height) * VIEW.h }
}

const within = ({ x, y }, b, slop) => Math.hypot(x - b.x, y - b.y) <= b.r + slop

const nearest = (at, buttons) => {
  const reached = buttons.filter(b => within(at, b, SLOP))
  return reached.sort((a, b) => Math.hypot(at.x - a.x, at.y - a.y) - Math.hypot(at.x - b.x, at.y - b.y))[0]
}

const inStickZone = at => at.x < (isTall() ? VIEW.w * 0.42 : ORIGIN.x) && (isTall() ? at.y > ORIGIN.y + 224 : true)

const claim = (at, playing) => {
  if (within(at, pauseButton(), SLOP)) return { kind: 'button', action: 'pause', from: at, at }
  if (!playing) return { kind: 'tap', from: at, at }
  const button = nearest(at, touchButtons())
  if (button) return { kind: 'button', action: button.action, from: { x: button.x, y: button.y }, at }
  return inStickZone(at) ? { kind: 'stick', from: at, at } : { kind: 'none', from: at, at }
}

let playing = () => false

const wakeLock = () => {
  try {
    navigator.wakeLock?.request?.('screen')?.catch?.(() => {})
  } catch {
    return
  }
}

export const listenTouch = isPlaying => {
  playing = isPlaying
  const screen = () => document.getElementById('screen')
  const start = e => {
    e.preventDefault()
    touchFinger()
    wakeLock()
    for (const touch of e.changedTouches) {
      const at = toView(screen(), touch)
      const finger = claim(at, playing())
      fingers.set(touch.identifier, finger)
      if (finger.kind === 'button') flicked.add(finger.action)
      if (finger.kind === 'tap') tap = { x: at.x - ORIGIN.x, y: at.y - ORIGIN.y, fresh: true }
    }
  }
  const moved = e => {
    e.preventDefault()
    for (const touch of e.changedTouches) {
      const finger = fingers.get(touch.identifier)
      if (finger) finger.at = toView(screen(), touch)
    }
  }
  const ended = e => {
    e.preventDefault()
    for (const touch of e.changedTouches) fingers.delete(touch.identifier)
  }
  const options = { passive: false }
  window.addEventListener('touchstart', start, options)
  window.addEventListener('touchmove', moved, options)
  window.addEventListener('touchend', ended, options)
  window.addEventListener('touchcancel', ended, options)
  window.addEventListener('blur', () => fingers.clear())
  document.addEventListener('visibilitychange', () => fingers.clear())
}

const stickInput = ({ from, at }) => {
  const dx = (at.x - from.x) / STICK
  const dy = (at.y - from.y) / STICK
  const length = Math.hypot(dx, dy)
  if (length < DEAD) return {}
  const x = dx / Math.max(1, length)
  const y = dy / Math.max(1, length)
  const steep = Math.abs(y) > Math.abs(x) * STEEP
  return {
    ...(x < -RUN ? { left: true } : {}),
    ...(x > RUN ? { right: true } : {}),
    ...(steep && y < -CLIMB ? { up: true } : {}),
    ...(steep && y > CLIMB ? { down: true } : {}),
    aim: { x, y, free: false },
  }
}

const shootAim = ({ from, at }) => {
  const dx = at.x - from.x
  const dy = at.y - from.y
  const length = Math.hypot(dx, dy)
  return length < DRAG ? null : { x: dx / length, y: dy / length, free: true }
}

export const readTouch = () => {
  const held = {}
  touchView.stick = null
  touchView.held.clear()
  touchView.aim = null
  for (const finger of fingers.values()) {
    if (finger.kind === 'stick') {
      Object.assign(held, stickInput(finger))
      touchView.stick = finger
    }
    if (finger.kind === 'button') {
      held[finger.action] = true
      touchView.held.add(finger.action)
    }
  }
  const shooter = [...fingers.values()].find(f => f.action === 'shoot')
  const dragged = shooter && shootAim(shooter)
  if (dragged) {
    held.aim = dragged
    touchView.aim = dragged
  }
  for (const action of flicked) held[action] = true
  flicked.clear()
  if (tap) {
    held.pointer = { x: tap.x, y: tap.y }
    held.click = tap.fresh || [...fingers.values()].some(f => f.kind === 'tap')
    if (!tap.fresh && !held.click) tap = null
    else tap.fresh = false
  }
  if (save.settings.autofire) held.autofire = true
  return held
}
