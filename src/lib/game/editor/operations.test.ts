import { describe, expect, it } from 'vitest';
import {
    addGoal,
    applyBrush,
    armIds,
    beltIds,
    clearTile,
    doorIds,
    dropOffBays,
    emptyLevel,
    nextBeltId,
    nextDoorId,
    nextDecorationId,
    nextItemId,
    placeDecoration,
    placeItem,
    removeDecorationAt,
    removeGoal,
    removeItemAt,
    resize,
    MAX_SIZE,
    MIN_SIZE,
    rotateSelection,
    turnDecoration,
    setMeta,
    setOptions,
    setRobot,
    setTile,
    targetIds,
} from './operations';
import { buildBrush, defaultBrushOptions, type BrushOptions } from './brush';
import { decorationAt } from '../decorations';
import { selectAt } from './selection';
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
        const level = setTile(base(), { x: 1, y: 1 }, { kind: 'conveyor', direction: 'north', control: null });
        const turned = setTile(level, { x: 1, y: 1 }, { kind: 'conveyor', direction: 'east', control: null });

        expect(turned).not.toBe(level);
        expect(turned.tiles['1,1']).toEqual({ kind: 'conveyor', direction: 'east', control: null });
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
            kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south',
        });
        level = setTile(level, { x: 2, y: 1 }, {
            kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south',
        });

        expect(doorIds(level)).toEqual(['door-1']);
        expect(nextDoorId(level)).toBe('door-2');
    });

    it('collects belt ids, suggests a free one, and lists every link target', () => {
        const drive = { beltId: 'belt-1', effect: 'power', initiallyOn: true } as const;
        let level = setTile(base(), { x: 1, y: 1 }, {
            kind: 'conveyor', direction: 'east', control: drive,
        });
        level = setTile(level, { x: 2, y: 1 }, {
            kind: 'cargo_conveyor', direction: 'east', control: drive,
        });
        level = setTile(level, { x: 3, y: 1 }, {
            kind: 'conveyor', direction: 'east', control: null,
        });
        level = setTile(level, { x: 0, y: 0 }, {
            kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south',
        });

        expect(beltIds(level)).toEqual(['belt-1']);
        expect(nextBeltId(level)).toBe('belt-2');
        // Doors, belts and sensors share one namespace, sorted.
        expect(targetIds({ ...level, motionSensors: [
            { sensorId: 'alarm', forbiddenTiles: [], initiallyActive: true },
        ] })).toEqual(['alarm', 'belt-1', 'door-1']);
    });

    it('notices a belt whose drive changed but whose direction did not', () => {
        const level = setTile(base(), { x: 1, y: 1 }, {
            kind: 'conveyor', direction: 'east', control: null,
        });
        const driven = setTile(level, { x: 1, y: 1 }, {
            kind: 'conveyor',
            direction: 'east',
            control: { beltId: 'belt-1', effect: 'power', initiallyOn: true },
        });
        const renamed = setTile(driven, { x: 1, y: 1 }, {
            kind: 'conveyor',
            direction: 'east',
            control: { beltId: 'belt-2', effect: 'power', initiallyOn: true },
        });

        expect(driven).not.toBe(level);
        expect(renamed).not.toBe(driven);
        expect(setTile(renamed, { x: 1, y: 1 }, renamed.tiles['1,1']!)).toBe(renamed);
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

describe('armIds', () => {
    const belt = (id: string) =>
        ({
            kind: 'conveyor',
            direction: 'east',
            control: { beltId: id, effect: 'power', initiallyOn: true },
        }) as const;

    const driving = { ...defaultBrushOptions(), beltEffect: 'power' as const };

    it('leaves an id alone while nothing answers to it', () => {
        expect(armIds(base(), 'conveyor', driving)).toBe(driving);
    });

    it('moves on to a free belt id once the level has claimed the one in hand', () => {
        const level = setTile(base(), { x: 1, y: 1 }, belt('belt-1'));
        expect(armIds(level, 'conveyor', driving).beltId).toBe('belt-2');
    });

    it('keeps one stroke on one id, and starts the next stroke on a new one', () => {
        // What a drag does: every tile of the stroke paints the id in hand,
        // and only the end of the stroke re-arms.
        let level = base();
        let options: BrushOptions = driving;
        for (const x of [1, 2, 3]) {
            level = applyBrush(level, buildBrush('conveyor', options), { x, y: 1 });
        }
        options = armIds(level, 'conveyor', options);

        expect(beltIds(level)).toEqual(['belt-1']);
        expect(options.beltId).toBe('belt-2');

        level = applyBrush(level, buildBrush('conveyor', options), { x: 1, y: 3 });
        expect(beltIds(level)).toEqual(['belt-1', 'belt-2']);
    });

    it('leaves a belt with no drive alone — it has no id to author', () => {
        const level = setTile(base(), { x: 1, y: 1 }, belt('belt-1'));
        const undriven = defaultBrushOptions();
        expect(armIds(level, 'conveyor', undriven)).toBe(undriven);
    });

    it('moves the door brush on, and never links a keycard for the author', () => {
        const level = setTile(base(), { x: 1, y: 1 }, {
            kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south',
        });

        const options = armIds(level, 'door', defaultBrushOptions());
        expect(options.doorId).toBe('door-2');

        // A new door does not inherit the last one's name.
        expect(armIds(level, 'door', { ...defaultBrushOptions(), doorName: 'Tor A' }).doorName).toBe('');

        // A door to open exists, but picking it is the author's call.
        expect(armIds(level, 'keycard', options)).toBe(options);
        expect(options.keycardDoorId).toBe('');
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

        expect(applyBrush(
            level,
            { kind: 'decoration', decoration: 'shelf', facing: 'south' },
            { x: 1, y: 1 },
        ).decorations).toHaveLength(1);
    });

    it('erases furniture on its own, leaving the tile under it alone', () => {
        let level = setTile(base(), { x: 3, y: 3 }, { kind: 'goal' });
        level = applyBrush(
            level,
            { kind: 'decoration', decoration: 'pallet', facing: 'south' },
            { x: 3, y: 3 },
        );

        const erased = applyBrush(level, { kind: 'erase' }, { x: 4, y: 4 });

        expect(erased.decorations).toEqual([]);
        expect(erased.tiles['3,3']).toEqual({ kind: 'goal' });
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

describe('placeDecoration', () => {
    it('centres the footprint on the click', () => {
        const level = placeDecoration(base(), { x: 3, y: 3 }, 'pallet', 'south');

        expect(level.decorations).toHaveLength(1);
        expect(level.decorations[0].position).toEqual({ x: 2, y: 3 });
        expect(decorationAt(level, { x: 3, y: 3 })).not.toBeNull();
    });

    it('slides a piece dropped near the edge back onto the grid', () => {
        const level = placeDecoration(base(), { x: 7, y: 7 }, 'shelf', 'south');
        expect(level.decorations[0].position).toEqual({ x: 6, y: 7 });
    });

    it('refuses an overlap rather than shoving what is there', () => {
        const one = placeDecoration(base(), { x: 3, y: 3 }, 'pallet', 'south');
        expect(placeDecoration(one, { x: 3, y: 3 }, 'barrel', 'south')).toBe(one);

        // Clear of the pallet, so the second piece lands.
        expect(placeDecoration(one, { x: 6, y: 6 }, 'barrel', 'south').decorations).toHaveLength(2);
    });

    it('mints a fresh id for each piece', () => {
        let level = placeDecoration(base(), { x: 1, y: 1 }, 'barrel', 'south');
        level = placeDecoration(level, { x: 3, y: 1 }, 'cone', 'south');

        expect(level.decorations.map((piece) => piece.id)).toEqual(['deko-1', 'deko-2']);
        expect(nextDecorationId(level)).toBe('deko-3');
    });

    it('clears items off the tiles it covers, since nothing can reach them', () => {
        let level = placeItem(base(), { x: 3, y: 3 }, { kind: 'crate_grey' });
        level = placeItem(level, { x: 7, y: 7 }, { kind: 'crate_grey' });
        level = placeDecoration(level, { x: 3, y: 3 }, 'pallet', 'south');

        expect(level.items.map((item) => item.position)).toEqual([{ x: 7, y: 7 }]);
    });

    it('refuses to paint outside the grid', () => {
        const level = base();
        expect(placeDecoration(level, { x: -1, y: 0 }, 'cone', 'south')).toBe(level);
    });
});

describe('removeDecorationAt and turnDecoration', () => {
    it('removes a piece from any tile it covers', () => {
        const level = placeDecoration(base(), { x: 3, y: 3 }, 'pallet', 'south');

        expect(removeDecorationAt(level, { x: 4, y: 4 }).decorations).toEqual([]);
        expect(removeDecorationAt(level, { x: 0, y: 0 })).toBe(level);
    });

    it('turns a piece where it stands, and reports a no-op by reference', () => {
        const level = placeDecoration(base(), { x: 3, y: 3 }, 'shelf', 'south');
        const id = level.decorations[0].id;

        const turned = turnDecoration(level, id, 'east');
        expect(turned.decorations[0].facing).toBe('east');
        expect(decorationAt(turned, { x: 3, y: 4 })).not.toBeNull();

        expect(turnDecoration(turned, id, 'east')).toBe(turned);
        expect(turnDecoration(turned, 'nobody', 'west')).toBe(turned);
    });

    it('refuses a turn that would run into another piece', () => {
        let level = placeDecoration(base(), { x: 1, y: 1 }, 'shelf', 'south');
        level = placeDecoration(level, { x: 1, y: 2 }, 'barrel', 'south');

        expect(turnDecoration(level, level.decorations[0].id, 'east')).toBe(level);
    });
});

describe('rotateSelection', () => {
    /** Selections are re-read from the level, exactly as the designer does. */
    const pick = (level: Level, x: number, y: number) => selectAt(level, { x, y })!;

    it('turns a belt run tile by tile, so a corner stays a corner', () => {
        // An east run that turns south at 2,1 — one belt, two directions.
        let level = setTile(base(), { x: 1, y: 1 }, { kind: 'conveyor', direction: 'east', control: null });
        level = setTile(level, { x: 2, y: 1 }, { kind: 'conveyor', direction: 'south', control: null });

        const turned = rotateSelection(level, pick(level, 1, 1));

        expect(turned.tiles['1,1']).toMatchObject({ direction: 'south' });
        expect(turned.tiles['2,1']).toMatchObject({ direction: 'west' });
    });

    it('turns the robot and a piece of furniture', () => {
        const withRobot = setRobot(base(), { x: 2, y: 2 }, 'north');
        expect(rotateSelection(withRobot, pick(withRobot, 2, 2)).robot.facing).toBe('east');

        const withShelf = placeDecoration(base(), { x: 4, y: 4 }, 'shelf', 'south');
        const turned = rotateSelection(withShelf, pick(withShelf, 4, 4));
        expect(turned.decorations[0].facing).toBe('west');
    });

    it('turns every tile of a door', () => {
        const door = { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' } as const;
        let level = setTile(base(), { x: 1, y: 1 }, door);
        level = setTile(level, { x: 2, y: 1 }, door);

        const turned = rotateSelection(level, pick(level, 1, 1));

        expect(turned.tiles['1,1']).toMatchObject({ facing: 'west' });
        expect(turned.tiles['2,1']).toMatchObject({ facing: 'west' });
    });

    it('leaves alone what has no turn to make', () => {
        const withCrate = placeItem(base(), { x: 2, y: 2 }, { kind: 'crate_grey' });
        expect(rotateSelection(withCrate, pick(withCrate, 2, 2))).toBe(withCrate);

        // A barrel is a cylinder: turning it would change stored data and
        // nothing anybody can see.
        const withBarrel = placeDecoration(base(), { x: 2, y: 2 }, 'barrel', 'south');
        expect(rotateSelection(withBarrel, pick(withBarrel, 2, 2))).toBe(withBarrel);

        const withWall = setTile(base(), { x: 2, y: 2 }, { kind: 'wall' });
        expect(rotateSelection(withWall, pick(withWall, 2, 2))).toBe(withWall);
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
        level = placeDecoration(level, { x: 1, y: 1 }, 'cone', 'south');
        // Straddles the new edge, so it goes with the tiles it stood on.
        level = placeDecoration(level, { x: 4, y: 1 }, 'shelf', 'south');
        level = addGoal(level, {
            kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 6, y: 6 },
        });

        const small = resize(level, 4, 4);

        expect(small.width).toBe(4);
        expect(Object.keys(small.tiles)).toEqual(['1,1']);
        expect(small.items.map((item) => item.position)).toEqual([{ x: 0, y: 1 }]);
        expect(small.robot.position).toEqual({ x: 3, y: 3 });
        expect(small.decorations.map((piece) => piece.kind)).toEqual(['cone']);
        expect(small.goals).toEqual([]);
    });

    it('keeps everything when growing, and is a no-op at the same size', () => {
        const level = setTile(base(), { x: 7, y: 7 }, { kind: 'wall' });
        expect(resize(level, 12, 12).tiles['7,7']).toEqual({ kind: 'wall' });
        expect(resize(level, 8, 8)).toBe(level);
    });

    it('clamps each side to MIN_SIZE..MAX_SIZE', () => {
        const level = base();
        const tiny = resize(level, 1, 2);
        expect([tiny.width, tiny.height]).toEqual([MIN_SIZE, MIN_SIZE]);
        const huge = resize(level, 40, 30);
        expect([huge.width, huge.height]).toEqual([MAX_SIZE, MAX_SIZE]);
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

    it('patches instructions and clears them with null', () => {
        const level = setMeta(base(), { instructions: '# Aufgabe' });
        expect(level.instructions).toBe('# Aufgabe');
        expect(setMeta(level, { instructions: '# Aufgabe' })).toBe(level);
        expect(setMeta(level, { name: 'Renamed' }).instructions).toBe('# Aufgabe');
        expect(setMeta(level, { instructions: null }).instructions).toBe(null);
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
