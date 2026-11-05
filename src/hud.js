import { ORIGIN, TUNING, VIEW } from './config.js'
import { SPRITES } from './sprites.js'
import { SCARF_RED } from './hero.js'
import { drawText, textWidth } from './font.js'
import { RELIC_BY_ID } from './relics.js'
import { drawMapGrid } from './screens.js'
import { skillAction } from './controls.js'
import { drawPrompt, promptWidth } from './glyphs.js'
import { FORKS, formOf } from './skills.js'
import { feedColour, pipsOf, waitingOf } from './feed.js'
import { tintedIcon } from './skillart.js'
import { CAUSE_ICONS, drawPictogram } from './pictograms.js'
import { LAYOUT, isTall, isTouchLayout } from './layout.js'
import { pauseButton, stickRest, touchButtons, touchView } from './touch.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const MID = '#3d7a3c'
const WHITE = '#f4f8f2'
const YELLOW = '#ffe84a'
const RED = `rgb(${SCARF_RED.join(',')})`
const RED_DIM = '#4a1420'
const INK = '#04100c'
const HIT = '#ff5a4a'

const SLOT = 32
const SLOT_X = 34
const SLOT_GAP = 42
const SPAN = 15 * 5 + 3

const readiness = new WeakMap()

const box = (ctx, x, y, w, h, colour) => {
  ctx.strokeStyle = colour
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

const corners = (ctx, x, y, size, colour) => {
  ctx.fillStyle = colour
  for (const [cx, cy, w, h] of [
    [x, y, 4, 1], [x, y, 1, 4], [x + size - 4, y, 4, 1], [x + size - 1, y, 1, 4],
    [x, y + size - 1, 4, 1], [x, y + size - 4, 1, 4], [x + size - 4, y + size - 1, 4, 1], [x + size - 1, y + size - 4, 1, 4],
  ]) ctx.fillRect(cx, cy, w, h)
}

const perimeter = (x, y, size, t) => {
  const side = size - 1
  const d = ((t % 4) + 4) % 4
  if (d < 1) return { x: x + d * side, y }
  if (d < 2) return { x: x + side, y: y + (d - 1) * side }
  if (d < 3) return { x: x + side - (d - 2) * side, y: y + side }
  return { x, y: y + side - (d - 3) * side }
}

const drawFed = (ctx, g, skill, x, y, size) => {
  const fed = skill.fed ?? 0
  const gulp = skill.gulp ?? 0
  if (fed < 0.04 && gulp <= 0) return
  const colour = feedColour(skill)
  const strength = Math.max(fed, gulp)
  ctx.globalAlpha = 0.16 + strength * 0.2
  ctx.fillStyle = colour
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2)
  ctx.globalAlpha = 0.4 + strength * 0.6
  box(ctx, x - 1, y - 1, size + 2, size + 2, colour)
  ctx.globalAlpha = 1
  const count = 1 + Math.round(strength * 3)
  ctx.fillStyle = WHITE
  for (let n = 0; n < count; n++) {
    const at = perimeter(x - 1, y - 1, size + 2, g.time * (1 + strength * 3) + (n * 4) / count)
    ctx.fillRect(Math.round(at.x), Math.round(at.y), 1, 1)
  }
}

const drawPips = (ctx, g, skill, x, y) => {
  const pips = pipsOf(g.player, skill)
  if (!pips) return
  for (let n = 0; n < pips.most; n++) {
    ctx.fillStyle = n < pips.have ? WHITE : DIM
    ctx.fillRect(x + n * 4, y, 3, 2)
  }
}

