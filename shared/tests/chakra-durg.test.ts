import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, fieldAt, finalArena, getMission } from '../src';

/** Chakra Durg (saga stage 8), a stage of its own: the bhanwarvyuh's turning rings, closing behind; Suryakavach. */
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-8' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'suryakavach') sim.enemies.delete(e.id);
  return sim;
}
const spawn = (sim: Sim, kind: string, x: number, y: number): Foe =>
  (sim as unknown as { spawnAwake: (k: string, x: number, y: number, a: number) => Foe }).spawnAwake(
    kind,
    x,
    y,
    -1,
  );
const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < Math.round(sec * sim.tickRate); i++) sim.step();
};

describe('Chakra Durg layout', () => {
  const L = getMission('astra-8');
  it('a bhanwarvyuh of turning rings that closes behind; its own rakshasas; Suryakavach at the seventh gate', () => {
    expect(L.own && L.vyuh).toBe(true);
    expect(L.gates).toHaveLength(0);
    expect(L.arenas.filter((a) => !a.boss)).toHaveLength(0);
    expect(L.fields.filter((f) => f.kind === 'belt').length).toBeGreaterThanOrEqual(3);
    expect(new Set(L.fields.filter((f) => f.kind === 'belt').map((f) => Math.sign(f.power)))).toEqual(
      new Set([-1, 1]),
    );
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['chakri', 'rathi', 'netter']));
    expect(L.bosses.filter((b) => b.arena === finalArena(L).id).map((b) => b.kind)).toEqual(['suryakavach']);
  });
});

describe('Chakra Durg', () => {
  it('the formation closes behind: no going back', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.x = 40 * T;
    steps(sim, 0.2);
    for (let i = 0; i < sim.tickRate * 3; i++) {
      sim.setInput('p0', { mx: -1 });
      sim.step();
    }
    expect(p.x).toBeGreaterThanOrEqual(40 * T - GAME_CONFIG.vyuh.lag - 1);
    expect(sim.vyuhX).toBeGreaterThan(0);
  });

  it('a turning ring carries a soldier standing in it', () => {
    const sim = start();
    const f = sim.level.fields.find((q) => q.kind === 'belt')!;
    const p = sim.players.get('p0')!;
    p.x = f.x0 + 2.5 * T;
    p.y = 14 * T;
    sim.vyuhX = 0;
    steps(sim, 0.3);
    expect(fieldAt(sim.level, p.x, p.y - 4)?.kind).toBe('belt');
    const x = p.x;
    steps(sim, 0.5);
    expect(Math.sign(p.x - x)).toBe(Math.sign(f.power));
  });

  it("a discus thrower's disc flies out and comes back to its hand", () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    const c = spawn(sim, 'chakri', p.x + 380, p.y);
    c.nextFire = 0;
    sim.step();
    const d = sim.bullets.find((b) => b.enemy && b.kind === 'chakra')!;
    expect(d.vx).toBeLessThan(0);
    steps(sim, E.chakri.outSec + 0.1);
    expect(d.vx).toBeGreaterThan(0);
  });

  it('a maharathi crouches, then lunges through a soldier', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    const r = spawn(sim, 'rathi', p.x + 140, p.y);
    r.nextFire = 0;
    const hp = p.hp;
    let lunged = false;
    for (let i = 0; i < sim.tickRate * 2; i++) {
      sim.setInput('p0', { mx: 0 });
      sim.step();
      if (r.burst === 2) lunged = true;
    }
    expect(lunged).toBe(true);
    expect(p.hp).toBeLessThan(hp);
  });

  it('a net slows the soldier it lands on', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    const n = spawn(sim, 'netter', p.x + 300, p.y);
    n.nextFire = 0;
    for (let i = 0; i < sim.tickRate * 1.5 && sim.tick >= p.netUntil; i++) {
      sim.setInput('p0', { mx: 0 });
      sim.step();
    }
    expect(sim.tick).toBeLessThan(p.netUntil);
    sim.enemies.delete(n.id);
    const x = p.x;
    steps(sim, 0.01);
    for (let i = 0; i < 10; i++) {
      sim.setInput('p0', { mx: -1 });
      sim.step();
    }
    const netted = x - p.x;
    p.netUntil = 0;
    const x2 = p.x;
    for (let i = 0; i < 10; i++) {
      sim.setInput('p0', { mx: -1 });
      sim.step();
    }
    expect(netted).toBeLessThan((x2 - p.x) * 0.6);
  });
});

describe('Suryakavach', () => {
  function gate(): { sim: Sim; b: Foe } {
    const sim = start();
    const fin = finalArena(sim.level);
    const p = sim.players.get('p0')!;
    p.x = fin.trigger + 40;
    p.y = fin.floor;
    p.invulnUntil = 1e9;
    sim.step();
    return { sim, b: [...sim.enemies.values()].find((e) => e.kind === 'suryakavach')! };
  }
  const hit = (sim: Sim, b: Foe): number => {
    const hp = b.hp;
    sim.bullets.push({
      id: 97_000 + sim.tick,
      enemy: false,
      owner: 'p0',
      kind: 'shot',
      x: b.body.x - b.body.w / 2 - 6,
      y: b.body.y - 40,
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
    return hp - b.hp;
  };

  it('stays rooted at the gate', () => {
    const { sim, b } = gate();
    const x = b.body.x;
    steps(sim, 5);
    expect(b.body.x).toBe(x);
  });

  it('no blow touches him while the sun shines; the eclipse opens him', () => {
    const { sim, b } = gate();
    expect(hit(sim, b)).toBe(0);
    for (let i = 0; i < sim.tickRate * (E.suryakavach.sunSec + 1) && sim.tick >= b.mx; i++) sim.step();
    expect(sim.tick).toBeLessThan(b.mx);
    expect(hit(sim, b)).toBeCloseTo(1, 5);
  });

  it('a soldier who throws the chakram brings the eclipse at once', () => {
    const { sim, b } = gate();
    const p = sim.players.get('p0')!;
    p.power = 'chakram';
    p.powerN = 1;
    expect(sim.tick).toBeGreaterThanOrEqual(b.mx);
    sim.setInput('p0', { astra: true });
    sim.step();
    expect(sim.tick).toBeLessThan(b.mx);
  });

  it('a mace blow, spears, and a call to the maharathis', () => {
    const { sim, b } = gate();
    const seen = new Set<number>();
    for (let i = 0; i < sim.tickRate * 12; i++) {
      sim.step();
      seen.add(b.atk);
    }
    expect(seen.has(ATTACK.mace) && seen.has(ATTACK.spears) && seen.has(ATTACK.rathis)).toBe(true);
  });
});

describe('Chakra Durg end to end', () => {
  it('a computer squad of 1 or 4 breaks through the bhanwarvyuh and beats Suryakavach', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-8' } });
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
