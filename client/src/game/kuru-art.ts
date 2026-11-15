/**
 * Samarpan Maidan (saga stage 7) art: Ranbhoomi. The war chariot the squad rides (four white horses, a banner
 * with a sun banner), the stage's rakshasas (archers, war elephants with a howdah, war drummers), Maniyodha
 * with the gem on his brow, his arrows and his agnibaan fire, and the fallen general's memorial at the rest stop.
 * World coordinates.
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

/** A spoked wheel. */
function wheel(ctx: Ctx, x: number, y: number, r: number, a: number): void {
  ctx.strokeStyle = '#3f2a14';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const k = a + (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(k) * r, y + Math.sin(k) * r);
    ctx.stroke();
  }
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, TAU);
  ctx.fill();
}

/** A white horse at a gallop (x: chest, y: hooves), `run`: a phase for the legs. */
function horse(ctx: Ctx, x: number, y: number, run: number, shade: string): void {
  const k = Math.sin(run);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(x - 16, y - 26, 20, 9, 0, 0, TAU);
  ctx.fill();
  // neck and head
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 30);
  ctx.lineTo(x + 8, y - 46);
  ctx.lineTo(x + 18, y - 42);
  ctx.lineTo(x + 6, y - 24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x + 4, y - 48, 3, 4);
  // legs
  ctx.strokeStyle = shade;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 20);
  ctx.lineTo(x - 2 + k * 8, y);
  ctx.moveTo(x - 10, y - 20);
  ctx.lineTo(x - 12 - k * 6, y);
  ctx.moveTo(x - 26, y - 20);
  ctx.lineTo(x - 22 + k * 7, y);
  ctx.moveTo(x - 30, y - 20);
  ctx.lineTo(x - 36 - k * 6, y);
  ctx.stroke();
  // tail and mane
  ctx.strokeStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(x - 36, y - 28);
  ctx.quadraticCurveTo(x - 46, y - 24 + k * 3, x - 44, y - 12);
  ctx.stroke();
}

/**
 * The squad's war chariot: a gilded car on two great wheels, a team of white horses in front and a sun banner
 * (the squad's own). `rolling` while under way. y is the deck.
 */
