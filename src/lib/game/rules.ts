import type { Coord, DropOffTile, Level } from './level';
import type { CrateState, KeycardState, LevelState } from './level-state';
import { coordKey, sameCoord, tileAt } from './grid';
import { isCrate } from './level';

/**
 * Pure predicates over `Level` + `LevelState`.
 *
 * Nothing here mutates and nothing here emits events, which is what lets
 * `moveForward()` and `isBlocked()` be answered by the same code and so
 * never drift apart. No Three.js, no Svelte — this runs in plain Node.
 */


// ============================================================
// Occupancy
// ============================================================

/**
 * The crate standing on `coord`, or null.
 *
 * Carried crates are skipped: their `position` deliberately tracks the
 * robot's tile, and `robot.md` promises the robot never shares a tile with
 * a crate. This is the only sanctioned way to look a crate up by position.
 */
export function crateAt(state: LevelState, coord: Coord): CrateState | null {
    return state.crates.find((crate) => !crate.carried && sameCoord(crate.position, coord)) ?? null;
}

export function keycardAt(state: LevelState, coord: Coord): KeycardState | null {
    return state.keycards.find((card) => !card.collected && sameCoord(card.position, coord)) ?? null;
}

export function crateById(state: LevelState, id: string): CrateState | null {
    return state.crates.find((crate) => crate.id === id) ?? null;
}

export function doorOpen(state: LevelState, doorId: string): boolean {
    return state.doors.find((door) => door.doorId === doorId)?.open ?? false;
}


// ============================================================
// Passability
// ============================================================

export type Blocker =
    | { kind: 'edge' }
    | { kind: 'wall' }
    | { kind: 'door' }
    | { kind: 'pit' }
    | { kind: 'cargo_belt' }
    | { kind: 'gap' }
    | { kind: 'switch' }
    | { kind: 'crate'; crateId: string };

/**
 * Why the *tile* at `coord` stops the robot, ignoring any crate on it.
 *
 * The push path needs this: when the robot walks into a crate it still has
 * to be able to stand where that crate was, and asking the crate-aware
 * version would just report the crate it is about to push.
 */
export function tileBlocksRobot(level: Level, state: LevelState, coord: Coord): Blocker | null {
    const tile = tileAt(level, coord);
    if (!tile) return { kind: 'edge' };

    switch (tile.kind) {
        case 'wall':           return { kind: 'wall' };
        case 'pit':            return { kind: 'pit' };
        case 'switch':         return { kind: 'switch' };
        case 'cargo_conveyor': return { kind: 'cargo_belt' };
        case 'door':           return doorOpen(state, tile.doorId) ? null : { kind: 'door' };
        // floor, goal, drop_off, pressure_plate, conveyor, robot_gap
        default:               return null;
    }
}

/** Why the *tile* at `coord` cannot hold a crate, ignoring any crate on it. */
export function tileBlocksCrate(level: Level, state: LevelState, coord: Coord): Blocker | null {
    const tile = tileAt(level, coord);
    if (!tile) return { kind: 'edge' };

    switch (tile.kind) {
        case 'wall':      return { kind: 'wall' };
        case 'pit':       return { kind: 'pit' };
        case 'switch':    return { kind: 'switch' };
        case 'robot_gap': return { kind: 'gap' };
        case 'door':      return doorOpen(state, tile.doorId) ? null : { kind: 'door' };
        // floor, goal, drop_off, pressure_plate, conveyor, cargo_conveyor
        default:          return null;
    }
}

export function robotBlockedBy(level: Level, state: LevelState, coord: Coord): Blocker | null {
    const crate = crateAt(state, coord);
    if (crate) return { kind: 'crate', crateId: crate.id };
    return tileBlocksRobot(level, state, coord);
}

export function crateBlockedBy(level: Level, state: LevelState, coord: Coord): Blocker | null {
    const crate = crateAt(state, coord);
    if (crate) return { kind: 'crate', crateId: crate.id };
    return tileBlocksCrate(level, state, coord);
}


// ============================================================
// Delivery
// ============================================================

/**
 * Whether `bay` takes `crate` as a delivery.
 *
 * Grey crates never deliver anywhere: `game-mechanics.md` gives them "no
 * delivery goal" — they are the reusable weights that hold plates down, and
 * a plain bay swallowing one permanently would be a soft-lock.
 */
export function bayAccepts(bay: DropOffTile, crate: CrateState): boolean {
    if (crate.kind === 'crate_grey') return false;
    return bay.color === null || bay.color === crate.color;
}


// ============================================================
// Triggers
// ============================================================

/** A plate is held down by the robot, or by a crate that is not in its hands. */
export function platePressedAt(state: LevelState, coord: Coord): boolean {
    if (sameCoord(state.robot.position, coord)) return true;
    return crateAt(state, coord) !== null;
}

/** The id of an **active** sensor whose forbidden zone covers `coord`, or null. */
export function sensorForbidding(level: Level, state: LevelState, coord: Coord): string | null {
    for (const sensor of level.motionSensors) {
        const live = state.motionSensors.find((s) => s.sensorId === sensor.sensorId);
        if (!live?.active) continue;
        if (sensor.forbiddenTiles.some((tile) => sameCoord(tile, coord))) return sensor.sensorId;
    }
    return null;
}


// ============================================================
// Authoring checks
// ============================================================

/**
 * Problems that would make a level silently unwinnable or ambiguous.
 *
 * Returns human-readable strings, empty when the level is sound. Used by the
 * tests today and by the level editor once it exists — these are exactly the
 * mistakes a visual editor makes easy to commit.
 */
export function validateLevel(level: Level): string[] {
    const problems: string[] = [];

    const hasGoalTile = Object.values(level.tiles).some((tile) => tile?.kind === 'goal');
    const doorIds = new Set(
        Object.values(level.tiles)
            .filter((tile) => tile?.kind === 'door')
            .map((tile) => (tile as { doorId: string }).doorId),
    );
    const seenIds = new Set<string>();
    const seenCoords = new Set<string>();

    for (const item of level.items) {
        if (seenIds.has(item.id)) problems.push(`duplicate item id "${item.id}"`);
        seenIds.add(item.id);

        const key = coordKey(item.position);
        if (seenCoords.has(key)) problems.push(`two items share tile ${key}`);
        seenCoords.add(key);

        if (!tileAt(level, item.position)) {
            problems.push(`item "${item.id}" is outside the grid at ${key}`);
        }
        if (item.kind === 'keycard' && !doorIds.has(item.doorId)) {
            problems.push(`keycard "${item.id}" opens door "${item.doorId}", which has no door tile`);
        }
    }

    if (!tileAt(level, level.robot.position)) {
        problems.push('the robot starts outside the grid');
    }

    for (const goal of level.goals) {
        if (goal.kind === 'reach_goal' && !hasGoalTile) {
            problems.push('goal "reach_goal" but the level has no goal tile');
        }
        if (goal.kind === 'deliver_specific') {
            const tile = tileAt(level, goal.dropOffPosition);
            if (tile?.kind !== 'drop_off') {
                problems.push(`goal "deliver_specific" points at ${coordKey(goal.dropOffPosition)}, which is not a drop-off bay`);
            } else if (tile.color !== null && tile.color !== goal.color) {
                problems.push(`goal "deliver_specific" wants ${goal.color} but the bay at ${coordKey(goal.dropOffPosition)} is ${tile.color}`);
            }
            if (!level.items.some((item) => isCrate(item) && item.kind === 'crate_colour' && item.color === goal.color)) {
                problems.push(`goal "deliver_specific" wants a ${goal.color} crate, but the level has none`);
            }
        }
    }

    return problems;
}
