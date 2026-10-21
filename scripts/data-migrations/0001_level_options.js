/**
 * `options.lineBudget` → `options.energy` + `options.memory`.
 *
 * Still checks each row rather than trusting that it runs once: databases
 * that predate the runner had this applied by hand.
 */
export function up(db) {
    const rows = db.prepare('select id, data from level').all();
    const update = db.prepare('update level set data = ? where id = ?');

    for (const row of rows) {
        const level = JSON.parse(row.data);
        const options = level.options ?? {};
        if ('energy' in options && 'memory' in options) continue;

        options.energy = 'energy' in options ? options.energy : (options.lineBudget ?? null);
        options.memory = 'memory' in options ? options.memory : null;
        delete options.lineBudget;

        level.options = options;
        update.run(JSON.stringify(level), row.id);
    }
}
