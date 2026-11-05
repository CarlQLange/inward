import { M, MATERIAL_NAMES } from './materials.js'
import { ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { ENEMY_DEFS, ENEMY_TRAITS } from './enemies.js'
import { FORKS, SKILL_DETAILS, formOf, owns } from './skills.js'
import { tintedIcon } from './skillart.js'
import { SPRITES } from './sprites.js'
import { knownNotes, save } from './store.js'
import { drawText, textWidth, wrapText } from './font.js'
import { cardFor } from './menus.js'
import { CORE_RING, keyOf, ringOf } from './map.js'
import { RELIC_BY_ID } from './relics.js'
import { CONTROL_ROWS, promptFor, skillAction } from './controls.js'
import { PROMPT_HEIGHT, drawPrompt, drawPromptRow, promptWidth } from './glyphs.js'

const GREEN = '#76d648'
const DIM = '#3d7a3c'
const FAINT = '#26542a'
const WHITE = '#f4f8f2'
const PALE = '#c9d4c0'
const YELLOW = '#ffe84a'
const RED = '#ff5a4a'
const INK = '#04100c'
const ROOM_PX = ROOM * 8
const CENTRE = ORIGIN.x + ROOM_PX / 2

const clamp01 = v => Math.max(0, Math.min(1, v))
const easeOut = t => 1 - (1 - clamp01(t)) ** 3
const overshoot = t => {
  const u = clamp01(t) - 1
  return 1 + 2.4 * u ** 3 + 1.4 * u ** 2
}

const panel = (ctx, x, y, w, h, line = GREEN) => {
  ctx.fillStyle = INK
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = line
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w - 1, h - 1)
}

const shade = (ctx, alpha) => {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
}

const centred = (ctx, text, y, colour, scale = 1, middle = CENTRE) =>
  drawText(ctx, text, middle - (textWidth(String(text)) * scale) / 2, y, colour, scale)

const labelOf = item => (typeof item.label === 'function' ? item.label() : item.label)

const drawList = (ctx, menu, top, active = true, pitch = 11) => {
  menu.items.forEach((item, i) => {
    const label = labelOf(item)
    const on = active && i === menu.selected
    const y = top + i * pitch
    menu.hits?.push({ index: i, x: ROOM_PX / 2 - textWidth(label) / 2 - 10, y: y - ORIGIN.y - 3, w: textWidth(label) + 20, h: pitch })
    const nudge = on ? Math.round(easeOut((menu.age ?? 1) * 8) * 2) : 0
    centred(ctx, label, y, on ? YELLOW : PALE, 1, CENTRE + nudge)
    if (on) drawText(ctx, '+', CENTRE - textWidth(label) / 2 - 8, y, YELLOW)
  })
}

const sheet = (ctx, menu) => {
  shade(ctx, 0.75)
  const rise = Math.round((1 - easeOut((menu.age ?? 1) * 5)) * 12)
  panel(ctx, ORIGIN.x + 4, ORIGIN.y + 4 + rise, ROOM_PX - 8, ROOM_PX - 8)
  if (menu.title) centred(ctx, menu.title, ORIGIN.y + 12 + rise, GREEN, 2)
  return rise
}

const drawTitle = (ctx, g, menu) => {
  const lift = Math.round(Math.sin(g.time * 1.1) * 1.5)
  if (!menu.pressed) {
    if (Math.floor(g.time * 1.6) % 2 === 0) centred(ctx, 'PRESS', ORIGIN.y + 130, YELLOW)
  } else {
    const top = ORIGIN.y + 110 + lift
    drawList(ctx, menu, top)
  }
  if (save.best > 0) centred(ctx, save.best, VIEW.h - 11, FAINT)
}

