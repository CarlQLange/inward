import { BLOCK, ROOM, TUNING } from './config.js'
import { artKind } from './cast.js'
import { RELIC_BY_ID } from './relics.js'
import { nameOf } from './discover.js'
import { SPRITES, creatureFrames } from './sprites.js'
import { drawText, textWidth } from './font.js'

const ROOM_PX = ROOM * BLOCK
const REVEAL_COLOURS = { skill: '#f5e663', relic: '#ffb347', foe: '#ff6a5a', inhabitant: '#7dff8a', event: '#c78bff', warden: '#ff3a3a', omen: '#6fd0e0', seal: '#ffffff' }
const EVENT_ICONS = { arena: 'skull', chest: 'chest', flood: 'gills', gasworks: 'ember', collapse: 'hammer', vault: 'chest', nest: 'seed', altar: 'altar' }

export const revealArt = ({ kind, id }) => {
  if (kind === 'skill') return SPRITES.icons[id]
  if (kind === 'relic') return SPRITES.icons[RELIC_BY_ID[id]?.icon]
  if (kind === 'omen') return SPRITES.icons[`omen_${id}`]
  if (kind === 'event') return SPRITES.icons[EVENT_ICONS[id]]
  if (kind === 'seal') return SPRITES.icons.seal_broken
  return creatureFrames(artKind(id))[0]?.[0] ?? null
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

const RAYS = 16

export const drawReveal = (ctx, g) => {
  const reveal = g.reveal
  if (!reveal) return
  const age = TUNING.run.revealLife - reveal.life
  const colour = REVEAL_COLOURS[reveal.kind] ?? '#ffffff'
  const open = Math.min(1, age * 7)
  const middle = ROOM_PX / 2
  const half = Math.round(46 * open)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
  ctx.fillRect(0, middle - half, ROOM_PX, half * 2)
  ctx.fillStyle = colour
  ctx.fillRect(0, middle - half, ROOM_PX, 1)
  ctx.fillRect(0, middle + half - 1, ROOM_PX, 1)
  for (let i = 0; i < RAYS; i++) {
    const a = (i / RAYS) * Math.PI * 2 + age * 0.6
    const from = 34 + (i % 2) * 6
    const to = from + Math.min(1, age * 3) * (i % 2 ? 10 : 20)
    for (let t = from; t < to; t += 2) {
      const y = middle - 8 + Math.sin(a) * t
      if (Math.abs(y - middle) < half - 1) ctx.fillRect(Math.round(middle + Math.cos(a) * t), Math.round(y), 1, 1)
    }
  }
  const art = revealArt(reveal)
  if (art && open >= 1) {
    const scale = Math.max(1, Math.min(3, Math.floor(56 / Math.max(art.width, art.height))))
    const pop = Math.max(0, 1 - (age - 0.14) * 8)
    const w = art.width * scale
    const h = art.height * scale
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(art, Math.round(middle - w / 2), Math.round(middle - 8 - h / 2 - pop * 4), w, h)
    if (pop > 0) {
      ctx.globalAlpha = pop
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, middle - half, ROOM_PX, half * 2)
      ctx.globalAlpha = 1
    }
  }
  if (reveal.kind === 'seal' || age < 0.3) return
  const name = nameOf(reveal.kind, reveal.id)
  drawText(ctx, name, Math.round((ROOM_PX - textWidth(name) * 2) / 2), middle + 28, colour, 2)
}

export const drawWardenMarks = (ctx, g, left, top, pitch) => {
  const skull = SPRITES.icons.map_skull
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
