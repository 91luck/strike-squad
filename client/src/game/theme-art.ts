import type { Faction } from '@strikesquad/shared';
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

function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
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
  if (faction === 'army') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fl = 8 + Math.random() * 8;
    const g = ctx.createLinearGradient(0, y - 18, 0, y - 18 + fl + 10);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.4, '#ffb02e');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(Math.round(x - f * 9) - 3, y - 18, 6, fl + 10);
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.fillRect(Math.round(x - f * 9) - 5, y - 36, 10, 18);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(Math.round(x - f * 9) - 4, y - 35, 8, 16);
    return;
  }
  if (faction === 'void') {
    // a hover disc under the feet with a glow beam
    glow(ctx, x, y + 6, 18, 'rgba(240,171,252,0.5)');
    ctx.fillStyle = INK;
    ctx.fillRect(x - 15, y - 2, 30, 7);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 14, y - 1, 28, 4);
    ctx.fillStyle = Math.floor(nowMs / 150) % 2 ? '#f0abfc' : '#67e8f9';
    for (let i = -10; i <= 10; i += 5) ctx.fillRect(x + i, y + 3, 2, 2);
    return;
  }
  const flap = Math.sin(nowMs / (faction === 'demon' ? 70 : 90));
  const colors: Record<Exclude<Faction, 'army' | 'void'>, [string, string]> = {
    pharaoh: ['#0f766e', '#5eead4'], // scarab wings, iridescent
    norse: ['#111827', '#374151'], // raven feathers
    olympus: ['#78350f', '#d97706'], // harpy feathers
    demon: ['#3b0d14', '#7f1d1d'], // bat wings
  };
  const [dark, light] = colors[faction];
  const bx = x - f * 4;
  const by = y - 30;
  for (const side of [-1, 1]) {
    const span = 22 + flap * 6 * side;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - f * span, by - 14 - flap * 8);
    ctx.lineTo(bx - f * (span + 4), by + 4);
    ctx.lineTo(bx - f * 6, by + 10);
    ctx.fill();
    ctx.fillStyle = side < 0 ? dark : light;
    ctx.beginPath();
    ctx.moveTo(bx, by + 1);
    ctx.lineTo(bx - f * (span - 2), by - 12 - flap * 8);
    ctx.lineTo(bx - f * span, by + 3);
    ctx.lineTo(bx - f * 6, by + 8);
    ctx.fill();
  }
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
  const flap = Math.floor(nowMs / 80) % 2;
  const hit = (c: string): string => (flash ? '#ffffff' : c);
  switch (faction) {
    case 'pharaoh': {
      // a flying scarab
      ctx.fillStyle = INK;
      ctx.fillRect(x - 9, y - 15, 18, 13);
      ctx.fillStyle = hit('#0f766e');
      ctx.fillRect(x - 8, y - 14, 16, 11);
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(x - 6, y - 13, 5, 2);
      ctx.fillStyle = '#d4a017';
      ctx.fillRect(x - 1, y - 14, 2, 11);
      ctx.fillStyle = 'rgba(204,251,241,0.7)';
      ctx.fillRect(x - 15, y - (flap ? 20 : 14), 8, 4);
      ctx.fillRect(x + 7, y - (flap ? 20 : 14), 8, 4);
      ctx.fillStyle = '#a3e635';
      ctx.fillRect(x + f * 7 - 1, y - 11, 3, 3);
      return;
    }
    case 'norse': {
      // a raven
      ctx.fillStyle = INK;
      ctx.fillRect(x - 8, y - 14, 16, 9);
      ctx.fillStyle = hit('#1f2937');
      ctx.fillRect(x - 7, y - 13, 14, 7);
      ctx.fillRect(x + f * 7 - 2, y - 15, 5, 5);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x + f * 11 - 1, y - 13, 4, 2);
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(x + f * 8, y - 14, 1, 1);
      ctx.fillStyle = hit('#374151');
      ctx.fillRect(x - 14, y - (flap ? 22 : 12), 12, 4);
      ctx.fillRect(x + 2, y - (flap ? 22 : 12), 12, 4);
      return;
    }
    case 'olympus': {
      // a bronze owl automaton
      ctx.fillStyle = INK;
      ctx.fillRect(x - 8, y - 20, 16, 18);
      ctx.fillStyle = hit('#b7791f');
      ctx.fillRect(x - 7, y - 19, 14, 16);
      ctx.fillStyle = '#e0b44a';
      ctx.fillRect(x - 7, y - 19, 14, 3);
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(x - 5, y - 15, 4, 4);
      ctx.fillRect(x + 1, y - 15, 4, 4);
      ctx.fillStyle = '#7c4a12';
      ctx.fillRect(x - 13, y - (flap ? 18 : 10), 6, 8);
      ctx.fillRect(x + 7, y - (flap ? 18 : 10), 6, 8);
      return;
    }
    case 'void': {
      // a little probe saucer with a scanning eye
      ctx.fillStyle = INK;
      ctx.fillRect(x - 13, y - 12, 26, 7);
      ctx.fillStyle = hit('#94a3b8');
      ctx.fillRect(x - 12, y - 11, 24, 5);
      ctx.fillStyle = 'rgba(165,243,252,0.6)';
      ctx.fillRect(x - 6, y - 18, 12, 7);
      glow(ctx, x + f * 2, y - 4, 7, 'rgba(74,222,128,0.8)');
      return;
    }
    default: {
      // demon fire wisp
      const g = ctx.createRadialGradient(x, y - 8, 2, x, y - 8, 18);
      g.addColorStop(0, flash ? '#ffffff' : '#fde68a');
      g.addColorStop(0.5, '#dc2626');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - 8, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(x + f * 3) - 4, Math.round(y - 11), 3, 3);
      ctx.fillRect(Math.round(x + f * 3) + 2, Math.round(y - 11), 3, 3);
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
