import { GAME_CONFIG, isMissionId, type MissionId, type TrooperKind } from './config';
import { buildCourse, type CourseDef } from './course';
import { SAGA, SAGA_BUILDERS } from './saga';
import { Builder, type LevelDef, type WaveSpawn } from './level';

/**
 * The campaign. `MISSIONS` is light metadata for menus; the heavy `LevelDef` is built only when a mission is
 * played (`getMission`) and then cached, so a server shares one immutable copy between all its rooms and a phone
 * never builds missions nobody picked.
 *
 * Mission 1 is hand-placed with the `Builder` primitives. Missions 2–4 are written as section data (`course.ts`):
 * the same terrain templates reused with different enemies, pickups, art and tougher `mods`.
 */

export interface MissionInfo {
  id: MissionId;
  num: number;
  name: string;
  /** Where it takes place (menus). */
  place: string;
  /** Toughness 1..4 (menus). */
  stars: number;
  /** One line per highlight, for the lobby briefing. */
  brief: string[];
  /** Advanced missions bring powers and new rules; auto-fire starts off in them. */
  advanced: boolean;
}

export const MISSIONS: readonly MissionInfo[] = [
  {
    id: 'mission-1',
    num: 1,
    name: 'Operation Lifeline',
    place: 'Jungle',
    stars: 1,
    advanced: false,
    brief: [
      'Ambush: the way locks shut. Clear every wave to open the gate.',
      '3 bosses: WARHOUND the walking tank, VULTURE the gunship, the IRON FORTRESS.',
    ],
  },
  {
    id: 'mission-2',
    num: 2,
    name: 'Curse of the Pharaoh',
    place: 'Desert tombs',
    stars: 2,
    advanced: false,
    brief: [
      'A cursed tomb army wakes: mummies, jackal guards with gold shields, flying scarabs.',
      'TWIN SCORPIONS: two giant scorpions at once. The SUN FALCON brings escorts.',
      'Final: the ANUBIS COLOSSUS, a living statue on the great pyramid.',
    ],
  },
  {
    id: 'mission-3',
    num: 3,
    name: 'Thunder of the North',
    place: 'Frozen north',
    stars: 3,
    advanced: false,
    brief: [
      'Undead viking warriors with round shields, ravens and rune totems. Two 4-wave ambushes.',
      'THOR, the thunder god, strikes from the storm. FENRIR the giant wolf guards his den.',
      'Final: the FROST GIANT in his ice hall keeps calling reinforcements.',
    ],
  },
  {
    id: 'mission-4',
    num: 4,
    name: 'Storm over Olympus',
    place: 'Mount Olympus',
    stars: 4,
    advanced: false,
    brief: [
      'The hardest run: skeleton hoplites, harpies and 5-wave ambushes in a lightning storm.',
      'MINOTAUR AND HARPY fight together, then the MINOTAUR KING alone.',
      'Final: ZEUS on his temple throws lightning, faster and tougher, with escorts.',
    ],
  },
  {
    id: 'mission-5',
    num: 5,
    name: 'Operation Astra',
    place: 'Burning citadel',
    stars: 5,
    advanced: true,
    brief: [
      'A demon army holds the citadel. Grab astras and fire them with the ASTRA button.',
      'Agni: a wave of fire that sets the ground ablaze. Vayu: a gust that blows demons away.',
      'Walls of fire block the way: only the rain of Varuna puts them out (its altar returns).',
      'Every kill charges the squad BRAHMASTRA: when it is full, anyone can call it down.',
      'Bosses: the INFERNO BEAST, a FIRE DRAGON and the DEMON KING on his throne.',
    ],
  },
  {
    id: 'mission-6',
    num: 6,
    name: 'Alien Invasion',
    place: 'Deep space',
    stars: 5,
    advanced: true,
    brief: [
      'Low gravity: long floaty jumps over wide craters. Anti-gravity beams lift you up.',
      'Gravity wells pull you toward the pits; magnetic storms bend every shot.',
      'Aliens, probe drones and plasma pods. Your power: the BLACK HOLE swallows them and their shots.',
      'Bosses: the XENO CRAWLER, a UFO MOTHERSHIP and the HIVE QUEEN, fought in low gravity.',
    ],
  },
];

