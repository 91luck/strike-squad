/**
 * Chakra Durg (saga stage 8) art: inside the bhanwarvyuh. The wall of shields and spears closing in behind the squad,
 * the turning rings (the ground marching one way or the other), the stage's rakshasas (discus throwers, maharathis,
 * net throwers), the nets and discs, Suryakavach at the gate with the sun behind him and the eclipse when a great
 * discus covers it, and the warriors' camp at the rest stop. World coordinates unless noted.
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

/** A round shield with a boss and a painted sun. */
function shield(ctx: Ctx, x: number, y: number, r: number, hue: number): void {
  ctx.fillStyle = `hsl(${hue},45%,28%)`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, TAU);
  ctx.fill();
}

/**
 * The bhanwarvyuh closing behind the squad: from the left edge of the view up to `wx`, rank on rank of shields with
 * spears levelled over them (the wall shuffles forward). Drawn across the whole height of the view.
 */
export function drawVyuhWall(
  ctx: Ctx,
  wx: number,
  camX: number,
  camY: number,
  viewH: number,
  nowMs: number,
): void {
  if (wx < camX - 60) return;
  const t = nowMs / 1000;
  const x0 = camX - 20;
  ctx.fillStyle = 'rgba(30,20,50,0.85)';
  ctx.fillRect(x0, camY, wx - x0, viewH);
  const top = camY;
  for (let row = 0; row * 34 < viewH + 34; row++) {
    const y = top + row * 34 + 16;
    const shuffle = Math.sin(t * 3 + row) * 3;
    for (let k = 0; k < 3; k++) {
      const x = wx - 14 - k * 30 + shuffle;
      if (x < x0 - 20) continue;
      shield(ctx, x, y, 15, 260 + ((row + k) % 3) * 20);
    }
    // spears levelled over the front rank
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx - 20 + shuffle, y - 10);
    ctx.lineTo(wx + 26 + shuffle, y - 14);
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(wx + 34 + shuffle, y - 14);
    ctx.lineTo(wx + 24 + shuffle, y - 18);
    ctx.lineTo(wx + 24 + shuffle, y - 10);
    ctx.closePath();
    ctx.fill();
  }
  glow(ctx, wx, camY + viewH / 2, viewH * 0.5, 'rgba(167,139,250,0.12)');
}

/**
 * A turning ring: the ground's surface marching one way (chevrons sliding along it and a line of shield-bearers'
 * feet), between x0 and x1 at the surface y.
 */
export function drawBelt(ctx: Ctx, x0: number, x1: number, y: number, dir: number, nowMs: number): void {
  const t = nowMs / 1000;
  const step = 28;
  const off = (((t * 70 * dir) % step) + step) % step;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y - 6, x1 - x0, 12);
  ctx.clip();
  ctx.fillStyle = 'rgba(76,29,149,0.55)';
  ctx.fillRect(x0, y - 2, x1 - x0, 6);
  ctx.strokeStyle = 'rgba(250,204,21,0.8)';
  ctx.lineWidth = 2;
  for (let x = x0 - step + off; x < x1 + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x - dir * 5, y - 1);
    ctx.lineTo(x + dir * 2, y + 1.5);
    ctx.lineTo(x - dir * 5, y + 4);
    ctx.stroke();
  }
  ctx.restore();
}

/** A discus thrower: in violet with a spinning disc ready (or none while it is out). */
export function drawChakri(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  out: boolean,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(x - 6, y - 13, 4, 13);
  ctx.fillRect(x + 2, y - 13, 4, 13);
  ctx.fillStyle = '#6d28d9';
  ctx.fillRect(x - 7, y - 29, 14, 17);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 7, y - 19, 14, 3);
  ctx.fillStyle = '#c08457';
  ctx.beginPath();
  ctx.arc(x, y - 34, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 6, y - 41, 12, 3);
  ctx.strokeStyle = '#c08457';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + face * 4, y - 26);
  ctx.lineTo(x + face * 13, out ? y - 22 : y - 34);
  ctx.stroke();
  if (!out) drawDisc(ctx, x + face * 15, y - 38, 7, t * 14);
  ctx.restore();
}

