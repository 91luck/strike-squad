# Astra visual polish

This pass changes presentation only. It does not change power damage, range, cooldowns, charges, enemy reactions, collision, multiplayer snapshots, or stage rules.

## Astra identity from the game design

| Astra | Gameplay identity | Visual signature added at impact |
|---|---|---|
| Agniastra | Fire wall and persistent burning ground | Rising flame crest and ember-hot broken rings |
| Jalastra | Rain that extinguishes fire and damages foes | Curling wave crest and cool concentric water rings |
| Vayuastra | Whirlwind that lifts and throws troopers | Three counter-moving wind ellipses |
| Naagastra | Three homing serpents | Three arcing serpent forms |
| Shyenastra | Clears enemy serpents/shots, crushes flyers and shields the caller | Broad eagle-wing silhouette |
| Chakram | Discus chains through foes and returns | Rotating eight-spoke chakra |
| Vidyutastra | Trident, spirit ally, or fire-rain form | Lightning-bolt impact mark |
| Tejastra | Golden bolt; counters a boss's tej orb | Eight-petal solar bloom |
| Mayastra | Reveals illusions and hidden paths | Six mirror facets around a bright centre |
| Paramastra | Shared squad strike; counters Pralay | Flame/sun spear crest with the shared strike's vertical emphasis |
| Singularity | Pulls enemies into a black hole | Dark event-horizon core and accretion ring |

## Visual direction

Each impact now has a stronger focal crest, three broken rings, and short radial accents. The existing elemental particle work, cinematic call sequence, and gameplay simulation remain intact. The crest is procedural Canvas drawing, so no new image downloads or asset dependencies are introduced.

## Design constraints

- Keep the astra's gameplay meaning legible; visual polish must not imply a different hitbox or damage area.
- Keep the centre silhouette readable over the existing world art.
- Use a short fade and avoid persistent screen obstruction.
- Preserve reduced-quality rendering paths and avoid per-frame object allocations beyond the existing draw routines.

## Validation status

Source-level change only. A full TypeScript/build run could not be completed in this environment because the dependency install timed out and the local TypeScript/Node type packages are incomplete. Run `npm ci`, then `npm run typecheck`, `npm test`, and `npm run build` before publishing.
