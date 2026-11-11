# Astra Saga: design

Ten stages, each built around one astra and the rule its story gives it. The astras are the hero's powers; enemies
are asura, rakshasa and naga hosts; every character and boss name is original (no god, avatar or epic hero appears as
a character). The game says "inspired by the Indian epics" and does not claim to retell them.

Data: `shared/src/saga.ts` (stages), `shared/src/config.ts` (`powers`, `bossAstra`), rules in `shared/src/sim.ts`.

## The hero's astras

| Astra             | Pickup     | What it does                                                           | Rule from its story                |
| ----------------- | ---------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Agneyastra        | `a`        | Wall of fire with pillars behind it, burning ground; sets foes alight  | Fire ordinary means cannot put out |
| Varunastra        | `w`        | Rain ahead: puts out walls of fire, hurts foes                         | The water astra, agni's answer     |
| Vayavyastra       | `v`        | A whirlwind that walks ahead, carries troopers up and hurls them       | A gale that lifts an army          |
| Nagastra          | `n`        | Three serpents that steer into the nearest foes (through rock)         | The serpent never misses           |
| Garudastra        | `g`        | Clears enemy serpents and shots nearby, crushes flyers, shields you    | The eagle, the serpent's counter   |
| Sudarshana Chakra | `c`        | Discus that hits up to six different foes, then flies back to you      | Infallible, returns to its wielder |
| Pashupatastra     | `p`        | One of three forms per call: trident strike, spirit ally, rain of fire | A new form every time              |
| Vaishnavastra     | `x`        | Golden bolt; near a boss's orb it turns the orb back on the boss       | Only a vaishnava stops a vaishnava |
| Brahmastra        | team meter | Strikes the whole screen; answers a brahmashirsha                      | It answers most astras             |

## The bosses' astras

| Boss astra    | Tell                                           | Counter                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nagastra      | Closing violet rings, serpent heads rise       | Shoot the serpents, dash, or Garudastra                                                                                                                                                                                                      |
| Narayanastra  | A halo of arrows in the sky                    | Stop attacking. Each soldier who keeps fighting draws more arrows every volley (1 to 6). The boss is untouchable during the storm, then spent (stunned, 1.5x damage). If nobody fought the first storm, the second call rebounds on the boss |
| Vaishnava orb | Golden orb gathers                             | Cannot be shot down, gusted, parried or swallowed. Take the Vaishnavastra from the arena altar and fire it near the orb                                                                                                                      |
| Brahmashirsha | Four heads of light and a growing pillar (4 s) | Fire the team Brahmastra during the charge: both cancel, the boss is stunned and hurt. While it charges, the ASTRA button calls the Brahmastra even if you hold another astra. Otherwise dash as it lands; it also scorches its caller       |

## Stages

| #   | Stage                                  | Astra                             | Bosses                                               |
| --- | -------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| 1   | Agnivan, the burning forest            | Agneyastra                        | Jwala-Asur, Agni-Daitya                              |
| 2   | Sagar Setu, the sea bridge             | Varunastra (fire walls)           | Makara, Samudra-Rakshas                              |
| 3   | Vayu Shikhar, the storm peaks          | Vayavyastra (storms bend shots)   | Garjan-Rakshas, Vayu-Daitya                          |
| 4   | Naag Lok, the serpent underworld       | Nagastra + Garudastra             | Vish-Naag, Visharaj (both call serpents)             |
| 5   | Maya Nagri, the city of illusions      | Brahmastra team meter             | Chhaya-Asur, Maya-Senapati                           |
| 6   | Bhasm Parvat, the ash mountain         | Pashupatastra                     | Bhasma-Pret, Kaal-Pret                               |
| 7   | Samarpan Maidan, the great battlefield | Narayanastra (bosses)             | Ran-Bhairav, Ran-Guru                                |
| 8   | Chakra Durg, the discus fortress       | Sudarshana Chakra                 | Chakravyuh (twin beasts), Chakra-Vimana, Vyuh-Senani |
| 9   | Dwand Bhoomi, the duel ground          | Vaishnavastra (bosses + altars)   | Dwand-Yodha, Dwand-Raj                               |
| 10  | Mahayuddh, the last war                | Brahmashirsha (boss) + everything | Shesh-Daitya, Vajra-Vimana, Maha-Asur Kaal           |

