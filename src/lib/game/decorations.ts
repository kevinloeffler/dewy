import { ahead, coordKey, inBounds, sameCoord } from './grid';
import type { Coord, Decoration, DecorationKind, Direction, Level, TileKey } from './level';

/**
 * Footprint math for the furniture in `Level.decorations`.
 *
 * A decoration is the one thing in a level that does not fit the "one record
 * per tile" shape: a pallet covers six tiles and a shelf two. It is stored
 * once, as a corner plus a facing, and this file is the single place that
 * turns those two numbers back into the rectangle of tiles it occupies. The
 * renderer, the editor and the engine all read it through here, so what a
 * teacher sees blocked and what stops the robot can never disagree.
 *
 * Pure — no Three.js and no Svelte, like `grid.ts` next door.
 */


// ============================================================
// Footprints
// ============================================================

/** Tiles covered when the piece faces south: `width` along x, `depth` along y. */
export type Footprint = { width: number; depth: number };

const FOOTPRINTS: Record<DecorationKind, Footprint> = {
    pallet:     { width: 3, depth: 2 },
    shelf:      { width: 2, depth: 1 },
    pillar:     { width: 1, depth: 1 },
    guard_rail: { width: 1, depth: 1 },
    barrel:     { width: 1, depth: 1 },
    cone:       { width: 1, depth: 1 },
    tool_cart:  { width: 1, depth: 1 },
};

/**
 * Which kinds are worth offering a facing for.
 *
 * A barrel is a cylinder and a pillar is square: turning either changes
 * nothing anybody can see, and offering the control would only invite a
 * teacher to wonder what it did. A guard rail is on the list because a lone
 * one has to be laid out along *some* axis — once it has a neighbour to join,
 * the run decides for it. See `railConnections`.
 */
const TURNABLE: ReadonlySet<DecorationKind> = new Set<DecorationKind>([
    'pallet',
    'shelf',
    'guard_rail',
    'tool_cart',
]);

export function canTurn(kind: DecorationKind): boolean {
    return TURNABLE.has(kind);
}

/**
 * German name with its indefinite article.
 *
 * These only ever appear mid-sentence — in a crash message and in the
 * designer's warnings — where "da ist ein Regal im Weg" needs the article to
 * read as German at all. The palette's own labels are plain nouns and live
 * with the other brush labels.
 */
export const DECORATION_NAMES: Record<DecorationKind, string> = {
    pallet:     'eine Palette',
    shelf:      'ein Regal',
    pillar:     'eine Säule',
    guard_rail: 'ein Geländer',
    barrel:     'ein Fass',
    cone:       'ein Pylon',
    tool_cart:  'ein Werkzeugwagen',
};

/**
 * The footprint as it lies on the grid once `facing` is applied.
 *
 * North and south leave it alone; east and west turn it a quarter, which
 * swaps the two axes. A piece facing north is its south self seen from
 * behind — same tiles, other side.
 */
export function footprintOf(kind: DecorationKind, facing: Direction): Footprint {
    const { width, depth } = FOOTPRINTS[kind];
    return facing === 'east' || facing === 'west'
        ? { width: depth, depth: width }
        : { width, depth };
}

/** Every tile `decoration` stands on, in reading order. */
export function decorationTiles(decoration: Decoration): Coord[] {
    const { width, depth } = footprintOf(decoration.kind, decoration.facing);
    const tiles: Coord[] = [];
    for (let y = 0; y < depth; y++) {
        for (let x = 0; x < width; x++) {
            tiles.push({ x: decoration.position.x + x, y: decoration.position.y + y });
        }
    }
    return tiles;
}

export function decorationCovers(decoration: Decoration, coord: Coord): boolean {
    const { width, depth } = footprintOf(decoration.kind, decoration.facing);
    const { x, y } = decoration.position;
    return coord.x >= x && coord.x < x + width && coord.y >= y && coord.y < y + depth;
}

/**
 * The decoration standing on `coord`, or null.
 *
 * The only sanctioned way to ask, and the reason nothing else has to know
 * that a decoration is stored by its corner rather than by every tile it
 * covers.
 */
export function decorationAt(level: Level, coord: Coord): Decoration | null {
    return level.decorations.find((decoration) => decorationCovers(decoration, coord)) ?? null;
}


// ============================================================
// Placement
// ============================================================

/**
 * Whether a piece may stand at `position`, ignoring `exceptId`.
 *
 * Two rules: every tile it covers is on the grid, and no other decoration
 * already stands there. `exceptId` is for turning a piece in place — it must
 * not be judged to collide with the version of itself being replaced.
 *
 * Nothing here cares what *tile* is underneath. A pallet on a conveyor belt
 * is a strange level but a legal one, and `validateLevel` is where strange
 * levels get pointed out rather than forbidden.
 */
export function decorationFits(
    level: Level,
    candidate: Decoration,
    exceptId?: string,
): boolean {
    const tiles = decorationTiles(candidate);
    if (!tiles.every((coord) => inBounds(level, coord))) return false;

    const taken = new Set<TileKey>();
    for (const decoration of level.decorations) {
        if (decoration.id === exceptId) continue;
        for (const coord of decorationTiles(decoration)) taken.add(coordKey(coord));
    }

    return tiles.every((coord) => !taken.has(coordKey(coord)));
}

/**
 * Slide a piece back onto the grid so that dropping it near an edge still
 * places something, rather than silently doing nothing.
 *
 * Only the grid is clamped against; an overlap with another decoration is a
 * refusal, because there is no obviously right direction to shove it.
 */
export function clampToGrid(level: Level, candidate: Decoration): Decoration {
    const { width, depth } = footprintOf(candidate.kind, candidate.facing);
    const x = Math.max(0, Math.min(candidate.position.x, level.width - width));
    const y = Math.max(0, Math.min(candidate.position.y, level.height - depth));
    return sameCoord(candidate.position, { x, y })
        ? candidate
        : { ...candidate, position: { x, y } };
}


// ============================================================
// Guard rails
// ============================================================

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

/**
 * Which way a guard rail runs, as the set of neighbours it joins.
 *
 * A rail is drawn as posts at the tile centre with bars reaching towards
 * every neighbouring rail, so a row of them reads as one continuous barrier
 * and a corner bends without the teacher choosing a corner piece. A rail with
 * no neighbour has nothing to reach for, so it falls back to a single span
 * along its own facing — which is the only time a rail's `facing` is visible.
 */
export function railConnections(level: Level, rail: Decoration): Direction[] {
    const joined = DIRECTIONS.filter((direction) => {
        const neighbour = decorationAt(level, ahead(rail.position, direction));
        return neighbour !== null && neighbour.kind === 'guard_rail';
    });

    if (joined.length > 0) return joined;

    const axis: Direction[] = rail.facing === 'east' || rail.facing === 'west'
        ? ['east', 'west']
        : ['north', 'south'];
    return axis;
}
