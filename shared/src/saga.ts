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
 *   2   Sagar Setu        varuna                   rain out walls of fire to get through
 *   3   Vayu Shikhar      vayu                     tear shields off, blow shots away, in storms that bend shots
 *   4   Naag Lok          naga + garuda            serpents that never miss; the eagle wipes the bosses' serpents
 *   5   Maya Nagri        brahmastra               the squad's shared meter, against endless waves
 *   6   Bhasm Parvat      pashupata                a different form every call: trident, spirit or fire rain
 *   7   Samarpan Maidan   narayanastra (boss)      stop fighting the storm, or it grows; a perfect surrender
 *                                                  makes the boss's second call rebound on it
 *   8   Chakra Durg       sudarshana               the discus hunts foe after foe and returns
 *   9   Dwand Bhoomi      vaishnava (boss)         only a vaishnava stops a vaishnava: turn the orb back
 *  10   Mahayuddh         brahmashirsha (boss)     answer it with the brahmastra, or dodge it
 *
 * Enemies are asura, rakshasa and naga hosts (the demon faction, each stage tinted its own colour); every name in
 * here is original: no god, avatar or epic hero appears as a character, and the astras are the hero's powers.
 */

export interface SagaStage {
  id: SagaId;
  num: number;
  name: string;
  place: string;
  /** The astra this stage is about (a boss astra for 7, 9 and 10; the team brahmastra for 5). */
  astra: PowerKind | 'brahma' | 'narayana' | 'brahmashirsha';
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
    astraName: 'Agneyastra',
    lore: 'The fire astra: flames that ordinary means cannot put out.',
    how: 'ASTRA button: a wall of fire, then burning ground. Whoever it touches burns on.',
    brief: [
      'An asura host has set the forest ablaze. Grab the AGNEYASTRA, climb the burning slope, fire it with ASTRA.',
      'Its fire rolls forward and leaves the ground burning: catch the crowd packed in the ember trench.',
      'Bosses: JWALA-ASUR the fire beast, and AGNI-DAITYA at the heart of the fire.',
    ],
    stars: 1,
    twist: 'Learn the ropes: ambushes and two asuras',
  },
  {
    id: 'astra-2',
    num: 2,
    name: 'Sagar Setu',
    place: 'The sea bridge',
    astra: 'varuna',
    astraName: 'Varunastra',
    lore: 'The water astra: a torrent of rain, the one answer to fire.',
    how: 'Walls of fire block the bridge: the rain of VARUNASTRA puts them out. Its altar returns.',
    brief: [
      'The sea bridge is broken: hop the wreckage. Burning wrecks wall off the way; only VARUNASTRA rain puts them out.',
      'Its altars come back a few seconds after you take one: you can never be locked out.',
      'Bosses: MAKARA rises from the bay; SAMUDRA-RAKSHAS holds the sea fortress.',
    ],
    stars: 2,
    twist: 'HOLD THE BRIDGE: survive the tide of asuras',
  },
  {
    id: 'astra-3',
    num: 3,
    name: 'Vayu Shikhar',
    place: 'The storm peaks',
    astra: 'vayu',
    astraName: 'Vayavyastra',
    lore: 'The wind astra: a gale strong enough to lift an army off the ground.',
    how: 'A whirlwind walks ahead: it lifts the host off its feet, then hurls it. Over fire it burns.',
    brief: [
      'Ride the updraft over the gorge and float through the thin air. Storms bend every shot; VAYAVYASTRA blows them away.',
      'It tears riot shields straight off: use it on the shield walls.',
      'Bosses: GARJAN-RAKSHAS rides the thunderheads; VAYU-DAITYA waits in the eye of the storm.',
    ],
    stars: 2,
    twist: 'SKY RAIDERS: they dive in from behind on the wind',
  },
  {
    id: 'astra-4',
    num: 4,
    name: 'Naag Lok',
    place: 'The serpent underworld',
    astra: 'naga',
    astraName: 'Nagastra',
    lore: 'The serpent astra never misses; the eagle, Garudastra, is its only counter.',
    how: 'NAGASTRA: three serpents hunt the nearest foes. GARUDASTRA wipes every enemy serpent from the sky.',
    brief: [
      'Down in the serpent caves your NAGASTRA sends three serpents that steer into the nearest foes: no aim needed.',
      'The bosses here call serpents too. Shoot them down, dash through them, or call GARUDASTRA (altars in the arenas).',
      'Bosses: VISH-NAAG in its den, and VISHARAJ, the serpent king.',
    ],
    stars: 3,
    twist: 'THE EARTH SERPENT: jump the shockwaves, then hold the nest',
  },
  {
    id: 'astra-5',
    num: 5,
    name: 'Maya Nagri',
    place: 'The city of illusions',
    astra: 'brahma',
    astraName: 'Brahmastra',
    lore: 'The greatest of astras: it can end a whole army, and it answers most others.',
    how: 'Every hit charges the squad BRAHMASTRA. When the bar is full, the ASTRA button calls it down.',
    brief: [
      'The squad shares one BRAHMASTRA meter: every hit and every kill fills it.',
      'When it is full, anyone with an empty astra slot calls it with the ASTRA button: the whole screen is struck.',
      'Endless ambushes, and every wall has a road over it and one under it. Bosses: CHHAYA-ASUR and MAYA-SENAPATI.',
    ],
    stars: 3,
    twist: 'MAYA: the world goes dark, stay in the light',
  },
  {
    id: 'astra-6',
    num: 6,
    name: 'Bhasm Parvat',
    place: 'The ash mountain',
    astra: 'pashupata',
    astraName: 'Pashupatastra',
    lore: 'An astra with a new form every time it is called.',
    how: 'Each call is one of three: a trident strike on 4 foes, a spirit that fights beside you, or a rain of fire.',
    brief: [
      'PASHUPATASTRA never comes the same way twice: a trident strike, a spirit ally, or a rain of fire.',
      'Climb the mountain, hop the ash gorge and the peaks. The spirit fights beside you for 7 seconds.',
      'Bosses: BHASMA-PRET in the hollow, KAAL-PRET on the crown of ash.',
    ],
    stars: 4,
    twist: 'ASH RAIN: burning rock falls all stage long',
  },
  {
    id: 'astra-7',
    num: 7,
    name: 'Samarpan Maidan',
    place: 'The great battlefield',
    astra: 'narayana',
    astraName: 'Narayanastra',
    lore: 'It grows with resistance. The only way through it is to lay down your weapons.',
    how: 'When a boss calls NARAYANASTRA: STOP FIRING. Fight it and more arrows fall on you. Surrender, and it passes.',
    brief: [
      'Fight trench to trench across the field. The bosses call NARAYANASTRA: arrows that grow the harder you fight.',
      'Stop firing and it spares you. Keep shooting and every volley at you gets bigger. The boss cannot be hurt during it.',
      'Pass a storm without anyone fighting it, and the boss’s second call rebounds on the boss itself.',
    ],
    stars: 4,
    twist: 'HOLD THE LINE: outlast the war drums',
  },
  {
    id: 'astra-8',
    num: 8,
    name: 'Chakra Durg',
    place: 'The discus fortress',
    astra: 'sudarshana',
    astraName: 'Sudarshana Chakra',
    lore: 'The discus that never misses, and returns to the hand that threw it.',
    how: 'SUDARSHANA flies to foe after foe (up to six), then comes back to you.',
    brief: [
      'Wall after wall, ring after ring: climb them or slip under. The SUDARSHANA CHAKRA seeks six foes, then flies home.',
      'In the CHAKRAVYUH two beasts fight you at once: keep the discus spinning.',
      'Bosses: CHAKRA-VIMANA in the sky, VYUH-SENANI at the heart of the formation.',
    ],
    stars: 5,
    twist: 'Spinning blades, and a ring to hold',
  },
  {
    id: 'astra-9',
    num: 9,
    name: 'Dwand Bhoomi',
    place: 'The duel ground',
    astra: 'vaishnava',
    astraName: 'Vaishnavastra',
    lore: 'Only another Vaishnavastra can stop a Vaishnavastra.',
    how: 'The bosses throw a golden orb you cannot shoot down. Grab VAISHNAVASTRA at the altar and fire it near the orb: it flies back at the boss.',
    brief: [
      'Duel after duel. The champions hurl a VAISHNAVA orb: slow, homing, and no bullet can stop it.',
      'Take VAISHNAVASTRA from the altar in the arena and fire it when the orb is close: the orb turns on its master.',
      'Bosses: DWAND-YODHA and DWAND-RAJ.',
    ],
    stars: 5,
    twist: 'Duels: one great warrior at a time',
  },
  {
    id: 'astra-10',
    num: 10,
    name: 'Mahayuddh',
    place: 'The last war',
    astra: 'brahmashirsha',
    astraName: 'Brahmashirsha',
    lore: 'Stronger than the Brahmastra, and once called it cannot be called back.',
    how: 'When MAHA-ASUR KAAL charges BRAHMASHIRSHA, answer it with the squad BRAHMASTRA, or dash at the last moment.',
    brief: [
      'Every astra, one last time: the fire road, the shattered bridge, the ash tunnel and the last rampart.',
      'MAHA-ASUR KAAL charges BRAHMASHIRSHA. Fire the BRAHMASTRA during the charge to cancel it and stun him.',
      'If nobody can, dash through the blast at the last moment. It cannot be called back: it scorches him too.',
    ],
    stars: 5,
    twist: 'Everything at once: sky fire, three bosses',
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

const AGNIVAN: CourseDef = {
  id: 'astra-1',
  name: 'Agnivan',
  faction: 'demon',
  tint: 0,
  mods: { enemyHp: 0.9, enemyFire: 0.9, enemyDamage: 0.9, bossHp: 0.85, bossTempo: 0.95 },
  sections: [
    { zone: 'Forest Edge', art: 'vana', land: 'flat', len: 24, foes: 'S11 S15 S19', loot: 'a7' },
    {
      zone: 'Burning Slope',
      art: 'vana',
      land: 'ascent',
      len: 34,
      stash: 26,
      foes: 'S4 S12^ G16^ S23^ S30',
      loot: '+12^ s26^',
    },
    {
      zone: 'Asura Ambush',
      art: 'vana',
      len: 28,
      cp: true,
      arena: {
        name: 'ASURA AMBUSH',
        vyuha: ['ardha', 'suchi', 'makara'],
        room: 'twin',
        waves: ['3SR SL', '2SR GR', '3SL S*R'],
      },
    },
    {
      zone: 'Ember Trench',
      art: 'vana',
      land: 'trench',
      len: 30,
      foes: 'S8_ S11_ G15 S19_ S22_',
      loot: '+2 a27',
    },
    {
      zone: 'Jwala Clearing',
      art: 'vana',
      len: 34,
      cp: true,
      loot: '+4 v8',
      arena: { name: 'JWALA-ASUR', room: 'open', bosses: ['walker'], hp: 0.9, waves: ['SR'] },
    },
    { zone: 'Smoke Pillars', art: 'vana', land: 'pillars', len: 30, foes: 'S7^ D12 G17^ J22', loot: '+22^' },
    { zone: 'Ash Canopy', art: 'vana', land: 'catwalks', len: 30, foes: 'S5 T13^ S18 H24', loot: '+14 v22' },
    {
      zone: 'Heart of the Fire',
      art: 'inferno',
      len: 50,
      cp: true,
      loot: '+26^ a17^ +40',
      arena: {
        name: 'AGNI-DAITYA',
        room: 'tiers',
        bosses: ['boss'],
        hp: 0.8,
        final: true,
        waves: ['2SL', 'GL HL'],
      },
    },
  ],
};

const SAGAR_SETU: CourseDef = {
  id: 'astra-2',
  name: 'Sagar Setu',
  faction: 'demon',
  tint: 185,
  mods: { enemyHp: 0.95, enemyFire: 0.95, enemyDamage: 0.95, bossHp: 0.9, bossTempo: 1 },
  sections: [
    { zone: 'Shore Camp', art: 'sagar', land: 'flat', len: 24, foes: 'S10 S15 G20', loot: 'w6' },
    {
      zone: 'Burning Wrecks',
      art: 'sagar',
      land: 'flat',
      len: 26,
      fire: [20],
      foes: 'S7 H14 S24',
      loot: 'w12*',
    },
    {
      zone: 'Broken Bridge',
      art: 'sagar',
      land: 'chasm',
      len: 36,
      foes: 'S6 D13 S20 J21 D28',
      loot: '+14 a22',
    },
    {
      zone: 'The Bridge',
      art: 'sagar',
      len: 30,
      cp: true,
      arena: {
        name: 'HOLD THE BRIDGE',
        vyuha: ['suchi', 'vajra', 'suchi'],
        room: 'high',
        survive: 22,
        waves: ['3SL 2SR', '2SU HR GR', '2SR 2SU J^'],
      },
    },
    {
      zone: 'Sea Wall',
      art: 'sagar',
      land: 'rampart',
      len: 34,
      foes: 'T12^ S16_ H20_ T24^ G22_',
      loot: 'm18^ +3',
    },
    {
      zone: 'Makara Bay',
      art: 'sagar',
      len: 36,
      cp: true,
      loot: '+4 w10*',
      arena: { name: 'MAKARA', room: 'twin', bosses: ['gunship'], waves: ['J^ SR', '2J^ SU'] },
    },
    {
      zone: 'Coral Steps',
      art: 'sagar',
      land: 'steps',
      len: 32,
      fire: [28],
      stash: 15,
      foes: 'D7 S11^ G16^ H25',
      loot: 'w21* l15^',
    },
    {
      zone: 'Flooded Trench',
      art: 'sagar',
      land: 'trench',
      len: 30,
      foes: 'S9_ G15 H20_ S23_',
      loot: '+27 v12',
    },
    {
      zone: 'Samudra Throne',
      art: 'sagar',
      len: 54,
      cp: true,
      loot: '+26^ w17^ +40',
      arena: {
        name: 'SAMUDRA-RAKSHAS',
        bosses: ['boss'],
        hp: 0.85,
        final: true,
        waves: ['2SU', 'J^ GL', 'HL 2J^'],
      },
    },
  ],
};

const VAYU_SHIKHAR: CourseDef = {
  id: 'astra-3',
  name: 'Vayu Shikhar',
  faction: 'demon',
  tint: 245,
  hazard: { kind: 'raid', every: 11, count: 2 },
  mods: { enemyHp: 1, enemyFire: 1, enemyDamage: 1, bossHp: 0.95, bossTempo: 1 },
  sections: [
    { zone: 'Foothills', art: 'shikhar', land: 'flat', len: 24, foes: 'S10 H15 S20', loot: 'v6' },
    {
      zone: 'Updraft Gorge',
      art: 'shikhar',
      land: 'chasm',
      len: 34,
      lifts: [15],
      foes: 'S7 D12 S20^ J25',
      loot: '+22^ g12',
    },
    {
      zone: 'Storm Ledges',
      art: 'shikhar',
      land: 'towers',
      len: 34,
      field: { kind: 'magnet', power: 0.9 },
      foes: 'S4 T14^ J21 G27',
      loot: 'v10^ +31',
    },
    {
      zone: 'Gale Ambush',
      art: 'shikhar',
      len: 30,
      cp: true,
      arena: {
        name: 'GALE AMBUSH',
        vyuha: ['garuda', 'vajra', 'ardha'],
        room: 'tiers',
        waves: ['2SR 2J^ SL', '2SP 2HR', 'GR 3J^ H*L'],
      },
    },
    {
      zone: 'Thin Air',
      art: 'shikhar',
      land: 'pits',
      len: 36,
      holes: [8, 21],
      holeW: 5,
      field: { kind: 'lowg', power: 0.45 },
      stash: 30,
      foes: 'S5 D15 J19 S31',
      loot: '+17 l30^ a19',
    },
    {
      zone: 'Thunder Nest',
      art: 'shikhar',
      len: 36,
      cp: true,
      loot: '+4 v9',
      arena: { name: 'GARJAN-RAKSHAS', room: 'high', bosses: ['gunship'], waves: ['2J^', 'J^ SP GL'] },
    },
    {
      zone: 'Lightning Peaks',
      art: 'shikhar',
      land: 'pillars',
      len: 32,
      field: { kind: 'magnet', power: 1.1 },
      foes: 'S6^ D12 G17^ J23 S25^',
      loot: '+18^ g8',
    },
    {
      zone: 'Summit Walk',
      art: 'shikhar',
      land: 'catwalks',
      len: 30,
      foes: 'H5 S10^ J16 G22 D27',
      loot: 'v17^ +26',
    },
    {
      zone: 'Eye of the Storm',
      art: 'shikhar',
      len: 54,
      cp: true,
      loot: '+26^ v17^ +40',
      arena: {
        name: 'VAYU-DAITYA',
        room: 'twin',
        bosses: ['boss'],
        hp: 0.9,
        final: true,
        waves: ['SP 2J^', 'HL GR', '3J^'],
      },
    },
  ],
};

const NAAG_LOK: CourseDef = {
  id: 'astra-4',
  name: 'Naag Lok',
  faction: 'demon',
  tint: 115,
  hazard: { kind: 'tremor', every: 10, count: 1 },
  mods: { enemyHp: 1.05, enemyFire: 1.05, enemyDamage: 1.05, bossHp: 1, bossTempo: 1.02 },
  sections: [
    { zone: 'Serpent Gate', art: 'naglok', land: 'flat', len: 24, foes: 'S11 D15 S19', loot: 'n6' },
    {
      zone: 'Coil Tunnel',
      art: 'naglok',
      land: 'tunnel',
      len: 30,
      stash: 22,
      foes: 'S6 G12 H18 S27',
      loot: '+15 s22^',
    },
    {
      zone: 'Venom Pit',
      art: 'naglok',
      land: 'trench',
      len: 30,
      foes: 'S7_ S10_ G15 H21_ S24_',
      loot: '+15',
    },
    {
      zone: 'Coil Ambush',
      art: 'naglok',
      len: 30,
      cp: true,
      arena: {
        name: 'COIL AMBUSH',
        vyuha: ['makara', 'chakra', 'suchi'],
        room: 'twin',
        waves: ['2SU 2SL', 'HR GU 2J^', '2SU HR G*L'],
      },
    },
    {
      zone: 'Root Halls',
      art: 'naglok',
      land: 'towers',
      len: 34,
      foes: 'S4 T8^ G13 J19 D26 S31',
      loot: 'n21^ g27',
    },
    {
      zone: 'Vish-Naag Den',
      art: 'naglok',
      len: 38,
      cp: true,
      loot: '+4 g8*',
      arena: { name: 'VISH-NAAG', bosses: ['walker'], hp: 1, rules: ['naga'], waves: ['SU GR'] },
    },
    {
      zone: 'Jewel Caverns',
      art: 'naglok',
      land: 'tunnel',
      len: 32,
      foes: 'S5 J11 G17 H22 D27',
      loot: 'n13^ +30',
    },
    {
      zone: 'The Nest',
      art: 'naglok',
      len: 30,
      cp: true,
      arena: {
        name: 'THE NEST WAKES',
        vyuha: ['chakra', 'vajra', 'chakra'],
        room: 'tiers',
        survive: 25,
        waves: ['2HR 2HL J^', '2GU 3J^', '3SU 3SL'],
      },
    },
    {
      zone: 'Sunken Temple',
      art: 'naglok',
      land: 'pillars',
      len: 28,
      foes: 'S6^ D13 G15^ S20^',
      loot: 'g14^ +25',
    },
    {
      zone: 'Throne of Visharaj',
      art: 'naglok',
      len: 56,
      cp: true,
      loot: '+26^ n17^ +40 g10*',
      arena: {
        name: 'VISHARAJ',
        room: 'high',
        bosses: ['boss'],
        hp: 0.9,
        rules: ['naga'],
        final: true,
        waves: ['2SL', 'J^ HU', 'GL 2J^'],
      },
    },
  ],
};

const MAYA_NAGRI: CourseDef = {
  id: 'astra-5',
  name: 'Maya Nagri',
  faction: 'demon',
  tint: 290,
  hazard: { kind: 'dark', every: 16, count: 5 },
  brahma: true,
  mods: { enemyHp: 1.1, enemyFire: 1.05, enemyDamage: 1.05, bossHp: 1.05, bossTempo: 1.05 },
  sections: [
    { zone: 'Mirage Gate', art: 'maya', land: 'flat', len: 24, foes: 'S9 S13 G18 S21', loot: 'a6' },
    {
      zone: 'Mirror Walls',
      art: 'maya',
      land: 'rampart',
      len: 34,
      field: { kind: 'magnet', power: 0.7 },
      foes: 'T13^ S17_ H22_ T25^ G27_',
      loot: 'v20^ +3',
    },
    {
      zone: 'Illusion Ambush',
      art: 'maya',
      len: 30,
      cp: true,
      arena: {
        name: 'ILLUSION AMBUSH',
        vyuha: ['vajra', 'ardha', 'chakra', 'garuda'],
        room: 'twin',
        waves: ['3SP 2SL', '2HL 2J^ GP', '2SP 3SR', 'HR HP 2G*P'],
      },
    },
    { zone: 'Golden Bridge', art: 'maya', land: 'bridge', len: 32, foes: 'D6 S11 J15 H21 D26', loot: 'n16' },
    {
      zone: 'Maya Court',
      art: 'maya',
      len: 34,
      cp: true,
      loot: '+4 a10',
      arena: { name: 'CHHAYA-ASUR', room: 'tiers', bosses: ['gunship'], waves: ['J^ SP', 'SR GP J^'] },
    },
    {
      zone: 'Palace Terraces',
      art: 'maya',
      land: 'ascent',
      len: 34,
      stash: 25,
      foes: 'S4 G11^ S16^ H22^ D27 S31',
      loot: '+12^ m25^',
    },
    {
      zone: 'Endless Corridor',
      art: 'maya',
      len: 32,
      cp: true,
      arena: {
        name: 'ENDLESS CORRIDOR',
        vyuha: ['suchi', 'makara', 'suchi', 'ardha'],
        room: 'high',
        waves: ['3SP 2SL', '2HP 2HL J^', '3GR 2J^', '3SR 3SP'],
      },
    },
    {
      zone: 'Spire of Lies',
      art: 'maya',
      land: 'towers',
      len: 34,
      field: { kind: 'magnet', power: 1 },
      foes: 'S3 T7^ G11 D17 T22^ H26 J31',
      loot: 'a13^ +30',
    },
    {
      zone: 'Palace of Maya',
      art: 'maya',
      len: 56,
      cp: true,
      loot: '+26^ n17^ +40',
      arena: {
        name: 'MAYA-SENAPATI',
        bosses: ['boss'],
        hp: 0.95,
        final: true,
        waves: ['SP 2J^', 'HL GP J^'],
      },
    },
  ],
};

const BHASM_PARVAT: CourseDef = {
  id: 'astra-6',
  name: 'Bhasm Parvat',
  faction: 'demon',
  tint: 35,
  hazard: { kind: 'skyfall', every: 8, count: 3 },
  mods: { enemyHp: 1.15, enemyFire: 1.1, enemyDamage: 1.1, bossHp: 1.05, bossTempo: 1.06 },
  sections: [
    { zone: 'Ash Fields', art: 'bhasm', land: 'flat', len: 24, foes: 'S10 S14 G19', loot: 'p6' },
    {
      zone: 'Mountain Climb',
      art: 'bhasm',
      land: 'ascent',
      len: 36,
      foes: 'S4 S12^ G16^ T24^ S28^ D33',
      loot: '+17^ n9',
    },
    {
      zone: 'Ghost Ambush',
      art: 'bhasm',
      len: 30,
      cp: true,
      arena: {
        name: 'GHOST AMBUSH',
        vyuha: ['chakra', 'garuda', 'makara'],
        room: 'high',
        waves: ['2SU 2SL J^', 'HR 2GU', '2J^ SU HR'],
      },
    },
    { zone: 'Cinder Gorge', art: 'bhasm', land: 'chasm', len: 32, foes: 'S6 D12 J18 S24', loot: '+13 v11' },
    {
      zone: 'Pret Hollow',
      art: 'bhasm',
      len: 38,
      cp: true,
      loot: '+4 p8',
      arena: { name: 'BHASMA-PRET', room: 'twin', bosses: ['walker'], hp: 1.1, waves: ['SU GR', 'J^ SU'] },
    },
    {
      zone: 'Burnt Shrine',
      art: 'bhasm',
      land: 'tunnel',
      len: 34,
      stash: 26,
      foes: 'S5 H11 G16 S22 D30',
      loot: 'p14^ l26^',
    },
    {
      zone: 'Ash Peaks',
      art: 'bhasm',
      land: 'pillars',
      len: 32,
      foes: 'S6^ G11^ D16 S19^ J24',
      loot: '+13^ a6',
    },
    {
      zone: 'Wraith Ambush',
      art: 'bhasm',
      len: 30,
      cp: true,
      arena: {
        name: 'WRAITH AMBUSH',
        vyuha: ['ardha', 'chakra', 'vajra'],
        waves: ['2HU HL 2J^', '2GR 2J^ SU', '3SU 3S*L'],
      },
    },
    {
      zone: 'Crown of Ash',
      art: 'bhasm',
      len: 56,
      cp: true,
      loot: '+26^ p17^ +40',
      arena: {
        name: 'KAAL-PRET',
        room: 'twin',
        bosses: ['boss'],
        hp: 0.95,
        final: true,
        waves: ['SU J^', 'GL HU', 'J^ SR'],
      },
    },
  ],
};

const SAMARPAN_MAIDAN: CourseDef = {
  id: 'astra-7',
  name: 'Samarpan Maidan',
  faction: 'demon',
  tint: 15,
  mods: { enemyHp: 1.2, enemyFire: 1.1, enemyDamage: 1.1, bossHp: 1.1, bossTempo: 1.08 },
  sections: [
    { zone: 'Dawn Camp', art: 'kurukshetra', land: 'flat', len: 24, foes: 'S9 S13 H17 S21', loot: 'n6' },
    {
      zone: 'First Trench',
      art: 'kurukshetra',
      land: 'trench',
      len: 30,
      foes: 'S8_ G15 S20_ H23_',
      loot: 'a15 +28',
    },
    {
      zone: 'Conch Ambush',
      art: 'kurukshetra',
      len: 30,
      cp: true,
      arena: {
        name: 'CONCH AMBUSH',
        vyuha: ['makara', 'garuda', 'ardha'],
        room: 'open',
        waves: ['3SR 2SL', 'HR 2J^ G*L', '2SL 2SR J^'],
      },
    },
    {
      zone: 'Chariot Wall',
      art: 'kurukshetra',
      land: 'rampart',
      len: 36,
      stash: 18,
      foes: 'T14^ S18_ G23_ T27^ H25_ D32',
      loot: 's18^ +34',
    },
    {
      zone: 'First Storm',
      art: 'kurukshetra',
      len: 38,
      cp: true,
      loot: '+4',
      arena: {
        name: 'RAN-BHAIRAV',
        room: 'twin',
        bosses: ['walker'],
        hp: 1.05,
        rules: ['narayana'],
        waves: ['S*R SL'],
      },
    },
    {
      zone: 'Second Trench',
      art: 'kurukshetra',
      land: 'trench',
      len: 34,
      foes: 'S6_ S10_ G17 H22_ S27_ J29',
      loot: '+18 n31',
    },
    {
      zone: 'The Line',
      art: 'kurukshetra',
      len: 32,
      cp: true,
      arena: {
        name: 'HOLD THE LINE',
        vyuha: ['garuda', 'suchi', 'ardha', 'vajra'],
        room: 'tiers',
        survive: 30,
        waves: ['3SR 2SL', '2HR HL 2J^', '3GR 2J^', '3SR 3SL H*R'],
      },
    },
    {
      zone: 'Field of Arrows',
      art: 'kurukshetra',
      land: 'pits',
      len: 34,
      holes: [9, 22],
      foes: 'S4 T16^ D19 H28 J31',
      loot: 'a17^ +31',
    },
    {
      zone: 'Samarpan Maidan',
      art: 'kurukshetra',
      len: 56,
      cp: true,
      loot: '+26^ +40',
      arena: {
        name: 'RAN-GURU',
        room: 'high',
        bosses: ['boss'],
        hp: 1,
        rules: ['narayana'],
        final: true,
        waves: ['SL SR', 'GL HL'],
      },
    },
  ],
};

const CHAKRA_DURG: CourseDef = {
  id: 'astra-8',
  name: 'Chakra Durg',
  faction: 'demon',
  tint: 45,
  mods: { enemyHp: 1.25, enemyFire: 1.12, enemyDamage: 1.12, bossHp: 1.12, bossTempo: 1.1 },
  sections: [
    { zone: 'Outer Ring', art: 'chakra', land: 'flat', len: 24, foes: 'S10 H14 S19', loot: 'c6' },
    {
      zone: 'First Wall',
      art: 'chakra',
      land: 'rampart',
      len: 34,
      foes: 'S14^ H17_ T20^ G24_ D30',
      loot: 'c19^ +31',
    },
    {
      zone: 'Second Ring',
      art: 'chakra',
      len: 30,
      cp: true,
      arena: {
        name: 'SECOND RING',
        vyuha: ['chakra', 'makara', 'chakra'],
        room: 'twin',
        survive: 24,
        waves: ['2SR 2SL HP', '2HL 2J^ SP', 'GR GL 2S*P'],
      },
    },
    {
      zone: 'Blade Pillars',
      art: 'chakra',
      land: 'pillars',
      len: 30,
      foes: 'S7^ J12 S16^ J22',
      loot: '+12^ v20',
    },
    {
      zone: 'Chakravyuh',
      art: 'chakra',
      len: 40,
      cp: true,
      loot: '+4 c10',
      arena: { name: 'CHAKRAVYUH', bosses: ['walker', 'walker'], hp: 0.65, waves: ['SR SL', 'GP GL'] },
    },
    {
      zone: 'Inner Wall',
      art: 'chakra',
      land: 'rampart',
      len: 36,
      stash: 22,
      foes: 'T12^ S16_ G20_ T26^ H27_ D33',
      loot: 'm22^ +33',
    },
    {
      zone: 'Disc Sky',
      art: 'chakra',
      len: 34,
      cp: true,
      loot: '+4 c8',
      arena: { name: 'CHAKRA-VIMANA', room: 'high', bosses: ['gunship'], waves: ['2J^', 'SP J^ GR'] },
    },
    {
      zone: 'Core Bridge',
      art: 'chakra',
      land: 'bridge',
      len: 32,
      foes: 'S5 J10 D15 S20 H25 J28',
      loot: '+14 n22',
    },
    {
      zone: 'Heart of the Vyuh',
      art: 'chakra',
      len: 56,
      cp: true,
      loot: '+26^ c17^ +40',
      arena: {
        name: 'VYUH-SENANI',
        room: 'tiers',
        bosses: ['boss'],
        hp: 1,
        final: true,
        waves: ['2SL J^', 'HP GL 2J^'],
      },
    },
  ],
};

const DWAND_BHOOMI: CourseDef = {
  id: 'astra-9',
  name: 'Dwand Bhoomi',
  faction: 'demon',
  tint: 205,
  mods: { enemyHp: 1.3, enemyFire: 1.15, enemyDamage: 1.15, bossHp: 1.12, bossTempo: 1.1 },
  sections: [
    { zone: 'Duel Gate', art: 'dwand', land: 'flat', len: 22, foes: 'S9 H14 S18', loot: 'x6' },
    {
      zone: 'First Challenge',
      art: 'dwand',
      len: 26,
      cp: true,
      arena: { name: 'FIRST CHALLENGE', room: 'open', waves: ['HR SR', 'GR H*L'] },
    },
    {
      zone: 'Golden Stairs',
      art: 'dwand',
      land: 'ascent',
      len: 32,
      foes: 'S4 G13^ S17^ T23^ S29',
      loot: '+12^ c20',
    },
    {
      zone: 'Herald Ambush',
      art: 'dwand',
      len: 30,
      cp: true,
      arena: {
        name: 'HERALD AMBUSH',
        vyuha: ['vajra', 'suchi', 'garuda', 'ardha'],
        room: 'tiers',
        waves: ['2SR 2SL', 'HR 2J^ GL', '2SL S*R J^', 'HR HL GR'],
      },
    },
    {
      zone: 'First Duel',
      art: 'dwand',
      len: 38,
      cp: true,
      loot: '+4 n9',
      arena: {
        name: 'DWAND-YODHA',
        room: 'open',
        bosses: ['walker'],
        hp: 1.1,
        rules: ['vaishnava'],
        altars: 'x6',
        waves: ['HR'],
      },
    },
    { zone: 'Mirror Lake', art: 'dwand', land: 'chasm', len: 30, foes: 'S7 D14 S21', loot: '+15 a22' },
    {
      zone: 'Champion Ambush',
      art: 'dwand',
      len: 32,
      cp: true,
      arena: {
        name: 'CHAMPION AMBUSH',
        vyuha: ['ardha', 'makara', 'chakra', 'vajra'],
        room: 'twin',
        waves: ['2SR 2SL', '2HR 2HL J^', '2GR 2J^', '3SR 3SL 2H*R'],
      },
    },
    {
      zone: 'Hall of Oaths',
      art: 'dwand',
      land: 'tunnel',
      len: 32,
      stash: 20,
      foes: 'S5 H10 G25 S29',
      loot: 'l20^ +13',
    },
    {
      zone: 'Dwand Bhoomi',
      art: 'dwand',
      len: 56,
      cp: true,
      loot: '+26^ +40',
      arena: {
        name: 'DWAND-RAJ',
        bosses: ['boss'],
        hp: 1.05,
        rules: ['vaishnava'],
        altars: 'x8',
        final: true,
        waves: ['SL J^', 'GL 2J^', 'H*L SL'],
      },
    },
  ],
};

const MAHAYUDDH: CourseDef = {
  id: 'astra-10',
  name: 'Mahayuddh',
  faction: 'demon',
  tint: 330,
  hazard: { kind: 'skyfall', every: 7, count: 3 },
  brahma: true,
  mods: { enemyHp: 1.35, enemyFire: 1.2, enemyDamage: 1.2, bossHp: 1.18, bossTempo: 1.14 },
  sections: [
    { zone: 'Last Dawn', art: 'mahayuddh', land: 'flat', len: 24, foes: 'S9 S13 H17 G21', loot: 'c6' },
    {
      zone: 'Burning Road',
      art: 'mahayuddh',
      land: 'flat',
      len: 26,
      fire: [20],
      foes: 'S5 H12 G24',
      loot: 'w13*',
    },
    {
      zone: 'Host of Asuras',
      art: 'mahayuddh',
      len: 32,
      cp: true,
      arena: {
        name: 'HOST OF ASURAS',
        vyuha: ['ardha', 'suchi', 'vajra', 'makara', 'chakra'],
        room: 'tiers',
        waves: ['3SR 2SL', '2HU 2HL J^', '3GP 2J^', '2HR SL 2GL J^', '3SU 3SP S*L'],
      },
    },
    {
      zone: 'Shattered Bridge',
      art: 'mahayuddh',
      land: 'chasm',
      len: 34,
      foes: 'S5 D12 S19 J26',
      loot: 'g13 n25',
    },
    {
      zone: 'Naga Champion',
      art: 'mahayuddh',
      len: 38,
      cp: true,
      loot: '+4 g8*',
      arena: {
        name: 'SHESH-DAITYA',
        room: 'twin',
        bosses: ['walker'],
        hp: 1.1,
        rules: ['naga'],
        waves: ['SL SU'],
      },
    },
    {
      zone: 'Ash Tunnel',
      art: 'mahayuddh',
      land: 'tunnel',
      len: 34,
      stash: 25,
      foes: 'S5 G10 H18 J29 D31',
      loot: 'p13^ s25^',
    },
    {
      zone: 'Orb Sky',
      art: 'mahayuddh',
      len: 36,
      cp: true,
      loot: '+4',
      arena: {
        name: 'VAJRA-VIMANA',
        room: 'high',
        bosses: ['gunship'],
        rules: ['vaishnava'],
        altars: 'x9',
        waves: ['J^ SP', 'J^ SR'],
      },
    },
    {
      zone: 'Last Rampart',
      art: 'mahayuddh',
      land: 'rampart',
      len: 36,
      foes: 'T13^ S17_ G22_ T26^ H24_ J30 D33',
      loot: 'c20^ +34',
    },
    {
      zone: 'Mahayuddh',
      art: 'mahayuddh',
      len: 58,
      cp: true,
      loot: '+26^ a17^ +40',
      arena: {
        name: 'MAHA-ASUR KAAL',
        room: 'twin',
        bosses: ['boss'],
        hp: 1.1,
        rules: ['brahmashirsha', 'naga'],
        final: true,
        waves: ['SL 2J^', 'GU HL', 'J^ 2SP'],
      },
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
