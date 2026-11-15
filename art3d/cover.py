"""
Store covers: the Blender key art (art3d/keyart.py) with the game's title on top, in the game's own logo style
(Russo One; "STRIKE SQUAD" in a gold gradient, "ASTRA SAGA" in white, both with a dark outline and a drop shadow).
CrazyGames cover rules: the game's title is the only text; no borders, no logos.

    python3 art3d/cover.py --src art3d/out --dst release/covers
"""
import argparse
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'RussoOne.ttf')
COVERS = {
    'landscape': ('cover-landscape-1920x1080.png', (1920, 1080)),
    'portrait': ('cover-portrait-800x1200.png', (800, 1200)),
    'square': ('cover-square-800x800.png', (800, 800)),
}


def gradient(size, top, bottom):
    w, h = size
    g = Image.new('RGBA', size)
    d = ImageDraw.Draw(g)
    for y in range(h):
        k = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * k) for i in range(3)) + (255,))
    return g


def title_line(text, size, fill_top, fill_bottom, stroke):
    font = ImageFont.truetype(FONT, size)
    l, t, r, b = font.getbbox(text, stroke_width=stroke)
    w, h = r - l + stroke * 2, b - t + stroke * 2
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).text((stroke - l, stroke - t), text, font=font, fill=255)
    outline = Image.new('L', (w, h), 0)
    ImageDraw.Draw(outline).text((stroke - l, stroke - t), text, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    img.paste(Image.new('RGBA', (w, h), (26, 10, 18, 255)), (0, 0), outline)
    img.paste(gradient((w, h), fill_top, fill_bottom), (0, 0), mask)
    return img


def compose(art, size, layout):
    W, H = size
    out = art.convert('RGBA').resize(size, Image.LANCZOS)
    # darken the top a little so the title reads against the sky
    shade = gradient((W, H // 2), (10, 4, 16), (10, 4, 16))
    a = Image.linear_gradient('L').resize((W, H // 2)).point(lambda v: int((255 - v) * 0.55))
    out.paste(shade, (0, 0), a)
    big = {'landscape': 170, 'portrait': 104, 'square': 104}[layout]
    l1 = title_line('STRIKE SQUAD', big, (255, 232, 120), (255, 166, 40), max(6, big // 16))
    l2 = title_line('ASTRA SAGA', int(big * 0.52), (255, 255, 255), (220, 228, 255), max(4, big // 24))
    if layout == 'portrait':
        l1a = title_line('STRIKE', int(big * 1.25), (255, 232, 120), (255, 166, 40), 8)
        l1b = title_line('SQUAD', int(big * 1.25), (255, 232, 120), (255, 166, 40), 8)
        lines = [l1a, l1b, l2]
    else:
        lines = [l1, l2]
    y = int(H * (0.05 if layout != 'portrait' else 0.04))
    for im in lines:
        x = (W - im.width) // 2
        shadow = Image.new('RGBA', im.size, (0, 0, 0, 0))
        shadow.paste((0, 0, 0, 150), (0, 0), im.getchannel('A'))
        out.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(8)), (x + 6, y + 10))
        out.alpha_composite(im, (x, y))
        y += im.height - int(im.height * 0.06)
    return out.convert('RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.join(HERE, 'out'))
    ap.add_argument('--dst', default='release/covers')
    a = ap.parse_args()
    os.makedirs(a.dst, exist_ok=True)
    for layout, (name, size) in COVERS.items():
        art = Image.open(os.path.join(a.src, f'keyart-{layout}.png'))
        compose(art, size, layout).save(os.path.join(a.dst, name), optimize=True)
        print('wrote', name)


if __name__ == '__main__':
    main()
