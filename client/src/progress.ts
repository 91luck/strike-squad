import {
  SAGA_IDS,
  isMissionId,
  isSagaId,
  type Difficulty,
  type MissionId,
  type SagaId,
} from '@strikesquad/shared';

/**
 * The player's progress: which missions they have completed (best time, hardest difficulty, best stars), and in
 * the Astra Saga which stages are open and how many astra shards they hold. Kept in the platform's storage (this
 * browser, or the portal's cloud save). It is a convenience: blocked or wiped storage just starts fresh.
 *
 * Saga rules:
 *  - stage 1 is always open; each later stage opens when the one before it has been cleared once;
 *  - every win earns as many shards as stars (1-3); a continue after running out of lives costs CONTINUE_COST.
 */
export interface MissionRecord {
  /** Best winning time in seconds. */
  best: number;
  hardest: Difficulty;
  /** Best stars (1..3). */
  stars: number;
}

const KEY = 'strikesquad.progress.v1';
const SAGA_KEY = 'strikesquad.saga.v1';
const RANK: Record<Difficulty, number> = { easy: 0, normal: 1, hard: 2 };
/** Shards a continue costs (the alternative to watching a video). */
export const CONTINUE_COST = 3;
/** Shards for finding a stage's hidden stash (once per stage). */
export const SECRET_SHARDS = 2;
/** A new player starts with enough shards for one continue. */
const STARTING_SHARDS = CONTINUE_COST;

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

export class ProgressStore {
  private data: Partial<Record<MissionId, MissionRecord>>;
  private sagaData: { shards: number; secrets: SagaId[] };

  constructor(private readonly storage: Store = safeStorage()) {
    this.data = sanitize(read(storage, KEY));
    const saga = read(storage, SAGA_KEY) as { shards?: unknown; secrets?: unknown } | null;
    const shards =
      typeof saga?.shards === 'number' && Number.isFinite(saga.shards) ? saga.shards : STARTING_SHARDS;
    const secrets = Array.isArray(saga?.secrets) ? saga.secrets.filter(isSagaId) : [];
    this.sagaData = {
      shards: Math.max(0, Math.min(999, Math.floor(shards))),
      secrets: [...new Set(secrets)],
    };
  }

  get(id: MissionId): MissionRecord | undefined {
    return this.data[id];
  }

  /** Record a win; returns true when it is the first time this mission was completed. Saga wins earn shards. */
  won(id: MissionId, timeSec: number, difficulty: Difficulty, stars = 1): boolean {
    const prev = this.data[id];
    const s = Math.max(1, Math.min(3, Math.round(stars)));
    this.data[id] = {
      best: prev ? Math.min(prev.best, timeSec) : timeSec,
      hardest: prev && RANK[prev.hardest] > RANK[difficulty] ? prev.hardest : difficulty,
      stars: Math.max(prev?.stars ?? 0, s),
    };
    if (isSagaId(id)) this.sagaData.shards = Math.min(999, this.sagaData.shards + s);
    this.save();
    return !prev;
  }

  // ------------------------------------------------------------ saga

  get shards(): number {
    return this.sagaData.shards;
  }

  /** Add shards from a bonus (daily visit, trophy). Never below zero, capped like every other shard source. */
  grantShards(n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this.sagaData.shards = Math.min(999, this.sagaData.shards + Math.floor(n));
    this.save();
  }

  /**
   * The player found this stage's hidden stash. Returns true the first time (it then pays SECRET_SHARDS); finding
   * it again changes nothing.
   */
  foundSecret(id: SagaId): boolean {
    if (this.sagaData.secrets.includes(id)) return false;
    this.sagaData.secrets.push(id);
    this.sagaData.shards = Math.min(999, this.sagaData.shards + SECRET_SHARDS);
    this.save();
    return true;
  }

  hasSecret(id: SagaId): boolean {
    return this.sagaData.secrets.includes(id);
  }

  /** Hidden stashes found over the whole saga (out of 10). */
  secretsFound(): number {
    return this.sagaData.secrets.length;
  }

  /** Saga stages cleared at least once. */
  sagaCleared(): number {
    return SAGA_IDS.filter((id) => this.data[id] !== undefined).length;
  }

  /** Pay for a continue with shards. Returns false (and spends nothing) when there are not enough. */
  spendShards(n: number): boolean {
    if (this.sagaData.shards < n) return false;
    this.sagaData.shards -= n;
    this.save();
    return true;
  }

  /** Is this saga stage open to play? */
  unlocked(id: SagaId): boolean {
    const i = SAGA_IDS.indexOf(id);
    return i <= 0 || this.data[SAGA_IDS[i - 1] as SagaId] !== undefined;
  }

  /** The stage the big PLAY button starts: the first open stage not yet cleared (or the last one). */
  nextSagaStage(): SagaId {
    for (const id of SAGA_IDS) if (this.unlocked(id) && !this.data[id]) return id;
    return SAGA_IDS[SAGA_IDS.length - 1] as SagaId;
  }

  /** Stars collected over the whole saga (out of 30). */
  sagaStars(): number {
    return SAGA_IDS.reduce((n, id) => n + (this.data[id]?.stars ?? 0), 0);
  }

  private save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
      this.storage?.setItem(SAGA_KEY, JSON.stringify(this.sagaData));
    } catch {
      /* storage full or blocked: progress just won't persist */
    }
  }
}

function sanitize(raw: unknown): Partial<Record<MissionId, MissionRecord>> {
  const out: Partial<Record<MissionId, MissionRecord>> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isMissionId(k) || typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    const best = typeof r.best === 'number' && Number.isFinite(r.best) && r.best > 0 ? r.best : null;
    const hardest = r.hardest === 'easy' || r.hardest === 'normal' || r.hardest === 'hard' ? r.hardest : null;
    // Records saved before stars existed count as one star.
    const stars = typeof r.stars === 'number' && r.stars >= 1 && r.stars <= 3 ? Math.round(r.stars) : 1;
    if (best !== null && hardest) out[k] = { best, hardest, stars };
  }
  return out;
}

function read(storage: Pick<Storage, 'getItem'> | null, key: string): unknown {
  try {
    const text = storage?.getItem(key);
    return text ? JSON.parse(text) : null;
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
