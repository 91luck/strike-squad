import { Painter, ramp, shade, type Pt, type Ramp } from './hero-hd';
import type { Prop } from './world-art';

/**
 * Scenery in high definition for the war and myth worlds: the field camp and military base (crate, sandbags,
 * barbed wire, warning sign, lamp post), Olympus (column, ruin, amphora, statue), the demon citadel (skulls,
 * spikes, brazier) and the alien hive (crystal, pod, stalk).
 *
 * Same method as prop-hd.ts: shaded shapes painted with the heroes' Painter, one light from the front and above
 * (lit top-left faces, shaded right and underside), three tones per material, then hardened into pixel art with
 * a dark outline. Every picture is exactly twice the classic sprite's size with its base on the bottom row, so
 * it stands where the classic prop stood. Fires and crystals carry a glow painted in (no animation).
 */

const OUTLINE = '#141019';

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

const p = (x: number, y: number): Pt => ({ x, y });

/** A box face lit from the top-left: light top band, mid face, dark right and bottom bands. */
function box(P: Painter, x: number, y: number, w: number, h: number, r: Ramp, edge = 3): void {
  P.rect(x, y, w, h, r.base);
  P.rect(x, y, w, edge, r.light);
  P.rect(x, y, edge - 1, h, r.light);
  P.rect(x + w - edge, y, edge, h, r.dark);
  P.rect(x, y + h - edge, w, edge, r.dark);
}

/** A soft sack shape: a rounded slab lit on top, shaded below, with a tied seam. */
function sack(P: Painter, cx: number, cy: number, w: number, h: number, r: Ramp): void {
  // a stuffed sack: a capsule (pillow) shape, lit along its top, a tied end on the right
  const a = p(cx - w / 2 + h / 2, cy);
  const b = p(cx + w / 2 - h / 2, cy);
  P.limb(a, b, h, h, r);
  P.rect(a.x, cy - h * 0.38, b.x - a.x, 1.6, r.light);
  P.rect(cx - w / 2 + 3, cy + h * 0.25, w - 6, 1.2, shade(r.dark, -0.15));
  P.rect(b.x + h * 0.25, cy - h * 0.3, 1.4, h * 0.6, shade(r.dark, -0.25));
}

// ------------------------------------------------------------------ camp and base

function crate(v: number): HTMLCanvasElement {
  const P = new Painter(44, 40, OUTLINE);
  const wood = ramp(v % 2 ? '#a8743c' : '#9c6a35', -0.35, 0.22);
  const plank = ramp(shade(wood.base, -0.12), -0.3, 0.15);
  box(P, 0, 0, 44, 40, wood, 4);
  // planks with grain
  for (let y = 4; y < 36; y += 8) {
    P.rect(4, y + 7, 36, 1, shade(wood.base, -0.3));
    P.rect(8 + ((y * 7) % 20), y + 3, 6, 1, shade(wood.base, -0.15));
  }
  // frame and the diagonal brace
  box(P, 0, 0, 44, 5, plank, 2);
  box(P, 0, 35, 44, 5, plank, 2);
  box(P, 0, 0, 5, 40, plank, 2);
  box(P, 39, 0, 5, 40, plank, 2);
  P.poly([p(5, 9), p(9, 5), p(39, 31), p(35, 35)], plank.dark);
  P.poly([p(5, 8), p(8, 5), p(39, 30), p(36, 33)], plank.base);
  P.poly([p(6, 7), p(8, 5), p(20, 17)], plank.light);
  // nails and a stencil mark
  for (const [x, y] of [
    [2, 2],
    [40, 2],
    [2, 37],
    [40, 37],
  ] as const)
    P.rect(x, y, 2, 2, '#d7d3c8');
  P.rect(29, 9, 8, 2, '#2b1d10');
  P.rect(29, 13, 6, 2, '#2b1d10');
  return P.finish();
}

