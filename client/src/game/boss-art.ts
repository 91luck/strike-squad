import { ATTACK, GAME_CONFIG, type EnemySnapshot, type Faction } from '@strikesquad/shared';
import { tone } from './sprites';

/**
 * Themed boss bodies. Every mission keeps the same three boss *behaviours* (walker, gunship, final stronghold:
 * same attacks, timings and hit boxes, decided by the simulation), but each faction gives them a different body:
 *
 *   faction   walker           gunship          final stronghold
 *   pharaoh   giant scorpion   sun falcon       Anubis colossus on a pyramid
 *   norse     Fenrir wolf      thunder god      frost giant
 *   olympus   minotaur         storm harpy      Zeus on his temple
 *   demon     inferno beast    fire dragon      demon king on his throne
 *   void      xeno crawler     UFO saucer       hive queen
 *
 * Attack tells stay where players learned them (the glow before a lob, the red path before a charge, the sight line
 * before a burst), drawn from the same anchor points as the army machines in renderer.ts.
 */

type Ctx = CanvasRenderingContext2D;
const INK = '#120f17';

export interface Particle {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  color?: string;
  add?: boolean;
  grow?: number;
  grav?: number;
}

/** What a boss painter may use from the renderer (drawing context and its effect helpers). */
export interface BossKit {
  ctx: Ctx;
  reduce: boolean;
  glow(x: number, y: number, r: number, color: string): void;
  add(p: Particle): void;
  warnIcon(x: number, y: number, nowMs: number): void;
  sightLine(x: number, y: number, angle: number, len: number, k: number): void;
  shadowAt(x: number, y: number, w: number, a?: number): void;
  label(text: string, x: number, y: number, color: string, size: number): void;
}

/** Attack timing of the current snapshot (see Renderer.atk). */
export interface AtkInfo {
  t: number;
  wind: number;
  telegraph: boolean;
}

type Themed = Exclude<Faction, 'army'>;

// ------------------------------------------------------------------ drawing helpers

function poly(ctx: Ctx, pts: number[], fill: string, ink = true): void {
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] as number, pts[i + 1] as number);
  ctx.closePath();
  if (ink) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

function ell(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  ink = true,
  rot = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  if (ink) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A limb or tail: an inked stroke through the points. */
function limb(ctx: Ctx, pts: number[], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0] as number, pts[1] as number);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] as number, pts[i + 1] as number);
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Hit flash: lighten a colour while the boss is being hit. */
const lit = (flash: boolean) => (c: string) => (flash ? tone(c, 0.28) : c);

/** Phase-2 damage particles in the faction's flavour (sand, frost, sparks, embers, slime). */
const DAMAGE_PUFF: Record<Themed, string> = {
  pharaoh: 'rgba(214,180,120,0.6)',
  norse: 'rgba(224,242,254,0.7)',
  olympus: 'rgba(191,219,254,0.7)',
  demon: 'rgba(249,115,22,0.75)',
  void: 'rgba(74,222,128,0.6)',
};

function puff(k: BossKit, faction: Themed, x: number, y: number, chance: number): void {
  if (k.reduce || Math.random() > chance) return;
  const hot = faction === 'demon' || faction === 'olympus';
  k.add({
    x: x + (Math.random() - 0.5) * 60,
    y,
    vx: (Math.random() - 0.5) * 20,
    vy: hot ? -60 : -30,
    life: hot ? 0.7 : 1.1,
    size: hot ? 4 : 8,
    color: DAMAGE_PUFF[faction],
    add: hot,
    grow: hot ? -4 : 10,
    grav: hot ? 0 : -10,
  });
}

// ------------------------------------------------------------------ walkers

