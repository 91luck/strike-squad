# 3D graphics (Three.js)

STRIKE SQUAD is moving from 2D art to real 3D graphics the way modern side-scrollers do it (Contra: Operation
Galuga, Trine, Ori): **3D graphics, 2D play**. The deterministic simulation, the netcode, the bots and every test
stay as they are; only what is drawn changes.

## How it works now

- `client/src/game3d/world3d.ts`: a WebGL canvas under the 2D game canvas. A perspective camera looks straight down
  -z at the play plane from the distance at which the plane shows exactly the 2D camera's view, so a point on the
  plane lands on the same pixel in both canvases (the soldiers, foes and shots on the 2D canvas stand on the 3D
  ground).
- The ground and ledges are built from the level's tiles as lit, textured solids with depth (front, top running
  back into the world, sides at steps and drops), in chunks of 32 columns, rebuilt when tiles change.
- `client/src/game3d/themes.ts`: per art style the sky, fog, light, ground tint and the 3D scenery behind the play
  plane (instanced forests, rocks, hill ranges, burning horizons, rising embers), seeded so every run looks the same.
- `renderer.ts` starts it per stage when the stage's look exists (`game3d/theme-ids.ts`), WebGL works and the
  player has **3D graphics** on in Settings. three.js is loaded only then (its own ~550 kB chunk). Without WebGL, or
  with the setting off, the stage is drawn in 2D as before. Shadows are on for desktops, off on phones.

## Every stage has its own architecture

The play still happens on one plane, but each stage is now a built world of its own, not the same ground with a new
colour. A stage's look (`game3d/themes.ts`) can name a **kit**: its walls, paving and carved edge then come from
`assets/terrain/<kit>-wall/pave/band/stone.webp` (made by `art3d/kit_textures.py`) instead of earth and turf, and its
scenery is built from shared shapes (`game3d/shapes.ts`: turned pillars, arches, domes, onion domes, minarets, temple
spires, basalt columns, wheels, tents) placed along the stage's own walkway (`util.ts` `runs`).

| Stage             | Built world                                                                                                                                        | File         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1 Agnivan         | forest at dusk with the ruins of a forest temple, the fire on the horizon                                                                          | `themes.ts`  |
| 2 Sagar Setu      | a stone causeway (lotus moulding, wet stone under the tide line), a colonnade, chhatris, the old setu far out, a moonlit sea that follows the tide | `setu.ts`    |
| 3 Vayu Shikhar    | dawn on the climb: timber scaffolds under the ledges, prayer flags, chortens, monastery halls on the cliff, snow peaks over cloud                  | `shikhar.ts` |
| 4 Naag Lok        | a cavern: serpent pillars with lit eyes, oil lamps, stalactites, glowing crystals; the lamps light the dark veil                                   | `naglok.ts`  |
| 5 Maya Nagri      | a marble palace at violet dusk: arcade with gilded kiosks, lit halls with domes and minarets, a skyline of domes                                   | `stages.ts`  |
| 6 Bhasm Parvat    | basalt columns, ash trees, a lava glow, the volcano's crater far off                                                                               | `stages.ts`  |
| 7 Samarpan Maidan | the battlefield at sunset: banners, spears, broken chariots, a camp of tents, the armies drawn up                                                  | `stages.ts`  |
| 8 Chakra Durg     | a granite fortress: battlemented wall, round bastions, torches, great wheels turning in the sky                                                    | `stages.ts`  |
| 9 Dwand Bhoomi    | a red sandstone arena: tiered stands full of people, torches, an arcade round the top                                                              | `stages.ts`  |
| 10 Suvarna Nagri  | the golden city burning: gilded arcade, gold temples and domes, braziers, fire on every horizon                                                    | `stages.ts`  |

## Next, in order

1. Per-zone looks inside a stage (Agnivan's burning heart), and models made in Blender for the kit pieces that are
   still built from simple shapes in code.
2. Water, lava and mud as 3D surfaces (waves, glow, reflections); boats, chariots and the vimana as 3D models.
3. Heroes are now cut-out parts with skeletal animation (`client/src/game/rig.ts`, parts from `art3d/hero_parts.py`); next, the same for foes and bosses, then heroes as rigged 3D models (Blender, `art3d/`) with run, jump, shoot, dash, slide and hurt animations, in the 3D
   scene on the play plane; the same for the ten saga bosses (their parts already exist in Blender) and the rides.
4. Foes as 3D models; shots and effects as 3D particles and light (bloom post-processing).
5. Quality tiers (phones: no shadows, fewer trees; desktops: shadows, bloom) driven by the frame-time governor.

Each step keeps the 2D renderer as the fallback until the 3D one covers everything.
