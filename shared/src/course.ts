import { GAME_CONFIG, type BossKind, type PickupKind, type TrooperKind } from './config';
import {
  Builder,
  type ArtStyle,
  type BossRule,
  type Faction,
  type FieldKind,
  type HazardDef,
  type LevelDef,
  type MissionMods,
  type WaveSpawn,
  Tile,
  type Vyuha,
} from './level';

/**
 * Missions as data: a mission is a list of `Section`s laid out left to right. Each section names a reusable
 * terrain template and lists its enemies and pickups in a tiny text format, with columns *relative to the section*,
 * so sections can be reordered, resized or copied between missions without recomputing a single coordinate.
 *
 *   { zone: 'Dune Sea', art: 'desert', land: 'pits', len: 38, holes: [9, 22],
 *     foes: 'S6 T16^ G20 D24', loot: '+34' }
 *
 * Foes   `<kind><col>[^]`      S soldier · H shield · G grenadier · J jetpack · T turret · D drone ·
 *                              I fire imp · B burning bat · W tree demon (Agnivan's own).
 *                              `^` stands it on the highest surface (a ledge or platform) instead of the ground;
 *                              `_` on the lowest (the floor of a passage under a wall, a trench bottom).
 * Loot   `<kind><col>[^][*]`   s spread · m machine gun · l laser · + med-kit;
 *                              powers: a agni (fire) · w jal (rain) · v vayu (wind) · b black hole ·
 *                              n naga · g shyen · c chakram chakra · p vidyut · x tej.
 *                              `*` makes it an altar that comes back after it is taken.
 * Waves  `<count><kind><side>` side L / R (arena edges) or ^ (dropping from the sky), e.g. '3SR 2SL J^'.
 *
 * Mistakes (an enemy over a pit, a bad token) throw when the mission is built, and the tests build every mission.
 */

/**
 * Terrain templates. The first six are the classic set; the rest give stages a shape of their own:
 *
 *   ascent    terraces up to a long high plateau, a lookout above it, then a cliff to jump off
 *   chasm     no ground at all: hop a chain of floating ledges at changing heights over the drop
 *   tunnel    a cave: a rock ceiling over the top of the screen, stalactites to duck, a stash pocket in the roof
 *   trench    a war trench two tiles deep with sandbag cover inside and a mound in the middle
 *   rampart   a fortress wall: climb it and run its top (turrets, loot), or take the passage under it
 *   pillars   a field of wide stone pillars of different heights rising out of a pit
 */
export type Land =
  | 'flat'
  | 'pits'
  | 'bridge'
  | 'steps'
  | 'towers'
  | 'catwalks'
  | 'ascent'
  | 'chasm'
  | 'tunnel'
  | 'trench'
  | 'rampart'
  | 'pillars'
  | 'treefall'
  | 'fork'
  | 'river'
  | 'dive'
  | 'stones'
  | 'shoals'
  | 'sea'
  | 'cliff'
  | 'illusion'
  | 'warpath'
  | 'rings'
  | 'skyway';

export const LANDS: readonly Land[] = [
  'flat',
  'pits',
  'bridge',
  'steps',
  'towers',
  'catwalks',
  'ascent',
  'chasm',
  'tunnel',
  'trench',
  'rampart',
  'pillars',
  'treefall',
  'fork',
  'river',
  'dive',
  'stones',
  'shoals',
  'sea',
  'cliff',
  'illusion',
  'warpath',
  'rings',
  'skyway',
];

/**
 * Arena room shapes (platforms only: the floor stays flat and open, so bosses walk and charge as always).
 *
 *   classic   two low platforms and a high one in the middle
 *   tiers     a staircase of platforms up to a sniper perch at the top right
 *   twin      two long low decks and one high one: room to run around a boss
 *   open      one small platform: a straight duel on open ground
 *   high      only high perches: hop between them, or fight on the floor
 */
export type Room =
  'classic' | 'tiers' | 'twin' | 'open' | 'high' | 'grove' | 'isle' | 'summit' | 'lake' | 'hall';

export interface ArenaSpec {
  name: string;
  /** Platform layout (default classic). */
  room?: Room;
  /** Ambush waves; for a boss arena, escort waves (see `ArenaDef`). */
  waves?: string[];
  bosses?: BossKind[];
  /** Health multiplier for each boss (twin fights use less than 1). */
  hp?: number;
  /** The last arena: no gate, a wall behind it, and clearing it wins the mission. */
  final?: boolean;
  /** Astras the bosses call (Astra Saga). */
  rules?: BossRule[];
  /** Astra altars inside the arena (respawning pickups), e.g. 'x10' for a tej altar 10 tiles in. */
  altars?: string;
  /** Hold-out arena: survive this many seconds while the waves keep coming (ambush arenas only). */
  survive?: number;
  /** The battle arrays the waves arrive in, one per wave, round and round (see Vyuha). */
  vyuha?: Vyuha[];
}

