import { heroOf, type HeroDef } from '@strikesquad/shared';

/**
 * Pixel-art sprite factory. Every sprite is *drawn by code* onto a small offscreen canvas (one canvas pixel = one
 * world pixel), shaded with a light-from-top-left palette, then given a 1 px dark outline automatically - the
 * finishing touch that makes pixel art read cleanly at any zoom. Sprites are built lazily and cached, so the per-frame
 * cost is a single `drawImage`.
 *
 * All characters are original designs.
 */

export type Pose = 'idle' | 'run' | 'jump' | 'fall' | 'crouch' | 'down' | 'slide' | 'dash' | 'melee' | 'flip';
export type Aim = 'f' | 'uf' | 'u' | 'df' | 'd';

export const SPRITE_W = 48;
export const SPRITE_H = 50;
/** Feet line and centre inside a character sprite canvas. */
export const FEET_Y = 48;
export const CENTER_X = 20;
export const RUN_FRAMES = 8;

const OUTLINE = '#120f17';

export interface Look {
  color: string;
  shade: string;
  skin: string;
  hair: string;
  pants: string;
  accent: string;
  headgear: HeroDef['headgear'] | 'gasmask';
  beard?: boolean;
  vest: string;
}

export const ENEMY_LOOK: Look = {
  color: '#6b7280',
  shade: '#454b55',
  skin: '#c7a17a',
  hair: '#222',
  pants: '#2f333a',
  accent: '#ff2d2d',
  headgear: 'gasmask',
  vest: '#34383f',
};

/** Enemy variants: same trooper, different kit colours so each type reads at a glance. */
export const SHIELD_LOOK: Look = {
  ...ENEMY_LOOK,
  color: '#3f4b5c',
  shade: '#2a3340',
  vest: '#1f2731',
  accent: '#38bdf8',
};
export const JET_LOOK: Look = {
  ...ENEMY_LOOK,
  color: '#7c4a2d',
  shade: '#5a3420',
  vest: '#3b2a1e',
  accent: '#ffb02e',
};
export const GRENADIER_LOOK: Look = {
  ...ENEMY_LOOK,
  color: '#556b2f',
  shade: '#3d4d22',
  vest: '#2f3a1c',
  accent: '#a3e635',
};

export function heroLook(id: number): Look {
  const h = heroOf(id);
  return { ...h, vest: '#3d4434' };
}

// ------------------------------------------------------------------ colour helpers

function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g) ?? ['0', '0', '0'];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a colour, -1..1. */
export function tone(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number): number =>
    Math.round(Math.max(0, Math.min(255, amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ------------------------------------------------------------------ pixel canvas

class Px {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    const g = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
  }

  r(x: number, y: number, w: number, h: number, c: string): void {
    this.g.fillStyle = c;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  dot(x: number, y: number, c: string): void {
    this.r(x, y, 1, 1, c);
  }

  /** Fill pixels for which `shape(u, v)` returns a colour, with (u, v) = coordinates rotated by `angle` about (px, py). */
  rotated(
    px: number,
    py: number,
    angle: number,
    radius: number,
    shape: (u: number, v: number) => string | null,
  ): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let y = Math.floor(py - radius); y <= py + radius; y++)
      for (let x = Math.floor(px - radius); x <= px + radius; x++) {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        const dx = x + 0.5 - px;
        const dy = y + 0.5 - py;
        const col = shape(dx * c + dy * s, -dx * s + dy * c);
        if (col) this.dot(x, y, col);
      }
  }

  /** 1-px outline around every opaque pixel (4-neighbourhood), the classic pixel-art finish. */
  outline(color = OUTLINE): HTMLCanvasElement {
    const img = this.g.getImageData(0, 0, this.w, this.h);
    const d = img.data;
    const [r, g, b] = hexToRgb(color);
    const solid = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.w && y < this.h && (d[(y * this.w + x) * 4 + 3] as number) > 100;
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)))
          add.push((y * this.w + x) * 4);
    for (const i of add) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
    this.g.putImageData(img, 0, 0);
    return this.canvas;
  }
}

