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
browser tool gives up. Testing writes to the save, including best scores, field notes and
options, so snapshot localStorage in sessionStorage first and restore it afterwards. A
random soak can reach the option that forgets everything. Screenshots can lag, so wait
half a second first. The page opens on the title screen, and `game.restart()` skips it.

`node scripts/chains.mjs` reports, per region, how often fire, charge, falling matter and acid are active, what's hung in the rooms and what kills foes, and on a second line how often each newer world rule fires per minute and the sand, mud, snow and glass a room starts with. `node scripts/footing.mjs` reports how often creatures stand over empty air. `node scripts/lives.mjs` plays rooms per region, half with the hero standing by the door, and reports how foes spend their time, who kills them, what they do to the world and how often they hit the hero. `node scripts/soak.mjs` plays many headless runs with a bot and reports errors, softlocks,
rooms and time per run, deaths per ring, kills by source, secrets met and tick cost. Its header
lists the flags, such as `--god`, `--found rand`, `--career`, `--warden bellows --gun` and, to reach and pass the
Core, `--god --express --deeper --loops 2`. The bot walks badly, so read its time-per-run numbers as an upper bound
and its deaths as pessimistic. Its own count of rooms with no reachable exit includes moments the bot is mid-jump;
`--mercy` stops the bot teleporting out, so the game's rescue has to free it, and reports how long that took.
`node scripts/builds.mjs` forces a loadout and a region and reports kills per minute, time to clear, hearts
lost, casts and time fed, for single skills, named pairs (`--pairs ember+gust`), every pair or finished forms.
Its bot never dodges or sets up a combo on purpose, so its numbers are comparative.

`node scripts/bundle.mjs` packs everything into `dist/inward.html`, the one page published as the artifact
at https://claude.ai/artifact/6mA22hzMWHpUoG5f7wEdBS. Republish that file to update it. Add `?touch` to the
local URL to get the phone layout on a desktop browser.

Regenerate the sprite atlases with
`uv run --with pillow --with numpy --with scipy python art/process_art.py`.

## Technology

Plain JavaScript modules with no build step, so a reload shows the latest code.
Actors, HUD and menus draw to a low-resolution 2D canvas with a transparent background.
The world behind them is drawn in WebGL, which is where distance-from-core effects live. Tuning values live together in
`src/config.js`. Tiles, creatures and icons are generated sheets in `art/raw/`,
reduced to chunky atlases in `assets/`. Flames are bitmaps in code, and the player
is drawn procedurally each frame. Creatures are named clips listed in `art/anim.py`;
`creatures.js` picks a clip from the creature's state. If a body size changes, copy
`art/proof/body-sizes.json` into the table in `cast.js`, which drives shot boxes.

Presentation is separate from the simulation. `hero.js` animates and draws the player,
`fx.js` holds shake, slow motion, door slides and the moments, `particles.js` is the pooled particle kinds and their era ladder, `matter.js` says what each material, foe and death does and watches the world for changes, `marks.js` holds stains and piles, `projectiles.js` draws shots, fireballs and bolts, `creatures.js`
draws foes and their squash, `scene.js` paints the terrain layer and draws everything that
lives on the actor layer, `backdrop.js` holds the silhouette masks and each region's air
colours, `cells.js` turns the world into small textures, `light.js` builds an occluded light
map, and `present.js` runs the passes in `shaders.js`. These modules hold anything that
shouldn't be saved in WeakMaps or in fields left out of the save. The scarf reds are exact key
colours that the shader lets through untouched.

The picture is built in layers, all at game resolution so distortion stays in chunky pixels:

- The world pass draws terrain fronts, side faces traced back from the play plane through the
  cell texture, the far wall with its silhouettes and pockets, all lit from the light map.
- The optics pass adds what moves over the world: liquids, haze, fog, shafts and gas.
- The frame pass places that room in the view with door slides, shake and warps, bleeds its edges
  into the pit in the margins, then composites the actor canvas on top. Nothing but zoom and the
  colour grade touches actors, which is what lets the world go wild.

`era.js` is the look of the game: a table with one column per ring and one row per technique,
cross-fading as depth changes. To change how a ring looks, start there. Terrain only uploads
when its painted cells change, and the light map is only built from ring 3 inward.

