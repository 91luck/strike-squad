import { NAME_REGEX, GAME_CONFIG } from '@strikesquad/shared';

export interface Settings {
  name: string;
  volume: number; // 0..100
  muted: boolean;
  reduceMotion: boolean;
  showStats: boolean;
  touchSensitivity: number; // 50..150 (%)
  keyFire: string; // KeyboardEvent.code
  keyJump: string;
  /** Phones: keep shooting automatically once the on-screen controls are used (no thumb needed for Fire). */
  autoFire: boolean;
  /** Favourite hero (0..7), picked in the lobby or for solo training. */
  hero: number;
  /** The first-match control hints have been shown. */
  coachSeen: boolean;
  /** Touch layout: 'right' = joystick left, buttons right (default); 'left' = mirrored for left-handers. */
  hand: 'right' | 'left';
}

const KEY = 'strikesquad.settings.v1';

export function defaultSettings(): Settings {
  const prefersReduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    name: '',
    volume: 60,
    muted: false,
    reduceMotion: prefersReduced,
    showStats: false,
    touchSensitivity: 100,
    keyFire: 'KeyJ',
    keyJump: 'Space',
    autoFire: true,
    hero: 0,
    coachSeen: false,
    hand: 'right',
  };
}

const clampNum = (v: unknown, lo: number, hi: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;

/** Sanitise anything read from storage - it is user-editable, so never trust it. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, GAME_CONFIG.limits.maxNameLength) : '';
  const code = (v: unknown, def: string): string =>
    typeof v === 'string' && /^[A-Za-z0-9]{1,20}$/.test(v) ? v : def;
  return {
    name: name && NAME_REGEX.test(name) ? name : d.name,
    volume: clampNum(r.volume, 0, 100, d.volume),
    muted: r.muted === true,
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : d.reduceMotion,
    showStats: r.showStats === true,
    touchSensitivity: clampNum(r.touchSensitivity, 50, 150, d.touchSensitivity),
    keyFire: code(r.keyFire, d.keyFire),
    keyJump: code(r.keyJump, d.keyJump),
    autoFire: typeof r.autoFire === 'boolean' ? r.autoFire : d.autoFire,
    hero:
      typeof r.hero === 'number' && Number.isInteger(r.hero) && r.hero >= 0 && r.hero < 8 ? r.hero : d.hero,
    coachSeen: r.coachSeen === true,
    hand: r.hand === 'left' ? 'left' : 'right',
  };
}

export class SettingsStore {
  value: Settings;
  private listeners: ((s: Settings) => void)[] = [];

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    this.value = sanitizeSettings(readStored(storage));
  }

  update(patch: Partial<Settings>): void {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* storage full/blocked: settings simply won't persist */
    }
    for (const l of this.listeners) l(this.value);
  }

  onChange(fn: (s: Settings) => void): void {
    this.listeners.push(fn);
  }
}

function readStored(storage: Pick<Storage, 'getItem'> | null): unknown {
  try {
    const text = storage?.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null; // corrupted or blocked storage: fall back to defaults
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function keyLabel(code: string): string {
  if (code === 'Space') return 'Space';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/(Left|Right)$/, '');
}
