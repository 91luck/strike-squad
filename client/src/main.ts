import '@fontsource/russo-one/latin-400.css';
import '@fontsource/chakra-petch/latin-400.css';
import '@fontsource/chakra-petch/latin-600.css';
import './style.css';
import {
  DIFFICULTIES,
  GAME_CONFIG,
  HEROES,
  MISSIONS,
  SAGA,
  getMission,
  heroOf,
  isPower,
  isMissionId,
  isSagaId,
  missionInfo,
  NAME_REGEX,
  ROOM_CODE_REGEX,
  parseJoinPath,
  rankName,
  type BoardEntry,
  type Difficulty,
  type MissionEnd,
  type MissionId,
  type RoomInfo,
  type SagaId,
  type ServerMessage,
} from '@strikesquad/shared';
import { Sfx } from './audio/sfx';
import { inviteLink, httpBase } from './env';
import { OnlineMatch } from './game/online';
import { SoloMatch, type SoloOptions } from './game/practice';
import { Renderer } from './game/renderer';
import { charFrame, heroLook, RUN_FRAMES, CENTER_X, FEET_Y } from './game/sprites';
import { MatchView } from './game/view';
import { InputController } from './input/input';
import { Connection, type ConnState } from './net/connection';
import { POWER_INFO } from './game/view';
import { initPlatform, type AdHooks } from './platform/platform';
import { registerPwa } from './pwa';
import { CONTINUE_COST, ProgressStore, SECRET_SHARDS } from './progress';
import {
  HERO_UNLOCK_LEVEL,
  ProfileStore,
  TROPHIES,
  TROPHY_SHARDS,
  localDay,
  type RunReward,
} from './profile';
import { teaserFor } from './villains';
import { CHEST_SHARDS, WEEKLY_SHARDS, WEEKLY_XP, WeeklyStore, type WeeklyReward } from './weekly';
import { SettingsStore, keyLabel } from './settings';
import { canFullscreen, enterLandscapeFullscreen, isIOS, isStandalone, phoneMatchGesture } from './ui/phone';
import {
  $,
  closeOverlay,
  confirmDialog,
  currentScreen,
  el,
  formatClock,
  installModalKeys,
  isOverlayOpen,
  openOverlay,
  showScreen,
  toast,
  type ScreenName,
} from './ui/dom';

// ---------------------------------------------------------------- state

/** Where the game runs (its own site, or the CrazyGames portal): ads, saves, invites. */
const platform = await initPlatform();
document.body.classList.toggle('portal', platform.id !== 'web');
for (const el of document.querySelectorAll<HTMLElement>('.portal-only')) el.hidden = platform.id === 'web';

const settings = new SettingsStore(platform.storage);
const progress = new ProgressStore(platform.storage);
const profile = new ProfileStore(platform.storage);
const weekly = new WeeklyStore(platform.storage, () => localDay());
// A hero chosen before it was unlocked (or from a wiped profile) falls back to the first one.
if (!profile.heroOpen(settings.value.hero)) settings.update({ hero: 0 });
const sfx = new Sfx();
const view = new MatchView($('game') as HTMLCanvasElement, sfx, () => settings.value);

let me: { id: string; name: string } | null = null;
let room: RoomInfo | null = null;
let online: OnlineMatch | null = null;
let practice: SoloMatch | null = null;
let practiceOpts: SoloOptions | null = null;
let lastEnd: MissionEnd | null = null;
let pendingAction: (() => void) | null = null;
let lastRoomCode: string | null = null;
let userLeft = false;
let heroSyncedFor: string | null = null;
type ServerStatus = 'checking' | 'waking' | 'ready' | 'down';
let serverStatus: ServerStatus = 'checking';
const SERVER_LABEL: Record<ServerStatus, string> = {
  checking: 'Checking server…',
  waking: 'Server waking up…',
  ready: 'Server ready',
  down: 'Server offline · Solo works',
};
let wakeTimer = 0;
let wakeStarted = 0;

const touchCapable = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const input = new InputController({
  settings: () => settings.value,
  isActive: () =>
    currentScreen() === 'game' &&
    !isPaused() &&
    !isOverlayOpen('overlay-conn') &&
    !isOverlayOpen('overlay-continue'),
  onPause: () => {
    if (document.querySelector('.modal-overlay:not([hidden])')) return; // a dialog is on top; it handles Escape
    if (currentScreen() === 'game') (isPaused() ? resume : pause)();
  },
});
input.attach();

function isPaused(): boolean {
  return isOverlayOpen('overlay-pause');
}

/** Change the address bar (invite links) - only on the game's own site, never inside a portal's frame. */
function setUrl(path: string): void {
  if (platform.ownsUrl) history.replaceState(null, '', path);
}

/** The invite link for a squad: the portal's own link when there is one. */
function squadLink(code: string): string {
  return platform.inviteLink(code) ?? inviteLink(code);
}

// Narayanastra: auto-fire holds off while the storm rages (laying down your weapons is how you get through it).
view.onStorm = (on) => {
  input.holdAutoFire = on;
};
// A hidden stash found in a saga stage: remembered once, and it pays shards.
view.onSecret = () => {
  const id = currentMission().id;
  if (isSagaId(id) && progress.foundSecret(id))
    view.notice(`✦ +${SECRET_SHARDS} astra shards for the secret`);
};

/** While an ad plays: the game is paused and silent. */
const adHooks: AdHooks = {
  start: () => {
    practice?.setPaused(true);
    platform.gameplay(false);
    sfx.setVolume(settings.value.volume, true);
  },
  end: () => sfx.setVolume(settings.value.volume, settings.value.muted),
};
/** A rewarded video was shown in this break between runs: no midgame ad on top of it (portal rule). */
let rewardedThisBreak = false;
/** One continue per run: the out-of-lives offer is not made every time. */
let continueUsed = false;

/** A natural break between solo runs: the portal may show an ad (it decides how often). */
async function breakAd(): Promise<void> {
  if (!lastEnd || online || room) return;
  if (rewardedThisBreak) {
    rewardedThisBreak = false;
    return;
  }
  await platform.midgameAd(adHooks);
}

// ---------------------------------------------------------------- connection

const conn = new Connection({
  onState: (state, attempt) => renderConnState(state, attempt),
  onWelcome: (w) => {
    me = { id: w.id, name: w.name };
    if (!w.resumed && room) {
      // The server forgot us (grace period expired or restarted): whatever we were in is gone.
      room = null;
      stopOnline();
      if (currentScreen() === 'game' || currentScreen() === 'lobby' || currentScreen() === 'results') {
        showScreen('menu');
        toast('You were disconnected for too long, so the room was closed.', 'error');
      }
    }
    closeOverlay('overlay-conn');
    hideWake();
    const act = pendingAction;
    pendingAction = null;
    act?.();
  },
  onMessage: (m) => onServerMessage(m),
});

function renderConnState(state: ConnState, attempt: number): void {
  const pill = $('conn-pill');
  pill.dataset.state = state;
  const label: Record<ConnState, string> = {
    idle: SERVER_LABEL[serverStatus],
    connecting: 'Connecting…',
    open: 'Online',
    reconnecting: 'Reconnecting…',
    lost: 'Disconnected',
  };
  pill.textContent = label[state];
  if (state === 'idle') pill.dataset.state = serverStatus;
  if (state === 'open' || state === 'idle' || state === 'connecting') closeOverlay('overlay-conn');
  else if (state === 'lost' || room !== null || online !== null) {
    $('conn-text').textContent =
      state === 'lost'
        ? 'Could not reach the server. It may be starting up (free hosts sleep when idle) or your network is down.'
        : `Trying to reconnect… (attempt ${attempt + 1})`;
    $('conn-spinner').hidden = state === 'lost';
    openOverlay('overlay-conn');
  }
  if (state === 'open') online?.sendNeutral();
  if (state === 'lost' && isOverlayOpen('overlay-wake')) {
    hideWake();
    closeOverlay('overlay-conn');
    showError(
      'The game server did not answer. It may still be starting, or it may be down. Try again in a minute, or play Practice offline.',
    );
  }
}

// ---------------------------------------------------------------- "server waking up" screen
// Free hosting sleeps when idle; the first visitor waits for a cold start. Say so plainly, show progress,
// and offer something to do meanwhile.

