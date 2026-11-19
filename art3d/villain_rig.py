"""
The saga's foot soldiers as asura warriors, built in Blender for the game's skeletal animation.

The stages' humanoid foes used to be drawn in the game from a handful of rectangles. Here each is modelled like the
heroes (hero_rig.py: the same joint hierarchy, so client/src/game/rig.ts animates them the same way) but as a
villain: broader and heavier than a soldier, a horned or crested head with glowing eyes, a scowl and fangs, bare
muscled arms with bracers, armoured shoulders, a belt with a skull clasp, a loincloth, and the weapon its kind
fights with. Every look is original (no figure from any epic).

    python3 art3d/villain_rig.py --kind archer [--samples 32]   # -> art3d/out/parts/v-archer/*.png + rig.json
    python3 art3d/pack_parts.py                                   # -> client/src/assets/rigs/v-archer.webp + .json
"""

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import hero_rig as hr  # noqa: E402
from hero_rig import ball, box, joint, mat, tone, tube, finish  # noqa: E402

# Each kind: skin, armour (metal), cloth, eye glow, headgear, weapon, build (girth), height scale.
KINDS = {
    'archer': dict(skin='#a8342c', metal='#3b3f46', cloth='#2d1b3d', eye='#ffd23f', head='horns', weapon='bow', girth=1.0, tall=1.0),
    'drummer': dict(skin='#7a4a2c', metal='#8a6a2a', cloth='#6b1414', eye='#ff6a1a', head='topknot', weapon='drum', girth=1.25, tall=0.95),
    'chakri': dict(skin='#3e5a8a', metal='#c9a227', cloth='#1c2340', eye='#7af0ff', head='crown', weapon='disc', girth=1.0, tall=1.0),
    'rathi': dict(skin='#8a5a3a', metal='#a0763a', cloth='#3a1010', eye='#ff3a2a', head='crest', weapon='sword', girth=1.1, tall=1.05),
    'netter': dict(skin='#3f6a42', metal='#4a4f40', cloth='#2a2a18', eye='#d4ff3a', head='horns', weapon='trident', girth=1.0, tall=1.0),
    'pehlwan': dict(skin='#9a4a30', metal='#c9a227', cloth='#b0201c', eye='#ffb02e', head='bald', weapon='none', girth=1.45, tall=1.05),
    'gadadhar': dict(skin='#5a3a6a', metal='#c9a227', cloth='#20142a', eye='#ff5ad8', head='crown', weapon='mace', girth=1.3, tall=1.05),
    'slinger': dict(skin='#6a6a3a', metal='#5a4a30', cloth='#3a2a18', eye='#ffe14a', head='band', weapon='sling', girth=0.9, tall=0.98),
    'conch': dict(skin='#2a7a7a', metal='#d8c8a0', cloth='#103a4a', eye='#9af0ff', head='fins', weapon='conch', girth=1.05, tall=0.95),
    'dancer': dict(skin='#7a3a7a', metal='#e0b84a', cloth='#c03a8a', eye='#ffd0ff', head='veil', weapon='blades', girth=0.85, tall=1.0),
    'mashaal': dict(skin='#5a2a1a', metal='#3a3030', cloth='#2a1410', eye='#ff8a1a', head='horns', weapon='torch', girth=1.1, tall=1.02),
    'mayavi': dict(skin='#4a3a7a', metal='#c9a227', cloth='#1a103a', eye='#c08aff', head='hood', weapon='staff', girth=0.95, tall=1.05),
    'imp': dict(skin='#c8381a', metal='#3a1a10', cloth='#2a0e08', eye='#fff07a', head='flame', weapon='none', girth=1.25, tall=0.72),
    'lantern': dict(skin='#7a8a8a', metal='#4a4a4a', cloth='#2a3030', eye='#9affd8', head='skull', weapon='lamp', girth=0.95, tall=0.98),
}


