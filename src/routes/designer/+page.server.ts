import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Levels are no longer created standalone — every level belongs to a stage, so
 * the place to make one is the course builder.
 *
 * `/designer/[id]` is unchanged and still the level editor; only this index is
 * gone. Levels authored before courses existed keep working at their own URL and
 * are listed under "Unassigned levels" in the builder.
 */
export const load: PageServerLoad = async () => {
	redirect(307, '/admin/courses');
};
