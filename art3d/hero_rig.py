"""
STRIKE SQUAD hero sprites, built and rendered in Blender (headless, `bpy`).

Each hero is modelled in code (stylised, big-headed soldier: boots, pants, shirt in the hero colour, tactical vest,
gloves, a head with big readable eyes, the hero's own headgear, a rifle with a stripe of the hero colour) and posed
with a hierarchy of joint empties (hips, spine, neck, thighs, shins, upper arms, forearms, an aim pivot that carries
the rifle). The arms reach the rifle's grips with an analytic two-bone IK, so every aim angle is held properly.

Rendered with Cycles (CPU) from an orthographic side camera, character turned a little toward the viewer, a key light
from the upper left and a rim light from behind, a dark Freestyle outline (the game's pixel sprites have one too).

Usage (from the repo root):
    python3 art3d/hero_rig.py --hero 0 --out art3d/out [--only idle:0:f] [--samples 16]
writes art3d/out/h<id>/<pose>_<frame>_<aim>.png at 2x the game's HD sprite size plus a meta.json with the muzzle
position of every frame. art3d/pack.py turns them into the atlas the game loads.
"""

import argparse
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# ------------------------------------------------------------------ sprite geometry (must match client/src/game/hero-hd.ts)
HD_W, HD_H, HD_FEET, HD_CENTER = 96, 100, 96, 40
SS = 2  # supersampling: rendered at 2x, downscaled when packed
PX = 1.8 / 88.0  # world units per HD pixel: a 1.8-unit tall hero is 88 HD px (44 game px)

POSES = {
    'idle': 2,
    'run': 8,
    'jump': 1,
    'fall': 1,
    'crouch': 1,
    'down': 1,
    'slide': 1,
    'dash': 1,
    'melee': 2,
    'flip': 1,
}
AIMED = {'idle', 'run', 'jump', 'fall', 'crouch'}
AIMS = {'f': 0.0, 'uf': 45.0, 'u': 88.0, 'df': -45.0, 'd': -88.0}
OUTLINE = (0x14 / 255, 0x10 / 255, 0x19 / 255)


def srgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def tone(h, k):
    """Lighten (k > 0) or darken (k < 0) a hex colour."""
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    c = [int(h[i : i + 2], 16) for i in (0, 2, 4)]
    c = [round(x + (255 - x) * k) if k > 0 else round(x * (1 + k)) for x in c]
    return '#%02x%02x%02x' % tuple(max(0, min(255, x)) for x in c)


# ------------------------------------------------------------------ scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = False
    sc.render.film_transparent = True
    sc.render.resolution_x = HD_W * SS
    sc.render.resolution_y = HD_H * SS
    sc.render.resolution_percentage = 100
    sc.render.filter_size = 1.2
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.38, 0.42, 0.52, 1)
    bg.inputs[1].default_value = 0.42
    # outline
    sc.render.use_freestyle = False  # (the outline is drawn when packing: art3d/pack.py)
    sc.render.line_thickness_mode = 'ABSOLUTE'
    sc.render.line_thickness = 1.6 * SS / 2
    ls = sc.view_layers[0].freestyle_settings.linesets.new('outline')
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = False
    ls.linestyle.color = OUTLINE
    ls.linestyle.thickness = 1.6 * SS / 2
    return sc


MATS = {}


def mat(name, hexc, rough=0.55, metal=0.0, emit=None, spec=0.35):
    key = (name, hexc)
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexc)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    try:
        b.inputs['Specular IOR Level'].default_value = spec
    except KeyError:
        pass
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = 2.5
    MATS[key] = m
    return m


def smooth(o):
    try:
        o.data.shade_smooth()
    except AttributeError:
        for p in o.data.polygons:
            p.use_smooth = True


def finish(o, m, bevel=0.0, sub=0, parent=None):
    o.data.materials.append(m)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    if sub:
        mod = o.modifiers.new('sub', 'SUBSURF')
        mod.levels = sub
        mod.render_levels = sub
    smooth(o)
    if parent is not None:
        attach(o, parent)
    return o


def attach(o, parent):
    """Parent keeping the world transform."""
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy()
    o.parent = parent
    o.matrix_parent_inverse = parent.matrix_world.inverted()
    o.matrix_world = mw


def box(name, size, loc, m, bevel=0.02, parent=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel=bevel, parent=parent)


def ball(name, r, loc, m, scale=(1, 1, 1), parent=None, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, parent=parent)


