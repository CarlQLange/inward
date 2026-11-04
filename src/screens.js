import { BLOCK, ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { M, MATERIAL_NAMES } from './materials.js'
import { ENEMY_DEFS, ENEMY_TRAITS } from './enemies.js'
import { SKILL_DETAILS, SKILL_NAMES, TREES } from './skills.js'
import { SPRITES } from './sprites.js'
import { knownNotes, save } from './store.js'
import { drawText, textWidth, wrapText } from './font.js'
import { cardFor } from './menus.js'

const GREEN = '#76d648'
const DIM = '#3d7a3c'
const FAINT = '#26542a'
const WHITE = '#f4f8f2'
const PALE = '#c9d4c0'
const YELLOW = '#ffe84a'
const INK = '#04100c'
const ROOM_PX = ROOM * BLOCK
const CENTRE = ORIGIN.x + ROOM_PX / 2

const panel = (ctx, x, y, w, h, line = GREEN) => {
  ctx.fillStyle = INK
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = line
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

const centred = (ctx, text, y, colour, scale = 1) =>
  drawText(ctx, text, CENTRE - (textWidth(text) * scale) / 2, y, colour, scale)

const labelOf = item => (typeof item.label === 'function' ? item.label() : item.label)

const drawList = (ctx, menu, top) => {
  menu.items.forEach((item, i) => {
    const label = labelOf(item)
    const on = i === menu.selected
    const y = top + i * 11
    centred(ctx, label, y, on ? YELLOW : PALE)
    if (on) drawText(ctx, '+', CENTRE - textWidth(label) / 2 - 8, y, YELLOW)
  })
  const detail = menu.items[menu.selected]?.detail
  if (detail) {
    wrapText(detail, 40).forEach((line, n) => centred(ctx, line, top + menu.items.length * 11 + 4 + n * 7, DIM))
  }
}

const sheet = (ctx, title) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  panel(ctx, ORIGIN.x + 4, ORIGIN.y + 4, ROOM_PX - 8, ROOM_PX - 8)
  centred(ctx, title, ORIGIN.y + 12, GREEN, 2)
}

const drawTitle = (ctx, g, menu) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(ORIGIN.x, ORIGIN.y, ROOM_PX, ROOM_PX)
  const lift = Math.round(Math.sin(g.time * 1.3) * 2)
  centred(ctx, 'CORE', ORIGIN.y + 36 + lift, WHITE, 6)
  centred(ctx, 'REACH THE CENTRE', ORIGIN.y + 76, DIM)
  panel(ctx, CENTRE - 56, ORIGIN.y + 92, 112, 68)
  drawList(ctx, menu, ORIGIN.y + 100)
  if (save.best > 0) centred(ctx, `BEST ${save.best}`, ORIGIN.y + 170, YELLOW)
  centred(ctx, 'ARROWS AND Z', ORIGIN.y + 212, FAINT)
}

const drawPause = (ctx, menu) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  panel(ctx, CENTRE - 60, ORIGIN.y + 50, 120, 112)
  centred(ctx, menu.title, ORIGIN.y + 58, GREEN, 2)
  drawList(ctx, menu, ORIGIN.y + 80)
}

const drawConfirm = (ctx, menu) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  panel(ctx, CENTRE - 80, ORIGIN.y + 74, 160, 70, YELLOW)
  centred(ctx, menu.title, ORIGIN.y + 84, WHITE)
  drawList(ctx, menu, ORIGIN.y + 100)
}

const drawOptions = (ctx, menu) => {
  sheet(ctx, menu.title)
  drawList(ctx, menu, ORIGIN.y + 50)
}

const CONTROLS = [
  ['ARROWS OR WASD', 'MOVE'],
  ['UP', 'AIM UP'],
  ['DOWN', 'CROUCH, OR AIM DOWN IN AIR'],
  ['Z OR SPACE', 'JUMP, LEAP OUT OF LIQUID'],
  ['X', 'SHOOT'],
  ['C V B', 'SKILLS'],
  ['TAB', 'SKILLS PAGE'],
  ['ESC OR P', 'PAUSE'],
  ['R', 'NEW RUN'],
  ['1 TO 9', 'PREVIEW DISTANCE TO CORE'],
  ['0', 'REAL DISTANCE'],
]

const drawControls = (ctx, menu) => {
  sheet(ctx, menu.title)
  CONTROLS.forEach(([key, action], i) => {
    const y = ORIGIN.y + 36 + i * 12
    drawText(ctx, key, ORIGIN.x + 20, y, YELLOW)
    drawText(ctx, action, ORIGIN.x + 88, y, PALE)
  })
  drawList(ctx, menu, ORIGIN.y + 196)
}

const drawRecords = (ctx, menu) => {
  sheet(ctx, menu.title)
  const rows = [
    ['BEST SCORE', save.best],
    ['BEST CHAIN', save.bestChain],
    ['RUNS', save.runs],
    ['DEEPEST ROOM', save.deepest],
    ['CORES REACHED', save.coresReached],
    ['KILLED BY THE WORLD', save.worldKills],
  ]
  rows.forEach(([name, value], i) => {
    const y = ORIGIN.y + 44 + i * 14
    drawText(ctx, name, ORIGIN.x + 28, y, PALE)
    const text = String(value)
    drawText(ctx, text, ORIGIN.x + ROOM_PX - 28 - textWidth(text), y, GREEN)
  })
  drawList(ctx, menu, ORIGIN.y + 196)
}

