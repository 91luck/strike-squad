/**
 * Maya Nagri (saga stage 5) art: Mayakaar's hall. False floors (marble that gives way), hidden floors (nothing to see
 * but a shimmer now and then), the stage's rakshasas (mirror shades, dancers, painted guards), the great mirror
 * Darpan-asur, its light and shards, and the garden at the rest stop. When MAYASTRA shows things as they are,
 * false floors show their cracks in red and hidden floors their edges in gold. World coordinates.
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

/** A marble floor slab (a false one gives way: `on` false while it is gone; `shown` while MAYASTRA reveals). */
export function drawFalseFloor(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  on: boolean,
  shown: boolean,
  nowMs: number,
): void {
  if (!on) {
    // the slab broken up and falling away as dust
    ctx.fillStyle = 'rgba(233,213,255,0.4)';
    for (let i = 0; i < 6; i++)
      ctx.fillRect(x0 + i * ((x1 - x0) / 6) + 4, y + 10 + ((nowMs / 30 + i * 9) % 30), 6, 4);
    return;
  }
  ctx.fillStyle = '#e9d5ff';
  ctx.fillRect(x0, y, x1 - x0, 14);
  ctx.fillStyle = '#c4b5fd';
  ctx.fillRect(x0, y + 10, x1 - x0, 4);
  ctx.strokeStyle = 'rgba(126,34,206,0.35)';
  ctx.lineWidth = 1;
  for (let x = x0 + 16; x < x1; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 14);
    ctx.stroke();
  }
  if (shown) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y + 1, x1 - x0 - 2, 12);
    ctx.beginPath();
    ctx.moveTo(x0 + 10, y + 2);
    ctx.lineTo(x0 + 30, y + 10);
    ctx.lineTo(x0 + 50, y + 4);
    ctx.lineTo(x0 + 80, y + 12);
    ctx.stroke();
  }
}

/** A hidden floor: nothing to see but a shimmer now and then (and its gold edges while MAYASTRA reveals it). */
export function drawHiddenFloor(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  shown: boolean,
  nowMs: number,
  i: number,
): void {
  if (shown) {
    ctx.fillStyle = 'rgba(253,224,71,0.25)';
    ctx.fillRect(x0, y, x1 - x0, 12);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y + 1, x1 - x0 - 2, 10);
    return;
  }
  const k = (nowMs / 1000 + i * 0.7) % 3;
  if (k < 0.5) {
    const a = Math.sin((k / 0.5) * Math.PI) * 0.45;
    ctx.fillStyle = `rgba(233,213,255,${a})`;
    ctx.fillRect(x0 + 4, y, x1 - x0 - 8, 2);
    for (let s = 0; s < 4; s++) ctx.fillRect(x0 + 10 + s * ((x1 - x0 - 20) / 3), y - 3, 2, 2);
  }
}

