import type { PowerKind, SagaId } from './config';
import { buildCourse, withRests, type CourseDef } from './course';
import type { LevelDef } from './level';

/**
 * The Astra Saga: ten stages, each built around one astra and the rule its story gives it. A stage teaches its
 * astra in the first screens (its pickup lies near the start), tests it in an ambush, and asks for it again at the
 * boss. Later stages mix what came before.
 *
 *   #   stage             astra / boss astra       what it asks of the squad
 *   1   Agnivan           agni                     set the ground ablaze under a crowd
 *   2   Sagar Setu        jal                   rain out walls of fire to get through
 *   3   Vayu Shikhar      vayu                     tear shields off, blow shots away, in storms that bend shots
 *   4   Naag Lok          naga + shyen            serpents that never miss; the eagle wipes the bosses' serpents
 *   5   Maya Nagri        paramastra               the squad's shared meter, against endless waves
 *   6   Bhasm Parvat      vidyut                a different form every call: trident, spirit or fire rain
 *   7   Samarpan Maidan   samarpanastra (boss)      stop fighting the storm, or it grows; a perfect surrender
 *                                                  makes the boss's second call rebound on it
 *   8   Chakra Durg       chakram               the discus hunts foe after foe and returns
 *   9   Dwand Bhoomi      tej (boss)         only a tej stops a tej: turn the orb back
 *  10   Mahayuddh         pralay (boss)     answer it with the paramastra, or dodge it
 *
 * Enemies are asura, rakshasa and naga hosts (the demon faction, each stage tinted its own colour); every name in
 * here is original: no god, avatar or epic hero appears as a character, and the astras are the hero's powers.
 */

export interface SagaStage {
  id: SagaId;
  num: number;
  name: string;
  place: string;
  /** The astra this stage is about (a boss astra for 7, 9 and 10; the team paramastra for 5). */
  astra: PowerKind | 'param' | 'samarpan' | 'pralay';
  /** How the astra appears in menus. */
  astraName: string;
  /** One line of its story. */
  lore: string;
  /** One line of how to use it (or beat it). */
  how: string;
  /** Lobby briefing lines. */
  brief: string[];
  /** Toughness 1..5. */
  stars: number;
  /** What sets this stage apart from the one before, in a few words (shown as the stage begins). */
  twist: string;
}

