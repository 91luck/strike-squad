/**
 * Vayu Shikhar (saga stage 3) art: the gusts across the mountain (and the warning before each), the stage's
 * rakshasas (wind demons, boulder rollers, cloud lancers), Aandhi in his sage's guise and his storm, their
 * shots, and the hermit's cave at the rest stop. World coordinates on the world canvas.
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

/**
 * The wind over the view: `gu` ±1 blowing that way (streaks racing across, leaves torn along), ±2 about to (dust
 * lifting and a chevron at the edge it will come from). `storm` makes it a dark, heavy gale.
 */
export function drawWind(
  ctx: Ctx,
  gu: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  nowMs: number,
  storm: boolean,
): void {
  const t = nowMs / 1000;
  const dir = Math.sign(gu);
  ctx.save();
  if (Math.abs(gu) === 2) {
    // the warning: chevrons on the side the wind will come from, pulsing
    const pulse = 0.5 + 0.5 * Math.sin(t * 12);
    const ex = dir > 0 ? camX + 24 : camX + viewW - 24;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 4;
    for (let k = 0; k < 3; k++) {
      const x = ex + dir * k * 14;
      const y = camY + viewH * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - dir * 8, y - 14);
      ctx.lineTo(x + dir * 4, y);
      ctx.lineTo(x - dir * 8, y + 14);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(214,211,209,0.5)';
    for (let i = 0; i < 14; i++) {
      const x = camX + hash(i) * viewW;
      const y = camY + viewH - 10 - ((t * 30 + i * 17) % 60);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
    return;
  }
  if (storm) {
    ctx.fillStyle = 'rgba(30,41,59,0.28)';
    ctx.fillRect(camX, camY, viewW, viewH);
  }
  ctx.strokeStyle = storm ? 'rgba(203,213,225,0.55)' : 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  const n = storm ? 46 : 28;
  for (let i = 0; i < n; i++) {
    const speed = 900 + hash(i) * 600;
    const span = viewW + 300;
    const raw = (t * speed + hash(i + 7) * span) % span;
    const x = dir > 0 ? camX - 150 + raw : camX + viewW + 150 - raw;
    const y = camY + hash(i + 3) * viewH;
    const len = 40 + hash(i + 5) * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * len, y + Math.sin(t * 3 + i) * 2);
    ctx.stroke();
  }
  // leaves torn along with it
  for (let i = 0; i < 12; i++) {
    const span = viewW + 200;
    const raw = (t * (500 + hash(i) * 300) + hash(i + 11) * span) % span;
    const x = dir > 0 ? camX - 100 + raw : camX + viewW + 100 - raw;
    const y = camY + hash(i + 13) * viewH + Math.sin(t * 6 + i) * 10;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 9 + i);
    ctx.fillStyle = i % 2 ? '#65a30d' : '#a3a3a3';
    ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
  ctx.restore();
}