const skillColumn = (ctx, g, menu) => {
  const p = g.player
  const on = menu.focus === 'skills'
  for (let slot = 0; slot < TUNING.player.skillSlots; slot++) {
    const skill = p.skills[slot]
    const y = ORIGIN.y + 8 + slot * 26
    const chosen = on && menu.slot === slot && skill
    panel(ctx, 8, y, 20, 20, chosen ? YELLOW : skill ? GREEN : FAINT)
    if (!skill) continue
    const { name, tint, stage } = formOf(p, skill.kind)
    ctx.drawImage(tintedIcon(skill.kind, tint), 10, y + 2)
    drawText(ctx, name, 32, y + 3, chosen ? YELLOW : WHITE)
    FORKS[skill.kind].forEach((_, n) => {
      ctx.fillStyle = n < stage ? tint : FAINT
      ctx.fillRect(32 + n * 6, y + 12, 4, 4)
    })
  }
  const chosen = on && p.skills[menu.slot]
  if (!chosen) return
  const left = 8
  let y = ORIGIN.y + 90
  wrapText(SKILL_DETAILS[chosen.kind], 22).forEach(line => {
    drawText(ctx, line, left, y, PALE)
    y += 7
  })
  y += 4
  FORKS[chosen.kind].flatMap(fork => (fork.some(node => owns(p, node.id)) ? fork.filter(node => owns(p, node.id)) : fork)).forEach(node => {
    const owned = owns(p, node.id)
    drawText(ctx, node.name, left, y, owned ? YELLOW : DIM)
    y += 7
    wrapText(node.text, 22).forEach(line => {
      drawText(ctx, line, left, y, owned ? PALE : DIM)
      y += 6
    })
    y += 3
  })
}

const RELIC_PITCH = 18
const RELIC_COLUMNS = 5
const RELIC_LEFT = ORIGIN.x + ROOM_PX + 8

const relicColumn = (ctx, g, menu) => {
  const owned = [...g.player.relics].map(id => RELIC_BY_ID[id])
  const on = menu.focus === 'relics'
  owned.forEach((relic, i) => {
    const x = RELIC_LEFT + (i % RELIC_COLUMNS) * RELIC_PITCH
    const y = ORIGIN.y + 8 + Math.floor(i / RELIC_COLUMNS) * RELIC_PITCH
    ctx.drawImage(SPRITES.icons[relic.icon], x, y)
    if (on && i === menu.relic) {
      ctx.strokeStyle = YELLOW
      ctx.strokeRect(x - 1.5, y - 1.5, 19, 19)
    }
  })
  const chosen = on && owned[menu.relic]
  if (!chosen) return
  let y = ORIGIN.y + 8 + (Math.ceil(owned.length / RELIC_COLUMNS) * RELIC_PITCH) + 6
  wrapText(chosen.name, 22).forEach(line => {
    drawText(ctx, line, RELIC_LEFT, y, WHITE)
    y += 7
  })
  wrapText(chosen.text, 22).forEach(line => {
    drawText(ctx, line, RELIC_LEFT, y, PALE)
    y += 6
  })
}

const drawPause = (ctx, g, menu) => {
  shade(ctx, 0.88)
  const pitch = 9
  drawMapGrid(ctx, g, CENTRE - (15 * pitch) / 2, ORIGIN.y + 4, pitch)
  drawList(ctx, menu, ORIGIN.y + 146, menu.focus === 'list', 10)
  skillColumn(ctx, g, menu)
  relicColumn(ctx, g, menu)
}

const drawConfirm = (ctx, menu) => {
  shade(ctx, 0.7)
  panel(ctx, CENTRE - 56, ORIGIN.y + 84, 112, 16 + menu.items.length * 11, YELLOW)
  drawList(ctx, menu, ORIGIN.y + 92)
}

const drawOptions = (ctx, menu) => {
  const rise = sheet(ctx, menu)
  drawList(ctx, menu, ORIGIN.y + 50 + rise)
}

const drawControls = (ctx, menu) => {
  const rise = sheet(ctx, menu)
  CONTROL_ROWS.filter(([action]) => [action].flat().every(promptFor)).forEach(([action, word], i) => {
    const y = ORIGIN.y + 34 + rise + i * 14
    drawText(ctx, word, ORIGIN.x + 32, y + 2, PALE)
    drawPromptRow(ctx, [action].flat(), ORIGIN.x + 150, y)
  })
  drawList(ctx, menu, ORIGIN.y + 204 + rise)
}

