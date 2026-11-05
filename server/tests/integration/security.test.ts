import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_CONFIG, PROTOCOL_VERSION } from '@strikesquad/shared';
import { ConfigError, isOriginAllowed, loadConfig, wildcardMatch } from '../../src/config';
import { TestClient, advance, createRoom, startMatch, startTestServer, type TestServer } from '../helpers';

let ts: TestServer;
const open: TestClient[] = [];

beforeEach(async () => {
  ts = await startTestServer();
});

afterEach(async () => {
  for (const c of open.splice(0)) await c.close().catch(() => undefined);
  await ts.stop();
});

async function room(names: string[]) {
  const r = await createRoom(ts, names);
  open.push(...r.clients);
  return r;
}

async function connect(): Promise<TestClient> {
  const c = await TestClient.connect(ts.port);
  open.push(c);
  return c;
}

const input = (
  seq: number,
  o: Partial<{ mx: number; my: number; jump: boolean; fire: boolean; ult: boolean }> = {},
) => ({
  t: 'input' as const,
  seq,
  mx: 0,
  my: 0,
  jump: false,
  fire: false,
  ...o,
});

const GROUND = 14 * GAME_CONFIG.tile;

function playerOf(code: string, id: string) {
  return ts.server.getRoom(code)!.sim!.players.get(id)!;
}

/** Put a soldier on open ground, standing still. */
function put(code: string, id: string, x: number): void {
  const p = playerOf(code, id);
  p.x = x;
  p.y = GROUND;
  p.vx = p.vy = 0;
}

