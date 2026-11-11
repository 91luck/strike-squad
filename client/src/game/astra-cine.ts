import type { PowerKind } from '@strikesquad/shared';

/**
 * Astra cinematics: what the world does when an astra is called. No text, no banners: the astra shows itself.
 *
 * Every call opens a sacred sigil (a mandala of two counter-turning rings, petals and runes) around the caster,
 * gathers light into them, then releases the astra's own apparition across the sky:
 *
 *   agni         a phoenix of fire sweeping forward, the sky glowing orange, heat rising
 *   varuna       a great wave curling over the field, light shafts through falling water
 *   vayu         a tornado spiral with streaming wind lines
 *   singularity  a black hole: a dark core, a lensing ring and an accretion swirl pulling stars in
 *   naga         a giant cobra rising behind the hero, hood spread
 *   garuda       the golden eagle, wings spread, diving across the sky
 *   sudarshana   a vast golden chakra halo with radiant spokes behind the hero
 *   pashupata    the third eye opening in the clouds, a trident of lightning below it
 *   vaishnava    a lotus of light blooming at the hero's feet
 *   brahma       (team) a sun disc gathering over the field before the strike
 *
 * Everything is drawn in world coordinates with additive light, fades by itself in about 1.6 s, and costs little
 * (paths and gradients, no images). Reduced motion: the sigil and apparition still appear, without the shake.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export type CineKind = PowerKind | 'brahma';

interface Cine {
  kind: CineKind;
  x: number;
  /** Ground under the caster. */
  y: number;
  f: 1 | -1;
  born: number;
  dur: number;
}

/** Each astra's light: core, glow, and the tint the sky takes. */
export const CINE_COLOR: Record<CineKind, { core: string; glow: string; sky: string }> = {
  agni: { core: '#fff3c4', glow: '#ff7a1a', sky: 'rgba(255,110,30,' },
  varuna: { core: '#e0f7ff', glow: '#38bdf8', sky: 'rgba(30,120,220,' },
  vayu: { core: '#ffffff', glow: '#cbd5e1', sky: 'rgba(200,215,235,' },
  singularity: { core: '#f5e8ff', glow: '#8b5cf6', sky: 'rgba(40,10,80,' },
  naga: { core: '#ecfccb', glow: '#4ade80', sky: 'rgba(20,110,50,' },
  garuda: { core: '#fff7d6', glow: '#f59e0b', sky: 'rgba(240,150,40,' },
  sudarshana: { core: '#fffbe6', glow: '#facc15', sky: 'rgba(250,200,40,' },
  pashupata: { core: '#e0fbff', glow: '#22d3ee', sky: 'rgba(20,80,110,' },
  vaishnava: { core: '#fffbeb', glow: '#fbbf24', sky: 'rgba(250,190,60,' },
  brahma: { core: '#ffffff', glow: '#fde047', sky: 'rgba(255,230,140,' },
};

const DUR: Record<CineKind, number> = {
  agni: 1.6,
  varuna: 1.8,
  vayu: 1.4,
  singularity: 1.8,
  naga: 1.7,
  garuda: 1.6,
  sudarshana: 1.8,
  pashupata: 1.9,
  vaishnava: 1.7,
  brahma: 1.4,
};

const ease = (t: number): number => 1 - (1 - t) ** 3;
/** 0 → 1 → 0 over the effect: in for the first `a` of it, out over the last `b`. */
const envelope = (t: number, a = 0.18, b = 0.35): number => Math.max(0, Math.min(1, t / a, (1 - t) / b));

export class AstraCinema {
  private list: Cine[] = [];

  add(kind: CineKind, x: number, y: number, f: 1 | -1, nowMs: number): void {
    if (this.list.length > 6) this.list.shift();
    this.list.push({ kind, x, y, f, born: nowMs, dur: DUR[kind] * 1000 });
  }

