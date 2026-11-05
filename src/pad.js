import { TUNING } from './config.js'
import { device, dropPad, touchPad } from './controls.js'
import { save } from './store.js'

const I = TUNING.input

const BUTTONS = {
  jump: [0],
  shoot: [2],
  skill: [1], back: [1],
  skill2: [3],
  skill3: [5],
  skill4: [11],
  bomb: [4],
  map: [8],
  pause: [9],
  up: [12], down: [13], left: [14], right: [15],
}

const STYLES = [
  [/xbox|xinput|045e/i, 'xbox'],
  [/dualsense|dualshock|playstation|054c/i, 'ps'],
  [/nintendo|joy-?con|switch|pro controller|057e/i, 'nintendo'],
]

const styleOf = id => STYLES.find(([pattern]) => pattern.test(id))?.[1] ?? 'xbox'

const connected = () => [...(globalThis.navigator?.getGamepads?.() ?? [])].filter(p => p && p.connected !== false)

const rests = new Map()
const gates = {}
let active = null
let lostUntil = 0
let latch = null
let released = 0
let lastPull = 0
let movingSince = 0

const restOf = pad => {
  if (!rests.has(pad.index)) rests.set(pad.index, [...pad.axes])
  return rests.get(pad.index)
}

const touched = pad =>
  pad.buttons.some(b => b.pressed || b.value > I.triggerOn) ||
  pad.axes.some((value, i) => Math.abs(value - restOf(pad)[i]) > I.touch)

const noteTouches = (pads, now) => {
  const pad = pads.find(touched)
  if (pad) {
    active = pad.index
    touchPad(styleOf(pad.id))
    return
  }
  if (active !== null && !pads.some(p => p.index === active)) {
    active = null
    latch = null
    lostUntil = now + I.lostPause
    if (device() === 'pad') dropPad()
  }
}

const radial = (x = 0, y = 0, inner) => {
  const length = Math.hypot(x, y)
  if (length < inner) return { x: 0, y: 0, pull: 0 }
  const pull = Math.min(1, (length - inner) / (I.stickOuter - inner))
  return { x: (x / length) * pull, y: (y / length) * pull, pull }
}

const gate = (name, value, on, off) => {
  gates[name] = value > (gates[name] ? off : on)
  return gates[name]
}

const stickDirections = ({ x, y }) => {
  const steep = Math.abs(y) > Math.abs(x) * I.steepness
  return {
    left: gate('left', -x, I.runOn, I.runOff),
    right: gate('right', x, I.runOn, I.runOff),
    up: gate('up', steep ? -y : 0, I.climbOn, I.climbOff),
    down: gate('down', steep ? y : 0, I.climbOn, I.climbOff),
  }
}

const trigger = (name, button) => gate(name, button?.pressed ? 1 : button?.value ?? 0, I.triggerOn, I.triggerOff)

const aimOf = (left, right, dpad, now) => {
  const snappingBack = right.pull < lastPull - I.snapBack
  lastPull = right.pull
  if (left.pull === 0) movingSince = now
  if (right.pull > 0 && !snappingBack) {
    latch = { x: right.x, y: right.y, free: true }
    released = now
    return latch
  }
  if (dpad) latch = null
  if (latch && left.pull > 0 && now - Math.max(released, movingSince) > I.latchAfterMove) latch = null
  return latch ?? (left.pull > 0 ? { x: left.x, y: left.y, free: false } : undefined)
}

export const readPad = now => {
  const pads = connected()
  noteTouches(pads, now)
  const lost = now < lostUntil ? { pause: true } : {}
  const pad = pads.find(p => p.index === active)
  if (!pad) return lost
  const moved = radial(pad.axes[0], pad.axes[1], I.moveInner)
  const aimed = radial(pad.axes[2], pad.axes[3], I.aimInner)
  const dpad = [12, 13, 14, 15].some(b => pad.buttons[b]?.pressed)
  const pressed = Object.entries(BUTTONS).filter(([, indices]) => indices.some(b => pad.buttons[b]?.pressed)).map(([action]) => [action, true])
  const stick = Object.entries(stickDirections(moved)).filter(([, on]) => on)
  return {
    ...lost,
    ...Object.fromEntries(pressed),
    ...Object.fromEntries(stick),
    ...(trigger('rt', pad.buttons[7]) ? { shoot: true } : {}),
    ...(trigger('lt', pad.buttons[6]) ? { look: true } : {}),
    aim: aimOf(moved, aimed, dpad, now),
  }
}

let rumbleEnds = 0
let rumbleLevel = 0

export const rumble = (strength = 0.5, ms = 120) => {
  if (!save.settings.rumble || device() !== 'pad') return
  const now = performance.now()
  if (now < rumbleEnds && strength < rumbleLevel) return
  const motor = connected().find(p => p.index === active)
  rumbleEnds = now + ms
  rumbleLevel = strength
  try {
    const played = motor?.vibrationActuator?.playEffect?.('dual-rumble', {
      duration: ms,
      strongMagnitude: Math.min(1, strength * strength),
      weakMagnitude: Math.min(1, strength),
    })
    played?.catch?.(() => {})
    if (!motor?.vibrationActuator) motor?.hapticActuators?.[0]?.pulse?.(strength, ms)
  } catch {
    rumbleEnds = 0
  }
}
