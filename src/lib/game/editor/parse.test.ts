import { describe, expect, it } from 'vitest';
import { parseLevel, parseLevelJson } from './parse';
import { emptyLevel } from './operations';
import { LEVELS } from '../levels';
import { MAX_VARIANTS } from '../level';
import { singleVariant } from '../variants';

/** The shape the browser actually sends: a level that has been through JSON. */
const roundTrip = (level: unknown) => JSON.parse(JSON.stringify(level));

/** An empty one-variant document, as plain JSON. */
const blank = (id = 'x') => roundTrip(singleVariant(emptyLevel(id, id)));

/** `blank()` with `patch` spread over its only variant. */
const withLayout = (patch: Record<string, unknown>) => {
    const document = blank();
    document.variants[0] = { ...document.variants[0], ...patch };
    return document;
};

describe('parseLevel', () => {
    it('round-trips a real level unchanged', () => {
        const tutorial = LEVELS['tutorial-01'];
        const result = parseLevel(roundTrip(tutorial));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level).toEqual(tutorial);
    });

    it('round-trips an empty level unchanged', () => {
        const document = singleVariant(emptyLevel('blank', 'Blank'));
        const result = parseLevel(roundTrip(document));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level).toEqual(document);
    });

    it('round-trips several variants in order', () => {
        const document = blank();
        document.variants.push(
            { ...document.variants[0], id: 'v2', robot: { position: { x: 3, y: 3 }, facing: 'east' } },
            { ...document.variants[0], id: 'v3', tiles: { '1,1': { kind: 'wall' } } },
        );

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.level.variants.map((variant) => variant.id)).toEqual(['v1', 'v2', 'v3']);
            expect(result.level).toEqual(document);
        }
    });

    it('reads a level stored before instructions existed as having none', () => {
        const document = blank('old');
        delete document.instructions;
        const result = parseLevel(document);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.instructions).toBe(null);
    });

    it('round-trips instructions', () => {
        const document = { ...blank('with'), instructions: '# Aufgabe\n\nFahr **vorwärts**.' };
        const result = parseLevel(roundTrip(document));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level).toEqual(document);
    });

    it('accepts every tile kind', () => {
        const document = withLayout({
            tiles: {
                '0,0': { kind: 'wall' },
                '1,0': { kind: 'pit' },
                '2,0': { kind: 'robot_gap' },
                '3,0': { kind: 'goal' },
                '4,0': { kind: 'conveyor', direction: 'north', control: null },
                '5,0': { kind: 'cargo_conveyor', direction: 'west', control: null },
                '6,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south' },
                '0,1': { kind: 'pressure_plate', targetId: 'door-1' },
                '1,1': { kind: 'switch', targetId: 'door-1', initiallyOn: true },
                '2,1': { kind: 'drop_off', color: 'red' },
                '3,1': { kind: 'drop_off', color: null },
            },
        });

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) expect(Object.keys(result.level.variants[0].tiles)).toHaveLength(11);
    });

    it('round-trips a driven belt', () => {
        const control = { beltId: 'belt-1', effect: 'reverse', initiallyOn: false };
        const document = withLayout({
            tiles: { '1,1': { kind: 'conveyor', direction: 'east', control } },
        });

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.variants[0].tiles['1,1']).toEqual({
            kind: 'conveyor', direction: 'east', control,
        });
    });

    it('reads a belt stored before controls existed as undriven', () => {
        // `control` may be missing — rows written
        // before belts could be driven have no key at all.
        const document = withLayout({
            tiles: { '1,1': { kind: 'cargo_conveyor', direction: 'south' } },
        });

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.variants[0].tiles['1,1']).toEqual({
            kind: 'cargo_conveyor', direction: 'south', control: null,
        });
    });

    it('reads a door stored before doors turned as facing south', () => {
        const document = withLayout({
            tiles: { '1,1': { kind: 'door', doorId: 'door-1', initiallyOpen: false } },
        });

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.variants[0].tiles['1,1']).toEqual({
            kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south',
        });
    });

    it('rejects a belt control with an unknown effect', () => {
        const document = withLayout({
            tiles: {
                '1,1': {
                    kind: 'conveyor',
                    direction: 'east',
                    control: { beltId: 'b', effect: 'sideways', initiallyOn: true },
                },
            },
        });

        expect(parseLevel(document).ok).toBe(false);
    });

    it('accepts every decoration kind', () => {
        const kinds = ['pallet', 'shelf', 'pillar', 'guard_rail', 'barrel', 'cone', 'tool_cart'];
        const document = withLayout({
            decorations: kinds.map((kind, i) => ({
                kind, id: `deko-${i}`, position: { x: i, y: 0 }, facing: 'south',
            })),
        });

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.variants[0].decorations).toHaveLength(kinds.length);
    });

    it('reads a variant stored before the warehouse kit as undecorated', () => {
        const document = blank('old');
        delete document.variants[0].decorations;

        const result = parseLevel(document);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.variants[0].decorations).toEqual([]);
    });

    it('rejects a decoration of an unknown kind, or one missing its facing', () => {
        const good = { kind: 'cone', id: 'd1', position: { x: 0, y: 0 }, facing: 'south' };

        expect(parseLevel(withLayout({ decorations: [{ ...good, kind: 'forklift' }] })).ok).toBe(false);
        expect(parseLevel(withLayout({ decorations: [{ ...good, facing: undefined }] })).ok).toBe(false);
        expect(parseLevel(withLayout({ decorations: [good] })).ok).toBe(true);
    });

    it('drops a stored floor tile, keeping `tiles` sparse', () => {
        const result = parseLevel(withLayout({ tiles: { '1,1': { kind: 'floor' } } }));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.variants[0].tiles).toEqual({});
    });
});

