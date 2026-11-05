import { GAME_CONFIG, type BossKind, type PickupKind, type TrooperKind } from './config';
import {
  Builder,
  type ArtStyle,
  type BossRule,
  type Faction,
  type FieldKind,
  type LevelDef,
  type MissionMods,
  type WaveSpawn,
  Tile,
} from './level';

/**
 * Missions as data: a mission is a list of `Section`s laid out left to right. Each section names a reusable
 * terrain template and lists its enemies and pickups in a tiny text format, with columns *relative to the section*,
 * so sections can be reordered, resized or copied between missions without recomputing a single coordinate.
 *
 *   { zone: 'Dune Sea', art: 'desert', land: 'pits', len: 38, holes: [9, 22],
 *     foes: 'S6 T16^ G20 D24', loot: '+34' }
 *
 * Foes   `<kind><col>[^]`      S soldier · H shield · G grenadier · J jetpack · T turret · D drone.
 *                              `^` stands it on the highest surface (a ledge or platform) instead of the ground;
 *                              `_` on the lowest (the floor of a passage under a wall, a trench bottom).
 * Loot   `<kind><col>[^][*]`   s spread · m machine gun · l laser · + med-kit;
 *                              powers: a agni (fire) · w varuna (rain) · v vayu (wind) · b black hole ·
 *                              n naga · g garuda · c sudarshana chakra · p pashupata · x vaishnava.
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
  | 'pillars';

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
export type Room = 'classic' | 'tiers' | 'twin' | 'open' | 'high';

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
  /** Astra altars inside the arena (respawning pickups), e.g. 'x10' for a vaishnava altar 10 tiles in. */
  altars?: string;
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
  /** Walls of fire at these columns: only the rain astra (varuna) puts them out. */
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
  arena?: ArenaSpec;
}

export interface CourseDef {
  id: string;
  name: string;
  mods: MissionMods;
  sections: Section[];
  faction?: Faction;
  brahma?: boolean;
  /** Enemy/boss hue shift in degrees (cosmetic). */
  tint?: number;
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
};
const LOOT: Record<string, PickupKind> = {
  s: 'spread',
  m: 'rapid',
  l: 'laser',
  '+': 'medkit',
  a: 'agni',
  w: 'varuna',
  v: 'vayu',
  b: 'singularity',
  n: 'naga',
  g: 'garuda',
  c: 'sudarshana',
  p: 'pashupata',
  x: 'vaishnava',
};
const LOOT_TOKEN = /^([sml+awvbngcpx])(\d+)([\^_]?)(\*?)$/;
const SIDE: Record<string, WaveSpawn['side']> = { L: 'L', R: 'R', '^': 'sky' };

const tokens = (s: string | undefined): string[] => (s ? s.trim().split(/\s+/) : []);

/** Parse one wave, e.g. '3SR 2SL J^'. Exported for tests. */
export function parseWave(s: string): WaveSpawn[] {
  const out: WaveSpawn[] = [];
  for (const tok of tokens(s)) {
    const m = /^(\d*)([SHGJTD])([LR^])$/.exec(tok);
    if (!m) throw new Error(`bad wave token "${tok}"`);
    const kind = FOE[m[2] as string] as TrooperKind;
    const side = SIDE[m[3] as string] as WaveSpawn['side'];
    for (let i = 0; i < Number(m[1] || 1); i++) out.push({ kind, side });
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
  b.block(x, x + n - 1, 0, 6);
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
  );
  let walkers = 0;
  for (const kind of bosses) {
    if (kind === 'boss') b.boss('boss', x + n - 8, G * T, id, a.hp);
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
  const b = new Builder(cols, ROWS);
  let x = 0;
  for (const s of def.sections) {
    const where = `${def.id} @${x} ${s.zone ?? s.arena?.name ?? s.land}`;
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
    for (const c of s.lifts ?? []) {
      // The beam ends at row 3; a walkway at row 5 leads off to the right of it.
      b.field('lift', x + c, x + c + 2, 4, ROWS - 1, 0.55);
      b.platform(x + c + 3, x + c + 9, 5);
    }
    for (const c of s.wells ?? []) b.field('well', x + c - 5, x + c + 4, 6, ROWS - 1, 90);
    if (s.cp) b.checkpoint(x + 2, b.surface(x + 2));
    for (const tok of tokens(s.foes)) {
      const m = /^([SHGJTD])(\d+)([\^_]?)$/.exec(tok);
      if (!m) throw new Error(`${where}: bad foe "${tok}"`);
      const col = x + Number(m[2]);
      const row = standOn(b, col, m[3] as string);
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
      b.pickup(LOOT[m[1] as string] as PickupKind, col, row, m[4] === '*');
    }
    x += s.len;
  }
  return b.build({
    id: def.id,
    name: def.name,
    start: { x: 3 * T, y: b.surface(3) * T },
    mods: def.mods,
    faction: def.faction,
    brahma: def.brahma,
    tint: def.tint,
  });
}