function showWakeSoon(): void {
  window.clearTimeout(wakeTimer);
  wakeStarted = performance.now();
  wakeTimer = window.setTimeout(function tick() {
    if (conn.isOpen || !pendingAction) return hideWake();
    if (!isOverlayOpen('overlay-wake')) openOverlay('overlay-wake');
    const sec = Math.round((performance.now() - wakeStarted) / 1000);
    $('wake-elapsed').textContent = `${sec} s`;
    $('wake-bar').style.width = `${Math.min(96, (sec / 60) * 100)}%`;
    wakeTimer = window.setTimeout(tick, 500);
  }, 1500);
}

function hideWake(): void {
  window.clearTimeout(wakeTimer);
  closeOverlay('overlay-wake');
}

$('btn-wake-cancel').addEventListener('click', () => {
  pendingAction = null;
  hideWake();
  conn.close(true);
  showScreen('menu');
});
$('btn-wake-practice').addEventListener('click', () => {
  pendingAction = null;
  hideWake();
  conn.close(true);
  showScreen('practice');
});

function showError(text: string): void {
  $('error-text').textContent = text;
  openOverlay('overlay-error');
}

function ensureConnected(action: () => void): void {
  sfx.unlock();
  userLeft = false;
  const name = currentName();
  if (conn.isOpen) {
    action();
    return;
  }
  pendingAction = action;
  if (conn.state === 'idle' || conn.state === 'lost') {
    conn.connect(name);
    showWakeSoon();
  } else toast('Connecting to the server…');
}

function currentName(fromId = 'name-input'): string {
  const raw = ($(fromId) as HTMLInputElement).value.trim();
  const name =
    raw && NAME_REGEX.test(raw)
      ? raw.slice(0, GAME_CONFIG.limits.maxNameLength)
      : settings.value.name || `Soldier${100 + Math.floor(Math.random() * 900)}`;
  if (name !== settings.value.name) settings.update({ name });
  ($('name-input') as HTMLInputElement).value = name;
  ($('join-name') as HTMLInputElement).value = name;
  return name;
}

// ---------------------------------------------------------------- server messages

function onServerMessage(m: ServerMessage): void {
  switch (m.t) {
    case 'room':
      onRoom(m.room);
      break;
    case 'left':
      room = null;
      leaveToMenu(false);
      break;
    case 'matchStart':
      startOnlineMatch(m);
      break;
    case 'snap':
      online?.onSnap(m);
      break;
    case 'matchEnd':
      showResults(m, true);
      break;
    case 'error':
      onServerError(m);
      break;
    default:
      break;
  }
}

function onServerError(m: Extract<ServerMessage, { t: 'error' }>): void {
  switch (m.code) {
    case 'room_not_found':
    case 'room_expired':
    case 'room_full':
    case 'match_in_progress':
    case 'already_in_room': {
      if (currentScreen() === 'join') {
        const p = $('join-error');
        p.textContent = m.message;
        p.hidden = false;
      } else toast(m.message, 'error');
      break;
    }
    case 'session_expired':
      toast('Your previous session expired. Starting fresh.', 'error');
      break;
    case 'rate_limited':
      toast('Slow down a little: too many requests.', 'error');
      break;
    case 'bad_version':
      showError('This page is out of date. Please reload to get the latest version of the game.');
      break;
    case 'too_many_connections':
    case 'server_busy':
      showError(m.message);
      break;
    default:
      toast(m.message, 'error');
  }
}

/** Small, non-blocking in-mission notices when friends drop in or leave. */
function announceChanges(prev: RoomInfo, next: RoomInfo): void {
  const before = new Set(prev.players.map((p) => p.id));
  const after = new Set(next.players.map((p) => p.id));
  for (const p of next.players)
    if (!before.has(p.id) && p.id !== me?.id) view.notice(`➕ ${p.name} joined the squad (+1 team life)`);
  for (const p of prev.players) if (!after.has(p.id)) view.notice(`${p.name} left`);
}

function onRoom(r: RoomInfo): void {
  const prev = room;
  const prevPhase = room?.phase;
  room = r;
  lastRoomCode = r.code;
  // Bring your favourite hero into every squad you join (once per squad; you can still change it there).
  const mine = me ? r.players.find((p) => p.id === me?.id) : undefined;
  if (mine && r.phase !== 'match' && heroSyncedFor !== r.code) {
    heroSyncedFor = r.code;
    if (mine.hero !== settings.value.hero) conn.send({ t: 'setHero', hero: settings.value.hero });
  }
  if (r.phase === 'match') {
    if (prev && prevPhase === 'match' && online) announceChanges(prev, r);
    $('btn-pause-invite').hidden = false;
    return;
  }
  if (r.phase === 'lobby') {
    if (online) stopOnline();
    renderLobby();
    if (currentScreen() !== 'lobby') {
      showScreen('lobby');
      if (userLeft) return;
      setUrl(`/join/${r.code}`);
    }
  } else if (r.phase === 'results') {
    if (prevPhase === 'match' || currentScreen() === 'results') renderResultsButtons();
  }
}

// ---------------------------------------------------------------- online mission

function startOnlineMatch(m: Extract<ServerMessage, { t: 'matchStart' }>): void {
  stopOnline();
  stopPractice();
  if (!room) return;
  closeOverlay('overlay-pause');
  lastEnd = null;
  showScreen('game', false);
  $('pause-note').textContent = 'Online missions keep running while this menu is open.';
  $('btn-pause-invite').hidden = false;
  setupTouch();
  missionControls(room.settings.mission);
  online = new OnlineMatch(m, view, conn, input);
  online.run();
  platform.gameplay(true);
  if (m.snap.phase !== 'countdown') view.notice('You joined the squad mid-mission — find your friends!');
  setUrl(`/join/${room.code}`);
  maybeCoach();
}

/** Control hints the first time someone plays (adapted to touch or keyboard). */
function maybeCoach(): void {
  if (settings.value.coachSeen) return;
  settings.update({ coachSeen: true });
  view.showCoach(
    touchCapable
      ? `Left thumb: run & aim · Right: Jump (twice = double jump), Dash, Knife, SUPER, ASTRA · ${input.autoFire() ? 'Fire is automatic' : 'Hold Fire, or tap AUTO FIRE'}`
      : `Move A/D · Aim W/S · Jump ${keyLabel(settings.value.keyJump)} (twice: double) · Fire ${keyLabel(settings.value.keyFire)} · Dash Shift · Slide ↓+Shift · Knife F · Super Q · Astra R`,
    9000,
  );
  const dismiss = (): void => {
    if (currentScreen() === 'game' && !$('overlay-countdown').hidden) return; // keep it during the countdown
    view.hideCoach();
    $('touch').removeEventListener('pointerdown', dismiss);
    window.removeEventListener('keydown', dismiss);
  };
  $('touch').addEventListener('pointerdown', dismiss);
  window.addEventListener('keydown', dismiss);
}

function stopOnline(): void {
  online?.stop();
  online = null;
}

/**
 * Per-mission controls: advanced missions start with auto-fire OFF (the AUTO button or T turns it on), and show
 * the ASTRA button when the mission has powers.
 */
function missionControls(id: MissionId): void {
  const info = missionInfo(id);
  input.autoFireOverride = info.advanced ? false : null;
  const level = getMission(id);
  const powers = level.brahma || level.pickups.some((p) => isPower(p.kind));
  $('touch').classList.toggle('has-powers', powers);
  $('btn-touch-astra').classList.toggle('void', level.faction === 'void');
  $('btn-touch-astra').textContent = level.faction === 'void' ? 'POWER' : 'ASTRA';
  showAutoFire(input.autoFire());
}

function showAutoFire(on: boolean): void {
  const b = $('btn-touch-auto');
  b.textContent = `AUTO FIRE: ${on ? 'ON' : 'OFF'}`;
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  $('btn-touch-fire').classList.toggle('auto', on);
}
input.onAutoFireChange = (on) => {
  showAutoFire(on);
  if (currentScreen() === 'game') view.notice(on ? 'Auto-fire ON' : 'Auto-fire OFF');
};

function setupTouch(): void {
  $('touch').hidden = !touchCapable;
  if (touchCapable) input.usedTouch = true;
  showAutoFire(input.autoFire());
  if (settings.value.coachSeen) $('joy-zone').classList.add('used');
  const portrait = touchCapable && window.innerHeight > window.innerWidth;
  $('overlay-portrait').hidden = !portrait || sessionStorage.getItem('portraitDismissed') === '1';
  // Android browsers can rotate + go fullscreen from a tap; iPhones can't, so give them the next best thing.
  $('btn-portrait-rotate').hidden = !canFullscreen() || isStandalone() || isIOS();
  $('portrait-tip').textContent =
    isIOS() && !isStandalone()
      ? 'Tip: in Safari tap Share → "Add to Home Screen" and open the game from there to hide the browser bars.'
      : '';
  view.resize();
}

