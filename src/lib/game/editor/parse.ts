import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';
import type {
    BeltControl,
    Coord,
    Direction,
    GoalCondition,
    Item,
    LanguageStage,
    Level,
    LevelOptions,
    MotionSensor,
    Tile,
    TileKey,
} from '$lib/game/level';

/**
 * The trust boundary between the browser and the database.
 *
 * A `Level` is a compile-time type, so anything arriving as JSON — a form
 * action's payload, a pasted file — is `unknown` until it has been walked.
 * This walks it.
 *
 * Two rules matter more than the rest:
 *
 *  - A missing key is an error wherever `level.ts` says `| null`. It uses
 *    `| null` rather than `| undefined` precisely because `JSON.stringify`
 *    drops `undefined` keys, so accepting a missing key here would let a
 *    level quietly change shape every time it round-trips.
 *  - This checks *structure* only. Semantic soundness — a `reach_goal` with
 *    no goal tile, a keycard for a door that does not exist — is
 *    `validateLevel`'s job in `rules.ts`, and those are warnings the designer
 *    shows rather than errors that block a save. A half-built level must
 *    still be saveable.
 */

export type ParseResult =
    | { ok: true; level: Level }
    | { ok: false; errors: string[] };

class ParseError extends Error {
    constructor(path: string, message: string) {
        super(`${path} ${message}`);
    }
}

export function parseLevel(value: unknown): ParseResult {
    try {
        return { ok: true, level: level(value, 'level') };
    } catch (error) {
        if (error instanceof ParseError) return { ok: false, errors: [error.message] };
        throw error;
    }
}

/** Convenience for form actions and file imports, which start from text. */
export function parseLevelJson(text: string): ParseResult {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return { ok: false, errors: ['not valid JSON'] };
    }
    return parseLevel(value);
}


// ============================================================
// Primitives
// ============================================================

function object(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ParseError(path, 'must be an object');
    }
    return value as Record<string, unknown>;
}

function field(source: Record<string, unknown>, key: string, path: string): unknown {
    if (!(key in source)) throw new ParseError(`${path}.${key}`, 'is missing');
    return source[key];
}

function array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) throw new ParseError(path, 'must be an array');
    return value;
}

function string(value: unknown, path: string): string {
    if (typeof value !== 'string') throw new ParseError(path, 'must be a string');
    return value;
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new ParseError(path, 'must be a boolean');
    return value;
}

function integer(value: unknown, path: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new ParseError(path, 'must be a whole number');
    }
    return value;
}

function positiveInteger(value: unknown, path: string): number {
    const n = integer(value, path);
    if (n < 1) throw new ParseError(path, 'must be at least 1');
    return n;
}

/**
 * The one exception to the rule above, for a field added after levels were
 * already in the database.
 *
 * Reading is tolerant — a row written before belts could be driven has no
 * `control` key and means `null`. Writing stays strict: `buildBrush` always
 * emits the field, so a level saved once is fully shaped and never drifts
 * again. Reach for this only when there really are stored rows without the key.
 */
function optional<T>(
    source: Record<string, unknown>,
    key: string,
    path: string,
    parse: (value: unknown, path: string) => T,
    fallback: T,
): T {
    if (!(key in source)) return fallback;
    return parse(source[key], `${path}.${key}`);
}

function nullable<T>(
    value: unknown,
    path: string,
    parse: (value: unknown, path: string) => T,
): T | null {
    return value === null ? null : parse(value, path);
}

function literal<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    const text = string(value, path);
    if (!allowed.includes(text as T)) {
        throw new ParseError(path, `must be one of ${allowed.join(', ')}`);
    }
    return text as T;
}


// ============================================================
// Level pieces
// ============================================================

const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
const CRATE_COLOR_NAMES = Object.keys(CRATE_COLORS) as CrateColor[];
const TILE_KEY = /^\d+,\d+$/;

function direction(value: unknown, path: string): Direction {
    return literal(value, path, DIRECTIONS);
}

function crateColor(value: unknown, path: string): CrateColor {
    return literal(value, path, CRATE_COLOR_NAMES);
}

function coord(value: unknown, path: string): Coord {
    const source = object(value, path);
    return {
        x: integer(field(source, 'x', path), `${path}.x`),
        y: integer(field(source, 'y', path), `${path}.y`),
    };
}

const BELT_EFFECTS = ['power', 'reverse'] as const;

function beltControl(value: unknown, path: string): BeltControl {
    const source = object(value, path);
    return {
        beltId: string(field(source, 'beltId', path), `${path}.beltId`),
        effect: literal(field(source, 'effect', path), `${path}.effect`, BELT_EFFECTS),
        initiallyOn: boolean(field(source, 'initiallyOn', path), `${path}.initiallyOn`),
    };
}

