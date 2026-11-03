import { expect, test, type Page } from '@playwright/test';

interface Self {
  x: number;
  y: number;
  alive: boolean;
  hp: number;
  weapon: number;
}
interface Hooks {
  screen: string;
  roomCode: string | null;
  phase: string | null;
  self: Self | null;
  snap: {
    players: { id: string; n: string; x: number; y: number; fi: number; ml: number }[];
    tick: number;
  } | null;
  stats: { kills: number; ults: number };
}

const hooks = <T>(page: Page, fn: (h: Hooks) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__strikesquad)`) as Promise<T>;

const gotoMenu = async (page: Page, name: string): Promise<void> => {
  await page.goto('/');
  await expect(page.getByTestId('btn-play')).toBeVisible();
  await page.getByTestId('name-input').fill(name);
};

/** Wait until the mission is really on (countdown finished). */
async function waitForMission(page: Page): Promise<void> {
  await expect.poll(() => hooks(page, (h) => h.phase), { timeout: 20_000 }).toBe('playing');
  await expect(page.getByTestId('countdown')).toBeHidden();
}

/** True when the canvas contains more than a flat colour, i.e. something was actually drawn. */
async function canvasHasContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.getElementById('game') as HTMLCanvasElement;
    const g = c.getContext('2d');
    if (!g) return false;
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) {
      seen.add(((data[i] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i + 2] as number));
      if (seen.size > 12) return true;
    }
    return false;
  });
}

async function createSquad(page: Page, name: string, difficulty = 'normal'): Promise<string> {
  await gotoMenu(page, name);
  await page.getByTestId('btn-create').click();
  await page.getByTestId('create-difficulty').selectOption(difficulty);
  await page.getByTestId('btn-create-go').click();
  await expect(page.getByTestId('lobby-code')).toHaveText(/^[A-Z2-9]{6}$/);
  return (await page.getByTestId('lobby-code').textContent()) as string;
}

async function joinByLink(page: Page, code: string, name: string): Promise<void> {
  await page.addInitScript(
    (n) => localStorage.setItem('strikesquad.settings.v1', JSON.stringify({ name: n })),
    name,
  );
  await page.goto(`/join/${code}`);
  await page.getByTestId('btn-join-go').click();
}

test('menu shows every entry point and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await gotoMenu(page, 'Tester');
  for (const id of ['btn-play', 'btn-create', 'btn-join', 'btn-practice', 'btn-howto', 'btn-settings']) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await page.getByTestId('btn-howto').click();
  const howto = page.getByRole('dialog', { name: 'How to play' });
  await expect(howto).toBeVisible();
  await expect(howto).toContainText('Super moves');
  await expect(howto).toContainText('WARHOUND');
  await page.keyboard.press('Escape');
  await expect(howto).toBeHidden();
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});

test('the menu shows your hero; the choice is remembered and used in the squad', async ({ page }) => {
  await gotoMenu(page, 'Picker');
  await expect(page.getByTestId('hero-name')).toHaveText('Blaze');
  await page.getByRole('button', { name: 'Next hero' }).click();
  await expect(page.getByTestId('hero-name')).toHaveText('Nova');
  await page.reload();
  await expect(page.getByTestId('hero-name')).toHaveText('Nova');
  await page.getByTestId('btn-create').click();
  await page.getByTestId('btn-create-go').click();
  await expect(page.getByTestId('squad-list')).toContainText('Nova');
  await page.getByTestId('hero-7').click();
  await expect(page.getByTestId('squad-list')).toContainText('Sarge');
  await expect(page.getByTestId('hero-7')).toHaveAttribute('aria-checked', 'true');
});

test('invalid squad code shows an inline error and nothing is sent', async ({ page }) => {
  let sockets = 0;
  page.on('websocket', () => sockets++);
  await gotoMenu(page, 'Tester');
  await page.getByTestId('btn-join').click();
  await page.getByTestId('join-code').fill('ZZZ');
  await page.getByTestId('btn-join-go').click();
  await expect(page.locator('#join-error')).toBeVisible();
  expect(sockets).toBe(0); // validated locally, no connection opened
});

test('menu tells the player whether the game server is reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('conn-status')).toHaveText('Server ready');
});

test('unknown but well-formed squad code reports not found', async ({ page }) => {
  await gotoMenu(page, 'Tester');
  await page.getByTestId('btn-join').click();
  await page.getByTestId('join-code').fill('ABCDEF');
  await page.getByTestId('btn-join-go').click();
  await expect(page.locator('#join-error')).toContainText(/no room|not found|code/i);
});

test('solo training: countdown, run and shoot, pause really pauses, resume, quit', async ({ page }) => {
  await gotoMenu(page, 'Solo');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('practice-buddies').selectOption('0');
  await page.getByTestId('practice-diff').selectOption('easy');
  await page.getByTestId('btn-practice-go').click();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await expect(page.getByTestId('countdown')).toBeVisible();
  await waitForMission(page);
  expect(await canvasHasContent(page)).toBe(true);
  await expect(page.getByTestId('hud-lives')).toHaveText('♥ 7'); // easy: 6 + 1 per player
  await expect(page.getByTestId('hud-hp')).toHaveAttribute('aria-valuenow', '100');

  const x0 = (await hooks(page, (h) => h.self))!.x;
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  const x1 = (await hooks(page, (h) => h.self))!.x;
  expect(x1 - x0, 'ran right').toBeGreaterThan(80);
  // Shooting: the first soldiers are close to the start; keep firing until one falls.
  await expect.poll(() => hooks(page, (h) => h.stats.kills), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.keyboard.up('KeyJ');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  const t1 = await hooks(page, (h) => h.snap!.tick);
  await page.waitForTimeout(1200);
  expect(await hooks(page, (h) => h.snap!.tick)).toBe(t1); // solo really pauses
  await page.getByTestId('btn-resume').click();
  await expect(page.getByTestId('pause')).toBeHidden();

  await page.keyboard.press('Escape');
  await page.getByTestId('btn-pause-leave').click();
  await page.getByTestId('btn-confirm-yes').click();
  await expect(page.getByTestId('btn-play')).toBeVisible();
});

test('solo moves: dash bursts ahead, the knife swings, a full meter fires the super move', async ({
  page,
}) => {
  await gotoMenu(page, 'Mover');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('practice-buddies').selectOption('0');
  await page.getByTestId('practice-diff').selectOption('easy');
  await page.getByTestId('btn-practice-go').click();
  await waitForMission(page);
  // Dash: one tap of Shift covers ~3 tiles in a blink.
  const x0 = (await hooks(page, (h) => h.self))!.x;
  await page.keyboard.press('ShiftLeft');
  await page.waitForTimeout(400);
  const x1 = (await hooks(page, (h) => h.self))!.x;
  expect(x1 - x0, 'dashed').toBeGreaterThan(70);
  // Knife.
  await page.keyboard.press('KeyF');
  await expect
    .poll(() => hooks(page, (h) => h.snap!.players[0]!.ml), { timeout: 2000, intervals: [10] })
    .toBeGreaterThan(0);
  // Super move: fill the meter (offline solo only), press Q.
  await page.evaluate(() => {
    const w = window as unknown as { __strikesquad: { soloSim: { players: Map<string, { ult: number }> } } };
    w.__strikesquad.soloSim.players.get('me')!.ult = 100;
  });
  await expect(page.getByTestId('hud-ult')).toHaveClass(/ready/);
  await page.keyboard.press('KeyQ');
  await expect.poll(() => hooks(page, (h) => h.stats.ults), { timeout: 3000 }).toBe(1);
  await expect(page.getByTestId('hud-ult')).not.toHaveClass(/ready/);
});

test('solo training with computer buddies: they run with you (and are labelled as bots)', async ({
  page,
}) => {
  await gotoMenu(page, 'Leader');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('practice-buddies').selectOption('3');
  await page.getByTestId('btn-practice-go').click();
  await waitForMission(page);
  const before = await hooks(page, (h) => h.snap!.players.map((p) => ({ n: p.n, x: p.x })));
  expect(before).toHaveLength(4);
  expect(before.filter((p) => p.n.endsWith('(bot)'))).toHaveLength(3);
  await page.waitForTimeout(2500);
  const after = await hooks(page, (h) => h.snap!.players.map((p) => ({ n: p.n, x: p.x })));
  const botsMoved = after.filter((p, i) => p.n.endsWith('(bot)') && p.x > (before[i]?.x ?? 0) + 60);
  expect(botsMoved.length).toBeGreaterThan(0);
});

test('@fastclock private squad: friend joins by invite link, both play, the mission ends with a squad report', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const code = await createSquad(host, 'HostAnn', 'hard');
  await expect(host.getByTestId('btn-whatsapp')).toHaveAttribute('href', new RegExp(`wa\\.me/.*${code}`));

  await joinByLink(guest, code, 'GuestBo');
  await expect(guest.getByTestId('squad-list')).toContainText('HostAnn');
  await expect(host.getByTestId('squad-list')).toContainText('GuestBo');
  await expect(guest.getByTestId('btn-start')).toBeHidden(); // only the host starts

  await host.getByTestId('btn-start').click();
  await waitForMission(host);
  await waitForMission(guest);
  const players = await hooks(guest, (h) => h.snap!.players.map((p) => p.n).sort());
  expect(players).toEqual(['GuestBo', 'HostAnn']);
  // The guest runs; the host's screen shows it (server-authoritative replication).
  const gx0 = (await hooks(guest, (h) => h.self))!.x;
  await guest.keyboard.down('ArrowRight');
  await guest.waitForTimeout(600);
  await guest.keyboard.up('ArrowRight');
  await expect
    .poll(async () => {
      const id = await guest.evaluate(
        () =>
          (
            window as unknown as { __strikesquad: { snap: { players: { n: string; x: number }[] } } }
          ).__strikesquad.snap.players.find((p) => p.n === 'GuestBo')!.x,
      );
      return id;
    })
    .toBeGreaterThan(gx0 + 50);

  // Nobody fights back: on hard the squad eventually runs out of lives and the mission fails for both.
  await expect(host.getByTestId('result-title')).toHaveText('Mission failed', { timeout: 150_000 });
  await expect(guest.getByTestId('result-title')).toHaveText('Mission failed', { timeout: 10_000 });
  await expect(host.getByTestId('scoreboard')).toContainText('GuestBo');
  await expect(host.getByTestId('btn-rematch')).toBeEnabled();
  await expect(guest.getByTestId('btn-rematch')).toBeDisabled();
  await host.getByTestId('btn-rematch').click();
  await expect(guest.getByTestId('countdown')).toBeVisible();
  await hostCtx.close();
  await guestCtx.close();
});

test('a dropped connection reconnects and resumes the same seat', async ({ page }) => {
  const sockets: { close: (o?: { code?: number }) => Promise<void> }[] = [];
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.connectToServer();
    sockets.push(ws);
  });
  const code = await createSquad(page, 'Flaky');
  expect(sockets).toHaveLength(1);
  await sockets[0]?.close({ code: 1006 });
  await expect.poll(() => sockets.length, { timeout: 15_000 }).toBe(2); // the client really opened a new socket
  await expect(page.getByTestId('conn-status')).toHaveText('Online', { timeout: 15_000 });
  await expect(page.getByTestId('lobby-code')).toHaveText(code); // same squad, same seat
  expect(await hooks(page, (h) => h.screen)).toBe('lobby');
});

test('Play now starts a public mission at once, and the next "Play now" player drops into it', async ({
  browser,
}) => {
  const aCtx = await browser.newContext();
  const bCtx = await browser.newContext();
  const a = await aCtx.newPage();
  const b = await bCtx.newPage();
  await gotoMenu(a, 'FirstFay');
  await a.getByTestId('btn-play').click();
  await expect(a.getByTestId('canvas')).toBeVisible({ timeout: 10_000 });
  await waitForMission(a);
  await gotoMenu(b, 'SecondSam');
  await b.getByTestId('btn-play').click();
  await expect(b.getByTestId('canvas')).toBeVisible({ timeout: 10_000 });
  await expect(a.locator('#killfeed')).toContainText('SecondSam joined the squad');
  expect(await hooks(b, (h) => h.roomCode)).toBe(await hooks(a, (h) => h.roomCode));
  await aCtx.close();
  await bCtx.close();
});

test('drop-in: a friend opening the invite link mid-mission appears next to the squad', async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const lateCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const late = await lateCtx.newPage();
  const code = await createSquad(host, 'HostHen', 'easy');
  await host.getByTestId('btn-start').click();
  await waitForMission(host);
  await host.keyboard.down('KeyD');
  await host.waitForTimeout(500);
  await host.keyboard.up('KeyD');

  await joinByLink(late, code, 'LateLiam');
  await expect(late.getByTestId('canvas')).toBeVisible();
  await expect(late.locator('#killfeed')).toContainText('mid-mission');
  await expect(host.locator('#killfeed')).toContainText('LateLiam joined the squad');
  await expect.poll(() => hooks(late, (h) => h.snap?.players.length ?? 0)).toBe(2);
  const xs = await hooks(late, (h) => h.snap!.players.map((p) => p.x));
  expect(Math.abs((xs[0] as number) - (xs[1] as number)), 'spawned beside the host').toBeLessThan(200);
  expect(await canvasHasContent(late)).toBe(true);
  await hostCtx.close();
  await lateCtx.close();
});

test('online inputs carry the server tick on screen, a plausible distance behind the server (lag compensation)', async ({
  page,
}) => {
  const lags: number[] = [];
  let lastSnapTick = 0;
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => {
      const m = /^\{"t":"snap","ack":\d+,"s":\{"tick":(\d+)/.exec(String(f.payload));
      if (m) lastSnapTick = Number(m[1]);
    });
    ws.on('framesent', (f) => {
      const text = String(f.payload);
      if (!text.startsWith('{"t":"input"')) return;
      const msg = JSON.parse(text) as { vt?: number };
      if (typeof msg.vt === 'number' && lastSnapTick > 0) lags.push(lastSnapTick - msg.vt);
    });
  });
  await createSquad(page, 'Aimer');
  await page.getByTestId('btn-start').click();
  await waitForMission(page);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyJ');
  expect(lags.length).toBeGreaterThan(10);
  lags.sort((x, y) => x - y);
  const median = lags[Math.floor(lags.length / 2)]!;
  // On localhost the screen shows the world ~2 snapshot intervals (4 ticks at 30 Hz) behind the newest snapshot.
  expect(median, `median view lag ${median} ticks`).toBeGreaterThanOrEqual(1);
  expect(median, `median view lag ${median} ticks`).toBeLessThanOrEqual(12);
});

test('a slow-to-wake server shows the wake-up screen with a way out', async ({ page }) => {
  await page.routeWebSocket(/\/ws$/, () => undefined); // accept, never answer: a cold-starting free host
  await gotoMenu(page, 'Patient');
  await page.getByTestId('btn-create').click();
  await page.getByTestId('btn-create-go').click();
  await expect(page.getByTestId('overlay-wake')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('overlay-wake')).toContainText(/sleep/i);
  await page.getByRole('button', { name: 'Solo training while waiting' }).click();
  await expect(page.getByTestId('btn-practice-go')).toBeVisible();
});

test('the app is installable: manifest, icons and service worker are served', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const json = (await manifest.json()) as { name: string; icons: { src: string }[] };
  expect(json.name).toContain('STRIKE SQUAD');
  for (const icon of json.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get('/sw.js')).ok()).toBe(true);
});

test('the page asks browsers not to offer translation (no popups over the touch controls)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('meta[name="google"]')).toHaveAttribute('content', 'notranslate');
  await expect(page.locator('html')).toHaveAttribute('translate', 'no');
});

// ---------------------------------------------------------------- phones

/** Real multi-touch: left thumb pushes the stick right, right thumb taps JUMP a few times. */
async function thumbs(page: Page, ms: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const zone = (await page.locator('#joy-zone').boundingBox())!;
  const jump = (await page.getByTestId('touch-jump').boundingBox())!;
  const sx = zone.x + zone.width * 0.4;
  const sy = zone.y + zone.height * 0.6;
  const stick = (dx: number) => ({ x: sx + dx, y: sy, id: 1 });
  const jumpTouch = { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick(0)] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [stick(i * 10)] });
    await page.waitForTimeout(16);
  }
  const rounds = Math.max(1, Math.round(ms / 600));
  for (let r = 0; r < rounds; r++) {
    await page.waitForTimeout(300);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick(50), jumpTouch] });
    // Hold Jump until the soldier is clearly up (server-confirmed when a tracker runs), so a slow emulated phone
    // that renders few frames still sends a held jump rather than a one-tick tap.
    await page
      .waitForFunction(
        () => {
          const t = (window as unknown as { __track?: { y0: number; minY: number } }).__track;
          return t ? t.y0 - t.minY > 60 : false;
        },
        undefined,
        { timeout: 1500, polling: 20 },
      )
      .catch(() => undefined);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick(50)] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * Sample the server-confirmed position of our soldier while `action` runs. Sampling runs inside the page every
 * 10 ms so that short jumps are caught even when the test server's clock runs 4x fast.
 */
async function trackDuring(page: Page, action: () => Promise<void>): Promise<{ dx: number; rose: number }> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __track: { x0: number; y0: number; maxX: number; minY: number };
      __trackTimer: number;
      __strikesquad: { self: { x: number; y: number; alive: boolean } | null };
    };
    const s = w.__strikesquad.self!;
    w.__track = { x0: s.x, y0: s.y, maxX: s.x, minY: s.y };
    w.__trackTimer = window.setInterval(() => {
      const c = w.__strikesquad.self;
      if (!c?.alive) return;
      w.__track.maxX = Math.max(w.__track.maxX, c.x);
      w.__track.minY = Math.min(w.__track.minY, c.y);
    }, 10);
  });
  await action();
  return page.evaluate(() => {
    const w = window as unknown as {
      __track: { x0: number; y0: number; maxX: number; minY: number };
      __trackTimer: number;
    };
    window.clearInterval(w.__trackTimer);
    return { dx: w.__track.maxX - w.__track.x0, rose: w.__track.y0 - w.__track.minY };
  });
}

test('@mobile touch controls are shown in a mission', async ({ page }) => {
  await gotoMenu(page, 'Thumbs');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('btn-practice-go').click();
  await expect(page.getByTestId('touch-jump')).toBeVisible();
  await expect(page.getByTestId('touch-fire')).toBeVisible();
  await expect(page.getByTestId('touch-dash')).toBeVisible();
  await expect(page.getByTestId('touch-melee')).toBeVisible();
  await expect(page.getByTestId('touch-ult')).toBeVisible();
});

test('@mobile solo on a phone in landscape: stick runs, JUMP jumps, auto-fire shoots', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await gotoMenu(page, 'Thumbs');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('practice-buddies').selectOption('0');
  await page.getByTestId('practice-diff').selectOption('easy');
  await page.getByTestId('btn-practice-go').click();
  await expect(page.getByTestId('touch-jump')).toBeVisible();
  await waitForMission(page);
  const t = await trackDuring(page, () => thumbs(page, 2400));
  expect(t.dx, `ran ${t.dx.toFixed(0)} px`).toBeGreaterThan(150);
  expect(t.rose, `jumped ${t.rose.toFixed(0)} px`).toBeGreaterThan(40);
  await expect.poll(() => hooks(page, (h) => h.snap!.players[0]!.fi), { timeout: 5000 }).toBe(1);
});

/** Centre of an on-screen button, for CDP touch points. */
async function centre(page: Page, id: string): Promise<{ x: number; y: number }> {
  const b = (await page.getByTestId(id).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('@mobile every move works with real multi-touch: dash, slide, double jump, knife, super', async ({
  page,
}) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await gotoMenu(page, 'Thumbs');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('practice-buddies').selectOption('0');
  await page.getByTestId('practice-diff').selectOption('easy');
  await page.getByTestId('btn-practice-go').click();
  await waitForMission(page);
  // Record the most extreme state our soldier reaches after every simulation tick (exact even when the
  // emulated phone drops frames and runs several ticks in one frame).
  await page.evaluate(() => {
    type Me = {
      x: number;
      y: number;
      dashTicks: number;
      slideTicks: number;
      meleeUntil: number;
      airJumps: number;
      onGround: boolean;
    };
    const w = window as unknown as {
      __seen: Record<string, number>;
      __strikesquad: { soloSim: { tick: number; step: () => void; players: Map<string, Me> } };
    };
    const sim = w.__strikesquad.soloSim;
    const me = sim.players.get('me')!;
    const y0 = me.y;
    w.__seen = { dsh: 0, sld: 0, ml: 0, rose: 0, aj: 0, x0: me.x, x: me.x };
    const step = sim.step.bind(sim);
    sim.step = () => {
      step();
      w.__seen.dsh = Math.max(w.__seen.dsh!, me.dashTicks);
      w.__seen.sld = Math.max(w.__seen.sld!, me.slideTicks);
      w.__seen.ml = Math.max(w.__seen.ml!, me.meleeUntil > sim.tick ? 1 : 0);
      w.__seen.rose = Math.max(w.__seen.rose!, y0 - me.y);
      if (!me.onGround && me.airJumps === 0) w.__seen.aj = 1; // the one air jump was spent: a double jump
      w.__seen.x = me.x;
    };
  });
  const seen = (): Promise<Record<string, number>> =>
    page.evaluate(() => (window as unknown as { __seen: Record<string, number> }).__seen);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, touchPoints: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const tap = async (id: string, hold: { x: number; y: number; id: number }[] = []) => {
    const c = await centre(page, id);
    await touch('touchStart', [...hold, { ...c, id: 9 }]);
    await page.waitForTimeout(90);
    await touch('touchEnd', hold);
  };

  // Dash (right thumb only).
  await tap('touch-dash');
  await expect
    .poll(
      async () => {
        const v = await seen();
        return v.dsh! > 0 ? 'dashed' : JSON.stringify(v);
      },
      { timeout: 3000 },
    )
    .toBe('dashed');

  // Slide: left thumb holds the stick down, right thumb taps Dash.
  const z = (await page.locator('#joy-zone').boundingBox())!;
  const st = { x: z.x + z.width * 0.4, y: z.y + z.height * 0.5, id: 1 };
  await touch('touchStart', [st]);
  for (let i = 1; i <= 5; i++) {
    await touch('touchMove', [{ ...st, y: st.y + i * 12 }]);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(700); // dash cooldown
  await tap('touch-dash', [{ ...st, y: st.y + 60 }]);
  await expect.poll(async () => (await seen()).sld, { timeout: 3000 }).toBeGreaterThan(0);
  await touch('touchEnd', []);

  // Double jump: a second, separate tap of Jump in mid-air. Timed off the simulation, not the wall clock (a slow
  // emulated phone can run several ticks per frame), and checked directly: the air jump gets spent.
  const meState = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __strikesquad: { soloSim: { players: Map<string, { onGround: boolean; prevJump: boolean }> } };
      };
      const m = w.__strikesquad.soloSim.players.get('me')!;
      return { onGround: m.onGround, prevJump: m.prevJump };
    });
  const j = await centre(page, 'touch-jump');
  await touch('touchStart', [{ ...j, id: 3 }]);
  await expect.poll(async () => (await meState()).onGround, { timeout: 3000 }).toBe(false);
  await touch('touchEnd', []);
  await expect.poll(async () => (await meState()).prevJump, { timeout: 3000 }).toBe(false);
  await touch('touchStart', [{ ...j, id: 4 }]);
  await expect.poll(async () => (await seen()).aj, { timeout: 3000 }).toBe(1);
  await touch('touchEnd', []);
  expect((await seen()).rose).toBeGreaterThan(40);

  // Knife.
  await page.waitForTimeout(600);
  await tap('touch-melee');
  await expect.poll(async () => (await seen()).ml, { timeout: 3000 }).toBeGreaterThan(0);

  // Super: the button lights up when the meter is full, one tap fires it.
  await page.evaluate(() => {
    const w = window as unknown as { __strikesquad: { soloSim: { players: Map<string, { ult: number }> } } };
    w.__strikesquad.soloSim.players.get('me')!.ult = 100;
  });
  await expect(page.getByTestId('touch-ult')).toHaveClass(/ready/);
  await tap('touch-ult');
  await expect.poll(() => hooks(page, (h) => h.stats.ults), { timeout: 3000 }).toBe(1);
  await cdp.detach();
});

for (const [w, h] of [
  [667, 375],
  [740, 360],
  [915, 412],
] as const) {
  test(`@mobile ${w}x${h}: the five buttons fit on screen and never overlap`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await gotoMenu(page, 'Small');
    await page.getByTestId('btn-practice').click();
    await page.getByTestId('btn-practice-go').click();
    await waitForMission(page);
    const ids = ['touch-jump', 'touch-fire', 'touch-dash', 'touch-melee', 'touch-ult'];
    const boxes = await Promise.all(ids.map(async (id) => (await page.getByTestId(id).boundingBox())!));
    for (const [i, b] of boxes.entries()) {
      expect(b.x, ids[i]).toBeGreaterThanOrEqual(0);
      expect(b.y, ids[i]).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, ids[i]).toBeLessThanOrEqual(w);
      expect(b.y + b.height, ids[i]).toBeLessThanOrEqual(h);
    }
    // Round buttons: centres further apart than the two radii.
    for (let a = 0; a < boxes.length; a++)
      for (let c = a + 1; c < boxes.length; c++) {
        const A = boxes[a]!;
        const C = boxes[c]!;
        const d = Math.hypot(A.x + A.width / 2 - C.x - C.width / 2, A.y + A.height / 2 - C.y - C.height / 2);
        expect(d, `${ids[a]} vs ${ids[c]}`).toBeGreaterThan((A.width + C.width) / 2 - 1);
      }
    // ...and stay clear of the joystick zone.
    const zone = (await page.locator('#joy-zone').boundingBox())!;
    for (const [i, b] of boxes.entries())
      expect(b.x, `${ids[i]} vs stick`).toBeGreaterThan(zone.x + zone.width);
  });
}

test('@mobile online mission from a phone: touch input reaches the server', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await createSquad(page, 'PhoneHost', 'easy');
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('touch-jump')).toBeVisible();
  await waitForMission(page);
  // self() is the server's snapshot, so this proves the server applied the touch input.
  const t = await trackDuring(page, async () => {
    await thumbs(page, 2400);
    await page.waitForTimeout(300);
  });
  expect(t.dx, `server moved soldier ${t.dx.toFixed(0)} px`).toBeGreaterThan(150);
  expect(t.rose).toBeGreaterThan(40);
});

test('@mobile advanced missions start with auto-fire off; the AUTO button and the ASTRA button work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await gotoMenu(page, 'Astra');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('practice-mission').selectOption('mission-5');
  await page.getByTestId('practice-buddies').selectOption('0');
  await page.getByTestId('btn-practice-go').click();
  await waitForMission(page);
  const auto = page.getByTestId('touch-auto');
  await expect(auto).toHaveText(/OFF/);
  await expect(page.getByTestId('touch-astra')).toBeVisible();
  // Standing still with auto-fire off: no shots.
  const fired = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __strikesquad: { soloSim: { players: Map<string, { input: { fire: boolean } }> } };
      };
      return w.__strikesquad.soloSim.players.get('me')!.input.fire;
    });
  await page.getByTestId('touch-jump').tap();
  await page.waitForTimeout(300);
  expect(await fired()).toBe(false);
  await auto.tap();
  await expect(auto).toHaveText(/ON/);
  await expect.poll(fired, { timeout: 3000 }).toBe(true);
  // The ASTRA button fires a held power.
  await page.evaluate(() => {
    const w = window as unknown as {
      __strikesquad: { soloSim: { players: Map<string, { power: string | null; powerN: number }> } };
    };
    const me = w.__strikesquad.soloSim.players.get('me')!;
    me.power = 'agni';
    me.powerN = 1;
  });
  await page.getByTestId('touch-astra').tap();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __strikesquad: { soloSim: { burns: unknown[] } } }).__strikesquad.soloSim
            .burns.length,
      ),
    )
    .toBe(1);
});

test('@mobile portrait phone gets a rotate prompt that can be dismissed', async ({ page }) => {
  await gotoMenu(page, 'Upright');
  await page.getByTestId('btn-practice').click();
  await page.getByTestId('btn-practice-go').click();
  const prompt = page.locator('#overlay-portrait');
  await expect(prompt).toBeVisible();
  await page.locator('#btn-portrait-dismiss').click();
  await expect(prompt).toBeHidden();
  await expect(page.getByTestId('touch-jump')).toBeVisible();
});
