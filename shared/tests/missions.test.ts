import { describe, expect, it } from 'vitest';
import {
  Autopilot,
  GAME_CONFIG,
  MAX_GATES,
  MAX_PICKUPS,
  MISSIONS,
  MISSION_IDS,
  Sim,
  Tile,
  buildCourse,
  finalArena,
  getMission,
  isBoss,
  parseWave,
  tileAt,
  type MissionId,
} from '../src';
import { ClientMessageSchema } from '../src/schemas';

const T = GAME_CONFIG.tile;

describe('mission registry', () => {
  it('lists every mission id once, in campaign order, with rising toughness', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual([...MISSION_IDS]);
    for (let i = 1; i < MISSIONS.length; i++)
      expect(MISSIONS[i]!.stars).toBeGreaterThanOrEqual(MISSIONS[i - 1]!.stars);
  });

  it('builds a mission once and shares it (rooms and the client reuse one immutable copy)', () => {
    expect(getMission('mission-3')).toBe(getMission('mission-3'));
    expect(getMission('no-such-mission').id).toBe('mission-1');
  });
});

describe.each(MISSION_IDS.map((id) => [id]))('%s layout', (id: MissionId) => {
  const L = getMission(id);

  it('is one screen tall and fits the snapshot bitmasks', () => {
    expect(L.rows).toBe(18);
    expect(L.gates.length).toBeLessThanOrEqual(MAX_GATES);
    expect(L.pickups.length).toBeLessThanOrEqual(MAX_PICKUPS);
    expect(L.tiles.byteLength).toBe(L.cols * L.rows); // one byte per tile
  });

  it('starts on solid ground and ends in one final arena with the fortress boss', () => {
    expect(tileAt(L, Math.floor(L.start.x / T), L.start.y / T)).toBe(Tile.Solid);
    const fin = finalArena(L);
    expect(L.arenas.filter((a) => a.gate === -1)).toHaveLength(1);
    expect(L.bosses.some((b) => b.arena === fin.id && b.kind === 'boss')).toBe(true);
  });

  it('puts every boss in a boss arena, and every gate belongs to an arena', () => {
    for (const b of L.bosses) expect(L.arenas[b.arena]?.boss).not.toBeNull();
    for (const g of L.gates) {
      if (g.fire) {
        // A wall of fire always has a rain altar (a respawning varuna) shortly before it: never a dead end.
        const altar = L.pickups.find(
          (p) => p.kind === 'varuna' && p.respawn && p.x < g.col * T && g.col * T - p.x < 16 * T,
        );
        expect(altar, `fire wall at column ${g.col}`).toBeDefined();
      } else expect(L.arenas.some((a) => a.gate === g.id)).toBe(true);
    }
  });

  it('stands every ground enemy and pickup on something', () => {
    for (const e of L.enemies) {
      if (e.kind === 'drone' || e.kind === 'jetpack') continue;
      const below = tileAt(L, Math.floor(e.x / T), e.y / T);
      expect([Tile.Solid, Tile.OneWay]).toContain(below);
    }
    for (const p of L.pickups) {
      const row = Math.round((p.y + 22) / T);
      expect([Tile.Solid, Tile.OneWay]).toContain(tileAt(L, Math.floor(p.x / T), row));
    }
  });

  it('has checkpoints in order and art for its whole length', () => {
    for (let i = 1; i < L.checkpoints.length; i++)
      expect(L.checkpoints[i]!.x).toBeGreaterThan(L.checkpoints[i - 1]!.x);
    expect(L.art[0]?.x).toBe(0);
    expect(L.zones.length).toBeGreaterThanOrEqual(8);
  });
});

describe('course format', () => {
  it('parses waves: counts, kinds and sides', () => {
    expect(parseWave('3SR J^ HL')).toEqual([
      { kind: 'soldier', side: 'R' },
      { kind: 'soldier', side: 'R' },
      { kind: 'soldier', side: 'R' },
      { kind: 'jetpack', side: 'sky' },
      { kind: 'shield', side: 'L' },
    ]);
    expect(() => parseWave('3XR')).toThrow(/bad wave token/);
  });

  it('refuses bad placements and tokens when the mission is built, so a typo cannot ship', () => {
    const base = { id: 'x', name: 'x', mods: getMission('mission-1').mods };
    const fin = {
      art: 'jungle' as const,
      len: 30,
      arena: { name: 'F', bosses: ['boss' as const], final: true },
    };
    const run = (foes: string) => () =>
      buildCourse({ ...base, sections: [{ art: 'jungle', land: 'flat', len: 20, foes }, fin] });
    expect(run('S25')).toThrow(/nothing to stand on/); // past the end of its section
    expect(run('Q5')).toThrow(/bad foe/);
    expect(run('S5 T8^')).not.toThrow();
    expect(() => buildCourse({ ...base, sections: [{ art: 'jungle', land: 'flat', len: 20 }] })).toThrow(
      /no final arena/,
    );
  });
});

