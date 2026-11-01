/**
 * Central game configuration for STRIKE SQUAD. Every balance value lives here so rules are documented and tunable
 * in one place (see docs/GAME_RULES.md). Distances are pixels, time is seconds; the simulation converts to ticks.
 */

export type WeaponKind = 'blaster' | 'spread' | 'rapid' | 'laser';
/** Regular enemies. */
export type TrooperKind = 'soldier' | 'turret' | 'drone' | 'shield' | 'jetpack' | 'grenadier';
/** The three bosses of the mission: a walking tank, a gunship, and the final fortress. */
export type BossKind = 'walker' | 'gunship' | 'boss';
export type EnemyKind = TrooperKind | BossKind;
export type PickupKind = 'spread' | 'rapid' | 'laser' | 'medkit';
export type Difficulty = 'easy' | 'normal' | 'hard';
/** Hero super moves. Each hero has one (see heroes.ts). */
export type UltKind = 'overdrive' | 'nova' | 'airstrike' | 'phantom';

export const WEAPON_KINDS: readonly WeaponKind[] = ['blaster', 'spread', 'rapid', 'laser'] as const;
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'] as const;
export const BOSS_KINDS: readonly BossKind[] = ['walker', 'gunship', 'boss'] as const;
export const isBoss = (k: EnemyKind): k is BossKind => k === 'walker' || k === 'gunship' || k === 'boss';

/**
 * Projectile kinds (index = wire value). `shot` is a plain bullet; the others are boss/grenadier ordnance with
 * gravity or a blast, and `rocket` is the hero airstrike.
 */
export const BULLET_KINDS = ['shot', 'grenade', 'shell', 'wave', 'missile', 'bomb', 'rocket'] as const;
export type BulletKind = (typeof BULLET_KINDS)[number];

/** Boss attack ids (wire value). Each has a wind-up ("telegraph") the renderer shows before it lands. */
export const ATTACK = {
  none: 0,
  cannon: 1,
  mg: 2,
  charge: 3,
  stomp: 4,
  bombs: 5,
  missiles: 6,
  troops: 7,
  strafe: 8,
  volley: 9,
  beamLow: 10,
  beamHigh: 11,
  slam: 12,
} as const;
export type AttackId = (typeof ATTACK)[keyof typeof ATTACK];

export interface WeaponConfig {
  label: string;
  /** Letter shown on crates and in the HUD (Contra style). */
  letter: string;
  cooldown: number;
  speed: number;
  damage: number;
  lifetime: number;
  /** Bullets per trigger pull, spread evenly across `spreadRad`. */
  pellets: number;
  spreadRad: number;
  /** Passes through enemies instead of stopping at the first one. */
  pierce: boolean;
}

export interface RankDef {
  /** Combo hits needed. */
  at: number;
  name: string;
}

