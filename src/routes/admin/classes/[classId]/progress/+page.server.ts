import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findClass } from '$lib/server/classes';
import { listCourses } from '$lib/server/courses';
import { classProgress } from '$lib/server/progress';
import { actorOf, Forbidden } from '$lib/server/users';

/**
 * How far a class has got in one course.
 *
 * No guard of its own: `findClass` already answers "may this teacher see this
 * class?", and seeing a class is exactly what entitles you to its students'
 * progress — the same boundary `users.ts` draws around every other read about a
 * student. A teacher asking about somebody else's class gets the same 404 the
 * class page gives them.
 */
export const load: PageServerLoad = async (event) => {
	const actor = actorOf(event);

	const group = await findClass(actor, event.params.classId).catch((cause) => {
		if (cause instanceof Forbidden) error(404, 'Diese Klasse gibt es nicht.');
		throw cause;
	});
	if (!group) error(404, 'Diese Klasse gibt es nicht.');

	// What this class can be tracked against is what this class can *see*, which
	// is the rule `courses.listCoursesFor` states for a student: the courses it
	// was assigned, or — assigned nothing — the whole published shelf.
	const trackable =
		group.courses.length > 0
			? group.courses
			: (await listCourses({ publishedOnly: true })).map((row) => ({
					id: row.id,
					title: row.title,
					published: row.published
				}));

	// The grid is about the class as it stands. An archived student's completions
	// would otherwise pull every column count towards a number nobody in the room
	// can move, so they sit this out and the page says how many.
	const active = group.students.filter((student) => !student.archivedAt);

	const wanted = event.url.searchParams.get('courseId');
	const selected = wanted
		? trackable.find((row) => row.id === wanted)
		: trackable[0];
	// A hand-edited id for a course this class is not doing: nothing to show, and
	// no reason to quietly show them a different one.
	if (wanted && !selected) error(404, 'Diesen Kurs macht diese Klasse nicht.');

	return {
		group,
		trackable,
		selectedCourseId: selected?.id ?? null,
		archivedCount: group.students.length - active.length,
		progress: selected ? await classProgress(active, selected.id) : null
	};
};