const drawSkills = (ctx, g, menu) => {
  sheet(ctx, menu.title)
  const p = g.player
  for (let slot = 0; slot < TUNING.player.skillSlots; slot++) {
    const top = ORIGIN.y + 34 + slot * 52
    const skill = p.skills[slot]
    panel(ctx, ORIGIN.x + 14, top, 24, 24, skill ? GREEN : FAINT)
    drawText(ctx, 'CVB'[slot], ORIGIN.x + 24, top + 28, skill ? GREEN : FAINT)
    if (!skill) {
      drawText(ctx, 'EMPTY', ORIGIN.x + 46, top + 2, FAINT)
      continue
    }
    ctx.drawImage(SPRITES.icons[skill.kind], ORIGIN.x + 18, top + 4)
    drawText(ctx, SKILL_NAMES[skill.kind], ORIGIN.x + 46, top, WHITE)
    wrapText(SKILL_DETAILS[skill.kind], 40).forEach((line, n) => drawText(ctx, line, ORIGIN.x + 46, top + 7 + n * 6, PALE))
    TREES[skill.kind].forEach((node, n) => {
      const owned = p.upgrades.has(node.id)
      const y = top + 22 + n * 12
      ctx.fillStyle = owned ? YELLOW : FAINT
      ctx.fillRect(ORIGIN.x + 46, y + 1, 3, 3)
      drawText(ctx, node.name, ORIGIN.x + 52, y, owned ? YELLOW : DIM)
      drawText(ctx, node.text, ORIGIN.x + 52, y + 6, owned ? PALE : FAINT)
    })
  }
  drawList(ctx, menu, ORIGIN.y + 196)
}

const MATERIAL_ORDER = [
  M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.METAL, M.SCRAP, M.SAND, M.WATER,
  M.OIL, M.ICE, M.SMOKE, M.STEAM, M.METHANE, M.VOLATILE, M.BEDROCK,
]
const TAGS = [['burn', 'BURNS'], ['conduct', 'CONDUCTS'], ['blast', 'EXPLODES'], ['melt', 'MELTS'], ['freeze', 'FREEZES'], ['fall', 'FALLS']]

const noteLines = () => {
  const materials = MATERIAL_ORDER.filter(m => knownNotes.has(`seen:${m}`)).map(m => ({
    tile: m,
    name: MATERIAL_NAMES[m],
    text: TAGS.filter(([tag]) => knownNotes.has(`${tag}:${m}`)).map(([, word]) => word).join(' ') || 'NOTHING OBSERVED YET',
  }))
  const creatures = Object.keys(ENEMY_DEFS).filter(k => knownNotes.has(`met:${k}`)).map(k => ({
    creature: k,
    name: k.toUpperCase(),
    text: knownNotes.has(`killed:${k}`) ? ENEMY_TRAITS[k] : 'STILL A MYSTERY',
  }))
  return [...materials, ...creatures]
}

const TILE_NAME = {
  [M.ROCK]: 'rock', [M.MOSS]: 'moss', [M.PEAT]: 'peat', [M.WOOD]: 'wood', [M.METAL]: 'metal',
  [M.SCRAP]: 'scrap', [M.SAND]: 'sand', [M.ICE]: 'ice', [M.VOLATILE]: 'volatile', [M.BEDROCK]: 'bedrock',
}
const SWATCH = { [M.WATER]: '#10606e', [M.OIL]: '#5a3a64', [M.SMOKE]: '#747a72', [M.STEAM]: '#c8d8d8', [M.METHANE]: '#a878c8' }

const drawNotes = (ctx, menu) => {
  sheet(ctx, menu.title)
  const lines = noteLines()
  const perPage = 11
  menu.scroll = Math.min(menu.scroll, Math.max(0, lines.length - perPage))
  if (lines.length === 0) centred(ctx, 'NOTHING YET. GO AND LOOK.', ORIGIN.y + 90, DIM)
  lines.slice(menu.scroll, menu.scroll + perPage).forEach((line, i) => {
    const y = ORIGIN.y + 34 + i * 14
    const x = ORIGIN.x + 14
    if (line.tile !== undefined && TILE_NAME[line.tile]) ctx.drawImage(SPRITES.tiles[TILE_NAME[line.tile]][0], x, y)
    else if (line.tile !== undefined) {
      ctx.fillStyle = SWATCH[line.tile]
      ctx.fillRect(x, y, 8, 8)
    } else {
      const sprite = SPRITES.creatures[ENEMY_DEFS[line.creature].sprite[0]][0]
      ctx.drawImage(sprite, x - 3, y - 2, 14, 14)
    }
    drawText(ctx, line.name, x + 16, y - 1, WHITE)
    drawText(ctx, line.text, x + 16, y + 5, PALE)
  })
  if (lines.length > perPage) drawText(ctx, `${menu.scroll + 1}-${Math.min(lines.length, menu.scroll + perPage)} OF ${lines.length}`, ORIGIN.x + 14, ORIGIN.y + 196, DIM)
  drawList(ctx, menu, ORIGIN.y + 196)
}

