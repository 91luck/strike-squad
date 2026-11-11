import { GAME_CONFIG } from '@strikesquad/shared';

/**
 * The astras as they look in the world (not the sky apparitions: those are in astra-cine.ts):
 *   - the vayu whirlwind (bhavandar), plain or alight,
 *   - the agni fire: the run of fire pillars behind the flame wall, the burning ground, a trooper set alight,
 *   - the bow (dhanush) every astra is loosed from, drawn in the hero's hands and slung on the back between shots.
 * Everything is drawn in world pixels; the renderer puts it on its pixel layer so it sits with the pixel art.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** A cheap repeatable 0..1 value for a whole number. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ------------------------------------------------------------------ vayu: the whirlwind

const WIND = {
  body: ['rgba(214,222,206,', 'rgba(170,184,170,'],
  band: ['rgba(255,255,255,', 'rgba(203,213,196,'],
  dark: 'rgba(71,85,80,',
  bits: ['#6b8f3a', '#8a6a45', '#a3a08f', '#4f7a2e', '#c2b280'],
};
const FIREWIND = {
  body: ['rgba(255,170,60,', 'rgba(220,70,10,'],
  band: ['rgba(255,244,190,', 'rgba(255,150,40,'],
  dark: 'rgba(120,30,0,',
  bits: ['#ffd166', '#ff8c42', '#fff3c4', '#ff4d1a', '#3b1d0a'],
};

/**
 * The whirlwind: a leaning funnel of turning bands, narrow at the foot and wide at the top, with a skirt of dust
 * and whatever it has torn up riding round it. `left` is the seconds it has left (it grows in and thins out).
 */
