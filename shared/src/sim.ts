import { MOUNTS, MOUNT_KINDS, MOUNT_POWER, RIDE_RAM_COOLDOWN_SEC, mountOf, type MountKind } from './mounts';
import {
  ATTACK,
  BULLET_KINDS,
  GAME_CONFIG,
  WEAPON_KINDS,
  defaultMissionSettings,
  isBoss,
  isFixedBoss,
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
import { nextStyleAttack, styleOf, type BossStyle } from './boss-styles';
import { heroOf, heroPerk } from './heroes';
import {
  BOSS_RULES,
  fieldAt,
  finalArena,
  levelHeight,
  levelWidth,
  type ArenaDef,
  type BossRule,
  type LevelDef,
  type MissionMods,
  type HazardDef,
  type Vyuha,
  type WaveSpawn,
  Tile,
  tileAt,
} from './level';
import { getMission } from './missions';
import {
  NEUTRAL_INPUT,
  aimOf,
  footingBelow,
  groundBelow,
  moveBody,
  platUnder,
  type Plat,
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

/**
 * Surprises: no two runs of a saga stage are the same. When a run starts, three spots along the stage are drawn
 * from the run's seed, and something different breaks out at each as the squad passes: an ambush from both sides,
 * an elite hunter, a rain of fire, raiders out of the sky, tremors, or (once a run) a blessing that heals the squad
 * and fills their supers. Where, and which, changes every run; each stage draws from its own list.
 */
export type SurpriseKind =
  'ambush' | 'elite' | 'skyfall' | 'raid' | 'tremor' | 'blessing' | 'stampede' | 'duel';
export const SURPRISE_POOLS: Record<string, readonly SurpriseKind[]> = {
  'astra-1': ['ambush', 'elite', 'skyfall'],
  'astra-2': ['raid', 'elite', 'ambush'],
  'astra-3': ['skyfall', 'raid', 'elite'],
  'astra-4': ['ambush', 'elite', 'tremor'],
  'astra-5': ['ambush', 'elite', 'raid'],
  'astra-6': ['skyfall', 'tremor', 'elite'],
  'astra-7': ['stampede', 'raid', 'ambush', 'elite'],
  'astra-8': ['tremor', 'ambush', 'elite'],
  'astra-9': ['duel', 'tremor', 'ambush'],
  'astra-10': ['skyfall', 'raid', 'elite'],
};
/**
 * Stage goals: every saga stage asks the squad for something of its own besides reaching the boss, so no two
 * stages are played the same way. `rescue` free the captives (touch each before the squad leaves it behind),
 * `targets` shoot down the things that feed the enemy, `hold` hold a spot against waves until the bar fills, `race`
 * reach the boss's ground before time runs out. The spots change every run. Done: the squad is healed, their supers
 * filled and the score rises; missed: the stage goes on (a goal is a challenge, never a wall).
 */
export type GoalKind = 'rescue' | 'targets' | 'hold' | 'race';
export interface GoalDef {
  kind: GoalKind;
  /** How many captives or targets (1 for hold and race). */
  n: number;
  /** Hold: seconds to hold; race: seconds per 1000 px of stage. */
  secs?: number;
}
export const SAGA_GOALS: Record<string, GoalDef> = {
  'astra-1': { kind: 'rescue', n: 4 },
  'astra-2': { kind: 'race', n: 1, secs: 14 },
  'astra-3': { kind: 'targets', n: 3 },
  'astra-4': { kind: 'rescue', n: 5 },
  'astra-5': { kind: 'targets', n: 3 },
  'astra-6': { kind: 'hold', n: 1, secs: 18 },
  'astra-7': { kind: 'hold', n: 1, secs: 24 },
  'astra-8': { kind: 'targets', n: 4 },
  'astra-9': { kind: 'race', n: 1, secs: 17 },
  'astra-10': { kind: 'rescue', n: 4 },
};
/** A hold's spot: how far ahead of it the way stays shut, and how near a soldier must be to hold it. */
export const GOAL_HOLD_WALL = 300;
export const GOAL_HOLD_REACH = 300;
/** Goal state in a snapshot: kind, done, out of, seconds left (race, hold), status (0 on, 1 done, 2 missed), the hold
 * spot and its bar 0..1, and the captives or targets still standing (x, y, hp 0..100 each). */
export interface GoalSnapshot {
  k: GoalKind;
  d: number;
  n: number;
  t?: number;
  s: 0 | 1 | 2;
  z?: [number, number, number];
  it: number[];
}

/** Rakshasas that can take part in an ambush or come as an elite (not the fixed, scripted or huge ones). */
const AMBUSHERS: ReadonlySet<TrooperKind> = new Set<TrooperKind>([
  'soldier',
  'shield',
  'grenadier',
  'jetpack',
  'imp',
  'bat',
  'treant',
  'crab',
  'harpy',
  'lancer',
  'serpent',
  'mirror',
  'dancer',
  'pret',
  'golem',
  'archer',
  'rathi',
  'netter',
  'chakri',
  'pehlwan',
  'gadadhar',
  'slinger',
  'mashaal',
]);
const AIRBORNE: ReadonlySet<TrooperKind> = new Set<TrooperKind>(['jetpack', 'bat', 'harpy', 'pret', 'drone']);
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
  /** Kills by weapon or blade since the carried astra last regained a charge. */
  astraKills: number;
  multiUntil: number;
  stats: PlayerStats;
  /** Held power (astra) and its charges. */
  power: PowerKind | null;
  powerN: number;
  prevAstra: boolean;
  /** Caught in a net (Chakra Durg) until this tick: slowed. */
  netUntil: number;
  /** Riding (mounts.ts; the kind is Mover.ride): the ride's health, where it ends, when its power is ready. */
  mountHp: number;
  mountTo: number;
  mountReady: number;
  /** A hawk's dive in progress: until this tick (or until it lands). */
  diveUntil: number;
  /** Troopers this ride last ran into, and when (a trample hurts each one once in a while, not every tick). */
  rideHits: Map<number, number>;
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

/**
 * The whirlwind (bhavandar) the vayu astra raises: it walks forward, draws troopers in, carries them round and
 * up its column, and hurls them away when it blows out.
 */
export interface Twister {
  x: number;
  /** The ground it stands on. */
  y: number;
  vx: number;
  born: number;
  until: number;
  owner: string;
  /** Enemies it is carrying. */
  held: Set<number>;
  /** It has crossed burning ground and become a whirl of fire: what it carries is set alight. */
  fire: boolean;
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
  /** Carried by a whirlwind until this tick: no AI and no physics of its own. */
  liftUntil: number;
  /** Set alight by the agni astra: burns until this tick (`burnBy` gets the credit). */
  burnUntil: number;
  burnBy: string;
  /** How many troopers the fire passed through to reach this one (it dies out after two). */
  burnGen: number;
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
  /** Boss astras (Astra Saga): null for everything else. */
  rule: RuleState | null;
  /** Astra Saga boss style (its own attack order); null: the body's classic cycle. */
  style: BossStyle | null;
  /** Elite trooper: tougher, glowing, a big reward when it falls. */
  elite: boolean;
  /** Leap target x (walker leap). */
  leapX: number;
  /** Movement anchor for scripted moves (a bat's dive starts here). */
  mx: number;
  my: number;
}

/** A wave enemy on its way in (portal or rising from the ground): it appears at `at`. */
interface PendingSpawn {
  kind: TrooperKind;
  x: number;
  y: number;
  arena: number;
  at: number;
  elite: boolean;
  fromBoss: boolean;
}

/**
 * A boss's own astras. One cast at a time: `kind` is what it is calling right now (null between casts), `start` the
 * tick the call began; a samarpanastra storm follows its wind-up (`storm`).
 */
export interface RuleState {
  rules: BossRule[];
  kind: BossRule | null;
  start: number;
  storm: boolean;
  nextNaga: number;
  nextOrb: number;
  nextNar: number;
  nextShirsha: number;
  /** Samarpanastra calls so far, and whether the last storm passed with nobody fighting it. */
  narCalls: number;
  narPerfect: boolean;
  stunUntil: number;
  /** Spent after a storm: takes extra damage until this tick. */
  spentUntil: number;
}

/** A spirit ally (vidyut): follows its summoner and fires sparks at the nearest foe. */
export interface Spirit {
  x: number;
  y: number;
  until: number;
  next: number;
  owner: string;
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
  /** Homing turn rate (rad/s; 0 = flies straight). Player shots seek foes, enemy shots seek soldiers. */
  turn: number;
  /** Chakram: foes it may still hit before it flies home; `ret` once it is on its way back. */
  hitsLeft: number;
  ret: boolean;
  /** The boss that fired it (a tej orb turned back flies to this enemy id). -1: none. */
  src: number;
  /** Where it was fired from (height): the banyan's heart only feels shots fired from up in its boughs. */
  oy?: number;
}

export type SimEvent =
  | { e: 'ehit'; id: number; x: number; y: number }
  | { e: 'regain'; id: string; kind: PowerKind }
  | { e: 'ekill'; id: number; kind: EnemyKind; x: number; y: number; by: string; pts: number }
  | { e: 'hurt'; id: string; dmg: number }
  | { e: 'ko'; id: string }
  | { e: 'respawn'; id: string }
  | { e: 'hazard'; kind: HazardDef['kind']; x: number; y: number }
  /** A surprise of this run (see Sim.planSurprises): where it broke out and what it is. */
  | { e: 'surprise'; kind: SurpriseKind; x: number; y: number }
  /** The stage goal: a captive freed or a target down (`item`), the goal done, or missed. */
  | { e: 'goal'; k: 'item' | 'done' | 'fail'; d: number; n: number; x: number; y: number }
  | { e: 'pickup'; id: number; kind: PickupKind; by: string; healed: string[] }
  | { e: 'gate'; id: number }
  | { e: 'checkpoint'; id: number }
  /** `secs` is set for a hold-out arena (survive that long); then `wave` only counts the rounds. */
  | { e: 'arena'; id: number; wave: number; of: number; secs?: number; vy?: Vyuha }
  | { e: 'clear'; id: number }
  | { e: 'life'; lives: number }
  /** A soldier got on a ride (on 1) or off it (on 0; lost 1 when it was destroyed under them). */
  | { e: 'ride'; id: string; k: MountKind; on: 0 | 1; lost: 0 | 1; x: number; y: number }
  /** A ride's power (mounts.ts): where, which way; tx,ty the pounce's target. */
  | { e: 'rpow'; id: string; k: MountKind; x: number; y: number; f: 1 | -1; tx?: number; ty?: number }
  | { e: 'bossWake'; kind: BossKind; arena: number }
  | { e: 'bossPhase'; kind: BossKind; phase: number }
  /** The wall of fire has started to chase the squad (Agnivan). */
  | { e: 'chase' }
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
  /**
   * A power was used (x, y: the user's feet; f: facing). `v`: vidyut's form (0 trident, 1 spirit, 2 fire rain),
   * tej 1 = a boss's orb turned back.
   */
  | { e: 'astra'; id: string; kind: PowerKind; x: number; y: number; f: 1 | -1; v?: number }
  /**
   * A boss astra: phase 0 = the call (wind-up), 1 = released, 2 = countered by the squad's paramastra,
   * 3 = rebound on the boss (samarpanastra), 4 = over.
   */
  | { e: 'bossAstra'; kind: BossRule; phase: 0 | 1 | 2 | 3 | 4; x: number; y: number }
  /** A hit that did nothing: the boss is untouchable right now (samarpanastra storm). */
  | { e: 'immune'; id: number; x: number; y: number }
  /** The team paramastra: phase 0 = wind-up (sky darkens), 1 = the strike. */
  | { e: 'param'; id: string; x: number; y: number; phase: 0 | 1 }
  | { e: 'style'; id: string; t: StyleTag; x: number; y: number }
  /** An enemy is about to come through a portal (`how` 0) or rise out of the ground (1) here. */
  | { e: 'portal'; x: number; y: number; how: 0 | 1 }
  /** A boss vanished here (`out` 1) or reappeared here (0). */
  | { e: 'blink'; x: number; y: number; out: 0 | 1 }
  /** An elite trooper fell (`by` its killer). */
  | { e: 'elite'; x: number; y: number; by: string }
  /** A hidden stash was found (`id` the pickup). */
  | { e: 'secret'; id: number; x: number; y: number; by: string }
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
  /** Samarpanastra: how hard this soldier is resisting (arrows per volley at them; 0 = surrendered/spared). */
  rs: number;
  /** 1 while caught in a net (Chakra Durg). */
  nt?: number;
  /** The ride (index into MOUNT_KINDS, -1 on foot), its health 0..100, its power move's ticks left, power ready. */
  rd: number;
  rh: number;
  ru: number;
  rr: 0 | 1;
}

/**
 * Lasting power effects on screen: burning ground (k 0: x..x+w at y), black holes (k 1: centre x,y) and
 * vidyut spirits (k 2: centre x,y) and vayu whirlwinds (k 3, or k 4 once alight: foot x,y; w = its reach).
 */
export interface FxSnapshot {
  k: 0 | 1 | 2 | 3 | 4;
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
  /** Boss astra being called (index into BOSS_RULES, -1 none), ticks since the call, 1 = samarpan storm on. */
  ra: number;
  rt: number;
  rs: 0 | 1;
  /** Bit 1: set alight by the agni astra. Bit 2: carried by a whirlwind. */
  fl: number;
  /** Stunned (spent after a storm, or its pralay countered) / untouchable (storm). */
  sn: 0 | 1;
  im: 0 | 1;
  /** Elite trooper. */
  el: 0 | 1;
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
  /** The front of the wall of fire chasing the squad (Agnivan); absent when there is none yet. */
  cx?: number;
  /** Moving surfaces (Sagar Setu), three numbers each in level order: x shift, y, solid (1/0). */
  pl?: number[];
  /** The sea's surface y (Sagar Setu's tide). */
  wy?: number;
  /** 1 while MAYASTRA shows every illusion as it is (Maya Nagri). */
  ma?: number;
  /** The surface of the lava rising from below (Bhasm Parvat). */
  lv?: number;
  /** The bhanwarvyuh's closing wall: nobody may go back left of it (Chakra Durg). */
  vw?: number;
  /** Meghbaan's mark (Suvarna): x and ground y where his arrows are about to come down. */
  ij?: [number, number];
  /** Vayu Shikhar's wind: ±1 blowing that way, ±2 about to (a warning), 0 still. */
  gu?: number;
  /** The arena currently locked down, if any. */
  /** `t`: seconds left in a hold-out arena (absent in a normal one). */
  arena: { id: number; w: number; n: number; left: number; t?: number } | null;
  /** The boss currently fighting, if any. */
  boss: { k: BossKind; hp: number; max: number; ph: number; h: 0 | 1 } | null;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  bullets: BulletSnapshot[];
  /** Team paramastra meter 0..100 (-1: not in this mission). */
  bm: number;
  /** The stage goal (saga stages). */
  gl?: GoalSnapshot;
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
  [ATTACK.rain]: 0.7,
  [ATTACK.ring]: 0.65,
  [ATTACK.spiral]: 0.55,
  [ATTACK.leap]: 0.6,
  [ATTACK.blink]: 0.45,
  [ATTACK.summon]: 0.6,
  [ATTACK.roots]: 0.7,
  [ATTACK.fruit]: 0.6,
  [ATTACK.breath]: 0.8,
  [ATTACK.grab]: 1.3,
  [ATTACK.surge]: 0.7,
  [ATTACK.spit]: 0.6,
  [ATTACK.storm]: 0.9,
  [ATTACK.boulders]: 0.7,
  [ATTACK.javelins]: 0.6,
  [ATTACK.call]: 0.6,
  [ATTACK.venom]: 0.6,
  [ATTACK.lunge]: 0.9,
  [ATTACK.poison]: 0.7,
  [ATTACK.beam]: 0.8,
  [ATTACK.shards]: 0.6,
  [ATTACK.show]: 0.8,
  [ATTACK.rush]: 0.6,
  [ATTACK.ash]: 0.7,
  [ATTACK.dance]: 1.2,
  [ATTACK.fan]: 0.6,
  [ATTACK.agnibaan]: 0.8,
  [ATTACK.cleave]: 0.6,
  [ATTACK.mace]: 0.8,
  [ATTACK.spears]: 0.6,
  [ATTACK.rathis]: 0.7,
  [ATTACK.hurl]: 0.7,
  [ATTACK.pounce]: 0.6,
  [ATTACK.bull]: 0.8,
  [ATTACK.tenfire]: 0.8,
  [ATTACK.moonblade]: 0.7,
  [ATTACK.meteors]: 0.7,
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
  /** Tick a hold-out arena ends at (-1 until entered). */
  private arenaEnd: number[];
  /** Raiders of a `raid` hazard still alive (capped). */
  private raiders = new Set<number>();
  /** Total health of every boss woken in each arena (the boss bar's full length). */
  private arenaBossMax: number[];
  /** Tick at which a taken altar comes back (-1: not waiting). */
  private altarBack: number[];
  /** Team paramastra meter (-1 when the mission has none). */
  param: number;
  private paramStrike: { at: number; id: string; x: number; y: number } | null = null;
  burns: Burn[] = [];
  holes: Hole[] = [];
  twisters: Twister[] = [];
  /** The stage's hazard holds off until this tick (set when an arena falls). */
  private calmUntil = 0;
  /** This run's surprises (planSurprises) and the one now running (rain of fire, tremors). */
  private surprises: { x: number; kind: SurpriseKind; done: boolean }[] = [];
  private surpriseRun: { kind: SurpriseKind; until: number; next: number } | null = null;
  /** Enemies the run's surprises and holds brought in (they leave when the final boss wakes). */
  private readonly strays = new Set<number>();
  /** This run's stage goal (planGoal). */
  private goal: {
    def: GoalDef;
    spots: number[];
    items: { x: number; y: number; hp: number; max: number; state: 0 | 1 | 2 }[];
    done: number;
    status: 0 | 1 | 2;
    until: number;
    zone: { x: number; y: number; held: number; nextWave: number } | null;
  } | null = null;
  spirits: Spirit[] = [];
  /** Samarpanastra: ticks each soldier has spent fighting during the current storm. */
  readonly resist = new Map<string, number>();
  /** The final boss (the mission is won when it falls). */
  boss: Enemy | null = null;
  /** The wall of fire chasing the squad (Agnivan): its front x, whether it has started, and when it starts. */
  chaseX = -1e9;
  /** Sagar Setu's floating stones and boat (world.plats), and their state: sunk depth, ticks stood on, sailed. */
  plats: Plat[] = [];
  private platSink: number[] = [];
  /** Vayu Shikhar's wind: its direction while it blows (0 = still), when it ends, the next one, a warning. */
  gustDir = 0;
  private gustEnd = 0;
  private nextGust = 0;
  private gustWarnDir = 0;
  /** A boss's storm overrides the stage's gusts: direction, push and when it ends. */
  private storm: { dir: number; push: number; until: number } | null = null;
  private tideHoldUntil = 0;
  /** MAYASTRA shows every illusion as it is until this tick (Maya Nagri). */
  mayaUntil = 0;
  /** Which of Vishdhar's heads each soldier stands on (a new landing is a stomp). */
  private headUnder = new Map<string, number>();
  /** Bhasm Parvat's lava: its surface y, and whether it has started to rise. */
  lavaY = 1e9;
  /** The bhanwarvyuh's closing wall (Chakra Durg): only ever moves right. */
  vyuhX = 0;
  /** Meghbaan's next volley (Suvarna): where (`meghX`, `meghY`) and when it lands (`meghAt`); `meghNext`: next mark. */
  meghX = 0;
  meghY = 0;
  meghAt = 0;
  private meghNext = 0;
  lavaOn = false;
  private lavaStart = 0;
  private lastStomp = new Map<string, number>();
  private platStand: number[] = [];
  private platDx: number[] = [];
  private boatGo: boolean[] = [];
  /** Ticks a boat has had someone aboard at the near bank (it waits a little for the rest). */
  private boatWait: number[] = [];
  /** Ticks a boat has stood at its far bank with someone still aboard. */
  private boatAshore: number[] = [];
  chaseOn = false;
  private chaseStart = 0;
  private events: SimEvent[] = [];
  private nextBulletId = 1;
  private nextEnemyId = 10_000;
  private pending: PendingSpawn[] = [];
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
    this.arenaEnd = this.level.arenas.map(() => -1);
    this.arenaBossMax = this.level.arenas.map(() => 0);
    this.altarBack = this.level.pickups.map(() => -1);
    this.param = this.level.param ? 0 : -1;
    this.countdownEnd = this.ticks(GAME_CONFIG.mission.countdownSec);
    this.chaseStart = this.countdownEnd + this.ticks(GAME_CONFIG.chase.delaySec);
    this.lavaStart = this.countdownEnd + this.ticks(GAME_CONFIG.lava.delaySec);
    this.maxRewind = this.ticks(GAME_CONFIG.limits.maxRewindSec);
    this.world = {
      level: this.level,
      isGateOpen: (id) => this.gateOpen[id] === true,
      limitX: levelWidth(this.level),
    };
    this.plats = this.level.plats.map((d) => ({ x0: d.x0, x1: d.x1, y: d.y, on: true }));
    this.platSink = this.plats.map(() => 0);
    this.platStand = this.plats.map(() => 0);
    this.platDx = this.plats.map(() => 0);
    this.boatGo = this.plats.map(() => false);
    this.boatWait = this.plats.map(() => 0);
    this.boatAshore = this.plats.map(() => 0);
    if (this.plats.length) this.world.plats = this.plats;
    this.surprises = this.planSurprises(opts.seed ?? 1);
    this.goal = this.planGoal(opts.seed ?? 1);
    for (const s of this.level.enemies) this.spawnEnemy(s.id, s.kind, s.x, s.y);
    for (const [i, b] of this.level.bosses.entries()) {
      const e = this.spawnEnemy(9_000 + i, b.kind, b.x, b.y);
      e.arena = b.arena;
      e.hpMul = b.hpMul;
      const style = styleOf(this.level.arenas[b.arena]?.name ?? '');
      if (style && style.body === b.kind) e.style = style;
      const rules = this.level.arenas[b.arena]?.rules ?? [];
      if (rules.length)
        e.rule = {
          rules,
          kind: null,
          start: 0,
          storm: false,
          nextNaga: 0,
          nextOrb: 0,
          nextNar: 0,
          nextShirsha: 0,
          narCalls: 0,
          narPerfect: false,
          stunUntil: 0,
          spentUntil: 0,
        };
      if (isFixedBoss(b.kind)) this.boss = e;
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
      netUntil: 0,
      mountHp: 0,
      mountTo: 0,
      mountReady: 0,
      diveUntil: 0,
      rideHits: new Map(),
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
      astraKills: 0,
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
      liftUntil: 0,
      burnUntil: 0,
      burnBy: '',
      burnGen: 0,
      atk: ATTACK.none,
      atkStart: 0,
      atkParam: 0,
      nextAtk: 0,
      cycle: 0,
      burst: 0,
      aim: Math.PI,
      hist: new Float32Array(HIST * 2),
      rule: null,
      style: null,
      elite: false,
      leapX: x,
      mx: x,
      my: y,
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
    // (Jodasur split in two is not standing there: his halves must be free to be thrown apart either way.)
    const standing = b && b.hp > 0 && this.enemies.has(b.id) && !(b.kind === 'jodasur' && b.burst === 1);
    this.world.limitX = b && standing ? b.body.x - b.body.w / 2 : levelWidth(this.level);
    // a hold: the way on stays shut until the spot is held
    const z = this.goal?.zone;
    if (z) this.world.limitX = Math.min(this.world.limitX, z.x + GOAL_HOLD_WALL);
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
      turn: 0,
      hitsLeft: 0,
      ret: false,
      src: -1,
      oy: y,
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
      e.mx = 0; // (the saga bosses' timers: open jaws, reeling, a dull mirror)
      if (e.kind === 'suryakavach') e.my = 0; // (his next eclipse: set on his first step)
      if (e.kind === 'saptashir') {
        e.my = E.saptashir.heads;
        e.leapX = 0;
        e.atkParam = this.tick;
      }
      e.nextAtk = this.tick + this.ticks(1.4);
      if (e.rule) {
        const BA = GAME_CONFIG.bossAstra;
        e.rule.nextNaga = this.tick + this.ruleTicks(BA.naga.everySec * 0.6);
        e.rule.nextOrb = this.tick + this.ruleTicks(BA.tej.everySec * 0.5);
        e.rule.nextNar = this.tick + this.ruleTicks(BA.samarpan.firstAtSec);
        e.rule.nextShirsha = this.tick;
      }
      if (e.arena >= 0) this.arenaBossMax[e.arena] = (this.arenaBossMax[e.arena] ?? 0) + e.maxHp;
      this.emit({ e: 'bossWake', kind: e.kind, arena: e.arena });
      // the stragglers of this run's surprises and holds slip away: the boss fight is the boss's own
      for (const id of this.strays) {
        const q = this.enemies.get(id);
        if (q) {
          this.emit({ e: 'portal', x: r1(q.body.x), y: r1(q.body.y), how: 1 });
          this.enemies.delete(id);
        }
      }
      this.strays.clear();
    } else if (!e.fromBoss) {
      if (e.kind === 'mayavi') e.mx = 0; // (unseen until it first shoots)
      if (e.kind === 'nidrasur') e.my = 0; // (no noise heard yet)
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
      if (this.tick < e.liftUntil) continue; // carried by a whirlwind (stepPowers moves it)
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
      if (e.rule && this.stepBossRule(e)) continue; // calling an astra, or stunned: no normal attacks
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
        case 'imp':
          this.stepImp(e);
          break;
        case 'bat':
          this.stepBat(e);
          break;
        case 'treant':
          this.stepTreant(e);
          break;
        case 'vriksha':
          this.stepVriksha(e);
          break;
        case 'makar':
          this.stepMakar(e);
          break;
        case 'crab':
          this.stepCrab(e);
          break;
        case 'conch':
          this.stepConch(e);
          break;
        case 'chhaya':
          this.stepChhaya(e);
          break;
        case 'harpy':
          this.stepHarpy(e);
          break;
        case 'roller':
          this.stepRoller(e);
          break;
        case 'lancer':
          this.stepLancer(e);
          break;
        case 'aandhi':
          this.stepAandhi(e);
          break;
        case 'serpent':
          this.stepSerpent(e);
          break;
        case 'spitter':
          this.stepSpitter(e);
          break;
        case 'egg':
          this.stepEgg(e);
          break;
        case 'vishdhar':
          this.stepVishdhar(e);
          break;
        case 'mirror':
          this.stepMirror(e);
          break;
        case 'dancer':
          this.stepDancer(e);
          break;
        case 'painting':
          this.stepPainting(e);
          break;
        case 'darpan':
          this.stepDarpan(e);
          break;
        case 'pret':
          this.stepPret(e);
          break;
        case 'golem':
          this.stepGolem(e);
          break;
        case 'lantern':
          this.stepLantern(e);
          break;
        case 'raakhasur':
          this.stepRaakhasur(e);
          break;
        case 'archer':
          this.stepArcher(e);
          break;
        case 'elephant':
          this.stepElephant(e);
          break;
        case 'drummer':
          this.stepDrummer(e);
          break;
        case 'maniyodha':
          this.stepManiyodha(e);
          break;
        case 'chakri':
          this.stepChakri(e);
          break;
        case 'rathi':
          this.stepRathi(e);
          break;
        case 'netter':
          this.stepNetter(e);
          break;
        case 'suryakavach':
          this.stepSuryakavach(e);
          break;
        case 'pehlwan':
          this.stepPehlwan(e);
          break;
        case 'gadadhar':
          this.stepGadadhar(e);
          break;
        case 'slinger':
          this.stepSlinger(e);
          break;
        case 'ardh':
          this.stepArdh(e);
          break;
        case 'jodasur':
          this.stepJodasur(e);
          break;
        case 'mashaal':
          this.stepMashaal(e);
          break;
        case 'mayavi':
          this.stepMayavi(e);
          break;
        case 'nidrasur':
          this.stepNidrasur(e);
          break;
        case 'saptashir':
          this.stepSaptashir(e);
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

  // ------------------------------------------------------------ Agnivan (saga stage 1)

  /**
   * The wall of fire behind the squad: it creeps forward at the stage's pace and never lags more than `maxLag`
   * behind the rearmost soldier, so standing still is never safe for long. It waits outside a rest stop until the
   * squad has gone through, and at the boss it becomes the grove's back wall. It burns soldiers it touches,
   * throws anyone caught deep inside it forward, and swallows any foe it reaches.
   */
  private stepChase(): void {
    if (!this.level.chase || this.phase !== 'playing') return;
    const C = GAME_CONFIG.chase;
    const alive = [...this.players.values()].filter((p) => p.state === 'alive');
    if (!alive.length) return;
    const rear = Math.min(...alive.map((p) => p.x));
    if (!this.chaseOn) {
      if (this.tick < this.chaseStart) return;
      this.chaseOn = true;
      this.chaseX = rear - C.maxLag;
      this.emit({ e: 'chase' });
    }
    let hold = Infinity;
    for (const r of this.level.rests)
      if (this.chaseX < r.x1 && rear < r.x1 + 2 * T) hold = Math.min(hold, r.x0 - 3 * T);
    const fin = finalArena(this.level);
    if (fin) hold = Math.min(hold, this.arenaState[fin.id] ? fin.left + T : fin.left - 3 * T);
    const speed = C.speed[this.settings.difficulty] * this.mods.enemyFire;
    this.chaseX = Math.min(hold, Math.max(this.chaseX + speed * this.dt, rear - C.maxLag));
    const front = this.chaseX;
    for (const p of alive) {
      if (p.x - p.w / 2 > front) continue;
      this.hurtPlayer(p, C.dps * 0.35);
      if (p.x < front - 30 && p.state === 'alive') {
        const spot = this.groundAhead(front + 5 * T);
        p.x = spot.x;
        p.y = spot.y;
        p.vx = p.vy = 0;
        p.lastSafeX = p.x;
        p.lastSafeY = p.y;
      }
    }
    for (const e of [...this.enemies.values()]) {
      if (isBoss(e.kind) || e.body.x > front - 10) continue;
      this.enemies.delete(e.id);
      if (e.awake) this.emit({ e: 'boom', x: r1(e.body.x), y: r1(e.body.y - e.body.h / 2), r: 30 });
    }
  }

  /** The first solid ground at or after x (feet position), for putting a soldier back on their feet. */
  private groundAhead(x: number): { x: number; y: number } {
    for (let c = Math.floor(x / T); c < this.level.cols; c++)
      for (let r = 1; r < this.level.rows; r++) {
        const t = tileAt(this.level, c, r);
        if ((t === Tile.Solid || t === Tile.OneWay) && tileAt(this.level, c, r - 1) === Tile.Empty)
          return { x: c * T + T / 2, y: r * T };
      }
    return { ...this.level.start };
  }

  /** Fire imp: runs at the nearest soldier and, close enough, leaps; it bursts where it lands or on touch. */
  private stepImp(e: Enemy): void {
    const c = E.imp;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (b.onGround && e.burst === 1 && this.tick > e.atkStart + 2) {
      this.impBurst(e);
      return;
    }
    if (b.onGround) {
      b.vx = 0;
      if (target) {
        const dx = target.x - b.x;
        b.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) < c.leapRange && Math.abs(target.y - b.y) < 120 && this.tick >= e.nextFire) {
          b.vx = b.facing * c.leapVx;
          b.vy = c.leapVy;
          b.onGround = false;
          e.burst = 1;
          e.atkStart = this.tick;
        } else if (groundBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y)) b.vx = b.facing * c.speed;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
    if (
      target &&
      Math.abs(target.x - b.x) < (target.w + b.w) / 2 &&
      Math.abs(target.y - P.height / 2 - (b.y - b.h / 2)) < (P.height + b.h) / 2
    )
      this.impBurst(e);
  }

  private impBurst(e: Enemy): void {
    const b = e.body;
    const blast = this.shoot(b.x, b.y - 10, 0, E.imp.dmg, { speed: 0, blast: E.imp.blast, life: 0.1 });
    blast.expires = this.tick;
    this.explode(blast);
    this.enemies.delete(e.id);
  }

  /** Burning bat: hangs above and to one side of a soldier, then dives across dropping embers. */
  private stepBat(e: Enemy): void {
    const c = E.bat;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y, c.sight);
    if (e.burst === 1) {
      const k = (this.tick - e.atkStart) / this.ticks(c.diveSec);
      if (k >= 1) {
        e.burst = 0;
        e.nextFire = this.tick + this.ticks(c.diveEvery) + this.rng.int(this.ticks(0.8));
        return;
      }
      b.x = e.mx + (e.leapX - e.mx) * k;
      b.y = e.my + Math.sin(k * Math.PI) * (c.hover - 30);
      if ((this.tick - e.atkStart) % Math.max(1, this.ticks(c.emberEvery)) === 0)
        this.shoot(b.x, b.y, Math.PI / 2, c.dmg, { speed: 150, size: 4, life: 1.6 });
      return;
    }
    if (!target) return;
    const side = e.id % 2 ? 150 : -150;
    const hx = target.x + side;
    const hy = target.y - c.hover + Math.sin(this.tick / 9 + e.id) * 12;
    const step = c.speed * this.dt;
    b.x += Math.max(-step, Math.min(step, hx - b.x));
    b.y += Math.max(-step, Math.min(step, hy - b.y));
    b.facing = target.x >= b.x ? 1 : -1;
    if (this.tick >= e.nextFire && Math.abs(hx - b.x) < 60) {
      e.burst = 1;
      e.atkStart = this.tick;
      e.mx = b.x;
      e.my = b.y;
      e.leapX = target.x - side;
    }
  }

  /** Tree demon: plods to lobbing range, turns slowly (get behind it: its back has no bark), throws burning logs. */
  private stepTreant(e: Enemy): void {
    const c = E.treant;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      const dx = target.x - b.x;
      const face: 1 | -1 = dx >= 0 ? 1 : -1;
      if (face !== b.facing && this.tick >= e.burst) {
        e.burst = this.tick + this.ticks(1.3);
        e.cycle = face;
      }
      if (e.cycle !== 0 && this.tick >= e.burst - 1) {
        b.facing = e.cycle as 1 | -1;
        e.cycle = 0;
      }
      const dist = Math.abs(dx);
      let dir = 0;
      if (dist > c.keepAway + 50) dir = Math.sign(dx);
      else if (dist < c.keepAway - 80) dir = -Math.sign(dx);
      if (dir !== 0 && dir === b.facing && groundBelow(this.world, b.x + dir * (b.w / 2 + 4), b.y))
        b.vx = dir * c.speed;
      if (this.tick >= e.nextFire && Math.abs(target.y - b.y) < 200 && Math.sign(dx) === b.facing) {
        this.lob(
          b.x + b.facing * 10,
          b.y - 44,
          target.x + target.vx * 0.4,
          target.y - 4,
          1.1,
          c.dmg,
          'grenade',
          c.blast,
        );
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /**
   * Jwala Vriksh-asur. Rooted to the spot; goes round its attacks with a pause between each. Phase 2 (bark
   * hardened: see the bullet code) adds a second root wave, more fruit, and imps crawling out of its roots.
   */
  private stepVriksha(e: Enemy): void {
    const c = E.vriksha;
    const b = e.body;
    b.facing = -1;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left + T : b.x - 900;
    const front = b.x - b.w / 2;
    if (e.atk === ATTACK.none) {
      if (this.tick < e.nextAtk) return;
      const order =
        ph === 1
          ? [ATTACK.roots, ATTACK.fruit, ATTACK.breath, ATTACK.fruit]
          : [ATTACK.roots, ATTACK.breath, ATTACK.fruit, ATTACK.roots, ATTACK.fruit];
      e.atk = order[e.cycle % order.length] as AttackId;
      e.cycle++;
      e.atkStart = this.tick;
      if (ph === 2 && e.cycle % 3 === 0) {
        let imps = 0;
        for (const q of this.enemies.values()) if (q.kind === 'imp' && q.fromBoss) imps++;
        for (let i = imps; i < 3; i++) this.spawnAwake('imp', front - 30 - i * 40, b.y, e.arena, true);
      }
      return;
    }
    const t = this.tick - e.atkStart;
    const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
    const rest = (c.rest[ph - 1] ?? 1) as number;
    switch (e.atk) {
      case ATTACK.roots: {
        const waves = ph === 2 ? 2 : 1;
        const gap = this.ticks(0.75);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < waves) {
          const w = this.shoot(front - 6, b.y - 12, Math.PI, c.rootDmg, {
            kind: 'wave',
            speed: 250,
            size: 13,
            life: 4.5,
          });
          w.vy = 0;
          this.emit({ e: 'boom', x: r1(front), y: r1(b.y), r: 40 });
        }
        if (t >= wind + gap * waves) this.endAttack(e, rest);
        break;
      }
      case ATTACK.fruit: {
        if (t === wind) {
          const n = ph === 2 ? 7 : 5;
          const xs: number[] = [];
          for (const p of this.players.values()) if (p.state === 'alive') xs.push(p.x + p.vx * 0.6);
          while (xs.length < n) xs.push(left + 40 + this.rng.range(0, Math.max(60, front - left - 120)));
          xs.slice(0, n).forEach((x, i) => {
            const tx = Math.max(left + 20, Math.min(front - 30, x));
            this.lob(b.x - 30, b.y - b.h + 20, tx, b.y - 4, 1.2 + i * 0.12, c.fruitDmg, 'bomb', c.fruitBlast);
          });
        }
        if (t >= wind + this.ticks(1.4)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.breath: {
        const len = this.ticks(1.3);
        if (t >= wind && t < wind + len && (t - wind) % 3 === 0) {
          const k = (t - wind) / len;
          const a = Math.PI + 0.3 - k * 0.8;
          this.shoot(front + 10, b.y - 120, a, c.breathDmg, { speed: 300, size: 6, life: 2.2 });
        }
        if (t >= wind + len) this.endAttack(e, rest);
        break;
      }
      default:
        this.endAttack(e, rest);
    }
  }

  // ------------------------------------------------------------ Sagar Setu (saga stage 2)

  /** Is this soldier aboard a boat that is still under way? (Computer players stay on deck and fight.) */
  aboard(p: Player): boolean {
    const pl = platUnder(this.world, p);
    if (!pl) return false;
    const i = this.plats.indexOf(pl);
    const d = this.level.plats[i];
    return !!d && (d.kind === 'boat' || d.kind === 'chariot' || d.kind === 'vimana') && pl.x0 < d.to;
  }

  /** The sea's surface right now (null without a tide). */
  waterY(): number | null {
    const t = this.level.tide;
    if (!t) return null;
    if (this.tick < this.tideHoldUntil) return t.base + t.amp;
    return t.base + t.amp * Math.sin((2 * Math.PI * this.tick) / this.ticks(t.periodSec));
  }

  /**
   * Floating stones and boats. A stone stood on starts to sink after a moment and stops holding anyone once it is
   * deep enough (or under the tide); left alone it floats back. A boat sails off once a soldier is aboard and
   * carries everyone on it to its landing.
   */
  private stepPlats(): void {
    if (!this.plats.length) return;
    const S = GAME_CONFIG.sea;
    const wy = this.waterY();
    const bodies: Mover[] = [];
    for (const p of this.players.values()) if (p.state === 'alive') bodies.push(p);
    for (const e of this.enemies.values()) if (e.kind === 'crab' || e.kind === 'conch') bodies.push(e.body);
    this.level.plats.forEach((d, i) => {
      const pl = this.plats[i] as Plat;
      const riders = bodies.filter((b) => b.onGround && platUnder(this.world, b) === pl);
      const players = riders.filter((b) => [...this.players.values()].includes(b as Player));
      const oldY = pl.y;
      const oldDx = this.platDx[i] as number;
      if (d.kind === 'fake' || d.kind === 'hidden') {
        // the hall of illusions: a hidden floor always holds; a false one gives way under a soldier and comes back later.
        // While MAYASTRA shows things as they are, the false ones hold too.
        if (d.kind === 'fake') {
          const shown = this.tick < this.mayaUntil;
          if (pl.on) {
            this.platStand[i] = players.length && !shown ? (this.platStand[i] as number) + 1 : 0;
            if ((this.platStand[i] as number) > this.ticks(GAME_CONFIG.maya.fallSec)) {
              pl.on = false;
              this.platSink[i] = this.ticks(GAME_CONFIG.maya.backSec);
            }
          } else if (shown || (this.platSink[i] = (this.platSink[i] as number) - 1) <= 0) pl.on = true;
        }
      } else if (d.kind === 'head') {
        // Vishdhar's heads bob up and down out of the lake (faster once he is angry); a landing hurts him
        const k = this.vishdharOf();
        const fast = k && k.phase >= 2 ? 1.6 : 1;
        pl.y = d.y + Math.sin((this.tick / this.tickRate) * 1.6 * fast + i * 2.1) * T * 1.4;
        for (const p of players) {
          const id = (p as Player).id;
          // a landing on a head counts once: the dance goes from head to head
          if (this.headUnder.get(id) !== i && this.lastStomp.get(id) !== i && k) {
            this.stompHead(k, p as Player, i);
            this.lastStomp.set(id, i);
          }
        }
        for (const p of this.players.values())
          if (!players.includes(p) && this.headUnder.get(p.id) === i) this.headUnder.delete(p.id);
        for (const p of players) this.headUnder.set((p as Player).id, i);
      } else if (d.kind === 'stone') {
        if (players.length) this.platStand[i] = (this.platStand[i] as number) + 1;
        else this.platStand[i] = 0;
        let sink = this.platSink[i] as number;
        if ((this.platStand[i] as number) > this.ticks(S.sinkDelaySec)) sink += S.sinkSpeed * this.dt;
        else if (!players.length) sink = Math.max(0, sink - S.riseSpeed * this.dt);
        sink = Math.min(sink, S.goneBelow + 20);
        this.platSink[i] = sink;
        pl.y = d.y + sink;
        pl.on = sink < S.goneBelow && (wy === null || pl.y < wy + 10);
      } else {
        // Boards and sails; once at the far bank and left empty for a while it sails back for anyone behind.
        // It waits at the near bank (up to a few seconds) for squadmates close behind, so nobody is left on the
        // shore watching it go.
        const home = oldDx <= 0;
        if (players.length && !this.boatGo[i]) {
          const near = [...this.players.values()].some(
            (q) => q.state === 'alive' && !players.includes(q) && q.x > d.x0 - 14 * T && q.x < d.x0 + 4,
          );
          this.boatWait[i] = home ? (this.boatWait[i] as number) + 1 : 0;
          if (!home || !near || (this.boatWait[i] as number) > this.ticks(4)) this.boatGo[i] = true;
        } else if (!players.length) this.boatWait[i] = 0;
        const there = d.x0 + oldDx >= d.to;
        // at the far bank everyone steps ashore after a moment (so it can go back for anyone left behind: a
        // squadmate waiting on deck must never keep it from coming back)
        this.boatAshore[i] = there && players.length ? (this.boatAshore[i] as number) + 1 : 0;
        if ((this.boatAshore[i] as number) > this.ticks(1.2)) {
          const x = pl.x1 + 24;
          const top = this.groundTopAt(x);
          if (top < levelHeight(this.level) - T)
            for (const b of players) {
              b.x = x + (players.indexOf(b) % 3) * 10;
              b.y = top;
              b.vy = 0;
            }
          this.boatAshore[i] = 0;
        }
        this.platStand[i] = there && !players.length ? (this.platStand[i] as number) + 1 : 0;
        if ((this.platStand[i] as number) > this.ticks(2)) this.boatGo[i] = false;
        const goal = this.boatGo[i] ? d.to - d.x0 : 0;
        if (oldDx !== goal) {
          const step = S.boatSpeed * this.dt;
          const dx = Math.max(-step, Math.min(step, goal - oldDx));
          this.platDx[i] = oldDx + dx;
          pl.x0 = d.x0 + oldDx + dx;
          pl.x1 = d.x1 + oldDx + dx;
        }
        pl.y = d.y + (wy === null ? 0 : Math.sin(this.tick / 9) * 2);
      }
      const ddx = (this.platDx[i] as number) - oldDx;
      const sailing =
        (d.kind === 'boat' || d.kind === 'chariot' || d.kind === 'vimana') && pl.x0 > d.x0 && pl.x0 < d.to;
      // a soldier who fell in beside a boat under way is pulled back aboard (the boatman's hand)
      if (sailing && pl.on && wy !== null)
        for (const p of this.players.values()) {
          if (p.state !== 'alive' || riders.includes(p) || p.ride >= 0) continue;
          if (p.x < pl.x0 - 12 || p.x > pl.x1 + 12 || p.y < pl.y + 16 || p.y > wy + 3 * T) continue;
          p.x = Math.max(pl.x0 + p.w / 2 + 2, Math.min(pl.x1 - p.w / 2 - 2, p.x));
          p.y = pl.y;
          p.vy = 0;
          p.onGround = true;
        }
      for (const b of riders) {
        if (!pl.on) continue;
        b.y = pl.y;
        b.x += ddx;
        // a boat under way has a rail: nobody walks off it into the sea (jumping is another matter)
        if (sailing) b.x = Math.max(pl.x0 + b.w / 2 + 2, Math.min(pl.x1 - b.w / 2 - 2, b.x));
      }
      if (oldY !== pl.y || ddx) for (const b of riders) if (!pl.on) b.onGround = false;
    });
  }

  /** Makara rider: waits under the sea and leaps across a soldier who comes near, spitting once at the top. */
  private stepMakar(e: Enemy): void {
    const c = E.makar;
    const b = e.body;
    const wy = this.waterY() ?? e.homeY;
    if (e.burst === 1) {
      const k = (this.tick - e.atkStart) / this.ticks(c.leapSec);
      if (k >= 1) {
        e.burst = 0;
        e.nextFire = this.tick + this.ticks(c.leapEvery) + this.rng.int(this.ticks(1));
        b.x = e.leapX;
        b.y = wy + 70;
        return;
      }
      b.x = e.mx + (e.leapX - e.mx) * k;
      b.y = wy + 20 - Math.sin(k * Math.PI) * (c.leapHeight + 20);
      if (this.tick - e.atkStart === Math.round(this.ticks(c.leapSec) / 2)) {
        const target = this.nearestAlive(b.x, b.y, 600);
        if (target)
          this.shoot(b.x, b.y - 10, Math.atan2(target.y - 20 - b.y, target.x - b.x), c.dmg, {
            speed: 260,
            size: 4,
          });
      }
      return;
    }
    b.y = wy + 70;
    const target = this.nearestAlive(b.x, wy, c.sight + 200);
    if (!target || this.tick < e.nextFire || Math.abs(target.x - b.x) > c.sight) return;
    const dir = target.x >= b.x ? 1 : -1;
    b.facing = dir;
    e.burst = 1;
    e.atkStart = this.tick;
    e.mx = b.x - dir * 60;
    e.leapX = target.x + dir * 120;
  }

  /** Crab asura: shell to the front (see the shield code), turns slowly, closes in and lunges with its claws. */
  private stepCrab(e: Enemy): void {
    const c = E.crab;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (this.tick < e.leapX) {
      // mid-lunge
      if (!footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y)) b.vx = 0;
    } else {
      b.vx = 0;
      if (target) {
        const dx = target.x - b.x;
        const face: 1 | -1 = dx >= 0 ? 1 : -1;
        if (face !== b.facing && this.tick >= e.burst) {
          e.burst = this.tick + this.ticks(1.1);
          e.cycle = face;
        }
        if (e.cycle !== 0 && this.tick >= e.burst - 1) {
          b.facing = e.cycle as 1 | -1;
          e.cycle = 0;
        }
        const dist = Math.abs(dx);
        if (dist < 90 && this.tick >= e.nextFire && Math.sign(dx) === b.facing) {
          b.vx = b.facing * c.lungeSpeed;
          e.leapX = this.tick + this.ticks(0.35);
          e.nextFire = this.tick + this.ticks(c.lungeEvery);
        } else if (
          dist > 50 &&
          Math.sign(dx) === b.facing &&
          footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y)
        )
          b.vx = b.facing * c.speed;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Conch blower: a surge of water along the ground (jump it), then a spray at whoever it faces. */
  private stepConch(e: Enemy): void {
    const c = E.conch;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      if (this.tick >= e.nextFire) {
        const w = this.shoot(b.x + b.facing * 14, b.y - 10, b.facing > 0 ? 0 : Math.PI, c.surgeDmg, {
          kind: 'wave',
          speed: 230,
          size: 10,
          life: 2.6,
        });
        w.vy = 0;
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
        e.atkStart = this.tick;
      }
      if (this.tick === e.atkStart + this.ticks(0.45)) {
        const a = Math.atan2(target.y - 20 - (b.y - 26), dx);
        for (const off of [-0.18, 0, 0.18])
          this.shoot(b.x + b.facing * 12, b.y - 26, a + off, c.sprayDmg, { speed: 250 });
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Chhaya: grabs at shadows (her jaws hang open after), surges, spits. */
  private stepChhaya(e: Enemy): void {
    const c = E.chhaya;
    const b = e.body;
    b.facing = -1;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left + T : b.x - 900;
    const front = b.x - b.w / 2;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    if (e.atk === ATTACK.none) {
      if (this.tick < e.nextAtk) return;
      const order =
        ph === 1
          ? [ATTACK.grab, ATTACK.spit, ATTACK.surge, ATTACK.grab, ATTACK.spit]
          : [ATTACK.grab, ATTACK.surge, ATTACK.grab, ATTACK.spit];
      e.atk = order[e.cycle % order.length] as AttackId;
      e.cycle++;
      e.atkStart = this.tick;
      const target = this.nearestAlive(front, b.y - 100, 2000);
      e.atkParam = target ? target.x : front - 200;
      return;
    }
    const t = this.tick - e.atkStart;
    const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
    switch (e.atk) {
      case ATTACK.grab: {
        // the mark follows a soldier's shadow, then holds still for a moment before the hand comes up
        if (t < wind - this.ticks(0.4)) {
          let best: Player | null = null;
          for (const p of this.players.values())
            if (p.state === 'alive' && (!best || Math.abs(p.x - e.atkParam) < Math.abs(best.x - e.atkParam)))
              best = p;
          if (best) e.atkParam += Math.max(-6, Math.min(6, best.x - e.atkParam));
        }
        e.atkParam = Math.max(left, Math.min(front - 20, e.atkParam));
        if (t === wind) {
          this.emit({ e: 'boom', x: r1(e.atkParam), y: r1(b.y), r: c.grabReach });
          for (const p of this.players.values())
            if (p.state === 'alive' && Math.abs(p.x - e.atkParam) < c.grabReach && p.y > b.y - 170)
              this.hurtPlayer(p, c.grabDmg);
          e.mx = this.tick + this.ticks(c.openSec);
        }
        if (t >= wind + this.ticks(0.5)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.surge: {
        if (t === wind) {
          const w = this.shoot(front - 6, b.y - 14, Math.PI, c.surgeDmg, {
            kind: 'wave',
            speed: 290,
            size: 16,
            life: 4,
          });
          w.vy = 0;
        }
        if (t >= wind + this.ticks(0.6)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.spit: {
        if (t === wind) {
          let i = 0;
          for (const p of this.players.values()) {
            if (p.state !== 'alive') continue;
            this.lob(
              front + 20,
              b.y - 220,
              p.x + p.vx * 0.5,
              b.y - 4,
              1.1 + i * 0.15,
              c.spitDmg,
              'bomb',
              c.spitBlast,
            );
            if (++i >= 3) break;
          }
          while (i < 3) {
            const x = left + this.rng.range(40, Math.max(80, front - left - 60));
            this.lob(front + 20, b.y - 220, x, b.y - 4, 1.1 + i * 0.15, c.spitDmg, 'bomb', c.spitBlast);
            i++;
          }
        }
        if (t >= wind + this.ticks(1)) this.endAttack(e, rest);
        break;
      }
      default:
        this.endAttack(e, rest);
    }
  }

  // ------------------------------------------------------------ Vayu Shikhar (saga stage 3)

  /** The stage's gusts (and a boss's storm, which overrides them). */
  private stepGusts(): void {
    if (this.storm) {
      if (this.tick >= this.storm.until) this.storm = null;
      else {
        this.gustDir = this.storm.dir;
        this.gustWarnDir = 0;
        return;
      }
    }
    if (!this.level.gusts || this.phase !== 'playing') {
      this.gustDir = 0;
      return;
    }
    const G = GAME_CONFIG.gusts;
    if (!this.nextGust) this.nextGust = this.tick + this.ticks(G.everySec);
    if (this.gustDir && this.tick >= this.gustEnd) this.gustDir = 0;
    const warn = this.ticks(G.warnSec);
    if (!this.gustDir && this.tick >= this.nextGust - warn && !this.gustWarnDir)
      this.gustWarnDir = this.rng.range(0, 1) < 0.5 ? -1 : 1;
    if (!this.gustDir && this.tick >= this.nextGust) {
      this.gustDir = this.gustWarnDir || 1;
      this.gustWarnDir = 0;
      this.gustEnd = this.tick + this.ticks(G.sec);
      this.nextGust = this.gustEnd + this.ticks(G.everySec + this.rng.range(-G.jitterSec, G.jitterSec));
    }
  }

  /** The wind shoves a soldier (less if they crouch into it); it does not stop at a ledge. */
  private gustPush(p: Player): void {
    if (!this.gustDir || p.state !== 'alive' || (!this.storm && this.resting(p))) return;
    const push =
      (this.storm ? this.storm.push : GAME_CONFIG.gusts.push) * (p.crouch ? GAME_CONFIG.gusts.crouch : 1);
    const vx = p.vx;
    const vy = p.vy;
    const ground = p.onGround;
    p.vx = this.gustDir * push;
    p.vy = 0;
    moveBody(this.world, p, this.dt);
    p.vx = vx;
    p.vy = vy;
    if (ground && !p.onGround) p.vy = Math.max(p.vy, 0);
  }

  /** Wind demon: hangs high on one side, swoops straight through a soldier, sheds feathers while it waits. */
  private stepHarpy(e: Enemy): void {
    const c = E.harpy;
    const b = e.body;
    if (e.burst === 1) {
      const k = (this.tick - e.atkStart) / this.ticks(c.swoopSec);
      if (k >= 1) {
        e.burst = 0;
        e.nextFire = this.tick + this.ticks(c.swoopEvery) + this.rng.int(this.ticks(1));
        return;
      }
      b.x = e.mx + (e.leapX - e.mx) * k;
      b.y = e.my + (e.leapX - e.mx === 0 ? 0 : (e.atkParam - e.my) * Math.sin(k * Math.PI));
      return;
    }
    const target = this.nearestAlive(b.x, b.y, c.sight);
    if (!target) return;
    const side = e.id % 2 ? 200 : -200;
    const hx = target.x + side;
    const hy = target.y - c.hover;
    const step = c.speed * this.dt;
    b.x += Math.max(-step, Math.min(step, hx - b.x));
    b.y += Math.max(-step, Math.min(step, hy - b.y));
    b.facing = target.x >= b.x ? 1 : -1;
    if (this.tick >= e.atkStart + this.ticks(c.featherEvery) && this.tick % 7 === 0) {
      e.atkStart = this.tick;
      const a = Math.atan2(target.y - 20 - b.y, target.x - b.x);
      for (const off of [-0.15, 0, 0.15]) this.shoot(b.x, b.y, a + off, c.dmg, { speed: 260, size: 3 });
    }
    if (this.tick >= e.nextFire && Math.abs(hx - b.x) < 50) {
      e.burst = 1;
      e.atkStart = this.tick;
      e.mx = b.x;
      e.my = b.y;
      e.leapX = target.x - side;
      e.atkParam = target.y - 20;
    }
  }

  /** Boulder roller: on its ledge, heaves boulders down at the nearest soldier. */
  private stepRoller(e: Enemy): void {
    const c = E.roller;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        this.lob(
          b.x + b.facing * 12,
          b.y - 40,
          target.x + target.vx * 0.5,
          target.y - 4,
          1.2,
          c.dmg,
          'shell',
          c.blast,
        );
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
        e.atkStart = this.tick;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Cloud lancer: drifts above the squad on its cloud; raises a javelin of lightning (it glows), then hurls it. */
  private stepLancer(e: Enemy): void {
    const c = E.lancer;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y, c.sight);
    if (!target) return;
    const hx = target.x + (e.id % 2 ? 140 : -140);
    const hy = target.y - c.hover + Math.sin(this.tick / 20 + e.id) * 10;
    const step = c.speed * this.dt;
    b.x += Math.max(-step, Math.min(step, hx - b.x));
    b.y += Math.max(-step, Math.min(step, hy - b.y));
    b.facing = target.x >= b.x ? 1 : -1;
    if (e.burst === 0 && this.tick >= e.nextFire) {
      e.burst = 1;
      e.atkStart = this.tick;
      e.atkParam = 1; // (the snapshot shows the javelin raised)
    }
    if (e.burst === 1 && this.tick - e.atkStart >= this.ticks(c.aimSec)) {
      e.burst = 0;
      e.atkParam = 0;
      const a = Math.atan2(target.y - 18 - (b.y - 20), target.x - b.x);
      this.shoot(b.x, b.y - 20, a, c.dmg, { speed: c.speedShot, size: 5 });
      e.nextFire = this.tick + this.fireEvery(c.fireEvery);
    }
  }

  /** Aandhi on the summit: storms (he is open while he holds one), boulders, javelins, a call to the wind demons. */
  private stepAandhi(e: Enemy): void {
    const c = E.aandhi;
    const b = e.body;
    b.facing = -1;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const front = b.x - b.w / 2;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    if (e.atk === ATTACK.none) {
      if (this.tick < e.nextAtk) return;
      const order =
        ph === 1
          ? [ATTACK.javelins, ATTACK.storm, ATTACK.boulders, ATTACK.javelins, ATTACK.storm]
          : [ATTACK.storm, ATTACK.call, ATTACK.boulders, ATTACK.storm, ATTACK.javelins];
      e.atk = order[e.cycle % order.length] as AttackId;
      e.cycle++;
      e.atkStart = this.tick;
      return;
    }
    const t = this.tick - e.atkStart;
    const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
    switch (e.atk) {
      case ATTACK.storm: {
        if (t === wind)
          this.storm = { dir: -1, push: c.stormPush, until: this.tick + this.ticks(c.stormSec) };
        if (t >= wind && !this.storm) this.endAttack(e, rest);
        break;
      }
      case ATTACK.boulders: {
        if (t === wind) {
          let i = 0;
          for (const p of this.players.values()) {
            if (p.state !== 'alive' || i >= 3) continue;
            this.lob(
              front,
              b.y - 110,
              p.x + p.vx * 0.5,
              b.y - 4,
              1.1 + i * 0.15,
              c.boulderDmg,
              'shell',
              c.boulderBlast,
            );
            i++;
          }
          for (; i < 3; i++) {
            const x = left + this.rng.range(40, Math.max(80, front - left - 60));
            this.lob(front, b.y - 110, x, b.y - 4, 1.1 + i * 0.15, c.boulderDmg, 'shell', c.boulderBlast);
          }
        }
        if (t >= wind + this.ticks(0.9)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.javelins: {
        const gap = this.ticks(0.3);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < 3) {
          const target = this.nearestAlive(front, b.y - 60, 1400);
          if (target) {
            const a = Math.atan2(target.y - 18 - (b.y - 100), target.x - front);
            this.shoot(front, b.y - 100, a, c.javelinDmg, { speed: 480, size: 5 });
          }
        }
        if (t >= wind + gap * 3) this.endAttack(e, rest);
        break;
      }
      case ATTACK.call: {
        if (t === wind) {
          let n = 0;
          for (const q of this.enemies.values()) if (q.kind === 'harpy' && q.fromBoss) n++;
          for (let i = n; i < 2; i++)
            this.spawnAwake('harpy', front - 200 - i * 120, b.y - 220, e.arena, true);
        }
        if (t >= wind + this.ticks(0.5)) this.endAttack(e, rest);
        break;
      }
      default:
        this.endAttack(e, rest);
    }
  }

  // ------------------------------------------------------------ Naag Lok (saga stage 4)

  /** The head of Vishdhar's a soldier should land on next (not the one they last danced on). Computer players use it. */
  nextHead(p: Player): Plat | null {
    let best: Plat | null = null;
    let bd = Infinity;
    this.level.plats.forEach((d, i) => {
      if (d.kind !== 'head' || this.lastStomp.get(p.id) === i) return;
      const pl = this.plats[i] as Plat;
      const dist = Math.abs((pl.x0 + pl.x1) / 2 - p.x);
      if (dist < bd) {
        bd = dist;
        best = pl;
      }
    });
    return best;
  }

  private vishdharOf(): Enemy | null {
    for (const e of this.enemies.values()) if (e.kind === 'vishdhar' && e.awake && e.hp > 0) return e;
    return null;
  }

  /** A soldier landed on one of Vishdhar's heads: it costs him, and the head dips. */
  private stompHead(k: Enemy, p: Player, head: number): void {
    this.damageEnemy(k, k.maxHp * E.vishdhar.stomp, p.id, p.x, p.y, 'melee');
    this.emit({ e: 'boom', x: r1(p.x), y: r1(p.y), r: 30 });
    p.vy = -380; // the head throws the dancer up again
    p.onGround = false;
    void head;
  }

  /** Naga warrior: slithers low toward the nearest soldier and strikes from close. */
  private stepSerpent(e: Enemy): void {
    const c = E.serpent;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) < c.strikeRange && this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.ticks(c.strikeEvery);
        e.atkStart = this.tick;
        if (Math.abs(target.y - b.y) < 40) this.hurtPlayer(target, c.dmg);
      } else if (Math.abs(dx) > 30 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
        b.vx = b.facing * c.speed;
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Wall cobra: coiled on its ledge, spits venom in arcs at the nearest soldier. */
  private stepSpitter(e: Enemy): void {
    const c = E.spitter;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        this.lob(
          b.x + b.facing * 10,
          b.y - 26,
          target.x + target.vx * 0.4,
          target.y - 4,
          0.9,
          c.dmg,
          'bomb',
          c.blast,
        );
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Serpent egg: once a soldier comes near it starts to crack, and hatches two naga warriors unless broken. */
  private stepEgg(e: Enemy): void {
    const c = E.egg;
    const b = e.body;
    if (!e.atkStart) {
      if (this.nearestAlive(b.x, b.y - b.h / 2, c.sight)) e.atkStart = this.tick;
      return;
    }
    e.atkParam = Math.round(((this.tick - e.atkStart) / this.ticks(c.hatchSec)) * 100);
    if (this.tick - e.atkStart >= this.ticks(c.hatchSec)) {
      this.enemies.delete(e.id);
      this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 10), r: 24 });
      for (const dx of [-14, 14]) this.spawnAwake('serpent', b.x + dx, b.y, e.arena, e.fromBoss);
    }
  }

  /** Vishdhar: venom from his hoods, a head lunging low across the lake, a rain of poison. */
  private stepVishdhar(e: Enemy): void {
    const c = E.vishdhar;
    const b = e.body;
    b.facing = -1;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const front = b.x - b.w / 2;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    if (e.atk === ATTACK.none) {
      if (this.tick < e.nextAtk) return;
      const order =
        ph === 1
          ? [ATTACK.venom, ATTACK.lunge, ATTACK.poison, ATTACK.venom]
          : [ATTACK.lunge, ATTACK.venom, ATTACK.poison, ATTACK.lunge, ATTACK.venom];
      e.atk = order[e.cycle % order.length] as AttackId;
      e.cycle++;
      e.atkStart = this.tick;
      return;
    }
    const t = this.tick - e.atkStart;
    const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
    switch (e.atk) {
      case ATTACK.venom: {
        // each head spits at the nearest soldier, one after another
        const heads = this.level.plats
          .map((d, i) => ({ d, p: this.plats[i] as Plat }))
          .filter((h) => h.d.kind === 'head');
        const gap = this.ticks(0.25);
        const k = (t - wind) / gap;
        if (t >= wind && (t - wind) % gap === 0 && k < heads.length * (ph === 2 ? 2 : 1)) {
          const h = heads[k % heads.length];
          if (h) {
            const hx = (h.p.x0 + h.p.x1) / 2;
            const target = this.nearestAlive(hx, h.p.y, 1200);
            if (target)
              this.shoot(
                hx,
                h.p.y - 30,
                Math.atan2(target.y - 18 - (h.p.y - 30), target.x - hx),
                c.venomDmg,
                {
                  speed: 300,
                  size: 4,
                },
              );
          }
        }
        if (t >= wind + gap * heads.length * (ph === 2 ? 2 : 1)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.lunge: {
        // a fourth head shoots out of the lake and sweeps low across it: jump onto a head or the bank
        if (t === wind) {
          const w = this.shoot(front, b.y - 30, Math.PI, c.lungeDmg, {
            kind: 'wave',
            speed: 420,
            size: 18,
            life: 2.6,
          });
          w.vy = 0;
        }
        if (t >= wind + this.ticks(0.8)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.poison: {
        if (t === wind) {
          const n = ph === 2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const x = left + 60 + ((front - left - 120) * (i + this.rng.range(0, 0.8))) / n;
            this.lob(front, b.y - 140, x, b.y - 60, 1.1 + i * 0.1, c.poisonDmg, 'bomb', c.poisonBlast);
          }
        }
        if (t >= wind + this.ticks(1)) this.endAttack(e, rest);
        break;
      }
      default:
        this.endAttack(e, rest);
    }
  }

  // ------------------------------------------------------------ Maya Nagri (saga stage 5)

  /** Mirror shade: keeps to where the nearest soldier's reflection would be across its mirror, and shoots back. */
  private stepMirror(e: Enemy): void {
    const c = E.mirror;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      const want = Math.max(e.homeX - c.span, Math.min(e.homeX + c.span, 2 * e.homeX - target.x));
      const dx = want - b.x;
      if (Math.abs(dx) > 6 && footingBelow(this.world, b.x + Math.sign(dx) * (b.w / 2 + 4), b.y))
        b.vx = Math.sign(dx) * c.speed;
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        this.shoot(
          b.x + b.facing * 14,
          b.y - 22,
          Math.atan2(target.y - 18 - (b.y - 22), target.x - b.x),
          c.dmg,
        );
        e.nextFire = this.tick + this.fireEvery(c.fireEvery);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Dancer: vanishes, reappears just behind a soldier, strikes after a beat, and vanishes again. */
  private stepDancer(e: Enemy): void {
    const c = E.dancer;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (!target) return;
    if (e.burst === 1 && this.tick - e.atkStart >= this.ticks(c.strikeSec)) {
      e.burst = 0;
      if (Math.abs(target.x - b.x) < 46 && Math.abs(target.y - b.y) < 40) this.hurtPlayer(target, c.dmg);
      // gone again, somewhere off to one side
      const away = b.x + (this.rng.range(0, 1) < 0.5 ? -1 : 1) * this.rng.range(140, 220);
      if (footingBelow(this.world, away, b.y)) b.x = away;
      this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 17), r: 18 });
      e.nextFire = this.tick + this.ticks(c.blinkEvery);
    }
    if (e.burst === 0 && this.tick >= e.nextFire) {
      const bx = target.x - target.facing * 40;
      if (footingBelow(this.world, bx, target.y)) {
        b.x = bx;
        b.y = target.y;
        b.facing = target.facing;
        e.burst = 1;
        e.atkStart = this.tick;
        this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 17), r: 18 });
      } else e.nextFire = this.tick + this.ticks(0.5);
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    b.vx = 0;
    moveBody(this.world, b, this.dt);
  }

  /** Painted guard: a picture on the wall until a soldier comes close; then it steps out and lunges with its spear. */
  private stepPainting(e: Enemy): void {
    const c = E.painting;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, 600);
    if (e.burst === 0) {
      if (target && Math.abs(target.x - b.x) < c.wake && Math.abs(target.y - b.y) < 80) {
        e.burst = 1;
        e.nextFire = this.tick + this.ticks(0.6);
        this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 20), r: 22 });
      }
      return;
    }
    b.vx = 0;
    if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      if (this.tick < e.leapX) b.vx = b.facing * c.lungeSpeed;
      else if (Math.abs(dx) < 110 && this.tick >= e.nextFire) {
        e.leapX = this.tick + this.ticks(0.3);
        e.nextFire = this.tick + this.ticks(c.lungeEvery);
      } else if (Math.abs(dx) > 40 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
        b.vx = b.facing * c.speed;
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Darpan-asur: a sweeping beam, a rain of shards, a show of reflections (two shades) after which it is dull. */
  private stepDarpan(e: Enemy): void {
    const c = E.darpan;
    const b = e.body;
    b.facing = -1;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const front = b.x - b.w / 2;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    if (e.atk === ATTACK.none) {
      if (this.tick < e.nextAtk) return;
      const order =
        ph === 1
          ? [ATTACK.beam, ATTACK.shards, ATTACK.show, ATTACK.beam]
          : [ATTACK.show, ATTACK.beam, ATTACK.shards, ATTACK.beam, ATTACK.show];
      e.atk = order[e.cycle % order.length] as AttackId;
      e.cycle++;
      e.atkStart = this.tick;
      return;
    }
    const t = this.tick - e.atkStart;
    const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
    switch (e.atk) {
      case ATTACK.beam: {
        // a line of light sweeping from high to low across the hall
        const len = this.ticks(1.2);
        if (t >= wind && t < wind + len && (t - wind) % 2 === 0) {
          const k = (t - wind) / len;
          const a = Math.PI + 0.45 - k * 0.75;
          this.shoot(front, b.y - 150, a, c.beamDmg, { speed: 620, size: 5, life: 1.4 });
        }
        if (t >= wind + len) this.endAttack(e, rest);
        break;
      }
      case ATTACK.shards: {
        if (t === wind) {
          const n = ph === 2 ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const x = left + 40 + ((front - left - 80) * (i + this.rng.range(0, 0.9))) / n;
            this.lob(front, b.y - 210, x, b.y - 4, 1.0 + i * 0.1, c.shardDmg, 'bomb', c.shardBlast);
          }
        }
        if (t >= wind + this.ticks(1)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.show: {
        if (t === wind) {
          let n = 0;
          for (const q of this.enemies.values()) if (q.kind === 'mirror' && q.fromBoss) n++;
          for (let i = n; i < 2; i++) {
            const m = this.spawnAwake('mirror', front - 160 - i * 200, b.y, e.arena, true);
            m.homeX = front - 260;
          }
          e.mx = this.tick + this.ticks(c.dullSec);
        }
        if (t >= wind + this.ticks(0.5)) this.endAttack(e, rest);
        break;
      }
      default:
        this.endAttack(e, rest);
    }
  }

  // ------------------------------------------------------------ Bhasm Parvat (saga stage 6)

  /**
   * The lava rising from below: it creeps up, never more than `maxLag` under the lowest soldier, waits under a rest
   * stop and under the boss's floor, burns whoever it touches and throws anyone caught in it up onto ground.
   */
  private stepLava(): void {
    if (!this.level.lava || this.phase !== 'playing') return;
    const C = GAME_CONFIG.lava;
    const alive = [...this.players.values()].filter((p) => p.state === 'alive');
    if (!alive.length) return;
    const low = Math.max(...alive.map((p) => p.y));
    if (!this.lavaOn) {
      if (this.tick < this.lavaStart) return;
      this.lavaOn = true;
      this.lavaY = low + C.maxLag;
    }
    let floor = -Infinity; // the lava may not rise above this
    const rear = Math.min(...alive.map((p) => p.x));
    for (const r of this.level.rests)
      if (rear < r.x1 + 2 * T) {
        const g = this.groundAhead((r.x0 + r.x1) / 2);
        floor = Math.max(floor, g.y + 2 * T);
      }
    const fin = finalArena(this.level);
    if (fin && this.arenaState[fin.id]) floor = Math.max(floor, fin.floor + T);
    const speed = C.speed[this.settings.difficulty];
    this.lavaY = Math.max(floor, Math.min(this.lavaY - speed * this.dt, low + C.maxLag));
    for (const p of alive) {
      if (p.y < this.lavaY - 2) continue;
      this.hurtPlayer(p, C.dps * 0.35);
      if (p.y > this.lavaY + 30 && p.state === 'alive') {
        const spot = this.groundAbove(p.x, this.lavaY);
        p.x = spot.x;
        p.y = spot.y;
        p.vx = p.vy = 0;
        p.lastSafeX = p.x;
        p.lastSafeY = p.y;
      }
    }
    for (const e of [...this.enemies.values()])
      if (!isBoss(e.kind) && e.body.y > this.lavaY + 10 && e.kind !== 'pret') this.enemies.delete(e.id);
  }

  /** The nearest ground above `top` around column x (searching outward), for lifting a soldier out of the lava. */
  private groundAbove(x: number, top: number): { x: number; y: number } {
    const c0 = Math.floor(x / T);
    for (let d = 0; d < 40; d++)
      for (const c of [c0 + d, c0 - d]) {
        for (let r = Math.floor(top / T) - 1; r >= 1; r--) {
          const t = tileAt(this.level, c, r);
          if ((t === Tile.Solid || t === Tile.OneWay) && tileAt(this.level, c, r - 1) === Tile.Empty)
            return { x: c * T + T / 2, y: r * T };
        }
      }
    return this.groundAhead(x);
  }

  /** Ghost: drifts straight through rock toward the nearest soldier. */
  private stepPret(e: Enemy): void {
    const c = E.pret;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (!target) return;
    const dx = target.x - b.x;
    const dy = target.y - 10 - b.y;
    const d = Math.hypot(dx, dy) || 1;
    b.x += (dx / d) * c.speed * this.dt;
    b.y += (dy / d) * c.speed * this.dt + Math.sin(this.tick / 12 + e.id) * 0.4;
    b.facing = dx >= 0 ? 1 : -1;
  }

  /** Ash golem: plods in and punches; brought down by plain weapons, it rises again (see damageEnemy). */
  private stepGolem(e: Enemy): void {
    const c = E.golem;
    const b = e.body;
    b.vx = 0;
    if (e.burst === 1) {
      if (this.tick - e.atkStart >= this.ticks(c.riseSec)) {
        e.burst = 0;
        e.hp = e.maxHp;
        this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 20), r: 30 });
      }
    } else {
      const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
      if (target) {
        const dx = target.x - b.x;
        b.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) < 46 && this.tick >= e.nextFire) {
          e.nextFire = this.tick + this.ticks(c.punchEvery);
          if (Math.abs(target.y - b.y) < 50) this.hurtPlayer(target, c.dmg);
        } else if (Math.abs(dx) > 30 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
          b.vx = b.facing * c.speed;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Skull-lamp carrier: keeps its distance and calls up a ghost now and then (no more than three about). */
  private stepLantern(e: Enemy): void {
    const c = E.lantern;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    b.vx = 0;
    if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      if (Math.abs(dx) > 260 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
        b.vx = b.facing * c.speed;
      if (this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.ticks(c.callEvery);
        let n = 0;
        for (const q of this.enemies.values()) if (q.kind === 'pret') n++;
        if (n < 3) this.spawnAwake('pret', b.x, b.y - 40, e.arena, e.fromBoss);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Nartaki's dance: the pose Raakhasur is showing right now (0 up, 1 down, 2 left, 3 right), or null. */
  dancePose(e: Enemy): number | null {
    if (e.kind !== 'raakhasur' || e.atk !== ATTACK.dance) return null;
    const c = E.raakhasur;
    const t = this.tick - e.atkStart - this.ticks(ATTACK_WINDUP[ATTACK.dance] ?? 1);
    if (t < 0) return null;
    const k = Math.floor(t / this.ticks(c.beatSec));
    if (k >= c.steps) return null;
    return Math.floor(e.atkParam / 4 ** k) % 4;
  }

  /** Raakhasur: rushes to touch a head, sends ash along the ground, rains ash, and (now and then) Nartaki's dance. */
  private stepRaakhasur(e: Enemy): void {
    const c = E.raakhasur;
    const b = e.body;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const right = fin ? fin.right : b.x + 300;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    const target = this.nearestAlive(b.x, b.y - 50, 2000);
    b.vx = 0;
    if (e.atk === ATTACK.none) {
      if (target && this.tick >= e.mx) {
        b.facing = target.x >= b.x ? 1 : -1;
        if (Math.abs(target.x - b.x) > 140) b.vx = b.facing * c.speed;
      }
      if (this.tick >= e.nextAtk && this.tick >= e.mx) {
        const order =
          ph === 1
            ? [ATTACK.rush, ATTACK.ash, ATTACK.dance, ATTACK.rush, ATTACK.rain]
            : [ATTACK.rush, ATTACK.dance, ATTACK.ash, ATTACK.rain, ATTACK.rush, ATTACK.dance];
        e.atk = order[e.cycle % order.length] as AttackId;
        e.cycle++;
        e.atkStart = this.tick;
        e.burst = 0;
        if (e.atk === ATTACK.dance) {
          let seq = 0;
          for (let k = 0; k < c.steps; k++) seq += this.rng.int(4) * 4 ** k;
          e.atkParam = seq;
          e.my = 0;
        }
      }
    } else {
      const t = this.tick - e.atkStart;
      const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
      switch (e.atk) {
        case ATTACK.rush: {
          if (t === wind && target) e.leapX = target.x;
          if (t >= wind) {
            const dir = Math.sign(e.leapX - b.x) || b.facing;
            b.facing = dir as 1 | -1;
            b.vx = dir * c.rushSpeed;
            // his hand on a head
            for (const p of this.players.values())
              if (
                p.state === 'alive' &&
                Math.abs(p.x - b.x) < 36 &&
                Math.abs(p.y - b.y) < 60 &&
                e.burst === 0
              ) {
                this.hurtPlayer(p, c.touchDmg);
                this.emit({ e: 'boom', x: r1(p.x), y: r1(p.y - 34), r: 30 });
                e.burst = 1;
              }
            if (Math.abs(e.leapX - b.x) < 12 || t > wind + this.ticks(1.4) || e.burst === 1)
              this.endAttack(e, rest);
          }
          break;
        }
        case ATTACK.ash: {
          if (t === wind)
            for (const dir of [-1, 1]) {
              const w = this.shoot(b.x + dir * 20, b.y - 12, dir > 0 ? 0 : Math.PI, c.ashDmg, {
                kind: 'wave',
                speed: 280,
                size: 13,
                life: 3,
              });
              w.vy = 0;
            }
          if (t >= wind + this.ticks(0.6)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.rain: {
          if (t === wind)
            for (let i = 0; i < (ph === 2 ? 6 : 4); i++) {
              const x = left + 40 + this.rng.range(0, Math.max(60, right - left - 80));
              this.lob(b.x, b.y - 120, x, b.y - 4, 1.0 + i * 0.12, c.rainDmg, 'bomb', c.rainBlast);
            }
          if (t >= wind + this.ticks(1)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.dance: {
          // each beat, any soldier holding the pose he shows counts it; all steps held: he copies the last pose,
          // his hand on his own head, and burns
          const beat = this.ticks(c.beatSec);
          if (t >= wind) {
            const k = Math.floor((t - wind) / beat);
            const pose = Math.floor(e.atkParam / 4 ** k) % 4;
            if (k < c.steps && (t - wind) % beat === beat - 1) {
              const held = [...this.players.values()].some((p) => {
                if (p.state !== 'alive') return false;
                const i = p.input;
                return pose === 0 ? i.my < 0 : pose === 1 ? i.my > 0 : pose === 2 ? i.mx < 0 : i.mx > 0;
              });
              if (held) e.my++;
            }
            if (k >= c.steps) {
              if (e.my >= c.steps) {
                this.damageEnemy(e, e.maxHp * c.selfBurn, '', b.x, b.y - 100, 'astra');
                this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 100), r: 80 });
                e.mx = this.tick + this.ticks(2.5); // reeling: wide open
              } else {
                for (const dir of [-1, 1]) {
                  const w = this.shoot(b.x + dir * 20, b.y - 12, dir > 0 ? 0 : Math.PI, c.ashDmg, {
                    kind: 'wave',
                    speed: 320,
                    size: 13,
                    life: 3,
                  });
                  w.vy = 0;
                }
              }
              this.endAttack(e, rest);
            }
          }
          break;
        }
        default:
          this.endAttack(e, rest);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    b.x = Math.max(left + b.w / 2, Math.min(right - b.w / 2, b.x));
    moveBody(this.world, b, this.dt);
  }

  // ------------------------------------------------------------ Samarpan Maidan (saga stage 7)

  /** Archer: keeps its ground and lofts a volley of arrows in an arc at a soldier, landing around them. */
  private stepArcher(e: Enemy): void {
    const c = E.archer;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.fireEvery(c.volleyEvery);
        e.atkStart = this.tick; // drawn: the bow drawn back
        const lead = target.vx * 0.5;
        for (let i = 0; i < c.arrows; i++) {
          const tx = target.x + lead + (i - (c.arrows - 1) / 2) * 46;
          this.lob(b.x + b.facing * 10, b.y - 30, tx, target.y - 6, 1.05 + i * 0.06, c.dmg, 'arrow', 0);
        }
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /**
   * War elephant: plods toward the squad; a soldier ahead on its level makes it trumpet (`burst` 1) and charge
   * (`burst` 2) until well past them, against a wall or at a ledge, then it stands blowing (`burst` 0, `nextFire`).
   */
  private stepElephant(e: Enemy): void {
    const c = E.elephant;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    const t = this.tick - e.atkStart;
    if (e.burst === 1) {
      if (t >= this.ticks(c.windSec)) {
        e.burst = 2;
        e.atkStart = this.tick;
      }
    } else if (e.burst === 2) {
      const ahead = b.x + b.facing * (b.w / 2 + 6);
      const blocked =
        solidAtPoint(this.world, ahead, b.y - 10) ||
        !footingBelow(this.world, ahead, b.y) ||
        t > this.ticks(c.chargeSec);
      if (blocked || (b.facing > 0 ? b.x > e.leapX : b.x < e.leapX)) {
        e.burst = 0;
        e.nextFire = this.tick + this.ticks(c.restSec);
      } else {
        b.vx = b.facing * c.chargeSpeed;
        for (const p of this.players.values())
          if (
            p.state === 'alive' &&
            Math.abs(p.x - b.x) < b.w / 2 + 8 &&
            p.y > b.y - b.h &&
            p.y - P.height < b.y
          ) {
            if (this.tick >= p.invulnUntil && !this.dodging(p)) {
              this.hurtPlayer(p, c.trample);
              p.vx = b.facing * 420;
              p.vy = -380;
            }
          }
      }
    } else if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      const level = Math.abs(target.y - b.y) < 40;
      if (this.tick >= e.nextFire && level && Math.abs(dx) < c.sight) {
        e.burst = 1;
        e.atkStart = this.tick;
        e.leapX = target.x + b.facing * 220;
      } else if (Math.abs(dx) > 120 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
        b.vx = b.facing * c.speed;
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** War drummer: beats its drum; each beat hurries every foe within reach into its next shot. */
  private stepDrummer(e: Enemy): void {
    const c = E.drummer;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.ticks(c.beatEvery);
        e.atkStart = this.tick;
        for (const q of this.enemies.values()) {
          if (q === e || isBoss(q.kind) || !q.awake) continue;
          if (Math.abs(q.body.x - b.x) > c.reach || Math.abs(q.body.y - b.y) > c.reach) continue;
          q.nextFire = Math.min(q.nextFire, this.tick + this.ticks(0.25));
        }
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /**
   * Maniyodha: keeps a bowshot away; a fan of arrows, an agnibaan arrow that bursts into fire running along the
   * ground both ways, and a leaping sword cut at a soldier who comes too close. SAMARPANASTRA is the arena's rule
   * (stepBossRule): while he calls it, nothing else.
   */
  private stepManiyodha(e: Enemy): void {
    const c = E.maniyodha;
    const b = e.body;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const right = fin ? fin.right : b.x + 300;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    const target = this.nearestAlive(b.x, b.y - 50, 2000);
    b.vx = 0;
    if (e.atk === ATTACK.none) {
      if (target) {
        const dx = target.x - b.x;
        b.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) > 420) b.vx = b.facing * c.speed;
        else if (Math.abs(dx) < 200) b.vx = -b.facing * c.speed * 0.8;
      }
      if (this.tick >= e.nextAtk && target) {
        const near = Math.abs(target.x - b.x) < 220;
        const order =
          ph === 1
            ? [ATTACK.fan, ATTACK.agnibaan, ATTACK.fan]
            : [ATTACK.fan, ATTACK.agnibaan, ATTACK.fan, ATTACK.agnibaan];
        const atk = near ? ATTACK.cleave : (order[e.cycle % order.length] as AttackId);
        if (!near) e.cycle++;
        this.startAttack(e, atk);
        if (atk === ATTACK.cleave) {
          e.leapX = Math.max(left + 30, Math.min(right - 30, target.x));
          e.mx = b.x;
        }
      }
    } else {
      const t = this.tick - e.atkStart;
      const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
      switch (e.atk) {
        case ATTACK.fan: {
          const n = ph === 2 ? 2 : 1;
          const gap = this.ticks(0.35);
          if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < n && target) {
            const a0 = Math.atan2(target.y - 30 - (b.y - 60), target.x - b.x);
            for (let i = -2; i <= 2; i++)
              this.shoot(b.x + b.facing * 16, b.y - 60, a0 + i * 0.12, c.arrowDmg, {
                kind: 'arrow',
                speed: 420,
                size: 3,
                life: 2,
              });
          }
          if (t >= wind + gap * n) this.endAttack(e, rest);
          break;
        }
        case ATTACK.agnibaan: {
          if (t === wind && target)
            this.lob(b.x, b.y - 70, target.x, target.y - 4, 0.9, c.fireDmg, 'meteor', c.fireBlast);
          // where it lands, fire runs along the ground both ways
          if (t === wind + this.ticks(0.9) && target)
            for (const dir of [-1, 1]) {
              const w = this.shoot(target.x, target.y - 12, dir > 0 ? 0 : Math.PI, c.fireDmg * 0.7, {
                kind: 'flame',
                speed: 230,
                size: 12,
                life: 1.6,
              });
              w.vy = 0;
            }
          if (t >= wind + this.ticks(1.1)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.cleave: {
          // a leap and a downward cut where the soldier stood
          const air = this.ticks(0.55);
          if (t >= wind && t < wind + air) {
            const k = (t - wind) / air;
            b.x = e.mx + (e.leapX - e.mx) * k;
            b.y = e.homeY - Math.sin(k * Math.PI) * 120;
          }
          if (t === wind + air) {
            b.x = e.leapX;
            b.y = e.homeY;
            this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 10), r: 50 });
            for (const p of this.players.values())
              if (p.state === 'alive' && Math.abs(p.x - b.x) < 70 && Math.abs(p.y - b.y) < 60)
                this.hurtPlayer(p, c.cleaveDmg);
          }
          if (t >= wind + air + this.ticks(0.4)) this.endAttack(e, rest);
          break;
        }
        default:
          this.endAttack(e, rest);
      }
    }
    if (e.atk !== ATTACK.cleave) b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    else b.vy = 0;
    b.x = Math.max(left + b.w / 2, Math.min(right - b.w / 2, b.x));
    if (e.atk !== ATTACK.cleave) moveBody(this.world, b, this.dt);
  }

  // ------------------------------------------------------------ Chakra Durg (saga stage 8)

  /** The bhanwarvyuh closes behind the squad: its wall follows the rearmost soldier and never opens again. */
  private stepVyuh(): void {
    if (!this.level.vyuh || this.phase !== 'playing') return;
    const alive = [...this.players.values()].filter((p) => p.state === 'alive');
    if (!alive.length) return;
    const rear = Math.min(...alive.map((p) => p.x));
    this.vyuhX = Math.max(this.vyuhX, rear - GAME_CONFIG.vyuh.lag);
    for (const p of alive)
      if (p.x < this.vyuhX + p.w / 2) {
        p.x = this.vyuhX + p.w / 2;
        if (p.vx < 0) p.vx = 0;
      }
  }

  /** Discus thrower: its disc flies out at a soldier and turns back to its hand (hitting on the way back too). */
  private stepChakri(e: Enemy): void {
    const c = E.chakri;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    // its disc in flight: turn it home once it has flown out
    const disc = e.atkParam ? this.bullets.find((q) => q.id === e.atkParam) : undefined;
    if (disc) {
      if (this.tick - e.atkStart >= this.ticks(c.outSec)) {
        const a = Math.atan2(b.y - 26 - disc.y, b.x - disc.x);
        const sp = Math.hypot(disc.vx, disc.vy);
        disc.vx = Math.cos(a) * sp;
        disc.vy = Math.sin(a) * sp;
        if (Math.hypot(b.x - disc.x, b.y - 26 - disc.y) < 18) {
          disc.expires = this.tick;
          e.atkParam = 0;
        }
      }
    } else e.atkParam = 0;
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (!e.atkParam && this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.fireEvery(c.throwEvery);
        e.atkStart = this.tick;
        const a = Math.atan2(target.y - 22 - (b.y - 26), target.x - b.x);
        const d = this.shoot(b.x + b.facing * 10, b.y - 26, a, c.dmg, {
          kind: 'chakra',
          speed: 330,
          size: 8,
          life: 3,
        });
        d.pierce = true;
        e.atkParam = d.id;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Maharathi: closes in, crouches (`burst` 1) and lunges through a soldier (`burst` 2). */
  private stepRathi(e: Enemy): void {
    const c = E.rathi;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    const t = this.tick - e.atkStart;
    if (e.burst === 1) {
      if (t >= this.ticks(c.windSec)) {
        e.burst = 2;
        e.atkStart = this.tick;
        e.my = 0; // nobody hit yet
      }
    } else if (e.burst === 2) {
      const ahead = b.x + b.facing * (b.w / 2 + 4);
      if (
        t >= this.ticks(c.lungeSec) ||
        solidAtPoint(this.world, ahead, b.y - 10) ||
        !footingBelow(this.world, ahead, b.y)
      ) {
        e.burst = 0;
        e.nextFire = this.tick + this.ticks(c.coolSec);
      } else {
        b.vx = b.facing * c.lungeSpeed;
        for (const p of this.players.values())
          if (p.state === 'alive' && !e.my && Math.abs(p.x - b.x) < 26 && Math.abs(p.y - b.y) < 44) {
            this.hurtPlayer(p, c.dmg);
            e.my = 1;
          }
      }
    } else if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      if (this.tick >= e.nextFire && Math.abs(dx) < c.reach && Math.abs(target.y - b.y) < 40) {
        e.burst = 1;
        e.atkStart = this.tick;
      } else if (Math.abs(dx) > 90 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
        b.vx = b.facing * c.speed;
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Net thrower: lobs a weighted net at a soldier; it slows whoever it lands on. */
  private stepNetter(e: Enemy): void {
    const c = E.netter;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.fireEvery(c.throwEvery);
        e.atkStart = this.tick;
        this.lob(b.x, b.y - 30, target.x + target.vx * 0.5, target.y - 16, 0.95, c.dmg, 'net', 0);
        const n = this.bullets[this.bullets.length - 1];
        if (n) n.size = 14;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** A great discus covers the sun: Suryakavach's guard is down until `mx`, and the sun comes back after. */
  private eclipse(e: Enemy): void {
    const c = E.suryakavach;
    if (this.tick < e.mx) return;
    e.mx = this.tick + this.ticks(c.eclipseSec);
    e.my = e.mx + this.ticks(c.sunSec);
    this.emit({ e: 'boom', x: r1(e.body.x), y: r1(e.body.y - 120), r: 60 });
  }

  /**
   * Suryakavach at the gate of the bhanwarvyuh: while the sun shines he cannot be hurt (his boon) and calls the
   * maharathis; a mace blow sends a shock along the ground both ways, spears come down in an arc. Every `sunSec` the
   * sun is covered for `eclipseSec` (`mx`: the eclipse lasts until then; `my`: the next one), and he is open.
   */
  private stepSuryakavach(e: Enemy): void {
    const c = E.suryakavach;
    const b = e.body;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const front = b.x - b.w / 2;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    if (e.my <= 0) e.my = this.tick + this.ticks(c.sunSec * 0.8);
    if (this.tick >= e.my) this.eclipse(e);
    const sun = this.tick >= e.mx;
    b.facing = -1;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - 50, 2000);
    if (e.atk === ATTACK.none) {
      if (this.tick >= e.nextAtk && target) {
        const order = sun
          ? [ATTACK.mace, ATTACK.rathis, ATTACK.spears]
          : ph === 1
            ? [ATTACK.mace, ATTACK.spears]
            : [ATTACK.spears, ATTACK.mace, ATTACK.spears];
        this.startAttack(e, order[e.cycle % order.length] as AttackId);
        e.cycle++;
      }
    } else {
      const t = this.tick - e.atkStart;
      const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
      switch (e.atk) {
        case ATTACK.mace: {
          if (t === wind) {
            this.emit({ e: 'boom', x: r1(front - 10), y: r1(b.y - 6), r: 50 });
            const w = this.shoot(front - 10, b.y - 12, Math.PI, c.maceDmg, {
              kind: 'wave',
              speed: ph === 2 ? 330 : 280,
              size: 13,
              life: 3.5,
            });
            w.vy = 0;
          }
          if (t >= wind + this.ticks(0.5)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.spears: {
          if (t === wind && target) {
            const n = ph === 2 ? 5 : 3;
            for (let i = 0; i < n; i++) {
              const x = Math.max(left + 30, target.x + (i - (n - 1) / 2) * 70);
              this.lob(front, b.y - 90, x, b.y - 4, 0.9 + i * 0.08, c.spearDmg, 'arrow', c.spearBlast);
            }
          }
          if (t >= wind + this.ticks(0.9)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.rathis: {
          if (t === wind) {
            let n = 0;
            for (const q of this.enemies.values()) if (q.kind === 'rathi' && q.fromBoss) n++;
            for (let i = n; i < 2; i++) this.spawnAwake('rathi', front - 120 - i * 160, b.y, e.arena, true);
          }
          if (t >= wind + this.ticks(0.4)) this.endAttack(e, rest);
          break;
        }
        default:
          this.endAttack(e, rest);
      }
    }
    // rooted at the gate (and bodies are kept left of his front: he does not move himself)
    b.vy = 0;
  }

  // ------------------------------------------------------------ Dwand Bhoomi (saga stage 9)

  /** The wall at the back of a final arena (where the room really ends: past `right`, against the boss's wall). */
  private arenaWall(a: ArenaDef): number {
    for (let c = Math.floor(a.right / T); c < this.level.cols; c++)
      if (tileAt(this.level, c, Math.floor(a.floor / T) - 1) !== Tile.Empty) return c * T;
    return a.right;
  }

  /** The soldier a wrestler holds (seat + 1 in `atkParam`), if any. */
  private heldBy(e: Enemy): Player | undefined {
    if (!e.atkParam) return undefined;
    for (const p of this.players.values()) if (p.slot + 1 === e.atkParam) return p;
    return undefined;
  }

  /**
   * Wrestler: closes in and grabs (`burst` 1): the soldier is held in its arms, squeezed, and after `holdSec` thrown
   * back over its head; enough damage while it holds (`my` counts it) and it lets go.
   */
  private stepPehlwan(e: Enemy): void {
    const c = E.pehlwan;
    const b = e.body;
    b.vx = 0;
    if (e.burst === 1) {
      const p = this.heldBy(e);
      const t = this.tick - e.atkStart;
      if (!p || p.state !== 'alive' || e.hp <= e.my - c.breakDmg) {
        e.burst = 0;
        e.atkParam = 0;
        e.nextFire = this.tick + this.ticks(c.coolSec);
      } else if (t >= this.ticks(c.holdSec)) {
        p.vx = -b.facing * 380;
        p.vy = -460;
        p.onGround = false;
        e.burst = 0;
        e.atkParam = 0;
        e.nextFire = this.tick + this.ticks(c.coolSec);
      } else {
        p.x = b.x + b.facing * 16;
        p.y = b.y - 6;
        p.vx = p.vy = 0;
        if (t % this.ticks(0.25) === 0) {
          p.invulnUntil = Math.min(p.invulnUntil, this.tick);
          this.hurtPlayer(p, c.squeeze);
        }
      }
    } else {
      const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
      if (target) {
        const dx = target.x - b.x;
        b.facing = dx >= 0 ? 1 : -1;
        const held = [...this.enemies.values()].some(
          (q) => q.kind === 'pehlwan' && q.burst === 1 && q.atkParam === target.slot + 1,
        );
        if (
          this.tick >= e.nextFire &&
          Math.abs(dx) < 30 &&
          Math.abs(target.y - b.y) < 30 &&
          !held &&
          !this.dodging(target) &&
          this.tick >= target.invulnUntil
        ) {
          e.burst = 1;
          e.atkStart = this.tick;
          e.atkParam = target.slot + 1;
          e.my = e.hp;
        } else if (Math.abs(dx) > 20 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
          b.vx = b.facing * c.speed;
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Mace spinner: walks in, spins toward a soldier (`burst` 1: shots glance off), then stands dizzy (`burst` 2). */
  private stepGadadhar(e: Enemy): void {
    const c = E.gadadhar;
    const b = e.body;
    b.vx = 0;
    const t = this.tick - e.atkStart;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (e.burst === 1) {
      if (t >= this.ticks(c.spinSec)) {
        e.burst = 2;
        e.atkStart = this.tick;
      } else if (target) {
        b.facing = target.x >= b.x ? 1 : -1;
        if (footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y)) b.vx = b.facing * c.spinSpeed;
      }
    } else if (e.burst === 2) {
      if (t >= this.ticks(c.dizzySec)) {
        e.burst = 0;
        e.nextFire = this.tick + this.ticks(1.2);
      }
    } else if (target) {
      const dx = target.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      if (this.tick >= e.nextFire && Math.abs(dx) < c.reach && Math.abs(target.y - b.y) < 50) {
        e.burst = 1;
        e.atkStart = this.tick;
      } else if (Math.abs(dx) > 60 && footingBelow(this.world, b.x + b.facing * (b.w / 2 + 4), b.y))
        b.vx = b.facing * c.speed;
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Slinger: whirls its sling and lets fly a stone that lands with a small blast. */
  private stepSlinger(e: Enemy): void {
    const c = E.slinger;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.fireEvery(c.throwEvery);
        e.atkStart = this.tick;
        this.lob(b.x, b.y - 34, target.x + target.vx * 0.4, target.y - 4, 0.85, c.dmg, 'bomb', c.blast);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** One half of Jodasur (`atkParam`: -1 left half, 1 right half) crawls toward the other. */
  private stepArdh(e: Enemy): void {
    const c = E.ardh;
    const b = e.body;
    b.vx = 0;
    let other: Enemy | undefined;
    for (const q of this.enemies.values()) if (q.kind === 'ardh' && q !== e) other = q;
    if (other) {
      const dx = other.body.x - b.x;
      b.facing = dx >= 0 ? 1 : -1;
      // the longer they are kept apart, the wearier their crawl (a stand-off always ends)
      const weary = Math.min(0.75, (this.tick - e.atkStart) / this.ticks(40));
      if (Math.abs(dx) > 4 && this.tick >= e.nextFire) b.vx = b.facing * c.speed * (1 - weary);
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /** Jodasur falls and splits in two: the halves appear either side of where he stood. */
  private splitJodasur(e: Enemy): void {
    const b = e.body;
    const fin = this.level.arenas[e.arena];
    e.hp = 0.001;
    e.burst = 1;
    e.atk = ATTACK.none;
    const mid = fin ? Math.max(fin.left + 120, Math.min(this.arenaWall(fin) - 120, b.x)) : b.x;
    b.x = mid;
    for (const side of [-1, 1]) {
      const h = this.spawnAwake('ardh', mid + side * 90, b.y, e.arena, true);
      h.atkParam = side;
      h.atkStart = this.tick;
      h.body.facing = -side as 1 | -1;
    }
    this.emit({ e: 'boom', x: r1(mid), y: r1(b.y - 60), r: 70 });
  }

  /**
   * Jodasur: hurls boulders, pounces (a shock along the ground where he lands), charges like a bull. Brought down,
   * he splits (`burst` 1) and the halves crawl together: if they meet he stands again with `rejoin` of his health;
   * if they are pushed `apart` from each other they burn, and he is done.
   */
  private stepJodasur(e: Enemy): void {
    const c = E.jodasur;
    const b = e.body;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const right = fin ? this.arenaWall(fin) : b.x + 300;
    if (e.burst === 1) {
      const halves = [...this.enemies.values()].filter((q) => q.kind === 'ardh');
      const [h1, h2] = halves;
      if (!h1 || !h2) {
        e.burst = 0;
        e.hp = e.maxHp * c.rejoin;
        return;
      }
      const d = Math.abs(h1.body.x - h2.body.x);
      if (d < 26) {
        // joined again
        for (const h of halves) this.enemies.delete(h.id);
        b.x = (h1.body.x + h2.body.x) / 2;
        e.burst = 0;
        e.hp = e.maxHp * c.rejoin;
        e.nextAtk = this.tick + this.ticks(1);
        this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 60), r: 60 });
      } else if (d >= c.apart) {
        // thrown apart: they burn, and he is finished
        for (const h of halves) {
          this.emit({ e: 'boom', x: r1(h.body.x), y: r1(h.body.y - 30), r: 60 });
          this.enemies.delete(h.id);
        }
        e.burst = 2;
        e.hp = 0.001;
        this.damageEnemy(e, 1, '', b.x, b.y - 50, 'astra');
      }
      return;
    }
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const rest = (c.rest[Math.min(2, ph) - 1] ?? 1) as number;
    const target = this.nearestAlive(b.x, b.y - 50, 2000);
    b.vx = 0;
    if (e.atk === ATTACK.none) {
      if (target) {
        const dx = target.x - b.x;
        b.facing = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) > 260) b.vx = b.facing * c.speed;
      }
      if (this.tick >= e.nextAtk && target) {
        const order =
          ph === 1
            ? [ATTACK.hurl, ATTACK.pounce, ATTACK.bull]
            : [ATTACK.pounce, ATTACK.bull, ATTACK.hurl, ATTACK.pounce];
        this.startAttack(e, order[e.cycle % order.length] as AttackId);
        e.cycle++;
        e.mx = b.x;
        e.leapX = Math.max(left + 40, Math.min(right - 40, target.x));
      }
    } else {
      const t = this.tick - e.atkStart;
      const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
      switch (e.atk) {
        case ATTACK.hurl: {
          if (t === wind && target) {
            const n = ph === 2 ? 3 : 2;
            for (let i = 0; i < n; i++)
              this.lob(
                b.x,
                b.y - 100,
                target.x + (i - (n - 1) / 2) * 80,
                target.y - 4,
                1 + i * 0.12,
                c.hurlDmg,
                'bomb',
                c.hurlBlast,
              );
          }
          if (t >= wind + this.ticks(1)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.pounce: {
          const air = this.ticks(0.7);
          if (t >= wind && t < wind + air) {
            const k = (t - wind) / air;
            b.x = e.mx + (e.leapX - e.mx) * k;
            b.y = e.homeY - Math.sin(k * Math.PI) * 160;
          }
          if (t === wind + air) {
            b.x = e.leapX;
            b.y = e.homeY;
            this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - 6), r: 60 });
            for (const p of this.players.values())
              if (p.state === 'alive' && Math.abs(p.x - b.x) < 80 && Math.abs(p.y - b.y) < 50)
                this.hurtPlayer(p, c.pounceDmg);
            for (const dir of [-1, 1]) {
              const w = this.shoot(b.x + dir * 30, b.y - 12, dir > 0 ? 0 : Math.PI, c.pounceDmg * 0.6, {
                kind: 'wave',
                speed: 260,
                size: 12,
                life: 1.6,
              });
              w.vy = 0;
            }
          }
          if (t >= wind + air + this.ticks(0.5)) this.endAttack(e, rest);
          break;
        }
        case ATTACK.bull: {
          if (t >= wind) {
            const dir = Math.sign(e.leapX - e.mx) || b.facing;
            b.facing = dir as 1 | -1;
            b.vx = dir * c.bullSpeed;
            for (const p of this.players.values())
              if (
                p.state === 'alive' &&
                Math.abs(p.x - b.x) < b.w / 2 + 10 &&
                Math.abs(p.y - b.y) < 60 &&
                this.tick >= p.invulnUntil &&
                !this.dodging(p)
              ) {
                this.hurtPlayer(p, c.bullDmg);
                p.vx = dir * 420;
                p.vy = -360;
              }
            const atWall = (dir > 0 && b.x >= right - b.w / 2 - 4) || (dir < 0 && b.x <= left + b.w / 2 + 4);
            if (atWall || t > wind + this.ticks(1.6)) {
              this.emit({ e: 'boom', x: r1(b.x + dir * 30), y: r1(b.y - 40), r: 40 });
              this.endAttack(e, rest + 0.4);
            }
          }
          break;
        }
        default:
          this.endAttack(e, rest);
      }
    }
    const flying =
      e.atk === ATTACK.pounce && this.tick - e.atkStart >= this.ticks(ATTACK_WINDUP[ATTACK.pounce] ?? 0.6);
    if (flying) b.vy = 0;
    else {
      b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
      b.x = Math.max(left + b.w / 2, Math.min(right - b.w / 2, b.x));
      moveBody(this.world, b, this.dt);
    }
  }

  // ------------------------------------------------------------ Suvarna (saga stage 10)

  /**
   * Meghbaan in the clouds: every few seconds a mark on the ground under a soldier (`ij` in the snapshot), and a
   * moment later a rain of arrows round it. Never at a rest stop or in the final arena.
   */
  private stepMegh(): void {
    if (!this.level.megh || this.phase !== 'playing') return;
    const C = GAME_CONFIG.megh;
    if (this.meghNext === 0) this.meghNext = this.tick + this.ticks(C.everySec);
    if (this.meghAt && this.tick === this.meghAt) {
      for (let i = 0; i < C.arrows; i++) {
        const x = this.meghX + this.rng.range(-C.spread, C.spread);
        const y = this.meghY - 420 - i * 40;
        const a = Math.atan2(420, this.rng.range(-40, 40));
        const b = this.shoot(x - Math.cos(a) * 0, y, a, C.dmg, {
          kind: 'arrow',
          speed: 520,
          size: 3,
          life: 2,
        });
        b.vx = (this.meghX + this.rng.range(-C.spread, C.spread) - x) * 0.4;
      }
      this.meghAt = 0;
    }
    if (this.tick < this.meghNext) return;
    this.meghNext = this.tick + this.ticks(C.everySec + this.rng.range(-C.jitterSec, C.jitterSec));
    if (this.activeArena() >= 0) return;
    const alive = [...this.players.values()].filter((p) => p.state === 'alive' && p.onGround);
    if (!alive.length) return;
    const p = alive[this.rng.int(alive.length)] as Player;
    if (this.level.rests.some((r) => p.x > r.x0 - 2 * T && p.x < r.x1 + 2 * T)) return;
    this.meghX = p.x + p.vx * 0.6;
    this.meghY = p.y;
    this.meghAt = this.tick + this.ticks(C.warnSec);
  }

  /** Torch thrower: lobs a pot of burning oil that bursts where it lands. */
  private stepMashaal(e: Enemy): void {
    const c = E.mashaal;
    const b = e.body;
    b.vx = 0;
    const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
    if (target) {
      b.facing = target.x >= b.x ? 1 : -1;
      if (this.tick >= e.nextFire) {
        e.nextFire = this.tick + this.fireEvery(c.throwEvery);
        e.atkStart = this.tick;
        this.lob(b.x, b.y - 34, target.x + target.vx * 0.5, target.y - 4, 0.95, c.dmg, 'meteor', c.blast);
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /**
   * Meghbaan's warrior of illusion: drifts unseen high over a soldier; every `shootEvery` it shows itself
   * (`mx`: shown until then) and looses three arrows down at them.
   */
  private stepMayavi(e: Enemy): void {
    const c = E.mayavi;
    const b = e.body;
    const target = this.nearestAlive(b.x, b.y, c.sight);
    if (!target) return;
    const tx = target.x + Math.sin(this.tick / 40 + e.id) * 160;
    const ty = Math.min(e.homeY, target.y - 150);
    const dx = tx - b.x;
    const dy = ty - b.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(c.speed, d * 2);
    b.x += (dx / d) * sp * this.dt;
    b.y += (dy / d) * sp * this.dt;
    b.facing = target.x >= b.x ? 1 : -1;
    if (this.tick >= e.nextFire) {
      e.nextFire = this.tick + this.fireEvery(c.shootEvery);
      e.mx = this.tick + this.ticks(c.showSec);
      const a = Math.atan2(target.y - 20 - b.y, target.x - b.x);
      for (const k of [-0.15, 0, 0.15])
        this.shoot(b.x, b.y, a + k, c.dmg, { kind: 'arrow', speed: 330, size: 3, life: 2.4 });
    }
  }

  /**
   * Nidrasur asleep: gunfire near him (`my` counts it, and it fades) wakes him (`burst` 1): he rolls at the
   * nearest soldier for `rampageSec`, crushing whoever he rolls over, then falls asleep where he stops.
   */
  private stepNidrasur(e: Enemy): void {
    const c = E.nidrasur;
    const b = e.body;
    b.vx = 0;
    if (e.burst === 1) {
      const target = this.nearestAlive(b.x, b.y - b.h / 2, c.sight);
      if (target) b.facing = target.x >= b.x ? 1 : -1;
      const ahead = b.x + b.facing * (b.w / 2 + 4);
      if (footingBelow(this.world, ahead, b.y) && !solidAtPoint(this.world, ahead, b.y - 10))
        b.vx = b.facing * c.rollSpeed;
      for (const p of this.players.values())
        if (
          p.state === 'alive' &&
          Math.abs(p.x - b.x) < b.w / 2 &&
          p.y > b.y - b.h &&
          this.tick >= p.invulnUntil &&
          p.lastHurt < e.atkStart // (once each time he wakes)
        ) {
          this.hurtPlayer(p, c.dmg);
          p.vx = b.facing * 380;
          p.vy = -420;
        }
      if (this.tick - e.atkStart >= this.ticks(c.rampageSec)) {
        e.burst = 0;
        e.my = 0;
      }
    } else {
      let noise = false;
      for (const p of this.players.values())
        if (p.state === 'alive' && p.input.fire && Math.abs(p.x - b.x) < c.hears + b.w / 2) noise = true;
      e.my = noise ? e.my + 1 : Math.max(0, e.my - 0.25);
      if (e.my >= c.wakeAt) {
        e.burst = 1;
        e.atkStart = this.tick;
        this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y - b.h), r: 50 });
      }
    }
    b.vy = Math.min(P.maxFallSpeed, b.vy + P.gravity * this.dt);
    moveBody(this.world, b, this.dt);
  }

  /**
   * Saptashir, seven-headed, before his throne: fire from his seven mouths in a fan, Moonblade' cut sending a blade of
   * light along the ground, burning stones from the sky. His heads (`my`, cut ones grow back every `regrowSec`,
   * `atkParam`: when the last cut or regrowth was) take the blows; PRALAY is the arena's rule.
   */
  private stepSaptashir(e: Enemy): void {
    const c = E.saptashir;
    const b = e.body;
    this.bossPhase(e, c.phase2);
    const ph = e.phase;
    const fin = this.level.arenas[e.arena];
    const left = fin ? fin.left : b.x - 900;
    const front = b.x - b.w / 2;
    const rest = (c.rest[ph - 1] ?? 1) as number;
    b.facing = -1;
    b.vx = 0;
    b.vy = 0;
    if (e.my < c.heads && this.tick - e.atkParam >= this.ticks((c.regrowSec[ph - 1] ?? 1.2) as number)) {
      e.my++;
      e.atkParam = this.tick;
      if (e.my === 1) e.leapX = 0;
    }
    const target = this.nearestAlive(b.x, b.y - 80, 2000);
    if (e.atk === ATTACK.none) {
      if (this.tick >= e.nextAtk && target) {
        const order =
          ph === 1
            ? [ATTACK.tenfire, ATTACK.moonblade, ATTACK.meteors]
            : [ATTACK.tenfire, ATTACK.meteors, ATTACK.moonblade, ATTACK.tenfire];
        e.atk = order[e.cycle % order.length] as AttackId;
        e.atkStart = this.tick;
        e.cycle++;
      }
      return;
    }
    const t = this.tick - e.atkStart;
    const wind = this.ticks(ATTACK_WINDUP[e.atk] ?? 0.6);
    switch (e.atk) {
      case ATTACK.tenfire: {
        if (t === wind && target) {
          // one tongue of fire from each head still on his shoulders
          const n = Math.max(2, e.my);
          for (let i = 0; i < n; i++) {
            const hx = b.x - 54 + i * 18;
            const a = Math.atan2(target.y - 20 - (b.y - 200), target.x - hx) + (i - (n - 1) / 2) * 0.07;
            this.shoot(hx, b.y - 200, a, c.fireDmg, { kind: 'flame', speed: 300, size: 7, life: 2.6 });
          }
        }
        if (t >= wind + this.ticks(0.5)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.moonblade: {
        if (t === wind) {
          const w = this.shoot(front - 10, b.y - 14, Math.PI, c.swordDmg, {
            kind: 'wave',
            speed: ph === 2 ? 360 : 300,
            size: 14,
            life: 3.5,
          });
          w.vy = 0;
          if (ph === 2) {
            const w2 = this.shoot(front - 10, b.y - 64, Math.PI, c.swordDmg, {
              kind: 'wave',
              speed: 300,
              size: 12,
              life: 3.5,
            });
            w2.vy = 0;
          }
        }
        if (t >= wind + this.ticks(0.6)) this.endAttack(e, rest);
        break;
      }
      case ATTACK.meteors: {
        if (t === wind && target) {
          const n = ph === 2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const x = Math.max(left + 30, Math.min(front - 30, target.x + (i - (n - 1) / 2) * 90));
            this.lob(b.x, b.y - 240, x, b.y - 4, 1.1 + i * 0.1, c.meteorDmg, 'meteor', c.meteorBlast);
          }
        }
        if (t >= wind + this.ticks(1)) this.endAttack(e, rest);
        break;
      }
      default:
        this.endAttack(e, rest);
    }
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
        const atk = e.style
          ? nextStyleAttack(e.style, e.phase, e.cycle)
          : (cycle[e.cycle % cycle.length] as AttackId);
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
          if (!this.stepSagaMove(e, target, t, wind, ph2 ? 0.6 : 1.0)) this.endAttack(e, 1);
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
        const atk = e.style
          ? nextStyleAttack(e.style, e.phase, e.cycle)
          : (cycle[e.cycle % cycle.length] as AttackId);
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
        if (!this.stepSagaMove(e, target, t, wind, ph2 ? 0.7 : 1.1)) this.endAttack(e, 1);
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
    // Classic fortresses send drones from phase 2; saga styles bring their own reinforcements (summon).
    if (ph >= 2 && !e.style && this.tick % this.ticks(bc.droneEvery) === 0) {
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
        const atk = e.style
          ? nextStyleAttack(e.style, e.phase, e.cycle)
          : (cycle[e.cycle % cycle.length] as AttackId);
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
        if (!this.stepSagaMove(e, target, t, wind, idle)) this.endAttack(e, 1);
    }
  }

  // ------------------------------------------------------------ saga boss moves (any body)

  /**
   * Moves shared by every boss body in the Astra Saga (see boss-styles.ts). Returns false for a move this body
   * cannot do, so the caller simply ends it.
   */
  private stepSagaMove(e: Enemy, target: Player | null, t: number, wind: number, idle: number): boolean {
    const M = GAME_CONFIG.bossMoves;
    const b = e.body;
    const arena = this.arenaOf(e);
    const left = arena?.left ?? 0;
    const right = arena?.right ?? levelWidth(this.level);
    const floor = arena?.floor ?? b.y;
    const ph = e.phase;
    const c = this.castPoint(e);
    switch (e.atk) {
      case ATTACK.rain: {
        // Fire (or hail, or lightning) falls on a line of spots around the target; the client marks each spot.
        if (t === wind) {
          const n = M.rain.count + ph - 1;
          const cx = target ? target.x : (left + right) / 2;
          for (let i = 0; i < n; i++) {
            const x = Math.max(
              left + 24,
              Math.min(right - 24, cx + (i - (n - 1) / 2) * M.rain.gap + this.rng.range(-20, 20)),
            );
            this.shoot(x, floor - M.rain.drop - i * 46, Math.PI / 2, M.rain.dmg, {
              kind: 'meteor',
              speed: M.rain.speed,
              size: 9,
              blast: M.rain.blast,
              life: 3.5,
            });
          }
        }
        if (t >= wind + this.ticks(1)) this.endAttack(e, idle);
        return true;
      }
      case ATTACK.ring: {
        // One ring of shots (two from phase 2, the second turned half a step so the gaps move).
        const rings = ph >= 2 ? 2 : 1;
        const gap = this.ticks(0.45);
        if (t >= wind && (t - wind) % gap === 0 && (t - wind) / gap < rings) {
          const k = (t - wind) / gap;
          const n = M.ring.count;
          for (let i = 0; i < n; i++)
            this.shoot(c.x, c.y, ((i + k * 0.5) / n) * Math.PI * 2, M.ring.dmg, {
              speed: M.ring.speed,
              size: 4,
              life: 4,
            });
        }
        if (t >= wind + gap * rings + this.ticks(0.2)) this.endAttack(e, idle);
        return true;
      }
      case ATTACK.spiral: {
        // A spinning stream: walk around it, or slip through the gap between the arms.
        const dur = this.ticks(M.spiral.sec);
        if (t >= wind && t < wind + dur && (t - wind) % M.spiral.everyTicks === 0) {
          const a0 = (t - wind) * M.spiral.turn * (e.cycle % 2 ? 1 : -1);
          for (let k = 0; k < M.spiral.arms; k++)
            this.shoot(c.x, c.y, a0 + (k * Math.PI * 2) / M.spiral.arms, M.spiral.dmg, {
              speed: M.spiral.speed,
              size: 4,
              life: 3.5,
            });
        }
        if (t >= wind + dur) this.endAttack(e, idle);
        return true;
      }
      case ATTACK.leap: {
        // Walkers only: a huge jump at the target, landing with a shockwave each way (jump it).
        if (e.kind !== 'walker') return false;
        if (t === wind) {
          e.leapX = target ? Math.max(left + b.w / 2, Math.min(right - b.w / 2, target.x)) : b.x;
          if (b.onGround) b.vy = -M.leap.jump;
        }
        if (t > wind) b.vx = Math.max(-M.leap.speed, Math.min(M.leap.speed, (e.leapX - b.x) * 2.5));
        if (t > wind + 3 && b.onGround) {
          b.vx = 0;
          for (const dir of [-1, 1]) {
            const w = this.shoot(b.x + dir * (b.w / 2 - 6), b.y - 12, dir > 0 ? 0 : Math.PI, M.leap.waveDmg, {
              kind: 'wave',
              speed: 360,
              size: 12,
              life: 2.2,
            });
            w.vy = 0;
          }
          this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y), r: 70 });
          this.endAttack(e, idle);
        } else if (t > wind + this.ticks(2.5)) this.endAttack(e, idle);
        return true;
      }
      case ATTACK.blink: {
        // Walkers and gunships: vanish, then reappear on the other side of the target and strike again soon.
        if (e.kind === 'boss') return false;
        if (t === wind) {
          const mid = b.y - (e.kind === 'walker' ? b.h / 2 : 0);
          this.emit({ e: 'blink', x: r1(b.x), y: r1(mid), out: 1 });
          const tx = target ? target.x : (left + right) / 2;
          const side = b.x < tx ? 1 : -1;
          const margin = e.kind === 'gunship' ? 140 : b.w / 2 + 8;
          b.x = Math.max(left + margin, Math.min(right - margin, tx + side * M.blink.dist));
          b.facing = tx >= b.x ? 1 : -1;
          this.emit({ e: 'blink', x: r1(b.x), y: r1(mid), out: 0 });
          this.endAttack(e, 0.35);
        }
        return true;
      }
      case ATTACK.summon: {
        // Reinforcements through portals or out of the ground, never more than a few at once.
        if (t === wind && arena) {
          let n = this.pending.filter((q) => q.fromBoss).length;
          for (const x of this.enemies.values()) if (x.fromBoss) n++;
          const kind = e.style?.summon ?? 'soldier';
          const side = e.style?.entry ?? 'P';
          for (let i = 0; i < Math.min(M.summon.count, M.summon.max - n); i++)
            this.queueSpawn({ kind, side }, arena, true);
        }
        if (t >= wind + this.ticks(0.6)) this.endAttack(e, idle);
        return true;
      }
    }
    return false;
  }

  /** A wave or boss enemy that arrives through a portal ('P') or rises out of the ground ('U') a moment later. */
  private queueSpawn(s: WaveSpawn, a: ArenaDef, fromBoss: boolean): void {
    let x: number;
    if (s.side === 'U') {
      const alive = [...this.players.values()].filter((p) => p.state === 'alive');
      const p = alive.length ? alive[this.rng.int(alive.length)] : null;
      const base = p ? p.x : (a.left + a.right) / 2;
      x = base + (this.rng.int(2) ? 1 : -1) * this.rng.range(90, 190);
    } else x = a.left + (a.right - a.left) * this.rng.range(0.3, 0.75);
    x = Math.max(a.left + 30, Math.min(a.right - 30, x));
    this.emit({ e: 'portal', x: r1(x), y: r1(a.floor), how: s.side === 'U' ? 1 : 0 });
    this.pending.push({
      kind: s.kind,
      x,
      y: a.floor,
      arena: a.id,
      at: this.tick + this.ticks(GAME_CONFIG.bossMoves.portalSec),
      elite: s.elite === true,
      fromBoss,
    });
  }

  private stepPending(): void {
    if (!this.pending.length) return;
    const due = this.pending.filter((q) => this.tick >= q.at);
    if (!due.length) return;
    this.pending = this.pending.filter((q) => this.tick < q.at);
    for (const q of due) {
      const e = this.spawnAwake(q.kind, q.x, q.y, q.arena, q.fromBoss);
      if (q.elite) this.makeElite(e);
    }
  }

  private makeElite(e: Enemy): void {
    e.elite = true;
    e.hp = e.maxHp = e.maxHp * GAME_CONFIG.bossMoves.elite.hp;
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

  // ------------------------------------------------------------ boss astras (Astra Saga)

  /** Boss astra timers follow the mission's boss tempo, like the rests between attacks. */
  private ruleTicks(sec: number): number {
    return this.ticks(sec / this.mods.bossTempo);
  }

  /** Where a boss's astras leave from: the walker's head, the gunship's nose, the top of the throne. */
  castPoint(e: Enemy): { x: number; y: number } {
    const b = e.body;
    if (e.kind === 'boss') return { x: b.x - b.w / 2 - 10, y: b.y - 170 };
    if (e.kind === 'vriksha') return { x: b.x - b.w / 2 + 20, y: b.y - 150 };
    if (e.kind === 'chhaya') return { x: b.x - b.w / 2 + 30, y: b.y - 200 };
    if (e.kind === 'aandhi') return { x: b.x - 10, y: b.y - 110 };
    if (e.kind === 'vishdhar') return { x: b.x - b.w / 2 + 20, y: b.y - 180 };
    if (e.kind === 'darpan') return { x: b.x - b.w / 2 + 10, y: b.y - 140 };
    if (e.kind === 'gunship') return { x: b.x + b.facing * 60, y: b.y + 10 };
    return { x: b.x + b.facing * 54, y: b.y - 88 };
  }

  /**
   * A boss's own astras. Returns true while it is busy with one (calling it, its samarpanastra storm, or stunned
   * afterwards), which pauses its normal attacks: every call has a clear wind-up and nothing else lands meanwhile.
   */
  private stepBossRule(e: Enemy): boolean {
    const r = e.rule as RuleState;
    const BA = GAME_CONFIG.bossAstra;
    if (this.tick < r.stunUntil) return true;
    const c = this.castPoint(e);
    if (r.kind === null) {
      if (e.atk !== ATTACK.none) return false; // the current attack finishes first
      const has = (k: BossRule): boolean => r.rules.includes(k);
      const frac = e.hp / e.maxHp;
      let next: BossRule | null = null;
      if (
        has('samarpan') &&
        ((r.narCalls === 0 && this.tick >= r.nextNar) || (r.narCalls === 1 && frac < BA.samarpan.secondBelow))
      )
        next = 'samarpan';
      else if (has('pralay') && frac < BA.pralay.firstBelow && this.tick >= r.nextShirsha) next = 'pralay';
      else if (has('tej') && this.tick >= r.nextOrb && !this.bullets.some((b) => b.kind === 'orb'))
        next = 'tej';
      else if (has('naga') && this.tick >= r.nextNaga) next = 'naga';
      if (!next) return false;
      r.kind = next;
      r.start = this.tick;
      r.storm = false;
      if (next === 'samarpan') {
        r.narCalls++;
        this.resist.clear();
      }
      this.emit({ e: 'bossAstra', kind: next, phase: 0, x: r1(c.x), y: r1(c.y) });
      return true;
    }
    const t = this.tick - r.start;
    const release = (): void =>
      this.emit({ e: 'bossAstra', kind: r.kind as BossRule, phase: 1, x: r1(c.x), y: r1(c.y) });
    switch (r.kind) {
      case 'naga': {
        const N = BA.naga;
        if (t < this.ticks(N.windupSec)) return true;
        release();
        const target = this.nearestAlive(c.x, c.y, 1600);
        const base = target
          ? Math.atan2(target.y - P.height / 2 - c.y, target.x - c.x)
          : e.body.facing > 0
            ? 0
            : Math.PI;
        for (let i = 0; i < N.serpents; i++) {
          const b = this.shoot(c.x, c.y, base + (i - (N.serpents - 1) / 2) * 0.55, N.damage, {
            kind: 'serpent',
            speed: N.speed,
            size: 6,
            life: N.lifeSec,
          });
          b.turn = N.turn;
          b.src = e.id;
        }
        r.kind = null;
        r.nextNaga = this.tick + this.ruleTicks(N.everySec);
        return false;
      }
      case 'tej': {
        const V = BA.tej;
        if (t < this.ticks(V.windupSec)) return true;
        release();
        const target = this.nearestAlive(c.x, c.y, 1600);
        const a = target ? Math.atan2(target.y - P.height / 2 - c.y, target.x - c.x) : Math.PI;
        const b = this.shoot(c.x, c.y, a, V.damage, {
          kind: 'orb',
          speed: V.speed,
          size: 14,
          blast: V.blast,
          life: V.lifeSec,
        });
        b.turn = V.turn;
        b.src = e.id;
        r.kind = null;
        r.nextOrb = this.tick + this.ruleTicks(V.everySec);
        return false;
      }
      case 'samarpan': {
        const N = BA.samarpan;
        const wind = this.ticks(N.windupSec);
        if (t < wind) return true;
        if (t === wind) {
          if (r.narCalls >= 2 && r.narPerfect) {
            // Called a second time after a storm nobody fought: it rebounds on its caller.
            r.kind = null;
            this.emit({ e: 'bossAstra', kind: 'samarpan', phase: 3, x: r1(c.x), y: r1(c.y) });
            r.stunUntil = r.spentUntil = this.tick + this.ticks(N.spentSec);
            this.damageEnemy(e, e.maxHp * N.reboundShare, '', e.body.x, e.body.y - e.body.h / 2, 'astra');
            return true;
          }
          r.storm = true;
          release();
        }
        const st = t - wind;
        if (st < this.ticks(N.stormSec)) {
          for (const p of this.players.values()) {
            if (p.state !== 'alive') continue;
            const i = p.input;
            if (i.fire || i.melee || i.ult || i.astra)
              this.resist.set(p.id, (this.resist.get(p.id) ?? 0) + 1);
          }
          if (st % this.ticks(N.volleySec) === 0) {
            for (const p of this.players.values()) {
              if (p.state !== 'alive') continue;
              const n = this.arrowsFor(p);
              for (let k = 0; k < n; k++) {
                const x = p.x + this.rng.range(-80, 80);
                const y = -20 - k * 36;
                const a = Math.atan2(p.y - P.height / 2 - y, p.x + p.vx * 0.4 - x);
                const b = this.shoot(x, y, a, N.damage, { kind: 'arrow', speed: 560, size: 3, life: 2.2 });
                b.src = e.id;
              }
            }
          }
          return true;
        }
        // The storm has passed: the boss is spent.
        r.narPerfect = [...this.resist.values()].every((v) => v === 0);
        r.kind = null;
        r.storm = false;
        r.stunUntil = r.spentUntil = this.tick + this.ticks(N.spentSec);
        this.emit({ e: 'bossAstra', kind: 'samarpan', phase: 4, x: r1(c.x), y: r1(c.y) });
        return true;
      }
      case 'pralay': {
        const B = BA.pralay;
        if (t < this.ticks(B.windupSec)) return true;
        // Nobody answered it with the paramastra: it lands on everyone not dodging, and (it cannot be called
        // back) scorches its caller too.
        release();
        r.kind = null;
        r.nextShirsha = this.tick + this.ruleTicks(B.everySec);
        for (const p of this.players.values()) this.hurtPlayer(p, B.damage);
        this.damageEnemy(e, e.maxHp * B.backfireShare, '', e.body.x, e.body.y - e.body.h / 2, 'astra');
        return true;
      }
    }
    return false;
  }

  /** Samarpanastra: arrows per volley at this soldier (0 while they have not fought the storm at all). */
  arrowsFor(p: Player): number {
    const N = GAME_CONFIG.bossAstra.samarpan;
    const r = this.resist.get(p.id) ?? 0;
    if (r === 0) return 0;
    return Math.min(N.maxArrows, N.base + Math.floor(r / this.ticks(N.resistStepSec)));
  }

  /** The boss astra being called right now (bots and the HUD read it). */
  bossCast(): { e: Enemy; kind: BossRule; t: number; storm: boolean } | null {
    for (const e of this.enemies.values())
      if (e.rule?.kind && e.awake)
        return { e, kind: e.rule.kind, t: this.tick - e.rule.start, storm: e.rule.storm };
    return null;
  }

  /** A boss charging its pralay (the squad's paramastra answers it). */
  private shirshaCharging(): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies.values()) if (e.rule?.kind === 'pralay') out.push(e);
    return out;
  }

  /** Enemy shots any shield, gust, parry or black hole can stop: everything but a tej orb and arrows. */
  private clearable(b: Bullet): boolean {
    return b.enemy && b.kind !== 'orb' && b.kind !== 'arrow';
  }

  /**
   * Continue after the squad ran out of lives (solo: a rewarded video or astra shards). Undoes the defeat and
   * brings everyone back with `lives` team lives. Returns false when there is nothing to continue.
   */
  revive(lives: number): boolean {
    if (this.pendingResult !== 'failed' || this.failReason !== 'lives') return false;
    this.pendingResult = null;
    this.result = null;
    this.failReason = null;
    this.endAt = -1;
    this.phase = 'playing';
    let dead = 0;
    for (const p of this.players.values())
      if (p.state === 'dead') {
        dead++;
        p.respawnAt = this.tick + 1;
      }
    this.lives = Math.min(GAME_CONFIG.mission.maxLives, Math.max(1, lives) + dead);
    this.emit({ e: 'life', lives: this.lives });
    return true;
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
    if (lag <= 0 || e.kind === 'turret' || isFixedBoss(e.kind)) return { x: e.body.x, y: e.body.y };
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
    this.stepPlats();
    this.stepPlayers();
    this.stepPending();
    this.stepArenas();
    this.stepRests();
    this.stepHazard();
    this.stepSurprises();
    this.stepGoal();
    this.stepChase();
    this.stepGusts();
    this.stepLava();
    this.stepVyuh();
    this.stepMegh();
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
      const fromX = p.x;
      stepPlayerMovement(this.world, p, p.input, this.dt);
      // wading in the sea: slower
      const wy = this.waterY();
      if (wy !== null && p.y > wy + 6) p.x = fromX + (p.x - fromX) * GAME_CONFIG.sea.waterSlow;
      // caught in a net: slowed
      if (this.tick < p.netUntil) p.x = fromX + (p.x - fromX) * E.netter.slow;
      // the akhada's mud
      if (this.level.fields.length && fieldAt(this.level, p.x, p.y - 4)?.kind === 'mud')
        p.x = fromX + (p.x - fromX) * GAME_CONFIG.mud.slow;
      // the turning rings of the bhanwarvyuh carry whoever stands in them
      if (p.onGround && this.level.fields.length) {
        const f = fieldAt(this.level, p.x, p.y - 4);
        if (f?.kind === 'belt') {
          const nx = p.x + f.power * this.dt;
          const edge = nx + Math.sign(f.power) * (p.w / 2 + 1);
          if (!solidAtPoint(this.world, edge, p.y - 6) && !solidAtPoint(this.world, edge, p.y - 30)) p.x = nx;
        }
      }
      this.gustPush(p);
      // standing in a pool of poison (Naag Lok)
      if (this.level.fields.length && this.tick % 10 === 0) {
        const f = fieldAt(this.level, p.x, p.y - 4);
        if (f?.kind === 'poison') this.hurtPlayer(p, (f.power * 10) / this.tickRate);
      }
      if (!wasDashing && p.dashTicks > 0)
        p.dodgeUntil = this.tick + p.dashTicks + this.ticks(P.dash.iframeSec + heroPerk(p.hero).dodgeSec);
      if (!wasSliding || p.slideTicks === 0) p.slideHits.clear();
      const aim = aimOf(p, p.input);
      p.aimX = aim.ax;
      p.aimY = aim.ay;
      this.stepRide(p);
      if (
        p.onGround &&
        !(p.ride >= 0 && this.mountDef(p).fly) &&
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
        p.hp = Math.min(P.maxHp, p.hp + P.regenPerSec * heroPerk(p.hero).regen * this.dt);
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
      if (p.ride >= 0) {
        // in the saddle: KNIFE is the ride's power; FIRE its own gun, or the soldier's from the saddle
        if (meleePressed && this.tick >= p.mountReady) this.ridePower(p);
        if (p.input.fire && this.tick >= p.nextFireTick) {
          if (this.mountDef(p).gun) this.rideFire(p);
          else this.fire(p);
        }
        continue;
      }
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
    if (p.ride >= 0 && p.rush > 0) return true; // nitro, charge, pounce, dive: through the shots
    return p.dashTicks > 0 || this.tick < p.dodgeUntil;
  }

  // ------------------------------------------------------------ rides (mounts.ts)

  private mountDef(p: Player): (typeof MOUNTS)[MountKind] {
    return MOUNTS[mountOf(p.ride) ?? 'horse'];
  }

  /** Boarding at a stand, the ride's end, the hawk's dive landing. */
  private stepRide(p: Player): void {
    if (p.ride < 0) {
      for (const st of this.level.mounts) {
        if (p.x > st.to - 40) continue;
        if (Math.abs(p.x - st.x) > 30 || Math.abs(p.y - st.y) > 48) continue;
        p.ride = MOUNT_KINDS.indexOf(st.kind);
        p.mountHp = MOUNTS[st.kind].hp;
        p.mountTo = st.to;
        p.mountReady = this.tick + this.ticks(0.4);
        p.rush = 0;
        p.diveUntil = 0;
        p.airJumps = MOUNTS[st.kind].airJumps;
        p.rideHits.clear();
        this.emit({ e: 'ride', id: p.id, k: st.kind, on: 1, lost: 0, x: r1(p.x), y: r1(p.y) });
        return;
      }
      return;
    }
    const m = this.mountDef(p);
    if (p.diveUntil > 0 && (p.onGround || this.tick >= p.diveUntil)) {
      // the hawk's dive strikes where it lands
      p.diveUntil = 0;
      p.rush = 0;
      p.vy = -m.speed * 0.6;
      const D = MOUNT_POWER.dive;
      this.rideBlast(p, p.x, p.y - 10, D.radius, D.damage);
      this.emit({ e: 'boom', x: r1(p.x), y: r1(p.y - 10), r: D.radius });
    }
    if (p.x >= p.mountTo && (p.onGround || !m.fly || p.y < this.groundTopAt(p.x))) this.dismount(p, false);
  }

  /** Top of the ground under x (px), or the bottom of the level over a drop. */
  private groundTopAt(x: number): number {
    const L = this.level;
    const c = Math.floor(x / GAME_CONFIG.tile);
    for (let r = 1; r < L.rows; r++) {
      const t = L.tiles[r * L.cols + c];
      if ((t === Tile.Solid || t === Tile.OneWay) && L.tiles[(r - 1) * L.cols + c] === Tile.Empty)
        return r * GAME_CONFIG.tile;
    }
    return levelHeight(L);
  }

  private dismount(p: Player, lost: boolean): void {
    if (p.ride < 0) return;
    const k = mountOf(p.ride) as MountKind;
    p.ride = -1;
    p.rush = 0;
    p.diveUntil = 0;
    p.mountHp = 0;
    p.airJumps = P.airJumps;
    if (lost) {
      // thrown clear, with a moment of safety
      p.vy = -360;
      p.onGround = false;
      p.invulnUntil = this.tick + this.ticks(1.2);
    }
    this.emit({ e: 'ride', id: p.id, k, on: 0, lost: lost ? 1 : 0, x: r1(p.x), y: r1(p.y) });
  }

  /** A player bullet from a ride (its gun, a rocket, a missile). */
  private rideBullet(
    p: Player,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dmg: number,
    o: {
      kind?: BulletKind;
      blast?: number;
      life: number;
      pierce?: boolean;
      grav?: number;
      turn?: number;
      size?: number;
    },
  ): void {
    this.bullets.push({
      oy: p.y,
      id: this.nextBulletId++,
      enemy: false,
      owner: p.id,
      kind: o.kind ?? 'shot',
      x,
      y,
      vx,
      vy,
      dmg,
      pierce: !!o.pierce,
      expires: this.tick + this.ticks(o.life),
      born: this.tick,
      lag: p.viewLag,
      weapon: o.kind && o.kind !== 'shot' ? null : 'laser',
      power: o.kind === 'rocket',
      hit: o.pierce ? new Set() : null,
      grav: o.grav ?? 0,
      blast: o.blast ?? 0,
      size: o.size ?? 0,
      turn: o.turn ?? 0,
      hitsLeft: 0,
      ret: false,
      src: -1,
    });
  }

  private rideFire(p: Player): void {
    const g = this.mountDef(p).gun;
    if (!g) return;
    p.nextFireTick = this.tick + Math.max(1, this.ticks(g.cooldown));
    const up = p.aimY < 0;
    const x = p.x + p.facing * 26;
    const y = p.y - this.mountDef(p).seat - (this.mountDef(p).fly ? 20 : 8);
    for (let i = 0; i < g.pellets; i++) {
      const a = up
        ? -Math.PI / 2 + p.facing * 0.35
        : (p.facing > 0 ? 0 : Math.PI) + (g.spread ? (i / Math.max(1, g.pellets - 1) - 0.5) * g.spread : 0);
      const dy = g.spread || g.pellets === 1 ? 0 : (i - (g.pellets - 1) / 2) * 8;
      this.rideBullet(p, x, y + dy, Math.cos(a) * g.speed, Math.sin(a) * g.speed, g.damage, {
        kind: g.blast > 0 ? 'rocket' : 'shot',
        blast: g.blast,
        life: g.lifetime,
        pierce: g.pierce,
        size: g.blast > 0 ? 4 : 0,
      });
    }
  }

  private ridePower(p: Player): void {
    const m = this.mountDef(p);
    const k = mountOf(p.ride) as MountKind;
    p.mountReady = this.tick + this.ticks(m.powerCd);
    let tx: number | undefined;
    let ty: number | undefined;
    switch (m.power) {
      case 'nitro':
        p.rush = this.ticks(MOUNT_POWER.nitro.sec);
        p.rideHits.clear();
        break;
      case 'charge':
        p.rush = this.ticks(MOUNT_POWER.charge.sec);
        p.rideHits.clear();
        break;
      case 'barrage': {
        const B = MOUNT_POWER.barrage;
        for (let i = 0; i < B.rockets; i++) {
          const a = -0.55 - i * 0.12;
          const vx = Math.cos(a) * B.speed * p.facing;
          const vy = Math.sin(a) * B.speed;
          this.rideBullet(p, p.x + p.facing * 20, p.y - 36, vx, vy, B.damage, {
            kind: 'rocket',
            blast: B.blast,
            life: 2.4,
            grav: 700,
            size: 4,
          });
        }
        break;
      }
      case 'missiles': {
        const M = MOUNT_POWER.missiles;
        for (let i = 0; i < M.count; i++) {
          const a = (p.facing > 0 ? 0 : Math.PI) + (i / (M.count - 1) - 0.5) * 1.6;
          this.rideBullet(p, p.x, p.y - 34, Math.cos(a) * M.speed, Math.sin(a) * M.speed, M.damage, {
            kind: 'rocket',
            blast: M.blast,
            life: 2.2,
            turn: M.turn,
            size: 4,
          });
        }
        break;
      }
      case 'pounce': {
        const PO = MOUNT_POWER.pounce;
        const e = this.nearestFoe(p.x + p.facing * 60, p.y - 20, PO.range);
        if (e) {
          tx = e.body.x;
          ty = e.body.y;
          const t = 0.45;
          p.vx = (tx - p.x) / t;
          p.vy = -420;
          p.facing = tx >= p.x ? 1 : -1;
          p.onGround = false;
          p.rush = this.ticks(t + 0.2);
          this.damageEnemy(e, PO.damage, p.id, tx, ty - e.body.h / 2, 'melee');
        } else {
          p.vx = p.facing * 420;
          p.vy = -420;
          p.onGround = false;
          p.rush = this.ticks(0.5);
        }
        break;
      }
      case 'stomp': {
        const S = MOUNT_POWER.stomp;
        this.rideBlast(p, p.x, p.y - 10, S.radius, S.damage, true);
        this.tremorFrom(p);
        break;
      }
      case 'dive': {
        p.rush = this.ticks(1.2);
        p.diveUntil = this.tick + this.ticks(1.2);
        break;
      }
    }
    this.emit({
      e: 'rpow',
      id: p.id,
      k,
      x: r1(p.x),
      y: r1(p.y),
      f: p.facing,
      ...(tx !== undefined && ty !== undefined ? { tx: r1(tx), ty: r1(ty) } : {}),
    });
  }

  /** A burst from a ride's power: every foe in reach takes the damage (ground: only those on the ground near y). */
  private rideBlast(p: Player, x: number, y: number, r: number, dmg: number, ground = false): void {
    for (const e of [...this.enemies.values()]) {
      if (!e.awake) continue;
      const ex = e.body.x;
      const ey = e.body.y - e.body.h / 2;
      if (ground && Math.abs(e.body.y - p.y) > 90) continue;
      if ((ex - x) ** 2 + (ey - y) ** 2 > (r + e.body.w / 2) ** 2) continue;
      this.damageEnemy(e, dmg, p.id, ex, ey, 'blast');
    }
  }

  /** The elephant's stamp also sends a wave along the ground both ways (shots of the squad's: they hurt foes). */
  private tremorFrom(p: Player): void {
    for (const dir of [1, -1]) {
      this.rideBullet(p, p.x + dir * 30, p.y - 12, dir * 420, 0, MOUNT_POWER.stomp.damage * 0.5, {
        kind: 'wave',
        life: 0.7,
        pierce: true,
        size: 12,
      });
    }
  }

  /** Riders run troopers down: a ride at speed (or in its power move) tramples what it meets. */
  private rideTrample(p: Player, e: Enemy): boolean {
    if (p.ride < 0) return false;
    const m = this.mountDef(p);
    const k = mountOf(p.ride);
    const rushing = p.rush > 0 && (m.power === 'nitro' || m.power === 'charge');
    const fast = Math.abs(p.vx) > m.speed * 0.6;
    const dmg = rushing
      ? m.power === 'nitro'
        ? MOUNT_POWER.nitro.damage
        : MOUNT_POWER.charge.damage
      : fast || k === 'elephant' || k === 'tiger'
        ? m.ram
        : 0;
    if (dmg <= 0 || isBoss(e.kind)) return false;
    const last = p.rideHits.get(e.id) ?? -1e9;
    if (this.tick - last < this.ticks(RIDE_RAM_COOLDOWN_SEC)) return true;
    p.rideHits.set(e.id, this.tick);
    this.damageEnemy(e, dmg, p.id, e.body.x, e.body.y - e.body.h / 2, 'slide');
    return true;
  }

  private overdrive(p: Player): boolean {
    return this.tick < p.overdriveUntil;
  }

  private fire(p: Player): void {
    const w = GAME_CONFIG.weapons[p.weapon];
    const od = this.overdrive(p);
    const perk = heroPerk(p.hero);
    const cd = od ? w.cooldown / U.overdrive.fireRate : w.cooldown;
    // A faster trigger shortens the gap by a fraction of a tick; held fire carries the fraction from shot to shot
    // (scheduled from the planned time, not the tick it landed on), so even the 3-tick rapid gun really is faster.
    // With no fire-rate passive this is exactly `tick + ticks(cd)`.
    const held = p.nextFireTick > this.tick - 1;
    p.nextFireTick = (held ? p.nextFireTick : this.tick) + Math.max(1, this.ticks(cd)) / perk.fireRate;
    const base = Math.atan2(p.aimY, p.aimX);
    const crouch = p.crouch && p.aimY === 0;
    const mx = p.x + (p.aimY === 0 ? p.facing * 16 : p.aimX * 10);
    const seat = p.ride >= 0 ? this.mountDef(p).seat : 0; // from the saddle
    const my = p.y - seat - (crouch ? 12 : p.aimY < 0 ? P.height + 2 : p.aimY > 0 ? 8 : 22);
    const dmg = w.damage * (od ? U.overdrive.damage : 1) * (p.onGround ? 1 : perk.airGunDamage);
    for (let i = 0; i < w.pellets; i++) {
      const a = w.pellets === 1 ? base : base + (i / (w.pellets - 1) - 0.5) * w.spreadRad;
      const pierce = w.pierce || od;
      this.bullets.push({
        oy: p.y,
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
        turn: 0,
        hitsLeft: 0,
        ret: false,
        src: -1,
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
    const dmg = m.damage * (this.overdrive(p) ? U.overdrive.damage : 1) * heroPerk(p.hero).meleeDamage;
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
      if (!this.clearable(b) || b.kind === 'wave') return true;
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
    p.ult = Math.min(U.max, p.ult + n * heroPerk(p.hero).ultGain);
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
        this.bullets = this.bullets.filter(
          (b) => !this.clearable(b) || (b.x - cx) ** 2 + (b.y - cy) ** 2 > cr,
        );
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
            turn: 0,
            hitsLeft: 0,
            ret: false,
            src: -1,
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

  // ------------------------------------------------------------ powers (astras) and the team paramastra

  /** The ASTRA button: use the held power, or (with none) the team paramastra once it is charged. */
  private useAstra(p: Player): void {
    const PW = GAME_CONFIG.powers;
    // A boss is charging its pralay: the button answers it with the paramastra first, if it is ready.
    const answer = this.param >= PW.param.max && !this.paramStrike && this.shirshaCharging().length > 0;
    if (p.power && p.powerN > 0 && !answer) {
      const kind = p.power;
      p.powerN--;
      if (p.powerN === 0) p.power = null;
      const f = p.facing;
      const fy = p.y;
      let v: number | undefined;
      if (kind === 'vidyut') v = this.rng.int(3);
      else if (kind === 'tej') v = this.reflectableOrbs(p).length ? 1 : 0;
      this.emit({ e: 'astra', id: p.id, kind, x: r1(p.x), y: r1(fy), f, ...(v === undefined ? {} : { v }) });
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
            turn: 0,
            hitsLeft: 0,
            ret: false,
            src: -1,
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
        case 'jal': {
          // Rain over the way ahead: fire walls go out, burning ground cools, foes caught in it are hurt.
          const v = PW.jal;
          const lo = f > 0 ? p.x - v.back : p.x - v.range;
          const hi = f > 0 ? p.x + v.range : p.x + v.back;
          for (const g of this.level.gates)
            if (g.fire && !this.gateOpen[g.id] && g.col * T + T / 2 >= lo && g.col * T + T / 2 <= hi) {
              this.gateOpen[g.id] = true;
              this.emit({ e: 'gate', id: g.id });
            }
          // Jal is lord of the sea: the tide stands still at its lowest for a while, and Chhaya, caught in
          // the rain, gasps with her jaws open.
          if (this.level.tide) this.tideHoldUntil = this.tick + this.ticks(v.tideHoldSec);
          for (const e of this.enemies.values())
            if (e.kind === 'chhaya' && e.awake)
              e.mx = Math.max(e.mx, this.tick + this.ticks(E.chhaya.openSec));
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
          // Into Aandhi's storm: the wind astra turns it back on him.
          if (this.storm) {
            for (const e of this.enemies.values())
              if (e.kind === 'aandhi' && e.awake) {
                this.storm = null;
                e.atk = ATTACK.none;
                e.nextAtk = this.tick + this.ticks(2.2);
                e.mx = this.tick + this.ticks(2.2);
                this.damageEnemy(e, e.maxHp * E.aandhi.reversedShare, p.id, e.body.x, e.body.y - 60, 'astra');
                this.emit({ e: 'boom', x: r1(e.body.x), y: r1(e.body.y - 60), r: 70 });
              }
          }
          // A whirlwind walks out ahead: it carries troopers off (riot shields torn away), scatters their
          // shots, and hurls what it holds when it blows out. The first gust also staggers what stands close.
          const w = PW.vayu;
          this.twisters.push({
            x: p.x + f * w.ahead,
            y: fy,
            vx: f * w.speed,
            born: this.tick,
            until: this.tick + this.ticks(w.sec),
            owner: p.id,
            held: new Set(),
            fire: false,
          });
          for (const e of [...this.enemies.values()]) {
            if (!e.awake || isBoss(e.kind) || e.kind === 'turret') continue;
            const dx = (e.body.x - p.x) * f;
            if (dx < -20 || dx > w.gust || Math.abs(e.body.y - fy) > w.height) continue;
            e.shield = 0;
            e.knockUntil = this.tick + this.ticks(w.pushSec);
            e.knockVx = f * w.push;
            if (e.body.onGround) e.body.vy = -260;
          }
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
        case 'naga': {
          // Serpents that never miss: each one steers toward the nearest foe.
          const N = PW.naga;
          for (let i = 0; i < N.serpents; i++) {
            const a = (f > 0 ? 0 : Math.PI) + (i - (N.serpents - 1) / 2) * 0.5;
            this.playerShot(p, 'serpent', p.x + f * 14, fy - 24, a, N.speed, N.damage, {
              life: N.lifeSec,
              turn: N.turn,
              size: 6,
            });
          }
          break;
        }
        case 'shyen': {
          // The eagle dives: serpents and shots vanish from the sky, flyers are crushed, the caller is shielded.
          const g = PW.shyen;
          const near = (x: number): boolean => Math.abs(x - p.x) <= g.range;
          this.bullets = this.bullets.filter((b) => !this.clearable(b) || !near(b.x));
          for (const e of [...this.enemies.values()]) {
            if (!e.awake || !near(e.body.x)) continue;
            const flyer = e.kind === 'drone' || e.kind === 'jetpack' || e.kind === 'gunship';
            this.damageEnemy(
              e,
              this.ultDamage(e, flyer ? g.flyerDamage : g.damage),
              p.id,
              e.body.x,
              e.body.y - e.body.h / 2,
              'astra',
            );
          }
          p.invulnUntil = Math.max(p.invulnUntil, this.tick + this.ticks(g.shieldSec));
          break;
        }
        case 'chakram': {
          const S = PW.chakram;
          // A great discus covers the sun: Suryakavach lowers his guard at once
          for (const q of this.enemies.values()) if (q.kind === 'suryakavach' && q.awake) this.eclipse(q);
          const b = this.playerShot(
            p,
            'chakra',
            p.x + f * 16,
            fy - 26,
            f > 0 ? 0 : Math.PI,
            S.speed,
            S.damage,
            {
              life: S.maxSec,
              turn: S.turn,
              size: 10,
              pierce: true,
            },
          );
          b.hitsLeft = S.hits;
          break;
        }
        case 'vidyut':
          this.vidyut(p, v ?? 0);
          break;
        case 'maya': {
          // Mayakaar's art turned back on his hall: every illusion shows as it is, false floors hold, mirror shades
          // vanish, and the great mirror's shine goes dull.
          this.mayaUntil = this.tick + this.ticks(GAME_CONFIG.maya.revealSec);
          for (const e of [...this.enemies.values()]) {
            if (e.kind === 'mirror' && Math.abs(e.body.x - p.x) < 900) {
              this.damageEnemy(e, e.hp + 1, p.id, e.body.x, e.body.y - 17, 'astra');
            }
            if (e.kind === 'darpan' && e.awake)
              e.mx = Math.max(e.mx, this.tick + this.ticks(E.darpan.mayaSec));
          }
          this.emit({ e: 'boom', x: r1(p.x), y: r1(p.y - 30), r: 120 });
          break;
        }
        case 'tej': {
          const V = PW.tej;
          const orbs = this.reflectableOrbs(p);
          for (const b of orbs) {
            // Only a tej stops a tej: the orb turns and flies back at the boss that called it.
            const boss = this.enemies.get(b.src);
            b.enemy = false;
            b.owner = p.id;
            b.turn = 5;
            b.blast = 0;
            b.size = 18;
            b.pierce = false;
            b.hit = null;
            b.dmg = boss ? boss.maxHp * V.reflectShare : V.boltDamage;
            b.expires = this.tick + this.ticks(4);
            const fixed = boss && isFixedBoss(boss.kind);
            const tx = boss ? boss.body.x - (fixed ? boss.body.w / 2 : 0) : b.x - b.vx;
            const ty = boss ? boss.body.y - boss.body.h / 2 : b.y;
            const a = Math.atan2(ty - b.y, tx - b.x);
            b.vx = Math.cos(a) * V.speed * 0.8;
            b.vy = Math.sin(a) * V.speed * 0.8;
          }
          if (orbs.length) {
            this.addCombo(p, C.parry * 2);
            this.emit({ e: 'style', id: p.id, t: 'parry', x: r1(p.x), y: r1(p.y - 40) });
          } else
            this.playerShot(p, 'orb', p.x + f * 16, fy - 24, f > 0 ? 0 : Math.PI, V.speed, V.boltDamage, {
              life: 1.6,
              size: 12,
            });
          break;
        }
      }
      return;
    }
    if (this.param >= PW.param.max && !this.paramStrike) {
      this.param = 0;
      this.paramStrike = { at: this.tick + this.ticks(PW.param.windupSec), id: p.id, x: p.x, y: p.y };
      // Paramastra meets pralay: both are spent, and the boss that called it reels.
      const B = GAME_CONFIG.bossAstra.pralay;
      for (const e of this.shirshaCharging()) {
        const r = e.rule as RuleState;
        const c = this.castPoint(e);
        r.kind = null;
        r.nextShirsha = this.tick + this.ruleTicks(B.everySec);
        r.stunUntil = this.tick + this.ticks(B.stunSec);
        this.emit({ e: 'bossAstra', kind: 'pralay', phase: 2, x: r1(c.x), y: r1(c.y) });
        this.damageEnemy(e, e.maxHp * B.counterShare, p.id, e.body.x, e.body.y - e.body.h / 2, 'astra');
      }
      // The whole squad is shielded through the strike.
      for (const q of this.players.values())
        if (q.state === 'alive')
          q.invulnUntil = Math.max(
            q.invulnUntil,
            this.tick + this.ticks(PW.param.windupSec + PW.param.shieldSec),
          );
      this.emit({ e: 'param', id: p.id, x: r1(p.x), y: r1(p.y), phase: 0 });
    }
  }

  private chargeParam(n: number): void {
    if (this.paramStrike) return;
    const boost = this.shirshaCharging().length ? GAME_CONFIG.bossAstra.pralay.chargeBoost : 1;
    this.param = Math.min(GAME_CONFIG.powers.param.max, this.param + n * boost);
  }

  /** A player projectile (astras use this; plain gunfire builds its own in `fire`). */
  private playerShot(
    p: Player,
    kind: BulletKind,
    x: number,
    y: number,
    angle: number,
    speed: number,
    dmg: number,
    o: { life: number; turn?: number; size?: number; pierce?: boolean; blast?: number },
  ): Bullet {
    const b: Bullet = {
      id: this.nextBulletId++,
      enemy: false,
      owner: p.id,
      kind,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      dmg,
      pierce: o.pierce ?? false,
      expires: this.tick + this.ticks(o.life),
      born: this.tick,
      lag: 0,
      weapon: null,
      power: false,
      hit: o.pierce ? new Set() : null,
      grav: 0,
      blast: o.blast ?? 0,
      size: o.size ?? 4,
      turn: o.turn ?? 0,
      hitsLeft: 0,
      ret: false,
      src: -1,
      oy: y,
    };
    this.bullets.push(b);
    return b;
  }

  /** A boss's tej orbs close enough to this soldier to be turned back. */
  private reflectableOrbs(p: Player): Bullet[] {
    const R = GAME_CONFIG.powers.tej.reflectRange;
    return this.bullets.filter(
      (b) => b.enemy && b.kind === 'orb' && Math.hypot(b.x - p.x, b.y - (p.y - 20)) <= R,
    );
  }

  /** Vidyut takes a different form each call: 0 a trident strike, 1 a spirit ally, 2 a rain of fire. */
  private vidyut(p: Player, form: number): void {
    const PP = GAME_CONFIG.powers.vidyut;
    if (form === 0) {
      const list = [...this.enemies.values()]
        .filter((e) => e.awake && Math.hypot(e.body.x - p.x, e.body.y - p.y) < PP.strike.range)
        .sort((a, b) => Math.abs(a.body.x - p.x) - Math.abs(b.body.x - p.x))
        .slice(0, PP.strike.targets);
      for (const e of list) {
        const ey = e.body.y - e.body.h / 2;
        e.shield = 0;
        this.emit({ e: 'boom', x: r1(e.body.x), y: r1(ey), r: 40 });
        this.damageEnemy(e, this.ultDamage(e, PP.strike.damage), p.id, e.body.x, ey, 'astra');
      }
    } else if (form === 1) {
      this.spirits.push({
        x: p.x - p.facing * 30,
        y: p.y - 62,
        until: this.tick + this.ticks(PP.spirit.sec),
        next: this.tick + this.ticks(0.3),
        owner: p.id,
      });
    } else {
      const R = PP.rain;
      for (let i = 0; i < R.bolts; i++) {
        const x = p.x + p.facing * (-40 + (i / (R.bolts - 1)) * R.spread) + this.rng.range(-20, 20);
        const b = this.playerShot(p, 'meteor', x, -30 - i * 44, Math.PI / 2, 720, R.damage, {
          life: 3,
          size: 4,
          blast: R.blast,
        });
        b.vx = p.facing * 30;
      }
    }
  }

  /** The nearest awake foe to a point within `range` (centre of its body; the final boss's front). */
  private nearestFoe(x: number, y: number, range: number, skip?: Set<number> | null): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.enemies.values()) {
      if (!e.awake || skip?.has(e.id)) continue;
      const a = this.aimPoint(e);
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private aimPoint(e: Enemy): { x: number; y: number } {
    const b = e.body;
    if (e.kind === 'vriksha')
      return { x: b.x - b.w / 2 + 24, y: b.y - (e.phase >= 2 ? E.vriksha.heartRise + 50 : 110) };
    if (e.kind === 'chhaya') return { x: b.x - b.w / 2 + 30, y: b.y - 190 };
    if (e.kind === 'aandhi') return { x: b.x, y: b.y - 70 };
    if (e.kind === 'vishdhar') return { x: b.x - b.w / 2 + 30, y: b.y - 90 };
    if (e.kind === 'darpan') return { x: b.x - b.w / 2 + 10, y: b.y - 120 };
    return e.kind === 'boss' ? { x: b.x - b.w / 2 + 10, y: b.y - 120 } : { x: b.x, y: b.y - b.h / 2 };
  }

  /** Sets an enemy alight (agni). Bosses only smoulder briefly: the fire is for the host, not the asura. */
  private ignite(e: Enemy, by: string, gen = 0): void {
    const A = GAME_CONFIG.powers.agni;
    if (e.burnUntil <= this.tick) e.burnBy = by;
    e.burnGen = e.burnUntil > this.tick ? Math.min(e.burnGen, gen) : gen;
    e.burnUntil = Math.max(
      e.burnUntil,
      this.tick + this.ticks(isBoss(e.kind) ? A.alightSec / 3 : A.alightSec),
    );
  }

  /** The vayu whirlwinds: walk, gather, carry, and hurl. */
  private stepTwisters(): void {
    const w = GAME_CONFIG.powers.vayu;
    const W = levelWidth(this.level);
    for (const t of this.twisters) {
      const age = (this.tick - t.born) / this.tickRate;
      // it walks until rock stops it
      const nx = t.x + t.vx * this.dt;
      if (nx < 24 || nx > W - 24 || solidAtPoint(this.world, nx + Math.sign(t.vx) * 14, t.y - 20)) t.vx = 0;
      else t.x = nx;
      const over = t.until <= this.tick;
      // wind feeds fire: over burning ground the whirlwind catches light
      if (!t.fire && this.burns.some((f) => t.x > f.x0 - 20 && t.x < f.x1 + 20 && Math.abs(f.y - t.y) < 60)) {
        t.fire = true;
        this.emit({ e: 'boom', x: r1(t.x), y: r1(t.y - 40), r: 70 });
      }
      for (const e of [...this.enemies.values()]) {
        if (!e.awake) continue;
        const b = e.body;
        const cy = b.y - b.h / 2;
        const dx = b.x - t.x;
        const inReach = Math.abs(dx) < w.reach && cy > t.y - w.tall && cy < t.y + 40;
        if (isBoss(e.kind) || e.kind === 'turret') {
          // too heavy or bolted down: the wind only tears at them
          if (inReach && Math.abs(dx) < w.reach * 0.5)
            this.damageEnemy(e, this.ultDamage(e, w.dps * this.dt), t.owner, b.x, cy, 'astra');
          continue;
        }
        if (!t.held.has(e.id)) {
          if (!inReach || t.held.size >= w.carry) continue;
          t.held.add(e.id);
          e.shield = 0;
        }
        if (over) continue;
        e.liftUntil = this.tick + 2;
        // round the column and up it: each rider on its own turn of the spiral
        const ph = age * w.spin + e.id * 2.4;
        const up = Math.min(1, age / w.riseSec);
        const h = up * (w.tall * (0.3 + 0.5 * (((e.id * 37) % 10) / 10)));
        const rad = 14 + h * 0.3;
        const tx = t.x + Math.cos(ph) * rad;
        const ty = t.y - h;
        const k = Math.min(1, this.dt * 9);
        b.vx = ((tx - b.x) * k) / this.dt;
        b.vy = ((ty - b.y) * k) / this.dt;
        b.onGround = false;
        moveBody(this.world, b, this.dt);
        b.vx = b.vy = 0;
        b.facing = Math.cos(ph) > 0 ? 1 : -1;
        if (t.fire) this.ignite(e, t.owner);
        this.damageEnemy(e, w.dps * this.dt, t.owner, b.x, b.y - b.h / 2, 'astra');
      }
      // their shots are swept up too
      this.bullets = this.bullets.filter(
        (bl) =>
          !this.clearable(bl) ||
          Math.abs(bl.x - t.x) > w.reach * 0.7 ||
          bl.y < t.y - w.tall ||
          bl.y > t.y + 20,
      );
      if (over) {
        // blown out: everything it carried is hurled away, alternately to each side
        let n = 0;
        const dir = Math.sign(t.vx) || 1;
        for (const id of t.held) {
          const e = this.enemies.get(id);
          if (!e) continue;
          const side = n++ % 3 === 2 ? -dir : dir;
          e.liftUntil = 0;
          e.knockUntil = this.tick + this.ticks(w.flingSec);
          e.knockVx = side * w.fling;
          e.body.vy = -w.flingUp;
          this.damageEnemy(e, w.flingDamage, t.owner, e.body.x, e.body.y - e.body.h / 2, 'astra');
        }
        this.emit({ e: 'boom', x: r1(t.x), y: r1(t.y - 60), r: 90 });
      }
    }
    this.twisters = this.twisters.filter((t) => t.until > this.tick);
  }

  /** Burning ground, black holes and the paramastra strike, once per tick. */
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
          this.ignite(e, f.owner);
        }
    }
    // Set alight: the fire goes on eating at them after they leave the flames, and catches whoever they brush.
    {
      const A = PW.agni;
      const lit = [...this.enemies.values()].filter((e) => e.awake && e.burnUntil > this.tick);
      for (const e of lit) {
        if (!this.enemies.has(e.id)) continue;
        const b = e.body;
        // it passes on to those it brushes, but not for ever: two hand-overs, and none to the freshly burnt
        if (e.burnGen < 2)
          for (const o of this.enemies.values()) {
            if (o === e || !o.awake || isBoss(o.kind)) continue;
            if (o.burnUntil + this.ticks(A.alightSec) > this.tick) continue;
            if (Math.abs(o.body.x - b.x) < A.spread && Math.abs(o.body.y - b.y) < A.spread)
              this.ignite(o, e.burnBy, e.burnGen + 1);
          }
        this.damageEnemy(e, this.ultDamage(e, A.alightDps * this.dt), e.burnBy, b.x, b.y - b.h / 2, 'astra');
      }
    }
    if (this.twisters.length) this.stepTwisters();
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
    if (this.spirits.length) {
      const S = PW.vidyut.spirit;
      for (const sp of this.spirits) {
        const o = this.players.get(sp.owner);
        if (o) {
          sp.x += (o.x - o.facing * 30 - sp.x) * Math.min(1, this.dt * 5);
          sp.y += (o.y - 62 - sp.y) * Math.min(1, this.dt * 5);
        }
        if (o && this.tick >= sp.next) {
          sp.next = this.tick + this.ticks(S.everySec);
          const e = this.nearestFoe(sp.x, sp.y, S.range);
          if (e) {
            const a = this.aimPoint(e);
            this.playerShot(o, 'spark', sp.x, sp.y, Math.atan2(a.y - sp.y, a.x - sp.x), 640, S.damage, {
              life: 1.2,
              turn: 4,
              size: 3,
            });
          }
        }
      }
      this.spirits = this.spirits.filter((sp) => sp.until > this.tick && this.players.has(sp.owner));
    }
    const st = this.paramStrike;
    if (st && this.tick >= st.at) {
      this.paramStrike = null;
      const B = PW.param;
      this.emit({ e: 'param', id: st.id, x: r1(st.x), y: r1(st.y), phase: 1 });
      for (const e of [...this.enemies.values()]) {
        if (!e.awake || Math.abs(e.body.x - st.x) > B.range) continue;
        e.shield = 0;
        // Saptashir: the paramastra strikes his heart (his one weakness): every head falls with it
        if (e.kind === 'saptashir') {
          e.my = 0;
          e.leapX = 0;
          e.atkParam = this.tick;
        }
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
    if (this.clearable(b))
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
    const targets = this.bullets.filter(
      (b) => b.enemy && (b.kind === 'missile' || b.kind === 'grenade' || b.kind === 'serpent'),
    );
    const gone = new Set<Bullet>();
    for (const b of this.bullets) {
      if (gone.has(b)) continue;
      if (this.tick >= b.expires) {
        if (b.blast > 0) this.explode(b);
        continue;
      }
      if (b.kind === 'missile') this.steerMissile(b);
      else if (b.turn > 0 && !this.steerHoming(b)) continue; // a discus caught by its thrower
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
        else if (b.y < -40 && b.kind !== 'rocket' && b.kind !== 'meteor' && b.kind !== 'arrow') alive = false;
        // Homing astras (serpents, the discus, orbs, sparks) fly through rock: they never miss.
        else if (b.turn === 0 && solidAtPoint(this.world, b.x, b.y)) {
          alive = false;
          if (b.blast > 0) this.explode(b);
        } else if (b.enemy) alive = this.bulletVsPlayers(b);
        else
          alive =
            this.bulletVsGoal(b) &&
            this.bulletVsEnemies(b) &&
            (b.kind !== 'shot' || this.shootDown(b, targets, gone));
      }
      if (alive) keep.push(b);
    }
    this.bullets = gone.size ? keep.filter((b) => !gone.has(b)) : keep;
  }

  /**
   * Homing projectiles: player serpents, sparks and the discus seek foes (the discus flies home once it has hit
   * enough of them or flown long enough), a turned-back orb seeks the boss that called it, and enemy serpents and
   * orbs seek soldiers. Returns false when the projectile is done (the discus is back in its thrower's hand).
   */
  private steerHoming(b: Bullet): boolean {
    let tx: number;
    let ty: number;
    if (b.kind === 'chakra') {
      const S = GAME_CONFIG.powers.chakram;
      if (!b.ret && this.tick - b.born >= this.ticks(S.outSec)) b.ret = true;
      if (b.ret) {
        const o = this.players.get(b.owner);
        if (!o || o.state !== 'alive') return false;
        const dx = o.x - b.x;
        const dy = o.y - P.height / 2 - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 28) return false;
        const sp = S.speed * 1.25;
        b.vx = (dx / d) * sp;
        b.vy = (dy / d) * sp;
        return true;
      }
    }
    if (b.enemy) {
      const t = this.nearestAlive(b.x, b.y, 1600);
      if (!t) return true;
      tx = t.x;
      ty = t.y - P.height / 2;
    } else {
      const src = b.src >= 0 ? this.enemies.get(b.src) : undefined;
      const seek =
        b.kind === 'chakra'
          ? GAME_CONFIG.powers.chakram.seek
          : b.kind === 'serpent'
            ? GAME_CONFIG.powers.naga.seek
            : 700;
      const e = src ?? this.nearestFoe(b.x, b.y, seek, b.hit);
      if (!e) return true;
      const a = this.aimPoint(e);
      tx = a.x;
      ty = a.y;
    }
    const want = Math.atan2(ty - b.y, tx - b.x);
    const cur = Math.atan2(b.vy, b.vx);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.max(-b.turn * this.dt, Math.min(b.turn * this.dt, d));
    const sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(cur + turn) * sp;
    b.vy = Math.sin(cur + turn) * sp;
    return true;
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
    if (b.ret) return true; // the discus on its way home hits nothing
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
      // Darpan-asur, shining: the shot is turned straight back at the squad.
      if (e.kind === 'darpan' && this.tick >= e.mx) {
        b.enemy = true;
        b.owner = '';
        b.vx = -b.vx;
        b.vy = -b.vy * 0.4;
        b.dmg = E.darpan.reflectDmg;
        b.pierce = false;
        b.hit = null;
        b.turn = 0;
        b.x = e.body.x - e.body.w / 2 - 8;
        this.emit({ e: 'ehit', id: e.id, x: r1(b.x), y: r1(b.y) });
        return true;
      }
      // a painted guard still in its frame is only paint
      if (e.kind === 'painting' && e.burst === 0) return true;
      // Meghbaan's warriors are unseen and untouchable but for the moment they shoot
      if (e.kind === 'mayavi' && this.tick >= e.mx) return true;
      // Nidrasur: bullets bounce off his sleeping bulk (and the noise does what bullets cannot)
      if (e.kind === 'nidrasur') return true;
      // Jodasur split in two: nothing to hit where he stood (a shot flies on to his halves, which may be right there)
      if (e.kind === 'jodasur' && e.burst === 1) continue;
      // one of his halves: a shot cannot kill it, only push it the way the shot flies
      if (e.kind === 'ardh') {
        const fin = this.level.arenas[e.arena];
        const nx = e.body.x + Math.sign(b.vx || 1) * E.ardh.push;
        e.body.x = fin ? Math.max(fin.left + 20, Math.min(this.arenaWall(fin) - 20, nx)) : nx;
        e.hitTick = this.tick;
        e.nextFire = this.tick + this.ticks(E.ardh.stunSec); // knocked back: it stops crawling a moment
        this.emit({ e: 'ehit', id: e.id, x: r1(b.x), y: r1(b.y) });
        if (!b.pierce) return false;
        b.hit?.add(e.id);
        continue;
      }
      // a mace spinning: shots glance off
      if (e.kind === 'gadadhar' && e.burst === 1) {
        this.emit({ e: 'ehit', id: e.id, x: r1(b.x), y: r1(b.y) });
        return false;
      }
      let dmg = b.power && isBoss(e.kind) ? b.dmg / U.overdrive.damage : b.dmg;
      // Tree demons: thick bark in front, soft behind.
      if (e.kind === 'treant' && !b.enemy) dmg *= b.vx * e.body.facing < 0 ? E.treant.front : E.treant.back;
      // Crab asuras: the shell turns shots from the front (from above, or behind, they bite).
      if (e.kind === 'crab' && !b.enemy && Math.abs(b.vx) > Math.abs(b.vy))
        dmg *= b.vx * e.body.facing < 0 ? E.crab.front : E.crab.back;
      // The banyan's heart, once its bark hardens, only feels shots fired from up in its boughs.
      if (e.kind === 'vriksha' && e.phase >= 2 && (b.oy ?? b.y) > e.body.y - E.vriksha.heartRise)
        dmg *= E.vriksha.barkDamage;
      // Aandhi: his sage's guise turns half of every blow, except while he holds up a storm (or reels from his own).
      if (e.kind === 'aandhi' && !this.storm && this.tick >= e.mx) dmg *= E.aandhi.guise;
      // Suryakavach's boon: while the sun shines nothing touches him.
      if (e.kind === 'suryakavach' && this.tick >= e.mx) {
        if (this.tick % 4 === 0) this.emit({ e: 'immune', id: e.id, x: r1(b.x), y: r1(b.y) });
        return false;
      }
      // a mace spinner dizzy from spinning: hits land double
      if (e.kind === 'gadadhar' && e.burst === 2) dmg *= 2;
      // Raakhasur's body is hardened, except while he reels from his own touch.
      if (e.kind === 'raakhasur' && this.tick >= e.mx) dmg *= E.raakhasur.hard;
      // Vishdhar: his scales turn most of a shot; dance on his heads instead.
      if (e.kind === 'vishdhar') dmg *= E.vishdhar.shot;
      // Chhaya: only while her jaws hang open after a grab do shots really hurt her.
      if (e.kind === 'chhaya' && this.tick >= e.mx) dmg *= E.chhaya.shut;
      // A plain tej bolt is an astra, not a boss killer (a turned-back orb carries its own damage).
      if (b.kind === 'orb' && b.src < 0) dmg = this.ultDamage(e, dmg);
      this.damageEnemy(e, dmg, b.owner, b.x, b.y, 'gun');
      if (b.kind === 'flame' && b.power && !b.enemy) this.ignite(e, b.owner);
      if (b.kind === 'orb' && b.src >= 0) this.emit({ e: 'boom', x: r1(b.x), y: r1(b.y), r: 90 });
      if (!b.pierce) return false;
      b.hit?.add(e.id);
      if (b.kind === 'chakra' && --b.hitsLeft <= 0) {
        b.ret = true;
        return true;
      }
    }
    return true;
  }

  private damageEnemy(e: Enemy, dmg: number, by: string, x: number, y: number, src: DamageSource): void {
    if (!this.enemies.has(e.id)) return;
    if (e.rule?.storm) {
      // Samarpanastra: nothing touches its caller while the storm rages.
      if (this.tick % 4 === 0) this.emit({ e: 'immune', id: e.id, x: r1(x), y: r1(y) });
      return;
    }
    if (e.rule && this.tick < e.rule.spentUntil) dmg *= GAME_CONFIG.bossAstra.samarpan.spentDamage;
    // Saptashir: his heads take the blows while any stands (the paramastra cuts them all first: see stepPowers)
    if (e.kind === 'saptashir' && e.my > 0) {
      const c = E.saptashir;
      e.leapX += dmg;
      while (e.leapX >= c.headHp && e.my > 0) {
        e.leapX -= c.headHp;
        e.my--;
        e.atkParam = this.tick; // (regrowth starts over)
        this.emit({ e: 'boom', x: r1(e.body.x - 54 + e.my * 18), y: r1(e.body.y - 205), r: 24 });
      }
      dmg *= c.guarded;
    }
    e.hp -= dmg;
    // a slow burn or a whirlwind's wear does not flash the enemy white every tick: it would stay white
    if (src !== 'astra' || dmg >= 1) e.hitTick = this.tick;
    const p = this.players.get(by);
    if (p && this.param >= 0 && src !== 'astra') this.chargeParam(dmg * GAME_CONFIG.powers.param.perDamage);
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
    // Jodasur brought down: he splits in two (see stepJodasur)
    if (e.kind === 'jodasur' && e.burst === 0) {
      this.splitJodasur(e);
      return;
    }
    if (e.kind === 'jodasur' && e.burst === 1) {
      e.hp = 0.001;
      return;
    }
    // his halves never fall to damage: they are pushed apart
    if (e.kind === 'ardh') {
      e.hp = 1;
      return;
    }
    // An ash golem brought down by plain weapons is only a heap of ash: it rises again, unless fire or an astra
    // finishes it.
    if (e.kind === 'golem' && src !== 'astra' && src !== 'ult' && this.tick >= e.burnUntil) {
      e.hp = 0.001;
      if (e.burst !== 1) {
        e.burst = 1;
        e.atkStart = this.tick;
        this.emit({ e: 'boom', x: r1(e.body.x), y: r1(e.body.y - 10), r: 26 });
      }
      return;
    }
    this.enemies.delete(e.id);
    const kind = e.kind;
    let pts: number = E[kind].score * (e.elite ? GAME_CONFIG.bossMoves.elite.score : 1);
    if (e.elite) {
      const EL = GAME_CONFIG.bossMoves.elite;
      if (p) {
        this.gainUlt(p, EL.ult);
        p.hp = Math.min(P.maxHp, p.hp + EL.heal);
      }
      this.emit({ e: 'elite', x: r1(e.body.x), y: r1(e.body.y - e.body.h / 2), by });
    }
    if (p) {
      this.addCombo(p, C.killBonus);
      if (this.param >= 0 && src !== 'astra') this.chargeParam(GAME_CONFIG.powers.param.perKill);
      pts = Math.round(pts * this.comboMultiplier(p));
      p.stats.kills++;
      p.stats.score += pts;
      if (src !== 'ult') this.gainUlt(p, U.perKill);
      // the carried astra comes back with the fighting (but an astra does not feed itself)
      if (
        src !== 'astra' &&
        p.power &&
        p.powerN < GAME_CONFIG.powers.maxCharges &&
        ++p.astraKills >= GAME_CONFIG.powers.regainKills
      ) {
        p.astraKills = 0;
        p.powerN++;
        this.emit({ e: 'regain', id: p.id, kind: p.power });
      }
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
      this.pending = this.pending.filter((q) => !q.fromBoss);
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
      if (b.kind === 'net') p.netUntil = this.tick + this.ticks(E.netter.netSec);
      this.hurtPlayer(p, b.dmg);
      return b.kind === 'wave'; // shockwaves roll on
    }
    return true;
  }

  private hurtPlayer(p: Player, dmg: number): void {
    if (p.state !== 'alive' || this.phase !== 'playing') return;
    if (this.tick < p.invulnUntil || this.dodging(p)) return;
    let d = dmg * GAME_CONFIG.mission.enemyDamage[this.settings.difficulty] * this.mods.enemyDamage;
    if (p.ride >= 0) {
      // the ride takes the hits while it lasts
      p.mountHp -= d * this.mountDef(p).armor;
      p.lastHurt = this.tick;
      p.invulnUntil = this.tick + this.ticks(P.hurtInvulnSec * 0.6);
      this.emit({ e: 'hurt', id: p.id, dmg: Math.round(d) });
      if (p.mountHp <= 0) this.dismount(p, true);
      return;
    }
    if (this.overdrive(p)) d *= U.overdrive.damageTaken;
    d *= heroPerk(p.hero).damageTaken;
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
    this.dismount(p, false);
    p.state = 'dead';
    p.hp = 0;
    p.vx = 0;
    p.input = { ...NEUTRAL_INPUT };
    p.dashTicks = p.slideTicks = 0;
    p.overdriveUntil = 0;
    p.weapon = 'blaster'; // like the arcade classics: going down costs your special gun
    p.stats.deaths++;
    this.breakCombo(p);
    p.respawnAt = this.tick + this.ticks(P.respawnSec * heroPerk(p.hero).respawn);
    this.emit({ e: 'ko', id: p.id });
  }

  private stepContact(): void {
    for (const e of this.enemies.values()) {
      if (!e.awake || e.kind === 'turret' || isFixedBoss(e.kind)) continue;
      if (e.kind === 'golem' && e.burst === 1) continue; // a heap of ash
      if (e.kind === 'raakhasur') continue; // his touch is his own attack (the rush)
      if (e.kind === 'elephant' && e.burst === 2) continue; // charging: it tramples instead (stepElephant)
      if (e.kind === 'jodasur' && e.burst === 1) continue; // split in two
      if (e.kind === 'ardh') continue; // a half crawling to its other half: it only wants to join
      if (e.kind === 'mayavi') continue; // it never comes down to fight
      if (e.kind === 'nidrasur') continue; // asleep he hurts nobody; rolling, stepNidrasur crushes
      const b = e.body;
      const boss = isBoss(e.kind);
      const dmg = e.kind === 'walker' ? E.walker.contactDmg : E.contactDmg;
      for (const p of this.players.values()) {
        if (p.state !== 'alive') continue;
        if (p.slideTicks > 0 && !boss) continue; // sliding knocks troopers over instead
        const h = p.crouch ? P.crouchHeight : P.height;
        const reach = p.ride >= 0 ? 18 : 0; // a ride is bigger than its rider
        const overlapX = Math.abs(p.x - b.x) < (p.w + b.w) / 2 - 2 + reach;
        const overlapY = p.y - h < b.y && p.y > b.y - b.h;
        if (overlapX && overlapY && !this.rideTrample(p, e)) this.hurtPlayer(p, dmg);
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
        if (pk.secret) this.emit({ e: 'secret', id: pk.id, x: r1(pk.x), y: r1(pk.y), by: p.id });
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
        } else {
          if (a.survive > 0) this.arenaEnd[a.id] = this.tick + this.ticks(a.survive);
          this.startWave(a, 0);
        }
      } else if (st === 1) {
        if (a.survive > 0) {
          this.stepHoldOut(a);
          continue;
        }
        let left = 0;
        let bosses = 0;
        for (const e of this.enemies.values()) {
          if (e.arena !== a.id) continue;
          if (isBoss(e.kind)) bosses++;
          else if (!e.fromBoss || !a.boss) left++;
        }
        for (const q of this.pending) if (q.arena === a.id && (!q.fromBoss || !a.boss)) left++;
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
          if (this.arenaNext[a.id] === -1) this.arenaNext[a.id] = this.tick + this.ticks(2.5);
          else if (this.tick >= (this.arenaNext[a.id] as number)) this.startWave(a, next);
        } else this.clearArena(a);
      }
    }
  }

  /**
   * A hold-out arena: the waves come round and round (the next one as soon as one attacker or none is left)
   * until the time is up; then whoever is still standing flees and the arena is clear.
   */
  private stepHoldOut(a: ArenaDef): void {
    if (this.tick >= (this.arenaEnd[a.id] as number)) {
      this.pending = this.pending.filter((q) => q.arena !== a.id);
      for (const e of [...this.enemies.values()]) {
        if (e.arena !== a.id || isBoss(e.kind)) continue;
        this.enemies.delete(e.id);
        this.emit({
          e: 'ekill',
          id: e.id,
          kind: e.kind,
          x: r1(e.body.x),
          y: r1(e.body.y - e.body.h / 2),
          by: '',
          pts: 0,
        });
      }
      this.clearArena(a);
      return;
    }
    let left = 0;
    for (const e of this.enemies.values()) if (e.arena === a.id) left++;
    for (const q of this.pending) if (q.arena === a.id) left++;
    if (left > 1) return;
    if (this.arenaNext[a.id] === -1) this.arenaNext[a.id] = this.tick + this.ticks(0.8);
    else if (this.tick >= (this.arenaNext[a.id] as number))
      this.startWave(a, (this.arenaWave[a.id] as number) + 1);
  }

  /**
   * The stage's hazard (LevelDef.hazard). Skyfall: every few seconds fireballs fall round one soldier, each on a
   * spot the client marks on the ground first. It rests while a boss is awake (a boss is hazard enough) and for
   * the opening seconds of a stage.
   */
  /** True while a soldier stands in a rest stop. */
  private resting(p: Player): boolean {
    return this.level.rests.some((r) => p.x >= r.x0 && p.x <= r.x1);
  }

  /** The sacred fire of a rest stop heals whoever stands by it. */
  private stepRests(): void {
    if (!this.level.rests.length) return;
    const heal = GAME_CONFIG.mission.restHeal * this.dt;
    for (const p of this.players.values())
      if (p.state === 'alive' && p.hp < P.maxHp && this.resting(p)) p.hp = Math.min(P.maxHp, p.hp + heal);
  }

  /** This run's surprises, placed from the seed (a generator of their own, so the rest of the run is unchanged). */
  private planSurprises(seed: number): { x: number; kind: SurpriseKind; done: boolean }[] {
    const pool = SURPRISE_POOLS[this.level.id];
    if (!pool || !this.level.own) return [];
    const rng = new Rng((seed * 7919 + 104729) % 2147483646 || 1);
    const fin = this.level.arenas.find((a) => a.gate === -1);
    const x0 = this.level.start.x + 700;
    const x1 = (fin ? fin.left : levelWidth(this.level)) - 500;
    if (x1 - x0 < 1500) return [];
    const n = 3;
    const bless = rng.int(n);
    const out: { x: number; kind: SurpriseKind; done: boolean }[] = [];
    let last: SurpriseKind | null = null;
    for (let i = 0; i < n; i++) {
      const seg = (x1 - x0) / n;
      let x = x0 + seg * i + seg * (0.15 + 0.7 * rng.range(0, 1));
      // never in a rest stop or on an arena's doorstep
      for (const r of this.level.rests) if (x > r.x0 - 250 && x < r.x1 + 250) x = r.x1 + 260;
      for (const a of this.level.arenas) if (x > a.trigger - 300 && x < a.right + 200) x = a.right + 220;
      // a surprise pushed past a rest stop must not land on (or behind) the next one's spot
      const prev = out[out.length - 1];
      if (prev && x < prev.x + 400) {
        x = prev.x + 400;
        for (const r of this.level.rests) if (x > r.x0 - 250 && x < r.x1 + 250) x = r.x1 + 260;
      }
      if (x > x1) continue;
      // nothing twice in one run while the stage has others left
      const fresh = pool.filter((k) => !out.some((o) => o.kind === k));
      const choices = fresh.length ? fresh : pool.filter((k) => k !== last);
      const kind: SurpriseKind =
        i === bless ? 'blessing' : (choices[rng.int(choices.length)] as SurpriseKind);
      out.push({ x: Math.round(x), kind, done: false });
      last = kind;
    }
    return out;
  }

  /** Where this run's surprises lie (tests, and the trailer tools). */
  surprisePlan(): readonly { x: number; kind: SurpriseKind }[] {
    return this.surprises.map(({ x, kind }) => ({ x, kind }));
  }

  private stepSurprises(): void {
    if (!this.surprises.length) return;
    const run = this.surpriseRun;
    if (run) {
      if (this.tick >= run.until) this.surpriseRun = null;
      else if (this.tick >= run.next) {
        const alive = [...this.players.values()].filter((p) => p.state === 'alive');
        const p = alive[this.rng.int(Math.max(1, alive.length))];
        if (p && run.kind === 'skyfall') {
          this.meteorVolley(p, 3);
          run.next = this.tick + this.ticks(1.2);
        } else if (p && run.kind === 'tremor') {
          const q = alive.find((x) => x.onGround);
          if (q) this.tremorWave(q, true);
          run.next = this.tick + this.ticks(1.5);
        }
      }
    }
    const next = this.surprises.find((x) => !x.done);
    if (!next) return;
    let lead: Player | null = null;
    for (const p of this.players.values()) if (p.state === 'alive' && (!lead || p.x > lead.x)) lead = p;
    if (!lead || lead.x < next.x || !lead.onGround || this.resting(lead)) return;
    if (this.activeArena() >= 0 || this.tick < this.calmUntil) return;
    for (const e of this.enemies.values()) if (isBoss(e.kind) && e.awake) return;
    next.done = true;
    this.fireSurprise(next.kind, lead);
  }

  private fireSurprise(kind: SurpriseKind, lead: Player): void {
    const n = this.players.size;
    const roster = [...new Set(this.level.enemies.map((e) => e.kind))].filter((k) => AMBUSHERS.has(k));
    const pick = (): TrooperKind =>
      roster.length ? (roster[this.rng.int(roster.length)] as TrooperKind) : 'soldier';
    const lim = (x: number): number => Math.max(60, Math.min(this.world.limitX - 60, x));
    const spawn = (k: TrooperKind, x: number): Enemy => {
      const y = lead.y - (AIRBORNE.has(k) ? 170 : 40);
      const e = this.spawnAwake(k, lim(x), y, -1);
      this.strays.add(e.id);
      this.emit({ e: 'portal', x: r1(lim(x)), y: r1(y), how: 0 });
      return e;
    };
    if (kind === 'ambush') {
      // they were waiting on both sides
      const count = 2 + Math.min(2, n - 1);
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        spawn(pick(), lead.x + side * (260 + Math.floor(i / 2) * 70));
      }
    } else if (kind === 'elite') {
      this.makeElite(spawn(pick(), lead.x + 320));
    } else if (kind === 'stampede') {
      // war elephants charging in from behind the squad
      for (let i = 0; i < 2; i++) spawn('elephant', lead.x - lead.facing * (420 + i * 160));
    } else if (kind === 'duel') {
      // two champions of the akhada step out to fight
      this.makeElite(spawn('pehlwan', lead.x + 300));
      this.makeElite(spawn('gadadhar', lead.x + 380));
    } else if (kind === 'raid') {
      const fly = roster.filter((k) => AIRBORNE.has(k));
      for (let i = 0; i < 2 + Math.min(2, n - 1); i++)
        spawn(
          fly.length ? (fly[i % fly.length] as TrooperKind) : 'jetpack',
          lead.x - lead.facing * (240 + i * 80),
        );
    } else if (kind === 'skyfall' || kind === 'tremor') {
      this.surpriseRun = {
        kind,
        until: this.tick + this.ticks(kind === 'skyfall' ? 5 : 4.5),
        next: this.tick + this.ticks(0.6),
      };
    } else {
      // the blessing: the squad healed and their supers filled
      for (const p of this.players.values())
        if (p.state === 'alive') {
          p.hp = Math.min(P.maxHp, p.hp + 50);
          this.gainUlt(p, U.max * 0.4);
        }
    }
    this.emit({ e: 'surprise', kind, x: r1(lead.x), y: r1(lead.y) });
  }

  /** This run's stage goal: where its captives, targets or hold spot lie (from the seed, its own generator). */
  private planGoal(seed: number): Sim['goal'] {
    const def = SAGA_GOALS[this.level.id];
    if (!def || !this.level.own) return null;
    const rng = new Rng((seed * 48271 + 7) % 2147483646 || 1);
    const fin = this.level.arenas.find((a) => a.gate === -1);
    const x0 = this.level.start.x + 500;
    const x1 = (fin ? fin.left : levelWidth(this.level)) - 400;
    const spots: number[] = [];
    const n = def.kind === 'hold' ? 1 : def.kind === 'race' ? 0 : def.n;
    for (let i = 0; i < n; i++) {
      const seg = (x1 - x0) / n;
      let x = x0 + seg * i + seg * (0.15 + 0.7 * rng.range(0, 1));
      if (def.kind === 'hold') x = x0 + (x1 - x0) * (0.4 + 0.2 * rng.range(0, 1));
      for (const r of this.level.rests) if (x > r.x0 - 200 && x < r.x1 + 200) x = r.x1 + 220;
      for (const a of this.level.arenas) if (x > a.trigger - 300 && x < a.right + 200) x = a.right + 220;
      if (x < x1) spots.push(Math.round(x));
    }
    const dist = Math.max(1000, x1 + 400 - this.level.start.x);
    const until = def.kind === 'race' ? this.countdownEnd + this.ticks(((def.secs ?? 20) * dist) / 1000) : 0;
    return { def, spots, items: [], done: 0, status: 0, until, zone: null };
  }

  private stepGoal(): void {
    const g = this.goal;
    if (!g || g.status !== 0) return;
    let lead: Player | null = null;
    for (const p of this.players.values()) if (p.state === 'alive' && (!lead || p.x > lead.x)) lead = p;
    const fin = this.level.arenas.find((a) => a.gate === -1);
    const reached = !!lead && !!fin && lead.x >= fin.left;
    if (g.def.kind === 'race') {
      if (reached) this.goalDone(lead as Player);
      else if (this.tick >= g.until) this.goalFail(lead);
      return;
    }
    // the next spot comes into play as the squad gets near it
    if (
      lead &&
      g.spots.length &&
      lead.x >= (g.spots[0] as number) - (g.def.kind === 'hold' ? 0 : 60) &&
      lead.onGround
    ) {
      g.spots.shift();
      if (g.def.kind === 'hold')
        g.zone = { x: lead.x, y: lead.y, held: 0, nextWave: this.tick + this.ticks(1) };
      else {
        const target = g.def.kind === 'targets';
        const hp = target ? 10 + 6 * this.players.size : 1; // (a trooper has a handful)
        g.items.push({
          x: lead.x + (target ? 300 : 200),
          y: lead.y - (target ? 44 : 30),
          hp,
          max: hp,
          state: 1,
        });
      }
    }
    if (g.def.kind === 'rescue')
      for (const it of g.items) {
        if (it.state !== 1) continue;
        // a captive whose rescuer is near flies toward them (so one caught over a pit or in rock can still be freed)
        let near: Player | null = null;
        let nd = 140 * 140;
        for (const p of this.players.values()) {
          const d = (p.x - it.x) ** 2 + (p.y - P.height / 2 - it.y) ** 2;
          if (p.state === 'alive' && d < nd) {
            nd = d;
            near = p;
          }
        }
        if (near) {
          const k = Math.min(1, (120 * this.dt) / Math.sqrt(nd || 1));
          it.x += (near.x - it.x) * k;
          it.y += (near.y - P.height / 2 - it.y) * k;
        }
        for (const p of this.players.values())
          if (p.state === 'alive' && Math.abs(p.x - it.x) < 26 && Math.abs(p.y - P.height / 2 - it.y) < 40) {
            it.state = 2;
            this.goalItem(it);
            break;
          }
      }
    if (g.zone) {
      const z = g.zone;
      const inside = [...this.players.values()].some(
        (p) => p.state === 'alive' && Math.abs(p.x - z.x) < GOAL_HOLD_REACH,
      );
      if (inside) z.held++;
      if (this.tick >= z.nextWave) {
        z.nextWave = this.tick + this.ticks(3.2);
        const roster = [...new Set(this.level.enemies.map((e) => e.kind))].filter((k) => AMBUSHERS.has(k));
        for (const side of [-1, 1]) {
          const k = roster.length ? (roster[this.rng.int(roster.length)] as TrooperKind) : 'soldier';
          const x = Math.max(60, Math.min(this.world.limitX - 60, z.x + side * 380));
          const y = z.y - (AIRBORNE.has(k) ? 170 : 40);
          this.strays.add(this.spawnAwake(k, x, y, -1).id);
          this.emit({ e: 'portal', x: r1(x), y: r1(y), how: 0 });
        }
      }
      if (z.held >= this.ticks(g.def.secs ?? 20)) {
        g.done = 1;
        g.zone = null;
        this.goalDone(lead ?? ([...this.players.values()][0] as Player));
        return;
      }
    }
    if (g.def.kind !== 'hold' && g.done >= g.def.n) {
      this.goalDone(lead ?? ([...this.players.values()][0] as Player));
      return;
    }
    // reaching the boss with the goal unfinished: it is missed
    if (reached) this.goalFail(lead);
  }

  private goalItem(it: { x: number; y: number }): void {
    const g = this.goal;
    if (!g) return;
    g.done++;
    this.emit({ e: 'goal', k: 'item', d: g.done, n: g.def.n, x: r1(it.x), y: r1(it.y) });
  }

  private goalDone(at: Player): void {
    const g = this.goal;
    if (!g) return;
    g.status = 1;
    for (const p of this.players.values())
      if (p.state === 'alive') {
        p.hp = Math.min(P.maxHp, p.hp + 60);
        this.gainUlt(p, U.max * 0.5);
        p.stats.score += 1500;
      }
    this.emit({ e: 'goal', k: 'done', d: g.done, n: g.def.n, x: r1(at?.x ?? 0), y: r1(at?.y ?? 0) });
  }

  private goalFail(at: Player | null): void {
    const g = this.goal;
    if (!g) return;
    g.status = 2;
    g.zone = null;
    this.emit({ e: 'goal', k: 'fail', d: g.done, n: g.def.n, x: r1(at?.x ?? 0), y: r1(at?.y ?? 0) });
  }

  /** A player's shot against the stage goal's targets: true while the bullet flies on. */
  private bulletVsGoal(b: Bullet): boolean {
    const g = this.goal;
    if (!g || g.def.kind !== 'targets') return true;
    for (const it of g.items) {
      if (it.state !== 1 || Math.abs(b.x - it.x) > 18 || Math.abs(b.y - it.y) > 26) continue;
      it.hp -= Math.max(1, b.dmg);
      if (it.hp <= 0) {
        it.state = 2;
        this.emit({ e: 'boom', x: r1(it.x), y: r1(it.y), r: 30 });
        this.goalItem(it);
      }
      return b.blast > 0 ? (this.explode(b), false) : false;
    }
    return true;
  }

  private goalSnap(): GoalSnapshot {
    const g = this.goal as NonNullable<Sim['goal']>;
    const out: GoalSnapshot = { k: g.def.kind, d: g.done, n: g.def.n, s: g.status, it: [] };
    if (g.def.kind === 'race' && g.status === 0)
      out.t = Math.max(0, Math.ceil((g.until - Math.max(this.tick, this.countdownEnd)) / this.tickRate));
    if (g.zone) {
      out.z = [
        r1(g.zone.x),
        r1(g.zone.y),
        Math.min(1, Math.round((g.zone.held / this.ticks(g.def.secs ?? 20)) * 100) / 100),
      ];
      out.t = Math.max(0, Math.ceil((this.ticks(g.def.secs ?? 20) - g.zone.held) / this.tickRate));
    }
    for (const it of g.items)
      if (it.state === 1) out.it.push(r1(it.x), r1(it.y), Math.round((it.hp / it.max) * 100));
    return out;
  }

  /** The stage goal's targets still standing (the computer players shoot them when nothing else is near). */
  goalTargets(): { x: number; y: number }[] {
    const g = this.goal;
    if (!g || g.def.kind !== 'targets' || g.status !== 0) return [];
    return g.items.filter((it) => it.state === 1).map((it) => ({ x: it.x, y: it.y }));
  }

  /** The stage goal and how it went (tests, results): null on stages without one. */
  goalState(): { kind: GoalKind; done: number; n: number; status: 0 | 1 | 2 } | null {
    const g = this.goal;
    return g ? { kind: g.def.kind, done: g.done, n: g.def.n, status: g.status } : null;
  }

  /** A volley of fireballs round a soldier and a little ahead, each later than the last (skyfall). */
  private meteorVolley(p: Player, count: number): void {
    const M = GAME_CONFIG.bossMoves.rain;
    for (let i = 0; i < count; i++) {
      const x = p.x + (i - (count - 1) / 2) * M.gap + this.rng.range(-24, 24) + p.facing * 30;
      this.shoot(x, p.y - M.drop - i * 60, Math.PI / 2, GAME_CONFIG.hazards.skyfall.dmg, {
        kind: 'meteor',
        speed: M.speed * GAME_CONFIG.hazards.skyfall.speed,
        size: 9,
        blast: M.blast,
        life: 3.5,
      });
    }
  }

  /** A shockwave along the ground at a soldier (from in front; from both sides when `both`). */
  private tremorWave(q: Player, both: boolean): void {
    const Tm = GAME_CONFIG.hazards.tremor;
    for (const dir of both ? [1, -1] : [q.facing]) {
      const w = this.shoot(q.x + dir * Tm.from, q.y - 12, dir > 0 ? Math.PI : 0, Tm.dmg, {
        kind: 'wave',
        speed: Tm.speed,
        size: 12,
        life: 2.6,
      });
      w.vy = 0;
    }
  }

  private stepHazard(): void {
    const h = this.level.hazard;
    if (!h) return;
    // a breath after an arena falls, and peace for a squad that is resting
    if (this.tick < this.calmUntil) return;
    const every = this.ticks(h.every);
    if (this.tick < this.ticks(8) || this.tick % every !== 0) return;
    const alive = [...this.players.values()].filter((p) => p.state === 'alive');
    if (!alive.length) return;
    if (h.kind !== 'dark' && alive.every((p) => this.resting(p))) return;
    if (h.kind === 'dark') {
      // the client darkens the world from the tick (darknessAt); this only announces each spell
      const first = alive[0] as Player;
      if (this.tick >= every) this.emit({ e: 'hazard', kind: 'dark', x: r1(first.x), y: r1(first.y) });
      return;
    }
    for (const e of this.enemies.values()) if (isBoss(e.kind) && e.awake) return;
    const p = alive[this.rng.int(alive.length)] as Player;
    if (h.kind === 'tremor') {
      // only at a soldier standing on the ground: the wave runs along that ground
      const q = alive.find((x) => x.onGround) ?? null;
      if (!q) return;
      this.tremorWave(q, h.count >= 2);
      this.emit({ e: 'hazard', kind: 'tremor', x: r1(q.x), y: r1(q.y) });
      return;
    }
    if (h.kind === 'raid') {
      // Flying raiders dive in from behind the squad's back. Never while an arena is locked (its count of
      // attackers must stay true), and never more than the cap at once.
      if (this.activeArena() >= 0) return;
      for (const id of this.raiders) if (!this.enemies.has(id)) this.raiders.delete(id);
      const R = GAME_CONFIG.hazards.raid;
      for (let i = 0; i < h.count && this.raiders.size < R.max; i++) {
        const x = Math.max(60, p.x - p.facing * (R.behind + i * 70));
        const y = Math.max(60, p.y - R.above - i * 30);
        const e = this.spawnAwake('jetpack', x, y, -1);
        this.raiders.add(e.id);
        this.emit({ e: 'portal', x: r1(x), y: r1(y), how: 0 });
      }
      this.emit({ e: 'hazard', kind: 'raid', x: r1(p.x), y: r1(p.y) });
      return;
    }
    this.meteorVolley(p, h.count);
    this.emit({ e: 'hazard', kind: h.kind, x: r1(p.x), y: r1(p.y) });
  }

  private startWave(a: ArenaDef, n: number): void {
    this.arenaWave[a.id] = n;
    this.arenaNext[a.id] = -1;
    const wave = a.waves[n % Math.max(1, a.waves.length)] ?? [];
    let l = 0;
    let r = 0;
    // A wave may come in mirrored (left and right swapped), by the match's own dice: the same stage does not
    // play out the same way twice.
    const mirror = this.rng.int(2) === 1;
    const array = a.vyuha.length ? (a.vyuha[n % a.vyuha.length] as Vyuha) : null;
    if (array) this.formUp(a, wave, array);
    else
      for (const w of wave) {
        const s: WaveSpawn =
          mirror && (w.side === 'L' || w.side === 'R') ? { ...w, side: w.side === 'L' ? 'R' : 'L' } : w;
        if (s.side === 'P' || s.side === 'U') {
          this.queueSpawn(s, a, false);
          continue;
        }
        let e: Enemy;
        if (s.side === 'L') e = this.spawnAwake(s.kind, a.left + 40 + l++ * 34, a.floor, a.id);
        else if (s.side === 'R') e = this.spawnAwake(s.kind, a.right - 40 - r++ * 34, a.floor, a.id);
        else {
          const x = a.left + (a.right - a.left) * this.rng.range(0.25, 0.85);
          e = this.spawnAwake(s.kind, x, 40, a.id);
        }
        if (s.elite) this.makeElite(e);
      }
    const vy = array ? { vy: array } : {};
    if (a.survive > 0)
      this.emit({ e: 'arena', id: a.id, wave: n + 1, of: a.waves.length, secs: a.survive, ...vy });
    else this.emit({ e: 'arena', id: a.id, wave: n + 1, of: a.waves.length, ...vy });
  }

  /**
   * A wave arriving in a battle array (see Vyuha in level.ts). The wave's own entry sides are set aside: the
   * array decides who comes from where and when. Which end it leads from is the match's own dice.
   */
  private formUp(a: ArenaDef, wave: WaveSpawn[], v: Vyuha): void {
    const alive = [...this.players.values()].filter((p) => p.state === 'alive');
    const mid = alive.length ? alive.reduce((n, p) => n + p.x, 0) / alive.length : (a.left + a.right) / 2;
    const c = Math.max(a.left + 140, Math.min(a.right - 140, mid));
    const isFlyer = (w: WaveSpawn): boolean => w.kind === 'jetpack' || w.kind === 'drone';
    const heavy = (w: WaveSpawn): number =>
      w.kind === 'shield' ? 0 : w.elite ? 1 : w.kind === 'grenadier' ? 2 : 3;
    const ground = wave.filter((w) => !isFlyer(w));
    const fly = wave.filter(isFlyer);
    const lead = this.rng.int(2) === 1 ? 1 : -1; // 1: the array leads from the right end
    const inside = (x: number): number => Math.max(a.left + 30, Math.min(a.right - 30, x));
    const edge = (side: number, i: number): number =>
      side > 0 ? a.right - 40 - i * 34 : a.left + 40 + i * 34;
    /** Puts one enemy in: now, after `sec`, or (announced by cracking ground) rising where it will stand. */
    const put = (w: WaveSpawn, x: number, y: number, sec = 0, rise = false): void => {
      x = inside(x);
      if (rise) this.emit({ e: 'portal', x: r1(x), y: r1(a.floor), how: 1 });
      const wait = sec + (rise ? GAME_CONFIG.bossMoves.portalSec : 0);
      if (wait <= 0) {
        const e = this.spawnAwake(w.kind, x, y, a.id);
        if (w.elite) this.makeElite(e);
      } else
        this.pending.push({
          kind: w.kind,
          x,
          y,
          arena: a.id,
          at: this.tick + this.ticks(wait),
          elite: w.elite === true,
          fromBoss: false,
        });
    };
    const SKY = 40;
    /**
     * Where a trooper dropped over `x` starts its fall: as high as the air is clear above the arena floor, to a
     * limit. It stops under any ledge, so nobody is left standing on a perch the squad has to climb to.
     */
    const drop = (x: number): number => {
      const col = Math.floor(inside(x) / T);
      let row = Math.floor(a.floor / T) - 1;
      const top = row - 6;
      while (row > top && tileAt(this.level, col, row - 2) === Tile.Empty) row--;
      return (row + 1) * T - 4;
    };
    switch (v) {
      case 'chakra': {
        // rings round the squad: the inner ring first, each further ring a beat later
        ground.forEach((w, i) => {
          const ring = Math.floor(i / 2);
          put(w, c + (i % 2 ? 1 : -1) * lead * (150 + ring * 64), a.floor, ring * 0.7, true);
        });
        fly.forEach((w, i) => put(w, c + (i - (fly.length - 1) / 2) * 90, SKY, 0.4));
        break;
      }
      case 'ardha': {
        // two horns, the same weight on each, and the flyers over the middle
        ground.forEach((w, i) => put(w, edge(i % 2 ? lead : -lead, Math.floor(i / 2)), a.floor));
        fly.forEach((w, i) => put(w, c + (i - (fly.length - 1) / 2) * 110, SKY));
        break;
      }
      case 'makara': {
        // the heavy jaw first; the other jaw shuts behind
        const order = [...ground].sort((x, y) => heavy(x) - heavy(y));
        const first = Math.ceil(order.length / 2);
        order.forEach((w, i) =>
          i < first ? put(w, edge(lead, i), a.floor) : put(w, edge(-lead, i - first), a.floor, 2.2),
        );
        fly.forEach((w, i) => put(w, edge(-lead, 2 + i * 2), SKY, 2.2));
        break;
      }
      case 'suchi': {
        // one file through one gate, the point of the needle first
        const order = [...ground].sort((x, y) => heavy(x) - heavy(y));
        order.forEach((w, i) => put(w, edge(lead, 0), a.floor, i * 0.45));
        fly.forEach((w, i) => put(w, edge(lead, 1), SKY, (order.length + i) * 0.45));
        break;
      }
      case 'vajra': {
        // three knots out of the sky at once
        [...fly, ...ground].forEach((w, i) => {
          const knot = (i % 3) - 1;
          const x = c + knot * 190 + (Math.floor(i / 3) % 2 ? 22 : -22);
          put(w, x, isFlyer(w) ? SKY : drop(x), Math.floor(i / 3) * 0.25);
        });
        break;
      }
      case 'shyen': {
        // beak, wings, body
        const order = [...ground].sort((x, y) => heavy(x) - heavy(y));
        order.forEach((w, i) => put(w, edge(lead, Math.max(0, i - 1)), a.floor, i === 0 ? 0 : 1.3));
        fly.forEach((w, i) => put(w, c + (i % 2 ? 1 : -1) * (170 + Math.floor(i / 2) * 70), SKY, 0.3));
        break;
      }
    }
  }

  private clearArena(a: ArenaDef): void {
    this.arenaState[a.id] = 2;
    this.calmUntil = this.tick + this.ticks(GAME_CONFIG.mission.calmSec);
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
      // never back into the fire: it falls back behind the soldier coming back
      if (this.chaseOn && spot.x < this.chaseX + 8 * T) this.chaseX = spot.x - 12 * T;
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
    const storm = this.bossCast()?.storm === true;
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
      rs: storm ? this.arrowsFor(p) : 0,
      ...(this.tick < p.netUntil ? { nt: 1 } : {}),
      rd: p.ride,
      rh: p.ride >= 0 ? Math.max(0, Math.ceil((p.mountHp / this.mountDef(p).hp) * 100)) : 0,
      ru: p.rush,
      rr: p.ride >= 0 && this.tick >= p.mountReady ? 1 : 0,
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
        // (troopers: the lancer's raised javelin, the egg's cracking, the dancer's strike, the painting stepping out,
        // the mirror shade's mirror)
        p:
          boss || e.kind === 'lancer' || e.kind === 'egg'
            ? e.atkParam
            : e.kind === 'dancer' || e.kind === 'painting' || e.kind === 'golem' || e.kind === 'elephant'
              ? e.burst
              : e.kind === 'mayavi'
                ? this.tick < e.mx
                  ? 1
                  : 0
                : e.kind === 'nidrasur'
                  ? e.burst === 1
                    ? 100
                    : Math.min(99, Math.round((e.my / E.nidrasur.wakeAt) * 99))
                  : e.kind === 'saptashir'
                    ? e.my
                    : e.kind === 'mashaal'
                      ? Math.min(99, this.tick - e.atkStart)
                      : e.kind === 'pehlwan' || e.kind === 'gadadhar' || e.kind === 'jodasur'
                        ? e.burst
                        : e.kind === 'ardh'
                          ? e.atkParam
                          : e.kind === 'slinger'
                            ? Math.min(99, this.tick - e.atkStart)
                            : e.kind === 'chakri'
                              ? e.atkParam
                                ? 1
                                : 0
                              : e.kind === 'rathi'
                                ? e.burst
                                : e.kind === 'archer' || e.kind === 'drummer' || e.kind === 'netter'
                                  ? Math.min(99, this.tick - e.atkStart)
                                  : e.kind === 'mirror'
                                    ? Math.round(e.homeX)
                                    : 0,
        ph: e.phase,
        ra: e.rule?.kind ? BOSS_RULES.indexOf(e.rule.kind) : -1,
        rt: e.rule?.kind ? this.tick - e.rule.start : 0,
        rs: e.rule?.storm ? 1 : 0,
        // stunned; for Chhaya, her jaws hanging open (the moment to strike)
        sn:
          (e.rule && this.tick < e.rule.stunUntil) ||
          ((e.kind === 'chhaya' ||
            e.kind === 'aandhi' ||
            e.kind === 'darpan' ||
            e.kind === 'raakhasur' ||
            e.kind === 'suryakavach') &&
            this.tick < e.mx)
            ? 1
            : 0,
        im: e.rule?.storm ? 1 : 0,
        el: e.elite ? 1 : 0,
        fl: (e.burnUntil > this.tick ? 1 : 0) | (e.liftUntil > this.tick ? 2 : 0),
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
      if (a.survive > 0)
        arena.t = Math.max(0, Math.ceil(((this.arenaEnd[ai] as number) - this.tick) / this.tickRate));
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
      ...(this.chaseOn ? { cx: Math.round(this.chaseX) } : {}),
      ...(this.plats.length
        ? {
            pl: this.plats.flatMap((p, i) => [
              Math.round(this.platDx[i] ?? 0),
              Math.round(p.y),
              p.on ? 1 : 0,
            ]),
          }
        : {}),
      ...(this.level.tide ? { wy: Math.round(this.waterY() ?? 0) } : {}),
      ...(this.tick < this.mayaUntil ? { ma: 1 } : {}),
      ...(this.lavaOn ? { lv: Math.round(this.lavaY) } : {}),
      ...(this.level.vyuh ? { vw: Math.round(this.vyuhX) } : {}),
      ...(this.meghAt > this.tick
        ? { ij: [Math.round(this.meghX), Math.round(this.meghY)] as [number, number] }
        : {}),
      ...(this.level.gusts || this.storm ? { gu: this.gustDir || this.gustWarnDir * 2 } : {}),
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
      bm: this.param < 0 ? -1 : Math.floor(this.param),
      ...(this.goal ? { gl: this.goalSnap() } : {}),
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
        ...this.twisters.map((t) => ({
          k: (t.fire ? 4 : 3) as 3 | 4,
          x: r1(t.x),
          y: r1(t.y),
          w: GAME_CONFIG.powers.vayu.reach,
          t: r1((t.until - this.tick) / this.tickRate),
        })),
        ...this.spirits.map((sp) => ({
          k: 2 as const,
          x: r1(sp.x),
          y: r1(sp.y),
          w: 0,
          t: r1((sp.until - this.tick) / this.tickRate),
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
