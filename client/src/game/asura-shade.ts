/**
 * Shaded drawing for the Astra Saga bosses (asura-art.ts).
 *
 * Same calls and signatures as boss-art's `poly`, `ell` and `limb`, but every part is painted the way the HD
 * heroes are: three hard tone bands of its colour (light, base, dark), lit from the front and above, a rim of
 * light along the lit edges, and the ink outline. The front is the way the boss faces, so `setLight(e.f)` is
 * called at the start of each boss drawing. Tiny parts (eyes, studs, slits) stay flat: shading them only blurs
 * them. Everything is canvas paths and gradients (no pixel reads), cheap enough to run every frame; the
 * renderer's pixel layer then puts it on the sprites' pixel grid.
 */

type Ctx = CanvasRenderingContext2D;
const INK = '#120f17';

let face = 1;

/** Which way the boss faces (1 right, -1 left): the light comes from the front and above. */
export function setLight(f: number): void {
  face = f < 0 ? -1 : 1;
}

interface Tones {
  light: string;
  base: string;
  dark: string;
  rim: string;
}

const tones = new Map<string, Tones | null>();

function parse(c: string): [number, number, number, number] | null {
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((x) => x + x)
        .join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return null;
  const p = (m[1] as string).split(',').map((x) => Number(x.trim()));
  if (p.length < 3 || p.some((x) => Number.isNaN(x))) return null;
  return [p[0] as number, p[1] as number, p[2] as number, p[3] ?? 1];
}

/** Light, base and dark tones of a colour (shadows a little cooler, lights a little warmer), cached. */
function ramp(c: string): Tones | null {
  if (tones.has(c)) return tones.get(c) ?? null;
  const p = parse(c);
  let t: Tones | null = null;
  if (p) {
    const [r, g, b, a] = p;
    const css = (x: number, y: number, z: number) =>
      `rgba(${Math.round(Math.max(0, Math.min(255, x)))},${Math.round(Math.max(0, Math.min(255, y)))},${Math.round(Math.max(0, Math.min(255, z)))},${a})`;
    const up = (k: number) => css(r + (255 - r) * k, g + (255 - g) * k * 0.95, b + (255 - b) * k * 0.8);
    const down = (k: number) => css(r * (1 - k), g * (1 - k) * 1.0, b * (1 - k) + 18 * k);
    t = { light: up(0.22), base: css(r, g, b), dark: down(0.34), rim: up(0.5) };
  }
  if (tones.size > 600) tones.clear();
  tones.set(c, t);
  return t;
}

/** Three hard bands across a box, from its lit corner (front, top) to its shaded one (back, bottom). */
function bands(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: Tones): CanvasGradient {
  const fx = face > 0 ? x1 : x0;
  const bx = face > 0 ? x0 : x1;
  // mostly top-to-bottom, tilted towards the front
  const g = ctx.createLinearGradient(fx * 0.35 + bx * 0.65, y0, bx * 0.8 + fx * 0.2, y1);
  g.addColorStop(0, t.light);
  g.addColorStop(0.3, t.light);
  g.addColorStop(0.3, t.base);
  g.addColorStop(0.66, t.base);
  g.addColorStop(0.66, t.dark);
  g.addColorStop(1, t.dark);
  return g;
}

const SMALL = 7;

export function poly(ctx: Ctx, pts: number[], fill: string, ink = true): void {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] as number;
    const y = pts[i + 1] as number;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  ctx.closePath();
  if (ink) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  const t = x1 - x0 >= SMALL && y1 - y0 >= SMALL ? ramp(fill) : null;
  ctx.fillStyle = t ? bands(ctx, x0, y0, x1, y1, t) : fill;
  ctx.fill();
  if (t) rimPoly(ctx, pts, t);
}

export function ell(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  ink = true,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  if (ink) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const r = Math.max(Math.abs(rx), Math.abs(ry));
  const t = Math.min(Math.abs(rx), Math.abs(ry)) * 2 >= SMALL ? ramp(fill) : null;
  ctx.fillStyle = t ? bands(ctx, x - r, y - r, x + r, y + r, t) : fill;
  ctx.fill();
  if (t) {
    // the lit arc (front and top), drawn just inside the edge
    const mid = Math.atan2(-1, face) - rot;
    ctx.beginPath();
    ctx.ellipse(x - face * 2, y + 2, Math.abs(rx), Math.abs(ry), rot, mid - 1.1, mid + 1.1);
    ctx.strokeStyle = t.rim;
    ctx.lineWidth = 2;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.85;
    ctx.stroke();
    ctx.globalAlpha = a;
  }
}

/**
 * A light edge along the lit sides of a polygon: only the edges that face the light (front and above) are
 * stroked, moved a little into the shape. No clipping: clip-and-restore per part cost over 30 ms a frame on
 * software-rendered canvases (measured), which made boss fights stutter.
 */
function rimPoly(ctx: Ctx, pts: number[], t: Tones): void {
  const n = pts.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area +=
      (pts[i * 2] as number) * (pts[j * 2 + 1] as number) -
      (pts[j * 2] as number) * (pts[i * 2 + 1] as number);
  }
  const wind = area >= 0 ? 1 : -1;
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2] as number;
    const ay = pts[i * 2 + 1] as number;
    const bx = pts[j * 2] as number;
    const by = pts[j * 2 + 1] as number;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 4) continue;
    // outward normal of this edge, and how squarely it faces the light
    const nx = ((by - ay) / len) * wind;
    const ny = (-(bx - ax) / len) * wind;
    if (nx * face * 0.7 - ny * 0.7 < 0.25) continue;
    ctx.moveTo(ax - nx * 2.2, ay - ny * 2.2);
    ctx.lineTo(bx - nx * 2.2, by - ny * 2.2);
    any = true;
  }
  if (!any) return;
  ctx.strokeStyle = t.rim;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.85;
  ctx.stroke();
  ctx.globalAlpha = a;
}

/** A thick stroke (arm, leg, tail, coil): shaded side, lit side and a sheen along the light. */
export function limb(ctx: Ctx, pts: number[], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = (dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo((pts[0] as number) + dx, (pts[1] as number) + dy);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo((pts[i] as number) + dx, (pts[i + 1] as number) + dy);
  };
  path(0, 0);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  const t = width >= SMALL ? ramp(color) : null;
  if (!t) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    return;
  }
  ctx.strokeStyle = t.dark;
  ctx.lineWidth = width;
  ctx.stroke();
  const o = width * 0.16;
  path(face * o, -o);
  ctx.strokeStyle = t.base;
  ctx.lineWidth = width * 0.62;
  ctx.stroke();
  path(face * o * 2, -o * 2);
  ctx.strokeStyle = t.light;
  ctx.lineWidth = Math.max(2, width * 0.22);
  ctx.stroke();
}
