import {
  ATTACK,
  ATTACK_WINDUP,
  BEAM,
  BEAM_SEC,
  BOSS_RULES,
  BULLET_KINDS,
  GAME_CONFIG,
  POWER_KINDS,
  darknessAt,
  MISSION_1,
  Tile,
  WEAPON_KINDS,
  heroOf,
  isBoss,
  isSagaId,
  levelHeight,
  styleOf,
  levelWidth,
  tileAt,
  type EnemySnapshot,
  type LevelDef,
  type PowerKind,
  type PlayerSnapshot,
  type SimEvent,
  type Snapshot,
} from '@strikesquad/shared';
import {
  POWER_COLOR,
  drawAltar,
  drawFields,
  drawFireWall,
  drawFlame,
  drawFx,
  drawPowerPickup,
  isPowerKind,
} from './power-fx';
import type { Pose as PredictedPose } from './predict';
import {
  CENTER_X,
  FACTION_LOOKS,
  SAGA_HOSTS,
  FEET_Y,
  RUN_FRAMES,
  aimFrom,
  charFrame,
  droneSprite,
  heroLook,
  heroPortrait,
  medkitSprite,
  turretBarrel,
  tone,
  turretBase,
  weaponCrate,
  type Look,
  type Pose,
} from './sprites';
import {
  ZONES,
  buildProps,
  canopyLayer,
  groundTile,
  industryLayer,
  platformTile,
  propSprite,
  ridgeLayer,
  themedLayer,
  zoneAt,
  type Prop,
  type ZoneId,
  type ZoneStyle,
} from './world-art';
import {
  drawThemedColossus,
  drawThemedGunship,
  drawThemedWalker,
  litLayer,
  type BossKit,
  type LitBox,
} from './boss-art';
import {
  BOW_MS,
  FIRE_RUN_MS,
  drawAlight,
  drawAshram,
  drawBow,
  drawBurnGround,
  drawFireRun,
  drawSlungBow,
  drawTwister,
  type FireRun,
} from './astra-art';
import { AstraCinema } from './astra-cine';
import { FxSprites, type FxName } from './fx';
import { cloudHD, drawSunShafts, shadeLayer } from './backdrop-hd';
import { propHD } from './prop-hd';
import { BLOCK, TILE_HD_LIP, groundTileHD, platformTileHD, scale2x } from './tile-hd';
import { HD, HD_CENTER, HD_FEET, hdCanvases } from './hero-hd';
import { ASURA_LOOKS, drawAsuraFlyer, drawAsuraKing, drawAsuraWalker, type AsuraLook } from './asura-art';
import {
  RULE_COLOR,
  drawArrow,
  drawBossCast,
  drawChakra,
  drawDazed,
  drawImmune,
  drawMeteor,
  drawOrb,
  drawSerpent,
  drawSpark,
} from './astra-fx';
import {
  SHOT_COLORS,
  drawCritter,
  drawFlyer,
  drawGate,
  drawOrdnance,
  drawShield,
  drawTotem,
} from './theme-art';

/**
 * Side-view renderer: layered parallax backdrop, pixel-art tiles and props, sprite characters, additive-light effects
 * and screen-space HUD extras (mission strip, friend arrows). The level is one screen (576 px) tall; on short phone
 * screens the camera zooms in and also follows vertically so characters stay big enough to read.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  add: boolean;
  grav: number;
  grow: number;
  /** Drawn as this effect sprite (Kenney CC0 atlas) when it has loaded; otherwise as a plain dot. */
  tex?: FxName;
  /** Sprite variant, turn (radians) and turn speed (radians a second). */
  v?: number;
  /** Play the sprite's variants in order over the particle's life, as a flipbook, instead of fading it. */
  anim?: boolean;
  rot?: number;
  spin?: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

const T = GAME_CONFIG.tile;
const P = GAME_CONFIG.player;
const FULL_H = 576;
const BULLET_COLOR = ['#ffe066', '#ff9f43', '#fff3a3', '#5ee7ff'];
const FONT = '"Chakra Petch", system-ui, sans-serif';
const DISPLAY = '"Russo One", "Chakra Petch", system-ui, sans-serif';
const TICK_SEC = 1 / GAME_CONFIG.tickRate;
const KIND = (k: number): (typeof BULLET_KINDS)[number] => BULLET_KINDS[k] ?? 'shot';

interface Trail {
  x: number;
  y: number;
  f: 1 | -1;
  hero: number;
  pose: Pose;
  life: number;
}

interface Slash {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
  color: string;
}

export interface DrawOptions {
  meId: string;
  nowMs: number;
  reduceMotion: boolean;
  /** Predicted pose for the local soldier (overrides the interpolated one). */
  mine: PredictedPose | null;
}

/** One line per weather: how many particles, how they move and look. Data, not code paths. */
const AMBIENT: Record<
  ZoneStyle['ambient'],
  {
    count: number;
    vx: number;
    vy: number;
    spread: number;
    sway: number;
    w: number;
    h: number;
    color: string;
    alpha: number;
    glow: boolean;
    /** Hover low over the ground (fireflies) instead of filling the screen. */
    low: boolean;
  }
> = {
  fireflies: {
    count: 14,
    vx: 0,
    vy: 0,
    spread: 20,
    sway: 8,
    w: 2,
    h: 2,
    color: '#c6f36b',
    alpha: 0.8,
    glow: true,
    low: true,
  },
  embers: {
    count: 14,
    vx: 0,
    vy: -35,
    spread: 20,
    sway: 8,
    w: 2,
    h: 2,
    color: '#ff8c42',
    alpha: 0.8,
    glow: true,
    low: false,
  },
  snow: {
    count: 40,
    vx: -12,
    vy: 45,
    spread: 24,
    sway: 14,
    w: 3,
    h: 3,
    color: '#ffffff',
    alpha: 0.85,
    glow: false,
    low: false,
  },
  dust: {
    count: 26,
    vx: -70,
    vy: 6,
    spread: 30,
    sway: 6,
    w: 3,
    h: 2,
    color: '#f1d7a6',
    alpha: 0.55,
    glow: false,
    low: false,
  },
  rain: {
    count: 46,
    vx: -40,
    vy: 520,
    spread: 10,
    sway: 0,
    w: 1,
    h: 9,
    color: '#9fb6e8',
    alpha: 0.45,
    glow: false,
    low: false,
  },
  motes: {
    count: 22,
    vx: 0,
    vy: -8,
    spread: 16,
    sway: 10,
    w: 2,
    h: 2,
    color: '#a5b4fc',
    alpha: 0.7,
    glow: true,
    low: false,
  },
};

/**
 * High-definition art from this many screen pixels per world pixel. The smallest portal game frames (821x462,
 * and 800x450 on phones) sit at about 1.13-1.16; they must get the same art as the bigger frames.
 */
const HD_FROM = 1.1;

/** Astras shot up into the clouds (the bow tilts to the sky for them). */
const SKY_ASTRAS: ReadonlySet<PowerKind> = new Set<PowerKind>(['varuna', 'garuda', 'pashupata']);

