import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isStaff } from '$lib/roles';

/**
 * The level designer is an authoring tool, so it is teachers and admins only —
 * the same guard `/admin` has, for the same reason. Which *levels* a teacher may
 * open is a separate question, answered per level by `assertCanEditLevel`.
 */
export const load: LayoutServerLoad = (event) => {
	const user = event.locals.user;

	if (!user) {
		const redirectTo = encodeURIComponent(event.url.pathname + event.url.search);
		return redirect(302, `/login?redirectTo=${redirectTo}`);
	}

	if (!isStaff(user)) error(403, 'Dieser Bereich ist für Lehrpersonen.');

	return { user };
};