def cone(name, r1, r2, depth, loc, m, parent, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    return finish(o, m, parent=parent)


def horn(name, base, tip, r, m, parent):
    """A curved horn from `base` toward `tip`: three tapering segments bending upward."""
    b = Vector(base)
    t = Vector(tip)
    mid = (b + t) / 2 + Vector((0, 0, 0.06))
    pts = [b, (b + mid) / 2 + Vector((0, 0, 0.02)), mid, t]
    for i in range(3):
        tube(f'{name}{i}', r * (1 - i * 0.3), pts[i], pts[i + 1], m, parent, r2=r * (1 - (i + 1) * 0.3), verts=10)


class Rig:
    pass


def build(kind):
    K = KINDS[kind]
    g = K['girth']
    skin = mat('skin', K['skin'], rough=0.55, spec=0.45)
    skin_d = mat('skin_d', tone(K['skin'], -0.3), rough=0.6)
    metal = mat('metal', K['metal'], rough=0.3, metal=0.85)
    metal_d = mat('metal_d', tone(K['metal'], -0.35), rough=0.4, metal=0.7)
    cloth = mat('cloth', K['cloth'], rough=0.85)
    cloth_d = mat('cloth_d', tone(K['cloth'], -0.3), rough=0.85)
    leather = mat('leather', '#3a2418', rough=0.6)
    bone = mat('bone', '#e8dcc0', rough=0.5)
    eye = mat('eye', K['eye'], rough=0.2, emit=K['eye'])
    dark = mat('dark', '#120c10', rough=0.6)

    R = Rig()
    HIP_Z, KNEE_Z, ANKLE_Z = 0.8, 0.45, 0.1
    NECK_Z, HEAD_Z, SH_Z = 1.3, 1.5, 1.2
    LEG_Y = 0.13 * g
    SH_Y = 0.3 * g

    R.turn = joint('turn', (0, 0, 0))
    R.root = joint('root', (0, 0, HIP_Z), R.turn)
    R.spine = joint('spine', (0, 0, HIP_Z + 0.05), R.root)
    R.neck = joint('neck', (0, 0, NECK_Z), R.spine)

    # --- legs: armoured greaves, bare thighs under a loincloth, heavy feet
    R.thigh, R.shin = {}, {}
    for side, y in (('n', -LEG_Y), ('f', LEG_Y)):
        far = side == 'f'
        sk = skin_d if far else skin
        mt = metal_d if far else metal
        th = joint(f'thigh_{side}', (0, y, HIP_Z), R.root)
        sh = joint(f'shin_{side}', (0, y, KNEE_Z), th)
        R.thigh[side], R.shin[side] = th, sh
        tube(f'thighm_{side}', 0.12 * g, (0, y, HIP_Z + 0.02), (0, y, KNEE_Z), sk, th, r2=0.1 * g)
        tube(f'shinm_{side}', 0.095 * g, (0, y, KNEE_Z), (0, y, ANKLE_Z + 0.04), sk, sh, r2=0.085 * g)
        box(f'greave_{side}', (0.17 * g, 0.2 * g, 0.24), (0.03, y, (KNEE_Z + ANKLE_Z) / 2 + 0.02), mt, 0.04, sh)
        ball(f'kneecap_{side}', 0.08 * g, (0.05, y, KNEE_Z), mt, (1, 1.1, 1), sh)
        box(f'foot_{side}', (0.3, 0.16 * g, 0.12), (0.06, y, ANKLE_Z - 0.03), dark if not far else mat('dark_f', '#0a070a'), 0.04, sh)

    # --- hips: belt with a skull clasp, a loincloth front and back
    box('hips', (0.36 * g, 0.38 * g, 0.18), (0, 0, HIP_Z + 0.04), cloth_d, 0.06, R.root)
    box('loin', (0.06, 0.24 * g, 0.36), (0.16 * g, 0, HIP_Z - 0.12), cloth, 0.02, R.root, rot=(0, 0.12, 0))
    box('loin_b', (0.06, 0.24 * g, 0.3), (-0.17 * g, 0, HIP_Z - 0.1), cloth_d, 0.02, R.root, rot=(0, -0.15, 0))

    # --- torso: a broad muscled chest, armoured or bare by kind
    ball('chest', 0.27, (0.02, 0, 1.05), skin, (1.0 * g, 1.15 * g, 1.05), R.spine, 32)
    ball('abs', 0.2, (0.03, 0, 0.9), skin_d, (0.95 * g, 1.05 * g, 0.9), R.spine)
    for i, y in enumerate((-0.1 * g, 0.1 * g)):
        ball(f'pec{i}', 0.12, (0.17 * g, y, 1.1), skin, (0.7, 1.0, 0.8), R.spine)
    box('belt', (0.4 * g, 0.42 * g, 0.08), (0, 0, HIP_Z + 0.14), leather, 0.03, R.spine)
    ball('skull', 0.06, (0.2 * g, 0, HIP_Z + 0.14), bone, (0.8, 1, 1), R.spine)
    if kind in ('rathi', 'chakri', 'gadadhar', 'netter', 'mashaal'):
        # a breastplate over the chest
        box('plate', (0.3 * g, 0.48 * g, 0.34), (0.08, 0, 1.04), metal, 0.1, R.spine)
        box('plate_rim', (0.31 * g, 0.5 * g, 0.04), (0.08, 0, 1.2), metal_d, 0.015, R.spine)
    else:
        # a sash across the chest
        box('sash', (0.42 * g, 0.06, 0.08), (0.04, -0.05, 1.03), cloth, 0.02, R.spine, rot=(0.7, 0, 0))
    if kind == 'drummer':
        ball('belly', 0.24, (0.12, 0, 0.92), skin, (1, 1.2, 0.95), R.spine)

    # --- head: heavy jaw, glowing eyes under an angry brow, fangs; the kind's headgear
    hd = R.neck
    ball('neckm', 0.1 * g, (0.0, 0, NECK_Z + 0.02), skin_d, (1, 1, 1.1), hd)
    ball('head', 0.21, (0.02, 0, HEAD_Z), skin, (1.0, 0.95, 1.05), hd, 32)
    ball('jaw', 0.16, (0.08, 0, HEAD_Z - 0.09), skin, (1.0, 1.05, 0.7), hd)
    for i, y in enumerate((-0.09, 0.07)):
        ball(f'eye{i}', 0.038, (0.2, y, HEAD_Z + 0.03), eye, (0.5, 1.2, 0.7), hd)
        box(f'brow{i}', (0.05, 0.11, 0.035), (0.2, y, HEAD_Z + 0.08), skin_d, 0.01, hd, rot=((0.45 if i == 0 else -0.45), 0, 0))
    box('mouth', (0.03, 0.12, 0.025), (0.22, -0.01, HEAD_Z - 0.1), dark, 0.008, hd)
    for i, y in enumerate((-0.05, 0.03)):
        cone(f'fang{i}', 0.018, 0.0, 0.06, (0.225, y, HEAD_Z - 0.075), bone, hd, rot=(math.pi, 0, 0), verts=6)
    head = K['head']
    if head == 'horns':
        horn('hornL', (0.0, -0.14, HEAD_Z + 0.12), (-0.08, -0.3, HEAD_Z + 0.34), 0.05, bone, hd)
        horn('hornR', (0.0, 0.14, HEAD_Z + 0.12), (-0.08, 0.3, HEAD_Z + 0.34), 0.05, bone, hd)
        ball('hair', 0.2, (-0.06, 0, HEAD_Z + 0.06), dark, (1, 1, 0.9), hd)
    elif head == 'crown':
        cone('crown', 0.2, 0.16, 0.14, (0.0, 0, HEAD_Z + 0.2), metal, hd, verts=10)
        for i in range(5):
            a = (i / 5) * math.pi * 2
            cone(f'spike{i}', 0.035, 0.0, 0.12, (math.cos(a) * 0.15, math.sin(a) * 0.15, HEAD_Z + 0.33), metal, hd, verts=6)
        ball('gem', 0.03, (0.19, 0, HEAD_Z + 0.2), eye, (0.6, 1, 1), hd)
    elif head == 'crest':
        ball('helm', 0.225, (0.0, 0, HEAD_Z + 0.04), metal, (1.02, 1.0, 0.95), hd)
        box('crest', (0.36, 0.04, 0.16), (-0.04, 0, HEAD_Z + 0.25), cloth, 0.02, hd)
        box('cheek', (0.06, 0.4, 0.14), (0.14, 0, HEAD_Z - 0.04), metal_d, 0.02, hd)
    elif head == 'topknot':
        ball('hair', 0.2, (-0.06, 0, HEAD_Z + 0.06), dark, (1, 1, 0.9), hd)
        ball('knot', 0.08, (-0.05, 0, HEAD_Z + 0.26), dark, (1, 1, 1.2), hd)
        box('band', (0.42, 0.44, 0.04), (0.0, 0, HEAD_Z + 0.1), metal, 0.015, hd)
    elif head == 'band':
        ball('hair', 0.2, (-0.06, 0, HEAD_Z + 0.06), dark, (1, 1, 0.9), hd)
        box('band', (0.43, 0.45, 0.05), (0.0, 0, HEAD_Z + 0.1), cloth, 0.015, hd)
    elif head == 'fins':
        for i, y in enumerate((-0.2, 0.2)):
            box(f'fin{i}', (0.2, 0.03, 0.18), (-0.04, y, HEAD_Z + 0.06), metal, 0.02, hd, rot=(0, 0.4, 0))
        box('crestfin', (0.3, 0.03, 0.14), (-0.04, 0, HEAD_Z + 0.22), metal, 0.02, hd)
    elif head == 'veil':
        ball('hair', 0.21, (-0.07, 0, HEAD_Z + 0.04), dark, (1, 1, 1), hd)
        cone('tiara', 0.17, 0.12, 0.06, (0.0, 0, HEAD_Z + 0.2), metal, hd, verts=10)
        box('veil', (0.04, 0.3, 0.12), (0.2, 0, HEAD_Z - 0.06), mat('veilm', tone(K['cloth'], 0.2), rough=0.9), 0.02, hd)
    elif head == 'hood':
        ball('hood', 0.26, (-0.03, 0, HEAD_Z + 0.03), cloth, (1.05, 1.0, 1.1), hd)
        cone('hoodtip', 0.12, 0.0, 0.22, (-0.12, 0, HEAD_Z + 0.24), cloth, hd, rot=(0, -0.6, 0))
    elif head == 'skull':
        ball('skullhelm', 0.215, (0.02, 0, HEAD_Z + 0.03), bone, (1.02, 1.0, 1.0), hd)
        for i, y in enumerate((-0.09, 0.07)):
            ball(f'socket{i}', 0.05, (0.19, y, HEAD_Z + 0.03), dark, (0.5, 1, 1), hd)
            ball(f'eyeglow{i}', 0.03, (0.215, y, HEAD_Z + 0.03), eye, (0.5, 1, 1), hd)
    elif head == 'flame':
        fl = mat('flamehair', '#ffb02e', rough=0.2, emit='#ff6a1a')
        for i, (dx, dz, r) in enumerate(((-0.05, 0.16, 0.12), (0.03, 0.22, 0.09), (-0.12, 0.24, 0.08), (0.0, 0.32, 0.06))):
            ball(f'flame{i}', r, (dx, 0, HEAD_Z + dz), fl, (1, 1, 1.4), hd)
        horn('hornL', (0.04, -0.12, HEAD_Z + 0.1), (0.1, -0.2, HEAD_Z + 0.26), 0.035, bone, hd)
        horn('hornR', (0.04, 0.12, HEAD_Z + 0.1), (0.1, 0.2, HEAD_Z + 0.26), 0.035, bone, hd)
    # bald: just the head

    # --- arms: armoured shoulders, bare muscled arms, bracers, big fists
    R.upper, R.fore = {}, {}
    for side, y in (('n', -SH_Y), ('f', SH_Y)):
        far = side == 'f'
        sk = skin_d if far else skin
        mt = metal_d if far else metal
        up = joint(f'upper_{side}', (0, y, SH_Z), R.spine)
        fo = joint(f'fore_{side}', (0, y, SH_Z - 0.29), up)
        R.upper[side], R.fore[side] = up, fo
        ball(f'pauldron_{side}', 0.14 * g, (0, y, SH_Z + 0.02), mt, (1.1, 1.0, 0.75), up)
        tube(f'upperm_{side}', 0.095 * g, (0, y, SH_Z), (0, y, SH_Z - 0.29), sk, up, r2=0.085 * g)
        tube(f'forem_{side}', 0.085 * g, (0, y, SH_Z - 0.29), (0, y, SH_Z - 0.52), sk, fo, r2=0.075 * g)
        box(f'bracer_{side}', (0.17 * g, 0.17 * g, 0.14), (0, y, SH_Z - 0.44), mt, 0.04, fo)
        ball(f'hand_{side}', 0.085 * g, (0, y, SH_Z - 0.57), sk, (1, 1, 1.05), fo)

    # --- the weapon on the aim pivot
    R.aim = joint('aim', (0.08, -0.05, 1.05), R.spine)
    a = R.aim
    gy = -0.2 * g
    w = K['weapon']
    wood = mat('wood', '#4a2c16', rough=0.8)
    tip = 0.6
    if w == 'bow':
        # a recurved bow held upright in front, the string drawn back to the grip
        for i, (z0, z1) in enumerate(((1.05, 1.42), (1.05, 0.68))):
            tube(f'limb{i}', 0.022, (0.42, gy, z0), (0.36, gy, z1), wood, a, r2=0.014)
        tube('string', 0.006, (0.36, gy, 1.42), (0.36, gy, 0.68), bone, a)
        box('quiver', (0.12, 0.12, 0.38), (-0.24, 0, 1.12), leather, 0.03, R.spine, rot=(0, 0.3, 0))
        tip = 0.44
    elif w == 'sword':
        box('blade', (0.62, 0.025, 0.07), (0.52, gy, 1.05), mat('steel', '#d8dee6', rough=0.15, metal=0.95), 0.008, a)
        box('guard', (0.05, 0.05, 0.2), (0.2, gy, 1.05), metal, 0.01, a)
        tube('hilt', 0.03, (0.06, gy, 1.05), (0.2, gy, 1.05), leather, a)
        tip = 0.84
    elif w == 'mace':
        tube('haft', 0.035, (0.0, gy, 1.02), (0.55, gy, 1.06), metal_d, a)
        ball('head', 0.15, (0.65, gy, 1.07), metal, (1, 1, 1.1), a)
        for i in range(6):
            ang = i / 6 * math.pi * 2
            cone(f'stud{i}', 0.035, 0.0, 0.08, (0.65 + math.cos(ang) * 0.15, gy + math.sin(ang) * 0.15, 1.07), metal_d, a, verts=6)
        tip = 0.8
    elif w == 'disc':
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.035, location=(0.5, gy, 1.05), rotation=(math.pi / 2, 0, 0))
        finish(bpy.context.object, metal, parent=a)
        for i in range(8):
            ang = i / 8 * math.pi * 2
            cone(f'tooth{i}', 0.03, 0.0, 0.07, (0.5 + math.cos(ang) * 0.21, gy, 1.05 + math.sin(ang) * 0.21), metal, a, rot=(0, -ang + math.pi / 2, 0), verts=4)
        tip = 0.7
    elif w == 'trident':
        tube('shaft', 0.025, (-0.25, gy, 1.0), (0.7, gy, 1.04), wood, a)
        for i, dz in enumerate((-0.07, 0.0, 0.07)):
            cone(f'prong{i}', 0.025, 0.0, 0.16, (0.78, gy, 1.04 + dz), metal, a, rot=(0, math.pi / 2, 0), verts=6)
        box('net', (0.2, 0.18, 0.22), (-0.2, 0.05, 0.98), mat('netm', '#8a7a50', rough=0.95), 0.06, R.spine)
        tip = 0.86
    elif w == 'drum':
        bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=0.26, location=(0.3, gy + 0.05, 0.92), rotation=(0, math.pi / 2, 0), vertices=20)
        finish(bpy.context.object, mat('drumm', '#8a2a1a', rough=0.6), parent=a)
        for i, x in enumerate((0.17, 0.43)):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.205, depth=0.02, location=(x, gy + 0.05, 0.92), rotation=(0, math.pi / 2, 0), vertices=20)
            finish(bpy.context.object, mat('skinhead', '#e8d8b0', rough=0.7), parent=a)
        tube('stick', 0.015, (0.42, gy, 1.12), (0.6, gy, 1.24), wood, a)
        tip = 0.6
    elif w == 'sling':
        tube('cord', 0.008, (0.3, gy, 1.05), (0.55, gy, 0.85), leather, a)
        ball('stone', 0.05, (0.57, gy, 0.82), mat('stone', '#6a6a6a', rough=0.9), (1, 1, 1), a)
        tip = 0.6
    elif w == 'conch':
        ball('shell', 0.13, (0.45, gy, 1.05), mat('shellm', '#f0e6d0', rough=0.3), (1.6, 0.9, 0.9), a)
        cone('spire', 0.09, 0.0, 0.2, (0.26, gy, 1.05), mat('shellm', '#f0e6d0', rough=0.3), a, rot=(0, -math.pi / 2, 0))
        tip = 0.66
    elif w == 'blades':
        for i, dz in enumerate((0.04, -0.04)):
            box(f'blade{i}', (0.42, 0.02, 0.05), (0.42, gy - i * 0.02, 1.05 + dz), mat('steel', '#d8dee6', rough=0.15, metal=0.95), 0.006, a, rot=(0, -0.2 + i * 0.4, 0))
        tip = 0.66
    elif w == 'torch':
        tube('torchhaft', 0.03, (0.05, gy, 1.0), (0.5, gy, 1.12), wood, a)
        cone('torchcup', 0.08, 0.05, 0.1, (0.53, gy, 1.14), metal_d, a, rot=(0, -1.3, 0))
        ball('flame', 0.09, (0.58, gy, 1.2), mat('flamem', '#ffb02e', rough=0.2, emit='#ff7a1a'), (1, 1, 1.5), a)
        tip = 0.62
    elif w == 'staff':
        tube('staffm', 0.028, (-0.2, gy, 0.98), (0.65, gy, 1.04), wood, a)
        ball('orb', 0.08, (0.71, gy, 1.045), mat('orbm', K['eye'], rough=0.1, emit=K['eye']), (1, 1, 1), a)
        tip = 0.74
    elif w == 'lamp':
        tube('lampchain', 0.01, (0.4, gy, 1.05), (0.4, gy, 0.86), metal_d, a)
        ball('lampskull', 0.08, (0.4, gy, 0.8), bone, (1, 1, 0.9), a)
        ball('lampglow', 0.05, (0.44, gy, 0.8), mat('lampg', K['eye'], rough=0.2, emit=K['eye']), (1, 1, 1), a)
        tip = 0.44
    # 'none': fists

    R.muzzle = joint('muzzle', (tip, gy, 1.05), a)
    R.grip = joint('grip', (0.18, gy, 0.95), a)
    R.foregrip = joint('foregrip', (0.42 if w != 'bow' else 0.38, gy, 1.0), a)
    R.knife = []
    R.arm_len = (0.29, 0.29)
    R.sh_y = SH_Y
    return R


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kind', default='archer')
    ap.add_argument('--out', default='art3d/out/parts')
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--preview', default='', help='also render the whole figure in a test pose to this png')
    a = ap.parse_args()
    import hero_parts as hp

    sc = hr.reset()
    sc.cycles.samples = a.samples
    R = build(a.kind)
    s = KINDS[a.kind]['tall']
    R.turn.scale = (s, s, s)
    hp.render_parts(sc, R, os.path.join(a.out, f'v-{a.kind}'), a.preview)


if __name__ == '__main__':
    main()
