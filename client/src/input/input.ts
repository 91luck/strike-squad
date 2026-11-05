import { NEUTRAL_INPUT, type PlayerInput } from '@strikesquad/shared';
import type { Settings } from '../settings';

/**
 * Turns a touch-joystick vector into the 8-way stick of the arcade classics.
 * `vx, vy` are in [-1, 1] (y down). Horizontal needs a small push; up/down need a clearer one, so running right
 * while thumbing slightly upward does not suddenly aim at the sky.
 */
export function stickToAxes(vx: number, vy: number, sensitivity = 1): { mx: number; my: number } {
  const s = Math.max(0.5, Math.min(1.5, sensitivity));
  const hx = 0.32 / s;
  const hy = 0.5 / s;
  return {
    mx: vx > hx ? 1 : vx < -hx ? -1 : 0,
    my: vy > hy ? 1 : vy < -hy ? -1 : 0,
  };
}

const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const EXTRA_JUMP = new Set(['Space', 'KeyK', 'KeyZ']);
const EXTRA_FIRE = new Set(['KeyJ', 'KeyX']);
/** Dash (Down + Dash: slide), knife, hero super move. */
export const DASH_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyL', 'KeyC']);
export const MELEE_KEYS = new Set(['KeyF', 'KeyV', 'KeyI']);
export const ULT_KEYS = new Set(['KeyQ', 'KeyE', 'KeyO']);
/** Fire the held power (astra), or the team brahmastra. */
export const ASTRA_KEYS = new Set(['KeyR', 'KeyG', 'KeyU']);
/** Toggle auto-fire during a mission. */
export const AUTOFIRE_KEY = 'KeyT';
const GAME_KEYS = new Set([
  ...LEFT,
  ...RIGHT,
  ...UP,
  ...DOWN,
  ...EXTRA_JUMP,
  ...EXTRA_FIRE,
  ...DASH_KEYS,
  ...MELEE_KEYS,
  ...ULT_KEYS,
  ...ASTRA_KEYS,
  AUTOFIRE_KEY,
]);

export function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export interface InputOptions {
  settings: () => Settings;
  /** Keyboard game controls only work while a mission is on screen and nothing modal is open. */
  isActive: () => boolean;
  onPause: () => void;
}

export class InputController {
  private keys = new Set<string>();
  private joy: { id: number; ox: number; oy: number; vx: number; vy: number } | null = null;
  private touchFire = new Set<number>();
  private touchJump = new Set<number>();
  private touchDash = new Set<number>();
  private touchMelee = new Set<number>();
  private touchUlt = new Set<number>();
  private touchAstra = new Set<number>();
  private astraLatch = false;
  /**
   * Auto-fire for this mission: null follows the setting; advanced missions start with it off, and the AUTO button
   * (or T) flips it.
   */
  autoFireOverride: boolean | null = null;
  /** A narayanastra storm is on: auto-fire holds off (laying down your weapons is the way through it). */
  holdAutoFire = false;
  /** Called when the AUTO toggle flips (to refresh the button). */
  onAutoFireChange: (on: boolean) => void = () => undefined;
  /** A button pressed and released between two samples still counts once. */
  private jumpLatch = false;
  private dashLatch = false;
  private meleeLatch = false;
  private ultLatch = false;
  private captureNext: ((code: string) => void) | null = null;
  /** True once the player has used the on-screen controls (enables auto-fire). */
  usedTouch = false;

  constructor(private readonly opts: InputOptions) {}

  attach(): void {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    this.attachTouch();
  }

  captureKey(cb: (code: string) => void): void {
    this.captureNext = cb;
  }

  releaseAll(): void {
    this.keys.clear();
    this.touchFire.clear();
    this.touchJump.clear();
    this.touchDash.clear();
    this.touchMelee.clear();
    this.touchUlt.clear();
    this.touchAstra.clear();
    this.jumpLatch = this.dashLatch = this.meleeLatch = this.ultLatch = this.astraLatch = false;
    this.joy = null;
    document.getElementById('joy-base')?.classList.remove('active');
    for (const id of ['fire', 'jump', 'dash', 'melee', 'ult', 'astra'])
      document.getElementById(`btn-touch-${id}`)?.classList.remove('down');
  }

