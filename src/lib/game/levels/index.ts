import type { Level } from '$lib/game/level';
import { tutorial01 } from './tutorial-01';

/**
 * Built-in levels. This is the seam a `levels` database table plugs into:
 * `getLevel` becomes async and hits the DB, and nothing else changes.
 */
export const LEVELS = {
    'tutorial-01': tutorial01,
} satisfies Record<string, Level>;

export type LevelId = keyof typeof LEVELS;

export function getLevel(id: string): Level | undefined {
    return LEVELS[id as LevelId];
}

export { tutorial01 };
