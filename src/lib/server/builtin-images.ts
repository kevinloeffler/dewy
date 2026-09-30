import { sniffImageType, type ImageType } from '$lib/images';

/**
 * Images shipped with the app build, for tutorials and default content.
 *
 * Drop a file into `src/lib/assets/builtin/` and it is served at
 * `/images/builtin-<name>`, where `<name>` is the filename without extension —
 * so `robot-happy.png` becomes `![Roboter](/images/builtin-robot-happy)`. That
 * URL already passes `renderMarkdown`'s image rule, so markdown needs no special
 * case, and the bytes live in the server bundle rather than the database.
 *
 * Uploaded images have UUID ids, which never start with `builtin-`, so the two
 * cannot collide.
 */

export const BUILTIN_PREFIX = 'builtin-';

// `?inline` makes Vite bundle each file as a data URL, so the bytes travel with
// the server build instead of depending on a file path that exists only in dev.
const files = import.meta.glob<string>('/src/lib/assets/builtin/*.{png,jpg,jpeg,gif,webp}', {
	query: '?inline',
	import: 'default',
	eager: true
});

/** `…/builtin/robot-happy.png` → `builtin-robot-happy`; `null` if the name won't fit an image URL. */
export function builtinId(path: string): string | null {
	const name = path
		.split('/')
		.pop()!
		.replace(/\.[^.]+$/, '');
	return /^[A-Za-z0-9-]+$/.test(name) ? BUILTIN_PREFIX + name : null;
}

function load(): Map<string, { mime: ImageType; bytes: Buffer }> {
	const images = new Map<string, { mime: ImageType; bytes: Buffer }>();
	for (const [path, dataUrl] of Object.entries(files)) {
		const id = builtinId(path);
		if (!id) throw new Error(`Built-in image ${path}: use only letters, digits and hyphens in the name.`);
		if (images.has(id)) throw new Error(`Built-in image ${path}: another file is already ${id}.`);

		const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
		// Same rule as uploads: whatever goes out as an image is sniffed, not assumed.
		const mime = sniffImageType(bytes);
		if (!mime) throw new Error(`Built-in image ${path}: not a PNG, JPEG, GIF or WebP.`);
		images.set(id, { mime, bytes });
	}
	return images;
}

const builtins = load();

export function findBuiltinImage(id: string): { mime: ImageType; bytes: Buffer } | null {
	return builtins.get(id) ?? null;
}
