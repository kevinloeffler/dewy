import type { Coord, Direction, Level, Tile } from './level';
import { ahead, tileAt } from './grid';

/**
 * How an indoor wall is drawn: not as a solid block per tile but as a slim
 * partition along the tile's centre lines, joining up with the wall tiles
 * around it — the same idea as `railConnections` for guard rails. A run of
 * wall tiles therefore reads as one wall, and a corner or a T falls out of
 * the same rule.
 *
 * Pure, like `decorations.ts`: `models/tiles.ts` draws what this answers.
 */

export type WallShape = {
    /** The tile edges the partition reaches, from the centre. */
    arms: Direction[];
    /**
     * Fill the square between this tile's centre and its south-east
     * neighbours' — true when all four tiles of that 2 × 2 block are walls.
     * Without it a thick wall would draw as a grid of hollow squares.
     */
    fill: boolean;
};

const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

const OPPOSITE: Record<Direction, Direction> = {
    north: 'south', south: 'north', east: 'west', west: 'east',
};

/** The axis a door's leaves span: across its facing. */
function doorAxis(facing: Direction): Direction[] {
    return facing === 'north' || facing === 'south' ? ['east', 'west'] : ['north', 'south'];
}

/**
 * Whether a partition reaching `direction` should join `neighbour`. Walls
 * and robot gaps always do; a door only along the line of its leaves, so a
 * wall meets it at its frame and never runs across the doorway.
 */
function joins(neighbour: Tile | null, direction: Direction): boolean {
    if (!neighbour) return false;
    if (neighbour.kind === 'wall' || neighbour.kind === 'robot_gap') return true;
    if (neighbour.kind === 'door') return doorAxis(neighbour.facing).includes(direction);
    return false;
}

export function wallShape(level: Level, coord: Coord): WallShape {
    const arms = DIRECTIONS.filter((d) => joins(tileAt(level, ahead(coord, d)), d));

    // The warehouse's own walls stand along the north and west edges. A
    // partition reaching them joins them — unless it runs alongside, where
    // an arm per tile would draw a comb.
    const alongNorthSouth = arms.includes('north') || arms.includes('south');
    const alongEastWest = arms.includes('east') || arms.includes('west');
    if (coord.x === 0 && !alongNorthSouth) arms.push('west');
    if (coord.y === 0 && !alongEastWest) arms.push('north');

    // A lone wall still spans its tile; a run's last tile reaches its far
    // edge, so a run of walls always covers whole tiles.
    if (arms.length === 0) arms.push('east', 'west');
    if (arms.length === 1) arms.push(OPPOSITE[arms[0]]);

    const isWall = (dx: number, dy: number) =>
        tileAt(level, { x: coord.x + dx, y: coord.y + dy })?.kind === 'wall';
    const fill = isWall(0, 0) && isWall(1, 0) && isWall(0, 1) && isWall(1, 1);

    return { arms, fill };
}

/** What a wall brush previews: a lone span, the shape it has on its own. */
export const LONE_WALL: WallShape = { arms: ['east', 'west'], fill: false };
