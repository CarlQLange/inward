import { ORIGIN, ROOM, BLOCK, VIEW } from './config.js'
import { ENEMY_DEFS } from './enemies.js'
import { RELIC_BY_ID } from './relics.js'
import { OMENS } from './omens.js'
import { nameOf } from './discover.js'
import { SPRITES } from './sprites.js'
import { drawText, textWidth } from './font.js'

const ROOM_PX = ROOM * BLOCK
const REVEAL_COLOURS = { skill: '#f5e663', relic: '#ffb347', foe: '#ff6a5a', inhabitant: '#7dff8a', event: '#c78bff', warden: '#ff3a3a', omen: '#6fd0e0', seal: '#ffffff' }
const EVENT_ICONS = { arena: 'skull', chest: 'chest', flood: 'gills', gasworks: 'ember', collapse: 'hammer', vault: 'chest', nest: 'seed', altar: 'altar' }

const revealIcon = ({ kind, id }) => {
  if (kind === 'skill') return SPRITES.icons[id]
  if (kind === 'relic') return SPRITES.icons[RELIC_BY_ID[id]?.icon]
  if (kind === 'omen') return SPRITES.icons[OMENS[id]?.icon]
  if (kind === 'event') return SPRITES.icons[EVENT_ICONS[id]]
  if (kind === 'seal') return SPRITES.icons.skull
  const def = ENEMY_DEFS[id]
  return def ? SPRITES.creatures[def.sprite[0]]?.[0] : null
}

export const drawBossBar = (ctx, g) => {
  const boss = g.boss
  if (!boss || !boss.maxHp) return
  const width = ROOM_PX - 24
  const share = Math.max(0, boss.hp / boss.maxHp)
  ctx.fillStyle = '#000'
  ctx.fillRect(11, 3, width + 2, 5)
  ctx.fillStyle = boss.shield > 0 ? '#ffffff' : boss.stun > 0 ? '#f5e663' : '#ff3a3a'
  ctx.fillRect(12, 4, Math.round(width * share), 3)
}

export const drawReveal = (ctx, g) => {
  const reveal = g.reveal
  if (!reveal) return
  const colour = REVEAL_COLOURS[reveal.kind] ?? '#ffffff'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
  ctx.fillRect(0, 0, ROOM_PX, ROOM_PX)
  ctx.fillStyle = colour
  ctx.fillRect(0, ROOM_PX / 2 - 40, ROOM_PX, 1)
  ctx.fillRect(0, ROOM_PX / 2 + 28, ROOM_PX, 1)
  const icon = revealIcon(reveal)
  if (icon) ctx.drawImage(icon, ROOM_PX / 2 - 24, ROOM_PX / 2 - 36, 48, 48)
  const name = reveal.kind === 'seal' ? '' : nameOf(reveal.kind, reveal.id)
  drawText(ctx, name, (ROOM_PX - textWidth(name)) / 2, ROOM_PX / 2 + 16, colour)
}

export const drawWardenMarks = (ctx, g, left, top, pitch) => {
  const skull = SPRITES.icons.skull
  for (const { x, y, dead } of Object.values(g.wardens ?? {})) {
    if (!dead) ctx.drawImage(skull, left + x * pitch - 1, top + y * pitch - 1, pitch + 1, pitch + 1)
    else {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(left + x * pitch + 2, top + y * pitch + 2, pitch - 5, pitch - 5)
    }
  }
  if (!g.charted) return
  ctx.fillStyle = '#3f7a4f'
  for (const key of Object.keys(g.map.links)) {
    if (g.rooms[key]?.visited) continue
    const [x, y] = key.split(',').map(Number)
    ctx.fillRect(left + x * pitch + 2, top + y * pitch + 2, pitch - 5, pitch - 5)
  }
}

export const drawRunMarks = (ctx, g) => {
  const x = ORIGIN.x + ROOM_PX + 6
  const y = VIEW.h - 22
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < g.seals ? '#ffffff' : '#3a3a3a'
    ctx.fillRect(x + i * 7, y, 5, 5)
  }
  const icon = g.omen ? SPRITES.icons[OMENS[g.omen]?.icon] : null
  if (icon) ctx.drawImage(icon, x + 24, y - 3, 10, 10)
}
