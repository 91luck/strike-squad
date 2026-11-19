"""
Painted foes for the game (client/src/game/painted.ts): creatures of art3d/ai/atlas.png cut out whole and packed into one
atlas, client/src/assets/painted/foes.webp + .json. Which foe each picture stands for, its size in the game and which way it
faces in the atlas are in art3d/ai/foes.json.

    python3 art3d/ai_foes.py
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_parts import cut  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, '..', 'client', 'src', 'assets', 'painted')
SS = 3  # atlas px per game px, at most (never above the source's own resolution)
PAD = 3  # atlas px of ink line baked around each figure


def outline(im, px=2, color=(14, 10, 20), alpha=210):
    """A dark ink line around a cut figure (baked in, so it reads on any stage, dark caves and bright skies alike);
    the picture grows by `px` on every side."""
    a = np.array(im.getchannel('A')) > 60
    big = np.zeros((a.shape[0] + 2 * px, a.shape[1] + 2 * px), bool)
    big[px:-px, px:-px] = a
    ring = ndi.binary_dilation(big, iterations=px - 1)
    rim = ndi.binary_dilation(big, iterations=px) & ~ring
    # a faint warm rim outside the ink: the figure lifts off dark caves too
    a_rim = (rim * 70).astype(np.uint8)
    a_ink = (ring * alpha).astype(np.uint8)
    line = Image.new('RGBA', (big.shape[1], big.shape[0]), (255, 236, 200, 0))
    line.putalpha(Image.fromarray(a_rim).filter(ImageFilter.GaussianBlur(0.8)))
    ink = Image.new('RGBA', line.size, color + (0,))
    ink.putalpha(Image.fromarray(a_ink).filter(ImageFilter.GaussianBlur(0.6)))
    line.alpha_composite(ink)
    line.alpha_composite(im, (px, px))
    return line


def _grabcut(im, s):
    """A figure on a textured, shaded background (parchment tiles): OpenCV GrabCut seeded with the box's outer ring as
    background, then the pieces that matter kept."""
    import cv2

    a = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    m = np.full(a.shape[:2], cv2.GC_PR_FGD, np.uint8)
    r = s.get('ring', 6)
    m[:r, :] = m[-r:, :] = m[:, :r] = m[:, -r:] = cv2.GC_BGD
    for sx0, sy0, sx1, sy1 in s.get('seed', []):
        # parts GrabCut would take for background (a grey helmet on grey parchment): fractions of the box, kept
        h, w = m.shape
        m[round(sy0 * h) : round(sy1 * h), round(sx0 * w) : round(sx1 * w)] = cv2.GC_FGD
    bgd = np.zeros((1, 65))
    fgd = np.zeros((1, 65))
    cv2.grabCut(a, m, None, bgd, fgd, s.get('iters', 6), cv2.GC_INIT_WITH_MASK)
    fg = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    fg = ndi.binary_opening(fg, iterations=1)
    if not s.get('nofill'):
        fg = ndi.binary_fill_holes(fg)
    l2, n = ndi.label(fg)
    sizes = ndi.sum(fg, l2, range(1, n + 1))
    keep = [i + 1 for i, sz in enumerate(sizes) if sz >= s.get('minfrac', 0.12) * max(sizes)]
    mask = np.isin(l2, keep)
    for ex0, ey0, ex1, ey1 in s.get('erase', []):
        # a stray piece glued to the figure (a portrait, a label): fractions of the box, dropped
        h, w = mask.shape
        mask[round(ey0 * h) : round(ey1 * h), round(ex0 * w) : round(ex1 * w)] = False
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    if s.get('notrim'):
        return out
    return out.crop(alpha.point(lambda v: 255 if v > 40 else 0).getbbox())


def cut_local(cache, s):
    """A figure on a sheet whose grey differs from tile to tile: the background is the grey at the box's corners, flooded
    in from the box's border; the figure is the big pieces left (weapons that float beside it included)."""
    path = os.path.join(HERE, 'ai', s['sheet'])
    if path not in cache:
        cache[path] = Image.open(path).convert('RGB')
    x0, y0, x1, y1 = s['box']
    im = cache[path].crop((x0, y0, x1, y1))
    a = np.array(im).astype(int)
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    if s.get('grabcut'):
        return _grabcut(im, s)
    near = np.abs(a - bg).sum(2) <= s.get('tol', 60)
    lab, _ = ndi.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(border))
    if s.get('holes'):
        # grey seen through the figure (between an arm and the body) is background too
        sizes_n = ndi.sum(near, lab, range(1, lab.max() + 1))
        for i, sz in enumerate(sizes_n):
            if sz >= s['holes']:
                bgm |= lab == i + 1
    fg = ndi.binary_erosion(~bgm, iterations=1)
    fg = ndi.binary_fill_holes(ndi.binary_closing(fg, iterations=2))
    l2, n = ndi.label(fg)
    sizes = ndi.sum(fg, l2, range(1, n + 1))
    keep = [i + 1 for i, sz in enumerate(sizes) if sz >= s.get("minfrac", 0.12) * max(sizes)]
    mask = np.isin(l2, keep)
    for ex0, ey0, ex1, ey1 in s.get('erase', []):
        # a stray piece glued to the figure (a portrait, a label): fractions of the box, dropped
        h, w = mask.shape
        mask[round(ey0 * h) : round(ey1 * h), round(ex0 * w) : round(ex1 * w)] = False
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    if s.get('notrim'):
        return out
    return out.crop(alpha.point(lambda v: 255 if v > 40 else 0).getbbox())