export interface Section {
  /** HUD name of the area starting here. */
  zone?: string;
  art: ArtStyle;
  /** Terrain template (ignored for arenas, which use the arena room). */
  land?: Land;
  /** Width in tiles. */
  len: number;
  /** Pit columns for `pits`, and their width in tiles (default 3; low gravity sections use wider ones). */
  holes?: number[];
  holeW?: number;
  /** Pools of poison (3 wide, a row deep) at these columns (Naag Lok). */
  pools?: number[];
  /** Walls of fire at these columns: only the rain astra (jal) puts them out. */
  fire?: number[];
  /** A physics field over the whole section (rows 0-17), e.g. low gravity. */
  field?: { kind: FieldKind; power: number };
  /** Anti-gravity lifts (3 wide) at these columns, each with a walkway at its top. */
  lifts?: number[];
  /** Gravity wells (black holes, 10 tiles wide) centred on these columns. */
  wells?: number[];
  /**
   * A stash: a hidden perch high above the path at this column (two double jumps up: a step ledge, then the
   * perch). In a tunnel it is a pocket cut into the rock roof instead. Put loot on it with `^` at the same column.
   */
  stash?: number;
  foes?: string;
  loot?: string;
  /** Checkpoint flag at the start of the section. */
  cp?: boolean;
  /**
   * Rows this stretch sits above the one before (negative: below). A stage that climbs or descends is built from
   * stretches at different heights; climbing needs a `cliff` (ledges up the face), going down is a drop.
   */
  rise?: number;
  /** A rest stop (ashram): see LevelDef.rests. It may hold loot but no foes. */
  rest?: boolean;
  arena?: ArenaSpec;
}

export interface CourseDef {
  id: string;
  name: string;
  mods: MissionMods;
  sections: Section[];
  faction?: Faction;
  param?: boolean;
  /** Enemy/boss hue shift in degrees (cosmetic). */
  tint?: number;
  /** A stage-wide hazard (see HazardDef). */
  hazard?: HazardDef;
  /** A wall of fire chases the squad from behind (see GAME_CONFIG.chase). */
  chase?: boolean;
  /** A stage of its own (see LevelDef.own). */
  own?: boolean;
  /** Gusts of wind (see LevelDef.gusts). */
  gusts?: boolean;
  /** Underground and unlit (see LevelDef.dark). */
  dark?: boolean;
  /** Lava rising from below (see LevelDef.lava). */
  lava?: boolean;
  /** The formation closes behind the squad (see LevelDef.vyuh). */
  vyuh?: boolean;
  /** Meghbaan's arrows from the clouds (see LevelDef.megh). */
  megh?: boolean;
  /** The sea rising and falling, in tiles: surface row `base` ± `amp` every `periodSec` (Sagar Setu). */
  tide?: { base: number; amp: number; periodSec: number };
}

const T = GAME_CONFIG.tile;
/** Ground surface row (rows below are solid). */
const G = 14;
const ROWS = 18;
const PIT = 3;

const FOE: Record<string, TrooperKind> = {
  S: 'soldier',
  H: 'shield',
  G: 'grenadier',
  J: 'jetpack',
  T: 'turret',
  D: 'drone',
  I: 'imp',
  B: 'bat',
  W: 'treant',
  M: 'makar',
  K: 'crab',
  N: 'conch',
  Y: 'harpy',
  R: 'roller',
  L: 'lancer',
  Z: 'serpent',
  C: 'spitter',
  E: 'egg',
  X: 'mirror',
  A: 'dancer',
  Q: 'painting',
  F: 'pret',
  O: 'golem',
  U: 'lantern',
  // two-letter codes (an upper case letter and a lower case one) for the later stages' own rakshasas
  Ar: 'archer',
  Ga: 'elephant',
  Dr: 'drummer',
  Ck: 'chakri',
  Rt: 'rathi',
  Jl: 'netter',
  Pw: 'pehlwan',
  Gd: 'gadadhar',
  Sl: 'slinger',
  Ms: 'mashaal',
  My: 'mayavi',
  Kb: 'nidrasur',
};
/** Foes that fly or float: over a drop they keep the height of the path. */
const FLIERS = new Set<TrooperKind>(['harpy', 'lancer', 'bat', 'drone', 'jetpack', 'pret', 'mayavi']);
const LOOT: Record<string, PickupKind> = {
  s: 'spread',
  m: 'rapid',
  l: 'laser',
  '+': 'medkit',
  a: 'agni',
  w: 'jal',
  v: 'vayu',
  b: 'singularity',
  n: 'naga',
  g: 'shyen',
  c: 'chakram',
  p: 'vidyut',
  x: 'tej',
  y: 'maya',
};
const LOOT_TOKEN = /^([sml+awvbngcpxy])(\d+)([\^_]?)(\*?)$/;
const SIDE: Record<string, WaveSpawn['side']> = { L: 'L', R: 'R', '^': 'sky', P: 'P', U: 'U' };

