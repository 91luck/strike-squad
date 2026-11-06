import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * The CrazyGames build (client/dist-crazygames), played the way the portal serves it: from a folder on another
 * origin, with the CrazyGames SDK loaded from sdk.crazygames.com. Both are faked here with request routing (no
 * network): the game files come from disk, and the SDK is a small stand-in that records every call the game
 * makes and plays (or refuses) ads on cue. Nothing else may be requested: any other URL fails the test.
 */

const DIST = join(import.meta.dirname, '..', 'client', 'dist-crazygames');
const ORIGIN = 'https://strike-squad.game-files.crazygames.com';
const GAME = `${ORIGIN}/v1/`;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** The SDK stand-in: same surface as the real HTML5 SDK v3 for what the game uses. */
const FAKE_SDK = `
window.__cg = { calls: [], data: {}, adMode: 'ok' };
const log = (c) => window.__cg.calls.push(c);
window.CrazyGames = { SDK: {
  environment: 'crazygames',
  init: async () => log('init'),
  game: {
    gameplayStart: () => log('gameplayStart'),
    gameplayStop: () => log('gameplayStop'),
    loadingStart: () => log('loadingStart'),
    loadingStop: () => log('loadingStop'),
    happytime: () => log('happytime'),
    inviteLink: (p) => 'https://www.crazygames.com/game/strike-squad?squad=' + p.squad,
    showInviteButton: (p) => { log('showInvite:' + p.squad); return ''; },
    hideInviteButton: () => log('hideInvite'),
    getInviteParam: () => null,
    updateRoom: (r) => log('updateRoom:' + r.roomId + ':' + r.isJoinable),
    leftRoom: () => log('leftRoom'),
    addJoinRoomListener: () => undefined,
    inviteParams: null,
    isInstantMultiplayer: !!(window.__cgOpts && window.__cgOpts.instant),
    settings: { muteAudio: false },
    addSettingsChangeListener: () => undefined,
  },
  ad: {
    requestAd: (kind, cb) => {
      log('ad:' + kind);
      setTimeout(() => {
        if (window.__cg.adMode === 'ok') {
          cb.adStarted && cb.adStarted();
          log('adPlaying');
          setTimeout(() => cb.adFinished && cb.adFinished(), 300);
        } else cb.adError && cb.adError({ code: 'unfilled', message: 'no fill' });
      }, 50);
    },
  },
  user: { isUserAccountAvailable: true, getUser: async () => ({ username: 'CG_Player' }) },
  data: {
    getItem: (k) => (k in window.__cg.data ? window.__cg.data[k] : null),
    setItem: (k, v) => { window.__cg.data[k] = String(v); },
    removeItem: (k) => { delete window.__cg.data[k]; },
    clear: () => { window.__cg.data = {}; },
  },
} };
`;

test.skip(!existsSync(join(DIST, 'index.html')), 'run `npm run build:crazygames` first');
test.describe.configure({ mode: 'serial' });

interface Cg {
  calls: string[];
  data: Record<string, string>;
  adMode: string;
}

async function openPortal(page: Page, failed: string[], landing = 'btn-saga'): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === 'https://sdk.crazygames.com/crazygames-sdk-v3.js')
      return route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK });
    if (url.startsWith(GAME)) {
      const rel = decodeURIComponent(new URL(url).pathname.slice('/v1/'.length)) || 'index.html';
      const file = join(DIST, rel);
      if (existsSync(file))
        return route.fulfill({
          contentType: TYPES[extname(file)] ?? 'application/octet-stream',
          body: readFileSync(file),
        });
    }
    // The co-op server is not part of this test; anything else is a mistake (an absolute path, a stray fetch).
    if (!url.includes('workers.dev')) failed.push(url);
    return route.abort();
  });
  await page.goto(`${GAME}index.html`);
  await expect(page.getByTestId(landing)).toBeVisible();
}

const cg = (page: Page): Promise<Cg> => page.evaluate(() => (window as unknown as { __cg: Cg }).__cg);
const hook = <T>(page: Page, fn: string): Promise<T> =>
  page.evaluate(`window.__strikesquad.${fn}`) as Promise<T>;

test('the CrazyGames build loads from a portal folder with the SDK, and lands in a stage in one click', async ({
  page,
}) => {
  const failed: string[] = [];
  await openPortal(page, failed);
  expect(await hook(page, 'platform')).toBe('crazygames');
  expect(failed).toEqual([]); // every file loaded through a relative path
  // No own fullscreen button, install button or outside share links on the portal.
  await expect(page.locator('#btn-fullscreen')).toBeHidden();
  await expect(page.locator('#btn-install')).toBeHidden();
  // Signed-in portal players get their portal name as the callsign.
  await expect(page.getByTestId('name-input')).toHaveValue('CG_Player');
  let c = await cg(page);
  expect(c.calls.slice(0, 3)).toEqual(['init', 'loadingStart', 'loadingStop']);
  expect(c.calls).not.toContain('gameplayStart'); // the menu is not gameplay

  await page.getByTestId('btn-saga').click();
  await expect.poll(() => hook(page, 'phase'), { timeout: 15_000 }).toBe('playing');
  c = await cg(page);
  expect(c.calls.filter((x) => x === 'gameplayStart')).toHaveLength(1);
  expect(c.calls.some((x) => x.startsWith('ad:'))).toBe(false); // no ad before the very first stage

  // Pause is a break; resuming is gameplay again.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('btn-resume')).toBeVisible();
  await page.getByTestId('btn-resume').click();
  c = await cg(page);
  expect(c.calls.slice(-2)).toEqual(['gameplayStop', 'gameplayStart']);
});

