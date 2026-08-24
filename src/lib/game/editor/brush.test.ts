import { describe, expect, it } from 'vitest';
import {
    BRUSH_GROUPS,
    BRUSH_LABELS,
    brushOptionKeys,
    buildBrush,
    defaultBrushOptions,
    type BrushId,
} from './brush';
import { applyBrush, emptyLevel } from './operations';
import { parseLevel } from './parse';

const ids = BRUSH_GROUPS.flatMap((group) => group.ids);

describe('the palette', () => {
    it('lists every brush exactly once', () => {
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has a label for every brush and no labels for brushes it does not list', () => {
        expect([...ids].sort()).toEqual(Object.keys(BRUSH_LABELS).sort() as BrushId[]);
    });

    it('only asks for options the brush actually reads', () => {
        const options = defaultBrushOptions();
        for (const id of ids) {
            for (const key of brushOptionKeys(id)) {
                expect(options).toHaveProperty(key);
            }
        }
    });
});

describe('buildBrush', () => {
    it('produces a level the parser accepts, for every brush', () => {
        const options = defaultBrushOptions();

        for (const id of ids) {
            const brush = buildBrush(id, options);
            const level = applyBrush(emptyLevel('x', 'X'), brush, { x: 1, y: 1 });

            const result = parseLevel(JSON.parse(JSON.stringify(level)));
            expect(result.ok, `${id} produced an unparseable level`).toBe(true);
        }
    });

    it('threads options into the tile it builds', () => {
        const options = { ...defaultBrushOptions(), direction: 'west' as const, bayColor: null };

        expect(buildBrush('conveyor', options)).toEqual({
            kind: 'tile', tile: { kind: 'conveyor', direction: 'west' },
        });
        expect(buildBrush('drop_off', options)).toEqual({
            kind: 'tile', tile: { kind: 'drop_off', color: null },
        });
        expect(buildBrush('keycard', options)).toEqual({
            kind: 'item', item: { kind: 'keycard', doorId: 'door-1' },
        });
    });
});
