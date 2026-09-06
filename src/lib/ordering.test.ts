import { describe, expect, it } from 'vitest';
import { reindex, transfer } from './ordering';

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

describe('transfer', () => {
	const other = ['x', 'y'];

	it('takes the id out of one run and puts it in the other', () => {
		expect(transfer(ids, other, 'b', 1)).toEqual({
			source: ['a', 'c', 'd'],
			target: ['x', 'b', 'y']
		});
	});

	it('appends when the index is the end of the target', () => {
		expect(transfer(ids, other, 'b', 2)).toEqual({
			source: ['a', 'c', 'd'],
			target: ['x', 'y', 'b']
		});
	});

	it('clamps an out-of-range index instead of dropping the id', () => {
		expect(transfer(ids, other, 'b', -5).target).toEqual(['b', 'x', 'y']);
		expect(transfer(ids, other, 'b', 99).target).toEqual(['x', 'y', 'b']);
	});

	it('moves into an empty run', () => {
		expect(transfer(ids, [], 'a', 0)).toEqual({ source: ['b', 'c', 'd'], target: ['a'] });
	});

	it('is a no-op for an id the source does not hold', () => {
		expect(transfer(ids, other, 'zzz', 0)).toEqual({ source: ids, target: other });
	});

	it('does not mutate its inputs', () => {
		const source = [...ids];
		const target = [...other];
		transfer(ids, other, 'a', 1);
		expect(ids).toEqual(source);
		expect(other).toEqual(target);
	});

	it('keeps every id exactly once across both runs', () => {
		for (const id of ids) {
			for (let i = -1; i <= other.length + 1; i++) {
				const { source, target } = transfer(ids, other, id, i);
				expect([...source, ...target].sort()).toEqual([...ids, ...other].sort());
			}
		}
	});
});
