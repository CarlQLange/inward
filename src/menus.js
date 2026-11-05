import { TICK, TUNING } from './config.js'
import { hasRun, knownNotes, persist, save } from './store.js'
import { SKILL_NAMES } from './skills.js'
import { SKILL_ACTIONS, skillAction } from './controls.js'
import { continueRun, newRun, quickstart, returnToTitle, saveAndQuit, startFromTitle } from './game.js'

const P = TUNING.player

export const openMenu = (g, menu) => g.menus.push({ selected: 0, armed: false, layout: 'list', back: true, age: 0, opened: g.time, ...menu })

const settle = p => {
  p.wasJump = true
  p.wasBomb = true
  p.wasSkills = SKILL_ACTIONS.map(() => true)
}

export const closeMenu = g => {
  g.menus.pop()
  if (g.menus.length === 0) {
    settle(g.player)
    g.player.shotReady = Math.max(g.player.shotReady, 0.15)
  }
}

const closeAll = g => {
  g.menus.length = 0
  settle(g.player)
}

const back = { label: 'BACK', run: closeMenu }

const SHADER_LEVELS = ['full', 'soft', 'off']
const cycleShaders = () => {
  const at = SHADER_LEVELS.indexOf(save.settings.shaders)
  save.settings.shaders = SHADER_LEVELS[(at + 1) % SHADER_LEVELS.length]
  persist()
}
const toggleSetting = name => () => {
  save.settings[name] = !save.settings[name]
  persist()
}

const openOptions = g => openMenu(g, {
  page: 'options',
  title: 'OPTIONS',
  items: [
    { label: () => `SHADERS: ${save.settings.shaders.toUpperCase()}`, run: cycleShaders },
    { label: () => `SHAKE: ${save.settings.shake ? 'ON' : 'OFF'}`, run: toggleSetting('shake') },
    { label: () => `RUMBLE: ${save.settings.rumble ? 'ON' : 'OFF'}`, run: toggleSetting('rumble') },
    { label: 'CONTROLS', run: g2 => openControls(g2) },
    { label: 'RECORDS', run: g2 => openRecords(g2) },
    {
      label: 'FORGET ALL',
      run: gm => openMenu(gm, {
        page: 'confirm',
        items: [
          { label: 'KEEP', run: closeMenu },
          {
            label: 'FORGET',
            run: gc => {
              Object.assign(save, { best: 0, bestChain: 0, runs: 0, coresReached: 0, deepest: 0, worldKills: 0 })
              knownNotes.clear()
              persist()
              closeMenu(gc)
            },
          },
        ],
      }),
    },
    back,
  ],
})

const openPage = page => g => openMenu(g, { page, title: page.toUpperCase().replace('-', ' '), scroll: 0, slot: 0, items: [back] })

const openControls = openPage('controls')
const openRecords = openPage('records')
const openQuickstart = g => openMenu(g, {
  page: 'quickstart',
  items: Array.from({ length: 8 }, (_, ring) => ({ run: quickstart(ring) })),
})

const openNotes = g => openMenu(g, { page: 'notes', title: 'ALMANAC', scroll: 0, items: [back] })

export const openTitle = g => openMenu(g, {
  page: 'title',
  back: false,
  items: [
    ...(hasRun() ? [{ label: 'CONTINUE', run: continueRun }] : []),
    { label: 'NEW RUN', run: startFromTitle },
    { label: 'QUICKSTART', run: openQuickstart },
    { label: 'ALMANAC', run: openNotes },
    { label: 'OPTIONS', run: openOptions },
  ],
})

export const openPause = g => openMenu(g, {
  page: 'pause',
  focus: 'list',
  slot: 0,
  relic: 0,
  items: [
    { label: 'RESUME', run: closeMenu },
    { label: 'ALMANAC', run: openNotes },
    { label: 'OPTIONS', run: openOptions },
    { label: 'QUIT', run: saveAndQuit },
    {
      label: 'ABANDON',
      run: gm => openMenu(gm, {
        page: 'confirm',
        items: [
          { label: 'KEEP GOING', run: closeMenu },
          { label: 'NEW RUN', run: newRun },
          { label: 'TITLE', run: returnToTitle },
        ],
      }),
    },
  ],
})

export const openSkills = openPause
export const openMap = openPause

export const openSummary = g => openMenu(g, {
  page: 'summary',
  back: false,
  items: [
    { label: 'AGAIN', run: newRun },
    { label: 'TITLE', run: returnToTitle },
  ],
})

export const dropCard = (g, kind) => {
  const p = g.player
  g.cards.push({ kind, x: p.x - 3, y: p.y - 2, w: 12, h: 12, declined: true })
}