/** Menu info for any mission: the campaign, or a saga stage (named "Astra n · Name"). */
export function missionInfo(id: string): MissionInfo {
  const m = MISSIONS.find((x) => x.id === id);
  if (m) return m;
  const s = SAGA.find((x) => x.id === id);
  if (s)
    return {
      id: s.id,
      num: s.num,
      name: s.name,
      place: s.place,
      stars: s.stars,
      brief: s.brief,
      advanced: true,
    };
  return MISSIONS[0] as MissionInfo;
}

const T = GAME_CONFIG.tile;

/** Ground surface row for most of the mission (rows below are solid). */
const G = 14;

const w = (kind: TrooperKind, side: WaveSpawn['side'], n = 1): WaveSpawn[] =>
  Array.from({ length: n }, () => ({ kind, side }));

/** Mission 1, "Operation Lifeline": jungle, ambush, river, WARHOUND, towers, VULTURE, the Iron Fortress. */
function buildMission1(): LevelDef {
  const b = new Builder(276, 18);
  // Art breakpoints (unchanged from the original hand-tuned look).
  b.style(0, 'jungle').style(93, 'river').style(141, 'towers').style(173, 'fortress');

  // ---- 1. Landing zone: learn to run, jump, double jump and shoot.
  b.zone(0, 'Landing Zone');
  b.ground(0, 30, G);
  b.platform(10, 13, 11);
  b.platform(17, 21, 8);
  b.pickup('spread', 19, 8);
  b.enemy('soldier', 16, G).enemy('soldier', 25, G).enemy('soldier', 28, G);

  // ---- 2. Jungle: pits and platforms, a turret on a ledge, the first shield trooper.
  b.zone(31, 'Jungle');
  b.ground(34, 44, G); // pit at 31-33
  b.platform(30, 35, 11);
  b.block(40, 44, 12, 13); // raised ledge
  b.enemy('turret', 42, 12);
  b.ground(48, 66, G); // pit at 45-47
  b.platform(45, 48, 10);
  b.platform(52, 56, 11);
  b.platform(58, 62, 8);
  b.pickup('medkit', 60, 8);
  b.enemy('soldier', 50, G).enemy('shield', 55, G).enemy('soldier', 64, G);
  b.enemy('drone', 59, G).enemy('grenadier', 63, G);
  b.checkpoint(66, G);

  // ---- 3. Ambush: the way locks behind a gate; survive three waves coming from both sides and the sky.
  b.zone(67, 'Ambush');
  b.ground(67, 92, G);
  b.platform(74, 78, 11);
  b.platform(82, 85, 10);
  const g1 = b.gate(90, G - 1);
  b.arena('AMBUSH', { trigger: 73, left: 67, right: 89, floor: G, gate: g1 }, [
    [...w('soldier', 'R', 3), ...w('soldier', 'L', 1)],
    [...w('shield', 'R', 1), ...w('grenadier', 'R', 1), ...w('jetpack', 'sky', 2)],
    [...w('soldier', 'L', 2), ...w('shield', 'R', 1), ...w('jetpack', 'sky', 1), ...w('grenadier', 'L', 1)],
  ]);

  // ---- 4. River bridge: drones and jetpacks from the sky, a gap to jump.
  b.zone(93, 'River Bridge');
  b.ground(91, 99, G);
  b.platform(100, 125, 12); // the bridge (one-way, river below)
  b.block(100, 100, 13, 17);
  b.block(113, 113, 13, 17);
  b.block(125, 125, 13, 17);
  b.enemy('drone', 104, 12).enemy('jetpack', 112, 12).enemy('drone', 120, 12);
  b.enemy('soldier', 108, 12).enemy('shield', 118, 12);
  b.pickup('rapid', 113, 12);

  // ---- 5. WARHOUND: boss 1, a walking assault tank, in a walled yard.
  b.zone(126, 'Tank Yard');
  b.ground(126, 160, G);
  b.checkpoint(128, G);
  b.platform(137, 140, 10);
  b.pickup('medkit', 130, G);
  const g2 = b.gate(158, G - 1);
  const a2 = b.arena('WARHOUND', { trigger: 134, left: 126, right: 157, floor: G, gate: g2 }, [], 'walker');
  b.boss('walker', 153, G * T, a2);

  // ---- 6. Watchtowers: climbing, turrets above.
  b.zone(161, 'Watchtowers');
  b.ground(159, 192, G);
  b.block(166, 168, 11, 13);
  b.platform(170, 174, 9);
  b.block(176, 178, 9, 13);
  b.enemy('turret', 177, 9);
  b.platform(180, 185, 7);
  b.pickup('laser', 182, 7);
  b.enemy('soldier', 172, G).enemy('grenadier', 183, G).enemy('drone', 188, G).enemy('shield', 189, G);
  b.enemy('jetpack', 164, G);
  b.pickup('medkit', 191, G);

  // ---- 7. VULTURE: boss 2, an attack gunship over the fortress wall.
  b.zone(193, 'Fortress Wall');
  b.ground(193, 224, G);
  b.checkpoint(194, G);
  b.platform(201, 204, 11);
  b.platform(207, 211, 8);
  b.platform(214, 217, 11);
  const g3 = b.gate(222, G - 1);
  const a3 = b.arena('VULTURE', { trigger: 199, left: 193, right: 221, floor: G, gate: g3 }, [], 'gunship');
  b.boss('gunship', 214, GAME_CONFIG.enemies.gunship.hoverY, a3);

  // ---- 8. The Iron Fortress: the final boss.
  b.zone(225, 'Iron Fortress');
  b.ground(223, 275, G);
  b.checkpoint(226, G);
  b.platform(238, 242, 11);
  b.platform(247, 251, 8);
  b.platform(254, 258, 11);
  b.pickup('medkit', 249, 8);
  b.pickup('spread', 240, 11);
  b.block(274, 275, 0, G - 1); // back wall behind the boss
  const a4 = b.arena(
    'IRON FORTRESS',
    { trigger: 233, left: 223, right: 263, floor: G, gate: -1 },
    [],
    'boss',
  );
  b.boss('boss', 268, G * T, a4);

  return b.build({ id: 'mission-1', name: 'Operation Lifeline', start: { x: 3 * T, y: G * T } });
}

