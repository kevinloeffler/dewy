import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canSeeCourse, findCourse } from '$lib/server/courses';
import { anonymousProgress, courseProgress } from '$lib/progress';
import { loadCompleted } from '$lib/server/progress';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const course = await findCourse(event.params.courseId);

	// An unpublished course is invisible here; it is still editable in /admin.
	// So is a published one that this student's class was not given — 404 rather
	// than 403, because "not for you" and "not there" look the same from a URL.
	if (!course || !course.published) error(404, 'Diesen Kurs gibt es nicht.');
	if (!(await canSeeCourse(user, course.id))) error(404, 'Diesen Kurs gibt es nicht.');

	const progress = user
		? courseProgress(course, await loadCompleted(user.id, course.id))
		: anonymousProgress(course);

	return { course, progress, signedIn: Boolean(user) };
};
