import type { Aim, CharFrame, Look, Pose } from './sprites';

/**
 * Heroes in high definition: twice the pixel detail of the rest of the world, the same size in the game.
 *
 * Each hero is posed on a skeleton (hips, knees, feet, shoulders, elbows, hands, head) and its body parts are
 * drawn as shaded shapes on a 96 x 100 canvas, then turned into clean pixel art: edges are made hard, every
 * colour is snapped to the hero's own small palette, and a dark outline goes round the figure. The game draws
 * the result at half size, so a hero stands exactly where and as tall as before, only with four times as many
 * pixels. Shading follows one light, from the front and above: a shadow tone on the back of every part and a
 * light tone along its front edge (three tones per material, like hand-made sprites).
 *
 * Poses and run cycle: `rig()` turns (pose, frame) into joint angles. The run is the classic eight-frame cycle
 * (contact, down, pass, push, lift, recover, reach, extend), with the second leg half a cycle behind and the
 * body bobbing on each step. Arms always come from the aim: both hands on the rifle, the elbows bent by
 * two-bone IK. The knife pose swaps the rifle for a blade, and a knocked-out hero is the falling pose laid on
 * its back.
 */

export const HD = 2;
export const HD_W = 96;
export const HD_H = 100;
export const HD_FEET = 96;
export const HD_CENTER = 40;

/** Canvases holding a high-definition frame (drawn at 1/HD size by the renderer). */
export const hdCanvases = new WeakSet<HTMLCanvasElement>();

export const HD_POSES: ReadonlySet<Pose> = new Set([
  'idle',
  'run',
  'jump',
  'fall',
  'crouch',
  'slide',
  'dash',
  'melee',
  'flip',
  'down',
]);

const OUTLINE = '#141019';

// ------------------------------------------------------------------ colour

type RGB = [number, number, number];

function rgb(c: string): RGB {
  if (c.startsWith('rgb')) {
    const m = c.match(/\d+/g) ?? ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let h = c.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((x) => x + x)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: RGB): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Lighter (amt > 0) or darker (amt < 0), shifting hue a little the way painters do: shadows cool, lights warm. */
export function shade(c: string, amt: number): string {
  const [r, g, b] = rgb(c);
  if (amt < 0) {
    const k = 1 + amt;
    return hex([
      Math.round(r * k * 0.95),
      Math.round(g * k * 0.97),
      Math.round(Math.min(255, b * k + 14 * -amt)),
    ]);
  }
  return hex([
    Math.round(r + (255 - r) * amt),
    Math.round(g + (255 - g) * amt * 0.92),
    Math.round(b + (255 - b) * amt * 0.75),
  ]);
}

export interface Ramp {
  dark: string;
  base: string;
  light: string;
}

export function ramp(c: string, d = -0.32, l = 0.24): Ramp {
  return { dark: shade(c, d), base: c, light: shade(c, l) };
}

// ------------------------------------------------------------------ the skeleton

export interface Pt {
  x: number;
  y: number;
}

interface Leg {
  /** Thigh angle from straight down, + = forward (radians). */
  thigh: number;
  /** Knee bend (radians, + = the shin swings back). */
  bend: number;
}

interface Rig {
  hip: Pt;
  /** Torso lean, + = forward (radians). */
  lean: number;
  front: Leg;
  back: Leg;
  /** The rifle's angle (0 = level, forward). */
  aim: number;
}

const D = Math.PI / 180;
const THIGH = 17;
const SHIN = 18;
const UPPER_ARM = 13;
const FOREARM = 13;
const TORSO = 26;

/** Leg angles of the eight-frame run cycle (thigh, knee bend), degrees. */
const RUN: readonly [number, number][] = [
  [32, 6], // contact: heel reaches the ground
  [18, 26], // down: knee takes the weight
  [0, 20], // pass: leg under the body
  [-24, 12], // push: driving off the toes
  [-36, 58], // lift: foot leaves the ground
  [-8, 104], // recover: heel up under the seat
  [30, 86], // reach: knee drives forward
  [44, 30], // extend: shin swings out to land
];
const RUN_BOB = [2, 4, 2, 0, 2, 4, 2, 0];

const AIM_RAD: Record<Aim, number> = { f: 0, uf: -45 * D, u: -80 * D, df: 40 * D, d: 70 * D };

function rig(pose: Pose, frame: number, aim: Aim): Rig {
  const a = AIM_RAD[aim];
  const leg = (t: number, b: number): Leg => ({ thigh: t * D, bend: b * D });
  switch (pose) {
    case 'run': {
      const f = ((frame % 8) + 8) % 8;
      const [t1, b1] = RUN[f] as [number, number];
      const [t2, b2] = RUN[(f + 4) % 8] as [number, number];
      return {
        hip: { x: HD_CENTER, y: 56 + (RUN_BOB[f] as number) },
        lean: 9 * D,
        front: leg(t1, b1),
        back: leg(t2, b2),
        aim: a,
      };
    }
    case 'dash':
      return { hip: { x: HD_CENTER, y: 60 }, lean: 22 * D, front: leg(48, 40), back: leg(-38, 70), aim: a };
    case 'jump':
      return { hip: { x: HD_CENTER, y: 55 }, lean: 4 * D, front: leg(46, 84), back: leg(-6, 62), aim: a };
    case 'fall':
      return { hip: { x: HD_CENTER, y: 57 }, lean: -2 * D, front: leg(20, 30), back: leg(-14, 44), aim: a };
    case 'crouch':
      return {
        hip: { x: HD_CENTER - 2, y: 70 },
        lean: 12 * D,
        front: leg(70, 74),
        back: leg(-8, 118),
        aim: a,
      };
    case 'slide':
      return {
        hip: { x: HD_CENTER - 6, y: 84 },
        lean: -38 * D,
        front: leg(84, 6),
        back: leg(80, 150),
        aim: a,
      };
    case 'melee':
      // a lunge: front knee bent, rifle slung low in the far hand, the knife in the near one
      return {
        hip: { x: HD_CENTER, y: 62 },
        lean: 14 * D,
        front: leg(34, 26),
        back: leg(-30, 18),
        aim: 75 * D,
      };
    case 'flip':
      // tucked into a somersault
      return { hip: { x: HD_CENTER, y: 50 }, lean: 26 * D, front: leg(96, 146), back: leg(84, 132), aim: a };
    default: {
      // breathing: the body sinks a pixel and the knees give, so the feet stay planted
      const breathe = frame % 2;
      return {
        hip: { x: HD_CENTER, y: 57 + breathe },
        lean: 2 * D,
        front: leg(9, 4 + breathe * 10),
        back: leg(-9, 6 + breathe * 10),
        aim: a,
      };
    }
  }
}

function polar(o: Pt, len: number, ang: number): Pt {
  // ang measured from straight down, + = forward (towards +x)
  return { x: o.x + Math.sin(ang) * len, y: o.y + Math.cos(ang) * len };
}

/** Two-bone IK: the elbow, bending downward, for a hand at `h` from shoulder `s`. */
function elbow(s: Pt, h: Pt, a: number, b: number): Pt {
  const dx = h.x - s.x;
  const dy = h.y - s.y;
  const d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)));
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  // bend so the elbow hangs below the line shoulder→hand
  const ang = base + (dx >= 0 ? off : -off);
  return { x: s.x + Math.cos(ang) * a, y: s.y + Math.sin(ang) * a };
}