export class Renderer {
  /** Swapped for an offscreen context while a boss is drawn for tinting (demon / void missions). */
  private ctx: CanvasRenderingContext2D;
  private lvl: LevelDef = MISSION_1;
  private particles: Particle[] = [];
  /** Effect sprites: explosion fire, smoke, flashes, sparks, muzzle flames (see fx.ts). */
  private readonly fx = new FxSprites();
  private rings: Ring[] = [];
  private floats: FloatText[] = [];
  private ambient: Particle[] = [];
  private shakeMag = 0;
  private flashAlpha = 0;
  private flashColor = '#ff0000';
  private scale = 1;
  private dpr = 1;
  private viewW = 960;
  private viewH = FULL_H;
  private camX = 0;
  private camY = 0;
  private camReady = false;
  private lastDraw = 0;
  private reduce = false;
  private props: Prop[];
  /**
   * Backdrop resolution: 2 (high definition) when a world pixel covers at least HD_FROM screen pixels, else 1.
   * Silhouettes and their lit versions are cached per resolution; a resize that changes it rebuilds them.
   */
  private bgK = 1;
  /** Classic-resolution world (the `?hd=0` address flag): for slow machines and for measuring the HD cost. */
  private lowDetail =
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('hd') === '0';
  private readonly masks = new Map<string, HTMLCanvasElement>();
  private readonly litLayers = new Map<string, HTMLCanvasElement>();
  /** High-definition tiles (tile-hd.ts), built on first sight. */
  private readonly hdTiles = new Map<string, HTMLCanvasElement>();
  private readonly hdProps = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
  /** Art still to build ahead of time (queueWarm), run a little each frame. */
  private warm: (() => void)[] = [];
  private warmedAhead: ZoneId | null = null;
  private readonly tint = new Map<string, HTMLCanvasElement>();
  private readonly white = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
  private seenBullets = new Set<number>();
  private enemyPrevX = new Map<number, number>();
  /** Saga boss id → its look (found once from the arena it stands in). */
  private bossLooks = new Map<number, AsuraLook | null>();
  /** Astra apparitions (astra-cine.ts): the sigil, the sky, the creature each astra summons. */
  private cine = new AstraCinema();
  private trails: Trail[] = [];
  private slashes: Slash[] = [];
  private lastTrail = new Map<string, number>();
  private airJumpsSeen = new Map<string, number>();
  private styleFloats: { x: number; y: number; text: string; life: number; mine: boolean }[] = [];
  /** Astra effects that play out over time: rain curtains, wind gusts, the brahmastra pillar and dark sky. */
  private rains: { x0: number; x1: number; ground: number; life: number }[] = [];
  private winds: { x: number; y: number; f: 1 | -1; life: number }[] = [];
  /** Fire pillars running out behind an agni flame wall. */
  private fireRuns: FireRun[] = [];
  /** The bow in a hero's hands just after loosing an astra (by player id). */
  private bows = new Map<string, { born: number; kind: PowerKind }>();
  private pillar: { x: number; ground: number; life: number; strike: boolean } | null = null;
  private dark = 0;
  private darkTarget = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: { maxDpr?: number } = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
    this.ctx = ctx;
    this.fx.load();
    this.props = buildProps(this.lvl);
    this.resize();
  }

  get level(): LevelDef {
    return this.lvl;
  }

  /** Switch to another mission's map (props are rebuilt; tile and backdrop art is shared and cached). */
  setLevel(level: LevelDef): void {
    if (level === this.lvl) return;
    this.lvl = level;
    this.bossLooks.clear();
    this.props = buildProps(level);
    this.queueWarm();
    this.ambient = [];
    this.reset();
  }

  // ------------------------------------------------------------ effects (driven by sim events)

  reset(): void {
    this.particles = [];
    this.rings = [];
    this.floats = [];
    this.flashAlpha = 0;
    this.shakeMag = 0;
    this.camReady = false;
    this.seenBullets.clear();
    this.enemyPrevX.clear();
    this.portals = [];
    this.glowBurst = [];
    this.cine.clear();
    this.trails = [];
    this.slashes = [];
    this.styleFloats = [];
    this.rains = [];
    this.winds = [];
    this.fireRuns = [];
    this.bows.clear();
    this.pillar = null;
    this.dark = this.darkTarget = 0;
    this.lastTrail.clear();
    this.airJumpsSeen.clear();
  }

  private add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.particles.length > 700) this.particles.shift();
    const life = p.life ?? 0.4;
    this.particles.push({
      vx: 0,
      vy: 0,
      size: 3,
      color: '#fff',
      add: false,
      grav: 0,
      grow: 0,
      max: life,
      ...p,
      life,
    });
  }

  /** A bullet striking something: a small pixel-art hit flash plus a few sparks. */
  impact(x: number, y: number, color: string, reduce: boolean): void {
    this.add({ x, y, life: 0.15, size: 32, color: '#fff', add: true, tex: 'hit', anim: true });
    this.spark(x, y, color, 4, reduce, 120);
  }

  spark(x: number, y: number, color: string, n: number, reduce: boolean, speed = 160): void {
    const count = reduce ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random());
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 30,
        life: 0.18 + Math.random() * 0.25,
        color,
        size: 2 + Math.random() * 2,
        add: true,
        grav: 500,
      });
    }
    // a few glints that turn as they fly
    for (let i = 0; i < Math.ceil(count / 4); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * 0.5 * Math.random();
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.16 + Math.random() * 0.16,
        color,
        size: 9 + Math.random() * 7,
        add: true,
        grav: 200,
        grow: -30,
        tex: 'star',
        v: Math.floor(Math.random() * 3),
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
      });
    }
  }

  /**
   * A saga trooper falls: its body breaks into motes of its host's colour that rise like a released spirit, with
   * a bright pop at the heart. Reads as "defeated asura", not "exploding robot".
   */
  dissolve(x: number, y: number, reduce: boolean): void {
    const n = isSagaId(this.lvl.id) ? Number(this.lvl.id.slice(6)) : 0;
    const color = SAGA_HOSTS[n - 1]?.soldier.accent ?? '#fde047';
    this.add({ x, y, life: 0.14, size: 40, color: '#ffffff', add: true, grow: -220 });
    this.add({ x, y, life: 0.4, size: 22, color, add: true, grow: 120, tex: 'magic', v: 0, rot: 0, spin: 3 });
    this.rings.push({ x, y, r: 6, life: 0.3, max: 0.3, color });
    for (let i = 0; i < (reduce ? 8 : 26); i++) {
      this.add({
        x: x + (Math.random() - 0.5) * 22,
        y: y + (Math.random() - 0.5) * 34,
        vx: (Math.random() - 0.5) * 50,
        vy: -60 - Math.random() * 110,
        life: 0.6 + Math.random() * 0.6,
        size: 3 + Math.random() * 4,
        color: i % 3 ? color : '#ffffff',
        add: true,
        grav: -40,
        grow: -3,
      });
    }
  }

  explosion(x: number, y: number, big: boolean, reduce: boolean, radius = 0): void {
    if (radius > 0 && radius < 30) {
      // small pop (a missile shot down)
      this.spark(x, y, '#ffd166', 10, reduce, 200);
      this.rings.push({ x, y, r: 4, life: 0.25, max: 0.25, color: '#fff3b0' });
      return;
    }
    const k = reduce ? 0.35 : 1;
    const rnd = Math.random;
    if (radius >= 40) this.rings.push({ x, y, r: radius * 0.6, life: 0.3, max: 0.3, color: '#ff9f1c' });
    // the white-hot core
    this.add({ x, y, life: 0.12, size: big ? 90 : 46, color: '#fff6d5', add: true, grow: -200 });
    // a hand-drawn pixel blast (Warped City), at a whole multiple of its size so its pixels stay square
    this.add({ x, y, life: 0.42, size: big ? 128 : 64, color: '#fff', add: false, tex: 'blast', anim: true });
    this.add({
      x,
      y,
      life: 0.22,
      size: big ? 70 : 38,
      color: '#fff',
      add: true,
      grow: 160,
      tex: 'flash',
      v: Math.floor(rnd() * 6),
      rot: rnd() * 6,
    });
    // billowing fire: rough puffs of flame that swell, turn and burn out
    for (let i = 0; i < (big ? 22 : 9) * k; i++) {
      const a = rnd() * Math.PI * 2;
      const s = (big ? 150 : 90) * rnd();
      this.add({
        x: x + Math.cos(a) * 6,
        y: y + Math.sin(a) * 6,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.3 + rnd() * 0.35,
        size: (big ? 30 : 18) + rnd() * 14,
        color: '#ff9f1c',
        add: true,
        grav: -60,
        grow: big ? 40 : 24,
        tex: 'fire',
        v: Math.floor(rnd() * 9),
        rot: rnd() * 6,
        spin: (rnd() - 0.5) * 3,
      });
    }
    // embers
    const fire = ['#fff3b0', '#ffd166', '#ff9f1c', '#f3722c'];
    for (let i = 0; i < (big ? 18 : 8) * k; i++) {
      const a = rnd() * Math.PI * 2;
      const s = (big ? 260 : 150) * (0.4 + rnd());
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        life: 0.3 + rnd() * 0.4,
        size: 2 + rnd() * 2,
        color: fire[Math.floor(rnd() * fire.length)] as string,
        add: true,
        grav: 300,
      });
    }
    // then dark smoke that rises and spreads
    for (let i = 0; i < (big ? 12 : 5) * k; i++)
      this.add({
        x: x + (rnd() - 0.5) * 24,
        y: y + (rnd() - 0.5) * 12,
        vx: (rnd() - 0.5) * 50,
        vy: -30 - rnd() * 50,
        life: 0.9 + rnd() * 0.7,
        size: (big ? 28 : 18) + rnd() * 12,
        color: 'rgba(55,50,55,0.55)',
        grav: -20,
        grow: 26,
        tex: 'smoke',
        v: Math.floor(rnd() * 8),
        rot: rnd() * 6,
        spin: (rnd() - 0.5) * 1.5,
      });
    // debris
    for (let i = 0; i < (big ? 18 : 8) * k; i++) {
      const a = -Math.PI * rnd();
      const s = 120 + rnd() * 220;
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.6 + rnd() * 0.5,
        size: 3,
        color: '#2b2622',
        grav: 900,
      });
    }
    this.rings.push({ x, y, r: 6, life: 0.35, max: 0.35, color: big ? '#ffd166' : '#ffe8a3' });
    if (!reduce) this.shakeMag = Math.max(this.shakeMag, big ? 16 : 5);
  }

  /** Portals and cracking ground where wave enemies are about to appear (Sim 'portal' events). */
  private portals: { x: number; y: number; how: 0 | 1; born: number; until: number }[] = [];

  portal(x: number, y: number, how: 0 | 1, nowMs: number): void {
    const ms = GAME_CONFIG.bossMoves.portalSec * 1000 + 250;
    this.portals.push({ x, y, how, born: nowMs, until: nowMs + ms });
  }

  /** A boss vanishing into (out) or stepping out of a burst of its aura. */
  blink(x: number, y: number, color: string, reduce: boolean): void {
    this.spark(x, y, color, reduce ? 6 : 26, reduce, 260);
    this.glowBurst.push({ x, y, color, until: performance.now() + 260 });
  }
  private glowBurst: { x: number; y: number; color: string; until: number }[] = [];

  private drawPortals(nowMs: number): void {
    if (!this.portals.length && !this.glowBurst.length) return;
    const ctx = this.ctx;
    this.portals = this.portals.filter((p) => p.until > nowMs);
    for (const p of this.portals) {
      const k = Math.min(1, (nowMs - p.born) / 500);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (p.how === 0) {
        // A swirling ring standing on the floor.
        const r = 10 + 24 * k;
        ctx.translate(p.x, p.y - 30);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = i === 1 ? 'rgba(255,255,255,0.8)' : 'rgba(192,132,252,0.85)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            Math.max(1, r * 0.55 - i * 4),
            Math.max(1, r - i * 5),
            0,
            nowMs / 150 + i,
            nowMs / 150 + i + 4.6,
          );
          ctx.stroke();
        }
        ctx.restore();
        this.glow(p.x, p.y - 30, r + 10, 'rgba(168,85,247,0.45)');
      } else {
        // Cracks spreading over the ground, light leaking out.
        ctx.strokeStyle = 'rgba(253,186,116,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (i / 4) * Math.PI;
          ctx.moveTo(p.x, p.y - 2);
          ctx.lineTo(p.x + Math.cos(a) * 28 * k, p.y - 2 + Math.sin(a) * 6 * k);
        }
        ctx.stroke();
        ctx.restore();
        this.glow(p.x, p.y - 4, 14 + 16 * k, 'rgba(251,146,60,0.5)');
        if (!this.reduce && Math.random() < 0.5)
          this.add({
            x: p.x + (Math.random() - 0.5) * 30,
            y: p.y - 4,
            vy: -60,
            life: 0.5,
            size: 4,
            color: 'rgba(168,162,158,0.8)',
            grow: 6,
          });
      }
    }
    const now = performance.now();
    this.glowBurst = this.glowBurst.filter((g) => g.until > now);
    for (const g of this.glowBurst) this.glow(g.x, g.y, 70 * ((g.until - now) / 260), g.color);
  }

  floatText(x: number, y: number, text: string, color: string): void {
    this.floats.push({ x, y, text, color, life: 1.1 });
    if (this.floats.length > 30) this.floats.shift();
  }

  flash(color: string, strength = 0.25): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, strength);
  }

  shake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  // ------------------------------------------------------------ layout

  resize(): void {
    const max = this.opts.maxDpr ?? 2;
    this.dpr = Math.min(max, window.devicePixelRatio || 1);
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    // Short screens (phones in landscape): zoom in, so a soldier is ~45 px tall instead of ~25.
    this.viewH = h < 520 ? 400 : FULL_H;
    // Upright phones (console layout, a near-square view): zoom out a little so ~460 px of world fit across.
    if (h > w * 0.7) this.viewH = Math.min(FULL_H, Math.max(this.viewH, Math.round((460 * h) / w)));
    this.scale = this.canvas.height / this.viewH;
    this.viewW = this.canvas.width / this.scale;
    this.ctx.imageSmoothingEnabled = false;
    const k = this.scale >= HD_FROM && !this.lowDetail ? 2 : 1;
    if (k !== this.bgK) {
      this.bgK = k;
      this.masks.clear();
      this.litLayers.clear();
      this.queueWarm();
    }
  }

  /** A high-definition ground tile for its place in the noise patch (see tile-hd.ts BLOCK). */
  private hdGround(zone: ZoneId, top: boolean, bx: number, by: number): HTMLCanvasElement {
    const key = `${zone}|${top}|${bx}|${by}`;
    let img = this.hdTiles.get(key);
    if (!img) {
      const seed = zone.length * 7 + zone.charCodeAt(0);
      this.hdTiles.set(key, (img = groundTileHD(ZONES[zone], seed, top, (bx * 3 + by) % 4, bx, by)));
    }
    return img;
  }

  private hdPlatform(kind: ZoneStyle['plat'], v: number): HTMLCanvasElement {
    const key = `plat|${kind}|${v}`;
    let img = this.hdTiles.get(key);
    if (!img) this.hdTiles.set(key, (img = platformTileHD(kind, v)));
    return img;
  }

  /**
   * Builds the level's high-definition art ahead of time, a few milliseconds a frame (see `draw`), so walking
   * into a new zone does not stall on painting its backdrop and tiles: each zone's lit layers and tiles.
   */
  private queueWarm(): void {
    this.warm = [];
    if (this.bgK < 2 || typeof document === 'undefined') return;
    const zones: ZoneId[] = [];
    for (let c = 0; c < this.level.cols; c += 8) {
      const z = zoneAt(this.lvl, c * T);
      if (!zones.includes(z)) zones.push(z);
    }
    zones.forEach((id, i) => {
      const z = ZONES[id];
      // backdrops (big) for the first two zones only; later ones are warmed as the camera nears them
      if (i < 2) this.warmBackdrop(id);
      for (const top of [true, false])
        for (let by = 0; by < BLOCK; by++)
          this.warm.push(() => {
            for (let bx = 0; bx < BLOCK; bx++) this.hdGround(id, top, bx, by);
          });
      this.warm.push(() => {
        this.hdPlatform(z.plat, 0);
        this.hdPlatform(z.plat, 1);
      });
    });
  }

  /** Queues the three lit backdrop layers of a zone for ahead-of-time building (once per zone). */
  private warmBackdrop(id: ZoneId): void {
    const z = ZONES[id];
    this.warm.push(() => this.lit('far', z.far, z, false));
    this.warm.push(() => this.lit('far2', tone(z.far, -0.15), z, false));
    this.warm.push(() => this.lit(z.layer, z.mid, z, true));
  }

  /** A backdrop silhouette at the current backdrop resolution. */
  private mask(name: string): HTMLCanvasElement {
    const key = `${name}@${this.bgK}`;
    let m = this.masks.get(key);
    if (m) return m;
    const k = this.bgK;
    if (name === 'far') m = ridgeLayer(1, 0.5, 120, true, k);
    else if (name === 'far2') m = ridgeLayer(4, 0.62, 80, false, k);
    else if (name === 'canopy') m = canopyLayer(7, k);
    else if (name === 'industry') m = industryLayer(3, k);
    else if (name === 'dunes') m = ridgeLayer(9, 0.8, 46, false, k);
    else m = themedLayer(name as Parameters<typeof themedLayer>[0], 31 + name.length, k);
    this.masks.set(key, m);
    // a silhouette is only needed while its lit version is built: keep a few (each is a screen-sized canvas)
    if (this.masks.size > 3) this.masks.delete(this.masks.keys().next().value as string);
    return m;
  }

  /** A silhouette lit as painted scenery for the current zone (backdrop-hd.ts), cached (a few at a time). */
  private lit(name: string, color: string, z: ZoneStyle, near: boolean): HTMLCanvasElement {
    const rim = z.moon ? '#b8c8ff' : tone(z.sun, 0.15);
    const key = `${name}|${color}|${rim}|${this.bgK}`;
    let t = this.litLayers.get(key);
    if (t) {
      this.litLayers.delete(key);
      this.litLayers.set(key, t);
      return t;
    }
    const texture = name === 'canopy' || name === 'pines' ? 'leaf' : name === 'industry' ? 'none' : 'rock';
    t = shadeLayer(this.mask(name), {
      color,
      rim,
      haze: z.fog,
      hazeAmt: near ? 0.5 : 1,
      texture,
      k: this.bgK,
    });
    this.litLayers.set(key, t);
    if (this.litLayers.size > 6) this.litLayers.delete(this.litLayers.keys().next().value as string);
    return t;
  }

  private enemyCanvas: HTMLCanvasElement | null = null;
  /** The off-screen layer saga enemies are drawn on before their tint (same size as the screen). */
  private pixelCanvas: HTMLCanvasElement | null = null;
  private sky: HTMLCanvasElement | null = null;
  private skyKey = '';
  private grade: HTMLCanvasElement | null = null;
  private maya: HTMLCanvasElement | null = null;
  private gradeKey = '';
  /** Pixel layers kept between frames (see `pixelated`'s `keep`), by key. */
  private readonly kept = new Map<string, { c: HTMLCanvasElement; frame: number; x: number; y: number }>();
  private frameNo = 0;

  // ---- quality governor: the game must stay smooth on slow machines and with a full squad of eight
  /**
   * 0 = full detail. 1 = a boss's picture is redrawn every second frame and sun shafts are off. 2 = also the
   * classic-resolution world and a boss redraw every third frame. Only ever steps down, so it cannot flicker.
   */
  quality: 0 | 1 | 2 = 0;
  /** Smoothed real time between frames (ms), for the governor and for tests. */
  frameMs = 16;
  private lastFrameAt = 0;
  private slowFor = 0;
  private readonly forceHd =
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('hd') === '1';

  /**
   * Watches the real frame time and steps the detail down when the machine cannot keep up: slower than about
   * 38 frames a second for two seconds running drops one level. `?hd=1` turns this off (for screenshots).
   */
  private govern(): void {
    this.frameNo++;
    const now = performance.now();
    const d = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (d <= 0 || d > 250) return; // first frame, or the tab was in the background
    this.frameMs += (d - this.frameMs) * 0.1;
    if (this.forceHd || this.quality === 2) return;
    this.slowFor = this.frameMs > 26 ? this.slowFor + d : 0;
    if (this.slowFor < 2000) return;
    this.slowFor = 0;
    this.quality = (this.quality + 1) as 1 | 2;
    if (this.quality === 2 && !this.lowDetail) {
      this.lowDetail = true;
      this.resize();
    }
  }

  /**
   * Draws `draw` at world resolution (one canvas pixel per world pixel, the size of a sprite pixel) and blows it
   * up with hard edges: vector art (saga bosses, astra apparitions) then sits in the same pixel-art style as the
   * heroes, troopers and tiles. CrazyGames' quality guide asks for one consistent art style.
   */
  private pixelated(
    draw: () => void,
    blend: GlobalCompositeOperation = 'source-over',
    keep?: { key: string; x: number; y: number },
  ): void {
    const main = this.ctx;
    // one canvas pixel per sprite pixel: half a world pixel when the world is drawn in high definition
    const k = Math.min(1, this.bgK / Math.max(1, this.scale));
    const w = Math.max(1, Math.ceil(this.canvas.width * k));
    const h = Math.max(1, Math.ceil(this.canvas.height * k));
    const m = main.getTransform();
    const put = (img: HTMLCanvasElement, dx: number, dy: number): void => {
      main.save();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.imageSmoothingEnabled = false;
      main.globalCompositeOperation = blend;
      main.drawImage(img, Math.round(dx), Math.round(dy), w / k, h / k);
      main.restore();
    };
    // A kept layer (a boss): on a slow machine its picture is reused for a frame or two, moved along with its
    // subject, instead of being painted again. Painting a shaded boss is the dearest thing in a frame.
    let c: HTMLCanvasElement;
    if (keep) {
      const every = this.quality + 1;
      let e = this.kept.get(keep.key);
      if (e && e.c.width === w && e.c.height === h && every > 1 && this.frameNo - e.frame < every) {
        put(e.c, (keep.x - e.x) * m.a, (keep.y - e.y) * m.d);
        return;
      }
      if (!e) this.kept.set(keep.key, (e = { c: document.createElement('canvas'), frame: 0, x: 0, y: 0 }));
      e.frame = this.frameNo;
      e.x = keep.x;
      e.y = keep.y;
      c = e.c;
      if (this.kept.size > 4)
        for (const [key, v] of this.kept) if (this.frameNo - v.frame > 120) this.kept.delete(key);
    } else c = this.pixelCanvas ?? (this.pixelCanvas = document.createElement('canvas'));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const lctx = c.getContext('2d');
    if (!lctx) {
      draw();
      return;
    }
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, w, h);
    lctx.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, m.e * k, m.f * k);
    this.ctx = lctx;
    try {
      draw();
    } finally {
      this.ctx = main;
    }
    put(c, 0, 0);
  }

  private enemyLayer(): HTMLCanvasElement {
    const c = this.enemyCanvas ?? (this.enemyCanvas = document.createElement('canvas'));
    if (c.width !== this.canvas.width || c.height !== this.canvas.height) {
      c.width = this.canvas.width;
      c.height = this.canvas.height;
    }
    return c;
  }

  /** World x at the left edge of the screen (tests). */
  get cameraX(): number {
    return this.camX;
  }

  // ------------------------------------------------------------ frame

  draw(s: Snapshot, o: DrawOptions): void {
    const ctx = this.ctx;
    this.reduce = o.reduceMotion;
    // a little ahead-of-time art building each frame (about 4 ms at most)
    const t0 = performance.now();
    while (this.warm.length && performance.now() - t0 < 4) this.warm.shift()?.();
    const dt = this.lastDraw ? Math.min(0.1, (o.nowMs - this.lastDraw) / 1000) : 0;
    this.lastDraw = o.nowMs;
    this.govern();
    const players = o.mine
      ? s.players.map((p) =>
          p.id === o.meId && p.st === 0 && o.mine
            ? ({
                ...p,
                x: o.mine.x,
                y: o.mine.y,
                vx: o.mine.vx,
                vy: o.mine.vy,
                g: o.mine.g ? 1 : 0,
                f: o.mine.f,
                c: o.mine.c ? 1 : 0,
                dsh: o.mine.dsh,
                sld: o.mine.sld,
                aj: o.mine.aj,
              } as PlayerSnapshot)
            : p,
        )
      : s.players;
    const me = players.find((p) => p.id === o.meId);
    this.updateCamera(me, players, dt, s);
    this.spawnShotEffects(s);

    const shake = this.shakeMag > 0.3 && !o.reduceMotion;
    const sx = shake ? (Math.random() - 0.5) * this.shakeMag : 0;
    const sy = shake ? (Math.random() - 0.5) * this.shakeMag : 0;
    this.shakeMag *= Math.pow(0.002, dt);

    ctx.imageSmoothingEnabled = false;
    this.drawBackdrop(o.nowMs);
    ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      Math.round((-this.camX + sx) * this.scale),
      Math.round((-this.camY + sy) * this.scale),
    );
    this.drawWater(o.nowMs);
    if (this.cine.active)
      this.pixelated(() =>
        this.cine.drawBack(this.ctx, o.nowMs, this.camX, this.camY, this.viewW, this.viewH),
      );
    if (this.lvl.fields.length) drawFields(ctx, this.lvl.fields, this.camX, this.viewW, o.nowMs);
    this.drawProps(false);
    this.drawTiles(s, o.nowMs);
    this.drawRests(o.nowMs);
    this.drawCheckpoints(s, o.nowMs);
    this.drawPickups(s, o.nowMs);
    this.drawPortals(o.nowMs);
    if (s.fx.some((f) => f.k === 0) || this.fireRuns.length)
      this.pixelated(() => {
        for (const f of s.fx) if (f.k === 0) drawBurnGround(this.ctx, f.x, f.y, f.w, f.t, o.nowMs);
        this.fireRuns = this.fireRuns.filter((r) => o.nowMs - r.born < FIRE_RUN_MS);
        for (const r of this.fireRuns) drawFireRun(this.ctx, r, o.nowMs);
      });
    // Saga stages tint their asura host (cosmetic; browsers without canvas filters show the base colours).
    // Enemies are drawn onto one layer and the layer is filtered once: a filter per draw call is slow.
    if (this.lvl.tint && s.enemies.length && !isSagaId(this.lvl.id)) {
      const layer = this.enemyLayer();
      const lctx = layer.getContext('2d') as CanvasRenderingContext2D;
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(ctx.getTransform());
      lctx.imageSmoothingEnabled = false;
      this.ctx = lctx;
      try {
        for (const e of s.enemies) if (isBoss(e.k)) this.drawBossOf(e, s, o.nowMs);
        for (const e of s.enemies) if (!isBoss(e.k)) this.drawEnemy(e, o.nowMs);
      } finally {
        this.ctx = ctx;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = `hue-rotate(${this.lvl.tint}deg)`;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    } else {
      for (const e of s.enemies) if (isBoss(e.k)) this.drawBossOf(e, s, o.nowMs);
      for (const e of s.enemies) if (!isBoss(e.k)) this.drawEnemy(e, o.nowMs);
    }
    this.drawTrails(dt);
    this.drawBows(players, o.nowMs, true);
    for (const p of players) if (p.id !== o.meId) this.drawPlayer(p, false, o.nowMs);
    if (me) this.drawPlayer(me, true, o.nowMs);
    this.drawSlashes(dt);
    this.drawTelegraphs(s, players, o.nowMs);
    this.drawBullets(s, o.nowMs);
    if (s.fx.length)
      drawFx(
        ctx,
        s.fx.filter((f) => f.k === 1 || f.k === 2),
        o.nowMs,
      );
    if (s.fx.some((f) => f.k >= 3) || s.enemies.some((e) => e.fl & 1))
      this.pixelated(() => {
        for (const e of s.enemies)
          if (e.fl & 1 && !isBoss(e.k)) drawAlight(this.ctx, e.x, e.y, 40, o.nowMs, e.id);
        for (const f of s.fx)
          if (f.k >= 3) drawTwister(this.ctx, f.x, f.y, f.w, f.t, o.nowMs, f.k === 4, this.quality > 0);
      });
    this.drawBossAstras(s, o.nowMs);
    this.drawAstraFx(dt, o.nowMs);
    if (this.cine.active) this.pixelated(() => this.cine.drawFront(this.ctx, o.nowMs));
    this.drawBows(players, o.nowMs, false); // over the astra's own flash, so the bow is seen loosing it
    this.stepParticles(dt);
    this.drawProps(true);
    this.drawAmbient(dt, o.nowMs);
    this.drawFloats(dt);
    this.drawStyleFloats(dt);

    // screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawGrade();
    this.drawMaya(s, players);
    this.dark += (this.darkTarget - this.dark) * Math.min(1, dt * 5);
    if (this.dark > 0.01) {
      ctx.fillStyle = `rgba(12, 6, 24, ${0.6 * this.dark})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOffscreenMarkers(players, o.meId, o.nowMs);
    this.drawProgress(s, players, o.meId);
    if (this.flashAlpha > 0.01 && !o.reduceMotion) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
    this.flashAlpha *= Math.pow(0.002, dt);
  }

  /** Menu background: drift along the level with a few heroes running through. */
  drawScenery(nowMs: number): void {
    const ctx = this.ctx;
    const t0 = performance.now();
    while (this.warm.length && performance.now() - t0 < 4) this.warm.shift()?.();
    const W = levelWidth(this.level);
    this.camX = ((nowMs / 1000) * 45) % Math.max(1, W - this.viewW - 400);
    this.camY = FULL_H - this.viewH;
    ctx.imageSmoothingEnabled = false;
    this.drawBackdrop(nowMs);
    ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      Math.round(-this.camX * this.scale),
      Math.round(-this.camY * this.scale),
    );
    this.drawWater(nowMs);
    this.drawProps(false);
    this.drawTiles(null, nowMs);
    this.drawProps(true);
    this.drawAmbient(1 / 60, nowMs);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawGrade();
  }

  private updateCamera(
    me: PlayerSnapshot | undefined,
    players: PlayerSnapshot[],
    dt: number,
    s?: Snapshot,
  ): void {
    const W = levelWidth(this.level);
    let tx: number;
    let ty: number;
    if (me) {
      tx = me.x - this.viewW * 0.4 + (me.st === 0 ? me.f * 60 : 0);
      ty = me.y - this.viewH * 0.78;
    } else if (players.length) {
      const lead = players.reduce((a, b) => (b.x > a.x ? b : a));
      tx = lead.x - this.viewW * 0.5;
      ty = lead.y - this.viewH * 0.66;
    } else {
      tx = 0;
      ty = FULL_H;
    }
    // Zoomed-in phones: tilt the camera up to keep a flying boss in view.
    const ship = s?.enemies.find(
      (e) => e.k === 'gunship' && Math.abs(e.x - (tx + this.viewW / 2)) < this.viewW,
    );
    if (ship) {
      // Themed flyers (wings, a sun disc, a winged helm) reach higher than the army gunship's rotor.
      const reach = this.lvl.faction === 'army' ? 24 : 84;
      ty = Math.min(ty, ship.y - GAME_CONFIG.enemies.gunship.height - reach);
      if (me) ty = Math.max(ty, me.y - this.viewH + 56); // but never lose your own soldier
    }
    tx = Math.max(0, Math.min(W - this.viewW, tx));
    ty = Math.max(0, Math.min(FULL_H - this.viewH, ty));
    if (!this.camReady || Math.abs(tx - this.camX) > this.viewW) {
      this.camX = tx;
      this.camY = ty;
      this.camReady = true;
    } else {
      this.camX += (tx - this.camX) * Math.min(1, dt * 6);
      this.camY += (ty - this.camY) * Math.min(1, dt * 4);
    }
  }

  // ------------------------------------------------------------ backdrop

  private tinted(img: HTMLCanvasElement, color: string, key: string): HTMLCanvasElement {
    const k = `${key}|${color}`;
    let t = this.tint.get(k);
    if (t) {
      // Keep the cache small (each layer is a full-screen canvas): most recently used last, oldest evicted.
      this.tint.delete(k);
      this.tint.set(k, t);
    } else {
      t = document.createElement('canvas');
      t.width = img.width;
      t.height = img.height;
      const g = t.getContext('2d');
      if (g) {
        g.drawImage(img, 0, 0);
        if (hdCanvases.has(img)) hdCanvases.add(t);
        g.globalCompositeOperation = 'source-in';
        const grad = g.createLinearGradient(0, img.height * 0.3, 0, img.height);
        grad.addColorStop(0, color);
        grad.addColorStop(1, tone(color, -0.35));
        g.fillStyle = grad;
        g.fillRect(0, 0, t.width, t.height);
      }
      this.tint.set(k, t);
      if (this.tint.size > 6) this.tint.delete(this.tint.keys().next().value as string);
    }
    return t;
  }

  private drawBackdrop(nowMs: number): void {
    const ctx = this.ctx;
    const zid = zoneAt(this.lvl, this.camX + this.viewW / 2);
    const z = ZONES[zid];
    // the zone coming up: get its backdrop painted before the camera arrives
    if (this.bgK > 1) {
      const ahead = zoneAt(this.lvl, this.camX + this.viewW * 2);
      if (ahead !== zid && ahead !== this.warmedAhead) {
        this.warmedAhead = ahead;
        this.warmBackdrop(ahead);
      }
    }
    const H = this.canvas.height;
    const W = this.canvas.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The sky (gradient, sun and its glow) only changes with the zone and the camera's height, so it is painted
    // once into an opaque picture and copied each frame: two full-screen gradient fills a frame were the single
    // dearest thing in the whole scene on machines that draw without a graphics card.
    const sunX = W * 0.72;
    const sunY = Math.round((H * (0.42 + (this.camY / FULL_H) * 0.2)) / 6) * 6;
    const skyKey = `${zid}|${W}|${H}|${sunY}`;
    if (this.skyKey !== skyKey || !this.sky) {
      this.skyKey = skyKey;
      const c = this.sky ?? (this.sky = document.createElement('canvas'));
      c.width = W;
      c.height = H;
      const sg = c.getContext('2d', { alpha: false });
      if (sg) {
        const g = sg.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, z.sky[0]);
        g.addColorStop(0.55, z.sky[1]);
        g.addColorStop(1, z.sky[2]);
        sg.fillStyle = g;
        sg.fillRect(0, 0, W, H);
        if (!z.space) {
          const glow = sg.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.55);
          glow.addColorStop(0, tone(z.sun, 0.2));
          glow.addColorStop(z.moon ? 0.04 : 0.08, z.sun);
          glow.addColorStop(
            z.moon ? 0.05 : 0.1,
            z.moon ? 'rgba(170,190,255,0.18)' : 'rgba(255,220,160,0.35)',
          );
          glow.addColorStop(1, z.moon ? 'rgba(120,140,220,0)' : 'rgba(255,200,140,0)');
          sg.fillStyle = glow;
          sg.fillRect(0, 0, W, H);
        }
      }
    }
    ctx.drawImage(this.sky, 0, 0);
    if (z.space) {
      // Stars (fixed, deterministic, a little parallax) and a ringed planet instead of sun and clouds.
      for (let i = 0; i < 140; i++) {
        const sx =
          ((((i * 7919) % 1997) / 1997) * (W + 400) -
            ((this.camX * 0.04 * this.scale) % (W + 400)) +
            W +
            400) %
          (W + 400);
        const sy = (((i * 104729) % 1009) / 1009) * H * 0.8;
        const tw = 0.5 + 0.5 * Math.sin(nowMs / 500 + i);
        ctx.fillStyle = i % 9 === 0 ? `rgba(196,181,253,${tw})` : `rgba(255,255,255,${0.4 + tw * 0.5})`;
        const sz = i % 13 === 0 ? 3 : 2;
        ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
      }
      const px = W * 0.74;
      const py = H * 0.3;
      const pr = H * 0.13;
      const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#c4b5fd');
      pg.addColorStop(1, '#312e81');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(221,214,254,0.6)';
      ctx.lineWidth = Math.max(2, pr * 0.06);
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.7, pr * 0.35, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (z.skyFx === 'aurora') {
      // Northern lights: slow ribbons of green and violet across the top of the sky.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 3; band++) {
        const col = band === 1 ? 'rgba(167,139,250,0.16)' : 'rgba(74,222,128,0.18)';
        ctx.fillStyle = col;
        ctx.beginPath();
        const y0 = H * (0.12 + band * 0.08);
        ctx.moveTo(0, y0);
        for (let x = 0; x <= W; x += W / 24) {
          const yy = y0 + Math.sin(x / (W * 0.12) + nowMs / 2600 + band * 1.7) * H * 0.05;
          ctx.lineTo(x, yy);
        }
        for (let x = W; x >= 0; x -= W / 24) {
          const yy = y0 + H * 0.09 + Math.sin(x / (W * 0.1) + nowMs / 2100 + band) * H * 0.04;
          ctx.lineTo(x, yy);
        }
        ctx.fill();
      }
      ctx.restore();
    }
    if (!z.space && !this.reduce && this.quality === 0)
      drawSunShafts(ctx, sunX, sunY, H, z.moon ? '#b8c8ff' : tone(z.sun, 0.1), z.moon ? 0.5 : 1, nowMs);
    // world-anchored layers in parallax
    const s = this.scale;
    const layer = (img: HTMLCanvasElement, factor: number, yOff: number): void => {
      const off = (this.camX * factor) % 1024;
      const yy = Math.round((-this.camY * factor + yOff) * s);
      for (let x = -off; x < this.viewW + 1024; x += 1024)
        ctx.drawImage(img, Math.round(x * s), yy, Math.round(1024 * s) + 1, Math.round(FULL_H * s));
    };
    // clouds
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < (z.space ? 0 : 5); i++) {
      const cloud = cloudHD(i, this.bgK, z.moon ? '#c9d6ff' : tone(z.sun, 0.1));
      const span = this.viewW + 300;
      const x =
        ((((i * 397 - this.camX * 0.08 + (this.reduce ? 0 : nowMs / 1000) * (6 + i * 2)) % span) + span) %
          span) -
        220;
      ctx.drawImage(
        cloud,
        Math.round(x * s),
        Math.round((40 + i * 26 - this.camY * 0.08) * s),
        Math.round(220 * s),
        Math.round(70 * s),
      );
    }
    ctx.globalAlpha = 1;
    layer(this.lit('far', z.far, z, false), 0.12, 0);
    layer(this.lit('far2', tone(z.far, -0.15), z, false), 0.22, 30);
    // haze
    const fog = ctx.createLinearGradient(0, H * 0.45, 0, H);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(1, z.fog);
    ctx.fillStyle = fog;
    ctx.fillRect(0, Math.floor(H * 0.45), W, H - Math.floor(H * 0.45));
    layer(this.lit(z.layer, z.mid, z, true), 0.45, 40);
    if (z.skyFx === 'storm' && !this.reduce) {
      // A lightning storm: rare full-screen flashes with a forked bolt behind the skyline.
      const t = nowMs / 1000;
      const k = (Math.sin(t * 0.9) + Math.sin(t * 2.3 + 1)) / 2;
      if (k > 0.93) {
        ctx.fillStyle = `rgba(220,230,255,${(k - 0.93) * 4})`;
        ctx.fillRect(0, 0, W, H);
        const bx = W * (0.2 + ((Math.floor(t * 0.5) * 0.37) % 0.6));
        ctx.strokeStyle = 'rgba(240,245,255,0.9)';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        let y = 0;
        let x = bx;
        ctx.moveTo(x, y);
        for (let i = 0; i < 7; i++) {
          x += ((i * 37) % 23) - 11;
          y += H * 0.08;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    if (z.lights) {
      // blinking warning lights on the skyline
      const on = Math.floor(nowMs / 600) % 2 === 0;
      if (on) {
        ctx.fillStyle = '#ff3b3b';
        for (let i = 0; i < 6; i++) {
          const x =
            (((i * 173 - this.camX * 0.45) % (this.viewW + 200)) + this.viewW + 200) % (this.viewW + 200);
          ctx.fillRect(
            Math.round(x * s),
            Math.round((FULL_H - 300 + (i % 3) * 40 - this.camY * 0.45 + 40) * s),
            Math.ceil(3 * s),
            Math.ceil(3 * s),
          );
        }
      }
    }
  }

  private drawWater(nowMs: number): void {
    const ctx = this.ctx;
    const c0 = Math.max(0, Math.floor(this.camX / T) - 1);
    const c1 = Math.min(this.level.cols - 1, Math.ceil((this.camX + this.viewW) / T) + 1);
    const bottom = this.level.rows - 1;
    const top = (bottom - 1) * T + 6;
    for (let c = c0; c <= c1; c++) {
      if (tileAt(this.level, c, bottom) !== Tile.Empty) continue;
      const [wTop, wBottom] = ZONES[zoneAt(this.lvl, c * T)].water;
      const g = ctx.createLinearGradient(0, top, 0, levelHeight(this.level));
      g.addColorStop(0, wTop);
      g.addColorStop(1, wBottom);
      ctx.fillStyle = g;
      ctx.fillRect(c * T, top, T + 1, T * 2);
      const t = nowMs / 400;
      ctx.fillStyle = 'rgba(180, 240, 255, 0.55)';
      for (let k = 0; k < 4; k++)
        ctx.fillRect(c * T + k * 8, top + Math.round(Math.sin(t + c + k) * 2), 5, 2);
    }
  }

  // ------------------------------------------------------------ level

  private gateOpen(s: Snapshot | null, id: number): boolean {
    return s ? (s.gates & (1 << id)) !== 0 : false;
  }

  private visibleCols(): [number, number] {
    return [
      Math.max(0, Math.floor(this.camX / T) - 1),
      Math.min(this.level.cols - 1, Math.ceil((this.camX + this.viewW) / T) + 1),
    ];
  }

  private drawTiles(s: Snapshot | null, nowMs: number): void {
    const ctx = this.ctx;
    const L = this.level;
    const [c0, c1] = this.visibleCols();
    const hd = this.bgK > 1;
    // HD texels are half a world pixel: smooth them where that is smaller than a screen pixel
    const smooth = ctx.imageSmoothingEnabled;
    if (hd) {
      ctx.imageSmoothingEnabled = this.scale / 2 < 1;
      ctx.imageSmoothingQuality = 'high';
    }
    const lip = TILE_HD_LIP / 2;
    for (let c = c0; c <= c1; c++) {
      const zone: ZoneId = zoneAt(this.lvl, c * T);
      for (let r = 0; r < L.rows; r++) {
        const t = tileAt(L, c, r);
        if (t === Tile.Empty) continue;
        const x = c * T;
        const y = r * T;
        if (t === Tile.Solid) {
          const top = r > 0 && tileAt(L, c, r - 1) !== Tile.Solid;
          const v = (c * 7 + r * 3) % 4;
          if (hd) {
            // one picture per place in the noise patch (its variant follows from the place): at most 32 per zone
            const bx = c % BLOCK;
            const by = r % BLOCK;
            const img = this.hdGround(zone, top, bx, by);
            if (top) ctx.drawImage(img, x, y - lip, T, T + lip);
            else ctx.drawImage(img, 0, TILE_HD_LIP, img.width, img.width, x, y, T, T);
          } else ctx.drawImage(groundTile(zone, top, v), x, y);
          // soft shadow under overhangs and depth darkening
          if (!top && r > 0) {
            ctx.fillStyle = `rgba(0,0,0,${Math.min(0.35, 0.08 * (r - this.surfaceRow(c, r)))})`;
            ctx.fillRect(x, y, T, T);
          }
        } else if (t === Tile.OneWay) {
          if (hd) {
            ctx.drawImage(this.hdPlatform(ZONES[zone].plat, c % 2), x, y, T, T / 2);
          } else ctx.drawImage(platformTile(zone, c), x, y);
        }
      }
    }
    ctx.imageSmoothingEnabled = smooth;
    // gates (one door per gate column)
    for (const gdef of L.gates) {
      const x = gdef.col * T;
      if (x < this.camX - T * 2 || x > this.camX + this.viewW + T) continue;
      const open = this.gateOpen(s, gdef.id);
      const h = (gdef.rowBottom + 1) * T;
      if (gdef.fire) {
        if (!open) drawFireWall(ctx, gdef, nowMs);
        continue;
      }
      if (open) {
        ctx.fillStyle = '#2b2f36';
        ctx.fillRect(x + 2, 0, T - 4, 14);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(x + 10, 10, 12, 3);
        continue;
      }
      drawGate(ctx, ZONES[zoneAt(this.lvl, x)].gate, x, T, h, nowMs);
    }
  }

  /** Row of the surface above a buried tile (for the depth shading). */
  private surfaceRow(c: number, r: number): number {
    let top = r;
    while (top > 0 && tileAt(this.level, c, top - 1) === Tile.Solid) top--;
    return top;
  }

  private drawProps(front: boolean): void {
    const ctx = this.ctx;
    const smooth = ctx.imageSmoothingEnabled;
    if (this.bgK > 1) ctx.imageSmoothingEnabled = this.scale / 2 < 1;
    for (const p of this.props) {
      if (p.front !== front) continue;
      if (p.x < this.camX - 90 || p.x > this.camX + this.viewW + 90) continue;
      const img = propSprite(p.kind, p.v);
      const x = Math.round(p.x - img.width / 2);
      const y = p.y - img.height + (p.kind === 'tuft' ? 2 : 1);
      if (this.bgK > 1) {
        // painted in high definition (prop-hd.ts), or else smoothed to twice the detail with Scale2x
        let hd = propHD(p.kind, p.v) ?? this.hdProps.get(img);
        if (!hd) this.hdProps.set(img, (hd = scale2x(img)));
        ctx.drawImage(hd, x, y, img.width, img.height);
      } else ctx.drawImage(img, x, y);
    }
    ctx.imageSmoothingEnabled = smooth;
  }

  /** The rest stops in view: hearth, trident and flags, on one pixel layer. */
  private drawRests(nowMs: number): void {
    const L = this.lvl;
    const seen = L.rests.filter((r) => r.x1 > this.camX - 40 && r.x0 < this.camX + this.viewW + 40);
    if (!seen.length) return;
    const T = GAME_CONFIG.tile;
    this.pixelated(() => {
      for (const r of seen) {
        const x = r.x0 + T * 12;
        let row = 0;
        while (row < L.rows && tileAt(L, Math.floor(x / T), row) === Tile.Empty) row++;
        drawAshram(this.ctx, Math.round(x), row * T, (r.x1 - r.x0) / 2 - T, nowMs);
      }
    });
  }

  private drawCheckpoints(s: Snapshot, nowMs: number): void {
    const ctx = this.ctx;
    for (const cp of this.level.checkpoints) {
      if (cp.x < this.camX - 60 || cp.x > this.camX + this.viewW + 80) continue;
      const reached = s.cp > cp.id;
      ctx.fillStyle = '#1d1d22';
      ctx.fillRect(cp.x - 3, cp.y - 86, 6, 86);
      ctx.fillStyle = '#c7ced6';
      ctx.fillRect(cp.x - 2, cp.y - 86, 3, 86);
      ctx.fillStyle = '#f4c430';
      ctx.fillRect(cp.x - 4, cp.y - 90, 8, 5);
      const col = reached ? '#22c55e' : '#e5383b';
      for (let i = 0; i < 8; i++) {
        const wave = Math.round(Math.sin(nowMs / 160 + i * 0.7) * 2);
        ctx.fillStyle = i === 7 ? tone(col, -0.3) : col;
        ctx.fillRect(cp.x + 2 + i * 4, cp.y - 82 + wave, 4, 18 - i);
      }
      if (reached) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(34,197,94,0.18)';
        ctx.beginPath();
        ctx.arc(cp.x + 14, cp.y - 74, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else this.label('CHECKPOINT', cp.x + 14, cp.y - 100, '#fde68a', 11);
    }
  }

  /**
   * A hidden stash calls from above: a shaft of light over the perch that anyone below can see, sparkles, and once
   * a soldier is close, a bobbing key sign and a dotted line up the climb (step ledge, then perch).
   */
  private secretHint(x: number, y: number, s: Snapshot, nowMs: number): void {
    const ctx = this.ctx;
    const pulse = 0.6 + 0.4 * Math.sin(nowMs / 260);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, y - 220, 0, y + 10);
    g.addColorStop(0, 'rgba(253,224,71,0)');
    g.addColorStop(1, `rgba(253,224,71,${0.22 * pulse})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 10);
    ctx.lineTo(x + 14, y + 10);
    ctx.lineTo(x + 34, y - 220);
    ctx.lineTo(x - 34, y - 220);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (!this.reduce && Math.random() < 0.25)
      this.add({
        x: x + (Math.random() - 0.5) * 40,
        y: y - Math.random() * 120,
        vy: -20,
        life: 0.8,
        size: 2,
        color: '#fde047',
        add: true,
      });
    const near = s.players.some((p) => p.st === 0 && Math.abs(p.x - x) < 9 * T);
    if (!near) return;
    this.label('🗝 SECRET', x, y - 40 + Math.sin(nowMs / 200) * 4, '#fde047', 12);
    // the last jump: from the step ledge (four rows under the perch, three tiles to its left) up to the perch
    ctx.save();
    ctx.strokeStyle = `rgba(253,224,71,${0.35 + 0.3 * pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -nowMs / 40;
    ctx.beginPath();
    ctx.moveTo(x - 3 * T, y + 22 + 4 * T - 8);
    ctx.quadraticCurveTo(x - 3 * T, y - 20, x - 8, y + 10);
    ctx.stroke();
    ctx.restore();
  }

  private drawPickups(s: Snapshot, nowMs: number): void {
    const ctx = this.ctx;
    for (const pk of this.level.pickups) {
      if (pk.x < this.camX - 40 || pk.x > this.camX + this.viewW + 40) continue;
      const taken = (s.taken & (1 << pk.id)) !== 0;
      if (pk.respawn) drawAltar(ctx, pk.x, pk.y + 22, !taken);
      if (taken) continue;
      if (pk.secret) this.secretHint(pk.x, pk.y, s, nowMs);
      if (isPowerKind(pk.kind)) {
        const yy = pk.y - (pk.respawn ? 6 : 0) + Math.round(Math.sin(nowMs / 300 + pk.id) * 3);
        drawPowerPickup(ctx, pk.kind, pk.x, yy, pk.respawn, nowMs, (t, x, y, c, sz) =>
          this.label(t, x, y, c, sz),
        );
        continue;
      }
      const y = pk.y + Math.round(Math.sin(nowMs / 300 + pk.id) * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(pk.x, y, 2, pk.x, y, 26);
      glow.addColorStop(0, pk.kind === 'medkit' ? 'rgba(120,255,160,0.45)' : 'rgba(255,200,80,0.5)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(pk.x - 26, y - 26, 52, 52);
      ctx.restore();
      if (pk.kind === 'medkit') {
        const img = medkitSprite();
        ctx.drawImage(img, pk.x - img.width / 2, y - img.height / 2);
        this.label('MED-KIT', pk.x, y - 22, '#bbf7d0', 10);
      } else if (!isPowerKind(pk.kind)) {
        const w = GAME_CONFIG.weapons[pk.kind];
        const img = weaponCrate(w.letter, '#991b1b');
        ctx.drawImage(img, pk.x - img.width / 2, y - img.height / 2);
        this.label(w.label, pk.x, y - 22, '#fde68a', 10);
      }
    }
  }

  // ------------------------------------------------------------ actors

  private whiteOf(img: HTMLCanvasElement): HTMLCanvasElement {
    let w = this.white.get(img);
    if (!w) {
      w = document.createElement('canvas');
      w.width = img.width;
      w.height = img.height;
      const g = w.getContext('2d');
      if (g) {
        g.drawImage(img, 0, 0);
        if (hdCanvases.has(img)) hdCanvases.add(w);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w.width, w.height);
      }
      this.white.set(img, w);
    }
    return w;
  }

  /** Draw a sprite with its anchor at the feet, mirrored when facing left. */
  private blit(
    img: HTMLCanvasElement,
    x: number,
    y: number,
    facing: number,
    ox = CENTER_X,
    oy = FEET_Y,
  ): void {
    const ctx = this.ctx;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (hdCanvases.has(img)) {
      this.blitHD(img, x, y, facing);
      return;
    }
    if (facing >= 0) ctx.drawImage(img, rx - ox, ry - oy);
    else {
      ctx.save();
      ctx.translate(rx, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -ox, ry - oy);
      ctx.restore();
    }
  }

  /**
   * A high-definition hero frame (hero-hd.ts): drawn at 1/HD size, so it takes the classic sprite's place. On
   * screens where it ends up smaller than its own pixels it is smoothed, otherwise its pixels stay hard.
   */
  private blitHD(img: HTMLCanvasElement, x: number, y: number, facing: number): void {
    const ctx = this.ctx;
    const k = 1 / HD;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = this.scale * k < 1;
    ctx.imageSmoothingQuality = 'high';
    // snap to the screen's pixel grid at the sprite's own pixel size
    const step = 1 / Math.max(1, this.scale * k);
    const sx = Math.round(x / step) * step;
    const sy = Math.round(y / step) * step;
    ctx.save();
    ctx.translate(sx, sy);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -HD_CENTER * k, -HD_FEET * k, img.width * k, img.height * k);
    ctx.restore();
    ctx.imageSmoothingEnabled = smooth;
  }

  private shadow(x: number, y: number, w: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, w, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private poseOf(p: PlayerSnapshot, nowMs: number): { pose: Pose; frame: number } {
    if (p.ml > 0) return { pose: 'melee', frame: p.ml < 4 ? 0 : 1 };
    if (p.sld > 0) return { pose: 'slide', frame: 0 };
    if (p.dsh > 0) return { pose: 'dash', frame: 0 };
    if (p.c === 1) return { pose: 'crouch', frame: 0 };
    if (p.g === 0) {
      if (p.aj === 0 && p.vy < 120) return { pose: 'flip', frame: 0 };
      return { pose: p.vy < 0 ? 'jump' : 'fall', frame: 0 };
    }
    if (Math.abs(p.vx) > 1) return { pose: 'run', frame: Math.floor(Math.abs(p.x) / 9) % RUN_FRAMES };
    return { pose: 'idle', frame: Math.floor(nowMs / 450) % 2 };
  }

  /**
   * The bow (dhanush): slung on the back of every hero who carries an astra (`slung`, drawn behind the heroes),
   * and in the hands for a moment after one is loosed (drawn over them). One pixel layer for the whole squad.
   */
  private drawBows(players: PlayerSnapshot[], nowMs: number, slung: boolean): void {
    const todo: (() => void)[] = [];
    for (const p of players) {
      if (p.st !== 0 || p.x < this.camX - 80 || p.x > this.camX + this.viewW + 80) continue;
      const bow = this.bows.get(p.id);
      const k = bow ? (nowMs - bow.born) / BOW_MS : 2;
      if (bow && k >= 1) this.bows.delete(p.id);
      const held = POWER_KINDS[p.pw];
      if (slung) {
        if (k >= 1 && held && p.sld === 0)
          todo.push(() => drawSlungBow(this.ctx, p.x, p.y, p.f, POWER_COLOR[held][1]));
      } else if (bow && k >= 0 && k < 1)
        todo.push(() =>
          drawBow(this.ctx, p.x, p.y, p.f, k, POWER_COLOR[bow.kind][0], SKY_ASTRAS.has(bow.kind)),
        );
    }
    if (!todo.length) return;
    // on a slow machine the bows are drawn straight onto the frame: one layer less to put together
    if (this.quality > 0) todo.forEach((d) => d());
    else this.pixelated(() => todo.forEach((d) => d()));
  }

  private drawPlayer(p: PlayerSnapshot, isMe: boolean, nowMs: number): void {
    const ctx = this.ctx;
    if (p.x < this.camX - 80 || p.x > this.camX + this.viewW + 80) return;
    const hero = heroOf(p.hr ?? p.s);
    const look = heroLook(hero.id);
    if (p.st === 1) {
      this.drawKo(p, nowMs);
      return;
    }
    const { pose, frame } = this.poseOf(p, nowMs);
    const aim = p.ax === 0 && p.ay === 0 ? 'f' : aimFrom(p.ax, p.ay);
    const f = charFrame(`h${hero.id}`, look, pose, frame, aim);
    // Dash / slide after-images.
    if ((p.dsh > 0 || p.sld > 0) && !this.reduce) {
      const last = this.lastTrail.get(p.id) ?? 0;
      if (nowMs - last > 28) {
        this.lastTrail.set(p.id, nowMs);
        this.trails.push({ x: p.x, y: p.y, f: p.f, hero: hero.id, pose, life: 0.22 });
      }
    }
    // Double jump: a burst ring under the feet the moment it happens.
    const aj = this.airJumpsSeen.get(p.id) ?? 1;
    if (p.g === 0 && p.aj < aj) {
      this.rings.push({ x: p.x, y: p.y, r: 4, life: 0.3, max: 0.3, color: hero.color });
      this.spark(p.x, p.y, '#ffffff', 6, this.reduce, 90);
    }
    this.airJumpsSeen.set(p.id, p.aj);
    if (p.g === 1) this.shadow(p.x, p.y, pose === 'slide' ? 16 : 11);
    // Super ready: a pulsing ring at the feet. Overdrive: flames.
    if (p.ul >= GAME_CONFIG.ult.max) {
      const k = 0.5 + 0.5 * Math.sin(nowMs / 140);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255, 214, 90, ${0.35 + k * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, 14 + k * 4, 4 + k, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (p.od === 1) {
      this.glow(p.x, p.y - 18, 16, '#ff6b1a');
      if (!this.reduce && Math.random() < 0.6)
        this.add({
          x: p.x + (Math.random() - 0.5) * 18,
          y: p.y - Math.random() * 30,
          vy: -80 - Math.random() * 60,
          life: 0.35,
          size: 5,
          color: Math.random() < 0.5 ? '#ffb02e' : '#ff4d1a',
          add: true,
          grow: -10,
        });
    }
    const blink = p.iv === 1 && Math.floor(nowMs / 80) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.45;
    this.blit(f.img, p.x, p.y, p.f);
    ctx.globalAlpha = 1;

    if (p.dsh > 0) this.glow(p.x, p.y - 17, 12, hero.color);
    // Knife slash arc.
    if (p.ml > 0) this.drawSlashArc(p.x, p.y - 22, p.f, p.ml, hero.color);
    // muzzle flash while firing
    if (p.fi === 1 && p.ml === 0 && Math.floor(nowMs / 55) % 2 === 0) {
      const mx = p.x + f.muzzleX * p.f;
      const my = p.y + f.muzzleY;
      const mc = p.od === 1 ? '#ff6b1a' : WEAPON_KINDS[p.w] === 'laser' ? '#5ee7ff' : '#ffd166';
      this.glow(mx, my, 5, mc);
      // a flame tongue out of the barrel (the sprite points up: turn it to face the way the hero aims)
      this.add({
        x: mx + p.f * 6,
        y: my,
        life: 0.04,
        size: 16,
        color: mc,
        add: true,
        tex: 'muzzle',
        v: Math.floor(nowMs / 55) % 4,
        rot: (p.f * Math.PI) / 2,
      });
    }
    // name plate + health bar for friends; an arrow for you (your health is in the HUD)
    const top = p.y - (p.c === 1 || pose === 'slide' ? 38 : 50);
    if (isMe) {
      const bob = Math.round(Math.sin(nowMs / 220) * 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p.x - 5, top - 4 + bob);
      ctx.lineTo(p.x + 5, top - 4 + bob);
      ctx.lineTo(p.x, top + 2 + bob);
      ctx.fill();
      ctx.strokeStyle = '#120f17';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      this.nameTag(p.n, p.x, top - 8, hero.color);
      const w = 24;
      ctx.fillStyle = '#120f17';
      ctx.fillRect(p.x - w / 2 - 1, top - 1, w + 2, 5);
      ctx.fillStyle = p.hp > 30 ? '#4ade80' : '#ff4d4d';
      ctx.fillRect(p.x - w / 2, top, (w * Math.max(0, p.hp)) / P.maxHp, 3);
      if (p.ul >= GAME_CONFIG.ult.max) {
        ctx.fillStyle = '#facc15';
        ctx.fillRect(p.x - w / 2, top + 3, w, 1);
      }
    }
  }

  private drawSlashArc(x: number, y: number, f: 1 | -1, ml: number, color: string): void {
    const ctx = this.ctx;
    const t = Math.min(1, ml / 10);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    ctx.scale(f, 1);
    const a0 = -1.3 + t * 0.6;
    const a1 = 0.2 + t * 1.0;
    ctx.globalAlpha = 1 - t * 0.6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(6, 0, 30, a0, a1);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.45 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(6, 0, 26, a0, a1);
    ctx.stroke();
    ctx.restore();
  }

  private drawTrails(dt: number): void {
    const ctx = this.ctx;
    for (const t of this.trails) {
      t.life -= dt;
      if (t.life <= 0) continue;
      const hero = heroOf(t.hero);
      const img = charFrame(`h${hero.id}`, heroLook(hero.id), t.pose, 0, 'f').img;
      ctx.save();
      ctx.globalAlpha = (t.life / 0.22) * 0.45;
      this.blit(this.tinted(img, hero.color, `trail${hero.id}${t.pose}`), t.x, t.y, t.f);
      ctx.restore();
    }
    this.trails = this.trails.filter((t) => t.life > 0);
  }

  private drawSlashes(dt: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.slashes) {
      s.life -= dt;
      if (s.life <= 0) continue;
      const a = Math.min(1, s.life / 0.3);
      ctx.globalAlpha = a;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 8 * a;
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0);
      ctx.lineTo(s.x1, s.y1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * a;
      ctx.stroke();
    }
    ctx.restore();
    this.slashes = this.slashes.filter((s) => s.life > 0);
  }

  private drawKo(p: PlayerSnapshot, nowMs: number): void {
    const ctx = this.ctx;
    const hero = heroOf(p.hr ?? p.s);
    const f = charFrame(`h${hero.id}`, heroLook(hero.id), 'down', 0, 'f');
    ctx.globalAlpha = 0.6;
    this.shadow(p.x, p.y, 18);
    this.blit(f.img, p.x, p.y, 1);
    ctx.globalAlpha = 1;
    const cy = p.y - 34;
    if (p.dl >= 0) {
      // respawn countdown ring
      const frac = Math.max(0, Math.min(1, p.dl / GAME_CONFIG.player.respawnSec));
      ctx.fillStyle = 'rgba(18,15,23,0.75)';
      ctx.beginPath();
      ctx.arc(p.x, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hero.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, cy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac));
      ctx.stroke();
      this.label(String(Math.max(1, p.dl)), p.x, cy + 1, '#ffffff', 13);
    } else {
      const pulse = 0.55 + 0.45 * Math.sin(nowMs / 200);
      ctx.globalAlpha = pulse;
      this.label('KO', p.x, cy, '#f87171', 14);
      ctx.globalAlpha = 1;
    }
    this.nameTag(p.n, p.x, cy - 22, hero.color);
  }

  // ------------------------------------------------------------ enemies

  private trooper(e: EnemySnapshot, look: Look, key: string, nowMs: number, pose?: Pose): void {
    const prev = this.enemyPrevX.get(e.id) ?? e.x;
    const moving = Math.abs(e.x - prev) > 0.05;
    this.enemyPrevX.set(e.id, e.x);
    const ps: Pose = pose ?? (moving ? 'run' : 'idle');
    const f = charFrame(
      key,
      look,
      ps,
      ps === 'run' ? Math.floor(Math.abs(e.x) / 9) % RUN_FRAMES : Math.floor(nowMs / 500) % 2,
      'f',
    );
    if (ps !== 'fall') this.shadow(e.x, e.y, 11);
    this.blit(e.h === 1 ? this.whiteOf(f.img) : f.img, e.x, e.y, e.f);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = look.accent === '#ff2d2d' ? 'rgba(255,40,40,0.35)' : `${look.accent}55`;
    ctx.fillRect(Math.round(e.x + e.f * 4) - 3, Math.round(e.y) - 40, 7, 2);
    ctx.restore();
  }

  /** Elite troopers: a pulsing halo behind them and a star over their head. */
  private eliteAura(e: EnemySnapshot, color: string, nowMs: number): void {
    const pulse = 0.75 + 0.25 * Math.sin(nowMs / 140 + e.id);
    this.glow(e.x, e.y - 22, 34 * pulse, `${color}88`);
    this.label('★ ELITE', e.x, e.y - 58, '#fde047', 10);
    if (!this.reduce && Math.random() < 0.3)
      this.add({
        x: e.x + (Math.random() - 0.5) * 24,
        y: e.y - Math.random() * 40,
        vy: -50,
        life: 0.5,
        size: 3,
        color,
        add: true,
      });
  }

  private drawEnemy(e: EnemySnapshot, nowMs: number): void {
    if (e.x < this.camX - 80 || e.x > this.camX + this.viewW + 80) return;
    if (!(e.fl & 2)) {
      this.drawEnemyBody(e, nowMs);
      return;
    }
    // carried by a whirlwind: tumbling head over heels
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.x, e.y - 20);
    ctx.rotate(nowMs / 110 + e.id * 1.3);
    ctx.translate(-e.x, -(e.y - 20));
    this.drawEnemyBody(e, nowMs);
    ctx.restore();
  }

  private drawEnemyBody(e: EnemySnapshot, nowMs: number): void {
    const ctx = this.ctx;
    const flash = e.h === 1;
    const faction = this.lvl.faction;
    // Saga stages each field their own host (sprites.ts SAGA_HOSTS); keys keep their sprites apart.
    const sagaN = isSagaId(this.lvl.id) ? Number(this.lvl.id.slice(6)) : 0;
    const looks = SAGA_HOSTS[sagaN - 1] ?? FACTION_LOOKS[faction];
    const key = sagaN ? this.lvl.id : faction;
    if (e.el === 1) this.eliteAura(e, looks.soldier.accent, nowMs);
    if (e.k === 'soldier') this.trooper(e, looks.soldier, `${key}-enemy`, nowMs);
    else if (e.k === 'grenadier') {
      this.trooper(e, looks.gren, `${key}-gren`, nowMs);
      if (faction === 'army') {
        // grenade belt
        ctx.fillStyle = '#3f6212';
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(e.x - 6 + i * 4), Math.round(e.y - 16), 3, 3);
      }
    } else if (e.k === 'shield') {
      this.trooper(e, looks.shield, `${key}-shield`, nowMs);
      if (e.sh === 1) drawShield(ctx, faction, Math.round(e.x + e.f * 13), Math.round(e.y - 40), flash);
    } else if (e.k === 'jetpack') {
      const bob = Math.round(Math.sin(nowMs / 160 + e.id) * 2);
      const ey = e.y + bob;
      drawFlyer(ctx, faction, e.x, ey, e.f, nowMs);
      this.trooper({ ...e, y: ey }, looks.jet, `${key}-jet`, nowMs, 'fall');
    } else if (e.k === 'turret' && faction !== 'army') {
      drawTotem(ctx, faction, Math.round(e.x), Math.round(e.y), e.a / 100, flash);
    } else if (e.k === 'turret') {
      const base = turretBase();
      const barrel = turretBarrel();
      ctx.save();
      ctx.translate(Math.round(e.x), Math.round(e.y - 20));
      ctx.rotate(e.a / 100);
      ctx.drawImage(flash ? this.whiteOf(barrel) : barrel, 0, -4);
      ctx.restore();
      ctx.drawImage(flash ? this.whiteOf(base) : base, Math.round(e.x - 20), Math.round(e.y - 30));
    } else if (e.k === 'drone' && faction !== 'army') {
      const bob = Math.round(Math.sin(nowMs / 180 + e.id) * 3);
      drawCritter(ctx, faction, Math.round(e.x), Math.round(e.y + bob), e.f, flash, nowMs);
    } else if (e.k === 'drone') {
      const img = droneSprite(Math.floor(nowMs / 50));
      const bob = Math.round(Math.sin(nowMs / 180 + e.id) * 2);
      this.blit(flash ? this.whiteOf(img) : img, e.x, e.y + bob, e.f, 20, 20);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,40,0.25)';
      ctx.beginPath();
      ctx.arc(e.x + e.f * 4, e.y - 8 + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (e.hp < 100) {
      const y = e.y - (e.k === 'drone' ? 28 : e.k === 'turret' ? 38 : 54);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(e.x - 13, y - 1, 26, 5);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(e.x - 12, y, (24 * e.hp) / 100, 3);
    }
  }

  // ------------------------------------------------------------ bosses

  private drawBossOf(e: EnemySnapshot, s: Snapshot, nowMs: number): void {
    const w = GAME_CONFIG.enemies[e.k as 'walker'].width;
    if (e.x + w < this.camX - 60 || e.x - w > this.camX + this.viewW + 60) return;
    const faction = this.lvl.faction;
    if (faction === 'army') {
      this.drawBossBody(e, s, nowMs);
      return;
    }
    // Themed missions: same boss behaviour, a different creature (boss-art.ts).
    const kit = this.bossKit();
    const atk = this.atk(e);
    // Astra Saga: every boss has its own body (asura-art.ts).
    const look = this.sagaLook(e);
    if (look) {
      // Drawn at sprite resolution, so the asura shares the heroes' pixel-art style.
      this.pixelated(
        () => {
          const pk = this.bossKit();
          if (e.k === 'walker') drawAsuraWalker(pk, look, e, nowMs, atk);
          else if (e.k === 'gunship') drawAsuraFlyer(pk, look, e, nowMs, atk);
          else
            drawAsuraKing(
              pk,
              look,
              e,
              e.hp <= 0 || s.result === 'won',
              nowMs,
              atk,
              e.at === ATTACK.beamHigh ? BEAM.highY : BEAM.lowY,
            );
        },
        'source-over',
        { key: `boss${e.id}`, x: e.x, y: e.y },
      );
      return;
    }
    if (e.k === 'walker') drawThemedWalker(kit, faction, e, nowMs, atk);
    else if (e.k === 'gunship') drawThemedGunship(kit, faction, e, nowMs, atk);
    else
      drawThemedColossus(
        kit,
        faction,
        e,
        e.hp <= 0 || s.result === 'won',
        nowMs,
        atk,
        e.at === ATTACK.beamHigh ? BEAM.highY : BEAM.lowY,
      );
  }

  /** The saga look of a boss: the style of the arena it fights in (null outside the saga). */
  private sagaLook(e: EnemySnapshot): AsuraLook | null {
    if (!isSagaId(this.lvl.id)) return null;
    const known = this.bossLooks.get(e.id);
    if (known !== undefined) return known;
    // The boss arena nearest to it (a final boss stands past its arena's right edge, against the back wall).
    let a: (typeof this.lvl.arenas)[number] | undefined;
    let best = Infinity;
    for (const x of this.lvl.arenas) {
      if (!x.boss) continue;
      const d = e.x < x.left ? x.left - e.x : e.x > x.right ? e.x - x.right : 0;
      if (d < best) {
        best = d;
        a = x;
      }
    }
    const style = a ? styleOf(a.name) : null;
    const look = style ? (ASURA_LOOKS[style.id] ?? null) : null;
    this.bossLooks.set(e.id, look);
    return look;
  }

  /** The renderer's drawing helpers, handed to the themed boss painters. */
  private bossKit(): BossKit {
    return {
      ctx: this.ctx,
      reduce: this.reduce,
      glow: (x, y, r, c) => this.glow(x, y, r, c),
      add: (p) => this.add(p),
      warnIcon: (x, y, n) => this.warnIcon(x, y, n),
      sightLine: (x, y, a, l, k) => this.sightLine(x, y, a, l, k),
      shadowAt: (x, y, w, a) => this.shadowAt(x, y, w, a),
      label: (t, x, y, c, sz) => this.label(t, x, y, c, sz),
    };
  }

  private drawBossBody(e: EnemySnapshot, s: Snapshot, nowMs: number): void {
    if (e.k === 'walker') this.drawWarhound(e, nowMs);
    else if (e.k === 'gunship') this.drawVulture(e, nowMs);
    else this.drawFortress(e, s, nowMs);
  }

  /** Seconds into the current attack, and its wind-up length (0 when idle). */
  private atk(e: EnemySnapshot): { t: number; wind: number; telegraph: boolean } {
    if (!e.at) return { t: 0, wind: 0, telegraph: false };
    const t = e.tt * TICK_SEC;
    const wind = ATTACK_WINDUP[e.at] ?? 0;
    return { t, wind, telegraph: t < wind };
  }

  private warnIcon(x: number, y: number, nowMs: number): void {
    if (Math.floor(nowMs / 110) % 2 === 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#dc2626';
    ctx.strokeStyle = '#120f17';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 13);
    ctx.lineTo(x + 13, y + 10);
    ctx.lineTo(x - 13, y + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    this.label('!', x, y + 2, '#ffffff', 15);
  }

  /** WARHOUND: a two-legged assault walker with a top cannon and a chin machine gun. */
  private drawWarhound(e: EnemySnapshot, nowMs: number): void {
    const ctx = this.ctx;
    const c = GAME_CONFIG.enemies.walker;
    const { t, wind, telegraph } = this.atk(e);
    const flash = e.h === 1;
    // Hit flash: a quick lighten, not a white-out (a boss under fire is hit almost every frame).
    const steel = flash ? '#7d8a6e' : '#4b5442';
    const dark = flash ? '#4d5745' : '#2f3529';
    const light = flash ? '#a3b18f' : '#6d7a5e';
    const crouch = e.at === ATTACK.stomp && telegraph ? 10 : 0;
    const charge = e.at === ATTACK.charge;
    const walk = Math.sin(e.x / 18);
    const top = -c.height + crouch;
    const hullH = 52;
    const eyeHot = charge && telegraph;
    const pulse = 0.6 + 0.4 * Math.sin(nowMs / (eyeHot ? 50 : 200));
    const tx = e.x - e.f * 6;
    const ty = e.y + top - 6;
    this.shadowAt(e.x, e.y, c.width * 0.55);
    // the machine itself, lit as high-definition art (see litBoss); glows and tells go on top, unlit
    this.litBoss({ x: e.x - 110, y: e.y + top - 40, w: 220, h: -top + 48 }, () => {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(Math.round(e.x), Math.round(e.y));
      if (charge && telegraph && !this.reduce) ctx.translate((Math.random() - 0.5) * 3, 0);
      ctx.scale(e.f, 1);
      // legs (digitigrade): back leg darker
      for (const [i, side] of [-1, 1].entries()) {
        const phase = i === 0 ? walk : -walk;
        const hipX = side * 34;
        const hipY = -54 + crouch;
        const kneeX = hipX + 14 + phase * 6;
        const kneeY = -30 + crouch / 2;
        const footX = hipX + phase * 12;
        ctx.strokeStyle = '#120f17';
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, -6);
        ctx.stroke();
        ctx.strokeStyle = i === 0 ? dark : steel;
        ctx.lineWidth = 11;
        ctx.stroke();
        ctx.fillStyle = '#120f17';
        ctx.fillRect(footX - 18, -9, 36, 9);
        ctx.fillStyle = i === 0 ? '#22261e' : '#353c2e';
        ctx.fillRect(footX - 17, -8, 34, 7);
        ctx.fillStyle = '#d4a017';
        ctx.fillRect(kneeX - 3, kneeY - 3, 6, 6);
      }
      // hull
      ctx.fillStyle = '#120f17';
      ctx.beginPath();
      ctx.moveTo(-68, top + 8);
      ctx.lineTo(48, top + 4);
      ctx.lineTo(70, top + 24);
      ctx.lineTo(60, top + hullH + 4);
      ctx.lineTo(-64, top + hullH + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = steel;
      ctx.beginPath();
      ctx.moveTo(-65, top + 10);
      ctx.lineTo(46, top + 7);
      ctx.lineTo(66, top + 25);
      ctx.lineTo(57, top + hullH + 1);
      ctx.lineTo(-61, top + hullH + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = light;
      ctx.fillRect(-60, top + 11, 100, 4);
      ctx.fillStyle = dark;
      ctx.fillRect(-60, top + hullH - 8, 115, 7);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#1b1b1b' : '#f4c430';
        ctx.fillRect(-56 + i * 12, top + hullH - 7, 12, 5);
      }
      for (let x = -50; x < 40; x += 18) {
        ctx.fillStyle = light;
        ctx.fillRect(x, top + 22, 3, 3);
      }
      // sensor eye (red; white-hot during a charge tell)
      ctx.fillStyle = '#120f17';
      ctx.fillRect(46, top + 18, 16, 10);
      ctx.fillStyle = eyeHot ? '#ffffff' : '#ff2d2d';
      ctx.fillRect(48, top + 20, 12, 6);
      // armour seams and bolted hatches (high-definition detail)
      ctx.fillStyle = tone(steel, -0.32);
      for (const x of [-30, 8]) ctx.fillRect(x, top + 12, 2, hullH - 22);
      ctx.fillStyle = tone(steel, 0.22);
      for (const x of [-26, 12]) {
        ctx.fillRect(x, top + 30, 12, 2);
        ctx.fillRect(x, top + 30, 2, 8);
      }
      ctx.restore();
      // chin machine gun
      ctx.save();
      ctx.translate(Math.round(e.x + e.f * 52), Math.round(e.y + top + hullH - 4));
      ctx.rotate(e.f > 0 ? e.a / 100 : Math.PI - e.a / 100);
      ctx.scale(1, e.f);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-2, -5, 28, 10);
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(0, -4, 26, 8);
      ctx.restore();
      // top cannon turret
      ctx.fillStyle = '#120f17';
      ctx.fillRect(Math.round(tx - 24), Math.round(ty - 8), 48, 16);
      ctx.fillStyle = flash ? '#7a8770' : '#5b6650';
      ctx.fillRect(Math.round(tx - 22), Math.round(ty - 7), 44, 13);
      ctx.save();
      ctx.translate(Math.round(tx + e.f * 10), Math.round(ty - 2));
      ctx.rotate(e.f > 0 ? -0.35 : Math.PI + 0.35);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(0, -6, 52, 12);
      ctx.fillStyle = '#3a4033';
      ctx.fillRect(0, -5, 50, 10);
      ctx.fillStyle = '#1b1d18';
      ctx.fillRect(44, -6, 8, 12);
      ctx.restore();
    });
    this.glow(e.x + e.f * 54, e.y + top + 23, eyeHot ? 16 : 7 * pulse, '#ff2d2d');
    // tells
    if (telegraph) {
      const k = Math.min(1, t / Math.max(0.01, wind));
      if (e.at === ATTACK.cannon)
        this.glow(tx + e.f * 52 * Math.cos(0.35), ty - 2 - 52 * Math.sin(0.35), 6 + k * 10, '#ffb02e');
      if (e.at === ATTACK.charge) {
        this.warnIcon(e.x, e.y + top - 40, nowMs);
        // the path of the charge along the floor
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const len = 520;
        const g = ctx.createLinearGradient(e.x, 0, e.x + e.f * len, 0);
        g.addColorStop(0, `rgba(255,40,40,${0.25 + k * 0.35})`);
        g.addColorStop(1, 'rgba(255,40,40,0)');
        ctx.fillStyle = g;
        const x0 = e.f > 0 ? e.x : e.x - len;
        ctx.fillRect(x0, e.y - c.height + 10, len, c.height - 12);
        ctx.restore();
        if (!this.reduce && Math.random() < 0.7)
          this.add({
            x: e.x - e.f * 60,
            y: e.y + top + 20,
            vx: -e.f * (60 + Math.random() * 60),
            vy: -20,
            life: 0.4,
            size: 7,
            color: '#ff8c42',
            add: true,
            grow: -8,
          });
      }
      if (e.at === ATTACK.stomp) this.warnIcon(e.x, e.y + top - 40, nowMs);
      if (e.at === ATTACK.mg) this.sightLine(e.x + e.f * 52, e.y + top + hullH - 4, e.a / 100, 420, k);
    }
    if (e.ph >= 2 && !this.reduce && Math.random() < 0.3)
      this.add({
        x: e.x + (Math.random() - 0.5) * 80,
        y: e.y + top + 10,
        vx: (Math.random() - 0.5) * 10,
        vy: -40,
        life: 1.2,
        size: 9,
        color: 'rgba(50,48,52,0.55)',
        grow: 12,
        grav: -10,
      });
  }

  /** VULTURE: an attack gunship with a rotor, stub wings, missile pods and a chin gun. */
  private drawVulture(e: EnemySnapshot, nowMs: number): void {
    const ctx = this.ctx;
    const c = GAME_CONFIG.enemies.gunship;
    const { t, wind, telegraph } = this.atk(e);
    const flash = e.h === 1;
    const body = flash ? '#5d6880' : '#384152';
    const dark = flash ? '#3a4356' : '#252c38';
    const light = flash ? '#8691a6' : '#5b6578';
    const cy = e.y - c.height / 2;
    // shadow on the ground far below
    this.shadowAt(e.x, 14 * T, 70, 0.18);
    const podHot = e.at === ATTACK.missiles && telegraph;
    const gx = e.x + e.f * 44;
    const gy = cy + 18;
    // the airframe, lit as high-definition art (see litBoss); the rotor blur, lights and tells stay unlit on top
    this.litBoss({ x: e.x - 112, y: cy - 44, w: 224, h: 92 }, () => {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(Math.round(e.x), Math.round(cy));
      ctx.scale(e.f, 1);
      ctx.rotate(e.f * 0); // level flight
      // tail boom
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-92, -10, 60, 14);
      ctx.fillStyle = dark;
      ctx.fillRect(-90, -8, 58, 10);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-98, -26, 14, 30);
      ctx.fillStyle = body;
      ctx.fillRect(-96, -24, 10, 26);
      // tail rotor
      const tr = Math.floor(nowMs / 40) % 2 === 0;
      ctx.fillStyle = 'rgba(220,226,235,0.8)';
      ctx.fillRect(-94, tr ? -36 : -24, 3, tr ? 26 : 2);
      // fuselage
      ctx.fillStyle = '#120f17';
      ctx.beginPath();
      ctx.ellipse(0, 0, 58, 27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, 55, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light;
      ctx.fillRect(-40, -20, 70, 4);
      // panel seams, rivets and an engine intake (high-definition detail)
      ctx.fillStyle = dark;
      for (const x of [-30, -6, 16]) ctx.fillRect(x, -21, 2, 36);
      ctx.fillStyle = light;
      for (let x = -36; x < 24; x += 8) ctx.fillRect(x, -15, 2, 2);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-20, -27, 22, 6);
      ctx.fillStyle = '#2b313d';
      ctx.fillRect(-18, -26, 18, 4);
      // red stripe + markings
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(-46, 4, 90, 5);
      // cockpit glass
      ctx.fillStyle = '#120f17';
      ctx.beginPath();
      ctx.ellipse(36, -6, 22, 14, 0.2, 0, Math.PI * 2);
      ctx.fill();
      const glass = ctx.createLinearGradient(20, -18, 50, 6);
      glass.addColorStop(0, '#a5f3fc');
      glass.addColorStop(1, '#0e7490');
      ctx.fillStyle = glass;
      ctx.beginPath();
      ctx.ellipse(36, -6, 19, 11, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(30, -13, 10, 2);
      // stub wing + missile pod
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-26, 10, 44, 10);
      ctx.fillStyle = dark;
      ctx.fillRect(-24, 11, 40, 7);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-16, 18, 30, 12);
      ctx.fillStyle = podHot ? '#fca5a5' : '#4b5563';
      ctx.fillRect(-15, 19, 28, 10);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = podHot ? '#ffffff' : '#111827';
        ctx.fillRect(10, 20 + i * 3, 4, 2);
      }
      // bomb bay doors
      const bay = e.at === ATTACK.bombs;
      ctx.fillStyle = bay ? '#7f1d1d' : dark;
      ctx.fillRect(-30, 20, 22, bay ? 7 : 4);
      // skids
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-40, 28, 70, 3);
      ctx.restore();
      // rotor mast
      ctx.fillStyle = '#120f17';
      ctx.fillRect(Math.round(e.x - 4), Math.round(cy - 33), 8, 9);
      // chin gun
      ctx.save();
      ctx.translate(Math.round(gx), Math.round(gy));
      ctx.rotate(e.a / 100);
      ctx.fillStyle = '#120f17';
      ctx.fillRect(-2, -4, 24, 8);
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(0, -3, 22, 6);
      ctx.restore();
    });
    // main rotor blur
    ctx.save();
    ctx.globalAlpha = 0.65;
    const span = 90 + Math.sin(nowMs / 30) * 20;
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(Math.round(e.x - span), Math.round(cy - 33), Math.round(span * 2), 3);
    ctx.restore();
    // blinking nav lights
    if (Math.floor(nowMs / 400) % 2 === 0) {
      this.glow(e.x - e.f * 96, cy - 26, 4, '#ff3b3b');
      this.glow(e.x + e.f * 20, cy + 26, 3, '#22c55e');
    }
    if (telegraph) {
      const k = Math.min(1, t / Math.max(0.01, wind));
      if (e.at === ATTACK.strafe) this.sightLine(gx, gy, e.a / 100, 460, k);
      if (e.at === ATTACK.bombs || e.at === ATTACK.troops) this.warnIcon(e.x, cy - 56, nowMs);
      if (podHot) this.glow(e.x, cy + 24, 6 + k * 10, '#ff4d4d');
    }
    if (e.ph >= 2 && !this.reduce && Math.random() < 0.35)
      this.add({
        x: e.x - e.f * 30,
        y: cy - 10,
        vx: -e.f * 30,
        vy: -30,
        life: 1,
        size: 8,
        color: 'rgba(40,38,44,0.6)',
        grow: 12,
        grav: -10,
      });
  }

  /** IRON FORTRESS (final boss), drawn from its enemy snapshot. */
  private drawFortress(e: EnemySnapshot, s: Snapshot, nowMs: number): void {
    const ctx = this.ctx;
    const bc = GAME_CONFIG.enemies.boss;
    const dead = e.hp <= 0 || s.result === 'won';
    const flash = e.h === 1;
    const ph = e.ph;
    const left = e.x - bc.width / 2;
    const top = e.y - bc.height;
    const W = bc.width;
    const H = bc.height;
    const steel = dead ? '#2a2628' : flash ? '#69717f' : '#4b5260';
    const { t, wind, telegraph } = this.atk(e);
    const k = telegraph ? Math.min(1, t / Math.max(0.01, wind)) : 0;
    const cx = e.x - 8;
    const cyy = e.y - 120;
    // the stronghold itself, lit as high-definition art (see litBoss); glows, the core and tells stay unlit on top
    this.litBoss({ x: left - 48, y: top - 24, w: W + 60, h: H + 26 }, () => {
      const ctx = this.ctx;
      ctx.fillStyle = '#120f17';
      ctx.fillRect(left - 3, top - 3, W + 6, H + 3);
      ctx.fillStyle = steel;
      ctx.fillRect(left, top, W, H);
      for (let r = 0; r < H; r += 28) {
        ctx.fillStyle = tone(steel, 0.12);
        ctx.fillRect(left, top + r, W, 3);
        ctx.fillStyle = tone(steel, -0.3);
        ctx.fillRect(left, top + r + 25, W, 3);
        for (let x = 6; x < W; x += 18) {
          ctx.fillStyle = tone(steel, 0.3);
          ctx.fillRect(left + x, top + r + 8, 3, 3);
          ctx.fillStyle = tone(steel, -0.35);
          ctx.fillRect(left + x + 1, top + r + 11, 3, 1);
        }
        // vertical plate seams, staggered like a real armoured wall
        ctx.fillStyle = tone(steel, -0.22);
        for (let x = (r / 28) % 2 ? 30 : 58; x < W - 4; x += 56) ctx.fillRect(left + x, top + r + 3, 2, 22);
      }
      ctx.fillStyle = tone(steel, -0.25);
      ctx.fillRect(left, top, 8, H);
      for (let i = 0; i < W / 10; i++) {
        ctx.fillStyle = i % 2 ? '#1b1b1b' : dead ? '#6b5a1e' : '#f4c430';
        ctx.fillRect(left + i * 10, top + H - 22, 10, 10);
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#120f17';
        ctx.fillRect(left + i * 26 - 1, top - 17, 18, 15);
        ctx.fillStyle = tone(steel, 0.08);
        ctx.fillRect(left + i * 26, top - 16, 16, 13);
      }
      if (dead) return;
      if (ph >= 2) {
        ctx.strokeStyle = '#1b1b1b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left + 20, top + 40);
        ctx.lineTo(left + 34, top + 70);
        ctx.lineTo(left + 26, top + 96);
        if (ph >= 3) {
          ctx.moveTo(left + 80, top + 150);
          ctx.lineTo(left + 96, top + 120);
          ctx.lineTo(left + 90, top + 92);
        }
        ctx.stroke();
      }
      for (const cy of [e.y - 170, e.y - 70]) {
        ctx.fillStyle = '#120f17';
        ctx.fillRect(left - 36, cy - 11, 44, 22);
        ctx.fillStyle = '#2a2d33';
        ctx.fillRect(left - 34, cy - 9, 40, 18);
        ctx.fillStyle = '#4e545e';
        ctx.fillRect(left - 34, cy - 9, 40, 4);
        ctx.fillStyle = '#0d0d10';
        ctx.fillRect(left - 40, cy - 7, 8, 14);
      }
      // beam emitter at the base
      ctx.fillStyle = '#120f17';
      ctx.fillRect(left - 16, e.y - 44, 18, 40);
      ctx.fillStyle = '#3b3f48';
      ctx.fillRect(left - 14, e.y - 42, 16, 36);
      // the core's housing
      ctx.fillStyle = '#120f17';
      ctx.beginPath();
      ctx.arc(cx, cyy, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a2d33';
      ctx.beginPath();
      ctx.arc(cx, cyy, 22, 0, Math.PI * 2);
      ctx.fill();
    });
    if (dead) {
      this.label('DESTROYED', e.x, top + 40, '#a8a29e', 14);
      return;
    }
    if (ph >= 2 && !this.reduce && Math.random() < 0.25)
      this.add({
        x: left + 20 + Math.random() * 80,
        y: top + 10,
        vx: (Math.random() - 0.5) * 10,
        vy: -30,
        life: 1.4,
        size: 9,
        color: 'rgba(60,55,60,0.5)',
        grow: 10,
        grav: -10,
      });
    if (e.at === ATTACK.volley && telegraph)
      for (const cy of [e.y - 170, e.y - 70]) this.glow(left - 38, cy, 5 + k * 9, '#ffb02e');
    const beam = e.at === ATTACK.beamLow || e.at === ATTACK.beamHigh;
    const by = e.y - (e.at === ATTACK.beamHigh ? BEAM.highY : BEAM.lowY);
    if (beam) this.glow(left - 12, by, telegraph ? 6 + k * 14 : 20, '#ff2d55');
    // slam: the fortress's ram glows before it hits the ground
    if (e.at === ATTACK.slam && telegraph) {
      this.warnIcon(left - 30, e.y - 120, nowMs);
      this.glow(left - 6, e.y - 10, 8 + k * 14, '#ffb02e');
    }
    const core = ph === 1 ? '#ffb703' : ph === 2 ? '#fb8500' : '#ff2e2e';
    const pulse = 0.6 + 0.4 * Math.sin(nowMs / (ph === 3 ? 80 : 200));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cyy, 2, cx, cyy, 46);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, core);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = pulse;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cyy, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (Math.floor(nowMs / (ph === 3 ? 150 : 400)) % 2 === 0) {
      this.glow(left + 10, top - 22, 6, '#ff3b3b');
      this.glow(left + W - 10, top - 22, 6, '#ff3b3b');
    }
  }

  /**
   * Paints a boss body (drawing on `this.ctx` as usual inside `paint`) into a lit high-definition layer:
   * form shading, rim light and grain on the heroes' pixel grid (boss-art.ts litLayer). Keep glows and attack
   * tells out of `paint`, so they stay as bright and as wide as players learned them.
   */
  private litBoss(box: LitBox, paint: () => void, rim?: string): void {
    const main = this.ctx;
    litLayer(
      main,
      box,
      (g) => {
        this.ctx = g;
        try {
          paint();
        } finally {
          this.ctx = main;
        }
      },
      rim,
    );
  }

  private shadowAt(x: number, y: number, w: number, a = 0.3): void {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y - 1, w, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** A red laser sight that brightens as an aimed attack winds up. */
  private sightLine(x: number, y: number, angle: number, len: number, k: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,40,40,${0.25 + k * 0.6})`;
    ctx.lineWidth = 1 + k * 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
    ctx.restore();
  }

  /** Boss beams (warning line, then the beam) and landing markers for lobbed grenades, shells and bombs. */
  private drawTelegraphs(s: Snapshot, players: PlayerSnapshot[], nowMs: number): void {
    const ctx = this.ctx;
    for (const e of s.enemies) {
      if (e.k !== 'boss' || (e.at !== ATTACK.beamLow && e.at !== ATTACK.beamHigh)) continue;
      const a = this.lvl.arenas.find((x) => x.boss === 'boss');
      if (!a) continue;
      const low = e.at === ATTACK.beamLow;
      const y = a.floor - (low ? BEAM.lowY : BEAM.highY);
      const x0 = a.left;
      const x1 = e.x - GAME_CONFIG.enemies.boss.width / 2 - 12;
      const t = e.tt * TICK_SEC;
      const wind = ATTACK_WINDUP[e.at] ?? 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (t < wind) {
        const k = t / wind;
        const on = Math.floor(nowMs / (k > 0.6 ? 60 : 120)) % 2 === 0;
        ctx.strokeStyle = `rgba(255,45,85,${on ? 0.55 + k * 0.45 : 0.3})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 6]);
        ctx.lineDashOffset = -nowMs / 20;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,45,85,${0.12 + k * 0.2})`;
        ctx.fillRect(x0, y - BEAM.half, x1 - x0, BEAM.half * 2);
        ctx.restore();
        // Big readable cue over every soldier in the line of fire.
        ctx.globalAlpha = on ? 1 : 0.55;
        for (const p of players)
          if (p.st === 0 && p.x > x0 && p.x < x1)
            this.label(low ? '▲ JUMP!' : '▼ DUCK!', p.x, p.y - 64, low ? '#fde047' : '#7dd3fc', 15);
        ctx.globalAlpha = 1;
      } else if (t < wind + BEAM_SEC) {
        const flick = 0.85 + Math.random() * 0.15;
        const g = ctx.createLinearGradient(0, y - 14, 0, y + 14);
        g.addColorStop(0, 'rgba(255,45,85,0)');
        g.addColorStop(0.35, `rgba(255,45,85,${0.8 * flick})`);
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(0.65, `rgba(255,45,85,${0.8 * flick})`);
        g.addColorStop(1, 'rgba(255,45,85,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, y - 14, x1 - x0, 28);
        ctx.restore();
        if (!this.reduce && Math.random() < 0.6)
          this.spark(x0 + Math.random() * (x1 - x0), y, '#ff8fa3', 2, this.reduce, 120);
        if (!this.reduce) this.shakeMag = Math.max(this.shakeMag, 2.5);
      } else ctx.restore();
    }
    // Where boss rain will land: a red ring on the ground under every falling meteor.
    for (const b of s.bullets) {
      if (b.e !== 1 || KIND(b.k) !== 'meteor') continue;
      let r = Math.max(0, Math.floor(b.y / T));
      while (r < this.level.rows && tileAt(this.level, Math.floor(b.x / T), r) !== Tile.Solid) r++;
      const gy = r * T;
      const near = Math.max(0, Math.min(1, 1 - (gy - b.y) / 640));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,70,50,${0.35 + near * 0.6})`;
      ctx.lineWidth = 2 + near * 2;
      ctx.beginPath();
      ctx.ellipse(b.x, gy - 2, 30 + near * 10, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,70,50,${0.08 + near * 0.18})`;
      ctx.fill();
      ctx.restore();
    }
    // Where lobbed ordnance will land.
    for (const b of s.bullets) {
      const kind = KIND(b.k);
      if (b.e !== 1 || (kind !== 'grenade' && kind !== 'shell' && kind !== 'bomb')) continue;
      const g = kind === 'bomb' ? 700 : 900;
      let x = b.x;
      let y = b.y;
      let vy = b.vy;
      let landed = false;
      for (let i = 0; i < 120 && !landed; i++) {
        vy += g * TICK_SEC;
        x += b.vx * TICK_SEC;
        y += vy * TICK_SEC;
        if (tileAt(this.level, Math.floor(x / T), Math.floor(y / T)) === Tile.Solid) landed = true;
      }
      if (!landed) continue;
      const gy = Math.floor(y / T) * T;
      const r = kind === 'grenade' ? 58 : kind === 'shell' ? 52 : 60;
      const pulse = 0.5 + 0.5 * Math.sin(nowMs / 70);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,60,60,${0.35 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, gy - 2, r * 0.8, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,60,60,${0.08 + pulse * 0.1})`;
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBullets(s: Snapshot, nowMs: number): void {
    const ctx = this.ctx;
    ctx.save();
    for (const b of s.bullets) {
      if (b.x < this.camX - 40 || b.x > this.camX + this.viewW + 40) continue;
      const kind = KIND(b.k);
      if (this.drawAstraShot(kind, b, nowMs)) continue;
      if (b.e === 1) {
        ctx.globalCompositeOperation = 'source-over';
        if (
          (kind === 'grenade' || kind === 'bomb' || kind === 'missile') &&
          drawOrdnance(ctx, this.lvl.faction, kind, b.x, b.y, b.vx, b.vy, nowMs)
        )
          continue;
        if (kind === 'grenade' || kind === 'bomb') {
          const r = kind === 'bomb' ? 7 : 5;
          ctx.fillStyle = '#120f17';
          ctx.beginPath();
          ctx.arc(b.x, b.y, r + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = kind === 'bomb' ? '#3f3f46' : '#3f6212';
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
          if (Math.floor(nowMs / 90) % 2 === 0) this.glow(b.x, b.y - r, 3, '#ff3b3b');
          continue;
        }
        if (kind === 'missile') {
          const a = Math.atan2(b.vy, b.vx);
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(a);
          ctx.fillStyle = '#120f17';
          ctx.fillRect(-11, -4, 20, 8);
          ctx.fillStyle = '#d1d5db';
          ctx.fillRect(-10, -3, 16, 6);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(4, -3, 5, 6);
          ctx.restore();
          this.glow(b.x - Math.cos(a) * 12, b.y - Math.sin(a) * 12, 5, '#ffb02e');
          if (!this.reduce && Math.random() < 0.7)
            this.add({
              x: b.x - Math.cos(a) * 14,
              y: b.y - Math.sin(a) * 14,
              vy: -10,
              life: 0.6,
              size: 5,
              color: 'rgba(160,160,170,0.5)',
              grow: 10,
            });
          continue;
        }
        ctx.globalCompositeOperation = 'lighter';
        if (kind === 'wave') {
          // ground shockwave: a rolling wall of fire and dust
          const dir = Math.sign(b.vx) || 1;
          const [wc, wh] = SHOT_COLORS[this.lvl.faction].wave;
          const g = ctx.createLinearGradient(b.x - dir * 40, 0, b.x + dir * 6, 0);
          g.addColorStop(0, `rgba(${wc},0)`);
          g.addColorStop(0.7, `rgba(${wc},0.65)`);
          g.addColorStop(1, `rgba(${wh},0.95)`);
          ctx.fillStyle = g;
          const h = 22 + Math.sin(nowMs / 40 + b.x) * 3;
          ctx.beginPath();
          ctx.moveTo(b.x - dir * 42, b.y + 12);
          ctx.quadraticCurveTo(b.x - dir * 10, b.y + 12 - h * 1.1, b.x + dir * 6, b.y + 12);
          ctx.fill();
          if (!this.reduce && Math.random() < 0.5)
            this.add({
              x: b.x,
              y: b.y + 10,
              vx: -dir * 40,
              vy: -60,
              life: 0.4,
              size: 4,
              color: '#c2a27a',
              grav: 400,
            });
          continue;
        }
        const shell = kind === 'shell';
        const rad = shell ? 13 : 9;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
        g.addColorStop(0, '#ffffff');
        const sc = SHOT_COLORS[this.lvl.faction];
        g.addColorStop(0.35, shell ? sc.shell : sc.core);
        g.addColorStop(1, 'rgba(255,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(b.x - rad, b.y - rad, rad * 2, rad * 2);
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      if (kind === 'flame') {
        drawFlame(ctx, b.x, b.y, b.vx, nowMs);
        if (!this.reduce && Math.random() < 0.8)
          this.add({ x: b.x, y: b.y + 8, vx: -b.vx * 0.1, vy: -60, color: '#ff8c42', size: 3, life: 0.4 });
        continue;
      }
      if (kind === 'rocket') {
        // airstrike rocket diving in
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#120f17';
        ctx.fillRect(b.x - 4, b.y - 18, 8, 20);
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(b.x - 3, b.y - 17, 6, 16);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(b.x - 3, b.y - 3, 6, 3);
        this.glow(b.x, b.y - 22, 7, '#ff8c42');
        continue;
      }
      const color = b.p === 1 ? '#ff8c42' : (BULLET_COLOR[b.w] as string);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const ux = b.vx / sp;
      const uy = b.vy / sp;
      const laser = WEAPON_KINDS[b.w] === 'laser';
      const len = laser ? 30 : b.p === 1 ? 18 : 12;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = b.p === 1 ? 9 : 7;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ux * len, b.y - uy * len);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = b.p === 1 ? 3.5 : 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ux * len * 0.7, b.y - uy * len * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ event effects

  /** Big, readable effects for hero super moves. */
  ultEffect(ev: Extract<SimEvent, { e: 'ult' }>, color: string, reduce: boolean): void {
    const y = ev.y - 18;
    this.flash(ev.sync ? '#fde047' : '#ffffff', reduce ? 0.15 : 0.45);
    if (!reduce) this.shake(ev.kind === 'airstrike' ? 6 : 12);
    this.styleFloats.push({
      x: ev.x,
      y: ev.y - 70,
      text: ev.sync ? 'SYNC!' : 'SUPER!',
      life: 1.2,
      mine: true,
    });
    switch (ev.kind) {
      case 'nova':
        for (let i = 0; i < 3; i++)
          this.rings.push({ x: ev.x, y, r: 10 + i * 40, life: 0.45 + i * 0.1, max: 0.55, color });
        this.rings.push({ x: ev.x, y, r: 6, life: 0.6, max: 0.6, color: '#ffffff' });
        this.spark(ev.x, y, color, 40, reduce, 420);
        break;
      case 'overdrive':
        this.rings.push({ x: ev.x, y, r: 8, life: 0.4, max: 0.4, color: '#ff8c42' });
        this.spark(ev.x, y, '#ffb02e', 30, reduce, 260);
        break;
      case 'airstrike':
        this.rings.push({ x: ev.x, y, r: 8, life: 0.35, max: 0.35, color });
        this.floatText(ev.x, ev.y - 50, 'INCOMING!', '#fde047');
        break;
      case 'phantom': {
        const hits = ev.hits ?? [];
        let px = ev.x;
        let py = y;
        for (let i = 0; i + 1 < hits.length; i += 2) {
          const hx = hits[i] as number;
          const hy = hits[i + 1] as number;
          this.slashes.push({ x0: px, y0: py, x1: hx, y1: hy, life: 0.35 + i * 0.03, color });
          this.slashes.push({
            x0: hx - 18,
            y0: hy - 18,
            x1: hx + 18,
            y1: hy + 18,
            life: 0.4,
            color: '#ffffff',
          });
          this.spark(hx, hy, color, 10, reduce, 200);
          px = hx;
          py = hy;
        }
        break;
      }
    }
  }

  /** "PARRY!", "KNIFE KILL"… popping over the action. */
  styleText(x: number, y: number, text: string, mine: boolean): void {
    this.styleFloats.push({ x, y: y - 10, text, life: 1, mine });
    if (this.styleFloats.length > 12) this.styleFloats.shift();
  }

  /** Astra Saga projectiles (either side). Returns false for everything else. */
  private drawAstraShot(kind: string, b: Snapshot['bullets'][number], nowMs: number): boolean {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    let drawn = true;
    if (kind === 'serpent') drawSerpent(ctx, b.x, b.y, b.vx, b.vy, b.e === 1, nowMs);
    else if (kind === 'chakra') drawChakra(ctx, b.x, b.y, nowMs, false);
    else if (kind === 'orb') drawOrb(ctx, b.x, b.y, b.e === 1, nowMs);
    else if (kind === 'arrow') drawArrow(ctx, b.x, b.y, b.vx, b.vy);
    else if (kind === 'spark') drawSpark(ctx, b.x, b.y, b.vx, b.vy);
    else if (kind === 'meteor') drawMeteor(ctx, b.x, b.y, b.vx, b.vy, nowMs);
    else drawn = false;
    ctx.restore();
    return drawn;
  }

  /** Bosses calling their astras (the wind-up tell), stunned bosses and untouchable ones. */
  private drawBossAstras(s: Snapshot, nowMs: number): void {
    for (const e of s.enemies) {
      if (!isBoss(e.k)) continue;
      const w = GAME_CONFIG.enemies[e.k].width;
      const h = GAME_CONFIG.enemies[e.k].height;
      const cx = e.k === 'boss' ? e.x - w / 2 - 10 : e.k === 'gunship' ? e.x + e.f * 60 : e.x + e.f * 54;
      const cy = e.k === 'boss' ? e.y - 170 : e.k === 'gunship' ? e.y + 10 : e.y - 88;
      if (e.ra >= 0) {
        const kind = BOSS_RULES[e.ra];
        if (kind) drawBossCast(this.ctx, kind, cx, cy, e.rt / 30, e.rs === 1, nowMs, this.viewW, this.camX);
      }
      if (e.im === 1) drawImmune(this.ctx, e.k === 'boss' ? e.x - w / 4 : e.x, e.y, w, h, nowMs);
      if (e.sn === 1) drawDazed(this.ctx, e.k === 'boss' ? e.x - w / 2 : e.x, e.y - h - 12, nowMs);
    }
  }

  /** A boss astra event: the call, its release, a counter, a rebound, the end of a storm. */
  bossAstraEffect(ev: Extract<SimEvent, { e: 'bossAstra' }>, reduce: boolean): void {
    const col = RULE_COLOR[ev.kind];
    if (ev.phase === 0) {
      this.rings.push({ x: ev.x, y: ev.y, r: 120, life: 0.5, max: 0.5, color: col });
      if (ev.kind === 'narayana' || ev.kind === 'brahmashirsha') this.darkTarget = 0.6;
      return;
    }
    if (ev.phase === 1) {
      this.flash(col, ev.kind === 'brahmashirsha' ? 0.8 : 0.2);
      if (!reduce) this.shake(ev.kind === 'brahmashirsha' ? 22 : 6);
      if (ev.kind === 'brahmashirsha') {
        this.darkTarget = 0;
        this.pillar = { x: ev.x, ground: ev.y + 170, life: 0.9, strike: true };
      }
      return;
    }
    this.darkTarget = 0;
    if (ev.phase === 2 || ev.phase === 3) {
      // Countered or rebounded: the boss takes it.
      this.flash(ev.phase === 2 ? '#ffffff' : '#fde047', 0.7);
      if (!reduce) this.shake(18);
      for (let i = 0; i < 5; i++)
        this.rings.push({
          x: ev.x,
          y: ev.y,
          r: 10 + i * 50,
          life: 0.4 + i * 0.1,
          max: 0.9,
          color: i % 2 ? col : '#ffffff',
        });
      this.explosion(ev.x, ev.y, true, reduce);
    }
  }

  /** A power was used: start its effect. */
  astraEffect(ev: Extract<SimEvent, { e: 'astra' }>, reduce: boolean): void {
    const [hi, lo] = POWER_COLOR[ev.kind];
    const cy = ev.y - 24;
    // The vaishnava orb turning back is not a new call: it keeps the first apparition.
    if (!(ev.kind === 'vaishnava' && ev.v === 1)) this.cine.add(ev.kind, ev.x, ev.y, ev.f, performance.now());
    this.bows.set(ev.id, { born: performance.now(), kind: ev.kind });
    this.rings.push({ x: ev.x, y: cy, r: 6, life: 0.4, max: 0.4, color: hi });
    this.spark(ev.x + ev.f * 16, cy, lo, 12, reduce, 220);
    if (ev.kind === 'naga' || ev.kind === 'sudarshana') {
      this.flash(lo, 0.12);
      return;
    }
    if (ev.kind === 'garuda') {
      // The eagle's dive: a sweep of wind and a ring that clears the sky.
      this.winds.push({ x: ev.x - ev.f * 300, y: cy - 120, f: ev.f, life: 0.7 });
      for (let i = 0; i < 3; i++)
        this.rings.push({ x: ev.x, y: cy - 60, r: 40 + i * 140, life: 0.5 + i * 0.1, max: 0.8, color: hi });
      this.flash('#fb923c', 0.25);
      if (!reduce) this.shake(8);
      return;
    }
    if (ev.kind === 'pashupata') {
      this.flash(ev.v === 2 ? '#f97316' : '#7dd3fc', 0.3);
      if (!reduce) this.shake(ev.v === 0 ? 14 : 6);
      return;
    }
    if (ev.kind === 'vaishnava') {
      this.flash('#fde047', ev.v === 1 ? 0.55 : 0.2);
      if (ev.v === 1)
        for (let i = 0; i < 4; i++)
          this.rings.push({
            x: ev.x,
            y: cy,
            r: 20 + i * 45,
            life: 0.4 + i * 0.1,
            max: 0.8,
            color: '#fde047',
          });
      return;
    }
    if (ev.kind === 'agni') {
      this.fireRuns.push({ x: ev.x, y: ev.y, f: ev.f, born: performance.now() });
      this.flash('#ff7a1a', 0.18);
      if (!reduce) this.shake(6);
    } else if (ev.kind === 'varuna') {
      const P = GAME_CONFIG.powers.varuna;
      const a = ev.x + ev.f * P.range;
      const b = ev.x - ev.f * P.back;
      this.rains.push({ x0: Math.min(a, b), x1: Math.max(a, b), ground: ev.y, life: 1.6 });
      this.flash('#38bdf8', 0.15);
    } else if (ev.kind === 'vayu') {
      this.winds.push({ x: ev.x, y: cy, f: ev.f, life: 0.5 });
      if (!reduce) this.shake(5);
    } else {
      this.flash('#7c3aed', 0.22);
      if (!reduce) this.shake(8);
    }
  }

  /** The brahmastra: the sky darkens and a pillar of light gathers (phase 0), then strikes (phase 1). */
  brahmaEffect(ev: Extract<SimEvent, { e: 'brahma' }>, reduce: boolean): void {
    if (ev.phase === 0) {
      this.cine.add('brahma', ev.x, ev.y, 1, performance.now());
      this.darkTarget = 1;
      this.pillar = { x: ev.x, ground: ev.y, life: 1.2, strike: false };
      return;
    }
    this.darkTarget = 0;
    this.pillar = { x: ev.x, ground: ev.y, life: 0.9, strike: true };
    this.flash('#fff7cc', 0.85);
    if (!reduce) this.shake(20);
    for (let i = 0; i < 6; i++)
      this.rings.push({
        x: ev.x,
        y: ev.y - 20,
        r: 10 + i * 60,
        life: 0.5 + i * 0.12,
        max: 1.1,
        color: i % 2 ? '#fde047' : '#ffffff',
      });
    for (let k = 0; k < (reduce ? 4 : 14); k++) {
      const x = this.camX + Math.random() * this.viewW;
      this.spark(x, ev.y - 40 - Math.random() * 200, '#fde68a', 5, reduce, 260);
    }
  }

  /** Rain curtains, wind gusts and the brahmastra pillar (world space). */
  private drawAstraFx(dt: number, nowMs: number): void {
    const ctx = this.ctx;
    if (this.rains.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(147,197,253,0.75)';
      ctx.lineWidth = 2;
      for (const r of this.rains) {
        r.life -= dt;
        const a = Math.min(1, r.life * 2);
        ctx.globalAlpha = a;
        // a dark cloud bank on top
        ctx.fillStyle = 'rgba(30,41,59,0.55)';
        ctx.fillRect(r.x0, this.camY + 4, r.x1 - r.x0, 46);
        ctx.beginPath();
        for (let x = r.x0; x < r.x1; x += 14) {
          const y = this.camY + 40 + ((nowMs * 0.9 + x * 37) % (r.ground - this.camY));
          ctx.moveTo(x, y);
          ctx.lineTo(x - 4, y + 16);
        }
        ctx.stroke();
        if (!this.reduce && Math.random() < 0.6)
          this.add({
            x: r.x0 + Math.random() * (r.x1 - r.x0),
            y: r.ground - 2,
            vx: 0,
            vy: -50,
            color: '#bfdbfe',
            size: 2,
            life: 0.3,
          });
      }
      ctx.restore();
      this.rains = this.rains.filter((r) => r.life > 0);
    }
    if (this.winds.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of this.winds) {
        w.life -= dt;
        const t = 1 - w.life / 0.7;
        ctx.strokeStyle = `rgba(217,249,157,${0.7 * (1 - t)})`;
        ctx.lineWidth = 3;
        for (let i = -3; i <= 3; i++) {
          const x0 = w.x + w.f * (20 + t * 420);
          const y = w.y + i * 22 + Math.sin(nowMs / 80 + i) * 4;
          ctx.beginPath();
          ctx.moveTo(x0 - w.f * 90, y);
          ctx.quadraticCurveTo(x0 - w.f * 40, y - 10, x0, y);
          ctx.stroke();
        }
      }
      ctx.restore();
      this.winds = this.winds.filter((w) => w.life > 0);
    }
    const p = this.pillar;
    if (p) {
      p.life -= dt;
      const width = p.strike ? 90 * Math.max(0, p.life / 0.9) + 20 : 14 + (1.2 - p.life) * 30;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(p.x - width, 0, p.x + width, 0);
      g.addColorStop(0, 'rgba(253,224,71,0)');
      g.addColorStop(0.5, p.strike ? 'rgba(255,255,240,0.95)' : 'rgba(253,224,71,0.6)');
      g.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - width, this.camY - 20, width * 2, p.ground - this.camY + 20);
      ctx.restore();
      if (p.life <= 0) this.pillar = null;
    }
  }

  gateOpened(id: number, reduce: boolean): void {
    const g = this.level.gates[id];
    if (!g) return;
    const x = g.col * T + T / 2;
    if (g.fire) {
      // Rain hits the flames: a column of steam.
      for (let r = 0; r <= g.rowBottom; r += 2)
        for (let k = 0; k < (reduce ? 1 : 3); k++)
          this.add({
            x: x + (Math.random() - 0.5) * 30,
            y: r * T,
            vx: (Math.random() - 0.5) * 40,
            vy: -40 - Math.random() * 60,
            color: '#e2e8f0',
            size: 6,
            life: 1.2,
            grow: 10,
          });
      this.flash('#7dd3fc', 0.18);
      return;
    }
    for (let r = 0; r <= g.rowBottom; r += 3) this.spark(x, r * T, '#86efac', 4, reduce, 140);
    this.flash('#22c55e', 0.15);
  }

  private drawStyleFloats(dt: number): void {
    const ctx = this.ctx;
    for (const f of this.styleFloats) {
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y -= 26 * dt;
      const pop = f.life > 0.85 ? 1 + (f.life - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, f.life * 2.5);
      ctx.font = `${Math.round((f.mine ? 16 : 12) * pop)}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10,8,14,0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.mine ? '#fde047' : '#e5e7eb';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    this.styleFloats = this.styleFloats.filter((f) => f.life > 0);
  }

  /** New bullets this frame: muzzle flashes and ejected shell casings. */
  private spawnShotEffects(s: Snapshot): void {
    const next = new Set<number>();
    for (const b of s.bullets) {
      next.add(b.id);
      if (this.seenBullets.has(b.id)) continue;
      if (this.seenBullets.size === 0 && next.size === 1 && s.bullets.length > 3) continue;
      if (b.e === 0) {
        if (!this.reduce)
          this.add({
            x: b.x - 6,
            y: b.y,
            vx: -Math.sign(b.vx || 1) * (40 + Math.random() * 40),
            vy: -120 - Math.random() * 60,
            life: 0.6,
            size: 2,
            color: '#e9c46a',
            grav: 900,
          });
        this.add({ x: b.x, y: b.y, life: 0.06, size: 12, color: BULLET_COLOR[b.w] as string, add: true });
      } else this.add({ x: b.x, y: b.y, life: 0.08, size: 14, color: '#ff4d4d', add: true });
    }
    this.seenBullets = next;
  }

  private glow(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.restore();
  }

  private stepParticles(dt: number): void {
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
      if (p.spin) p.rot = (p.rot ?? 0) + p.spin * dt;
      next.push(p);
    }
    this.particles = next;
    for (const r of this.rings) {
      r.life -= dt;
      r.r += 260 * dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    // Smoke, debris and rings, then everything that glows (added light), each drawn at world resolution and
    // blown up with hard edges, so effects share the sprites' pixel grid.
    if (this.particles.some((p) => !p.add) || this.rings.length)
      this.pixelated(() => this.drawParticles(false));
    if (this.particles.some((p) => p.add)) this.pixelated(() => this.drawParticles(true), 'lighter');
  }

  private drawParticles(add: boolean): void {
    const ctx = this.ctx;
    const fx = this.fx.ready ? this.fx : null;
    if (add) ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.add !== add) continue;
      if (p.anim && !fx) continue; // a flipbook has no plain stand-in
      ctx.globalAlpha = p.anim ? 1 : Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      if (p.tex && fx) {
        const n = fx.count(p.tex);
        const v = p.anim ? Math.min(n - 1, Math.floor((1 - p.life / p.max) * n)) : (p.v ?? 0);
        fx.draw(ctx, p.tex, v, p.x, p.y, p.size, p.rot ?? 0, p.color);
      } else if (p.size > 5 || add) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (add) return;
    ctx.lineWidth = 2;
    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = r.life / r.max;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Weather and atmosphere: fireflies, embers, snowflakes, sand dust or rain, picked by the zone's art style. */
  private drawAmbient(dt: number, nowMs: number): void {
    if (this.reduce) return;
    const ctx = this.ctx;
    const kind = ZONES[zoneAt(this.lvl, this.camX + this.viewW / 2)].ambient;
    const A = AMBIENT[kind];
    const rnd = Math.random;
    while (this.ambient.length < A.count)
      this.ambient.push({
        x: this.camX + rnd() * (this.viewW + 80) - 40,
        y: A.low
          ? FULL_H - 140 - rnd() * 170
          : A.vy > 0
            ? this.camY - 20 + rnd() * this.viewH * 0.4
            : this.camY + rnd() * this.viewH,
        vx: A.vx + (rnd() - 0.5) * A.spread,
        vy: A.vy * (0.7 + rnd() * 0.6),
        life: 3 + rnd() * 4,
        max: 7,
        size: A.w,
        color: A.color,
        add: A.glow,
        grav: 0,
        grow: A.h,
      });
    ctx.save();
    for (const p of this.ambient) {
      p.life -= dt;
      p.x += (p.vx + (A.sway ? Math.sin(nowMs / 700 + p.y) * A.sway : 0)) * dt;
      p.y += p.vy * dt;
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      const tw = A.glow ? 0.4 + 0.6 * Math.abs(Math.sin(nowMs / 400 + p.x)) : 1;
      ctx.globalAlpha = Math.min(1, p.life) * tw * A.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.grow);
    }
    ctx.restore();
    this.ambient = this.ambient.filter(
      (p) =>
        p.life > 0 &&
        p.x > this.camX - 60 &&
        p.x < this.camX + this.viewW + 60 &&
        p.y > this.camY - 60 &&
        p.y < this.camY + this.viewH + 40,
    );
  }

  private drawFloats(dt: number): void {
    const next: FloatText[] = [];
    for (const f of this.floats) {
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y -= 34 * dt;
      this.ctx.globalAlpha = Math.min(1, f.life * 2);
      this.label(f.text, f.x, f.y, f.color, 14);
      next.push(f);
    }
    this.ctx.globalAlpha = 1;
    this.floats = next;
  }

  // ------------------------------------------------------------ screen space

  /** Zone colour grade + vignette: a cohesive, cinematic look. */
  /**
   * The `dark` hazard (Maya): the world goes dark and only a pool of light round each soldier and the glow of
   * each enemy stays. Painted at a quarter of the screen's resolution (it is all soft light) and stretched.
   */
  private drawMaya(s: Snapshot, players: PlayerSnapshot[]): void {
    const d = darknessAt(this.lvl.hazard, s.tick, GAME_CONFIG.tickRate);
    if (d <= 0) return;
    const q = 4;
    const w = Math.ceil(this.canvas.width / q);
    const h = Math.ceil(this.canvas.height / q);
    const c = this.maya ?? (this.maya = document.createElement('canvas'));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.fillStyle = `rgba(8, 4, 20, ${0.93 * d})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const k = this.scale / q;
    const hole = (x: number, y: number, r: number, a: number): void => {
      const sx = (x - this.camX) * k;
      const sy = (y - this.camY) * k;
      const rr = r * k;
      if (sx < -rr || sx > w + rr) return;
      const gr = g.createRadialGradient(sx, sy, rr * 0.25, sx, sy, rr);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
    };
    for (const p of players) if (p.st === 0) hole(p.x, p.y - 24, 210, 1);
    // shots stay visible in the dark: being hit by something unseen would be unfair
    for (const b of s.bullets) hole(b.x, b.y, 34, 0.9);
    for (const e of s.enemies) {
      const boss = e.k === 'walker' || e.k === 'gunship' || e.k === 'boss';
      hole(e.x, e.y - (boss ? 70 : 22), boss ? 170 : 60, boss ? 0.85 : 0.6);
    }
    const ctx = this.ctx;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, 0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = smooth;
  }

  /** The zone's colour grade and the vignette, painted once per zone and size and copied each frame. */
  private drawGrade(): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const grade = ZONES[zoneAt(this.lvl, this.camX + this.viewW / 2)].grade;
    const key = `${grade}|${W}|${H}`;
    if (this.gradeKey !== key || !this.grade) {
      this.gradeKey = key;
      const c = this.grade ?? (this.grade = document.createElement('canvas'));
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      if (g) {
        g.fillStyle = grade;
        g.fillRect(0, 0, W, H);
        const v = g.createRadialGradient(
          W / 2,
          H * 0.55,
          Math.min(W, H) * 0.45,
          W / 2,
          H * 0.55,
          Math.max(W, H) * 0.75,
        );
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(8,4,14,0.55)');
        g.fillStyle = v;
        g.fillRect(0, 0, W, H);
      }
    }
    this.ctx.drawImage(this.grade, 0, 0);
  }

  private drawOffscreenMarkers(players: PlayerSnapshot[], meId: string, nowMs: number): void {
    const ctx = this.ctx;
    const cssW = this.canvas.width / this.dpr;
    const k = this.scale / this.dpr;
    const usedL: number[] = [];
    const usedR: number[] = [];
    for (const p of players) {
      if (p.id === meId) continue;
      const sx = (p.x - this.camX) * k;
      if (sx >= 0 && sx <= cssW) continue;
      const left = sx < 0;
      let yy = Math.max(84, Math.min(this.canvas.height / this.dpr - 110, (p.y - 30 - this.camY) * k));
      const used = left ? usedL : usedR;
      while (used.some((u) => Math.abs(u - yy) < 40)) yy += 42;
      used.push(yy);
      const hero = heroOf(p.hr ?? p.s);
      const down = p.st === 1;
      const ex = left ? 22 : cssW - 22;
      ctx.globalAlpha = down ? 0.65 + 0.35 * Math.sin(nowMs / 140) : 0.95;
      ctx.fillStyle = down ? '#dc2626' : hero.color;
      ctx.strokeStyle = '#120f17';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, yy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      if (left) {
        ctx.moveTo(ex - 22, yy);
        ctx.lineTo(ex - 12, yy - 8);
        ctx.lineTo(ex - 12, yy + 8);
      } else {
        ctx.moveTo(ex + 22, yy);
        ctx.lineTo(ex + 12, yy - 8);
        ctx.lineTo(ex + 12, yy + 8);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(heroPortrait(hero.id), ex - 11, yy - 12, 22, 22);
      const dist = Math.round(Math.abs(p.x - (this.camX + this.viewW / 2)) / T);
      ctx.font = `600 11px ${FONT}`;
      ctx.textAlign = left ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      const text = `${down ? 'KO · ' : ''}${p.n} ${dist}m`;
      const tx = left ? ex - 12 : ex + 12;
      ctx.strokeText(text, tx, yy + 25);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, tx, yy + 25);
    }
  }

  /** Mission strip: checkpoints, gates, boss and a portrait dot per friend. */
  private drawProgress(s: Snapshot, players: PlayerSnapshot[], meId: string): void {
    const ctx = this.ctx;
    const cssW = this.canvas.width / this.dpr;
    const W = levelWidth(this.level);
    const barW = Math.min(440, cssW * 0.44);
    const x0 = (cssW - barW) / 2;
    const y0 = 58;
    ctx.fillStyle = 'rgba(12,10,18,0.7)';
    roundRect(ctx, x0 - 10, y0 - 9, barW + 20, 18, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, y0 - 1.5, barW, 3);
    const px = (x: number): number => x0 + (x / W) * barW;
    const lead = Math.max(0, ...players.map((p) => p.x));
    ctx.fillStyle = 'rgba(255, 196, 0, 0.75)';
    ctx.fillRect(x0, y0 - 1.5, px(lead) - x0, 3);
    for (const cp of this.level.checkpoints) {
      ctx.fillStyle = s.cp > cp.id ? '#22c55e' : '#a8a29e';
      ctx.fillRect(px(cp.x) - 1, y0 - 6, 2, 12);
    }
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const a of this.level.arenas) {
      const cleared = a.gate >= 0 ? this.gateOpen(s, a.gate) : s.result === 'won';
      const x = px(a.boss ? (this.level.bosses.find((b) => b.arena === a.id)?.x ?? a.right) : a.right);
      if (a.boss) {
        ctx.fillStyle = cleared ? '#57534e' : '#ef4444';
        ctx.fillText('☠', x, y0);
      } else {
        ctx.fillStyle = cleared ? '#22c55e' : '#f4c430';
        ctx.fillRect(x - 2.5, y0 - 6, 5, 12);
      }
    }
    for (const p of players) {
      const hero = heroOf(p.hr ?? p.s);
      const mine = p.id === meId;
      ctx.fillStyle = p.st === 1 ? '#dc2626' : hero.color;
      ctx.strokeStyle = mine ? '#ffffff' : '#120f17';
      ctx.lineWidth = mine ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(px(p.x), y0, mine ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ text helpers (world space)

  private label(text: string, x: number, y: number, color: string, size: number): void {
    const ctx = this.ctx;
    ctx.font = `600 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,8,14,0.8)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private nameTag(text: string, x: number, y: number, color: string): void {
    const ctx = this.ctx;
    ctx.font = `600 10px ${FONT}`;
    const w = Math.ceil(ctx.measureText(text).width) + 10;
    ctx.fillStyle = 'rgba(12,10,18,0.78)';
    roundRect(ctx, Math.round(x - w / 2), Math.round(y - 7), w, 14, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x - w / 2) + 2, Math.round(y - 5), 2, 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + 2, y + 0.5);
  }

  /** In-world signboard (the squad-gate lesson). */
  private banner(x: number, y: number, title: string, line: string, status: string): void {
    const ctx = this.ctx;
    ctx.font = `600 12px ${FONT}`;
    const w = Math.max(170, ctx.measureText(line).width + 24);
    ctx.fillStyle = 'rgba(12,10,18,0.82)';
    roundRect(ctx, x - w / 2, y - 18, w, 58, 6);
    ctx.fill();
    ctx.fillStyle = '#f4c430';
    ctx.fillRect(x - w / 2, y - 18, w, 3);
    this.label(title, x, y - 4, '#f4c430', 14);
    this.label(line, x, y + 13, '#ffffff', 11);
    this.label(status, x, y + 28, '#fde68a', 11);
  }

  /** Hero portrait into a small canvas (lobby, results, HUD). */
  static drawIcon(c: HTMLCanvasElement, hero: number): void {
    const g = c.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(heroPortrait(hero), 0, 0, c.width, c.height);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
