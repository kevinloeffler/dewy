import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createClass, InvalidClass, listClasses } from '$lib/server/classes';
import { actorOf, Forbidden } from '$lib/server/users';

export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);
	return {
		classes: await listClasses(actor),
		archived: await listClasses(actor, { archived: true })
	};
};

export const actions: Actions = {
	create: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() ?? '';

		try {
			const id = await createClass(actorOf(event), name);
			return redirect(303, `/admin/classes/${id}`);
		} catch (cause) {
			if (cause instanceof InvalidClass) return fail(400, { message: cause.errors.join('; ') });
			if (cause instanceof Forbidden) return fail(403, { message: cause.message });
			throw cause;
		}
	}
};
