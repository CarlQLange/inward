# Inward (the folder is still called core)

A side-view roguelike Metroidvania, inspired by Game Boy era visuals, with
emergent interactions between blocks, enemies, and skills. You work inward from
the edge of a square map to reach the core at its centre. A run can last up to
an hour or two.

A full run works on a 15×15 map of rings around the core. The name on the title screen,
Inward, is an agent's suggestion that Carl hasn't confirmed. Rename the folder before the
first release if it stays.

## Running and testing

Serve the folder with the no-cache server and open `http://localhost:8765`:

```bash
python3 ~/.claude/skills/browser-game/scripts/serve.py 8765 .
```

In the page, `window.game` drives it without playing: `game.sim(seconds, input)`
steps and draws, `game.tick(input)` steps without drawing (use this in long loops,
since drawing thousands of frames crashes the pane), `game.state` reads it, and
`game.restart()` starts a new run. Long scripted loops also need a time limit, or the
browser tool gives up. Testing writes to the save, including records, field notes and
options, so snapshot localStorage in sessionStorage first and restore it afterwards. A
random soak can reach the option that forgets everything. Screenshots can lag, so wait
half a second first. The page opens on the title screen, and `game.restart()` skips it.

`node scripts/footing.mjs` reports how often creatures stand over empty air. `node scripts/soak.mjs` plays many headless runs with a bot and reports errors, softlocks,
rooms and time per run, deaths per ring, kills by source, secrets met and tick cost. Its header
lists the flags, such as `--god`, `--found rand`, `--career` and `--warden bellows --gun`. The bot
walks badly, so read its time-per-run numbers as an upper bound and its deaths as pessimistic.

`node scripts/bundle.mjs` packs everything into `dist/inward.html`, the one page published as the artifact
at https://claude.ai/artifact/6mA22hzMWHpUoG5f7wEdBS. Republish that file to update it. Add `?touch` to the
local URL to get the phone layout on a desktop browser.

Regenerate the sprite atlases with
`uv run --with pillow --with numpy --with scipy python art/process_art.py`.

## Technology

Plain JavaScript modules with no build step, so a reload shows the latest code.
The game draws to a low-resolution 2D canvas, and a WebGL pass presents it, which
is where distance-from-core effects live. Tuning values live together in
`src/config.js`. Tiles, creatures and icons are generated sheets in `art/raw/`,
reduced to chunky atlases in `assets/`. Flames are bitmaps in code, and the player
is drawn procedurally each frame. Creatures are named clips listed in `art/anim.py`;
`creatures.js` picks a clip from the creature's state. If a body size changes, copy
`art/proof/body-sizes.json` into the table in `cast.js`, which drives shot boxes.

Presentation is separate from the simulation. `hero.js` animates and draws the player,
`fx.js` holds particles, shake, slow motion, door slides and the moments, `creatures.js`
draws foes and their squash, `scene.js` draws the room and its materials, `light.js`
builds a small light map, and `present.js` runs the WebGL passes. The scene pass runs at
game resolution, which keeps it cheap and keeps every distortion in chunky pixels. These
modules hold anything that shouldn't be saved in WeakMaps or in fields left out of the save.
The scarf reds are exact key colours that the shader lets through untouched.

Mechanically it draws on the archived `magicschool` project, where everything
has properties and changing one can trigger rules that change others. That game
was turn-based and resolved cascades instantly. This one plays in real time, so
effects must spread across blocks visibly and be readable without text.

## Design decisions Carl has made

**What the game is now** (his brief for finishing it)

- Every run should feel similar but completely different, and each should bring one or two
  discoveries, never more. Every inhabitant, enemies included, has a distinct silhouette.
- Very few words on screen. A finished game, not a demo, with lots of depth from a simple core
  loop. Removing what doesn't work is part of polishing.
- Controller support. Full animations for most creatures rather than two or three frames.
- Legibility matters, but so does punch. After his first phone run he found deep rooms hard to read. A
  heavy cleanup then went "a notch too far", so effects sit between the two: mild fringing at the room's
  edges, moderate shake and glow, lightly muted scenery, the chain counter outside the room, and a foe limit
  per ring. The strongest depth shader lives in the black margins around the room, away from play.
- He wants to play on his phone, from an artifact. Touch devices get their own layout, portrait with
  controls under the room or landscape with controls beside it, and the canvas fills the screen at a
  whole number of device pixels. Foes in reach are shot automatically, which can be turned off.
