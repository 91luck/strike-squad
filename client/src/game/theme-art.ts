import type { Faction } from '@strikesquad/shared';
import { litLayer, type LitBox } from './boss-art';
import type { ZoneStyle } from './world-art';

/**
 * Faction art that is not a body sprite: arena gates, shields, wings and jets, drones, turrets and enemy fire.
 * The simulation is identical for every faction; these functions only decide how things look, so each mission
 * (tomb guard, frost warriors, Olympus beasts, demons, aliens) reads as its own world.
 *
 * Everything draws straight onto the world canvas at world coordinates (the renderer has already applied the camera).
 */

type Ctx = CanvasRenderingContext2D;
const INK = '#120f17';

/** While a body is painted into a lit layer (litEnemy), its glows are held back and drawn on top afterwards. */
let deferGlow: ((x: number, y: number, r: number, color: string) => void) | null = null;

function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  if (deferGlow) {
    deferGlow(x, y, r, color);
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * Paints a small enemy body into a lit high-definition layer (form shading, rim light, grain on the heroes'
 * pixel grid: boss-art.ts litLayer), its glows kept bright on top.
 */
function litEnemy(main: Ctx, box: LitBox, paint: (g: Ctx) => void): void {
  const later: (() => void)[] = [];
  litLayer(main, box, (g, toWorld) => {
    deferGlow = (x, y, r, color) => {
      const [wx, wy, sx] = toWorld(x, y);
      later.push(() => glow(main, wx, wy, r * sx, color));
    };
    try {
      paint(g);
    } finally {
      deferGlow = null;
    }
  });
  for (const f of later) f();
}

// ------------------------------------------------------------------ enemy fire

/** Colours of enemy shots per faction: `core` for small shots, `shell` for heavy rounds, `wave` for shockwaves. */
export const SHOT_COLORS: Record<Faction, { core: string; shell: string; wave: [string, string] }> = {
  army: { core: '#ff5a5a', shell: '#ff9f1c', wave: ['255,160,60', '255,240,200'] },
  pharaoh: { core: '#a3e635', shell: '#fbbf24', wave: ['230,190,110', '255,240,190'] },
  norse: { core: '#7dd3fc', shell: '#e0f2fe', wave: ['150,210,255', '235,250,255'] },
  olympus: { core: '#93c5fd', shell: '#fde047', wave: ['147,197,253', '240,245,255'] },
  demon: { core: '#f97316', shell: '#ef4444', wave: ['255,90,30', '255,220,120'] },
  void: { core: '#4ade80', shell: '#c084fc', wave: ['74,222,128', '220,255,230'] },
};

/**
 * Themed boss ordnance: bombs become sun orbs, ice boulders, lightning orbs, fire skulls or plasma eggs; missiles
 * become golden feathers, a spinning thunder hammer, harpy spears, fireballs or homing plasma. Returns false for
 * the army, which keeps the original bombs and missiles.
 */
export function drawOrdnance(
  ctx: Ctx,
  faction: Faction,
  kind: 'bomb' | 'grenade' | 'missile',
  x: number,
  y: number,
  vx: number,
  vy: number,
  nowMs: number,
): boolean {
  if (faction === 'army') return false;
  const c = SHOT_COLORS[faction];
  if (kind === 'missile') {
    const a = Math.atan2(vy, vx);
    ctx.save();
    ctx.translate(x, y);
    if (faction === 'norse') {
      // the thunder god's hammer, spinning end over end
      ctx.rotate(nowMs / 60);
      ctx.fillStyle = INK;
      ctx.fillRect(-2, -12, 5, 18);
      ctx.fillRect(-10, -16, 21, 11);
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(-1, -11, 3, 16);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(-9, -15, 19, 9);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(-9, -15, 19, 2);
      ctx.restore();
      glow(ctx, x, y, 14, 'rgba(147,197,253,0.6)');
      return true;
    }
    ctx.rotate(a);
    if (faction === 'pharaoh' || faction === 'olympus') {
      // a golden feather / a harpy's bronze spear
      const shaft = faction === 'pharaoh' ? '#fbbf24' : '#b7791f';
      ctx.fillStyle = INK;
      ctx.fillRect(-14, -3, 26, 6);
      ctx.fillStyle = shaft;
      ctx.fillRect(-13, -2, 24, 4);
      ctx.fillStyle = faction === 'pharaoh' ? '#fde68a' : '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(10, -5);
      ctx.lineTo(18, 0);
      ctx.lineTo(10, 5);
      ctx.fill();
      ctx.restore();
      glow(ctx, x, y, 9, faction === 'pharaoh' ? 'rgba(251,191,36,0.6)' : 'rgba(253,224,71,0.45)');
      return true;
    }
    ctx.restore();
    // demon fireball / alien homing plasma
    glow(ctx, x, y, 16, faction === 'demon' ? 'rgba(249,115,22,0.85)' : 'rgba(74,222,128,0.8)');
    glow(ctx, x, y, 7, '#ffffff');
    glow(
      ctx,
      x - Math.cos(a) * 12,
      y - Math.sin(a) * 12,
      9,
      faction === 'demon' ? 'rgba(239,68,68,0.6)' : 'rgba(192,132,252,0.6)',
    );
    return true;
  }
  // bombs and grenades
  const r = kind === 'bomb' ? 8 : 5;
  if (faction === 'norse') {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bfdbfe';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - r / 2, y - r / 2, 3, 2);
    return true;
  }
  if (faction === 'demon') {
    // a burning skull
    glow(ctx, x, y - 3, r + 9, 'rgba(249,115,22,0.7)');
    ctx.fillStyle = '#e7e5e4';
    ctx.fillRect(x - r, y - r, r * 2, r * 2 - 2);
    ctx.fillStyle = '#1a0505';
    ctx.fillRect(x - r + 2, y - 2, 3, 3);
    ctx.fillRect(x + r - 5, y - 2, 3, 3);
    return true;
  }
  const pulse = 0.7 + 0.3 * Math.sin(nowMs / 70);
  glow(ctx, x, y, (r + 8) * pulse, faction === 'olympus' ? 'rgba(147,197,253,0.9)' : `${c.shell}cc`);
  glow(ctx, x, y, r * 0.7, '#ffffff');
  if (faction === 'olympus' && Math.floor(nowMs / 50) % 2 === 0) {
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - r - 4, y - 2);
    ctx.lineTo(x - 2, y + 2);
    ctx.lineTo(x + 2, y - 3);
    ctx.lineTo(x + r + 4, y + 1);
    ctx.stroke();
  }
  return true;
}

