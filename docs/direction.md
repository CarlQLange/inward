# Direction: from early access to release

Carl has played this on his phone and likes it. He treats it as early access and wants a released game that
impresses people. He's the customer now, so nobody waits for him. These are the agreed aims. Anything not
fixed here is the builder's call.

What he said: going from retro to cool shaders is the thrill he wants, with an "oh my god" moment like Fez's
first rotation and the visual confidence of Animal Well. It looks not simple enough in some ways and far too
simple in others. Particles look samey. The outer rings should have less visual interest and each step inward
more. The phone is hard to parse. Runs should differ like a roguelike, and you should be able to break the game
a little with a combo, but the game must not reduce to finding the two skills that finish it, and skills must
not feel samey.

## Pillar 1: the game gains dimensions as you go in

Each ring is a generation of games. A screenshot from any ring should look like it belongs to a different era
from the ring beside it, and the jump should feel like progress, not a filter. One new technique per ring, on
top of the last.

| Ring | Era | What's new |
|---|---|---|
| 0 | Handheld | Four shades, LCD grid, ghosting. No backdrop at all. One tile look per material. Square particles. The plainest thing we can make, on purpose |
| 1 | Colour handheld | Limited palette, flat tiles, one silhouette layer behind |
| 2 | 16-bit | Parallax layers, palette cycling on water and lava, transparency, and depth inside the room once the first seal has broken |
| 3 | Light | Real shadows cast by world lights, with dark pools between them |
| 4 | Optics | Water refracts and reflects, heat haze over fire and lava, bloom that means something |
| 5 | Atmosphere | Shafts of light through gaps, layered fog, smoke and gas that behave like ink |
| 6 | Unmoored | The room's edges stop holding. Lit tile fronts, and the margins show the pit you're in |
| Core | Impossible | Everything, plus the picture itself bending toward the core |

The ending already drains everything back to four-shade green, and the whole ladder makes that land harder.

Simplicity is a feature of the outside. In the outer rings, remove detail: no patterned backdrops, no busy tile
texture, flat buried cells. Richness deeper in comes from light and depth, not from more pattern.

## Pillar 2: actors are always legible

The world can go wild because the things you must read never do. Actors are composited on a separate layer from
terrain and backdrop, and distortion, refraction, fringing and fog do not touch that layer. The hero, foes,
foe projectiles and live hazards stay crisp at every depth. On a phone especially, backdrop contrast stays low
and the strongest effects live behind and outside the play area. If a beautiful effect makes the game harder to
read on a 390 px wide screen, it loses.

## The moment

Carl named Fez for the size of the surprise, not for 3D. What this moment has to do is overturn what the player
thought the game was, and if it only shows off a technique it has failed.

Breaking the first seal is that moment. No words and no warning. Time holds, the flat room tips back in real
perspective, and the camera pulls out to show that the map is a stepped square pit with your room as one tile in
its wall and the core glowing at the bottom. The camera swings around it, dives back into your room, and when
you land the room has depth it never had before and keeps it. Later seals get a shorter version. After that the
pause map is the pit.

## Pillar 3: engines, tests and a way to go too far

Today nothing compounds, so nothing breaks. Breaking a roguelike comes from engines, where one thing produces
what another consumes. What stops an engine solving the game is that the world keeps changing what it can feed
on.

- **The world feeds skills.** Each skill recharges much faster from something in the world around you: ember
  from burning cells, bolt from charge, frost from water and ice, melt from lava, repel from scrap, and so on.
  You can see it happen. This makes skills feel different from each other, makes regions matter to a build, and
  lets two skills form a loop (a skill that makes what another eats). Regions are shuffled per run, so the build
  that is a god in the Foundry is ordinary in the Moss Caves.
- **Keystones.** Each Warden offers a choice of one big rule change with a real cost, in the manner of boss
  relics. These are where a run becomes itself and where breaking happens, and a run gets only three of them.
- **The Core tests you.** Wardens and especially the Core resist whatever has been doing the killing, partly
  and visibly, so a one-note build needs a second idea at the end.
- **Going too far is the reward.** After the Core you can stop and bank your score, or go deeper: the same hero
  into a harder, higher-scoring loop until it kills you. A broken build has somewhere to go, and score attack
  gets its top end.
- **Skills must differ.** Too many second forks are an element add-on, and "bursts at the end" appears on several
  skills. Upgrades must keep changing what a thing does.

The world rules stay the source of synergy, and the rules read without text.

## Standing rules

Very few words on screen. No sound. Irish and British spelling. Plain JavaScript modules with no build step for
development. Fixed 60 Hz simulation. Everything must work on an iPhone in Safari through WebGL 1. Tuning values
stay in `src/config.js`. The fire rebalance stands: fire belongs mainly to the Moss Caves and Peat Bog.

## Pillar 4: more verbs, more rules, and time to read them

After playing the release pass Carl asked for more skills and more emergence, with slightly slower play so
that more happening at once stays readable.

**Slower.** The world, foes, shots and skills run on a tempo below real time. The hero's run and jump keep
their feel, because sluggish controls aren't the same thing as a slower game. You get more time to see a
chain start and decide what to do about it.

**New world rules.** Each one joins systems that already exist, so old skills find new uses:

- Glass. Lava touching sand or ice, or charge running into sand, makes glass. Light passes through it. A blast,
  a falling block or a hard hit shatters it into shards that fly and hurt.
- Mud. Water soaking into sand or ash makes mud. Mud slows anything in it and puts out fire. Fire or lava next
  to mud bakes it into brick.
- Snow. Steam that touches ice or cold air falls as snow. It piles like sand, smothers fire and melts back to
  water near heat.
- Blasts throw loose matter. Sand, scrap, floes and shards beside a blast fly outward and hurt what they hit.
- Regrowth. Ash beside water turns to moss, so a burnt room grows back and can burn again.
- Charged metal is a magnet. While it carries charge it pulls scrap and metal foes toward it.

**New skills.** Each is a verb that works on world rules, eats something from the world, feels different in
the hand and has two forks of two forms that change what it does.

| Skill | What it does |
|---|---|
| Flask | Hold to soak up liquid near you, release to throw it. Carries lava into an ice room or acid onto a gate |
| Wick | Lays a fuse along the ground that burns to its end and blows up. Fire where a region has none |
| Float | Things in a bubble fall upward: water, lava, sand, foes and you |
| Link | Ties foes together. What happens to one happens to all of them: fire, charge, ice, a shove, a hit |
| Lens | Hold for a beam of focused light that heats: lights fires, melts ice, glazes sand, bakes mud |
| Chime | Shatters glass and ice nearby and throws the shards outward |
| Clay | Throws mud that slows foes and puts out fire. Fire bakes it into brick |
| Burrow | Swim through sand, mud, snow, ash and peat |
