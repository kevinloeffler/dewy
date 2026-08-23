import { isCrate, isKeycard } from './level';
import type { Coord, Direction, Crate, Keycard, GoalCondition, Level, Tile, TileKey } from './level';
import { parseTileKey } from './grid';


// ============================================================
// Crate state
// ============================================================

/**
 * `position` is inherited from `Crate` and is the single source of truth,
 * including while the crate is carried — it tracks the robot's tile so that
 * rebuilding the scene from state is always correct.
 */
export type CrateState = Crate & {
    delivered: boolean;
    carried: boolean;
}

// ============================================================
// Keycard state
// ============================================================

export type KeycardState = Keycard & {
    collected: boolean;
}

// ============================================================
// Door state
// ============================================================

export type DoorState = {
    doorId: string;
    open: boolean;
}

// ============================================================
// Switch state
// ============================================================

/** Keyed by tile position — several switches may share a `targetId`. */
export type SwitchState = {
    position: Coord;
    targetId: string;
    on: boolean;
}

// ============================================================
// Motion sensor state
// ============================================================

export type MotionSensorState = {
    sensorId: string;
    active: boolean;
}

// ============================================================
// Robot state
// ============================================================

export type RobotState = {
    position: Coord;
    facing: Direction;
    /** Id of the carried crate, or null. Look it up in `LevelState.crates`. */
    carrying: string | null;
    inventory: string[]; // doorIds of keycards currently held
}

// ============================================================
// Goal state
// ============================================================

export type GoalConditionState = {
    condition: GoalCondition;
    satisfied: boolean;
}

// ============================================================
// LevelState
// ============================================================

/**
 * Mutable runtime state of a running level.
 * Derived from `Level` at the start of each run and discarded on reset.
 * Never persisted — always reconstructed from the immutable `Level`.
 *
 * Pressure plates deliberately have no entry here: "pressed" is derived
 * from whether a crate or the robot currently stands on the tile.
 */
export type LevelState = {
    robot: RobotState;
    crates: CrateState[];
    keycards: KeycardState[];
    doors: DoorState[];
    switches: SwitchState[];
    motionSensors: MotionSensorState[];
    goals: GoalConditionState[];
    failed: boolean;
    failReason: string | null;
}


// ============================================================
// Construction
// ============================================================

/**
 * Builds the runtime state for a fresh run of `level`.
 *
 * Every `Coord` is deep-copied. `Level` is immutable and shared — it may be
 * a module-level literal or a cached database row — so aliasing its coords
 * would let the first `moveForward()` silently rewrite the level definition
 * and break reset.
 *
 * Resetting a level is just calling this again.
 */
export function createLevelState(level: Level): LevelState {
    const doors = new Map<string, DoorState>();
    const switches: SwitchState[] = [];

    for (const [key, tile] of Object.entries(level.tiles) as [TileKey, Tile][]) {
        if (tile.kind === 'door') {
            doors.set(tile.doorId, { doorId: tile.doorId, open: tile.initiallyOpen });
        } else if (tile.kind === 'switch') {
            switches.push({
                position: parseTileKey(key),
                targetId: tile.targetId,
                on: tile.initiallyOn,
            });
        }
    }

    // A keycard may name a door whose tiles are all authored elsewhere;
    // make sure every referenced door has a state entry.
    for (const item of level.items) {
        if (isKeycard(item) && !doors.has(item.doorId)) {
            doors.set(item.doorId, { doorId: item.doorId, open: false });
        }
    }

    return {
        robot: {
            position: { ...level.robot.position },
            facing: level.robot.facing,
            carrying: null,
            inventory: [],
        },
        crates: level.items.filter(isCrate).map((crate) => ({
            ...crate,
            position: { ...crate.position },
            delivered: false,
            carried: false,
        })),
        keycards: level.items.filter(isKeycard).map((keycard) => ({
            ...keycard,
            position: { ...keycard.position },
            collected: false,
        })),
        doors: [...doors.values()],
        switches,
        motionSensors: level.motionSensors.map((sensor) => ({
            sensorId: sensor.sensorId,
            active: sensor.initiallyActive,
        })),
        goals: level.goals.map((condition) => ({ condition, satisfied: false })),
        failed: false,
        failReason: null,
    };
}
