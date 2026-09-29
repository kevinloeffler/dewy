import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { isStaff } from '$lib/roles';
import { FailureLimiter } from '$lib/server/rate-limit';

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

/**
 * Failed sign-ins, counted per account and per address.
 *
 * Per account is what stops a password being guessed: 10 failures in 5 minutes
 * is 120 an hour, hopeless against even a generated student password. Per
 * address catches one machine sweeping many accounts, and is generous because a
 * whole school can sign in from one IP. Behind a reverse proxy, that address is
 * only the client's if `ADDRESS_HEADER` is set (see `.env.example`).
 */
const WINDOW_MS = 5 * 60 * 1000;
const byAccount = new FailureLimiter(10, WINDOW_MS);
const byAddress = new FailureLimiter(100, WINDOW_MS);

function clientAddress(event: { getClientAddress: () => string }): string {
	try {
		return event.getClientAddress();
	} catch {
		// adapter-node throws when `ADDRESS_HEADER` names a header the request lacks.
		return 'unknown';
	}
}

function tooManyAttempts(identifier: string, ms: number) {
	const minutes = Math.max(1, Math.ceil(ms / 60_000));
	return fail(429, {
		identifier,
		message: `Zu viele Fehlversuche. Versuche es in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} wieder.`
	});
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
			return fail(400, { identifier, message: 'Gib deinen Benutzernamen oder deine E-Mail und dein Passwort ein.' });
		}

		// Checked before the password, so a locked key learns nothing from trying.
		const accountKey = identifier.toLowerCase();
		const addressKey = clientAddress(event);
		const wait = Math.max(byAccount.retryAfter(accountKey), byAddress.retryAfter(addressKey));
		if (wait > 0) return tooManyAttempts(identifier, wait);

		let user: { role?: string | null };
		try {
			const result = identifier.includes('@')
				? await auth.api.signInEmail({ body: { email: identifier, password } })
				: await auth.api.signInUsername({ body: { username: identifier, password } });

			// `signInUsername` is typed as possibly returning null; in practice it
			// throws instead. Guard so the redirect below has something to read.
			if (!result?.user) return fail(400, { identifier, message: 'Anmeldung fehlgeschlagen.' });

			// The username plugin's return type does not carry the admin plugin's
			// fields, but the value does — both endpoints answer with
			// `parseUserOutput`, which emits every configured field. `roleOf`
			// copes with the role being absent regardless.
			user = result.user as { role?: string | null };
		} catch (error) {
			if (error instanceof APIError) {
				byAccount.fail(accountKey);
				byAddress.fail(addressKey);
				return fail(400, { identifier, message: error.message || 'Anmeldung fehlgeschlagen.' });
			}
			return fail(500, { identifier, message: 'Unerwarteter Fehler.' });
		}

		byAccount.reset(accountKey);
		return redirect(303, redirectTo ?? homeFor(user));
	}
};
