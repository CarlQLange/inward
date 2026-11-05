"""The cast: every creature, reduced from its posed sheet to a chunky atlas.

A sheet is a grid of poses on flat magenta. Each pose is cut by connected component,
so a limb that strays over a cell boundary stays with its owner. Each creature gets one
palette and one scale across its poses, the poses are registered against each other, and
a dark ring goes round the silhouette so it holds up against anything behind it.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.cluster.vq import kmeans2

ROOT = Path(__file__).parent
RAW = ROOT / 'raw' / 'cast'
OUT = ROOT.parent / 'assets'

OUTLINE = np.array([14, 12, 20], dtype=np.uint8)
LUMA = np.array([0.3, 0.59, 0.11])
INK = 0.13
LIGHT_FLOOR = 0.74
BODY_FLOOR = 0.42
EDGE_FLOOR = 0.3

# sheet: (columns, rows, [(kind, longest side, how poses line up, palette size, first cell, last cell)...])
GROUND, HANG, FREE, WALL = 'ground', 'hang', 'free', 'wall'

SHEETS = {
    'foes-ground': (4, 4, [
        ('spitter', 19, GROUND, 5, 2, 3), ('slime', 19, GROUND, 4, 8, 9), ('urchin', 20, FREE, 4, 12, 13),
        ('slug', 26, GROUND, 4, 4, 5), ('crab', 20, GROUND, 4, 6, 7),
    ]),
    'foes-air': (4, 4, [
        ('fish', 18, FREE, 4, 0, 1), ('bat', 24, FREE, 4, 2, 3),
        ('emberbat', 23, FREE, 5, 8, 9),
        ('puffer', 24, FREE, 5, 12, 13), ('lantern', 21, FREE, 5, 14, 15),
    ]),
    'foes-tall': (4, 4, [
        ('imp', 21, GROUND, 4, 0, 1), ('nest', 22, GROUND, 4, 14, 15),
    ]),
    'foes-fixed-folk': (6, 4, [
        ('snapweed', 26, HANG, 5, 2, 3), ('dripper', 19, HANG, 4, 4, 5),
    ]),
    'foes-folk-2': (4, 4, [
        ('mole', 21, GROUND, 5, 0, 1),
        ('miner', 21, GROUND, 5, 4, 5), ('cartographer', 22, GROUND, 4, 6, 7),
        ('jelly', 21, FREE, 3, 8, 9),
        ('spore', 18, FREE, 3, 14, 15),
    ]),
    'foes-3': (4, 4, [
        ('crawler', 22, GROUND, 3, 0, 1), ('hermit', 22, GROUND, 4, 4, 5), ('worm', 22, GROUND, 3, 6, 7),
        ('pillbug', 18, GROUND, 3, 10, 11), ('stilt', 26, GROUND, 2, 12, 13), ('coil', 24, GROUND, 3, 14, 15),
    ]),
    'foes-4': (4, 4, [
        ('gasbag', 22, FREE, 4, 0, 1), ('mimic', 20, GROUND, 4, 2, 3),
        ('scrapper', 22, GROUND, 4, 4, 5), ('bomber', 22, GROUND, 5, 6, 7),
        ('turret', 20, WALL, 4, 8, 9), ('bloodletter', 22, GROUND, 5, 10, 11),
        ('shade', 21, FREE, 3, 12, 13), ('tinker', 22, GROUND, 5, 14, 15),
    ]),
    'wardens': (4, 4, [
        ('bellows', 64, GROUND, 6, 0, 1), ('crucible', 66, GROUND, 7, 2, 3),
        ('colossus', 66, GROUND, 6, 4, 5), ('eel', 60, GROUND, 6, 6, 7),
        ('brood', 66, HANG, 7, 8, 9), ('conductor', 72, GROUND, 7, 10, 11),
        ('core', 60, FREE, 8, 12, 13), ('eelhead', 26, FREE, 6, 14, 14), ('eelbody', 18, FREE, 5, 15, 15),
    ]),
}

ALIASES = {'guardian': 'colossus', 'gnat': 'gnats'}

# Anything this small is a handful of pixels, so it's plotted rather than generated.
TINY = {'y': (246, 226, 138), 'w': (255, 255, 255), 'r': (255, 96, 72), 's': (190, 44, 44)}
GNATS = (['w.w', '.y.'], ['...', 'wyw'])
TICK = (
    ['....rrr.', '...rwrrr', 'y..rrrrw', '.y.srrss', 'y.y.y.y.'],
    ['.....rrr', '....rwrw', '...yrrrr', '.yyysss.', 'yy......'],
)

SIGNS = (5, 5, [
    'cause_fire', 'cause_lava', 'cause_acid', 'cause_charge', 'cause_smoke',
    'cause_crushed', 'cause_bitten', 'cause_shot', 'omen_tinder', 'omen_deluge',
    'omen_blackout', 'omen_rust', 'omen_bloom', 'omen_swarm', 'omen_moon',
    'omen_midas', 'omen_glass', 'map_skull', 'seal', 'seal_broken',
    'map_core', 'almanac', 'discovery',
])
SIGN_SIZE = 16

REGION_TILES = (
    ({'d': '18240f', 'a': '56692a', 'b': '3f4f20', 'h': '8fae3a'},
     ['aaabdaaa', 'ahabdaha', 'aabbdaab', 'dddddabb', 'aaaddddd', 'ahaabdaa', 'aaabbdah', 'bbbbbdaa'],
     ['hhhhdaaa', 'hhhadaha', 'ahabdhhb', 'dddddhbb', 'aaaddddd', 'haaabdaa', 'hhabbdhh', 'bhbbbdha']),
    ({'d': '0c1826', 'a': '2b4560', 'b': '1f3448', 'w': '7fb6d8'},
     ['aaadaaad', 'aawdaaad', 'aawdbaad', 'ddwddddd', 'aaadawad', 'aaadawad', 'baadaaad', 'dddddddd'],
     ['aaaaaaad', 'aaaaaaad', 'awwaawwd', 'waawwaad', 'aaaaaaad', 'abbbbbad', 'aaaaaaad', 'dddddddd']),
    ({'a': '3a2810', 'b': '2a1c0a', 'r': 'a88a56', 'o': 'c89040'},
     ['aabaaaaa', 'aaaaraab', 'aaaraaaa', 'aaraabaa', 'baraaaaa', 'aaaabaaa', 'aaaaaraa', 'aaabaaab'],
     ['aaabaaaa', 'aooaabaa', 'aooaaaoa', 'aaaabaaa', 'baaooaaa', 'aaaooaba', 'abaaaaaa', 'aaabaaab']),
    ({'d': '22262c', 'a': '7a8088', 'b': '5c6168', 'w': 'a8823e', 't': '3e2e14'},
     ['aaadaaaa', 'aabdaaab', 'abbdaabb', 'dddddddd', 'aaaaaada', 'aaaaabda', 'aaabbbda', 'dddddddd'],
     ['wwttttww', 'wwwttwww', 'twwwwwwt', 'ttwwwwtt', 'ttwwwwtt', 'twwwwwwt', 'wwwttwww', 'wwttttww']),
    ({'d': '0a0a0e', 'a': '2a2d36', 'b': '1c1e26', 'c': '5a5f6c', 'r': 'e8481c', 'y': 'ffb030'},
     ['aaaaaaad', 'acaaaacd', 'aaaaaaad', 'aaabaaad', 'aaaabaad', 'aaaaaaad', 'acaaaacd', 'dddddddd'],
     ['aaaraaad', 'aaaraaad', 'aaayaaad', 'rryyyrrr', 'aaayaaad', 'aaaraaad', 'aaaraaad', 'dddrdddd']),
    ({'d': '2e7d98', 'a': '9fe0ee', 'b': '6fc4d8', 'w': 'ffffff', 'k': '2a6e94'},
     ['wwwwwaad', 'waaawaad', 'waawaabd', 'wawaabbd', 'wwaabbbd', 'aaabbbbd', 'aabbbbbd', 'dddddddd'],
     ['wwwwwwwd', 'waaaaabd', 'wakkkabd', 'wakwkabd', 'wakkkabd', 'waaaaabd', 'wbbbbbbd', 'dddddddd']),
    ({'d': '1c0a30', 'a': '7a3fc0', 'b': '4f2490', 'h': 'd8a8ff'},
     ['ddhhaddd', 'dhhaabdd', 'hhaaabbd', 'haaabbbd', 'daaabbdd', 'ddaabddd', 'dddbdddd', 'dddddddd'],
     ['bbbdbbbb', 'bbdaabbb', 'bdhaadbb', 'dhhabbdb', 'bdaabbdb', 'bbdabdbb', 'bbbddbbb', 'bbbbbbbd']),
    ({'a': '6e1030', 'b': '4a0a22', 'p': 'ff5a9a', 'n': 'ffd0e0'},
     ['aaaaaaab', 'aapaaaaa', 'aaappaaa', 'aaaaapaa', 'baaaapaa', 'aaaapaaa', 'aaapaaab', 'aaabaaaa'],
     ['aaabaaaa', 'abbaabaa', 'baapppab', 'aapnpaba', 'abpppaaa', 'aabaaaba', 'baaabaaa', 'aabaaaba']),
)


def key_mask(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    pinkish = (r > 150) & (b > 130) & (g < 110) & (np.abs(r - b) < 90)
    return pinkish


def poses_of(rgb, columns, rows):
    """Splits a sheet into one (rgb, mask) per cell, assigning whole components by centroid."""
    h, w = rgb.shape[:2]
    solid = ~key_mask(rgb)
    labels, count = ndimage.label(solid, structure=np.ones((3, 3)))
    masks = [np.zeros((h, w), bool) for _ in range(columns * rows)]
    slices = ndimage.find_objects(labels)
    for index, box in enumerate(slices, 1):
        part = labels[box] == index
        if part.sum() < 24:
            continue
        ys, xs = np.nonzero(part)
        cy, cx = ys.mean() + box[0].start, xs.mean() + box[1].start
        cell = min(rows - 1, int(cy * rows / h)) * columns + min(columns - 1, int(cx * columns / w))
        masks[cell][box] |= part
    return masks


def crop(rgb, mask):
    ys, xs = np.nonzero(mask)
    box = (ys.min(), ys.max() + 1, xs.min(), xs.max() + 1)
    return rgb[box[0]:box[1], box[2]:box[3]], mask[box[0]:box[1], box[2]:box[3]]


def palette_for(frames, size):
    """A shared palette, with ink held out so that black outlines can't take a colour slot."""
    trusted = [rgb[ndimage.binary_erosion(mask, iterations=3)] for rgb, mask in frames]
    pixels = np.concatenate(trusted).astype(float)
    ink = pixels @ LUMA / 255 < INK
    colours = pixels[~ink]
    np.random.seed(7)
    chosen = colours[np.random.choice(len(colours), min(len(colours), 20000), replace=False)]
    centres, _ = kmeans2(chosen, size - 1, minit='++', iter=30, seed=7)
    return np.vstack([np.median(pixels[ink], axis=0) if ink.any() else OUTLINE, centres]).astype(np.uint8)


