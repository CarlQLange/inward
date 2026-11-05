import { BLOCK, ROOM, TUNING } from './config.js'
import { M, props } from './materials.js'
import { matAt } from './world.js'
import { SPRITES } from './sprites.js'
import { drawText, textWidth } from './font.js'
import { eraIndex, eraOf, softDisc } from './particles.js'

const S = TUNING.skills

const WHITE = '#f4f8f2'
const COLD = '#bff2ff'
const MAGNET = '#6fd0ff'
const FIRE = '#ff9a2e'
const CHARGE = '#ffe84a'
const GAS = '#c79ae0'
const BLOOD = '#ff5a4a'
const ACID = '#8ae04a'
const LEAF = '#4f9c3a'
const LEAF_LIGHT = '#8ad05a'
const STONE = '#c9d4c0'

const icons = new Map()

export const tintedIcon = (name, tint) => {
  const icon = SPRITES.icons[name]
  if (!tint) return icon
  const key = `${name}:${tint}`
  if (!icons.has(key)) {
    const canvas = document.createElement('canvas')
    canvas.width = icon.width
    canvas.height = icon.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(icon, 0, 0)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = tint
    ctx.globalAlpha = 0.55
    ctx.fillRect(0, 0, icon.width, icon.height)
    icons.set(key, canvas)
  }
  return icons.get(key)
}

const dot = (ctx, x, y, w = 1, h = w, colour = WHITE) => {
  ctx.fillStyle = colour
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

const dotted = (ctx, a, b, colour, gap = 3, phase = 0) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  ctx.fillStyle = colour
  for (let d = phase % gap; d < length; d += gap) ctx.fillRect(Math.round(a.x + ((b.x - a.x) * d) / length), Math.round(a.y + ((b.y - a.y) * d) / length), 1, 1)
}

const circle = (ctx, x, y, r, colour, points = 16) => {
  ctx.fillStyle = colour
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1)
  }
}

const iceTile = () => SPRITES.tiles.ice?.[0]

const BEAM = '#fff3b4'
const PRISM_TONES = { [-1]: '#ffb39a', 1: '#9ad8ff' }
const PIECE_LOOK = { [M.GLASS]: '#d6f6f0', [M.ICE]: '#bff2ff' }

const line = (ctx, a, b, size, colour) => {
  const length = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
  const off = (size - 1) / 2
  ctx.fillStyle = colour
  ctx.beginPath()
  for (let d = 0; d <= length; d += 1) ctx.rect(Math.round(a.x + ((b.x - a.x) * d) / length - off), Math.round(a.y + ((b.y - a.y) * d) / length - off), size, size)
  ctx.fill()
}

const dazzled = (ctx, g, e) => {
  const reach = 3 + (Math.floor(g.time * 16) % 2)
  const [l, r, t, b] = [e.x - 2, e.x + e.w + 1, e.y - 2, e.y + e.h + 1]
  for (let k = 0; k < reach; k++) {
    dot(ctx, l - k, t - k, 1, 1, WHITE)
    dot(ctx, r + k, t - k, 1, 1, WHITE)
    dot(ctx, l - k, b + k, 1, 1, WHITE)
    dot(ctx, r + k, b + k, 1, 1, WHITE)
  }
}

const drawPieces = (ctx, g, f, still) => {
  for (const piece of f.pieces) {
    const bob = still ? Math.round(Math.sin(g.time * 3 + piece.seed) * 2) : 0
    const shake = still ? 0 : Math.sin(g.time * 50 + piece.seed) > 0 ? 1 : 0
    const [x, y] = [Math.round(piece.x - 1 + shake), Math.round(piece.y - 2 + bob)]
    dot(ctx, x, y, 2, 3, PIECE_LOOK[piece.mat] ?? COLD)
    dot(ctx, x + (Math.floor(g.time * 6 + piece.seed) % 2), y, 1, 1, WHITE)
  }
}

