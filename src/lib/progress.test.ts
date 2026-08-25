import { describe, expect, it } from 'vitest';
import { anonymousProgress, courseProgress, flattenItems } from './progress';
import type { CourseOutline, StageView } from '$lib/server/courses';

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
				ordered: true,
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
				ordered: true,
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

describe('courseProgress with an unordered stage', () => {
	/** Stage two takes its items in any order, and has two of them. */
	function unordered(): CourseOutline {
		const base = outline();
		const second: StageView = {
			...base.stages[1],
			ordered: false,
			items: [
				base.stages[1].items[0],
				{ id: 'd', kind: 'level', position: 1, levelId: 'ld', name: 'D', description: null }
			]
		};
		return { ...base, stages: [base.stages[0], second] };
	}

	/** The same course with an ordered stage three, to watch the handover. */
	function withThird(): CourseOutline {
		const base = unordered();
		const third: StageView = {
			id: 's3',
			title: 'Three',
			description: null,
			position: 2,
			gated: false,
			ordered: true,
			items: [{ id: 'e', kind: 'theory', position: 0, title: 'E', body: 'e' }]
		};
		return { ...base, stages: [...base.stages, third] };
	}

	it('opens every item at once once the stage is reached', () => {
		const { state } = courseProgress(unordered(), new Set(['a', 'b']));
		expect(state.c).toBe('available');
		expect(state.d).toBe('available');
	});

	it('still waits for the stage before it', () => {
		const { state } = courseProgress(unordered(), new Set(['a']));
		expect(state).toEqual({ a: 'complete', b: 'available', c: 'locked', d: 'locked' });
	});

	it('lets its items be taken out of order', () => {
		const { state } = courseProgress(unordered(), new Set(['a', 'b', 'd']));
		expect(state.d).toBe('complete');
		expect(state.c).toBe('available');
	});

	it('points Continue at the first item still outstanding in it', () => {
		expect(courseProgress(unordered(), new Set(['a', 'b', 'd'])).nextItemId).toBe('c');
	});

	it('hands over only when all of it is done, not just the last item', () => {
		// 'd' is last but 'c' is outstanding — with no order to the stage, being
		// past the bottom of it means nothing.
		expect(courseProgress(withThird(), new Set(['a', 'b', 'd'])).state.e).toBe('locked');
		expect(courseProgress(withThird(), new Set(['a', 'b', 'c', 'd'])).state.e).toBe('available');
	});

	it('gates the stage after it on levels, wherever they were taken', () => {
		const base = withThird();
		const gatedThird = { ...base.stages[2], gated: true };
		const course = { ...base, stages: [base.stages[0], base.stages[1], gatedThird] };

		// 'd' is the only level in stage two; 'c' is theory and holds the handover
		// but not the gate.
		expect(courseProgress(course, new Set(['a', 'b', 'd'])).stageLocks.s3).toBeNull();
		expect(courseProgress(course, new Set(['a', 'b'])).stageLocks.s3?.remaining).toBe(1);
	});
});

describe('courseProgress with an empty stage', () => {
	it('passes the stage before it through rather than opening the one after', () => {
		const base = outline();
		const blank: StageView = {
			id: 's-blank',
			title: 'Blank',
			description: null,
			position: 1,
			gated: false,
			ordered: true,
			items: []
		};
		const course = {
			...base,
			stages: [base.stages[0], blank, { ...base.stages[1], position: 2 }]
		};

		expect(courseProgress(course, new Set(['a'])).state.c).toBe('locked');
		expect(courseProgress(course, new Set(['a', 'b'])).state.c).toBe('available');
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
