import { describe, expect, it } from 'vitest';
import {
  ATTACK,
  Autopilot,
  BOSS_STYLES,
  BOSS_STYLE_IDS,
  Builder,
  GAME_CONFIG,
  SAGA_COURSES,
  SAGA_IDS,
  Sim,
  getMission,
  isBoss,
  parseWave,
  styleOf,
  type AttackId,
  type Enemy,
  type LevelDef,
  type Player,
  type SimEvent,
} from '../src';

const T = GAME_CONFIG.tile;
const G = 14;
const M = GAME_CONFIG.bossMoves;
const SAGA_MOVES: AttackId[] = [
  ATTACK.rain,
  ATTACK.ring,
  ATTACK.spiral,
  ATTACK.leap,
  ATTACK.blink,
  ATTACK.summon,
];

function events(sim: Sim, ticks: number, each?: () => void): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    each?.();
    sim.step();
    out.push(...sim.drainEvents());
  }
  return out;
}

/** A flat level with one ambush arena (waves as written) from column 40 and a final arena far away. */
function ambush(waves: string[]): LevelDef {
  const b = new Builder(140, 18);
  b.ground(0, 139, G);
  const g = b.gate(78, G - 1);
  b.arena('TEST AMBUSH', { trigger: 44, left: 40, right: 77, floor: G, gate: g }, waves.map(parseWave));
  b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
  return b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T } });
}

function solo(L: LevelDef, seed = 7): { sim: Sim; p: Player } {
  const sim = new Sim({ seed, level: L });
  const p = sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
  while (sim.phase === 'countdown') sim.step();
  return { sim, p };
}

describe('saga boss styles', () => {
  const bossArenas = SAGA_IDS.flatMap((id) => {
    const L = getMission(id);
    return L.arenas.filter((a) => a.boss).map((a) => ({ stage: id, a, L }));
  });

  it('every saga boss has a style written for its body, and every style is used', () => {
    const used = new Set<string>();
    for (const { stage, a, L } of bossArenas) {
      const style = styleOf(a.name);
      expect(style, `${stage} ${a.name}`).not.toBeNull();
      for (const b of L.bosses.filter((x) => x.arena === a.id)) expect(style!.body, a.name).toBe(b.kind);
      used.add(style!.id);
    }
    expect([...used].sort()).toEqual([...BOSS_STYLE_IDS].sort());
  });

  it('styles are fair: walkers alone leap, fortresses never vanish, no wide move twice in a row', () => {
    const wide: AttackId[] = [ATTACK.rain, ATTACK.ring, ATTACK.spiral];
    for (const s of Object.values(BOSS_STYLES)) {
      expect(s.cycles.length, s.id).toBeGreaterThanOrEqual(s.body === 'boss' ? 3 : 2);
      for (const c of s.cycles) {
        expect(c.length, s.id).toBeGreaterThanOrEqual(3);
        if (s.body !== 'walker') expect(c, s.id).not.toContain(ATTACK.leap);
        if (s.body === 'boss') expect(c, s.id).not.toContain(ATTACK.blink);
        // The cycle wraps round, so the last move is followed by the first.
        for (let i = 0; i < c.length; i++) {
          const a = c[i] as AttackId;
          const b = c[(i + 1) % c.length] as AttackId;
          expect(wide.includes(a) && a === b, `${s.id}: ${a} twice in a row`).toBe(false);
        }
      }
    }
  });

  it('no two bosses fight alike: each has its own attack order, and uses at least one saga move', () => {
    const keys = Object.values(BOSS_STYLES).map((s) => JSON.stringify(s.cycles));
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of Object.values(BOSS_STYLES))
      expect(
        s.cycles.flat().some((a) => SAGA_MOVES.includes(a)),
        s.id,
      ).toBe(true);
  });

  // Each saga boss, fought by a computer squad from its arena's door: every move of its first phase shows up,
  // and the moves do what they say (rain falls as meteors, rings and spirals fill the air, leaps land, blinks
  // move the boss, summons come through portals).
  it.each(bossArenas.map(({ stage, a }) => [stage, a.name]))('%s %s: uses its own moves', (stage, name) => {
    const sim = new Sim({
      seed: 5,
      settings: { difficulty: 'normal', mission: stage as (typeof SAGA_IDS)[number] },
    });
    const bots = new Autopilot(1);
    for (let i = 0; i < 2; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
    while (sim.phase === 'countdown') sim.step();
    const a = sim.level.arenas.find((x) => x.name === name)!;
    const style = styleOf(name)!;
    for (const p of sim.players.values()) {
      p.x = a.trigger + 20;
      p.y = a.floor;
    }
    const seen = new Set<number>();
    let meteors = 0;
    let rings = 0;
    let portals = 0;
    let blinks = 0;
    let bossX: number[] = [];
    const evs = events(sim, sim.ticks(40), () => {
      for (const p of sim.players.values()) {
        if (p.state !== 'alive') continue;
        p.hp = 100; // keep the squad standing: this test watches the boss
        sim.setInput(p.id, { ...bots.decide(sim, p), fire: false, ult: false, astra: false, melee: false });
      }
      for (const e of sim.enemies.values())
        if (isBoss(e.kind) && e.awake && e.arena === a.id) {
          if (e.atk) seen.add(e.atk);
          bossX.push(e.body.x);
        }
      meteors = Math.max(meteors, sim.bullets.filter((b) => b.enemy && b.kind === 'meteor').length);
      rings = Math.max(rings, sim.bullets.filter((b) => b.enemy && b.kind === 'shot').length);
    });
    for (const e of evs) {
      if (e.e === 'portal') portals++;
      if (e.e === 'blink') blinks++;
    }
    for (const atk of style.cycles[0]!) expect(seen.has(atk), `${name}: attack ${atk} never used`).toBe(true);
    const first = style.cycles[0]!;
    if (first.includes(ATTACK.rain)) expect(meteors).toBeGreaterThanOrEqual(M.rain.count);
    if (first.includes(ATTACK.ring)) expect(rings).toBeGreaterThanOrEqual(M.ring.count);
    if (first.includes(ATTACK.blink)) expect(blinks).toBeGreaterThanOrEqual(2);
    if (first.includes(ATTACK.summon)) expect(portals).toBeGreaterThanOrEqual(1);
    bossX = bossX.filter(Number.isFinite);
    expect(bossX.length).toBeGreaterThan(0);
  });
});

