import { createAccessControl } from 'better-auth/plugins/access';

/**
 * Who may do what.
 *
 * Three roles, stored in `user.role` by better-auth's admin plugin. This module
 * is deliberately free of SvelteKit and of the database so both the auth config
 * and the pages can import it — the same reason `$lib/progress.ts` and
 * `$lib/ordering.ts` hold their rules as plain functions.
 *
 * A caveat that shapes everything downstream: better-auth's permission model is
 * coarse. It knows *"may create users"*, not *"may create users of role X"* —
 * `/admin/create-user` writes whatever role the caller passes, and `/admin/ban-user`
 * will ban an admin if a teacher asks it to. So the roles below are a second
 * fence. The first one, and the one that actually encodes "a teacher may only
 * touch students in their own classes", is `$lib/server/users.ts`.
 */

export const ROLES = ['admin', 'teacher', 'student'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
	return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** What each role is called in the UI. The stored values stay English. */
export const ROLE_LABELS: Record<Role, string> = {
	admin: 'Administration',
	teacher: 'Lehrperson',
	student: 'Schüler/in'
};

/**
 * The role on a session user, normalised.
 *
 * better-auth types `role` as `string | null | undefined` (it supports a
 * comma-separated list, which we never write), so every read goes through here
 * and an unrecognised value falls back to the least privileged role.
 */
export function roleOf(user: { role?: string | null } | null | undefined): Role {
	return isRole(user?.role) ? user.role : 'student';
}

export function isStaff(user: { role?: string | null } | null | undefined): boolean {
	const role = roleOf(user);
	return role === 'admin' || role === 'teacher';
}

/** The admin plugin's own statement, restated so `newRole` below is type-checked against it. */
const statement = {
	user: [
		'create',
		'list',
		'set-role',
		'ban',
		'impersonate',
		'delete',
		'set-password',
		'get',
		'update'
	],
	session: ['list', 'revoke', 'delete']
} as const;

export const ac = createAccessControl(statement);

export const roles = {
	admin: ac.newRole({
		user: [
			'create',
			'list',
			'set-role',
			'ban',
			'impersonate',
			'delete',
			'set-password',
			'get',
			'update'
		],
		session: ['list', 'revoke', 'delete']
	}),

	/**
	 * No `set-role`, so a teacher can never mint an admin, and no `delete`, so the
	 * only way a teacher removes someone is archival — which keeps their work.
	 */
	teacher: ac.newRole({
		user: ['create', 'list', 'ban', 'set-password', 'get', 'update'],
		session: ['list', 'revoke']
	}),

	student: ac.newRole({ user: [], session: [] })
};