window.addEventListener('resize', () => {
  if (currentScreen() !== 'game') return;
  const portrait = touchCapable && window.innerHeight > window.innerWidth;
  if (!portrait) $('overlay-portrait').hidden = true;
});
$('joy-zone').addEventListener('pointerdown', () => $('joy-zone').classList.add('used'));
{
  const game = $('screen-game');
  const block = (e: Event): void => e.preventDefault();
  game.addEventListener('contextmenu', block);
  game.addEventListener('selectstart', block);
  // iOS Safari ignores touch-action for page bounce / pull-to-refresh; cancel stray scroll gestures in play.
  game.addEventListener(
    'touchmove',
    (e) => {
      if (!(e.target as HTMLElement).closest('.overlay')) e.preventDefault();
    },
    { passive: false },
  );
}
$('btn-portrait-rotate').addEventListener('click', async () => {
  if (await enterLandscapeFullscreen()) $('overlay-portrait').hidden = true;
  else toast('Rotate your phone sideways (auto-rotate may be off).', 'error');
});
$('btn-portrait-dismiss').addEventListener('click', () => {
  $('overlay-portrait').hidden = true;
  try {
    sessionStorage.setItem('portraitDismissed', '1');
  } catch {
    /* ignore */
  }
});

// ---------------------------------------------------------------- solo training

function startPractice(opts: SoloOptions): void {
  sfx.unlock();
  stopPractice();
  stopOnline();
  practiceOpts = opts;
  closeOverlay('overlay-pause');
  showScreen('game', false);
  $('pause-note').textContent = 'Solo training is paused.';
  $('btn-pause-invite').hidden = true;
  setupTouch();
  missionControls(opts.mission);
  continueUsed = false;
  practice = new SoloMatch(opts, view, input, (r) => onSoloEnd(r));
  practice.run();
  platform.gameplay(true);
  maybeCoach();
}

/** A solo run ended. Out of lives the first time: offer a continue instead of the results. */
function onSoloEnd(r: MissionEnd): void {
  if (r.result === 'failed' && r.reason === 'lives' && !continueUsed && practice) {
    window.setTimeout(() => offerContinue(r), 700);
    return;
  }
  window.setTimeout(() => showResults(r, false), 600);
}

const CONTINUE_LIVES = 3;
let pendingEnd: MissionEnd | null = null;
/** No video came back this session (Basic Launch, ad blocker): the video button stays hidden. */
let videoUnavailable = false;

function offerContinue(r: MissionEnd): void {
  pendingEnd = r;
  platform.gameplay(false);
  $('continue-text').textContent = `Keep fighting from right here with ${CONTINUE_LIVES} squad lives.`;
  $('btn-continue-ad').hidden = !platform.ads || videoUnavailable;
  const shards = $('btn-continue-shards') as HTMLButtonElement;
  shards.disabled = progress.shards < CONTINUE_COST;
  $('continue-shards-left').textContent =
    `You have ${progress.shards}${shards.disabled ? ' · clear stages for more' : ''}`;
  $('continue-note').textContent = '';
  openOverlay('overlay-continue');
}

function continueRun(viaVideo: boolean): void {
  closeOverlay('overlay-continue');
  if (!practice || !practice.revive(CONTINUE_LIVES)) {
    if (pendingEnd) showResults(pendingEnd, false);
    return;
  }
  continueUsed = true;
  rewardedThisBreak = viaVideo;
  pendingEnd = null;
  platform.gameplay(true);
  view.notice(`Back in the fight with ${CONTINUE_LIVES} squad lives!`);
}

$('btn-continue-ad').addEventListener('click', async () => {
  const btn = $('btn-continue-ad') as HTMLButtonElement;
  btn.disabled = true;
  const ok = await platform.rewardedAd(adHooks);
  btn.disabled = false;
  if (ok) return continueRun(true);
  // No video (or it was skipped): no reward. Say so and leave the other choices.
  videoUnavailable = true;
  btn.hidden = true;
  $('continue-note').textContent = 'No video is available right now. You can still continue with shards.';
});
$('btn-continue-shards').addEventListener('click', () => {
  if (progress.spendShards(CONTINUE_COST)) continueRun(false);
});
$('btn-continue-no').addEventListener('click', () => {
  closeOverlay('overlay-continue');
  const r = pendingEnd;
  pendingEnd = null;
  if (r) showResults(r, false);
});

function stopPractice(): void {
  practice?.stop();
  practice = null;
}

// ---------------------------------------------------------------- pause

function pause(): void {
  if (currentScreen() !== 'game' || isOverlayOpen('overlay-continue')) return;
  practice?.setPaused(true);
  online?.sendNeutral();
  openOverlay('overlay-pause');
  platform.gameplay(false);
}

function resume(): void {
  closeOverlay('overlay-pause');
  practice?.setPaused(false);
  platform.gameplay(true);
}

