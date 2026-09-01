import { randomInt } from 'node:crypto';

/**
 * Passwords for accounts a teacher creates.
 *
 * These get printed on a sheet and typed by a ten-year-old, so the shape is
 * chosen for that: two short concrete words and two digits — `otterpebble47` —
 * which is memorable enough to survive the walk to the computer and long enough
 * to be worth having. Nothing here is a secret worth attacking; the account it
 * opens contains a child's puzzle solutions, and the first thing a teacher can
 * do is reset it.
 *
 * Two rules that are not negotiable: `randomInt` rather than `Math.random`, and
 * a word list with no letter pairs that read alike on a printout.
 */

/** Short, concrete, unambiguous when handwritten or read aloud. */
const WORDS = [
	'acorn', 'anchor', 'apple', 'arrow', 'badger', 'basket', 'beacon', 'bench',
	'berry', 'bison', 'blanket', 'bramble', 'branch', 'bridge', 'bubble', 'cactus',
	'candle', 'canoe', 'canyon', 'carrot', 'castle', 'cedar', 'cherry', 'clover',
	'cobweb', 'comet', 'compass', 'coral', 'cottage', 'crane', 'crayon', 'crumb',
	'daisy', 'dolphin', 'dragon', 'drum', 'eagle', 'ember', 'fable', 'falcon',
	'feather', 'fern', 'ferry', 'fiddle', 'flint', 'forest', 'fossil', 'fountain',
	'garden', 'ginger', 'glacier', 'gopher', 'granite', 'harbor', 'hazel', 'heron',
	'hollow', 'honey', 'iris', 'ivory', 'jasmine', 'juniper', 'kettle', 'kitten',
	'ladder', 'lagoon', 'lantern', 'lemon', 'lily', 'lobster', 'lumber', 'magnet',
	'mammoth', 'maple', 'marble', 'meadow', 'melon', 'mitten', 'monkey', 'moss',
	'muffin', 'nectar', 'noodle', 'nutmeg', 'oasis', 'olive', 'orbit', 'otter',
	'panda', 'parcel', 'parsley', 'peach', 'pebble', 'pelican', 'penguin', 'pepper',
	'pickle', 'pigeon', 'pillow', 'pine', 'planet', 'pocket', 'pond', 'poppy',
	'prairie', 'pretzel', 'pumpkin', 'puzzle', 'quartz', 'quilt', 'rabbit', 'radish',
	'raft', 'ribbon', 'river', 'robin', 'rocket', 'rope', 'saddle', 'salmon',
	'sandal', 'sapling', 'satchel', 'seal', 'shovel', 'silver', 'sparrow', 'spruce',
	'squirrel', 'stone', 'sugar', 'summit', 'sunset', 'tadpole', 'teapot', 'thistle',
	'thunder', 'timber', 'tulip', 'turtle', 'valley', 'velvet', 'walnut', 'walrus',
	'whistle', 'willow', 'window', 'winter', 'wombat', 'yarn', 'zebra'
] as const;

/**
 * `otterpebble47`. Roughly 21 bits from the words plus 6 from the digits — weak by
 * the standards of a password anyone chooses for themselves, and appropriate for
 * one that is issued, printed, and reset the moment it goes astray.
 */
export function generatePassword(): string {
	const first = WORDS[randomInt(WORDS.length)];
	const second = WORDS[randomInt(WORDS.length)];
	const digits = String(randomInt(10, 100));
	return `${first}${second}${digits}`;
}
