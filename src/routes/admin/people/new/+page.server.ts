import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listClasses } from '$lib/server/classes';
import {
	actorOf,
	createStudents,
	createTeacher,
	Forbidden,
	InvalidPerson,
	takenUsernames
} from '$lib/server/users';
import { parseRoster } from '$lib/roster';
import { roleOf } from '$lib/roles';

export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);

	return {
		classes: await listClasses(actor),
		// The preview warns about collisions before anything is submitted; the
		// server resolves them again on submit, so this list is a courtesy, not
		// a source of truth.
		taken: await takenUsernames(),
		preselectedClassId: event.url.searchParams.get('classId'),
		canCreateTeachers: roleOf(actor.user) === 'admin'
	};
};

export const actions: Actions = {
	students: async (event) => {
		const formData = await event.request.formData();
		const classId = formData.get('classId')?.toString() ?? '';
		const roster = formData.get('roster')?.toString() ?? '';

		if (!classId) return fail(400, { roster, message: 'Pick a class first.' });

		const drafts = parseRoster(roster);
		if (drafts.length === 0) {
			return fail(400, { roster, message: 'No names found. One student per line.' });
		}

		try {
			const { created, failed } = await createStudents(actorOf(event), classId, drafts);
			return { credentials: created, failed, classId };
		} catch (cause) {
			if (cause instanceof Forbidden) return fail(403, { roster, message: cause.message });
			throw cause;
		}
	},

	teacher: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() ?? '';
		const email = formData.get('email')?.toString() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		try {
			const created = await createTeacher(actorOf(event), { name, email, password });
			return { credentials: [created], failed: [], classId: null };
		} catch (cause) {
			if (cause instanceof InvalidPerson) {
				return fail(400, { name, email, message: cause.errors.join('; ') });
			}
			if (cause instanceof Forbidden) return fail(403, { name, email, message: cause.message });
			throw cause;
		}
	}
};
