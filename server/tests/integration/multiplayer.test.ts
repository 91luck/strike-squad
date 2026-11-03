import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG, MISSION_1, ROOM_CODE_REGEX, isBoss } from '@strikesquad/shared';
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

const input = (
  seq: number,
  o: Partial<{
    mx: number;
    my: number;
    jump: boolean;
    fire: boolean;
    dash: boolean;
    melee: boolean;
    ult: boolean;
  }> = {},
) => ({
  t: 'input' as const,
  seq,
  mx: 0,
  my: 0,
  jump: false,
  fire: false,
  ...o,
});

const T = GAME_CONFIG.tile;
const GROUND = 14 * T;

function simOf(code: string) {
  return ts.server.getRoom(code)!.sim!;
}

/** Stand a soldier on open ground at column `col`, safe from enemies (all regular enemies are removed). */
function place(code: string, id: string, col: number, y = GROUND): void {
  const p = simOf(code).players.get(id)!;
  p.x = col * T + T / 2;
  p.y = y;
  p.vx = p.vy = 0;
  p.onGround = true;
  p.lastSafeX = p.x;
  p.lastSafeY = p.y;
}

function clearEnemies(code: string): void {
  const sim = simOf(code);
  for (const e of [...sim.enemies.values()]) if (!isBoss(e.kind)) sim.enemies.delete(e.id);
  sim.bullets = [];
}

const snapPlayer = (c: TestClient, id: string) =>
  c.snap()!.players.find((p: { id: string }) => p.id === id) as {
    x: number;
    y: number;
    st: number;
    hp: number;
    ul: number;
    ml: number;
  };

