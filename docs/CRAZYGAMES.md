# Publishing on CrazyGames

This is the step-by-step guide to put STRIKE SQUAD: Astra Saga on CrazyGames. The rules quoted here come from the
CrazyGames developer docs (checked November 2026); re-check them before each submission, they change.

- Requirements: <https://docs.crazygames.com/requirements/intro/>
- SDK (HTML5 v3): <https://docs.crazygames.com/sdk/html5-v3/intro>
- Ad rules: <https://docs.crazygames.com/requirements/ads/>
- Covers and video: <https://docs.crazygames.com/requirements/game-covers/>

## 1. Build the upload zip

```bash
npm ci
npm run package:crazygames
```

This builds `client/dist-crazygames` (`vite build --mode crazygames`) and writes
`release/strike-squad-crazygames.zip`, with `index.html` at the root of the zip. Before zipping, the script checks the
portal's limits and fails loudly if any is broken: under 20 MB (mobile initial download), at most 1500 files, relative
paths only, the SDK script present, no service worker.

What the CrazyGames build changes compared to the game's own site:

|                                                                                       | Own site (`npm run build`) | CrazyGames build                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Paths                                                                                 | `/assets/...`              | `./assets/...` (the portal serves the game from a folder)                                    |
| SDK                                                                                   | none                       | `crazygames-sdk-v3.js` in `<head>`, platform adapter on (`client/src/platform/platform.ts`)  |
| Saves                                                                                 | this browser               | CrazyGames data module (cloud save when signed in; existing local saves are moved over once) |
| Ads                                                                                   | none                       | midgame ad between solo runs, rewarded video to continue (only through the SDK)              |
| Co-op server                                                                          | same origin                | `client/crazygames.config.json` (`wsUrl`), override with `VITE_WS_URL`                       |
| Service worker, manifest, install button, own fullscreen button, WhatsApp/share links | yes                        | removed or hidden (portal rules)                                                             |
| Address bar `/join/CODE`                                                              | yes                        | never touched (inside the portal's iframe); invites use the SDK's invite link                |

## 2. Server: let the portal connect for co-op

Solo play (the whole Astra Saga) needs no server. Online co-op connects to the Cloudflare Worker, which only accepts
WebSockets from origins it knows. `wrangler.jsonc` now allows `https://*.crazygames.com` (any CrazyGames subdomain,
https only). Commit and push so Cloudflare redeploys the Worker with it.

If co-op does not connect from the CrazyGames preview, open the Worker's logs in the Cloudflare dashboard
(Workers & Pages → strike-squad → Logs) and look for `rejected websocket origin`: it shows the exact origin. Add it to
`ALLOWED_ORIGINS` (comma-separated) and redeploy.

The free Cloudflare plan has a daily request limit. Solo play does not use it at all; if co-op on CrazyGames becomes
busy, the paid Workers plan is the next step (check the price on Cloudflare's pricing page).

## 3. Developer Portal: what to fill in

1. Sign in at <https://developer.crazygames.com> and create a new game.
2. Upload `release/strike-squad-crazygames.zip`.
3. Orientation: **landscape**. Devices: desktop and mobile (touch controls are built in).
4. "Does your game save progress?": **yes** (it uses the data module).
5. Multiplayer: the game has optional online co-op (up to 8). Lobby size: min **2**, max **8**. There is no chat.
   Mobile orientation: **landscape**. "Supports CrazyGames muting audio through SDK": **yes**.
   What the CrazyGames multiplayer rules ask for, and where the game does it (`client/src/platform/platform.ts`):
   - **Room data**: the squad you are in is reported with `updateRoom({ roomId, isJoinable, inviteParams })`
     (joinable while the squad has space) and `leftRoom()` when you leave. Older SDKs without room data fall back
     to the invite button.
   - **Invites**: a friend who opens the game from an invite joins that squad at once (`inviteParams.squad`, or
     the old `getInviteParam('squad')`); an invite accepted while the game is already open (`addJoinRoomListener`)
     leaves whatever you were doing and joins the squad.
   - **Instant multiplayer**: opened with `isInstantMultiplayer`, the game skips the menu and opens the squad
     screen (mission and difficulty, then Create): a private squad that friends can join right away.
   - **Usernames**: a signed-in player's CrazyGames name is their callsign.
   - **Mute**: `settings.muteAudio` (and its change listener) silences the game over its own sound setting.
6. Covers (all three are required): `release/covers/` (1920x1080, 800x1200, 800x800). Key art drawn by the game's
   own renderer (real level, heroes and asura sprites) with the title only: no borders, no "Play now", no store logos.
   To redraw them, run `npm run dev -w client` and open `/tools/keyart.html?w=1920&h=1080&layout=landscape`
   (`layout=portrait|square`), then take a screenshot at that size (`client/src/tools/keyart.ts`; dev-only, not in
   any build).
7. Preview videos: `release/videos/preview-landscape-1920x1080.mp4` and `preview-portrait-1080x1620.mp4` (16.4 s,
   30 fps, H.264, no audio, first frame = the cover, no black bars, no cursor). Five real gameplay scenes, re-recorded
   with the HD art (stage 3: the Vayavyastra whirlwind lifting a crowd; stage 1: Agneyastra, then a whirlwind over the
   burning ground turning to fire; stage 4: Garudastra against the serpent boss; stage 8: the Chakravyuh walker;
   stage 10: an Agni super in the last war) at **real speed** (CrazyGames forbids
   fast-forward and speeds videos up slightly itself), joined with short fades. They were recorded frame by frame in a
   headless browser with the computer squad playing (`window.__strikesquad.autoplay(true)`), at 912x513 CSS px with 2x
   pixel density so the game uses its close-up camera, with the banners, kill feed and tips hidden. When recording
   with Playwright's fake clock, call `clock.pauseAt()` right after `clock.install()`: an installed clock keeps
   running in real time, so slow screenshots would otherwise leak time into the game and speed it up about 7x. The
   portrait version crops the middle of the screen over a blurred fill, so the HUD edges are cut.
8. Description and controls (paste and adjust):

> **STRIKE SQUAD: Astra Saga** is a side-scrolling run-and-gun adventure through ten stages, each built around one
> divine astra inspired by the Indian epics. Rain out walls of fire with Varunastra, loose serpents that never miss,
> throw the Sudarshana chakra that returns to your hand, and lay down your weapons when a boss calls the
> Narayanastra: fight it and the storm grows. Play solo with a computer buddy, or with up to 8 friends online.

> **Controls (keyboard):** A/D or arrows move, W/S aim, Space jump (twice: double jump), J fire, Shift dash (Down +
> Shift: slide), F knife, Q super move, R astra, Esc or P pause. **Touch:** left thumb moves and aims; buttons for
> Jump, Fire, Dash, Knife, Super and Astra.

## Checked against the CrazyGames requirements (Nov 2026)

- Touch controls follow the portal's device type (`SDK.user.systemInfo.device.type`), not touch APIs: a laptop with
  a touch screen gets keyboard controls (`Platform.device`, tested in `e2e/crazygames.spec.ts`).
- Text selection is off on `body`; the audio context is resumed on every tap, click and key (iOS).
- Relative paths only; 296 KB zipped (limit 50 MB, 20 MB for the mobile homepage); one click to gameplay.
- In the smallest game frames (821x462, 800x450) the HD art is used and the menu fits (907x510 too).
- P pauses as well as Escape (Escape leaves the portal's fullscreen first).
- Covers: three sizes, title only, no borders or badges. Videos: both orientations, 15-20 s, under 50 MB.

## 4. Test before you submit

- `npm test` (unit and integration) and `npm run test:e2e` (browser), including `e2e/crazygames.spec.ts`: it serves
  the CrazyGames build from a fake portal origin and folder with a stand-in SDK, and checks gameplay start/stop,
  the rewarded continue, the "no video available" path, the cloud save, and the midgame break.
- Then in the Developer Portal's **QA tool** (preview): play stage 1, pause and resume, run out of lives once and
  continue, clear a stage and press Next. In the browser console you should see the SDK's gameplay events.
- On a real phone: CrazyGames shows the game in its mobile site and app.

## 5. Launch stages (what to expect)

- **QA review** by the CrazyGames team (no published timeline). Common rejection reasons: bugs, missing English,
  unoriginal content, PEGI-12 problems.
- **Basic Launch**: a small audience, ads are **off**. The game must work without them: here the video button simply
  disappears ("No video is available right now") and astra shards still buy a continue. Ends after at least 7 days and
  500 plays, or after 21 days.
- **Full Launch**: needs the full SDK integration (done: gameplay start/stop, SDK-only ads, data module, user module).
  Revenue share starts here; payouts are monthly once the balance reaches EUR 100.
- Updates: upload a new zip from the portal; they are usually processed within a working day.

## 6. How the game follows the ad rules

- Midgame ads only at a natural break: after a solo run, when the player starts the next stage or retries. Never in
  the middle of play, never on menu buttons. The SDK itself limits them to one every 3 minutes.
- Rewarded video only when the player asks for it (Continue after running out of lives), marked as an ad, with an
  alternative (3 astra shards) and a "No thanks" of the same size. The reward is given only when the ad finished.
- Offered once per run, not after every death; and no midgame ad in the same break as a rewarded one.
- The game pauses and mutes only when an ad actually starts, and works normally with an ad blocker.