// ------------------------------------------------------------------ painting

/**
 * Vector shapes in, pixel art out: draw with the methods below, then `finish()` hardens the edges, snaps every
 * colour to the ones used, and outlines the figure. Shared by the heroes and the high-definition props.
 */
export class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly palette = new Set<string>();
  private readonly W: number;
  private readonly H: number;

  constructor(
    w = HD_W,
    h = HD_H,
    private readonly outline = OUTLINE,
  ) {
    this.W = w;
    this.H = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const g = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  use(c: string): string {
    this.palette.add(c);
    return c;
  }

  /**
   * A rounded limb from a to b, `w` wide at a and `w2` at b, shaded with a dark back edge and a light front.
   * `rim` draws a one-pixel line round it first, so a limb in front of the body stays readable against it.
   */
  limb(a: Pt, b: Pt, w: number, w2: number, r: Ramp, lit = true, rim?: string): void {
    const g = this.g;
    const path = (grow: number, dx: number, dy: number) => {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const ra = Math.max(0.2, w / 2 + grow);
      const rb = Math.max(0.2, w2 / 2 + grow);
      g.beginPath();
      g.moveTo(a.x + nx * ra + dx, a.y + ny * ra + dy);
      g.lineTo(b.x + nx * rb + dx, b.y + ny * rb + dy);
      g.arc(b.x + dx, b.y + dy, rb, ang + Math.PI / 2, ang - Math.PI / 2, true);
      g.lineTo(a.x - nx * ra + dx, a.y - ny * ra + dy);
      g.arc(a.x + dx, a.y + dy, ra, ang - Math.PI / 2, ang + Math.PI / 2, true);
      g.closePath();
    };
    if (rim) {
      path(1.1, 0, 0);
      g.fillStyle = this.use(rim);
      g.fill();
    }
    g.save();
    path(0, 0, 0);
    g.fillStyle = this.use(r.dark);
    g.fill();
    g.clip();
    path(-0.6, 1.4, -0.8);
    g.fillStyle = this.use(r.base);
    g.fill();
    if (lit) {
      path(-Math.min(w, w2) * 0.32, 2.4, -1.6);
      g.fillStyle = this.use(r.light);
      g.fill();
    }
    g.restore();
  }

  poly(pts: readonly Pt[], c: string): void {
    const g = this.g;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillStyle = this.use(c);
    g.fill();
  }

  ell(x: number, y: number, rx: number, ry: number, c: string, rot = 0): void {
    const g = this.g;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fillStyle = this.use(c);
    g.fill();
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    this.g.fillStyle = this.use(c);
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Hard edges, the palette only, and the outline: vector shapes become pixel art. */
  finish(): HTMLCanvasElement {
    const HD_W = this.W;
    const HD_H = this.H;
    const img = this.g.getImageData(0, 0, HD_W, HD_H);
    const d = img.data;
    const pal = [...this.palette].map(rgb);
    for (let i = 0; i < d.length; i += 4) {
      if ((d[i + 3] as number) < 110) {
        d[i + 3] = 0;
        continue;
      }
      // anti-aliased edges against transparency are darkened by premultiplication; undo it before matching
      const a = (d[i + 3] as number) / 255;
      const r = (d[i] as number) / a;
      const gg = (d[i + 1] as number) / a;
      const b = (d[i + 2] as number) / a;
      let best = pal[0] as RGB;
      let bd = Infinity;
      for (const p of pal) {
        const e = (p[0] - r) ** 2 * 0.3 + (p[1] - gg) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
        if (e < bd) {
          bd = e;
          best = p;
        }
      }
      d[i] = best[0];
      d[i + 1] = best[1];
      d[i + 2] = best[2];
      d[i + 3] = 255;
    }
    const [or, og, ob] = rgb(this.outline);
    const solid = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < HD_W && y < HD_H && (d[(y * HD_W + x) * 4 + 3] as number) > 0;
    const edge: number[] = [];
    for (let y = 0; y < HD_H; y++)
      for (let x = 0; x < HD_W; x++)
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)))
          edge.push((y * HD_W + x) * 4);
    for (const i of edge) {
      d[i] = or;
      d[i + 1] = og;
      d[i + 2] = ob;
      d[i + 3] = 255;
    }
    this.g.putImageData(img, 0, 0);
    hdCanvases.add(this.canvas);
    return this.canvas;
  }
}

// ------------------------------------------------------------------ body parts

const BOOT = ramp('#2b2622', -0.4, 0.3);
const METAL = ramp('#3a3f47', -0.45, 0.35);
const STRAP = '#2a241f';

