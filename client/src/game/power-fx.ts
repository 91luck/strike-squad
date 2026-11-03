import type { FieldDef, FxSnapshot, GateDef, PickupKind, PowerKind } from '@strikesquad/shared';

/**
 * Drawing for the advanced missions: power pickups and altars, walls of fire, burning ground, black holes,
 * rain and wind gusts, the brahmastra pillar, and the physics fields (lift beams, gravity wells, aurora storms).
 *
 * Everything here is stateless drawing on a context already transformed into world space, so the renderer stays
 * the owner of particles, camera and timing. Shapes are procedural (gradients and arcs): nothing to download.
 */

const TAU = Math.PI * 2;
const T = 32;

/** Colour of each power (pickup orb, HUD, effects). */
export const POWER_COLOR: Record<PowerKind, [string, string]> = {
  agni: ['#fde68a', '#ea580c'],
  varuna: ['#bae6fd', '#0284c7'],
  vayu: ['#d9f99d', '#16a34a'],
  singularity: ['#ddd6fe', '#5b21b6'],
};
const POWER_LABEL: Record<PowerKind, string> = {
  agni: 'AGNI',
  varuna: 'VARUNA',
  vayu: 'VAYU',
  singularity: 'BLACK HOLE',
};

/** A glowing power orb with its symbol; altars stand on a stone pedestal. */
export function drawPowerPickup(
  ctx: CanvasRenderingContext2D,
  kind: PowerKind,
  x: number,
  y: number,
  altar: boolean,
  nowMs: number,
  label: (t: string, x: number, y: number, c: string, s: number) => void,
): void {
  const [hi, lo] = POWER_COLOR[kind];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
  g.addColorStop(0, `${lo}cc`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 30, y - 30, 60, 60);
  ctx.restore();
  const orb = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, 11);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.35, hi);
  orb.addColorStop(1, lo);
  ctx.fillStyle = '#120f17';
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = kind === 'singularity' ? '#0b0614' : orb;
  ctx.beginPath();
  ctx.arc(x, y, 10.5, 0, TAU);
  ctx.fill();
  drawSymbol(ctx, kind, x, y, nowMs);
  label(POWER_LABEL[kind], x, y - 22, hi, 10);
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  kind: PowerKind,
  x: number,
  y: number,
  nowMs: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  if (kind === 'agni') {
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(6, 0, 3, 6);
    ctx.quadraticCurveTo(0, 2, -3, 6);
    ctx.quadraticCurveTo(-6, 0, 0, -7);
    ctx.fill();
  } else if (kind === 'varuna') {
    ctx.fillStyle = '#f0f9ff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(6, 2, 0, 6);
    ctx.quadraticCurveTo(-6, 2, 0, -7);
    ctx.fill();
  } else if (kind === 'vayu') {
    ctx.strokeStyle = '#f7fee7';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, i * 4);
      ctx.quadraticCurveTo(2, i * 4 - 3, 6, i * 4);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = '#c4b5fd';
    ctx.rotate(nowMs / 300);
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

/** Altar pedestal under respawning pickups (drawn even while the altar is recharging). */
export function drawAltar(ctx: CanvasRenderingContext2D, x: number, groundY: number, charged: boolean): void {
  ctx.fillStyle = '#120f17';
  ctx.fillRect(x - 13, groundY - 12, 26, 12);
  ctx.fillStyle = '#57534e';
  ctx.fillRect(x - 12, groundY - 11, 24, 10);
  ctx.fillStyle = '#78716c';
  ctx.fillRect(x - 12, groundY - 11, 24, 2);
  ctx.fillStyle = charged ? '#38bdf8' : '#1e3a4a';
  ctx.fillRect(x - 4, groundY - 8, 8, 3);
}

/** A wall of fire filling a gate column (roaring while closed). */
export function drawFireWall(ctx: CanvasRenderingContext2D, g: GateDef, nowMs: number): void {
  const x = g.col * T;
  const h = (g.rowBottom + 1) * T;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createLinearGradient(x - 24, 0, x + T + 24, 0);
  glow.addColorStop(0, 'rgba(255,90,20,0)');
  glow.addColorStop(0.5, 'rgba(255,90,20,0.35)');
  glow.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 24, 0, T + 48, h);
  for (let y = h; y > 0; y -= 14) {
    const k = (h - y) / h;
    const flick = Math.sin(nowMs / 90 + y * 0.31) * 6;
    const w = T * (0.95 - k * 0.35) + flick;
    const grad = ctx.createLinearGradient(0, y - 26, 0, y);
    grad.addColorStop(0, 'rgba(255,60,0,0)');
    grad.addColorStop(0.4, 'rgba(255,120,20,0.75)');
    grad.addColorStop(1, 'rgba(255,230,140,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x + T / 2 - w / 2, y);
    ctx.quadraticCurveTo(x + T / 2 + flick, y - 34, x + T / 2 + w / 2, y);
    ctx.fill();
  }
  ctx.restore();
}

