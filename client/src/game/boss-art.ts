import { ATTACK, GAME_CONFIG, type EnemySnapshot, type Faction } from '@strikesquad/shared';
import { breathe, bob, chain as tailChain, foot, gaitOf, knee } from './gait';
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

export function poly(ctx: Ctx, pts: number[], fill: string, ink = true): void {
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

export function ell(
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
export function limb(ctx: Ctx, pts: number[], width: number, color: string): void {
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
export const lit = (flash: boolean) => (c: string) => (flash ? tone(c, 0.28) : c);

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
  const c = GAME_CONFIG.enemies.walker;
  // the body is lit as high-definition art; its tells (the red charge path, sight lines) stay on the scene
  litBody(k, { x: e.x - 150, y: e.y - c.height - 120, w: 300, h: c.height + 136 }, (kk) =>
    paintThemedWalker(kk, faction, e, nowMs, a),
  );
  walkerTells(k, e, a, nowMs, faction);
}

function paintThemedWalker(k: BossKit, faction: Themed, e: EnemySnapshot, nowMs: number, a: AtkInfo): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.walker;
  const L = lit(e.h === 1);
  const charge = e.at === ATTACK.charge;
  // a stomp winds up by sinking low; a charge leans in
  const crouch = e.at === ATTACK.stomp && a.telegraph ? 8 + 6 * prog(a) : 0;
  const hot = charge && a.telegraph;
  // planted-foot locomotion (gait.ts): the step cycle follows the distance walked
  const g = gaitOf(e.id, e.x, e.f, nowMs, c.speed);
  const breath = breathe(g, nowMs, 1.6);
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
    // eight legs in a wave gait (each pair a quarter cycle apart, the far side half a cycle off), the knees
    // arching high above the body like a real scorpion's; the body rides level with a slight sway
    const S = charge ? 60 : 44;
    const by = bob(g, S, 1.5, 4) + crouch - breath;
    const sleg = (lx: number, rest: number, off: number, near: boolean) => {
      const hx = lx;
      const hy = -30 + by;
      const ft = foot(g, S, off, 0.7, 8);
      const fx = rest + ft.dx;
      const fy = ft.dy - 2;
      const [kx, ky] = knee(hx, hy, fx, fy, 22, 34, rest < lx ? 1 : -1);
      limb(ctx, [hx, hy, kx, ky - 4, fx, fy], near ? 6 : 5, near ? shell : tone(shell, -0.15));
    };
    for (let i = 0; i < 4; i++) sleg(-40 + i * 22, -62 + i * 22, i * 0.25 + 0.5, false);
    // tail: five segments curling up and over, swaying, cocked further back while a sting shot winds up
    const cock = e.at === ATTACK.cannon && a.telegraph ? 0.12 * prog(a) : 0;
    const tail = tailChain(-56, -36 + by, Math.PI + 0.9, 5, 24, 0.5 - cock, nowMs, 0.07 + 0.06 * g.moving);
    limb(ctx, tail, 15, plate);
    for (let i = 2; i < tail.length - 2; i += 2)
      ell(ctx, tail[i] as number, tail[i + 1] as number, 7, 6, gold, false);
    const sting: [number, number] = [tail[tail.length - 2] as number, tail[tail.length - 1] as number];
    poly(
      ctx,
      [sting[0] - 6, sting[1] - 6, sting[0] + 14, sting[1] + 2, sting[0] - 2, sting[1] + 10],
      L('#1c1208'),
    );
    // body plates, each with a lit rim, then the near legs over them
    for (let i = 0; i < 5; i++) {
      ell(ctx, -48 + i * 18, -36 + by, 16, 18 - i, i % 2 ? plate : shell);
      ell(ctx, -46 + i * 18, -46 + by, 10, 4, tone(i % 2 ? plate : shell, 0.2), false);
    }
    ell(ctx, 38, -38 + by, 22, 17, plate);
    ctx.fillStyle = gold;
    for (let i = 0; i < 5; i++) ctx.fillRect(-56 + i * 18, -52 + by, 10, 3);
    for (let i = 0; i < 4; i++) sleg(-36 + i * 22, -10 + i * 22, i * 0.25, true);
    // pincers
    for (const [dy, open] of [
      [-20, 1],
      [-46, -1],
    ] as const) {
      limb(ctx, [50, -34 + by, 64, dy + by, 78, dy + by], 9, plate);
      const o = (e.at === ATTACK.mg && a.telegraph ? 6 : 3) * open;
      poly(
        ctx,
        [74, dy - 10 + by, 98, dy - 4 + by - o, 80, dy + by, 98, dy + 4 + by + o, 74, dy + 10 + by],
        L('#b7791f'),
      );
    }
    eye = [54, -46 + by];
    eyeCol = '#a3e635';
    if (e.at === ATTACK.cannon && a.telegraph)
      k.glow(e.x + e.f * sting[0], e.y + sting[1], 6 + 12 * prog(a), '#a3e635');
  } else if (faction === 'norse' || faction === 'demon') {
    // FENRIR (a huge grey wolf with a broken chain) / INFERNO BEAST (a horned, lava-cracked hellhound).
    const wolf = faction === 'norse';
    const fur = L(wolf ? '#4b5563' : '#2a0e0e');
    const dark = L(wolf ? '#1f2937' : '#150606');
    const light = wolf ? '#9ca3af' : '#7f1d1d';
    // a trot: diagonal legs move together, the body dips on each footfall, the head nods
    const S = charge ? 96 : 70;
    const by = bob(g, S, charge ? 5 : 3) + crouch - breath;
    const leg = (hx: number, rest: number, off: number, bend: 1 | -1, col: string, near: boolean) => {
      const hy0 = -46 + by;
      const ft = foot(g, S, off, 0.6, charge ? 16 : 11);
      const fx = rest + ft.dx;
      const fy = ft.dy - 3;
      const [kx, ky] = knee(hx, hy0, fx, fy, 25, 26, bend);
      // a thick upper leg tapering to the paw
      limb(ctx, [hx, hy0, kx, ky], near ? 16 : 14, col);
      limb(ctx, [kx, ky, fx, fy], near ? 10 : 9, col);
      ell(ctx, fx + 4, fy + 1, 9, 4.5, tone(col, -0.15));
      ctx.fillStyle = '#e7e5e4';
      for (let c2 = 0; c2 < 3; c2++) ctx.fillRect(fx + 8 + c2 * 3, fy + 1, 2, 3); // claws
    };
    // far legs first (darker), then the body, then the near legs
    leg(-40, -36, 0.5, 1, dark, false);
    leg(32, 40, 0, -1, dark, false);
    // tail: a chain that sways and trails the motion
    const tail = tailChain(
      -60,
      -62 + by,
      Math.PI + 0.55,
      5,
      10,
      -0.14,
      nowMs,
      0.18 + 0.25 * g.moving,
      1 + g.speed,
    );
    limb(ctx, tail, 12, fur);
    const tx = tail[tail.length - 2] as number;
    const ty = tail[tail.length - 1] as number;
    if (!wolf) ell(ctx, tx, ty, 6, 6, '#f97316', false); // the tail burns at its tip
    // body: haunch, ribcage and shoulder masses so it reads as a muscled animal, not a capsule
    ell(ctx, -36, -58 + by, 30, 24, fur);
    ell(ctx, 28, -62 + by, 32, 27, fur);
    ell(ctx, -4, -60 + by, 52, 25, fur);
    ell(ctx, -6, -46 + by, 44, 10, dark, false); // belly in shade
    ell(ctx, 26, -72 + by, 18, 9, tone(fur, 0.12), false); // lit shoulder
    // ribs / muscle lines
    ctx.fillStyle = tone(fur, -0.25);
    for (let r = 0; r < 4; r++) ctx.fillRect(-6 + r * 8, -66 + by + r, 3, 14);
    // back ridge: spikes that ripple with each step
    for (let i = 0; i < 7; i++) {
      const x = -50 + i * 14;
      const rip = Math.sin(g.s / 14 - i * 0.8) * 2 * g.moving;
      poly(
        ctx,
        [x - 6, -82 + by, x + rip, -98 + by - (i % 2) * 6 - (i === 3 ? 4 : 0), x + 6, -82 + by],
        wolf ? '#e0f2fe' : '#e7e5e4',
      );
    }
    if (!wolf) {
      // lava cracks that pulse
      ctx.strokeStyle = Math.sin(nowMs / 180) > 0 ? '#fb923c' : '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-40, -66 + by);
      ctx.lineTo(-24, -56 + by);
      ctx.lineTo(-8, -68 + by);
      ctx.lineTo(10, -54 + by);
      ctx.lineTo(28, -64 + by);
      ctx.stroke();
    }
    leg(-24, -20, 0, 1, fur, true);
    leg(48, 56, 0.5, -1, fur, true);
    // neck + head: nods with the trot, drops low and forward to charge
    const nod = Math.sin((g.s / S) * Math.PI * 4) * 2 * g.moving;
    const hy = -78 + by + nod + (charge ? 10 : 0);
    const jaw = (e.at === ATTACK.cannon || charge) && a.telegraph ? 4 + 6 * prog(a) : 2;
    poly(ctx, [34, -80 + by, 58, hy - 14, 76, hy - 2, 56, -42 + by], fur);
    poly(ctx, [52, hy - 16, 88, hy - 6, 94, hy + 2, 80, hy + 6, 54, hy + 12], fur);
    poly(ctx, [58, hy - 14, 84, hy - 8, 86, hy - 4, 60, hy - 6], tone(fur, 0.15)); // lit brow and muzzle
    // lower jaw hinged at the cheek
    poly(ctx, [58, hy + 8, 90, hy + 4 + jaw, 84, hy + 12 + jaw, 60, hy + 14], dark);
    ctx.fillStyle = '#f5f5f4';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(70 + i * 5, hy + 2, 2, 4); // upper fangs
      ctx.fillRect(70 + i * 5, hy + 3 + jaw, 2, 3); // lower fangs
    }
    if (jaw > 4) ell(ctx, 82, hy + 4 + jaw / 2, 5, jaw / 2, wolf ? '#bae6fd' : '#f97316', false); // breath glow
    if (wolf) {
      poly(ctx, [54, hy - 14, 58, hy - 34, 66, hy - 14], fur);
      poly(ctx, [62, hy - 12, 68, hy - 30, 72, hy - 12], tone(fur, -0.1));
      // the broken chain on its neck, swinging
      ctx.fillStyle = '#9ca3af';
      const sw = Math.sin(nowMs / 200) * 3 * (0.3 + g.moving);
      for (let i = 0; i < 5; i++) ctx.fillRect(40 + i * 5 + sw * (i / 4), -60 + by + i * 5, 6, 4);
    } else {
      // curved horns and a mane of flames
      limb(ctx, [60, hy - 12, 56, hy - 34, 70, hy - 44], 5, '#e7e5e4');
      limb(ctx, [68, hy - 10, 72, hy - 30, 86, hy - 34], 4, '#d6d3d1');
      if (!k.reduce)
        for (let i = 0; i < 4; i++)
          k.add({
            x: e.x + e.f * (30 + i * 8),
            y: e.y - 88 + by,
            vx: -e.f * 40 * g.speed,
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
    // a heavy biped stride: knees forward, hooves planted, the body dropping onto each step
    const S = charge ? 110 : 76;
    const by = bob(g, S, charge ? 6 : 4) + crouch - breath;
    const mleg = (hx: number, off: number, col: string) => {
      const hy = -50 + by;
      const ft = foot(g, S, off, 0.6, charge ? 18 : 13);
      const fx = hx + ft.dx;
      const fy = ft.dy - 6;
      const [kx, ky] = knee(hx, hy, fx, fy, 24, 24, 1);
      limb(ctx, [hx, hy, kx, ky], 15, col);
      limb(ctx, [kx, ky, fx, fy], 11, col);
      ctx.fillStyle = INK;
      ctx.fillRect(fx - 9, fy - 2, 18, 8); // hoof
      ctx.fillStyle = tone(col, 0.2);
      ctx.fillRect(fx - 8, fy - 1, 7, 2);
    };
    mleg(-10, 0.5, dark);
    mleg(10, 0, hide);
    const crouchBy = by; // the upper body rides the stride
    poly(
      ctx,
      [-34, -48 + crouchBy, 34, -48 + crouchBy, 26, -32 + crouchBy, -26, -32 + crouchBy],
      L('#7f1d1d'),
    ); // kilt
    // torso
    poly(ctx, [-38, -104 + crouchBy, 40, -110 + crouchBy, 32, -46 + crouchBy, -30, -46 + crouchBy], hide);
    ctx.fillStyle = bronze;
    ctx.fillRect(-26, -96 + crouchBy, 52, 8); // chest strap
    ctx.fillRect(-28, -54 + crouchBy, 58, 6); // belt
    // back arm and the double axe held up front
    const swing = Math.sin((g.s / S) * Math.PI * 2) * 8 * g.moving;
    limb(ctx, [-30, -98 + crouchBy, -44 + swing / 2, -70 + crouchBy, -36 + swing, -54 + crouchBy], 12, dark);
    const axeUp = e.at === ATTACK.cannon && a.telegraph ? -16 : 0;
    limb(ctx, [30, -98 + crouchBy, 52, -78 + crouchBy + axeUp, 60, -96 + crouchBy + axeUp], 12, hide);
    limb(ctx, [60, -60 + crouchBy + axeUp, 58, -128 + crouchBy + axeUp], 4, '#6b4423');
    for (const s of [-1, 1])
      poly(
        ctx,
        [
          58,
          -118 + crouchBy + axeUp,
          58 + s * 22,
          -134 + crouchBy + axeUp,
          58 + s * 26,
          -112 + crouchBy + axeUp,
          58 + s * 22,
          -96 + crouchBy + axeUp,
        ],
        L('#cbd5e1'),
      );
    // bull head with horns
    const hy = -114 + crouchBy + (charge ? 14 : 0);
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
    // six legs in a tripod gait (front and back of one side with the middle of the other), knees high
    const S = charge ? 80 : 58;
    const by = bob(g, S, 2, 2) + crouch - breath;
    const xleg = (lx: number, rest: number, off: number, near: boolean) => {
      const hy = -46 + by;
      const ft = foot(g, S, off, 0.55, 12);
      const fx = rest + ft.dx;
      const fy = ft.dy - 2;
      const [kx, ky] = knee(lx, hy, fx, fy, 40, 46, rest < lx ? 1 : -1);
      limb(ctx, [lx, hy, kx, ky, fx, fy], near ? 6 : 5, near ? chitin : dark);
      ell(ctx, kx, ky, near ? 4 : 3, near ? 4 : 3, near ? tone(chitin, 0.2) : dark, false); // knee joint
    };
    for (let i = 0; i < 3; i++) xleg(-36 + i * 34, -66 + i * 34, i % 2 ? 0 : 0.5, false);
    ell(ctx, -30, -54 + by, 40, 24, chitin);
    // glowing egg sacs
    const pulse = 0.6 + 0.4 * Math.sin(nowMs / 220);
    for (const [x, y] of [
      [-46, -66],
      [-26, -72],
      [-36, -50],
    ] as const) {
      ell(ctx, x, y + by, 9, 7, `rgba(74,222,128,${pulse})`);
      k.glow(e.x + e.f * x, e.y + y + by, 10 * pulse, 'rgba(74,222,128,0.45)');
    }
    ell(ctx, 18, -56 + by, 26, 18, chitin);
    for (let i = 0; i < 3; i++) xleg(-30 + i * 34, 4 + i * 34, i % 2 ? 0.5 : 0, true);
    // long ridged head, swaying as it walks, mandibles working
    const hy = -66 + by + (charge ? 8 : 0) + Math.sin(nowMs / 300) * 1.5;
    const chew = Math.sin(nowMs / 90) * 2;
    poly(ctx, [30, hy - 16, 64, hy - 22, 96, hy - 6, 88, hy + 10, 40, hy + 14], L('#2f5b3f'));
    for (let i = 0; i < 4; i++)
      poly(ctx, [36 + i * 12, hy - 16, 42 + i * 12, hy - 30, 48 + i * 12, hy - 16], dark);
    limb(ctx, [84, hy + 8, 100, hy + 18 + chew], 4, '#bbf7d0');
    limb(ctx, [80, hy + 10, 94, hy + 24 - chew], 4, '#bbf7d0');
    for (let i = 0; i < 3; i++) ell(ctx, 66 + i * 8, hy - 6 + (i % 2) * 4, 3, 3, '#a7f3d0', false);
    eye = [74, hy - 4];
    eyeCol = '#4ade80';
    if (e.at === ATTACK.cannon && a.telegraph) k.glow(e.x + e.f * 60, e.y - 92, 6 + 14 * prog(a), '#4ade80');
  }
  ctx.restore();
  const pulse = 0.6 + 0.4 * Math.sin(nowMs / (hot ? 50 : 200));
  k.glow(e.x + e.f * eye[0], e.y + eye[1], hot ? 16 : 7 * pulse, hot ? '#ffffff' : eyeCol);
  if (e.ph >= 2) puff(k, faction, e.x, e.y - c.height + 10, 0.3);
}

export function prog(a: AtkInfo): number {
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

// ------------------------------------------------------------------ creature animation (flyers)
//
// The flyers are animated like creatures, not slid like sprites: a wingbeat with a quick downstroke and a slower
// recovery (the wing half-folds on the way up), necks and tails as chains whose links follow a travelling wave
// (so motion runs from the body to the tip, with follow-through), a bob in time with the beat, and a bank into
// the direction of travel.

interface Ramp3 {
  dark: string;
  base: string;
  light: string;
}

const ramp3 = (c: string, L: (c: string) => string): Ramp3 => ({
  dark: L(tone(c, -0.32)),
  base: L(c),
  light: L(tone(c, 0.26)),
});

/** Smoothed horizontal speed of each flyer (px/s), measured between frames: drives the bank. */
const flyerVel = new Map<number, { x: number; t: number; v: number }>();

function flyerSpeed(e: EnemySnapshot, nowMs: number): number {
  const m = flyerVel.get(e.id);
  if (!m || nowMs - m.t > 500) {
    flyerVel.set(e.id, { x: e.x, t: nowMs, v: 0 });
    if (flyerVel.size > 16) for (const [id, s] of flyerVel) if (nowMs - s.t > 2000) flyerVel.delete(id);
    return 0;
  }
  if (nowMs === m.t) return m.v;
  const dt = (nowMs - m.t) / 1000;
  m.v += ((e.x - m.x) / dt - m.v) * Math.min(1, dt * 6);
  m.x = e.x;
  m.t = nowMs;
  return m.v;
}

/**
 * A wingbeat: `lift` 1 = wings raised, -1 = lowered; the downstroke takes 40 % of the beat, the recovery the rest.
 * `fold` (0..0.55) is how far the wing tucks in on the way up.
 */
function wingBeat(nowMs: number, period: number): { lift: number; fold: number } {
  const p = (((nowMs / period) % 1) + 1) % 1;
  if (p < 0.4) return { lift: Math.cos((p / 0.4) * Math.PI), fold: 0 };
  const t = (p - 0.4) / 0.6;
  return { lift: -Math.cos(t * Math.PI), fold: Math.sin(t * Math.PI) * 0.55 };
}

type P2 = [number, number];

/** Points of a chain (neck, tail): `n` links of `len` from `o`, each turned by `angle(i)` (radians, 0 = +x). */
function chainPts(o: P2, n: number, len: number, angle: (i: number) => number): P2[] {
  const pts: P2[] = [o];
  let [x, y] = o;
  for (let i = 0; i < n; i++) {
    const a = angle(i);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    pts.push([x, y]);
  }
  return pts;
}

/** A tapering, shaded chain (w0 thick at the root, w1 at the tip): ink, body, a lit back and a dark underside. */
function chain(ctx: Ctx, pts: P2[], w0: number, w1: number, r: Ramp3): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pass = (color: string, grow: number, dy: number, k: number) => {
    ctx.strokeStyle = color;
    for (let i = 1; i < pts.length; i++) {
      const w = (w0 + ((w1 - w0) * (i - 0.5)) / (pts.length - 1)) * k + grow;
      if (w <= 0.5) continue;
      ctx.lineWidth = w;
      ctx.beginPath();
      const [ax, ay] = pts[i - 1] as P2;
      const [bx, by] = pts[i] as P2;
      ctx.moveTo(ax, ay + dy * w);
      ctx.lineTo(bx, by + dy * w);
      ctx.stroke();
    }
  };
  pass(INK, 5, 0, 1);
  pass(r.dark, 0, 0, 1);
  pass(r.base, 0, -0.12, 0.72);
  pass(r.light, 0, -0.28, 0.28);
}

/**
 * A bat wing from shoulder `s`: arm and forearm bones to the wrist, four finger bones fanning out, and the
 * membrane stretched between them with scalloped edges, lit along the leading edge. `span` scales it.
 */
function batWing(
  ctx: Ctx,
  s: P2,
  lift: number,
  fold: number,
  span: number,
  membrane: Ramp3,
  bone: string,
  hip: P2,
): P2 {
  // never fully edge-on: keep a little of the wing's face showing at mid-stroke
  const v = (lift >= 0 ? 0.18 : -0.18) + lift * 0.82;
  const open = 1 - fold * 0.5;
  const P = (dx: number, dy: number, from: P2): P2 => [from[0] + dx * span * open, from[1] + dy * span * v];
  const elbow = P(-26, -30, s);
  const wrist = P(-30, -40, elbow);
  const tips: P2[] = [P(10, -30, wrist), P(-26, -34, wrist), P(-52, -14, wrist), P(-50, 14, wrist)];
  // membrane: shoulder → arm → wrist → finger tips (scalloped between them) → back along the flank to the hip
  ctx.beginPath();
  ctx.moveTo(s[0], s[1]);
  ctx.lineTo(elbow[0], elbow[1]);
  ctx.lineTo(wrist[0], wrist[1]);
  const tip0 = tips[0] as P2;
  ctx.lineTo(tip0[0], tip0[1]);
  for (let i = 1; i < tips.length; i++) {
    const a = tips[i - 1] as P2;
    const b = tips[i] as P2;
    const cx = (a[0] + b[0]) / 2 + (wrist[0] - (a[0] + b[0]) / 2) * 0.32;
    const cy = (a[1] + b[1]) / 2 + (wrist[1] - (a[1] + b[1]) / 2) * 0.32;
    ctx.quadraticCurveTo(cx, cy, b[0], b[1]);
  }
  const last = tips[tips.length - 1] as P2;
  ctx.quadraticCurveTo(
    (last[0] + hip[0]) / 2 + 4,
    (last[1] + hip[1]) / 2 + 10 * Math.sign(v),
    hip[0],
    hip[1],
  );
  ctx.closePath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  const g = ctx.createLinearGradient(wrist[0], wrist[1], hip[0], hip[1]);
  g.addColorStop(0, membrane.light);
  g.addColorStop(0.45, membrane.base);
  g.addColorStop(1, membrane.dark);
  ctx.fillStyle = g;
  ctx.fill();
  // bones
  ctx.lineCap = 'round';
  for (const [w, c] of [
    [6, INK],
    [3.5, bone],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(elbow[0], elbow[1]);
    ctx.lineTo(wrist[0], wrist[1]);
    ctx.stroke();
    ctx.lineWidth = w - 2;
    for (const t of tips) {
      ctx.beginPath();
      ctx.moveTo(wrist[0], wrist[1]);
      ctx.lineTo(t[0], t[1]);
      ctx.stroke();
    }
  }
  // the thumb claw at the wrist
  poly(
    ctx,
    [wrist[0], wrist[1], wrist[0] + 7, wrist[1] - 3 * Math.sign(v), wrist[0] + 3, wrist[1] + 2],
    '#e7e5e4',
  );
  return wrist;
}

/**
 * A bird wing from shoulder `s`: a feathered arm (coverts) and a fan of long flight feathers from the wrist,
 * each shaded and tipped with `tip`. `span` scales it.
 */
function birdWing(ctx: Ctx, s: P2, lift: number, fold: number, span: number, r: Ramp3, tip: string): void {
  const v = (lift >= 0 ? 0.2 : -0.2) + lift * 0.8;
  const open = 1 - fold * 0.55;
  const elbow: P2 = [s[0] - 22 * span * open, s[1] - 26 * span * v];
  const wrist: P2 = [elbow[0] - 26 * span * open, elbow[1] - 30 * span * v];
  const feather = (a: P2, ang: number, len: number, w: number, col: Ramp3, tipCol: string | null) => {
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const q = (u: number, t: number): number[] => [a[0] + u * c - t * sn, a[1] + u * sn + t * c];
    poly(
      ctx,
      [
        ...q(0, -w * 0.5),
        ...q(len * 0.8, -w * 0.45),
        ...q(len, 0),
        ...q(len * 0.8, w * 0.5),
        ...q(0, w * 0.5),
      ],
      col.base,
    );
    poly(
      ctx,
      [
        ...q(len * 0.1, -w * 0.4),
        ...q(len * 0.75, -w * 0.35),
        ...q(len * 0.9, 0),
        ...q(len * 0.1, -w * 0.05),
      ],
      col.light,
      false,
    );
    if (tipCol)
      poly(ctx, [...q(len * 0.72, -w * 0.45), ...q(len, 0), ...q(len * 0.72, w * 0.5)], tipCol, false);
  };
  // flight feathers fan from the wrist (drawn longest first), then the secondaries along the forearm
  const base = Math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]);
  for (let i = 0; i < 6; i++) {
    const ang = base + (i - 1) * 0.32 * Math.sign(v) * (1 - fold * 0.5);
    feather(wrist, ang, (46 - i * 4) * span * open, 9, r, tip);
  }
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const at: P2 = [elbow[0] + (wrist[0] - elbow[0]) * t, elbow[1] + (wrist[1] - elbow[1]) * t];
    feather(at, Math.PI * 0.5 * Math.sign(v) + Math.PI * 0.62, 30 * span * open, 10, r, tip);
  }
  // coverts: the arm's own plumage
  chain(ctx, [s, elbow, wrist], 16, 10, r);
}

