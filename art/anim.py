"""Animated clips: sheets of frames of one creature reduced onto one shared pixel grid.

Everything that moves between frames has to be a decision, not a resampling accident, so
every frame of a kind shares a scale, a palette and a canvas, and each is shifted onto a
fixed pivot in high resolution before it's reduced. The canvas stays symmetric about the
pivot, so flipping a creature to face left never moves it.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from cast import FREE, GROUND, HANG, INK, LUMA, OUT, WALL, despeckled, key_mask, lift_edge_ink, lift_values, palette_for, plotted, reduce, ringed

RAW = Path(__file__).parent / 'raw' / 'anim'
OPAQUE = 128
MARGIN = 1.0
WORK = 4


def clip(sheet, name, first, count, fps=10, loop=True, hold=None, sustain=None, air=False, walk=False):
    return dict(sheet=sheet, name=name, cells=list(range(first, first + count)), fps=fps, loop=loop, hold=hold, sustain=sustain, air=air, walk=walk)


def load_sheet(name):
    image = Image.open(RAW / f'{name}.png')
    pixels = np.asarray(image.convert('RGBA'))
    alpha = pixels[..., 3]
    solid = alpha >= OPAQUE if (alpha < 255).any() else ~key_mask(pixels[..., :3])
    return pixels[..., :3], solid


def cell_masks(solid, columns, rows):
    h, w = solid.shape
    labels, count = ndimage.label(solid, structure=np.ones((3, 3)))
    masks = {}
    for index, box in enumerate(ndimage.find_objects(labels), 1):
        part = labels[box] == index
        if part.sum() < 40:
            continue
        ys, xs = np.nonzero(part)
        cell = min(rows - 1, int((ys.mean() + box[0].start) * rows / h)) * columns + min(columns - 1, int((xs.mean() + box[1].start) * columns / w))
        masks.setdefault(cell, np.zeros((h, w), bool))[box] |= part
    return masks


def lifted_out(rgb, mask, cell, columns, rows):
    """A frame as (rgb, mask) on a canvas with room around its cell, cell origin at the margin."""
    h, w = mask.shape
    ch, cw = h // rows, w // columns
    pad_y, pad_x = int(ch * MARGIN), int(cw * MARGIN)
    y0, x0 = (cell // columns) * ch - pad_y, (cell % columns) * cw - pad_x
    canvas_h, canvas_w = ch + 2 * pad_y, cw + 2 * pad_x
    out_rgb = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    out_mask = np.zeros((canvas_h, canvas_w), bool)
    sy0, sx0 = max(0, y0), max(0, x0)
    sy1, sx1 = min(h, y0 + canvas_h), min(w, x0 + canvas_w)
    out_rgb[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = rgb[sy0:sy1, sx0:sx1]
    out_mask[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = mask[sy0:sy1, sx0:sx1]
    return out_rgb, out_mask


def shifted(array, dy, dx):
    result = np.zeros_like(array)
    h, w = array.shape[:2]
    sy0, sy1 = max(0, -dy), min(h, h - dy)
    sx0, sx1 = max(0, -dx), min(w, w - dx)
    result[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx] = array[sy0:sy1, sx0:sx1]
    return result


def overlap(a, b, dy, dx):
    return (a & shifted(b, dy, dx)).sum()


def best_shift(reference, mask, reach_y, reach_x):
    small_r, small_m = reference[::WORK, ::WORK], mask[::WORK, ::WORK]
    candidates = [(overlap(small_r, small_m, dy, dx), -abs(dy) - abs(dx), dy, dx)
                  for dy in range(-reach_y // WORK, reach_y // WORK + 1)
                  for dx in range(-reach_x // WORK, reach_x // WORK + 1)]
    _, _, dy, dx = max(candidates)
    return dy * WORK, dx * WORK


def pivot_of(mask, anchor):
    ys, xs = np.nonzero(mask)
    x = int(np.median(xs)) if anchor != WALL else int(xs.min())
    y = {GROUND: ys.max(), HANG: ys.min()}.get(anchor, int(np.median(ys)))
    return int(y), x


def aligned(frames, anchor, reference, reach):
    """Shifts each frame so a still body stays still, trusting feet or tops where they're fixed."""
    placed = []
    for rgb, mask, air in frames:
        ys, _ = np.nonzero(mask)
        ref_ys, _ = np.nonzero(reference)
        if anchor == GROUND and not air:
            dy = ref_ys.max() - ys.max()
            _, dx = best_shift(reference, shifted(mask, dy, 0), 0, reach)
        elif anchor == HANG and not air:
            dy = ref_ys.min() - ys.min()
            _, dx = best_shift(reference, shifted(mask, dy, 0), 0, reach)
        elif anchor == WALL:
            _, xs = np.nonzero(mask)
            dx = np.nonzero(reference)[1].min() - xs.min()
            dy, _ = best_shift(reference, shifted(mask, 0, dx), reach, 0)
        else:
            dy, dx = best_shift(reference, mask, reach, reach)
        placed.append((shifted(rgb, dy, dx), shifted(mask, dy, dx)))
    return placed


