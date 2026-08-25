import type { CrateColor } from './crate-color';

export type Coord = {
    x: number;
    y: number;
};

export type Direction = 'north' | 'east' | 'south' | 'west';

/**
 * Key into `Level.tiles`, always `"<x>,<y>"`.
 * Encode/decode with `tileKey` / `coordKey` / `parseTileKey` from `./grid`.
 */
export type TileKey = `${number},${number}`;


// ============================================================
// Tiles
// ============================================================

export type FloorTile    = { kind: 'floor' };
export type PitTile      = { kind: 'pit' };
export type WallTile     = { kind: 'wall' };
export type RobotGapTile = { kind: 'robot_gap' };

export type ConveyorTile = {
    kind: 'conveyor';
    direction: Direction;
};

export type CargoConveyorTile = {
    kind: 'cargo_conveyor';
    direction: Direction;
};

export type DoorTile = {
    kind: 'door';
    doorId: string;
    /** Authored starting value. The live flag lives in `DoorState.open`. */
    initiallyOpen: boolean;
};

export type PressurePlateTile = {
    kind: 'pressure_plate';
    targetId: string;
};

export type SwitchTile = {
    kind: 'switch';
    targetId: string;
    /** Authored starting value. The live flag lives in `SwitchState.on`. */
    initiallyOn: boolean;
};

export type GoalTile = { kind: 'goal' };

export type DropOffTile = {
    kind: 'drop_off';
    color: CrateColor | null;
};

export type Tile =
    | FloorTile
    | PitTile
    | WallTile
    | RobotGapTile
    | ConveyorTile
    | CargoConveyorTile
    | DoorTile
    | PressurePlateTile
    | SwitchTile
    | GoalTile
    | DropOffTile;


// ============================================================
// Items
//
// Every item carries a stable `id`. The renderer keys its Three.js
// objects by it, and world events reference items by it, so ids must
// survive a database round-trip — author them, never generate them.
// ============================================================

export type GreyCrate = {
    kind: 'crate_grey';
    id: string;
    position: Coord;
};

export type ColourCrate = {
    kind: 'crate_colour';
    id: string;
    color: CrateColor;
    position: Coord;
};

export type Crate = GreyCrate | ColourCrate;

export type Keycard = {
    kind: 'keycard';
    id: string;
    doorId: string;
    position: Coord;
};

export type Item = Crate | Keycard;

export function isCrate(item: Item): item is Crate {
    return item.kind === 'crate_grey' || item.kind === 'crate_colour';
}

export function isKeycard(item: Item): item is Keycard {
    return item.kind === 'keycard';
}


// ============================================================
// Motion sensors
// ============================================================

export type MotionSensor = {
    sensorId: string;
    forbiddenTiles: Coord[];
    /** Authored starting value. The live flag lives in `MotionSensorState.active`. */
    initiallyActive: boolean;
};


// ============================================================
// Robot
// ============================================================

export type RobotConfig = {
    position: Coord;
    facing: Direction;
};


// ============================================================
// Options
// LanguageStage can be used to gate certain features, eg: loops
// ============================================================

export type LanguageStage = 1 | 2 | 3 | 4 | 5;

export type LevelOptions = {
    /**
     * The robot's battery, in commands. One robot command costs one energy;
     * sensing is free. `null` means unlimited — and never `undefined`, see
     * the note on `Level`.
     */
    energy: number | null;
    /**
     * How much program the robot can hold, in statements. Checked before the
     * run, not during it. `null` means unlimited.
     */
    memory: number | null;
    showInventory: boolean;
    languageStage: LanguageStage;
};


// ============================================================
// Goals
// ============================================================

export type ReachGoalCondition = {
    kind: 'reach_goal';
};

export type DeliverAllCondition = {
    kind: 'deliver_all';
};

export type DeliverSpecificCondition = {
    kind: 'deliver_specific';
    color: CrateColor;
    dropOffPosition: Coord;
};

export type GoalCondition =
    | ReachGoalCondition
    | DeliverAllCondition
    | DeliverSpecificCondition;


// ============================================================
// Level
// ============================================================

/**
 * Immutable, serializable level definition — this is what the database stores.
 *
 * Optional fields are typed `| null` rather than `| undefined` on purpose:
 * `JSON.stringify` drops keys whose value is `undefined`, so a round-trip
 * through the database would otherwise change the object's shape.
 */
export type Level = {
    id: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    /**
     * Sparse — a key missing from within the grid means `{ kind: 'floor' }`.
     * Pits are always authored explicitly; a coordinate outside
     * `width`/`height` is off-world and crashes the robot.
     */
    tiles: Partial<Record<TileKey, Tile>>;
    items: Item[];
    motionSensors: MotionSensor[];
    robot: RobotConfig;
    options: LevelOptions;
    goals: GoalCondition[];
};
