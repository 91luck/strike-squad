import { GAME_CONFIG, type BossKind, type PickupKind, type TrooperKind } from './config';

/**
 * Level data: a side-scrolling strip of 32 px tiles, exactly one screen tall, so cameras only scroll sideways
 * (like the classic run-and-gun games), which keeps phone screens readable.
 *
 * Memory: a level is one byte per tile (`Uint8Array`, ~7 KB for a 400-column mission) plus short lists of
 * spawns. Levels are immutable once built, so the server shares one copy between every room playing it, and
 * missions are only built when somebody plays them (see `missions.ts`).
 *
 * Levels are built in code from named pieces (ground, platforms, arenas…) rather than typed as ASCII art, so every
 * coordinate is explicit. `Builder` has the primitives; `course.ts` lays reusable sections out one after another.
 * `toAscii()` renders a level for debugging/tests.
 */

export const Tile = {
  Empty: 0,
  Solid: 1,
  /** One-way platform: you can jump up through it and stand on it; hold Down + Jump to drop through. */
  OneWay: 2,
  /** Lock gate: solid until its arena is cleared (all waves down, or its boss destroyed), then open for good. */
  Gate: 3,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

/**
 * Art style of a stretch of level (sky, ground texture, props, weather). Purely cosmetic: the client maps each to
 * its palette, so adding a style never touches the simulation.
 */
export type ArtStyle =
  'jungle' | 'river' | 'towers' | 'fortress' | 'desert' | 'snow' | 'night' | 'inferno' | 'space';

/** Who the enemies are (cosmetic): soldiers, demons, or void creatures from deep space. */
export type Faction = 'army' | 'demon' | 'void';

export interface EnemySpawn {
  id: number;
  kind: TrooperKind;
  x: number;
  /** Feet position (world px). */
  y: number;
}

export interface PickupSpawn {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  /** An altar: comes back a few seconds after it is taken (so a fire wall can never lock the squad out). */
  respawn: boolean;
}

/**
 * A region with its own physics. Players' movement uses the same rules on the server and in client prediction.
 *  - lowg:   low gravity (×power): floaty, long jumps.
 *  - lift:   anti-gravity beam: carries you up to its top and holds you there.
 *  - well:   gravity well (a black hole): pulls soldiers sideways and all shots toward its centre (power px/s).
 *  - magnet: magnetic storm: shots curve (power rad/s); drawn as an aurora.
 */
export type FieldKind = 'lowg' | 'lift' | 'well' | 'magnet';
export interface FieldDef {
  kind: FieldKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  power: number;
}

export interface GateDef {
  id: number;
  col: number;
  /** Rows covered by the gate (inclusive). */
  rowTop: number;
  rowBottom: number;
  /** A wall of fire: not opened by clearing an arena but by the rain astra (varuna). */
  fire: boolean;
}

export interface CheckpointDef {
  id: number;
  x: number;
  /** Surface y at the flag. */
  y: number;
}

/** Where a wave enemy enters: the left or right edge of the arena, or dropping from the sky. */
export interface WaveSpawn {
  kind: TrooperKind;
  side: 'L' | 'R' | 'sky';
}

/**
 * A lock-down arena (the classic "screen locks, survive the ambush" moment). It starts when the first soldier
 * passes `trigger`: waves of enemies come in, or its boss(es) wake up. Clearing it opens its gate.
 *
 * Boss arenas may have waves too: they are escorts. Wave 1 arrives with the boss; each later wave arrives a few
 * seconds after the previous one is down, for as long as a boss still stands.
 */
export interface ArenaDef {
  id: number;
  name: string;
  trigger: number;
  /** Arena floor span (world px) used to place wave spawns and keep bosses inside. */
  left: number;
  right: number;
  /** Floor surface y. */
  floor: number;
  /** Gate opened on clear (-1: none, the final arena: clearing it wins the mission). */
  gate: number;
  waves: WaveSpawn[][];
  /** The (first) boss of the arena, or null for an ambush. */
  boss: BossKind | null;
}

export interface BossSpawn {
  kind: BossKind;
  /** Feet x, y (the gunship: centre x, hover height). */
  x: number;
  y: number;
  arena: number;
  /** Health multiplier (twin-boss fights use less than 1 so two bosses aren't twice the slog). */
  hpMul: number;
}

/** How much tougher than the base rules a mission is. 1 = the numbers in `GAME_CONFIG`. */
export interface MissionMods {
  /** Trooper health. */
  enemyHp: number;
  /** Enemy fire rate. */
  enemyFire: number;
  /** Damage soldiers take. */
  enemyDamage: number;
  /** Boss health. */
  bossHp: number;
  /** Boss pace: shorter rests between attacks (wind-up tells keep their length, so they stay fair). */
  bossTempo: number;
}

export const BASE_MODS: MissionMods = { enemyHp: 1, enemyFire: 1, enemyDamage: 1, bossHp: 1, bossTempo: 1 };

export interface LevelDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  tiles: Uint8Array;
  start: { x: number; y: number };
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
  gates: GateDef[];
  arenas: ArenaDef[];
  bosses: BossSpawn[];
  checkpoints: CheckpointDef[];
  /** Areas the HUD names (e.g. "Jungle", "Bridge"). Purely cosmetic. */
  zones: { x: number; name: string }[];
  /** Art style from each x onwards (sorted). Purely cosmetic. */
  art: { x: number; style: ArtStyle }[];
  mods: MissionMods;
  fields: FieldDef[];
  faction: Faction;
  /** The squad charges a shared brahmastra in this mission. */
  brahma: boolean;
}

