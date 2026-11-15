import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/** Maya Nagri (saga stage 5), a stage of its own: illusions, MAYASTRA, and the mirror that fights back. */
const E = GAME_CONFIG.enemies;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-5' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'darpan') sim.enemies.delete(e.id);
  return sim;
}
const cast = (sim: Sim, kind: 'maya'): void => {
  const p = sim.players.get('p0')!;
  p.power = kind;
  p.powerN = 2;
  sim.setInput('p0', { astra: true });
  sim.step();
  sim.setInput('p0', { astra: false });
};

describe('Maya Nagri layout', () => {
  const L = getMission('astra-5');
  it('has false floors and hidden floors, its own rakshasas, and Darpan-asur at the end', () => {
    expect(L.own).toBe(true);
    expect(L.plats.some((p) => p.kind === 'fake') && L.plats.some((p) => p.kind === 'hidden')).toBe(true);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['mirror', 'dancer', 'painting']));
    expect(L.bosses.filter((b) => b.arena === finalArena(L).id).map((b) => b.kind)).toEqual(['darpan']);
    expect(L.pickups.some((p) => p.kind === 'maya')).toBe(true);
  });
});

describe('illusions', () => {
  it('a false floor gives way under a soldier; a hidden one holds; MAYASTRA makes the false ones hold', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    const fake = sim.level.plats.findIndex((q) => q.kind === 'fake');
    const hidden = sim.level.plats.findIndex((q) => q.kind === 'hidden');
    const stand = (i: number, sec: number): void => {
      const d = sim.level.plats[i]!;
      p.x = (d.x0 + d.x1) / 2;
      p.y = d.y - 4;
      p.vy = 0;
      for (let n = 0; n < sec * sim.tickRate; n++) sim.step();
    };
    stand(hidden, 1);
    expect(sim.plats[hidden]!.on).toBe(true);
    expect(p.onGround).toBe(true);
    stand(fake, 0.6);
    expect(sim.plats[fake]!.on).toBe(false);
    for (let n = 0; n < sim.tickRate * 4; n++) sim.step();
    expect(sim.plats[fake]!.on).toBe(true);
    cast(sim, 'maya');
    stand(fake, 1.5);
    expect(sim.plats[fake]!.on).toBe(true);
  });
});

describe('Darpan-asur', () => {
  it('turns shots back while it shines; breaks only when dull (after its show, or dulled by MAYASTRA)', () => {
    const sim = start(2);
    const fin = finalArena(sim.level);
    for (const p of sim.players.values()) {
      p.x = fin.trigger + 40;
      p.y = fin.floor;
      p.invulnUntil = 1e9;
    }
    sim.step();
    const d = [...sim.enemies.values()].find((e) => e.kind === 'darpan')!;
    const shoot = (): { dmg: number; back: boolean } => {
      const hp = d.hp;
      const id = 95_000 + sim.tick;
      sim.bullets.push({
        id,
        enemy: false,
        owner: 'p0',
        kind: 'shot',
        x: d.body.x - d.body.w / 2 - 4,
        y: d.body.y - 100,
        vx: 300,
        vy: 0,
        dmg: 1,
        pierce: false,
        expires: sim.tick + 20,
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
      const b = sim.bullets.find((x) => x.id === id);
      return { dmg: hp - d.hp, back: !!b && b.enemy && b.vx < 0 };
    };
    d.mx = 0;
    const shine = shoot();
    expect(shine.dmg).toBe(0);
    expect(shine.back).toBe(true);
    cast(sim, 'maya');
    expect(d.mx).toBeGreaterThan(sim.tick);
    expect(shoot().dmg).toBeCloseTo(1, 5);
    const seen = new Set<number>();
    for (let i = 0; i < sim.tickRate * 14; i++) {
      sim.step();
      seen.add(d.atk);
    }
    expect(seen.has(ATTACK.beam) && seen.has(ATTACK.shards) && seen.has(ATTACK.show)).toBe(true);
    void E;
  });
});

describe('Maya Nagri end to end', () => {
  it('a computer squad of 1 or 4 gets through the hall and breaks the mirror', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-5' } });
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