/** Boss 1 shape: a ground beast, 132 x 96, feet at e.y. Lobbed shots leave near (54, -92), bursts near (60, -60). */
export function drawThemedWalker(
  k: BossKit,
  faction: Themed,
  e: EnemySnapshot,
  nowMs: number,
  a: AtkInfo,
): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.walker;
  const L = lit(e.h === 1);
  const charge = e.at === ATTACK.charge;
  const crouch = e.at === ATTACK.stomp && a.telegraph ? 8 : 0;
  const walk = Math.sin(e.x / 16);
  const hot = charge && a.telegraph;
  ctx.save();
  ctx.translate(Math.round(e.x), Math.round(e.y));
  if (hot && !k.reduce) ctx.translate((Math.random() - 0.5) * 3, 0);
  ctx.scale(e.f, 1);
  k.shadowAt(0, 0, c.width * 0.55);
  let eye: [number, number];
  let eyeCol: string;
  if (faction === 'pharaoh') {
    // GIANT SCORPION: eight legs, two pincers, a segmented tail arching over to a glowing stinger.
    const shell = L('#3f2a14');
    const plate = L('#8a5a1e');
    const gold = '#d4a017';
    for (let i = 0; i < 4; i++) {
      const lx = -40 + i * 22;
      const ph = Math.sin(e.x / 14 + i * 1.3) * 5;
      limb(ctx, [lx, -30 + crouch, lx - 14 + ph, -46 + crouch, lx - 22 + ph, -2], 5, tone(shell, -0.1));
      limb(ctx, [lx + 4, -30 + crouch, lx + 18 - ph, -44 + crouch, lx + 26 - ph, -2], 6, shell);
    }
    // tail
    const sting: [number, number] = [36, -96];
    limb(ctx, [-56, -36 + crouch, -78, -76, -60, -112, -20, -122, 18, -112, sting[0], sting[1]], 15, plate);
    for (const [x, y] of [
      [-74, -70],
      [-64, -104],
      [-30, -120],
      [6, -116],
    ] as const)
      ell(ctx, x, y, 7, 6, gold, false);
    poly(
      ctx,
      [sting[0] - 6, sting[1] - 6, sting[0] + 14, sting[1] + 2, sting[0] - 2, sting[1] + 10],
      L('#1c1208'),
    );
    // body plates
    for (let i = 0; i < 5; i++) ell(ctx, -48 + i * 18, -36 + crouch, 16, 18 - i, i % 2 ? plate : shell);
    ell(ctx, 38, -38 + crouch, 22, 17, plate);
    ctx.fillStyle = gold;
    for (let i = 0; i < 5; i++) ctx.fillRect(-56 + i * 18, -52 + crouch, 10, 3);
    // pincers
    for (const [dy, open] of [
      [-20, 1],
      [-46, -1],
    ] as const) {
      limb(ctx, [50, -34 + crouch, 64, dy + crouch, 78, dy + crouch], 9, plate);
      const o = (e.at === ATTACK.mg && a.telegraph ? 6 : 3) * open;
      poly(
        ctx,
        [
          74,
          dy - 10 + crouch,
          98,
          dy - 4 + crouch - o,
          80,
          dy + crouch,
          98,
          dy + 4 + crouch + o,
          74,
          dy + 10 + crouch,
        ],
        L('#b7791f'),
      );
    }
    eye = [54, -46 + crouch];
    eyeCol = '#a3e635';
    if (e.at === ATTACK.cannon && a.telegraph)
      k.glow(e.x + e.f * sting[0], e.y + sting[1], 6 + 12 * prog(a), '#a3e635');
  } else if (faction === 'norse' || faction === 'demon') {
    // FENRIR (a huge grey wolf with a broken chain) / INFERNO BEAST (a horned, lava-cracked hellhound).
    const wolf = faction === 'norse';
    const fur = L(wolf ? '#4b5563' : '#2a0e0e');
    const dark = L(wolf ? '#1f2937' : '#150606');
    const light = wolf ? '#9ca3af' : '#7f1d1d';
    const stride = walk * (charge ? 14 : 9);
    const legs: [number, number][] = [
      [-42, stride],
      [-26, -stride],
      [30, -stride],
      [46, stride],
    ];
    legs.forEach(([lx, ph], i) =>
      limb(ctx, [lx, -46 + crouch, lx + 6 + ph * 0.5, -24 + crouch / 2, lx + ph, -3], 12, i % 2 ? dark : fur),
    );
    // tail
    limb(ctx, [-60, -62 + crouch, -84, -78 - walk * 6, -96, -64], 12, fur);
    // body
    ell(ctx, -6, -60 + crouch, 62, 28, fur);
    ell(ctx, -10, -50 + crouch, 50, 14, dark, false);
    // back ridge: frost spikes / bone spikes
    for (let i = 0; i < 7; i++) {
      const x = -50 + i * 14;
      poly(
        ctx,
        [x - 6, -82 + crouch, x, -98 + crouch - (i % 2) * 6, x + 6, -82 + crouch],
        wolf ? '#e0f2fe' : '#e7e5e4',
      );
    }
    if (!wolf) {
      // lava cracks
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-40, -66 + crouch);
      ctx.lineTo(-24, -56 + crouch);
      ctx.lineTo(-8, -68 + crouch);
      ctx.lineTo(10, -54 + crouch);
      ctx.lineTo(28, -64 + crouch);
      ctx.stroke();
    }
    // neck + head
    const hy = -78 + crouch + (charge ? 10 : 0);
    poly(ctx, [36, -78 + crouch, 58, hy - 14, 74, hy - 4, 56, -44 + crouch], fur);
    poly(ctx, [52, hy - 16, 90, hy - 4, 92, hy + 6, 80, hy + 16, 54, hy + 12], fur);
    poly(ctx, [74, hy + 6, 94, hy + 6, 84, hy + 18], dark); // open jaw
    ctx.fillStyle = '#f5f5f4';
    for (let i = 0; i < 3; i++) ctx.fillRect(78 + i * 5, hy + 6, 2, 4);
    if (wolf) {
      poly(ctx, [54, hy - 14, 58, hy - 34, 66, hy - 14], fur);
      // the broken chain on its neck
      ctx.fillStyle = '#9ca3af';
      for (let i = 0; i < 4; i++) ctx.fillRect(40 + i * 6, -60 + crouch + i * 4, 6, 4);
    } else {
      // curved horns and a mane of flames
      limb(ctx, [60, hy - 12, 56, hy - 34, 70, hy - 44], 5, '#e7e5e4');
      limb(ctx, [68, hy - 10, 72, hy - 30, 86, hy - 34], 4, '#d6d3d1');
      if (!k.reduce)
        for (let i = 0; i < 4; i++)
          k.add({
            x: e.x + e.f * (30 + i * 8),
            y: e.y - 88 + crouch,
            vy: -40 - Math.random() * 40,
            life: 0.35,
            size: 5,
            color: '#fb923c',
            add: true,
            grow: -8,
          });
    }
    ctx.fillStyle = light;
    ctx.fillRect(54, hy - 10, 26, 3);
    eye = [74, hy - 6];
    eyeCol = wolf ? '#38bdf8' : '#fde047';
    if (e.at === ATTACK.cannon && a.telegraph)
      k.glow(e.x + e.f * 88, e.y + hy + 10, 6 + 14 * prog(a), wolf ? '#bae6fd' : '#f97316');
  } else if (faction === 'olympus') {
    // MINOTAUR: a bronze-armoured bull-man with a double axe.
    const hide = L('#7c3f22');
    const dark = L('#4a2412');
    const bronze = L('#b7791f');
    for (const [i, side] of [-1, 1].entries()) {
      const ph = i === 0 ? walk : -walk;
      const hx = side * 22;
      limb(
        ctx,
        [hx, -50 + crouch, hx + 12 + ph * 6, -28 + crouch / 2, hx + ph * 12, -6],
        13,
        i === 0 ? dark : hide,
      );
      ctx.fillStyle = INK;
      ctx.fillRect(hx + ph * 12 - 9, -8, 18, 8); // hooves
    }
    poly(ctx, [-34, -48 + crouch, 34, -48 + crouch, 26, -32 + crouch, -26, -32 + crouch], L('#7f1d1d')); // kilt
    // torso
    poly(ctx, [-38, -104 + crouch, 40, -110 + crouch, 32, -46 + crouch, -30, -46 + crouch], hide);
    ctx.fillStyle = bronze;
    ctx.fillRect(-26, -96 + crouch, 52, 8); // chest strap
    ctx.fillRect(-28, -54 + crouch, 58, 6); // belt
    // back arm and the double axe held up front
    limb(ctx, [-30, -98 + crouch, -44, -70 + crouch, -36, -54 + crouch], 12, dark);
    const axeUp = e.at === ATTACK.cannon && a.telegraph ? -16 : 0;
    limb(ctx, [30, -98 + crouch, 52, -78 + crouch + axeUp, 60, -96 + crouch + axeUp], 12, hide);
    limb(ctx, [60, -60 + crouch + axeUp, 58, -128 + crouch + axeUp], 4, '#6b4423');
    for (const s of [-1, 1])
      poly(
        ctx,
        [
          58,
          -118 + crouch + axeUp,
          58 + s * 22,
          -134 + crouch + axeUp,
          58 + s * 26,
          -112 + crouch + axeUp,
          58 + s * 22,
          -96 + crouch + axeUp,
        ],
        L('#cbd5e1'),
      );
    // bull head with horns
    const hy = -114 + crouch + (charge ? 14 : 0);
    poly(ctx, [12, hy - 6, 42, hy - 10, 58, hy + 8, 54, hy + 20, 24, hy + 18], dark);
    ell(ctx, 52, hy + 14, 9, 7, L('#a16207'));
    ctx.fillStyle = INK;
    ctx.fillRect(54, hy + 12, 2, 2);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(58, hy + 14, 5, 3); // nose ring
    limb(ctx, [20, hy - 6, 6, hy - 22, 14, hy - 36], 6, '#f5f0e1');
    limb(ctx, [38, hy - 8, 52, hy - 26, 46, hy - 40], 6, '#f5f0e1');
    eye = [40, hy + 2];
    eyeCol = '#ef4444';
    if (e.at === ATTACK.cannon && a.telegraph)
      k.glow(e.x + e.f * 58, e.y - 118 + crouch, 6 + 14 * prog(a), '#93c5fd');
  } else {
    // XENO CRAWLER: an alien insect with six legs, a ridged head, mandibles and glowing sacs.
    const chitin = L('#1f3b2a');
    const dark = L('#0f1f16');
    for (let i = 0; i < 3; i++) {
      const lx = -36 + i * 34;
      const ph = Math.sin(e.x / 12 + i * 2) * 8;
      limb(ctx, [lx, -46 + crouch, lx - 18 + ph, -82 + crouch, lx - 30 + ph, -2], 5, dark);
      limb(ctx, [lx + 6, -44 + crouch, lx + 24 - ph, -76 + crouch, lx + 34 - ph, -2], 6, chitin);
    }
    ell(ctx, -30, -54 + crouch, 40, 24, chitin);
    // glowing egg sacs
    const pulse = 0.6 + 0.4 * Math.sin(nowMs / 220);
    for (const [x, y] of [
      [-46, -66],
      [-26, -72],
      [-36, -50],
    ] as const) {
      ell(ctx, x, y + crouch, 9, 7, `rgba(74,222,128,${pulse})`);
      k.glow(e.x + e.f * x, e.y + y + crouch, 10 * pulse, 'rgba(74,222,128,0.45)');
    }
    ell(ctx, 18, -56 + crouch, 26, 18, chitin);
    // long ridged head
    const hy = -66 + crouch + (charge ? 8 : 0);
    poly(ctx, [30, hy - 16, 64, hy - 22, 96, hy - 6, 88, hy + 10, 40, hy + 14], L('#2f5b3f'));
    for (let i = 0; i < 4; i++)
      poly(ctx, [36 + i * 12, hy - 16, 42 + i * 12, hy - 30, 48 + i * 12, hy - 16], dark);
    limb(ctx, [84, hy + 8, 100, hy + 18], 4, '#bbf7d0');
    limb(ctx, [80, hy + 10, 94, hy + 24], 4, '#bbf7d0');
    for (let i = 0; i < 3; i++) ell(ctx, 66 + i * 8, hy - 6 + (i % 2) * 4, 3, 3, '#a7f3d0', false);
    eye = [74, hy - 4];
    eyeCol = '#4ade80';
    if (e.at === ATTACK.cannon && a.telegraph) k.glow(e.x + e.f * 60, e.y - 92, 6 + 14 * prog(a), '#4ade80');
  }
  ctx.restore();
  const pulse = 0.6 + 0.4 * Math.sin(nowMs / (hot ? 50 : 200));
  k.glow(e.x + e.f * eye[0], e.y + eye[1], hot ? 16 : 7 * pulse, hot ? '#ffffff' : eyeCol);
  walkerTells(k, e, a, nowMs, faction);
  if (e.ph >= 2) puff(k, faction, e.x, e.y - c.height + 10, 0.3);
}

