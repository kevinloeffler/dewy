import { describe, expect, it } from 'vitest';
import {
    applyBrush,
    deleteSelection,
    emptyLevel,
    placeDecoration,
    placeItem,
    placeSensor,
    resize,
    rotateSelection,
    sensorPlacement,
    setSelectionOption,
    setTile,
    type SensorTemplate,
} from './operations';
import { buildBrush, defaultBrushOptions, sensorOptions } from './brush';
import { selectAt } from './selection';
import { parseLevel } from './parse';
import { validateLevel } from '../rules';
import { clampSensorSize, sensorZone } from '../sensors';
import type { Level } from '../level';

const base = () => emptyLevel('test', 'Test', 8, 8);
const template: SensorTemplate = { kind: 'sensor', width: 3, depth: 3, initiallyActive: true };
const roundTrip = (level: Level) => JSON.parse(JSON.stringify(level));

/** A level with one 3×3 sensor at 4,4 — clear of the robot's corner. */
const withSensor = () => placeSensor(base(), { x: 4, y: 4 }, template);

describe('placing a sensor', () => {
    it('mints sensor-1, then sensor-2', () => {
        const level = placeSensor(withSensor(), { x: 1, y: 5 }, template);
        expect(level.motionSensors.map((s) => s.sensorId)).toEqual(['sensor-1', 'sensor-2']);
        expect(level.motionSensors[0]).toMatchObject({
            position: { x: 4, y: 4 },
            width: 3,
            depth: 3,
            initiallyActive: true,
        });
    });

    it('hangs over walls, furniture and the robot, but not another sensor', () => {
        let level = setTile(base(), { x: 2, y: 2 }, { kind: 'wall' });
        level = placeDecoration(level, { x: 6, y: 6 }, 'pillar', 'south');
        level = placeSensor(level, { x: 4, y: 4 }, template);

        expect(sensorPlacement(level, { x: 2, y: 2 }, template)).not.toBeNull();
        expect(sensorPlacement(level, { x: 6, y: 6 }, template)).not.toBeNull();
        expect(sensorPlacement(level, level.robot.position, template)).not.toBeNull();
        expect(sensorPlacement(level, { x: 4, y: 4 }, template)).toBeNull();
        expect(sensorPlacement(level, { x: 9, y: 9 }, template)).toBeNull();
    });

    it('leaves an item beneath it where it is', () => {
        const level = placeSensor(
            placeItem(base(), { x: 4, y: 4 }, { kind: 'crate_grey' }),
            { x: 4, y: 4 },
            template,
        );
        expect(level.items).toHaveLength(1);
        expect(level.motionSensors).toHaveLength(1);
    });

    it('is what the motion sensor brush paints', () => {
        const brush = buildBrush('motion_sensor', { ...defaultBrushOptions(), sensorWidth: 5 });
        const level = applyBrush(base(), brush, { x: 3, y: 3 });
        expect(level.motionSensors[0]).toMatchObject({ width: 5, depth: 3 });
    });
});

describe('erasing', () => {
    it('removes the device before the floor under it', () => {
        const level = applyBrush(withSensor(), { kind: 'erase' }, { x: 4, y: 4 });
        expect(level.motionSensors).toEqual([]);
    });

    it('leaves the sensor alone when erasing a tile in its zone', () => {
        const painted = setTile(withSensor(), { x: 3, y: 3 }, { kind: 'wall' });
        const level = applyBrush(painted, { kind: 'erase' }, { x: 3, y: 3 });
        expect(level.motionSensors).toHaveLength(1);
        expect(level.tiles['3,3']).toBeUndefined();
    });
});

describe('the zone', () => {
    it('is the rectangle round the device, its own tile included', () => {
        const level = withSensor();
        const zone = sensorZone(level, level.motionSensors[0]);
        expect(zone).toHaveLength(9);
        expect(zone).toContainEqual({ x: 4, y: 4 });
    });

    it('is clipped to the grid', () => {
        const level = placeSensor(base(), { x: 0, y: 3 }, template);
        expect(sensorZone(level, level.motionSensors[0])).toHaveLength(6);
    });

    it('only ever has odd sides', () => {
        expect([0, 1, 2, 3, 4, 11, 12, 99].map(clampSensorSize)).toEqual([1, 1, 1, 3, 3, 11, 11, 11]);
    });
});

