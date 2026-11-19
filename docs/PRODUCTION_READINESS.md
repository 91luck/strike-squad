# Production readiness and monetisation gate

**Status: feature-rich release candidate, not yet certified as a production-ready commercial game.** The repository contains a substantial game loop, ten-stage Astra Saga, hero progression, touch and keyboard input, solo bots, online co-op, PWA support, and a CrazyGames SDK adapter. That is a strong foundation; it is not proof of stable performance or revenue.

## What is already implemented

- Core gameplay, boss encounters, stage progression, hero unlocks, XP, daily/weekly goals, trophies and results.
- Solo training that does not depend on the multiplayer server.
- Online co-op using the Node WebSocket server or Cloudflare Durable Objects.
- Keyboard and touch controls, pause/settings, reduced-motion option, audio controls and installable PWA support.
- CrazyGames platform adapter for platform saves, invites, gameplay events, rewarded video and interstitial ads.
- Unit, integration, browser E2E, Cloudflare E2E, load/playtest and dependency-audit commands.

## Commercial reality

- **Own website / Cloudflare deployment:** the current web platform adapter does not provide an ad network, payment checkout, subscriptions or analytics. Do not expect revenue from the standalone deployment as-is.
- **CrazyGames:** the project has an SDK-based ad integration path. Revenue is conditional on portal approval, launch phase, eligible traffic, ad fill, geography, retention and the portal's current revenue rules. It is not guaranteed income.
- Do not add arbitrary third-party ad scripts or interrupt gameplay with ads. Keep ads within the approved platform SDK and at natural breaks; rewarded ads must remain optional and grant the reward only after confirmed completion.
- No real-money shop, premium currency purchase, account system or payment processor is currently promised by this build. Do not show purchase buttons until the full payment, refund, privacy, security and support flows exist.

## Required release gates

Run from the repository root:

```bash
npm ci
npm run release:preflight
npm run check
npm run test:e2e
npm run test:e2e:cloudflare
npm run package:crazygames
```

Then complete all of the following manually:

1. **Desktop:** Chrome and Firefox; 30-minute session; all ten stages; pause/resume; restart; browser refresh; audio mute; keyboard remapping; reduced motion.
2. **Physical Android:** at least one low/mid-range device and one modern device; landscape lock/fullscreen; multi-touch (move + fire + jump); heat, battery and frame-rate check over 20 minutes; incoming call/app switch; reconnect after network loss.
3. **iPhone/iPad:** Safari install and standalone mode, safe-area layout, audio resume, touch input and orientation behavior.
4. **Multiplayer:** two to eight real devices; invite link; late join; host leaves; temporary network loss; server restart; full room; duplicate callsigns; abusive/spam input.
5. **Performance:** record median and 1% low FPS, memory after 30 minutes, initial download size, stage transition stalls and network usage. Test on a throttled mobile connection.
6. **Portal QA:** upload the generated CrazyGames zip to its preview/QA flow, verify SDK events and save restore, test rewarded-ad success/failure/no-fill, and re-check current ad placement requirements.
7. **Operations:** configure production domain and WebSocket origin, inspect Cloudflare logs/limits, define a rollback procedure, and test the deployed URL from an external network.

## Acceptance targets (recommended)

- No crash, soft-lock, unrecoverable stuck state or progression loss in the above test matrix.
- 60 FPS target on modern desktop and stable 30 FPS minimum on the agreed low-end mobile test device; no sustained thermal throttling.
- First interactive screen in under 5 seconds on a representative 4G connection (measure, do not assume).
- All critical buttons usable by touch and keyboard, visible focus, readable contrast, and no text clipped at 320 CSS px / short landscape screens.
- Multiplayer reconnect and server-down states explain what happened and preserve solo play where possible.
- No high/critical dependency audit findings left unexplained; pin and review dependency updates.

## What to improve next based on real playtests

Prioritise observed issues rather than adding more content blindly: tutorial completion rate, first-stage completion, death/retry rate, average session length, day-1/day-7 return rate, boss quit points, touch misfires, and ad opt-in/close rates. Collect only privacy-reviewed, consent-appropriate aggregate analytics if a real product analytics system is later added.

A passing `release:preflight` only checks repository structure and key configuration. `npm run check` and both E2E targets are the automated quality gates; physical-device and portal QA remain mandatory.
