# Game rules

All numbers live in `shared/src/config.ts` and are the single source of truth for server, client and tests.

## Mission

| Rule               | Value                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Players            | 1–8 per squad online. Solo training: you plus 0, 1 or 3 computer buddies                                                                  |
| Route              | Landing Zone → Jungle → **Ambush** (lock-down, 3 waves) → River Bridge → **WARHOUND** → Watchtowers → **VULTURE** → **IRON FORTRESS**     |
| Goal               | Destroy the Iron Fortress                                                                                                                 |
| Countdown          | 3 s                                                                                                                                       |
| Squad lives        | easy 6, normal 4, hard 2, **plus 1 per player** (drop-ins add one too), capped at 14. Each boss beaten (WARHOUND, VULTURE) gives one back |
| Mission fails when | every soldier is KO'd and the squad has no lives left; or after 25 minutes; or everybody leaves                                           |
| Friendly fire      | none                                                                                                                                      |
| Joining late       | open the invite link any time: you appear beside the friend furthest ahead, with 2.5 s of protection                                      |

## Soldier

|              |                                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health       | **100 HP**. A soldier bullet takes 9, a turret 11, boss attacks 16–22. 0.4 s of flinch protection after a hit                                                                                                                |
| Regeneration | not hit for 3.5 s: health refills at 12 HP/s                                                                                                                                                                                 |
| KO           | at 0 HP you're knocked out and come back **3 s** later beside the squad, at full health, using one squad life. With no lives left you wait until a boss kill brings a life back                                              |
| Pits / river | cost 25 HP and put you back on the last safe ground                                                                                                                                                                          |
| Run / jump   | 215 px/s; jump ~120 px (3.8 tiles), let go early for a short hop; jump still works 0.1 s after running off a ledge                                                                                                           |
| Double jump  | press Jump again in the air (+~95 px), once per jump                                                                                                                                                                         |
| Dash         | ~3 tiles in 0.16 s; **bullets and touches pass through you** (i-frames last 0.12 s longer than the dash). One air dash per jump, 0.5 s cooldown                                                                              |
| Slide        | Down + Dash on the ground: 0.34 s low slide, slips under shots, knocks troopers over (3 damage, no touch damage to you)                                                                                                      |
| Knife        | 5 damage (a blaster shot does 1), 0.3 s cooldown. Firing with an enemy in reach knifes automatically. Breaks riot shields (double damage to them) and **parries**: swats enemy bullets, grenades and missiles out of the air |
| Aim          | 8 directions; down only in the air. Crouch (Down, standing still) to duck                                                                                                                                                    |
| Platforms    | one-way: jump up through them; Down + Jump drops through                                                                                                                                                                     |
| Going down   | a KO costs your special weapon (back to Blaster)                                                                                                                                                                             |

## Super moves (ultimates)

The meter fills from damage dealt (0.45 per point), kills (+6) and hits taken. At 100, press Super (Q / E / O, or the SUPER button). 1.2 s of invulnerability while you unleash it. Bosses take 45% of super-move damage.

| Heroes       | Super move                | Effect                                                                           |
| ------------ | ------------------------- | -------------------------------------------------------------------------------- |
| Blaze, Kiki  | Inferno Rush / Sonic Fury | Overdrive 5 s: 2.2× fire rate, piercing ×1.5 shots, half damage taken            |
| Nova, Sparky | Supernova / Tesla Storm   | Shockwave: 24 damage to everything within 320 px, wipes enemy fire within 420 px |
| Tusk, Sarge  | Heavy Rain / Airstrike    | 9 rockets rain down ahead (14 damage each, 72 px blast)                          |
| Viper, Ghost | Viper Strike / Shadow Cut | Slashes the 7 nearest enemies within 620 px for 20 each                          |

**SYNC:** a super fired within 2.5 s of a friend's hits 50% harder (overdrive lasts 30% longer).

## Combo and style