// ---------------------------------------------------------------- missions 2-4 (section data, see course.ts)

const SANDSTORM: CourseDef = {
  id: 'mission-2',
  name: 'Curse of the Pharaoh',
  faction: 'pharaoh',
  mods: { enemyHp: 1.15, enemyFire: 1.1, enemyDamage: 1.1, bossHp: 1.1, bossTempo: 1.1 },
  sections: [
    { zone: 'Desert Gate', art: 'desert', land: 'flat', len: 26, foes: 'S12 S17 S22 D20', loot: 's9^' },
    {
      zone: 'Dune Sea',
      art: 'desert',
      land: 'pits',
      len: 38,
      holes: [9, 22],
      foes: 'S6 S14 T16^ G20 D24 H28 T31^',
      loot: '+34',
    },
    {
      zone: 'Valley of Kings',
      art: 'desert',
      len: 28,
      cp: true,
      arena: { name: 'THE CURSE WAKES', waves: ['3SR SL', 'HR GR 2J^', '2SL HR GL J^', '2HR 2SL 2J^'] },
    },
    { zone: 'Oasis Bridge', art: 'desert', land: 'bridge', len: 30, foes: 'D8 S12 J14 H20 D24', loot: 'm15' },
    {
      zone: 'Temple Steps',
      art: 'tomb',
      land: 'steps',
      len: 32,
      cp: true,
      foes: 'S5 T12^ D18 G18 H22 S27',
      loot: '+16^',
    },
    {
      zone: 'Scorpion Pit',
      art: 'desert',
      len: 38,
      cp: true,
      loot: '+4',
      arena: { name: 'TWIN SCORPIONS', bosses: ['walker', 'walker'], hp: 0.62 },
    },
    {
      zone: 'Hall of Pillars',
      art: 'tomb',
      land: 'catwalks',
      len: 36,
      foes: 'S8 J10 G14 H20 T24^ D28 S30',
      loot: 'l18^ +33',
    },
    {
      zone: 'Sealed Chamber',
      art: 'tomb',
      len: 30,
      cp: true,
      arena: { name: 'SEALED CHAMBER', waves: ['2SR 2SL J^', 'HR HL GR', '3J^ 2SR', 'GL GR HR 2SL'] },
    },
    {
      zone: 'Sky Road',
      art: 'desert',
      land: 'pits',
      len: 34,
      holes: [7, 18, 27],
      foes: 'D10 S14 J16 G23 D30 S31',
      loot: '+15^',
    },
    {
      zone: 'Falcon Spire',
      art: 'tomb',
      len: 32,
      cp: true,
      loot: '+4 s10^',
      arena: { name: 'SUN FALCON', bosses: ['gunship'], waves: ['SL SR', '2J^ GL'] },
    },
    {
      zone: 'Great Pyramid',
      art: 'tomb',
      len: 54,
      cp: true,
      loot: '+26^ m17^',
      arena: { name: 'ANUBIS COLOSSUS', bosses: ['boss'], final: true, waves: ['2SL'] },
    },
  ],
};

