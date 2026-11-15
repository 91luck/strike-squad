"""
Story portraits: VANI, the flame of the Akhand Deep (the saga's guide), sitting in her clay lamp. A round little
flame with big dark eyes and a smile, a brass-rimmed clay diya, a warm halo. Rendered at 256x256 for the story comms
panel (client/src/game/comms.ts).

    python3 art3d/story_art.py --out client/src/assets/story/vani.webp [--samples 64]
"""

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from PIL import Image  # noqa: E402

import hero_rig as HR  # noqa: E402


def flame_mat():
    """Emissive flame: white-gold core to orange at the edges (by distance from the flame's own centre)."""
    m = bpy.data.materials.new('flame')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.45
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = HR.srgb('#fff4c8')
    ramp.color_ramp.elements[0].position = 0.15
    ramp.color_ramp.elements[1].color = HR.srgb('#ff7a1a')
    ramp.color_ramp.elements[1].position = 0.85
    e = ramp.color_ramp.elements.new(0.5)
    e.color = HR.srgb('#ffc247')
    nt.links.new(lw.outputs['Facing'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs[0])
    em.inputs[1].default_value = 1.6
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def build():
    flame = flame_mat()
    # the flame: a teardrop (a sphere pulled up into a point), leaning a little, with a curl at the tip
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 0.9), segments=48, ring_count=32)
    f = bpy.context.object
    for v in f.data.vertices:
        z = v.co.z
        if z > 0:
            k = z
            v.co.x *= 1 - 0.75 * k**1.4
            v.co.y *= 1 - 0.75 * k**1.4
            v.co.z = z * (1 + 1.3 * k)
            v.co.x += 0.25 * k**2.5
    HR.finish(f, flame)
    # eyes: big glossy dark ovals with two highlights each; a small smile
    ink = HR.mat('ink', '#2a1208', 0.15)
    white = HR.mat('hl', '#ffffff', 0.2, emit='#ffffff')
    for s in (-1, 1):
        HR.ball('eye', 0.2, (s * 0.36, -0.86, 1.05), ink, scale=(0.85, 0.5, 1.2))
        HR.ball('hl', 0.065, (s * 0.36 - 0.06, -0.97, 1.16), white)
        HR.ball('hl2', 0.03, (s * 0.36 + 0.06, -0.97, 0.98), white)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.03, location=(0, -0.93, 0.7), rotation=(math.radians(90), 0, 0))
    sm = bpy.context.object
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(sm.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.02], context='VERTS')
    bm.to_mesh(sm.data)
    bm.free()
    HR.finish(sm, ink)
    # cheeks
    blush = HR.mat('blush', '#ff5a3a', 0.6, emit='#ff6a3a')
    for s in (-1, 1):
        HR.ball('cheek', 0.1, (s * 0.62, -0.72, 0.78), blush, scale=(1.2, 0.4, 0.7))
    # the clay lamp: a shallow bowl with a pinched spout, a brass rim, painted dots
    clay = HR.mat('clay', '#9a4a22', 0.75)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.25, location=(0, 0, 0.15), segments=48, ring_count=24)
    bowl = bpy.context.object
    bm = bmesh.new()
    bm.from_mesh(bowl.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 0.05], context='VERTS')
    bm.to_mesh(bowl.data)
    bm.free()
    bowl.scale = (1.35, 1.0, 0.55)
    for v in bowl.data.vertices:
        if v.co.x > 0.6:
            v.co.x += (v.co.x - 0.6) * 0.8
    sol = bowl.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.08
    HR.finish(bowl, clay, sub=1)
    brass = HR.mat('brass', '#d9a520', 0.25, 1.0)
    bpy.ops.mesh.primitive_torus_add(major_radius=1.25, minor_radius=0.06, location=(0, 0, 0.16), major_segments=64)
    rim = bpy.context.object
    rim.scale = (1.35, 1.0, 1.0)
    HR.finish(rim, brass)
    dot = HR.mat('dot', '#f5e6c8', 0.6)
    for i in range(9):
        a = math.pi * (0.15 + 0.7 * i / 8)
        HR.ball('d', 0.06, (-math.cos(a) * 1.55, -math.sin(a) * 1.0 - 0.02, -0.18), dot)
    # oil surface the flame sits in
    oil = HR.mat('oil', '#5a2a08', 0.1, emit='#ff9a3a')
    oil.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.6
    bpy.ops.mesh.primitive_cylinder_add(radius=1.15, depth=0.02, location=(0, 0, 0.1), vertices=64)
    o = bpy.context.object
    o.scale = (1.3, 0.95, 1)
    HR.finish(o, oil)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='client/src/assets/story/vani.webp')
    ap.add_argument('--samples', type=int, default=64)
    a = ap.parse_args()
    sc = HR.reset()
    sc.cycles.samples = a.samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    w = sc.world
    w.node_tree.nodes['Background'].inputs[0].default_value = HR.srgb('#3a1a2a')
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    build()
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = 5.0
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = (0.2, -10, 1.75)
    cam.rotation_euler = (math.radians(84), 0, 0)
    for name, e, col, rot in (
        ('key', 2.5, (1, 0.9, 0.8), (55, -30, -30)),
        ('rim', 3.5, (1, 0.7, 0.4), (-60, 20, 160)),
    ):
        L = bpy.data.lights.new(name, 'SUN')
        L.energy = e
        L.color = col
        ob = bpy.data.objects.new(name, L)
        sc.collection.objects.link(ob)
        ob.rotation_euler = tuple(math.radians(x) for x in rot)
    # the flame lights the lamp from inside
    pl = bpy.data.lights.new('glow', 'POINT')
    pl.energy = 60
    pl.color = (1, 0.6, 0.25)
    po = bpy.data.objects.new('glow', pl)
    sc.collection.objects.link(po)
    po.location = (0, -0.6, 1.0)
    tmp = a.out + '.png'
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    im = Image.open(tmp).convert('RGBA').resize((256, 256), Image.LANCZOS)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    im.save(a.out, 'WEBP', quality=90, method=6)
    os.remove(tmp)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
