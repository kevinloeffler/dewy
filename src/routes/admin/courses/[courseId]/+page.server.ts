import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import {
	addLevelItem,
	addTheoryItem,
	assertCanEditCourse,
	assertCanEditItem,
	assertCanEditStage,
	canEditCourse,
	canViewCourse,
	copyLevel,
	createStage,
	deleteCourse,
	deleteItem,
	deleteStage,
	duplicateCourse,
	findCourse,
	InvalidItem,
	linkLevel,
	listCourseShares,
	listSharedLevels,
	moveItem,
	moveStage,
	shareCourse,
	unshareCourse,
	updateCourse,
	updateStage
} from '$lib/server/courses';
import { actorOf, Forbidden, listTeachers } from '$lib/server/users';
import type { Direction } from '$lib/ordering';

export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);

	const course = await findCourse(event.params.courseId);
	if (!course) error(404, 'Diesen Kurs gibt es nicht.');

	// A course shared as a clone is visible and unchangeable. Everything the page
	// renders keys off `canEdit`, so read-only is one flag rather than a second
	// template.
	if (!(await canViewCourse(actor, course.id))) error(404, 'Diesen Kurs gibt es nicht.');
	const canEdit = await canEditCourse(actor, course.id);

	return {
		course,
		canEdit,
		shares: canEdit ? await listCourseShares(actor, course.id) : [],
		teachers: canEdit ? (await listTeachers()).filter((row) => row.id !== actor.user.id) : [],
		sharedLevels: canEdit ? await listSharedLevels(actor) : []
	};
};

/** Reads a field that must be present, so each action can bail the same way. */
function required(formData: FormData, name: string): string | null {
	const value = formData.get(name)?.toString();
	return value && value.length > 0 ? value : null;
}

function direction(formData: FormData): Direction {
	return formData.get('direction') === 'up' ? 'up' : 'down';
}

/**
 * Runs one write behind its gate.
 *
 * Every action below is a write to somebody's course, so every one of them
 * starts by asking whether this is that somebody. The rules themselves live in
 * `courses.ts`; `gate` here just names which of them applies — the course, the
 * stage it belongs to, or the item's.
 */
async function guarded<T>(
	event: RequestEvent,
	gate: (actor: ReturnType<typeof actorOf>) => Promise<void>,
	work: (actor: ReturnType<typeof actorOf>) => Promise<T>
) {
	const actor = actorOf(event);
	try {
		await gate(actor);
		return { ok: true as const, value: await work(actor) };
	} catch (cause) {
		if (cause instanceof Forbidden) return { ok: false as const, status: 403, message: cause.message };
		if (cause instanceof InvalidItem) {
			return { ok: false as const, status: 400, message: cause.errors.join('; ') };
		}
		throw cause;
	}
}

