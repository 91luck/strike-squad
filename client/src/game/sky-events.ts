/**
 * Life in the far sky: every so often something happens behind the fight, different in every stage. A flock wheels
 * past, a meteor burns down the sky, a great shadow glides over the far ranges, lanterns drift up, a burning arrow
 * volley arcs over a distant battle. Pure decoration in screen space between the far layers (no gameplay, no
 * network: each player sees it on their own clock), cheap (a few paths), and never twice in quick succession.
 */

type Ctx = CanvasRenderingContext2D;

export type SkyEvent = 'flock' | 'meteor' | 'shadow' | 'lanterns' | 'volley';

/** Which events each art style's sky can show. */
const EVENTS: Record<string, SkyEvent[]> = {
  vana: ['flock', 'meteor'],
  inferno: ['meteor', 'meteor', 'shadow'],
  sagar: ['flock', 'shadow'],
  shikhar: ['flock', 'shadow'],
  naglok: ['lanterns'],
  maya: ['lanterns', 'shadow'],
  bhasm: ['meteor', 'shadow'],
  ranbhoomi: ['volley', 'flock'],
  chakra: ['volley', 'meteor'],
  dwand: ['flock', 'meteor', 'lanterns'],
  mahayuddh: ['meteor', 'volley', 'shadow'],
};

/** One event every PERIOD seconds, lasting LIFE[event] seconds from a random moment in its slot. */
const PERIOD = 14;
const LIFE: Record<SkyEvent, number> = { flock: 7, meteor: 1.6, shadow: 9, lanterns: 10, volley: 2.4 };

function hash(n: number): number {
  let h = (n * 374761393) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Draws the current event, if any. `W`,`H` canvas pixels; `s` canvas pixels per world pixel. */
export function drawSkyEvent(ctx: Ctx, art: string, nowMs: number, W: number, H: number, s: number): void {
  const list = EVENTS[art];
  if (!list) return;
  const t = nowMs / 1000;
  const slot = Math.floor(t / PERIOD);
  const r = hash(slot * 31 + art.length);
  const kind = list[Math.floor(r * list.length)] as SkyEvent;
  const life = LIFE[kind];
  const start = slot * PERIOD + hash(slot * 7 + 3) * (PERIOD - life - 1);
  const k = (t - start) / life;
  if (k < 0 || k > 1) return;
  const dir = hash(slot * 13 + 1) < 0.5 ? 1 : -1;
  const y0 = H * (0.12 + hash(slot * 5 + 2) * 0.22);
  ctx.save();
  switch (kind) {
    case 'flock':
      flock(ctx, k, W, H, y0, dir, s, t);
      break;
    case 'meteor':
      meteor(ctx, k, W, H, dir, s, hash(slot * 17));
      break;
    case 'shadow':
      shadow(ctx, k, W, H, y0, dir, s, t, art);
      break;
    case 'lanterns':
      lanterns(ctx, k, W, H, s, t, slot);
      break;
    case 'volley':
      volley(ctx, k, W, H, dir, s, slot);
      break;
  }
  ctx.restore();
}

const fade = (k: number): number => Math.min(1, k / 0.12, (1 - k) / 0.12);

function flock(
  ctx: Ctx,
  k: number,
  W: number,
  H: number,
  y0: number,
  dir: number,
  s: number,
  t: number,
): void {
  // a loose V of birds crossing the whole sky, wings beating out of step
  const x0 = dir > 0 ? -W * 0.15 + k * W * 1.3 : W * 1.15 - k * W * 1.3;
  ctx.strokeStyle = `rgba(20,12,20,${0.55 * fade(k)})`;
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    const bx = x0 - dir * row * 16 * s;
    const by = y0 + side * row * 9 * s + Math.sin(t * 1.3 + i) * 3 * s;
    const flap = Math.sin(t * 9 + i * 1.7) * 4 * s;
    const w = (6 + (i % 3)) * s;
    ctx.beginPath();
    ctx.moveTo(bx - w, by - flap);
    ctx.quadraticCurveTo(bx - w * 0.4, by - flap * 0.2 - 2 * s, bx, by);
    ctx.quadraticCurveTo(bx + w * 0.4, by - flap * 0.2 - 2 * s, bx + w, by - flap);
    ctx.stroke();
  }
}

function meteor(ctx: Ctx, k: number, W: number, H: number, dir: number, s: number, r: number): void {
  // a falling star burning down toward the horizon, its trail fading behind it
  const sx = W * (0.15 + r * 0.7);
  const x = sx + dir * k * W * 0.35;
  const y = H * 0.05 + k * H * 0.32;
  const tail = 120 * s;
  const ang = Math.atan2(H * 0.32, dir * W * 0.35);
  const tx = x - Math.cos(ang) * tail;
  const ty = y - Math.sin(ang) * tail;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(tx, ty, x, y);
  g.addColorStop(0, 'rgba(255,170,80,0)');
  g.addColorStop(1, `rgba(255,236,200,${0.9 * fade(k)})`);
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1.5, 3 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  const h = ctx.createRadialGradient(x, y, 0, x, y, 14 * s);
  h.addColorStop(0, `rgba(255,240,210,${fade(k)})`);
  h.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = h;
  ctx.fillRect(x - 14 * s, y - 14 * s, 28 * s, 28 * s);
}

