import { POWER_KINDS, type PowerKind, type SagaId } from './config';
import { buildCourse } from './course';
import { VYUHAS, type HazardDef, type LevelDef, type Vyuha } from './level';
import { Rng } from './rng';
import { SAGA, SAGA_COURSES } from './saga';

/**
 * The daily trial: one battle a day, the same for every player that day, never the same two days running. It
 * takes a saga stage and deals it a different hand: another stage-wide hazard, two astras of the day on every
 * astra pedestal, and one battle array leading every ambush. The dice are the date, so friends can compare runs.
 *
 * Solo and offline: it is built in the browser (see practice.ts), nothing is sent to a server.
 */
export interface DailyTrial {
  /** Local date, 'YYYY-MM-DD'. */
  day: string;
  stage: SagaId;
  hazard: HazardDef;
  astras: [PowerKind, PowerKind];
  vyuha: Vyuha;
  seed: number;
}

/**
 * Stages the trial draws from. The last two are left out: their bosses' astras need the stage's own answers
 * (the vaishnava altars, the brahmastra), which a reshuffled hand could take away.
 */
const STAGES: readonly SagaId[] = SAGA.slice(0, 8).map((s) => s.id);
const HAZARDS: readonly HazardDef[] = [
  { kind: 'skyfall', every: 8, count: 3 },
  { kind: 'raid', every: 11, count: 2 },
  { kind: 'tremor', every: 10, count: 1 },
  { kind: 'dark', every: 16, count: 5 },
];
/** Astras a pedestal can be dealt. Varuna and vaishnava pedestals are never touched: stages need them where they stand. */
const DEAL: readonly PowerKind[] = POWER_KINDS.filter((k) => k !== 'varuna' && k !== 'vaishnava');
const KEEP: ReadonlySet<string> = new Set(['varuna', 'vaishnava']);

function hashDay(day: string): number {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
  return h >>> 0 || 1;
}

export function dailyTrial(day: string): DailyTrial {
  const rng = new Rng(hashDay(day));
  for (let i = 0; i < 4; i++) rng.next();
  const stage = rng.pick(STAGES);
  const own = SAGA_COURSES[stage].hazard?.kind;
  const hazard = rng.pick(HAZARDS.filter((h) => h.kind !== own));
  const first = rng.pick(DEAL);
  const second = rng.pick(DEAL.filter((k) => k !== first));
  return {
    day,
    stage,
    hazard,
    astras: [first, second],
    vyuha: rng.pick(VYUHAS),
    seed: hashDay(`${day}#seed`),
  };
}

/** The trial's battlefield: its stage, dealt the day's hazard, astras and leading battle array. */
export function dailyLevel(t: DailyTrial): LevelDef {
  const L = buildCourse({ ...SAGA_COURSES[t.stage], hazard: t.hazard });
  let n = 0;
  for (const p of L.pickups)
    if ((POWER_KINDS as readonly string[]).includes(p.kind) && !KEEP.has(p.kind))
      p.kind = t.astras[n++ % 2] as PowerKind;
  for (const a of L.arenas)
    if (!a.boss && a.waves.length) a.vyuha = [t.vyuha, ...a.vyuha.filter((v) => v !== t.vyuha)];
  return L;
}
