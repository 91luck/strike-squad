# Third-party art

Everything not listed here (heroes, troopers, bosses, tiles, backgrounds, music, sound) is drawn or generated
by the game's own code. The heroes' high-definition look (`client/src/game/hero-hd.ts`) took Warped City's
hero as a quality reference only (proportions, three-tone shading, eight-frame run); no pixels were copied.

## High definition

Where a world pixel covers 1.25 screen pixels or more (most laptops, desktops and phones), the world is drawn
at twice the detail: heroes and troopers (`hero-hd.ts`), ground and platforms (`tile-hd.ts`), backdrop
(`backdrop-hd.ts`), jungle scenery (`prop-hd.ts`), and the pixel layer for bosses and effects. Other props
are doubled with Scale2x. The renderer builds a level's HD art a few milliseconds a frame ahead of time
(`Renderer.queueWarm`), so a new zone never stalls. Open the game with `?hd=0` to compare against the classic
resolution; `/tools/heroes.html` (add `?troopers=1`) shows every figure in every pose.

| What                                                                                      | Where in the game                                                  | Source                                                                                    | License                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Explosion fire, flashes, smoke, dust puffs, sparks, muzzle flames, lightning, magic seals | `client/src/assets/fx-atlas.png` (used by `client/src/game/fx.ts`) | Kenney "Particle Pack" 1.1 and "Smoke Particles", [kenney.nl](https://kenney.nl)          | CC0 1.0 (public domain); copies in `client/src/assets/LICENSE-kenney-*.txt`      |
| Pixel-art blast flipbook (6 frames) and bullet hit flash (3 frames)                       | same atlas: `blast`, `hit`                                         | Ansimuz "Warped City", [ansimuz.itch.io/warped-city](https://ansimuz.itch.io/warped-city) | CC0 (public domain); copy in `client/src/assets/LICENSE-ansimuz-warped-city.pdf` |

CC0 needs no credit; we credit Kenney and Ansimuz anyway.

Warped City's hero, drone and turret were looked at and left out: the hero is drawn at the same pixel size
as ours (about 46 px tall), has no aiming up or down, knife, dash or slide, and is one character where the game
has eight; its slim cyberpunk look would also clash with the Astra Saga heroes.

## Rebuilding the effects atlas

The atlas is committed, so a normal build needs nothing extra. To change which effects it holds:

1. Get the two Kenney packs (kenney.nl, or the community mirror `github.com/ETdoFresh/kenney.nl`) and Warped
   City (free on itch.io).
2. Edit `SETS` in `tools/build-fx-atlas.py`.
3. `python3 tools/build-fx-atlas.py <folder holding particlePack_1.1 and smokeparticleassets> "<warped city files folder>"`
   (needs Pillow).
4. `npx prettier --write client/src/game/fx-atlas.ts`, then `npm test`.

Kenney's pictures are shrunk to a 64 px cell and posterised (Warped City's pixel art is copied untouched), and the game draws effects at world resolution and
blows them up with hard edges (`Renderer.pixelated`), so they sit on the same pixel grid as the sprites.
