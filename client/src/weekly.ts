import { rankName, type BoardEntry, type Difficulty } from '@strikesquad/shared';

/**
 * Weekly challenges: three goals that change every Monday, the same three for every player that week (so friends
 * can race each other). The first goal is always one any win moves forward; the other two push a different way to
 * play (style, supers, co-op, hard mode, other heroes). Each finished goal pays shards and XP, and finishing all
 * three opens the weekly chest.
 *
 * Client-side only, like the profile: saved under WEEKLY_KEY (in the portal cloud save on CrazyGames).
 */

export const WEEKLY_KEY = 'strikesquad.weekly.v1';
export const WEEKLY_SHARDS = 3;
export const WEEKLY_XP = 150;
export const CHEST_SHARDS = 5;
export const WEEKLY_COUNT = 3;

/** What a finished run tells the weekly goals. */
export interface WeeklyRun {
  won: boolean;
  /** 1..3 for a win, 0 for a loss. */
  stars: number;
  saga: boolean;
  online: boolean;
  /** Soldiers in the squad, bots included. */
  squad: number;
  difficulty: Difficulty;
  hero: number;
  me: BoardEntry | undefined;
}

interface ChallengeDef {
  id: string;
  /** Goal text; `{n}` is replaced by the target. */
  text: string;
  target: number;
  /** How much this run adds (for "count" goals) or the best value reached (for "best" goals). */
  measure(r: WeeklyRun): number;
  mode: 'count' | 'best';
}

/** Goals that every win moves forward: one of them is always the first goal of the week. */
const BASIC: readonly ChallengeDef[] = [
  { id: 'clears', text: 'Clear {n} stages', target: 5, mode: 'count', measure: (r) => (r.won ? 1 : 0) },
  {
    id: 'stars',
    text: 'Earn {n} stars in the Astra Saga',
    target: 9,
    mode: 'count',
    measure: (r) => (r.won && r.saga ? r.stars : 0),
  },
];

const SPECIAL: readonly ChallengeDef[] = [
  {
    id: 'kills',
    text: 'Defeat {n} enemies',
    target: 150,
    mode: 'count',
    measure: (r) => Math.max(0, r.me?.kills ?? 0),
  },
  {
    id: 'supers',
    text: 'Unleash {n} super moves',
    target: 10,
    mode: 'count',
    measure: (r) => Math.max(0, r.me?.ults ?? 0),
  },
  {
    id: 'combo',
    text: 'Reach a {n}-hit combo',
    target: 20,
    mode: 'best',
    measure: (r) => Math.max(0, r.me?.bestCombo ?? 0),
  },
  {
    id: 'style',
    text: `Reach style rank ${rankName(2)} or higher in {n} runs`,
    target: 3,
    mode: 'count',
    measure: (r) => ((r.me?.rank ?? -1) >= 2 ? 1 : 0),
  },
  {
    id: 'bosses',
    text: 'Win {n} stages after hurting the boss',
    target: 3,
    mode: 'count',
    measure: (r) => (r.won && (r.me?.bossDamage ?? 0) > 0 ? 1 : 0),
  },
  {
    id: 'squad',
    text: 'Clear {n} stages with friends online',
    target: 2,
    mode: 'count',
    measure: (r) => (r.won && r.online && r.squad > 1 ? 1 : 0),
  },
  {
    id: 'hard',
    text: 'Clear {n} stage on Hard',
    target: 1,
    mode: 'count',
    measure: (r) => (r.won && r.difficulty === 'hard' ? 1 : 0),
  },
  {
    id: 'flawless',
    text: 'Clear {n} stages with 3 stars',
    target: 3,
    mode: 'count',
    measure: (r) => (r.won && r.stars >= 3 ? 1 : 0),
  },
  {
    id: 'heroes',
    text: 'Clear stages with {n} different heroes',
    target: 3,
    mode: 'count',
    // Counted specially (a set of heroes), see WeeklyStore.record.
    measure: (r) => (r.won ? 1 : 0),
  },
];

const ALL = [...BASIC, ...SPECIAL];

export interface Challenge {
  id: string;
  text: string;
  target: number;
  progress: number;
  done: boolean;
}

/** ISO week of a local "YYYY-MM-DD" date, as "YYYY-Www" (weeks start on Monday). */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  d.setUTCDate(d.getUTCDate() - dow + 3); // the Thursday of this week decides its year
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Whole days left until the next Monday (1..7) from a local "YYYY-MM-DD" date. */
export function daysToReset(day: string): number {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return 7 - dow;
}

