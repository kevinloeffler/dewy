/**
 * Turning a pasted class list into accounts.
 *
 * A teacher's raw material is a list of names copied out of a spreadsheet, so
 * everything here is built for that: forgiving about separators, strict about
 * what it produces. The rules are pure and live away from the database because
 * the bulk-creation page previews them in the browser before anything is
 * written, and the server applies the same functions again on submit — the
 * preview cannot promise a username the server would not mint.
 */

/** Longest run of characters better-auth's username plugin will accept. */
export const MAX_USERNAME_LENGTH = 30;
export const MIN_USERNAME_LENGTH = 3;

export type StudentDraft = {
	name: string;
	/** Proposed, not final — `assignUsernames` resolves collisions. */
	username: string;
};

const DIACRITICS: Record<string, string> = {
	ä: 'ae',
	ö: 'oe',
	ü: 'ue',
	ß: 'ss',
	å: 'aa',
	æ: 'ae',
	ø: 'oe'
};

/**
 * `Müller` → `mueller`.
 *
 * German and Nordic spellings are transliterated rather than stripped, because
 * `mller` is not a name anybody recognises as theirs. Everything else falls back
 * to Unicode decomposition, which turns `é` into `e`.
 */
function fold(value: string): string {
	return value
		.toLowerCase()
		.replace(/[äöüßåæø]/g, (char) => DIACRITICS[char] ?? char)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, '');
}

/**
 * `Marie Muster` → `mmuster`. First initial plus family name is the shape
 * schools already use on registers, so it reads as familiar rather than
 * generated.
 *
 * Returns `''` when a line holds nothing usable; callers treat that as a bad
 * row rather than inventing a name.
 */
export function slugUsername(name: string): string {
	const parts = name.trim().split(/\s+/).map(fold).filter(Boolean);
	if (parts.length === 0) return '';

	const base =
		parts.length === 1 ? parts[0] : `${parts[0].slice(0, 1)}${parts.slice(1).join('')}`;

	return base.slice(0, MAX_USERNAME_LENGTH);
}

/**
 * Makes `candidate` unique against `taken`, appending 2, 3, 4… and trimming the
 * stem so the result still fits. Case-insensitive, because the username plugin
 * normalises before it checks.
 */
export function dedupe(candidate: string, taken: Iterable<string>): string {
	const used = new Set([...taken].map((value) => value.toLowerCase()));
	if (!used.has(candidate.toLowerCase())) return candidate;

	for (let suffix = 2; ; suffix += 1) {
		const tail = String(suffix);
		const stem = candidate.slice(0, MAX_USERNAME_LENGTH - tail.length);
		const next = `${stem}${tail}`;
		if (!used.has(next.toLowerCase())) return next;
	}
}

export function isValidUsername(value: string): boolean {
	return (
		value.length >= MIN_USERNAME_LENGTH &&
		value.length <= MAX_USERNAME_LENGTH &&
		/^[a-z0-9_.-]+$/.test(value)
	);
}

/**
 * Reads a pasted roster.
 *
 * One student per line. A comma or tab after the name overrides the generated
 * username, which is how a teacher keeps a school-issued handle. Blank lines and
 * stray whitespace are dropped rather than reported — they are an artefact of
 * copy-paste, not a mistake worth interrupting anyone over.
 */
export function parseRoster(text: string): StudentDraft[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [rawName, rawUsername] = line.split(/[,\t]/, 2).map((part) => part?.trim() ?? '');
			const name = rawName.replace(/\s+/g, ' ');
			return { name, username: rawUsername ? fold(rawUsername) : slugUsername(name) };
		})
		.filter((draft) => draft.name.length > 0);
}

/**
 * Settles the usernames for a whole batch in one pass.
 *
 * Collisions are resolved against `taken` *and* against names minted earlier in
 * the same batch — two `Marie Muster`s in one paste is the case that matters,
 * and checking the database alone would hand both the same handle.
 */
export function assignUsernames(drafts: StudentDraft[], taken: Iterable<string>): StudentDraft[] {
	const used = new Set([...taken].map((value) => value.toLowerCase()));

	return drafts.map((draft) => {
		// A name too short to make a legal username (`Li`) gets numbered rather
		// than padded with a letter that was never part of anybody's name.
		let base = draft.username || slugUsername(draft.name);
		for (let n = 1; base.length > 0 && base.length < MIN_USERNAME_LENGTH; n += 1) {
			base = `${base}${n}`;
		}

		const username = dedupe(base, used);
		used.add(username.toLowerCase());
		return { name: draft.name, username };
	});
}
