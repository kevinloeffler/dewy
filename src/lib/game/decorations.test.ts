import { describe, expect, it } from 'vitest';
import {
    canTurn,
    clampToGrid,
    decorationAt,
    decorationCovers,
    decorationFits,
    decorationTiles,
    footprintOf,
    railConnections,
} from './decorations';
import { emptyLevel } from './editor/operations';
import type { Decoration, DecorationKind, Direction, Level } from './level';

const piece = (
    kind: DecorationKind,
    x: number,
    y: number,
    facing: Direction = 'south',
    id = `${kind}-${x},${y}`,
): Decoration => ({ kind, id, facing, position: { x, y } });

const world = (decorations: Decoration[], width = 8, height = 8): Level => ({
    ...emptyLevel('test', 'Test', width, height),
    decorations,
});


describe('footprintOf', () => {
    it('leaves a north/south piece alone and turns an east/west one', () => {
        expect(footprintOf('pallet', 'south')).toEqual({ width: 3, depth: 2 });
        expect(footprintOf('pallet', 'north')).toEqual({ width: 3, depth: 2 });
        expect(footprintOf('pallet', 'east')).toEqual({ width: 2, depth: 3 });
        expect(footprintOf('pallet', 'west')).toEqual({ width: 2, depth: 3 });
    });

    it('is a single tile for every 1×1 piece, whichever way it faces', () => {
        for (const kind of ['pillar', 'guard_rail', 'barrel', 'cone', 'tool_cart'] as const) {
            for (const facing of ['north', 'east', 'south', 'west'] as const) {
                expect(footprintOf(kind, facing), kind).toEqual({ width: 1, depth: 1 });
            }
        }
    });

    it('only offers a facing where turning changes what is drawn', () => {
        expect(canTurn('shelf')).toBe(true);
        expect(canTurn('guard_rail')).toBe(true);
        expect(canTurn('barrel')).toBe(false);
        expect(canTurn('pillar')).toBe(false);
    });
});


describe('decorationTiles', () => {
    it('spreads a pallet east and south from its corner', () => {
        expect(decorationTiles(piece('pallet', 2, 3))).toEqual([
            { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 },
            { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 },
        ]);
    });

    it('covers the turned rectangle when the piece is turned', () => {
        expect(decorationTiles(piece('shelf', 1, 1, 'east'))).toEqual([
            { x: 1, y: 1 }, { x: 1, y: 2 },
        ]);
    });

    it('agrees with decorationCovers', () => {
        const shelf = piece('shelf', 4, 2);
        expect(decorationCovers(shelf, { x: 5, y: 2 })).toBe(true);
        expect(decorationCovers(shelf, { x: 6, y: 2 })).toBe(false);
        expect(decorationCovers(shelf, { x: 4, y: 3 })).toBe(false);
    });
});


describe('decorationAt', () => {
    it('finds a piece from any tile it covers, not only its corner', () => {
        const level = world([piece('pallet', 0, 0, 'south', 'p')]);

        expect(decorationAt(level, { x: 0, y: 0 })?.id).toBe('p');
        expect(decorationAt(level, { x: 2, y: 1 })?.id).toBe('p');
        expect(decorationAt(level, { x: 3, y: 1 })).toBeNull();
    });
});


describe('decorationFits', () => {
    it('refuses a piece hanging off the grid', () => {
        const level = world([], 4, 4);
        expect(decorationFits(level, piece('pallet', 1, 2))).toBe(true);
        expect(decorationFits(level, piece('pallet', 2, 2))).toBe(false);
        expect(decorationFits(level, piece('pallet', 1, 3))).toBe(false);
    });

    it('refuses an overlap and allows a touch', () => {
        const level = world([piece('shelf', 2, 2, 'south', 'a')]);

        expect(decorationFits(level, piece('barrel', 3, 2, 'south', 'b'))).toBe(false);
        expect(decorationFits(level, piece('barrel', 4, 2, 'south', 'b'))).toBe(true);
    });

    it('ignores the piece being replaced, so one can be turned in place', () => {
        const shelf = piece('shelf', 2, 2, 'south', 'a');
        const level = world([shelf]);
        const turned = { ...shelf, facing: 'east' as const };

        expect(decorationFits(level, turned)).toBe(false);
        expect(decorationFits(level, turned, 'a')).toBe(true);
    });
});


describe('clampToGrid', () => {
    it('slides a piece back inside, allowing for its facing', () => {
        const level = world([], 5, 5);

        expect(clampToGrid(level, piece('pallet', 4, 4)).position).toEqual({ x: 2, y: 3 });
        expect(clampToGrid(level, piece('pallet', 4, 4, 'east')).position).toEqual({ x: 3, y: 2 });
        expect(clampToGrid(level, piece('pallet', -2, -1)).position).toEqual({ x: 0, y: 0 });
    });

    it('hands back the very same piece when there is nothing to do', () => {
        const level = world([], 5, 5);
        const fine = piece('barrel', 2, 2);
        expect(clampToGrid(level, fine)).toBe(fine);
    });
});


describe('railConnections', () => {
    const rail = (x: number, y: number, facing: Direction = 'south') =>
        piece('guard_rail', x, y, facing, `r-${x},${y}`);

    it('falls back to its own axis while it stands alone', () => {
        expect(railConnections(world([rail(2, 2)]), rail(2, 2))).toEqual(['north', 'south']);
        expect(railConnections(world([rail(2, 2, 'east')]), rail(2, 2, 'east')))
            .toEqual(['east', 'west']);
    });

    it('joins the rails beside it, and only rails', () => {
        const run = [rail(1, 2), rail(2, 2), rail(3, 2)];
        expect(railConnections(world(run), run[1])).toEqual(['east', 'west']);

        // An end post reaches one way only, so a run stops where it stops.
        expect(railConnections(world(run), run[0])).toEqual(['east']);

        const beside = world([rail(1, 2), piece('barrel', 2, 2)]);
        expect(railConnections(beside, rail(1, 2))).toEqual(['north', 'south']);
    });

    it('bends round a corner without being told to', () => {
        const corner = [rail(1, 1), rail(2, 1), rail(2, 2)];
        expect(railConnections(world(corner), corner[1])).toEqual(['south', 'west']);
    });
});