describe('mission rules in the sim', () => {
  it('later missions are tougher: troopers have more health and hit harder', () => {
    const m1 = getMission('mission-1').mods;
    const m4 = getMission('mission-4').mods;
    expect(m4.enemyHp).toBeGreaterThan(m1.enemyHp);
    expect(m4.enemyDamage).toBeGreaterThan(m1.enemyDamage);
    const sim = new Sim({ seed: 3, settings: { mission: 'mission-4' } });
    expect(sim.level.id).toBe('mission-4');
    sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
    const s0 = new Sim({ seed: 3 });
    s0.addPlayer({ id: 'a', name: 'A', slot: 0 });
    // Wake the first soldier of each mission and compare its health.
    const wake = (s: Sim): number => {
      const e = [...s.enemies.values()].find((x) => x.kind === 'soldier')!;
      (s as unknown as { wake(e: unknown): void }).wake(e);
      return e.hp;
    };
    expect(wake(sim)).toBeCloseTo(wake(s0) * m4.enemyHp, 5);
  });

  it('twin bosses share one boss bar that adds both up', () => {
    const sim = new Sim({ seed: 5, settings: { mission: 'mission-2' } });
    sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
    while (sim.phase === 'countdown') sim.step();
    const arena = sim.level.arenas.find((a) => a.name === 'TWIN HOUNDS')!;
    const twins = [...sim.enemies.values()].filter((e) => e.arena === arena.id && isBoss(e.kind));
    expect(twins).toHaveLength(2);
    const p = sim.players.get('a')!;
    p.x = arena.trigger + 10;
    p.y = arena.floor;
    sim.step();
    const bar = sim.snapshot().boss!;
    expect(bar.max).toBe(Math.round(twins[0]!.maxHp + twins[1]!.maxHp));
    // One down: the bar keeps its full length and shows the survivor's health.
    twins[0]!.hp = 0.01;
    sim.enemies.delete(twins[0]!.id);
    sim.step();
    expect(sim.snapshot().boss!.max).toBe(bar.max);
    expect(sim.snapshot().boss!.hp).toBe(Math.round(twins[1]!.hp));
  });

  it('a boss arena brings its escort waves while the boss stands', () => {
    const sim = new Sim({ seed: 9, settings: { mission: 'mission-2' } });
    sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
    while (sim.phase === 'countdown') sim.step();
    const arena = sim.level.arenas.find((a) => a.name === 'VULTURE')!;
    expect(arena.waves.length).toBe(2);
    const p = sim.players.get('a')!;
    p.x = arena.trigger + 10;
    p.y = arena.floor;
    sim.step();
    const escorts = [...sim.enemies.values()].filter((e) => e.arena === arena.id && !isBoss(e.kind));
    expect(escorts.length).toBe(2);
    expect(sim.arenaState[arena.id]).toBe(1);
  });

  it('the mission is won when the final arena is cleared', () => {
    const sim = new Sim({ seed: 2, settings: { mission: 'mission-3' } });
    sim.addPlayer({ id: 'a', name: 'A', slot: 0 });
    while (sim.phase === 'countdown') sim.step();
    const fin = finalArena(sim.level);
    const p = sim.players.get('a')!;
    p.x = fin.trigger + 10;
    p.y = fin.floor;
    sim.step();
    expect(sim.arenaState[fin.id]).toBe(1);
    for (const e of [...sim.enemies.values()]) if (e.arena === fin.id) sim.enemies.delete(e.id);
    sim.step();
    expect(sim.decided).toBe('won');
  });
});

describe('every mission can be finished', () => {
  // A full computer squad plays each new mission to the end (the same check the playtest script runs at scale).
  it.each([['mission-2'], ['mission-3'], ['mission-4'], ['mission-5'], ['mission-6']] as [MissionId][])(
    '%s: a 4-soldier computer squad wins on normal',
    (mission) => {
      const sim = new Sim({ seed: 31681, settings: { difficulty: 'normal', mission } });
      const bots = new Autopilot(1);
      for (let i = 0; i < 4; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
      const cap = sim.ticks(15 * 60);
      while (sim.phase !== 'ended' && sim.tick < cap) {
        for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
        sim.step();
        sim.drainEvents();
      }
      expect(sim.result).toBe('won');
    },
    120_000,
  );
});

describe('protocol', () => {
  it('accepts a known mission in settings and rejects unknown ones', () => {
    expect(
      ClientMessageSchema.safeParse({ t: 'setSettings', settings: { mission: 'mission-4' } }).success,
    ).toBe(true);
    expect(
      ClientMessageSchema.safeParse({ t: 'setSettings', settings: { mission: 'mission-9' } }).success,
    ).toBe(false);
  });
});