const tokens = (s: string | undefined): string[] => (s ? s.trim().split(/\s+/) : []);

/** Parse one wave, e.g. '3SR 2SL J^'. Exported for tests. */
export function parseWave(s: string): WaveSpawn[] {
  const out: WaveSpawn[] = [];
  for (const tok of tokens(s)) {
    const m = /^(\d*)([A-Z][a-z]?)(\*?)([LR^PU])$/.exec(tok);
    if (!m || !FOE[m[2] as string]) throw new Error(`bad wave token "${tok}"`);
    const kind = FOE[m[2] as string] as TrooperKind;
    const side = SIDE[m[4] as string] as WaveSpawn['side'];
    const elite = m[3] === '*';
    for (let i = 0; i < Number(m[1] || 1); i++) out.push(elite ? { kind, side, elite } : { kind, side });
  }
  return out;
}

// ---------------------------------------------------------------- terrain templates

type Template = (b: Builder, x: number, s: Section) => void;

/** Open ground with a few platforms to fight from. */
const flat: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  if (n >= 16) b.platform(x + Math.round(n * 0.3), x + Math.round(n * 0.3) + 3, 11);
  if (n >= 24) b.platform(x + Math.round(n * 0.55), x + Math.round(n * 0.55) + 4, 8);
  if (n >= 32) b.platform(x + Math.round(n * 0.8) - 2, x + Math.round(n * 0.8) + 1, 11);
};

/** Ground broken by 3-wide pits, a helper platform over each pit and raised ledges between them. */
const pits: Template = (b, x, s) => {
  const holes = s.holes ?? [Math.floor(s.len / 2) - 1];
  const w = s.holeW ?? PIT;
  b.ground(x, x + s.len - 1, G);
  let prevEnd = 0;
  for (const h of holes) {
    for (let c = x + h; c < x + h + w; c++) for (let r = 0; r < ROWS; r++) b.set(c, r, 0);
    // A helper platform over normal pits; wide low-gravity gaps are meant to be jumped.
    if (w <= PIT) b.platform(x + h - 1, x + h + w, 11);
    const gap = h - prevEnd;
    if (prevEnd > 0 && gap >= 7) {
      const mid = x + prevEnd + Math.floor(gap / 2);
      b.block(mid - 1, mid + 1, 12, 13);
    }
    prevEnd = h + w;
  }
  const tail = s.len - prevEnd;
  if (tail >= 8) {
    const mid = x + prevEnd + Math.floor(tail / 2);
    b.block(mid - 1, mid + 1, 12, 13);
  }
};

/** A one-way bridge over a river, on pillars. */
const bridge: Template = (b, x, s) => {
  const end = x + s.len - 1;
  b.ground(x, x + 2, G);
  b.platform(x + 3, end - 3, 12);
  for (let c = x + 3; c < end - 3; c += 12) b.block(c, c, 13, ROWS - 1);
  b.block(end - 3, end - 3, 13, ROWS - 1);
  b.ground(end - 2, end, G);
};

/** Climb three steps to a plateau (a platform above it) and come back down. */
const steps: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  b.block(x + 3, x + 5, 13, 13);
  b.block(x + 6, x + 8, 12, 13);
  b.block(x + 9, x + n - 13, 11, 13);
  b.block(x + n - 12, x + n - 10, 12, 13);
  b.block(x + n - 9, x + n - 7, 13, 13);
  const mid = x + Math.floor((9 + n - 13) / 2);
  b.platform(mid - 2, mid + 1, 8);
};

/** Watchtowers: a ledge, a high platform, a tall tower you climb over, and a lookout above it. */
const towers: Template = (b, x, s) => {
  b.ground(x, x + s.len - 1, G);
  b.block(x + 5, x + 7, 11, 13);
  b.platform(x + 9, x + 13, 9);
  b.block(x + 15, x + 17, 9, 13);
  b.platform(x + 19, x + 24, 7);
  if (s.len >= 34) b.block(x + 29, x + 30, 12, 13);
};

/** Two tiers of staggered catwalks over the ground, with a low wall to hop. */
const catwalks: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  for (let c = 4; c + 5 < n - 2; c += 9) b.platform(x + c, x + c + 5, 10);
  for (let c = 8; c + 3 < n - 2; c += 9) b.platform(x + c, x + c + 3, 7);
  b.block(x + Math.floor(n / 2), x + Math.floor(n / 2) + 1, 12, 13);
};

/**
 * Split `total` empty columns into `parts` gaps as evenly as whole tiles allow (the extra ones go to the later
 * gaps). Used to space ledges and pillars across a section of any length.
 */
function gaps(total: number, parts: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < parts; i++)
    out.push(Math.floor((total * (i + 1)) / parts) - Math.floor((total * i) / parts));
  return out;
}

