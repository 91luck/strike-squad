/**
 * Suvarna (saga stage 10) art: the golden city burning. Meghbaan's mark on the ground (a red ring under a dark cloud,
 * arrows gathering), the stage's rakshasas (torch throwers, Meghbaan's warriors of illusion: a shimmer until they
 * show themselves, Nidrasur asleep and snoring, stirring as the noise grows), Hansvimaan the flying chariot, Saptashir
 * with his seven heads (cut ones shown as stumps, his core glowing once all are cut), his fire and Moonblade, and
 * Chandan Vatika at the rest stop. World coordinates.
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

/** Meghbaan's mark: a red ring on the ground at (x, y) and a dark cloud gathering high over it. */
export function drawMeghMark(ctx: Ctx, x: number, y: number, nowMs: number): void {
  const t = nowMs / 1000;
  const pulse = 0.6 + 0.4 * Math.sin(t * 16);
  ctx.strokeStyle = `rgba(239,68,68,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 64, 10, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 40, 6, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(239,68,68,0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 64, 10, 0, 0, TAU);
  ctx.fill();
  // the cloud overhead, with arrowheads glinting in it
  const cy = y - 380;
  ctx.fillStyle = 'rgba(30,27,46,0.85)';
  for (const [dx, r] of [
    [-50, 34],
    [-10, 44],
    [36, 36],
    [70, 26],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x + dx, cy + Math.sin(t * 2 + dx) * 3, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fca5a5';
  for (let i = 0; i < 6; i++) ctx.fillRect(x - 50 + i * 20, cy + 30 + (i % 2) * 6, 2, 8);
  glow(ctx, x, cy, 80, 'rgba(239,68,68,0.25)');
}

/** A torch thrower on the walls: a rakshasa with a blazing pot held up; `since` ticks since he threw. */
export function drawMashaal(
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
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(x - 6, y - 13, 4, 13);
  ctx.fillRect(x + 2, y - 13, 4, 13);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(x - 8, y - 30, 16, 18);
  ctx.fillStyle = '#4b5563';
  ctx.beginPath();
  ctx.arc(x, y - 35, 7, 0, TAU);
  ctx.fill();
  // horns and tusks
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 40);
  ctx.lineTo(x - 9, y - 47);
  ctx.lineTo(x - 3, y - 41);
  ctx.moveTo(x + 6, y - 40);
  ctx.lineTo(x + 9, y - 47);
  ctx.lineTo(x + 3, y - 41);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 4 + face * 2, y - 37, 2, 2);
  ctx.fillRect(x + 2 + face * 2, y - 37, 2, 2);
  const up = since < 8;
  const hx = x + face * (up ? 14 : 10);
  const hy = up ? y - 46 : y - 40;
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + face * 5, y - 28);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  if (!up) {
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(hx, hy - 4, 6, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const h = 10 + Math.sin(t * 12 + i) * 3;
      ctx.fillStyle = i === 1 ? '#fde047' : '#f97316';
      ctx.beginPath();
      ctx.moveTo(hx - 5 + i * 4, hy - 8);
      ctx.quadraticCurveTo(hx - 4 + i * 4, hy - 8 - h * 1.5, hx - 1 + i * 4, hy - 8);
      ctx.fill();
    }
    glow(ctx, hx, hy - 12, 30, 'rgba(249,115,22,0.5)');
  }
  ctx.restore();
}

/** Meghbaan's warrior of illusion: a dark winged archer in the smoke; only a shimmer of it until it shows itself. */
export function drawMayavi(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  shown: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (!shown) {
    // a heat shimmer where it is
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 7);
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y - 14, 12 + i * 5, 18 + i * 4, Math.sin(t + i) * 0.3, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (flash) ctx.filter = 'brightness(2)';
  glow(ctx, x, y - 14, 40, 'rgba(167,139,250,0.4)');
  const flap = Math.sin(t * 10) * 8;
  ctx.fillStyle = '#312e81';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 4, y - 20);
    ctx.lineTo(x + s * 28, y - 30 - flap);
    ctx.lineTo(x + s * 20, y - 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(x - 6, y - 26, 12, 22);
  ctx.fillStyle = '#4c1d95';
  ctx.beginPath();
  ctx.arc(x, y - 31, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f0abfc';
  ctx.fillRect(x - 3 + face * 2, y - 33, 2, 2);
  ctx.fillRect(x + 1 + face * 2, y - 33, 2, 2);
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + face * 10, y - 20, 11, face > 0 ? -1.3 : Math.PI - 1.3, face > 0 ? 1.3 : Math.PI + 1.3);
  ctx.stroke();
  ctx.restore();
}

/**
 * Nidrasur asleep on his side across the way: a mountain of a rakshasa, his belly rising and falling, snoring
 * (Zs drift up). `noise` 0..99: how near he is to waking (he stirs, an eye flickers); 100: awake and rolling.
 */
export function drawNidrasur(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  noise: number,
  flash: boolean,
): void {
  const t = nowMs / 1000;
  const awake = noise >= 100;
  ctx.save();
  if (flash) ctx.filter = 'brightness(1.5)';
  if (awake) {
    // rolling: a great tumbling bulk
    ctx.translate(x, y - 34);
    ctx.rotate(t * 5 * face);
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 34, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(-20, -34, 40, 68);
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(50, 0, 6, 0, TAU);
    ctx.fill();
    ctx.restore();
    for (let i = 0; i < 6; i++) {
      const ph = (t * 2 + i / 6) % 1;
      ctx.fillStyle = `rgba(120,113,108,${0.5 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x - face * (60 + ph * 70), y - 10 - ph * 20, 10 + ph * 12, 0, TAU);
      ctx.fill();
    }
    return;
  }
  const breath = Math.sin(t * 1.4) * 4;
  const stir = noise > 40 ? Math.sin(t * 20) * (noise / 99) * 3 : 0;
  ctx.translate(stir, 0);
  // legs to one side, head to the other (head toward -face)
  const hx = x - face * 84;
  ctx.fillStyle = '#44403c';
  ctx.beginPath();
  ctx.ellipse(x + face * 70, y - 14, 34, 14, 0, 0, TAU);
  ctx.fill();
  // the body and belly
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.ellipse(x, y - 28, 74, 28 + breath, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath();
  ctx.ellipse(x + face * 20, y - 16, 40, 14, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 40, y - 6, 80, 4);
  // head on an arm
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.arc(hx, y - 30, 22, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(hx - face * 6, y - 46, 18, 8, 0, 0, TAU);
  ctx.fill();
  // eye: shut, flickering open as the noise grows
  const open = noise > 70 && Math.sin(t * 9) > 0;
  ctx.fillStyle = open ? '#ef4444' : '#1c1917';
  ctx.fillRect(hx - face * 8 - 4, y - 34, 8, open ? 4 : 1.5);
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(hx - face * 16, y - 22, 3, 6);
  ctx.fillRect(hx - face * 8, y - 22, 3, 6);
  ctx.restore();
  // snores
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = 'bold 14px sans-serif';
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.5 + i / 3) % 1;
    ctx.globalAlpha = 1 - ph;
    ctx.fillText('Z', hx - face * 10 + ph * 26 * -face, y - 56 - ph * 50);
  }
  ctx.globalAlpha = 1;
  if (noise > 0) {
    // how near he is to waking
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 40, y - 82, 80, 6);
    ctx.fillStyle = noise > 70 ? '#ef4444' : '#fbbf24';
    ctx.fillRect(x - 40, y - 82, (80 * noise) / 99, 6);
  }
}

