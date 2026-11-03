import {
  ATTACK,
  BULLET_KINDS,
  GAME_CONFIG,
  WEAPON_KINDS,
  defaultMissionSettings,
  isBoss,
  rankOf,
  secondsToTicks,
  type AttackId,
  type BossKind,
  type BulletKind,
  type EnemyKind,
  type MissionSettings,
  type PickupKind,
  type TrooperKind,
  type UltKind,
  type WeaponKind,
  POWER_KINDS,
  isPower,
  type PowerKind,
} from './config';
import { heroOf } from './heroes';
import { fieldAt, levelHeight, levelWidth, type ArenaDef, type LevelDef, type MissionMods } from './level';
import { getMission } from './missions';
import {
  NEUTRAL_INPUT,
  aimOf,
  groundBelow,
  moveBody,
  newMover,
  sanitizeInput,
  solidAtPoint,
  stepPlayerMovement,
  type Mover,
  type PlayerInput,
  type World,
} from './physics';
import type { BoardEntry } from './protocol';
import { Rng } from './rng';

/**
 * The authoritative co-op mission simulation. Pure and deterministic for a given seed and input sequence: no
 * timers, no I/O, no Math.random. The server runs it; offline solo play runs the very same class in the browser.
 *
 * Gameplay in one paragraph: a squad fights through a side-scrolling level. Soldiers have a 100 HP bar that refills
 * when out of fire, a dash with i-frames, a double jump, a slide, a knife, and a hero super move ("ultimate") that
 * charges from fighting. Hits chain into a combo with a style rank. Lock-down arenas throw waves at the squad and
 * three bosses (WARHOUND, VULTURE, IRON FORTRESS) have telegraphed attacks to read and dodge. KO'd soldiers come
 * back a few seconds later using a shared team life.
 */

export type MissionPhase = 'countdown' | 'playing' | 'ended';
export type MissionResult = 'won' | 'failed';
export type FailReason = 'lives' | 'time' | 'abandoned';
export type StyleTag = 'parry' | 'melee' | 'slide' | 'air' | 'multi' | 'shield';
type DamageSource = 'gun' | 'melee' | 'slide' | 'ult' | 'blast' | 'astra';

export interface PlayerStats {
  kills: number;
  deaths: number;
  bossDamage: number;
  score: number;
  bestCombo: number;
  /** Best style rank reached (-1 none, 0 = C … 5 = SSS). */
  bestRank: number;
  ults: number;
}

export interface Player extends Mover {
  id: string;
  name: string;
  /** Seat index 0..7. */
  slot: number;
  /** Chosen hero (look, colour and super move), 0..7. */
  hero: number;
  ultKind: UltKind;
  hp: number;
  state: 'alive' | 'dead';
  /** Tick at which a KO'd soldier comes back (if the team has a life left). */
  respawnAt: number;
  invulnUntil: number;
  /** Dash i-frames last a little longer than the dash itself. */
  dodgeUntil: number;
  lastHurt: number;
  weapon: WeaponKind;
  nextFireTick: number;
  input: PlayerInput;
  /** Tick at which `input` was last set (presses arriving in the same tick are merged). */
  inputTick: number;
  prevMelee: boolean;
  prevUlt: boolean;
  aimX: number;
  aimY: number;
  lastSafeX: number;
  lastSafeY: number;
  /** Ticks this player's screen lags behind the server (lag compensation), clamped to maxRewind. */
  viewLag: number;
  /** Super-move meter 0..100. */
  ult: number;
  lastUltTick: number;
  overdriveUntil: number;
  meleeUntil: number;
  nextMelee: number;
  /** Enemies already knocked by the current slide. */
  slideHits: Set<number>;
  combo: number;
  comboUntil: number;
  multiN: number;
  multiUntil: number;
  stats: PlayerStats;
  /** Held power (astra) and its charges. */
  power: PowerKind | null;
  powerN: number;
  prevAstra: boolean;
}

/** Ground set on fire by the agni astra: hurts enemies standing in it. */
export interface Burn {
  x0: number;
  x1: number;
  y: number;
  until: number;
  owner: string;
}

/** A black hole made by the singularity power: swallows enemies and their shots. */
export interface Hole {
  x: number;
  y: number;
  born: number;
  until: number;
  owner: string;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  body: Mover;
  hp: number;
  maxHp: number;
  awake: boolean;
  nextFire: number;
  /** Tick of the last hit (renderer flashes the sprite). */
  hitTick: number;
  /** Boss phase 1..3. */
  phase: number;
  /** Spawned by a boss (drones, jetpack drops). */
  fromBoss: boolean;
  /** Arena wave this enemy belongs to (-1: placed in the level). */
  arena: number;
  homeX: number;
  homeY: number;
  /** Riot shield health (shield troopers); 0 = no shield. */
  shield: number;
  /** Health multiplier from the level (twin bosses). */
  hpMul: number;
  /** Blown back by the wind astra until this tick, at this speed. */
  knockUntil: number;
  knockVx: number;
  /** Boss attack state. */
  atk: AttackId;
  atkStart: number;
  atkParam: number;
  nextAtk: number;
  cycle: number;
  /** Bursts (jetpack) and multi-step attacks. */
  burst: number;
  /** Aim angle in radians (turrets, boss guns), for drawing. */
  aim: number;
  /** Ring buffer of recent positions for lag-compensated hit tests. */
  hist: Float32Array;
}

export interface Bullet {
  id: number;
  enemy: boolean;
  owner: string;
  kind: BulletKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  pierce: boolean;
  expires: number;
  born: number;
  /** Ticks of rewind applied to enemy positions when this bullet tests hits (shooter's view lag). */
  lag: number;
  weapon: WeaponKind | null;
  /** Overdrive round (drawn hotter). */
  power: boolean;
  hit: Set<number> | null;
  /** Gravity (px/s²) for lobbed ordnance. */
  grav: number;
  /** Blast radius: explodes on impact. */
  blast: number;
  /** Extra hit radius around the point. */
  size: number;
}

export type SimEvent =
  | { e: 'ehit'; id: number; x: number; y: number }
  | { e: 'ekill'; id: number; kind: EnemyKind; x: number; y: number; by: string; pts: number }
  | { e: 'hurt'; id: string; dmg: number }
  | { e: 'ko'; id: string }
  | { e: 'respawn'; id: string }
  | { e: 'pickup'; id: number; kind: PickupKind; by: string; healed: string[] }
  | { e: 'gate'; id: number }
  | { e: 'checkpoint'; id: number }
  | { e: 'arena'; id: number; wave: number; of: number }
  | { e: 'clear'; id: number }
  | { e: 'life'; lives: number }
  | { e: 'bossWake'; kind: BossKind; arena: number }
  | { e: 'bossPhase'; kind: BossKind; phase: number }
  | { e: 'bossDown'; kind: BossKind; x: number; y: number }
  | {
      e: 'ult';
      id: string;
      kind: UltKind;
      x: number;
      y: number;
      f: 1 | -1;
      sync: boolean;
      /** Phantom strike: x,y pairs of every enemy slashed. */
      hits?: number[];
    }
  | { e: 'boom'; x: number; y: number; r: number }
  /** A power was used (x, y: the user's feet; f: facing). */
  | { e: 'astra'; id: string; kind: PowerKind; x: number; y: number; f: 1 | -1 }
  /** The team brahmastra: phase 0 = wind-up (sky darkens), 1 = the strike. */
  | { e: 'brahma'; id: string; x: number; y: number; phase: 0 | 1 }
  | { e: 'style'; id: string; t: StyleTag; x: number; y: number }
  | { e: 'start' }
  | { e: 'end'; result: MissionResult; reason?: FailReason };

export interface PlayerSnapshot {
  id: string;
  n: string;
  s: number;
  /** Hero id. */
  hr: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: 0 | 1;
  f: 1 | -1;
  c: 0 | 1;
  ax: number;
  ay: number;
  /** Health 0..100. */
  hp: number;
  /** 0 alive, 1 KO'd (waiting to respawn). */
  st: 0 | 1;
  /** Seconds until respawn (0 when alive; -1 when out of team lives). */
  dl: number;
  w: number;
  iv: 0 | 1;
  fi: 0 | 1;
  k: number;
  /** Ultimate meter 0..100, overdrive active. */
  ul: number;
  od: 0 | 1;
  /** Combo hits and style rank (-1 none). */
  cb: number;
  rk: number;
  /** Melee swing in progress (0..1, 0 = none) ×10. */
  ml: number;
  /** Needed for client prediction. */
  co: number;
  dr: number;
  pj: 0 | 1;
  aj: number;
  dsh: number;
  sld: number;
  dcd: number;
  dd: 1 | -1;
  ad: 0 | 1;
  pd: 0 | 1;
  /** Held power (index into POWER_KINDS, -1 none) and charges. */
  pw: number;
  pn: number;
}

/** Lasting power effects on screen: burning ground (k 0: x..x+w at y) and black holes (k 1: centre x,y). */
export interface FxSnapshot {
  k: 0 | 1;
  x: number;
  y: number;
  w: number;
  /** Seconds left. */
  t: number;
}

export interface EnemySnapshot {
  id: number;
  k: EnemyKind;
  x: number;
  y: number;
  /** Health 0..100 (percent). */
  hp: number;
  f: 1 | -1;
  /** 1 = flashed by a hit very recently. */
  h: 0 | 1;
  /** Aim angle (turrets/bosses) in radians ×100. */
  a: number;
  /** Shield up. */
  sh: 0 | 1;
  /** Boss attack id, ticks since it started, its parameter, and the boss phase. */
  at: number;
  tt: number;
  p: number;
  ph: number;
}

export interface BulletSnapshot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 = enemy bullet. */
  e: 0 | 1;
  /** Weapon index for player bullets. */
  w: number;
  /** Projectile kind (BULLET_KINDS index). */
  k: number;
  p: 0 | 1;
}

export interface Snapshot {
  tick: number;
  phase: MissionPhase;
  result: MissionResult | null;
  /** Countdown seconds left (0 once playing). */
  cd: number;
  lives: number;
  cp: number;
  /** Bitmasks: open gates, taken pickups. */
  gates: number;
  taken: number;
  score: number;
  /** Bodies may not move right of this x (the final boss's front while it stands). */
  lx: number;
  /** The arena currently locked down, if any. */
  arena: { id: number; w: number; n: number; left: number } | null;
  /** The boss currently fighting, if any. */
  boss: { k: BossKind; hp: number; max: number; ph: number; h: 0 | 1 } | null;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  bullets: BulletSnapshot[];
  /** Team brahmastra meter 0..100 (-1: not in this mission). */
  bm: number;
  fx: FxSnapshot[];
}

export interface SimOptions {
  seed?: number;
  tickRate?: number;
  settings?: Partial<MissionSettings>;
  /** Overrides the mission picked in `settings` (tests). */
  level?: LevelDef;
}

const HIST = 16;
const r1 = (v: number): number => Math.round(v * 10) / 10;
const P = GAME_CONFIG.player;
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;
const U = GAME_CONFIG.ult;
const C = GAME_CONFIG.combo;
const SHELL_G = 900;

/** Telegraph (wind-up) of each boss attack, seconds. The renderer reads the same table to draw warnings. */
export const ATTACK_WINDUP: Record<number, number> = {
  [ATTACK.cannon]: 0.6,
  [ATTACK.mg]: 0.5,
  [ATTACK.charge]: 0.85,
  [ATTACK.stomp]: 0.55,
  [ATTACK.bombs]: 0.5,
  [ATTACK.missiles]: 0.6,
  [ATTACK.troops]: 0.5,
  [ATTACK.strafe]: 0.5,
  [ATTACK.volley]: 0.45,
  [ATTACK.beamLow]: 1.0,
  [ATTACK.beamHigh]: 1.0,
  [ATTACK.slam]: 0.6,
};
/** How long a beam burns once it fires. */
export const BEAM_SEC = 0.5;
/** Beam heights above the floor (centre) and half thickness. */
export const BEAM = { lowY: 12, highY: 31, half: 7 };