describe('squads and lobby', () => {
  it('creates a squad with an unpredictable, valid code and makes the creator host', async () => {
    const { code, clients } = await room(['Ann']);
    expect(code).toMatch(ROOM_CODE_REGEX);
    const info = clients[0]!.lastRoom()!;
    expect(info.hostId).toBe(clients[0]!.id);
    expect(info.phase).toBe('lobby');
    expect(info.players).toHaveLength(1);
    expect(info.maxPlayers).toBe(8);
  });

  it('squad codes are unique', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const c = await TestClient.join(ts.port, `P${i}`);
      open.push(c);
      c.send({ t: 'createRoom' });
      codes.add((await c.next('room')).room.code);
    }
    expect(codes.size).toBe(6);
  });

  it('friends join by code and everyone sees the same squad, each with their own colour', async () => {
    const { clients } = await room(['Ann', 'Bob', 'Cy']);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    await a.sync();
    expect(a.lastRoom()).toEqual(b.lastRoom());
    expect(a.lastRoom()).toEqual(c.lastRoom());
    expect(a.lastRoom()!.players.map((p) => p.slot)).toEqual([0, 1, 2]);
  });

  it('accepts lowercase / padded codes and rejects invalid or unknown ones', async () => {
    const { code } = await room(['Ann']);
    const c = await TestClient.join(ts.port, 'Cy');
    open.push(c);
    c.send({ t: 'joinRoom', code: 'abc' });
    expect((await c.next('error')).code).toBe('bad_message');
    c.send({ t: 'joinRoom', code: 'ZZZZZZ' });
    expect((await c.next('error')).code).toBe('room_not_found');
    c.send({ t: 'joinRoom', code: ` ${code.toLowerCase()} ` });
    expect((await c.next('room')).room.code).toBe(code);
  });

  it('each player picks a hero in the lobby; the choice appears in the mission', async () => {
    const { code, clients } = await room(['Ann', 'Bob']);
    const [a, b] = clients as [TestClient, TestClient];
    b.send({ t: 'setHero', hero: 6 });
    await a.sync();
    expect(a.lastRoom()!.players.find((p) => p.id === b.id)!.hero).toBe(6);
    await startMatch(ts, clients);
    expect(simOf(code).players.get(b.id)!.hero).toBe(6);
    expect(a.snap()!.players.find((p: { id: string }) => p.id === b.id).hr).toBe(6);
    b.send({ t: 'setHero', hero: 2 }); // not during a mission
    expect((await b.next('error')).code).toBe('bad_state');
  });

  it('only the host changes the difficulty', async () => {
    const { clients } = await room(['Ann', 'Bob']);
    const [a, b] = clients as [TestClient, TestClient];
    b.send({ t: 'setSettings', settings: { difficulty: 'hard' } });
    expect((await b.next('error')).code).toBe('not_host');
    a.send({ t: 'setSettings', settings: { difficulty: 'easy' } });
    await b.sync();
    expect(b.lastRoom()!.settings.difficulty).toBe('easy');
  });

  it('holds up to 8 friends; a 9th is turned away, in the lobby and mid-mission', async () => {
    const { code, clients } = await room(['1', '2', '3', '4', '5', '6', '7', '8']);
    const ninth = await TestClient.join(ts.port, 'Nine');
    open.push(ninth);
    ninth.send({ t: 'joinRoom', code });
    expect((await ninth.next('error')).code).toBe('room_full');
    await startMatch(ts, clients);
    ninth.send({ t: 'joinRoom', code });
    expect((await ninth.next('error')).code).toBe('room_full');
  });

  it('lets a player leave safely, transferring host; the squad disappears with its last player', async () => {
    const { code, clients } = await room(['A', 'B']);
    clients[0]!.send({ t: 'leaveRoom' });
    await clients[0]!.next('left');
    await clients[1]!.sync();
    expect(clients[1]!.lastRoom()!.hostId).toBe(clients[1]!.id);
    clients[1]!.send({ t: 'leaveRoom' });
    await clients[1]!.next('left');
    expect(ts.server.getRoom(code)).toBeUndefined();
  });

  it('does not allow creating/joining while already in a squad', async () => {
    const { code, clients } = await room(['A']);
    clients[0]!.send({ t: 'createRoom' });
    expect((await clients[0]!.next('error')).code).toBe('already_in_room');
    clients[0]!.send({ t: 'joinRoom', code });
    expect((await clients[0]!.next('error')).code).toBe('already_in_room');
    clients[0]!.send({ t: 'quickMatch' });
    expect((await clients[0]!.next('error')).code).toBe('already_in_room');
  });
});

