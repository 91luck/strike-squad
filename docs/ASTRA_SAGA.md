# Astra Saga: design

Ten stages, each built around one astra and the rule its story gives it. The astras are the hero's powers; enemies
are asura, rakshasa and naga hosts. Every character, boss, place and astra name is original: no god, avatar, epic
hero or villain appears, in name or in art (no shrine or figure of a deity either), and no named weapon of the epics is
used. The legends are only a reference for what makes a stage interesting. Ordinary Hindi and Sanskrit words (agni,
vayu, naag, maya, astra, asur, rakshas) are used as words, not as names. The game says "inspired by Indian legends"
and does not claim to retell them. Keep it that way when adding content.

Data: `shared/src/saga.ts` (stages), `shared/src/config.ts` (`powers`, `bossAstra`), rules in `shared/src/sim.ts`.

## The hero's astras

| Astra       | Pickup     | What it does                                                           | Rule from its story                |
| ----------- | ---------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Agniastra   | `a`        | Wall of fire with pillars behind it, burning ground; sets foes alight  | Fire ordinary means cannot put out |
| Jalastra    | `w`        | Rain ahead: puts out walls of fire, hurts foes                         | The water astra, agni's answer     |
| Vayuastra   | `v`        | A whirlwind that walks ahead, carries troopers up and hurls them       | A gale that lifts an army          |
| Naagastra   | `n`        | Three serpents that steer into the nearest foes (through rock)         | The serpent never misses           |
| Shyenastra  | `g`        | Clears enemy serpents and shots nearby, crushes flyers, shields you    | The eagle, the serpent's counter   |
| Chakram     | `c`        | Discus that hits up to six different foes, then flies back to you      | Infallible, returns to its wielder |
| Vidyutastra | `p`        | One of three forms per call: trident strike, spirit ally, rain of fire | A new form every time              |
| Tejastra    | `x`        | Golden bolt; near a boss's orb it turns the orb back on the boss       | Only a tej stops a tej             |
| Paramastra  | team meter | Strikes the whole screen; answers a pralay                             | It answers most astras             |

## The bosses' astras

| Boss astra    | Tell                                           | Counter                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naagastra     | Closing violet rings, serpent heads rise       | Shoot the serpents, dash, or Shyenastra                                                                                                                                                                                                      |
| Samarpanastra | A halo of arrows in the sky                    | Stop attacking. Each soldier who keeps fighting draws more arrows every volley (1 to 6). The boss is untouchable during the storm, then spent (stunned, 1.5x damage). If nobody fought the first storm, the second call rebounds on the boss |
| Tej orb       | Golden orb gathers                             | Cannot be shot down, gusted, parried or swallowed. Take the Tejastra from the arena altar and fire it near the orb                                                                                                                           |
| Pralay        | Four heads of light and a growing pillar (4 s) | Fire the team Paramastra during the charge: both cancel, the boss is stunned and hurt. While it charges, the ASTRA button calls the Paramastra even if you hold another astra. Otherwise dash as it lands; it also scorches its caller       |

## Stage 1 rebuilt: Agnivan, a stage of its own

The first stage of the redesign (design doc: "10 naye stages ka design"). It shares nothing with the template the
other stages still use:

- **No gates, no ambush arenas.** A wall of fire (the burning of the Jwala forest) chases the squad from behind
  (`GAME_CONFIG.chase`): it starts 7 s in, creeps at 44/54/64 px/s (easy/normal/hard), is never more than 330 px
  behind the rearmost soldier, burns whoever it touches, throws anyone caught inside it forward, swallows foes, waits
  outside the river rest stop until the squad is through, and becomes the back wall of the boss's grove. When it
  is just off screen its flames lick in at the left edge.
- **Its own rakshasas:** fire imps (`imp`: run in, leap, burst), burning bats (`bat`: hang to one side, then dive
  across dropping embers), tree demons (`treant`: bark in front takes 0.3x damage, the back 1.6x; they turn slowly,
  so get behind them; they lob burning logs).
- **Set pieces:** A great discus cuts a burning tree that falls across a ravine as the bridge; the path forks into
  high boughs (loot) or the hollow under the roots; the river bank rest stop with Agni's shrine; then the fire leaps
  ahead (a thicket of burning trees across the path) and the only way on is down into the stream bed under it.
