import type { Brush, ItemTemplate } from './brush';
import { coordKey, inBounds, parseTileKey, sameCoord } from '$lib/game/grid';
import type {
    Coord,
    Direction,
    GoalCondition,
    Item,
    Level,
    LevelOptions,
    Tile,
    TileKey,
} from '$lib/game/level';

/**
 * Every edit the designer can make, as pure `(level, …) => Level` functions.
 *
 * Nothing here mutates: each operation returns a fresh `Level`, which is what
 * makes undo a plain stack of snapshots. An operation that would change
 * nothing returns the *same reference* instead of an equal copy — the draft
 * uses that identity check to keep a drag across one tile from pushing a
 * hundred identical history entries.
 *
 * No Svelte and no Three.js in this file, so it runs under plain vitest the
 * same way the engine does.
 */


// ============================================================
// Tiles
// ============================================================

/** Field-by-field, so two separately-built `{ kind: 'wall' }` count as equal. */
function sameTile(a: Tile, b: Tile): boolean {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
        case 'conveyor':
        case 'cargo_conveyor':
            return a.direction === (b as typeof a).direction;
        case 'door':
            return a.doorId === (b as typeof a).doorId
                && a.initiallyOpen === (b as typeof a).initiallyOpen;
        case 'pressure_plate':
            return a.targetId === (b as typeof a).targetId;
        case 'switch':
            return a.targetId === (b as typeof a).targetId
                && a.initiallyOn === (b as typeof a).initiallyOn;
        case 'drop_off':
            return a.color === (b as typeof a).color;
        default:
            return true;
    }
}

/**
 * Paint one tile.
 *
 * Painting floor *deletes* the key rather than storing `{ kind: 'floor' }`:
 * `Level.tiles` is sparse by contract and `tileAt` in `grid.ts` already
 * defaults a missing key to floor. Storing it would round-trip through the
 * database as noise.
 */
export function setTile(level: Level, coord: Coord, tile: Tile): Level {
    if (!inBounds(level, coord)) return level;

    const key = coordKey(coord);
    const current = level.tiles[key];

    if (tile.kind === 'floor') {
        if (current === undefined) return level;
        const tiles = { ...level.tiles };
        delete tiles[key];
        return { ...level, tiles };
    }

    if (current && sameTile(current, tile)) return level;
    return { ...level, tiles: { ...level.tiles, [key]: tile } };
}

export function clearTile(level: Level, coord: Coord): Level {
    return setTile(level, coord, { kind: 'floor' });
}


// ============================================================
// Ids
//
// `level.ts` is explicit that item ids must be authored and survive a
// database round-trip — the renderer keys its Three.js objects by them. The
// editor mints one at placement and never touches it again.
// ============================================================

