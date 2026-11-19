import type { ShowKind } from './astra-aahvaan';

/**
 * Prahaar, the strike: what an astra does to the ground where it lands (astra-aahvaan.ts draws the call, the storm
 * and the dome of light; this adds the weight of the blow).
 *
 *   - shockwaves: three thick rings racing out along the ground, the first one fastest
 *   - the element itself breaking out of the ground: tongues of fire, water columns and spray, a dust whirl, forks of
 *     lightning from the sky, serpents arching out of the earth, a disc slicing through, a burst of feathers, a fan
 *     of sun rays, mirror shards, a void pulling everything in, a pillar of light
 *   - rock and earth thrown up, falling back on arcs; a cloud of dust rolling out low
 *
 * World space, additive where it is light; `u` runs 0 → 1 over the strike. No images, a few hundred path calls at
 * most, fewer on a slow machine (`hq` false).
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ease = (t: number): number => 1 - (1 - t) ** 3;

function glowAt(ctx: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  if (a <= 0.01 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/** A thick ring lying on the ground (an ellipse seen from the side), bright at its leading edge. */
function shock(ctx: Ctx, x: number, y: number, r: number, w: number, color: string, a: number): void {
  if (a <= 0.01) return;
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.22, 0, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, w * 0.3);
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y, r + w * 0.4, (r + w * 0.4) * 0.22, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * The detonation core: a white-hot contact flash with a sharp inner seal, a warm outer
 * halo and short radial blades. It gives every Astra the same readable impact beat
 * while the element-specific silhouette below supplies its identity.
 */
function detonationCore(
  ctx: Ctx,
  x: number,
  y: number,
  u: number,
  k: number,
  core: string,
  glow: string,
): void {
  const open = Math.min(1, u / 0.24);
  const radius = (12 + 76 * ease(open)) * k;
  const fade = Math.max(0, 1 - u * 1.9);
  if (fade <= 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, x, y - 16 * k, radius * 2.25, glow, fade * 0.62);

  // A tight white centre keeps the point of contact readable even on bright stages.
  const coreGlow = ctx.createRadialGradient(x, y - 16 * k, 0, x, y - 16 * k, radius);
  coreGlow.addColorStop(0, '#ffffff');
  coreGlow.addColorStop(0.16, core);
  coreGlow.addColorStop(0.58, glow);
  coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = fade * 0.9;
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.ellipse(x, y - 16 * k, radius * 0.72, radius * 0.36, 0, 0, TAU);
  ctx.fill();

  // Two offset elliptical rings create a layered, physical shock front.
  for (let i = 0; i < 2; i++) {
    const rr = radius * (0.68 + i * 0.38);
    ctx.globalAlpha = fade * (i ? 0.48 : 0.82);
    ctx.strokeStyle = i ? glow : '#ffffff';
    ctx.lineWidth = (i ? 2.2 : 3.2) * k;
    ctx.beginPath();
    ctx.ellipse(x, y - 16 * k, rr, rr * 0.34, 0, i ? Math.PI * 0.08 : Math.PI * 1.08, i ? Math.PI * 1.82 : Math.PI * 2.88);
    ctx.stroke();
  }

  const blades = 12;
  ctx.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * TAU - Math.PI / 2;
    const inner = radius * 0.9;
    const outer = radius * (1.12 + (i % 3) * 0.12);
    ctx.globalAlpha = fade * (i % 3 === 0 ? 0.72 : 0.34);
    ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : core;
    ctx.lineWidth = (i % 3 === 0 ? 2.4 : 1.2) * k;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * inner, y - 16 * k + Math.sin(a) * inner * 0.34);
    ctx.lineTo(x + Math.cos(a) * outer, y - 16 * k + Math.sin(a) * outer * 0.34);
    ctx.stroke();
  }
  ctx.restore();
}

function lightning(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: () => number,
  w: number,
): void {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const q = i / n;
    ctx.lineTo(x0 + (x1 - x0) * q + (i < n ? (r() - 0.5) * 40 : 0), y0 + (y1 - y0) * q);
  }
  ctx.stroke();
}


