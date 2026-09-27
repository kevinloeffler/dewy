import type { CrateColor } from '$lib/game/crate-color';
import { canTurn } from '$lib/game/decorations';
import { turn } from '$lib/game/grid';
import type {
    BeltControl,
    Decoration,
    DecorationKind,
    Direction,
    Item,
    Tile,
} from '$lib/game/level';

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
    /**
     * Furniture. Like an item this is a template: `placeDecoration` mints the
     * id and works out where the piece's corner has to go for the click to
     * land inside it.
     */
    | { kind: 'decoration'; decoration: DecorationKind; facing: Direction }
    | { kind: 'robot'; facing: Direction }
    /** Back to plain floor, and remove whatever item was standing on it. */
    | { kind: 'erase' }
    /**
     * Not a brush at all: the select tool paints nothing, it picks out the
     * thing under the click. It rides along as a `Brush` so the palette, the
     * shortcut keys and the canvas keep one notion of "the active tool" —
     * `applyBrush` treats it as the no-op it is.
     */
    | { kind: 'select' };


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
    | DecorationKind
    | 'robot' | 'select' | 'erase';

const DECORATION_IDS: DecorationKind[] = [
    'pallet', 'shelf', 'pillar', 'guard_rail', 'barrel', 'cone', 'tool_cart',
];

const DECORATIONS: ReadonlySet<string> = new Set<string>(DECORATION_IDS);

/** Narrows a brush id to the decoration it paints, if it paints one. */
export function isDecorationId(id: BrushId): id is DecorationKind {
    return DECORATIONS.has(id);
}

export type BrushOptions = {
    direction: Direction;
    facing: Direction;
    crateColor: CrateColor;
    /** `null` is a plain bay, which accepts a crate of any colour. */
    bayColor: CrateColor | null;
    doorId: string;
    /**
     * What a switch or a plate drives. Empty means *not linked yet* — the
     * state a control is in the moment it is painted into a level with no door
     * or driven belt to point at. `validateLevel` reports it, rather than the
     * palette inventing a link to something that may not exist.
     */
    targetId: string;
    initiallyOpen: boolean;
    initiallyOn: boolean;
    /**
     * Belt drive. `'none'` is a belt nothing controls — the default, and what
     * every belt authored before this existed is. It folds "uncontrolled" into
     * the effect picker rather than adding a checkbox in front of it.
     */
    beltEffect: 'none' | BeltControl['effect'];
    beltId: string;
    /** Belts get their own starting value: `initiallyOn` is the switch's. */
    beltInitiallyOn: boolean;
    /**
     * Which way a piece of furniture is turned. Kept apart from `facing`,
     * which is the robot's: turning a shelf must not spin the robot brush.
     */
    decorationFacing: Direction;
    /**
     * Which way a door is hung. Its own field for the same reason: turning a
     * door must not swing the belt brush or the robot round with it.
     */
    doorFacing: Direction;
};

export function defaultBrushOptions(): BrushOptions {
    return {
        direction: 'north',
        facing: 'south',
        crateColor: 'red',
        bayColor: 'red',
        doorId: 'door-1',
        targetId: '',
        initiallyOpen: false,
        initiallyOn: false,
        beltEffect: 'none',
        beltId: 'belt-1',
        beltInitiallyOn: true,
        decorationFacing: 'south',
        doorFacing: 'south',
    };
}

export const BRUSH_GROUPS: { title: string; ids: BrushId[] }[] = [
    {
        title: 'Boden',
        ids: ['floor', 'pit', 'conveyor', 'cargo_conveyor', 'goal', 'drop_off'],
    },
    {
        title: 'Aufbau',
        ids: ['wall', 'robot_gap', 'door', 'switch', 'pressure_plate'],
    },
    {
        title: 'Inhalt',
        ids: ['crate_grey', 'crate_colour', 'keycard', 'robot'],
    },
    {
        title: 'Deko',
        ids: [...DECORATION_IDS],
    },
];

/**
 * The tools that paint nothing. Kept out of `BRUSH_GROUPS` because the palette
 * pins them above the collapsible groups rather than listing them as one —
 * and so the number keys go on meaning the first nine *brushes*.
 */
export const TOOL_IDS: BrushId[] = ['select', 'erase'];

export const BRUSH_LABELS: Record<BrushId, string> = {
    floor: 'Boden',
    wall: 'Wand',
    pit: 'Loch',
    robot_gap: 'Roboterlücke',
    goal: 'Ziel',
    conveyor: 'Förderband',
    cargo_conveyor: 'Kistenband',
    door: 'Tür',
    pressure_plate: 'Druckplatte',
    switch: 'Schalter',
    drop_off: 'Abgabestelle',
    crate_grey: 'Graue Kiste',
    crate_colour: 'Farbige Kiste',
    keycard: 'Keycard',
    pallet: 'Palette (3×2)',
    shelf: 'Regal (2×1)',
    pillar: 'Säule',
    guard_rail: 'Geländer',
    barrel: 'Fass',
    cone: 'Pylon',
    tool_cart: 'Werkzeugwagen',
    robot: 'Roboter-Start',
    select: 'Auswählen',
    erase: 'Radieren',
};

/**
 * Which option controls the palette shows, in the order it shows them.
 *
 * Takes the current options as well as the id because a belt's id and starting
 * value are only worth asking about once it has a drive to control.
 */