Each stage has its own art style (`vana`, `sagar`, `shikhar`, `naglok`, `maya`, `bhasm`, `kurukshetra`, `chakra`,
`dwand`, `mahayuddh`) and its own army (`SAGA_HOSTS` in `client/src/game/sprites.ts`): fire asuras with horns, sea
rakshasas with fin crests, hooded storm riders, naga warriors, maya palace guards, ash ghosts in grave wraps, helmeted
war-field soldiers, horned fort guards, golden duellists, and the black-and-gold last host.

### Stage shapes

Every stage also has a shape of its own, so stage 6 never feels like stage 2 in a new colour. Six terrain shapes
were added for this (`shared/src/course.ts`), next to the classic flat, pits, bridge, steps, towers and catwalks:

| Shape     | What it is                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------- |
| `ascent`  | terraces up to a long high plateau with a foxhole and a lookout, then a cliff down                |
| `chasm`   | no ground: a chain of floating ledges at changing heights over the drop                           |
| `tunnel`  | a cave: rock roof over the top of the screen, stalactites to walk under, a shelf to fight from    |
| `trench`  | a war trench two tiles deep, sandbag cover, a mound in the middle, planks above                   |
| `rampart` | a fortress wall on arches: climb it and run its top (turrets, loot), or walk the passage under it |
| `pillars` | wide stone pillars of different heights rising out of a pit                                       |

Arena rooms come in five shapes too (`classic`, `tiers`, `twin`, `open`, `high`); only the platforms change, the
floor stays flat so bosses walk and charge as before.

| #   | What makes it different                                                                   | Stash (hidden perch)        |
| --- | ----------------------------------------------------------------------------------------- | --------------------------- |
| 1   | climb the burning slope, then burn the crowd packed in the ember trench; smoke pillars    | spread gun above the slope  |
| 2   | the broken bridge: hop the wreckage over the sea; a sea wall to climb or slip under       | laser above the coral steps |
| 3   | an updraft gorge (a wind column lifts you over the gap), thin air, lightning peaks        | laser in the thin air       |
| 4   | two caves under rock roofs, a serpent pit, a pillared sunken temple                       | spread gun in the cave roof |
| 5   | two roads at every wall (over it or under it), illusion storms that bend every shot       | machine gun on the terraces |
| 6   | the mountain itself: a long climb, a gorge of ash ledges, a shrine cave, ash peaks        | laser in the shrine roof    |
| 7   | the battlefield: two war trenches, a chariot wall, an open field of arrows                | spread gun on the wall      |
| 8   | ring after ring: a wall, a ring arena, blade pillars, the twin beasts, the inner wall     | machine gun on the wall     |
| 9   | a gauntlet of duels: five arenas with short walks between them                            | laser in the hall roof      |
| 10  | one last stretch of everything: fire road, shattered bridge, ash tunnel, the last rampart | spread gun in the tunnel    |

A stash is reached with a double jump to a step ledge and another to the perch (in a cave, a pocket in the roof you
walk out of). It is never needed to finish, it rewards players who look around and try.

`shared/tests/saga.test.ts` keeps it that way: no two stages may run the same order of terrain, every stage uses at
least two of the new shapes and more than one arena shape, no enemy list or wave set may be copied anywhere in the
saga, and every stage must have a stash with loot on it.

## Bosses: a body and a fighting style each

