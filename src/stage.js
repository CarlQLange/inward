import { VIEW } from './config.js'
import { stagedMoment } from './moment.js'
import { createPit, pitView, tileTransform } from './pit.js'
import { setStage } from './present.js'

const pits = new WeakMap()

const pitFor = gl => {
  if (pits.has(gl)) return pits.get(gl)
  const depth = gl.createRenderbuffer()
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, VIEW.w, VIEW.h)
  const made = { pit: createPit(gl), depth, moment: null }
  pits.set(gl, made)
  return made
}

const withDepth = (gl, depth, draw) => {
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth)
  draw()
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null)
}

setStage((api, state) => {
  const moment = stagedMoment(state)
  if (!moment) {
    api.drawFrame()
    return
  }
  const shot = pitView(moment.t, moment.plan, moment.tile)
  if (shot.away <= 0) {
    api.drawFrame()
    return
  }
  const { gl } = api
  const held = pitFor(gl)
  if (held.moment !== moment) {
    held.pit.refresh(state)
    held.moment = moment
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, api.target.fbo)
  gl.viewport(0, 0, api.target.w, api.target.h)
  withDepth(gl, held.depth, () => held.pit.draw(shot.view, { time: moment.t, seals: state.seals, sweep: shot.sweep }))
  if (shot.liveAmount > 0) api.drawRoom(tileTransform(shot.view, moment.tile), { opacity: shot.liveAmount })
})
