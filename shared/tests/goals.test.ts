import { describe, expect, it } from 'vitest';
import { Autopilot, GOAL_HOLD_WALL, SAGA, SAGA_GOALS, Sim, type SagaId } from '../src';

/** Stage goals: each saga stage asks something of its own (Sim stage goals). */
function run(id: SagaId, n: number, seed = 5): { sim: Sim; events: string[]; heldShut: boolean } {
  const sim = new Sim({ seed, settings: { difficulty: 'normal', mission: id } });
  const bots = new Autopilot(1);
  for (let i = 0; i < n; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
  const events: string[] = [];
  let heldShut = false;
  for (let t = 0; sim.phase !== 'ended' && t < sim.tickRate * 600; t++) {
    for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
    sim.step();
    const z = sim.snapshot().gl?.z;
    if (z && sim.world.limitX <= z[0] + GOAL_HOLD_WALL + 0.5) heldShut = true;
    for (const ev of sim.drainEvents()) if (ev.e === 'goal') events.push(ev.k);
  }
  return { sim, events, heldShut };
}

describe('stage goals', () => {
  it('every saga stage has one, of four different kinds across the saga, shown in the snapshot', () => {
    const kinds = new Set<string>();
    for (const st of SAGA) {
      const g = SAGA_GOALS[st.id];
      expect(g, st.id).toBeDefined();
      kinds.add(g?.kind ?? '');
      const sim = new Sim({ seed: 1, settings: { difficulty: 'normal', mission: st.id } });
      sim.addPlayer({ id: 'p', name: 'P', slot: 0, hero: 0 });
      expect(sim.snapshot().gl?.k).toBe(g?.kind);
    }
    expect(kinds.size).toBe(4);
  });

  it('rescue: captives appear along the way and a passing squad frees them', () => {
    const { sim, events } = run('astra-1', 1);
    expect(sim.result).toBe('won');
    expect(events.filter((e) => e === 'item').length).toBe(4);
    expect(sim.goalState()?.status).toBe(1);
  });

  it('hold: the way on stays shut until the spot is held, then it is done', () => {
    for (const id of ['astra-6', 'astra-7'] as SagaId[]) {
      const { sim, events, heldShut } = run(id, 2);
      expect(sim.result, id).toBe('won');
      expect(heldShut, id).toBe(true);
      expect(events, id).toContain('done');
    }
  });

  it('race: a quick squad beats the clock; a squad standing still runs out of time', () => {
    const { sim, events } = run('astra-2', 1);
    expect(sim.result).toBe('won');
    expect(events).toContain('done');
    const idle = new Sim({ seed: 5, settings: { difficulty: 'normal', mission: 'astra-9' } });
    idle.addPlayer({ id: 'p', name: 'P', slot: 0, hero: 0 });
    const got: string[] = [];
    for (let t = 0; t < idle.tickRate * 200 && idle.phase !== 'ended'; t++) {
      idle.step();
      for (const ev of idle.drainEvents()) if (ev.e === 'goal') got.push(ev.k);
    }
    expect(got).toContain('fail');
  });

  it('targets: shots break them, and breaking them all completes the goal', () => {
    const sim = new Sim({ seed: 5, settings: { difficulty: 'normal', mission: 'astra-3' } });
    sim.addPlayer({ id: 'p', name: 'P', slot: 0, hero: 0 });
    const g = (
      sim as unknown as { goal: { items: { x: number; y: number; state: number }[]; spots: number[] } }
    ).goal;
    const hit = (sim as unknown as { bulletVsGoal: (b: object) => boolean }).bulletVsGoal.bind(sim);
    while (sim.phase === 'countdown') sim.step();
    // put the items out directly where the spots are and shoot each down
    for (const x of [...g.spots]) g.items.push({ x, y: 300, state: 1, hp: 50, max: 50 } as never);
    g.spots.length = 0;
    for (const it of g.items) {
      expect(hit({ x: it.x, y: it.y, dmg: 30, blast: 0 })).toBe(false);
      expect(it.state).toBe(1);
      hit({ x: it.x, y: it.y, dmg: 30, blast: 0 });
      expect(it.state).toBe(2);
    }
    expect(hit({ x: 0, y: 0, dmg: 30, blast: 0 })).toBe(true);
    sim.step();
    expect(sim.goalState()?.status).toBe(1);
  });

  it('a missed goal never stops the stage: computer squads win every stage with goals in it', () => {
    for (const st of SAGA) expect(run(st.id, 1, 9).sim.result, st.id).toBe('won');
  });
});

describe('computer players and the goals', () => {
  it('with nothing else to fight, they shoot down a stage target in front of them', () => {
    const sim = new Sim({ seed: 5, settings: { difficulty: 'normal', mission: 'astra-3' } });
    sim.addPlayer({ id: 'p', name: 'P', slot: 0, hero: 0 });
    while (sim.phase === 'countdown') sim.step();
    for (const e of [...sim.enemies.values()]) sim.enemies.delete(e.id);
    const me = sim.players.get('p');
    const g = (sim as unknown as { goal: { items: object[]; spots: number[] } }).goal;
    g.spots.length = 0;
    g.items.push({ x: (me?.x ?? 0) + 200, y: (me?.y ?? 0) - 22, hp: 16, max: 16, state: 1 });
    const bots = new Autopilot(1);
    for (let t = 0; t < sim.tickRate * 6 && sim.goalTargets().length; t++) {
      for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
      sim.step();
      for (const e of [...sim.enemies.values()]) sim.enemies.delete(e.id);
    }
    expect(sim.goalTargets()).toHaveLength(0);
  });
});
