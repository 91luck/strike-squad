import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission, levelHeight } from '../src';

/** Vayu Shikhar (saga stage 3), a stage of its own: it climbs, the wind blows, and Aandhi waits on top. */
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-3' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'aandhi') sim.enemies.delete(e.id);
  return sim;
}
const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < Math.round(sec * sim.tickRate); i++) sim.step();
};

describe('Vayu Shikhar layout', () => {
  const L = getMission('astra-3');
  it('climbs: the level is taller than a screen and the summit is far above the start', () => {
    expect(L.own && L.gusts).toBe(true);
    expect(levelHeight(L)).toBeGreaterThan(18 * T * 2);
    const fin = finalArena(L);
    expect(L.start.y - fin.floor).toBeGreaterThan(25 * T);
    expect(L.bosses.filter((b) => b.arena === fin.id).map((b) => b.kind)).toEqual(['aandhi']);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['harpy', 'roller', 'lancer']));
  });
});

describe('the wind', () => {
  it('warns, then blows a soldier along; crouching into it holds them better', () => {
    const sim = start(2);
    const [a, b] = [...sim.players.values()];
    let warned = false;
    while (!sim.gustDir) {
      sim.step();
      if (sim.snapshot().gu === 2 || sim.snapshot().gu === -2) warned = true;
    }
    expect(warned).toBe(true);
    for (const p of [a!, b!]) {
      p.x = 4 * T;
      p.y = sim.level.start.y;
    }
    b!.input = { ...b!.input, my: 1 };
    const x0 = a!.x;
    steps(sim, 0.5);
    const da = Math.abs(a!.x - x0);
    expect(da).toBeGreaterThan(20);
    expect(Math.abs(b!.x - x0)).toBeLessThan(da);
  });
});

describe('Aandhi', () => {
  function summit(): { sim: Sim; boss: NonNullable<ReturnType<Sim['enemies']['get']>> } {
    const sim = start(2);
    const fin = finalArena(sim.level);
    for (const p of sim.players.values()) {
      p.x = fin.trigger + 40;
      p.y = fin.floor;
      p.invulnUntil = 1e9;
    }
    steps(sim, 0.2);
    return { sim, boss: [...sim.enemies.values()].find((e) => e.kind === 'aandhi')! };
  }

  it('storms, throws boulders and javelins; his storm drives the squad back toward the drop', () => {
    const { sim, boss } = summit();
    const seen = new Set<number>();
    let pushed = false;
    for (let i = 0; i < sim.tickRate * 14; i++) {
      const before = sim.players.get('p0')!.x;
      sim.step();
      seen.add(boss.atk);
      if (boss.atk === ATTACK.storm && sim.gustDir === -1 && sim.players.get('p0')!.x < before - 1)
        pushed = true;
    }
    expect(seen.has(ATTACK.storm) && seen.has(ATTACK.boulders) && seen.has(ATTACK.javelins)).toBe(true);
    expect(pushed).toBe(true);
  });

  it("his sage's guise turns half a blow, except while he holds up a storm; vayu turns the storm on him", () => {
    const { sim, boss } = summit();
    const p = sim.players.get('p0')!;
    const hit = (): number => {
      const hp = boss.hp;
      sim.bullets.push({
        id: 96_000 + sim.tick,
        enemy: false,
        owner: 'p0',
        kind: 'shot',
        x: boss.body.x - 10,
        y: boss.body.y - 60,
        vx: 300,
        vy: 0,
        dmg: 1,
        pierce: false,
        expires: sim.tick + 10,
        born: sim.tick,
        lag: 0,
        weapon: 'blaster',
        power: false,
        hit: null,
        grav: 0,
        blast: 0,
        size: 2,
        turn: 0,
        hitsLeft: 0,
        ret: false,
        src: -1,
      });
      sim.step();
      return hp - boss.hp;
    };
    boss.mx = 0;
    boss.atk = ATTACK.javelins;
    boss.atkStart = sim.tick + 1000;
    expect(hit()).toBeCloseTo(E.aandhi.guise, 5);
    boss.atk = ATTACK.storm;
    (sim as unknown as { storm: unknown }).storm = { dir: -1, push: 150, until: sim.tick + 90 };
    sim.step();
    expect(sim.gustDir).toBe(-1);
    expect(hit()).toBeCloseTo(1, 5);
    const hp = boss.hp;
    p.power = 'vayu';
    p.powerN = 2;
    sim.setInput('p0', { astra: true });
    sim.step();
    sim.setInput('p0', { astra: false });
    expect(boss.hp).toBeLessThan(hp - boss.maxHp * E.aandhi.reversedShare * 0.9);
    steps(sim, 0.2);
    expect(sim.gustDir).not.toBe(-1);
  });
});

describe('Vayu Shikhar end to end', () => {
  it('a computer squad of 1 or 4 climbs the mountain and beats Aandhi', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-3' } });
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
