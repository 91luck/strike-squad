"""
Astra Saga character style, second generation: heroes and villains that read as warriors, not toys.

What the first generation got wrong (hero_rig.py, villain_rig.py) and what this one does instead, after the way
current action games build their casts (Hades, Prince of Persia: The Lost Crown, Raji, Contra: Operation Galuga):

  first generation                         this one
  chibi: head a third of the body          heroic: about six heads tall, long legs, broad shoulders, narrow waist
  spheres, cylinders and boxes             lofted forms: tapered, muscled limbs and torsos built from cross-sections,
                                           angular armour plates cut from polygons, cloth that hangs and trails
  plastic shine on everything              matte, painted-looking surfaces; metal only where it is metal
  every part a different colour            one saturated colour per character, the rest dark and quiet
  soft round silhouettes                   heroes: a clean V with points; villains: spikes, horns, mass up top
  no line                                  an ink line round every form (Freestyle), thicker on the outside

The joint hierarchy is the same as hero_rig.py's (turn, root, spine, neck, thighs, shins, upper arms, forearms,
aim, grip, foregrip, muzzle), so hero_parts.render_parts cuts the result into parts and client/src/game/rig.ts
animates it unchanged.

    python3 art3d/style2.py --hero 0 --preview out.png         # one hero's parts (+ a preview of the whole figure)
    python3 art3d/style2.py --villain archer --preview out.png  # one villain's
"""

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (before bmesh: bpy sets it up)
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import hero_rig as hr  # noqa: E402
from hero_rig import joint, tone  # noqa: E402

# ------------------------------------------------------------------ materials: matte, painted, a little rim sheen


def matte(name, hexc, rough=0.78, metal=0.0, emit=None, sheen=0.25):
    m = hr.mat(name, hexc, rough=rough, metal=metal, emit=emit, spec=0.2)
    b = m.node_tree.nodes['Principled BSDF']
    try:
        b.inputs['Sheen Weight'].default_value = sheen
        b.inputs['Sheen Tint'].default_value = (1, 1, 1, 1)
    except KeyError:
        pass
    return m


# ------------------------------------------------------------------ forms


def _finish(o, m, parent, smooth=True, sub=0):
    o.data.materials.append(m)
    if sub:
        mod = o.modifiers.new('sub', 'SUBSURF')
        mod.levels = sub
        mod.render_levels = sub
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    if parent is not None:
        hr.attach(o, parent)
    return o


def loft(name, sections, m, parent=None, seg=14, cap=True, sub=1):
    """A form lofted through cross-sections: each (center (x,y,z), rx, ry) is an ellipse in the plane perpendicular
    to the path, rx along the side-view x axis and ry across (toward the camera). Tapered limbs, torsos, horns."""
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new()
    rings = []
    n = len(sections)
    for i, (c, rx, ry) in enumerate(sections):
        c = Vector(c)
        a = Vector(sections[min(i + 1, n - 1)][0]) - Vector(sections[max(i - 1, 0)][0])
        if a.length < 1e-6:
            a = Vector((0, 0, 1))
        a.normalize()
        # a frame: u in the side plane (x-z), v across (y)
        v = Vector((0, 1, 0))
        u = v.cross(a)
        if u.length < 1e-6:
            u = Vector((1, 0, 0))
        u.normalize()
        ring = []
        for k in range(seg):
            t = k / seg * math.tau
            p = c + u * (math.cos(t) * rx) + v * (math.sin(t) * ry)
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(seg):
            bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    if cap:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            c = bm.verts.new(sum((vv.co for vv in ring), Vector()) / seg)
            for k in range(seg):
                f = (ring[k], ring[(k + 1) % seg], c)
                bm.faces.new(tuple(reversed(f)) if rev else f)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.validate()
    return _finish(o, m, parent, sub=sub)