def nearest(rgb, palette):
    return ((rgb[..., None, :].astype(int) - palette.astype(int)) ** 2).sum(-1).argmin(-1)


def reduce(rgb, mask, scale, palette, keep=0.3, ink_weight=0.65):
    """Picks the most-covered palette colour per chunky pixel rather than averaging into mud."""
    h, w = mask.shape
    height, width = max(1, round(h * scale)), max(1, round(w * scale))
    rows = np.minimum((np.arange(h) * height / h).astype(int), height - 1)
    cols = np.minimum((np.arange(w) * width / w).astype(int), width - 1)
    indices = nearest(rgb, palette)
    trusted = mask & ~ndimage.binary_dilation(~mask, iterations=2, border_value=1)
    votes = np.zeros((height, width, len(palette)))
    coverage, area = np.zeros((height, width)), np.zeros((height, width))
    np.add.at(area, (rows[:, None], cols[None, :]), 1)
    ys, xs = np.nonzero(mask)
    np.add.at(votes, (rows[ys], cols[xs], indices[ys, xs]), 0.02)
    np.add.at(coverage, (rows[ys], cols[xs]), 1)
    ys, xs = np.nonzero(trusted)
    np.add.at(votes, (rows[ys], cols[xs], indices[ys, xs]), 1)
    votes[..., 0] *= ink_weight
    covered = coverage / area
    return votes.argmax(-1), bridged(covered >= keep, covered >= keep * 0.4)


