"""Contact sheets for judging the cast: colour, solid black, and the four-shade quantise.

    uv run --with pillow --with numpy --with scipy python art/proof.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from cast import OUT

ROOT = Path(__file__).parent
PROOF = ROOT / 'proof'
GB = np.array([[15, 51, 25], [48, 98, 48], [139, 172, 15], [205, 222, 145]], dtype=np.uint8)
LUMA = np.array([0.3, 0.59, 0.11])
SCALE = 4
COLUMNS = 5
LABEL = 12


def solid(frame, background):
    alpha = frame[..., 3:] > 0
    return np.where(alpha, frame[..., :3], background)


def gameboy(frame, background):
    alpha = frame[..., 3:] > 0
    luma = frame[..., :3] @ LUMA / 255
    bands = np.digitize(luma, [0.14, 0.38, 0.68])
    return np.where(alpha, GB[bands], GB[0])


def black(frame, background):
    alpha = frame[..., 3:] > 0
    return np.where(alpha, 0, background).astype(np.uint8)


def sheet(entries, render, background, name):
    rows = []
    cell_w = max(sum(f.shape[1] + 2 for f in frames) for _, frames in entries) * SCALE + 8
    cell_h = max(max(f.shape[0] for f in frames) for _, frames in entries) * SCALE + LABEL + 8
    columns = min(COLUMNS, max(1, 1400 // cell_w))
    rows_needed = (len(entries) + columns - 1) // columns
    canvas = Image.new('RGB', (cell_w * columns, cell_h * rows_needed), tuple(background))
    draw = ImageDraw.Draw(canvas)
    ink = (255, 255, 255) if sum(background) < 300 else (0, 0, 0)
    for index, (kind, frames) in enumerate(entries):
        x = (index % columns) * cell_w + 4
        y = (index // columns) * cell_h + 2
        draw.text((x, y), kind, fill=ink)
        fx = x
        for frame in frames:
            pixels = render(frame, np.array(background, dtype=np.uint8))
            big = Image.fromarray(pixels.astype(np.uint8)).resize((frame.shape[1] * SCALE, frame.shape[0] * SCALE), Image.NEAREST)
            canvas.paste(big, (fx, y + cell_h - LABEL - 2 - big.height + 8))
            fx += big.width + 2 * SCALE
    canvas.save(PROOF / name)


def slice_cast():
    manifest = json.loads((OUT / 'cast.json').read_text())['creatures']
    atlas = np.asarray(Image.open(OUT / 'cast.png').convert('RGBA'))
    return [(kind, [atlas[y:y + h, x:x + w] for x, y, w, h in info['frames']]) for kind, info in manifest.items()]


def grid_proof(name, atlas, cell, render, background):
    h, w = atlas.shape[:2]
    pixels = render(atlas, np.array(background, dtype=np.uint8)).astype(np.uint8)
    Image.fromarray(pixels).resize((w * cell, h * cell), Image.NEAREST).save(PROOF / name)


def tiles_proof(render, background, name):
    atlas = np.asarray(Image.open(OUT / 'tiles2.png').convert('RGBA'))
    field = np.zeros((7 * 8 * 2, 7 * 8 * 4, 4), dtype=np.uint8)
    for region in range(8):
        row = region // 2 * 8
        a = atlas[row:row + 8, (region % 2) * 16:(region % 2) * 16 + 8]
        b = atlas[row:row + 8, (region % 2) * 16 + 8:(region % 2) * 16 + 16]
        ox, oy = (region % 4) * 56, (region // 4) * 56
        for y in range(6):
            for x in range(6):
                tile = b if (x * 7 + y * 5) % 4 == 0 else a
                field[oy + y * 8:oy + y * 8 + 8, ox + x * 8:ox + x * 8 + 8] = tile
    grid_proof(name, field, 4, render, background)


WARDENS = {'bellows', 'crucible', 'colossus', 'eel', 'brood', 'conductor', 'core', 'eelhead', 'eelbody'}

if __name__ == '__main__':
    PROOF.mkdir(exist_ok=True)
    everyone = slice_cast()
    small = [e for e in everyone if e[0] not in WARDENS]
    big = [e for e in everyone if e[0] in WARDENS]
    dark, light, handheld = (14, 18, 24), (225, 225, 215), tuple(int(c) for c in GB[0])
    for group, tag in ((small, 'cast'), (big, 'wardens')):
        sheet(group, solid, dark, f'{tag}-colour.png')
        sheet(group, black, light, f'{tag}-silhouette.png')
        sheet(group, gameboy, handheld, f'{tag}-gameboy.png')
    signs = np.asarray(Image.open(OUT / 'signs.png').convert('RGBA'))
    grid_proof('signs-colour.png', signs, 5, solid, dark)
    grid_proof('signs-gameboy.png', signs, 5, gameboy, handheld)
    tiles_proof(solid, dark, 'tiles-colour.png')
    tiles_proof(gameboy, handheld, 'tiles-gameboy.png')
