import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { course, level as levelTable, stage, stageItem, user } from '$lib/server/db/schema';
import { emptyLevel } from '$lib/game/editor/operations';
import { parseLevel } from '$lib/game/editor/parse';
import { roleOf } from '$lib/roles';
import type { Actor } from '$lib/server/users';
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

/**
 * A playground in a list: a level plus who wrote it.
 *
 * `ownerName` is null both for a playground whose author has been deleted and
 * for one written before playgrounds had owners. The list says "ohne Besitzer"
 * either way, because either way any teacher may pick it up.
 */
export type PlaygroundSummary = LevelSummary & {
    ownerId: string | null;
    ownerName: string | null;
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
    return emptyLevel(id, name.trim() || 'Level ohne Namen');
}

/**
 * Playgrounds: the standalone levels, belonging to no course. Levels inside a
 * course are reached through their stage instead.
 *
 * An admin sees every one. A teacher sees their own plus the ownerless ones —
 * levels that predate `owner_id`, or whose author's account is gone — which
 * `assertCanEditLevel` lets any teacher adopt, so hiding them would strand
 * them. Levels a colleague *shared* are not here; those are listed where they
 * are used, in the course builder.
 */
export async function listPlaygrounds(actor: Actor): Promise<PlaygroundSummary[]> {
    const mine = roleOf(actor.user) === 'admin'
        ? undefined
        : or(isNull(levelTable.ownerId), eq(levelTable.ownerId, actor.user.id));

    const rows = await db
        .select({ level: levelTable, ownerName: user.name })
        .from(levelTable)
        .leftJoin(user, eq(user.id, levelTable.ownerId))
        .where(mine ? and(isNull(levelTable.itemId), mine) : isNull(levelTable.itemId))
        .orderBy(asc(levelTable.name));

    return rows.map(({ level: row, ownerName }) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        width: row.data.width,
        height: row.data.height,
        updatedAt: row.updatedAt,
        ownerId: row.ownerId,
        ownerName: row.ownerId ? ownerName : null,
    }));
}

/**
 * Creates an empty playground owned by `actor`.
 *
 * The counterpart to `courses.addLevelItem`, minus the stage: no item row, so
 * `item_id` stays null and the level is standalone by construction. Nothing to
 * authorize beyond being staff — that is `/admin`'s layout guard — since a
 * teacher making their own level takes nothing from anyone.
 */
export async function createPlayground(actor: Actor, name: string): Promise<string> {
    const id = crypto.randomUUID();
    const trimmed = name.trim() || 'Neues Playground-Level';
    const data = buildEmptyLevel(id, trimmed);

    await db.insert(levelTable).values({
        id,
        ownerId: actor.user.id,
        name: data.name,
        description: data.description,
        data,
    });

    return id;
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
 * Deletes a playground — a level belonging to no course.
 *
 * A level that *is* in a course must be deleted through its stage item instead
 * (`courses.deleteItem`), so the cascade takes both and no empty
 * `kind: 'level'` item is left stranded in the middle of a stage. Deleting one
 * here is refused rather than silently doing half the job.
 *
 * Who may call this is `assertCanEditLevel`'s question, asked by the route.
 */
export async function deletePlayground(id: string): Promise<void> {
    const [row] = await db
        .select({ itemId: levelTable.itemId })
        .from(levelTable)
        .where(eq(levelTable.id, id))
        .limit(1);

    if (!row) return;
    if (row.itemId) {
        throw new Error('Dieses Level gehört zu einem Kurs — entferne es stattdessen aus seinem Kapitel.');
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
        throw new Error('Ein anderer Kurs verwendet dieses Level — heb dort zuerst die Freigabe auf.');
    }

    await db.delete(levelTable).where(eq(levelTable.id, id));
}