function sandbags(v: number): HTMLCanvasElement {
  const P = new Painter(80, 32, OUTLINE);
  const r = rng(v * 13 + 5);
  const base = ramp('#b39a6a', -0.35, 0.2);
  const top = ramp('#a68d5f', -0.35, 0.22);
  for (let i = 0; i < 4; i++)
    sack(P, 11 + i * 20, 24, 19, 14, ramp(shade(base.base, (r() - 0.5) * 0.1), -0.35, 0.2));
  for (let i = 0; i < 3; i++)
    sack(P, 21 + i * 20, 12, 19, 13, ramp(shade(top.base, (r() - 0.5) * 0.1), -0.35, 0.24));
  // stitching specks
  for (let i = 0; i < 10; i++) P.rect(4 + r() * 72, 8 + r() * 20, 1, 1, shade(base.dark, -0.2));
  return P.finish();
}

function wire(v: number): HTMLCanvasElement {
  const P = new Painter(68, 28, OUTLINE);
  const post = ramp('#5b4a3a', -0.35, 0.2);
  P.limb(p(6, 27), p(6, 1), 4, 3.5, post);
  P.limb(p(62, 27), p(62, 3), 4, 3.5, post);
  const steel = ramp('#9aa3ad', -0.4, 0.35);
  const phase = (v % 3) * 0.7;
  // two coiled strands with barbs
  for (let x = 8; x < 60; x += 1.5) {
    const y1 = 8 + Math.sin(x / 4.4 + phase) * 4;
    const y2 = 18 + Math.cos(x / 4.4 + phase) * 4;
    P.rect(x, y1, 1.6, 1.6, Math.sin(x / 4.4 + phase) > 0 ? steel.dark : steel.base);
    P.rect(x, y2, 1.6, 1.6, Math.cos(x / 4.4 + phase) > 0 ? steel.base : steel.dark);
  }
  for (let x = 12; x < 58; x += 8) {
    P.poly([p(x - 2, 5), p(x + 2, 11), p(x + 1, 12), p(x - 3, 6)], steel.light);
    P.poly([p(x + 2, 15), p(x - 2, 21), p(x - 3, 20), p(x + 1, 14)], steel.light);
  }
  return P.finish();
}

function sign(v: number): HTMLCanvasElement {
  const P = new Painter(44, 56, OUTLINE);
  const post = ramp('#5b4a3a', -0.35, 0.2);
  P.limb(p(22, 55), p(22, 24), 5, 5, post);
  const yellow = ramp('#f4c430', -0.3, 0.3);
  // a warning board, bolted, with a weathered corner
  P.poly([p(2, 2), p(42, 2), p(42, 28), p(2, 28)], yellow.dark);
  P.poly([p(2, 2), p(41, 2), p(41, 25), p(2, 25)], yellow.base);
  P.poly([p(3, 3), p(40, 3), p(40, 6), p(3, 6)], yellow.light);
  P.poly([p(36, 22), p(42, 18), p(42, 28), p(34, 28)], shade('#f4c430', -0.45));
  // exclamation mark (or a skull on some boards)
  if (v % 3 === 2) {
    P.ell(22, 13, 6, 5.5, '#1d1d1d');
    P.rect(19, 17, 6, 4, '#1d1d1d');
    P.ell(19.5, 13, 1.8, 1.8, yellow.base);
    P.ell(24.5, 13, 1.8, 1.8, yellow.base);
  } else {
    P.poly([p(20, 6), p(24, 6), p(23, 17), p(21, 17)], '#1d1d1d');
    P.rect(20.5, 19, 3, 3, '#1d1d1d');
  }
  P.rect(4, 4, 2, 2, '#4b4f56');
  P.rect(38, 4, 2, 2, '#4b4f56');
  return P.finish();
}

function lamp(v: number): HTMLCanvasElement {
  const P = new Painter(28, 120, OUTLINE);
  const metal = ramp('#3b4048', -0.4, 0.3);
  P.limb(p(14, 118), p(14, 18), 6, 5, metal);
  P.rect(10, 60, 8, 3, metal.dark);
  P.rect(8, 112, 12, 7, metal.dark);
  P.rect(8, 112, 12, 2, metal.base);
  // lamp head: a hood with the bulb under it
  P.poly([p(3, 7), p(25, 7), p(22, 14), p(6, 14)], metal.dark);
  P.poly([p(4, 7), p(24, 7), p(23, 9), p(5, 9)], metal.light);
  P.ell(14, 15, 6, 3, v % 2 ? '#fff3b0' : '#ffd166');
  P.ell(13, 14.5, 2.5, 1.2, '#ffffff');
  return P.finish();
}