def main():
    spec = json.load(open(os.path.join(HERE, 'ai', 'foes.json')))
    sh = Image.open(os.path.join(HERE, 'ai', 'atlas.png')).convert('RGB')
    rgba, fg = cut(sh, list(sh.getpixel((4, 4))), 28)
    lab, _ = ndi.label(ndi.binary_closing(fg, iterations=3))
    crops = {}
    sheets = {}
    for kind, s in spec.items():
        if 's' in s or 'sheet' in s:
            crops[kind] = cut_local(sheets, s)
            if s.get('recolor'):
                from ai_parts import recolor

                crops[kind] = recolor(crops[kind], s['recolor'])
            continue
        x0, y0, x1, y1 = s['box']
        ids = np.bincount(lab[y0:y1, x0:x1].ravel())
        ids[0] = 0
        mask = ndi.binary_dilation(lab == int(ids.argmax()), iterations=2) & fg
        im = rgba.copy()
        im.putalpha(Image.fromarray((np.array(rgba.getchannel('A')).astype(float) * mask).astype(np.uint8)))
        fig = im.crop((x0, y0, x1, y1))
        fig = fig.crop(fig.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox())
        crops[kind] = fig
    for kind, fig in list(crops.items()):
        wh = spec[kind]['h']  # world height
        k = min(wh * SS / fig.height, 1.0)
        crops[kind] = outline(fig.resize((max(1, round(fig.width * k)), max(1, round(fig.height * k))), Image.LANCZOS), PAD)
    W = 1024
    x = y = shelf = 0
    placed = {}
    for kind, im in sorted(crops.items(), key=lambda kv: -kv[1].height):
        if x + im.width > W:
            x, y, shelf = 0, y + shelf, 0
        placed[kind] = (x, y)
        x += im.width + 2
        shelf = max(shelf, im.height + 2)
    atlas = Image.new('RGBA', (W, y + shelf), (0, 0, 0, 0))
    meta = {}
    for kind, (px, py) in placed.items():
        im = crops[kind]
        atlas.alpha_composite(im, (px, py))
        s = spec[kind]
        # world height from the spec; width follows the picture
        # world size from the spec's height (the figure inside the ink line); the line adds its own bit around it
        wh = s['h'] * im.height / (im.height - 2 * PAD)
        ww = wh * im.width / im.height
        meta[kind] = {'x': px, 'y': py, 'w': im.width, 'h': im.height, 'ww': round(ww, 1), 'wh': round(wh, 2), 'pad': round(PAD * wh / im.height, 2), 'right': s.get('right', True), 'fly': s.get('fly', False)}
    os.makedirs(DST, exist_ok=True)
    atlas.save(os.path.join(DST, 'foes.webp'), 'WEBP', quality=90, method=6)
    json.dump(meta, open(os.path.join(DST, 'foes.json'), 'w'), separators=(',', ':'))
    print('foes', atlas.size, len(meta), 'kinds', os.path.getsize(os.path.join(DST, 'foes.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