/** Terraces up to a long plateau (with a foxhole in it and a lookout above), then a ledge and a cliff down. */
const ascent: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  b.block(x + 3, x + 5, 12, 13);
  b.block(x + 6, x + 8, 10, 13);
  const top1 = x + n - 10;
  b.block(x + 9, top1, 8, 13);
  // A foxhole two tiles deep in the middle of the plateau: cover, and a dip to jump out of.
  const dip = x + Math.floor(n / 2) + 2;
  for (let c = dip - 1; c <= dip + 1; c++) for (let r = 8; r <= 9; r++) b.set(c, r, 0);
  const look = x + Math.floor(n * 0.3);
  b.platform(look, look + 3, 5);
  b.block(top1 + 1, top1 + 3, 11, 13);
};

/** No ground: a chain of floating ledges (one-way, so a lower one never blocks a jump) over the drop. */
const chasm: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 2, G);
  b.ground(x + n - 3, x + n - 1, G);
  const span = n - 6;
  const k = Math.max(1, Math.ceil((span - 3) / 7));
  const g = gaps(span - 4 * k, k + 1);
  const heights = [12, 11, 12, 11, 10, 11, 12, 11];
  let c = x + 3;
  for (let i = 0; i < k; i++) {
    c += g[i] as number;
    b.platform(c, c + 3, heights[i % heights.length] as number);
    c += 4;
  }
};

/** A cave: rock roof over the top seven rows, stalactites hanging to row 9 to duck under. */
const tunnel: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  // dropped into from above: the first columns are an open shaft, so the squad falls in rather than meets the roof
  b.block(x + ((s.rise ?? 0) < 0 ? 4 : 0), x + n - 1, 0, 6);
  for (let c = 6; c + 1 < n - 3; c += 9) {
    if (s.stash !== undefined && Math.abs(c - s.stash) < 6) continue; // keep the climb to the stash clear
    b.block(x + c, x + c + 1, 7, 9);
  }
  // A low rock shelf to fight from (two rows up, so you can still walk along it under a stalactite).
  const shelf = x + Math.floor(n * 0.4);
  b.platform(shelf, shelf + 3, 12);
};

/** A war trench two tiles deep, sandbags to hide behind inside it, a mound in the middle, planks above. */
const trench: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  const a = x + 4;
  const z = x + n - 5;
  for (let c = a; c <= z; c++) for (let r = G; r <= G + 1; r++) b.set(c, r, 0);
  const mid = x + Math.floor(n / 2);
  b.block(mid - 2, mid + 2, G, G + 1);
  b.block(a + 4, a + 4, G + 1, G + 1);
  b.block(z - 4, z - 4, G + 1, G + 1);
  b.platform(a + 1, a + 5, 11);
  b.platform(z - 5, z - 1, 11);
};

/** A fortress wall on arches: climb a ledge and a step to run its top, or walk the passage under it. */
const rampart: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  const w0 = x + 9;
  const w1 = x + n - 8;
  b.block(w0, w1, 7, 10);
  b.platform(x + 3, x + 6, 11);
  b.block(x + 7, x + 8, 9, 10);
  // Merlons along the top: cover for whoever runs it.
  for (let c = w0 + 5; c < w1 - 2; c += 7) b.set(c, 6, Tile.Solid);
  b.platform(w1 + 1, w1 + 4, 11);
};

/** Stone pillars (4 wide) of changing heights rising from a pit: hop from top to top, one row up or down. */
const pillars: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 3, G);
  b.ground(x + n - 4, x + n - 1, G);
  const span = n - 8;
  const k = Math.max(1, Math.ceil((span - 2) / 6));
  const g = gaps(span - 4 * k, k + 1);
  const tops = [12, 11, 12, 11, 10, 11, 12, 11];
  let c = x + 4;
  for (let i = 0; i < k; i++) {
    c += g[i] as number;
    b.block(c, c + 3, tops[i % tops.length] as number, ROWS - 1);
    c += 4;
  }
};

/**
 * A burning tree has fallen across a ravine: the only way over is along its trunk (a one-way log at row 12),
 * with a stump to stand on at each end. The client draws the tree falling as the squad comes near.
 */
const treefall: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 4, G);
  b.ground(x + n - 5, x + n - 1, G);
  b.block(x + 4, x + 4, 12, 13);
  b.platform(x + 5, x + n - 6, 12);
  b.block(x + n - 5, x + n - 5, 12, 13);
};

/**
 * The path forks: burning branches overhead (a high road of one-way boughs, rows 9 and 7) or the hollow under the
 * roots (the ground drops two rows for most of the section). Both come out at the far end.
 */
const fork: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  const a = x + 5;
  const z = x + n - 6;
  for (let c = a; c <= z; c++) for (let r = G; r <= G + 1; r++) b.set(c, r, 0);
  b.block(a - 1, a - 1, 11, 13);
  b.platform(a, a + 5, 10);
  for (let c = a + 7; c + 4 < z - 2; c += 8) b.platform(c, c + 4, 8);
  b.platform(z - 6, z - 1, 10);
};

