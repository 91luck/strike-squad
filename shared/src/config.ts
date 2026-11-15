/**
 * Central game configuration for STRIKE SQUAD. Every balance value lives here so rules are documented and tunable
 * in one place (see docs/GAME_RULES.md). Distances are pixels, time is seconds; the simulation converts to ticks.
 */

export type WeaponKind = 'blaster' | 'spread' | 'rapid' | 'laser';
/** Regular enemies. */
export type TrooperKind =
  | 'soldier'
  | 'turret'
  | 'drone'
  | 'shield'
  | 'jetpack'
  | 'grenadier'
  /** Agnivan (saga stage 1): fire imps that leap and burst, burning bats that dive, tree demons that throw logs. */
  | 'imp'
  | 'bat'
  | 'treant'
  /** Sagar Setu (stage 2): makara riders leaping out of the sea, crab asuras with shells, conch blowers. */
  | 'makar'
  | 'crab'
  | 'conch'
  /** Vayu Shikhar (stage 3): wind demons that swoop with the gusts, boulder rollers on the ledges, cloud lancers. */
  | 'harpy'
  | 'roller'
  | 'lancer'
  /** Naag Lok (stage 4): naga warriors that slither low, cobras spitting from the walls, eggs that hatch. */
  | 'serpent'
  | 'spitter'
  | 'egg'
  /** Maya Nagri (stage 5): mirror shades that copy a soldier, dancers that vanish and reappear, painted guards. */
  | 'mirror'
  | 'dancer'
  | 'painting'
  /** Bhasm Parvat (stage 6): ghosts that drift through rock, ash golems that rise again unless burnt, skull lamps. */
  | 'pret'
  | 'golem'
  | 'lantern'
  /** Samarpan Maidan (stage 7): archers loosing arcing volleys, war elephants that charge, war drummers. */
  | 'archer'
  | 'elephant'
  | 'drummer'
  /** Chakra Durg (stage 8): discus throwers whose discs come back, maharathis who lunge, net throwers. */
  | 'chakri'
  | 'rathi'
  | 'netter'
  /** Dwand Bhoomi (stage 9): wrestlers who grab and throw, mace spinners, slingers; Jodasur's two halves. */
  | 'pehlwan'
  | 'gadadhar'
  | 'slinger'
  | 'ardh'
  /** Suvarna (stage 10): torch throwers, Meghbaan's unseen warriors in the clouds, and Nidrasur asleep. */
  | 'mashaal'
  | 'mayavi'
  | 'nidrasur';
/**
 * Bosses: the classic walking tank, gunship and fortress, and the saga stages' own bosses (each fought in one
 * stage only): `vriksha` is Agnivan's Jwala Vriksh-asur, a burning banyan.
 */
export type BossKind =
  | 'walker'
  | 'gunship'
  | 'boss'
  | 'vriksha'
  | 'chhaya'
  | 'aandhi'
  | 'vishdhar'
  | 'darpan'
  | 'raakhasur'
  | 'maniyodha'
  | 'suryakavach'
  | 'jodasur'
  | 'saptashir';
export type EnemyKind = TrooperKind | BossKind;
/**
 * Powers ("astras") held in a separate slot and fired with the ASTRA button. Each one keeps the rule its story
 * gives it (see docs/ASTRA_SAGA.md):
 *  - agni: a wave of fire that sets the ground ablaze (fire that ordinary means cannot put out),
 *  - jal: torrential rain; puts out walls of fire (agni's counter),
 *  - vayu: a gale that lifts foes off their feet and blows their shots away,
 *  - singularity: a black hole (the space mission's power),
 *  - naga: serpents that never miss: they hunt the nearest foes,
 *  - shyen: the eagle; the counter to serpents: wipes enemy serpents and shots from the sky, crushes flyers,
 *  - chakram: the spinning discus; seeks foe after foe and comes back to the hand that threw it,
 *  - vidyut: takes a different form every time it is called (trident strike, a spirit ally, or a fire rain),
 *  - tej: only another tej stops it: turns a boss's tej orb back on the boss,
 *  - maya: Mayakaar's own art turned back: shows every illusion for what it is (false floors, hidden ones, mirror
 *    clones) and dulls a mirror's shine (Maya Nagri).
 * The team's paramastra is a shared meter, not a pickup.
 */
