"""
Cuts the weapons out of the weapon sheet (art3d/ai/weapons.png, parchment tiles) with GrabCut and pastes each onto a flat
grey sheet (art3d/ai/weapons_flat.png) at the same place, so ai_parts.py can cut them like any piece (hero_*.json
`sheets.wpn`). Add a weapon: put its box in WEAPONS.

    python3 art3d/ai_weapons.py
"""

import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_foes import cut_local  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
FLAT = (150, 150, 150)
WEAPONS = {
    'xbow': [335, 648, 540, 775],
    'rifle': [615, 648, 895, 760],
    'chakram': [28, 655, 190, 790],
}


def main():
    sheet = Image.open(os.path.join(HERE, 'ai', 'weapons.png')).convert('RGB')
    out = Image.new('RGB', sheet.size, FLAT)
    cache = {}
    for name, b in WEAPONS.items():
        extra = b[4] if len(b) > 4 else {}
        b = b[:4]
        s = {'sheet': 'weapons.png', 'box': b, 'grabcut': 1, 'minfrac': 0.5, 'ring': 3, 'notrim': 1, 'nofill': 1}
        if 'tol' in extra:
            s = {'sheet': 'weapons.png', 'box': b, 'tol': extra['tol'], 'minfrac': 0.3, 'notrim': 1}
        fig = cut_local(cache, s)
        # grey parchment seen through the weapon (a trigger guard, a disc's gaps) is background too
        rgb = np.array(fig.convert('RGB')).astype(int)
        al = np.array(fig.getchannel('A')) > 128
        bgc = np.median(np.concatenate([rgb[:6, :6].reshape(-1, 3), rgb[-6:, -6:].reshape(-1, 3)]), axis=0)
        near = (np.abs(rgb - bgc).sum(2) < 40) & al
        lab, n = ndi.label(near)
        for i, sz in enumerate(ndi.sum(near, lab, range(1, n + 1))):
            if sz >= 25:
                al[lab == i + 1] = False
        fig.putalpha(Image.fromarray((al * 255).astype(np.uint8)))
        out.paste(fig.convert('RGB'), (b[0], b[1]), fig.getchannel('A'))
    out.save(os.path.join(HERE, 'ai', 'weapons_flat.png'))
    print('weapons_flat.png', len(WEAPONS), 'weapons')


if __name__ == '__main__':
    main()