Every saga boss has its own **style** (`shared/src/boss-styles.ts`, picked by its arena's name): which attacks it
uses, in what order, phase by phase. Styles mix each body's classic attacks with six saga moves, so no two saga
bosses fight alike (a test checks every attack order is different):

| Move   | What happens                                                          | How to answer                             |
| ------ | --------------------------------------------------------------------- | ----------------------------------------- |
| rain   | fireballs fall on a line of spots around you; red rings mark each one | step off the rings                        |
| ring   | a ring of shots (two from phase 2, the gaps shifted)                  | slip through a gap                        |
| spiral | a spinning two-armed stream for 1.6 s                                 | circle round it, or wait in a gap         |
| leap   | (walkers) a huge jump at you, shockwaves both ways on landing         | jump the shockwave                        |
| blink  | (walkers, flyers) vanishes and reappears on your other side           | turn round fast                           |
| summon | calls 2 warriors through portals or out of the ground (max 4)         | the portal shows 0.9 s before they arrive |

Each boss is also **drawn** as its own creature (`client/src/game/asura-art.ts`), built from parts: a head (horns,
lion mane, cobra hood, tusks, bird beak, skull, crown, mask, makara jaw, matted locks), one to five heads, two to six
arms, a weapon (trident, mace, sword, axe, bow, chakra, conch, noose, vajra), an aura (embers, droplets, wind, venom,
ash, illusion sparkles, lightning, gold, blood, cosmos) and, for final bosses, a throne that sets the mood (lava rock,
coral, cloud, serpent coils, maya palace, bone pile, war chariot, fort wall, golden seat, a dark lotus). Walkers come
as a beast, a serpent, a warrior or a floating wraith; flyers as a makara, a storm rider on a cloud, a shadow mask or
a sky chariot. To see them all: `npm run dev -w client`, then open `/tools/bosses.html` (`?at=14` shows the ring tell).

| Stage | Boss (body)                      | Moves it adds                     |
| ----- | -------------------------------- | --------------------------------- |
| 1     | Jwala-Asur (fire lion)           | fire rain                         |
| 1     | Agni-Daitya (4-armed king)       | fire rain                         |
| 2     | Makara (flying sea beast)        | rings                             |
| 2     | Samudra-Rakshas (tide king)      | rings, tidal slams                |
| 3     | Garjan-Rakshas (storm rider)     | lightning rain, jetpack portals   |
| 3     | Vayu-Daitya (bird lord)          | spirals, rain                     |
| 4     | Vish-Naag (cobra)                | leaps, spirals                    |
| 4     | Visharaj (5-hooded king)         | warriors from the ground, spirals |
| 5     | Chhaya-Asur (shadow mask)        | vanishes, spirals                 |
| 5     | Maya-Senapati (6 arms, 3 faces)  | rings, shield guards via portals  |
| 6     | Bhasma-Pret (ash wraith)         | vanishes, rings                   |
| 6     | Kaal-Pret (3 skulls)             | ash rain, the dead rise           |
| 7     | Ran-Bhairav (tusked giant)       | leaps, shield guards              |
| 7     | Ran-Guru (archer king)           | grenadiers, rain, rings           |
| 8     | Chakravyuh (twin blade wheels)   | spirals, leaps                    |
| 8     | Chakra-Vimana (sky chariot)      | spirals                           |
| 8     | Vyuh-Senani (6-armed keeper)     | spirals, shield guards, rings     |
| 9     | Dwand-Yodha (champion)           | leaps, vanishes, rings            |
| 9     | Dwand-Raj (3-faced king)         | rings, rain, spirals              |
| 10    | Shesh-Daitya (5-headed serpent)  | spirals, leaps, rain, rings       |
| 10    | Vajra-Vimana (thunder chariot)   | rain, rings                       |
| 10    | Maha-Asur Kaal (5 heads, 6 arms) | everything, the dead rise         |

Final bosses with a style no longer send the classic drones in phase 2; they bring their own reinforcements. The
boss's WARNING card shows its title and up to three of its moves with how to answer them.

### The whirlwind, the fire, and the bow

- **Vayavyastra** raises a whirlwind (bhavandar) that walks forward for 3.2 s. It picks up as many as eight
  troopers within reach (riot shields are torn off), carries them round and up its column, sweeps up enemy shots,
  and when it blows out hurls everything it held to both sides. Bosses and turrets are too heavy: the wind only
  wears at them. (`Sim.stepTwisters`, numbers in `GAME_CONFIG.powers.vayu`.)
- **Agneyastra** sets alight whatever its fire touches. A burning trooper keeps burning for 3 s after it leaves
  the flames and passes the fire to those it brushes; the fire is handed on twice at most, then dies out.
- **Wind feeds fire.** A whirlwind that crosses burning ground catches light and sets everything it carries
  alight. No other pair of astras combines; this one is the reason stage 1 now hands out both.
- **The bow.** Every astra is loosed from a bow (dhanush): it is slung across the back of a hero who carries an
  astra, and comes into the hands as the astra is fired (tilted to the sky for Varuna, Garuda and Pashupata). It is
  a picture only: the astra takes effect on the same tick the button is pressed (`astra-art.ts`).
- **No stage is about one astra any more.** Each stage still teaches its own astra first, but hands out at least
  one other on the way (a test checks every stage offers two or more).

## Pacing: fight, rest, travel, fight

Measured with computer squads before this change, a stage was a fight for 71-90% of its length and its longest
quiet stretch was 3-10 seconds. Three things now give it room to breathe:

- **Rest stops (ashrams).** After every fight but the last, the course builder adds a 22-tile stop
  (`withRests` in `shared/src/course.ts`): no enemies, a checkpoint, a medkit, a sacred fire that heals at once
  (25 health a second, no wait), and an astra pedestal that refills so every soldier of the squad can take from
  it. The pedestals go round the astras the stage hands out; with a wall of fire still ahead they offer rain.
  The stage's hazard leaves a squad alone while all of it is resting.
- **A breath after a fight.** The hazard holds off for 7 s after an arena falls, and the next wave of an ambush
  comes 2.5 s after the last one is down (it was 1.2 s).
- **Astras to spend.** A pickup gives 3 charges of most astras (2 of Varuna, Garuda, Pashupata, the black hole),
  a soldier can carry 4, and every 6 kills by weapon or blade return one charge of the astra in hand (kills by
  the astra itself do not count).

After the change the same squads fight for 59-86% of a stage, with several quiet stretches of 6-14 s, and loose
about twice as many astras (5-25 a run, from 4-16). Computer players run straight through a stop; people will
stay longer. Stage 2 alone is still the tightest (86%).

Heroes carry an archer's kit on top of their own look: a quiver on the back, a waist sash with trailing ends, a
gold armband and shoulder rim (`drawQuiver`, `drawSash` in `hero-hd.ts`).

## Battle arrays (vyuhas)

How a wave arrives is no longer only "left, right or sky". An ambush arena names a battle array for each wave
(`ArenaSpec.vyuha`, `Sim.formUp`), after the formations in the old war books:

| Array         | How it comes at the squad                                                            |
| ------------- | ------------------------------------------------------------------------------------ |
| Chakra        | The wheel: rings rise out of the ground round the squad, the inner ring first        |
| Ardha-chandra | The half-moon: both horns close in from the two ends at once, flyers over the middle |
| Makara        | The crocodile: the heavy jaw from one end, the other jaw shuts behind 2 s later      |
| Suchi         | The needle: one file through one end, the toughest at the point                      |
| Vajra         | The thunderbolt: three tight knots drop out of the air together                      |
| Garuda        | The eagle: a beak leads, wings of flyers on both sides, the body follows             |

The array decides who enters where and when; the wave still decides who is in it. Which end an array leads from is
the match's own dice. Dropped troopers always land on the arena floor (never on a ledge the squad would have to
climb to), and an arena waits for late arrivals before it can clear. The array's name is shown with the wave call.
Every stage uses at least two arrays; the last war goes through five.

