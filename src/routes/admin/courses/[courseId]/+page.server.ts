import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	addLevelItem,
	addTheoryItem,
	createStage,
	deleteCourse,
	deleteItem,
	deleteStage,
	findCourse,
	InvalidItem,
	moveItem,
	moveStage,
	updateCourse,
	updateStage
} from '$lib/server/courses';
import type { Direction } from '$lib/ordering';

export const load: PageServerLoad = async (event) => {
	const course = await findCourse(event.params.courseId);
	if (!course) error(404, 'No such course.');

	return { course };
};

/** Reads a field that must be present, so each action can bail the same way. */
function required(formData: FormData, name: string): string | null {
	const value = formData.get(name)?.toString();
	return value && value.length > 0 ? value : null;
}

function direction(formData: FormData): Direction {
	return formData.get('direction') === 'up' ? 'up' : 'down';
}

export const actions: Actions = {
	updateCourse: async (event) => {
		const formData = await event.request.formData();
		await updateCourse(event.params.courseId, {
			title: formData.get('title')?.toString() ?? '',
			description: formData.get('description')?.toString() ?? ''
		});
		return { savedAt: Date.now() };
	},

	publish: async (event) => {
		const formData = await event.request.formData();
		await updateCourse(event.params.courseId, {
			published: formData.get('published') === 'true'
		});
		return { savedAt: Date.now() };
	},

	deleteCourse: async (event) => {
		await deleteCourse(event.params.courseId);
		return redirect(303, '/admin/courses');
	},

	addStage: async (event) => {
		const formData = await event.request.formData();
		await createStage(event.params.courseId, formData.get('title')?.toString() ?? '');
		return { savedAt: Date.now() };
	},

	updateStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'No stage to rename.' });

		await updateStage(id, {
			title: formData.get('title')?.toString() ?? '',
			description: formData.get('description')?.toString() ?? ''
		});
		return { savedAt: Date.now() };
	},

	/**
	 * Turns the stage gate on or off.
	 *
	 * Its own action rather than a field on `updateStage`: the checkbox saves the
	 * moment it is ticked, and folding it into the rename form would make the
	 * two settings save each other.
	 */
	gateStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'No stage to gate.' });

		await updateStage(id, { gated: formData.get('gated') === 'true' });
		return { savedAt: Date.now() };
	},

	deleteStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'No stage to delete.' });

		await deleteStage(id);
		return { savedAt: Date.now() };
	},

	moveStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'No stage to move.' });

		await moveStage(id, direction(formData));
		return { savedAt: Date.now() };
	},

	addLevel: async (event) => {
		const formData = await event.request.formData();
		const stageId = required(formData, 'stageId');
		if (!stageId) return fail(400, { message: 'No stage to add to.' });

		const { levelId } = await addLevelItem(stageId, formData.get('name')?.toString() ?? '');
		// Straight into the designer — a blank level is not worth a second click.
		return redirect(303, `/designer/${levelId}`);
	},

	addTheory: async (event) => {
		const formData = await event.request.formData();
		const stageId = required(formData, 'stageId');
		if (!stageId) return fail(400, { message: 'No stage to add to.' });

		const title = formData.get('title')?.toString() ?? '';
		try {
			const itemId = await addTheoryItem(stageId, {
				title,
				// A placeholder body keeps the item valid; the editor is next anyway.
				body: `Write the lesson for “${title.trim() || 'this block'}” here.`
			});
			return redirect(303, `/admin/courses/${event.params.courseId}/theory/${itemId}`);
		} catch (cause) {
			if (cause instanceof InvalidItem) return fail(400, { message: cause.errors.join('; ') });
			throw cause;
		}
	},

	deleteItem: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'No item to delete.' });

		await deleteItem(id);
		return { savedAt: Date.now() };
	},

	moveItem: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'No item to move.' });

		await moveItem(id, direction(formData));
		return { savedAt: Date.now() };
	}
};
