import { GameEngine } from './engine';
import { nullPlayer } from './events';
import { createRobotApi } from './robot-api';
import { runScript, type RunResult } from './script';
import type { Level } from './level';

/**
 * Runs a program on one world with nothing drawn — how the player learns
 * whether the student's code solves the variants that are not on screen.
 *
 * The same engine and interpreter the animated run uses, minus the
 * animation: `nullPlayer` resolves every step at once. Both are
 * deterministic, so this is exactly what the student would see if they
 * watched that variant play. Runaway programs end the same way they do on
 * screen — the battery, the 500-command cap, the loop limit — and the
 * interpreter yields to the browser as it goes, so even nine of them at once
 * never freeze the tab.
 */
export function runHeadless(level: Level, code: string): Promise<RunResult> {
    const engine = new GameEngine(level, { energy: level.options.energy });
    return runScript(code, {
        api: createRobotApi(engine, nullPlayer),
        stage: level.options.languageStage,
    });
}
