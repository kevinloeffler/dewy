import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { level as levelTable } from '$lib/server/db/schema';
import { emptyLevel } from '$lib/game/editor/operations';
import { parseLevel } from '$lib/game/editor/parse';
import type { Level } from '$lib/game/level';

/**
 * Reading and writing authored levels.
 *
 * Everything that writes goes through `parseLevel` first: `Level` is a
 * compile-time type, and the payload arriving from `/designer` is just a JSON
 * string in a form field until something walks it.
 */

export type LevelSummary = {
    id: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    updatedAt: Date;
};

export class InvalidLevel extends Error {
    constructor(readonly errors: string[]) {
        super(`invalid level: ${errors.join('; ')}`);
    }
}

export async function listLevels(): Promise<LevelSummary[]> {
    const rows = await db.select().from(levelTable).orderBy(levelTable.name);
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        width: row.data.width,
        height: row.data.height,
        updatedAt: row.updatedAt,
    }));
}

export async function findLevel(id: string): Promise<Level | null> {
    const [row] = await db.select().from(levelTable).where(eq(levelTable.id, id)).limit(1);
    if (!row) return null;

    // A row written before a schema change could no longer parse. Surfacing
    // that as "not found" would hide the real problem, so let it throw.
    const result = parseLevel(row.data);
    if (!result.ok) throw new InvalidLevel(result.errors);
    return result.level;
}

export async function createLevel(name: string): Promise<string> {
    const id = crypto.randomUUID();
    const data = emptyLevel(id, name.trim() || 'Untitled level');

    await db.insert(levelTable).values({
        id,
        name: data.name,
        description: data.description,
        data,
    });

    return id;
}

/** Overwrites the level at `id`. Throws `InvalidLevel` if the payload is malformed. */
export async function saveLevel(id: string, value: unknown): Promise<Level> {
    const result = parseLevel(value);
    if (!result.ok) throw new InvalidLevel(result.errors);

    // The row id wins — the client must not be able to move a level.
    const data: Level = { ...result.level, id };

    await db
        .update(levelTable)
        .set({
            name: data.name,
            description: data.description,
            data,
            updatedAt: new Date(),
        })
        .where(eq(levelTable.id, id));

    return data;
}

export async function deleteLevel(id: string): Promise<void> {
    await db.delete(levelTable).where(eq(levelTable.id, id));
}
