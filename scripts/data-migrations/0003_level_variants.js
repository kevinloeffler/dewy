/**
 * Flat levels → one-variant documents.
 *
 * A level used to be one world: its layout (`tiles`, `items`, `decorations`,
 * `motionSensors`, `robot`) sat next to its settings. Now the settings are
 * shared and the layout is one of up to nine `variants`. Every stored level
 * becomes a document with exactly the variant it already was, so it plays
 * exactly as before.
 *
 * `decorations` and `instructions` are filled in where a row predates them,
 * the same defaults `parseLevel` reads them with.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
    const rows = /** @type {{ id: string, data: string }[]} */ (
        db.prepare('select id, data from level').all()
    );
    const update = db.prepare('update level set data = ? where id = ?');

    for (const row of rows) {
        const level = JSON.parse(row.data);
        const { tiles, items, decorations, motionSensors, robot, ...settings } = level;

        const document = {
            ...settings,
            instructions: settings.instructions ?? null,
            variants: [
                {
                    id: 'v1',
                    tiles,
                    items,
                    decorations: decorations ?? [],
                    motionSensors,
                    robot,
                },
            ],
        };

        update.run(JSON.stringify(document), row.id);
    }
}
