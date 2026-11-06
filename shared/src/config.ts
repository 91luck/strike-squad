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
/**
 * Powers ("astras") held in a separate slot and fired with the ASTRA button. Each one keeps the rule its story
 * gives it (see docs/ASTRA_SAGA.md):
 *  - agni: a wave of fire that sets the ground ablaze (fire that ordinary means cannot put out),
 *  - varuna: torrential rain; puts out walls of fire (agni's counter),
 *  - vayu: a gale that lifts foes off their feet and blows their shots away,
 *  - singularity: a black hole (the space mission's power),
 *  - naga: serpents that never miss: they hunt the nearest foes,
 *  - garuda: the eagle; the counter to serpents: wipes enemy serpents and shots from the sky, crushes flyers,
 *  - sudarshana: the spinning discus; seeks foe after foe and comes back to the hand that threw it,
 *  - pashupata: takes a different form every time it is called (trident strike, a spirit ally, or a fire rain),
 *  - vaishnava: only another vaishnava stops it: turns a boss's vaishnava orb back on the boss.
 * The team's brahmastra is a shared meter, not a pickup.
 */
export const POWER_KINDS = [
  'agni',
  'varuna',
  'vayu',
  'singularity',
  'naga',
  'garuda',
  'sudarshana',
  'pashupata',
  'vaishnava',
] as const;
export type PowerKind = (typeof POWER_KINDS)[number];
export const isPower = (k: string): k is PowerKind => (POWER_KINDS as readonly string[]).includes(k);
export type PickupKind = 'spread' | 'rapid' | 'laser' | 'medkit' | PowerKind;
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
export const BULLET_KINDS = [
  'shot',
  'grenade',
  'shell',
  'wave',
  'missile',
  'bomb',
  'rocket',
  'flame',
  /** Astra Saga: homing serpents (naga, from either side), the sudarshana discus, a vaishnava orb, the
   * arrows of a narayanastra storm, a spirit's spark and the falling fire of pashupata. */
  'serpent',
  'chakra',
  'orb',
  'arrow',
  'spark',
  'meteor',
] as const;
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
  /** Astra Saga boss moves (any body): fire falling from the sky on marked spots, a ring of shots, a spinning
   * stream, a leap that lands with shockwaves, a vanish-and-reappear, and a call for reinforcements. */
  rain: 13,
  ring: 14,
  spiral: 15,
  leap: 16,
  blink: 17,
  summon: 18,
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
    /** Top speed an anti-gravity lift carries you up at. */
    liftSpeed: 240,
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
    /** Altars (respawning pickups, e.g. the rain astra before a fire wall) come back after this long. */
    respawnSec: 8,
  },

  /** Powers (astras) and the team brahmastra. Distances in px, damage per hit or per second (dps). */
  powers: {
    /** Charges per pickup, and the most one soldier can carry. */
    charges: {
      agni: 2,
      varuna: 1,
      vayu: 2,
      singularity: 2,
      naga: 2,
      garuda: 1,
      sudarshana: 2,
      pashupata: 1,
      vaishnava: 1,
    } as Record<PowerKind, number>,
    maxCharges: 3,
    agni: { waveDamage: 8, waveSpeed: 520, waveSec: 0.8, burnLength: 340, burnSec: 4, burnDps: 16 },
    varuna: { range: 15 * 32, back: 3 * 32, damage: 6 },
    vayu: { range: 440, height: 170, push: 560, pushSec: 0.4, damage: 3 },
    singularity: {
      ahead: 230,
      lift: 60,
      sec: 3.2,
      radius: 240,
      pull: 210,
      coreRadius: 60,
      coreDps: 22,
      dps: 6,
      collapseDamage: 22,
      collapseRadius: 150,
    },
    brahma: {
      perKill: 3,
      perDamage: 0.12,
      max: 100,
      /** Wind-up before the strike (the sky darkens, a pillar of light comes down). */
      windupSec: 1.1,
      range: 1150,
      damage: 90,
      /** Bosses lose this share of their full health. */
      bossShare: 0.12,
      shieldSec: 1.6,
    },
    /** Three serpents that steer toward the nearest foe (turn rate in rad/s). */
    naga: { serpents: 3, speed: 340, turn: 7, damage: 9, lifeSec: 2.6, seek: 720 },
    /** The eagle's dive: clears enemy serpents and shots within `range`, crushes flyers, shields the caller. */
    garuda: { range: 900, flyerDamage: 30, damage: 8, shieldSec: 1.2 },
    /** The discus: hits up to `hits` different foes, then flies back to its thrower. */
    sudarshana: { speed: 540, turn: 9, hits: 6, damage: 8, seek: 560, outSec: 2.4, maxSec: 5 },
    /** Pashupata picks one form per call: a trident strike, a spirit ally, or a rain of fire. */
    pashupata: {
      strike: { targets: 4, range: 720, damage: 32 },
      spirit: { sec: 7, everySec: 0.35, damage: 5, range: 600 },
      rain: { bolts: 8, spread: 560, damage: 14, blast: 64 },
    },
    /** A golden bolt; or, with a boss's vaishnava orb within `reflectRange`, the orb turned back on its boss. */
    vaishnava: { boltDamage: 40, speed: 620, reflectRange: 640, reflectShare: 0.09 },
  },

  /**
   * Astra Saga boss rules: astras the bosses themselves call, layered on top of their normal attacks. Each has a
   * counter the squad can learn (see docs/ASTRA_SAGA.md). Times in seconds, scaled by the mission's boss tempo.
   */
  /**
   * Astra Saga boss moves (see boss-styles.ts) and wave extras. Damage numbers sit next to the classic attacks':
   * a rain fireball hurts like a walker shell, a ring or spiral shot like a fortress bullet.
   */
  bossMoves: {
    /** Fire from the sky: `count` (+1 per phase after the first) drops `gap` px apart, falling from `drop` px up. */
    rain: { count: 3, gap: 92, drop: 600, speed: 430, dmg: 14, blast: 44 },
    ring: { count: 12, speed: 190, dmg: 9 },
    /** Spinning stream: `arms` shots every `everyTicks` ticks for `sec`, the aim turning `turn` rad per tick. */
    spiral: { sec: 1.6, everyTicks: 3, arms: 2, turn: 0.21, speed: 210, dmg: 8 },
    leap: { jump: 720, speed: 340, waveDmg: 16 },
    /** Reappears this far from the target, on its other side. */
    blink: { dist: 230 },
    summon: { count: 2, max: 4 },
    /** Delay between the portal (or cracking ground) and the enemy stepping out. */
    portalSec: 0.9,
    /** Elite troopers: health ×hp; the killer gets ult charge, a heal, and score ×score. */
    elite: { hp: 3, ult: 30, heal: 15, score: 3 },
  },
  bossAstra: {
    /** Serpents that hunt the squad: shoot them down, dash through them, or call garuda. */
    naga: { everySec: 6.5, windupSec: 0.9, serpents: 4, speed: 175, turn: 2.2, damage: 14, lifeSec: 5 },
    /**
     * Narayanastra: grows with resistance. A soldier who stands still without attacking ("samarpan") is spared;
     * one who keeps fighting draws more arrows each volley. The boss cannot be hurt during the storm. A second
     * call after a storm nobody fought rebounds on the boss.
     */
    narayana: {
      firstAtSec: 7,
      secondBelow: 0.5,
      windupSec: 1.6,
      stormSec: 5,
      volleySec: 0.45,
      /** Arrows per volley at a resisting soldier: base + one per `resistStepSec` of fighting, capped. */
      base: 1,
      resistStepSec: 0.5,
      maxArrows: 6,
      damage: 10,
      /** After the storm the boss is spent: stunned and taking extra damage. */
      spentSec: 3,
      spentDamage: 1.5,
      /** The rebound: the boss loses this share of its health. */
      reboundShare: 0.18,
    },
    /** A slow homing orb that cannot be shot down; a vaishnava astra (altar in the arena) turns it back. */
    vaishnava: { everySec: 9, windupSec: 1, speed: 115, turn: 1.4, damage: 45, lifeSec: 8, blast: 70 },
    /**
     * Brahmashirsha: a long charge. The squad's brahmastra fired during it cancels both and stuns the boss;
     * otherwise it lands on everyone not dodging, and (it cannot be called back) scorches its caller too.
     */
    brahmashirsha: {
      firstBelow: 0.7,
      everySec: 22,
      windupSec: 4,
      damage: 60,
      backfireShare: 0.06,
      counterShare: 0.12,
      stunSec: 4,
      /** Damage fills the brahmastra this much faster while the boss charges. */
      chargeBoost: 2,
    },
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

/** The original campaign, in order (see `missions.ts`). */
export const CAMPAIGN_IDS = [
  'mission-1',
  'mission-2',
  'mission-3',
  'mission-4',
  'mission-5',
  'mission-6',
] as const;
/** The Astra Saga: ten stages, each built around one astra (see `saga.ts`). */
export const SAGA_IDS = [
  'astra-1',
  'astra-2',
  'astra-3',
  'astra-4',
  'astra-5',
  'astra-6',
  'astra-7',
  'astra-8',
  'astra-9',
  'astra-10',
] as const;
/** Every playable mission: the campaign, then the saga. */
export const MISSION_IDS = [...CAMPAIGN_IDS, ...SAGA_IDS] as const;
export type MissionId = (typeof MISSION_IDS)[number];
export type SagaId = (typeof SAGA_IDS)[number];
export const isSagaId = (v: unknown): v is SagaId =>
  typeof v === 'string' && (SAGA_IDS as readonly string[]).includes(v);
export const isMissionId = (v: unknown): v is MissionId =>
  typeof v === 'string' && (MISSION_IDS as readonly string[]).includes(v);

export interface MissionSettings {
  difficulty: Difficulty;
  mission: MissionId;
}

export function defaultMissionSettings(): MissionSettings {
  return { difficulty: 'normal', mission: 'mission-1' };
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
