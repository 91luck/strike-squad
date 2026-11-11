import type { ZoneStyle } from './world-art';

/**
 * Ground and platform tiles in high definition: 64 px for a 32 px tile, painted pixel by pixel.
 *
 * Every material is built from the same few ideas, the ones hand-made tilesets use:
 * - a seamless noise field (it repeats every tile, so neighbouring tiles always join) breaks flat colour into
 *   three-tone clumps;
 * - cut materials (brick, stone, metal) get a bevel: a lit top-left edge, a shaded bottom-right edge, and dark
 *   recessed joints;
 * - details that never cross a tile edge (pebbles, rivets, glyphs, bubbles) vary with the tile's variant;
 * - a top tile carries its surface (grass, snow, crust, moss) with a ragged underside and a band of shade beneath
 *   it, and grass blades that rise above the tile (the canvas is taller than the tile for them).
 */

export const TILE_HD = 64;
/** Extra rows above a top tile for grass and snow poking above the ground line. */
export const TILE_HD_LIP = 12;

type RGB = [number, number, number];

function rgb(c: string): RGB {
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g) ?? [];
    return [Number(m[0] ?? 0), Number(m[1] ?? 0), Number(m[2] ?? 0)];
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

function tone([r, g, b]: RGB, amt: number): RGB {
  if (amt >= 0) return [r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt * 0.85];
  const k = 1 + amt;
  return [r * k, g * k, Math.min(255, b * k + 10 * -amt)];
}

/** Small seeded random numbers. */
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

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise that repeats every `period` pixels in x and y (so tiles join seamlessly). */
function periodicNoise(x: number, y: number, cell: number, period: number, seed: number): number {
  const n = period / cell;
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const v = (i: number, j: number) => hash(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
  const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

/**
 * The noise field repeats every BLOCK tiles, not every tile, so the ground shows no grid: each tile is cut from
 * its place in a BLOCK x BLOCK patch (`at` sets which), and neighbours still join because the field is one piece.
 */
export const BLOCK = 4;
const PERIOD = TILE_HD * BLOCK;
let OX = 0;
let OY = 0;
function at(cx: number, cy: number): void {
  OX = (((cx % BLOCK) + BLOCK) % BLOCK) * TILE_HD;
  OY = (((cy % BLOCK) + BLOCK) % BLOCK) * TILE_HD;
}

function fbm(x: number, y: number, seed: number): number {
  x += OX;
  y += OY;
  return (
    periodicNoise(x, y, 16, PERIOD, seed) * 0.55 +
    periodicNoise(x, y, 8, PERIOD, seed + 1) * 0.3 +
    periodicNoise(x, y, 4, PERIOD, seed + 2) * 0.15
  );
}

/** One-dimensional seamless noise along the ground (for grass and strata edges). */
function noise1(x: number, cell: number, seed: number): number {
  return periodicNoise(x + OX, 0, cell, PERIOD, seed);
}

function hashAt(x: number, y: number, seed: number): number {
  return hash(x + OX, y + OY, seed);
}

/** A pixel buffer with the tile's origin TILE_HD_LIP rows down (row 0 of the tile = top of the ground). */
class Buf {
  readonly w = TILE_HD;
  readonly h: number;
  readonly data: Uint8ClampedArray;
  constructor(readonly lip: number) {
    this.h = TILE_HD + lip;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.round(x);
    y = Math.round(y) + this.lip;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a < 255) {
      const k = a / 255;
      const old = this.data[i + 3] as number;
      this.data[i] = (this.data[i] as number) * (1 - k) + c[0] * k;
      this.data[i + 1] = (this.data[i + 1] as number) * (1 - k) + c[1] * k;
      this.data[i + 2] = (this.data[i + 2] as number) * (1 - k) + c[2] * k;
      this.data[i + 3] = Math.max(old, a);
      return;
    }
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }
  get(x: number, y: number): RGB {
    const i = ((Math.round(y) + this.lip) * this.w + Math.round(x)) * 4;
    return [this.data[i] as number, this.data[i + 1] as number, this.data[i + 2] as number];
  }
  shadeAt(x: number, y: number, amt: number): void {
    if (x < 0 || y < -this.lip || x >= this.w || y >= TILE_HD) return;
    const i = ((y + this.lip) * this.w + x) * 4;
    if (!this.data[i + 3]) return;
    this.set(x, y, tone(this.get(x, y), amt));
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** A small stone: shaded ellipse, lit top-left, dark rim below. */
  pebble(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = -ry - 1; y <= ry + 1; y++)
      for (let x = -rx - 1; x <= rx + 1; x++) {
        const d = (x / rx) ** 2 + (y / ry) ** 2;
        if (d > 1.25) continue;
        if (d > 1) {
          if (y >= 0) this.set(cx + x, cy + y, tone(c, -0.55));
          continue;
        }
        const lit = -(x / rx) * 0.4 - (y / ry) * 0.6;
        this.set(cx + x, cy + y, tone(c, lit > 0.35 ? 0.28 : lit < -0.3 ? -0.25 : 0));
      }
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d');
    if (g) {
      const img = g.createImageData(this.w, this.h);
      img.data.set(this.data);
      g.putImageData(img, 0, 0);
    }
    return c;
  }
}

const N = TILE_HD;

/** Three-tone clumps of `base` (dark, mid, light) from the seamless noise field. */
function clumps(b: Buf, base: RGB, dark: RGB, seed: number, lo = 0.36, hi = 0.66): void {
  const light = tone(base, 0.07);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const n = fbm(x, y, seed);
      b.set(x, y, n < lo ? dark : n > hi ? light : base);
      // grain: single darker and lighter specks
      const h = hashAt(x, y, seed + 9);
      if (h < 0.012) b.set(x, y, tone(dark, -0.15));
      else if (h > 0.992) b.set(x, y, tone(light, 0.12));
    }
}

