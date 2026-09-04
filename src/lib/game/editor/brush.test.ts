import { describe, expect, it } from 'vitest';
import {
    BRUSH_GROUPS,
    BRUSH_LABELS,
    brushOptionKeys,
    buildBrush,
    defaultBrushOptions,
    mintedIdKey,
    itemOptions,
    tileOptions,
    type BrushId,
} from './brush';
import { applyBrush, emptyLevel } from './operations';
import { parseLevel } from './parse';
import { validateLevel } from '../rules';

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
            for (const key of brushOptionKeys(id, options)) {
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

    it('only offers belt id and starting value once the belt has a drive', () => {
        const off = defaultBrushOptions();
        expect(brushOptionKeys('conveyor', off)).toEqual(['direction', 'beltEffect']);

        const driven = { ...off, beltEffect: 'power' as const };
        expect(brushOptionKeys('conveyor', driven)).toEqual([
            'direction', 'beltEffect', 'beltId', 'beltInitiallyOn',
        ]);
    });

    it('builds a driven belt from the belt options', () => {
        const options = {
            ...defaultBrushOptions(),
            direction: 'south' as const,
            beltEffect: 'reverse' as const,
            beltId: 'belt-4',
            beltInitiallyOn: false,
        };

        expect(buildBrush('cargo_conveyor', options)).toEqual({
            kind: 'tile',
            tile: {
                kind: 'cargo_conveyor',
                direction: 'south',
                control: { beltId: 'belt-4', effect: 'reverse', initiallyOn: false },
            },
        });
    });

    it('paints a control with no link, and the level says so', () => {
        // Nothing to point at yet, so the palette invents nothing: the switch
        // is painted unlinked and the validator asks for a link.
        expect(buildBrush('switch', defaultBrushOptions())).toEqual({
            kind: 'tile',
            tile: { kind: 'switch', targetId: '', initiallyOn: false },
        });

        const level = applyBrush(emptyLevel('x', 'X'), buildBrush('switch', defaultBrushOptions()), {
            x: 1,
            y: 1,
        });

        expect(validateLevel(level)).toContain('Der Schalter bei 1,1 ist mit nichts verknüpft');
    });

    it('threads options into the tile it builds', () => {
        const options = { ...defaultBrushOptions(), direction: 'west' as const, bayColor: null };

        expect(buildBrush('conveyor', options)).toEqual({
            kind: 'tile', tile: { kind: 'conveyor', direction: 'west', control: null },
        });
        expect(buildBrush('drop_off', options)).toEqual({
            kind: 'tile', tile: { kind: 'drop_off', color: null },
        });
        expect(buildBrush('keycard', options)).toEqual({
            kind: 'item', item: { kind: 'keycard', doorId: 'door-1' },
        });
    });
});


describe('mintedIdKey', () => {
    it('names only the brushes that author an id of their own', () => {
        const off = defaultBrushOptions();
        const driven = { ...off, beltEffect: 'power' as const };

        expect(mintedIdKey('door', off)).toBe('doorId');
        expect(mintedIdKey('cargo_conveyor', driven)).toBe('beltId');

        // A belt nothing drives has no id, and a keycard or a switch only
        // points at a name something else already carries.
        expect(mintedIdKey('conveyor', off)).toBe(null);
        expect(mintedIdKey('keycard', off)).toBe(null);
        expect(mintedIdKey('switch', off)).toBe(null);
    });
});

describe('tileOptions', () => {
    it('reads back every option a tile carries, so buildBrush rebuilds it', () => {
        const options = {
            ...defaultBrushOptions(),
            direction: 'west' as const,
            beltEffect: 'reverse' as const,
            beltId: 'belt-7',
            beltInitiallyOn: false,
            doorId: 'door-3',
            initiallyOpen: true,
            targetId: 'belt-7',
            initiallyOn: true,
            bayColor: null,
            crateColor: 'blue' as const,
        };

        for (const id of ids) {
            const brush = buildBrush(id, options);
            if (brush.kind === 'tile') {
                expect(buildBrush(id, tileOptions(brush.tile)), id).toEqual(brush);
            } else if (brush.kind === 'item') {
                // Items only differ from their template by id and position.
                const item = { ...brush.item, id: 'x', position: { x: 0, y: 0 } };
                expect(buildBrush(id, itemOptions(item)), id).toEqual(brush);
            }
        }
    });

    it('keeps the last-used values for anything the tile does not carry', () => {
        const base = { ...defaultBrushOptions(), direction: 'south' as const, doorId: 'door-9' };

        expect(tileOptions({ kind: 'wall' }, base)).toBe(base);
        expect(tileOptions({ kind: 'pressure_plate', targetId: 'door-1' }, base)).toEqual({
            ...base,
            targetId: 'door-1',
        });
    });
});