export const POWER_KINDS = [
  'agni',
  'jal',
  'vayu',
  'singularity',
  'naga',
  'shyen',
  'chakram',
  'vidyut',
  'tej',
  'maya',
] as const;
export type PowerKind = (typeof POWER_KINDS)[number];
export const isPower = (k: string): k is PowerKind => (POWER_KINDS as readonly string[]).includes(k);
export type PickupKind = 'spread' | 'rapid' | 'laser' | 'medkit' | PowerKind;
export type Difficulty = 'easy' | 'normal' | 'hard';
/** Hero super moves. Each hero has one (see heroes.ts). */
export type UltKind = 'overdrive' | 'nova' | 'airstrike' | 'phantom';

export const WEAPON_KINDS: readonly WeaponKind[] = ['blaster', 'spread', 'rapid', 'laser'] as const;
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'] as const;
export const BOSS_KINDS: readonly BossKind[] = [
  'walker',
  'gunship',
  'boss',
  'vriksha',
  'chhaya',
  'aandhi',
  'vishdhar',
  'darpan',
  'raakhasur',
  'maniyodha',
  'suryakavach',
  'jodasur',
  'saptashir',
] as const;
export const isBoss = (k: EnemyKind): k is BossKind => (BOSS_KINDS as readonly string[]).includes(k);
/** Bosses that never move from their spot (the fortress and the saga's rooted bosses). */
export const isFixedBoss = (k: EnemyKind): boolean =>
  k === 'boss' ||
  k === 'vriksha' ||
  k === 'chhaya' ||
  k === 'aandhi' ||
  k === 'vishdhar' ||
  k === 'darpan' ||
  k === 'suryakavach' ||
  k === 'saptashir';

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
  /** Astra Saga: homing serpents (naga, from either side), the chakram discus, a tej orb, the
   * arrows of a samarpanastra storm, a spirit's spark and the falling fire of vidyut. */
  'serpent',
  'chakra',
  'orb',
  'arrow',
  'spark',
  'meteor',
  /** A net thrown by Chakra Durg's net throwers: whoever it lands on is slowed for a moment. */
  'net',
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
  /** Jwala Vriksh-asur: roots racing along the ground, burning fruit lobbed high, fire breath. */
  roots: 19,
  fruit: 20,
  breath: 21,
  /** Chhaya: her hand grabs at a soldier's shadow; a tidal surge; water spat in arcs. */
  grab: 22,
  surge: 23,
  spit: 24,
  /** Aandhi: a storm that drives the squad toward the cliff, boulders, lightning javelins, a call to the wind demons. */
  storm: 25,
  boulders: 26,
  javelins: 27,
  call: 28,
  /** Vishdhar: venom spat from his hoods, a head lunging low across the lake, a rain of poison. */
  venom: 29,
  lunge: 30,
  poison: 31,
  /** Darpan-asur: a sweeping beam of light, a rain of shards, a show of reflections (after which it is dull). */
  beam: 32,
  shards: 33,
  show: 34,
  /** Raakhasur: a rush to touch a soldier's head, waves of ash, ash rain, and Nartaki's dance. */
  rush: 35,
  ash: 36,
  dance: 37,
  /** Maniyodha: a fan of arrows, an agnibaan arrow that bursts into fire on the ground, a leaping sword cut. */
  fan: 38,
  agnibaan: 39,
  cleave: 40,
  /** Suryakavach: a mace blow whose shock runs along the ground, spears hurled high, a call to the maharathis. */
  mace: 41,
  spears: 42,
  rathis: 43,
  /** Jodasur: boulders hurled, a pounce that shakes the ground, a bull's charge across the akhada. */
  hurl: 44,
  pounce: 45,
  bull: 46,
  /** Saptashir: fire from his seven mouths, Moonblade' cut along the ground, burning stones from the sky. */
  tenfire: 47,
  moonblade: 48,
  meteors: 49,
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

  /**
   * A stage chased by fire (Agnivan): a wall of fire follows the squad from behind at `speed` px/s, starting
   * `delaySec` after the start. It never lags more than `maxLag` px behind the rearmost soldier (so it is always
   * just off screen), waits before a rest stop and the boss, burns whoever it touches (`dps`), and throws a
   * soldier caught deep inside it forward. Speed scales with difficulty.
   */
  /** Sagar Setu's sea: a floating stone starts sinking after `sinkDelaySec` under weight, sinks at `sinkSpeed`
   * px/s and stops holding anyone `goneBelow` px down; empty, it floats back at `riseSpeed`. Boats sail at
   * `boatSpeed`. In the water a soldier moves at `waterSlow` of their speed. */
  sea: { sinkDelaySec: 0.8, sinkSpeed: 26, riseSpeed: 26, goneBelow: 46, boatSpeed: 95, waterSlow: 0.55 },

  /** Vayu Shikhar's gusts: every `everySec` (±`jitterSec`) the wind blows one way for `sec` at `push` px/s, after
   * a `warnSec` warning (the trees bend). Crouching cuts the push to `crouch`. */
  gusts: { everySec: 7, jitterSec: 2, sec: 2.2, push: 95, warnSec: 1.1, crouch: 0.35 },

  /** Naag Lok's poison pools hurt `dps` while you stand in them. */
  poison: { dps: 9 },

  /** Maya Nagri's false floors give way `fallSec` after a soldier steps on them and come back after `backSec`;
   * MAYASTRA shows (and steadies) every illusion for `revealSec`. */
  maya: { fallSec: 0.25, backSec: 3, revealSec: 10 },

  /** Bhasm Parvat's lava rises from below at `speed` px/s (by difficulty) once it starts, never more than `maxLag`
   * below the lowest soldier; it burns (`dps`) and throws whoever it catches up onto ground; it waits under a rest
   * stop and the boss's floor. */
  /**
   * Suvarna: Meghbaan shoots from the clouds: every `everySec` (± `jitterSec`) a mark on the ground under a soldier,
   * and `warnSec` later `arrows` arrows come down within `spread` of it.
   */
  megh: { everySec: 5.5, jitterSec: 1.5, warnSec: 1.3, arrows: 6, spread: 60, dmg: 10 },
  /** Dwand Bhoomi: the akhada's mud slows a soldier to this share of their pace. */
  mud: { slow: 0.6 },
  /** Chakra Durg: the formation closes behind the squad: no way back past `lag` behind the rearmost soldier. */
  vyuh: { lag: 240 },
  lava: {
    delaySec: 6,
    maxLag: 360,
    dps: 40,
    speed: { easy: 14, normal: 18, hard: 22 } as Record<'easy' | 'normal' | 'hard', number>,
  },

  chase: {
    delaySec: 7,
    maxLag: 330,
    dps: 40,
    speed: { easy: 44, normal: 54, hard: 64 } as Record<'easy' | 'normal' | 'hard', number>,
  },

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
    /** A rest stop's fire heals this much a second; the stage's hazard waits `calmSec` after an arena falls. */
    restHeal: 25,
    calmSec: 7,
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
    /** Agnivan fire imp: runs at you, leaps when close and bursts where it lands (or when it touches you). */
    imp: {
      hp: 2,
      width: 18,
      height: 24,
      speed: 115,
      sight: 460,
      leapRange: 150,
      leapVx: 230,
      leapVy: -420,
      leapEvery: 1.4,
      blast: 46,
      dmg: 14,
      score: 120,
    },
    /** Agnivan burning bat: circles above, then dives across the squad dropping embers. */
    bat: {
      hp: 1,
      width: 24,
      height: 16,
      speed: 150,
      sight: 620,
      hover: 130,
      diveEvery: 2.6,
      diveSec: 1.1,
      emberEvery: 0.12,
      dmg: 7,
      score: 150,
    },
    /** Agnivan tree demon: slow, bark in front (shots from the front do little), lobs burning logs. */
    treant: {
      hp: 9,
      width: 30,
      height: 46,
      speed: 34,
      sight: 580,
      fireEvery: 2.8,
      keepAway: 230,
      dmg: 16,
      blast: 52,
      /** Damage taken from the front (bark) and from behind. */
      front: 0.3,
      back: 1.6,
      score: 300,
    },
    /**
     * Jwala Vriksh-asur, the burning banyan at the end of Agnivan. It never moves: roots race along the ground at
     * you (jump them), burning fruit falls on marked spots, and it breathes fire from its hollow. Below `phase2`
     * its bark hardens: only shots fired from up in its branches (above `heartRise` px over the floor) reach the
     * heart; shots from below do `barkDamage` of their damage.
     */
    vriksha: {
      width: 150,
      height: 260,
      baseHp: 60,
      hpPerPlayer: 80,
      sight: 900,
      score: 5000,
      rootDmg: 18,
      fruitDmg: 16,
      breathDmg: 10,
      fruitBlast: 54,
      phase2: 0.55,
      heartRise: 150,
      barkDamage: 0.15,
      /** Pause between attacks (s), phase 1 and 2. */
      rest: [1.4, 1.0],
    },
    /** Sagar Setu makara rider: waits under the sea, leaps across when a soldier comes near, spits once at the top. */
    makar: {
      hp: 3,
      width: 34,
      height: 22,
      sight: 260,
      leapSec: 1.3,
      leapHeight: 190,
      leapEvery: 2.8,
      dmg: 10,
      contactDmg: 14,
      score: 180,
    },
    /** Sagar Setu crab asura: a shell in front that no shot gets through (blade, astra, or go round it), claws. */
    crab: {
      hp: 4,
      /** Damage from shots from the front (the shell) and from behind. */
      front: 0.25,
      back: 1.5,
      width: 30,
      height: 22,
      speed: 48,
      sight: 520,
      lungeEvery: 2.4,
      lungeSpeed: 220,
      dmg: 12,
      score: 220,
    },
    /** Sagar Setu conch blower: stands still and sends a surge of water along the ground (jump it), then a spray. */
    conch: {
      hp: 4,
      width: 22,
      height: 34,
      sight: 560,
      fireEvery: 2.6,
      surgeDmg: 12,
      sprayDmg: 7,
      score: 200,
    },
    /**
     * Chhaya, the shadow-catcher of the southern sea (Sagar Setu's boss). Half out of the sea at the island's end.
     * Her hand comes up where a soldier's shadow lies (move off the mark); after a grab her jaws hang open for
     * `openSec`, the only time shots really hurt her (`shut` damage otherwise). A tidal surge, water spat in arcs.
     */
    chhaya: {
      width: 160,
      height: 300,
      baseHp: 60,
      hpPerPlayer: 80,
      sight: 900,
      score: 5500,
      grabDmg: 24,
      grabReach: 48,
      surgeDmg: 18,
      spitDmg: 14,
      spitBlast: 50,
      openSec: 2.6,
      shut: 0.2,
      phase2: 0.5,
      rest: [1.1, 0.8],
    },
    /** Vayu Shikhar wind demon: hangs high on one side, swoops straight through the squad, sheds feathers. */
    harpy: {
      hp: 2,
      width: 26,
      height: 20,
      speed: 170,
      sight: 680,
      hover: 170,
      swoopEvery: 3,
      swoopSec: 0.9,
      featherEvery: 2.2,
      dmg: 7,
      score: 160,
    },
    /** Vayu Shikhar boulder roller: stands on a ledge and heaves boulders down at the squad. */
    roller: {
      hp: 5,
      width: 26,
      height: 36,
      sight: 640,
      fireEvery: 2.9,
      dmg: 16,
      blast: 52,
      score: 240,
    },
    /** Vayu Shikhar cloud lancer: rides a cloud, raises a javelin of lightning (it glows) and hurls it. */
    lancer: {
      hp: 3,
      width: 30,
      height: 30,
      speed: 90,
      sight: 700,
      hover: 210,
      fireEvery: 2.8,
      aimSec: 0.6,
      dmg: 13,
      speedShot: 520,
      score: 220,
    },
    /**
     * Aandhi, who sits as a sage on Meghgiri to waylay travellers (Vayu Shikhar's boss). His sage's guise halves what
     * hits him (`guise` damage) except while he holds up a storm (`stormSec`): then he is wide open. The storm drives
     * the squad toward the summit's edge at `stormPush` px/s; VAYUSTRA cast into it turns it on him.
     */
    aandhi: {
      width: 70,
      height: 130,
      baseHp: 55,
      hpPerPlayer: 75,
      sight: 900,
      score: 5500,
      guise: 0.35,
      stormSec: 3,
      stormPush: 150,
      boulderDmg: 16,
      boulderBlast: 56,
      javelinDmg: 12,
      reversedShare: 0.1,
      phase2: 0.5,
      rest: [1.2, 0.9],
    },
    /** Naag Lok naga warrior: slithers low to the ground (shots at standing height pass over it: crouch), strikes. */
    serpent: {
      hp: 3,
      width: 34,
      height: 16,
      speed: 95,
      sight: 520,
      strikeRange: 70,
      strikeEvery: 1.6,
      dmg: 12,
      score: 170,
    },
    /** Naag Lok wall cobra: coiled on a ledge, spits venom in arcs that leave the ground poisoned for a moment. */
    spitter: {
      hp: 4,
      width: 24,
      height: 30,
      sight: 600,
      fireEvery: 2.4,
      dmg: 11,
      blast: 40,
      score: 200,
    },
    /** Naag Lok egg: hatches two naga warriors `hatchSec` after a soldier comes within `sight`, unless broken first. */
    egg: { hp: 2, width: 22, height: 24, sight: 420, hatchSec: 5, score: 100 },
    /**
     * Vishdhar, the many-hooded serpent of the poisoned lake (Naag Lok's boss). His coils fill the far end; three of
     * his heads rise out of the lake and bob (one-way surfaces). Dance on them: every landing on a
     * head costs him `stomp` of his health; shots do `shot` of their damage.
     */
    vishdhar: {
      width: 190,
      height: 150,
      baseHp: 60,
      hpPerPlayer: 80,
      sight: 1000,
      score: 6000,
      stomp: 0.03,
      shot: 0.3,
      venomDmg: 11,
      lungeDmg: 18,
      poisonDmg: 12,
      poisonBlast: 48,
      phase2: 0.5,
      rest: [1.2, 0.9],
    },
    /** Maya Nagri mirror shade: stands where a soldier's reflection would be, across its mirror, and shoots back. */
    mirror: {
      hp: 3,
      width: 22,
      height: 34,
      speed: 120,
      sight: 560,
      span: 220,
      fireEvery: 1.5,
      dmg: 9,
      score: 200,
    },
    /** Maya Nagri dancer: vanishes and reappears behind a soldier, strikes, vanishes again. */
    dancer: {
      hp: 3,
      width: 22,
      height: 34,
      sight: 560,
      blinkEvery: 2.6,
      strikeSec: 0.45,
      dmg: 13,
      score: 220,
    },
    /** Maya Nagri painted guard: a picture on the wall (untouchable) until a soldier comes close; then it steps out. */
    painting: {
      hp: 4,
      width: 26,
      height: 38,
      wake: 110,
      speed: 70,
      lungeEvery: 1.8,
      lungeSpeed: 260,
      dmg: 13,
      score: 230,
    },
    /**
     * Darpan-asur, the great mirror of the hall of illusions (Maya Nagri's boss). While it shines, every shot is turned back at
     * the squad; after its show of reflections it goes dull for `dullSec` (MAYASTRA dulls it for `mayaSec`), and only
     * then does it break.
     */
    darpan: {
      width: 140,
      height: 230,
      baseHp: 60,
      hpPerPlayer: 80,
      sight: 1000,
      score: 6000,
      reflectDmg: 8,
      beamDmg: 10,
      shardDmg: 12,
      shardBlast: 44,
      dullSec: 4,
      mayaSec: 6,
      phase2: 0.5,
      rest: [1.1, 0.8],
    },
    /** Bhasm Parvat ghost: drifts through rock toward the nearest soldier; its touch is cold. */
    pret: { hp: 2, width: 22, height: 30, speed: 60, sight: 520, dmg: 10, score: 150 },
    /** Bhasm Parvat ash golem: brought down, it is a heap of ash that rises again after `riseSec`, unless fire or
     * an astra finishes it (agni's burn, vidyut...). */
    golem: {
      hp: 5,
      width: 28,
      height: 40,
      speed: 45,
      sight: 520,
      riseSec: 4,
      punchEvery: 1.6,
      dmg: 14,
      score: 240,
    },
    /** Bhasm Parvat skull-lamp carrier: walks with a lamp in a skull, and calls up a ghost every `callEvery`. */
    lantern: { hp: 3, width: 22, height: 34, speed: 50, sight: 560, callEvery: 6, score: 200 },
    /**
     * Raakhasur, whose touch on any head turns it to ash (Bhasm Parvat's boss). He rushes to touch a soldier's head
     * (`touchDmg`) and his body is hardened (`hard` damage) except while he dances: Nartaki's dance shows `steps`
     * poses one after another; when any soldier holds each pose in its beat, he copies the last one, puts his hand
     * on his own head, and burns (`selfBurn` of his health).
     */
    raakhasur: {
      width: 50,
      height: 110,
      baseHp: 60,
      hpPerPlayer: 80,
      sight: 1000,
      score: 6500,
      speed: 90,
      rushSpeed: 260,
      touchDmg: 30,
      hard: 0.25,
      ashDmg: 14,
      rainDmg: 12,
      rainBlast: 46,
      steps: 3,
      beatSec: 1.1,
      selfBurn: 0.15,
      phase2: 0.5,
      rest: [1.1, 0.8],
    },
    /** Samarpan Maidan archer: every `volleyEvery` lofts `arrows` arrows in an arc at a soldier. */
    archer: {
      hp: 3,
      width: 22,
      height: 38,
      speed: 40,
      sight: 640,
      volleyEvery: 2.8,
      arrows: 3,
      dmg: 9,
      score: 200,
    },
    /**
     * War elephant: plods on; trumpets (`windSec`) when a soldier is on its level ahead, then charges at
     * `chargeSpeed` (trampling for `trample`) until well past them, a wall or a ledge. Jump it, or get out of the way.
     */
    elephant: {
      hp: 14,
      width: 64,
      height: 58,
      speed: 30,
      sight: 560,
      windSec: 0.8,
      chargeSpeed: 300,
      chargeSec: 2.2,
      restSec: 2.5,
      trample: 26,
      score: 500,
    },
    /** War drummer: every `beatEvery` its drum hurries every foe within `reach` (their next shot comes at once). */
    drummer: { hp: 4, width: 24, height: 34, sight: 600, beatEvery: 3, reach: 420, score: 250 },
    /**
     * Maniyodha, the guru's son (Samarpan Maidan's boss). Arrows in a fan, an agnibaan arrow that bursts into fire along
     * the ground, a leaping sword cut, and SAMARPANASTRA (the arena's rule: lay down your weapons and it passes).
     */
    maniyodha: {
      width: 40,
      height: 92,
      baseHp: 60,
      hpPerPlayer: 80,
      sight: 1000,
      score: 7000,
      speed: 110,
      arrowDmg: 10,
      fireDmg: 14,
      fireBlast: 60,
      cleaveDmg: 26,
      phase2: 0.5,
      rest: [1.0, 0.75],
    },
    /** Chakra Durg discus thrower: its disc flies out `outSec` and comes back to its hand. */
    chakri: {
      hp: 3,
      width: 22,
      height: 36,
      speed: 40,
      sight: 600,
      throwEvery: 2.6,
      outSec: 0.8,
      dmg: 10,
      score: 220,
    },
    /** Maharathi: closes in, crouches (`windSec`) and lunges through a soldier at `lungeSpeed`. */
    rathi: {
      hp: 4,
      width: 22,
      height: 40,
      speed: 75,
      sight: 560,
      reach: 170,
      windSec: 0.45,
      lungeSpeed: 560,
      lungeSec: 0.32,
      dmg: 16,
      coolSec: 1.8,
      score: 260,
    },
    /** Net thrower: lobs a net; whoever it lands on moves at `slow` for `netSec`. */
    netter: {
      hp: 3,
      width: 22,
      height: 36,
      sight: 560,
      throwEvery: 3.4,
      netSec: 1.4,
      slow: 0.3,
      dmg: 4,
      score: 220,
    },
    /**
     * Suryakavach, who holds the gate of the bhanwarvyuh (Chakra Durg's boss). His boon holds every blow back while the
     * sun shines (`sunSec`); then a great discus covers the sun (`eclipseSec`) and he lowers his guard. A soldier who
     * throws the CHAKRAM brings the eclipse at once.
     */
    suryakavach: {
      width: 52,
      height: 104,
      baseHp: 55,
      hpPerPlayer: 75,
      sight: 1000,
      score: 7500,
      sunSec: 6.5,
      eclipseSec: 4.5,
      maceDmg: 16,
      spearDmg: 12,
      spearBlast: 40,
      phase2: 0.5,
      rest: [1.1, 0.8],
    },
    /**
     * Dwand Bhoomi wrestler: closes in and grabs a soldier (`holdSec`, `squeeze` every quarter second), then throws
     * them back. `breakDmg` of damage while it holds makes it let go.
     */
    pehlwan: {
      hp: 6,
      width: 26,
      height: 40,
      speed: 70,
      sight: 520,
      holdSec: 1.1,
      squeeze: 4,
      breakDmg: 2,
      coolSec: 2.2,
      score: 300,
    },
    /** Mace spinner: spins (`spinSec`, shots glance off) toward a soldier, then stands dizzy (`dizzySec`, hits double). */
    gadadhar: {
      hp: 5,
      width: 26,
      height: 40,
      speed: 40,
      spinSpeed: 95,
      sight: 520,
      reach: 240,
      spinSec: 2,
      dizzySec: 1.6,
      score: 300,
    },
    /** Slinger: whirls and lets fly a stone that lands with a small blast. */
    slinger: { hp: 3, width: 22, height: 36, sight: 600, throwEvery: 2.4, dmg: 9, blast: 30, score: 200 },
    /** One half of Jodasur: crawls toward the other half to join it; shots push it the way they fly. */
    ardh: { hp: 1, width: 30, height: 54, speed: 24, sight: 2000, push: 18, stunSec: 0.35, score: 0 },
    /**
     * Jodasur, king of Rajgarh, born in two halves joined (Dwand Bhoomi's boss). Brought down he splits in two and
     * the halves crawl back together (rejoined with `rejoin` of his health); push them apart (`apart` px, shots
     * push a half the way they fly) and they cannot join: he is finished.
     */
    jodasur: {
      width: 56,
      height: 108,
      baseHp: 55,
      hpPerPlayer: 70,
      sight: 1000,
      score: 8000,
      speed: 100,
      bullSpeed: 380,
      hurlDmg: 10,
      hurlBlast: 44,
      pounceDmg: 15,
      bullDmg: 18,
      rejoin: 0.3,
      apart: 520,
      phase2: 0.5,
      rest: [1.0, 0.75],
    },
    /** Suvarna torch thrower: lobs a pot of burning oil that bursts into fire on the ground. */
    mashaal: { hp: 3, width: 22, height: 36, sight: 600, throwEvery: 2.8, dmg: 10, blast: 44, score: 220 },
    /**
     * Meghbaan's warrior of illusion: unseen in the clouds and untouchable, it shows itself only to loose its arrows
     * (`showSec` every `shootEvery`).
     */
    mayavi: {
      hp: 3,
      width: 24,
      height: 34,
      speed: 80,
      sight: 620,
      shootEvery: 2.8,
      showSec: 1.1,
      dmg: 9,
      score: 260,
    },
    /**
     * Nidrasur, asleep across the way: no weapon wakes him by hurting him, but noise does: `wakeAt` ticks of
     * gunfire within `hears` and he wakes, rolls at the squad for `rampageSec`, and sleeps again.
     */
    nidrasur: {
      hp: 1,
      width: 200,
      height: 66,
      sight: 900,
      hears: 520,
      wakeAt: 50,
      rampageSec: 4,
      rollSpeed: 150,
      dmg: 22,
      score: 0,
    },
    /**
     * Saptashir of the golden city, seven-headed (the saga's last boss). His heads take the blows (`headHp` each) and grow back
     * (`regrowSec`); only with every head cut does his body feel the shots fully (his body takes `guarded` while a
     * head stands). PRALAY is his astra (the arena's rule); the squad's PARAMASTRA strikes his heart whatever
     * his heads.
     */
    saptashir: {
      width: 120,
      height: 200,
      baseHp: 70,
      hpPerPlayer: 85,
      sight: 1100,
      score: 12000,
      heads: 7,
      headHp: 4,
      regrowSec: [1.5, 1.15],
      guarded: 0.15,
      fireDmg: 9,
      swordDmg: 18,
      meteorDmg: 12,
      meteorBlast: 50,
      phase2: 0.5,
      rest: [1.0, 0.8],
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

  /** Powers (astras) and the team paramastra. Distances in px, damage per hit or per second (dps). */
  powers: {
    /** Charges per pickup, and the most one soldier can carry. */
    charges: {
      agni: 3,
      jal: 2,
      vayu: 3,
      singularity: 2,
      naga: 3,
      shyen: 2,
      chakram: 3,
      vidyut: 2,
      tej: 1,
      maya: 2,
    } as Record<PowerKind, number>,
    maxCharges: 4,
    /**
     * Astras come back in a fight: every `kills` enemies a soldier brings down by weapon or blade (not by astra)
     * return one charge of the astra being carried, up to maxCharges.
     */
    regainKills: 6,
    /**
     * A wall of flame, then burning ground. Whatever the fire touches is set alight: it burns on for `alightSec`
     * at `alightDps` and passes the fire to troopers within `spread` px.
     */
    agni: {
      waveDamage: 8,
      waveSpeed: 520,
      waveSec: 0.8,
      burnLength: 340,
      burnSec: 4,
      burnDps: 16,
      alightSec: 3,
      alightDps: 7,
      spread: 30,
    },
    /** Rain; at sea it also holds the tide at its lowest for `tideHoldSec`. */
    jal: { range: 15 * 32, back: 3 * 32, damage: 6, tideHoldSec: 8 },
    /**
     * The whirlwind: appears `ahead` px in front, walks at `speed` for `sec` seconds, picks up as many as `carry`
     * troopers within `reach` px (up to `tall` px high), lifts them over `riseSec`, wears them down at `dps`, and
     * hurls them when it blows out. The first gust staggers troopers within `gust` px.
     */
    vayu: {
      ahead: 70,
      speed: 150,
      sec: 3.2,
      reach: 84,
      tall: 210,
      carry: 8,
      riseSec: 0.9,
      spin: 7,
      dps: 5,
      fling: 520,
      flingUp: 380,
      flingSec: 0.7,
      flingDamage: 12,
      gust: 150,
      height: 120,
      push: 300,
      pushSec: 0.25,
    },
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
    param: {
      perKill: 3,
      perDamage: 0.12,
      max: 100,
      /** Wind-up before the strike: the arrow climbs, Param's form opens in the sky and folds into a spear. */
      windupSec: 2.2,
      range: 1150,
      damage: 90,
      /** Bosses lose this share of their full health. */
      bossShare: 0.12,
      shieldSec: 1.6,
    },
    /** Three serpents that steer toward the nearest foe (turn rate in rad/s). */
    naga: { serpents: 3, speed: 340, turn: 7, damage: 9, lifeSec: 2.6, seek: 720 },
    /** The eagle's dive: clears enemy serpents and shots within `range`, crushes flyers, shields the caller. */
    shyen: { range: 900, flyerDamage: 30, damage: 8, shieldSec: 1.2 },
    /** The discus: hits up to `hits` different foes, then flies back to its thrower. */
    chakram: { speed: 540, turn: 9, hits: 6, damage: 8, seek: 560, outSec: 2.4, maxSec: 5 },
    /** Vidyut picks one form per call: a trident strike, a spirit ally, or a rain of fire. */
    vidyut: {
      strike: { targets: 4, range: 720, damage: 32 },
      spirit: { sec: 7, everySec: 0.35, damage: 5, range: 600 },
      rain: { bolts: 8, spread: 560, damage: 14, blast: 64 },
    },
    /** A golden bolt; or, with a boss's tej orb within `reflectRange`, the orb turned back on its boss. */
    tej: { boltDamage: 40, speed: 620, reflectRange: 640, reflectShare: 0.09 },
  },

  /**
   * Astra Saga boss rules: astras the bosses themselves call, layered on top of their normal attacks. Each has a
   * counter the squad can learn (see docs/ASTRA_SAGA.md). Times in seconds, scaled by the mission's boss tempo.
   */
  /**
   * Astra Saga boss moves (see boss-styles.ts) and wave extras. Damage numbers sit next to the classic attacks':
   * a rain fireball hurts like a walker shell, a ring or spiral shot like a fortress bullet.
   */
  /** Stage hazards (LevelDef.hazard). Skyfall reuses the bosses' meteor: gentler and a little slower. */
  hazards: {
    skyfall: { dmg: 10, speed: 0.85 },
    /** Raiders appear this far behind and above a soldier; at most `max` are alive at once. */
    raid: { behind: 360, above: 200, max: 3 },
    /** Shockwaves start this far from the soldier, so there is over a second to see them coming. */
    tremor: { from: 540, speed: 300, dmg: 12 },
  },
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
    /** Serpents that hunt the squad: shoot them down, dash through them, or call shyen. */
    naga: { everySec: 6.5, windupSec: 0.9, serpents: 4, speed: 175, turn: 2.2, damage: 14, lifeSec: 5 },
    /**
     * Samarpanastra: grows with resistance. A soldier who stands still without attacking ("samarpan") is spared;
     * one who keeps fighting draws more arrows each volley. The boss cannot be hurt during the storm. A second
     * call after a storm nobody fought rebounds on the boss.
     */
    samarpan: {
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
    /** A slow homing orb that cannot be shot down; a tej astra (altar in the arena) turns it back. */
    tej: { everySec: 9, windupSec: 1, speed: 115, turn: 1.4, damage: 45, lifeSec: 8, blast: 70 },
    /**
     * Pralay: a long charge. The squad's paramastra fired during it cancels both and stuns the boss;
     * otherwise it lands on everyone not dodging, and (it cannot be called back) scorches its caller too.
     */
    pralay: {
      firstBelow: 0.7,
      everySec: 22,
      windupSec: 4,
      damage: 60,
      backfireShare: 0.06,
      counterShare: 0.12,
      stunSec: 4,
      /** Damage fills the paramastra this much faster while the boss charges. */
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
