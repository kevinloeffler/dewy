import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { image } from '$lib/server/db/schema';
import { isStaff } from '$lib/roles';
import { Forbidden, type Actor } from '$lib/server/users';
import { MAX_IMAGE_BYTES, sniffImageType, type ImageType } from '$lib/images';

/**
 * Images dropped into the markdown editor.
 *
 * Only staff may upload, since only staff write markdown. Anyone may *read* an
 * image by its id (see `/images/[id]`): the id is an unguessable UUID and the
 * content that embeds it is itself readable by students and visitors.
 */

export class InvalidImage extends Error {}

export async function saveImage(actor: Actor, file: File): Promise<string> {
	if (!isStaff(actor.user)) throw new Forbidden('Nur Lehrpersonen dürfen Bilder hochladen.');
	if (file.size === 0) throw new InvalidImage('Die Datei ist leer.');
	if (file.size > MAX_IMAGE_BYTES) {
		throw new InvalidImage(`Das Bild ist zu gross (max. ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`);
	}

	const bytes = Buffer.from(await file.arrayBuffer());
	// Trust the bytes, not the browser's `Content-Type`: what we store is what
	// we later serve, and an SVG or HTML file must never go out as an image.
	const mime = sniffImageType(bytes);
	if (!mime) throw new InvalidImage('Nur PNG, JPEG, GIF und WebP werden unterstützt.');

	const id = crypto.randomUUID();
	await db.insert(image).values({ id, ownerId: actor.user.id, mime, bytes, size: bytes.length });
	return id;
}

export async function findImage(id: string): Promise<{ mime: ImageType; bytes: Buffer } | null> {
	const row = await db
		.select({ mime: image.mime, bytes: image.bytes })
		.from(image)
		.where(eq(image.id, id))
		.get();
	return row ? { mime: row.mime as ImageType, bytes: row.bytes } : null;
}