  private isJumpKey(code: string): boolean {
    return EXTRA_JUMP.has(code) || code === this.opts.settings().keyJump;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.captureNext && down) {
      e.preventDefault();
      const cb = this.captureNext;
      this.captureNext = null;
      cb(e.code);
      return;
    }
    if (e.code === 'Escape' && down && !e.repeat) {
      this.opts.onPause();
      return;
    }
    if (isFormField(e.target)) return; // never hijack typing in the name/code boxes
    const s = this.opts.settings();
    const relevant = GAME_KEYS.has(e.code) || e.code === s.keyFire || e.code === s.keyJump;
    if (!relevant || !this.opts.isActive()) {
      if (!down) this.keys.delete(e.code);
      return;
    }
    e.preventDefault(); // no page scrolling with arrows/space during play
    if (down) {
      if (!e.repeat) {
        if (this.isJumpKey(e.code)) this.jumpLatch = true;
        if (DASH_KEYS.has(e.code)) this.dashLatch = true;
        if (MELEE_KEYS.has(e.code)) this.meleeLatch = true;
        if (ULT_KEYS.has(e.code)) this.ultLatch = true;
        if (ASTRA_KEYS.has(e.code)) this.astraLatch = true;
        if (e.code === AUTOFIRE_KEY) this.toggleAutoFire();
      }
      this.keys.add(e.code);
    } else this.keys.delete(e.code);
  }

  private any(codes: Iterable<string>): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Current intention, sampled once per client tick. */
  read(): PlayerInput {
    if (!this.opts.isActive()) {
      this.jumpLatch = this.dashLatch = this.meleeLatch = this.ultLatch = this.astraLatch = false;
      return { ...NEUTRAL_INPUT };
    }
    const s = this.opts.settings();
    let mx = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    let my = (this.any(DOWN) ? 1 : 0) - (this.any(UP) ? 1 : 0);
    if (this.joy) {
      const j = stickToAxes(this.joy.vx, this.joy.vy, s.touchSensitivity / 100);
      if (j.mx !== 0 || j.my !== 0) {
        mx = j.mx;
        my = j.my;
      }
    }
    const jumpHeld = this.any(EXTRA_JUMP) || this.keys.has(s.keyJump) || this.touchJump.size > 0;
    const jump = jumpHeld || this.jumpLatch;
    this.jumpLatch = false;
    const fire =
      this.any(EXTRA_FIRE) ||
      this.keys.has(s.keyFire) ||
      this.touchFire.size > 0 ||
      (this.autoFire() && this.usedTouch && !this.holdAutoFire);
    const dash = this.any(DASH_KEYS) || this.touchDash.size > 0 || this.dashLatch;
    const melee = this.any(MELEE_KEYS) || this.touchMelee.size > 0 || this.meleeLatch;
    const ult = this.any(ULT_KEYS) || this.touchUlt.size > 0 || this.ultLatch;
    const astra = this.any(ASTRA_KEYS) || this.touchAstra.size > 0 || this.astraLatch;
    this.dashLatch = this.meleeLatch = this.ultLatch = this.astraLatch = false;
    return { mx, my, jump, fire, dash, melee, ult, astra };
  }

  /** Is auto-fire on right now (this mission's choice, else the setting)? */
  autoFire(): boolean {
    return this.autoFireOverride ?? this.opts.settings().autoFire;
  }

  toggleAutoFire(): void {
    this.autoFireOverride = !this.autoFire();
    this.onAutoFireChange(this.autoFireOverride);
  }

  // ------------------------------------------------------------ touch

  private attachTouch(): void {
    const zone = document.getElementById('joy-zone');
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    if (zone && base && knob) {
      const R = 56;
      zone.addEventListener('pointerdown', (e) => {
        if (this.joy) return; // one finger drives the stick; the others stay free for the buttons
        e.preventDefault();
        this.usedTouch = true;
        zone.setPointerCapture(e.pointerId);
        const r = zone.getBoundingClientRect();
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, vx: 0, vy: 0 };
        base.style.left = `${e.clientX - r.left}px`;
        base.style.top = `${e.clientY - r.top}px`;
        base.classList.add('active');
        knob.style.transform = 'translate(0,0)';
      });
      zone.addEventListener('pointermove', (e) => {
        if (!this.joy || this.joy.id !== e.pointerId) return;
        e.preventDefault();
        let dx = e.clientX - this.joy.ox;
        let dy = e.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        this.joy.vx = dx / R;
        this.joy.vy = dy / R;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      const end = (e: PointerEvent): void => {
        if (!this.joy || this.joy.id !== e.pointerId) return;
        this.joy = null;
        base.classList.remove('active');
      };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
      zone.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    const bindButton = (id: string, set: Set<number>, onPress?: () => void): void => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.usedTouch = true;
        el.setPointerCapture(e.pointerId);
        set.add(e.pointerId);
        onPress?.();
        el.classList.add('down');
      });
      const up = (e: PointerEvent): void => {
        set.delete(e.pointerId);
        if (set.size === 0) el.classList.remove('down');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bindButton('btn-touch-fire', this.touchFire);
    bindButton('btn-touch-jump', this.touchJump, () => {
      this.jumpLatch = true;
    });
    bindButton('btn-touch-dash', this.touchDash, () => {
      this.dashLatch = true;
    });
    bindButton('btn-touch-melee', this.touchMelee, () => {
      this.meleeLatch = true;
    });
    bindButton('btn-touch-ult', this.touchUlt, () => {
      this.ultLatch = true;
    });
    bindButton('btn-touch-astra', this.touchAstra, () => {
      this.astraLatch = true;
    });
    const auto = document.getElementById('btn-touch-auto');
    auto?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.usedTouch = true;
      this.toggleAutoFire();
    });
  }
}
