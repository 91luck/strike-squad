"""
Rides (sawari) painted whole, from the creature sheet (art3d/ai/kits2.png) and the foes atlas: the gryphon is the great
hawk (baaz), the void hound is the tiger, the painted war elephant is the elephant. Each atlas holds one part, `body`, hung
from the feet (baaz: from its middle); client/src/game/mount-art.ts bobs and rocks it with the stride instead of swinging
legs. The old legs/wing parts are dropped.

    python3 art3d/ai_mounts.py
"""

import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_foes import cut_local  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DST = os.path.join(HERE, '..', 'client', 'src', 'assets', 'mounts3d')
SS = 3
# kind -> where the figure comes from, its length in world px, where it hangs ('feet' | 'middle')
MOUNTS = {
    'baaz': {'sheet': 'kits2.png', 'box': [35, 335, 322, 585], 'grabcut': 1, 'minfrac': 0.3, 'w': 104, 'hang': 'feet', 'flip': True},
    'tiger': {'sheet': 'kits2.png', 'box': [955, 660, 1195, 855], 'grabcut': 1, 'minfrac': 0.3, 'w': 96, 'hang': 'feet', 'flip': True},
    'elephant': {'foe': 'elephant', 'w': 120, 'hang': 'feet'},
}


def main():
    foes = json.load(open(os.path.join(DST, '..', 'painted', 'foes.json')))
    foes_img = Image.open(os.path.join(DST, '..', 'painted', 'foes.webp')).convert('RGBA')
    cache = {}
    for kind, s in MOUNTS.items():
        if 'foe' in s:
            m = foes[s['foe']]
            fig = foes_img.crop((m['x'], m['y'], m['x'] + m['w'], m['y'] + m['h']))
        else:
            fig = cut_local(cache, s)
        if s.get('flip'):
            fig = fig.transpose(Image.FLIP_LEFT_RIGHT)  # the sheets draw them facing left; rides face right
        W = round(s['w'] * SS)
        k = min(W / fig.width, 1.0 * 1.6)
        W, H = round(fig.width * k), round(fig.height * k)
        body = fig.resize((W, H), Image.LANCZOS)
        ay = H * 0.97 if s['hang'] == 'feet' else H / 2
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        atlas.alpha_composite(body, (0, 0))
        atlas.save(os.path.join(DST, kind + '.webp'), 'WEBP', quality=90, method=6)
        json.dump(
            {'ss': SS, 'parts': {'body': {'x': 0, 'y': 0, 'w': W, 'h': H, 'ax': round(W / 2, 2), 'ay': round(ay, 2)}}},
            open(os.path.join(DST, kind + '.json'), 'w'),
            separators=(',', ':'),
        )
        print(kind, round(W / SS), 'x', round(H / SS), 'world px')


if __name__ == '__main__':
    main()
