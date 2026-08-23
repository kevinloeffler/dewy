import type { Coord, Direction, Level, Tile, TileKey } from './level';

/**
 * Pure grid math — no Three.js, no Svelte. Shared by the renderer and,
 * later, the engine, so that "what is ahead of the robot" is answered
 * in exactly one place.
 *
 * Grid → scene: `x` is the column (Three.js X) and `y` is the row
 * (Three.js Z). Three.js Y is elevation and never comes from a `Coord`.
 */


// ============================================================
// Tile keys
// ============================================================

export function tileKey(x: number, y: number): TileKey {
    return `${x},${y}`;
}

export function coordKey(c: Coord): TileKey {
    return `${c.x},${c.y}`;
}

export function parseTileKey(key: TileKey): Coord {
    const [x, y] = key.split(',');
    return { x: Number(x), y: Number(y) };
}


// ============================================================
// Directions
// ============================================================

/** North is `-y`: row 0 is the back row, nearest the walls. */
export const DIRECTION_DELTA: Record<Direction, Coord> = {
    north: { x:  0, y: -1 },
    east:  { x:  1, y:  0 },
    south: { x:  0, y:  1 },
    west:  { x: -1, y:  0 },
};

/**
 * Yaw for `group.rotation.y`, in radians.
 *
 * The robot model faces +Z in local space, and rotating +Z by θ about +Y
 * maps it to `(sin θ, 0, cos θ)` — so θ=0 is south and θ=+π/2 is east.
 * Positive yaw is counter-clockwise seen from above, which means
 * `turnRight` *decreases* yaw.
 *
 * Use this for snapping to a known facing (initial placement, reset).
 * Animated turns tween by ±π/2 from the current yaw instead, so they can
 * never take the long way round — see `World`.
 */
export const DIRECTION_YAW: Record<Direction, number> = {
    south:  0,
    east:   Math.PI / 2,
    north:  Math.PI,
    west:  -Math.PI / 2,
};

const TURN_ORDER = ['north', 'east', 'south', 'west'] as const;

export function turn(facing: Direction, side: 'left' | 'right'): Direction {
    const i = TURN_ORDER.indexOf(facing);
    return TURN_ORDER[(i + (side === 'right' ? 1 : 3)) % 4];
}

export function ahead(c: Coord, facing: Direction): Coord {
    const d = DIRECTION_DELTA[facing];
    return { x: c.x + d.x, y: c.y + d.y };
}


// ============================================================
// Level lookups
// ============================================================

export function inBounds(level: Level, c: Coord): boolean {
    return c.x >= 0 && c.y >= 0 && c.x < level.width && c.y < level.height;
}

const FLOOR: Tile = { kind: 'floor' };

/**
 * The tile at `c`, or `null` if `c` is off-world.
 *
 * `Level.tiles` is sparse: a coordinate inside the grid with no entry is
 * plain floor. Always read tiles through this — indexing `level.tiles`
 * directly loses the bounds check and the floor default.
 */
export function tileAt(level: Level, c: Coord): Tile | null {
    if (!inBounds(level, c)) return null;
    return level.tiles[coordKey(c)] ?? FLOOR;
}

export function sameCoord(a: Coord, b: Coord): boolean {
    return a.x === b.x && a.y === b.y;
}
