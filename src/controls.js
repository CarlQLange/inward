import { save } from './store.js'

const COMMON = {
  Enter: 'confirm',
  Escape: 'pause', KeyP: 'pause',
  Tab: 'skills',
  KeyM: 'map',
  ShiftLeft: 'look', ShiftRight: 'look',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Space: 'jump',
}

export const SCHEMES = {
  keys: {
    name: 'KEYBOARD',
    bindings: {
      ...COMMON,
      KeyZ: 'jump',
      KeyX: 'shoot',
      KeyC: 'skill', KeyV: 'skill2', KeyD: 'skill3', KeyF: 'skill4',
      KeyS: 'plant',
      KeyA: 'bomb',
      KeyQ: 'look',
    },
    labels: { skills: ['C', 'V', 'D', 'F'], jump: 'Z', shoot: 'X', bomb: 'A' },
    help: [
      ['ARROWS', 'MOVE AND AIM'],
      ['Z OR SPACE', 'JUMP, LEAP OUT OF LIQUID'],
      ['X', 'SHOOT. AIM ASSIST HELPS'],
      ['C V D F', 'SKILLS'],
      ['HOLD S', 'STAND STILL TO AIM'],
      ['A', 'THROW A BOMB'],
      ['DOWN', 'CROUCH, OR AIM DOWN IN AIR'],
      ['UP', 'CLIMB VINES'],
    ],
    intro: 'ARROWS MOVE. Z JUMPS. X SHOOTS. HOLD S TO AIM. HOLD Q TO LOOK.',
  },
  mouse: {
    name: 'MOUSE',
    bindings: {
      ...COMMON,
      KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
      KeyQ: 'skill', KeyE: 'skill2', KeyR: 'skill3', KeyF: 'skill4',
      KeyG: 'bomb',
    },
    labels: { skills: ['Q', 'E', 'R', 'F'], jump: 'SPACE', shoot: 'CLICK', bomb: 'G' },
    help: [
      ['WASD', 'MOVE'],
      ['MOUSE', 'AIM ANYWHERE'],
      ['SPACE', 'JUMP, LEAP OUT OF LIQUID'],
      ['CLICK', 'SHOOT'],
      ['Q E R F', 'SKILLS'],
      ['RIGHT CLICK', 'FIRST SKILL'],
      ['G', 'THROW A BOMB'],
      ['S', 'CROUCH.  W CLIMBS VINES'],
    ],
    intro: 'WASD MOVES. SPACE JUMPS. MOUSE AIMS AND SHOOTS. HOLD SHIFT TO LOOK.',
  },
}

export const COMMON_HELP = [
  ['SHIFT', 'LOOK: SEE WHAT HURTS'],
  ['TAB', 'SKILLS PAGE'],
  ['M', 'MAP'],
  ['ESC', 'PAUSE'],
]

export const scheme = () => SCHEMES[save.settings.controls] ?? SCHEMES.keys
export const skillKey = slot => scheme().labels.skills[slot]
export const usesMouse = () => save.settings.controls === 'mouse'
