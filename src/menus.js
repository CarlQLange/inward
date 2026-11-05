import { TICK, TUNING } from './config.js'
import { hasRun, knownNotes, persist, save } from './store.js'
import { SKILL_NAMES } from './skills.js'
import { skillKey } from './controls.js'
import { continueRun, newRun, quickstart, returnToTitle, saveAndQuit, startFromTitle } from './game.js'

const P = TUNING.player

export const openMenu = (g, menu) => g.menus.push({ selected: 0, armed: false, layout: 'list', back: true, age: 0, ...menu })

export const closeMenu = g => {
  g.menus.pop()
  if (g.menus.length === 0) {
    g.player.wasJump = true
    g.player.shotReady = Math.max(g.player.shotReady, 0.15)
  }
}

const closeAll = g => {
  g.menus.length = 0
  g.player.wasJump = true
}

const back = { label: 'BACK', run: closeMenu }

const SHADER_LEVELS = ['full', 'soft', 'off']
const cycleShaders = () => {
  const at = SHADER_LEVELS.indexOf(save.settings.shaders)
  save.settings.shaders = SHADER_LEVELS[(at + 1) % SHADER_LEVELS.length]
  persist()
}
const toggleControls = () => {
  save.settings.controls = save.settings.controls === 'mouse' ? 'keys' : 'mouse'
  persist()
}
const toggleShake = () => {
  save.settings.shake = !save.settings.shake
  persist()
}

const openOptions = g => openMenu(g, {
  page: 'options',
  title: 'OPTIONS',
  items: [
    { label: () => `AIM: ${save.settings.controls === 'mouse' ? 'MOUSE' : 'KEYS'}`, run: toggleControls },
    { label: () => `SHADERS: ${save.settings.shaders.toUpperCase()}`, run: cycleShaders },
    { label: () => `SHAKE: ${save.settings.shake ? 'ON' : 'OFF'}`, run: toggleShake },
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
    title: SKILL_NAMES[kind],
    items: [
      ...p.skills.map((skill, slot) => ({
        card: { icon: skill.kind, name: SKILL_NAMES[skill.kind], text: 'DROP', sub: skillKey(slot) },
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

const stepPauseFocus = (g, menu, pressed) => {
  const p = g.player
  if (menu.focus === 'list') {
    if (pressed('left') && p.skills.length > 0) menu.focus = 'skills'
    if (pressed('right') && p.relics.size > 0) menu.focus = 'relics'
    return false
  }
  if (menu.focus === 'skills') {
    if (pressed('right')) menu.focus = 'list'
    if (pressed('up')) menu.slot = cycle(menu.slot, -1, p.skills.length)
    if (pressed('down')) menu.slot = cycle(menu.slot, 1, p.skills.length)
    return true
  }
  const count = p.relics.size
  if (pressed('left') && menu.relic % 5 === 0) menu.focus = 'list'
  else if (pressed('left')) menu.relic -= 1
  if (pressed('right')) menu.relic = Math.min(count - 1, menu.relic + 1)
  if (pressed('up')) menu.relic = Math.max(0, menu.relic - 5)
  if (pressed('down')) menu.relic = Math.min(count - 1, menu.relic + 5)
  return true
}

const stepTitlePress = (menu, confirm) => {
  if (menu.page !== 'title' || menu.pressed) return false
  if (confirm) menu.pressed = true
  return true
}

export const stepMenus = (g, input) => {
  const menu = g.menus.at(-1)
  menu.age += TICK
  const pressed = pressedFrom(g, input)
  const confirm = pressed('jump') || pressed('shoot') || pressed('confirm')
  if (!menu.armed) {
    menu.armed = !input.jump && !input.shoot && !input.confirm
  } else if (!stepTitlePress(menu, confirm)) {
    const swallowed = menu.page === 'pause' && stepPauseFocus(g, menu, pressed)
    const [previous, next] = menu.layout === 'cards' ? ['left', 'right'] : ['up', 'down']
    const count = menu.items.length
    if (!swallowed) {
      if (pressed(previous)) menu.selected = cycle(menu.selected, -1, count)
      if (pressed(next)) menu.selected = cycle(menu.selected, 1, count)
    }
    if (menu.page === 'notes') {
      if (pressed('up')) menu.scroll = Math.max(0, menu.scroll - 1)
      if (pressed('down')) menu.scroll += 1
    }
    if (confirm && !swallowed) menu.items[menu.selected].run(g)
    else if (menu.back && (pressed('pause') || pressed('back'))) closeMenu(g)
  }
  g.menuHeld = { ...input }
}

export const slotsFull = p => p.skills.length >= P.skillSlots
