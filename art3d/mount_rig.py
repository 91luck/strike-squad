"""
Rides (sawari) in 3D, rendered as parts (Blender, headless `bpy`), with the same machinery as the saga bosses
(boss_rig.py): parts in world pixels (x forward, y up from the ground, d away from the viewer), each rendered on its
own with the pivot it turns about, then packed into one atlas per ride by pack_boss.py.

    body    the ride without its moving parts
    legf    a front leg hanging from the shoulder (the game swings it for the walk, the gallop, the leap)
    legb    a hind leg hanging from the hip
    wheel   one wheel about its axle (the game spins it)
    wing    the near wing from the shoulder, spread back (the game flaps it; the far wing is the same, darker)
    pack    the jet suit's pack, worn on the soldier's back (its fire is the game's)

    python3 art3d/mount_rig.py --all [--samples 48]
writes art3d/out/mount/<ride>/<part>.png + meta.json; then
    python3 art3d/pack_boss.py --src art3d/out/mount --dst client/src/assets/mounts3d

Original designs only: a war horse, a tiger and a war elephant in Indian battle finery, a great hawk, a war bike, an
armoured jeep and a jet suit.
"""

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import boss_rig as BR  # noqa: E402
import hero_rig as HR  # noqa: E402
from boss_rig import M, P, ball, box, cone, cyl, limb, qcurve, torus  # noqa: E402

U = BR.U


def loftx(rings, m, sub=1, n=24):
    """A body lofted along x through rings [(x, y_centre, half_height, half_depth)]."""
    vs = []
    for (xx, yc, hh, hd) in rings:
        for i in range(n):
            a = i / n * math.tau
            vs.append(P(xx, yc + math.sin(a) * hh, math.cos(a) * hd))
    faces = []
    for r in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((r * n + i, (r + 1) * n + i, (r + 1) * n + j, r * n + j))
    faces.append(tuple(range(n)))
    faces.append(tuple((len(rings) - 1) * n + i for i in range(n - 1, -1, -1)))
    me = bpy.data.meshes.new('loftx')
    me.from_pydata([tuple(v) for v in vs], [], faces)
    me.update()
    o = bpy.data.objects.new('loftx', me)
    bpy.context.scene.collection.objects.link(o)
    HR.finish(o, m, sub=sub)
    return BR.B.add(o)


def body_rings(x0, x1, yc, hh, hd, n=11, belly=0.0, chest=0.0, rump=0.0, taper0=0.55, taper1=0.6):
    """Rings for an animal's barrel: rounded ends, fuller at chest (front) or rump (back), a belly that sags."""
    rings = []
    for i in range(n):
        k = i / (n - 1)
        x = x0 + (x1 - x0) * k
        end = math.sin(math.pi * k) ** 0.45
        end = max(end, taper0 if k < 0.5 else taper1) if 0 < k < 1 else 0.25
        full = 1 + chest * math.exp(-((k - 0.78) / 0.18) ** 2) + rump * math.exp(-((k - 0.18) / 0.18) ** 2)
        rings.append((x, yc - belly * math.sin(math.pi * k), hh * end * full, hd * end * full))
    return rings