/** A river bank: a shallow stream (one row lower) between two banks. A rest stop's ground in Agnivan. */
const river: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  const a = x + Math.floor(n * 0.35);
  const z = x + Math.floor(n * 0.65);
  for (let c = a; c <= z; c++) b.set(c, G, 0);
};

/**
 * A channel three rows deep running under the path (a stream bed). With a wall of fire on the path above it
 * (`fire` at the middle column), the only way on is to drop into the water and come up on the far side.
 */
const dive: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  const a = x + 6;
  const z = x + n - 7;
  for (let c = a; c <= z; c++) for (let r = G; r <= G + 2; r++) b.set(c, r, 0);
  b.block(a, a + 1, G + 2, G + 2);
  b.block(z - 1, z, G + 2, G + 2);
  b.platform(z - 4, z - 1, G);
};

/** The sea's resting surface row (Sagar Setu): makara riders wait under it. */
const SEA_ROW = 15;

/**
 * An old sea bridge half sunk: open sea between two banks, crossed on floating stones (4 wide, one every 6 tiles, at rows
 * 12 and 13 in turn). Each stone sinks while it is stood on (GAME_CONFIG.sea): keep hopping.
 */
const stones: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 2, G);
  b.ground(x + n - 3, x + n - 1, G);
  for (let c = x + 4, i = 0; c + 3 < x + n - 4; c += 6, i++) b.plat('stone', c, c + 3, i % 2 ? 13 : 12);
};

/**
 * Shoals: sandbars a row below the path that the high tide covers (wading is slow), rocks to stand on, and a
 * floating stone over each deep channel.
 */
const shoals: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G + 1);
  b.ground(x, x + 3, G);
  b.ground(x + n - 4, x + n - 1, G);
  for (let c = x + 8; c + 2 < x + n - 6; c += 9) {
    for (let cc = c; cc <= c + 2; cc++) for (let r = 0; r < ROWS; r++) b.set(cc, r, 0);
    b.plat('stone', c, c + 2, 13);
  }
  for (let c = x + 6; c < x + n - 6; c += 9) b.block(c - 1, c, G - 1, G);
};

/** Open sea with a boat moored at the near bank: board it and it sails the squad to the far one. */
const sea: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 3, G);
  b.ground(x + n - 2, x + n - 1, G);
  b.plat('boat', x + 4, x + 9, G, x + n - 8);
};

/**
 * Ranbhoomi's war path: open ground cut by wide trenches (5 tiles, too far to jump in one go) with strips of
 * field between them, and a chariot waiting at the start. Board it and it rolls the squad over every trench to
 * the far side; it comes back for anyone left behind.
 */
const warpath: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 9, G);
  b.ground(x + n - 4, x + n - 1, G);
  for (let c = x + 15; c + 5 < x + n - 9; c += 11) b.ground(c, c + 5, G);
  b.plat('chariot', x + 3, x + 8, G, x + n - 9);
};

/**
 * The rings of the bhanwarvyuh: a low rampart every 9 tiles, two and three rows high in turn, to jump over while the
 * ground turns under you.
 */
const rings: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  for (let c = x + 6, k = 0; c + 2 < x + n - 4; c += 9, k++) {
    b.block(c, c + 1, k % 2 ? G - 3 : G - 2, G - 1);
  }
};

/**
 * Over the burning city by air: a long drop with only a landing at each end, and Hansvimaan, Saptashir's flying chariot,
 * waiting at the near one. Board it and it flies the squad across (and comes back for anyone left behind).
 */
const skyway: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 3, G);
  b.ground(x + n - 3, x + n - 1, G);
  b.plat('vimana', x + 4, x + 10, G, x + n - 11);
};

/**
 * A cliff face `rise` rows high: the first eight columns stay at the height of the stretch before, with ledges
 * zig-zagging up beside the face (one every three rows), then the ground of this (higher) stretch.
 */
const cliff: Template = (b, x, s) => {
  const n = s.len;
  const R = Math.max(0, s.rise ?? 0);
  b.ground(x, x + 7, G + R);
  b.ground(x + 8, x + n - 1, G);
  for (let r = G + R - 3, k = 0; r > G; r -= 3, k++) {
    const c = k % 2 ? x + 1 : x + 4;
    b.platform(c, c + 3, r);
  }
};

/**
 * the hall of illusions's illusions: the floor gives out into a drop, and across it run stretches of floor that are not all
 * they seem: false floors (look solid, give way under you) and hidden floors (look like nothing, hold you).
 * A few solid pillars to catch your breath on.
 */
const illusion: Template = (b, x, s) => {
  const n = s.len;
  b.ground(x, x + 3, G);
  b.ground(x + n - 4, x + n - 1, G);
  const kinds: ('fake' | 'hidden')[] = ['fake', 'hidden', 'hidden', 'fake', 'hidden', 'fake', 'hidden'];
  let k = 0;
  for (let c = x + 4; c + 3 < x + n - 4; c += 4) {
    if (k % 3 === 2) b.block(c, c + 3, G, G + 3);
    else b.plat(kinds[k % kinds.length] as 'fake' | 'hidden', c, c + 3, G);
    k++;
  }
};