/** Burning ground left by agni, and black holes. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: FxSnapshot[], nowMs: number): void {
  for (const f of fx) {
    if (f.k === 0) drawBurn(ctx, f, nowMs);
    else drawHole(ctx, f.x, f.y, f.w, f.t, nowMs);
  }
}

function drawBurn(ctx: CanvasRenderingContext2D, f: FxSnapshot, nowMs: number): void {
  const fade = Math.min(1, f.t / 0.6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade;
  const base = ctx.createLinearGradient(0, f.y - 10, 0, f.y);
  base.addColorStop(0, 'rgba(255,80,0,0)');
  base.addColorStop(1, 'rgba(255,120,30,0.6)');
  ctx.fillStyle = base;
  ctx.fillRect(f.x, f.y - 10, f.w, 10);
  for (let x = f.x + 6; x < f.x + f.w; x += 12) {
    const h = 18 + Math.sin(nowMs / 70 + x * 0.7) * 8 + Math.sin(nowMs / 130 + x) * 5;
    const g = ctx.createLinearGradient(0, f.y - h, 0, f.y);
    g.addColorStop(0, 'rgba(255,60,0,0)');
    g.addColorStop(0.5, 'rgba(255,140,30,0.7)');
    g.addColorStop(1, 'rgba(255,240,170,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 7, f.y);
    ctx.quadraticCurveTo(x + Math.sin(nowMs / 100 + x) * 4, f.y - h * 1.4, x + 7, f.y);
    ctx.fill();
  }
  ctx.restore();
}

/** A black hole: a dark core, a lensing rim, and a hot accretion disc spinning around it. */
export function drawHole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  left: number,
  nowMs: number,
  still = false,
): void {
  // A thrown black hole grows in and shrinks out; a level's gravity well (still) is always full size.
  const grow = still ? 1 : Math.max(0.05, Math.min(1, left * 2.5, 0.4 + (3.2 - left) * 3));
  const core = Math.max(2, 26 * grow);
  ctx.save();
  // pull zone
  const zone = ctx.createRadialGradient(x, y, core, x, y, radius);
  zone.addColorStop(0, 'rgba(76,29,149,0.35)');
  zone.addColorStop(1, 'rgba(76,29,149,0)');
  ctx.fillStyle = zone;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  // spiral arms
  ctx.globalCompositeOperation = 'lighter';
  const spin = nowMs / 220;
  for (let arm = 0; arm < 3; arm++) {
    ctx.strokeStyle = arm % 2 ? 'rgba(251,146,60,0.55)' : 'rgba(167,139,250,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const t = k / 30;
      const a = spin + arm * (TAU / 3) + t * 4.2;
      const r = core + (radius * 0.75 - core) * (1 - t);
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.55;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // accretion disc
  ctx.strokeStyle = 'rgba(253,186,116,0.9)';
  ctx.lineWidth = 5 * grow;
  ctx.beginPath();
  ctx.ellipse(x, y, core * 1.9, core * 0.55, Math.sin(nowMs / 900) * 0.15, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // event horizon
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x, y, core, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(196,181,253,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, core + 2, 0, TAU);
  ctx.stroke();
}

/** Physics fields, drawn behind the tiles: lift beams, gravity wells, aurora storms, low-gravity shimmer. */
export function drawFields(
  ctx: CanvasRenderingContext2D,
  fields: FieldDef[],
  camX: number,
  viewW: number,
  nowMs: number,
): void {
  for (const f of fields) {
    if (f.x1 < camX - 40 || f.x0 > camX + viewW + 40) continue;
    if (f.kind === 'lift') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(f.x0, 0, f.x1, 0);
      g.addColorStop(0, 'rgba(56,189,248,0)');
      g.addColorStop(0.5, 'rgba(56,189,248,0.28)');
      g.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0);
      // chevrons rising up the beam
      ctx.strokeStyle = 'rgba(186,230,253,0.7)';
      ctx.lineWidth = 2;
      const cx = (f.x0 + f.x1) / 2;
      const off = (nowMs / 8) % 48;
      for (let y = f.y1 - off; y > f.y0; y -= 48) {
        ctx.beginPath();
        ctx.moveTo(cx - 12, y + 8);
        ctx.lineTo(cx, y);
        ctx.lineTo(cx + 12, y + 8);
        ctx.stroke();
      }
      ctx.restore();
    } else if (f.kind === 'well') {
      const cx = (f.x0 + f.x1) / 2;
      const cy = (f.y0 + f.y1) / 2 + 40;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const r = ((nowMs / 25 + i * 40) % 160) + 8;
        ctx.strokeStyle = `rgba(167,139,250,${0.5 * (1 - r / 168)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 168 - r, (168 - r) * 0.45, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      drawHole(ctx, cx, cy, 90, 0, nowMs, true);
    } else if (f.kind === 'magnet') {
      // Aurora: slow ribbons of green and violet over the storm.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 3; band++) {
        const top = f.y0 + 40 + band * 40;
        ctx.fillStyle = band === 1 ? 'rgba(192,132,252,0.16)' : 'rgba(74,222,128,0.16)';
        ctx.beginPath();
        ctx.moveTo(f.x0, top + 80);
        for (let x = f.x0; x <= f.x1; x += 16) {
          const y =
            top + Math.sin(x * 0.012 + nowMs / 900 + band) * 22 + Math.sin(x * 0.03 + nowMs / 500) * 8;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(f.x1, top + 80);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if (f.kind === 'lowg') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(165,180,252,0.5)';
      for (let x = Math.max(f.x0, camX - 20); x < Math.min(f.x1, camX + viewW + 20); x += 46) {
        const y = f.y1 - 140 - ((nowMs / 30 + x * 7) % 300);
        ctx.fillRect(Math.round(x + Math.sin(nowMs / 600 + x) * 8), Math.round(y), 2, 2);
      }
      ctx.restore();
    }
  }
}

/** The wave of fire thrown by agni. */
export function drawFlame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  nowMs: number,
): void {
  const dir = Math.sign(vx) || 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const r = 22 - i * 4;
    const ox = -dir * i * 10;
    const g = ctx.createRadialGradient(x + ox, y, 1, x + ox, y, r);
    g.addColorStop(0, 'rgba(255,250,210,0.95)');
    g.addColorStop(0.45, 'rgba(255,150,40,0.8)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + ox, y + Math.sin(nowMs / 60 + i) * 3, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export const isPowerKind = (k: PickupKind): k is PowerKind =>
  k === 'agni' || k === 'varuna' || k === 'vayu' || k === 'singularity';
