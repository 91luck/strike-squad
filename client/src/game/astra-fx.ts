import { GAME_CONFIG, type BossRule } from '@strikesquad/shared';

/**
 * Astra Saga drawing: the new astras in flight (serpents, the sudarshana discus, vaishnava orbs, narayanastra
 * arrows, a spirit's sparks, pashupata's fire rain), the pashupata spirit itself, and the bosses' astra calls
 * (the wind-up every player learns to read: the hiss of serpents, the gathering orb, the halo of a thousand
 * arrows, the four-headed light of the brahmashirsha).
 *
 * Stateless drawing in world space, procedural shapes only (nothing to download), like power-fx.ts.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const INK = '#120f17';

function glow(ctx: Ctx, x: number, y: number, r: number, inner: string, outer = 'rgba(0,0,0,0)'): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A serpent of light: a sinuous body trailing behind its head. Player serpents are jade and gold, enemy ones violet. */
export function drawSerpent(
  ctx: Ctx,
  x: number,
  y: number,
  vx: number,
  vy: number,
  enemy: boolean,
  nowMs: number,
): void {
  const a = Math.atan2(vy, vx);
  const body = enemy ? '#7c3aed' : '#10b981';
  const belly = enemy ? '#c4b5fd' : '#fde68a';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 22, enemy ? 'rgba(139,92,246,0.45)' : 'rgba(16,185,129,0.45)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) pts.push([-i * 5, Math.sin(nowMs / 60 - i * 0.9) * (i * 0.7)]);
  for (const [w, c] of [
    [9, INK],
    [6, body],
    [2, belly],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
  // head with eyes
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(2, 0, 7, 5.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(2, 0, 5.5, 4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = enemy ? '#f43f5e' : '#fef3c7';
  ctx.fillRect(4, -3, 2, 2);
  ctx.fillRect(4, 1, 2, 2);
  // flicking tongue
  if (Math.floor(nowMs / 120) % 2 === 0) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(12, 0);
    ctx.lineTo(14, -2);
    ctx.moveTo(12, 0);
    ctx.lineTo(14, 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** The sudarshana chakra: a spinning golden discus with teeth and a fiery rim. */
export function drawChakra(ctx: Ctx, x: number, y: number, nowMs: number, homeward: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 30, homeward ? 'rgba(253,224,71,0.35)' : 'rgba(251,191,36,0.55)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(nowMs / 40);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 11 : 15;
    const a = (i / 24) * TAU;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 9.5 : 13.5;
    const a = (i / 24) * TAU;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
    ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
    ctx.stroke();
  }
  ctx.restore();
}

/** A vaishnava orb. A boss's orb is a heavy golden sun ringed with warning red; one turned back burns blue-white. */
export function drawOrb(ctx: Ctx, x: number, y: number, enemy: boolean, nowMs: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 90);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, 40 + pulse * 8, enemy ? 'rgba(250,204,21,0.55)' : 'rgba(125,211,252,0.6)');
  const core = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 15);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.45, enemy ? '#fde047' : '#bae6fd');
  core.addColorStop(1, enemy ? '#b45309' : '#0284c7');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = enemy ? `rgba(248,113,113,${0.5 + pulse * 0.5})` : 'rgba(224,242,254,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 22, 8, nowMs / 500, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, 22, 8, -nowMs / 500 + 1, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** A narayanastra arrow: a falling bolt of gold with a bright head. */
export function drawArrow(ctx: Ctx, x: number, y: number, vx: number, vy: number): void {
  const a = Math.atan2(vy, vx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  const tail = ctx.createLinearGradient(-34, 0, 0, 0);
  tail.addColorStop(0, 'rgba(253,224,71,0)');
  tail.addColorStop(1, 'rgba(253,224,71,0.85)');
  ctx.strokeStyle = tail;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();
  ctx.fillStyle = '#fff7d6';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-3, -4);
  ctx.lineTo(-3, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A spirit's spark (pashupata): a small blue-white bolt. */
export function drawSpark(ctx: Ctx, x: number, y: number, vx: number, vy: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, 10, 'rgba(165,243,252,0.9)');
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 2;
  const a = Math.atan2(vy, vx);
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(a) * 12, y - Math.sin(a) * 12);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

/** Pashupata's fire rain: a falling ball of fire with a long tail. */
export function drawMeteor(ctx: Ctx, x: number, y: number, vx: number, vy: number, nowMs: number): void {
  const a = Math.atan2(vy, vx);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const d = i * 9;
    glow(
      ctx,
      x - Math.cos(a) * d,
      y - Math.sin(a) * d + Math.sin(nowMs / 50 + i) * 1.5,
      14 - i * 2,
      i === 0 ? 'rgba(255,250,220,0.95)' : 'rgba(255,120,30,0.6)',
      'rgba(255,40,0,0)',
    );
  }
  ctx.restore();
}

/** The pashupata spirit: a translucent blue flame with a trident, hovering at its summoner's shoulder. */
export function drawSpirit(ctx: Ctx, x: number, y: number, left: number, nowMs: number): void {
  const fade = Math.min(1, left / 0.6);
  const bob = Math.sin(nowMs / 220) * 4;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y + bob, 34, 'rgba(56,189,248,0.4)');
  for (let i = 0; i < 4; i++) {
    const h = 28 - i * 5 + Math.sin(nowMs / 80 + i) * 3;
    const g = ctx.createLinearGradient(0, y + bob - h, 0, y + bob + 12);
    g.addColorStop(0, 'rgba(186,230,253,0)');
    g.addColorStop(0.6, 'rgba(125,211,252,0.55)');
    g.addColorStop(1, 'rgba(224,242,254,0.85)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 10 + i * 2, y + bob + 12);
    ctx.quadraticCurveTo(x + Math.sin(nowMs / 120 + i) * 6, y + bob - h, x + 10 - i * 2, y + bob + 12);
    ctx.fill();
  }
  // trident
  ctx.strokeStyle = 'rgba(224,242,254,0.95)';
  ctx.lineWidth = 2;
  const tx = x + 14;
  const ty = y + bob - 20;
  ctx.beginPath();
  ctx.moveTo(tx, ty + 34);
  ctx.lineTo(tx, ty);
  ctx.moveTo(tx - 6, ty + 6);
  ctx.lineTo(tx - 6, ty - 2);
  ctx.moveTo(tx + 6, ty + 6);
  ctx.lineTo(tx + 6, ty - 2);
  ctx.moveTo(tx - 6, ty + 6);
  ctx.lineTo(tx + 6, ty + 6);
  ctx.stroke();
  // eyes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 4, y + bob - 2, 2, 3);
  ctx.fillRect(x + 2, y + bob - 2, 2, 3);
  ctx.restore();
}

/** Colour of each boss astra (cast rings, banners). */
export const RULE_COLOR: Record<BossRule, string> = {
  naga: '#a78bfa',
  narayana: '#fde047',
  vaishnava: '#fbbf24',
  brahmashirsha: '#f472b6',
};

/**
 * A boss calling an astra (from its cast point x, y). `t` is seconds since the call, `wind` its wind-up in
 * seconds, `storm` whether a narayanastra storm is raging. The wind-up always reads the same way: rings that
 * close in on the cast point, getting brighter as release nears.
 */
export function drawBossCast(
  ctx: Ctx,
  kind: BossRule,
  x: number,
  y: number,
  t: number,
  storm: boolean,
  nowMs: number,
  viewW: number,
  camX: number,
): void {
  const BA = GAME_CONFIG.bossAstra;
  const wind =
    kind === 'naga'
      ? BA.naga.windupSec
      : kind === 'vaishnava'
        ? BA.vaishnava.windupSec
        : kind === 'narayana'
          ? BA.narayana.windupSec
          : BA.brahmashirsha.windupSec;
  const k = Math.min(1, t / wind);
  const col = RULE_COLOR[kind];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (!storm) {
    // Closing rings: the same tell for every boss astra.
    for (let i = 0; i < 3; i++) {
      const r = 90 * (1 - ((k + i / 3) % 1)) + 10;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.25 + k * 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    glow(ctx, x, y, 30 + k * 40, `${col}99`);
  }
  if (kind === 'naga') {
    // Hooded serpent heads rising around the cast point.
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.5;
      const r = 24 + k * 18;
      drawSerpent(
        ctx,
        x + Math.cos(a) * r,
        y + Math.sin(a) * r,
        Math.cos(a),
        Math.sin(a),
        true,
        nowMs + i * 90,
      );
    }
  } else if (kind === 'vaishnava') {
    ctx.globalAlpha = 0.4 + k * 0.6;
    drawOrb(ctx, x, y, true, nowMs);
    ctx.globalAlpha = 1;
  } else if (kind === 'narayana') {
    // A halo of a thousand arrows in the sky over the arena; while the storm rages, the whole sky glows.
    const cx = camX + viewW / 2;
    const cy = 150;
    const n = 36;
    const R = 120 + (storm ? 30 : k * 30);
    const spin = nowMs / (storm ? 400 : 900);
    ctx.globalAlpha = storm ? 0.9 : 0.3 + k * 0.6;
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * TAU;
      drawArrow(
        ctx,
        cx + Math.cos(a) * R,
        cy + Math.sin(a) * R * 0.35,
        Math.cos(a + Math.PI / 2),
        Math.sin(a + Math.PI / 2),
      );
    }
    glow(ctx, cx, cy, 70, 'rgba(253,224,71,0.5)');
    ctx.globalAlpha = 1;
  } else {
    // Brahmashirsha: four heads of light gathering over the caster, and a column that thickens as it charges.
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.45;
      const hx = x + Math.cos(a) * (34 + k * 26);
      const hy = y - 40 + Math.sin(a) * (30 + k * 20);
      glow(ctx, hx, hy, 14 + k * 10, 'rgba(255,255,255,0.9)', 'rgba(244,114,182,0)');
    }
    const w = 10 + k * 70;
    const col2 = ctx.createLinearGradient(x - w, 0, x + w, 0);
    col2.addColorStop(0, 'rgba(244,114,182,0)');
    col2.addColorStop(0.5, `rgba(255,240,250,${0.25 + k * 0.5})`);
    col2.addColorStop(1, 'rgba(244,114,182,0)');
    ctx.fillStyle = col2;
    ctx.fillRect(x - w, 0, w * 2, y);
  }
  ctx.restore();
}

/** Stunned boss: little stars circling over its head. */
export function drawDazed(ctx: Ctx, x: number, y: number, nowMs: number): void {
  ctx.save();
  ctx.fillStyle = '#fde047';
  for (let i = 0; i < 3; i++) {
    const a = nowMs / 200 + (i / 3) * TAU;
    const sx = x + Math.cos(a) * 26;
    const sy = y + Math.sin(a) * 8;
    ctx.beginPath();
    for (let j = 0; j < 10; j++) {
      const r = j % 2 ? 2.5 : 6;
      const b = (j / 10) * TAU - Math.PI / 2;
      ctx.lineTo(sx + Math.cos(b) * r, sy + Math.sin(b) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Untouchable boss (narayanastra storm): a golden shell around it. */
export function drawImmune(ctx: Ctx, x: number, y: number, w: number, h: number, nowMs: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(253,224,71,${0.45 + 0.3 * Math.sin(nowMs / 120)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y - h / 2, w * 0.7, h * 0.65, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
