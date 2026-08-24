import type { CrateColor } from '$lib/game/crate-color';
import type { Direction, Tile } from '$lib/game/level';

/**
 * What the palette hands the canvas.
 *
 * A brush is a complete description of an edit *minus* the coordinate, which
 * only the click knows. Items are templates rather than `Item`s because `id`
 * and `position` are not the palette's to invent — `placeItem` mints the id
 * against the level so it stays unique, and the click supplies the position.
 */
export type ItemTemplate =
    | { kind: 'crate_grey' }
    | { kind: 'crate_colour'; color: CrateColor }
    | { kind: 'keycard'; doorId: string };

export type Brush =
    | { kind: 'tile'; tile: Tile }
    | { kind: 'item'; item: ItemTemplate }
    | { kind: 'robot'; facing: Direction }
    /** Back to plain floor, and remove whatever item was standing on it. */
    | { kind: 'erase' };


// ============================================================
// Palette
//
// The palette is a flat list of ids plus one shared bag of options, rather
// than a list of ready-made brushes: picking "conveyor" and then changing its
// direction should not lose the direction you set on the last conveyor. The
// component renders the ids; `buildBrush` turns the current selection into
// the brush the canvas applies.
// ============================================================

export type BrushId =
    | 'floor' | 'wall' | 'pit' | 'robot_gap' | 'goal'
    | 'conveyor' | 'cargo_conveyor' | 'door' | 'pressure_plate' | 'switch' | 'drop_off'
    | 'crate_grey' | 'crate_colour' | 'keycard'
    | 'robot' | 'erase';

export type BrushOptions = {
    direction: Direction;
    facing: Direction;
    crateColor: CrateColor;
    /** `null` is a plain bay, which accepts a crate of any colour. */
    bayColor: CrateColor | null;
    doorId: string;
    targetId: string;
    initiallyOpen: boolean;
    initiallyOn: boolean;
};

export function defaultBrushOptions(): BrushOptions {
    return {
        direction: 'north',
        facing: 'south',
        crateColor: 'red',
        bayColor: 'red',
        doorId: 'door-1',
        targetId: 'door-1',
        initiallyOpen: false,
        initiallyOn: false,
    };
}

export const BRUSH_GROUPS: { title: string; ids: BrushId[] }[] = [
    {
        title: 'Floor',
        ids: ['floor', 'pit', 'conveyor', 'cargo_conveyor', 'goal', 'drop_off'],
    },
    {
        title: 'Structure',
        ids: ['wall', 'robot_gap', 'door', 'switch', 'pressure_plate'],
    },
    {
        title: 'Contents',
        ids: ['crate_grey', 'crate_colour', 'keycard', 'robot'],
    },
    {
        title: 'Tools',
        ids: ['erase'],
    },
];

export const BRUSH_LABELS: Record<BrushId, string> = {
    floor: 'Floor',
    wall: 'Wall',
    pit: 'Pit',
    robot_gap: 'Robot gap',
    goal: 'Goal',
    conveyor: 'Conveyor',
    cargo_conveyor: 'Cargo belt',
    door: 'Door',
    pressure_plate: 'Pressure plate',
    switch: 'Switch',
    drop_off: 'Drop-off bay',
    crate_grey: 'Grey crate',
    crate_colour: 'Colour crate',
    keycard: 'Keycard',
    robot: 'Robot start',
    erase: 'Erase',
};

/** Which option controls the palette shows, in the order it shows them. */
export function brushOptionKeys(id: BrushId): (keyof BrushOptions)[] {
    switch (id) {
        case 'conveyor':
        case 'cargo_conveyor':
            return ['direction'];
        case 'door':
            return ['doorId', 'initiallyOpen'];
        case 'pressure_plate':
            return ['targetId'];
        case 'switch':
            return ['targetId', 'initiallyOn'];
        case 'drop_off':
            return ['bayColor'];
        case 'crate_colour':
            return ['crateColor'];
        case 'keycard':
            return ['doorId'];
        case 'robot':
            return ['facing'];
        default:
            return [];
    }
}

export function buildBrush(id: BrushId, options: BrushOptions): Brush {
    switch (id) {
        case 'floor':
        case 'wall':
        case 'pit':
        case 'robot_gap':
        case 'goal':
            return { kind: 'tile', tile: { kind: id } };

        case 'conveyor':
        case 'cargo_conveyor':
            return { kind: 'tile', tile: { kind: id, direction: options.direction } };

        case 'door':
            return {
                kind: 'tile',
                tile: {
                    kind: 'door',
                    doorId: options.doorId,
                    initiallyOpen: options.initiallyOpen,
                },
            };

        case 'pressure_plate':
            return { kind: 'tile', tile: { kind: 'pressure_plate', targetId: options.targetId } };

        case 'switch':
            return {
                kind: 'tile',
                tile: {
                    kind: 'switch',
                    targetId: options.targetId,
                    initiallyOn: options.initiallyOn,
                },
            };

        case 'drop_off':
            return { kind: 'tile', tile: { kind: 'drop_off', color: options.bayColor } };

        case 'crate_grey':
            return { kind: 'item', item: { kind: 'crate_grey' } };

        case 'crate_colour':
            return { kind: 'item', item: { kind: 'crate_colour', color: options.crateColor } };

        case 'keycard':
            return { kind: 'item', item: { kind: 'keycard', doorId: options.doorId } };

        case 'robot':
            return { kind: 'robot', facing: options.facing };

        case 'erase':
            return { kind: 'erase' };
    }
}
