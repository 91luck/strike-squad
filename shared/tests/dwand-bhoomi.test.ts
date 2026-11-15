import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/** Dwand Bhoomi (saga stage 9), a stage of its own: mud, wrestlers, mace spinners, slingers; Jodasur. */
const E = GAME_CONFIG.enemies;
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-9' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'jodasur') sim.enemies.delete(e.id);
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
const shot = (sim: Sim, x: number, y: number, vx: number): void => {
  sim.bullets.push({
    id: 96_000 + sim.tick * 3 + (vx > 0 ? 1 : 0),
    enemy: false,
    owner: 'p0',
    kind: 'shot',
    x,
    y,
    vx,
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
};

describe('Dwand Bhoomi layout', () => {
  const L = getMission('astra-9');
  it('akhadas of mud, its own rakshasas, and Jodasur at the end', () => {
    expect(L.own).toBe(true);
    expect(L.gates.filter((g) => !g.fire)).toHaveLength(0);
    expect(L.arenas.filter((a) => !a.boss)).toHaveLength(0);
    expect(L.fields.filter((f) => f.kind === 'mud').length).toBeGreaterThanOrEqual(2);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['pehlwan', 'gadadhar', 'slinger']));
    expect(L.bosses.filter((b) => b.arena === finalArena(L).id).map((b) => b.kind)).toEqual(['jodasur']);
  });
});

describe('Dwand Bhoomi', () => {
  it('the mud slows a soldier', () => {
    const sim = start();
    const f = sim.level.fields.find((q) => q.kind === 'mud')!;
    const p = sim.players.get('p0')!;
    const run = (x: number): number => {
      p.x = x;
      p.y = 14 * GAME_CONFIG.tile;
      steps(sim, 0.2);
      const x0 = p.x;
      for (let i = 0; i < 15; i++) {
        sim.setInput('p0', { mx: 1 });
        sim.step();
      }
      return p.x - x0;
    };
    const inMud = run(f.x0 + 3 * GAME_CONFIG.tile);
    const dry = run(4 * GAME_CONFIG.tile);
    expect(inMud).toBeLessThan(dry * 0.75);
  });

  it('a wrestler grabs a soldier, squeezes, and throws them; shooting it breaks the hold', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    const w = spawn(sim, 'pehlwan', p.x + 10, p.y);
    w.nextFire = 0;
    let grabbed = false;
    for (let i = 0; i < sim.tickRate * 0.5 && !grabbed; i++) {
      sim.step();
      if (w.burst === 1) grabbed = true;
    }
    expect(grabbed).toBe(true);
    const hp = p.hp;
    steps(sim, E.pehlwan.holdSec + 0.2);
    expect(p.hp).toBeLessThan(hp);
    expect(w.burst).toBe(0);
    // grabbed again, and shot free
    w.nextFire = 0;
    p.x = w.body.x;
    p.y = w.body.y;
    p.vx = p.vy = 0;
    p.invulnUntil = 0;
    for (let i = 0; i < 10 && w.burst !== 1; i++) sim.step();
    expect(w.burst).toBe(1);
    for (let i = 0; i < 4 && w.burst === 1; i++) {
      shot(sim, w.body.x - 30, w.body.y - 30, 400);
      sim.step();
    }
    expect(w.burst).toBe(0);
  });

  it('a mace spinner turns shots while it spins, and takes double while dizzy', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    const g = spawn(sim, 'gadadhar', p.x + 200, p.y);
    g.nextFire = 0;
    sim.step();
    expect(g.burst).toBe(1);
    const hp = g.hp;
    shot(sim, g.body.x - 8, g.body.y - 20, 400);
    sim.step();
    sim.step();
    expect(g.hp).toBe(hp);
    for (let i = 0; i < sim.tickRate * 3 && g.burst !== 2; i++) sim.step();
    expect(g.burst).toBe(2);
    shot(sim, g.body.x - 8, g.body.y - 20, 400);
    sim.step();
    sim.step();
    expect(hp - g.hp).toBeGreaterThan(1.5);
  });
});