const LAND: Record<Land, Template> = {
  flat,
  pits,
  bridge,
  steps,
  towers,
  catwalks,
  ascent,
  chasm,
  tunnel,
  trench,
  rampart,
  pillars,
  treefall,
  fork,
  river,
  dive,
  stones,
  shoals,
  sea,
  cliff,
  illusion,
  warpath,
  rings,
  skyway,
};

/**
 * The stash perch, measured from the ground under it: a step ledge four rows up and the perch four more above it
 * (a double jump each). Where the ground is already high (a plateau, a wall top) the perch sits right on top of
 * it, one double jump up. Throws if it would cut into terrain or hang over a pit, so a bad column cannot ship.
 */
function stash(b: Builder, x: number, s: Section, col: number, where: string): void {
  const c = x + col;
  const free = (c0: number, c1: number, row: number): void => {
    for (let cc = c0; cc <= c1; cc++)
      if (b.get(cc, row) !== Tile.Empty) throw new Error(`${where}: stash at ${col} cuts into terrain`);
  };
  if (s.land === 'tunnel') {
    // A pocket in the rock roof, reached from a ledge right below it. Its floor stops one tile short on the
    // left, so you just walk off it to come back down (no need to know the drop-through move).
    for (let cc = c - 1; cc <= c + 2; cc++) for (let r = 2; r <= 6; r++) b.set(cc, r, Tile.Empty);
    b.platform(c, c + 2, 6);
    free(c - 2, c, 10);
    b.platform(c - 2, c, 10);
    return;
  }
  const ground = b.surface(c);
  if (ground >= ROWS || b.get(c, ground) !== Tile.Solid)
    throw new Error(`${where}: stash at ${col} over a pit`);
  if (ground - 8 >= 2) {
    free(c - 4, c - 2, ground - 4);
    free(c - 1, c + 1, ground - 8);
    b.platform(c - 4, c - 2, ground - 4);
    b.platform(c - 1, c + 1, ground - 8);
  } else {
    free(c - 1, c + 1, ground - 4);
    b.platform(c - 1, c + 1, ground - 4);
  }
}

// ---------------------------------------------------------------- arenas

/**
 * An arena room: open floor and three platforms, the gate near the right end (or, for the final arena, a wall).
 * Bosses stand at the far end: a walker 4 tiles from the edge (the second of a pair 9 tiles further in), the gunship
 * hovering 7 tiles in, the fortress against the back wall.
 */
