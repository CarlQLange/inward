import { drawText, textWidth } from './font.js'
import { padStyle, promptFor } from './controls.js'

const INK = '#04100c'
const CAP = '#c9d4c0'
const SHADOW = '#6d7a68'
const SLATE = '#3a443c'
const PALE = '#f4f8f2'
const LIT = '#ffe84a'

const HEIGHT = 9

const stamp = (ctx, rows, x, y, colour) => {
  ctx.fillStyle = colour
  rows.forEach((row, dy) => [...row].forEach((on, dx) => {
    if (on === '#') ctx.fillRect(x + dx, y + dy, 1, 1)
  }))
}

const disc = (ctx, x, y, colour) => {
  ctx.fillStyle = colour
  ;[3, 1, 1, 0, 0, 0, 1, 1, 3].forEach((inset, dy) => ctx.fillRect(x + inset, y + dy, 9 - inset * 2, 1))
}

const pill = (ctx, x, y, w, h, colour) => {
  ctx.fillStyle = colour
  ctx.fillRect(x + 1, y, w - 2, h)
  ctx.fillRect(x, y + 1, w, h - 2)
}

const SHAPES = {
  cross: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  circle: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  square: ['#####', '#...#', '#...#', '#...#', '#####'],
  triangle: ['..#..', '..#..', '.#.#.', '.#.#.', '#####'],
  view: ['.###', '.#.#', '####', '#.#.', '###.'],
  menu: ['#####', '.....', '#####', '.....', '#####'],
  stick: ['.###.', '#####', '#####', '#####', '.###.'],
  shift: ['..#..', '.###.', '#####', '.#.#.', '.###.'],
  space: ['.........', '.........', '#.......#', '#.......#', '#########'],
}

const FACES = {
  xbox: [['A', '#6fd04a'], ['B', '#ee4f42'], ['X', '#4a93f2'], ['Y', '#f6d53e']],
  nintendo: [['B', PALE], ['A', PALE], ['Y', PALE], ['X', PALE]],
  ps: [['cross', '#7fa8ff'], ['circle', '#ff6a5c'], ['square', '#f08ad0'], ['triangle', '#5fdcae']],
}

const SHOULDERS = {
  xbox: { 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT' },
  nintendo: { 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR' },
  ps: { 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2' },
}

const shoulderWidth = label => textWidth(label) + 4

const drawFace = (ctx, button, x, y) => {
  const [mark, colour] = FACES[padStyle()][button]
  if (SHAPES[mark]) {
    disc(ctx, x, y, SLATE)
    stamp(ctx, SHAPES[mark], x + 2, y + 2, colour)
  } else {
    disc(ctx, x, y, colour)
    drawText(ctx, mark, x + 3, y + 2, INK)
  }
  return 9
}

const drawShoulder = (ctx, button, x, y) => {
  const label = SHOULDERS[padStyle()][button]
  const w = shoulderWidth(label)
  const trigger = button >= 6
  pill(ctx, x, y + (trigger ? 0 : 1), w, trigger ? HEIGHT : 7, SLATE)
  if (trigger) {
    ctx.fillStyle = PALE
    ctx.fillRect(x + 1, y, w - 2, 1)
  }
  drawText(ctx, label, x + 2, y + 2, PALE)
  return w
}

const drawSmall = (ctx, shape, x, y) => {
  pill(ctx, x, y, 9, HEIGHT, SLATE)
  stamp(ctx, SHAPES[shape], x + 2, y + 2, PALE)
  return 9
}

const drawStick = (ctx, label, x, y) => {
  disc(ctx, x, y, SLATE)
  if (label) drawText(ctx, label, x + 3, y + 2, PALE)
  else stamp(ctx, SHAPES.stick, x + 2, y + 2, PALE)
  return 9
}

const drawPad = (ctx, button, x, y) => {
  if (button === 'stick') return drawStick(ctx, '', x, y)
  if (button === 'rstick') return drawStick(ctx, 'R', x, y)
  if (button === 8) return drawSmall(ctx, 'view', x, y)
  if (button === 9) return drawSmall(ctx, 'menu', x, y)
  return button <= 3 ? drawFace(ctx, button, x, y) : drawShoulder(ctx, button, x, y)
}

const keyWidth = ({ label, icon }) => (icon === 'arrows' ? 14 : icon === 'space' ? 13 : icon ? 9 : Math.max(9, textWidth(label) + 4))

const drawKey = (ctx, key, x, y) => {
  const w = keyWidth(key)
  if (key.icon === 'arrows') {
    ctx.fillStyle = CAP
    for (const [dx, dy] of [[5, 0], [0, 5], [5, 5], [10, 5]]) ctx.fillRect(x + dx, y + dy, 4, 4)
    return w
  }
  pill(ctx, x, y, w, HEIGHT - 1, CAP)
  ctx.fillStyle = SHADOW
  ctx.fillRect(x + 1, y + HEIGHT - 1, w - 2, 1)
  if (key.icon) stamp(ctx, SHAPES[key.icon], x + Math.floor((w - SHAPES[key.icon][0].length) / 2), y + 1, INK)
  else drawText(ctx, key.label, x + Math.floor((w - textWidth(key.label)) / 2), y + 1, INK)
  return w
}

const MOUSE_BODY = ['.#####.', '#..#..#', '#..#..#', '#..#..#', '#######', '#.....#', '#.....#', '#.....#', '.#####.']
const MOUSE_LEFT = ['.', '.##', '.##', '.##']
const MOUSE_WHEEL = ['.#.', '.#.', '.#.']

const drawMouse = (ctx, { button }, x, y) => {
  stamp(ctx, MOUSE_BODY, x, y, CAP)
  if (button === 'left') stamp(ctx, MOUSE_LEFT, x, y, LIT)
  else stamp(ctx, MOUSE_WHEEL, x + 2, y + 1, LIT)
  return 7
}

const DRAWERS = {
  pad: (ctx, glyph, x, y) => drawPad(ctx, glyph.button, x, y),
  key: drawKey,
  mouse: drawMouse,
}

export const drawPrompt = (ctx, action, x, y) => {
  const glyph = promptFor(action)
  return glyph ? DRAWERS[glyph.kind](ctx, glyph, Math.round(x), Math.round(y)) : 0
}

const padWidth = ({ button }) => {
  if (typeof button === 'string' || button <= 3 || button === 8 || button === 9) return 9
  return shoulderWidth(SHOULDERS[padStyle()][button])
}

const WIDTHS = { pad: padWidth, key: keyWidth, mouse: () => 7 }

export const promptWidth = action => {
  const glyph = promptFor(action)
  return glyph ? WIDTHS[glyph.kind](glyph) : 0
}

export const PROMPT_HEIGHT = HEIGHT

export const drawPromptRow = (ctx, actions, centre, y, gap = 3) => {
  const shown = actions.filter(promptFor)
  const total = shown.reduce((sum, action) => sum + promptWidth(action) + gap, -gap)
  shown.reduce((x, action) => x + drawPrompt(ctx, action, x, y) + gap, centre - total / 2)
}