$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-pause-invite').addEventListener('click', () => void copyInvite('pause-note'));
$('btn-pause-leave').addEventListener('click', async () => {
  const ok = await confirmDialog(
    online ? 'Leave the mission? Your squad plays on without you.' : 'Quit solo training?',
    'Leave',
  );
  if (!ok) return;
  closeOverlay('overlay-pause');
  if (online) leaveRoom();
  else leaveToMenu(true);
});
$('btn-pause-sound').addEventListener('click', () => {
  settings.update({ muted: !settings.value.muted });
});
$('btn-fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  if (!canFullscreen()) {
    toast(
      isIOS()
        ? 'iPhone browsers have no fullscreen. Use Share → "Add to Home Screen".'
        : 'Fullscreen is not available here.',
    );
    return;
  }
  await enterLandscapeFullscreen();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentScreen() === 'game') {
    online?.sendNeutral();
    if (practice) pause();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (currentScreen() === 'game' && online) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------------------------------------------------------------- results

const AWARDS: { title: string; pick: (b: BoardEntry) => number; unit: string }[] = [
  { title: 'Style King', pick: (b) => b.bestCombo, unit: 'hit combo' },
  { title: 'Boss Breaker', pick: (b) => b.bossDamage, unit: 'boss damage' },
  { title: 'Sharpshooter', pick: (b) => b.kills, unit: 'enemy' },
  { title: 'Super Star', pick: (b) => b.ults, unit: 'super move' },
];

function showResults(r: MissionEnd, isOnline: boolean): void {
  stopOnline();
  stopPractice();
  closeOverlay('overlay-pause');
  closeOverlay('overlay-continue');
  platform.gameplay(false);
  lastEnd = r;
  const meId = isOnline ? me?.id : 'me';
  const won = r.result === 'won';
  const title = $('h-results');
  title.textContent = won ? 'Mission complete!' : 'Mission failed';
  title.dataset.result = won ? 'win' : 'loss';
  const players = r.board.length;
  const best = r.board.reduce((n, b) => Math.max(n, b.rank), -1);
  const played = currentMission();
  const info = missionInfo(played.id);
  // Stars: 1 for finishing, +1 with a life to spare, +1 with a life to spare for every soldier.
  const stars = !won ? 0 : 1 + (r.livesLeft >= 1 ? 1 : 0) + (r.livesLeft >= players ? 1 : 0);
  const shardsBefore = progress.shards;
  const first = won && progress.won(played.id, r.timeSec, played.difficulty, stars);
  if (first) {
    toast(`${info.name} completed for the first time!`);
    platform.happytime();
  }
  const earned = progress.shards - shardsBefore;
  if (earned > 0) toast(`+${earned} astra shard${earned === 1 ? '' : 's'} ✦`);
  // The long-term loop: XP, level, hero unlocks and trophies. A mission everybody walked out of pays nothing.
  const meRow = r.board.find((b) => b.id === meId);
  const counted = r.reason !== 'abandoned';
  const week = counted
    ? weekly.record({
        won,
        stars,
        saga: isSagaId(played.id),
        online: isOnline,
        squad: players,
        difficulty: played.difficulty,
        hero: meRow?.hero ?? settings.value.hero,
        me: meRow,
      })
    : null;
  const reward = counted
    ? profile.record(
        { won, stars, first, me: meRow, sagaCleared: progress.sagaCleared(), sagaTotal: SAGA.length },
        week?.xp ?? 0,
      )
    : null;
  const bonusShards = (reward?.shards ?? 0) + (week?.shards ?? 0);
  if (bonusShards > 0) progress.grantShards(bonusShards);
  renderReward(reward, week);
  renderUpNext(played.id, won);
  renderPlayerCard();
  fillMissionSelects();
  $('result-sub').textContent = won
    ? `${players === 1 ? 'You' : `All ${players} of you`} completed ${info.name} in ${formatClock(r.timeSec)} with ${r.livesLeft} team ${r.livesLeft === 1 ? 'life' : 'lives'} to spare. Score ${r.score}.`
    : r.reason === 'abandoned'
      ? 'Everybody left the mission.'
      : r.reason === 'time'
        ? 'The mission took too long and was called off.'
        : `The squad ran out of lives after ${formatClock(r.timeSec)}. Score ${r.score}.`;
  sfx.play(won ? 'victory' : 'defeat');
  // Awards celebrate style, not just shooting.
  const awards: HTMLElement[] = [];
  if (players > 1)
    for (const a of AWARDS) {
      const top = [...r.board].sort((x, y) => a.pick(y) - a.pick(x))[0];
      const best = top;
      if (best && a.pick(best) > 0)
        awards.push(
          el(
            'div',
            { class: 'award' },
            el('b', { text: a.title }),
            el('span', {
              text: `${best.name} · ${a.pick(best)} ${a.unit}${a.pick(best) === 1 || a.unit.endsWith('damage') || a.unit.endsWith('combo') ? '' : 's'}`,
            }),
          ),
        );
    }
  $('result-awards').replaceChildren(...awards);
  $('result-stars').replaceChildren(
    ...[0, 1, 2].map((i) => el('span', { class: i < stars ? 'star on' : 'star', text: '★' })),
  );
  $('result-stars').setAttribute('aria-label', `${stars} of 3 stars`);
  $('result-stars').hidden = !won;
  const saga = isSagaId(played.id) ? SAGA.find((x) => x.id === played.id) : undefined;
  $('result-lesson').textContent = saga
    ? won
      ? `${saga.astraName}: ${saga.lore}`
      : `Tip: ${saga.how}`
    : best >= 3
      ? `Best style: ${rankName(best)} rank. Stylish!`
      : players === 1
        ? 'Tip: fire your super with a friend for a SYNC bonus. Tap “Play with friends” and send the link!'
        : 'Tip: knife up close, slide under shots and keep the combo going for a higher rank.';
  renderBoard(r.board, meId);
  showScreen('results');
  renderResultsButtons();
}

/** One line of the reward list on the results screen (it slides in after the XP bar fills). */
type RewardKind = 'level' | 'hero' | 'trophy' | 'weekly';

function rewardItem(kind: RewardKind, icon: Node | string, text: string, index: number): HTMLElement {
  const li = el('li', { class: `reward-item ${kind}` }, icon, el('span', { text }));
  li.style.animationDelay = `${0.6 + index * 0.4}s`;
  return li;
}

/** XP bar, level-up, new heroes and trophies: the "what did I get" moment after every run. */
function renderReward(r: RunReward | null, week: WeeklyReward | null): void {
  $('result-reward').hidden = r === null;
  if (!r) return;
  const leveled = r.levelAfter > r.levelBefore;
  $('reward-level').textContent = `LV ${r.levelAfter}`;
  $('reward-xp').textContent = `+${r.xpGained} XP`;
  const fill = $('reward-fill');
  const set = (frac: number, animate: boolean): void => {
    fill.style.transition = animate ? 'width 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    fill.style.width = `${Math.round(frac * 100)}%`;
  };
  if (settings.value.reduceMotion) set(r.barAfter, false);
  else {
    set(r.barBefore, false);
    const next = (f: () => void): number => requestAnimationFrame(() => requestAnimationFrame(f));
    next(() => {
      set(leveled ? 1 : r.barAfter, true);
      // A level-up fills the bar to the top, then starts the new level's bar from empty.
      if (leveled)
        window.setTimeout(() => {
          set(0, false);
          next(() => set(r.barAfter, true));
        }, 1000);
    });
  }
  const items: HTMLElement[] = [];
  const add = (kind: RewardKind, icon: Node | string, text: string): void => {
    items.push(rewardItem(kind, icon, text, items.length));
  };
  if (leveled) add('level', '⬆', `LEVEL UP! You are now level ${r.levelAfter}`);
  for (const h of r.newHeroes) {
    const icon = el('canvas', { attrs: { width: '28', height: '28', 'aria-hidden': 'true' } });
    Renderer.drawIcon(icon, h);
    const hero = heroOf(h);
    add('hero', icon, `NEW HERO: ${hero.name} · ${hero.perk.name}: ${hero.perk.text}`);
  }
  for (const t of r.newTrophies) add('trophy', t.icon, `Trophy: ${t.name} · +${TROPHY_SHARDS} ✦`);
  for (const g of week?.moved ?? [])
    add(
      'weekly',
      g.done ? '✅' : '📅',
      g.done
        ? `Weekly done: ${g.text} · +${WEEKLY_SHARDS} ✦ +${WEEKLY_XP} XP`
        : `Weekly: ${g.text} · ${g.progress}/${g.target}`,
    );
  if (week?.chest) add('level', '🎁', `WEEKLY CHEST OPENED · +${CHEST_SHARDS} ✦`);
  $('reward-list').replaceChildren(...items);
}

/** The tease under the reward: who waits in the next stage (or, after a loss, the same villain's taunt). */
function renderUpNext(id: MissionId, won: boolean): void {
  const box = $('result-next');
  box.hidden = true;
  if (!isSagaId(id)) return;
  const upcoming = won ? nextMission(id) : id;
  if (!upcoming || !isSagaId(upcoming)) {
    if (won) {
      const stars = progress.sagaStars();
      box.replaceChildren(
        el('b', { class: 'up-label', text: 'ASTRA SAGA COMPLETE' }),
        el('span', {
          text:
            stars >= SAGA.length * 3
              ? 'Every stage at three stars. Legendary!'
              : `${stars} of ${SAGA.length * 3} stars. Replay a stage to win the rest.`,
        }),
      );
      box.hidden = false;
    }
    return;
  }
  const t = teaserFor(upcoming);
  if (!t) return;
  box.replaceChildren(
    el('b', { class: 'up-label', text: won ? 'UP NEXT' : 'THE VILLAIN WAITS' }),
    el('span', { class: 'up-stage', text: `Stage ${t.num} · ${t.name}` }),
    el('span', { class: 'up-villains', text: t.villains.join(' · ') }),
    el('q', { class: 'up-taunt', text: t.taunt }),
    ...(won ? [el('small', { class: 'up-astra', text: `You will learn ${t.astraName}` })] : []),
  );
  box.hidden = false;
}

/** The menu's profile card: level, XP, streak, and the next hero to chase. */
function renderPlayerCard(): void {
  const bar = profile.levelBar();
  const pct = Math.round(bar.frac * 100);
  $('pc-level').textContent = `LV ${bar.level}`;
  $('pc-fill').style.width = `${pct}%`;
  $('pc-bar').setAttribute('aria-valuenow', String(pct));
  $('pc-streak').textContent = profile.streak > 0 ? `🔥 ${profile.streak}-day streak` : '';
  $('btn-weekly').textContent = `📅 Weekly ${weekly.finishedCount}/3`;
  const next = profile.nextHero();
  const xp = bar.need > 0 ? ` · ${bar.into}/${bar.need} XP` : '';
  $('pc-next').textContent = next
    ? `Next hero: ${heroOf(next.hero).name} at LV ${next.level}${xp}`
    : `All heroes unlocked${xp}`;
}

function renderTrophies(): void {
  $('trophy-sub').textContent =
    `${profile.trophyCount} of ${TROPHIES.length} earned. Each trophy pays ${TROPHY_SHARDS} astra shards ✦`;
  $('trophy-list').replaceChildren(
    ...TROPHIES.map((t) => {
      const got = profile.trophyEarned(t.id);
      return el(
        'li',
        { class: got ? 'earned' : 'locked', attrs: { 'data-testid': `trophy-${t.id}` } },
        el('span', { class: 'codex-icon', text: got ? t.icon : '?', attrs: { 'aria-hidden': 'true' } }),
        el('div', {}, el('b', { text: got ? t.name : `${t.name} (locked)` }), el('p', { text: t.how })),
      );
    }),
  );
}

function renderWeekly(): void {
  const days = weekly.daysLeft;
  $('weekly-sub').textContent =
    `New goals every Monday, the same for every player: resets in ${days} day${days === 1 ? '' : 's'}. ` +
    `Each goal pays ${WEEKLY_SHARDS} ✦ and ${WEEKLY_XP} XP; finish all three for the weekly chest (+${CHEST_SHARDS} ✦).`;
  $('weekly-list').replaceChildren(
    ...weekly.goals().map((g) => {
      const fill = el('i');
      fill.style.width = `${Math.round((g.progress / g.target) * 100)}%`;
      return el(
        'li',
        { class: g.done ? 'done' : '', attrs: { 'data-testid': `weekly-${g.id}` } },
        el('b', { text: `${g.done ? '✅ ' : ''}${g.text}` }),
        el('span', { class: 'weekly-count', text: `${g.progress} / ${g.target}` }),
        el('div', { class: 'xpbar' }, fill),
      );
    }),
  );
}

$('btn-weekly').addEventListener('click', () => {
  renderWeekly();
  openOverlay('modal-weekly');
});

$('btn-trophies').addEventListener('click', () => {
  renderTrophies();
  openOverlay('modal-trophies');
});

/** The first visit of the day pays shards, more for each day in a row. */
function claimDaily(): void {
  const d = profile.claimDaily(localDay());
  if (!d.claimed) return;
  progress.grantShards(d.shards);
  toast(
    `Daily visit · day ${d.streak} in a row · +${d.shards} astra shard${d.shards === 1 ? '' : 's'} ✦`,
    'ok',
    5500,
  );
}

function renderBoard(board: BoardEntry[], meId: string | undefined): void {
  const rows = [...board].sort((a, b) => b.score - a.score);
  $('board-body').replaceChildren(
    ...rows.map((b) => {
      const tr = el('tr', { class: b.id === meId ? 'me' : '' });
      const icon = el('canvas', { attrs: { 'aria-hidden': 'true', width: '22', height: '22' } });
      Renderer.drawIcon(icon, b.hero);
      tr.append(
        el('td', {}, icon, ` ${b.name}${b.id === meId ? ' (you)' : ''}`),
        el('td', { class: `rank r${b.rank}`, text: b.rank >= 0 ? rankName(b.rank) : '–' }),
        el('td', { text: String(b.bestCombo) }),
        el('td', { text: String(b.kills) }),
        el('td', { text: String(b.ults) }),
        el('td', { text: String(b.bossDamage) }),
        el('td', { text: String(b.deaths) }),
      );
      return tr;
    }),
  );
}

/** The mission (and difficulty) of the squad or solo run that just ended. */
function currentMission(): { id: MissionId; difficulty: Difficulty } {
  if (room) return { id: room.settings.mission, difficulty: room.settings.difficulty };
  return { id: practiceOpts?.mission ?? 'mission-1', difficulty: practiceOpts?.difficulty ?? 'normal' };
}

/** The mission after this one in the campaign, if any. */
function nextMission(id: MissionId): MissionId | null {
  if (isSagaId(id)) {
    const i = SAGA.findIndex((m) => m.id === id);
    const next = SAGA[i + 1]?.id;
    return next && progress.unlocked(next) ? next : null;
  }
  const i = MISSIONS.findIndex((m) => m.id === id);
  return MISSIONS[i + 1]?.id ?? null;
}

function renderResultsButtons(): void {
  if (currentScreen() !== 'results') return;
  const hint = $('results-hint');
  const rematch = $('btn-rematch') as HTMLButtonElement;
  const toLobby = $('btn-to-lobby') as HTMLButtonElement;
  const next = $('btn-next-mission') as HTMLButtonElement;
  const upcoming = lastEnd?.result === 'won' ? nextMission(currentMission().id) : null;
  next.hidden = !upcoming || (room !== null && room.hostId !== me?.id);
  if (upcoming) next.textContent = `Next: ${missionInfo(upcoming).name} ▶`;
  $('btn-results-stages').hidden = room !== null || !isSagaId(currentMission().id);
  if (room === null) {
    rematch.disabled = false;
    toLobby.hidden = true;
    hint.textContent = '';
    return;
  }
  const host = room.hostId === me?.id;
  rematch.disabled = !host;
  toLobby.hidden = false;
  toLobby.disabled = !host;
  hint.textContent = host
    ? 'Play the mission again, or go back to the lobby to invite more friends.'
    : 'Waiting for the host to start the next mission…';
}

$('btn-rematch').addEventListener('click', async () => {
  phoneMatchGesture();
  if (room) conn.send({ t: 'rematch' });
  else if (practiceOpts) {
    const opts = practiceOpts;
    await breakAd();
    startPractice(opts);
  }
});
$('btn-results-stages').addEventListener('click', () => showSaga());
$('btn-to-lobby').addEventListener('click', () => conn.send({ t: 'toLobby' }));
$('btn-next-mission').addEventListener('click', async () => {
  const next = nextMission(currentMission().id);
  if (!next) return;
  phoneMatchGesture();
  if (room) {
    // Host: back to the lobby, switch mission, go (the server handles these in order).
    conn.send({ t: 'toLobby' });
    conn.send({ t: 'setSettings', settings: { mission: next } });
    conn.send({ t: 'startMatch' });
  } else if (practiceOpts) {
    const opts = { ...practiceOpts, mission: next };
    await breakAd();
    startPractice(opts);
  }
});
$('btn-results-leave').addEventListener('click', () => (room ? leaveRoom() : leaveToMenu(true)));

// ---------------------------------------------------------------- navigation

function leaveRoom(): void {
  userLeft = true;
  conn.send({ t: 'leaveRoom' });
  room = null;
  leaveToMenu(false);
}

function leaveToMenu(closeConn: boolean): void {
  stopOnline();
  stopPractice();
  platform.gameplay(false);
  platform.showInvite(null);
  closeOverlay('overlay-continue');
  practiceOpts = null;
  closeOverlay('overlay-pause');
  closeOverlay('overlay-conn');
  if (closeConn) {
    room = null;
    if (conn.state !== 'idle') conn.close(true);
  }
  setUrl('/');
  showScreen('menu');
}

for (const b of document.querySelectorAll<HTMLElement>('[data-nav]')) {
  b.addEventListener('click', () => {
    pendingAction = null;
    showScreen(b.dataset.nav as ScreenName);
  });
}

// ---------------------------------------------------------------- menu actions

$('btn-play').addEventListener('click', () => {
  phoneMatchGesture();
  currentName();
  ensureConnected(() => conn.send({ t: 'quickMatch' }));
});
$('btn-create').addEventListener('click', () => {
  currentName();
  showScreen('create');
});
$('btn-create-go').addEventListener('click', () => {
  const difficulty = ($('create-difficulty') as HTMLSelectElement).value as Difficulty;
  const mission = ($('create-mission') as HTMLSelectElement).value;
  if (!DIFFICULTIES.includes(difficulty) || !isMissionId(mission)) return;
  ensureConnected(() => conn.send({ t: 'createRoom', settings: { difficulty, mission } }));
});
$('btn-join').addEventListener('click', () => {
  $('join-error').hidden = true;
  showScreen('join');
});
function submitJoin(): void {
  const code = ($('join-code') as HTMLInputElement).value.trim().toUpperCase();
  const err = $('join-error');
  if (!ROOM_CODE_REGEX.test(code)) {
    err.textContent = 'Squad codes are 6 characters (letters A–Z except I, L, O, and digits 2–9).';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  phoneMatchGesture();
  currentName('join-name');
  ensureConnected(() => conn.send({ t: 'joinRoom', code }));
}
$('btn-join-go').addEventListener('click', submitJoin);
$('join-code').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') submitJoin();
});