/** Wind demon: a grey-winged rakshasa with a hooked beak and talons; wings swept back as it swoops. */
export function drawHarpy(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  swoop: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id * 0.5;
  const beat = swoop ? -0.6 : Math.sin(t * 8);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - 10));
  ctx.scale(f, 1);
  if (swoop) ctx.rotate(0.3);
  flashOn(ctx, flash);
  for (const side of [-1, 1]) {
    ctx.fillStyle = side < 0 ? '#64748b' : '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(-14, -14 - beat * 10 * side, -26, -6 - beat * 8);
    ctx.lineTo(-20, -2);
    ctx.lineTo(-24, 2);
    ctx.lineTo(-14, 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.arc(8, -5, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(12, -6);
  ctx.lineTo(18, -3);
  ctx.lineTo(12, -2);
  ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(9, -7, 2, 2);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-2, 5);
  ctx.lineTo(0, 10);
  ctx.moveTo(3, 5);
  ctx.lineTo(5, 10);
  ctx.stroke();
  ctx.restore();
}

/** Boulder roller: a broad mountain rakshasa with a boulder hoisted over his head. */
export function drawRoller(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  heave: number,
  flash: boolean,
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(f, 1);
  flashOn(ctx, flash);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, -1, 13, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#44403c';
  ctx.fillRect(-7, -12, 5, 12);
  ctx.fillRect(2, -12, 5, 12);
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.moveTo(-11, -12);
  ctx.lineTo(11, -12);
  ctx.lineTo(9, -32);
  ctx.lineTo(-9, -32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath();
  ctx.arc(1, -37, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(3, -39, 2, 2);
  // arms up with the boulder (it is gone just after a throw)
  const lift = heave < 0.4 ? 0 : 1;
  ctx.strokeStyle = '#57534e';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-6, -30);
  ctx.lineTo(-7, -46 - lift * 2);
  ctx.moveTo(6, -30);
  ctx.lineTo(7, -46 - lift * 2);
  ctx.stroke();
  if (heave >= 0.4) {
    ctx.fillStyle = '#78716c';
    ctx.beginPath();
    ctx.arc(0, -54, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.arc(-3, -57, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  void id;
}

/** Cloud lancer: a storm rider astride a dark cloud, a javelin that crackles as he raises it to throw. */
export function drawLancer(
  ctx: Ctx,
  x: number,
  y: number,
  f: number,
  nowMs: number,
  id: number,
  aiming: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  flashOn(ctx, flash);
  // the cloud
  ctx.fillStyle = '#334155';
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.arc(-18 + k * 9, 2 + Math.sin(t * 2 + k) * 1.5, 9 + (k % 2) * 3, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(-4, -2, 8, 0, TAU);
  ctx.fill();
  ctx.scale(f, 1);
  // the rider
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-4, -18, 8, 14);
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(0, -22, 5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(1, -23, 2, 2);
  // javelin
  const raise = aiming ? -10 : 0;
  ctx.strokeStyle = aiming ? '#fef08a' : '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -10 + raise);
  ctx.lineTo(16, -26 + raise);
  ctx.stroke();
  ctx.restore();
  if (aiming) {
    glow(ctx, x + f * 16, y - 26 - 10, 22, 'rgba(253,224,71,0.8)');
    ctx.save();
    ctx.strokeStyle = 'rgba(254,240,138,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let px = x + f * 16;
    let py = y - 36;
    ctx.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px += (hash(k + Math.floor(t * 20)) - 0.5) * 10;
      py -= 6;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export interface AandhiPose {
  at: number;
  tt: number;
  wind: number;
  phase: number;
  dead: boolean;
  flash: boolean;
  storm: number;
  boulders: number;
  javelins: number;
  call: number;
  /** Reeling from his own storm turned back. */
  reel: boolean;
}

/**
 * Aandhi: until the fight starts, a calm sage in saffron under a tree; then the rakshasa underneath shows,
 * twice as big, grey-blue, with a scowling brow, beads and the sage's robe torn. Arms raised high while he
 * holds a storm (he is open then).
 */
export function drawAandhi(
  ctx: Ctx,
  x: number,
  y: number,
  nowMs: number,
  s: AandhiPose,
  awake: boolean,
): void {
  const t = nowMs / 1000;
  const k = s.wind > 0 ? Math.min(1, s.tt / s.wind) : 1;
  ctx.save();
  if (s.flash) ctx.filter = 'brightness(1.8)';
  // rendered in 3D once loaded (boss3d.ts): the sage, then the demon's body, arms and boulder; the storm and
  // glows stay drawn
  const r3 = bossReady('aandhi') && !s.dead;
  if (!awake && r3) {
    drawPart(ctx, 'aandhi', 'sage', x, y);
    glow(ctx, x, y - 60, 30, 'rgba(253,186,116,0.35)');
    ctx.restore();
    return;
  }
  if (!awake) {
    // the sage: sitting cross-legged in saffron, eyes closed, a kamandalu beside him
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.ellipse(x, y - 12, 26, 12, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.fillRect(x - 12, y - 52, 24, 40);
    ctx.fillStyle = '#d6a77a';
    ctx.beginPath();
    ctx.arc(x, y - 62, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e7e5e4';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 58);
    ctx.quadraticCurveTo(x, y - 36, x + 9, y - 58);
    ctx.fill();
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.arc(x, y - 72, 8, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.ellipse(x + 34, y - 8, 8, 9, 0, 0, TAU);
    ctx.fill();
    glow(ctx, x, y - 60, 30, 'rgba(253,186,116,0.35)');
    ctx.restore();
    return;
  }
  const skin = s.dead ? '#57534e' : '#475569';
  const holding = s.at === s.storm;
  const raise = holding ? 1 : s.at === s.call ? k : 0;
  const lean = s.reel ? Math.sin(t * 20) * 4 : 0;
  if (r3) {
    drawPart(ctx, 'aandhi', 'body', x + lean, y);
    for (const side of [-1, 1])
      drawLimb(
        ctx,
        'aandhi',
        'arm',
        x + side * 30 + lean,
        y - 90,
        raise > 0 ? x + side * (36 + 6 * raise) + lean : x + side * 42 + lean,
        raise > 0 ? y - 90 - 50 * raise : y - 60,
        side > 0,
      );
    if (s.at === s.boulders && k < 1) drawPart(ctx, 'aandhi', 'boulder', x - 44 + lean, y - 110);
    if (s.at === s.javelins) glow(ctx, x - 44 + lean, y - 70, 24 * k, 'rgba(253,224,71,0.8)');
  } else {
    // legs
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 18 + lean, y - 40, 14, 40);
    ctx.fillRect(x + 4 + lean, y - 40, 14, 40);
    // torn saffron robe at the waist
    ctx.fillStyle = s.dead ? '#78716c' : '#c2410c';
    ctx.beginPath();
    ctx.moveTo(x - 26 + lean, y - 40);
    ctx.lineTo(x + 26 + lean, y - 40);
    ctx.lineTo(x + 20 + lean, y - 20);
    ctx.lineTo(x + 8 + lean, y - 28);
    ctx.lineTo(x - 2 + lean, y - 18);
    ctx.lineTo(x - 12 + lean, y - 26);
    ctx.lineTo(x - 22 + lean, y - 18);
    ctx.closePath();
    ctx.fill();
    // torso
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(x - 28 + lean, y - 40);
    ctx.lineTo(x + 28 + lean, y - 40);
    ctx.lineTo(x + 34 + lean, y - 96);
    ctx.lineTo(x - 34 + lean, y - 96);
    ctx.closePath();
    ctx.fill();
    // rudraksha beads
    ctx.fillStyle = '#7c2d12';
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7;
      ctx.beginPath();
      ctx.arc(x + lean + Math.cos(a) * 20, y - 96 + Math.sin(a) * 26, 3, 0, TAU);
      ctx.fill();
    }
    // arms: raised high holding a storm, otherwise one forward with a javelin or a boulder
    ctx.strokeStyle = skin;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * 30 + lean, y - 90);
      if (raise > 0) ctx.lineTo(x + side * (36 + 6 * raise) + lean, y - 90 - 50 * raise);
      else ctx.lineTo(x + side * 42 + lean, y - 60);
      ctx.stroke();
    }
    if (s.at === s.boulders && k < 1) {
      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.arc(x - 44 + lean, y - 110, 16, 0, TAU);
      ctx.fill();
    }
    if (s.at === s.javelins) glow(ctx, x - 44 + lean, y - 70, 24 * k, 'rgba(253,224,71,0.8)');
    // head: matted locks, a scowling brow
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x + lean, y - 112, 17, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 16 + i * 5 + lean, y - 122);
      ctx.quadraticCurveTo(
        x - 24 + i * 7 + lean + Math.sin(t * 3 + i) * 3,
        y - 100,
        x - 20 + i * 7 + lean,
        y - 84,
      );
      ctx.lineTo(x - 17 + i * 7 + lean, y - 84);
      ctx.quadraticCurveTo(x - 20 + i * 6 + lean, y - 100, x - 13 + i * 5 + lean, y - 122);
      ctx.fill();
    }
    ctx.fillStyle = '#fde047';
    ctx.fillRect(x - 9 + lean, y - 114, 5, 3);
    ctx.fillRect(x + 4 + lean, y - 114, 5, 3);
    // a heavy brow ridge
    ctx.fillStyle = s.dead ? '#57534e' : '#7f1d1d';
    ctx.fillRect(x - 11 + lean, y - 120, 22, 3);
    ctx.fillStyle = '#e7e5e4';
    ctx.fillRect(x - 6 + lean, y - 104, 12, 2);
  }
  if (holding && !s.dead) {
    // the storm gathered between his hands
    glow(ctx, x + lean, y - 160, 70, 'rgba(148,163,184,0.6)');
    ctx.strokeStyle = 'rgba(226,232,240,0.8)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + lean, y - 160, 20 + i * 12, t * (5 + i) + i, t * (5 + i) + i + 3.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Stage 3 enemy fire: feathers and lightning javelins (`shot`), boulders (`shell`). */
export function drawWindShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  if (kind === 'shot') {
    const a = Math.atan2(b.vy, b.vx);
    const fast = Math.hypot(b.vx, b.vy) > 400;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    if (fast) {
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(-12, -3);
      ctx.lineTo(-6, 2);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.restore();
      glow(ctx, b.x, b.y, 14, 'rgba(253,224,71,0.7)');
      return true;
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 2.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.restore();
    return true;
  }
  if (kind === 'shell') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(nowMs / 90 + b.id);
    ctx.fillStyle = '#57534e';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a8a29e';
    ctx.beginPath();
    ctx.arc(-3, -3, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#44403c';
    ctx.fillRect(2, 1, 4, 3);
    ctx.restore();
    return true;
  }
  return false;
}

/** A hermit's cave on the mountainside (the rest stop): a stone cairn, a walking staff, a lamp, a blue flag. */
export function drawCaveRest(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  // a cairn of flat stones
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(cx - 22, y - 14, 44, 14);
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.ellipse(cx, y - 20, 16, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath();
  ctx.ellipse(cx + 2, y - 28, 11, 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.ellipse(cx, y - 35, 6, 3.5, 0, 0, TAU);
  ctx.fill();
  // a walking staff leaning on the rock, a water pot by it
  ctx.strokeStyle = '#a16207';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + 34, y);
  ctx.lineTo(cx + 46, y - 60);
  ctx.stroke();
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(cx + 26, y - 7, 7, 0, TAU);
  ctx.fill();
  // lamp
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.ellipse(cx - 40, y - 3, 7, 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(cx - 43, y - 5);
  ctx.quadraticCurveTo(cx - 40, y - 16 - Math.sin(nowMs / 150) * 2, cx - 37, y - 5);
  ctx.fill();
  glow(ctx, cx - 40, y - 10, 40, 'rgba(253,224,71,0.45)');
  // flag
  ctx.fillStyle = '#78350f';
  ctx.fillRect(x1 - 70, y - 90, 3, 90);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(x1 - 67, y - 90);
  ctx.lineTo(x1 - 40, y - 82 + Math.sin(nowMs / 200) * 2);
  ctx.lineTo(x1 - 67, y - 74);
  ctx.fill();
}
