/**
 * The Paramastra, shown in four movements over the wind-up the simulation gives it (GAME_CONFIG.powers.param):
 *
 *   1. the loosing   a golden arrow leaves the caster's bow and climbs into the sky on a trail of fire;
 *   2. the form      at the top it opens into Param's own weapon: rings of runes, a lotus of light, and the four
 *                    faces of Param looking out over the four directions, while the sky goes dark;
 *   3. the gathering the form folds into a single blazing spear pointing down; the ground below cracks and glows;
 *   4. the strike    (the simulation's strike) the spear falls: a pillar of light, a white flash, shockwaves
 *                    tearing along the ground to the edge of its reach, a dome of fire, then smoke and embers.
 *
 * World coordinates; additive light; paths and gradients only. The renderer adds the flash, shake and sparks.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const ease = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

interface Show {
  x: number;
  ground: number;
  start: number;
  windMs: number;
  strikeAt: number;
  range: number;
}

export const PARAM_AFTER_MS = 2600;

export class Paramastra {
  private show: Show | null = null;

  /** The call (the simulation's phase 0): the arrow is loosed. */
  begin(x: number, ground: number, nowMs: number, windMs: number, range: number): void {
    this.show = { x, ground, start: nowMs, windMs, strikeAt: 0, range };
  }

  /** The strike (phase 1). */
  strike(x: number, ground: number, nowMs: number): void {
    const s = this.show;
    if (!s) this.show = { x, ground, start: nowMs - 2000, windMs: 2000, strikeAt: nowMs, range: 1150 };
    else s.strikeAt = nowMs;
  }

  get active(): boolean {
    return this.show !== null;
  }

  /** How dark the sky should be (0..1). */
  darkness(nowMs: number): number {
    const s = this.show;
    if (!s) return 0;
    if (s.strikeAt) return clamp01(1 - (nowMs - s.strikeAt) / 900) * 0.9;
    return clamp01((nowMs - s.start) / 700) * 0.9;
  }

  /** The sky: the form taking shape above the field (behind the fighters). */
  drawBack(ctx: Ctx, nowMs: number, camY: number): void {
    const s = this.show;
    if (!s) return;
    if (s.strikeAt && nowMs - s.strikeAt > PARAM_AFTER_MS) {
      this.show = null;
      return;
    }
    const e = nowMs - s.start;
    const apexY = camY + 110;
    const W = s.windMs;
    const formIn = clamp01((e - W * 0.2) / (W * 0.35));
    const fold = clamp01((e - W * 0.6) / (W * 0.38));
    if (s.strikeAt || formIn <= 0) return;
    ctx.save();
    const cx = s.x;
    const cy = apexY + 30;
    const k = ease(formIn) * (1 - fold * 0.85);
    const t = nowMs / 1000;
    // a dark heaven behind the form, so it stands out on any sky
    const dark = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300 * k + 30);
    dark.addColorStop(0, `rgba(20,8,30,${0.7 * k})`);
    dark.addColorStop(1, 'rgba(20,8,30,0)');
    ctx.fillStyle = dark;
    ctx.fillRect(cx - 340, cy - 340, 680, 680);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, cy, 300 * k + 40, `rgba(255,214,120,${0.5 * k + 0.1})`);
    // outer rings of runes, counter-turning
    for (let ring = 0; ring < 3; ring++) {
      const r = (95 + ring * 55) * k;
      const dir = ring % 2 ? -1 : 1;
      ctx.strokeStyle = `rgba(253,230,138,${0.85 - ring * 0.2})`;
      ctx.lineWidth = 4 - ring;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      const n = 12 + ring * 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.8 * dir;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        ctx.fillStyle = `rgba(255,247,214,${0.9 - ring * 0.2})`;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.fillRect(-2, -8, 4, 16);
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.restore();
      }
    }
    // lotus petals opening
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 0.2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,190,110,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(36 * k, -24 * k, 88 * k, 0);
      ctx.quadraticCurveTo(36 * k, 24 * k, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    // the four faces of Param looking out to the four directions
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU - Math.PI / 2;
      const fx = cx + Math.cos(a) * 150 * k;
      const fy = cy + Math.sin(a) * 150 * k;
      face(ctx, fx, fy, 27 * k, a + Math.PI / 2);
    }
    // the core
    glow(ctx, cx, cy, 70 * k + 10, 'rgba(255,255,240,1)');
    // rays sweeping down to the field
    ctx.strokeStyle = `rgba(253,224,71,${0.25 * k})`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i - 4.5) * 0.14 + Math.sin(t + i) * 0.02;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** In front of the fighters: the arrow, the spear, the strike and what it leaves. */
  drawFront(ctx: Ctx, nowMs: number, camX: number, camY: number, viewW: number, viewH: number): void {
    const s = this.show;
    if (!s) return;
    const e = nowMs - s.start;
    const W = s.windMs;
    const apexY = camY + 110;
    const t = nowMs / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (!s.strikeAt) {
      // 1. the arrow climbing
      const climb = clamp01(e / (W * 0.25));
      if (climb < 1) {
        const ay = s.ground - 40 + (apexY - (s.ground - 40)) * ease(climb);
        arrow(ctx, s.x, ay, -Math.PI / 2, 1);
        // its trail
        const g = ctx.createLinearGradient(0, ay, 0, s.ground - 40);
        g.addColorStop(0, 'rgba(255,240,180,0.9)');
        g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(s.x - 3, ay, 6, s.ground - 40 - ay);
        glow(ctx, s.x, s.ground - 30, 60 * (1 - climb), 'rgba(255,220,140,0.7)');
      }
      // 3. the spear forming out of the fold, and the ground waking below
      const fold = clamp01((e - W * 0.6) / (W * 0.38));
      if (fold > 0) {
        const len = 60 + 220 * ease(fold);
        spear(ctx, s.x, apexY + 30, len, fold, t);
        // the mark on the ground
        const r = 40 + 80 * fold;
        ctx.strokeStyle = `rgba(253,224,71,${0.4 + 0.5 * fold})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(s.x, s.ground - 2, r, r * 0.22, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(s.x, s.ground - 2, r * 0.6, r * 0.13, 0, t * 2, t * 2 + TAU * 0.8);
        ctx.stroke();
        // cracks of light running out from it
        ctx.strokeStyle = `rgba(255,214,120,${0.7 * fold})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const dir = i % 2 ? 1 : -1;
          let px = s.x;
          let py = s.ground - 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          const reach = (80 + hash(i) * 260) * fold;
          for (let j = 1; j <= 5; j++) {
            px = s.x + (dir * (reach * j)) / 5;
            py = s.ground - 1 + (hash(i * 7 + j) - 0.5) * 6;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        glow(ctx, s.x, s.ground - 10, 90 * fold, 'rgba(255,200,100,0.5)');
      }
      ctx.restore();
      return;
    }
    // 4. the strike
    const d = nowMs - s.strikeAt;
    const fall = clamp01(d / 140);
    if (fall < 1) {
      const sy = apexY + (s.ground - apexY) * fall;
      spear(ctx, s.x, sy - 80, 200, 1, t);
    }
    // the pillar of light
    const p = clamp01(1 - (d - 100) / 1000);
    if (d > 100 && p > 0) {
      const w = 40 + 140 * p;
      const g = ctx.createLinearGradient(s.x - w, 0, s.x + w, 0);
      g.addColorStop(0, 'rgba(255,220,120,0)');
      g.addColorStop(0.35, `rgba(255,236,170,${0.8 * p})`);
      g.addColorStop(0.5, `rgba(255,255,255,${p})`);
      g.addColorStop(0.65, `rgba(255,236,170,${0.8 * p})`);
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - w, camY - 20, w * 2, s.ground - camY + 30);
    }
    // the dome of fire and the shockwaves tearing along the ground
    const dome = clamp01(d / 450);
    const fade = clamp01(1 - (d - 450) / 1300);
    if (fade > 0) {
      const R = 60 + 260 * ease(dome);
      const g = ctx.createRadialGradient(s.x, s.ground, R * 0.2, s.x, s.ground, R);
      g.addColorStop(0, `rgba(255,255,230,${0.9 * fade})`);
      g.addColorStop(0.45, `rgba(255,170,60,${0.7 * fade})`);
      g.addColorStop(1, 'rgba(200,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.ground, R, Math.PI, TAU);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        const k = clamp01((d - i * 140) / 900);
        if (k <= 0 || k >= 1) continue;
        const r = s.range * ease(k);
        ctx.strokeStyle = `rgba(255,${230 - i * 40},${160 - i * 40},${(1 - k) * 0.9})`;
        ctx.lineWidth = 10 * (1 - k) + 2;
        ctx.beginPath();
        ctx.ellipse(s.x, s.ground - 4, r, 26 * (1 - k) + 8, 0, Math.PI, TAU);
        ctx.stroke();
        // a wall of flame riding each wave front on the ground
        for (const dir of [-1, 1]) {
          const fx = s.x + dir * r;
          if (fx < camX - 40 || fx > camX + viewW + 40) continue;
          const h = 70 * (1 - k) + 10;
          const fg = ctx.createLinearGradient(0, s.ground - h, 0, s.ground);
          fg.addColorStop(0, 'rgba(255,200,80,0)');
          fg.addColorStop(1, `rgba(255,140,40,${0.85 * (1 - k)})`);
          ctx.fillStyle = fg;
          ctx.fillRect(fx - 18, s.ground - h, 36, h);
        }
      }
    }
    // the white-out
    const white = clamp01(1 - d / 260);
    if (white > 0) {
      ctx.fillStyle = `rgba(255,252,235,${0.75 * white})`;
      ctx.fillRect(camX - 10, camY - 10, viewW + 20, viewH + 20);
    }
    // afterwards: embers rising and smoke columns over the scorched ground
    const after = clamp01((d - 600) / 2000);
    if (after > 0 && after < 1) {
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 7; i++) {
        const sx = s.x + (i - 3) * 70 + Math.sin(t + i) * 10;
        const life = after;
        ctx.fillStyle = `rgba(60,52,48,${0.45 * (1 - life)})`;
        ctx.beginPath();
        ctx.arc(sx, s.ground - 30 - life * 200 - (i % 3) * 30, 26 + life * 50, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(30,20,15,${0.5 * (1 - after)})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.ground + 2, 260, 14, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30; i++) {
        const ex = s.x + (hash(i) - 0.5) * 520;
        const ey = s.ground - ((hash(i + 9) * 60 + after * 220 * (0.5 + hash(i + 3))) % 260);
        ctx.fillStyle = `rgba(255,${150 + (i % 3) * 30},60,${1 - after})`;
        ctx.fillRect(ex, ey, 2, 2);
      }
    }
    ctx.restore();
  }
}