const drawSummary = (ctx, g, menu) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(ORIGIN.x, ORIGIN.y, ROOM_PX, ROOM_PX)
  panel(ctx, CENTRE - 76, ORIGIN.y + 34, 152, 146)
  centred(ctx, g.phase === 'dead' ? 'YOU DIED' : 'THE CORE', ORIGIN.y + 42, g.phase === 'dead' ? WHITE : YELLOW, 2)
  const rows = [
    ['SCORE', g.score, GREEN],
    ['BEST', save.best, g.newBest ? YELLOW : DIM],
    ['ROOM', `${g.index + 1} OF ${g.rooms.length}`, PALE],
    ['LEVEL', g.level, PALE],
    ['KILLS', g.kills, PALE],
    ['BY THE WORLD', g.environmentKills, YELLOW],
    ['BEST CHAIN', g.chainPeak, PALE],
  ]
  rows.forEach(([name, value, colour], i) => {
    const y = ORIGIN.y + 62 + i * 10
    drawText(ctx, name, CENTRE - 64, y, DIM)
    const text = String(value)
    drawText(ctx, text, CENTRE + 64 - textWidth(text), y, colour)
  })
  if (g.newBest) centred(ctx, 'NEW BEST', ORIGIN.y + 133, YELLOW)
  drawList(ctx, menu, ORIGIN.y + 150)
}

const drawCard = (ctx, card, x, y, w, h, on) => {
  panel(ctx, x, y, w, h, on ? YELLOW : GREEN)
  if (on) {
    ctx.strokeStyle = YELLOW
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3)
  }
  if (card.mystery) drawText(ctx, '?', x + w / 2 - 6, y + 8, YELLOW, 4)
  else if (card.icon) ctx.drawImage(SPRITES.icons[card.icon], x + w / 2 - 8, y + 8)
  const chars = Math.floor((w - 6) / 4)
  const name = wrapText(card.name, chars)
  name.forEach((line, n) => drawText(ctx, line, x + (w - textWidth(line)) / 2, y + 30 + n * 7, WHITE))
  wrapText(card.text, chars).forEach((line, n) => {
    drawText(ctx, line, x + (w - textWidth(line)) / 2, y + 32 + name.length * 7 + n * 6, PALE)
  })
  if (card.sub) drawText(ctx, card.sub, x + (w - textWidth(card.sub)) / 2, y + h - 9, DIM)
}

const drawCards = (ctx, menu, cards) => {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  const gap = 6
  const w = Math.min(68, Math.floor((ROOM_PX - 12 - gap * (cards.length - 1)) / cards.length))
  const total = cards.length * w + (cards.length - 1) * gap
  const left = CENTRE - total / 2
  const top = ORIGIN.y + 66
  centred(ctx, menu.title, ORIGIN.y + 36, YELLOW, menu.title.length > 18 ? 1 : 2)
  if (menu.subtitle) wrapText(menu.subtitle, 50).forEach((line, n) => centred(ctx, line, ORIGIN.y + 50 + n * 6, PALE))
  cards.forEach((card, i) => drawCard(ctx, card, left + i * (w + gap), top, w, 90, i === menu.selected))
  centred(ctx, 'LEFT AND RIGHT, THEN Z', top + 98, DIM)
}

const PAGES = {
  title: (ctx, g, menu) => drawTitle(ctx, g, menu),
  pause: (ctx, g, menu) => drawPause(ctx, menu),
  confirm: (ctx, g, menu) => drawConfirm(ctx, menu),
  options: (ctx, g, menu) => drawOptions(ctx, menu),
  controls: (ctx, g, menu) => drawControls(ctx, menu),
  records: (ctx, g, menu) => drawRecords(ctx, menu),
  skills: (ctx, g, menu) => drawSkills(ctx, g, menu),
  notes: (ctx, g, menu) => drawNotes(ctx, menu),
  summary: (ctx, g, menu) => drawSummary(ctx, g, menu),
  offer: (ctx, g, menu) => drawCards(ctx, menu, menu.items.map(item => cardFor(item.option))),
  swap: (ctx, g, menu) => drawCards(ctx, menu, menu.items.map(item => item.card)),
}

export const drawMenus = (ctx, g) => {
  const menu = g.menus.at(-1)
  if (menu) PAGES[menu.page](ctx, g, menu)
}

export const drawToast = (ctx, g) => {
  if (!g.toast) return
  const lines = wrapText(g.toast.text, 48)
  const h = 12 + lines.length * 6 + (g.toast.title ? 7 : 0)
  const y = ORIGIN.y + 6
  panel(ctx, CENTRE - 100, y, 200, h)
  let row = y + 5
  if (g.toast.title) {
    centred(ctx, g.toast.title, row, YELLOW)
    row += 8
  }
  lines.forEach((line, n) => centred(ctx, line, row + n * 6, PALE))
}
