import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, keyHint, parseSecretKey } from './crypto';

const key = randomBytes(32);

describe('encryptSecret / decryptSecret', () => {
	it('round-trips', () => {
		const blob = encryptSecret('sk-test-1234567890', key);
		expect(blob.startsWith('v1:')).toBe(true);
		expect(blob).not.toContain('sk-test');
		expect(decryptSecret(blob, key)).toBe('sk-test-1234567890');
	});

	it('uses a fresh IV every time', () => {
		expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
	});

	it('refuses a wrong key instead of returning garbage', () => {
		expect(decryptSecret(encryptSecret('secret', key), randomBytes(32))).toBeNull();
	});

	it('refuses a tampered blob', () => {
		const [v, iv, tag, ct] = encryptSecret('secret', key).split(':');
		const flipped = Buffer.from(ct, 'base64');
		flipped[0] ^= 1;
		expect(decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'), key)).toBeNull();
	});

	it('refuses an unknown format', () => {
		expect(decryptSecret('plaintext', key)).toBeNull();
		expect(decryptSecret('v2:a:b:c', key)).toBeNull();
	});
});

describe('parseSecretKey', () => {
	it('reads base64 and hex', () => {
		expect(parseSecretKey(key.toString('base64'))?.equals(key)).toBe(true);
		expect(parseSecretKey(key.toString('hex'))?.equals(key)).toBe(true);
	});

	it('treats missing or short keys as unset', () => {
		expect(parseSecretKey(undefined)).toBeNull();
		expect(parseSecretKey('')).toBeNull();
		expect(parseSecretKey('too-short')).toBeNull();
		expect(parseSecretKey(randomBytes(16).toString('base64'))).toBeNull();
	});
});

describe('keyHint', () => {
	it('shows the last four characters of a real key only', () => {
		expect(keyHint('sk-abcdefghijkl')).toBe('ijkl');
		expect(keyHint('short')).toBe('');
	});
});