export const openSwap = (g, kind, onTake = () => {}, onLeave = () => {}) => {
  const p = g.player
  openMenu(g, {
    page: 'swap',
    layout: 'cards',
    back: false,
    cancel: true,
    title: SKILL_NAMES[kind],
    items: [
      ...p.skills.map((skill, slot) => ({
        card: { icon: skill.kind, name: SKILL_NAMES[skill.kind], text: 'DROP', prompt: skillAction(slot) },
        run: gm => {
          dropCard(gm, skill.kind)
          p.skills[slot] = { kind, ready: 0 }
          onTake(gm)
          closeAll(gm)
          gm.pulse = 1
        },
      })),
      {
        card: { name: 'NO', text: 'LEAVE IT', sub: '' },
        run: gm => {
          onLeave(gm)
          closeAll(gm)
        },
      },
    ],
  })
}

export const cardFor = option =>
  option.type === 'new'
    ? { name: 'NEW', text: '', mystery: true }
    : { icon: option.skill, name: option.node.name, text: option.node.text, parent: null }

const pressedFrom = (g, input) => key => input[key] && !g.menuHeld[key]

const cycle = (value, by, count) => (value + by + count) % count

const stepPauseFocus = (g, menu, moved) => {
  const p = g.player
  if (menu.focus === 'list') {
    if (moved.left && p.skills.length > 0) menu.focus = 'skills'
    if (moved.right && p.relics.size > 0) menu.focus = 'relics'
    return false
  }
  if (menu.focus === 'skills') {
    if (moved.right) menu.focus = 'list'
    if (moved.up) menu.slot = cycle(menu.slot, -1, p.skills.length)
    if (moved.down) menu.slot = cycle(menu.slot, 1, p.skills.length)
    return true
  }
  const count = p.relics.size
  if (moved.left && menu.relic % 5 === 0) menu.focus = 'list'
  else if (moved.left) menu.relic -= 1
  if (moved.right) menu.relic = Math.min(count - 1, menu.relic + 1)
  if (moved.up) menu.relic = Math.max(0, menu.relic - 5)
  if (moved.down) menu.relic = Math.min(count - 1, menu.relic + 5)
  return true
}

const stepTitlePress = (menu, confirm) => {
  if (menu.page !== 'title' || menu.pressed) return false
  if (confirm) menu.pressed = true
  return true
}

const DIRECTIONS = ['up', 'down', 'left', 'right']

const stepRepeats = (g, input, armed) => {
  const I = TUNING.input
  const due = g.menuRepeat
  const fired = {}
  for (const dir of DIRECTIONS) {
    if (!input[dir]) delete due[dir]
    else if (!armed) due[dir] = Infinity
    else if (due[dir] === undefined || g.time >= due[dir]) {
      fired[dir] = true
      due[dir] = g.time + (due[dir] === undefined ? I.repeatFirst : I.repeatEvery)
    }
  }
  return fired
}

const hitUnder = (menu, { x, y }) =>
  (menu.hits ?? []).find(h => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h)?.index

const stepPointer = (g, menu, input, pressed) => {
  if (!input.pointer) return false
  const over = hitUnder(menu, input.pointer)
  if (over === undefined) return false
  if (input.pointer !== g.menuHeld.pointer) menu.selected = over
  return pressed('click') && menu.selected === over
}

const leave = (g, menu) => {
  if (menu.cancel) menu.items.at(-1).run(g)
  else if (menu.back) closeMenu(g)
}

const settled = (g, menu, input) => {
  const waited = menu.layout !== 'cards' || g.time - menu.opened > TUNING.input.cardDelay
  return waited && !input.jump && !input.click && !input.confirm
}

export const stepMenus = (g, input) => {
  const menu = g.menus.at(-1)
  menu.age += TICK
  const pressed = pressedFrom(g, input)
  const moved = stepRepeats(g, input, menu.armed)
  if (!menu.armed) {
    menu.armed = settled(g, menu, input)
  } else if (!stepTitlePress(menu, pressed('jump') || pressed('confirm') || pressed('click'))) {
    const swallowed = menu.page === 'pause' && stepPauseFocus(g, menu, moved)
    const [previous, next] = menu.layout === 'cards' ? ['left', 'right'] : ['up', 'down']
    const count = menu.items.length
    if (!swallowed) {
      if (moved[previous]) menu.selected = cycle(menu.selected, -1, count)
      if (moved[next]) menu.selected = cycle(menu.selected, 1, count)
    }
    if (menu.page === 'notes') {
      if (moved.up) menu.scroll = Math.max(0, menu.scroll - 1)
      if (moved.down) menu.scroll += 1
    }
    const clicked = stepPointer(g, menu, input, pressed)
    const confirm = pressed('jump') || pressed('confirm') || clicked
    const toggled = menu.page === 'pause' && (pressed('skills') || pressed('map'))
    if (confirm && !swallowed) menu.items[menu.selected].run(g)
    else if (pressed('back') || pressed('pause') || toggled) leave(g, menu)
  }
  g.menuHeld = { ...input }
  if (g.menus.length === 0 && input.click) g.player.holdFire = true
}

export const slotsFull = p => p.skills.length >= P.skillSlots
