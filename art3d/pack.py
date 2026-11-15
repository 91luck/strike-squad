"""
Packs the rendered hero frames (art3d/hero_rig.py) into one atlas per hero for the game:
client/public/sprites3d/h<id>.webp (frames at the game's HD sprite size, 96x100, each given the game's 1 px dark
outline) and h<id>.json (frame rectangles and muzzle positions).

    python3 art3d/pack.py --src art3d/out --dst client/public/sprites3d
"""
import argparse
import glob
import json
import os

from PIL import Image, ImageChops, ImageFilter

W, H = 96, 100
OUTLINE = (0x14, 0x10, 0x19, 255)


def outlined(im, W=W, H=H):
    """Downscale a 2x render to the sprite size and give it a dark outline (alpha dilation; thicker on big frames)."""
    im = im.resize((W, H), Image.LANCZOS)
    a = im.getchannel('A').point(lambda v: 255 if v > 96 else 0)
    ring = ImageChops.subtract(a.filter(ImageFilter.MaxFilter(3 if W <= 128 else 5)), a)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(Image.new('RGBA', (W, H), OUTLINE), (0, 0), ring)
    out.alpha_composite(im)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='art3d/out')
    ap.add_argument('--dst', default='client/public/sprites3d')
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)
    for d in sorted(os.path.dirname(m) for m in glob.glob(os.path.join(a.src, '*', 'meta.json'))):
        hid = os.path.basename(d)
        meta = json.load(open(os.path.join(d, 'meta.json')))
        W, H = meta.pop('_size', [96, 100])
        keys = sorted(meta)
        cols = max(1, min(12, 1152 // W))
        rows = (len(keys) + cols - 1) // cols
        atlas = Image.new('RGBA', (cols * W, rows * H), (0, 0, 0, 0))
        frames = {}
        for i, k in enumerate(keys):
            im = Image.open(os.path.join(d, k + '.png')).convert('RGBA')
            x, y = (i % cols) * W, (i // cols) * H
            atlas.alpha_composite(outlined(im, W, H), (x, y))
            frames[k] = {'x': x, 'y': y, **meta[k]}
        atlas.save(os.path.join(a.dst, hid + '.webp'), 'WEBP', quality=88, method=6)
        json.dump({'w': W, 'h': H, 'frames': frames}, open(os.path.join(a.dst, hid + '.json'), 'w'), separators=(',', ':'))
        print(hid, len(keys), 'frames', os.path.getsize(os.path.join(a.dst, hid + '.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