- **Its own boss, Jwala Vriksh-Asur** (`vriksha`), a burning banyan rooted at the end of the grove: roots racing
  along the ground (jump them), burning fruit lobbed onto the squad, fire breath sweeping from its mouth. Below 55%
  its bark hardens: shots fired from the floor do 0.15x; climb the boughs (platforms up to row 5) and hit the heart
  from above 150 px. In phase 2 imps crawl out of its roots.

Not built yet from the design: the stage's hidden collectible, its three challenges, and a victory scene.

## Stage 2 rebuilt: Sagar Setu, the sea is the enemy

- **the floating stones** (`LevelDef.plats`, kind `stone`): stood on, a stone starts sinking after 0.8 s at 26 px/s
  and stops holding anyone 46 px down; left alone it floats back (`GAME_CONFIG.sea`).
- **The tide** (`LevelDef.tide`): the sea's surface swings ±0.6 tile every 9 s; high water covers the shoals, and
  wading is slow (55% speed). JALASTRA holds the tide at its lowest for 8 s.
- **The boat** (`plats`, kind `boat`): boards, sails across open sea at 95 px/s with a rail (nobody walks off it),
  and sails back for anyone left behind once it has stood empty at the far bank for 2 s.
- **Its own rakshasas:** makara riders (`makar`: wait under the sea, leap across a soldier who comes near, spit at
  the top), crab asuras (`crab`: the shell takes 0.25x from the front, 1.5x from behind; they lunge with claws),
  conch blowers (`conch`: a surge of water along the ground to jump, then a spray).
- **Rest stop:** the ferryman's boat on the sand.
- **Its own boss, Chhaya** (`chhaya`), the shadow-catcher who seizes whatever flies over by its shadow: a dark pool follows a
  soldier's shadow and holds still, then her hand bursts up out of it; after a grab her jaws hang open for 2.6 s,
  the only time shots do full damage (0.2x otherwise). Tidal surges, water spat in arcs. Jal's rain makes her
  gasp with her jaws open.

## Stage 3 rebuilt: Vayu Shikhar, the climb

- **A stage that climbs.** Levels can now be taller than the screen: each stretch (`Section.rise`) sits higher
  or lower than the one before (the course builder shifts it with `Builder.dy`), and the camera follows the squad
  up and down. A climb is a `cliff`: ledges zig-zag up beside the face, one every three rows. Vayu Shikhar climbs
  36 rows (a 54-row level) to Meghgiri's summit.
- **Gusts** (`LevelDef.gusts`, `GAME_CONFIG.gusts`): every 7 s (±2) the wind blows one way for 2.2 s at 95 px/s,
  after a 1.1 s warning (chevrons at the edge it comes from, dust lifting). Crouching cuts the push to 35%. There is
  no wind in the cave (the rest stop).
- **Its own rakshasas:** wind demons (`harpy`: hang high to one side, shed feathers, swoop straight through a
  soldier), boulder rollers (`roller`: heave boulders down from the ledges), cloud lancers (`lancer`: ride a cloud,
  raise a crackling javelin for 0.6 s, then hurl it fast).
- **Its own boss, Aandhi** (`aandhi`), who sits as a sage on Meghgiri to waylay travellers: a sage in saffron until
  the fight, then the rakshasa. His guise turns 65% of every blow, except while he holds up a storm (3 s, driving
  the squad toward the drop behind them at 150 px/s). Boulders, lightning javelins, a call to the wind demons.
  VAYUSTRA cast into his storm turns it on him (10% of his health, 2.2 s reeling and wide open).

## Stage 4 rebuilt: Naag Lok, down into the dark

- **A stage that goes down** (negative `rise`): drop after drop, 22 rows below the start. A cave entered from
  above opens as a shaft first, so the squad falls in rather than meeting its roof.
- **The dark** (`LevelDef.dark`): a veil over the screen with holes of light around each soldier (smaller in the
  Andhi Surang), glowing mushrooms, poison, venom in the air, eggs and eyes; the rest stop is lit.
- **Poison pools** (field `poison`, `Section.pools`): 9 damage a second while you stand in them.
- **Its own rakshasas:** naga warriors (`serpent`: 16 px tall, so a standing shot passes over them; crouch),
  wall cobras (`spitter`: venom in arcs), serpent eggs (`egg`: hatch two warriors 5 s after a soldier comes near).