def outline_cleared(rgb, mask, thickness):
    """The drawn outline is replaced by the ring, so the body keeps its true colours to the edge."""
    ink = mask & (rgb @ LUMA / 255 < INK)
    if not ink.any():
        return rgb
    depth = ndimage.distance_transform_edt(np.pad(mask, 1))[1:-1, 1:-1]
    distance, (ny, nx) = ndimage.distance_transform_edt(~(mask & ~ink), return_indices=True)
    outline = ink & (depth <= thickness) & (distance <= thickness * 1.5)
    result = rgb.copy()
    result[outline] = rgb[ny[outline], nx[outline]]
    return result


def settled(frames, loop):
    """Removes colour flicker in pixels that stay solid: a one-frame change that reverts is noise."""
    chosen = [c.copy() for c, _ in frames]
    solids = [s for _, s in frames]
    count = len(frames)
    for i in range(count):
        if not loop and i in (0, count - 1):
            continue
        before, after = (i - 1) % count, (i + 1) % count
        agree = (chosen[before] == chosen[after]) & (chosen[before] != chosen[i]) & solids[i] & solids[before] & solids[after]
        chosen[i][agree] = chosen[before][agree]
    return list(zip(chosen, solids))


def animate(kind, spec):
    anchor, longest, colours, clips = spec['anchor'], spec['longest'], spec['colours'], spec['clips']
    sheets = {}
    cut = {}
    for c in clips:
        grid = spec.get('grids', {}).get(c['sheet'], (4, 4))
        if c['sheet'] not in sheets:
            rgb, solid = load_sheet(c['sheet'])
            sheets[c['sheet']] = (rgb, cell_masks(solid, *grid), grid)
        rgb, masks, (columns, rows) = sheets[c['sheet']]
        cut[c['name']] = [(*lifted_out(rgb, masks[cell], cell, columns, rows), c['air']) for cell in c['cells']]
    first = next(iter(cut.values()))[0]
    reach_wide = first[1].shape[1] // 6
    reach_fine = spec.get('reach', first[1].shape[1] // 40)
    reference = first[1]
    placed = {}
    for c in clips:
        frames = cut[c['name']]
        lead = aligned(frames[:1], anchor, reference, reach_wide)[0]
        rest = aligned(frames[1:], anchor, lead[1], reach_fine)
        placed[c['name']] = [lead, *rest]
    base = next(iter(placed.values()))[0][1]
    pivot_y, pivot_x = pivot_of(base, anchor)
    ys, xs = np.nonzero(base)
    scale = longest / max(ys.max() - ys.min() + 1, xs.max() - xs.min() + 1)
    size = base.shape
    half_h, half_w = size[0] // 2, size[1] // 2
    centred = {name: [(shifted(rgb, half_h - pivot_y, half_w - pivot_x), shifted(mask, half_h - pivot_y, half_w - pivot_x)) for rgb, mask in frames] for name, frames in placed.items()}
    low = 2 * (round(half_w * scale))
    fit = low / size[1]
    thickness = spec.get('outline', 11)
    centred = {name: [(outline_cleared(rgb, mask, thickness), mask) for rgb, mask in frames] for name, frames in centred.items()}
    palette = palette_for([f for frames in centred.values() for f in frames], colours)
    ink = spec.get('ink', 0.65)
    reduced = {name: [reduce(rgb, mask, fit, palette, ink_weight=ink) for rgb, mask in frames] for name, frames in centred.items()}
    used = np.bincount(np.concatenate([c[s] for frames in reduced.values() for c, s in frames]), minlength=len(palette))
    palette = (lift_values(palette, used) * spec.get('value', 1)).astype(np.uint8)
    painted = {}
    for c in clips:
        frames = [(despeckled(chosen, solid, palette), solid) for chosen, solid in reduced[c['name']]]
        frames = settled(frames, c['loop'])
        result = []
        for chosen, solid in frames:
            chosen = lift_edge_ink(chosen, solid, palette)
            rgba = np.zeros((*chosen.shape, 4), dtype=np.uint8)
            rgba[..., :3] = palette[chosen]
            rgba[..., 3] = solid * 255
            result.append(ringed(rgba))
        painted[c['name']] = result
    return cropped(painted, clips, anchor)


def cropped(painted, clips, anchor):
    all_frames = [f for frames in painted.values() for f in frames]
    union = np.any([f[..., 3] > 0 for f in all_frames], axis=0)
    ys, xs = np.nonzero(union)
    h, w = union.shape
    cy, cx = h // 2, w // 2
    if anchor == WALL:
        left, right = xs.min(), xs.max() + 1
    else:
        reach = max(cx - xs.min(), xs.max() + 1 - cx)
        left, right = cx - reach, cx + reach
    if anchor == FREE:
        reach = max(cy - ys.min(), ys.max() + 1 - cy)
        top, bottom = cy - reach, cy + reach
    else:
        top, bottom = ys.min(), ys.max() + 1
    return {
        c['name']: dict(fps=c['fps'], loop=c['loop'], hold=c['hold'], sustain=c['sustain'], walk=c['walk'], frames=[f[top:bottom, left:right] for f in painted[c['name']]])
        for c in clips
    }


def plotted_clips(table, anchor):
    """Hand-plotted frames on one symmetric canvas, bottom or centre aligned."""
    width = max(len(row) for spec in table.values() for frame in spec['frames'] for row in frame)
    height = max(len(frame) for spec in table.values() for frame in spec['frames'])
    width += width % 2
    height += height % 2
    out = {}
    for name, spec in table.items():
        frames = []
        for rows in spec['frames']:
            canvas = np.zeros((height + 2, width + 2, 4), dtype=np.uint8)
            art = plotted(rows)
            h, w = art.shape[:2]
            top = height - h + 1 if anchor == GROUND else (height - h) // 2 + 1
            left = (width - w) // 2 + 1
            canvas[top:top + h, left:left + w] = art
            frames.append(ringed(canvas))
        out[name] = dict(fps=spec.get('fps', 8), loop=spec.get('loop', True), hold=spec.get('hold'), sustain=spec.get('sustain'), walk=False, frames=frames)
    return out


def body_size(frames):
    """The typical drawn size across a clip, so a pose with wings up doesn't set the shot box."""
    boxes = []
    for frame in frames:
        ys, xs = np.nonzero(frame[..., 3] > 0)
        boxes.append((xs.max() - xs.min() + 1, ys.max() - ys.min() + 1))
    return tuple(int(v) for v in np.median(boxes, axis=0))


ALIASES = {'guardian': 'colossus', 'gnat': 'gnats', 'eel': 'eelhead', 'eelseg': 'eelbody'}

PLOTTED = {
    'gnats': (FREE, {
        'move': dict(fps=18, frames=[['w.w', '.y.'], ['w.w', '.y.'], ['...', 'wyw'], ['...', 'wyw']]),
    }),
    'tick': (GROUND, {
        'idle': dict(fps=3, frames=[
            ['........', '....rrr.', '...rwrrr', 'y..rrrrw', '.y.srrss', 'y.y.y.y.'],
            ['........', '........', '....rrr.', 'y..rwrrr', '.y.rrrrw', 'yyysssss'],
        ]),
        'attack': dict(fps=12, loop=False, hold=1, frames=[
            ['........', '........', '....rrr.', 'y..rwrrr', '.y.rrrrw', 'yyysssss'],
            ['........', '........', '........', '...rrrrr', 'y.rwrrrw', 'yysyssss'],
        ]),
        'leap': dict(fps=14, frames=[
            ['.....rrr', '....rwrw', '...yrrrr', '.yyysss.', 'yy......', '........'],
            ['.....rrr', '....rwrw', '...yrrrr', '..yysss.', '.yy.....', 'y.......'],
        ]),
        'cling': dict(fps=4, frames=[
            ['y...rr..', 'y..rrwr.', '.yyrrrry', 'y..rrsr.', 'y...ss..', '........'],
            ['y...rr..', '.y.rrwr.', '.yyrrrry', '.y.rrsr.', 'y...ss..', '........'],
        ]),
    }),
}


def pair(sheet, first, *clips):
    """Clips laid end to end from a starting cell: (name, frames, options)."""
    result, at = [], first
    for name, count, options in clips:
        result.append(clip(sheet, name, at, count, **options))
        at += count
    return result


def spec(anchor, longest, colours, *clips, **extra):
    return dict(anchor=anchor, longest=longest, colours=colours, clips=[c for group in clips for c in group], **extra)


WALK = dict(walk=True)
TELL = dict(loop=False, hold=3, fps=12)

ANIMS = {
    'crawler': spec(GROUND, 22, 4, pair('crawler', 0, ('move', 8, dict(fps=10, **WALK)), ('attack', 8, dict(loop=False, hold=3, fps=10)))),
    'spitter': spec(GROUND, 19, 4, pair('spitter', 0, ('idle', 8, dict(fps=5)), ('attack', 8, TELL))),
    'fish': spec(FREE, 18, 4, pair('fish', 0, ('move', 8, dict(fps=11)), ('attack', 8, dict(loop=False, fps=14, sustain=(4, 6)))), ink=0.4),
    'bat': spec(FREE, 24, 3, pair('bat', 0, ('move', 8, dict(fps=16)), ('attack', 8, dict(loop=False, fps=12, sustain=(3, 5)))), [clip('bat', 'idle', 8, 1, fps=1)]),
    'turret': spec(WALL, 20, 4, pair('turret', 0, ('idle', 8, dict(fps=5)), ('attack', 8, dict(loop=False, hold=3, fps=16)))),
    'slug': spec(GROUND, 26, 3, pair('slug', 0, ('move', 8, dict(fps=7, **WALK)), ('idle', 8, dict(fps=5)))),
    'bellows': spec(GROUND, 64, 5,
                    pair('bellows', 0, ('move', 8, dict(fps=7, **WALK)), ('bloat', 8, dict(loop=False, hold=4, fps=10))),
                    pair('bellows2', 0, ('slam', 8, dict(loop=False, hold=1, fps=9, sustain=(3, 5))), ('charge', 8, dict(loop=False, hold=2, fps=10, sustain=(4, 6)))), value=0.84),
    'colossus': spec(GROUND, 66, 5,
                     pair('colossus', 0, ('move', 8, dict(fps=7, **WALK)), ('stomp', 8, dict(loop=False, hold=3, fps=12))),
                     pair('colossus2', 0, ('charge', 8, dict(loop=False, hold=2, fps=11, sustain=(4, 6))), ('hurl', 8, dict(loop=False, hold=4, fps=9))), value=0.74),
    'crucible': spec(HANG, 66, 5, pair('crucible', 0, ('move', 8, dict(fps=7)), ('attack', 8, dict(loop=False, hold=1, fps=8, sustain=(3, 5))))),
    'eelhead': spec(FREE, 26, 4, pair('eel', 0, ('move', 8, dict(fps=7)), ('attack', 4, dict(loop=False, hold=0, fps=8, sustain=(1, 2))))),
    'eelbody': spec(FREE, 18, 3, [clip('eel', 'move', 12, 4, fps=8)]),
    'brood': spec(HANG, 66, 5,
                  pair('brood', 0, ('idle', 8, dict(fps=4)), ('attack', 8, dict(loop=False, hold=2, fps=9, sustain=(4, 5)))),
                  pair('brood2', 8, ('swing', 8, dict(fps=7)))),
    'broodfallen': spec(GROUND, 44, 5, pair('brood2', 0, ('falling', 2, dict(fps=8)), ('fallen', 6, dict(loop=False, fps=8, sustain=(2, 5)))), part_of='brood'),
    'conductor': spec(GROUND, 64, 5, pair('conductor', 0, ('move', 8, dict(fps=7, **WALK)), ('attack', 8, dict(loop=False, hold=3, fps=12, sustain=(4, 5))))),
    'core': spec(FREE, 60, 6,
                 pair('core', 0, ('idle', 8, dict(fps=6)), ('attack', 8, dict(loop=False, hold=2, fps=10, sustain=(4, 5)))),
                 pair('core2', 0, ('idle1', 8, dict(fps=9)), ('idle2', 8, dict(fps=12)))),
    'mole': spec(GROUND, 22, 5, pair('mole-hermit', 0, ('idle', 4, dict(fps=3)), ('greet', 4, dict(loop=False, fps=6, sustain=(1, 2))))),
    'hermit': spec(GROUND, 22, 4, pair('mole-hermit', 8, ('idle', 4, dict(fps=3)), ('greet', 4, dict(loop=False, fps=6, sustain=(1, 2))))),
    'miner': spec(GROUND, 21, 5, pair('miner-cartographer', 0, ('idle', 4, dict(fps=3)), ('greet', 4, dict(loop=False, fps=6, sustain=(2, 3))))),
    'pillbug': spec(GROUND, 18, 4, pair('pillbug', 0, ('move', 8, dict(fps=10, **WALK)), ('ball', 8, dict(loop=False, fps=14, sustain=(3, 7)))), ink=1.6),
    'puffer': spec(FREE, 13, 4, pair('puffer', 0, ('move', 8, dict(fps=10)), ('inflate', 8, dict(loop=False, fps=9)))),
    'scrapper': spec(GROUND, 22, 4, pair('scrapper', 0, ('move', 6, dict(fps=9, **WALK)), ('attack', 4, dict(loop=False, hold=1, fps=10)), ('empty', 6, dict(fps=9, **WALK)))),
    'mimic': spec(GROUND, 19, 5, pair('mimic', 0, ('idle', 4, dict(fps=1.5)), ('move', 8, dict(fps=12)), ('attack', 4, dict(fps=8)))),
    'bomber': spec(GROUND, 22, 6, pair('bomber', 0, ('move', 8, dict(fps=12, **WALK)), ('lit', 8, dict(loop=False, fps=8)))),
    'snapweed': spec(HANG, 24, 4, pair('snapweed', 0, ('idle', 8, dict(fps=5)), ('attack', 3, dict(loop=False, hold=2, fps=10)))),
    'worm': spec(GROUND, 22, 4, pair('worm', 0, ('move', 8, dict(fps=9)), ('attack', 8, dict(loop=False, fps=12, sustain=(4, 5))))),
    'imp': spec(GROUND, 21, 3, pair('imp-stilt', 0, ('move', 8, dict(fps=11)))),
    'stilt': spec(GROUND, 26, 2, pair('imp-stilt', 8, ('move', 4, dict(fps=7, **WALK)), ('attack', 4, dict(loop=False, hold=1, fps=10)))),
    'jelly': spec(FREE, 21, 4, pair('jelly-lantern', 0, ('move', 6, dict(fps=7)), ('attack', 2, dict(fps=10)))),
    'lantern': spec(FREE, 21, 4, pair('jelly-lantern', 8, ('move', 4, dict(fps=7)), ('attack', 4, dict(loop=False, hold=0, fps=10, sustain=(2, 3))))),
    'spore': spec(FREE, 16, 3, pair('spore-gasbag', 0, ('move', 8, dict(fps=6)))),
    'gasbag': spec(FREE, 22, 3, pair('spore-gasbag', 8, ('move', 8, dict(fps=5)))),
    'emberbat': spec(FREE, 23, 5, pair('emberbat-shade', 0, ('move', 8, dict(fps=16)))),
    'shade': spec(FREE, 21, 3, pair('emberbat-shade', 8, ('move', 8, dict(fps=6)))),
    'slime': spec(GROUND, 19, 3, pair('slime-urchin', 0, ('move', 8, dict(fps=7, **WALK)))),
    'urchin': spec(FREE, 20, 3, pair('slime-urchin', 8, ('idle', 5, dict(fps=7)), ('attack', 3, dict(loop=False, fps=10)))),
    'crab': spec(GROUND, 22, 3, pair('crab-tinker', 0, ('move', 8, dict(fps=9, **WALK)))),
    'coil': spec(GROUND, 24, 3, pair('crab-coil', 8, ('idle', 1, dict(fps=1)), ('attack', 2, dict(loop=False, hold=1, fps=10)), ('leap', 3, dict(loop=False, fps=10)), ('land', 2, dict(loop=False, fps=10)))),
    'nest': spec(GROUND, 22, 4, pair('nest-dripper', 0, ('idle', 4, dict(fps=3)), ('attack', 4, dict(loop=False, fps=8)))),
    'dripper': spec(HANG, 18, 4, pair('nest-dripper', 8, ('idle', 4, dict(fps=4)), ('attack', 4, dict(loop=False, hold=0, fps=8)))),
}


def build_cast():
    cast = {}
    for kind, (anchor, table) in PLOTTED.items():
        cast[kind] = dict(anchor=anchor, clips=plotted_clips(table, anchor))
    for kind, entry in ANIMS.items():
        clips = animate(kind, entry)
        owner = entry.get('part_of')
        if owner:
            cast[owner]['clips'].update(clips)
        else:
            cast[kind] = dict(anchor=entry['anchor'], clips=clips)
    return cast


def pack(cast, name='cast'):
    """Shelf-packs every frame tallest first, then writes the atlas and its manifest."""
    width = 1024
    items = [(frame, kind, clip_name, index) for kind, entry in cast.items() for clip_name, c in entry['clips'].items() for index, frame in enumerate(c['frames'])]
    items.sort(key=lambda item: -item[0].shape[0])
    boxes, x, y, shelf = {}, 1, 1, 0
    for frame, kind, clip_name, index in items:
        h, w = frame.shape[:2]
        if x + w + 1 > width:
            x, y, shelf = 1, y + shelf + 1, 0
        boxes[kind, clip_name, index] = [x, y, w, h]
        x, shelf = x + w + 1, max(shelf, h)
    atlas = np.zeros((y + shelf + 1, width, 4), dtype=np.uint8)
    for frame, kind, clip_name, index in items:
        bx, by, w, h = boxes[kind, clip_name, index]
        atlas[by:by + h, bx:bx + w] = frame
    Image.fromarray(atlas).save(OUT / f'{name}.png')

    def described(kind, clip_name, c):
        spec_ = dict(fps=c['fps'], loop=c['loop'], frames=[boxes[kind, clip_name, i] for i in range(len(c['frames']))])
        extras = {'hold': c.get('hold'), 'sustain': c.get('sustain'), 'walk': c.get('walk') or None}
        return spec_ | {k: v for k, v in extras.items() if v is not None}

    manifest = {
        kind: dict(anchor=entry['anchor'], clips={clip_name: described(kind, clip_name, c) for clip_name, c in entry['clips'].items()})
        for kind, entry in sorted(cast.items())
    }
    (OUT / f'{name}.json').write_text(json.dumps({'aliases': ALIASES, 'creatures': manifest}, separators=(',', ':')))
    return {kind: body_size(next(iter(entry['clips'].values()))['frames']) for kind, entry in cast.items()}
