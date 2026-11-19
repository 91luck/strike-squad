"""
Textures for the stages' 3D architecture kits (client/src/game3d/kits.ts): cut stone walls, paving, carved mouldings.
Same method as terrain.py (height fields, lit and darkened in the cavities, periodic so nothing seams), but made to
be built with: blocks line up with the 32 px tiles, mouldings run along an edge, pillars wrap around.

    python3 art3d/kit_textures.py [--dst client/src/assets/terrain]

Writes <kit>-wall.webp (512x512, tiles both ways), <kit>-pave.webp (512x512), <kit>-band.webp (512x56, the carved
edge along the top of a wall, RGBA) and <kit>-stone.webp (256x256, for pillars and arches).
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from terrain import S, TOP_H, LIP, blocks, fbm, hexc, light, ramp, vnoise, worley  # noqa: E402


def ashlar(seed, cols, joint, bw=128, bh=64, chip=0.0, wear=0.0):
    """Dressed stone in running bond, each block its own tone, worn corners, chips and a few cracks."""
    hgt, rid = blocks(S, S, bw, bh, 5, seed, offset=0.5)
    n = fbm(S, S, 8, 8, seed + 1)
    fine = fbm(S, S, 48, 48, seed + 2, 3)
    d1, _ = worley(S, S, 14, seed + 4)
    chips = np.clip((0.12 - d1) / 0.06, 0, 1) * (vnoise(S, S, 14, 14, seed + 5) > 0.7) * chip
    crack = (np.abs(fbm(S, S, 5, 5, seed + 6) - 0.5) < 0.004) & (hgt > 0.6) & (vnoise(S, S, 6, 6, seed + 7) > 0.78)
    h = hgt * 0.7 + n * 0.12 + fine * 0.08 - chips * 0.5 - crack * 0.4
    t = rid * 0.55 + n * 0.35 + fine * 0.1
    rgb = ramp(t, cols)
    rgb = rgb * light(h, 7, ao=0.55)[..., None]
    rgb = np.where((hgt < 0.12)[..., None], hexc(joint) * 0.85 + rgb * 0.15, rgb)
    if wear:
        # salt and lichen blooms
        bloom = np.clip((fbm(S, S, 6, 6, seed + 9) - 0.58) / 0.08, 0, 1) * wear
        rgb = rgb * (1 - bloom[..., None] * 0.35) + hexc('#c8d2b0') * bloom[..., None] * 0.25
    return rgb


def paving(seed, cols, joint):
    """Big flagstones, laid in courses running back into the world (the top of a wall seen from above)."""
    hgt, rid = blocks(S, S, 256, 128, 4, seed, offset=0.37)
    n = fbm(S, S, 6, 6, seed + 1)
    fine = fbm(S, S, 40, 40, seed + 2, 3)
    h = hgt * 0.5 + n * 0.15 + fine * 0.08
    rgb = ramp(rid * 0.5 + n * 0.4 + fine * 0.1, cols)
    rgb = rgb * light(h, 5, ao=0.45)[..., None]
    rgb = np.where((hgt < 0.15)[..., None], hexc(joint) * 0.8 + rgb * 0.2, rgb)
    return rgb


def band(seed, cols, motif='lotus'):
    """A carved moulding along the top of a wall: a cap, a row of petals or waves, a bead line, a dentil course.
    LIP pixels of it stand above the walking line; the strip is RGBA (clear where nothing is carved)."""
    W, Hh = S, TOP_H
    yy, xx = np.mgrid[0:Hh, 0:W].astype(np.float32)
    hgt = np.zeros((Hh, W), np.float32)
    top = LIP
    # the cap: a rounded slab just over the walking line
    cap = (yy >= top - 6) & (yy < top + 4)
    hgt = np.where(cap, 0.9 - np.abs(yy - (top - 1)) / 12, hgt)
    # the motif course under it
    m0, m1 = top + 4, top + 20
    in_m = (yy >= m0) & (yy < m1)
    u = (xx % 64) / 64
    v = (yy - m0) / (m1 - m0)
    if motif == 'lotus':
        petal = 1 - ((u - 0.5) / (0.45 * (1 - v * 0.6) + 0.05)) ** 2 - (v - 0.15) ** 2 * 0.6
        hm = np.clip(petal, 0, 1) ** 0.6
    else:  # waves
        hm = np.clip(0.5 + 0.5 * np.sin((u + v * 0.5) * 2 * np.pi), 0, 1)
    hgt = np.where(in_m, 0.35 + 0.45 * hm, hgt)
    # a bead line and a dentil course
    bead = (yy >= m1) & (yy < m1 + 4)
    hgt = np.where(bead, 0.5 + 0.3 * np.cos(((xx % 8) / 8 - 0.5) * np.pi), hgt)
    den = (yy >= m1 + 4) & (yy < m1 + 12)
    hgt = np.where(den, np.where((xx % 16) < 10, 0.55, 0.15), hgt)
    alpha = (hgt > 0.01).astype(np.float32)
    alpha[(yy >= top - 6) & (yy < m1 + 12)] = 1
    n = vnoise(W, Hh, 32, 4, seed) * 0.12
    g = np.pad(hgt + n, ((1, 1), (0, 0)), mode='edge')
    gx = np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)
    gy = g[2:] - g[:-2]
    shade = np.clip(0.85 - gx * 2.2 - gy * 2.6 + (hgt - 0.5) * 0.4, 0.3, 1.5)
    rgb = ramp(n * 3 + hgt * 0.4, cols) * shade[..., None]
    out = np.concatenate([np.clip(rgb, 0, 1), alpha[..., None]], -1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def stone(seed, cols):
    """Smooth carved stone for turned pillars and arch rings: fine grain, faint banding, weathering."""
    n = 256
    a = fbm(n, n, 6, 6, seed)
    b = fbm(n, n, 40, 40, seed + 1, 3)
    yy = np.mgrid[0:n, 0:n][0] / n
    t = a * 0.6 + b * 0.25 + 0.15 * np.sin(yy * 2 * np.pi * 6)
    rgb = ramp(t, cols)
    h = a * 0.3 + b * 0.2
    rgb = rgb * light(h, 3, ao=0.3)[..., None]
    return rgb


def save(rgb_or_img, path, q=86):
    img = rgb_or_img if isinstance(rgb_or_img, Image.Image) else Image.fromarray((np.clip(rgb_or_img, 0, 1) * 255 + 0.5).astype(np.uint8))
    img.save(path, 'WEBP', quality=q, method=6)
    print(path, img.size, os.path.getsize(path))


KITS = {
    # Sagar Setu: sea-worn sandstone, pale in the moonlight, salt blooms; a lotus moulding along the walkway
    'setu': {
        'wall': lambda: ashlar(41, ['#6f6656', '#8a806b', '#a59a82', '#bdb197'], '#2a2620', chip=1.0, wear=1.0),
        'pave': lambda: paving(42, ['#7e7563', '#968c76', '#ada28a'], '#3a342c'),
        'band': lambda: band(43, ['#8a806b', '#b8ad94', '#d6ccb2'], 'lotus'),
        'stone': lambda: stone(44, ['#8c826c', '#a99e86', '#c4b99f']),
    },
    # Maya Nagri: white marble with rose inlay, a lotus moulding
    'mahal': {
        'wall': lambda: ashlar(51, ['#cfc6d2', '#ddd5df', '#ebe5ec', '#f6f2f6'], '#8f7f98', chip=0.25, wear=0.2),
        'pave': lambda: paving(52, ['#e2dae4', '#efe9f0', '#d6cad9'], '#7a6a84'),
        'band': lambda: band(53, ['#c9a7c4', '#e8d2e2', '#fff2fa'], 'lotus'),
        'stone': lambda: stone(54, ['#ddd4e0', '#eee8f0', '#fbf8fb']),
    },
    # Chakra Durg: dark granite in big courses, an iron-grey wave moulding
    'durg': {
        'wall': lambda: ashlar(61, ['#3e4048', '#4c4f58', '#5c606a', '#6a6e78'], '#16171b', bw=160, bh=64, chip=0.8),
        'pave': lambda: paving(62, ['#4a4c54', '#585b64', '#666a72'], '#1c1d22'),
        'band': lambda: band(63, ['#5a5e68', '#7a808c', '#9aa0aa'], 'waves'),
        'stone': lambda: stone(64, ['#555963', '#666a74', '#787c86']),
    },
    # Dwand Bhoomi: red sandstone of an old arena, worn smooth
    'akhada': {
        'wall': lambda: ashlar(71, ['#7a3e28', '#8e4a30', '#a2583a', '#b46a48'], '#3a1c12', chip=0.6, wear=0.3),
        'pave': lambda: paving(72, ['#9a6a4a', '#ad7c58', '#bf8e68'], '#4a2a1a'),
        'band': lambda: band(73, ['#a05a3c', '#c47a54', '#e09a70'], 'waves'),
        'stone': lambda: stone(74, ['#9a5238', '#b0644a', '#c4785c']),
    },
    # Suvarna Nagri: gilded stone
    'suvarna': {
        'wall': lambda: ashlar(81, ['#8a6420', '#a87c2c', '#c8983c', '#e0b454'], '#3a2608', chip=0.3),
        'pave': lambda: paving(82, ['#b08a3a', '#c89e48', '#dcb45c'], '#4a3410'),
        'band': lambda: band(83, ['#c8982c', '#ecc25a', '#fff0a8'], 'lotus'),
        'stone': lambda: stone(84, ['#c49a40', '#dcb45a', '#f0d27a']),
    },
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dst', default=os.path.join(os.path.dirname(__file__), '..', 'client', 'src', 'assets', 'terrain'))
    ap.add_argument('kits', nargs='*')
    a = ap.parse_args()
    for name, parts in KITS.items():
        if a.kits and name not in a.kits:
            continue
        for part, make in parts.items():
            save(make(), os.path.join(a.dst, f'{name}-{part}.webp'))


if __name__ == '__main__':
    main()