export const SAGA: readonly SagaStage[] = [
  {
    id: 'astra-1',
    num: 1,
    name: 'Agnivan',
    place: 'The burning forest',
    astra: 'agni',
    astraName: 'Agniastra',
    lore: 'The fire astra: flames that ordinary means cannot put out.',
    how: 'ASTRA button: a wall of fire, then burning ground. Whoever it touches burns on.',
    brief: [
      'The forest burns, and the fire is coming up behind you. Keep moving: stand still and it catches you.',
      'Fire imps leap and burst, burning bats dive, tree demons have bark in front: get behind them.',
      'At the heart of the forest stands JWALA VRIKSH-ASUR. Jump its roots, climb its boughs, strike its heart.',
    ],
    stars: 1,
    twist: 'The forest is burning behind you: run',
  },
  {
    id: 'astra-2',
    num: 2,
    name: 'Sagar Setu',
    place: 'The sea bridge',
    astra: 'jal',
    astraName: 'Jalastra',
    lore: 'The water astra: a torrent of rain, the one answer to fire.',
    how: 'JALASTRA rains on the sea: the tide stands still at its lowest, and Chhaya gasps with her jaws open.',
    brief: [
      'The old sea bridge is half sunk. Its floating stones sink while you stand on them: keep hopping.',
      'The tide rises and falls: high water covers the shoals and slows you. Makara riders leap out of the waves.',
      'Crab asuras hide behind their shells: blade them or get round. On the far shore CHHAYA grabs at your shadow.',
    ],
    stars: 2,
    twist: 'The sea is the enemy: sinking stones, the tide, a boat to Suvarna',
  },
  {
    id: 'astra-3',
    num: 3,
    name: 'Vayu Shikhar',
    place: 'The storm peaks',
    astra: 'vayu',
    astraName: 'Vayuastra',
    lore: 'The wind astra: a gale strong enough to lift an army off the ground.',
    how: 'A whirlwind walks ahead: it lifts the host off its feet, then hurls it. Cast into a storm, it turns it back.',
    brief: [
      'Climb Meghgiri: cliff after cliff, ledges up every face. Gusts blow across the mountain: when the trees bend, crouch.',
      'Wind demons swoop with the gusts, rollers heave boulders down the faces, cloud lancers hurl lightning.',
      'On the summit sits a sage. It is AANDHI: his storms drive you to the drop. Hit him while he holds one up.',
    ],
    stars: 2,
    twist: 'Up the mountain: cliffs, gusts and a sage who is not one',
  },
  {
    id: 'astra-4',
    num: 4,
    name: 'Naag Lok',
    place: 'The serpent underworld',
    astra: 'naga',
    astraName: 'Naagastra',
    lore: 'The serpent astra never misses; the eagle, Shyenastra, is its only counter.',
    how: 'NAAGASTRA: three serpents find foes in the dark for you. SHYENASTRA clears serpents and venom from the air.',
    brief: [
      'Down into the serpent underworld, drop after drop, in the dark. Naga warriors slither low: crouch to shoot them.',
      'Cobras spit from the ledges, eggs hatch if you leave them, poison pools eat at you: keep out of them.',
      'At the bottom lies the poisoned lake. VISHDHAR: his scales turn shots. Dance on his heads.',
    ],
    stars: 3,
    twist: 'Down into the dark: serpents, poison and a dance on Vishdhar',
  },
  {
    id: 'astra-5',
    num: 5,
    name: 'Maya Nagri',
    place: 'The city of illusions',
    astra: 'maya',
    astraName: 'Mayastra',
    lore: "Mayakaar's own art turned back on his hall: it shows every illusion for what it is.",
    how: 'MAYASTRA: false floors show (and hold), hidden floors appear, mirror shades vanish, the great mirror goes dull.',
    brief: [
      "Mayakaar's hall: some floors give way under you, some floors you cannot see are there. MAYASTRA shows the truth.",
      'Mirror shades copy you from across their mirrors, dancers appear behind you, painted guards step out of the walls.',
      'DARPAN-ASUR, the great mirror, turns every shot back while it shines. Wait for it to go dull, or dull it yourself.',
    ],
    stars: 3,
    twist: 'Nothing is what it seems: false floors, mirrors, a mirror that fights back',
  },
  {
    id: 'astra-6',
    num: 6,
    name: 'Bhasm Parvat',
    place: 'The ash mountain',
    astra: 'vidyut',
    astraName: 'Vidyutastra',
    lore: 'An astra with a new form every time it is called.',
    how: 'Each call is one of three: a trident strike, a spirit ally, or a rain of fire. It finishes ash golems for good.',
    brief: [
      'Climb the volcano: the lava is rising behind you. Ghosts drift through the rock; ash golems rise again unless burnt.',
      'Skull-lamp carriers call up more ghosts. A stone shrine halfway up: the lava will not reach it.',
      'RAAKHASUR on the rim: no blade hurts him much. When he dances, copy the poses (up, down, left, right) and he burns himself.',
    ],
    stars: 4,
    twist: 'Up the volcano with the lava behind you, and a dance to the death',
  },
  {
    id: 'astra-7',
    num: 7,
    name: 'Samarpan Maidan',
    place: 'The great battlefield',
    astra: 'samarpan',
    astraName: 'Samarpanastra',
    lore: 'It grows with resistance. The only way through it is to lay down your weapons.',
    how: 'When a boss calls SAMARPANASTRA: STOP FIRING. Fight it and more arrows fall on you. Surrender, and it passes.',
    brief: [
      'Ranbhoomi: archers loft volleys from behind the lines, war drummers hurry every foe near them, elephants charge.',
      "Board the chariot to cross the trench-cut war path. The fallen general's memorial stands halfway: rest there.",
      'MANIYODHA calls SAMARPANASTRA: STOP FIRING and it passes. Fight it and it grows. A storm nobody fought rebounds on him.',
    ],
    stars: 4,
    twist: 'A chariot ride through the war, and an astra you survive by laying down your arms',
  },
  {
    id: 'astra-8',
    num: 8,
    name: 'Chakra Durg',
    place: 'The discus fortress',
    astra: 'chakram',
    astraName: 'Chakram',
    lore: 'The discus that never misses, and returns to the hand that threw it.',
    how: 'CHAKRAM flies to foe after foe (up to six), then comes back to you.',
    brief: [
      'The BHANWARVYUH: ring after ring of shield walls, the rings turning under your feet, and it closes behind you.',
      'Discus throwers whose discs come back, maharathis who lunge, net throwers who slow you down.',
      'SURYAKAVACH at the seventh gate: no blow touches him while the sun shines. Throw CHAKRAM to cover the sun.',
    ],
    stars: 5,
    twist: 'Into the bhanwarvyuh, with no way back, and a sun to hide',
  },
  {
    id: 'astra-9',
    num: 9,
    name: 'Dwand Bhoomi',
    place: 'The duel ground',
    astra: 'tej',
    astraName: 'Tejastra',
    lore: 'Only another Tejastra can stop a Tejastra.',
    how: 'The bosses throw a golden orb you cannot shoot down. Grab TEJASTRA at the altar and fire it near the orb: it flies back at the boss.',
    brief: [
      'Akhada after akhada: the mud slows you, wrestlers grab and throw you (shoot them to break free), mace spinners turn shots.',
      'JODASUR hurls a TEJ orb no bullet stops: take TEJASTRA from the altar and turn it back on him.',
      'Bring him down and he splits in two. Push the halves apart before they crawl back together.',
    ],
    stars: 5,
    twist: 'Wrestlers in the mud, and a king who will not stay down',
  },
  {
    id: 'astra-10',
    num: 10,
    name: 'Suvarna Nagri',
    place: 'The golden city, burning',
    astra: 'pralay',
    astraName: 'Pralay',
    lore: 'Stronger than the Paramastra, and once called it cannot be called back.',
    how: 'When SAPTASHIR charges PRALAY, answer it with the squad PARAMASTRA, or dash at the last moment.',
    brief: [
      'The golden city burns. Meghbaan shoots from the clouds: move off his red mark. His warriors show themselves only to shoot.',
      'Nidrasur sleeps across the way: hold your fire near him or he wakes and rolls. Hansvimaan flies you to the court.',
      'SAPTASHIR: cut all seven heads, then hit him before they grow back. Answer his PRALAY with the PARAMASTRA.',
    ],
    stars: 5,
    twist: 'A burning golden city, a sleeping giant, Hansvimaan, and the seven-headed king',
  },
];

