import { describe, expect, it } from 'vitest';
import {
  ATTACK,
  Autopilot,
  BOSS_STYLES,
  BOSS_STYLE_IDS,
  Builder,
  GAME_CONFIG,
  POWER_KINDS,
  SAGA_COURSES,
  SAGA_IDS,
  Sim,
  VYUHAS,
  getMission,
  isBoss,
  parseWave,
  styleOf,
  darknessAt,
  type AttackId,
  type Enemy,
  type LevelDef,
  type Player,
  type SimEvent,
  type Vyuha,
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

describe('stage twists: hold-out arenas and sky fire', () => {
  it('a hold-out arena keeps sending waves, counts down, then clears itself when the time is up', () => {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    const g = b.gate(78, G - 1);
    b.arena(
      'HOLD',
      { trigger: 44, left: 40, right: 77, floor: G, gate: g },
      ['SR', 'SL'].map(parseWave),
      null,
      [],
      6,
    );
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const { sim, p } = solo(b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T } }));
    p.x = 46 * T;
    const first = events(sim, 2);
    expect(first.find((e) => e.e === 'arena')).toMatchObject({ secs: 6 });
    expect(sim.snapshot().arena?.t).toBe(6);
    let waves = 0;
    let cleared = false;
    const internal = sim as unknown as {
      damageEnemy(e: Enemy, d: number, by: string, x: number, y: number, s: string): void;
    };
    const evs = events(sim, sim.ticks(6) + 2, () => {
      p.hp = 100;
      // kill every attacker at once: with a fixed wave list the arena would be over after two waves
      for (const e of [...sim.enemies.values()])
        if (e.arena === 0) internal.damageEnemy(e, 1e6, 'a', e.body.x, e.body.y, 'gun');
    });
    for (const e of evs) {
      if (e.e === 'arena') waves++;
      if (e.e === 'clear' && e.id === 0) cleared = true;
    }
    expect(waves).toBeGreaterThan(2);
    expect(cleared).toBe(true);
    expect([...sim.enemies.values()].filter((e) => e.arena === 0)).toHaveLength(0);
    expect(sim.snapshot().arena).toBeNull();
  });

  it('a hold-out arena never clears early, however fast the squad shoots', () => {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    const g = b.gate(78, G - 1);
    b.arena(
      'HOLD',
      { trigger: 44, left: 40, right: 77, floor: G, gate: g },
      ['SR'].map(parseWave),
      null,
      [],
      10,
    );
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const { sim, p } = solo(b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T } }));
    p.x = 46 * T;
    const internal = sim as unknown as {
      damageEnemy(e: Enemy, d: number, by: string, x: number, y: number, s: string): void;
    };
    const evs = events(sim, sim.ticks(9), () => {
      p.hp = 100;
      for (const e of [...sim.enemies.values()]) internal.damageEnemy(e, 1e6, 'a', e.body.x, e.body.y, 'gun');
    });
    expect(evs.some((e) => e.e === 'clear')).toBe(false);
  });

  it('sky fire falls round a soldier every few seconds, and rests while a boss is awake', () => {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const L = b.build({
      id: 'test',
      name: 'Test',
      start: { x: 3 * T, y: G * T },
      hazard: { kind: 'skyfall', every: 3, count: 3 },
    });
    const { sim, p } = solo(L);
    let falls = 0;
    let most = 0;
    events(sim, sim.ticks(15), () => {
      p.hp = 100;
      most = Math.max(most, sim.bullets.filter((x) => x.enemy && x.kind === 'meteor').length);
    }).forEach((e) => {
      if (e.e === 'hazard') falls++;
    });
    expect(falls).toBeGreaterThanOrEqual(2);
    expect(most).toBe(3);
    // every fireball is aimed near the soldier, never across the map
    const boss = new Sim({ seed: 2, settings: { difficulty: 'normal', mission: 'astra-3' } });
    const q = boss.addPlayer({ id: 'a', name: 'A', slot: 0 });
    while (boss.phase === 'countdown') boss.step();
    const arena = boss.level.arenas.find((a) => a.boss)!;
    q.x = arena.trigger + 20;
    q.y = arena.floor;
    const evs = events(boss, boss.ticks(30), () => {
      q.hp = 100;
    });
    expect(boss.level.hazard).not.toBeNull();
    const woke = evs.findIndex((e) => e.e === 'bossWake');
    expect(woke).toBeGreaterThanOrEqual(0);
    expect(evs.slice(woke).some((e) => e.e === 'hazard')).toBe(false);
  });

  it('raiders dive in behind the squad, are capped, and stay away while an arena is locked', () => {
    const b = new Builder(200, 18);
    b.ground(0, 199, G);
    const g = b.gate(118, G - 1);
    b.arena('AMBUSH', { trigger: 84, left: 80, right: 117, floor: G, gate: g }, ['SR'].map(parseWave));
    b.arena('END', { trigger: 190, left: 180, right: 195, floor: G, gate: -1 }, []);
    const L = b.build({
      id: 'test',
      name: 'Test',
      start: { x: 30 * T, y: G * T },
      hazard: { kind: 'raid', every: 3, count: 2 },
    });
    const { sim, p } = solo(L);
    let most = 0;
    const evs = events(sim, sim.ticks(30), () => {
      p.hp = 100;
      most = Math.max(most, [...sim.enemies.values()].filter((e) => e.kind === 'jetpack').length);
    });
    expect(evs.filter((e) => e.e === 'hazard' && e.kind === 'raid').length).toBeGreaterThanOrEqual(1);
    expect(most).toBeGreaterThanOrEqual(2);
    expect(most).toBeLessThanOrEqual(GAME_CONFIG.hazards.raid.max);
    // inside a locked arena no new raiders come
    for (const e of [...sim.enemies.values()]) sim.enemies.delete(e.id);
    p.x = 86 * T;
    events(sim, 2);
    const inArena = events(sim, sim.ticks(10), () => {
      p.hp = 100;
    });
    expect(inArena.some((e) => e.e === 'hazard')).toBe(false);
  });

  it('a tremor sends a shockwave along the ground at a soldier, which a jump clears', () => {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const L = b.build({
      id: 'test',
      name: 'Test',
      start: { x: 40 * T, y: G * T },
      hazard: { kind: 'tremor', every: 9, count: 2 },
    });
    const run = (jump: boolean): { waves: number; hurt: boolean } => {
      const { sim, p } = solo(L, 4);
      let waves = 0;
      const hp = p.hp;
      let hurt = false;
      events(sim, sim.ticks(13), () => {
        const near = sim.bullets.some((x) => x.enemy && x.kind === 'wave' && Math.abs(x.x - p.x) < 70);
        waves = Math.max(waves, sim.bullets.filter((x) => x.enemy && x.kind === 'wave').length);
        sim.setInput(p.id, {
          mx: 0,
          my: 0,
          jump: jump && near,
          fire: false,
          dash: false,
          melee: false,
          ult: false,
          astra: false,
        });
        if (p.hp < hp) hurt = true;
      });
      return { waves, hurt };
    };
    const stood = run(false);
    expect(stood.waves).toBe(2);
    expect(stood.hurt).toBe(true);
    expect(run(true).hurt).toBe(false);
  });

  it('darkness comes in spells with a fade, never at the start of a stage, and is announced', () => {
    const h = { kind: 'dark', every: 10, count: 4 } as const;
    expect(darknessAt(null, 500, 30)).toBe(0);
    expect(darknessAt(h, 30, 30)).toBe(0); // the first period is always light
    expect(darknessAt(h, 300 + 60, 30)).toBe(1); // two seconds into a spell
    expect(darknessAt(h, 300 + 6, 30)).toBeCloseTo(0.4, 5); // fading in
    expect(darknessAt(h, 300 + 114, 30)).toBeCloseTo(0.4, 5); // fading out
    expect(darknessAt(h, 300 + 150, 30)).toBe(0);
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const { sim } = solo(b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T }, hazard: h }));
    const evs = events(sim, sim.ticks(25));
    expect(evs.filter((e) => e.e === 'hazard' && e.kind === 'dark')).toHaveLength(2);
  });

  it('waves come in mirrored on some runs: the same arena does not always play the same way', () => {
    const sides = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { sim, p } = solo(ambush(['2SR']), seed);
      p.x = 46 * T;
      events(sim, 2);
      const xs = [...sim.enemies.values()].filter((e) => e.arena === 0).map((e) => e.body.x);
      expect(xs).toHaveLength(2);
      sides.add(xs.every((x) => x > 58 * T) ? 'right' : xs.every((x) => x < 58 * T) ? 'left' : 'mixed');
    }
    expect([...sides].sort()).toEqual(['left', 'right']);
  });

  it('saga stages differ: some hold out, some have sky fire, and every stage says what its twist is', () => {
    const kinds = new Set(SAGA_IDS.map((id) => getMission(id).hazard?.kind).filter(Boolean));
    expect([...kinds].sort()).toEqual(['dark', 'raid', 'skyfall', 'tremor']);
    const holds = SAGA_IDS.filter((id) => getMission(id).arenas.some((a) => a.survive > 0));
    const skies = SAGA_IDS.filter((id) => getMission(id).hazard);
    expect(holds.length).toBeGreaterThanOrEqual(4);
    expect(skies.length).toBeGreaterThanOrEqual(4);
    for (const id of SAGA_IDS)
      for (const a of getMission(id).arenas) if (a.boss) expect(a.survive, id).toBe(0);
  });
});

