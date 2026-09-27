import { describe, expect, it } from 'vitest';
import { selectAt } from './selection';
import {
    deleteSelection,
    emptyLevel,
    placeItem,
    setRobot,
    setSelectionOption,
    setTile,
} from './operations';
import { tileAt } from '../grid';
import type { BeltControl, Coord, Direction, Level, Tile } from '../level';

const base = () => emptyLevel('test', 'Test', 6, 6);

/** `paint(level, { '1,1': tile, … })` — a small map of the level under test. */
function paint(level: Level, tiles: Record<string, Tile>): Level {
    return Object.entries(tiles).reduce((next, [key, tile]) => {
        const [x, y] = key.split(',').map(Number);
        return setTile(next, { x, y }, tile);
    }, level);
}

const belt = (direction: Direction, control: BeltControl | null = null): Tile =>
    ({ kind: 'conveyor', direction, control });

const wall: Tile = { kind: 'wall' };

/** Selected coords as `"x,y"`, so a test reads as a picture of the run. */
const keys = (level: Level, coord: Coord) =>
    (selectAt(level, coord)?.coords ?? []).map((c) => `${c.x},${c.y}`);

/** The tiles a selection only points at — what a switch drives. */
const linked = (level: Level, coord: Coord) =>
    (selectAt(level, coord)?.linked ?? []).map((c) => `${c.x},${c.y}`);


describe('selectAt', () => {
    it('selects nothing on bare floor or off-world', () => {
        const level = paint(base(), { '1,1': wall });

        expect(selectAt(level, { x: 4, y: 4 })).toBe(null);
        expect(selectAt(level, { x: 99, y: 0 })).toBe(null);
    });

    it('grows a wall into the run of walls it touches, and no further', () => {
        // An L of walls, plus a lone wall two tiles away.
        const level = paint(base(), { '1,1': wall, '2,1': wall, '2,2': wall, '5,5': wall });

        expect(keys(level, { x: 2, y: 2 })).toEqual(['1,1', '2,1', '2,2']);
        expect(keys(level, { x: 5, y: 5 })).toEqual(['5,5']);
    });

    it('keeps touching tiles of one kind apart when their identity differs', () => {
        const level = paint(base(), {
            '1,1': { kind: 'pressure_plate', targetId: 'door-1' },
            '2,1': { kind: 'pressure_plate', targetId: 'door-2' },
            '1,2': { kind: 'drop_off', color: 'red' },
            '2,2': { kind: 'drop_off', color: 'blue' },
        });

        expect(keys(level, { x: 1, y: 1 })).toEqual(['1,1']);
        expect(keys(level, { x: 1, y: 2 })).toEqual(['1,2']);
    });

    it('takes every tile of a door, sharing an id but not an edge', () => {
        const level = paint(base(), {
            '1,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' },
            '3,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' },
            '4,0': { kind: 'door', doorId: 'door-2', initiallyOpen: false, facing: 'south' },
        });

        expect(keys(level, { x: 1, y: 0 })).toEqual(['1,0', '3,0']);
    });

    it('picks the item standing on a tile before the tile itself', () => {
        const level = placeItem(paint(base(), { '2,2': belt('north') }), { x: 2, y: 2 }, {
            kind: 'crate_grey',
        });

        expect(selectAt(level, { x: 2, y: 2 })).toMatchObject({
            kind: 'item',
            label: 'Graue Kiste',
            coords: [{ x: 2, y: 2 }],
        });
    });

    it('picks the robot where it starts', () => {
        const level = setRobot(base(), { x: 3, y: 3 }, 'north');
        expect(selectAt(level, { x: 3, y: 3 })?.kind).toBe('robot');
    });

    it('labels what it picked', () => {
        const level = paint(base(), { '1,1': { kind: 'drop_off', color: 'red' } });
        expect(selectAt(level, { x: 1, y: 1 })?.label).toBe('Abgabestelle');
    });
});