/** A spinning discus with teeth. */
function drawDisc(ctx: Ctx, x: number, y: number, r: number, a: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 ? r : r * 1.3;
    const k = (i / 16) * TAU;
    ctx.lineTo(Math.cos(k) * rr, Math.sin(k) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.45, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A maharathi: armoured swordsman; `mode` 1 crouched to lunge, 2 lunging (a blur behind him). */
export function drawRathi(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  mode: number,
  flash: boolean,
): void {
  const t = nowMs / 1000 + id;
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  const low = mode === 1 ? 6 : 0;
  if (mode === 2) {
    ctx.fillStyle = 'rgba(167,139,250,0.35)';
    ctx.fillRect(x - face * 50, y - 34, 50 * face, 26);
  }
  ctx.fillStyle = '#312e81';
  ctx.fillRect(x - 7, y - 14 + low / 2, 5, 14 - low / 2);
  ctx.fillRect(x + 2, y - 14 + low / 2, 5, 14 - low / 2);
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(x - 8, y - 32 + low, 16, 19);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - 8, y - 32 + low, 16, 3);
  ctx.fillStyle = '#c08457';
  ctx.beginPath();
  ctx.arc(x, y - 37 + low, 6, 0, TAU);
  ctx.fill();
  // helm with a plume
  ctx.fillStyle = '#d4a017';
  ctx.beginPath();
  ctx.arc(x, y - 40 + low, 6.5, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(x, y - 46 + low);
  ctx.quadraticCurveTo(x - face * 10, y - 52 + low + Math.sin(t * 6) * 2, x - face * 14, y - 42 + low);
  ctx.fill();
  // round shield and sword
  shield(ctx, x - face * 8, y - 24 + low, 8, 260);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (mode === 2) {
    ctx.moveTo(x + face * 6, y - 26);
    ctx.lineTo(x + face * 34, y - 24);
  } else {
    ctx.moveTo(x + face * 7, y - 22 + low);
    ctx.lineTo(x + face * (mode === 1 ? 12 : 18), y - (mode === 1 ? 46 : 38) + low);
  }
  ctx.stroke();
  ctx.restore();
}

/** A net thrower with a coiled net over his shoulder. */
export function drawNetter(
  ctx: Ctx,
  x: number,
  y: number,
  face: number,
  nowMs: number,
  id: number,
  since: number,
  flash: boolean,
): void {
  ctx.save();
  if (flash) ctx.filter = 'brightness(2)';
  ctx.fillStyle = '#292524';
  ctx.fillRect(x - 6, y - 13, 4, 13);
  ctx.fillRect(x + 2, y - 13, 4, 13);
  ctx.fillStyle = '#4c1d95';
  ctx.fillRect(x - 7, y - 29, 14, 17);
  ctx.fillStyle = '#c08457';
  ctx.beginPath();
  ctx.arc(x, y - 34, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#78350f';
  ctx.fillRect(x - 7, y - 41, 14, 4);
  const throwing = since < 8;
  if (!throwing) {
    ctx.strokeStyle = '#d6d3d1';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x - face * 6, y - 26, 6 + i * 2, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = '#c08457';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + face * 4, y - 26);
  ctx.lineTo(x + face * 14, throwing ? y - 42 : y - 20);
  ctx.stroke();
  void nowMs;
  void id;
  ctx.restore();
}

/** A net over a soldier caught in it. */
export function drawNetOn(ctx: Ctx, x: number, y: number, nowMs: number): void {
  const w = 34;
  const h = 46;
  const k = Math.sin(nowMs / 90) * 1.5;
  ctx.strokeStyle = 'rgba(231,229,228,0.9)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + (i * w) / 5, y - h + k);
    ctx.lineTo(x - w / 2 + (i * w) / 5 + 4, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - h + (i * h) / 5);
    ctx.lineTo(x + w / 2, y - h + (i * h) / 5 + k);
    ctx.stroke();
  }
  ctx.fillStyle = '#78716c';
  for (const dx of [-w / 2, w / 2]) {
    ctx.beginPath();
    ctx.arc(x + dx, y - 2, 3, 0, TAU);
    ctx.fill();
  }
}

/** Stage 8 shots: the discus (spinning), the net (spread out in flight), Suryakavach's spears. */
export function drawChakraShot(
  ctx: Ctx,
  kind: string,
  b: { x: number; y: number; vx: number; vy: number; id: number },
  nowMs: number,
): boolean {
  if (kind === 'chakra') {
    drawDisc(ctx, b.x, b.y, 8, nowMs / 40);
    glow(ctx, b.x, b.y, 16, 'rgba(167,139,250,0.5)');
    return true;
  }
  if (kind === 'net') {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(nowMs / 200);
    ctx.strokeStyle = 'rgba(231,229,228,0.95)';
    ctx.lineWidth = 1.2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-14, i * 6);
      ctx.lineTo(14, i * 6);
      ctx.moveTo(i * 6, -14);
      ctx.lineTo(i * 6, 14);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }
  if (kind === 'arrow') {
    const a = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return true;
  }
  return false;
}

export interface SuryakavachView {
  at: number;
  tt: number;
  wind: number;
  dead: boolean;
  flash: boolean;
  /** the sun covered: his guard is down */
  eclipse: boolean;
  phase: number;
  ids: { mace: number; spears: number; rathis: number };
}

/**
 * Suryakavach, king of Sindhu, at the seventh gate: a heavy warrior in gold-and-blue armour with a great mace; a
 * golden shimmer round him while the sun shines (his boon), gone in the eclipse.
 */
export function drawSuryakavach(ctx: Ctx, x: number, y: number, nowMs: number, v: SuryakavachView): void {
  const t = nowMs / 1000;
  ctx.save();
  if (v.flash) ctx.filter = 'brightness(1.7)';
  if (v.dead) {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x - 40, y - 22, 80, 22);
    ctx.fillStyle = '#c08457';
    ctx.beginPath();
    ctx.arc(x - 44, y - 14, 10, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  const k = v.wind > 0 ? Math.min(1, v.tt / v.wind) : 1;
  // rendered in 3D once loaded (boss3d.ts): the gate, the king and his mace; the boon's light stays drawn
  const r3 = bossReady('suryakavach');
  if (r3) drawPart(ctx, 'suryakavach', 'gate', x, y);
  else {
    // the gate behind him: two pillars and a lintel with a carved wheel
    ctx.fillStyle = '#3b2a5a';
    ctx.fillRect(x + 20, y - 200, 22, 200);
    ctx.fillRect(x - 90, y - 200, 132, 18);
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 24, y - 191, 14, 0, TAU);
    ctx.stroke();
  }
  if (!v.eclipse) {
    // the boon: a golden shell of light
    ctx.strokeStyle = `rgba(250,204,21,${0.45 + 0.2 * Math.sin(t * 5)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y - 56, 46, 66, 0, 0, TAU);
    ctx.stroke();
    glow(ctx, x, y - 56, 90, 'rgba(250,204,21,0.25)');
  }
  if (r3) drawPart(ctx, 'suryakavach', 'body', x, y);
  else {
    // legs
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x - 16, y - 34, 12, 34);
    ctx.fillRect(x + 4, y - 34, 12, 34);
    // body armour
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x - 22, y - 82, 44, 50);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 22, y - 82, 44, 4);
    ctx.fillRect(x - 22, y - 50, 44, 4);
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 16 + i * 14, y - 72, 4, 18);
    // head, crown, beard
    ctx.fillStyle = '#c08457';
    ctx.beginPath();
    ctx.arc(x - 4, y - 92, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 90);
    ctx.quadraticCurveTo(x - 10, y - 74, x - 2, y - 80);
    ctx.lineTo(x + 6, y - 88);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 100);
    ctx.lineTo(x - 10, y - 114);
    ctx.lineTo(x - 4, y - 104);
    ctx.lineTo(x + 2, y - 114);
    ctx.lineTo(x + 6, y - 100);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 12, y - 95, 3, 2);
  }
  // the mace, raised for the blow and brought down
  const up = v.at === v.ids.mace ? (v.tt < v.wind ? k : Math.max(0, 1 - (v.tt - v.wind) / 6)) : 0.25;
  const ang = -Math.PI / 2 - 0.4 - up * 1.4;
  const hx = x - 24;
  const hy = y - 70;
  const mx = hx + Math.cos(ang + Math.PI) * 50;
  const my = hy + Math.sin(ang + Math.PI) * 50 * (up > 0.5 ? -1 : 1);
  if (r3) drawLimb(ctx, 'suryakavach', 'mace', hx, hy, mx, my);
  else {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.fillStyle = '#d4a017';
    ctx.beginPath();
    ctx.arc(mx, my, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.fillRect(mx + Math.cos(a) * 12 - 2, my + Math.sin(a) * 12 - 2, 4, 4);
    }
  }
  if (v.at === v.ids.spears && v.tt < v.wind) {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 76);
    ctx.lineTo(x - 30, y - 120 - k * 10);
    ctx.stroke();
  }
  if (v.at === v.ids.rathis && v.tt < v.wind) {
    // a conch raised: the maharathis come
    ctx.fillStyle = '#f5f5f4';
    ctx.beginPath();
    ctx.ellipse(x - 30, y - 104, 9, 5, -0.5, 0, TAU);
    ctx.fill();
    const r = (nowMs / 250) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.8 - r * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x - 40, y - 110, 10 + r * 30, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The sky over the seventh gate (screen coordinates): the sun high to the right; in the eclipse a great discus
 * slides over it, the world dims and a ring of fire shows round the discus. `k`: 0 sun, 1 full eclipse.
 */
export function drawEclipse(ctx: Ctx, w: number, h: number, k: number, nowMs: number): void {
  if (k <= 0) return;
  const sx = w * 0.78;
  const sy = h * 0.2;
  ctx.fillStyle = `rgba(10,5,30,${0.45 * k})`;
  ctx.fillRect(0, 0, w, h);
  glow(ctx, sx, sy, 90, `rgba(253,186,116,${0.6 * k})`);
  ctx.save();
  ctx.translate(sx + (1 - k) * 160, sy);
  ctx.rotate(nowMs / 300);
  ctx.globalAlpha = Math.min(1, k * 1.5);
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const rr = i % 2 ? 44 : 52;
    const a = (i / 24) * TAU;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** The rest stop: the warriors' camp: two tents, banners, a fire, a conch on a stand. */
export function drawShivir(ctx: Ctx, x0: number, x1: number, y: number, nowMs: number): void {
  const cx = (x0 + x1) / 2;
  const t = nowMs / 1000;
  for (const [tx, s] of [
    [cx - 90, 1],
    [cx + 70, 0.85],
  ] as const) {
    ctx.fillStyle = '#e7e5e4';
    ctx.beginPath();
    ctx.moveTo(tx - 50 * s, y);
    ctx.lineTo(tx, y - 70 * s);
    ctx.lineTo(tx + 50 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(tx - 8 * s, y);
    ctx.lineTo(tx, y - 30 * s);
    ctx.lineTo(tx + 8 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx, y - 70 * s);
    ctx.lineTo(tx, y - 96 * s);
    ctx.stroke();
    const fl = Math.sin(t * 4 + tx) * 3;
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.moveTo(tx, y - 96 * s);
    ctx.lineTo(tx + 20, y - 92 * s + fl);
    ctx.lineTo(tx, y - 86 * s);
    ctx.closePath();
    ctx.fill();
  }
  // camp fire
  ctx.fillStyle = '#57534e';
  ctx.fillRect(cx - 12, y - 4, 24, 4);
  for (let i = 0; i < 3; i++) {
    const h = 14 + Math.sin(t * 11 + i) * 4;
    ctx.fillStyle = i === 1 ? '#fbbf24' : '#f97316';
    ctx.beginPath();
    ctx.moveTo(cx - 9 + i * 6, y - 4);
    ctx.quadraticCurveTo(cx - 7 + i * 6, y - 4 - h * 1.6, cx - 3 + i * 6, y - 4);
    ctx.fill();
  }
  glow(ctx, cx, y - 14, 70, 'rgba(251,146,60,0.45)');
  // a conch on its stand
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx + 140, y - 26, 3, 26);
  ctx.fillStyle = '#fafaf9';
  ctx.beginPath();
  ctx.ellipse(cx + 141, y - 32, 10, 6, -0.4, 0, TAU);
  ctx.fill();
  glow(ctx, cx + 141, y - 32, 30, 'rgba(255,255,255,0.3)');
}
