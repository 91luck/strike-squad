/**
 * Agnivan (saga stage 1) art: the wall of fire chasing the squad, the stage's own rakshasas (fire imps, burning
 * bats, tree demons), its boss the Jwala Vriksh-asur, their fire, and the set pieces (the falling tree, the
 * stream, the river bank where the fire cannot follow).
 *
 * Everything draws in world coordinates on the world canvas (the renderer has applied the camera). Bodies are
 * drawn with paths at full resolution; a hit flash brightens them for a frame.
 */

import { bossReady, drawPart } from './boss3d';

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

/** A flame tongue standing on (x, y), `h` tall, swaying with time. */
function tongue(ctx: Ctx, x: number, y: number, w: number, h: number, sway: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.55, x + sway, y - h);
  ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.55, x + w / 2, y);
  ctx.closePath();
  ctx.fill();
}

function flashOn(ctx: Ctx, flash: boolean): void {
  if (flash) ctx.filter = 'brightness(2.6) saturate(0.4)';
}

// ------------------------------------------------------------------ the chase

/**
 * The wall of fire behind the squad. `front` is its leading edge; it fills everything to the left of it in the
 * camera's view, from the top of the view to the bottom, with a ragged front of tall flames.
 */
export function drawChaseFire(
  ctx: Ctx,
  front: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  nowMs: number,
): void {
  if (front < camX - 60) {
    // just off screen: its tongues lick in at the left edge, more the closer it is
    const near = 1 - Math.min(1, (camX - front) / 420);
    if (near <= 0) return;
    const g = ctx.createLinearGradient(camX, 0, camX + 160, 0);
    g.addColorStop(0, `rgba(255,90,20,${0.55 * near})`);
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(camX, camY, 160, viewH);
    front = camX - 34 + near * 40;
  }
  const t = nowMs / 1000;
  const top = camY - 20;
  const bottom = camY + viewH + 20;
  const x0 = camX - 40;
  ctx.save();
  // the burnt, burning land behind the front
  const g = ctx.createLinearGradient(front - 260, 0, front, 0);
  g.addColorStop(0, 'rgba(60,8,4,0.96)');
  g.addColorStop(0.55, 'rgba(150,28,8,0.9)');
  g.addColorStop(1, 'rgba(255,110,30,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, top, Math.max(0, front - x0), bottom - top);
  // heat shimmer ahead of it
  const h = ctx.createLinearGradient(front, 0, front + 90, 0);
  h.addColorStop(0, 'rgba(255,150,60,0.35)');
  h.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = h;
  ctx.fillRect(front, top, 90, bottom - top);
  // the front: three layers of tongues up the whole height
  const layers: [number, string, number][] = [
    [34, '#7f1d1d', 0],
    [26, '#ea580c', 10],
    [16, '#fde047', 18],
  ];
  for (const [size, color, back] of layers) {
    for (let y = bottom; y > top - size; y -= size * 0.8) {
      const i = Math.round(y / 7);
      const sway = Math.sin(t * 8 + i * 0.9) * size * 0.35;
      const reach = size * (1.2 + 0.4 * Math.sin(t * 11 + i * 1.7));
      ctx.save();
      ctx.translate(front - back + (hash(i) - 0.5) * 8, y);
      ctx.rotate(Math.PI / 2 + 0.25);
      tongue(ctx, 0, 0, size, reach, sway, color);
      ctx.restore();
    }
  }
  // embers blowing forward
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const span = bottom - top;
    const life = (t * (0.6 + hash(i) * 0.6) + hash(i + 3)) % 1;
    const ex = front - 30 + life * 140;
    const ey = top + ((hash(i + 7) * span - life * 120 + span) % span);
    ctx.fillStyle = i % 3 ? '#fdba74' : '#fef08a';
    ctx.globalAlpha = 1 - life;
    ctx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
  }
  ctx.globalAlpha = 1;
  glow(ctx, front, camY + viewH * 0.7, 160, 'rgba(255,120,40,0.35)');
  ctx.restore();
}

// ------------------------------------------------------------------ rakshasas

