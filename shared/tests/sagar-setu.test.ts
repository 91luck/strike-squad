import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/** Sagar Setu (saga stage 2), a stage of its own: sinking stones, the tide, a boat, sea rakshasas, Chhaya. */
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-2' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'chhaya') sim.enemies.delete(e.id);
  return sim;
}
const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < Math.round(sec * sim.tickRate); i++) sim.step();
};
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;
const spawn = (sim: Sim, kind: string, x: number, y: number): Foe =>
  (sim as unknown as { spawnAwake: (k: string, x: number, y: number, a: number) => Foe }).spawnAwake(
    kind,
    x,
    y,
    -1,
  );
const shot = (sim: Sim, e: Foe, vx: number, oy?: number): number => {
  const hp = e.hp;
  sim.bullets.push({
    id: 97_000 + sim.tick,
    enemy: false,
    owner: 'p0',
    kind: 'shot',
    x: e.body.x - Math.sign(vx) * 4,
    y: e.body.y - e.body.h / 2,
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
    oy,
  });
  sim.step();
  return hp - e.hp;
};

describe('Sagar Setu layout', () => {
  const L = getMission('astra-2');
  it('is a stage of its own: no gates, no ambush arenas, floating stones, a boat, the tide, Chhaya at the end', () => {
    expect(L.own).toBe(true);
    expect(L.gates.filter((g) => !g.fire)).toHaveLength(0);
    expect(L.arenas.filter((a) => !a.boss)).toHaveLength(0);
    expect(L.plats.filter((p) => p.kind === 'stone').length).toBeGreaterThanOrEqual(6);
    expect(L.plats.filter((p) => p.kind === 'boat')).toHaveLength(1);
    expect(L.tide).not.toBeNull();
    expect(L.bosses.filter((b) => b.arena === finalArena(L).id).map((b) => b.kind)).toEqual(['chhaya']);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['makar', 'crab', 'conch']));
  });
});

describe('the sea', () => {
  it('a floating stone holds a soldier, sinks under them, and floats back once left', () => {
    const sim = start();
    const stone = sim.level.plats.findIndex((p) => p.kind === 'stone');
    const d = sim.level.plats[stone]!;
    const p = sim.players.get('p0')!;
    p.x = (d.x0 + d.x1) / 2;
    p.y = d.y - 40;
    p.invulnUntil = 1e9;
    steps(sim, 0.5);
    expect(p.onGround).toBe(true);
    expect(Math.abs(p.y - sim.plats[stone]!.y)).toBeLessThan(1);
    steps(sim, 3);
    expect(sim.plats[stone]!.y).toBeGreaterThan(d.y + 20);
    p.x = 3 * T;
    p.y = 10 * T;
    steps(sim, 4);
    expect(sim.plats[stone]!.y).toBeLessThan(d.y + 5);
  });

  it('the tide rises and falls, and jal holds it at its lowest', () => {
    const sim = start();
    const ys = new Set<number>();
    for (let i = 0; i < sim.tickRate * 9; i += 20) {
      steps(sim, 20 / sim.tickRate);
      ys.add(Math.round(sim.waterY()!));
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20);
    const p = sim.players.get('p0')!;
    p.power = 'jal';
    p.powerN = 2;
    sim.setInput('p0', { astra: true });
    sim.step();
    sim.setInput('p0', { astra: false });
    const t = sim.level.tide!;
    steps(sim, 2);
    expect(sim.waterY()).toBeCloseTo(t.base + t.amp, 5);
  });

  it('the boat sails a soldier across once boarded, and sails back for anyone left behind', () => {
    const sim = start();
    const i = sim.level.plats.findIndex((q) => q.kind === 'boat');
    const d = sim.level.plats[i]!;
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    p.x = d.x0 + 60;
    p.y = d.y - 30;
    steps(sim, (d.to - d.x0) / GAME_CONFIG.sea.boatSpeed + 1);
    expect(sim.plats[i]!.x0).toBeCloseTo(d.to, 0);
    expect(p.x).toBeGreaterThan(d.to);
    p.x = d.x1 + (d.to - d.x0) + 5 * T;
    p.y = d.y - 40;
    steps(sim, (d.to - d.x0) / GAME_CONFIG.sea.boatSpeed + 4);
    expect(sim.plats[i]!.x0).toBeCloseTo(d.x0, 0);
  });
});

describe('Sagar Setu rakshasas', () => {
  it("a crab's shell turns shots from the front; from behind they bite", () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const a = spawn(sim, 'crab', p.x + 200, p.y);
    a.body.facing = -1;
    const b = spawn(sim, 'crab', p.x + 500, p.y);
    b.body.facing = 1;
    expect(shot(sim, a, 400)).toBeCloseTo(E.crab.front, 5);
    expect(shot(sim, b, 400)).toBeCloseTo(E.crab.back, 5);
  });

  it('a makara rider leaps out of the sea across a soldier who comes near', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const m = spawn(sim, 'makar', p.x + 120, 15 * T);
    m.nextFire = 0;
    let top = Infinity;
    for (let i = 0; i < sim.tickRate * 2; i++) {
      sim.step();
      top = Math.min(top, m.body.y);
    }
    expect(top).toBeLessThan(sim.waterY()! - 120);
  });

  it('a conch blower sends a surge along the ground', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const c = spawn(sim, 'conch', p.x + 250, p.y);
    c.nextFire = 0;
    sim.step();
    sim.step();
    expect(sim.bullets.some((b) => b.enemy && b.kind === 'wave')).toBe(true);
  });
});

describe('Chhaya', () => {
  function shore(): { sim: Sim; boss: Foe } {
    const sim = start(2);
    const fin = finalArena(sim.level);
    for (const p of sim.players.values()) {
      p.x = fin.trigger + 40;
      p.y = fin.floor;
      p.invulnUntil = 1e9;
    }
    steps(sim, 0.2);
    return { sim, boss: [...sim.enemies.values()].find((e) => e.kind === 'chhaya')! };
  }

  it("grabs where a soldier's shadow lies, and only hurts properly while her jaws hang open after", () => {
    const { sim, boss } = shore();
    const seen = new Set<number>();
    let opened = false;
    for (let i = 0; i < sim.tickRate * 14; i++) {
      sim.step();
      seen.add(boss.atk);
      if (sim.tick < boss.mx) opened = true;
    }
    expect(seen.has(ATTACK.grab) && seen.has(ATTACK.surge) && seen.has(ATTACK.spit)).toBe(true);
    expect(opened).toBe(true);
    boss.mx = 0;
    expect(shot(sim, boss, 300)).toBeCloseTo(E.chhaya.shut, 5);
    boss.mx = sim.tick + 100;
    expect(shot(sim, boss, 300)).toBeCloseTo(1, 5);
  });

  it('a soldier standing on the mark when the hand comes up is hurt; one who moved off is not', () => {
    const { sim, boss } = shore();
    const [a, b] = [...sim.players.values()];
    a!.invulnUntil = 0;
    b!.invulnUntil = 0;
    boss.atk = ATTACK.grab;
    boss.atkStart = sim.tick;
    boss.atkParam = a!.x;
    b!.x = a!.x - 6 * T;
    const ha = a!.hp;
    const hb = b!.hp;
    for (let i = 0; i < sim.tickRate * 1.6; i++) {
      a!.x = boss.atkParam; // stand on the mark
      sim.step();
    }
    expect(a!.hp).toBeLessThan(ha);
    expect(b!.hp).toBe(hb);
  });
});

describe('Sagar Setu end to end', () => {
  it('a computer squad of 1 or 4 crosses the sea and beats Chhaya', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-2' } });
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