describe('selecting a sensor', () => {
    it('picks the device, with the rest of its zone as context', () => {
        const selection = selectAt(withSensor(), { x: 4, y: 4 });
        expect(selection?.kind).toBe('sensor');
        expect(selection?.coords).toEqual([{ x: 4, y: 4 }]);
        expect(selection?.linked).toHaveLength(8);
    });

    it('leaves plain floor in the zone unselectable', () => {
        expect(selectAt(withSensor(), { x: 3, y: 3 })).toBeNull();
    });

    it('shows a linked switch the whole zone', () => {
        const level = setTile(withSensor(), { x: 0, y: 7 }, {
            kind: 'switch',
            targetId: 'sensor-1',
            initiallyOn: false,
        });
        const selection = selectAt(level, { x: 0, y: 7 });
        expect(selection?.linked).toHaveLength(9);
        expect(selection?.label).toContain('sensor-1');
    });

    it('edits size, start value and name, clamping sizes to odd', () => {
        const level = withSensor();
        const selection = selectAt(level, { x: 4, y: 4 })!;
        const edited = setSelectionOption(level, selection, {
            sensorWidth: 4,
            sensorInitiallyActive: false,
            sensorName: '  Wache ',
        });
        expect(edited.motionSensors[0]).toMatchObject({
            width: 3,
            depth: 3,
            initiallyActive: false,
            name: 'Wache',
        });
    });

    it('returns the same level for an edit that changes nothing', () => {
        const level = withSensor();
        const selection = selectAt(level, { x: 4, y: 4 })!;
        expect(setSelectionOption(level, selection, { sensorWidth: 3 })).toBe(level);
    });

    it('rotates by swapping its sides', () => {
        const level = placeSensor(base(), { x: 4, y: 4 }, { ...template, width: 1, depth: 5 });
        const turned = rotateSelection(level, selectAt(level, { x: 4, y: 4 })!);
        expect(turned.motionSensors[0]).toMatchObject({ width: 5, depth: 1 });
    });

    it('deletes it, leaving a linked switch to be reported', () => {
        const linked = setTile(withSensor(), { x: 0, y: 7 }, {
            kind: 'switch',
            targetId: 'sensor-1',
            initiallyOn: false,
        });
        const level = deleteSelection(linked, selectAt(linked, { x: 4, y: 4 })!);
        expect(level.motionSensors).toEqual([]);
        expect(validateLevel(level).join(' ')).toContain('sensor-1');
    });
});

describe('resize', () => {
    it('drops a sensor whose device falls off the grid', () => {
        const level = placeSensor(base(), { x: 6, y: 1 }, template);
        expect(resize(level, 5, 8).motionSensors).toEqual([]);
        expect(resize(level, 7, 8).motionSensors).toHaveLength(1);
    });
});

describe('the option controls', () => {
    it('read a sensor back into the same options', () => {
        const sensor = withSensor().motionSensors[0];
        const options = sensorOptions({ ...sensor, name: 'Wache' });
        expect(options).toMatchObject({
            sensorWidth: 3,
            sensorDepth: 3,
            sensorInitiallyActive: true,
            sensorName: 'Wache',
        });
    });
});

describe('parsing', () => {
    it('round-trips a sensor', () => {
        const level = withSensor();
        const result = parseLevel(roundTrip(level));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level).toEqual(level);
    });

    it('rejects an even, zero or missing size', () => {
        for (const patch of [{ width: 2 }, { depth: 0 }, { width: undefined }]) {
            const level = roundTrip(withSensor());
            Object.assign(level.motionSensors[0], patch);
            expect(parseLevel(roundTrip(level)).ok).toBe(false);
        }
    });

    it('rejects the old forbiddenTiles shape', () => {
        const level = roundTrip(base());
        level.motionSensors = [{ sensorId: 's', forbiddenTiles: [], initiallyActive: true }];
        expect(parseLevel(level).ok).toBe(false);
    });
});

describe('validateLevel', () => {
    const problems = (level: Level) =>
        validateLevel({ ...level, goals: [{ kind: 'deliver_all' }] }).join(' | ');

    it('accepts a sensor on plain floor', () => {
        expect(problems(withSensor())).toBe('');
    });

    it('reports a robot starting in an active zone, but not an inactive one', () => {
        const active = placeSensor(base(), { x: 1, y: 1 }, template);
        expect(problems(active)).toContain('startet im Feld');

        const overhead = placeSensor(base(), { x: 0, y: 0 }, { ...template, width: 1, depth: 1 });
        expect(problems(overhead)).toContain('startet im Feld');

        const inactive = placeSensor(base(), { x: 0, y: 0 }, { ...template, initiallyActive: false });
        expect(problems(inactive)).toBe('');
    });

    it('does not mind what lies beneath a sensor', () => {
        const overWall = setTile(withSensor(), { x: 4, y: 4 }, { kind: 'wall' });
        expect(problems(overWall)).toBe('');

        const overPillar = placeDecoration(withSensor(), { x: 4, y: 4 }, 'pillar', 'south');
        expect(problems(overPillar)).toBe('');
    });
});
