import {
  BOSS_RULES,
  BULLET_KINDS,
  GAME_CONFIG,
  WEAPON_KINDS,
  isSagaId,
  heroOf,
  rankName,
  type BossKind,
  type BossRule,
  type Faction,
  type LevelDef,
  POWER_KINDS,
  isPower,
  type PowerKind,
  type PlayerSnapshot,
  type SimEvent,
  type Snapshot,
  type StyleTag,
  styleOf,
} from '@strikesquad/shared';
import { ASURA_LOOKS, BOSS_TITLES, sagaMoveTips, type AsuraLook } from './asura-art';
import type { Sfx } from '../audio/sfx';
import type { Settings } from '../settings';
import { $, el } from '../ui/dom';
import { Renderer, type DrawOptions } from './renderer';

/** Names and one-line tips for the boss intro card. */
export const BOSS_INFO: Record<BossKind, { name: string; sub: string; tip: string }> = {
  walker: {
    name: 'WARHOUND',
    sub: 'Assault walker',
    tip: 'Red glow = charge! Double jump over it or dash through. Jump the shockwaves.',
  },
  gunship: {
    name: 'VULTURE',
    sub: 'Attack gunship',
    tip: 'Keep moving under the bombs. Shoot or knife the missiles out of the air.',
  },
  boss: {
    name: 'IRON FORTRESS',
    sub: 'Final stronghold · 3 phases',
    tip: 'Low laser: JUMP. High laser: DUCK or slide. Everyone, unleash your supers!',
  },
};

/** Boss names per themed faction (the army keeps WARHOUND, VULTURE and the IRON FORTRESS). */
const FACTION_NAME: Record<Exclude<Faction, 'army'>, Record<BossKind, string>> = {
  pharaoh: { walker: 'GIANT SCORPION', gunship: 'SUN FALCON', boss: 'ANUBIS COLOSSUS' },
  norse: { walker: 'FENRIR', gunship: 'THOR', boss: 'FROST GIANT' },
  olympus: { walker: 'MINOTAUR', gunship: 'STORM HARPY', boss: 'ZEUS' },
  demon: { walker: 'INFERNO BEAST', gunship: 'FIRE DRAGON', boss: 'DEMON KING' },
  void: { walker: 'XENO CRAWLER', gunship: 'UFO MOTHERSHIP', boss: 'HIVE QUEEN' },
};

/** Boss subtitles per themed faction (same attacks as the army machines, different creatures). */
const FACTION_SUB: Record<Exclude<Faction, 'army'>, Record<BossKind, string>> = {
  pharaoh: { walker: 'Giant scorpion', gunship: 'Sun falcon', boss: 'Living statue · 3 phases' },
  norse: { walker: 'Giant wolf', gunship: 'Thunder god', boss: 'Frost giant · 3 phases' },
  olympus: { walker: 'Bull-headed brute', gunship: 'Storm harpy', boss: 'King of the gods · 3 phases' },
  demon: { walker: 'Demon beast', gunship: 'Fire dragon', boss: 'Demon throne · 3 phases' },
  void: { walker: 'Xeno crawler', gunship: 'Alien saucer', boss: 'Hive queen · 3 phases' },
};

/** Saga boss subtitles: the asura host's champions. */
const SAGA_SUB: Record<BossKind, string> = {
  walker: 'Asura champion',
  gunship: 'Sky rakshasa',
  boss: 'Asura lord · 3 phases',
};

/** Power names, icons and what they do (HUD and pickup banners). */
export const POWER_INFO: Record<PowerKind, { name: string; icon: string; tip: string }> = {
  agni: { name: 'AGNI ASTRA', icon: '🔥', tip: 'Fire wave + burning ground' },
  varuna: { name: 'VARUNA ASTRA', icon: '🌧', tip: 'Rain: puts out walls of fire' },
  vayu: { name: 'VAYU ASTRA', icon: '🌪', tip: 'Gust: blows enemies and shots away' },
  singularity: { name: 'BLACK HOLE', icon: '🕳', tip: 'Swallows enemies and their shots' },
  naga: { name: 'NAGASTRA', icon: '🐍', tip: 'Three serpents that hunt the nearest foes' },
  garuda: {
    name: 'GARUDASTRA',
    icon: '🦅',
    tip: 'Wipes enemy serpents and shots from the sky, crushes flyers',
  },
  sudarshana: {
    name: 'SUDARSHANA CHAKRA',
    icon: '☸',
    tip: 'The discus: hits six foes in turn, then comes back',
  },
  pashupata: {
    name: 'PASHUPATASTRA',
    icon: '🔱',
    tip: 'A new form every call: trident, spirit or fire rain',
  },
  vaishnava: { name: 'VAISHNAVASTRA', icon: '☀', tip: 'Turns a boss’s golden orb back on the boss' },
};

