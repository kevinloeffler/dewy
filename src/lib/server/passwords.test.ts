import { describe, expect, it } from 'vitest';
import { generatePassword } from './passwords';

describe('generatePassword', () => {
	it('produces two words and two digits', () => {
		expect(generatePassword()).toMatch(/^[a-z]{6,}[0-9]{2}$/);
	});

	it("is long enough for better-auth's eight-character minimum", () => {
		for (let i = 0; i < 200; i += 1) {
			expect(generatePassword().length).toBeGreaterThanOrEqual(8);
		}
	});

	it('does not repeat itself', () => {
		const seen = new Set(Array.from({ length: 200 }, generatePassword));
		expect(seen.size).toBeGreaterThan(190);
	});
});
