import { HERO_COUNT, type BoardEntry } from '@strikesquad/shared';

/**
 * The player's profile: the long-term "one more run" loop that sits on top of the missions.
 *
 *  - XP and level: every run pays XP (a win more, style and boss damage a bit more); levels come fast at the start.
 *  - Hero unlocks: three heroes are open from the first minute, the rest open at set levels, so there is always a
 *    next hero to chase (and a hero you can see but not play yet).
 *  - Daily streak: the first visit of each day pays astra shards, more for each day in a row.
 *  - Trophies: one-time goals (first clear, flawless run, a streak, the whole saga) that pay shards.
 *
 * Everything here is client-side presentation and saving: the simulation and the server never see it. Like the other
 * stores it is a convenience: blocked or wiped storage just starts fresh.
 */

export const PROFILE_KEY = 'strikesquad.profile.v1';
export const LEVEL_CAP = 30;

/** Total XP needed to *reach* `level` (level 1 = 0, 2 = 100, 3 = 300, 4 = 600, 5 = 1000 …). */
export const xpToReach = (level: number): number => 50 * level * (level - 1);

/** The level a total XP amount corresponds to. */
export function levelFor(xp: number): number {
  let level = 1;
  while (level < LEVEL_CAP && xp >= xpToReach(level + 1)) level++;
  return level;
}

/** The level at which each hero (by id) opens. Blaze, Nova and Tusk are free; the rest are earned. */
export const HERO_UNLOCK_LEVEL: readonly number[] = [1, 1, 1, 2, 3, 4, 5, 6];

/** Is this hero playable at this level? */
export const heroOpenAt = (hero: number, level: number): boolean =>
  level >= (HERO_UNLOCK_LEVEL[hero] ?? Infinity);

/** Shards paid by the daily visit: day 1 pays 1, then one more per day in a row, up to this many. */
export const DAILY_MAX_SHARDS = 5;
/** Shards paid by every trophy. */
export const TROPHY_SHARDS = 2;

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

export interface RunInput {
  won: boolean;
  /** 1..3 for a win, 0 for a loss. */
  stars: number;
  /** True when this was the first time the stage was cleared. */
  first: boolean;
  /** The player's own row of the scoreboard. */
  me: BoardEntry | undefined;
  /** Saga stages cleared at least once, after this run, and the total number of stages. */
  sagaCleared: number;
  sagaTotal: number;
}

/** XP a run pays. Finishing matters most; style, kills and bosses add on top. */
export function runXp(r: RunInput): number {
  let xp = r.won ? 100 + 40 * Math.max(0, Math.min(3, r.stars)) + (r.first ? 60 : 0) : 25;
  if (r.me) {
    xp += Math.min(60, Math.max(0, r.me.kills)) * 2;
    xp += Math.max(0, r.me.rank) * 5;
    if (r.me.bossDamage > 0) xp += 20;
  }
  return Math.round(xp);
}

interface Totals {
  kills: number;
  wins: number;
}

export interface Trophy {
  id: string;
  name: string;
  how: string;
  icon: string;
}

interface TrophyCtx {
  run: RunInput | null;
  totals: Totals;
  streak: number;
  level: number;
}

interface TrophyDef extends Trophy {
  earned(c: TrophyCtx): boolean;
}

