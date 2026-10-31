/**
 * The hero roster. Original characters (no likeness of any existing game's characters). Each player picks one in
 * the lobby; colours identify friends on screen, so every hero has its own strong main colour.
 * Only `id` matters to the server (validation); the rest is presentation, shared so every client agrees.
 */

import type { UltKind } from './config';

export type Headgear = 'bandana' | 'visor' | 'beret' | 'hood' | 'hardhat' | 'helmet' | 'headset' | 'cap';

export interface HeroDef {
  id: number;
  name: string;
  /** One-line flavour shown in the hero picker. */
  tagline: string;
  /** Main colour: shirt, name tag, map dot, off-screen arrow. */
  color: string;
  /** Darker shade of the main colour (shading). */
  shade: string;
  skin: string;
  hair: string;
  pants: string;
  headgear: Headgear;
  /** Accent (visor, goggles, headphones…). */
  accent: string;
  beard?: boolean;
  /** Super move: which effect, and its name on screen. */
  ult: UltKind;
  ultName: string;
}

export const HEROES: readonly HeroDef[] = [
  {
    id: 0,
    name: 'Blaze',
    ult: 'overdrive',
    ultName: 'INFERNO RUSH',
    tagline: 'Leads from the front',
    color: '#e5383b',
    shade: '#a4161a',
    skin: '#e8b48a',
    hair: '#1b1b1f',
    pants: '#3d4a3a',
    headgear: 'bandana',
    accent: '#e5383b',
  },
  {
    id: 1,
    name: 'Nova',
    ult: 'nova',
    ultName: 'SUPERNOVA',
    tagline: 'Never misses a jump',
    color: '#3a86ff',
    shade: '#1d4ed8',
    skin: '#f1c9a5',
    hair: '#f4a261',
    pants: '#2b3445',
    headgear: 'visor',
    accent: '#ffb703',
  },
  {
    id: 2,
    name: 'Tusk',
    ult: 'airstrike',
    ultName: 'HEAVY RAIN',
    tagline: 'Big heart, bigger beard',
    color: '#38b000',
    shade: '#246b00',
    skin: '#c98b5f',
    hair: '#6b3e1f',
    pants: '#4a4033',
    headgear: 'beret',
    accent: '#38b000',
    beard: true,
  },
  {
    id: 3,
    name: 'Viper',
    ult: 'phantom',
    ultName: 'VIPER STRIKE',
    tagline: 'Silent, fast, deadly',
    color: '#9d4edd',
    shade: '#5a189a',
    skin: '#d9a07a',
    hair: '#240046',
    pants: '#2a2438',
    headgear: 'hood',
    accent: '#c77dff',
  },
  {
    id: 4,
    name: 'Sparky',
    ult: 'nova',
    ultName: 'TESLA STORM',
    tagline: 'Fixes it, then blows it up',
    color: '#fb8500',
    shade: '#c45f00',
    skin: '#a8714d',
    hair: '#2d1b10',
    pants: '#3b3b3b',
    headgear: 'hardhat',
    accent: '#8ecae6',
  },
  {
    id: 5,
    name: 'Ghost',
    ult: 'phantom',
    ultName: 'SHADOW CUT',
    tagline: 'You won’t see him coming',
    color: '#00b4d8',
    shade: '#0077b6',
    skin: '#e2b897',
    hair: '#444',
    pants: '#33415c',
    headgear: 'helmet',
    accent: '#90e0ef',
  },
  {
    id: 6,
    name: 'Kiki',
    ult: 'overdrive',
    ultName: 'SONIC FURY',
    tagline: 'Hears trouble first',
    color: '#ff4d9d',
    shade: '#c9184a',
    skin: '#f3d0b5',
    hair: '#3a1f14',
    pants: '#3d2b3a',
    headgear: 'headset',
    accent: '#ffd6e8',
  },
  {
    id: 7,
    name: 'Sarge',
    ult: 'airstrike',
    ultName: 'AIRSTRIKE',
    tagline: 'Nobody gets left behind',
    color: '#ffbe0b',
    shade: '#c99700',
    skin: '#8a5636',
    hair: '#d6d3d1',
    pants: '#4b4a3a',
    headgear: 'cap',
    accent: '#ffbe0b',
    beard: true,
  },
] as const;

export const HERO_COUNT = HEROES.length;

export function heroOf(id: number): HeroDef {
  return HEROES[((id % HERO_COUNT) + HERO_COUNT) % HERO_COUNT] as HeroDef;
}
