import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { findLevel, findLevelOwner, InvalidLevel, saveLevel } from '$lib/server/levels';

export const load: PageServerLoad = async (event) => {
	const level = await findLevel(event.params.id);
	if (!level) error(404, 'No such level.');

	// `null` for a level that predates courses, or one left unassigned.
	return { level, owner: await findLevelOwner(event.params.id) };
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
			await saveLevel(event.params.id, value);
		} catch (cause) {
			if (cause instanceof InvalidLevel) return fail(400, { message: cause.errors.join('; ') });
			throw cause;
		}

		return { savedAt: Date.now() };
	}
};
