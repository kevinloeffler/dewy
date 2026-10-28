import { BAY_ORDER, bayGoals, type BayGoal } from './goals';
import type { CrateColor } from './crate-color';
import {
    LAYOUT_KEYS,
    type Level,
    type LevelDocument,
    type LevelLayout,
    type LevelSettings,
} from './level';

/**
 * Turning a stored `LevelDocument` into the `Level`s that are played and
 * edited, and back.
 *
 * Pure and framework-free. A variant only ever becomes playable through
 * `variantLevel`, so the engine, the renderer and the editor operations keep
 * working on one world and never learn that a level can have more.
 */

/** One variant, flattened into a playable world. */
export function variantLevel(document: LevelDocument, index: number): Level {
    const { variants, ...settings } = document;
    const variant = variants[index];
    if (!variant) throw new RangeError(`level has no variant ${index}`);
    const { id: _id, ...layout } = variant;
    return { ...settings, ...layout };
}

/** Every variant, flattened, in order. */
export function variantLevels(document: LevelDocument): Level[] {
    return document.variants.map((_, index) => variantLevel(document, index));
}

export function layoutOf(level: LevelLayout): LevelLayout {
    return {
        tiles: level.tiles,
        items: level.items,
        decorations: level.decorations,
        motionSensors: level.motionSensors,
        robot: level.robot,
    };
}

export function settingsOf(source: Level | LevelDocument): LevelSettings {
    return {
        id: source.id,
        name: source.name,
        description: source.description,
        instructions: source.instructions,
        width: source.width,
        height: source.height,
        options: source.options,
        goals: source.goals,
    };
}

/** Same layout by reference, field for field — which immutability makes exact. */
export function sameLayout(a: LevelLayout, b: LevelLayout): boolean {
    return LAYOUT_KEYS.every((key) => a[key] === b[key]);
}

/** A world as a one-variant document — a new level, or a built-in one. */
export function singleVariant(level: Level, variantId = 'v1'): LevelDocument {
    return { ...settingsOf(level), variants: [{ id: variantId, ...layoutOf(level) }] };
}

export function hasGoalTile(layout: LevelLayout): boolean {
    return Object.values(layout.tiles).some((tile) => tile?.kind === 'goal');
}

/**
 * The bay goals across every variant, for the designer's goal list: one row
 * per colour any variant has. `total` is the most bays of that colour any one
 * variant has — the highest count an override can still lower — and `count`
 * is clamped to it, the way `bayGoals` clamps per world.
 */
export function documentBayGoals(document: LevelDocument): BayGoal[] {
    const byColor = new Map<CrateColor | null, BayGoal>();
    for (const level of variantLevels(document)) {
        for (const bay of bayGoals(level)) {
            const seen = byColor.get(bay.color);
            if (seen && seen.total >= bay.total) continue;
            byColor.set(bay.color, bay);
        }
    }

    return BAY_ORDER.flatMap((color) => {
        const bay = byColor.get(color);
        return bay ? [bay] : [];
    });
}
