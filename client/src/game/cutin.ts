import { HD_CENTER, HD_FEET } from './hero-hd';
import { bigFrame3d } from './sprites3d';

/**
 * The power cut-in: when you fire your super move or call an astra, the screen answers like a fighting game's
 * finisher. One impact frame (the world flashes to ink and light for two frames), then a slanted band sweeps across
 * the screen in your colour with streaking speed lines, your hero's rendered figure bursts out of it (art3d, the
 * menu showcase frames) and the power's name slams in. Under a second, drawn in screen space over the world (the
 * game keeps running under it), and only for your own powers, so a full squad's supers never cover your screen.
 *
 * Reduced motion: no impact frame and no sweep; the name fades in and out over a soft band.
 */

type Ctx = CanvasRenderingContext2D;

interface Cut {
  hero: number;
  title: string;
  sub: string;
  color: string;
  glow: string;
  born: number;
  /** Astra calls (the astra's own apparition is the show) get a shorter, slimmer cut. */
  small: boolean;
}

const DUR = 950;
const DUR_SMALL = 720;
const DISPLAY = '"Russo One", "Chakra Petch", system-ui, sans-serif';

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t * t;
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export class CutIn {
  private cut: Cut | null = null;

  get active(): boolean {
    return this.cut !== null;
  }

  /** Your super move (big) or your astra (small): `title` the power's name, `sub` the line under it. */
  play(
    hero: number,
    title: string,
    sub: string,
    color: string,
    glow: string,
    nowMs: number,
    small = false,
  ): void {
    this.cut = { hero, title, sub, color, glow, born: nowMs, small };
  }

  clear(): void {
    this.cut = null;
  }

  /** Draws in device pixels (identity transform); `W`x`H` the canvas size, `px` device pixels per CSS pixel. */
  draw(ctx: Ctx, nowMs: number, W: number, H: number, px: number, reduce: boolean): void {
    const c = this.cut;
    if (!c) return;
    const dur = c.small ? DUR_SMALL : DUR;
    const t = (nowMs - c.born) / dur;
    if (t >= 1 || t < 0) {
      this.cut = null;
      return;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (reduce) {
      const a = Math.min(1, t / 0.15, (1 - t) / 0.3);
      ctx.globalAlpha = a;
      this.band(ctx, c, W, H, 0, nowMs, px);
      this.title(ctx, c, W, H, 1, px);
      ctx.restore();
      return;
    }
    // 1. impact frame: two frames of inverted ink, then a white flash bleeding out
    const ms = nowMs - c.born;
    if (!c.small && ms < 70) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      return;
    }
    // 2. dim the world, more in the middle of the cut
    const tin = clamp01(t / 0.16);
    const tout = clamp01((t - 0.8) / 0.2);
    const dim = (c.small ? 0.35 : 0.55) * easeOut(tin) * (1 - tout);
    ctx.fillStyle = `rgba(4,2,10,${dim})`;
    ctx.fillRect(0, 0, W, H);
    // radial burst lines from the centre (manga focus lines)
    if (!c.small) this.focusLines(ctx, W, H, c.born, (1 - tout) * easeOut(tin));
    // 3. the band: sweeps in from the left, hangs, leaves to the right
    const slide = tin < 1 ? (1 - easeOut(tin)) * -1.2 : tout > 0 ? easeIn(tout) * 1.2 : 0;
    this.band(ctx, c, W, H, slide, nowMs, px);
    // 4. the hero bursting out of the band (drifts slowly forward while it hangs)
    const f = bigFrame3d(c.hero, 'idle', 0, 'uf');
    if (f) {
      const bandH = H * (c.small ? 0.2 : 0.3);
      const k = (bandH * 1.75) / f.img.height;
      const drift = (t - 0.5) * W * 0.03;
      const hx = W * (c.small ? 0.2 : 0.26) + slide * W + drift;
      const hy = H * 0.5 + bandH * 0.62;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // a glow halo behind the figure
      const g = ctx.createRadialGradient(hx, hy - bandH * 0.7, 0, hx, hy - bandH * 0.7, bandH * 1.1);
      g.addColorStop(0, hexA(c.glow, 0.55));
      g.addColorStop(1, hexA(c.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(hx - bandH * 1.2, hy - bandH * 1.9, bandH * 2.4, bandH * 2.4);
      ctx.drawImage(f.img, hx - HD_CENTER * 3 * k, hy - HD_FEET * 3 * k, f.img.width * k, f.img.height * k);
    }
    // 5. the name slams in (scales down from big), then holds
    const pop = 1 + 0.6 * (1 - easeOut(clamp01((t - 0.06) / 0.18)));
    ctx.globalAlpha = clamp01((t - 0.06) / 0.08) * (1 - tout);
    this.title(ctx, c, W, H, pop, px, slide * W * 0.4);
    ctx.restore();
  }

  private band(ctx: Ctx, c: Cut, W: number, H: number, slide: number, nowMs: number, px: number): void {
    const bh = H * (c.small ? 0.2 : 0.3);
    const cy = H * 0.5;
    const skew = bh * 0.35;
    const ox = slide * W;
    ctx.save();
    ctx.translate(ox, 0);
    ctx.beginPath();
    ctx.moveTo(-skew, cy - bh / 2);
    ctx.lineTo(W + skew, cy - bh / 2 - skew * 0.4);
    ctx.lineTo(W + skew, cy + bh / 2 - skew * 0.4);
    ctx.lineTo(-skew, cy + bh / 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, hexA(c.color, 0.95));
    g.addColorStop(0.55, hexA(shade(c.color, -0.45), 0.92));
    g.addColorStop(1, 'rgba(6,4,12,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    // speed lines streaking through the band
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const seed = (i * 7919) % 997;
      const y = cy - bh / 2 + (seed / 997) * bh;
      const len = W * (0.12 + ((seed * 13) % 100) / 400);
      const speed = 2.2 + (seed % 7) * 0.4;
      const x = W - ((((nowMs / 1000) * speed * W + seed * 37) % (W + len * 2)) - len);
      ctx.strokeStyle = i % 3 === 0 ? hexA(c.glow, 0.7) : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, (i % 4 === 0 ? 3 : 1.5) * px);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y - len * 0.02);
      ctx.stroke();
    }
    ctx.restore();
    // bright edges
    ctx.save();
    ctx.translate(ox, 0);
    ctx.strokeStyle = hexA(c.glow, 0.95);
    ctx.lineWidth = Math.max(2, 3 * px);
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 14 * px;
    ctx.beginPath();
    ctx.moveTo(-skew, cy - bh / 2);
    ctx.lineTo(W + skew, cy - bh / 2 - skew * 0.4);
    ctx.moveTo(-skew, cy + bh / 2);
    ctx.lineTo(W + skew, cy + bh / 2 - skew * 0.4);
    ctx.stroke();
    ctx.restore();
  }

  private title(ctx: Ctx, c: Cut, W: number, H: number, pop: number, px: number, dx = 0): void {
    const bh = H * (c.small ? 0.2 : 0.3);
    const x = W * (c.small ? 0.62 : 0.64) + dx;
    const y = H * 0.5 - bh * 0.02;
    const size = Math.min(bh * 0.42, (W * 0.5) / Math.max(6, c.title.length * 0.62)) * pop;
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, -0.08, -0.18, 1, 0, 0); // a forward lean
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(size)}px ${DISPLAY}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.strokeStyle = '#0a0612';
    ctx.strokeText(c.title, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, shade(c.glow, 0.5));
    g.addColorStop(1, c.glow);
    ctx.fillStyle = g;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 18 * px;
    ctx.fillText(c.title, 0, 0);
    ctx.shadowBlur = 0;
    if (c.sub) {
      ctx.font = `${Math.round(size * 0.3)}px ${DISPLAY}`;
      ctx.lineWidth = Math.max(2, size * 0.06);
      ctx.strokeText(c.sub, 0, size * 0.72);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.sub, 0, size * 0.72);
    }
    ctx.restore();
  }

  private focusLines(ctx: Ctx, W: number, H: number, born: number, a: number): void {
    if (a <= 0.01) return;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.hypot(W, H) * 0.6;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 72; i++) {
      const s = ((i * 7919 + born) % 1000) / 1000;
      const ang = (i / 72) * Math.PI * 2 + s * 0.05;
      const r0 = R * (0.55 + s * 0.25);
      const w = 0.004 + s * 0.008;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang - w) * R * 1.2, cy + Math.sin(ang - w) * R * 1.2);
      ctx.lineTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang + w) * R * 1.2, cy + Math.sin(ang + w) * R * 1.2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((ch) => ch + ch).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexA(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Lighter (k > 0, toward white) or darker (k < 0, toward black). */
function shade(hex: string, k: number): string {
  const [r, g, b] = rgb(hex);
  const f = (v: number): string =>
    Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))
      .toString(16)
      .padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}
