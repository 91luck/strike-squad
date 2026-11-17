/**
 * Sawari: what a soldier can ride. Some stretches of a stage have a stand (a garage, a stable, a perch) where every
 * soldier who reaches it gets a ride of its kind, for as long as the stretch lasts: war bikes and armoured jeeps on
 * the road, a jet suit through the sky, a war horse, a tiger and a war elephant on the ground, a great hawk in the air.
 *
 * A ride has its own health (hits go to it before the soldier), its own speed and jumps (or free flight), and its own
 * power on the KNIFE button. Some carry a gun of their own that replaces the soldier's while riding (bike, jeep, jet
 * suit); on the animals the soldier keeps shooting their own gun from the saddle. Losing the ride throws the soldier
 * clear with a moment of safety; the stand gives another to anyone back at it.
 *
 * Movement while riding lives in physics.ts (`stepPlayerMovement` reads `Mover.ride`) so client prediction and the
 * server agree; everything else is the Sim's (`sim.ts`, "rides").
 */

export const MOUNT_KINDS = ['bike', 'jeep', 'jetsuit', 'horse', 'tiger', 'elephant', 'baaz'] as const;
export type MountKind = (typeof MOUNT_KINDS)[number];
export const isMount = (v: unknown): v is MountKind =>
  typeof v === 'string' && (MOUNT_KINDS as readonly string[]).includes(v);

/** The ride's power on the KNIFE button. */
export type MountPower = 'nitro' | 'barrage' | 'missiles' | 'charge' | 'pounce' | 'stomp' | 'dive';

export interface MountGun {
  cooldown: number;
  speed: number;
  damage: number;
  /** Explodes on hit with this radius (0: a plain shot). */
  blast: number;
  /** Shots per trigger pull, fanned over `spread` radians (two barrels side by side when spread is 0). */
  pellets: number;
  spread: number;
  lifetime: number;
  pierce: boolean;
}

export interface MountDef {
  /** Free flight (up/down with the stick or Jump), no gravity. */
  fly: boolean;
  /** Top speed, px/s (in flight on both axes). */
  speed: number;
  /** Jump speed on the ground; the air jumps are 0.88 of it. */
  jump: number;
  airJumps: number;
  /** The ride's own health. */
  hp: number;
  /** Damage taken by the ride is multiplied by this (armour). */
  armor: number;
  /** Its own gun, or null: the soldier shoots their own gun from the saddle. */
  gun: MountGun | null;
  power: MountPower;
  /** Seconds between uses of the power. */
  powerCd: number;
  /** Damage to a trooper it runs into at speed (0: it does not trample). */
  ram: number;
  /** How high the soldier sits above the ground (px): where their gun is, and where the game draws them. */
  seat: number;
}

export const MOUNTS: Record<MountKind, MountDef> = {
  bike: {
    fly: false,
    speed: 330,
    jump: 640,
    airJumps: 1,
    hp: 60,
    armor: 1,
    gun: {
      cooldown: 0.1,
      speed: 720,
      damage: 0.9,
      blast: 0,
      pellets: 2,
      spread: 0,
      lifetime: 0.85,
      pierce: false,
    },
    power: 'nitro',
    powerCd: 3,
    ram: 3,
    seat: 22,
  },
  jeep: {
    fly: false,
    speed: 250,
    jump: 610,
    airJumps: 1,
    hp: 130,
    armor: 0.55,
    gun: {
      cooldown: 0.42,
      speed: 560,
      damage: 3,
      blast: 50,
      pellets: 1,
      spread: 0,
      lifetime: 1.1,
      pierce: false,
    },
    power: 'barrage',
    powerCd: 4,
    ram: 4,
    seat: 44,
  },
  jetsuit: {
    fly: true,
    speed: 270,
    jump: 0,
    airJumps: 0,
    hp: 60,
    armor: 1,
    gun: {
      cooldown: 0.14,
      speed: 860,
      damage: 1.1,
      blast: 0,
      pellets: 2,
      spread: 0,
      lifetime: 0.9,
      pierce: true,
    },
    power: 'missiles',
    powerCd: 4,
    ram: 0,
    seat: 0,
  },
  horse: {
    fly: false,
    speed: 310,
    jump: 680,
    airJumps: 2,
    hp: 70,
    armor: 1,
    gun: null,
    power: 'charge',
    powerCd: 2.5,
    ram: 0,
    seat: 34,
  },
  tiger: {
    fly: false,
    speed: 285,
    jump: 670,
    airJumps: 1,
    hp: 85,
    armor: 0.9,
    gun: null,
    power: 'pounce',
    powerCd: 2.2,
    ram: 2,
    seat: 26,
  },
  elephant: {
    fly: false,
    speed: 175,
    jump: 600,
    airJumps: 1,
    hp: 220,
    armor: 0.4,
    gun: null,
    power: 'stomp',
    powerCd: 3,
    ram: 6,
    seat: 70,
  },
  baaz: {
    fly: true,
    speed: 285,
    jump: 0,
    airJumps: 0,
    hp: 65,
    armor: 1,
    gun: null,
    power: 'dive',
    powerCd: 3,
    ram: 0,
    seat: 36,
  },
};

/** The powers' numbers. */
export const MOUNT_POWER = {
  /** Bike: a burst of speed that runs troopers down; bullets pass through. */
  nitro: { sec: 0.7, speed: 640, damage: 7 },
  /** Jeep: rockets lobbed in a fan ahead. */
  barrage: { rockets: 5, damage: 4, blast: 60, speed: 520 },
  /** Jet suit: missiles that find the nearest foes. */
  missiles: { count: 6, damage: 5, blast: 40, speed: 460, turn: 5 },
  /** Horse: a gallop that tramples everything in the way. */
  charge: { sec: 0.55, speed: 600, damage: 9 },
  /** Tiger: a leap onto the nearest foe in reach. */
  pounce: { range: 280, damage: 16 },
  /** Elephant: a stamp that shakes the ground round it. */
  stomp: { radius: 210, damage: 11 },
  /** Hawk: a dive that strikes where it lands. */
  dive: { radius: 120, damage: 14, speed: 820 },
} as const;

/** Ticks a ride's power is "in use" (nitro and charge run that long; the rest are instant). */
export const RIDE_RAM_COOLDOWN_SEC = 0.35;

/** The ride's index on the wire (-1: on foot). */
export const mountIndex = (k: MountKind | null): number => (k ? MOUNT_KINDS.indexOf(k) : -1);
export const mountOf = (i: number): MountKind | null => (i >= 0 ? (MOUNT_KINDS[i] ?? null) : null);
