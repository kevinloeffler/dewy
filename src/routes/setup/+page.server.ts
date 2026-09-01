import { count } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

/**
 * The first admin.
 *
 * Sign-up is off and every other account is created by someone who is already
 * signed in, so a fresh database has no way in. This page is that way in, and it
 * shuts itself the moment there is a single account — the check is a live count,
 * not a flag someone could forget to flip.
 *
 * It is a route rather than a script in `scripts/` because `auth.ts` imports
 * `$app/server` and `$env/dynamic/private`, which only exist inside SvelteKit.
 */
async function userCount(): Promise<number> {
	const [row] = await db.select({ total: count() }).from(user);
	return row?.total ?? 0;
}

export const load: PageServerLoad = async () => {
	if ((await userCount()) > 0) error(404, 'Not found.');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		if ((await userCount()) > 0) error(404, 'Not found.');

		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim() ?? '';
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		if (!name || !email) return fail(400, { name, email, message: 'Name and email are required.' });
		if (password.length < 8) {
			return fail(400, { name, email, message: 'Use a password of at least 8 characters.' });
		}

		try {
			// No `headers`: with no session to check, better-auth's own permission
			// gate would reject this. The gate we rely on is the count above.
			await auth.api.createUser({ body: { name, email, password, role: 'admin' } });
		} catch (cause) {
			if (cause instanceof APIError) {
				return fail(400, { name, email, message: cause.message || 'Could not create the account.' });
			}
			throw cause;
		}

		return redirect(303, '/login');
	}
};
