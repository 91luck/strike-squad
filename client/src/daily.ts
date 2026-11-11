import {
  SAGA,
  dailyTrial,
  type DailyTrial,
  type HazardDef,
  type PowerKind,
  type Vyuha,
} from '@strikesquad/shared';

/**
 * The daily trial on the client: what today's battle is called, and the player's record in it (best score of the
 * day, days won in all, the current run of days). Saved under DAILY_KEY like the weekly goals; the trial itself
 * is worked out from the date (shared/src/daily.ts), so nothing here needs a server.
 */

export const DAILY_KEY = 'strikesquad.daily.v1';
/** Shards for the first win of a day. */
export const DAILY_SHARDS = 2;

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

const ASTRA_NAME: Record<PowerKind, string> = {
  agni: 'Agneyastra',
  varuna: 'Varunastra',
  vayu: 'Vayavyastra',
  singularity: 'Sammohana',
  naga: 'Nagastra',
  garuda: 'Garudastra',
  sudarshana: 'Sudarshana',
  pashupata: 'Pashupatastra',
  vaishnava: 'Vaishnavastra',
};
const HAZARD_NAME: Record<HazardDef['kind'], string> = {
  skyfall: 'Sky fire rains on the field',
  raid: 'Raiders dive from behind',
  tremor: 'The ground sends shockwaves',
  dark: 'Maya darkens the world',
};
const VYUHA_NAME: Record<Vyuha, string> = {
  chakra: 'Chakra vyuha (the wheel)',
  ardha: 'Ardha-chandra vyuha (the half-moon)',
  makara: 'Makara vyuha (the crocodile)',
  suchi: 'Suchi vyuha (the needle)',
  vajra: 'Vajra vyuha (the thunderbolt)',
  garuda: 'Garuda vyuha (the eagle)',
};

/** Today's hand in words, for the menu. */
export function describeTrial(t: DailyTrial): { place: string; lines: string[] } {
  const st = SAGA.find((s) => s.id === t.stage);
  return {
    place: st ? `${st.name} — ${st.place}` : t.stage,
    lines: [
      `Astras of the day: ${ASTRA_NAME[t.astras[0]]} and ${ASTRA_NAME[t.astras[1]]}`,
      `Hazard: ${HAZARD_NAME[t.hazard.kind]}`,
      `The host fights in: ${VYUHA_NAME[t.vyuha]}`,
    ],
  };
}

export interface DailyResult {
  /** The first win of this day (pays shards). */
  firstWin: boolean;
  /** A new best score for this day. */
  best: boolean;
  shards: number;
}

export class DailyStore {
  private day = '';
  private best = 0;
  private won = false;
  private wins = 0;
  private streak = 0;
  private lastWin = '';

  constructor(
    private readonly storage: Store,
    private readonly today: () => string,
  ) {
    try {
      const v: unknown = JSON.parse(storage?.getItem(DAILY_KEY) ?? 'null');
      if (typeof v === 'object' && v !== null) {
        const r = v as Record<string, unknown>;
        const num = (x: unknown): number =>
          typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
        if (typeof r.day === 'string') this.day = r.day;
        this.best = num(r.best);
        this.won = r.won === true;
        this.wins = num(r.wins);
        this.streak = num(r.streak);
        if (typeof r.lastWin === 'string') this.lastWin = r.lastWin;
      }
    } catch {
      /* unreadable: start fresh */
    }
    this.roll();
  }

  /** A new day: yesterday's best and win flag no longer count. */
  private roll(): void {
    const d = this.today();
    if (d === this.day) return;
    this.day = d;
    this.best = 0;
    this.won = false;
  }

  get trial(): DailyTrial {
    this.roll();
    return dailyTrial(this.day);
  }

  get bestToday(): number {
    this.roll();
    return this.best;
  }

  get wonToday(): boolean {
    this.roll();
    return this.won;
  }

  get totalWins(): number {
    return this.wins;
  }

  /** Days won in a row, up to and including today or yesterday (0 once a day has been missed). */
  get winStreak(): number {
    this.roll();
    return this.lastWin === this.day || this.lastWin === dayBefore(this.day) ? this.streak : 0;
  }

  /** A run of trial `day` ended. A run started before midnight and finished after it counts for nothing. */
  record(day: string, won: boolean, score: number): DailyResult {
    this.roll();
    const out: DailyResult = { firstWin: false, best: false, shards: 0 };
    if (day !== this.day) return out;
    if (won && score > this.best) {
      this.best = Math.floor(score);
      out.best = true;
    }
    if (won && !this.won) {
      this.streak = this.lastWin === dayBefore(this.day) ? this.streak + 1 : 1;
      this.lastWin = this.day;
      this.won = true;
      this.wins++;
      out.firstWin = true;
      out.shards = DAILY_SHARDS;
    }
    this.save();
    return out;
  }

  private save(): void {
    try {
      this.storage?.setItem(
        DAILY_KEY,
        JSON.stringify({
          day: this.day,
          best: this.best,
          won: this.won,
          wins: this.wins,
          streak: this.streak,
          lastWin: this.lastWin,
        }),
      );
    } catch {
      /* storage full or blocked: the record is kept for this visit only */
    }
  }
}

/** The local date before 'YYYY-MM-DD'. */
export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(y, m - 1, d - 1);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}
