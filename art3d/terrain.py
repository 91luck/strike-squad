"""
The saga stages' ground: per art style a seamless rock/earth texture (`fill`, 256x256 world px, tiling both ways) and
a surface strip (`top`, 256 world px wide, tiling sideways: grass, snow, sand, a marble edge, a crust of lava…) that
lies along the top of the ground and overhangs it.

Built as height fields and lit, like a 3D render seen from the front: periodic noise, strata, cracks and cut blocks
make the height; its normals are lit by a key light from the upper left, cavities are darkened (ambient occlusion),
and lava, moss or gold glow where they should. Everything is periodic over 256 world px, so the ground runs on
without a seam or a repeating tile pattern (the game samples it by world position).

    python3 art3d/terrain.py [--dst client/src/assets/terrain]
"""

import argparse
import os

import numpy as np

PI2 = 2 * np.pi
from PIL import Image, ImageDraw, ImageFilter

S = 512  # texture size in pixels (2 per world px: 256 world px)
TOP_H = 56  # surface strip height in pixels (28 world px: 12 above the ground line, 16 into it)
LIP = 24  # pixels above the ground line in the strip
rng0 = np.random.default_rng(7)


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


# ------------------------------------------------------------------ periodic noise


def vnoise(w, h, cells_x, cells_y, seed):
    """Smooth value noise on a w x h grid, periodic in both directions."""
    r = np.random.default_rng(seed).random((cells_y, cells_x)).astype(np.float32)
    ys = np.arange(h) / h * cells_y
    xs = np.arange(w) / w * cells_x
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y1 = (y0 + 1) % cells_y
    x1 = (x0 + 1) % cells_x
    y0 %= cells_y
    x0 %= cells_x
    a = r[y0][:, x0] * (1 - fx) + r[y0][:, x1] * fx
    b = r[y1][:, x0] * (1 - fx) + r[y1][:, x1] * fx
    return a * (1 - fy)[:, None] + b * fy[:, None]


def fbm(w, h, cx, cy, seed, oct=5, gain=0.5):
    s = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(oct):
        s += amp * vnoise(w, h, cx * 2**o, cy * 2**o, seed + o * 31)
        tot += amp
        amp *= gain
    return s / tot


def worley(w, h, cells, seed):
    """Distance to the nearest and second-nearest feature point (periodic): cracks and cobbles."""
    r = np.random.default_rng(seed)
    pts = (np.stack(np.meshgrid(np.arange(cells), np.arange(cells)), -1) + r.random((cells, cells, 2))).reshape(-1, 2)
    pts = pts / cells
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w
    v = yy / h
    d1 = np.full((h, w), 9.0, np.float32)
    d2 = np.full((h, w), 9.0, np.float32)
    for px, py in pts:
        dx = np.abs(u - px)
        dx = np.minimum(dx, 1 - dx)
        dy = np.abs(v - py)
        dy = np.minimum(dy, 1 - dy)
        d = np.sqrt(dx * dx + dy * dy)
        m = d < d1
        d2 = np.where(m, d1, np.minimum(d2, d))
        d1 = np.where(m, d, d1)
    return d1 * cells, d2 * cells