/** A bevelled block from (x0, y0) size w x h (may wrap past the tile's right edge). */
function block(
  b: Buf,
  x0: number,
  y0: number,
  w: number,
  h: number,
  face: RGB,
  joint: RGB,
  seed: number,
): void {
  for (let y = y0; y < y0 + h; y++)
    for (let xx = x0; xx < x0 + w; xx++) {
      const x = ((xx % N) + N) % N;
      const lx = xx - x0;
      const ly = y - y0;
      let c: RGB;
      if (lx === 0 || ly === 0 || lx === w - 1 || ly === h - 1) c = joint;
      else if (ly <= 2 || lx === 1) c = tone(face, 0.18);
      else if (ly >= h - 3 || lx === w - 2) c = tone(face, -0.22);
      else {
        const n = fbm(x, y, seed);
        c = n < 0.38 ? tone(face, -0.08) : n > 0.66 ? tone(face, 0.06) : face;
        if (hash(x, y, seed) < 0.02) c = tone(face, -0.25);
      }
      b.set(x, y, c);
    }
}

/** The surface layer of a top tile: ragged underside, lit crown, darker roots, and a band of shade beneath. */
function surface(b: Buf, top: RGB, light: RGB, depth: number, seed: number, blades: boolean): void {
  const dark = tone(top, -0.28);
  const under = (x: number): number =>
    depth + Math.round(noise1(x, 8, seed) * 5 + (hashAt(x, 1, seed) < 0.18 ? 3 : 0));
  for (let x = 0; x < N; x++) {
    const d = under(x);
    for (let y = 0; y < d; y++) {
      let c = y < 3 ? light : y > d - 3 ? dark : top;
      if (y >= 3 && y <= d - 3 && fbm(x, y, seed + 4) < 0.35) c = tone(top, -0.12);
      if (y < 3 && hashAt(x, y, seed) < 0.15) c = top;
      b.set(x, y, c);
    }
    // shade cast on the ground just below
    for (let y = d; y < d + 3; y++) b.shadeAt(x, y, -0.25 + (y - d) * 0.07);
    if (blades && hashAt(x, 5, seed) < 0.55) {
      const h = 2 + Math.floor(hashAt(x, 6, seed) * 9);
      const lean = hashAt(x, 7, seed) < 0.5 ? -1 : 1;
      for (let i = 1; i <= h; i++) {
        const xx = x + (i > h / 2 ? lean : 0);
        b.set(xx, -i, i > h - 2 ? light : i > h / 2 ? top : dark);
      }
    }
  }
}

