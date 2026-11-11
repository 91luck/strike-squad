import { describe, expect, it } from 'vitest';
import { Autopilot, POWER_KINDS, SAGA_COURSES, Sim, dailyLevel, dailyTrial, getMission } from '../src';

const day = (n: number): string => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);

describe('the daily trial', () => {
  it('is the same for everyone on a day and changes from day to day', () => {
    expect(dailyTrial('2026-11-10')).toEqual(dailyTrial('2026-11-10'));
    const month = Array.from({ length: 30 }, (_, i) => dailyTrial(day(i)));
    const hands = new Set(month.map((t) => `${t.stage}|${t.hazard.kind}|${t.astras.join('+')}|${t.vyuha}`));
    expect(hands.size).toBeGreaterThanOrEqual(28);
    for (let i = 1; i < month.length; i++) expect(month[i]).not.toEqual(month[i - 1]);
    expect(new Set(month.map((t) => t.stage)).size).toBeGreaterThanOrEqual(6);
    expect(new Set(month.map((t) => t.hazard.kind)).size).toBe(4);
  });

  it('deals the stage a hazard it does not have, two different astras and a leading battle array', () => {
    for (let i = 0; i < 60; i++) {
      const t = dailyTrial(day(i));
      expect(t.hazard.kind).not.toBe(SAGA_COURSES[t.stage].hazard?.kind);
      expect(t.astras[0]).not.toBe(t.astras[1]);
      const L = dailyLevel(t);
      const base = getMission(t.stage);
      expect(L.hazard).toEqual(t.hazard);
      expect(L.pickups).toHaveLength(base.pickups.length);
      const astras = new Set(L.pickups.map((p) => p.kind).filter((k) => POWER_KINDS.includes(k as never)));
      for (const k of astras) expect([...t.astras, 'varuna', 'vaishnava']).toContain(k);
      // what a stage cannot do without stays where it stood
      for (const [j, p] of base.pickups.entries())
        if (p.kind === 'varuna' || p.kind === 'vaishnava') expect(L.pickups[j]!.kind).toBe(p.kind);
      for (const a of L.arenas) if (!a.boss && a.waves.length) expect(a.vyuha[0]).toBe(t.vyuha);
      // the stage itself is left as it was
      expect(getMission(t.stage).hazard).toEqual(base.hazard);
    }
  });

  it('a week of trials: each can be finished by a computer squad, never trapping it', () => {
    for (let i = 0; i < 7; i++) {
      const t = dailyTrial(day(i));
      const sim = new Sim({
        seed: t.seed,
        settings: { difficulty: 'normal', mission: t.stage },
        level: dailyLevel(t),
      });
      const bots = new Autopilot(1);
      for (let k = 0; k < 4; k++) sim.addPlayer({ id: `p${k}`, name: `P${k}`, slot: k, hero: k });
      const cap = sim.ticks(15 * 60);
      while (sim.phase !== 'ended' && sim.tick < cap) {
        for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
        sim.step();
        sim.drainEvents();
      }
      expect(sim.result, `${t.day} ${t.stage} ${t.hazard.kind}: stuck`).not.toBeNull();
    }
  }, 240_000);
});
