import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, username } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { ac, roles } from '$lib/roles';

/**
 * Accounts are created by admins and teachers, never by the people using them —
 * hence `disableSignUp`. `/setup` mints the very first admin on an empty
 * database; everyone else arrives through `$lib/server/users.ts`.
 *
 * The `username` plugin exists for students, who mostly have no school email.
 * They sign in with a username and their `email` column holds a synthetic
 * address (see `STUDENT_EMAIL_DOMAIN` in `users.ts`) purely to satisfy
 * better-auth's unique-email requirement. Teachers and admins use a real one.
 *
 * Archival rides on the admin plugin's `banned` flag, which is enforced in a
 * `session.create.before` hook — so it blocks *every* sign-in path, including
 * `/sign-in/username`, and banning also deletes the existing sessions. The
 * `archivedAt` field below is ours, and only records when it happened.
 */
export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true, disableSignUp: true },
	user: {
		additionalFields: {
			archivedAt: { type: 'date', required: false, input: false }
		}
	},
	plugins: [
		admin({
			ac,
			roles,
			// Teachers reach the admin endpoints too; `users.ts` is what narrows
			// them to "students in a class you own".
			adminRoles: ['admin', 'teacher'],
			defaultRole: 'student',
			bannedUserMessage:
				'Dieses Konto ist archiviert. Bitte deine Lehrperson, es wiederherzustellen.'
		}),
		username(),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
