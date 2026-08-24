import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createLevel, deleteLevel, listLevels } from '$lib/server/levels';

export const load: PageServerLoad = async () => {
	return { levels: await listLevels() };
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() ?? '';

		const id = await createLevel(name);
		return redirect(303, `/designer/${id}`);
	},

	delete: async (event) => {
		const formData = await event.request.formData();
		const id = formData.get('id')?.toString();
		if (!id) return fail(400, { message: 'No level to delete.' });

		await deleteLevel(id);
		return { deleted: true };
	}
};
