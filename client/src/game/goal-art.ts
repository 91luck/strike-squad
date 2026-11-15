import type { GoalSnapshot } from '@strikesquad/shared';
import type { GoalText } from '../story';

/**
 * The stage goals in the world (Sim stage goals, story.ts GOAL_TEXT): what a captive, a target or a hold spot looks
 * like in each stage. A spirit in a ring of fire, a lost light, a prisoner's cage; a storm totem, a true mirror, a
 * golden lock (with its health); the shrine fire or war banner of a hold, with its bar filling round it. World
 * coordinates, a little light and motion each.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function glow(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function drawGoal(ctx: Ctx, g: GoalSnapshot, look: GoalText['look'], nowMs: number): void {
  const t = nowMs / 1000;
  for (let i = 0; i + 2 < g.it.length; i += 3) {
    const x = g.it[i] as number;
    const y = (g.it[i + 1] as number) + Math.sin(t * 2 + i) * 3;
    const hp = (g.it[i + 2] as number) / 100;
    ctx.save();
    switch (look) {
      case 'spirit':
        // a little deer-spirit of light in a ring of fire
        glow(ctx, x, y, 40, 'rgba(255,140,40,0.45)');
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU + t * 2;
          ctx.fillStyle = k % 2 ? '#f97316' : '#fbbf24';
          ctx.beginPath();
          ctx.ellipse(
            x + Math.cos(a) * 20,
            y + Math.sin(a) * 8 + 10,
            3,
            6 + Math.sin(t * 9 + k) * 2,
            0,
            0,
            TAU,
          );
          ctx.fill();
        }
        glow(ctx, x, y - 4, 18, 'rgba(220,255,240,0.9)');
        ctx.fillStyle = '#ecfdf5';
        ctx.beginPath();
        ctx.ellipse(x, y, 8, 6, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#ecfdf5';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 5, y - 5);
        ctx.lineTo(x + 8, y - 13);
        ctx.lineTo(x + 11, y - 10);
        ctx.moveTo(x + 8, y - 13);
        ctx.lineTo(x + 6, y - 16);
        ctx.stroke();
        break;
      case 'light':
        glow(ctx, x, y, 34, 'rgba(255,214,120,0.6)');
        ctx.fillStyle = '#fff7d6';
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.quadraticCurveTo(x + 7, y - 2, x, y + 6);
        ctx.quadraticCurveTo(x - 7, y - 2, x, y - 12);
        ctx.fill();
        break;
      case 'cage': {
        // a prisoner in a hanging iron cage
        ctx.strokeStyle = '#3f3f46';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 60);
        ctx.lineTo(x, y - 24);
        ctx.stroke();
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(x, y - 4, 7, 0, TAU);
        ctx.fill();
        ctx.fillRect(x - 6, y + 3, 12, 14);
        ctx.strokeStyle = '#52525b';
        ctx.lineWidth = 2.2;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(x + k * 6, y - 22);
          ctx.lineTo(x + k * 7, y + 20);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.ellipse(x, y - 22, 13, 4, 0, 0, TAU);
        ctx.ellipse(x, y + 20, 15, 4, 0, 0, TAU);
        ctx.stroke();
        glow(ctx, x, y, 30, 'rgba(250,204,21,0.18)');
        break;
      }
      case 'totem':
      case 'mirror':
      case 'lock': {
        const c = look === 'totem' ? '#64748b' : look === 'mirror' ? '#c4b5fd' : '#d4a017';
        const lite = look === 'totem' ? '#a5f3fc' : look === 'mirror' ? '#f5d0fe' : '#fde68a';
        glow(
          ctx,
          x,
          y,
          44,
          look === 'totem'
            ? 'rgba(125,211,252,0.35)'
            : look === 'mirror'
              ? 'rgba(232,121,249,0.35)'
              : 'rgba(250,204,21,0.35)',
        );
        if (look === 'totem') {
          // a carved storm pole with crackling eyes
          ctx.fillStyle = c;
          ctx.fillRect(x - 9, y - 26, 18, 52);
          ctx.fillStyle = '#334155';
          for (let k = 0; k < 3; k++) ctx.fillRect(x - 11, y - 22 + k * 17, 22, 4);
          ctx.fillStyle = lite;
          ctx.fillRect(x - 6, y - 16, 4, 3);
          ctx.fillRect(x + 2, y - 16, 4, 3);
          ctx.strokeStyle = lite;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y - 30);
          ctx.lineTo(x - 5 + Math.sin(t * 20) * 3, y - 40);
          ctx.lineTo(x + 3, y - 46);
          ctx.stroke();
        } else if (look === 'mirror') {
          // an oval looking-glass on a stand, light sweeping its face
          ctx.fillStyle = '#a16207';
          ctx.beginPath();
          ctx.ellipse(x, y - 4, 15, 22, 0, 0, TAU);
          ctx.fill();
          const g2 = ctx.createLinearGradient(x - 12, y - 24, x + 12, y + 16);
          g2.addColorStop(0, '#f5d0fe');
          g2.addColorStop(((t * 0.5) % 1) * 0.8 + 0.1, '#ffffff');
          g2.addColorStop(1, '#a78bfa');
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.ellipse(x, y - 4, 11, 18, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#a16207';
          ctx.fillRect(x - 2, y + 16, 4, 10);
        } else {
          // a great golden padlock with a wheel on its face
          ctx.strokeStyle = '#a16207';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(x, y - 12, 10, Math.PI, TAU);
          ctx.stroke();
          ctx.fillStyle = c;
          ctx.fillRect(x - 15, y - 12, 30, 26);
          ctx.strokeStyle = '#7c2d12';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y + 1, 7, 0, TAU);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + t;
            ctx.moveTo(x, y + 1);
            ctx.lineTo(x + Math.cos(a) * 7, y + 1 + Math.sin(a) * 7);
          }
          ctx.stroke();
        }
        // its health
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x - 18, y - 52, 36, 5);
        ctx.fillStyle = hp > 0.4 ? '#fbbf24' : '#ef4444';
        ctx.fillRect(x - 17, y - 51, 34 * hp, 3);
        break;
      }
      default:
        break;
    }
    // a marker over it so it is never missed
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    const my = y - (look === 'cage' ? 72 : 58) + Math.sin(t * 4) * 3;
    ctx.moveTo(x - 6, my - 8);
    ctx.lineTo(x + 6, my - 8);
    ctx.lineTo(x, my);
    ctx.fill();
    ctx.restore();
  }
  if (g.z) {
    // the hold spot: its fire or banner, and its bar filling round it
    const [x, y, k] = g.z;
    ctx.save();
    glow(ctx, x, y - 30, 90, look === 'shrine' ? 'rgba(255,150,60,0.35)' : 'rgba(239,68,68,0.25)');
    if (look === 'shrine') {
      ctx.fillStyle = '#57534e';
      ctx.fillRect(x - 16, y - 18, 32, 18);
      ctx.fillStyle = '#78716c';
      ctx.fillRect(x - 20, y - 22, 40, 5);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#f97316' : '#fde047';
        ctx.beginPath();
        ctx.ellipse(x - 8 + i * 5, y - 30 - k * 10, 4, 10 + k * 12 + Math.sin(t * 10 + i) * 3, 0, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#3f2a14';
      ctx.fillRect(x - 2, y - 80, 4, 80);
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 78);
      ctx.lineTo(x + 34 + Math.sin(t * 3) * 3, y - 70);
      ctx.lineTo(x + 30 + Math.sin(t * 3 + 1) * 3, y - 54);
      ctx.lineTo(x + 2, y - 50);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y - 30, 46, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y - 30, 46, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    // the edge of the ground to hold
    ctx.strokeStyle = 'rgba(253,224,71,0.35)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 300, y);
    ctx.lineTo(x + 300, y);
    ctx.stroke();
    ctx.restore();
  }
}