/** Boss 2 shape: a flyer, 168 x 64 around (e.x, e.y - 32). Burst gun at (44, +18); bombs drop from the belly. */
export function drawThemedGunship(
  k: BossKit,
  faction: Themed,
  e: EnemySnapshot,
  nowMs: number,
  a: AtkInfo,
): void {
  const cy = e.y - GAME_CONFIG.enemies.gunship.height / 2;
  litBody(k, { x: e.x - 130, y: cy - 110, w: 260, h: 190 }, (kk) =>
    paintThemedGunship(kk, faction, e, nowMs, a),
  );
}

/**
 * The fire dragon's head at (x, y), turned by `ang`: swept-back horns, a brow ridge over a slit-pupilled eye,
 * fangs, and a lower jaw hinged to open by `open` radians. Returns the mouth point (in the caller's space).
 */
function dragonHead(
  ctx: Ctx,
  x: number,
  y: number,
  ang: number,
  open: number,
  sc: Ramp3,
  horn: string,
  hot: boolean,
): P2 {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // horns
  limb(ctx, [-4, -7, -16, -17, -28, -15], 4.5, horn);
  limb(ctx, [2, -9, -8, -24, -20, -27], 4, horn);
  // lower jaw, hinged at the back of the head
  ctx.save();
  ctx.translate(0, 3);
  ctx.rotate(open);
  if (open > 0.15) poly(ctx, [0, -2, 34, -2, 32, 3, 2, 3], hot ? '#fb923c' : '#3b0a0a', false);
  poly(ctx, [-4, 0, 34, 0, 31, 7, 2, 8], sc.dark);
  ctx.fillStyle = '#f5f5f4';
  for (let i = 0; i < 4; i++) ctx.fillRect(14 + i * 5, -2, 2, 3);
  ctx.restore();
  // skull and snout
  poly(ctx, [-8, -6, 6, -12, 24, -9, 38, -5, 40, 2, 20, 4, -6, 6], sc.base);
  poly(ctx, [-2, -8, 8, -11, 24, -8, 34, -5, 20, -5, 4, -6], sc.light, false);
  ctx.fillStyle = '#f5f5f4';
  for (let i = 0; i < 4; i++) ctx.fillRect(18 + i * 5, 3, 2, 3); // upper fangs
  // brow ridge, eye with a slit pupil, nostril
  poly(ctx, [6, -10, 20, -9, 16, -6, 6, -7], sc.dark, false);
  ell(ctx, 14, -4, 3.4, 2.6, hot ? '#ffffff' : '#fde047', false);
  ctx.fillStyle = INK;
  ctx.fillRect(14, -6, 1.4, 4);
  ctx.fillRect(35, -4, 2, 2);
  ctx.restore();
  const mx = 38;
  const my = 4 + open * 8;
  return [x + mx * Math.cos(ang) - my * Math.sin(ang), y + mx * Math.sin(ang) + my * Math.cos(ang)];
}