- **Rest stop:** Sarpraj's shrine with the pot of amrit.
- **Its own boss, Vishdhar** (`vishdhar`) in the poisoned lake: his scales turn 70% of every shot. Three of his heads
  bob out of the lake (moving surfaces over loops of his coils); landing on a head, one after another,
  costs him 3% of his health each time. Venom from the heads, a fourth head lunging low across the lake,
  a rain of poison.

## Stage 5 rebuilt: Maya Nagri, nothing is what it seems

- **Illusions** (`illusion` land; `plats` kinds `fake` and `hidden`): marble floors over a drop that give way 0.25 s
  after a soldier steps on them (back after 3 s), and hidden floors that hold where nothing seems to be (a shimmer
  now and then gives them away).
- **MAYASTRA** (new astra, `maya`, loot letter `y`): for 10 s every illusion shows as it is (false floors in red,
  and they hold; hidden floors in gold), mirror shades nearby vanish, and the great mirror goes dull for 6 s.
- **Its own rakshasas:** mirror shades (`mirror`: keep to where a soldier's reflection would be across their mirror
  frame and shoot back), dancers (`dancer`: vanish, reappear just behind a soldier, strike after 0.45 s), painted
  guards (`painting`: only paint, untouchable, until a soldier comes close; then they step out and lunge).
- **Rest stop:** the garden of the hall with its lotus pool.
- **Its own boss, Darpan-asur** (`darpan`), the great mirror: while it shines every shot is turned straight back at
  the squad; after its show of reflections (two mirror shades) it is dull for 4 s, and only then does it break.
  A sweeping beam of light, a rain of glass. Computer players hold fire while it shines.

## Stage 6 rebuilt: Bhasm Parvat, the climb before the lava

- **Lava rising** (`lava` flag, `GAME_CONFIG.lava`): 6 s after the start the volcano's lava begins to climb behind the
  squad and never lags more than 360 px below the lowest soldier. Standing in it burns; a soldier who sinks is lifted
  to the nearest ground above it. It holds below the stone shrine rest stop and below the rim arena.
- **The climb**: the course goes up (`rise` 7, 8, 8 rows), so the stage is a vertical race, not a walk.
- **Its own rakshasas:** prets (`pret`: ghosts that drift through rock toward a soldier), ash golems (`golem`: plain
  weapons only knock them into a heap that rises again after 4 s; an astra, a super or fire finishes them), and
  skull-lamp carriers (`lantern`: keep their distance and call up a pret every 6 s, never more than three about).
- **Rest stop:** a small stone shrine with a lamp and bells.
- **Its own boss, Raakhasur** (`raakhasur`): his body takes a quarter of the damage; he rushes to put his burning
  hand on a soldier's head (30 damage), sends ash waves along the ground and rains ash. Nartaki's dance: she appears
  over him and shows three poses, one per beat (an arrow and a beat ring); if any soldier holds each pose (up, down,
  left, right) in its beat, he copies the last one, puts his hand on his own head and burns (15% of his health),
  then reels wide open for 2.5 s. Miss a step and he sends ash waves instead. Computer players follow the dance.

## Stage 7 rebuilt: Samarpan Maidan, the field of Ranbhoomi

- **No gates, no ambush arenas:** the war comes at the squad in the open.
- **The chariot** (`warpath` land, plat kind `chariot`): the war path is cut by trenches five tiles wide; a chariot
  with white horses and a sun banner waits at the start, carries everyone aboard over every trench, and comes
  back for anyone left behind. Computer players ride it and fight from the deck.
- **Its own rakshasas** (two-letter foe codes): archers (`Ar`, `archer`: loft volleys of three arrows that come down
  around a soldier), war elephants (`Ga`, `elephant`: trumpet, then charge and trample, throwing a soldier aside;
  jump them), war drummers (`Dr`, `drummer`: every beat hurries every foe near them into its next shot).