export const sagaStage = (id: string): SagaStage | undefined => SAGA.find((s) => s.id === id);

// ---------------------------------------------------------------- the stages as data (see course.ts)
//
// Every stage has a shape of its own: its own order of terrain, one signature stretch nobody else has in that
// form, a stash perch somewhere off the path, and its own enemy lists and waves (the tests check no two stages
// share a terrain order, a foe list or a wave set).
//
//   1 Agnivan          climb the burning slope, then burn the crowd packed in the ember trench
//   2 Sagar Setu       the broken bridge: hop the wreckage over the sea; a sea wall to climb or slip under
//   3 Vayu Shikhar     an updraft gorge (a wind column lifts you over the gap), thin air, lightning peaks
//   4 Naag Lok         the underworld: two caves under rock roofs, a serpent pit, a pillared sunken temple
//   5 Maya Nagri       two roads at every wall (over it or under it), illusion storms that bend every shot
//   6 Bhasm Parvat     the mountain itself: a long climb, a gorge of ash ledges, a shrine cave, ash peaks
//   7 Samarpan Maidan  the battlefield: two war trenches, a chariot wall, an open field of arrows
//   8 Chakra Durg      ring after ring: a wall, a ring arena, blade pillars, the twin beasts, the inner wall
//   9 Dwand Bhoomi     a gauntlet of duels: five arenas with short walks between them
//  10 Mahayuddh        one last stretch of everything: fire road, shattered bridge, ash tunnel, the last rampart

/**
 * Agnivan, the burning of the Jwala forest. No ambush arenas and no gates: a wall of fire chases the squad
 * from behind the whole way (GAME_CONFIG.chase), so the fighting happens on the run. A burning tree falls across a
 * ravine, the path forks into high boughs and a hollow under the roots, the river bank is the one safe place,
 * then the fire leaps ahead too and the only way on is down into the stream. At the end the forest's heart:
 * Jwala Vriksh-asur, a burning banyan, with the fire still at the squad's back.
 */
const AGNIVAN: CourseDef = {
  id: 'astra-1',
  name: 'Agnivan',
  faction: 'demon',
  tint: 0,
  own: true,
  chase: true,
  mods: { enemyHp: 0.9, enemyFire: 0.9, enemyDamage: 0.9, bossHp: 0.85, bossTempo: 0.95 },
  sections: [
    { zone: 'Van ka Kinara', art: 'vana', land: 'flat', len: 26, loot: 'a9' },
    { zone: 'Jalta Jungle', art: 'vana', land: 'catwalks', len: 32, foes: 'I10 I15 B20^ I26', loot: '+24^' },
    { zone: 'Girta Ped', art: 'vana', land: 'treefall', len: 26, foes: 'B9^ B18^' },
    {
      zone: 'Do Raaste',
      art: 'vana',
      land: 'fork',
      len: 36,
      foes: 'I8 W14_ B18^ I22_ I28',
      loot: '+16^ a28^',
    },
    { zone: 'Nadi Kinara', art: 'vana', land: 'river', len: 22, cp: true, rest: true, loot: '+3 a18*' },
    {
      zone: 'Lakdi-rakshas',
      art: 'vana',
      land: 'steps',
      len: 34,
      stash: 17,
      foes: 'W7 I12 B15^ W22^ I27',
      loot: '+22^ a17^',
    },
    { zone: 'Aage bhi Aag', art: 'inferno', land: 'dive', len: 30, fire: [15], foes: 'I3 I26' },
    {
      zone: 'Dahakta Hriday',
      art: 'inferno',
      land: 'pillars',
      len: 30,
      foes: 'I5 B12^ W17^ I27',
      loot: '+21^',
    },
    {
      zone: 'Jwala Vriksh',
      art: 'inferno',
      len: 40,
      cp: true,
      loot: '+4',
      arena: { name: 'JWALA VRIKSH-ASUR', room: 'grove', bosses: ['vriksha'], final: true },
    },
  ],
};

