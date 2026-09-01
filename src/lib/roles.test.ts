import { describe, expect, it } from 'vitest';
import { isRole, isStaff, roleOf, roles } from './roles';

describe('roleOf', () => {
	it('reads a known role', () => {
		expect(roleOf({ role: 'admin' })).toBe('admin');
		expect(roleOf({ role: 'teacher' })).toBe('teacher');
	});

	it('falls back to the least privileged role', () => {
		// better-auth types `role` as nullable and supports comma-separated lists
		// we never write, so anything unrecognised must not read as privileged.
		expect(roleOf(null)).toBe('student');
		expect(roleOf(undefined)).toBe('student');
		expect(roleOf({ role: null })).toBe('student');
		expect(roleOf({ role: 'admin,teacher' })).toBe('student');
		expect(roleOf({ role: 'superuser' })).toBe('student');
	});
});

describe('isStaff', () => {
	it('is the /admin guard', () => {
		expect(isStaff({ role: 'admin' })).toBe(true);
		expect(isStaff({ role: 'teacher' })).toBe(true);
		expect(isStaff({ role: 'student' })).toBe(false);
		expect(isStaff(undefined)).toBe(false);
	});
});

describe('isRole', () => {
	it('rejects anything not in ROLES', () => {
		expect(isRole('teacher')).toBe(true);
		expect(isRole('owner')).toBe(false);
		expect(isRole(7)).toBe(false);
	});
});

describe('the access-control roles', () => {
	it('lets an admin do everything', () => {
		expect(roles.admin.authorize({ user: ['create', 'set-role', 'delete'] }).success).toBe(true);
	});

	it('lets a teacher create and archive, but never set a role or delete', () => {
		expect(roles.teacher.authorize({ user: ['create'] }).success).toBe(true);
		expect(roles.teacher.authorize({ user: ['ban'] }).success).toBe(true);
		expect(roles.teacher.authorize({ user: ['set-password'] }).success).toBe(true);
		expect(roles.teacher.authorize({ user: ['set-role'] }).success).toBe(false);
		expect(roles.teacher.authorize({ user: ['delete'] }).success).toBe(false);
		expect(roles.teacher.authorize({ user: ['impersonate'] }).success).toBe(false);
	});

	it('lets a student do nothing', () => {
		expect(roles.student.authorize({ user: ['list'] }).success).toBe(false);
		expect(roles.student.authorize({ session: ['revoke'] }).success).toBe(false);
	});
});
