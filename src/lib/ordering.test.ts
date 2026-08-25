import { describe, expect, it } from 'vitest';
import { reindex, shift } from './ordering';

const ids = ['a', 'b', 'c', 'd'];

describe('reindex', () => {
	it('moves an id to the requested index', () => {
		expect(reindex(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
		expect(reindex(ids, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
	});

	it('clamps an out-of-range index instead of dropping the id', () => {
		expect(reindex(ids, 'a', -5)).toEqual(ids);
		expect(reindex(ids, 'a', 99)).toEqual(['b', 'c', 'd', 'a']);
	});

	it('is a no-op for an unknown id, so a stale submission cannot corrupt the run', () => {
		expect(reindex(ids, 'zzz', 0)).toEqual(ids);
	});

	it('does not mutate its input', () => {
		const original = [...ids];
		reindex(ids, 'a', 3);
		expect(ids).toEqual(original);
	});

	it('always returns a permutation of the input', () => {
		for (const id of ids) {
			for (let i = -1; i <= ids.length; i++) {
				expect([...reindex(ids, id, i)].sort()).toEqual([...ids].sort());
			}
		}
	});
});

describe('shift', () => {
	it('moves one step in each direction', () => {
		expect(shift(ids, 'c', 'up')).toEqual(['a', 'c', 'b', 'd']);
		expect(shift(ids, 'c', 'down')).toEqual(['a', 'b', 'd', 'c']);
	});

	it('stops at the ends', () => {
		expect(shift(ids, 'a', 'up')).toEqual(ids);
		expect(shift(ids, 'd', 'down')).toEqual(ids);
	});
});
