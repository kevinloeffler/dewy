import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { isStaff } from '$lib/roles';

/**
 * One sign-in form for everybody.
 *
 * Teachers and admins have a real email; students have a username and a
 * synthetic address they never see. Rather than make people pick which kind of
 * account they have, the single identifier field is routed on the `@`.
 */
function homeFor(user: { role?: string | null }): string {
	return isStaff(user) ? '/admin/courses' : '/courses';
}

/** Only same-origin paths, so `?redirectTo=` cannot bounce anyone off-site. */
function safeRedirect(value: string | null): string | null {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
	return value;
}

export const load: PageServerLoad = (event) => {
	if (event.locals.user) {
		return redirect(302, safeRedirect(event.url.searchParams.get('redirectTo')) ?? homeFor(event.locals.user));
	}
	return { redirectTo: safeRedirect(event.url.searchParams.get('redirectTo')) };
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();
		const identifier = formData.get('identifier')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const redirectTo = safeRedirect(formData.get('redirectTo')?.toString() ?? null);

		if (!identifier || !password) {
			return fail(400, { identifier, message: 'Enter your username or email and your password.' });
		}

		let user: { role?: string | null };
		try {
			const result = identifier.includes('@')
				? await auth.api.signInEmail({ body: { email: identifier, password } })
				: await auth.api.signInUsername({ body: { username: identifier, password } });

			// `signInUsername` is typed as possibly returning null; in practice it
			// throws instead. Guard so the redirect below has something to read.
			if (!result?.user) return fail(400, { identifier, message: 'Sign in failed.' });

			// The username plugin's return type does not carry the admin plugin's
			// fields, but the value does — both endpoints answer with
			// `parseUserOutput`, which emits every configured field. `roleOf`
			// copes with the role being absent regardless.
			user = result.user as { role?: string | null };
		} catch (error) {
			if (error instanceof APIError) {
				return fail(400, { identifier, message: error.message || 'Sign in failed.' });
			}
			return fail(500, { identifier, message: 'Unexpected error.' });
		}

		return redirect(303, redirectTo ?? homeFor(user));
	}
};
