import { Painter, ramp, shade, type Pt } from './hero-hd';
import type { Prop } from './world-art';

/**
 * Scenery in high definition for the ancient worlds: the pharaoh's tomb (obelisk, urn, idol) and the frozen
 * north (pine, runestone, shields, bones). Painted as shaded shapes with the heroes' Painter (light from the
 * front and above, three tones per material, a dark outline), each canvas exactly twice the classic sprite's
 * size (world-art.ts propSprite) with its base on the bottom row, so it stands in the same spot.
 *
 * Variants: the classic sprites have one look each; these vary a little with `v % 3` (paint colours, runes,
 * how much snow lies on a pine), so a row of the same prop does not look stamped. Callers cache per variant.
 */

const STONE_OUTLINE = '#17131b';

function P2(w: number, h: number): Painter {
  return new Painter(w * 2, h * 2, STONE_OUTLINE);
}

function quad(P: Painter, a: Pt, b: Pt, c: Pt, d: Pt, col: string): void {
  P.poly([a, b, c, d], col);
}

// ------------------------------------------------------------------ the pharaoh's tomb

/** A tall sandstone obelisk with a gilded tip and carved glyph columns (36 x 140). */
function obelisk(v: number): HTMLCanvasElement {
  const P = P2(18, 70);
  const s = ramp('#d9b77a', -0.3, 0.18);
  // shaft: narrowing upward, lit face on the right, shaded face on the left
  quad(P, { x: 6, y: 140 }, { x: 31, y: 140 }, { x: 27, y: 16 }, { x: 10, y: 16 }, s.dark);
  quad(P, { x: 13, y: 140 }, { x: 31, y: 140 }, { x: 27, y: 16 }, { x: 15, y: 16 }, s.base);
  quad(P, { x: 25, y: 140 }, { x: 31, y: 140 }, { x: 27, y: 16 }, { x: 25, y: 16 }, s.light);
  // gilded pyramidion
  const gold = ramp('#e9b949', -0.35, 0.3);
  P.poly(
    [
      { x: 10, y: 17 },
      { x: 18.5, y: 1 },
      { x: 27, y: 17 },
    ],
    gold.dark,
  );
  P.poly(
    [
      { x: 15, y: 17 },
      { x: 18.5, y: 1 },
      { x: 27, y: 17 },
    ],
    gold.base,
  );
  P.poly(
    [
      { x: 20, y: 6 },
      { x: 18.5, y: 1 },
      { x: 24, y: 12 },
    ],
    gold.light,
  );
  // glyph column: cut (dark) with a lit lower lip, one stack per variant
  const cut = shade('#d9b77a', -0.55);
  const lip = shade('#d9b77a', 0.3);
  const glyphs = [
    (x: number, y: number) => {
      P.ell(x, y, 2.6, 2.6, cut); // sun disc
      P.rect(x - 3, y + 3, 6, 1, lip);
    },
    (x: number, y: number) => {
      P.rect(x - 0.5, y - 3, 1.6, 7, cut); // ankh
      P.rect(x - 3, y - 1, 7, 1.6, cut);
      P.ell(x + 0.3, y - 4.5, 2, 2, cut);
      P.rect(x - 3, y + 4, 7, 1, lip);
    },
    (x: number, y: number) => {
      P.ell(x, y, 3.4, 1.8, cut); // eye
      P.rect(x - 0.5, y - 0.8, 1.6, 1.6, lip);
      P.rect(x + 1, y + 1.5, 1.4, 3, cut);
    },
    (x: number, y: number) => {
      P.poly(
        [
          { x: x - 3, y: y + 3 },
          { x: x, y: y - 3 },
          { x: x + 3, y: y + 3 },
        ],
        cut,
      ); // pyramid
      P.rect(x - 3, y + 4, 7, 1, lip);
    },
  ];
  for (let i = 0; i < 9; i++)
    (glyphs[(i + v) % glyphs.length] as (x: number, y: number) => void)(19.5, 28 + i * 12);
  // plinth
  quad(P, { x: 2, y: 140 }, { x: 35, y: 140 }, { x: 35, y: 132 }, { x: 2, y: 132 }, s.dark);
  P.rect(2, 132, 33, 2, s.light);
  return P.finish();
}

