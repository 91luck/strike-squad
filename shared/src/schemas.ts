import { z } from 'zod';
import { DIFFICULTIES, GAME_CONFIG, MISSION_IDS, type Difficulty, type MissionId } from './config';
import { HERO_COUNT } from './heroes';
import { NAME_REGEX, PROTOCOL_VERSION, ROOM_CODE_REGEX, type ClientMessage } from './protocol';

const name = z
  .string()
  .trim()
  .min(1)
  .max(GAME_CONFIG.limits.maxNameLength)
  .regex(NAME_REGEX, 'name contains unsupported characters');

const roomCode = z
  .string()
  .max(16)
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(ROOM_CODE_REGEX, 'invalid room code'));

const difficulty = z.enum(DIFFICULTIES as unknown as [Difficulty, ...Difficulty[]]);
const mission = z.enum(MISSION_IDS as unknown as [MissionId, ...MissionId[]]);
const settingsPatch = z.strictObject({ difficulty: difficulty.optional(), mission: mission.optional() });
const axis = z.number().int().min(-1).max(1);

// ---------------------------------------------------------------- client -> server

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('hello'),
    v: z.literal(PROTOCOL_VERSION),
    name,
    /** Session token from a previous `welcome`, used to resume after a dropped connection. */
    resume: z.string().min(16).max(64).optional(),
  }),
  z.strictObject({
    t: z.literal('createRoom'),
    settings: settingsPatch.optional(),
    open: z.boolean().optional(),
  }),
  z.strictObject({ t: z.literal('joinRoom'), code: roomCode }),
  z.strictObject({ t: z.literal('leaveRoom') }),
  z.strictObject({ t: z.literal('setSettings'), settings: settingsPatch }),
  z.strictObject({
    t: z.literal('setHero'),
    hero: z
      .number()
      .int()
      .min(0)
      .max(HERO_COUNT - 1),
  }),
  z.strictObject({ t: z.literal('startMatch') }),
  z.strictObject({
    t: z.literal('input'),
    seq: z.number().int().min(0).max(2_000_000_000),
    mx: axis,
    my: axis,
    jump: z.boolean(),
    fire: z.boolean(),
    dash: z.boolean().optional(),
    melee: z.boolean().optional(),
    ult: z.boolean().optional(),
    astra: z.boolean().optional(),
    vt: z.number().int().min(0).max(2_000_000_000).optional(),
  }),
  z.strictObject({ t: z.literal('rematch') }),
  z.strictObject({ t: z.literal('toLobby') }),
  z.strictObject({ t: z.literal('quickMatch') }),
  z.strictObject({ t: z.literal('ping'), ts: z.number().min(0).max(1e15) }),
]);

// Compile-time guarantee that what the schema accepts is assignable to the documented ClientMessage type.
const _assertSchemaMatchesType = (m: z.infer<typeof ClientMessageSchema>): ClientMessage => m;
void _assertSchemaMatchesType;
