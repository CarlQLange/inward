import { pausedOverPit } from './moment.js'
import { M, MATERIAL_NAMES } from './materials.js'
import { ORIGIN, ROOM, TUNING, VIEW } from './config.js'
import { ENEMY_DEFS, ENEMY_TRAITS } from './enemies.js'
import { FORKS, SKILL_DETAILS, formOf, owns } from './skills.js'
import { tintedIcon } from './skillart.js'
import { eatsLine } from './feed.js'
import { SPRITES, creatureFrames } from './sprites.js'
import { knownNotes, save } from './store.js'
import { almanac } from './discover.js'
import { CAUSE_ICONS, drawPictogram } from './pictograms.js'
import { LAYOUT, almanacColumns, isTall } from './layout.js'
import { drawWardenMarks, revealArt } from './overlay.js'
import { drawText, textWidth, wrapText } from './font.js'
import { cardFor } from './menus.js'
import { CORE_RING, keyOf, ringOf } from './map.js'
import { RELIC_BY_ID } from './relics.js'
import { KEYSTONE_BY_ID, slotsOf } from './keystones.js'
import { SCHOOLS } from './wards.js'
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
const midX = () => ORIGIN.x + ROOM_PX / 2

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

const centred = (ctx, text, y, colour, scale = 1, middle = midX()) =>
  drawText(ctx, text, middle - (textWidth(String(text)) * scale) / 2, y, colour, scale)

const labelOf = item => (typeof item.label === 'function' ? item.label() : item.label)

const drawList = (ctx, menu, top, active = true, pitch = 11) => {
  menu.items.forEach((item, i) => {
    const label = labelOf(item)
    const on = active && i === menu.selected
    const y = top + i * pitch
    menu.hits?.push({ index: i, x: ROOM_PX / 2 - textWidth(label) / 2 - 10, y: y - ORIGIN.y - 3, w: textWidth(label) + 20, h: pitch })
    const nudge = on ? Math.round(easeOut((menu.age ?? 1) * 8) * 2) : 0
    centred(ctx, label, y, on ? YELLOW : PALE, 1, midX() + nudge)
    if (on) drawText(ctx, '+', midX() - textWidth(label) / 2 - 8, y, YELLOW)
  })
}

const sheet = (ctx, menu) => {
  shade(ctx, 0.75)
  const rise = Math.round((1 - easeOut((menu.age ?? 1) * 5)) * 12)
  panel(ctx, ORIGIN.x + 4, ORIGIN.y + 4 + rise, ROOM_PX - 8, ROOM_PX - 8)
  if (menu.title) centred(ctx, menu.title, ORIGIN.y + 12 + rise, GREEN, 2)
  return rise
}

const drawLoopMarks = (ctx, loop, x, y) => {
  ctx.imageSmoothingEnabled = false
  for (let i = 0; i < loop; i++) ctx.drawImage(SPRITES.icons.map_core, x + i * 8, y, 7, 7)
  return loop * 8
}

const drawKeyGlyphs = (ctx, keys, x, y) => {
  keys.forEach((id, i) => ctx.drawImage(SPRITES.icons[`glyph_${id}`], x + i * 10, y))
  return keys.length * 10
}

const hallRow = (ctx, run, y, colour) => {
  const score = String(run.score)
  const right = midX() - 2
  drawText(ctx, score, right - textWidth(score), y, colour)
  const after = drawKeyGlyphs(ctx, run.keys ?? [], midX() + 4, y - 2)
  drawLoopMarks(ctx, run.loop ?? 0, midX() + 6 + after, y - 1)
}

const drawHall = (ctx, top) => {
  const runs = save.hall.slice(0, 3)
  if (runs.length === 0) {
    if (save.best > 0) centred(ctx, save.best, top + 26, GREEN)
    return
  }
  ctx.fillStyle = 'rgba(4, 16, 12, 0.72)'
  ctx.fillRect(midX() - 84, top - 3, 168, runs.length * 12 + 4)
  runs.forEach((run, i) => hallRow(ctx, run, top + i * 12, i === 0 ? YELLOW : i === 1 ? WHITE : PALE))
}