/** A painted clay urn with a lapis band and two handles (32 x 44). */
function urn(v: number): HTMLCanvasElement {
  const P = P2(16, 22);
  const clay = ramp(['#b8703a', '#a8602f', '#c27c44'][v % 3] as string, -0.32, 0.22);
  const band = ['#1d4ed8', '#0f766e', '#b91c1c'][v % 3] as string;
  // handles behind the body
  P.limb({ x: 7, y: 12 }, { x: 4, y: 20 }, 3, 3, clay, false);
  P.limb({ x: 25, y: 12 }, { x: 28, y: 20 }, 3, 3, clay, false);
  // body: round belly, neck, rim, foot
  P.ell(16, 23, 12, 12, clay.dark);
  P.ell(17.5, 22, 10, 11, clay.base);
  P.ell(21, 17, 4, 5, clay.light);
  quad(P, { x: 10, y: 6 }, { x: 22, y: 6 }, { x: 21, y: 12 }, { x: 11, y: 12 }, clay.dark);
  quad(P, { x: 14, y: 6 }, { x: 22, y: 6 }, { x: 21, y: 12 }, { x: 15, y: 12 }, clay.base);
  P.ell(16, 4, 9, 3, clay.dark);
  P.ell(16.5, 3.2, 8, 2.2, clay.base);
  P.ell(16, 3.6, 5.5, 1.2, shade('#b8703a', -0.65)); // the mouth
  quad(P, { x: 10, y: 44 }, { x: 22, y: 44 }, { x: 21, y: 34 }, { x: 11, y: 34 }, clay.dark);
  quad(P, { x: 14, y: 44 }, { x: 22, y: 44 }, { x: 21, y: 34 }, { x: 15, y: 34 }, clay.base);
  // painted band with a zigzag
  P.rect(4.5, 19, 23, 5, band);
  P.rect(4.5, 19, 23, 1, shade(band, 0.35));
  for (let x = 6; x < 27; x += 4)
    P.poly(
      [
        { x, y: 23 },
        { x: x + 2, y: 20.5 },
        { x: x + 4, y: 23 },
      ],
      '#f3e3b5',
    );
  return P.finish();
}

/** A pharaoh's statue head half buried in sand: striped nemes, gold uraeus (88 x 80). */
function idol(v: number): HTMLCanvasElement {
  const P = P2(44, 40);
  const blue = ramp('#1d4ed8', -0.4, 0.2);
  const gold = ramp('#e9b949', -0.35, 0.3);
  const stone = ramp('#d0a76a', -0.3, 0.2);
  // the nemes headcloth: a wide trapezoid with lappets
  quad(P, { x: 10, y: 80 }, { x: 78, y: 80 }, { x: 70, y: 16 }, { x: 18, y: 16 }, blue.dark);
  quad(P, { x: 16, y: 80 }, { x: 78, y: 80 }, { x: 70, y: 16 }, { x: 24, y: 16 }, blue.base);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x0 = 18 + t * 52;
    const x1 = 10 + t * 68;
    quad(
      P,
      { x: x0, y: 16 },
      { x: x0 + 3, y: 16 },
      { x: x1 + 4, y: 80 },
      { x: x1, y: 80 },
      i % 2 ? gold.base : gold.dark,
    );
  }
  P.ell(44, 17, 27, 9, blue.dark);
  P.ell(45, 15, 25, 8, blue.base);
  P.ell(52, 12, 9, 3, blue.light);
  // the face, a little weathered
  quad(P, { x: 26, y: 80 }, { x: 62, y: 80 }, { x: 62, y: 22 }, { x: 26, y: 22 }, stone.dark);
  quad(P, { x: 32, y: 80 }, { x: 62, y: 80 }, { x: 62, y: 22 }, { x: 33, y: 22 }, stone.base);
  quad(P, { x: 52, y: 70 }, { x: 62, y: 70 }, { x: 62, y: 24 }, { x: 54, y: 24 }, stone.light);
  // brows, kohl-lined eyes, nose, mouth, false beard
  P.rect(32, 34, 10, 2, stone.dark);
  P.rect(47, 34, 10, 2, stone.dark);
  P.ell(37, 39, 4.5, 2, '#1a1418');
  P.ell(52, 39, 4.5, 2, '#1a1418');
  P.ell(38, 38.6, 1.4, 1, '#f4f1ea');
  P.ell(53, 38.6, 1.4, 1, '#f4f1ea');
  P.rect(41, 39, 4, 1.4, '#1a1418');
  P.rect(56, 39, 4, 1.4, '#1a1418');
  quad(P, { x: 43, y: 42 }, { x: 47, y: 42 }, { x: 49, y: 55 }, { x: 42, y: 55 }, stone.dark);
  quad(P, { x: 45, y: 42 }, { x: 47, y: 42 }, { x: 49, y: 55 }, { x: 46, y: 55 }, stone.light);
  P.rect(38, 61, 14, 2.4, shade('#d0a76a', -0.45));
  P.rect(39, 63.4, 12, 1.2, stone.light);
  quad(P, { x: 40, y: 68 }, { x: 50, y: 68 }, { x: 49, y: 80 }, { x: 41, y: 80 }, blue.dark);
  for (let y = 70; y < 80; y += 3) P.rect(41, y, 8, 1, gold.base);
  // a crack across the face on some idols
  if (v % 3 === 1)
    P.poly(
      [
        { x: 56, y: 24 },
        { x: 52, y: 36 },
        { x: 57, y: 46 },
        { x: 55, y: 46 },
        { x: 50, y: 36 },
        { x: 54, y: 24 },
      ],
      shade('#d0a76a', -0.55),
    );
  // the uraeus cobra rising from the brow
  P.limb({ x: 45, y: 16 }, { x: 45, y: 4 }, 5, 3.5, gold);
  P.ell(46, 3, 3.6, 3, gold.base);
  P.ell(47, 2.2, 1.2, 1, '#b91c1c');
  // sand drifted against the base
  const sand = ramp('#e3c48a', -0.25, 0.2);
  P.ell(14, 82, 18, 8, sand.dark);
  P.ell(76, 83, 16, 8, sand.dark);
  P.ell(15, 81, 15, 6, sand.base);
  P.ell(75, 82, 13, 6, sand.base);
  return P.finish();
}

