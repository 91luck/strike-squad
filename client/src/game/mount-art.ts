import { MOUNTS, type MountKind } from '@strikesquad/shared';

/**
 * The rides (sawari) on screen: rendered parts from Blender (art3d/mount_rig.py → assets/mounts3d), animated here.
 * Legs swing with the distance covered (a walk, a gallop, a leap with the legs tucked), wheels spin with it, the
 * hawk's wings beat (fast when climbing, spread in a glide, folded in a dive), the jet suit's thrusters burn.
 * The far legs and the far wing are the same parts, drawn first and darker.
 *
 * Loading is lazy and never blocks: until a ride's atlas has arrived nothing is drawn for it (the soldier is still
 * drawn where they sit).
 */

type Ctx = CanvasRenderingContext2D;

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}
interface Meta {
  ss: number;
  parts: Record<string, Part>;
}

const metas = import.meta.glob<Meta>('../assets/mounts3d/*.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../assets/mounts3d/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const atlases = new Map<string, { img: HTMLImageElement; ready: boolean; meta: Meta }>();

function atlas(kind: string): { img: HTMLImageElement; ready: boolean; meta: Meta } | undefined {
  let a = atlases.get(kind);
  if (a) return a;
  const meta = metas[`../assets/mounts3d/${kind}.json`];
  const url = urls[`../assets/mounts3d/${kind}.webp`];
  if (!meta || !url || typeof Image === 'undefined') return undefined;
  const img = new Image();
  img.decoding = 'async';
  a = { img, ready: false, meta };
  const entry = a;
  img.onload = () => {
    entry.ready = true;
  };
  img.src = url;
  atlases.set(kind, a);
  return a;
}

/** Starts loading a ride's art (a stage with stands asks for its rides up front). */
export function warmRide(kind: MountKind): void {
  atlas(kind);
}

export function rideReady(kind: MountKind): boolean {
  return atlas(kind)?.ready ?? false;
}

/** Where on the ride the soldier sits: x along it (forward +), y above the ground. */
export function seatOf(kind: MountKind): { x: number; y: number } {
  const x: Record<MountKind, number> = {
    bike: -10,
    jeep: -26,
    jetsuit: 0,
    horse: -2,
    tiger: -3,
    elephant: -4,
    baaz: -4,
  };
  return { x: x[kind], y: MOUNTS[kind].seat };
}

/** Pivots of the moving parts, in the ride's own world px (see mount_rig.py). */
const LEGS: Partial<Record<MountKind, { f: [number, number]; b: [number, number]; swing: number }>> = {
  horse: { f: [17, 32], b: [-19, 34], swing: 0.55 },
  tiger: { f: [17, 22], b: [-19, 24], swing: 0.6 },
  elephant: { f: [24, 40], b: [-26, 40], swing: 0.28 },
};
const WHEELS: Partial<Record<MountKind, { at: number[]; y: number; r: number }>> = {
  bike: { at: [30, -26], y: 14, r: 15 },
  jeep: { at: [32, -32], y: 15, r: 16 },
};

function part(ctx: Ctx, kind: MountKind, name: string, x: number, y: number, angle = 0, dark = 0): void {
  const a = atlas(kind);
  const p = a?.meta.parts[name];
  if (!a?.ready || !p) return;
  const k = 1 / a.meta.ss;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(k, k);
  if (dark) ctx.filter = `brightness(${1 - dark})`;
  ctx.drawImage(a.img, p.x, p.y, p.w, p.h, -p.ax, -p.ay, p.w, p.h);
  ctx.restore();
}

export interface RideState {
  kind: MountKind;
  x: number;
  y: number;
  f: 1 | -1;
  vx: number;
  vy: number;
  ground: boolean;
  /** its power move is running */
  rush: boolean;
  nowMs: number;
  /** the soldier's own colour (the jet suit's flame, the dust of a charge) */
  color: string;
}

/**
 * Draws the ride under its rider, facing `f` with its feet (wheels, belly in flight) at (x, y). Call before drawing
 * the soldier at the seat (seatOf); the jet suit's pack is drawn here too, on the soldier's back.
 */
export function drawRide(ctx: Ctx, r: RideState): void {
  const { kind } = r;
  if (!rideReady(kind)) return;
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.scale(r.f, 1);
  const t = r.nowMs / 1000;
  const legs = LEGS[kind];
  if (legs) {
    // the gait follows the distance covered; in the air the legs reach (a leap), at rest they stand
    const moving = Math.abs(r.vx) > 20;
    const stride = kind === 'elephant' ? 34 : 24;
    const ph = (r.x / stride) * (r.f > 0 ? 1 : -1);
    const sw = legs.swing * (moving ? 1 : 0) * (r.rush ? 1.3 : 1);
    const air = !r.ground;
    const legA = (o: number): number => (air ? (o === 0 ? -0.7 : 0.6) : Math.sin(ph + o) * sw);
    // far legs first, darker
    part(ctx, kind, 'legb', legs.b[0] + 3, -legs.b[1], air ? 0.55 : legA(Math.PI), 0.38);
    part(ctx, kind, 'legf', legs.f[0] + 3, -legs.f[1], air ? -0.6 : legA(Math.PI + 1.2), 0.38);
    // a bob in the body with the stride
    const bob = moving && r.ground ? Math.abs(Math.sin(ph)) * (kind === 'elephant' ? 1.5 : 2.5) : 0;
    part(ctx, kind, 'body', 0, -bob);
    part(ctx, kind, 'legb', legs.b[0], -legs.b[1], air ? 0.55 : legA(0));
    part(ctx, kind, 'legf', legs.f[0], -legs.f[1], air ? -0.6 : legA(1.2));
  } else if (WHEELS[kind]) {
    const w = WHEELS[kind] as { at: number[]; y: number; r: number };
    const spin = (r.x / w.r) * (r.f > 0 ? 1 : -1);
    const tilt = !r.ground ? Math.max(-0.25, Math.min(0.25, -r.vy / 1600)) : 0;
    ctx.rotate(tilt);
    // a bounce on rough ground at speed
    const jig = r.ground && Math.abs(r.vx) > 40 ? Math.sin(t * 40) * 0.6 : 0;
    part(ctx, kind, 'body', 0, jig);
    for (const ax of w.at) part(ctx, kind, 'wheel', ax, -w.y, spin);
    if (r.rush) {
      // nitro: a jet of blue flame out of the exhaust
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const len = 18 + Math.random() * 16;
        const g = ctx.createLinearGradient(-36, 0, -36 - len, 0);
        g.addColorStop(0, 'rgba(160,220,255,0.95)');
        g.addColorStop(1, 'rgba(40,120,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-36 - len, -17 - i, len, 4);
      }
    }
  } else if (kind === 'baaz') {
    // wings: beat hard climbing, steady in level flight, held up in a glide down, folded in a dive
    const climbing = r.vy < -60;
    const diving = r.rush;
    const rate = climbing ? 16 : 10;
    const flap = diving ? -0.9 : Math.sin(t * rate) * (climbing ? 0.75 : 0.5) + (r.vy > 120 ? -0.3 : 0);
    part(ctx, kind, 'wing', 6, -40, flap * 0.85 - 0.15, 0.42);
    part(ctx, kind, 'body', 0, Math.sin(t * rate) * 1.5);
    part(ctx, kind, 'wing', 4, -38, flap);
  } else if (kind === 'jetsuit') {
    // the pack on the back, its two thrusters burning downward (harder when climbing)
    const bx = -9;
    const by = -24;
    const power = r.vy < -40 ? 1.4 : r.vy > 80 ? 0.6 : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const dz of [-2, 3]) {
      const len = (16 + Math.random() * 10) * power;
      const x0 = bx - 4 + dz;
      const y0 = by + 16;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.3, 'rgba(125,211,252,0.85)');
      g.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - 3, y0);
      ctx.lineTo(x0 + 3, y0);
      ctx.lineTo(x0, y0 + len);
      ctx.fill();
    }
    ctx.restore();
    part(ctx, kind, 'pack', bx, by);
  }
  ctx.restore();
}