function paintThemedGunship(k: BossKit, faction: Themed, e: EnemySnapshot, nowMs: number, a: AtkInfo): void {
  const ctx = k.ctx;
  const c = GAME_CONFIG.enemies.gunship;
  const L = lit(e.h === 1);
  const cy = e.y - c.height / 2;
  const flap = Math.sin(nowMs / 140) * 0.6;
  const hot = (e.at === ATTACK.missiles || e.at === ATTACK.bombs) && a.telegraph;
  const attacking = a.telegraph || e.at === ATTACK.strafe;
  // motion: a wingbeat (faster when about to strike), a bob in time with it, and a bank into the direction of travel
  const vx = flyerSpeed(e, nowMs);
  const period = hot ? 420 : 640;
  const beat = wingBeat(nowMs + e.id * 137, period);
  const winged = faction !== 'norse' && faction !== 'void';
  const bob = winged ? -beat.lift * 4 : Math.sin(nowMs / 520) * 3;
  const bank = Math.max(-0.2, Math.min(0.2, (vx * e.f) / 700));
  const toWorld = (x: number, y: number): P2 => {
    const cs = Math.cos(bank);
    const sn = Math.sin(bank);
    return [e.x + e.f * FLYER_SCALE * (x * cs - y * sn), cy + 6 + FLYER_SCALE * (x * sn + y * cs + bob)];
  };
  k.shadowAt(e.x, 14 * GAME_CONFIG.tile, 70, 0.18);
  ctx.save();
  // Drawn at 85 % and nudged down: phones show little sky above a flyer, so keep wings and heads compact.
  ctx.translate(Math.round(e.x), Math.round(cy) + 6);
  ctx.scale(e.f * FLYER_SCALE, FLYER_SCALE);
  ctx.translate(0, bob);
  ctx.rotate(bank);
  let core: [number, number, string];
  if (faction === 'pharaoh' || faction === 'olympus') {
    // SUN FALCON (golden, a sun disc over its head) / STORM HARPY (bronze feathers, a wild-haired face, talons).
    const falcon = faction === 'pharaoh';
    const main = ramp3(falcon ? '#b7791f' : '#78350f', L);
    const wingR = ramp3(falcon ? '#d4a017' : '#92400e', L);
    const farR = ramp3(tone(falcon ? '#d4a017' : '#92400e', -0.3), L);
    const tip = L(falcon ? '#1d4ed8' : '#451a03');
    const far = wingBeat(nowMs + e.id * 137 + 60, period);
    birdWing(ctx, [-6, -8], far.lift, far.fold, 0.85, farR, tone(tip, -0.2));
    // tail fan: feathers that sway behind the beat
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI + (i - 2) * 0.16 + Math.sin(nowMs / 260 - i * 0.5) * 0.05;
      const len = 46 - Math.abs(i - 2) * 5;
      const x1 = -40 + Math.cos(ang) * len;
      const y1 = 4 + Math.sin(ang) * len;
      poly(ctx, [-40, -2, x1, y1 - 5, x1 - 4, y1, x1, y1 + 5, -40, 8], i % 2 ? main.base : main.dark);
      poly(ctx, [x1 + 6, y1 - 4, x1 - 4, y1, x1 + 6, y1 + 4], tip, false);
    }
    // body: shaded, with a speckled breast
    ell(ctx, 0, 0, 52, 20, main.dark);
    ell(ctx, 3, -3, 46, 15, main.base, false);
    ell(ctx, 8, -9, 28, 5, main.light, false);
    ctx.fillStyle = tone(main.base, 0.32);
    for (let i = 0; i < 6; i++) ctx.fillRect(-26 + i * 10, 4 + (i % 2) * 4, 5, 3);
    // talons tucked, reaching down when about to drop troops
    const grab = e.at === ATTACK.troops && a.telegraph ? 10 : 0;
    for (const x of [-8, 10]) {
      limb(ctx, [x, 14, x - 2, 26 + grab], 6, L('#facc15'));
      limb(ctx, [x - 2, 26 + grab, x - 8, 30 + grab], 3, '#1f2937');
      limb(ctx, [x - 2, 26 + grab, x + 4, 31 + grab], 3, '#1f2937');
    }
    // head
    if (falcon) {
      ell(ctx, 48, -14, 18, 15, main.base);
      ell(ctx, 52, -20, 9, 5, main.light, false);
      poly(ctx, [62, -18, 80, -10, 64, -4], '#1f2937'); // hooked beak
      ctx.fillStyle = INK;
      ctx.fillRect(48, -18, 10, 2);
      ctx.fillRect(52, -16, 2, 10); // eye-of-the-falcon marking
      ell(ctx, 55, -17, 2.4, 2.4, attacking ? '#ffffff' : '#fde047', false);
      ell(ctx, 44, -40, 14, 14, hot ? '#ffffff' : '#fde047'); // sun disc
      k.glow(e.x + e.f * 44, cy - 40, 20, 'rgba(253,224,71,0.5)');
      core = [54, -18, '#fde047'];
    } else {
      ell(ctx, 48, -14, 14, 15, L('#d6b9a4'));
      ell(ctx, 52, -19, 6, 5, L('#ead2c0'), false);
      const wind = Math.sin(nowMs / 180) * 3;
      limb(ctx, [36, -26, 22 + wind, -10, 26 + wind, 8], 7, '#1c1917'); // wild hair streaming back
      limb(ctx, [42, -28, 26 + wind, -40], 5, '#1c1917');
      ctx.fillStyle = '#facc15';
      ctx.fillRect(40, -30, 16, 4); // bronze crown
      ctx.fillStyle = INK;
      ctx.fillRect(54, -6, 6, attacking ? 4 : 2); // snarl, wider when she strikes
      ell(ctx, 55, -16, 2, 2, '#93c5fd', false);
      core = [52, -16, '#93c5fd'];
    }
    // near wing on top
    birdWing(ctx, [-2, -10], beat.lift, beat.fold, 1, wingR, tip);
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
    // FIRE DRAGON: bat wings on finger bones, a long S-necked horned head with a jaw that opens to breathe fire,
    // a whipping spiked tail, scaled belly, claws tucked in flight.
    const sc = ramp3('#8b1d1d', L);
    const bellyR = ramp3('#e9a23b', L);
    const mem = ramp3('#5a1420', L);
    const farMem = ramp3('#2c0a10', L);
    const bone = L('#d9c7ad');
    const t = nowMs / 1000;
    const far = wingBeat(nowMs + e.id * 137 + 50, period);
    batWing(ctx, [-4, -12], far.lift, far.fold, 0.88, farMem, L('#8a7560'), [-34, 4]);
    // tail: a wave runs down it from the hips, with spikes along the top and a spade at the tip
    const tail = chainPts(
      [-36, 6],
      10,
      12,
      (i) => Math.PI - 0.1 + Math.sin(t * 5.2 - i * 0.62) * (0.08 + i * 0.035) - bank * 0.5,
    );
    chain(ctx, tail, 20, 5, sc);
    for (let i = 1; i < 7; i++) {
      const [x0, y0] = tail[i] as P2;
      const [x1, y1] = tail[i + 1] as P2;
      const ang = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
      const h = 9 - i;
      poly(
        ctx,
        [
          x0,
          y0,
          x0 + Math.cos(ang) * h * 1.4 + (x1 - x0) * 0.3,
          y0 + Math.sin(ang) * h * 1.4,
          (x0 + x1) / 2,
          (y0 + y1) / 2,
        ],
        bone,
      );
    }
    {
      const [x0, y0] = tail[tail.length - 2] as P2;
      const [x1, y1] = tail[tail.length - 1] as P2;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const q = (u: number, v: number): number[] => [
        x1 + u * Math.cos(ang) - v * Math.sin(ang),
        y1 + u * Math.sin(ang) + v * Math.cos(ang),
      ];
      poly(ctx, [...q(-2, -7), ...q(14, 0), ...q(-2, 7), ...q(3, 0)], L('#e7e5e4'));
    }
    // hind leg, tucked, claws curled
    limb(ctx, [-20, 10, -10, 24, -26, 30], 9, sc.dark);
    for (const dx of [-6, 0, 6]) limb(ctx, [-26, 30, -32 + dx, 35], 2.5, '#f5f5f4');
    // body: dark underside, lit back, scaled belly plates, spines along the spine
    ell(ctx, -2, 2, 48, 22, sc.dark);
    ell(ctx, 0, -2, 43, 16, sc.base, false);
    ell(ctx, 4, -11, 26, 5, sc.light, false);
    for (let i = 0; i < 6; i++) {
      ell(ctx, -27 + i * 11, 14 - Math.abs(i - 2.5) * 1.2, 6.5, 4.2, bellyR.base, false);
      ell(ctx, -27 + i * 11, 12.5 - Math.abs(i - 2.5) * 1.2, 4, 1.5, bellyR.light, false);
    }
    for (let i = 0; i < 6; i++) {
      const x = -32 + i * 12;
      const y = -16 + Math.abs(i - 2.5) * 1.6;
      poly(ctx, [x - 5, y + 3, x, y - 9 - (i % 2) * 3, x + 5, y + 3], bone);
    }
    // fore leg tucked under the chest
    limb(ctx, [24, 10, 34, 22, 26, 28], 7, sc.dark);
    for (const dx of [-5, 0, 5]) limb(ctx, [26, 28, 22 + dx, 33], 2.5, '#f5f5f4');
    // neck: an S-curve that sways, lit along its back, belly plates down its throat
    const neck = chainPts(
      [30, -10],
      6,
      11,
      (i) => -1.05 + i * 0.19 + Math.sin(t * 2.8 - i * 0.55) * 0.07 - bank * 0.4,
    );
    chain(ctx, neck, 19, 13, sc);
    ctx.strokeStyle = attacking ? L('#fdba74') : bellyR.base;
    ctx.lineWidth = 4;
    ctx.beginPath();
    neck.forEach(([x, y], i) => (i ? ctx.lineTo(x + 3, y + 6) : ctx.moveTo(x + 3, y + 6)));
    ctx.stroke();
    // the head, turned along the end of the neck, its jaw opening when it is about to breathe or burst
    const [hx, hy] = neck[neck.length - 1] as P2;
    const [px, py] = neck[neck.length - 2] as P2;
    const ha = Math.atan2(hy - py, hx - px) + 0.18;
    const open = attacking
      ? 0.42 + Math.sin(nowMs / 55) * 0.06
      : 0.06 + Math.max(0, Math.sin(nowMs / 900)) * 0.08;
    const mouth = dragonHead(ctx, hx, hy, ha, open, sc, L('#efe7da'), attacking);
    core = [mouth[0], mouth[1], '#fb923c'];
    // near wing over everything
    batWing(ctx, [2, -14], beat.lift, beat.fold, 1, mem, bone, [-30, 2]);
    // breath: a stream of fire from the jaws while striking, a wisp of smoke from the nostrils otherwise
    if (!k.reduce) {
      const [wx, wy] = toWorld(mouth[0], mouth[1]);
      const dir = e.f * Math.cos(ha + bank);
      if (attacking && Math.random() < 0.8)
        k.add({
          x: wx,
          y: wy,
          vx: dir * (120 + Math.random() * 60),
          vy: -10 + Math.random() * 20,
          life: 0.35,
          size: 7,
          color: '#fb923c',
          add: true,
          grow: 14,
        });
      else if (Math.random() < 0.12)
        k.add({
          x: wx,
          y: wy - 4,
          vx: dir * 20,
          vy: -30,
          life: 0.8,
          size: 5,
          color: 'rgba(80,70,70,0.5)',
          grow: 10,
        });
    }
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
  const [gx, gy] = toWorld(core[0], core[1]);
  k.glow(gx, gy, hot ? 14 : faction === 'demon' && attacking ? 12 : 8, core[2]);
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
  const bc = GAME_CONFIG.enemies.boss;
  litBody(
    k,
    { x: e.x - bc.width / 2 - 70, y: e.y - bc.height - 120, w: bc.width + 140, h: bc.height + 126 },
    (kk) => paintThemedColossus(kk, faction, e, dead, nowMs, a, beamY),
  );
}