const drawTitle = (ctx, g, menu) => {
  const lift = Math.round(Math.sin(g.time * 1.1) * 1.5)
  if (!menu.pressed) {
    if (Math.floor(g.time * 1.6) % 2 === 0) centred(ctx, 'PRESS', ORIGIN.y + 130, YELLOW)
  } else {
    const top = ORIGIN.y + 110 + lift
    drawList(ctx, menu, top)
  }
  drawHall(ctx, ORIGIN.y + 180)
}

const pauseFrame = () => {
  const touchWide = LAYOUT.mode === 'wide'
  return isTall()
    ? {
      pitch: 7, mapTop: ORIGIN.y, listTop: ORIGIN.y + 110,
      skillX: ORIGIN.x + 2, skillY: ORIGIN.y + 166, detailY: ORIGIN.y + 246,
      relicX: midX() + 6, relicY: ORIGIN.y + 166,
    }
    : {
      pitch: 9, mapTop: ORIGIN.y + 4, listTop: ORIGIN.y + 146,
      skillX: LAYOUT.inset.left + 8, skillY: ORIGIN.y + (touchWide ? 18 : 8), detailY: ORIGIN.y + (touchWide ? 100 : 90),
      relicX: ORIGIN.x + ROOM_PX + 8, relicY: ORIGIN.y + 8,
    }
}