describe('mission', () => {
  it('a solo player can start a mission; everyone gets the same start state', async () => {
    const { clients } = await room(['Solo']);
    const [a] = clients as [TestClient];
    a.send({ t: 'startMatch' });
    const ms = await a.next('matchStart');
    expect(ms.levelId).toBe(MISSION_1.id);
    expect(ms.snap.phase).toBe('countdown');
    expect(ms.snap.lives).toBe(GAME_CONFIG.mission.livesBase.normal + 1);
    await advance(ts, 100, clients);
    expect(a.snap()!.phase).toBe('playing');
  });

  it('replicates movement of every soldier to every client', async () => {
    const { code, clients } = await room(['A', 'B', 'C']);
    const [a, b, c] = clients as [TestClient, TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 5);
    a.send(input(1, { mx: 1 }));
    await advance(ts, 10, clients);
    const seen = [a, b, c].map((x) => snapPlayer(x, a.id).x);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toBeGreaterThan(5 * T + 16 + 40);
  });

  it('shots are simulated on the server and kills credited to the shooter', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 5);
    place(code, b.id, 3);
    const sim = simOf(code);
    (sim as unknown as { spawnEnemy: (id: number, k: string, x: number, y: number) => void }).spawnEnemy(
      500,
      'soldier',
      11 * T,
      GROUND,
    );
    a.send(input(1, { fire: true }));
    await advance(ts, 60, clients);
    const kill = b.events('ekill').find((e) => e.id === 500);
    expect(kill?.by).toBe(a.id);
    expect(a.snap()!.score).toBe(GAME_CONFIG.enemies.soldier.score);
  });

  it("a KO'd friend is back beside the squad a few seconds later, using a team life", async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 5);
    place(code, b.id, 50);
    const lives = simOf(code).lives;
    (simOf(code) as unknown as { koPlayer: (p: unknown) => void }).koPlayer(simOf(code).players.get(a.id));
    await advance(ts, 4, clients);
    expect(snapPlayer(b, a.id).st).toBe(1);
    expect(b.events('ko').some((e) => e.id === a.id)).toBe(true);
    await advance(ts, Math.round(GAME_CONFIG.player.respawnSec * 30) + 2, clients);
    const back = snapPlayer(b, a.id);
    expect(back.st).toBe(0);
    expect(back.hp).toBe(GAME_CONFIG.player.maxHp);
    expect(Math.abs(back.x - (50 * T + 16))).toBeLessThan(T);
    expect(a.snap()!.lives).toBe(lives - 1);
    expect(a.events('respawn').some((e) => e.id === a.id)).toBe(true);
  });

  it('an ambush arena locks the way until its waves are down, then the gate opens for everyone', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    const sim = simOf(code);
    const arena = MISSION_1.arenas[0]!;
    place(code, a.id, Math.floor(arena.trigger / T) + 1);
    place(code, b.id, Math.floor(arena.trigger / T) + 2);
    for (const p of sim.players.values()) p.invulnUntil = 1e9;
    await advance(ts, 4, clients);
    expect(b.snap()!.arena).toMatchObject({ id: 0, w: 1 });
    expect(a.snap()!.gates & 1).toBe(0);
    for (let w = 0; w < arena.waves.length; w++) {
      for (const e of [...sim.enemies.values()])
        if (e.arena === 0)
          (sim as unknown as { damageEnemy: (...a: unknown[]) => void }).damageEnemy(
            e,
            999,
            a.id,
            0,
            0,
            'gun',
          );
      await advance(ts, 46, clients);
    }
    expect(a.snap()!.gates & 1).toBe(1);
    expect(b.events('gate')).toHaveLength(1);
    expect(b.events('clear').some((e) => e.id === 0)).toBe(true);
    expect(a.events('arena').filter((e) => e.id === 0)).toHaveLength(arena.waves.length);
  });

  it('dash, knife and super move travel over the network (a quick tap inside one tick still counts)', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 50);
    place(code, b.id, 40);
    const sim = simOf(code);
    // Dash: press and release arrive between two ticks.
    a.send(input(1, { dash: true, mx: 1 }));
    a.send(input(2, { mx: 1 }));
    await advance(ts, 6, clients); // a dash lasts 6 ticks; snapshots go out every 2
    expect(snapPlayer(b, a.id).x).toBeGreaterThan(50 * T + 16 + 80);
    // Super move (meter set server-side; a client cannot fill it).
    const me = sim.players.get(a.id)!;
    me.ultKind = 'nova';
    me.ult = GAME_CONFIG.ult.max;
    a.send(input(3, { ult: true }));
    a.send(input(4, {}));
    await advance(ts, 4, clients);
    expect(b.events('ult').some((e) => e.id === a.id && e.kind === 'nova')).toBe(true);
    expect(snapPlayer(b, a.id).ul).toBe(0);
    // Knife.
    a.send(input(5, { melee: true }));
    await advance(ts, 2, clients);
    expect(snapPlayer(b, a.id).ml).toBeGreaterThan(0);
  });

  it('drop-in: a friend opening the link mid-mission appears next to the squad and the team gains a life', async () => {
    const { code, clients } = await room(['A']);
    const [a] = clients as [TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 60);
    await advance(ts, 4, clients);
    const lives = a.snap()!.lives;
    const late = await TestClient.join(ts.port, 'Late');
    open.push(late);
    late.send({ t: 'joinRoom', code });
    const ms = await late.next('matchStart');
    expect(ms.you).toBe(late.id);
    expect(ms.snap.phase).toBe('playing');
    await advance(ts, 4, [a, late]);
    const me = snapPlayer(late, late.id);
    expect(Math.abs(me.x - (60 * T + 16))).toBeLessThan(2 * T);
    expect(a.snap()!.lives).toBe(lives + 1);
    // ...and can move right away.
    late.send(input(1, { mx: -1 }));
    await advance(ts, 10, [a, late]);
    expect(snapPlayer(a, late.id).x).toBeLessThan(me.x - 40);
  });

  it('the mission fails when the whole squad is down with no lives left, and results reach everyone', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    const sim = simOf(code);
    sim.lives = 0;
    for (const p of sim.players.values()) (sim as unknown as { koPlayer: (p: unknown) => void }).koPlayer(p);
    await advance(ts, 90, clients);
    const ends = await Promise.all([a.next('matchEnd'), b.next('matchEnd')]);
    for (const e of ends) {
      expect(e.result).toBe('failed');
      expect(e.reason).toBe('lives');
      expect(e.board).toHaveLength(2);
    }
    await a.sync();
    expect(a.lastRoom()!.phase).toBe('results');
  });

  it('beating the final boss wins the mission for the whole squad, with a squad report', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    const sim = simOf(code);
    place(code, a.id, 256);
    place(code, b.id, 257);
    for (const p of sim.players.values()) p.invulnUntil = 1e9;
    await advance(ts, 3, clients);
    sim.boss!.hp = 2;
    b.send(input(1, { fire: true }));
    await advance(ts, 140, clients);
    const end = await a.next('matchEnd');
    expect(end.result).toBe('won');
    const bRow = end.board.find((r: { id: string }) => r.id === b.id);
    expect(bRow.bossDamage).toBeGreaterThan(0);
    expect(bRow).toHaveProperty('bestCombo');
    expect(bRow).toHaveProperty('rank');
    expect(a.events('bossDown')).toHaveLength(1);
  });

  it('play again from results restarts a fresh mission; the host can also go back to the lobby', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    const sim = simOf(code);
    sim.lives = 0;
    for (const p of sim.players.values()) (sim as unknown as { koPlayer: (p: unknown) => void }).koPlayer(p);
    await advance(ts, 90, clients);
    await a.next('matchEnd');
    b.send({ t: 'rematch' });
    expect((await b.next('error')).code).toBe('not_host');
    a.send({ t: 'rematch' });
    const ms = await b.next('matchStart');
    expect(ms.snap.phase).toBe('countdown');
    expect(ms.snap.score).toBe(0);
    const sim2 = simOf(code);
    sim2.lives = 0;
    for (const p of sim2.players.values())
      (sim2 as unknown as { koPlayer: (p: unknown) => void }).koPlayer(p);
    await advance(ts, 200, clients);
    await a.next('matchEnd');
    a.send({ t: 'toLobby' });
    await b.sync();
    expect(b.lastRoom()!.phase).toBe('lobby');
  });

  it('a late joiner between missions sees the last result and plays the next one', async () => {
    const { code, clients } = await room(['A']);
    const [a] = clients as [TestClient];
    await startMatch(ts, clients);
    const sim = simOf(code);
    sim.lives = 0;
    for (const p of sim.players.values()) (sim as unknown as { koPlayer: (p: unknown) => void }).koPlayer(p);
    await advance(ts, 90, clients);
    await a.next('matchEnd');
    const late = await TestClient.join(ts.port, 'Late');
    open.push(late);
    late.send({ t: 'joinRoom', code });
    expect((await late.next('matchEnd')).result).toBe('failed');
    a.send({ t: 'rematch' });
    await late.next('matchStart');
    expect(simOf(code).players.has(late.id)).toBe(true);
  });

  it('a mission everybody leaves is closed', async () => {
    const { code, clients } = await room(['A', 'B']);
    await startMatch(ts, clients);
    for (const c of clients) {
      c.send({ t: 'leaveRoom' });
      await c.next('left');
    }
    expect(ts.server.getRoom(code)).toBeUndefined();
  });
});