function groundGrass(b: Buf, z: ZoneStyle, top: boolean, v: number, seed: number): void {
  const dirt = rgb(z.dirt);
  const dark = rgb(z.dirtDark);
  clumps(b, dirt, dark, seed);
  // a faint stratum and a few pebbles or a root
  for (let x = 0; x < N; x++) {
    const y = 44 + Math.round(noise1(x, 16, seed + 3) * 4);
    b.shadeAt(x, y, -0.12);
    b.shadeAt(x, y + 1, -0.12);
  }
  const r = rng(seed * 31 + v);
  const stone = rgb('#8f877a');
  for (let i = 0; i < 1 + (v % 3); i++)
    b.pebble(
      8 + r() * 48,
      (top ? 26 : 8) + r() * 30,
      2 + Math.floor(r() * 3),
      2 + Math.floor(r() * 2),
      stone,
    );
  if (top && v % 2 === 1) {
    // a root curling down from the grass
    let x = 10 + r() * 44;
    for (let y = 14; y < 34; y++) {
      b.set(x, y, tone(dark, -0.2));
      b.set(x + 1, y, tone(dark, 0.05));
      x += Math.sin(y * 0.5 + v) * 0.8;
    }
  }
  if (top) surface(b, rgb(z.top), rgb(z.topLight), 12, seed, z.tufts !== false);
}

function groundBrick(b: Buf, z: ZoneStyle, top: boolean, seed: number): void {
  const face = rgb(z.dirt);
  const joint = tone(rgb(z.dirtDark), -0.2);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 16 : 0;
    for (let k = -1; k < 2; k++) {
      const shade = (hash(k + 4, row, seed) - 0.5) * 0.14;
      block(b, k * 32 + off, row * 16, 32, 16, tone(face, shade), joint, seed + row * 7 + k);
    }
  }
  if (top) surface(b, rgb(z.top), rgb(z.topLight), 8, seed, false);
}

function groundPlate(b: Buf, z: ZoneStyle, top: boolean, seed: number): void {
  const face = rgb(z.dirt);
  const joint = tone(rgb(z.dirtDark), -0.25);
  block(b, 0, 0, N, 32, face, joint, seed);
  block(b, 0, 32, N, 32, tone(face, -0.04), joint, seed + 3);
  // rivets
  for (const [x, y] of [
    [5, 5],
    [58, 5],
    [5, 26],
    [58, 26],
    [5, 37],
    [58, 37],
    [5, 58],
    [58, 58],
  ] as const) {
    b.set(x, y, tone(face, 0.45));
    b.set(x + 1, y, tone(face, 0.2));
    b.set(x, y + 1, tone(face, 0.2));
    b.set(x + 1, y + 1, tone(face, -0.4));
  }
  // scratches and grime towards the bottom
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const x0 = 10 + r() * 40;
    const y0 = 8 + r() * 44;
    for (let k = 0; k < 8; k++) b.shadeAt(Math.round(x0 + k), Math.round(y0 + k * 0.4), 0.22);
  }
  for (let y = 44; y < N; y++)
    for (let x = 0; x < N; x++) if (hash(x, y, seed) < (y - 44) / 90) b.shadeAt(x, y, -0.1);
  if (top) {
    if (z.space) {
      b.rect(0, 0, N, 4, rgb(z.topLight));
      b.rect(0, 4, N, 2, rgb('#67e8f9'));
      for (let i = 0; i < 4; i++) b.rect(6 + i * 16, 7, 6, 2, rgb('#a78bfa'));
    } else {
      // diagonal hazard stripes with a bevel
      for (let y = 0; y < 9; y++)
        for (let x = 0; x < N; x++) {
          const yellow = Math.floor((x + y) / 8) % 2 === 0;
          let c = yellow ? rgb('#f4c430') : rgb('#1d1d1d');
          if (y === 0) c = tone(c, 0.3);
          if (y === 8) c = tone(c, -0.4);
          b.set(x, y, c);
        }
      b.rect(0, 9, N, 2, rgb('#151515'));
    }
  }
}

