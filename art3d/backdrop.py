"""
Saga stage backdrops: three parallax layers per stage art style, modelled and lit in Blender like a matte painting.

Each layer is a 1024x576 world-pixel strip (the size of the game's backdrop tiles, renderer.ts `layer()`), seamless
left to right so the game can repeat it, with a transparent sky so the game's own sky, sun and weather show through.

    far   distant ranges, deep in haze           (parallax 0.12)
    far2  nearer ranges or the stage's skyline   (parallax 0.22)
    mid   the stage's own world: trees, ruins, towers, crystals…  (parallax 0.45)

Everything is built from code: "relief sheets" (a front-facing sheet with a periodic ridged-noise silhouette and
relief, so mountains catch the sun on their ridges) plus primitive-built structures. Every structure near an edge is
built again one strip-width away, and every noise is periodic, so the strip tiles without a seam.

    python3 art3d/backdrop.py --zone vana --layer mid --out art3d/out/bg/vana-mid.png [--samples 24]
    python3 art3d/backdrop.py --all          # every zone and layer
"""

import argparse
import math
import os
import random
import sys
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

W = 10.24  # strip width (1 Blender unit = 100 world pixels)
H = 5.76
TILT = 0.0
# Emission strengths in the recipes are relative; scaled so glows keep their colour (the halo is added afterwards).
GLOW_K = 0.12
# Snow lies where (upward-facing + mottling noise) passes this range.
SNOW = (1.05, 1.2)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'bg')
# Render size per layer (the far layers are soft anyway: distance and haze).
RES = {'far': (1024, 576), 'far2': (1280, 720), 'mid': (2048, 1152)}


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


# ---------------------------------------------------------------- periodic noise (numpy)


class PNoise:
    """2D value noise, periodic in x with period `W` (so the strip tiles), fractal sums of it."""

    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)
        self.grids = {}

    def grid(self, px, o):
        k = (px, o)
        if k not in self.grids:
            self.grids[k] = self.rng.random((px, 256))
        return self.grids[k]

    def value(self, x, z, px, o=0):
        """x in world units (period W), z in world units; `px` lattice cells per period."""
        g = self.grid(px, o)
        u = (np.asarray(x) / W) * px
        v = np.asarray(z) * px / W + 64
        i0 = np.floor(u).astype(int)
        j0 = np.floor(v).astype(int)
        fu = u - i0
        fv = v - j0
        fu = fu * fu * (3 - 2 * fu)
        fv = fv * fv * (3 - 2 * fv)
        i0m = i0 % px
        i1m = (i0 + 1) % px
        j0m = j0 % 256
        j1m = (j0 + 1) % 256
        a = g[i0m, j0m] * (1 - fu) + g[i1m, j0m] * fu
        b = g[i0m, j1m] * (1 - fu) + g[i1m, j1m] * fu
        return a * (1 - fv) + b * fv

    def fbm(self, x, z, px, octaves=5, ridged=False, gain=0.5):
        s = 0.0
        amp = 1.0
        tot = 0.0
        for o in range(octaves):
            n = self.value(x, z, px * (2**o), o)
            if ridged:
                n = 1 - abs(2 * n - 1)
                n = n * n
            s = s + amp * n
            tot += amp
            amp *= gain
        return s / tot


# ---------------------------------------------------------------- scene


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # no undo history: every primitive added through an operator would otherwise keep a copy of the scene (gigabytes)
    bpy.context.preferences.edit.use_global_undo = False
    bpy.context.preferences.edit.undo_steps = 0
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError:
        pass
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    return sc


def camera(res):
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = W
    ob = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (W / 2, -40, H / 2)
    ob.rotation_euler = (math.radians(90), 0, 0)
    sc = bpy.context.scene
    sc.camera = ob
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    cam.clip_end = 200


def world(ambient, strength):
    w = bpy.context.scene.world
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = srgb(ambient)
    bg.inputs[1].default_value = strength


