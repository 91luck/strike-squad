# Architecture

## Goals

Free to run, hard to cheat, easy to test. That led to three decisions: (1) one deterministic simulation shared by server and client, (2) a thin server that is the only authority, (3) a framework-free client.

## Packages (npm workspaces)

```
shared  ──►  server   (Node 20+, ws, zod)
   └─────►  client   (Vite, Canvas 2D, no UI framework)
```

`shared` has no DOM or Node dependency, so the exact same code runs in the server process, in browser solo training, in the client's movement prediction, and in headless tests and balance runs.

| Module                                          | Responsibility                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/config.ts`                              | Every tunable number (soldier, moves, supers, combo, weapons, enemies, bosses, lives, limits). Single source of truth.                                                                                                                                                                                           |
| `shared/level.ts`                               | Level data types and the `Builder` primitives (ground, platforms, lock gates, arenas, bosses, checkpoints). One byte per tile; `toAscii()` for debugging.                                                                                                                                                        |
| `shared/course.ts`                              | Missions as data: reusable terrain templates (flat, pits, bridge, steps, towers, catwalks, ascent, chasm, tunnel, trench, rampart, pillars; five arena room shapes; stash perches) plus a tiny text format for enemies, pickups and waves, columns relative to each section. Bad placements throw at build time. |
| `shared/missions.ts`                            | The campaign: menu metadata (`MISSIONS`), mission 1 (hand-placed) and missions 2–4 (section data with tougher `mods`). `getMission(id)` builds a mission on first use and caches it, so the server shares one immutable copy between rooms and a phone never builds missions nobody picked.                      |
| `shared/physics.ts`                             | Platformer movement (gravity, one-way platforms, coyote time, double jump, dash, slide) shared by server and prediction.                                                                                                                                                                                         |
| `shared/sim.ts`                                 | `Sim`: fixed-timestep mission: players, knife/super/combo, enemy and boss AI, bullets, arenas, lives, result.                                                                                                                                                                                                    |
| `shared/autopilot.ts`                           | Computer player (solo buddies, playtest, tests). Plays only through `setInput`, like a human.                                                                                                                                                                                                                    |
| `shared/protocol.ts` / `schemas.ts`             | Wire types; strict zod schemas for client→server messages (server-only entry point).                                                                                                                                                                                                                             |
| `server/room.ts`                                | `Room`: lobby → mission → results for one squad; seats/colours; drop-in. No sockets, unit-testable.                                                                                                                                                                                                              |
| `server/core.ts`                                | Runtime-independent sessions, rate limits, dispatch, "Play now", sweeping.                                                                                                                                                                                                                                       |
| `server/game-server.ts`, `cloudflare/worker.ts` | Node (`ws`) and Cloudflare (Durable Object) adapters.                                                                                                                                                                                                                                                            |
| `client/main.ts`                                | Screen state machine and wiring.                                                                                                                                                                                                                                                                                 |
| `shared/heroes.ts`                              | The 8-hero roster (names, colours, looks). The server only validates the id.                                                                                                                                                                                                                                     |
| `client/game/sprites.ts`                        | Pixel-art factory: characters drawn by code, auto 1-px outline, cached per hero/pose/frame/aim; enemies, crates, portraits.                                                                                                                                                                                      |
| `client/game/world-art.ts`                      | Tile textures, props, parallax layers and zone palettes, generated from a fixed seed.                                                                                                                                                                                                                            |
| `client/game/theme-art.ts`                      | Faction kit: arena gates per world, shields, wings/jets, small flyers, turrets, enemy shot colours and themed boss ordnance.                                                                                                                                                                                     |
| `client/game/boss-art.ts`                       | Themed boss bodies (scorpion, wolf, minotaur, beast, crawler; falcon, thunder god, harpy, dragon, UFO; five final colossi) over the unchanged boss behaviours.                                                                                                                                                   |
| `client/game/*`                                 | `OnlineMatch` (input loop, interpolation, prediction), `SoloMatch`, `MatchView` (HUD/events), `Renderer` (side view, procedural art).                                                                                                                                                                            |

## Simulation

- 30 ticks/s, fixed step, seeded `mulberry32` RNG. Same seed and inputs give the same mission (tested).
- `Sim.step()` order: countdown → players (movement, regen, slide hits, super, knife or fire) → arenas (lock, waves, clear) → enemies (wake within 760 px; bosses only when their arena locks; AI and boss attack state machines) → position history → bullets (sub-stepped 12 px; gravity, blasts, homing missiles, shoot-downs) → contact damage → pick-ups → checkpoints → respawns → end check.
- Bosses run a cycle of attacks. Each attack starts with a wind-up (`ATTACK_WINDUP`) that is sent in the snapshot (`at`, `tt`) so the client draws the tell; damage only happens after it.
- Button presses (jump, dash, knife, super) that arrive in the same tick are merged in `Sim.setInput`, so a quick tap between two ticks is never lost.
- The level is one screen tall (18 rows × 32 px) and 276 columns wide; cameras scroll sideways (and tilt up for the gunship on phones).

## Online data flow

```
client                                       server
  input @30 Hz {seq, mx, my, jump, fire, dash, melee, ult, vt} ─►  Room.handleInput (strict schema, seq must increase)
                                                 Sim.step() @30 Hz (authoritative)
  ◄── snap @15 Hz {s: Snapshot, ev: events, ack}
  Timeline → others drawn 2 snapshot-intervals in the past (interpolated)
  Predictor → own soldier = server state @ack + replay of unacked inputs through the same physics
```

Never trusted from the client: position, velocity, hits, damage, kills, health, super meter, combo, gate/arena state, pick-ups, lives, score, boss health, result. An input has no target field; it always drives the sender's own soldier.

Predicted client-side: only your own movement (run, jump, double jump, dash, slide), via `stepPlayerMovement` (the server's function), with the gate bitmask and the movement limit (`lx`) from the latest snapshot. Corrections under 80 px are smoothed over ~0.3 s; bigger ones (pit, respawn) snap.

**Lag compensation:** each input carries `vt`, the server tick on the player's screen. The server keeps the view lag (clamped to 0.4 s) and each player bullet tests hits against where enemies were that many ticks ago (16-tick position ring per awake enemy). Turrets and the fortress don't move, so they need no rewind.

Snapshots are JSON; only enemies within 1300 px of some player are sent. A full 8-player squad with all enemies near stays under 14 KB per snapshot (tested).

## Sessions and reconnect

`hello` returns `{id, token}`. The token is 192 bits of `crypto.randomBytes`, stored in the browser's `sessionStorage` (never in URLs) and presented as `hello.resume`. A dropped socket keeps the seat for a grace period (8 s in lobby, 30 s in match/results), input is neutralised immediately, and on resume the server replays `room` + `matchStart`. A resumed session replaces the older socket.

## Squad lifecycle

`lobby → mission → results → (play again | lobby)`. Seats 0–7 give each player a colour; freed seats are reused. Joining works in every phase; during a mission the newcomer is added to the running `Sim` (beside the squad, +1 life, protected) and gets `matchStart`. If the host leaves, host passes to a connected player. Empty squads are deleted; idle lobbies/results expire.

**Play now** (`quickMatch`): co-op needs no opponents, so there is no queue. The server drops the player into the fullest _public_ mission that is running, has a seat and has someone connected; otherwise it creates a public mission and starts it immediately. Private squads (invite links) are never filled by strangers.

## Client rendering

Procedural pixel art only (no image files): sky gradient + sun glow + drifting clouds, two mountain ridges and a jungle canopy or industrial skyline in parallax (tinted per zone), seeded tile textures and props, sprite characters picked by pose (idle/run/jump/fall/crouch/down/slide/dash/knife/flip) and 5 aim directions, mirrored for facing. Bosses are drawn procedurally from their snapshot (legs, rotor, cannons) with attack tells: red charge path, laser sights, warning signs, the beam line with a JUMP!/DUCK! cue, and red landing rings under lobbed grenades, shells and bombs. Effects use additive blending: dash after-images, knife arcs, super-move rings and slashes, bullet glows, multi-stage explosions, fireflies/embers, then a zone colour grade and vignette. Short screens zoom to a 400 px tall view with a vertically following camera. Screen-space overlays on the canvas: a mission progress strip (checkpoints, arenas, bosses, a dot per friend) and edge arrows to off-screen friends. The DOM HUD shows squad lives, a 100 HP bar with a damage trail, the super meter, weapon, zone, score, arena wave status, the combo counter with style rank, the boss bar with phase, a boss intro card and a KO countdown.

## Two runtimes, one core

```
             ┌──────────── GameCore (rooms, sessions, rules, limits) ────────────┐
Node:  http + ws  ──► Transport{send, close, bufferedAmount, terminate} ◄── WebSocketPair + Durable Object  :Cloudflare
```

Everything that decides game outcomes lives in `shared/` and `server/src/{core,room,security,config}.ts`, which use only Web-standard APIs (Web Crypto, `console`, timers), so the identical code runs on Node and in `workerd`. The e2e suite runs against both (`E2E_TARGET=node|cloudflare`).

On Cloudflare a single Durable Object (`idFromName('global')`) hosts every room, so all players share one "Play now" pool, exactly like the single Node process. It uses standard (non-hibernating) WebSockets, because rooms live in memory and tick 30 times a second while anyone is connected.

## Computer buddies

`Autopilot` (shared) runs right, jumps walls and pits, fights arena waves from a distance and turns to face enemies behind it, closes in to knife shield troopers, reads boss tells (jumps the low beam and shockwaves, ducks the high beam, double-jumps a charge), dodges incoming fire with a jump or dash, fires its super near a boss or a crowd, and waits if it gets more than 12 tiles ahead of the rearmost friend. A `skill` (0..1) sets how often it reacts in time. It is used for solo buddies (clearly labelled `(bot)`), `npm run playtest`, and a test that proves the mission can be finished.

## Why not…

- **Socket.IO / frameworks:** raw `ws` + a 20-line protocol is smaller, easier to audit and cheaper on free tiers.
- **A database:** nothing needs to outlive a match; rooms are memory-only by design (and say so in the privacy notice).
- **Lockstep / client-authoritative:** trivially cheatable. Server authority was a hard requirement.

## Missions and memory

- A mission is ~5–7 KB of tiles plus short spawn lists, built lazily and shared (`getMission`). Snapshots never carry level data, only the mission id at `matchStart`.
- Art styles (`jungle`, `desert`, `snow`, `night`…) are a cosmetic list in the level (`LevelDef.art`); the client maps each to a palette, prop set and weather in `world-art.ts`. Tile art is cached per style; full-screen backdrop tints are kept in a 6-entry LRU so switching missions does not pile up canvases.
- Mission toughness is data (`LevelDef.mods`): the sim multiplies trooper health, fire rate, damage taken, boss health and boss rest time by it. Wind-up tells never get shorter.

## Powers and fields (advanced missions)

- **Powers** (`POWER_KINDS` in `config.ts`, numbers in `GAME_CONFIG.powers`) live in the sim (`useAstra`, `stepPowers`, `bendBullet`): burning ground and black holes are short lists sent to clients as `Snapshot.fx`; the team brahmastra is `Snapshot.bm`. The input carries one optional `astra` flag (protocol v4).
- **Walls of fire** are ordinary gates with `fire: true`: solid until the rain power opens them, so physics, prediction and the snapshot gate mask need nothing new. Their altars are pickups with `respawn: true`.
- **Fields** (`LevelDef.fields`: low gravity, lift, gravity well, magnetic storm) are applied inside `stepPlayerMovement`, so the server and the client's prediction stay identical. Wells and storms also bend bullets in the sim.
- **Looks:** `LevelDef.faction` (army, pharaoh, norse, olympus, demon, void) is purely cosmetic: trooper bodies come from `FACTION_LOOKS` in `sprites.ts`; shields, wings, drones, turrets, gates and shot colours from `theme-art.ts`; themed bosses from `boss-art.ts` (same anchor points and attack tells as the army machines). All power and field drawing is in `client/src/game/power-fx.ts`.
- **Bots** use powers too (`Autopilot`): rain on a wall of fire (fetching it from the altar if needed), the others on a crowd or a boss, and the brahmastra near a boss.
