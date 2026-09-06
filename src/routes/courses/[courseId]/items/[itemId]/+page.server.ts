import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canSeeCourse, findCourse, findItem } from '$lib/server/courses';
import { anonymousProgress, courseProgress } from '$lib/progress';
import { loadCompleted, markComplete } from '$lib/server/progress';
import { renderMarkdown } from '$lib/markdown';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	const course = await findCourse(event.params.courseId);
	if (!course || !course.published) error(404, 'Diesen Kurs gibt es nicht.');

	// The same check `/courses/[courseId]` makes, and it has to be made here too:
	// the course page is not on the way to an item, so a typed URL would walk
	// straight past it into a course this student's class was never given.
	if (!(await canSeeCourse(user, course.id))) error(404, 'Diesen Kurs gibt es nicht.');

	const context = await findItem(event.params.courseId, event.params.itemId);
	if (!context) error(404, 'No such item.');

	const progress = user
		? courseProgress(course, await loadCompleted(user.id, course.id))
		: anonymousProgress(course);

	// Signed out, `anonymousProgress` marks everything available, so this only
	// bites a signed-in student who skipped ahead by typing a URL.
	if (progress.state[context.item.id] === 'locked') {
		redirect(303, `/courses/${course.id}`);
	}

	if (context.item.kind === 'level' && !context.level) {
		error(500, 'Diesem Level fehlen seine Daten.');
	}

	return {
		context,
		progress,
		signedIn: Boolean(user),
		// Rendered server-side so the reader works without JS, and by the same
		// function the authoring preview uses.
		html: context.item.kind === 'theory' ? renderMarkdown(context.item.body) : null
	};
};

export const actions: Actions = {
	/**
	 * Records completion and moves on.
	 *
	 * One code path signed in or out: an anonymous visitor still advances, they
	 * just leave no trace. `markComplete` is idempotent, so re-solving is safe.
	 *
	 * The lock and visibility checks are repeated here, and have to be. `load`
	 * only stops a locked or unassigned item being *opened* — a POST aimed
	 * straight at this action skips that entirely, and recording a locked item as
	 * done would unlock everything behind it, which is the one thing the stage
	 * rules exist to prevent.
	 */
	complete: async (event) => {
		const formData = await event.request.formData();

		const user = event.locals.user;
		const course = await findCourse(event.params.courseId);
		if (!course || !course.published) return fail(404, { message: 'Diesen Kurs gibt es nicht.' });
		if (!(await canSeeCourse(user, course.id))) {
			return fail(404, { message: 'Diesen Kurs gibt es nicht.' });
		}

		const context = await findItem(event.params.courseId, event.params.itemId);
		if (!context) return fail(404, { message: 'Dieses Element gibt es nicht.' });

		if (user) {
			const progress = courseProgress(course, await loadCompleted(user.id, course.id));
			if (progress.state[context.item.id] === 'locked') {
				return fail(403, { message: 'Dieses Element ist gesperrt.' });
			}

			await markComplete(user.id, event.params.itemId, formData.get('code')?.toString());
		}

		// A level records in the background and stays put — the student should
		// see their solution finish. Theory advances on the button press.
		if (formData.get('advance') !== 'true') return { savedAt: Date.now() };

		const next = context.nextItemId;
		return redirect(
			303,
			next
				? `/courses/${event.params.courseId}/items/${next}`
				: `/courses/${event.params.courseId}`
		);
	}
};