def tube(name, r, a, b, m, parent=None, r2=None, verts=20):
    """A rounded limb segment from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(a + b) / 2, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    if r2 is not None:
        # taper: scale the top ring
        me = o.data
        for v in me.vertices:
            if v.co.z > 0:
                v.co.x *= r2 / r
                v.co.y *= r2 / r
    bpy.ops.object.transform_apply(rotation=True)
    finish(o, m, bevel=r * 0.45)
    o.modifiers['bevel'].segments = 4
    if parent is not None:
        attach(o, parent)
    return o


def joint(name, loc, parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_size = 0.05
    e.location = loc
    e.rotation_mode = 'XYZ'
    if parent is not None:
        bpy.context.view_layer.update()
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e


# ------------------------------------------------------------------ the hero


class Rig:
    pass


def build(hero):
    H = hero
    vest = H.get('vest', '#3d4434')
    torso_kind = H.get('torso', 'vest')
    enemy = bool(H.get('enemy'))
    skin = mat('skin', H['skin'], rough=0.6, spec=0.3)
    shirt = mat('shirt', H['color'], rough=0.65)
    shirt_d = mat('shirt_d', H['shade'], rough=0.65)
    pants = mat('pants', H['pants'], rough=0.8)
    vestm = mat('vest', vest, rough=0.75)
    vest_d = mat('vest_d', tone(vest, -0.3), rough=0.8)
    boot = mat('boot', '#2b2622', rough=0.5)
    sole = mat('sole', '#141210', rough=0.7)
    glove = mat('glove', '#26221f', rough=0.6)
    hair = mat('hair', H['hair'], rough=0.7)
    accent = mat('accent', H['accent'], rough=0.35, spec=0.6)
    white = mat('eye', '#f8f8f2', rough=0.3)
    pupil = mat('pupil', '#15131a', rough=0.2, spec=0.8)
    metal = mat('metal', '#3a3f47', rough=0.35, metal=0.6)
    metal_d = mat('metal_d', '#1f2329', rough=0.45, metal=0.4)
    belt = mat('belt', '#2a221b', rough=0.6)
    buckle = mat('buckle', '#c9a227', rough=0.3, metal=0.8)

    R = Rig()
    R.hero = H
    # proportions (feet at z=0, facing +X, camera at -Y; the near side is y<0)
    HIP_Z, KNEE_Z, ANKLE_Z = 0.78, 0.44, 0.1
    CHEST_Z, NECK_Z, HEAD_Z = 1.18, 1.22, 1.46
    SH_Z = 1.13
    LEG_Y = 0.11
    SH_Y = 0.25

    R.turn = joint('turn', (0, 0, 0))
    R.root = joint('root', (0, 0, HIP_Z), R.turn)
    R.spine = joint('spine', (0, 0, HIP_Z + 0.05), R.root)
    R.neck = joint('neck', (0, 0, NECK_Z), R.spine)

    # --- legs
    R.thigh, R.shin = {}, {}
    for side, y in (('n', -LEG_Y), ('f', LEG_Y)):
        far = side == 'f'
        pm = mat('pants_f', tone(H['pants'], -0.28), rough=0.8) if far else pants
        bm = mat('boot_f', tone('#2b2622', -0.3), rough=0.5) if far else boot
        th = joint(f'thigh_{side}', (0, y, HIP_Z), R.root)
        sh = joint(f'shin_{side}', (0, y, KNEE_Z), th)
        R.thigh[side], R.shin[side] = th, sh
        tube(f'thighm_{side}', 0.105, (0, y, HIP_Z + 0.02), (0, y, KNEE_Z), pm, th, r2=0.09)
        tube(f'shinm_{side}', 0.088, (0, y, KNEE_Z + 0.02), (0, y, ANKLE_Z + 0.04), pm, sh, r2=0.08)
        ball(f'knee_{side}', 0.075, (0.045, y, KNEE_Z), mat('kneepad', '#2f3330', rough=0.5) if not far else pm, (1, 1.15, 1.1), sh)
        box(f'boot_{side}', (0.27, 0.15, 0.15), (0.055, y, ANKLE_Z - 0.02), bm, 0.05, sh)
        box(f'sole_{side}', (0.29, 0.16, 0.04), (0.06, y, ANKLE_Z - 0.095), sole, 0.015, sh)
        box(f'cuff_{side}', (0.17, 0.165, 0.06), (0.0, y, ANKLE_Z + 0.07), bm, 0.02, sh)

    # --- hips and torso
    box('pelvis', (0.3, 0.32, 0.2), (0, 0, HIP_Z + 0.04), pants, 0.06, R.root)
    box('belt', (0.32, 0.34, 0.06), (0, 0, HIP_Z + 0.13), belt, 0.02, R.spine)
    box('buckle', (0.05, 0.36, 0.045), (0.14, 0, HIP_Z + 0.13), buckle, 0.01, R.spine)
    box('torso', (0.34, 0.36, 0.42), (0, 0, 0.99), shirt, 0.1, R.spine)
    box('collar', (0.24, 0.3, 0.06), (0.0, 0, 1.17), shirt_d, 0.03, R.spine)
    if torso_kind == 'vest':
        box('vest', (0.37, 0.39, 0.3), (0.0, 0, 0.98), vestm, 0.07, R.spine)
        for i, z in enumerate((0.92, 1.03)):
            box(f'pouch{i}', (0.08, 0.3, 0.07), (0.17, 0, z), vest_d, 0.02, R.spine)
        box('pack', (0.16, 0.28, 0.3), (-0.22, 0, 1.0), vest_d, 0.05, R.spine)
        # the colour stripe on the vest (heroes: their colour; troopers: the vest's own shade)
        box('stripe', (0.38, 0.4, 0.035), (0, 0, 1.1), shirt if not enemy else vest_d, 0.01, R.spine)
    elif torso_kind == 'wraps':
        for i in range(5):
            box(f'wrap{i}', (0.36, 0.38, 0.045), (0, 0, 0.86 + i * 0.075), mat('wrapc', tone(H['color'], -0.12 if i % 2 else 0.08), rough=0.9), 0.02, R.spine, rot=(0.12 if i % 2 else -0.1, 0, 0))
    elif torso_kind == 'ribs':
        box('cuirass', (0.37, 0.39, 0.3), (0.0, 0, 0.99), mat('bronze', '#b08d57', rough=0.35, metal=0.7), 0.08, R.spine)
        for i in range(3):
            box(f'rib{i}', (0.03, 0.3, 0.025), (0.19, 0, 0.92 + i * 0.07), mat('bronze_d', '#7a5c33', rough=0.4, metal=0.6), 0.01, R.spine)
        for i in range(4):
            box(f'pteryx{i}', (0.09, 0.36, 0.14), (-0.12 + i * 0.08, 0, HIP_Z + 0.02), shirt_d, 0.015, R.spine)
    elif torso_kind == 'fur':
        ball('mantle', 0.25, (-0.02, 0, 1.12), mat('fur', '#6b5844', rough=1.0), (1.0, 1.15, 0.5), R.spine)
        box('furbelt', (0.36, 0.38, 0.08), (0, 0, 0.9), mat('fur_d', '#4a3b2c', rough=1.0), 0.03, R.spine)
    if enemy and H.get('weapon', 'gun') == 'gun':
        box('pack', (0.16, 0.28, 0.3), (-0.22, 0, 1.0), vest_d, 0.05, R.spine) if torso_kind != 'vest' else None

    # --- head
    hd = R.neck
    ball('neckm', 0.085, (0.0, 0, NECK_Z + 0.02), skin, (1, 1, 1.2), hd)
    ball('head', 0.24, (0.02, 0, HEAD_Z), skin, (1.0, 0.98, 1.0), hd, 32)
    # ears
    ball('ear', 0.05, (-0.02, -0.235, HEAD_Z - 0.01), skin, (0.7, 0.5, 1), hd)
    faceless = H['headgear'] in ('gasmask', 'jackal', 'alien', 'wraps')
    if not faceless:
        # eyes: big and readable, on the camera side of the face (troopers: glowing, under a scowl)
        glow_eye = mat('glow_eye', H['accent'], rough=0.2, emit=H['accent']) if enemy else pupil
        for i, y in enumerate((-0.11, 0.05)):
            ball(f'eyew{i}', 0.052 if not enemy else 0.045, (0.205, y, HEAD_Z + 0.015), white if not enemy else mat('eyed', '#1a1418'), (0.55, 1, 1.25 if not enemy else 0.8), hd)
            ball(f'eyep{i}', 0.031, (0.236, y - 0.004, HEAD_Z + 0.01), glow_eye, (0.5, 1, 1.3 if not enemy else 0.8), hd)
            box(f'brow{i}', (0.03, 0.09, 0.024), (0.228, y, HEAD_Z + (0.07 if enemy else 0.085)), hair, 0.008, hd, rot=((0.35 if i == 0 else -0.35) if enemy else 0, 0, 0))
        ball('nose', 0.035, (0.245, -0.03, HEAD_Z - 0.04), mat('nose', tone(H['skin'], -0.08)), (1, 0.9, 1.1), hd)
        box('mouth', (0.02, 0.07, 0.016), (0.226, -0.03, HEAD_Z - 0.11), mat('mouth', '#6b2a2a'), 0.006, hd)
    if H.get('beard'):
        ball('beard', 0.2, (0.06, 0, HEAD_Z - 0.12), hair, (1.0, 1.08, 0.75), hd)
        box('mouth2', (0.02, 0.07, 0.016), (0.252, -0.03, HEAD_Z - 0.1), mat('mouth', '#6b2a2a'), 0.006, hd)
    headgear(H, hd, HEAD_Z, hair, shirt, shirt_d, accent, metal_d)

    # --- arms (near arm in front of the body, far arm behind)
    R.upper, R.fore, R.hand = {}, {}, {}
    for side, y in (('n', -SH_Y), ('f', SH_Y)):
        far = side == 'f'
        sm = mat('shirt_f', tone(H['color'], -0.25), rough=0.65) if far else shirt
        km = mat('skin_f', tone(H['skin'], -0.2), rough=0.6) if far else skin
        up = joint(f'upper_{side}', (0, y, SH_Z), R.spine)
        fo = joint(f'fore_{side}', (0, y, SH_Z - 0.27), up)
        R.upper[side], R.fore[side] = up, fo
        ball(f'shoulder_{side}', 0.1, (0, y, SH_Z), sm, (1, 1, 1), up)
        tube(f'upperm_{side}', 0.078, (0, y, SH_Z), (0, y, SH_Z - 0.27), sm, up, r2=0.07)
        tube(f'forem_{side}', 0.068, (0, y, SH_Z - 0.27), (0, y, SH_Z - 0.5), km, fo, r2=0.062)
        ball(f'hand_{side}', 0.072, (0, y, SH_Z - 0.53), glove, (1, 1, 1.05), fo)
        R.hand[side] = None
    R.arm_len = (0.27, 0.27)
    R.sh_y = SH_Y

    if not enemy:
        # --- the heroes' armour: plated shoulders with a glowing trim, a chest plate with the hero's light running
        # through it, knee guards, bracers, and a long scarf in the hero's colour streaming back from the collar
        plate = mat('plate', '#2c3038', rough=0.3, metal=0.85)
        plate_f = mat('plate_f', '#1c1f25', rough=0.35, metal=0.8)
        glow = mat('glowline', H['accent'], rough=0.2, emit=H['accent'])
        for side, y in (('n', -SH_Y), ('f', SH_Y)):
            far = side == 'f'
            up, fo = R.upper[side], R.fore[side]
            ball(f'pauldron_{side}', 0.125, (0.0, y, SH_Z + 0.03), plate_f if far else plate, (1.15, 1.05, 0.72), up)
            box(f'ptrim_{side}', (0.2, 0.02, 0.025), (0.02, y + (0.11 if far else -0.11), SH_Z - 0.02), glow, 0.005, up)
            box(f'bracer_{side}', (0.15, 0.15, 0.12), (0.0, y, SH_Z - 0.4), plate_f if far else plate, 0.035, fo)
            box(f'btrim_{side}', (0.155, 0.155, 0.02), (0.0, y, SH_Z - 0.36), glow, 0.005, fo)
        for side, y in (('n', -LEG_Y), ('f', LEG_Y)):
            far = side == 'f'
            box(f'kneeguard_{side}', (0.07, 0.12, 0.1), (0.07, y, KNEE_Z - 0.01), plate_f if far else plate, 0.03, R.shin[side])
            box(f'bootline_{side}', (0.28, 0.155, 0.018), (0.055, y, ANKLE_Z + 0.04), glow, 0.005, R.shin[side])
        box('chestplate', (0.2, 0.34, 0.24), (0.11, 0, 1.0), plate, 0.06, R.spine)
        box('chestglow', (0.205, 0.02, 0.16), (0.115, -0.05, 1.0), glow, 0.005, R.spine)
        box('chestglow2', (0.205, 0.02, 0.16), (0.115, 0.05, 1.0), glow, 0.005, R.spine)
        # the scarf: a knot at the collar and two tails streaming back
        sc = mat('scarf', H['color'], rough=0.7)
        sc_d = mat('scarf_d', H['shade'], rough=0.7)
        ball('scarfknot', 0.1, (-0.06, 0, NECK_Z - 0.04), sc, (1.2, 1.4, 0.8), R.spine)
        pts = [(-0.08, 0.04, NECK_Z - 0.04), (-0.24, 0.05, NECK_Z - 0.05), (-0.39, 0.06, NECK_Z - 0.12), (-0.52, 0.07, NECK_Z - 0.24)]
        for i in range(3):
            tube(f'scarf{i}', 0.06 - i * 0.012, pts[i], pts[i + 1], sc if i % 2 == 0 else sc_d, R.spine, r2=0.05 - i * 0.012, verts=12)
        pts2 = [(-0.08, 0.0, NECK_Z - 0.06), (-0.2, 0.0, NECK_Z - 0.12), (-0.3, 0.0, NECK_Z - 0.24)]
        for i in range(2):
            tube(f'scarfb{i}', 0.045 - i * 0.01, pts2[i], pts2[i + 1], sc_d, R.spine, r2=0.035 - i * 0.01, verts=12)

    # --- the rifle on its aim pivot (between the shoulders, a little forward)
    R.aim = joint('aim', (0.08, -0.05, 1.0), R.spine)
    g = R.aim
    gy = -0.17
    wk = H.get('weapon', 'gun')
    if wk == 'gun':
        box('gun_body', (0.42, 0.07, 0.12), (0.3, gy, 1.0), metal, 0.02, g)
        box('gun_stripe', (0.2, 0.075, 0.03), (0.28, gy, 1.045), accent if not enemy else metal_d, 0.008, g)
        box('gun_stock', (0.2, 0.065, 0.1), (0.04, gy, 0.98), metal_d, 0.03, g)
        box('gun_mag', (0.07, 0.06, 0.15), (0.34, gy, 0.9), metal_d, 0.015, g, rot=(0, -0.25, 0))
        box('gun_grip', (0.06, 0.06, 0.12), (0.18, gy, 0.92), metal_d, 0.015, g, rot=(0, 0.3, 0))
        box('gun_sight', (0.08, 0.04, 0.04), (0.3, gy, 1.08), metal_d, 0.01, g)
        tube('gun_barrel', 0.025, (0.5, gy, 1.01), (0.72, gy, 1.01), metal_d, g)
        box('gun_fore', (0.14, 0.075, 0.07), (0.52, gy, 0.985), mat('fore', '#2a2d33', rough=0.6), 0.02, g)
        tip = 0.74
    elif wk == 'staff':
        wood = mat('wood', '#5b3a1e', rough=0.8)
        tube('staff', 0.03, (-0.15, gy, 0.96), (0.62, gy, 1.02), wood, g)
        ball('orb', 0.075, (0.67, gy, 1.025), mat('orb', H['accent'], rough=0.1, emit=H['accent']), (1, 1, 1), g)
        for i, a in enumerate((0.6, -0.6)):
            box(f'prong{i}', (0.1, 0.025, 0.025), (0.62, gy, 1.025 + a * 0.1), mat('gold', '#c9a227', rough=0.3, metal=0.8), 0.008, g, rot=(0, a, 0))
        tip = 0.7
    elif wk == 'spear':
        tube('shaft', 0.026, (-0.25, gy, 0.98), (0.7, gy, 1.02), mat('wood', '#5b3a1e', rough=0.8), g)
        bpy.ops.mesh.primitive_cone_add(radius1=0.05, depth=0.2, location=(0.78, gy, 1.025), rotation=(0, math.pi / 2, 0), vertices=4)
        cone = bpy.context.object
        finish(cone, mat('blade', '#d8dee6', rough=0.2, metal=0.9), parent=g)
        box('tassel', (0.03, 0.04, 0.09), (0.66, gy, 0.97), accent, 0.01, g)
        tip = 0.88
    else:  # raygun
        ball('ray_body', 0.09, (0.3, gy, 1.0), mat('ray', '#c7cdd6', rough=0.25, metal=0.7), (1.6, 0.6, 0.8), g)
        tube('ray_barrel', 0.03, (0.4, gy, 1.0), (0.58, gy, 1.0), metal_d, g)
        for i in range(3):
            tube(f'ray_ring{i}', 0.045, (0.43 + i * 0.05, gy, 1.0), (0.45 + i * 0.05, gy, 1.0), accent, g)
        ball('ray_tip', 0.035, (0.6, gy, 1.0), mat('raytip', H['accent'], rough=0.1, emit=H['accent']), (1, 1, 1), g)
        box('gun_grip', (0.06, 0.06, 0.12), (0.18, gy, 0.92), metal_d, 0.015, g, rot=(0, 0.3, 0))
        tip = 0.63
    R.muzzle = joint('muzzle', (tip, gy, 1.01), g)
    R.grip = joint('grip', (0.18, gy, 0.9), g)
    R.foregrip = joint('foregrip', (0.5, gy, 0.95), g)
    # knife (only in the melee frames)
    R.knife = []
    k = R.fore['n']
    R.knife.append(box('knife_blade', (0.05, 0.02, 0.24), (0.0, -SH_Y - 0.06, SH_Z - 0.72), mat('blade', '#d8dee6', rough=0.2, metal=0.9), 0.006, k))
    R.knife.append(box('knife_hilt', (0.05, 0.04, 0.09), (0.0, -SH_Y - 0.06, SH_Z - 0.57), metal_d, 0.01, k))
    R.gun_parts = [o for o in g.children]
    return R


def headgear(H, hd, HZ, hair, shirt, shirt_d, accent, metal_d):
    kind = H['headgear']
    # hair under everything: a cap of hair on the back and top of the head
    ball('hair', 0.245, (-0.045, 0, HZ + 0.045), hair, (1, 1.01, 0.97), hd)
    ball('fringe', 0.2, (0.07, 0, HZ + 0.13), hair, (0.9, 1.15, 0.45), hd)
    if kind in ('jackal', 'wraps', 'nemes', 'gasmask'):
        for o in ('hair', 'fringe'):
            ob = bpy.data.objects.get(o)
            if ob:
                bpy.data.objects.remove(ob)
    col = mat('gear', H['color'], rough=0.6)
    dark = mat('gear_d', tone(H['color'], -0.35), rough=0.6)
    if kind == 'bandana':
        tube('band', 0.255, (0, 0, HZ + 0.06), (0, 0, HZ + 0.14), col, hd)
        for i, (dz, a) in enumerate(((0.0, 0.5), (-0.07, 0.2))):
            box(f'knot{i}', (0.16, 0.05, 0.05), (-0.3, 0.0, HZ + 0.1 + dz), col, 0.02, hd, rot=(0, a, 0))
    elif kind == 'visor':
        ball('helm', 0.27, (-0.02, 0, HZ + 0.06), mat('helm', H['shade'], rough=0.4), (1, 1, 0.9), hd)
        ball('visorm', 0.22, (0.1, 0, HZ + 0.05), mat('visor', H['accent'], rough=0.1, spec=1.0, emit=H['accent']), (0.65, 1.0, 0.32), hd)
        box('helmstripe', (0.5, 0.06, 0.06), (0, 0, HZ + 0.27), col, 0.02, hd)
    elif kind == 'beret':
        ball('beret', 0.27, (-0.02, 0.02, HZ + 0.18), col, (1.05, 1.05, 0.38), hd)
        ball('beretb', 0.03, (0.0, 0.02, HZ + 0.28), dark, (1, 1, 1), hd)
        box('badge', (0.03, 0.06, 0.06), (0.24, -0.06, HZ + 0.16), mat('badge', '#facc15', rough=0.3, metal=0.8), 0.01, hd)
    elif kind == 'hood':
        ball('hood', 0.29, (-0.04, 0, HZ + 0.02), dark, (1.0, 1.0, 1.0), hd)
        hood = bpy.data.objects['hood']
        for v in hood.data.vertices:
            if v.co.x > 0.12:
                v.co.x = 0.12 - (v.co.x - 0.12) * 0.3
        box('mask', (0.08, 0.32, 0.1), (0.2, 0, HZ - 0.08), mat('mask', '#1c1626', rough=0.7), 0.04, hd)
        for i, y in enumerate((-0.11, 0.05)):
            ball(f'glow{i}', 0.02, (0.25, y, HZ + 0.06), accent, (1, 1.4, 0.8), hd)
    elif kind == 'hardhat':
        ball('hat', 0.27, (0, 0, HZ + 0.1), mat('hat', H['color'], rough=0.35, spec=0.7), (1, 1, 0.75), hd)
        tube('brim', 0.31, (0.02, 0, HZ + 0.07), (0.02, 0, HZ + 0.1), mat('hat', H['color'], rough=0.35, spec=0.7), hd)
        box('ridge', (0.42, 0.06, 0.05), (0, 0, HZ + 0.3), dark, 0.02, hd)
        box('goggles', (0.06, 0.4, 0.08), (0.22, 0, HZ + 0.1), accent, 0.03, hd)
    elif kind == 'helmet':
        ball('helm', 0.28, (0, 0, HZ + 0.05), mat('helm', tone(H['color'], -0.2), rough=0.5), (1, 1, 0.92), hd)
        box('helmband', (0.5, 0.5, 0.05), (0, 0, HZ + 0.06), dark, 0.02, hd)
        box('nv', (0.1, 0.06, 0.1), (0.2, -0.05, HZ + 0.22), metal_d, 0.02, hd)
        ball('nvlens', 0.03, (0.26, -0.05, HZ + 0.22), accent, (0.6, 1, 1), hd)
    elif kind == 'headset':
        ball('hairtop', 0.26, (-0.03, 0, HZ + 0.06), hair, (1, 1, 0.95), hd)
        ball('bun', 0.1, (-0.2, 0.0, HZ + 0.2), hair, (1, 1, 1), hd)
        tube('hband', 0.03, (0.0, -0.27, HZ), (0.0, 0.27, HZ), mat('hb', '#2b2b33'), hd)
        bpy.data.objects['hband'].scale = (1, 1, 1)
        for i, y in enumerate((-0.26, 0.26)):
            ball(f'cup{i}', 0.09, (0.0, y, HZ - 0.01), col, (0.8, 0.55, 1), hd)
        tube('mic', 0.012, (0.02, -0.27, HZ - 0.04), (0.2, -0.22, HZ - 0.12), mat('hb', '#2b2b33'), hd)
        ball('micball', 0.025, (0.21, -0.21, HZ - 0.12), accent, (1, 1, 1), hd)
    elif kind == 'gasmask':
        ball('helm', 0.28, (-0.02, 0, HZ + 0.07), mat('helm', tone(H['color'], -0.15), rough=0.5), (1, 1, 0.85), hd)
        box('helmrim', (0.56, 0.56, 0.04), (-0.02, 0, HZ + 0.02), mat('helm', tone(H['color'], -0.15), rough=0.5), 0.02, hd)
        ball('mask', 0.2, (0.1, 0, HZ - 0.06), mat('maskc', '#2b2f33', rough=0.55), (0.8, 1.05, 0.9), hd)
        for i, y in enumerate((-0.1, 0.06)):
            ball(f'lens{i}', 0.055, (0.24, y, HZ + 0.0), mat('lens', H['accent'], rough=0.1, emit=H['accent']), (0.4, 1, 1), hd)
        tube('filter', 0.06, (0.2, -0.04, HZ - 0.14), (0.3, -0.04, HZ - 0.19), metal_d, hd)
    elif kind == 'wraps':
        for i in range(6):
            tube(f'hwrap{i}', 0.25 - abs(i - 2.5) * 0.012, (0.02, 0, HZ - 0.15 + i * 0.065), (0.02, 0, HZ - 0.1 + i * 0.065), mat('wrapc', tone(H['color'], -0.12 if i % 2 else 0.08), rough=0.9), hd)
        for i, y in enumerate((-0.1, 0.06)):
            ball(f'weye{i}', 0.03, (0.255, y, HZ + 0.02), mat('weye', H['accent'], rough=0.1, emit=H['accent']), (0.6, 1, 0.8), hd)
    elif kind == 'jackal':
        jm = mat('jackal', '#1f1a17', rough=0.6)
        ball('jhead', 0.24, (0.0, 0, HZ + 0.02), jm, (1.05, 0.95, 1), hd)
        ball('snout', 0.12, (0.25, 0, HZ - 0.06), jm, (1.6, 0.75, 0.7), hd)
        for i, y in enumerate((-0.09, 0.09)):
            bpy.ops.mesh.primitive_cone_add(radius1=0.07, depth=0.3, location=(-0.02, y, HZ + 0.32), vertices=4)
            finish(bpy.context.object, jm, parent=hd)
        ball('jeye', 0.03, (0.2, -0.09, HZ + 0.05), mat('weye', H['accent'], rough=0.1, emit=H['accent']), (0.6, 1, 0.7), hd)
        box('collarg', (0.34, 0.5, 0.08), (0, 0, HZ - 0.25), mat('gold', '#c9a227', rough=0.3, metal=0.8), 0.03, hd)
    elif kind == 'nemes':
        gold = mat('gold', '#c9a227', rough=0.3, metal=0.8)
        blue = mat('lapis', '#1e3a8a', rough=0.4)
        ball('nemes', 0.27, (-0.03, 0, HZ + 0.05), gold, (1, 1.05, 0.92), hd)
        box('nband', (0.06, 0.5, 0.06), (0.22, 0, HZ + 0.1), blue, 0.02, hd)
        for i, y in enumerate((-0.26, 0.26)):
            box(f'lappet{i}', (0.12, 0.06, 0.32), (0.02, y, HZ - 0.18), gold, 0.02, hd)
            for j in range(3):
                box(f'lstripe{i}{j}', (0.125, 0.065, 0.03), (0.02, y, HZ - 0.08 - j * 0.09), blue, 0.005, hd)
        box('uraeus', (0.04, 0.04, 0.08), (0.24, 0, HZ + 0.2), gold, 0.01, hd)
    elif kind == 'viking':
        steel = mat('steel', '#8b939c', rough=0.35, metal=0.7)
        ball('vhelm', 0.27, (-0.01, 0, HZ + 0.09), steel, (1, 1, 0.85), hd)
        box('nasal', (0.03, 0.05, 0.14), (0.26, -0.02, HZ + 0.0), steel, 0.01, hd)
        horn = mat('horn', '#e8dcc0', rough=0.5)
        for i, y in enumerate((-0.22, 0.22)):
            tube(f'vhorn{i}', 0.05, (0.0, y, HZ + 0.17), (0.04, y * 1.5, HZ + 0.36), horn, hd, r2=0.012)
    elif kind == 'crest':
        bronze = mat('bronze', '#b08d57', rough=0.35, metal=0.7)
        ball('chelm', 0.27, (-0.01, 0, HZ + 0.06), bronze, (1, 1, 0.95), hd)
        for i, y in enumerate((-0.2, 0.2)):
            box(f'cheek{i}', (0.12, 0.05, 0.18), (0.14, y, HZ - 0.08), bronze, 0.02, hd)
        ball('crest', 0.22, (-0.06, 0, HZ + 0.3), mat('crestc', H['accent'] if H['accent'] != '#fcd34d' else '#b91c1c', rough=0.9), (1.5, 0.25, 0.6), hd)
    elif kind == 'horns':
        horn = mat('horn', '#2a1d1a', rough=0.5)
        for i, y in enumerate((-0.15, 0.15)):
            tube(f'dhorn{i}', 0.06, (0.02, y, HZ + 0.17), (-0.12, y * 1.3, HZ + 0.42), horn, hd, r2=0.012)
        ball('dhair', 0.245, (-0.06, 0, HZ + 0.03), hair, (1, 1.01, 0.95), hd)
    elif kind == 'alien':
        dome = bpy.data.objects.get('head')
        if dome:
            vs = dome.data.vertices
            c = sum((v.co for v in vs), Vector()) / len(vs)
            for v in vs:
                d = v.co - c
                v.co = c + Vector((d.x * 1.15, d.y * 1.1, d.z * 1.25 + 0.04))
        for o in ('hair', 'fringe', 'ear'):
            ob = bpy.data.objects.get(o)
            if ob:
                bpy.data.objects.remove(ob)
        for i, y in enumerate((-0.12, 0.08)):
            ball(f'aeye{i}', 0.085, (0.23, y, HZ + 0.02), mat('aeye', '#0b0b10', rough=0.05, spec=1.0), (0.45, 0.9, 1.25), hd)
        ball('collarv', 0.2, (0, 0, HZ - 0.24), mat('ray', '#c7cdd6', rough=0.25, metal=0.7), (1.2, 1.3, 0.35), hd)
    elif kind == 'cap':
        ball('cap', 0.26, (0, 0, HZ + 0.08), col, (1, 1, 0.75), hd)
        box('bill', (0.2, 0.3, 0.03), (0.24, -0.02, HZ + 0.1), dark, 0.015, hd, rot=(0, 0.12, 0))
        box('capstar', (0.03, 0.06, 0.06), (0.23, -0.04, HZ + 0.18), mat('badge', '#f5f5f4', rough=0.4), 0.01, hd)


# ------------------------------------------------------------------ posing


def rot(e, deg):
    """Swing a joint in the side plane: positive = forward/up (toward +X / counter-clockwise seen from the camera)."""
    e.rotation_euler = (0, -math.radians(deg), 0)


def _dz(R):
    """How much higher this body's hips stand than the first generation's (pose heights are written for 0.78)."""
    return getattr(R, 'root_rest', 0.78) - 0.78


def reset_pose(R):
    for o in R.turn.children_recursive:
        if o.type == 'EMPTY':
            o.rotation_euler = (0, 0, 0)
    R.root.location.z = getattr(R, 'root_rest', 0.78)
    R.root.location.x = 0
    R.turn.rotation_euler = (0, 0, 0)


def world2(o):
    bpy.context.view_layer.update()
    p = o.matrix_world.translation
    return Vector((p.x, p.z))


def ik_arm(R, side, target):
    """Point the upper arm and forearm so the hand reaches `target` (x, z): elbow kept low."""
    up, fo = R.upper[side], R.fore[side]
    up.rotation_euler = (0, 0, 0)
    fo.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    # the spine's own lean: the arm's rest direction (straight down) in the world
    par = up.parent.matrix_world.to_3x3()
    down = par @ Vector((0, 0, -1))
    rest = math.atan2(down.z, down.x)
    S = world2(up)
    a, b = getattr(R, 'arm_len', (0.27, 0.27))
    T = Vector(target)
    d = T - S
    L = max(0.05, min(a + b - 1e-3, d.length))
    base = math.atan2(d.y, d.x)
    off = math.acos(max(-1, min(1, (a * a + L * L - b * b) / (2 * a * L))))
    phi1 = base - off if d.x >= -0.05 else base + off  # elbow down
    E = S + Vector((math.cos(phi1), math.sin(phi1))) * a
    phi2 = math.atan2(T.y - E.y, T.x - E.x)
    t1 = rest - phi1
    up.rotation_euler = (0, t1, 0)
    t2 = (rest - phi2) - t1
    fo.rotation_euler = (0, t2, 0)


def free_arm(R, side, upper_deg, fore_deg):
    rot(R.upper[side], upper_deg)
    rot(R.fore[side], fore_deg)


def pose(R, name, frame, aim):
    reset_pose(R)
    show_knife(R, name == 'melee')
    a = AIMS[aim]
    lean = 0.0
    if name == 'idle':
        breathe = 0.01 if frame else 0.0
        R.root.location.z = 0.78 - breathe + _dz(R)
        rot(R.thigh['n'], 6)
        rot(R.shin['n'], -4)
        rot(R.thigh['f'], -6)
        rot(R.shin['f'], -4)
        lean = 2
    elif name == 'run':
        ph = frame / 8 * 2 * math.pi
        s = math.sin(ph)
        c = math.cos(ph)
        for side, k in (('n', 1), ('f', -1)):
            sw = s * k
            rot(R.thigh[side], 38 * sw)
            # knee bends most as the leg swings forward through the air
            bend = max(0, -math.cos(ph + (0 if k > 0 else math.pi))) * 75 + 8
            rot(R.shin[side], -bend)
        R.root.location.z = 0.78 - 0.02 + abs(c) * 0.035 + _dz(R)
        lean = 9
    elif name == 'jump':
        rot(R.thigh['n'], 55)
        rot(R.shin['n'], -85)
        rot(R.thigh['f'], 15)
        rot(R.shin['f'], -60)
        lean = 4
    elif name == 'fall':
        rot(R.thigh['n'], 20)
        rot(R.shin['n'], -25)
        rot(R.thigh['f'], -12)
        rot(R.shin['f'], -35)
        lean = -3
    elif name == 'crouch':
        R.root.location.z = 0.5 + _dz(R)
        rot(R.thigh['n'], 85)
        rot(R.shin['n'], -120)
        rot(R.thigh['f'], 60)
        rot(R.shin['f'], -125)
        R.root.location.x = -0.06
        lean = 14
    elif name == 'slide':
        R.root.location.z = 0.32 + _dz(R)
        rot(R.thigh['n'], 80)
        rot(R.shin['n'], -5)
        rot(R.thigh['f'], 40)
        rot(R.shin['f'], -95)
        lean = -30
    elif name == 'dash':
        rot(R.thigh['n'], 30)
        rot(R.shin['n'], -40)
        rot(R.thigh['f'], -45)
        rot(R.shin['f'], -30)
        lean = 22
    elif name == 'melee':
        rot(R.thigh['n'], 28)
        rot(R.shin['n'], -12)
        rot(R.thigh['f'], -20)
        rot(R.shin['f'], -10)
        lean = 10 if frame else 2
    elif name == 'flip':
        R.root.location.z = 0.9 + _dz(R)
        rot(R.thigh['n'], 110)
        rot(R.shin['n'], -140)
        rot(R.thigh['f'], 95)
        rot(R.shin['f'], -140)
        lean = 35
        a = -20
    elif name == 'down':
        R.root.location.z = 0.2 + _dz(R)
        R.root.location.x = 0.42
        rot(R.root, -88)
        rot(R.thigh['n'], 15)
        rot(R.shin['n'], -20)
        rot(R.thigh['f'], 5)
        rot(R.shin['f'], -10)
        a = -60
    rot(R.spine, -lean)  # lean forward = rotate the top toward +X (negative swing about the hips)
    rot(R.neck, lean * 0.4 + max(-25, min(25, a * 0.25)))
    if name == 'melee':
        # rifle held low in the far hand, the knife arm swings
        rot(R.aim, -55 - lean)
        bpy.context.view_layer.update()
        ik_arm(R, 'f', world2(R.foregrip))
        if frame == 0:
            free_arm(R, 'n', -150, -60)
        else:
            free_arm(R, 'n', 70, 10)
        return
    if name == 'down':
        rot(R.aim, -70)
        free_arm(R, 'n', 160, -10)
        free_arm(R, 'f', 150, -20)
        return
    # aim the rifle (world angle `a`), counter the spine's lean
    rot(R.aim, a + lean)
    bpy.context.view_layer.update()
    ik_arm(R, 'n', world2(R.grip))
    ik_arm(R, 'f', world2(R.foregrip))


def show_knife(R, on):
    for o in R.knife:
        o.hide_render = not on


# ------------------------------------------------------------------ camera, lights, render


def stage(R):
    sc = bpy.context.scene
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = HD_W * PX  # the wider side (96 px)
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    # feet (z=0, x=0) land at (HD_CENTER, HD_FEET) of the frame
    cx = (HD_W / 2 - HD_CENTER) * PX
    cz = (HD_FEET - HD_H / 2) * PX
    cam.location = (cx, -12, cz)
    cam.rotation_euler = (math.radians(90), 0, 0)
    # key light: upper left, in front
    k = bpy.data.lights.new('key', 'SUN')
    k.energy = 3.8
    k.angle = math.radians(8)
    ko = bpy.data.objects.new('key', k)
    sc.collection.objects.link(ko)
    ko.rotation_euler = (math.radians(50), math.radians(-35), math.radians(-30))
    # rim light: from behind, upper right
    r = bpy.data.lights.new('rim', 'SUN')
    r.energy = 4.5
    r.color = (1.0, 0.92, 0.82)
    ro = bpy.data.objects.new('rim', r)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(-60), math.radians(30), math.radians(160))
    # fill from below/front, cool
    f = bpy.data.lights.new('fill', 'SUN')
    f.energy = 0.8
    f.color = (0.75, 0.82, 1.0)
    fo = bpy.data.objects.new('fill', f)
    sc.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(110), 0, math.radians(20))
    return cam


def render_frame(R, cam, path, name, mode='sprites'):
    sc = bpy.context.scene
    R.turn.rotation_euler = (0, 0, math.radians(-40 if mode == 'portrait' else -22 if name != 'down' else -8))
    bpy.context.view_layer.update()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    m = world_to_camera_view(sc, cam, R.muzzle.matrix_world.translation)
    k = 3 if mode == 'big' else 1
    px = m.x * HD_W * k
    py = (1 - m.y) * HD_H * k
    return {'muzzleX': round((px - HD_CENTER * k) / (2 * k), 2), 'muzzleY': round((py - HD_FEET * k) / (2 * k), 2)}


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', type=int, default=-1)
    ap.add_argument('--look', default='', help='an enemy look from art3d/enemies.json (e.g. army-enemy)')
    ap.add_argument('--out', default='art3d/out')
    ap.add_argument('--only', default='')
    ap.add_argument('--samples', type=int, default=48)
    ap.add_argument('--style', type=int, default=2, help='2: the current heroes (style2.py); 1: the first generation')
    ap.add_argument(
        '--mode',
        default='sprites',
        choices=['sprites', 'big', 'portrait'],
        help='sprites: every game frame; big: the menu showcase frames at 3x; portrait: a head-and-shoulders portrait',
    )
    a = ap.parse_args(argv)
    here = os.path.dirname(os.path.abspath(__file__))
    if a.look:
        hero = json.load(open(os.path.join(here, 'enemies.json')))[a.look]
        hero['id'] = a.look
        hero['enemy'] = True
    else:
        heroes = json.load(open(os.path.join(here, 'heroes.json')))
        hero = next(h for h in heroes if h['id'] == a.hero)
    sc = reset()
    sc.cycles.samples = a.samples
    if a.style == 2 and not a.look:
        import style2

        sc.view_settings.exposure = 0.55
        R = style2.build_hero(hero)
    else:
        R = build(hero)
    cam = stage(R)
    name = f"h{hero['id']}" if not a.look else a.look
    size = [HD_W, HD_H]
    if a.mode == 'big':
        # the same framing at 3x: the menu's hero showcase draws it without blowing pixels up
        sc.render.resolution_x = HD_W * 3 * SS
        sc.render.resolution_y = HD_H * 3 * SS
        size = [HD_W * 3, HD_H * 3]
        name += '-big'
    elif a.mode == 'portrait':
        sc.render.resolution_x = 128 * SS
        sc.render.resolution_y = 128 * SS
        cam.data.ortho_scale = 0.95
        cam.location = (0.06, -12, getattr(R, 'portrait_z', 1.36))
        size = [128, 128]
        name += '-face'
    out = os.path.join(a.out, name)
    os.makedirs(out, exist_ok=True)
    jobs = []
    poses = POSES if not a.look else {k: POSES[k] for k in ('idle', 'run', 'jump', 'fall', 'crouch')}
    if a.mode == 'big':
        poses = {'idle': 2, 'run': 8}
    elif a.mode == 'portrait':
        poses = {'idle': 1}
    for p, n in poses.items():
        for fr in range(n):
            for aim in (AIMS if p in AIMED and not a.look and a.mode == 'sprites' else (['f', 'uf'] if a.mode == 'big' else ['f'])):
                jobs.append((p, fr, aim))
    if a.only:
        want = [tuple(x.split(':')) for x in a.only.split(',')]
        jobs = [j for j in jobs if (j[0], str(j[1]), j[2]) in want]
    meta = {}
    mp = os.path.join(out, 'meta.json')
    if os.path.exists(mp):
        meta = json.load(open(mp))
    for p, fr, aim in jobs:
        pose(R, p, fr, aim)
        key = f'{p}_{fr}_{aim}'
        meta[key] = render_frame(R, cam, os.path.abspath(os.path.join(out, key + '.png')), p, a.mode)
        print('rendered', key, flush=True)
    meta['_size'] = size
    json.dump(meta, open(mp, 'w'), indent=1)


if __name__ == '__main__':
    main()