describe('wave entrances and elites', () => {
  it('portal and ground entrances are announced, arrive a moment later, and the ambush waits for them', () => {
    const { sim, p } = solo(ambush(['2SP SU', 'SL']));
    p.x = 46 * T;
    const first = events(sim, 2);
    const portals = first.filter((e) => e.e === 'portal') as Extract<SimEvent, { e: 'portal' }>[];
    expect(portals.map((e) => e.how).sort()).toEqual([0, 0, 1]);
    expect([...sim.enemies.values()].filter((e) => e.arena === 0)).toHaveLength(0);
    // Nobody to fight yet, but the arena is not clear: the next wave must not start early.
    events(sim, sim.ticks(M.portalSec) - 4);
    expect(sim.arenaWave[0]).toBe(0);
    events(sim, 6);
    const arrived = [...sim.enemies.values()].filter((e) => e.arena === 0);
    expect(arrived).toHaveLength(3);
    for (const e of arrived) {
      expect(e.body.x).toBeGreaterThanOrEqual(40 * T);
      expect(e.body.x).toBeLessThanOrEqual(77 * T);
    }
  });

  it('an elite trooper is three times as tough, glows, and pays its killer back', () => {
    const { sim, p } = solo(ambush(['S*R SL']), 3);
    p.x = 46 * T;
    events(sim, 2);
    const foes = [...sim.enemies.values()].filter((e) => e.arena === 0);
    const elite = foes.find((e) => e.elite) as Enemy;
    expect(elite).toBeDefined();
    const plain = foes.filter((e) => !e.elite);
    expect(elite.maxHp).toBeCloseTo(GAME_CONFIG.enemies.soldier.hp * M.elite.hp * (sim.mods.enemyHp ?? 1), 1);
    expect(sim.snapshot().enemies.find((e) => e.id === elite.id)!.el).toBe(1);
    for (const e of plain) expect(sim.snapshot().enemies.find((x) => x.id === e.id)!.el).toBe(0);
    p.hp = 50;
    p.ult = 0;
    const internal = sim as unknown as {
      damageEnemy(e: Enemy, d: number, by: string, x: number, y: number, s: string): void;
    };
    internal.damageEnemy(elite, 1e6, 'a', elite.body.x, elite.body.y, 'gun');
    const evs = sim.drainEvents();
    expect(evs.some((e) => e.e === 'elite' && e.by === 'a')).toBe(true);
    expect(p.hp).toBe(50 + M.elite.heal);
    expect(p.ult).toBeGreaterThan(0);
  });

  it('wave tokens: P and U entrances and the elite mark parse; nonsense is refused', () => {
    expect(parseWave('2SP H*U J^')).toEqual([
      { kind: 'soldier', side: 'P' },
      { kind: 'soldier', side: 'P' },
      { kind: 'shield', side: 'U', elite: true },
      { kind: 'jetpack', side: 'sky' },
    ]);
    expect(() => parseWave('S*X')).toThrow();
    expect(() => parseWave('*SR')).toThrow();
  });

  it('every stage after the first brings enemies in a new way: portals, out of the ground, or elites', () => {
    for (const id of SAGA_IDS.slice(1)) {
      const waves = SAGA_COURSES[id].sections.flatMap((s) => s.arena?.waves ?? []).join(' ');
      expect(/[PU]\b|\*/.test(waves), id).toBe(true);
    }
  });
});

describe('secrets', () => {
  it('every stage hides exactly one secret: the loot on its stash perch', () => {
    for (const id of SAGA_IDS) {
      const secrets = getMission(id).pickups.filter((p) => p.secret);
      expect(secrets, id).toHaveLength(1);
    }
  });

  it('taking the stash loot tells everyone a secret was found', () => {
    const L = getMission('astra-1');
    const pk = L.pickups.find((p) => p.secret)!;
    const sim = new Sim({ seed: 1, settings: { difficulty: 'normal', mission: 'astra-1' } });
    const p = sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
    while (sim.phase === 'countdown') sim.step();
    sim.drainEvents();
    p.x = pk.x;
    p.y = pk.y + 22;
    const evs = events(sim, 2);
    expect(evs.find((e) => e.e === 'secret')).toMatchObject({ id: pk.id, by: 'a' });
    expect(evs.some((e) => e.e === 'pickup' && e.id === pk.id)).toBe(true);
  });
});
