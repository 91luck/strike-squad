import type { PowerKind } from '@strikesquad/shared';
import { CINE_COLOR } from './astra-cine';
import { HD_CENTER, HD_FEET } from './hero-hd';
import { bigFrame3d } from './sprites3d';
import { bowShape } from './astra-art';

/**
 * Astra aahvaan: how an astra is called, told the way the old epics are told on screen.
 *
 *   1. aahvaan  (0 – 0.45 s)  the world dims round the caster, a shaft of light comes down on them, a yantra opens
 *                              behind them (turning rings, lotus petals, a ring of script-like marks) and light
 *                              spirals into the weapon until it glints like a star
 *   2. prayog   (0.45 – 0.6)  a white flash and one shaft of light leaves the weapon for the sky
 *   3. sahasra  (0.6 – 1.25)  high over the field the one becomes a thousand: a storm of the astra's own element comes
 *                              down across the enemy (fire comets, rain arrows, serpents, lightning, discs, golden
 *                              feathers, sun rays, mirror shards, a whirlwind, stars falling into a void)
 *   4. prahaar  (0.9 – 2.0)   where it lands: a dome of light, pillars, the ground glowing, and it fades
 *
 * Your own call opens with a close shot first, the way the epics are filmed (darshan, CLOSE seconds): the field goes
 * dark, your soldier fills the screen with the weapon raised to the sky, a great yantra turns behind them, light and
 * the astra's own element (flames, water, wind, serpents, lightning, a disc, sun rays, feathers, mirror shards,
 * stars) gather round the weapon until it blazes; a white cut, and the field story above plays on.
 *
 * No names, no text: the astra says what it is by what it does. Your own call gets the full show (letterbox bars,
 * the dimmed world, the flash); a squadmate's gets the yantra and the storm, smaller. The game never waits for it:
 * the astra's real effect (sim) has already started underneath, and the storm lands while it is still working.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

export type ShowKind = PowerKind | 'param';

const INVOKE = 0.45;
const RELEASE = 0.6;
const DUR = 2.0;
/** The close shot before your own call plays on the field (seconds). */
export const CLOSE = 0.75;