def sun(name, color, energy, rot_deg, angle=6):
    L = bpy.data.lights.new(name, 'SUN')
    L.color = srgb(color)[:3]
    L.energy = energy
    L.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, L)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    return ob


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_obj(name, verts, faces, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


# ---------------------------------------------------------------- materials


def _nodes(m):
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return nt, nt.nodes.new('ShaderNodeOutputMaterial')


def hazed(nt, shader_out, haze, k, mist=0.0, mist_top=1.5):
    """Atmospheric perspective: mix the surface toward the haze colour by `k`, more toward the bottom (`mist`)."""
    if k <= 0 and mist <= 0:
        return shader_out
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = srgb(haze)
    em.inputs[1].default_value = 1.0
    mix = nt.nodes.new('ShaderNodeMixShader')
    fac = k
    if mist > 0:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Position'], sep.inputs[0])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.0
        mr.inputs['From Max'].default_value = mist_top
        mr.inputs['To Min'].default_value = min(1.0, k + mist)
        mr.inputs['To Max'].default_value = k
        mr.clamp = True
        nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], mix.inputs[0])
    else:
        mix.inputs[0].default_value = fac
    nt.links.new(shader_out, mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    return mix.outputs[0]


def mat_rock(name, a, b, haze, k, mist=0.0, snow=None, scale=3.0, bump=0.4, rough=0.95, mist_top=1.5, glow=None):
    """Rock or earth: two colours mottled by noise, bumped strata, optional snow on upward faces, optional glowing
    cracks (`glow`: (colour, strength, threshold))."""
    m = bpy.data.materials.new(name)
    nt, out = _nodes(m)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = rough
    tc = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 8
    noise.inputs['Roughness'].default_value = 0.6
    nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = srgb(a)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = srgb(b)
    nt.links.new(noise.outputs['Fac'], ramp.inputs[0])
    col = ramp.outputs[0]
    bmp = nt.nodes.new('ShaderNodeBump')
    bmp.inputs['Strength'].default_value = bump
    wave = nt.nodes.new('ShaderNodeTexNoise')
    wave.inputs['Scale'].default_value = scale * 4
    wave.inputs['Detail'].default_value = 10
    nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
    nt.links.new(wave.outputs['Fac'], bmp.inputs['Height'])
    nt.links.new(bmp.outputs['Normal'], bsdf.inputs['Normal'])
    if snow:
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Normal'], sep.inputs[0])
        add = nt.nodes.new('ShaderNodeMath')
        add.operation = 'ADD'
        nt.links.new(sep.outputs['Z'], add.inputs[0])
        nt.links.new(noise.outputs['Fac'], add.inputs[1])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = SNOW[0]
        mr.inputs['From Max'].default_value = SNOW[1]
        nt.links.new(add.outputs[0], mr.inputs['Value'])
        mixc = nt.nodes.new('ShaderNodeMix')
        mixc.data_type = 'RGBA'
        nt.links.new(mr.outputs['Result'], mixc.inputs['Factor'])
        nt.links.new(col, mixc.inputs[6])
        mixc.inputs[7].default_value = srgb(snow)
        col = mixc.outputs[2]
    nt.links.new(col, bsdf.inputs['Base Color'])
    if glow:
        gc, gs, th = glow
        vor = nt.nodes.new('ShaderNodeTexVoronoi')
        vor.feature = 'DISTANCE_TO_EDGE'
        vor.inputs['Scale'].default_value = scale * 1.4
        nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = th
        mr.inputs['From Max'].default_value = 0.0
        nt.links.new(vor.outputs['Distance'], mr.inputs['Value'])
        bsdf.inputs['Emission Color'].default_value = srgb(gc)
        # only in patches: the cracks glow where a large slow noise is high, and more toward the bottom
        patch = nt.nodes.new('ShaderNodeTexNoise')
        patch.inputs['Scale'].default_value = scale * 0.35
        patch.inputs['Detail'].default_value = 2
        nt.links.new(tc.outputs['Object'], patch.inputs['Vector'])
        pm = nt.nodes.new('ShaderNodeMapRange')
        pm.inputs['From Min'].default_value = 0.52
        pm.inputs['From Max'].default_value = 0.68
        nt.links.new(patch.outputs['Fac'], pm.inputs['Value'])
        both = nt.nodes.new('ShaderNodeMath')
        both.operation = 'MULTIPLY'
        nt.links.new(mr.outputs['Result'], both.inputs[0])
        nt.links.new(pm.outputs['Result'], both.inputs[1])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = gs * 0.3
        nt.links.new(both.outputs[0], mul.inputs[0])
        nt.links.new(mul.outputs[0], bsdf.inputs['Emission Strength'])
    nt.links.new(hazed(nt, bsdf.outputs[0], haze, k, mist, mist_top), out.inputs[0])
    return m


def mat_flat(name, color, haze='#000000', k=0.0, rough=0.8, metal=0.0, emit=None, mist=0.0, mist_top=1.5):
    m = bpy.data.materials.new(name)
    nt, out = _nodes(m)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = srgb(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = srgb(emit[0])
        bsdf.inputs['Emission Strength'].default_value = emit[1]
    nt.links.new(hazed(nt, bsdf.outputs[0], haze, k, mist, mist_top), out.inputs[0])
    return m


def mat_glow(name, color, strength):
    m = bpy.data.materials.new(name)
    nt, out = _nodes(m)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = srgb(color)
    em.inputs[1].default_value = strength * GLOW_K
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def mat_fade(name, color, strength, alpha):
    """A soft round glow on a unit plane (fire light, crater glow): emission fading to transparent at the rim."""
    m = bpy.data.materials.new(name)
    nt, out = _nodes(m)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = srgb(color)
    em.inputs[1].default_value = strength * 0.5
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (2, 2, 2)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = 2.0
    nt.links.new(grad.outputs['Fac'], pw.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = alpha
    nt.links.new(pw.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------- relief sheets (mountains, hills, cliffs)


def relief(
    name,
    mat,
    noise,
    y,
    base,
    top,
    amp,
    cells=6,
    ridged=True,
    depth=1.2,
    detail=0.35,
    nx=420,
    nz=46,
    gully=1.0,
    flat_top=None,
):
    """A front-facing sheet from z=0 up to a periodic silhouette `top + amp*noise(x)`, bulging toward the camera
    with ridges and gullies so a light from above and behind rims the crests."""
    xs = np.linspace(-0.15 * W, 1.15 * W, nx)
    prof = top + amp * noise.fbm(xs, np.full(nx, 3.0), cells, 5, ridged)
    if flat_top is not None:
        prof = np.minimum(prof, flat_top)
    verts = []
    us = np.linspace(0, 1, nz) ** 1.7
    for i, x in enumerate(xs):
        p = prof[i]
        for u in us:
            z = p - (p - base) * u
            d = p - z
            back = math.sqrt(min(1.0, d / max(0.15, (p - base) * 0.35)))
            g = noise.fbm(np.array([x]), np.array([z * 0.5 * gully]), cells * 4, 4, True)[0]
            yy = y - depth * back - detail * depth * g * back
            verts.append((x, yy, z))
    faces = []
    for i in range(nx - 1):
        for j in range(nz - 1):
            a = i * nz + j
            faces.append((a, a + nz, a + nz + 1, a + 1))
    return mesh_obj(name, verts, faces, mat)


# ---------------------------------------------------------------- structures


def prim(kind, loc, scale=(1, 1, 1), rot=(0, 0, 0), mat=None, **kw):
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(location=loc, rotation=rot, **kw)
    ob = bpy.context.object
    ob.scale = scale
    if mat:
        ob.data.materials.append(mat)
    return ob


def blob(loc, r, mat, seed, squash=(1, 0.8, 0.85), rough=None):
    """A lumpy round mass (canopy, boulder, cloud puff): a subdivided ico sphere displaced by noise."""
    rr = random.Random(seed)
    ob = prim('ico_sphere', loc, (r * squash[0], r * squash[1], r * squash[2]), (rr.uniform(0, 6), rr.uniform(0, 6), rr.uniform(0, 6)), mat=mat, subdivisions=4)
    # one shared noise texture (one per blob costs megabytes each once evaluated); the random rotation above already
    # makes every blob a different shape
    tex = bpy.data.textures.get('blobtex') or bpy.data.textures.new('blobtex', 'CLOUDS')
    tex.noise_scale = 0.45
    md = ob.modifiers.new('d', 'DISPLACE')
    md.texture = tex
    md.strength = 0.35 if rough is None else rough
    md.texture_coords = 'LOCAL'
    # (a finer sphere instead of a subdivision modifier: each modifier keeps a subdivision cache of megabytes, and
    # a forest of blobs ran out of memory)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def place(build, x, margin, *args, **kw):
    """Builds a structure at x and, when it overhangs an edge of the strip, an exact copy one strip-width away (the
    copy shares the mesh, materials and local-space noise), so the strip tiles without a seam."""
    obs = [o for o in (build(x, *args, **kw) or []) if o is not None]
    shifts = ([W] if x - margin < 0 else []) + ([-W] if x + margin > W else [])
    for dx in shifts:
        for ob in obs:
            c = ob.copy()
            c.location.x += dx
            link(c)
    return obs


def tree(x, y, z, h, mats, rng, burnt=False, kind='broad'):
    """A tree: a tapering trunk splitting into limbs and twigs (two levels), crowned with clusters of leaf masses;
    burnt trees keep only their bare, glowing-cracked limbs; conifers are stacked drooping tiers."""
    trunk, leaf, ember = mats
    leaves = leaf if isinstance(leaf, (list, tuple)) else [leaf]
    obs = []
    r = h * 0.045
    lean = rng.uniform(-0.12, 0.12)
    if kind == 'conifer':
        obs.append(prim('cone', (x, y, z + h * 0.4), (1, 1, 1), (0, lean * 0.3, 0), mat=trunk, radius1=r, radius2=r * 0.2, depth=h * 0.8, vertices=8))
        if not burnt:
            tiers = 6
            for j in range(tiers):
                k = j / tiers
                obs.append(prim('cone', (x + lean * h * k * 0.3, y, z + h * (0.25 + k * 0.66)), (1, 0.7, 1), mat=leaves[j % len(leaves)], radius1=h * (0.22 - k * 0.15), radius2=0, depth=h * 0.26, vertices=9))
        else:
            for j in range(5):
                side = 1 if j % 2 else -1
                zz = z + h * (0.35 + j * 0.11)
                L = h * (0.2 - j * 0.025)
                obs.append(prim('cone', (x + side * L * 0.45, y, zz + L * 0.1), (1, 1, 1), (0, side * 1.25, 0), mat=trunk, radius1=r * 0.3, radius2=0.002, depth=L, vertices=5))
        return obs
    obs.append(prim('cone', (x, y, z + h * 0.3), (1, 1, 1), (0, lean, 0), mat=trunk, radius1=r * 1.3, radius2=r * 0.7, depth=h * 0.6, vertices=10))
    top = (x + math.sin(lean) * h * 0.3, z + h * 0.58)
    ends = []

    def limb(px, pz, ang, L, rad, depth):
        ex = px + math.sin(ang) * L
        ez = pz + math.cos(ang) * L
        obs.append(prim('cone', ((px + ex) / 2, y, (pz + ez) / 2), (1, 1, 1), (0, ang, 0), mat=trunk, radius1=rad, radius2=rad * 0.55, depth=L * 1.05, vertices=7))
        if depth:
            for s in (-1, 1):
                limb(ex, ez, ang + s * rng.uniform(0.35, 0.7), L * rng.uniform(0.55, 0.75), rad * 0.55, depth - 1)
        else:
            ends.append((ex, ez))

    n0 = rng.choice((2, 3))
    for i in range(n0):
        a = lean + (i - (n0 - 1) / 2) * rng.uniform(0.5, 0.8)
        limb(top[0], top[1], a, h * rng.uniform(0.2, 0.28), r * 0.7, 1 if not burnt else 2)
    if not burnt:
        for k, (ex, ez) in enumerate(ends):
            for j in range(5):
                obs.append(
                    blob(
                        (ex + rng.uniform(-0.9, 0.9) * h * 0.08, y - 0.05 - j * 0.02, ez + rng.uniform(-0.2, 0.8) * h * 0.08),
                        h * rng.uniform(0.06, 0.1),
                        leaves[(k + j) % len(leaves)],
                        rng.randint(0, 9999),
                    )
                )
    return obs


def flame(x, y, z, h, mat_core, mat_glow_):
    """A fire: an outer orange glow, a tall flickering tongue and a hot core (soft emissive ellipses)."""
    up = (math.radians(90), 0, 0)
    return [
        prim('plane', (x, y - 0.3, z + h * 0.35), (h * 1.8, 1, h * 1.4), up, mat=mat_glow_, size=1),
        prim('plane', (x, y - 0.32, z + h * 0.45), (h * 0.55, 1, h * 1.3), up, mat=mat_core, size=1),
    ]


def column(x, y, z, h, r, mat, cap_mat=None, broken=0.0):
    obs = [prim('cylinder', (x, y, z + h * (1 - broken) / 2), (1, 1, 1), mat=mat, radius=r, depth=h * (1 - broken), vertices=16)]
    if not broken:
        obs.append(prim('cube', (x, y, z + h + r * 0.3), (r * 1.5, r * 1.5, r * 0.3), mat=cap_mat or mat))
    obs.append(prim('cube', (x, y, z + r * 0.25), (r * 1.5, r * 1.5, r * 0.25), mat=cap_mat or mat))
    return obs


def dome_tower(x, y, z, h, r, body, dome, glow=None, rng=None, spire=True):
    """A palace tower: tiers, an onion dome and a finial, lit windows."""
    obs = []
    obs.append(prim('cylinder', (x, y, z + h / 2), (1, 1, 1), mat=body, radius=r, depth=h, vertices=24))
    obs.append(prim('cylinder', (x, y, z + h + 0.04), (1, 1, 1), mat=dome, radius=r * 1.15, depth=0.08, vertices=24))
    d = prim('uv_sphere', (x, y, z + h + r * 0.75), (1, 1, 1.25), mat=dome, radius=r * 0.95, segments=24, ring_count=16)
    obs.append(d)
    if spire:
        obs.append(prim('cone', (x, y, z + h + r * 2.1), (1, 1, 1), mat=dome, radius1=r * 0.18, radius2=0, depth=r * 1.2, vertices=8))
    if glow is not None and rng is not None:
        rows = max(1, int(h / 0.35))
        for i in range(rows):
            for dx in (-0.45, 0, 0.45):
                if rng.random() < 0.55:
                    obs.append(prim('cube', (x + dx * r, y - r * 0.92, z + 0.25 + i * 0.35), (r * 0.08, 0.02, 0.07), mat=glow))
    return obs


def wheel(x, y, z, r, mat, tilt=0.0):
    """A broken chariot wheel: rim and spokes."""
    obs = [prim('torus', (x, y, z), (1, 1, 1), (math.radians(90), tilt, 0), mat=mat, major_radius=r, minor_radius=r * 0.07, major_segments=32, minor_segments=8)]
    for i in range(8):
        a = i * math.pi / 8
        obs.append(prim('cylinder', (x, y, z), (1, 1, 1), (math.radians(90), 0, 0), mat=mat, radius=r * 0.03, depth=0.01))
        sp = prim('cube', (x, y, z), (r * 0.03, r * 0.03, r), (0, a + tilt, 0), mat=mat)
        obs.append(sp)
    obs.append(prim('cylinder', (x, y, z), (1, 1, 1), (math.radians(90), 0, 0), mat=mat, radius=r * 0.15, depth=r * 0.3, vertices=12))
    return obs


def banner(x, y, z, h, pole, cloth, rng):
    """A tall war banner: pole, cross-bar, a long cloth with a wave in it."""
    obs = [prim('cylinder', (x, y, z + h / 2), (1, 1, 1), mat=pole, radius=0.025, depth=h, vertices=8)]
    obs.append(prim('cylinder', (x + 0.18, y, z + h - 0.05), (1, 1, 1), (0, math.radians(90), 0), mat=pole, radius=0.015, depth=0.42, vertices=6))
    nx, nz = 10, 14
    verts = []
    ph = rng.uniform(0, 6)
    for i in range(nx):
        for j in range(nz):
            u = i / (nx - 1)
            v = j / (nz - 1)
            xx = x + 0.0 + u * 0.36
            zz = z + h - 0.06 - v * h * 0.45
            yy = y - 0.04 + 0.05 * math.sin(v * 5 + ph) * u
            xx += 0.06 * math.sin(v * 3 + ph) * v
            verts.append((xx, yy, zz))
    faces = [(i * nz + j, (i + 1) * nz + j, (i + 1) * nz + j + 1, i * nz + j + 1) for i in range(nx - 1) for j in range(nz - 1)]
    obs.append(mesh_obj('banner', verts, faces, cloth))
    return obs


def crystal(x, y, z, h, mat, rng, n=5):
    obs = []
    for i in range(n):
        a = rng.uniform(-0.5, 0.5)
        hh = h * rng.uniform(0.5, 1.0)
        obs.append(prim('cone', (x + math.sin(a) * hh * 0.4, y, z + math.cos(a) * hh * 0.5), (1, 1, 1), (0, a, 0), mat=mat, radius1=hh * 0.13, radius2=0, depth=hh, vertices=6))
    return obs


def stalactite(x, y, ztop, h, mat):
    return [prim('cone', (x, y, ztop - h / 2), (1, 1, 1), (math.radians(180), 0, 0), mat=mat, radius1=h * 0.12, radius2=0.01, depth=h, vertices=10)]


def arch(x, y, z, w, h, mat):
    """A ruined stone arch: two piers and a half-torus top."""
    t = w * 0.16
    obs = [
        prim('cube', (x - w / 2, y, z + h / 2), (t, t, h / 2), mat=mat),
        prim('cube', (x + w / 2, y, z + h / 2), (t, t, h / 2), mat=mat),
    ]
    tor = prim('torus', (x, y, z + h), (1, 1, 1), (math.radians(90), 0, 0), mat=mat, major_radius=w / 2, minor_radius=t, major_segments=32, minor_segments=8)
    # keep only the upper half
    import bmesh

    me = tor.data

    bm = bmesh.new()
    bm.from_mesh(me)
    # torus lies in XY before rotation: local y < 0 → below once rotated about X by 90°
    kill = [v for v in bm.verts if v.co.y < -0.01]
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(me)
    bm.free()
    obs.append(tor)
    return obs


def ring_wall(x, y, z, r, h, mat, gold=None, towers=8):
    """A circular fort wall seen from the front (a short wide cylinder band) with towers around it."""
    obs = [prim('cylinder', (x, y, z + h / 2), (1, 0.35, 1), mat=mat, radius=r, depth=h, vertices=64)]
    for i in range(towers):
        a = i / towers * math.pi * 2
        tx = x + math.cos(a) * r
        ty = y + math.sin(a) * r * 0.35
        if ty > y + r * 0.2:
            continue
        obs.append(prim('cylinder', (tx, ty, z + h * 0.75), (1, 1, 1), mat=mat, radius=h * 0.18, depth=h * 1.5, vertices=12))
        obs.append(prim('cone', (tx, ty, z + h * 1.65), (1, 1, 1), mat=gold or mat, radius1=h * 0.22, radius2=0, depth=h * 0.35, vertices=12))
    return obs


def pagoda(x, y, z, w, tiers, body, roof, glow=None):
    """A stepped temple tower (shikhara-like): stacked shrinking blocks with a crown."""
    obs = []
    zz = z
    for i in range(tiers):
        k = 1 - i / (tiers + 1)
        hh = w * 0.35 * k
        obs.append(prim('cube', (x, y, zz + hh / 2), (w * k / 2, w * k / 2 * 0.7, hh / 2), mat=body))
        obs.append(prim('cube', (x, y, zz + hh + 0.02), (w * k / 2 * 1.08, w * k / 2 * 0.75, 0.025), mat=roof))
        if glow is not None and i < tiers - 1:
            obs.append(prim('cube', (x, y - w * k / 2 * 0.7 - 0.005, zz + hh * 0.45), (w * k * 0.08, 0.01, hh * 0.2), mat=glow))
        zz += hh + 0.04
    obs.append(prim('cone', (x, y, zz + w * 0.15), (1, 1, 1), mat=roof, radius1=w * 0.12, radius2=0, depth=w * 0.3, vertices=8))
    return obs


def ground_strip(name, mat, noise, y, top, amp=0.08, cells=10):
    return relief(name, mat, noise, y, 0.0, top, amp, cells=cells, ridged=False, depth=0.6, detail=0.2, nz=16)


# ---------------------------------------------------------------- stage recipes

# Each recipe: lights + world, then three layer builders. Colours follow the stage's palette (client
# world-art.ts ZONES) so the game's sky, fog and grade still sit with them.


def lights(key_col, key_e, rim_col, rim_e, amb, amb_e, key_rot=(55, 0, 35), rim_rot=(-60, 0, 20)):
    world(amb, amb_e)
    sun('key', key_col, key_e, key_rot)
    sun('rim', rim_col, rim_e, rim_rot, angle=3)


def R(name, layer):
    return random.Random(zlib.crc32(f'{name}/{layer}'.encode()))


def build_vana(layer):
    rng = R('vana', layer)
    n = PNoise(11 if layer == 'far' else 12 if layer == 'far2' else 13)
    lights('#ffc285', 1.4, '#ffa04a', 12.0, '#5a2412', 0.35, key_rot=(62, 0, 48))
    if layer == 'far':
        relief('far', mat_rock('r', '#8a3a1a', '#5a2412', '#e0773a', 0.3, 0.55, mist_top=3.4), n, 1.5, 0, 3.4, 1.4, cells=5, depth=1.8)
        relief('far-b', mat_rock('r2', '#6a2a14', '#401a0c', '#d0652a', 0.18, 0.6, mist_top=2.6), PNoise(19), 0, 0, 2.3, 0.9, cells=7, depth=1.4)
        smoke = mat_fade('sm', '#3a1a12', 1.0, 0.55)
        for i in range(4):
            place(lambda x: [prim('plane', (x, -2, 3.6), (1.0, 1, 2.6), (math.radians(90), 0.2, 0), mat=smoke, size=1)], rng.uniform(0, W), 0.6)
    elif layer == 'far2':
        relief('hills', mat_rock('r', '#5a2010', '#341208', '#c2541f', 0.22, 0.45, mist_top=2.0), n, 0, 0, 1.9, 0.5, cells=6, ridged=False)
        trunk = mat_flat('t', '#1f0d07', '#c2541f', 0.2)
        leaf = mat_flat('l', '#3d2a10', '#c2541f', 0.2)
        glow = mat_fade('fg', '#ff6a1a', 3, 0.7)
        for i in range(30):
            x = i / 30 * W + rng.uniform(-0.1, 0.1)
            place(tree, x, 0.4, 0.3, 1.5 + rng.uniform(-0.15, 0.2), rng.uniform(0.7, 1.1), (trunk, leaf, None), rng, burnt=rng.random() < 0.6, kind='conifer')
        for i in range(5):
            place(lambda xx: [prim('plane', (xx, -0.2, 1.6), (1.6, 1, 0.8), (math.radians(90), 0, 0), mat=glow, size=1)], rng.uniform(0, W), 0.9)
    else:
        ground_strip('g', mat_rock('g', '#3a1a0c', '#22100a', '#7c2d12', 0.0, scale=5), n, -0.2, 1.05)
        charred = mat_rock('bark', '#24140c', '#0e0805', '#000000', 0.0, scale=1.6, bump=0.8, glow=('#ff6a00', 5.0, 0.004))
        trunk = mat_rock('bark2', '#4a2e1a', '#2a180c', '#000000', 0.0, scale=10, bump=0.8)
        leaf = [mat_rock('leaf', '#6a8a1c', '#3a5210', '#000000', 0.0, scale=5, rough=0.7), mat_rock('leaf2', '#8a6a1c', '#4a3a10', '#000000', 0.0, scale=5, rough=0.7), mat_rock('leaf3', '#a0501c', '#5a2a10', '#000000', 0.0, scale=5, rough=0.7)]
        ember = mat_glow('em', '#ffb347', 20)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg', '#ff5a0a', 4, 0.8)
        for i in range(14):
            x = (i + 0.5) / 14 * W + rng.uniform(-0.3, 0.3)
            burnt = rng.random() < 0.55
            back = i % 2
            place(tree, x, 1.0, 0.6 if back else -0.1, 0.9, rng.uniform(1.2, 1.6) if back else rng.uniform(1.7, 2.3), (charred if burnt else trunk, leaf, ember), rng, burnt=burnt)
            if burnt and not back:
                place(flame, x + rng.uniform(-0.3, 0.3), 0.6, -0.5, 0.95, rng.uniform(0.45, 0.8), fire_core, fire_glow)


def build_inferno(layer):
    rng = R('inferno', layer)
    n = PNoise(21 + ['far', 'far2', 'mid'].index(layer))
    lights('#ff9a5a', 1.2, '#ff7a2a', 12.0, '#3a0c06', 0.35)
    lava = ('#ff5a00', 14.0, 0.02)
    if layer == 'far':
        relief('far', mat_rock('r', '#5a1a0a', '#2a0a06', '#b5401a', 0.35, 0.55, mist_top=3.5), n, 0, 0, 3.0, 1.5, cells=4, depth=1.8)
        place(lambda x: [prim('plane', (x, -2, 3.6), (3.0, 1, 1.6), (math.radians(90), 0, 0), mat=mat_fade('cg', '#ff6a1a', 3, 0.6), size=1)], W * 0.3, 1.6)
    elif layer == 'far2':
        relief('spires', mat_rock('r', '#2a0c06', '#140504', '#a3300f', 0.25, 0.6, glow=('#ff5a00', 8.0, 0.015), mist_top=2.2), n, 0, 0, 2.2, 1.4, cells=9, depth=1.2, gully=2.0)
        fall = mat_glow('lf', '#ff7a1a', 22)
        for i in range(4):  # lava falls down the spires
            place(lambda x: [prim('cube', (x, -1.6, 1.0), (0.06, 0.01, 0.9), mat=fall), prim('cube', (x, -1.62, 1.0), (0.018, 0.01, 0.9), mat=mat_glow('lc', '#ffe0a0', 30)), prim('plane', (x, -1.7, 0.9), (1.0, 1, 2.2), (math.radians(90), 0, 0), mat=mat_fade('lg', '#ff5a00', 4, 0.7), size=1)], rng.uniform(0, W), 0.5)
    else:
        ground_strip('g', mat_rock('g', '#2a0c06', '#140504', '#000', 0.0, glow=lava), n, -0.2, 1.1)
        rock = mat_rock('rock', '#3a1209', '#120504', '#000', 0.0, scale=2.5, bump=0.9, glow=('#ff5a00', 10.0, 0.012))
        for i in range(6):
            x = (i + 0.5) / 6 * W + rng.uniform(-0.3, 0.3)
            h = rng.uniform(2.6, 3.8)
            place(lambda xx, h=h, i=i: [relief_pillar(xx, 0.5, h, rng.uniform(0.5, 0.8), rock, n, 40 + i)], x, 0.6)
        pool = mat_fade('pool', '#ff6a1a', 4, 0.75)
        for i in range(4):
            place(lambda x: [prim('plane', (x, -0.3, 0.95), (1.4, 1, 0.5), (math.radians(90), 0, 0), mat=pool, size=1)], rng.uniform(0, W), 0.8)


def build_sagar(layer):
    rng = R('sagar', layer)
    n = PNoise(31 + ['far', 'far2', 'mid'].index(layer))
    lights('#ffd7a0', 2.6, '#f4a261', 5.0, '#13597a', 0.7, key_rot=(60, 0, 40))
    if layer == 'far':
        relief('isles', mat_rock('r', '#2a6380', '#1d4e6b', '#7fb6cf', 0.5, 0.2), n, 0, 0, 1.9, 0.9, cells=3)
        # a far lighthouse tower on the isle
        tw = mat_flat('tw', '#30627c', '#7fb6cf', 0.5)
        place(lambda x: dome_tower(x, -1, 1.7, 1.2, 0.12, tw, tw, mat_glow('lamp', '#ffe6a0', 40), rng), W * 0.62, 0.3)
    elif layer == 'far2':
        relief('cliffs', mat_rock('r', '#1d4e6b', '#123a52', '#5fa0bf', 0.28, 0.25), n, 0, 0, 1.4, 1.0, cells=5, ridged=True, flat_top=2.2)
        sail = mat_flat('sail', '#e8dcc0', '#7fb6cf', 0.25)
        hull = mat_flat('hull', '#3a2a1e', '#7fb6cf', 0.25)
        for x in (W * 0.2, W * 0.78):
            place(
                lambda xx: [
                    prim('cube', (xx, -1.5, 0.95), (0.4, 0.08, 0.07), mat=hull),
                    prim('cone', (xx + 0.05, -1.5, 1.35), (1, 0.15, 1), mat=sail, radius1=0.25, radius2=0, depth=0.7, vertices=3),
                ],
                x,
                0.5,
            )
    else:
        rock = mat_rock('stack', '#2c5a6e', '#16323f', '#000', 0.0, scale=3, bump=0.6)
        for i, x in enumerate((W * 0.12, W * 0.45, W * 0.8)):
            h = (2.4, 1.6, 2.8)[i]
            place(lambda xx, h=h, i=i: [relief_pillar(xx, 0.4, h, 0.55, rock, n, i)], x, 0.6)
        place(lambda xx: arch(xx, 0.2, 0.6, 1.4, 1.2, rock), W * 0.62, 1.0)
        wave = mat_flat('sea', '#0f3247', rough=0.15, metal=0.0)
        ground_strip('sea', wave, n, -0.5, 0.75, amp=0.05, cells=20)


def relief_pillar(x, y, h, w, mat, noise, seed):
    """A sea stack / rock pillar: a tall lumpy column made from a displaced cylinder."""
    ob = prim('cylinder', (x, y, h / 2), (w / 2, w / 3, h / 2), mat=mat, radius=1, depth=2, vertices=24)
    sub = ob.modifiers.new('s', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    tex = bpy.data.textures.new(f'pl{seed}', 'CLOUDS')
    tex.noise_scale = 0.3
    md = ob.modifiers.new('d', 'DISPLACE')
    md.texture = tex
    md.strength = 0.22
    md.texture_coords = 'LOCAL'
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def build_shikhar(layer):
    rng = R('shikhar', layer)
    n = PNoise(41 + ['far', 'far2', 'mid'].index(layer))
    lights('#c7d2fe', 2.2, '#e0e7ff', 6.0, '#3b2a6b', 0.6, key_rot=(50, 0, 30))
    snow = '#eef2ff'
    if layer == 'far':
        relief('peaks', mat_rock('r', '#5a5290', '#2f2a5a', '#8b7fc7', 0.35, 0.3, snow=snow, mist_top=3.0), n, 1.0, 0, 3.0, 2.2, cells=3, depth=2.2)
    elif layer == 'far2':
        relief('ridge', mat_rock('r', '#2f2a5a', '#1d1940', '#8b7fc7', 0.22, 0.35, snow=snow, mist_top=2.0), n, 0, 0, 1.9, 1.2, cells=5, depth=1.6)
        stone = mat_flat('st', '#3a3366', '#8b7fc7', 0.3)
        place(lambda x: pagoda(x, -0.8, 2.3, 0.55, 4, stone, mat_flat('rf', '#5b4a8a', '#8b7fc7', 0.3), mat_glow('gl', '#ffd28a', 20)), W * 0.35, 0.4)
    else:
        rock = mat_rock('cl', '#2a2550', '#16132e', '#000', 0.0, snow=snow, scale=3)
        relief('crag', rock, n, 0.2, 0, 1.2, 0.5, cells=7, depth=0.9, ridged=False)
        trunk = mat_flat('t', '#1a1530')
        leaf = [mat_rock('pn', '#1f3a3a', '#132626', '#000', 0.0, snow=snow, scale=6), mat_rock('pn2', '#25403a', '#142a26', '#000', 0.0, snow=snow, scale=6)]
        for i in range(16):
            x = (i + 0.5) / 16 * W + rng.uniform(-0.2, 0.2)
            place(tree, x, 0.5, -0.3 + (i % 2) * 0.4, 0.95 + (i % 2) * 0.1, rng.uniform(0.9, 1.7), (trunk, leaf, None), rng, kind='conifer')
        flag = [mat_flat(f'f{i}', c) for i, c in enumerate(('#ef4444', '#facc15', '#22c55e', '#3b82f6', '#f8fafc'))]
        cord = mat_flat('cord', '#2a2440')
        for k in range(2):
            x0 = rng.uniform(0.5, W - 2.5)
            place(lambda xx: [prim('cylinder', (xx, -0.4, 1.6), (1, 1, 1), mat=cord, radius=0.02, depth=1.6, vertices=6), prim('cylinder', (xx + 2.0, -0.4, 1.6), (1, 1, 1), mat=cord, radius=0.02, depth=1.6, vertices=6)], x0, 0.1)
            for j in range(11):
                t = j / 10
                place(lambda xx, j=j, t=t: [prim('cube', (xx, -0.4, 2.35 - 0.35 * math.sin(t * math.pi) - 0.06), (0.06, 0.005, 0.08), mat=flag[j % 5])], x0 + t * 2.0, 0.1)


def build_naglok(layer):
    rng = R('naglok', layer)
    n = PNoise(51 + ['far', 'far2', 'mid'].index(layer))
    lights('#5eead4', 1.2, '#2dd4bf', 4.0, '#032a22', 0.6)
    glow = mat_glow('cr', '#5eead4', 9)
    if layer == 'far':
        relief('cave', mat_rock('r', '#0b3d35', '#06302a', '#0f766e', 0.55, 0.2), n, 0, 0, 2.4, 1.2, cells=5)
        rock = mat_rock('rt', '#06302a', '#041f1b', '#0f766e', 0.55)
        for i in range(14):
            place(lambda x, h=rng.uniform(0.8, 2.2): stalactite(x, 1, H + 0.1, h, rock), rng.uniform(0, W), 0.3)
    elif layer == 'far2':
        relief('cave2', mat_rock('r', '#063a32', '#03201b', '#0f766e', 0.3, 0.3), n, 0, 0, 1.7, 0.8, cells=7)
        rock = mat_rock('rt', '#04261f', '#021512', '#0f766e', 0.3)
        for i in range(16):
            place(lambda x, h=rng.uniform(0.6, 1.6): stalactite(x, 0.5, H + 0.1, h, rock), rng.uniform(0, W), 0.3)
        for i in range(6):
            place(lambda x: crystal(x, 0, 1.5, 0.5, glow, rng, 4), rng.uniform(0, W), 0.3)
    else:
        rock = mat_rock('pl', '#0a3a33', '#03201b', '#000', 0.0, scale=5)
        ground_strip('g', rock, n, -0.2, 1.0)
        # serpent pillars: columns with a coil wound round them
        coil = mat_rock('coil', '#14532d', '#052e16', '#000', 0.0, scale=14)
        for x in (W * 0.18, W * 0.55, W * 0.88):
            place(lambda xx: column(xx, 0.3, 0.9, 3.2, 0.22, rock) + [helix(xx, 0.3, 1.0, 3.6, 0.27, coil)], x, 0.4)
        for i in range(7):
            place(lambda x: crystal(x, -0.2, 0.95, 0.9, glow, rng, 5), rng.uniform(0, W), 0.4)
        for i in range(10):
            place(lambda x, h=rng.uniform(0.5, 1.4): stalactite(x, 0, H + 0.2, h, rock), rng.uniform(0, W), 0.3)


def helix(x, y, z0, z1, r, mat, turns=3.5):
    """A coiled serpent body round a pillar: a tube along a helix, thinning to the tail."""
    curve = bpy.data.curves.new('hx', 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('POLY')
    N = 80
    sp.points.add(N - 1)
    for i in range(N):
        t = i / (N - 1)
        a = t * turns * math.pi * 2
        sp.points[i].co = (x + math.cos(a) * r, y + math.sin(a) * r, z0 + (z1 - z0) * t, 1)
        sp.points[i].radius = 1.0 - 0.6 * t
    curve.bevel_depth = 0.07
    curve.bevel_resolution = 4
    ob = bpy.data.objects.new('hx', curve)
    link(ob)
    ob.data.materials.append(mat)
    return ob


def build_maya(layer):
    rng = R('maya', layer)
    n = PNoise(61 + ['far', 'far2', 'mid'].index(layer))
    lights('#fde68a', 2.2, '#f0abfc', 6.0, '#6b1d75', 0.6)
    glow = mat_glow('cr', '#f0abfc', 9)
    if layer == 'far':
        relief('far', mat_rock('r', '#5a2470', '#3a1450', '#b46ad0', 0.5, 0.2), n, 0, 0, 2.2, 0.7, cells=4, ridged=False)
        # floating inverted islands with crystals hanging
        rock = mat_rock('fl', '#5a2470', '#3a1450', '#b46ad0', 0.45)
        for x, z, s in ((W * 0.18, 4.0, 0.7), (W * 0.5, 4.5, 0.45), (W * 0.82, 3.7, 0.6)):
            place(
                lambda xx, z=z, s=s: [
                    blob((xx, 0, z), s, rock, int(z * 100), squash=(1.3, 0.8, 0.45), rough=0.5),
                    prim('cone', (xx, 0, z - s * 0.6), (1, 0.7, 1), (math.radians(180), 0, 0), mat=rock, radius1=s * 0.8, radius2=0.02, depth=s * 1.3, vertices=7),
                ]
                + crystal(xx, -0.3, z + 0.3 * s, s * 0.7, glow, rng, 4),
                x,
                s * 1.4,
            )
    elif layer == 'far2':
        body = mat_flat('pb', '#4a1d5e', '#b46ad0', 0.3)
        dome = mat_flat('pd', '#7c3aed', '#b46ad0', 0.25, rough=0.3, metal=0.4)
        win = mat_glow('w', '#fde68a', 25)
        for i, x in enumerate((W * 0.1, W * 0.3, W * 0.42, W * 0.7, W * 0.9)):
            h = (1.8, 2.6, 1.6, 2.9, 1.9)[i]
            place(lambda xx, h=h: dome_tower(xx, 0, 0, h, 0.32, body, dome, win, rng), x, 0.4)
    else:
        marble = mat_rock('mb', '#3b1a4a', '#24102e', '#000', 0.0, scale=6, rough=0.4)
        mirror = mat_flat('mr', '#c084fc', rough=0.15, emit=('#f0abfc', 0.35))
        gold = mat_flat('gd', '#fbbf24', rough=0.3, metal=1.0)
        ground_strip('g', marble, n, -0.2, 1.0)
        for x in (W * 0.08, W * 0.36, W * 0.64, W * 0.92):
            place(lambda xx: column(xx, 0.3, 0.9, 2.6, 0.16, marble, gold), x, 0.3)
        for x in (W * 0.22, W * 0.78):
            place(lambda xx: [prim('cube', (xx, 0.2, 2.0), (0.45, 0.04, 0.75), mat=mirror), prim('torus', (xx, 0.15, 2.0), (0.62, 1, 1.0), (math.radians(90), 0, 0), mat=gold, major_radius=0.75, minor_radius=0.06)], x, 0.6)
        for i in range(9):
            place(lambda x: crystal(x, -0.1, rng.uniform(2.6, 3.8), 0.4, glow, rng, 3), rng.uniform(0, W), 0.3)


def build_bhasm(layer):
    rng = R('bhasm', layer)
    n = PNoise(71 + ['far', 'far2', 'mid'].index(layer))
    lights('#f5d0a9', 2.0, '#ff8a4a', 5.0, '#3a3633', 0.6)
    if layer == 'far':
        relief('volc', mat_rock('r', '#4a4440', '#2e2a27', '#9a8f86', 0.5, 0.2), n, 0, 0, 2.6, 1.0, cells=3)
        # a volcano cone with a glowing crater
        v = mat_rock('vc', '#3d3935', '#24211f', '#9a8f86', 0.4, glow=('#ff6a1a', 6.0, 0.015))
        place(lambda x: [prim('cone', (x, -0.5, 2.4), (1, 0.6, 1), mat=v, radius1=2.6, radius2=0.45, depth=3.4, vertices=48), prim('plane', (x, -2, 4.3), (1.6, 1, 0.9), (math.radians(90), 0, 0), mat=mat_fade('cg', '#ff7a2a', 3, 0.55), size=1)], W * 0.62, 2.7)
    elif layer == 'far2':
        relief('ash', mat_rock('r', '#3a3633', '#24211f', '#9a8f86', 0.3, 0.3), n, 0, 0, 1.8, 0.6, cells=6)
        trunk = mat_flat('t', '#1c1a18', '#9a8f86', 0.3)
        for i in range(14):
            place(tree, rng.uniform(0, W), 0.3, 0, 1.5, rng.uniform(0.7, 1.1), (trunk, None, None), rng, burnt=True)
    else:
        stone = mat_rock('ru', '#4a4540', '#2a2724', '#000', 0.0, scale=5, glow=('#ff6a1a', 5.0, 0.02))
        ground_strip('g', stone, n, -0.2, 1.0)
        for x in (W * 0.15, W * 0.6):
            place(lambda xx: arch(xx, 0.3, 0.9, 1.3, 1.5, stone), x, 1.0)
        for x in (W * 0.35, W * 0.42, W * 0.85):
            place(lambda xx: column(xx, 0.4, 0.9, 2.2, 0.17, stone, broken=rng.uniform(0.2, 0.6)), x, 0.3)
        trunk = mat_rock('bk', '#1c1a18', '#0e0d0c', '#000', 0.0, scale=12, glow=('#ff6a00', 6.0, 0.02))
        for i in range(5):
            place(tree, rng.uniform(0, W), 0.9, 0.0, 0.9, rng.uniform(1.6, 2.4), (trunk, None, mat_glow('e', '#ffb347', 25)), rng, burnt=True)


def build_ranbhoomi(layer):
    rng = R('ranbhoomi', layer)
    n = PNoise(81 + ['far', 'far2', 'mid'].index(layer))
    lights('#fff1c2', 2.8, '#ffb070', 5.0, '#b4532a', 0.6, key_rot=(65, 0, 40))
    if layer == 'far':
        relief('mesa', mat_rock('r', '#9a6a48', '#7a4e32', '#e8b88a', 0.55, 0.2), n, 0, 0, 2.3, 0.9, cells=4, flat_top=2.9)
    elif layer == 'far2':
        relief('dunes', mat_rock('r', '#7a4e32', '#5a3a24', '#e8b88a', 0.3, 0.3), n, 0, 0, 1.4, 0.4, cells=5, ridged=False)
        pole = mat_flat('p', '#3a2416', '#e8b88a', 0.3)
        cloths = [mat_flat(f'c{i}', c, '#e8b88a', 0.3) for i, c in enumerate(('#b91c1c', '#d97706', '#1e3a8a'))]
        for i in range(12):
            place(banner, rng.uniform(0, W), 0.5, -0.5, 1.3, rng.uniform(0.9, 1.3), pole, cloths[i % 3], rng)
    else:
        earth = mat_rock('e', '#5a3a24', '#3a2416', '#000', 0.0, scale=4)
        ground_strip('g', earth, n, -0.2, 1.0)
        wood = mat_rock('wd', '#6b4423', '#3e2714', '#000', 0.0, scale=14)
        bronze = mat_flat('bz', '#b08d57', rough=0.35, metal=1.0)
        for x in (W * 0.2, W * 0.66):
            place(lambda xx: wheel(xx, 0.2, 1.2, 0.55, wood, tilt=0.3), x, 0.6)
        pole = mat_flat('p2', '#2a1a10')
        cloths = [mat_flat(f'd{i}', c) for i, c in enumerate(('#b91c1c', '#d97706', '#f8fafc'))]
        for i in range(5):
            place(banner, rng.uniform(0, W), 0.5, 0.0, 0.9, rng.uniform(2.0, 2.6), pole, cloths[i % 3], rng)
        for i in range(14):  # spears stuck in the ground
            a = rng.uniform(-0.5, 0.5)
            place(lambda x, a=a: [prim('cylinder', (x, 0.0, 1.3), (1, 1, 1), (0, a, 0), mat=pole, radius=0.015, depth=1.2, vertices=6), prim('cone', (x + math.sin(a) * 0.62, 0.0, 1.3 + math.cos(a) * 0.62), (1, 1, 1), (0, a, 0), mat=bronze, radius1=0.04, radius2=0, depth=0.15, vertices=6)], rng.uniform(0, W), 0.5)


def build_chakra(layer):
    rng = R('chakra', layer)
    n = PNoise(91 + ['far', 'far2', 'mid'].index(layer))
    lights('#fde047', 2.4, '#ffb347', 5.5, '#5a3a0c', 0.6)
    gold = mat_flat('gold', '#e0a530', rough=0.3, metal=1.0)
    if layer == 'far':
        relief('far', mat_rock('r', '#5a4214', '#3a2a0c', '#c8962a', 0.5, 0.2), n, 0, 0, 2.0, 0.6, cells=4)
        stone = mat_flat('s', '#6b4e1a', '#c8962a', 0.5)
        place(lambda x: ring_wall(x, 2, 1.6, 3.0, 0.9, stone, gold, 12), W * 0.5, 3.4)
    elif layer == 'far2':
        stone = mat_rock('s', '#4a3410', '#2a1e08', '#c8962a', 0.25, 0.25, scale=8)
        place(lambda x: ring_wall(x, 1, 0.6, 2.2, 1.1, stone, gold, 10), W * 0.25, 2.6)
        place(lambda x: ring_wall(x, 1, 0.6, 1.8, 0.9, stone, gold, 8), W * 0.78, 2.2)
        relief('base', stone, n, 0.5, 0, 0.8, 0.3, cells=6, ridged=False)
    else:
        stone = mat_rock('st', '#3a2a0c', '#22180a', '#000', 0.0, scale=6)
        ground_strip('g', stone, n, -0.2, 1.0)
        # great bronze wheels (the fortress's turning gates) and spiked walls
        for x in (W * 0.25, W * 0.75):
            place(lambda xx: wheel(xx, 0.4, 1.9, 1.0, gold, 0.0) + [prim('cylinder', (xx, 0.42, 1.9), (1, 1, 1), (math.radians(90), 0, 0), mat=mat_glow('sun', '#fde047', 12), radius=0.12, depth=0.1)], x, 1.1)
        for x in (W * 0.5, W * 0.02):
            place(lambda xx: [prim('cube', (xx, 0.5, 1.4), (0.5, 0.2, 1.0), mat=stone)] + [prim('cone', (xx - 0.4 + i * 0.2, 0.5, 2.55), (1, 1, 1), mat=gold, radius1=0.06, radius2=0, depth=0.3, vertices=6) for i in range(5)], x, 0.6)


def build_dwand(layer):
    rng = R('dwand', layer)
    n = PNoise(101 + ['far', 'far2', 'mid'].index(layer))
    lights('#bfdbfe', 1.8, '#93c5fd', 5.0, '#1e3a8a', 0.6)
    if layer == 'far':
        relief('far', mat_rock('r', '#2a4a8a', '#1a3266', '#6a8fd0', 0.5, 0.2, snow='#dbeafe'), n, 0, 0, 2.6, 1.1, cells=4)
    elif layer == 'far2':
        stone = mat_rock('s', '#24407a', '#132550', '#6a8fd0', 0.3, 0.25, scale=6)
        # an amphitheatre: stepped tiers in a wide arc
        for i in range(5):
            place(lambda x, i=i: [prim('cylinder', (x, 2 + i * 0.3, 0.3 + i * 0.32), (1, 0.25, 1), mat=stone, radius=3.2 - i * 0.15, depth=0.3, vertices=64)], W * 0.5, 3.4)
        relief('hills', stone, n, 1.0, 0, 1.0, 0.3, cells=5, ridged=False)
        torch = mat_glow('tc', '#ffb347', 30)
        for i in range(10):
            place(lambda x: [prim('uv_sphere', (x, 0.5, 1.9), (1, 1, 1.4), mat=torch, radius=0.05)], W * (0.08 + i * 0.093), 0.1)
    else:
        stone = mat_rock('st', '#1e3360', '#0e1a36', '#000', 0.0, scale=6)
        ground_strip('g', stone, n, -0.2, 1.0)
        bronze = mat_flat('bz', '#b08d57', rough=0.35, metal=1.0)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg', '#ff8a2a', 4, 0.6)
        for x in (W * 0.12, W * 0.38, W * 0.62, W * 0.88):
            place(lambda xx: column(xx, 0.3, 0.9, 2.3, 0.2, stone, bronze), x, 0.3)
        for x in (W * 0.25, W * 0.75):
            place(lambda xx: [prim('cylinder', (xx, 0.2, 1.35), (1, 1, 1), mat=bronze, radius=0.22, depth=0.12, vertices=16), prim('cylinder', (xx, 0.2, 1.1), (1, 1, 1), mat=stone, radius=0.06, depth=0.5)] + flame(xx, 0.1, 1.38, 0.5, fire_core, fire_glow), x, 0.4)


def build_mahayuddh(layer):
    rng = R('mahayuddh', layer)
    n = PNoise(111 + ['far', 'far2', 'mid'].index(layer))
    lights('#fde047', 2.4, '#f472b6', 6.0, '#4a0a2a', 0.6)
    gold = mat_flat('gold', '#f5b82e', rough=0.25, metal=1.0)
    win = mat_glow('w', '#ffd27a', 28)
    if layer == 'far':
        relief('far', mat_rock('r', '#4a1030', '#2e0a1e', '#a0306a', 0.5, 0.2), n, 0, 0, 2.2, 1.0, cells=4)
        body = mat_flat('b', '#5a1a38', '#a0306a', 0.45)
        for i in range(7):
            place(lambda x, h=rng.uniform(1.5, 2.8): dome_tower(x, 1, 0.8, h, 0.22, body, mat_flat('d', '#c88a2a', '#a0306a', 0.4, metal=1.0, rough=0.3), win, rng), W * (0.07 + i * 0.14), 0.3)
    elif layer == 'far2':
        body = mat_rock('b2', '#6b2a12', '#4a1a0c', '#c0506a', 0.22, 0.2, scale=8)
        for i, x in enumerate((W * 0.1, W * 0.28, W * 0.5, W * 0.7, W * 0.9)):
            h = (2.4, 3.4, 2.0, 3.8, 2.6)[i]
            place(lambda xx, h=h: dome_tower(xx, 0.5, 0, h, 0.38, body, gold, win, rng), x, 0.5)
        fire_glow = mat_fade('fg', '#ff6a1a', 5, 0.6)
        for i in range(5):  # rooftop fires
            place(lambda x: [prim('plane', (x, -0.3, rng.uniform(2.0, 3.0)), (0.9, 1, 0.9), (math.radians(90), 0, 0), mat=fire_glow, size=1)], rng.uniform(0, W), 0.5)
    else:
        stone = mat_rock('st', '#4a1a0c', '#2a0e06', '#000', 0.0, scale=5, glow=('#ff6a1a', 4.0, 0.015))
        ground_strip('g', stone, n, -0.2, 1.0)
        for x in (W * 0.2, W * 0.7):
            place(lambda xx: arch(xx, 0.4, 0.9, 1.5, 1.7, stone) + [prim('uv_sphere', (xx, 0.35, 2.75), (1, 1, 1.3), mat=gold, radius=0.25)], x, 1.0)
        for x in (W * 0.42, W * 0.95):
            place(lambda xx: column(xx, 0.3, 0.9, 2.6, 0.18, gold), x, 0.3)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg2', '#ff5a1a', 4, 0.6)
        for i in range(4):
            place(flame, rng.uniform(0, W), 0.6, -0.3, 0.95, rng.uniform(0.4, 0.7), fire_core, fire_glow)



# ---------------------------------------------------------------- the classic missions' worlds
#
# The six missions before the saga (jungle rescue, the pharaoh's tomb, the frozen north, the marble peak, the demon
# gate, the alien hive) get the same treatment: their own ranges, skylines and near worlds, in their own palettes
# (client world-art.ts ZONES), so no stage of the game is left with the old flat silhouettes.


def build_jungle(layer):
    rng = R('jungle', layer)
    n = PNoise(121 + ['far', 'far2', 'mid'].index(layer))
    lights('#fff1c2', 2.6, '#ffd89a', 5.0, '#2f6db5', 0.7, key_rot=(60, 0, 40))
    if layer == 'far':
        relief('far', mat_rock('r', '#4d6f86', '#36566b', '#9cc6e0', 0.55, 0.2, mist_top=3.0), n, 0, 0, 2.6, 1.2, cells=4, depth=1.8)
    elif layer == 'far2':
        relief('hills', mat_rock('r', '#2f5a3a', '#1f4029', '#8ab7a0', 0.3, 0.3, mist_top=2.0), n, 0, 0, 1.8, 0.7, cells=6, ridged=False)
        trunk = mat_flat('t', '#2a2216', '#8ab7a0', 0.3)
        leaf = [mat_flat('l', '#2f6b34', '#8ab7a0', 0.3), mat_flat('l2', '#3d7a2a', '#8ab7a0', 0.3)]
        # a canopy line: a trunk and two crowns each (whole trees here would not fit in memory)
        for i in range(18):
            x = i / 18 * W + rng.uniform(-0.1, 0.1)
            h = rng.uniform(0.8, 1.2)
            place(lambda xx, h=h, i=i: [prim('cylinder', (xx, 0.4, 1.6 + h * 0.35), (1, 1, 1), mat=trunk, radius=0.035, depth=h * 0.7, vertices=6), blob((xx, 0.35, 1.6 + h * 0.8), h * 0.32, leaf[i % 2], 500 + i), blob((xx + 0.15, 0.3, 1.6 + h * 0.65), h * 0.24, leaf[(i + 1) % 2], 700 + i)], x, 0.4)
    else:
        ground_strip('g', mat_rock('g', '#3a2a16', '#22180c', '#000', 0.0, scale=5), n, -0.2, 1.05)
        trunk = mat_rock('bark', '#4a3420', '#2a1c10', '#000', 0.0, scale=10, bump=0.8)
        leaf = [mat_rock('lf', '#3f8a2a', '#24561a', '#000', 0.0, scale=5, rough=0.7), mat_rock('lf2', '#5a9a2a', '#2f6018', '#000', 0.0, scale=5, rough=0.7), mat_rock('lf3', '#2f7a3a', '#1a4a24', '#000', 0.0, scale=5, rough=0.7)]
        for i in range(7):
            x = (i + 0.5) / 7 * W + rng.uniform(-0.3, 0.3)
            back = i % 2
            place(tree, x, 1.0, 0.6 if back else -0.1, 0.9, rng.uniform(1.4, 1.8) if back else rng.uniform(1.9, 2.5), (trunk, leaf, None), rng)


def build_river(layer):
    rng = R('river', layer)
    n = PNoise(131 + ['far', 'far2', 'mid'].index(layer))
    lights('#ffe2b0', 2.6, '#f4c48f', 5.0, '#2a5f9e', 0.7, key_rot=(55, 0, 40))
    if layer == 'far':
        relief('far', mat_rock('r', '#46677f', '#2f4d63', '#9cc0dc', 0.55, 0.2, snow='#eef2ff', mist_top=3.0), n, 0, 0, 2.9, 1.6, cells=3, depth=2.0)
    elif layer == 'far2':
        relief('cliffs', mat_rock('r', '#3a5a3a', '#243c26', '#9cc0dc', 0.3, 0.3), n, 0, 0, 1.6, 0.9, cells=5, flat_top=2.2)
        fall = mat_glow('wf', '#dbeafe', 3)
        for x in (W * 0.3, W * 0.74):
            place(lambda xx: [prim('cube', (xx, -1.4, 1.0), (0.12, 0.01, 0.95), mat=fall), prim('plane', (xx, -1.5, 0.15), (0.9, 1, 0.25), (math.radians(90), 0, 0), mat=mat_fade('mist', '#e0f2fe', 1.5, 0.6), size=1)], x, 0.4)
    else:
        rock = mat_rock('rk', '#4a4a3a', '#2a2a20', '#000', 0.0, scale=4)
        ground_strip('bank', rock, n, -0.2, 0.95)
        trunk = mat_rock('bark', '#4a3420', '#2a1c10', '#000', 0.0, scale=10, bump=0.8)
        leaf = [mat_rock('lf', '#4a8a2a', '#2a561a', '#000', 0.0, scale=5, rough=0.7), mat_rock('lf2', '#6a9a2a', '#3a6018', '#000', 0.0, scale=5, rough=0.7)]
        for i in range(5):
            place(tree, (i + 0.5) / 5 * W + rng.uniform(-0.3, 0.3), 1.0, 0.6, 0.9, rng.uniform(1.4, 2.0), (trunk, leaf, None), rng)
        reed = mat_flat('rd', '#6a7a2a')
        for i in range(40):
            place(lambda x, h=rng.uniform(0.2, 0.45): [prim('cone', (x, -0.3, 0.95 + h / 2), (1, 1, 1), mat=reed, radius1=0.012, radius2=0, depth=h, vertices=4)], rng.uniform(0, W), 0.05)


def build_towers(layer):
    rng = R('towers', layer)
    n = PNoise(141 + ['far', 'far2', 'mid'].index(layer))
    lights('#ffb37a', 2.0, '#e0784c', 6.0, '#231b3b', 0.6, key_rot=(30, 0, 40))
    win = mat_glow('w', '#ffcf7a', 26)
    if layer == 'far':
        relief('far', mat_rock('r', '#4a3e5e', '#2f2740', '#b08aa0', 0.55, 0.2, mist_top=3.0), n, 0, 0, 2.2, 1.0, cells=4)
    elif layer == 'far2':
        concrete = mat_flat('c', '#2f2740', '#b08aa0', 0.3)
        for i in range(8):
            x = (i + 0.5) / 8 * W + rng.uniform(-0.2, 0.2)
            h = rng.uniform(1.6, 3.0)
            place(lambda xx, h=h: [prim('cube', (xx, 0.5, h / 2), (0.3, 0.3, h / 2), mat=concrete)] + [prim('cube', (xx + dx, 0.19, 0.3 + k * 0.32), (0.04, 0.01, 0.06), mat=win) for k in range(int(h / 0.32)) for dx in (-0.15, 0, 0.15) if rng.random() < 0.4], x, 0.4)
    else:
        ground_strip('g', mat_rock('g', '#2a2230', '#16121c', '#000', 0.0, scale=5), n, -0.2, 1.0)
        steel = mat_flat('st', '#3a3440', rough=0.5, metal=0.6)
        for x in (W * 0.2, W * 0.7):
            def watchtower(xx):
                obs = [prim('cube', (xx + dx, 0.4, 1.6), (0.03, 0.03, 0.75), (0, dx * 0.2, 0), mat=steel) for dx in (-0.35, 0.35)]
                obs.append(prim('cube', (xx, 0.4, 2.45), (0.5, 0.4, 0.06), mat=steel))
                obs.append(prim('cube', (xx, 0.4, 2.8), (0.4, 0.35, 0.3), mat=steel))
                obs.append(prim('cone', (xx, 0.4, 3.3), (1, 0.8, 1), mat=steel, radius1=0.6, radius2=0, depth=0.4, vertices=4))
                obs.append(prim('cube', (xx, 0.04, 2.8), (0.25, 0.01, 0.08), mat=win))
                return obs
            place(watchtower, x, 0.6)
        wire = mat_flat('wr', '#1a161e')
        for i in range(12):
            place(lambda x: [prim('cylinder', (x, -0.1, 1.3), (1, 1, 1), mat=wire, radius=0.02, depth=0.7, vertices=6)], i / 12 * W, 0.05)


def build_fortress(layer):
    rng = R('fortress', layer)
    n = PNoise(151 + ['far', 'far2', 'mid'].index(layer))
    lights('#ff7a59', 1.6, '#ff5a3a', 7.0, '#150e1c', 0.5, key_rot=(25, 0, 40))
    if layer == 'far':
        relief('far', mat_rock('r', '#3a2630', '#24161e', '#a3392a', 0.55, 0.2, mist_top=3.0), n, 0, 0, 2.4, 1.2, cells=4)
    elif layer == 'far2':
        stone = mat_rock('s', '#2a1a20', '#160c12', '#a3392a', 0.25, 0.3, scale=8)
        relief('cliff', stone, n, 0.5, 0, 1.2, 0.4, cells=5, ridged=False)
        for x in (W * 0.3, W * 0.75):
            def keep(xx):
                obs = [prim('cube', (xx, 0.4, 2.0), (0.9, 0.4, 0.8), mat=stone)]
                for dx in (-0.9, 0.9):
                    obs.append(prim('cylinder', (xx + dx, 0.4, 2.3), (1, 1, 1), mat=stone, radius=0.25, depth=2.2, vertices=16))
                    obs.append(prim('cone', (xx + dx, 0.4, 3.6), (1, 1, 1), mat=stone, radius1=0.32, radius2=0, depth=0.5, vertices=16))
                for k in range(6):
                    obs.append(prim('cube', (xx - 0.75 + k * 0.3, 0.4, 2.9), (0.08, 0.4, 0.1), mat=stone))
                obs.append(prim('cube', (xx, 0.0, 2.1), (0.08, 0.01, 0.14), mat=mat_glow('w', '#ff8a4a', 25)))
                return obs
            place(keep, x, 1.3)
    else:
        stone = mat_rock('st', '#3a2228', '#1e1014', '#000', 0.0, scale=4, bump=0.7)
        ground_strip('g', stone, n, -0.2, 1.0)
        for i in range(3):
            place(lambda x: [prim('cube', (x, 0.5, 1.5), (0.8, 0.25, 0.6), mat=stone)] + [prim('cube', (x - 0.65 + k * 0.26, 0.5, 2.18), (0.07, 0.25, 0.08), mat=stone) for k in range(6)], (i + 0.3) / 3 * W, 0.9)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg', '#ff5a1a', 4, 0.6)
        for i in range(4):
            place(lambda x: [prim('cylinder', (x, 0.0, 1.3), (1, 1, 1), mat=stone, radius=0.06, depth=0.7)] + flame(x, -0.1, 1.65, 0.35, fire_core, fire_glow), rng.uniform(0, W), 0.3)


def tube(points, radii, mat, name='tube'):
    """A tube along a polyline, its radius following `radii` (a trunk, a frond)."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for i, (p, r) in enumerate(zip(points, radii)):
        sp.points[i].co = (p[0], p[1], p[2], 1)
        sp.points[i].radius = r
    curve.bevel_depth = 1.0
    curve.bevel_resolution = 2
    ob = bpy.data.objects.new(name, curve)
    link(ob)
    ob.data.materials.append(mat)
    return ob


def palm(x, y, z, h, bend, trunk, frond, rng):
    """A date palm: a curving ringed trunk and a crown of long drooping fronds."""
    N = 12
    pts = [(x + bend * (i / N) ** 2 * h * 0.5, y, z + i / N * h) for i in range(N + 1)]
    obs = [tube(pts, [0.07 - 0.03 * i / N for i in range(N + 1)], trunk, 'palm')]
    tx, ty, tz = pts[-1]
    fr = frond if isinstance(frond, (list, tuple)) else [frond]
    for k in range(11):
        a = k / 11 * math.pi * 2 + rng.uniform(-0.2, 0.2)
        L = h * rng.uniform(0.38, 0.5)
        up = rng.uniform(0.1, 0.45)
        fp = []
        for j in range(9):
            t = j / 8
            fp.append((tx + math.cos(a) * L * t, ty + math.sin(a) * L * t * 0.4, tz + L * (up * t - 0.9 * t * t)))
        obs.append(tube(fp, [0.045 * math.sin(max(0.15, t) * math.pi) for t in (j / 8 for j in range(9))], fr[k % len(fr)], 'frond'))
    return obs


def build_desert(layer):
    rng = R('desert', layer)
    n = PNoise(161 + ['far', 'far2', 'mid'].index(layer))
    lights('#fff1c2', 3.0, '#ffd08a', 5.0, '#3a6fb0', 0.7, key_rot=(65, 0, 40))
    if layer == 'far':
        relief('mesa', mat_rock('r', '#b08a64', '#8a6a4a', '#e8d0b0', 0.55, 0.2), n, 0, 0, 2.2, 0.8, cells=3, flat_top=2.6)
        sand = mat_flat('pyr', '#c49a6a', '#e8d0b0', 0.45)
        for x, s in ((W * 0.3, 1.7), (W * 0.42, 1.1), (W * 0.8, 1.4)):
            place(lambda xx, s=s: [prim('cone', (xx, 1, s * 0.5), (1, 1, 1), (0, 0, math.radians(45)), mat=sand, radius1=s, radius2=0, depth=s, vertices=4)], x, s)
    elif layer == 'far2':
        relief('dunes', mat_rock('r', '#c49a6a', '#9a7448', '#e8d0b0', 0.3, 0.3, scale=2), n, 0, 0, 1.3, 0.45, cells=4, ridged=False)
    else:
        ground_strip('g', mat_rock('g', '#c8a06a', '#a07a48', '#000', 0.0, scale=3), n, -0.2, 1.0)
        trunk = mat_rock('pt', '#6b4a2a', '#3a2814', '#000', 0.0, scale=14)
        frond = [mat_rock('fr', '#4a7a2a', '#2a4a14', '#000', 0.0, scale=8, rough=0.6), mat_rock('fr2', '#5a8a2a', '#3a5a18', '#000', 0.0, scale=8, rough=0.6)]
        for i in range(7):
            place(lambda x, h=rng.uniform(1.5, 2.3), b=rng.uniform(-0.35, 0.35): palm(x, rng.uniform(-0.2, 0.5), 0.95, h, b, trunk, frond, rng), (i + 0.4) / 7 * W + rng.uniform(-0.25, 0.25), 0.9)
        rock = mat_rock('rk', '#a07a48', '#6a4e2a', '#000', 0.0, scale=4)
        for i in range(6):
            place(lambda x: [blob((x, 0.1, 0.95), rng.uniform(0.18, 0.35), rock, rng.randint(0, 9999), squash=(1.4, 0.8, 0.6), rough=0.15)], rng.uniform(0, W), 0.5)
        stone = mat_rock('obl', '#b08a5a', '#8a6a40', '#000', 0.0, scale=6)
        for x in (W * 0.35, W * 0.9):
            place(lambda xx: [prim('cube', (xx, 0.4, 2.0), (0.14, 0.14, 1.1), mat=stone), prim('cone', (xx, 0.4, 3.2), (1, 1, 1), (0, 0, math.radians(45)), mat=stone, radius1=0.2, radius2=0, depth=0.25, vertices=4)], x, 0.3)


def build_tomb(layer):
    rng = R('tomb', layer)
    n = PNoise(171 + ['far', 'far2', 'mid'].index(layer))
    lights('#ffd27a', 2.2, '#f4c27a', 6.0, '#2a1640', 0.6, key_rot=(35, 0, 40))
    if layer == 'far':
        relief('far', mat_rock('r', '#8a5a3c', '#5a3a26', '#e0a070', 0.55, 0.2), n, 0, 0, 2.0, 0.8, cells=3, flat_top=2.4)
        sand = mat_flat('pyr', '#a0704a', '#e0a070', 0.45)
        place(lambda xx: [prim('cone', (xx, 1, 1.4), (1, 1, 1), (0, 0, math.radians(45)), mat=sand, radius1=2.6, radius2=0, depth=2.8, vertices=4)], W * 0.55, 2.6)
    elif layer == 'far2':
        stone = mat_rock('s', '#6a4228', '#3a2214', '#e0a070', 0.25, 0.3, scale=8)
        relief('cliff', stone, n, 0.5, 0, 1.4, 0.4, cells=5, flat_top=1.7)
        for x in (W * 0.2, W * 0.7):
            place(lambda xx: [prim('cube', (xx, 0.1, 1.2), (1.0, 0.1, 0.9), mat=stone)] + [column(xx - 0.75 + k * 0.5, -0.05, 0.3, 1.5, 0.1, stone)[0] for k in range(4)] + [prim('cube', (xx, 0.0, 0.9), (0.18, 0.01, 0.4), mat=mat_glow('d', '#ffb347', 6))], x, 1.1)
    else:
        stone = mat_rock('st', '#7a5030', '#4a3018', '#000', 0.0, scale=5)
        ground_strip('g', stone, n, -0.2, 1.0)
        gold = mat_flat('gd', '#e0b040', rough=0.3, metal=1.0)
        for x in (W * 0.15, W * 0.5, W * 0.85):
            place(lambda xx: column(xx, 0.3, 0.9, 2.4, 0.2, stone, gold), x, 0.3)
        # a great seated guardian statue
        place(lambda xx: [prim('cube', (xx, 0.6, 1.4), (0.5, 0.4, 0.5), mat=stone), prim('cube', (xx, 0.6, 2.3), (0.35, 0.3, 0.45), mat=stone), prim('cube', (xx, 0.6, 3.0), (0.22, 0.22, 0.25), mat=stone), prim('cone', (xx, 0.6, 3.05), (1, 0.6, 1), mat=gold, radius1=0.34, radius2=0.18, depth=0.55, vertices=4)], W * 0.32, 0.6)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg', '#ff8a2a', 4, 0.6)
        for x in (W * 0.68, W * 0.98):
            place(lambda xx: [prim('cylinder', (xx, 0.0, 1.3), (1, 1, 1), mat=gold, radius=0.12, depth=0.1)] + flame(xx, -0.1, 1.35, 0.4, fire_core, fire_glow), x, 0.3)


def build_snow(layer):
    rng = R('snow', layer)
    n = PNoise(181 + ['far', 'far2', 'mid'].index(layer))
    lights('#fffaf0', 2.4, '#e0f2fe', 5.0, '#5d7fa8', 0.8, key_rot=(50, 0, 30))
    snow = '#f8fafc'
    if layer == 'far':
        relief('peaks', mat_rock('r', '#9aaec4', '#6a7e98', '#dbe7f3', 0.45, 0.3, snow=snow, mist_top=3.0), n, 1.0, 0, 3.0, 2.0, cells=3, depth=2.2)
    elif layer == 'far2':
        relief('ridge', mat_rock('r', '#6a7e98', '#4a5c74', '#dbe7f3', 0.25, 0.35, snow=snow), n, 0, 0, 1.8, 1.0, cells=5, depth=1.6)
        trunk = mat_flat('t', '#2a3040', '#dbe7f3', 0.3)
        leaf = mat_rock('pn', '#2a4a4a', '#1a3030', '#dbe7f3', 0.3, snow=snow, scale=6)
        for i in range(24):
            place(tree, rng.uniform(0, W), 0.3, 0.2, 1.2 + rng.uniform(-0.1, 0.2), rng.uniform(0.6, 1.0), (trunk, leaf, None), rng, kind='conifer')
    else:
        ground_strip('g', mat_rock('g', '#e8eef5', '#b8c6d6', '#000', 0.0, scale=4, snow=snow), n, -0.2, 1.0)
        trunk = mat_flat('t2', '#2a2420')
        leaf = [mat_rock('pn', '#1f3a3a', '#132626', '#000', 0.0, snow=snow, scale=6), mat_rock('pn2', '#25403a', '#142a26', '#000', 0.0, snow=snow, scale=6)]
        for i in range(14):
            x = (i + 0.5) / 14 * W + rng.uniform(-0.2, 0.2)
            place(tree, x, 0.5, -0.3 + (i % 2) * 0.4, 0.95 + (i % 2) * 0.1, rng.uniform(1.0, 1.9), (trunk, leaf, None), rng, kind='conifer')
        ice = mat_flat('ice', '#bae6fd', rough=0.1, emit=('#bae6fd', 0.25))
        for i in range(4):
            place(lambda x: crystal(x, 0.2, 0.9, 0.8, ice, rng, 4), rng.uniform(0, W), 0.3)


def build_frosthall(layer):
    rng = R('frosthall', layer)
    n = PNoise(191 + ['far', 'far2', 'mid'].index(layer))
    lights('#e0f2fe', 1.4, '#67e8f9', 5.0, '#0c2638', 0.6)
    ice = mat_flat('ice', '#7dd3fc', rough=0.1, emit=('#67e8f9', 0.5))
    if layer == 'far':
        relief('cave', mat_rock('r', '#29445a', '#1a3040', '#5fa0bf', 0.5, 0.2), n, 0, 0, 2.4, 1.0, cells=5)
        for i in range(12):
            place(lambda x, h=rng.uniform(0.8, 2.0): stalactite(x, 1, H + 0.1, h, ice), rng.uniform(0, W), 0.3)
    elif layer == 'far2':
        stone = mat_rock('s', '#1d3a4c', '#0e2230', '#5fa0bf', 0.3, 0.25, scale=6)
        for x in (W * 0.1, W * 0.37, W * 0.63, W * 0.9):
            place(lambda xx: column(xx, 0.5, 0, 3.6, 0.32, stone), x, 0.5)
        relief('floor', stone, n, 1.0, 0, 0.6, 0.2, cells=5, ridged=False)
    else:
        stone = mat_rock('st', '#1d3a4c', '#0a1a24', '#000', 0.0, scale=5)
        ground_strip('g', stone, n, -0.2, 1.0)
        for i in range(7):
            place(lambda x: crystal(x, -0.1, 0.95, rng.uniform(0.8, 1.6), ice, rng, 5), rng.uniform(0, W), 0.4)
        # a frozen throne of a frost giant
        place(lambda xx: [prim('cube', (xx, 0.5, 1.5), (0.6, 0.4, 0.6), mat=stone), prim('cube', (xx, 0.7, 2.7), (0.6, 0.15, 1.0), mat=stone)] + crystal(xx, 0.6, 3.6, 0.8, ice, rng, 5), W * 0.55, 0.8)
        for i in range(10):
            place(lambda x, h=rng.uniform(0.5, 1.3): stalactite(x, 0, H + 0.2, h, ice), rng.uniform(0, W), 0.3)


def build_marble(layer):
    rng = R('marble', layer)
    n = PNoise(201 + ['far', 'far2', 'mid'].index(layer))
    lights('#e0e7ff', 1.8, '#a5b4fc', 6.0, '#0b1020', 0.6, key_rot=(40, 0, 30))
    if layer == 'far':
        relief('far', mat_rock('r', '#3b4260', '#262b44', '#8890b8', 0.5, 0.2), n, 0, 0, 2.8, 1.4, cells=3, depth=2.0)
    elif layer == 'far2':
        marble = mat_rock('m', '#5a6080', '#3a4060', '#8890b8', 0.3, 0.25, scale=6, rough=0.4)
        relief('peak', marble, n, 0.5, 0, 1.8, 0.8, cells=4)
        place(lambda xx: [prim('cube', (xx, 0, 2.5), (0.9, 0.5, 0.06), mat=marble), prim('cone', (xx, 0, 2.85), (1, 0.55, 0.3), (0, 0, math.radians(45)), mat=marble, radius1=1.3, radius2=0, depth=0.7, vertices=4)] + [column(xx - 0.75 + k * 0.3, 0.0, 1.8, 0.7, 0.07, marble)[0] for k in range(6)], W * 0.5, 1.0)
    else:
        marble = mat_rock('mb', '#d8d4ca', '#a8a195', '#000', 0.0, scale=6, rough=0.4)
        ground_strip('g', mat_rock('g', '#4a4e60', '#2a2e3c', '#000', 0.0, scale=5), n, -0.2, 1.0)
        for x in (W * 0.1, W * 0.3, W * 0.62, W * 0.82):
            place(lambda xx: column(xx, 0.3, 0.9, rng.uniform(1.6, 2.6), 0.17, marble, broken=rng.uniform(0, 0.5) if rng.random() < 0.5 else 0.0), x, 0.3)
        place(lambda xx: arch(xx, 0.4, 0.9, 1.3, 1.6, marble), W * 0.46, 1.0)
        bolt = mat_glow('b', '#c7d2fe', 12)
        place(lambda xx: [prim('cube', (xx, -1.0, 4.0), (0.02, 0.01, 0.6), (0, 0.3, 0), mat=bolt), prim('cube', (xx + 0.18, -1.0, 3.3), (0.02, 0.01, 0.4), (0, -0.4, 0), mat=bolt)], W * 0.75, 0.3)


def build_temple(layer):
    rng = R('temple', layer)
    n = PNoise(211 + ['far', 'far2', 'mid'].index(layer))
    lights('#fde68a', 2.2, '#f59e0b', 6.0, '#4c1d95', 0.6, key_rot=(35, 0, 40))
    gold = mat_flat('gd', '#f5b82e', rough=0.3, metal=1.0)
    win = mat_glow('w', '#ffd27a', 25)
    if layer == 'far':
        relief('far', mat_rock('r', '#4b3b7a', '#2f2450', '#a08ad0', 0.5, 0.2), n, 0, 0, 2.4, 1.0, cells=4)
    elif layer == 'far2':
        stone = mat_flat('s', '#3a2a5a', '#a08ad0', 0.3)
        for i, x in enumerate((W * 0.2, W * 0.5, W * 0.8)):
            place(lambda xx, i=i: pagoda(xx, 0.5, 0.2, (0.9, 1.3, 0.8)[i], 5, stone, gold, win), x, 0.8)
        relief('base', mat_rock('b', '#2a1e48', '#1a1230', '#a08ad0', 0.25, 0.3), n, 1.0, 0, 0.7, 0.2, cells=5, ridged=False)
    else:
        stone = mat_rock('st', '#4a3a6a', '#2a1e40', '#000', 0.0, scale=5)
        ground_strip('g', stone, n, -0.2, 1.0)
        for x in (W * 0.15, W * 0.45, W * 0.75):
            place(lambda xx: column(xx, 0.3, 0.9, 2.4, 0.18, stone, gold), x, 0.3)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg', '#ff8a2a', 4, 0.6)
        for x in (W * 0.3, W * 0.6, W * 0.9):
            place(lambda xx: [prim('cylinder', (xx, 0.0, 1.2), (1, 1, 1), mat=gold, radius=0.14, depth=0.08), prim('cylinder', (xx, 0.0, 1.05), (1, 1, 1), mat=stone, radius=0.05, depth=0.3)] + flame(xx, -0.1, 1.25, 0.35, fire_core, fire_glow), x, 0.3)


def build_hellgate(layer):
    rng = R('hellgate', layer)
    n = PNoise(221 + ['far', 'far2', 'mid'].index(layer))
    lights('#ff7a59', 1.2, '#ef4444', 10.0, '#2a0606', 0.4)
    if layer == 'far':
        relief('far', mat_rock('r', '#2a0808', '#160404', '#7f1d1d', 0.5, 0.3, glow=('#ff3a1a', 5.0, 0.01)), n, 0, 0, 2.8, 1.6, cells=4, depth=2.0)
    elif layer == 'far2':
        rock = mat_rock('r', '#1e0606', '#0e0303', '#7f1d1d', 0.25, 0.3, glow=('#ff3a1a', 8.0, 0.015))
        relief('spires', rock, n, 0, 0, 2.0, 1.6, cells=9, depth=1.2, gully=2.0)
        # the gate: two horned towers and a burning arch
        place(lambda xx: [prim('cone', (xx + dx, 0, 1.6), (1, 0.6, 1), mat=rock, radius1=0.45, radius2=0.04, depth=3.2, vertices=8) for dx in (-1.1, 1.1)] + arch(xx, 0, 0, 2.2, 2.2, rock) + [prim('plane', (xx, -0.3, 1.2), (1.8, 1, 2.2), (math.radians(90), 0, 0), mat=mat_fade('pg', '#ff3a1a', 4, 0.7), size=1)], W * 0.5, 1.6)
    else:
        rock = mat_rock('st', '#2a0a08', '#120404', '#000', 0.0, scale=4, glow=('#ff3a1a', 8.0, 0.015))
        ground_strip('g', rock, n, -0.2, 1.05)
        bone = mat_flat('bn', '#d6cbb0')
        for i in range(5):
            place(lambda x, h=rng.uniform(0.8, 1.6): [prim('cone', (x, 0.3, 0.9 + h / 2), (1, 1, 1), (0, rng.uniform(-0.3, 0.3), 0), mat=bone, radius1=0.08, radius2=0.01, depth=h, vertices=8)], rng.uniform(0, W), 0.3)
        for i in range(5):
            x = (i + 0.5) / 5 * W
            place(lambda xx, i=i: [relief_pillar(xx, 0.6, rng.uniform(2.2, 3.4), rng.uniform(0.4, 0.7), rock, n, 50 + i)], x, 0.6)
        fire_core = mat_fade('fc', '#ffd27a', 6, 0.95)
        fire_glow = mat_fade('fg', '#ff3a1a', 4, 0.7)
        for i in range(4):
            place(flame, rng.uniform(0, W), 0.6, -0.3, 0.95, rng.uniform(0.4, 0.8), fire_core, fire_glow)


def build_space(layer):
    rng = R('space', layer)
    n = PNoise(231 + ['far', 'far2', 'mid'].index(layer))
    lights('#9be7ff', 1.8, '#a78bfa', 7.0, '#0b0f2a', 0.5, key_rot=(30, 0, 40))
    if layer == 'far':
        relief('far', mat_rock('r', '#2a2352', '#16123a', '#6a5ab0', 0.45, 0.2), n, 0, 0, 1.8, 1.0, cells=3, depth=1.6)
        planet = mat_flat('pl', '#4a3a8a', rough=0.6, emit=('#6a5ab0', 0.2))
        place(lambda xx: [prim('uv_sphere', (xx, 6, 4.4), (1, 1, 1), mat=planet, radius=1.1, segments=48, ring_count=24), prim('torus', (xx, 6, 4.4), (1, 1, 0.25), (0, 0.3, 0), mat=mat_flat('rg', '#9a8ad0', emit=('#9a8ad0', 0.3)), major_radius=1.8, minor_radius=0.06, major_segments=64)], W * 0.7, 2.0)
    elif layer == 'far2':
        rock = mat_rock('r', '#1e1a40', '#0e0c24', '#6a5ab0', 0.25, 0.3, scale=3)
        relief('crater', rock, n, 0, 0, 1.4, 0.8, cells=6)
        glow = mat_glow('g', '#9be7ff', 18)
        metal = mat_flat('m', '#3a3a5a', '#6a5ab0', 0.3, metal=0.7, rough=0.4)
        for x in (W * 0.25, W * 0.72):
            place(lambda xx: [prim('uv_sphere', (xx, 0.5, 1.4), (1, 1, 0.55), mat=metal, radius=0.6), prim('cylinder', (xx, 0.5, 1.95), (1, 1, 1), mat=metal, radius=0.03, depth=0.8), prim('uv_sphere', (xx, 0.5, 2.4), (1, 1, 1), mat=glow, radius=0.05)], x, 0.7)
    else:
        rock = mat_rock('st', '#2a2a40', '#14141f', '#000', 0.0, scale=4)
        ground_strip('g', rock, n, -0.2, 1.0)
        crys = mat_flat('cr', '#22d3ee', rough=0.1, emit=('#22d3ee', 0.6))
        for i in range(8):
            place(lambda x: crystal(x, -0.1, 0.95, rng.uniform(0.6, 1.3), crys, rng, 4), rng.uniform(0, W), 0.4)
        metal = mat_flat('m', '#4a4a6a', rough=0.35, metal=0.8)
        place(lambda xx: [prim('cube', (xx, 0.5, 1.6), (0.6, 0.3, 0.7), (0, 0.25, 0), mat=metal), prim('cube', (xx + 0.5, 0.5, 2.3), (0.5, 0.25, 0.1), (0, -0.4, 0), mat=metal)], W * 0.45, 0.9)


def build_hive(layer):
    rng = R('hive', layer)
    n = PNoise(241 + ['far', 'far2', 'mid'].index(layer))
    lights('#86efac', 1.2, '#4ade80', 6.0, '#062016', 0.5)
    goo = mat_glow('goo', '#86efac', 8)
    if layer == 'far':
        relief('far', mat_rock('r', '#0f2a1c', '#061810', '#2f8a5a', 0.5, 0.25), n, 0, 0, 2.6, 1.2, cells=5, depth=1.8)
        for i in range(12):
            place(lambda x, h=rng.uniform(0.8, 2.0): stalactite(x, 1, H + 0.1, h, mat_rock('rt', '#0a2216', '#041008', '#2f8a5a', 0.4)), rng.uniform(0, W), 0.3)
    elif layer == 'far2':
        shell = mat_rock('s', '#123a24', '#06180e', '#2f8a5a', 0.25, 0.3, scale=6, rough=0.4)
        for i in range(7):
            x = (i + 0.5) / 7 * W
            place(lambda xx: [prim('cylinder', (xx, 0.5, 1.4), (1, 1, 1), mat=shell, radius=0.18, depth=2.8, vertices=6)] + [prim('cube', (xx, 0.31, 0.5 + k * 0.5), (0.05, 0.01, 0.08), mat=goo) for k in range(5)], x, 0.3)
        relief('ribs', shell, n, 1.0, 0, 0.9, 0.3, cells=7, ridged=True)
    else:
        shell = mat_rock('st', '#16402a', '#061810', '#000', 0.0, scale=6, rough=0.4)
        ground_strip('g', shell, n, -0.2, 1.0)
        # ribbed arches of the hive ship and egg pods
        for x in (W * 0.2, W * 0.7):
            place(lambda xx: arch(xx, 0.5, 0.9, 1.6, 1.7, shell), x, 1.1)
        pod = mat_flat('pod', '#2f6a3a', rough=0.3, emit=('#86efac', 0.25))
        for i in range(8):
            place(lambda x: [blob((x, -0.1, 1.1), rng.uniform(0.14, 0.22), pod, rng.randint(0, 9999), squash=(0.8, 0.8, 1.2), rough=0.08)], rng.uniform(0, W), 0.3)


ZONES = {
    'vana': build_vana,
    'inferno': build_inferno,
    'sagar': build_sagar,
    'shikhar': build_shikhar,
    'naglok': build_naglok,
    'maya': build_maya,
    'bhasm': build_bhasm,
    'ranbhoomi': build_ranbhoomi,
    'chakra': build_chakra,
    'dwand': build_dwand,
    'mahayuddh': build_mahayuddh,
    'jungle': build_jungle,
    'river': build_river,
    'towers': build_towers,
    'fortress': build_fortress,
    'desert': build_desert,
    'tomb': build_tomb,
    'snow': build_snow,
    'frosthall': build_frosthall,
    'marble': build_marble,
    'temple': build_temple,
    'hellgate': build_hellgate,
    'space': build_space,
    'hive': build_hive,
}
LAYERS = ('far', 'far2', 'mid')


def render_clouds(out, samples):
    """Six soft cumulus clouds (white, lit from above, shaded underneath) in a 3x2 grid of 220x70 world-pixel cells
    rendered at 2x; the game tints them to each stage's light."""
    sc = reset()
    sc.cycles.samples = samples
    cw, ch = 2.2, 0.7
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = cw * 3
    ob = bpy.data.objects.new('cam', cam)
    link(ob)
    ob.location = (cw * 1.5, -40, ch)
    ob.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = ob
    sc.render.resolution_x, sc.render.resolution_y = 1320, 280
    world('#9aa6c8', 0.9)
    sun('key', '#ffffff', 3.2, (20, 0, 20))
    sun('rim', '#ffffff', 3.0, (-70, 0, 0), angle=4)
    white = mat_flat('cloud', '#ffffff', rough=1.0)
    rng = random.Random(7)
    for i in range(6):
        cx = cw * (i % 3 + 0.5)
        cz = ch * (1.5 - i // 3)
        for j in range(9):
            u = j / 8
            rr = 0.13 + 0.12 * math.sin(u * math.pi) + rng.uniform(-0.03, 0.03)
            blob((cx - 0.75 + u * 1.5 + rng.uniform(-0.05, 0.05), 0, cz - 0.2 + rr * 0.6 + rng.uniform(0, 0.05)), rr, white, rng.randint(0, 9999), squash=(1.2, 0.9, 0.9), rough=0.25)
        # flatten the base: a holdout box under each cloud
        hold = prim('cube', (cx, 0, cz - 0.35 - 0.02), (1.2, 1.0, 0.12))
        hold.is_holdout = True
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('wrote', out, flush=True)


def render(zone, layer, out, samples):
    sc = reset()
    sc.cycles.samples = samples
    camera(RES[layer])
    ZONES[zone](layer)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('wrote', out, flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument('--zone')
    ap.add_argument('--layer', choices=LAYERS)
    ap.add_argument('--out')
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--samples', type=int, default=24)
    ap.add_argument('--clouds', action='store_true')
    a = ap.parse_args(argv)
    if a.clouds:
        render_clouds(os.path.join(OUT, '..', 'clouds.png'), a.samples)
        return
    if a.all:
        for z in ZONES:
            for L in LAYERS:
                p = os.path.join(OUT, f'{z}-{L}.png')
                if not os.path.exists(p):
                    render(z, L, p, a.samples)
        return
    zones = [a.zone] if a.zone else list(ZONES)
    layers = [a.layer] if a.layer else list(LAYERS)
    for z in zones:
        for L in layers:
            render(z, L, a.out if a.out and len(zones) * len(layers) == 1 else os.path.join(OUT, f'{z}-{L}.png'), a.samples)


if __name__ == '__main__':
    main()
