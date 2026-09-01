import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { course, level as levelTable, stage, stageItem } from '$lib/server/db/schema';
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

/** Where a level sits in the curriculum, for the designer's breadcrumb. */
export type LevelOwner = {
    itemId: string;
    stageId: string;
    stageTitle: string;
    courseId: string;
    courseTitle: string;
};

export class InvalidLevel extends Error {
    constructor(readonly errors: string[]) {
        super(`invalid level: ${errors.join('; ')}`);
    }
}

/**
 * The `Level` a new row starts from.
 *
 * Split out of `createLevel` because `courses.ts` builds a level inside a
 * `db.transaction`, and better-sqlite3 transactions are synchronous — nothing
 * in there can `await`.
 */
export function buildEmptyLevel(id: string, name: string): Level {
    return emptyLevel(id, name.trim() || 'Untitled level');
}

/** Levels belonging to no course. The rest are reached through their stage. */
export async function listUnownedLevels(): Promise<LevelSummary[]> {
    const rows = await db
        .select()
        .from(levelTable)
        .where(isNull(levelTable.itemId))
        .orderBy(levelTable.name);

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

/** The course and stage a level belongs to, or `null` if it belongs to none. */
export async function findLevelOwner(levelId: string): Promise<LevelOwner | null> {
    const [row] = await db
        .select({
            itemId: stageItem.id,
            stageId: stage.id,
            stageTitle: stage.title,
            courseId: course.id,
            courseTitle: course.title,
        })
        .from(levelTable)
        .innerJoin(stageItem, eq(stageItem.id, levelTable.itemId))
        .innerJoin(stage, eq(stage.id, stageItem.stageId))
        .innerJoin(course, eq(course.id, stage.courseId))
        .where(eq(levelTable.id, levelId))
        .limit(1);

    return row ?? null;
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

/**
 * Deletes an unowned level — one belonging to no course.
 *
 * A level that *is* owned must be deleted through its stage item instead
 * (`courses.deleteItem`), so the cascade takes both and no empty
 * `kind: 'level'` item is left stranded in the middle of a stage. Deleting one
 * here is refused rather than silently doing half the job.
 */
export async function deleteLevel(id: string): Promise<void> {
    const [row] = await db
        .select({ itemId: levelTable.itemId })
        .from(levelTable)
        .where(eq(levelTable.id, id))
        .limit(1);

    if (!row) return;
    if (row.itemId) {
        throw new Error('That level belongs to a course — remove it from its stage instead.');
    }

    // A level another teacher's stage is showing live cannot be deleted out from
    // under them. The `restrict` foreign key would refuse anyway; saying so here
    // turns a constraint violation into a sentence.
    const [borrowed] = await db
        .select({ id: stageItem.id })
        .from(stageItem)
        .where(eq(stageItem.linkedLevelId, id))
        .limit(1);

    if (borrowed) {
        throw new Error('Another course is using this level — unshare it there first.');
    }

    await db.delete(levelTable).where(eq(levelTable.id, id));
}
