import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FX_CELL, FX_COLS, FX_FRAMES } from '../src/game/fx-atlas';

describe('effect sprite atlas', () => {
  const png = readFileSync(new URL('../src/assets/fx-atlas.png', import.meta.url));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);

  it('every effect points at cells that exist in the picture, and no two effects share a cell', () => {
    expect(width).toBe(FX_COLS * FX_CELL);
    const cells = (width / FX_CELL) * (height / FX_CELL);
    const all = Object.values(FX_FRAMES).flat();
    for (const c of all) expect(c).toBeLessThan(cells);
    expect(new Set(all).size).toBe(all.length);
  });

  it('stays small enough for a fast first load', () => {
    expect(png.length).toBeLessThan(120 * 1024);
  });
});