def stripes(name, a, b, scale, white=None):
    """A tiger's coat: bands across the body, broken by noise, the belly paler."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = 0.75
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.wave_type = 'BANDS'
    wv.bands_direction = 'X'
    wv.inputs['Scale'].default_value = scale
    wv.inputs['Distortion'].default_value = 6.0
    wv.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].color = HR.srgb(b)
    ramp.color_ramp.elements[1].position = 0.22
    ramp.color_ramp.elements[1].color = HR.srgb(a)
    nt.links.new(wv.outputs['Fac'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bs.inputs['Base Color'])
    return m


def hoof(x, y, r, m):
    cyl((x, y + r * 0.45, 0), r * 1.05, r * 0.9, m, verts=16, bevel=0.4)


def leg(a, k, b, r0, r1, skin, foot=None, paw=None):
    """A two-joint leg from a (hip or shoulder) by the knee k to the foot b; a hoof or a paw."""
    limb(a, k, r0, skin, r2=r0 * 0.75)
    ball(k, r0 * 0.78, skin, seg=16)
    limb(k, b, r0 * 0.7, skin, r2=r1)
    if foot is not None:
        hoof(b[0], b[1] - r1 * 0.4, r1 * 1.15, foot)
    if paw is not None:
        ball((b[0] + r1 * 0.5, b[1] + r1 * 0.2, 0), r1 * 1.35, paw, scale=(1.5, 0.75, 1.1), seg=16)


# ------------------------------------------------------------------ the war horse


def horse():
    coat = M('bay', '#7a4526', 0.55)
    dark = M('mane', '#1a110b', 0.8)
    red = M('cloth', '#b91c1c', 0.85)
    gold = M('gold', '#e8b021', 0.25, 1.0)
    hoofm = M('hoof', '#2a1d14', 0.6)
    BR.B.part('body')
    loftx(body_rings(-27, 25, 36, 12.5, 9.5, belly=1.5, chest=0.12, rump=0.1), coat, sub=2)
    # the neck, arched, and the head
    loftx([(12, 40, 10, 8), (18, 47, 9.5, 7), (24, 54, 8, 6), (29, 60, 6.5, 5), (32, 64, 5.2, 4.4)], coat, sub=2)
    loftx([(29, 64, 5.2, 4.6), (34, 62, 5.0, 4.2), (39, 58, 4.0, 3.6), (43, 55, 3.4, 3.1), (45, 54.5, 2.6, 2.6)], coat, sub=2)
    ball((44.5, 54, -1.5), 0.9, dark, seg=8)  # nostril
    eye = M('eye', '#120c08', 0.2)
    ball((33, 63, -3.6), 1.2, eye, seg=10)
    for dz in (-2.2, 2.2):
        cone((30, 69, dz), 1.2, 0.15, 3.2, coat, rot=(0, math.radians(-15), 0), verts=8)
    # the mane down the neck, the forelock, and the tail
    qcurve((28, 69, 1), (21, 63, 1), (14, 49, 1), 2.4, 1.6, dark)
    qcurve((-26, 41, 0), (-35, 38, 0), (-33, 17, 0), 3.0, 1.2, dark)
    qcurve((-26, 40, 0), (-37, 34, 0), (-38, 20, 0), 2.2, 0.8, dark)
    # battle finery: a red saddle cloth with gold trim, a saddle, a gold brow piece and a plume
    box((-2, 42, 0), (26, 12, 21), red, bevel=2)
    box((-2, 36.5, 0), (27, 2, 21.5), gold, bevel=0.6)
    box((-2, 49, 0), (16, 4, 15), M('leather', '#5a2e14', 0.6), bevel=1.6)
    box((35, 65, -3.6), (6, 1.4, 0.6), gold, bevel=0.3, rot=(0, 0, math.radians(-25)))
    ball((31, 69.5, 0), 2.6, M('plume', '#dc2626', 0.8), scale=(0.8, 1.4, 0.8), seg=12)
    ball((31, 67.4, 0), 1.3, gold, seg=10)
    # reins and a breast strap
    qcurve((37, 57, -4), (20, 54, -5), (6, 50, -6), 0.5, 0.5, M('rein', '#3b2416', 0.7))
    torus((19, 40, 0), 8.0, 0.9, gold, rot=(0, math.radians(70), 0))
    BR.B.part('legf', (17, 32))
    leg((17, 34), (19, 18), (18, 3), 4.4, 2.3, coat, foot=hoofm)
    BR.B.part('legb', (-19, 34))
    ball((-19, 34, 0), 7.5, coat, scale=(1.0, 1.25, 0.9))
    leg((-19, 32), (-23, 18), (-20, 3), 4.6, 2.3, coat, foot=hoofm)


# ------------------------------------------------------------------ the tiger


def tiger():
    coat = stripes('tigerfur', '#e47d25', '#141010', 7.0)
    pale = M('belly', '#f3e6d0', 0.8)
    BR.B.part('body')
    loftx(body_rings(-28, 23, 25, 10, 10, belly=0.8, chest=0.18, rump=0.06), coat, sub=2)
    ball((0, 19, 0), 9.4, pale, scale=(2.2, 0.5, 0.95))
    # the head: broad skull, white muzzle and cheeks, ears, amber eyes
    ball((32, 30, 0), 10, coat, scale=(1.05, 0.95, 1.0))
    ball((39.5, 26.5, 0), 5.6, pale, scale=(1.0, 0.8, 1.1))
    ball((34, 25, -6), 4.5, pale, scale=(1.0, 0.8, 0.7))
    ball((43.6, 28.6, 0), 1.6, M('nose', '#3b1f1a', 0.5), seg=10)
    em = M('eye', '#fbbf24', emit='#f59e0b', strength=3.0)
    for dz in (-4.5, 4.5):
        ball((37, 33.2, dz - 5.2 if dz < 0 else dz), 1.5, em, scale=(1.3, 0.8, 0.6), seg=10)
        cone((28.5, 39.5, dz), 3.0, 0.5, 4.5, coat, verts=10)
    # the tail, raised in a curve
    qcurve((-28, 28, 0), (-44, 26, 0), (-46, 42, 0), 2.6, 1.6, coat)
    # a rider's cloth over the back, saffron with a gold edge
    box((-3, 34, 0), (22, 3, 21), M('cloth', '#ea580c', 0.85), bevel=1.2)
    box((-3, 32.6, 0), (23, 1.2, 21.4), M('gold', '#e8b021', 0.25, 1.0), bevel=0.4)
    BR.B.part('legf', (17, 22))
    leg((17, 24), (19, 11), (19, 2), 4.6, 3.0, coat, paw=coat)
    BR.B.part('legb', (-19, 24))
    ball((-19, 24, 0), 7.5, coat, scale=(1.0, 1.2, 0.9))
    leg((-19, 22), (-24, 11), (-20, 2), 4.8, 3.0, coat, paw=coat)


# ------------------------------------------------------------------ the war elephant


def elephant():
    hide = M('hide', '#7f7b84', 0.85)
    hide2 = M('hide2', '#6b6770', 0.9)
    red = M('cloth', '#9f1239', 0.85)
    gold = M('gold', '#e8b021', 0.25, 1.0)
    ivory = M('ivory', '#f5ecd7', 0.35)
    BR.B.part('body')
    loftx(body_rings(-38, 30, 55, 27, 24, belly=3, chest=0.06, rump=0.1), hide, sub=2)
    # the head, high domed, the trunk curling forward, the ear, the tusks
    ball((38, 62, 0), 21, hide, scale=(0.95, 1.05, 0.9))
    ball((40, 79, 0), 10, hide, scale=(1.4, 0.7, 1.2))
    qcurve((50, 54, 0), (60, 30, 0), (58, 10, 0), 7.5, 3.0, hide)
    qcurve((58, 11, 0), (59, 4, 0), (64, 7, 0), 3.0, 2.4, hide)
    ball((28, 62, -18), 16, hide2, scale=(0.75, 1.1, 0.18))  # the near ear
    for dz in (-7, 7):
        qcurve((47, 50, dz), (58, 42, dz * 1.1), (64, 50, dz * 1.2), 3.2, 1.2, ivory)
        cyl((50, 50, dz), 3.8, 2.4, gold, rot=(0, math.radians(70), 0), verts=16)
    ball((45, 66, -14.5), 1.8, M('eye', '#1a120c', 0.2), seg=10)
    # the forehead ornament (a gold plate studded with bosses) and a red-gold caparison with a riding seat
    box((44, 70, -9), (14, 20, 3), gold, bevel=1.2, rot=(0, math.radians(-20), 0))
    for i in range(3):
        ball((46, 64 + i * 6, -11.5), 1.5, M('ruby', '#dc2626', 0.2, emit='#dc2626', strength=1.0), seg=10)
    box((-4, 64, 0), (52, 30, 50.5), red, bevel=3)
    box((-4, 49.5, 0), (53, 3, 51), gold, bevel=0.8)
    for i in range(6):
        ball((-26 + i * 9, 48, -25.5), 1.6, gold, seg=10)
    box((-4, 82.5, 0), (34, 5, 30), M('seat', '#78350f', 0.6), bevel=2)
    box((-4, 85.5, 0), (36, 2, 32), gold, bevel=0.6)
    # the tail
    qcurve((-37, 60, 0), (-44, 50, 0), (-42, 34, 0), 1.6, 1.0, hide2)
    BR.B.part('legf', (24, 40))
    limb((24, 44), (25, 6), 10.5, hide, r2=9.0)
    cyl((25, 4, 0), 10, 6, hide2, verts=24, bevel=1.5)
    cyl((25, 22, 0), 10.2, 3, gold, verts=24)
    BR.B.part('legb', (-26, 40))
    limb((-26, 46), (-26, 6), 11.5, hide, r2=9.5)
    cyl((-26, 4, 0), 10.5, 6, hide2, verts=24, bevel=1.5)
    cyl((-26, 22, 0), 10.7, 3, gold, verts=24)


# ------------------------------------------------------------------ the great hawk


def baaz():
    brown = M('feather', '#5b3a1f', 0.8)
    brown2 = M('feather2', '#7c4f2a', 0.8)
    cream = M('breast', '#efe2c4', 0.85)
    gold = M('beak', '#f2b632', 0.4)
    BR.B.part('body')
    loftx(body_rings(-28, 22, 30, 12, 12, belly=-1.5, chest=0.25), brown, sub=2)
    ball((12, 25, -3), 10, cream, scale=(1.2, 1.0, 0.85))
    # the head and the hooked beak, a fierce eye under a heavy brow
    ball((29, 38, 0), 9, brown2, scale=(1.05, 1.0, 0.95))
    ball((31, 34, -1), 6.5, cream, scale=(1.0, 0.8, 0.9))
    qcurve((35, 38, 0), (44, 38, 0), (43, 31, 0), 3.4, 0.6, gold)
    em = M('eye', '#fbbf24', emit='#f59e0b', strength=2.5)
    ball((33, 40.5, -7.4), 1.6, em, seg=10)
    box((33, 43, -7.2), (7, 1.6, 2), M('brow', '#2a1a0e', 0.8), bevel=0.4, rot=(0, 0, math.radians(-12)))
    # the tail fan and the talons tucked under
    for i in range(5):
        a = math.radians(170 + (i - 2) * 9)
        qcurve((-24, 30, (i - 2) * 2.2), (-34, 30 + math.sin(a) * 6, (i - 2) * 2.4), (-24 + math.cos(a) * 22, 30 + math.sin(a) * 22, (i - 2) * 2.6), 3.2, 2.0, brown2 if i % 2 else brown)
    for dz in (-4, 4):
        limb((4, 19, dz), (6, 13, dz), 2.0, gold)
        for t in (-1, 0, 1):
            cone((7 + t * 1.6, 11.5, dz + t * 1.2), 0.8, 0.1, 4, M('talon', '#1c1917', 0.4), rot=(0, 0, math.radians(180 + t * 20)), verts=6)
    # a saddle of red cloth and gold
    box((-4, 41.5, 0), (18, 3, 18), M('cloth', '#b91c1c', 0.85), bevel=1.2)
    box((-4, 40, 0), (19, 1.2, 18.5), M('gold', '#e8b021', 0.25, 1.0), bevel=0.4)
    # the wing: spread back and up from the shoulder; a covert plate and long primaries fanned like fingers
    BR.B.part('wing', (4, 38))
    loftx([(-24, 51, 2.5, 1.2), (-14, 48, 7, 1.8), (-2, 42, 8.5, 2.2), (6, 38.5, 5, 1.8)], brown2, sub=2)
    tip = M('tip', '#3b2414', 0.8)
    for i in range(9):
        k = i / 8
        a = math.radians(170 - k * 85)  # from back-and-level to up-and-back
        L = 34 + 16 * math.sin(math.pi * k)
        bx, by = -8 - k * 16, 45 + k * 6
        ex, ey = bx + math.cos(a) * L, by + math.sin(a) * L
        cx, cy = bx + math.cos(a) * L * 0.5 + math.sin(a) * 3, by + math.sin(a) * L * 0.5 - math.cos(a) * 3
        qcurve((bx, by, -1 + k * 0.4), (cx, cy, -1 + k * 0.4), (ex, ey, -1 + k * 0.4), 3.4, 0.9, brown if i % 2 else tip)
    for i in range(5):
        k = i / 4
        a = math.radians(165 - k * 50)
        bx, by = 0 - k * 14, 43 + k * 4
        qcurve((bx, by, -2.4), (bx + math.cos(a) * 9, by + math.sin(a) * 9 + 1, -2.4), (bx + math.cos(a) * 18, by + math.sin(a) * 18, -2.4), 3.6, 1.6, cream if i == 0 else brown2)


# ------------------------------------------------------------------ the war bike


def bike():
    steel = M('steel', '#2a2f38', 0.35, 0.8)
    paint = M('paint', '#f59e0b', 0.3, 0.3)
    paint2 = M('paint2', '#b45309', 0.35, 0.3)
    chrome = M('chrome', '#d6dde6', 0.12, 1.0)
    black = M('rubber', '#141417', 0.8)
    BR.B.part('body')
    # frame tubes from the rear axle to the steering head
    limb((-26, 14), (-6, 24), 2.2, steel)
    limb((-6, 24), (18, 36), 2.2, steel)
    limb((-6, 14), (18, 34), 2.0, steel)
    # the engine block and its cylinders, the exhaust sweeping back
    box((-4, 18, 0), (16, 12, 12), steel, bevel=2)
    for i in range(3):
        cyl((-4 + (i - 1) * 4.5, 26, 0), 2.4, 4, chrome, verts=12)
    qcurve((2, 14, -6), (-14, 8, -7), (-34, 14, -7), 2.4, 2.2, chrome)
    cyl((-34, 15, -7), 3.0, 8, chrome, rot=(0, math.radians(90), 0), verts=16)
    # the tank, the seat, the tail with its lamp, the fairing with the headlamp
    loftx([(-4, 32, 2, 4), (2, 34, 5.5, 6.5), (10, 34.5, 5.5, 6.0), (16, 33, 3, 4)], paint, sub=2)
    box((6, 35, -6.6), (10, 2.4, 0.6), paint2, bevel=0.3)
    loftx([(-22, 30, 1.5, 4), (-17, 31, 3.0, 5.5), (-8, 31, 3.0, 6), (-4, 31, 2, 5)], M('seat', '#18181b', 0.7), sub=2)
    loftx([(-34, 27, 1.0, 2.5), (-28, 28, 2.8, 4.5), (-20, 27, 2.6, 5)], paint, sub=2)
    ball((-34.5, 27.5, 0), 1.6, M('tail', '#ef4444', 0.3, emit='#ef4444', strength=4.0), scale=(0.6, 1, 1.6), seg=10)
    loftx([(16, 33, 4, 5), (22, 37, 6.5, 6.5), (27, 38, 5.5, 5.5), (29, 37, 3, 4)], paint, sub=2)
    ball((28.5, 36.5, 0), 3.0, M('lamp', '#fff7cc', 0.2, emit='#fff1a8', strength=6.0), scale=(0.6, 1, 1), seg=14)
    # the front fork and the handlebar
    for dz in (-3.5, 3.5):
        limb((22, 38, dz), (30, 14, dz), 1.4, chrome)
    limb((19, 42, -9), (19, 42, 9), 1.1, black)
    limb((18, 40, 0), (19, 42, 0), 1.2, chrome)
    # mudguards
    torus((30, 14, 0), 16.5, 1.4, paint, rot=(math.radians(90), 0, 0), arc=(math.radians(20), math.radians(150)))
    torus((-26, 14, 0), 16.5, 1.4, paint, rot=(math.radians(90), 0, 0), arc=(math.radians(30), math.radians(170)))
    BR.B.part('wheel', (0, 14))
    torus((0, 14, 0), 11.5, 3.6, black)
    cyl((0, 14, 0), 8.5, 3.0, steel, rot=(math.radians(90), 0, 0), verts=32, bevel=0.6)
    cyl((0, 14, -1.6), 3.0, 1.0, chrome, rot=(math.radians(90), 0, 0), verts=20)
    for i in range(5):
        a = i / 5 * math.tau
        limb((math.cos(a) * 2.5, 14 + math.sin(a) * 2.5, -1.7), (math.cos(a + 0.6) * 8, 14 + math.sin(a + 0.6) * 8, -1.7), 1.0, paint)


# ------------------------------------------------------------------ the armoured jeep


def jeep():
    olive = M('olive', '#4d5a2a', 0.6, 0.15)
    olive2 = M('olive2', '#3a4420', 0.7, 0.1)
    steel = M('steel', '#2a2f38', 0.35, 0.8)
    black = M('rubber', '#141417', 0.8)
    glass = M('glass', '#8fb3c9', 0.08, 0.3)
    BR.B.part('body')
    # the hull: a low body, the long bonnet, the wheel arches
    box((0, 26, 0), (100, 16, 40), olive, bevel=3)
    box((26, 36, 0), (46, 8, 38), olive, bevel=2.5)
    box((-26, 38, 0), (44, 10, 40), olive2, bevel=2)
    for x in (-32, 32):
        torus((x, 18, -20), 17, 2.4, olive2, rot=(math.radians(90), 0, 0), arc=(math.radians(10), math.radians(170)))
    # the grille, lamps, a bull bar
    box((50, 30, 0), (2, 12, 30), steel, bevel=0.6)
    for dz in (-12, 12):
        ball((50.5, 37, dz), 3.2, M('lamp', '#fff7cc', 0.2, emit='#fff1a8', strength=5.0), scale=(0.5, 1, 1), seg=12)
    limb((54, 22, -18), (54, 22, 18), 1.6, steel)
    limb((54, 22, -14), (54, 34, -14), 1.4, steel)
    limb((54, 22, 14), (54, 34, 14), 1.4, steel)
    # the windscreen frame and roll bar
    box((6, 47, 0), (2, 14, 36), steel, bevel=0.5)
    box((5.4, 47, -0.5), (1, 12, 32), glass, bevel=0.3)
    for dz in (-18, 18):
        limb((-6, 40, dz), (-14, 58, dz), 1.6, steel)
        limb((-14, 58, dz), (-40, 58, dz), 1.6, steel)
        limb((-40, 58, dz), (-46, 40, dz), 1.6, steel)
    # the mounted gun on the back, with its ammo box; a spare wheel; a star on the door
    cyl((-24, 50, 0), 4, 10, steel, verts=16)
    box((-20, 58, 0), (14, 8, 10), steel, bevel=1.5)
    cyl((-2, 59, 0), 2.6, 30, steel, rot=(0, math.radians(90), 0), verts=16)
    cyl((14, 59, 0), 3.4, 4, steel, rot=(0, math.radians(90), 0), verts=16)
    box((-28, 48, -14), (10, 7, 6), olive2, bevel=1.0)
    torus((-50, 30, 0), 9, 3.4, black, rot=(0, math.radians(90), 0))
    box((-6, 28, -20.5), (14, 10, 0.6), M('panel', '#2f3618', 0.8), bevel=0.4)
    cone((-6, 28, -21.2), 3.4, 0.0, 0.5, M('star', '#e8e4d0', 0.6), rot=(math.radians(90), 0, 0), verts=5)
    BR.B.part('wheel', (0, 15))
    torus((0, 15, 0), 11.5, 4.6, black)
    cyl((0, 15, 0), 8.0, 4.0, steel, rot=(math.radians(90), 0, 0), verts=32, bevel=0.8)
    for i in range(6):
        a = i / 6 * math.tau
        ball((math.cos(a) * 4.5, 15 + math.sin(a) * 4.5, -2.2), 0.9, olive2, seg=8)


# ------------------------------------------------------------------ the jet suit


def jetsuit():
    steel = M('steel', '#2b3240', 0.35, 0.8)
    plate = M('plate', '#dbe3ee', 0.25, 0.6)
    accent = M('accent', '#0ea5e9', 0.3, 0.2)
    glow = M('vent', '#7dd3fc', 0.2, emit='#38bdf8', strength=6.0)
    BR.B.part('pack', (0, 0))
    # the pack on the soldier's back: armoured case, two thrusters, swept fins
    box((0, 0, 4), (12, 22, 10), plate, bevel=2)
    box((0, 0, -1.2), (8, 14, 1.0), accent, bevel=0.4)
    for dz in (-5, 5):
        cyl((-4, -6, dz + 4), 3.6, 16, steel, verts=20)
        cyl((-4, -15, dz + 4), 4.4, 2.5, steel, verts=20)
        cyl((-4, -16.4, dz + 4), 3.2, 0.6, glow, verts=20)
    for s in (-1, 1):
        box((-6, 6, 4 + s * 9), (22, 2, 8), plate, bevel=0.8, rot=(math.radians(s * 12), 0, math.radians(28)))
    ball((0, 9, -1.6), 1.2, glow, seg=10)


RIDES = {
    'horse': horse,
    'tiger': tiger,
    'elephant': elephant,
    'baaz': baaz,
    'bike': bike,
    'jeep': jeep,
    'jetsuit': jetsuit,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ride')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--samples', type=int, default=48)
    a = ap.parse_args()
    BR.OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'mount')
    BR.BOSSES = RIDES
    # seen from a little in front of side-on, so the near side shows its depth
    BR.TURN = {k: -14 for k in RIDES}
    BR.FACES = {}
    for k in RIDES if a.all else [a.ride]:
        BR.render_boss(k, a.samples)


if __name__ == '__main__':
    main()