/** The ride's health bar over the rider (amber; a soldier's own health stays in the HUD and the name plate). */
export function drawRideBar(ctx: Ctx, x: number, y: number, frac: number): void {
  const w = 30;
  ctx.fillStyle = '#120f17';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = frac > 0.35 ? '#fbbf24' : '#f97316';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 3);
}

/**
 * A ride stand: a waiting ride (gently breathing, a soft glow round it) on a stone pad with a saffron pennant, so
 * nobody walks past it without seeing what it offers.
 */
export function drawStand(ctx: Ctx, kind: MountKind, x: number, y: number, nowMs: number): void {
  const t = nowMs / 1000;
  ctx.save();
  // the pad
  ctx.fillStyle = '#3f3a36';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 40, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5c544d';
  ctx.beginPath();
  ctx.ellipse(x, y - 1, 36, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // a glow and rising sparks
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 26, 4, x, y - 26, 60);
  g.addColorStop(0, `rgba(253,224,71,${0.22 + 0.08 * Math.sin(t * 3)})`);
  g.addColorStop(1, 'rgba(253,224,71,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 60, y - 86, 120, 120);
  for (let i = 0; i < 5; i++) {
    const ph = (t * 0.6 + i / 5) % 1;
    ctx.fillStyle = `rgba(253,230,138,${1 - ph})`;
    ctx.fillRect(x - 30 + i * 15 + Math.sin(t * 2 + i) * 3, y - 6 - ph * 60, 2, 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // the pennant
  ctx.fillStyle = '#4a3a2a';
  ctx.fillRect(x + 42, y - 70, 3, 70);
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(x + 45, y - 70);
  ctx.lineTo(x + 70 + Math.sin(t * 4) * 3, y - 63);
  ctx.lineTo(x + 45, y - 56);
  ctx.fill();
  ctx.restore();
  // the ride itself, waiting (a flier hovers)
  const fly = MOUNTS[kind].fly;
  drawRide(ctx, {
    kind,
    x,
    y: fly ? y - 18 + Math.sin(t * 2) * 3 : y,
    f: 1,
    vx: 0,
    vy: 0,
    ground: !fly,
    rush: false,
    nowMs,
    color: '#fde68a',
  });
}
