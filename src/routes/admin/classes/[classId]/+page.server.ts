import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	assignCourse,
	deleteClass,
	findClass,
	InvalidClass,
	listClasses,
	moveMembers,
	removeMembers,
	renameClass,
	setClassArchived,
	unassignCourse
} from '$lib/server/classes';
import { listCourses } from '$lib/server/courses';
import { actorOf, archiveUsers, Forbidden, InvalidPerson, setPassword } from '$lib/server/users';

export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);

	const group = await findClass(actor, event.params.classId).catch((cause) => {
		if (cause instanceof Forbidden) error(404, 'Diese Klasse gibt es nicht.');
		throw cause;
	});
	if (!group) error(404, 'Diese Klasse gibt es nicht.');

	return {
		group,
		// For the "move to" picker and the course assignment list.
		otherClasses: (await listClasses(actor)).filter((row) => row.id !== group.id),
		courses: await listCourses()
	};
};

/** Reads a field that must be present, so each action can bail the same way. */
function required(formData: FormData, name: string): string | null {
	const value = formData.get(name)?.toString();
	return value && value.length > 0 ? value : null;
}

/** The checkbox column posts one `userId` per selected row. */
function selected(formData: FormData): string[] {
	return formData.getAll('userId').map((value) => value.toString());
}

/** Every write here fails the same three ways, so they share one wrapper. */
async function run<T>(work: () => Promise<T>) {
	try {
		return { ok: true as const, value: await work() };
	} catch (cause) {
		if (cause instanceof InvalidClass || cause instanceof InvalidPerson) {
			return { ok: false as const, status: 400, message: cause.errors.join('; ') };
		}
		if (cause instanceof Forbidden) return { ok: false as const, status: 403, message: cause.message };
		throw cause;
	}
}

export const actions: Actions = {
	rename: async (event) => {
		const formData = await event.request.formData();
		const name = formData.get('name')?.toString() ?? '';

		const result = await run(() => renameClass(actorOf(event), event.params.classId, name));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	archive: async (event) => {
		const formData = await event.request.formData();
		const archived = formData.get('archived') === 'true';

		const result = await run(() => setClassArchived(actorOf(event), event.params.classId, archived));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	delete: async (event) => {
		const result = await run(() => deleteClass(actorOf(event), event.params.classId));
		if (!result.ok) return fail(result.status, { message: result.message });
		return redirect(303, '/admin/classes');
	},

	assignCourse: async (event) => {
		const formData = await event.request.formData();
		const courseId = required(formData, 'courseId');
		if (!courseId) return fail(400, { message: 'Kein Kurs zum Zuweisen.' });

		const result = await run(() => assignCourse(actorOf(event), event.params.classId, courseId));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	unassignCourse: async (event) => {
		const formData = await event.request.formData();
		const courseId = required(formData, 'courseId');
		if (!courseId) return fail(400, { message: 'Kein Kurs zum Entfernen.' });

		const result = await run(() => unassignCourse(actorOf(event), event.params.classId, courseId));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	removeStudents: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });

		const result = await run(() => removeMembers(actorOf(event), event.params.classId, userIds));
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	moveStudents: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		const toClassId = required(formData, 'toClassId');
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });
		if (!toClassId) return fail(400, { message: 'Wähle eine Klasse aus, in die sie verschoben werden.' });

		const result = await run(() =>
			moveMembers(actorOf(event), event.params.classId, toClassId, userIds)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	archiveStudents: async (event) => {
		const formData = await event.request.formData();
		const userIds = selected(formData);
		if (userIds.length === 0) return fail(400, { message: 'Es wurde niemand ausgewählt.' });

		const result = await run(() => archiveUsers(actorOf(event), userIds));
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
	}
};