const T = GAME_CONFIG.tile;

/** Snapshots pack open gates and taken pickups into 32-bit masks, which caps both lists. */
export const MAX_GATES = 31;
export const MAX_PICKUPS = 31;

export class Builder {
  readonly tiles: Uint8Array;
  enemies: EnemySpawn[] = [];
  pickups: PickupSpawn[] = [];
  gates: GateDef[] = [];
  arenas: ArenaDef[] = [];
  bosses: BossSpawn[] = [];
  checkpoints: CheckpointDef[] = [];
  zones: { x: number; name: string }[] = [];
  art: { x: number; style: ArtStyle }[] = [];
  fields: FieldDef[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.tiles = new Uint8Array(cols * rows);
  }

  set(c: number, r: number, t: Tile): void {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.tiles[r * this.cols + c] = t;
  }

  get(c: number, r: number): Tile {
    return c >= 0 && c < this.cols && r >= 0 && r < this.rows ? (this.tiles[r * this.cols + c] as Tile) : 0;
  }

  /** Solid ground from column c0 to c1 (inclusive) with its surface at `top`, filled to the bottom. */
  ground(c0: number, c1: number, top: number): this {
    for (let c = c0; c <= c1; c++) for (let r = top; r < this.rows; r++) this.set(c, r, Tile.Solid);
    return this;
  }