/** Each astra's cut-in: its colour and its name in Devanagari. */
const ASTRA_CUT: Record<PowerKind | 'brahma' | BossRule, { color: string; deva: string }> = {
  agni: { color: '#ea580c', deva: 'आग्नेयास्त्र' },
  varuna: { color: '#0284c7', deva: 'वरुणास्त्र' },
  vayu: { color: '#64748b', deva: 'वायव्यास्त्र' },
  singularity: { color: '#6d28d9', deva: 'कृष्ण विवर' },
  naga: { color: '#15803d', deva: 'नागास्त्र' },
  garuda: { color: '#b45309', deva: 'गरुडास्त्र' },
  sudarshana: { color: '#ca8a04', deva: 'सुदर्शन चक्र' },
  pashupata: { color: '#0f766e', deva: 'पाशुपतास्त्र' },
  vaishnava: { color: '#d97706', deva: 'वैष्णवास्त्र' },
  brahma: { color: '#f59e0b', deva: 'ब्रह्मास्त्र' },
  narayana: { color: '#b91c1c', deva: 'नारायणास्त्र' },
  brahmashirsha: { color: '#991b1b', deva: 'ब्रह्मशिरास्त्र' },
};

/** Wire index of a vaishnava orb. */
const ORB = BULLET_KINDS.indexOf('orb');

/** What each pashupata form is called on screen. */
const PASHUPATA_FORM = ['TRIDENT STRIKE', 'SPIRIT ALLY', 'RAIN OF FIRE'];

/** Boss astra banners: the call, and what to do about it. */
const BOSS_ASTRA_TEXT: Record<BossRule, { call: string; tip: string }> = {
  naga: { call: '🐍 NAGASTRA!', tip: 'Serpents incoming: shoot them, dash, or call GARUDA' },
  narayana: { call: '🏹 NARAYANASTRA!', tip: 'STOP FIRING: lay down your weapons and it spares you' },
  vaishnava: { call: '☀ VAISHNAVASTRA!', tip: 'Grab the VAISHNAVA altar and turn the orb back' },
  brahmashirsha: {
    call: '✴ BRAHMASHIRSHA!',
    tip: 'Answer it with the BRAHMASTRA, or dash at the last moment',
  },
};

const STYLE_TEXT: Record<StyleTag, string> = {
  parry: 'PARRY!',
  melee: 'KNIFE KILL',
  slide: 'SLIDE KILL',
  air: 'AIR KILL',
  multi: 'MULTI KILL!',
  shield: 'SHIELD BROKEN',
};

const RANK_COLORS = ['#a3e635', '#38bdf8', '#facc15', '#fb923c', '#f43f5e', '#e879f9'];

/**
 * Everything the player sees during a mission, shared by online and solo modes: canvas drawing, HUD (health,
 * super meter, combo and style rank, boss bar, arena status), boss intro cards, notices, countdown, KO panel, and
 * sound/particle reactions to sim events.
 */