export function drawTwister(
  ctx: Ctx,
  x: number,
  y: number,
  reach: number,
  left: number,
  nowMs: number,
  fire: boolean,
  simple: boolean,
): void {
  const V = GAME_CONFIG.powers.vayu;
  const age = V.sec - left;
  const grow = Math.max(0.05, Math.min(1, age / 0.35)) * Math.max(0.15, Math.min(1, left / 0.35));
  const H = (V.tall + 30) * (0.35 + 0.65 * grow);
  const pal = fire ? FIREWIND : WIND;
  const N = simple ? 12 : 22;
  const cx = (h: number): number => x + Math.sin(nowMs / 260 + h * 3.2) * (4 + 26 * h) * grow;
  const rad = (h: number): number => (9 + (reach * 1.05 - 9) * Math.pow(h, 1.45)) * grow;

  ctx.save();
  // the body: a soft dusty shape, so the funnel reads as one mass
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const h = i / N;
    const px = cx(h) - rad(h);
    if (i === 0) ctx.moveTo(px, y);
    else ctx.lineTo(px, y - h * H);
  }
  for (let i = N; i >= 0; i--) {
    const h = i / N;
    ctx.lineTo(cx(h) + rad(h), y - h * H);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y - H, 0, y);
  g.addColorStop(0, `${pal.body[0]}0)`);
  g.addColorStop(0.18, `${pal.body[0]}0.22)`);
  g.addColorStop(0.55, `${pal.body[0]}0.42)`);
  g.addColorStop(1, `${pal.body[1]}0.7)`);
  ctx.fillStyle = g;
  ctx.fill();

  // the far side of every turn, then what rides behind, then the near side
  const spin = nowMs / 70;
  ctx.lineCap = 'round';
  for (let i = 0; i <= N; i++) {
    const h = i / N;
    ctx.strokeStyle = `${pal.dark}${0.4 * (1 - h * 0.5) * Math.min(1, (1 - h) * 5)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx(h), y - h * H, rad(h), Math.max(1.5, rad(h) * 0.2), 0, Math.PI, TAU);
    ctx.stroke();
  }
  const bits = simple ? 8 : 18;
  const drawBits = (front: boolean): void => {
    for (let j = 0; j < bits; j++) {
      const h = (nowMs / (1300 + hash(j) * 900) + hash(j + 40)) % 1;
      const a = spin * (0.55 + hash(j + 9) * 0.4) + j * 1.7;
      if (Math.sin(a) > 0 !== front) continue;
      const px = cx(h) + Math.cos(a) * rad(h) * 1.08;
      const py = y - h * H + Math.sin(a) * rad(h) * 0.2;
      const s = 2 + Math.floor(hash(j + 3) * 3);
      ctx.globalAlpha = front ? 1 : 0.5;
      ctx.fillStyle = pal.bits[j % pal.bits.length] as string;
      ctx.fillRect(Math.round(px), Math.round(py), s, j % 3 ? s : 1);
    }
    ctx.globalAlpha = 1;
  };
  drawBits(false);
  for (let i = 0; i <= N; i++) {
    const h = i / N;
    const r = rad(h);
    const a = spin * (1.25 - h * 0.6) + i * 0.9;
    ctx.strokeStyle = `${pal.band[i % 2]}${(0.95 - h * 0.3) * Math.min(1, (1 - h) * 5)})`;
    ctx.lineWidth = Math.max(2, 5 - h * 2.5);
    // two streaks of each turn show on the near side
    for (const off of [0, Math.PI]) {
      const a0 = (a + off) % TAU;
      const s = Math.max(0, Math.min(Math.PI, a0));
      const e = Math.max(0, Math.min(Math.PI, a0 + 1.5));
      if (e - s < 0.05) continue;
      ctx.beginPath();
      ctx.ellipse(cx(h), y - h * H, r, Math.max(1.5, r * 0.2), 0, s, e);
      ctx.stroke();
    }
  }
  drawBits(true);

  // the skirt of dust at its foot
  for (let k = 0; k < 3; k++) {
    const t = (nowMs / 600 + k / 3) % 1;
    ctx.strokeStyle = `${pal.band[1]}${0.6 * (1 - t) * grow})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 12 + t * reach * 0.9, 3 + t * 7, 0, 0, TAU);
    ctx.stroke();
  }
  for (let k = 0; k < 6; k++) {
    const t = (nowMs / 500 + hash(k) * 3) % 1;
    const side = k % 2 ? 1 : -1;
    ctx.fillStyle = `${pal.body[1]}${0.5 * (1 - t)})`;
    ctx.beginPath();
    ctx.ellipse(x + side * (10 + t * 46), y - 4 - t * 12, 7 + t * 6, 4 + t * 3, 0, 0, TAU);
    ctx.fill();
  }

  if (fire) {
    ctx.globalCompositeOperation = 'lighter';
    const c = ctx.createLinearGradient(0, y - H, 0, y);
    c.addColorStop(0, 'rgba(255,120,20,0)');
    c.addColorStop(0.6, 'rgba(255,170,60,0.45)');
    c.addColorStop(1, 'rgba(255,240,180,0.8)');
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const h = i / N;
      const px = cx(h) - rad(h) * 0.45;
      if (i === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y - h * H);
    }
    for (let i = N; i >= 0; i--) {
      const h = i / N;
      ctx.lineTo(cx(h) + rad(h) * 0.45, y - h * H);
    }
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ agni: fire

/** One tongue of flame standing on (x, y): three nested shapes, red outside to white-yellow at the heart. */
function tongue(ctx: Ctx, x: number, y: number, w: number, h: number, lean: number): void {
  const layers: [number, string][] = [
    [1, 'rgba(214,40,10,0.85)'],
    [0.68, 'rgba(255,140,30,0.9)'],
    [0.38, 'rgba(255,236,160,0.95)'],
  ];
  for (const [k, col] of layers) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - (w / 2) * k, y);
    ctx.quadraticCurveTo(x - (w / 2) * k, y - h * k * 0.5, x + lean * k, y - h * k);
    ctx.quadraticCurveTo(x + (w / 2) * k, y - h * k * 0.45, x + (w / 2) * k, y);
    ctx.fill();
  }
}

