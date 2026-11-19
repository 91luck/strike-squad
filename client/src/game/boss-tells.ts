/**
 * What a saga boss tells you without a word: when it is guarded and when it is open.
 *
 * Most saga bosses are not beaten by pouring shots into them: Chhaya only feels them while her jaws hang open after a
 * grab, Aandhi only while he holds up his storm, Raakhasur only while he reels from his own touch, Suryakavach only
 * in the eclipse, Darpan-asur only when dull, Vishdhar only through his heads. With no text on screen, the fight has
 * to show it:
 *
 *   guarded  a faint shell of light around the boss that flares where shots strike it (they glance off)
 *   open     the shell breaks (a burst of shards and a gold ring), a gold reticle closes on the boss and pulses for
 *            as long as the window lasts, the boss's outline glows gold
 *
 * Drawn in world space over the boss.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** The bosses whose shell this applies to (their snapshot `sn` is 1 while they are open). */
export const GUARDED = new Set<string>([
  'chhaya',
  'aandhi',
  'raakhasur',
  'suryakavach',
  'darpan',
  'vishdhar',
]);

/** Where the reticle closes, as a share of the boss's height above its feet (Chhaya: her open jaws). */
export const WEAK_POINT: Record<string, number> = {
  chhaya: 0.8,
  aandhi: 0.62,
  raakhasur: 0.7,
  suryakavach: 0.6,
};

/** A hexagon-ribbed shell of light, `flare` 0..1 just after a hit. */
export function drawGuardShell(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  flare: number,
  nowMs: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const a = 0.12 + 0.4 * flare;
  const g = ctx.createRadialGradient(x, y, Math.min(rx, ry) * 0.6, x, y, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(140,180,255,0)');
  g.addColorStop(0.85, `rgba(140,180,255,${a * 0.5})`);
  g.addColorStop(1, 'rgba(140,180,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  // the ribs: a few arcs turning slowly
  ctx.strokeStyle = `rgba(190,215,255,${0.18 + 0.5 * flare})`;
  ctx.lineWidth = 1.5;
  const t = nowMs / 2600;
  for (let i = 0; i < 6; i++) {
    const a0 = t + (i * TAU) / 6;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, a0, a0 + 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/** The gold reticle on an open boss, closing in when the window opens (`since` s ago) and pulsing after. */
export function drawOpenMark(ctx: Ctx, x: number, y: number, r: number, since: number, nowMs: number): void {
  const close = Math.min(1, since / 0.25);
  const R = r * (1.8 - 0.8 * (1 - (1 - close) ** 3));
  const pulse = 0.75 + 0.25 * Math.sin(nowMs / 90);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // the gold glow on the boss
  const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.2);
  g.addColorStop(0, `rgba(255,214,90,${0.22 * pulse})`);
  g.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - R * 1.2, y - R * 1.2, R * 2.4, R * 2.4);
  // four brackets closing in, a ring, a turning dashed ring
  ctx.strokeStyle = `rgba(255,224,120,${0.9 * pulse})`;
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const a = (i * TAU) / 4 + Math.PI / 4;
    const cx = x + Math.cos(a) * R;
    const cy = y + Math.sin(a) * R;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * 10 + Math.sin(a) * 9, cy - Math.sin(a) * 10 - Math.cos(a) * 9);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx - Math.cos(a) * 10 - Math.sin(a) * 9, cy - Math.sin(a) * 10 + Math.cos(a) * 9);
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.55, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -nowMs / 30;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.8, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** The moment the shell breaks: shards flying out and a gold ring (`u` 0..1 over 0.5 s). */
export function drawShellBreak(ctx: Ctx, x: number, y: number, r: number, u: number): void {
  if (u <= 0 || u >= 1) return;
  const a = 1 - u;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,220,110,${a})`;
  ctx.lineWidth = 4 * a + 1;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + u * 1.4), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = `rgba(200,225,255,${a})`;
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * TAU + i * 0.7;
    const d = r * (1 + u * 1.8);
    const px = x + Math.cos(ang) * d;
    const py = y + Math.sin(ang) * d * 0.8;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang + u * 5);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(-4, 3);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
