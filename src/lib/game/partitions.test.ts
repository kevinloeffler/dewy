import { describe, expect, it } from 'vitest';
import { emptyLevel } from './editor/operations';
import { coordKey } from './grid';
import type { Direction, Level, Tile } from './level';
import { wallShape } from './partitions';

/** A level from a picture: `#` wall, `g` robot gap, `-`/`|` door, `.` floor. */
function draw(...rows: string[]): Level {
    const level = emptyLevel('test', 'Test', rows[0].length, rows.length);
    rows.forEach((row, y) => [...row].forEach((c, x) => {
        const tile: Tile | null =
            c === '#' ? { kind: 'wall' }
            : c === 'g' ? { kind: 'robot_gap' }
            // Leaves span across the facing: a south-facing door is an
            // east–west doorway.
            : c === '-' ? { kind: 'door', doorId: 'd', facing: 'south' } as Tile
            : c === '|' ? { kind: 'door', doorId: 'd', facing: 'east' } as Tile
            : null;
        if (tile) level.tiles[coordKey({ x, y })] = tile;
    }));
    return level;
}

const arms = (level: Level, x: number, y: number) => [...wallShape(level, { x, y }).arms].sort();
const sorted = (...d: Direction[]) => [...d].sort();

describe('wallShape', () => {
    it('spans a lone wall east to west', () => {
        expect(arms(draw('...', '.#.', '...'), 1, 1)).toEqual(sorted('east', 'west'));
    });

    it('joins a run, and carries each end on to its far edge', () => {
        const level = draw('....', '.##.', '....');
        expect(arms(level, 1, 1)).toEqual(sorted('east', 'west'));
        expect(arms(level, 2, 1)).toEqual(sorted('east', 'west'));
    });

    it('turns a corner and branches a T', () => {
        const level = draw('.....', '.###.', '..#..', '.....');
        expect(arms(level, 1, 1)).toEqual(sorted('east', 'west'));
        expect(arms(level, 2, 1)).toEqual(sorted('east', 'south', 'west'));
        expect(arms(level, 2, 2)).toEqual(sorted('north', 'south'));
        const corner = draw('.....', '.##..', '.#...', '.....');
        expect(arms(corner, 1, 1)).toEqual(sorted('east', 'south'));
    });

    it('fills a thick wall, only from its north-west tile of each 2 × 2', () => {
        const level = draw('....', '.##.', '.##.', '....');
        expect(wallShape(level, { x: 1, y: 1 }).fill).toBe(true);
        expect(wallShape(level, { x: 2, y: 1 }).fill).toBe(false);
        expect(wallShape(level, { x: 1, y: 2 }).fill).toBe(false);
    });

    it('meets a door only along its leaves', () => {
        const level = draw('.....', '.#-#.', '.....');
        expect(arms(level, 1, 1)).toContain('east');
        expect(arms(level, 3, 1)).toContain('west');
        // A wall beside the doorway, not in its line, stays off it.
        const across = draw('.....', '..#..', '..-..', '.....');
        expect(arms(across, 2, 1)).not.toContain('south');
    });

    it('bridges over a robot gap', () => {
        const level = draw('.....', '.#g#.', '.....');
        expect(arms(level, 1, 1)).toContain('east');
        expect(arms(level, 2, 1)).toEqual(sorted('east', 'west'));
    });

    it('reaches the warehouse walls on the north and west edges, without a comb', () => {
        const level = draw('.#..', '....', '##..', '....');
        expect(arms(level, 1, 0)).toContain('north');
        expect(arms(level, 0, 2)).toContain('west');
        // A run along the west edge does not grow an arm per tile.
        const along = draw('#...', '#...', '#...');
        expect(arms(along, 0, 1)).toEqual(sorted('north', 'south'));
    });
});
