# art3d: the rendered (Blender) art

The heroes, the classic troopers, the menu's hero showcase, the hero portraits and the store covers are modelled,
rigged, posed and rendered by code in Blender, running headless as a Python module (`bpy`). The game ships only the
rendered results (WebP atlases + JSON in `client/src/assets/sprites3d/`, covers in `release/covers/`), so a normal
build or test run needs none of this.

These are code-built models (primitives, bevels, hand-placed joints): a big step up from flat pixel art, but not
sculpted production art.

## Setup (once)

```bash
pip install --break-system-packages bpy pillow fonttools brotli   # Blender 5.x as a Python module, ~300 MB
python3 -c "import bpy; print(bpy.app.version_string)"
```

## Files

| File                          | What it does                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hero_rig.py`                 | Builds one character from its look (hero colours and headgear, or a trooper's: headgear, weapon, torso), poses it with joint empties (two-bone IK keeps both hands on the weapon at every aim) and renders every frame the game asks for: `pose_frame_aim.png` at 2x, plus `meta.json` (muzzle positions). Modes: `sprites` (game frames), `big` (menu showcase, 3x), `portrait` (head and shoulders). |
| `pack.py`                     | Downscales, adds the game's 1 px dark outline, packs each character into `<key>.webp` + `<key>.json`.                                                                                                                                                                                                                                                                                                  |
| `keyart.py`                   | The store key art: four heroes charging out of a burning golden city, a seven-headed demon king against the moon.                                                                                                                                                                                                                                                                                      |
| `backdrop.py`                 | Every stage's backdrops (the ten saga stages and the six classic missions' 13 art styles): per art style three seamless 1024x576 parallax layers (far ranges, the nearer skyline, the stage's own world), built from periodic ridged-noise relief sheets and primitive-built structures, lit like a matte painting; `--clouds` renders the cloud sprites.                                              |
| `pack_bg.py`                  | Adds air (less contrast toward the back) and a bloom to each backdrop layer, crops the empty sky, writes `client/src/assets/backdrops/*.webp` + `backdrops.json`.                                                                                                                                                                                                                                      |
| `boss_rig.py`                 | All ten saga stage bosses built in the game's world-pixel coordinates and rendered as parts with pivots: the body, an arm hanging from its shoulder, and each boss's own extras (heads and stumps, mace, gate, boulder, crown of leaves, hood, mirror frame, the sage disguise), plus a face portrait for the story radio.                                                                             |
| `terrain.py`                  | Every stage's ground: per art style a lit, seamless rock/earth texture, a surface strip (grass, snow, sand, marble edge, lava crust) and a ledge for its one-way platforms (charred log, driftwood, icicled slab, glowing fungus shelf, crystal pane, gear rail…), built as height fields and lit; the game samples them by world position. `client/src/assets/terrain/`.                              |
| `story_art.py`                | Vani, the story's guide (a flame spirit in a clay lamp): the portrait for the story radio, `client/src/assets/story/vani.webp`.                                                                                                                                                                                                                                                                        |
| `pack_boss.py`                | Outlines the parts and packs one atlas per boss: `client/src/assets/bosses3d/<boss>.webp` + `.json` (rectangles, pivots, arm lengths).                                                                                                                                                                                                                                                                 |
| `cover.py`                    | Puts the title on the key art: `release/covers/cover-{landscape,portrait,square}-*.png`.                                                                                                                                                                                                                                                                                                               |
| `heroes.json`, `enemies.json` | The looks, exported from the game's own data (`shared/src/heroes.ts`, `client/src/game/sprites.ts` `FACTION_LOOKS`). Re-export them after changing a look.                                                                                                                                                                                                                                             |
| `RussoOne.ttf`                | The game's title font (SIL Open Font License), converted from `@fontsource/russo-one` for the covers.                                                                                                                                                                                                                                                                                                  |

## Rebuild everything

```bash
for i in 0 1 2 3 4 5 6 7; do
  python3 art3d/hero_rig.py --hero $i                     # game frames (71 per hero)
  python3 art3d/hero_rig.py --hero $i --mode big          # menu showcase
  python3 art3d/hero_rig.py --hero $i --mode portrait     # HUD / lobby portrait
done
for k in $(python3 -c "import json;print(' '.join(json.load(open('art3d/enemies.json'))))"); do
  python3 art3d/hero_rig.py --look $k --samples 32        # troopers: 13 frames, aiming ahead
done
python3 art3d/pack.py --dst client/src/assets/sprites3d
for L in landscape portrait square; do python3 art3d/keyart.py --layout $L --out art3d/out/keyart-$L.png; done
python3 art3d/cover.py --dst release/covers
python3 art3d/backdrop.py --all          # 24 art styles x 3 layers, about 2 hours on 2 cores (only missing ones)
python3 art3d/pack_bg.py
python3 art3d/boss_rig.py --all          # about a minute
python3 art3d/pack_boss.py
python3 art3d/terrain.py                 # seconds
```

About 15 minutes for the sprites and 20 for the key art on two CPU cores (Cycles, CPU). One character:
`--hero 3` or `--look norse-enemy`; one frame: `--only run:3:uf`.

## How the game uses them

Bosses: `client/src/game/boss3d.ts` draws a part by its pivot, and turns and stretches an arm (or the mace) from a
shoulder to a hand. Each boss's draw function computes the same shoulder and hand points its 2D drawing used, so
every attack's tell is unchanged; glows, flames, telegraphs and the bow stay drawn by code over the rendered body.
Until a boss's atlas has loaded, its 2D drawing is used.

Backdrops: `client/src/game/backdrop3d.ts` starts loading a stage's three layers when the stage is set (and the next
zone's ahead of the camera); the renderer switches to them once all three have arrived, smooth-scaled, and drops the
hand-drawn silhouettes and cartoon clouds for that stage. A test checks every saga art style has its three layers.

`client/src/game/sprites3d.ts` loads an atlas the first time its character is drawn (heroes, portraits and the
showcase are preloaded at start) and cuts frames out once. Until an atlas has arrived, and wherever one is missing,
the hand-drawn frame is drawn instead (`charFrame` in `sprites.ts`), so nothing ever waits on an image. Frames match
the HD frame geometry (96x100, feet at (40, 96)): change that in `hero_rig.py` and `hero-hd.ts` together.

## Rides (mount_rig.py)

Seven rides, built and rendered in parts like the saga bosses (same scene, lights and outline packing):

    python3 art3d/mount_rig.py --all --samples 48
    python3 art3d/pack_boss.py --src art3d/out/mount --dst client/src/assets/mounts3d

Parts: `body`, `legf`/`legb` (horse, tiger, elephant: hanging from the shoulder/hip), `wheel` (bike, jeep), `wing`
(hawk, from the shoulder), `pack` (jet suit, worn on the back). `client/src/game/mount-art.ts` lays them out by their
pivots and animates them (gait from the distance covered, spinning wheels, wing beats, thruster flames).