/** A small, stable hash of a string (FNV-1a), so every player gets the same goals in the same week. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The three goal ids of a week: one basic goal, then two different special ones. */
export function weekGoals(week: string): string[] {
  let h = hash(week);
  const next = (n: number): number => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = (h ^ (h >>> 12)) >>> 0;
    return h % n;
  };
  const basic = BASIC[next(BASIC.length)] as ChallengeDef;
  const pool = [...SPECIAL];
  const picks: string[] = [basic.id];
  while (picks.length < WEEKLY_COUNT) {
    const [c] = pool.splice(next(pool.length), 1);
    if (c) picks.push(c.id);
  }
  return picks;
}

const def = (id: string): ChallengeDef | undefined => ALL.find((c) => c.id === id);
const goalText = (c: ChallengeDef): string => c.text.replace('{n}', String(c.target));

export interface WeeklyReward {
  /** Goals this run moved forward, with their new progress. */
  moved: Challenge[];
  /** Goals this run finished. */
  finished: Challenge[];
  /** True when this run finished the last of the three. */
  chest: boolean;
  shards: number;
  xp: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

export class WeeklyStore {
  private week = '';
  private progress: Record<string, number> = {};
  private heroes = new Set<number>();
  private done = new Set<string>();
  private chest = false;

  constructor(
    private readonly storage: Store,
    private readonly today: () => string,
  ) {
    try {
      const v: unknown = JSON.parse(storage?.getItem(WEEKLY_KEY) ?? 'null');
      if (typeof v === 'object' && v !== null) {
        const r = v as Record<string, unknown>;
        if (typeof r.week === 'string') this.week = r.week;
        if (typeof r.progress === 'object' && r.progress !== null)
          for (const [k, n] of Object.entries(r.progress as Record<string, unknown>))
            if (def(k) && typeof n === 'number' && Number.isFinite(n) && n >= 0)
              this.progress[k] = Math.floor(n);
        if (Array.isArray(r.heroes))
          for (const h of r.heroes) if (Number.isInteger(h) && h >= 0 && h < 64) this.heroes.add(h as number);
        if (Array.isArray(r.done))
          for (const d of r.done) if (typeof d === 'string' && def(d)) this.done.add(d);
        this.chest = r.chest === true;
      }
    } catch {
      /* unreadable: start the week fresh */
    }
    this.roll();
  }

  /** The current week's goals with their progress. */
  goals(): Challenge[] {
    this.roll();
    return weekGoals(this.week).map((id) => {
      const c = def(id) as ChallengeDef;
      const progress = Math.min(c.target, id === 'heroes' ? this.heroes.size : (this.progress[id] ?? 0));
      return { id, text: goalText(c), target: c.target, progress, done: this.done.has(id) };
    });
  }

  get finishedCount(): number {
    return this.goals().filter((g) => g.done).length;
  }

  get chestOpened(): boolean {
    this.roll();
    return this.chest;
  }

  get daysLeft(): number {
    return daysToReset(this.today());
  }

  /** Book a finished run against this week's goals. */
  record(r: WeeklyRun): WeeklyReward {
    this.roll();
    const moved: Challenge[] = [];
    const finished: Challenge[] = [];
    for (const id of weekGoals(this.week)) {
      const c = def(id) as ChallengeDef;
      if (this.done.has(id)) continue;
      const before = id === 'heroes' ? this.heroes.size : (this.progress[id] ?? 0);
      if (id === 'heroes') {
        if (r.won) this.heroes.add(r.hero);
      } else {
        const m = c.measure(r);
        this.progress[id] = c.mode === 'best' ? Math.max(before, m) : before + m;
      }
      const after = id === 'heroes' ? this.heroes.size : (this.progress[id] ?? 0);
      if (after <= before) continue;
      const g: Challenge = {
        id,
        text: goalText(c),
        target: c.target,
        progress: Math.min(c.target, after),
        done: after >= c.target,
      };
      moved.push(g);
      if (g.done) {
        this.done.add(id);
        finished.push(g);
      }
    }
    let chest = false;
    if (!this.chest && weekGoals(this.week).every((id) => this.done.has(id))) {
      this.chest = true;
      chest = true;
    }
    this.save();
    return {
      moved,
      finished,
      chest,
      shards: finished.length * WEEKLY_SHARDS + (chest ? CHEST_SHARDS : 0),
      xp: finished.length * WEEKLY_XP,
    };
  }

  /** A new week wipes the old progress. */
  private roll(): void {
    const week = isoWeek(this.today());
    if (week === this.week) return;
    this.week = week;
    this.progress = {};
    this.heroes.clear();
    this.done.clear();
    this.chest = false;
    this.save();
  }

  private save(): void {
    try {
      this.storage?.setItem(
        WEEKLY_KEY,
        JSON.stringify({
          week: this.week,
          progress: this.progress,
          heroes: [...this.heroes],
          done: [...this.done],
          chest: this.chest,
        }),
      );
    } catch {
      /* storage blocked: progress just won't persist */
    }
  }
}