export class MatchView {
  readonly renderer: Renderer;
  private names = new Map<string, string>();
  private meId = '';
  private lastCountdown = -1;
  private fps = 0;
  private frames = 0;
  private fpsSince = 0;
  private bannerTimer = 0;
  private introTimer = 0;
  private coachUntil = 0;
  private nextFireSound = 0;
  private lastHitSound = 0;
  private lastZone = '';
  private hpLag = 100;
  private bossLag = 1;
  private lastCombo = 0;
  private comboAt = 0;
  private lastRank = -1;
  private ultReady = false;
  /** Snapshot-confirmed counters for tests / the debug hook. */
  stats = { kills: 0, ults: 0, bestCombo: 0, bossesDown: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sfx: Sfx,
    private readonly settings: () => Settings,
  ) {
    this.renderer = new Renderer(canvas);
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.renderer.resize(), 150));
  }

  begin(meId: string, first: Snapshot, level: LevelDef): void {
    this.renderer.setLevel(level);
    this.meId = meId;
    this.stats = { kills: 0, ults: 0, bestCombo: 0, bossesDown: 0 };
    this.lastCountdown = -1;
    this.lastZone = '';
    this.hpLag = 100;
    this.bossLag = 1;
    this.lastCombo = 0;
    this.lastRank = -1;
    this.ultReady = false;
    this.rememberNames(first);
    const me = first.players.find((p) => p.id === meId);
    if (me) {
      const hero = heroOf(me.hr);
      Renderer.drawIcon($('hud-portrait') as HTMLCanvasElement, hero.id);
      $('hud-name').textContent = me.n;
      $('hud').style.setProperty('--me', hero.color);
      $('hud-ult-label').textContent = hero.ultName;
      $('btn-touch-ult').textContent = hero.ultName.split(' ')[0] ?? 'SUPER';
    }
    $('killfeed').replaceChildren();
    $('banner').classList.remove('show');
    $('boss-bar').hidden = true;
    $('boss-intro').hidden = true;
    $('combo').hidden = true;
    $('hud-arena').hidden = true;
    this.renderer.reset();
    this.renderer.resize();
  }

  resize(): void {
    this.renderer.resize();
  }

  private rememberNames(s: Snapshot): void {
    for (const p of s.players) this.names.set(p.id, p.n);
  }

  private nameOf(id: string): string {
    return id === this.meId ? 'You' : (this.names.get(id) ?? 'A friend');
  }

  // ------------------------------------------------------------ events

  onEvents(events: readonly SimEvent[]): void {
    const reduce = this.settings().reduceMotion;
    const r = this.renderer;
    for (const ev of events) {
      switch (ev.e) {
        case 'ehit':
          r.spark(ev.x, ev.y, '#fde68a', 4, reduce, 120);
          if (performance.now() - this.lastHitSound > 70) {
            this.lastHitSound = performance.now();
            this.sfx.play('hit');
          }
          break;
        case 'ekill': {
          const boss = ev.kind === 'walker' || ev.kind === 'gunship' || ev.kind === 'boss';
          r.explosion(ev.x, ev.y, boss, reduce);
          this.sfx.play('explode');
          if (ev.by === this.meId) {
            this.stats.kills++;
            r.floatText(ev.x, ev.y - 20, `+${ev.pts}`, '#fde047');
          }
          break;
        }
        case 'boom':
          r.explosion(ev.x, ev.y, ev.r >= 60, reduce, ev.r);
          if (ev.r >= 40) this.sfx.play('explode');
          break;
        case 'hurt':
          if (ev.id === this.meId) {
            r.flash('#ef4444', Math.min(0.4, 0.12 + ev.dmg / 60));
            if (!reduce) r.shake(3 + ev.dmg / 4);
            this.sfx.play('hit');
          }
          break;
        case 'ko':
          if (ev.id === this.meId) {
            r.flash('#7f1d1d', 0.5);
            this.sfx.play('defeat');
          } else {
            this.notice(`💥 ${this.nameOf(ev.id)} got knocked out`, 'bad');
            this.sfx.play('beep');
          }
          break;
        case 'respawn':
          if (ev.id === this.meId) this.showBanner('Back in the fight!');
          else this.notice(`${this.nameOf(ev.id)} is back`);
          break;
        case 'life':
          this.notice(`♥ +1 squad life (${ev.lives})`);
          break;
        case 'pickup':
          if (ev.kind === 'medkit') {
            this.sfx.play('powerup');
            const n = ev.healed.length;
            if (ev.healed.includes(this.meId) || ev.by === this.meId)
              this.showBanner(n > 1 ? `Med-kit healed ${n} soldiers!` : 'Healed!');
          } else {
            const label = isPower(ev.kind)
              ? `${POWER_INFO[ev.kind].icon} ${POWER_INFO[ev.kind].name} · ${POWER_INFO[ev.kind].tip}`
              : GAME_CONFIG.weapons[ev.kind].label;
            if (ev.by === this.meId) {
              this.sfx.play('powerup');
              this.showBanner(`${label}${isPower(ev.kind) ? ' — press ASTRA' : '!'}`);
            } else this.notice(`${this.nameOf(ev.by)} got the ${label}`);
          }
          break;
        case 'arena': {
          const a = this.renderer.level.arenas[ev.id];
          if (!a || a.boss) break;
          this.sfx.play('beep');
          this.showBanner(ev.wave === 1 ? `⚠ ${a.name}! Area locked` : `Wave ${ev.wave} of ${ev.of}`, true);
          if (!reduce) r.shake(4);
          break;
        }
        case 'clear': {
          const a = this.renderer.level.arenas[ev.id];
          this.sfx.play('victory');
          if (a && !a.boss) this.showBanner('AREA CLEAR — move up!');
          break;
        }
        case 'gate':
          r.gateOpened(ev.id, reduce);
          break;
        case 'checkpoint':
          this.sfx.play('go');
          this.notice('🚩 Checkpoint reached');
          break;
        case 'bossWake':
          this.bossArena = this.renderer.level.arenas[ev.arena]?.name ?? null;
          this.bossIntro(ev.kind, this.renderer.level.arenas[ev.arena]?.name);
          break;
        case 'bossPhase':
          r.flash('#ffffff', 0.35);
          if (!reduce) r.shake(10);
          this.sfx.play('explode');
          this.showBanner(
            isSagaId(this.renderer.level.id)
              ? ev.phase >= 3
                ? `FINAL PHASE — ${this.bossName(ev.kind)} unleashes everything!`
                : `${this.bossName(ev.kind)} grows stronger: new moves!`
              : ev.kind === 'boss'
                ? ev.phase === 2
                  ? 'PHASE 2 — drones and ground slams!'
                  : 'FINAL PHASE — it’s enraged!'
                : `${this.bossName(ev.kind)} is enraged!`,
            true,
          );
          break;
        case 'bossDown': {
          this.stats.bossesDown++;
          for (let i = 0; i < 5; i++)
            r.explosion(ev.x - 50 + i * 25, ev.y - 30 - ((i * 37) % 120), true, reduce);
          r.flash('#ffffff', 0.6);
          this.sfx.play('victory');
          this.showBanner(
            `${this.bossName(ev.kind)} ${this.renderer.level.faction === 'army' ? 'DESTROYED' : 'DEFEATED'}!`,
          );
          $('boss-bar').hidden = true;
          break;
        }
        case 'ult': {
          if (ev.id === this.meId) this.stats.ults++;
          const hero = heroOf(this.heroOfPlayer(ev.id));
          r.ultEffect(ev, hero.color, reduce);
          this.sfx.play('powerup');
          this.sfx.play('explode');
          const who = ev.id === this.meId ? '' : `${this.nameOf(ev.id)}: `;
          this.showBanner(`${who}${hero.ultName}!${ev.sync ? '  ⚡ SYNC ×1.5' : ''}`);
          break;
        }
        case 'astra': {
          r.astraEffect(ev, reduce);
          if (ev.id === this.meId) {
            const info = POWER_INFO[ev.kind];
            this.cutIn(ev.kind, info.icon, info.name, 'Your astra');
            r.flash(ASTRA_CUT[ev.kind].color, 0.3);
            if (!reduce) r.shake(7);
          }
          this.sfx.play(ev.kind === 'singularity' ? 'explode' : 'powerup');
          const info = POWER_INFO[ev.kind];
          const who = ev.id === this.meId ? '' : `${this.nameOf(ev.id)}: `;
          const extra =
            ev.kind === 'pashupata' && ev.v !== undefined
              ? ` ${PASHUPATA_FORM[ev.v] ?? ''}`
              : ev.kind === 'vaishnava' && ev.v === 1
                ? ' The orb turns back!'
                : '';
          this.showBanner(`${who}${info.icon} ${info.name}!${extra}`);
          break;
        }
        case 'bossAstra': {
          r.bossAstraEffect(ev, reduce);
          const text = BOSS_ASTRA_TEXT[ev.kind];
          if (ev.phase === 0 && isSagaId(this.renderer.level.id))
            this.cutIn(
              ev.kind,
              text.call.split(' ')[0] ?? '✴',
              text.call.replace(/^\S+\s/, '').replace('!', ''),
              `${this.bossArena ?? 'The boss'} calls`,
              true,
            );
          if (ev.phase === 0) {
            this.sfx.play('beep');
            this.showBanner(text.call, true);
          } else if (ev.phase === 1) this.sfx.play('explode');
          else if (ev.phase === 2) {
            this.sfx.play('victory');
            this.showBanner('BRAHMASTRA ANSWERS IT! The boss reels!');
          } else if (ev.phase === 3) {
            this.sfx.play('victory');
            this.showBanner('NARAYANASTRA REBOUNDS on its caller!');
          } else if (ev.phase === 4) this.showBanner('The storm has passed: the boss is spent. STRIKE NOW!');
          break;
        }
        case 'immune':
          if (Math.random() < 0.3) r.styleText(ev.x, ev.y, 'IMMUNE', false);
          break;
        case 'brahma':
          r.brahmaEffect(ev, reduce);
          if (ev.phase === 0) {
            this.sfx.play('beep');
            this.cutIn(
              'brahma',
              '☀',
              'BRAHMASTRA',
              ev.id === this.meId ? 'Your squad calls' : `${this.nameOf(ev.id)} calls`,
            );
            this.showBanner(`${ev.id === this.meId ? '' : `${this.nameOf(ev.id)}: `}☀ BRAHMASTRA!`, true);
          } else {
            this.sfx.play('explode');
            this.sfx.play('victory');
          }
          break;
        case 'style':
          r.styleText(ev.x, ev.y, STYLE_TEXT[ev.t], ev.id === this.meId);
          if (ev.t === 'parry') this.sfx.play('beep');
          break;
        case 'start':
          this.sfx.play('go');
          break;
        case 'portal':
          r.portal(ev.x, ev.y, ev.how, performance.now());
          break;
        case 'blink': {
          const look = this.bossLook();
          r.blink(ev.x, ev.y, look?.glow ?? '#c084fc', reduce);
          if (ev.out === 0) this.sfx.play('beep');
          break;
        }
        case 'elite':
          r.explosion(ev.x, ev.y, true, reduce);
          if (ev.by === this.meId) {
            this.sfx.play('powerup');
            this.showBanner('★ ELITE DOWN! Super charged, health back');
          } else this.notice(`★ ${this.nameOf(ev.by)} took down an elite`);
          break;
        case 'secret':
          r.flash('#fde047', 0.35);
          r.spark(ev.x, ev.y, '#fde047', reduce ? 8 : 30, reduce, 220);
          this.sfx.play('victory');
          if (ev.by === this.meId) {
            this.showBanner('🗝 SECRET FOUND! Hidden astra stash');
            this.onSecret?.();
          } else this.notice(`🗝 ${this.nameOf(ev.by)} found the hidden stash!`);
          break;
        default:
          break;
      }
    }
  }

  /** Told when this player finds a stage's hidden stash. */
  onSecret: (() => void) | null = null;

  /** The look of the boss now fighting (saga), for effect colours. */
  private bossLook(): AsuraLook | null {
    const st = this.bossArena ? styleOf(this.bossArena) : null;
    return st ? (ASURA_LOOKS[st.id] ?? null) : null;
  }

  /** Told when a narayanastra starts or ends (the input holds auto-fire during it). */
  onStorm: ((on: boolean) => void) | null = null;

  private heroIds = new Map<string, number>();
  private heroOfPlayer(id: string): number {
    return this.heroIds.get(id) ?? 0;
  }

  /** `title`: the arena's name (e.g. TWIN SCORPIONS) when it differs from the boss's own. */
  /** The boss's own name in this mission's faction. */
  private bossName(kind: BossKind): string {
    // Saga bosses are named by their arenas (JWALA-ASUR, VISHARAJ, ...).
    if (isSagaId(this.renderer.level.id) && this.bossArena) return this.bossArena;
    const faction = this.renderer.level.faction;
    return faction === 'army' ? BOSS_INFO[kind].name : FACTION_NAME[faction][kind];
  }

  private bossArena: string | null = null;

  private bossIntro(kind: BossKind, title = this.bossName(kind)): void {
    const info = BOSS_INFO[kind];
    const faction = this.renderer.level.faction;
    $('boss-intro-name').textContent = title;
    const rules = this.renderer.level.arenas.find((a) => a.name === title)?.rules ?? [];
    const style = isSagaId(this.renderer.level.id) ? styleOf(title) : null;
    $('boss-intro-sub').textContent =
      faction === 'army'
        ? info.sub
        : style
          ? (BOSS_TITLES[style.id] ?? SAGA_SUB[kind])
          : isSagaId(this.renderer.level.id)
            ? SAGA_SUB[kind]
            : FACTION_SUB[faction][kind];
    // A boss that calls astras: its card says how to answer them; a saga boss also names its own moves.
    const tips = rules.map((r) => `${BOSS_ASTRA_TEXT[r].call} ${BOSS_ASTRA_TEXT[r].tip}`);
    if (style) tips.push(...sagaMoveTips(style));
    $('boss-intro-tip').textContent = tips.length ? tips.join(' · ') : info.tip;
    $('boss-name').textContent = title;
    const card = $('boss-intro');
    card.hidden = false;
    card.classList.remove('show');
    void card.offsetWidth; // restart the animation
    card.classList.add('show');
    window.clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => {
      card.hidden = true;
    }, 3200);
    this.sfx.play('beep');
    this.renderer.shake(8);
    this.bossLag = 1;
    $('boss-bar').hidden = false;
  }

  private cutTimer = 0;

  /** The astra cut-in (see .cutin in style.css): 1.25 s, the game runs on underneath. */
  cutIn(kind: keyof typeof ASTRA_CUT, icon: string, name: string, who: string, boss = false): void {
    const c = $('cutin');
    const info = ASTRA_CUT[kind];
    c.style.setProperty('--cut', info.color);
    c.classList.toggle('boss', boss);
    $('cutin-icon').textContent = icon;
    $('cutin-name').textContent = name;
    $('cutin-deva').textContent = info.deva;
    $('cutin-who').textContent = who;
    c.hidden = true;
    void c.offsetWidth; // restart the animations
    c.hidden = false;
    window.clearTimeout(this.cutTimer);
    this.cutTimer = window.setTimeout(() => {
      c.hidden = true;
    }, 1300);
  }

  showBanner(text: string, bad = false): void {
    const b = $('banner');
    b.textContent = text;
    b.classList.toggle('bad', bad);
    b.classList.add('show');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), 2200);
  }

  showCoach(text: string, ms: number): void {
    const c = $('coach');
    c.textContent = text;
    c.hidden = false;
    this.coachUntil = performance.now() + ms;
  }

  hideCoach(): void {
    $('coach').hidden = true;
    this.coachUntil = 0;
  }

  /** One-line, non-interactive notice in the feed. */
  notice(text: string, kind: 'info' | 'bad' = 'info'): void {
    const row = el('div', { class: `notice${kind === 'bad' ? ' bad' : ''}`, text });
    const feed = $('killfeed');
    feed.append(row);
    while (feed.childElementCount > 4) feed.firstElementChild?.remove();
    window.setTimeout(() => row.remove(), 5000);
  }

  // ------------------------------------------------------------ per-frame

  draw(
    frame: Snapshot,
    latest: Snapshot,
    o: Omit<DrawOptions, 'meId'>,
    net: { rtt: number } | null,
    firing: boolean,
  ): void {
    this.rememberNames(latest);
    for (const p of latest.players) this.heroIds.set(p.id, p.hr);
    this.renderer.draw(frame, { ...o, reduceMotion: this.settings().reduceMotion, meId: this.meId });
    const me = latest.players.find((p) => p.id === this.meId);
    // Own gunfire sound follows the local trigger (no waiting for the server), at the weapon's real rate.
    if (firing && me && me.st === 0 && latest.phase === 'playing' && o.nowMs >= this.nextFireSound) {
      const w = GAME_CONFIG.weapons[WEAPON_KINDS[me.w] ?? 'blaster'];
      const rate = me.od === 1 ? GAME_CONFIG.ult.overdrive.fireRate : 1;
      this.nextFireSound = o.nowMs + Math.max(80, (w.cooldown * 1000) / rate);
      this.sfx.play('fire');
    }
    this.updateHud(latest, me, net, o.nowMs);
  }

  private updateHud(
    s: Snapshot,
    me: PlayerSnapshot | undefined,
    net: { rtt: number } | null,
    nowMs: number,
  ): void {
    if (this.coachUntil && nowMs > this.coachUntil && s.phase !== 'countdown') this.hideCoach();
    $('hud-lives').textContent = `♥ ${s.lives}`;
    this.updatePowers(s, me);
    $('hud-lives').title = `${s.lives} squad lives left`;
    $('hud-score').textContent = String(s.score);
    if (me) {
      // Health: the bar drops at once, a pale "damage taken" bar follows it down.
      const hp = Math.max(0, Math.min(100, me.hp));
      this.hpLag = hp > this.hpLag ? hp : this.hpLag + (hp - this.hpLag) * 0.06;
      ($('hud-hp-fill') as HTMLElement).style.width = `${hp}%`;
      ($('hud-hp-lag') as HTMLElement).style.width = `${this.hpLag}%`;
      $('hud-hp-num').textContent = String(hp);
      const hpBar = $('hud-hp');
      hpBar.setAttribute('aria-valuenow', String(hp));
      hpBar.classList.toggle('low', hp <= 30 && me.st === 0);
      // Super meter.
      const ready = me.ul >= GAME_CONFIG.ult.max && me.st === 0;
      ($('hud-ult-fill') as HTMLElement).style.width = `${me.ul}%`;
      $('hud-ult').classList.toggle('ready', ready);
      $('btn-touch-ult').classList.toggle('ready', ready);
      if (ready && !this.ultReady) {
        this.sfx.play('powerup');
        this.showBanner(`${heroOf(me.hr).ultName} READY — press Q`);
      }
      this.ultReady = ready;
      const w = GAME_CONFIG.weapons[WEAPON_KINDS[me.w] ?? 'blaster'];
      $('hud-weapon').textContent =
        me.od === 1 ? 'OVERDRIVE' : w.letter ? `${w.letter} · ${w.label}` : w.label;
      $('hud-weapon').classList.toggle('od', me.od === 1);
      const zone = [...this.renderer.level.zones].reverse().find((z) => me.x >= z.x)?.name ?? '';
      if (zone !== this.lastZone) {
        this.lastZone = zone;
        $('hud-zone').textContent = zone;
      }
      this.updateCombo(me, nowMs);
    }
    // Boss bar.
    const bossBar = $('boss-bar');
    if (s.boss && s.boss.hp > 0) {
      bossBar.hidden = false;
      $('boss-name').textContent =
        (s.arena && this.renderer.level.arenas[s.arena.id]?.name) || this.bossName(s.boss.k);
      const f = Math.max(0, s.boss.hp / s.boss.max);
      this.bossLag = f > this.bossLag ? f : this.bossLag + (f - this.bossLag) * 0.05;
      ($('boss-fill') as HTMLElement).style.width = `${f * 100}%`;
      ($('boss-lag') as HTMLElement).style.width = `${this.bossLag * 100}%`;
      const phases = s.boss.k === 'boss' ? 3 : 2;
      $('boss-phase').textContent = `PHASE ${s.boss.ph}/${phases}`;
      bossBar.classList.toggle('enraged', s.boss.ph >= phases);
    } else if (!s.boss) bossBar.hidden = true;
    // Arena lock.
    const ar = $('hud-arena');
    const a = s.arena ? this.renderer.level.arenas[s.arena.id] : undefined;
    if (s.arena && a && !a.boss) {
      ar.hidden = false;
      ar.textContent = `⚠ ${a.name} · WAVE ${s.arena.w}/${s.arena.n} · ${s.arena.left} LEFT`;
    } else ar.hidden = true;
    this.updateOverlays(s, me);

    this.frames++;
    if (nowMs - this.fpsSince >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (nowMs - this.fpsSince));
      this.frames = 0;
      this.fpsSince = nowMs;
      $('hud-net').textContent = this.settings().showStats
        ? `${this.fps} fps${net ? ` · ${net.rtt} ms` : ''}`
        : '';
    }
  }

  /** Held power chip, the ASTRA button glow, and the team brahmastra meter. */
  private updatePowers(s: Snapshot, me: PlayerSnapshot | undefined): void {
    // A boss astra is being called (or its orb is out): one big, plain instruction on what to do about it.
    const cast = s.enemies.find((e) => e.ra >= 0);
    const rule: BossRule | undefined =
      cast !== undefined
        ? BOSS_RULES[cast.ra]
        : s.bullets.some((b) => b.e === 1 && b.k === ORB)
          ? 'vaishnava'
          : undefined;
    const box = document.getElementById('hud-samarpan');
    if (box) {
      box.hidden = !rule;
      const rs = me?.rs ?? 0;
      if (rule === 'narayana')
        box.textContent =
          rs > 0
            ? `🏹 YOU ARE FIGHTING IT: ${rs} ARROWS EACH VOLLEY · STOP FIRING`
            : '🙏 SAMARPAN · LOWER YOUR WEAPONS: STOP FIRING AND IT SPARES YOU';
      else if (rule) box.textContent = `${BOSS_ASTRA_TEXT[rule].call} ${BOSS_ASTRA_TEXT[rule].tip}`;
      box.classList.toggle('resist', rule === 'narayana' && rs > 0);
    }
    this.onStorm?.(rule === 'narayana');
    const chip = $('hud-power');
    const kind = me && me.pw >= 0 ? POWER_KINDS[me.pw] : undefined;
    const btn = document.getElementById('btn-touch-astra');
    if (btn) {
      // On phones the button itself shows what it will fire, and how many are left.
      const label = kind && me ? `${POWER_INFO[kind].icon} ×${me.pn}` : s.bm >= 100 ? '☀ BRAHMA' : null;
      const fallback = this.renderer.level.faction === 'void' ? 'POWER' : 'ASTRA';
      const text = label ?? fallback;
      if (btn.textContent !== text) btn.textContent = text;
    }
    if (kind && me) {
      const info = POWER_INFO[kind];
      chip.hidden = false;
      chip.textContent = `${info.icon} ${info.name} ×${me.pn}`;
      chip.title = info.tip;
      chip.classList.toggle('void', kind === 'singularity');
    } else chip.hidden = true;
    const bar = $('hud-brahma');
    if (s.bm >= 0) {
      bar.hidden = false;
      ($('hud-brahma-fill') as HTMLElement).style.width = `${s.bm}%`;
      const ready = s.bm >= 100;
      bar.classList.toggle('ready', ready);
      $('hud-brahma-label').textContent = ready ? 'BRAHMASTRA READY · ASTRA' : 'BRAHMASTRA';
      btn?.classList.toggle('ready', Boolean(kind) || ready);
    } else {
      bar.hidden = true;
      btn?.classList.toggle('ready', Boolean(kind));
    }
  }

  private updateCombo(me: PlayerSnapshot, nowMs: number): void {
    const box = $('combo');
    if (me.cb > this.lastCombo) this.comboAt = nowMs;
    if (me.cb > this.stats.bestCombo) this.stats.bestCombo = me.cb;
    this.lastCombo = me.cb;
    if (me.cb < 3) {
      box.hidden = true;
      this.lastRank = -1;
      return;
    }
    box.hidden = false;
    $('combo-num').textContent = String(me.cb);
    const rk = me.rk;
    const rankEl = $('combo-rank');
    rankEl.textContent = rk >= 0 ? rankName(rk) : '–';
    box.style.setProperty('--rank', rk >= 0 ? (RANK_COLORS[rk] as string) : '#94a3b8');
    if (rk > this.lastRank && rk >= 0) {
      rankEl.classList.remove('pop');
      void rankEl.offsetWidth;
      rankEl.classList.add('pop');
      if (rk >= 3) this.sfx.play('powerup');
    }
    this.lastRank = rk;
    const left = Math.max(0, 1 - (nowMs - this.comboAt) / (GAME_CONFIG.combo.windowSec * 1000));
    ($('combo-fill') as HTMLElement).style.width = `${left * 100}%`;
    const mult = Math.min(GAME_CONFIG.combo.maxMultiplier, 1 + Math.floor(me.cb / 10) * 0.1);
    $('combo-mult').textContent = `×${mult.toFixed(1)} score`;
  }

  private updateOverlays(s: Snapshot, me: PlayerSnapshot | undefined): void {
    const cd = $('overlay-countdown');
    if (s.phase === 'countdown') {
      cd.hidden = false;
      const n = Math.max(1, s.cd);
      $('countdown-num').textContent = String(n);
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        this.sfx.play('beep');
      }
    } else cd.hidden = true;

    const panel = $('down-panel');
    const down = !!me && me.st === 1 && s.phase === 'playing';
    panel.hidden = !down;
    if (down && me) {
      const friendsUp = s.players.some((p) => p.id !== this.meId && p.st === 0);
      $('down-text').textContent =
        me.dl >= 0
          ? `KNOCKED OUT — back in ${Math.max(1, me.dl)}…`
          : friendsUp
            ? 'Out of squad lives. Hang on: beating a boss brings you back!'
            : 'Mission failing…';
    }
  }
}