export const TROPHIES: readonly TrophyDef[] = [
  {
    id: 'first-clear',
    name: 'First Blood',
    how: 'Clear a stage.',
    icon: '⚔',
    earned: (c) => c.totals.wins >= 1,
  },
  {
    id: 'flawless',
    name: 'Flawless',
    how: 'Clear a stage with 3 stars.',
    icon: '★',
    earned: (c) => (c.run?.won ?? false) && (c.run?.stars ?? 0) >= 3,
  },
  {
    id: 'style',
    name: 'Style Master',
    how: 'Reach style rank 3 or higher in one run.',
    icon: '✦',
    earned: (c) => (c.run?.me?.rank ?? -1) >= 3,
  },
  {
    id: 'boss-slayer',
    name: 'Boss Slayer',
    how: 'Clear a stage after hurting its boss.',
    icon: '☠',
    earned: (c) => (c.run?.won ?? false) && (c.run?.me?.bossDamage ?? 0) > 0,
  },
  {
    id: 'super-star',
    name: 'Super Star',
    how: 'Unleash 3 super moves in one run.',
    icon: '⚡',
    earned: (c) => (c.run?.me?.ults ?? 0) >= 3,
  },
  {
    id: 'slayer-100',
    name: 'Hundred Down',
    how: 'Defeat 100 enemies in total.',
    icon: '💥',
    earned: (c) => c.totals.kills >= 100,
  },
  {
    id: 'slayer-500',
    name: 'Asura Bane',
    how: 'Defeat 500 enemies in total.',
    icon: '🔥',
    earned: (c) => c.totals.kills >= 500,
  },
  {
    id: 'streak-3',
    name: 'Devoted',
    how: 'Come back 3 days in a row.',
    icon: '📅',
    earned: (c) => c.streak >= 3,
  },
  {
    id: 'streak-7',
    name: 'Unbroken',
    how: 'Come back 7 days in a row.',
    icon: '🗓',
    earned: (c) => c.streak >= 7,
  },
  {
    id: 'saga-half',
    name: 'Halfway There',
    how: 'Clear 5 Astra Saga stages.',
    icon: '☸',
    earned: (c) => (c.run?.sagaCleared ?? 0) >= 5,
  },
  {
    id: 'saga-complete',
    name: 'Astra Master',
    how: 'Clear all ten Astra Saga stages.',
    icon: '☀',
    earned: (c) => !!c.run && c.run.sagaCleared >= c.run.sagaTotal && c.run.sagaTotal > 0,
  },
  {
    id: 'all-heroes',
    name: 'Full Squad',
    how: 'Unlock every hero.',
    icon: '👥',
    earned: (c) => HERO_UNLOCK_LEVEL.every((l) => c.level >= l),
  },
];

export interface RunReward {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  /** XP into the current level before and after the run, and what the level needs: drives the progress bar. */
  barBefore: number;
  barAfter: number;
  /** Heroes that opened because of this run. */
  newHeroes: number[];
  newTrophies: Trophy[];
  /** Shards paid by the new trophies. */
  shards: number;
}

