import type { CourseOutline, StageItemView, StageView } from '$lib/server/courses';

/**
 * How far a student has got, and what that unlocks.
 *
 * Kept pure and database-free — the gating rule is the sort of thing that gets
 * revised once a class has actually used it ("open a whole stage at a time"),
 * and it should be revisable in one function with a test beside it rather than
 * spread across a query and a page.
 *
 * Two questions, asked in this order. *Is the stage open?* — it is, once the
 * stage before it has handed over, and, if the stage is gated (`stage.gated`),
 * once every level in that stage is complete. *Is the item open inside it?* —
 * one at a time top to bottom in an ordered stage (`stage.ordered`, the
 * default), or all at once in one that is not.
 *
 * Both flags are per stage and independent: gating controls the way in,
 * ordering controls the way through.
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
 * Whether a stage lets the student on to the next one.
 *
 * An ordered stage hands over on its last item, which is the rule the course had
 * before any of this was configurable. An unordered stage has no last item in
 * any meaningful sense, so it hands over once all of it is done — otherwise a
 * class could clear one level of a stage they may take in any order and walk
 * straight past the rest.
 *
 * An empty stage hands over whatever it received, so a placeholder a teacher has
 * not filled in yet is transparent rather than a dead end.
 */
function handsOver(stage: StageView, open: boolean, completed: ReadonlySet<string>): boolean {
	if (!open) return false;
	if (stage.items.length === 0) return true;
	if (!stage.ordered) return stage.items.every((item) => completed.has(item.id));

	return completed.has(stage.items[stage.items.length - 1].id);
}

/**
 * Inside an open ordered stage, item *n* is available when it is the first or
 * when *n − 1* is complete. Inside an open unordered one, every item is.
 * Either way an item that is *itself* complete stays available.
 *
 * That last clause is doing real work: it keeps finished items revisitable, and
 * it means inserting a new item into the middle of a stage does not lock a class
 * out of the work they have already done. It outranks both flags, so a teacher
 * changing either one mid-course never takes finished work away.
 */
export function courseProgress(
	outline: CourseOutline,
	completed: ReadonlySet<string>
): CourseProgress {
	const state: Record<string, ItemState> = {};
	const stageLocks: Record<string, StageLock | null> = {};
	let nextItemId: string | null = null;
	let completedCount = 0;
	// Nothing precedes the first stage, so the course starts handed over.
	let handover = true;
	let previousStage: StageView | null = null;

	for (const stage of outline.stages) {
		// The first stage has nothing in front of it, so its gate is inert.
		const lock = stage.gated && previousStage ? lockFor(previousStage, completed) : null;
		stageLocks[stage.id] = lock;

		const open = lock === null && handover;
		let previousItem: StageItemView | null = null;

		for (const item of stage.items) {
			const isComplete = completed.has(item.id);
			if (isComplete) completedCount++;

			const reached =
				!stage.ordered || previousItem === null || completed.has(previousItem.id);
			const unlocked = isComplete || (open && reached);

			state[item.id] = isComplete ? 'complete' : unlocked ? 'available' : 'locked';

			if (!isComplete && unlocked && nextItemId === null) nextItemId = item.id;
			previousItem = item;
		}

		handover = handsOver(stage, open, completed);
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
