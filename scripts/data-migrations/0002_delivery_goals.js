/**
 * `deliver_specific` goals → `deliver_bays` overrides.
 *
 * Delivery goals used to name one bay by position. Now every bay of every
 * colour must be filled unless a `deliver_bays` goal lowers the number for
 * that colour. To keep each level asking exactly what it asked before, every
 * colour of bay gets an override equal to how many of its bays an old goal
 * named — 0 where none did, including levels that never had a delivery goal —
 * and the override is dropped where that is already all of them.
 *
 * Not idempotent, and cannot be: once migrated, a level that fills every bay
 * stores no override, exactly like a level that never asked for any. The
 * runner guarantees it runs once.
 */
export function up(db) {
    const rows = db.prepare('select id, data from level').all();
    const update = db.prepare('update level set data = ? where id = ?');

    for (const row of rows) {
        const level = JSON.parse(row.data);
        const tiles = level.tiles ?? {};
        const goals = level.goals ?? [];

        // Bays per colour, and how many distinct ones an old goal named.
        // A plain bay is keyed by the string 'null'.
        const totals = new Map();
        for (const tile of Object.values(tiles)) {
            if (tile?.kind !== 'drop_off') continue;
            const color = String(tile.color);
            totals.set(color, (totals.get(color) ?? 0) + 1);
        }

        const named = new Map();
        const seen = new Set();
        for (const goal of goals) {
            if (goal.kind !== 'deliver_specific') continue;
            const key = `${goal.dropOffPosition.x},${goal.dropOffPosition.y}`;
            const tile = tiles[key];
            // A goal on a deleted bay could never be met; it goes.
            if (tile?.kind !== 'drop_off' || seen.has(key)) continue;
            seen.add(key);
            const color = String(tile.color);
            named.set(color, (named.get(color) ?? 0) + 1);
        }

        if (totals.size === 0 && !goals.some((goal) => goal.kind === 'deliver_specific')) continue;

        const kept = goals.filter((goal) => goal.kind !== 'deliver_specific');
        for (const [color, total] of totals) {
            const count = named.get(color) ?? 0;
            if (count >= total) continue;
            kept.push({ kind: 'deliver_bays', color: color === 'null' ? null : color, count });
        }

        level.goals = kept;
        update.run(JSON.stringify(level), row.id);
    }
}
