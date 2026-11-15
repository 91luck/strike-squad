import { describe, expect, it } from 'vitest';
import { ATTACK, Autopilot, GAME_CONFIG, Sim, finalArena, getMission } from '../src';

/** Samarpan Maidan (saga stage 7), a stage of its own: archers, war elephants, drummers, a chariot, Maniyodha. */
const T = GAME_CONFIG.tile;
const E = GAME_CONFIG.enemies;
type Foe = NonNullable<ReturnType<Sim['enemies']['get']>>;

function start(players = 1): Sim {
  const sim = new Sim({ seed: 3, settings: { difficulty: 'normal', mission: 'astra-7' } });
  for (let i = 0; i < players; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: 0 });
  while (sim.phase === 'countdown') sim.step();
  for (const e of [...sim.enemies.values()]) if (e.kind !== 'maniyodha') sim.enemies.delete(e.id);
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

describe('Samarpan Maidan layout', () => {
  const L = getMission('astra-7');
  it('no gates, no ambush arenas; its own rakshasas; a chariot; Maniyodha with samarpanastra at the end', () => {
    expect(L.own).toBe(true);
    expect(L.gates).toHaveLength(0);
    expect(L.arenas.filter((a) => !a.boss)).toHaveLength(0);
    expect(new Set(L.enemies.map((e) => e.kind))).toEqual(new Set(['archer', 'elephant', 'drummer']));
    expect(L.plats.filter((p) => p.kind === 'chariot')).toHaveLength(1);
    const fin = finalArena(L);
    expect(L.bosses.filter((b) => b.arena === fin.id).map((b) => b.kind)).toEqual(['maniyodha']);
    expect(fin.rules).toContain('samarpan');
  });
});

describe('Samarpan Maidan', () => {
  it('the chariot carries a soldier who boards it over the trenches to the far side', () => {
    const sim = start();
    const d = sim.level.plats.find((q) => q.kind === 'chariot')!;
    const p = sim.players.get('p0')!;
    p.x = (d.x0 + d.x1) / 2;
    p.y = d.y;
    p.vy = 0;
    p.invulnUntil = 1e9;
    steps(sim, (d.to - d.x0) / GAME_CONFIG.sea.boatSpeed + 2);
    expect(p.x).toBeGreaterThan(d.to);
    expect(p.y).toBeLessThanOrEqual(d.y + 1);
  });

  it('an archer lofts a volley of arrows that come down around the soldier', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const a = spawn(sim, 'archer', p.x + 400, p.y);
    a.nextFire = 0;
    sim.step();
    const arrows = sim.bullets.filter((b) => b.enemy && b.kind === 'arrow');
    expect(arrows).toHaveLength(E.archer.arrows);
    expect(arrows.every((b) => b.grav > 0 && b.vy < 0)).toBe(true);
  });

  it('a war elephant trumpets, then charges and tramples a soldier standing in its way', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    const g = spawn(sim, 'elephant', p.x + 300, p.y);
    g.nextFire = 0;
    const hp = p.hp;
    let trumpeted = false;
    let charged = false;
    for (let i = 0; i < sim.tickRate * 3; i++) {
      sim.setInput('p0', { mx: 0 });
      sim.step();
      if (g.burst === 1) trumpeted = true;
      if (g.burst === 2) charged = true;
    }
    expect(trumpeted && charged).toBe(true);
    expect(hp - p.hp).toBeGreaterThan(E.contactDmg * 1.2);
  });

  it('a war drummer hurries the foes near it', () => {
    const sim = start();
    const p = sim.players.get('p0')!;
    const a = spawn(sim, 'archer', p.x + 500, p.y);
    const d = spawn(sim, 'drummer', p.x + 560, p.y);
    a.nextFire = sim.tick + 1000;
    d.nextFire = 0;
    sim.step();
    expect(a.nextFire).toBeLessThan(sim.tick + 10);
  });
});

describe('Maniyodha', () => {
  function field(n = 1): { sim: Sim; b: Foe } {
    const sim = start(n);
    const fin = finalArena(sim.level);
    for (const p of sim.players.values()) {
      p.x = fin.trigger + 40;
      p.y = fin.floor;
      p.invulnUntil = 1e9;
    }
    sim.step();
    return { sim, b: [...sim.enemies.values()].find((e) => e.kind === 'maniyodha')! };
  }

  it('looses fans of arrows and an agnibaan arrow, and cuts at a soldier who comes close', () => {
    const { sim, b } = field();
    b.rule = null; // (its samarpanastra is the next test)
    const seen = new Set<number>();
    const p = sim.players.get('p0')!;
    for (let i = 0; i < sim.tickRate * 12; i++) {
      sim.setInput('p0', { mx: 0 });
      sim.step();
      if (i === sim.tickRate * 8) p.x = b.body.x - 120;
      seen.add(b.atk);
    }
    expect(seen.has(ATTACK.fan)).toBe(true);
    expect(seen.has(ATTACK.agnibaan)).toBe(true);
    expect(seen.has(ATTACK.cleave)).toBe(true);
  });

  it('calls samarpanastra, and a squad that lays down its weapons takes no arrows', () => {
    const { sim, b } = field();
    const p = sim.players.get('p0')!;
    p.invulnUntil = 0;
    let stormed = false;
    for (let i = 0; i < sim.tickRate * 20 && !stormed; i++) {
      p.x = b.body.x - 500;
      sim.setInput('p0', { mx: 0, fire: false });
      sim.step();
      if (b.rule?.storm) stormed = true;
    }
    expect(stormed).toBe(true);
    for (let i = 0; i < sim.tickRate * 3; i++) {
      sim.setInput('p0', { mx: 0, fire: false });
      sim.step();
    }
    expect(sim.bullets.filter((q) => q.enemy && q.kind === 'arrow' && q.y < 0)).toHaveLength(0);
  });
});

describe('Samarpan Maidan end to end', () => {
  it('a computer squad of 1 or 4 crosses the field and beats Maniyodha', () => {
    for (const n of [1, 4]) {
      const sim = new Sim({ seed: 7, settings: { difficulty: 'normal', mission: 'astra-7' } });
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
void T;