// ------------------------------------------------------------------ characters

const AIM_ANGLE: Record<Aim, number> = {
  f: 0,
  uf: -Math.PI / 4,
  u: -Math.PI / 2,
  df: Math.PI / 4,
  d: Math.PI / 2,
};

export interface CharFrame {
  img: HTMLCanvasElement;
  /** Muzzle position relative to the feet centre (facing right). */
  muzzleX: number;
  muzzleY: number;
}

const cache = new Map<string, CharFrame>();

export function aimFrom(ax: number, ay: number): Aim {
  if (ay < 0) return ax === 0 ? 'u' : 'uf';
  if (ay > 0) return ax === 0 ? 'd' : 'df';
  return 'f';
}

/** A character frame, facing right. */
export function charFrame(lookKey: string, look: Look, pose: Pose, frame: number, aim: Aim): CharFrame {
  const key = `${lookKey}|${pose}|${frame}|${aim}`;
  let f = cache.get(key);
  if (!f) {
    f = drawCharacter(look, pose, frame, aim);
    cache.set(key, f);
  }
  return f;
}

function drawLeg(
  p: Px,
  L: Look,
  hipX: number,
  hipY: number,
  footDx: number,
  lift: number,
  back: boolean,
): void {
  const footY = FEET_Y - 4 - lift;
  const pants = back ? tone(L.pants, -0.25) : L.pants;
  const rows = Math.max(1, footY - hipY);
  for (let y = hipY; y < footY; y++) {
    const t = (y - hipY) / rows;
    const x = hipX + Math.round(footDx * t);
    p.r(x, y, 5, 1, pants);
    p.dot(x, y, tone(pants, -0.25));
    if (!back) p.dot(x + 3, y, tone(pants, 0.15));
  }
  // knee pad
  const kneeY = hipY + Math.round(rows * 0.5);
  p.r(hipX + Math.round(footDx * 0.5), kneeY, 5, 2, back ? '#2a2a2a' : '#3a3a3a');
  // boot
  const bx = hipX + footDx;
  const boot = back ? '#1e1b18' : '#2b2622';
  p.r(bx, footY, 6, 4, boot);
  p.r(bx + 1, footY, 4, 1, tone(boot, 0.25));
  p.r(bx, footY + 3, 7, 1, '#141210');
}