const STILL_LOOK = { [M.WATER]: '#3f9aa2', [M.OIL]: '#a06ab0', [M.LAVA]: '#ffb24a', [M.ACID]: '#a8e85a' }

export const drawSkillMatter = (ctx, g) => {
  const w = g.world
  for (let y = 0; y < ROOM; y++) {
    for (let x = 0; x < ROOM; x++) {
      const m = matAt(w, x, y)
      const [px, py] = [x * BLOCK, y * BLOCK]
      if (m === M.FLOE) {
        ctx.drawImage(iceTile(), px, py)
        dot(ctx, px + 1, py + 1, 6, 1, WHITE)
        dot(ctx, px, py + 7, 8, 1, MAGNET)
      } else if (m === M.RIME) {
        const fading = w.life[y * ROOM + x] < 0.8
        ctx.globalAlpha = fading ? 0.55 : 0.9
        ctx.fillStyle = COLD
        ctx.fillRect(px, py, BLOCK, 3)
        ctx.fillStyle = MAGNET
        ctx.fillRect(px, py + 3, BLOCK, 1)
        ctx.fillRect(px + (x % 3) * 2, py + 4, 2, 2)
        ctx.globalAlpha = 1
      } else if (m === M.STILL) {
        ctx.fillStyle = STILL_LOOK[w.life[y * ROOM + x]] ?? COLD
        ctx.fillRect(px, py, BLOCK, BLOCK)
        dot(ctx, px + (x % 4) + 1, py + (y % 3) + 1, 3, 1, WHITE)
        if (matAt(w, x, y - 1) !== M.STILL) dot(ctx, px, py, BLOCK, 1, WHITE)
      }
    }
  }
}

const hammerHead = (ctx, f, colour) => {
  const a = f.spin ?? 0
  for (let d = -6; d <= 6; d++) dot(ctx, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 1, 1, WHITE)
  for (let d = -3; d <= 3; d++) dot(ctx, f.x + Math.cos(a) * 6 - Math.sin(a) * d, f.y + Math.sin(a) * 6 + Math.cos(a) * d, 2, 2, colour)
}

