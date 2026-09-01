import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { findLevel, findLevelOwner, InvalidLevel, saveLevel } from '$lib/server/levels';
import {
	assertCanEditLevel,
	canEditCourse,
	listLevelShares,
	shareLevel,
	unshareLevel
} from '$lib/server/courses';
import { actorOf, Forbidden, listTeachers } from '$lib/server/users';

export const load: PageServerLoad = async (event) => {
	const level = await findLevel(event.params.id);
	if (!level) error(404, 'No such level.');

	// `null` for a level that predates courses, or one left unassigned.
	const owner = await findLevelOwner(event.params.id);

	// A level reached through a share opens read-only rather than 404 — seeing
	// how a colleague built something is the point of sharing it.
	const actor = actorOf(event);
	const canEdit = owner ? await canEditCourse(actor, owner.courseId) : true;

	return {
		level,
		owner,
		canEdit,
		shares: canEdit ? await listLevelShares(actor, event.params.id) : [],
		teachers: canEdit ? (await listTeachers()).filter((row) => row.id !== actor.user.id) : []
	};
};

export const actions: Actions = {
	save: async (event) => {
		const formData = await event.request.formData();
		const payload = formData.get('level')?.toString();
		if (!payload) return fail(400, { message: 'Nothing to save.' });

		let value: unknown;
		try {
			value = JSON.parse(payload);
		} catch {
			return fail(400, { message: 'The level payload was not valid JSON.' });
		}

		try {
			await assertCanEditLevel(actorOf(event), event.params.id);
			await saveLevel(event.params.id, value);
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			if (cause instanceof InvalidLevel) return fail(400, { message: cause.errors.join('; ') });
			throw cause;
		}

		return { savedAt: Date.now() };
	},

	/**
	 * Lends this level to another teacher as a live link. They can drop it into
	 * one of their stages, where it keeps taking edits made here.
	 */
	share: async (event) => {
		const formData = await event.request.formData();
		const teacherId = formData.get('teacherId')?.toString();
		if (!teacherId) return fail(400, { message: 'Pick a teacher.' });

		try {
			await shareLevel(actorOf(event), event.params.id, teacherId);
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			throw cause;
		}

		return { savedAt: Date.now() };
	},

	unshare: async (event) => {
		const formData = await event.request.formData();
		const teacherId = formData.get('teacherId')?.toString();
		if (!teacherId) return fail(400, { message: 'Pick a teacher.' });

		try {
			await unshareLevel(actorOf(event), event.params.id, teacherId);
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			throw cause;
		}

		return { savedAt: Date.now() };
	}
};