const FROSTBITE: CourseDef = {
  id: 'mission-3',
  name: 'Thunder of the North',
  faction: 'norse',
  mods: { enemyHp: 1.25, enemyFire: 1.15, enemyDamage: 1.15, bossHp: 1.15, bossTempo: 1.12 },
  sections: [
    { zone: 'Longship Shore', art: 'snow', land: 'flat', len: 24, foes: 'S11 S16 D18 H21', loot: 'm9^' },
    {
      zone: 'Avalanche Run',
      art: 'snow',
      land: 'pits',
      len: 30,
      holes: [6, 16, 24],
      foes: 'S4 S12 G20 D16 J26',
      loot: '+12^',
    },
    { zone: 'Ice Ridge', art: 'snow', land: 'steps', len: 30, foes: 'S4 T12^ J15 G16 S22 H26', loot: '+14^' },
    {
      zone: 'Whiteout',
      art: 'snow',
      len: 28,
      cp: true,
      arena: { name: 'DRAUGR WAKE', waves: ['3SR 2SL', '2HR GR 2J^', '2SL 2SR GL', 'HL HR 3J^'] },
    },
    {
      zone: 'Frozen River',
      art: 'snow',
      land: 'bridge',
      len: 34,
      foes: 'D8 S10 J12 H18 D22 J28 S30',
      loot: 's16',
    },
    {
      zone: 'Pine Pass',
      art: 'snow',
      land: 'pits',
      len: 36,
      holes: [8, 19, 28],
      cp: true,
      foes: 'S5 G14 H16 D20 T24^ J30 S32',
      loot: '+24^',
    },
    {
      zone: 'Storm Peak',
      art: 'snow',
      len: 34,
      cp: true,
      loot: '+4',
      arena: { name: 'THOR, THUNDER GOD', bosses: ['gunship'], waves: ['2J^', 'SL SR GR', '2J^ HL'] },
    },
    {
      zone: 'Rune Stones',
      art: 'snow',
      land: 'towers',
      len: 36,
      foes: 'S3 T6^ G12 T16^ D20 H22 S28 J30 G33',
      loot: 'l21^ +31',
    },
    {
      zone: 'Shield Wall',
      art: 'frosthall',
      len: 30,
      cp: true,
      arena: { name: 'SHIELD WALL', waves: ['2HR 2SL', '3J^ GR GL', '2HL 2HR', '3SR 3SL 2J^'] },
    },
    {
      zone: 'Glacier Catwalks',
      art: 'snow',
      land: 'catwalks',
      len: 36,
      foes: 'S6 J8 G15 H19 T24^ D28 S33',
      loot: '+18^',
    },
    {
      zone: 'Wolf Den',
      art: 'frosthall',
      len: 36,
      cp: true,
      loot: '+4',
      arena: { name: 'FENRIR', bosses: ['walker'], waves: ['2SR', 'GR J^', '2SL HR'] },
    },
    {
      zone: 'Hall of the Frost Giant',
      art: 'frosthall',
      len: 54,
      cp: true,
      loot: '+26^ s17^',
      arena: { name: 'FROST GIANT', bosses: ['boss'], final: true, waves: ['2SL', '2J^'] },
    },
  ],
};

