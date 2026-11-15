/**
 * Sagar Setu (saga stage 2) art: the sea and its tide, the floating stones, the boat, the stage's rakshasas
 * (makara riders, crab asuras, conch blowers), its boss Chhaya the shadow-catcher, their water, and the ferryman's
 * boat at the rest stop. World coordinates on the world canvas.
 */

import { bossReady, drawLimb, drawPart } from './boss3d';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

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

// ------------------------------------------------------------------ the sea

/**
 * The sea in front of everything in it: from the surface `wy` down to `bottom`, over the runs of open water
 * (`runs`, x ranges). Waves roll on the surface; what is under it shows through, darker.
 */
export function drawSea(ctx: Ctx, runs: [number, number][], wy: number, bottom: number, nowMs: number): void {
  const t = nowMs / 1000;
  for (const [x0, x1] of runs) {
    const g = ctx.createLinearGradient(0, wy, 0, bottom);
    g.addColorStop(0, 'rgba(34,150,190,0.62)');
    g.addColorStop(0.4, 'rgba(14,90,140,0.78)');
    g.addColorStop(1, 'rgba(8,40,80,0.92)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 8)
      ctx.lineTo(x, wy + Math.sin(x / 26 + t * 2.4) * 3 + Math.sin(x / 9 - t * 3) * 1);
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fill();
    // foam crests and glints
    ctx.strokeStyle = 'rgba(224,250,255,0.75)';
    ctx.lineWidth = 2;
    for (let x = x0 + ((t * 30) % 40); x < x1 - 10; x += 40) {
      const y = wy + Math.sin(x / 26 + t * 2.4) * 3 - 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 6, y - 3, x + 12, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = x0 + 13; x < x1 - 6; x += 57)
      ctx.fillRect(x + Math.sin(t + x) * 6, wy + 10 + (x % 5) * 3, 10, 1.5);
  }
}

/** A floating stone of the old sea bridge: a pale boulder with a rune glowing on it; sinking, it darkens. */
export function drawStone(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  depth: number,
  i: number,
  nowMs: number,
): void {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const bob = Math.sin(nowMs / 500 + i) * 1.2;
  const yy = y + bob;
  const dark = Math.min(1, depth / 46);
  ctx.save();
  ctx.fillStyle = `rgb(${Math.round(200 - dark * 90)},${Math.round(190 - dark * 90)},${Math.round(170 - dark * 80)})`;
  ctx.beginPath();
  ctx.moveTo(x0 + 4, yy);
  ctx.quadraticCurveTo(cx, yy - 7, x1 - 4, yy);
  ctx.quadraticCurveTo(x1 + 3, yy + 12, x1 - 8, yy + 22);
  ctx.quadraticCurveTo(cx, yy + 30, x0 + 8, yy + 22);
  ctx.quadraticCurveTo(x0 - 3, yy + 12, x0 + 4, yy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - dark)})`;
  ctx.fillRect(x0 + 10, yy + 1, w * 0.4, 2);
  // a glowing rune: a ring with a wave through it
  ctx.strokeStyle = `rgba(56,189,248,${0.9 - dark * 0.5})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, yy + 11, 6, 0, TAU);
  ctx.moveTo(cx - 9, yy + 11);
  ctx.quadraticCurveTo(cx - 4, yy + 6, cx, yy + 11);
  ctx.quadraticCurveTo(cx + 4, yy + 16, cx + 9, yy + 11);
  ctx.stroke();
  ctx.restore();
  if (dark < 0.5) glow(ctx, cx, yy + 10, 18, 'rgba(56,189,248,0.25)');
  // bubbles while it sinks
  if (depth > 4) {
    ctx.fillStyle = 'rgba(224,242,254,0.8)';
    for (let k = 0; k < 4; k++) {
      const life = (nowMs / 700 + k / 4 + i) % 1;
      ctx.beginPath();
      ctx.arc(x0 + 10 + hash(k + i) * (w - 20), yy - life * 20, 1.5 + k * 0.4, 0, TAU);
      ctx.fill();
    }
  }
}

