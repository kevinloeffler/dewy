import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { addMembers, listClasses, moveMembers } from '$lib/server/classes';
import {
	actorOf,
	archiveUsers,
	Forbidden,
	listPeople,
	setPassword,
	restoreUsers,
	setRole,
	type PeopleFilter
} from '$lib/server/users';
import { isRole, roleOf } from '$lib/roles';

export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);
	const params = event.url.searchParams;

	const roleParam = params.get('role');
	const filter: PeopleFilter = {
		role: isRole(roleParam) ? roleParam : undefined,
		classId: params.get('classId') ?? undefined,
		archived: params.get('archived') === '1',
		search: params.get('q') ?? undefined
	};

	return {
		people: await listPeople(actor, filter),
		classes: await listClasses(actor),
		filter,
		isAdmin: roleOf(actor.user) === 'admin'
	};
};

/** The checkbox column posts one `userId` per selected row. */
function selected(formData: FormData): string[] {
	return formData.getAll('userId').map((value) => value.toString());
}

async function run<T>(work: () => Promise<T>) {
	try {
		return { ok: true as const, value: await work() };
	} catch (cause) {
		if (cause instanceof Forbidden) return { ok: false as const, status: 403, message: cause.message };
		throw cause;
	}
}

export const actions: Actions = {
	archive: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });

		const result = await run(() => archiveUsers(actorOf(event), userIds));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	restore: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });

		const result = await run(() => restoreUsers(actorOf(event), userIds));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	setPassword: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		const password = formData.get('password')?.toString() ?? '';
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });

		const result = await run(() => setPassword(actorOf(event), userIds, password));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	addToClass: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		const classId = formData.get('classId')?.toString();
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });
		if (!classId) return fail(400, { message: 'Wähle eine Klasse aus.' });

		const result = await run(() => addMembers(actorOf(event), classId, userIds));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	moveToClass: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		const fromClassId = formData.get('fromClassId')?.toString();
		const classId = formData.get('classId')?.toString();
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });
		if (!classId) return fail(400, { message: 'Wähle eine Klasse aus.' });
		// Moving is only meaningful from a known class — the list is filtered by
		// one, and without that filter "add to class" is the honest operation.
		if (!fromClassId) return fail(400, { message: 'Filtere zuerst nach einer Klasse, um Schüler/innen zu verschieben.' });

		const result = await run(() => moveMembers(actorOf(event), fromClassId, classId, userIds));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	setRole: async (event) => {
		const formData = await event.request.formData();
		const userId = formData.get('userId')?.toString();
		const role = formData.get('role')?.toString();
		if (!userId || !isRole(role)) return fail(400, { message: 'Wähle eine Rolle aus.' });

		const result = await run(() => setRole(actorOf(event), userId, role));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	}
};