function paintThemedColossus(
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

export function drawEyes(
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

// ------------------------------------------------------------------ high-definition lighting

/** A world-space rectangle (the area a body may cover). */
export interface LitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const layers: { body?: HTMLCanvasElement; mask?: HTMLCanvasElement; band?: HTMLCanvasElement } = {};
let grain: HTMLCanvasElement | null = null;

function scratch(name: 'body' | 'mask' | 'band', w: number, h: number): HTMLCanvasElement {
  let c = layers[name];
  if (!c) c = layers[name] = document.createElement('canvas');
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  return c;
}

/** A 64 px tile of fine light and dark specks: the grain of painted metal, hide or stone. */
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  grain = document.createElement('canvas');
  grain.width = grain.height = 64;
  const g = grain.getContext('2d');
  if (g) {
    let s = 9;
    const r = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < 420; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.7)';
      g.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), r() < 0.2 ? 2 : 1, 1);
    }
  }
  return grain;
}

/**
 * The lighting every high-definition body gets, applied to what was painted on `c` (its top-left w x h):
 * - form shading: lit from above, darkening towards the ground (three tones over the painted flat colours);
 * - a rim of warm light along the edges facing up and forward, a cool shade along the edges facing down and back;
 * - a fine grain so large flat panels read as material, not paper.
 * `px` is the band width in layer pixels.
 */
