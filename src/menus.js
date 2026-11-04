import { TUNING } from './config.js'
import { hasRun, knownNotes, persist, save } from './store.js'
import { SKILL_DETAILS, SKILL_NAMES } from './skills.js'
import { continueRun, newRun, returnToTitle, saveAndQuit, startFromTitle } from './game.js'

const P = TUNING.player

export const openMenu = (g, menu) => g.menus.push({ selected: 0, armed: false, layout: 'list', back: true, ...menu })

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
const toggleShake = () => {
  save.settings.shake = !save.settings.shake
  persist()
}

const openOptions = g => openMenu(g, {
  page: 'options',
  title: 'OPTIONS',
  items: [
    { label: () => `SHADERS: ${save.settings.shaders.toUpperCase()}`, detail: 'HOW STRONGLY THE SCREEN WARPS NEAR THE CORE', run: cycleShaders },
    { label: () => `SCREEN SHAKE: ${save.settings.shake ? 'ON' : 'OFF'}`, run: toggleShake },
    {
      label: 'FORGET EVERYTHING',
      detail: 'CLEARS RECORDS AND FIELD NOTES. THIS CANNOT BE UNDONE.',
      run: gm => openMenu(gm, {
        page: 'confirm',
        title: 'FORGET EVERYTHING?',
        items: [
          { label: 'KEEP IT', run: closeMenu },
          {
            label: 'YES, FORGET',
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

export const openSkills = openPage('skills')
export const openRelics = openPage('relics')
export const openMap = g => openMenu(g, { page: 'map', title: 'MAP', items: [back] })
const openControls = openPage('controls')
const openRecords = openPage('records')
const openNotes = g => openMenu(g, { page: 'notes', title: 'FIELD NOTES', scroll: 0, items: [back] })

export const openTitle = g => openMenu(g, {
  page: 'title',
  back: false,
  items: [
    ...(hasRun() ? [{ label: 'CONTINUE', run: continueRun }] : []),
    { label: 'NEW RUN', run: startFromTitle },
    { label: 'FIELD NOTES', run: openNotes },
    { label: 'RECORDS', run: openRecords },
    { label: 'CONTROLS', run: openControls },
    { label: 'OPTIONS', run: openOptions },
  ],
})

export const openPause = g => openMenu(g, {
  page: 'pause',
  title: 'PAUSED',
  items: [
    { label: 'RESUME', run: closeMenu },
    { label: 'SKILLS', run: openSkills },
    { label: 'RELICS', run: openRelics },
    { label: 'MAP', run: openMap },
    { label: 'FIELD NOTES', run: openNotes },
    { label: 'CONTROLS', run: openControls },
    { label: 'OPTIONS', run: openOptions },
    { label: 'SAVE AND QUIT', run: saveAndQuit },
    {
      label: 'ABANDON RUN',
      run: gm => openMenu(gm, {
        page: 'confirm',
        title: 'ABANDON THIS RUN?',
        items: [
          { label: 'KEEP GOING', run: closeMenu },
          { label: 'NEW RUN', run: newRun },
          { label: 'BACK TO TITLE', run: returnToTitle },
        ],
      }),
    },
  ],
})

export const openSummary = g => openMenu(g, {
  page: 'summary',
  back: false,
  items: [
    { label: 'GO AGAIN', run: newRun },
    { label: 'BACK TO TITLE', run: returnToTitle },
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
    title: `LEARN ${SKILL_NAMES[kind]}?`,
    subtitle: SKILL_DETAILS[kind],
    items: [
      ...p.skills.map((skill, slot) => ({
        card: { icon: skill.kind, name: `DROP ${SKILL_NAMES[skill.kind]}`, text: 'IT STAYS HERE', sub: 'CVBN'[slot] },
        run: gm => {
          dropCard(gm, skill.kind)
          p.skills[slot] = { kind, ready: 0 }
          onTake(gm)
          closeAll(gm)
          gm.pulse = 1
        },
      })),
      {
        card: { name: 'NOT NOW', text: 'KEEP WHAT YOU HAVE', sub: '' },
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
    ? { name: 'NEW SKILL', text: 'SOMETHING UNKNOWN', sub: 'RANDOM', mystery: true }
    : { icon: option.skill, name: option.node.name, text: option.node.text, sub: SKILL_NAMES[option.skill] }

const pressedFrom = (g, input) => key => input[key] && !g.menuHeld[key]

export const stepMenus = (g, input) => {
  const menu = g.menus.at(-1)
  const pressed = pressedFrom(g, input)
  const confirm = pressed('jump') || pressed('shoot') || pressed('confirm')
  if (!menu.armed) {
    menu.armed = !input.jump && !input.shoot && !input.confirm
  } else {
    const [previous, next] = menu.layout === 'cards' ? ['left', 'right'] : ['up', 'down']
    const count = menu.items.length
    if (pressed(previous)) menu.selected = (menu.selected + count - 1) % count
    if (pressed(next)) menu.selected = (menu.selected + 1) % count
    if (menu.page === 'skills') {
      const slots = g.player.skills.length || 1
      if (pressed('up')) menu.slot = (menu.slot + slots - 1) % slots
      if (pressed('down')) menu.slot = (menu.slot + 1) % slots
    }
    if (menu.page === 'notes' || menu.page === 'relics') {
      if (pressed('up')) menu.scroll = Math.max(0, menu.scroll - 1)
      if (pressed('down')) menu.scroll += 1
    }
    if (confirm) menu.items[menu.selected].run(g)
    else if (pressed('pause') && menu.back) closeMenu(g)
  }
  g.menuHeld = { ...input }
}

export const slotsFull = p => p.skills.length >= P.skillSlots