function drawLeg(p: Painter, hip: Pt, l: Leg, pants: Ramp, back: boolean): void {
  const knee = polar(hip, THIGH, l.thigh);
  const ankle = polar(knee, SHIN, l.thigh - l.bend);
  const pr = back ? ramp(pants.dark, -0.25, 0.12) : pants;
  const rim = back ? undefined : shade(pants.dark, -0.5);
  p.limb(hip, knee, 11, 9, pr, true, rim);
  p.limb(knee, ankle, 9, 7, pr, true, rim);
  // knee pad on the near leg
  if (!back) p.ell(knee.x + 1.5, knee.y, 3.6, 3.2, '#3b3b40');
  // boot: the sole stays level with the ground unless the leg is swinging
  const footAng = Math.max(-0.5, Math.min(0.6, (l.thigh - l.bend) * 0.5));
  const b = back ? ramp(BOOT.dark, -0.2, 0.1) : BOOT;
  const toe = { x: ankle.x + Math.cos(footAng) * 8, y: ankle.y + 3 + Math.sin(footAng) * 8 };
  p.limb({ x: ankle.x - 1, y: ankle.y + 1 }, toe, 8, 6, b);
  p.limb(
    { x: ankle.x - 2, y: ankle.y + 4 },
    { x: toe.x + 1, y: toe.y + 1.5 },
    3,
    3,
    ramp('#141210', 0, 0),
    false,
  );
}

const GOLD = ramp('#e2b23c', -0.4, 0.35);
const LEATHER = ramp('#7a4a26', -0.4, 0.25);

/**
 * The archer's quiver on a hero's back (drawn before the torso, so only what stands clear of the body shows):
 * a leather tube slung from the far shoulder to the hip, three arrows fletched in the hero's accent colour.
 */
function drawQuiver(p: Painter, hip: Pt, L: Look, lean: number): void {
  const s = Math.sin(lean);
  const c = Math.cos(lean);
  const at = (fx: number, fy: number): Pt => ({ x: hip.x + fx * c + fy * s, y: hip.y - fy * c + fx * s });
  const mouth = at(-10, TORSO + 2);
  p.limb(at(-7, 5), mouth, 6, 7, LEATHER);
  p.ell(mouth.x, mouth.y, 4, 2, GOLD.base, lean - 0.35);
  const feather = ramp(L.accent, -0.3, 0.3);
  [-3.5, 0, 3.5].forEach((dx, i) => {
    const base = at(-10 + dx * 0.7, TORSO + 3);
    const tip = at(-12.5 + dx, TORSO + 11 - (i === 1 ? 0 : 1.5));
    p.limb(base, tip, 1.4, 1.4, ramp('#d9c9a3', -0.3, 0.2), false);
    p.poly([tip, at(-15 + dx, TORSO + 8.5), at(-12 + dx, TORSO + 6)], i === 1 ? feather.light : feather.base);
  });
}

/**
 * The waist sash (kamarband) over the belt, knotted at the back with two tails that trail behind like the
 * bandana does (see `trail`).
 */
function drawSash(p: Painter, hip: Pt, L: Look, lean: number): void {
  const s = Math.sin(lean);
  const c = Math.cos(lean);
  const at = (fx: number, fy: number): Pt => ({ x: hip.x + fx * c + fy * s, y: hip.y - fy * c + fx * s });
  const cloth = ramp(L.accent, -0.32, 0.26);
  p.poly([at(-8, 2.5), at(8, 2.5), at(8.5, 6), at(-8, 6)], cloth.base);
  p.poly([at(1, 4.6), at(8.3, 4.6), at(8.5, 6), at(1, 6)], cloth.light);
  p.poly([at(-8, 2.5), at(8, 2.5), at(8, 3.4), at(-8, 3.4)], cloth.dark);
  const knot = at(-8, 4);
  const t = (dx: number, dy: number): Pt => trail(knot.x, knot.y, knot.x + dx, knot.y + dy);
  p.poly([knot, t(-4, 2), t(-7, 13), t(-3, 14), t(-1, 4)], cloth.dark);
  p.poly([knot, t(-2, 3), t(-3, 11), t(0, 11), t(1, 3)], cloth.base);
  p.ell(knot.x, knot.y, 2.4, 2.2, GOLD.base);
}

function drawTorso(p: Painter, hip: Pt, neck: Pt, L: Look, lean: number): void {
  const shirt = ramp(L.color);
  const vest = ramp(L.vest, -0.35, 0.2);
  const s = Math.sin(lean);
  const c = Math.cos(lean);
  // a torso quad: wide shoulders, narrower waist
  const at = (fx: number, fy: number): Pt => ({ x: hip.x + fx * c + fy * s, y: hip.y - fy * c + fx * s });
  p.poly(
    [at(-8, 0), at(8, 0), at(11, TORSO - 4), at(7, TORSO + 1), at(-8, TORSO + 1), at(-10, TORSO - 5)],
    shirt.dark,
  );
  p.poly([at(-4, 1), at(8, 1), at(10, TORSO - 4), at(6, TORSO), at(-3, TORSO)], shirt.base);
  p.poly([at(3, 3), at(7, 3), at(8, TORSO - 5), at(5, TORSO - 2)], shirt.light);
  const torso = L.torso ?? 'vest';
  if (torso === 'vest') {
    // tactical vest with pouches
    p.poly([at(-8, 3), at(9, 3), at(10, TORSO - 7), at(-8, TORSO - 7)], vest.dark);
    p.poly([at(-3, 4), at(9, 4), at(10, TORSO - 8), at(-3, TORSO - 8)], vest.base);
    p.poly([at(4, 5), at(8, 5), at(8, TORSO - 7), at(5, TORSO - 7)], vest.light);
    p.poly([at(-1, 7), at(4, 7), at(4, 11), at(-1, 11)], vest.dark);
    p.poly([at(5, 7), at(8, 7), at(8, 11), at(5, 11)], vest.dark);
  } else if (torso === 'wraps') {
    // bandage strips wound round the body
    for (let y = 3; y < TORSO - 2; y += 4) {
      p.poly([at(-8, y), at(10, y + 1.5), at(10, y + 3.5), at(-8, y + 2)], vest.base);
      p.poly([at(-8, y + 2), at(10, y + 3.5), at(10, y + 4), at(-8, y + 2.5)], vest.dark);
    }
  } else if (torso === 'ribs') {
    // a bare chest with bone ribs painted (or showing) on it
    for (let i = 0; i < 4; i++) {
      const y = TORSO - 8 - i * 4;
      p.poly([at(-2, y), at(9, y - 1), at(9, y + 1.4), at(-2, y + 1.6)], '#e7dcc4');
    }
    p.poly([at(2, 6), at(4, 6), at(4, TORSO - 6), at(2, TORSO - 6)], '#d6cbb0');
  } else if (torso === 'fur') {
    // a shaggy fur mantle over the shoulders
    const fur = ramp(L.vest, -0.35, 0.2);
    p.poly([at(-11, TORSO - 10), at(12, TORSO - 9), at(11, TORSO + 3), at(-11, TORSO + 2)], fur.dark);
    for (let i = 0; i < 8; i++)
      p.poly(
        [at(-11 + i * 3, TORSO - 9), at(-9.5 + i * 3, TORSO - 14 - (i % 2) * 2), at(-8 + i * 3, TORSO - 9)],
        i % 2 ? fur.base : fur.dark,
      );
    p.poly([at(-6, TORSO - 6), at(10, TORSO - 5), at(10, TORSO + 1), at(-6, TORSO + 1)], fur.light);
  }
  // belt with a buckle
  p.poly([at(-8, -1), at(8, -1), at(8, 3), at(-8, 3)], STRAP);
  p.poly([at(3, -1), at(6, -1), at(6, 3), at(3, 3)], L.enemy ? '#6b6b6b' : '#c9a24a');
  // a strap across the chest in the hero's colour
  if (torso === 'vest')
    p.poly([at(-6, TORSO - 7), at(-3, TORSO - 7), at(7, 6), at(4, 6)], shade(L.accent, -0.1));
  void neck;
}

