import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findLevel } from '$lib/server/levels';
import { tutorial01 } from '$lib/game/levels';

/**
 * `?level=<id>` plays a level authored in `/designer`; without it the
 * playground keeps loading the built-in tutorial, which needs no database.
 */
export const load: PageServerLoad = async (event) => {
	const id = event.url.searchParams.get('level');
	if (!id) return { level: tutorial01 };

	const level = await findLevel(id);
	if (!level) error(404, 'Dieses Level gibt es nicht.');

	return { level };
};
