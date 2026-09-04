import type { CrateColor } from './crate-color';
import type { EventPlayer } from './events';
import type { GameEngine, StepOutcome } from './engine';
import type { CrashReason } from './crash-reasons';

/**
 * The robot API as the interpreter will see it — the bare globals in
 * `robot.md`, backed by `GameEngine` and wired to a renderer.
 *
 * Actions are async because each awaits its own animation: that is what
 * keeps the editor's executing-line indicator honest about what is on
 * screen. Sensing stays synchronous — it reads state, animates nothing and
 * costs no step.
 *
 * Names here, in `GameEngine` and in `ROBOT_API` (`$lib/codemirror/completions`)
 * must stay identical; that list is what students get completions from.
 */

/**
 * Thrown when an action is illegal. Execution must stop at the offending
 * line, and an exception is the only mechanism that does that for free —
 * a returned status would need the interpreter to check after every single
 * call, and one missed check silently continues a crashed run.
 */
export class RobotCrash extends Error {
    constructor(readonly reason: CrashReason) {
        super(reason.message);
        this.name = 'RobotCrash';
    }
}

/** Thrown once every goal is satisfied, so a solved program stops there. */
export class LevelComplete extends Error {
    constructor() {
        super('Level geschafft');
        this.name = 'LevelComplete';
    }
}

export interface RobotActions {
    moveForward(): Promise<void>;
    turnLeft(): Promise<void>;
    turnRight(): Promise<void>;
    pick(): Promise<void>;
    drop(): Promise<void>;
    open(): Promise<void>;
    toggle(): Promise<void>;
}

export interface RobotSensors {
    isBlocked(): boolean;
    isCrate(): boolean;
    isCarrying(): boolean;
    isGoal(): boolean;
    isDropOff(): boolean;
    crateColor(): CrateColor | null;
    isDangerous(): boolean;
}

export type RobotApi = RobotActions & RobotSensors;

export function createRobotApi(engine: GameEngine, player: EventPlayer): RobotApi {

    async function run(outcome: StepOutcome): Promise<void> {
        // Play every step before reporting the outcome, so the student sees
        // the bump before the panic. `RunCancelled` from the player must
        // propagate untouched — a Stop button is not a crash.
        for (const step of outcome.events) {
            await player.play(step);
        }
        if (outcome.status === 'crash' && outcome.reason) throw new RobotCrash(outcome.reason);
        if (outcome.status === 'complete') throw new LevelComplete();
    }

    return {
        moveForward: () => run(engine.moveForward()),
        turnLeft:    () => run(engine.turnLeft()),
        turnRight:   () => run(engine.turnRight()),
        pick:        () => run(engine.pick()),
        drop:        () => run(engine.drop()),
        open:        () => run(engine.open()),
        toggle:      () => run(engine.toggle()),

        isBlocked:   () => engine.isBlocked(),
        isCrate:     () => engine.isCrate(),
        isCarrying:  () => engine.isCarrying(),
        isGoal:      () => engine.isGoal(),
        isDropOff:   () => engine.isDropOff(),
        crateColor:  () => engine.crateColor(),
        isDangerous: () => engine.isDangerous(),
    };
}