function drawHead(p: Pt, P: Painter, L: Look): void {
  const skin = ramp(L.skin, -0.25, 0.18);
  const hair = ramp(L.hair, -0.3, 0.3);
  const x = p.x;
  const y = p.y;
  // neck
  P.limb({ x: x - 1, y: y + 9 }, { x: x - 1, y: y + 14 }, 7, 7, skin, false);
  // skull and face: back of the head round, face a little flatter with a chin
  P.ell(x - 1, y, 9.5, 10, skin.dark);
  P.ell(x + 0.5, y + 0.5, 8.5, 9.5, skin.base);
  P.poly(
    [
      { x: x + 2, y: y + 4 },
      { x: x + 9, y: y + 3 },
      { x: x + 8, y: y + 9 },
      { x: x + 3, y: y + 10 },
    ],
    skin.base,
  );
  P.ell(x + 6.5, y - 1, 2.6, 4, skin.light);
  // nose, mouth, ear
  P.poly(
    [
      { x: x + 8, y: y + 1 },
      { x: x + 11, y: y + 4.5 },
      { x: x + 8, y: y + 5 },
    ],
    skin.base,
  );
  P.rect(x + 6, y + 7, 3, 1, skin.dark);
  P.ell(x - 3, y + 1.5, 2.2, 2.8, skin.dark);
  // eye: white, iris, brow
  P.rect(x + 4, y - 1, 4, 3, '#f4f1ea');
  P.rect(x + 6, y - 1, 2, 3, '#1a1418');
  P.rect(x + 3, y - 3, 6, 1.6, hair.dark);
  if (L.beard) {
    P.poly(
      [
        { x: x - 2, y: y + 3 },
        { x: x + 9, y: y + 5 },
        { x: x + 7, y: y + 11 },
        { x: x + 1, y: y + 11 },
      ],
      hair.base,
    );
    P.rect(x + 5, y + 7, 4, 1, hair.dark);
  }
  headgear(P, L, x, y, hair);
}

/**
 * Secondary motion: loose bits (bandana tails, ponytails, hood tails, bandage ends) lag behind the body. `SWAY` is
 * how far a bit hanging a dozen pixels from its knot is pushed this frame (HD px); `drawHeroHD` sets it from the
 * pose and frame before drawing, `trail` applies it, more at the free end than near the knot.
 */
let SWAY = { dx: 0, dy: 0 };

function swayFor(pose: Pose, frame: number): { dx: number; dy: number } {
  switch (pose) {
    case 'run': {
      // streams back, flicking up and down twice per stride (once per footfall)
      const f = ((frame % 8) + 8) % 8;
      return { dx: -4, dy: [-1, 2, 3, 0, -1, 2, 3, 0][f] as number };
    }
    case 'dash':
    case 'slide':
      return { dx: -8, dy: -3 };
    case 'jump':
      return { dx: -2, dy: 5 }; // rising: the hair is left behind, below
    case 'fall':
    case 'flip':
      return { dx: -2, dy: -6 }; // falling: it lifts
    case 'melee':
      return { dx: frame === 0 ? 2 : -5, dy: frame === 0 ? -2 : 1 };
    default:
      return { dx: 0, dy: frame % 2 }; // breathing
  }
}

/** A point of a loose bit, displaced by the current sway in proportion to its distance from the knot (ax, ay). */
function trail(ax: number, ay: number, px: number, py: number): Pt {
  const k = Math.min(1.6, Math.hypot(px - ax, py - ay) / 12);
  return { x: px + SWAY.dx * k, y: py + SWAY.dy * k };
}