// ------------------------------------------------------------------ Olympus

const MARBLE = ramp('#e7e2d6', -0.22, 0.12);

/** A fluted shaft: alternating lit and shaded flutes between x0 and x1. */
function flutes(P: Painter, x0: number, x1: number, y0: number, y1: number): void {
  P.rect(x0, y0, x1 - x0, y1 - y0, MARBLE.base);
  for (let x = x0 + 2; x < x1 - 2; x += 6) {
    P.rect(x, y0, 2, y1 - y0, MARBLE.light);
    P.rect(x + 4, y0, 1.5, y1 - y0, MARBLE.dark);
  }
  P.rect(x1 - 4, y0, 4, y1 - y0, shade(MARBLE.dark, -0.08));
}

function column(v: number): HTMLCanvasElement {
  const P = new Painter(52, 220, OUTLINE);
  // capital: abacus slab, echinus, then the shaft
  P.rect(1, 0, 50, 12, MARBLE.base);
  P.rect(1, 0, 50, 3, MARBLE.light);
  P.rect(1, 9, 50, 3, MARBLE.dark);
  P.poly([p(5, 12), p(47, 12), p(43, 22), p(9, 22)], MARBLE.base);
  P.rect(9, 20, 34, 2, MARBLE.dark);
  flutes(P, 8, 44, 22, 204);
  // base mouldings
  P.rect(5, 204, 42, 6, MARBLE.base);
  P.rect(5, 204, 42, 2, MARBLE.light);
  P.rect(3, 210, 46, 10, MARBLE.base);
  P.rect(3, 210, 46, 2, MARBLE.light);
  P.rect(3, 217, 46, 3, MARBLE.dark);
  // weathering: a chip and ivy on some columns
  P.poly([p(44, 90), p(40, 96), p(44, 100)], shade(MARBLE.dark, -0.15));
  if (v % 2) {
    const leaf = ramp('#4f8f3a', -0.3, 0.2);
    for (let y = 150; y < 204; y += 7) {
      P.ell(10 + Math.sin(y / 9) * 3, y, 3.5, 2.5, leaf.base);
      P.ell(9 + Math.sin(y / 9) * 3, y - 1, 1.6, 1, leaf.light);
    }
  }
  return P.finish();
}

function ruin(v: number): HTMLCanvasElement {
  const P = new Painter(96, 88, OUTLINE);
  // a broken stump, its top snapped off in a jagged line
  flutes(P, 8, 44, 14, 88);
  P.poly([p(8, 14), p(14, 4), p(20, 12), p(28, 6), p(36, 13), p(44, 8), p(44, 16), p(8, 18)], MARBLE.base);
  P.poly([p(10, 13), p(14, 6), p(18, 12)], MARBLE.light);
  P.poly([p(28, 8), p(34, 13), p(26, 13)], MARBLE.light);
  // a fallen drum lying on its side
  P.ell(70, 74, 24, 13, MARBLE.dark);
  P.rect(48, 61, 44, 25, MARBLE.base);
  for (let x = 50; x < 88; x += 7) {
    P.rect(x, 62, 2, 23, MARBLE.light);
    P.rect(x + 4, 62, 1.5, 23, MARBLE.dark);
  }
  P.ell(48, 73.5, 6, 12.5, MARBLE.light);
  P.ell(48, 73.5, 3.5, 9, MARBLE.base);
  P.rect(46, 84, 48, 4, MARBLE.dark);
  // grass and moss at the foot
  const g = ramp('#6b8f47', -0.3, 0.2);
  for (let x = 2; x < 50; x += 3)
    P.poly([p(x, 88), p(x + 1.5, 80 - (x % 5)), p(x + 3, 88)], x % 2 ? g.base : g.light);
  if (v % 2) P.ell(20, 16, 8, 3, g.base);
  return P.finish();
}