## The daily trial

One battle a day, the same for every player that day (`shared/src/daily.ts`): a stage from the first eight, dealt
a stage-wide hazard it does not normally have, two astras of the day on its astra pedestals (Varuna and Vaishnava
pedestals stay, stages need them), and one battle array leading every ambush. It is solo, built in the browser from
the date, and keeps its own record (best score of the day, days won in a row; 2 shards for the first win of a
day). It does not clear or unlock the stage it borrows.

## Waves: where enemies come from

Wave tokens gained two entrances and an elite mark (`shared/src/course.ts`, `parseWave`):

- `P`: through a portal inside the arena, `U`: out of the ground next to a soldier. Both are announced (a swirling
  portal or cracking ground) 0.9 s before the enemy steps out, and the arena counts them before it can clear.
- `*` after the kind (`S*R`): an **elite** trooper with three times the health, a glowing halo and an ELITE star.
  Its killer gets ult charge, 15 health and triple score.

Each stage uses them its own way: the sea rises out of the water (2), storm portals (3), nagas out of the ground (4),
illusions everywhere through portals (5), the dead rising (6), elite champions on the war field (7, 9), portal
pincers in the fort (8), and all of it in the last war (10).

## Stage twists: no two stages play alike

Every stage names its twist as it begins (`SagaStage.twist`), and two rules in the simulation carry most of them:

- **Hold-out arenas** (`ArenaSpec.survive`, seconds). Instead of clearing a fixed list of waves, the squad
  survives a countdown while the waves keep coming round (the next one as soon as one attacker or none is left);
  when the time is up the attackers flee and the gate opens. The HUD shows `SURVIVE 0:17` instead of the wave
  count. Stages 2 (Hold the Bridge), 4 (The Nest Wakes), 7 (Hold the Line) and 8 (Second Ring).
- **Stage hazards** (`CourseDef.hazard`, one per stage; numbers in `GAME_CONFIG.hazards`):
  - `skyfall` (stages 6 and 10): every few seconds fireballs fall round one soldier, each on a spot marked on
    the ground first. Rests while a boss is awake.
  - `raid` (stage 3): flying raiders dive in from behind the squad. Capped, and never while an arena is locked.
  - `tremor` (stage 4): a shockwave runs along the ground at a standing soldier from over a second away: jump it.
  - `dark` (stage 5): the world goes dark for a few seconds at a time; only a pool of light round each soldier,
    enemies' glow and every shot stay visible. Drawn by the client from the tick (`darknessAt`); the rules do
    not change, and a stage never opens in the dark.
- **Mirrored waves.** A wave may come in with left and right swapped, by the match's own dice, so the same
  arena does not play out the same way twice.

Together with each boss's own fighting style, the wave entrances and the terrain fields (low gravity, lifts,
gravity wells), this is what keeps stage N from feeling like stage N-1 again. Numbers: `GAME_CONFIG.hazards`.

## Secrets

Every stage hides one stash on a high perch. Its loot is marked `secret` (`PickupSpawn.secret`, set by the course
builder for loot standing on the stash column), and the client calls attention to it: a shaft of light over the perch
that can be seen from below, sparkles, and once a soldier is within 9 tiles a bobbing 🗝 SECRET sign and a dotted arc
of the last jump. Taking it fires a `secret` event: a gold flash, a banner, and (first time per stage) 2 astra shards.
The stage card shows `🗝 Secret: ?` until found, and the saga screen counts secrets out of 10.

## Astra apparitions (no text)

Calling an astra shows the astra itself, never a banner (`client/src/game/astra-cine.ts`): no banner for
picking one up (the held-astra chip and the glowing ASTRA button say it), none for a teammate's or a boss's
astra, none for the brahmastra. The only astra text left is the one-line HUD instruction while a boss astra is
live (for example STOP FIRING), because the squad needs it to survive. Every call opens a sigil
(a ground mandala of two counter-turning rings and sixteen petals, and a halo behind the caster), gathers light into
the caster, bursts in rays, and the sky takes the astra's colour. Then each astra's own apparition crosses the field:

| Astra       | Apparition                                                       |
| ----------- | ---------------------------------------------------------------- |
| Agneyastra  | a phoenix of fire sweeping forward, flame ribbons for a tail     |
| Varunastra  | a great wave curling over the field, light shafts through spray  |
| Vayavyastra | a tornado spiral ahead of the caster, wind streaming into it     |
| Black hole  | a dark core, a lensing ring, an accretion swirl pulling stars in |
| Nagastra    | a giant cobra rising over the field, hood spread, swaying        |
| Garudastra  | the golden eagle diving across the sky with a wind wake          |
| Sudarshana  | a vast golden chakra spinning behind the hero, spokes of light   |
| Pashupata   | the third eye opening in the sky, a trident of lightning below   |
| Vaishnava   | a lotus of light opening at the hero's feet, motes rising        |
| Brahmastra  | a white-gold sun disc gathering over the field before the strike |

All of it is paths and gradients drawn with additive light: no images, about 1.5 s each. A teammate's astra adds one
quiet line to the feed instead of a banner.

## One art style, and controls shown as keys

CrazyGames' quality guide asks for one consistent art style and for onboarding with pictures rather than text:

- Saga bosses and astra apparitions are vector drawings, but they are drawn at world resolution (one pixel per sprite
  pixel) and enlarged with hard edges (`Renderer.pixelated`), so they share the heroes' pixel-art look.
- The first time someone plays, the controls appear as key caps with one word each (Move, Aim, Jump ×2, Fire, Dash,
  Knife, Super, Astra), labelled with the player's own keyboard layout where the browser tells it (AZERTY players
  see Z Q S D). Touch players see the thumb controls instead.

## Music

The game has its own score (`client/src/audio/music.ts`), played live with WebAudio: a tanpura drone, a bass on the
beat, tabla (a pitched "dha" and a ringing "na") and a bansuri-like flute improvising in the stage's raga. Every saga
stage has its own raga, root and tempo (Bhairav for Agnivan, Durga for Sagar Setu, Bhupali for Vayu Shikhar, Malkauns
for Naag Lok, Marwa for Maya Nagri, Todi for Bhasm Parvat, Kafi for Samarpan Maidan, Desh for Chakra Durg, Bhairavi
for Dwand Bhoomi, Bhairav again, lower and faster, for Mahayuddh). Boss fights switch to a battle variation (harder
tabla, a growling lead, faster); menus play a calm alap with no drums. Music has its own setting (Settings → Music)
and follows the volume, the mute switch and the portal's mute.

## Progress and continues

- Stage 1 is open; each stage opens when the one before it is cleared. The menu's big button plays the next stage in
  one click.
- Stars per run: 1 for clearing, +1 with a squad life to spare, +1 with a life to spare for every soldier.
- Every win pays astra shards equal to its stars. A new player starts with 3.
- Out of lives in a solo run: once per run, continue with 3 squad lives by watching a video (portal builds only) or for
  3 shards.
- Finding a stage's hidden stash pays 2 shards, once per stage.

## Balance checks

`shared/tests/saga.test.ts` has a test per astra and per boss astra, plays every stage with a 4-soldier computer
squad on normal, and plays every stage alone and as four over 4 seeds each: a run may be lost, but it must never get
stuck (a time-out means the level has a spot a squad cannot get past), and the bots must win at least 3 in 4.
A measurement after the stage redesign (3 seeds each, normal; not a test, numbers from one run):

- 1 soldier: 26 of 30 runs won, 3.5 to 8 minutes per stage.
- 2 soldiers (you + 1 buddy): 30 of 30 runs won, 2 to 6 minutes per stage.
- 4 soldiers: 30 of 30 runs won, 2 to 4.5 minutes per stage.

After the boss styles, new waves and elites (4 seeds each, normal; again one run, not a test):

- 1 soldier: 39 of 40 runs won, 4.4 to 6.8 minutes per stage on average.
- 4 soldiers: 40 of 40 runs won, 1.9 to 4.4 minutes per stage on average.

`shared/tests/boss-styles.test.ts` fights every saga boss with computer players and checks that every move of its
first phase shows up and does what it says (meteors fall, rings fill the air, blinks move it, portals open).

Real players are slower to react than the bots and better at reading the tells, so treat these as a rough guide and
watch the portal's playtime and retention numbers.