$('btn-howto').addEventListener('click', () => openOverlay('modal-howto'));
$('btn-settings').addEventListener('click', () => openOverlay('modal-settings'));
// The same help and settings from the pause menu, so phone players never have to leave a mission to find them.
$('btn-pause-howto').addEventListener('click', () => openOverlay('modal-howto'));
$('btn-pause-settings').addEventListener('click', () => openOverlay('modal-settings'));
$('link-privacy').addEventListener('click', (e) => {
  e.preventDefault();
  openOverlay('modal-privacy');
});
for (const b of document.querySelectorAll<HTMLElement>('[data-close]')) {
  b.addEventListener('click', () => closeOverlay(b.closest<HTMLElement>('.overlay')?.id ?? ''));
}

$('btn-conn-retry').addEventListener('click', () => conn.retryNow());
$('btn-conn-menu').addEventListener('click', () => leaveToMenu(true));
$('btn-error-retry').addEventListener('click', () => {
  closeOverlay('overlay-error');
  conn.retryNow();
});
$('btn-error-menu').addEventListener('click', () => {
  closeOverlay('overlay-error');
  leaveToMenu(true);
});

// ---------------------------------------------------------------- lobby

function renderLobby(): void {
  if (!room || !me) return;
  const r = room;
  const myId = me.id;
  const host = r.hostId === myId;
  $('lobby-code').textContent = r.code;
  const link = squadLink(r.code);
  platform.showInvite(r.code);
  ($('btn-whatsapp') as HTMLAnchorElement).href =
    `https://wa.me/?text=${encodeURIComponent(`Join my STRIKE SQUAD mission! We need you 💪 Squad ${r.code}: ${link}`)}`;
  $('squad-count').textContent = `${r.players.length}/${r.maxPlayers}`;
  const rows = r.players.map((p) => {
    const icon = el('canvas', { attrs: { 'aria-hidden': 'true', width: '28', height: '28' } });
    Renderer.drawIcon(icon, p.hero);
    const tags: HTMLElement[] = [];
    if (p.id === r.hostId) tags.push(el('span', { class: 'badge host', text: 'host' }));
    if (!p.connected) tags.push(el('span', { class: 'badge', text: 'reconnecting…' }));
    return el(
      'li',
      { class: p.id === myId ? 'me' : '' },
      icon,
      el(
        'span',
        { class: 'pname' },
        el('b', { text: p.name + (p.id === myId ? ' (you)' : '') }),
        el('small', { text: heroOf(p.hero).name, attrs: { style: `color:${heroOf(p.hero).color}` } }),
      ),
      el('span', { class: 'tags' }, ...tags),
    );
  });
  for (let i = r.players.length; i < Math.min(r.maxPlayers, r.players.length + 2); i++)
    rows.push(el('li', { class: 'empty', text: 'Free seat — send the link' }));
  $('squad-list').replaceChildren(...rows);
  const diff = $('lobby-difficulty') as HTMLSelectElement;
  diff.value = r.settings.difficulty;
  diff.disabled = !host;
  const mission = $('lobby-mission') as HTMLSelectElement;
  mission.value = r.settings.mission;
  mission.disabled = !host;
  renderBriefing(r.settings.mission);
  const start = $('btn-start') as HTMLButtonElement;
  start.hidden = !host;
  start.disabled = !host;
  const n = r.players.length;
  $('lobby-hint').textContent = !host
    ? 'Waiting for the host to start the mission…'
    : n === 1
      ? 'Send the link to friends — or start now; they can still join mid-mission.'
      : `${n} soldiers ready. Friends can still join after you start.`;
  $('btn-share').hidden = typeof navigator.share !== 'function';
  renderHeroGrid(r.players.find((p) => p.id === myId)?.hero ?? settings.value.hero);
}