const ART = {
  globe: (ctx, g, f) => {
    const c = { x: f.x + 3, y: f.y + 3 }
    circle(ctx, c.x, c.y, 4 + Math.sin(g.time * 18), MAGNET, 12)
    dot(ctx, c.x - 2, c.y - 2, 4, 4, WHITE)
    for (let i = 0; i < 3; i++) dot(ctx, c.x + (Math.random() - 0.5) * 16, c.y + (Math.random() - 0.5) * 16, 1, 1, CHARGE)
  },
  nail: (ctx, g, f) => {
    dot(ctx, f.x - 1, f.y - 3, 2, 6, WHITE)
    dot(ctx, f.x - 2, f.y - 4, 4, 1, MAGNET)
    if (!f.warning) return
    let top = Math.floor(f.y / BLOCK)
    while (top > 0 && !props(matAt(g.world, Math.floor(f.x / BLOCK), top - 1)).solid) top--
    dotted(ctx, { x: f.x, y: top * BLOCK }, f, WHITE, 3, g.time * 30)
  },
  thrown: (ctx, g, f) => {
    if (f.lands === 'floe' && iceTile()) ctx.drawImage(iceTile(), Math.round(f.x), Math.round(f.y))
    else dot(ctx, f.x, f.y, f.w, f.h, f.colour)
  },
  fuse: (ctx, g, f) => {
    dot(ctx, f.x - 2, f.y - 2, 5, 5, '#2a2a2a')
    dot(ctx, f.x - 1, f.y - 4, 1, 2, FIRE)
    if (Math.floor(g.time * 12) % 2) dot(ctx, f.x - 1, f.y - 1, 3, 3, BLOOD)
  },
  hurl: (ctx, g, f) => hammerHead(ctx, f, MAGNET),
  orbit: (ctx, g, f) => {
    for (const t of f.tiles ?? []) {
      ctx.drawImage(SPRITES.tiles.scrap[0], Math.round(t.x - 1), Math.round(t.y - 1), 6, 6)
    }
  },
  wisp: (ctx, g, f) => {
    const frame = SPRITES.flames[Math.floor(g.time * 12) % SPRITES.flames.length]
    ctx.drawImage(frame, Math.round(f.x - 2), Math.round(f.y - 4))
    dot(ctx, f.x + 1, f.y, 2, 2, MAGNET)
  },
  glide: (ctx, g, f) => {
    const p = g.player
    for (let i = 0; i < 3; i++) dot(ctx, p.x + Math.random() * p.w, p.y + p.h - Math.random() * 4, 1, 1, COLD)
    if (f.life < 0.6 && Math.floor(g.time * 12) % 2) return
    dot(ctx, p.x - 1, p.y + p.h, p.w + 2, 1, WHITE)
  },
  twister: (ctx, g, f) => {
    const H = S.gust.twisterHeight
    for (let y = 0; y < H; y += 3) {
      const width = 3 + (y / H) * 11
      const wobble = Math.sin(g.time * 14 + y * 0.4) * (y / H) * 5
      dot(ctx, f.x - width + wobble, f.y - y, width * 2, 1, f.fire ? (y % 2 ? FIRE : CHARGE) : (y % 6 ? WHITE : '#9aa8a0'))
    }
  },
  well: (ctx, g, f) => {
    if (f.nova) {
      const r = ((g.time * 90) % S.well.radius)
      circle(ctx, f.x, f.y, r, WHITE, 24)
      circle(ctx, f.x, f.y, r * 0.5, COLD, 16)
    }
    if (f.vx || f.vy) for (let i = 1; i < 6; i++) dot(ctx, f.x - f.vx * i * 0.08, f.y - f.vy * i * 0.08, 1, 1, BLOOD)
    if (f.lodestone) circle(ctx, f.x, f.y, 14 + Math.sin(g.time * 8) * 2, MAGNET, 10)
    if (f.grinder) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + g.time * 7
        const [cos, sin] = [Math.cos(a), Math.sin(a)]
        for (let r = S.well.grindReach - 3; r <= S.well.grindReach + 2; r++) dot(ctx, f.x + cos * r, f.y + sin * r, 1, 1, STONE)
      }
    }
  },
  lure: (ctx, g, f) => {
    const e = f.follow
    if (!e) return
    const bob = Math.round(Math.sin(g.time * 8))
    dot(ctx, e.x + e.w / 2 - 1, e.y - 7 + bob, 2, 4, BLOOD)
    dot(ctx, e.x + e.w / 2 - 3, e.y - 3 + bob, 6, 1, BLOOD)
    ctx.strokeStyle = BLOOD
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(e.x) - 0.5, Math.round(e.y) - 0.5, e.w + 1, e.h + 1)
  },
  pane: (ctx, g, f) => {
    const half = S.mirror.paneHalf
    const across = { x: -f.ny, y: f.nx }
    for (let d = -half; d <= half; d++) {
      const sheen = (d + Math.floor(g.time * 30)) % 9 === 0
      dot(ctx, f.x + across.x * d, f.y + across.y * d, 2, 2, sheen ? WHITE : COLD)
    }
  },
  flytrap: (ctx, g, f) => {
    const [x, y] = [Math.round(f.x), Math.round(f.y + BLOCK / 2)]
    dot(ctx, x - 1, y - 12, 2, 12, LEAF)
    dot(ctx, x - 4, y - 3, 3, 2, LEAF_LIGHT)
    dot(ctx, x + 1, y - 5, 3, 2, LEAF_LIGHT)
    const open = f.held ? 1 : 4 + Math.round(Math.sin(g.time * 5))
    dot(ctx, x - 6, y - 16 - open, 12, 3, BLOOD)
    dot(ctx, x - 6, y - 13, 12, 3, LEAF_LIGHT)
    for (let i = 0; i < 4; i++) {
      dot(ctx, x - 5 + i * 3, y - 13 - open + 2, 1, Math.min(open, 2), WHITE)
    }
  },
  font: (ctx, g, f) => {
    dot(ctx, f.x - 3, f.y - 5, 6, 3, '#70767a')
    dot(ctx, f.x - 1, f.y - 2, 2, 2, '#70767a')
    dot(ctx, f.x - 4, f.y - 6, 8, 1, WHITE)
  },
  setting: (ctx, g, f) => {
    circle(ctx, f.x, f.y, (f.life / S.spring.setAfter) * BLOCK * 3, f.sets === undefined ? COLD : FIRE, 14)
  },
  bore: (ctx, g, f) => {
    dot(ctx, f.x - 2, f.y - 2, 4, 4, ACID)
    dot(ctx, f.x - 1, f.y - 1, 2, 2, WHITE)
  },
  cloud: (ctx, g, f) => {
    for (const [dx, dy, w, h] of [[-9, -3, 18, 5], [-6, -6, 12, 4], [-4, 2, 8, 2]]) dot(ctx, f.x + dx, f.y + dy, w, h, '#4e8a32')
    for (let i = 0; i < 4; i++) dot(ctx, f.x - 8 + Math.random() * 16, f.y - 5 + Math.random() * 8, 1, 1, ACID)
  },
  tether: (ctx, g, f) => {
    if (!f.from || !f.to) return
    dotted(ctx, f.from, f.to, f.b || f.point ? GAS : '#7d5f8e', f.b || f.point ? 2 : 4, g.time * 20)
    circle(ctx, f.from.x, f.from.y, 6, GAS, 8)
  },
  wraith: (ctx, g, f) => {
    ctx.globalAlpha = 0.55
    dot(ctx, f.x, f.y + 4, f.w, f.h - 4, MAGNET)
    dot(ctx, f.x - 1, f.y, f.w + 2, 5, WHITE)
    ctx.globalAlpha = 1
  },
  shout: (ctx, g, f) => {
    const across = { x: -f.aim.y, y: f.aim.x }
    for (let d = -12; d <= 12; d++) dot(ctx, f.x + across.x * d - f.aim.x * Math.abs(d) * 0.5, f.y + across.y * d - f.aim.y * Math.abs(d) * 0.5, 1, 2, WHITE)
  },
  rod: (ctx, g, f) => {
    const top = { x: f.x + 4, y: f.y + 1 }
    if (f.magnet) circle(ctx, top.x, top.y, ((g.time * 50) % S.rod.pullReach), BLOOD, 18)
    if (f.partner) dotted(ctx, { x: top.x, y: f.y + 9 }, f.partner, CHARGE, 2, g.time * 40)
    if (f.grounded) dot(ctx, f.x + 1, f.y + 15, 6, 1, CHARGE)
    if (f.arcs) dot(ctx, top.x - 1, top.y - 3, 3, 2, WHITE)
  },
  mine: (ctx, g, f) => {
    if (f.wire) dotted(ctx, f.anchor, f.wire, Math.floor(g.time * 4) % 2 ? WHITE : BLOOD, 3)
    const colour = f.cryo ? COLD : f.gas ? GAS : f.rider ? BLOOD : null
    if (colour) dot(ctx, f.x + 1, f.y + 1, 4, 4, colour)
    if (f.rider && Math.floor(g.time * 14) % 2) circle(ctx, f.x + 3, f.y + 3, 6, BLOOD, 8)
  },
  decoy: (ctx, g, f) => {
    if (f.clone) dot(ctx, f.x + 8, f.y + 5, 4, 1, MAGNET)
    if (f.runner) dot(ctx, f.x + 1 + Math.round(Math.sin(g.time * 20) * 2), f.y + 16, 6, 1, WHITE)
    if (f.double) {
      const bob = Math.round(Math.sin(g.time * 6))
      dot(ctx, f.x + 1, f.y - 4 + bob, 6, 1, STONE)
      dot(ctx, f.x + 1, f.y - 4 + bob, 1, 2, STONE)
      dot(ctx, f.x + 6, f.y - 5 + bob, 1, 2, STONE)
      dotted(ctx, { x: f.x + 4, y: f.y + 8 }, { x: g.player.x + 3, y: g.player.y + 8 }, STONE, 6, g.time * 12)
    }
    if (f.gas) dot(ctx, f.x + 3, f.y + 4, 2, 2, GAS)
  },
  drone: (ctx, g, f) => {
    const colour = f.sapper ? BLOOD : f.mole ? WHITE : f.magpie ? CHARGE : f.sentry ? MAGNET : null
    if (colour) dot(ctx, f.x + 2, f.y + 2, 4, 4, colour)
    if (f.sentry) {
      dot(ctx, f.x + 1, f.y + 8, 1, 4, MAGNET)
      dot(ctx, f.x + 6, f.y + 8, 1, 4, MAGNET)
      dot(ctx, f.x + 3, f.y + 7, 2, 2, MAGNET)
    }
    if (f.magpie) {
      dot(ctx, f.x - 2, f.y + 1, 2, 1, CHARGE)
      dot(ctx, f.x + 8, f.y + 1, 2, 1, CHARGE)
      if (f.carrying) dot(ctx, f.x + 2, f.y + 9, 3, 3, CHARGE)
    }
    if (f.sapper && Math.floor(g.time * 12) % 2) circle(ctx, f.x + 4, f.y + 4, 8, BLOOD, 8)
    if (f.mole) for (let i = 0; i < 3; i++) dot(ctx, f.x + f.aim.x * (6 + i * 2), f.y + f.aim.y * (6 + i * 2), 1, 1, WHITE)
  },
  anchor: (ctx, g, f) => {
    const [x, y] = [f.x + 3, f.y + 8]
    const r = 5 + Math.sin(g.time * 6) * 2
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + g.time * 2
      dot(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 1.5, 1, 1, GAS)
    }
    dot(ctx, x - 1, y - 1, 2, 2, WHITE)
  },
  mirror: (ctx, g, f) => {
    if (f.parry) {
      const p = g.player
      ctx.strokeStyle = WHITE
      ctx.lineWidth = 1
      const grow = Math.round((1 - f.life / S.mirror.parryLife) * 4)
      ctx.strokeRect(Math.round(p.x) - 6.5 - grow, Math.round(p.y) - 6.5 - grow, p.w + 13 + grow * 2, p.h + 13 + grow * 2)
    }
    if (!f.maw) return
    const p = g.player
    ctx.strokeStyle = BLOOD
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(p.x) - 7.5, Math.round(p.y) - 7.5, p.w + 15, p.h + 15)
    for (let i = 0; i < f.swallowed; i++) dot(ctx, p.x + i * 3 - 2, p.y - 10, 2, 2, BLOOD)
  },
  rope: (ctx, g, f) => {
    if (!f.from || !f.to) return
    dotted(ctx, f.from, f.to, WHITE, 2, 0)
    dot(ctx, f.x - 1, f.y - 1, 3, 3, WHITE)
  },
  caught: (ctx, g, f) => {
    if (!f.from || !f.to) return
    dotted(ctx, f.from, f.to, BLOOD, 2, g.time * 30)
    const e = f.foe
    ctx.strokeStyle = Math.floor(g.time * 10) % 2 ? BLOOD : WHITE
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(e.x) - 1.5, Math.round(e.y) - 1.5, e.w + 3, e.h + 3)
  },
  hurled: (ctx, g, f) => {
    const e = f.foe
    for (let i = 1; i < 5; i++) dot(ctx, e.x + e.w / 2 - e.vx * i * 0.012, e.y + e.h / 2 - e.vy * i * 0.012, 2, 2, BLOOD)
  },
  recall: (ctx, g, f) => {
    const p = g.player
    if (f.life < 0.6 && Math.floor(g.time * 12) % 2) return
    ctx.strokeStyle = MAGNET
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(f.x) - 0.5, Math.round(f.y) - 0.5, p.w + 1, p.h + 1)
    dotted(ctx, { x: f.x + p.w / 2, y: f.y + p.h / 2 }, { x: p.x + p.w / 2, y: p.y + p.h / 2 }, MAGNET, 5, g.time * 20)
  },
  beam: (ctx, g, f) => {
    const index = eraIndex(g)
    const halo = eraOf(g).alpha
    const warm = f.tint ?? BEAM
    for (const [a, b, tone] of f.segments ?? []) {
      if (index === 0) {
        dotted(ctx, a, b, WHITE, 2, g.time * 90)
        continue
      }
      const colour = index >= 2 && tone ? PRISM_TONES[tone] : warm
      if (halo) {
        ctx.globalAlpha = 0.2 + 0.08 * Math.sin(g.time * 40)
        line(ctx, a, b, index >= 4 ? 3 : 2, colour)
        ctx.globalAlpha = 1
      }
      line(ctx, a, b, 1, index >= 3 ? WHITE : colour)
    }
    for (const end of f.ends ?? []) {
      if (f.dazzle && end.foe) dazzled(ctx, g, end.foe)
      if (index >= 4) softDisc(ctx, Math.round(end.x), Math.round(end.y), 6, warm, 0.35)
      ctx.globalAlpha = 1
      const r = 1 + (Math.floor(g.time * 30) % 2)
      dot(ctx, end.x - r, end.y - r, r * 2, r * 2, WHITE)
    }
  },
  peal: (ctx, g, f) => {
    const index = eraIndex(g)
    if (index >= 2) return
    const r = S.chime.reach * Math.min(1, (1 - f.life / S.chime.ringTime) * 1.3)
    circle(ctx, f.x, f.y, r, f.tint ?? COLD, 44)
    if (index >= 1) circle(ctx, f.x, f.y, r * 0.66, WHITE, 28)
  },
  volley: (ctx, g, f) => drawPieces(ctx, g, f, false),
  hover: (ctx, g, f) => drawPieces(ctx, g, f, true),
  hold: (ctx, g, f) => {
    if (f.life > 0.5 || Math.floor(g.time * 12) % 2) {
      ctx.fillStyle = 'rgba(199, 154, 224, 0.1)'
      ctx.fillRect(0, 0, ROOM * BLOCK, ROOM * BLOCK)
    }
  },
  still: (ctx, g, f) => {
    if (f.life > 0.5 || Math.floor(g.time * 12) % 2) {
      ctx.fillStyle = 'rgba(191, 242, 255, 0.08)'
      ctx.fillRect(0, 0, ROOM * BLOCK, ROOM * BLOCK)
    }
  },
}