/**
 * Sagar Setu, an old sea bridge, half sunk. No gates and no ambush arenas: the sea is the stage. Floating
 * stones sink under a soldier's weight, the tide rises and falls (wading is slow, high water covers the shoals),
 * makara riders leap out of the waves, crab asuras turn their shells to the squad, conch blowers send surges along
 * the ground. The ferryman's boat is the rest stop; a boat carries the squad over open sea to the far isle's shore, where
 * Chhaya the shadow-catcher rises out of the water.
 */
const SAGAR_SETU: CourseDef = {
  id: 'astra-2',
  name: 'Sagar Setu',
  faction: 'demon',
  tint: 190,
  own: true,
  tide: { base: 15.2, amp: 0.6, periodSec: 9 },
  mods: { enemyHp: 0.95, enemyFire: 0.95, enemyDamage: 0.95, bossHp: 0.9, bossTempo: 1 },
  sections: [
    {
      zone: 'Setu ka Aarambh',
      art: 'sagar',
      land: 'flat',
      len: 26,
      stash: 12,
      foes: 'K16 K22',
      loot: 'w7 +12^',
    },
    { zone: 'Tairte Patthar', art: 'sagar', land: 'stones', len: 34, foes: 'M12 M24' },
    { zone: 'Adhoora Pul', art: 'sagar', land: 'bridge', len: 32, foes: 'K8 N16 K22 M27', loot: '+12' },
    { zone: 'Majhi ki Naav', art: 'sagar', land: 'flat', len: 22, cp: true, rest: true, loot: '+4 w17*' },
    {
      zone: 'Jwar-Bhata',
      art: 'sagar',
      land: 'shoals',
      len: 36,
      foes: 'K12 N22 M18 M30 K32',
      loot: '+24^ w5',
    },
    { zone: 'Naav Yatra', art: 'sagar', land: 'sea', len: 44, foes: 'M12 M20 M28 M36' },
    {
      zone: 'Dweep ka Kinara',
      art: 'sagar',
      len: 40,
      cp: true,
      loot: '+6 w10*',
      arena: { name: 'CHHAYA', room: 'isle', bosses: ['chhaya'], final: true },
    },
  ],
};

/**
 * Vayu Shikhar, the climb up Meghgiri for the sanjeevani. A stage that goes UP: cliff after cliff, ledges up each
 * face, the camera climbing with the squad. Gusts blow across it (the trees bend before each one; crouch into it),
 * wind demons swoop with them, rollers heave boulders down the faces, cloud lancers throw lightning. the hermit's cave
 * halfway up is the rest stop (no wind in there). On the summit sits a sage: Aandhi, who drives the squad toward
 * the drop with his storms.
 */
const VAYU_SHIKHAR: CourseDef = {
  id: 'astra-3',
  name: 'Vayu Shikhar',
  faction: 'demon',
  tint: 210,
  own: true,
  gusts: true,
  mods: { enemyHp: 1, enemyFire: 1, enemyDamage: 1, bossHp: 0.95, bossTempo: 1 },
  sections: [
    { zone: 'Parvat ki Tarai', art: 'shikhar', land: 'flat', len: 24, stash: 20, loot: 'v8 +20^' },
    { zone: 'Pehli Chadhai', art: 'shikhar', land: 'cliff', rise: 9, len: 22, foes: 'R17' },
    {
      zone: 'Hawa ka Kinara',
      art: 'shikhar',
      land: 'catwalks',
      len: 32,
      foes: 'Y12 L18 Y27',
      loot: '+14^',
    },
    { zone: 'Doosri Chadhai', art: 'shikhar', land: 'cliff', rise: 10, len: 22, foes: 'R18 Y14' },
    {
      zone: 'Sant ki Gufa',
      art: 'shikhar',
      land: 'tunnel',
      len: 22,
      cp: true,
      rest: true,
      loot: '+4 v16*',
    },
    { zone: 'Tooti Chattan', art: 'shikhar', land: 'cliff', rise: 9, len: 24, foes: 'L13 R20' },
    { zone: 'Bijli ke Megh', art: 'shikhar', land: 'chasm', len: 30, foes: 'L9 Y17 L24' },
    { zone: 'Shikhar ka Dwar', art: 'shikhar', land: 'cliff', rise: 8, len: 13, cp: true, loot: '+11' },
    {
      zone: 'Meghgiri Shikhar',
      art: 'shikhar',
      len: 36,
      loot: '+6 v8*',
      arena: { name: 'AANDHI', room: 'summit', bosses: ['aandhi'], final: true },
    },
  ],
};

