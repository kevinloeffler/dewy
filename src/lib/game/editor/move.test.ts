import { describe, expect, it } from 'vitest';
import {
    emptyLevel,
    moveSelection,
    placeDecoration,
    placeItem,
    placeSensor,
    setTile,
    type SensorTemplate,
} from './operations';
import { createLevelDraft } from './draft.svelte';
import { selectAt } from './selection';
import type { Coord, Level } from '../level';

const base = () => emptyLevel('test', 'Test', 8, 8);
const sensor: SensorTemplate = { kind: 'sensor', width: 3, depth: 3, initiallyActive: true };

function pick(level: Level, coord: Coord) {
    const selection = selectAt(level, coord);
    if (!selection) throw new Error(`nothing selectable at ${coord.x},${coord.y}`);
    return selection;
}

function wallRun(level: Level, y: number, xs: number[]): Level {
    return xs.reduce((next, x) => setTile(next, { x, y }, { kind: 'wall' }), level);
}

describe('moveSelection', () => {
    it('hands back the very same level for a zero offset', () => {
        const level = placeItem(base(), { x: 3, y: 3 }, { kind: 'crate_grey' });
        expect(moveSelection(level, pick(level, { x: 3, y: 3 }), 0, 0)).toBe(level);
    });

    it('moves an item and keeps its id', () => {
        const level = placeItem(base(), { x: 3, y: 3 }, { kind: 'crate_grey' });
        const moved = moveSelection(level, pick(level, { x: 3, y: 3 }), 2, -1)!;

        expect(moved.items).toEqual([{ ...level.items[0], position: { x: 5, y: 2 } }]);
    });

    it('refuses to put an item on another item, furniture, the robot or off the grid', () => {
        let level = placeItem(base(), { x: 3, y: 3 }, { kind: 'crate_grey' });
        level = placeItem(level, { x: 4, y: 3 }, { kind: 'crate_grey' });
        level = placeDecoration(level, { x: 3, y: 5 }, 'barrel', 'south');
        const crate = pick(level, { x: 3, y: 3 });

        expect(moveSelection(level, crate, 1, 0)).toBeNull();
        expect(moveSelection(level, crate, 0, 2)).toBeNull();
        expect(moveSelection(level, crate, -3, -3)).toBeNull();
        expect(moveSelection(level, crate, 5, 0)).toBeNull();
    });

    it('moves furniture whole, without sliding it back onto the grid', () => {
        const level = placeDecoration(base(), { x: 3, y: 3 }, 'pallet', 'south');
        const pallet = pick(level, { x: 3, y: 3 });

        expect(moveSelection(level, pallet, 1, 1)!.decorations[0].position).toEqual({ x: 3, y: 4 });
        // 3 wide from x = 2: three tiles right is the last that fits an 8-wide grid.
        expect(moveSelection(level, pallet, 4, 0)).toBeNull();
    });

    it('refuses furniture onto other furniture or a crate', () => {
        let level = placeDecoration(base(), { x: 1, y: 1 }, 'barrel', 'south');
        level = placeDecoration(level, { x: 4, y: 1 }, 'barrel', 'south');
        level = placeItem(level, { x: 1, y: 3 }, { kind: 'crate_grey' });
        const barrel = pick(level, { x: 1, y: 1 });

        expect(moveSelection(level, barrel, 3, 0)).toBeNull();
        expect(moveSelection(level, barrel, 0, 2)).toBeNull();
        expect(moveSelection(level, barrel, 1, 0)).not.toBeNull();
    });

    it('moves a sensor but not onto another', () => {
        let level = placeSensor(base(), { x: 2, y: 2 }, sensor);
        level = placeSensor(level, { x: 5, y: 5 }, sensor);
        const first = pick(level, { x: 2, y: 2 });

        const moved = moveSelection(level, first, 1, 0)!;
        expect(moved.motionSensors[0]).toEqual({ ...level.motionSensors[0], position: { x: 3, y: 2 } });
        expect(moveSelection(level, first, 3, 3)).toBeNull();
    });

    it('moves the robot and keeps its facing', () => {
        const level = base();
        const moved = moveSelection(level, pick(level, { x: 0, y: 0 }), 2, 3)!;

        expect(moved.robot).toEqual({ position: { x: 2, y: 3 }, facing: level.robot.facing });
    });

    it('slides a wall run along itself without losing a tile', () => {
        const level = wallRun(base(), 4, [2, 3, 4]);
        const moved = moveSelection(level, pick(level, { x: 3, y: 4 }), 1, 0)!;

        expect(Object.keys(moved.tiles).sort()).toEqual(['3,4', '4,4', '5,4']);
    });

    it('refuses a tile group onto a foreign tile', () => {
        let level = wallRun(base(), 4, [2, 3]);
        level = setTile(level, { x: 2, y: 6 }, { kind: 'pit' });

        expect(moveSelection(level, pick(level, { x: 2, y: 4 }), 0, 2)).toBeNull();
    });

    it('carries a deliver_specific goal along with its drop-off', () => {
        let level = setTile(base(), { x: 5, y: 5 }, { kind: 'drop_off', color: 'red' });
        level = {
            ...level,
            goals: [{ kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 5, y: 5 } }],
        };

        const moved = moveSelection(level, pick(level, { x: 5, y: 5 }), -2, 1)!;
        expect(moved.tiles['3,6']).toEqual({ kind: 'drop_off', color: 'red' });
        expect(moved.goals).toEqual([
            { kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 3, y: 6 } },
        ]);
    });
});

describe('draft gestures', () => {
    it('records a whole drag as a single history entry', () => {
        const start = placeItem(base(), { x: 3, y: 3 }, { kind: 'crate_grey' });
        const draft = createLevelDraft(start);
        const crate = pick(start, { x: 3, y: 3 });

        const origin = draft.begin();
        draft.preview(moveSelection(origin, crate, 1, 0)!);
        draft.preview(moveSelection(origin, crate, 2, 0)!);
        draft.commit();

        expect(draft.level.items[0].position).toEqual({ x: 5, y: 3 });
        draft.undo();
        expect(draft.level).toBe(start);
        expect(draft.canUndo).toBe(false);
    });

    it('puts everything back on cancel and records nothing', () => {
        const start = placeItem(base(), { x: 3, y: 3 }, { kind: 'crate_grey' });
        const draft = createLevelDraft(start);

        const origin = draft.begin();
        draft.preview(moveSelection(origin, pick(start, { x: 3, y: 3 }), 1, 0)!);
        draft.cancel();

        expect(draft.level).toBe(start);
        expect(draft.canUndo).toBe(false);
    });
});