export function nextItemId(level: Level, prefix: string): string {
    const used = new Set(level.items.map((item) => item.id));
    let n = 1;
    while (used.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
}

/** Every `doorId` that has a door tile — what a keycard or trigger can point at. */
export function doorIds(level: Level): string[] {
    const ids = new Set<string>();
    for (const tile of Object.values(level.tiles)) {
        if (tile?.kind === 'door') ids.add(tile.doorId);
    }
    return [...ids].sort();
}

export function nextDoorId(level: Level): string {
    const used = new Set(doorIds(level));
    let n = 1;
    while (used.has(`door-${n}`)) n++;
    return `door-${n}`;
}

/** Coordinates of every drop-off bay, for the `deliver_specific` bay picker. */
export function dropOffBays(level: Level): { coord: Coord; color: string | null }[] {
    const bays: { coord: Coord; color: string | null }[] = [];
    for (const [key, tile] of Object.entries(level.tiles)) {
        if (tile?.kind === 'drop_off') {
            bays.push({ coord: parseTileKey(key as TileKey), color: tile.color });
        }
    }
    return bays.sort((a, b) => a.coord.y - b.coord.y || a.coord.x - b.coord.x);
}


// ============================================================
// Items
// ============================================================

function makeItem(level: Level, coord: Coord, template: ItemTemplate): Item {
    const position = { x: coord.x, y: coord.y };
    switch (template.kind) {
        case 'crate_grey':
            return { kind: 'crate_grey', id: nextItemId(level, 'crate'), position };
        case 'crate_colour':
            return {
                kind: 'crate_colour',
                id: nextItemId(level, 'crate'),
                color: template.color,
                position,
            };
        case 'keycard':
            return {
                kind: 'keycard',
                id: nextItemId(level, 'keycard'),
                doorId: template.doorId,
                position,
            };
    }
}

/** One item per tile — placing on an occupied tile replaces what was there. */
export function placeItem(level: Level, coord: Coord, template: ItemTemplate): Level {
    if (!inBounds(level, coord)) return level;
    const others = level.items.filter((item) => !sameCoord(item.position, coord));
    return { ...level, items: [...others, makeItem({ ...level, items: others }, coord, template)] };
}

export function removeItemAt(level: Level, coord: Coord): Level {
    const items = level.items.filter((item) => !sameCoord(item.position, coord));
    if (items.length === level.items.length) return level;
    return { ...level, items };
}


// ============================================================
// Robot
// ============================================================

export function setRobot(level: Level, coord: Coord, facing: Direction): Level {
    if (!inBounds(level, coord)) return level;
    if (sameCoord(level.robot.position, coord) && level.robot.facing === facing) return level;
    return { ...level, robot: { position: { x: coord.x, y: coord.y }, facing } };
}


// ============================================================
// The one entry point the canvas calls
// ============================================================

export function applyBrush(level: Level, brush: Brush, coord: Coord): Level {
    switch (brush.kind) {
        case 'tile':
            return setTile(level, coord, brush.tile);
        case 'item':
            return placeItem(level, coord, brush.item);
        case 'robot':
            return setRobot(level, coord, brush.facing);
        case 'erase':
            return removeItemAt(clearTile(level, coord), coord);
    }
}


// ============================================================
// Metadata, size, options, goals
// ============================================================

export function setMeta(
    level: Level,
    patch: { name?: string; description?: string | null },
): Level {
    const name = patch.name ?? level.name;
    const description = patch.description === undefined ? level.description : patch.description;
    if (name === level.name && description === level.description) return level;
    return { ...level, name, description };
}

export function setOptions(level: Level, patch: Partial<LevelOptions>): Level {
    const options = { ...level.options, ...patch };
    const o = level.options;
    if (
        options.lineBudget === o.lineBudget
        && options.showInventory === o.showInventory
        && options.languageStage === o.languageStage
    ) {
        return level;
    }
    return { ...level, options };
}

/**
 * Grow or shrink the grid, dropping everything that falls outside.
 *
 * Shrinking is lossy on purpose — the alternative is a level whose items sit
 * off-world, which is exactly what `validateLevel` flags. The robot is clamped
 * rather than dropped, since a level always has exactly one.
 */
export function resize(level: Level, width: number, height: number): Level {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === level.width && h === level.height) return level;

    // `inBounds` wants a whole `Level`; the new grid does not exist yet.
    const within = (c: Coord) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h;

    const tiles: Partial<Record<TileKey, Tile>> = {};
    for (const [key, tile] of Object.entries(level.tiles)) {
        if (!tile) continue;
        if (within(parseTileKey(key as TileKey))) tiles[key as TileKey] = tile;
    }

    return {
        ...level,
        width: w,
        height: h,
        tiles,
        items: level.items.filter((item) => within(item.position)),
        robot: {
            ...level.robot,
            position: {
                x: Math.min(level.robot.position.x, w - 1),
                y: Math.min(level.robot.position.y, h - 1),
            },
        },
        motionSensors: level.motionSensors.map((sensor) => ({
            ...sensor,
            forbiddenTiles: sensor.forbiddenTiles.filter((c) => within(c)),
        })),
        goals: level.goals.filter(
            (goal) => goal.kind !== 'deliver_specific' || within(goal.dropOffPosition),
        ),
    };
}

function sameGoal(a: GoalCondition, b: GoalCondition): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'deliver_specific' && b.kind === 'deliver_specific') {
        return a.color === b.color && sameCoord(a.dropOffPosition, b.dropOffPosition);
    }
    return true;
}

/** `reach_goal` and `deliver_all` are level-wide, so adding a second is a no-op. */
export function addGoal(level: Level, goal: GoalCondition): Level {
    if (level.goals.some((existing) => sameGoal(existing, goal))) return level;
    return { ...level, goals: [...level.goals, goal] };
}

export function removeGoal(level: Level, index: number): Level {
    if (index < 0 || index >= level.goals.length) return level;
    return { ...level, goals: level.goals.filter((_, i) => i !== index) };
}


// ============================================================
// New levels
// ============================================================

export const DEFAULT_WIDTH = 8;
export const DEFAULT_HEIGHT = 8;

/** Open floor, one robot in the corner, nothing else. */
export function emptyLevel(
    id: string,
    name: string,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
): Level {
    return {
        id,
        name,
        description: null,
        width,
        height,
        tiles: {},
        items: [],
        motionSensors: [],
        robot: { position: { x: 0, y: 0 }, facing: 'south' },
        options: { lineBudget: null, showInventory: false, languageStage: 1 },
        goals: [],
    };
}
