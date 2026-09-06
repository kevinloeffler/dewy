/**
 * Sibling ordering for stages and stage items.
 *
 * Positions are dense and 0-based within their parent, and a reorder rewrites
 * the whole run. That is O(n) on an n of maybe ten, and it self-heals any drift
 * or duplicate a half-finished write left behind — which a swap-two-rows
 * approach does not.
 *
 * Kept pure and database-free so the rule can be tested without a fixture; the
 * transactional half lives in `server/courses.ts`.
 */

/**
 * Returns `ids` with `id` moved to `toIndex`, clamped into range.
 *
 * The input is never mutated. An `id` that is not present comes back unchanged,
 * so a stale form submission is a no-op rather than an error.
 */
export function reindex(ids: readonly string[], id: string, toIndex: number): string[] {
	const from = ids.indexOf(id);
	if (from === -1) return [...ids];

	const to = Math.max(0, Math.min(ids.length - 1, toIndex));
	if (from === to) return [...ids];

	const next = [...ids];
	next.splice(from, 1);
	next.splice(to, 0, id);
	return next;
}

/**
 * Moves `id` out of `source` and into `target` at `toIndex`.
 *
 * The two runs come back together because a cross-stage move rewrites both, and
 * a caller handed only one of them would leave the other with a hole. Neither
 * input is mutated, and an `id` that is not in `source` comes back as a no-op,
 * so a stale drop cannot corrupt either run.
 *
 * `toIndex` is clamped into `[0, target.length]` — inclusive at the top, unlike
 * `reindex`, because appending past the last row is a real destination here.
 */
export function transfer(
	source: readonly string[],
	target: readonly string[],
	id: string,
	toIndex: number
): { source: string[]; target: string[] } {
	const from = source.indexOf(id);
	if (from === -1) return { source: [...source], target: [...target] };

	const nextSource = [...source];
	nextSource.splice(from, 1);

	const nextTarget = [...target];
	nextTarget.splice(Math.max(0, Math.min(nextTarget.length, toIndex)), 0, id);

	return { source: nextSource, target: nextTarget };
}
