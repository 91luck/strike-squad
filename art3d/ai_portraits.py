"""
Menu portraits and showcase figures of the sheet-based heroes (art3d/ai_parts.py): the standing figure drawn at the left
of a hero's sheet, recoloured like the hero's spec, cut out and written as the files the game's menus already read:

    client/src/assets/sprites3d/h<id>-face.webp   128x128 head-and-shoulders (frame idle_0_f at 0,0)
    client/src/assets/sprites3d/h<id>-big.webp    the showcase figure in every frame of the existing atlas, feet at (120, 288)

    python3 art3d/ai_portraits.py
"""

import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_parts import cut, load_spec, recolor  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, '..', 'client', 'src', 'assets', 'sprites3d')
# hero id -> (sheet, spec, figure box, head-and-shoulders box), all in the sheet's pixels
HEROES = {
    0: ('hero1.png', 'hero1.json'),
    1: ('hero2.png', 'hero2.json'),
    2: ('hero2.png', 'hero_tusk.json'),
    3: ('hero1.png', 'hero_viper.json'),
    4: ('hero1.png', 'hero_sparky.json'),
    5: ('hero2.png', 'hero_ghost.json'),
    6: ('hero1.png', 'hero_kiki.json'),
    7: ('hero2.png', 'hero_sarge.json'),
}
FIG = {'hero1.png': (10, 30, 488, 970), 'hero2.png': (30, 20, 505, 995)}
FACE = {'hero1.png': (90, 20, 440, 370), 'hero2.png': (110, 10, 440, 340)}


def main():
    for hid, (sheet, spec_file) in HEROES.items():
        spec = load_spec(os.path.join(HERE, 'ai', spec_file))
        sh = Image.open(os.path.join(HERE, 'ai', sheet)).convert('RGB')
        rgba, _ = cut(sh, list(sh.getpixel((4, 4))), 28)
        rgba = recolor(rgba, spec.get('recolor'))
        fig = rgba.crop(FIG[sheet])
        fig = fig.crop(fig.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox())
        # showcase: 270 px tall, feet at (120, 288) in a 288 x 300 frame
        k = 270 / fig.height
        big = fig.resize((round(fig.width * k), 270), Image.LANCZOS)
        face = rgba.crop(FACE[sheet])
        face = face.resize((128, round(128 * face.height / face.width)), Image.LANCZOS).crop((0, 0, 128, 128))
        meta = json.load(open(os.path.join(DST, f'h{hid}-big.json')))
        atlas = Image.new('RGBA', (meta['w'] * 4, meta['h'] * 5), (0, 0, 0, 0))
        old = Image.open(os.path.join(DST, f'h{hid}-big.webp'))
        atlas = Image.new('RGBA', old.size, (0, 0, 0, 0))
        for fr in meta['frames'].values():
            atlas.alpha_composite(big, (fr['x'] + 120 - big.width // 2, fr['y'] + 288 - big.height))
        atlas.save(os.path.join(DST, f'h{hid}-big.webp'), 'WEBP', quality=90, method=6)
        out = Image.new('RGBA', Image.open(os.path.join(DST, f'h{hid}-face.webp')).size, (0, 0, 0, 0))
        out.alpha_composite(face, (0, 0))
        out.save(os.path.join(DST, f'h{hid}-face.webp'), 'WEBP', quality=92, method=6)
        print('hero', hid, spec_file)


if __name__ == '__main__':
    main()