const drawLungs = (ctx, g) => {
  const p = g.player
  const held = p.lungs ?? []
  held.slice(0, 12).forEach((_, i) => {
    const a = g.time * 3 + (i / Math.max(1, Math.min(held.length, 12))) * Math.PI * 2
    dot(ctx, p.x + 3 + Math.cos(a) * 7, p.y + 7 + Math.sin(a) * 9, 1, 1, GAS)
  })
}

const drawCreatureStates = (ctx, g) => {
  for (const e of g.enemies) {
    if (e.ablaze > 0) {
      const frame = SPRITES.flames[(Math.floor(g.time * 12) + Math.round(e.x)) % SPRITES.flames.length]
      ctx.drawImage(frame, Math.round(e.x + e.w / 2 - 4), Math.round(e.y - 5))
      ctx.drawImage(frame, Math.round(e.x + e.w / 2 - 6), Math.round(e.y - 1), 6, 6)
    }
    if (e.ally && e.plague) dot(ctx, e.x + e.w / 2 - 1, e.y - 4, 2, 2, ACID)
    if (e.ally && e.pact) dot(ctx, e.x + e.w / 2 - 2, e.y - 4, 4, 1, WHITE)
    if (e.ally && e.bond) dotted(ctx, { x: e.x + e.w / 2, y: e.y + e.h / 2 }, { x: g.player.x + 3, y: g.player.y + 8 }, MAGNET, 4, g.time * 16)
  }
}

