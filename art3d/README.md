# art3d: the rendered (Blender) art

The heroes, the classic troopers, the menu's hero showcase, the hero portraits and the store covers are modelled,
rigged, posed and rendered by code in Blender, running headless as a Python module (`bpy`). The game ships only the
rendered results (WebP atlases + JSON in `client/src/assets/sprites3d/`, covers in `release/covers/`), so a normal
build or test run needs none of this.

These are code-built models (lofted forms, plates, hand-placed joints): a big step up from flat pixel art, but not
sculpted production art. A model sculpted by an artist (any GLB whose meshes are split by the joint names above) is
the next step up.

## Setup (once)

```bash
pip install --break-system-packages bpy pillow fonttools brotli   # Blender 5.x as a Python module, ~300 MB
python3 -c "import bpy; print(bpy.app.version_string)"
```

## Files

| File                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero_rig.py`                 | Builds one character from its look (hero colours and headgear, or a trooper's: headgear, weapon, torso), poses it with joint empties (two-bone IK keeps both hands on the weapon at every aim) and renders every frame the game asks for: `pose_frame_aim.png` at 2x, plus `meta.json` (muzzle positions). Modes: `sprites` (game frames), `big` (menu showcase, 3x), `portrait` (head and shoulders).                                                                                                                                                                                            |
| `style2.py`                   | The current cast (second generation), after how Hades, Prince of Persia: The Lost Crown, Raji and Contra: Operation Galuga build theirs: heroic proportions (about six heads tall), forms lofted from cross-sections (tapered, muscled limbs, a V-shaped torso), angular armour plates, cloth that trails (scarves, tabards), one saturated colour per character, matte surfaces. Heroes and the 14 asura villains; the same joints as `hero_rig.py`, so `hero_parts.py` cuts them into parts and `hero_rig.py` (`--style 2`, the default) renders their frames, showcase and portrait from them. |
| `hero_parts.py`               | The same hero model taken apart for the game's skeletal animation (`client/src/game/rig.ts`): every limb rendered on its own in the rest pose, with the joint it turns about, plus `rig.json` (rest positions of every joint, the rifle's grips and muzzle, the hands).                                                                                                                                                                                                                                                                                                                           |
| `villain_rig.py`              | The saga's humanoid foes as asura warriors (archer, drummer, discus thrower, maharathi, net thrower, wrestler, mace bearer, slinger, conch blower, dancer, torch bearer, sorcerer, lamp carrier, fire imp): the heroes' joint hierarchy with a villain's body (horns or crowns, glowing eyes, fangs, armoured shoulders, bracers, loincloth) and each kind's weapon, rendered as parts like `hero_parts.py`.                                                                                                                                                                                      |
| `pack_parts.py`               | Crops and packs one hero's parts into `client/src/assets/rigs/h<id>.webp` + `.json` (rectangles, pivots, joints).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pack.py`                     | Downscales, adds the game's 1 px dark outline, packs each character into `<key>.webp` + `<key>.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `keyart.py`                   | The store key art: four heroes charging out of a burning golden city, a seven-headed demon king against the moon.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `backdrop.py`                 | Every stage's backdrops (the ten saga stages and the six classic missions' 13 art styles): per art style three seamless 1024x576 parallax layers (far ranges, the nearer skyline, the stage's own world), built from periodic ridged-noise relief sheets and primitive-built structures, lit like a matte painting; `--clouds` renders the cloud sprites.                                                                                                                                                                                                                                         |
| `pack_bg.py`                  | Adds air (less contrast toward the back) and a bloom to each backdrop layer, crops the empty sky, writes `client/src/assets/backdrops/*.webp` + `backdrops.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `boss_rig.py`                 | All ten saga stage bosses built in the game's world-pixel coordinates and rendered as parts with pivots: the body, an arm hanging from its shoulder, and each boss's own extras (heads and stumps, mace, gate, boulder, crown of leaves, hood, mirror frame, the sage disguise), plus a face portrait for the story radio.                                                                                                                                                                                                                                                                        |
| `terrain.py`                  | Every stage's ground: per art style a lit, seamless rock/earth texture, a surface strip (grass, snow, sand, marble edge, lava crust) and a ledge for its one-way platforms (charred log, driftwood, icicled slab, glowing fungus shelf, crystal pane, gear rail…), built as height fields and lit; the game samples them by world position. `client/src/assets/terrain/`.                                                                                                                                                                                                                         |
| `story_art.py`                | Vani, the story's guide (a flame spirit in a clay lamp): the portrait for the story radio, `client/src/assets/story/vani.webp`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pack_boss.py`                | Outlines the parts and packs one atlas per boss: `client/src/assets/bosses3d/<boss>.webp` + `.json` (rectangles, pivots, arm lengths).                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `cover.py`                    | Puts the title on the key art: `release/covers/cover-{landscape,portrait,square}-*.png`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `heroes.json`, `enemies.json` | The looks, exported from the game's own data (`shared/src/heroes.ts`, `client/src/game/sprites.ts` `FACTION_LOOKS`). Re-export them after changing a look.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `RussoOne.ttf`                | The game's title font (SIL Open Font License), converted from `@fontsource/russo-one` for the covers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Rebuild everything