/** Fire imp: a squat horned imp of living flame; crouches, runs, and leaps with its arms thrown wide. */
export function drawImp(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  air: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.37;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  // shadow
  if (!air) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, -1, 9, 2.5, 0, 0, TAU);
    ctx.fill();
  }
  const bob = air ? 0 : Math.abs(Math.sin(t * 12)) * 2;
  // legs
  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const step = air ? 0 : Math.sin(t * 14) * 3;
  ctx.beginPath();
  ctx.moveTo(-3, -9 - bob);
  ctx.lineTo(-4 + step, -1);
  ctx.moveTo(3, -9 - bob);
  ctx.lineTo(4 - step, -1);
  ctx.stroke();
  // body of flame
  const by = -13 - bob;
  ctx.fillStyle = '#9a3412';
  ctx.beginPath();
  ctx.ellipse(0, by, 8, 7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.ellipse(1, by - 1, 6, 5, 0, 0, TAU);
  ctx.fill();
  // arms: wide when leaping
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (air) {
    ctx.moveTo(-5, by);
    ctx.lineTo(-11, by - 7);
    ctx.moveTo(5, by);
    ctx.lineTo(11, by - 7);
  } else {
    ctx.moveTo(-5, by);
    ctx.lineTo(-8, by + 5);
    ctx.moveTo(5, by);
    ctx.lineTo(9, by + 3 + Math.sin(t * 10) * 2);
  }
  ctx.stroke();
  // head with horns and a flame crest
  const hy = by - 9;
  tongue(ctx, -1, hy - 3, 8, 10 + Math.sin(t * 13) * 2, Math.sin(t * 9) * 2, '#f97316');
  tongue(ctx, 0, hy - 3, 4, 7, Math.sin(t * 11) * 1.5, '#fde047');
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath();
  ctx.arc(1, hy, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c0a05';
  ctx.beginPath();
  ctx.moveTo(-3, hy - 3);
  ctx.lineTo(-6, hy - 9);
  ctx.lineTo(-1, hy - 4);
  ctx.moveTo(4, hy - 3);
  ctx.lineTo(7, hy - 9);
  ctx.lineTo(2, hy - 4);
  ctx.fill();
  // eyes and grin
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(2, hy - 2, 2, 2);
  ctx.fillRect(5, hy - 2, 2, 2);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(2, hy + 2, 5, 1);
  ctx.restore();
  glow(ctx, x, y - 16, air ? 26 : 18, 'rgba(255,120,30,0.45)');
}

/** Burning bat: leathery wings with burning edges; beats slowly while it hangs, folds back as it dives. */
export function drawBat(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  dive: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.61;
  const beat = dive ? 0.25 : Math.sin(t * (dive ? 4 : 9));
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - 8));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  const wing = (side: number): void => {
    const lift = beat * 9;
    ctx.fillStyle = '#3b0a0a';
    ctx.beginPath();
    ctx.moveTo(side * 3, -1);
    ctx.quadraticCurveTo(side * 10, -8 - lift, side * 19, -4 - lift);
    ctx.lineTo(side * 15, 0 - lift * 0.4);
    ctx.lineTo(side * 12, 3 - lift * 0.2);
    ctx.lineTo(side * 8, 1);
    ctx.lineTo(side * 5, 4);
    ctx.closePath();
    ctx.fill();
    // burning trailing edge
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(side * 19, -4 - lift);
    ctx.lineTo(side * 15, 0 - lift * 0.4);
    ctx.lineTo(side * 12, 3 - lift * 0.2);
    ctx.lineTo(side * 8, 1);
    ctx.stroke();
  };
  wing(-1);
  wing(1);
  // body
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.5, 6, 0, 0, TAU);
  ctx.fill();
  // ears and eyes
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.moveTo(-3, -5);
  ctx.lineTo(-2, -10);
  ctx.lineTo(0, -6);
  ctx.lineTo(2, -10);
  ctx.lineTo(3, -5);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.fillRect(-2, -4, 1.5, 1.5);
  ctx.fillRect(1, -4, 1.5, 1.5);
  ctx.restore();
  glow(ctx, x, y - 8, dive ? 24 : 16, 'rgba(255,110,30,0.4)');
  // a trail of sparks while diving
  if (dive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < 5; i++) {
      ctx.fillStyle = `rgba(253,186,116,${0.6 - i * 0.12})`;
      ctx.fillRect(Math.round(x - f * i * 6), Math.round(y - 8 - i * 1.5 + hash(i + id) * 3), 2, 2);
    }
    ctx.restore();
  }
}

