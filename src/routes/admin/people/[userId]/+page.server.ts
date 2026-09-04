import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { addMembers, listClasses, removeMembers } from '$lib/server/classes';
import {
	actorOf,
	archiveUsers,
	findPerson,
	Forbidden,
	InvalidPerson,
	renamePerson,
	setPassword,
	restoreUsers,
	setRole
} from '$lib/server/users';
import { isRole, roleOf } from '$lib/roles';

export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);

	const person = await findPerson(actor, event.params.userId).catch((cause) => {
		// A teacher asking about somebody else's student is told the same thing
		// as a teacher asking about nobody at all.
		if (cause instanceof Forbidden) error(404, 'Diese Person gibt es nicht.');
		throw cause;
	});
	if (!person) error(404, 'Diese Person gibt es nicht.');

	return {
		person,
		classes: await listClasses(actor),
		isAdmin: roleOf(actor.user) === 'admin',
		isSelf: actor.user.id === person.id
	};
};

async function run<T>(work: () => Promise<T>) {
	try {
		return { ok: true as const, value: await work() };
	} catch (cause) {
		if (cause instanceof InvalidPerson) {
			return { ok: false as const, status: 400, message: cause.errors.join('; ') };
		}
		if (cause instanceof Forbidden) return { ok: false as const, status: 403, message: cause.message };
		throw cause;
	}
}

export const actions: Actions = {
	rename: async (event) => {
		const formData = await event.request.formData();

		const result = await run(() =>
			renamePerson(actorOf(event), event.params.userId, {
				name: formData.get('name')?.toString(),
				username: formData.get('username')?.toString(),
				email: formData.get('email')?.toString()
			})
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	setPassword: async (event) => {
		const formData = await event.request.formData();
		const password = formData.get('password')?.toString() ?? '';

		const result = await run(() => setPassword(actorOf(event), [event.params.userId], password));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	archive: async (event) => {
		const formData = await event.request.formData();
		const archived = formData.get('archived') === 'true';
		const userIds = [event.params.userId];

		const result = await run(() =>
			archived ? archiveUsers(actorOf(event), userIds) : restoreUsers(actorOf(event), userIds)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	setRole: async (event) => {
		const formData = await event.request.formData();
		const role = formData.get('role')?.toString();
		if (!isRole(role)) return fail(400, { message: 'Wähle eine Rolle aus.' });

		const result = await run(() => setRole(actorOf(event), event.params.userId, role));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	addToClass: async (event) => {
		const formData = await event.request.formData();
		const classId = formData.get('classId')?.toString();
		if (!classId) return fail(400, { message: 'Wähle eine Klasse aus.' });

		const result = await run(() => addMembers(actorOf(event), classId, [event.params.userId]));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	removeFromClass: async (event) => {
		const formData = await event.request.formData();
		const classId = formData.get('classId')?.toString();
		if (!classId) return fail(400, { message: 'Wähle eine Klasse aus.' });

		const result = await run(() => removeMembers(actorOf(event), classId, [event.params.userId]));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	}
};
