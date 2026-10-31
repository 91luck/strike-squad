/** Debug: run one bot mission and print a status line every N seconds. `tsx scripts/trace.ts players seed every`. */
import { Autopilot, Sim } from '../shared/src/index';
const n = Number(process.argv[2] ?? 1);
const seed = Number(process.argv[3] ?? 7920);
const every = Number(process.argv[4] ?? 10);
const sim = new Sim({ seed });
const bots = new Autopilot(Number(process.argv[5] ?? 1));
for (let i = 0; i < n; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
while (sim.phase !== 'ended' && sim.tick < sim.ticks(900)) {
  for (const p of sim.players.values()) sim.setInput(p.id, bots.decide(sim, p));
  sim.step();
  for (const ev of sim.drainEvents())
    if (['arena', 'clear', 'bossWake', 'bossDown', 'ko', 'bossPhase', 'end'].includes(ev.e))
      console.log(`  t=${(sim.tick / 30).toFixed(1)} ${JSON.stringify(ev)}`);
  if (sim.tick % sim.ticks(every) === 0) {
    const ps = [...sim.players.values()].map(
      (p) =>
        `${p.id}@${Math.round(p.x / 32)},${Math.round(p.y / 32)} hp${Math.round(p.hp)} ${p.state} ult${Math.round(p.ult)}`,
    );
    const ai = sim.activeArena();
    const es = [...sim.enemies.values()]
      .filter((e) => e.awake && (ai < 0 || e.arena === ai))
      .slice(0, 6)
      .map(
        (e) => `${e.kind}@${Math.round(e.body.x / 32)},${Math.round(e.body.y / 32)} hp${Math.round(e.hp)}`,
      );
    console.log(`t=${sim.tick / 30}s lives=${sim.lives} arena=${ai} ${ps.join(' | ')} :: ${es.join(' ')}`);
  }
}
console.log('result', sim.result, sim.failReason);