- **Rest stop:** the fallen general's memorial.
- **Its own boss, Maniyodha** (`maniyodha`): fans of arrows, an agnibaan fire arrow whose fire runs along the
  ground both ways, a leaping sword cut at anyone close, and SAMARPANASTRA (the arena's rule): stop firing and it
  passes; fight it and it grows; a storm nobody fought rebounds on him.

## Stage 8 rebuilt: Chakra Durg, inside the bhanwarvyuh

- **No way back** (`vyuh` flag, `GAME_CONFIG.vyuh`): the formation closes behind the squad, a wall of shields and
  spears that follows the rearmost soldier (240 px behind) and never opens again.
- **The rings turn** (`belt` field, section `field: { kind: 'belt', power }`): the ground carries whoever stands
  on it, one way in one ring and the other way in the next. Low ramparts (`rings` land) to jump between them.
- **Its own rakshasas:** discus throwers (`Ck`, `chakri`: the disc flies out and comes back to the thrower's hand,
  hitting on the way back too), maharathis (`Rt`, `rathi`: close in, crouch, lunge through a soldier), net throwers
  (`Jl`, `netter`: a net slows whoever it lands on for 1.4 s; the snapshot flags them with `nt`).
- **Rest stop:** the warriors' camp.
- **Its own boss, Suryakavach** (`suryakavach`), rooted at the seventh gate: while the sun shines (6.5 s) nothing
  touches him (his boon) and he calls his maharathis; then a great discus covers the sun for 4.5 s and he is open.
  Throwing CHAKRAM brings the eclipse at once. A mace blow's shock runs along the ground; spears come down in an
  arc.

## Stage 9 rebuilt: Dwand Bhoomi, the duel ground

- **The akhada's mud** (`mud` field, `GAME_CONFIG.mud`): slows a soldier to 60% pace.
- **Its own rakshasas:** wrestlers (`Pw`, `pehlwan`: grab a soldier, squeeze, and throw them back over their head;
  2 damage while it holds breaks the hold), mace spinners (`Gd`, `gadadhar`: spin toward a soldier while shots
  glance off, then stand dizzy and take double), slingers (`Sl`, `slinger`: stones that land with a small blast).
- **Rest stop:** the akhada's old well.
- **Its own boss, Jodasur** (`jodasur`): boulders, a pounce whose shock runs along the ground, a bull's charge,
  and a TEJ orb (the arena's rule, with its altar). Brought down he splits into two halves (`ardh`) that crawl
  back together; shots push a half the way they fly (and stop it crawling for a moment). Pushed 520 px apart they
  burn and he is finished; if they meet he stands again with 30% of his health. Computer players stand between the
  halves and shoot each one outward.

## Stage 10 rebuilt: Suvarna, the golden city burning

- **Meghbaan's arrows** (`megh` flag, `GAME_CONFIG.megh`): every 4 to 7 s a red mark on the ground under a soldier
  (`ij` in the snapshot) with a dark cloud over it, and 1.3 s later six arrows come down round it. Never at the rest
  stop or in Saptashir's court. Computer players step off the mark.
- **Nidrasur asleep** (`Kb`, `nidrasur`): no weapon touches him; gunfire within 520 px is noise, and enough of it
  wakes him: he rolls at the squad for 4 s (crushing each soldier once), then sleeps where he stops. His snore meter
  shows how near he is to waking. Computer players hold fire near him.
- **Hansvimaan** (`skyway` land, plat kind `vimana`): a long drop over the burning city crossed on Saptashir's flying
  chariot; it comes back for anyone left behind (computer players wait for it and step off at the far end).
- **Its own rakshasas:** torch throwers (`Ms`, `mashaal`: pots of burning oil), Meghbaan's warriors of illusion
  (`My`, `mayavi`: unseen and untouchable but for the moment they show themselves to shoot), and Nidrasur.
- **Rest stop:** Chandan Vatika, a lantern garden under a flowering tree.
- **Its own boss, Saptashir** (`saptashir`), before his throne: seven heads take the blows (4 damage cuts one; his body takes
  15% meanwhile) and grow back one every 1.5 s (1.15 s when angry); with all seven cut the fire in his core glows and
  he takes full damage. Fire from his mouths (one tongue per head), Moonblade' blade along the ground, burning
  stones. PRALAY is the arena's rule; the squad's PARAMASTRA cuts every head and strikes his heart.

## Full strength: longer, harder stages

A computer squad used to reach every boss in about a minute and never lose a life, so every stage now runs at full
strength (`saga.ts` `fullStrength`):

- **Escorts.** Every second and third foe of a section brings an escort three tiles behind it (`~` in the foe list:
  placed only where it has ground at the height of the foe it follows, never alone on a wall top).
- **A gauntlet before the boss.** Each stage gets one more section right before the boss, in a terrain it has not
  used yet, with six of its own host: Angaar Tila (ember hill), Toote Khambe (broken pillars over the sea), Megh
  Stambh, Saanpon ki Khaai, Sheesh Burj, Senapati ka Kot, Chakra Burj, Kushti ke Gaddhe, Jalta Setu.
- **The host hits harder:** enemy health and fire rate ×1.15, damage ×1.25, boss health ×1.3, boss tempo ×1.05.
- **A trial halfway (pariksha).** Right after each stage's rest stop comes a stretch of a shape the stage has not used
  yet, crowded with its own host, so the second half opens with a fight before the gauntlet and the boss:
  Machhuaron ka Ghaat, Toofan ki Ghati, Naag Mandap, Sheesh Mahal, Rann ka Dwaar, Surya Dwaar, Bada Akhada, Sena ka
  Ghera. Not on Agnivan (the chase) or Bhasm Parvat (the lava): their clocks set the pace. No gates (several stages
  are built to have none).
- **A climbing curve.** Stage n's host hits 2% harder than the first's per stage (up to stage 7) and its boss has 2%
  more health per stage, on top of the full-strength multipliers, so stage 10 is felt to be the last.
- **Bhasm Parvat** keeps its length and its foes (the rising lava sets its pace) and only hits harder.

Measured with the computer squad (1 and 2 bots, 3 seeds each): about twice the enemies of the first version, the boss
reached after 1-2.5 minutes, 2.5-4.5 minutes a stage (Bhasm Parvat about 1.5), and lives lost from stage 4 on. The
bots aim perfectly, so a person takes longer. The tests still require every stage to be finishable and good bots to win
most runs.

## Rides (sawari)

Some stretches of a stage have a ride stand: every soldier who walks onto it gets that ride until the stretch ends
(`mounts.ts`, `LevelDef.mounts`, course `ride`). The ride has its own health (hits go to it first; destroyed, it
throws the soldier clear with a moment of safety, and the stand gives another), its own speed and jumps or free
flight, and its own power on the KNIFE button. Bike, jeep and jet suit carry a gun of their own; on the animals the
soldier shoots their own gun from the saddle. Rides at speed trample troopers.

| Ride                 | Moves                        | Gun                  | Power (KNIFE)                      | Where                                      |
| -------------------- | ---------------------------- | -------------------- | ---------------------------------- | ------------------------------------------ |
| War bike             | 330 px/s, double jump        | twin guns            | Nitro: a burst that runs foes down | Maya Nagri, Dwand Bhoomi, Curse of Pharaoh |
| Armoured jeep        | 250 px/s, heavy armour       | rocket cannon        | Rockets lobbed in a fan            | Chakra Durg, Operation Lifeline            |
| Jet suit             | flight                       | twin piercing lasers | Six homing missiles                | Vayu Shikhar (a flight), Alien Invasion    |
| War horse            | 310 px/s, triple jump        | the soldier's own    | Charge: a gallop that tramples     | Agnivan, Samarpan Maidan, North            |
| Bagh, the tiger      | 285 px/s, double jump        | the soldier's own    | Pounce onto the nearest foe        | Naag Lok, Operation Astra                  |
| Gaj, the elephant    | 175 px/s, 220 health, armour | the soldier's own    | Stomp: a shockwave both ways       | Samarpan Maidan                            |
| Baaz, the great hawk | flight                       | the soldier's own    | Dive: strikes where it lands       | Sagar Setu, Suvarna, Marble Peak           |

A **flight** (`udaan` terrain) is open sky over a drop, stone spires rising and rocks hanging, with the stand on the
near side: only a flying ride crosses it, and a soldier who loses theirs falls back to the stand for another. The
computer squad rides too (fliers pick a height with a clear way ahead and use the power when foes are close). Art:
`art3d/mount_rig.py` renders each ride in parts (body, legs, wheels, wing, pack) that `client/game/mount-art.ts`
animates.

## Stages

Every stage is a stage of its own (`LevelDef.own`): its own terrain and rule, three rakshasas nobody else fields,
its own rest stop and its own boss. No gates, no ambush arenas, no shared boss styles.

| #   | Stage                             | Its rule                                       | Rakshasas                                 | Boss                                |
| --- | --------------------------------- | ---------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| 1   | Agnivan, the burning forest       | a wall of fire chasing from behind             | fire imps, burning bats, tree demons      | Jwala Vriksh-asur                   |
| 2   | Sagar Setu, the sea bridge        | sinking stones, a tide, a boat                 | makara riders, crab asuras, conch blowers | Chhaya                              |
| 3   | Vayu Shikhar, the storm peaks     | gusts of wind, a climb                         | wind demons, boulder rollers, lancers     | Aandhi                              |
| 4   | Naag Lok, the serpent underworld  | down into the dark, poison pools               | naga warriors, cobras, eggs               | Vishdhar (dance on his heads)       |
| 5   | Maya Nagri, the city of illusions | false floors and hidden floors, MAYASTRA       | mirror shades, dancers, painted guards    | Darpan-asur                         |
| 6   | Bhasm Parvat, the ash mountain    | lava rising behind a climb                     | prets, ash golems, skull-lamp carriers    | Raakhasur (Nartaki's dance)         |
| 7   | Samarpan Maidan, Ranbhoomi        | a chariot over the war path                    | archers, war elephants, war drummers      | Maniyodha (samarpanastra)           |
| 8   | Chakra Durg, the bhanwarvyuh      | rings that turn, closing behind: no way back   | discus throwers, maharathis, net throwers | Suryakavach (the eclipse)           |
| 9   | Dwand Bhoomi, the duel ground     | akhadas of mud                                 | wrestlers, mace spinners, slingers        | Jodasur (split in two)              |
| 10  | Suvarna, the golden city burning  | Meghbaan's arrows, Nidrasur asleep, Hansvimaan | torch throwers, warriors of illusion      | Saptashir (seven heads, paramastra) |

Each stage has its own art style (`vana`, `sagar`, `shikhar`, `naglok`, `maya`, `bhasm`, `ranbhoomi`, `chakra`,
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

(The per-stage terrain table that used to stand here described the old template stages; each stage's own section
above now says what makes it different.)

A stash is reached with a double jump to a step ledge and another to the perch (in a cave, a pocket in the roof you
walk out of). It is never needed to finish, it rewards players who look around and try.

`shared/tests/saga.test.ts` keeps it that way: no two stages may run the same order of terrain, every stage uses at
least two of the new shapes and more than one arena shape, no enemy list or wave set may be copied anywhere in the
saga, and every stage must have a stash with loot on it.

## Bosses: a body and a fighting style each

(History: the saga stages now all fight their own bosses, so no saga arena uses a style any more. The styles and
the shared saga moves below remain for the classic bosses and as the engine the old stages used.)

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
| 8     | Bhanwarvyuh (twin blade wheels)  | spirals, leaps                    |
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

- **Vayuastra** raises a whirlwind (bhavandar) that walks forward for 3.2 s. It picks up as many as eight
  troopers within reach (riot shields are torn off), carries them round and up its column, sweeps up enemy shots,
  and when it blows out hurls everything it held to both sides. Bosses and turrets are too heavy: the wind only
  wears at them. (`Sim.stepTwisters`, numbers in `GAME_CONFIG.powers.vayu`.)
- **Agniastra** sets alight whatever its fire touches. A burning trooper keeps burning for 3 s after it leaves
  the flames and passes the fire to those it brushes; the fire is handed on twice at most, then dies out.
- **Wind feeds fire.** A whirlwind that crosses burning ground catches light and sets everything it carries
  alight. No other pair of astras combines; this one is the reason stage 1 now hands out both.
- **The bow.** Every astra is loosed from a bow (dhanush): it is slung across the back of a hero who carries an
  astra, and comes into the hands as the astra is fired (tilted to the sky for Jal, Shyen and Vidyut). It is
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
- **Astras to spend.** A pickup gives 3 charges of most astras (2 of Jal, Shyen, Vidyut, the black hole),
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
| Shyen         | The eagle: a beak leads, wings of flyers on both sides, the body follows             |

The array decides who enters where and when; the wave still decides who is in it. Which end an array leads from is
the match's own dice. Dropped troopers always land on the arena floor (never on a ledge the squad would have to
climb to), and an arena waits for late arrivals before it can clear. The array's name is shown with the wave call.
Every stage uses at least two arrays; the last war goes through five.

## The daily trial

One battle a day, the same for every player that day (`shared/src/daily.ts`): a stage from the first eight, dealt
a stage-wide hazard it does not normally have, two astras of the day on its astra pedestals (Jal and Tej
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
astra, none for the paramastra. The only astra text left is the one-line HUD instruction while a boss astra is
live (for example STOP FIRING), because the squad needs it to survive. Every call opens a sigil
(a ground mandala of two counter-turning rings and sixteen petals, and a halo behind the caster), gathers light into
the caster, bursts in rays, and the sky takes the astra's colour. Then each astra's own apparition crosses the field:

| Astra      | Apparition                                                       |
| ---------- | ---------------------------------------------------------------- |
| Agniastra  | a phoenix of fire sweeping forward, flame ribbons for a tail     |
| Jalastra   | a great wave curling over the field, light shafts through spray  |
| Vayuastra  | a tornado spiral ahead of the caster, wind streaming into it     |
| Black hole | a dark core, a lensing ring, an accretion swirl pulling stars in |
| Naagastra  | a giant cobra rising over the field, hood spread, swaying        |
| Shyenastra | the golden eagle diving across the sky with a wind wake          |
| Chakram    | a vast golden chakra spinning behind the hero, spokes of light   |
| Vidyut     | a storm eye opening in the sky, a fork of lightning below        |
| Tej        | a lotus of light opening at the hero's feet, motes rising        |
| Paramastra | a white-gold sun disc gathering over the field before the strike |

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

## Surprises: no two runs alike

So that knowing one stage (or one run) does not tell you the next, every run of a saga stage plans three surprises
from its seed (`Sim.planSurprises`, `SURPRISE_POOLS` in `shared/src/sim.ts`). They lie at different spots each run,
never in a rest stop or on an arena's doorstep, and break out as the squad passes:

| Surprise | What happens                                                                   | Stages              |
| -------- | ------------------------------------------------------------------------------ | ------------------- |
| ambush   | the stage's own rakshasas step out on both sides                               | 1, 2, 4, 5, 7, 8, 9 |
| elite    | a stronger champion comes for the squad (heals and fills supers when it falls) | 1–8, 10             |
| skyfall  | five seconds of fire from the sky on marked spots                              | 1, 3, 6, 10         |
| raid     | the stage's flyers dive in from behind                                         | 2, 3, 5, 7, 10      |
| tremor   | shockwaves along the ground from both sides                                    | 4, 6, 8, 9          |
| stampede | war elephants charge in from behind                                            | 7                   |
| duel     | two elite champions of the akhada                                              | 9                   |
| blessing | once a run: Vani heals the squad and charges their supers                      | all                 |

Nothing repeats within a run while the stage has other kinds left. Vani calls each one on the story radio. A test
checks the placement, the variety across seeds, and that computer squads still win with them.

## Stage goals: each stage asks something of its own

Besides reaching the boss, every saga stage gives the squad a goal of its own (`SAGA_GOALS` in `shared/src/sim.ts`,
the words in `client/src/story.ts` `GOAL_TEXT`, the art in `client/src/game/goal-art.ts`). It shows as a chip under
the progress bar, Vani gives it at the start, and the spots change every run.

| Stage           | Goal                             | Kind    | How it plays                                                     |
| --------------- | -------------------------------- | ------- | ---------------------------------------------------------------- |
| Agnivan         | Free the forest spirits (4)      | rescue  | spirits in rings of fire along the way, with the fire behind you |
| Sagar Setu      | Cross before the tide rises      | race    | reach the far shore before the clock runs out                    |
| Vayu Shikhar    | Break the storm totems (3)       | targets | shoot down totems that feed the storm                            |
| Naag Lok        | Gather the lost lights (5)       | rescue  | pieces of Vani's flame wandering in the dark                     |
| Maya Nagri      | Shatter the true mirrors (3)     | targets | the real mirrors among the illusions                             |
| Bhasm Parvat    | Guard the shrine fire            | hold    | the way on stays shut until the shrine blazes up                 |
| Samarpan Maidan | Hold the line                    | hold    | hold your ground against waves until the bar fills               |
| Chakra Durg     | Break the gate locks (4)         | targets | golden locks that hold the rings shut                            |
| Dwand Bhoomi    | Reach the akhada before the bell | race    | a race to the ring                                               |
| Suvarna Nagri   | Free the captives of Suvarna (4) | rescue  | prisoners in cages along the road                                |

Done: the squad is healed, their supers half filled, +1500 score each, and the results screen says so. Missed: the
stage goes on (a goal is a challenge, never a wall), except a hold, which must be held to go on. Tests cover each kind.