// ------------------------------------------------------------------ the frozen north

/** A snowy fir: five drooping tiers, snow on their tops, a bare trunk (92 x 192). */
function pine(v: number): HTMLCanvasElement {
  const P = P2(46, 96);
  const bark = ramp('#4a3424', -0.35, 0.22);
  P.limb({ x: 46, y: 192 }, { x: 46, y: 130 }, 10, 8, bark);
  const green = ramp(v % 2 ? '#1f4d3a' : '#25593f', -0.35, 0.22);
  const snow = ramp('#eef6fb', -0.18, 0.1);
  const snowy = [0.5, 0.75, 1][v % 3] as number;
  for (let i = 0; i < 5; i++) {
    const w = 22 + i * 15; // half-width at the tier's skirt is w/2
    const top = 8 + i * 27;
    const skirt = top + 36;
    const cx = 46;
    // the tier: a drooping skirt with a ragged hem
    const hem: Pt[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      hem.push({ x: cx + w / 2 - t * w, y: skirt + (k % 2 ? 4 : 0) - Math.sin(t * Math.PI) * 3 });
    }
    P.poly([{ x: cx, y: top }, ...hem], green.dark);
    P.poly(
      [
        { x: cx, y: top },
        { x: cx + w / 2, y: skirt },
        { x: cx + w * 0.05, y: skirt - 4 },
      ],
      green.base,
    );
    P.poly(
      [
        { x: cx + 1, y: top + 4 },
        { x: cx + w * 0.36, y: skirt - 6 },
        { x: cx + w * 0.16, y: skirt - 8 },
      ],
      green.light,
    );
    // snow lying on the tier, heavier on the lit side
    const depth = 6 * snowy;
    P.poly(
      [
        { x: cx, y: top - 1 },
        { x: cx + (w / 2) * 0.86, y: skirt - 4 - depth * 0.2 },
        { x: cx + (w / 2) * 0.7, y: skirt - 1 },
        { x: cx + w * 0.05, y: top + 10 + depth },
        { x: cx - (w / 2) * 0.55, y: skirt - 3 },
        { x: cx - (w / 2) * 0.72, y: skirt - 6 - depth * 0.3 },
      ],
      snow.base,
    );
    P.poly(
      [
        { x: cx, y: top - 1 },
        { x: cx + (w / 2) * 0.86, y: skirt - 4 - depth * 0.2 },
        { x: cx + (w / 2) * 0.62, y: skirt - 4 },
        { x: cx + 2, y: top + 6 },
      ],
      snow.light,
    );
    P.poly(
      [
        { x: cx - 2, y: top + 8 },
        { x: cx - (w / 2) * 0.55, y: skirt - 3 },
        { x: cx - (w / 2) * 0.7, y: skirt - 6 - depth * 0.3 },
      ],
      snow.dark,
    );
  }
  // snow round the foot
  P.ell(46, 192, 22, 5, snow.dark);
  P.ell(47, 191, 18, 3.5, snow.base);
  return P.finish();
}