/** The boat that carries the squad over open sea: a long wooden hull, a mast with a saffron pennant. */
export function drawBoat(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number, moving: boolean): void {
  const w = x1 - x0;
  ctx.save();
  // hull
  ctx.fillStyle = '#5b3a1a';
  ctx.beginPath();
  ctx.moveTo(x0 - 14, y - 4);
  ctx.lineTo(x1 + 18, y - 10);
  ctx.quadraticCurveTo(x1 + 4, y + 26, x1 - 20, y + 28);
  ctx.lineTo(x0 + 14, y + 28);
  ctx.quadraticCurveTo(x0 - 6, y + 22, x0 - 14, y - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7c4a20';
  ctx.fillRect(x0 - 8, y - 2, w + 18, 6);
  ctx.strokeStyle = '#3f2611';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(x0, y + 9 + k * 6);
    ctx.lineTo(x1, y + 7 + k * 6);
    ctx.stroke();
  }
  // a painted eye on the prow
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.ellipse(x1 + 2, y + 6, 5, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(x1 + 3, y + 6, 1.6, 0, TAU);
  ctx.fill();
  // mast, sail and pennant
  const mx = x0 + w * 0.35;
  ctx.fillStyle = '#3f2611';
  ctx.fillRect(mx - 2, y - 120, 4, 120);
  const billow = moving ? 14 : 6;
  ctx.fillStyle = '#f5e6c8';
  ctx.beginPath();
  ctx.moveTo(mx + 2, y - 112);
  ctx.quadraticCurveTo(mx + 30 + billow, y - 80, mx + 2, y - 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ea580c';
  const flap = Math.sin(nowMs / 140) * 4;
  ctx.beginPath();
  ctx.moveTo(mx + 2, y - 120);
  ctx.lineTo(mx + 24, y - 115 + flap);
  ctx.lineTo(mx + 2, y - 108);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // wake behind it under way
  if (moving) {
    ctx.strokeStyle = 'rgba(224,250,255,0.6)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(x0 - 16 - k * 16, y + 22 + k * 2);
      ctx.lineTo(x0 - 30 - k * 22, y + 22 + k * 3);
      ctx.stroke();
    }
  }
}

/** The ferryman's boat moored at the rest stop: an awning, a lamp, a pot of water; he waits by it. */
export function drawBoatRest(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  // the moored boat, beached on the sand
  drawBoat(ctx, cx - 110, cx + 50, y - 6, nowMs, false);
  // awning on poles
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(cx - 160, y - 70, 4, 70);
  ctx.fillRect(cx - 100, y - 70, 4, 70);
  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.moveTo(cx - 168, y - 70);
  ctx.lineTo(cx - 92, y - 70);
  ctx.lineTo(cx - 100, y - 82);
  ctx.lineTo(cx - 160, y - 82);
  ctx.closePath();
  ctx.fill();
  // a lamp
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.ellipse(cx - 130, y - 4, 7, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(cx - 133, y - 6);
  ctx.quadraticCurveTo(cx - 130, y - 17 - Math.sin(nowMs / 150) * 2, cx - 127, y - 6);
  ctx.fill();
  glow(ctx, cx - 130, y - 10, 30, 'rgba(253,224,71,0.45)');
  // the ferryman: a tall figure in blue with a cloth cap, a hand raised in welcome
  const vx = cx + 90;
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(vx - 7, y - 40, 14, 34);
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(vx - 7, y - 8, 14, 8);
  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.arc(vx, y - 47, 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.ellipse(vx, y - 53, 8, 4, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(vx + 6, y - 36);
  ctx.lineTo(vx + 14, y - 50 + Math.sin(nowMs / 400) * 2);
  ctx.stroke();
}

// ------------------------------------------------------------------ rakshasas

/** Makara rider: a sea-dragon with a crocodile snout and a curled fish tail, an asura astride with a trident. */
export function drawMakar(
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
  ctx.translate(Math.round(x), Math.round(y - 10));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  // tail
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.quadraticCurveTo(-30, -4 + Math.sin(t * 6) * 4, -36, -14);
  ctx.lineTo(-30, -2);
  ctx.lineTo(-38, 6);
  ctx.quadraticCurveTo(-24, 4, -14, 4);
  ctx.fill();
  // body
  ctx.fillStyle = '#14b8a6';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ccfbf1';
  ctx.beginPath();
  ctx.ellipse(2, 4, 14, 4, 0, 0, TAU);
  ctx.fill();
  // fins
  ctx.fillStyle = '#0d9488';
  ctx.beginPath();
  ctx.moveTo(-6, -7);
  ctx.lineTo(-2, -16);
  ctx.lineTo(4, -8);
  ctx.fill();
  // snout and jaws
  ctx.fillStyle = '#14b8a6';
  ctx.beginPath();
  ctx.moveTo(14, -6);
  ctx.lineTo(30, -3);
  ctx.lineTo(30, 1);
  ctx.lineTo(14, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  for (let k = 0; k < 4; k++) ctx.fillRect(16 + k * 4, 0, 2, 2);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(14, -5, 3, 3);
  // the rider: a small asura with a trident
  ctx.fillStyle = '#155e75';
  ctx.fillRect(-4, -20, 8, 12);
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(0, -24, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, -16);
  ctx.lineTo(16, -34);
  ctx.moveTo(13, -36);
  ctx.lineTo(19, -32);
  ctx.moveTo(16, -34);
  ctx.lineTo(18, -38);
  ctx.stroke();
  ctx.restore();
  // water streaming off it
  ctx.fillStyle = 'rgba(186,230,253,0.8)';
  for (let k = 0; k < 4; k++) ctx.fillRect(x - 10 + k * 7, y + 2 + ((nowMs / 40 + k * 5) % 14), 1.5, 3);
}

/** Crab asura: a broad red shell held in front like a shield, snapping claws, stalk eyes. */
export function drawCrab(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  moving: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.7;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, -1, 16, 3, 0, 0, TAU);
  ctx.fill();
  // legs
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const step = moving ? Math.sin(t * 14 + k) * 2 : 0;
    ctx.beginPath();
    ctx.moveTo(-6 + k * 5, -8);
    ctx.lineTo(-10 + k * 5 + step, -1);
    ctx.stroke();
  }
  // body
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.ellipse(-2, -12, 12, 8, 0, 0, TAU);
  ctx.fill();
  // the shell in front: thick, ridged
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.ellipse(9, -12, 7, 12, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = 1.5;
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.arc(9, -12 + k * 6, 5, -1.2, 1.2);
    ctx.stroke();
  }
  // claws snapping
  const snap = Math.abs(Math.sin(t * 5)) * 0.5;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(14, -16 + side * 6);
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(9, -3 - snap * 3);
    ctx.lineTo(10, 0);
    ctx.lineTo(9, 3 + snap * 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // stalk eyes
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(1, -24);
  ctx.moveTo(4, -18);
  ctx.lineTo(6, -24);
  ctx.stroke();
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(0, -26, 2, 2);
  ctx.fillRect(5, -26, 2, 2);
  ctx.restore();
}

/** Conch blower: a sea asura in blue with a white conch to his lips; it glows as he draws breath. */
export function drawConch(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  const breath = (Math.sin(t * 2.4) + 1) / 2;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, -1, 10, 2.5, 0, 0, TAU);
  ctx.fill();
  // legs and robe
  ctx.fillStyle = '#083344';
  ctx.fillRect(-5, -12, 4, 12);
  ctx.fillRect(1, -12, 4, 12);
  ctx.fillStyle = '#0e7490';
  ctx.beginPath();
  ctx.moveTo(-8, -12);
  ctx.lineTo(8, -12);
  ctx.lineTo(6, -28);
  ctx.lineTo(-6, -28);
  ctx.closePath();
  ctx.fill();
  // fin crest head
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(1, -32, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5eead4';
  ctx.beginPath();
  ctx.moveTo(-4, -35);
  ctx.lineTo(-1, -44);
  ctx.lineTo(2, -36);
  ctx.lineTo(5, -42);
  ctx.lineTo(6, -34);
  ctx.closePath();
  ctx.fill();
  // the conch at his lips
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(5, -32);
  ctx.quadraticCurveTo(14, -38, 20, -30);
  ctx.quadraticCurveTo(14, -24, 5, -30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(12, -31, 3, 0, TAU);
  ctx.stroke();
  ctx.restore();
  glow(ctx, x + f * 14, y - 31, 10 + breath * 10, `rgba(125,211,252,${0.3 + breath * 0.4})`);
}

// ------------------------------------------------------------------ Chhaya

export interface ChhayaPose {
  at: number;
  tt: number;
  wind: number;
  /** Grab: where her hand is coming up. */
  p: number;
  phase: number;
  open: boolean;
  dead: boolean;
  flash: boolean;
  grab: number;
  surge: number;
  spit: number;
}

/**
 * Chhaya rising out of the sea at the island's end: a vast dark rakshasi, hair like seaweed streaming, eyes like
 * lamps, one great arm in the water. Her jaws hang open (glowing throat) after a grab: that is when to strike.
 */
export function drawChhaya(ctx: Ctx, x: number, y: number, nowMs: number, s: ChhayaPose): void {
  const t = nowMs / 1000;
  const k = s.wind > 0 ? Math.min(1, s.tt / s.wind) : 1;
  const sway = s.dead ? 0 : Math.sin(t * 0.9) * 4;
  ctx.save();
  if (s.flash) ctx.filter = 'brightness(1.7)';
  const skin = s.dead ? '#334155' : '#1e3a5f';
  const skinLit = s.dead ? '#475569' : '#2c5282';
  const top = y - 300;
  // rendered in 3D once loaded (boss3d.ts): body, head and the reaching arm; her lamp eyes, open jaws and glowing
  // throat stay drawn over it
  const r3 = bossReady('chhaya') && !s.dead;
  const hx = x - 20 + sway;
  const hy = top + 55;
  const reach = s.at === s.grab ? 1 - k * 0.6 : 1;
  if (r3) {
    drawPart(ctx, 'chhaya', 'body', x + sway * 0.5, y);
    drawLimb(ctx, 'chhaya', 'arm', x - 70, top + 140, x - 160 * reach, y - 30);
    drawPart(ctx, 'chhaya', 'head', hx, hy);
  } else {
    // seaweed hair streaming behind
    ctx.strokeStyle = s.dead ? '#3f3f46' : '#14532d';
    ctx.lineWidth = 6;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 20 + i * 8, top + 30);
      ctx.quadraticCurveTo(x + 40 + i * 10, top + 80 + Math.sin(t * 2 + i) * 14, x + 30 + i * 12, top + 200);
      ctx.stroke();
    }
    // shoulders and body rising out of the water
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(x - 90, y + 10);
    ctx.quadraticCurveTo(x - 100, top + 150, x - 50 + sway, top + 100);
    ctx.quadraticCurveTo(x, top + 70, x + 60 + sway, top + 100);
    ctx.quadraticCurveTo(x + 100, top + 150, x + 90, y + 10);
    ctx.closePath();
    ctx.fill();
    // the head
    ctx.fillStyle = skinLit;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 46, 52, 0, 0, TAU);
    ctx.fill();
    // brow ridges and lamp eyes
    ctx.fillStyle = '#0f1f33';
    ctx.beginPath();
    ctx.ellipse(hx - 18, hy - 12, 13, 6, -0.3, 0, TAU);
    ctx.ellipse(hx + 16, hy - 12, 13, 6, 0.3, 0, TAU);
    ctx.fill();
  }
  if (!s.dead) {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(hx - 18, hy - 11, 5, 0, TAU);
    ctx.arc(hx + 16, hy - 11, 5, 0, TAU);
    ctx.fill();
    glow(ctx, hx - 18, hy - 11, 16, 'rgba(253,224,71,0.7)');
    glow(ctx, hx + 16, hy - 11, 16, 'rgba(253,224,71,0.7)');
  }
  // the jaws: hanging open after a grab (a glowing throat), shut otherwise
  const open = s.open ? 30 : s.at === s.spit ? 10 + 10 * k : 6;
  if (!r3 || s.open || s.at === s.spit) {
    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy + 22, 24, open, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(hx - 20 + i * 7, hy + 22 - open + 2);
      ctx.lineTo(hx - 17 + i * 7, hy + 22 - open + 10);
      ctx.lineTo(hx - 14 + i * 7, hy + 22 - open + 2);
      ctx.fill();
    }
  }
  if (s.open && !s.dead) {
    ctx.fillStyle = 'rgba(248,113,113,0.85)';
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy + 24, 14, open * 0.55, 0, 0, TAU);
    ctx.fill();
    glow(ctx, hx - 2, hy + 24, 50, 'rgba(248,113,113,0.6)');
  }
  if (r3) {
    ctx.restore();
    return;
  }
  // horns of coral
  ctx.strokeStyle = '#be123c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(hx - 30, hy - 36);
  ctx.quadraticCurveTo(hx - 50, hy - 70, hx - 36, hy - 92);
  ctx.moveTo(hx + 28, hy - 36);
  ctx.quadraticCurveTo(hx + 50, hy - 70, hx + 38, hy - 92);
  ctx.stroke();
  // an arm reaching over the shore, claws hooked (it rears back before a grab)
  ctx.strokeStyle = skin;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 70, top + 140);
  ctx.quadraticCurveTo(x - 140 * reach, top + 170, x - 160 * reach, y - 30);
  ctx.stroke();
  ctx.fillStyle = skinLit;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 160 * reach - 6 + i * 5, y - 34);
    ctx.lineTo(x - 168 * reach - 10 + i * 6, y - 14);
    ctx.lineTo(x - 160 * reach + i * 5, y - 30);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The mark of a coming grab: a dark pool on the ground where the soldier's shadow lies (it follows them, then
 * holds), and at the moment of the grab a great hand bursting up out of it.
 */
