"""
Packs the heroes' cut-out parts (art3d/hero_parts.py) into one atlas per hero for the game's skeletal animation:
client/src/assets/rigs/h<id>.webp + h<id>.json.

Parts are kept at the render's resolution (`ss` pixels per HD sprite pixel) so they stay sharp when turned; each is
cropped to what it covers. The json gives, per part, its rectangle in the atlas, its pivot inside that rectangle and
its joint, plus the rest positions of all joints (HD px, feet at 0,0).

    python3 art3d/pack_parts.py [--src art3d/out/parts] [--dst client/src/assets/rigs]
"""

import argparse
import glob
import json
import os

from PIL import Image

PAD = 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='art3d/out/parts')
    ap.add_argument('--dst', default='client/src/assets/rigs')
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)
    for d in sorted(glob.glob(os.path.join(a.src, '*'))):
        if not os.path.exists(os.path.join(d, 'rig.json')):
            continue
        rig = json.load(open(os.path.join(d, 'rig.json')))
        FW, FH, CX, FY = rig['frame']
        crops = []
        for key, part in sorted(rig['parts'].items()):
            im = Image.open(os.path.join(d, key + '.png')).convert('RGBA')
            ss = im.width / FW
            box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
            if not box:
                continue
            x0, y0, x1, y1 = max(0, box[0] - PAD), max(0, box[1] - PAD), min(im.width, box[2] + PAD), min(im.height, box[3] + PAD)
            jx, jy = rig['joints'][part['joint']]
            px, py = (CX + jx) * ss - x0, (FY + jy) * ss - y0
            crops.append((key, im.crop((x0, y0, x1, y1)), px, py, part['joint']))
        # shelf packing, widest first
        crops.sort(key=lambda c: -c[1].height)
        W = 512
        x = y = shelf = 0
        placed = {}
        for key, im, px, py, j in crops:
            if x + im.width > W:
                x, y, shelf = 0, y + shelf, 0
            placed[key] = (x, y, im, px, py, j)
            x += im.width + 1
            shelf = max(shelf, im.height + 1)
        H = y + shelf
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        parts = {}
        for key, (x, y, im, px, py, j) in placed.items():
            atlas.alpha_composite(im, (x, y))
            parts[key] = {'x': x, 'y': y, 'w': im.width, 'h': im.height, 'px': round(px, 2), 'py': round(py, 2), 'joint': j}
        name = os.path.basename(d)
        atlas.save(os.path.join(a.dst, name + '.webp'), 'WEBP', quality=90, method=6)
        json.dump({'ss': ss, 'joints': rig['joints'], 'parts': parts}, open(os.path.join(a.dst, name + '.json'), 'w'), separators=(',', ':'))
        print(name, W, 'x', H, os.path.getsize(os.path.join(a.dst, name + '.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