/**
 * Naag Lok: a stage that goes DOWN, drop after drop into the serpent
 * underworld, unlit but for the squad's light and what glows. Naga warriors slither too low for a standing shot,
 * cobras spit venom from the ledges, eggs hatch if left, pools of poison eat at whoever wades them. Sarpraj's
 * shrine is the rest stop. At the bottom, the poisoned lake and Vishdhar: dance on his heads.
 */
const NAAG_LOK: CourseDef = {
  id: 'astra-4',
  name: 'Naag Lok',
  faction: 'demon',
  tint: 115,
  own: true,
  dark: true,
  mods: { enemyHp: 1.05, enemyFire: 1.05, enemyDamage: 1.05, bossHp: 1, bossTempo: 1.02 },
  sections: [
    { zone: 'Nadi ka Tal', art: 'naglok', land: 'flat', len: 24, loot: 'n9' },
    { zone: 'Pehli Gufa', art: 'naglok', land: 'tunnel', rise: -6, len: 30, foes: 'Z10 Z18 C25' },
    { zone: 'Vish ke Talaab', art: 'naglok', land: 'flat', len: 30, pools: [8, 20], foes: 'E5 Z15 E25' },
    { zone: 'Gehri Utrai', art: 'naglok', land: 'pillars', rise: -7, len: 28, foes: 'C7^ Z13^ C19^' },
    {
      zone: 'Sarpraj ka Mandir',
      art: 'naglok',
      land: 'flat',
      len: 22,
      cp: true,
      rest: true,
      loot: '+4 n16*',
    },
    {
      zone: 'Andhi Surang',
      art: 'naglok',
      land: 'tunnel',
      rise: -5,
      len: 34,
      foes: 'Z8 E14 Z21 Z27 C31',
      loot: 'g12',
    },
    {
      zone: 'Naag ka Ghar',
      art: 'naglok',
      land: 'flat',
      len: 28,
      pools: [5, 19],
      stash: 13,
      foes: 'E10 Z23 C26',
      loot: '+13^',
    },
    {
      zone: 'Vish-Sarovar',
      art: 'naglok',
      rise: -4,
      len: 42,
      cp: true,
      loot: '+4 g5*',
      arena: { name: 'VISHDHAR', room: 'lake', bosses: ['vishdhar'], final: true },
    },
  ],
};

/**
 * Maya Nagri, the hall the illusion-maker built, where floors were water and water was floor. False floors
 * give way under a soldier, hidden ones hold where nothing seems to be; mirror shades copy the squad from across
 * their mirrors, dancers vanish and reappear behind you, painted guards step out of the walls. The garden where
 * no illusion holds is the rest stop. MAYASTRA, Mayakaar's own art turned back, shows everything as it is. At the end
 * the great mirror, Darpan-asur, turns every shot back while it shines.
 */
const MAYA_NAGRI: CourseDef = {
  id: 'astra-5',
  name: 'Maya Nagri',
  faction: 'demon',
  tint: 280,
  own: true,
  mods: { enemyHp: 1.1, enemyFire: 1.05, enemyDamage: 1.05, bossHp: 1.05, bossTempo: 1.05 },
  sections: [
    { zone: 'Sabha ka Dwar', art: 'maya', land: 'flat', len: 24, stash: 20, loot: 'y8 +20^' },
    { zone: 'Nakli Farsh', art: 'maya', land: 'illusion', len: 32, foes: 'A14 A26' },
    { zone: 'Darpan Gallery', art: 'maya', land: 'flat', len: 30, foes: 'X8 Q15 X22 Q27', loot: '+18^' },
    { zone: 'Sabha ka Baag', art: 'maya', land: 'flat', len: 22, cp: true, rest: true, loot: '+4 y16*' },
    { zone: 'Ulta Kamra', art: 'maya', land: 'illusion', len: 36, foes: 'A13 X25 A33' },
    { zone: 'Bhool-bhulaiya', art: 'maya', land: 'rampart', len: 34, foes: 'Q4 A14^ Q20_ X30', loot: '+20^' },
    {
      zone: 'Darpan Mahal',
      art: 'maya',
      len: 40,
      cp: true,
      loot: '+4 y8*',
      arena: { name: 'DARPAN-ASUR', room: 'hall', bosses: ['darpan'], final: true },
    },
  ],
};

