import atlasUrl from '../assets/fx-atlas.png';
import { FX_CELL, FX_COLOURED, FX_COLS, FX_FRAMES, FX_PIXEL, type FxName } from './fx-atlas';

export type { FxName };

/**
 * Effect sprites (explosion fire, flashes, smoke, dust, sparks, muzzle flames, lightning) from Kenney's CC0
 * particle packs, plus the pixel-art blast and hit flipbooks of Ansimuz's CC0 Warped City, packed by
 * tools/build-fx-atlas.py into one 64 px-cell atlas.
 *
 * The atlas loads in the background. Until it has loaded (or if it never does, e.g. in unit tests without a DOM
 * image), `ready` is false and the renderer falls back to its plain drawn particles, so the game never waits on
 * it or breaks without it. White effects are tinted on demand; each tint is cached once per cell and colour.
 */
export class FxSprites {
  private img: HTMLImageElement | null = null;
  private tints = new Map<string, HTMLCanvasElement>();
  ready = false;

  load(url: string = atlasUrl): void {
    if (this.img || typeof Image === 'undefined') return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.ready = true;
    };
    img.src = url;
    this.img = img;
  }

  /** How many variants an effect has (pick one at random per particle for variety). */
  count(name: FxName): number {
    return FX_FRAMES[name].length;
  }

  /**
   * Draws variant `v` of `name` centred on (x, y), `size` world px across, turned by `rot` radians. White effects
   * take `tint` (a CSS colour); coloured ones ignore it. Uses the context's current alpha and blend mode.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    name: FxName,
    v: number,
    x: number,
    y: number,
    size: number,
    rot = 0,
    tint?: string,
  ): void {
    const img = this.img;
    if (!this.ready || !img) return;
    const frames = FX_FRAMES[name];
    const cell = frames[((v % frames.length) + frames.length) % frames.length] as number;
    let src: CanvasImageSource = img;
    let sx = (cell % FX_COLS) * FX_CELL;
    let sy = Math.floor(cell / FX_COLS) * FX_CELL;
    if (tint && !FX_COLOURED.has(name)) {
      src = this.tinted(cell, sx, sy, tint);
      sx = sy = 0;
    }
    const h = size / 2;
    const smooth = ctx.imageSmoothingEnabled;
    if (FX_PIXEL.has(name)) ctx.imageSmoothingEnabled = false; // pixel art keeps its hard edges
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(src, sx, sy, FX_CELL, FX_CELL, -h, -h, size, size);
      ctx.restore();
    } else ctx.drawImage(src, sx, sy, FX_CELL, FX_CELL, x - h, y - h, size, size);
    ctx.imageSmoothingEnabled = smooth;
  }

  private tinted(cell: number, sx: number, sy: number, tint: string): HTMLCanvasElement {
    const key = `${cell}|${tint}`;
    let c = this.tints.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = FX_CELL;
    const g = c.getContext('2d');
    if (g && this.img) {
      g.drawImage(this.img, sx, sy, FX_CELL, FX_CELL, 0, 0, FX_CELL, FX_CELL);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = tint;
      g.fillRect(0, 0, FX_CELL, FX_CELL);
    }
    if (this.tints.size > 400) this.tints.clear(); // colours come from a small fixed set; this is only a guard
    this.tints.set(key, c);
    return c;
  }
}
