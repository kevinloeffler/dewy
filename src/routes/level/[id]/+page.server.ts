import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findLevel } from '$lib/server/levels';
import { getLevel } from '$lib/game/levels';

/**
 * Playing a single level.
 *
 * Built-in levels win on id: they are TypeScript modules, so `/level/tutorial-01`
 * has to work on an install whose database is still empty. Everything else is
 * a level authored in `/designer`.
 */
export const load: PageServerLoad = async ({ params }) => {
	const builtIn = getLevel(params.id);
	if (builtIn) return { level: builtIn };

	const level = await findLevel(params.id);
	if (!level) error(404, 'No such level.');

	return { level };
};
