import { describe, expect, it } from 'vitest';
import { Autopilot, GAME_CONFIG, Sim, fieldAt, finalArena, getMission } from '../src';

/** Naag Lok (saga stage 4), a stage of its own: it goes down, in the dark, and ends with a dance on Vishdhar. */
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-4' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'vishdhar') sim.enemies.delete(e.id);
  return sim;
}
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;
const spawn = (sim: Sim, kind: string, x: number, y: number): Foe =>
  (sim as unknown as { spawnAwake: (k: string, x: number, y: number, a: number) => Foe }).spawnAwake(
    kind,
    x,
    y,
    -1,
  );

describe('Naag Lok layout', () => {
  const L = getMission('astra-4');
  it('goes down into the dark: the lake lies far below the start; poison pools; Vishdhar at the bottom', () => {
    expect(L.own && L.dark).toBe(true);
    const fin = finalArena(L);
    expect(fin.floor - L.start.y).toBeGreaterThan(15 * T);
    expect(L.fields.filter((f) => f.kind === 'poison').length).toBeGreaterThanOrEqual(4);
    expect(L.plats.filter((p) => p.kind === 'head')).toHaveLength(3);
    expect(L.bosses.filter((b) => b.arena === fin.id).map((b) => b.kind)).toEqual(['vishdhar']);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['serpent', 'spitter', 'egg']));
  });
});

describe('Naag Lok', () => {
  it('a pool of poison eats at whoever stands in it', () => {
    const sim = start();
    const pool = sim.level.fields.find((f) => f.kind === 'poison')!;
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    p.x = (pool.x0 + pool.x1) / 2;
    p.y = pool.y1 - 2;
    const hp = p.hp;
    for (let i = 0; i < sim.tickRate * 2; i++) {
      p.x = (pool.x0 + pool.x1) / 2;
      sim.step();
    }
    expect(fieldAt(sim.level, p.x, p.y - 4)?.kind).toBe('poison');
    expect(p.hp).toBeLessThan(hp);
  });

  it('a naga warrior is low: a standing shot passes over it', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const z = spawn(sim, 'serpent', p.x + 300, p.y);
    expect(z.body.h).toBeLessThan(22 - 2); // a standing shot leaves the muzzle 22 px up
  });

  it('an egg left alone hatches two naga warriors', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const egg = spawn(sim, 'egg', p.x + 150, p.y);
    for (let i = 0; i < sim.tickRate * (E.egg.hatchSec + 0.5); i++) sim.step();
    expect(sim.enemies.has(egg.id)).toBe(false);
    expect([...sim.enemies.values()].filter((e) => e.kind === 'serpent')).toHaveLength(2);
  });
});

describe('Vishdhar', () => {
  it('shots barely scratch him; landing on his heads, from one to the next, hurts him', () => {
    const sim = start();
    const fin = finalArena(sim.level);
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    p.x = fin.trigger + 20;
    p.y = fin.floor;
    sim.step();
    const k = [...sim.enemies.values()].find((e) => e.kind === 'vishdhar')!;
    expect(k.awake).toBe(true);
    const heads = sim.level.plats.map((d, i) => i).filter((i) => sim.level.plats[i]!.kind === 'head');
    const land = (i: number): number => {
      const hp = k.hp;
      const pl = sim.plats[i]!;
      p.x = (pl.x0 + pl.x1) / 2;
      p.y = pl.y - 6;
      p.vy = 200;
      for (let n = 0; n < 6; n++) sim.step();
      return hp - k.hp;
    };
    expect(land(heads[0]!)).toBeGreaterThan(k.maxHp * E.vishdhar.stomp * 0.9);
    expect(land(heads[0]!)).toBeLessThan(k.maxHp * E.vishdhar.stomp * 0.5); // the same head again: no
    expect(land(heads[1]!)).toBeGreaterThan(k.maxHp * E.vishdhar.stomp * 0.9);
  });
});

describe('Naag Lok end to end', () => {
  it('a computer squad of 1 or 4 goes down into Naag Lok and beats Vishdhar', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-4' } });
      const bots = new Autopilot(1);
      for (let i = 0; i < n; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i % 4 });
      for (let t = 0; sim.phase !== 'ended' && t < sim.tickRate * 600; t++) {
        for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
        sim.step();
      }
      expect(sim.result, `${n} soldiers`).toBe('won');
    }
  });
});
