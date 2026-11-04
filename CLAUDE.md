# Core (working name)

A side-view roguelike Metroidvania, inspired by Game Boy era visuals, with
emergent interactions between blocks, enemies, and skills. You work inward from
the edge of a square map to reach the core at its centre. A run can last up to
an hour or two.

A full run now works: eight rooms in a line from the edge to the core. Carl played
and liked the first room, and found it hard, which he's fine with. Everything added
after that hasn't been played by a person. The folder name is a placeholder: rename
it before the first release.

## Running and testing

Serve the folder with the no-cache server and open `http://localhost:8765`:

```bash
python3 ~/.claude/skills/browser-game/scripts/serve.py 8765 .
```

In the page, `window.game` drives it without playing: `game.sim(seconds, input)`
steps and draws, `game.tick(input)` steps without drawing (use this in long loops,
since drawing thousands of frames crashes the pane), `game.state` reads it, and
`game.restart()` starts a new run. Long scripted loops also need a time limit, or the
browser tool gives up. Testing writes to the saved best score, so clear it afterwards.

Regenerate the sprite atlases with
`uv run --with pillow --with numpy --with scipy python art/process_art.py`.

## Technology

Plain JavaScript modules with no build step, so a reload shows the latest code.
The game draws to a low-resolution 2D canvas, and a WebGL pass presents it, which
is where distance-from-core effects live. Tuning values live together in
`src/config.js`. Tiles, creatures and icons are generated sheets in `art/raw/`,
reduced to chunky atlases in `assets/`. The player and flames are bitmaps in code.

Mechanically it draws on the archived `magicschool` project, where everything
has properties and changing one can trigger rules that change others. That game
was turn-based and resolved cascades instantly. This one plays in real time, so
effects must spread across blocks visibly and be readable without text.

## Design decisions Carl has made

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
- Six skills (bolt, repel, ember, frost, hammer, gust), each with two upgrades.
  Three slots. Skills are only verbs on world rules, and no synergy is written anywhere.
- Materials: rock, moss, peat, wood, metal, scrap, sand, ash, water, oil, ice, smoke,
  steam, methane, and volatile crystal. New ones appear with depth.
- Foes: crawler, spitter, fish, bat, spore (leaves gas), slug (leaves oil), jelly
  (electrifies water), worm (digs), guardian (stomps loose the ceiling).
- Inhabitants who can be killed: hermit (upgrade), miner (new skill), mole (shop).
- Score with chains. Kills by the world score double and give triple experience.
- In the core room rock burns and conducts, and the core drifts toward you.
- Rooms generate on entry and lean toward your skills, easing off with depth.

Not built: rings, side routes, the 15×15 layout (rooms are a straight line along one
row), and any design pass on archetypes. In a physics search using movement alone, 60
of 61 generated rooms could be crossed, so rare rooms may need a skill or a restart.

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

- The name.
