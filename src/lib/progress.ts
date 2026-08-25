import type { CourseOutline, StageItemView, StageView } from '$lib/server/courses';

/**
 * How far a student has got, and what that unlocks.
 *
 * Kept pure and database-free — the gating rule is the sort of thing that gets
 * revised once a class has actually used it ("open a whole stage at a time"),
 * and it should be revisable in one function with a test beside it rather than
 * spread across a query and a page.
 *
 * Two rules stack here. The item rule runs everywhere and opens the course one
 * item at a time. The *stage gate* is opt-in per stage (`stage.gated`) and sits
 * in front of it: a gated stage stays shut, item rule or not, until every level
 * in the stage before it is complete.
 */

export type ItemState = 'locked' | 'available' | 'complete';

/** Why a gated stage is shut. */
export type StageLock = {
	requiredStageId: string;
	requiredStageTitle: string;
	/** Levels still outstanding in that stage. */
	remaining: number;
};

export type CourseProgress = {
	state: Record<string, ItemState>;
	/** One entry per stage — `null` when the stage is open. */
	stageLocks: Record<string, StageLock | null>;
	completedCount: number;
	total: number;
	/** The first item that is neither complete nor locked — the "Continue" target. */
	nextItemId: string | null;
};

/** The course as one ordered run, which is the order a student walks it in. */
export function flattenItems(outline: CourseOutline): StageItemView[] {
	return outline.stages.flatMap((stage) => stage.items);
}

/**
 * Whether the stage in front of a gated one has been cleared.
 *
 * Only levels count. Theory blocks are already unskippable under the item rule,
 * and a checkpoint is about the work a student has *done*, not the pages they
 * have clicked past — so a stage of nothing but theory gates on nothing and the
 * flag is inert in front of it.
 */
function lockFor(previous: StageView, completed: ReadonlySet<string>): StageLock | null {
	const remaining = previous.items.filter(
		(item) => item.kind === 'level' && !completed.has(item.id)
	).length;

	if (remaining === 0) return null;
	return { requiredStageId: previous.id, requiredStageTitle: previous.title, remaining };
}

/**
 * Item *n* is available when it is the first, when *n − 1* is complete, or when
 * it is itself complete — and, on top of that, when its stage's gate is open.
 *
 * That "itself complete" clause is doing real work: it keeps finished items
 * revisitable, and it means inserting a new item into the middle of a stage does
 * not lock a class out of the work they have already done. It survives the gate
 * too, so a teacher turning gating on mid-course never takes finished work away.
 */
export function courseProgress(
	outline: CourseOutline,
	completed: ReadonlySet<string>
): CourseProgress {
	const state: Record<string, ItemState> = {};
	const stageLocks: Record<string, StageLock | null> = {};
	let nextItemId: string | null = null;
	let completedCount = 0;
	let previousItem: StageItemView | null = null;
	let previousStage: StageView | null = null;

	for (const stage of outline.stages) {
		// The first stage has nothing in front of it, so its flag is inert.
		const lock = stage.gated && previousStage ? lockFor(previousStage, completed) : null;
		stageLocks[stage.id] = lock;

		for (const item of stage.items) {
			const isComplete = completed.has(item.id);
			if (isComplete) completedCount++;

			const unlocked =
				isComplete ||
				(lock === null && (previousItem === null || completed.has(previousItem.id)));

			state[item.id] = isComplete ? 'complete' : unlocked ? 'available' : 'locked';

			if (!isComplete && unlocked && nextItemId === null) nextItemId = item.id;
			previousItem = item;
		}

		previousStage = stage;
	}

	return { state, stageLocks, completedCount, total: flattenItems(outline).length, nextItemId };
}

/**
 * What a signed-out visitor sees: everything open, nothing recorded.
 *
 * Gating without an identity would be stricter than the rest of the app — a
 * level at `/level/[id]` needs no account either — and browsing a course is
 * exactly the thing that should stay frictionless. That goes for stage gates as
 * well: there is no progress to gate on.
 */
export function anonymousProgress(outline: CourseOutline): CourseProgress {
	const items = flattenItems(outline);
	const state: Record<string, ItemState> = {};
	for (const item of items) state[item.id] = 'available';

	const stageLocks: Record<string, StageLock | null> = {};
	for (const stage of outline.stages) stageLocks[stage.id] = null;

	return {
		state,
		stageLocks,
		completedCount: 0,
		total: items.length,
		nextItemId: items[0]?.id ?? null
	};
}
