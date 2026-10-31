import { GAME_CONFIG, type BossKind, type PickupKind, type TrooperKind } from './config';

/**
 * The mission map: a side-scrolling strip of 32 px tiles. The level is exactly one screen tall, so cameras only
 * scroll sideways (like the classic run-and-gun games), which keeps phone screens readable.
 *
 * The level is *built in code* from named pieces (ground, platforms, pits, arenas…) rather than typed as ASCII art,
 * so every coordinate is explicit and a typo cannot shift a whole row. `toAscii()` renders it for debugging/tests.
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
}

export interface GateDef {
  id: number;
  col: number;
  /** Rows covered by the gate (inclusive). */
  rowTop: number;
  rowBottom: number;
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
 * passes `trigger`: waves of enemies come in, or its boss wakes up. Clearing it opens its gate.
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
  /** Gate opened on clear (-1: none, the final arena). */
  gate: number;
  waves: WaveSpawn[][];
  boss: BossKind | null;
}

export interface BossSpawn {
  kind: BossKind;
  /** Feet x, y (the gunship: centre x, hover height). */
  x: number;
  y: number;
  arena: number;
}

export interface LevelDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  tiles: Uint8Array;
  /** Gate id per tile (only meaningful where tile === Gate). */
  gateOf: Int16Array;
  start: { x: number; y: number };
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
  gates: GateDef[];
  arenas: ArenaDef[];
  bosses: BossSpawn[];
  checkpoints: CheckpointDef[];
  /** Areas the renderer labels (e.g. "Jungle", "Bridge"). Purely cosmetic. */
  zones: { x: number; name: string }[];
}

const T = GAME_CONFIG.tile;

class Builder {
  readonly tiles: Uint8Array;
  readonly gateOf: Int16Array;
  enemies: EnemySpawn[] = [];
  pickups: PickupSpawn[] = [];
  gates: GateDef[] = [];
  arenas: ArenaDef[] = [];
  bosses: BossSpawn[] = [];
  checkpoints: CheckpointDef[] = [];
  zones: { x: number; name: string }[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.tiles = new Uint8Array(cols * rows);
    this.gateOf = new Int16Array(cols * rows).fill(-1);
  }

