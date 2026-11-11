import { Painter, ramp, shade, type Pt } from './hero-hd';
import { ANCIENT_PROPS } from './prop-hd-ancient';
import { WAR_PROPS } from './prop-hd-war';
import type { Prop } from './world-art';

/**
 * Scenery in high definition: the jungle set (palm, bush, fern, rock, flower, grass tuft), painted as shaded
 * shapes at twice the classic size and turned into pixel art by the heroes' Painter. Each picture is exactly
 * twice the classic sprite's size, so it stands in the same spot. propHD() also serves the other worlds' sets
 * (prop-hd-ancient.ts, prop-hd-war.ts), so every prop kind has a high-definition picture.
 */

const OUTLINE = '#122016';

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A leaf: a pointed blade from `a` along `ang`, `len` long, `w` wide, lit on its upper side. */
function leaf(P: Painter, a: Pt, ang: number, len: number, w: number, base: string): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const at = (u: number, v: number): Pt => ({ x: a.x + u * c - v * s, y: a.y + u * s + v * c });
  const r = ramp(base, -0.3, 0.22);
  P.poly([at(0, 0), at(len * 0.45, -w), at(len, 0), at(len * 0.45, w * 0.7)], r.dark);
  P.poly([at(0, 0), at(len * 0.45, -w), at(len, 0), at(len * 0.5, -w * 0.1)], r.base);
  P.poly([at(len * 0.15, -w * 0.25), at(len * 0.45, -w * 0.8), at(len * 0.75, -w * 0.3)], r.light);
}

/** A palm frond: a drooping arc of leaflets. */
function frond(
  P: Painter,
  o: Pt,
  dir: number,
  lift: number,
  len: number,
  col: string,
  r: () => number,
): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push({ x: o.x + dir * len * t, y: o.y - lift * Math.sin(t * Math.PI * 0.6) + len * 0.55 * t * t });
  }
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as Pt;
    const q = pts[i - 1] as Pt;
    const ang = Math.atan2(p.y - q.y, p.x - q.x);
    const l = 19 - i * 0.9 + r() * 2;
    leaf(P, p, ang + dir * 1.15, l, 2.6, col);
    leaf(P, p, ang - dir * 0.55 + Math.PI * 0.08, l * 0.8, 2.2, shade(col, -0.12));
  }
  for (let i = 1; i < pts.length; i++)
    P.limb(pts[i - 1] as Pt, pts[i] as Pt, 3 - i * 0.2, 2.6 - i * 0.2, ramp('#4f7a2e', -0.3, 0.2), false);
}

function palm(v: number): HTMLCanvasElement {
  const P = new Painter(160, 260, OUTLINE);
  const r = rng(v * 17 + 3);
  // a slender curving trunk with rings
  const trunk: Pt[] = [];
  for (let y = 258; y >= 56; y -= 8) trunk.push({ x: 82 + Math.sin(y / 80) * 8, y });
  for (let i = 1; i < trunk.length; i++) {
    const w = 15 - (i / trunk.length) * 4;
    P.limb(trunk[i - 1] as Pt, trunk[i] as Pt, w, w - 0.4, ramp('#8a6a45', -0.35, 0.22));
    const t = trunk[i] as Pt;
    P.rect(t.x - w / 2 + 1, t.y, w - 2, 2, '#5e472d');
  }
  const top = trunk[trunk.length - 1] as Pt;
  // coconuts
  P.ell(top.x - 5, top.y + 6, 5, 5, '#4a3520');
  P.ell(top.x + 5, top.y + 7, 5, 5, '#5a4128');
  P.ell(top.x - 6, top.y + 4, 2, 2, '#7a5a3a');
  const g = v % 2 ? '#3d9a44' : '#349040';
  frond(P, top, 1, 18, 70, g, r);
  frond(P, top, -1, 18, 70, g, r);
  frond(P, top, 1, 34, 48, shade(g, 0.08), r);
  frond(P, top, -1, 34, 48, shade(g, 0.08), r);
  frond(P, { x: top.x, y: top.y - 2 }, 0.35, 40, 34, shade(g, 0.15), r);
  return P.finish();
}

function bush(v: number): HTMLCanvasElement {
  const P = new Painter(68, 40, OUTLINE);
  const r = rng(v * 29 + 1);
  const g = ramp(v % 2 ? '#2f7d32' : '#3b8c3a', -0.35, 0.28);
  const blobs: [number, number, number][] = [
    [16, 26, 13],
    [34, 18, 16],
    [52, 26, 13],
  ];
  for (const [x, y, rad] of blobs) P.ell(x, y + 2, rad, rad * 0.9, g.dark);
  for (const [x, y, rad] of blobs) P.ell(x + 1, y, rad * 0.86, rad * 0.78, g.base);
  for (const [x, y, rad] of blobs) P.ell(x + 3, y - rad * 0.35, rad * 0.45, rad * 0.32, g.light);
  // leaf texture: little clumps of shade and light
  for (let i = 0; i < 22; i++) {
    const [bx, by, br] = blobs[i % 3] as [number, number, number];
    const a = r() * Math.PI * 2;
    const d = r() * br * 0.8;
    P.ell(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.8, 2.2, 1.6, r() < 0.55 ? g.dark : g.light);
  }
  P.rect(4, 37, 60, 3, shade(g.dark, -0.3));
  // a few berries on some bushes
  if (v % 3 === 0) for (let i = 0; i < 4; i++) P.ell(18 + i * 10, 14 + (i % 2) * 8, 1.8, 1.8, '#e63946');
  return P.finish();
}

