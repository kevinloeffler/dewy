import type { PageServerLoad } from './$types';
import { listCourses } from '$lib/server/courses';
import { completionCounts } from '$lib/server/progress';

/** The catalogue. Only published courses — drafts live in `/admin/courses`. */
export const load: PageServerLoad = async (event) => {
	const courses = await listCourses({ publishedOnly: true });
	const user = event.locals.user;

	return {
		courses,
		signedIn: Boolean(user),
		completed: user ? await completionCounts(user.id, courses.map((c) => c.id)) : {}
	};
};
