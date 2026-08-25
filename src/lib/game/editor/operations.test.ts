import { describe, expect, it } from 'vitest';
import {
    addGoal,
    applyBrush,
    clearTile,
    doorIds,
    dropOffBays,
    emptyLevel,
    nextDoorId,
    nextItemId,
    placeItem,
    removeGoal,
    removeItemAt,
    resize,
    setMeta,
    setOptions,
    setRobot,
    setTile,
} from './operations';
import { tileAt } from '../grid';
import type { Level } from '../level';

const base = () => emptyLevel('test', 'Test');

describe('setTile', () => {
    it('stores a tile under its "<x>,<y>" key', () => {
        const level = setTile(base(), { x: 2, y: 3 }, { kind: 'wall' });
        expect(level.tiles['2,3']).toEqual({ kind: 'wall' });
    });

    it('deletes the key when painting floor, keeping `tiles` sparse', () => {
        const walled = setTile(base(), { x: 2, y: 3 }, { kind: 'wall' });
        const cleared = clearTile(walled, { x: 2, y: 3 });

        expect('2,3' in cleared.tiles).toBe(false);
        // The sparse default still reads back as floor.
        expect(tileAt(cleared, { x: 2, y: 3 })).toEqual({ kind: 'floor' });
    });

    it('leaves the level untouched, by reference, when nothing changes', () => {
        const level = setTile(base(), { x: 1, y: 1 }, { kind: 'pit' });

        expect(setTile(level, { x: 1, y: 1 }, { kind: 'pit' })).toBe(level);
        expect(clearTile(level, { x: 4, y: 4 })).toBe(level);
        expect(setTile(level, { x: 99, y: 0 }, { kind: 'wall' })).toBe(level);
    });

    it('notices a changed field on a tile of the same kind', () => {
        const level = setTile(base(), { x: 1, y: 1 }, { kind: 'conveyor', direction: 'north' });
        const turned = setTile(level, { x: 1, y: 1 }, { kind: 'conveyor', direction: 'east' });

        expect(turned).not.toBe(level);
        expect(turned.tiles['1,1']).toEqual({ kind: 'conveyor', direction: 'east' });
    });

    it('does not mutate the level it was given', () => {
        const level = base();
        setTile(level, { x: 0, y: 1 }, { kind: 'wall' });
        expect(level.tiles).toEqual({});
    });
});

describe('items', () => {
    it('mints a unique id per item', () => {
        let level = placeItem(base(), { x: 0, y: 1 }, { kind: 'crate_grey' });
        level = placeItem(level, { x: 0, y: 2 }, { kind: 'crate_colour', color: 'red' });

        expect(level.items.map((item) => item.id)).toEqual(['crate-1', 'crate-2']);
    });

    it('allows only one item per tile', () => {
        let level = placeItem(base(), { x: 1, y: 1 }, { kind: 'crate_grey' });
        level = placeItem(level, { x: 1, y: 1 }, { kind: 'crate_colour', color: 'blue' });

        expect(level.items).toHaveLength(1);
        expect(level.items[0]).toMatchObject({ kind: 'crate_colour', color: 'blue' });
    });

    it('removes by coordinate and reports no-ops by reference', () => {
        const level = placeItem(base(), { x: 1, y: 1 }, { kind: 'crate_grey' });

        expect(removeItemAt(level, { x: 1, y: 1 }).items).toHaveLength(0);
        expect(removeItemAt(level, { x: 5, y: 5 })).toBe(level);
    });

    it('skips ids that are already taken', () => {
        const level: Level = { ...base(), items: [
            { kind: 'crate_grey', id: 'crate-1', position: { x: 0, y: 1 } },
            { kind: 'crate_grey', id: 'crate-3', position: { x: 0, y: 2 } },
        ] };

        expect(nextItemId(level, 'crate')).toBe('crate-2');
    });
});

describe('doors and bays', () => {
    it('collects door ids from tiles and suggests a free one', () => {
        let level = setTile(base(), { x: 1, y: 1 }, {
            kind: 'door', doorId: 'door-1', initiallyOpen: false,
        });
        level = setTile(level, { x: 2, y: 1 }, {
            kind: 'door', doorId: 'door-1', initiallyOpen: false,
        });

        expect(doorIds(level)).toEqual(['door-1']);
        expect(nextDoorId(level)).toBe('door-2');
    });

    it('lists drop-off bays in reading order', () => {
        let level = setTile(base(), { x: 3, y: 2 }, { kind: 'drop_off', color: null });
        level = setTile(level, { x: 1, y: 0 }, { kind: 'drop_off', color: 'red' });

        expect(dropOffBays(level)).toEqual([
            { coord: { x: 1, y: 0 }, color: 'red' },
            { coord: { x: 3, y: 2 }, color: null },
        ]);
    });
});