Hits within 2.6 s of each other chain: gun hit +1, slide +2, super +2, knife +3, parry +3, kill +2 more. Getting hit breaks the chain. Ranks: **C** 8 · **B** 18 · **A** 32 · **S** 50 · **SS** 75 · **SSS** 110. Kill score is multiplied by +10% per 10 combo (up to ×3). Style call-outs: KNIFE KILL, SLIDE KILL, AIR KILL, MULTI KILL (3 in 1.2 s), PARRY, SHIELD BROKEN. The results screen shows each soldier's best rank and combo.

## Lock-down arenas

Crossing an arena's trigger shuts its gate. The **Ambush** throws 3 waves from both sides and the sky; the next wave comes 1.2 s after one is down. A boss arena wakes its boss instead. Clearing an arena opens the gate and heals everyone standing by 35 HP.

## Weapons (crates S / M / L)

| Weapon          | Fire every | Damage | Notes                                |
| --------------- | ---------- | ------ | ------------------------------------ |
| Blaster         | 0.20 s     | 1      | default                              |
| **S**pread      | 0.34 s     | 0.7 ×5 | 5-shell fan, short range             |
| **M**achine gun | 0.085 s    | 1      | very fast                            |
| **L**aser       | 0.32 s     | 2      | passes through every enemy in a line |

Med-kit: +60 HP to the grabber and every soldier within 220 px.

## Enemies

|           | Health       | Behaviour                                                                                         |
| --------- | ------------ | ------------------------------------------------------------------------------------------------- |
| Soldier   | 3            | walks to ~190 px, shoots, never walks off ledges                                                  |
| Shield    | 4 + shield 6 | riot shield blocks shots from the front; turns slowly. Shoot from behind/above, knife or slide it |
| Grenadier | 4            | keeps ~270 px away and lobs grenades (20 damage, 58 px blast); a red ring shows where they land   |
| Jetpack   | 3            | flies in, hovers above you, fires 3-round bursts                                                  |
| Turret    | 7            | static, aims at you                                                                               |
| Drone     | 2            | flies above you and shoots                                                                        |

Enemies sleep until someone is within ~760 px. Health grows 30% and fire rate 5% per extra player; difficulty changes fire rate (×0.7 / ×1 / ×1.25) and damage taken (×0.65 / ×1 / ×1.35).

## Bosses

Every attack has a **tell** (wind-up) first: a red glow, a warning sign, a laser sight or a floor marker.

| Boss                        | Health             | Attacks                                                                                                                                                                                                                             |
| --------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WARHOUND** (walking tank) | 60 + 75 per player | cannon (3 arcing shells), machine-gun sweep, **charge** (0.85 s tell, then rushes the arena: double-jump over it or dash through), **stomp** (two shockwaves along the floor: jump them). Below 50%: faster, double stomps          |
| **VULTURE** (gunship)       | 55 + 70 per player | strafing gun, **bombing run** across the arena, slow homing **missiles** (shoot or knife them down), drops 2 jetpack troopers. Below 50%: lower, faster, 4 missiles                                                                 |
| **IRON FORTRESS** (final)   | 90 + 95 per player | cannon volleys and a floor **laser**: low beam → jump, high beam → duck/slide (1 s tell, burns 0.5 s). Phase 2 (60%): ground slams + drones. Phase 3 (30%): faster, a low beam chased by a high one. Blocks the way while it stands |

## Measured difficulty (computer squads)

`npm run playtest -- 10 <difficulty> 0.6`, 10 runs per squad size, 1 Nov 2026. The computer players aim perfectly; skill 0.6 means they react to only ~60% of incoming attacks (dodges, jumps, ducks). Treat this as a relative guide, not human win rates.

| Players | Easy: won / KOs | Normal: won / KOs | Hard: won / KOs |
| ------- | --------------- | ----------------- | --------------- |
| 1       | 100% / 0.2      | 100% / 2.6        | 60% / 2.9       |
| 2       | 100% / 0.0      | 100% / 1.0        | 100% / 2.0      |
| 4       | 100% / 0.0      | 100% / 1.3        | 100% / 5.0      |
| 8       | 100% / 0.0      | 100% / 2.1        | 100% / 5.4      |

Winning runs take 2.5–6 minutes of game time (solo is the slowest). Squads fire 6–14 super moves per run and reach combos of 50–90. The design intent: soldiers don't die fast (normal is forgiving), hard punishes ignoring the tells.
