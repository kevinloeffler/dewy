import type { Coord, DecorationKind, Direction, DropOffTile, Level, LevelDocument } from './level';
import type { CrateState, KeycardState, LevelState } from './level-state';
import { coordKey, opposite, sameCoord, tileAt } from './grid';
import { isCrate, isMultiBay, linkNames } from './level';
import {
    DECORATION_NAMES,
    decorationAt,
    decorationTiles,
    footprintOf,
} from './decorations';
import { CRATE_COLOR_NAMES, type CrateColor } from './crate-color';
import { sensorCovers } from './sensors';
import { bayGoals, effectiveGoals } from './goals';
import { hasGoalTile, variantLevels } from './variants';

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
 * a crate. Swallowed crates are skipped too — they keep their multi bay's
 * tile only so `swallowedAt` can count them. This is the only sanctioned way
 * to look a crate up by position.
 */
export function crateAt(state: LevelState, coord: Coord): CrateState | null {
    return state.crates.find((crate) => inWorld(crate) && sameCoord(crate.position, coord)) ?? null;
}

/** Standing somewhere in the world: neither in the robot's hands nor in a multi bay. */
export function inWorld(crate: CrateState): boolean {
    return !crate.carried && !crate.swallowed;
}

/** How many crates the multi bay at `coord` has swallowed so far. */
export function swallowedAt(state: LevelState, coord: Coord): number {
    return state.crates.filter((crate) => crate.swallowed && sameCoord(crate.position, coord)).length;
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
    | { kind: 'robot_gap' }
    | { kind: 'robot_gap_carrying' }
    | { kind: 'crate_gap' }
    | { kind: 'switch' }
    | { kind: 'multi_bay' }
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
        case 'crate_gap':      return { kind: 'crate_gap' };
        // A multi bay is a funnel standing on its tile: crates go in, Dewy
        // faces it the way it faces a switch.
        case 'drop_off':       return isMultiBay(tile) ? { kind: 'multi_bay' } : null;
        case 'door':           return doorOpen(state, tile.doorId) ? null : { kind: 'door' };
        // The opening is Dewy's own outline, with no room left for the crate
        // in its jaws — otherwise a crate would pass simply by being carried.
        case 'robot_gap':      return state.robot.carrying ? { kind: 'robot_gap_carrying' } : null;
        // floor, goal, pressure_plate, conveyor
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
        case 'robot_gap': return { kind: 'robot_gap' };
        case 'door':      return doorOpen(state, tile.doorId) ? null : { kind: 'door' };
        // floor, goal, drop_off, pressure_plate, conveyor, cargo_conveyor, crate_gap
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
        if (sensorCovers(sensor, coord)) return sensor.sensorId;
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
    return worldProblems(level, true);
}

/**
 * `validateLevel` for every variant of a stored level. With more than one,
 * each problem names the variant it was found in.
 *
 * "`reach_goal` but no goal tile" is the one check made for the level as a
 * whole: the goal is stored once and applies wherever a goal tile stands, so
 * a variant without one is a variant without that goal, not a mistake.
 */
export function validateDocument(document: LevelDocument): string[] {
    const many = document.variants.length > 1;
    const problems = variantLevels(document).flatMap((level, index) =>
        worldProblems(level, false).map((problem) => (many ? `Variante ${index + 1}: ${problem}` : problem)),
    );

    const reach = document.goals.some((goal) => goal.kind === 'reach_goal');
    if (reach && !document.variants.some(hasGoalTile)) {
        problems.push('Ziel „reach_goal“, aber das Level hat kein Zielfeld');
    }
    return problems;
}

