# Game rules

All numbers live in `shared/src/config.ts` and are the single source of truth for server, client and tests.

## Missions

Six missions, each harder than the last, each in its own world. Pick one in **Play with friends** (the host can change it in the lobby), in **Solo training**, or press **Next mission** after a win. A ✓ in the menu marks missions you have completed on this device.

| #   | Mission              | Place           | Length    | Arenas (ambush · boss)                                                                                                     | Toughness (troop health · fire rate · damage · boss health · boss pace) |
| --- | -------------------- | --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Operation Lifeline   | Jungle          | 276 tiles | AMBUSH · WARHOUND · VULTURE · IRON FORTRESS                                                                                | base rules                                                              |
| 2   | Curse of the Pharaoh | Desert tombs    | 378 tiles | THE CURSE WAKES (4 waves) · **TWIN SCORPIONS** (two walkers) · SEALED CHAMBER (4) · SUN FALCON + escorts · ANUBIS COLOSSUS | ×1.15 · ×1.1 · ×1.1 · ×1.1 · ×1.1                                       |
| 3   | Thunder of the North | Frozen north    | 408 tiles | DRAUGR WAKE (4) · THOR, THUNDER GOD + escorts · SHIELD WALL (4) · FENRIR + escorts · FROST GIANT                           | ×1.25 · ×1.15 · ×1.15 · ×1.15 · ×1.12                                   |
| 4   | Storm over Olympus   | Mount Olympus   | 396 tiles | STORM GATE (5) · **MINOTAUR AND HARPY** (walker + gunship) · LAST STAND (5) · MINOTAUR KING · ZEUS, STORM KING             | ×1.35 · ×1.2 · ×1.2 · ×1.2 · ×1.15                                      |
| 5   | Operation Astra      | Burning citadel | 372 tiles | DEMON HORDE (4) · INFERNO BEAST + escorts · FIRE DRAGON + escorts · BLOOD MOON (5) · DEMON KING                            | ×1.25 · ×1.15 · ×1.15 · ×1.15 · ×1.12 · **advanced**                    |
| 6   | Alien Invasion       | Deep space      | 394 tiles | ALIEN SWARM (4) · XENO CRAWLER (low gravity) · UFO MOTHERSHIP + escorts · EVENT HORIZON (5) · HIVE QUEEN (low gravity)     | ×1.35 · ×1.2 · ×1.2 · ×1.2 · ×1.15 · **advanced**                       |

