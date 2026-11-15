"""
Packs the rendered boss parts (art3d/boss_rig.py) for the game: one atlas per boss,
client/src/assets/bosses3d/<boss>.webp + <boss>.json ({"ss": 2, "parts": {part: {x, y, w, h, ax, ay, len?}}}):
each part's rectangle in the atlas, its pivot (ax, ay) in atlas pixels from the part's top-left, and for arms and
maces their modelled length in world pixels. Parts are rendered at 2x world pixels and get the game's dark outline.

    python3 art3d/pack_boss.py [--src art3d/out/boss] [--dst client/src/assets/bosses3d]
"""
import argparse
import glob
import json
import os

from PIL import Image, ImageChops, ImageFilter

OUTLINE = (0x14, 0x10, 0x19, 255)


def outlined(im):
    a = im.getchannel('A').point(lambda v: 255 if v > 96 else 0)
    ring = ImageChops.subtract(a.filter(ImageFilter.MaxFilter(3)), a)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(Image.new('RGBA', im.size, OUTLINE), (0, 0), ring)
    out.alpha_composite(im)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='art3d/out/boss')
    ap.add_argument('--dst', default='client/src/assets/bosses3d')
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)
    for d in sorted(os.path.dirname(m) for m in glob.glob(os.path.join(a.src, '*', 'meta.json'))):
        key = os.path.basename(d)
        meta = json.load(open(os.path.join(d, 'meta.json')))
        ss = meta.pop('_ss', 2)
        ims = {p: outlined(Image.open(os.path.join(d, p + '.png')).convert('RGBA')) for p in meta}
        # shelf packing, tallest first
        order = sorted(ims, key=lambda p: -ims[p].height)
        W = max(512, max(im.width for im in ims.values()))
        x = y = shelf = 0
        rects = {}
        for p in order:
            im = ims[p]
            if x + im.width > W:
                x, y, shelf = 0, y + shelf + 2, 0
            rects[p] = (x, y)
            x += im.width + 2
            shelf = max(shelf, im.height)
        atlas = Image.new('RGBA', (W, y + shelf), (0, 0, 0, 0))
        parts = {}
        for p, (px, py) in rects.items():
            atlas.alpha_composite(ims[p], (px, py))
            parts[p] = {'x': px, 'y': py, 'w': ims[p].width, 'h': ims[p].height, **meta[p]}
        out = os.path.join(a.dst, key + '.webp')
        atlas.save(out, 'WEBP', quality=88, method=6)
        json.dump({'ss': ss, 'parts': parts}, open(os.path.join(a.dst, key + '.json'), 'w'), separators=(',', ':'))
        print(key, len(parts), 'parts', atlas.size, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    main()