/** A crisp, readable signature at the centre of every strike. The silhouette changes with the astra. */
function drawSignature(
  ctx: Ctx,
  kind: ShowKind,
  x: number,
  y: number,
  u: number,
  k: number,
  core: string,
  glow: string,
  nowMs: number,
): void {
  const pop = Math.sin(Math.min(1, u * 2.4) * Math.PI);
  const fade = Math.min(1, (1 - u) * 1.7);
  const radius = (30 + 84 * ease(Math.min(1, u * 1.35))) * k;
  if (fade <= 0) return;
  ctx.save();
  ctx.translate(x, y - 34 * k);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fade * 0.9;

  // Three concentric, broken rings create a deliberate focal point instead of a diffuse glow.
  for (let ring = 0; ring < 3; ring++) {
    ctx.strokeStyle = ring === 1 ? '#ffffff' : (ring === 0 ? core : glow);
    ctx.lineWidth = (ring === 1 ? 2.2 : 4 - ring) * k;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.55 + ring * 0.23), nowMs / (ring % 2 ? -850 : 1100) + ring, nowMs / (ring % 2 ? -850 : 1100) + ring + Math.PI * (1.45 + ring * 0.12));
    ctx.stroke();
  }

  const rays = kind === 'param' || kind === 'tej' || kind === 'vidyut' ? 16 : 10;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * TAU + nowMs / 1800;
    const inner = radius * 0.82;
    const outer = radius * (1.05 + 0.24 * pop);
    ctx.strokeStyle = i % 2 ? glow : core;
    ctx.lineWidth = (i % 3 === 0 ? 3 : 1.5) * k;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner * 0.62);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer * 0.62);
    ctx.stroke();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = core;
  ctx.fillStyle = glow;
  ctx.lineWidth = 5 * k;
  const pulse = 0.78 + 0.22 * Math.sin(nowMs / 75);
  switch (kind) {
    case 'agni':
    case 'param':
      // Flame / solar spear: a sharp rising core with two curling tongues.
      ctx.beginPath();
      ctx.moveTo(0, 27 * k);
      ctx.bezierCurveTo(-29 * k, 3 * k, -7 * k, -9 * k, 0, -31 * k);
      ctx.bezierCurveTo(7 * k, -8 * k, 30 * k, 1 * k, 0, 27 * k);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10 * k, 19 * k);
      ctx.quadraticCurveTo(-29 * k, -2 * k, -13 * k, -17 * k);
      ctx.moveTo(10 * k, 19 * k);
      ctx.quadraticCurveTo(29 * k, -2 * k, 13 * k, -17 * k);
      ctx.stroke();
      break;
    case 'jal':
      ctx.beginPath();
      ctx.moveTo(-30 * k, -4 * k);
      ctx.bezierCurveTo(-18 * k, 24 * k, 16 * k, 30 * k, 30 * k, -2 * k);
      ctx.bezierCurveTo(13 * k, 8 * k, 4 * k, -4 * k, 0, -27 * k);
      ctx.bezierCurveTo(-4 * k, -4 * k, -13 * k, 8 * k, -30 * k, -4 * k);
      ctx.fill();
      ctx.stroke();
      break;
    case 'vayu':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, (18 + i * 9) * k, (8 + i * 5) * k, -0.35 + i * 0.3, nowMs / 400 + i, nowMs / 400 + i + Math.PI * 1.45);
        ctx.stroke();
      }
      break;
    case 'naga':
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 12 * k, 28 * k);
        ctx.bezierCurveTo((i * 18 - 22) * k, 2 * k, (i * 18 + 22) * k, -7 * k, i * 12 * k, -27 * k);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(i * 12 * k, -28 * k, 5 * k, 0, TAU);
        ctx.fill();
      }
      break;
    case 'shyen':
      ctx.beginPath();
      ctx.moveTo(0, 25 * k);
      ctx.quadraticCurveTo(-15 * k, -2 * k, -34 * k, -22 * k);
      ctx.quadraticCurveTo(-9 * k, -20 * k, 0, -3 * k);
      ctx.quadraticCurveTo(9 * k, -20 * k, 34 * k, -22 * k);
      ctx.quadraticCurveTo(15 * k, -2 * k, 0, 25 * k);
      ctx.stroke();
      break;
    case 'chakram':
      ctx.rotate(nowMs / 120);
      ctx.beginPath();
      ctx.arc(0, 0, 27 * k, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8);
        ctx.beginPath();
        ctx.moveTo(20 * k, 0);
        ctx.lineTo(39 * k, 0);
        ctx.stroke();
      }
      break;
    case 'vidyut':
      ctx.beginPath();
      ctx.moveTo(7 * k, -31 * k);
      ctx.lineTo(-12 * k, -2 * k);
      ctx.lineTo(2 * k, -2 * k);
      ctx.lineTo(-7 * k, 30 * k);
      ctx.lineTo(16 * k, -7 * k);
      ctx.lineTo(2 * k, -7 * k);
      ctx.closePath();
      ctx.fill();
      break;
    case 'tej':
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * TAU);
        ctx.beginPath();
        ctx.ellipse(0, -22 * k, 8 * k, 18 * k, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 10 * k, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      break;
    case 'maya':
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * TAU + nowMs / 900);
        ctx.beginPath();
        ctx.moveTo(0, -34 * k);
        ctx.lineTo(9 * k, -3 * k);
        ctx.lineTo(0, 13 * k);
        ctx.lineTo(-9 * k, -3 * k);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'singularity':
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3 * k;
      ctx.beginPath();
      ctx.ellipse(0, 0, 34 * k, 12 * k, -0.2, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#05020b';
      ctx.beginPath();
      ctx.arc(0, 0, 15 * k * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 18 * k, 0, TAU);
      ctx.stroke();
      break;
    default:
      break;
  }
  ctx.restore();
}

