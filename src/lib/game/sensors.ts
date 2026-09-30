import { inBounds, sameCoord } from './grid';
import type { Coord, Level, MotionSensor } from './level';

/**
 * Zone math for `Level.motionSensors`.
 *
 * A sensor is stored as the tile its device hangs over plus the size of the
 * rectangle it watches; this file is the single place that turns those back
 * into tiles. The engine, the renderer and the editor all read it through
 * here, so the zone a teacher sees and the zone that fires never disagree.
 *
 * Pure — no Three.js and no Svelte, like `decorations.ts` next door.
 */

/** Largest zone side the designer offers. Odd, like every zone side. */
export const MAX_SENSOR_SIZE = 11;

/** Every size a zone side may take, smallest first: 1, 3, 5 … */
export const SENSOR_SIZES: number[] = Array.from(
    { length: (MAX_SENSOR_SIZE + 1) / 2 },
    (_, i) => i * 2 + 1,
);

/**
 * Any number onto an odd whole size within 1..`MAX_SENSOR_SIZE`.
 *
 * Odd so the device always sits in the middle: an even zone would have to
 * lean to one side, and which side would be a rule nobody could see.
 */
export function clampSensorSize(n: number): number {
    if (!Number.isFinite(n)) return 1;
    const whole = Math.min(Math.max(Math.round(n), 1), MAX_SENSOR_SIZE);
    return whole % 2 === 1 ? whole : whole - 1;
}

/**
 * Whether `coord` lies inside the sensor's watched rectangle — the tile the
 * device hangs over included, since it hangs from the ceiling and the floor
 * beneath it is as walkable as the rest of its zone.
 */
export function sensorCovers(sensor: MotionSensor, coord: Coord): boolean {
    return Math.abs(coord.x - sensor.position.x) <= (sensor.width - 1) / 2
        && Math.abs(coord.y - sensor.position.y) <= (sensor.depth - 1) / 2;
}

/** The watched tiles that lie on the grid, the device's own included. */
export function sensorZone(level: Level, sensor: MotionSensor): Coord[] {
    const tiles: Coord[] = [];
    const rx = (sensor.width - 1) / 2;
    const ry = (sensor.depth - 1) / 2;
    for (let y = sensor.position.y - ry; y <= sensor.position.y + ry; y++) {
        for (let x = sensor.position.x - rx; x <= sensor.position.x + rx; x++) {
            const coord = { x, y };
            if (!inBounds(level, coord)) continue;
            tiles.push(coord);
        }
    }
    return tiles;
}

/** The sensor whose device hangs over `coord`, or null. */
export function sensorAt(level: Level, coord: Coord): MotionSensor | null {
    return level.motionSensors.find((sensor) => sameCoord(sensor.position, coord)) ?? null;
}