export const GAME_CONFIG = {
  /** Server simulation rate. */
  tickRate: 30,
  /** Send a snapshot every N ticks (30/2 = 15 snapshots per second). */
  snapshotEvery: 2,
  tile: 32,

  mission: {
    countdownSec: 3,
    minPlayers: 1,
    maxPlayers: 8,
    /** A mission that runs this long is called off (keeps abandoned rooms from ticking forever). */
    maxDurationSec: 25 * 60,
    /** Team lives = base + one per player (drop-ins add one too), capped. A boss kill gives one back. */
    livesBase: { easy: 6, normal: 4, hard: 2 } satisfies Record<Difficulty, number>,
    livesPerPlayer: 1,
    maxLives: 14,
    /** Enemy health multiplier per extra player (more friends, tougher enemies). */
    enemyHpPerExtraPlayer: 0.3,
    /** Enemies also shoot a little more often per extra player. */
    enemyFireRatePerExtraPlayer: 0.05,
    /** Enemy fire-rate multiplier by difficulty. */
    enemyFireRate: { easy: 0.7, normal: 1, hard: 1.25 } satisfies Record<Difficulty, number>,
    /** Damage players take, by difficulty. */
    enemyDamage: { easy: 0.65, normal: 1, hard: 1.35 } satisfies Record<Difficulty, number>,
    /** Clearing a lock-down arena heals every soldier still standing by this much. */
    arenaClearHeal: 35,
  },

  player: {
    width: 20,
    height: 34,
    crouchHeight: 20,
    /** A real health bar: one enemy bullet takes about a tenth. */
    maxHp: 100,
    runSpeed: 150,
    gravity: 1400,
    jumpSpeed: 582,
    /** Second jump in the air. */
    doubleJumpSpeed: 513,
    airJumps: 1,
    maxFallSpeed: 820,
    /** Jump still works for a moment after running off a ledge. */
    coyoteSec: 0.1,
    /** Dash: a burst of speed that bullets pass through, with i-frames a moment longer (one air dash per jump). */
    dash: { speed: 500, sec: 0.2, cooldownSec: 0.55, iframeSec: 0.12 },
    /** Down + Dash on the ground: slide low under shots, knocking enemies over. */
    slide: { speed: 380, sec: 0.38, damage: 3 },
    hurtInvulnSec: 0.4,
    spawnInvulnSec: 2.5,
    /** Not hit for this long: health refills by `regenPerSec`. */
    regenDelaySec: 3.5,
    regenPerSec: 12,
    /** KO'd soldiers come back this long later, beside the squad, using a team life. */
    respawnSec: 3,
    /** Falling into a pit costs health and puts you back on the last safe ground. */
    pitDamage: 25,
    /** Below this y (world px) you fell into a pit. */
    pitMargin: 64,
    /** Knife / kick. Firing with an enemy this close in front also swings (arcade style). */
    melee: { range: 50, height: 46, damage: 5, cooldownSec: 0.36, animSec: 0.24, autoRange: 46 },
  },

  /** Hero super move ("ultimate"): fills from damage dealt, kills and hits taken. */
  ult: {
    max: 100,
    perKill: 6,
    perDamage: 0.45,
    perHurt: 0.15,
    /** Invulnerable while unleashing it. */
    invulnSec: 1.2,
    /** Two friends firing ultimates this close together: SYNC, both hit harder. */
    syncWindowSec: 2.5,
    syncBonus: 0.5,
    /** Bosses take this fraction of ultimate damage (so a boss fight isn't one button). */
    bossFactor: 0.45,
    /** Overdrive: faster, piercing, harder-hitting shots (bosses take normal damage per shot). */
    overdrive: { sec: 5, fireRate: 2.2, damage: 1.5, damageTaken: 0.5 },
    nova: { radius: 320, damage: 24, clearRadius: 420 },
    airstrike: { rockets: 9, spread: 620, damage: 14, blast: 72 },
    phantom: { targets: 7, range: 620, damage: 20 },
  },

  /** Combo: hits within `windowSec` of each other chain; taking a hit breaks it. */
  combo: {
    windowSec: 2.6,
    gunHit: 1,
    meleeHit: 3,
    slideHit: 2,
    ultHit: 2,
    killBonus: 2,
    parry: 3,
    /** Score multiplier: +10% per 10 combo, up to ×3. */
    maxMultiplier: 3,
    ranks: [
      { at: 8, name: 'C' },
      { at: 18, name: 'B' },
      { at: 32, name: 'A' },
      { at: 50, name: 'S' },
      { at: 75, name: 'SS' },
      { at: 110, name: 'SSS' },
    ] satisfies RankDef[],
  },

  weapons: {
    blaster: {
      label: 'Blaster',
      letter: '',
      cooldown: 0.24,
      speed: 520,
      damage: 1,
      lifetime: 1.05,
      pellets: 1,
      spreadRad: 0,
      pierce: false,
    },
    spread: {
      label: 'Spread',
      letter: 'S',
      cooldown: 0.4,
      speed: 460,
      damage: 0.7,
      lifetime: 0.72,
      pellets: 5,
      spreadRad: 0.7,
      pierce: false,
    },
    rapid: {
      label: 'Machine gun',
      letter: 'M',
      cooldown: 0.11,
      speed: 580,
      damage: 1,
      lifetime: 0.95,
      pellets: 1,
      spreadRad: 0,
      pierce: false,
    },
    laser: {
      label: 'Laser',
      letter: 'L',
      cooldown: 0.38,
      speed: 820,
      damage: 2,
      lifetime: 0.85,
      pellets: 1,
      spreadRad: 0,
      pierce: true,
    },
  } satisfies Record<WeaponKind, WeaponConfig>,

  enemies: {
    soldier: {
      hp: 3,
      width: 22,
      height: 34,
      speed: 65,
      sight: 520,
      fireEvery: 1.7,
      keepAway: 190,
      dmg: 9,
      score: 100,
    },
    turret: { hp: 7, width: 30, height: 26, sight: 500, fireEvery: 1.5, dmg: 11, score: 200 },
    drone: {
      hp: 2,
      width: 26,
      height: 18,
      speed: 105,
      sight: 560,
      fireEvery: 2.3,
      hover: 150,
      dmg: 8,
      score: 150,
    },
    /** Riot shield in front: shoot it from above or behind, or break it with melee. */
    shield: {
      hp: 4,
      shieldHp: 6,
      width: 26,
      height: 36,
      speed: 52,
      sight: 520,
      fireEvery: 2.1,
      keepAway: 120,
      dmg: 11,
      score: 250,
    },
    /** Flies in from the sky and fires three-round bursts downward. */
    jetpack: {
      hp: 3,
      width: 22,
      height: 34,
      speed: 140,
      sight: 640,
      fireEvery: 2.0,
      hover: 175,
      dmg: 8,
      score: 200,
    },
    /** Lobs grenades that burst on the ground: keep moving. */
    grenadier: {
      hp: 4,
      width: 22,
      height: 34,
      speed: 55,
      sight: 600,
      fireEvery: 2.6,
      keepAway: 270,
      dmg: 20,
      blast: 58,
      score: 250,
    },
    /** Boss 1, WARHOUND: a walking assault tank. Charges (double-jump or dash through it) and stomps (jump the shockwaves). */
    walker: {
      width: 132,
      height: 96,
      baseHp: 50,
      hpPerPlayer: 70,
      speed: 60,
      chargeSpeed: 340,
      score: 3000,
      contactDmg: 22,
      shellDmg: 16,
      waveDmg: 18,
      mgDmg: 8,
      phase2: 0.5,
    },
    /** Boss 2, VULTURE: an attack gunship. Bombs, slow missiles (melee knocks them away) and jetpack drops. */
    gunship: {
      width: 168,
      height: 64,
      baseHp: 45,
      hpPerPlayer: 65,
      speed: 120,
      hoverY: 170,
      score: 3500,
      bombDmg: 18,
      missileDmg: 16,
      shotDmg: 9,
      phase2: 0.5,
    },
    /** Boss 3, IRON FORTRESS: the final stronghold with three phases. */
    boss: {
      width: 120,
      height: 220,
      baseHp: 75,
      hpPerPlayer: 90,
      sight: 620,
      score: 6000,
      shotDmg: 10,
      beamDmg: 22,
      waveDmg: 18,
      /** Phase 2 below this fraction of health (drones + slams), phase 3 below the next (faster, double beams). */
      phase2: 0.6,
      phase3: 0.3,
      droneEvery: 7,
      maxDrones: 3,
    },
    bulletSpeed: 220,
    bulletLifetime: 3.2,
    /** Enemies sleep (no AI, no shots) until a player is within this distance: keeps the CPU and snapshots small. */
    wakeDistance: 760,
    contactDmg: 12,
  },

  pickups: {
    radius: 16,
    medkitHeal: 60,
    /** A med-kit heals the player who grabs it AND every friend within this distance. */
    medkitShareRadius: 220,
  },

  /** Hard anti-cheat ceilings used by the server when validating input. */
  limits: {
    inputsPerSecond: 60,
    /** Lag compensation ceiling: bullets are checked against where enemies were up to this long ago. */
    maxRewindSec: 0.4,
    maxMessageBytes: 2048,
    maxNameLength: 16,
    reconnectGraceSec: 30,
    lobbyGraceSec: 8,
    roomIdleExpirySec: 600,
    resultsIdleExpirySec: 300,
    maxConnectionsPerIp: 12,
    maxRooms: 200,
  },
} as const;

export type GameConfig = typeof GAME_CONFIG;

export interface MissionSettings {
  difficulty: Difficulty;
}

export function defaultMissionSettings(): MissionSettings {
  return { difficulty: 'normal' };
}

export const secondsToTicks = (sec: number, tickRate: number = GAME_CONFIG.tickRate): number =>
  Math.max(1, Math.round(sec * tickRate));

/** Style rank index for a combo count: -1 none, 0 = C … 5 = SSS. */
export function rankOf(combo: number): number {
  const r = GAME_CONFIG.combo.ranks;
  let i = -1;
  for (let k = 0; k < r.length; k++) if (combo >= (r[k] as RankDef).at) i = k;
  return i;
}

export function rankName(i: number): string {
  return i < 0 ? '' : ((GAME_CONFIG.combo.ranks[i] as RankDef | undefined)?.name ?? '');
}

/** Eight squad colours, one per seat, chosen to stay distinguishable for common colour-vision deficiencies. */
export const SQUAD_COLORS: readonly string[] = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#e11d48',
  '#a855f7',
  '#eab308',
  '#06b6d4',
  '#f472b6',
] as const;
