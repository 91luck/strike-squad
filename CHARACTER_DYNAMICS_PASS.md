# STRIKE SQUAD — Character Dynamics Pass

This pass builds on the existing skeletal character rigs and HD part atlases rather than replacing them with static art.

## Included
- Run-cycle phase now follows signed world travel, so reversing direction does not mirror/jump the gait phase.
- Speed-scaled body compression and lift add weight to running without changing player movement or collision behaviour.
- Small torso counter-rotation and hip sway improve the sense of momentum.
- Idle breathing, weight settling, and subtle shoulder/head counter-motion make standing characters feel alert rather than frozen.
- Melee poses receive a restrained follow-through pulse while existing attack timing and hit logic remain untouched.

## Safety scope
No changes were made to movement velocities, gravity, jump logic, hitboxes, damage, cooldowns, weapons, networking, matchmaking, or progression. The changes are visual pose calculations inside the existing rig renderer.

## Validation
The ZIP archive is integrity-checked. A full TypeScript build and browser playtest were not run in this environment because project dependencies are not installed and dependency installation previously timed out. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` before publishing.
