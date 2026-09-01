import { describe, expect, it } from 'vitest';
import {
	assignUsernames,
	dedupe,
	isValidUsername,
	MAX_USERNAME_LENGTH,
	parseRoster,
	slugUsername
} from './roster';

describe('slugUsername', () => {
	it('takes the first initial and the family name', () => {
		expect(slugUsername('Marie Muster')).toBe('mmuster');
		expect(slugUsername('Jean-Luc Picard')).toBe('jpicard');
	});

	it('keeps a single name whole', () => {
		expect(slugUsername('Aylin')).toBe('aylin');
	});

	it('joins every name after the first', () => {
		expect(slugUsername('Ana Maria Rodriguez Lopez')).toBe('amariarodriguezlopez');
	});

	it('transliterates rather than strips', () => {
		expect(slugUsername('Lena Müller')).toBe('lmueller');
		expect(slugUsername('Nils Åberg')).toBe('naaberg');
		expect(slugUsername('Zoé René')).toBe('zrene');
	});

	it('drops punctuation and collapses whitespace', () => {
		expect(slugUsername("  Sean   O'Brien  ")).toBe('sobrien');
	});

	it('returns empty for a line with nothing usable', () => {
		expect(slugUsername('   ')).toBe('');
		expect(slugUsername('!!!')).toBe('');
	});

	it('never exceeds the length better-auth accepts', () => {
		const long = slugUsername(`Wolfgang ${'Schmidt'.repeat(10)}`);
		expect(long.length).toBe(MAX_USERNAME_LENGTH);
		expect(isValidUsername(long)).toBe(true);
	});
});

describe('dedupe', () => {
	it('leaves a free name alone', () => {
		expect(dedupe('mmuster', ['other'])).toBe('mmuster');
	});

	it('numbers collisions in order', () => {
		expect(dedupe('mmuster', ['mmuster'])).toBe('mmuster2');
		expect(dedupe('mmuster', ['mmuster', 'mmuster2'])).toBe('mmuster3');
	});

	it('ignores case, because the username plugin normalises', () => {
		expect(dedupe('mmuster', ['MMuster'])).toBe('mmuster2');
	});

	it('trims the stem so the numbered name still fits', () => {
		const taken = 'a'.repeat(MAX_USERNAME_LENGTH);
		const result = dedupe(taken, [taken]);
		expect(result.length).toBe(MAX_USERNAME_LENGTH);
		expect(result.endsWith('2')).toBe(true);
	});
});

describe('parseRoster', () => {
	it('reads one student per line', () => {
		expect(parseRoster('Marie Muster\nTom Meier')).toEqual([
			{ name: 'Marie Muster', username: 'mmuster' },
			{ name: 'Tom Meier', username: 'tmeier' }
		]);
	});

	it('lets a comma or tab override the username', () => {
		expect(parseRoster('Marie Muster, muster.m\nTom Meier\ttmei')).toEqual([
			{ name: 'Marie Muster', username: 'musterm' },
			{ name: 'Tom Meier', username: 'tmei' }
		]);
	});

	it('drops blank lines and normalises spacing', () => {
		expect(parseRoster('\n  Marie   Muster  \n\n\n')).toEqual([
			{ name: 'Marie Muster', username: 'mmuster' }
		]);
	});
});

describe('assignUsernames', () => {
	it('separates two identical names in the same paste', () => {
		const result = assignUsernames(parseRoster('Marie Muster\nMarie Muster'), []);
		expect(result.map((draft) => draft.username)).toEqual(['mmuster', 'mmuster2']);
	});

	it('avoids usernames already in the database', () => {
		const result = assignUsernames(parseRoster('Marie Muster'), ['mmuster', 'mmuster2']);
		expect(result[0].username).toBe('mmuster3');
	});

	it('numbers a name too short to be a legal username', () => {
		const result = assignUsernames(parseRoster('Li'), []);
		expect(result[0].username).toBe('li1');
		expect(isValidUsername(result[0].username)).toBe(true);
	});

	it('always produces something better-auth will accept', () => {
		const roster = parseRoster('Marie Muster\nMarie Muster\nLi\nNils Åberg\nZoé René');
		for (const draft of assignUsernames(roster, ['mmuster'])) {
			expect(isValidUsername(draft.username)).toBe(true);
		}
	});
});
