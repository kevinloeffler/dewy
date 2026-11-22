import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encrypting API keys at rest.
 *
 * AES-256-GCM, so a tampered or wrongly keyed blob fails to open rather than
 * decrypting to garbage that would then be sent to a provider. The key is
 * passed in rather than read here, which keeps this module free of SvelteKit
 * and testable in plain Node; `config.ts` reads `LLM_SECRET_KEY`.
 *
 * Format: `v1:<iv>:<tag>:<ciphertext>`, each part base64. The version prefix is
 * there so a future change of scheme can tell old blobs apart.
 */

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * Reads `LLM_SECRET_KEY`: 32 bytes, given as 64 hex characters or as base64
 * (`openssl rand -base64 32`). Anything else is `null`, meaning "not
 * configured". A short key is refused rather than stretched.
 */
export function parseSecretKey(raw: string | undefined | null): Buffer | null {
	const value = raw?.trim();
	if (!value) return null;

	if (/^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex');

	if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
		const bytes = Buffer.from(value, 'base64');
		if (bytes.length === 32) return bytes;
	}
	return null;
}

export function encryptSecret(plain: string, key: Buffer): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [VERSION, ...[iv, tag, ciphertext].map((part) => part.toString('base64'))].join(':');
}

/**
 * The plaintext, or `null` when the blob cannot be opened: a rotated key, a
 * tampered row or an unknown format. Never throws, because a caller can do
 * nothing useful with the reason except treat the config as broken.
 */
export function decryptSecret(blob: string, key: Buffer): string | null {
	const parts = blob.split(':');
	if (parts.length !== 4 || parts[0] !== VERSION) return null;

	try {
		const [, iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
		const decipher = createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}

/** What the settings show instead of the key: its last four characters. */
export function keyHint(plain: string): string {
	return plain.length <= 8 ? '' : plain.slice(-4);
}
