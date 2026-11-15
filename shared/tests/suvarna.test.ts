import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/** Suvarna (saga stage 10), a stage of its own: Meghbaan's arrows, Nidrasur asleep, Hansvimaan, Saptashir's seven heads. */
const E = GAME_CONFIG.enemies;
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-10' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'saptashir') sim.enemies.delete(e.id);
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
const dmg = (sim: Sim, e: Foe, d: number): void =>
  (
    sim as unknown as {
      damageEnemy: (e: Foe, d: number, by: string, x: number, y: number, s: string) => void;
    }
  ).damageEnemy(e, d, 'p0', e.body.x, e.body.y - 50, 'gun');

describe('Suvarna layout', () => {
  const L = getMission('astra-10');
  it("burning Suvarna: Meghbaan's arrows, its own rakshasas, Hansvimaan, and Saptashir with pralay", () => {
    expect(L.own && L.megh).toBe(true);
    expect(L.gates).toHaveLength(0);
    expect(L.arenas.filter((a) => !a.boss)).toHaveLength(0);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['mashaal', 'mayavi', 'nidrasur']));
    expect(L.plats.filter((p) => p.kind === 'vimana')).toHaveLength(1);
    const fin = finalArena(L);
    expect(L.bosses.filter((b) => b.arena === fin.id).map((b) => b.kind)).toEqual(['saptashir']);
    expect(fin.rules).toContain('pralay');
  });
});

describe('Suvarna', () => {
  it('Meghbaan marks the ground under a soldier, then his arrows come down there', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    for (let i = 0; i < sim.tickRate * 10 && sim.meghAt <= sim.tick; i++) sim.step();
    expect(sim.meghAt).toBeGreaterThan(sim.tick);
    expect(Math.abs(sim.meghX - p.x)).toBeLessThan(80);
    for (let i = 0; i < sim.tickRate * 2 && sim.meghAt > 0; i++) sim.step();
    expect(sim.bullets.filter((b) => b.enemy && b.kind === 'arrow').length).toBe(GAME_CONFIG.megh.arrows);
  });

  it("Meghbaan's warrior is untouchable until it shows itself to shoot", () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    const m = spawn(sim, 'mayavi', p.x + 200, p.y - 160);
    m.nextFire = sim.tick + 1000;
    const hp = m.hp;
    sim.bullets.push({
      id: 95_000,
      enemy: false,
      owner: 'p0',
      kind: 'shot',
      x: m.body.x - 6,
      y: m.body.y - 10,
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
    sim.step();
    expect(m.hp).toBe(hp);
    m.nextFire = 0;
    sim.step();
    expect(sim.tick).toBeLessThan(m.mx);
    sim.bullets.push({
      id: 95_001,
      enemy: false,
      owner: 'p0',
      kind: 'shot',
      x: m.body.x - 6,
      y: m.body.y - 10,
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
    sim.step();
    expect(m.hp).toBeLessThan(hp);
  });

  it('Nidrasur sleeps through a quiet crossing, and wakes to gunfire near him', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 1e9;
    const k = spawn(sim, 'nidrasur', p.x + 300, p.y);
    for (let i = 0; i < sim.tickRate * 3; i++) {
      sim.setInput('p0', { mx: 0, fire: false });
      sim.step();
    }
    expect(k.burst).toBe(0);
    for (let i = 0; i < sim.tickRate * 3 && k.burst === 0; i++) {
      sim.setInput('p0', { mx: 0, fire: true });
      sim.step();
    }
    expect(k.burst).toBe(1);
  });

  it('Hansvimaan flies a soldier aboard across the drop', () => {
    const sim = start();
    const d = sim.level.plats.find((q) => q.kind === 'vimana')!;
    const p = sim.players.get('p0')!;
    p.x = (d.x0 + d.x1) / 2;
    p.y = d.y;
    p.vy = 0;
    p.invulnUntil = 1e9;
    sim.meghAt = 0;
    steps(sim, (d.to - d.x0) / GAME_CONFIG.sea.boatSpeed + 2);
    expect(p.x).toBeGreaterThan(d.to);
  });
});

describe('Saptashir', () => {
  function court(): { sim: Sim; b: Foe } {
    const sim = start();
    const fin = finalArena(sim.level);
    const p = sim.players.get('p0')!;
    p.x = fin.trigger + 40;
    p.y = fin.floor;
    p.invulnUntil = 1e9;
    sim.step();
    const b = [...sim.enemies.values()].find((e) => e.kind === 'saptashir')!;
    return { sim, b };
  }

  it('wakes with seven heads; they take the blows, and cut heads grow back', () => {
    const { sim, b } = court();
    expect(b.my).toBe(E.saptashir.heads);
    const hp = b.hp;
    dmg(sim, b, E.saptashir.headHp * 3);
    expect(b.my).toBe(E.saptashir.heads - 3);
    expect(hp - b.hp).toBeCloseTo(E.saptashir.headHp * 3 * E.saptashir.guarded, 3);
    steps(sim, (E.saptashir.regrowSec[0] as number) + 0.1);
    expect(b.my).toBe(E.saptashir.heads - 2);
  });

  it('with every head cut, his body takes the full blow', () => {
    const { sim, b } = court();
    dmg(sim, b, E.saptashir.headHp * E.saptashir.heads);
    expect(b.my).toBe(0);
    const hp = b.hp;
    dmg(sim, b, 5);
    expect(hp - b.hp).toBeCloseTo(5, 3);
  });

  it('fire from his mouths, Moonblade, and burning stones', () => {
    const { sim, b } = court();
    b.rule = null;
    const seen = new Set<number>();
    for (let i = 0; i < sim.tickRate * 10; i++) {
      sim.step();
      seen.add(b.atk);
    }
    expect(seen.has(ATTACK.tenfire) && seen.has(ATTACK.moonblade) && seen.has(ATTACK.meteors)).toBe(true);
  });
});

describe('Suvarna end to end', () => {
  it('a computer squad of 1 or 4 crosses burning Suvarna and defeats Saptashir', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-10' } });
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
