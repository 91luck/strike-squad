/**
 * Every saga stage gets a sky of its own, painted over its gradient before the far ranges: what hangs in it (a
 * setting giant sun, a cratered moon, twin moons over the city of illusions, an eclipse over the ash mountain, a
 * sun-wheel over the fortress of rings, a blood moon over the burning city), whether there are stars, and what its
 * clouds are made of (smoke, storm, dust, ash or none). Cheap: a few gradients and arcs a frame.
 */

type Ctx = CanvasRenderingContext2D;

export interface SkyLook {
  body: 'giant' | 'moon' | 'twin' | 'eclipse' | 'wheel' | 'blood' | 'none';
  /** the body's colour (a giant sun's) */
  color?: string;
  stars?: number;
  /** cloud opacity (0: no clouds) and what colour they take (smoke, storm, dust) */
  clouds: number;
  cloudTint?: string;
}

export const SKIES: Record<string, SkyLook> = {
  vana: { body: 'giant', color: '#ff5a1f', clouds: 0.5, cloudTint: '#6b2a18' },
  inferno: { body: 'none', clouds: 0.55, cloudTint: '#3a1410' },
  sagar: { body: 'moon', stars: 160, clouds: 0.22 },
  shikhar: { body: 'moon', stars: 50, clouds: 0.7, cloudTint: '#5a5390' },
  naglok: { body: 'none', clouds: 0 },
  maya: { body: 'twin', stars: 120, clouds: 0 },
  bhasm: { body: 'eclipse', clouds: 0.5, cloudTint: '#6b6560' },
  ranbhoomi: { body: 'giant', color: '#ff7a2a', clouds: 0.3, cloudTint: '#f0a070' },
  chakra: { body: 'wheel', clouds: 0.28 },
  dwand: { body: 'moon', stars: 220, clouds: 0 },
  mahayuddh: { body: 'blood', stars: 40, clouds: 0.55, cloudTint: '#5a0a1e' },
};

const TAU = Math.PI * 2;

/** Stars and the sky's body, at canvas size W x H, the body at (sx, sy). */
export function drawSkyLook(
  ctx: Ctx,
  look: SkyLook,
  W: number,
  H: number,
  sx: number,
  sy: number,
  camX: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  if (look.stars) {
    for (let i = 0; i < look.stars; i++) {
      const x =
        (((((i * 7919) % 1997) / 1997) * (W + 300) - ((camX * 0.03) % (W + 300)) + W + 300) % (W + 300)) -
        150;
      const y = (((i * 104729) % 1009) / 1009) * H * 0.55;
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + (i % 5) * 0.4) + i);
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + tw * 0.6) * (1 - y / (H * 0.6))})`;
      const s = i % 17 === 0 ? 3 : i % 5 === 0 ? 2 : 1.5;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
  }
  const R = H * 0.07;
  switch (look.body) {
    case 'giant': {
      // a vast setting sun, banded by haze
      const r = H * 0.16;
      const y = sy + H * 0.08;
      halo(ctx, sx, y, r * 3, look.color ?? '#ff6a2a', 0.35);
      const g = ctx.createLinearGradient(0, y - r, 0, y + r);
      g.addColorStop(0, '#fff1c2');
      g.addColorStop(0.5, look.color ?? '#ff6a2a');
      g.addColorStop(1, '#b91c1c');
      ctx.fillStyle = g;
      disc(ctx, sx, y, r);
      ctx.fillStyle = 'rgba(80,20,10,0.28)';
      for (let i = 0; i < 4; i++)
        ctx.fillRect(sx - r, y + r * (0.15 + i * 0.2), r * 2, r * (0.04 + i * 0.015));
      break;
    }
    case 'moon':
      halo(ctx, sx, sy, R * 4, '#c7d2fe', 0.3);
      ctx.fillStyle = '#eef2ff';
      disc(ctx, sx, sy, R);
      craters(ctx, sx, sy, R);
      break;
    case 'twin':
      halo(ctx, sx, sy, R * 4, '#f0abfc', 0.3);
      ctx.fillStyle = '#fbcfe8';
      disc(ctx, sx, sy, R * 1.2);
      craters(ctx, sx, sy, R * 1.2);
      halo(ctx, sx - W * 0.16, sy - H * 0.08, R * 2.4, '#a78bfa', 0.3);
      ctx.fillStyle = '#c4b5fd';
      disc(ctx, sx - W * 0.16, sy - H * 0.08, R * 0.55);
      break;
    case 'eclipse': {
      // a dark disc with a white-gold corona breathing round it
      const k = 1 + 0.06 * Math.sin(t * 1.5);
      halo(ctx, sx, sy, R * 4.5 * k, '#fde68a', 0.4);
      ctx.strokeStyle = 'rgba(255,248,220,0.9)';
      ctx.lineWidth = Math.max(2, R * 0.12);
      ctx.beginPath();
      ctx.arc(sx, sy, R * 1.05, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#16120f';
      disc(ctx, sx, sy, R);
      break;
    }
    case 'wheel': {
      // the sun as a wheel: a golden disc and slow-turning spokes of light
      halo(ctx, sx, sy, R * 5, '#fde047', 0.35);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(t * 0.15);
      ctx.fillStyle = 'rgba(253,224,71,0.35)';
      for (let i = 0; i < 12; i++) {
        ctx.rotate(TAU / 12);
        ctx.beginPath();
        ctx.moveTo(R * 1.1, -R * 0.08);
        ctx.lineTo(R * 2.6, 0);
        ctx.lineTo(R * 1.1, R * 0.08);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#fde68a';
      disc(ctx, sx, sy, R);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = Math.max(2, R * 0.1);
      ctx.beginPath();
      ctx.arc(sx, sy, R * 0.75, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'blood':
      halo(ctx, sx, sy, R * 4.5, '#ef4444', 0.4);
      ctx.fillStyle = '#b91c1c';
      disc(ctx, sx, sy, R * 1.1);
      craters(ctx, sx, sy, R * 1.1, 'rgba(60,0,10,0.35)');
      break;
    case 'none':
      break;
  }
}

function disc(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function halo(ctx: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const n = parseInt(color.slice(1), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function craters(ctx: Ctx, x: number, y: number, r: number, color = 'rgba(100,116,160,0.28)'): void {
  ctx.fillStyle = color;
  for (const [dx, dy, s] of [
    [-0.35, -0.2, 0.22],
    [0.25, 0.3, 0.16],
    [0.1, -0.45, 0.1],
    [-0.15, 0.45, 0.12],
    [0.45, -0.1, 0.09],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, s * r, 0, TAU);
    ctx.fill();
  }
}