describe('selecting a belt', () => {
    it('follows the ride round a corner', () => {
        // (1,3) → (1,2) → (1,1) → turns east → (2,1)
        const level = paint(base(), {
            '1,3': belt('north'),
            '1,2': belt('north'),
            '1,1': belt('east'),
            '2,1': belt('east'),
        });

        expect(keys(level, { x: 1, y: 3 })).toEqual(['1,1', '2,1', '1,2', '1,3']);
    });

    it('leaves two parallel lanes as two belts', () => {
        // Neither lane ever travels into the other, so nothing joins them.
        const level = paint(base(), {
            '1,1': belt('north'),
            '1,2': belt('north'),
            '2,1': belt('north'),
            '2,2': belt('north'),
        });

        expect(keys(level, { x: 1, y: 2 })).toEqual(['1,1', '1,2']);
    });

    it('stops where a cargo belt takes over from a conveyor', () => {
        const level = paint(base(), {
            '1,2': belt('north'),
            '1,1': { kind: 'cargo_conveyor', direction: 'north', control: null },
        });

        expect(keys(level, { x: 1, y: 2 })).toEqual(['1,2']);
    });

    it('stays a run: a shared drive does not drag in belts elsewhere', () => {
        const drive: BeltControl = { beltId: 'belt-1', effect: 'power', initiallyOn: true };
        const level = paint(base(), {
            '1,1': belt('east', drive),
            '2,1': belt('east', drive),
            // Same drive, other side of the level — reached from the switch
            // that runs it, never from the belt itself.
            '5,5': belt('north', drive),
        });

        expect(keys(level, { x: 1, y: 1 })).toEqual(['1,1', '2,1']);
    });
});


describe('selecting a switch or a plate', () => {
    const drive: BeltControl = { beltId: 'belt-1', effect: 'power', initiallyOn: true };

    it('brings along every belt tile it drives, wherever they are', () => {
        const level = paint(base(), {
            '4,0': { kind: 'switch', targetId: 'belt-1', initiallyOn: false },
            '1,1': belt('east', drive),
            '2,1': belt('east', drive),
            '5,5': belt('north', drive),
            // Another belt, driven by something else: not this switch's.
            '0,5': belt('north', { ...drive, beltId: 'belt-2' }),
        });

        expect(keys(level, { x: 4, y: 0 })).toEqual(['4,0']);
        expect(linked(level, { x: 4, y: 0 })).toEqual(['1,1', '2,1', '5,5']);
    });

    it('brings along every tile of the door it opens', () => {
        const level = paint(base(), {
            '0,2': { kind: 'pressure_plate', targetId: 'door-1' },
            '1,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' },
            '3,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' },
            '4,0': { kind: 'door', doorId: 'door-2', initiallyOpen: false, facing: 'south' },
        });

        expect(keys(level, { x: 0, y: 2 })).toEqual(['0,2']);
        expect(linked(level, { x: 0, y: 2 })).toEqual(['1,0', '3,0']);
    });

    it('names the link in its label, and drops it when nothing answers', () => {
        const level = paint(base(), {
            '4,0': { kind: 'switch', targetId: 'belt-1', initiallyOn: false },
            '1,1': belt('east', drive),
            // Points at a motion sensor, or at nothing yet: no tiles to add.
            '0,2': { kind: 'switch', targetId: 'sensor-1', initiallyOn: false },
        });

        expect(selectAt(level, { x: 4, y: 0 })?.label).toBe('Schalter → belt-1');
        expect(selectAt(level, { x: 0, y: 2 })?.label).toBe('Schalter');
        expect(linked(level, { x: 0, y: 2 })).toEqual([]);
    });

    it('groups touching controls that drive the same thing', () => {
        const level = paint(base(), {
            '3,0': { kind: 'pressure_plate', targetId: 'belt-1' },
            '4,0': { kind: 'pressure_plate', targetId: 'belt-1' },
            '2,2': belt('east', drive),
        });

        expect(keys(level, { x: 4, y: 0 })).toEqual(['3,0', '4,0']);
        expect(linked(level, { x: 4, y: 0 })).toEqual(['2,2']);
    });

    it('is not reached from the other end — the belt selects itself alone', () => {
        const level = paint(base(), {
            '4,0': { kind: 'switch', targetId: 'belt-1', initiallyOn: false },
            '1,1': belt('east', drive),
        });

        expect(keys(level, { x: 1, y: 1 })).toEqual(['1,1']);
    });
});


