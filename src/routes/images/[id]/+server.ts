import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findImage } from '$lib/server/images';
import { findBuiltinImage } from '$lib/server/builtin-images';

export const GET: RequestHandler = async ({ params }) => {
	const builtin = findBuiltinImage(params.id);
	const found = builtin ?? (await findImage(params.id));
	if (!found) error(404, 'Dieses Bild gibt es nicht.');

	return new Response(new Uint8Array(found.bytes), {
		headers: {
			'Content-Type': found.mime,
			'Content-Length': String(found.bytes.length),
			'Content-Disposition': 'inline',
			'X-Content-Type-Options': 'nosniff',
			// An uploaded id is never reused for different bytes. A built-in one
			// is: replacing the file in a release keeps its URL, so browsers
			// must check back rather than keep the old picture for a year.
			'Cache-Control': builtin ? 'public, max-age=3600' : 'public, max-age=31536000, immutable'
		}
	});
};
