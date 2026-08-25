import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createCourse, deleteCourse, listCourses, updateCourse } from '$lib/server/courses';
import { deleteLevel, listUnownedLevels } from '$lib/server/levels';

/**
 * The course list.
 *
 * Unguarded, exactly like `/designer` was — there are no roles yet. The URL is
 * under `/admin` so that adding a guard later is one `+layout.server.ts` rather
 * than an audit of every route.
 */
export const load: PageServerLoad = async () => {
	return {
		courses: await listCourses(),
		unowned: await listUnownedLevels()
	};
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const title = formData.get('title')?.toString() ?? '';

		const id = await createCourse(title, event.locals.user?.id);
		return redirect(303, `/admin/courses/${id}`);
	},

	publish: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'No course to publish.' });

		await updateCourse(id, { published: formData.get('published') === 'true' });
		return { ok: true };
	},

	delete: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'No course to delete.' });

		await deleteCourse(id);
		return { deleted: true };
	},

	/** Only for levels belonging to no course — the rest go through their stage. */
	deleteLevel: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'No level to delete.' });

		await deleteLevel(id);
		return { deleted: true };
	}
};
