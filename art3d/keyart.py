"""
STRIKE SQUAD key art (store covers), rendered in Blender from the same hero models as the game's sprites.

A low camera on four heroes charging out of a burning golden city at dusk, a seven-headed demon king's silhouette
against the moon, embers in the air, cracked glowing ground. The title is added afterwards (art3d/cover.py).

    python3 art3d/keyart.py --layout landscape --out art3d/out/keyart-landscape.png [--samples 64]
Layouts: landscape 1920x1080, portrait 800x1200, square 800x800.
"""

import argparse
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import hero_rig as HR  # noqa: E402

SIZES = {'landscape': (1920, 1080), 'portrait': (800, 1200), 'square': (800, 800)}


def emission(name, hexc, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = HR.srgb(hexc)
    em.inputs[1].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def sky():
    """A dusk gradient: deep violet overhead, burning orange at the horizon."""
    w = bpy.context.scene.world
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Window'], sep.inputs[0])
    # screen space: bottom of the frame 0, top 1
    nt.links.new(sep.outputs['Y'], ramp.inputs[0])
    cr = ramp.color_ramp
    cr.elements[0].position = 0.35
    cr.elements[0].color = HR.srgb('#ff8a3d')
    cr.elements[1].position = 1.0
    cr.elements[1].color = HR.srgb('#1c0a2e')
    e = cr.elements.new(0.55)
    e.color = HR.srgb('#c2365e')
    e = cr.elements.new(0.78)
    e.color = HR.srgb('#4a1450')
    nt.links.new(ramp.outputs[0], bg.inputs[0])
    bg.inputs[1].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs[0])


def ground():
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 10, 0))
    g = bpy.context.object
    m = bpy.data.materials.new('ground')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = HR.srgb('#2a1a1e')
    b.inputs['Roughness'].default_value = 0.9
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs['Scale'].default_value = 1.6
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.03
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(vor.outputs['Distance'], ramp.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 2.2
    nt.links.new(ramp.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], b.inputs['Emission Strength'])
    b.inputs['Emission Color'].default_value = HR.srgb('#ff6a1a')
    g.data.materials.append(m)


def city(rng):
    """The golden city on the horizon: towers, domes and spires in silhouette, windows and fires glowing."""
    dark = HR.mat('city', '#1a0e1c', rough=0.9)
    gold = HR.mat('citygold', '#5a3a1a', rough=0.5, metal=0.6)
    win = emission('window', '#ffb347', 4)
    fire = emission('fire', '#ff7a2a', 6)
    for i in range(46):
        x = rng.uniform(-34, 34)
        y = rng.uniform(26, 40)
        w = rng.uniform(1.2, 3.2)
        h = rng.uniform(2.5, 11) * (1.4 if abs(x) < 8 else 1)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2))
        o = bpy.context.object
        o.scale = (w, w, h)
        o.data.materials.append(dark)
        if rng.random() < 0.55:
            bpy.ops.mesh.primitive_uv_sphere_add(radius=w * 0.6, location=(x, y, h), segments=32, ring_count=16)
            d = bpy.context.object
            HR.smooth(d)
            d.data.materials.append(gold)
            bpy.ops.mesh.primitive_cone_add(radius1=0.15, depth=w * 1.2, location=(x, y, h + w * 0.9))
            bpy.context.object.data.materials.append(gold)
        for j in range(rng.randint(1, 5)):
            bpy.ops.mesh.primitive_plane_add(size=0.22, location=(x + rng.uniform(-w / 3, w / 3), y - w / 2 - 0.01, rng.uniform(1, h - 0.5)), rotation=(math.pi / 2, 0, 0))
            bpy.context.object.data.materials.append(win)
        if rng.random() < 0.3:
            # a fire on the roof: a few small glowing tongues
            for k in range(3):
                bpy.ops.mesh.primitive_cone_add(radius1=rng.uniform(0.15, 0.3), depth=rng.uniform(0.5, 1.1), location=(x + rng.uniform(-w / 3, w / 3), y - w / 2, h + 0.3), vertices=8)
                bpy.context.object.data.materials.append(fire)


def demon_king():
    """A seven-headed demon king's silhouette rising over the skyline against the moon, eyes burning."""
    dark = emission('sil', '#12050f', 0.0)
    eyes = emission('eyes', '#ff9a1f', 9)
    moon = emission('moon', '#ffd9a0', 2.0)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=11, fill_type='NGON', location=(24, 80, 24), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(moon)
    cx, cy = 21, 66
    bpy.ops.mesh.primitive_uv_sphere_add(radius=8, location=(cx, cy, 10), segments=32, ring_count=16)
    body = bpy.context.object
    body.scale = (1.6, 0.6, 1.2)
    body.data.materials.append(dark)
    for i in range(7):
        a = (i - 3) * 0.3
        hx = cx + math.sin(a) * 10
        hz = 21 + math.cos(a) * 4 - abs(i - 3) * 0.8
        tube_neck = (Vector((cx + math.sin(a) * 5, cy, 16)), Vector((hx, cy, hz)))
        HR.tube(f'neck{i}', 0.9, tube_neck[0], tube_neck[1], dark)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1.9, location=(hx, cy - 0.5, hz), segments=24, ring_count=12)
        bpy.context.object.data.materials.append(dark)
        for sd in (-1, 1):
            bpy.ops.mesh.primitive_cone_add(radius1=0.5, depth=2.6, location=(hx + sd * 1.1, cy - 0.5, hz + 2.0), rotation=(0, sd * 0.45, 0), vertices=12)
            bpy.context.object.data.materials.append(dark)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.28, location=(hx + sd * 0.7, cy - 2.4, hz + 0.1), segments=10, ring_count=6)
            bpy.context.object.scale = (1.4, 1, 0.6)
            bpy.context.object.data.materials.append(eyes)