function drawHead(p: Px, L: Look, hx: number, hy: number): void {
  // neck
  p.r(hx + 3, hy + 10, 5, 2, tone(L.skin, -0.2));
  // face block 11x11 with rounded corners
  p.r(hx, hy + 1, 11, 9, L.skin);
  p.r(hx + 1, hy, 9, 11, L.skin);
  p.r(hx, hy + 1, 2, 9, tone(L.skin, -0.18)); // shade at the back of the head
  p.r(hx + 9, hy + 2, 1, 6, tone(L.skin, 0.12)); // light on the face
  // jaw shadow
  p.r(hx + 2, hy + 10, 8, 1, tone(L.skin, -0.22));
  // ear
  p.r(hx + 3, hy + 5, 2, 2, tone(L.skin, -0.14));
  // eye + brow
  p.r(hx + 7, hy + 5, 2, 2, '#1a1418');
  p.dot(hx + 8, hy + 5, '#ffffff');
  p.r(hx + 6, hy + 4, 4, 1, tone(L.hair, 0.05));
  // mouth
  p.r(hx + 8, hy + 8, 2, 1, tone(L.skin, -0.35));
  if (L.beard) {
    p.r(hx + 3, hy + 7, 8, 4, L.hair);
    p.r(hx + 4, hy + 11, 6, 1, L.hair);
    p.r(hx + 8, hy + 8, 2, 1, tone(L.hair, -0.4));
  }
  switch (L.headgear) {
    case 'bandana':
      // spiky hair
      p.r(hx - 1, hy - 3, 12, 5, L.hair);
      for (let i = 0; i < 5; i++) p.r(hx - 1 + i * 3, hy - 5 + (i % 2), 2, 3, L.hair);
      p.r(hx - 1, hy + 1, 3, 6, L.hair);
      // bandana with tails
      p.r(hx - 1, hy + 1, 13, 3, L.color);
      p.r(hx - 1, hy + 1, 13, 1, tone(L.color, 0.3));
      p.r(hx - 5, hy + 2, 4, 2, L.shade);
      p.r(hx - 8, hy + 3, 4, 2, L.color);
      break;
    case 'visor':
      p.r(hx - 1, hy - 2, 13, 6, L.color);
      p.r(hx, hy - 3, 11, 2, tone(L.color, 0.2));
      p.r(hx - 1, hy + 2, 3, 4, L.shade);
      p.r(hx + 5, hy + 3, 7, 3, L.accent);
      p.r(hx + 6, hy + 3, 3, 1, tone(L.accent, 0.6));
      // ponytail
      p.r(hx - 4, hy + 2, 4, 3, L.hair);
      p.r(hx - 6, hy + 4, 3, 5, L.hair);
      break;
    case 'beret':
      p.r(hx - 1, hy - 1, 12, 4, L.color);
      p.r(hx - 2, hy - 3, 11, 3, L.color);
      p.r(hx - 2, hy - 3, 6, 1, tone(L.color, 0.3));
      p.r(hx + 9, hy, 2, 2, '#e9c46a');
      p.r(hx - 1, hy + 3, 2, 3, L.hair);
      break;
    case 'hood':
      p.r(hx - 2, hy - 3, 14, 8, L.color);
      p.r(hx - 2, hy - 3, 14, 2, tone(L.color, 0.25));
      p.r(hx - 2, hy + 5, 4, 7, L.shade);
      p.r(hx + 5, hy + 7, 6, 4, '#1c1726'); // face mask
      p.r(hx + 6, hy + 4, 4, 2, L.accent);
      p.dot(hx + 8, hy + 4, '#ffffff');
      break;
    case 'hardhat':
      p.r(hx - 2, hy - 1, 15, 3, L.color);
      p.r(hx, hy - 4, 11, 4, L.color);
      p.r(hx + 1, hy - 4, 6, 1, tone(L.color, 0.35));
      p.r(hx + 4, hy - 3, 2, 3, L.shade);
      p.r(hx + 2, hy - 2, 7, 2, L.accent); // goggles on the hat
      p.r(hx - 1, hy + 2, 2, 4, L.hair);
      break;
    case 'helmet':
      p.r(hx - 2, hy - 3, 14, 10, '#d9dee5');
      p.r(hx - 2, hy - 3, 14, 2, '#ffffff');
      p.r(hx - 2, hy + 3, 3, 5, '#a9b2bd');
      p.r(hx + 4, hy + 2, 8, 5, '#0b3c49');
      p.r(hx + 5, hy + 2, 5, 1, L.accent);
      p.r(hx + 1, hy - 1, 2, 2, L.color);
      break;
    case 'headset':
      p.r(hx - 1, hy - 2, 12, 5, L.hair);
      p.r(hx - 2, hy + 1, 4, 8, L.hair);
      p.r(hx + 8, hy + 1, 3, 2, L.hair);
      p.r(hx + 1, hy - 3, 8, 2, L.color);
      p.r(hx - 1, hy + 3, 4, 5, L.color);
      p.r(hx, hy + 4, 2, 3, L.accent);
      p.r(hx + 6, hy + 8, 4, 1, '#333');
      break;
    case 'cap':
      p.r(hx - 1, hy - 2, 12, 4, L.color);
      p.r(hx + 8, hy + 1, 6, 2, L.shade); // peak
      p.r(hx, hy - 3, 9, 2, tone(L.color, 0.3));
      p.r(hx + 3, hy - 1, 3, 2, '#3d3d3d');
      p.r(hx - 1, hy + 2, 2, 4, L.hair);
      break;
    case 'gasmask':
      p.r(hx - 2, hy - 3, 14, 7, '#4b525c');
      p.r(hx - 2, hy - 3, 14, 2, '#6d7580');
      p.r(hx + 2, hy + 4, 9, 6, '#2c3036');
      p.r(hx + 5, hy + 4, 6, 2, L.accent);
      p.r(hx + 6, hy + 4, 2, 1, '#ffb3b3');
      p.r(hx + 8, hy + 7, 4, 3, '#1c1f24'); // filter
      break;
  }
}