/** The paramastra arrow: a long golden shaft with a four-bladed head, pointing along `a`. */
function arrow(ctx: Ctx, x: number, y: number, a: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  glow(ctx, 0, 0, 34 * k, 'rgba(255,230,150,0.8)');
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(-46, -1.5, 46, 3);
  ctx.fillStyle = '#fffbeb';
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(0, -7);
  ctx.lineTo(4, 0);
  ctx.lineTo(0, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(-50, -6);
  ctx.lineTo(-46, 0);
  ctx.lineTo(-50, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The weapon folded to its point: a blazing spear `len` long hanging point-down from (x, top). */
function spear(ctx: Ctx, x: number, top: number, len: number, k: number, t: number): void {
  const tip = top + len;
  glow(ctx, x, top + len * 0.5, 50 + 40 * k, `rgba(255,220,130,${0.5 + 0.3 * k})`);
  const g = ctx.createLinearGradient(0, top, 0, tip);
  g.addColorStop(0, 'rgba(255,200,90,0.2)');
  g.addColorStop(0.7, 'rgba(255,240,200,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 18 * k - 4, top);
  ctx.lineTo(x + 18 * k + 4, top);
  ctx.lineTo(x + 7, tip - 44);
  ctx.lineTo(x + 26, tip - 36);
  ctx.lineTo(x, tip);
  ctx.lineTo(x - 26, tip - 36);
  ctx.lineTo(x - 7, tip - 44);
  ctx.closePath();
  ctx.fill();
  // sparks crawling up and down it
  for (let i = 0; i < 6; i++) {
    const sy = top + ((t * 300 + i * 37) % len);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x - 6 + hash(i) * 12, sy, 2, 2);
  }
}

/** One of Param's faces: a crowned head of light, turned by `a` to look outward. */
function face(ctx: Ctx, x: number, y: number, r: number, a: number): void {
  if (r <= 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  glow(ctx, 0, 0, r * 2.2, 'rgba(255,214,120,0.6)');
  ctx.fillStyle = 'rgba(255,236,180,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.8, r, 0, 0, TAU);
  ctx.fill();
  // crown
  ctx.fillStyle = 'rgba(250,204,21,0.95)';
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.7);
  ctx.lineTo(-r * 0.5, -r * 1.5);
  ctx.lineTo(-r * 0.15, -r * 0.9);
  ctx.lineTo(0, -r * 1.7);
  ctx.lineTo(r * 0.15, -r * 0.9);
  ctx.lineTo(r * 0.5, -r * 1.5);
  ctx.lineTo(r * 0.8, -r * 0.7);
  ctx.closePath();
  ctx.fill();
  // closed eyes and the mark on the brow
  ctx.strokeStyle = 'rgba(146,64,14,0.9)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.05, r * 0.2, 0.2, Math.PI - 0.2);
  ctx.moveTo(r * 0.52, -r * 0.05);
  ctx.arc(r * 0.32, -r * 0.05, r * 0.2, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220,38,38,0.9)';
  ctx.fillRect(-r * 0.06, -r * 0.6, r * 0.12, r * 0.3);
  // beard
  ctx.fillStyle = 'rgba(255,250,235,0.8)';
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.5);
  ctx.quadraticCurveTo(0, r * 1.6, r * 0.5, r * 0.5);
  ctx.fill();
  ctx.restore();
}