describe('battle arrays (vyuhas)', () => {
  const WAVE = '2SR HR GR 2J^ S*L';

  function array(v: Vyuha, seed = 7): { sim: Sim; p: Player; first: SimEvent[] } {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    const g = b.gate(78, G - 1);
    b.arena(
      'ARRAY',
      { trigger: 44, left: 40, right: 77, floor: G, gate: g },
      [WAVE, WAVE].map(parseWave),
      null,
      [],
      0,
      [v],
    );
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const { sim, p } = solo(b.build({ id: 'test', name: 'Test', start: { x: 3 * T, y: G * T } }), seed);
    p.x = 58 * T;
    p.invulnUntil = 1e9;
    return { sim, p, first: events(sim, 2) };
  }
  const inArena = (sim: Sim): Enemy[] => [...sim.enemies.values()].filter((e) => e.arena === 0);
  const flyer = (e: Enemy): boolean => e.kind === 'jetpack' || e.kind === 'drone';

  it.each(VYUHAS.map((v) => [v]))(
    '%s: the whole wave arrives inside the arena, is announced by name, and nobody is left on a perch',
    (v) => {
      const { sim, first } = array(v as Vyuha);
      expect(first.find((e) => e.e === 'arena')).toMatchObject({ vy: v, wave: 1 });
      events(sim, sim.ticks(6));
      const foes = inArena(sim);
      expect(foes).toHaveLength(7);
      expect(foes.filter((e) => e.elite)).toHaveLength(1);
      for (const e of foes) {
        expect(e.body.x).toBeGreaterThanOrEqual(40 * T);
        expect(e.body.x).toBeLessThanOrEqual(78 * T);
        if (!flyer(e)) expect(e.body.y).toBeCloseTo(G * T, 0);
      }
    },
  );

  it('the wheel rises out of the ground on both sides of the squad, the inner ring first', () => {
    const { sim, p, first } = array('chakra');
    expect(first.filter((e) => e.e === 'portal')).toHaveLength(5);
    expect(inArena(sim)).toHaveLength(0);
    events(sim, sim.ticks(M.portalSec) + 2);
    const inner = inArena(sim).filter((e) => !flyer(e));
    expect(inner).toHaveLength(2);
    expect(inner.some((e) => e.body.x < p.x)).toBe(true);
    expect(inner.some((e) => e.body.x > p.x)).toBe(true);
    events(sim, sim.ticks(2));
    expect(inArena(sim).filter((e) => !flyer(e))).toHaveLength(5);
  });

  it('the needle is one file through one end; the half-moon comes from both ends at once', () => {
    const needle = array('suchi');
    events(needle.sim, 3);
    expect(inArena(needle.sim)).toHaveLength(1);
    events(needle.sim, needle.sim.ticks(4));
    const file = inArena(needle.sim).filter((e) => !flyer(e));
    expect(file).toHaveLength(5);
    const moon = array('ardha');
    const horns = inArena(moon.sim).filter((e) => !flyer(e));
    expect(horns).toHaveLength(5);
    expect(horns.some((e) => e.body.x < 50 * T)).toBe(true);
    expect(horns.some((e) => e.body.x > 68 * T)).toBe(true);
  });

  it('the crocodile shuts its second jaw behind the squad a moment after the first; the thunderbolt falls from the air', () => {
    const { sim } = array('makara');
    const jaw = inArena(sim);
    expect(jaw).toHaveLength(3);
    expect(jaw.some((e) => e.kind === 'shield')).toBe(true); // the heavy jaw leads
    const side = Math.sign(jaw[0]!.body.x - 58 * T);
    for (const e of jaw) expect(Math.sign(e.body.x - 58 * T)).toBe(side);
    events(sim, sim.ticks(2.6));
    const all = inArena(sim).filter((e) => !flyer(e));
    expect(all).toHaveLength(5);
    expect(all.some((e) => Math.sign(e.body.x - 58 * T) === -side)).toBe(true);
    const bolt = array('vajra');
    expect(inArena(bolt.sim).some((e) => !flyer(e) && e.body.y < G * T - 30)).toBe(true);
  });

  it('an arena clears only after a delayed array has fully arrived and been beaten', () => {
    const { sim } = array('suchi');
    for (let i = 0; i < sim.ticks(1); i++) {
      for (const e of inArena(sim)) sim.enemies.delete(e.id);
      sim.step();
    }
    expect(sim.arenaWave[0]).toBe(0); // the file is still coming through: no second wave yet
  });

  it('every saga stage fights in at least two arrays and offers at least two astras', () => {
    for (const id of SAGA_IDS) {
      const L = getMission(id);
      const arrays = new Set(L.arenas.flatMap((a) => a.vyuha));
      expect(arrays.size, `${id} arrays`).toBeGreaterThanOrEqual(2);
      const astras = new Set(L.pickups.map((p) => p.kind).filter((k) => POWER_KINDS.includes(k as never)));
      expect(astras.size, `${id} astras`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('pacing: rest stops, a breath after a fight, astras that come back', () => {
  it('every saga stage has a rest stop after each fight but the last: no foes, a checkpoint, a medkit, an astra', () => {
    for (const id of SAGA_IDS) {
      const C = SAGA_COURSES[id];
      const L = getMission(id);
      const fights = C.sections.filter((s) => s.arena).length;
      expect(L.rests.length, id).toBe(fights - 1);
      expect(L.rests.length, id).toBeGreaterThanOrEqual(2);
      C.sections.forEach((s, i) => {
        if (s.arena && i < C.sections.length - 1)
          expect(C.sections[i + 1]!.rest, `${id} after ${s.arena.name}`).toBe(true);
      });
      for (const r of L.rests) {
        const within = (x: number): boolean => x >= r.x0 && x <= r.x1;
        expect(L.enemies.filter((e) => within(e.x))).toHaveLength(0);
        expect(L.checkpoints.some((c) => within(c.x))).toBe(true);
        const loot = L.pickups.filter((p) => within(p.x));
        expect(loot.some((p) => p.kind === 'medkit')).toBe(true);
        const astra = loot.find((p) => POWER_KINDS.includes(p.kind as never));
        expect(astra?.respawn, `${id}: the pedestal refills for the whole squad`).toBe(true);
        expect(r.x1 - r.x0).toBeGreaterThanOrEqual(20 * T);
      }
    }
  });

  it('a stage with a wall of fire ahead offers rain at its rest stops', () => {
    const L = getMission('astra-2');
    const wall = Math.max(...L.gates.filter((g) => g.fire).map((g) => g.col * T));
    for (const r of L.rests.filter((x) => x.x1 < wall)) {
      const astra = L.pickups.find(
        (p) => p.x >= r.x0 && p.x <= r.x1 && POWER_KINDS.includes(p.kind as never),
      );
      expect(astra?.kind).toBe('varuna');
    }
  });

  function restLevel(hazard: 'skyfall' | 'tremor'): { sim: Sim; p: Player } {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    b.rest(20, 41);
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    return solo(
      b.build({
        id: 'test',
        name: 'Test',
        start: { x: 3 * T, y: G * T },
        hazard: { kind: hazard, every: 2, count: 2 },
      }),
    );
  }

  it('the fire of a rest stop heals, and the hazard leaves a resting squad alone', () => {
    const { sim, p } = restLevel('skyfall');
    p.x = 30 * T;
    p.hp = 20;
    p.lastHurt = sim.tick; // just hit: ordinary recovery would wait, the fire does not
    events(sim, sim.ticks(2));
    expect(p.hp).toBeGreaterThan(20 + GAME_CONFIG.mission.restHeal * 1.8);
    const seen = events(sim, sim.ticks(12));
    expect(p.hp).toBe(GAME_CONFIG.player.maxHp);
    expect(seen.some((e) => e.e === 'hazard')).toBe(false);
    // outside the stop the sky opens again, and nothing heals
    p.x = 60 * T;
    p.invulnUntil = 1e9;
    const after = events(sim, sim.ticks(6));
    expect(after.some((e) => e.e === 'hazard')).toBe(true);
  });

  it('the hazard holds off for a breath after an arena falls', () => {
    const b = new Builder(140, 18);
    b.ground(0, 139, G);
    const g = b.gate(60, G - 1);
    b.arena('AMBUSH', { trigger: 40, left: 30, right: 59, floor: G, gate: g }, ['SR'].map(parseWave));
    b.arena('END', { trigger: 130, left: 120, right: 135, floor: G, gate: -1 }, []);
    const { sim, p } = solo(
      b.build({
        id: 'test',
        name: 'Test',
        start: { x: 3 * T, y: G * T },
        hazard: { kind: 'skyfall', every: 2, count: 1 },
      }),
    );
    p.invulnUntil = 1e9;
    p.x = 45 * T;
    events(sim, sim.ticks(9));
    for (const e of [...sim.enemies.values()]) if (e.arena === 0) sim.enemies.delete(e.id);
    const clear = events(sim, 3);
    expect(clear.some((e) => e.e === 'clear')).toBe(true);
    const calm = events(sim, sim.ticks(GAME_CONFIG.mission.calmSec) - 6);
    expect(calm.some((e) => e.e === 'hazard')).toBe(false);
    expect(events(sim, sim.ticks(3)).some((e) => e.e === 'hazard')).toBe(true);
  });

  it('the carried astra regains a charge every few kills by weapon, never by its own kills, never past the cap', () => {
    const PWR = GAME_CONFIG.powers;
    const { sim, p } = restLevel('tremor');
    p.invulnUntil = 1e9;
    p.x = 80 * T;
    p.power = 'agni';
    p.powerN = 1;
    const kill = (src: 'gun' | 'astra'): SimEvent[] => {
      const inner = sim as unknown as {
        spawnAwake(k: string, x: number, y: number, a: number): Enemy;
      };
      const e = inner.spawnAwake('soldier', p.x + 200, G * T, -1);
      (
        sim as unknown as {
          damageEnemy(e: Enemy, d: number, by: string, x: number, y: number, s: string): void;
        }
      ).damageEnemy(e, 9999, p.id, e.body.x, e.body.y, src);
      return sim.drainEvents();
    };
    for (let i = 0; i < PWR.regainKills - 1; i++)
      expect(kill('gun').some((e) => e.e === 'regain')).toBe(false);
    for (let i = 0; i < 5; i++) kill('astra');
    expect(p.powerN).toBe(1);
    expect(kill('gun').find((e) => e.e === 'regain')).toMatchObject({ id: p.id, kind: 'agni' });
    expect(p.powerN).toBe(2);
    p.powerN = PWR.maxCharges;
    for (let i = 0; i < PWR.regainKills * 2; i++) kill('gun');
    expect(p.powerN).toBe(PWR.maxCharges);
    // with no astra in hand there is nothing to regain
    p.power = null;
    p.powerN = 0;
    for (let i = 0; i < PWR.regainKills * 2; i++)
      expect(kill('gun').some((e) => e.e === 'regain')).toBe(false);
  });
});