function worldProblems(level: Level, checkReachGoal: boolean): string[] {
    const problems: string[] = [];

    const goalTile = hasGoalTile(level);
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

    // A name is how the author tells link targets apart in every dropdown —
    // doors, belts and sensors share the switch's — so two targets sharing
    // one would make those links ambiguous.
    const namesSeen = new Set<string>();
    const namesReported = new Set<string>();
    for (const name of linkNames(level).values()) {
        if (namesSeen.has(name) && !namesReported.has(name)) {
            problems.push(`Mehrere Türen, Bänder oder Melder heissen „${name}“`);
            namesReported.add(name);
        }
        namesSeen.add(name);
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
            problems.push(
                item.doorId === ''
                    ? `Keycard „${item.id}“ ist mit keiner Tür verknüpft`
                    : `Keycard „${item.id}“ öffnet Tür „${item.doorId}“, zu der es kein Türfeld gibt`,
            );
        }
    }

    if (!tileAt(level, level.robot.position)) {
        problems.push('Der Roboter startet ausserhalb des Rasters');
    }
    const start = tileAt(level, level.robot.position);
    if (start?.kind === 'drop_off' && isMultiBay(start)) {
        problems.push('Der Roboter startet in einem Trichter');
    }

    // A sensor hangs from the ceiling, so what lies beneath it is its own
    // business — a wall, a belt, a crate. Only the grid and the robot's start
    // matter: a robot starting under an active sensor loses on its first move.
    const sensorIds = new Set<string>();
    const sensorCoords = new Set<string>();
    for (const sensor of level.motionSensors) {
        const key = coordKey(sensor.position);
        const label = linkNames(level).get(sensor.sensorId) ?? sensor.sensorId;

        if (sensorIds.has(sensor.sensorId)) {
            problems.push(`doppelte Bewegungsmelder-ID „${sensor.sensorId}“`);
        }
        sensorIds.add(sensor.sensorId);
        if (sensorCoords.has(key)) problems.push(`zwei Bewegungsmelder hängen über Feld ${key}`);
        sensorCoords.add(key);

        if (!tileAt(level, sensor.position)) {
            problems.push(`Bewegungsmelder „${label}“ hängt bei ${key} ausserhalb des Rasters`);
            continue;
        }
        if (sensor.initiallyActive && sensorCovers(sensor, level.robot.position)) {
            problems.push(`Der Roboter startet im Feld des aktiven Bewegungsmelders „${label}“ — der erste Befehl löst ihn aus`);
        }
    }

    // The engine never counts an empty goal list as won, so such a level can
    // be played but never finished.
    if (effectiveGoals(level).length === 0) {
        problems.push('Das Level hat keine Ziele und lässt sich nicht abschliessen');
    }

    // Not a loop with the flag inside: Rolldown drops the `if` when every
    // caller passes `false` and leaves a `for` with no body — a syntax error
    // in the server build that only shows up once deployed.
    const reachGoal = level.goals.some((goal) => goal.kind === 'reach_goal');
    if (checkReachGoal && reachGoal && !goalTile) {
        problems.push('Ziel „reach_goal“, aber das Level hat kein Zielfeld');
    }

    // Enough crates for the bays. A colour bay needs its own colour; a plain
    // bay takes any coloured crate, but only one not already spoken for. A
    // multi bay needs its whole capacity — `crates` already adds that up.
    const crates = new Map<CrateColor, number>();
    for (const item of level.items) {
        if (isCrate(item) && item.kind === 'crate_colour') {
            crates.set(item.color, (crates.get(item.color) ?? 0) + 1);
        }
    }
    let spare = 0;
    for (const count of crates.values()) spare += count;
    const bays = bayGoals(level);
    for (const bay of bays) {
        if (bay.color === null) continue;
        const have = crates.get(bay.color) ?? 0;
        if (have < bay.crates) {
            problems.push(`${bay.count} Abgabestelle(n) in ${CRATE_COLOR_NAMES[bay.color]} sollen beliefert werden und brauchen ${bay.crates} Kiste(n), aber im Level gibt es nur ${have} Kiste(n) in ${CRATE_COLOR_NAMES[bay.color]}`);
        }
        spare -= Math.min(have, bay.crates);
    }
    const plain = bays.find((bay) => bay.color === null);
    if (plain && plain.crates > spare) {
        problems.push(`${plain.count} neutrale Abgabestelle(n) sollen beliefert werden und brauchen ${plain.crates} Kiste(n), aber nur ${spare} farbige Kiste(n) sind dafür übrig`);
    }

    return problems;
}
