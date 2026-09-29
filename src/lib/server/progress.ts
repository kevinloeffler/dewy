import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { itemProgress, stage, stageItem } from '$lib/server/db/schema';
import { findCourse, type CourseOutline } from '$lib/server/courses';
import { courseProgress, flattenItems, type ItemState } from '$lib/progress';

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

/**
 * The program that last solved this item, or `null` if it is unsolved (or was
 * a theory item, which stores none). The level player falls back to it when the
 * browser holds no draft, so a solution follows the student between computers.
 */
export async function loadSavedCode(userId: string, itemId: string): Promise<string | null> {
	const row = await db
		.select({ code: itemProgress.code })
		.from(itemProgress)
		.where(and(eq(itemProgress.userId, userId), eq(itemProgress.itemId, itemId)))
		.get();
	return row?.code ?? null;
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

// ============================================================
// The teacher's view: one class against one course
// ============================================================

/**
 * What a class has done in a course, as the grid a teacher reads.
 *
 * Two things are worth saying about the shape. The **rule** is not restated
 * here: `courseProgress` in `$lib/progress` decides what is locked, available or
 * complete, and it is run once per student over the same outline — so the
 * teacher's grid and the student's course page can never disagree about what a
 * student may open. And the **completions** are fetched in one query for the
 * whole class rather than per student, because a class of thirty against a
 * course of forty items is one table read, not thirty.
 *
 * Note what the table cannot tell us. `item_progress` records completions only —
 * a row appears when a student finishes an item. There is no row for "opened it,
 * got stuck", so an available cell means "not finished", never "not started".
 * `attempts` is the closest thing to a struggle signal we store.
 *
 * Whoever the caller passes is who the grid is about, and every count here is
 * over exactly that list — so the caller decides whether archived students are
 * part of the picture, and no number can be built from a different set than the
 * rows beside it.
 */

export type ItemDone = { completedAt: Date; attempts: number };

export type ClassProgressRow = {
	id: string;
	name: string;
	username: string | null;
	state: Record<string, ItemState>;
	/** Only the finished items, for the cell tooltips. */
	done: Record<string, ItemDone>;
	completedCount: number;
	/** The item this student is on — what "where are they?" means. */
	nextItemId: string | null;
};

export type ClassProgress = {
	outline: CourseOutline;
	rows: ClassProgressRow[];
	/** How many of the class have finished each item — the stall detector. */
	doneByItem: Record<string, number>;
	total: number;
};

export type ProgressStudent = {
	id: string;
	name: string;
	username: string | null;
};

export async function classProgress(
	students: ProgressStudent[],
	courseId: string
): Promise<ClassProgress | null> {
	const outline = await findCourse(courseId);
	if (!outline) return null;

	const rows =
		students.length === 0
			? []
			: await db
					.select({
						userId: itemProgress.userId,
						itemId: itemProgress.itemId,
						completedAt: itemProgress.completedAt,
						attempts: itemProgress.attempts
					})
					.from(itemProgress)
					.innerJoin(stageItem, eq(stageItem.id, itemProgress.itemId))
					.innerJoin(stage, eq(stage.id, stageItem.stageId))
					.where(
						and(
							eq(stage.courseId, courseId),
							inArray(
								itemProgress.userId,
								students.map((student) => student.id)
							)
						)
					);

	const byStudent = new Map<string, Record<string, ItemDone>>();
	for (const row of rows) {
		const done = byStudent.get(row.userId) ?? {};
		done[row.itemId] = { completedAt: row.completedAt, attempts: row.attempts };
		byStudent.set(row.userId, done);
	}

	const doneByItem: Record<string, number> = {};
	for (const item of flattenItems(outline)) doneByItem[item.id] = 0;
	for (const row of rows) doneByItem[row.itemId] = (doneByItem[row.itemId] ?? 0) + 1;

	return {
		outline,
		rows: students.map((student) => {
			const done = byStudent.get(student.id) ?? {};
			const progress = courseProgress(outline, new Set(Object.keys(done)));

			return {
				...student,
				state: progress.state,
				done,
				completedCount: progress.completedCount,
				nextItemId: progress.nextItemId
			};
		}),
		doneByItem,
		total: flattenItems(outline).length
	};
}