function headgear(P: Painter, L: Look, x: number, y: number, hair: Ramp): void {
  const c = ramp(L.color);
  const acc = L.accent;
  switch (L.headgear) {
    case 'bandana': {
      // spiky hair over a knotted bandana with streaming tails
      for (let i = 0; i < 5; i++)
        P.poly(
          [
            { x: x - 9 + i * 4, y: y - 5 },
            { x: x - 5 + i * 4, y: y - 14 - (i % 2) * 2 },
            { x: x - 1 + i * 4, y: y - 5 },
          ],
          i % 2 ? hair.base : hair.dark,
        );
      P.ell(x - 1, y - 6, 9.5, 5, hair.base);
      P.ell(x + 2, y - 8, 4, 2, hair.light);
      P.rect(x - 10, y - 4, 4, 9, hair.base);
      P.poly(
        [
          { x: x - 10, y: y - 6 },
          { x: x + 9, y: y - 5 },
          { x: x + 9, y: y - 1 },
          { x: x - 10, y: y - 1 },
        ],
        c.base,
      );
      P.rect(x - 6, y - 6, 14, 1.6, c.light);
      P.rect(x - 10, y - 2.5, 19, 1.5, c.dark);
      // the two knot tails stream behind and flick with each stride
      const kx = x - 10;
      const ky = y - 2;
      P.poly(
        [
          { x: kx, y: y - 4 },
          trail(kx, ky, x - 19, y - 2),
          trail(kx, ky, x - 17, y + 2),
          { x: kx, y: y - 1 },
        ],
        c.base,
      );
      P.poly(
        [{ x: x - 11, y: y - 2 }, trail(kx, ky, x - 21, y + 4), trail(kx, ky, x - 18, y + 6), { x: kx, y }],
        c.dark,
      );
      const tip = trail(kx, ky, x - 20, y + 1);
      P.rect(tip.x - 1, tip.y - 1, 2, 2, c.light);
      break;
    }
    case 'visor': {
      // smooth helmet with a glowing visor and a ponytail
      // a ponytail that swings: root, middle and tip, each lagging more
      const r0 = { x: x - 10, y: y - 1 };
      const m = trail(r0.x, r0.y, x - 13, y + 4);
      const t = trail(r0.x, r0.y, x - 15, y + 11);
      P.limb(r0, m, 6, 5, hair);
      P.limb(m, t, 5, 2.5, hair);
      P.ell(x - 1, y - 3, 11, 9, c.dark);
      P.ell(x, y - 4, 10, 8, c.base);
      P.ell(x + 2, y - 8, 5, 2.5, c.light);
      P.rect(x - 11, y - 1, 12, 6, c.dark);
      P.poly(
        [
          { x: x + 1, y: y - 3 },
          { x: x + 11, y: y - 3 },
          { x: x + 10, y: y + 3 },
          { x: x + 1, y: y + 3 },
        ],
        acc,
      );
      P.rect(x + 3, y - 2, 5, 1.6, shade(acc, 0.6));
      break;
    }
    case 'beret': {
      P.rect(x - 9, y - 3, 3, 8, hair.base);
      P.ell(x - 2, y - 7, 11, 5, c.dark, -0.12);
      P.ell(x - 1, y - 8, 10, 4.2, c.base, -0.12);
      P.ell(x - 4, y - 10, 5, 1.6, c.light, -0.12);
      P.rect(x - 9, y - 4, 18, 2.4, shade(L.color, -0.45));
      P.ell(x + 6, y - 6, 2, 2, '#e9c46a');
      break;
    }
    case 'hood': {
      // hood and a face mask: only the eyes show
      P.ell(x - 2, y - 1, 12, 12, c.dark);
      P.ell(x - 1, y - 2, 11, 11, c.base);
      P.ell(x - 4, y - 7, 5, 3, c.light);
      P.poly(
        [
          { x: x + 1, y: y - 4 },
          { x: x + 10, y: y - 4 },
          { x: x + 11, y: y + 9 },
          { x: x + 1, y: y + 9 },
        ],
        L.skin,
      );
      P.poly(
        [
          { x: x + 1, y: y + 2 },
          { x: x + 11, y: y + 2 },
          { x: x + 10, y: y + 10 },
          { x: x + 2, y: y + 11 },
        ],
        '#1c1726',
      );
      P.rect(x + 4, y - 2, 6, 2.6, acc);
      P.rect(x + 7, y - 2, 2, 2.6, '#ffffff');
      P.poly(
        [
          { x: x - 12, y: y + 2 },
          { x: x - 6, y: y + 8 },
          trail(x - 9, y + 5, x - 9, y + 16),
          trail(x - 9, y + 5, x - 14, y + 12),
        ],
        c.dark,
      );
      break;
    }
    case 'hardhat': {
      P.rect(x - 10, y - 3, 3, 8, hair.base);
      P.ell(x, y - 7, 10, 7, c.dark);
      P.ell(x + 0.5, y - 8, 9, 6, c.base);
      P.ell(x - 2, y - 11, 4, 2, c.light);
      P.rect(x - 12, y - 4, 25, 3, c.dark);
      P.rect(x - 12, y - 4, 25, 1, c.base);
      P.rect(x - 1, y - 14, 3, 9, shade(L.color, -0.15));
      // goggles on the brim
      P.ell(x + 4, y - 3.5, 3, 2.4, acc);
      P.ell(x - 3, y - 3.5, 3, 2.4, acc);
      P.ell(x + 4, y - 4, 1.2, 1, '#ffffff');
      break;
    }
    case 'helmet': {
      P.ell(x - 1, y - 2, 12, 11.5, '#a9b2bd');
      P.ell(x, y - 3, 11, 10.5, '#d9dee5');
      P.ell(x - 3, y - 9, 5, 2.5, '#ffffff');
      P.poly(
        [
          { x: x + 1, y: y - 3 },
          { x: x + 11, y: y - 3 },
          { x: x + 11, y: y + 6 },
          { x: x + 2, y: y + 6 },
        ],
        '#0b3c49',
      );
      P.rect(x + 3, y - 2, 6, 1.6, acc);
      P.rect(x + 3, y + 1, 3, 1, shade(acc, -0.3));
      P.rect(x - 6, y - 7, 4, 4, L.color);
      break;
    }
    case 'headset': {
      P.ell(x - 1, y - 5, 10, 6, hair.base);
      P.ell(x + 2, y - 8, 4, 2, hair.light);
      P.rect(x - 11, y - 4, 5, 15, hair.base);
      P.rect(x - 11, y + 4, 3, 7, hair.dark);
      P.rect(x + 7, y - 4, 3, 3, hair.base);
      // band and ear cup with a mic arm
      P.limb({ x: x - 8, y: y - 6 }, { x: x + 4, y: y - 11 }, 3, 3, c, false);
      P.ell(x - 3, y + 1, 4, 5, c.dark);
      P.ell(x - 2.5, y + 0.5, 3, 4, c.base);
      P.ell(x - 2.5, y + 0.5, 1.2, 1.6, acc);
      P.limb({ x: x - 1, y: y + 4 }, { x: x + 8, y: y + 8 }, 1.6, 1.6, ramp('#333333', 0, 0), false);
      P.ell(x + 8.5, y + 8, 1.6, 1.4, '#222222');
      break;
    }
    case 'cap': {
      P.rect(x - 10, y - 3, 3, 8, hair.base);
      P.ell(x - 1, y - 6, 10, 6, c.dark);
      P.ell(x, y - 7, 9, 5, c.base);
      P.ell(x - 3, y - 10, 4, 1.6, c.light);
      P.poly(
        [
          { x: x + 5, y: y - 3 },
          { x: x + 15, y: y - 2 },
          { x: x + 15, y: y },
          { x: x + 5, y: y },
        ],
        c.dark,
      );
      P.rect(x - 2, y - 8, 5, 3.6, '#3d3d3d');
      P.rect(x - 1, y - 7, 3, 1.4, acc);
      break;
    }
    case 'gasmask': {
      // a hood, a rubber mask with round glowing lenses and a filter at the mouth
      P.ell(x - 1, y - 1, 11, 11, c.dark);
      P.ell(x, y - 2, 10, 10, c.base);
      P.ell(x - 3, y - 7, 4, 2, c.light);
      P.ell(x + 5, y + 2, 6, 7, '#2a2d33');
      P.ell(x + 6, y - 1, 2.6, 2.4, acc);
      P.ell(x + 6.5, y - 1.5, 1, 0.8, '#ffffff');
      P.limb({ x: x + 7, y: y + 6 }, { x: x + 11, y: y + 9 }, 5, 5, ramp('#3a3f47', -0.4, 0.3));
      P.rect(x + 10, y + 7, 2, 4, '#1d1f24');
      break;
    }
    case 'horns':
    case 'viking': {
      const viking = L.headgear === 'viking';
      if (viking) {
        // a round iron helmet with a nose guard
        P.ell(x - 1, y - 4, 10.5, 8, '#5b6068');
        P.ell(x, y - 5, 9.5, 7, '#8a9099');
        P.ell(x - 2, y - 9, 4, 2, '#c9ced6');
        P.rect(x - 11, y - 3, 21, 2.4, '#4a4e55');
        P.rect(x + 6, y - 3, 2.4, 8, '#5b6068');
      } else {
        P.ell(x - 1, y - 5, 10, 6, hair.base);
        P.rect(x - 10, y - 4, 4, 9, hair.base);
      }
      // curved horns rising from the temples
      const bone = ramp(viking ? '#e8dcc0' : '#d9c9a3', -0.35, 0.2);
      const horn = (sx: number, dir: number) => {
        let p0 = { x: x + sx, y: y - 6 };
        for (let i = 1; i <= 5; i++) {
          const p1 = { x: x + sx + dir * i * 2.4, y: y - 6 - i * 3 + i * i * 0.25 };
          P.limb(p0, p1, 4.6 - i * 0.7, 4 - i * 0.7, bone);
          p0 = p1;
        }
      };
      horn(-6, -1);
      horn(4, 1);
      if (!viking) P.rect(x + 3, y - 3, 6, 1.6, hair.dark);
      // glowing eyes on the demons
      if (!viking) P.rect(x + 5, y - 1, 3, 2, acc);
      break;
    }
    case 'dome': {
      // a glass space helmet: a bright rim, the head inside, a curved highlight
      P.ell(x, y - 1, 13, 13, shade(acc, -0.5));
      P.ell(x, y - 1, 12, 12, shade(acc, -0.2));
      P.ell(x + 1, y, 9, 9.5, L.skin);
      P.rect(x + 5, y - 1, 3, 3, '#111111');
      P.ell(x - 4, y - 7, 4, 2.5, '#ffffff', -0.5);
      P.rect(x - 12, y + 9, 25, 3, '#4a4e55');
      break;
    }
    case 'wraps': {
      // mummy bandages round the whole head, one eye slit glowing
      P.ell(x - 1, y - 1, 10.5, 11, shade(L.vest, -0.3));
      P.ell(x, y - 1, 9.5, 10, L.vest);
      for (let k = -8; k < 10; k += 3.5) P.rect(x - 9, y + k, 19, 1.2, shade(L.vest, -0.25));
      P.rect(x + 2, y - 2, 8, 2.6, '#140c08');
      P.rect(x + 5, y - 2, 3, 2.6, acc);
      P.limb({ x: x - 9, y: y + 4 }, trail(x - 9, y + 4, x - 15, y + 12), 3, 2, ramp(L.vest, -0.3, 0.2));
      break;
    }
    case 'jackal': {
      // a jackal head: long snout forward, tall pointed ears
      const fur = ramp('#1f1a17', -0.3, 0.35);
      P.poly(
        [
          { x: x - 5, y: y - 8 },
          { x: x - 2, y: y - 22 },
          { x: x + 1, y: y - 8 },
        ],
        fur.dark,
      );
      P.poly(
        [
          { x: x + 1, y: y - 8 },
          { x: x + 4, y: y - 21 },
          { x: x + 7, y: y - 7 },
        ],
        fur.base,
      );
      P.ell(x, y, 9.5, 9, fur.base);
      P.poly(
        [
          { x: x + 4, y: y - 2 },
          { x: x + 17, y: y + 3 },
          { x: x + 16, y: y + 6 },
          { x: x + 4, y: y + 7 },
        ],
        fur.base,
      );
      P.rect(x + 15, y + 3, 3, 2.4, '#0a0a0a');
      P.rect(x + 5, y - 3, 4, 2, acc);
      P.rect(x - 9, y + 4, 18, 3, '#c9a24a');
      break;
    }
    case 'nemes': {
      // the pharaoh's striped headcloth with lappets falling to the shoulders
      const gold = '#d4a72c';
      const blue = '#1e3a8a';
      P.poly(
        [
          { x: x - 11, y: y - 4 },
          { x: x + 7, y: y - 10 },
          { x: x + 9, y: y - 3 },
          { x: x - 2, y: y + 14 },
          { x: x - 12, y: y + 12 },
        ],
        gold,
      );
      for (let k = 0; k < 6; k++)
        P.poly(
          [
            { x: x - 11 + k * 3, y: y - 5 - k * 0.8 },
            { x: x - 9.5 + k * 3, y: y - 5.6 - k * 0.8 },
            { x: x - 5 + k * 1.5, y: y + 13 },
            { x: x - 6.5 + k * 1.5, y: y + 13 },
          ],
          blue,
        );
      P.ell(x + 7, y - 7, 2, 2, acc);
      break;
    }
    case 'crest': {
      // a sea creature's fin crest from brow to nape
      const fin = ramp(acc, -0.35, 0.25);
      P.ell(x - 1, y - 4, 10, 6, hair.base);
      for (let i = 0; i < 5; i++)
        P.poly(
          [
            { x: x - 9 + i * 4, y: y - 7 },
            { x: x - 10 + i * 4, y: y - 18 + Math.abs(i - 2) * 2 },
            { x: x - 5 + i * 4, y: y - 7 },
          ],
          i % 2 ? fin.base : fin.light,
        );
      P.poly(
        [
          { x: x - 9, y: y - 2 },
          { x: x - 15, y: y + 2 },
          { x: x - 9, y: y + 5 },
        ],
        fin.dark,
      );
      P.rect(x + 5, y - 1, 3, 2, acc);
      break;
    }
    case 'alien': {
      // a tall bulbous skull and huge dark eyes
      const sk = ramp(L.skin, -0.3, 0.25);
      P.ell(x - 2, y - 6, 11, 13, sk.dark);
      P.ell(x - 1, y - 7, 10, 12, sk.base);
      P.ell(x - 4, y - 13, 4, 3, sk.light);
      P.ell(x + 5, y - 1, 3.6, 5, '#05070a', 0.4);
      P.ell(x + 6, y - 3, 1, 1.4, acc);
      break;
    }
    default: {
      // short hair
      P.ell(x - 1, y - 5, 10, 6, hair.base);
      P.ell(x + 2, y - 8, 4, 2, hair.light);
      P.rect(x - 10, y - 4, 4, 8, hair.base);
    }
  }
}

