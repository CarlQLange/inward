import { M } from './materials.js'

const MATERIAL_COLOURS = {
  [M.ROCK]: '#8a9c3e', [M.MOSS]: '#a8c84a', [M.PEAT]: '#7a5a2a', [M.WOOD]: '#9d7a3e', [M.METAL]: '#a4a9ac',
  [M.SCRAP]: '#b6a080', [M.SAND]: '#e2d28c', [M.BEDROCK]: '#4a5a50', [M.ICE]: '#bff2ff', [M.BRICK]: '#7a8a50',
  [M.VOLATILE]: '#f07ae0', [M.GATE]: '#b6bbbd', [M.WATER]: '#6fd0e0', [M.OIL]: '#a06ab0', [M.LAVA]: '#ff9a2e', [M.ACID]: '#c8ff5a',
}

export const chunks = (g, x, y, material, count) => {
  const colour = MATERIAL_COLOURS[material] ?? '#c9d4c0'
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 25 + Math.random() * 70
    g.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, life: 0.25 + Math.random() * 0.3, colour })
  }
}

export const dust = (g, x, y, count) => {
  for (let i = 0; i < count; i++) {
    g.particles.push({
      x, y: y - 1,
      vx: (Math.random() - 0.5) * 50,
      vy: -5 - Math.random() * 14,
      life: 0.18 + Math.random() * 0.14,
      colour: '#8c9884',
    })
  }
}