function drawGun(
  p: Px,
  L: Look,
  px: number,
  py: number,
  angle: number,
  enemy: boolean,
): { mx: number; my: number } {
  const metal = enemy ? '#2a2c31' : '#2c2f37';
  const light = enemy ? '#4a4f58' : '#59606e';
  p.rotated(px, py, angle, 24, (u, v) => {
    // barrel
    if (u >= 15 && u < 22 && v >= -2.2 && v < -0.6) return u >= 21 ? '#0d0d10' : light;
    // body
    if (u >= 3 && u < 15.5 && v >= -2.8 && v < 1) {
      if (v < -1.8) return light;
      if (u >= 5 && u < 8 && v < -0.5 && !enemy) return L.color;
      return metal;
    }
    // magazine
    if (u >= 9 && u < 11.8 && v >= 1 && v < 4.8) return '#17191d';
    // hands
    if (u >= 12 && u < 14.5 && v >= 0.5 && v < 3) return L.skin;
    if (u >= 5 && u < 7.5 && v >= 0.5 && v < 3) return L.skin;
    // sleeve from the shoulder
    if (u >= -1 && u < 5.5 && v >= -1 && v < 2.5) return v < 0 ? tone(L.color, 0.15) : L.color;
    return null;
  });
  return {
    mx: px + Math.cos(angle) * 22 + Math.sin(angle) * 1.4,
    my: py + Math.sin(angle) * 22 - Math.cos(angle) * 1.4,
  };
}

function drawTorso(p: Px, L: Look, x: number, top: number, hipY: number): void {
  const h = hipY - top;
  p.r(x, top, 13, h, L.color);
  p.r(x, top, 2, h, L.shade);
  p.r(x + 11, top + 1, 1, h - 2, tone(L.color, 0.2));
  // tactical vest
  p.r(x + 2, top + 2, 9, h - 3, L.vest);
  p.r(x + 2, top + 2, 9, 1, tone(L.vest, 0.25));
  p.r(x + 3, top + 6, 3, 3, tone(L.vest, -0.3)); // pouches
  p.r(x + 7, top + 6, 3, 3, tone(L.vest, -0.3));
  p.r(x + 3, top + 6, 3, 1, tone(L.vest, 0.15));
  p.r(x + 7, top + 6, 3, 1, tone(L.vest, 0.15));
  // shoulder strap in hero colour
  p.r(x + 8, top + 1, 2, 4, L.shade);
  // belt + buckle
  p.r(x, hipY - 2, 13, 2, '#2b2620');
  p.r(x + 5, hipY - 2, 3, 2, '#d4a017');
}

