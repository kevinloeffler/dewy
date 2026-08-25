import { describe, expect, it } from 'vitest';
import { parseLevel, parseLevelJson } from './parse';
import { emptyLevel } from './operations';
import { tutorial01 } from '../levels';

/** The shape the browser actually sends: a level that has been through JSON. */
const roundTrip = (level: unknown) => JSON.parse(JSON.stringify(level));

describe('parseLevel', () => {
    it('round-trips a real level unchanged', () => {
        const result = parseLevel(roundTrip(tutorial01));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level).toEqual(tutorial01);
    });

    it('round-trips an empty level unchanged', () => {
        const level = emptyLevel('blank', 'Blank');
        const result = parseLevel(roundTrip(level));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level).toEqual(level);
    });

    it('accepts every tile kind', () => {
        const level = {
            ...roundTrip(emptyLevel('all', 'All')),
            tiles: {
                '0,0': { kind: 'wall' },
                '1,0': { kind: 'pit' },
                '2,0': { kind: 'robot_gap' },
                '3,0': { kind: 'goal' },
                '4,0': { kind: 'conveyor', direction: 'north' },
                '5,0': { kind: 'cargo_conveyor', direction: 'west' },
                '6,0': { kind: 'door', doorId: 'door-1', initiallyOpen: false },
                '0,1': { kind: 'pressure_plate', targetId: 'door-1' },
                '1,1': { kind: 'switch', targetId: 'door-1', initiallyOn: true },
                '2,1': { kind: 'drop_off', color: 'red' },
                '3,1': { kind: 'drop_off', color: null },
            },
        };

        const result = parseLevel(level);
        expect(result.ok).toBe(true);
        if (result.ok) expect(Object.keys(result.level.tiles)).toHaveLength(11);
    });

    it('drops a stored floor tile, keeping `tiles` sparse', () => {
        const level = { ...roundTrip(emptyLevel('x', 'X')), tiles: { '1,1': { kind: 'floor' } } };
        const result = parseLevel(level);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.level.tiles).toEqual({});
    });
});

describe('parseLevel rejections', () => {
    const broken = (patch: Record<string, unknown>) =>
        parseLevel({ ...roundTrip(emptyLevel('x', 'X')), ...patch });

    it('rejects a missing key where the type says `| null`', () => {
        // `JSON.stringify` drops `undefined`, so an absent `description` is
        // exactly the round-trip corruption `| null` exists to prevent.
        const level = roundTrip(emptyLevel('x', 'X'));
        delete level.description;

        const result = parseLevel(level);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]).toContain('description is missing');
    });

    it('rejects a missing nested key', () => {
        for (const key of ['energy', 'memory'] as const) {
            const level = roundTrip(emptyLevel('x', 'X'));
            delete level.options[key];
            expect(parseLevel(level).ok).toBe(false);
        }
    });

    it('rejects a pre-split blob still carrying `lineBudget`', () => {
        // These rows are fixed by the one-off backfill in
        // `scripts/migrate-level-options.js`, not by a lenient parser.
        const level = roundTrip(emptyLevel('x', 'X'));
        delete level.options.energy;
        delete level.options.memory;
        level.options.lineBudget = 15;

        expect(parseLevel(level).ok).toBe(false);
    });

    it('rejects wrong primitive types', () => {
        expect(broken({ width: '8' }).ok).toBe(false);
        expect(broken({ width: 8.5 }).ok).toBe(false);
        expect(broken({ width: 0 }).ok).toBe(false);
        expect(broken({ name: null }).ok).toBe(false);
    });

    it('rejects unknown union members', () => {
        expect(broken({ tiles: { '0,0': { kind: 'lava' } } }).ok).toBe(false);
        expect(broken({ goals: [{ kind: 'win' }] }).ok).toBe(false);
        expect(broken({ robot: { position: { x: 0, y: 0 }, facing: 'up' } }).ok).toBe(false);
        expect(broken({ items: [
            { kind: 'crate_colour', id: 'c', position: { x: 0, y: 0 }, color: 'turquoise' },
        ] }).ok).toBe(false);
    });

    it('rejects a malformed tile key', () => {
        expect(broken({ tiles: { 'a,b': { kind: 'wall' } } }).ok).toBe(false);
        expect(broken({ tiles: { '1': { kind: 'wall' } } }).ok).toBe(false);
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
        const result = broken({ items: [{ kind: 'crate_grey', id: 5, position: { x: 0, y: 0 } }] });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]).toContain('level.items[0].id');
    });
});

describe('parseLevelJson', () => {
    it('parses text', () => {
        expect(parseLevelJson(JSON.stringify(tutorial01)).ok).toBe(true);
    });

    it('reports invalid JSON without throwing', () => {
        const result = parseLevelJson('{ not json');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors).toEqual(['not valid JSON']);
    });
});