export class Sim {
  readonly level: LevelDef;
  readonly settings: MissionSettings;
  /** How much tougher this mission is than the base rules. */
  readonly mods: MissionMods;
  readonly tickRate: number;
  readonly dt: number;
  readonly rng: Rng;
  tick = 0;
  phase: MissionPhase = 'countdown';
  result: MissionResult | null = null;
  failReason: FailReason | null = null;
  lives: number;
  checkpoint = 0;
  score = 0;
  readonly players = new Map<string, Player>();
  readonly enemies = new Map<number, Enemy>();
  bullets: Bullet[] = [];
  gateOpen: boolean[];
  taken: boolean[];
  /** Arena state: 0 waiting, 1 locked (fighting), 2 cleared. */
  arenaState: number[];
  arenaWave: number[];
  private arenaNext: number[];
  /** Total health of every boss woken in each arena (the boss bar's full length). */
  private arenaBossMax: number[];
  /** Tick at which a taken altar comes back (-1: not waiting). */
  private altarBack: number[];
  /** Team brahmastra meter (-1 when the mission has none). */
  brahma: number;
  private brahmaStrike: { at: number; id: string; x: number; y: number } | null = null;
  burns: Burn[] = [];
  holes: Hole[] = [];
  /** The final boss (the mission is won when it falls). */
  boss: Enemy | null = null;
  private events: SimEvent[] = [];
  private nextBulletId = 1;
  private nextEnemyId = 10_000;
  private countdownEnd: number;
  private endAt = -1;
  private pendingResult: MissionResult | null = null;
  private readonly maxRewind: number;
  readonly world: World;

  constructor(opts: SimOptions = {}) {
    this.settings = { ...defaultMissionSettings(), ...opts.settings };
    this.level = opts.level ?? getMission(this.settings.mission);
    this.mods = this.level.mods;
    this.tickRate = opts.tickRate ?? GAME_CONFIG.tickRate;
    this.dt = 1 / this.tickRate;
    this.rng = new Rng(opts.seed ?? 1);
    this.lives = GAME_CONFIG.mission.livesBase[this.settings.difficulty];
    this.gateOpen = this.level.gates.map(() => false);
    this.taken = this.level.pickups.map(() => false);
    this.arenaState = this.level.arenas.map(() => 0);
    this.arenaWave = this.level.arenas.map(() => 0);
    this.arenaNext = this.level.arenas.map(() => -1);
    this.arenaBossMax = this.level.arenas.map(() => 0);
    this.altarBack = this.level.pickups.map(() => -1);
    this.brahma = this.level.brahma ? 0 : -1;
    this.countdownEnd = this.ticks(GAME_CONFIG.mission.countdownSec);
    this.maxRewind = this.ticks(GAME_CONFIG.limits.maxRewindSec);
    this.world = {
      level: this.level,
      isGateOpen: (id) => this.gateOpen[id] === true,
      limitX: levelWidth(this.level),
    };
    for (const s of this.level.enemies) this.spawnEnemy(s.id, s.kind, s.x, s.y);
    for (const [i, b] of this.level.bosses.entries()) {
      const e = this.spawnEnemy(9_000 + i, b.kind, b.x, b.y);
      e.arena = b.arena;
      e.hpMul = b.hpMul;
      if (b.kind === 'boss') this.boss = e;
    }
    this.updateLimit();
  }

  ticks(sec: number): number {
    return secondsToTicks(sec, this.tickRate);
  }

  // ------------------------------------------------------------ players

  /** Add a player. During a running mission they drop in next to the squad, and the team gains a life. */
  addPlayer(p: { id: string; name: string; slot: number; hero?: number }): Player {
    const spot = this.respawnSpot();
    const hero = heroOf(p.hero ?? p.slot);
    const player: Player = {
      ...newMover(spot.x - this.players.size * 6, spot.y, P.width, P.height),
      id: p.id,
      name: p.name,
      slot: p.slot,
      hero: hero.id,
      ultKind: hero.ult,
      power: null,
      powerN: 0,
      prevAstra: false,
      hp: P.maxHp,
      state: 'alive',
      respawnAt: 0,
      invulnUntil: this.tick + this.ticks(P.spawnInvulnSec),
      dodgeUntil: 0,
      lastHurt: -1000,
      weapon: 'blaster',
      nextFireTick: 0,
      input: { ...NEUTRAL_INPUT },
      inputTick: -1,
      prevMelee: false,
      prevUlt: false,
      aimX: 1,
      aimY: 0,
      lastSafeX: spot.x,
      lastSafeY: spot.y,
      viewLag: 0,
      ult: 0,
      lastUltTick: -1000,
      overdriveUntil: 0,
      meleeUntil: 0,
      nextMelee: 0,
      slideHits: new Set(),
      combo: 0,
      comboUntil: 0,
      multiN: 0,
      multiUntil: 0,
      stats: { kills: 0, deaths: 0, bossDamage: 0, score: 0, bestCombo: 0, bestRank: -1, ults: 0 },
    };
    this.players.set(p.id, player);
    this.lives = Math.min(GAME_CONFIG.mission.maxLives, this.lives + GAME_CONFIG.mission.livesPerPlayer);
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (this.phase !== 'ended' && this.players.size === 0) this.finish('failed', 'abandoned', true);
  }

  /**
   * Latest input for a player. Several inputs can arrive within one tick (network jitter): button *presses* are
   * merged so a quick tap of Jump, Dash, Knife or Super is never lost between two ticks.
   */
  setInput(id: string, input: Partial<PlayerInput>): void {
    const p = this.players.get(id);
    if (!p) return;
    const next = sanitizeInput(input);
    if (p.inputTick === this.tick) {
      next.jump ||= p.input.jump;
      next.dash ||= p.input.dash;
      next.melee ||= p.input.melee;
      next.ult ||= p.input.ult;
      next.astra ||= p.input.astra;
    }
    p.input = next;
    p.inputTick = this.tick;
  }

  /** Lag compensation: how many ticks behind the server this player's screen is (clamped). */
  setViewLag(id: string, ticks: number): void {
    const p = this.players.get(id);
    if (!p) return;
    const t = Number.isFinite(ticks) ? Math.round(ticks) : 0;
    p.viewLag = Math.max(0, Math.min(this.maxRewind, t));
  }

  /** Where a (re)spawning or dropping-in soldier appears: beside the friend furthest ahead who is on solid ground. */
  respawnSpot(exclude?: Player): { x: number; y: number } {
    let best: Player | null = null;
    for (const p of this.players.values())
      if (p !== exclude && p.state === 'alive' && p.onGround && (!best || p.x > best.x)) best = p;
    if (!best)
      for (const p of this.players.values())
        if (p !== exclude && p.state === 'alive' && (!best || p.x > best.x)) best = p;
    if (best) return { x: best.lastSafeX, y: best.lastSafeY };
    const cp = this.level.checkpoints[this.checkpoint - 1];
    return cp && this.checkpoint > 0 ? { x: cp.x, y: cp.y } : { ...this.level.start };
  }

  aliveCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.state === 'alive') n++;
    return n;
  }

  // ------------------------------------------------------------ enemies

  private spawnEnemy(id: number, kind: EnemyKind, x: number, y: number): Enemy {
    const c = E[kind];
    const hp = isBoss(kind) ? E[kind].baseHp : E[kind].hp;
    const e: Enemy = {
      id,
      kind,
      body: newMover(x, y, c.width, c.height),
      hp,
      maxHp: hp,
      awake: false,
      nextFire: 0,
      hitTick: -100,
      phase: 1,
      fromBoss: false,
      arena: -1,
      homeX: x,
      homeY: y,
      shield: kind === 'shield' ? E.shield.shieldHp : 0,
      hpMul: 1,
      knockUntil: 0,
      knockVx: 0,
      atk: ATTACK.none,
      atkStart: 0,
      atkParam: 0,
      nextAtk: 0,
      cycle: 0,
      burst: 0,
      aim: Math.PI,
      hist: new Float32Array(HIST * 2),
    };
    e.body.facing = -1;
    this.enemies.set(id, e);
    return e;
  }

  /** A new enemy that joins the fight at once (arena waves, boss reinforcements). */
  private spawnAwake(kind: TrooperKind, x: number, y: number, arena: number, fromBoss = false): Enemy {
    const e = this.spawnEnemy(this.nextEnemyId++, kind, x, y);
    e.arena = arena;
    e.fromBoss = fromBoss;
    this.wake(e);
    e.nextFire = this.tick + this.ticks(1.1) + this.rng.int(this.ticks(0.8));
    return e;
  }

  private updateLimit(): void {
    const b = this.boss;
    this.world.limitX =
      b && b.hp > 0 && this.enemies.has(b.id) ? b.body.x - b.body.w / 2 : levelWidth(this.level);
  }

  private nearestAlive(x: number, y: number, maxDist: number): Player | null {
    let best: Player | null = null;
    let bd = maxDist * maxDist;
    for (const p of this.players.values()) {
      if (p.state !== 'alive') continue;
      const d = (p.x - x) ** 2 + (p.y - P.height / 2 - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private squadSize(): number {
    return Math.max(1, this.players.size);
  }

  private enemyScale(): number {
    return (1 + GAME_CONFIG.mission.enemyHpPerExtraPlayer * (this.squadSize() - 1)) * this.mods.enemyHp;
  }

  private fireEvery(base: number): number {
    const m = GAME_CONFIG.mission;
    const crowd = 1 + m.enemyFireRatePerExtraPlayer * (this.squadSize() - 1);
    return this.ticks(base / (m.enemyFireRate[this.settings.difficulty] * crowd * this.mods.enemyFire));
  }

  private shoot(
    x: number,
    y: number,
    angle: number,
    dmg: number,
    o: {
      speed?: number;
      kind?: BulletKind;
      grav?: number;
      blast?: number;
      size?: number;
      life?: number;
    } = {},
  ): Bullet {
    const speed = o.speed ?? E.bulletSpeed;
    const b: Bullet = {
      id: this.nextBulletId++,
      enemy: true,
      owner: '',
      kind: o.kind ?? 'shot',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg,
      pierce: false,
      expires: this.tick + this.ticks(o.life ?? E.bulletLifetime),
      born: this.tick,
      lag: 0,
      weapon: null,
      power: false,
      hit: null,
      grav: o.grav ?? 0,
      blast: o.blast ?? 0,
      size: o.size ?? 2,
    };
    this.bullets.push(b);
    return b;
  }

  /** Lob a shell/grenade from (x, y) to land at (tx, ty) after `flight` seconds. */
  private lob(
    x: number,
    y: number,
    tx: number,
    ty: number,
    flight: number,
    dmg: number,
    kind: BulletKind,
    blast: number,
  ): void {
    const vx = (tx - x) / flight;
    const vy = (ty - y - 0.5 * SHELL_G * flight * flight) / flight;
    const b = this.shoot(x, y, 0, dmg, { kind, grav: SHELL_G, blast, size: 5, life: flight + 1.5 });
    b.vx = vx;
    b.vy = vy;
  }

  private wake(e: Enemy): void {
    e.awake = true;
    e.nextFire = this.tick + this.fireEvery(0.8) + this.rng.int(this.ticks(0.6));
    if (isBoss(e.kind)) {
      const bc = E[e.kind];
      e.hp = e.maxHp = (bc.baseHp + bc.hpPerPlayer * this.squadSize()) * this.mods.bossHp * e.hpMul;
      e.nextAtk = this.tick + this.ticks(1.4);
      if (e.arena >= 0) this.arenaBossMax[e.arena] = (this.arenaBossMax[e.arena] ?? 0) + e.maxHp;
      this.emit({ e: 'bossWake', kind: e.kind, arena: e.arena });
    } else if (!e.fromBoss) {
      e.hp = e.maxHp = E[e.kind as TrooperKind].hp * this.enemyScale();
    }
  }

  private stepEnemies(): void {
    const wakeD = E.wakeDistance;
    for (const e of this.enemies.values()) {
      const b = e.body;
      if (!e.awake) {
        if (isBoss(e.kind)) continue; // bosses wake when their arena locks down
        if (this.nearestAlive(b.x, b.y - b.h / 2, wakeD)) this.wake(e);
        else continue;
      }
      if (this.tick < e.knockUntil) {
        // Blown back by the wind: no AI while it lasts.
        if (e.kind === 'drone' || e.kind === 'jetpack') b.x += e.knockVx * this.dt;
        else {
          b.vx = e.knockVx;
          b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
          moveBody(this.world, b, this.dt);
        }
        if (b.y > levelHeight(this.level) + 200) this.enemies.delete(e.id);
        continue;
      }
      switch (e.kind) {
        case 'soldier':
        case 'shield':
        case 'grenadier':
          this.stepWalkerTrooper(e);
          break;
        case 'turret':
          this.stepTurret(e);
          break;
        case 'drone':
        case 'jetpack':
          this.stepFlyer(e);
          break;
        case 'walker':
          this.stepWarhound(e);
          break;
        case 'gunship':
          this.stepVulture(e);
          break;
        case 'boss':
          this.stepFortress(e);
          break;
      }
      // Fell into a pit: gone.
      if (b.y > levelHeight(this.level) + 200) this.enemies.delete(e.id);
    }
  }

  /** Soldiers, shield troopers and grenadiers: keep a distance, shoot or lob, never walk off ledges. */
  private stepWalkerTrooper(e: Enemy): void {
    const kind = e.kind as 'soldier' | 'shield' | 'grenadier';
    const c = E[kind];
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      const dx = target.x - b.x;
      // Shield troopers turn slowly: get round them while they turn.
      if (kind !== 'shield' || this.tick >= e.burst) {
        const face: 1 | -1 = dx >= 0 ? 1 : -1;
        if (kind === 'shield' && face !== b.facing) e.burst = this.tick + this.ticks(0.9);
        b.facing = face;
      }
      const dist = Math.abs(dx);
      let dir = 0;
      if (dist > c.keepAway + 50) dir = Math.sign(dx);
      else if (dist < c.keepAway - 60) dir = -Math.sign(dx);
      if (dir !== 0 && groundBelow(this.world, b.x + dir * (b.w / 2 + 4), b.y)) b.vx = dir * c.speed;
      if (this.tick >= e.nextFire && Math.abs(target.y - b.y) < 160) {
        if (kind === 'grenadier') {
          const lead = target.vx * 0.5;
          this.lob(
            b.x,
            b.y - 30,
            target.x + lead,
            target.y - 4,
            0.95,
            E.grenadier.dmg,
            'grenade',
            E.grenadier.blast,
          );
        } else if (Math.sign(dx) === b.facing) {
          const ty = target.y - (target.crouch ? P.crouchHeight : P.height) / 2;
          const ang = Math.atan2(ty - (b.y - 22), dx);
          const clamped =
            b.facing > 0 ? clampAngle(ang, -0.5, 0.5) : clampAngle(ang, Math.PI - 0.5, Math.PI + 0.5);
          this.shoot(b.x + b.facing * 14, b.y - 22, clamped, c.dmg);
        }
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  private stepTurret(e: Enemy): void {
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h, E.turret.sight);
    if (!target) return;
    b.facing = target.x >= b.x ? 1 : -1;
    e.aim = Math.atan2(target.y - P.height / 2 - (b.y - b.h), target.x - b.x);
    if (this.tick >= e.nextFire) {
      this.shoot(b.x + Math.cos(e.aim) * 18, b.y - b.h + Math.sin(e.aim) * 18, e.aim, E.turret.dmg);
      e.nextFire = this.tick + this.fireEvery(E.turret.fireEvery);
    }
  }

  /** Drones and jetpack troopers: hover above the squad and fire down (jetpacks in three-round bursts). */
  private stepFlyer(e: Enemy): void {
    const jet = e.kind === 'jetpack';
    const c = jet ? E.jetpack : E.drone;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y, c.sight * 1.5);
    const wob = Math.sin((this.tick + e.id * 17) * 0.09) * 26;
    const tx = target ? target.x + Math.sin((this.tick + e.id * 31) * 0.03) * (jet ? 140 : 90) : e.homeX;
    const ty = target ? target.y - c.hover + wob : e.homeY;
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(c.speed, d * 3);
    b.x += (dx / d) * sp * this.dt;
    b.y += (dy / d) * sp * this.dt;
    b.y = Math.max(40, b.y);
    b.facing = (target ? target.x - b.x : dx) >= 0 ? 1 : -1;
    if (!target) return;
    const shotY = jet ? b.y - 16 : b.y + 6;
    if (e.burst > 0 && this.tick >= e.nextFire) {
      const ang = Math.atan2(target.y - P.height / 2 - shotY, target.x - b.x);
      this.shoot(b.x, shotY, ang, c.dmg, { speed: E.bulletSpeed * 1.1 });
      e.burst--;
      e.nextFire = this.tick + (e.burst > 0 ? this.ticks(0.13) : this.fireEvery(c.fireEvery));
    } else if (this.tick >= e.nextFire) {
      if (jet) e.burst = 3;
      else {
        const ang = Math.atan2(target.y - P.height / 2 - b.y, target.x - b.x);
        this.shoot(b.x, b.y + 6, ang, c.dmg, { speed: E.bulletSpeed * 0.9 });
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
      }
    }
  }

  // ------------------------------------------------------------ bosses

  private arenaOf(e: Enemy): ArenaDef | null {
    return this.level.arenas[e.arena] ?? null;
  }

  private startAttack(e: Enemy, atk: AttackId, param = 0): void {
    e.atk = atk;
    e.atkStart = this.tick;
    e.atkParam = param;
    e.burst = 0;
  }

  private endAttack(e: Enemy, idleSec: number): void {
    e.atk = ATTACK.none;
    e.nextAtk = this.tick + this.ticks(idleSec / this.mods.bossTempo);
  }

  private bossPhase(e: Enemy, p2: number, p3 = -1): void {
    const frac = e.hp / e.maxHp;
    const phase = frac < p3 ? 3 : frac < p2 ? 2 : 1;
    if (phase > e.phase) {
      e.phase = phase;
      this.emit({ e: 'bossPhase', kind: e.kind as BossKind, phase });
    }
  }

  private attackT(e: Enemy): number {
    return this.tick - e.atkStart;
  }

  /** WARHOUND: walks toward the squad, then cannon / machine gun / charge / stomp. */
  private stepWarhound(e: Enemy): void {
    const c = E.walker;
    const b = e.body;
    const arena = this.arenaOf(e);
    const minX = (arena?.left ?? 0) + b.w / 2;
    const maxX = (arena?.right ?? levelWidth(this.level)) - b.w / 2;
    this.bossPhase(e, c.phase2);
    const target = this.nearestAlive(b.x, b.y - b.h / 2, 1400);
    const ph2 = e.phase >= 2;
    b.vx = 0;
    if (e.atk === ATTACK.none) {
      if (target) {
        const dx = target.x - b.x;
        b.facing = dx >= 0 ? 1 : -1;
        e.aim = Math.atan2(target.y - 20 - (b.y - 78), dx);
        if (Math.abs(dx) > 260) b.vx = Math.sign(dx) * c.speed * (ph2 ? 1.4 : 1);
        else if (Math.abs(dx) < 140) b.vx = -Math.sign(dx) * c.speed;
      }
      if (this.tick >= e.nextAtk && target) {
        const cycle: AttackId[] = ph2
          ? [
              ATTACK.charge,
              ATTACK.stomp,
              ATTACK.cannon,
              ATTACK.mg,
              ATTACK.stomp,
              ATTACK.charge,
              ATTACK.cannon,
            ]
          : [ATTACK.cannon, ATTACK.mg, ATTACK.charge, ATTACK.stomp];
        const atk = cycle[e.cycle % cycle.length] as AttackId;
        e.cycle++;
        this.startAttack(e, atk, ph2 && atk === ATTACK.stomp ? 2 : 1);
      }
    } else {
      const t = this.attackT(e);
      const wind = this.ticks(ATTACK_WINDUP[e.atk] as number);
      switch (e.atk) {
        case ATTACK.cannon: {
          const shots = ph2 ? 4 : 3;
          const gap = this.ticks(0.28);
          if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < shots && target) {
            const k = (t - wind) / gap;
            const mx = b.x + b.facing * 54;
            const my = b.y - 92;
            const spread = (k - (shots - 1) / 2) * 70;
            this.lob(
              mx,
              my,
              target.x + spread + target.vx * 0.4,
              target.y - 4,
              1.05,
              c.shellDmg,
              'shell',
              52,
            );
          }
          if (t >= wind + gap * shots + this.ticks(0.3)) this.endAttack(e, ph2 ? 0.6 : 1.0);
          break;
        }
        case ATTACK.mg: {
          const n = ph2 ? 14 : 10;
          const gap = this.ticks(0.1);
          if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < n && target) {
            const k = (t - wind) / gap;
            const base = Math.atan2(target.y - 16 - (b.y - 60), target.x - b.x);
            e.aim = base + Math.sin(k * 0.7) * 0.12;
            this.shoot(b.x + b.facing * 60, b.y - 60, e.aim, c.mgDmg, { speed: 330 });
          }
          if (t >= wind + gap * n + this.ticks(0.2)) this.endAttack(e, ph2 ? 0.6 : 1.0);
          break;
        }
        case ATTACK.charge: {
          if (t >= wind) {
            b.vx = b.facing * c.chargeSpeed * (ph2 ? 1.15 : 1);
            const hitWall = (b.facing > 0 && b.x >= maxX - 2) || (b.facing < 0 && b.x <= minX + 2);
            if (hitWall || t > wind + this.ticks(2.2)) {
              this.emit({ e: 'boom', x: r1(b.x + b.facing * b.w * 0.5), y: r1(b.y - 30), r: 40 });
              this.endAttack(e, ph2 ? 0.7 : 1.1); // dazed after hitting the wall
            }
          }
          break;
        }
        case ATTACK.stomp: {
          if (t === wind && b.onGround) b.vy = -760;
          if (t > wind + 2 && b.onGround) {
            const sp = ph2 ? 400 : 340;
            for (const dir of [-1, 1]) {
              const w = this.shoot(b.x + dir * (b.w / 2 - 6), b.y - 12, dir > 0 ? 0 : Math.PI, c.waveDmg, {
                kind: 'wave',
                speed: sp,
                size: 12,
                life: 2.4,
              });
              w.vy = 0;
            }
            this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y), r: 60 });
            if (e.atkParam > 1) this.startAttack(e, ATTACK.stomp, e.atkParam - 1);
            else this.endAttack(e, ph2 ? 0.6 : 1.1);
          }
          break;
        }
        default:
          this.endAttack(e, 1);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    b.dropTicks = 2; // too heavy for one-way platforms: it stays on the floor
    moveBody(this.world, b, this.dt);
    b.x = Math.max(minX, Math.min(maxX, b.x));
  }

  /** VULTURE: hovers over the squad; strafes, carpet-bombs, fires slow missiles and drops jetpack troopers. */
  private stepVulture(e: Enemy): void {
    const c = E.gunship;
    const b = e.body;
    const arena = this.arenaOf(e);
    const minX = (arena?.left ?? 0) + 140;
    const maxX = (arena?.right ?? levelWidth(this.level)) - 100;
    this.bossPhase(e, c.phase2);
    const ph2 = e.phase >= 2;
    const target = this.nearestAlive(b.x, b.y, 1600);
    const hoverY = c.hoverY + (ph2 ? 30 : 0) + Math.sin(this.tick * 0.06) * 14;
    let tx = target ? target.x + Math.sin(this.tick * 0.017) * 160 : b.x;
    let speed = c.speed * (ph2 ? 1.3 : 1);
    if (e.atk === ATTACK.bombs && this.attackT(e) >= this.ticks(ATTACK_WINDUP[ATTACK.bombs] as number)) {
      tx = e.atkParam > 0 ? maxX : minX; // bombing run across the arena
      speed = 270;
    }
    tx = Math.max(minX, Math.min(maxX, tx));
    const dx = tx - b.x;
    b.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * this.dt);
    b.y += (hoverY - b.y) * Math.min(1, this.dt * 3);
    b.vx = Math.abs(dx) > 1 ? Math.sign(dx) * speed : 0;
    if (target && e.atk !== ATTACK.bombs) b.facing = target.x >= b.x ? 1 : -1;
    if (target) e.aim = Math.atan2(target.y - 16 - (b.y + 10), target.x - b.x);

    if (e.atk === ATTACK.none) {
      if (this.tick >= e.nextAtk && target) {
        const cycle: AttackId[] = ph2
          ? [ATTACK.bombs, ATTACK.missiles, ATTACK.strafe, ATTACK.troops, ATTACK.bombs, ATTACK.missiles]
          : [ATTACK.strafe, ATTACK.bombs, ATTACK.missiles, ATTACK.troops];
        const atk = cycle[e.cycle % cycle.length] as AttackId;
        e.cycle++;
        // Bombing runs go toward the far side of the arena.
        this.startAttack(e, atk, atk === ATTACK.bombs ? (b.x < (minX + maxX) / 2 ? 1 : 0) : 0);
      }
      return;
    }
    const t = this.attackT(e);
    const wind = this.ticks(ATTACK_WINDUP[e.atk] as number);
    switch (e.atk) {
      case ATTACK.strafe: {
        const n = ph2 ? 10 : 8;
        const gap = this.ticks(0.14);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < n && target)
          this.shoot(b.x + b.facing * 70, b.y + 12, e.aim, c.shotDmg, { speed: 320 });
        if (t >= wind + gap * n) this.endAttack(e, ph2 ? 0.7 : 1.1);
        break;
      }
      case ATTACK.bombs: {
        const gap = this.ticks(ph2 ? 0.18 : 0.24);
        if (t >= wind && (t - wind) % gap === 0) {
          const bomb = this.shoot(b.x, b.y + 26, Math.PI / 2, c.bombDmg, {
            kind: 'bomb',
            speed: 60,
            grav: 700,
            blast: 60,
            size: 6,
            life: 3,
          });
          bomb.vx = b.vx * 0.25;
        }
        const arrived = Math.abs((e.atkParam > 0 ? maxX : minX) - b.x) < 4;
        if (t >= wind && (arrived || t > wind + this.ticks(3))) this.endAttack(e, ph2 ? 0.7 : 1.2);
        break;
      }
      case ATTACK.missiles: {
        const n = ph2 ? 4 : 3;
        const gap = this.ticks(0.3);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < n && target) {
          const k = (t - wind) / gap;
          this.shoot(b.x - 30 + k * 20, b.y + 20, e.aim + (k - (n - 1) / 2) * 0.35, c.missileDmg, {
            kind: 'missile',
            speed: 200,
            size: 6,
            life: 4.5,
          });
        }
        if (t >= wind + gap * n + this.ticks(0.4)) this.endAttack(e, ph2 ? 0.8 : 1.2);
        break;
      }
      case ATTACK.troops: {
        if (t === wind) {
          let n = 0;
          for (const x of this.enemies.values()) if (x.fromBoss) n++;
          for (let i = 0; i < Math.min(2, 4 - n); i++)
            this.spawnAwake('jetpack', b.x - 30 + i * 60, b.y + 30, e.arena, true);
        }
        if (t >= wind + this.ticks(0.5)) this.endAttack(e, 1.0);
        break;
      }
      default:
        this.endAttack(e, 1);
    }
  }

  /** IRON FORTRESS: cannon volleys and a laser beam (jump the low one, duck the high one); slams and drones later. */
  private stepFortress(e: Enemy): void {
    const bc = E.boss;
    const b = e.body;
    this.bossPhase(e, bc.phase2, bc.phase3);
    const target = this.nearestAlive(b.x, b.y - b.h / 2, 1600);
    if (target) e.aim = Math.atan2(target.y - P.height / 2 - (b.y - 120), target.x - (b.x - b.w / 2));
    const ph = e.phase;
    if (ph >= 2 && this.tick % this.ticks(bc.droneEvery) === 0) {
      let drones = 0;
      for (const x of this.enemies.values()) if (x.fromBoss) drones++;
      if (drones < bc.maxDrones) this.spawnAwake('drone', b.x - 40, b.y - b.h - 20, e.arena, true);
    }
    if (e.atk === ATTACK.none) {
      if (this.tick >= e.nextAtk && target) {
        const cycle: AttackId[] =
          ph === 1
            ? [ATTACK.volley, ATTACK.beamLow, ATTACK.volley, ATTACK.beamHigh]
            : ph === 2
              ? [ATTACK.volley, ATTACK.slam, ATTACK.beamLow, ATTACK.beamHigh, ATTACK.volley, ATTACK.slam]
              : [ATTACK.beamLow, ATTACK.slam, ATTACK.volley, ATTACK.beamHigh, ATTACK.slam, ATTACK.volley];
        const atk = cycle[e.cycle % cycle.length] as AttackId;
        e.cycle++;
        this.startAttack(e, atk, ph);
      }
      return;
    }
    const t = this.attackT(e);
    const wind = this.ticks(ATTACK_WINDUP[e.atk] as number);
    const idle = ph === 3 ? 0.5 : ph === 2 ? 0.8 : 1.1;
    switch (e.atk) {
      case ATTACK.volley: {
        const reps = ph === 3 ? 3 : 2;
        const gap = this.ticks(0.45);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < reps && target) {
          const k = (t - wind) / gap;
          const cy = k % 2 === 0 ? b.y - 170 : b.y - 70;
          const cx = b.x - b.w / 2 - 6;
          const ang = Math.atan2(target.y - P.height / 2 - cy, target.x - cx);
          const n = ph === 1 ? 3 : 5;
          for (let i = 0; i < n; i++) this.shoot(cx, cy, ang + (i - (n - 1) / 2) * 0.2, bc.shotDmg);
        }
        if (t >= wind + gap * reps) this.endAttack(e, idle);
        break;
      }
      case ATTACK.beamLow:
      case ATTACK.beamHigh: {
        const active = t >= wind && t < wind + this.ticks(BEAM_SEC);
        if (active) this.beamDamage(e, e.atk === ATTACK.beamLow ? BEAM.lowY : BEAM.highY);
        if (t >= wind + this.ticks(BEAM_SEC)) {
          // Phase 3: a low beam is chased at once by a high one.
          if (ph === 3 && e.atk === ATTACK.beamLow && e.atkParam === 3) {
            this.startAttack(e, ATTACK.beamHigh, 0);
            e.atkStart -= this.ticks(0.45); // shorter warning for the follow-up
          } else this.endAttack(e, idle);
        }
        break;
      }
      case ATTACK.slam: {
        const waves = ph === 3 ? 2 : 1;
        const gap = this.ticks(0.5);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < waves) {
          const w = this.shoot(b.x - b.w / 2 - 4, b.y - 12, Math.PI, bc.waveDmg, {
            kind: 'wave',
            speed: 360,
            size: 12,
            life: 3,
          });
          w.vy = 0;
          this.emit({ e: 'boom', x: r1(b.x - b.w / 2), y: r1(b.y), r: 50 });
        }
        if (t >= wind + gap * waves) this.endAttack(e, idle);
        break;
      }
      default:
        this.endAttack(e, 1);
    }
  }

  /** Beam across the arena floor at `height` px above it. */
  private beamDamage(e: Enemy, height: number): void {
    const arena = this.arenaOf(e);
    const floor = arena?.floor ?? e.body.y;
    const y0 = floor - height - BEAM.half;
    const y1 = floor - height + BEAM.half;
    const x0 = arena?.left ?? 0;
    const x1 = e.body.x - e.body.w / 2;
    for (const p of this.players.values()) {
      if (p.state !== 'alive' || p.x < x0 || p.x > x1) continue;
      const top = p.y - (p.crouch ? P.crouchHeight : P.height);
      if (p.y > y0 && top < y1) this.hurtPlayer(p, E.boss.beamDmg);
    }
  }

  private recordHistory(): void {
    const slot = (this.tick % HIST) * 2;
    for (const e of this.enemies.values()) {
      if (!e.awake) continue;
      e.hist[slot] = e.body.x;
      e.hist[slot + 1] = e.body.y;
    }
  }

  /** Where an enemy was `lag` ticks ago (falls back to now when that is not recorded). */
  enemyPastPosition(e: Enemy, lag: number): { x: number; y: number } {
    if (lag <= 0 || e.kind === 'turret' || e.kind === 'boss') return { x: e.body.x, y: e.body.y };
    const t = this.tick - lag;
    if (t < 0) return { x: e.body.x, y: e.body.y };
    const slot = (t % HIST) * 2;
    const x = e.hist[slot] as number;
    const y = e.hist[slot + 1] as number;
    // Unrecorded slot (enemy woke up recently): use the current position.
    if (x === 0 && y === 0) return { x: e.body.x, y: e.body.y };
    return { x, y };
  }

  // ------------------------------------------------------------ main step

  step(): void {
    if (this.phase === 'ended') return;
    this.tick++;
    if (this.phase === 'countdown') {
      if (this.tick >= this.countdownEnd) {
        this.phase = 'playing';
        this.emit({ e: 'start' });
      }
      return;
    }
    this.stepPlayers();
    this.stepArenas();
    this.stepEnemies();
    this.stepPowers();
    this.recordHistory();
    this.stepBullets();
    this.stepContact();
    this.stepPickups();
    this.stepCheckpoints();
    this.stepDead();
    this.updateLimit();
    this.checkEnd();
  }

  private stepPlayers(): void {
    const fallY = levelHeight(this.level) + P.pitMargin;
    for (const p of this.players.values()) {
      if (p.state === 'dead') {
        // KO'd bodies still fall to the ground.
        p.vx = 0;
        p.vy = Math.min(P.maxFallSpeed, p.vy + P.gravity * this.dt);
        moveBody(this.world, p, this.dt);
        if (p.y > fallY) this.toSafeGround(p);
        continue;
      }
      const wasSliding = p.slideTicks > 0;
      const wasDashing = p.dashTicks > 0;
      stepPlayerMovement(this.world, p, p.input, this.dt);
      if (!wasDashing && p.dashTicks > 0)
        p.dodgeUntil = this.tick + p.dashTicks + this.ticks(P.dash.iframeSec);
      if (!wasSliding || p.slideTicks === 0) p.slideHits.clear();
      const aim = aimOf(p, p.input);
      p.aimX = aim.ax;
      p.aimY = aim.ay;
      if (
        p.onGround &&
        groundBelow(this.world, p.x - p.w / 2, p.y) &&
        groundBelow(this.world, p.x + p.w / 2, p.y)
      ) {
        p.lastSafeX = p.x;
        p.lastSafeY = p.y;
      }
      if (p.y > fallY) {
        // Fell into a pit: lose some health and come back on the last safe ground.
        this.toSafeGround(p);
        p.hp -= P.pitDamage;
        p.lastHurt = this.tick;
        p.invulnUntil = this.tick + this.ticks(1);
        this.breakCombo(p);
        if (p.hp <= 0) this.koPlayer(p);
        else this.emit({ e: 'hurt', id: p.id, dmg: P.pitDamage });
        continue;
      }
      // Health refills out of combat.
      if (p.hp < P.maxHp && this.tick - p.lastHurt >= this.ticks(P.regenDelaySec))
        p.hp = Math.min(P.maxHp, p.hp + P.regenPerSec * this.dt);
      if (p.combo > 0 && this.tick > p.comboUntil) p.combo = 0;
      if (p.slideTicks > 0) this.slideHits(p);

      const meleePressed = p.input.melee && !p.prevMelee;
      p.prevMelee = p.input.melee;
      const ultPressed = p.input.ult && !p.prevUlt;
      p.prevUlt = p.input.ult;
      if (ultPressed && p.ult >= U.max) this.unleash(p);
      const astraPressed = p.input.astra === true && !p.prevAstra;
      p.prevAstra = p.input.astra === true;
      if (astraPressed) this.useAstra(p);
      const canMelee = this.tick >= p.nextMelee && p.dashTicks === 0;
      if (canMelee && (meleePressed || (p.input.fire && this.enemyInReach(p)))) this.melee(p);
      else if (p.input.fire && this.tick >= p.nextFireTick && this.tick >= p.meleeUntil) this.fire(p);
    }
  }

  private toSafeGround(p: Player): void {
    p.x = p.lastSafeX;
    p.y = p.lastSafeY;
    p.vx = p.vy = 0;
    p.dashTicks = p.slideTicks = 0;
  }

  private dodging(p: Player): boolean {
    return p.dashTicks > 0 || this.tick < p.dodgeUntil;
  }

  private overdrive(p: Player): boolean {
    return this.tick < p.overdriveUntil;
  }

  private fire(p: Player): void {
    const w = GAME_CONFIG.weapons[p.weapon];
    const od = this.overdrive(p);
    const cd = od ? w.cooldown / U.overdrive.fireRate : w.cooldown;
    p.nextFireTick = this.tick + Math.max(1, this.ticks(cd));
    const base = Math.atan2(p.aimY, p.aimX);
    const crouch = p.crouch && p.aimY === 0;
    const mx = p.x + (p.aimY === 0 ? p.facing * 16 : p.aimX * 10);
    const my = p.y - (crouch ? 12 : p.aimY < 0 ? P.height + 2 : p.aimY > 0 ? 8 : 22);
    const dmg = w.damage * (od ? U.overdrive.damage : 1);
    for (let i = 0; i < w.pellets; i++) {
      const a = w.pellets === 1 ? base : base + (i / (w.pellets - 1) - 0.5) * w.spreadRad;
      const pierce = w.pierce || od;
      this.bullets.push({
        id: this.nextBulletId++,
        enemy: false,
        owner: p.id,
        kind: 'shot',
        x: mx,
        y: my,
        vx: Math.cos(a) * w.speed,
        vy: Math.sin(a) * w.speed,
        dmg,
        pierce,
        expires: this.tick + this.ticks(w.lifetime),
        born: this.tick,
        lag: p.viewLag,
        weapon: p.weapon,
        power: od,
        hit: pierce ? new Set() : null,
        grav: 0,
        blast: 0,
        size: 0,
      });
    }
  }

  // ------------------------------------------------------------ melee, slide, ultimate

  private meleeBox(p: Player, range: number): { x0: number; x1: number; y0: number; y1: number } {
    const front = p.x + p.facing * range;
    const back = p.x - p.facing * 8;
    return {
      x0: Math.min(front, back),
      x1: Math.max(front, back),
      y0: p.y - P.melee.height,
      y1: p.y + 4,
    };
  }

  private overlapsEnemy(box: { x0: number; x1: number; y0: number; y1: number }, e: Enemy): boolean {
    const b = e.body;
    return box.x1 > b.x - b.w / 2 && box.x0 < b.x + b.w / 2 && box.y1 > b.y - b.h && box.y0 < b.y;
  }

  private enemyInReach(p: Player): boolean {
    const box = this.meleeBox(p, P.melee.autoRange);
    for (const e of this.enemies.values())
      if (e.awake && e.kind !== 'gunship' && this.overlapsEnemy(box, e)) return true;
    return false;
  }

  private melee(p: Player): void {
    const m = P.melee;
    p.meleeUntil = this.tick + this.ticks(m.animSec);
    p.nextMelee = this.tick + this.ticks(m.cooldownSec);
    p.nextFireTick = Math.max(p.nextFireTick, p.meleeUntil);
    const box = this.meleeBox(p, m.range);
    const dmg = m.damage * (this.overdrive(p) ? U.overdrive.damage : 1);
    for (const e of [...this.enemies.values()]) {
      if (!e.awake || !this.overlapsEnemy(box, e)) continue;
      if (e.shield > 0 && this.facesToward(e, p.x)) {
        // A knife to the shield breaks it fast.
        e.shield -= dmg * 2;
        e.hitTick = this.tick;
        this.addCombo(p, C.meleeHit);
        if (e.shield <= 0) {
          e.shield = 0;
          this.emit({ e: 'style', id: p.id, t: 'shield', x: r1(e.body.x), y: r1(e.body.y - 40) });
        } else this.emit({ e: 'ehit', id: e.id, x: r1(e.body.x), y: r1(e.body.y - 20) });
        continue;
      }
      this.damageEnemy(e, dmg, p.id, e.body.x, e.body.y - e.body.h / 2, 'melee');
    }
    // Parry: a swing knocks enemy bullets, grenades and missiles out of the air.
    let parried = false;
    this.bullets = this.bullets.filter((b) => {
      if (!b.enemy || b.kind === 'wave') return true;
      if (b.x < box.x0 - 6 || b.x > box.x1 + 6 || b.y < box.y0 - 6 || b.y > box.y1) return true;
      parried = true;
      return false;
    });
    if (parried) {
      this.addCombo(p, C.parry);
      this.gainUlt(p, 3);
      this.emit({ e: 'style', id: p.id, t: 'parry', x: r1(p.x + p.facing * 24), y: r1(p.y - 24) });
    }
  }

  private facesToward(e: Enemy, x: number): boolean {
    return (x - e.body.x) * e.body.facing > 0;
  }

  private slideHits(p: Player): void {
    const box = { x0: p.x - p.w / 2 - 4, x1: p.x + p.w / 2 + 4, y0: p.y - P.crouchHeight, y1: p.y };
    for (const e of [...this.enemies.values()]) {
      if (!e.awake || isBoss(e.kind) || p.slideHits.has(e.id) || !this.overlapsEnemy(box, e)) continue;
      p.slideHits.add(e.id);
      if (e.shield > 0) e.shield = 0; // knocked off their feet: the shield drops
      this.damageEnemy(e, P.slide.damage, p.id, e.body.x, e.body.y - 10, 'slide');
    }
  }

  private gainUlt(p: Player, n: number): void {
    if (p.state !== 'alive') return;
    p.ult = Math.min(U.max, p.ult + n);
  }

  /** Hero super move. */
  private unleash(p: Player): void {
    p.ult = 0;
    p.stats.ults++;
    p.invulnUntil = Math.max(p.invulnUntil, this.tick + this.ticks(U.invulnSec));
    let sync = false;
    for (const q of this.players.values())
      if (q !== p && this.tick - q.lastUltTick <= this.ticks(U.syncWindowSec)) sync = true;
    p.lastUltTick = this.tick;
    const mult = sync ? 1 + U.syncBonus : 1;
    const cx = p.x;
    const cy = p.y - P.height / 2;
    const ev: Extract<SimEvent, { e: 'ult' }> = {
      e: 'ult',
      id: p.id,
      kind: p.ultKind,
      x: r1(p.x),
      y: r1(p.y),
      f: p.facing,
      sync,
    };
    switch (p.ultKind) {
      case 'overdrive':
        p.overdriveUntil = this.tick + this.ticks(U.overdrive.sec * (sync ? 1.3 : 1));
        break;
      case 'nova': {
        const r = U.nova.radius;
        for (const e of [...this.enemies.values()]) {
          if (!e.awake) continue;
          const ex = Math.max(e.body.x - e.body.w / 2, Math.min(cx, e.body.x + e.body.w / 2));
          const ey = Math.max(e.body.y - e.body.h, Math.min(cy, e.body.y));
          if ((ex - cx) ** 2 + (ey - cy) ** 2 > r * r) continue;
          e.shield = 0;
          this.damageEnemy(e, this.ultDamage(e, U.nova.damage * mult), p.id, ex, ey, 'ult');
        }
        const cr = U.nova.clearRadius ** 2;
        this.bullets = this.bullets.filter((b) => !b.enemy || (b.x - cx) ** 2 + (b.y - cy) ** 2 > cr);
        break;
      }
      case 'airstrike': {
        const a = U.airstrike;
        for (let i = 0; i < a.rockets; i++) {
          const x = p.x + p.facing * (-60 + (i / (a.rockets - 1)) * a.spread) + (this.rng.next() - 0.5) * 30;
          this.bullets.push({
            id: this.nextBulletId++,
            enemy: false,
            owner: p.id,
            kind: 'rocket',
            x,
            y: -30 - i * 46,
            vx: p.facing * 40,
            vy: 760,
            dmg: a.damage * mult,
            pierce: false,
            expires: this.tick + this.ticks(3),
            born: this.tick,
            lag: 0,
            weapon: null,
            power: true,
            hit: null,
            grav: 0,
            blast: a.blast,
            size: 4,
          });
        }
        break;
      }
      case 'phantom': {
        const ph = U.phantom;
        const list = [...this.enemies.values()]
          .filter((e) => e.awake && Math.abs(e.body.x - p.x) < ph.range && Math.abs(e.body.y - p.y) < 420)
          .sort((a, b) => Math.abs(a.body.x - p.x) - Math.abs(b.body.x - p.x))
          .slice(0, ph.targets);
        const hits: number[] = [];
        for (const e of list) {
          const ex = e.body.x;
          const ey = e.body.y - e.body.h / 2;
          hits.push(r1(ex), r1(ey));
          e.shield = 0;
          this.damageEnemy(e, this.ultDamage(e, ph.damage * mult), p.id, ex, ey, 'ult');
        }
        ev.hits = hits;
        break;
      }
    }
    this.emit(ev);
  }

  private ultDamage(e: Enemy, dmg: number): number {
    return isBoss(e.kind) ? dmg * U.bossFactor : dmg;
  }

  // ------------------------------------------------------------ powers (astras) and the team brahmastra

  /** The ASTRA button: use the held power, or (with none) the team brahmastra once it is charged. */
  private useAstra(p: Player): void {
    const PW = GAME_CONFIG.powers;
    if (p.power && p.powerN > 0) {
      const kind = p.power;
      p.powerN--;
      if (p.powerN === 0) p.power = null;
      const f = p.facing;
      const fy = p.y;
      this.emit({ e: 'astra', id: p.id, kind, x: r1(p.x), y: r1(fy), f });
      switch (kind) {
        case 'agni': {
          // A rolling wall of flame, then the ground ahead keeps burning.
          const a = PW.agni;
          this.bullets.push({
            id: this.nextBulletId++,
            enemy: false,
            owner: p.id,
            kind: 'flame',
            x: p.x + f * 20,
            y: fy - 22,
            vx: f * a.waveSpeed,
            vy: 0,
            dmg: a.waveDamage,
            pierce: true,
            expires: this.tick + this.ticks(a.waveSec),
            born: this.tick,
            lag: 0,
            weapon: null,
            power: true,
            hit: new Set(),
            grav: 0,
            blast: 0,
            size: 16,
          });
          const x0 = p.x + f * 30;
          const x1 = p.x + f * (30 + a.burnLength);
          this.burns.push({
            x0: Math.min(x0, x1),
            x1: Math.max(x0, x1),
            y: fy,
            until: this.tick + this.ticks(a.burnSec),
            owner: p.id,
          });
          break;
        }
        case 'varuna': {
          // Rain over the way ahead: fire walls go out, burning ground cools, foes caught in it are hurt.
          const v = PW.varuna;
          const lo = f > 0 ? p.x - v.back : p.x - v.range;
          const hi = f > 0 ? p.x + v.range : p.x + v.back;
          for (const g of this.level.gates)
            if (g.fire && !this.gateOpen[g.id] && g.col * T + T / 2 >= lo && g.col * T + T / 2 <= hi) {
              this.gateOpen[g.id] = true;
              this.emit({ e: 'gate', id: g.id });
            }
          for (const e of [...this.enemies.values()])
            if (e.awake && e.body.x >= lo && e.body.x <= hi)
              this.damageEnemy(
                e,
                this.ultDamage(e, v.damage),
                p.id,
                e.body.x,
                e.body.y - e.body.h / 2,
                'astra',
              );
          break;
        }
        case 'vayu': {
          // A gust: foes ahead are blown away (riot shields torn off), their shots scattered.
          const w = PW.vayu;
          const inGust = (x: number, y: number): boolean =>
            (x - p.x) * f > -20 && Math.abs(x - p.x) < w.range && Math.abs(y - (fy - 24)) < w.height;
          for (const e of [...this.enemies.values()]) {
            if (!e.awake || isBoss(e.kind) || !inGust(e.body.x, e.body.y - e.body.h / 2)) continue;
            e.shield = 0;
            e.knockUntil = this.tick + this.ticks(w.pushSec);
            e.knockVx = f * w.push;
            if (e.body.onGround) e.body.vy = -260;
            this.damageEnemy(e, w.damage, p.id, e.body.x, e.body.y - e.body.h / 2, 'astra');
          }
          this.bullets = this.bullets.filter((b) => !b.enemy || !inGust(b.x, b.y));
          break;
        }
        case 'singularity': {
          const g = PW.singularity;
          this.holes.push({
            x: Math.max(16, Math.min(levelWidth(this.level) - 16, p.x + f * g.ahead)),
            y: fy - g.lift,
            born: this.tick,
            until: this.tick + this.ticks(g.sec),
            owner: p.id,
          });
          break;
        }
      }
      return;
    }
    if (this.brahma >= PW.brahma.max && !this.brahmaStrike) {
      this.brahma = 0;
      this.brahmaStrike = { at: this.tick + this.ticks(PW.brahma.windupSec), id: p.id, x: p.x, y: p.y };
      // The whole squad is shielded through the strike.
      for (const q of this.players.values())
        if (q.state === 'alive')
          q.invulnUntil = Math.max(
            q.invulnUntil,
            this.tick + this.ticks(PW.brahma.windupSec + PW.brahma.shieldSec),
          );
      this.emit({ e: 'brahma', id: p.id, x: r1(p.x), y: r1(p.y), phase: 0 });
    }
  }

  private chargeBrahma(n: number): void {
    if (this.brahmaStrike) return;
    this.brahma = Math.min(GAME_CONFIG.powers.brahma.max, this.brahma + n);
  }

  /** Burning ground, black holes and the brahmastra strike, once per tick. */
  private stepPowers(): void {
    const PW = GAME_CONFIG.powers;
    if (this.burns.length) {
      this.burns = this.burns.filter((f) => f.until > this.tick);
      const dmg = PW.agni.burnDps * this.dt;
      for (const f of this.burns)
        for (const e of [...this.enemies.values()]) {
          if (!e.awake || e.kind === 'drone' || e.kind === 'jetpack') continue;
          const b = e.body;
          if (b.x + b.w / 2 < f.x0 || b.x - b.w / 2 > f.x1 || Math.abs(b.y - f.y) > 40) continue;
          this.damageEnemy(e, this.ultDamage(e, dmg), f.owner, b.x, b.y - 10, 'astra');
        }
    }
    if (this.holes.length) {
      const g = PW.singularity;
      for (const h of this.holes) {
        for (const e of [...this.enemies.values()]) {
          if (!e.awake) continue;
          const b = e.body;
          const ey = b.y - b.h / 2;
          const d = Math.hypot(b.x - h.x, ey - h.y);
          if (d > g.radius) continue;
          const boss = isBoss(e.kind);
          if (!boss) {
            // Pulled in: harder the closer it gets (linear falloff, contained radius).
            const pull = g.pull * (0.35 + 0.65 * (1 - d / g.radius)) * this.dt;
            const k = Math.min(1, pull / Math.max(1, d));
            const flyer = e.kind === 'drone' || e.kind === 'jetpack';
            if (flyer) {
              b.x += (h.x - b.x) * k;
              b.y += (h.y - ey) * k;
            } else if (e.kind !== 'turret') {
              const vy = b.vy;
              b.vx = Math.sign(h.x - b.x) * Math.min(Math.abs(h.x - b.x) / this.dt, g.pull);
              b.vy = 0;
              moveBody(this.world, b, this.dt);
              b.vy = vy;
            }
          }
          const dps = d < g.coreRadius ? g.coreDps : g.dps;
          this.damageEnemy(e, this.ultDamage(e, dps * this.dt), h.owner, b.x, ey, 'astra');
        }
        if (h.until <= this.tick) {
          // Collapse: one last burst.
          this.emit({ e: 'boom', x: r1(h.x), y: r1(h.y), r: g.collapseRadius });
          for (const e of [...this.enemies.values()]) {
            if (!e.awake) continue;
            const d = Math.hypot(e.body.x - h.x, e.body.y - e.body.h / 2 - h.y);
            if (d <= g.collapseRadius)
              this.damageEnemy(e, this.ultDamage(e, g.collapseDamage), h.owner, e.body.x, e.body.y, 'astra');
          }
        }
      }
      this.holes = this.holes.filter((h) => h.until > this.tick);
    }
    const st = this.brahmaStrike;
    if (st && this.tick >= st.at) {
      this.brahmaStrike = null;
      const B = PW.brahma;
      this.emit({ e: 'brahma', id: st.id, x: r1(st.x), y: r1(st.y), phase: 1 });
      for (const e of [...this.enemies.values()]) {
        if (!e.awake || Math.abs(e.body.x - st.x) > B.range) continue;
        e.shield = 0;
        const dmg = isBoss(e.kind) ? e.maxHp * B.bossShare : B.damage;
        this.damageEnemy(e, dmg, st.id, e.body.x, e.body.y - e.body.h / 2, 'astra');
      }
      this.bullets = this.bullets.filter((b) => !b.enemy || Math.abs(b.x - st.x) > B.range);
    }
  }

  /** Fields and black holes bend shots. Returns false when a black hole swallows an enemy shot. */
  private bendBullet(b: Bullet): boolean {
    const f = fieldAt(this.level, b.x, b.y);
    if (f?.kind === 'magnet') {
      // Magnetic storm: shots curve (upward when flying right, downward when flying left).
      const a = -f.power * this.dt * Math.sign(b.vx || 1);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const vx = b.vx * c - b.vy * sn;
      b.vy = b.vx * sn + b.vy * c;
      b.vx = vx;
    } else if (f?.kind === 'well') {
      const cx = (f.x0 + f.x1) / 2;
      const cy = (f.y0 + f.y1) / 2;
      const d = Math.hypot(cx - b.x, cy - b.y) || 1;
      b.vx += ((cx - b.x) / d) * f.power * 6 * this.dt;
      b.vy += ((cy - b.y) / d) * f.power * 6 * this.dt;
    }
    if (b.enemy)
      for (const h of this.holes) {
        const d = Math.hypot(h.x - b.x, h.y - b.y);
        if (d > GAME_CONFIG.powers.singularity.radius) continue;
        if (d < 22) return false;
        const sp = Math.hypot(b.vx, b.vy);
        b.vx += ((h.x - b.x) / d) * sp * 3 * this.dt;
        b.vy += ((h.y - b.y) / d) * sp * 3 * this.dt;
      }
    return true;
  }

  // ------------------------------------------------------------ combo

  private addCombo(p: Player, n: number): void {
    if (this.tick > p.comboUntil) p.combo = 0;
    p.combo += n;
    p.comboUntil = this.tick + this.ticks(C.windowSec);
    if (p.combo > p.stats.bestCombo) p.stats.bestCombo = p.combo;
    const rk = rankOf(p.combo);
    if (rk > p.stats.bestRank) p.stats.bestRank = rk;
  }

  private breakCombo(p: Player): void {
    p.combo = 0;
    p.comboUntil = 0;
  }

  private comboMultiplier(p: Player): number {
    return Math.min(C.maxMultiplier, 1 + Math.floor(p.combo / 10) * 0.1);
  }

  // ------------------------------------------------------------ bullets and damage

  private stepBullets(): void {
    const keep: Bullet[] = [];
    const W = levelWidth(this.level);
    const H = levelHeight(this.level);
    const targets = this.bullets.filter((b) => b.enemy && (b.kind === 'missile' || b.kind === 'grenade'));
    const gone = new Set<Bullet>();
    for (const b of this.bullets) {
      if (gone.has(b)) continue;
      if (this.tick >= b.expires) {
        if (b.blast > 0) this.explode(b);
        continue;
      }
      if (b.kind === 'missile') this.steerMissile(b);
      if (b.grav) b.vy += b.grav * this.dt;
      if (this.level.fields.length || this.holes.length) {
        if (!this.bendBullet(b)) continue; // swallowed by a black hole
      }
      // Sub-step fast bullets so they cannot tunnel through thin enemies or walls.
      const dist = Math.hypot(b.vx, b.vy) * this.dt;
      const steps = Math.max(1, Math.ceil(dist / 12));
      let alive = true;
      for (let s = 0; s < steps && alive; s++) {
        b.x += (b.vx * this.dt) / steps;
        b.y += (b.vy * this.dt) / steps;
        if (b.x < 0 || b.x > W || b.y > H) alive = false;
        else if (b.y < -40 && b.kind !== 'rocket') alive = false;
        else if (solidAtPoint(this.world, b.x, b.y)) {
          alive = false;
          if (b.blast > 0) this.explode(b);
        } else if (b.enemy) alive = this.bulletVsPlayers(b);
        else alive = this.bulletVsEnemies(b) && (b.kind !== 'shot' || this.shootDown(b, targets, gone));
      }
      if (alive) keep.push(b);
    }
    this.bullets = gone.size ? keep.filter((b) => !gone.has(b)) : keep;
  }

  /** Missiles turn gently toward the nearest soldier for their first second and a half. */
  private steerMissile(b: Bullet): void {
    if (this.tick - b.born > this.ticks(1.5)) return;
    const t = this.nearestAlive(b.x, b.y, 900);
    if (!t) return;
    const want = Math.atan2(t.y - P.height / 2 - b.y, t.x - b.x);
    const cur = Math.atan2(b.vy, b.vx);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.max(-1.7 * this.dt, Math.min(1.7 * this.dt, d));
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(cur + turn) * sp;
    b.vy = Math.sin(cur + turn) * sp;
  }

  /** A player shot meets an enemy missile or grenade: both are gone. Returns false when the shot is used up. */
  private shootDown(b: Bullet, targets: Bullet[], gone: Set<Bullet>): boolean {
    for (const m of targets) {
      if (gone.has(m) || Math.abs(b.x - m.x) > 11 || Math.abs(b.y - m.y) > 11) continue;
      gone.add(m);
      const p = this.players.get(b.owner);
      if (p) this.addCombo(p, 1);
      this.emit({ e: 'boom', x: r1(m.x), y: r1(m.y), r: 18 });
      if (!b.pierce) return false;
    }
    return true;
  }

  private explode(b: Bullet): void {
    const r = b.blast;
    this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y), r });
    if (b.enemy) {
      for (const p of this.players.values()) {
        if (p.state !== 'alive') continue;
        const px = p.x;
        const py = Math.max(p.y - P.height, Math.min(b.y, p.y));
        if ((px - b.x) ** 2 + (py - b.y) ** 2 <= (r + p.w / 2) ** 2) this.hurtPlayer(p, b.dmg);
      }
      return;
    }
    for (const e of [...this.enemies.values()]) {
      if (!e.awake) continue;
      const ex = Math.max(e.body.x - e.body.w / 2, Math.min(b.x, e.body.x + e.body.w / 2));
      const ey = Math.max(e.body.y - e.body.h, Math.min(b.y, e.body.y));
      if ((ex - b.x) ** 2 + (ey - b.y) ** 2 > r * r) continue;
      e.shield = 0;
      this.damageEnemy(e, this.ultDamage(e, b.dmg), b.owner, ex, ey, b.kind === 'rocket' ? 'ult' : 'blast');
    }
  }

  /** Returns false when the bullet is used up. */
  private bulletVsEnemies(b: Bullet): boolean {
    for (const e of this.enemies.values()) {
      if (!e.awake || b.hit?.has(e.id)) continue;
      const pos = this.enemyPastPosition(e, b.lag);
      const hw = e.body.w / 2;
      if (b.x < pos.x - hw - b.size || b.x > pos.x + hw + b.size) continue;
      if (b.y < pos.y - e.body.h - b.size || b.y > pos.y + b.size) continue;
      if (b.blast > 0) {
        this.explode(b);
        return false;
      }
      // Riot shield: shots from the front bounce off it (and chip it a little).
      if (e.shield > 0 && b.vx * e.body.facing < 0 && Math.abs(b.vx) > Math.abs(b.vy)) {
        e.shield -= b.dmg * 0.2;
        if (e.shield <= 0) e.shield = 0;
        e.hitTick = this.tick;
        this.emit({ e: 'ehit', id: e.id, x: r1(b.x), y: r1(b.y) });
        return false;
      }
      const dmg = b.power && isBoss(e.kind) ? b.dmg / U.overdrive.damage : b.dmg;
      this.damageEnemy(e, dmg, b.owner, b.x, b.y, 'gun');
      if (!b.pierce) return false;
      b.hit?.add(e.id);
    }
    return true;
  }

  private damageEnemy(e: Enemy, dmg: number, by: string, x: number, y: number, src: DamageSource): void {
    if (!this.enemies.has(e.id)) return;
    e.hp -= dmg;
    e.hitTick = this.tick;
    const p = this.players.get(by);
    if (p && this.brahma >= 0 && src !== 'astra')
      this.chargeBrahma(dmg * GAME_CONFIG.powers.brahma.perDamage);
    if (p) {
      if (isBoss(e.kind)) p.stats.bossDamage += dmg;
      if (src !== 'ult') this.gainUlt(p, dmg * U.perDamage);
      this.addCombo(
        p,
        src === 'melee' ? C.meleeHit : src === 'slide' ? C.slideHit : src === 'ult' ? C.ultHit : C.gunHit,
      );
    }
    if (e.hp > 0) {
      this.emit({ e: 'ehit', id: e.id, x: r1(x), y: r1(y) });
      return;
    }
    this.enemies.delete(e.id);
    const kind = e.kind;
    let pts: number = E[kind].score;
    if (p) {
      this.addCombo(p, C.killBonus);
      if (this.brahma >= 0 && src !== 'astra') this.chargeBrahma(GAME_CONFIG.powers.brahma.perKill);
      pts = Math.round(pts * this.comboMultiplier(p));
      p.stats.kills++;
      p.stats.score += pts;
      if (src !== 'ult') this.gainUlt(p, U.perKill);
      // Style moments.
      let tag: StyleTag | null = src === 'melee' ? 'melee' : src === 'slide' ? 'slide' : null;
      if (!tag && src === 'gun' && !p.onGround && !isBoss(kind)) tag = 'air';
      if (this.tick > p.multiUntil) p.multiN = 0;
      p.multiN++;
      p.multiUntil = this.tick + this.ticks(1.2);
      if (p.multiN === 3) tag = 'multi';
      if (tag) this.emit({ e: 'style', id: p.id, t: tag, x: r1(e.body.x), y: r1(e.body.y - e.body.h) });
    }
    this.score += pts;
    this.emit({ e: 'ekill', id: e.id, kind, x: r1(e.body.x), y: r1(e.body.y - e.body.h / 2), by, pts });
    if (isBoss(kind)) {
      // A boss falls: its reinforcements go with it, and its shots vanish.
      for (const d of [...this.enemies.values()]) if (d.fromBoss) this.enemies.delete(d.id);
      this.bullets = this.bullets.filter((x) => !x.enemy);
      this.emit({ e: 'bossDown', kind, x: r1(e.body.x), y: r1(e.body.y) });
    }
  }

  private bulletVsPlayers(b: Bullet): boolean {
    for (const p of this.players.values()) {
      if (p.state !== 'alive') continue;
      const h = p.crouch ? P.crouchHeight : P.height;
      if (b.x < p.x - p.w / 2 - b.size || b.x > p.x + p.w / 2 + b.size) continue;
      if (b.y < p.y - h - b.size || b.y > p.y + b.size) continue;
      // Dashing: bullets pass straight through you.
      if (this.dodging(p)) continue;
      if (b.blast > 0) {
        this.explode(b);
        return false;
      }
      this.hurtPlayer(p, b.dmg);
      return b.kind === 'wave'; // shockwaves roll on
    }
    return true;
  }

  private hurtPlayer(p: Player, dmg: number): void {
    if (p.state !== 'alive' || this.phase !== 'playing') return;
    if (this.tick < p.invulnUntil || this.dodging(p)) return;
    let d = dmg * GAME_CONFIG.mission.enemyDamage[this.settings.difficulty] * this.mods.enemyDamage;
    if (this.overdrive(p)) d *= U.overdrive.damageTaken;
    p.hp -= d;
    p.lastHurt = this.tick;
    p.invulnUntil = this.tick + this.ticks(P.hurtInvulnSec);
    this.breakCombo(p);
    this.gainUlt(p, d * U.perHurt);
    if (p.hp <= 0) this.koPlayer(p);
    else this.emit({ e: 'hurt', id: p.id, dmg: Math.round(d) });
  }

  private koPlayer(p: Player): void {
    if (p.state === 'dead') return;
    p.state = 'dead';
    p.hp = 0;
    p.vx = 0;
    p.input = { ...NEUTRAL_INPUT };
    p.dashTicks = p.slideTicks = 0;
    p.overdriveUntil = 0;
    p.weapon = 'blaster'; // like the arcade classics: going down costs your special gun
    p.stats.deaths++;
    this.breakCombo(p);
    p.respawnAt = this.tick + this.ticks(P.respawnSec);
    this.emit({ e: 'ko', id: p.id });
  }

  private stepContact(): void {
    for (const e of this.enemies.values()) {
      if (!e.awake || e.kind === 'turret' || e.kind === 'boss') continue;
      const b = e.body;
      const boss = isBoss(e.kind);
      const dmg = e.kind === 'walker' ? E.walker.contactDmg : E.contactDmg;
      for (const p of this.players.values()) {
        if (p.state !== 'alive') continue;
        if (p.slideTicks > 0 && !boss) continue; // sliding knocks troopers over instead
        const h = p.crouch ? P.crouchHeight : P.height;
        const overlapX = Math.abs(p.x - b.x) < (p.w + b.w) / 2 - 2;
        const overlapY = p.y - h < b.y && p.y > b.y - b.h;
        if (overlapX && overlapY) this.hurtPlayer(p, dmg);
      }
    }
  }

  private stepPickups(): void {
    const r = GAME_CONFIG.pickups.radius;
    for (const pk of this.level.pickups) {
      if (this.taken[pk.id]) {
        // Altars come back: a fire wall can never lock the squad out.
        if (pk.respawn && this.tick >= (this.altarBack[pk.id] as number)) {
          this.taken[pk.id] = false;
          this.altarBack[pk.id] = -1;
        }
        continue;
      }
      for (const p of this.players.values()) {
        if (p.state !== 'alive') continue;
        if (Math.abs(p.x - pk.x) > r + p.w / 2 || p.y < pk.y - r || p.y - P.height > pk.y + r) continue;
        if (isPower(pk.kind) && p.power === pk.kind && p.powerN >= GAME_CONFIG.powers.maxCharges) continue;
        this.taken[pk.id] = true;
        if (pk.respawn) this.altarBack[pk.id] = this.tick + this.ticks(GAME_CONFIG.pickups.respawnSec);
        const healed: string[] = [];
        if (pk.kind === 'medkit') {
          const share = GAME_CONFIG.pickups.medkitShareRadius ** 2;
          for (const q of this.players.values()) {
            if (q.state !== 'alive') continue;
            if (q === p || (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= share) {
              q.hp = Math.min(P.maxHp, q.hp + GAME_CONFIG.pickups.medkitHeal);
              healed.push(q.id);
            }
          }
        } else if (isPower(pk.kind)) {
          const PW = GAME_CONFIG.powers;
          p.powerN =
            p.power === pk.kind
              ? Math.min(PW.maxCharges, p.powerN + PW.charges[pk.kind])
              : PW.charges[pk.kind];
          p.power = pk.kind;
        } else p.weapon = pk.kind;
        this.emit({ e: 'pickup', id: pk.id, kind: pk.kind, by: p.id, healed });
        break;
      }
    }
  }

  // ------------------------------------------------------------ arenas

  /** The arena currently locked down (the squad is fighting in it), if any. */
  activeArena(): number {
    for (let i = this.arenaState.length - 1; i >= 0; i--) if (this.arenaState[i] === 1) return i;
    return -1;
  }

  private stepArenas(): void {
    for (const a of this.level.arenas) {
      const st = this.arenaState[a.id];
      if (st === 0) {
        let entered = false;
        for (const p of this.players.values()) if (p.state === 'alive' && p.x >= a.trigger) entered = true;
        if (!entered) continue;
        this.arenaState[a.id] = 1;
        if (a.boss) {
          for (const e of this.enemies.values())
            if (e.arena === a.id && isBoss(e.kind) && !e.awake) this.wake(e);
          this.emit({ e: 'arena', id: a.id, wave: 0, of: 0 });
          if (a.waves.length) this.startWave(a, 0); // escorts arrive with the boss
        } else this.startWave(a, 0);
      } else if (st === 1) {
        let left = 0;
        let bosses = 0;
        for (const e of this.enemies.values()) {
          if (e.arena !== a.id) continue;
          if (isBoss(e.kind)) bosses++;
          else if (!e.fromBoss || !a.boss) left++;
        }
        const next = (this.arenaWave[a.id] as number) + 1;
        if (a.boss && bosses > 0) {
          // Boss fight: the next escort wave comes 3 s after the last one is down, while a boss stands.
          if (left === 0 && next < a.waves.length) {
            if (this.arenaNext[a.id] === -1) this.arenaNext[a.id] = this.tick + this.ticks(3);
            else if (this.tick >= (this.arenaNext[a.id] as number)) this.startWave(a, next);
          }
          continue;
        }
        if (left > 0) continue;
        if (!a.boss && next < a.waves.length) {
          if (this.arenaNext[a.id] === -1) this.arenaNext[a.id] = this.tick + this.ticks(1.2);
          else if (this.tick >= (this.arenaNext[a.id] as number)) this.startWave(a, next);
        } else this.clearArena(a);
      }
    }
  }

  private startWave(a: ArenaDef, n: number): void {
    this.arenaWave[a.id] = n;
    this.arenaNext[a.id] = -1;
    const wave = a.waves[n] ?? [];
    let l = 0;
    let r = 0;
    for (const s of wave) {
      if (s.side === 'L') this.spawnAwake(s.kind, a.left + 40 + l++ * 34, a.floor, a.id);
      else if (s.side === 'R') this.spawnAwake(s.kind, a.right - 40 - r++ * 34, a.floor, a.id);
      else {
        const x = a.left + (a.right - a.left) * this.rng.range(0.25, 0.85);
        this.spawnAwake(s.kind, x, 40, a.id);
      }
    }
    this.emit({ e: 'arena', id: a.id, wave: n + 1, of: a.waves.length });
  }

  private clearArena(a: ArenaDef): void {
    this.arenaState[a.id] = 2;
    if (a.gate >= 0 && !this.gateOpen[a.gate]) {
      this.gateOpen[a.gate] = true;
      this.emit({ e: 'gate', id: a.gate });
    }
    for (const p of this.players.values())
      if (p.state === 'alive') p.hp = Math.min(P.maxHp, p.hp + GAME_CONFIG.mission.arenaClearHeal);
    if (a.boss && a.boss !== 'boss') {
      this.lives = Math.min(GAME_CONFIG.mission.maxLives, this.lives + 1);
      this.emit({ e: 'life', lives: this.lives });
    }
    this.emit({ e: 'clear', id: a.id });
    if (a.gate === -1) this.finish('won'); // the final arena: mission accomplished
  }

  private stepCheckpoints(): void {
    for (const cp of this.level.checkpoints) {
      if (cp.id < this.checkpoint) continue;
      for (const p of this.players.values())
        if (p.state === 'alive' && p.x >= cp.x) {
          this.checkpoint = cp.id + 1;
          this.emit({ e: 'checkpoint', id: cp.id });
          break;
        }
    }
  }

  /** KO'd soldiers come back beside the squad after a few seconds, if the team has a life to spend. */
  private stepDead(): void {
    for (const p of this.players.values()) {
      if (p.state !== 'dead' || this.tick < p.respawnAt || this.lives <= 0 || this.pendingResult) continue;
      this.lives--;
      const spot = this.respawnSpot(p);
      p.x = spot.x;
      p.y = spot.y;
      p.vx = p.vy = 0;
      p.state = 'alive';
      p.hp = P.maxHp;
      p.lastHurt = -1000;
      p.invulnUntil = this.tick + this.ticks(P.spawnInvulnSec);
      p.prevJump = true; // a held Jump must be released before it counts again
      p.prevUlt = true;
      this.emit({ e: 'respawn', id: p.id });
    }
  }

  private checkEnd(): void {
    if (this.pendingResult === null) {
      if (this.players.size > 0 && this.aliveCount() === 0 && this.lives === 0)
        this.finish('failed', 'lives');
      else if (this.tick >= this.ticks(GAME_CONFIG.mission.maxDurationSec)) this.finish('failed', 'time');
    }
    if (this.endAt >= 0 && this.tick >= this.endAt) {
      this.phase = 'ended';
      this.result = this.pendingResult;
      this.emit({
        e: 'end',
        result: this.result as MissionResult,
        ...(this.failReason ? { reason: this.failReason } : {}),
      });
    }
  }

  /** Schedule the end (a short pause lets the final explosion play), or end at once. */
  private finish(result: MissionResult, reason?: FailReason, now = false): void {
    if (this.pendingResult !== null) return;
    this.pendingResult = result;
    this.failReason = reason ?? null;
    this.endAt = now ? this.tick : this.tick + this.ticks(2.5);
    if (now) {
      this.phase = 'ended';
      this.result = result;
      this.emit({ e: 'end', result, ...(reason ? { reason } : {}) });
    }
  }

  /** Has the mission been decided (victory/defeat animation playing)? */
  get decided(): MissionResult | null {
    return this.pendingResult;
  }

  /** Squad report rows (the server sends these at the end; solo play shows them too). */
  board(): BoardEntry[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      hero: p.hero,
      kills: p.stats.kills,
      deaths: p.stats.deaths,
      bestCombo: p.stats.bestCombo,
      rank: p.stats.bestRank,
      ults: p.stats.ults,
      bossDamage: Math.round(p.stats.bossDamage),
      score: p.stats.score,
    }));
  }

  // ------------------------------------------------------------ output

  private emit(e: SimEvent): void {
    this.events.push(e);
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot(): Snapshot {
    const mask = (arr: boolean[]): number => arr.reduce((m, v, i) => (v ? m | (1 << i) : m), 0);
    const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
      id: p.id,
      n: p.name,
      s: p.slot,
      hr: p.hero,
      x: r1(p.x),
      y: r1(p.y),
      vx: r1(p.vx),
      vy: r1(p.vy),
      g: p.onGround ? 1 : 0,
      f: p.facing,
      c: p.crouch ? 1 : 0,
      ax: p.aimX,
      ay: p.aimY,
      hp: Math.max(0, Math.ceil(p.hp)),
      st: p.state === 'alive' ? 0 : 1,
      dl:
        p.state === 'dead'
          ? this.lives > 0
            ? Math.max(0, Math.ceil((p.respawnAt - this.tick) / this.tickRate))
            : -1
          : 0,
      w: WEAPON_KINDS.indexOf(p.weapon),
      iv: this.tick < p.invulnUntil ? 1 : 0,
      fi: p.input.fire && p.state === 'alive' ? 1 : 0,
      k: p.stats.kills,
      ul: Math.floor(p.ult),
      od: this.overdrive(p) ? 1 : 0,
      cb: this.tick <= p.comboUntil ? p.combo : 0,
      rk: this.tick <= p.comboUntil ? rankOf(p.combo) : -1,
      ml:
        this.tick < p.meleeUntil
          ? Math.max(1, Math.round((1 - (p.meleeUntil - this.tick) / this.ticks(P.melee.animSec)) * 10))
          : 0,
      co: p.coyote,
      dr: p.dropTicks,
      pj: p.prevJump ? 1 : 0,
      aj: p.airJumps,
      dsh: p.dashTicks,
      sld: p.slideTicks,
      dcd: p.dashCd,
      dd: p.dashDir,
      ad: p.airDashed ? 1 : 0,
      pd: p.prevDash ? 1 : 0,
      pw: p.power ? POWER_KINDS.indexOf(p.power) : -1,
      pn: p.powerN,
    }));
    // Only enemies near somebody are sent: a long level would otherwise bloat every packet.
    const near = (x: number, w: number): boolean => {
      for (const p of this.players.values()) if (Math.abs(p.x - x) < 1300 + w / 2) return true;
      return false;
    };
    const enemies: EnemySnapshot[] = [];
    for (const e of this.enemies.values()) {
      if (!near(e.body.x, e.body.w)) continue;
      const boss = isBoss(e.kind);
      enemies.push({
        id: e.id,
        k: e.kind,
        x: r1(e.body.x),
        y: r1(e.body.y),
        hp: Math.max(0, Math.round((e.hp / e.maxHp) * 100)),
        f: e.body.facing,
        h: this.tick - e.hitTick < 3 ? 1 : 0,
        a: e.kind === 'turret' || boss ? Math.round(e.aim * 100) : 0,
        sh: e.shield > 0 ? 1 : 0,
        at: boss && e.awake ? e.atk : 0,
        tt: boss && e.awake && e.atk !== ATTACK.none ? this.tick - e.atkStart : 0,
        p: boss ? e.atkParam : 0,
        ph: e.phase,
      });
    }
    const ai = this.activeArena();
    let arena: Snapshot['arena'] = null;
    let boss: Snapshot['boss'] = null;
    if (ai >= 0) {
      const a = this.level.arenas[ai] as ArenaDef;
      let left = 0;
      for (const e of this.enemies.values()) if (e.arena === ai && !e.fromBoss) left++;
      arena = { id: ai, w: (this.arenaWave[ai] as number) + 1, n: a.waves.length, left };
      // One bar for the whole fight: twin bosses add up.
      for (const e of this.enemies.values()) {
        if (e.arena !== ai || !isBoss(e.kind) || !e.awake) continue;
        const hit: 0 | 1 = this.tick - e.hitTick < 3 ? 1 : 0;
        if (!boss) boss = { k: e.kind as BossKind, hp: 0, max: 0, ph: e.phase, h: hit };
        boss.hp += Math.max(0, Math.round(e.hp));
        boss.ph = Math.max(boss.ph, e.phase);
        if (hit) boss.h = 1;
      }
      // Dead twins still count toward the bar's full length.
      if (boss) boss.max = Math.round(this.arenaBossMax[ai] as number);
    }
    if (!boss && this.pendingResult === 'won') boss = { k: 'boss', hp: 0, max: 1, ph: 3, h: 0 };
    return {
      tick: this.tick,
      phase: this.phase,
      result: this.result ?? this.pendingResult,
      cd:
        this.phase === 'countdown'
          ? Math.max(0, Math.ceil((this.countdownEnd - this.tick) / this.tickRate))
          : 0,
      lives: this.lives,
      cp: this.checkpoint,
      gates: mask(this.gateOpen),
      taken: mask(this.taken),
      score: this.score,
      lx: Math.round(this.world.limitX),
      arena,
      boss,
      players,
      enemies,
      bullets: this.bullets.map((b) => ({
        id: b.id,
        x: r1(b.x),
        y: r1(b.y),
        vx: Math.round(b.vx),
        vy: Math.round(b.vy),
        e: b.enemy ? 1 : 0,
        w: b.weapon ? WEAPON_KINDS.indexOf(b.weapon) : 0,
        k: BULLET_KINDS.indexOf(b.kind),
        p: b.power ? 1 : 0,
      })),
      bm: this.brahma < 0 ? -1 : Math.floor(this.brahma),
      fx: [
        ...this.burns.map((f) => ({
          k: 0 as const,
          x: r1(f.x0),
          y: r1(f.y),
          w: r1(f.x1 - f.x0),
          t: r1((f.until - this.tick) / this.tickRate),
        })),
        ...this.holes.map((h) => ({
          k: 1 as const,
          x: r1(h.x),
          y: r1(h.y),
          w: GAME_CONFIG.powers.singularity.radius,
          t: r1((h.until - this.tick) / this.tickRate),
        })),
      ],
    };
  }
}

function clampAngle(a: number, lo: number, hi: number): number {
  // Normalise into [lo - π, lo + π) first so the comparison is meaningful for left-facing ranges.
  let x = a;
  while (x < lo - Math.PI) x += Math.PI * 2;
  while (x >= lo + Math.PI) x -= Math.PI * 2;
  return Math.min(hi, Math.max(lo, x));
}