function groundStone(b: Buf, z: ZoneStyle, top: boolean, v: number, seed: number, marble: boolean): void {
  const face = rgb(z.dirt);
  const joint = tone(rgb(z.dirtDark), -0.1);
  const off = v % 2 ? 32 : 0;
  block(b, off, 0, N, 32, face, joint, seed);
  block(b, off + 32, 32, N, 32, tone(face, -0.05), joint, seed + 5);
  const r = rng(seed * 13 + v);
  if (marble) {
    // veins: thin dark lines that wander
    for (let i = 0; i < 2; i++) {
      let x = r() * N;
      for (let y = 3 + r() * 10; y < 61; y += 1) {
        b.shadeAt(Math.round(x), Math.round(y), -0.16);
        if (r() < 0.3) b.shadeAt(Math.round(x) + 1, Math.round(y), -0.08);
        x += (r() - 0.5) * 2.2;
        if (x < 2 || x > 61) break;
      }
    }
  } else if (v % 4 === 1 || v % 4 === 3) {
    // a carved glyph: cut lines, dark with a lit lower lip
    const gx = 18 + Math.floor(r() * 20);
    const gy = top ? 38 : 10 + Math.floor(r() * 8);
    const cut = (x: number, y: number) => {
      b.set(x, y, tone(face, -0.4));
      b.set(x, y + 1, tone(face, 0.2));
    };
    if (v % 4 === 1) {
      for (let x = 0; x < 16; x++) cut(gx + x, gy + 5 + Math.round(Math.sin((x / 15) * Math.PI) * -4));
      for (let x = 0; x < 16; x++) cut(gx + x, gy + 5 + Math.round(Math.sin((x / 15) * Math.PI) * 3));
      b.pebble(gx + 8, gy + 5, 2, 2, tone(face, -0.4));
    } else {
      for (let y = 0; y < 14; y++) cut(gx + 4, gy + 6 + y);
      for (let x = 0; x < 10; x++) cut(gx + x, gy + 10);
      for (let a = 0; a < 20; a++)
        cut(
          gx + 4 + Math.round(Math.cos((a / 20) * Math.PI * 2) * 3),
          gy + 3 + Math.round(Math.sin((a / 20) * Math.PI * 2) * 3),
        );
    }
  }
  if (top) surface(b, rgb(z.top), rgb(z.topLight), marble ? 8 : 6, seed, false);
}

function groundIce(b: Buf, z: ZoneStyle, top: boolean, v: number, seed: number): void {
  const face = rgb(z.dirt);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const n = fbm(x, y, seed);
      // light streaks across the ice, like facets catching the sky
      const streak = Math.abs(((x - y * 0.6 + 400) % 26) - 13) < 1.5 && n > 0.45;
      b.set(
        x,
        y,
        streak ? tone(face, 0.35) : n < 0.4 ? tone(face, -0.12) : n > 0.66 ? tone(face, 0.1) : face,
      );
    }
  const r = rng(seed + v);
  // a crack
  let x = 8 + r() * 48;
  for (let y = top ? 16 : 2; y < 62; y++) {
    b.set(x, y, tone(face, 0.5));
    b.set(x + 1, y, tone(face, -0.25));
    x += (r() - 0.5) * 2.4;
    x = Math.max(2, Math.min(60, x));
  }
  // trapped bubbles
  for (let i = 0; i < 4; i++) {
    const bx = 6 + r() * 52;
    const by = 20 + r() * 38;
    b.set(bx, by, rgb('#ffffff'));
    b.set(bx + 1, by + 1, tone(face, 0.3));
  }
  for (let x2 = 0; x2 < N; x2++) b.set(x2, 63, tone(face, -0.35));
  if (top) {
    surface(b, rgb(z.top), rgb(z.topLight), 12, seed, false);
    // icicles under the snow lip
    for (let ix = 4; ix < N; ix += 10 + Math.floor(r() * 6)) {
      const len = 5 + Math.floor(r() * 9);
      for (let k = 0; k < len; k++) {
        const w = Math.max(0, Math.round((1 - k / len) * 2));
        for (let dx = -w; dx <= w; dx++)
          b.set(ix + dx, 14 + k, dx < 0 ? rgb('#ffffff') : tone(rgb(z.top), -0.1));
      }
    }
  }
}

