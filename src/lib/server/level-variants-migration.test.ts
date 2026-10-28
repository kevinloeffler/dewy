import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../../../scripts/data-migrations/0003_level_variants.js';
import { parseLevel } from '$lib/game/editor/parse';
import { emptyLevel, setTile } from '$lib/game/editor/operations';
import { singleVariant } from '$lib/game/variants';
import { tutorial01 } from '$lib/game/levels/tutorial-01';

/**
 * `0003_level_variants` against a throwaway database: whatever it writes has
 * to get past the strict `parseLevel`, or the first page load after a deploy
 * would throw on every level.
 */
function migrate(rows: Record<string, unknown>[]): unknown[] {
    const db = new Database(':memory:');
    db.exec('create table level (id text primary key, data text not null)');
    const insert = db.prepare('insert into level (id, data) values (?, ?)');
    rows.forEach((row, i) => insert.run(`l${i}`, JSON.stringify(row)));

    up(db);

    const out = db.prepare('select data from level order by id').all() as { data: string }[];
    db.close();
    return out.map((row) => JSON.parse(row.data));
}

describe('0003_level_variants', () => {
    it('turns a flat level into the one-variant document it was', () => {
        const levels = [tutorial01, setTile(emptyLevel('b', 'B'), { x: 2, y: 2 }, { kind: 'pit' })];

        for (const [i, migrated] of migrate(levels).entries()) {
            const result = parseLevel(migrated);
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.level).toEqual(singleVariant(levels[i]));
        }
    });

    it('fills in keys a row stored before them never had', () => {
        const { decorations: _, instructions: __, ...old } = emptyLevel('old', 'Old');

        const [migrated] = migrate([old]);
        const result = parseLevel(migrated);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.level.instructions).toBe(null);
            expect(result.level.variants[0].decorations).toEqual([]);
        }
    });
});