/**
 * Bhasm Parvat, the ash mountain of Raakhasur, whose touch on any head turns it to ash. A volcano climbed with the
 * lava rising behind (below) the squad. Ghosts drift through the rock, ash golems rise again unless fire finishes
 * them, skull-lamp carriers call up more ghosts. A small stone shrine is the rest stop (the lava does not reach it).
 * On the crater's rim, Raakhasur himself: no blade hurts him much, but he copies whoever dances, as he copied
 * Nartaki, all the way to putting his hand on his own head.
 */
const BHASM_PARVAT: CourseDef = {
  id: 'astra-6',
  name: 'Bhasm Parvat',
  faction: 'demon',
  tint: 32,
  own: true,
  lava: true,
  mods: { enemyHp: 1.1, enemyFire: 1.1, enemyDamage: 1.1, bossHp: 1.05, bossTempo: 1.05 },
  sections: [
    { zone: 'Raakh ki Tarai', art: 'bhasm', land: 'flat', len: 24, stash: 20, loot: 'p8 +20^' },
    { zone: 'Garam Chadhai', art: 'bhasm', land: 'cliff', rise: 7, len: 24, foes: 'O14 F20' },
    { zone: 'Pret Van', art: 'bhasm', land: 'pillars', len: 28, foes: 'F8 U13^ F20 O24' },
    { zone: 'Tooti Dhalaan', art: 'bhasm', land: 'cliff', rise: 8, len: 24, foes: 'O15 U20' },
    {
      zone: 'Patthar ki Chhatri',
      art: 'bhasm',
      land: 'flat',
      len: 22,
      cp: true,
      rest: true,
      loot: '+4 p16*',
    },
    { zone: 'Lava ki Nadi', art: 'bhasm', land: 'chasm', len: 30, foes: 'F9 F18 F25' },
    {
      zone: 'Raakh ke Putle',
      art: 'bhasm',
      land: 'cliff',
      rise: 8,
      len: 30,
      foes: 'O14 O20 U26',
      loot: '+22',
    },
    {
      zone: 'Jwalamukhi ka Kinara',
      art: 'bhasm',
      len: 42,
      cp: true,
      loot: '+5 p9*',
      arena: { name: 'RAAKHASUR', room: 'classic', bosses: ['raakhasur'], final: true },
    },
  ],
};

/**
 * Samarpan Maidan, the field of Ranbhoomi. No gates and no ambush arenas: the battle comes at the squad in the
 * open. Archers loft volleys from behind the lines, war drummers hurry every foe near them, war elephants trumpet
 * and charge. Across the trench-cut war path the squad rides a chariot. Halfway, the fallen general's memorial (the
 * rest stop). At the end Maniyodha, who calls SAMARPANASTRA: lay down your weapons, and it passes.
 */
const SAMARPAN_MAIDAN: CourseDef = {
  id: 'astra-7',
  name: 'Samarpan Maidan',
  faction: 'demon',
  tint: 15,
  own: true,
  mods: { enemyHp: 1.15, enemyFire: 1.1, enemyDamage: 1.1, bossHp: 1.1, bossTempo: 1.05 },
  sections: [
    { zone: 'Shankhnaad', art: 'ranbhoomi', land: 'flat', len: 22, stash: 18, loot: 'a8 +18^' },
    { zone: 'Banon ki Barsat', art: 'ranbhoomi', land: 'flat', len: 30, foes: 'Ar12 Dr18 Ar24 Ar28' },
    { zone: 'Gaj Sena', art: 'ranbhoomi', land: 'flat', len: 34, foes: 'Ga14 Ar22 Ga30', loot: '+8' },
    {
      zone: 'Rath ka Marg',
      art: 'ranbhoomi',
      land: 'warpath',
      len: 54,
      foes: 'Ar17 Ar30 Dr41',
      loot: '+51',
    },
    { zone: 'Veersmarak', art: 'ranbhoomi', land: 'flat', len: 22, cp: true, rest: true, loot: '+4 a16*' },
    { zone: 'Doosri Khaai', art: 'ranbhoomi', land: 'trench', len: 32, foes: 'Ar8 Dr15 Ga24', loot: '+28' },
    { zone: 'Hathiyon ka Ghera', art: 'ranbhoomi', land: 'flat', len: 30, foes: 'Ga8 Ar14^ Ga22 Dr27' },
    {
      zone: 'Samarpan Kshetra',
      art: 'ranbhoomi',
      len: 42,
      cp: true,
      loot: '+5 a9*',
      arena: { name: 'MANIYODHA', room: 'twin', bosses: ['maniyodha'], rules: ['samarpan'], final: true },
    },
  ],
};