export function drawGrabMark(ctx: Ctx, x: number, y: number, k: number, burst: number, nowMs: number): void {
  const t = nowMs / 1000;
  if (k < 1) {
    const r = 30 + 18 * k;
    ctx.fillStyle = `rgba(2,6,23,${0.35 + 0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, r, r * 0.25, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(56,189,248,${0.4 + 0.5 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, r + Math.sin(t * 12) * 2, (r + 2) * 0.25, 0, 0, TAU);
    ctx.stroke();
  }
  if (burst > 0 && burst < 1) {
    const h = 110 * Math.sin(burst * Math.PI);
    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 14, y - h);
    ctx.lineTo(x + 14, y - h);
    ctx.lineTo(x + 18, y);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 16 + i * 8, y - h);
      ctx.lineTo(x - 18 + i * 9, y - h - 22);
      ctx.lineTo(x - 12 + i * 8, y - h);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(224,242,254,0.85)';
    for (let i = 0; i < 10; i++) ctx.fillRect(x + (hash(i) - 0.5) * 60, y - h * hash(i + 3) - 6, 3, 3);
  }
}

// ------------------------------------------------------------------ water

/** Sagar Setu's enemy fire: water bolts (`shot`), surges along the ground (`wave`), spat water orbs (`bomb`). */
export function drawSeaShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  const t = nowMs / 1000;
  if (kind === 'shot') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(125,211,252,0.85)';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-2, -4, 5, 0);
    ctx.quadraticCurveTo(-2, 4, -12, 0);
    ctx.fill();
    ctx.fillStyle = '#f0f9ff';
    ctx.beginPath();
    ctx.arc(2, 0, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    return true;
  }
  if (kind === 'wave') {
    const dir = Math.sign(b.vx) || -1;
    const h = 28 + Math.sin(t * 14 + b.id) * 3;
    const g = ctx.createLinearGradient(0, b.y + 12 - h, 0, b.y + 12);
    g.addColorStop(0, 'rgba(224,250,255,0.95)');
    g.addColorStop(1, 'rgba(14,116,144,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(b.x - dir * 50, b.y + 12);
    ctx.quadraticCurveTo(b.x - dir * 18, b.y + 12 - h * 0.9, b.x + dir * 2, b.y + 12 - h);
    ctx.quadraticCurveTo(b.x + dir * 12, b.y + 12 - h * 0.6, b.x + dir * 8, b.y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 4; i++)
      ctx.fillRect(b.x + dir * (2 - i * 6), b.y + 10 - h + hash(i + b.id) * 6, 3, 3);
    return true;
  }
  if (kind === 'bomb') {
    ctx.fillStyle = 'rgba(56,189,248,0.75)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,249,255,0.9)';
    ctx.beginPath();
    ctx.arc(b.x - 2.5, b.y - 2.5, 3, 0, TAU);
    ctx.fill();
    glow(ctx, b.x, b.y, 16, 'rgba(56,189,248,0.4)');
    return true;
  }
  return false;
}