function prog(a: AtkInfo): number {
  return Math.min(1, a.t / Math.max(0.01, a.wind));
}

function walkerTells(k: BossKit, e: EnemySnapshot, a: AtkInfo, nowMs: number, faction: Themed): void {
  if (!a.telegraph) return;
  const c = GAME_CONFIG.enemies.walker;
  const p = prog(a);
  if (e.at === ATTACK.charge) {
    k.warnIcon(e.x, e.y - c.height - 40, nowMs);
    const ctx = k.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const len = 520;
    const g = ctx.createLinearGradient(e.x, 0, e.x + e.f * len, 0);
    g.addColorStop(0, `rgba(255,40,40,${0.25 + p * 0.35})`);
    g.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(e.f > 0 ? e.x : e.x - len, e.y - c.height + 10, len, c.height - 12);
    ctx.restore();
    if (!k.reduce && Math.random() < 0.7)
      k.add({
        x: e.x - e.f * 60,
        y: e.y - 10,
        vx: -e.f * (60 + Math.random() * 60),
        vy: -20,
        life: 0.4,
        size: 7,
        color: faction === 'norse' ? '#e0f2fe' : faction === 'void' ? '#86efac' : '#d6b478',
        add: faction !== 'norse',
        grow: -8,
      });
  }
  if (e.at === ATTACK.stomp) k.warnIcon(e.x, e.y - c.height - 40, nowMs);
  if (e.at === ATTACK.mg) k.sightLine(e.x + e.f * 60, e.y - 60, e.a / 100, 420, p);
}

