import type { GoalCondition, Level } from './level';
import { DELIVERY_COLORS, type CrateColor } from './crate-color';

/**
 * What a level actually asks for, as opposed to what it stores.
 *
 * Delivery goals are implicit: every colour of bay placed in the level
 * must be filled, all of them. A stored `deliver_bays` goal only *lowers*
 * that number for one colour — to 0 to drop the goal entirely. Storing the
 * exception rather than the rule is what lets a fourth red bay raise the
 * requirement to four without the designer touching the goal again.
 *
 * Pure and framework-free: the engine, the player's goal list, validation
 * and the designer all read goals through here, so they cannot disagree.
 */

/** One colour of bay in the level. `color` is null for plain bays. */
export type BayGoal = {
    color: CrateColor | null;
    /** How many bays of this colour the level has. */
    total: number;
    /** How many of them must hold a crate — `total` unless overridden. */
    count: number;
};

/** Bay colours in palette order, plain bays last — the designer's row order. */
const BAY_ORDER: (CrateColor | null)[] = [...DELIVERY_COLORS, null];

/** One entry per colour of bay the level has, including those set to 0. */
export function bayGoals(level: Level): BayGoal[] {
    const totals = new Map<CrateColor | null, number>();
    for (const tile of Object.values(level.tiles)) {
        if (tile?.kind !== 'drop_off') continue;
        totals.set(tile.color, (totals.get(tile.color) ?? 0) + 1);
    }

    return BAY_ORDER.flatMap((color) => {
        const total = totals.get(color);
        if (!total) return [];
        const override = level.goals.find(
            (goal) => goal.kind === 'deliver_bays' && goal.color === color,
        );
        // Bays deleted under an override leave it pointing past the end.
        const count = override?.kind === 'deliver_bays' ? Math.min(override.count, total) : total;
        return [{ color, total, count }];
    });
}

/**
 * The goals a run is judged against: the stored level-wide goals in their
 * authored order, then one resolved `deliver_bays` per colour still required.
 */
export function effectiveGoals(level: Level): GoalCondition[] {
    const stored = level.goals.filter((goal) => goal.kind !== 'deliver_bays');
    const bays: GoalCondition[] = bayGoals(level)
        .filter((bay) => bay.count > 0)
        .map((bay) => ({ kind: 'deliver_bays', color: bay.color, count: bay.count }));
    return [...stored, ...bays];
}