function fern(v: number): HTMLCanvasElement {
  const P = new Painter(52, 44, OUTLINE);
  const r = rng(v * 7 + 5);
  const col = v % 2 ? '#3f9b46' : '#4fb04f';
  const base: Pt = { x: 26, y: 43 };
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI / 2 + (i - 3) * 0.32 + (r() - 0.5) * 0.1;
    const len = 30 - Math.abs(i - 3) * 3;
    // stem with leaflets on both sides
    let p = base;
    for (let k = 1; k <= 6; k++) {
      const q = {
        x: base.x + Math.cos(ang) * len * (k / 6) + (i - 3) * k * 0.6,
        y: base.y + Math.sin(ang) * len * (k / 6) + k * k * 0.25,
      };
      P.limb(p, q, 1.6, 1.4, ramp('#2f7d32', 0, 0), false);
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      leaf(P, q, a - 1.1, 8 - k, 1.8, col);
      leaf(P, q, a + 1.1, 8 - k, 1.8, shade(col, -0.1));
      p = q;
    }
  }
  return P.finish();
}

function rock(v: number): HTMLCanvasElement {
  const P = new Painter(52, 28, OUTLINE);
  const r = ramp('#7c776e', -0.35, 0.25);
  P.poly(
    [
      { x: 3, y: 27 },
      { x: 6, y: 13 },
      { x: 14, y: 5 },
      { x: 30, y: 3 },
      { x: 42, y: 9 },
      { x: 49, y: 20 },
      { x: 49, y: 27 },
    ],
    r.dark,
  );
  P.poly(
    [
      { x: 6, y: 22 },
      { x: 8, y: 13 },
      { x: 15, y: 6 },
      { x: 30, y: 4 },
      { x: 40, y: 10 },
      { x: 44, y: 20 },
      { x: 30, y: 24 },
    ],
    r.base,
  );
  P.poly(
    [
      { x: 12, y: 11 },
      { x: 16, y: 7 },
      { x: 29, y: 5 },
      { x: 33, y: 9 },
      { x: 20, y: 12 },
    ],
    r.light,
  );
  // a crack and moss
  P.poly(
    [
      { x: 31, y: 10 },
      { x: 33, y: 16 },
      { x: 30, y: 22 },
      { x: 31, y: 16 },
    ],
    shade('#7c776e', -0.5),
  );
  if (v % 2) P.ell(18, 6, 7, 2.5, '#4f8f3a');
  P.rect(2, 25, 48, 3, '#3f3b36');
  return P.finish();
}

function flower(v: number): HTMLCanvasElement {
  const P = new Painter(28, 28, OUTLINE);
  P.limb({ x: 14, y: 27 }, { x: 14, y: 11 }, 2, 2, ramp('#3f9b46', -0.3, 0.2), false);
  leaf(P, { x: 14, y: 22 }, -0.6, 8, 2.4, '#3f9b46');
  leaf(P, { x: 14, y: 19 }, -2.5, 7, 2.2, '#4fb04f');
  const col = ['#ff6b6b', '#ffd93d', '#c77dff'][v % 3] as string;
  const pr = ramp(col, -0.3, 0.3);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    P.ell(14 + Math.cos(a) * 4.5, 9 + Math.sin(a) * 4, 3.4, 2.8, i < 2 ? pr.light : pr.base, a);
  }
  P.ell(14, 9, 2.4, 2.4, '#fff3b0');
  return P.finish();
}

function tuft(v: number): HTMLCanvasElement {
  const P = new Painter(32, 18, OUTLINE);
  const r = rng(v * 3 + 11);
  for (let i = 0; i < 9; i++) {
    const x = 3 + i * 3.2;
    const h = 7 + r() * 9;
    const lean = (r() - 0.5) * 6;
    const col = i % 2 ? '#58a63c' : '#78c34c';
    P.poly(
      [
        { x: x - 1.6, y: 18 },
        { x: x + lean, y: 18 - h },
        { x: x + 1.6, y: 18 },
      ],
      col,
    );
  }
  return P.finish();
}

const cache = new Map<string, HTMLCanvasElement>();

/** The high-definition picture of a prop (twice the classic size), or null if it has none yet. */
export function propHD(kind: Prop['kind'], v: number): HTMLCanvasElement | null {
  const jungle = { palm, bush, fern, rock, flower, tuft } as Partial<
    Record<Prop['kind'], (v: number) => HTMLCanvasElement>
  >;
  // the jungle set here; tomb and norse in prop-hd-ancient.ts; camp, base, Olympus, demon citadel and hive in
  // prop-hd-war.ts (three variants each)
  const f = jungle[kind] ?? ANCIENT_PROPS[kind] ?? WAR_PROPS[kind];
  if (!f) return null;
  const vv = jungle[kind] ? (kind === 'palm' ? v % 4 : v % 6) : v % 3;
  const key = `${kind}|${vv}`;
  let c = cache.get(key);
  if (!c) cache.set(key, (c = f(vv)));
  return c;
}
