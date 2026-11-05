import { BLOCK, ROOM, TUNING } from './config.js'
import { artKind } from './cast.js'
import { RELIC_BY_ID } from './relics.js'
import { nameOf } from './discover.js'
import { SPRITES, creatureFrames } from './sprites.js'
import { drawText, textWidth } from './font.js'
import { CAUSE_ICONS, drawPictogram } from './pictograms.js'
import { SCHOOLS } from './wards.js'

const ROOM_PX = ROOM * BLOCK
const REVEAL_COLOURS = { skill: '#f5e663', relic: '#ffb347', foe: '#ff6a5a', inhabitant: '#7dff8a', event: '#c78bff', warden: '#ff3a3a', omen: '#6fd0e0', seal: '#ffffff', keystone: '#ffe84a', mutation: '#ff5a4a' }
const EVENT_ICONS = { arena: 'skull', chest: 'chest', flood: 'gills', gasworks: 'ember', collapse: 'hammer', vault: 'chest', nest: 'seed', altar: 'altar' }

export const revealArt = ({ kind, id }) => {
  if (kind === 'skill') return SPRITES.icons[id]
  if (kind === 'relic') return SPRITES.icons[RELIC_BY_ID[id]?.icon]
  if (kind === 'keystone') return SPRITES.icons[`key_${id}`]
  if (kind === 'mutation') return SPRITES.icons[`mut_${id}`]
  if (kind === 'omen') return SPRITES.icons[`omen_${id}`]
  if (kind === 'event') return SPRITES.icons[EVENT_ICONS[id]]
  if (kind === 'seal') return SPRITES.icons.seal_broken
  return creatureFrames(artKind(id))[0]?.[0] ?? null
}

const drawFoeWards = (ctx, g) => {
  for (const e of g.enemies) {
    if (e.ward) drawPictogram(ctx, CAUSE_ICONS[e.ward], e.x + e.w / 2, Math.max(6, e.y - 7), SCHOOLS[e.ward])
    if (e.stalkTo) {
      ctx.strokeStyle = '#c79ae0'
      ctx.strokeRect(Math.round(e.stalkTo.x) + 0.5, Math.round(e.stalkTo.y) + 0.5, e.w, e.h)
    }
  }
}

export const drawBossBar = (ctx, g) => {
  drawFoeWards(ctx, g)
  const boss = g.boss
  if (!boss || !boss.maxHp) return
  const width = ROOM_PX - 24
  const share = Math.max(0, boss.hp / boss.maxHp)
  ctx.fillStyle = '#000'
  ctx.fillRect(11, 3, width + 2, 5)
  ctx.fillStyle = boss.shield > 0 ? '#ffffff' : boss.stun > 0 ? '#f5e663' : '#ff3a3a'
  ctx.fillRect(12, 4, Math.round(width * share), 3)
  drawWards(ctx, g, boss)
}

const auraPoint = (e, t) => {
  const a = t * Math.PI * 2
  return { x: e.x + e.w / 2 + Math.cos(a) * (e.w / 2 + 6), y: e.y + e.h / 2 + Math.sin(a) * (e.h / 2 + 6) }
}

const drawAura = (ctx, g, e, school, index) => {
  const flash = (e.wardHit ?? 0) > 0
  ctx.fillStyle = flash ? '#ffffff' : SCHOOLS[school]
  const dots = 18 + Math.round((e.w + e.h) / 6)
  for (let i = 0; i < dots; i++) {
    if ((i + index) % 3 === 2 && !flash) continue
    const { x, y } = auraPoint(e, i / dots + g.time * (index ? -0.12 : 0.12))
    const size = flash || i % 3 === 0 ? 2 : 1
    ctx.fillRect(Math.round(x), Math.round(y), size, size)
  }
}

const wornSpot = (e, index) => ({ x: e.x + e.w / 2 + (index - 0.5) * 12 * (e.wards.length - 1), y: Math.max(16, e.y - 12) })

const drawReading = (ctx, g, e, school) => {
  const t = 1 - e.reading / TUNING.run.wards.readTime
  const from = { x: g.player.x + g.player.w / 2, y: g.player.y + 4 }
  const to = wornSpot(e, 0)
  const flight = Math.min(1, t * 1.6)
  const eased = flight * flight * (3 - 2 * flight)
  const scale = t < 0.62 ? 2 : Math.max(1, Math.round(3 - (t - 0.62) * 6))
  drawPictogram(ctx, CAUSE_ICONS[school], from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased, SCHOOLS[school], scale)
}

const drawWards = (ctx, g, e) => {
  e.wards?.forEach(({ school }, index) => {
    drawAura(ctx, g, e, school, index)
    drawPictogram(ctx, CAUSE_ICONS[school], ROOM_PX - 10 - index * 11, 14, SCHOOLS[school])
    if (e.reading > 0 && index === 0) drawReading(ctx, g, e, school)
    else {
      const { x, y } = wornSpot(e, index)
      drawPictogram(ctx, CAUSE_ICONS[school], x, y + Math.round(Math.sin(g.time * 4)), (e.wardHit ?? 0) > 0 ? '#ffffff' : SCHOOLS[school])
    }
  })
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
