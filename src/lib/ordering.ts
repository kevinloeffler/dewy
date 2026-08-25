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

export type Direction = 'up' | 'down';

/** `reindex` for the up/down buttons the authoring UI actually uses. */
export function shift(ids: readonly string[], id: string, direction: Direction): string[] {
	const from = ids.indexOf(id);
	if (from === -1) return [...ids];
	return reindex(ids, id, direction === 'up' ? from - 1 : from + 1);
}