$('lobby-mission').addEventListener('change', (e) => {
  const mission = (e.target as HTMLSelectElement).value;
  if (isMissionId(mission)) conn.send({ t: 'setSettings', settings: { mission } });
});
$('lobby-difficulty').addEventListener('change', (e) => {
  const difficulty = (e.target as HTMLSelectElement).value as Difficulty;
  if (DIFFICULTIES.includes(difficulty)) conn.send({ t: 'setSettings', settings: { difficulty } });
});
$('btn-start').addEventListener('click', () => {
  phoneMatchGesture();
  conn.send({ t: 'startMatch' });
});
$('btn-leave-room').addEventListener('click', leaveRoom);

async function copyInvite(noteId: string): Promise<void> {
  const code = room?.code;
  if (!code) return;
  const link = squadLink(code);
  try {
    await navigator.clipboard.writeText(link);
    $(noteId).textContent = 'Invite link copied. Paste it in any chat.';
  } catch {
    $(noteId).textContent = `Copy this link: ${link}`;
  }
}
$('btn-copy-link').addEventListener('click', () => void copyInvite('lobby-note'));
$('btn-share').addEventListener('click', async () => {
  if (!room) return;
  try {
    await navigator.share({
      title: 'STRIKE SQUAD',
      text: `Join my STRIKE SQUAD mission! Squad ${room.code}`,
      url: squadLink(room.code),
    });
  } catch {
    /* user cancelled the share sheet */
  }
});

// ---------------------------------------------------------------- missions

/** Fill every mission menu from the campaign list: number, name, place, toughness, and a tick once completed. */
function fillMissionSelects(): void {
  for (const sel of document.querySelectorAll<HTMLSelectElement>('select.mission-select')) {
    const keep = sel.value;
    const campaign = el(
      'optgroup',
      { attrs: { label: 'Campaign' } },
      ...MISSIONS.map((m) => {
        const done = progress.get(m.id);
        const stars = '★'.repeat(m.stars) + '☆'.repeat(Math.max(0, 5 - m.stars));
        return el('option', {
          text: `${m.num} · ${m.name} — ${m.place} ${stars}${m.advanced ? ' · ADVANCED' : ''}${done ? ' ✓' : ''}`,
          attrs: { value: m.id },
        });
      }),
    );
    const saga = el(
      'optgroup',
      { attrs: { label: 'Astra Saga' } },
      ...SAGA.map((m) =>
        el('option', {
          text: `Astra ${m.num} · ${m.name} — ${m.astraName}${progress.get(m.id) ? ' ✓' : ''}`,
          attrs: { value: m.id },
        }),
      ),
    );
    sel.replaceChildren(campaign, saga);
    sel.value = isMissionId(keep) ? keep : 'mission-1';
  }
}
fillMissionSelects();

/** Lobby briefing for the chosen mission (the last two tips are the same for every mission). */
function renderBriefing(id: MissionId): void {
  const m = missionInfo(id);
  $('h-mission').textContent = `${isSagaId(id) ? 'Astra' : 'Mission'} ${m.num} · ${m.name}`;
  const list = document.querySelector('.briefing');
  if (!list) return;
  for (const li of list.querySelectorAll('li.brief-line')) li.remove();
  list.prepend(...m.brief.map((b) => el('li', { class: 'brief-line', text: b })));
}

// ---------------------------------------------------------------- astra saga

function sagaOptions(id: SagaId): SoloOptions {
  const difficulty = ($('saga-diff') as HTMLSelectElement).value as Difficulty;
  const buddies = Number(($('saga-buddies') as HTMLSelectElement).value);
  return {
    name: currentName(),
    mission: id,
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'normal',
    buddies: [0, 1, 3].includes(buddies) ? buddies : 1,
    hero: settings.value.hero,
  };
}

/** Start a saga stage (solo, offline-capable). */
async function playSaga(id: SagaId): Promise<void> {
  if (!progress.unlocked(id)) return;
  phoneMatchGesture();
  const opts = sagaOptions(id);
  await breakAd();
  startPractice(opts);
}

/** The menu's big button: straight into the next stage, one click. */
function renderSagaNext(): void {
  const next = SAGA.find((x) => x.id === progress.nextSagaStage());
  if (next) $('saga-next').textContent = `Stage ${next.num} · ${next.name} · ${next.astraName}`;
}

function showSaga(): void {
  renderSaga();
  showScreen('saga');
}