export interface DailyResult {
  claimed: boolean;
  streak: number;
  shards: number;
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"), so a month end or a clock change never miscounts. */
export function dayDiff(a: string, b: string): number {
  const t = (s: string): number => Date.parse(`${s}T00:00:00Z`);
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** Today in the player's own time zone, as "YYYY-MM-DD". */
export function localDay(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class ProfileStore {
  private xp = 0;
  private streakDays = 0;
  private lastDay = '';
  private earned = new Set<string>();
  private totals: Totals = { kills: 0, wins: 0 };

  constructor(private readonly storage: Store = safeStorage()) {
    const raw = read(storage);
    if (raw) {
      this.xp = num(raw.xp, 0, 1_000_000);
      this.streakDays = num(raw.streak, 0, 10_000);
      this.lastDay =
        typeof raw.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDay) ? raw.lastDay : '';
      const ids = new Set(TROPHIES.map((t) => t.id));
      if (Array.isArray(raw.trophies))
        for (const t of raw.trophies) if (typeof t === 'string' && ids.has(t)) this.earned.add(t);
      const tot = raw.totals as Partial<Totals> | undefined;
      this.totals = { kills: num(tot?.kills, 0, 10_000_000), wins: num(tot?.wins, 0, 1_000_000) };
    }
  }

  get level(): number {
    return levelFor(this.xp);
  }

  get streak(): number {
    return this.streakDays;
  }

  get totalXp(): number {
    return this.xp;
  }

  /** Progress inside the current level: XP gained, XP the level needs, and the fraction (1 at the cap). */
  levelBar(xp = this.xp): { level: number; into: number; need: number; frac: number } {
    const level = levelFor(xp);
    if (level >= LEVEL_CAP) return { level, into: 0, need: 0, frac: 1 };
    const base = xpToReach(level);
    const need = xpToReach(level + 1) - base;
    const into = xp - base;
    return { level, into, need, frac: Math.max(0, Math.min(1, into / need)) };
  }

  heroOpen(hero: number): boolean {
    return heroOpenAt(hero, this.level);
  }

  /** The nearest hero still to unlock, and the level it needs; null when the whole roster is open. */
  nextHero(): { hero: number; level: number } | null {
    let best: { hero: number; level: number } | null = null;
    for (let h = 0; h < HERO_COUNT; h++) {
      const l = HERO_UNLOCK_LEVEL[h] ?? Infinity;
      if (l > this.level && (!best || l < best.level)) best = { hero: h, level: l };
    }
    return best;
  }

  trophyEarned(id: string): boolean {
    return this.earned.has(id);
  }

  get trophyCount(): number {
    return this.earned.size;
  }

  /**
   * The daily visit. The first call of a calendar day pays shards and moves the streak (a missed day starts it
   * again at 1); further calls on the same day pay nothing. Trophies that depend on the streak are checked too.
   */
  claimDaily(today: string): DailyResult & { newTrophies: Trophy[] } {
    if (this.lastDay === today)
      return { claimed: false, streak: this.streakDays, shards: 0, newTrophies: [] };
    const gap = this.lastDay ? dayDiff(this.lastDay, today) : Infinity;
    this.streakDays = gap === 1 ? this.streakDays + 1 : 1;
    this.lastDay = today;
    const shards = Math.min(this.streakDays, DAILY_MAX_SHARDS);
    const newTrophies = this.award({
      run: null,
      totals: this.totals,
      streak: this.streakDays,
      level: this.level,
    });
    this.save();
    return {
      claimed: true,
      streak: this.streakDays,
      shards: shards + newTrophies.length * TROPHY_SHARDS,
      newTrophies,
    };
  }

  /** Book a finished run: XP (plus any bonus, e.g. weekly goals), totals and any trophies it earned. */
  record(r: RunInput, bonusXp = 0): RunReward {
    const levelBefore = this.level;
    const barBefore = this.levelBar().frac;
    const xpGained = runXp(r) + (Number.isFinite(bonusXp) && bonusXp > 0 ? Math.floor(bonusXp) : 0);
    this.xp = Math.min(xpToReach(LEVEL_CAP) + 1_000_000, this.xp + xpGained);
    if (r.won) this.totals.wins++;
    this.totals.kills += Math.max(0, r.me?.kills ?? 0);
    const levelAfter = this.level;
    const newHeroes: number[] = [];
    for (let h = 0; h < HERO_COUNT; h++) {
      const l = HERO_UNLOCK_LEVEL[h] ?? Infinity;
      if (l > levelBefore && l <= levelAfter) newHeroes.push(h);
    }
    const newTrophies = this.award({
      run: r,
      totals: this.totals,
      streak: this.streakDays,
      level: levelAfter,
    });
    this.save();
    return {
      xpGained,
      levelBefore,
      levelAfter,
      barBefore,
      barAfter: this.levelBar().frac,
      newHeroes,
      newTrophies,
      shards: newTrophies.length * TROPHY_SHARDS,
    };
  }

  private award(c: TrophyCtx): Trophy[] {
    const out: Trophy[] = [];
    for (const t of TROPHIES) {
      if (this.earned.has(t.id) || !t.earned(c)) continue;
      this.earned.add(t.id);
      out.push({ id: t.id, name: t.name, how: t.how, icon: t.icon });
    }
    return out;
  }

  private save(): void {
    try {
      this.storage?.setItem(
        PROFILE_KEY,
        JSON.stringify({
          xp: this.xp,
          streak: this.streakDays,
          lastDay: this.lastDay,
          trophies: [...this.earned],
          totals: this.totals,
        }),
      );
    } catch {
      /* storage full or blocked: the profile just won't persist */
    }
  }
}

function num(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : min;
}

function read(storage: Pick<Storage, 'getItem'> | null): Record<string, unknown> | null {
  try {
    const text = storage?.getItem(PROFILE_KEY);
    const v: unknown = text ? JSON.parse(text) : null;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
