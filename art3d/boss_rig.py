"""
Saga bosses in 3D, rendered as parts (Blender, headless `bpy`).

A boss in the game is animated by code: arms swing to the angle of the attack being wound up, heads are cut one by
one, a mace is raised and brought down, a body crouches. So each boss is built here as separate parts in the game's
own world-pixel coordinates (feet at the origin, y up), and every part is rendered on its own with the pivot it turns
about:

    body    the figure without its moving parts (legs, waist cloth, torso, head, crown; a throne or a gate behind)
    arm     one arm hanging straight down from the shoulder (the pivot) to the fist; the game turns it to point at
            where the hand should be and stretches it to the length it needs
    ...     the boss's own extras: Saptashir's crowned head and its cut stump, Suryakavach's mace and gate,
            Jodasur's boulder

The game's draw code (client/src/game/boss3d.ts) lays the parts where its 2D drawing used to put the same shapes,
so every attack still reads exactly as before, and keeps its own glows, flames and telegraphs on top.

    python3 art3d/boss_rig.py --boss saptashir [--samples 48]
    python3 art3d/boss_rig.py --all
writes art3d/out/boss/<boss>/<part>.png at 2x plus meta.json (pivot of each part, arm lengths). art3d/pack_boss.py
packs them for the game.
"""

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import hero_rig as HR  # noqa: E402

U = 0.02  # Blender units per world pixel
SS = 2  # rendered at 2x world pixels
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'boss')


def P(x, y, d=0.0):
    """World pixels (x right, y up from the feet, d away from the viewer) to Blender units."""
    return Vector((x * U, d * U, y * U))


# ------------------------------------------------------------------ scene


def scene(samples):
    sc = HR.reset()
    HR.MATS.clear()
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError:
        pass
    sc.render.filter_size = 1.0
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.rotation_euler = (math.radians(90), 0, 0)

    def sun(name, energy, color, rot, angle=8):
        L = bpy.data.lights.new(name, 'SUN')
        L.energy = energy
        L.color = color
        L.angle = math.radians(angle)
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        o.rotation_euler = tuple(math.radians(a) for a in rot)

    sun('key', 3.6, (1.0, 0.96, 0.9), (50, -35, -30))
    sun('rim', 5.0, (1.0, 0.86, 0.7), (-60, 30, 160), 4)
    sun('fill', 0.9, (0.72, 0.8, 1.0), (110, 0, 20))
    return sc, cam


class Boss:
    def __init__(self, name):
        self.name = name
        self.parts = {}  # part -> list of objects
        self.pivot = {}  # part -> (x, y) world px
        self.extra = {}  # part -> extra meta (arm length…)
        self.cur = None

    def part(self, name, pivot=(0, 0), **extra):
        self.cur = name
        self.parts.setdefault(name, [])
        self.pivot[name] = pivot
        if extra:
            self.extra[name] = extra
        return self

    def add(self, o):
        self.parts[self.cur].append(o)
        return o


B: Boss = None  # the boss being built


def M(name, hexc, rough=0.55, metal=0.0, emit=None, strength=None):
    m = HR.mat(name, hexc, rough, metal, emit)
    if emit and strength is not None:
        m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = strength
    return m


def ball(c, r, m, scale=(1, 1, 1), seg=24):
    """`scale` is (across, up, deep) like every size here."""
    sx, sy, sd = scale
    return B.add(HR.ball('b', r * U, P(*c), m, scale=(sx, sd, sy), seg=seg))


def box(c, size, m, bevel=1.0, rot=(0, 0, 0)):
    """`size` (across, up, deep) in world px."""
    w, h, d = size
    return B.add(HR.box('x', (w * U, d * U, h * U), P(*c), m, bevel=bevel * U, rot=rot))


def limb(a, b, r, m, r2=None):
    return B.add(HR.tube('t', r * U, P(*a), P(*b), m, r2=None if r2 is None else r2 * U))


def cone(c, r1, r2, h, m, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=r1 * U, radius2=r2 * U, depth=h * U, location=P(*c), rotation=rot, vertices=verts)
    o = bpy.context.object
    return B.add(HR.finish(o, m, bevel=0.3 * U))


def cyl(c, r, h, m, rot=(0, 0, 0), verts=24, bevel=0.6):
    bpy.ops.mesh.primitive_cylinder_add(radius=r * U, depth=h * U, location=P(*c), rotation=rot, vertices=verts)
    o = bpy.context.object
    return B.add(HR.finish(o, m, bevel=bevel * U))


def torus(c, R, r, m, rot=(math.radians(90), 0, 0), arc=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R * U, minor_radius=r * U, location=P(*c), rotation=rot, major_segments=48, minor_segments=10)
    o = bpy.context.object
    if arc:
        import bmesh

        bm = bmesh.new()
        bm.from_mesh(o.data)
        a0, a1 = arc
        kill = [v for v in bm.verts if not (a0 <= math.atan2(v.co.y, v.co.x) <= a1)]
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        bm.to_mesh(o.data)
        bm.free()
    return B.add(HR.finish(o, m))


def trunk(y0, y1, w0, w1, d0, d1, m, x=0.0, z=0.0, sub=2):
    """A tapered, rounded block from y0 (width w0, depth d0) up to y1 (w1, d1): torsos, hips, armour."""
    vs = []
    for yy, w, dd in ((y0, w0, d0), (y1, w1, d1)):
        for sx in (-1, 1):
            for sz in (-1, 1):
                vs.append(P(x + sx * w / 2, yy, z + sz * dd / 2))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me = bpy.data.meshes.new('trunk')
    me.from_pydata([tuple(v) for v in vs], [], faces)
    me.update()
    o = bpy.data.objects.new('trunk', me)
    bpy.context.scene.collection.objects.link(o)
    mod = o.modifiers.new('bev', 'BEVEL')
    mod.width = min(w0, w1, d0, d1) * U * 0.22
    mod.segments = 3
    HR.finish(o, m, sub=sub)
    return B.add(o)