function renderSaga(): void {
  $('saga-stars').textContent =
    `★ ${progress.sagaStars()} / ${SAGA.length * 3} · 🗝 ${progress.secretsFound()} / ${SAGA.length}`;
  $('saga-shards').textContent = `✦ ${progress.shards} shard${progress.shards === 1 ? '' : 's'}`;
  const next = progress.nextSagaStage();
  $('saga-grid').replaceChildren(
    ...SAGA.map((st) => {
      const open = progress.unlocked(st.id);
      const rec = progress.get(st.id);
      const icon =
        st.astra in POWER_INFO
          ? POWER_INFO[st.astra as keyof typeof POWER_INFO].icon
          : st.astra === 'brahma'
            ? '☀'
            : st.astra === 'narayana'
              ? '🏹'
              : '✴';
      const b = el(
        'button',
        {
          class: `saga-card${open ? '' : ' locked'}${st.id === next ? ' next' : ''}${rec ? ' done' : ''}`,
          attrs: {
            type: 'button',
            'data-testid': `saga-${st.num}`,
            'aria-label': open
              ? `Stage ${st.num}, ${st.name}: ${st.astraName}${rec ? `, ${rec.stars} stars` : ''}`
              : `Stage ${st.num}, ${st.name}: locked`,
          },
        },
        el('span', { class: 'saga-num', text: String(st.num) }),
        el('span', { class: 'saga-icon', text: open ? icon : '🔒', attrs: { 'aria-hidden': 'true' } }),
        el('b', { text: st.name }),
        el('small', { text: open ? st.astraName : `Clear stage ${st.num - 1}` }),
        el('span', {
          class: 'saga-stars',
          text: [0, 1, 2].map((i) => (i < (rec?.stars ?? 0) ? '★' : '☆')).join(''),
          attrs: { 'aria-hidden': 'true' },
        }),
        open
          ? el('span', {
              class: `saga-secret${progress.hasSecret(st.id) ? ' found' : ''}`,
              text: progress.hasSecret(st.id) ? '🗝 Secret found' : '🗝 Secret: ?',
              attrs: { 'data-testid': `saga-secret-${st.num}` },
            })
          : el('span', { class: 'saga-secret', text: '' }),
      );
      if (open) b.addEventListener('click', () => void playSaga(st.id));
      else b.disabled = true;
      return el('li', {}, b);
    }),
  );
}

function renderCodex(): void {
  $('codex-list').replaceChildren(
    ...SAGA.map((st) => {
      const icon =
        st.astra in POWER_INFO
          ? POWER_INFO[st.astra as keyof typeof POWER_INFO].icon
          : st.astra === 'brahma'
            ? '☀'
            : st.astra === 'narayana'
              ? '🏹'
              : '✴';
      const known = progress.unlocked(st.id);
      return el(
        'li',
        { class: known ? '' : 'locked' },
        el('span', { class: 'codex-icon', text: known ? icon : '?', attrs: { 'aria-hidden': 'true' } }),
        el(
          'div',
          {},
          el('b', { text: known ? st.astraName : `Stage ${st.num}` }),
          el('p', { text: known ? st.lore : 'Reach this stage to learn this astra.' }),
          ...(known ? [el('p', { class: 'how', text: st.how })] : []),
        ),
      );
    }),
  );
}

$('btn-saga').addEventListener('click', () => void playSaga(progress.nextSagaStage()));
$('btn-stages').addEventListener('click', () => showSaga());
$('btn-codex').addEventListener('click', () => {
  renderCodex();
  openOverlay('modal-codex');
});
document.addEventListener('screenchange', (e) => {
  if ((e as CustomEvent<string>).detail === 'menu') {
    renderSagaNext();
    renderPlayerCard();
  }
});
renderSagaNext();

// ---------------------------------------------------------------- solo setup

$('btn-practice').addEventListener('click', () => showScreen('practice'));
$('btn-practice-go').addEventListener('click', () => {
  phoneMatchGesture();
  const difficulty = ($('practice-diff') as HTMLSelectElement).value as Difficulty;
  if (!DIFFICULTIES.includes(difficulty)) return;
  const buddies = Number(($('practice-buddies') as HTMLSelectElement).value);
  const mission = ($('practice-mission') as HTMLSelectElement).value;
  startPractice({
    name: currentName(),
    mission: isMissionId(mission) ? mission : 'mission-1',
    difficulty,
    buddies: [0, 1, 3].includes(buddies) ? buddies : 1,
    hero: settings.value.hero,
  });
});

// ---------------------------------------------------------------- settings

function syncSettingsUi(): void {
  const s = settings.value;
  ($('set-volume') as HTMLInputElement).value = String(s.volume);
  ($('set-mute') as HTMLInputElement).checked = s.muted;
  ($('set-autofire') as HTMLInputElement).checked = s.autoFire;
  ($('set-reduce') as HTMLInputElement).checked = s.reduceMotion;
  ($('set-fps') as HTMLInputElement).checked = s.showStats;
  ($('set-sens') as HTMLInputElement).value = String(s.touchSensitivity);
  $('rebind-fire').textContent = `Fire: ${keyLabel(s.keyFire)}`;
  $('rebind-jump').textContent = `Jump: ${keyLabel(s.keyJump)}`;
  $('key-fire-label').textContent = keyLabel(s.keyFire);
  $('key-jump-label').textContent = keyLabel(s.keyJump);
  $('btn-pause-sound').textContent = `Sound: ${s.muted ? 'off' : 'on'}`;
  $('btn-pause-sound').setAttribute('aria-pressed', String(s.muted));
  if (input.autoFireOverride === null) showAutoFire(s.autoFire);
  ($('set-hand') as HTMLSelectElement).value = s.hand;
  $('touch').classList.toggle('lefty', s.hand === 'left');
  document.body.classList.toggle('reduce-motion', s.reduceMotion);
  sfx.setVolume(s.volume, s.muted);
}
settings.onChange(syncSettingsUi);
syncSettingsUi();

const bindCheck = (id: string, key: 'muted' | 'reduceMotion' | 'showStats' | 'autoFire'): void => {
  $(id).addEventListener('change', (e) => settings.update({ [key]: (e.target as HTMLInputElement).checked }));
};
bindCheck('set-mute', 'muted');
bindCheck('set-autofire', 'autoFire');
bindCheck('set-reduce', 'reduceMotion');
bindCheck('set-fps', 'showStats');
$('set-volume').addEventListener('input', (e) =>
  settings.update({ volume: Number((e.target as HTMLInputElement).value) }),
);
$('set-hand').addEventListener('change', (e) =>
  settings.update({ hand: (e.target as HTMLSelectElement).value === 'left' ? 'left' : 'right' }),
);
$('set-sens').addEventListener('input', (e) =>
  settings.update({ touchSensitivity: Number((e.target as HTMLInputElement).value) }),
);
function rebind(which: 'keyFire' | 'keyJump', btn: HTMLElement): void {
  btn.textContent = 'Press a key…';
  $('rebind-note').textContent = 'Press the new key (Esc cancels).';
  input.captureKey((code) => {
    if (code !== 'Escape') {
      const other = which === 'keyFire' ? settings.value.keyJump : settings.value.keyFire;
      if (code === other) toast('That key is already used for the other action.', 'error');
      else settings.update({ [which]: code });
    }
    syncSettingsUi();
    $('rebind-note').textContent = 'Running and aiming always work with WASD and the arrow keys.';
  });
}
$('rebind-fire').addEventListener('click', () => rebind('keyFire', $('rebind-fire')));
$('rebind-jump').addEventListener('click', () => rebind('keyJump', $('rebind-jump')));

// Browsers only start audio after a gesture.
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
window.addEventListener('keydown', () => sfx.unlock(), { once: true });

// ---------------------------------------------------------------- boot

installModalKeys([
  'modal-howto',
  'modal-settings',
  'modal-privacy',
  'modal-confirm',
  'modal-codex',
  'modal-trophies',
  'modal-weekly',
]);

// Arrow keys and Space play the game; they must never scroll the page around it (it may sit in a portal's frame).
window.addEventListener(
  'keydown',
  (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.closest('input, select, textarea, button, a')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown'].includes(e.code))
      e.preventDefault();
  },
  { passive: false },
);

($('name-input') as HTMLInputElement).value = settings.value.name;
($('join-name') as HTMLInputElement).value = settings.value.name;
$('name-input').addEventListener('change', () => currentName());
$('join-name').addEventListener('change', () => currentName('join-name'));

// The mission scrolls slowly behind the main menu (only while the menu is visible and the tab is shown).
const scenery = new Renderer($('attract') as HTMLCanvasElement, { maxDpr: 1.5 });
let sceneryRaf = 0;
const sceneryFrame = (t: number): void => {
  scenery.drawScenery(settings.value.reduceMotion ? 0 : t);
  if (!settings.value.reduceMotion) sceneryRaf = requestAnimationFrame(sceneryFrame);
};
const syncScenery = (): void => {
  cancelAnimationFrame(sceneryRaf);
  cancelAnimationFrame(heroRaf);
  if (currentScreen() === 'menu' && !document.hidden) {
    scenery.resize();
    sceneryRaf = requestAnimationFrame(sceneryFrame);
    heroRaf = requestAnimationFrame(heroFrame);
  }
};
document.addEventListener('screenchange', syncScenery);
document.addEventListener('visibilitychange', syncScenery);
window.addEventListener('resize', syncScenery);
settings.onChange(syncScenery);

