import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isStaff } from '$lib/roles';

/**
 * The front door is the course list.
 *
 * Which one depends on who is asking: staff get the editor's list, everyone
 * else — students, and visitors with no account — get the catalogue, which
 * already knows how to show itself to a stranger. A redirect rather than a
 * second copy of either page, so `/admin/courses` and `/courses` stay the one
 * place each list is built, and the admin nav keeps highlighting the tab the
 * reader is actually on.
 *
 * 302, not 301: the answer changes with the session, so it must never be
 * remembered as permanent.
 */
export const load: PageServerLoad = (event) => {
	redirect(302, isStaff(event.locals.user) ? '/admin/courses' : '/courses');
};