describe('applyBrush', () => {
    it('routes each brush kind to its operation', () => {
        const level = base();

        expect(applyBrush(level, { kind: 'tile', tile: { kind: 'wall' } }, { x: 1, y: 1 })
            .tiles['1,1']).toEqual({ kind: 'wall' });

        expect(applyBrush(level, { kind: 'item', item: { kind: 'crate_grey' } }, { x: 1, y: 1 })
            .items).toHaveLength(1);

        expect(applyBrush(level, { kind: 'robot', facing: 'east' }, { x: 2, y: 2 })
            .robot).toEqual({ position: { x: 2, y: 2 }, facing: 'east' });
    });

    it('erases the tile and whatever stood on it in one stroke', () => {
        let level = setTile(base(), { x: 1, y: 1 }, { kind: 'pit' });
        level = placeItem(level, { x: 1, y: 1 }, { kind: 'crate_grey' });

        const erased = applyBrush(level, { kind: 'erase' }, { x: 1, y: 1 });

        expect('1,1' in erased.tiles).toBe(false);
        expect(erased.items).toHaveLength(0);
    });

    it('refuses to paint outside the grid', () => {
        const level = base();
        expect(applyBrush(level, { kind: 'tile', tile: { kind: 'wall' } }, { x: -1, y: 0 })).toBe(level);
        expect(applyBrush(level, { kind: 'robot', facing: 'north' }, { x: 8, y: 0 })).toBe(level);
    });
});

describe('setRobot', () => {
    it('moves the single robot and reports a no-op by reference', () => {
        const level = setRobot(base(), { x: 3, y: 4 }, 'west');
        expect(level.robot).toEqual({ position: { x: 3, y: 4 }, facing: 'west' });
        expect(setRobot(level, { x: 3, y: 4 }, 'west')).toBe(level);
    });
});

describe('resize', () => {
    it('drops everything that falls outside and clamps the robot', () => {
        let level = base();
        level = setTile(level, { x: 6, y: 6 }, { kind: 'wall' });
        level = setTile(level, { x: 1, y: 1 }, { kind: 'wall' });
        level = placeItem(level, { x: 5, y: 0 }, { kind: 'crate_grey' });
        level = placeItem(level, { x: 0, y: 1 }, { kind: 'crate_grey' });
        level = setRobot(level, { x: 7, y: 7 }, 'north');
        level = addGoal(level, {
            kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 6, y: 6 },
        });

        const small = resize(level, 4, 4);

        expect(small.width).toBe(4);
        expect(Object.keys(small.tiles)).toEqual(['1,1']);
        expect(small.items.map((item) => item.position)).toEqual([{ x: 0, y: 1 }]);
        expect(small.robot.position).toEqual({ x: 3, y: 3 });
        expect(small.goals).toEqual([]);
    });

    it('keeps everything when growing, and is a no-op at the same size', () => {
        const level = setTile(base(), { x: 7, y: 7 }, { kind: 'wall' });
        expect(resize(level, 12, 12).tiles['7,7']).toEqual({ kind: 'wall' });
        expect(resize(level, 8, 8)).toBe(level);
    });
});

describe('meta, options and goals', () => {
    it('patches meta without disturbing the rest', () => {
        const level = setMeta(base(), { name: 'Renamed', description: 'Hello' });
        expect(level.name).toBe('Renamed');
        expect(level.description).toBe('Hello');
        expect(setMeta(level, { name: 'Renamed' })).toBe(level);
    });

    it('keeps a null description distinguishable from no change', () => {
        const level = setMeta(base(), { description: 'Hello' });
        expect(setMeta(level, { description: null }).description).toBe(null);
    });

    it('patches options', () => {
        const level = setOptions(base(), { energy: 12, memory: 8, languageStage: 3 });
        expect(level.options).toEqual({
            energy: 12, memory: 8, showInventory: false, languageStage: 3,
        });
        expect(setOptions(level, { energy: 12 })).toBe(level);
        expect(setOptions(level, { memory: 8 })).toBe(level);
    });

    it('refuses a duplicate level-wide goal but allows distinct bays', () => {
        let level = addGoal(base(), { kind: 'reach_goal' });
        expect(addGoal(level, { kind: 'reach_goal' })).toBe(level);

        level = addGoal(level, {
            kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 1, y: 1 },
        });
        level = addGoal(level, {
            kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 2, y: 2 },
        });
        expect(level.goals).toHaveLength(3);

        expect(removeGoal(level, 0).goals).toHaveLength(2);
        expect(removeGoal(level, 9)).toBe(level);
    });
});
