"""
Packs the rendered stage backdrops (art3d/backdrop.py) for the game: client/src/assets/backdrops/<zone>-<layer>.webp
plus one backdrops.json ({"<zone>-<layer>": {"top": <world px of empty sky cropped off the top>}}).

Each layer gets a soft bloom (a blurred halo of its brightest pixels: fire, lamps, crystals, lava), and the empty
sky above its highest point is cropped off (the game's own sky shows there anyway).

    python3 art3d/pack_bg.py [--src art3d/out/bg] [--dst client/src/assets/backdrops]
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image, ImageFilter

WORLD_H = 576


def bloom(im):
    """Adds a halo round the brightest pixels (premultiplied, so the glow also spills onto transparent sky)."""
    a = np.asarray(im).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:]
    lum = (rgb * [0.3, 0.59, 0.11]).sum(-1, keepdims=True)
    hot = np.clip((lum - 0.62) / 0.38, 0, 1) * al
    src = Image.fromarray((np.concatenate([rgb * hot, hot], -1) * 255).astype(np.uint8), 'RGBA')
    w = im.width
    halo = np.zeros_like(a)
    for r, k in ((w / 220, 0.7), (w / 70, 0.55)):
        b = np.asarray(src.filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
        halo += b * k
    # composite: premultiplied add, alpha = max
    prem = rgb * al + halo[..., :3]
    alpha = np.clip(al + halo[..., 3:] * 0.9, 0, 1)
    out = np.where(alpha > 1e-4, prem / np.maximum(alpha, 1e-4), 0)
    return Image.fromarray((np.concatenate([np.clip(out, 0, 1), alpha], -1) * 255 + 0.5).astype(np.uint8), 'RGBA')


# Atmosphere per layer: how far each is pulled toward its own average colour (less contrast and saturation, so the
# play field in front reads first) and darkened.
AIR = {'far': (0.25, 0.9), 'far2': (0.3, 0.95), 'mid': (0.45, 0.95)}


def air(im, layer):
    k, dark = AIR.get(layer, (0, 1))
    if not k and dark == 1:
        return im
    a = np.asarray(im).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3:]
    w = al[..., 0] > 0.5
    mean = rgb[w].mean(0) if w.any() else rgb.reshape(-1, 3).mean(0)
    rgb = (rgb * (1 - k) + mean * k) * dark
    return Image.fromarray((np.concatenate([np.clip(rgb, 0, 1), al], -1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='art3d/out/bg')
    ap.add_argument('--dst', default='client/src/assets/backdrops')
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)
    meta = {}
    total = 0
    for p in sorted(glob.glob(os.path.join(a.src, '*.png'))):
        key = os.path.basename(p)[:-4]
        im = bloom(air(Image.open(p).convert('RGBA'), key.rsplit('-', 1)[1]))
        k = im.height / WORLD_H
        ys = np.nonzero(np.asarray(im.getchannel('A')).max(1) > 2)[0]
        top_px = int(ys[0]) if len(ys) else 0
        top = max(0, (int(top_px / k) - 8) // 8 * 8)  # world px, on an 8 px grid, a little headroom for the glow
        im = im.crop((0, round(top * k), im.width, im.height))
        out = os.path.join(a.dst, key + '.webp')
        im.save(out, 'WEBP', quality=84, method=6)
        meta[key] = {'top': top}
        sz = os.path.getsize(out)
        total += sz
        print(f'{key:20s} top {top:3d}  {im.width}x{im.height}  {sz // 1024} KB')
    clouds = os.path.join(os.path.dirname(a.src.rstrip('/')), 'clouds.png')
    if os.path.exists(clouds):
        # the top row of three clouds (the lower row lies in their shadow), each a 220x70 world-pixel cell at 2x
        c = Image.open(clouds).convert('RGBA').crop((0, 0, 1320, 140))
        c.save(os.path.join(a.dst, 'clouds.webp'), 'WEBP', quality=84, method=6)
        print('clouds', os.path.getsize(os.path.join(a.dst, 'clouds.webp')) // 1024, 'KB')
    json.dump(meta, open(os.path.join(a.dst, 'backdrops.json'), 'w'), separators=(',', ':'), sort_keys=True)
    print('total', total // 1024, 'KB')


if __name__ == '__main__':
    main()
