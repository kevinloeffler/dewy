import { BRUSH_LABELS } from './brush';
import { decorationAt, decorationTiles } from '$lib/game/decorations';
import { ahead, coordKey, inBounds, parseTileKey, sameCoord, tileAt } from '$lib/game/grid';
import { linkLabel } from '$lib/game/level';
import type {
    CargoConveyorTile,
    ConveyorTile,
    Coord,
    Decoration,
    Direction,
    FloorTile,
    Item,
    Level,
    PressurePlateTile,
    SwitchTile,
    Tile,
    TileKey,
} from '$lib/game/level';

/**
 * What the select tool picks out of a level.
 *
 * The designer paints one tile at a time, but a level is authored in *things*:
 * a belt is a run of belt tiles, a door is every tile sharing its `doorId`, a
 * wall is a wall. Selecting hands those back as one unit, so a mistake can be
 * undone in a single act instead of erased tile by tile.
 *
 * Pure and coordinate-only — no Svelte and no Three.js — so it tests like the
 * rest of `editor/`. The canvas turns `coords` into outlines; `deleteSelection`
 * in `operations.ts` turns a selection into an edit.
 */

/**
 * Every selection carries two lists of coordinates:
 *
 *  - `coords` — the thing itself. An edit or a delete acts on exactly these.
 *  - `linked` — tiles the thing *drives*, shown as context and never written
 *    to. Only a switch or a plate has any: the door or belt it operates.
 *
 * The tile or item is carried along too, so the palette can offer the
 * settings it was authored with without going back to the level for them.
 */
export type Selection =
    /**
     * A run of tiles that reads as one object. Always at least one coord, and
     * never floor — bare floor selects nothing.
     */
    | { kind: 'tiles'; label: string; coords: Coord[]; linked: Coord[]; tile: Exclude<Tile, FloorTile> }
    /** A single crate or keycard. Items are never grouped — each is its own. */
    | { kind: 'item'; label: string; coords: Coord[]; linked: Coord[]; item: Item }
    /** One piece of furniture, with every tile it covers. */
    | {
          kind: 'decoration';
          label: string;
          coords: Coord[];
          linked: Coord[];
          decoration: Decoration;
      }
    /** The robot's start. Selectable so it can be found, but never deletable. */
    | { kind: 'robot'; label: string; coords: Coord[]; linked: Coord[]; facing: Direction };

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

type BeltTile = ConveyorTile | CargoConveyorTile;

function isBelt(tile: Tile | null): tile is BeltTile {
    return tile?.kind === 'conveyor' || tile?.kind === 'cargo_conveyor';
}


// ============================================================
// Picking
// ============================================================

/**
 * The thing at `coord`, or `null` for bare floor and off-world clicks.
 *
 * Contents win over the tile they stand on, because that is what the click
 * looks like it landed on — to reach the belt under a crate, click the belt
 * somewhere else along its run. Plain floor selects nothing: floor is the
 * absence of a thing, and flood-filling it would light up half the level.
 */
export function selectAt(level: Level, coord: Coord): Selection | null {
    if (!inBounds(level, coord)) return null;

    const item = level.items.find((candidate) => sameCoord(candidate.position, coord));
    if (item) {
        return {
            kind: 'item',
            label: BRUSH_LABELS[item.kind],
            coords: [{ x: item.position.x, y: item.position.y }],
            linked: [],
            item,
        };
    }

    // Before the robot: furniture is solid, so anything sharing a tile with a
    // shelf is a mistake the designer is being shown rather than a stack the
    // click has to choose between.
    const decoration = decorationAt(level, coord);
    if (decoration) {
        return {
            kind: 'decoration',
            label: BRUSH_LABELS[decoration.kind],
            coords: decorationTiles(decoration),
            linked: [],
            decoration,
        };
    }

    if (sameCoord(level.robot.position, coord)) {
        return {
            kind: 'robot',
            label: BRUSH_LABELS.robot,
            coords: [{ ...level.robot.position }],
            linked: [],
            facing: level.robot.facing,
        };
    }

    const tile = tileAt(level, coord);
    if (!tile || tile.kind === 'floor') return null;

    if (tile.kind === 'switch' || tile.kind === 'pressure_plate') {
        return control(level, coord, tile);
    }

    return {
        kind: 'tiles',
        label: tile.kind === 'door' && tile.name
            ? `${BRUSH_LABELS.door} „${tile.name}“`
            : BRUSH_LABELS[tile.kind],
        coords: connected(level, coord, tile),
        linked: [],
        tile,
    };
}

/** Every coord that belongs to the same thing as the tile at `seed`. */
function connected(level: Level, seed: Coord, tile: Tile): Coord[] {
    if (isBelt(tile)) return sortCoords(belt(level, seed));
    if (tile.kind === 'door') {
        return sortCoords(tilesWhere(level, (t) => t.kind === 'door' && t.doorId === tile.doorId));
    }
    return sortCoords(flood(level, seed, (candidate) => sameGroup(tile, candidate)));
}