/** Mirror shade: a soldier's reflection in violet glass, standing before its mirror frame. */
export function drawMirrorShade(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  homeX: number,
  nowMs: number,
  flash: boolean,
): void {
  // the frame it is reflected from
  ctx.save();
  ctx.strokeStyle = 'rgba(250,204,21,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(homeX - 16, y - 70, 32, 70);
  ctx.fillStyle = 'rgba(196,181,253,0.12)';
  ctx.fillRect(homeX - 14, y - 68, 28, 66);
  ctx.restore();
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(-5, -14, 4, 14);
  ctx.fillRect(1, -14, 4, 14);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(-6, -28, 12, 15);
  ctx.beginPath();
  ctx.arc(0, -32, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ede9fe';
  ctx.fillRect(1, -33, 3, 2);
  ctx.fillStyle = '#4c1d95';
  ctx.fillRect(4, -24, 12, 3);
  ctx.restore();
  // glints across it
  const t = (nowMs / 900) % 1;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(x - 6 + t * 12, y - 30, 2, 22);
}

/** Dancer: a whirling figure in a flaring skirt of violet and gold, veil streaming; flickers as it vanishes. */
export function drawDancer(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  striking: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 9);
  const flare = 10 + Math.sin(t * 8) * 3;
  ctx.fillStyle = '#7e22ce';
  ctx.beginPath();
  ctx.moveTo(-3, -18);
  ctx.lineTo(3, -18);
  ctx.lineTo(flare, -2);
  ctx.lineTo(-flare, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-flare, -4, flare * 2, 2);
  ctx.fillStyle = '#c084fc';
  ctx.fillRect(-4, -30, 8, 12);
  ctx.fillStyle = '#e9d5ff';
  ctx.beginPath();
  ctx.arc(0, -34, 5, 0, TAU);
  ctx.fill();
  // the veil streaming
  ctx.strokeStyle = 'rgba(244,114,182,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -36);
  ctx.quadraticCurveTo(-14, -30 + Math.sin(t * 6) * 4, -22, -20);
  ctx.stroke();
  // arms: a blade raised when it strikes
  ctx.strokeStyle = '#e9d5ff';
  ctx.beginPath();
  ctx.moveTo(4, -28);
  ctx.lineTo(striking ? 14 : 10, striking ? -38 : -22);
  ctx.stroke();
  if (striking) {
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(14, -38, 10, -0.5, 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Painted guard: a framed picture of a guard on the wall until it steps out (then a guard in painted colours). */
export function drawPainting(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  awake: boolean,
  flash: boolean,
): void {
  if (!awake) {
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x - 20, y - 66, 40, 50);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x - 16, y - 62, 32, 42);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(x - 5, y - 52, 10, 22);
    ctx.fillStyle = '#d6a77a';
    ctx.beginPath();
    ctx.arc(x, y - 56, 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 22);
    ctx.lineTo(x + 8, y - 60);
    ctx.stroke();
    // its eyes follow you
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x - 2 + Math.sin(nowMs / 700) * 1, y - 57, 1.5, 1.5);
    return;
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(-6, -14, 5, 14);
  ctx.fillRect(1, -14, 5, 14);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(-8, -32, 16, 19);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(-8, -24, 16, 3);
  ctx.fillStyle = '#d6a77a';
  ctx.beginPath();
  ctx.arc(0, -37, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(2, -38, 2, 2);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -26);
  ctx.lineTo(26, -30);
  ctx.stroke();
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(26, -33);
  ctx.lineTo(32, -30);
  ctx.lineTo(26, -27);
  ctx.fill();
  // paint flaking off it
  ctx.fillStyle = 'rgba(254,243,199,0.7)';
  ctx.fillRect(-10, -20 + ((nowMs / 50) % 18), 2, 2);
  ctx.restore();
}

/**
 * Darpan-asur, the great mirror: a tall gilded frame with a face in its glass that is everyone's face. While it
 * shines, light ripples over it; dull, its glass is dark and cracked (`dull`), the moment to break it.
 */
export function drawDarpan(
  ctx: Ctx,
  x: number,
  y: number,
  nowMs: number,
  s: {
    at: number;
    tt: number;
    wind: number;
    dull: boolean;
    dead: boolean;
    flash: boolean;
    beam: number;
    phase: number;
  },
): void {
  const t = nowMs / 1000;
  const k = s.wind > 0 ? Math.min(1, s.tt / s.wind) : 1;
  const w = 130;
  const h = 220;
  const x0 = x - w / 2;
  const y0 = y - h;
  ctx.save();
  if (s.flash) ctx.filter = 'brightness(1.6)';
  // rendered in 3D once loaded (boss3d.ts): the gilded frame and peacock crest, laid over the glass below
  const r3 = bossReady('darpan') && !s.dead;
  if (!r3) {
    // the frame: gold with peacock crest
    ctx.fillStyle = s.dead ? '#57534e' : '#a16207';
    ctx.fillRect(x0 - 12, y0 - 12, w + 24, h + 12);
    ctx.fillStyle = s.dead ? '#78716c' : '#facc15';
    ctx.fillRect(x0 - 8, y0 - 8, w + 16, 6);
    ctx.fillRect(x0 - 8, y0 - 8, 6, h + 8);
    ctx.fillRect(x0 + w + 2, y0 - 8, 6, h + 8);
    if (!s.dead) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ctx.fillStyle = i % 2 ? '#0e7490' : '#16a34a';
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * 46, y0 - 14 + Math.sin(a) * 40, 9, 16, a + Math.PI / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 46, y0 - 14 + Math.sin(a) * 40, 4, 0, TAU);
        ctx.fill();
      }
    }
  }
  // the glass
  const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
  if (s.dull || s.dead) {
    g.addColorStop(0, '#1e1b4b');
    g.addColorStop(1, '#312e81');
  } else {
    g.addColorStop(0, '#e0e7ff');
    g.addColorStop(0.5, '#c7d2fe');
    g.addColorStop(1, '#a5b4fc');
  }
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);
  // the face in the glass: everyone's face
  if (!s.dead) {
    ctx.globalAlpha = s.dull ? 0.4 : 0.6;
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath();
    ctx.ellipse(x, y0 + 80, 30, 40, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = s.phase >= 2 ? '#ef4444' : '#fef08a';
    ctx.fillRect(x - 16, y0 + 70, 9, 4);
    ctx.fillRect(x + 7, y0 + 70, 9, 4);
    ctx.globalAlpha = 1;
  }
  if (s.dull || s.dead) {
    ctx.strokeStyle = 'rgba(224,231,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y0 + 30);
    ctx.lineTo(x + 6, y0 + 90);
    ctx.lineTo(x - 30, y0 + 140);
    ctx.moveTo(x + 6, y0 + 90);
    ctx.lineTo(x + 40, y0 + 120);
    ctx.lineTo(x + 30, y0 + 190);
    ctx.stroke();
  } else {
    // ripples of light sweeping the glass
    const r = (t * 0.6) % 1;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(x0 + r * w * 1.6 - 40, y0);
    ctx.lineTo(x0 + r * w * 1.6 - 10, y0);
    ctx.lineTo(x0 + r * w * 1.6 - 70, y0 + h);
    ctx.lineTo(x0 + r * w * 1.6 - 100, y0 + h);
    ctx.closePath();
    ctx.fill();
    glow(ctx, x, y0 + h / 2, 140, 'rgba(199,210,254,0.3)');
  }
  if (r3) drawPart(ctx, 'darpan', 'frame', x, y);
  if (s.at === s.beam && k < 1) glow(ctx, x0, y - 150, 30 + 40 * k, 'rgba(255,255,255,0.8)');
  ctx.restore();
}