For moments that take over the picture, `setStage(fn)` in `present.js` replaces the frame pass,
and `fn` gets the WebGL context, `drawFrame()` for the normal picture and `drawRoom(mat4, options)`
to put the finished room on any quad. `g.depthDrive` overrides how much of the ring's depth shows
(0 is flat, 1 full, unset means on once a seal has broken) and `g.vanish` overrides the point depth
recedes to, in room pixels. Both can change every frame. `stage.js` uses this for the moment a seal breaks,
when `pit.js` shows the map as a pit and `moment.js` holds the game while it plays.

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
- He found the world mostly read as fire and left the fix to agent judgement. Fire now belongs to the Moss Caves
  and Peat Bog, and every other region has its own system: charge, collapse, lava and water, falling ice, or blasts.
  Peat ceilings and lamps are per region, and each region hangs props the gun can set off, so no skill is needed.
- He wants the jump from retro to modern to be the thrill, with a wow moment as big as Fez's first rotation
  (the surprise, not 3D as such) and Animal Well's visual confidence. Less visual interest outside, more going in, and a combo should be able to break the game a little
  without one pair of skills solving it. He's the customer now and doesn't want to be asked. `docs/direction.md`
  holds what this means.
- After playing the release pass he called the look and feel great and asked for more skills and more emergence,
  with slightly slower play to balance having more things happen at once. He left how to the game director.
  He then asked for an elegance pass that takes things out, again left to the director's judgement.
- Rooms that shut you in must be obvious, arena rooms especially, and breaking a seal with a skill must let you out.
  Sealed doorways show red bars and each foe left carries a red marker, both in the scarf's exact reds so they survive
  the four-shade look. Break or blink through an arena's seal and you can leave, giving up its chest; it seals again
  if you come back while foes are left. Warden and Core seals are bedrock, so nothing breaks them.
- He still sees "the same interactions" after the glass, mud and snow rules, and says emergence isn't just chaining
  rules. What's wanted is situations nobody wrote: creatures with their own drives meeting each other and the world,
  and hidden things to find. He liked the idea of the far wall of a room becoming something you can act on once rooms
  have depth.
- He hates the gun knocking the hero back: it makes the game very hard to play on a phone. Firing never moves the
  hero, the Scatter Gun included. The small screen jolt on each shot stays.
- On-screen text says literally what happens, in plain flat words: name the concrete thing and state the cost
  directly. No riddles, mood lines or objects with agency. Use the same word for the same thing everywhere.
  Write it the way a human game designer would. Short fragments with the subject left out, as in a
  bestiary: "SLEEPS ON CEILINGS. WAKES AT GUNFIRE", not "NOISE WAKES IT". Constructions that hang on
  "IT" read as machine-written. Name triggers the player can see, never hidden states like cold or fear.
- Upgrades must evolve a skill into something that plays differently. He rejected "further",
  "wider" and "the same but slightly better" outright.
- Levelling up and finding new skills was far too quick. He wants at least three times as long between each.
  A level costs 18 experience per level reached, so a run gets a third as many level-ups at every point, and
  skill cards, miners and hermits turn up a third as often. A level-up heals six hearts, keeping healing per room
  where it was.
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
- 31 skills in three slots (a keystone adds a fourth): elements (bolt, repel, ember, frost, hammer, gust),
  movement (blink, grapple, dash, rewind, float, burrow), terrain (mason, seed, spring, acid, melt, alchemy,
  flask, wick, clay, lens), control (well, swap, stop, charm, roar, link, chime) and helpers (drone, mine).
  Skills are verbs on world rules, and no synergy is written anywhere. Several old skills reach the newer
  rules through a form: Frost SNOWFALL makes snow, Hammer TAMP packs sand, snow and mud
  solid, Seed ROOTS turns sand and ash to moss, Repel CURRENT and Bolt FENCE charge metal into magnets, Drone
  GULL drops loose blocks, Acid SOUR turns water to acid and Alchemy CASCADE keeps stepping liquids to rock.
  Chime owns breaking glass and ice. Roar only stuns, scatters and, with CRACK, crumbles rock.
- Each skill evolves through two forks of two exclusive forms, so two picks and four possible
  ends. Carl rejected "the same but slightly better": a form must change what the skill does,
  never only how much. Taking a form renames the skill and changes how it looks in play.