/** Burning ground: scorched earth, two rows of flame, and embers going up. `left`: seconds it still burns. */
export function drawBurnGround(ctx: Ctx, x: number, y: number, w: number, left: number, nowMs: number): void {
  const fade = Math.min(1, left / 0.7);
  ctx.save();
  ctx.fillStyle = `rgba(20,10,6,${0.55 * fade})`;
  ctx.fillRect(x, y - 2, w, 4);
  ctx.globalAlpha = fade;
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createLinearGradient(0, y - 46, 0, y);
  glow.addColorStop(0, 'rgba(255,80,0,0)');
  glow.addColorStop(1, 'rgba(255,110,20,0.45)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 8, y - 46, w + 16, 46);
  ctx.globalCompositeOperation = 'source-over';
  // back row: tall and red
  for (let i = 0, px = x + 8; px < x + w; px += 17, i++) {
    const h = 30 + Math.sin(nowMs / 90 + i * 1.9) * 9 + Math.sin(nowMs / 47 + i) * 4;
    tongue(ctx, px, y, 18, h * fade, Math.sin(nowMs / 130 + i) * 5);
  }
  // front row: short and bright
  for (let i = 0, px = x + 2; px < x + w; px += 11, i++) {
    const h = 13 + Math.sin(nowMs / 60 + i * 2.7) * 5;
    tongue(ctx, px, y, 11, h * fade, Math.sin(nowMs / 80 + i * 3) * 3);
  }
  // embers
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < Math.floor(w / 22); i++) {
    const t = (nowMs / (700 + hash(i) * 600) + hash(i + 7)) % 1;
    const px = x + hash(i + 13) * w + Math.sin(nowMs / 200 + i) * 6;
    ctx.fillStyle = t < 0.5 ? '#ffe9a8' : '#ff8c42';
    ctx.globalAlpha = fade * (1 - t);
    ctx.fillRect(Math.round(px), Math.round(y - 14 - t * 70), 2, 2);
  }
  ctx.restore();
}

/** A run of fire: pillars bursting out of the ground one after another behind the flame wall. */
export interface FireRun {
  x: number;
  y: number;
  f: 1 | -1;
  born: number;
}

export const FIRE_RUN_MS = 1500;