  clear(): void {
    this.list = [];
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  /** The sky behind the world: tints and apparitions that sit behind the fighters. */
  drawBack(ctx: Ctx, nowMs: number, camX: number, camY: number, viewW: number, viewH: number): void {
    this.list = this.list.filter((c) => nowMs - c.born < c.dur);
    for (const c of this.list) {
      // (clamped: the frame clock can run a hair behind the moment the astra was added)
      const t = Math.max(0, Math.min(1, (nowMs - c.born) / c.dur));
      const env = envelope(t);
      const col = CINE_COLOR[c.kind];
      // The sky takes the astra's colour, strongest near the caster.
      const g = ctx.createRadialGradient(c.x, c.y - 160, 20, c.x, c.y - 160, viewW * 0.9);
      g.addColorStop(0, `${col.sky}${0.42 * env})`);
      g.addColorStop(1, `${col.sky}0)`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(camX, camY, viewW, viewH);
      ctx.globalCompositeOperation = 'lighter';
      switch (c.kind) {
        case 'naga':
          cobra(ctx, c, t, env, nowMs);
          break;
        case 'sudarshana':
          chakraHalo(ctx, c, t, env, nowMs);
          break;
        case 'pashupata':
          thirdEye(ctx, c, t, env, nowMs, camX, camY, viewW);
          break;
        case 'singularity':
          blackHole(ctx, c, t, env, nowMs);
          break;
        case 'brahma':
          sunDisc(ctx, c, t, env, nowMs, camY);
          break;
        case 'varuna':
          wave(ctx, c, t, env, nowMs);
          break;
      }
      ctx.restore();
    }
  }

  /** In front of the fighters: the sigil, the gathering light and the flying apparitions. */
  drawFront(ctx: Ctx, nowMs: number): void {
    for (const c of this.list) {
      const t = Math.max(0, Math.min(1, (nowMs - c.born) / c.dur));
      const env = envelope(t);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      sigil(ctx, c, t, env, nowMs);
      switch (c.kind) {
        case 'agni':
          phoenix(ctx, c, t, env, nowMs);
          break;
        case 'garuda':
          eagle(ctx, c, t, env, nowMs);
          break;
        case 'vaishnava':
          lotus(ctx, c, t, env, nowMs);
          break;
      }
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ shared pieces

function radial(ctx: Ctx, x: number, y: number, r: number, inner: string, a: number): void {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/**
 * The sigil every astra opens: a flat mandala on the ground (two counter-turning rings, sixteen petals, runes) and a
 * standing halo behind the caster. Light streams into the caster during the first third, then bursts outwards.
 */
function sigil(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  const col = CINE_COLOR[c.kind];
  const gx = c.x;
  const gy = c.y - 2;
  const grow = ease(Math.min(1, t * 3));
  const R = 70 * grow + 10;
  const spin = nowMs / 900;
  // ground mandala (squashed: lying on the floor)
  ctx.save();
  ctx.translate(gx, gy);
  ctx.scale(1, 0.28);
  ctx.globalAlpha = env * 0.9;
  ctx.strokeStyle = col.glow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.72, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = spin + (i / 16) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.12) * R * 0.95,
      Math.sin(a + 0.12) * R * 0.95,
      Math.cos(a + 0.2) * R * 0.72,
      Math.sin(a + 0.2) * R * 0.72,
    );
    ctx.stroke();
  }
  ctx.fillStyle = col.core;
  for (let i = 0; i < 8; i++) {
    const a = -spin * 1.6 + (i / 8) * TAU;
    ctx.fillRect(Math.cos(a) * R * 0.86 - 3, Math.sin(a) * R * 0.86 - 3, 6, 6);
  }
  ctx.restore();
  radial(ctx, gx, gy, R * 1.2, col.glow, env * 0.35);
  // standing halo behind the caster
  const hy = c.y - 40;
  ctx.save();
  ctx.globalAlpha = env * 0.8;
  ctx.strokeStyle = col.core;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, hy, 34 * grow + 4, spin, spin + TAU * 0.8);
  ctx.stroke();
  ctx.strokeStyle = col.glow;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(c.x, hy, 46 * grow + 4, -spin * 1.3, -spin * 1.3 + TAU * 0.6);
  ctx.stroke();
  ctx.restore();
  // gathering streaks (first third), then the burst
  if (t < 0.34) {
    const k = t / 0.34;
    ctx.strokeStyle = col.core;
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + i * 0.7;
      const r0 = 160 * (1 - k) + 20;
      const r1 = r0 + 40 * (1 - k);
      ctx.globalAlpha = 0.6 * k + 0.2;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a) * r1, hy + Math.sin(a) * r1);
      ctx.lineTo(c.x + Math.cos(a) * r0, hy + Math.sin(a) * r0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    radial(ctx, c.x, hy, 30 + 40 * k, col.core, 0.5 * k);
  } else if (t < 0.6) {
    const k = (t - 0.34) / 0.26;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = col.core;
    ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(c.x, hy, 30 + 260 * ease(k), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // rays
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + nowMs / 2000;
      ctx.save();
      ctx.translate(c.x, hy);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, 320, 0);
      g.addColorStop(0, col.core);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(320 * ease(k) + 40, -16);
      ctx.lineTo(320 * ease(k) + 40, 16);
      ctx.lineTo(0, 4);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------------ apparitions

/** A phoenix of fire: spread wings, a long flame tail, flying forward from the caster. */
function phoenix(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  if (t < 0.25) return;
  const k = (t - 0.25) / 0.75;
  const x = c.x + c.f * (40 + 620 * ease(k));
  const y = c.y - 120 - Math.sin(k * Math.PI) * 60;
  const flap = Math.sin(nowMs / 90) * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(c.f * 1.3, 1.3);
  ctx.globalAlpha = env;
  radial(ctx, 0, 0, 120, '#ff7a1a', 0.6 * env);
  // tail: flowing flame ribbons
  for (let i = 0; i < 5; i++) {
    const w = Math.sin(nowMs / 120 + i) * 10;
    const g = ctx.createLinearGradient(0, 0, -200, 0);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.3, '#ffb347');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-10, -4 + i * 2);
    ctx.quadraticCurveTo(-90, -30 + i * 14 + w, -200 - i * 10, -20 + i * 16 + w);
    ctx.quadraticCurveTo(-90, -10 + i * 10 + w, -10, 4 + i * 2);
    ctx.fill();
  }
  // wings
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);
    ctx.rotate(-0.35 + flap * side * 0.6);
    const g = ctx.createLinearGradient(0, 0, 0, -130);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.5, '#ff9a2e');
    g.addColorStop(1, 'rgba(220,40,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-30, -60, -10, -120, 50, -140);
    for (let f = 0; f < 5; f++) ctx.lineTo(40 - f * 18, -110 + f * 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // body and head
  ctx.fillStyle = '#fff7da';
  ctx.beginPath();
  ctx.ellipse(10, 0, 30, 10, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(40, -6);
  ctx.lineTo(62, 0);
  ctx.lineTo(40, 6);
  ctx.fill();
  ctx.restore();
}

/** The golden eagle diving across the sky, wings wide, with a wind wake. */
function eagle(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  if (t < 0.2) return;
  const k = (t - 0.2) / 0.8;
  const x = c.x - c.f * 420 + c.f * 1000 * ease(k);
  const y = c.y - 260 + 180 * Math.sin(k * Math.PI * 0.9);
  const flap = Math.sin(nowMs / 140) * 0.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(c.f * 1.6, 1.6);
  ctx.globalAlpha = env;
  radial(ctx, 0, 0, 140, '#f59e0b', 0.5 * env);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(1, side);
    ctx.rotate(flap * side);
    const g = ctx.createLinearGradient(0, 0, -40, -150);
    g.addColorStop(0, '#fff7d6');
    g.addColorStop(0.6, '#fbbf24');
    g.addColorStop(1, 'rgba(180,90,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(-10, -70, -60, -150);
    for (let f = 0; f < 6; f++) ctx.lineTo(-60 + f * 14, -150 + f * 22 + (f % 2) * 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 12, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(-70, -14);
  ctx.lineTo(-64, 0);
  ctx.lineTo(-70, 14);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(38, -6);
  ctx.lineTo(60, 2);
  ctx.lineTo(38, 8);
  ctx.fill();
  ctx.restore();
  // wake
  ctx.strokeStyle = 'rgba(255,240,200,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = env * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - c.f * (60 + i * 30), y + (i - 2) * 18);
    ctx.lineTo(x - c.f * (260 + i * 50), y + (i - 2) * 30);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A lotus of light opening under the caster, petals rising. */
function lotus(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  const open = ease(Math.min(1, t * 2));
  ctx.save();
  ctx.translate(c.x, c.y - 4);
  ctx.globalAlpha = env;
  for (let layer = 0; layer < 2; layer++) {
    const n = layer ? 8 : 10;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * Math.PI * (0.9 + open * 0.5);
      ctx.save();
      ctx.rotate(a + Math.PI / 2);
      const L = (layer ? 70 : 100) * open + 10;
      const g = ctx.createLinearGradient(0, 0, 0, -L);
      g.addColorStop(0, '#fffbeb');
      g.addColorStop(1, layer ? 'rgba(251,191,36,0.1)' : 'rgba(244,114,182,0.1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-L * 0.28, -L * 0.55, 0, -L);
      ctx.quadraticCurveTo(L * 0.28, -L * 0.55, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  radial(ctx, c.x, c.y - 30, 110 * open, '#fde68a', env * 0.5);
  // rising motes
  for (let i = 0; i < 12; i++) {
    const p = ((nowMs / 1400 + i / 12) % 1) * env;
    ctx.fillStyle = '#fffbeb';
    ctx.globalAlpha = (1 - p) * env;
    ctx.fillRect(c.x + Math.sin(i * 2.3) * 60, c.y - 20 - p * 180, 3, 3);
  }
  ctx.globalAlpha = 1;
}

/** A cobra rising behind the caster, hood spread, swaying. */
function cobra(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  const rise = ease(Math.min(1, t * 2.2));
  const sway = Math.sin(nowMs / 260) * 14;
  const bx = c.x + c.f * 90; // rising just ahead of the caster, over the field
  const top = c.y - 60 - 260 * rise;
  ctx.save();
  ctx.globalAlpha = env * 0.75;
  const g = ctx.createLinearGradient(0, c.y, 0, top);
  g.addColorStop(0, 'rgba(34,197,94,0)');
  g.addColorStop(0.4, 'rgba(74,222,128,0.6)');
  g.addColorStop(1, 'rgba(190,242,100,0.9)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(bx, c.y);
  ctx.bezierCurveTo(bx + 60, c.y - 80, bx - 60 + sway, top + 140, bx + sway, top + 40);
  ctx.stroke();
  // hood
  ctx.translate(bx + sway, top);
  ctx.fillStyle = 'rgba(74,222,128,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, 20, 70 * rise, 60 * rise, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(236,252,203,0.9)';
  ctx.beginPath();
  ctx.ellipse(-16, 18, 10 * rise, 14 * rise, 0, 0, TAU);
  ctx.ellipse(16, 18, 10 * rise, 14 * rise, 0, 0, TAU);
  ctx.fill();
  // head and eyes
  ctx.fillStyle = 'rgba(190,242,100,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, -18, 24 * rise, 16 * rise, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(-12, -22, 6, 4);
  ctx.fillRect(6, -22, 6, 4);
  ctx.restore();
}

/** A giant golden chakra spinning behind the caster, spokes of light. */
function chakraHalo(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  const R = 150 * ease(Math.min(1, t * 2.5));
  const cy = c.y - 120;
  const spin = nowMs / 160;
  radial(ctx, c.x, cy, R * 1.6, '#facc15', env * 0.45);
  ctx.save();
  ctx.translate(c.x, cy);
  ctx.rotate(spin);
  ctx.globalAlpha = env * 0.85;
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.35, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    ctx.rotate(TAU / 12);
    ctx.beginPath();
    ctx.moveTo(R * 0.35, 0);
    ctx.lineTo(R, 0);
    ctx.stroke();
    ctx.fillStyle = '#fffbe6';
    ctx.beginPath();
    ctx.moveTo(R, -8);
    ctx.lineTo(R + 22, 0);
    ctx.lineTo(R, 8);
    ctx.fill();
  }
  ctx.restore();
}

/** The third eye opening in the sky, a trident of lightning striking below it. */
function thirdEye(
  ctx: Ctx,
  c: Cine,
  t: number,
  env: number,
  nowMs: number,
  camX: number,
  camY: number,
  viewW: number,
): void {
  // high in the visible sky, ahead of the caster
  const ex = Math.max(camX + 120, Math.min(camX + viewW - 120, c.x + c.f * 120));
  const ey = camY + 80;
  const open = ease(Math.min(1, t * 2.2));
  radial(ctx, ex, ey, 220, '#22d3ee', env * 0.5);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.globalAlpha = env;
  ctx.fillStyle = 'rgba(224,251,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(-90, 0);
  ctx.quadraticCurveTo(0, -60 * open, 90, 0);
  ctx.quadraticCurveTo(0, 60 * open, -90, 0);
  ctx.fill();
  ctx.fillStyle = '#0e7490';
  ctx.beginPath();
  ctx.arc(0, 0, 26 * open, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ecfeff';
  ctx.beginPath();
  ctx.arc(0, 0, 9 * open, 0, TAU);
  ctx.fill();
  ctx.restore();
  // trident lightning
  if (t > 0.35 && t < 0.8 && Math.floor(nowMs / 60) % 2 === 0) {
    ctx.strokeStyle = '#e0fbff';
    ctx.lineWidth = 3;
    for (const dx of [-60, 0, 60]) {
      let x = ex + dx * 0.3;
      let y = ey + 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < c.y) {
        y += 30;
        x += (Math.random() - 0.5) * 30 + dx * 0.12;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

/** A black hole: dark core, a bright lensing ring, an accretion swirl drawing stars in. */
function blackHole(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  const x = c.x + c.f * 220;
  const y = c.y - 140;
  const R = 70 * ease(Math.min(1, t * 2));
  radial(ctx, x, y, R * 3, '#8b5cf6', env * 0.5);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = env;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(nowMs / (300 + i * 140) + i);
    ctx.scale(1, 0.32);
    ctx.strokeStyle = i === 1 ? 'rgba(255,255,255,0.85)' : 'rgba(196,181,253,0.8)';
    ctx.lineWidth = 6 - i * 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, R * (1.5 + i * 0.35), 0, TAU * 0.85);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#05010c';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#f5e8ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, R + 3, 0, TAU);
  ctx.stroke();
  // stars spiralling in
  for (let i = 0; i < 24; i++) {
    const p = (nowMs / 900 + i / 24) % 1;
    const a = i * 2.4 + p * 5;
    const r = R + (1 - p) * 220;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = env * p;
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.6, 3, 3);
  }
  ctx.restore();
}

/** Brahmastra gathering: a white-gold sun disc over the caster. */
function sunDisc(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number, camY: number): void {
  const y = camY + 100;
  const R = 60 + 40 * Math.sin(nowMs / 200);
  radial(ctx, c.x, y, 300, '#fde047', env * 0.6);
  radial(ctx, c.x, y, R, '#ffffff', env);
  ctx.save();
  ctx.translate(c.x, y);
  ctx.rotate(nowMs / 1500);
  ctx.globalAlpha = env * 0.6;
  ctx.fillStyle = '#fff7cc';
  for (let i = 0; i < 16; i++) {
    ctx.rotate(TAU / 16);
    ctx.beginPath();
    ctx.moveTo(R, -5);
    ctx.lineTo(R + 120 + (i % 2) * 60, 0);
    ctx.lineTo(R, 5);
    ctx.fill();
  }
  ctx.restore();
  void t;
}

/** Varuna's great wave: a curling crest moving across the field, light shafts through the spray. */
function wave(ctx: Ctx, c: Cine, t: number, env: number, nowMs: number): void {
  const k = ease(Math.min(1, t * 1.3));
  const front = c.x - c.f * 200 + c.f * 900 * k;
  const crest = c.y - 220;
  ctx.save();
  ctx.globalAlpha = env * 0.7;
  const g = ctx.createLinearGradient(0, crest, 0, c.y);
  g.addColorStop(0, 'rgba(224,247,255,0.9)');
  g.addColorStop(0.4, 'rgba(56,189,248,0.6)');
  g.addColorStop(1, 'rgba(14,90,160,0.1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(front - c.f * 700, c.y);
  ctx.lineTo(front - c.f * 700, crest + 120);
  for (let i = 0; i <= 20; i++) {
    const xx = front - c.f * 700 + c.f * i * 35;
    ctx.lineTo(xx, crest + 100 - Math.sin((i / 20) * Math.PI * 0.9) * 100 + Math.sin(nowMs / 150 + i) * 6);
  }
  // the curl
  ctx.quadraticCurveTo(front + c.f * 70, crest - 30, front + c.f * 40, crest + 50);
  ctx.quadraticCurveTo(front + c.f * 10, crest + 20, front, crest + 60);
  ctx.lineTo(front, c.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // light shafts and spray
  for (let i = 0; i < 6; i++) {
    const sx = front - c.f * (80 + i * 100);
    const gg = ctx.createLinearGradient(sx, crest, sx + 40, c.y);
    gg.addColorStop(0, `rgba(224,247,255,${0.3 * env})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(sx, crest, 26, c.y - crest);
  }
  for (let i = 0; i < 20; i++) {
    const p = (nowMs / 700 + i / 20) % 1;
    ctx.fillStyle = 'rgba(224,247,255,0.9)';
    ctx.globalAlpha = env * (1 - p);
    ctx.fillRect(front + c.f * Math.sin(i) * 40, crest + 40 - p * 80 + i, 3, 3);
  }
  ctx.globalAlpha = 1;
}
