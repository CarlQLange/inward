"""Reduces the generated sheets in art/raw to chunky sprite atlases in assets/.

    uv run --with pillow --with numpy --with scipy python art/process_art.py
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).parent
RAW = ROOT / 'raw'
OUT = ROOT.parent / 'assets'
GRID = 4


def is_key(rgb):
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return (r > 170) & (b > 150) & (g < 110)


def cell(rgb, column, row):
    h, w = rgb.shape[:2]
    return rgb[row * h // GRID + 4:(row + 1) * h // GRID - 4, column * w // GRID + 4:(column + 1) * w // GRID - 4]


def cut_out(rgb):
    key = is_key(rgb)
    labels, _ = ndimage.label(key)
    border = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])
    outside = np.isin(labels, list(border - {0}))
    solid = ~ndimage.binary_dilation(outside, iterations=2)
    ys, xs = np.where(solid)
    return rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1], solid[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def reduce(rgb, mask, width, height, colours):
    _, (ny, nx) = ndimage.distance_transform_edt(~mask, return_indices=True)
    image = Image.fromarray(rgb[ny, nx])
    small = np.asarray(image.resize((width, height), Image.BOX))
    coverage = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((width, height), Image.BOX))
    keep = coverage > 110
    quantised = Image.fromarray(small).quantize(colours, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    alpha = (keep * 255).astype(np.uint8)
    return Image.merge('RGBA', (*quantised.split(), Image.fromarray(alpha)))


def fit(rgb, longest):
    h, w = rgb.shape[:2]
    scale = longest / max(h, w)
    return max(1, round(w * scale)), max(1, round(h * scale))


def edged(tile):
    pixels = np.asarray(tile).copy()
    pixels[-1, :, :3] = pixels[-1, :, :3] * 0.5
    pixels[:, -1, :3] = pixels[:, -1, :3] * 0.5
    return Image.fromarray(pixels)


def build(sheet, name, cell_size, longest, colours, finish=lambda sprite: sprite):
    rgb = np.asarray(Image.open(RAW / sheet).convert('RGB'))
    atlas = Image.new('RGBA', (cell_size * GRID, cell_size * GRID), (0, 0, 0, 0))
    for row in range(GRID):
        for column in range(GRID):
            cropped, mask = cut_out(cell(rgb, column, row))
            size = fit(cropped, longest[row * GRID + column] if isinstance(longest, dict) else longest)
            sprite = reduce(cropped, mask, *size, colours)
            x = column * cell_size + (cell_size - size[0]) // 2
            y = row * cell_size + cell_size - size[1]
            atlas.paste(finish(sprite), (x, y))
    atlas.save(OUT / f'{name}.png')


OUT.mkdir(exist_ok=True)
CREATURE_SIZES = {i: 14 for i in range(16)} | {3: 20, 4: 13, 5: 13, 6: 14, 7: 12, 8: 15, 9: 16, 10: 15, 11: 15, 12: 15, 13: 28, 14: 15, 15: 16}
build('creatures.png', 'creatures', 28, CREATURE_SIZES, 6)
build('icons.png', 'icons', 16, 14, 5)
build('tiles.png', 'tiles', 8, 8, 4, edged)
