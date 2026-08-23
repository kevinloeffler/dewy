import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { LanguageStage } from '$lib/game/level';

/**
 * The robot API, as the student writes it.
 *
 * These are bare globals, not methods on a `robot` object — see
 * `src/lib/game/robot.md`, which is the spec, and `RobotActions` /
 * `RobotSensors` in `src/lib/game/robot-api.ts`, which mirror it.
 *
 * `stage` is the language stage at which each name becomes available, so a
 * level can offer only what its students have been taught.
 */
export type RobotApiEntry = {
	label: string;
	detail: string;
	type: 'function' | 'keyword';
	info: string;
	stage: LanguageStage;
};

export const ROBOT_API: readonly RobotApiEntry[] = [
	// ── Stage 1 — actions ────────────────────────────────────────────────
	{
		label: 'moveForward',
		detail: '()',
		type: 'function',
		info: 'Move one tile in the current facing direction. Pushes a crate ahead if there is room behind it.',
		stage: 1,
	},
	{
		label: 'turnLeft',
		detail: '()',
		type: 'function',
		info: 'Rotate 90° counter-clockwise (N→W→S→E).',
		stage: 1,
	},
	{
		label: 'turnRight',
		detail: '()',
		type: 'function',
		info: 'Rotate 90° clockwise (N→E→S→W).',
		stage: 1,
	},
	{
		label: 'pick',
		detail: '()',
		type: 'function',
		info: 'Pick up the crate or keycard on the tile ahead. Crates go in the hands, keycards into the inventory.',
		stage: 1,
	},
	{
		label: 'drop',
		detail: '()',
		type: 'function',
		info: 'Place the carried crate onto the tile ahead.',
		stage: 1,
	},
	{
		label: 'open',
		detail: '()',
		type: 'function',
		info: 'Unlock the door on the tile ahead, consuming the matching keycard.',
		stage: 1,
	},
	{
		label: 'toggle',
		detail: '()',
		type: 'function',
		info: 'Flip the switch on the tile ahead.',
		stage: 1,
	},

	// ── Stage 2 — loops ──────────────────────────────────────────────────
	{
		label: 'repeat',
		detail: '(n) { … }',
		type: 'keyword',
		info: 'Run a block n times.',
		stage: 2,
	},

	// ── Stage 3 — sensing ────────────────────────────────────────────────
	{
		label: 'isBlocked',
		detail: '()',
		type: 'function',
		info: 'True if moving forward would crash. A pushable crate with space behind it is not blocked.',
		stage: 3,
	},
	{
		label: 'isCrate',
		detail: '()',
		type: 'function',
		info: 'True if there is a crate on the tile ahead.',
		stage: 3,
	},
	{
		label: 'isCarrying',
		detail: '()',
		type: 'function',
		info: 'True if the robot is holding a crate. Keycards do not count.',
		stage: 3,
	},
	{
		label: 'isGoal',
		detail: '()',
		type: 'function',
		info: 'True if the robot is standing on the target square. The one sensor that checks the current tile.',
		stage: 3,
	},
	{
		label: 'isDropOff',
		detail: '()',
		type: 'function',
		info: 'True if the tile ahead is a drop-off bay.',
		stage: 3,
	},
	{
		label: 'crateColor',
		detail: '()',
		type: 'function',
		info: 'The colour of the carried crate as a string, or null for a grey crate or empty hands.',
		stage: 3,
	},
	{
		label: 'isDangerous',
		detail: '()',
		type: 'function',
		info: "True if the tile ahead is inside a motion sensor's forbidden zone.",
		stage: 3,
	},
];

/**
 * Completions for the robot API, optionally limited to what the level's
 * language stage has introduced.
 */
export function robotCompletions(maxStage: LanguageStage = 5) {
	const available = ROBOT_API.filter((entry) => entry.stage <= maxStage);

	return (context: CompletionContext): CompletionResult | null => {
		const before = context.matchBefore(/\w*/);
		if (!before || (before.from === before.to && !context.explicit)) return null;

		return {
			from: before.from,
			options: available.map((entry) => ({
				label: entry.label,
				detail: entry.detail,
				type: entry.type,
				info: entry.info,
				apply: entry.type === 'keyword' ? entry.label : entry.label + '()',
			})),
		};
	};
}