function groundObsidian(b: Buf, z: ZoneStyle, top: boolean, v: number, seed: number): void {
  const face = rgb(z.dirt);
  clumps(b, face, tone(face, -0.25), seed, 0.4, 0.7);
  const r = rng(seed * 7 + v);
  // glassy facet glints
  for (let i = 0; i < 6; i++) {
    const x0 = r() * 56;
    const y0 = r() * 56;
    for (let k = 0; k < 5; k++) b.set(x0 + k, y0 + k * 0.5, tone(face, 0.4 - k * 0.05));
  }
  // a glowing lava crack: a hot core with a halo
  let x = 10 + r() * 44;
  const path: [number, number][] = [];
  for (let y = top ? 12 : 0; y < N; y++) {
    path.push([Math.round(x), y]);
    x += (r() - 0.5) * 2.6;
    x = Math.max(3, Math.min(60, x));
  }
  for (const [px, py] of path)
    for (let dx = -3; dx <= 3; dx++) b.set(px + dx, py, rgb('#f97316'), 70 - Math.abs(dx) * 18);
  for (const [px, py] of path) {
    b.set(px, py, rgb('#fb923c'));
    b.set(px + 1, py, rgb('#f97316'));
    if (py % 5 === 0) b.set(px, py, rgb('#fde047'));
  }
  if (top) {
    surface(b, rgb(z.top), rgb(z.topLight), 8, seed, false);
    for (let i = 0; i < 6; i++) b.set(r() * N, 1 + r() * 4, rgb('#fdba74'));
  }
}

function groundHive(b: Buf, z: ZoneStyle, top: boolean, seed: number): void {
  const face = rgb(z.dirt);
  const dark = rgb(z.dirtDark);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // hex-ish cells 16 px across: distance to the nearest cell centre on a staggered grid
      let best = 99;
      for (let cy = -1; cy <= 4; cy++)
        for (let cx = -1; cx <= 4; cx++) {
          const ox = cx * 16 + (cy % 2 ? 8 : 0);
          const oy = cy * 16;
          const d = Math.hypot(x - ox, (y - oy) * 1.1);
          best = Math.min(best, d);
        }
      const c = best < 4 ? tone(dark, -0.15) : best < 6 ? dark : best < 7.5 ? tone(face, 0.15) : face;
      b.set(x, y, c);
    }
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const cx = Math.floor(r() * 4) * 16 + 8;
    const cy = Math.floor(r() * 4) * 16;
    b.pebble(cx, cy, 2, 2, rgb('#4ade80'));
  }
  if (top) surface(b, rgb(z.top), rgb(z.topLight), 8, seed, false);
}

/**
 * A ground tile in high definition: 64 wide, 64 + TILE_HD_LIP tall (the lip is empty unless `top`), for the
 * tile at column `cx`, row `cy` (only their place in a BLOCK x BLOCK patch matters).
 */
export function groundTileHD(
  z: ZoneStyle,
  zoneSeed: number,
  top: boolean,
  v: number,
  cx: number,
  cy: number,
): HTMLCanvasElement {
  at(cx, cy);
  const b = new Buf(TILE_HD_LIP);
  const seed = zoneSeed * 97 + 13;
  switch (z.ground) {
    case 'brick':
      groundBrick(b, z, top, seed);
      break;
    case 'plate':
      groundPlate(b, z, top, seed);
      break;
    case 'sandstone':
    case 'marble':
      groundStone(b, z, top, v, seed, z.ground === 'marble');
      break;
    case 'ice':
      groundIce(b, z, top, v, seed);
      break;
    case 'obsidian':
      groundObsidian(b, z, top, v, seed);
      break;
    case 'hive':
      groundHive(b, z, top, seed);
      break;
    default:
      groundGrass(b, z, top, v, seed);
  }
  return b.canvas();
}

/** Platform materials (base colour and supports), as in the classic tiles. */
const PLAT: Record<ZoneStyle['plat'], { base: string; support: string }> = {
  wood: { base: '#9a6634', support: '#6b4423' },
  metal: { base: '#5d646f', support: '#3b4048' },
  stone: { base: '#c79b5c', support: '#8a6438' },
  ice: { base: '#a5d8f0', support: '#5f9cc0' },
  marble: { base: '#e5e1d6', support: '#a8a195' },
  bone: { base: '#d6cbb0', support: '#3b1f1c' },
  chitin: { base: '#355e3b', support: '#1a2e1d' },
};