function amphora(v: number): HTMLCanvasElement {
  const P = new Painter(32, 52, OUTLINE);
  const clay = ramp(v % 2 ? '#ea580c' : '#c2410c', -0.32, 0.22);
  // handles, neck, body, foot
  P.limb(p(9, 8), p(6, 18), 3, 3, clay);
  P.limb(p(23, 8), p(26, 18), 3, 3, clay);
  P.rect(11, 0, 10, 4, clay.light);
  P.rect(12, 3, 8, 8, clay.base);
  P.ell(16, 26, 11, 15, clay.dark);
  P.ell(15, 25, 10, 14, clay.base);
  P.ell(11, 19, 3.5, 6, clay.light);
  P.poly([p(12, 40), p(20, 40), p(22, 52), p(10, 52)], clay.dark);
  P.rect(10, 49, 12, 3, clay.base);
  // black-figure band with a meander
  P.rect(6, 22, 20, 8, '#1c1917');
  for (let x = 7; x < 25; x += 6) {
    P.rect(x, 24, 4, 1.4, clay.base);
    P.rect(x + 3, 24, 1.4, 4, clay.base);
    P.rect(x, 27, 4, 1.4, clay.base);
  }
  return P.finish();
}

function statue(v: number): HTMLCanvasElement {
  const P = new Painter(68, 184, OUTLINE);
  // plinth
  P.rect(4, 152, 60, 32, MARBLE.base);
  P.rect(4, 152, 60, 4, MARBLE.light);
  P.rect(4, 180, 60, 4, MARBLE.dark);
  P.rect(58, 156, 6, 24, MARBLE.dark);
  P.rect(14, 162, 40, 2, MARBLE.dark);
  P.rect(14, 172, 40, 2, MARBLE.dark);
  // a hero standing, spear raised, shield at the side: marble limbs
  const m = MARBLE;
  P.limb(p(28, 92), p(24, 150), 9, 7, m);
  P.limb(p(38, 92), p(42, 150), 9, 7, m);
  P.poly([p(20, 46), p(46, 46), p(44, 96), p(22, 96)], m.dark);
  P.poly([p(21, 46), p(42, 46), p(41, 92), p(23, 92)], m.base);
  P.poly([p(24, 50), p(32, 50), p(30, 70), p(24, 70)], m.light);
  // tunic folds
  for (let x = 24; x < 42; x += 4) P.rect(x, 80, 1.5, 14, m.dark);
  // head with a crested helmet
  P.limb(p(32, 46), p(32, 38), 7, 7, m, false);
  P.ell(33, 28, 9, 10, m.dark);
  P.ell(32, 27, 8, 9, m.base);
  P.ell(30, 23, 3, 3, m.light);
  P.poly([p(22, 20), p(30, 6), p(44, 12), p(40, 18)], v % 2 ? m.base : m.light);
  // raised arm and spear
  P.limb(p(42, 52), p(52, 36), 6, 5, m);
  P.limb(p(52, 36), p(54, 22), 5, 5, m);
  P.limb(p(56, 4), p(52, 104), 3, 3, ramp('#bdb6a6', -0.3, 0.2), false);
  P.poly([p(55, 0), p(59, 8), p(53, 8)], m.light);
  // shield on the other arm
  P.ell(17, 76, 13, 15, m.dark);
  P.ell(16, 75, 11.5, 13.5, m.base);
  P.ell(13, 70, 4, 5, m.light);
  return P.finish();
}

// ------------------------------------------------------------------ demon citadel

function skull(P: Painter, x: number, y: number, s: number): void {
  const bone = ramp('#e7e5e4', -0.3, 0.12);
  P.ell(x, y, 8 * s, 7.5 * s, bone.dark);
  P.ell(x - 0.5, y - 0.5, 7.4 * s, 6.8 * s, bone.base);
  P.ell(x - 2.5 * s, y - 3.5 * s, 3 * s, 2 * s, bone.light);
  P.rect(x - 5 * s, y + 4 * s, 10 * s, 4 * s, bone.base);
  P.rect(x - 5 * s, y + 7 * s, 10 * s, 1.5 * s, bone.dark);
  P.ell(x - 3 * s, y + 1 * s, 2.2 * s, 2.4 * s, '#1a0505');
  P.ell(x + 3 * s, y + 1 * s, 2.2 * s, 2.4 * s, '#1a0505');
  P.poly([p(x, y + 3 * s), p(x - 1.2 * s, y + 5 * s), p(x + 1.2 * s, y + 5 * s)], '#3a1010');
  for (let k = -3; k <= 3; k += 2) P.rect(x + k * s, y + 6 * s, 0.9 * s, 2 * s, bone.dark);
}

