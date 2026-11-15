/**
 * Naag Lok (saga stage 4) art: the dark (a veil over the screen with holes of light around the squad, glowing
 * mushrooms, poison and venom), poison pools, the stage's rakshasas (naga warriors, wall cobras, serpent eggs),
 * Vishdhar and his heads, venom, and Sarpraj's shrine at the rest stop. World coordinates unless noted.
 */

import { bossReady, drawPart } from './boss3d';

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

function flashOn(ctx: Ctx, flash: boolean): void {
  if (flash) ctx.filter = 'brightness(2.6) saturate(0.4)';
}

export interface Light {
  x: number;
  y: number;
  r: number;
}

let veil: HTMLCanvasElement | null = null;

/**
 * The dark, drawn over the whole screen (screen pixels: `toScreen` maps a world point). Everything is black at
 * `depth` but where a light cuts a soft hole.
 */
export function drawDark(
  ctx: Ctx,
  w: number,
  h: number,
  lights: Light[],
  toScreen: (x: number, y: number) => [number, number],
  scale: number,
  depth: number,
): void {
  if (typeof document === 'undefined') return;
  if (!veil) veil = document.createElement('canvas');
  if (veil.width !== w || veil.height !== h) {
    veil.width = w;
    veil.height = h;
  }
  const g = veil.getContext('2d');
  if (!g) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(4,6,10,${depth})`;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const [sx, sy] = toScreen(l.x, l.y);
    const r = l.r * scale;
    if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue;
    const grad = g.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.75)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(veil, 0, 0);
  ctx.restore();
}

/** A cluster of glowing mushrooms on the cave floor at (x, y). */
export function drawMushrooms(ctx: Ctx, x: number, y: number, seed: number, nowMs: number): void {
  const pulse = 0.75 + 0.25 * Math.sin(nowMs / 700 + seed);
  for (let i = 0; i < 3; i++) {
    const mx = x + (i - 1) * 7 + ((seed * 13) % 5);
    const h = 6 + ((seed + i * 3) % 5);
    ctx.fillStyle = '#d1fae5';
    ctx.fillRect(mx - 1, y - h, 2, h);
    ctx.fillStyle = i % 2 ? '#2dd4bf' : '#a3e635';
    ctx.beginPath();
    ctx.ellipse(mx, y - h, 5, 3, 0, Math.PI, TAU);
    ctx.fill();
  }
  glow(ctx, x, y - 8, 26 * pulse, 'rgba(94,234,212,0.45)');
}

/** A pool of poison: green, bubbling, its fumes rising. */
export function drawPoison(
  ctx: Ctx,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, 'rgba(132,204,22,0.75)');
  g.addColorStop(1, 'rgba(22,101,52,0.9)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1; x += 6) ctx.lineTo(x, top + Math.sin(x / 12 + t * 2) * 1.5);
  ctx.lineTo(x1, bottom);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < Math.max(2, (x1 - x0) / 24); i++) {
    const life = (t * 0.8 + i * 0.37) % 1;
    const bx = x0 + 6 + (((i * 53) % 97) / 97) * (x1 - x0 - 12);
    ctx.fillStyle = `rgba(217,249,157,${1 - life})`;
    ctx.beginPath();
    ctx.arc(bx, top - life * 18, 2 + life * 2, 0, TAU);
    ctx.fill();
  }
  glow(ctx, (x0 + x1) / 2, top, (x1 - x0) * 0.7, 'rgba(132,204,22,0.3)');
}

/** Naga warrior: a scaled serpent body slithering low, a small hooded torso raised with a curved blade. */
export function drawNagaWarrior(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.7;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.strokeStyle = '#166534';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 8; k++) {
    const px = -20 + k * 4;
    const py = -4 + Math.sin(t * 10 + k * 0.9) * 2;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = '#bef264';
  ctx.lineWidth = 2;
  ctx.stroke();
  // raised torso and hood
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.ellipse(13, -10, 6, 7, 0.3, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4d7c0f';
  ctx.beginPath();
  ctx.arc(16, -16, 4.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.fillRect(17, -17, 2, 2);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(20, -9, 6, -1.2, 0.6);
  ctx.stroke();
  ctx.restore();
  glow(ctx, x + f * 17, y - 16, 8, 'rgba(253,224,71,0.6)');
}

/** Wall cobra: a big cobra coiled on a ledge, hood spread, venom glowing at its fangs. */
export function drawSpitter(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.fillStyle = '#14532d';
  ctx.beginPath();
  ctx.ellipse(0, -5, 13, 5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#166534';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.quadraticCurveTo(-8, -20, 2, -24 + Math.sin(t * 2) * 1.5);
  ctx.stroke();
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.ellipse(3, -26, 9, 10, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.ellipse(1, -26, 2.5, 4, 0, 0, TAU);
  ctx.ellipse(6, -26, 2.5, 4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.ellipse(8, -30, 5, 4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(10, -31, 2, 2);
  ctx.restore();
  glow(ctx, x + f * 12, y - 28, 10, 'rgba(163,230,53,0.7)');
}

/** A serpent egg: pale, veined, cracking more and more as it nears hatching (`crack` 0..1). */
export function drawEgg(ctx: Ctx, x: number, y: number, crack: number, nowMs: number, flash: boolean): void {
  const shake = crack > 0.6 ? Math.sin(nowMs / 30) * 1.5 * crack : 0;
  ctx.save();
  flashOn(ctx, flash);
  ctx.translate(Math.round(x + shake), Math.round(y));
  ctx.fillStyle = '#ecfccb';
  ctx.beginPath();
  ctx.ellipse(0, -12, 10, 12, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#65a30d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -18);
  ctx.quadraticCurveTo(-2, -12, -5, -4);
  ctx.moveTo(5, -20);
  ctx.quadraticCurveTo(2, -12, 6, -6);
  ctx.stroke();
  if (crack > 0.3) {
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.lineTo(-3, -16);
    ctx.lineTo(0, -12);
    if (crack > 0.6) {
      ctx.lineTo(4, -15);
      ctx.lineTo(8, -11);
    }
    ctx.stroke();
  }
  ctx.restore();
  glow(ctx, x, y - 12, 14 + crack * 10, `rgba(190,242,100,${0.25 + crack * 0.3})`);
}

/** One of Vishdhar's heads, rising out of the lake on its neck (the surface the squad dances on). */
export function drawVishdharHead(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  lakeY: number,
  nowMs: number,
  i: number,
  dead: boolean,
): void {
  const cx = (x0 + x1) / 2;
  const t = nowMs / 1000 + i;
  const skin = dead ? '#3f3f46' : '#1e3a8a';
  // the neck down into the lake
  ctx.strokeStyle = skin;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + 10, lakeY + 20);
  ctx.quadraticCurveTo(cx + 26 + Math.sin(t) * 6, (lakeY + y) / 2 + 10, cx, y + 16);
  ctx.stroke();
  // the hood: wide and flat on top (the dancer's footing)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y + 2);
  ctx.quadraticCurveTo(cx, y - 8, x1 + 6, y + 2);
  ctx.quadraticCurveTo(x1 + 2, y + 26, cx, y + 30);
  ctx.quadraticCurveTo(x0 - 2, y + 26, x0 - 6, y + 2);
  ctx.fill();
  if (!dead) {
    ctx.fillStyle = '#93c5fd';
    ctx.beginPath();
    ctx.ellipse(cx - 12, y + 10, 5, 7, 0, 0, TAU);
    ctx.ellipse(cx + 12, y + 10, 5, 7, 0, 0, TAU);
    ctx.fill();
  }
  // the face below the hood, toward the squad
  ctx.fillStyle = dead ? '#52525b' : '#1d4ed8';
  ctx.beginPath();
  ctx.ellipse(cx - 18, y + 22, 12, 8, 0, 0, TAU);
  ctx.fill();
  if (!dead) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 24, y + 18, 3, 3);
    glow(ctx, cx - 22, y + 19, 10, 'rgba(253,224,71,0.7)');
    if (Math.sin(t * 4) > 0.5) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 30, y + 24);
      ctx.lineTo(cx - 38, y + 24);
      ctx.lineTo(cx - 41, y + 21);
      ctx.moveTo(cx - 38, y + 24);
      ctx.lineTo(cx - 41, y + 27);
      ctx.stroke();
    }
  }
}

/** Vishdhar's coils filling the far end of the lake, the great central hood towering over them. */
export function drawVishdhar(
  ctx: Ctx,
  x: number,
  y: number,
  nowMs: number,
  dead: boolean,
  flash: boolean,
  phase: number,
): void {
  const t = nowMs / 1000;
  ctx.save();
  if (flash) ctx.filter = 'brightness(1.7)';
  const skin = dead ? '#3f3f46' : '#1e3a8a';
  const hy = y - 150 + Math.sin(t * 1.2) * 4;
  // rendered in 3D once loaded (boss3d.ts): the coils and the hood; the eye's glow stays drawn
  if (bossReady('vishdhar') && !dead) {
    drawPart(ctx, 'vishdhar', 'body', x, y);
    drawPart(ctx, 'vishdhar', 'hood', x, hy);
    glow(ctx, x - 36, hy + 26, 18, phase >= 2 ? 'rgba(239,68,68,0.8)' : 'rgba(253,224,71,0.8)');
    ctx.restore();
    return;
  }
  for (let k = 0; k < 4; k++) {
    ctx.strokeStyle = k % 2 ? skin : dead ? '#52525b' : '#1e40af';
    ctx.lineWidth = 30 - k * 3;
    ctx.beginPath();
    ctx.ellipse(x + 10 - k * 8, y - 20 - k * 22, 90 - k * 12, 22, Math.sin(t * 0.7 + k) * 0.05, 0, TAU);
    ctx.stroke();
  }
  // the central hood
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(x, hy, 48, 56, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dead ? '#71717a' : '#93c5fd';
  ctx.beginPath();
  ctx.ellipse(x - 18, hy - 8, 7, 11, 0, 0, TAU);
  ctx.ellipse(x + 18, hy - 8, 7, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dead ? '#52525b' : '#1d4ed8';
  ctx.beginPath();
  ctx.ellipse(x - 26, hy + 30, 20, 13, 0, 0, TAU);
  ctx.fill();
  if (!dead) {
    ctx.fillStyle = phase >= 2 ? '#ef4444' : '#fde047';
    ctx.fillRect(x - 38, hy + 24, 5, 4);
    glow(ctx, x - 36, hy + 26, 18, phase >= 2 ? 'rgba(239,68,68,0.8)' : 'rgba(253,224,71,0.8)');
  }
  ctx.restore();
}

/** Naag Lok's enemy fire: venom bolts (`shot`), venom spat in arcs and poison rain (`bomb`), the lunging head (`wave`). */
export function drawVenomShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  if (kind === 'shot' || kind === 'bomb') {
    const r = kind === 'bomb' ? 6 : 3.5;
    ctx.fillStyle = 'rgba(163,230,53,0.9)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(236,252,203,0.9)';
    ctx.beginPath();
    ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.35, 0, TAU);
    ctx.fill();
    // a dripping trail
    ctx.fillStyle = 'rgba(132,204,22,0.6)';
    ctx.fillRect(b.x - Math.sign(b.vx) * 6, b.y + 1, 2, 2);
    glow(ctx, b.x, b.y, r * 3, 'rgba(163,230,53,0.45)');
    return true;
  }
  if (kind === 'wave') {
    const dir = Math.sign(b.vx) || -1;
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - dir * 120, b.y + 14);
    ctx.quadraticCurveTo(b.x - dir * 50, b.y - 4 + Math.sin(nowMs / 60) * 4, b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.ellipse(b.x + dir * 8, b.y - 2, 13, 9, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.fillRect(b.x + dir * 12, b.y - 5, 3, 3);
    return true;
  }
  return false;
}

/** Sarpraj's shrine (the rest stop): the serpent king coiled round a pillar, a pot of amrit glowing at its foot. */
export function drawSarprajRest(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  ctx.fillStyle = '#78716c';
  ctx.fillRect(cx - 8, y - 110, 16, 110);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 7;
  ctx.beginPath();
  for (let k = 0; k <= 12; k++) {
    const yy = y - 6 - k * 8;
    const xx = cx + Math.sin(k * 0.9) * 13;
    if (k === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.fillStyle = '#ca8a04';
  ctx.beginPath();
  ctx.ellipse(cx, y - 116, 14, 10, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(cx - 6, y - 118, 3, 3);
  ctx.fillRect(cx + 3, y - 118, 3, 3);
  // the pot of amrit
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.ellipse(cx + 40, y - 12, 13, 12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(cx + 40, y - 22, 9, 3, 0, 0, TAU);
  ctx.fill();
  glow(ctx, cx + 40, y - 26, 40 + Math.sin(nowMs / 400) * 5, 'rgba(253,230,138,0.55)');
}