function lightLayer(c: HTMLCanvasElement, w: number, h: number, px: number, rim: string): void {
  const g = c.getContext('2d');
  const mask = scratch('mask', w, h);
  const band = scratch('band', w, h);
  const mg = mask.getContext('2d');
  const bg = band.getContext('2d');
  if (!g || !mg || !bg) return;
  mg.setTransform(1, 0, 0, 1, 0, 0);
  mg.globalCompositeOperation = 'source-over';
  mg.clearRect(0, 0, w, h);
  mg.drawImage(c, 0, 0, w, h, 0, 0, w, h);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const form = g.createLinearGradient(0, 0, 0, h);
  form.addColorStop(0, 'rgba(255,246,228,0.16)');
  form.addColorStop(0.38, 'rgba(0,0,0,0)');
  form.addColorStop(1, 'rgba(10,8,24,0.34)');
  g.fillStyle = form;
  g.fillRect(0, 0, w, h);
  const edge = (dx: number, dy: number, color: string, alpha: number): void => {
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, w, h);
    bg.drawImage(mask, 0, 0, w, h, 0, 0, w, h);
    bg.globalCompositeOperation = 'destination-out';
    bg.drawImage(mask, 0, 0, w, h, dx, dy, w, h);
    bg.globalCompositeOperation = 'source-in';
    bg.fillStyle = color;
    bg.fillRect(0, 0, w, h);
    g.globalAlpha = alpha;
    g.drawImage(band, 0, 0, w, h, 0, 0, w, h);
    g.globalAlpha = 1;
  };
  edge(-px, px, rim, 0.6); // edges facing up and right
  edge(px, -px, '#0b0a1a', 0.32); // edges facing down and left
  const pat = g.createPattern(grainTile(), 'repeat');
  if (pat) {
    g.globalAlpha = 0.06;
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
  }
  g.restore();
}