/**
 * A switch or a pressure plate, together with what it drives.
 *
 * The link between a control and its target is only ever followed *from* the
 * control: clicking a switch brings its door or its belt along, but clicking
 * that belt selects the belt alone. A belt can be driven from several places
 * and a switch has exactly one target, so the switch is the end that names the
 * pair — and the end where showing the whole mechanism is unambiguous.
 *
 * A target that names a motion sensor adds no coords: a sensor is not a tile,
 * and the zone it watches is plain floor that deleting must not touch.
 */
function control(level: Level, seed: Coord, tile: SwitchTile | PressurePlateTile): Selection {
    const targetId = tile.targetId;
    const controls = flood(level, seed, (candidate) => sameGroup(tile, candidate));
    const driven = tilesWhere(
        level,
        (t) => (t.kind === 'door' && t.doorId === targetId)
            || (isBelt(t) && t.control?.beltId === targetId),
    );

    const label = BRUSH_LABELS[tile.kind];
    return {
        kind: 'tiles',
        label: driven.length > 0 ? `${label} → ${linkLabel(level, targetId)}` : label,
        coords: sortCoords(controls),
        linked: sortCoords(driven),
        tile,
    };
}


// ============================================================
// Grouping rules
// ============================================================

/**
 * Whether two tiles of the same kind are the same object when they touch.
 *
 * Only the fields that give a tile its identity count. Two adjacent plates
 * driving different targets are two plates; two adjacent walls are one wall.
 */
function sameGroup(a: Tile, b: Tile): boolean {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
        case 'door':
            return a.doorId === (b as typeof a).doorId;
        case 'pressure_plate':
        case 'switch':
            return a.targetId === (b as typeof a).targetId;
        case 'drop_off':
            return a.color === (b as typeof a).color;
        default:
            return true;
    }
}

/**
 * The run of belt a tile belongs to.
 *
 * Flow is the only rule: a belt tile joins its neighbour when the ride carries
 * on into it — this tile travels into the neighbour, or the neighbour travels
 * into this one. That follows a belt round a corner, and it keeps two parallel
 * lanes apart, since neither of them ever points at the other.
 *
 * A shared `beltId` deliberately does *not* group belts here. Tiles sharing one
 * are driven together, but they can lie anywhere in the level, and a belt run
 * is the thing the designer sees and drags out. The drive is reachable from the
 * switch that owns it — see `control`.
 */
function belt(level: Level, seed: Coord): Coord[] {
    const seen = new Set<TileKey>();
    const found: Coord[] = [];
    const queue: Coord[] = [];

    const push = (coord: Coord) => {
        const key = coordKey(coord);
        if (seen.has(key)) return;
        seen.add(key);
        found.push(coord);
        queue.push(coord);
    };

    push(seed);

    while (queue.length > 0) {
        const coord = queue.shift()!;
        const tile = tileAt(level, coord);
        if (!isBelt(tile)) continue;

        for (const direction of DIRECTIONS) {
            const next = ahead(coord, direction);
            const neighbour = inBounds(level, next) ? tileAt(level, next) : null;
            if (!isBelt(neighbour) || neighbour.kind !== tile.kind) continue;

            const flowsOut = tile.direction === direction;
            const flowsIn = sameCoord(ahead(next, neighbour.direction), coord);
            if (flowsOut || flowsIn) push(next);
        }
    }

    return found;
}


// ============================================================
// Traversal
// ============================================================

/** Orthogonal flood fill from `seed` over every tile `matches` accepts. */
function flood(level: Level, seed: Coord, matches: (tile: Tile) => boolean): Coord[] {
    const seen = new Set<TileKey>([coordKey(seed)]);
    const found: Coord[] = [seed];
    const queue: Coord[] = [seed];

    while (queue.length > 0) {
        const coord = queue.shift()!;
        for (const direction of DIRECTIONS) {
            const next = ahead(coord, direction);
            if (!inBounds(level, next) || seen.has(coordKey(next))) continue;

            const tile = tileAt(level, next);
            if (!tile || !matches(tile)) continue;

            seen.add(coordKey(next));
            found.push(next);
            queue.push(next);
        }
    }

    return found;
}

/** Every authored tile in the level satisfying `matches`, ignoring adjacency. */
function tilesWhere(level: Level, matches: (tile: Tile) => boolean): Coord[] {
    const found: Coord[] = [];
    for (const [key, tile] of Object.entries(level.tiles)) {
        if (tile && matches(tile)) found.push(parseTileKey(key as TileKey));
    }
    return found;
}

/** Reading order, so a selection renders and compares the same way every time. */
function sortCoords(coords: Coord[]): Coord[] {
    return [...coords].sort((a, b) => a.y - b.y || a.x - b.x);
}