def chest(y0, y1, w0, w1, deep, skin, x=0.0, abs_=True):
    """A heroic torso: a tapered barrel, two broad flat pectorals, a six-pack and rounded deltoids. `skin` a colour
    (bare chest) or a material (a sculpted breastplate)."""
    sk = M('skin' + skin, skin, 0.55) if isinstance(skin, str) else skin
    # an organic barrel: elliptical rings from the waist up to the shoulders, a little fuller in the ribs,
    # rounding over the top into the neck
    rings = []
    for i in range(8):
        k = i / 7
        hw = (w0 + (w1 - w0) * k ** 0.8) / 2 * (1 + 0.06 * math.sin(k * math.pi))
        hd = (deep * 0.85 + deep * 0.15 * k) / 2 * (1 + 0.08 * math.sin(k * math.pi))
        if i == 7:
            hw *= 0.82
            hd *= 0.8
        rings.append((y0 + (y1 - y0) * k, x, hw, hd))
    lofted(rings, sk, sub=2)
    h = y1 - y0
    pr = w1 * 0.24
    for s_ in (-1, 1):
        ball((x + s_ * w1 * 0.21, y1 - h * 0.24, -deep * 0.5 + pr * 0.2), pr, sk, scale=(1.15, 0.62, 0.42))
        ball((x + s_ * w1 * 0.5, y1 - h * 0.08, 0), w1 * 0.17, sk, scale=(1.0, 0.95, 1.0))
    for row in range(3 if abs_ else 0):
        for s_ in (-1, 1):
            ball((x + s_ * w0 * 0.12, y0 + h * (0.18 + row * 0.15), -deep * 0.42), w0 * 0.1, sk, scale=(1.0, 0.75, 0.45), seg=16)


def eyes(x, y, d, gap, r, color, strength=6.0):
    m = M('eye' + color, color, emit=color, strength=strength)
    ball((x - gap, y, d), r, m, seg=12)
    ball((x + gap, y, d), r, m, seg=12)


