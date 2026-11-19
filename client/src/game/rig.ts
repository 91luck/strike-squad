/**
 * Skeletal (cut-out) animation for the heroes.
 *
 * The heroes used to be drawn from a fixed set of rendered frames (8 run frames, 5 aim angles), so a run stepped and
 * an aim snapped. Now each hero is a set of parts rendered from the same Blender model (art3d/hero_parts.py →
 * art3d/pack_parts.py: `assets/rigs/h<id>.webp + .json`) and put together every frame from joint angles computed
 * here, so every movement is continuous:
 *
 *   - the run cycle follows the distance actually covered (no foot sliding at any speed);
 *   - the rifle follows the aim at any angle, both hands kept on it by a two-bone IK;
 *   - poses blend into each other (no pop from run to jump to fall), with a landing dip, a lean into speed and a
 *     breathing idle;
 *   - a hit makes the body flinch.
 *
 * Angles follow the canvas: radians, positive turns clockwise on screen (forward and down for a hero facing right).
 * Positions are HD sprite pixels (2 per game pixel) with the feet at (0, 0) and y down, as in the rig's json.
 *
 * Until a hero's atlas has loaded (or without a browser, in tests) `RigDraw.draw` returns null and the renderer uses
 * the old frames.
 */

type Ctx = CanvasRenderingContext2D;
type V = [number, number];

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
  py: number;
  joint: string;
}
interface Meta {
  ss: number;
  joints: Record<string, V>;
  parts: Record<string, Part>;
  /** how hard the weapon kicks back per shot (HD px); a bow pulls, a pistol snaps */
  recoil?: number;
}

