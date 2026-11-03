/**
 * Mission playtest with computer players (the shared Autopilot): is the mission beatable, and how hard is it for
 * squads of different sizes? Prints win rate, time, lives left, KOs, super moves, best combo, how many arenas
 * (ambush + the three bosses) were cleared and how far failed squads got.
 *
 *   npm run playtest                 (20 runs per squad size, normal difficulty)
 *   npm run playtest -- 50 hard      (runs, difficulty)
 *   npm run playtest -- 10 normal 0.8   (bot reaction skill 0..1, default 1)
 *   npm run playtest -- 10 normal 0.6 1,2,4 mission-3   (squad sizes, mission id)
 */
import { Autopilot, GAME_CONFIG, Sim, isMissionId, type Difficulty } from '../shared/src/index';

const runs = Number(process.argv[2] ?? 20);
const difficulty = (process.argv[3] ?? 'normal') as Difficulty;
const skill = Number(process.argv[4] ?? 1);
const sizes = (process.argv[5] ?? '1,2,4,8').split(',').map(Number);
const mission = process.argv[6] ?? 'mission-1';

interface Outcome {
  won: boolean;
  sec: number;
  lives: number;
  kos: number;
  ults: number;
  combo: number;
  arenas: number;
  maxX: number;
}

function play(n: number, seed: number): Outcome {
  if (!isMissionId(mission)) throw new Error(`unknown mission ${mission}`);
  const sim = new Sim({ seed, settings: { difficulty, mission } });
  const bots = new Autopilot(skill);
  for (let i = 0; i < n; i++) sim.addPlayer({ id: `p${i}`, name: `P${i}`, slot: i, hero: i });
  let maxX = 0;
  const cap = sim.ticks(15 * 60);
  while (sim.phase !== 'ended' && sim.tick < cap) {
    for (const p of sim.players.values()) {
      sim.setInput(p.id, bots.decide(sim, p));
      maxX = Math.max(maxX, p.x);
    }
    sim.step();
    sim.drainEvents();
  }
  let kos = 0;
  let ults = 0;
  let combo = 0;
  for (const p of sim.players.values()) {
    kos += p.stats.deaths;
    ults += p.stats.ults;
    combo = Math.max(combo, p.stats.bestCombo);
  }
  return {
    won: sim.result === 'won',
    sec: Math.round(sim.tick / GAME_CONFIG.tickRate),
    lives: sim.lives,
    kos,
    ults,
    combo,
    arenas: sim.arenaState.filter((s) => s === 2).length + (sim.result === 'won' ? 0 : 0),
    maxX: Math.round(maxX / GAME_CONFIG.tile),
  };
}

console.log(
  `Playtest ${mission}: ${runs} runs per squad size, difficulty ${difficulty}, bot skill ${skill}\n`,
);
console.log(
  'players | won    | avg time (won) | lives left | KOs/run | ults/run | best combo | arenas cleared | furthest col (median)',
);
for (const n of sizes) {
  const out: Outcome[] = [];
  for (let s = 1; s <= runs; s++) out.push(play(n, s * 7919 + n));
  const won = out.filter((o) => o.won);
  const avg = (xs: number[]): string =>
    xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '-';
  const med = [...out.map((o) => o.maxX)].sort((a, b) => a - b)[Math.floor(out.length / 2)];
  console.log(
    `${String(n).padStart(7)} | ${`${Math.round((won.length / runs) * 100)}%`.padEnd(6)} | ${avg(won.map((o) => o.sec)).padStart(14)} | ${avg(won.map((o) => o.lives)).padStart(10)} | ${avg(out.map((o) => o.kos)).padStart(7)} | ${avg(out.map((o) => o.ults)).padStart(8)} | ${avg(out.map((o) => o.combo)).padStart(10)} | ${avg(out.map((o) => o.arenas)).padStart(14)} | ${med}`,
  );
}