function drawCharacter(L: Look, pose: Pose, frame: number, aim: Aim): CharFrame {
  const p = new Px(SPRITE_W, SPRITE_H);
  const enemy = L.headgear === 'gasmask';
  if (pose === 'down') {
    // Lying on the ground, face up, an arm reaching out.
    const y = FEET_Y;
    p.r(2, y - 5, 6, 4, '#2b2622');
    p.r(7, y - 6, 12, 5, L.pants);
    p.r(7, y - 6, 12, 1, tone(L.pants, 0.15));
    p.r(18, y - 8, 13, 7, L.color);
    p.r(19, y - 8, 10, 2, tone(L.color, 0.25));
    p.r(20, y - 7, 8, 5, L.vest);
    p.r(31, y - 10, 10, 9, L.skin);
    p.r(
      31,
      y - 10,
      10,
      3,
      L.headgear === 'helmet' ? '#d9dee5' : L.headgear === 'gasmask' ? '#4b525c' : L.color,
    );
    p.r(36, y - 5, 3, 1, '#1a1418'); // closed eye
    p.r(28, y - 14, 3, 7, L.color); // raised arm
    p.r(28, y - 17, 3, 3, L.skin);
    return { img: p.outline(), muzzleX: 0, muzzleY: -10 };
  }

  if (pose === 'slide') {
    // Low slide: legs out in front along the floor, body leaning back, gun level.
    const y = FEET_Y;
    p.r(18, y - 6, 16, 4, L.pants);
    p.r(18, y - 6, 16, 1, tone(L.pants, 0.15));
    p.r(33, y - 8, 6, 6, '#2b2622'); // boot up front
    p.r(33, y - 3, 7, 1, '#141210');
    p.r(16, y - 4, 12, 3, tone(L.pants, -0.25)); // back leg
    drawTorso(p, L, 8, y - 19, y - 4);
    drawHead(p, L, 6, y - 31);
    const m = drawGun(p, L, 14, y - 14, 0, enemy);
    // dust kicked up
    p.r(38, y - 2, 3, 2, 'rgba(190,170,140,0.9)');
    p.r(42, y - 4, 2, 2, 'rgba(190,170,140,0.7)');
    return { img: p.outline(), muzzleX: m.mx - CENTER_X, muzzleY: m.my - FEET_Y };
  }

  const crouch = pose === 'crouch';
  const bob =
    pose === 'run'
      ? frame % 4 === 1 || frame % 4 === 2
        ? -1
        : 0
      : pose === 'idle'
        ? frame === 1
          ? -1
          : 0
        : 0;
  const hipY = (crouch ? 40 : pose === 'flip' ? 30 : 34) + bob;
  const lean = pose === 'dash' ? 3 : pose === 'melee' ? 1 : 0;
  const top = hipY - 13;
  const tx = 14 + lean;

  // legs
  if (crouch) {
    p.r(9, 42, 8, 4, tone(L.pants, -0.25)); // back thigh, kneeling
    p.r(7, 44, 6, 4, '#1e1b18');
    p.r(19, 40, 9, 4, L.pants); // front thigh forward
    p.r(24, 40, 5, 4, L.pants);
    p.r(24, 44, 7, 4, '#2b2622');
    p.r(24, 47, 8, 1, '#141210');
  } else if (pose === 'run') {
    const ph = (frame / RUN_FRAMES) * Math.PI * 2;
    const swing = Math.round(Math.sin(ph) * 6);
    const liftF = Math.max(0, Math.round(Math.cos(ph) * 3));
    const liftB = Math.max(0, Math.round(-Math.cos(ph) * 3));
    drawLeg(p, L, 16, hipY, -swing, liftB, true);
    drawLeg(p, L, 18, hipY, swing, liftF, false);
  } else if (pose === 'dash') {
    drawLeg(p, L, 15, hipY, -10, 3, true); // trailing leg stretched back
    drawLeg(p, L, 19, hipY, 6, 2, false);
  } else if (pose === 'melee') {
    drawLeg(p, L, 14, hipY, -5, 0, true); // wide stance
    drawLeg(p, L, 19, hipY, 5, 0, false);
  } else if (pose === 'flip') {
    drawLeg(p, L, 15, hipY, 2, 10, true); // knees tucked up
    drawLeg(p, L, 19, hipY, 5, 9, false);
  } else if (pose === 'jump') {
    drawLeg(p, L, 15, hipY, -3, 4, true);
    drawLeg(p, L, 19, hipY, 4, 6, false);
  } else if (pose === 'fall') {
    drawLeg(p, L, 15, hipY, -2, 1, true);
    drawLeg(p, L, 19, hipY, 2, 0, false);
  } else {
    drawLeg(p, L, 15, hipY, 0, 0, true);
    drawLeg(p, L, 19, hipY, 1, 0, false);
  }

  // back arm (behind the body)
  p.r(tx - 1, top + 2, 3, 7, L.shade);
  p.r(tx - 1, top + 9, 3, 2, tone(L.skin, -0.2));

  drawTorso(p, L, tx, top, hipY);
  drawHead(p, L, tx + 1 + (pose === 'dash' ? 1 : 0), top - 12);

  if (pose === 'melee') {
    // Knife arm: frame 0 = wind-up (blade back over the shoulder), 1 = slash (arm straight out).
    const sx = tx + 8;
    const sy = top + 4;
    if (frame === 0) {
      p.r(sx - 4, sy - 6, 3, 8, L.color);
      p.r(sx - 4, sy - 8, 3, 2, L.skin);
      p.r(sx - 3, sy - 16, 2, 8, '#e5e7eb');
      p.dot(sx - 3, sy - 16, '#ffffff');
    } else {
      p.r(sx, sy, 10, 3, L.color);
      p.r(sx, sy, 10, 1, tone(L.color, 0.2));
      p.r(sx + 10, sy, 3, 3, L.skin);
      p.r(sx + 13, sy + 1, 11, 2, '#e5e7eb');
      p.r(sx + 13, sy + 1, 11, 1, '#ffffff');
      p.r(sx + 12, sy - 1, 1, 5, '#3a3a3a'); // guard
    }
    return { img: p.outline(), muzzleX: sx + 24 - CENTER_X, muzzleY: sy + 1 - FEET_Y };
  }

  const angle = crouch ? 0 : AIM_ANGLE[aim];
  const sx = aim === 'u' ? tx + 9 : tx + 7;
  const sy = top + (aim === 'u' ? 3 : 5);
  const m = drawGun(p, L, sx, sy, angle, enemy);
  return { img: p.outline(), muzzleX: m.mx - CENTER_X, muzzleY: m.my - FEET_Y };
}