/** A carved runestone with glowing runes and a snow cap (44 x 72). */
function runestone(v: number): HTMLCanvasElement {
  const P = P2(22, 36);
  const rock = ramp('#6b7280', -0.38, 0.22);
  const outline: Pt[] = [
    { x: 6, y: 72 },
    { x: 5, y: 20 },
    { x: 10, y: 4 },
    { x: 24, y: 1 },
    { x: 36, y: 7 },
    { x: 39, y: 24 },
    { x: 38, y: 72 },
  ];
  P.poly(outline, rock.dark);
  P.poly(
    [
      { x: 12, y: 72 },
      { x: 11, y: 22 },
      { x: 14, y: 6 },
      { x: 24, y: 3 },
      { x: 35, y: 8 },
      { x: 38, y: 24 },
      { x: 37, y: 72 },
    ],
    rock.base,
  );
  P.poly(
    [
      { x: 30, y: 70 },
      { x: 31, y: 22 },
      { x: 29, y: 8 },
      { x: 35, y: 9 },
      { x: 37, y: 24 },
      { x: 36, y: 70 },
    ],
    rock.light,
  );
  // lichen
  P.ell(14, 56, 3, 2, '#7f9a5a');
  P.ell(33, 46, 2.4, 1.6, '#8aa565');
  // runes: three glyph sets, cut in and glowing
  const glow = '#38bdf8';
  const core = '#e0f2fe';
  const strokes: [number, number, number, number][][] = [
    [
      [20, 14, 20, 34],
      [20, 16, 27, 21],
      [20, 24, 27, 29],
      [24, 40, 24, 58],
      [24, 44, 30, 40],
    ],
    [
      [18, 14, 18, 32],
      [18, 14, 26, 20],
      [26, 20, 18, 26],
      [22, 38, 22, 58],
      [17, 46, 27, 46],
    ],
    [
      [22, 12, 22, 30],
      [16, 16, 28, 26],
      [28, 16, 16, 26],
      [20, 38, 26, 58],
      [26, 38, 20, 58],
    ],
  ];
  for (const [x0, y0, x1, y1] of strokes[v % 3] as [number, number, number, number][]) {
    P.limb({ x: x0, y: y0 }, { x: x1, y: y1 }, 3.4, 3.4, {
      dark: shade(glow, -0.3),
      base: glow,
      light: core,
    });
  }
  // snow cap
  const snow = ramp('#eef6fb', -0.18, 0.1);
  P.poly(
    [
      { x: 8, y: 9 },
      { x: 12, y: 3 },
      { x: 24, y: 0 },
      { x: 36, y: 6 },
      { x: 38, y: 13 },
      { x: 30, y: 10 },
      { x: 24, y: 13 },
      { x: 16, y: 10 },
      { x: 9, y: 14 },
    ],
    snow.base,
  );
  P.poly(
    [
      { x: 20, y: 1 },
      { x: 24, y: 0 },
      { x: 36, y: 6 },
      { x: 30, y: 6 },
    ],
    snow.light,
  );
  // snow drifted at the foot
  P.ell(22, 72, 18, 4, snow.dark);
  P.ell(23, 71, 14, 2.6, snow.base);
  return P.finish();
}