function tile(value: unknown, path: string): Tile {
    const source = object(value, path);
    const kind = string(field(source, 'kind', path), `${path}.kind`);

    switch (kind) {
        case 'floor':
        case 'pit':
        case 'wall':
        case 'robot_gap':
        case 'goal':
            return { kind };

        case 'conveyor':
        case 'cargo_conveyor':
            return {
                kind,
                direction: direction(field(source, 'direction', path), `${path}.direction`),
                control: optional(
                    source,
                    'control',
                    path,
                    (value, at) => nullable(value, at, beltControl),
                    null,
                ),
            };

        case 'door':
            return {
                kind,
                doorId: string(field(source, 'doorId', path), `${path}.doorId`),
                initiallyOpen: boolean(
                    field(source, 'initiallyOpen', path),
                    `${path}.initiallyOpen`,
                ),
            };

        case 'pressure_plate':
            return {
                kind,
                targetId: string(field(source, 'targetId', path), `${path}.targetId`),
            };

        case 'switch':
            return {
                kind,
                targetId: string(field(source, 'targetId', path), `${path}.targetId`),
                initiallyOn: boolean(field(source, 'initiallyOn', path), `${path}.initiallyOn`),
            };

        case 'drop_off':
            return {
                kind,
                color: nullable(field(source, 'color', path), `${path}.color`, crateColor),
            };

        default:
            throw new ParseError(`${path}.kind`, `is not a tile kind ("${kind}")`);
    }
}

function tiles(value: unknown, path: string): Partial<Record<TileKey, Tile>> {
    const source = object(value, path);
    const result: Partial<Record<TileKey, Tile>> = {};

    for (const [key, entry] of Object.entries(source)) {
        if (!TILE_KEY.test(key)) {
            throw new ParseError(`${path}["${key}"]`, 'is not a "<x>,<y>" tile key');
        }
        const parsed = tile(entry, `${path}["${key}"]`);
        // A stored `floor` would break the sparse-tiles contract the rest of
        // the game relies on, so drop it rather than reject the level.
        if (parsed.kind !== 'floor') result[key as TileKey] = parsed;
    }

    return result;
}

function item(value: unknown, path: string): Item {
    const source = object(value, path);
    const kind = string(field(source, 'kind', path), `${path}.kind`);
    const id = string(field(source, 'id', path), `${path}.id`);
    const position = coord(field(source, 'position', path), `${path}.position`);

    switch (kind) {
        case 'crate_grey':
            return { kind, id, position };
        case 'crate_colour':
            return {
                kind,
                id,
                position,
                color: crateColor(field(source, 'color', path), `${path}.color`),
            };
        case 'keycard':
            return {
                kind,
                id,
                position,
                doorId: string(field(source, 'doorId', path), `${path}.doorId`),
            };
        default:
            throw new ParseError(`${path}.kind`, `is not an item kind ("${kind}")`);
    }
}

function motionSensor(value: unknown, path: string): MotionSensor {
    const source = object(value, path);
    return {
        sensorId: string(field(source, 'sensorId', path), `${path}.sensorId`),
        forbiddenTiles: array(
            field(source, 'forbiddenTiles', path),
            `${path}.forbiddenTiles`,
        ).map((entry, i) => coord(entry, `${path}.forbiddenTiles[${i}]`)),
        initiallyActive: boolean(
            field(source, 'initiallyActive', path),
            `${path}.initiallyActive`,
        ),
    };
}

function options(value: unknown, path: string): LevelOptions {
    const source = object(value, path);
    const stage = integer(field(source, 'languageStage', path), `${path}.languageStage`);
    if (stage < 1 || stage > 5) {
        throw new ParseError(`${path}.languageStage`, 'must be between 1 and 5');
    }

    const energy = nullable(
        field(source, 'energy', path),
        `${path}.energy`,
        positiveInteger,
    );

    const memory = nullable(
        field(source, 'memory', path),
        `${path}.memory`,
        positiveInteger,
    );

    return {
        energy,
        memory,
        showInventory: boolean(field(source, 'showInventory', path), `${path}.showInventory`),
        languageStage: stage as LanguageStage,
    };
}

function goal(value: unknown, path: string): GoalCondition {
    const source = object(value, path);
    const kind = string(field(source, 'kind', path), `${path}.kind`);

    switch (kind) {
        case 'reach_goal':
        case 'deliver_all':
            return { kind };
        case 'deliver_specific':
            return {
                kind,
                color: crateColor(field(source, 'color', path), `${path}.color`),
                dropOffPosition: coord(
                    field(source, 'dropOffPosition', path),
                    `${path}.dropOffPosition`,
                ),
            };
        default:
            throw new ParseError(`${path}.kind`, `is not a goal kind ("${kind}")`);
    }
}

function level(value: unknown, path: string): Level {
    const source = object(value, path);

    const robotSource = object(field(source, 'robot', path), `${path}.robot`);

    return {
        id: string(field(source, 'id', path), `${path}.id`),
        name: string(field(source, 'name', path), `${path}.name`),
        description: nullable(
            field(source, 'description', path),
            `${path}.description`,
            string,
        ),
        width: positiveInteger(field(source, 'width', path), `${path}.width`),
        height: positiveInteger(field(source, 'height', path), `${path}.height`),
        tiles: tiles(field(source, 'tiles', path), `${path}.tiles`),
        items: array(field(source, 'items', path), `${path}.items`).map(
            (entry, i) => item(entry, `${path}.items[${i}]`),
        ),
        motionSensors: array(
            field(source, 'motionSensors', path),
            `${path}.motionSensors`,
        ).map((entry, i) => motionSensor(entry, `${path}.motionSensors[${i}]`)),
        robot: {
            position: coord(
                field(robotSource, 'position', `${path}.robot`),
                `${path}.robot.position`,
            ),
            facing: direction(
                field(robotSource, 'facing', `${path}.robot`),
                `${path}.robot.facing`,
            ),
        },
        options: options(field(source, 'options', path), `${path}.options`),
        goals: array(field(source, 'goals', path), `${path}.goals`).map(
            (entry, i) => goal(entry, `${path}.goals[${i}]`),
        ),
    };
}
