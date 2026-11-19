# STRIKE SQUAD — Astra visual release pass

This release pass is presentation-only. It does not alter simulation rules, hitboxes, damage, cooldowns, charges,
projectile steering, enemy AI, network snapshots, or mission progression.

## Astra identities preserved from `docs/ASTRA_SAGA.md` and `shared/src/config.ts`

| Astra | In-game role | Visual language |
|---|---|---|
| Agniastra | Fire wave; leaves burning ground and can spread fire | Phoenix/flame silhouette, ember stream, hot impact seal |
| Jalastra | Torrential rain; extinguishes Agni fire and holds the sea tide low | Curling wave, falling spray, cool blue-white rings |
| Vayuastra | Moving whirlwind; lifts, carries and flings troopers | Rotating funnel, counter-moving wind bands, dust wake |
| Black Hole | Pulls enemies and shots inward, then collapses | Dark event horizon, lensing/accretion ring, inward-moving motes |
| Naagastra | Three homing serpents seek nearby foes | Three distinct serpent arcs and emerald contact crest |
| Shyenastra | Clears hostile serpents/shots, crushes flyers and shields the caller | Broad eagle-wing silhouette, feather wake and sweeping ring |
| Chakram | Discus chains through up to six foes and returns | Spinning eight-spoke discus and travelling gold trail |
| Vidyutastra | One of three forms: trident strike, spirit ally or fire rain | Forked lightning signature with electric-blue contact flash |
| Tejastra | Golden bolt; counters a boss's Tej orb | Solar lotus, sharp gold rays and bright central seal |
| Mayastra | Reveals illusions and hidden paths; dulls the mirror | Faceted mirror shards and violet refraction accents |
| Paramastra | Shared squad strike; answers Pralay | White-gold sun, vertical pillar and broad team-scale shock front |

## What this pass changes

- Adds a layered detonation core at the point of contact: white-hot centre, coloured halo, offset elliptical shock rings,
  and short radial blades.
- Strengthens the per-Astra signature crest so the impact remains identifiable after the larger cinematic has passed.
- Keeps the existing elemental particle and ground-response layers; no external art or runtime dependency is added.
- Uses the existing high-quality/low-quality switch (`hq`) and existing reduced-motion handling in the renderer.
- Keeps the common detonation beat short so it does not cover enemies or obscure gameplay for the full Astra duration.

## Character/UI scope

The character presentation and menu/UI work already present in this source archive is retained. This pass does not replace
those assets or change the game's controls and navigation.

## Validation

The archive is checked for ZIP integrity. Automated TypeScript, unit, browser and production-build verification must still
be run in an environment where the lockfile dependencies can be installed:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

No claim of a completed production build or CrazyGames approval is made by this source-only packaging pass.