if (platform.ownsUrl) registerPwa($('btn-install'));

// ---------------------------------------------------------------- heroes (menu showcase + lobby picker)

/** The hero on the menu stage: runs, stops, fires a burst - a living character select. */
let heroRaf = 0;
const heroCanvas = $('hero-canvas') as HTMLCanvasElement;
function heroFrame(t: number): void {
  const g = heroCanvas.getContext('2d');
  if (!g) return;
  const id = settings.value.hero;
  const look = heroLook(id);
  const cycle = settings.value.reduceMotion ? 0 : t % 4000;
  const running = cycle < 1800;
  const firing = cycle > 2300 && cycle < 3400;
  const f = charFrame(
    `h${id}`,
    look,
    running ? 'run' : 'idle',
    running ? Math.floor(t / 75) % RUN_FRAMES : Math.floor(t / 450) % 2,
    cycle > 3000 && cycle < 3400 ? 'uf' : 'f',
  );
  const S = 3;
  g.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
  g.imageSmoothingEnabled = false;
  const ox = heroCanvas.width / 2 - 6;
  const oy = heroCanvas.height - 10;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(ox, oy - 2, 34, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.drawImage(f.img, ox - CENTER_X * S, oy - FEET_Y * S, f.img.width * S, f.img.height * S);
  if (firing && Math.floor(t / 60) % 2 === 0) {
    const mx = ox + f.muzzleX * S;
    const my = oy + f.muzzleY * S;
    const glow = g.createRadialGradient(mx, my, 0, mx, my, 16);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.35, '#ffd166');
    glow.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = glow;
    g.fillRect(mx - 16, my - 16, 32, 32);
  }
  if (!settings.value.reduceMotion) heroRaf = requestAnimationFrame(heroFrame);
}

function showHeroMeta(): void {
  const h = heroOf(settings.value.hero);
  $('hero-name').textContent = h.name;
  $('hero-tag').textContent = h.tagline;
  $('hero-perk').textContent = `${h.perk.name}: ${h.perk.text}`;
  document.documentElement.style.setProperty('--hero', h.color);
}

function pickHero(id: number): void {
  const hero = ((id % HEROES.length) + HEROES.length) % HEROES.length;
  if (!profile.heroOpen(hero)) {
    // A locked hero is a goal, not a dead end: say exactly what opens it.
    toast(`${heroOf(hero).name} unlocks at level ${HERO_UNLOCK_LEVEL[hero]}. Clear stages to earn XP!`);
    sfx.play('beep');
    return;
  }
  settings.update({ hero });
  showHeroMeta();
  if (room && room.phase !== 'match') conn.send({ t: 'setHero', hero });
  sfx.play('beep');
}
/** The menu's arrows walk through the heroes you can play (locked ones are shown in the squad picker). */
function stepHero(dir: 1 | -1): void {
  for (let i = 1; i <= HEROES.length; i++) {
    const h = (((settings.value.hero + dir * i) % HEROES.length) + HEROES.length) % HEROES.length;
    if (profile.heroOpen(h)) return pickHero(h);
  }
}
$('btn-hero-prev').addEventListener('click', () => stepHero(-1));
$('btn-hero-next').addEventListener('click', () => stepHero(1));
showHeroMeta();

function renderHeroGrid(selected: number): void {
  const grid = $('hero-grid');
  if (grid.childElementCount !== HEROES.length) {
    grid.replaceChildren(
      ...HEROES.map((h) => {
        const b = el('button', {
          class: 'hero-card',
          attrs: { type: 'button', role: 'radio', 'data-hero': String(h.id), 'data-testid': `hero-${h.id}` },
        });
        b.style.setProperty('--c', h.color);
        const icon = el('canvas', { attrs: { width: '44', height: '44', 'aria-hidden': 'true' } });
        Renderer.drawIcon(icon, h.id);
        b.append(icon, el('b', { text: h.name }), el('small', { text: h.tagline }));
        b.addEventListener('click', () => pickHero(h.id));
        return b;
      }),
    );
  }
  for (const b of grid.querySelectorAll<HTMLElement>('.hero-card')) {
    const id = Number(b.dataset.hero);
    const open = profile.heroOpen(id);
    b.setAttribute('aria-checked', String(id === selected));
    b.classList.toggle('locked', !open);
    const small = b.querySelector('small');
    const perk = heroOf(id).perk;
    if (small)
      small.textContent = open
        ? `${perk.name}: ${perk.text}`
        : `🔒 Unlocks at LV ${HERO_UNLOCK_LEVEL[id]} · ${perk.name}`;
  }
}

/**
 * Wake a sleeping free-tier backend while the player is still reading the menu, and tell them honestly
 * what state it is in (instead of a bare "Offline"). Solo training never needs the server.
 */
function warmUpBackend(): void {
  setServerStatus('checking');
  const slow = window.setTimeout(() => {
    if (serverStatus === 'checking') setServerStatus('waking');
  }, 2500);
  const ctrl = new AbortController();
  const giveUp = window.setTimeout(() => ctrl.abort(), 90_000);
  fetch(`${httpBase()}/health`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
    .then(() => setServerStatus('ready'))
    .catch(() => setServerStatus('down'))
    .finally(() => {
      window.clearTimeout(slow);
      window.clearTimeout(giveUp);
    });
}

function setServerStatus(s: ServerStatus): void {
  serverStatus = s;
  if (conn.state === 'idle') renderConnState('idle', 0);
}

function boot(): void {
  warmUpBackend();
  // Signed in on the portal: use that name until the player picks their own callsign.
  void platform.username().then((u) => {
    const name = u?.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, GAME_CONFIG.limits.maxNameLength);
    if (name && !settings.value.name && NAME_REGEX.test(name)) {
      settings.update({ name });
      ($('name-input') as HTMLInputElement).value = name;
      ($('join-name') as HTMLInputElement).value = name;
    }
  });
  const invited = platform.invitedSquad()?.toUpperCase() ?? null;
  const code = invited && ROOM_CODE_REGEX.test(invited) ? invited : parseJoinPath(location.pathname);
  if (code) {
    ($('join-code') as HTMLInputElement).value = code;
    showScreen('join');
    $('h-join').textContent = 'Your friends need you!';
    $(settings.value.name ? 'btn-join-go' : 'join-name').focus();
  } else {
    showScreen('menu');
  }
  renderConnState('idle', 0);
  syncScenery();
  claimDaily();
  renderPlayerCard();
  platform.loadingStop();
}

boot();

// Exposed for end-to-end tests and debugging only; carries no authority (the server is the authority).
(window as unknown as { __strikesquad?: unknown }).__strikesquad = {
  get screen() {
    return currentScreen();
  },
  get roomCode() {
    return room?.code ?? lastRoomCode;
  },
  get inMatch() {
    return online !== null || practice !== null;
  },
  get lastEnd() {
    return lastEnd;
  },
  get self() {
    return online?.self() ?? practice?.self() ?? null;
  },
  get phase() {
    return online?.phase() ?? practice?.phase() ?? null;
  },
  get snap() {
    return online?.latest() ?? practice?.latest() ?? null;
  },
  get stats() {
    return view.stats;
  },
  get cameraX() {
    return view.renderer.cameraX;
  },
  /** Offline solo mission only (it runs in this browser anyway): lets tests and screenshots set up scenes. */
  get soloSim() {
    return practice?.sim ?? null;
  },
  get platform() {
    return platform.id;
  },
  /** Recording trailers: let a computer player drive your own soldier in a solo run. */
  autoplay(on: boolean) {
    if (practice) practice.autoplayMe = on;
  },
  get progress() {
    return { shards: progress.shards, next: progress.nextSagaStage(), stars: progress.sagaStars() };
  },
  get weekly() {
    return { goals: weekly.goals(), chest: weekly.chestOpened };
  },
  get profile() {
    return {
      level: profile.level,
      xp: profile.totalXp,
      streak: profile.streak,
      trophies: profile.trophyCount,
    };
  },
};