/** Tree demon: a hunched man of charred wood, thick bark on its front, embers in its cracks, a burning crown. */
export function drawTreant(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  moving: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.43;
  const step = moving ? Math.sin(t * 5) : 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, -1, 16, 3, 0, 0, TAU);
  ctx.fill();
  // root legs
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -16);
  ctx.lineTo(-8 + step * 4, -1);
  ctx.moveTo(5, -16);
  ctx.lineTo(8 - step * 4, -1);
  ctx.stroke();
  // trunk body: back part plain, front covered in bark plates
  ctx.fillStyle = '#3f2a1d';
  ctx.beginPath();
  ctx.moveTo(-11, -14);
  ctx.lineTo(-13, -38);
  ctx.quadraticCurveTo(-2, -48, 12, -40);
  ctx.lineTo(12, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#57534e';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(4, -16 - i * 7);
    ctx.lineTo(14, -18 - i * 7);
    ctx.lineTo(13, -23 - i * 7);
    ctx.lineTo(4, -22 - i * 7);
    ctx.closePath();
    ctx.fill();
  }
  // embers glowing in the cracks of its soft back
  ctx.strokeStyle = `rgba(251,146,60,${0.7 + 0.3 * Math.sin(t * 6)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-9, -18);
  ctx.lineTo(-5, -26);
  ctx.lineTo(-8, -33);
  ctx.moveTo(-3, -20);
  ctx.lineTo(-1, -30);
  ctx.stroke();
  // arm with a burning log raised to throw
  ctx.strokeStyle = '#3f2a1d';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-6, -36);
  ctx.lineTo(-12, -46 + step);
  ctx.stroke();
  ctx.save();
  ctx.translate(-12, -48 + step);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-9, -3, 18, 6);
  ctx.restore();
  tongue(ctx, -12, -50 + step, 8, 10, Math.sin(t * 9) * 2, '#f97316');
  // face: two glowing knots and a crack of a mouth
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(5, -37, 3, 3);
  ctx.fillRect(10, -36, 2, 3);
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(6, -30, 6, 1.5);
  // burning crown of twigs
  tongue(ctx, -2, -44, 16, 12 + Math.sin(t * 7) * 3, Math.sin(t * 5) * 3, '#c2410c');
  tongue(ctx, 0, -44, 9, 9 + Math.sin(t * 9) * 2, Math.sin(t * 7) * 2, '#fde047');
  ctx.restore();
  glow(ctx, x, y - 44, 20, 'rgba(255,120,30,0.35)');
}

// ------------------------------------------------------------------ the boss

export interface VrikshaPose {
  /** Attack id, ticks since it began and its wind-up in ticks (renderer reads ATTACK_WINDUP). */
  at: number;
  tt: number;
  wind: number;
  phase: number;
  dead: boolean;
  flash: boolean;
  /** Attack ids the art cares about. */
  roots: number;
  fruit: number;
  breath: number;
}

/**
 * Jwala Vriksh-asur: a burning banyan with a face in its trunk. (x, y) is the middle of its foot on the floor;
 * it faces left, towards the squad. Its boughs reach out over the grove; its crown burns. Telegraphs: glowing
 * cracks racing out of its roots (roots), the crown swelling with fruit (fruit), the hollow mouth filling with
 * fire (breath). In phase 2 the bark over its heart splits and the heart beats inside.
 */
export function drawVriksha(ctx: Ctx, x: number, y: number, nowMs: number, p: VrikshaPose): void {
  const t = nowMs / 1000;
  const k = p.wind > 0 ? Math.min(1, p.tt / p.wind) : 1;
  const sway = p.dead ? 0 : Math.sin(t * 0.8) * 2;
  ctx.save();
  if (p.flash) ctx.filter = 'brightness(1.7)';
  const bark = p.dead ? '#3f3f46' : '#3b2416';
  const barkLit = p.dead ? '#52525b' : '#5b3a24';
  // aerial roots hanging from the boughs
  ctx.strokeStyle = p.dead ? '#3f3f46' : '#4a2e1c';
  ctx.lineWidth = 3;
  // (the painted warrior has no boughs: the roots, the burning crown and the fruit are the tree's)
  for (let i = 0; i < (bossReady('vriksha') && !p.dead ? 0 : 9); i++) {
    const rx = x - 40 - i * 38;
    const ry = y - 230 + (i % 3) * 18;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.quadraticCurveTo(rx + Math.sin(t + i) * 4, ry + 50, rx + 2, ry + 70 + (i % 2) * 30);
    ctx.stroke();
  }
  // rendered in 3D once loaded (boss3d.ts): trunk, boughs, roots, face and the leafy crown; its fire, glowing
  // eyes, mouth, heart and fruit stay drawn over it
  const r3 = bossReady('vriksha') && !p.dead;
  if (r3) drawPart(ctx, 'vriksha', 'body', x, y);
  else {
    // boughs reaching left over the grove
    ctx.strokeStyle = bark;
    ctx.lineCap = 'round';
    const bough = (y0: number, len: number, w: number): void => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x - 40, y0);
      ctx.quadraticCurveTo(x - len * 0.5, y0 - 30 + sway, x - len, y0 - 10 + sway);
      ctx.stroke();
    };
    bough(y - 230, 360, 16);
    bough(y - 180, 240, 13);
    bough(y - 290, 280, 12);
    // the trunk
    ctx.fillStyle = bark;
    ctx.beginPath();
    ctx.moveTo(x - 70, y);
    ctx.quadraticCurveTo(x - 58, y - 120, x - 52, y - 250);
    ctx.lineTo(x + 52, y - 250);
    ctx.quadraticCurveTo(x + 60, y - 120, x + 75, y);
    ctx.closePath();
    ctx.fill();
    // bark ridges
    ctx.strokeStyle = barkLit;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const bx = x - 45 + i * 18;
      ctx.beginPath();
      ctx.moveTo(bx, y - 10);
      ctx.quadraticCurveTo(bx + 6 * Math.sin(i), y - 130, bx - 2, y - 245);
      ctx.stroke();
    }
  }
  // roots spreading over the floor (they light up as a root wave is called)
  const rootGlow = p.at === p.roots ? k : 0;
  for (let i = 0; i < 5; i++) {
    const side = i < 3 ? -1 : 1;
    const len = 50 + i * 18;
    ctx.strokeStyle = bark;
    ctx.lineWidth = 10 - i;
    ctx.beginPath();
    ctx.moveTo(x + side * 30, y - 20);
    ctx.quadraticCurveTo(x + side * (40 + len * 0.5), y - 8, x + side * (40 + len), y);
    if (!r3) ctx.stroke();
    if (rootGlow > 0) {
      ctx.strokeStyle = `rgba(253,186,116,${rootGlow})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  if (rootGlow > 0) glow(ctx, x - 80, y - 4, 60 * rootGlow, 'rgba(255,140,40,0.6)');
  // the face: eyes and a hollow mouth on the side facing the squad
  const fx = x - 30;
  const eyeY = y - 160;
  if (!r3) {
    ctx.fillStyle = '#1c0f08';
    ctx.beginPath();
    ctx.ellipse(fx - 12, eyeY, 11, 7, -0.2, 0, TAU);
    ctx.ellipse(fx + 22, eyeY - 2, 10, 7, 0.2, 0, TAU);
    ctx.fill();
  }
  if (!p.dead) {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(fx - 12, eyeY, 4, 0, TAU);
    ctx.arc(fx + 22, eyeY - 2, 4, 0, TAU);
    ctx.fill();
    glow(ctx, fx - 12, eyeY, 14, 'rgba(251,191,36,0.7)');
    glow(ctx, fx + 22, eyeY - 2, 14, 'rgba(251,191,36,0.7)');
  }
  const mouthOpen = p.at === p.breath ? 10 + 14 * k : 8;
  ctx.fillStyle = '#120804';
  ctx.beginPath();
  ctx.ellipse(fx - 6, y - 120, 22, mouthOpen, 0, 0, TAU);
  ctx.fill();
  if (!p.dead) {
    const fire = p.at === p.breath ? k : 0.25;
    ctx.fillStyle = `rgba(234,88,12,${0.5 + fire * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(fx - 6, y - 118, 16 * (0.5 + fire * 0.5), mouthOpen * 0.6, 0, 0, TAU);
    ctx.fill();
    glow(ctx, fx - 10, y - 120, 30 + 40 * fire, 'rgba(255,120,30,0.55)');
  }
  // the heart, high in the trunk: hidden in phase 1, glowing through split bark in phase 2
  const hx = x - 40;
  const hy = y - 205;
  if (p.phase >= 2 && !p.dead) {
    const beat = 1 + 0.15 * Math.sin(t * 7);
    ctx.fillStyle = '#120804';
    ctx.beginPath();
    ctx.moveTo(hx, hy - 26);
    ctx.lineTo(hx + 12, hy - 4);
    ctx.lineTo(hx + 6, hy + 22);
    ctx.lineTo(hx - 8, hy + 18);
    ctx.lineTo(hx - 12, hy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 7 * beat, 10 * beat, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 3 * beat, 5 * beat, 0, 0, TAU);
    ctx.fill();
    glow(ctx, hx, hy, 40 * beat, 'rgba(255,140,40,0.7)');
  } else if (!p.dead) {
    ctx.strokeStyle = 'rgba(251,146,60,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 14);
    ctx.lineTo(hx + 4, hy);
    ctx.lineTo(hx - 2, hy + 12);
    ctx.stroke();
  }
  // the crown: burning leaves; swells and shows fruit while it readies a volley
  const swell = p.at === p.fruit ? k : 0;
  const crown = (cx: number, cy: number, r: number, i: number): void => {
    if (!r3) {
      ctx.fillStyle = p.dead ? '#27272a' : i % 2 ? '#14532d' : '#166534';
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + swell * 0.08), 0, TAU);
      ctx.fill();
    }
    if (p.dead) return;
    // burning leaf edges
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * TAU + i;
      const fx2 = cx + Math.cos(a) * r * 0.85;
      const fy2 = cy + Math.sin(a) * r * 0.85;
      tongue(
        ctx,
        fx2,
        fy2,
        10,
        12 + 6 * Math.sin(t * 8 + j + i),
        Math.sin(t * 6 + j) * 3,
        j % 2 ? '#ea580c' : '#f59e0b',
      );
    }
  };
  const blobs: [number, number, number][] = [
    [-150, -260, 46],
    [-80, -300, 58],
    [10, -310, 62],
    [90, -280, 48],
    [-30, -250, 50],
    [-220, -235, 36],
  ];
  if (r3) drawPart(ctx, 'vriksha', 'crown', x, y + sway);
  if (!r3) blobs.forEach(([dx, dy, r], i) => crown(x + dx, y + dy + sway, r, i));
  if (swell > 0 && !p.dead && !r3) {
    for (let i = 0; i < 7; i++) {
      const fx3 = x - 180 + i * 40;
      const fy3 = y - 250 + (i % 2) * 30;
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(fx3, fy3, 5 + swell * 3, 0, TAU);
      ctx.fill();
      glow(ctx, fx3, fy3, 14 * swell, 'rgba(255,90,40,0.7)');
    }
  }
  if (!p.dead) glow(ctx, x - 40, y - (r3 ? 200 : 290), 150, 'rgba(255,110,30,0.25)');
  else {
    // burnt out: smoke curling off it
    ctx.fillStyle = 'rgba(120,113,108,0.35)';
    for (let i = 0; i < 6; i++) {
      const life = (t * 0.3 + i / 6) % 1;
      ctx.beginPath();
      ctx.arc(x - 60 + i * 25, y - 300 - life * 120, 12 + life * 20, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ fire

/**
 * Agnivan's enemy fire in place of the classic shots: embers and fireballs (`shot`), burning logs (`grenade`),
 * burning fruit (`bomb`) and roots tearing along the ground (`wave`). Returns false for kinds it does not draw.
 */
export function drawAgniShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  const t = nowMs / 1000;
  if (kind === 'shot') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(-16, 0, 5, 0);
    g.addColorStop(0, 'rgba(234,88,12,0)');
    g.addColorStop(0.6, 'rgba(249,115,22,0.85)');
    g.addColorStop(1, 'rgba(254,240,138,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.quadraticCurveTo(-4, -5, 5, 0);
    ctx.quadraticCurveTo(-4, 5, -16, 0);
    ctx.fill();
    ctx.restore();
    glow(ctx, b.x, b.y, 10, 'rgba(255,140,40,0.6)');
    return true;
  }
  if (kind === 'grenade') {
    // a burning log tumbling end over end
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(t * 9 + b.id);
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(-10, -4, 20, 8);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-9, -3, 18, 6);
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.arc(9, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
    tongue(ctx, b.x, b.y - 2, 10, 12 + Math.sin(t * 13) * 3, -b.vx * 0.02, 'rgba(249,115,22,0.9)');
    glow(ctx, b.x, b.y, 16, 'rgba(255,120,30,0.5)');
    return true;
  }
  if (kind === 'bomb') {
    // burning fruit of the banyan
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(b.x - 1.5, b.y - 1.5, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#14532d';
    ctx.fillRect(b.x - 1, b.y - 10, 2, 4);
    tongue(ctx, b.x, b.y - 4, 9, 11 + Math.sin(t * 15 + b.id) * 3, 0, 'rgba(249,115,22,0.85)');
    glow(ctx, b.x, b.y, 18, 'rgba(255,90,30,0.55)');
    return true;
  }
  if (kind === 'wave') {
    // roots tearing up through the ground as they race along it
    const dir = Math.sign(b.vx) || -1;
    for (let i = 0; i < 6; i++) {
      const rx = b.x - dir * i * 9;
      const h = (26 - i * 3.5) * (0.85 + 0.15 * Math.sin(t * 20 + i));
      ctx.fillStyle = i === 0 ? '#5b3a24' : '#3b2416';
      ctx.beginPath();
      ctx.moveTo(rx - 5, b.y + 12);
      ctx.lineTo(rx + dir * 2, b.y + 12 - h);
      ctx.lineTo(rx + 5, b.y + 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(120,80,50,0.8)';
    for (let i = 0; i < 4; i++)
      ctx.fillRect(b.x + (hash(b.id + i + Math.floor(t * 12)) - 0.5) * 20, b.y + 6 - hash(i) * 10, 3, 3);
    glow(ctx, b.x, b.y + 8, 22, 'rgba(255,120,40,0.4)');
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ set pieces

/**
 * The burning tree across the ravine. It stands upright on the near bank until the squad comes close (`fall`
 * runs 0 → 1 as it comes down), then lies across as the log you run on. (x0, x1) is the log's span, `y` its top.
 */
export function drawFallingTree(
  ctx: Ctx,
  x0: number,
  x1: number,
  y: number,
  fall: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const len = x1 - x0;
  const e = fall < 1 ? 1 - Math.pow(1 - fall, 3) : 1;
  const ang = -Math.PI / 2 + (Math.PI / 2) * e;
  ctx.save();
  ctx.translate(x0, y + 6);
  ctx.rotate(ang);
  // trunk
  ctx.fillStyle = '#3b2416';
  ctx.fillRect(0, -10, len, 20);
  ctx.fillStyle = '#5b3a24';
  ctx.fillRect(0, -10, len, 5);
  ctx.strokeStyle = '#2a190f';
  ctx.lineWidth = 2;
  for (let i = 18; i < len; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, -9);
    ctx.lineTo(i + 8, 9);
    ctx.stroke();
  }
  // burning crown at the far end and flames along the trunk
  ctx.fillStyle = '#14532d';
  ctx.beginPath();
  ctx.arc(len + 10, 0, 34, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 7; i++) {
    const fx = len - 10 + Math.cos(i) * 26;
    tongue(
      ctx,
      fx,
      Math.sin(i) * 22,
      12,
      16 + Math.sin(t * 9 + i) * 4,
      Math.sin(t * 7 + i) * 3,
      i % 2 ? '#ea580c' : '#f59e0b',
    );
  }
  for (let i = 40; i < len - 40; i += 70)
    tongue(ctx, i, -10, 10, 14 + Math.sin(t * 10 + i) * 4, Math.sin(t * 8 + i) * 3, 'rgba(249,115,22,0.85)');
  ctx.restore();
  // the cut stump on the near bank
  ctx.fillStyle = '#5b3a24';
  ctx.fillRect(x0 - 12, y - 4, 24, 14);
  ctx.fillStyle = '#d6a77a';
  ctx.beginPath();
  ctx.ellipse(x0, y - 4, 12, 4, 0, 0, TAU);
  ctx.fill();
  // the crash: dust and sparks as it lands
  if (fall > 0.85 && fall < 1.4) {
    const k = (fall - 0.85) / 0.55;
    ctx.fillStyle = `rgba(160,120,90,${0.5 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(x1, y + 4, 20 + k * 50, 0, TAU);
    ctx.fill();
    glow(ctx, x1, y, 80 * (1 - k), 'rgba(255,140,40,0.6)');
  }
}

/**
 * A great discus: it flies in from the sky and cuts the burning tree so it falls as a bridge (`k` 0 → 1 over
 * its flight; the renderer runs it just before the tree falls).
 */
export function drawChakraCut(ctx: Ctx, x: number, y: number, k: number, nowMs: number): void {
  if (k <= 0 || k >= 1) return;
  const sx = x + 420;
  const sy = y - 360;
  const px = sx + (x - sx) * k;
  const py = sy + (y - sy) * k;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(nowMs / 30);
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fef9c3';
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(10, -3);
    ctx.lineTo(18, 0);
    ctx.lineTo(10, 3);
    ctx.fill();
  }
  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
  glow(ctx, px, py, 40, 'rgba(250,204,21,0.6)');
  // its trail
  ctx.save();
  ctx.strokeStyle = 'rgba(253,224,71,0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx + (x - sx) * Math.max(0, k - 0.25), sy + (y - sy) * Math.max(0, k - 0.25));
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.restore();
}

