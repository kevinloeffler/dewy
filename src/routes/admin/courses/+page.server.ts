import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	assertCanEditCourse,
	createCourse,
	deleteCourse,
	listCoursesForTeacher,
	updateCourse
} from '$lib/server/courses';
import { actorOf, Forbidden } from '$lib/server/users';

/**
 * The course list.
 *
 * Guarded by `/admin/+layout.server.ts` — the one file this route's own comment
 * predicted. What a teacher sees is split in two: the courses they can edit, and
 * the ones colleagues shared with them as live read-only clones.
 */
export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);
	const { owned, shared } = await listCoursesForTeacher(actor);

	return { courses: owned, shared };
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const title = formData.get('title')?.toString() ?? '';

		const id = await createCourse(title, actorOf(event).user.id);
		return redirect(303, `/admin/courses/${id}`);
	},

	publish: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'Kein Kurs zum Veröffentlichen.' });

		try {
			await assertCanEditCourse(actorOf(event), id);
			await updateCourse(id, { published: formData.get('published') === 'true' });
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			throw cause;
		}

		return { ok: true };
	},

	delete: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'Kein Kurs zum Löschen.' });

		try {
			await assertCanEditCourse(actorOf(event), id);
			await deleteCourse(id);
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			throw cause;
		}

		return { deleted: true };
	}
};
