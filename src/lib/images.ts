/**
 * Image-upload rules shared by the editor (to reject early) and the server (to
 * enforce). Framework-free so both sides and the tests can import it.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Raster formats only — an SVG can carry script. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export function isImageType(type: string): type is ImageType {
	return (IMAGE_TYPES as readonly string[]).includes(type);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
	if (bytes.length < offset + signature.length) return false;
	return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** Identifies an image by its magic bytes; `null` for anything else. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'; // "GIF8"
	// "RIFF" <size> "WEBP"
	if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
		return 'image/webp';
	}
	return null;
}
