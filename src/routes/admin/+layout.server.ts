import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isStaff, roleOf } from '$lib/roles';

/**
 * The guard `/admin/courses` was written in anticipation of:
 *
 * > "The URL is under `/admin` so that adding a guard later is one
 * > `+layout.server.ts` rather than an audit of every route."
 *
 * This is that file. Everything under `/admin` is teachers and admins only.
 * What a teacher may do *once inside* is not decided here — `courses.ts` owns
 * course ownership and `users.ts` owns who may touch which account.
 */
export const load: LayoutServerLoad = (event) => {
	const user = event.locals.user;

	if (!user) {
		const redirectTo = encodeURIComponent(event.url.pathname + event.url.search);
		return redirect(302, `/login?redirectTo=${redirectTo}`);
	}

	if (!isStaff(user)) {
		error(403, 'This area is for teachers.');
	}

	return { user, role: roleOf(user) };
};