interface Show {
  kind: ShowKind;
  x: number;
  y: number;
  f: 1 | -1;
  born: number;
  mine: boolean;
  /** the caller's hero (the close shot draws them) */
  hero: number;
  /** shakes already given: release, impact */
  shook: number;
  seed: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ease = (t: number): number => 1 - (1 - t) ** 3;
/** 0 → 1 over [a, b] */
const span = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
/** up over [a, b], held, down over [c, d] */
const window4 = (t: number, a: number, b: number, c: number, d: number): number =>
  Math.min(span(t, a, b), 1 - span(t, c, d));

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Script-like marks for the yantra's outer ring: a head line and two or three strokes hanging from it. Not words. */
const GLYPHS: number[][][] = (() => {
  const r = rng(91);
  const out: number[][][] = [];
  for (let g = 0; g < 18; g++) {
    const strokes: number[][] = [[-0.5, -0.5, 0.5, -0.5]];
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const x0 = -0.4 + r() * 0.8;
      const curl = r() < 0.5;
      strokes.push(
        curl
          ? [x0, -0.5, x0 + (r() - 0.5) * 0.5, 0, x0 + (r() - 0.5) * 0.7, 0.5]
          : [x0, -0.5, x0 + (r() - 0.5) * 0.3, 0.5],
      );
    }
    out.push(strokes);
  }
  return out;
})();

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a: number): void {
  if (r <= 0 || a <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export class AstraShow {
  private list: Show[] = [];

  play(kind: ShowKind, x: number, y: number, f: 1 | -1, nowMs: number, mine: boolean, hero = 0): void {
    if (this.list.length > 4) this.list.shift();
    this.list.push({
      kind,
      x,
      y,
      f,
      born: nowMs,
      mine,
      hero,
      shook: 0,
      seed: (Math.floor(x) * 31 + nowMs) | 0,
    });
  }

  /** Seconds since the field part of a call began (your own call waits for its close shot). */
  private static fieldT(c: Show, nowMs: number): number {
    return (nowMs - c.born) / 1000 - (c.mine ? CLOSE : 0);
  }

  clear(): void {
    this.list = [];
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  /** How hard to shake now (release, then impact), once each, for your own call. */
  takeShake(nowMs: number): number {
    let s = 0;
    for (const c of this.list) {
      if (!c.mine) continue;
      const t = AstraShow.fieldT(c, nowMs);
      if (c.shook === 0 && t >= INVOKE) {
        c.shook = 1;
        s = Math.max(s, 6);
      }
      if (c.shook === 1 && t >= 0.95) {
        c.shook = 2;
        s = Math.max(s, 14);
      }
    }
    return s;
  }

  /** World space, over the fighters (the caller has the camera transform on). */
  drawWorld(
    ctx: Ctx,
    nowMs: number,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    hq: boolean,
  ): void {
    this.list = this.list.filter((c) => AstraShow.fieldT(c, nowMs) < DUR);
    for (const c of this.list) {
      const t = AstraShow.fieldT(c, nowMs);
      if (t < 0) continue;
      const col = CINE_COLOR[c.kind];
      const k = c.mine ? 1 : 0.7;
      const hx = c.x + c.f * 14;
      const hy = c.y - 28;
      ctx.save();

      // 1. the world dims round the caster (your own call only)
      if (c.mine) {
        const d = window4(t, 0, 0.18, 0.75, 1.3) * 0.62;
        if (d > 0.01) {
          const g = ctx.createRadialGradient(c.x, c.y - 30, 50, c.x, c.y - 30, Math.max(viewW, viewH) * 0.75);
          g.addColorStop(0, 'rgba(6,3,14,0)');
          g.addColorStop(0.35, `rgba(6,3,14,${d * 0.6})`);
          g.addColorStop(1, `rgba(6,3,14,${d})`);
          ctx.fillStyle = g;
          ctx.fillRect(camX, camY, viewW, viewH);
        }
      }
      ctx.globalCompositeOperation = 'lighter';

      // the shaft of light coming down on the caster
      const shaft = window4(t, 0, 0.15, 0.5, 0.9);
      if (shaft > 0.01) {
        const w = 70 * k * (0.6 + 0.4 * shaft);
        const g = ctx.createLinearGradient(c.x - w, 0, c.x + w, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, col.core);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.45 * shaft;
        ctx.fillStyle = g;
        ctx.fillRect(c.x - w, camY - 10, w * 2, c.y - camY + 10);
        ctx.globalAlpha = 1;
        glow(ctx, c.x, c.y, 90 * k, col.glow, 0.7 * shaft);
      }

      // the yantra behind the caster
      this.yantra(ctx, c, t, k, col.core, col.glow, nowMs);

      // light spiralling into the weapon, and the glint growing on it
      if (t < RELEASE) {
        const r = rng(c.seed);
        const n = hq ? 34 : 18;
        for (let i = 0; i < n; i++) {
          const a0 = r() * TAU;
          const d0 = (90 + r() * 110) * k;
          const lag = r() * 0.25;
          const u = ease(span(t, lag, lag + 0.3));
          if (u <= 0 || u >= 1) continue;
          const a = a0 + u * 2.4;
          const rr = d0 * (1 - u);
          const px = hx + Math.cos(a) * rr;
          const py = hy + Math.sin(a) * rr * 0.8;
          ctx.globalAlpha = Math.sin(u * Math.PI);
          ctx.fillStyle = i % 3 ? col.glow : col.core;
          ctx.beginPath();
          ctx.arc(px, py, 2 + (1 - u) * 2, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const g = ease(span(t, 0.05, INVOKE));
        star(ctx, hx, hy, (10 + 26 * g) * k, col.core, col.glow, nowMs, g);
      }

      // 2. prayog: one shaft of light leaves the weapon for the sky ahead
      const sky = { x: c.x + c.f * 150 * k, y: Math.max(camY + 30, c.y - 260) };
      if (t >= INVOKE - 0.05 && t < RELEASE + 0.2) {
        const u = ease(span(t, INVOKE - 0.05, RELEASE));
        const tipX = hx + (sky.x - hx) * u;
        const tipY = hy + (sky.y - hy) * u;
        const tail = Math.max(0, u - 0.35);
        const fade = 1 - span(t, RELEASE, RELEASE + 0.2);
        beam(
          ctx,
          hx + (sky.x - hx) * tail,
          hy + (sky.y - hy) * tail,
          tipX,
          tipY,
          6 * k,
          col.core,
          col.glow,
          fade,
        );
        glow(ctx, tipX, tipY, 40 * k, col.core, fade);
      }

      // 3. sahasra: the one becomes a thousand over the field
      const land = { x: c.x + c.f * 330 * k, y: c.y };
      if (t >= RELEASE - 0.05) {
        const burst = window4(t, RELEASE - 0.05, RELEASE + 0.05, RELEASE + 0.15, RELEASE + 0.45);
        glow(ctx, sky.x, sky.y, 130 * k, col.core, burst);
        ring(ctx, sky.x, sky.y, 30 + 160 * ease(span(t, RELEASE, RELEASE + 0.4)), col.glow, burst, 3);
        this.storm(ctx, c, t, k, sky, land, col.core, col.glow, nowMs, hq, camY);
      }

      // 4. prahaar: the dome of light where it lands
      const hit = span(t, 0.9, DUR);
      if (hit > 0 && hit < 1) {
        const a = 1 - hit;
        const R = (60 + 230 * ease(hit)) * k;
        glow(ctx, land.x, land.y - 20, R * 1.1, col.glow, a * 0.85);
        ring(ctx, land.x, land.y - 10, R, col.core, a, 5 * a + 1);
        ring(ctx, land.x, land.y - 10, R * 0.62, col.glow, a * 0.8, 3);
        // pillars rising from the ground
        const r = rng(c.seed + 7);
        for (let i = 0; i < 7; i++) {
          const px = land.x + (r() - 0.5) * R * 1.6;
          const ph = (120 + r() * 160) * k * Math.sin(Math.min(1, hit * 2.2) * Math.PI);
          const pw = 8 + r() * 10;
          const g = ctx.createLinearGradient(0, land.y, 0, land.y - ph);
          g.addColorStop(0, col.core);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = a * 0.75;
          ctx.fillStyle = g;
          ctx.fillRect(px - pw / 2, land.y - ph, pw, ph);
        }
        ctx.globalAlpha = 1;
        // the ground glowing along the strike
        const g = ctx.createLinearGradient(land.x - R * 1.4, 0, land.x + R * 1.4, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, col.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = g;
        ctx.fillRect(land.x - R * 1.4, land.y - 6, R * 2.8, 12);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  /** Screen space: the cinema bars and the flashes, for your own call. */
  drawScreen(ctx: Ctx, nowMs: number, W: number, H: number, reduce: boolean): void {
    for (const c of this.list) {
      if (!c.mine) continue;
      const raw = (nowMs - c.born) / 1000;
      const t = raw - CLOSE;
      const col = CINE_COLOR[c.kind];
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (raw < CLOSE + 0.12) {
        this.darshan(ctx, c, raw, W, H, nowMs, reduce);
        if (!reduce) {
          // the white cut back to the field
          const white = window4(raw, CLOSE - 0.07, CLOSE - 0.02, CLOSE + 0.01, CLOSE + 0.12);
          if (white > 0.01) {
            ctx.globalAlpha = white * 0.9;
            ctx.fillStyle = col.core;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
          }
        }
      }
      const bar = window4(raw, 0, 0.18, CLOSE + DUR - 0.45, CLOSE + DUR) * H * 0.085;
      if (bar > 0.5) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, bar);
        ctx.fillRect(0, H - bar, W, bar);
        // a thin gold line on each bar's edge
        ctx.fillStyle = 'rgba(253, 224, 140, 0.55)';
        ctx.fillRect(0, bar - 1, W, 1);
        ctx.fillRect(0, H - bar, W, 1);
      }
      if (!reduce) {
        const white = window4(t, INVOKE - 0.03, INVOKE + 0.02, INVOKE + 0.06, RELEASE + 0.1) * 0.3;
        if (white > 0.01) {
          ctx.globalAlpha = white;
          ctx.fillStyle = col.core;
          ctx.fillRect(0, 0, W, H);
        }
        const strike = window4(t, 0.92, 0.97, 1.0, 1.35) * 0.32;
        if (strike > 0.01) {
          ctx.globalAlpha = strike;
          ctx.fillStyle = col.glow;
          ctx.fillRect(0, 0, W, H);
        }
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ the close shot

  /**
   * Darshan: the soldier close up, weapon raised, the astra's power gathering. Screen space, `t` from the call.
   * It opens out of black (a cut, as in the films), pushes in slowly, and ends in a white cut back to the field.
   */
  private darshan(ctx: Ctx, c: Show, t: number, W: number, H: number, nowMs: number, reduce: boolean): void {
    const col = CINE_COLOR[c.kind];
    const fadeIn = span(t, 0, 0.08);
    // the shot ends in a cut: it holds until the white flash peaks, then is gone
    const out = t >= CLOSE - 0.01 ? 1 : 0;
    const a = fadeIn * (1 - out);
    if (a <= 0.01) return;
    const u = span(t, 0, CLOSE); // progress through the shot
    const S = Math.min(W, H * 1.9); // the shot's scale (phones are wide and short)
    ctx.save();
    // the field falls away into the dark, coloured by the astra
    ctx.globalAlpha = a;
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, W, H);
    const back = ctx.createRadialGradient(W * 0.42, H * 0.42, 0, W * 0.42, H * 0.42, Math.hypot(W, H) * 0.6);
    back.addColorStop(0, col.sky + '0.55)');
    back.addColorStop(0.55, col.sky + '0.18)');
    back.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, W, H);
    // the camera pushes in on the soldier
    const zoom = reduce ? 1 : 1 + 0.08 * ease(u);
    const h = Math.min(S * 0.42, H * 0.78); // the soldier's height on screen
    const cx = W * 0.38;
    const feet = H * 0.97;
    const cy = feet - h * 0.55; // chest
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    // light from above: god rays falling on the soldier
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const sx = cx + (i - 3) * S * 0.05 + Math.sin(nowMs / 700 + i) * S * 0.01;
      const w = S * (0.018 + (i % 3) * 0.01);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, col.core);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a * (0.1 + 0.06 * Math.sin(i * 1.7 + nowMs / 300)) * (0.5 + 0.5 * u);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx - w * 0.3, 0);
      ctx.lineTo(sx + w * 0.3, 0);
      ctx.lineTo(sx + w * 2.2, H);
      ctx.lineTo(sx - w * 2.2, H);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // the great yantra turning behind the soldier
    const R = Math.min(S * 0.24, H * 0.44) * (0.85 + 0.15 * ease(u));
    ctx.save();
    ctx.globalAlpha = a;
    this.yantra(
      ctx,
      { ...c, x: cx + S * 0.03, y: cy - h * 0.05 + 40 * (R / 92) },
      Math.min(0.5, 0.15 + u),
      R / 92,
      col.core,
      col.glow,
      nowMs,
    );
    ctx.restore();
    // the bow: drawn to the ear, aimed at the sky ahead; where its arrow's head burns
    const bx = cx + h * 0.26;
    const by = cy - h * 0.02;
    const aim = -0.8;
    const bs = h / 70;
    const pull = 4 + 9 * ease(span(u, 0, 0.5));
    const headL = (-3 - pull + 30) * bs;
    const tip = { x: bx + Math.cos(aim) * headL, y: by + Math.sin(aim) * headL };
    // the astra's element gathering round the soldier
    ctx.globalAlpha = a;
    this.element(ctx, c, u, cx, cy, tip, S, nowMs, col.core, col.glow, feet);
    ctx.globalCompositeOperation = 'source-over';
    // the soldier, lit from behind
    const f = bigFrame3d(c.hero, 'idle', 0, 'uf');
    if (f) {
      const k = h / (HD_FEET * 3);
      const x0 = cx - HD_CENTER * 3 * k;
      const y0 = feet - h;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = a;
      ctx.filter = `drop-shadow(0 0 ${Math.max(4, Math.round(S * 0.014))}px ${col.glow})`;
      ctx.drawImage(f.img, x0, y0, f.img.width * k, f.img.height * k);
      ctx.filter = 'none';
    }
    // the bow in the soldier's hands, glowing in the astra's light
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(bx, by);
    ctx.rotate(aim);
    ctx.scale(bs, bs);
    ctx.shadowColor = col.glow;
    ctx.shadowBlur = 18;
    bowShape(ctx, pull, col.glow, 1);
    ctx.restore();
    // the weapon blazing: light spiralling into the arrow's head, and a star on it, growing
    ctx.globalCompositeOperation = 'lighter';
    const r = rng(c.seed + 11);
    for (let i = 0; i < 40; i++) {
      const a0 = r() * TAU;
      const d0 = S * (0.12 + r() * 0.25);
      const lag = r() * 0.5;
      const q = ease(span(u, lag, lag + 0.45));
      if (q <= 0 || q >= 1) continue;
      const ang = a0 + q * 2.6;
      const rr = d0 * (1 - q);
      ctx.globalAlpha = a * Math.sin(q * Math.PI);
      ctx.fillStyle = i % 3 ? col.glow : col.core;
      ctx.beginPath();
      ctx.arc(
        tip.x + Math.cos(ang) * rr,
        tip.y + Math.sin(ang) * rr * 0.8,
        S * 0.004 + (1 - q) * S * 0.004,
        0,
        TAU,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const g2 = ease(span(u, 0.1, 0.95));
    star(ctx, tip.x, tip.y, S * (0.02 + 0.06 * g2), col.core, col.glow, nowMs, a * g2);
    ctx.restore();
  }

  /** The astra's element round the soldier in the close shot (screen space, u the shot's progress). */
  private element(
    ctx: Ctx,
    c: Show,
    u: number,
    cx: number,
    cy: number,
    tip: { x: number; y: number },
    S: number,
    nowMs: number,
    core: string,
    glowC: string,
    base: number,
  ): void {
    const r = rng(c.seed + 5);
    const sec = nowMs / 1000;
    switch (c.kind) {
      case 'agni': {
        // flames rising from the ground all round, and embers
        for (let i = 0; i < 26; i++) {
          const x = cx + (r() - 0.5) * S * 0.9;
          const h = S * (0.08 + r() * 0.18) * (0.4 + 0.6 * u) * (0.8 + 0.2 * Math.sin(sec * 9 + i));
          const w = S * (0.02 + r() * 0.025);
          const g = ctx.createLinearGradient(0, base, 0, base - h);
          g.addColorStop(0, '#ff5a0a');
          g.addColorStop(0.5, '#ffb020');
          g.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - w, base);
          ctx.quadraticCurveTo(x - w * 0.6 + Math.sin(sec * 7 + i) * w, base - h * 0.6, x, base - h);
          ctx.quadraticCurveTo(x + w * 0.6 + Math.sin(sec * 6 + i) * w, base - h * 0.6, x + w, base);
          ctx.fill();
        }
        for (let i = 0; i < 30; i++) {
          const ph = (r() + sec * (0.4 + r() * 0.4)) % 1;
          glow(ctx, cx + (r() - 0.5) * S * 0.9, base - ph * S * 0.55, S * 0.008, '#ffb347', 1 - ph);
        }
        break;
      }
      case 'jal': {
        // water rising in rings round the soldier, and spray
        for (let k = 0; k < 4; k++) {
          const yy = base - (k * 0.1 + u * 0.12) * S;
          ctx.strokeStyle = k % 2 ? core : glowC;
          ctx.lineWidth = S * 0.006;
          ctx.beginPath();
          ctx.ellipse(cx, yy, S * (0.2 - k * 0.025), S * 0.035, 0, sec * 3 + k, sec * 3 + k + Math.PI * 1.5);
          ctx.stroke();
        }
        for (let i = 0; i < 40; i++) {
          const ph = (r() + sec * 0.8) % 1;
          const ang = r() * TAU;
          glow(ctx, cx + Math.cos(ang) * S * 0.25 * ph, base - S * 0.3 * ph, S * 0.007, core, 1 - ph);
        }
        break;
      }
      case 'vayu': {
        for (let k = 0; k < 9; k++) {
          ctx.strokeStyle = k % 2 ? core : glowC;
          ctx.lineWidth = S * 0.004;
          ctx.beginPath();
          const rr = S * (0.12 + k * 0.03);
          const a0 = sec * (3 + k * 0.3) + k;
          ctx.ellipse(cx, cy - S * 0.05 - k * S * 0.02, rr, rr * 0.3, 0, a0, a0 + 2.2);
          ctx.stroke();
        }
        break;
      }
      case 'naga': {
        // two serpents of light coiling up round the soldier toward the weapon
        for (const side of [1, -1]) {
          ctx.strokeStyle = side > 0 ? core : glowC;
          ctx.lineWidth = S * 0.012;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let s = 0; s <= 40; s++) {
            const q = (s / 40) * u;
            const ang = q * 14 + side * 1.5 + sec * 2;
            const x = cx + Math.cos(ang) * S * 0.16 * (1 - q * 0.7);
            const y = base - q * (base - tip.y);
            if (s) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        break;
      }
      case 'vidyut': {
        for (let i = 0; i < 6; i++) {
          if (r() > 0.4 + u * 0.5) continue;
          const sx = cx + (r() - 0.5) * S * 0.9;
          ctx.strokeStyle = i % 2 ? core : glowC;
          ctx.lineWidth = S * 0.004;
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          let x = sx;
          for (let s = 1; s <= 7; s++) {
            x += (tip.x - x) * 0.3 + (Math.random() - 0.5) * S * 0.05;
            ctx.lineTo(x, (tip.y * s) / 7);
          }
          ctx.stroke();
        }
        break;
      }
      case 'chakram': {
        // the disc spinning above the weapon, growing
        const rad = S * (0.03 + 0.07 * ease(u));
        ctx.strokeStyle = core;
        ctx.lineWidth = S * 0.006;
        ctx.beginPath();
        ctx.arc(tip.x, tip.y - rad * 0.6, rad, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const q = sec * 14 + (i / 12) * TAU;
          ctx.beginPath();
          ctx.moveTo(tip.x + Math.cos(q) * rad, tip.y - rad * 0.6 + Math.sin(q) * rad);
          ctx.lineTo(
            tip.x + Math.cos(q + 0.3) * rad * 1.35,
            tip.y - rad * 0.6 + Math.sin(q + 0.3) * rad * 1.35,
          );
          ctx.stroke();
        }
        glow(ctx, tip.x, tip.y - rad * 0.6, rad * 2, glowC, 0.7);
        break;
      }
      case 'shyen': {
        // great wings of light opening behind the soldier
        for (const side of [1, -1])
          for (let i = 0; i < 9; i++) {
            const ang = -Math.PI / 2 + side * (0.35 + i * 0.13) * ease(u);
            const len = S * (0.22 + i * 0.012);
            ctx.strokeStyle = i % 2 ? core : glowC;
            ctx.lineWidth = S * 0.01;
            ctx.beginPath();
            ctx.moveTo(cx, cy - S * 0.12);
            ctx.quadraticCurveTo(
              cx + Math.cos(ang) * len * 0.5 + side * S * 0.04,
              cy - S * 0.12 + Math.sin(ang) * len * 0.5,
              cx + Math.cos(ang) * len,
              cy - S * 0.12 + Math.sin(ang) * len,
            );
            ctx.stroke();
          }
        break;
      }
      case 'maya': {
        for (let i = 0; i < 22; i++) {
          const ang = r() * TAU + sec * (r() - 0.5) * 2;
          const d = S * (0.15 + r() * 0.25) * (1 - 0.5 * u);
          ctx.save();
          ctx.translate(cx + Math.cos(ang) * d, cy - S * 0.08 + Math.sin(ang) * d * 0.7);
          ctx.rotate(sec * 2 + i);
          ctx.fillStyle = i % 2 ? core : glowC;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(-S * 0.012, -S * 0.02, S * 0.024, S * 0.04);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'singularity': {
        for (let i = 0; i < 50; i++) {
          const ang = r() * TAU + sec * 1.5;
          const d = S * (0.05 + r() * 0.4) * (1 - ((sec * 0.5 + r()) % 1));
          glow(ctx, tip.x + Math.cos(ang) * d, tip.y + Math.sin(ang) * d * 0.7, S * 0.006, core, 0.9);
        }
        break;
      }
      default: {
        // tej, param: the sun's rays behind the soldier
        ctx.save();
        ctx.translate(cx, cy - S * 0.1);
        ctx.rotate(sec * 0.3);
        for (let i = 0; i < 24; i++) {
          ctx.rotate(TAU / 24);
          const g = ctx.createLinearGradient(0, 0, 0, -S * 0.5);
          g.addColorStop(0, core);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.globalAlpha = 0.25 * (0.4 + 0.6 * u);
          ctx.beginPath();
          ctx.moveTo(-S * 0.01, 0);
          ctx.lineTo(S * 0.01, 0);
          ctx.lineTo(S * 0.03, -S * 0.5 * (0.6 + 0.4 * u));
          ctx.lineTo(-S * 0.03, -S * 0.5 * (0.6 + 0.4 * u));
          ctx.fill();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  // ------------------------------------------------------------------ pieces

  private yantra(ctx: Ctx, c: Show, t: number, k: number, core: string, glowC: string, nowMs: number): void {
    const a = window4(t, 0, 0.3, 0.75, 1.25);
    if (a <= 0.01) return;
    const R = 92 * k * (0.55 + 0.45 * ease(span(t, 0, 0.35)));
    const cx = c.x;
    const cy = c.y - 40 * k;
    const spin = (nowMs / 1000) * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.92);
    glow(ctx, 0, 0, R * 1.25, glowC, a * 0.35);
    ctx.globalAlpha = a;
    ctx.strokeStyle = core;
    ctx.lineCap = 'round';
    // the outer rings
    ctx.lineWidth = 2;
    for (const rr of [R, R * 0.93, R * 0.62]) {
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
    // the ring of script-like marks between the two outer rings, turning
    ctx.lineWidth = 1.4;
    const n = GLYPHS.length;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + spin;
      ctx.save();
      ctx.rotate(ang);
      ctx.translate(0, -R * 0.78);
      const s = R * 0.13;
      for (const st of GLYPHS[i] as number[][]) {
        ctx.beginPath();
        ctx.moveTo((st[0] as number) * s, (st[1] as number) * s);
        if (st.length === 6)
          ctx.quadraticCurveTo(
            (st[2] as number) * s,
            (st[3] as number) * s,
            (st[4] as number) * s,
            (st[5] as number) * s,
          );
        else ctx.lineTo((st[2] as number) * s, (st[3] as number) * s);
        ctx.stroke();
      }
      ctx.restore();
    }
    // lotus petals, turning the other way
    ctx.save();
    ctx.rotate(-spin * 1.4);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = glowC;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.2);
      ctx.quadraticCurveTo(R * 0.13, -R * 0.42, 0, -R * 0.6);
      ctx.quadraticCurveTo(-R * 0.13, -R * 0.42, 0, -R * 0.2);
      ctx.stroke();
    }
    ctx.restore();
    // the six-pointed star of two triangles at the heart
    ctx.save();
    ctx.rotate(spin * 0.5);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = core;
    for (const off of [0, Math.PI]) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const q = off + (i / 3) * TAU - Math.PI / 2;
        const px = Math.cos(q) * R * 0.38;
        const py = Math.sin(q) * R * 0.38;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private storm(
    ctx: Ctx,
    c: Show,
    t: number,
    k: number,
    sky: { x: number; y: number },
    land: { x: number; y: number },
    core: string,
    glowC: string,
    nowMs: number,
    hq: boolean,
    camY: number,
  ): void {
    const r = rng(c.seed + 3);
    const N = Math.round((hq ? 64 : 30) * (c.mine ? 1 : 0.5));
    const spread = 300 * k;
    // the element's cloud or sun over the field
    const top = Math.max(camY + 20, sky.y - 30);
    const cloud = window4(t, RELEASE, RELEASE + 0.15, 1.2, 1.6);
    if (c.kind === 'jal' || c.kind === 'vidyut') {
      for (let i = 0; i < 6; i++) {
        const cx = land.x + (i - 2.5) * 70 * k;
        glow(ctx, cx, top + Math.sin(i * 2.1) * 10, 80 * k, c.kind === 'jal' ? '#1e3a5f' : '#334155', cloud);
      }
    }
    if (c.kind === 'tej' || c.kind === 'param') glow(ctx, sky.x, top + 20, 110 * k, core, cloud);
    if (c.kind === 'singularity') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = cloud;
      ctx.fillStyle = '#05010d';
      ctx.beginPath();
      ctx.arc(land.x, land.y - 120 * k, 34 * k, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ring(ctx, land.x, land.y - 120 * k, 44 * k, glowC, cloud, 4);
    }
    for (let i = 0; i < N; i++) {
      const delay = RELEASE + (i / N) * 0.5 + r() * 0.06;
      const fly = 0.28 + r() * 0.1;
      const u = span(t, delay, delay + fly);
      const tx = land.x + (r() - 0.5) * spread * 2;
      const ty = land.y - r() * 6;
      // from the burst in the sky (or the cloud above the target for rain and lightning)
      const fromCloud = c.kind === 'jal' || c.kind === 'vidyut';
      const sx = fromCloud ? tx + (r() - 0.5) * 40 : sky.x + (r() - 0.5) * 50;
      const sy = fromCloud ? top : sky.y + (r() - 0.5) * 30;
      const after = t - (delay + fly);
      if (u <= 0) continue;
      if (u >= 1) {
        // a spark where it struck
        if (after < 0.18) glow(ctx, tx, ty - 6, 26 * k, core, 1 - after / 0.18);
        continue;
      }
      const e = c.kind === 'singularity' ? u * u : ease(u);
      let px = sx + (tx - sx) * e;
      let py = sy + (ty - sy) * e;
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      switch (c.kind) {
        case 'naga': {
          // a serpent of light weaving down
          ctx.strokeStyle = i % 2 ? core : glowC;
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let s = 0; s <= 8; s++) {
            const q = Math.max(0, e - s * 0.025);
            const w = Math.sin(q * 18 + i + nowMs / 90) * 9;
            const qx = sx + dx * q - ny * w;
            const qy = sy + dy * q + nx * w;
            if (s) ctx.lineTo(qx, qy);
            else ctx.moveTo(qx, qy);
          }
          ctx.stroke();
          glow(ctx, px, py, 10, core, 1);
          break;
        }
        case 'vidyut': {
          if (r() < 0.35) break;
          ctx.strokeStyle = i % 2 ? core : glowC;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          const steps = 6;
          for (let s = 1; s <= steps; s++) {
            const q = (s / steps) * Math.min(1, e * 1.6);
            ctx.lineTo(sx + dx * q + (s < steps ? (r() - 0.5) * 26 : 0), sy + dy * q);
          }
          ctx.stroke();
          px = sx + dx * Math.min(1, e * 1.6);
          py = sy + dy * Math.min(1, e * 1.6);
          glow(ctx, px, py, 18, core, 1);
          break;
        }
        case 'chakram': {
          const rad = 7 + (i % 3);
          ctx.strokeStyle = core;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, TAU);
          ctx.stroke();
          const sp = nowMs / 40 + i;
          ctx.beginPath();
          for (let s = 0; s < 4; s++) {
            const q = sp + (s / 4) * TAU;
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(q) * rad * 1.5, py + Math.sin(q) * rad * 1.5);
          }
          ctx.stroke();
          glow(ctx, px, py, 16, glowC, 0.8);
          break;
        }
        case 'vayu': {
          ctx.strokeStyle = core;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let s = 0; s < 14; s++) {
            const q = s / 14;
            const ang = q * 9 + nowMs / 120 + i;
            const rr = 4 + q * 14;
            const qx = px + Math.cos(ang) * rr - nx * q * 30;
            const qy = py + Math.sin(ang) * rr * 0.5 - ny * q * 30;
            if (s) ctx.lineTo(qx, qy);
            else ctx.moveTo(qx, qy);
          }
          ctx.stroke();
          break;
        }
        case 'maya': {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(nowMs / 150 + i);
          ctx.fillStyle = i % 2 ? core : glowC;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(0, -9);
          ctx.lineTo(5, 6);
          ctx.lineTo(-4, 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
          break;
        }
        case 'tej':
        case 'param': {
          // a ray of the sun striking down
          const tail = Math.max(0, e - 0.5);
          beam(ctx, sx + dx * tail, sy + dy * tail, px, py, 4, core, glowC, 1);
          break;
        }
        default: {
          // a shaft of light, an arrow of the element: fire comets for agni, golden feathers for the eagle,
          // starlight for the void
          const L = c.kind === 'agni' ? 64 : c.kind === 'singularity' ? 24 : 50;
          const w = c.kind === 'agni' ? 6.5 : 3.5;
          beam(ctx, px - nx * L, py - ny * L, px, py, w, core, glowC, 1);
          glow(ctx, px, py, c.kind === 'agni' ? 26 : 14, c.kind === 'agni' ? '#ff7a1a' : glowC, 0.9);
          if (c.kind === 'shyen') {
            ctx.strokeStyle = glowC;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px - nx * L, py - ny * L);
            ctx.lineTo(px - nx * (L + 8) - ny * 6, py - ny * (L + 8) + nx * 6);
            ctx.moveTo(px - nx * L, py - ny * L);
            ctx.lineTo(px - nx * (L + 8) + ny * 6, py - ny * (L + 8) - nx * 6);
            ctx.stroke();
          }
          break;
        }
      }
    }
  }
}

function ring(ctx: Ctx, x: number, y: number, r: number, color: string, a: number, w: number): void {
  if (a <= 0.01 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A shaft of light from (x0,y0) to its head at (x1,y1). */
function beam(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  core: string,
  glowC: string,
  a: number,
): void {
  if (a <= 0.01) return;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, glowC);
  g.addColorStop(1, core);
  ctx.globalAlpha = Math.min(1, a);
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  ctx.lineWidth = w * 2.2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = core;
  ctx.lineWidth = Math.max(1, w * 0.6);
  ctx.beginPath();
  ctx.moveTo(x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** The weapon's glint: a four-pointed star, turning. */
function star(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  core: string,
  glowC: string,
  nowMs: number,
  a: number,
): void {
  if (a <= 0.01) return;
  glow(ctx, x, y, r * 1.6, glowC, a);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(nowMs / 400);
  ctx.globalAlpha = a;
  ctx.fillStyle = core;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const q = (i / 8) * TAU;
    const rr = i % 2 ? r * 0.18 : r;
    if (i) ctx.lineTo(Math.cos(q) * rr, Math.sin(q) * rr);
    else ctx.moveTo(Math.cos(q) * rr, Math.sin(q) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
