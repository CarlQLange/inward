import { ORIGIN, TUNING, VIEW } from './config.js'
import { SPRITES } from './sprites.js'
import { SCARF_RED } from './hero.js'
import { drawText, textWidth } from './font.js'
import { RELIC_BY_ID } from './relics.js'
import { drawMapGrid } from './screens.js'
import { skillAction } from './controls.js'
import { drawPrompt, promptWidth } from './glyphs.js'
import { FORKS, cooldownOf, formOf } from './skills.js'
import { tintedIcon } from './skillart.js'

const GREEN = '#76d648'
const DIM = '#26542a'
const MID = '#3d7a3c'
const WHITE = '#f4f8f2'
const YELLOW = '#ffe84a'
const RED = `rgb(${SCARF_RED.join(',')})`
const RED_DIM = '#4a1420'

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

const drawSkillSlot = (ctx, g, slot) => {
  const top = ORIGIN.y + slot * SLOT_GAP
  const skill = g.player.skills[slot]
  if (!skill) {
    corners(ctx, SLOT_X, top, SLOT, DIM)
    return
  }
  const whole = cooldownOf(g.player, skill.kind)
  const { tint, stage } = formOf(g.player, skill.kind)
  const waiting = Math.max(0, Math.min(1, skill.ready / whole))
  const wasWaiting = readiness.get(skill) ?? 0
  const flash = wasWaiting > 0 && waiting === 0 ? 0.18 : Math.max(0, (skill.flash ?? 0) - 1 / 60)
  skill.flash = flash
  readiness.set(skill, waiting)
  box(ctx, SLOT_X, top, SLOT, SLOT, waiting > 0 ? MID : tint ?? GREEN)
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

export const drawHud = (ctx, g) => {
  drawLeft(ctx, g)
  drawRight(ctx, g)
}