/** Running water between `x0` and `x1`, its surface at `top`, its bed at `bottom`. */
export function drawStream(
  ctx: Ctx,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, 'rgba(56,189,248,0.55)');
  g.addColorStop(1, 'rgba(12,74,110,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, top, x1 - x0, bottom - top);
  // surface ripples flowing along, and fire reflected in it
  ctx.strokeStyle = 'rgba(224,242,254,0.7)';
  ctx.lineWidth = 1.5;
  for (let x = x0 + ((t * 40) % 24); x < x1 - 8; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, top + 2);
    ctx.lineTo(x + 8, top + 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(251,146,60,0.25)';
  for (let x = x0 + 10; x < x1 - 10; x += 46)
    ctx.fillRect(x + Math.sin(t * 2 + x) * 4, top + 6 + (x % 3) * 3, 14, 2);
}

/**
 * The river bank rest stop: a stream across the dip, stones to step on, a banana grove and a little shrine to
 * Agni where the fire cannot follow. (x0, x1) is the stop, `y` the ground line.
 */
export function drawRiverRest(ctx: Ctx, x0: number, x1: number, y: number, T: number, nowMs: number): void {
  const n = Math.round((x1 - x0) / T) + 1;
  const a = x0 + Math.floor(n * 0.35) * T;
  const z = x0 + (Math.floor(n * 0.65) + 1) * T;
  drawStream(ctx, a, z, y + 6, y + T, nowMs);
  // stepping stones
  ctx.fillStyle = '#78716c';
  for (let sx = a + 20; sx < z - 10; sx += 46) {
    ctx.beginPath();
    ctx.ellipse(sx, y + 10, 12, 5, 0, 0, TAU);
    ctx.fill();
  }
  // banana leaves on the banks
  const leaf = (lx: number, h: number, flip: number): void => {
    ctx.strokeStyle = '#3f6212';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y - h);
    ctx.stroke();
    ctx.fillStyle = '#4d7c0f';
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(lx, y - h + i * 6);
      ctx.rotate(flip * (0.6 + i * 0.4) + Math.sin(nowMs / 900 + i) * 0.05);
      ctx.beginPath();
      ctx.ellipse(16, 0, 18, 5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  };
  leaf(x0 + 3 * T, 58, -1);
  leaf(x0 + 5 * T, 46, 1);
  leaf(x1 - 3 * T, 54, 1);
  // Agni's shrine: a stone plinth and a lamp burning calmly
  const sx = x1 - 6 * T;
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(sx - 14, y - 22, 28, 22);
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(sx - 17, y - 26, 34, 5);
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.ellipse(sx, y - 28, 8, 3, 0, 0, TAU);
  ctx.fill();
  tongue(ctx, sx, y - 29, 6, 11 + Math.sin(nowMs / 160) * 1.5, Math.sin(nowMs / 300), '#fbbf24');
  glow(ctx, sx, y - 34, 34, 'rgba(253,224,71,0.45)');
}

/**
 * The fire that leaps ahead of the squad: a thicket of burning trees across the path (in place of a classic wall
 * of fire), its foot on the path at (x, y). Only the stream bed under it gets through.
 */
export function drawBurningThicket(ctx: Ctx, x: number, y: number, nowMs: number): void {
  const t = nowMs / 1000;
  glow(ctx, x, y - 70, 120, 'rgba(255,110,30,0.45)');
  const tree = (tx: number, h: number, lean: number, i: number): void => {
    ctx.strokeStyle = '#1c0f08';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.quadraticCurveTo(tx + lean * 0.5, y - h * 0.5, tx + lean, y - h);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tx + lean * 0.6, y - h * 0.6);
    ctx.lineTo(tx + lean * 0.6 - 18, y - h * 0.78);
    ctx.moveTo(tx + lean * 0.8, y - h * 0.8);
    ctx.lineTo(tx + lean * 0.8 + 16, y - h * 0.95);
    ctx.stroke();
    // flames climbing it
    for (let k = 0; k < 6; k++) {
      const fy = y - (k / 6) * h;
      const fx = tx + lean * (k / 6);
      const s = 1 + 0.2 * Math.sin(t * 11 + i * 3 + k);
      tongue(ctx, fx, fy, 22 * s, 30 * s, Math.sin(t * 7 + k + i) * 4, '#9a3412');
      tongue(ctx, fx, fy - 2, 14 * s, 22 * s, Math.sin(t * 9 + k + i) * 3, '#f97316');
      tongue(ctx, fx, fy - 3, 7 * s, 13 * s, Math.sin(t * 12 + k + i) * 2, '#fde047');
    }
  };
  tree(x - 26, 150, -12, 0);
  tree(x + 24, 175, 14, 1);
  tree(x, 205, 3, 2);
  // a wall of flame along the ground between them
  for (let k = -3; k <= 3; k++) {
    const s = 1 + 0.25 * Math.sin(t * 12 + k * 2);
    tongue(ctx, x + k * 14, y + 2, 20, 46 * s, Math.sin(t * 8 + k) * 5, '#c2410c');
    tongue(ctx, x + k * 14, y + 2, 11, 30 * s, Math.sin(t * 10 + k) * 4, '#fbbf24');
  }
  // smoke rising off it
  ctx.fillStyle = 'rgba(68,64,60,0.35)';
  for (let i = 0; i < 6; i++) {
    const life = (t * 0.35 + i / 6) % 1;
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 2 + t) * 20, y - 210 - life * 140, 14 + life * 26, 0, TAU);
    ctx.fill();
  }
}
