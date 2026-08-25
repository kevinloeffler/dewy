import { describe, expect, it } from 'vitest';
import { anonymousProgress, courseProgress, flattenItems } from './progress';
import type { CourseOutline } from '$lib/server/courses';

/** A two-stage course: theory, level, theory. */
function outline(): CourseOutline {
	return {
		id: 'c',
		title: 'Course',
		description: null,
		published: true,
		stages: [
			{
				id: 's1',
				title: 'One',
				description: null,
				position: 0,
				gated: false,
				items: [
					{ id: 'a', kind: 'theory', position: 0, title: 'A', body: 'a' },
					{ id: 'b', kind: 'level', position: 1, levelId: 'lb', name: 'B', description: null }
				]
			},
			{
				id: 's2',
				title: 'Two',
				description: null,
				position: 1,
				gated: false,
				items: [{ id: 'c', kind: 'theory', position: 0, title: 'C', body: 'c' }]
			}
		]
	};
}

describe('flattenItems', () => {
	it('walks stages in order, then items within them', () => {
		expect(flattenItems(outline()).map((i) => i.id)).toEqual(['a', 'b', 'c']);
	});
});

describe('courseProgress', () => {
	it('unlocks only the first item for a fresh student', () => {
		const { state, nextItemId, completedCount } = courseProgress(outline(), new Set());
		expect(state).toEqual({ a: 'available', b: 'locked', c: 'locked' });
		expect(nextItemId).toBe('a');
		expect(completedCount).toBe(0);
	});

	it('unlocks the next item once the previous one is complete', () => {
		const { state, nextItemId } = courseProgress(outline(), new Set(['a']));
		expect(state).toEqual({ a: 'complete', b: 'available', c: 'locked' });
		expect(nextItemId).toBe('b');
	});

	it('unlocks across a stage boundary', () => {
		const { state } = courseProgress(outline(), new Set(['a', 'b']));
		expect(state.c).toBe('available');
	});

	it('reports a finished course with no next item', () => {
		const { state, nextItemId, completedCount } = courseProgress(
			outline(),
			new Set(['a', 'b', 'c'])
		);
		expect(Object.values(state)).toEqual(['complete', 'complete', 'complete']);
		expect(nextItemId).toBeNull();
		expect(completedCount).toBe(3);
	});

	it('keeps a completed item reachable even when the one before it is not done', () => {
		// The case a teacher creates by inserting a new item mid-stage.
		const { state } = courseProgress(outline(), new Set(['c']));
		expect(state.c).toBe('complete');
		expect(state.b).toBe('locked');
	});

	it('points Continue at the first unfinished item, not the last completed one', () => {
		expect(courseProgress(outline(), new Set(['a', 'c'])).nextItemId).toBe('b');
	});

	it('handles a course with no items', () => {
		const empty = { ...outline(), stages: [] };
		expect(courseProgress(empty, new Set())).toEqual({
			state: {},
			stageLocks: {},
			completedCount: 0,
			total: 0,
			nextItemId: null
		});
	});
});

describe('courseProgress with a gated stage', () => {
	/** The same course, with stage two turned into a checkpoint. */
	function gated(): CourseOutline {
		const base = outline();
		return { ...base, stages: [base.stages[0], { ...base.stages[1], gated: true }] };
	}

	it('shuts the stage while a level in the one before it is unfinished', () => {
		// 'a' is the theory block, so the item rule alone would open 'b' — but
		// level 'b' is what the gate in front of stage two waits on.
		const { state, stageLocks } = courseProgress(gated(), new Set(['a']));
		expect(state).toEqual({ a: 'complete', b: 'available', c: 'locked' });
		expect(stageLocks.s2).toEqual({
			requiredStageId: 's1',
			requiredStageTitle: 'One',
			remaining: 1
		});
	});

	it('opens the stage once every level before it is complete', () => {
		const { state, stageLocks } = courseProgress(gated(), new Set(['a', 'b']));
		expect(state.c).toBe('available');
		expect(stageLocks.s2).toBeNull();
	});

	it('ignores unfinished theory in the stage before it', () => {
		// Only 'b', the level, is done — 'a' is theory and does not hold the gate.
		expect(courseProgress(gated(), new Set(['b'])).stageLocks.s2).toBeNull();
	});

	it('keeps work already finished behind a shut gate reachable', () => {
		// What a teacher creates by switching gating on mid-course: 'c' sits in
		// the gated stage and level 'b' in front of it is unfinished, yet the
		// student does not lose a lesson they have already done.
		const { state, stageLocks } = courseProgress(gated(), new Set(['c']));
		expect(stageLocks.s2).not.toBeNull();
		expect(state.c).toBe('complete');
	});

	it('points Continue at the level holding the gate shut', () => {
		expect(courseProgress(gated(), new Set(['a'])).nextItemId).toBe('b');
	});

	it('counts every outstanding level, not just the first', () => {
		const base = gated();
		const stageOne = {
			...base.stages[0],
			items: [
				...base.stages[0].items,
				{ id: 'b2', kind: 'level' as const, position: 2, levelId: 'lb2', name: 'B2', description: null }
			]
		};
		const lock = courseProgress({ ...base, stages: [stageOne, base.stages[1]] }, new Set(['a']))
			.stageLocks.s2;
		expect(lock?.remaining).toBe(2);
	});

	it('leaves the flag inert on the first stage of a course', () => {
		const base = outline();
		const first = { ...base, stages: [{ ...base.stages[0], gated: true }, base.stages[1]] };
		const { state, stageLocks } = courseProgress(first, new Set());
		expect(stageLocks.s1).toBeNull();
		expect(state.a).toBe('available');
	});
});

describe('anonymousProgress', () => {
	it('opens everything and records nothing', () => {
		const { state, completedCount, nextItemId } = anonymousProgress(outline());
		expect(Object.values(state)).toEqual(['available', 'available', 'available']);
		expect(Object.values(anonymousProgress(outline()).stageLocks)).toEqual([null, null]);
		expect(completedCount).toBe(0);
		expect(nextItemId).toBe('a');
	});
});
