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
 *
 * Because of that, never search `crates` by position directly: use
 * `crateAt` from `./rules`, which skips carried crates. `robot.md` promises
 * the robot's tile is always just the robot.
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
    /** Derived each step from `unlocked` plus any linked plates and switches. */
    open: boolean;
    /** Latched by `open()` once a matching keycard has been spent. */
    unlocked: boolean;
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
// Pressure plate state
// ============================================================

/**
 * `pressed` is *derived* from occupancy every step, never authored. It is
 * stored anyway for two reasons: the engine needs something to diff against
 * to emit only the plates that actually changed, and the renderer needs it
 * to snap the pads when a run is reset.
 */
export type PlateState = {
    position: Coord;
    targetId: string;
    pressed: boolean;
}

// ============================================================
// Belt state
// ============================================================

/**
 * The live state of one driven belt, keyed by `beltId` — several tiles share
 * one entry, the way several door tiles share one `DoorState`.
 *
 * Both flags are *derived* every step from the belt's authored `BeltControl`
 * plus whatever switches and plates point at it; a belt with no control never
 * gets an entry at all, because nothing about it can change.
 */
export type BeltState = {
    beltId: string;
    /** A stopped belt is inert floor — it carries nothing. */
    running: boolean;
    /** Travelling against the authored `direction`. */
    reversed: boolean;
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

/** `satisfied` latches: once true it never goes back to false. */
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
 */
export type LevelState = {
    robot: RobotState;
    crates: CrateState[];
    keycards: KeycardState[];
    doors: DoorState[];
    switches: SwitchState[];
    plates: PlateState[];
    belts: BeltState[];
    motionSensors: MotionSensorState[];
    goals: GoalConditionState[];
    /** Commands run, i.e. energy spent. Cleared by reset for free. */
    steps: number;
    failed: boolean;
    failReason: string | null;
    completed: boolean;
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
 * Derived values (`DoorState.open`, `PlateState.pressed`, `BeltState`,
 * `MotionSensorState.active`) are seeded from the authored values here and
 * then brought to a fixpoint by `GameEngine.initialize()`. Build state
 * through the engine rather than calling this directly, or a crate authored
 * standing on a pressure plate will render with its door still shut.
 *
 * Resetting a level is just calling this again.
 */
export function createLevelState(level: Level): LevelState {
    const doors = new Map<string, DoorState>();
    const belts = new Map<string, BeltState>();
    const switches: SwitchState[] = [];
    const plates: PlateState[] = [];

    for (const [key, tile] of Object.entries(level.tiles) as [TileKey, Tile][]) {
        if (tile.kind === 'door') {
            doors.set(tile.doorId, { doorId: tile.doorId, open: tile.initiallyOpen, unlocked: false });
        } else if (tile.kind === 'switch') {
            switches.push({
                position: parseTileKey(key),
                targetId: tile.targetId,
                on: tile.initiallyOn,
            });
        } else if (tile.kind === 'pressure_plate') {
            plates.push({
                position: parseTileKey(key),
                targetId: tile.targetId,
                pressed: false,
            });
        } else if (tile.kind === 'conveyor' || tile.kind === 'cargo_conveyor') {
            // Only driven belts get an entry — a belt with no control can
            // never change, and `beltDirection` reads its tile directly.
            const control = tile.control;
            if (control) {
                belts.set(control.beltId, {
                    beltId: control.beltId,
                    running: control.effect === 'reverse' || control.initiallyOn,
                    reversed: control.effect === 'reverse' && !control.initiallyOn,
                });
            }
        }
    }

    // A keycard may name a door whose tiles are all authored elsewhere;
    // make sure every referenced door has a state entry.
    for (const item of level.items) {
        if (isKeycard(item) && !doors.has(item.doorId)) {
            doors.set(item.doorId, { doorId: item.doorId, open: false, unlocked: false });
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
        plates,
        belts: [...belts.values()],
        motionSensors: level.motionSensors.map((sensor) => ({
            sensorId: sensor.sensorId,
            active: sensor.initiallyActive,
        })),
        goals: level.goals.map((condition) => ({ condition, satisfied: false })),
        steps: 0,
        failed: false,
        failReason: null,
        completed: false,
    };
}