const MOTE_SIZE = { blob: 3, tumble: 2, puff: 3, shard: 2, streak: 1, rise: 2, drip: 2, leaf: 2, hop: 2, zig: 2, curl: 2, gather: 2 }

const drawFeedMotes = (ctx, g) => {
  for (const m of g.feedMotes ?? []) {
    const size = MOTE_SIZE[m.flight] ?? 1
    ctx.globalAlpha = m.flight === 'puff' ? 0.6 : 1
    dot(ctx, m.x, m.y, m.flight === 'streak' ? 3 : size, size, m.age / m.life > 0.75 ? WHITE : m.colour)
  }
  ctx.globalAlpha = 1
}

const SWELLS = {
  roar: (ctx, g, skill, c) => {
    const reach = S.roar.reach * (S.roar.swellMin + (S.roar.swellMax - S.roar.swellMin) * skill.swell)
    circle(ctx, c.x, c.y, reach, skill.swell >= 1 ? WHITE : BLOOD, 56)
    circle(ctx, c.x, c.y, reach * (0.5 + 0.5 * Math.sin(g.time * 14) ** 2), BLOOD, 12)
  },
  bolt: (ctx, g, skill, c) => {
    const stored = 1 + Math.floor(skill.swell * S.bolt.leydenMost)
    for (let i = 0; i < stored; i++) {
      const a = g.time * 9 + (i / stored) * Math.PI * 2
      dot(ctx, c.x + Math.cos(a) * 9, c.y + Math.sin(a) * 9, 2, 2, Math.floor(g.time * 20 + i) % 2 ? CHARGE : WHITE)
    }
  },
}