const skillColumn = (ctx, g, menu) => {
  const frame = pauseFrame()
  const p = g.player
  const on = menu.focus === 'skills'
  for (let slot = 0; slot < slotsOf(p); slot++) {
    const skill = p.skills[slot]
    const y = frame.skillY + slot * 26
    const chosen = on && menu.slot === slot && skill
    panel(ctx, frame.skillX, y, 20, 20, chosen ? YELLOW : skill ? GREEN : FAINT)
    if (!skill) continue
    menu.hits?.push({
      x: frame.skillX - ORIGIN.x, y: y - ORIGIN.y, w: 90, h: 24,
      pick: m => Object.assign(m, { focus: 'skills', slot }),
    })
    const { name, tint, stage } = formOf(p, skill.kind)
    ctx.drawImage(tintedIcon(skill.kind, tint), frame.skillX + 2, y + 2)
    drawText(ctx, name, frame.skillX + 24, y + 3, chosen ? YELLOW : WHITE)
    FORKS[skill.kind].forEach((_, n) => {
      ctx.fillStyle = n < stage ? tint : FAINT
      ctx.fillRect(frame.skillX + 24 + n * 6, y + 12, 4, 4)
    })
  }
  const chosen = on && p.skills[menu.slot]
  if (!chosen) return
  const left = frame.skillX
  let y = frame.detailY
  wrapText(SKILL_DETAILS[chosen.kind], 22).forEach(line => {
    drawText(ctx, line, left, y, PALE)
    y += 7
  })
  wrapText(eatsLine(p, chosen.kind), 22).forEach(line => {
    drawText(ctx, line, left, y, YELLOW)
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

const keystoneEntry = id => {
  const k = KEYSTONE_BY_ID[id]
  return { icon: `key_${id}`, name: k.name, text: k.gift, cost: k.cost }
}

const relicColumn = (ctx, g, menu) => {
  const frame = pauseFrame()
  const owned = [...[...g.player.keystones].map(keystoneEntry), ...[...g.player.relics].map(id => RELIC_BY_ID[id])]
  const on = menu.focus === 'relics'
  owned.forEach((relic, i) => {
    const x = frame.relicX + (i % RELIC_COLUMNS) * RELIC_PITCH
    const y = frame.relicY + Math.floor(i / RELIC_COLUMNS) * RELIC_PITCH
    ctx.drawImage(SPRITES.icons[relic.icon], x, y)
    menu.hits?.push({
      x: x - ORIGIN.x, y: y - ORIGIN.y, w: RELIC_PITCH, h: RELIC_PITCH,
      pick: m => Object.assign(m, { focus: 'relics', relic: i }),
    })
    if (on && i === menu.relic) {
      ctx.strokeStyle = YELLOW
      ctx.strokeRect(x - 1.5, y - 1.5, 19, 19)
    }
  })
  const chosen = on && owned[menu.relic]
  if (!chosen) return
  let y = isTall() ? frame.detailY : frame.relicY + (Math.ceil(owned.length / RELIC_COLUMNS) * RELIC_PITCH) + 6
  wrapText(chosen.name, 22).forEach(line => {
    drawText(ctx, line, frame.relicX, y, WHITE)
    y += 7
  })
  wrapText(chosen.text, 22).forEach(line => {
    drawText(ctx, line, frame.relicX, y, PALE)
    y += 6
  })
  if (!chosen.cost) return
  y += 2
  wrapText(chosen.cost, 22).forEach(line => {
    drawText(ctx, line, frame.relicX, y, RED)
    y += 6
  })
}

const drawPause = (ctx, g, menu) => {
  shade(ctx, pausedOverPit(g) ? 0.3 : 0.88)
  const { pitch, mapTop, listTop } = pauseFrame()
  drawMapGrid(ctx, g, midX() - (15 * pitch) / 2, mapTop, pitch)
  drawList(ctx, menu, listTop, menu.focus === 'list', 10)
  skillColumn(ctx, g, menu)
  relicColumn(ctx, g, menu)
  if (!isTall()) drawSchools(ctx, g.tally, midX() - 66, listTop + 52, 22)
}

const drawConfirm = (ctx, menu) => {
  shade(ctx, 0.7)
  panel(ctx, midX() - 56, ORIGIN.y + 84, 112, 16 + menu.items.length * 11, YELLOW)
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
    ['DEEPER', save.deepestLoop],
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

const shadows = new WeakMap()

const shadowOf = art => {
  if (!shadows.has(art)) {
    const canvas = document.createElement('canvas')
    canvas.width = art.width
    canvas.height = art.height
    const c = canvas.getContext('2d')
    c.drawImage(art, 0, 0)
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = FAINT
    c.fillRect(0, 0, art.width, art.height)
    shadows.set(art, canvas)
  }
  return shadows.get(art)
}

const ALMANAC_PITCH = 21
const ALMANAC_CELL = 18
const ALMANAC_TOP = 30

const blurbOf = ({ kind, id }) => ({
  skill: () => SKILL_DETAILS[id],
  relic: () => RELIC_BY_ID[id]?.text,
  keystone: () => KEYSTONE_BY_ID[id]?.gift,
  foe: () => ENEMY_TRAITS[id],
  inhabitant: () => ENEMY_TRAITS[id],
  warden: () => ENEMY_TRAITS[id],
})[kind]?.() ?? ''

const drawAlmanacCell = (ctx, item, x, y, on) => {
  const art = revealArt(item)
  if (art) {
    const scale = Math.min(1, ALMANAC_CELL / Math.max(art.width, art.height))
    const w = Math.round(art.width * scale)
    const h = Math.round(art.height * scale)
    ctx.drawImage(item.found ? art : shadowOf(art), x + Math.floor((ALMANAC_CELL - w) / 2), y + Math.floor((ALMANAC_CELL - h) / 2), w, h)
  }
  if (!on) return
  ctx.strokeStyle = YELLOW
  ctx.strokeRect(x - 1.5, y - 1.5, ALMANAC_CELL + 3, ALMANAC_CELL + 3)
}

const knownReactions = () => [...knownNotes].filter(note => !/^(seen|met|killed):/.test(note))

const drawAlmanac = (ctx, g, menu) => {
  shade(ctx, 0.92)
  const book = almanac(knownReactions())
  centred(ctx, `${book.found}/${book.total}`, 12, GREEN, 2, VIEW.w / 2)
  ctx.imageSmoothingEnabled = false
  book.groups.flatMap(group => group.items).forEach((item, i) => {
    const columns = almanacColumns()
    const x = Math.floor((VIEW.w - columns * ALMANAC_PITCH) / 2) + (i % columns) * ALMANAC_PITCH
    const y = ALMANAC_TOP + Math.floor(i / columns) * ALMANAC_PITCH
    drawAlmanacCell(ctx, item, x, y, i === menu.cursor)
    menu.hits?.push({ x: x - ORIGIN.x, y: y - ORIGIN.y, w: ALMANAC_PITCH, h: ALMANAC_PITCH, pick: m => { m.cursor = i } })
  })
  const chosen = book.groups.flatMap(group => group.items)[menu.cursor]
  if (!chosen) return
  const y = VIEW.h - 30
  if (!chosen.found) {
    centred(ctx, '?', y, FAINT, 2, VIEW.w / 2)
    return
  }
  centred(ctx, chosen.name, y, WHITE, 1, VIEW.w / 2)
  centred(ctx, blurbOf(chosen), y + 9, PALE, 1, VIEW.w / 2)
  if (chosen.kind === 'keystone') centred(ctx, KEYSTONE_BY_ID[chosen.id].cost, y + 17, RED, 1, VIEW.w / 2)
}

const roll = (value, t) => Math.round(value * easeOut(t))

const drawSchools = (ctx, tally, x, y, pitch) => {
  const rows = Object.entries(tally ?? {}).sort((a, b) => b[1] - a[1])
  rows.forEach(([school, count], i) => {
    const at = x + i * pitch
    drawPictogram(ctx, CAUSE_ICONS[school], at + 3, y + 3, count > 0 ? SCHOOLS[school] : FAINT)
    drawText(ctx, count, at + 8, y + 1, count > 0 ? (i === 0 ? YELLOW : WHITE) : FAINT)
  })
}

const drawBestBar = (ctx, g, score, y) => {
  const before = g.bestBefore ?? 0
  if (before <= 0 || g.quick) return
  const width = 150
  const left = Math.round(midX() - width / 2)
  ctx.fillStyle = FAINT
  ctx.fillRect(left, y, width, 2)
  ctx.fillStyle = score >= before ? YELLOW : GREEN
  ctx.fillRect(left, y, Math.round(width * Math.min(1, score / before)), 2)
  if (score < before) drawText(ctx, before, left + width - textWidth(String(before)), y + 4, DIM)
}

const drawBuildRow = (ctx, g, y) => {
  const p = g.player
  const keys = [...p.keystones]
  const total = (p.skills.length + keys.length) * 18
  const left = Math.round(midX() - total / 2)
  ctx.imageSmoothingEnabled = false
  keys.forEach((id, i) => ctx.drawImage(SPRITES.icons[`key_${id}`], left + i * 18, y))
  p.skills.forEach((skill, i) => ctx.drawImage(tintedIcon(skill.kind, formOf(p, skill.kind).tint), left + (keys.length + i) * 18, y))
  const relics = [...p.relics].slice(0, 20)
  const across = Math.round(midX() - (relics.length * 10) / 2)
  relics.forEach((id, i) => ctx.drawImage(SPRITES.icons[RELIC_BY_ID[id].icon], across + i * 10, y + 19, 9, 9))
}

const drawDepthRow = (ctx, g, y) => {
  const won = g.phase === 'cleared'
  const cores = g.loop + (won ? 1 : 0)
  const text = `${g.deepestRing + 1}/${CORE_RING + 1}`
  const width = cores * 8 + (cores ? 4 : 0) + (won ? 0 : textWidth(text))
  const left = Math.round(midX() - width / 2)
  const used = drawLoopMarks(ctx, cores, left, y)
  if (!won) drawText(ctx, text, left + used + (cores ? 4 : 0), y + 1, WHITE)
}

const drawCounts = (ctx, g, y) => {
  const book = almanac()
  const items = [
    [`X${g.chainPeak}`, YELLOW, 'chain'],
    [g.wardenWins, g.outwits > 0 ? YELLOW : WHITE, g.outwits > 0 ? 'seal_broken' : 'seal'],
    [g.cleanClears, WHITE, 'heart'],
    [g.gold, WHITE, 'coin'],
    [`${book.found}/${book.total}`, DIM, 'discovery'],
  ]
  const pitch = 42
  const left = Math.round(midX() - (items.length * pitch) / 2)
  ctx.imageSmoothingEnabled = false
  items.forEach(([value, colour, icon], i) => {
    ctx.drawImage(SPRITES.icons[icon], left + i * pitch, y - 1, 8, 8)
    drawText(ctx, value, left + i * pitch + 10, y, colour)
  })
}

const drawSummary = (ctx, g, menu) => {
  const age = menu.age ?? 1
  const won = g.phase === 'cleared'
  ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * clamp01(age * 2)})`
  ctx.fillRect(0, 0, VIEW.w, VIEW.h)
  const rise = Math.round((1 - easeOut(age * 3)) * 14)
  const score = roll(g.score, age / 1.4)
  const top = ORIGIN.y + rise
  centred(ctx, score, top + 12, won ? YELLOW : WHITE, 4)
  drawBestBar(ctx, g, score, top + 36)
  if (g.newBest && age > 1.4 && Math.floor(g.time * 4) % 2 === 0) centred(ctx, 'BEST', top + 41, YELLOW)
  if (won && g.banked && age > 1.4) drawText(ctx, `+${g.banked}`, midX() - 75, top + 40, GREEN)
  if (!won && g.player.lastCause && age > 1.2) {
    const width = textWidth(String(g.score)) * 4
    drawPictogram(ctx, CAUSE_ICONS[g.player.lastCause] ?? CAUSE_ICONS.DEFAULT, Math.max(ORIGIN.x + 8, midX() - width / 2 - 8), top + 21, RED)
  }
  if (age > 0.5) drawDepthRow(ctx, g, top + 50)
  if (age > 0.7) drawBuildRow(ctx, g, top + 60)
  if (age > 0.9) drawSchools(ctx, g.tally, midX() - 66, top + 92, 22)
  if (age > 1.1) drawCounts(ctx, g, top + 105)
  if (age > 1.3) {
    const found = g.foundThisRun ?? []
    found.forEach((key, i) => {
      const [kind, id] = key.split(':')
      const art = revealArt({ kind, id })
      if (!art) return
      const scale = Math.min(1, 20 / Math.max(art.width, art.height))
      const x = midX() - (found.length * 24) / 2 + i * 24 + 2
      ctx.drawImage(art, Math.round(x), top + 118, Math.round(art.width * scale), Math.round(art.height * scale))
    })
  }
  if (age > 1.4) drawList(ctx, menu, top + 150)
}

const GREENS = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
const HOTS = ['#2a0a2e', '#7a1a4a', '#d9531c', '#ff9a2e', '#ffe84a', '#ffffff']

const drawStopArt = (ctx, x, y, w, h, time) => {
  ctx.fillStyle = GREENS[3]
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = GREENS[2]
  ctx.fillRect(x, y + Math.round(h * 0.62), w, 2)
  ctx.fillStyle = GREENS[1]
  ctx.fillRect(x, y + Math.round(h * 0.62) + 2, w, Math.round(h * 0.38) - 2)
  ctx.fillStyle = GREENS[2]
  const sun = 7
  ctx.fillRect(x + w - sun - 6, y + 6 + Math.round(Math.sin(time) * 1), sun, sun)
  ctx.fillStyle = GREENS[0]
  const foot = y + Math.round(h * 0.62)
  ctx.fillRect(x + Math.round(w / 2) - 2, foot - 9, 4, 9)
  ctx.fillRect(x + Math.round(w / 2) + 2, foot - 7, 3, 1)
}

const drawDeepArt = (ctx, x, y, w, h, time) => {
  const cx = x + w / 2
  const cy = y + h / 2
  const rings = HOTS.length
  for (let i = 0; i < rings; i++) {
    const beat = (time * 0.5 + i / rings) % 1
    const half = Math.round((h / 2) * (1 - i / rings) + beat)
    ctx.fillStyle = HOTS[i]
    ctx.fillRect(Math.round(cx - half * (w / h)), Math.round(cy - half), Math.round(half * 2 * (w / h)), half * 2)
  }
}

const drawChoice = (ctx, g, menu) => {
  const age = menu.age ?? 1
  shade(ctx, 0.35 * clamp01(age * 3))
  const gap = 8
  const w = 96
  const h = 116
  const left = Math.round(midX() - w - gap / 2)
  const top = ORIGIN.y + 44
  const armed = menu.armed
  const cards = [
    { art: drawStopArt, value: `+${menu.bank}`, colour: GREEN },
    { art: drawDeepArt, value: `X${menu.deeper}`, colour: YELLOW, big: true },
  ]
  cards.forEach(({ art, value, colour, big }, i) => {
    const on = armed && i === menu.selected
    const arrive = overshoot((age - i * 0.1) * 3)
    const lift = on ? 4 + Math.round(Math.sin(g.time * 5)) : 0
    const x = left + i * (w + gap)
    const y = Math.round(VIEW.h + 10 + (top - lift - VIEW.h - 10) * arrive)
    panel(ctx, x, y, w, h, on ? YELLOW : DIM)
    art(ctx, x + 3, y + 3, w - 6, h - 28, g.time)
    const scale = big ? 3 : textWidth(value) * 2 > w - 6 ? 1 : 2
    drawText(ctx, value, x + (w - textWidth(value) * scale) / 2, y + h - 22 + (big ? 0 : 2), colour, scale)
    menu.hits?.push({ index: i, x: x - ORIGIN.x, y: top - ORIGIN.y, w, h })
  })
}

const drawCard = (ctx, card, x, y, w, h, on, time) => {
  panel(ctx, x, y, w, h, on ? YELLOW : GREEN)
  if (card.mystery) drawText(ctx, '?', x + w / 2 - 6, y + 8, Math.floor(time * 5) % 2 ? YELLOW : WHITE, 4)
  else if (card.cost) ctx.drawImage(SPRITES.icons[card.icon], x + w / 2 - 16, y + 7, 32, 32)
  else if (card.icon) ctx.drawImage(tintedIcon(card.icon, card.tint), x + w / 2 - 8, y + 8)
  const chars = Math.floor((w - 6) / 4)
  const name = wrapText(card.name, chars)
  const nameAt = card.cost ? y + 44 : y + 30
  name.forEach((line, n) => drawText(ctx, line, x + (w - textWidth(line)) / 2, nameAt + n * 7, on ? YELLOW : WHITE))
  wrapText(card.text, chars).forEach((line, n) => {
    drawText(ctx, line, x + (w - textWidth(line)) / 2, nameAt + 2 + name.length * 7 + n * 6, PALE)
  })
  if (card.cost) {
    const lines = wrapText(card.cost, chars)
    lines.forEach((line, n) => drawText(ctx, line, x + (w - textWidth(line)) / 2, y + h - 3 - (lines.length - n) * 6, RED))
  }
  if (card.prompt) drawPrompt(ctx, card.prompt, x + (w - promptWidth(card.prompt)) / 2, y + h - PROMPT_HEIGHT - 3)
  else if (card.sub) {
    const lines = wrapText(card.sub, chars)
    lines.forEach((line, n) => drawText(ctx, line, x + (w - textWidth(line)) / 2, y + h - 3 - (lines.length - n) * 6, card.subBright ? YELLOW : DIM))
  }
}

const drawCards = (ctx, g, menu, cards) => {
  shade(ctx, 0.62 * clamp01((menu.age ?? 1) * 6))
  const gap = 6
  const w = Math.min(68, Math.floor((ROOM_PX - 12 - gap * (cards.length - 1)) / cards.length))
  const total = cards.length * w + (cards.length - 1) * gap
  const left = midX() - total / 2
  const top = ORIGIN.y + (menu.tall ? 52 : 72)
  const height = menu.tall ? 110 : 72
  if (menu.title) centred(ctx, menu.title, ORIGIN.y + 42, YELLOW, menu.title.length > 18 ? 1 : 2)
  cards.forEach((card, i) => {
    const arrive = overshoot(((menu.age ?? 1) - i * 0.06) * 4)
    const on = i === menu.selected
    const lift = on ? 4 + Math.round(Math.sin(g.time * 5)) : 0
    const y = VIEW.h + 10 + (top - lift - VIEW.h - 10) * arrive
    drawCard(ctx, card, left + i * (w + gap), Math.round(y), w, height, on, g.time)
    menu.hits?.push({ index: i, x: left + i * (w + gap) - ORIGIN.x, y: top - ORIGIN.y, w, h: height })
  })
}

const LOCK_COLOURS = { peat: '#a07a3a', gate: '#b6bbbd', brick: '#8a9c3e', ice: '#7fe0e8', scrap: '#b08a60', any: YELLOW, seal: '#ffffff' }
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
        const lock = link.lock && room.doors[dir] && (link.lock === 'seal' ? g.seals < 3 : lockStands(room, dir))
        ctx.fillStyle = lock ? LOCK_COLOURS[link.lock] : GREEN
        const px = left + x * pitch + (cellSize - 1) / 2 + dx * (pitch / 2 + (cellSize - 1) / 4)
        const py = top + y * pitch + (cellSize - 1) / 2 + dy * (pitch / 2 + (cellSize - 1) / 4)
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1)
      }
    }
  }
  drawWardenMarks(ctx, g, left, top, pitch)
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
  const cx = midX()
  const cy = ORIGIN.y + 96
  const chosen = menu.selected
  const count = CORE_RING + 1
  for (let ring = count - 1; ring >= 0; ring--) {
    const half = (size / 2) * (1 - ring / count)
    menu.hits?.push({ index: ring, x: cx - half - ORIGIN.x, y: cy - half - ORIGIN.y, w: half * 2, h: half * 2 })
  }
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
  almanac: drawAlmanac,
  summary: drawSummary,
  choice: drawChoice,
  offer: (ctx, g, menu) => drawCards(ctx, g, menu, menu.items.map(item => item.card ?? cardFor(item.option))),
  swap: (ctx, g, menu) => drawCards(ctx, g, menu, menu.items.map(item => item.card)),
}

export const drawMenus = (ctx, g) => {
  const menu = g.menus.at(-1)
  if (!menu) return
  menu.hits = []
  PAGES[menu.page](ctx, g, menu)
  if (!['title', 'almanac', 'controls', 'records'].includes(menu.page)) drawPromptRow(ctx, ['confirm', ...(menu.back || menu.cancel ? ['back'] : [])], ORIGIN.x + ROOM_PX / 2, ORIGIN.y + ROOM_PX - 16, 5)
}

const drawToastPrompts = (ctx, prompts, y) => {
  const widths = prompts.map(([action, word]) => promptWidth(action) + (word ? textWidth(word) + 2 : 0))
  const total = widths.reduce((a, b) => a + b + 6, -6)
  prompts.reduce((x, [action, word], i) => {
    const drawn = drawPrompt(ctx, action, x, y)
    if (word) drawText(ctx, word, x + drawn + 2, y + 2, PALE)
    return x + widths[i] + 6
  }, midX() - total / 2)
}

export const drawToast = (ctx, g) => {
  const toast = g.toast
  if (!toast) return
  const { title, sub, prompts, life, born = life } = toast
  const age = born - life
  ctx.globalAlpha = clamp01(Math.min(age * 3, life * 2))
  if (title) {
    const shown = title.slice(0, Math.ceil(age * 24))
    const width = textWidth(title) * 2
    const rule = Math.round(width * easeOut(age * 2))
    const tall = sub ? 30 : 22
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(ORIGIN.x, ORIGIN.y + 28, ROOM_PX, tall)
    ctx.fillStyle = YELLOW
    ctx.fillRect(midX() - rule / 2, ORIGIN.y + 30, rule, 1)
    ctx.fillRect(midX() - rule / 2, ORIGIN.y + 28 + tall - 3, rule, 1)
    drawText(ctx, shown, midX() - width / 2, ORIGIN.y + 34, WHITE, 2)
    if (sub) centred(ctx, sub, ORIGIN.y + 47, PALE)
  }
  if (prompts) drawPromptRow(ctx, prompts, midX(), ORIGIN.y + (title ? 62 : 34), 6)
  ctx.globalAlpha = 1
}
