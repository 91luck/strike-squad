/**
 * Where the game is running, and what that place provides: ads, accounts with cloud saves, invite links, and the
 * "gameplay started / stopped" signals a game portal needs. The rest of the game only ever talks to this
 * interface, so one codebase serves:
 *
 *   web         the game's own site: no ads, saves in this browser, invite links to /join/CODE
 *   crazygames  the CrazyGames portal, through its HTML5 SDK v3 (only in the `crazygames` build)
 *
 * Portal rules this module enforces for the rest of the game (CrazyGames requirements, see docs/CRAZYGAMES.md):
 *  - ads only through the SDK; the game pauses and mutes while one plays, and keeps working when ads fail or an
 *    ad blocker is on (a rewarded reward is granted only when the ad really finished);
 *  - every SDK call is guarded: outside CrazyGames the SDK throws, so the adapter falls back to `web`.
 */

/** The bit of `Storage` the stores use. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What to do while an ad plays (pause the game, mute) and after it (resume, unmute). */
export interface AdHooks {
  start(): void;
  end(): void;
}

export interface Platform {
  readonly id: 'web' | 'crazygames';
  /** Can ads be requested here at all (a request may still come back empty). */
  readonly ads: boolean;
  /** Where progress and settings are saved (null: nowhere, the game still runs). */
  readonly storage: StorageLike | null;
  /** Loading finished: the menu is up. */
  loadingStop(): void;
  /** Gameplay running (true) or a break: menus, pause, results, ads (false). Repeats are ignored. */
  gameplay(on: boolean): void;
  /** A moment worth celebrating (a stage cleared for the first time). */
  happytime(): void;
  /** A break between stages: may show an ad (the portal decides how often). Resolves when the game may go on. */
  midgameAd(hooks: AdHooks): Promise<void>;
  /** An ad the player asked for in exchange for a reward. Resolves true only if it played to the end. */
  rewardedAd(hooks: AdHooks): Promise<boolean>;
  /** The player's portal username, if they are signed in. */
  username(): Promise<string | null>;
  /** A link that brings a friend into squad `code`, or null to use the game's own /join/CODE link. */
  inviteLink(code: string): string | null;
  /** The squad code this page was opened to join (from a portal invite), if any. */
  invitedSquad(): string | null;
  /** Show the portal's own invite button for squad `code` (null hides it). */
  showInvite(code: string | null): void;
  /** May the game change the page URL (history.replaceState)? Not inside a portal's iframe. */
  readonly ownsUrl: boolean;
}

// ---------------------------------------------------------------- web

function localStore(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = '__strikesquad_probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function webPlatform(): Platform {
  return {
    id: 'web',
    ads: false,
    storage: localStore(),
    loadingStop: () => undefined,
    gameplay: () => undefined,
    happytime: () => undefined,
    midgameAd: async () => undefined,
    rewardedAd: async () => false,
    username: async () => null,
    inviteLink: () => null,
    invitedSquad: () => null,
    showInvite: () => undefined,
    ownsUrl: true,
  };
}

// ---------------------------------------------------------------- CrazyGames

/** The parts of the CrazyGames HTML5 SDK v3 this game uses (https://docs.crazygames.com/sdk/html5-v3/intro). */
export interface CrazySdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled' | string;
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
    inviteLink(params: Record<string, string>): string;
    showInviteButton(params: Record<string, string>): string;
    hideInviteButton?(): void;
    getInviteParam?(name: string): string | null;
  };
  ad: {
    requestAd(
      kind: 'midgame' | 'rewarded',
      callbacks: { adStarted?(): void; adFinished?(): void; adError?(error: unknown): void },
    ): void;
  };
  user?: {
    isUserAccountAvailable: boolean;
    getUser(): Promise<{ username: string } | null>;
  };
  data?: StorageLike;
}

/** Keys the game keeps; moved from localStorage into the portal's cloud save the first time. */
export const SAVE_KEYS = [
  'strikesquad.settings.v1',
  'strikesquad.progress.v1',
  'strikesquad.saga.v1',
  'strikesquad.profile.v1',
  'strikesquad.weekly.v1',
];

