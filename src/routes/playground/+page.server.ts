import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * "Playground" now means a standalone level a teacher authored, listed in
 * `/admin/playgrounds` — so this route can no longer be a player of its own.
 *
 * It was one: a hand-rolled canvas, console and run loop that predated
 * `LevelPlayer`, reachable only by typing the URL. `/level/[id]` does all of it
 * and is the page every other link already points at, so this redirects rather
 * than keeping a second copy of the player alive under a name that now says
 * something else. `?level=<id>` keeps working, aimed at the same level.
 *
 * 307 like `/designer`: the mapping is fixed, but nothing should cache it as
 * permanent while the URL is still being retired.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(307, `/level/${url.searchParams.get('level') ?? 'tutorial-01'}`);
};