/** The rifle, `len` long, its stock at `o`, pointing along `ang`. Returns the points the hands hold and the muzzle. */
function drawRifle(P: Painter, o: Pt, ang: number, L: Look): { grip: Pt; fore: Pt; muzzle: Pt } {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const at = (u: number, v: number): Pt => ({ x: o.x + u * c - v * s, y: o.y + u * s + v * c });
  const body = L.enemy ? ramp('#2b2e33', -0.45, 0.3) : METAL;
  const quad = (u0: number, v0: number, u1: number, v1: number, col: string) =>
    P.poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], col);
  const w = L.weapon ?? 'gun';
  if (w === 'spear' || w === 'staff') {
    // a long shaft held in both hands; a spear ends in a blade, a staff in a glowing orb
    const wood = ramp(w === 'staff' ? '#5b3a1e' : '#6b4a2b', -0.35, 0.25);
    quad(-18, -1.6, 34, 1.6, wood.dark);
    quad(-18, -1.6, 34, 0, wood.base);
    if (w === 'spear') {
      const blade = ramp('#c9ced6', -0.4, 0.35);
      P.poly([at(33, -3.4), at(46, 0), at(33, 3.4)], blade.dark);
      P.poly([at(33, -3.2), at(45, 0), at(34, 0)], blade.light);
      quad(31, -2.6, 34, 2.6, L.accent);
      return { grip: at(6, 1.5), fore: at(18, 1.5), muzzle: at(46, 0) };
    }
    P.ell(at(37, 0).x, at(37, 0).y, 5, 5, shade(L.accent, -0.4));
    P.ell(at(37, 0).x, at(37, 0).y, 3.6, 3.6, L.accent);
    P.ell(at(36, -1).x, at(36, -1).y, 1.4, 1.4, '#ffffff');
    quad(31, -3, 33, 3, '#c9a24a');
    return { grip: at(6, 1.5), fore: at(18, 1.5), muzzle: at(37, 0) };
  }
  if (w === 'raygun') {
    // a stubby ray pistol with a glowing coil
    quad(2, -3, 20, 3, body.dark);
    quad(2, -3, 20, 0, body.base);
    for (let i = 0; i < 3; i++) quad(8 + i * 4, -4, 10 + i * 4, 4, L.accent);
    quad(20, -2, 26, 2, shade(L.accent, -0.3));
    P.ell(at(26, 0).x, at(26, 0).y, 2.4, 2.4, L.accent);
    quad(5, 3, 9, 9, body.dark);
    return { grip: at(6, 4), fore: at(15, 2), muzzle: at(27, 0) };
  }
  // stock, body, magazine, barrel, sight
  quad(-6, -1, 2, 4, body.dark);
  quad(-5, -1, 2, 2, body.base);
  quad(2, -3, 20, 3, body.dark);
  quad(2, -3, 20, 0.5, body.base);
  quad(3, -3, 19, -1.8, body.light);
  quad(9, 3, 13, 9, body.dark);
  quad(9, 3, 11, 8, body.base);
  quad(20, -2, 34, 1, body.dark);
  quad(20, -2, 34, -0.6, body.light);
  quad(6, -6, 11, -3, body.dark);
  // the hero's colour stripe
  if (!L.enemy) quad(13, -3, 19, -1.6, L.accent);
  return { grip: at(6, 3), fore: at(17, 2), muzzle: at(35, -0.5) };
}

