import type { DropOffTile, GoalCondition, Level } from './level';
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
 * A bay is one bay whatever it holds: a multi bay counts as filled once it
 * has swallowed its `capacity`, so it is still one of `total`, and the goal
 * logic never has to know crates from bays.
 *
 * Pure and framework-free: the engine, the player's goal list, validation
 * and the designer all read goals through here, so they cannot disagree.
 */

/** One colour of bay in the level. `color` is null for plain bays. */
export type BayGoal = {
    color: CrateColor | null;
    /** How many bays of this colour the level has. */
    total: number;
    /** How many of them must be filled — `total` unless overridden. */
    count: number;
    /**
     * The fewest crates that fill `count` of them: the smallest capacities
     * first, so a level is only ever asked for crates it could not do without.
     */
    crates: number;
};

/** How many crates fill this bay: one, or a multi bay's capacity. */
export function bayCapacity(tile: DropOffTile): number {
    return tile.capacity ?? 1;
}

/** Bay colours in palette order, plain bays last — the designer's row order. */
export const BAY_ORDER: (CrateColor | null)[] = [...DELIVERY_COLORS, null];

/** One entry per colour of bay the level has, including those set to 0. */
export function bayGoals(level: Level): BayGoal[] {
    const capacities = new Map<CrateColor | null, number[]>();
    for (const tile of Object.values(level.tiles)) {
        if (tile?.kind !== 'drop_off') continue;
        const list = capacities.get(tile.color) ?? [];
        list.push(bayCapacity(tile));
        capacities.set(tile.color, list);
    }

    return BAY_ORDER.flatMap((color) => {
        const sizes = capacities.get(color)?.sort((a, b) => a - b);
        if (!sizes) return [];
        const total = sizes.length;
        const override = level.goals.find(
            (goal) => goal.kind === 'deliver_bays' && goal.color === color,
        );
        // Bays deleted under an override leave it pointing past the end.
        const count = override?.kind === 'deliver_bays' ? Math.min(override.count, total) : total;
        const crates = sizes.slice(0, count).reduce((sum, size) => sum + size, 0);
        return [{ color, total, count, crates }];
    });
}

/**
 * The goals a run is judged against: the stored level-wide goals in their
 * authored order, then one resolved `deliver_bays` per colour still required.
 * Resolved against this world's tiles, so each variant of a level gets its own.
 */
export function effectiveGoals(level: Level): GoalCondition[] {
    // `reach_goal` follows the goal tiles the way delivery goals follow the
    // bays: stored once for the whole level, it only asks something of a
    // variant that has a goal tile to reach.
    const reachable = Object.values(level.tiles).some((tile) => tile?.kind === 'goal');
    const stored = level.goals.filter(
        (goal) => goal.kind !== 'deliver_bays' && (goal.kind !== 'reach_goal' || reachable),
    );
    const bays: GoalCondition[] = bayGoals(level)
        .filter((bay) => bay.count > 0)
        .map((bay) => ({ kind: 'deliver_bays', color: bay.color, count: bay.count }));
    return [...stored, ...bays];
}