describe('parseLevel rejections', () => {
    const broken = (patch: Record<string, unknown>) => parseLevel({ ...blank(), ...patch });
    const brokenLayout = (patch: Record<string, unknown>) => parseLevel(withLayout(patch));

    it('rejects a missing key where the type says `| null`', () => {
        // `JSON.stringify` drops `undefined`, so an absent `description` is
        // exactly the round-trip corruption `| null` exists to prevent.
        const document = blank();
        delete document.description;

        const result = parseLevel(document);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]).toContain('description is missing');
    });

    it('rejects a missing nested key', () => {
        for (const key of ['energy', 'memory'] as const) {
            const document = blank();
            delete document.options[key];
            expect(parseLevel(document).ok).toBe(false);
        }
    });

    it('rejects a pre-split blob still carrying `lineBudget`', () => {
        // These rows are fixed by the one-off backfill in
        // `scripts/migrate-level-options.js`, not by a lenient parser.
        const document = blank();
        delete document.options.energy;
        delete document.options.memory;
        document.options.lineBudget = 15;

        expect(parseLevel(document).ok).toBe(false);
    });

    it('rejects a level stored before variants existed', () => {
        // Rows like this are rewritten by `0003_level_variants`, not read leniently.
        const flat = roundTrip(emptyLevel('x', 'X'));
        const result = parseLevel(flat);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]).toContain('variants is missing');
    });

    it('rejects no variants, too many, and repeated ids', () => {
        expect(broken({ variants: [] }).ok).toBe(false);

        const one = blank().variants[0];
        const many = Array.from({ length: MAX_VARIANTS + 1 }, (_, i) => ({ ...one, id: `v${i + 1}` }));
        expect(broken({ variants: many }).ok).toBe(false);
        expect(broken({ variants: many.slice(0, MAX_VARIANTS) }).ok).toBe(true);

        const result = broken({ variants: [one, { ...one }] });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]).toContain('level.variants[1].id');
    });

    it('rejects wrong primitive types', () => {
        expect(broken({ width: '8' }).ok).toBe(false);
        expect(broken({ width: 8.5 }).ok).toBe(false);
        expect(broken({ width: 0 }).ok).toBe(false);
        expect(broken({ name: null }).ok).toBe(false);
    });

    it('rejects unknown union members', () => {
        expect(brokenLayout({ tiles: { '0,0': { kind: 'lava' } } }).ok).toBe(false);
        expect(broken({ goals: [{ kind: 'win' }] }).ok).toBe(false);
        expect(brokenLayout({ robot: { position: { x: 0, y: 0 }, facing: 'up' } }).ok).toBe(false);
        expect(brokenLayout({ items: [
            { kind: 'crate_colour', id: 'c', position: { x: 0, y: 0 }, color: 'turquoise' },
        ] }).ok).toBe(false);
    });

    it('rejects a malformed tile key', () => {
        expect(brokenLayout({ tiles: { 'a,b': { kind: 'wall' } } }).ok).toBe(false);
        expect(brokenLayout({ tiles: { '1': { kind: 'wall' } } }).ok).toBe(false);
    });

    it('rejects a language stage outside 1–5', () => {
        expect(broken({ options: {
            energy: null, memory: null, showInventory: false, languageStage: 6,
        } }).ok).toBe(false);
    });

    it('rejects non-objects and arrays outright', () => {
        expect(parseLevel(null).ok).toBe(false);
        expect(parseLevel('level').ok).toBe(false);
        expect(parseLevel([]).ok).toBe(false);
    });

    it('names the path that failed', () => {
        const result = brokenLayout({ items: [{ kind: 'crate_grey', id: 5, position: { x: 0, y: 0 } }] });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]).toContain('level.variants[0].items[0].id');
    });
});

describe('parseLevelJson', () => {
    it('parses text', () => {
        expect(parseLevelJson(JSON.stringify(LEVELS['tutorial-01'])).ok).toBe(true);
    });

    it('reports invalid JSON without throwing', () => {
        const result = parseLevelJson('{ not json');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toEqual(['not valid JSON']);
    });
});