function shadow(
  ctx: Ctx,
  k: number,
  W: number,
  H: number,
  y0: number,
  dir: number,
  s: number,
  t: number,
  art: string,
): void {
  // something vast and far away gliding over the ranges: a winged shape in the air, a long-finned one over the sea
  const x = dir > 0 ? -W * 0.3 + k * W * 1.6 : W * 1.3 - k * W * 1.6;
  const y = y0 + H * 0.06 + Math.sin(t * 0.7) * 6 * s;
  const L = 150 * s;
  ctx.fillStyle = `rgba(10,6,16,${0.32 * fade(k)})`;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.beginPath();
  if (art === 'sagar') {
    // a sky-whale: long body, slow tail, two broad fins
    ctx.ellipse(0, 0, L * 0.5, L * 0.12, 0, 0, Math.PI * 2);
    ctx.moveTo(-L * 0.45, 0);
    ctx.lineTo(-L * 0.75, -L * 0.1 + Math.sin(t * 1.4) * L * 0.05);
    ctx.lineTo(-L * 0.75, L * 0.1 + Math.sin(t * 1.4) * L * 0.05);
    ctx.closePath();
    ctx.moveTo(L * 0.1, L * 0.05);
    ctx.lineTo(-L * 0.05, L * 0.28 + Math.sin(t * 1.1) * L * 0.04);
    ctx.lineTo(-L * 0.15, L * 0.06);
  } else {
    // a great winged beast, wings rising and falling slowly
    const beat = Math.sin(t * 2.2) * L * 0.18;
    ctx.ellipse(0, 0, L * 0.22, L * 0.06, 0, 0, Math.PI * 2);
    ctx.moveTo(L * 0.05, 0);
    ctx.quadraticCurveTo(-L * 0.1, -L * 0.25 - beat, -L * 0.45, -L * 0.1 - beat);
    ctx.quadraticCurveTo(-L * 0.2, -L * 0.04, -L * 0.1, 0);
    ctx.moveTo(L * 0.05, 0);
    ctx.quadraticCurveTo(L * 0.1, -L * 0.3 - beat, L * 0.4, -L * 0.18 - beat);
    ctx.quadraticCurveTo(L * 0.15, -L * 0.05, 0, 0);
    ctx.moveTo(-L * 0.2, 0);
    ctx.lineTo(-L * 0.42, L * 0.04);
    ctx.lineTo(-L * 0.2, L * 0.03);
  }
  ctx.fill();
  ctx.restore();
}

function lanterns(ctx: Ctx, k: number, W: number, H: number, s: number, t: number, slot: number): void {
  // a release of sky lanterns rising and swaying, each with a warm halo
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const r = hash(slot * 101 + i);
    const x = W * (0.1 + r * 0.8) + Math.sin(t * 0.8 + i) * 10 * s;
    const y = H * (0.75 - k * (0.55 + hash(i + slot) * 0.25));
    const a = fade(k) * (0.5 + 0.5 * Math.sin(t * 3 + i * 2));
    const g = ctx.createRadialGradient(x, y, 0, x, y, 9 * s);
    g.addColorStop(0, `rgba(255,214,140,${0.85 * a})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 9 * s, y - 9 * s, 18 * s, 18 * s);
    ctx.fillStyle = `rgba(255,236,190,${a})`;
    ctx.fillRect(x - 1.5 * s, y - 2 * s, 3 * s, 4 * s);
  }
}

function volley(ctx: Ctx, k: number, W: number, H: number, dir: number, s: number, slot: number): void {
  // a far-off battle: a volley of burning arrows arcing over the horizon
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const r = hash(slot * 53 + i);
    const kk = k * 1.15 - r * 0.15;
    if (kk < 0 || kk > 1) continue;
    const x0 = W * (dir > 0 ? 0.1 + r * 0.2 : 0.7 + r * 0.2);
    const x = x0 + dir * kk * W * 0.45;
    const y = H * 0.55 - Math.sin(kk * Math.PI) * H * (0.25 + r * 0.08);
    const vx = dir;
    const vy = -Math.cos(kk * Math.PI);
    const len = 10 * s;
    const n = Math.hypot(vx, vy);
    ctx.strokeStyle = `rgba(255,190,90,${0.8 * fade(k)})`;
    ctx.lineWidth = Math.max(1, 1.6 * s);
    ctx.beginPath();
    ctx.moveTo(x - (vx / n) * len, y - (vy / n) * len * 0.6);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}