function arenaRoom(b: Builder, x: number, s: Section, a: ArenaSpec): void {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  const at = (f: number, w: number, row: number): void => {
    const c = x + Math.round(n * f);
    b.platform(c, c + w - 1, row);
  };
  switch (a.room ?? 'classic') {
    case 'tiers':
      at(0.2, 5, 11);
      at(0.36, 4, 8);
      at(0.52, 4, 5);
      break;
    case 'twin':
      at(0.16, 8, 11);
      at(0.38, 4, 7);
      at(0.54, 8, 11);
      break;
    case 'open':
      at(0.45, 4, 11);
      break;
    case 'high':
      at(0.14, 3, 11);
      at(0.3, 4, 8);
      at(0.5, 4, 6);
      break;
    case 'hall':
      // the mirror hall: two galleries and a balcony to dodge the beam from
      at(0.2, 5, 11);
      at(0.42, 4, 8);
      at(0.6, 5, 11);
      break;
    case 'lake':
      // Vishdhar's poisoned lake: a bank to land on, then the lake (two rows down, poison) with his heads over it
      for (let c = x + Math.round(n * 0.22); c < x + n - 2; c++)
        for (let r = G; r <= G + 1; r++) b.set(c, r, 0);
      b.field('poison', x + Math.round(n * 0.22), x + n - 3, G - 1, G + 2, GAME_CONFIG.poison.dps);
      // his heads (moving surfaces), each over a loop of his coils showing above the poison (to stand on)
      for (const [f, row] of [
        [0.3, G - 3],
        [0.46, G - 4],
        [0.62, G - 3],
      ] as const) {
        const hc = x + Math.round(n * f);
        b.plat('head', hc, hc + 3, row);
        b.platform(hc - 1, hc + 4, G);
      }
      break;
    case 'summit':
      // the top of Meghgiri: one outcrop to stand on; the storm drives you toward the drop behind you
      at(0.5, 4, 11);
      break;
    case 'isle':
      // The far isle's shore: a rock shelf and two ledges; the sea comes in under Chhaya at the far end
      at(0.2, 4, 11);
      at(0.4, 5, 8);
      at(0.6, 4, 11);
      break;
    case 'grove':
      // the banyan's own boughs reach out over the floor: climb them to its heart
      at(0.22, 4, 11);
      at(0.42, 5, 9);
      at(0.6, 5, 7);
      at(0.75, 4, 5);
      break;
    default:
      at(0.28, 5, 11);
      at(0.47, 4, 8);
      at(0.62, 4, 11);
  }
  const waves = (a.waves ?? []).map(parseWave);
  const bosses = a.bosses ?? [];
  let right: number;
  let gate = -1;
  if (a.final) {
    right = x + n - 13;
    b.block(x + n - 2, x + n - 1, 0, G - 1);
  } else {
    gate = b.gate(x + n - 3, G - 1);
    right = x + n - 4;
  }
  const id = b.arena(
    a.name,
    { trigger: x + (bosses.length ? 7 : 6), left: x, right, floor: G, gate },
    waves,
    bosses[0] ?? null,
    a.rules ?? [],
    a.survive ?? 0,
    a.vyuha ?? [],
  );
  let walkers = 0;
  for (const kind of bosses) {
    if (kind === 'boss') b.boss('boss', x + n - 8, G * T, id, a.hp);
    else if (kind === 'vriksha') b.boss('vriksha', x + n - 6, G * T, id, a.hp);
    else if (kind === 'chhaya') b.boss('chhaya', x + n - 6, G * T, id, a.hp);
    else if (kind === 'aandhi') b.boss('aandhi', x + n - 7, G * T, id, a.hp);
    else if (kind === 'vishdhar') b.boss('vishdhar', x + n - 6, (G + 2) * T, id, a.hp);
    else if (kind === 'darpan') b.boss('darpan', x + n - 6, G * T, id, a.hp);
    else if (kind === 'raakhasur') b.boss('raakhasur', x + n - 8, G * T, id, a.hp);
    else if (kind === 'maniyodha') b.boss('maniyodha', x + n - 9, G * T, id, a.hp);
    else if (kind === 'suryakavach') b.boss('suryakavach', x + n - 7, G * T, id, a.hp);
    else if (kind === 'jodasur') b.boss('jodasur', x + n - 10, G * T, id, a.hp);
    else if (kind === 'saptashir') b.boss('saptashir', x + n - 7, G * T, id, a.hp);
    else if (kind === 'gunship') b.boss('gunship', right - 7, GAME_CONFIG.enemies.gunship.hoverY, id, a.hp);
    else b.boss('walker', right - 4 - 9 * walkers++, G * T, id, a.hp);
  }
}

// ---------------------------------------------------------------- the course builder

/** The surface a token stands on in column `col`: the ground, the highest ledge (`^`) or the lowest floor (`_`). */
function standOn(b: Builder, col: number, mark: string): number {
  if (mark === '^') return b.surface(col, true);
  if (mark === '_') {
    for (let r = ROWS - 1; r >= 1; r--) {
      const t = b.get(col, r);
      if ((t === Tile.Solid || t === Tile.OneWay) && b.get(col, r - 1) === Tile.Empty) return r;
    }
    return ROWS;
  }
  return b.surface(col);
}