def crown(x, y, r, gold, gem=None, spikes=5, h=None):
    h = h or r * 0.9
    cyl((x, y, 0), r * 1.02, r * 0.35, gold, verts=32, bevel=0.4)
    for i in range(spikes):
        a = math.pi * (0.15 + 0.7 * i / max(1, spikes - 1))
        cx = x - math.cos(a) * r * 0.95
        dz = -math.sin(a) * r * 0.95
        cone((cx, y + h * 0.5, dz), r * 0.22, 0.2, h * (1.25 if i == spikes // 2 else 0.9), gold, verts=8)
    if gem:
        ball((x, y + r * 0.05, -r * 1.05), r * 0.18, M('gem' + gem, gem, emit=gem, strength=4.0), seg=12)


def head(x, y, r, skin, eye='#ef4444', brow='#120f17', mouth='#1a0d0d', tusks=None, beard=None, nose=True):
    """A stern head, three-quarter front: dark eye sockets with glowing eyes, a heavy brow, nose, a hard mouth;
    tusks or a beard. Features sit on the skull's surface (an ellipsoid 0.95r across, 0.92r up, 1.05r deep)."""
    sk = M('skin' + skin, skin, 0.6)
    ball((x, y, 0), r, sk, scale=(0.95, 0.92, 1.05))

    def surf(dx, dy):
        q = 1 - (dx / (0.95 * r)) ** 2 - (dy / (0.92 * r)) ** 2
        return -1.05 * r * math.sqrt(max(0.0, q))

    sock = M('socket', '#1a0f12', 0.9)
    em = M('eye' + eye, eye, emit=eye, strength=5.0)
    for s_ in (-1, 1):
        ex, ey = r * 0.34 * s_, r * 0.1
        ball((x + ex, y + ey, surf(ex, ey) + r * 0.08), r * 0.2, sock, scale=(1.2, 0.8, 0.5), seg=14)
        ball((x + ex, y + ey, surf(ex, ey) + r * 0.02), r * 0.12, em, scale=(1.2, 0.8, 0.6), seg=12)
        bx, by = r * 0.32 * s_, r * 0.32
        box((x + bx, y + by, surf(bx, by) + r * 0.06), (r * 0.5, r * 0.14, r * 0.2), M('brow' + brow, brow, 0.7), bevel=r * 0.04, rot=(0, -s_ * 0.3, 0))
    if nose:
        ball((x, y - r * 0.12, surf(0, -r * 0.12) - r * 0.02), r * 0.16, sk, scale=(0.8, 1.2, 0.9), seg=14)
    box((x, y - r * 0.45, surf(0, -r * 0.45) + r * 0.03), (r * 0.5, r * 0.07, r * 0.08), M('mouth' + mouth, mouth, 0.8), bevel=r * 0.03)
    if tusks:
        tm = M('tusk', tusks, 0.35)
        for s_ in (-1, 1):
            tx = r * 0.26 * s_
            cone((x + tx, y - r * 0.38, surf(tx, -r * 0.45) - r * 0.02), r * 0.09, 0.0, r * 0.4, tm, verts=8)
    if beard:
        bm = M('beard' + beard, beard, 0.85)
        ball((x, y - r * 0.68, -r * 0.5), r * 0.6, bm, scale=(1.0, 0.75, 0.8))


def arm_part(name, skin, r, L, bangle=None, fist=True, armour=None):
    """An arm hanging straight down from the shoulder pivot (0, 0): shoulder ball, upper arm, forearm, fist."""
    B.part(name, (0, 0), len=L)
    sk = M('skin' + skin, skin, 0.6)
    ball((0, 0, 0), r * 1.12, armour or sk, scale=(1.0, 1.1, 1.0))
    # one smooth arm: a bulging upper arm tapering to the elbow, a forearm tapering to the wrist
    ball((0, -L * 0.22, 0), r * 1.05, sk, scale=(1.0, 1.9, 1.0))
    limb((0, -L * 0.05, 0), (0, -L * 0.52, 0), r * 0.92, sk, r2=r * 0.8)
    limb((0, -L * 0.5, 0), (0, -L * 0.9, 0), r * 0.82, sk, r2=r * 0.62)
    ball((0, -L * 0.6, 0), r * 0.85, sk, scale=(1.0, 1.6, 1.0))
    if bangle:
        g = M('gold' + bangle, bangle, 0.28, 1.0)
        cyl((0, -L * 0.82, 0), r * 0.95, r * 0.5, g, verts=20)
        cyl((0, -L * 0.25, 0), r * 1.05, r * 0.35, g, verts=20)
    if fist:
        ball((0, -L, 0), r * 1.05, sk, scale=(1.0, 0.9, 1.1))


def dhoti(y0, y1, w0, w1, color, trim=None):
    cl = M('cloth' + color, color, 0.85)
    trunk(y0, y1, w0, w1, w0 * 0.6, w1 * 0.6, cl)
    if trim:
        g = M('gold' + trim, trim, 0.3, 1.0)
        trunk(y1 - 3, y1 + 1, w1 * 1.02, w1 * 1.02, w1 * 0.64, w1 * 0.64, g, sub=1)


def legs(x0, y1, r, color, feet=None, gap=None):
    lm = M('leg' + color, color, 0.75)
    gap = gap or r * 1.1
    for s in (-1, 1):
        limb((s * gap + x0, y1, 0), (s * gap + x0, r * 0.6, 0), r, lm, r2=r * 0.85)
        box((s * gap + x0 + r * 0.3, r * 0.45, -r * 0.3), (r * 2.2, r * 0.9, r * 2.6), M('foot' + (feet or color), feet or color, 0.7), bevel=r * 0.25)


# ------------------------------------------------------------------ the bosses (coordinates from their 2D drawings)


def saptashir():
    """Stage 10: the seven-headed king on his throne (suvarna-art.ts drawSaptashir)."""
    gold = M('gold', '#e8b021', 0.25, 1.0)
    skin = '#8a5530'
    B.part('body')
    # the throne: a deep red back with a golden frame and an arched crest
    throne = M('throne', '#4a1010', 0.6)
    box((0, 135, 30), (192, 270, 16), throne, bevel=3)
    # an inner golden frame and studs on the velvet
    for s in (-1, 1):
        box((s * 80, 135, 21), (3, 240, 3), gold, bevel=0.8)
    box((0, 255, 21), (163, 3, 3), gold, bevel=0.8)
    box((0, 16, 21), (163, 3, 3), gold, bevel=0.8)
    stud = M('ruby', '#dc2626', 0.2, emit='#dc2626', strength=0.6)
    for i in range(6):
        for s in (-1, 1):
            ball((s * 80, 30 + i * 44, 19), 3, stud, seg=12)
    box((0, 272, 22), (204, 8, 12), gold, bevel=2)
    for s in (-1, 1):
        box((s * 98, 138, 22), (8, 276, 12), gold, bevel=2)
        cone((s * 98, 286, 22), 7, 0, 18, gold, verts=12)
    torus((0, 276, 22), 45, 5, gold, arc=(0.0, math.pi))
    cyl((0, 276, 26), 40, 10, M('throneb', '#6b1818', 0.5), rot=(math.radians(90), 0, 0), verts=48)
    ball((0, 300, 18), 8, gold)
    # legs (dark silk), a golden belt
    legs(0, 70, 10, '#1e293b', '#a16207', gap=19)
    trunk(66, 86, 70, 68, 40, 40, gold, sub=1)
    # bare, broad chest with a sash and gold necklaces
    chest(80, 172, 70, 100, 50, skin)
    limb((-44, 166, -26), (34, 86, -24), 3.6, M('sash', '#b91c1c', 0.8))
    for i in range(3):
        torus((0, 176, -12), 26 + i * 9, 1.6, gold, arc=(-math.pi * 0.8, -math.pi * 0.2))
    for s in (-1, 1):
        box((s * 44, 171, -6), (20, 10, 30), gold, bevel=2)
    # a neck under the row of heads
    limb((0, 172, 0), (0, 186, 0), 12, M('skin' + skin, skin, 0.6))
    arm_part('arm', skin, 5.5, 40, bangle='#e8b021')
    B.part('head', (0, 0))
    head(0, 0, 11, '#8a5530', eye='#ff3b1f', tusks=None)
    crown(0, 7, 10, gold, gem='#ef4444', spikes=3, h=12)
    B.part('stump', (0, 0))
    cyl((0, 4, 0), 6, 7, M('stump', '#7f1d1d', 0.5))
    ball((0, 7, 0), 4.5, M('stumpglow', '#fbbf24', emit='#fbbf24', strength=3.0), scale=(1, 1, 0.5))


def raakhasur():
    """Stage 6: the towering ash-grey asura (bhasm-art.ts drawRaakhasur)."""
    ash = '#5a544f'
    B.part('body')
    legs(0, 40, 7.5, '#292524', '#1c1917', gap=13)
    dhoti(26, 60, 50, 54, '#7c2d12', '#b45309')
    chest(56, 94, 54, 66, 36, ash)
    stripes = M('bhasma', '#efeae6', 0.9)
    for i in range(3):
        box((0, 86 - i * 5, -17.5), (34, 1.4, 1.2), stripes, bevel=0.4)
    beads = M('rudraksha', '#7f1d1d', 0.6)
    for i in range(11):
        a = math.pi * 0.12 + (i / 10) * math.pi * 0.76
        ball((math.cos(a) * 17, 93 - math.sin(a) * 19, -18.5), 1.9, beads, seg=10)
    limb((0, 92, 0), (0, 100, 0), 8, M('skin' + ash, ash, 0.75))
    head(0, 104, 14, '#6b6560', eye='#ff2a1a', tusks='#f5f5f4')
    hair = M('jata', '#1c1917', 0.9)
    ball((0, 120, 2), 12, hair, scale=(1.0, 0.85, 0.9))
    ball((0, 132, 4), 6, hair)
    box((0, 113, -13), (12, 2, 2), stripes, bevel=0.5)
    arm_part('arm', ash, 5.5, 40, bangle='#78716c')


def maniyodha():
    """Stage 7: the tall archer-warrior in dark armour, jewel on his brow (kuru-art.ts drawManiyodha)."""
    skin = '#b97a4e'
    gold = M('gold', '#e8b021', 0.25, 1.0)
    B.part('body')
    legs(0, 30, 4.4, '#1e293b', '#3f2a14', gap=7.5)
    dhoti(26, 52, 32, 34, '#e5e7eb', '#e8b021')
    arm_ = M('armour', '#334155', 0.35, 0.6)
    trunk(48, 82, 32, 36, 20, 22, arm_)
    box((0, 80, -2), (36, 3, 24), gold, bevel=0.8)
    box((0, 64, -11), (4, 28, 3), gold, bevel=0.6)
    limb((-15, 78, -12), (15, 52, -12), 2.0, M('sash', '#b91c1c', 0.8))
    for s in (-1, 1):
        ball((s * 17, 79, 0), 6, arm_, scale=(1.1, 0.8, 1.0))
    head(0, 88, 9, skin, eye='#e0f2fe', beard=None)
    hair = M('hair', '#111827', 0.85)
    ball((-5, 89, 4), 9, hair, scale=(0.9, 1.0, 1.0))
    limb((-8, 88, 4), (-12, 68, 6), 3.5, hair, r2=2.0)
    crown(0, 95, 8.5, gold, gem='#a5f3fc', spikes=3, h=10)
    arm_part('arm', skin, 2.6, 30, bangle='#e8b021')


def suryakavach():
    """Stage 8: the heavy king in gold-and-blue armour with a great mace, at the seventh gate (chakra-art.ts)."""
    skin = '#b97a4e'
    gold = M('gold', '#d9a520', 0.25, 1.0)
    B.part('gate')
    stone = M('gatestone', '#3b2a5a', 0.7)
    box((31, 100, 30), (22, 200, 22), stone, bevel=2)
    box((-24, 191, 30), (132, 18, 22), stone, bevel=2)
    torus((-24, 191, 18), 14, 2, gold)
    for i in range(8):
        a = i * math.pi / 8
        box((-24, 191, 18), (1.6, 1.6, 26), gold, bevel=0.3, rot=(0, a, 0))
    B.part('body')
    legs(0, 36, 6.2, '#1e3a8a', '#a16207', gap=10)
    blue = M('armour', '#1d4ed8', 0.3, 0.6)
    trunk(32, 52, 44, 44, 28, 28, blue)
    chest(50, 86, 40, 50, 32, blue, abs_=False)
    for yy in (82, 50):
        box((0, yy, -2), (48, 4, 32), gold, bevel=0.8)
    for i in range(3):
        box((-14 + i * 14, 42, -14.5), (4, 12, 2), gold, bevel=0.6)
    ball((0, 68, -17), 5, M('sunjewel', '#fde047', emit='#fbbf24', strength=2.0), scale=(1, 1, 0.5))
    for s in (-1, 1):
        ball((s * 24, 80, 0), 9, gold, scale=(1.1, 0.75, 1.0))
    head(-4, 92, 11, skin, eye='#fde68a', beard='#111827')
    crown(-4, 101, 10.5, gold, gem='#38bdf8', spikes=3, h=13)
    B.part('mace', (0, 0), len=50)
    wood = M('haft', '#5a2d0c', 0.6)
    limb((0, 0, 0), (0, -50, 0), 2.6, wood)
    cyl((0, -4, 0), 3.4, 6, gold, verts=16)
    ball((0, -50, 0), 13, gold)
    for i in range(8):
        a = i * math.pi / 4
        cone((math.cos(a) * 12, -50 + math.sin(a) * 12, 0), 2.6, 0, 7, M('spike', '#a16207', 0.3, 1.0), rot=(0, -a + math.pi / 2, 0), verts=8)
    arm_part('arm', skin, 4.2, 30, bangle='#d9a520', armour=gold)


def jodasur():
    """Stage 9: the towering wrestler-king with a seam of light down his middle (dwand-art.ts drawJodasur)."""
    skin = '#a0643a'
    gold = M('gold', '#e8b021', 0.25, 1.0)
    B.part('body')
    legs(0, 40, 7, '#7c2d12', '#3f1d0b', gap=11)
    trunk(36, 48, 46, 46, 30, 30, gold, sub=1)
    chest(44, 88, 50, 62, 36, skin)
    seam = M('seam', '#fde047', emit='#fde047', strength=4.0)
    box((0, 64, -18.5), (1.0, 40, 1.0), seam, bevel=0.2)
    limb((0, 86, 0), (0, 92, 0), 8, M('skin' + skin, skin, 0.6))
    head(0, 96, 12, skin, eye='#ef4444', beard='#111827')
    crown(0, 104, 11, gold, gem='#ef4444', spikes=3, h=14)
    arm_part('arm', skin, 5, 36, bangle='#e8b021')
    B.part('boulder', (0, 0))
    ball((0, 0, 0), 18, M('rock', '#78716c', 0.9), scale=(1.0, 0.9, 0.95), seg=12)


def qcurve(a, c, b, r0, r1, m, n=24, d=0.0):
    """A tapering tube along the quadratic curve a → (control c) → b (world px, up), radius r0 to r1."""
    cu = bpy.data.curves.new('q', 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    sp.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1)
        x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0]
        y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]
        p = P(x, y, d)
        sp.points[i].co = (p.x, p.y, p.z, 1)
        sp.points[i].radius = r0 + (r1 - r0) * t
    cu.bevel_depth = U
    cu.bevel_resolution = 4
    cu.use_fill_caps = True
    o = bpy.data.objects.new('q', cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(m)
    return B.add(o)


def bark(name, a, b, scale=0.08):
    """Bark: two browns in long vertical streaks, deep grooves (a stretched wave/noise bump)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = 0.9
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale, 1 / scale, 1 / scale * 0.18)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 8
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = HR.srgb(b)
    ramp.color_ramp.elements[1].color = HR.srgb(a)
    nt.links.new(nz.outputs['Fac'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bs.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.8
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m


def foliage(name, a, b, rim):
    """Leaves: two greens mottled, the edges (seen side-on) catching a burning rim."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = 0.8
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 12
    nz.inputs['Detail'].default_value = 6
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = HR.srgb(b)
    ramp.color_ramp.elements[1].color = HR.srgb(a)
    nt.links.new(nz.outputs['Fac'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bs.inputs['Base Color'])
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.25
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.55
    mr.inputs['From Max'].default_value = 0.95
    mr.inputs['To Max'].default_value = 1.2
    nt.links.new(lw.outputs['Facing'], mr.inputs['Value'])
    bs.inputs['Emission Color'].default_value = HR.srgb(rim)
    nt.links.new(mr.outputs['Result'], bs.inputs['Emission Strength'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
    return m


def leafy(c, r, m, seed):
    """A clump of leaves: a lumpy, noisy ball."""
    o = ball(c, r, m, seg=24)
    tex = bpy.data.textures.new(f'lf{seed}', 'CLOUDS')
    tex.noise_scale = 0.18 + (seed % 5) * 0.03
    md = o.modifiers.new('d', 'DISPLACE')
    md.texture = tex
    md.strength = r * U * 0.4
    md.texture_coords = 'LOCAL'  # (the mesh sits at its world position, so every clump gets different noise)
    return o


def lofted(rings, m, sub=1):
    """A trunk-like solid lofted through rings [(y, x_centre, half_width, half_depth)], 24 points round each."""
    N = 24
    vs = []
    for (yy, xc, hw, hd) in rings:
        for i in range(N):
            a = i / N * math.tau
            vs.append(P(xc + math.cos(a) * hw, yy, math.sin(a) * hd))
    faces = []
    for r in range(len(rings) - 1):
        for i in range(N):
            j = (i + 1) % N
            faces.append((r * N + i, r * N + j, (r + 1) * N + j, (r + 1) * N + i))
    faces.append(tuple(range(N - 1, -1, -1)))
    faces.append(tuple((len(rings) - 1) * N + i for i in range(N)))
    me = bpy.data.meshes.new('loft')
    me.from_pydata([tuple(v) for v in vs], [], faces)
    me.update()
    o = bpy.data.objects.new('loft', me)
    bpy.context.scene.collection.objects.link(o)
    HR.finish(o, m, sub=sub)
    return B.add(o)


def vriksha():
    """Stage 1: Jwala Vriksh-asur, the burning tree demon (agnivan-art.ts drawVriksha)."""
    b = bark('bark', '#5b3a24', '#2a170c')
    B.part('body')
    # the trunk: flaring at the roots, a knotted waist, up to the boughs
    rings = []
    for i in range(13):
        yy = i / 12 * 255
        k = i / 12
        hw = 52 + 20 * (1 - k) ** 3 + 4 * math.sin(k * 9)
        rings.append((yy, (-70 + 75) / 2 * (1 - k) + 0, hw, hw * 0.62))
    lofted(rings, b)
    # bark ridges: long tubes up the front
    for i in range(6):
        bx = -45 + i * 18
        qcurve((bx, 10), (bx + 6 * math.sin(i), 130), (bx - 2, 245), 3.2, 2.0, b, d=-30)
    # boughs reaching left over the grove
    for y0, ln, w in ((230, 360, 16), (180, 240, 13), (290, 280, 12)):
        qcurve((-40, y0), (-ln * 0.5, y0 + 30), (-ln, y0 + 10), w * 0.62, w * 0.22, b, d=-4)
        # side twigs
        for j in range(3):
            t = 0.35 + j * 0.22
            sx = -40 + (-ln + 40) * t
            sy = y0 + 22 * math.sin(t * math.pi)
            qcurve((sx, sy), (sx - 18, sy + 22), (sx - 30, sy + 34 + j * 6), w * 0.25, w * 0.08, b, d=-4)
    # roots spreading over the floor
    for i in range(5):
        side = -1 if i < 3 else 1
        ln = 50 + i * 18
        qcurve((side * 30, 20), (side * (40 + ln * 0.5), 8), (side * (40 + ln), 0), (10 - i) * 0.75, 1.2, b, d=-10 + i * 6)
    # the face on the side facing the squad: deep sockets, a hollow mouth
    hole = M('hollow', '#120804', 0.95)
    for ex, ey, rx, ry in ((-42, 160, 11, 7), (-8, 162, 10, 7)):
        ball((ex, ey, -30), 1, hole, scale=(rx, ry, 5))
    ball((-36, 120, -30), 1, hole, scale=(22, 8, 6))
    # brow knots over the eyes
    for ex, ey, s_ in ((-42, 171, -1), (-8, 173, 1)):
        qcurve((ex - 14, ey - 2 * s_), (ex, ey + 5), (ex + 14, ey + 2 * s_), 3.0, 2.0, b, d=-31)
    B.part('crown')
    leaves = [foliage('leaf', '#2f6a1e', '#163d12', '#ff7a1a'), foliage('leaf2', '#3f7a1c', '#1d4a14', '#ffa03a')]
    i = 0
    for dx, dy, r in ((-150, 260, 46), (-80, 300, 58), (10, 310, 62), (90, 280, 48), (-30, 250, 50), (-220, 235, 36)):
        for j in range(5):
            a = j / 5 * math.tau + i
            leafy((dx + math.cos(a) * r * 0.45, dy + math.sin(a) * r * 0.35, (j % 2) * 6 - 3), r * 0.62, leaves[(i + j) % 2], i * 7 + j)
        leafy((dx, dy, -8), r * 0.7, leaves[i % 2], i * 7 + 6)
        i += 1


def chhaya():
    """Stage 2: Chhaya, the shadow-eating rakshasi rising out of the sea (sagar-art.ts drawChhaya)."""
    skin = '#1e3a5f'
    lit = '#2c5282'
    sk = M('skin' + skin, skin, 0.35)
    B.part('body')
    # a vast body rising out of the water: a broad back and chest, heavy shoulders, a neck under the head
    chest(-10, 190, 110, 200, 100, sk, abs_=False)
    for s_ in (-1, 1):
        ball((s_ * 70, 180, 0), 36, sk, scale=(1.25, 0.85, 1.0))
        # collar bones and ribs showing through
        qcurve((s_ * 10, 182), (s_ * 40, 172), (s_ * 70, 178), 3.5, 2.5, M('lit' + lit, lit, 0.35), d=-36)
        for r_ in range(3):
            qcurve((s_ * 14, 140 - r_ * 18), (s_ * 48, 136 - r_ * 18), (s_ * 66, 118 - r_ * 18), 2.6, 1.4, M('lit' + lit, lit, 0.35), d=-40 + r_ * 2)
    limb((-18, 190, 0), (-18, 240, 0), 22, sk)
    weed = M('weed', '#14532d', 0.6)
    for i in range(12):
        side = 1 if i % 2 else -1
        x0 = -40 + i * 6
        qcurve((x0, 290), (x0 + side * 60 + 30, 230), (x0 + side * 40 + 30 + i * 4, 60 + (i % 3) * 30), 3.6, 1.0, weed, d=30)
    # shells and pearls on her shoulders
    pearl = M('pearl', '#e2e8f0', 0.15, 0.2)
    for i in range(11):
        a = math.pi * (0.15 + 0.7 * i / 10)
        ball((math.cos(a) * 56 - 10, 200 - math.sin(a) * 34, -46), 4.2, pearl, seg=12)
    B.part('head', (0, 0))
    hk = M('skinlit' + lit, lit, 0.35)
    ball((0, 0, 0), 46, hk, scale=(1.0, 1.12, 0.9))
    sock = M('sock', '#0f1f33', 0.8)
    for s_ in (-1, 1):
        ball((s_ * 17 - 1, 11, -36), 13, sock, scale=(1.0, 0.5, 0.45), seg=16)
        ball((s_ * 17 - 1, 11, -40), 5, M('lamp', '#fde047', emit='#fde047', strength=4.0), seg=12)
    ball((-2, -22, -34), 24, M('jaw', '#0b1220', 0.8), scale=(1.0, 0.27, 0.4))
    fang = M('fang', '#e2e8f0', 0.3)
    for i in range(6):
        cone((-17 + i * 7, -21, -40), 2.6, 0.2, 9, fang, rot=(math.radians(180), 0, 0), verts=8)
    # cheekbones and a heavy brow
    for s_ in (-1, 1):
        ball((s_ * 28, -2, -26), 13, hk, scale=(1.1, 0.7, 0.8))
    ball((0, 24, -30), 30, hk, scale=(1.3, 0.35, 0.5))
    ball((-2, 0, -40), 7, hk, scale=(0.8, 1.4, 0.8))
    coral = M('coral', '#be123c', 0.5)
    for s_ in (-1, 1):
        qcurve((s_ * 29, 36), (s_ * 50, 70), (s_ * 37, 92), 3.6, 1.2, coral, d=-4)
        qcurve((s_ * 44, 66), (s_ * 58, 72), (s_ * 62, 84), 2.0, 0.8, coral, d=-4)
    B.part('arm', (0, 0), len=200)
    # a great arm hanging down from the shoulder pivot, claws at the end
    limb((0, 0, 0), (0, -190, 0), 11, sk, r2=8)
    ball((0, -10, 0), 14, sk)
    ball((0, -192, 0), 12, hk, scale=(1.2, 1.0, 0.9))
    cl = M('claw', '#cbd5e1', 0.3)
    for i in range(4):
        cone((-9 + i * 6, -208, -2), 2.4, 0.2, 18, cl, rot=(0, 0, 0), verts=8)


def aandhi():
    """Stage 3: Aandhi, the storm demon who sat on the summit as a sage (vayu-art.ts drawAandhi)."""
    skin = '#475569'
    B.part('body')
    legs(0, 40, 7, '#334155', '#1e293b', gap=11)
    robe = M('robe', '#c2410c', 0.85)
    trunk(18, 42, 52, 56, 34, 36, robe)
    for i in range(5):  # torn hem
        cone((-20 + i * 10, 18, -4), 5, 0.5, 10, robe, rot=(math.radians(180), 0, 0), verts=6)
    chest(40, 96, 56, 68, 38, skin)
    beads = M('rudraksha', '#7c2d12', 0.6)
    for i in range(11):
        a = math.pi * 0.12 + (i / 10) * math.pi * 0.76
        ball((math.cos(a) * 19, 95 - math.sin(a) * 24, -19), 2.6, beads, seg=10)
    limb((0, 94, 0), (0, 100, 0), 9, M('skin' + skin, skin, 0.55))
    head(0, 112, 17, skin, eye='#fde047', brow='#7f1d1d')
    locks = M('locks', '#1c1917', 0.9)
    ball((0, 121, 4), 16, locks, scale=(1.05, 0.7, 1.0))
    for i in range(9):
        x0 = -16 + i * 4
        qcurve((x0, 124), (x0 * 1.5 - 4, 104), (x0 * 1.3 - 2, 82 + (i % 3) * 4), 2.6, 1.6, locks, d=6)
    arm_part('arm', skin, 5.5, 34, bangle='#78716c')
    B.part('boulder', (0, 0))
    ball((0, 0, 0), 16, M('rock', '#78716c', 0.9), scale=(1.0, 0.9, 0.95), seg=12)
    B.part('sage')
    # the disguise: a sage sitting cross-legged in saffron, eyes closed, a water pot beside him
    saffron = M('saffron', '#f97316', 0.85)
    ball((0, 12, 0), 26, M('robe', '#c2410c', 0.85), scale=(1.0, 0.46, 0.7))
    trunk(12, 54, 26, 22, 18, 16, saffron)
    limb((-10, 50, -6), (12, 30, -12), 4, saffron)
    ball((0, 62, 0), 11, M('skinsage', '#d6a77a', 0.6))
    ball((0, 54, -6), 8, M('beard', '#e7e5e4', 0.9), scale=(1.0, 1.5, 0.7))
    ball((0, 72, 2), 8, M('locks', '#44403c', 0.9), scale=(1.0, 0.8, 1.0))
    for s_ in (-1, 1):
        box((s_ * 4, 63, -10.5), (4, 0.8, 0.8), M('lid', '#3f2a14', 0.8), bevel=0.2)
    pot = M('pot', '#a16207', 0.3, 0.8)
    ball((34, 9, 0), 8, pot, scale=(1.0, 1.1, 1.0))
    cyl((34, 18, 0), 3, 5, pot)


def vishdhar():
    """Stage 4: Vishdhar's coils filling the far end of the lake, the great hood over them (naag-art.ts)."""
    skin = '#1e3a8a'
    sk = M('scales', skin, 0.35, 0.2)
    sk2 = M('scales2', '#1e40af', 0.35, 0.2)
    belly = M('belly', '#93c5fd', 0.5)
    B.part('body')
    for k in range(4):
        R = 90 - k * 12
        bpy.ops.mesh.primitive_torus_add(major_radius=R * U, minor_radius=(15 - k * 1.5) * U, location=P(10 - k * 8, 20 + k * 22, 10 + k * 6), rotation=(math.radians(14), 0, 0), major_segments=64, minor_segments=16)
        o = bpy.context.object
        o.scale = (1.0, 1.0, 1.0)
        B.add(HR.finish(o, sk if k % 2 else sk2))
    # the neck rising out of the coils into the hood
    qcurve((10, 60), (24, 110), (0, 132), 16, 13, sk, d=-6)
    B.part('hood', (0, 0))
    ball((0, 0, 0), 1, sk, scale=(48, 56, 12))
    ball((0, -6, -8), 1, belly, scale=(24, 40, 6))
    for s_ in (-1, 1):
        ball((s_ * 18, 8, -10), 1, M('spot', '#93c5fd', 0.3, emit='#60a5fa', strength=0.6), scale=(7, 11, 3))
        ball((s_ * 18, 8, -12), 1, M('spotc', '#0b1a4a', 0.5), scale=(3, 5, 2))
    # the head below the hood, toward the squad: a long snout, a glowing eye, fangs
    ball((-22, -30, -14), 1, M('head', '#1d4ed8', 0.35, 0.2), scale=(22, 13, 14))
    ball((-36, -26, -24), 4.5, M('eye', '#fde047', emit='#fde047', strength=4.0), seg=12)
    fang = M('fang', '#e2e8f0', 0.3)
    for dx in (-36, -28):
        cone((dx, -40, -20), 2.2, 0.2, 9, fang, rot=(math.radians(180), 0, 0), verts=8)


def darpan():
    """Stage 5: Darpan-asur, the great mirror: the gilded frame and peacock crest; its glass stays drawn by code."""
    gold = M('gold', '#d4a017', 0.25, 1.0)
    dark = M('goldd', '#8a5a0a', 0.35, 1.0)
    B.part('frame')
    for s_ in (-1, 1):
        box((s_ * 71, 116, 0), (12, 232, 14), dark, bevel=2)
        box((s_ * 67, 112, -6), (4, 224, 4), gold, bevel=1)
        cyl((s_ * 71, 4, 0), 10, 8, gold, verts=20)
        ball((s_ * 71, 236, 0), 8, gold)
    box((0, 226, 0), (154, 12, 14), dark, bevel=2)
    box((0, 221, -6), (138, 4, 4), gold, bevel=1)
    # carved studs down the posts
    stud = M('stud', '#ef4444', 0.2, emit='#ef4444', strength=0.4)
    for i in range(6):
        for s_ in (-1, 1):
            ball((s_ * 71, 30 + i * 36, -8), 3, stud, seg=12)
    # the peacock crest
    for i in range(7):
        a = math.pi + (i / 6) * math.pi
        cx = math.cos(a) * 46
        cy = 234 - math.sin(a) * 40
        fe = M('feather' + str(i % 2), '#0e7490' if i % 2 else '#16a34a', 0.35, 0.3)
        o = ball((0, 0, 0), 1, fe, scale=(9, 16, 3))  # made at the origin, then turned and moved into place
        o.rotation_euler = (0, -(a + math.pi / 2), 0)
        o.location = P(cx, cy, 4)
        ball((cx + math.cos(a) * 3, cy - math.sin(a) * 3, -1), 1, M('eyespot', '#1e3a8a', 0.3, emit='#38bdf8', strength=0.5), scale=(4, 4, 2))
    ball((0, 252, 0), 9, gold)


BOSSES = {
    'aandhi': aandhi,
    'vishdhar': vishdhar,
    'darpan': darpan,
    'vriksha': vriksha,
    'chhaya': chhaya,
    'saptashir': saptashir,
    'raakhasur': raakhasur,
    'maniyodha': maniyodha,
    'suryakavach': suryakavach,
    'jodasur': jodasur,
}

# Parts are modelled facing the viewer, turned a little toward screen-right (the game mirrors them to face left).
TURN = {'aandhi': -12, 'vishdhar': 0, 'darpan': 0, 'vriksha': 0, 'chhaya': 0, 'saptashir': 0, 'raakhasur': -14, 'maniyodha': -18, 'suryakavach': -10, 'jodasur': -14}


# Story portraits (the comms panel): (part whose objects to show, centre x, centre y, box size) in world px.
FACES = {
    'aandhi': ('body', 0, 114, 50),
    'vishdhar': ('hood', -12, -10, 110),
    'darpan': ('frame', 0, 200, 140),
    'vriksha': ('body', -25, 145, 90),
    'chhaya': ('head', 0, 5, 110),
    'saptashir': ('head', 0, 4, 34),
    'raakhasur': ('body', 0, 110, 50),
    'maniyodha': ('body', 0, 92, 30),
    'suryakavach': ('body', -4, 95, 36),
    'jodasur': ('body', 0, 100, 38),
}


def bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    xs, zs = [], []
    for o in objs:
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            w = oe.matrix_world @ Vector(c)
            xs.append(w.x)
            zs.append(w.z)
    return min(xs), max(xs), min(zs), max(zs)


def render_boss(key, samples, only=None):
    global B
    sc, cam = scene(samples)
    B = Boss(key)
    BOSSES[key]()
    # turn every part about its own pivot (a vertical axis through it)
    turn = math.radians(TURN.get(key, 0))
    if turn:
        for part, objs in B.parts.items():
            px, py = B.pivot[part]
            piv = P(px, py)
            for o in objs:
                if o.parent is None:
                    o.location = piv + (Vector(o.location) - piv)
                    o.rotation_mode = 'XYZ'
                    # rotate the object's location about the pivot and its own orientation by the same angle
                    rel = Vector(o.location) - piv
                    c, s_ = math.cos(turn), math.sin(turn)
                    o.location = piv + Vector((rel.x * c - rel.y * s_, rel.x * s_ + rel.y * c, rel.z))
                    o.rotation_euler.z += turn
    out = os.path.join(OUT, key)
    os.makedirs(out, exist_ok=True)
    meta = {}
    allobjs = [o for objs in B.parts.values() for o in objs]
    for part, objs in B.parts.items():
        if only and part not in only:
            continue
        for o in allobjs:
            o.hide_render = o not in objs
        bpy.context.view_layer.update()
        x0, x1, z0, z1 = bounds(objs)
        pad = (3 + 0.06 * max(x1 - x0, z1 - z0) / U) * U
        x0, x1, z0, z1 = x0 - pad, x1 + pad, z0 - pad, z1 + pad
        wpx = math.ceil((x1 - x0) / U) * SS
        hpx = math.ceil((z1 - z0) / U) * SS
        w, h = wpx / SS * U, hpx / SS * U
        cam.data.ortho_scale = max(w, h)
        cam.location = (x0 + w / 2, -60, z0 + h / 2)
        sc.render.resolution_x, sc.render.resolution_y = wpx, hpx
        sc.render.filepath = os.path.join(out, part + '.png')
        bpy.ops.render.render(write_still=True)
        px, py = B.pivot[part]
        meta[part] = {
            'ax': round((px * U - x0) / U * SS, 2),
            'ay': round((z0 + h - py * U) / U * SS, 2),
            **B.extra.get(part, {}),
        }
        print('wrote', key, part, wpx, 'x', hpx, flush=True)
    if key in FACES and (not only or 'face' in only):
        src, fx, fy, size = FACES[key]
        for o in allobjs:
            o.hide_render = o not in B.parts[src]
        cam.data.ortho_scale = size * U
        cam.location = (fx * U, -60, fy * U)
        sc.render.resolution_x = sc.render.resolution_y = 256
        sc.render.filepath = os.path.join(out, 'face.png')
        bpy.ops.render.render(write_still=True)
        meta['face'] = {'ax': 128, 'ay': 128}
        print('wrote', key, 'face', flush=True)
    mp = os.path.join(out, 'meta.json')
    old = json.load(open(mp)) if only and os.path.exists(mp) else {}
    old.update(meta)
    json.dump({'_ss': SS, **{k: v for k, v in old.items() if k != '_ss'}}, open(mp, 'w'), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--boss')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--only', help='comma-separated parts')
    ap.add_argument('--samples', type=int, default=48)
    a = ap.parse_args()
    keys = list(BOSSES) if a.all else [a.boss]
    for k in keys:
        render_boss(k, a.samples, set(a.only.split(',')) if a.only else None)


if __name__ == '__main__':
    main()