/**
 * Chakra Durg, the bhanwarvyuh: the formation that lets an army in and never out. Ring after ring of shield walls,
 * each ring turning (the ground carries the squad one way, then the other), and the formation closing behind: no way
 * back. Discus throwers, maharathis who lunge, net throwers. The warriors' camp before the last rings is the rest
 * stop. At the seventh gate Suryakavach, whose boon holds back every blow while the sun shines: wait for the great
 * discus to cover the sun, or throw the CHAKRAM yourself.
 */
const CHAKRA_DURG: CourseDef = {
  id: 'astra-8',
  name: 'Chakra Durg',
  faction: 'demon',
  tint: 250,
  own: true,
  vyuh: true,
  mods: { enemyHp: 1.2, enemyFire: 1.12, enemyDamage: 1.12, bossHp: 1.1, bossTempo: 1.08 },
  sections: [
    { zone: 'Vyuh ka Dwar', art: 'chakra', land: 'flat', len: 22, stash: 18, loot: 'c8 +18^' },
    {
      zone: 'Pehla Chakra',
      art: 'chakra',
      land: 'rings',
      len: 32,
      field: { kind: 'belt', power: -60 },
      foes: 'Ck11 Rt19 Ck28',
    },
    {
      zone: 'Ghoomta Ghera',
      art: 'chakra',
      land: 'flat',
      len: 30,
      field: { kind: 'belt', power: 80 },
      foes: 'Jl9 Rt16 Rt24',
      loot: '+12',
    },
    { zone: 'Yoddha Shivir', art: 'chakra', land: 'flat', len: 22, cp: true, rest: true, loot: '+4 c16*' },
    {
      zone: 'Teesra Chakra',
      art: 'chakra',
      land: 'rings',
      len: 41,
      field: { kind: 'belt', power: -80 },
      foes: 'Ck12 Jl20 Rt29 Ck37',
      loot: '+33',
    },
    {
      zone: 'Akela Yoddha',
      art: 'chakra',
      land: 'trench',
      len: 30,
      foes: 'Rt8 Rt14 Jl20 Rt26',
    },
    {
      zone: 'Saatvan Dwar',
      art: 'chakra',
      len: 42,
      cp: true,
      loot: '+5 c9*',
      arena: { name: 'SURYAKAVACH', room: 'classic', bosses: ['suryakavach'], final: true },
    },
  ],
};

/**
 * Dwand Bhoomi, the duel ground: akhada after akhada of trampled mud (it slows you), wrestlers who grab and throw,
 * mace spinners whose spin turns shots, slingers on the banks. The akhada's old well is the rest stop. At
 * the end Jodasur, born in two halves: bring him down and he splits; push the halves apart (shots push them the
 * way they fly) before they crawl back together.
 */
const DWAND_BHOOMI: CourseDef = {
  id: 'astra-9',
  name: 'Dwand Bhoomi',
  faction: 'demon',
  tint: 205,
  own: true,
  mods: { enemyHp: 1.25, enemyFire: 1.12, enemyDamage: 1.15, bossHp: 1.1, bossTempo: 1.1 },
  sections: [
    { zone: 'Akhade ka Dwar', art: 'dwand', land: 'flat', len: 22, stash: 18, loot: 'x8 +18^' },
    {
      zone: 'Pehla Akhada',
      art: 'dwand',
      land: 'flat',
      len: 30,
      field: { kind: 'mud', power: 1 },
      foes: 'Pw10 Sl20 Pw25',
    },
    { zone: 'Gada ki Gali', art: 'dwand', land: 'ascent', len: 30, foes: 'Gd9 Sl16^ Gd24', loot: '+14' },
    { zone: 'Akhade ka Kuan', art: 'dwand', land: 'flat', len: 22, cp: true, rest: true, loot: '+4 x16*' },
    {
      zone: 'Doosra Akhada',
      art: 'dwand',
      land: 'flat',
      len: 34,
      field: { kind: 'mud', power: 1 },
      foes: 'Pw8 Gd15 Pw22 Sl29',
      loot: '+31',
    },
    { zone: 'Mallon ki Toli', art: 'dwand', land: 'trench', len: 30, foes: 'Gd7 Pw14 Sl20 Pw25' },
    {
      zone: 'Rajgarh ka Akhada',
      art: 'dwand',
      len: 44,
      cp: true,
      loot: '+5',
      field: { kind: 'mud', power: 1 },
      arena: {
        name: 'JODASUR',
        room: 'open',
        bosses: ['jodasur'],
        rules: ['tej'],
        altars: 'x10',
        final: true,
      },
    },
  ],
};

