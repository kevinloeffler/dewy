import type { PageServerLoad } from './$types';
import { isStaff } from '$lib/roles';

/** The landing page shows a different door depending on who is already in. */
export const load: PageServerLoad = (event) => {
	return {
		signedIn: Boolean(event.locals.user),
		name: event.locals.user?.name ?? null,
		isStaff: isStaff(event.locals.user)
	};
};
