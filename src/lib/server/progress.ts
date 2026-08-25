import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { itemProgress, stage, stageItem } from '$lib/server/db/schema';

/**
 * Recording what a student has finished.
 *
 * The row existing *is* the completion, so `markComplete` is an idempotent
 * upsert rather than a flag flip — a student who resets a level and solves it
 * again bumps `attempts` and keeps the original `completedAt`.
 *
 * Note that completion is client-asserted: the engine runs in the browser, so
 * nothing here proves the program actually solved the level. That matches the
 * trust level everywhere else in the app for now, and storing `code` means
 * re-running it server-side later is a feature rather than a migration.
 */

export async function markComplete(
	userId: string,
	itemId: string,
	code?: string | null
): Promise<void> {
	await db
		.insert(itemProgress)
		.values({ userId, itemId, code: code ?? null })
		.onConflictDoUpdate({
			target: [itemProgress.userId, itemProgress.itemId],
			set: {
				attempts: sql`${itemProgress.attempts} + 1`,
				code: code ?? null
			}
		});
}

/** The ids of the items this student has finished in one course. */
export async function loadCompleted(userId: string, courseId: string): Promise<Set<string>> {
	const rows = await db
		.select({ itemId: itemProgress.itemId })
		.from(itemProgress)
		.innerJoin(stageItem, eq(stageItem.id, itemProgress.itemId))
		.innerJoin(stage, eq(stage.id, stageItem.stageId))
		.where(and(eq(itemProgress.userId, userId), eq(stage.courseId, courseId)));

	return new Set(rows.map((row) => row.itemId));
}

/** Completed-item counts per course, for the catalogue's progress bars. */
export async function completionCounts(
	userId: string,
	courseIds: string[]
): Promise<Record<string, number>> {
	if (courseIds.length === 0) return {};

	const rows = await db
		.select({ courseId: stage.courseId, total: sql<number>`count(*)` })
		.from(itemProgress)
		.innerJoin(stageItem, eq(stageItem.id, itemProgress.itemId))
		.innerJoin(stage, eq(stage.id, stageItem.stageId))
		.where(and(eq(itemProgress.userId, userId), inArray(stage.courseId, courseIds)))
		.groupBy(stage.courseId);

	const counts: Record<string, number> = {};
	for (const row of rows) counts[row.courseId] = Number(row.total);
	return counts;
}
