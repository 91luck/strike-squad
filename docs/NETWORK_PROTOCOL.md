# Network protocol

Current version: 6 (`PROTOCOL_VERSION` in `shared/src/protocol.ts`). It is bumped when the messages change or when
the missions change shape, since the server and the page build the same level from shared code.

Transport: one WebSocket per player at `/ws`, UTF-8 JSON text frames. Binary frames are rejected. Max client→server message: **2048 bytes**. Types live in `shared/src/protocol.ts`; the server validates every inbound message with strict zod schemas in `shared/src/schemas.ts` (unknown keys are rejected).

## Client → server

| `t`                      | Fields                                                                                                                                             | Notes                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hello`                  | `v` (=2), `name` (1–16 chars: letters, digits, space `_.-`), `resume?`                                                                             | Must be first. `resume` = previous session token.                                                                                                |
| `createRoom`             | `settings?: {difficulty}`, `open?: boolean`                                                                                                        | Creates a squad; creator is host. Rate limited (4 burst, then 4/minute).                                                                         |
| `joinRoom`               | `code`                                                                                                                                             | 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (case-insensitive). Any phase; mid-mission the server replies `room` then `matchStart` (drop-in). |
| `leaveRoom`              |                                                                                                                                                    |                                                                                                                                                  |
| `setSettings`            | `settings: {difficulty: easy \| normal \| hard}`                                                                                                   | Host only, lobby only.                                                                                                                           |
| `setHero`                | `hero` (int 0..7)                                                                                                                                  | Lobby or results only.                                                                                                                           |
| `startMatch` / `rematch` |                                                                                                                                                    | Host only. A single player may start.                                                                                                            |
| `toLobby`                |                                                                                                                                                    | Host only, from results.                                                                                                                         |
| `quickMatch`             |                                                                                                                                                    | "Play now": join a running public mission with a seat, or start a new public one at once.                                                        |
| `input`                  | `seq` (int, strictly increasing), `mx` −1/0/1, `my` −1/0/1, `jump`, `fire`, optional `dash`, `melee`, `ult`, optional `vt` (server tick on screen) | ≤60/s. Drives only the sender's soldier. Integers only for axes.                                                                                 |
| `ping`                   | `ts`                                                                                                                                               | Echoed in `pong` for RTT.                                                                                                                        |

## Server → client

| `t`          | Fields                                                                                                     | Notes                                                                                                                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `welcome`    | `v`, `id`, `token`, `name`, `resumed`                                                                      | `token` is private to this client and is never broadcast.                                                                                                                                                                               |
| `room`       | `room: RoomInfo` (code, hostId, phase, settings, players[], …)                                             | Sent on every membership/lobby change.                                                                                                                                                                                                  |
| `left`       |                                                                                                            | You are no longer in a room.                                                                                                                                                                                                            |
| `matchStart` | `levelId`, `tickRate`, `snapshotEvery`, `you`, `snap`                                                      | Also sent on resume and on drop-in mid-mission.                                                                                                                                                                                         |
| `snap`       | `s: Snapshot`, `ev: SimEvent[]`, `ack`                                                                     | Every 2 ticks (15 Hz). `ack` = last input `seq` processed for you.                                                                                                                                                                      |
| `matchEnd`   | `result: won \| failed`, `reason?: lives \| time \| abandoned`, `timeSec`, `score`, `livesLeft`, `board[]` | `board` rows: `{id, name, slot, hero, kills, deaths, bestCombo, rank, ults, bossDamage, score}`.                                                                                                                                        |
| `pong`       | `ts`                                                                                                       |                                                                                                                                                                                                                                         |
| `error`      | `code`, `message`                                                                                          | Codes: `bad_message, bad_version, rate_limited, not_ready, room_not_found, room_expired, already_in_room, room_full, match_in_progress, not_host, not_in_room, bad_state, too_many_connections, server_busy, session_expired, internal` |

### Snapshot

`{tick, phase, result, cd, lives, cp, gates, taken, score, lx, arena, boss, players[], enemies[], bullets[]}`

- `gates`, `taken`: bitmasks (open gates, collected pick-ups). `lx`: bodies may not move right of this x (the fortress front).
- `arena`: `{id, w (wave), n (waves), left (enemies left)}` while an arena is locked, else null.
- `players[]`: `{id, n, s (seat), hr (hero), x, y, vx, vy, g (on ground), f (facing), c (crouch), ax, ay (aim), hp (0..100), st (0 alive / 1 KO), dl (respawn seconds, -1 = no lives), w (weapon), iv (protected), fi (firing), k (kills), ul (super meter), od (overdrive), cb (combo), rk (rank), ml (knife swing), co, dr, pj, aj, dsh, sld, dcd, dd, ad, pd}`. The last ten are movement state for client prediction.
- `enemies[]` (only near some player; bosses included): `{id, k (kind), x, y, hp (%), f, h (hit flash), a (aim ×100), sh (shield up), at (boss attack), tt (ticks into it), p (attack parameter), ph (phase)}`.
- `bullets[]`: `{id, x, y, vx, vy, e (enemy?), w (weapon), k (kind: shot, grenade, shell, wave, missile, bomb, rocket), p (overdrive)}`.
- `boss`: `{k (walker / gunship / boss), hp, max, ph (phase), h}` for the boss being fought, or null.

### Events (`ev`)

`ehit, ekill, hurt, ko, respawn, life, pickup, gate, checkpoint, arena, clear, bossWake, bossPhase, bossDown, ult, boom, style, start, end`. They drive sounds, effects and notices; the world state always comes from `s`.

## Handshake and resume

```
C: {"t":"hello","v":2,"name":"Ace"}
S: {"t":"welcome","v":2,"id":"3fa9c1d27b40","token":"…","name":"Ace","resumed":false}
… connection drops …
C: {"t":"hello","v":2,"name":"Ace","resume":"<token>"}
S: {"t":"welcome",…,"resumed":true}  then  {"t":"room",…}  and, in a match, {"t":"matchStart",…}
```

If the grace period has passed the server answers `welcome` with `resumed:false` (a fresh identity) and the client returns to the menu with an explanation.

## Limits and failure behaviour

| Condition                                    | Result                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Frame > 2048 B                               | Connection closed (ws `maxPayload`)                                           |
| Invalid JSON / schema / unknown type         | `error bad_message`; repeated offences → close 1008                           |
| >60 inputs/s, or >6 other msgs/s (burst 12)  | Dropped / `rate_limited`                                                      |
| Missing/old `seq`                            | Silently ignored                                                              |
| Wrong `v` in `hello`                         | `error bad_version` (client tells the player to reload)                       |
| Slow consumer (send buffer backs up)         | Connection terminated so one slow client cannot stall a squad                 |
| No input for 1 s during a mission            | That soldier's input is zeroed (a frozen tab cannot keep running or shooting) |
| Origin not in `ALLOWED_ORIGINS` (production) | HTTP 403 on upgrade                                                           |