describe('deleteSelection', () => {
    it('clears a whole belt in one edit, leaving what stood on it', () => {
        const level = placeItem(
            paint(base(), { '1,1': belt('south'), '1,2': belt('south'), '1,3': belt('south') }),
            { x: 1, y: 2 },
            { kind: 'crate_grey' },
        );

        const cleared = deleteSelection(level, selectAt(level, { x: 1, y: 1 })!);

        expect(Object.keys(cleared.tiles)).toEqual([]);
        expect(cleared.items).toHaveLength(1);
        expect(tileAt(cleared, { x: 1, y: 2 })).toEqual({ kind: 'floor' });
    });

    it('removes just the selected item', () => {
        const withCrates = placeItem(
            placeItem(base(), { x: 1, y: 1 }, { kind: 'crate_grey' }),
            { x: 2, y: 1 },
            { kind: 'crate_grey' },
        );

        const cleared = deleteSelection(withCrates, selectAt(withCrates, { x: 1, y: 1 })!);

        expect(cleared.items.map((item) => item.position)).toEqual([{ x: 2, y: 1 }]);
    });

    it('never deletes the robot, and never mutates the level it was given', () => {
        const level = setRobot(base(), { x: 3, y: 3 }, 'north');
        const selection = selectAt(level, { x: 3, y: 3 })!;

        expect(deleteSelection(level, selection)).toBe(level);
    });

    it('leaves the level untouched, by reference, once there is nothing left to clear', () => {
        const level = paint(base(), { '1,1': wall, '2,1': wall });
        const selection = selectAt(level, { x: 1, y: 1 })!;

        const cleared = deleteSelection(level, selection);
        expect(cleared).not.toBe(level);
        // A second delete of the same selection is a no-op, so it adds no
        // history entry — `LevelDraft.apply` compares by reference.
        expect(deleteSelection(cleared, selection)).toBe(cleared);
        // And the level it was handed still has its walls.
        expect(Object.keys(level.tiles).sort()).toEqual(['1,1', '2,1']);
    });
});


describe('setSelectionOption', () => {
    const drive: BeltControl = { beltId: 'belt-1', effect: 'power', initiallyOn: true };

    it('re-points every control in the selection at once', () => {
        const level = paint(base(), {
            '3,0': { kind: 'pressure_plate', targetId: 'door-1' },
            '4,0': { kind: 'pressure_plate', targetId: 'door-1' },
            '1,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' },
        });

        const edited = setSelectionOption(level, selectAt(level, { x: 3, y: 0 })!, {
            targetId: 'belt-1',
        });

        expect(edited.tiles['3,0']).toEqual({ kind: 'pressure_plate', targetId: 'belt-1' });
        expect(edited.tiles['4,0']).toEqual({ kind: 'pressure_plate', targetId: 'belt-1' });
        // The door it used to open is linked, not selected: it stays as it was.
        expect(edited.tiles['1,0']).toEqual({ kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' });
    });

    it('changes only the named field, tile by tile', () => {
        // An L-shaped run: the corner travels east, the rest north.
        const level = paint(base(), {
            '1,3': belt('north'),
            '1,2': belt('north'),
            '1,1': belt('east'),
        });

        const driven = setSelectionOption(level, selectAt(level, { x: 1, y: 3 })!, {
            beltEffect: 'power',
            beltId: 'belt-2',
            beltInitiallyOn: false,
        });

        const control = { beltId: 'belt-2', effect: 'power', initiallyOn: false };
        expect(driven.tiles['1,3']).toEqual({ kind: 'conveyor', direction: 'north', control });
        // Every tile keeps the direction it was drawn with, corner and all.
        expect(driven.tiles['1,1']).toEqual({ kind: 'conveyor', direction: 'east', control });
    });

    it('edits an item in place, keeping its id and position', () => {
        const level = placeItem(base(), { x: 2, y: 2 }, { kind: 'crate_colour', color: 'red' });
        const before = level.items[0];

        const edited = setSelectionOption(level, selectAt(level, { x: 2, y: 2 })!, {
            crateColor: 'blue',
        });

        expect(edited.items).toEqual([{ ...before, color: 'blue' }]);
    });

    it('turns the robot without moving it', () => {
        const level = setRobot(base(), { x: 3, y: 3 }, 'north');
        const edited = setSelectionOption(level, selectAt(level, { x: 3, y: 3 })!, {
            facing: 'west',
        });

        expect(edited.robot).toEqual({ position: { x: 3, y: 3 }, facing: 'west' });
    });

    it('leaves the level untouched, by reference, when the field already says that', () => {
        const level = paint(base(), { '1,1': { kind: 'drop_off', color: 'red' } });
        const selection = selectAt(level, { x: 1, y: 1 })!;

        expect(setSelectionOption(level, selection, { bayColor: 'red' })).toBe(level);
        // A patch naming nothing the selection reads is a no-op too.
        expect(setSelectionOption(level, selection, { facing: 'north' })).toBe(level);
    });
});