test('"play with friends" on the portal opens straight on making a squad', async ({ page }) => {
  const failed: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __cgOpts: unknown }).__cgOpts = { instant: true };
  });
  await openPortal(page, failed, 'btn-create-go');
  await expect(page.getByTestId('btn-create-go')).toBeVisible();
  expect(failed).toEqual([]);
});

test('out of lives: a rewarded video continues the run; the reward only comes when the ad finished', async ({
  page,
}) => {
  const failed: string[] = [];
  await openPortal(page, failed);
  await page.getByTestId('btn-saga').click();
  await expect.poll(() => hook(page, 'phase'), { timeout: 15_000 }).toBe('playing');
  await page.evaluate(() => {
    const s = (
      window as unknown as {
        __strikesquad: {
          soloSim: { lives: number; players: Map<string, unknown>; koPlayer(p: unknown): void };
        };
      }
    ).__strikesquad.soloSim;
    s.lives = 0;
    for (const p of s.players.values()) s.koPlayer(p);
  });
  await expect(page.getByTestId('overlay-continue')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('btn-continue-ad')).toBeVisible();
  expect((await cg(page)).calls.at(-1)).toBe('gameplayStop');
  await page.getByTestId('btn-continue-ad').click();
  await expect(page.getByTestId('overlay-continue')).toBeHidden();
  await expect.poll(() => hook(page, 'phase')).toBe('playing');
  expect(await page.evaluate('window.__strikesquad.soloSim.lives')).toBeGreaterThanOrEqual(1);
  const c = await cg(page);
  expect(c.calls).toContain('ad:rewarded');
  expect(c.calls.indexOf('adPlaying')).toBeGreaterThan(c.calls.indexOf('ad:rewarded'));
  expect(c.calls.at(-1)).toBe('gameplayStart');
});

test('no video available: no reward, the video button goes away, and shards still work', async ({ page }) => {
  const failed: string[] = [];
  await openPortal(page, failed);
  await page.evaluate(() => ((window as unknown as { __cg: Cg }).__cg.adMode = 'none'));
  await page.getByTestId('btn-saga').click();
  await expect.poll(() => hook(page, 'phase'), { timeout: 15_000 }).toBe('playing');
  const ko = (): Promise<void> =>
    page.evaluate(() => {
      const s = (
        window as unknown as {
          __strikesquad: {
            soloSim: { lives: number; players: Map<string, unknown>; koPlayer(p: unknown): void };
          };
        }
      ).__strikesquad.soloSim;
      s.lives = 0;
      for (const p of s.players.values()) s.koPlayer(p);
    });
  await ko();
  await expect(page.getByTestId('overlay-continue')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('btn-continue-ad').click();
  await expect(page.getByTestId('btn-continue-ad')).toBeHidden();
  await expect(page.locator('#continue-note')).toContainText('No video');
  expect(await hook(page, 'phase')).not.toBe('playing'); // nothing granted
  // A new player holds the starting shards plus today's daily-visit shard; a continue costs exactly 3.
  const before = (await hook(page, 'progress')) as { shards: number };
  expect(before.shards).toBeGreaterThanOrEqual(3);
  await page.getByTestId('btn-continue-shards').click();
  await expect.poll(() => hook(page, 'phase')).toBe('playing');
  // Shards were spent from the cloud save.
  const saga = JSON.parse((await cg(page)).data['strikesquad.saga.v1'] ?? '{}') as { shards: number };
  expect(saga.shards).toBe(before.shards - 3);
});

test('a cleared stage is saved to the portal account, celebrated, and the next stage starts after a midgame break', async ({
  page,
}) => {
  const failed: string[] = [];
  await openPortal(page, failed);
  await page.getByTestId('btn-saga').click();
  await expect.poll(() => hook(page, 'phase'), { timeout: 15_000 }).toBe('playing');
  await page.evaluate(() =>
    (
      window as unknown as { __strikesquad: { soloSim: { finish(r: string): void } } }
    ).__strikesquad.soloSim.finish('won'),
  );
  await expect(page.getByTestId('result-title')).toHaveText('Mission complete!', { timeout: 10_000 });
  let c = await cg(page);
  expect(c.calls).toContain('happytime');
  expect(c.calls.lastIndexOf('gameplayStop')).toBeGreaterThan(c.calls.lastIndexOf('gameplayStart')); // results = a break
  expect(JSON.parse(c.data['strikesquad.progress.v1'] ?? '{}')).toHaveProperty('astra-1');
  await expect(page.getByTestId('btn-next-mission')).toHaveText(/Sagar Setu/);
  await page.getByTestId('btn-next-mission').click();
  await expect.poll(() => hook(page, 'phase'), { timeout: 15_000 }).toBe('playing');
  c = await cg(page);
  const ad = c.calls.lastIndexOf('ad:midgame');
  expect(ad).toBeGreaterThan(-1);
  expect(c.calls.lastIndexOf('gameplayStart')).toBeGreaterThan(ad); // gameplay resumes after the break
  expect(await page.evaluate('window.__strikesquad.soloSim.level.id')).toBe('astra-2');
  expect(failed).toEqual([]);
});
