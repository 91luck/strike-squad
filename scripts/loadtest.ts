/**
 * Network load test: N real WebSocket players in one squad, playing for a while, with optional bad-network bursts.
 *
 *   npm run loadtest -- [players=5] [seconds=60] [mission=mission-1] [url=ws://127.0.0.1:4173/ws] [burstMs=0]
 *
 * Each player sends inputs at 30 Hz (runs, jumps, fires, dashes) like a real client. `burstMs` > 0 imitates a
 * mobile network that holds packets and then delivers them all at once: every few seconds each player's outgoing
 * inputs are queued for `burstMs` and flushed together.
 *
 * Prints per-player snapshot sizes, downstream bandwidth, errors and every disconnect with its close code, then
 * exits non-zero if anyone was disconnected. Point `url` at your deployment (wss://…/ws) to test the real server.
 */
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '@strikesquad/shared';

const [nArg, secArg, missionArg, urlArg, burstArg] = process.argv.slice(2);
const N = Number(nArg ?? 5);
const SECONDS = Number(secArg ?? 60);
const MISSION = missionArg ?? 'mission-1';
const URL = urlArg ?? 'ws://127.0.0.1:4173/ws';
const BURST_MS = Number(burstArg ?? 0);
const origin = URL.replace(/^ws/, 'http').replace(/\/ws$/, '');

interface Stats {
  name: string;
  snaps: number;
  bytes: number;
  maxSnap: number;
  errors: Map<string, number>;
  closed: string | null;
}

type Msg = { t: string; [k: string]: unknown };

function player(name: string): Promise<{ ws: WebSocket; stats: Stats; next: (t: string) => Promise<Msg> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { origin });
    const stats: Stats = { name, snaps: 0, bytes: 0, maxSnap: 0, errors: new Map(), closed: null };
    const waiters: { t: string; fn: (m: Msg) => void }[] = [];
    ws.on('message', (data) => {
      const text = data.toString();
      const m = JSON.parse(text) as Msg;
      if (m.t === 'snap') {
        stats.snaps++;
        stats.bytes += text.length;
        stats.maxSnap = Math.max(stats.maxSnap, text.length);
      }
      if (m.t === 'error') {
        const k = String(m.code);
        stats.errors.set(k, (stats.errors.get(k) ?? 0) + 1);
      }
      const i = waiters.findIndex((w) => w.t === m.t);
      if (i >= 0) waiters.splice(i, 1)[0]!.fn(m);
    });
    ws.on('close', (code, reason) => (stats.closed = `${code} ${reason.toString()}`));
    ws.on('error', reject);
    const next = (t: string) =>
      new Promise<Msg>((res, rej) => {
        waiters.push({ t, fn: res });
        setTimeout(() => rej(new Error(`${name}: no "${t}" within 15 s`)), 15_000);
      });
    ws.on('open', async () => {
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name }));
      await next('welcome');
      resolve({ ws, stats, next });
    });
  });
}

async function main(): Promise<void> {
  console.log(
    `${N} players · ${SECONDS}s · ${MISSION} · ${URL}${BURST_MS ? ` · ${BURST_MS} ms bursts` : ''}`,
  );
  const ps: Awaited<ReturnType<typeof player>>[] = [];
  for (let i = 0; i < N; i++) ps.push(await player(`Load${i}`));
  const host = ps[0]!;
  host.ws.send(JSON.stringify({ t: 'createRoom', settings: { mission: MISSION } }));
  const code = ((await host.next('room')).room as { code: string }).code;
  for (const p of ps.slice(1)) {
    p.ws.send(JSON.stringify({ t: 'joinRoom', code }));
    await p.next('room');
  }
  host.ws.send(JSON.stringify({ t: 'startMatch' }));
  await Promise.all(ps.map((p) => p.next('matchStart')));
  console.log(`squad ${code} started`);

  const t0 = Date.now();
  const timers = ps.map((p, i) => {
    let seq = 0;
    let held: string[] = [];
    let holdUntil = 0;
    return setInterval(() => {
      if (p.ws.readyState !== WebSocket.OPEN) return;
      const t = (Date.now() - t0) / 1000;
      const msg = JSON.stringify({
        t: 'input',
        seq: ++seq,
        mx: Math.sin(t * 0.7 + i) > -0.3 ? 1 : -1,
        my: 0,
        jump: Math.sin(t * 3 + i * 2) > 0.8,
        fire: true,
        dash: Math.sin(t * 1.3 + i) > 0.97,
      });
      const now = Date.now();
      // Every ~4 s a player's network stalls for BURST_MS, then everything arrives at once.
      if (BURST_MS > 0 && now > holdUntil + 4000 && Math.random() < 0.05) holdUntil = now + BURST_MS;
      if (now < holdUntil) return void held.push(msg);
      for (const h of held) p.ws.send(h);
      held = [];
      p.ws.send(msg);
    }, 1000 / 30);
  });
  const pings = setInterval(() => {
    for (const p of ps)
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify({ t: 'ping', ts: 0 }));
  }, 3000);

  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  timers.forEach(clearInterval);
  clearInterval(pings);

  let dropped = 0;
  console.log('player   snaps  avgB   maxB   kB/s   errors                 closed');
  for (const { stats: s } of ps) {
    if (s.closed) dropped++;
    const errs = [...s.errors].map(([k, v]) => `${k}×${v}`).join(' ') || '-';
    console.log(
      `${s.name.padEnd(8)} ${String(s.snaps).padStart(5)} ${String(Math.round(s.bytes / Math.max(1, s.snaps))).padStart(5)} ` +
        `${String(s.maxSnap).padStart(6)} ${(s.bytes / 1024 / SECONDS).toFixed(1).padStart(6)}   ${errs.padEnd(22)} ${s.closed ?? '-'}`,
    );
  }
  for (const p of ps) p.ws.close();
  console.log(dropped ? `${dropped} player(s) were disconnected` : 'nobody was disconnected');
  process.exit(dropped ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
