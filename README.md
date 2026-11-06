# STRIKE SQUAD: Co-op Missions

A free, run-and-gun co-op mission game for **1 to 8 friends** in the browser, in the spirit of the arcade side-scrollers. Send a link on WhatsApp and your friends are in the mission: no download, no sign-up. Works with a keyboard and with phone touch controls, and installs as an app.

**The point of the game is action you pull off together:** big bosses, flashy moves, and a squad that wins as one.

| Feature                | What happens                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Move set**           | Double jump, a **dash** that bullets pass through, Down + Dash **slide**, and a **knife** that hits 5× harder, breaks shields and swats bullets out of the air (parry)         |
| **Hero super moves**   | Each hero has one: Overdrive, Supernova shockwave, Airstrike, or a Phantom strike through the 7 nearest enemies. Two friends firing together = **SYNC** (+50%)                 |
| **Combo + style rank** | Chain hits without getting hit: C → B → A → S → SS → SSS, up to ×3 score, with call-outs (KNIFE KILL, AIR KILL, PARRY…)                                                        |
| **3 bosses**           | **WARHOUND** walking tank, **VULTURE** gunship, **IRON FORTRESS** (3 phases). Every attack has a readable tell: jump the low laser, duck the high one, dash through the charge |
| **Ambush arenas**      | The way locks shut and waves come from both sides and the sky                                                                                                                  |
| **You don't die fast** | 100 HP that refills out of fire; a KO puts you back beside your squad 3 seconds later using a shared life                                                                      |

**8 original heroes** (Blaze, Nova, Tusk, Viper, Sparky, Ghost, Kiki, Sarge), each with their own look and colour, picked on the menu stage or in the lobby. All art is original pixel art drawn by code (auto-outlined sprites, animated run/jump/crouch/aim, parallax jungle-to-fortress backdrops, additive-light effects): nothing to download, nothing borrowed from other games.

Mission 1, _Operation Lifeline_: Landing Zone → Jungle → **Ambush** → River Bridge → **WARHOUND** → Watchtowers → **VULTURE** → **Iron Fortress**. Four checkpoints, four weapons (Blaster, **S**pread, **M**achine gun, **L**aser), six enemy types (soldier, shield trooper, grenadier, jetpack, turret, drone).

## Play it on your PC (2 minutes)

You need Node.js 20 or newer.

```bash
npm install
npm run dev            # server on :8080, game on http://localhost:5173
```

Open http://localhost:5173 in two browser windows to try it with yourself, or press **Solo training** for an offline run with computer buddies.

On your phone over Wi-Fi: `npm run phone` prints a link and a QR code. Hinglish guide: [docs/PLAY_ON_PHONE_HINGLISH.md](docs/PLAY_ON_PHONE_HINGLISH.md).

## Put it online for free

From the zip to a live link (Hinglish, step by step): [docs/PUBLISH_AND_DEPLOY_HINGLISH.md](docs/PUBLISH_AND_DEPLOY_HINGLISH.md).

## Free hosting options

|                          | **Cloudflare Workers** (recommended)                                                                                                                                                                | **Northflank** (Sandbox)                                                                     | **Render** (free)                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Server sleeps when idle? | No                                                                                                                                                                                                  | No ("always on", per its pricing page)                                                       | Yes, after 15 min idle; the first visitor waits for a cold start (the game shows a "waking up" screen) |
| Card needed?             | No                                                                                                                                                                                                  | "No card needed" per pricing page (a third-party summary says a card is verified at sign-up) | No                                                                                                     |
| Free limits that matter  | 100,000 requests and 13,000 GB-s of Durable Object time **per day** ([official](https://developers.cloudflare.com/durable-objects/platform/pricing)): plenty for friends, not for a big public game | Small, "Limited" compute; 2 services                                                         | 750 instance hours/month                                                                               |
| How                      | `npx wrangler login` then `npm run deploy:cloudflare`, or the button below                                                                                                                          | Create a Combined service from your GitHub repo, build type Dockerfile, port 8080 public     | Push to GitHub, then **New → Blueprint**, or the button below                                          |

After you push this project to **your own public GitHub repo**, run `npm run personalize` once: it fills your repo into these buttons (or replace `YOUR_GITHUB_USERNAME` by hand). Then commit and push:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_GITHUB_USERNAME/strike-squad)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR_GITHUB_USERNAME/strike-squad)

