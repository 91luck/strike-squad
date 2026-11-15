/**
 * Bhasm Parvat (saga stage 6) art: the ash volcano. The lava rising behind the climb, the stage's rakshasas (prets,
 * ghosts that drift through rock; ash golems that fall to a heap and rise again; skull-lamp carriers that call up the
 * ghosts), Raakhasur himself with his burning hand, Nartaki's dance (her pose shown above him, a beat ring counting it
 * down) and the stone shrine at the rest stop. World coordinates.
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

/** The lava: a glowing crust-cracked sea from `y` down past the bottom of the view, with a heat haze above it. */
export function drawLava(
  ctx: Ctx,
  y: number,
  camX: number,
  viewW: number,
  bottom: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const x0 = camX - 20;
  const x1 = camX + viewW + 20;
  if (bottom <= y) return;
  // heat haze above the surface
  const haze = ctx.createLinearGradient(0, y - 140, 0, y);
  haze.addColorStop(0, 'rgba(255,90,20,0)');
  haze.addColorStop(1, 'rgba(255,90,20,0.32)');
  ctx.fillStyle = haze;
  ctx.fillRect(x0, y - 140, x1 - x0, 140);
  // the body
  const g = ctx.createLinearGradient(0, y, 0, y + 160);
  g.addColorStop(0, '#fde047');
  g.addColorStop(0.08, '#f97316');
  g.addColorStop(0.4, '#b91c1c');
  g.addColorStop(1, '#450a0a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1; x += 12) {
    const w = Math.sin(x / 47 + t * 1.7) * 4 + Math.sin(x / 19 - t * 2.3) * 2;
    ctx.lineTo(x, y + w);
  }
  ctx.lineTo(x1, bottom);
  ctx.closePath();
  ctx.fill();
  // dark crust plates drifting on it
  ctx.fillStyle = 'rgba(41,12,6,0.75)';
  const step = 90;
  const off = (t * 18) % step;
  for (let x = Math.floor(x0 / step) * step - off; x < x1; x += step) {
    const k = Math.floor((x + off) / step);
    const py = y + 18 + ((k * 37) % 50);
    ctx.beginPath();
    ctx.ellipse(x + ((k * 53) % 40), py, 22 + (k % 3) * 6, 5, 0, 0, TAU);
    ctx.fill();
  }
  // bubbles popping on the surface
  for (let i = 0; i < 8; i++) {
    const phase = (t * 0.7 + i * 0.37) % 1;
    const bx = camX + ((i * 263 + Math.floor(t * 0.7 + i * 0.37) * 131) % Math.max(1, viewW));
    const r = 3 + phase * 7;
    ctx.strokeStyle = `rgba(254,240,138,${0.9 - phase * 0.9})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, y - phase * 6, r, Math.PI, TAU);
    ctx.stroke();
  }
  // sparks thrown up
  for (let i = 0; i < 14; i++) {
    const ph = (t * 0.9 + i * 0.13) % 1;
    const sx = camX + ((i * 197) % Math.max(1, viewW)) + Math.sin(t + i) * 10;
    const sy = y - ph * 120;
    ctx.fillStyle = `rgba(253,186,116,${1 - ph})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  glow(ctx, camX + viewW / 2, y, viewW * 0.6, 'rgba(249,115,22,0.18)');
}

/** A pret: a pale ghost with hollow eyes and a trailing smoke tail, half see-through. */
export function drawPret(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  const cy = y - 18 + Math.sin(t * 3) * 3;
  ctx.save();
  ctx.globalAlpha = flash ? 1 : 0.78;
  glow(ctx, x, cy, 34, 'rgba(165,243,252,0.35)');
  ctx.fillStyle = flash ? '#ffffff' : '#e2e8f0';
  ctx.beginPath();
  ctx.arc(x, cy - 6, 11, Math.PI, 0);
  // tattered tail
  for (let i = 0; i <= 6; i++) {
    const px = x + 11 - (i / 6) * 22;
    const py = cy + 10 + (i % 2 ? 6 : 0) + Math.sin(t * 6 + i) * 2;
    ctx.lineTo(px - face * 3, py);
  }
  ctx.closePath();
  ctx.fill();
  // reaching arms
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + face * 6, cy);
  ctx.lineTo(x + face * 18, cy - 4 + Math.sin(t * 5) * 3);
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(x - 4 + face * 2, cy - 8, 2.5, 4, 0, 0, TAU);
  ctx.ellipse(x + 4 + face * 2, cy - 8, 2.5, 4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#67e8f9';
  ctx.fillRect(x - 5 + face * 2, cy - 9, 1.5, 1.5);
  ctx.fillRect(x + 3 + face * 2, cy - 9, 1.5, 1.5);
  ctx.restore();
}

/**
 * An ash golem: a hulk of packed grey ash with embers glowing through the cracks. `down`: a smouldering heap that
 * draws itself up again (the sim raises it unless fire or an astra finished it).
 */
export function drawGolem(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  down: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.7;
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  if (down) {
    // a heap, stirring
    const stir = Math.sin(t * 4) * 1.5;
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.ellipse(x, y - 6, 22, 9 + stir, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.ellipse(x - 6, y - 10, 10, 5, 0, Math.PI, TAU);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(251,146,60,${0.5 + 0.5 * Math.sin(t * 5 + i)})`;
      ctx.fillRect(x - 14 + i * 9, y - 8 - (i % 2) * 4, 3, 2);
    }
    // ash drawn back up into it
    ctx.fillStyle = 'rgba(168,162,158,0.6)';
    for (let i = 0; i < 6; i++) {
      const ph = (t * 1.2 + i / 6) % 1;
      ctx.fillRect(x - 20 + i * 8, y - 30 + ph * 22, 2, 2);
    }
    ctx.restore();
    return;
  }
  const step = Math.sin(t * 5);
  // legs
  ctx.fillStyle = '#44403c';
  ctx.fillRect(x - 11, y - 14, 8, 14 + step * 1.5);
  ctx.fillRect(x + 3, y - 14, 8, 14 - step * 1.5);
  // body
  ctx.fillStyle = '#78716c';
  ctx.beginPath();
  ctx.moveTo(x - 15, y - 12);
  ctx.lineTo(x - 13, y - 34);
  ctx.lineTo(x + 13, y - 36);
  ctx.lineTo(x + 15, y - 12);
  ctx.closePath();
  ctx.fill();
  // head, sunk into the shoulders
  ctx.fillStyle = '#57534e';
  ctx.fillRect(x - 7 + face * 2, y - 44, 14, 10);
  ctx.fillStyle = '#fb923c';
  ctx.fillRect(x - 3 + face * 4, y - 40, 3, 2);
  ctx.fillRect(x + 2 + face * 4, y - 40, 3, 2);
  // cracks with embers
  ctx.strokeStyle = `rgba(249,115,22,${0.6 + 0.3 * Math.sin(t * 3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 30);
  ctx.lineTo(x - 2, y - 24);
  ctx.lineTo(x - 6, y - 16);
  ctx.moveTo(x + 6, y - 32);
  ctx.lineTo(x + 3, y - 22);
  ctx.stroke();
  // a heavy fist
  ctx.fillStyle = '#57534e';
  const reach = Math.max(0, Math.sin(t * 2.4)) * 6;
  ctx.fillRect(x + face * (14 + reach) - 6, y - 30, 12, 12);
  ctx.fillRect(x - face * 16 - 5, y - 28, 10, 14);
  // flakes falling off
  ctx.fillStyle = 'rgba(214,211,209,0.6)';
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.8 + i / 3) % 1;
    ctx.fillRect(x - 10 + i * 9, y - 34 + ph * 30, 2, 2);
  }
  ctx.restore();
}

/** A skull-lamp carrier: a gaunt ascetic in ash with a burning lamp in a skull held out on a staff. */
export function drawLantern(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  const bob = Math.sin(t * 4) * 1;
  ctx.fillStyle = '#292524';
  ctx.fillRect(x - 6, y - 12, 4, 12);
  ctx.fillRect(x + 2, y - 12, 4, 12);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(x - 7, y - 28 + bob, 14, 17);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(x - 7, y - 16 + bob, 14, 5);
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.arc(x, y - 32 + bob, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(x - 6, y - 38 + bob, 12, 4);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x + face * 2 - 1, y - 33 + bob, 2, 2);
  // the staff and the skull lamp
  const sx = x + face * 12;
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, y);
  ctx.lineTo(sx, y - 44);
  ctx.stroke();
  const ly = y - 48 + Math.sin(t * 2) * 1.5;
  ctx.fillStyle = '#e7e5e4';
  ctx.beginPath();
  ctx.arc(sx, ly, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(sx - 3, ly - 1, 2, 2);
  ctx.fillRect(sx + 1, ly - 1, 2, 2);
  const fl = 6 + Math.sin(t * 13) * 2;
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.moveTo(sx - 3, ly - 4);
  ctx.quadraticCurveTo(sx, ly - 4 - fl * 2, sx + 3, ly - 4);
  ctx.fill();
  glow(ctx, sx, ly - 6, 26, 'rgba(74,222,128,0.4)');
  ctx.restore();
}

export interface RaakhasurView {
  at: number;
  tt: number;
  wind: number;
  /** reeling after burning himself: wide open */
  open: boolean;
  dead: boolean;
  flash: boolean;
  face: number;
  phase: number;
  /** the pose Nartaki shows now (0 up, 1 down, 2 left, 3 right), or -1 */
  pose: number;
  /** 0..1 through the current beat */
  beat: number;
  /** which step of the dance (0-based) */
  step: number;
  steps: number;
  ids: { rush: number; ash: number; rain: number; dance: number };
  /** the view's left and right edges (Nartaki stays on screen) */
  viewL: number;
  viewR: number;
}

/** Arm angles (shoulder to hand, radians from straight down) for a pose. */
function poseArms(pose: number): [number, number] {
  if (pose === 0) return [Math.PI * 0.95, -Math.PI * 0.95]; // both up, hands on the head
  if (pose === 1) return [0.5, -0.5]; // bowing low
  if (pose === 2) return [Math.PI / 2, Math.PI / 2]; // both to the left
  if (pose === 3) return [-Math.PI / 2, -Math.PI / 2];
  return [0.25, -0.25];
}

/**
 * Raakhasur: a towering ash-grey asura with a burning right hand (the boon: whatever head it touches turns to ash).
 * During Nartaki's dance he copies her: her pose floats above with an arrow and a beat ring; when the squad keeps the
 * steps he follows into the last one, hand on his own head, and flares up.
 */
export function drawRaakhasur(ctx: Ctx, x: number, y: number, nowMs: number, v: RaakhasurView): void {
  const t = nowMs / 1000;
  const h = 110;
  ctx.save();
  if (v.flash) ctx.filter = 'brightness(1.7)';
  if (v.dead) {
    // a pile of ash where he stood, still smoking
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 48, 16, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(168,162,158,0.5)';
    for (let i = 0; i < 8; i++) {
      const ph = (t * 0.4 + i / 8) % 1;
      ctx.beginPath();
      ctx.arc(x - 30 + i * 9 + Math.sin(t + i) * 6, y - 20 - ph * 90, 4 + ph * 8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  const dancing = v.at === v.ids.dance;
  const rushing = v.at === v.ids.rush && v.tt >= v.wind;
  const k = v.wind > 0 ? Math.min(1, v.tt / v.wind) : 1;
  const sway = dancing ? Math.sin(t * 6) * 4 : Math.sin(t * 1.6) * 1.5;
  const lean = rushing ? v.face * 0.22 : 0;
  ctx.translate(x, y);
  ctx.rotate(lean);
  ctx.translate(-x, -y);
  // aura: ash smoke rising off him; brighter fire when reeling
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.5 + i / 6) % 1;
    ctx.fillStyle = `rgba(120,113,108,${0.35 * (1 - ph)})`;
    ctx.beginPath();
    ctx.arc(x - 24 + i * 10, y - h - ph * 60, 8 + ph * 14, 0, TAU);
    ctx.fill();
  }
  if (v.open) glow(ctx, x, y - h * 0.7, 120, 'rgba(249,115,22,0.55)');
  // rendered in 3D once loaded (boss3d.ts): body and arms; the fire, smoke and glows stay drawn
  const r3 = bossReady('raakhasur');
  const cx = x + sway;
  if (r3) drawPart(ctx, 'raakhasur', 'body', cx, y, 0, v.face < 0);
  if (!r3) {
    // legs in a dhoti
    ctx.fillStyle = '#292524';
    ctx.fillRect(x - 20, y - 36, 14, 36);
    ctx.fillRect(x + 6, y - 36, 14, 36);
    ctx.fillStyle = '#7c2d12';
    ctx.beginPath();
    ctx.moveTo(x - 26, y - 58);
    ctx.lineTo(x + 26, y - 58);
    ctx.lineTo(x + 22, y - 26);
    ctx.lineTo(x - 22, y - 26);
    ctx.closePath();
    ctx.fill();
    // chest: ash-smeared, three stripes of bhasma
    ctx.fillStyle = '#6b6560';
    ctx.beginPath();
    ctx.moveTo(cx - 28, y - 58);
    ctx.lineTo(cx - 32, y - 92);
    ctx.lineTo(cx + 32, y - 92);
    ctx.lineTo(cx + 28, y - 58);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e7e5e4';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 20, y - 84 + i * 6);
      ctx.lineTo(cx + 20, y - 84 + i * 6);
      ctx.stroke();
    }
    // rudraksha beads
    ctx.fillStyle = '#7f1d1d';
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 18, y - 92 + Math.sin(a) * 20, 2, 0, TAU);
      ctx.fill();
    }
    // head: matted hair piled high, tusks, red eyes, third-eye smear
    const hy = y - 104;
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.arc(cx, hy, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.ellipse(cx, hy - 16, 12, 10, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(cx - 3, hy - 32, 6, 10);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 7 + v.face * 2, hy - 3, 4, 3);
    ctx.fillRect(cx + 3 + v.face * 2, hy - 3, 4, 3);
    ctx.fillStyle = '#f5f5f4';
    ctx.fillRect(cx - 6, hy + 7, 2, 5);
    ctx.fillRect(cx + 4, hy + 7, 2, 5);
    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(cx - 6, hy - 9, 12, 2);
  }
  // arms: from the pose while dancing (following Nartaki a little late), reaching while rushing
  let [la, ra] = [0.35, -0.35];
  if (dancing && v.pose >= 0) {
    const p = poseArms(v.pose);
    const f = Math.min(1, v.beat * 2.2);
    la = 0.35 + (p[0] - 0.35) * f;
    ra = -0.35 + (p[1] + 0.35) * f;
  } else if (v.at === v.ids.rush) {
    // burning hand reaching forward
    if (v.face > 0) ra = -Math.PI / 2 - 0.2 * k;
    else la = Math.PI / 2 + 0.2 * k;
  } else if (v.at === v.ids.rain) {
    la = Math.PI * 0.85 * k;
    ra = -Math.PI * 0.85 * k;
  } else if (v.at === v.ids.ash) {
    la = 0.35 + 0.9 * k;
    ra = -0.35 - 0.9 * k;
  }
  if (v.open) {
    // reeling, his own burning hand on his head
    ra = -Math.PI * 0.92;
  }
  const arm = (sx: number, a: number, burning: boolean): void => {
    const sy = y - 88;
    const L = 40;
    const hx = sx + Math.sin(a) * L * -1;
    const hyy = sy + Math.cos(a) * L;
    if (r3) drawLimb(ctx, 'raakhasur', 'arm', sx, sy, hx, hyy, sx < cx);
    else {
      ctx.strokeStyle = '#6b6560';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(hx, hyy);
      ctx.stroke();
      ctx.fillStyle = burning ? '#fde68a' : '#57534e';
      ctx.beginPath();
      ctx.arc(hx, hyy, 7, 0, TAU);
      ctx.fill();
    }
    if (burning) {
      for (let i = 0; i < 4; i++) {
        const fl = 8 + Math.sin(t * 12 + i) * 3;
        ctx.fillStyle = i % 2 ? '#f97316' : '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(hx - 5 + i * 3, hyy - 3);
        ctx.quadraticCurveTo(hx - 3 + i * 3, hyy - 3 - fl * 1.6, hx - 1 + i * 3, hyy - 3);
        ctx.fill();
      }
      glow(ctx, hx, hyy, rushing || v.open ? 46 : 26, 'rgba(251,146,60,0.6)');
    }
  };
  // the burning hand is his right (screen-left when facing left)
  arm(cx - 30, la, v.face < 0);
  arm(cx + 30, ra, v.face > 0 || v.open);
  // ash wave windup: ground glow
  if (v.at === v.ids.ash && v.tt < v.wind) glow(ctx, x, y, 80 * k, 'rgba(214,211,209,0.4)');
  // phase 2: cracks of fire across his body
  if (v.phase >= 2) {
    ctx.strokeStyle = `rgba(249,115,22,${0.6 + 0.3 * Math.sin(t * 4)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, y - 90);
    ctx.lineTo(cx - 6, y - 76);
    ctx.lineTo(cx - 14, y - 62);
    ctx.moveTo(cx + 14, y - 88);
    ctx.lineTo(cx + 8, y - 70);
    ctx.stroke();
  }
  ctx.restore();
  if (dancing) drawNartaki(ctx, Math.max(v.viewL + 40, Math.min(v.viewR - 100, x)), y - h - 70, v, nowMs);
}

/** The arrow shape for a pose, centred on (x, y). */
function poseArrow(ctx: Ctx, x: number, y: number, pose: number, size: number): void {
  const rot = pose === 0 ? -Math.PI / 2 : pose === 1 ? Math.PI / 2 : pose === 2 ? Math.PI : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(0, -size * 0.8);
  ctx.lineTo(0, -size * 0.35);
  ctx.lineTo(-size, -size * 0.35);
  ctx.lineTo(-size, size * 0.35);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(0, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Nartaki (a spirit of the dance) dancing in the air above Raakhasur: the pose to hold, as her arms and as a big
 * arrow, a ring that empties through the beat, and a pip for each step of the dance.
 */
function drawNartaki(ctx: Ctx, x: number, y: number, v: RaakhasurView, nowMs: number): void {
  const t = nowMs / 1000;
  glow(ctx, x, y, 90, 'rgba(244,114,182,0.35)');
  ctx.save();
  // her figure: a slim dancer in pink and gold
  const sw = Math.sin(t * 6) * 3;
  ctx.fillStyle = '#be185d';
  ctx.beginPath();
  ctx.moveTo(x - 14 + sw, y + 28);
  ctx.lineTo(x + 14 + sw, y + 28);
  ctx.lineTo(x + 5, y);
  ctx.lineTo(x - 5, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fbcfe8';
  ctx.fillRect(x - 5, y - 16, 10, 16);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 6, y - 4, 12, 3);
  ctx.fillStyle = '#fde4cf';
  ctx.beginPath();
  ctx.arc(x, y - 22, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.arc(x + 2, y - 26, 6, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 3, y - 31, 6, 2);
  const [la, ra] = v.pose >= 0 ? poseArms(v.pose) : [0.4, -0.4];
  ctx.strokeStyle = '#fde4cf';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [sx, a] of [
    [x - 5, la],
    [x + 5, ra],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx, y - 14);
    ctx.lineTo(sx - Math.sin(a) * 16, y - 14 + Math.cos(a) * 16);
    ctx.stroke();
  }
  // the pose to hold: arrow + beat ring
  if (v.pose >= 0) {
    const ax = x + 58;
    const ay = y - 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ax, ay, 26, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(ax, ay, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - v.beat));
    ctx.stroke();
    ctx.fillStyle = '#fdf2f8';
    poseArrow(ctx, ax, ay, v.pose, 15);
    // steps of the dance
    for (let i = 0; i < v.steps; i++) {
      ctx.fillStyle = i < v.step ? '#f472b6' : i === v.step ? '#fdf2f8' : 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(x - 16 + i * 16, y + 40, 4, 0, TAU);
      ctx.fill();
    }
  } else {
    // the windup: her anklets ring as she begins
    ctx.fillStyle = '#fdf2f8';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NARTAKI KA NRITYA', x, y + 46);
  }
  ctx.restore();
}

/** Stage 6 shots: a rolling wave of ash along the ground, and burning ash clods for the rain. */
export function drawBhasmShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  const t = nowMs / 1000;
  if (kind === 'wave') {
    const dir = Math.sign(b.vx) || 1;
    for (let i = 0; i < 5; i++) {
      const ph = (t * 3 + i / 5) % 1;
      ctx.fillStyle = `rgba(168,162,158,${0.8 - ph * 0.6})`;
      ctx.beginPath();
      ctx.arc(b.x - dir * i * 9, b.y + 6 - ph * 10, 9 - i, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(249,115,22,0.85)';
    ctx.fillRect(b.x - 8, b.y + 8, 16, 3);
    glow(ctx, b.x, b.y, 22, 'rgba(249,115,22,0.35)');
    return true;
  }
  if (kind === 'bomb') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(t * 5 + b.id);
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(2, -8);
    ctx.lineTo(8, 1);
    ctx.lineTo(1, 7);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(-2, -2, 4, 3);
    ctx.restore();
    ctx.fillStyle = 'rgba(120,113,108,0.4)';
    ctx.beginPath();
    ctx.arc(b.x - b.vx * 0.03, b.y - b.vy * 0.03, 6, 0, TAU);
    ctx.fill();
    glow(ctx, b.x, b.y, 16, 'rgba(249,115,22,0.4)');
    return true;
  }
  return false;
}

/** The rest stop: a small stone shrine on the ash slope (a domed canopy on four pillars, a lamp, bells, a sun disc). */
export function drawShrineRest(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  const t = nowMs / 1000;
  // stone platform
  ctx.fillStyle = '#57534e';
  ctx.fillRect(cx - 70, y - 10, 140, 10);
  ctx.fillStyle = '#78716c';
  ctx.fillRect(cx - 60, y - 16, 120, 6);
  // the canopy on four pillars
  ctx.fillStyle = '#a8a29e';
  for (const px of [-48, -20, 16, 44]) ctx.fillRect(cx + px, y - 70, 5, 54);
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.moveTo(cx - 60, y - 70);
  ctx.quadraticCurveTo(cx, y - 116, cx + 60, y - 70);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.fillRect(cx - 1, y - 122, 2, 14);
  ctx.beginPath();
  ctx.moveTo(cx + 1, y - 122);
  ctx.lineTo(cx + 12, y - 118);
  ctx.lineTo(cx + 1, y - 114);
  ctx.fill();
  // a carved sun disc on a plinth
  ctx.fillStyle = '#44403c';
  ctx.fillRect(cx - 10, y - 30, 20, 14);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, y - 44, 10, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 12, y - 44 + Math.sin(a) * 12);
    ctx.lineTo(cx + Math.cos(a) * 17, y - 44 + Math.sin(a) * 17);
    ctx.stroke();
  }
  glow(ctx, cx, y - 44, 30, 'rgba(251,191,36,0.35)');
  // lamps either side
  for (const lx of [cx - 30, cx + 30]) {
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(lx - 4, y - 22, 8, 6);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(lx - 2, y - 22);
    ctx.quadraticCurveTo(lx, y - 32 - Math.sin(t * 9 + lx) * 2, lx + 2, y - 22);
    ctx.fill();
    glow(ctx, lx, y - 26, 40 + Math.sin(t * 3) * 4, 'rgba(251,191,36,0.4)');
  }
  // bells hanging in the canopy, swaying
  ctx.fillStyle = '#facc15';
  const sw = Math.sin(t * 2) * 2;
  ctx.beginPath();
  ctx.arc(cx - 24 + sw, y - 64, 4, Math.PI, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 24 - sw, y - 64, 4, Math.PI, TAU);
  ctx.fill();
  glow(ctx, cx, y - 60, 110, 'rgba(254,243,199,0.18)');
}
