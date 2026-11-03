import { GAME_CONFIG, type BossKind, type PickupKind, type TrooperKind } from './config';
import {
  Builder,
  type ArtStyle,
  type Faction,
  type FieldKind,
  type LevelDef,
  type MissionMods,
  type WaveSpawn,
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
 *                              `^` stands it on the highest surface (a ledge or platform) instead of the ground.
 * Loot   `<kind><col>[^][*]`   s spread · m machine gun · l laser · + med-kit;
 *                              powers: a agni (fire) · w varuna (rain) · v vayu (wind) · b black hole.
 *                              `*` makes it an altar that comes back after it is taken.
 * Waves  `<count><kind><side>` side L / R (arena edges) or ^ (dropping from the sky), e.g. '3SR 2SL J^'.
 *
 * Mistakes (an enemy over a pit, a bad token) throw when the mission is built, and the tests build every mission.
 */

export type Land = 'flat' | 'pits' | 'bridge' | 'steps' | 'towers' | 'catwalks';

export interface ArenaSpec {
  name: string;
  /** Ambush waves; for a boss arena, escort waves (see `ArenaDef`). */
  waves?: string[];
  bosses?: BossKind[];
  /** Health multiplier for each boss (twin fights use less than 1). */
  hp?: number;
  /** The last arena: no gate, a wall behind it, and clearing it wins the mission. */
  final?: boolean;
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
};
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

const LAND: Record<Land, Template> = { flat, pits, bridge, steps, towers, catwalks };

// ---------------------------------------------------------------- arenas

/**
 * An arena room: open floor and three platforms, the gate near the right end (or, for the final arena, a wall).
 * Bosses stand at the far end: a walker 4 tiles from the edge (the second of a pair 9 tiles further in), the gunship
 * hovering 7 tiles in, the fortress against the back wall.
 */
function arenaRoom(b: Builder, x: number, s: Section, a: ArenaSpec): void {
  const n = s.len;
  b.ground(x, x + n - 1, G);
  b.platform(x + Math.round(n * 0.28), x + Math.round(n * 0.28) + 4, 11);
  b.platform(x + Math.round(n * 0.47), x + Math.round(n * 0.47) + 3, 8);
  b.platform(x + Math.round(n * 0.62), x + Math.round(n * 0.62) + 3, 11);
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
  );
  let walkers = 0;
  for (const kind of bosses) {
    if (kind === 'boss') b.boss('boss', x + n - 8, G * T, id, a.hp);
    else if (kind === 'gunship') b.boss('gunship', right - 7, GAME_CONFIG.enemies.gunship.hoverY, id, a.hp);
    else b.boss('walker', right - 4 - 9 * walkers++, G * T, id, a.hp);
  }
}

// ---------------------------------------------------------------- the course builder

export function buildCourse(def: CourseDef): LevelDef {
  const cols = def.sections.reduce((n, s) => n + s.len, 0);
  const b = new Builder(cols, ROWS);
  let x = 0;
  for (const s of def.sections) {
    const where = `${def.id} @${x} ${s.zone ?? s.arena?.name ?? s.land}`;
    if (s.zone) b.zone(x, s.zone);
    b.style(x, s.art);
    if (s.arena) arenaRoom(b, x, s, s.arena);
    else LAND[s.land ?? 'flat'](b, x, s);
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
      const m = /^([SHGJTD])(\d+)(\^?)$/.exec(tok);
      if (!m) throw new Error(`${where}: bad foe "${tok}"`);
      const col = x + Number(m[2]);
      const row = b.surface(col, m[3] === '^');
      if (Number(m[2]) >= s.len || row >= ROWS)
        throw new Error(`${where}: foe "${tok}" has nothing to stand on`);
      b.enemy(FOE[m[1] as string] as TrooperKind, col, row);
    }
    for (const tok of tokens(s.loot)) {
      const m = /^([sml+awvb])(\d+)(\^?)(\*?)$/.exec(tok);
      if (!m) throw new Error(`${where}: bad loot "${tok}"`);
      const col = x + Number(m[2]);
      const row = b.surface(col, m[3] === '^');
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
  });
}
