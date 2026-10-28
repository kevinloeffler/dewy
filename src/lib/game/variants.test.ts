import { describe, expect, it } from 'vitest';
import { addVariant, emptyLevel, replaceVariant, setTile } from './editor/operations';
import { effectiveGoals } from './goals';
import { validateDocument, validateLevel } from './rules';
import { documentBayGoals, singleVariant, variantLevel, variantLevels } from './variants';
import type { LevelDocument, Tile } from './level';

const base = () => emptyLevel('test', 'Test');

/** A two-variant document, `paint` applied to each variant's tiles. */
function twoVariants(first: Record<string, Tile>, second: Record<string, Tile>): LevelDocument {
    const document = addVariant(singleVariant(base()), 0);
    const paint = (doc: LevelDocument, index: number, tiles: Record<string, Tile>) => {
        let level = variantLevel(doc, index);
        for (const [key, tile] of Object.entries(tiles)) {
            const [x, y] = key.split(',').map(Number);
            level = setTile(level, { x, y }, tile);
        }
        return replaceVariant(doc, index, level);
    };
    return paint(paint(document, 0, first), 1, second);
}

describe('variantLevel', () => {
    it('flattens the shared settings and one layout into a world', () => {
        const level = setTile(base(), { x: 1, y: 1 }, { kind: 'wall' });
        expect(variantLevel(singleVariant(level), 0)).toEqual(level);
    });

    it('gives each variant its own layout and the same settings', () => {
        const document = twoVariants({ '1,1': { kind: 'wall' } }, { '2,2': { kind: 'pit' } });
        const [first, second] = variantLevels(document);

        expect(first.tiles).toEqual({ '1,1': { kind: 'wall' } });
        expect(second.tiles).toEqual({ '2,2': { kind: 'pit' } });
        expect(second.name).toBe(first.name);
        expect(second.options).toBe(first.options);
    });

    it('refuses a variant that does not exist', () => {
        expect(() => variantLevel(singleVariant(base()), 1)).toThrow(RangeError);
    });
});

describe('goals per variant', () => {
    it('asks each variant only for the bays it has', () => {
        const document = twoVariants(
            { '1,1': { kind: 'drop_off', color: 'red' } },
            { '1,1': { kind: 'drop_off', color: 'blue' } },
        );

        expect(effectiveGoals(variantLevel(document, 0))).toEqual([
            { kind: 'deliver_bays', color: 'red', count: 1 },
        ]);
        expect(effectiveGoals(variantLevel(document, 1))).toEqual([
            { kind: 'deliver_bays', color: 'blue', count: 1 },
        ]);
    });

    it('asks to reach the goal only where a goal tile stands', () => {
        const document = twoVariants(
            { '1,1': { kind: 'goal' } },
            { '1,1': { kind: 'drop_off', color: null } },
        );
        expect(document.goals).toEqual([{ kind: 'reach_goal' }]);

        expect(effectiveGoals(variantLevel(document, 0))).toEqual([{ kind: 'reach_goal' }]);
        expect(effectiveGoals(variantLevel(document, 1))).toEqual([
            { kind: 'deliver_bays', color: null, count: 1 },
        ]);
    });

    it('lists every colour any variant has, measured against the one with most bays', () => {
        const red = { kind: 'drop_off', color: 'red' } as const;
        const document = twoVariants(
            { '1,1': red, '2,1': { kind: 'drop_off', color: null } },
            { '1,1': red, '2,2': red, '3,3': { kind: 'drop_off', color: 'blue' } },
        );

        expect(documentBayGoals(document)).toEqual([
            { color: 'red', total: 2, count: 2, crates: 2 },
            { color: 'blue', total: 1, count: 1, crates: 1 },
            { color: null, total: 1, count: 1, crates: 1 },
        ]);
    });
});

describe('validateDocument', () => {
    it('matches validateLevel for a single variant', () => {
        const level = { ...base(), goals: [] };
        expect(validateDocument(singleVariant(level))).toEqual(validateLevel(level));
    });

    it('names the variant a problem was found in', () => {
        const document = twoVariants(
            { '1,1': { kind: 'goal' } },
            { '1,1': { kind: 'switch', targetId: '', initiallyOn: false } },
        );
        const problems = validateDocument(document);

        expect(problems.some((problem) => problem.startsWith('Variante 2: Der Schalter'))).toBe(true);
        expect(problems.some((problem) => problem.startsWith('Variante 1: Der Schalter'))).toBe(false);
    });

    it('flags a variant with nothing to do', () => {
        const document = twoVariants({ '1,1': { kind: 'goal' } }, {});
        expect(validateDocument(document)).toEqual([
            'Variante 2: Das Level hat keine Ziele und lässt sich nicht abschliessen',
        ]);
    });

    it('flags reach_goal only when no variant has a goal tile', () => {
        const withTile = twoVariants({ '1,1': { kind: 'goal' } }, { '1,1': { kind: 'drop_off', color: null } });
        expect(validateDocument(withTile).join(' ')).not.toContain('kein Zielfeld');

        const without: LevelDocument = { ...singleVariant(base()), goals: [{ kind: 'reach_goal' }] };
        expect(validateDocument(without).join(' ')).toContain('kein Zielfeld');
    });
});
