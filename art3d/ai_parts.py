"""
Packs a hand- or AI-drawn parts sheet (one character, parts spaced apart on a plain background) into the game's rig
format: client/src/assets/rigs/<key>.webp + .json (same as pack_parts.py makes for the Blender-built heroes).

The sheet is cut automatically (the plain background is removed, each separate piece becomes a part); what each piece
is, where it hangs from and where the weapon's grip and muzzle are comes from a small spec file (json) next to the sheet,
because that is a human decision:

    python3 art3d/ai_parts.py --sheet art3d/ai/hero1.png --spec art3d/ai/hero1.json --key h0 [--preview out.png]

Spec (all coordinates in the sheet's own pixels):
  "scale":   HD px per sheet px (how big the hero is in the game; the Blender heroes are ~0.1)
  "ss":      atlas pixels per HD px (sharpness vs. atlas size, 5 is plenty)
  "bg":      [r,g,b] of the plain background (default: the sheet's top-left corner)
  "tol":     how far a pixel may be from `bg` and still count as background (default 28)
  "pieces":  { name: [x0, y0, x1, y1] }   a box that contains one piece (and only that piece's pixels are kept)
  "parts":   { part: {"piece": name | [names], "pivot": [x, y], "joint": joint, "shade": 1.0, "rot": 0, "zoom": 1.0,
                      "at": {name: [dx, dy]}  # offsets of the extra pieces when a part is made of several} }
  "joints":  { joint: [x, y] }  rest pose in sheet pixels of the *assembled* figure (feet at y = ground)
  "ground":  y of the feet in that assembled figure
  "gun":     { "grip": [x, y], "foregrip": [x, y], "muzzle": [x, y] }   in the gun part's own piece coordinates
"""

import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi


def cut(sheet, bg, tol, all_near=False):
    """RGBA of the whole sheet with the plain background made transparent (flood from the border, so greys inside a
    part stay)."""
    a = np.array(sheet.convert('RGB')).astype(int)
    d = np.abs(a - np.array(bg)).sum(2)
    near = d <= tol
    lab, _ = ndi.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(border))
    if all_near:
        # a flat sheet made by ai_weapons.py: the grey seen through a trigger guard is background too
        bgm |= d <= 6
    # one pixel in from the edge so no grey fringe is left
    fg = ndi.binary_erosion(~bgm, iterations=1)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    rgba = sheet.convert('RGBA')
    rgba.putalpha(alpha)
    return rgba, fg


def load_spec(path):
    """A spec may `extends` another (a recolour or a swapped weapon of the same hero): the child's keys win, dicts merge."""
    d = json.load(open(path))
    base = d.pop('extends', None)
    if not base:
        return d
    b = load_spec(os.path.join(os.path.dirname(path), base))

    def merge(x, y):
        out = dict(x)
        for kk, v in y.items():
            out[kk] = merge(out[kk], v) if isinstance(v, dict) and isinstance(out.get(kk), dict) else v
        return out

    return merge(b, d)