- Upgrades must evolve a skill into something that plays differently. He rejected "further",
  "wider" and "the same but slightly better" outright.
- Creatures must look like they're standing on the blocks they're on, with no legs floating over
  ledges and bounding boxes that fit the creature. `scripts/footing.mjs` measures this. Hitboxes
  match the body and feet, and a smaller contact box keeps touching them forgiving.

**The reveal**

- At first it seems like a regular Metroidvania, very like Metroid on the Game
  Boy. Then you notice things: a fire-shooting enemy sets the terrain alight,
  there's smoke, and the terrain starts to be destroyed.
- That belief lasts a few minutes at most, until you pick up your first skill
  card.
- Part of the secret is how much emergence there actually is. The closer you
  get to the core, the more there is, so discovery continues across runs.

**Skills and upgrades**

- A skill card lets you do a fundamental interaction, such as repelling
  magnetically, and has its own tree.
- Upgrades come from experience, inhabitants, and special rooms. Each one offers
  a choice between a random new skill and an upgrade from the tree of a skill
  you already have.
- Whether something like fire is a threat or a toy depends on your build.

**The map**

- The map is square and the core is in the centre. You work inward from any
  edge, so you may approach from below or from the side.
- Each room is roughly independent. Water and smoke stay in the room they're in.
- Rooms lean toward your build for some number of rooms, and ease off closer to
  the centre.
- You may need to backtrack or take side routes because nothing you have gets
  you through some rooms. This happens much more towards the centre.

**The world**

- Everything is built from blocks with their own properties, which various
  things can interact with.
- Procedurally generated, with inhabitants, a shop, and an inventory.
- It may start from a few archetypes such as mage, fighter, and miner. It's
  unresolved whether you choose one on the first screen, since that would
  undercut seeming like a regular Metroidvania.
- No sound.
- Numbers in Carl's original note, such as room and maze sizes, were only there
  to convey the concept. He likes around 15×15 rooms for the map.
- A run shouldn't truly dead-end much, if at all.
- It should be slightly easier to get started. So far: six hearts, longer
  invulnerability, a faster first level, a calmer first two rooms, slower and wilder
  spitters at the outskirts, and fire only hurts what it touches or stands on.

**The look**

- Game Boy inspired, for large screens, so not limited to Game Boy resolution.
  Metroid on the Game Boy and Star of Providence are references for the vibe.
- The picked direction is the "charge room" in `art/concepts/`.
- Side-on, with a square room centred on a black widescreen frame and the whole
  room on screen.
- Low detail: chunky square pixels and flat colour, with no gradients or
  lighting.
- Near-black background, moss green rock, grey metal, dark teal water, a white
  player, and one bright accent (yellow electricity) that makes an interaction
  easy to follow.
- A bright green framed HUD. The HUD in the framed image is a rough placeholder.
- More Game Boy at the outskirts, and more cool shaders as you get further in.
  Certain skills can also bring shaders in.

## What's built, and not yet reviewed by Carl

He asked to be surprised, so these were agent choices. Treat them as open to change.

- The world is four-shade green until the first card, then colour floods in.
- 26 skills in three slots: movement (blink, grapple, dash, rewind), terrain (mason, seed,
  spring, acid, melt, alchemy), control (well, swap, stop, charm, decoy, roar, mirror) and
  helpers (drone, rod, mine). Skills are verbs on world rules, and no synergy is written
  anywhere.
- Each skill evolves through two forks of two exclusive forms, so two picks and four possible
  ends. Carl rejected "the same but slightly better": a form must change what the skill does,
  never only how much. Taking a form renames the skill and changes how it looks in play.
- Eight random starter rooms, each teaching its own first skill, and a quickstart for any
  ring with a matching random loadout. Quickstarts don't count towards records.
- Each room has one of eight layouts, such as tunnels, chasm or chimney, and regions have
  their own tinted tiles and backdrop.
- Keyboard, mouse and controller all work at once, with no option to pick between them, and
  every key means one thing always. Arrows with Z, X, C V B, or WASD with Space, mouse, Q E R.
  Whichever device was touched last drives the on-screen glyphs and the aim. Controller: A
  jump, RT or X shoot, B Y RB skills, LB bomb, LT look, Start, Select map, right stick free
  aim. Carl called the earlier keys a nightmare. None of this has been tried on a real pad.
