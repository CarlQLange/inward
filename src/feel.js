import { MATERIAL_COLOURS, chipsAt, dustAt } from './fx.js'

export { fuseSpark, sip, splash } from './fx.js'

export const chunks = chipsAt
export const dust = dustAt
export const liquidColour = mat => MATERIAL_COLOURS[mat]?.[0] ?? '#6fd0e0'