// ------------------------------------------------------------------ the whole figure

export function drawHeroHD(L: Look, pose: Pose, frame: number, aim: Aim): CharFrame {
  if (pose === 'down') return knockedOut(L);
  const P = new Painter();
  const R = rig(pose, frame, aim);
  SWAY = swayFor(pose, frame);
  const pants = ramp(L.pants, -0.36, 0.2);
  const skin = ramp(L.skin, -0.25, 0.18);
  const sleeve = ramp(L.color);
  const hip = R.hip;
  const neck = { x: hip.x + Math.sin(R.lean) * TORSO, y: hip.y - Math.cos(R.lean) * TORSO };
  // running, the shoulders counter-swing against the hips (a pixel each way) and the head settles a frame late
  const rf = ((frame % 8) + 8) % 8;
  const swing = pose === 'run' ? ([0, 1, 1, 0, 0, -1, -1, 0][rf] as number) : 0;
  const headLag =
    pose === 'run' ? ((RUN_BOB[(rf + 7) % 8] as number) >= 3 ? 1 : 0) : pose === 'jump' ? -1 : 0;
  const shoulderF = { x: neck.x + 1 + swing, y: neck.y + 4 };
  const shoulderB = { x: neck.x - 4 - swing, y: neck.y + 3 };
  // the rifle sits against the chest, its stock at the near shoulder, turned by the aim
  const stock = {
    x: shoulderF.x + 3 + Math.sin(R.aim) * 2,
    y: shoulderF.y + 4 - Math.max(0, -Math.sin(R.aim)) * 2,
  };
  // far arm and far leg first, darker
  const rifleProbe = (() => {
    const c = Math.cos(R.aim);
    const s = Math.sin(R.aim);
    return { fore: { x: stock.x + 17 * c - 2 * s, y: stock.y + 17 * s + 2 * c } };
  })();
  const farSleeve = ramp(sleeve.dark, -0.15, 0.1);
  const farSkin = ramp(skin.dark, -0.1, 0.1);
  const eB = elbow(shoulderB, rifleProbe.fore, UPPER_ARM, FOREARM + 4);
  P.limb(shoulderB, eB, 7, 6, farSleeve);
  P.limb(eB, rifleProbe.fore, 6, 5, farSkin);
  drawLeg(P, { x: hip.x - 2, y: hip.y }, R.back, pants, true);
  if (!L.enemy) drawQuiver(P, hip, L, R.lean);
  drawTorso(P, hip, neck, L, R.lean);
  drawLeg(P, { x: hip.x + 2, y: hip.y }, R.front, pants, false);
  if (!L.enemy) drawSash(P, hip, L, R.lean);
  drawHead({ x: neck.x + 1, y: neck.y - 11 + headLag }, P, L);
  const gun = drawRifle(P, stock, R.aim, L);
  if (pose === 'melee') {
    // the near arm carries the knife: frame 0 winds up over the shoulder, frame 1 slashes straight out
    const hand =
      frame === 0 ? { x: shoulderF.x - 4, y: shoulderF.y - 10 } : { x: shoulderF.x + 21, y: shoulderF.y + 1 };
    const eK = elbow(shoulderF, hand, UPPER_ARM, FOREARM);
    const rimK = shade(L.color, -0.62);
    P.limb(shoulderF, eK, 8, 7, sleeve, true, rimK);
    P.limb(eK, hand, 7, 6, skin, true, rimK);
    const dir = frame === 0 ? { x: 0.25, y: -1 } : { x: 1, y: 0.04 };
    const tip = { x: hand.x + dir.x * 22, y: hand.y + dir.y * 22 };
    P.limb({ x: hand.x + dir.x * 4, y: hand.y + dir.y * 4 }, tip, 4, 1.5, ramp('#d8dde3', -0.35, 0.4));
    P.limb(
      { x: hand.x - dir.y * 4, y: hand.y + dir.x * 4 },
      { x: hand.x + dir.y * 4, y: hand.y - dir.x * 4 },
      2.5,
      2.5,
      METAL,
      false,
    );
    P.ell(hand.x, hand.y, 3.2, 3, '#2b2622');
    P.ell(shoulderF.x, shoulderF.y + 1, 4.5, 4, sleeve.base);
    return { img: P.finish(), muzzleX: (tip.x - HD_CENTER) / HD, muzzleY: (tip.y - HD_FEET) / HD };
  }
  // near arm on the grip, with a glove
  const eF = elbow(shoulderF, gun.grip, UPPER_ARM, FOREARM);
  const armRim = shade(L.color, -0.62);
  P.limb(shoulderF, eF, 8, 7, sleeve, true, armRim);
  P.limb(eF, gun.grip, 7, 6, skin, true, armRim);
  P.ell(gun.grip.x, gun.grip.y, 3.2, 3, '#2b2622');
  P.ell(gun.fore.x, gun.fore.y, 3, 2.8, '#2b2622');
  // shoulder pad in the hero's colour
  P.ell(shoulderF.x, shoulderF.y + 1, 4.5, 4, sleeve.base);
  P.ell(shoulderF.x + 1, shoulderF.y, 2.5, 2, sleeve.light);
  if (!L.enemy) {
    // a warrior's gold: a rim on the shoulder guard and a band round the upper arm
    P.ell(shoulderF.x, shoulderF.y + 4, 4.5, 1.4, GOLD.base);
    P.ell(shoulderF.x + 1.5, shoulderF.y + 3.8, 1.6, 0.8, GOLD.light);
    const band = {
      x: shoulderF.x + (eF.x - shoulderF.x) * 0.62,
      y: shoulderF.y + (eF.y - shoulderF.y) * 0.62,
    };
    const across = Math.atan2(eF.y - shoulderF.y, eF.x - shoulderF.x) + Math.PI / 2;
    P.ell(band.x, band.y, 4.2, 1.7, GOLD.base, across);
    P.ell(band.x + 0.6, band.y - 0.4, 1.4, 0.8, GOLD.light, across);
  }
  const img = P.finish();
  return {
    img,
    muzzleX: (gun.muzzle.x - HD_CENTER) / HD,
    muzzleY: (gun.muzzle.y - HD_FEET) / HD,
  };
}

/** Knocked out: the falling pose, laid on its back on the ground (head towards the back). */
function knockedOut(L: Look): CharFrame {
  const upright = drawHeroHD(L, 'fall', 0, 'df').img;
  const c = document.createElement('canvas');
  c.width = 120; // lying down is longer than standing is wide
  c.height = HD_H;
  const g = c.getContext('2d');
  if (g) {
    g.imageSmoothingEnabled = false;
    // a quarter turn: the head goes to the back (left), the chest faces up, the back rests on the ground line
    g.translate(36, 63);
    g.rotate(-Math.PI / 2);
    g.drawImage(upright, -57, -HD_CENTER);
  }
  hdCanvases.add(c);
  return { img: c, muzzleX: 0, muzzleY: -6 };
}

/** Where the two ankles are in a pose (HD pixels), for tests: feet must never sink below the ground. */
export function anklesOf(pose: Pose, frame: number): { front: Pt; back: Pt } {
  const R = rig(pose, frame, 'f');
  const ankle = (dx: number, l: Leg): Pt =>
    polar(polar({ x: R.hip.x + dx, y: R.hip.y }, THIGH, l.thigh), SHIN, l.thigh - l.bend);
  return { front: ankle(2, R.front), back: ankle(-2, R.back) };
}