```bash
for i in 0 1 2 3 4 5 6 7; do
  python3 art3d/hero_rig.py --hero $i                     # game frames (71 per hero)
  python3 art3d/style2.py --hero $i                       # the cut-out parts for the skeletal animation
  python3 art3d/hero_rig.py --hero $i --mode big          # menu showcase
  python3 art3d/hero_rig.py --hero $i --mode portrait     # HUD / lobby portrait
done
for k in $(python3 -c "import json;print(' '.join(json.load(open('art3d/enemies.json'))))"); do
  python3 art3d/hero_rig.py --look $k --samples 32        # troopers: 13 frames, aiming ahead
done
python3 art3d/pack.py --dst client/src/assets/sprites3d
for k in archer drummer chakri rathi netter pehlwan gadadhar slinger conch dancer mashaal mayavi lantern imp; do
  python3 art3d/style2.py --villain $k                    # the asura warriors' parts
done
python3 art3d/pack_parts.py                               # client/src/assets/rigs
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

## Hand/AI-drawn hero sheets (art3d/ai_parts.py)

The heroes' look now comes from painted parts sheets (art3d/ai/hero1.png, hero2.png, one character taken apart on a plain
background). `ai_parts.py` cuts each piece, packs the atlas and writes the rig json in the same format the game's skeletal
animation (client/src/game/rig.ts) already reads. A spec json per hero says what each piece is, where it hangs and where the
weapon's grip and muzzle are. A spec may `extends` another one, recolour it (hue rules that leave skin and black alone) and take
a head or weapon from another sheet (art3d/ai/atlas.png has bow, staff, daggers, rifle). Heroes 0 and 1 are the two sheets
themselves; 2..7 are recolours of them with different weapons.

    python3 art3d/ai_parts.py --sheet art3d/ai/hero1.png --spec art3d/ai/hero1.json --key h0
    python3 art3d/ai_parts.py --sheet art3d/ai/hero2.png --spec art3d/ai/hero_tusk.json --key h2

A new hero: draw (or have an image tool draw) a sheet in the same layout, add a spec, run the command above.

`art3d/build_ai_heroes.sh` rebuilds all eight (rigs, plus `art3d/ai_portraits.py`: the menu portraits and showcase figures cut
from the sheets' standing figure). A spec's `recoil` sets how hard that weapon kicks back per shot (rig.ts slides the weapon
back along its line and the hands follow); `scale` sets the hero's size in the game.

## Bosses from the painted atlas (art3d/ai_bosses.py)

`python3 art3d/ai_bosses.py` replaces eight saga bosses' bodies (raakhasur, maniyodha, jodasur, aandhi, darpan, vishdhar, chhaya,
suryakavach) with the painted figures of `art3d/ai/atlas.png` (map and cut boxes: `art3d/ai/bosses.json`), sized to the body they
replace and hung from the same pivot. The old separate arms and weapons are dropped; boulders, the gate and the sage are kept. The
atlas reaches only the old 3D bodies of vriksha (stage 1) and saptashir (stage 10), whose heads and crown the attacks animate, so those
two stay as they were. To redo a boss from a better sheet, change its box in `bosses.json` (or point it at a new atlas) and rerun.

## Painted foes (art3d/ai_foes.py, client/src/game/painted.ts)

Eight creature foes (crab, makar, harpy, bat, serpent, spitter, treant, elephant) are painted whole from `art3d/ai/atlas.png`
(`art3d/ai/foes.json`: atlas box, size in game px, facing, flyer or not) and drawn with simple motion (hop, breath, hover and
wing beat), not a skeleton. Until `assets/painted/foes.webp` has loaded the old drawing is used.

### Painted villains (from a collage sheet)

`ai_foes.py` also cuts figures from `art3d/ai/villains.jpg` (a 3x3 collage of character sheets). A foes.json entry with
`"sheet":"villains.jpg","s":1` is cut by `cut_local`: background = grey at the box corners (`tol`), flooded from the
border; pieces smaller than `minfrac` (default 0.12) of the biggest are dropped (floating weapons, portraits).
Boxes sit inside one tile, below its title. Used for pehlwan, gadadhar, rathi, golem, mayavi, pret, dancer, netter, chakri, slinger (the cyan Serpentine figure).
These are static painted figures with hop/breath animation, not rigged limbs.

### All ten stage bosses from the villain collage

`ai_bosses.py` cuts every boss from `villains.jpg` (entries with `sheet`): vriksha = Serpentine (green), chhaya = Shadow Claw,
aandhi = Frost Bite, vishdhar = Void Mage, darpan = Serpentine (cyan), raakhasur = Bloodthirster, maniyodha = Iron Clad,
suryakavach = Vulcan, jodasur = Drako, saptashir = Nekros. Options: `th` world height, `headless` + `head_x` (the seven heads
of Saptashir are the figure's own skull), `blank` (an old part kept but drawn empty), `holes` (grey seen through a figure).
Restore the old bosses3d files from git (`b2d7854^`) before re-running: the tool sizes each body to the old one.

### Kits sheets: more villains, rides, weapons

- `kits1.png` / `kits2.png` (character and creature sheets on parchment tiles) are cut with GrabCut (`"grabcut":1` in a foes.json entry;
  `ring`, `iters`, `minfrac`, `nofill` tune it): archer = Fae Archer, drummer = Dwarven Runesmith, conch = Runescribe Mage,
  mashaal = Stormbringer Barbarian, lantern = Golemancer, imp = Shadowfang Stalker.
- `ai_mounts.py`: rides painted whole (baaz = gryphon, tiger = void hound, elephant = the painted war elephant); mount-art.ts bobs
  and rocks the body with the stride when a ride has no leg parts.
- `ai_weapons.py` cuts the weapon sheet onto `weapons_flat.png`; hero_tusk (heavy crossbow), hero_sparky (phase-rifle) and
  hero_kiki (meteor chakram) use it through `sheets.wpn`; `flipx` mirrors a piece. Viper, Ghost and Sarge keep their old weapons.

### Own art for every foe, and an ink line

- The ten foes that shared art with the bosses now come from the kits sheets: pehlwan = Demonic Warlord, gadadhar = Aethelgard
  Knight (`seed` keeps the grey helmet GrabCut would drop), rathi = Technomancer, golem = Obsidian Elemental, mayavi =
  Necromancer Lord, pret = hooded Necharinger, dancer = Shadowblade Rogue, netter = Dryad, chakri = Automaton, slinger =
  horned Necharinger recoloured teal (`recolor`).
- `ai_foes.outline` bakes a dark ink line and a faint warm rim around every painted foe and boss body, so they read on dark
  caves and bright skies; painted.ts adds a ground shadow, a lean into the walk and a squash on hits. `erase` drops a stray
  piece glued to a figure (fractions of the box).