const BLACKOUT: CourseDef = {
  id: 'mission-4',
  name: 'Storm over Olympus',
  faction: 'olympus',
  mods: { enemyHp: 1.35, enemyFire: 1.2, enemyDamage: 1.2, bossHp: 1.2, bossTempo: 1.15 },
  sections: [
    {
      zone: 'Mountain Path',
      art: 'olympus',
      land: 'flat',
      len: 24,
      foes: 'S10 S14 D18 G20 J22',
      loot: 's9^',
    },
    {
      zone: 'Broken Colonnade',
      art: 'olympus',
      land: 'pits',
      len: 36,
      holes: [8, 20, 29],
      foes: 'S5 H15 G17 D22 T26^ J27 S34',
      loot: '+16',
    },
    {
      zone: 'Storm Gate',
      art: 'olympus',
      len: 30,
      cp: true,
      arena: {
        name: 'STORM GATE',
        waves: ['3SR 2SL J^', '2HR 2GR', '3J^ 2SL HR', '2HL 2HR 2GL', '4SR 2J^'],
      },
    },
    {
      zone: 'Labyrinth',
      art: 'olympus',
      land: 'catwalks',
      len: 38,
      foes: 'S6 J9 G14 H18 T24^ D26 S29 G34',
      loot: 'l18^ +33',
    },
    {
      zone: 'Arena of Heroes',
      art: 'olympus',
      len: 40,
      cp: true,
      loot: '+4',
      arena: { name: 'MINOTAUR AND HARPY', bosses: ['walker', 'gunship'], hp: 0.6 },
    },
    {
      zone: 'River Styx Bridge',
      art: 'olympus',
      land: 'bridge',
      len: 34,
      foes: 'D8 S10 J12 H18 G24 D26 J30',
      loot: 'm16',
    },
    {
      zone: 'Cloud Steps',
      art: 'olympus',
      land: 'towers',
      len: 38,
      cp: true,
      foes: 'S3 T6^ G12 T16^ J20 H22 S28 D30 G33',
      loot: '+21^',
    },
    {
      zone: 'Last Stand',
      art: 'olympus',
      len: 32,
      cp: true,
      arena: {
        name: 'LAST STAND',
        waves: ['3SR 3SL', '2HR 2HL 2J^', '3GR 3J^', '2HR 2SL 2GL 2J^', '4SR 4SL'],
      },
    },
    {
      zone: 'Marble Stair',
      art: 'temple',
      land: 'steps',
      len: 32,
      foes: 'S4 T12^ J16 G18 H22 D24 S27',
      loot: 'l14^ +16^',
    },
    {
      zone: 'Bull Pit',
      art: 'temple',
      len: 36,
      cp: true,
      loot: '+4',
      arena: { name: 'MINOTAUR KING', bosses: ['walker'], hp: 1.15, waves: ['2SR', '2J^ HR'] },
    },
    {
      zone: 'Temple of Zeus',
      art: 'temple',
      len: 56,
      cp: true,
      loot: '+26^ s17^ +40',
      arena: {
        name: 'ZEUS, STORM KING',
        bosses: ['boss'],
        hp: 0.9,
        final: true,
        waves: ['2SL', '2J^', 'HL GL'],
      },
    },
  ],
};