export function drawFireRun(ctx: Ctx, r: FireRun, nowMs: number): void {
  const A = GAME_CONFIG.powers.agni;
  const age = (nowMs - r.born) / 1000;
  const step = 28;
  ctx.save();
  for (let i = 0; i * step < A.burnLength; i++) {
    const a = age - (i * step) / A.waveSpeed;
    if (a < 0 || a > 0.8) continue;
    const up = Math.sin(Math.min(1, a / 0.16) * (Math.PI / 2));
    const down = Math.max(0, 1 - Math.max(0, a - 0.16) / 0.64);
    const h = (88 + hash(i) * 44) * up * down;
    const px = r.x + r.f * (30 + i * step);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(px, r.y - h * 0.4, 2, px, r.y - h * 0.4, 30 + h * 0.5);
    g.addColorStop(0, `rgba(255,150,40,${0.5 * down})`);
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 80, r.y - h - 60, 160, h + 70);
    ctx.globalCompositeOperation = 'source-over';
    tongue(ctx, px, r.y, 24, h, r.f * (8 + Math.sin(nowMs / 60 + i) * 6));
    // a ring of dust thrown out as it breaks the ground
    if (a < 0.3) {
      ctx.strokeStyle = `rgba(255,214,150,${0.8 * (1 - a / 0.3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, r.y - 1, 8 + a * 80, 2 + a * 12, 0, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A trooper set alight: flames licking up its body. (x, y) is its feet, h its height. */
export function drawAlight(ctx: Ctx, x: number, y: number, h: number, nowMs: number, seed: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - h * 0.5, 2, x, y - h * 0.5, h * 0.9);
  g.addColorStop(0, 'rgba(255,150,40,0.45)');
  g.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - h, y - h * 1.5, h * 2, h * 2);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 4; i++) {
    const px = x + (i - 1.5) * 6 + Math.sin(nowMs / 90 + seed + i) * 2;
    const base = y - h * (0.15 + 0.2 * (i % 2));
    const fh = h * (0.5 + 0.25 * Math.sin(nowMs / 70 + seed * 3 + i * 2.1));
    tongue(ctx, px, base, 9, fh, Math.sin(nowMs / 110 + i + seed) * 4);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ the bow (dhanush)

/** How long the bow stays in the hero's hands after an astra is loosed. */
export const BOW_MS = 800;
/** The share of that time spent drawing the string, before the arrow goes. */
const DRAW_PART = 0.25;

function bowShape(ctx: Ctx, pull: number, glow: string, arrow: number): void {
  // limbs: a recurve, belly forward (+x), tips curling back out
  const limb = (w: number, col: string): void => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(-3, -23);
    ctx.quadraticCurveTo(-7, -19, -1, -15);
    ctx.quadraticCurveTo(9 - pull * 0.25, -8, 4, 0);
    ctx.quadraticCurveTo(9 - pull * 0.25, 8, -1, 15);
    ctx.quadraticCurveTo(-7, 19, -3, 23);
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  limb(5, '#1c1410');
  limb(3, '#b7791f');
  limb(1, '#f6d58a');
  // grip, bound in the astra's colour
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(2, -5, 5, 10);
  ctx.fillStyle = glow;
  ctx.fillRect(3, -4, 3, 8);
  // string
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3, -23);
  ctx.lineTo(-3 - pull, 0);
  ctx.lineTo(-3, 23);
  ctx.stroke();
  if (arrow > 0) {
    // the arrow on the string: a shaft and a head that burns in the astra's colour
    const nock = -3 - pull;
    ctx.strokeStyle = '#1c1410';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nock, 0);
    ctx.lineTo(nock + 30, 0);
    ctx.stroke();
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nock, 0);
    ctx.lineTo(nock + 30, 0);
    ctx.stroke();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(nock + 36, 0);
    ctx.lineTo(nock + 27, -4);
    ctx.lineTo(nock + 27, 4);
    ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(nock + 32, 0, 0, nock + 32, 0, 6 + arrow * 14);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(nock + 8, -24, 48, 48);
    ctx.restore();
  }
}

/**
 * The bow in the hero's hands as an astra is loosed: the string comes back with the arrow alight, the arrow goes
 * as a streak of the astra's colour, and the string hums out. `k` runs 0..1 over BOW_MS. (x, y) is the hero's
 * feet; `up` tilts the bow to the sky for the astras that are shot into the clouds.
 */
export function drawBow(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  k: number,
  glow: string,
  up: boolean,
): void {
  ctx.save();
  ctx.translate(Math.round(x + f * 13), Math.round(y - 25));
  ctx.scale(f, 1);
  ctx.rotate(up ? -0.95 : -0.06);
  if (k < DRAW_PART) {
    const d = k / DRAW_PART;
    bowShape(ctx, 4 + 11 * d * (2 - d), glow, d);
  } else {
    const r = (k - DRAW_PART) / (1 - DRAW_PART);
    // the string hums: a quick, dying swing either side of rest
    bowShape(ctx, Math.sin(r * 40) * 3 * Math.max(0, 1 - r * 3), glow, 0);
    if (r < 0.5) {
      const a = 1 - r / 0.5;
      const head = 30 + r * 1500;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(head - 190, 0, head, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.8, glow);
      g.addColorStop(1, '#ffffff');
      ctx.globalAlpha = a;
      ctx.strokeStyle = g;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(Math.max(10, head - 190), 0);
      ctx.lineTo(head, 0);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(Math.max(10, head - 60), 0);
      ctx.lineTo(head, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The bow slung across the back of a hero who is carrying an astra. */
export function drawSlungBow(ctx: Ctx, x: number, y: number, f: number, glow: string): void {
  ctx.save();
  ctx.translate(Math.round(x - f * 6), Math.round(y - 26));
  ctx.scale(f * 0.8, 0.8);
  ctx.rotate(-0.5);
  bowShape(ctx, 0, glow, 0);
  ctx.restore();
}

// ------------------------------------------------------------------ the rest stop (ashram)

/**
 * A rest stop: a stone hearth with the sacred fire (dhuni) at (x, y) on the ground, a trident standing behind
 * it, saffron flags on poles at both ends (`half` px either side), and sparks of healing going up.
 */
export function drawAshram(ctx: Ctx, x: number, y: number, half: number, nowMs: number): void {
  ctx.save();
  // flags on poles mark where the peace begins and ends
  for (const side of [-1, 1]) {
    const px = Math.round(x + side * (half - 14));
    ctx.fillStyle = '#1c1410';
    ctx.fillRect(px - 2, y - 74, 4, 74);
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(px - 1, y - 73, 2, 72);
    ctx.fillStyle = '#f6d58a';
    ctx.fillRect(px - 3, y - 78, 6, 5);
    const wave = (k: number): number => Math.sin(nowMs / 220 + k * 0.9 + side) * 3;
    ctx.beginPath();
    ctx.moveTo(px + 2, y - 72);
    ctx.lineTo(px + 14, y - 70 + wave(1));
    ctx.lineTo(px + 30, y - 62 + wave(2));
    ctx.lineTo(px + 14, y - 54 + wave(1));
    ctx.lineTo(px + 2, y - 50);
    ctx.closePath();
    ctx.fillStyle = '#1c1410';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(px + 3, y - 70);
    ctx.lineTo(px + 14, y - 68 + wave(1));
    ctx.lineTo(px + 26, y - 62 + wave(2));
    ctx.lineTo(px + 14, y - 56 + wave(1));
    ctx.lineTo(px + 3, y - 52);
    ctx.closePath();
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.fillStyle = '#fdba74';
    ctx.fillRect(px + 4, y - 68, 8, 3);
  }
  // the trident behind the fire
  const tx = Math.round(x - 30);
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(tx - 2, y - 66, 5, 66);
  ctx.fillRect(tx - 10, y - 70, 21, 5);
  for (const dx of [-10, -1, 8])
    ctx.fillRect(tx + dx - 1, y - 86 + (dx === -1 ? -6 : 0), 5, dx === -1 ? 22 : 18);
  ctx.fillStyle = '#d4d4d8';
  ctx.fillRect(tx - 1, y - 65, 3, 64);
  ctx.fillRect(tx - 9, y - 69, 19, 3);
  for (const dx of [-10, -1, 8]) ctx.fillRect(tx + dx, y - 85 + (dx === -1 ? -6 : 0), 3, dx === -1 ? 20 : 16);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(tx - 4, y - 58, 9, 4);
  // the hearth: a ring of stones round a bed of embers
  ctx.fillStyle = '#1c1410';
  ctx.fillRect(x - 24, y - 12, 48, 12);
  const stones = ['#8b8680', '#6f6a64', '#a39e96', '#7c776e', '#8b8680', '#6f6a64'];
  stones.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(x - 22 + i * 7.5, y - 10 + (i % 2), 7, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - 22 + i * 7.5, y - 10 + (i % 2), 7, 2);
  });
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(x - 17, y - 14, 34, 4);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 26, 4, x, y - 26, 110);
  g.addColorStop(0, 'rgba(255,170,70,0.5)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 110, y - 136, 220, 150);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 3; i++) {
    const h = 30 + Math.sin(nowMs / 85 + i * 2.1) * 8 + (i === 1 ? 14 : 0);
    tongue(ctx, x + (i - 1) * 10, y - 12, 14, h, Math.sin(nowMs / 120 + i) * 4);
  }
  // sparks of healing drifting up
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const t = (nowMs / (1600 + hash(i) * 1200) + hash(i + 5)) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = i % 3 ? '#ffe9a8' : '#86efac';
    ctx.fillRect(
      Math.round(x + (hash(i + 2) - 0.5) * 70 + Math.sin(nowMs / 400 + i) * 6),
      Math.round(y - 20 - t * 100),
      2,
      2,
    );
  }
  ctx.restore();
}