describe('Jodasur', () => {
  function akhada(): { sim: Sim; b: Foe } {
    const sim = start();
    const fin = finalArena(sim.level);
    const p = sim.players.get('p0')!;
    p.x = fin.trigger + 40;
    p.y = fin.floor;
    p.invulnUntil = 1e9;
    sim.step();
    const b = [...sim.enemies.values()].find((e) => e.kind === 'jodasur')!;
    b.rule = null;
    return { sim, b };
  }
  const fell = (sim: Sim, b: Foe): void =>
    (
      sim as unknown as {
        damageEnemy: (e: Foe, d: number, by: string, x: number, y: number, s: string) => void;
      }
    ).damageEnemy(b, b.hp + 1, 'p0', b.body.x, b.body.y, 'gun');

  it('hurls boulders, pounces and charges', () => {
    const { sim, b } = akhada();
    const seen = new Set<number>();
    for (let i = 0; i < sim.tickRate * 14; i++) {
      sim.step();
      seen.add(b.atk);
    }
    expect(seen.has(ATTACK.hurl) && seen.has(ATTACK.pounce) && seen.has(ATTACK.bull)).toBe(true);
  });

  it('brought down, he splits in two; left alone the halves crawl back together and he stands again', () => {
    const { sim, b } = akhada();
    fell(sim, b);
    expect(sim.enemies.has(b.id)).toBe(true);
    expect(b.burst).toBe(1);
    expect([...sim.enemies.values()].filter((e) => e.kind === 'ardh')).toHaveLength(2);
    for (let i = 0; i < sim.tickRate * 10 && b.burst === 1; i++) sim.step();
    expect(b.burst).toBe(0);
    expect(b.hp).toBeCloseTo(b.maxHp * E.jodasur.rejoin, 3);
  });

  it('shots push the halves the way they fly; pushed far enough apart, he is finished', () => {
    const { sim, b } = akhada();
    fell(sim, b);
    const [h1, h2] = [...sim.enemies.values()].filter((e) => e.kind === 'ardh') as [Foe, Foe];
    const [l, r] = h1.body.x < h2.body.x ? [h1, h2] : [h2, h1];
    const x = l.body.x;
    for (let i = 0; i < sim.tickRate * 8 && sim.phase !== 'ended' && sim.enemies.has(b.id); i++) {
      if (sim.enemies.has(l.id)) shot(sim, l.body.x + 30, l.body.y - 20, -400);
      if (sim.enemies.has(r.id)) shot(sim, r.body.x - 30, r.body.y - 20, 400);
      sim.step();
      if (i === 5) expect(l.body.x).toBeLessThan(x);
    }
    expect(sim.enemies.has(b.id)).toBe(false);
  });

  it('a half lying inside the space Jodasur stood in still takes the shot (the empty space does not swallow it)', () => {
    const { sim, b } = akhada();
    fell(sim, b);
    const half = [...sim.enemies.values()].find((e) => e.kind === 'ardh') as Foe;
    // put the half right where his body was, and shoot it from beside
    half.body.x = b.body.x;
    const x = half.body.x;
    shot(sim, x - 30, half.body.y - 20, 400);
    sim.step();
    expect(half.body.x).toBeGreaterThan(x);
  });

  it('kept apart long enough, the halves tire: their crawl slows', () => {
    const { sim, b } = akhada();
    fell(sim, b);
    const half = [...sim.enemies.values()].find((e) => e.kind === 'ardh') as Foe;
    const speed = (): number => {
      half.nextFire = 0;
      const x0 = half.body.x;
      sim.step();
      return Math.abs(half.body.x - x0);
    };
    const early = speed();
    half.atkStart -= sim.ticks(60);
    const late = speed();
    expect(late).toBeLessThan(early * 0.5);
  });
});

describe('Dwand Bhoomi end to end', () => {
  it('a computer squad of 1 or 4 wins the duels and finishes Jodasur', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-9' } });
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
