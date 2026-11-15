import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/** Bhasm Parvat (saga stage 6), a stage of its own: lava rising, golems that rise again, Raakhasur's dance. */
const E = GAME_CONFIG.enemies;
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-6' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'raakhasur') sim.enemies.delete(e.id);
  return sim;
}
const spawn = (sim: Sim, kind: string, x: number, y: number): Foe =>
  (sim as unknown as { spawnAwake: (k: string, x: number, y: number, a: number) => Foe }).spawnAwake(
    kind,
    x,
    y,
    -1,
  );
const dmg = (sim: Sim, e: Foe, amount: number, src: string): void =>
  (
    sim as unknown as {
      damageEnemy: (e: Foe, d: number, by: string, x: number, y: number, s: string) => void;
    }
  ).damageEnemy(e, amount, 'p0', e.body.x, e.body.y, src);

describe('Bhasm Parvat layout', () => {
  const L = getMission('astra-6');
  it('climbs a volcano with the lava rising; its own rakshasas; Raakhasur on the rim', () => {
    expect(L.own && L.lava).toBe(true);
    expect(L.start.y - finalArena(L).floor).toBeGreaterThan(20 * GAME_CONFIG.tile);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['pret', 'golem', 'lantern']));
    expect(L.bosses.filter((b) => b.arena === finalArena(L).id).map((b) => b.kind)).toEqual(['raakhasur']);
  });
});

describe('Bhasm Parvat', () => {
  it('the lava starts, rises, and never lags far below the lowest soldier', () => {
    const sim = start();
    for (let i = 0; i < sim.tickRate * (GAME_CONFIG.lava.delaySec + 1); i++) sim.step();
    expect(sim.lavaOn).toBe(true);
    const p = sim.players.get('p0')!;
    expect(sim.lavaY - p.y).toBeLessThanOrEqual(GAME_CONFIG.lava.maxLag + 1);
    const y = sim.lavaY;
    for (let i = 0; i < sim.tickRate * 3; i++) sim.step();
    expect(sim.lavaY).toBeLessThan(y);
  });

  it('an ash golem brought down by plain weapons rises again; an astra finishes it', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const g = spawn(sim, 'golem', p.x + 300, p.y);
    dmg(sim, g, 100, 'gun');
    expect(sim.enemies.has(g.id)).toBe(true);
    expect(g.burst).toBe(1);
    for (let i = 0; i < sim.tickRate * (E.golem.riseSec + 0.2); i++) sim.step();
    expect(g.burst).toBe(0);
    expect(g.hp).toBe(g.maxHp);
    dmg(sim, g, 100, 'astra');
    expect(sim.enemies.has(g.id)).toBe(false);
  });
});

describe('Raakhasur', () => {
  function rim(): { sim: Sim; b: Foe } {
    const sim = start(1);
    const fin = finalArena(sim.level);
    const p = sim.players.get('p0')!;
    p.x = fin.trigger + 40;
    p.y = fin.floor;
    p.invulnUntil = 1e9;
    sim.step();
    return { sim, b: [...sim.enemies.values()].find((e) => e.kind === 'raakhasur')! };
  }

  it('copies a dancer who holds every pose, and burns himself', () => {
    const { sim, b } = rim();
    b.atk = ATTACK.dance;
    b.atkStart = sim.tick;
    b.atkParam = 0 + 1 * 4 + 3 * 16; // up, down, right
    b.my = 0;
    const hp = b.hp;
    for (let i = 0; i < sim.tickRate * 6 && b.atk === ATTACK.dance; i++) {
      const pose = sim.dancePose(b);
      const p = sim.players.get('p0')!;
      sim.setInput('p0', {
        mx: pose === 2 ? -1 : pose === 3 ? 1 : 0,
        my: pose === 0 ? -1 : pose === 1 ? 1 : 0,
      });
      p.x = b.body.x - 300;
      sim.step();
    }
    expect(hp - b.hp).toBeGreaterThan(b.maxHp * E.raakhasur.selfBurn * 0.9);
  });

  it('a dance not followed: no burn', () => {
    const { sim, b } = rim();
    b.atk = ATTACK.dance;
    b.atkStart = sim.tick;
    b.atkParam = 3 + 3 * 4 + 3 * 16;
    b.my = 0;
    const hp = b.hp;
    sim.setInput('p0', { mx: -1, my: 0 });
    for (let i = 0; i < sim.tickRate * 6 && b.atk === ATTACK.dance; i++) sim.step();
    expect(hp - b.hp).toBeLessThan(1);
  });
});

describe('Bhasm Parvat end to end', () => {
  it('a computer squad of 1 or 4 climbs the volcano and beats Raakhasur', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-6' } });
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
