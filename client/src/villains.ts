import { SAGA, SAGA_BUILDERS, type SagaId } from '@strikesquad/shared';

/**
 * The "up next" tease shown on the results screen: who waits in the next stage, and what they say. The boss names
 * come from the stage's own level definition (so they can never drift from the game); only the taunts are written
 * here. Every villain is original: asura, rakshasa and naga hosts, no god or epic character.
 */
export const TAUNTS: Record<SagaId, string> = {
  'astra-1': 'The forest is mine. Come closer and burn with it.',
  'astra-2': 'The sea swallows every bridge. Yours will be next.',
  'astra-3': 'Run, little squad. The storm is faster than you.',
  'astra-4': 'My coils have never lost their prey. Care to be the first?',
  'astra-5': 'There is no way out of the city of illusions. Keep walking.',
  'astra-6': 'Ash remembers every warrior. It will remember you too.',
  'astra-7': 'Fight me, and the arrows only multiply. Kneel, and you may live.',
  'astra-8': 'Seven rings stand between you and me. You will not pass the first.',
  'astra-9': 'Two champions, one orb. Only one of you walks away.',
  'astra-10': 'This is the last war. Bring everything you have.',
};

export interface Teaser {
  num: number;
  name: string;
  astraName: string;
  /** The bosses of the stage, in the order the squad meets them. */
  villains: string[];
  taunt: string;
}

/** What the squad meets in saga stage `id`, or null for an id that is not a saga stage. */
export function teaserFor(id: SagaId): Teaser | null {
  const stage = SAGA.find((s) => s.id === id);
  if (!stage) return null;
  const villains = SAGA_BUILDERS[id]()
    .arenas.filter((a) => a.boss !== null)
    .map((a) => a.name);
  return { num: stage.num, name: stage.name, astraName: stage.astraName, villains, taunt: TAUNTS[id] };
}
