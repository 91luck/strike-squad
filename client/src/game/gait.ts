/**
 * Locomotion for walking bosses: feet that plant on the ground instead of skating.
 *
 * The step cycle is driven by distance travelled, not time: one cycle per `stride` world px. In the stance part
 * of the cycle a foot moves backwards under the body at exactly the body's speed (so in the world it stands
 * still); in the swing part it lifts and travels forward to its next footfall. Standing still freezes the cycle,
 * and a smoothed speed fades the lift out, so a boss that stops mid-step puts its foot down rather than leaving it
 * hanging. Speed is estimated per enemy id from frame to frame (stale ids are dropped).
 */

interface Track {
  x: number;
  t: number;
  speed: number;
  seen: number;
}

const tracks = new Map<number, Track>();

export interface Gait {
  /** Distance along the facing direction (world px): drives the step cycle. */
  s: number;
  /** Smoothed ground speed, 0 (standing) .. 1 (walking) .. ~5 (charging). */
  speed: number;
  /** 0 when standing, 1 when walking or faster: fades step lift, bob and pitch in and out. */
  moving: number;
}

/** The gait state of enemy `id` at world x `x`, facing `f`; `walkSpeed` is its normal walking speed (px/s). */
export function gaitOf(id: number, x: number, f: number, nowMs: number, walkSpeed = 60): Gait {
  let tr = tracks.get(id);
  if (!tr) {
    tr = { x, t: nowMs, speed: 0, seen: nowMs };
    tracks.set(id, tr);
  }
  const dt = (nowMs - tr.t) / 1000;
  if (dt > 0.0005) {
    const v = Math.min(8, Math.abs(x - tr.x) / dt / walkSpeed);
    const k = Math.min(1, dt * 8);
    tr.speed += (v - tr.speed) * k;
    tr.x = x;
    tr.t = nowMs;
  }
  tr.seen = nowMs;
  if (tracks.size > 64) for (const [k, v] of tracks) if (nowMs - v.seen > 5000) tracks.delete(k);
  return { s: x * f, speed: tr.speed, moving: Math.min(1, tr.speed * 1.6) };
}

/**
 * Where a foot is, relative to its rest point under the hip (local px, +x forward, -y up): `offset` is the leg's
 * place in the cycle (0..1), `duty` the stance share of the cycle, `lift` the step height.
 */
export function foot(
  g: Gait,
  stride: number,
  offset: number,
  duty = 0.62,
  lift = 10,
): { dx: number; dy: number; stance: boolean } {
  const u = (((g.s / stride + offset) % 1) + 1) % 1;
  const reach = (stride * duty) / 2;
  if (u < duty) return { dx: reach - (u / duty) * 2 * reach, dy: 0, stance: true };
  const w = (u - duty) / (1 - duty);
  // ease the swing so the foot accelerates off the ground and slows into the footfall
  const e = w * w * (3 - 2 * w);
  return { dx: -reach + e * 2 * reach, dy: -Math.sin(w * Math.PI) * lift * g.moving, stance: false };
}

/** Body bob: the body dips on each footfall (two per cycle for a biped or a trotting quadruped). */
export function bob(g: Gait, stride: number, amp = 3, perCycle = 2): number {
  return Math.abs(Math.sin((g.s / stride) * Math.PI * perCycle)) * amp * g.moving - amp * 0.5 * g.moving;
}

/** Breathing when standing: a slow rise and fall, `amp` px. */
export function breathe(g: Gait, nowMs: number, amp = 1.5): number {
  return Math.sin(nowMs / 520) * amp * (1 - g.moving);
}

/**
 * Two-bone IK: the knee for hip (hx, hy) and foot (fx, fy) with thigh `a` and shin `b`. `bend` +1 puts the knee
 * forward (+x), -1 back (a dog's hock, an insect's leg arching up).
 */
export function knee(
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  a: number,
  b: number,
  bend: 1 | -1,
): [number, number] {
  const dx = fx - hx;
  const dy = fy - hy;
  const d = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.01, Math.hypot(dx, dy)));
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  const base = Math.atan2(dy, dx);
  // going down (dy > 0), +off swings the knee towards -x; flip so bend +1 means forward
  const ang = base - bend * off;
  return [hx + Math.cos(ang) * a, hy + Math.sin(ang) * a];
}

/**
 * A tail or spine as a chain of `n` points from (x, y), each segment `len` long, curling by `curl` radians per
 * segment and waving with a delay down the chain (follow-through): pass `wave` for its strength.
 */
export function chain(
  x: number,
  y: number,
  dir: number,
  n: number,
  len: number,
  curl: number,
  nowMs: number,
  wave: number,
  speed = 1,
): number[] {
  const pts = [x, y];
  let a = dir;
  for (let i = 1; i <= n; i++) {
    a += curl + Math.sin(nowMs / (260 / speed) - i * 0.7) * wave * (i / n);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    pts.push(x, y);
  }
  return pts;
}