def blocks(w, h, bw, bh, bevel, seed, offset=0.5):
    """Cut stone blocks in running bond: height 1 inside a block, bevelled to 0 at the joints; and a per-block id."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    row = np.floor(yy / bh)
    xs = xx + (row % 2) * bw * offset
    col = np.floor(xs / bw) % (w // bw)
    lx = xs % bw
    ly = yy % bh
    d = np.minimum(np.minimum(lx, bw - lx), np.minimum(ly, bh - ly))
    height = np.clip(d / bevel, 0, 1)
    rid = (np.random.default_rng(seed).random((int(h // bh) + 1, int(w // bw) + 1)))[row.astype(int), col.astype(int)]
    return height, rid.astype(np.float32)


def blur_wrap(a, r):
    """Gaussian-like blur with wrap-around (three box passes each way, keeps the texture seamless)."""
    k = max(1, int(round(r)))
    out = a.astype(np.float32)
    for _ in range(3):
        for ax in (0, 1):
            acc = np.zeros_like(out)
            for d in range(-k, k + 1):
                acc += np.roll(out, d, ax)
            out = acc / (2 * k + 1)
    return out


# ------------------------------------------------------------------ lighting


def light(height, strength=6.0, ao=0.6, ao_r=6):
    """Lambert shading of a height field (light from the upper left, a little in front) with cavity darkening."""
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.stack([-gx, -gy, np.ones_like(height)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array([-0.55, -0.6, 0.58])
    L /= np.linalg.norm(L)
    diff = np.clip((n * L).sum(-1), 0, 1)
    cav = np.clip((height - blur_wrap(height, ao_r)) * 4 + 0.5, 0, 1)
    shade = 0.38 + 0.8 * diff
    return shade * (1 - ao + ao * cav)


def ramp(t, colors):
    """Maps 0..1 through a list of hex colours."""
    cs = np.array([hexc(c) for c in colors])
    t = np.clip(t, 0, 1) * (len(cs) - 1)
    i = np.minimum(np.floor(t).astype(int), len(cs) - 2)
    f = (t - i)[..., None]
    return cs[i] * (1 - f) + cs[i + 1] * f


def to_img(rgb, alpha=None):
    rgb = np.clip(rgb, 0, 1)
    if alpha is None:
        alpha = np.ones(rgb.shape[:2], np.float32)
    a = np.concatenate([rgb, np.clip(alpha, 0, 1)[..., None]], -1)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA')


# ------------------------------------------------------------------ fills


def fill_earth(seed, cols, pebble='#8a7a66', roots=None):
    """Packed earth with pebbles and stones, a few roots."""
    n = fbm(S, S, 4, 4, seed)
    d1, d2 = worley(S, S, 10, seed + 1)
    stones = np.clip((0.3 - d1) / 0.12, 0, 1) ** 0.6 * np.clip((vnoise(S, S, 10, 10, seed + 2) - 0.55) / 0.1, 0, 1)
    h = n * 0.6 + stones * 0.8 + fbm(S, S, 32, 32, seed + 3, 3) * 0.15
    base = ramp(n + fbm(S, S, 16, 16, seed + 5, 3) * 0.3 - 0.15, cols)
    base = np.where(stones[..., None] > 0.2, ramp(stones * 0.4 + n * 0.4, ['#3a2e24', pebble]), base)
    rgb = base * light(h, 5)[..., None]
    if roots:
        rr = np.abs(vnoise(S, S, 3, 12, seed + 9) - 0.5) < 0.012
        rgb = np.where(rr[..., None], hexc(roots) * light(h + 0.3, 5)[..., None], rgb)
    return rgb


def fill_strata(seed, cols, step=40):
    """Layered sandstone or rock: horizontal beds, wavy, eroded, with cracks."""
    yy = np.mgrid[0:S, 0:S][0].astype(np.float32)
    warp = fbm(S, S, 3, 3, seed) * 40
    beds = ((yy + warp) / step) % 1
    bed_id = np.floor((yy + warp) / step)
    n = fbm(S, S, 8, 8, seed + 1)
    d1, d2 = worley(S, S, 7, seed + 2)
    crack = np.clip(1 - (d2 - d1) / 0.05, 0, 1)
    h = np.sin(beds * np.pi) * 0.35 + n * 0.5 - crack * 0.5
    t = (np.sin(bed_id * 2.1) * 0.5 + 0.5) * 0.6 + n * 0.4
    rgb = ramp(t, cols) * light(h, 5)[..., None]
    return rgb


def fill_rock(seed, cols, glow=None, glow_k=0.0, moss=None):
    """Broken rock: big faceted cells, deep cracks; glowing lava or moss in the cracks."""
    d1, d2 = worley(S, S, 6, seed)
    e = d2 - d1
    n = fbm(S, S, 8, 8, seed + 1)
    h = np.clip(e * 3, 0, 1) * 0.8 + n * 0.4
    rgb = ramp(n * 0.7 + d1 * 0.4, cols) * light(h, 7, ao=0.7)[..., None]
    crack = np.clip(1 - e / 0.06, 0, 1) ** 2
    if glow:
        g = crack * glow_k * (0.6 + 0.4 * vnoise(S, S, 4, 4, seed + 4))
        rgb = rgb * (1 - g[..., None] * 0.6) + hexc(glow) * g[..., None] * 1.2
    if moss:
        m = (fbm(S, S, 6, 6, seed + 7) > 0.58) * np.clip(1 - e / 0.15, 0, 1)
        rgb = rgb * (1 - m[..., None] * 0.7) + hexc(moss) * m[..., None] * 0.8
    return rgb


def fill_blocks(seed, cols, joint='#1a1410', bw=128, bh=64, vein=None, trim=None):
    """Cut stone: marble or carved golden blocks in running bond, each a little different, veins across."""
    hgt, rid = blocks(S, S, bw, bh, 7, seed)
    n = fbm(S, S, 6, 6, seed + 1)
    t = rid * 0.5 + n * 0.5
    h = hgt * 0.6 + n * 0.15
    rgb = ramp(t, cols)
    if vein:
        v = np.abs(fbm(S, S, 3, 3, seed + 3) - 0.5) < 0.012
        rgb = np.where(v[..., None], rgb * 0.5 + hexc(vein) * 0.5, rgb)
    rgb = rgb * light(h, 5, ao=0.5)[..., None]
    rgb = np.where((hgt < 0.15)[..., None], hexc(joint) * 0.8 + rgb * 0.2, rgb)
    if trim:
        # a carved band along the middle of each block
        yy = np.mgrid[0:S, 0:S][0] % bh
        band = (np.abs(yy - bh / 2) < 3) & (hgt > 0.5)
        rgb = np.where(band[..., None], hexc(trim) * light(h + 0.2, 5)[..., None], rgb)
    return rgb


# ------------------------------------------------------------------ surfaces (the top strip)


def top_strip(kind, seed, c):
    """The surface along the top of the ground: `c` the colours. Alpha below the turf so the fill shows through."""
    W, Hh = S, TOP_H
    r = np.random.default_rng(seed)
    img = Image.new('RGBA', (W * 3, Hh), (0, 0, 0, 0))  # drawn 3 wide and the middle third kept: seamless sideways
    d0 = ImageDraw.Draw(img)
    top = LIP  # the ground line

    class Tri:
        """Draws everything three times, one strip-width apart, so what crosses an edge comes back on the other."""

        def __getattr__(self, name):
            f = getattr(d0, name)

            def g(pts, *a, **k):
                for off in (-W, 0, W):
                    if isinstance(pts[0], tuple):
                        f([(x + off, y) for x, y in pts], *a, **k)
                    else:
                        f([pts[0] + off, pts[1], pts[2] + off, pts[3]], *a, **k)

            return g

    d = Tri()
    if kind in ('grass', 'drygrass', 'moss'):
        # a turf band, then blades of grass (moss: fat glowing tufts)
        band = Image.new('RGBA', (W * 3, Hh), (0, 0, 0, 0))
        bd = ImageDraw.Draw(band)
        for x in range(0, W * 3, 2):  # (periodic in W already)
            yy = top + 6 + 3 * np.sin(PI2 * 22 * x / W + seed) + 2 * np.sin(PI2 * 73 * x / W)
            bd.line([(x, top - 2), (x, yy)], fill=c['turf'] + (255,), width=2)
        img.alpha_composite(band)
        nb = 1100 if kind != 'moss' else 260
        for _ in range(nb):
            x = r.uniform(W, W * 2)
            hgt = r.uniform(8, 22) if kind != 'moss' else r.uniform(5, 10)
            lean = r.uniform(-6, 6)
            col = c['blade'][r.integers(len(c['blade']))]
            base = top + r.uniform(1, 5)
            if kind == 'moss':
                d.ellipse([x - 5, base - hgt, x + 5, base], fill=col + (255,))
            else:
                d.polygon([(x - 1.6, base), (x + lean, base - hgt), (x + 1.6, base)], fill=col + (255,))
                if kind == 'grass' and c.get('burnt', True) and r.random() < 0.18:  # burnt tips (the forest is on fire)
                    d.line([(x + lean * 0.8, base - hgt * 0.8), (x + lean, base - hgt)], fill=(255, 140, 40, 255), width=2)
        for _ in range(40 if kind != 'drygrass' else 70):
            x = r.uniform(W, W * 2)
            d.ellipse([x - 2, top - 3, x + 2, top + 1], fill=c.get('flower', (240, 200, 80)) + (255,))
    elif kind in ('snow', 'sand', 'ash'):
        # a soft cap: a wavy rounded crust over the edge, drips or drifts hanging off it
        for x in range(0, W * 3):
            y0 = top - 5 - 3 * np.sin(PI2 * 16 * x / W + seed) - 0.6 * np.sin(PI2 * 57 * x / W + 1)
            y1 = top + 9 + 3 * np.sin(PI2 * 12 * x / W)
            if kind == 'snow' and np.sin(PI2 * 39 * x / W + seed) > 0.85:
                y1 += 8 * (np.sin(PI2 * 39 * x / W + seed) - 0.85) / 0.15
            d0.line([(x, y0), (x, y1)], fill=c['cap'] + (255,))
        if kind == 'ash':
            for _ in range(120):
                x = r.uniform(W, W * 2)
                y = top + r.uniform(-4, 8)
                d.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=(255, 140, 40, 255) if r.random() < 0.3 else (60, 56, 52, 255))
    elif kind in ('marble', 'goldedge', 'crust'):
        # a cut edge: a rounded lip moulding with a bright top face (or a crust of cooling lava)
        for x in range(0, W * 3):
            d0.line([(x, top - 4), (x, top + 10)], fill=c['cap'] + (255,))
        if kind == 'crust' and c.get('lava', True):
            for _ in range(60):
                x = r.uniform(W, W * 2)
                d.line([(x, top - 2), (x + r.uniform(-4, 4), top + r.uniform(6, 14))], fill=(255, 120, 30, 255), width=2)
    a = np.asarray(img).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    # light the strip from its own alpha as a height field (rounded, lit from above-left)
    hgt = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))).astype(np.float32) / 255
    gx = np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)
    gy = np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)
    shade = np.clip(0.8 - gx * 1.6 - gy * 2.2, 0.35, 1.5)
    rgb = rgb * shade[..., None]
    # a darker underside where the surface meets the earth, a contact shadow just below it
    yy = np.mgrid[0:Hh, 0:W * 3][0].astype(np.float32)
    rgb = rgb * (1 - np.clip((yy - top) / 18, 0, 0.45))[..., None]
    shadow = np.clip(1 - np.abs(yy - top - 12) / 6, 0, 1) * 0.35 * (al < 0.5)
    out = np.concatenate([rgb, np.maximum(al, shadow)[..., None]], -1)
    out[..., :3] = np.where((al < 0.5)[..., None], 0, out[..., :3])
    out = out[:, W : W * 2]
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def rgb8(h):
    v = hexc(h)
    return tuple(int(x * 255) for x in v)


# ------------------------------------------------------------------ the stages


def recipes():
    return {
        'vana': (
            lambda: fill_earth(11, ['#2e1d10', '#4a2e18', '#6b4423'], roots='#3a2412'),
            ('grass', {'turf': rgb8('#2f4a12'), 'blade': [rgb8('#4d7c0f'), rgb8('#65a30d'), rgb8('#3f6212'), rgb8('#84cc16')], 'flower': rgb8('#fb923c')}),
        ),
        'inferno': (
            lambda: fill_rock(21, ['#1a0b08', '#2e1410', '#4a2016'], glow='#ff5a0a', glow_k=1.0),
            ('crust', {'cap': rgb8('#3a1a14')}),
        ),
        'sagar': (
            lambda: fill_strata(31, ['#6b5638', '#8a7350', '#a8916a', '#c9b48a']),
            ('sand', {'cap': rgb8('#e3d2a6')}),
        ),
        'shikhar': (
            lambda: fill_rock(41, ['#2c2f48', '#454a6b', '#6a6f8f']),
            ('snow', {'cap': rgb8('#eef2ff')}),
        ),
        'naglok': (
            lambda: fill_rock(51, ['#0a1412', '#13221f', '#1f3330'], moss='#14b8a6'),
            ('moss', {'turf': rgb8('#0b3b35'), 'blade': [rgb8('#0d9488'), rgb8('#14b8a6'), rgb8('#2dd4bf')], 'flower': rgb8('#99f6e4')}),
        ),
        'maya': (
            lambda: fill_blocks(61, ['#8a6426', '#b98a3a', '#d6a956'], joint='#3a2410', vein='#fff3c4'),
            ('goldedge', {'cap': rgb8('#fcd34d')}),
        ),
        'bhasm': (
            lambda: fill_rock(71, ['#24211f', '#33302d', '#4a4541'], glow='#ff6a1a', glow_k=0.5),
            ('ash', {'cap': rgb8('#9a948d')}),
        ),
        'ranbhoomi': (
            lambda: fill_earth(81, ['#4a3420', '#6b4a2c', '#7a5a36'], pebble='#8a7a66'),
            ('drygrass', {'turf': rgb8('#5a4026'), 'blade': [rgb8('#b08850'), rgb8('#c9a46a'), rgb8('#8a6a3a'), rgb8('#d9b77a')], 'flower': rgb8('#b91c1c')}),
        ),
        'chakra': (
            lambda: fill_blocks(91, ['#5a3f12', '#7a5718', '#9a7020'], joint='#2a1c08', bw=96, bh=48, trim='#e0a530'),
            ('goldedge', {'cap': rgb8('#d9a520')}),
        ),
        'dwand': (
            lambda: fill_blocks(101, ['#94a3b8', '#cbd5e1', '#e2e8f0'], joint='#334155', vein='#64748b'),
            ('marble', {'cap': rgb8('#f1f5f9')}),
        ),
        'mahayuddh': (
            lambda: fill_rock(111, ['#160a0c', '#2a1418', '#3b1f1c'], glow='#fbbf24', glow_k=0.8),
            ('crust', {'cap': rgb8('#3b1f1c')}),
        ),
        # the classic missions
        'jungle': (
            lambda: fill_earth(121, ['#2e2414', '#4a3820', '#5e4a2a'], roots='#3a2a14'),
            ('grass', {'turf': rgb8('#24501a'), 'blade': [rgb8('#3f8a2a'), rgb8('#4d9a2f'), rgb8('#2f6b1f'), rgb8('#65b13a')], 'flower': rgb8('#f472b6'), 'burnt': False}),
        ),
        'river': (
            lambda: fill_strata(131, ['#3a3426', '#4e4632', '#625a40', '#76704e']),
            ('grass', {'turf': rgb8('#2f5a1a'), 'blade': [rgb8('#4d8a2a'), rgb8('#5a9a32'), rgb8('#3a7020')], 'flower': rgb8('#fde047'), 'burnt': False}),
        ),
        'towers': (
            lambda: fill_blocks(141, ['#2f2a36', '#3a3442', '#4a4252'], joint='#16121a', bw=128, bh=48),
            ('crust', {'cap': rgb8('#5a5262'), 'lava': False}),
        ),
        'fortress': (
            lambda: fill_blocks(151, ['#3a2228', '#4a2c32', '#5a363c'], joint='#1a0c10', bw=96, bh=48),
            ('crust', {'cap': rgb8('#6a4048'), 'lava': False}),
        ),
        'desert': (
            lambda: fill_strata(161, ['#a07a48', '#b88e58', '#c8a06a', '#d8b47e']),
            ('sand', {'cap': rgb8('#ecd2a0')}),
        ),
        'tomb': (
            lambda: fill_blocks(171, ['#7a5030', '#8a5e3a', '#a07048'], joint='#3a2214', vein='#e0b040'),
            ('goldedge', {'cap': rgb8('#d8a850')}),
        ),
        'snow': (
            lambda: fill_rock(181, ['#4a5468', '#5e6a80', '#76829a']),
            ('snow', {'cap': rgb8('#f8fafc')}),
        ),
        'frosthall': (
            lambda: fill_rock(191, ['#0e2230', '#16303e', '#1f4050'], glow='#67e8f9', glow_k=0.4),
            ('snow', {'cap': rgb8('#bae6fd')}),
        ),
        'marble': (
            lambda: fill_blocks(201, ['#a8a195', '#c4beb2', '#d8d4ca'], joint='#5a5448', vein='#8a8478'),
            ('marble', {'cap': rgb8('#ece8de')}),
        ),
        'temple': (
            lambda: fill_blocks(211, ['#3a2a5a', '#4a3a6a', '#5a4a7a'], joint='#1a1030', trim='#f5b82e'),
            ('goldedge', {'cap': rgb8('#f5b82e')}),
        ),
        'hellgate': (
            lambda: fill_rock(221, ['#160404', '#2a0808', '#3a0c0c'], glow='#ff3a1a', glow_k=0.9),
            ('crust', {'cap': rgb8('#3a0c0c')}),
        ),
        'space': (
            lambda: fill_rock(231, ['#16142a', '#22203a', '#2e2c4a'], glow='#22d3ee', glow_k=0.35),
            ('ash', {'cap': rgb8('#4a4868')}),
        ),
        'hive': (
            lambda: fill_rock(241, ['#061810', '#0c2418', '#123020'], moss='#4ade80'),
            ('moss', {'turf': rgb8('#0b3b20'), 'blade': [rgb8('#16a34a'), rgb8('#22c55e'), rgb8('#4ade80')], 'flower': rgb8('#bbf7d0')}),
        ),
    }


# ------------------------------------------------------------------ platforms (one-way ledges)

PH = 48  # platform strip height in px (24 world: a 16 px deck and 8 px of what hangs under it)
DECK = 32


def plat_strip(kind, seed, c):
    """A ledge 256 world px long, seamless sideways: the deck lit as a solid (rounded log, bevelled slab, planks…),
    with what hangs under it (icicles, glowing fungus, gear teeth, rope) in the 8 px below."""
    W = S
    yy, xx = np.mgrid[0:PH, 0:W].astype(np.float32)
    v = yy / DECK  # 0 at the top of the deck, 1 at its underside
    deck = v <= 1
    n = fbm(W, PH, 16, 2, seed, 4)
    alpha = deck.astype(np.float32)
    base = hexc(c[0])
    hi = hexc(c[1])
    lo = hexc(c[2])
    if kind == 'log':
        prof = np.cos((v - 0.4) * np.pi * 0.9)  # round in section, lit from above
        grain = fbm(W, PH, 24, 1, seed + 1, 4)
        col = ramp(grain * 0.8 + n * 0.2, [c[2], c[0], c[1]])
        rgb = col * (0.35 + 0.75 * np.clip(prof, 0, 1))[..., None]
        if len(c) > 3:
            d1, d2 = worley(W, PH, 12, seed + 2)
            crack = np.clip(1 - (d2 - d1) / 0.08, 0, 1) * (fbm(W, PH, 4, 1, seed + 3, 2) > 0.55)
            rgb = rgb * (1 - crack[..., None] * 0.5) + hexc(c[3]) * crack[..., None]
    elif kind in ('planks', 'beam', 'slab', 'bone'):
        joint = (xx % (128 if kind != 'planks' else 64)) < 2
        grain = fbm(W, PH, 32 if kind == 'planks' else 8, 1 if kind == 'planks' else 2, seed + 1, 4)
        col = ramp(grain * 0.7 + n * 0.3, [c[2], c[0], c[1]])
        bevel = np.where(v < 0.12, 1.3, np.where(v > 0.85, 0.55, 1.0))
        rgb = col * bevel[..., None] * (1 - 0.25 * v)[..., None]
        rgb = np.where(joint[..., None], lo * 0.6, rgb)
        if kind == 'beam' and len(c) > 3:
            band = (np.abs(v - 0.5) < 0.1)
            rgb = np.where(band[..., None], hexc(c[3]) * (1.1 - 0.4 * np.abs(v - 0.5) * 5)[..., None], rgb)
        if kind == 'bone' and len(c) > 3:
            d1, d2 = worley(W, PH, 10, seed + 2)
            crack = np.clip(1 - (d2 - d1) / 0.07, 0, 1)
            rgb = rgb * (1 - crack[..., None] * 0.6) + hexc(c[3]) * crack[..., None] * 0.9
    elif kind == 'shelf':
        prof = np.clip(1 - ((v - 0.35) / 0.65) ** 2, 0, 1)
        rgb = ramp(n, [c[2], c[0], c[1]]) * (0.4 + 0.7 * prof)[..., None]
    elif kind == 'crystal':
        prof = 1 - np.abs(v - 0.5) * 1.4
        rgb = ramp(fbm(W, PH, 6, 1, seed + 1, 3), [c[2], c[0], c[1]]) * (0.7 + 0.5 * prof)[..., None]
        streak = ((xx * 0.3 + yy * 2 + 40 * n) % 64) < 4
        rgb = np.where(streak[..., None], rgb * 0.6 + 0.45, rgb)
        alpha = alpha * 0.85
        rim = (v < 0.1) | ((v > 0.9) & deck)
        rgb = np.where(rim[..., None], hexc(c[3]) * (1.2 - v * 0.5)[..., None], rgb)
        alpha = np.where(rim, 1.0, alpha)
    elif kind == 'rail':
        bevel = np.where(v < 0.15, 1.4, np.where(v > 0.8, 0.5, 1.0))
        rgb = ramp(n, [c[2], c[0], c[1]]) * bevel[..., None]
        rivet = ((xx % 32) - 16) ** 2 + ((yy - 16) ** 2) < 12
        rgb = np.where(rivet[..., None], hi * 1.1, rgb)
    else:
        rgb = np.broadcast_to(base, (PH, W, 3)).copy()
    rgb = np.where(deck[..., None], rgb, 0)
    # what hangs below the deck
    hang = np.zeros((PH, W), np.float32)
    hcol = np.zeros((PH, W, 3), np.float32)
    below = (yy - DECK)
    r = np.random.default_rng(seed + 5)
    if kind == 'slab':  # icicles
        for _ in range(26):
            x0 = r.uniform(0, W)
            ln = r.uniform(6, 16)
            w = r.uniform(3, 6)
            for off in (-W, 0, W):
                dx = np.abs(xx - x0 - off)
                m = (below >= 0) & (below < ln) & (dx < w * (1 - below / ln))
                hang = np.maximum(hang, m * 0.9)
        hcol[:] = hexc('#dbeafe')
    elif kind == 'shelf':  # glowing fungus gills and drips
        for _ in range(30):
            x0 = r.uniform(0, W)
            ln = r.uniform(3, 12)
            for off in (-W, 0, W):
                m = (below >= 0) & (below < ln) & (np.abs(xx - x0 - off) < 2)
                hang = np.maximum(hang, m.astype(np.float32))
        hcol[:] = hexc(c[3])
    elif kind == 'rail':  # gear teeth
        tooth = ((xx % 16) < 8) & (below >= 0) & (below < 6)
        hang = tooth.astype(np.float32)
        hcol[:] = lo * 0.9
    elif kind == 'planks' and len(c) > 3:  # rope lashings hanging under the joints
        for x0 in range(0, W, 64):
            for off in (-W, 0, W):
                m = (np.abs(xx - x0 - 32 - off) < 2) & (below >= 0) & (below < 8)
                hang = np.maximum(hang, m.astype(np.float32))
        hcol[:] = hexc(c[3])
    # under every ledge, a soft shadow
    shadow = np.clip(1 - below / 10, 0, 1) * (below >= 0) * 0.35
    rgb = np.where((hang > 0)[..., None] & ~deck[..., None], hcol, rgb)
    alpha = np.where(deck, alpha, np.maximum(hang, shadow))
    rgb = np.where(((hang == 0) & ~deck)[..., None], 0, rgb)
    return to_img(rgb, alpha)


PLATS = {
    'vana': ('log', ['#3a2414', '#5b3a24', '#1a0f08', '#ff7a1a']),
    'inferno': ('bone', ['#2a1410', '#4a2a20', '#140806', '#ff5a0a']),
    'sagar': ('planks', ['#7a6040', '#a08458', '#4a3622', '#c9b48a']),
    'shikhar': ('slab', ['#5a5f80', '#8a90b0', '#33364f']),
    'naglok': ('shelf', ['#145a52', '#2dd4bf', '#06302a', '#5eead4']),
    'maya': ('crystal', ['#d8b4fe', '#f5d0fe', '#9333ea', '#fbbf24']),
    'bhasm': ('bone', ['#5a5450', '#8a837c', '#2a2624', '#ff6a1a']),
    'ranbhoomi': ('planks', ['#6b4423', '#8a5a30', '#3e2714', '#9ca3af']),
    'chakra': ('rail', ['#b8860b', '#fcd34d', '#5a3f12']),
    'dwand': ('beam', ['#cbd5e1', '#f1f5f9', '#94a3b8', '#b08d57']),
    'mahayuddh': ('beam', ['#7f1d1d', '#b91c1c', '#3b0a0a', '#fbbf24']),
    'jungle': ('log', ['#3a2a14', '#5b4424', '#1a1208', '#4d7c0f']),
    'river': ('planks', ['#6b5034', '#8a6a44', '#3e2c1a', '#a8916a']),
    'towers': ('rail', ['#4a4452', '#7a7488', '#22202a']),
    'fortress': ('beam', ['#4a2c32', '#6a4048', '#22121a', '#a3392a']),
    'desert': ('planks', ['#8a6a40', '#a8845a', '#5a4428', '#d8b47e']),
    'tomb': ('beam', ['#8a5e3a', '#a07048', '#4a2c18', '#e0b040']),
    'snow': ('slab', ['#76829a', '#a8b4c8', '#4a5468']),
    'frosthall': ('crystal', ['#7dd3fc', '#bae6fd', '#0e7490', '#e0f2fe']),
    'marble': ('slab', ['#c4beb2', '#ece8de', '#8a8478']),
    'temple': ('beam', ['#4a3a6a', '#6a5a8a', '#22183a', '#f5b82e']),
    'hellgate': ('bone', ['#3a0c0c', '#5a1a18', '#160404', '#ff3a1a']),
    'space': ('rail', ['#3a3a5a', '#6a6a8a', '#16162a']),
    'hive': ('shelf', ['#123020', '#22c55e', '#061810', '#86efac']),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dst', default='client/src/assets/terrain')
    ap.add_argument('--only')
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)
    total = 0
    for key, (fill, (kind, cols)) in recipes().items():
        if a.only and key != a.only:
            continue
        f = to_img(fill())
        f.save(os.path.join(a.dst, f'{key}-fill.webp'), 'WEBP', quality=82, method=6)
        t = top_strip(kind, len(key) * 13, cols)
        t.save(os.path.join(a.dst, f'{key}-top.webp'), 'WEBP', quality=88, method=6)
        pk, pc = PLATS[key]
        plat_strip(pk, len(key) * 17, pc).save(os.path.join(a.dst, f'{key}-plat.webp'), 'WEBP', quality=88, method=6)
        sz = sum(os.path.getsize(os.path.join(a.dst, f'{key}-{p}.webp')) for p in ('fill', 'top', 'plat'))
        total += sz
        print(f'{key:10s} {sz // 1024} KB', flush=True)
    print('total', total // 1024, 'KB')


if __name__ == '__main__':
    main()