  block(c0: number, c1: number, r0: number, r1: number): this {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) this.set(c, r, Tile.Solid);
    return this;
  }

  platform(c0: number, c1: number, row: number): this {
    for (let c = c0; c <= c1; c++) this.set(c, row, Tile.OneWay);
    return this;
  }

  /** First row (from the top) you can stand on in column c: solid ground, or also platforms when `any`. */
  surface(c: number, any = false): number {
    for (let r = 1; r < this.rows; r++) {
      const t = this.get(c, r);
      if ((t === Tile.Solid || (any && t === Tile.OneWay)) && this.get(c, r - 1) === Tile.Empty) return r;
    }
    return any ? this.rows : this.surface(c, true);
  }

  /** Enemy standing on the surface at row `surface` (flyers hover 4 rows above it). */
  enemy(kind: TrooperKind, col: number, surface: number): this {
    const flying = kind === 'drone' || kind === 'jetpack';
    const y = flying ? (surface - 4) * T : surface * T;
    this.enemies.push({ id: this.enemies.length, kind, x: col * T + T / 2, y });
    return this;
  }

  pickup(kind: PickupKind, col: number, surface: number, respawn = false): this {
    this.pickups.push({ id: this.pickups.length, kind, x: col * T + T / 2, y: surface * T - 22, respawn });
    return this;
  }

  /** A physics field over columns c0..c1 and rows r0..r1 (inclusive). */
  field(kind: FieldKind, c0: number, c1: number, r0: number, r1: number, power: number): this {
    this.fields.push({ kind, x0: c0 * T, x1: (c1 + 1) * T, y0: r0 * T, y1: (r1 + 1) * T, power });
    return this;
  }

  checkpoint(col: number, surface: number): this {
    this.checkpoints.push({ id: this.checkpoints.length, x: col * T + T / 2, y: surface * T });
    return this;
  }

  /** A gate column from the top of the screen down to `bottom`. Returns its id. */
  gate(col: number, bottom: number, fire = false): number {
    const id = this.gates.length;
    this.gates.push({ id, col, rowTop: 0, rowBottom: bottom, fire });
    for (let r = 0; r <= bottom; r++) this.set(col, r, Tile.Gate);
    return id;
  }

  arena(
    name: string,
    a: { trigger: number; left: number; right: number; floor: number; gate: number },
    waves: WaveSpawn[][],
    boss: BossKind | null = null,
  ): number {
    const id = this.arenas.length;
    this.arenas.push({
      id,
      name,
      trigger: a.trigger * T,
      left: a.left * T,
      right: a.right * T,
      floor: a.floor * T,
      gate: a.gate,
      waves,
      boss,
    });
    return id;
  }

  boss(kind: BossKind, col: number, y: number, arena: number, hpMul = 1): this {
    this.bosses.push({ kind, x: col * T + T / 2, y, arena, hpMul });
    return this;
  }

  zone(col: number, name: string): this {
    this.zones.push({ x: col * T, name });
    return this;
  }

  /** Art style from column `col` onwards (consecutive repeats are merged). */
  style(col: number, style: ArtStyle): this {
    if (this.art[this.art.length - 1]?.style !== style) this.art.push({ x: col * T, style });
    return this;
  }

  build(meta: {
    id: string;
    name: string;
    start: { x: number; y: number };
    mods?: MissionMods;
    faction?: Faction;
    brahma?: boolean;
  }): LevelDef {
    if (this.gates.length > MAX_GATES) throw new Error(`${meta.id}: more than ${MAX_GATES} gates`);
    if (this.pickups.length > MAX_PICKUPS) throw new Error(`${meta.id}: more than ${MAX_PICKUPS} pickups`);
    if (!this.arenas.some((a) => a.gate === -1)) throw new Error(`${meta.id}: no final arena`);
    return {
      id: meta.id,
      name: meta.name,
      cols: this.cols,
      rows: this.rows,
      tiles: this.tiles,
      start: meta.start,
      enemies: this.enemies,
      pickups: this.pickups,
      gates: this.gates,
      arenas: this.arenas,
      bosses: this.bosses,
      checkpoints: this.checkpoints,
      zones: this.zones,
      art: this.art.length ? this.art : [{ x: 0, style: 'jungle' }],
      mods: meta.mods ?? BASE_MODS,
      fields: this.fields,
      faction: meta.faction ?? 'army',
      brahma: meta.brahma ?? false,
    };
  }
}

/** The final arena (clearing it wins the mission). */
export function finalArena(level: LevelDef): ArenaDef {
  return level.arenas.find((a) => a.gate === -1) as ArenaDef;
}

// ---------------------------------------------------------------- queries shared by the sim and the client

export function tileAt(level: LevelDef, c: number, r: number): Tile {
  if (c < 0 || c >= level.cols) return Tile.Solid; // level edges are walls
  if (r < 0) return Tile.Empty;
  if (r >= level.rows) return Tile.Empty; // below the map: a pit
  return level.tiles[r * level.cols + c] as Tile;
}

/** Which gate a gate tile belongs to. A handful of gates per level, so a scan beats a per-tile lookup table. */
export function gateIdAt(level: LevelDef, c: number, r: number): number {
  for (const g of level.gates) if (g.col === c && r >= g.rowTop && r <= g.rowBottom) return g.id;
  return -1;
}

/** The field covering a point, if any (fields don't overlap; the first match wins). */
export function fieldAt(level: LevelDef, x: number, y: number): FieldDef | null {
  for (const f of level.fields) if (x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1) return f;
  return null;
}

/** Art style at world x. */
export function artAt(level: LevelDef, x: number): ArtStyle {
  let style = level.art[0]?.style ?? 'jungle';
  for (const a of level.art) {
    if (a.x > x) break;
    style = a.style;
  }
  return style;
}

/** Debug/test view: '#' solid, '=' platform, '|' gate, '.' empty. */
export function toAscii(level: LevelDef): string[] {
  const out: string[] = [];
  for (let r = 0; r < level.rows; r++) {
    let line = '';
    for (let c = 0; c < level.cols; c++) {
      const t = tileAt(level, c, r);
      line += t === Tile.Solid ? '#' : t === Tile.OneWay ? '=' : t === Tile.Gate ? '|' : '.';
    }
    out.push(line);
  }
  return out;
}

export const levelWidth = (l: LevelDef): number => l.cols * T;
export const levelHeight = (l: LevelDef): number => l.rows * T;