def bridged(solid, faint):
    """Reinstates faint pixels that join separate parts, so thin necks and strings don't snap."""
    labels, _ = ndimage.label(solid, structure=np.ones((3, 3)))
    result = solid.copy()
    for y, x in zip(*np.nonzero(faint & ~solid)):
        around = labels[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
        if len(set(around[around > 0].tolist())) > 1:
            result[y, x] = True
    return result


def despeckled(chosen, solid, palette, passes=2):
    """Quiets low-contrast noise, leaving strong accents such as eyes and teeth alone."""
    lumas = palette @ LUMA / 255
    result = chosen.copy()
    for _ in range(passes):
        padded = np.pad(np.where(solid, result, -1), 1, constant_values=-1)
        around = np.stack([padded[:-2, 1:-1], padded[2:, 1:-1], padded[1:-1, :-2], padded[1:-1, 2:]], -1)
        for y, x in zip(*np.nonzero(solid & (result != 0))):
            ring = around[y, x][around[y, x] >= 0]
            if len(ring) < 2:
                continue
            common, count = np.unique(ring, return_counts=True)
            winner = common[count.argmax()]
            if count.max() >= 3 and winner != result[y, x] and winner != 0 and abs(lumas[winner] - lumas[result[y, x]]) < 0.3:
                result[y, x] = winner
    return result


def lift_edge_ink(chosen, solid, palette):
    """A silhouette pixel can't be ink, or it vanishes into the dark ring and a dark room."""
    outside = ~ndimage.binary_erosion(solid, border_value=0)
    edge_ink = solid & outside & (chosen == 0)
    result = chosen.copy()
    lumas = palette[1:] @ LUMA / 255
    result[edge_ink] = 1 + np.argmin(np.where(lumas >= EDGE_FLOOR, lumas, lumas + 1))
    return result


def lift_values(palette, used):
    """A tone curve that carries the main body clear of the dark shades, keeping each hue."""
    colours = palette.astype(float)
    lumas = np.maximum(colours @ LUMA / 255, 0.02)
    body = lumas[1:][np.argmax(used[1:])]
    gamma = np.log(BODY_FLOOR) / np.log(max(body, 0.02)) if body < BODY_FLOOR else 1.0
    gains = np.minimum(lumas ** gamma / lumas, 255 / np.maximum(colours.max(-1), 1))
    colours[1:] = colours[1:] * gains[1:, None]
    lumas = colours @ LUMA / 255
    main = 1 + np.argmax(used[1:])
    if lumas[main] < BODY_FLOOR:
        colours[main] += (255 - colours[main]) * (BODY_FLOOR - lumas[main]) / (1 - lumas[main])
        lumas = colours @ LUMA / 255
    brightest = 1 + np.argmax(lumas[1:])
    if lumas[brightest] < LIGHT_FLOOR:
        mix = (LIGHT_FLOOR - lumas[brightest]) / max(1 - lumas[brightest], 0.01)
        colours[brightest] += (255 - colours[brightest]) * mix
    return np.clip(colours, 0, 255).astype(np.uint8)


def register(frames, anchor):
    """Offsets for each frame so the shared body overlaps most from pose to pose."""
    base = frames[0][1]
    offsets = [(0, 0)]
    for _, solid in frames[1:]:
        best, score = (0, 0), -1
        ys = [base.shape[0] - solid.shape[0]] if anchor == GROUND else [0] if anchor == HANG else range(-solid.shape[0], base.shape[0] + 1)
        xs = [0] if anchor == WALL else range(-solid.shape[1], base.shape[1] + 1)
        for dy in ys:
            for dx in xs:
                overlap = sum_overlap(base, solid, dy, dx)
                if overlap > score:
                    best, score = (dy, dx), overlap
        offsets.append(best)
    return offsets


def sum_overlap(base, solid, dy, dx):
    top, left = max(0, dy), max(0, dx)
    bottom, right = min(base.shape[0], dy + solid.shape[0]), min(base.shape[1], dx + solid.shape[1])
    if bottom <= top or right <= left:
        return 0
    return (base[top:bottom, left:right] & solid[top - dy:bottom - dy, left - dx:right - dx]).sum()


def narrow_gaps(solid):
    """Empty pixels in a horizontal or vertical run of two or fewer, walled on both sides."""
    def along(rows):
        gaps = np.zeros_like(rows)
        for y, row in enumerate(rows):
            walls = np.nonzero(row)[0]
            for a, b in zip(walls, walls[1:]):
                if 1 < b - a <= 3:
                    gaps[y, a + 1:b] = True
        return gaps
    return along(solid) | along(solid.T).T


def ringed(rgba):
    solid = rgba[..., 3] > 0
    ring = ndimage.binary_dilation(solid) & ~solid & ~narrow_gaps(solid)
    result = rgba.copy()
    result[ring] = [*OUTLINE, 255]
    return result


def compose(frames, offsets):
    tops = [dy for dy, _ in offsets]
    lefts = [dx for _, dx in offsets]
    bottoms = [dy + f.shape[0] for (dy, _), f in zip(offsets, frames)]
    rights = [dx + f.shape[1] for (_, dx), f in zip(offsets, frames)]
    top, left = min(tops), min(lefts)
    size = (max(bottoms) - top + 2, max(rights) - left + 2, 4)
    canvases = []
    for frame, (dy, dx) in zip(frames, offsets):
        canvas = np.zeros(size, dtype=np.uint8)
        canvas[dy - top + 1:dy - top + 1 + frame.shape[0], dx - left + 1:dx - left + 1 + frame.shape[1]] = frame
        canvases.append(ringed(canvas))
    return canvases


def creature(cuts, longest, anchor, colours):
    extent = max(max(mask.shape) for _, mask in cuts)
    scale = longest / extent
    palette = palette_for(cuts, colours)
    reduced = [reduce(rgb, mask, scale, palette) for rgb, mask in cuts]
    used = np.bincount(np.concatenate([c[s] for c, s in reduced]), minlength=len(palette))
    palette = lift_values(palette, used)
    offsets = register(reduced, anchor)
    painted = []
    for chosen, solid in reduced:
        chosen = lift_edge_ink(despeckled(chosen, solid, palette), solid, palette)
        rgba = np.zeros((*chosen.shape, 4), dtype=np.uint8)
        rgba[..., :3] = palette[chosen]
        rgba[..., 3] = solid * 255
        painted.append(rgba)
    return compose(painted, offsets)


def plotted(rows):
    frame = np.zeros((len(rows), len(rows[0]), 4), dtype=np.uint8)
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c in TINY:
                frame[y, x] = (*TINY[c], 255)
    return frame


def build_cast():
    cast = {}
    for sheet, (columns, rows, entries) in SHEETS.items():
        rgb = np.asarray(Image.open(RAW / f'{sheet}.png').convert('RGB'))
        masks = poses_of(rgb, columns, rows)
        for kind, longest, anchor, colours, first, last in entries:
            cuts = [crop(rgb, masks[cell]) for cell in range(first, last + 1)]
            cast[kind] = {'anchor': anchor, 'frames': creature(cuts, longest, anchor, colours)}
    for kind, anchor, frames in (('gnats', FREE, GNATS), ('tick', GROUND, TICK)):
        plots = [plotted(rows) for rows in frames]
        cast[kind] = {'anchor': anchor, 'frames': compose(plots, [(0, 0)] * len(plots))}
    return cast


def build_signs():
    """Pictograms in a four-across grid of 16 pixel squares, matching the older icon atlases."""
    columns, rows, names = SIGNS
    rgb = np.asarray(Image.open(RAW / 'icons-signs.png').convert('RGB'))
    masks = poses_of(rgb, columns, rows)
    atlas = np.zeros((SIGN_SIZE * ((len(names) + 3) // 4), SIGN_SIZE * 4, 4), dtype=np.uint8)
    for index, name in enumerate(names):
        frame = creature([crop(rgb, masks[index])], SIGN_SIZE - 2, FREE, 5)[0]
        h, w = frame.shape[:2]
        y = index // 4 * SIGN_SIZE + (SIGN_SIZE - h) // 2
        x = index % 4 * SIGN_SIZE + (SIGN_SIZE - w) // 2
        atlas[y:y + h, x:x + w] = frame
    Image.fromarray(atlas).save(OUT / 'signs.png')
    return names


def build_region_tiles(size=8):
    """Two blocks per region in the order the regions are defined."""
    atlas = np.zeros((size * 4, size * 4, 4), dtype=np.uint8)
    for region, (colours, *blocks) in enumerate(REGION_TILES):
        for variant, rows in enumerate(blocks):
            index = region * 2 + variant
            y, x = index // 4 * size, index % 4 * size
            for dy, row in enumerate(rows):
                for dx, c in enumerate(row):
                    atlas[y + dy, x + dx] = (*bytes.fromhex(colours[c]), 255)
    Image.fromarray(atlas).save(OUT / 'tiles2.png')


def pack(cast, name='cast'):
    """Shelf-packs frames tallest-first and writes the atlas with a manifest beside it."""
    width = 512
    placed, x, y, shelf = [], 1, 1, 0
    order = sorted(cast, key=lambda kind: -max(f.shape[0] for f in cast[kind]['frames']))
    manifest = {}
    for kind in order:
        boxes = []
        for frame in cast[kind]['frames']:
            h, w = frame.shape[:2]
            if x + w + 1 > width:
                x, y, shelf = 1, y + shelf + 1, 0
            placed.append((frame, x, y))
            boxes.append([int(x), int(y), int(w), int(h)])
            x, shelf = x + w + 1, max(shelf, h)
        manifest[kind] = {'anchor': cast[kind]['anchor'], 'frames': boxes}
    atlas = np.zeros((y + shelf + 1, width, 4), dtype=np.uint8)
    for frame, fx, fy in placed:
        atlas[fy:fy + frame.shape[0], fx:fx + frame.shape[1]] = frame
    Image.fromarray(atlas).save(OUT / f'{name}.png')
    manifest = dict(sorted(manifest.items()))
    (OUT / f'{name}.json').write_text(json.dumps({'aliases': ALIASES, 'creatures': manifest}, indent=None, separators=(',', ':')))
    return manifest
