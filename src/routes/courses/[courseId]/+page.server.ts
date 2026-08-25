import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findCourse } from '$lib/server/courses';
import { anonymousProgress, courseProgress } from '$lib/progress';
import { loadCompleted } from '$lib/server/progress';

export const load: PageServerLoad = async (event) => {
	const course = await findCourse(event.params.courseId);
	// An unpublished course is invisible here; it is still editable in /admin.
	if (!course || !course.published) error(404, 'No such course.');

	const user = event.locals.user;
	const progress = user
		? courseProgress(course, await loadCompleted(user.id, course.id))
		: anonymousProgress(course);

	return { course, progress, signedIn: Boolean(user) };
};