// ------------------------------------------------------------------ gunships

const FLYER_SCALE = 0.85;

/** Boss 2 shape: a flyer, 168 x 64 around (e.x, e.y - 32). Burst gun at (44, +18); bombs drop from the belly. */
export function drawThemedGunship(
  k: BossKit,
  faction: Themed,
  e: EnemySnapshot,
  nowMs: number,
  a: AtkInfo,
): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.gunship;
  const L = lit(e.h === 1);
  const cy = e.y - c.height / 2;
  const flap = Math.sin(nowMs / 140) * 0.6;
  k.shadowAt(e.x, 14 * GAME_CONFIG.tile, 70, 0.18);
  ctx.save();
  // Drawn at 85 % and nudged down: phones show little sky above a flyer, so keep wings and heads compact.
  ctx.translate(Math.round(e.x), Math.round(cy) + 6);
  ctx.scale(e.f * FLYER_SCALE, FLYER_SCALE);
  const hot = (e.at === ATTACK.missiles || e.at === ATTACK.bombs) && a.telegraph;
  let core: [number, number, string];
  if (faction === 'pharaoh' || faction === 'olympus') {
    // SUN FALCON (golden, a sun disc over its head) / STORM HARPY (bronze feathers, a wild-haired face, talons).
    const falcon = faction === 'pharaoh';
    const main = L(falcon ? '#b7791f' : '#78350f');
    const wingC = L(falcon ? '#d4a017' : '#92400e');
    const tip = falcon ? '#1d4ed8' : '#451a03';
    const wy = flap * 26;
    // far wing
    poly(ctx, [-10, -10, -70, -40 - wy, -96, -20 - wy * 0.6, -40, 6], tone(wingC, -0.25));
    // tail fan
    poly(ctx, [-44, 0, -90, -8, -94, 10, -88, 22, -44, 10], main);
    // body
    ell(ctx, 0, 0, 52, 20, main);
    ctx.fillStyle = tone(main, 0.25);
    for (let i = 0; i < 5; i++) ctx.fillRect(-30 + i * 12, -6 + (i % 2) * 6, 8, 3);
    // talons
    const grab = e.at === ATTACK.troops && a.telegraph ? 8 : 0;
    limb(ctx, [-6, 16, -10, 32 + grab], 5, '#facc15');
    limb(ctx, [12, 16, 10, 34 + grab], 5, '#facc15');
    // head
    if (falcon) {
      ell(ctx, 48, -14, 18, 15, main);
      poly(ctx, [62, -18, 80, -10, 64, -4], '#1f2937'); // hooked beak
      ctx.fillStyle = INK;
      ctx.fillRect(48, -18, 10, 2);
      ctx.fillRect(52, -16, 2, 10); // eye-of-the-falcon marking
      ell(ctx, 44, -40, 14, 14, hot ? '#ffffff' : '#fde047'); // sun disc
      k.glow(e.x + e.f * 44, cy - 40, 20, 'rgba(253,224,71,0.5)');
      core = [54, -18, '#fde047'];
    } else {
      ell(ctx, 48, -14, 14, 15, L('#d6b9a4'));
      limb(ctx, [36, -26, 24, -10, 30, 6], 7, '#1c1917'); // wild hair
      limb(ctx, [42, -28, 30, -40], 5, '#1c1917');
      ctx.fillStyle = '#facc15';
      ctx.fillRect(40, -30, 16, 4); // bronze crown
      ctx.fillStyle = INK;
      ctx.fillRect(54, -6, 6, 2); // snarl
      core = [52, -16, '#93c5fd'];
    }
    // near wing on top
    poly(ctx, [-6, -12, -44, -62 - wy, -84, -70 - wy, -100, -50 - wy * 0.8, -40, 4], wingC);
    ctx.fillStyle = tip;
    for (let i = 0; i < 4; i++) ctx.fillRect(-90 + i * 12, -60 - wy * 0.9 + i * 3, 8, 4);
  } else if (faction === 'norse') {
    // THE THUNDER GOD on a storm cloud: winged helm, red cloak, beard, a hammer crackling with lightning.
    const cloud = L('#374151');
    for (const [x, y, r] of [
      [-60, 14, 24],
      [-24, 20, 28],
      [16, 18, 30],
      [52, 14, 22],
      [-6, 6, 26],
    ] as const)
      ell(ctx, x, y, r, r * 0.6, cloud, false);
    ctx.fillStyle = 'rgba(17,24,39,0.6)';
    ctx.fillRect(-80, 24, 150, 6);
    // cape flowing back
    poly(ctx, [-6, -48, -60 - flap * 6, -30, -70, 6, -10, 6], L('#b91c1c'));
    // body
    poly(ctx, [-14, -50, 18, -50, 22, 4, -18, 4], L('#4b5563'));
    ctx.fillStyle = '#9ca3af';
    for (const x of [-8, 4]) ell(ctx, x, -36, 5, 5, '#d1d5db', false);
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(-18, -8, 40, 5); // belt
    // head: winged helm, blond beard, glowing eyes
    ell(ctx, 4, -64, 14, 14, L('#e0b48c'));
    poly(ctx, [-12, -70, 20, -70, 18, -82, -10, -82], L('#9ca3af'));
    poly(ctx, [-12, -76, -26, -92, -16, -72], '#f5f5f4');
    poly(ctx, [18, -76, 30, -94, 22, -72], '#f5f5f4');
    poly(ctx, [-10, -58, 18, -58, 14, -40, 4, -34, -6, -40], L('#f59e0b'));
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(8, -66, 5, 3);
    // arm raising the hammer
    const raise = hot ? -18 : 0;
    limb(ctx, [16, -44, 36, -36 + raise, 46, -48 + raise], 8, L('#e0b48c'));
    poly(ctx, [36, -68 + raise, 62, -68 + raise, 62, -52 + raise, 36, -52 + raise], L('#9ca3af'));
    limb(ctx, [48, -52 + raise, 46, -36 + raise], 4, '#6b4423');
    core = [49, -60 + raise, '#bae6fd'];
    if (!k.reduce && Math.random() < 0.5) {
      // crackling lightning around the hammer
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let x = 49;
      let y = -60 + raise;
      ctx.moveTo(x, y);
      for (let i = 0; i < 4; i++) {
        x += (Math.random() - 0.3) * 18;
        y += (Math.random() - 0.5) * 18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (faction === 'demon') {
    // FIRE DRAGON: horned head on a long neck, bat wings, a spiked tail, fire in the throat.
    const scale = L('#7f1d1d');
    const belly = L('#f59e0b');
    const membrane = L('#3b0d14');
    const wy = flap * 30;
    poly(ctx, [-20, -10, -60, -64 - wy, -110, -40 - wy * 0.6, -60, 0], tone(membrane, -0.3));
    limb(ctx, [-46, 0, -80, 8, -104, -4, -122, 6], 12, scale);
    poly(ctx, [-122, -4, -138, 6, -122, 14], '#e7e5e4');
    ell(ctx, -6, 2, 46, 20, scale);
    ell(ctx, -2, 12, 34, 8, belly, false);
    for (let i = 0; i < 6; i++)
      poly(ctx, [-36 + i * 12, -16, -30 + i * 12, -28, -24 + i * 12, -16], '#e7e5e4');
    limb(ctx, [30, -6, 50, -24, 66, -22], 14, scale);
    // head
    poly(ctx, [56, -34, 92, -30, 104, -18, 92, -10, 60, -12], scale);
    poly(ctx, [86, -16, 106, -14, 94, -4], '#1a0505'); // jaw open
    limb(ctx, [62, -32, 52, -50, 62, -60], 4, '#e7e5e4');
    limb(ctx, [70, -32, 68, -52, 80, -58], 4, '#d6d3d1');
    core = [96, -12, '#fb923c'];
    // near wing
    poly(ctx, [-14, -14, -34, -78 - wy, -70, -96 - wy, -104, -70 - wy * 0.8, -50, -4], membrane);
    ctx.strokeStyle = '#1a0505';
    ctx.lineWidth = 2;
    for (const [x, y] of [
      [-70, -94],
      [-90, -82],
      [-104, -70],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(-14, -14);
      ctx.lineTo(x, y - wy);
      ctx.stroke();
    }
    if (!k.reduce && Math.random() < 0.6)
      k.add({
        x: e.x + e.f * 104,
        y: cy - 10,
        vx: e.f * 80,
        vy: -10,
        life: 0.3,
        size: 6,
        color: '#fb923c',
        add: true,
        grow: -10,
      });
  } else {
    // UFO MOTHERSHIP: a saucer with a glass dome, a pilot, chasing lights and a tractor beam for drop-offs.
    const hull = L('#94a3b8');
    if (e.at === ATTACK.troops) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 10, 0, 200);
      g.addColorStop(0, 'rgba(134,239,172,0.55)');
      g.addColorStop(1, 'rgba(134,239,172,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-30, 10);
      ctx.lineTo(30, 10);
      ctx.lineTo(70, 200);
      ctx.lineTo(-70, 200);
      ctx.fill();
      ctx.restore();
    }
    ell(ctx, 0, -14, 34, 26, 'rgba(165,243,252,0.45)');
    ell(ctx, 0, -12, 10, 12, L('#8fbf7a'), false); // pilot
    ctx.fillStyle = '#05070d';
    ctx.fillRect(2, -16, 6, 4);
    ell(ctx, 0, 6, 84, 16, hull);
    ell(ctx, 0, 2, 76, 6, tone(hull, 0.25), false);
    ell(ctx, 0, 16, 40, 8, L('#475569'));
    for (let i = 0; i < 8; i++) {
      const on = (Math.floor(nowMs / 120) + i) % 4 === 0;
      ell(ctx, -70 + i * 20, 8, 4, 3, on ? '#f0abfc' : '#67e8f9', false);
    }
    core = [0, 18, hot ? '#ffffff' : '#4ade80'];
  }
  ctx.restore();
  k.glow(e.x + e.f * core[0] * FLYER_SCALE, cy + 6 + core[1] * FLYER_SCALE, hot ? 14 : 8, core[2]);
  if (a.telegraph) {
    const p = prog(a);
    if (e.at === ATTACK.strafe) k.sightLine(e.x + e.f * 44, cy + 18, e.a / 100, 460, p);
    if (e.at === ATTACK.bombs || e.at === ATTACK.troops) k.warnIcon(e.x, cy - 70, nowMs);
    if (e.at === ATTACK.missiles) k.glow(e.x, cy + 24, 6 + p * 10, core[2]);
  }
  if (e.ph >= 2) puff(k, faction, e.x - e.f * 30, cy - 10, 0.35);
}

// ------------------------------------------------------------------ final strongholds

/**
 * Boss 3 shape: a 120 x 220 colossus standing at e.x, feet at e.y, facing left (the squad comes from the left).
 * Volleys leave the two mounts on its left edge (y - 170, y - 70); the beam comes from the base; the glowing core
 * sits at (x - 8, y - 120).
 */
export function drawThemedColossus(
  k: BossKit,
  faction: Themed,
  e: EnemySnapshot,
  dead: boolean,
  nowMs: number,
  a: AtkInfo,
  beamY: number,
): void {
  const ctx = k.ctx;
  const bc = GAME_CONFIG.enemies.boss;
  const L = dead ? (c: string) => tone(c, -0.55) : lit(e.h === 1);
  const W = bc.width;
  const H = bc.height;
  const left = e.x - W / 2;
  const top = e.y - H;
  const ph = e.ph;
  const p = a.telegraph ? prog(a) : 0;
  let mountCol: string;
  let coreCol: string;
  if (faction === 'pharaoh') {
    // ANUBIS COLOSSUS: a stepped pyramid base, a black jackal head with a gold collar, cobra mounts.
    for (let i = 0; i < 6; i++) {
      const inset = i * 8;
      poly(
        ctx,
        [
          left - 10 + inset,
          e.y - i * 22,
          left + W + 10 - inset,
          e.y - i * 22,
          left + W + 10 - inset,
          e.y - (i + 1) * 22,
          left - 10 + inset,
          e.y - (i + 1) * 22,
        ],
        L(i % 2 ? '#c9a46a' : '#d9b77a'),
      );
    }
    const hx = e.x + 4;
    const hy = top + 60;
    poly(ctx, [hx - 34, hy + 50, hx + 34, hy + 50, hx + 26, hy - 10, hx - 26, hy - 10], L('#d4a017')); // collar
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#1d4ed8' : '#f5f0e1';
      ctx.fillRect(hx - 30 + i * 3, hy + 10 + i * 9, 60 - i * 6, 4);
    }
    poly(ctx, [hx - 24, hy, hx + 22, hy, hx + 18, hy - 50, hx - 20, hy - 50], L('#1f1a17')); // head
    poly(ctx, [hx - 20, hy - 46, hx - 28, hy - 96, hx - 6, hy - 50], L('#1f1a17')); // ears
    poly(ctx, [hx + 4, hy - 50, hx + 12, hy - 98, hx + 20, hy - 46], L('#1f1a17'));
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(hx - 22, hy - 76, 4, 22);
    ctx.fillRect(hx + 10, hy - 76, 4, 22);
    poly(ctx, [hx - 22, hy - 22, hx - 62, hy - 12, hx - 60, hy - 2, hx - 22, hy - 4], L('#1f1a17')); // snout, facing left
    mountCol = '#a3e635';
    drawEyes(k, [hx - 16, hy - 30], mountCol, dead, nowMs, ph);
    mounts(k, left, e.y, (y) => {
      // cobra heads
      poly(
        ctx,
        [left - 4, y - 16, left - 30, y - 10, left - 40, y, left - 30, y + 8, left - 4, y + 12],
        L('#1d4ed8'),
      );
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(left - 26, y - 8, 14, 3);
    });
    coreCol = ph === 3 ? '#ef4444' : '#a3e635';
  } else if (faction === 'norse') {
    // FROST GIANT: a giant of blue ice with a white beard and a crown of icicles, ice-crystal fists.
    const skin = L('#5f8fb0');
    poly(ctx, [left - 6, e.y, left + W + 6, e.y, left + W, top + 60, left, top + 60], skin); // torso
    poly(ctx, [left + 4, e.y, left + W - 4, e.y, left + W - 10, e.y - 40, left + 10, e.y - 40], L('#6b5844')); // fur
    ctx.fillStyle = '#d6d3d1';
    for (let x = left + 6; x < left + W - 6; x += 8) ctx.fillRect(x, e.y - 44, 6, 6);
    const hx = e.x;
    const hy = top + 34;
    ell(ctx, hx, hy, 34, 36, skin);
    poly(
      ctx,
      [hx - 30, hy + 4, hx + 30, hy + 4, hx + 22, hy + 60, hx, hy + 76, hx - 22, hy + 60],
      L('#f1f5f9'),
    ); // beard
    for (let i = 0; i < 6; i++)
      poly(
        ctx,
        [hx - 30 + i * 12, hy - 28, hx - 24 + i * 12, hy - 60 - (i % 2) * 14, hx - 18 + i * 12, hy - 28],
        '#e0f2fe',
      );
    mountCol = '#38bdf8';
    drawEyes(k, [hx - 14, hy - 6], mountCol, dead, nowMs, ph);
    mounts(k, left, e.y, (y) => {
      ell(ctx, left - 14, y, 20, 16, L('#5f8fb0'));
      for (let i = 0; i < 3; i++)
        poly(ctx, [left - 30, y - 8 + i * 8, left - 46, y - 10 + i * 8, left - 30, y - 2 + i * 8], '#e0f2fe');
    });
    coreCol = ph === 3 ? '#ffffff' : '#7dd3fc';
  } else if (faction === 'olympus') {
    // ZEUS ON HIS TEMPLE: a marble temple front, the king of the gods rising above it with a lightning bolt.
    poly(
      ctx,
      [left - 12, e.y, left + W + 12, e.y, left + W + 12, e.y - 12, left - 12, e.y - 12],
      L('#d6d0c2'),
    );
    for (let i = 0; i < 5; i++) {
      const x = left - 4 + i * 30;
      poly(ctx, [x, e.y - 12, x + 12, e.y - 12, x + 12, top + 110, x, top + 110], L('#ece8de'));
    }
    poly(
      ctx,
      [left - 16, top + 110, left + W + 16, top + 110, left + W + 16, top + 96, left - 16, top + 96],
      L('#d6d0c2'),
    );
    poly(ctx, [left - 16, top + 96, e.x, top + 66, left + W + 16, top + 96], L('#ece8de'));
    // Zeus: shoulders, white beard, gold laurel, storm eyes
    const hx = e.x;
    const hy = top + 30;
    poly(ctx, [hx - 52, top + 70, hx + 52, top + 70, hx + 40, hy + 10, hx - 40, hy + 10], L('#e0b48c'));
    poly(ctx, [hx - 52, top + 70, hx - 10, hy + 10, hx + 6, top + 70], L('#f5f5f4')); // toga
    ell(ctx, hx, hy - 6, 26, 28, L('#e0b48c'));
    poly(
      ctx,
      [hx - 28, hy - 8, hx - 34, hy - 36, hx, hy - 46, hx + 34, hy - 36, hx + 28, hy - 8],
      L('#f1f5f9'),
    ); // hair
    poly(
      ctx,
      [hx - 26, hy + 2, hx + 26, hy + 2, hx + 18, hy + 44, hx, hy + 56, hx - 18, hy + 44],
      L('#f8fafc'),
    ); // beard
    ctx.fillStyle = '#facc15';
    for (let i = 0; i < 7; i++) ctx.fillRect(hx - 28 + i * 8, hy - 34 - (i % 2) * 3, 6, 4);
    mountCol = '#93c5fd';
    drawEyes(k, [hx - 10, hy - 8], mountCol, dead, nowMs, ph);
    mounts(k, left, e.y, (y) => {
      // lightning bolts held ready
      poly(
        ctx,
        [left - 4, y - 14, left - 22, y - 2, left - 12, y - 2, left - 34, y + 14, left - 20, y, left - 28, y],
        '#fde047',
      );
    });
    coreCol = ph === 3 ? '#ffffff' : '#fde047';
  } else if (faction === 'demon') {
    // DEMON KING: an obsidian throne with lava, the horned king with a crown and a fanged maw, skull mounts.
    poly(ctx, [left - 12, e.y, left + W + 12, e.y, left + W + 6, top + 50, left - 6, top + 50], L('#1c1416'));
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 10, e.y - 10);
    ctx.lineTo(left + 30, e.y - 60);
    ctx.lineTo(left + 20, e.y - 110);
    ctx.moveTo(left + W - 14, e.y - 20);
    ctx.lineTo(left + W - 30, e.y - 80);
    ctx.stroke();
    const hx = e.x;
    const hy = top + 56;
    poly(ctx, [hx - 50, e.y - 40, hx + 50, e.y - 40, hx + 40, hy + 30, hx - 40, hy + 30], L('#5a1010')); // chest
    ell(ctx, hx, hy, 32, 34, L('#9f2a2a'));
    limb(ctx, [hx - 22, hy - 22, hx - 46, hy - 50, hx - 38, hy - 82], 10, '#e7e5e4');
    limb(ctx, [hx + 22, hy - 22, hx + 46, hy - 50, hx + 38, hy - 82], 10, '#e7e5e4');
    poly(
      ctx,
      [
        hx - 24,
        hy - 28,
        hx - 18,
        hy - 46,
        hx - 8,
        hy - 32,
        hx,
        hy - 50,
        hx + 8,
        hy - 32,
        hx + 18,
        hy - 46,
        hx + 24,
        hy - 28,
      ],
      '#facc15',
    );
    poly(ctx, [hx - 20, hy + 12, hx + 20, hy + 12, hx + 12, hy + 26, hx - 12, hy + 26], '#1a0505');
    ctx.fillStyle = '#f5f5f4';
    for (let i = 0; i < 5; i++) ctx.fillRect(hx - 16 + i * 8, hy + 12, 3, 5);
    mountCol = '#f97316';
    drawEyes(k, [hx - 14, hy - 8], '#fde047', dead, nowMs, ph);
    mounts(k, left, e.y, (y) => {
      ell(ctx, left - 14, y, 18, 15, L('#e7e5e4'));
      ctx.fillStyle = '#1a0505';
      ctx.fillRect(left - 28, y - 4, 6, 6);
      ctx.fillRect(left - 34, y + 4, 14, 5);
    });
    coreCol = ph === 3 ? '#ffffff' : '#ef4444';
  } else {
    // HIVE QUEEN: a swollen organic hive with veins, the queen's crested head, many eyes and tentacle maws.
    const flesh = L('#1f3b2a');
    ell(ctx, e.x, e.y - 90, 74, 96, flesh);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(e.x - 50 + i * 24, e.y - 10);
      ctx.quadraticCurveTo(e.x - 30 + i * 18, e.y - 100, e.x - 10 + i * 6, e.y - 170);
      ctx.stroke();
    }
    const hx = e.x - 6;
    const hy = top + 30;
    poly(
      ctx,
      [hx - 40, hy + 30, hx - 30, hy - 30, hx, hy - 70, hx + 30, hy - 30, hx + 40, hy + 30],
      L('#2f5b3f'),
    ); // crest
    for (let i = 0; i < 5; i++)
      poly(
        ctx,
        [hx - 30 + i * 15, hy - 20, hx - 24 + i * 15, hy - 52 - (i % 2) * 14, hx - 18 + i * 15, hy - 20],
        '#0f1f16',
      );
    ell(ctx, hx, hy + 10, 26, 22, L('#3f6b4f'));
    mountCol = '#4ade80';
    for (const [x, y] of [
      [hx - 14, hy + 4],
      [hx - 2, hy - 2],
      [hx + 10, hy + 6],
    ] as const)
      drawEyes(k, [x, y], '#a7f3d0', dead, nowMs, ph, true);
    mounts(k, left, e.y, (y) => {
      limb(ctx, [left + 6, y, left - 18, y - 6, left - 34, y + 2], 12, L('#2f5b3f'));
      ell(ctx, left - 36, y + 2, 7, 7, '#0f1f16');
    });
    coreCol = ph === 3 ? '#ffffff' : '#4ade80';
  }
  if (dead) {
    k.label('DEFEATED', e.x, top + 40, '#a8a29e', 14);
    return;
  }
  // volley tells at the mounts, beam emitter at the base, the core
  if (e.at === ATTACK.volley && a.telegraph)
    for (const y of [e.y - 170, e.y - 70]) k.glow(left - 38, y, 5 + p * 9, mountCol);
  const beam = e.at === ATTACK.beamLow || e.at === ATTACK.beamHigh;
  ell(ctx, left - 6, e.y - 24, 10, 14, L('#1f2937'));
  if (beam) k.glow(left - 12, e.y - beamY, a.telegraph ? 6 + p * 14 : 20, mountCol);
  if (e.at === ATTACK.slam && a.telegraph) {
    k.warnIcon(left - 30, e.y - 120, nowMs);
    k.glow(left - 6, e.y - 10, 8 + p * 14, mountCol);
  }
  const pulse = 0.6 + 0.4 * Math.sin(nowMs / (ph === 3 ? 80 : 200));
  ell(ctx, e.x - 8, e.y - 120, 14, 14, '#120f17');
  k.glow(e.x - 8, e.y - 120, 30 * pulse, coreCol);
  k.glow(e.x - 8, e.y - 120, 8, '#ffffff');
  if (ph >= 2) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 20, top + 120);
    ctx.lineTo(left + 34, top + 150);
    ctx.lineTo(left + 26, top + 176);
    if (ph >= 3) {
      ctx.moveTo(left + 88, top + 190);
      ctx.lineTo(left + 100, top + 160);
    }
    ctx.stroke();
    puff(k, faction, e.x, top + 20, 0.3);
  }
}

function mounts(k: BossKit, left: number, floor: number, draw: (y: number) => void): void {
  for (const y of [floor - 170, floor - 70]) draw(y);
  void k;
}

function drawEyes(
  k: BossKit,
  at: [number, number],
  color: string,
  dead: boolean,
  nowMs: number,
  ph: number,
  single = false,
): void {
  if (dead) return;
  const ctx = k.ctx;
  const pulse = 0.6 + 0.4 * Math.sin(nowMs / (ph === 3 ? 90 : 260));
  ctx.fillStyle = color;
  ctx.fillRect(at[0] - 4, at[1] - 2, 8, 4);
  if (!single) ctx.fillRect(at[0] + 14, at[1] - 2, 8, 4);
  k.glow(at[0], at[1], 8 * pulse, color);
  if (!single) k.glow(at[0] + 18, at[1], 8 * pulse, color);
}
