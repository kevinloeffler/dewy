import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	assertCanEditItem,
	canViewCourse,
	deleteItem,
	findItem,
	InvalidItem,
	updateTheoryItem
} from '$lib/server/courses';
import { actorOf, Forbidden } from '$lib/server/users';

export const load: PageServerLoad = async (event) => {
	if (!(await canViewCourse(actorOf(event), event.params.courseId))) {
		error(404, 'No such theory block.');
	}

	const context = await findItem(event.params.courseId, event.params.itemId);
	if (!context) error(404, 'No such theory block.');
	if (context.item.kind !== 'theory') {
		// A level item is edited in the designer, not here.
		error(400, 'That item is a level, not a theory block.');
	}

	return { context, item: context.item };
};

export const actions: Actions = {
	save: async (event) => {
		const formData = await event.request.formData();

		try {
			await assertCanEditItem(actorOf(event), event.params.itemId);
			await updateTheoryItem(event.params.itemId, {
				title: formData.get('title')?.toString() ?? '',
				body: formData.get('body')?.toString() ?? ''
			});
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			if (cause instanceof InvalidItem) return fail(400, { message: cause.errors.join('; ') });
			throw cause;
		}

		return { savedAt: Date.now() };
	},

	delete: async (event) => {
		try {
			await assertCanEditItem(actorOf(event), event.params.itemId);
			await deleteItem(event.params.itemId);
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			throw cause;
		}

		return redirect(303, `/admin/courses/${event.params.courseId}`);
	}
};