function skulls(v: number): HTMLCanvasElement {
  const P = new Painter(68, 40, OUTLINE);
  // a heap: three on the bottom row, two on top
  for (const [x, y] of [
    [14, 27],
    [34, 28],
    [54, 27],
  ] as const)
    skull(P, x, y, 1.15);
  for (const [x, y] of [
    [24, 12],
    [44, 12],
  ] as const)
    skull(P, x, y, 1.05);
  if (v % 2) P.ell(34, 37, 30, 2.5, '#3b1f1c');
  return P.finish();
}

function spikes(v: number): HTMLCanvasElement {
  const P = new Painter(72, 52, OUTLINE);
  const iron = ramp('#3f1d1d', -0.35, 0.25);
  const r = rng(v * 5 + 2);
  // a row of iron stakes in a bed of rubble, tips bloodied
  for (let i = 0; i < 6; i++) {
    const h = 24 + ((i * 7) % 12) * 2 + r() * 4;
    const x = 7 + i * 11;
    const lean = (r() - 0.5) * 6;
    P.poly([p(x - 4, 52), p(x + lean, 52 - h), p(x + 4, 52)], iron.dark);
    P.poly([p(x - 3.4, 52), p(x + lean - 0.4, 52 - h + 2), p(x + 0.5, 52)], iron.base);
    P.poly([p(x - 2.6, 50), p(x + lean - 0.8, 52 - h + 6), p(x - 1, 50)], iron.light);
    P.poly([p(x + lean - 1.6, 52 - h + 7), p(x + lean, 52 - h), p(x + lean + 1.6, 52 - h + 7)], '#fca5a5');
    P.poly(
      [p(x + lean - 1.2, 52 - h + 9), p(x + lean, 52 - h + 4), p(x + lean + 1.2, 52 - h + 9)],
      '#b91c1c',
    );
  }
  const rub = ramp('#44403c', -0.3, 0.2);
  for (let x = 2; x < 70; x += 7) P.ell(x + r() * 3, 50, 4 + r() * 2, 3, r() < 0.5 ? rub.base : rub.dark);
  return P.finish();
}

function brazier(v: number): HTMLCanvasElement {
  const P = new Painter(40, 80, OUTLINE);
  const iron = ramp('#3b1f1c', -0.35, 0.25);
  const bowl = ramp('#57534e', -0.35, 0.25);
  // a tripod, the bowl and the fire
  P.limb(p(20, 30), p(8, 78), 3, 3, iron);
  P.limb(p(20, 30), p(32, 78), 3, 3, iron);
  P.limb(p(20, 30), p(20, 78), 4, 3, iron);
  P.rect(4, 74, 32, 6, iron.dark);
  P.rect(4, 74, 32, 2, iron.base);
  P.poly([p(3, 16), p(37, 16), p(32, 30), p(8, 30)], bowl.dark);
  P.poly([p(3, 16), p(37, 16), p(35, 21), p(5, 21)], bowl.base);
  P.rect(3, 16, 34, 2, bowl.light);
  for (const x of [10, 20, 30]) P.ell(x, 25, 2, 2, iron.light);
  // flames: outer orange tongues, a yellow core, a white heart
  const f = v % 2 ? 0 : 2;
  P.poly(
    [p(6, 17), p(10, 4 + f), p(14, 12), p(18, 0), p(22, 10), p(27, 2 + f), p(30, 12), p(34, 17)],
    '#f97316',
  );
  P.poly([p(10, 17), p(14, 8), p(18, 13), p(21, 4), p(25, 12), p(28, 9), p(30, 17)], '#fbbf24');
  P.poly([p(15, 17), p(19, 9), p(22, 13), p(25, 17)], '#fef3c7');
  return P.finish();
}

// ------------------------------------------------------------------ alien hive

const CRYSTALS = ['#a78bfa', '#67e8f9', '#86efac'];

