"""
Saga bosses from a painted concept atlas (art3d/ai/atlas.png): each boss's body becomes the painted figure, sized to the
body it replaces and hung from the same pivot, so the game's draw code (client/src/game/boss3d.ts, *-art.ts) puts it where
the old one stood. The arms and weapons the old model drew separately are dropped (the painted figure has its own), the
parts the attacks still need (thrown boulders, the gate, the sage) are kept from the old atlas, and the face for the story
comms is cut from the figure's head.

    python3 art3d/ai_bosses.py [--only raakhasur,maniyodha]

art3d/ai/bosses.json: boss -> { box: [x0, y0, x1, y1] in the atlas, xclip: [x0, x1] (two figures touching), keep: [parts],
                               up: largest enlargement (world px per source px) }
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_parts import cut  # noqa: E402
from ai_foes import cut_local, outline  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, '..', 'client', 'src', 'assets', 'bosses3d')
SS = 2
INK = 3


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    spec = json.load(open(os.path.join(HERE, 'ai', 'bosses.json')))
    sh = Image.open(os.path.join(HERE, 'ai', 'atlas.png')).convert('RGB')
    rgba, fg = cut(sh, list(sh.getpixel((4, 4))), 28)
    lab, _ = ndi.label(ndi.binary_closing(fg, iterations=3))
    scache = {}
    for boss, s in spec.items():
        if a.only and boss not in a.only.split(','):
            continue
        meta = json.load(open(os.path.join(DST, boss + '.json')))
        old = Image.open(os.path.join(DST, boss + '.webp')).convert('RGBA')
        ob = meta['parts'].get('body') or meta['parts'].get('frame')
        key = 'body' if 'body' in meta['parts'] else 'frame'
        x0, y0, x1, y1 = s['box']
        if 'sheet' in s:
            fig = cut_local(scache, s)
        else:
            if 'xclip' in s:
                x0, x1 = s['xclip']
                mask = np.zeros(fg.shape, bool)
                mask[y0:y1, x0:x1] = fg[y0:y1, x0:x1]
            else:
                ids = np.bincount(lab[y0:y1, x0:x1].ravel())
                ids[0] = 0
                mask = ndi.binary_dilation(lab == int(ids.argmax()), iterations=2) & fg
            al = np.array(rgba.getchannel('A')).astype(float) * mask
            im = rgba.copy()
            im.putalpha(Image.fromarray(al.astype(np.uint8)))
            fig = im.crop((x0, y0, x1, y1))
            fig = fig.crop(fig.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox())
        full = fig
        # world size: as tall as the body it replaces, but never enlarged more than `up` (it would blur)
        th = s.get('th', ob['h'] / SS)
        k = min(th / fig.height, s.get('up', 1.7))
        head_im = None
        if s.get('headless'):
            cut_y = round(fig.height * s['headless'])
            head_im = fig.crop((0, 0, fig.width, cut_y))
            fig = fig.crop((0, cut_y, fig.width, fig.height))
        W, H = round(fig.width * k * SS), round(fig.height * k * SS)
        body = fig.resize((W, H), Image.LANCZOS)
        fx, fy = 0.5, min(0.97, ob['ay'] / ob['h'])
        # face: the head, a square from the top of the figure
        side = min(full.width, int(full.height * 0.42))
        fx0 = max(0, (full.width - side) // 2)
        face = full.crop((fx0, 0, fx0 + side, side)).resize((128, 128), Image.LANCZOS)
        # new atlas: body, face, then the old parts the attacks still draw
        keep = {p: meta['parts'][p] for p in s.get('keep', []) if p in meta['parts']}
        # the ink line and rim the foes have too (ai_foes.outline): it grows the picture by INK on every side
        body = outline(body, INK)
        sheets = [('body', body, (W * fx + INK, H * fy + INK), None), ('face', face, (64, 64), None)]
        for p, v in keep.items():
            img = old.crop((v['x'], v['y'], v['x'] + v['w'], v['y'] + v['h']))
            if p in s.get('blank', []):
                img = Image.new('RGBA', img.size, (0, 0, 0, 0))
            elif p == 'head' and head_im is not None:
                # the seven heads are the figure's own head: fitted into the old head's box
                if 'head_x' in s:
                    hx0, hx1 = s['head_x']
                    head_im = head_im.crop((round(head_im.width * hx0), 0, round(head_im.width * hx1), head_im.height))
                bb = head_im.getchannel('A').point(lambda v_: 255 if v_ > 40 else 0).getbbox()
                hh = head_im.crop(bb)
                f = min(img.width / hh.width, img.height / hh.height)
                hh = hh.resize((max(1, round(hh.width * f)), max(1, round(hh.height * f))), Image.LANCZOS)
                img = Image.new('RGBA', img.size, (0, 0, 0, 0))
                img.alpha_composite(hh, ((img.width - hh.width) // 2, img.height - hh.height))
            sheets.append((p, img, (v['ax'], v['ay']), v.get('len')))
        Wd = max(W, 1024 if len(sheets) > 3 else 520)
        x = y = shelf = 0
        placed = {}
        for name, img, piv, ln in sheets:
            if x + img.width > Wd:
                x, y, shelf = 0, y + shelf, 0
            placed[name] = (x, y, img, piv, ln)
            x += img.width + 2
            shelf = max(shelf, img.height + 2)
        Hd = y + shelf
        atlas = Image.new('RGBA', (Wd, Hd), (0, 0, 0, 0))
        parts = {}
        for name, (px_, py_, img, piv, ln) in placed.items():
            atlas.alpha_composite(img, (px_, py_))
            parts[name] = {'x': px_, 'y': py_, 'w': img.width, 'h': img.height, 'ax': round(piv[0], 2), 'ay': round(piv[1], 2)}
            if ln:
                parts[name]['len'] = ln
        if key == 'frame':
            parts['frame'] = parts.pop('body')
        atlas.save(os.path.join(DST, boss + '.webp'), 'WEBP', quality=90, method=6)
        json.dump({'ss': SS, 'parts': parts}, open(os.path.join(DST, boss + '.json'), 'w'), separators=(',', ':'))
        print(boss, 'body', round(W / SS), 'x', round(H / SS), 'world px (was', round(ob['w'] / SS), 'x', round(ob['h'] / SS), ')')


if __name__ == '__main__':
    main()
