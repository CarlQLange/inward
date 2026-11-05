const ARROW_HAND = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyZ: 'jump', KeyX: 'shoot',
  KeyC: 'skill', KeyV: 'skill2', KeyB: 'skill3', KeyN: 'skill4',
}

const MOUSE_HAND = {
  KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
  KeyQ: 'skill', KeyE: 'skill2', KeyR: 'skill3', KeyT: 'skill4',
}

const EITHER_HAND = {
  Space: 'jump',
  KeyF: 'bomb',
  AltLeft: 'plant', AltRight: 'plant', KeyG: 'plant',
  ShiftLeft: 'look', ShiftRight: 'look',
  Enter: 'confirm',
  Backspace: 'back',
  Escape: 'pause', KeyP: 'pause',
  Tab: 'skills',
  KeyM: 'map',
}

export const KEYS = { ...ARROW_HAND, ...MOUSE_HAND, ...EITHER_HAND }

export const SKILL_ACTIONS = ['skill', 'skill2', 'skill3', 'skill4']

const keycap = (label, wide) => ({ kind: 'key', label, wide })
const mouse = button => ({ kind: 'mouse', button })
const pad = button => ({ kind: 'pad', button })

const ANY_HAND_PROMPTS = {
  bomb: keycap('F'),
  plant: keycap('OPT'),
  look: { kind: 'key', icon: 'shift' },
  pause: keycap('ESC'),
  skills: keycap('TAB'),
  map: keycap('M'),
  back: keycap('ESC'),
  confirm: keycap('ENT'),
}

const PROMPTS = {
  keys: {
    ...ANY_HAND_PROMPTS,
    move: { kind: 'key', icon: 'arrows' },
    aim: { kind: 'key', icon: 'arrows' },
    jump: keycap('Z'),
    shoot: keycap('X'),
    skill: keycap('C'), skill2: keycap('V'), skill3: keycap('B'), skill4: keycap('N'),
  },
  mouse: {
    ...ANY_HAND_PROMPTS,
    move: keycap('WASD'),
    aim: mouse('move'),
    jump: { kind: 'key', icon: 'space' },
    shoot: mouse('left'),
    skill: keycap('Q'), skill2: keycap('E'), skill3: keycap('R'), skill4: keycap('T'),
    confirm: mouse('left'),
  },
  touch: {},
  pad: {
    move: pad('stick'),
    aim: pad('rstick'),
    jump: pad(0),
    confirm: pad(0),
    back: pad(1),
    skill: pad(1),
    skill2: pad(3),
    skill3: pad(5),
    skill4: pad('rstick'),
    shoot: pad(7),
    bomb: pad(4),
    look: pad(6),
    pause: pad(9),
    map: pad(8),
  },
}

const current = { device: 'keys', hand: 'keys', pad: 'xbox' }

export const device = () => current.device
export const padStyle = () => current.pad

export const touchFinger = () => { current.device = 'touch' }

export const touchPad = style => {
  current.device = 'pad'
  current.pad = style
}

export const touchMouse = () => {
  current.device = 'mouse'
  current.hand = 'mouse'
}

export const touchKey = code => {
  const hand = code in ARROW_HAND ? 'keys' : code in MOUSE_HAND ? 'mouse' : current.hand
  current.hand = hand
  current.device = hand
}

export const dropPad = () => { current.device = current.hand }

export const promptFor = action => PROMPTS[current.device][action] ?? null
export const skillAction = slot => SKILL_ACTIONS[slot]

export const CONTROL_ROWS = [
  ['move', 'MOVE'],
  ['aim', 'AIM'],
  ['jump', 'JUMP'],
  ['shoot', 'SHOOT'],
  [SKILL_ACTIONS, 'SKILLS'],
  ['bomb', 'BOMB'],
  ['plant', 'HOLD STILL'],
  ['look', 'LOOK'],
  ['skills', 'SKILLS PAGE'],
  ['map', 'MAP'],
  ['pause', 'PAUSE'],
]