const ASTRA: CourseDef = {
  id: 'mission-5',
  name: 'Operation Astra',
  faction: 'demon',
  brahma: true,
  mods: { enemyHp: 1.25, enemyFire: 1.15, enemyDamage: 1.15, bossHp: 1.15, bossTempo: 1.12 },
  sections: [
    { zone: 'Ember Gate', art: 'inferno', land: 'flat', len: 26, foes: 'S12 S17 D19 G22', loot: 'a9^' },
    { zone: 'Wall of Fire', art: 'inferno', land: 'flat', len: 24, fire: [18], foes: 'S6 S22', loot: 'w11*' },
    {
      zone: 'Demon Horde',
      art: 'inferno',
      len: 30,
      cp: true,
      arena: { name: 'DEMON HORDE', waves: ['3SR 2SL', '2HR GR 2J^', '3SL 2SR J^', '2HR 2HL 2GR'] },
    },
    { zone: 'Lava Bridge', art: 'inferno', land: 'bridge', len: 30, foes: 'D8 S12 J14 H20 D24', loot: 'v15' },
    {
      zone: 'Burning Steps',
      art: 'inferno',
      land: 'steps',
      len: 32,
      cp: true,
      foes: 'S5 T12^ D18 G18 H22 S27',
      loot: '+16^ a24',
    },
    {
      zone: 'Beast Pit',
      art: 'inferno',
      len: 38,
      cp: true,
      loot: '+4',
      arena: { name: 'INFERNO BEAST', bosses: ['walker'], hp: 1.1, waves: ['2SR', 'GR J^'] },
    },
    {
      zone: 'Twin Flames',
      art: 'inferno',
      land: 'catwalks',
      len: 36,
      fire: [30],
      foes: 'S8 J10 G14 H20 T24^ D28',
      loot: 'l18^ w22*',
    },
    {
      zone: 'Dragon Roost',
      art: 'inferno',
      len: 32,
      cp: true,
      loot: '+4 v10^',
      arena: { name: 'FIRE DRAGON', bosses: ['gunship'], waves: ['2J^', 'SL SR', '2J^ GL'] },
    },
    {
      zone: 'Blood Moon',
      art: 'inferno',
      len: 32,
      cp: true,
      arena: {
        name: 'BLOOD MOON',
        waves: ['3SR 3SL', '2HR 2HL 2J^', '3GR 3J^', '2HR 2SL 2GL 2J^', '4SR 4SL'],
      },
    },
    {
      zone: 'Hall of Flames',
      art: 'hellgate',
      land: 'towers',
      len: 36,
      fire: [27],
      foes: 'S3 T6^ G12 T16^ D20 H22 J30 S33',
      loot: 'a12 w23* +31',
    },
    {
      zone: 'Throne of the Demon King',
      art: 'hellgate',
      len: 56,
      cp: true,
      loot: '+26^ s17^ +40',
      arena: { name: 'DEMON KING', bosses: ['boss'], final: true, waves: ['2SL', '2J^', 'HL GL'] },
    },
  ],
};

