import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isStaff } from '$lib/roles';

/**
 * The front door.
 *
 * A signed-in reader is sent straight to their course list: staff get the
 * editor's list, students the catalogue. A redirect rather than a second copy
 * of either page, so `/admin/courses` and `/courses` stay the one place each
 * list is built, and the admin nav keeps highlighting the tab the reader is
 * actually on.
 *
 * A visitor with no account stays here and gets the landing page — the
 * catalogue has nothing to show a stranger, since sign-up is disabled and
 * every account comes from a teacher.
 *
 * 302, not 301: the answer changes with the session, so it must never be
 * remembered as permanent.
 */
export const load: PageServerLoad = (event) => {
	const user = event.locals.user;
	if (user) redirect(302, isStaff(user) ? '/admin/courses' : '/courses');
};