- Every skill eats something (`src/feed.js`): a material or live state near you, foes in some state, how you
  move, or an event such as a blast kill. Eating shows as motes flying to the hero and a lit slot, and recharges the
  skill several times faster, so one skill can make what another eats and the region decides how far that goes. Skills
  feel different in the hand too: most are a tap, some hold stock (dash, mason, mine, clay), flask and wick are held then let
  go, lens and burrow stream while held, and some forms stream, toggle, or swell while held.
- Level-up cards show the actual skill or form, leaning towards skills that make what yours eat and what the
  region offers (`src/offers.js`). Once a run's forks are spent, the cards offer a new skill, a relic or a heal.
- Eight random starter rooms, each teaching its own first skill, and a quickstart for any
  ring with a matching random loadout. Quickstarts don't count towards the best scores.
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
- 21 relics, from chests, altars, mimics and the shop. They change rules rather than numbers:
  your gun, your movement, what can hurt you, and what pays (fire immunity makes fire a toy,
  the odd gem only rewards world kills, gas lifts you).
- Eight region themes change materials, tiles and foes. Room events: arena, flood,
  gasworks, collapse, vault, nest, altar and chests. Elite foes can burn, shock or be magnetic.
- Materials: rock, moss, peat, wood, metal, scrap, sand, ash, water, oil, ice, lava, acid,
  vine, brick, smoke, steam, methane, volatile crystal, glass, mud and snow.
- Lava or charge glazes sand into glass, which lets light through and shatters into flying shards under a blast,
  a falling block or a hammer. Water soaks sand and ash into mud, which slows anything in it, smothers fire and
  bakes into brick. Steam freezes into snow against ice and falls as snow in the Ice Shafts. Blasts throw sand,
  scrap, floes, snow and mud outward, ash beside water grows back as moss, and charged metal pulls scrap and
  magnetic foes. The world reports shatters and throws as events, and `src/loose.js` turns them into flying matter.
- The far wall holds pockets (`src/pockets.js`), which is how the depth matters for play. A pocket is a cistern of water,
  a hopper of sand, an ore seam of coins and scrap, rime that drops floes and snow, marsh gas, tar, a nest of foes, a lava
  vein, an acid seep or, rarely, an alcove with a chest. Rooms get up to three, more deeper in, and about a third come from
  other regions' systems, so a lava vein can sit in an ice room and a nest of ember bats in the Moss Caves. With depth each
  shows faintly on the far wall with its own colour and motion: a water line and drip, sand grains, gold glints, ice
  facets, rising bubbles, a sheen, blinking eyes, a glowing crack, an arch with a chest. Ring 0 never shows depth, so its
  pockets, only water and ore, are unseen until something breaks one, and the seal moment reveals what was there.
  Sand, lava, rime and seam pockets only sit high over open drops away from doors, so a spill rarely cuts a crossing. Blasts beside a pocket break it, and a bomb
  thrown at one bursts on it. So do two hammer blows, acid against it, a falling block, a worm digging through, and fire,
  lava or a lens beam over time. Heat and charge also do what the contents would: marsh gas blows up, tar pours burning,
  rime melts to water, a seam conducts and cracks. A nest wakes if the hero lingers near it or a blast goes off close by.
  A cracked pocket seeps before it bursts, and a broken one pours into the play plane until it's empty and stays a hole.
  Pockets live on the world object and save with the room. Tuning is `TUNING.pockets`.
- Foes: crawler, spitter, fish, bat, spore (leaves gas), slug (leaves oil), jelly
  (electrifies water), worm (digs), turret, bomber, imp
  (freezes water), ember bat (lights things), slime (leaves acid), shield crab, nest, mimic,
  gasbag, tick, pillbug, gnat, stilt, snapweed, scrapper, dripper, shade, urchin, coil, puffer and lantern.
  Foes can be charmed and then fight each other.
- Every foe has a life of its own. `src/lives.js` holds what they share (senses, fear, fire, noise, light, remains, bites) and `enemies.js` holds each
  kind's habit beside its attack. A foe minds its own business until it sees the hero, hears the gun or is hit; then it
  flickers red, hops and turns on you, and loses interest a few seconds after losing you. Rooms are busy when you arrive.
