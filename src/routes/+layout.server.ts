import type { LayoutServerLoad } from './$types';

/**
 * Only the name reaches the client — the navbar needs nothing else, and the
 * full `locals.user` carries fields (email, ban state) no page should leak.
 */
export const load: LayoutServerLoad = ({ locals }) => ({
	viewer: locals.user ? { name: locals.user.name } : null
});