describe('connections', () => {
  it('a disconnected player can resume with their session token and regain control', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 5);
    const token = a.token;
    const id = a.id;
    await a.close();
    await b.sync();
    expect(b.lastRoom()!.players.find((p) => p.id === id)!.connected).toBe(false);

    const a2 = await TestClient.connect(ts.port);
    open.push(a2);
    const w = await a2.hello('whatever', token);
    expect(w.resumed).toBe(true);
    expect(w.id).toBe(id);
    const ms = await a2.next('matchStart');
    expect(ms.you).toBe(id);
    a2.send(input(1, { mx: 1 })); // seq restarts after resume
    await advance(ts, 10, [a2, b]);
    expect(snapPlayer(a2, id).x).toBeGreaterThan(5 * T + 16 + 40);
  });

  it('a disconnected player stops moving immediately and cannot be controlled by others', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 5);
    a.send(input(1, { mx: 1 }));
    await advance(ts, 5, clients);
    await a.close();
    await b.sync();
    const p = simOf(code).players.get(a.id)!;
    const x0 = p.x;
    const rogue = await TestClient.connect(ts.port);
    open.push(rogue);
    rogue.send(input(1, { mx: 1 }));
    expect((await rogue.next('error')).code).toBe('not_ready');
    await advance(ts, 10, [b]);
    expect(p.x).toBe(x0);
  });

  it('removes a disconnected player once the grace period has passed', async () => {
    const t2 = await startTestServer({ LOBBY_GRACE_MS: '0', RECONNECT_GRACE_MS: '0' });
    try {
      const r = await createRoom(t2, ['A', 'B']);
      open.push(...r.clients);
      await r.clients[1]!.close();
      await r.clients[0]!.sync();
      t2.server.sweepNow(Date.now() + 1);
      await r.clients[0]!.sync();
      expect(r.clients[0]!.lastRoom()!.players).toHaveLength(1);
    } finally {
      await t2.stop();
    }
  });

  it('expired squads cannot be joined any more', async () => {
    const { code, clients } = await room(['A']);
    ts.server.sweepNow(Date.now() + GAME_CONFIG.limits.roomIdleExpirySec * 1000 + 5000);
    expect((await clients[0]!.next('error')).code).toBe('room_expired');
    await clients[0]!.next('left');
    const c = await TestClient.join(ts.port, 'Late');
    open.push(c);
    c.send({ t: 'joinRoom', code });
    expect((await c.next('error')).code).toBe('room_not_found');
  });

  it('a player cannot control another player’s soldier (no target field is accepted)', async () => {
    const { code, clients } = await room(['A', 'B']);
    const [a, b] = clients as [TestClient, TestClient];
    await startMatch(ts, clients);
    clearEnemies(code);
    place(code, a.id, 5);
    place(code, b.id, 10);
    a.send({ ...input(1, { mx: 1 }), id: b.id, playerId: b.id });
    expect((await a.next('error')).code).toBe('bad_message');
    await advance(ts, 10, clients);
    expect(snapPlayer(b, b.id).x).toBe(10 * T + 16);
  });

  it('keeps simultaneous squads isolated', async () => {
    const r1 = await room(['A1', 'B1']);
    const r2 = await room(['A2', 'B2']);
    await startMatch(ts, r1.clients);
    await startMatch(ts, r2.clients);
    clearEnemies(r1.code);
    clearEnemies(r2.code);
    place(r1.code, r1.clients[0]!.id, 5);
    place(r2.code, r2.clients[0]!.id, 5);
    r1.clients[0]!.send(input(1, { mx: 1 }));
    await advance(ts, 20, [...r1.clients, ...r2.clients]);
    const ids2 = r2.clients.map((c) => c.id).sort();
    expect(
      r2.clients[0]!.snap()!
        .players.map((p: { id: string }) => p.id)
        .sort(),
    ).toEqual(ids2);
    expect(snapPlayer(r2.clients[0]!, r2.clients[0]!.id).x).toBe(5 * T + 16);
    expect(snapPlayer(r1.clients[0]!, r1.clients[0]!.id).x).toBeGreaterThan(5 * T + 16 + 80);
  });
});

