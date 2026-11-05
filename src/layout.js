import { HUD_ANCHORS, ORIGIN, VIEW } from './config.js'

export const LAYOUT = { mode: 'desk', pixel: 1, dpr: 1, inset: { left: 0, right: 0, top: 0, bottom: 0 } }

const ROOM_PX = 224
const TALL_WIDTH = 228
const WIDE_HEIGHT = 230
const WIDE_WIDTH = 400
const TOP_STRIP = 20

export const isTouchLayout = () => LAYOUT.mode !== 'desk'
export const isTall = () => LAYOUT.mode === 'tall'
export const wantsTouch = () =>
  new URLSearchParams(location.search).has('touch') || Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches)

const safeInsets = () => {
  const probe = document.getElementById('insets')
  if (!probe) return { left: 0, right: 0, top: 0, bottom: 0 }
  const style = getComputedStyle(probe)
  const read = side => parseFloat(style[`padding${side}`]) || 0
  return { left: read('Left'), right: read('Right'), top: read('Top'), bottom: read('Bottom') }
}

const scaled = ({ left, right, top, bottom }, css) => ({
  left: Math.ceil(left * css), right: Math.ceil(right * css), top: Math.ceil(top * css), bottom: Math.ceil(bottom * css),
})

export const fitTouch = () => {
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const deviceW = Math.floor(window.innerWidth * dpr)
  const deviceH = Math.floor(window.innerHeight * dpr)
  const raw = safeInsets()
  const tall = deviceH > deviceW
  const pixel = tall
    ? Math.max(1, Math.floor(deviceW / TALL_WIDTH))
    : Math.max(1, Math.min(Math.floor((deviceH - raw.top * dpr - raw.bottom * dpr) / WIDE_HEIGHT), Math.floor(deviceW / WIDE_WIDTH)))
  const inset = scaled(raw, dpr / pixel)
  Object.assign(VIEW, { w: Math.floor(deviceW / pixel), h: Math.floor(deviceH / pixel) })
  Object.assign(ORIGIN, tall
    ? { x: Math.floor((VIEW.w - ROOM_PX) / 2), y: TOP_STRIP + inset.top }
    : { x: Math.floor((VIEW.w - ROOM_PX) / 2), y: Math.max(inset.top, Math.floor((VIEW.h - ROOM_PX) / 2)) })
  Object.assign(LAYOUT, { mode: tall ? 'tall' : 'wide', pixel, dpr, inset })
  Object.assign(HUD_ANCHORS.xp, tall ? { x: VIEW.w - 40, y: 14 } : { x: inset.left + 40, y: 42 })
  Object.assign(HUD_ANCHORS.coin, tall ? { x: 76, y: 6 } : { x: inset.left + 10, y: 16 })
}

export const almanacColumns = () => Math.min(19, Math.floor((VIEW.w - 8) / 21))
