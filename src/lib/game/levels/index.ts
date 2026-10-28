import type { LevelDocument } from '$lib/game/level';
import { singleVariant } from '$lib/game/variants';
import { tutorial01 } from './tutorial-01';

/**
 * Built-in levels. This is the seam a `levels` database table plugs into:
 * `getLevel` becomes async and hits the DB, and nothing else changes.
 */
/**
 * Stored the way the database stores a level, as documents. The modules
 * themselves export plain `Level`s, because the engine tests play them as
 * one world.
 */
export const LEVELS = {
    'tutorial-01': singleVariant(tutorial01),
} satisfies Record<string, LevelDocument>;

export type LevelId = keyof typeof LEVELS;

export function getLevel(id: string): LevelDocument | undefined {
    return LEVELS[id as LevelId];
}

export { tutorial01 };
