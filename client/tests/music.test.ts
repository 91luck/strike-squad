import { describe, expect, it } from 'vitest';
import { Music } from '../src/audio/music';

/** A tiny stand-in for WebAudio: records what the score starts, so the scheduler can be checked without sound. */
function fakeAudio(): { ctx: AudioContext; out: AudioNode; started: string[]; advance(s: number): void } {
  const started: string[] = [];
  let now = 0;
  const param = (): AudioParam =>
    ({
      value: 0,
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: () => undefined,
      setTargetAtTime: () => undefined,
      cancelScheduledValues: () => undefined,
    }) as unknown as AudioParam;
  const node = (kind: string): Record<string, unknown> => ({
    connect: (n: unknown) => n,
    start: () => started.push(kind),
    stop: () => undefined,
    frequency: param(),
    detune: param(),
    gain: param(),
    Q: param(),
    type: '',
    buffer: null,
  });
  const ctx = {
    get currentTime() {
      return now;
    },
    state: 'running',
    sampleRate: 8000,
    createGain: () => node('gain'),
    createOscillator: () => node('osc'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  } as unknown as AudioContext;
  return { ctx, out: node('out') as unknown as AudioNode, started, advance: (s) => (now += s) };
}

const tick = (m: Music): void => (m as unknown as { tick(): void }).tick();

describe('music', () => {
  it('plays nothing until sound is allowed, then schedules drone, drums and melody ahead of time', () => {
    let audio: ReturnType<typeof fakeAudio> | null = null;
    const m = new Music(() => audio);
    m.play('stage', 1);
    tick(m); // no audio yet: nothing to do, nothing thrown
    audio = fakeAudio();
    for (let i = 0; i < 40; i++) {
      tick(m);
      audio.advance(0.05);
    }
    expect(audio.started.filter((k) => k === 'osc').length).toBeGreaterThan(20);
    expect(audio.started).toContain('noise'); // the tabla
  });

  it('a boss fight drums harder than the stage, and the menu has no drums at all', () => {
    const count = (mood: 'menu' | 'stage' | 'boss'): number => {
      const a = fakeAudio();
      const m = new Music(() => a);
      m.play(mood, 4);
      for (let i = 0; i < 80; i++) {
        tick(m);
        a.advance(0.05);
      }
      return a.started.filter((k) => k === 'noise').length;
    };
    expect(count('menu')).toBe(0);
    expect(count('boss')).toBeGreaterThan(count('stage'));
  });

  it('switched off, it schedules nothing', () => {
    const a = fakeAudio();
    const m = new Music(() => a);
    m.setEnabled(false);
    m.play('stage', 2);
    for (let i = 0; i < 20; i++) {
      tick(m);
      a.advance(0.05);
    }
    expect(a.started.filter((k) => k === 'osc')).toHaveLength(0);
  });
});