def recolor(im, rules):
    """Hue-shifts pieces of an image: each rule {hue: [lo, hi] (degrees), sat: min saturation 0..1, shift: degrees,
    sat_mul, val_mul}. Black ink, cream and grey have little saturation and stay as they are."""
    if not rules:
        return im
    a = im.convert('RGBA')
    hsv = np.array(a.convert('RGB').convert('HSV')).astype(float)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2]
    for r in rules:
        lo, hi = r['hue']
        hh = (h - lo) % 360
        m = (hh <= (hi - lo) % 360) & (s >= r.get('sat', 0.45)) & (v > r.get('val_min', 40))
        h = np.where(m, (h + r.get('shift', 0)) % 360, h)
        s = np.where(m, np.clip(s * r.get('sat_mul', 1), 0, 1), s)
        v = np.where(m, np.clip(v * r.get('val_mul', 1), 0, 255), v)
    hsv[..., 0] = h * 255 / 360
    hsv[..., 1] = s * 255
    hsv[..., 2] = v
    rgb = Image.fromarray(hsv.clip(0, 255).astype(np.uint8), 'HSV').convert('RGB')
    out = rgb.convert('RGBA')
    out.putalpha(a.getchannel('A'))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', required=True)
    ap.add_argument('--spec', required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--dst', default='client/src/assets/rigs')
    a = ap.parse_args()
    spec = load_spec(a.spec)
    sheet_paths = {'main': a.sheet, **spec.get('sheets', {})}
    cache = {}

    def sheet_of(name):
        if name not in cache:
            sh = Image.open(sheet_paths[name]).convert('RGB')
            bg = spec.get('bg') or list(sh.getpixel((4, 4)))
            rgba, fg = cut(sh, bg, spec.get('tol', 28), all_near=name == 'wpn')
            lab, _ = ndi.label(ndi.binary_closing(fg, iterations=2))
            cache[name] = (rgba, fg, lab)
        return cache[name]

    def box_of(name):
        d = spec['pieces'][name]
        return d['box'] if isinstance(d, dict) else d

    def piece(name):
        d = spec['pieces'][name]
        rgba, fg, lab = sheet_of(d.get('sheet', 'main') if isinstance(d, dict) else 'main')
        x0, y0, x1, y1 = box_of(name)
        sub = lab[y0:y1, x0:x1]
        ids = np.bincount(sub.ravel())
        ids[0] = 0
        main_id = int(ids.argmax())
        mask = ndi.binary_dilation(lab == main_id, iterations=2) & fg
        im = rgba.copy()
        al = np.array(im.getchannel('A')).astype(float) * mask
        im.putalpha(Image.fromarray(al.astype(np.uint8)))
        return im.crop((x0, y0, x1, y1))

    k = spec['scale']
    ss = spec.get('ss', 5)
    s = ss * k  # atlas px per sheet px
    ground = spec['ground']
    root = spec['joints']['root']

    def hd(p):
        return [round((p[0] - root[0]) * k, 2), round((p[1] - ground) * k, 2)]

    joints = {j: hd(p) for j, p in spec['joints'].items()}
    parts_img = {}
    parts = {}
    for name, p in spec['parts'].items():
        names = p['piece'] if isinstance(p['piece'], list) else [p['piece']]
        # the part's canvas in sheet px: the first piece sets the origin, the others are put at offsets
        ims = []
        for i, n in enumerate(names):
            im = piece(n)
            off = (0, 0) if i == 0 else p['at'][n]
            ims.append((im, off))
        x0 = min(o[0] for _, o in ims)
        y0 = min(o[1] for _, o in ims)
        x1 = max(o[0] + im.width for im, o in ims)
        y1 = max(o[1] + im.height for im, o in ims)
        canvas = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
        for im, o in ims:
            canvas.alpha_composite(im, (o[0] - x0, o[1] - y0))
        bx = box_of(names[0])
        px, py = p['pivot'][0] - bx[0] - x0, p['pivot'][1] - bx[1] - y0
        if p.get('flipx'):
            canvas = canvas.transpose(Image.FLIP_LEFT_RIGHT)
            px = canvas.width - px
        rot = p.get('rot', 0)
        if rot:
            # rotate about the pivot: make room, rotate the canvas, find the pivot again
            R = math.hypot(canvas.width, canvas.height)
            big = Image.new('RGBA', (int(R * 2), int(R * 2)), (0, 0, 0, 0))
            cx, cy = int(R), int(R)
            big.alpha_composite(canvas, (cx - int(px), cy - int(py)))
            big = big.rotate(rot, resample=Image.BICUBIC, center=(cx, cy))
            bb = big.getchannel('A').getbbox()
            canvas = big.crop(bb)
            px, py = cx - bb[0], cy - bb[1]
            ang = math.radians(rot)
            # a point (x, y) of the unrotated part (relative to the pivot) goes to this (PIL rotates counter-clockwise)
            p['_rot'] = ang
        if not p.get('keep_colour'):
            canvas = recolor(canvas, spec.get('recolor'))
        sh = p.get('shade', 1.0)
        if sh != 1.0:
            arr = np.array(canvas).astype(float)
            arr[..., :3] *= sh
            canvas = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
        z = p.get('zoom', 1.0)
        W, H = max(1, round(canvas.width * s * z)), max(1, round(canvas.height * s * z))
        canvas = canvas.resize((W, H), Image.LANCZOS)
        parts_img[name] = canvas
        parts[name] = {'joint': p['joint'], 'px': round(px * s * z, 2), 'py': round(py * s * z, 2)}
        if name == 'gun':
            # grip, foregrip and muzzle: given relative to the gun's pivot in the unrotated piece, carried through `rot`
            g = spec['gun']

            def rel(pt):
                dx, dy = pt[0] - p['pivot'][0], pt[1] - p['pivot'][1]
                if p.get('flipx'):
                    dx = -dx
                # PIL rotate(+rot) is counter-clockwise on screen: (dx, dy) -> (dx cos + dy sin, -dx sin + dy cos)
                r = math.radians(rot)
                return [dx * math.cos(r) + dy * math.sin(r), -dx * math.sin(r) + dy * math.cos(r)]

            aim = joints['aim']
            for nm in ('grip', 'foregrip', 'muzzle'):
                r = rel(g[nm])
                joints[nm] = [round(aim[0] + r[0] * k * z, 2), round(aim[1] + r[1] * k * z, 2)]
    # hands: where each hand sits on its forearm
    for side in ('n', 'f'):
        h = spec['hands'][side]
        joints[f'hand_{side}'] = hd(h)

    # shelf packing
    order = sorted(parts_img.items(), key=lambda kv: -kv[1].height)
    Wd = 1024
    x = y = shelf = 0
    placed = {}
    for name, im in order:
        if x + im.width > Wd:
            x, y, shelf = 0, y + shelf, 0
        placed[name] = (x, y)
        x += im.width + 2
        shelf = max(shelf, im.height + 2)
    Hd = y + shelf
    atlas = Image.new('RGBA', (Wd, Hd), (0, 0, 0, 0))
    meta_parts = {}
    for name, (x, y) in placed.items():
        im = parts_img[name]
        atlas.alpha_composite(im, (x, y))
        meta_parts[name] = {'x': x, 'y': y, 'w': im.width, 'h': im.height, **parts[name]}
    os.makedirs(a.dst, exist_ok=True)
    atlas.save(os.path.join(a.dst, a.key + '.webp'), 'WEBP', quality=92, method=6)
    json.dump(
        {'ss': ss, 'joints': joints, 'parts': meta_parts, 'recoil': spec.get('recoil', 3)},
        open(os.path.join(a.dst, a.key + '.json'), 'w'),
        separators=(',', ':'),
    )
    print(a.key, Wd, 'x', Hd, os.path.getsize(os.path.join(a.dst, a.key + '.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