const EVENT_HORIZON: CourseDef = {
  id: 'mission-6',
  name: 'Alien Invasion',
  faction: 'void',
  mods: { enemyHp: 1.35, enemyFire: 1.2, enemyDamage: 1.2, bossHp: 1.2, bossTempo: 1.15 },
  sections: [
    { zone: 'Docking Bay', art: 'space', land: 'flat', len: 26, foes: 'S12 S16 D19 G22', loot: 'b9^' },
    {
      zone: 'Low-G Craters',
      art: 'space',
      land: 'pits',
      len: 40,
      holes: [8, 21, 33],
      holeW: 5,
      field: { kind: 'lowg', power: 0.45 },
      foes: 'S5 G16 D17 H18 J29 S38',
      loot: '+16',
    },
    {
      zone: 'Anti-Grav Shafts',
      art: 'space',
      land: 'flat',
      len: 34,
      lifts: [6, 20],
      foes: 'S4 J12 T13^ D16 S26 G30',
      loot: '+12^ b17',
    },
    {
      zone: 'Alien Swarm',
      art: 'space',
      len: 30,
      cp: true,
      arena: { name: 'ALIEN SWARM', waves: ['3SR 2SL J^', '2HR 2GR', '3J^ 2SL HR', '2HL 2HR 2GL'] },
    },
    {
      zone: 'Gravity Well',
      art: 'space',
      land: 'pits',
      len: 32,
      holes: [14],
      wells: [15],
      foes: 'S5 D16 G24 J28',
      loot: '+28',
    },
    {
      zone: 'Crawler Nest',
      art: 'space',
      len: 38,
      cp: true,
      field: { kind: 'lowg', power: 0.5 },
      loot: '+4 b10',
      arena: { name: 'XENO CRAWLER', bosses: ['walker'], hp: 1.1, waves: ['2SR', '2J^'] },
    },
    {
      zone: 'Magnetic Storm',
      art: 'space',
      land: 'catwalks',
      len: 36,
      field: { kind: 'magnet', power: 1.2 },
      foes: 'S6 J9 G14 H19 T24^ D28 S33',
      loot: 'l18^ +30',
    },
    {
      zone: 'Saucer Bay',
      art: 'space',
      len: 34,
      cp: true,
      loot: '+4 b8',
      arena: { name: 'UFO MOTHERSHIP', bosses: ['gunship'], waves: ['2J^', 'SL SR GR'] },
    },
    {
      zone: 'Event Horizon',
      art: 'space',
      len: 32,
      cp: true,
      arena: {
        name: 'EVENT HORIZON',
        waves: ['3SR 3SL', '2HR 2HL 2J^', '3GR 3J^', '2HR 2SL 2GL 2J^', '4SR 4SL'],
      },
    },
    {
      zone: 'Hive Ship',
      art: 'hive',
      land: 'towers',
      len: 36,
      lifts: [25],
      foes: 'S3 T6^ G12 T16^ J20 H22 D30 S33',
      loot: '+21^ b26',
    },
    {
      zone: 'Hive Queen',
      art: 'hive',
      len: 56,
      cp: true,
      field: { kind: 'lowg', power: 0.6 },
      loot: '+26^ b17^ +40',
      arena: {
        name: 'HIVE QUEEN',
        bosses: ['boss'],
        final: true,
        hp: 0.9,
        waves: ['2SL', '2J^', 'HL GL'],
      },
    },
  ],
};

// ---------------------------------------------------------------- registry

const BUILDERS: Record<MissionId, () => LevelDef> = {
  'mission-1': buildMission1,
  'mission-2': () => buildCourse(SANDSTORM),
  'mission-3': () => buildCourse(FROSTBITE),
  'mission-4': () => buildCourse(BLACKOUT),
  'mission-5': () => buildCourse(ASTRA),
  'mission-6': () => buildCourse(EVENT_HORIZON),
  ...SAGA_BUILDERS,
};

const built = new Map<MissionId, LevelDef>();

/** The mission's level, built on first use and cached (unknown ids fall back to mission 1). */
export function getMission(id: string): LevelDef {
  const key: MissionId = isMissionId(id) ? id : 'mission-1';
  let level = built.get(key);
  if (!level) {
    level = BUILDERS[key]();
    built.set(key, level);
  }
  return level;
}

/** Mission 1 (the default; always needed, e.g. for the menu backdrop). */
export const MISSION_1 = getMission('mission-1');
