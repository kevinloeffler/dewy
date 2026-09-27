import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findImage } from '$lib/server/images';

export const GET: RequestHandler = async ({ params }) => {
	const found = await findImage(params.id);
	if (!found) error(404, 'Dieses Bild gibt es nicht.');

	return new Response(new Uint8Array(found.bytes), {
		headers: {
			'Content-Type': found.mime,
			'Content-Length': String(found.bytes.length),
			'Content-Disposition': 'inline',
			'X-Content-Type-Options': 'nosniff',
			// An id is never reused for different bytes.
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
