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

Breaking the first seal is the Fez moment. No words and no warning. Time holds, the flat room tips back in real
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