  set(c: number, r: number, t: Tile): void {
    if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.tiles[r * this.cols + c] = t;
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

  /** Enemy standing on the surface at row `surface` (the first solid/platform row under it). */
  enemy(kind: TrooperKind, col: number, surface: number): this {
    const flying = kind === 'drone' || kind === 'jetpack';
    const y = flying ? (surface - 4) * T : surface * T;
    this.enemies.push({ id: this.enemies.length, kind, x: col * T + T / 2, y });
    return this;
  }

  pickup(kind: PickupKind, col: number, surface: number): this {
    this.pickups.push({ id: this.pickups.length, kind, x: col * T + T / 2, y: surface * T - 22 });
    return this;
  }

  checkpoint(col: number, surface: number): this {
    this.checkpoints.push({ id: this.checkpoints.length, x: col * T + T / 2, y: surface * T });
    return this;
  }

  /** A gate column from the top of the screen down to `bottom`. Returns its id. */
  gate(col: number, bottom: number): number {
    const id = this.gates.length;
    this.gates.push({ id, col, rowTop: 0, rowBottom: bottom });
    for (let r = 0; r <= bottom; r++) {
      this.set(col, r, Tile.Gate);
      this.gateOf[r * this.cols + col] = id;
    }
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

  boss(kind: BossKind, col: number, y: number, arena: number): this {
    this.bosses.push({ kind, x: col * T + T / 2, y, arena });
    return this;
  }

  zone(col: number, name: string): this {
    this.zones.push({ x: col * T, name });
    return this;
  }
}

/** Ground surface row for most of the mission (rows below are solid). */
const G = 14;

const w = (kind: TrooperKind, side: WaveSpawn['side'], n = 1): WaveSpawn[] =>
  Array.from({ length: n }, () => ({ kind, side }));

/** Mission 1, "Operation Lifeline": jungle, ambush, river, WARHOUND, towers, VULTURE, the Iron Fortress. */
export function buildMission1(): LevelDef {
  const b = new Builder(276, 18);

  // ---- 1. Landing zone: learn to run, jump, double jump and shoot.
  b.zone(0, 'Landing Zone');
  b.ground(0, 30, G);
  b.platform(10, 13, 11);
  b.platform(17, 21, 8);
  b.pickup('spread', 19, 8);
  b.enemy('soldier', 16, G).enemy('soldier', 25, G).enemy('soldier', 28, G);

  // ---- 2. Jungle: pits and platforms, a turret on a ledge, the first shield trooper.
  b.zone(31, 'Jungle');
  b.ground(34, 44, G); // pit at 31-33
  b.platform(30, 35, 11);
  b.block(40, 44, 12, 13); // raised ledge
  b.enemy('turret', 42, 12);
  b.ground(48, 66, G); // pit at 45-47
  b.platform(45, 48, 10);
  b.platform(52, 56, 11);
  b.platform(58, 62, 8);
  b.pickup('medkit', 60, 8);
  b.enemy('soldier', 50, G).enemy('shield', 55, G).enemy('soldier', 64, G);
  b.enemy('drone', 59, G).enemy('grenadier', 63, G);
  b.checkpoint(66, G);

  // ---- 3. Ambush: the way locks behind a gate; survive three waves coming from both sides and the sky.
  b.zone(67, 'Ambush');
  b.ground(67, 92, G);
  b.platform(74, 78, 11);
  b.platform(82, 85, 10);
  const g1 = b.gate(90, G - 1);
  b.arena('AMBUSH', { trigger: 73, left: 67, right: 89, floor: G, gate: g1 }, [
    [...w('soldier', 'R', 3), ...w('soldier', 'L', 1)],
    [...w('shield', 'R', 1), ...w('grenadier', 'R', 1), ...w('jetpack', 'sky', 2)],
    [...w('soldier', 'L', 2), ...w('shield', 'R', 1), ...w('jetpack', 'sky', 1), ...w('grenadier', 'L', 1)],
  ]);

  // ---- 4. River bridge: drones and jetpacks from the sky, a gap to jump.
  b.zone(93, 'River Bridge');
  b.ground(91, 99, G);
  b.platform(100, 125, 12); // the bridge (one-way, river below)
  b.block(100, 100, 13, 17);
  b.block(113, 113, 13, 17);
  b.block(125, 125, 13, 17);
  b.enemy('drone', 104, 12).enemy('jetpack', 112, 12).enemy('drone', 120, 12);
  b.enemy('soldier', 108, 12).enemy('shield', 118, 12);
  b.pickup('rapid', 113, 12);

  // ---- 5. WARHOUND: boss 1, a walking assault tank, in a walled yard.
  b.zone(126, 'Tank Yard');
  b.ground(126, 160, G);
  b.checkpoint(128, G);
  b.platform(137, 140, 10);
  b.pickup('medkit', 130, G);
  const g2 = b.gate(158, G - 1);
  const a2 = b.arena('WARHOUND', { trigger: 134, left: 126, right: 157, floor: G, gate: g2 }, [], 'walker');
  b.boss('walker', 153, G * T, a2);

  // ---- 6. Watchtowers: climbing, turrets above.
  b.zone(161, 'Watchtowers');
  b.ground(159, 192, G);
  b.block(166, 168, 11, 13);
  b.platform(170, 174, 9);
  b.block(176, 178, 9, 13);
  b.enemy('turret', 177, 9);
  b.platform(180, 185, 7);
  b.pickup('laser', 182, 7);
  b.enemy('soldier', 172, G).enemy('grenadier', 183, G).enemy('drone', 188, G).enemy('shield', 189, G);
  b.enemy('jetpack', 164, G);
  b.pickup('medkit', 191, G);

  // ---- 7. VULTURE: boss 2, an attack gunship over the fortress wall.
  b.zone(193, 'Fortress Wall');
  b.ground(193, 224, G);
  b.checkpoint(194, G);
  b.platform(201, 204, 11);
  b.platform(207, 211, 8);
  b.platform(214, 217, 11);
  const g3 = b.gate(222, G - 1);
  const a3 = b.arena('VULTURE', { trigger: 199, left: 193, right: 221, floor: G, gate: g3 }, [], 'gunship');
  b.boss('gunship', 214, GAME_CONFIG.enemies.gunship.hoverY, a3);

  // ---- 8. The Iron Fortress: the final boss.
  b.zone(225, 'Iron Fortress');
  b.ground(223, 275, G);
  b.checkpoint(226, G);
  b.platform(238, 242, 11);
  b.platform(247, 251, 8);
  b.platform(254, 258, 11);
  b.pickup('medkit', 249, 8);
  b.pickup('spread', 240, 11);
  b.block(274, 275, 0, G - 1); // back wall behind the boss
  const a4 = b.arena(
    'IRON FORTRESS',
    { trigger: 233, left: 223, right: 263, floor: G, gate: -1 },
    [],
    'boss',
  );
  b.boss('boss', 268, G * T, a4);

  return {
    id: 'mission-1',
    name: 'Operation Lifeline',
    cols: b.cols,
    rows: b.rows,
    tiles: b.tiles,
    gateOf: b.gateOf,
    start: { x: 3 * T, y: G * T },
    enemies: b.enemies,
    pickups: b.pickups,
    gates: b.gates,
    arenas: b.arenas,
    bosses: b.bosses,
    checkpoints: b.checkpoints,
    zones: b.zones,
  };
}

/** The final boss (the mission is won when it falls). */
export function finalBoss(level: LevelDef): BossSpawn {
  return level.bosses.find((x) => x.kind === 'boss') as BossSpawn;
}

export const MISSION_1 = buildMission1();

// ---------------------------------------------------------------- queries shared by the sim and the client

export function tileAt(level: LevelDef, c: number, r: number): Tile {
  if (c < 0 || c >= level.cols) return Tile.Solid; // level edges are walls
  if (r < 0) return Tile.Empty;
  if (r >= level.rows) return Tile.Empty; // below the map: a pit
  return level.tiles[r * level.cols + c] as Tile;
}

export function gateIdAt(level: LevelDef, c: number, r: number): number {
  if (c < 0 || c >= level.cols || r < 0 || r >= level.rows) return -1;
  return level.gateOf[r * level.cols + c] ?? -1;
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
