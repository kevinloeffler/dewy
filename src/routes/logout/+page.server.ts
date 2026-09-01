import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';

/**
 * Sign out. There is no page here — every other page posts to this action with
 * `<form method="POST" action="/logout">`, which keeps one copy of the logic
 * instead of a `signOut` action on each route that shows a sign-out button.
 */
export const load: PageServerLoad = () => {
	return redirect(302, '/login');
};

export const actions: Actions = {
	default: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(303, '/login');
	}
};
