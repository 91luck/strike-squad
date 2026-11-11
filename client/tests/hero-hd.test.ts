import { describe, expect, it } from 'vitest';
import { HD_FEET, HD_H, HD_POSES, anklesOf } from '../src/game/hero-hd';
import { RUN_FRAMES } from '../src/game/sprites';

// The boot sole sits about 4 px under the ankle, and the frame ends at HD_H.
const SOLE = 4;

describe('high-definition hero skeleton', () => {
  it('no pose pushes a foot through the ground or out of the frame', () => {
    for (const pose of HD_POSES) {
      if (pose === 'down') continue; // drawn lying down from the falling pose
      for (let f = 0; f < RUN_FRAMES; f++) {
        const { front, back } = anklesOf(pose, f);
        for (const a of [front, back]) {
          expect(a.y + SOLE, `${pose} ${f}`).toBeLessThanOrEqual(HD_FEET + 2);
          expect(a.y + SOLE).toBeLessThan(HD_H);
        }
      }
    }
  });

  it('standing and running poses keep a foot on the ground', () => {
    for (const pose of ['idle', 'run', 'crouch'] as const)
      for (let f = 0; f < RUN_FRAMES; f++) {
        const { front, back } = anklesOf(pose, f);
        expect(HD_FEET - (Math.max(front.y, back.y) + SOLE), `${pose} ${f}`).toBeLessThanOrEqual(6);
      }
  });
});