describe('play now', () => {
  it('starts a public mission at once when none is running (no waiting for opponents)', async () => {
    const a = await TestClient.join(ts.port, 'A');
    open.push(a);
    a.send({ t: 'quickMatch' });
    const ms = await a.next('matchStart');
    expect(ms.you).toBe(a.id);
    await a.sync();
    expect(a.lastRoom()!.quick).toBe(true);
  });

  it('drops the next "Play now" player into that running public mission', async () => {
    const a = await TestClient.join(ts.port, 'A');
    const b = await TestClient.join(ts.port, 'B');
    open.push(a, b);
    a.send({ t: 'quickMatch' });
    await a.next('matchStart');
    await advance(ts, 30, [a]);
    b.send({ t: 'quickMatch' });
    await b.next('matchStart');
    await a.sync();
    expect(
      a
        .lastRoom()!
        .players.map((p) => p.name)
        .sort(),
    ).toEqual(['A', 'B']);
  });

  it('never drops anyone into a public mission whose players have all disconnected', async () => {
    const a = await TestClient.join(ts.port, 'A');
    a.send({ t: 'quickMatch' });
    await a.next('matchStart');
    await a.close();
    const b = await TestClient.join(ts.port, 'B');
    open.push(b);
    b.send({ t: 'quickMatch' });
    await b.next('matchStart');
    await b.sync();
    expect(b.lastRoom()!.players.map((p) => p.name)).toEqual(['B']);
  });

  it('private squads are never filled by "Play now"', async () => {
    const { clients } = await room(['Host', 'Friend']);
    await startMatch(ts, clients);
    const s = await TestClient.join(ts.port, 'Stranger');
    open.push(s);
    s.send({ t: 'quickMatch' });
    await s.next('matchStart');
    await s.sync();
    expect(s.lastRoom()!.players.map((p) => p.name)).toEqual(['Stranger']);
  });
});

