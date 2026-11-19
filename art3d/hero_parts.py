"""
The heroes as cut-out parts for the game's skeletal animation (client/src/game/rig.ts).

hero_rig.py renders a fixed set of whole frames (8 run frames, 5 aims); between them the game had to jump. Here the
same Blender model is taken apart instead: every limb is rendered on its own, in the rest pose (standing straight,
arms hanging, rifle level), with the point it turns about (its joint). The game puts the parts together again every
frame from joint angles it computes itself, so a run, a jump, an aim or a landing moves smoothly at any speed.

    python3 art3d/hero_parts.py --hero 0 [--samples 32]     # -> art3d/out/parts/h0/<part>.png + rig.json
    python3 art3d/pack_parts.py                              # -> client/src/assets/rigs/h<id>.webp + .json

Parts (each mesh belongs to the nearest joint above it in the hierarchy): pelvis (root), torso (spine), head (neck),
thigh_n/f, shin_n/f, upper_n/f, fore_n/f (forearm and hand), gun (the aim pivot), knife (shown in melee only).
`rig.json` holds, in HD sprite pixels with the feet at (0, 0) and y down: every joint's rest position, every part's
pivot inside its own image, the rifle's grip, fore-grip and muzzle, and the hand's position on the forearm.
"""

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import hero_rig as hr  # noqa: E402

JOINTS = ['root', 'spine', 'neck', 'thigh_n', 'shin_n', 'thigh_f', 'shin_f', 'upper_n', 'fore_n', 'upper_f', 'fore_f', 'aim']
PART_OF = {
    'root': 'pelvis',
    'spine': 'torso',
    'neck': 'head',
    'aim': 'gun',
}
# frame big enough for any part at rest, feet at (CX, FY)
FW, FH, CX, FY = 160, 140, 80, 120


def owner(o):
    p = o.parent
    while p is not None and p.type != 'EMPTY':
        p = p.parent
    return p


def render_parts(sc, R, out, preview=''):
    """Renders every part of a built rig `R` (hero_rig.build or villain_rig.build) into `out`, plus rig.json."""
    sc.render.resolution_x = FW * hr.SS
    sc.render.resolution_y = FH * hr.SS
    cam = hr.stage(R)
    cam.data.ortho_scale = FW * hr.PX
    cam.location = ((FW / 2 - CX) * hr.PX, -12, (FY - FH / 2) * hr.PX)
    hr.reset_pose(R)
    hr.show_knife(R, True)
    R.turn.rotation_euler = (0, 0, math.radians(-22))
    bpy.context.view_layer.update()
    os.makedirs(out, exist_ok=True)
    if preview:
        sc.render.filepath = os.path.abspath(preview)
        bpy.ops.render.render(write_still=True)

    def px(v):
        m = world_to_camera_view(sc, cam, v)
        return [round(m.x * FW - CX, 2), round((1 - m.y) * FH - FY, 2)]

    joints = {}
    for o in bpy.data.objects:
        if o.type == 'EMPTY' and o.name in JOINTS + ['muzzle', 'grip', 'foregrip']:
            joints[o.name] = px(o.matrix_world.translation)
    # where each hand sits on its forearm: the hand ball's centre
    for side in ('n', 'f'):
        h = bpy.data.objects[f'hand_{side}']
        c = sum((h.matrix_world @ Vector(v) for v in h.bound_box), Vector()) / 8
        joints[f'hand_{side}'] = px(c)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    groups = {}
    knife = set(o.name for o in R.knife)
    for o in meshes:
        j = owner(o)
        if j is None:
            continue
        key = 'knife' if o.name in knife else PART_OF.get(j.name, j.name)
        groups.setdefault(key, []).append(o)

    pivot_joint = {v: k for k, v in PART_OF.items()}
    parts = {}
    for key, objs in groups.items():
        keep = set(o.name for o in objs)
        for o in meshes:
            o.hide_render = o.name not in keep
        sc.render.filepath = os.path.abspath(os.path.join(out, key + '.png'))
        bpy.ops.render.render(write_still=True)
        j = 'fore_n' if key == 'knife' else pivot_joint.get(key, key)
        parts[key] = {'joint': j}
        print('rendered', key, len(objs), flush=True)
    for o in meshes:
        o.hide_render = False
    json.dump({'frame': [FW, FH, CX, FY], 'joints': joints, 'parts': parts}, open(os.path.join(out, 'rig.json'), 'w'), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', type=int, default=0)
    ap.add_argument('--out', default='art3d/out/parts')
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--preview', default='')
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    heroes = json.load(open(os.path.join(here, 'heroes.json')))
    hero = next(h for h in heroes if h['id'] == a.hero)
    sc = hr.reset()
    sc.cycles.samples = a.samples
    R = hr.build(hero)
    render_parts(sc, R, os.path.join(a.out, f"h{hero['id']}"), a.preview)


if __name__ == '__main__':
    main()