const drawRecords = (ctx, menu) => {
  const rise = sheet(ctx, menu)
  const rows = [
    ['BEST', save.best],
    ['CHAIN', save.bestChain],
    ['RUNS', save.runs],
    ['DEEPEST', save.deepest],
    ['CORES', save.coresReached],
    ['WORLD KILLS', save.worldKills],
  ]
  rows.forEach(([name, value], i) => {
    const y = ORIGIN.y + 44 + rise + i * 14
    drawText(ctx, name, ORIGIN.x + 28, y, PALE)
    const text = String(value)
    drawText(ctx, text, ORIGIN.x + ROOM_PX - 28 - textWidth(text), y, GREEN)
  })
  drawList(ctx, menu, ORIGIN.y + 196 + rise)
}

const MATERIAL_ORDER = [
  M.ROCK, M.MOSS, M.PEAT, M.WOOD, M.METAL, M.SCRAP, M.SAND, M.WATER,
  M.OIL, M.LAVA, M.ACID, M.VINE, M.SOURCE, M.ICE, M.SMOKE, M.STEAM, M.METHANE, M.VOLATILE, M.BRICK, M.GATE, M.BEDROCK,
]
const TAGS = [['burn', 'BURNS'], ['conduct', 'CONDUCTS'], ['blast', 'EXPLODES'], ['melt', 'MELTS'], ['freeze', 'FREEZES'], ['fall', 'FALLS'], ['cool', 'COOLS'], ['bubble', 'SPLITS'], ['grow', 'GROWS'], ['rain', 'RAINS'], ['dissolve', 'DISSOLVES']]

const noteLines = () => {
  const materials = MATERIAL_ORDER.filter(m => knownNotes.has(`seen:${m}`)).map(m => ({
    tile: m,
    name: MATERIAL_NAMES[m],
    text: TAGS.filter(([tag]) => knownNotes.has(`${tag}:${m}`)).map(([, word]) => word).join(' ') || '?',
  }))
  const creatures = Object.keys(ENEMY_DEFS).filter(k => knownNotes.has(`met:${k}`)).map(k => ({
    creature: k,
    name: k.toUpperCase(),
    text: knownNotes.has(`killed:${k}`) ? ENEMY_TRAITS[k] : '?',
  }))
  return [...materials, ...creatures]
}

const TILE_NAME = {
  [M.ROCK]: 'rock', [M.MOSS]: 'moss', [M.PEAT]: 'peat', [M.WOOD]: 'wood', [M.METAL]: 'metal',
  [M.SCRAP]: 'scrap', [M.SAND]: 'sand', [M.ICE]: 'ice', [M.VOLATILE]: 'volatile', [M.BEDROCK]: 'bedrock',
  [M.BRICK]: 'brick', [M.GATE]: 'gate',
}
const SWATCH = { [M.ACID]: '#7fd03a', [M.VINE]: '#4f9c3a', [M.SOURCE]: '#70767a', [M.LAVA]: '#ff7a1c', [M.WATER]: '#10606e', [M.OIL]: '#5a3a64', [M.SMOKE]: '#747a72', [M.STEAM]: '#c8d8d8', [M.METHANE]: '#a878c8' }

const drawNotes = (ctx, menu) => {
  sheet(ctx, menu)
  const lines = noteLines()
  const perPage = 11
  menu.scroll = Math.min(menu.scroll, Math.max(0, lines.length - perPage))
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
  drawList(ctx, menu, ORIGIN.y + 196)
}

const roll = (value, t) => Math.round(value * easeOut(t))

