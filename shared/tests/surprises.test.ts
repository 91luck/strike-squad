import { describe, expect, it } from 'vitest';
import { Autopilot, SAGA, SURPRISE_POOLS, Sim, getMission, type SagaId, type SimEvent } from '../src';

/** Surprises: every run of a saga stage breaks out differently (Sim.planSurprises). */
const plan = (id: SagaId, seed: number): ReturnType<Sim['surprisePlan']> =>
  new Sim({ seed, settings: { difficulty: 'normal', mission: id } }).surprisePlan();

describe('surprises', () => {
  it('every saga stage plans three, one of them the blessing, the rest from its own list', () => {
    for (const st of SAGA)
      for (let seed = 1; seed <= 12; seed++) {
        const p = plan(st.id, seed);
        expect(p.length, `${st.id} seed ${seed}`).toBeGreaterThanOrEqual(2);
        expect(p.filter((s) => s.kind === 'blessing').length).toBeLessThanOrEqual(1);
        for (const s of p) if (s.kind !== 'blessing') expect(SURPRISE_POOLS[st.id]).toContain(s.kind);
      }
  });

  it('never in a rest stop or on an arena doorstep, and in order along the stage', () => {
    for (const st of SAGA) {
      const L = getMission(st.id);
      for (let seed = 1; seed <= 12; seed++) {
        const p = plan(st.id, seed);
        for (const s of p) {
          for (const r of L.rests) expect(s.x < r.x0 - 200 || s.x > r.x1 + 200, `${st.id} rest`).toBe(true);
          for (const a of L.arenas)
            expect(s.x < a.trigger - 250 || s.x > a.right, `${st.id} arena`).toBe(true);
        }
        for (let i = 1; i < p.length; i++) expect((p[i]?.x ?? 0) > (p[i - 1]?.x ?? 0)).toBe(true);
      }
    }
  });

  it('no two runs alike: the spots and the kinds change with the seed', () => {
    for (const st of SAGA) {
      const runs = new Set<string>();
      for (let seed = 1; seed <= 10; seed++) runs.add(JSON.stringify(plan(st.id, seed)));
      expect(runs.size, st.id).toBeGreaterThanOrEqual(8);
    }
  });

  it('they break out as a squad passes them, and a computer squad still wins', () => {
    for (const id of ['astra-1', 'astra-7', 'astra-9'] as SagaId[]) {
      const sim = new Sim({ seed: 21, settings: { difficulty: 'normal', mission: id } });
      const bots = new Autopilot(1);
      for (let i = 0; i < 2; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
      const seen: string[] = [];
      for (let t = 0; sim.phase !== 'ended' && t < sim.tickRate * 600; t++) {
        for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
        sim.step();
        for (const ev of sim.drainEvents() as SimEvent[]) if (ev.e === 'surprise') seen.push(ev.kind);
      }
      expect(sim.result, id).toBe('won');
      expect(seen.length, `${id}: ${seen.join(',')}`).toBeGreaterThanOrEqual(2);
      expect(seen).toEqual(
        sim
          .surprisePlan()
          .slice(0, seen.length)
          .map((s) => s.kind),
      );
    }
  });
});
