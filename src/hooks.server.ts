import { error, type Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

/**
 * Populates `locals` from the session cookie — and deliberately does **not**
 * mount better-auth's HTTP endpoints.
 *
 * `svelteKitHandler` would serve all of `/api/auth/*`, and those endpoints check
 * only better-auth's coarse permissions: with a teacher's session,
 * `/api/auth/admin/create-user` mints an admin and `/admin/set-user-password`
 * resets anyone's password, walking straight past `$lib/server/users.ts`. Nothing
 * in the app calls them — every sign-in, sign-out and account write is a
 * server-side `auth.api` call, and the `sveltekitCookies` plugin sets cookies on
 * those without the handler — so the whole surface is closed rather than
 * filtered route by route.
 */
const AUTH_BASE_PATH = '/api/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	if (pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
		error(404, 'Nicht gefunden.');
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return resolve(event);
};