describe('real-time loop', () => {
  it('starts the mission the host picked, and only the host may change it', async () => {
    const t2 = await startTestServer();
    try {
      const r = await createRoom(t2, ['A', 'B']);
      open.push(...r.clients);
      const [host, guest] = r.clients;
      guest!.send({ t: 'setSettings', settings: { mission: 'mission-2' } });
      expect((await guest!.next('error')).code).toBe('not_host');
      host!.send({ t: 'setSettings', settings: { mission: 'mission-3' } });
      const room = await guest!.next((m) => m.t === 'room' && m.room.settings.mission === 'mission-3');
      expect(room.room.settings.mission).toBe('mission-3');
      host!.send({ t: 'startMatch' });
      const ms = await guest!.next('matchStart');
      expect(ms.levelId).toBe('mission-3');
    } finally {
      await t2.stop();
    }
  });

  it('runs missions on the timer without manual ticks', async () => {
    const live = await startTestServer({ TIME_SCALE: '20' }, { manualTicks: false });
    try {
      const a = await TestClient.join(live.port, 'A');
      open.push(a);
      a.send({ t: 'createRoom', settings: { difficulty: 'hard' } });
      await a.next('room');
      a.send({ t: 'startMatch' });
      await a.next('matchStart');
      const snap = await a.next((m) => m.t === 'snap' && m.s.phase === 'playing', 5000);
      expect(snap.s.players).toHaveLength(1);
      // Standing still at the start, the soldiers ahead win eventually: the mission fails on its own.
      const end = await a.next('matchEnd', 20000);
      expect(end.result).toBe('failed');
    } finally {
      await live.stop();
    }
  });
});