export function drawImpact(
  ctx: Ctx,
  kind: ShowKind,
  x: number,
  y: number,
  u: number,
  k: number,
  core: string,
  glow: string,
  seed: number,
  nowMs: number,
  hq: boolean,
  camY: number,
): void {
  if (u <= 0 || u >= 1) return;
  const a = 1 - u;
  const r = rng(seed);
  const R = 300 * k;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ---- shockwaves along the ground
  for (let i = 0; i < 3; i++) {
    const q = Math.max(0, u * (1.6 - i * 0.3) - i * 0.06);
    if (q <= 0 || q >= 1) continue;
    shock(
      ctx,
      x,
      y - 2,
      30 * k + R * 1.3 * ease(q),
      (14 - i * 4) * k * (1 - q) + 2,
      i === 0 ? core : glow,
      (1 - q) * 0.9,
    );
  }
  // the first instant: a flash on the ground
  glowAt(ctx, x, y - 10, R * 0.9, core, Math.max(0, 1 - u * 6) * 0.9);

  // ---- the element breaking out of the ground
  // Land the common detonation beat before the unique elemental shape blooms.
  detonationCore(ctx, x, y, u, k, core, glow);
  const rise = Math.sin(Math.min(1, u * 1.8) * Math.PI); // up, then down
  const n = hq ? 18 : 9;
  switch (kind) {
    case 'agni':
    case 'param': {
      // tongues of fire licking up along the strike
      for (let i = 0; i < n * 2; i++) {
        const px = x + (r() - 0.5) * R * 2;
        const h = (60 + r() * 140) * k * rise * (0.7 + 0.3 * Math.sin(nowMs / 60 + i * 2.3));
        const w = (10 + r() * 16) * k;
        const g = ctx.createLinearGradient(0, y, 0, y - h);
        g.addColorStop(0, core);
        g.addColorStop(0.3, glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(px - w, y);
        ctx.quadraticCurveTo(px - w * 0.3, y - h * 0.5, px + Math.sin(nowMs / 90 + i) * w * 0.6, y - h);
        ctx.quadraticCurveTo(px + w * 0.3, y - h * 0.5, px + w, y);
        ctx.fill();
      }
      if (kind === 'param') {
        const w = 70 * k * rise;
        const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, core);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.fillRect(x - w, camY - 20, w * 2, y - camY + 20);
      }
      break;
    }
    case 'jal': {
      // water columns bursting up and the spray falling back
      for (let i = 0; i < n; i++) {
        const px = x + (r() - 0.5) * R * 1.8;
        const h = (90 + r() * 150) * k * rise;
        const w = (8 + r() * 10) * k;
        const g = ctx.createLinearGradient(0, y, 0, y - h);
        g.addColorStop(0, glow);
        g.addColorStop(0.7, core);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = g;
        ctx.fillRect(px - w / 2, y - h, w, h);
      }
      for (let i = 0; i < n * 3; i++) {
        const vx = (r() - 0.5) * 420 * k;
        const vy = -(200 + r() * 340) * k;
        const tt = u * 1.4;
        const px = x + (r() - 0.5) * R + vx * tt;
        const py = y + vy * tt + 600 * k * tt * tt;
        if (py > y) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 2 ? core : glow;
        ctx.beginPath();
        ctx.arc(px, py, (2 + r() * 2.5) * k, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'vayu': {
      // a whirl of dust and wind lines spinning up
      for (let i = 0; i < n * 2; i++) {
        const ang = r() * TAU + nowMs / 140;
        const rad = (40 + r() * 140) * k * (0.4 + u);
        const h = r() * 220 * k * rise;
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = i % 3 ? glow : core;
        ctx.lineWidth = 2 * k;
        ctx.beginPath();
        ctx.ellipse(x, y - h, rad, rad * 0.25, 0, ang, ang + 1.4);
        ctx.stroke();
      }
      break;
    }
    case 'vidyut': {
      // forks of lightning out of the sky onto the strike
      ctx.strokeStyle = core;
      for (let i = 0; i < (hq ? 6 : 3); i++) {
        if (r() > rise + 0.2) continue;
        const px = x + (r() - 0.5) * R * 1.6;
        ctx.globalAlpha = a;
        lightning(ctx, px + (r() - 0.5) * 60, camY - 10, px, y, r, 3 * k);
        glowAt(ctx, px, y - 8, 50 * k, glow, a);
      }
      break;
    }
    case 'naga': {
      // serpents arching out of the earth and diving back
      for (let i = 0; i < (hq ? 6 : 3); i++) {
        const px = x + (r() - 0.5) * R * 1.6;
        const span = (70 + r() * 70) * k;
        const h = (80 + r() * 90) * k * rise;
        ctx.globalAlpha = a;
        ctx.strokeStyle = i % 2 ? core : glow;
        ctx.lineWidth = 8 * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - span / 2, y);
        ctx.quadraticCurveTo(px, y - h * 2, px + span / 2, y);
        ctx.stroke();
        glowAt(ctx, px, y - h, 20 * k, core, a);
      }
      break;
    }
    case 'chakram': {
      // the disc slicing along the ground, a trail of sparks
      const dx = x - R + R * 2 * ease(u);
      ctx.globalAlpha = a;
      ctx.strokeStyle = core;
      ctx.lineWidth = 6 * k;
      ctx.beginPath();
      ctx.ellipse(dx, y - 30 * k, 34 * k, 34 * k, nowMs / 40, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < n; i++)
        glowAt(ctx, dx - i * 18 * k, y - 4 - r() * 20, 14 * k, glow, a * (1 - i / n));
      break;
    }
    case 'shyen': {
      // a burst of golden feathers
      for (let i = 0; i < n * 2; i++) {
        const ang = -Math.PI * (0.1 + 0.8 * r());
        const d = (40 + r() * 260) * k * ease(u);
        const px = x + Math.cos(ang) * d;
        const py = y - 20 + Math.sin(ang) * d * 0.8 + u * u * 80 * k;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + u * 6);
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 2 ? core : glow;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 * k, 2.6 * k, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'tej': {
      // a fan of sun rays from the strike
      for (let i = 0; i < 12; i++) {
        const ang = -Math.PI + (i + 0.5) * (Math.PI / 12);
        const L = (180 + 120 * r()) * k * rise;
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = i % 2 ? core : glow;
        ctx.lineWidth = 6 * k;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + Math.cos(ang) * L, y - 6 + Math.sin(ang) * L);
        ctx.stroke();
      }
      break;
    }
    case 'maya': {
      // mirror shards scattering, catching the light
      for (let i = 0; i < n * 2; i++) {
        const ang = -Math.PI * r();
        const d = (30 + r() * 240) * k * ease(u);
        const px = x + Math.cos(ang) * d;
        const py = y - 20 + Math.sin(ang) * d;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(r() * TAU + u * 8);
        ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(nowMs / 50 + i));
        ctx.fillStyle = i % 2 ? core : glow;
        ctx.beginPath();
        ctx.moveTo(0, -8 * k);
        ctx.lineTo(5 * k, 6 * k);
        ctx.lineTo(-4 * k, 4 * k);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'singularity': {
      // everything pulled into the dark centre
      for (let i = 0; i < n * 2; i++) {
        const ang = r() * TAU;
        const d = (60 + r() * 260) * k * (1 - ease(u));
        glowAt(
          ctx,
          x + Math.cos(ang + u * 4) * d,
          y - 80 * k + Math.sin(ang + u * 4) * d * 0.5,
          8 * k,
          glow,
          a,
        );
      }
      break;
    }
    default:
      break;
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // ---- earth thrown up, falling back on arcs (not for the void, which takes, or the sun, which is light)
  if (kind !== 'singularity' && kind !== 'tej') {
    for (let i = 0; i < (hq ? 22 : 10); i++) {
      const vx = (r() - 0.5) * 520 * k;
      const vy = -(160 + r() * 380) * k;
      const tt = u * 1.6;
      const px = x + (r() - 0.5) * 80 * k + vx * tt;
      const py = y + vy * tt + 700 * k * tt * tt;
      if (py > y + 2) continue;
      const s = (3 + r() * 5) * k;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(r() * TAU + tt * 8);
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = i % 3 ? '#3a2c22' : '#6a5440';
      ctx.fillRect(-s / 2, -s / 2, s, s * 0.8);
      ctx.restore();
    }
    // the dust rolling out low
    for (let i = 0; i < (hq ? 10 : 5); i++) {
      const side = i % 2 ? 1 : -1;
      const d = (40 + r() * 60 + 260 * ease(u)) * k;
      const px = x + side * d * (0.4 + r() * 0.6);
      const s = (30 + 50 * u) * k * (0.6 + r() * 0.6);
      const g = ctx.createRadialGradient(px, y - s * 0.3, 0, px, y - s * 0.3, s);
      g.addColorStop(0, 'rgba(120,104,90,0.5)');
      g.addColorStop(1, 'rgba(120,104,90,0)');
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = g;
      ctx.fillRect(px - s, y - s * 1.3, s * 2, s * 1.3);
    }
  }
  // A signature crest makes each astra recognisable at the exact point of contact.
  drawSignature(ctx, kind, x, y, u, k, core, glow, nowMs);
  ctx.globalAlpha = 1;
  ctx.restore();
}