const drawSummary = (ctx, g, menu) => {
  const age = menu.age ?? 1
  const won = g.phase === 'cleared'
  ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * clamp01(age * 2)})`
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  const rise = Math.round((1 - easeOut(age * 3)) * 14)
  const score = roll(g.score, age / 1.4)
  centred(ctx, score, ORIGIN.y + 34 + rise, won ? YELLOW : WHITE, 4)
  if (g.newBest && age > 1.4) centred(ctx, 'BEST', ORIGIN.y + 60 + rise, YELLOW)
  const rows = [
    [`${g.deepestRing + 1}/${CORE_RING + 1}`, 'RING'],
    [g.kills, 'KILLS'],
    [g.environmentKills, 'BY THE WORLD'],
    [`X${g.chainPeak}`, 'CHAIN'],
  ]
  rows.forEach(([value, name], i) => {
    const y = ORIGIN.y + 76 + rise + i * 10
    if (age < 0.6 + i * 0.15) return
    drawText(ctx, value, CENTRE + 6, y, i === 2 ? YELLOW : WHITE)
    drawText(ctx, name, CENTRE - 2 - textWidth(name), y, DIM)
  })
  if (!won && g.player.lastCause && age > 1.2) centred(ctx, g.player.lastCause, ORIGIN.y + 122 + rise, RED)
  if (age > 1.4) drawList(ctx, menu, ORIGIN.y + 170 + rise)
}

const drawCard = (ctx, card, x, y, w, h, on, time) => {
  panel(ctx, x, y, w, h, on ? YELLOW : GREEN)
  if (card.mystery) drawText(ctx, '?', x + w / 2 - 6, y + 8, Math.floor(time * 5) % 2 ? YELLOW : WHITE, 4)
  else if (card.icon) ctx.drawImage(tintedIcon(card.icon, card.tint), x + w / 2 - 8, y + 8)
  const chars = Math.floor((w - 6) / 4)
  const name = wrapText(card.name, chars)
  name.forEach((line, n) => drawText(ctx, line, x + (w - textWidth(line)) / 2, y + 30 + n * 7, on ? YELLOW : WHITE))
  wrapText(card.text, chars).forEach((line, n) => {
    drawText(ctx, line, x + (w - textWidth(line)) / 2, y + 32 + name.length * 7 + n * 6, PALE)
  })
  if (card.prompt) drawPrompt(ctx, card.prompt, x + (w - promptWidth(card.prompt)) / 2, y + h - PROMPT_HEIGHT - 3)
  else if (card.sub) drawText(ctx, card.sub, x + (w - textWidth(card.sub)) / 2, y + h - 9, DIM)
}

const drawCards = (ctx, g, menu, cards) => {
  shade(ctx, 0.62 * clamp01((menu.age ?? 1) * 6))
  const gap = 6
  const w = Math.min(68, Math.floor((ROOM_PX - 12 - gap * (cards.length - 1)) / cards.length))
  const total = cards.length * w + (cards.length - 1) * gap
  const left = CENTRE - total / 2
  const top = ORIGIN.y + 72
  if (menu.title) centred(ctx, menu.title, ORIGIN.y + 42, YELLOW, menu.title.length > 18 ? 1 : 2)
  cards.forEach((card, i) => {
    const arrive = overshoot(((menu.age ?? 1) - i * 0.06) * 4)
    const on = i === menu.selected
    const lift = on ? 4 + Math.round(Math.sin(g.time * 5)) : 0
    const y = VIEW.h + 10 + (top - lift - VIEW.h - 10) * arrive
    drawCard(ctx, card, left + i * (w + gap), Math.round(y), w, 72, on, g.time)
    menu.hits?.push({ index: i, x: left + i * (w + gap) - ORIGIN.x, y: top - ORIGIN.y, w, h: 72 })
  })
}

const LOCK_COLOURS = { peat: '#a07a3a', gate: '#b6bbbd', brick: '#8a9c3e', ice: '#7fe0e8', scrap: '#b08a60', any: YELLOW }
const STEPS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }
const MAP_RINGS = ['#1c3a22', '#1e3f26', '#20442a', '#22492e', '#254f32', '#285536', '#2c5c3a', '#31643f']

export const drawMapGrid = (ctx, g, left, top, pitch) => {
  const cellSize = pitch - 1
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 15; x++) {
      const room = g.rooms[keyOf(x, y)]
      const seen = room?.visited
      const known = seen || g.player.relics.has('eye')
      const here = x === g.x && y === g.y
      const core = x === 7 && y === 7
      ctx.fillStyle = here ? (Math.floor(g.time * 4) % 2 ? WHITE : YELLOW) : seen ? GREEN : core ? YELLOW : MAP_RINGS[ringOf(x, y)]
      ctx.fillRect(left + x * pitch, top + y * pitch, cellSize, cellSize)
      if (!seen && !known) continue
      if (!room) continue
      for (const [dir, link] of Object.entries(room.links)) {
        const [dx, dy] = STEPS[dir]
        const lock = link.lock && room.doors[dir] && lockStands(room, dir)
        ctx.fillStyle = lock ? LOCK_COLOURS[link.lock] : GREEN
        const px = left + x * pitch + (cellSize - 1) / 2 + dx * (pitch / 2 + (cellSize - 1) / 4)
        const py = top + y * pitch + (cellSize - 1) / 2 + dy * (pitch / 2 + (cellSize - 1) / 4)
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1)
      }
    }
  }
}

const LOCK_CELL = {
  left: d => [1, d.row], right: d => [ROOM - 2, d.row], up: d => [d.col, 1], down: d => [d.col, ROOM - 2],
}

const lockStands = (room, dir) => {
  const [x, y] = LOCK_CELL[dir](room.doors[dir])
  return [M.PEAT, M.GATE, M.BRICK, M.ICE, M.SCRAP].includes(room.world.mat[y * ROOM + x])
}

const drawQuickstart = (ctx, g, menu) => {
  sheet(ctx, menu)
  const size = 120
  const cx = CENTRE
  const cy = ORIGIN.y + 96
  const chosen = menu.selected
  const count = CORE_RING + 1
  for (let ring = 0; ring < count; ring++) {
    const half = (size / 2) * (1 - ring / count)
    const on = ring === chosen
    ctx.strokeStyle = on ? YELLOW : ring < chosen ? DIM : FAINT
    ctx.lineWidth = on ? 3 : 1
    ctx.strokeRect(Math.round(cx - half) + 0.5, Math.round(cy - half) + 0.5, Math.round(half * 2), Math.round(half * 2))
  }
  ctx.lineWidth = 1
  centred(ctx, chosen === CORE_RING ? 'CORE' : chosen + 1, ORIGIN.y + 170, YELLOW, 2)
}

const PAGES = {
  quickstart: drawQuickstart,
  title: drawTitle,
  pause: drawPause,
  confirm: (ctx, g, menu) => drawConfirm(ctx, menu),
  options: (ctx, g, menu) => drawOptions(ctx, menu),
  controls: (ctx, g, menu) => drawControls(ctx, menu),
  records: (ctx, g, menu) => drawRecords(ctx, menu),
  notes: (ctx, g, menu) => drawNotes(ctx, menu),
  summary: drawSummary,
  offer: (ctx, g, menu) => drawCards(ctx, g, menu, menu.items.map(item => item.card ?? cardFor(item.option))),
  swap: (ctx, g, menu) => drawCards(ctx, g, menu, menu.items.map(item => item.card)),
}

export const drawMenus = (ctx, g) => {
  const menu = g.menus.at(-1)
  if (!menu) return
  menu.hits = []
  PAGES[menu.page](ctx, g, menu)
  drawPromptRow(ctx, ['confirm', ...(menu.back || menu.cancel ? ['back'] : [])], ORIGIN.x + ROOM_PX / 2, ORIGIN.y + ROOM_PX - 16, 5)
}

const drawToastPrompts = (ctx, prompts, y) => {
  const widths = prompts.map(([action, word]) => promptWidth(action) + (word ? textWidth(word) + 2 : 0))
  const total = widths.reduce((a, b) => a + b + 6, -6)
  prompts.reduce((x, [action, word], i) => {
    const drawn = drawPrompt(ctx, action, x, y)
    if (word) drawText(ctx, word, x + drawn + 2, y + 2, PALE)
    return x + widths[i] + 6
  }, CENTRE - total / 2)
}

export const drawToast = (ctx, g) => {
  if (!g.toast?.title) return
  const { title, life, born = life } = g.toast
  const age = born - life
  const fade = clamp01(Math.min(age * 3, life * 2))
  const shown = title.slice(0, Math.ceil(age * 24))
  const width = textWidth(title) * 2
  ctx.globalAlpha = fade
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(ORIGIN.x, ORIGIN.y + 28, ROOM_PX, 22)
  ctx.fillStyle = YELLOW
  const rule = Math.round(width * easeOut(age * 2))
  ctx.fillRect(CENTRE - rule / 2, ORIGIN.y + 30, rule, 1)
  ctx.fillRect(CENTRE - rule / 2, ORIGIN.y + 47, rule, 1)
  drawText(ctx, shown, CENTRE - width / 2, ORIGIN.y + 34, WHITE, 2)
  ctx.globalAlpha = 1
}
