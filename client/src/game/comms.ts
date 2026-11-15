import { CHAPTERS, SPEAKER_NAME, type Line } from '../story';
import { $ } from '../ui/dom';
import { bossFace, bossReady, hasBoss3d } from './boss3d';
import { heroPortrait } from './sprites';
import vaniUrl from '../assets/story/vani.webp?url';

/**
 * The story's radio: short lines over the action, a portrait, a name and the line typed out, one after another.
 * It never stops play (no pause, no button to press; it sits beside the hero card and lets clicks through), so a
 * squad online hears the same story without anyone waiting, and a player who wants none of it just keeps playing.
 */

const TYPE_CPS = 42; // characters a second
const HOLD_MS = 1700; // after a line is fully typed
const SEEN_KEY = 'strikesquad.story.v1';

let vani: HTMLImageElement | null = null;

export interface CommsCast {
  /** your hero, for the "YOU" lines */
  hero: number;
  heroName: string;
  /** the boss now speaking (its atlas key, e.g. "saptashir") and name */
  boss?: string;
  bossName?: string;
}

export class Comms {
  private queue: { line: Line; cast: CommsCast }[] = [];
  private timer = 0;
  private typing = 0;
  private busy = false;
  /** the line on screen (a late portrait never lands on the next one) */
  private current: Line | null = null;

  /** Queues lines after `delayMs` (the boss card, say, has the screen first). */
  say(lines: readonly Line[], cast: CommsCast, delayMs = 0, urgent = false): void {
    if (!lines.length) return;
    const go = (): void => {
      if (urgent) {
        // what is happening now comes first: it cuts the line on air and goes ahead of the queue
        this.queue.unshift(...lines.map((line) => ({ line, cast })));
        window.clearInterval(this.typing);
        window.clearTimeout(this.timer);
        this.next();
        return;
      }
      for (const line of lines) this.queue.push({ line, cast });
      if (!this.busy) this.next();
    };
    if (delayMs > 0) window.setTimeout(go, delayMs);
    else go();
  }

  /** Stops talking at once (leaving a mission). */
  clear(): void {
    this.queue = [];
    window.clearTimeout(this.timer);
    window.clearInterval(this.typing);
    this.busy = false;
    const box = document.getElementById('comms');
    if (box) {
      box.classList.remove('show');
      box.hidden = true;
    }
  }

  private next(): void {
    const item = this.queue.shift();
    const box = $('comms');
    if (!item) {
      this.busy = false;
      box.classList.remove('show');
      this.timer = window.setTimeout(() => (box.hidden = true), 300);
      return;
    }
    this.busy = true;
    const { line, cast } = item;
    this.current = line;
    window.clearTimeout(this.timer);
    box.hidden = false;
    box.dataset.who = line.who;
    void box.offsetWidth;
    box.classList.add('show');
    $('comms-who').textContent =
      line.who === 'hero'
        ? cast.heroName.toUpperCase()
        : line.who === 'boss'
          ? (cast.bossName ?? 'ENEMY').toUpperCase()
          : SPEAKER_NAME[line.who];
    this.face(line, cast);
    const text = $('comms-text');
    text.textContent = '';
    let n = 0;
    window.clearInterval(this.typing);
    this.typing = window.setInterval(() => {
      n = Math.min(line.text.length, n + 2);
      text.textContent = line.text.slice(0, n);
      if (n >= line.text.length) {
        window.clearInterval(this.typing);
        this.timer = window.setTimeout(() => this.next(), HOLD_MS);
      }
    }, 2000 / TYPE_CPS);
  }

  private face(line: Line, cast: CommsCast, tries = 0): void {
    const c = $('comms-face') as HTMLCanvasElement;
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const W = c.width;
    if (line.who === 'vani') {
      if (!vani) {
        vani = new Image();
        vani.src = vaniUrl;
        vani.onload = () => this.face(line, cast);
      }
      if (vani.complete && vani.naturalWidth) g.drawImage(vani, -W * 0.12, -W * 0.02, W * 1.24, W * 1.24);
      return;
    }
    if (line.who === 'hero') {
      const p = heroPortrait(cast.hero);
      g.imageSmoothingEnabled = p.width > 40;
      g.drawImage(p, 0, 0, W, W);
      return;
    }
    const key = line.who === 'saptashir' ? 'saptashir' : cast.boss;
    const f = key ? bossFace(key) : undefined;
    if (f) {
      g.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, W, W);
      return;
    }
    // a rendered face still loading: draw the seal now and the face as soon as it arrives
    if (key && hasBoss3d(key) && tries < 8)
      window.setTimeout(() => {
        if (this.current !== line) return;
        if (!bossReady(key)) return this.face(line, cast, tries + 1);
        this.face(line, cast, 8);
      }, 300);
    // a boss not rendered yet: its initial on a red seal
    g.fillStyle = '#7f1d1d';
    g.beginPath();
    g.arc(W / 2, W / 2, W * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fde68a';
    g.font = `${Math.round(W * 0.5)}px "Russo One", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(($('comms-who').textContent || '?').charAt(0), W / 2, W / 2 + W * 0.03);
  }
}

function seen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** The lines a stage opens with: all of them the first time, then only the first. */
export function openingLines(id: string): Line[] {
  const ch = CHAPTERS[id as keyof typeof CHAPTERS];
  if (!ch) return [];
  const s = seen();
  if (s.has(id)) return ch.open.slice(0, 1);
  s.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    // private mode: the story is told in full every time, which is harmless
  }
  return ch.open;
}
