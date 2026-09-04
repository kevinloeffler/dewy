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
		info: 'Geht ein Feld in Blickrichtung. Schiebt eine Kiste davor weiter, wenn dahinter Platz ist.',
		stage: 1,
	},
	{
		label: 'turnLeft',
		detail: '()',
		type: 'function',
		info: 'Dreht 90° nach links (N→W→S→O).',
		stage: 1,
	},
	{
		label: 'turnRight',
		detail: '()',
		type: 'function',
		info: 'Dreht 90° nach rechts (N→O→S→W).',
		stage: 1,
	},
	{
		label: 'pick',
		detail: '()',
		type: 'function',
		info: 'Hebt die Kiste oder Keycard auf dem Feld davor auf. Kisten kommen in die Hände, Keycards ins Inventar.',
		stage: 1,
	},
	{
		label: 'drop',
		detail: '()',
		type: 'function',
		info: 'Stellt die getragene Kiste auf das Feld davor.',
		stage: 1,
	},
	{
		label: 'open',
		detail: '()',
		type: 'function',
		info: 'Öffnet die Tür auf dem Feld davor und verbraucht dabei die passende Keycard.',
		stage: 1,
	},
	{
		label: 'toggle',
		detail: '()',
		type: 'function',
		info: 'Betätigt den Schalter auf dem Feld davor.',
		stage: 1,
	},

	// ── Stage 2 — loops ──────────────────────────────────────────────────
	{
		label: 'repeat',
		detail: '(n) { … }',
		type: 'keyword',
		info: 'Führt einen Block n-mal aus.',
		stage: 2,
	},

	// ── Stage 3 — sensing ────────────────────────────────────────────────
	{
		label: 'isBlocked',
		detail: '()',
		type: 'function',
		info: 'Wahr, wenn ein Schritt vorwärts einen Crash gäbe. Eine schiebbare Kiste mit Platz dahinter blockiert nicht.',
		stage: 3,
	},
	{
		label: 'isCrate',
		detail: '()',
		type: 'function',
		info: 'Wahr, wenn auf dem Feld davor eine Kiste steht.',
		stage: 3,
	},
	{
		label: 'isCarrying',
		detail: '()',
		type: 'function',
		info: 'Wahr, wenn der Roboter eine Kiste trägt. Keycards zählen nicht.',
		stage: 3,
	},
	{
		label: 'isGoal',
		detail: '()',
		type: 'function',
		info: 'Wahr, wenn der Roboter auf dem Zielfeld steht. Der einzige Sensor, der das aktuelle Feld prüft.',
		stage: 3,
	},
	{
		label: 'isDropOff',
		detail: '()',
		type: 'function',
		info: 'Wahr, wenn das Feld davor eine Abgabestelle ist.',
		stage: 3,
	},
	{
		label: 'crateColor',
		detail: '()',
		type: 'function',
		info: 'Die Farbe der getragenen Kiste als Text, oder null bei einer grauen Kiste oder leeren Händen.',
		stage: 3,
	},
	{
		label: 'isDangerous',
		detail: '()',
		type: 'function',
		info: 'Wahr, wenn das Feld davor in der Sperrzone eines Bewegungsmelders liegt.',
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