- Shared reactions: anything not fireproof shies from fire, lava, charge, acid, falling blocks and blasts. A creature that
  catches fire runs in a panic with flames on it, lights what it passes and sets alight whatever it touches, until water,
  mud or snow puts it out or it dies. Gunfire, blasts, bites and deaths are noises. The dead lie belly-up for half a minute
  and scavengers eat them. A bitten creature flees its attacker, or turns on it if it has a way to fight.
- Habits: crawlers, crabs and pillbugs eat the dead; pillbugs also eat ash, and curl into a ball that bowls others over when
  scared. Slugs graze moss and vine. Slimes sit by gates and scrap and dribble acid on them, so a slime can open a gate.
  Spitters lob at anything that walks into their patch, stilts lob at small walkers, turrets fire at whatever crosses their
  line, snapweeds lunge at anything below, crabs pinch walkers they bump into, urchin spines hurt whatever touches them, and
  mimics stay shut but bite anything that walks into them. Ticks jump onto a passing host and ride it, feeding, then leap
  at the hero. Bats sleep upside down on the ceiling until a noise or fire wakes them, then hunt gnats, ticks and spores.
  Gnats circle the nearest light and fly into fires. Ember bats sit by fire, lava or lamps and light fuel when cold. Imps
  run to fires and stamp them out, and freeze pools. Spores settle on fuel, turn rock beside them to moss and leak gas;
  gasbags rise to the ceiling and leak there. Worms lie still until something walks or a noise sounds nearby, then dig
  toward it and bite what they reach. Bombers walk toward noises and lights and light their fuse in fire, charge or when
  hurt. Coils hop from metal to metal charging it. Scrappers carry scrap to a hoard and throw it at anything near the hoard.
  Shades flee light and won't follow you into it. Drippers drip on whatever passes under. Nests breed when noise or harm
  disturbs them. Fish school and swim to a lantern's lure, which the lantern eats; jellies pulse when a swimmer comes
  close; puffers swell at anything near. Wardens and the Core don't have lives. Kills by creatures count as world kills.
- Inhabitants who can be killed: hermit (upgrade), miner (new skill), mole (shop).
- Score with chains. Kills by the world score double and give triple experience.
- In the core room rock burns and conducts, and the core drifts toward you.
- Rooms generate on entry, check they can be crossed, grow a vine out of any low spot you could fall into
  but not climb out of, and lean toward your skills, easing off with depth.
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
  planted per run and a brief reveal when met. Hanging props give the gun a way to set things off: a lamp drops fire, a battery arcs charge into nearby metal,
  water and foes, a tank pours water, a carboy pours acid, a sandbag pours sand, and a ladle pours lava, which crusts over when thin. Ceiling
  loads are held by a strut that suits the region, and metal rails carry charge to the gates that hold them. Shooting a
  hanging icicle drops it.

- Winning makes the room crumble and drains the colour back to four-shade green. If nothing can
  reach an exit, a bomb drops, and if that can't help a vine and a path get carved.

- Each Warden's seal offers one of three keystones, big rule changes with a cost (`src/keystones.js`). A run gets
  three, plus one per descent. They sit in the found set, seven from the start and eight on the ladder. Set
  `sealHold` on the game to make the keystone offer wait, which is the seam for anything played when a seal breaks.
- Wardens from ring 3 and the Core wear a ward against whatever has been doing the killing (`src/wards.js`): that
  school does a fraction of its damage, the Warden doesn't flinch, its pictogram sits above it and on the boss bar,
  and shots bounce off. Its own world weak point is never warded. The Core changes its ward at each phase to
  what hurt it most, and it can throw that school back. Each Warden gains one move at ring 3 and another at ring 5.
- After the Core a wordless choice: bank the score for a bonus and drain to green, or fall to a new map at a higher
  score multiplier (`descend` in `game.js`, `src/deep.js`). A loop lands at ring 3 with Wardens at rings 3, 4 and 5,
  a fresh region order, one more stacked omen, one more foe mutation, a tint and deeper shaders. Hovering the choice
  previews it on the whole picture. Touch needs a tap to preview and another to commit.
- The run-end screen shows the score against the best, depth, the build, kills by school, and the chase. The title
  shows the top three runs with their keystones. The save keeps the top five.

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
