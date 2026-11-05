# Astra Saga: design

Ten stages, each built around one astra and the rule its story gives it. The astras are the hero's powers; enemies
are asura, rakshasa and naga hosts; every character and boss name is original (no god, avatar or epic hero appears as
a character). The game says "inspired by the Indian epics" and does not claim to retell them.

Data: `shared/src/saga.ts` (stages), `shared/src/config.ts` (`powers`, `bossAstra`), rules in `shared/src/sim.ts`.

## The hero's astras

| Astra             | Pickup     | What it does                                                           | Rule from its story                |
| ----------------- | ---------- | ---------------------------------------------------------------------- | ---------------------------------- |
| Agneyastra        | `a`        | Wave of fire, then the ground keeps burning                            | Fire ordinary means cannot put out |
| Varunastra        | `w`        | Rain ahead: puts out walls of fire, hurts foes                         | The water astra, agni's answer     |
| Vayavyastra       | `v`        | Gust: tears shields off, blows foes and shots away                     | A gale that lifts an army          |
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
`dwand`, `mahayuddh`) and its own enemy colour (`tint`, a hue shift of the asura host).

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

## Progress and continues

- Stage 1 is open; each stage opens when the one before it is cleared. The menu's big button plays the next stage in
  one click.
- Stars per run: 1 for clearing, +1 with a squad life to spare, +1 with a life to spare for every soldier.
- Every win pays astra shards equal to its stars. A new player starts with 3.
- Out of lives in a solo run: once per run, continue with 3 squad lives by watching a video (portal builds only) or for
  3 shards.

## Balance checks

`shared/tests/saga.test.ts` has a test per astra and per boss astra, plays every stage with a 4-soldier computer
squad on normal, and plays every stage alone and as four over 4 seeds each: a run may be lost, but it must never get
stuck (a time-out means the level has a spot a squad cannot get past), and the bots must win at least 3 in 4.
A measurement after the stage redesign (3 seeds each, normal; not a test, numbers from one run):

- 1 soldier: 26 of 30 runs won, 3.5 to 8 minutes per stage.
- 2 soldiers (you + 1 buddy): 30 of 30 runs won, 2 to 6 minutes per stage.
- 4 soldiers: 30 of 30 runs won, 2 to 4.5 minutes per stage.

Real players are slower to react than the bots and better at reading the tells, so treat these as a rough guide and
watch the portal's playtime and retention numbers.
