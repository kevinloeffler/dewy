import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createPlayground, deletePlayground, listPlaygrounds } from '$lib/server/levels';
import { assertCanEditLevel } from '$lib/server/courses';
import { actorOf, Forbidden } from '$lib/server/users';

/**
 * Playgrounds: standalone levels, belonging to no course.
 *
 * The list a teacher builds sketches, one-off challenges and warm-ups in. They
 * are the same rows the course builder edits — a playground is just a `level`
 * with no `item_id` — so `/designer/[id]` is the editor here too, and there is
 * no second authoring path to keep in step.
 *
 * Guarded by `/admin/+layout.server.ts`. Which playground a teacher may touch is
 * the finer question, and `assertCanEditLevel` answers it per level.
 */
export const load: PageServerLoad = async (event) => {
	return { playgrounds: await listPlaygrounds(actorOf(event)) };
};

export const actions: Actions = {
	/** Straight into the designer — an empty grid is nothing to look at in a list. */
	create: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() ?? '';

		const id = await createPlayground(actorOf(event), name);
		return redirect(303, `/designer/${id}`);
	},

	/**
	 * `deletePlayground` refuses a level that turns out to belong to a course, and
	 * one another teacher's stage is borrowing. Both come back as a sentence
	 * rather than a 500.
	 */
	delete: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'Kein Level zum Löschen.' });

		try {
			await assertCanEditLevel(actorOf(event), id);
			await deletePlayground(id);
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			return fail(400, {
				message: cause instanceof Error ? cause.message : 'Dieses Level konnte nicht gelöscht werden.'
			});
		}

		return { deleted: true };
	}
};