/**
 * Suvarna, the last stage: the golden city burning. Meghbaan shoots from the clouds the whole way (a
 * mark on the ground, then arrows), his warriors of illusion are seen only when they shoot, torch throwers on the
 * walls. Chandan Vatika is the rest stop. Nidrasur sleeps across the way: cross him quietly, or he wakes and rolls.
 * Hansvimaan carries the squad over the burning city to Saptashir's court, and Saptashir of the seven heads: cut every head and
 * strike before they grow back, and answer his PRALAY with the squad's PARAMASTRA, which strikes his heart.
 */
const MAHAYUDDH: CourseDef = {
  id: 'astra-10',
  name: 'Suvarna Nagri',
  faction: 'demon',
  tint: 330,
  own: true,
  megh: true,
  param: true,
  mods: { enemyHp: 1.25, enemyFire: 1.15, enemyDamage: 1.15, bossHp: 1.15, bossTempo: 1.1 },
  sections: [
    { zone: 'Nagri ka Kinara', art: 'mahayuddh', land: 'flat', len: 22, stash: 18, loot: 'a8 +18^' },
    {
      zone: 'Jalti Nagri',
      art: 'mahayuddh',
      land: 'flat',
      len: 32,
      foes: 'Ms10 My16 Ms24 My28',
      loot: '+30',
    },
    {
      zone: 'Swarn Mahal ki Chhat',
      art: 'mahayuddh',
      land: 'rampart',
      len: 34,
      foes: 'Ms9^ My15 Ms22^ My29',
      loot: 'w20^',
    },
    {
      zone: 'Chandan Vatika',
      art: 'mahayuddh',
      land: 'flat',
      len: 22,
      cp: true,
      rest: true,
      loot: '+4 a16*',
    },
    { zone: 'Nidrasur ki Neend', art: 'mahayuddh', land: 'flat', len: 36, foes: 'Kb18', loot: '+33' },
    { zone: 'Hansvimaan', art: 'mahayuddh', land: 'skyway', len: 50, foes: 'My20 My34' },
    {
      zone: 'Saptashir ki Sabha',
      art: 'mahayuddh',
      len: 44,
      cp: true,
      loot: '+5 a9*',
      arena: { name: 'SAPTASHIR', room: 'classic', bosses: ['saptashir'], rules: ['pralay'], final: true },
    },
  ],
};

/** The stages as course data (the tests read them to check every stage keeps a shape of its own). */
export const SAGA_COURSES: Record<SagaId, CourseDef> = {
  'astra-1': withRests(AGNIVAN),
  'astra-2': withRests(SAGAR_SETU),
  'astra-3': withRests(VAYU_SHIKHAR),
  'astra-4': withRests(NAAG_LOK),
  'astra-5': withRests(MAYA_NAGRI),
  'astra-6': withRests(BHASM_PARVAT),
  'astra-7': withRests(SAMARPAN_MAIDAN),
  'astra-8': withRests(CHAKRA_DURG),
  'astra-9': withRests(DWAND_BHOOMI),
  'astra-10': withRests(MAHAYUDDH),
};

export const SAGA_BUILDERS: Record<SagaId, () => LevelDef> = {
  'astra-1': () => buildCourse(SAGA_COURSES['astra-1']),
  'astra-2': () => buildCourse(SAGA_COURSES['astra-2']),
  'astra-3': () => buildCourse(SAGA_COURSES['astra-3']),
  'astra-4': () => buildCourse(SAGA_COURSES['astra-4']),
  'astra-5': () => buildCourse(SAGA_COURSES['astra-5']),
  'astra-6': () => buildCourse(SAGA_COURSES['astra-6']),
  'astra-7': () => buildCourse(SAGA_COURSES['astra-7']),
  'astra-8': () => buildCourse(SAGA_COURSES['astra-8']),
  'astra-9': () => buildCourse(SAGA_COURSES['astra-9']),
  'astra-10': () => buildCourse(SAGA_COURSES['astra-10']),
};
