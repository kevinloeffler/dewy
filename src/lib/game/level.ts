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

/**
 * Makes a belt drivable by a switch or a pressure plate.
 *
 * Every belt tile sharing a `beltId` is one belt, the same way every tile
 * sharing a `doorId` is one door. A belt with no control always runs, in its
 * authored direction — which is every belt authored before this existed.
 */
export type BeltControl = {
    /** Groups belt tiles into one driven belt; also what a control names. */
    beltId: string;
    /**
     * What the author calls the belt, shown wherever something links to it.
     * Every tile sharing the `beltId` carries the same name. Absent on an
     * unnamed belt, which is shown by its id instead.
     */
    name?: string;
    /** What an asserted control does: cut the power, or flip the direction. */
    effect: 'power' | 'reverse';
    /**
     * Authored starting value — running, or travelling the authored way. The
     * live flags live in `BeltState`.
     */
    initiallyOn: boolean;
};

export type ConveyorTile = {
    kind: 'conveyor';
    direction: Direction;
    /** `null` for a belt nothing drives. */
    control: BeltControl | null;
};

export type CargoConveyorTile = {
    kind: 'cargo_conveyor';
    direction: Direction;
    control: BeltControl | null;
};

export type DoorTile = {
    kind: 'door';
    /** Fixed behind the scenes — what keycards and triggers point at. */
    doorId: string;
    /**
     * What the author calls the door, shown wherever something links to it.
     * Every tile of one door carries the same name. Absent on an unnamed door,
     * which is shown by its id instead.
     */
    name?: string;
    /** Authored starting value. The live flag lives in `DoorState.open`. */
    initiallyOpen: boolean;
    /**
     * Which way the door is hung — purely visual; a closed door blocks its
     * tile whichever way it faces. A door is symmetrical, so north and south
     * (and east and west) look alike. Levels written before doors turned have
     * none and read as `'south'`.
     */
    facing: Direction;
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

/**
 * The name the author gave each link target — door, driven belt or motion
 * sensor — keyed by its id. Unnamed targets are absent.
 */
export function linkNames(level: Level): Map<string, string> {
    const names = new Map<string, string>();
    for (const tile of Object.values(level.tiles)) {
        if (tile?.kind === 'door' && tile.name) names.set(tile.doorId, tile.name);
        if ((tile?.kind === 'conveyor' || tile?.kind === 'cargo_conveyor') && tile.control?.name) {
            names.set(tile.control.beltId, tile.control.name);
        }
    }
    for (const sensor of level.motionSensors) {
        if (sensor.name) names.set(sensor.sensorId, sensor.name);
    }
    return names;
}

/** How a link target reads to the author: by its name, or by its id if it has none. */
export function linkLabel(level: Level, id: string): string {
    return linkNames(level).get(id) ?? id;
}

export function isKeycard(item: Item): item is Keycard {
    return item.kind === 'keycard';
}


// ============================================================
// Decorations
//
// Warehouse dressing: a pallet, a shelf, a stack of barrels. They are not
// tiles — a pallet is three tiles wide and two deep, and no per-tile record
// can say that — and they are not items, because nothing ever picks one up.
// They are furniture: authored once, never animated, and solid, so the level
// around them has to be read rather than walked straight through.
// ============================================================

export type DecorationKind =
    | 'pallet'
    | 'shelf'
    | 'pillar'
    | 'guard_rail'
    | 'barrel'
    | 'cone'
    | 'tool_cart';

/**
 * One piece of furniture standing on the grid.
 *
 * `position` is the piece's north-west tile — the corner with the smallest
 * `x` and `y` of the rectangle it covers, *after* `facing` has been applied.
 * The rest of the rectangle follows from the kind's footprint, so a rotated
 * shelf needs no second coordinate: see `footprintOf` in `./decorations`.
 *
 * `id` is stable for the same reason an item's is — the renderer keys its
 * Three.js objects by it — so author it, never generate it at render time.
 */
export type Decoration = {
    kind: DecorationKind;
    id: string;
    position: Coord;
    /**
     * Which way the piece's front points. A square, symmetrical piece looks
     * the same whatever this says; a shelf or a pallet does not.
     */
    facing: Direction;
};


// ============================================================
// Motion sensors
// ============================================================

export type MotionSensor = {
    sensorId: string;
    /** What the author calls the sensor; absent shows it by its id. */
    name?: string;
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
    /** Solid furniture. Covers whole rectangles of tiles — see `./decorations`. */
    decorations: Decoration[];
    motionSensors: MotionSensor[];
    robot: RobotConfig;
    options: LevelOptions;
    goals: GoalCondition[];
};