/** Send an input and wait until the server has applied it (no ping, so it never touches the rate-limit bucket). */
async function sendInput(c: TestClient, code: string, msg: ReturnType<typeof input>): Promise<void> {
  c.send(msg);
  const p = playerOf(code, c.id);
  for (let i = 0; i < 500; i++) {
    if (p.input.fire === msg.fire && p.input.jump === msg.jump && p.input.mx === msg.mx) return;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error('server did not apply input in time');
}

/** After every abuse test the server must still be healthy and serve a fresh client. */
async function expectServerAlive(): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${ts.port}/health`);
  expect(res.status).toBe(200);
  const c = await TestClient.join(ts.port, 'Healthy');
  open.push(c);
  c.send({ t: 'createRoom' });
  expect((await c.next('room')).room.code).toHaveLength(6);
}

describe('input validation', () => {
  it('rejects malformed JSON without crashing', async () => {
    const c = await connect();
    c.sendRaw('{not json');
    c.sendRaw('');
    c.sendRaw('null');
    c.sendRaw('[1,2,3]');
    c.sendRaw('"just a string"');
    expect((await c.next('error')).code).toBe('bad_message');
    await c.sync();
    expect(c.all('error').length).toBeGreaterThanOrEqual(4);
    await expectServerAlive();
  });

  it('rejects binary frames', async () => {
    const c = await connect();
    c.sendRaw(Buffer.from([1, 2, 3, 4]));
    expect((await c.next('error')).code).toBe('bad_message');
  });

  it('rejects missing fields, wrong types and out-of-range values', async () => {
    const c = await TestClient.join(ts.port, 'Fuzz');
    open.push(c);
    const bad: unknown[] = [
      { t: 'joinRoom' },
      { t: 'joinRoom', code: 12345 },
      { t: 'input', seq: 'x', mx: 0, my: 0, jump: false, fire: false },
      { t: 'input', seq: 1, mx: 5, my: 0, jump: false, fire: false },
      { t: 'input', seq: 1, mx: 0.5, my: 0, jump: false, fire: false },
      { t: 'input', seq: 1, mx: 0, my: 0, jump: false, fire: 'yes' },
      { t: 'input', seq: -4, mx: 0, my: 0, jump: false, fire: false },
      { t: 'input', seq: 1.5, mx: 0, my: 0, jump: false, fire: false },
      { t: 'input', seq: 1, mx: null, my: 0, jump: false, fire: false },
      { t: 'input', seq: 1, mx: 0, my: 0, jump: false, fire: false, teleport: true },
      { t: 'setSettings', settings: { difficulty: 'impossible' } },
      { t: 'setSettings', settings: { lives: 99 } },
      { t: 'createRoom', settings: { difficulty: 'easy', godMode: true } },
      { t: 'setHero', hero: 8 },
      { t: 'setHero', hero: -1 },
      { t: 'setHero', hero: 1.5 },
      { t: 'setHero', hero: '3' },
      { t: 'ping', ts: 'now' },
      {},
      { t: 42 },
    ];
    for (const m of bad) c.send(m);
    await c.sync();
    expect(c.all('error').filter((e) => e.code === 'bad_message').length).toBe(bad.length);
    await expectServerAlive();
  });

  it('rejects unexpected message types (including server-only ones and prototype pollution attempts)', async () => {
    const c = await TestClient.join(ts.port, 'Fuzz');
    open.push(c);
    for (const t of [
      'damage',
      'setScore',
      'win',
      'snap',
      'welcome',
      'kill',
      'admin',
      '__proto__',
      'constructor',
    ]) {
      c.send({ t });
    }
    c.sendRaw('{"t":"hello","v":1,"name":"x","__proto__":{"admin":true}}');
    c.sendRaw('{"t":"leaveRoom","constructor":{"prototype":{"x":1}}}');
    await c.sync();
    expect(c.all('error').length).toBe(11);
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it('rejects hello with a bad name or protocol version', async () => {
    const c = await connect();
    c.send({ t: 'hello', v: PROTOCOL_VERSION, name: '' });
    c.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'x'.repeat(40) });
    c.send({ t: 'hello', v: PROTOCOL_VERSION, name: '<script>alert(1)</script>' });
    c.send({ t: 'hello', v: 999, name: 'Ok' });
    c.send({ t: 'hello', name: 'Ok' });
    await c.sync();
    expect(c.all('error')).toHaveLength(5);
    expect(c.all('welcome')).toHaveLength(0);
  });

  it('answers an incompatible protocol version with a specific bad_version error', async () => {
    const c = await connect();
    c.send({ t: 'hello', v: PROTOCOL_VERSION + 1, name: 'Ok' });
    const err = await c.next('error');
    expect(err.code).toBe('bad_version');
    expect(c.all('welcome')).toHaveLength(0);
  });

  it('requires hello before anything else', async () => {
    const c = await connect();
    c.send({ t: 'createRoom' });
    expect((await c.next('error')).code).toBe('not_ready');
    c.send({ t: 'quickMatch' });
    expect((await c.next('error')).code).toBe('not_ready');
  });

  it('closes the connection on oversized messages and stays healthy', async () => {
    const c = await connect();
    c.sendRaw(
      JSON.stringify({
        t: 'hello',
        v: PROTOCOL_VERSION,
        name: 'A'.repeat(GAME_CONFIG.limits.maxMessageBytes + 10),
      }),
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(c.closed?.code).toBe(1009);
    await expectServerAlive();
  });

  it('disconnects clients that keep sending garbage', async () => {
    const c = await connect();
    for (let i = 0; i < 80; i++) c.sendRaw('garbage ' + i);
    await new Promise((r) => setTimeout(r, 300));
    expect(c.closed?.code).toBe(1008);
    await expectServerAlive();
  });
});

describe('abuse of game actions', () => {
  it('drops excess input frequency and still bounds movement speed', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    void b;
    const t = playerOf(code, a.id);
    put(code, a.id, 200);
    const before = ts.server.stats().rejected;
    for (let i = 1; i <= 500; i++) a.send(input(i, { mx: 1 }));
    await new Promise((r) => setTimeout(r, 1200)); // let the flood drain; barrier pings share the input bucket
    await a.sync();
    expect(ts.server.stats().rejected - before).toBeGreaterThan(300);
    await advance(ts, 30, clients); // one second of simulated time
    // Speed is enforced by the simulation, no matter how many inputs were sent.
    expect(t.x - 200).toBeLessThanOrEqual(GAME_CONFIG.player.runSpeed + 1);
    expect(a.closed).toBeNull();
  });

  it('a phone whose network keeps stalling and flushing its backlog is never kicked', async () => {
    // Regression: drops used to add up over the whole session, so ~10 three-second stalls kicked a player (1008)
    // and the client gave up for good. Bursts are dropped but only count inside a 10 s window.
    const { clients } = await room(['A', 'B']);
    const [a] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    let fake = Date.now();
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => fake);
    try {
      let seq = 0;
      for (let stall = 0; stall < 14; stall++) {
        fake += 3000; // the network was silent for 3 s...
        for (let i = 0; i < 90; i++) a.send(input(++seq, { mx: 1 })); // ...then 3 s of inputs arrive at once
        await new Promise((r) => setTimeout(r, 60));
      }
      expect(a.closed).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('a sustained input flood is still disconnected', async () => {
    const { clients } = await room(['A', 'B']);
    const [a] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    for (let i = 1; i <= 1200; i++) a.send(input(i, { mx: 1 }));
    await new Promise((r) => setTimeout(r, 400));
    expect(a.closed?.code).toBe(1008);
    await expectServerAlive();
  });

  it('lag compensation: accepts the viewed tick, clamps the rewind, rejects malformed values', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    const sim = ts.server.getRoom(code)!.sim!;
    const t = playerOf(code, a.id);
    const max = Math.round(GAME_CONFIG.limits.maxRewindSec * GAME_CONFIG.tickRate);
    const waitLag = async (want: number): Promise<void> => {
      for (let i = 0; i < 500 && t.viewLag !== want; i++) await new Promise((r) => setTimeout(r, 2));
      expect(t.viewLag).toBe(want);
    };
    // A plausible view (6 ticks behind the next tick) is taken as-is.
    a.send({ ...input(1, { mx: 1 }), vt: sim.tick + 1 - 6 });
    await waitLag(6);
    // Claiming a view far in the past is clamped to the cap.
    a.send({ ...input(2, { mx: 0 }), vt: 0 });
    await waitLag(max);
    // A view "from the future" gives no rewind at all.
    a.send({ ...input(3, { mx: 1 }), vt: sim.tick + 1000 });
    await waitLag(0);
    // Malformed values are rejected by the schema and change nothing.
    for (const vt of [-1, 1.5, '7', 1e12]) a.send({ ...input(10, { mx: 1 }), vt });
    await a.sync();
    expect(a.all('error').filter((e) => e.code === 'bad_message').length).toBeGreaterThanOrEqual(4);
    expect(t.viewLag).toBe(0);
    await expectServerAlive();
  });

  it('ignores stale and duplicated inputs', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    void b;
    const t = playerOf(code, a.id);
    put(code, a.id, 200);
    a.send(input(10, { mx: 1 }));
    a.send(input(5, { mx: 0 })); // stale: must NOT stop the soldier
    a.send(input(10, { mx: -1 })); // duplicate seq
    await advance(ts, 10, clients);
    expect(t.x).toBeGreaterThan(200 + 40);
  });

  it('enforces fire cooldown no matter how fast fire requests arrive', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    void b;
    put(code, a.id, 200);
    const sim = ts.server.getRoom(code)!.sim!;
    let shots = 0;
    const fire = (sim as unknown as { fire: (p: unknown) => void }).fire.bind(sim);
    (sim as unknown as { fire: (p: unknown) => void }).fire = (p) => {
      shots++;
      fire(p);
    };
    let seq = 1;
    for (let tick = 0; tick < 31; tick++) {
      // Toggle fire every tick so the player "presses" as often as the network allows.
      await sendInput(a, code, input(seq++, { fire: tick % 2 === 0 }));
      ts.server.tickOnce();
    }
    await new Promise((r) => setTimeout(r, 700)); // refill the input bucket before the barrier ping
    await advance(ts, 1, clients);
    const cooldown = Math.round(GAME_CONFIG.weapons.blaster.cooldown * 30);
    expect(shots).toBeGreaterThan(0);
    expect(shots).toBeLessThanOrEqual(Math.floor(31 / cooldown) + 1);
  });

  it('spamming Jump cannot make a soldier fly', async () => {
    const { code, clients } = await room(['A']);
    const [a] = clients as [TestClient];
    await startMatch(ts, clients);
    put(code, a.id, 200);
    const p = playerOf(code, a.id);
    let seq = 1;
    let highest = GROUND;
    // 25 ticks (the input rate limit allows a burst of 30) covers a full jump arc of ~0.7 s.
    for (let i = 0; i < 25; i++) {
      await sendInput(a, code, input(seq++, { jump: i % 2 === 0 }));
      ts.server.tickOnce();
      highest = Math.min(highest, p.y);
    }
    // One jump plus the one double jump, never more.
    const P = GAME_CONFIG.player;
    const single = (P.jumpSpeed * P.jumpSpeed) / (2 * P.gravity);
    const double = (P.doubleJumpSpeed * P.doubleJumpSpeed) / (2 * P.gravity);
    expect(GROUND - highest).toBeLessThanOrEqual(single + double + 2);
  });

  it('cannot claim damage, kills, scores, positions or victory', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    const sim = ts.server.getRoom(code)!.sim!;
    put(code, a.id, 200);
    const hpBefore = playerOf(code, b.id).hp;
    const posBefore = { x: playerOf(code, a.id).x, y: playerOf(code, a.id).y };
    const lives = sim.lives;
    const bossHp = sim.boss!.hp;
    const forged = [
      { t: 'damage', target: 'boss', amount: 999 },
      { t: 'kill', victim: 3 },
      { t: 'setScore', score: 99 },
      { t: 'win' },
      { t: 'revive', id: b.id },
      { ...input(4), ul: 100 },
      { ...input(5), ult: 'now' },
      { ...input(6), combo: 999 },
      { ...input(1), x: 5, y: 5 },
      { ...input(2), damage: 100, hit: 9999 },
      { ...input(3), lives: 99 },
      { t: 'matchEnd', result: 'won', board: [] },
      { t: 'snap', s: {}, ev: [], ack: 0 },
    ];
    for (const m of forged) a.send(m);
    await advance(ts, 5, clients);
    expect(a.all('error').filter((e) => e.code === 'bad_message')).toHaveLength(forged.length);
    expect(playerOf(code, b.id).hp).toBe(hpBefore);
    expect(playerOf(code, a.id).x).toBe(posBefore.x);
    expect(sim.score).toBe(0);
    expect(sim.lives).toBe(lives);
    expect(sim.boss!.hp).toBe(bossHp);
    expect(b.all('matchEnd')).toHaveLength(0);
  });

  it('a super move only fires with a full meter, and the meter only fills on the server', async () => {
    const { code, clients } = await room(['A']);
    const [a] = clients as [TestClient];
    await startMatch(ts, clients);
    const sim = ts.server.getRoom(code)!.sim!;
    put(code, a.id, 200);
    let seq = 1;
    for (let i = 0; i < 20; i++) {
      await sendInput(a, code, input(seq++, { ult: i % 2 === 0 }));
      ts.server.tickOnce();
    }
    const me = sim.players.get(a.id)!;
    expect(me.stats.ults).toBe(0);
    expect(me.ult).toBe(0);
    expect(
      a
        .all('snap')
        .flatMap((m) => m.ev)
        .some((e: { e: string }) => e.e === 'ult'),
    ).toBe(false);
  });

  it('prevents unauthorized option changes and mission starts', async () => {
    const stranger = await TestClient.join(ts.port, 'Stranger');
    open.push(stranger);
    stranger.send({ t: 'setSettings', settings: { difficulty: 'easy' } });
    expect((await stranger.next('error')).code).toBe('not_in_room');
    stranger.send({ t: 'startMatch' });
    expect((await stranger.next('error')).code).toBe('not_in_room');
    stranger.send({ t: 'rematch' });
    expect((await stranger.next('error')).code).toBe('not_in_room');

    const { clients } = await room(['A', 'B']);
    clients[1]!.send({ t: 'startMatch' });
    expect((await clients[1]!.next('error')).code).toBe('not_host');
    clients[1]!.send({ t: 'setSettings', settings: { difficulty: 'easy' } });
    expect((await clients[1]!.next('error')).code).toBe('not_host');
    await startMatch(ts, clients);
    clients[0]!.send({ t: 'setSettings', settings: { difficulty: 'hard' } }); // mid-mission
    expect((await clients[0]!.next('error')).code).toBe('bad_state');
    clients[1]!.send({ t: 'startMatch' });
    expect((await clients[1]!.next('error')).code).toBe('not_host');
    clients[0]!.send({ t: 'startMatch' });
    expect((await clients[0]!.next('error')).code).toBe('bad_state');
  });

  it('resists room-code guessing by blocking repeated failures', async () => {
    const victim = await room(['Host']);
    const attacker = await TestClient.join(ts.port, 'Guesser');
    open.push(attacker);
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 8; i++) {
      const guess = alphabet[i]!.repeat(6) === victim.code ? 'ZZZZZZ' : alphabet[i]!.repeat(6);
      attacker.send({ t: 'joinRoom', code: guess });
      await attacker.sync();
    }
    expect(attacker.all('error').filter((e) => e.code === 'room_not_found')).toHaveLength(8);
    // Now even the correct code is refused for this address for a while.
    attacker.send({ t: 'joinRoom', code: victim.code });
    expect((await attacker.next((m) => m.t === 'error' && m.code === 'rate_limited')).code).toBe(
      'rate_limited',
    );
    expect(ts.server.getRoom(victim.code)!.players.size).toBe(1);
  });

  it('limits how fast rooms can be created', async () => {
    const c = await TestClient.join(ts.port, 'Spammer');
    open.push(c);
    for (let i = 0; i < 4; i++) {
      c.send({ t: 'createRoom' });
      await c.next('room');
      c.send({ t: 'leaveRoom' });
      await c.next('left');
    }
    c.send({ t: 'createRoom' });
    expect((await c.next('error')).code).toBe('rate_limited');
  });

  it('caps connections per IP', async () => {
    const small = await startTestServer({ MAX_CONNECTIONS_PER_IP: '3' });
    const socks: TestClient[] = [];
    try {
      for (let i = 0; i < 3; i++) socks.push(await TestClient.connect(small.port));
      await expect(TestClient.connect(small.port)).rejects.toThrow(/429/);
    } finally {
      for (const s of socks) await s.close();
      await small.stop();
    }
  });
});

describe('sessions', () => {
  it('does not let a client impersonate another by session id or a guessed token', async () => {
    const { code, clients } = await room(['Victim', 'Other']);
    const [victim] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    const attacker = await connect();
    // the public player id is not a credential
    const w1 = await attacker.hello('Evil', victim.id.padEnd(32, '0'));
    expect(w1.resumed).toBe(false);
    expect(w1.id).not.toBe(victim.id);
    // neither is a forged token
    const attacker2 = await connect();
    const w2 = await attacker2.hello('Evil2', 'A'.repeat(32));
    expect(w2.resumed).toBe(false);
    attacker.send(input(1, { mx: 1 }));
    expect((await attacker.next('error')).code).toBe('not_in_room');
    expect(ts.server.getRoom(code)!.players.size).toBe(2);
    expect(victim.token).toHaveLength(32);
    expect(victim.token).not.toBe(w1.token);
  });

  it('a resumed session replaces the old connection', async () => {
    const { clients } = await room(['A']);
    const [a] = clients as [TestClient];
    const dup = await connect();
    const w = await dup.hello('A', a.token);
    expect(w.resumed).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(a.closed?.code).toBe(4000);
    dup.send({ t: 'ping', ts: 1 });
    await dup.next('pong');
  });

  it('never leaks tokens to other players', async () => {
    const { clients } = await room(['A', 'B']);
    await startMatch(ts, clients);
    for (const c of clients) {
      for (const other of clients) {
        if (c === other) continue;
        expect(JSON.stringify(c.messages)).not.toContain(other.token);
      }
    }
  });
});

describe('configuration safety', () => {
  it('rejects browser origins that are not on the allow-list in production', async () => {
    const prod = await startTestServer({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://good.example' });
    try {
      await expect(TestClient.connect(prod.port, 'https://evil.example')).rejects.toThrow(/403/);
      await expect(TestClient.connect(prod.port)).rejects.toThrow(/403/); // no Origin header
      const ok = await TestClient.connect(prod.port, 'https://good.example');
      await ok.hello('Fine');
      await ok.close();
    } finally {
      await prod.stop();
    }
  });

  it('in production with no ALLOWED_ORIGINS accepts only the same origin (zero-config single host)', async () => {
    const prod = await startTestServer({ NODE_ENV: 'production' });
    try {
      const host = `127.0.0.1:${prod.port}`;
      await expect(TestClient.connect(prod.port, 'https://evil.example')).rejects.toThrow(/403/);
      await expect(TestClient.connect(prod.port, `https://evil.example:${prod.port}`)).rejects.toThrow(/403/);
      await expect(TestClient.connect(prod.port)).rejects.toThrow(/403/); // no Origin header
      const same = await TestClient.connect(prod.port, `http://${host}`);
      await same.hello('Same');
      await same.close();
    } finally {
      await prod.stop();
    }
  });

  it('picks up the public URL injected by hosting platforms', () => {
    const cfg = loadConfig({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://squad.onrender.com/' });
    expect(cfg.allowedOrigins).toEqual(['https://squad.onrender.com']);
    const rw = loadConfig({ NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'x.up.railway.app' });
    expect(rw.allowedOrigins).toEqual(['https://x.up.railway.app']);
    // Garbage in a platform variable is ignored rather than widening access.
    expect(loadConfig({ NODE_ENV: 'production', SPACE_HOST: 'a b/c' }).allowedOrigins).toEqual([]);
    // A pasted trailing slash is tolerated.
    expect(
      loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.example/' }).allowedOrigins,
    ).toEqual(['https://a.example']);
  });

  it("lets a game portal's subdomains in with https://*.domain, and nothing wider", () => {
    const cfg = loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://*.crazygames.com' });
    const ok = (o: string): boolean => isOriginAllowed(cfg, o, 'strike-squad.example.workers.dev');
    expect(ok('https://strike-squad.game-files.crazygames.com')).toBe(true);
    expect(ok('https://www.crazygames.com')).toBe(true);
    expect(ok('https://crazygames.com')).toBe(false); // the bare domain is not a subdomain
    expect(ok('http://www.crazygames.com')).toBe(false); // https only
    expect(ok('https://www.crazygames.com:8443')).toBe(false); // no other ports
    expect(ok('https://crazygames.com.evil.example')).toBe(false);
    expect(ok('https://evilcrazygames.com')).toBe(false);
    expect(wildcardMatch('https://*.crazygames.com', 'https://a.b.crazygames.com/path')).toBe(false); // not an origin
    // Only a leading "*." on a real domain is a wildcard.
    expect(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://*' })).toThrow(
      /ALLOWED_ORIGINS/,
    );
    expect(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.*.com' })).toThrow(
      /ALLOWED_ORIGINS/,
    );
    expect(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'http://*.example.com' })).toThrow(
      /ALLOWED_ORIGINS/,
    );
  });

  it('refuses "*" and test-only settings in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: '*' } as NodeJS.ProcessEnv)).toThrow(
      ConfigError,
    );
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://a.example',
        TIME_SCALE: '5',
      } as NodeJS.ProcessEnv),
    ).toThrow(/TIME_SCALE/);
    expect(() =>
      loadConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://a.example/path' } as NodeJS.ProcessEnv),
    ).toThrow(/ALLOWED_ORIGINS/);
  });

  it('validates numeric environment variables with clear messages', () => {
    expect(() => loadConfig({ PORT: 'abc' } as NodeJS.ProcessEnv)).toThrow(/PORT must be an integer/);
    expect(() => loadConfig({ TICK_RATE: '1000' } as NodeJS.ProcessEnv)).toThrow(/TICK_RATE/);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' } as NodeJS.ProcessEnv)).toThrow(/LOG_LEVEL/);
    expect(loadConfig({} as NodeJS.ProcessEnv).port).toBe(8080);
  });

  it('serves a health endpoint and 404s everything else', async () => {
    const h = await fetch(`http://127.0.0.1:${ts.port}/health`);
    expect(h.status).toBe(200);
    expect(((await h.json()) as { status: string }).status).toBe('ok');
    expect((await fetch(`http://127.0.0.1:${ts.port}/etc/passwd`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${ts.port}/ws`)).status).toBe(404); // plain GET, no upgrade
  });
});