/**
 * Wraps the SDK. Exported for tests (they pass a fake SDK). Never throws: a failing SDK call is a no-op.
 */
export function crazyPlatform(sdk: CrazySdk): Platform {
  const safe = <T>(f: () => T, fallback: T): T => {
    try {
      return f();
    } catch {
      return fallback;
    }
  };
  let playing = false;
  let adBusy = false;
  // Cloud saves for signed-in players (the SDK keeps guests' data in localStorage itself).
  let storage: StorageLike | null = localStore();
  if (sdk.data) {
    const data = sdk.data;
    const legacy = storage;
    for (const k of SAVE_KEYS)
      safe(() => {
        const old = legacy?.getItem(k);
        if (data.getItem(k) === null && old) data.setItem(k, old);
      }, undefined);
    storage = {
      getItem: (k) => safe(() => data.getItem(k), null),
      setItem: (k, v) => safe(() => data.setItem(k, v), undefined),
      removeItem: (k) => safe(() => data.removeItem(k), undefined),
    };
  }

  const ad = (kind: 'midgame' | 'rewarded', hooks: AdHooks): Promise<boolean> =>
    new Promise((resolve) => {
      if (adBusy) return resolve(false);
      adBusy = true;
      let started = false;
      const done = (ok: boolean): void => {
        adBusy = false;
        if (started) hooks.end();
        resolve(ok);
      };
      try {
        sdk.ad.requestAd(kind, {
          adStarted: () => {
            // Pause and mute only once an ad is really on screen.
            started = true;
            hooks.start();
          },
          adFinished: () => done(true),
          adError: () => done(false),
        });
      } catch {
        done(false);
      }
    });

  return {
    id: 'crazygames',
    ads: true,
    storage,
    ownsUrl: false,
    loadingStop: () => safe(() => sdk.game.loadingStop(), undefined),
    gameplay(on) {
      if (on === playing) return;
      playing = on;
      safe(() => (on ? sdk.game.gameplayStart() : sdk.game.gameplayStop()), undefined);
    },
    happytime: () => safe(() => sdk.game.happytime(), undefined),
    midgameAd: async (hooks) => {
      await ad('midgame', hooks);
    },
    rewardedAd: (hooks) => ad('rewarded', hooks),
    username: async () => {
      try {
        if (!sdk.user?.isUserAccountAvailable) return null;
        const u = await sdk.user.getUser();
        return u?.username ?? null;
      } catch {
        return null;
      }
    },
    inviteLink: (code) => safe(() => sdk.game.inviteLink({ squad: code }), null),
    invitedSquad: () => safe(() => sdk.game.getInviteParam?.('squad') ?? null, null),
    showInvite(code) {
      safe(() => {
        if (code) sdk.game.showInviteButton({ squad: code });
        else sdk.game.hideInviteButton?.();
      }, undefined);
    },
  };
}

/**
 * Picks the platform for this page. The `crazygames` build loads the SDK script in index.html; this waits for
 * it (briefly) and falls back to `web` when it is missing, blocked, or the page is not on CrazyGames.
 */
export async function initPlatform(
  wanted: string | undefined = import.meta.env.VITE_PLATFORM,
  w: { CrazyGames?: { SDK?: CrazySdk } } = window as unknown as { CrazyGames?: { SDK?: CrazySdk } },
  timeoutMs = 8000,
): Promise<Platform> {
  if (wanted !== 'crazygames') return webPlatform();
  const sdk = w.CrazyGames?.SDK;
  if (!sdk) return webPlatform();
  try {
    await Promise.race([
      sdk.init(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timed out')), timeoutMs)),
    ]);
  } catch {
    return webPlatform();
  }
  if (sdk.environment !== 'crazygames' && sdk.environment !== 'local') return webPlatform();
  try {
    sdk.game.loadingStart();
  } catch {
    /* optional */
  }
  return crazyPlatform(sdk);
}