def plate(name, pts, depth, y, m, parent=None, bevel=0.012):
    """An angular armour plate: a polygon in the side plane (x, z points) given thickness across y."""
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new()
    front = [bm.verts.new((x, y - depth / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, y + depth / 2, z)) for x, z in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for k in range(n):
        bm.faces.new((front[k], back[k], back[(k + 1) % n], front[(k + 1) % n]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o.data.materials.append(m)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    if parent is not None:
        hr.attach(o, parent)
    return o


def ellipsoid(name, c, r, m, parent=None, seg=20):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=c, segments=seg, ring_count=seg // 2)
    o = bpy.context.object
    o.name = name
    o.scale = r
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, parent)


def spike(name, base, tip, r, m, parent=None, seg=8):
    """A cone from base to tip (horns, crown points, shoulder spikes)."""
    base, tip = Vector(base), Vector(tip)
    secs = []
    for i in range(6):
        t = i / 5
        secs.append((base.lerp(tip, t) + Vector((0, 0, math.sin(t * math.pi) * 0.0)), r * (1 - t) + 0.002, r * (1 - t) + 0.002))
    return loft(name, secs, m, parent, seg=seg, sub=0)


def curve_spike(name, pts, r, m, parent=None):
    """A curved horn through a few points, tapering to a point."""
    n = len(pts)
    secs = [(p, r * (1 - i / (n - 1)) + 0.003, r * (1 - i / (n - 1)) + 0.003) for i, p in enumerate(pts)]
    return loft(name, secs, m, parent, seg=10, sub=1)


# ------------------------------------------------------------------ the body (shared by heroes and villains)


class Rig:
    pass


def body(R, B, M):
    """Builds the joints and the figure. B: proportions; M: materials (skin, cloth, cloth2, armour, trim, dark)."""
    S = B['s']  # overall scale
    HIP, KNEE, ANK = B['hip'] * S, B['knee'] * S, 0.07 * S
    SH, NECK, HEAD = B['sh'] * S, B['neck'] * S, B['head'] * S
    LY, SY = B['legy'] * S, B['shy'] * S
    hr_ = B['headr'] * S
    R.turn = joint('turn', (0, 0, 0))
    R.root = joint('root', (0, 0, HIP), R.turn)
    R.spine = joint('spine', (0, 0, HIP + 0.05 * S), R.root)
    R.neck = joint('neck', (0, 0, NECK), R.spine)
    R.root_rest = HIP
    R.arm_len = (B['upper'] * S, (B['fore'] + 0.03) * S)
    R.thigh, R.shin, R.upper, R.fore = {}, {}, {}, {}
    mus = B['mus']
    for side, y in (('n', -LY), ('f', LY)):
        far = side == 'f'
        sk = M['skin_f'] if far else M['skin']
        pa = M['legs_f'] if far else M['legs']
        th = joint(f'thigh_{side}', (0, y, HIP), R.root)
        sh = joint(f'shin_{side}', (0, y, KNEE), th)
        R.thigh[side], R.shin[side] = th, sh
        # thigh: full at the top, a swell of muscle, narrowing to the knee
        loft(f'thighm_{side}', [((0.0, y, HIP + 0.04 * S), 0.11 * mus * S, 0.11 * S), ((0.015 * S, y, HIP - 0.12 * S), 0.115 * mus * S, 0.1 * S), ((0.005 * S, y, KNEE + 0.04 * S), 0.075 * mus * S, 0.07 * S), ((0.0, y, KNEE), 0.068 * S, 0.066 * S)], pa, th)
        # shin: calf behind, narrowing to the ankle
        loft(f'shinm_{side}', [((0.0, y, KNEE), 0.068 * S, 0.066 * S), ((-0.018 * S, y, KNEE - 0.1 * S), 0.08 * mus * S, 0.068 * S), ((0.0, y, ANK + 0.08 * S), 0.05 * S, 0.05 * S), ((0.0, y, ANK + 0.02 * S), 0.045 * S, 0.046 * S)], pa, sh)
        # boot / foot: a wedge pointing forward
        bt = M['boot_f'] if far else M['boot']
        loft(f'boot_{side}', [((-0.04 * S, y, ANK + 0.05 * S), 0.06 * S, 0.055 * S), ((0.03 * S, y, ANK - 0.0), 0.075 * S, 0.06 * S), ((0.12 * S, y, ANK - 0.03 * S), 0.04 * S, 0.05 * S), ((0.16 * S, y, ANK - 0.05 * S), 0.012 * S, 0.035 * S)], bt, sh)
        if B.get('greaves'):
            plate(f'greave_{side}', [(0.06 * S, KNEE + 0.02 * S), (0.085 * S, KNEE - 0.08 * S), (0.06 * S, ANK + 0.1 * S), (0.0, ANK + 0.08 * S), (0.0, KNEE - 0.02 * S)], 0.13 * S, y, M['armour_f'] if far else M['armour'], sh)
        # arms
        up = joint(f'upper_{side}', (0, y * SY / LY, SH), R.spine)
        fo = joint(f'fore_{side}', (0, y * SY / LY, SH - B['upper'] * S), up)
        R.upper[side], R.fore[side] = up, fo
        ay = y * SY / LY
        UA, FA = B['upper'] * S, B['fore'] * S
        loft(f'upperm_{side}', [((0.0, ay, SH + 0.02 * S), 0.07 * mus * S, 0.07 * S), ((0.01 * S, ay, SH - UA * 0.35), 0.075 * mus * S, 0.068 * S), ((0.0, ay, SH - UA), 0.05 * S, 0.052 * S)], sk, up)
        loft(f'forem_{side}', [((0.0, ay, SH - UA), 0.05 * S, 0.052 * S), ((0.008 * S, ay, SH - UA - FA * 0.3), 0.06 * mus * S, 0.056 * S), ((0.0, ay, SH - UA - FA + 0.02 * S), 0.04 * S, 0.042 * S)], sk, fo)
        # fist
        ellipsoid(f'hand_{side}', (0.0, ay, SH - UA - FA - 0.03 * S), (0.05 * S, 0.045 * S, 0.06 * S), M['glove_f'] if far else M['glove'], fo)
        if B.get('bracers', True):
            loft(f'bracer_{side}', [((0.0, ay, SH - UA - FA * 0.45), 0.062 * mus * S, 0.06 * S), ((0.0, ay, SH - UA - FA + 0.03 * S), 0.05 * S, 0.05 * S)], M['trim_f'] if far else M['trim'], fo, cap=False, sub=0)
        # shoulder plate: angular, layered
        pd = M['armour_f'] if far else M['armour']
        if B.get('pauldron', True):
            plate(f'pauldron_{side}', [(-0.09 * S, SH + 0.05 * S), (0.0, SH + 0.1 * S), (0.1 * S, SH + 0.04 * S), (0.09 * S, SH - 0.06 * S), (-0.08 * S, SH - 0.05 * S)], 0.15 * S, ay, pd, up)
            plate(f'pauldron2_{side}', [(-0.08 * S, SH - 0.03 * S), (0.09 * S, SH - 0.03 * S), (0.075 * S, SH - 0.11 * S), (-0.06 * S, SH - 0.1 * S)], 0.155 * S, ay, M['trim_f'] if far else M['trim'], up)
    # torso: V from broad shoulders to a narrow waist
    W = B['chest'] * S
    w = B['waist'] * S
    loft('torso', [((0.0, 0, HIP + 0.02 * S), w * 0.95, w * 1.15), ((0.01 * S, 0, HIP + 0.15 * S), w, w * 1.2), ((0.03 * S, 0, SH - 0.17 * S), W * 0.62, W * 1.05), ((0.02 * S, 0, SH - 0.02 * S), W * 0.55, W * 1.1), ((0.0, 0, NECK - 0.02 * S), 0.07 * S, 0.08 * S)], M['chest'], R.spine, seg=18)
    # hips and the cloth hanging from the belt
    loft('pelvis', [((0.0, 0, HIP - 0.06 * S), w * 0.85, w * 1.1), ((0.0, 0, HIP + 0.06 * S), w * 0.95, w * 1.15)], M['legs'], R.root)
    loft('belt', [((0.0, 0, HIP + 0.08 * S), w * 1.0, w * 1.2), ((0.0, 0, HIP + 0.14 * S), w * 1.0, w * 1.2)], M['trim'], R.spine, cap=False, sub=0)
    if B.get('tabard'):
        plate('tabard', [(0.05 * S, HIP + 0.06 * S), (0.13 * S, HIP + 0.06 * S), (0.12 * S, HIP - 0.2 * S), (0.09 * S, HIP - 0.26 * S), (0.06 * S, HIP - 0.2 * S)], 0.12 * S, -0.0, M['cloth'], R.root, bevel=0.006)
        plate('tabard_b', [(-0.03 * S, HIP + 0.08 * S), (-0.13 * S, HIP + 0.08 * S), (-0.15 * S, HIP - 0.2 * S), (-0.05 * S, HIP - 0.24 * S)], 0.05 * S, 0.0, M['cloth'], R.root, bevel=0.006)
    # head: an egg with a jaw, ears; features and headgear are the caller's
    loft('neckm', [((0.0, 0, NECK - 0.04 * S), 0.055 * S, 0.055 * S), ((0.01 * S, 0, HEAD - hr_ * 0.6), 0.05 * S, 0.05 * S)], M['skin'], R.neck)
    loft('head', [((0.02 * S, 0, HEAD - hr_ * 1.0), 0.03 * S, 0.04 * S), ((0.035 * S, 0, HEAD - hr_ * 0.75), hr_ * 0.6, hr_ * 0.7), ((0.02 * S, 0, HEAD - hr_ * 0.2), hr_ * 0.85, hr_ * 0.82), ((0.0, 0, HEAD + hr_ * 0.35), hr_ * 0.85, hr_ * 0.8), ((-0.01 * S, 0, HEAD + hr_ * 0.85), hr_ * 0.45, hr_ * 0.45), ((-0.015 * S, 0, HEAD + hr_ * 1.0), 0.01, 0.01)], M['skin'], R.neck, seg=16)
    return dict(HIP=HIP, KNEE=KNEE, SH=SH, NECK=NECK, HEAD=HEAD, HR=hr_, S=S, SY=SY)


def eyes(R, G, M, glow=None, brow='straight'):
    """A face that reads: almond eyes set into the head with dark irises (or a glow), brows that set the mood, a nose,
    a mouth line."""
    S, HEAD, hr_ = G['S'], G['HEAD'], G['HR']
    fx = 0.02 * S + hr_ * 0.8  # the face's front surface at eye height
    iris = M['dark'] if not glow else M['eye']
    for i, y in enumerate((-0.36, 0.36)):
        if not glow:
            ellipsoid(f'eye{i}', (fx - hr_ * 0.06, y * hr_, HEAD + hr_ * 0.05), (hr_ * 0.12, hr_ * 0.17, hr_ * 0.1), M['eye'], R.neck)
        ellipsoid(f'iris{i}', (fx + hr_ * 0.03, y * hr_ * 0.95, HEAD + hr_ * 0.04), (hr_ * 0.05, hr_ * 0.08, hr_ * 0.085), iris, R.neck)
        lift = 0.0 if brow == 'straight' else (0.12 if i == 0 else -0.12)
        plate(f'brow{i}', [(fx - hr_ * 0.25, HEAD + hr_ * (0.24 + lift)), (fx + hr_ * 0.06, HEAD + hr_ * (0.2 - lift * 0.5)), (fx + hr_ * 0.06, HEAD + hr_ * (0.14 - lift * 0.5)), (fx - hr_ * 0.25, HEAD + hr_ * (0.17 + lift))], hr_ * 0.26, y * hr_, M['dark'], R.neck, bevel=0.003)
    plate('nose', [(fx - hr_ * 0.05, HEAD + hr_ * 0.02), (fx + hr_ * 0.14, HEAD - hr_ * 0.24), (fx - hr_ * 0.03, HEAD - hr_ * 0.27)], hr_ * 0.16, -hr_ * 0.02, M['skin'], R.neck, bevel=0.004)
    plate('mouth', [(fx - hr_ * 0.12, HEAD - hr_ * 0.4), (fx + hr_ * 0.02, HEAD - hr_ * 0.42), (fx + hr_ * 0.02, HEAD - hr_ * 0.46), (fx - hr_ * 0.12, HEAD - hr_ * 0.45)], hr_ * 0.4, 0.0, M['dark'], R.neck, bevel=0.002)
    R.portrait_z = HEAD - hr_ * 0.6


def weapon(R, G, kind, M):
    """The weapon on the aim pivot, with the joints the hands reach for."""
    S, SH = G['S'], G['SH']
    z = SH - 0.18 * S
    R.aim = joint('aim', (0.06 * S, -0.05 * S, z), R.spine)
    a = R.aim
    gy = -G['SY'] - 0.04 * S
    tip = 0.6 * S
    met, dark, trim = M['metal'], M['dark'], M['trim']
    if kind == 'rifle':
        # a sleek long rifle: angular body, a glowing core line in the hero's colour
        plate('gun_body', [(0.02 * S, z + 0.03 * S), (0.38 * S, z + 0.045 * S), (0.5 * S, z + 0.02 * S), (0.5 * S, z - 0.03 * S), (0.24 * S, z - 0.045 * S), (0.1 * S, z - 0.03 * S)], 0.06 * S, gy, met, a)
        plate('gun_glow', [(0.12 * S, z + 0.012 * S), (0.42 * S, z + 0.018 * S), (0.42 * S, z + 0.004 * S), (0.12 * S, z - 0.002 * S)], 0.064 * S, gy, M['glow'], a, bevel=0.002)
        plate('gun_stock', [(-0.16 * S, z + 0.02 * S), (0.04 * S, z + 0.03 * S), (0.04 * S, z - 0.05 * S), (-0.16 * S, z - 0.09 * S)], 0.05 * S, gy, dark, a)
        plate('gun_grip', [(0.13 * S, z - 0.03 * S), (0.19 * S, z - 0.03 * S), (0.16 * S, z - 0.13 * S), (0.11 * S, z - 0.12 * S)], 0.045 * S, gy, dark, a)
        loft('gun_barrel', [((0.5 * S, gy, z), 0.018 * S, 0.018 * S), ((0.7 * S, gy, z), 0.015 * S, 0.015 * S)], met, a, seg=8, sub=0)
        tip = 0.72 * S
        R.grip = joint('grip', (0.16 * S, gy, z - 0.09 * S), a)
        R.foregrip = joint('foregrip', (0.42 * S, gy, z - 0.03 * S), a)
    elif kind == 'bow':
        wood = M['cloth2']
        curve_spike('limb_u', [(0.3 * S, gy, z), (0.33 * S, gy, z + 0.18 * S), (0.27 * S, gy, z + 0.38 * S), (0.2 * S, gy, z + 0.46 * S)], 0.022 * S, wood, a)
        curve_spike('limb_d', [(0.3 * S, gy, z), (0.33 * S, gy, z - 0.18 * S), (0.27 * S, gy, z - 0.38 * S), (0.2 * S, gy, z - 0.46 * S)], 0.022 * S, wood, a)
        loft('string', [((0.2 * S, gy, z + 0.46 * S), 0.004, 0.004), ((0.2 * S, gy, z - 0.46 * S), 0.004, 0.004)], M['bone'], a, seg=4, sub=0)
        tip = 0.34 * S
        R.grip = joint('grip', (0.2 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.3 * S, gy, z), a)
    elif kind in ('sword', 'blades'):
        plate('blade', [(0.2 * S, z + 0.03 * S), (0.75 * S, z + 0.02 * S), (0.86 * S, z), (0.75 * S, z - 0.025 * S), (0.2 * S, z - 0.03 * S)], 0.02 * S, gy, M['steel'], a)
        plate('guard', [(0.17 * S, z + 0.09 * S), (0.21 * S, z + 0.09 * S), (0.21 * S, z - 0.09 * S), (0.17 * S, z - 0.09 * S)], 0.05 * S, gy, trim, a)
        loft('hilt', [((0.04 * S, gy, z), 0.025 * S, 0.025 * S), ((0.17 * S, gy, z), 0.025 * S, 0.025 * S)], dark, a, seg=8, sub=0)
        tip = 0.86 * S
        R.grip = joint('grip', (0.1 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.12 * S, gy, z), a)
    elif kind == 'mace':
        loft('haft', [((-0.02 * S, gy, z), 0.026 * S, 0.026 * S), ((0.55 * S, gy, z + 0.02 * S), 0.03 * S, 0.03 * S)], trim, a, seg=8, sub=0)
        ellipsoid('macehead', (0.66 * S, gy, z + 0.02 * S), (0.13 * S, 0.13 * S, 0.15 * S), met, a)
        for i in range(8):
            t = i / 8 * math.tau
            c = Vector((0.66 * S, gy, z + 0.02 * S))
            d = Vector((math.cos(t), 0, math.sin(t)))
            spike(f'mstud{i}', c + d * 0.11 * S, c + d * 0.2 * S, 0.035 * S, trim, a)
        tip = 0.8 * S
        R.grip = joint('grip', (0.08 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.3 * S, gy, z + 0.01 * S), a)
    elif kind == 'trident':
        loft('shaft', [((-0.3 * S, gy, z), 0.02 * S, 0.02 * S), ((0.72 * S, gy, z + 0.03 * S), 0.02 * S, 0.02 * S)], M['cloth2'], a, seg=8, sub=0)
        for i, dz in enumerate((-0.07, 0.0, 0.07)):
            spike(f'prong{i}', (0.72 * S, gy, z + 0.03 * S + dz * S), (0.9 * S, gy, z + 0.03 * S + dz * 1.4 * S), 0.02 * S, met, a)
        tip = 0.9 * S
        R.grip = joint('grip', (0.1 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.4 * S, gy, z + 0.015 * S), a)
    elif kind == 'staff':
        loft('staffm', [((-0.25 * S, gy, z), 0.022 * S, 0.022 * S), ((0.7 * S, gy, z + 0.03 * S), 0.022 * S, 0.022 * S)], M['cloth2'], a, seg=8, sub=0)
        ellipsoid('orb', (0.77 * S, gy, z + 0.035 * S), (0.065 * S, 0.065 * S, 0.065 * S), M['glow'], a)
        for i in range(4):
            t = i / 4 * math.tau + 0.4
            spike(f'claw{i}', (0.7 * S, gy, z + 0.03 * S), (0.78 * S + math.cos(t) * 0.05 * S, gy, z + 0.03 * S + math.sin(t) * 0.09 * S), 0.012 * S, trim, a)
        tip = 0.8 * S
        R.grip = joint('grip', (0.08 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.38 * S, gy, z + 0.015 * S), a)
    elif kind == 'disc':
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17 * S, minor_radius=0.03 * S, location=(0.48 * S, gy, z), rotation=(math.pi / 2, 0, 0))
        _finish(bpy.context.object, met, a)
        for i in range(10):
            t = i / 10 * math.tau
            c = Vector((0.48 * S, gy, z))
            d = Vector((math.cos(t), 0, math.sin(t)))
            spike(f'dtooth{i}', c + d * 0.18 * S, c + d * 0.26 * S + Vector((math.cos(t + 1.6), 0, math.sin(t + 1.6))) * 0.04 * S, 0.03 * S, M['glow'], a)
        tip = 0.6 * S
        R.grip = joint('grip', (0.28 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.31 * S, gy, z), a)
    elif kind == 'torch':
        loft('torchhaft', [((0.0, gy, z), 0.022 * S, 0.022 * S), ((0.45 * S, gy, z + 0.12 * S), 0.025 * S, 0.025 * S)], M['cloth2'], a, seg=8, sub=0)
        for i, (dx, dz, r) in enumerate(((0.47, 0.17, 0.06), (0.5, 0.24, 0.045), (0.46, 0.27, 0.035))):
            ellipsoid(f'flame{i}', (dx * S, gy, z + dz * S), (r * S, r * S, r * 1.6 * S), M['glow'], a)
        tip = 0.5 * S
        R.grip = joint('grip', (0.1 * S, gy, z + 0.02 * S), a)
        R.foregrip = joint('foregrip', (0.3 * S, gy, z + 0.08 * S), a)
    elif kind == 'drum':
        loft('drumbody', [((0.18 * S, gy + 0.05 * S, z - 0.1 * S), 0.0, 0.0), ((0.18 * S, gy + 0.05 * S, z - 0.1 * S), 0.19 * S, 0.19 * S), ((0.45 * S, gy + 0.05 * S, z - 0.1 * S), 0.19 * S, 0.19 * S), ((0.45 * S, gy + 0.05 * S, z - 0.1 * S), 0.0, 0.0)], M['cloth2'], a, seg=18, sub=0)
        tip = 0.5 * S
        R.grip = joint('grip', (0.2 * S, gy, z + 0.05 * S), a)
        R.foregrip = joint('foregrip', (0.44 * S, gy, z + 0.05 * S), a)
    elif kind == 'conch':
        ellipsoid('shell', (0.42 * S, gy, z), (0.18 * S, 0.1 * S, 0.11 * S), M['bone'], a)
        spike('shellspire', (0.26 * S, gy, z), (0.1 * S, gy, z + 0.02 * S), 0.09 * S, M['bone'], a)
        tip = 0.6 * S
        R.grip = joint('grip', (0.3 * S, gy, z - 0.03 * S), a)
        R.foregrip = joint('foregrip', (0.5 * S, gy, z - 0.03 * S), a)
    elif kind == 'lamp':
        loft('chain', [((0.35 * S, gy, z), 0.006, 0.006), ((0.35 * S, gy, z - 0.2 * S), 0.006, 0.006)], met, a, seg=4, sub=0)
        ellipsoid('lampskull', (0.35 * S, gy, z - 0.27 * S), (0.08 * S, 0.075 * S, 0.075 * S), M['bone'], a)
        ellipsoid('lampglow', (0.4 * S, gy, z - 0.27 * S), (0.05 * S, 0.05 * S, 0.05 * S), M['glow'], a)
        tip = 0.42 * S
        R.grip = joint('grip', (0.35 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.36 * S, gy, z), a)
    elif kind == 'sling':
        loft('cord', [((0.3 * S, gy, z), 0.006, 0.006), ((0.5 * S, gy, z - 0.2 * S), 0.006, 0.006)], dark, a, seg=4, sub=0)
        ellipsoid('stone', (0.52 * S, gy, z - 0.23 * S), (0.045 * S, 0.045 * S, 0.045 * S), M['metal'], a)
        tip = 0.55 * S
        R.grip = joint('grip', (0.3 * S, gy, z), a)
        R.foregrip = joint('foregrip', (0.32 * S, gy, z), a)
    else:  # fists
        tip = 0.3 * S
        R.grip = joint('grip', (0.25 * S, gy, z - 0.05 * S), a)
        R.foregrip = joint('foregrip', (0.3 * S, gy - 0.1 * S, z - 0.02 * S), a)
    R.muzzle = joint('muzzle', (tip, gy, z), a)
    R.knife = []


# ------------------------------------------------------------------ heroes

HERO_BODY = dict(s=1.0, hip=0.86, knee=0.47, sh=1.36, neck=1.43, head=1.58, headr=0.155, legy=0.1, shy=0.22, chest=0.24, waist=0.15, mus=1.0, upper=0.3, fore=0.28, tabard=True, greaves=True)


def build_hero(H):
    """A hero: heroic proportions, dark armour over cloth in the hero's colour, a long scarf, a glowing rifle."""
    col = H['color']
    M = dict(
        skin=matte('skin', H['skin'], rough=0.6, sheen=0.4),
        skin_f=matte('skin_f', tone(H['skin'], -0.25), rough=0.6),
        legs=matte('legs', '#2a2c33'),
        legs_f=matte('legs_f', '#1c1d22'),
        chest=matte('chest', tone(col, -0.45), rough=0.75),
        cloth=matte('cloth', tone(col, -0.35)),
        cloth2=matte('cloth2', col),
        armour=matte('armour', '#3a3d46', rough=0.42, metal=0.75),
        armour_f=matte('armour_f', '#25272e', rough=0.45, metal=0.7),
        trim=matte('trim', '#c9a24a', rough=0.35, metal=0.9),
        trim_f=matte('trim_f', '#8a6c2c', rough=0.4, metal=0.85),
        boot=matte('boot', '#1e1a18', rough=0.55),
        boot_f=matte('boot_f', '#131110', rough=0.55),
        glove=matte('glove', '#1e1a18', rough=0.55),
        glove_f=matte('glove_f', '#131110', rough=0.55),
        dark=matte('dark', '#141217'),
        eye=matte('eye', '#f6f3ea', rough=0.3),
        metal=matte('metal', '#30343c', rough=0.35, metal=0.8),
        glow=matte('glow', H['accent'], rough=0.2, emit=H['accent']),
        steel=matte('steel', '#d8dee6', rough=0.15, metal=0.95),
        bone=matte('bone', '#e8dcc0'),
    )
    R = Rig()
    G = body(R, HERO_BODY, M)
    S, HEAD, NECK, hr_ = G['S'], G['HEAD'], G['NECK'], G['HR']
    eyes(R, G, M, brow='straight')
    hair = matte('hair', H['hair'])
    # hair: swept back in angular locks
    loft('hairm', [((-0.03, 0, HEAD + hr_ * 0.2), hr_ * 0.88, hr_ * 0.86), ((-0.05, 0, HEAD + hr_ * 0.65), hr_ * 0.75, hr_ * 0.78), ((-0.06, 0, HEAD + hr_ * 1.02), hr_ * 0.4, hr_ * 0.5)], hair, R.neck)
    for i, (x, z, tx, tz) in enumerate(((0.06, 0.95, -0.2, 1.15), (0.0, 1.0, -0.26, 0.95), (-0.06, 0.8, -0.3, 0.6))):
        spike(f'lock{i}', (x * hr_ * 5, 0, HEAD + hr_ * z), (tx * hr_ * 5, 0, HEAD + hr_ * tz), hr_ * 0.35, hair, R.neck)
    # headgear by hero (kept to its idea, drawn sharper)
    kind = H['headgear']
    gear = M['cloth2']
    if kind in ('bandana', 'headband'):
        loft('band', [((0.0, 0, HEAD + hr_ * 0.38), hr_ * 0.9, hr_ * 0.88), ((0.0, 0, HEAD + hr_ * 0.55), hr_ * 0.86, hr_ * 0.84)], gear, R.neck, cap=False, sub=0)
        for i, dz in enumerate((0.0, -0.1)):
            plate(f'tail{i}', [(-hr_ * 0.8, HEAD + hr_ * (0.5 + dz)), (-hr_ * 1.9, HEAD + hr_ * (0.3 + dz * 3)), (-hr_ * 1.8, HEAD + hr_ * (0.15 + dz * 3)), (-hr_ * 0.8, HEAD + hr_ * (0.38 + dz))], 0.02, 0.0, gear, R.neck, bevel=0.004)
    elif kind in ('helmet', 'visor', 'cap', 'beret'):
        loft('helm', [((0.0, 0, HEAD + hr_ * 0.15), hr_ * 0.95, hr_ * 0.92), ((0.0, 0, HEAD + hr_ * 0.75), hr_ * 0.85, hr_ * 0.84), ((-0.02, 0, HEAD + hr_ * 1.1), hr_ * 0.3, hr_ * 0.3)], M['armour'], R.neck)
        plate('helmcrest', [(-hr_ * 0.9, HEAD + hr_ * 0.9), (hr_ * 0.4, HEAD + hr_ * 1.25), (hr_ * 0.2, HEAD + hr_ * 0.95)], 0.03, 0.0, gear, R.neck)
        if kind == 'visor':
            plate('visorm', [(hr_ * 0.6, HEAD + hr_ * 0.25), (hr_ * 0.98, HEAD + hr_ * 0.2), (hr_ * 0.98, HEAD - hr_ * 0.05), (hr_ * 0.6, HEAD)], hr_ * 1.3, 0.0, M['glow'], R.neck)
    else:
        loft('hood', [((-0.02, 0, HEAD - hr_ * 0.3), hr_ * 1.0, hr_ * 0.98), ((-0.02, 0, HEAD + hr_ * 0.6), hr_ * 0.95, hr_ * 0.95), ((-0.06, 0, HEAD + hr_ * 1.15), hr_ * 0.25, hr_ * 0.3)], gear, R.neck)
    # the scarf: a knot at the collar, two long tails streaming back and down
    sc = M['cloth2']
    loft('scarfknot', [((-0.02, 0, NECK - 0.03), 0.09, 0.1), ((-0.02, 0, NECK + 0.03), 0.085, 0.095)], sc, R.spine, sub=1)
    loft('scarf1', [((-0.07, 0.02, NECK), 0.05, 0.02), ((-0.22, 0.03, NECK - 0.04), 0.055, 0.018), ((-0.38, 0.04, NECK - 0.12), 0.05, 0.016), ((-0.52, 0.05, NECK - 0.24), 0.035, 0.012), ((-0.62, 0.05, NECK - 0.34), 0.005, 0.005)], sc, R.spine, seg=10, sub=1)
    loft('scarf2', [((-0.06, -0.02, NECK - 0.03), 0.04, 0.018), ((-0.17, -0.03, NECK - 0.12), 0.04, 0.016), ((-0.26, -0.03, NECK - 0.26), 0.03, 0.012), ((-0.3, -0.03, NECK - 0.36), 0.004, 0.004)], M['cloth'], R.spine, seg=10, sub=1)
    # chest armour: an angular plate with the hero's light down its centre
    SH = G['SH']
    plate('cuirass', [(0.02, SH - 0.02), (0.2, SH - 0.08), (0.19, SH - 0.32), (0.12, SH - 0.42), (0.02, SH - 0.44)], 0.4, 0.0, M['armour'], R.spine)
    plate('cuirass_glow', [(0.18, SH - 0.14), (0.2, SH - 0.15), (0.19, SH - 0.32), (0.17, SH - 0.32)], 0.41, 0.0, M['glow'], R.spine, bevel=0.002)

    # VISUAL MODEL PASS: layered silhouette details, designed to remain attached to
    # the existing skeletal joints so the animation and hitbox contracts stay intact.
    # A small raised insignia gives every hero a readable chest identity.
    plate('hero_crest_outer', [(0.035, SH - 0.12), (0.105, SH - 0.16), (0.105, SH - 0.25), (0.035, SH - 0.29), (-0.035, SH - 0.25), (-0.035, SH - 0.16)], 0.425, -0.015, M['trim'], R.spine, bevel=0.006)
    plate('hero_crest_core', [(0.035, SH - 0.155), (0.075, SH - 0.18), (0.035, SH - 0.245), (-0.005, SH - 0.18)], 0.44, -0.018, M['glow'], R.spine, bevel=0.003)

    # Layered abdominal plates and reinforced belt hardware.
    for i, zoff in enumerate((0.47, 0.55, 0.63)):
        plate(f'ab_plate_{i}', [(-0.015, SH - zoff), (0.16, SH - zoff - 0.015), (0.145, SH - zoff - 0.075), (0.0, SH - zoff - 0.085)], 0.405, 0.0, M['armour_f'] if i == 1 else M['armour'], R.spine, bevel=0.004)
    plate('belt_buckle', [(-0.025, G['HIP'] + 0.08), (0.09, G['HIP'] + 0.08), (0.09, G['HIP'] - 0.005), (-0.025, G['HIP'] - 0.005)], 0.24, -0.205, M['trim'], R.root, bevel=0.006)
    for side in (-1, 1):
        x = side * 0.17
        plate(f'utility_pouch_{side}', [(x - 0.055, G['HIP'] + 0.04), (x + 0.055, G['HIP'] + 0.04), (x + 0.05, G['HIP'] - 0.11), (x - 0.05, G['HIP'] - 0.11)], 0.12, -0.19, M['cloth'], R.root, bevel=0.008)
        plate(f'pouch_flap_{side}', [(x - 0.05, G['HIP'] + 0.015), (x + 0.05, G['HIP'] + 0.015), (x + 0.045, G['HIP'] - 0.035), (x - 0.045, G['HIP'] - 0.035)], 0.135, -0.205, M['trim_f'], R.root, bevel=0.004)

    # Engraved shoulder plates and forearm guards add a crafted, premium finish.
    for side, y in (('near', -0.205), ('far', 0.205)):
        plate(f'shoulder_badge_{side}', [(-0.12, SH + 0.04), (0.0, SH + 0.105), (0.12, SH + 0.04), (0.08, SH - 0.055), (-0.08, SH - 0.055)], 0.12, y, M['trim'] if side == 'near' else M['trim_f'], R.spine, bevel=0.006)
        plate(f'bracer_inlay_{side}', [(-0.035, SH - 0.48), (0.08, SH - 0.46), (0.075, SH - 0.55), (-0.03, SH - 0.57)], 0.12, y, M['glow'], R.spine, bevel=0.003)

    weapon(R, G, 'rifle', M)
    return R


# ------------------------------------------------------------------ villains

VILLAINS = {
    # kind: skin, focus colour, eye, head, weapon, body tweaks
    'archer': dict(skin='#7a2a26', focus='#c8402a', eye='#ffd23f', head='horns', weapon='bow', s=1.0, mus=1.0, chest=0.26, waist=0.15),
    'drummer': dict(skin='#6a3e24', focus='#b02818', eye='#ff7a1a', head='topknot', weapon='drum', s=0.98, mus=1.25, chest=0.32, waist=0.24),
    'chakri': dict(skin='#2e4a7a', focus='#e0b040', eye='#7af0ff', head='crown', weapon='disc', s=1.0, mus=1.05, chest=0.27, waist=0.15),
    'rathi': dict(skin='#6a4630', focus='#b03020', eye='#ff3a2a', head='crest', weapon='sword', s=1.05, mus=1.15, chest=0.29, waist=0.16),
    'netter': dict(skin='#2e5232', focus='#9ac040', eye='#d4ff3a', head='horns', weapon='trident', s=1.0, mus=1.05, chest=0.27, waist=0.16),
    'pehlwan': dict(skin='#8a3a24', focus='#d02a1c', eye='#ffb02e', head='bald', weapon='fists', s=1.06, mus=1.5, chest=0.36, waist=0.22),
    'gadadhar': dict(skin='#4a2e5a', focus='#d8a83a', eye='#ff5ad8', head='crown', weapon='mace', s=1.06, mus=1.35, chest=0.34, waist=0.19),
    'slinger': dict(skin='#5a5a2e', focus='#c08a3a', eye='#ffe14a', head='band', weapon='sling', s=0.97, mus=0.95, chest=0.24, waist=0.14),
    'conch': dict(skin='#1e6a6a', focus='#e8d8a8', eye='#9af0ff', head='fins', weapon='conch', s=0.98, mus=1.05, chest=0.27, waist=0.16),
    'dancer': dict(skin='#6a2a6a', focus='#e04aa8', eye='#ffd0ff', head='veil', weapon='blades', s=1.0, mus=0.85, chest=0.22, waist=0.12),
    'mashaal': dict(skin='#4a2014', focus='#ff7a1a', eye='#ff8a1a', head='horns', weapon='torch', s=1.02, mus=1.1, chest=0.28, waist=0.16),
    'mayavi': dict(skin='#3a2a6a', focus='#a070ff', eye='#c08aff', head='hood', weapon='staff', s=1.04, mus=0.9, chest=0.25, waist=0.15),
    'lantern': dict(skin='#6a7a7a', focus='#7affc8', eye='#9affd8', head='skull', weapon='lamp', s=0.98, mus=0.95, chest=0.25, waist=0.15),
    'imp': dict(skin='#b8301a', focus='#ffb02e', eye='#fff07a', head='flame', weapon='fists', s=0.72, mus=1.2, chest=0.28, waist=0.17),
}


def build_villain(kind):
    V = VILLAINS[kind]
    skin, focus = V['skin'], V['focus']
    M = dict(
        skin=matte('skin', skin, rough=0.55, sheen=0.5),
        skin_f=matte('skin_f', tone(skin, -0.3), rough=0.6),
        legs=matte('legs', '#1e1a1c'),
        legs_f=matte('legs_f', '#141113'),
        chest=matte('chest', skin, rough=0.55, sheen=0.5),
        cloth=matte('cloth', tone(focus, -0.45)),
        cloth2=matte('cloth2', focus),
        armour=matte('armour', '#2a2626', rough=0.4, metal=0.75),
        armour_f=matte('armour_f', '#1a1818', rough=0.45, metal=0.7),
        trim=matte('trim', '#b8862c', rough=0.35, metal=0.9),
        trim_f=matte('trim_f', '#7a5a1c', rough=0.4, metal=0.85),
        boot=matte('boot', '#1a1414'),
        boot_f=matte('boot_f', '#100c0c'),
        glove=matte('glove', skin, rough=0.55),
        glove_f=matte('glove_f', tone(skin, -0.3), rough=0.6),
        dark=matte('dark', '#0e0a0c'),
        eye=matte('eye', V['eye'], rough=0.2, emit=V['eye']),
        metal=matte('metal', '#2e2a2a', rough=0.35, metal=0.8),
        glow=matte('glow', V['eye'], rough=0.2, emit=V['eye']),
        steel=matte('steel', '#c8ced6', rough=0.15, metal=0.95),
        bone=matte('bone', '#e2d4b4'),
    )
    B = dict(HERO_BODY)
    B.update(s=V['s'], mus=V['mus'], chest=V['chest'], waist=V['waist'], headr=0.14, shy=0.22 + (V['chest'] - 0.24) * 0.6, tabard=True, greaves=True)
    # villains: a heavier upper body and a smaller head (mass up top, a menacing silhouette)
    B['sh'] = 1.34
    B['neck'] = 1.4
    B['head'] = 1.53
    R = Rig()
    G = body(R, B, M)
    S, HEAD, hr_, SH = G['S'], G['HEAD'], G['HR'], G['SH']
    eyes(R, G, M, glow=True, brow='angry')
    # a jutting jaw with tusks
    loft('jaw', [((hr_ * 0.2, 0, HEAD - hr_ * 0.75), hr_ * 0.5, hr_ * 0.75), ((hr_ * 0.55, 0, HEAD - hr_ * 0.55), hr_ * 0.45, hr_ * 0.7)], M['skin'], R.neck)
    for i, y in enumerate((-0.35, 0.35)):
        spike(f'tusk{i}', (hr_ * 0.85, y * hr_, HEAD - hr_ * 0.55), (hr_ * 1.0, y * hr_ * 1.1, HEAD - hr_ * 0.15), hr_ * 0.1, M['bone'], R.neck)
    head = V['head']
    bone = M['bone']
    if head in ('horns', 'flame'):
        for i, y in enumerate((-1, 1)):
            curve_spike(f'horn{i}', [(hr_ * 0.1, y * hr_ * 0.6, HEAD + hr_ * 0.6), (-hr_ * 0.3, y * hr_ * 1.1, HEAD + hr_ * 1.2), (-hr_ * 1.0, y * hr_ * 1.2, HEAD + hr_ * 1.6), (-hr_ * 1.3, y * hr_ * 1.0, HEAD + hr_ * 2.3)], hr_ * 0.28, bone, R.neck)
        if head == 'flame':
            for i, (dx, dz, r) in enumerate(((-0.1, 0.9, 0.5), (0.1, 1.2, 0.35), (-0.35, 1.25, 0.3))):
                ellipsoid(f'fl{i}', (dx * hr_, 0, HEAD + dz * hr_), (r * hr_, r * hr_, r * 1.8 * hr_), M['glow'], R.neck)
        else:
            loft('mane', [((-hr_ * 0.2, 0, HEAD + hr_ * 0.2), hr_ * 0.9, hr_ * 0.9), ((-hr_ * 0.6, 0, HEAD - hr_ * 0.4), hr_ * 0.7, hr_ * 0.75), ((-hr_ * 0.9, 0, HEAD - hr_ * 1.6), hr_ * 0.2, hr_ * 0.3)], M['dark'], R.neck)
    elif head == 'crown':
        for i in range(7):
            t = (i - 3) / 3
            plate(f'crown{i}', [(t * hr_ * 0.7 - hr_ * 0.12, HEAD + hr_ * 0.7), (t * hr_ * 0.75, HEAD + hr_ * (1.6 - abs(t) * 0.5)), (t * hr_ * 0.7 + hr_ * 0.12, HEAD + hr_ * 0.7)], hr_ * 1.7, 0.0, M['trim'], R.neck)
        loft('crownband', [((0, 0, HEAD + hr_ * 0.55), hr_ * 0.9, hr_ * 0.88), ((0, 0, HEAD + hr_ * 0.75), hr_ * 0.9, hr_ * 0.88)], M['trim'], R.neck, cap=False, sub=0)
    elif head == 'crest':
        loft('helm', [((0, 0, HEAD - hr_ * 0.1), hr_ * 0.98, hr_ * 0.95), ((0, 0, HEAD + hr_ * 0.7), hr_ * 0.85, hr_ * 0.85), ((-0.02, 0, HEAD + hr_ * 1.05), hr_ * 0.3, hr_ * 0.3)], M['armour'], R.neck)
        plate('crestm', [(hr_ * 0.5, HEAD + hr_ * 0.9), (-hr_ * 0.4, HEAD + hr_ * 1.8), (-hr_ * 2.0, HEAD + hr_ * 1.3), (-hr_ * 0.6, HEAD + hr_ * 0.9)], 0.04, 0.0, M['cloth2'], R.neck)
        for i, y in enumerate((-1, 1)):
            spike(f'helmhorn{i}', (0, y * hr_ * 0.85, HEAD + hr_ * 0.5), (-hr_ * 0.2, y * hr_ * 1.5, HEAD + hr_ * 1.2), hr_ * 0.15, M['trim'], R.neck)
    elif head == 'topknot':
        ellipsoid('knot', (-hr_ * 0.2, 0, HEAD + hr_ * 1.1), (hr_ * 0.35, hr_ * 0.35, hr_ * 0.5), M['dark'], R.neck)
        loft('band', [((0, 0, HEAD + hr_ * 0.45), hr_ * 0.9, hr_ * 0.88), ((0, 0, HEAD + hr_ * 0.62), hr_ * 0.88, hr_ * 0.86)], M['trim'], R.neck, cap=False, sub=0)
    elif head == 'band':
        loft('band', [((0, 0, HEAD + hr_ * 0.4), hr_ * 0.9, hr_ * 0.88), ((0, 0, HEAD + hr_ * 0.6), hr_ * 0.88, hr_ * 0.86)], M['cloth2'], R.neck, cap=False, sub=0)
        plate('bandtail', [(-hr_ * 0.8, HEAD + hr_ * 0.55), (-hr_ * 2.0, HEAD + hr_ * 0.2), (-hr_ * 1.9, HEAD), (-hr_ * 0.8, HEAD + hr_ * 0.4)], 0.02, 0.0, M['cloth2'], R.neck, bevel=0.004)
    elif head == 'fins':
        for i, y in enumerate((-1, 1)):
            plate(f'fin{i}', [(0.0, HEAD + hr_ * 0.3), (-hr_ * 1.6, HEAD + hr_ * 1.0), (-hr_ * 1.2, HEAD + hr_ * 0.2), (-hr_ * 0.2, HEAD - hr_ * 0.3)], 0.02, y * hr_ * 0.85, M['cloth2'], R.neck)
        plate('crestfin', [(hr_ * 0.4, HEAD + hr_ * 0.8), (-hr_ * 0.4, HEAD + hr_ * 1.7), (-hr_ * 1.6, HEAD + hr_ * 1.0)], 0.03, 0.0, M['cloth2'], R.neck)
    elif head == 'veil':
        loft('hairv', [((-hr_ * 0.1, 0, HEAD + hr_ * 0.2), hr_ * 0.92, hr_ * 0.9), ((-hr_ * 0.6, 0, HEAD - hr_ * 0.6), hr_ * 0.6, hr_ * 0.7), ((-hr_ * 0.8, 0, HEAD - hr_ * 2.2), hr_ * 0.15, hr_ * 0.3)], M['dark'], R.neck)
        for i in range(5):
            t = (i - 2) / 2
            plate(f'tiara{i}', [(t * hr_ * 0.6 - hr_ * 0.08, HEAD + hr_ * 0.65), (t * hr_ * 0.6, HEAD + hr_ * (1.15 - abs(t) * 0.3)), (t * hr_ * 0.6 + hr_ * 0.08, HEAD + hr_ * 0.65)], hr_ * 1.6, 0.0, M['trim'], R.neck)
        plate('veilm', [(hr_ * 0.6, HEAD - hr_ * 0.1), (hr_ * 1.0, HEAD - hr_ * 0.15), (hr_ * 0.9, HEAD - hr_ * 0.9), (hr_ * 0.5, HEAD - hr_ * 0.8)], hr_ * 1.5, 0.0, M['cloth2'], R.neck, bevel=0.003)
    elif head == 'hood':
        loft('hood', [((-0.02, 0, HEAD - hr_ * 0.5), hr_ * 1.1, hr_ * 1.05), ((-0.02, 0, HEAD + hr_ * 0.6), hr_ * 1.05, hr_ * 1.0), ((-hr_ * 0.9, 0, HEAD + hr_ * 1.6), hr_ * 0.1, hr_ * 0.15)], M['cloth'], R.neck)
        plate('hoodrim', [(hr_ * 0.4, HEAD + hr_ * 0.9), (hr_ * 1.05, HEAD + hr_ * 0.3), (hr_ * 0.95, HEAD - hr_ * 0.7), (hr_ * 0.75, HEAD - hr_ * 0.7), (hr_ * 0.8, HEAD + hr_ * 0.25), (hr_ * 0.3, HEAD + hr_ * 0.75)], hr_ * 2.0, 0.0, M['trim'], R.neck)
    elif head == 'skull':
        loft('skullhelm', [((0.01, 0, HEAD - hr_ * 0.3), hr_ * 1.0, hr_ * 0.95), ((0.01, 0, HEAD + hr_ * 0.6), hr_ * 0.95, hr_ * 0.92), ((-0.01, 0, HEAD + hr_ * 1.05), hr_ * 0.3, hr_ * 0.3)], bone, R.neck)
        for i, y in enumerate((-1, 1)):
            curve_spike(f'skhorn{i}', [(0, y * hr_ * 0.7, HEAD + hr_ * 0.6), (-hr_ * 0.5, y * hr_ * 1.3, HEAD + hr_ * 0.9), (-hr_ * 1.1, y * hr_ * 1.3, HEAD + hr_ * 0.5)], hr_ * 0.22, bone, R.neck)
    # shoulder spikes and a skull at the belt: menace up top
    for side, y in (('n', -G['SY']), ('f', G['SY'])):
        for k, dx in enumerate((-0.05, 0.03)):
            spike(f'pspike_{side}{k}', (dx * S, y, SH + 0.07 * S), (dx * S - 0.04 * S, y * 1.15, SH + 0.2 * S), 0.035 * S, M['trim_f'] if side == 'f' else M['trim'], R.upper[side])
    ellipsoid('beltskull', (G['S'] * 0.15, 0, G['HIP'] + 0.11 * S), (0.035 * S, 0.05 * S, 0.045 * S), bone, R.spine)
    weapon(R, G, V['weapon'], M)
    return R


# ------------------------------------------------------------------ main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', type=int, default=-1)
    ap.add_argument('--villain', default='')
    ap.add_argument('--out', default='art3d/out/parts')
    ap.add_argument('--samples', type=int, default=40)
    ap.add_argument('--preview', default='')
    ap.add_argument('--ink', type=float, default=0.0, help='ink line width in output px (0: none)')
    a = ap.parse_args()
    import hero_parts as hp

    sc = hr.reset()
    sc.cycles.samples = a.samples
    if a.ink > 0:
        sc.render.use_freestyle = True
        sc.render.line_thickness_mode = 'ABSOLUTE'
        sc.render.line_thickness = a.ink * hr.SS
        for ls in sc.view_layers[0].freestyle_settings.linesets:
            if ls.linestyle is None:
                ls.linestyle = bpy.data.linestyles.new('ink')
            ls.linestyle.thickness = a.ink * hr.SS
            ls.linestyle.color = (0.06, 0.04, 0.07)
            ls.select_crease = True
            ls.select_border = False
    # brighter and warmer than the first generation: matte forms need the light
    sc.view_settings.exposure = 0.55
    if a.villain:
        R = build_villain(a.villain)
        out = os.path.join(a.out, f'v-{a.villain}')
    else:
        heroes = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'heroes.json')))
        R = build_hero(next(h for h in heroes if h['id'] == a.hero))
        out = os.path.join(a.out, f'h{a.hero}')
    hp.render_parts(sc, R, out, a.preview)


if __name__ == '__main__':
    main()