/** A rack of three painted round shields on a timber rail (92 x 48). */
function shields(v: number): HTMLCanvasElement {
  const P = P2(46, 24);
  const wood = ramp('#5b3a24', -0.35, 0.22);
  // posts and rail
  P.limb({ x: 4, y: 48 }, { x: 4, y: 26 }, 5, 5, wood);
  P.limb({ x: 88, y: 48 }, { x: 88, y: 26 }, 5, 5, wood);
  P.rect(0, 36, 92, 6, wood.dark);
  P.rect(0, 36, 92, 2, wood.light);
  const palettes = [
    ['#b91c1c', '#1d4ed8', '#ca8a04'],
    ['#1d4ed8', '#ca8a04', '#15803d'],
    ['#ca8a04', '#b91c1c', '#e7e5e4'],
  ][v % 3] as string[];
  for (let i = 0; i < 3; i++) {
    const cx = 16 + i * 30;
    const cy = 20;
    const col = ramp(palettes[i] as string, -0.35, 0.25);
    const second = palettes[(i + 1) % 3] as string;
    // iron rim, painted boards, a painted design, the boss in the middle
    P.ell(cx, cy, 14, 18, '#3f3f46');
    P.ell(cx + 0.5, cy - 0.5, 12.6, 16.6, col.dark);
    P.ell(cx + 1.5, cy - 1.5, 11, 14.6, col.base);
    // the design: quartered, a stripe, or a cross, by shield
    if ((i + v) % 3 === 0) {
      P.poly(
        [
          { x: cx, y: cy },
          { x: cx + 12, y: cy - 1 },
          { x: cx + 10, y: cy - 10 },
          { x: cx + 1, y: cy - 16 },
        ],
        second,
      );
      P.poly(
        [
          { x: cx, y: cy },
          { x: cx - 12, y: cy + 1 },
          { x: cx - 10, y: cy + 10 },
          { x: cx - 1, y: cy + 16 },
        ],
        second,
      );
    } else if ((i + v) % 3 === 1) {
      P.rect(cx - 2.5, cy - 16, 5, 32, second);
    } else {
      P.rect(cx - 2, cy - 16, 4, 32, second);
      P.rect(cx - 12, cy - 2, 24, 4, second);
    }
    // board seams and a highlight
    P.rect(cx - 6, cy - 14, 1, 28, shade(palettes[i] as string, -0.45));
    P.rect(cx + 5, cy - 13, 1, 26, shade(palettes[i] as string, -0.45));
    P.ell(cx + 6, cy - 10, 2, 3.4, col.light);
    P.ell(cx, cy, 3.6, 3.6, '#71717a');
    P.ell(cx + 0.8, cy - 0.8, 2.2, 2.2, '#d4d4d8');
  }
  return P.finish();
}

/** Bones in the snow: a long bone and a skull (60 x 24). */
function bones(v: number): HTMLCanvasElement {
  const P = P2(30, 12);
  const bone = ramp('#e7e5e4', -0.28, 0.12);
  const snow = ramp('#eef6fb', -0.18, 0.1);
  P.ell(30, 24, 30, 4, snow.dark);
  // the long bone with knobbed ends
  P.limb({ x: 6, y: 18 }, { x: 52, y: 16 }, 4, 4, bone);
  for (const [x, y] of [
    [5, 16],
    [5, 20],
    [53, 14],
    [53, 18],
  ] as const)
    P.ell(x, y, 3.4, 3, bone.base);
  // the skull, turned a little
  const sx = v % 2 ? 28 : 32;
  P.ell(sx, 11, 9, 8, bone.dark);
  P.ell(sx + 1, 10, 8, 7, bone.base);
  P.ell(sx + 3, 7, 3.5, 2.5, bone.light);
  P.rect(sx - 3, 15, 9, 4, bone.base);
  P.ell(sx - 2, 11, 2.2, 2.4, '#1a1418');
  P.ell(sx + 4, 11, 2.2, 2.4, '#1a1418');
  P.rect(sx + 0.5, 14, 1.6, 2, '#1a1418');
  for (let k = 0; k < 4; k++) P.rect(sx - 2 + k * 2.2, 17, 1, 2, shade('#e7e5e4', -0.5));
  // a rib, on some piles
  if (v % 3 !== 0) P.limb({ x: 42, y: 21 }, { x: 46, y: 9 }, 2.4, 2, bone);
  P.ell(30, 23, 26, 2, snow.base);
  return P.finish();
}

/**
 * HD painters for the ancient prop kinds, by kind. Each takes the prop's variant `v` (only `v % 3` changes
 * the look, so 3 variants per kind are worth caching) and returns a canvas twice the classic sprite's size.
 */
export const ANCIENT_PROPS: Partial<Record<Prop['kind'], (v: number) => HTMLCanvasElement>> = {
  obelisk,
  urn,
  idol,
  pine,
  runestone,
  shields,
  bones,
};
