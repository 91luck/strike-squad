import { describe, expect, it } from 'vitest';
import { ATTACK, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/**
 * Agnivan (saga stage 1), rebuilt as a stage of its own: a wall of fire chasing the squad instead of ambush
 * arenas behind gates, its own three rakshasas, and its own boss, the Jwala Vriksh-asur.
 */
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-1' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  return sim;
}
const steps = (sim: Sim, sec: number): void => {
  for (let i = 0; i < Math.round(sec * sim.tickRate); i++) sim.step();
};
/** The sim's private spawner, for setting up a scene. */
const spawn = (sim: Sim) =>
  sim as unknown as {
    spawnAwake: (
      kind: string,
      x: number,
      y: number,
      arena: number,
    ) => ReturnType<Sim['enemies']['get']> & object;
  };
/** Clears every enemy so a test watches one thing at a time. */
const quiet = (sim: Sim): void => {
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'vriksha') sim.enemies.delete(e.id);
};

describe('Agnivan layout', () => {
  const L = getMission('astra-1');
  it('has no gates but its stream-bed fire wall, no ambush arenas, and ends in the banyan grove', () => {
    expect(L.chase).toBe(true);
    expect(L.gates.filter((g) => !g.fire)).toHaveLength(0);
    expect(L.arenas.filter((a) => !a.boss)).toHaveLength(0);
    const fin = finalArena(L);
    expect(L.bosses.filter((b) => b.arena === fin.id).map((b) => b.kind)).toEqual(['vriksha']);
  });
  it('fields its own rakshasas and none of the classic troopers', () => {
    const kinds = new Set(L.enemies.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['bat', 'imp', 'treant']);
  });
});

describe('the wall of fire', () => {
  it('starts after a calm opening, then follows the squad and never falls far behind', () => {
    const sim = start();
    quiet(sim);
    expect(sim.chaseOn).toBe(false);
    steps(sim, GAME_CONFIG.chase.delaySec + 0.2);
    expect(sim.chaseOn).toBe(true);
    const p = sim.players.get('p0')!;
    // teleport far ahead: the fire closes up to its maximum lag at once
    p.x = 60 * T;
    p.y = 6 * T;
    steps(sim, 0.1);
    expect(p.x - sim.chaseX).toBeLessThanOrEqual(GAME_CONFIG.chase.maxLag + 10);
  });

  it('burns a soldier who stands still, and throws one caught inside it forward', () => {
    const sim = start();
    quiet(sim);
    steps(sim, GAME_CONFIG.chase.delaySec + 0.2);
    const p = sim.players.get('p0')!;
    const hp = p.hp;
    steps(sim, 14);
    expect(p.hp < hp || p.state === 'dead').toBe(true);
    if (p.state === 'alive') expect(p.x).toBeGreaterThan(sim.chaseX - 30);
  });

  it('waits outside the river rest stop until the squad has gone through', () => {
    const sim = start();
    quiet(sim);
    steps(sim, GAME_CONFIG.chase.delaySec + 0.2);
    const r = sim.level.rests[0]!;
    const p = sim.players.get('p0')!;
    p.x = (r.x0 + r.x1) / 2;
    p.y = 6 * T;
    steps(sim, 20);
    expect(sim.chaseX).toBeLessThanOrEqual(r.x0 - 3 * T);
    expect(p.hp).toBeGreaterThan(0);
  });

  it('swallows foes it reaches', () => {
    const sim = start();
    steps(sim, GAME_CONFIG.chase.delaySec + 0.2);
    const behind = [...sim.enemies.values()].filter(
      (e) => e.body.x < sim.chaseX + 200 && e.kind !== 'vriksha',
    );
    sim.chaseX = Math.max(...behind.map((e) => e.body.x), sim.chaseX) + 20;
    steps(sim, 0.1);
    for (const e of behind) expect(sim.enemies.has(e.id)).toBe(false);
  });
});

