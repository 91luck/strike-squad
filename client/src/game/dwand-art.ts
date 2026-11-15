/**
 * Dwand Bhoomi (saga stage 9) art: the duel ground. The akhada's trampled mud, the stage's rakshasas (wrestlers who
 * grab and throw, mace spinners, slingers), Jodasur and his two halves (each a half body with a glowing seam, the
 * seam facing the other half), boulders and stones, and the akhada's old well at the rest stop. World
 * coordinates.
 */

import { bossReady, drawLimb, drawPart } from './boss3d';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  if (r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** The akhada's mud over the ground between x0 and x1 at surface y: dark wet earth, puddles, footprints. */
export function drawMud(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const t = nowMs / 1000;
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(x0, y - 3, x1 - x0, 9);
  ctx.fillStyle = '#7c4f2a';
  for (let x = Math.floor(x0 / 22) * 22; x < x1; x += 22) {
    const k = Math.abs(Math.sin(x * 0.37));
    ctx.beginPath();
    ctx.ellipse(x + 8, y - 2, 6 + k * 6, 2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(148,163,184,0.35)';
  for (let x = Math.floor(x0 / 70) * 70 + 30; x < x1; x += 70) {
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 12, 2.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.1 * Math.sin(t * 2 + x)})`;
    ctx.fillRect(x - 6, y - 2, 4, 1);
    ctx.fillStyle = 'rgba(148,163,184,0.35)';
  }
}

/** A wrestler: bare-chested in a red langot, oiled, broad; `mode` 1 holding a soldier (arms locked in front). */
export function drawPehlwan(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  mode: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (flash) ctx.filter = 'brightness(1.8)';
  const step = Math.sin(t * 6) * (mode ? 0 : 2);
  ctx.fillStyle = '#a0643a';
  ctx.fillRect(x - 10, y - 16, 7, 16 + step);
  ctx.fillRect(x + 3, y - 16, 7, 16 - step);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(x - 11, y - 20, 22, 7);
  // broad chest
  ctx.fillStyle = '#b4743f';
  ctx.beginPath();
  ctx.moveTo(x - 13, y - 20);
  ctx.lineTo(x - 15, y - 40);
  ctx.lineTo(x + 15, y - 40);
  ctx.lineTo(x + 13, y - 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x - 8, y - 36, 5, 2);
  ctx.fillRect(x + 3, y - 36, 5, 2);
  // head, shaven, with a tuft and moustache
  ctx.fillStyle = '#a0643a';
  ctx.beginPath();
  ctx.arc(x, y - 46, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.fillRect(x - 1, y - 55, 2, 4);
  ctx.fillRect(x - 5 + face * 2, y - 44, 8, 2);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(x - 1 + face * 1, y - 52, 2, 3);
  // arms
  ctx.strokeStyle = '#b4743f';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mode === 1) {
    ctx.moveTo(x - 12, y - 36);
    ctx.lineTo(x + face * 20, y - 30);
    ctx.moveTo(x + 12, y - 36);
    ctx.lineTo(x + face * 22, y - 24);
  } else {
    ctx.moveTo(x - 13, y - 36);
    ctx.lineTo(x - 18 + face * 6, y - 24 + Math.sin(t * 4) * 2);
    ctx.moveTo(x + 13, y - 36);
    ctx.lineTo(x + 18 + face * 6, y - 24 - Math.sin(t * 4) * 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** A mace spinner; `mode` 1 spinning (the mace a blur round him), 2 dizzy (stars). */
export function drawGadadhar(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  mode: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  const tilt = mode === 2 ? Math.sin(t * 5) * 0.2 : 0;
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.translate(-x, -y);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x - 8, y - 15, 6, 15);
  ctx.fillRect(x + 2, y - 15, 6, 15);
  ctx.fillStyle = '#0369a1';
  ctx.fillRect(x - 11, y - 36, 22, 22);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 11, y - 36, 22, 3);
  ctx.fillStyle = '#a0643a';
  ctx.beginPath();
  ctx.arc(x, y - 42, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 7, y - 50, 14, 4);
  ctx.restore();
  if (mode === 1) {
    // the mace whirling round: a ring of blur and the head
    const a = t * 18;
    ctx.strokeStyle = 'rgba(212,160,23,0.5)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(x, y - 30, 34, 12, 0, 0, TAU);
    ctx.stroke();
    const mx = x + Math.cos(a) * 34;
    const my = y - 30 + Math.sin(a) * 12;
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, TAU);
    ctx.fill();
    glow(ctx, x, y - 30, 40, 'rgba(250,204,21,0.25)');
  } else {
    const mx = x + face * 18;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + face * 8, y - 28);
    ctx.lineTo(mx, y - 52);
    ctx.stroke();
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.arc(mx, y - 56, 9, 0, TAU);
    ctx.fill();
  }
  if (mode === 2)
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i / 3) * TAU;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 12, y - 58 + Math.sin(a) * 4, 2.5, 0, TAU);
      ctx.fill();
    }
}

/** A slinger whirling his sling overhead; `since` ticks since the last stone. */
export function drawSlinger(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  since: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  ctx.fillStyle = '#292524';
  ctx.fillRect(x - 6, y - 13, 4, 13);
  ctx.fillRect(x + 2, y - 13, 4, 13);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(x - 7, y - 29, 14, 17);
  ctx.fillStyle = '#a0643a';
  ctx.beginPath();
  ctx.arc(x, y - 34, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(x - 7, y - 41, 14, 4);
  const hx = x + face * 4;
  const hy = y - 44;
  ctx.strokeStyle = '#a0643a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + face * 4, y - 26);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  if (since > 6) {
    const a = t * 14;
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(a) * 16, hy + Math.sin(a) * 6 - 4);
    ctx.stroke();
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.arc(hx + Math.cos(a) * 16, hy + Math.sin(a) * 6 - 4, 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Jodasur's half body: `side` -1 the left half (its seam on the right), 1 the right half. */
export function drawArdh(ctx: Ctx, x: number, y: number, side: number, nowMs: number, flash: boolean): void {
  const t = nowMs / 1000;
  const seam = -side; // the cut side faces the other half
  ctx.save();
  if (flash) ctx.filter = 'brightness(1.8)';
  const crawl = Math.sin(t * 6) * 2;
  // half of the body, upright, a single leg hopping
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(x - 6, y - 26 + crawl, 12, 26 - crawl);
  ctx.fillStyle = '#9a3412';
  ctx.beginPath();
  ctx.moveTo(x + seam * 2, y - 26);
  ctx.lineTo(x - seam * 16, y - 26);
  ctx.lineTo(x - seam * 18, y - 64);
  ctx.lineTo(x + seam * 2, y - 64);
  ctx.closePath();
  ctx.fill();
  // half a head with a crown
  ctx.beginPath();
  ctx.arc(
    x + seam * 2,
    y - 72,
    11,
    seam > 0 ? Math.PI / 2 : -Math.PI / 2,
    seam > 0 ? Math.PI * 1.5 : Math.PI / 2,
  );
  ctx.fillStyle = '#a0643a';
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - seam * 10 - 2, y - 88, 12, 6);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x - seam * 5, y - 75, 3, 3);
  // one arm reaching toward the other half
  ctx.strokeStyle = '#a0643a';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - seam * 14, y - 56);
  ctx.lineTo(x + seam * 16, y - 46 + crawl * 2);
  ctx.stroke();
  // the glowing seam
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + seam * 2, y - 84);
  ctx.lineTo(x + seam * 2, y - 2);
  ctx.stroke();
  glow(ctx, x + seam * 2, y - 44, 40, 'rgba(250,204,21,0.45)');
  ctx.restore();
}

export interface JodasurView {
  at: number;
  tt: number;
  wind: number;
  dead: boolean;
  flash: boolean;
  face: number;
  phase: number;
  /** split in two (the halves are drawn on their own) */
  split: boolean;
  ids: { hurl: number; pounce: number; bull: number };
}

/**
 * Jodasur, king of Rajgarh: a towering wrestler-king, crowned, a seam of light down the middle of his body (where
 * the demoness Jara joined his two halves). Raises a boulder to hurl, crouches to pounce, lowers his head to charge.
 */
export function drawJodasur(ctx: Ctx, x: number, y: number, nowMs: number, v: JodasurView): void {
  if (v.split) return;
  const t = nowMs / 1000;
  ctx.save();
  if (v.flash) ctx.filter = 'brightness(1.7)';
  if (v.dead) {
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(x - 160, y - 18, 40, 18);
    ctx.fillRect(x + 120, y - 18, 40, 18);
    ctx.restore();
    return;
  }
  const k = v.wind > 0 ? Math.min(1, v.tt / v.wind) : 1;
  const f = v.face;
  const crouch = v.at === v.ids.pounce && v.tt < v.wind ? k * 12 : 0;
  const lean = v.at === v.ids.bull && v.tt >= v.wind ? f * 0.25 : 0;
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.translate(-x, -y);
  // rendered in 3D once loaded (boss3d.ts): body, arms and the boulder
  const r3 = bossReady('jodasur');
  if (r3) drawPart(ctx, 'jodasur', 'body', x, y + crouch * 0.6, 0, f < 0);
  else {
    // legs
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(x - 18, y - 36 + crouch / 2, 14, 36 - crouch / 2);
    ctx.fillRect(x + 4, y - 36 + crouch / 2, 14, 36 - crouch / 2);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 22, y - 46 + crouch, 44, 10);
    // torso
    ctx.fillStyle = '#9a3412';
    ctx.beginPath();
    ctx.moveTo(x - 24, y - 44 + crouch);
    ctx.lineTo(x - 30, y - 86 + crouch);
    ctx.lineTo(x + 30, y - 86 + crouch);
    ctx.lineTo(x + 24, y - 44 + crouch);
    ctx.closePath();
    ctx.fill();
    // the seam
    ctx.strokeStyle = `rgba(253,224,71,${0.6 + 0.3 * Math.sin(t * 3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 110 + crouch);
    ctx.lineTo(x, y - 40 + crouch);
    ctx.stroke();
    // head and crown
    ctx.fillStyle = '#a0643a';
    ctx.beginPath();
    ctx.arc(x, y - 96 + crouch, 12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 8, y - 90 + crouch, 16, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 6 + f * 2, y - 99 + crouch, 3, 3);
    ctx.fillRect(x + 3 + f * 2, y - 99 + crouch, 3, 3);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 104 + crouch);
    ctx.lineTo(x - 8, y - 120 + crouch);
    ctx.lineTo(x, y - 110 + crouch);
    ctx.lineTo(x + 8, y - 120 + crouch);
    ctx.lineTo(x + 12, y - 104 + crouch);
    ctx.closePath();
    ctx.fill();
  }
  // arms
  if (r3) {
    if (v.at === v.ids.hurl && v.tt < v.wind + 4) {
      if (v.tt < v.wind) drawPart(ctx, 'jodasur', 'boulder', x, y - 132 - k * 6);
      drawLimb(ctx, 'jodasur', 'arm', x - 26, y - 80, x - 18, y - 120 - k * 6);
      drawLimb(ctx, 'jodasur', 'arm', x + 26, y - 80, x + 18, y - 120 - k * 6, true);
    } else {
      drawLimb(ctx, 'jodasur', 'arm', x - 28, y - 80 + crouch, x - 34 + f * 8, y - 50 + crouch);
      drawLimb(ctx, 'jodasur', 'arm', x + 28, y - 80 + crouch, x + 34 + f * 8, y - 50 + crouch, true);
    }
  }
  ctx.strokeStyle = '#a0643a';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (r3) {
    // drawn above
  } else if (v.at === v.ids.hurl && v.tt < v.wind + 4) {
    ctx.moveTo(x - 26, y - 80);
    ctx.lineTo(x - 18, y - 120 - k * 6);
    ctx.moveTo(x + 26, y - 80);
    ctx.lineTo(x + 18, y - 120 - k * 6);
    ctx.stroke();
    if (v.tt < v.wind) {
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.arc(x, y - 132 - k * 6, 18, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.moveTo(x - 28, y - 80 + crouch);
    ctx.lineTo(x - 34 + f * 8, y - 50 + crouch);
    ctx.moveTo(x + 28, y - 80 + crouch);
    ctx.lineTo(x + 34 + f * 8, y - 50 + crouch);
    ctx.stroke();
  }
  ctx.restore();
  if (v.at === v.ids.bull && v.tt >= v.wind)
    for (let i = 0; i < 5; i++) {
      const ph = (nowMs / 300 + i / 5) % 1;
      ctx.fillStyle = `rgba(120,80,40,${0.5 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x - v.face * (30 + ph * 60), y - 8 - ph * 14, 7 + ph * 10, 0, TAU);
      ctx.fill();
    }
}

/** Stage 9 shots: stones and boulders (bomb), the pounce's shock (wave). */
export function drawDwandShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  if (kind === 'bomb') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(nowMs / 150 + b.id);
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.lineTo(-2, -8);
    ctx.lineTo(7, -4);
    ctx.lineTo(8, 4);
    ctx.lineTo(0, 8);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#a8a29e';
    ctx.fillRect(-3, -4, 4, 3);
    ctx.restore();
    return true;
  }
  if (kind === 'wave') {
    const dir = Math.sign(b.vx) || 1;
    ctx.fillStyle = 'rgba(120,80,40,0.8)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(b.x - dir * i * 8, b.y + 8 - i * 2, 9 - i * 1.5, Math.PI, 0);
      ctx.fill();
    }
    return true;
  }
  return false;
}

/** The rest stop: the akhada's old well under a peepal, a rack of maces and a stone mace on its plinth. */
export function drawAkhadaRest(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  const t = nowMs / 1000;
  // peepal tree
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(cx - 120, y - 90, 10, 90);
  ctx.fillStyle = '#15803d';
  for (const [dx, dy, r] of [
    [-115, -100, 34],
    [-90, -120, 26],
    [-140, -118, 24],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, y + dy + Math.sin(t + dx) * 1.5, r, 0, TAU);
    ctx.fill();
  }
  // shrine plinth
  ctx.fillStyle = '#78716c';
  ctx.fillRect(cx - 26, y - 14, 52, 14);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(cx - 26, y - 16, 52, 3);
  // a great stone mace on its plinth (the akhada's trophy), and a pair of clubs crossed before it
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(cx - 4, y - 46, 8, 32);
  ctx.beginPath();
  ctx.arc(cx, y - 54, 14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.arc(cx - 4, y - 58, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 20, y - 2);
  ctx.lineTo(cx + 16, y - 22);
  ctx.moveTo(cx + 20, y - 2);
  ctx.lineTo(cx - 16, y - 22);
  ctx.stroke();
  glow(ctx, cx, y - 50, 70, 'rgba(251,146,60,0.25)');
  // maces leaning on a rack, and a well
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx + 50, y - 40, 40, 4);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 56 + i * 12, y);
    ctx.lineTo(cx + 54 + i * 12, y - 38);
    ctx.stroke();
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.arc(cx + 54 + i * 12, y - 42, 6, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(cx + 110, y - 18, 34, 18);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(cx + 114, y - 18, 26, 4);
}