export function drawChariot(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  nowMs: number,
  rolling: boolean,
): void {
  const t = nowMs / 1000;
  const w = x1 - x0;
  const run = rolling ? t * 14 : 0;
  // horses in front (to the right), harnessed by a pole
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1 - 8, y + 8);
  ctx.lineTo(x1 + 50, y - 10);
  ctx.stroke();
  horse(ctx, x1 + 78, y + 32, run + 1.3, '#d6d3d1');
  horse(ctx, x1 + 66, y + 32, run, '#f5f5f4');
  // dust when rolling
  if (rolling)
    for (let i = 0; i < 6; i++) {
      const ph = (t * 2 + i / 6) % 1;
      ctx.fillStyle = `rgba(214,190,150,${0.5 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x0 - 6 - ph * 40, y + 26 - ph * 10, 5 + ph * 10, 0, TAU);
      ctx.fill();
    }
  // the car
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(x0, y, w, 12);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x0, y, w, 3);
  ctx.fillStyle = '#9a3412';
  ctx.beginPath();
  ctx.moveTo(x0 + 4, y);
  ctx.lineTo(x0 + 10, y - 22);
  ctx.lineTo(x0 + 28, y - 22);
  ctx.lineTo(x0 + 22, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 - 6, y);
  ctx.quadraticCurveTo(x1 + 4, y - 18, x1 - 10, y - 26);
  ctx.stroke();
  // wheels
  const a = rolling ? t * 6 : 0;
  wheel(ctx, x0 + w * 0.28, y + 16, 16, a);
  wheel(ctx, x0 + w * 0.72, y + 16, 16, a);
  // banner pole with a sun banner
  const px = x0 + 16;
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px, y - 20);
  ctx.lineTo(px, y - 96);
  ctx.stroke();
  const fl = Math.sin(t * 5) * 4;
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.moveTo(px, y - 96);
  ctx.lineTo(px - 40, y - 90 + fl);
  ctx.lineTo(px - 34, y - 80 + fl * 0.5);
  ctx.lineTo(px - 40, y - 70 + fl);
  ctx.lineTo(px, y - 68);
  ctx.closePath();
  ctx.fill();
  // a monkey figure on it
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(px - 18, y - 86 + fl * 0.6, 4, 0, TAU);
  ctx.fill();
  ctx.fillRect(px - 21, y - 82 + fl * 0.6, 6, 7);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px - 15, y - 77 + fl * 0.6);
  ctx.quadraticCurveTo(px - 8, y - 76, px - 10, y - 86);
  ctx.stroke();
}

/** An archer of the asura host: a bowman in a red turban; `drawn` ticks since he loosed (bow drawn just before). */
export function drawArcher(
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
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x - 6, y - 14, 4, 14);
  ctx.fillRect(x + 2, y - 14, 4, 14);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(x - 7, y - 30, 14, 17);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(x - 7, y - 18, 14, 4);
  ctx.fillStyle = '#c08457';
  ctx.beginPath();
  ctx.arc(x, y - 35, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(x - 7, y - 42, 14, 5);
  ctx.fillRect(x - face * 7, y - 40, 3, 8);
  // quiver
  ctx.fillStyle = '#78350f';
  ctx.fillRect(x - face * 9 - 2, y - 36, 4, 14);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x - face * 9 - 1 + i, y - 36);
    ctx.lineTo(x - face * 9 - 1 + i, y - 40);
    ctx.stroke();
  }
  // bow raised high (it lofts): drawn back just after a volley (a recoil) and slowly again before the next
  const draw = since < 6 ? 1 - since / 6 : Math.min(1, (since % 84) / 84);
  const bx = x + face * 12;
  const by = y - 34;
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(bx, by, 14, face > 0 ? -1.9 : Math.PI - 1.2, face > 0 ? 1.2 - 1.2 : Math.PI + 1.9 - 1.2);
  ctx.stroke();
  ctx.strokeStyle = '#f5f5f4';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + face * Math.cos(-1.9 + 0.3) * 14, by + Math.sin(-1.9 + 0.3) * 14);
  ctx.lineTo(bx - face * draw * 8, by - 2);
  ctx.lineTo(bx + face * Math.cos(0) * 14, by + Math.sin(0.0) * 14);
  ctx.stroke();
  ctx.fillStyle = '#c08457';
  ctx.fillRect(bx - face * draw * 8 - 2, by - 4, 4, 4);
  void t;
  ctx.restore();
}

/**
 * A war elephant: grey bulk with painted brow, tusks, a red-gold caparison and a howdah with a spearman.
 * `mode`: 0 walking or blowing, 1 trumpeting (trunk raised), 2 charging.
 */
export function drawElephant(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  mode: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.6;
  ctx.save();
  if (flash) ctx.filter = 'brightness(1.8)';
  ctx.translate(x, 0);
  ctx.scale(face, 1);
  const pace = mode === 2 ? 14 : 4;
  const k = Math.sin(t * pace);
  const bob = mode === 2 ? Math.abs(k) * 3 : Math.abs(k);
  // legs
  ctx.fillStyle = '#57534e';
  for (const [lx, ph] of [
    [-24, 0],
    [-12, Math.PI],
    [12, Math.PI],
    [22, 0],
  ] as const) {
    const s = Math.sin(t * pace + ph);
    ctx.fillRect(lx - 6 + s * (mode === 2 ? 4 : 1.5), y - 22, 12, 22);
  }
  // body
  ctx.fillStyle = '#78716c';
  ctx.beginPath();
  ctx.ellipse(0, y - 34 - bob, 34, 20, 0, 0, TAU);
  ctx.fill();
  // caparison
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.moveTo(-22, y - 50 - bob);
  ctx.lineTo(16, y - 50 - bob);
  ctx.lineTo(14, y - 26 - bob);
  ctx.lineTo(-20, y - 26 - bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-20, y - 29 - bob, 34, 3);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-16 + i * 8, y - 24 - bob, 2, 0, TAU);
    ctx.fill();
  }
  // head
  ctx.fillStyle = '#78716c';
  ctx.beginPath();
  ctx.ellipse(32, y - 40 - bob, 14, 16, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath();
  ctx.ellipse(26, y - 42 - bob, 8, 12, 0.2, 0, TAU);
  ctx.fill();
  // painted brow
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.moveTo(34, y - 56 - bob);
  ctx.lineTo(40, y - 46 - bob);
  ctx.lineTo(30, y - 46 - bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(38, y - 46 - bob, 3, 3);
  // trunk: hanging, raised to trumpet, or forward in the charge
  ctx.strokeStyle = '#78716c';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(42, y - 36 - bob);
  if (mode === 1) ctx.quadraticCurveTo(58, y - 50, 54, y - 76 + Math.sin(t * 20) * 2);
  else if (mode === 2) ctx.quadraticCurveTo(58, y - 30, 66, y - 22);
  else ctx.quadraticCurveTo(48, y - 22, 44 + Math.sin(t * 2) * 3, y - 8);
  ctx.stroke();
  // tusks
  ctx.strokeStyle = '#fafaf9';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(40, y - 30 - bob);
  ctx.quadraticCurveTo(54, y - 26, 58, y - 36);
  ctx.stroke();
  // ear flap
  ctx.fillStyle = '#6b6560';
  ctx.beginPath();
  ctx.ellipse(22, y - 40 - bob, 7, 13, Math.sin(t * 3) * 0.2, 0, TAU);
  ctx.fill();
  // howdah and its spearman
  ctx.fillStyle = '#a16207';
  ctx.fillRect(-18, y - 66 - bob, 26, 14);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-20, y - 68 - bob, 30, 3);
  ctx.fillStyle = '#c08457';
  ctx.beginPath();
  ctx.arc(-4, y - 74 - bob, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(-9, y - 81 - bob, 10, 4);
  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, y - 66 - bob);
  ctx.lineTo(mode === 2 ? 30 : 14, y - 96 - bob + (mode === 2 ? 22 : 0));
  ctx.stroke();
  // tail
  ctx.strokeStyle = '#57534e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-34, y - 38 - bob);
  ctx.lineTo(-40, y - 22 + Math.sin(t * 4) * 3);
  ctx.stroke();
  ctx.restore();
  if (mode === 1) {
    // the trumpet: rings out from the raised trunk
    const k2 = (nowMs / 300) % 1;
    ctx.strokeStyle = `rgba(254,243,199,${0.8 - k2 * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + face * 54, y - 80, 10 + k2 * 26, 0, TAU);
    ctx.stroke();
  }
  if (mode === 2)
    for (let i = 0; i < 5; i++) {
      const ph = (nowMs / 400 + i / 5) % 1;
      ctx.fillStyle = `rgba(214,190,150,${0.55 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(x - face * (30 + ph * 50), y - 6 - ph * 12, 6 + ph * 10, 0, TAU);
      ctx.fill();
    }
}

/** A war drummer beating a great nagara drum; `since` ticks since the last beat (the drum pulses). */
export function drawDrummer(
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
  // the drum, on its stand
  const dx = x + face * 14;
  ctx.fillStyle = '#78350f';
  ctx.fillRect(dx - 2, y - 14, 4, 14);
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.ellipse(dx, y - 24, 14, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(dx, y - 31, 13, 4, 0, 0, TAU);
  ctx.fill();
  // the drummer
  ctx.fillStyle = '#292524';
  ctx.fillRect(x - 6, y - 12, 4, 12);
  ctx.fillRect(x + 2, y - 12, 4, 12);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 7, y - 28, 14, 16);
  ctx.fillStyle = '#c08457';
  ctx.beginPath();
  ctx.arc(x, y - 33, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(x - 7, y - 40, 14, 5);
  const hit = since < 5;
  ctx.strokeStyle = '#c08457';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + face * 4, y - 24);
  ctx.lineTo(dx - face * 4, hit ? y - 32 : y - 44 + Math.sin(t * 8) * 2);
  ctx.stroke();
  if (since < 18) {
    const k = since / 18;
    ctx.strokeStyle = `rgba(250,204,21,${0.8 - k * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dx, y - 28, 16 + k * 60, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

export interface ManiyodhaView {
  at: number;
  tt: number;
  wind: number;
  dead: boolean;
  flash: boolean;
  face: number;
  phase: number;
  /** calling or loosing samarpanastra */
  samarpan: boolean;
  /** spent after the storm (stunned) */
  spent: boolean;
  ids: { fan: number; agnibaan: number; cleave: number };
}

/**
 * Maniyodha: a tall warrior in dark armour with a great bow, the jewel on his brow glowing, a sword at his hip.
 * Calling SAMARPANASTRA he raises his hands, and a blue-gold glow gathers over him.
 */
export function drawManiyodha(ctx: Ctx, x: number, y: number, nowMs: number, v: ManiyodhaView): void {
  const t = nowMs / 1000;
  ctx.save();
  if (v.flash) ctx.filter = 'brightness(1.7)';
  if (v.dead) {
    // fallen to one knee, bow down, the jewel dark
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 18, y - 40, 36, 30);
    ctx.fillStyle = '#c08457';
    ctx.beginPath();
    ctx.arc(x + 4, y - 46, 9, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 40, y - 2);
    ctx.lineTo(x + 30, y - 6);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const k = v.wind > 0 ? Math.min(1, v.tt / v.wind) : 1;
  const f = v.face;
  if (v.samarpan) {
    glow(ctx, x, y - 120, 140, 'rgba(96,165,250,0.45)');
    glow(ctx, x, y - 120, 70, 'rgba(250,204,21,0.5)');
  }
  // rendered in 3D once loaded (boss3d.ts): body and arms; the bow, sword, jewel's glow and arrows stay drawn
  const r3 = bossReady('maniyodha');
  if (r3) drawPart(ctx, 'maniyodha', 'body', x, y, 0, f < 0);
  if (!r3) {
    // legs and dhoti
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 12, y - 30, 9, 30);
    ctx.fillRect(x + 3, y - 30, 9, 30);
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 50);
    ctx.lineTo(x + 16, y - 50);
    ctx.lineTo(x + 14, y - 26);
    ctx.lineTo(x - 14, y - 26);
    ctx.closePath();
    ctx.fill();
    // armour
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 17, y - 80, 34, 32);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 17, y - 80, 34, 3);
    ctx.fillRect(x - 2, y - 78, 4, 28);
    // a sash
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 15, y - 78);
    ctx.lineTo(x + 15, y - 52);
    ctx.stroke();
    // head: crown, long hair, the jewel
    ctx.fillStyle = '#c08457';
    ctx.beginPath();
    ctx.arc(x, y - 88, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(x - f * 9, y - 92);
    ctx.quadraticCurveTo(x - f * 18, y - 80, x - f * 14, y - 66);
    ctx.lineTo(x - f * 8, y - 82);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 95);
    ctx.lineTo(x - 6, y - 104);
    ctx.lineTo(x, y - 98);
    ctx.lineTo(x + 6, y - 104);
    ctx.lineTo(x + 9, y - 95);
    ctx.closePath();
    ctx.fill();
  }
  const gem = 0.7 + 0.3 * Math.sin(t * 4);
  if (!r3) {
    ctx.fillStyle = v.phase >= 2 ? '#f0abfc' : '#a5f3fc';
    ctx.beginPath();
    ctx.arc(x + f * 2, y - 93, 2.6, 0, TAU);
    ctx.fill();
  }
  glow(ctx, x + f * 2, y - 93, 14 * gem, v.phase >= 2 ? 'rgba(240,171,252,0.8)' : 'rgba(165,243,252,0.7)');
  if (!r3) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(x + f * 3 - 1, y - 89, 2, 2);
  }
  /** an arm from the shoulder to the hand: rendered once loaded, else a stroke */
  const arm = (sx: number, sy: number, hx: number, hy: number): void => {
    if (r3) drawLimb(ctx, 'maniyodha', 'arm', sx, sy, hx, hy, f < 0);
    else {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
  };
  // arms and the bow
  ctx.strokeStyle = '#c08457';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  if (v.samarpan) {
    arm(x - 14, y - 76, x - 20, y - 110);
    arm(x + 14, y - 76, x + 20, y - 110);
  } else if (v.at === v.ids.cleave) {
    // the sword raised for the cut
    arm(x + f * 12, y - 76, x + f * 22, y - 100 + k * 30);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + f * 22, y - 100 + k * 30);
    ctx.lineTo(x + f * (22 + 40 * k), y - 140 + k * 70);
    ctx.stroke();
  } else {
    const bx = x + f * 26;
    const by = y - 76;
    const pull = v.at === v.ids.fan || v.at === v.ids.agnibaan ? k : 0.2;
    arm(x + f * 12, y - 76, bx, by);
    arm(x - f * 10, y - 76, bx - f * (10 + pull * 18), by);
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bx - f * 18, by, 34, f > 0 ? -1.1 : Math.PI - 1.1, f > 0 ? 1.1 : Math.PI + 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#f5f5f4';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx - f * 18 + f * Math.cos(1.1) * 34, by - Math.sin(1.1) * 34);
    ctx.lineTo(bx - f * (10 + pull * 18), by);
    ctx.lineTo(bx - f * 18 + f * Math.cos(1.1) * 34, by + Math.sin(1.1) * 34);
    ctx.stroke();
    if (v.at === v.ids.agnibaan && v.tt < v.wind) {
      // a fire arrow nocked
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx - f * (10 + pull * 18), by);
      ctx.lineTo(bx + f * 20, by);
      ctx.stroke();
      glow(ctx, bx + f * 20, by, 22, 'rgba(249,115,22,0.7)');
    }
  }
  if (v.spent) {
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i / 3) * TAU;
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 16, y - 112 + Math.sin(a) * 5, 2.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Stage 7 shots: arrows (pointing along their flight), the agnibaan fire arrow, fire running along the ground. */
export function drawKuruShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  if (kind === 'arrow') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(4, 0);
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(2, -3);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-17, -3, 4, 2);
    ctx.fillRect(-17, 1, 4, 2);
    ctx.restore();
    return true;
  }
  if (kind === 'meteor') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.restore();
    glow(ctx, b.x, b.y, 26, 'rgba(249,115,22,0.8)');
    for (let i = 1; i < 6; i++) {
      ctx.fillStyle = `rgba(251,146,60,${0.6 - i * 0.1})`;
      ctx.beginPath();
      ctx.arc(b.x - b.vx * 0.012 * i, b.y - b.vy * 0.012 * i, 6 - i, 0, TAU);
      ctx.fill();
    }
    return true;
  }
  if (kind === 'flame') {
    const t = nowMs / 1000;
    for (let i = 0; i < 4; i++) {
      const h = 14 + Math.sin(t * 14 + i + b.id) * 5;
      ctx.fillStyle = i % 2 ? '#f97316' : '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(b.x - 10 + i * 6, b.y + 12);
      ctx.quadraticCurveTo(b.x - 8 + i * 6, b.y + 12 - h * 1.5, b.x - 4 + i * 6, b.y + 12);
      ctx.fill();
    }
    glow(ctx, b.x, b.y + 4, 26, 'rgba(249,115,22,0.5)');
    return true;
  }
  return false;
}