export function brushOptionKeys(id: BrushId, options: BrushOptions): (keyof BrushOptions)[] {
    switch (id) {
        case 'conveyor':
        case 'cargo_conveyor':
            return options.beltEffect === 'none'
                ? ['direction', 'beltEffect']
                : ['direction', 'beltEffect', 'beltId', 'beltInitiallyOn'];
        case 'door':
            return ['doorFacing', 'doorId', 'initiallyOpen'];
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
            // A square, symmetrical piece has no visible facing to offer.
            return isDecorationId(id) && canTurn(id) ? ['decorationFacing'] : [];
    }
}

/**
 * The id this brush *authors*, if it authors one.
 *
 * A door tile and a driven belt name themselves; a keycard or a switch only
 * points at a name something else already carries. Only an authoring brush may
 * mint a fresh id — and only an authoring brush gets one minted for it once
 * the level has claimed the one it was holding, so the next thing painted is a
 * new door rather than another tile of the last one.
 */
export function mintedIdKey(id: BrushId, options: BrushOptions): 'doorId' | 'beltId' | null {
    switch (id) {
        case 'door':
            return 'doorId';
        case 'conveyor':
        case 'cargo_conveyor':
            return options.beltEffect === 'none' ? null : 'beltId';
        default:
            return null;
    }
}

/**
 * Which of the facing fields a quarter turn moves, if any.
 *
 * Four brushes point somewhere and they keep the fields apart on purpose — a
 * belt's `direction` is the way it travels, the robot's `facing` is where it
 * looks, a shelf's is how it stands and a door's is how it is hung — so
 * "rotate" has to be told which one
 * it is turning. A wall or a crate points nowhere and is left alone.
 */
export function rotatableKey(
    id: BrushId,
): 'direction' | 'facing' | 'decorationFacing' | 'doorFacing' | null {
    switch (id) {
        case 'conveyor':
        case 'cargo_conveyor':
            return 'direction';
        case 'robot':
            return 'facing';
        case 'door':
            return 'doorFacing';
        default:
            return isDecorationId(id) && canTurn(id) ? 'decorationFacing' : null;
    }
}

/** A quarter turn clockwise, or the very same options for a brush that has none. */
export function rotateBrush(id: BrushId, options: BrushOptions): BrushOptions {
    const key = rotatableKey(id);
    if (key === null) return options;
    return { ...options, [key]: turn(options[key], 'right') };
}

/**
 * `buildBrush` read backwards: the options a thing was authored with.
 *
 * What the tile does not carry is left at `base` — a wall has no direction to
 * report, and the palette should go on showing whatever was last set there.
 * The two together let the select tool edit a thing through the very same
 * option controls the brushes use: seed with `tileOptions`, change one field,
 * hand it back to `buildBrush`.
 */
export function tileOptions(tile: Tile, base: BrushOptions = defaultBrushOptions()): BrushOptions {
    switch (tile.kind) {
        case 'conveyor':
        case 'cargo_conveyor':
            return {
                ...base,
                direction: tile.direction,
                beltEffect: tile.control?.effect ?? 'none',
                beltId: tile.control?.beltId ?? base.beltId,
                beltInitiallyOn: tile.control?.initiallyOn ?? base.beltInitiallyOn,
            };
        case 'door':
            return {
                ...base,
                doorId: tile.doorId,
                initiallyOpen: tile.initiallyOpen,
                doorFacing: tile.facing,
            };
        case 'pressure_plate':
            return { ...base, targetId: tile.targetId };
        case 'switch':
            return { ...base, targetId: tile.targetId, initiallyOn: tile.initiallyOn };
        case 'drop_off':
            return { ...base, bayColor: tile.color };
        default:
            return base;
    }
}

export function itemOptions(item: Item, base: BrushOptions = defaultBrushOptions()): BrushOptions {
    switch (item.kind) {
        case 'crate_colour':
            return { ...base, crateColor: item.color };
        case 'keycard':
            return { ...base, doorId: item.doorId };
        default:
            return base;
    }
}

/** `buildBrush` read backwards, for the select tool — see `tileOptions`. */
export function decorationOptions(
    decoration: Decoration,
    base: BrushOptions = defaultBrushOptions(),
): BrushOptions {
    return { ...base, decorationFacing: decoration.facing };
}

export function buildBrush(id: BrushId, options: BrushOptions): Brush {
    if (isDecorationId(id)) {
        return { kind: 'decoration', decoration: id, facing: options.decorationFacing };
    }

    switch (id) {
        case 'floor':
        case 'wall':
        case 'pit':
        case 'robot_gap':
        case 'goal':
            return { kind: 'tile', tile: { kind: id } };

        case 'conveyor':
        case 'cargo_conveyor':
            return {
                kind: 'tile',
                tile: {
                    kind: id,
                    direction: options.direction,
                    control: options.beltEffect === 'none'
                        ? null
                        : {
                              beltId: options.beltId,
                              effect: options.beltEffect,
                              initiallyOn: options.beltInitiallyOn,
                          },
                },
            };

        case 'door':
            return {
                kind: 'tile',
                tile: {
                    kind: 'door',
                    doorId: options.doorId,
                    initiallyOpen: options.initiallyOpen,
                    facing: options.doorFacing,
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

        case 'select':
            return { kind: 'select' };

        case 'erase':
            return { kind: 'erase' };
    }
}