// ------------------------------------------------------------------ arena gates

/** One locked arena gate, one tile wide and `h` tall, drawn in its zone's style. */
export function drawGate(
  ctx: Ctx,
  style: ZoneStyle['gate'],
  x: number,
  w: number,
  h: number,
  nowMs: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 200);
  switch (style) {
    case 'stone': {
      // carved sandstone slab with an eye glyph that glows while sealed
      ctx.fillStyle = INK;
      ctx.fillRect(x, 0, w, h);
      ctx.fillStyle = '#c9a46a';
      ctx.fillRect(x + 2, 0, w - 4, h);
      for (let y = 0; y < h; y += 48) {
        ctx.fillStyle = '#9a7444';
        ctx.fillRect(x + 2, y + 46, w - 4, 2);
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(x + 4, y + 6, w - 8, 3);
        ctx.fillStyle = '#7a5a34';
        ctx.fillRect(x + 9, y + 20, 14, 2);
        ctx.fillRect(x + 12, y + 17, 8, 2);
        ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + pulse * 0.5})`;
        ctx.fillRect(x + 14, y + 19, 4, 4);
      }
      glow(ctx, x + w / 2, h - 30, 14, `rgba(250,204,21,${0.2 + pulse * 0.3})`);
      return;
    }
    case 'ice': {
      ctx.fillStyle = 'rgba(165, 216, 240, 0.85)';
      ctx.fillRect(x + 1, 0, w - 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let y = 10; y < h; y += 26) ctx.fillRect(x + 5 + ((y / 26) % 3) * 6, y, 3, 14);
      ctx.fillStyle = '#5f9cc0';
      ctx.fillRect(x + 1, 0, 2, h);
      // a glowing rune
      ctx.fillStyle = `rgba(56,189,248,${0.5 + pulse * 0.5})`;
      ctx.fillRect(x + 14, h - 70, 3, 28);
      ctx.fillRect(x + 14, h - 70, 9, 3);
      ctx.fillRect(x + 14, h - 58, 8, 3);
      glow(ctx, x + w / 2, h - 56, 20, `rgba(56,189,248,${0.15 + pulse * 0.25})`);
      return;
    }
    case 'bronze': {
      ctx.fillStyle = INK;
      ctx.fillRect(x, 0, w, h);
      ctx.fillStyle = '#b7791f';
      ctx.fillRect(x + 2, 0, w - 4, h);
      ctx.fillStyle = '#e0b44a';
      ctx.fillRect(x + 4, 0, 4, h);
      for (let y = 0; y < h; y += 40) {
        // meander (Greek key) band
        ctx.fillStyle = '#7c4a12';
        ctx.fillRect(x + 6, y + 12, 20, 2);
        ctx.fillRect(x + 6, y + 12, 2, 8);
        ctx.fillRect(x + 6, y + 20, 10, 2);
        ctx.fillRect(x + 16, y + 16, 2, 6);
        ctx.fillRect(x + 24, y + 12, 2, 10);
      }
      // laurel-gold lock that crackles with lightning
      ctx.fillStyle = `rgba(147,197,253,${0.4 + pulse * 0.6})`;
      ctx.fillRect(x + 12, h - 30, 8, 8);
      glow(ctx, x + w / 2, h - 26, 16, `rgba(147,197,253,${0.2 + pulse * 0.4})`);
      return;
    }
    case 'bone': {
      ctx.fillStyle = '#1c1416';
      ctx.fillRect(x + 2, 0, w - 4, h);
      for (let y = 0; y < h; y += 22) {
        ctx.fillStyle = '#d6cbb0';
        ctx.fillRect(x + 3, y + 4, w - 6, 5);
        ctx.fillRect(x + 1, y + 2, 4, 9);
        ctx.fillRect(x + w - 5, y + 2, 4, 9);
      }
      // a horned skull lock with burning eyes
      const sy = h - 44;
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(x + 7, sy, 18, 16);
      ctx.fillRect(x + 3, sy - 8, 4, 10);
      ctx.fillRect(x + 25, sy - 8, 4, 10);
      ctx.fillStyle = pulse > 0.5 ? '#f97316' : '#7f1d1d';
      ctx.fillRect(x + 10, sy + 5, 4, 4);
      ctx.fillRect(x + 18, sy + 5, 4, 4);
      glow(ctx, x + w / 2, sy + 7, 18, `rgba(249,115,22,${0.2 + pulse * 0.3})`);
      return;
    }
    case 'membrane': {
      // a pulsing organic membrane stretched between two ribs
      ctx.fillStyle = `rgba(74, 222, 128, ${0.35 + pulse * 0.2})`;
      ctx.fillRect(x + 4, 0, w - 8, h);
      ctx.fillStyle = 'rgba(187, 247, 208, 0.5)';
      for (let y = 0; y < h; y += 18) ctx.fillRect(x + 8 + Math.sin(nowMs / 300 + y) * 4, y, 10, 6);
      ctx.fillStyle = '#1a2e1d';
      ctx.fillRect(x, 0, 5, h);
      ctx.fillRect(x + w - 5, 0, 5, h);
      glow(ctx, x + w / 2, h - 40, 22, `rgba(74,222,128,${0.15 + pulse * 0.25})`);
      return;
    }
    default: {
      // army blast door
      ctx.fillStyle = '#2f353e';
      ctx.fillRect(x + 2, 0, w - 4, h);
      ctx.fillStyle = '#454d58';
      ctx.fillRect(x + 4, 0, 6, h);
      for (let yy = 0; yy < h; yy += 40) {
        ctx.fillStyle = '#1d2127';
        ctx.fillRect(x + 2, yy + 36, w - 4, 4);
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = k % 2 ? '#1b1b1b' : '#f4c430';
          ctx.fillRect(x + 12, yy + 8 + k * 6, 14, 6);
        }
        ctx.fillStyle = '#8b95a1';
        ctx.fillRect(x + 6, yy + 4, 2, 2);
        ctx.fillRect(x + 24, yy + 4, 2, 2);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 70, 70, ${0.15 + pulse * 0.25})`;
      ctx.fillRect(x - 3, 0, 4, h);
      ctx.restore();
      ctx.fillStyle = pulse > 0.5 ? '#ff4040' : '#7a1d1d';
      ctx.fillRect(x + 12, h - 22, 8, 6);
    }
  }
}