/** The rest stop: the fallen general's memorial: his shield and spear planted on a bed of spent arrows, banners, a lamp. */
export function drawVeersmarak(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  const t = nowMs / 1000;
  glow(ctx, cx, y - 40, 140, 'rgba(254,243,199,0.22)');
  // the arrows, a bristling bed
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const ax = cx - 60 + i * 4.8;
    const lean = Math.sin(i * 1.7) * 0.25;
    ctx.beginPath();
    ctx.moveTo(ax, y);
    ctx.lineTo(ax + Math.sin(lean) * 34, y - 30);
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(ax + Math.sin(lean) * 34 - 1, y - 32, 2, 3);
  }
  // a spear planted in the middle, a round shield hung on it, a helmet on top
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, y - 96);
  ctx.stroke();
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.moveTo(cx, y - 108);
  ctx.lineTo(cx - 4, y - 96);
  ctx.lineTo(cx + 4, y - 96);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath();
  ctx.arc(cx, y - 52, 18, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(cx, y - 52, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.arc(cx, y - 84, 8, Math.PI, TAU);
  ctx.fill();
  // banners either side
  for (const [bx, col] of [
    [cx - 44, '#b91c1c'],
    [cx + 44, '#ea580c'],
  ] as const) {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx, y - 80);
    ctx.stroke();
    const fl = Math.sin(t * 4 + bx) * 3;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(bx, y - 80);
    ctx.lineTo(bx + 18, y - 76 + fl);
    ctx.lineTo(bx, y - 64);
    ctx.closePath();
    ctx.fill();
  }
  // a bow laid down before it
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx - 20, y + 30, 46, Math.PI * 1.25, Math.PI * 1.75);
  ctx.stroke();
  // a lamp
  const lx = cx - 80;
  ctx.fillStyle = '#ca8a04';
  ctx.fillRect(lx - 5, y - 8, 10, 8);
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(lx - 2, y - 8);
  ctx.quadraticCurveTo(lx, y - 20 - Math.sin(t * 9) * 2, lx + 2, y - 8);
  ctx.fill();
  glow(ctx, lx, y - 12, 44, 'rgba(251,191,36,0.45)');
}