/** Hansvimaan, the flying chariot: a golden swan-prowed vimana with a pavilion; `flying` while under way. */
export function drawHansvimaan(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  nowMs: number,
  flying: boolean,
): void {
  const t = nowMs / 1000;
  const w = x1 - x0;
  const bob = Math.sin(t * 2.4) * 2;
  // the hull
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.moveTo(x0 - 10, y + bob);
  ctx.lineTo(x1 + 10, y + bob);
  ctx.quadraticCurveTo(x1, y + 22 + bob, x0 + w / 2, y + 24 + bob);
  ctx.quadraticCurveTo(x0, y + 22 + bob, x0 - 10, y + bob);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x0 - 8, y + bob, w + 16, 3);
  // swan prow
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x1 + 8, y + 4 + bob);
  ctx.quadraticCurveTo(x1 + 30, y - 6 + bob, x1 + 22, y - 30 + bob);
  ctx.stroke();
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(x1 + 24, y - 32 + bob, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(x1 + 29, y - 33 + bob);
  ctx.lineTo(x1 + 38, y - 30 + bob);
  ctx.lineTo(x1 + 29, y - 29 + bob);
  ctx.fill();
  // the pavilion at the back
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x0 + 2, y - 46 + bob, 3, 46);
  ctx.fillRect(x0 + 34, y - 46 + bob, 3, 46);
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(x0 - 6, y - 46 + bob);
  ctx.lineTo(x0 + 20, y - 70 + bob);
  ctx.lineTo(x0 + 46, y - 46 + bob);
  ctx.closePath();
  ctx.fill();
  // wings / glow underneath
  glow(ctx, x0 + w / 2, y + 20 + bob, flying ? 70 : 40, 'rgba(250,204,21,0.45)');
  if (flying)
    for (let i = 0; i < 5; i++) {
      const ph = (t * 2 + i / 5) % 1;
      ctx.fillStyle = `rgba(253,230,138,${0.6 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x0 - ph * 60, y + 14 + bob + Math.sin(i) * 6, 4 + ph * 6, 0, TAU);
      ctx.fill();
    }
}

export interface SaptashirView {
  at: number;
  tt: number;
  wind: number;
  dead: boolean;
  flash: boolean;
  phase: number;
  /** heads on his shoulders, 0..10 */
  heads: number;
  /** charging pralay */
  shirsha: boolean;
  ids: { tenfire: number; moonblade: number; meteors: number };
}

/**
 * Saptashir of the golden city on the steps of his throne: a towering king in gold with twenty arms' worth of menace (four drawn),
 * the sword Moonblade, seven crowned heads in a row (cut ones as glowing stumps). With every head cut the amrit in his
 * core shows, glowing: then he is open.
 */
export function drawSaptashir(ctx: Ctx, x: number, y: number, nowMs: number, v: SaptashirView): void {
  const t = nowMs / 1000;
  ctx.save();
  if (v.flash) ctx.filter = 'brightness(1.6)';
  // rendered in 3D once loaded (boss3d.ts): the throne and body, four arms, seven heads; the glows stay drawn
  const r3 = bossReady('saptashir') && !v.dead;
  // the throne behind him
  if (!r3) {
    ctx.fillStyle = '#3b0d0d';
    ctx.fillRect(x - 96, y - 270, 192, 270);
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x - 102, y - 276, 204, 8);
    ctx.fillRect(x - 102, y - 276, 8, 276);
    ctx.fillRect(x + 94, y - 276, 8, 276);
    ctx.beginPath();
    ctx.arc(x, y - 276, 50, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#5b1414';
    ctx.beginPath();
    ctx.arc(x, y - 276, 40, Math.PI, TAU);
    ctx.fill();
  }
  if (v.dead) {
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x - 70, y - 30, 140, 30);
    ctx.restore();
    return;
  }
  const k = v.wind > 0 ? Math.min(1, v.tt / v.wind) : 1;
  if (v.shirsha) {
    glow(ctx, x, y - 120, 200 * Math.min(1, v.tt / 60 + 0.3), 'rgba(250,204,21,0.45)');
    glow(ctx, x, y - 120, 90, 'rgba(255,255,255,0.4)');
  }
  if (r3) drawPart(ctx, 'saptashir', 'body', x, y);
  if (!r3) {
    // legs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 30, y - 70, 22, 70);
    ctx.fillRect(x + 8, y - 70, 22, 70);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 34, y - 84, 68, 16);
    // a bare, broad chest hung with gold, a sash across it
    ctx.fillStyle = '#7c4a2a';
    ctx.beginPath();
    ctx.moveTo(x - 36, y - 80);
    ctx.lineTo(x - 50, y - 172);
    ctx.lineTo(x + 50, y - 172);
    ctx.lineTo(x + 36, y - 80);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x, y - 176, 26 + i * 9, 0.35 * Math.PI, 0.65 * Math.PI);
      ctx.stroke();
    }
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - 44, y - 166);
    ctx.lineTo(x + 34, y - 86);
    ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 54, y - 176, 20, 10);
    ctx.fillRect(x + 34, y - 176, 20, 10);
  }
  // the core: the amrit (glows when every head is cut)
  if (v.heads === 0) {
    glow(ctx, x, y - 104, 50 + Math.sin(t * 8) * 6, 'rgba(56,189,248,0.8)');
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(x, y - 104, 7, 0, TAU);
    ctx.fill();
  } else if (!r3) {
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(x, y - 104, 4, 0, TAU);
    ctx.fill();
  }
  // arms: two raising Moonblade, two holding a bow and a mace
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  const raise = v.at === v.ids.moonblade ? (v.tt < v.wind ? k : Math.max(0, 1 - (v.tt - v.wind) / 8)) : 0;
  if (r3) {
    drawLimb(ctx, 'saptashir', 'arm', x - 40, y - 140, x - 76, y - 110);
    drawLimb(ctx, 'saptashir', 'arm', x + 40, y - 140, x + 78, y - 100);
    drawLimb(ctx, 'saptashir', 'arm', x + 42, y - 160, x + 70, y - 130);
    drawLimb(ctx, 'saptashir', 'arm', x - 42, y - 160, x - 70, y - 160 - raise * 50);
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 42, y - 160);
    ctx.lineTo(x - 70, y - 160 - raise * 50);
    ctx.moveTo(x + 42, y - 160);
    ctx.lineTo(x + 70, y - 130);
    ctx.moveTo(x - 40, y - 140);
    ctx.lineTo(x - 76, y - 110);
    ctx.moveTo(x + 40, y - 140);
    ctx.lineTo(x + 78, y - 100);
    ctx.stroke();
  }
  // Moonblade, the moon-blade
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x - 70 - 20, y - 160 - raise * 50 - 20, 30, 0.2, 1.6);
  ctx.stroke();
  glow(ctx, x - 90, y - 190 - raise * 50, 30 * (0.5 + raise), 'rgba(186,230,253,0.6)');
  // bow
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + 80, y - 128, 28, -1.2, 1.2);
  ctx.stroke();
  // seven heads in a row over his shoulders: the middle one his own
  for (let i = 0; i < 7; i++) {
    const hx = x - 54 + i * 18;
    const hy = y - 192 + Math.abs(i - 3) * 5;
    // heads fall from the outside in: the last to stand is the middle
    const order = [3, 2, 4, 1, 5, 0, 6];
    const on = order.indexOf(i) < v.heads;
    if (r3) {
      drawPart(ctx, 'saptashir', on ? 'head' : 'stump', hx, hy);
      if (on && v.at === v.ids.tenfire && v.tt < v.wind)
        glow(ctx, hx, hy + 4, 10 + k * 8, 'rgba(249,115,22,0.6)');
      if (!on) glow(ctx, hx, hy + 2, 10 + Math.sin(t * 6 + i) * 3, 'rgba(250,204,21,0.5)');
    } else if (on) {
      ctx.fillStyle = '#7c4a2a';
      ctx.beginPath();
      ctx.arc(hx, hy, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(hx - 10, hy - 8);
      ctx.lineTo(hx - 6, hy - 22);
      ctx.lineTo(hx, hy - 13);
      ctx.lineTo(hx + 6, hy - 22);
      ctx.lineTo(hx + 10, hy - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(hx - 5, hy - 2, 3, 2);
      ctx.fillRect(hx + 2, hy - 2, 3, 2);
      ctx.fillStyle = '#111827';
      ctx.fillRect(hx - 5, hy + 3, 10, 2);
      if (v.at === v.ids.tenfire && v.tt < v.wind) glow(ctx, hx, hy + 4, 10 + k * 8, 'rgba(249,115,22,0.6)');
    } else {
      // a stump glowing where a head will grow back
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(hx - 5, hy + 2, 10, 6);
      glow(ctx, hx, hy + 2, 10 + Math.sin(t * 6 + i) * 3, 'rgba(250,204,21,0.5)');
    }
  }
  ctx.restore();
}

/** Stage 10 shots: fire from Saptashir's mouths and the torches, burning stones, Moonblade' blade, arrows. */
export function drawSuvarnaShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  const t = nowMs / 1000;
  if (kind === 'flame') {
    glow(ctx, b.x, b.y, 18, 'rgba(249,115,22,0.8)');
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4 + Math.sin(t * 20 + b.id) * 1, 0, TAU);
    ctx.fill();
    return true;
  }
  if (kind === 'meteor') {
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 8, 0, TAU);
    ctx.fill();
    glow(ctx, b.x, b.y, 26, 'rgba(249,115,22,0.75)');
    for (let i = 1; i < 6; i++) {
      ctx.fillStyle = `rgba(251,146,60,${0.6 - i * 0.1})`;
      ctx.beginPath();
      ctx.arc(b.x - b.vx * 0.015 * i, b.y - b.vy * 0.015 * i, 7 - i, 0, TAU);
      ctx.fill();
    }
    return true;
  }
  if (kind === 'wave') {
    const dir = Math.sign(b.vx) || 1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(dir, 1);
    ctx.strokeStyle = 'rgba(186,230,253,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(-10, 0, 18, -1.2, 1.2);
    ctx.stroke();
    ctx.restore();
    glow(ctx, b.x, b.y, 26, 'rgba(125,211,252,0.5)');
    return true;
  }
  if (kind === 'arrow') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.restore();
    glow(ctx, b.x, b.y, 10, 'rgba(239,68,68,0.5)');
    return true;
  }
  return false;
}

/** The rest stop: Chandan Vatika: a sandalwood tree in flower, a swing and lanterns in the garden. */
export function drawChandanVatika(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  const t = nowMs / 1000;
  // the chandan tree
  ctx.fillStyle = '#5b3a1e';
  ctx.fillRect(cx - 6, y - 110, 12, 110);
  ctx.fillStyle = '#166534';
  for (const [dx, dy, r] of [
    [0, -120, 40],
    [-34, -104, 28],
    [34, -104, 28],
    [-14, -144, 24],
    [18, -142, 22],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, y + dy + Math.sin(t + dx) * 1.5, r, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fb923c';
  for (let i = 0; i < 16; i++) {
    const a = i * 2.3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (20 + (i % 3) * 12), y - 120 + Math.sin(a) * 22, 3, 0, TAU);
    ctx.fill();
  }
  // falling blossoms
  for (let i = 0; i < 5; i++) {
    const ph = (t * 0.2 + i / 5) % 1;
    ctx.fillStyle = `rgba(251,146,60,${1 - ph})`;
    ctx.fillRect(cx - 40 + i * 20 + Math.sin(t * 2 + i) * 8, y - 120 + ph * 110, 3, 3);
  }
  // a swing hanging from a bough
  const sx = cx + 30;
  const sw = Math.sin(t * 1.2) * 6;
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - 10, y - 104);
  ctx.lineTo(sx - 10 + sw, y - 30);
  ctx.moveTo(sx + 10, y - 104);
  ctx.lineTo(sx + 10 + sw, y - 30);
  ctx.stroke();
  ctx.fillStyle = '#a16207';
  ctx.fillRect(sx - 13 + sw, y - 31, 26, 4);
  // hanging lanterns
  for (const lx of [cx - 50, cx - 24]) {
    ctx.strokeStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(lx, y - 100);
    ctx.lineTo(lx, y - 80);
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.ellipse(lx, y - 72, 6, 9, 0, 0, TAU);
    ctx.fill();
    glow(ctx, lx, y - 72, 26, 'rgba(251,191,36,0.45)');
  }
  // a small lamp on the path
  ctx.fillStyle = '#ca8a04';
  ctx.fillRect(sx - 30, y - 6, 8, 6);
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(sx - 28, y - 6);
  ctx.quadraticCurveTo(sx - 26, y - 16 - Math.sin(t * 9) * 2, sx - 24, y - 6);
  ctx.fill();
  glow(ctx, sx - 26, y - 10, 36, 'rgba(251,191,36,0.4)');
}