// ------------------------------------------------------------------ enemies, props, pick-ups

const misc = new Map<string, HTMLCanvasElement>();
function memo(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = misc.get(key);
  if (!c) {
    c = make();
    misc.set(key, c);
  }
  return c;
}

/** Turret base (static) - the barrel is drawn separately so it can turn. Origin: bottom centre, 40x30. */
export function turretBase(): HTMLCanvasElement {
  return memo('turret', () => {
    const p = new Px(40, 30);
    // sandbag ring
    for (let i = 0; i < 4; i++) {
      p.r(2 + i * 9, 20, 9, 6, '#a68a5b');
      p.r(2 + i * 9, 20, 9, 2, '#c4a774');
      p.r(2 + i * 9, 25, 9, 1, '#7d6743');
    }
    p.r(6, 24, 28, 6, '#8d7450');
    // dome
    p.r(10, 9, 20, 12, '#5d646f');
    p.r(12, 6, 16, 4, '#5d646f');
    p.r(12, 6, 16, 2, '#818a96');
    p.r(10, 9, 3, 12, '#454b55');
    p.r(17, 12, 6, 3, '#1b1d21');
    p.r(18, 13, 4, 1, '#ff3b3b');
    // hazard stripe
    for (let i = 0; i < 5; i++) p.r(10 + i * 4, 18, 2, 3, i % 2 ? '#1b1b1b' : '#f4c430');
    return p.outline();
  });
}

export function turretBarrel(): HTMLCanvasElement {
  return memo('turret-barrel', () => {
    const p = new Px(26, 8);
    p.r(0, 1, 22, 6, '#2b2e34');
    p.r(0, 1, 22, 2, '#4e545e');
    p.r(20, 0, 6, 8, '#1a1c20');
    return p.outline();
  });
}