describe('Agnivan rakshasas', () => {
  it('a fire imp runs in, leaps and bursts on the soldier', () => {
    const sim = start();
    quiet(sim);
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    const imp = spawn(sim).spawnAwake('imp', p.x + 260, p.y, -1);
    imp.nextFire = 0;
    const hp = p.hp;
    let leapt = false;
    for (let i = 0; i < sim.tickRate * 4 && sim.enemies.has(imp.id); i++) {
      sim.step();
      if (imp.burst === 1) leapt = true;
    }
    expect(leapt).toBe(true);
    expect(sim.enemies.has(imp.id)).toBe(false);
    expect(p.hp).toBeLessThan(hp);
  });

  it('a burning bat dives across the squad dropping embers', () => {
    const sim = start();
    quiet(sim);
    const p = sim.players.get('p0')!;
    const bat = spawn(sim).spawnAwake('bat', p.x + 200, p.y - 160, -1);
    bat.nextFire = 0;
    let dived = false;
    let embers = 0;
    for (let i = 0; i < sim.tickRate * 4; i++) {
      const before = sim.bullets.filter((b) => b.enemy).length;
      sim.step();
      if (bat.burst === 1) dived = true;
      embers += Math.max(0, sim.bullets.filter((b) => b.enemy).length - before);
    }
    expect(dived).toBe(true);
    expect(embers).toBeGreaterThan(3);
  });

  it("a tree demon's bark turns shots from the front; from behind they bite", () => {
    const sim = start();
    quiet(sim);
    const p = sim.players.get('p0')!;
    const front = spawn(sim).spawnAwake('treant', p.x + 200, p.y, -1);
    front.body.facing = -1;
    const back = spawn(sim).spawnAwake('treant', p.x + 500, p.y, -1);
    back.body.facing = 1;
    const shot = (e: typeof front, vx: number): number => {
      const hp = e.hp;
      sim.bullets.push({
        id: 99_000 + e.id,
        enemy: false,
        owner: 'p0',
        kind: 'shot',
        x: e.body.x,
        y: e.body.y - 20,
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
      sim.step();
      return hp - e.hp;
    };
    expect(shot(front, 400)).toBeCloseTo(E.treant.front, 5);
    expect(shot(back, 400)).toBeCloseTo(E.treant.back, 5);
  });
});

describe('Jwala Vriksh-asur', () => {
  function grove(): { sim: Sim; boss: ReturnType<Sim['enemies']['get']> & object } {
    const sim = start(2);
    quiet(sim);
    const fin = finalArena(sim.level);
    for (const p of sim.players.values()) {
      p.x = fin.trigger + 40;
      p.y = fin.floor;
      p.invulnUntil = 1e9;
    }
    steps(sim, 0.2);
    const boss = [...sim.enemies.values()].find((e) => e.kind === 'vriksha')!;
    return { sim, boss };
  }

  it('wakes when the squad enters, and the fire becomes the back wall of the grove', () => {
    const { sim, boss } = grove();
    expect(boss.awake).toBe(true);
    steps(sim, GAME_CONFIG.chase.delaySec + 4);
    const fin = finalArena(sim.level);
    expect(sim.chaseX).toBeLessThanOrEqual(fin.left + T);
  });

  it('goes round roots, burning fruit and fire breath', () => {
    const { sim, boss } = grove();
    const seen = new Set<number>();
    for (let i = 0; i < sim.tickRate * 14; i++) {
      sim.step();
      seen.add(boss.atk);
    }
    expect(seen.has(ATTACK.roots)).toBe(true);
    expect(seen.has(ATTACK.fruit)).toBe(true);
    expect(seen.has(ATTACK.breath)).toBe(true);
  });

  it('in phase 2 its heart only feels shots fired from up in its boughs', () => {
    const { sim, boss } = grove();
    boss.hp = boss.maxHp * 0.4;
    sim.step();
    expect(boss.phase).toBe(2);
    const hit = (oy: number): number => {
      const hp = boss.hp;
      sim.bullets.push({
        id: 98_000 + Math.round(oy),
        enemy: false,
        owner: 'p0',
        kind: 'shot',
        x: boss.body.x - boss.body.w / 2 + 10,
        y: boss.body.y - 200,
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
        oy,
      });
      sim.step();
      return hp - boss.hp;
    };
    expect(hit(boss.body.y)).toBeCloseTo(E.vriksha.barkDamage, 5);
    expect(hit(boss.body.y - E.vriksha.heartRise - 40)).toBeCloseTo(1, 5);
  });
});

describe('Agnivan end to end', () => {
  it('a computer squad of 1, 2 or 4 runs the burning forest and fells the banyan', async () => {
    const { Autopilot } = await import('../src');
    for (const n of [1, 2, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-1' } });
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