const FLOWS = {
  gust: (ctx, g, p) => {
    for (let i = 0; i < 4; i++) dot(ctx, p.x + Math.random() * p.w, p.y + p.h + Math.random() * 7, 1, 2, i % 2 ? COLD : WHITE)
  },
  dash: (ctx, g, p) => {
    ctx.globalAlpha = 0.5
    for (let i = 1; i < 4; i++) dot(ctx, p.x - p.vx * i * 0.018, p.y + 3 - p.vy * i * 0.018, p.w, p.h - 6, i % 2 ? FIRE : BLOOD)
    ctx.globalAlpha = 1
  },
}

const drawHeldSkills = (ctx, g) => {
  const p = g.player
  const c = { x: p.x + p.w / 2, y: p.y + p.h / 2 }
  for (const skill of p.skills) {
    if (skill.swelling) SWELLS[skill.kind]?.(ctx, g, skill, c)
    if (skill.flowing) FLOWS[skill.kind]?.(ctx, g, p)
  }
}

const drawEvolving = (ctx, g) => {
  const e = g.evolving
  if (!e || e.life <= 0) return
  const p = g.player
  const risen = (TUNING.run.evolveLife - e.life) * 10
  const y = Math.round(p.y - 26 - Math.min(risen, 6))
  if (e.life > 0.3 || Math.floor(g.time * 14) % 2) {
    ctx.drawImage(tintedIcon(e.skill, e.tint), Math.round(p.x + p.w / 2 - 8), y)
    drawText(ctx, e.name, Math.round(p.x + p.w / 2 - textWidth(e.name) / 2), y - 8, e.tint)
  }
}

export const drawSkillEffects = (ctx, g) => {
  for (const f of g.effects) ART[f.kind]?.(ctx, g, f)
  drawCreatureStates(ctx, g)
  drawLungs(ctx, g)
  drawHeldSkills(ctx, g)
  drawFeedMotes(ctx, g)
  drawEvolving(ctx, g)
}