- Eight hearts, and each hit costs one. The hero's red scarf is health and hits tear it. A hit shows a
  cause pictogram. Holding Shift or LT shows what hurts, burns, conducts or explodes, without labels.
- Foes warn before attacking. Clearing a room heals one heart.
- 27 relics, from chests, altars, mimics and the shop. They change rules rather than numbers:
  your gun, your movement, what can hurt you, and what pays (fire immunity makes fire a toy,
  the odd gem only rewards world kills, gas lifts you).
- Eight region themes change materials, tiles and foes. Room events: arena, flood,
  gasworks, collapse, vault, nest, altar and chests. Elite foes can burn, shock or be armoured.
- Materials: rock, moss, peat, wood, metal, scrap, sand, ash, water, oil, ice, lava, acid,
  vine, brick, smoke, steam, methane, and volatile crystal.
- Foes: crawler, spitter, fish, bat, spore (leaves gas), slug (leaves oil), jelly
  (electrifies water), worm (digs), turret, bomber, imp
  (freezes water), ember bat (lights things), slime (leaves acid), shield crab, nest, mimic,
  gasbag. Foes can be charmed and then fight each other.
- Inhabitants who can be killed: hermit (upgrade), miner (new skill), mole (shop).
- Score with chains. Kills by the world score double and give triple experience.
- In the core room rock burns and conducts, and the core drifts toward you.
- Rooms generate on entry, check they can be crossed, and lean toward your skills, easing
  off with depth.
- A title room spelled out in conducting metal, one pause screen combining map, skills and
  relics, and an Almanac grid of everything, with unfound things shown as silhouettes.
- With full slots, a new skill opens a replacement choice. The dropped skill stays in
  the room as a card and keeps its upgrades, so you can swap back.
- First-room safety net: if the peat wall still stands with no fire and no spitter
  left, another spitter drops in.

- The map: rings are loops, one edge of each inner ring is broken so some routes dead-end,
  and gates lead inward. Outer gates are often open, inner ones nearly always locked, by
  peat, metal gate, brickwork, ice or scrap. Outer locks lean toward your skills. Each ring
  always has one gate that's open or peat with a spitter beside it.
- Bombs open any lock. You start with one, and they drop and are sold.
- Runs save at every door and on pausing, with Continue on the title. Death clears it.
- Lava, water that gives off gas when charged, steam that rains back down, moss that
  creeps along wet rock. Foes gain health with each ring.

- Each run shuffles regions into bands (rings 0-1, 2-3, 4-5, 6), with the outer band set by the starter
  room. Three Wardens at rings 1, 3 and 5 break seals that open the Core, a three-phase final boss. One
  omen per run once found. Everything nameable is gated by a persistent found set, with one or two secrets
  planted per run and a brief reveal when met. Hanging lamps give the gun a way to set things off.

- Winning makes the room crumble and drains the colour back to four-shade green. If nothing can
  reach an exit, a bomb drops, and if that can't help a vine and a path get carved.

Not built: a design pass on archetypes. Balance has only been tested by a bot that doesn't dodge,
and no person has played a full run. The starting room is always on the top edge.

## Ideas Carl is happy with so far

These came from design discussion and haven't been tested.

- The world stays quiet by default. Nothing changes until something disturbs it,
  and changes move block by block at a slowish pace, so rooms look authored.
- Discovery goes from noticing an effect, to being hurt by it, to using it.
- Enemies obey the same rules as the player.
- Protected main routes, with material rules applying everywhere else. Near the
  core, even those protected routes may start to break down.
- Rooms remember what happened to them when you come back.
- Cards grant verbs and the world's rules produce the synergies, so tree nodes
  mostly change what a verb touches or connect it to another system, rather than
  increasing numbers.
- The first card's room is built around that card, so trying it does something
  large straight away.
- Rings work as loops. Each ring has several ways in made of different
  materials, and your build decides which you can use. Inner rings are small, so
  side routes near the centre tend to lead back outward.
- The core makes matter more excitable with proximity, so the same materials
  behave more dramatically closer in.
- Ways of getting unstuck: shop consumables, luring enemies, paying inhabitants,
  and upgrades that lean toward what's blocking you.

## Open questions

- The name. Inward is on the title screen, unconfirmed.