def embers(rng):
    m = emission('ember', '#ffae42', 25)
    for i in range(180):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rng.uniform(0.015, 0.05), location=(rng.uniform(-14, 14), rng.uniform(-2, 18), rng.uniform(0.2, 9)), segments=6, ring_count=4)
        bpy.context.object.data.materials.append(m)


def place_hero(hid, pose, frame, aim, loc, turn, heroes, flash=False):
    H = next(h for h in heroes if h['id'] == hid)
    before = set(bpy.data.objects)
    R = HR.build(H)
    HR.pose(R, pose, frame, aim)
    R.turn.location = loc
    R.turn.rotation_euler = (0, 0, math.radians(turn))
    # keep this hero's objects apart from the next one's (the builder finds some parts by name)
    for o in set(bpy.data.objects) - before:
        o.name = f'h{hid}_{o.name}'
    # a muzzle flash at the rifle's tip
    if flash:
        bpy.context.view_layer.update()
        tip = R.muzzle.matrix_world.translation
        d = (R.muzzle.matrix_world.translation - R.aim.matrix_world.translation).normalized()
        for k, (r, dep) in enumerate(((0.07, 0.34), (0.12, 0.2))):
            bpy.ops.mesh.primitive_cone_add(radius1=r, depth=dep, location=tip + d * dep / 2, vertices=10)
            c = bpy.context.object
            c.rotation_mode = 'QUATERNION'
            c.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d)
            c.data.materials.append(emission(f'flash{hid}{k}', '#ffb238' if k else '#ffe7a3', 8))
    return R


def main():
    argv = sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', default='landscape', choices=list(SIZES))
    ap.add_argument('--out', default='art3d/out/keyart.png')
    ap.add_argument('--samples', type=int, default=64)
    a = ap.parse_args(argv)
    W, Hh = SIZES[a.layout]
    sc = HR.reset()
    sc.render.film_transparent = False
    sc.render.resolution_x, sc.render.resolution_y = W, Hh
    sc.cycles.samples = a.samples
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'Standard'
    rng = random.Random(7)
    sky()
    ground()
    city(rng)
    demon_king()
    embers(rng)
    heroes = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'heroes.json')))
    # the squad, charging toward the camera's right
    tall = a.layout == 'portrait'
    place_hero(0, 'run', 2, 'f', (0.2, 0, 0), -40, heroes, flash=True)
    place_hero(1, 'jump', 0, 'uf', (-1.1, 1.8, 1.1) if tall else (-1.9, 1.4, 0.9), -30, heroes)
    place_hero(2, 'crouch', 0, 'f', (1.2, 1.9, 0) if tall else (2.1, 1.1, 0), -45, heroes, flash=True)
    place_hero(3, 'run', 6, 'f', (-1.6, 3.4, 0) if tall else (-3.3, 2.8, 0), -30, heroes)
    # camera: low, looking a little up at the squad
    cam_d = bpy.data.cameras.new('cam')
    cam_d.lens = 32 if a.layout == 'landscape' else 22 if a.layout == 'portrait' else 27
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    if a.layout == 'landscape':
        cam.location = (0.5, -5.6, 0.95)
        tgt = Vector((-0.3, 2, 1.55))
    elif a.layout == 'portrait':
        cam.location = (-0.1, -5.2, 0.65)
        tgt = Vector((-0.1, 2, 2.75))
    else:
        cam.location = (-0.4, -4.7, 0.85)
        tgt = Vector((-0.5, 2, 1.95))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # light: cool key from the front left, burning rim from the city behind, a warm fill from the ground
    def sun(name, energy, color, rot):
        l = bpy.data.lights.new(name, 'SUN')
        l.energy = energy
        l.color = color
        o = bpy.data.objects.new(name, l)
        sc.collection.objects.link(o)
        o.rotation_euler = tuple(math.radians(r) for r in rot)

    sun('key', 3.2, (0.85, 0.9, 1.0), (55, -30, -40))
    sun('rim', 9.0, (1.0, 0.55, 0.25), (-62, 20, 175))
    sun('rim2', 4.0, (0.95, 0.35, 0.6), (-55, -25, 200))
    sc.render.filepath = os.path.abspath(a.out)
    bpy.ops.render.render(write_still=True)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