/** Maya Nagri's enemy fire: shots of light (`shot`) and falling glass (`bomb`). */
export function drawMayaShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  if (kind === 'shot') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(233,213,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(0, -3);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    glow(ctx, b.x, b.y, 12, 'rgba(192,132,252,0.6)');
    return true;
  }
  if (kind === 'bomb') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(nowMs / 80 + b.id);
    ctx.fillStyle = 'rgba(199,210,254,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(5, 3);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    glow(ctx, b.x, b.y, 12, 'rgba(199,210,254,0.5)');
    return true;
  }
  return false;
}

/** The garden of the hall where no illusion holds (the rest stop): a lotus pool, a jasmine arch, a lamp. */
export function drawGardenRest(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  ctx.fillStyle = 'rgba(56,189,248,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, y - 2, 70, 8, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const lx = cx - 45 + i * 30;
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.ellipse(lx, y - 3, 9, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f9a8d4';
    ctx.beginPath();
    ctx.ellipse(lx, y - 8, 4, 5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, y, 110, Math.PI, TAU);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  for (let i = 0; i < 18; i++) {
    const a = Math.PI + (i / 17) * Math.PI;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 110, y + Math.sin(a) * 110, 2.5, 0, TAU);
    ctx.fill();
  }
  glow(ctx, cx, y - 60, 90 + Math.sin(nowMs / 600) * 6, 'rgba(253,230,138,0.25)');
}