/** A one-way platform tile in high definition: 64 x 32 (a 32 x 16 tile). */
export function platformTileHD(kind: ZoneStyle['plat'], v: number): HTMLCanvasElement {
  const b = new Buf(0);
  const { base, support } = PLAT[kind];
  const face = rgb(base);
  const seed = kind.length * 101 + 7;
  const H = 18; // deck thickness
  for (let y = 0; y < H; y++)
    for (let x = 0; x < N; x++) {
      let c: RGB;
      if (kind === 'wood') {
        // planks with grain running along them
        const grain = Math.sin(x * 0.35 + periodicNoise(x, y, 8, N, seed) * 6 + y * 1.7);
        c = grain > 0.75 ? tone(face, -0.14) : grain < -0.85 ? tone(face, 0.08) : face;
        if (x % 32 === 31) c = tone(face, -0.45);
        if (x % 32 === 0) c = tone(face, 0.15);
      } else if (kind === 'metal') {
        // a grating: dark slots in a bevelled frame
        const slot = y >= 5 && y <= 12 && x % 12 >= 3 && x % 12 <= 8;
        c = slot ? rgb('#1f2329') : face;
        if (slot && y === 5) c = rgb('#14171b');
      } else {
        const n = fbm(x, y, seed);
        c = n < 0.38 ? tone(face, -0.1) : n > 0.66 ? tone(face, 0.07) : face;
        if (x === (v % 2 ? 20 : 44)) c = tone(face, -0.35);
      }
      if (y < 2) c = tone(c, 0.3);
      else if (y === 2) c = tone(c, 0.12);
      if (y >= H - 3) c = tone(c, -0.28);
      if (y === H - 1) c = tone(face, -0.55);
      b.set(x, y, c);
    }
  if (kind === 'wood')
    for (const x of [6, 25, 38, 57]) {
      b.set(x, 8, rgb('#e7e3d8'));
      b.set(x, 9, rgb('#6b6458'));
    }
  else if (kind === 'stone' || kind === 'marble') {
    for (let x = 0; x < N; x++) {
      b.set(x, 8, rgb(kind === 'stone' ? '#1d4ed8' : '#b7791f'));
      b.set(x, 9, tone(rgb(kind === 'stone' ? '#1d4ed8' : '#b7791f'), -0.4));
    }
  } else if (kind === 'ice') {
    for (let x = 6 + (v % 3) * 16; x < 18 + (v % 3) * 16; x++) b.set(x, 4, rgb('#ffffff'));
    for (let x = 6; x < N; x += 18)
      for (let k = 0; k < 6 + (x % 5); k++) {
        b.set(x, H + k, k < 2 ? face : tone(face, 0.2));
        if (k < 3) b.set(x + 1, H + k, tone(face, -0.2));
      }
  } else if (kind === 'bone') {
    for (let x = 4; x < N; x += 10) for (let y = 4; y < 14; y++) b.set(x, y, tone(face, -0.35));
    b.pebble(30, 8, 2, 2, rgb('#1a0505'));
    b.pebble(37, 8, 2, 2, rgb('#1a0505'));
  } else if (kind === 'chitin') {
    for (let x = 6; x < N; x += 16) b.pebble(x, 8, 2, 2, rgb('#86efac'));
  }
  if (v % 2 === 0 && kind !== 'ice') {
    const s = rgb(support);
    for (const x0 of [10, 48])
      for (let y = H; y < 32; y++)
        for (let x = 0; x < 6; x++) b.set(x0 + x, y, x === 0 ? tone(s, 0.2) : x === 5 ? tone(s, -0.35) : s);
  }
  return b.canvas();
}

/**
 * Scale2x (EPX): doubles a pixel-art picture, rounding its stair-step edges into smooth diagonals instead of
 * blowing each pixel up into a block. Used for props drawn at the classic resolution, so they sit next to the
 * high-definition ground without looking blocky. Colours are kept exactly (no blur).
 */
export function scale2x(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const out = document.createElement('canvas');
  out.width = w * 2;
  out.height = h * 2;
  const sg = src.getContext('2d');
  const og = out.getContext('2d');
  if (!sg || !og || !w || !h) return out;
  const s = new Uint32Array(sg.getImageData(0, 0, w, h).data.buffer);
  const img = og.createImageData(w * 2, h * 2);
  const d = new Uint32Array(img.data.buffer);
  const P = (x: number, y: number): number =>
    s[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] as number;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = P(x, y);
      const A = P(x, y - 1);
      const B = P(x + 1, y);
      const C = P(x - 1, y);
      const D = P(x, y + 1);
      const o = y * 2 * w * 2 + x * 2;
      d[o] = C === A && C !== D && A !== B ? A : p;
      d[o + 1] = A === B && A !== C && B !== D ? B : p;
      d[o + w * 2] = D === C && D !== B && C !== A ? C : p;
      d[o + w * 2 + 1] = B === D && B !== A && D !== C ? D : p;
    }
  og.putImageData(img, 0, 0);
  return out;
}