const metas = import.meta.glob<Meta>('../assets/rigs/*.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../assets/rigs/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Blender units per HD pixel (art3d/hero_rig.py PX). */
const PX = 1.8 / 88;
const DEG = Math.PI / 180;
/** HD pixels per game pixel. */
const HD = 2;
const OUTLINE = '#141019';
/**
 * The parts are stored at 4 px per game px (sharp when turned); a frame is put together at Q of that, about 2.5 px
 * per game px: as sharp as the game is ever drawn, at under half the fill cost.
 */
const Q = 0.625;

const PARENT: Record<string, string | null> = {
  root: null,
  spine: 'root',
  neck: 'spine',
  aim: 'spine',
  thigh_n: 'root',
  shin_n: 'thigh_n',
  thigh_f: 'root',
  shin_f: 'thigh_f',
  upper_n: 'spine',
  fore_n: 'upper_n',
  upper_f: 'spine',
  fore_f: 'upper_f',
};
const ORDER = Object.keys(PARENT);
/** Back to front. */
const DRAW = [
  'cape',
  'upper_f',
  'fore_f',
  'thigh_f',
  'shin_f',
  'pelvis',
  'torso',
  'thigh_n',
  'shin_n',
  'head',
  'gun',
  'upper_n',
  'fore_n',
  'knife',
];

export interface RigInput {
  id: string;
  /** whose parts: a hero (`h<id>`) or a villain (`v-<kind>`) */
  key: string;
  x: number;
  vx: number;
  vy: number;
  ground: boolean;
  crouch: boolean;
  slide: boolean;
  dash: boolean;
  /** melee ticks left (0 = not swinging) */
  melee: number;
  /** air jumps left (0 just after the double jump: the flip) */
  airJumps: number;
  aimX: number;
  aimY: number;
  /** invulnerable (just hit) */
  hurt: boolean;
  down: boolean;
  nowMs: number;
  /** a villain's swing: 0 none, 0..0.6 raising the weapon, 0.6..1 bringing it down */
  swing?: number;
  /** shooting now: the weapon kicks back with each shot and the arms follow it */
  fire?: boolean;
}

/** A pose: joint angles (Blender degrees, + = forward/up, as hero_rig.py writes them) and the hips' offset. */
interface Pose {
  a: Record<string, number>;
  rootZ: number;
  rootX: number;
  lean: number;
  aim: number;
  arms: 'ik' | 'melee0' | 'melee1' | 'down';
  knife: boolean;
}

function pose(inp: RigInput, aimDeg: number): Pose {
  const a: Record<string, number> = {};
  let lean = 0;
  let rootZ = 0.78;
  let rootX = 0;
  let aim = aimDeg;
  let arms: Pose['arms'] = 'ik';
  const set = (k: string, v: number): void => {
    a[k] = v;
  };
  const legs = (tn: number, sn: number, tf: number, sf: number): void => {
    set('thigh_n', tn);
    set('shin_n', sn);
    set('thigh_f', tf);
    set('shin_f', sf);
  };
  if (inp.down) {
    rootZ = 0.2;
    rootX = 0.42;
    set('root', -88);
    legs(15, -20, 5, -10);
    aim = -60;
    arms = 'down';
  } else if (inp.melee > 0) {
    const strike = Math.sin(inp.nowMs / 48);
    legs(28 + strike * 3, -12, -20 - strike * 2, -10);
    lean = inp.melee >= 4 ? 1.5 + strike * 1.5 : 10 + strike * 2.5;
    arms = inp.melee >= 4 ? 'melee0' : 'melee1';
  } else if (inp.slide) {
    rootZ = 0.32;
    legs(80, -5, 40, -95);
    lean = -30;
  } else if (inp.dash) {
    legs(30, -40, -45, -30);
    lean = 22;
  } else if (inp.crouch) {
    rootZ = 0.5;
    rootX = -0.06;
    legs(85, -120, 60, -125);
    lean = 14;
  } else if (!inp.ground) {
    if (inp.airJumps === 0 && inp.vy < 120) {
      // the double jump's tuck
      rootZ = 0.9;
      legs(110, -140, 95, -140);
      lean = 35;
      aim = -20;
    } else if (inp.vy < 0) {
      legs(55, -85, 15, -60);
      lean = 4;
    } else {
      // falling: the legs reach down for the ground the faster it comes
      const k = Math.min(1, inp.vy / 500);
      legs(20 - 10 * k, -25 + 10 * k, -12, -35 + 15 * k);
      lean = -3;
    }
  } else if (Math.abs(inp.vx) > 1) {
    // The run cycle follows signed world distance: it stays continuous when the hero reverses direction.
    const ph = (inp.x / 72) * Math.PI * 2;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const speed = Math.min(1, Math.abs(inp.vx) / 260);
    for (const [side, k] of [
      ['n', 1],
      ['f', -1],
    ] as const) {
      set(`thigh_${side}`, 38 * s * k * (0.6 + 0.4 * speed));
      const bend = Math.max(0, -Math.cos(ph + (k > 0 ? 0 : Math.PI))) * 75 + 8;
      set(`shin_${side}`, -bend);
    }
    // Compress on contact and lift through the flight phase; counter-rotate the torso for a less
    // mechanical silhouette. The amplitude scales with speed, but never changes movement physics.
    rootZ = 0.78 - 0.018 + Math.abs(c) * (0.025 + 0.018 * speed);
    rootX = Math.sin(ph) * 0.025 * speed;
    lean = 5 + 7 * speed + s * 2.2;
  } else {
    // idle: weight on the back leg, breathing
    const breath = Math.sin(inp.nowMs / 610);
    const settle = Math.sin(inp.nowMs / 1750 + 0.8);
    rootZ = 0.78 - 0.009 + breath * 0.012;
    rootX = settle * 0.012;
    legs(6 + breath * 1.4, -4 - Math.max(0, breath) * 2, -6 - breath * 1.1, -4);
    // Tiny head/shoulder counter-motion gives the idle pose a living, alert quality.
    lean = 2 + Math.sin(inp.nowMs / 690 + 1) * 1.15 + settle * 0.55;
  }
  return { a, rootZ, rootX, lean, aim, arms, knife: inp.melee > 0 };
}

interface State {
  ang: Record<string, number>;
  rootZ: number;
  rootX: number;
  aim: number;
  lastMs: number;
  ground: boolean;
  landMs: number;
  hurtMs: number;
  hurt: boolean;
  recoil: number;
  canvas: HTMLCanvasElement;
  sil: HTMLCanvasElement;
}

export interface RigFrame {
  /** the composed hero, outline included, `scale` px per game px, feet at (ox, oy) */
  img: HTMLCanvasElement;
  sil: HTMLCanvasElement;
  ox: number;
  oy: number;
  scale: number;
  /** muzzle in game px from the feet, facing right */
  muzzleX: number;
  muzzleY: number;
}

interface Loaded {
  meta: Meta;
  img: HTMLImageElement;
  ready: boolean;
}

const loaded = new Map<string, Loaded | null>();

/** Whether parts exist for this key (a hero `h<id>` or a villain `v-<kind>`). */
export function hasRig(key: string): boolean {
  return !!metas[`../assets/rigs/${key}.json`];
}

function rigOf(key: string): Loaded | null {
  if (loaded.has(key)) return loaded.get(key) ?? null;
  const meta = metas[`../assets/rigs/${key}.json`];
  const url = urls[`../assets/rigs/${key}.webp`];
  if (!meta || !url || typeof Image === 'undefined' || typeof document === 'undefined') {
    loaded.set(key, null);
    return null;
  }
  const img = new Image();
  img.decoding = 'async';
  const l: Loaded = { meta, img, ready: false };
  img.onload = () => {
    l.ready = true;
  };
  img.src = url;
  loaded.set(key, l);
  return l;
}

/** Starts loading these parts (heroes at start, a stage's villains when it begins). */
export function preloadRigs(keys: string[]): void {
  for (const k of keys) rigOf(k);
}

const rot = (v: V, a: number): V => [
  v[0] * Math.cos(a) - v[1] * Math.sin(a),
  v[0] * Math.sin(a) + v[1] * Math.cos(a),
];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const len = (v: V): number => Math.hypot(v[0], v[1]);
const angOf = (v: V): number => Math.atan2(v[1], v[0]);

/** Frame size (HD px) the parts are put together in, feet at (CX, FY). */
const FW = 170;
const FH = 150;
const CX = 85;
const FY = 128;

export class RigDraw {
  private states = new Map<string, State>();

  /** Composes this hero's frame now, or null if its parts are not loaded (draw the old frame then). */
  draw(inp: RigInput): RigFrame | null {
    const rig = rigOf(inp.key);
    if (!rig || !rig.ready) return null;
    const M = rig.meta;
    const J = M.joints;
    let st = this.states.get(inp.id);
    if (!st) {
      const ss = M.ss;
      const mk = (): HTMLCanvasElement => {
        const c = document.createElement('canvas');
        c.width = Math.ceil(FW * ss * Q);
        c.height = Math.ceil(FH * ss * Q);
        return c;
      };
      st = {
        ang: {},
        rootZ: 0.78,
        rootX: 0,
        aim: 0,
        lastMs: inp.nowMs,
        ground: inp.ground,
        landMs: -1e9,
        hurtMs: -1e9,
        hurt: false,
        recoil: 0,
        canvas: mk(),
        sil: mk(),
      };
      this.states.set(inp.id, st);
    }
    const dt = Math.min(0.1, Math.max(0, (inp.nowMs - st.lastMs) / 1000));
    st.lastMs = inp.nowMs;
    if (inp.ground && !st.ground) st.landMs = inp.nowMs;
    st.ground = inp.ground;
    if (inp.hurt && !st.hurt) st.hurtMs = inp.nowMs;
    st.hurt = inp.hurt;

    // the aim, in degrees above the horizontal, smoothed (the input is 8-way; the rifle swings to it)
    const want =
      inp.aimX === 0 && inp.aimY === 0
        ? 0
        : Math.max(-88, Math.min(88, Math.atan2(-inp.aimY, Math.abs(inp.aimX) || 0.0001) / DEG));
    st.aim += (want - st.aim) * (1 - Math.exp(-dt * 22));
    // a villain's swing: the weapon goes up, then comes down hard
    const sw = inp.swing ?? 0;
    const swingAim = sw <= 0 ? null : sw < 0.6 ? 20 + (sw / 0.6) * 60 : 80 - ((sw - 0.6) / 0.4) * 130;
    const P = pose(inp, swingAim ?? st.aim);
    // blend toward the pose: quick, so it reads as smooth, never as late
    const k = 1 - Math.exp(-dt * 16);
    const kRun = 1 - Math.exp(-dt * 40);
    const fast =
      inp.ground && Math.abs(inp.vx) > 1 && !inp.slide && !inp.dash && !inp.crouch && inp.melee === 0;
    for (const j of ORDER) {
      const target = P.a[j] ?? 0;
      const cur = st.ang[j] ?? target;
      st.ang[j] =
        cur +
        (target - cur) * (fast && j.startsWith('thigh') ? kRun : fast && j.startsWith('shin') ? kRun : k);
    }
    st.rootZ += (P.rootZ - st.rootZ) * (fast ? kRun : k);
    st.rootX += (P.rootX - st.rootX) * k;
    // the weapon's kick: a pulse with every shot while the trigger is held, eased so it reads as a recoil, not a flicker
    const pulse = inp.fire ? (Math.floor(inp.nowMs / 55) % 2 === 0 ? 1 : 0.3) : 0;
    st.recoil += (pulse - st.recoil) * (1 - Math.exp(-dt * 38));
    // a dip on landing, a flinch when hit
    const land = Math.max(0, 1 - (inp.nowMs - st.landMs) / 160);
    const flinch = Math.max(0, 1 - (inp.nowMs - st.hurtMs) / 220);
    const lean = P.lean - flinch * 14;
    const rootZ = st.rootZ - land * 0.07;

    // ---- forward kinematics (canvas angles: -Blender degrees)
    const local: Record<string, number> = {};
    for (const j of ORDER) local[j] = -(st.ang[j] ?? 0) * DEG;
    local.spine = lean * DEG;
    local.neck = -(lean * 0.4 + Math.max(-25, Math.min(25, P.aim * 0.25))) * DEG;
    local.thigh_n = (local.thigh_n ?? 0) - land * 18 * DEG;
    local.shin_n = (local.shin_n ?? 0) + land * 30 * DEG;
    local.thigh_f = (local.thigh_f ?? 0) - land * 14 * DEG;
    local.shin_f = (local.shin_f ?? 0) + land * 26 * DEG;
    if (P.arms === 'melee0' || P.arms === 'melee1') local.aim = (55 + lean) * DEG;
    else if (P.arms === 'down') local.aim = 70 * DEG;
    else local.aim = -(P.aim + lean + st.recoil * 3) * DEG;
    const pos: Record<string, V> = {};
    const wang: Record<string, number> = {};
    const rest = (j: string): V => (J[j] as V) ?? [0, 0];
    const place = (j: string): void => {
      const par = PARENT[j];
      if (!par) {
        const r = rest('root');
        pos[j] = [r[0] + st.rootX / PX, r[1] - (rootZ - 0.78) / PX];
        wang[j] = local[j] ?? 0;
        return;
      }
      wang[j] = (wang[par] as number) + (local[j] ?? 0);
      pos[j] = add(pos[par] as V, rot(sub(rest(j), rest(par)), wang[par] as number));
    };
    const at = (j: string, point: string): V =>
      add(pos[j] as V, rot(sub(rest(point), rest(j)), wang[j] as number));
    for (const j of ['root', 'spine', 'neck', 'aim', 'thigh_n', 'shin_n', 'thigh_f', 'shin_f']) place(j);
    // the kick: the weapon slides back along its own line, and the IK below takes the hands with it
    if (st.recoil > 0.01)
      pos.aim = add(pos.aim as V, rot([-st.recoil * (M.recoil ?? 3), 0], wang.aim as number));
    // ---- arms: two-bone IK to the rifle's grips (or free swings in melee and when down)
    const arm = (side: 'n' | 'f', target: V | null, up: number, fore: number): void => {
      const u = `upper_${side}`;
      const f = `fore_${side}`;
      wang[u] = 0;
      pos[u] = add(pos.spine as V, rot(sub(rest(u), rest('spine')), wang.spine as number));
      const a = len(sub(rest(f), rest(u)));
      const b = len(sub(rest(`hand_${side}`), rest(f)));
      const ra = angOf(sub(rest(f), rest(u)));
      const rb = angOf(sub(rest(`hand_${side}`), rest(f)));
      if (!target) {
        wang[u] = (wang.spine as number) - up * DEG;
        pos[f] = add(pos[u] as V, rot(sub(rest(f), rest(u)), wang[u] as number));
        wang[f] = (wang[u] as number) - fore * DEG;
        return;
      }
      const S = pos[u] as V;
      const d = sub(target, S);
      const L = Math.max(0.5, Math.min(a + b - 0.01, len(d)));
      const base = angOf(d);
      const off = Math.acos(Math.max(-1, Math.min(1, (a * a + L * L - b * b) / (2 * a * L))));
      const phi1 = d[0] >= -1 ? base + off : base - off; // elbow down
      const E: V = [S[0] + Math.cos(phi1) * a, S[1] + Math.sin(phi1) * a];
      const phi2 = angOf(sub(target, E));
      wang[u] = phi1 - ra;
      pos[f] = add(S, rot(sub(rest(f), rest(u)), wang[u]));
      wang[f] = phi2 - rb;
    };
    if (P.arms === 'ik') {
      arm('n', at('aim', 'grip'), 0, 0);
      arm('f', at('aim', 'foregrip'), 0, 0);
    } else if (P.arms === 'down') {
      arm('n', null, 160, -10);
      arm('f', null, 150, -20);
    } else {
      arm('f', at('aim', 'foregrip'), 0, 0);
      if (P.arms === 'melee0') arm('n', null, -150, -60);
      else arm('n', null, 70, 10);
    }

    // ---- compose
    const ss = M.ss;
    const c = st.canvas.getContext('2d') as Ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, st.canvas.width, st.canvas.height);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    for (const key of DRAW) {
      const part = M.parts[key];
      if (!part) continue;
      if (key === 'knife' && !P.knife) continue;
      const j = part.joint;
      const p = pos[j];
      if (!p) continue;
      c.setTransform(Q, 0, 0, Q, (CX + p[0]) * ss * Q, (FY + p[1]) * ss * Q);
      c.rotate(wang[j] as number);
      c.drawImage(rig.img, part.x, part.y, part.w, part.h, -part.px, -part.py, part.w, part.h);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    // the outline's silhouette: the same shape in one dark colour
    const s = st.sil.getContext('2d') as Ctx;
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, st.sil.width, st.sil.height);
    s.drawImage(st.canvas, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = OUTLINE;
    s.fillRect(0, 0, st.sil.width, st.sil.height);
    s.globalCompositeOperation = 'source-over';
    const mz = at('aim', 'muzzle');
    return {
      img: st.canvas,
      sil: st.sil,
      ox: CX * ss * Q,
      oy: FY * ss * Q,
      scale: ss * HD * Q,
      muzzleX: mz[0] / HD,
      muzzleY: mz[1] / HD,
    };
  }

  /** Forget a player who has left. */
  drop(id: string): void {
    this.states.delete(id);
  }
}

/** Draws a composed frame at a world point (feet), facing left or right, with its dark outline. */
export function blitRig(ctx: Ctx, f: RigFrame, x: number, y: number, facing: number): void {
  const k = 1 / f.scale;
  ctx.save();
  ctx.translate(x, y);
  if (facing < 0) ctx.scale(-1, 1);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  const w = f.img.width * k;
  const h = f.img.height * k;
  const o = 0.6; // outline width, game px
  for (const [dx, dy] of [
    [-o, 0],
    [o, 0],
    [0, -o],
    [0, o],
  ] as const)
    ctx.drawImage(f.sil, -f.ox * k + dx, -f.oy * k + dy, w, h);
  ctx.drawImage(f.img, -f.ox * k, -f.oy * k, w, h);
  ctx.imageSmoothingEnabled = smooth;
  ctx.restore();
}