const drawSkillSlot = (ctx, g, slot) => {
  const top = ORIGIN.y + slot * SLOT_GAP
  const skill = g.player.skills[slot]
  if (!skill) {
    corners(ctx, SLOT_X, top, SLOT, DIM)
    return
  }
  const { tint, stage } = formOf(g.player, skill.kind)
  const waiting = waitingOf(g.player, skill)
  const wasWaiting = readiness.get(skill) ?? 0
  const flash = wasWaiting > 0 && waiting === 0 ? 0.18 : Math.max(0, (skill.flash ?? 0) - 1 / 60)
  skill.flash = flash
  readiness.set(skill, waiting)
  box(ctx, SLOT_X, top, SLOT, SLOT, waiting > 0 ? MID : tint ?? GREEN)
  drawFed(ctx, g, skill, SLOT_X, top, SLOT)
  ctx.globalAlpha = waiting > 0 ? 0.45 : 1
  ctx.drawImage(tintedIcon(skill.kind, tint), SLOT_X + 8, top + 8)
  ctx.globalAlpha = 1
  FORKS[skill.kind].forEach((_, n) => {
    ctx.fillStyle = n < stage ? tint : DIM
    ctx.fillRect(SLOT_X + SLOT - 8 - (FORKS[skill.kind].length - 1 - n) * 5, top + SLOT - 5, 3, 3)
  })
  if (waiting > 0) {
    const h = Math.round((SLOT - 2) * waiting)
    ctx.fillStyle = 'rgba(118, 214, 72, 0.22)'
    ctx.fillRect(SLOT_X + 1, top + SLOT - 1 - h, SLOT - 2, h)
  }
  if (skill.swelling) {
    ctx.fillStyle = tint ?? WHITE
    ctx.fillRect(SLOT_X + 1, top + SLOT - 2 - Math.round((SLOT - 3) * skill.swell), 2, Math.round((SLOT - 3) * skill.swell))
  }
  drawPips(ctx, g, skill, SLOT_X + 2, top + 2)
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash * 5})`
    ctx.fillRect(SLOT_X, top, SLOT, SLOT)
  }
  drawPrompt(ctx, skillAction(slot), SLOT_X - promptWidth(skillAction(slot)) - 2, top)
}

const drawHearts = (ctx, g, top) => {
  const { hp } = g.player
  const max = TUNING.player.hp
  const pitch = 9
  const left = Math.floor((101 - max * pitch) / 2)
  const pulse = hp <= 2 && Math.floor(g.time * 6) % 2 === 0
  for (let i = 0; i < max; i++) {
    const on = i < hp
    const jolt = g.hurtFlash > 0.4 ? Math.round((Math.random() - 0.5) * 3) : 0
    ctx.fillStyle = on ? (pulse ? WHITE : RED) : RED_DIM
    ctx.fillRect(left + i * pitch + jolt, top, 8, on ? 4 : 2)
  }
}

const drawCounts = (ctx, g, top) => {
  const coin = SPRITES.icons.coin
  const bomb = SPRITES.icons.bomb
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(coin, 18, top - 1, 8, 8)
  drawText(ctx, g.gold, 28, top, YELLOW)
  ctx.drawImage(bomb, 56, top - 1, 8, 8)
  drawText(ctx, g.player.bombs, 66, top, WHITE)
  drawPrompt(ctx, 'bomb', 74, top - 2)
}

const drawLeft = (ctx, g) => {
  for (let slot = 0; slot < TUNING.player.skillSlots; slot++) drawSkillSlot(ctx, g, slot)
  const below = ORIGIN.y + TUNING.player.skillSlots * SLOT_GAP + 4
  drawHearts(ctx, g, below)
  drawCounts(ctx, g, below + 10)
  drawHitNote(ctx, g, 50, below + 34)
  drawChainCount(ctx, g, 18, below + 50)
}

const numberRight = (ctx, value, right, y, colour, scale = 1) => {
  const text = String(value)
  drawText(ctx, text, right - textWidth(text) * scale, y, colour, scale)
}

const rollScore = (g, dt = 1 / 60) => {
  g.shownScore = g.shownScore ?? g.score
  g.shownScore += (g.score - g.shownScore) * Math.min(1, dt * 12)
  if (Math.abs(g.score - g.shownScore) < 1) g.shownScore = g.score
  return Math.round(g.shownScore)
}

const drawRelicRow = (ctx, g, x, top) => {
  let n = 0
  ctx.imageSmoothingEnabled = false
  for (const id of g.player.relics) {
    ctx.drawImage(SPRITES.icons[RELIC_BY_ID[id].icon], x + (n % 8) * 10, top + Math.floor(n / 8) * 10, 9, 9)
    n += 1
  }
}

const drawXp = (ctx, g, x, top) => {
  const filled = Math.round((SPAN * g.xp) / g.nextLevel)
  ctx.fillStyle = DIM
  ctx.fillRect(x, top, SPAN, 3)
  ctx.fillStyle = GREEN
  ctx.fillRect(x, top, filled, 3)
}

const drawSeals = (ctx, g, x, top) => {
  ctx.imageSmoothingEnabled = false
  for (let i = 0; i < 3; i++) ctx.drawImage(SPRITES.icons[i < g.seals ? 'seal_broken' : 'seal'], x + i * 12, top, 10, 10)
  if (g.omen) ctx.drawImage(SPRITES.icons[`omen_${g.omen}`], x + SPAN - 10, top, 10, 10)
}

const drawRight = (ctx, g) => {
  const x = VIEW.w - 101 + Math.floor((101 - SPAN) / 2)
  box(ctx, x, ORIGIN.y, SPAN, SPAN, GREEN)
  drawMapGrid(ctx, g, x + 2, ORIGIN.y + 2, 5)
  let y = ORIGIN.y + SPAN + 8
  numberRight(ctx, rollScore(g), x + SPAN, y, WHITE, 2)
  y += 13
  numberRight(ctx, g.best, x + SPAN, y, DIM)
  y += 9
  drawXp(ctx, g, x, y)
  drawText(ctx, g.level, x, y + 6, GREEN)
  y += 14
  drawSeals(ctx, g, x, y)
  y += 13
  drawRelicRow(ctx, g, x, y)
}

const drawChainCount = (ctx, g, x, y) => {
  if (g.chain < 2) return
  const scale = g.chainPunch > 0.4 ? 3 : 2
  const fresh = g.chainPunch > 0.55
  drawText(ctx, `X${g.chain}`, x, y, fresh ? WHITE : YELLOW, scale)
  const width = textWidth(`X${g.chain}`) * 2
  ctx.fillStyle = YELLOW
  ctx.fillRect(x, y + 5 * scale + 2, Math.min(width, Math.round((width * g.chainTime) / TUNING.run.chainWindow)), 1)
}

const drawHitNote = (ctx, g, x, y) => {
  if (!g.hitNote) return
  drawPictogram(ctx, CAUSE_ICONS[g.hitNote.cause] ?? CAUSE_ICONS.DEFAULT, x, y, HIT, 2)
}

const disc = (ctx, cx, cy, r) => {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy))
    ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1)
  }
}

const ring = (ctx, cx, cy, r, line, fill = INK) => {
  ctx.fillStyle = line
  disc(ctx, cx, cy, r)
  ctx.fillStyle = fill
  disc(ctx, cx, cy, r - 1)
}

const MARKS = {
  jump: ['..#..', '.###.', '#####', '..#..', '..#..', '..#..'],
  shoot: ['..#..', '.....', '#.#.#', '.....', '..#..'],
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##'],
  close: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
}

const mark = (ctx, rows, cx, cy, colour, scale = 2) => {
  ctx.fillStyle = colour
  const left = Math.round(cx - (rows[0].length * scale) / 2)
  const top = Math.round(cy - (rows.length * scale) / 2)
  rows.forEach((row, y) => [...row].forEach((on, x) => {
    if (on === '#') ctx.fillRect(left + x * scale, top + y * scale, scale, scale)
  }))
}

const SKILL_SLOTS = { skill: 0, skill2: 1, skill3: 2 }

const drawSkillButton = (ctx, g, b, held) => {
  const skill = g.player.skills[SKILL_SLOTS[b.action]]
  if (!skill) {
    ring(ctx, b.x, b.y, b.r, DIM)
    return
  }
  const waiting = waitingOf(g.player, skill)
  const { tint } = formOf(g.player, skill.kind)
  const wasWaiting = readiness.get(skill) ?? 0
  readiness.set(skill, waiting)
  skill.flash = wasWaiting > 0 && waiting === 0 ? 0.18 : Math.max(0, (skill.flash ?? 0) - 1 / 60)
  const fed = Math.max(skill.fed ?? 0, skill.gulp ?? 0)
  if (fed > 0.04) {
    ctx.globalAlpha = 0.4 + fed * 0.6
    ring(ctx, b.x, b.y, b.r + 2, feedColour(skill), 'rgba(0, 0, 0, 0)')
    ctx.globalAlpha = 1
  }
  ring(ctx, b.x, b.y, b.r, skill.flash > 0 ? WHITE : fed > 0.04 ? feedColour(skill) : waiting > 0 ? MID : tint ?? GREEN, held ? '#1a3a24' : INK)
  if (fed > 0.04) {
    ctx.fillStyle = WHITE
    const count = 1 + Math.round(fed * 2)
    for (let n = 0; n < count; n++) {
      const a = g.time * (3 + fed * 7) + (n * Math.PI * 2) / count
      ctx.fillRect(Math.round(b.x + Math.cos(a) * (b.r + 1)), Math.round(b.y + Math.sin(a) * (b.r + 1)), 2, 2)
    }
  }
  ctx.globalAlpha = waiting > 0 ? 0.4 : 1
  ctx.drawImage(tintedIcon(skill.kind, tint), Math.round(b.x) - 8, Math.round(b.y) - 8)
  ctx.globalAlpha = 1
  if (waiting > 0) {
    ctx.fillStyle = GREEN
    ctx.fillRect(Math.round(b.x) - 8, Math.round(b.y) + b.r - 3, Math.round(16 * (1 - waiting)), 2)
  }
  if (skill.swelling) {
    ctx.fillStyle = tint ?? WHITE
    ctx.fillRect(Math.round(b.x) - 8, Math.round(b.y) + b.r - 3, Math.round(16 * skill.swell), 2)
  }
  const pips = pipsOf(g.player, skill)
  if (pips) drawPips(ctx, g, skill, Math.round(b.x) - pips.most * 2, Math.round(b.y) - b.r + 2)
}

const drawActionButton = (ctx, g, b, held) => {
  ring(ctx, b.x, b.y, b.r, held ? YELLOW : GREEN, held ? '#1a3a24' : INK)
  if (MARKS[b.action]) mark(ctx, MARKS[b.action], b.x, b.y, held ? YELLOW : GREEN, b.r > 20 ? 3 : 2)
  else {
    const icon = SPRITES.icons[b.action === 'look' ? 'eye' : 'bomb']
    ctx.drawImage(icon, Math.round(b.x) - 8, Math.round(b.y) - 8)
  }
  if (b.action === 'bomb') drawText(ctx, g.player.bombs, Math.round(b.x) + b.r - 3, Math.round(b.y) + b.r - 6, WHITE)
  if (b.action === 'shoot' && touchView.aim) {
    ctx.fillStyle = YELLOW
    ctx.fillRect(Math.round(b.x + touchView.aim.x * (b.r + 3)) - 1, Math.round(b.y + touchView.aim.y * (b.r + 3)) - 1, 3, 3)
  }
}

const drawStick = ctx => {
  const rest = stickRest()
  const { stick } = touchView
  if (!stick) {
    ring(ctx, rest.x, rest.y, 18, DIM)
    ctx.fillStyle = DIM
    disc(ctx, rest.x, rest.y, 6)
    return
  }
  ring(ctx, stick.from.x, stick.from.y, 18, MID)
  const dx = stick.at.x - stick.from.x
  const dy = stick.at.y - stick.from.y
  const pull = Math.min(1, 18 / Math.max(1, Math.hypot(dx, dy)))
  ctx.fillStyle = GREEN
  disc(ctx, stick.from.x + dx * pull, stick.from.y + dy * pull, 8)
}

export const drawTouchControls = (ctx, g) => {
  if (!isTouchLayout()) return
  ctx.imageSmoothingEnabled = false
  const menu = g.menus.at(-1)
  if (g.phase === 'playing' && !menu) {
    drawStick(ctx)
    for (const b of touchButtons()) {
      const held = touchView.held.has(b.action)
      if (b.action in SKILL_SLOTS) drawSkillButton(ctx, g, b, held)
      else drawActionButton(ctx, g, b, held)
    }
  }
  if (menu && !menu.back && !menu.cancel) return
  if (!menu && g.phase !== 'playing') return
  const b = pauseButton()
  ring(ctx, b.x, b.y, b.r, menu ? YELLOW : MID)
  mark(ctx, menu ? MARKS.close : MARKS.pause, b.x, b.y, menu ? YELLOW : GREEN, 1)
}

const drawTallHud = (ctx, g) => {
  const { inset } = LAYOUT
  const top = inset.top + 3
  const left = inset.left + 22
  const { hp } = g.player
  for (let i = 0; i < TUNING.player.hp; i++) {
    ctx.fillStyle = i < hp ? (hp <= 2 && Math.floor(g.time * 6) % 2 === 0 ? WHITE : RED) : RED_DIM
    ctx.fillRect(left + i * 6, top + 1, 5, i < hp ? 4 : 2)
  }
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(SPRITES.icons.coin, left + 52, top, 7, 7)
  drawText(ctx, g.gold, left + 61, top + 1, YELLOW)
  numberRight(ctx, rollScore(g), VIEW.w - inset.right - 4, top + 1, WHITE)
  const xpTop = ORIGIN.y - 4
  const width = VIEW.w - inset.left - inset.right - 8
  ctx.fillStyle = DIM
  ctx.fillRect(inset.left + 4, xpTop, width, 2)
  ctx.fillStyle = GREEN
  ctx.fillRect(inset.left + 4, xpTop, Math.round((width * g.xp) / g.nextLevel), 2)
  const below = ORIGIN.y + 224 + 4
  const pitch = 3
  drawMapGrid(ctx, g, inset.left + 4, below, pitch)
  for (let i = 0; i < 3; i++) ctx.drawImage(SPRITES.icons[i < g.seals ? 'seal_broken' : 'seal'], inset.left + 52 + i * 11, below, 9, 9)
  if (g.omen) ctx.drawImage(SPRITES.icons[`omen_${g.omen}`], inset.left + 52, below + 12, 10, 10)
  drawText(ctx, g.level, inset.left + 68, below + 14, GREEN)
  drawChainCount(ctx, g, inset.left + 90, below + 2)
  drawHitNote(ctx, g, VIEW.w - inset.right - 16, below + 12)
}

const drawWideHud = (ctx, g) => {
  const { inset } = LAYOUT
  const left = inset.left + 22
  const top = inset.top + 4
  const { hp } = g.player
  for (let i = 0; i < TUNING.player.hp; i++) {
    ctx.fillStyle = i < hp ? (hp <= 2 && Math.floor(g.time * 6) % 2 === 0 ? WHITE : RED) : RED_DIM
    ctx.fillRect(left + i * 7, top + 1, 6, i < hp ? 4 : 2)
  }
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(SPRITES.icons.coin, inset.left + 6, top + 14, 8, 8)
  drawText(ctx, g.gold, inset.left + 16, top + 16, YELLOW)
  drawText(ctx, rollScore(g), inset.left + 6, top + 26, WHITE, 2)
  const col = Math.max(40, ORIGIN.x - inset.left - 14)
  ctx.fillStyle = DIM
  ctx.fillRect(inset.left + 6, top + 40, col, 3)
  ctx.fillStyle = GREEN
  ctx.fillRect(inset.left + 6, top + 40, Math.round((col * g.xp) / g.nextLevel), 3)
  drawText(ctx, g.level, inset.left + 6, top + 46, GREEN)
  for (let i = 0; i < 3; i++) ctx.drawImage(SPRITES.icons[i < g.seals ? 'seal_broken' : 'seal'], inset.left + 18 + i * 11, top + 44, 9, 9)
  if (g.omen) ctx.drawImage(SPRITES.icons[`omen_${g.omen}`], inset.left + 54, top + 44, 10, 10)
  drawRelicRow(ctx, g, inset.left + 6, top + 58)
  drawChainCount(ctx, g, inset.left + 6, top + 82)
  drawHitNote(ctx, g, inset.left + 74, top + 88)
  const pitch = 4
  const span = 15 * pitch + 3
  const right = VIEW.w - inset.right - 4 - span
  box(ctx, right, inset.top + 3, span, span, GREEN)
  drawMapGrid(ctx, g, right + 2, inset.top + 5, pitch)
}

export const drawHud = (ctx, g) => {
  if (isTouchLayout()) {
    if (isTall()) drawTallHud(ctx, g)
    else drawWideHud(ctx, g)
    return
  }
  drawLeft(ctx, g)
  drawRight(ctx, g)
}