function shard(P: Painter, x: number, base: number, w: number, h: number, lean: number, col: string): void {
  const r = ramp(col, -0.35, 0.3);
  const tip = p(x + lean, base - h);
  P.poly([p(x - w / 2, base), tip, p(x + w / 2, base)], r.dark);
  P.poly([p(x - w / 2, base), tip, p(x + lean * 0.4, base)], r.base);
  P.poly([p(x - w / 2 + 1.5, base - 2), tip, p(x - w / 4, base - 4)], r.light);
  P.limb(
    p(x - w / 2 + 2, base - 4),
    p(x + lean * 0.9 - 1, base - h + 6),
    1.2,
    1,
    ramp('#ffffff', 0, 0),
    false,
  );
}

function crystal(v: number): HTMLCanvasElement {
  const P = new Painter(60, 68, OUTLINE);
  const col = CRYSTALS[v % 3] as string;
  // a cluster of shards on a rock
  shard(P, 12, 64, 16, 40, -5, shade(col, -0.15));
  shard(P, 46, 64, 16, 50, 5, shade(col, -0.05));
  shard(P, 22, 64, 12, 30, -8, shade(col, -0.25));
  shard(P, 29, 64, 20, 66, 0, col);
  const rock = ramp('#3b3346', -0.3, 0.2);
  P.ell(30, 64, 28, 5, rock.dark);
  P.ell(28, 63, 22, 3, rock.base);
  return P.finish();
}

function pod(v: number): HTMLCanvasElement {
  const P = new Painter(52, 56, OUTLINE);
  const shell = ramp('#365314', -0.35, 0.25);
  const lip = ramp('#4d7c0f', -0.3, 0.3);
  // a leathery egg split open at the top, a glowing larva inside
  P.ell(26, 33, 21, 22, shell.dark);
  P.ell(25, 32, 19, 20.5, shell.base);
  P.ell(17, 26, 5, 9, shell.light);
  for (let y = 22; y < 52; y += 6) P.rect(8, y, 36, 1.4, shade(shell.dark, -0.15));
  P.poly([p(10, 18), p(16, 6), p(22, 14), p(26, 4), p(31, 14), p(37, 6), p(42, 18)], lip.dark);
  P.poly([p(12, 18), p(16, 9), p(21, 16), p(26, 7), p(31, 16), p(36, 9), p(40, 18)], lip.base);
  P.ell(26, 26, 9, 12, '#1a2e05');
  P.ell(26, 27, 7, 10, v % 2 ? '#bef264' : '#a3e635');
  P.ell(24, 23, 2.5, 4, '#ffffff');
  P.rect(4, 52, 44, 4, '#1a2e05');
  return P.finish();
}

function stalk(v: number): HTMLCanvasElement {
  const P = new Painter(36, 128, OUTLINE);
  const stem = ramp('#166534', -0.35, 0.25);
  // a ribbed stalk swaying up to a glowing bulb
  let prev = p(18, 128);
  for (let y = 120; y >= 22; y -= 6) {
    const pt = p(18 + Math.sin(y / 18 + v) * 6, y);
    P.limb(prev, pt, 7, 6, stem);
    P.rect(pt.x - 3, pt.y, 6, 1.2, stem.dark);
    prev = pt;
  }
  P.ell(prev.x, 14, 16, 14, shade('#22c55e', -0.55));
  P.ell(prev.x, 13, 11, 12, '#22c55e');
  P.ell(prev.x - 1, 12, 7, 8, '#86efac');
  P.ell(prev.x - 3, 8, 3, 3.5, '#f0fdf4');
  // little feelers
  P.limb(p(prev.x - 6, 22), p(prev.x - 13, 30), 2, 1, stem, false);
  P.limb(p(prev.x + 6, 22), p(prev.x + 13, 30), 2, 1, stem, false);
  return P.finish();
}

/** High-definition painters for the war and myth props, by kind; each takes the classic variant number. */
export const WAR_PROPS: Partial<Record<Prop['kind'], (v: number) => HTMLCanvasElement>> = {
  crate,
  sandbags,
  wire,
  sign,
  lamp,
  column,
  ruin,
  amphora,
  statue,
  skulls,
  spikes,
  brazier,
  crystal,
  pod,
  stalk,
};
