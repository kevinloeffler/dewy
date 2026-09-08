import type { Coord, DecorationKind, Direction, DropOffTile, Level } from './level';
import type { CrateState, KeycardState, LevelState } from './level-state';
import { coordKey, opposite, sameCoord, tileAt } from './grid';
import { isCrate } from './level';
import {
    DECORATION_NAMES,
    decorationAt,
    decorationTiles,
    footprintOf,
} from './decorations';
import { CRATE_COLOR_NAMES } from './crate-color';

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
    | { kind: 'obstacle'; decoration: DecorationKind }
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

    // Furniture is solid whatever it stands on, and asked about before the
    // tile: a pallet laid over open floor has to stop the robot the way the
    // wall next to it does.
    const decoration = decorationAt(level, coord);
    if (decoration) return { kind: 'obstacle', decoration: decoration.kind };

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

    const decoration = decorationAt(level, coord);
    if (decoration) return { kind: 'obstacle', decoration: decoration.kind };

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
// Belts
// ============================================================

/**
 * Which way the belt under `coord` carries `subject`, or `null` when the
 * tile is not a belt that moves it.
 *
 * A cargo belt is crate-only — the robot cannot stand on one at all, so
 * asking for the robot always answers `null`. That holds whether the belt is
 * running or not: crate-only is the shape of the machine, not its power.
 *
 * A *driven* belt answers from `BeltState` instead of its authored direction:
 * stopped is `null` — inert floor, carrying nothing — and reversed is the
 * other way round.
 */
export function beltDirection(
    level: Level,
    state: LevelState,
    coord: Coord,
    subject: 'robot' | 'crate',
): Direction | null {
    const tile = tileAt(level, coord);
    if (!tile) return null;
    if (tile.kind === 'cargo_conveyor') {
        if (subject !== 'crate') return null;
    } else if (tile.kind !== 'conveyor') {
        return null;
    }

    if (!tile.control) return tile.direction;

    const belt = state.belts.find((live) => live.beltId === tile.control!.beltId);
    if (!belt?.running) return null;
    return belt.reversed ? opposite(tile.direction) : tile.direction;
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
    const doorIds = new Set<string>();
    // What a switch or a plate may point at. Three namespaces share one
    // `targetId` field, so a typo is otherwise a control that silently does
    // nothing — exactly the mistake a visual editor makes easy to commit.
    const targetIds = new Set<string>(level.motionSensors.map((sensor) => sensor.sensorId));

    for (const tile of Object.values(level.tiles)) {
        if (tile?.kind === 'door') {
            doorIds.add(tile.doorId);
            targetIds.add(tile.doorId);
        } else if (tile?.kind === 'conveyor' || tile?.kind === 'cargo_conveyor') {
            if (tile.control) targetIds.add(tile.control.beltId);
        }
    }

    for (const [key, tile] of Object.entries(level.tiles)) {
        if (tile?.kind !== 'switch' && tile?.kind !== 'pressure_plate') continue;
        if (targetIds.has(tile.targetId)) continue;

        const what = tile.kind === 'switch' ? 'Der Schalter' : 'Die Druckplatte';
        problems.push(
            tile.targetId === ''
                ? `${what} bei ${key} ist mit nichts verknüpft`
                : `${what} bei ${key} ist mit „${tile.targetId}“ verknüpft — das ist weder Tür noch Förderband noch Bewegungsmelder`,
        );
    }

    // Furniture is checked before the items, so the set of occupied tiles is
    // already built when an item turns out to be standing inside a shelf.
    const covered = new Map<string, string>();
    const decorationIds = new Set<string>();

    for (const decoration of level.decorations) {
        const name = DECORATION_NAMES[decoration.kind];

        if (decorationIds.has(decoration.id)) {
            problems.push(`doppelte Deko-ID „${decoration.id}“`);
        }
        decorationIds.add(decoration.id);

        const { width, depth } = footprintOf(decoration.kind, decoration.facing);
        const corner = coordKey(decoration.position);
        if (
            decoration.position.x < 0
            || decoration.position.y < 0
            || decoration.position.x + width > level.width
            || decoration.position.y + depth > level.height
        ) {
            problems.push(`Bei ${corner} steht ${name} teilweise ausserhalb des Rasters`);
        }

        for (const coord of decorationTiles(decoration)) {
            const key = coordKey(coord);
            const other = covered.get(key);
            if (other !== undefined) {
                problems.push(`Auf Feld ${key} stehen zwei Deko-Objekte übereinander (${other})`);
            } else {
                covered.set(key, decoration.id);
            }
        }
    }

    if (covered.has(coordKey(level.robot.position))) {
        problems.push('Der Roboter startet in einem Deko-Objekt');
    }

    const seenIds = new Set<string>();
    const seenCoords = new Set<string>();

    for (const item of level.items) {
        if (seenIds.has(item.id)) problems.push(`doppelte Objekt-ID „${item.id}“`);
        seenIds.add(item.id);

        const key = coordKey(item.position);
        if (seenCoords.has(key)) problems.push(`zwei Objekte stehen auf Feld ${key}`);
        seenCoords.add(key);

        if (!tileAt(level, item.position)) {
            problems.push(`Objekt „${item.id}“ liegt bei ${key} ausserhalb des Rasters`);
        }
        if (covered.has(key)) {
            problems.push(`Objekt „${item.id}“ steht bei ${key} in einem Deko-Objekt`);
        }
        if (item.kind === 'keycard' && !doorIds.has(item.doorId)) {
            problems.push(`Keycard „${item.id}“ öffnet Tür „${item.doorId}“, zu der es kein Türfeld gibt`);
        }
    }

    if (!tileAt(level, level.robot.position)) {
        problems.push('Der Roboter startet ausserhalb des Rasters');
    }

    for (const goal of level.goals) {
        if (goal.kind === 'reach_goal' && !hasGoalTile) {
            problems.push('Ziel „reach_goal“, aber das Level hat kein Zielfeld');
        }
        if (goal.kind === 'deliver_specific') {
            const tile = tileAt(level, goal.dropOffPosition);
            if (tile?.kind !== 'drop_off') {
                problems.push(`Ziel „deliver_specific“ zeigt auf ${coordKey(goal.dropOffPosition)} — dort ist keine Abgabestelle`);
            } else if (tile.color !== null && tile.color !== goal.color) {
                problems.push(`Ziel „deliver_specific“ will ${CRATE_COLOR_NAMES[goal.color]}, aber die Abgabestelle bei ${coordKey(goal.dropOffPosition)} ist ${CRATE_COLOR_NAMES[tile.color]}`);
            }
            if (!level.items.some((item) => isCrate(item) && item.kind === 'crate_colour' && item.color === goal.color)) {
                problems.push(`Ziel „deliver_specific“ will eine Kiste in ${CRATE_COLOR_NAMES[goal.color]}, aber im Level gibt es keine`);
            }
        }
    }

    return problems;
}
