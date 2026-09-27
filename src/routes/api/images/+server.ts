import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvalidImage, saveImage } from '$lib/server/images';
import { actorOf, Forbidden } from '$lib/server/users';

/**
 * Upload endpoint for the markdown editor's drag-and-drop.
 *
 * No layout guard reaches a `+server.ts`, so `saveImage` checks the role itself.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) error(400, 'Keine Datei erhalten.');

		const id = await saveImage(actorOf(event), file);
		return json({ url: `/images/${id}` }, { status: 201 });
	} catch (cause) {
		if (cause instanceof Forbidden) error(403, cause.message);
		if (cause instanceof InvalidImage) error(400, cause.message);
		throw cause;
	}
};