**No environment variables are required.** The server accepts connections from its own address automatically, and picks up the URL Render injects. The `Dockerfile` is what Northflank (or any other container host) builds. Everything, including what "free" really means today and which hosts are no longer free, is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Optional automation: add a `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secret to your GitHub repo, and every push to `main` is tested and deployed by `.github/workflows/deploy-cloudflare.yml`.

## What's in the game

- **Astra Saga:** ten stages, each built around one divine astra inspired by the Indian epics (Agneyastra, Varunastra, Vayavyastra, Nagastra and Garudastra, the Brahmastra, Pashupatastra, the Narayanastra storm, the Sudarshana chakra, Vaishnavastra, Brahmashirsha). Bosses call astras too, each with a counter to learn. Every stage has a shape of its own (a broken bridge over the sea, an updraft gorge, serpent caves, fortress walls to climb or slip under, war trenches, a gauntlet of duels) and a hidden stash that glows from below. Every boss is its own creature with its own moves (fire rain, rings of shots, spinning streams, leaps, vanishing, warriors through portals), every stage its own army, and waves arrive through portals, out of the ground, or led by elite champions. Calling an astra plays a cut-in with its name in Devanagari. Stages open one by one; stars, astra shards and a continue after running out of lives. Design: [docs/ASTRA_SAGA.md](docs/ASTRA_SAGA.md).
- **Progression:** XP and levels, heroes that unlock as you level, a daily streak, trophies, and a reward screen that teases the next villain. Design and numbers: [docs/PROGRESSION.md](docs/PROGRESSION.md).
- **CrazyGames build:** `npm run package:crazygames` makes the portal zip (SDK, ads through the SDK, cloud saves, invites). Guide: [docs/CRAZYGAMES.md](docs/CRAZYGAMES.md).
- **Play with friends:** private squad, invite link, WhatsApp button, host picks difficulty (easy / normal / hard). Friends can join **any time, even mid-mission**: they appear next to the squad and the squad gains a life.
- **Play now:** drops you into a public mission already running; if there is none it starts one at once, and the next "Play now" player joins you. No waiting for opponents.
- **Solo training:** the full mission offline, alone or with 1 or 3 **computer buddies** (labelled `(bot)`) who fight beside you, dodge boss attacks and fire their own super moves.
- Phone controls: one joystick (run and 8-way aim), Jump, Dash, Knife and SUPER buttons, auto-fire (switchable; firing up close knifes automatically). Fullscreen + landscape on Android, "Add to Home Screen" tip on iPhone.
- Lag compensation: your shots are judged against what was on your screen (bounded to 400 ms).
- Results screen: up to 3 stars, each soldier's best style rank and combo, awards (Style King, Boss Breaker, Sharpshooter, Super Star).
- On short phone screens the camera zooms in (and follows up and down) so heroes stay big enough to read.

## Scripts

| Command                                                | What it does                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `npm run dev`                                          | Game server + Vite client with hot reload                                                            |
| `npm run phone`                                        | Build and serve on your Wi-Fi; prints a link + QR code for your phone                                |
| `npm run playtest -- 20 normal`                        | Computer squads of 1/2/4/8 play the mission; prints win rate, time, KOs, supers, combo               |
| `npm run test:url -- <url>`                            | Desktop + phone browser tests against any running copy (deployed or Wi-Fi)                           |
| `npm run publish:github`                               | Create your GitHub repo, push (with your private noreply email), print deploy links                  |
| `npm run personalize`                                  | Fill your GitHub repo into the Deploy buttons                                                        |
| `npm run check`                                        | Lint + format check, strict typecheck (4 projects), all unit/integration tests, production build     |
| `npm run test:e2e` / `npm run test:e2e:cloudflare`     | Real-browser tests against the Node server / the Cloudflare runtime                                  |
| `npm run dev:cloudflare` / `npm run deploy:cloudflare` | Run the Cloudflare build locally / deploy it                                                         |
| `npm run package:crazygames`                           | Build the CrazyGames version, check the portal's limits, write `release/strike-squad-crazygames.zip` |

## How it works

The browser sends only **intentions** (left/right, up/down, jump, fire, dash, knife, super) 30 times a second. The server owns the mission: movement, physics, enemies, hits, health, super meters, combos, arenas, lives, bosses, result. It sends compact snapshots 15 times a second. Your own soldier's running, jumping, dashing and sliding are predicted locally with the same physics code, so controls feel instant; everything else is server truth. The same game logic (`shared/`) runs on the server, in solo training, in the computer buddies, in the playtest script and in tests. The multiplayer core (`server/src/core.ts`) is runtime-independent, with two adapters: Node (`ws`) and Cloudflare (Durable Object). Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Docs

[Astra Saga](docs/ASTRA_SAGA.md) · [CrazyGames](docs/CRAZYGAMES.md) · [Zip → live (Hinglish)](docs/PUBLISH_AND_DEPLOY_HINGLISH.md) · [Play on phone (Hinglish)](docs/PLAY_ON_PHONE_HINGLISH.md) · [Hinglish deploy guide](docs/DEPLOY_GUIDE_HINGLISH.md) · [Deployment](docs/DEPLOYMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Game rules](docs/GAME_RULES.md) · [Network protocol](docs/NETWORK_PROTOCOL.md) · [Testing](docs/TESTING.md) · [Security](docs/SECURITY.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)

## Known limitations

- **The CrazyGames build is tested against a stand-in SDK**, not yet in CrazyGames' own QA tool; do that before submitting (docs/CRAZYGAMES.md).
- **Balance numbers come from computer players** (perfect aim, reacting to ~60% of attacks). Human playtests may shift difficulty.
- Phones were tested by emulation (Pixel 7 profile, real multi-touch events), not on a physical device. Only Chromium is tested automatically. Sound could not be listened to in the test environment.
- Cloudflare's free limits are **daily**; heavy use can hit them (online play then stops until 5:30 AM IST, solo training keeps working). One server instance holds all squads in memory, so a redeploy ends running missions.
- Online squads are humans only; computer buddies exist only in solo training.

## Roadmap

Mission 2 and a mission select · Hindi UI · emotes / quick chat · gamepad support · computer buddies to fill online squads.

## Author and licence

STRIKE SQUAD is developed by **Lokesh Mahadule**. Copyright © 2026 Lokesh Mahadule. All rights reserved.

This is **not** open-source software. No copying, modification, redistribution or reuse of the code, levels or
art is allowed without written permission; see [LICENSE](LICENSE). Open-source packages used to build the game
keep their own licences.