export const actions: Actions = {
	updateCourse: async (event) => {
		const formData = await event.request.formData();
		const courseId = event.params.courseId;

		const result = await guarded(
			event,
			(actor) => assertCanEditCourse(actor, courseId),
			() =>
				updateCourse(courseId, {
					title: formData.get('title')?.toString() ?? '',
					description: formData.get('description')?.toString() ?? ''
				})
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	publish: async (event) => {
		const formData = await event.request.formData();
		const courseId = event.params.courseId;

		const result = await guarded(
			event,
			(actor) => assertCanEditCourse(actor, courseId),
			() => updateCourse(courseId, { published: formData.get('published') === 'true' })
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	deleteCourse: async (event) => {
		const courseId = event.params.courseId;

		const result = await guarded(
			event,
			(actor) => assertCanEditCourse(actor, courseId),
			() => deleteCourse(courseId)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return redirect(303, '/admin/courses');
	},

	addStage: async (event) => {
		const formData = await event.request.formData();
		const courseId = event.params.courseId;

		const result = await guarded(
			event,
			(actor) => assertCanEditCourse(actor, courseId),
			() => createStage(courseId, formData.get('title')?.toString() ?? '')
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	updateStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'Kein Kapitel zum Umbenennen.' });

		// Only the fields the form carried: the rename form has no description
		// input, and a missing field means "unchanged", not "empty".
		const description = formData.get('description');

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, id),
			() =>
				updateStage(id, {
					title: formData.get('title')?.toString() ?? '',
					...(description === null ? {} : { description: description.toString() })
				})
		);
		if (!result.ok) return fail(result.status, { message: result.message });
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
		if (!id) return fail(400, { message: 'Kein Kapitel zum Blockieren.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, id),
			() => updateStage(id, { gated: formData.get('gated') === 'true' })
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	/** Same shape as `gateStage`, for the other half of the stage's rules. */
	orderStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'Kein Kapitel zum Sortieren.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, id),
			() => updateStage(id, { ordered: formData.get('ordered') === 'true' })
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	deleteStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'Kein Kapitel zum Löschen.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, id),
			() => deleteStage(id)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	moveStage: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'Kein Kapitel zum Verschieben.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, id),
			() => moveStage(id, direction(formData))
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	addLevel: async (event) => {
		const formData = await event.request.formData();
		const stageId = required(formData, 'stageId');
		if (!stageId) return fail(400, { message: 'Kein Kapitel zum Hinzufügen.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, stageId),
			() => addLevelItem(stageId, formData.get('name')?.toString() ?? '')
		);
		if (!result.ok) return fail(result.status, { message: result.message });

		// Straight into the designer — a blank level is not worth a second click.
		return redirect(303, `/designer/${result.value.levelId}`);
	},

	/** Adds a level another teacher shared, as a live link they keep owning. */
	linkLevel: async (event) => {
		const formData = await event.request.formData();
		const stageId = required(formData, 'stageId');
		const levelId = required(formData, 'levelId');
		if (!stageId || !levelId) return fail(400, { message: 'Wähle ein Level aus.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, stageId),
			(actor) => linkLevel(actor, stageId, levelId)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	/** Adds a shared level as an independent duplicate, editable here. */
	copyLevel: async (event) => {
		const formData = await event.request.formData();
		const stageId = required(formData, 'stageId');
		const levelId = required(formData, 'levelId');
		if (!stageId || !levelId) return fail(400, { message: 'Wähle ein Level aus.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, stageId),
			(actor) => copyLevel(actor, stageId, levelId)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return redirect(303, `/designer/${result.value.levelId}`);
	},

	addTheory: async (event) => {
		const formData = await event.request.formData();
		const stageId = required(formData, 'stageId');
		if (!stageId) return fail(400, { message: 'Kein Kapitel zum Hinzufügen.' });

		const title = formData.get('title')?.toString() ?? '';
		const result = await guarded(
			event,
			(actor) => assertCanEditStage(actor, stageId),
			() =>
				addTheoryItem(stageId, {
					title,
					// A placeholder body keeps the item valid; the editor is next anyway.
					body: `Schreib hier die Lektion für „${title.trim() || 'diesen Block'}“.`
				})
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return redirect(303, `/admin/courses/${event.params.courseId}/theory/${result.value}`);
	},

	deleteItem: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'Kein Element zum Löschen.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditItem(actor, id),
			() => deleteItem(id)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	moveItem: async (event) => {
		const formData = await event.request.formData();
		const id = required(formData, 'id');
		if (!id) return fail(400, { message: 'Kein Element zum Verschieben.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditItem(actor, id),
			() => moveItem(id, direction(formData))
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	// ── Sharing ───────────────────────────────────────────────

	share: async (event) => {
		const formData = await event.request.formData();
		const teacherId = required(formData, 'teacherId');
		const courseId = event.params.courseId;
		if (!teacherId) return fail(400, { message: 'Wähle eine Lehrperson aus.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditCourse(actor, courseId),
			(actor) => shareCourse(actor, courseId, teacherId)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	unshare: async (event) => {
		const formData = await event.request.formData();
		const teacherId = required(formData, 'teacherId');
		const courseId = event.params.courseId;
		if (!teacherId) return fail(400, { message: 'Wähle eine Lehrperson aus.' });

		const result = await guarded(
			event,
			(actor) => assertCanEditCourse(actor, courseId),
			(actor) => unshareCourse(actor, courseId, teacherId)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return { savedAt: Date.now() };
	},

	/** Take an editable copy of a course — your own, or one shared with you. */
	duplicate: async (event) => {
		const courseId = event.params.courseId;

		// The gate is `duplicateCourse`'s own: a clone recipient may copy, which
		// is precisely what they may not do to the original.
		const result = await guarded(
			event,
			async () => {},
			(actor) => duplicateCourse(actor, courseId)
		);
		if (!result.ok) return fail(result.status, { message: result.message });
		return redirect(303, `/admin/courses/${result.value}`);
	}
};