/** Drone, 36x22, two rotor frames. Origin: bottom centre. */
export function droneSprite(frame: number): HTMLCanvasElement {
  return memo(`drone${frame % 2}`, () => {
    const p = new Px(40, 22);
    // rotors
    const blade = frame % 2 === 0 ? 14 : 8;
    p.r(10 - blade / 2, 2, blade, 2, 'rgba(220,226,235,0.9)');
    p.r(30 - blade / 2, 2, blade, 2, 'rgba(220,226,235,0.9)');
    p.r(9, 3, 2, 5, '#3a3f47');
    p.r(29, 3, 2, 5, '#3a3f47');
    p.r(6, 7, 28, 3, '#3a3f47');
    // body
    p.r(11, 8, 18, 9, '#55606d');
    p.r(13, 7, 14, 2, '#7c8896');
    p.r(11, 15, 18, 2, '#3b434d');
    p.r(22, 10, 6, 4, '#16191d');
    p.r(23, 11, 4, 2, '#ff3030');
    p.r(24, 11, 1, 1, '#ffb0b0');
    // skids
    p.r(12, 19, 16, 1, '#2a2e34');
    p.r(14, 17, 1, 2, '#2a2e34');
    p.r(25, 17, 1, 2, '#2a2e34');
    return p.outline();
  });
}

export function weaponCrate(letter: string, color: string): HTMLCanvasElement {
  return memo(`crate-${letter}`, () => {
    const p = new Px(34, 26);
    // wings
    p.r(0, 9, 7, 3, '#d9dee5');
    p.r(27, 9, 7, 3, '#d9dee5');
    p.r(2, 12, 5, 2, '#a9b2bd');
    p.r(27, 12, 5, 2, '#a9b2bd');
    // capsule
    p.r(7, 4, 20, 18, '#b91c1c');
    p.r(9, 2, 16, 22, '#b91c1c');
    p.r(9, 2, 16, 3, '#ef4444');
    p.r(7, 4, 2, 18, '#7f1d1d');
    p.r(11, 7, 12, 12, '#fef3c7');
    p.r(11, 7, 12, 2, '#ffffff');
    // letter in pixel font
    const L: Record<string, string[]> = {
      S: ['111', '100', '111', '001', '111'],
      M: ['101', '111', '111', '101', '101'],
      L: ['100', '100', '100', '100', '111'],
    };
    const glyph = L[letter] ?? L.S!;
    glyph.forEach((row, y) =>
      row.split('').forEach((c, x) => {
        if (c === '1') p.r(13 + x * 3, 8 + y * 2, 3, 2, color);
      }),
    );
    return p.outline();
  });
}

export function medkitSprite(): HTMLCanvasElement {
  return memo('medkit', () => {
    const p = new Px(28, 22);
    p.r(9, 0, 10, 4, '#9ca3af');
    p.r(11, 1, 6, 2, '#1f2937');
    p.r(1, 4, 26, 17, '#f8fafc');
    p.r(1, 4, 26, 3, '#ffffff');
    p.r(1, 18, 26, 3, '#cbd5e1');
    p.r(11, 7, 6, 12, '#ef4444');
    p.r(7, 10, 14, 6, '#ef4444');
    p.r(11, 7, 6, 2, '#f87171');
    return p.outline();
  });
}

/** Hero head portrait (for the HUD, lobby and results), 20x20 with transparent background. */
export function heroPortrait(id: number): HTMLCanvasElement {
  return memo(`portrait-${id}`, () => {
    const p = new Px(22, 22);
    const L = heroLook(id);
    p.r(3, 15, 16, 7, L.color);
    p.r(7, 16, 8, 6, L.vest);
    drawHead(p, L, 5, 5);
    return p.outline();
  });
}