export function buildCourse(def: CourseDef): LevelDef {
  const cols = def.sections.reduce((n, s) => n + s.len, 0);
  // each stretch's row offset: climbing stretches sit higher (smaller offset), descending ones lower
  const dys: number[] = [];
  let d = 0;
  for (const s of def.sections) {
    d -= s.rise ?? 0;
    dys.push(d);
  }
  const lo = Math.min(0, ...dys);
  const span = Math.max(0, ...dys) - lo;
  const b = new Builder(cols, ROWS + span);
  let x = 0;
  for (const [i, s] of def.sections.entries()) {
    const where = `${def.id} @${x} ${s.zone ?? s.arena?.name ?? s.land}`;
    b.dy = (dys[i] as number) - lo;
    if ((s.rise ?? 0) > 0 && s.land !== 'cliff') throw new Error(`${where}: a climb needs a cliff`);
    if (s.zone) b.zone(x, s.zone);
    b.style(x, s.art);
    if (s.arena) {
      arenaRoom(b, x, s, s.arena);
      for (const tok of tokens(s.arena.altars)) {
        const m = LOOT_TOKEN.exec(tok);
        if (!m || Number(m[2]) >= s.len) throw new Error(`${where}: bad altar "${tok}"`);
        const col = x + Number(m[2]);
        b.pickup(LOOT[m[1] as string] as PickupKind, col, standOn(b, col, m[3] as string), true);
      }
    } else LAND[s.land ?? 'flat'](b, x, s);
    if (s.stash !== undefined) {
      if (s.arena || s.stash < 5 || s.stash > s.len - 3) throw new Error(`${where}: bad stash column`);
      stash(b, x, s, s.stash, where);
    }
    if (s.field) b.field(s.field.kind, x, x + s.len - 1, 0, ROWS - 1, s.field.power);
    for (const c of s.fire ?? []) b.gate(x + c, G - 1, true);
    for (const c of s.pools ?? []) {
      for (let cc = x + c; cc <= x + c + 2; cc++) b.set(cc, G, 0);
      b.field('poison', x + c, x + c + 2, G - 1, G, GAME_CONFIG.poison.dps);
    }
    for (const c of s.lifts ?? []) {
      // The beam ends at row 3; a walkway at row 5 leads off to the right of it.
      b.field('lift', x + c, x + c + 2, 4, ROWS - 1, 0.55);
      b.platform(x + c + 3, x + c + 9, 5);
    }
    for (const c of s.wells ?? []) b.field('well', x + c - 5, x + c + 4, 6, ROWS - 1, 90);
    if (s.cp) b.checkpoint(x + 2, b.surface(x + 2));
    if (s.rest) {
      if (s.arena || s.foes) throw new Error(`${where}: a rest stop holds no enemies`);
      b.rest(x, x + s.len - 1);
    }
    for (const tok of tokens(s.foes)) {
      const m = /^([A-Z][a-z]?)(\d+)([\^_]?)$/.exec(tok);
      if (!m || !FOE[m[1] as string]) throw new Error(`${where}: bad foe "${tok}"`);
      const col = x + Number(m[2]);
      // makara riders live in the sea: they wait under its surface, whatever is (or is not) below
      let row = m[1] === 'M' ? SEA_ROW : standOn(b, col, m[3] as string);
      // flyers need nothing under them: over a drop they keep the height of the path
      if (row >= ROWS && FLIERS.has(FOE[m[1] as string] as TrooperKind)) row = G;
      if (Number(m[2]) >= s.len || row >= ROWS)
        throw new Error(`${where}: foe "${tok}" has nothing to stand on`);
      b.enemy(FOE[m[1] as string] as TrooperKind, col, row);
    }
    for (const tok of tokens(s.loot)) {
      const m = LOOT_TOKEN.exec(tok);
      if (!m) throw new Error(`${where}: bad loot "${tok}"`);
      const col = x + Number(m[2]);
      const row = standOn(b, col, m[3] as string);
      if (Number(m[2]) >= s.len || row >= ROWS) throw new Error(`${where}: loot "${tok}" is over a pit`);
      // Loot standing on the stash perch is the stage's secret.
      const secret = s.stash !== undefined && Number(m[2]) === s.stash && m[3] === '^';
      b.pickup(LOOT[m[1] as string] as PickupKind, col, row, m[4] === '*', secret);
    }
    x += s.len;
  }
  b.dy = (dys[0] as number) - lo;
  return b.build({
    id: def.id,
    name: def.name,
    start: { x: 3 * T, y: (b.surface(3) + b.dy) * T },
    mods: def.mods,
    faction: def.faction,
    param: def.param,
    tint: def.tint,
    hazard: def.hazard,
    chase: def.chase,
    own: def.own,
    gusts: def.gusts,
    dark: def.dark,
    lava: def.lava,
    vyuh: def.vyuh,
    megh: def.megh,
    tide: def.tide && {
      base: def.tide.base * T,
      amp: def.tide.amp * T,
      periodSec: def.tide.periodSec,
    },
  });
}

/** How long a rest stop is, in tiles. */
export const REST_LEN = 22;

/**
 * Gives a course its breathing room: a rest stop (ashram) after every fight that is not the last, so a stage
 * goes fight, rest, travel, fight instead of one fight running into the next. Each stop has a checkpoint, a
 * medkit and an astra pedestal that refills (every soldier of the squad can take from it); the pedestals go
 * round the astras the stage already hands out, so each stop offers a different one.
 */
export function withRests(def: CourseDef): CourseDef {
  const letters: string[] = [];
  for (const s of def.sections)
    for (const tok of tokens(s.loot)) {
      const m = LOOT_TOKEN.exec(tok);
      const k = m?.[1] as string;
      if (m && 'awvbngcp'.includes(k) && !letters.includes(k)) letters.push(k);
    }
  const out: Section[] = [];
  let n = 0;
  let zone = '';
  def.sections.forEach((s, i) => {
    // the stretch after a stop takes back the name the HUD showed before it
    const prev = def.sections[i - 1];
    out.push(prev?.arena && !s.zone && !s.arena && zone ? { ...s, zone } : s);
    if (s.zone) zone = s.zone;
    const next = def.sections[i + 1];
    if (!s.arena || !next) return;
    // with a wall of fire still ahead the stop offers rain, so nobody trades their rain away just before it
    const fireAhead = def.sections.slice(i + 1).some((q) => q.fire?.length);
    const astra = fireAhead ? ' w16*' : letters.length ? ` ${letters[n++ % letters.length]}16*` : '';
    out.push({
      zone: 'Ashram',
      art: s.art,
      land: 'flat',
      len: REST_LEN,
      cp: true,
      rest: true,
      loot: `+8${astra}`,
    });
  });
  return { ...def, sections: out };
}
