# STRIKE SQUAD — Character Model Detail Pass

This pass updates the procedural Blender character model source in `art3d/style2.py`.

## Model additions
- Individual chest crest with emissive core, using each hero's accent colour.
- Three layered abdominal armour plates.
- Reinforced belt buckle and paired utility pouches with flap geometry.
- Shoulder insignia plates and forearm inlay details.
- All new geometry is parented to the existing `spine` or `root` joints; no gameplay code, hitboxes, movement, networking, or combat values are changed.

## Important build note
The game uses pre-rendered WebP sprite atlases, not live Blender meshes. This package contains the updated procedural model source, but the new geometry will not appear in the running game until the atlases are regenerated with Blender 5.x (`bpy`) and packed.

From the repository root, with Blender's Python module installed:

```bash
for i in 0 1 2 3 4 5 6 7; do
  python3 art3d/hero_rig.py --hero "$i" --samples 48
  python3 art3d/style2.py --hero "$i"
  python3 art3d/hero_rig.py --hero "$i" --mode big --samples 48
  python3 art3d/hero_rig.py --hero "$i" --mode portrait --samples 48
done
python3 art3d/pack.py --dst client/src/assets/sprites3d
python3 art3d/pack_parts.py
```

The current environment used to prepare this ZIP did not have Blender/`bpy`, so rendered atlases and in-game screenshots could not be regenerated or verified here. `python -m py_compile art3d/style2.py` passed.
