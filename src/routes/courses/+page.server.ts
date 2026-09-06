import type { PageServerLoad } from './$types';
import { listCoursesFor } from '$lib/server/courses';
import { completionCounts } from '$lib/server/progress';
import { isStaff } from '$lib/roles';

/**
 * The catalogue. Only published courses — drafts live in `/admin/courses` — and,
 * for a student, only the ones their classes were assigned.
 */
export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const courses = await listCoursesFor(user);

	return {
		courses,
		signedIn: Boolean(user),
		// An empty list means two different things, so the page has to know which:
		// nothing published yet, or nothing assigned to you yet.
		isStudent: Boolean(user) && !isStaff(user),
		completed: user ? await completionCounts(user.id, courses.map((c) => c.id)) : {}
	};
};