/**
 * Paints a body into an off-screen layer (`paint` draws in world units on the context it is given), lights it
 * with `lightLayer`, and puts it on `main`. The layer has two pixels per world pixel at most, the size of a
 * high-definition sprite pixel, so bosses share the heroes' pixel grid; it is blown up with hard edges.
 */
export function litLayer(
  main: Ctx,
  box: LitBox,
  paint: (g: Ctx, toWorld: (x: number, y: number) => [number, number, number]) => void,
  rim = '#ffe2a8',
): void {
  const m = main.getTransform();
  const s = Math.abs(m.a);
  const same = (x: number, y: number): [number, number, number] => [x, y, 1];
  if (!s || typeof document === 'undefined') {
    paint(main, same);
    return;
  }
  const L = Math.min(s, 2);
  const pad = 4;
  const w = Math.ceil(box.w * L) + pad * 2;
  const h = Math.ceil(box.h * L) + pad * 2;
  const c = scratch('body', w, h);
  const g = c.getContext('2d');
  if (!g) {
    paint(main, same);
    return;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  g.imageSmoothingEnabled = true;
  g.setTransform(L, 0, 0, L, pad - box.x * L, pad - box.y * L);
  // a point in the painter's current local frame, in world units (and the frame's x scale)
  const toWorld = (x: number, y: number): [number, number, number] => {
    const t = g.getTransform();
    return [
      (t.a * x + t.c * y + t.e - pad) / L + box.x,
      (t.b * x + t.d * y + t.f - pad) / L + box.y,
      Math.abs(t.a) / L,
    ];
  };
  paint(g, toWorld);
  lightLayer(c, w, h, Math.max(1, Math.round(L * 1.2)), rim);
  const k = s / L;
  main.save();
  main.setTransform(1, 0, 0, 1, 0, 0);
  main.imageSmoothingEnabled = k < 1;
  main.drawImage(
    c,
    0,
    0,
    w,
    h,
    Math.round(m.a * box.x + m.e - pad * k),
    Math.round(m.d * box.y + m.f - pad * k),
    w * k,
    h * k,
  );
  main.restore();
}

/**
 * `litLayer` for the themed boss painters: they draw on `k.ctx` as usual, while their glows, warnings, sight lines
 * and labels are held back and drawn on top of the lit body afterwards, unlit and unclipped (a tell must stay
 * exactly as bright as players learned it).
 */
export function litBody(k: BossKit, box: LitBox, paint: (k: BossKit) => void, rim?: string): void {
  const later: (() => void)[] = [];
  litLayer(
    k.ctx,
    box,
    (g, toWorld) =>
      paint({
        ...k,
        ctx: g,
        // ground shadows go straight onto the scene, under the body (in world units, whatever frame the painter is in)
        shadowAt: (x, y, w, a) => {
          const [wx, wy, sx] = toWorld(x, y);
          k.shadowAt(wx, wy, w * sx, a);
        },
        glow: (x, y, r, c) => later.push(() => k.glow(x, y, r, c)),
        warnIcon: (x, y, n) => later.push(() => k.warnIcon(x, y, n)),
        sightLine: (x, y, a, l, p) => later.push(() => k.sightLine(x, y, a, l, p)),
        label: (t, x, y, c, sz) => later.push(() => k.label(t, x, y, c, sz)),
      }),
    rim,
  );
  for (const f of later) f();
}