- **Escorts:** in a boss arena with escorts, the first wave arrives with the boss and each next wave 3 s after the previous one is down, while a boss stands.
- **Twin bosses** share one health bar (each has 60–62% of a lone boss's health).
- **Winning:** clear the final arena (the fortress and any troops left in it).
- Boss wind-up tells keep their length in every mission; tougher missions only shorten the rests between attacks.

## Advanced missions (5 and 6)

Auto-fire starts **off** in advanced missions. Tap **AUTO FIRE** (top right) or press **T** to switch it on or off.

**Powers ("astras").** Picked up like weapon crates, held in their own slot and fired with **ASTRA** (key R / G / U; the touch button shows the power and charges left). Carry up to 3 charges of one power; a new kind replaces the old one.

| Power      | Charges | What it does                                                                                                                                              |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agni       | 2       | A rolling wave of fire (8 damage, passes through), then the ground ahead burns for 4 s (16 dps)                                                           |
| Varuna     | 1       | Rain over the next 15 tiles: puts out **walls of fire**, 6 damage to everyone caught in it                                                                |
| Vayu       | 2       | A gust (440 px): blows troopers back, tears off riot shields, scatters enemy shots                                                                        |
| Black hole | 2       | A singularity 7 tiles ahead for 3.2 s: pulls troopers in (contained radius 240 px), swallows enemy shots, 22 dps at the core, then collapses with a burst |

**Walls of fire** (mission 5) block the way until Varuna's rain puts them out. A rain **altar** stands before each wall and comes back 8 s after it is taken, so the squad can never be locked out.

**Brahmastra** (mission 5): a shared squad meter that fills from everybody's kills (+3) and damage. When it is full, a soldier with no power held presses ASTRA: the sky darkens, a pillar of light comes down 1.1 s later and hits every enemy within 1,150 px (90 damage; bosses lose 12% of their health). The whole squad is protected through the strike.

**Space physics** (mission 6), the same on the server and in your phone's prediction:

| Field             | Effect                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| Low gravity       | gravity ×0.45–0.6: jumps ~2× higher and longer; no double jump needed for craters   |
| Anti-gravity lift | a blue beam carries you up and holds you at its top; step sideways onto the walkway |
| Gravity well      | pulls you sideways toward the pit below it (you can always run out); bends shots    |
| Magnetic storm    | every shot curves (drawn as an aurora)                                              |

## Worlds

Every mission after the first has its own enemies, bosses, ground, props, gates, sky and shot colours. Rules do not change: each faction has the same six troop types and the same three boss behaviours (the beast charges and stomps like WARHOUND, the flyer bombs and fires slow missiles like VULTURE, the final boss fires low/high beams in three phases like the IRON FORTRESS).

| #   | Faction | Troops                                                           | Beast          | Flyer          | Final boss      | World                                     |
| --- | ------- | ---------------------------------------------------------------- | -------------- | -------------- | --------------- | ----------------------------------------- |
| 1   | army    | soldiers, riot shields, jetpacks, drones, turrets                | WARHOUND       | VULTURE        | IRON FORTRESS   | jungle, river, watchtowers, iron fortress |
| 2   | pharaoh | mummies, jackal guards, winged mummies, scarabs, cobra idols     | Giant Scorpion | Sun Falcon     | Anubis Colossus | desert, pyramids, sandstone tombs         |
| 3   | norse   | draugr with round shields, ravens, rune totems                   | Fenrir         | Thor           | Frost Giant     | snow, pines, aurora, ice halls            |
| 4   | olympus | skeleton hoplites, harpies, bronze owls, stone lions             | Minotaur       | Storm Harpy    | Zeus            | marble ruins in a lightning storm, temple |
| 5   | demon   | demons, bat-winged imps, fire wisps, skull totems                | Inferno Beast  | Fire Dragon    | Demon King      | burning citadel, obsidian, bone gates     |
| 6   | void    | aliens with ray guns and hover discs, probe saucers, plasma pods | Xeno Crawler   | UFO Mothership | Hive Queen      | deep space, the inside of a hive ship     |

## Mission rules

| Rule               | Value                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Players            | 1–8 per squad online. Solo training: you plus 0, 1 or 3 computer buddies                                                                  |
| Route (mission 1)  | Landing Zone → Jungle → **Ambush** (lock-down, 3 waves) → River Bridge → **WARHOUND** → Watchtowers → **VULTURE** → **IRON FORTRESS**     |
| Goal               | Clear the final arena: destroy the fortress                                                                                               |
| Countdown          | 3 s                                                                                                                                       |
| Squad lives        | easy 6, normal 4, hard 2, **plus 1 per player** (drop-ins add one too), capped at 14. Each boss beaten (WARHOUND, VULTURE) gives one back |
| Mission fails when | every soldier is KO'd and the squad has no lives left; or after 25 minutes; or everybody leaves                                           |
| Friendly fire      | none                                                                                                                                      |
| Joining late       | open the invite link any time: you appear beside the friend furthest ahead, with 2.5 s of protection                                      |

## Soldier

|              |                                                                                                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health       | **100 HP**. A soldier bullet takes 9, a turret 11, boss attacks 16–22. 0.4 s of flinch protection after a hit                                                                                                                 |
| Regeneration | not hit for 3.5 s: health refills at 12 HP/s                                                                                                                                                                                  |
| KO           | at 0 HP you're knocked out and come back **3 s** later beside the squad, at full health, using one squad life. With no lives left you wait until a boss kill brings a life back                                               |
| Pits / river | cost 25 HP and put you back on the last safe ground                                                                                                                                                                           |
| Run / jump   | 150 px/s (~4.4 body lengths a second); jump ~121 px (3.8 tiles) in 0.83 s, let go early for a short hop; jump still works 0.1 s after running off a ledge                                                                     |
| Double jump  | press Jump again in the air (+~95 px), once per jump                                                                                                                                                                          |
| Dash         | ~3 tiles in 0.2 s; **bullets and touches pass through you** (i-frames last 0.12 s longer than the dash). One air dash per jump, 0.55 s cooldown                                                                               |
| Slide        | Down + Dash on the ground: 0.38 s low slide, slips under shots, knocks troopers over (3 damage, no touch damage to you)                                                                                                       |
| Knife        | 5 damage (a blaster shot does 1), 0.36 s cooldown. Firing with an enemy in reach knifes automatically. Breaks riot shields (double damage to them) and **parries**: swats enemy bullets, grenades and missiles out of the air |
| Aim          | 8 directions; down only in the air. Crouch (Down, standing still) to duck                                                                                                                                                     |
| Platforms    | one-way: jump up through them; Down + Jump drops through                                                                                                                                                                      |
| Going down   | a KO costs your special weapon (back to Blaster)                                                                                                                                                                              |

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
| Blaster         | 0.24 s     | 1      | default                              |
| **S**pread      | 0.40 s     | 0.7 ×5 | 5-shell fan, short range             |
| **M**achine gun | 0.11 s     | 1      | very fast                            |
| **L**aser       | 0.38 s     | 2      | passes through every enemy in a line |

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
| **WARHOUND** (walking tank) | 50 + 70 per player | cannon (3 arcing shells), machine-gun sweep, **charge** (0.85 s tell, then rushes the arena: double-jump over it or dash through), **stomp** (two shockwaves along the floor: jump them). Below 50%: faster, double stomps          |
| **VULTURE** (gunship)       | 45 + 65 per player | strafing gun, **bombing run** across the arena, slow homing **missiles** (shoot or knife them down), drops 2 jetpack troopers. Below 50%: lower, faster, 4 missiles                                                                 |
| **IRON FORTRESS** (final)   | 75 + 90 per player | cannon volleys and a floor **laser**: low beam → jump, high beam → duck/slide (1 s tell, burns 0.5 s). Phase 2 (60%): ground slams + drones. Phase 3 (30%): faster, a low beam chased by a high one. Blocks the way while it stands |

## Pace (why these speeds)

Tuned on 1 Nov 2026 after play on phones felt too fast. Reference: NES Contra (1987), from its annotated disassembly ([vermiceli/nes-contra-us](https://github.com/vermiceli/nes-contra-us)): the player walks 1 px per frame (60 px/s, about 2 body lengths a second), jumps at 5.94 px/frame against 0.137 px/frame² gravity (~129 px, 1.45 s in the air), and the default gun fires 3 px/frame (180 px/s). Characters are about the same pixel size here (34 px), so those numbers translate directly. Strike Squad sits between that and a modern pace: walking 150 px/s (was 215), jumps last 0.83 s (were 0.72 s, same height so the level is unchanged), shots 520 px/s (were 640) at a 0.24 s fire rate (was 0.2), enemy shots 220 px/s (were 270) so there is time to react, enemies and bosses a little slower too. Boss health came down ~15% so the slower fire rate does not drag solo fights out.

## Measured difficulty (computer squads)

`npm run playtest -- 10 normal 0.6 1,2,4 <mission>`, 10 runs per squad size, 3 Nov 2026. The computer players aim perfectly; skill 0.6 means they react to only ~60% of incoming attacks. Treat this as a relative guide, not human win rates.

| Normal, won (avg time) | 1 player     | 2 players      | 4 players    |
| ---------------------- | ------------ | -------------- | ------------ |
| Mission 1              | 80% (6.2 m)  | 100% (3.3 m)   | 90% (3.0 m)  |
| Mission 2              | 70% (8.0 m)  | 100% (5.2 m)   | 90% (4.6 m)  |
| Mission 3              | 30% (8.6 m)  | 80% (6.0 m)    | 90% (5.1 m)  |
| Mission 4              | 10% (9.8 m)  | 30–50% (7.2 m) | 50% (6.2 m)  |
| Mission 5 (advanced)   | 50% (10.2 m) | 63% (7.2 m)    | 100% (5.6 m) |
| Mission 6 (advanced)   | 25% (12.7 m) | 63% (8.3 m)    | 88% (6.9 m)  |

(Missions 5–6: 8 runs per size, 3 Nov 2026.) With perfect-reaction bots, 4 players: mission 5 100%, mission 6 83% (6 runs). Mission 4 with perfect-reaction bots (skill 1), 4 players: 100% (6 runs). On Easy, mission 4 is 90% solo. Failed runs now end on lives at the final bosses, not on getting stuck: every mission is also played to the end by a computer squad in the unit tests.
