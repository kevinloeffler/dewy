import type { PageServerLoad } from './$types';
import { listCoursesFor } from '$lib/server/courses';
import { completionCounts } from '$lib/server/progress';

/**
 * The catalogue. Only published courses — drafts live in `/admin/courses` — and,
 * for a student who is in a class, only what that class has been assigned.
 */
export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const courses = await listCoursesFor(user?.id);

	return {
		courses,
		signedIn: Boolean(user),
		completed: user ? await completionCounts(user.id, courses.map((c) => c.id)) : {}
	};
};