// ------------------------------------------------------------------ troopers' kit

/** A shield trooper's shield, in front of the body (`f` = facing). */
export function drawShield(ctx: Ctx, faction: Faction, x: number, top: number, flash: boolean): void {
  // the energy barrier is pure light; real shields are lit like the troopers carrying them
  if (faction === 'void') paintShield(ctx, faction, x, top, flash);
  else litEnemy(ctx, { x: x - 12, y: top - 6, w: 24, h: 52 }, (g) => paintShield(g, faction, x, top, flash));
}

function paintShield(ctx: Ctx, faction: Faction, x: number, top: number, flash: boolean): void {
  const hit = (c: string): string => (flash ? '#ffffff' : c);
  ctx.fillStyle = INK;
  switch (faction) {
    case 'pharaoh': // a tall gold shield with a blue eye
      ctx.fillRect(x - 5, top - 2, 11, 44);
      ctx.fillStyle = hit('#d4a017');
      ctx.fillRect(x - 4, top - 1, 9, 42);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(x - 3, top, 2, 40);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(x - 3, top + 16, 7, 3);
      ctx.fillRect(x - 1, top + 19, 2, 5);
      return;
    case 'norse':
    case 'olympus': {
      // round painted wooden shield / bronze hoplite shield
      const cy = top + 20;
      ctx.beginPath();
      ctx.ellipse(x, cy, 8, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit(faction === 'norse' ? '#b91c1c' : '#b7791f');
      ctx.beginPath();
      ctx.ellipse(x, cy, 6.5, 17.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = faction === 'norse' ? '#f5f5f4' : '#7f1d1d';
      if (faction === 'norse') {
        ctx.fillRect(x - 1, cy - 17, 2, 34);
        ctx.fillRect(x - 6, cy - 1, 12, 2);
      } else {
        ctx.fillRect(x - 1, cy - 8, 2, 16); // a lambda-ish stripe
        ctx.fillRect(x - 3, cy + 4, 2, 4);
        ctx.fillRect(x + 1, cy + 4, 2, 4);
      }
      ctx.fillStyle = '#d1d5db';
      ctx.fillRect(x - 2, cy - 2, 4, 4);
      return;
    }
    case 'demon': // bone shield with spikes
      ctx.fillRect(x - 5, top - 1, 11, 42);
      ctx.fillStyle = hit('#d6cbb0');
      ctx.fillRect(x - 4, top, 9, 40);
      ctx.fillStyle = '#3b1f1c';
      for (let y = top + 3; y < top + 40; y += 7) ctx.fillRect(x - 4, y, 9, 2);
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(x + 4, top + 8, 4, 2);
      ctx.fillRect(x + 4, top + 26, 4, 2);
      return;
    case 'void': // a hexagonal energy barrier
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flash ? 'rgba(255,255,255,0.8)' : 'rgba(56,189,248,0.45)';
      ctx.fillRect(x - 4, top, 8, 40);
      ctx.fillStyle = 'rgba(186,230,253,0.8)';
      for (let y = top + 2; y < top + 40; y += 8) ctx.fillRect(x - 3, y, 6, 1);
      ctx.restore();
      return;
    default:
      // army riot shield
      ctx.fillRect(x - 4, top - 1, 9, 42);
      ctx.fillStyle = flash ? '#ffffff' : '#7dd3fc';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - 3, top, 7, 40);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(x - 2, top + 2, 2, 30);
      ctx.fillStyle = '#0c4a6e';
      ctx.fillRect(x - 3, top + 16, 7, 3);
  }
}

/**
 * What keeps a "jetpack" trooper airborne: the army's jetpack, scarab wings, raven wings, harpy wings, bat wings or
 * an alien hover disc. Drawn behind the body.
 */
export function drawFlyer(ctx: Ctx, faction: Faction, x: number, y: number, f: number, nowMs: number): void {
  // jet flames and the alien hover disc are light; wings are lit like bodies
  if (faction === 'army' || faction === 'void') paintFlyer(ctx, faction, x, y, f, nowMs);
  else litEnemy(ctx, { x: x - 56, y: y - 72, w: 112, h: 96 }, (g) => paintFlyer(g, faction, x, y, f, nowMs));
}

// ------------------------------------------------------------------ motion

/**
 * The draw calls only get a position, so motion is tracked here: each call is matched to the nearest track of the
 * same kind seen in the last 250 ms, which gives a smoothed velocity (for banking and flap speed) and a flap phase
 * that keeps running smoothly between frames. Tracks unseen for a second are dropped.
 */
interface Track {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
  phase: number;
  /** Frame stamp of the last match, so two enemies never share a track in one frame. */
  used: number;
  /** Milliseconds since this track was last drawn (for advancing its wing beat). */
  dtMs: number;
}

const tracks = new Map<string, Track[]>();
let lastPrune = 0;

function motion(kind: string, x: number, y: number, nowMs: number): Track {
  let list = tracks.get(kind);
  if (!list) tracks.set(kind, (list = []));
  if (nowMs - lastPrune > 1000) {
    lastPrune = nowMs;
    for (const [k, l] of tracks) {
      const keep = l.filter((t) => nowMs - t.t < 1000);
      if (keep.length) tracks.set(k, keep);
      else tracks.delete(k);
    }
    list = tracks.get(kind) ?? [];
    tracks.set(kind, list);
  }
  let best: Track | null = null;
  let bd = 48 * 48;
  for (const t of list) {
    if (t.used === nowMs || nowMs - t.t > 250 || nowMs < t.t) continue;
    const d = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  if (!best) {
    best = { x, y, t: nowMs, vx: 0, vy: 0, phase: Math.random(), used: nowMs, dtMs: 16 };
    list.push(best);
    return best;
  }
  const dt = Math.max(1, nowMs - best.t) / 1000;
  const k = Math.min(1, dt * 8); // about 1/8 s of smoothing
  best.vx += ((x - best.x) / dt - best.vx) * k;
  best.vy += ((y - best.y) / dt - best.vy) * k;
  best.dtMs = Math.min(50, nowMs - best.t);
  best.x = x;
  best.y = y;
  best.t = nowMs;
  best.used = nowMs;
  return best;
}

/**
 * Wing beat: advances the track's phase (beats a second: faster when climbing) and returns the wing angle, from
 * +1 (raised) to -1 (swept down). The downstroke takes 35 % of the beat and the recovery the rest, like a real
 * wing: it snaps down and floats back up.
 */
function beat(t: Track, rate: number): number {
  const dtMs = t.dtMs;
  const climb = Math.max(0, Math.min(1, -t.vy / 160));
  t.phase = (t.phase + (dtMs / 1000) * rate * (1 + climb * 0.7)) % 1;
  const p = t.phase;
  const ease = (u: number) => u * u * (3 - 2 * u);
  return p < 0.35 ? 1 - 2 * ease(p / 0.35) : -1 + 2 * ease((p - 0.35) / 0.65);
}

/** Banking: nose down when speeding forward, tilted by climbing or diving (radians). */
function bankOf(t: Track, f: number): number {
  return Math.max(-0.35, Math.min(0.35, (t.vx * f) / 900 + t.vy / 700));
}

// ------------------------------------------------------------------ wings

type WingStyle = 'feather' | 'bat' | 'scarab' | 'bronze';

/**
 * One wing seen from the side, hinged at (rx, ry), reaching back (away from facing f). `a` is the beat angle
 * (+1 raised, -1 down), `far` draws the far wing darker. The hand lags the arm (it trails on the downstroke and
 * leads on the recovery), which is what makes a flap read as a flap.
 */
function wing(
  ctx: Ctx,
  rx: number,
  ry: number,
  f: number,
  a: number,
  span: number,
  style: WingStyle,
  tones: [string, string, string],
  far: boolean,
): void {
  const [dark, base, light] = far ? [shade(tones[0], -0.35), shade(tones[1], -0.35), tones[1]] : tones;
  const arm = a * 0.95; // radians above the horizontal
  const lagged = arm + (a < 0 ? 0.35 : -0.25);
  const s1 = span * 0.45;
  const s2 = span * 0.6;
  const ex = rx - f * Math.cos(arm) * s1;
  const ey = ry - Math.sin(arm) * s1;
  const tx = ex - f * Math.cos(lagged) * s2;
  const ty = ey - Math.sin(lagged) * s2;
  if (style === 'scarab') {
    // a raised shell case and a blur of hind wings
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse((rx + ex) / 2, (ry + ey) / 2 - 2, span * 0.32, 5, -f * arm * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.ellipse((rx + ex) / 2, (ry + ey) / 2 - 2, span * 0.3, 4, -f * arm * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect((rx + ex) / 2 - 3, (ry + ey) / 2 - 5, 5, 1.5);
    ctx.fillStyle = far ? 'rgba(204,251,241,0.35)' : 'rgba(204,251,241,0.6)';
    ctx.beginPath();
    ctx.ellipse((ex + tx) / 2, (ey + ty) / 2, span * 0.4, 3.5, Math.atan2(ty - ey, tx - ex), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // the leading edge (arm and hand) and the trailing edge back to the body
  const back = { x: rx - f * span * 0.3, y: ry + 8 };
  const outline = (grow: number) => {
    ctx.beginPath();
    ctx.moveTo(rx, ry - grow);
    ctx.lineTo(ex, ey - grow);
    ctx.lineTo(tx - f * grow, ty);
    if (style === 'bat') {
      // scalloped membrane between the fingers
      const n = 3;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const px = tx + (back.x - tx) * u;
        const py = ty + (back.y - ty) * u;
        const cx = tx + (back.x - tx) * (u - 0.5 / n) + f * 2;
        const cy = ty + (back.y - ty) * (u - 0.5 / n) - 5;
        ctx.quadraticCurveTo(cx, cy, px, py + grow);
      }
    } else {
      ctx.lineTo(back.x, back.y + grow);
    }
    ctx.lineTo(rx, ry + 4 + grow);
    ctx.closePath();
  };
  ctx.fillStyle = INK;
  outline(1);
  ctx.fill();
  ctx.fillStyle = dark;
  outline(0);
  ctx.fill();
  // mid tone over the inner half, light along the leading edge
  ctx.save();
  outline(0);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(ex, ey);
  ctx.lineTo(tx, ty);
  ctx.lineTo((tx + back.x) / 2, (ty + back.y) / 2 - 3);
  ctx.lineTo(rx, ry + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = light;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(ex, ey);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  if (style === 'bat') {
    // finger bones
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    for (const u of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(tx + (back.x - tx) * u, ty + (back.y - ty) * u);
      ctx.stroke();
    }
  } else {
    // primaries: separated feather tips, darker between
    ctx.strokeStyle = style === 'bronze' ? shade(dark, -0.3) : INK;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const u = i / 5;
      const fx = ex + (tx - ex) * u;
      const fy = ey + (ty - ey) * u;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + (back.x - fx) * 0.45, fy + (back.y - fy) * 0.45);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function hexRgb(c: string): [number, number, number] {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(c: string, amt: number): string {
  if (!c.startsWith('#')) return c;
  const [r, g, b] = hexRgb(c);
  const m = (v: number) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function paintFlyer(ctx: Ctx, faction: Faction, x: number, y: number, f: number, nowMs: number): void {
  if (faction === 'army') {
    // jetpack: twin nozzles, a flame that flares when climbing and gutters when coasting
    const t = motion('jet-army', x, y, nowMs);
    const thrust = Math.max(0.4, Math.min(1.4, 0.8 - t.vy / 250));
    const nx = Math.round(x - f * 9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const dx of [-3, 3]) {
      const fl = (8 + Math.random() * 7) * thrust;
      const g = ctx.createLinearGradient(0, y - 18, 0, y - 18 + fl + 10);
      g.addColorStop(0, '#fff3b0');
      g.addColorStop(0.4, '#ffb02e');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(nx + dx - 2.5, y - 18);
      ctx.lineTo(nx + dx + 2.5, y - 18);
      ctx.lineTo(nx + dx - f * t.vx * 0.01, y - 18 + fl + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.fillRect(nx - 6, y - 37, 12, 20);
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(nx - 5, y - 36, 10, 18);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(nx - 5, y - 36, 4, 18);
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(nx - 4, y - 35, 2, 16);
    ctx.fillStyle = INK;
    ctx.fillRect(nx - 5, y - 19, 4, 2);
    ctx.fillRect(nx + 1, y - 19, 4, 2);
    return;
  }
  if (faction === 'void') {
    // a hover disc under the feet that tilts with the drift, chasing lights and a beam
    const t = motion('jet-void', x, y, nowMs);
    const tilt = Math.max(-0.25, Math.min(0.25, t.vx / 800));
    glow(ctx, x, y + 6, 18, 'rgba(240,171,252,0.5)');
    ctx.save();
    ctx.translate(x, y + 1);
    ctx.rotate(tilt);
    ctx.fillStyle = INK;
    ctx.fillRect(-16, -3, 32, 8);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-15, -2, 30, 6);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-15, -2, 30, 2);
    for (let i = 0; i < 5; i++) {
      const on = (Math.floor(nowMs / 90) + i) % 5 === 0;
      ctx.fillStyle = on ? '#f0abfc' : '#67e8f9';
      ctx.fillRect(-11 + i * 5, 2, 2, 2);
    }
    ctx.restore();
    return;
  }
  const t = motion(`jet-${faction}`, x, y, nowMs);
  const a = beat(t, faction === 'demon' ? 4.2 : faction === 'pharaoh' ? 9 : 3.4);
  const tones: Record<Exclude<Faction, 'army' | 'void'>, [string, string, string]> = {
    pharaoh: ['#0b4f49', '#0f766e', '#5eead4'], // scarab wings, iridescent
    norse: ['#0b0f17', '#1f2937', '#4b5563'], // raven feathers
    olympus: ['#5b2a0b', '#92400e', '#e0a040'], // harpy feathers
    demon: ['#2a0a0f', '#5b1018', '#9b2c2c'], // bat wings
  };
  const style: WingStyle = faction === 'demon' ? 'bat' : faction === 'pharaoh' ? 'scarab' : 'feather';
  const span = faction === 'pharaoh' ? 26 : 34;
  const bx = x - f * 4;
  const by = y - 32;
  // far wing a little behind and out of phase, then the near wing
  wing(ctx, bx + f * 2, by - 1, f, a * 0.85 + 0.1, span * 0.9, style, tones[faction], true);
  wing(ctx, bx, by, f, a, span, style, tones[faction], false);
}

/** Themed small flyers ('drone' troopers) for every faction except the army. */
export function drawCritter(
  ctx: Ctx,
  faction: Faction,
  x: number,
  y: number,
  f: number,
  flash: boolean,
  nowMs: number,
): void {
  // the demon wisp is fire (pure light); the other critters are lit like bodies
  if (faction === 'demon' || faction === 'army') paintCritter(ctx, faction, x, y, f, flash, nowMs);
  else
    litEnemy(ctx, { x: x - 34, y: y - 44, w: 68, h: 52 }, (g) =>
      paintCritter(g, faction, x, y, f, flash, nowMs),
    );
}

function paintCritter(
  ctx: Ctx,
  faction: Faction,
  x: number,
  y: number,
  f: number,
  flash: boolean,
  nowMs: number,
): void {
  const t = motion(`critter-${faction}`, x, y, nowMs);
  const hit = (c: string): string => (flash ? '#ffffff' : c);
  const bank = bankOf(t, f);
  const cy = y - 10;
  switch (faction) {
    case 'pharaoh': {
      // a flying scarab: domed shell, gold midline, a blur of wings, legs tucked
      const a = beat(t, 11);
      ctx.save();
      ctx.translate(x, cy);
      ctx.rotate(bank * f);
      wing(ctx, -f * 2, -4, f, a * 0.7 + 0.4, 18, 'scarab', ['#0b4f49', '#0f766e', '#5eead4'], true);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#0b4f49');
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#0f766e');
      ctx.beginPath();
      ctx.ellipse(f * 1, -1.5, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(f * 2 - 3, -5, 5, 1.5);
      ctx.fillStyle = '#d4a017';
      ctx.fillRect(-0.5, -7, 1.5, 13);
      ctx.fillStyle = INK;
      for (const lx of [-5, 0, 5]) ctx.fillRect(lx, 6, 1.2, 3);
      ctx.fillStyle = '#a3e635';
      ctx.fillRect(f * 9 - 1, -3, 3, 3);
      wing(ctx, 0, -5, f, a, 20, 'scarab', ['#0b4f49', '#0f766e', '#5eead4'], false);
      ctx.restore();
      return;
    }
    case 'norse': {
      // a raven: wedge tail, hooked beak, real wing beats, banking into its turns
      const a = beat(t, 3.6);
      ctx.save();
      ctx.translate(x, cy - a * 1.5); // the body rises on the downstroke
      ctx.rotate(bank * f);
      wing(ctx, -f * 1, -3, f, a * 0.85 + 0.1, 22, 'feather', ['#0b0f17', '#1f2937', '#4b5563'], true);
      // tail
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(-f * 6, -2);
      ctx.lineTo(-f * 17, -5);
      ctx.lineTo(-f * 17, 3);
      ctx.lineTo(-f * 6, 3);
      ctx.fill();
      // body
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#1f2937');
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#374151';
      ctx.fillRect(-5, -4, 9, 1.5);
      // head and beak
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(f * 9, -3, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#1f2937');
      ctx.beginPath();
      ctx.arc(f * 9, -3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(f * 12, -4);
      ctx.lineTo(f * 17, -2);
      ctx.lineTo(f * 12, -1);
      ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(f * 10, -4.5, 1.5, 1.5);
      wing(ctx, 0, -3, f, a, 24, 'feather', ['#0b0f17', '#1f2937', '#4b5563'], false);
      ctx.restore();
      return;
    }
    case 'olympus': {
      // a bronze owl automaton: round body, big glass eyes, riveted wings that beat stiffly
      const a = beat(t, 3);
      ctx.save();
      ctx.translate(x, cy - 4 - a);
      ctx.rotate(bank * f * 0.6);
      wing(ctx, -f * 2, -4, f, a * 0.8, 18, 'bronze', ['#5b3a12', '#8a5a1c', '#e0b44a'], true);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#8a5a1c');
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#b7791f');
      ctx.beginPath();
      ctx.ellipse(f * 1.5, -1, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e0b44a';
      ctx.fillRect(-4, -9, 8, 2);
      // ear tufts and eyes
      ctx.fillStyle = INK;
      ctx.fillRect(-7, -12, 3, 4);
      ctx.fillRect(4, -12, 3, 4);
      for (const ex of [-3, 3]) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(ex + f, -4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#93c5fd';
        ctx.beginPath();
        ctx.arc(ex + f, -4, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ex + f - 1, -5.5, 1, 1);
      }
      ctx.fillStyle = '#7c4a12';
      for (let i = 0; i < 3; i++) ctx.fillRect(-3 + i * 2.5, 3 + (i % 2), 1.5, 1.5);
      wing(ctx, 0, -4, f, a, 20, 'bronze', ['#5b3a12', '#8a5a1c', '#e0b44a'], false);
      ctx.restore();
      return;
    }
    case 'void': {
      // a probe saucer that tilts into its drift, a glass canopy and a scanning eye
      const tilt = Math.max(-0.35, Math.min(0.35, t.vx / 500));
      ctx.save();
      ctx.translate(x, cy);
      ctx.rotate(tilt);
      ctx.fillStyle = 'rgba(165,243,252,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, -5, 6, 5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -8, 2, 1.5);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hit('#64748b');
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-11, -2, 22, 1.4);
      for (let i = 0; i < 5; i++) {
        const on = (Math.floor(nowMs / 100) + i) % 5 === 0;
        ctx.fillStyle = on ? '#f0abfc' : '#67e8f9';
        ctx.fillRect(-9 + i * 4.5, 1, 1.6, 1.6);
      }
      ctx.restore();
      const sweep = Math.sin(nowMs / 260) * 3;
      glow(ctx, x + f * 2 + sweep, y - 4, 7, 'rgba(74,222,128,0.8)');
      return;
    }
    default: {
      // demon fire wisp: a burning core with a flame tail streaming away from where it flies
      const sp = Math.hypot(t.vx, t.vy);
      const ux = sp > 5 ? -t.vx / sp : -f * 0.3;
      const uy = sp > 5 ? -t.vy / sp : 0.8;
      const len = 10 + Math.min(18, sp * 0.06);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 4; i >= 0; i--) {
        const u = i / 4;
        const fl = Math.sin(nowMs / 60 + i * 1.3) * 2.5 * u;
        const px = x + ux * len * u - uy * fl;
        const py = y - 8 + uy * len * u + ux * fl - u * 4;
        const r = 9 - u * 5;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2);
        g.addColorStop(0, i === 0 ? (flash ? '#ffffff' : '#fde68a') : '#fb923c');
        g.addColorStop(0.5, 'rgba(220,38,38,0.8)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(x + f * 3) - 4, Math.round(y - 11), 3, 3);
      ctx.fillRect(Math.round(x + f * 3) + 2, Math.round(y - 11), 3, 3);
      ctx.fillStyle = '#fff7d6';
      ctx.fillRect(Math.round(x + f * 3) - 3, Math.round(y - 11), 1, 1);
      ctx.fillRect(Math.round(x + f * 3) + 3, Math.round(y - 11), 1, 1);
    }
  }
}

/** Themed fixed guns ('turret' troopers): cobra statue, rune totem, stone lion, skull totem, plasma pod. */
export function drawTotem(
  ctx: Ctx,
  faction: Faction,
  x: number,
  y: number,
  angle: number,
  flash: boolean,
): void {
  litEnemy(ctx, { x: x - 26, y: y - 50, w: 52, h: 52 }, (g) => paintTotem(g, faction, x, y, angle, flash));
}

function paintTotem(ctx: Ctx, faction: Faction, x: number, y: number, angle: number, flash: boolean): void {
  const hit = (c: string): string => (flash ? '#ffffff' : c);
  const body: Record<Exclude<Faction, 'army'>, [string, string, string]> = {
    pharaoh: ['#c9a46a', '#9a7444', '#a3e635'],
    norse: ['#6b7280', '#4b5563', '#38bdf8'],
    olympus: ['#e2ddd0', '#b8b1a1', '#93c5fd'],
    demon: ['#3b1f1c', '#1c1416', '#f97316'],
    void: ['#355e3b', '#1a2e1d', '#4ade80'],
  };
  const [main, dark, eye] = body[faction as Exclude<Faction, 'army'>];
  // plinth
  ctx.fillStyle = INK;
  ctx.fillRect(x - 15, y - 14, 30, 14);
  ctx.fillStyle = hit(dark);
  ctx.fillRect(x - 14, y - 13, 28, 12);
  // head that turns to aim (a cobra hood, a rune pillar, a lion, a skull, a pod)
  ctx.save();
  ctx.translate(x, y - 22);
  ctx.rotate(angle);
  ctx.fillStyle = INK;
  ctx.fillRect(-10, -10, 26, 20);
  ctx.fillStyle = hit(main);
  ctx.fillRect(-9, -9, 24, 18);
  ctx.fillStyle = dark;
  ctx.fillRect(-9, 5, 24, 4);
  ctx.fillStyle = eye;
  ctx.fillRect(9, -4, 6, 6);
  ctx.restore();
  if (faction === 'pharaoh' || faction === 'demon') {
    // hood / horns behind the head
    ctx.fillStyle = hit(faction === 'pharaoh' ? '#1d4ed8' : '#e7e5e4');
    ctx.fillRect(x - 13, y - 38, 5, 10);
    ctx.fillRect(x + 8, y - 38, 5, 10);
  }
  glow(ctx, x + Math.cos(angle) * 14, y - 22 + Math.sin(angle) * 14, 8, `${eye}aa`);
}
