import { RunCancelled } from './events';

/**
 * Duration-based animation primitives and the queue that sequences them.
 *
 * Deliberately separate from the exponential smoothing inside the robot
 * model: that smoothing is asymptotic and can never report completion, so
 * it stays ambient (arms, idle motion) and never gates the queue. Anything
 * a caller `await`s — moves, turns, pushes — is a duration-based tween and
 * lives here.
 */

export interface Animation {
    update(deltaSeconds: number): void;
    readonly done: boolean;
    /** Jump straight to the end state and fire `onDone`. Used by reset. */
    finish(): void;
}


// ============================================================
// Easing
// ============================================================

export const linear = (t: number) => t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;


// ============================================================
// Primitives
// ============================================================

export function tween(opts: {
    durationSeconds: number;
    ease?: (t: number) => number;
    /** Receives the eased progress, 0 → 1. */
    onUpdate: (t: number) => void;
    onDone?: () => void;
}): Animation {
    const { durationSeconds, ease = linear, onUpdate, onDone } = opts;
    let elapsed = 0;
    let finished = false;

    const complete = () => {
        finished = true;
        onUpdate(ease(1));
        onDone?.();
    };

    return {
        get done() {
            return finished;
        },
        update(deltaSeconds) {
            if (finished) return;
            elapsed += deltaSeconds;
            if (durationSeconds <= 0 || elapsed >= durationSeconds) {
                complete();
                return;
            }
            onUpdate(ease(elapsed / durationSeconds));
        },
        finish() {
            if (!finished) complete();
        },
    };
}

/** Zero-duration animation — runs `fn` on its first update. */
export function instant(fn: () => void): Animation {
    return tween({ durationSeconds: 0, onUpdate: () => {}, onDone: fn });
}

/** Holds the queue open for `durationSeconds` without driving anything. */
export function hold(durationSeconds: number): Animation {
    return tween({ durationSeconds, onUpdate: () => {} });
}


// ============================================================
// Queue
// ============================================================

type Batch = {
    /**
     * Built when the batch becomes current, never at enqueue time — an
     * animation's start values (a crate's position, the robot's yaw) are
     * only known once the preceding batch has finished.
     */
    build: () => Animation[];
    resolve: () => void;
    reject: (error: unknown) => void;
};

export class AnimationQueue {
    /** Multiplies elapsed time. 2 = twice as fast. */
    speed = 1;

    private pending: Batch[] = [];
    private current: Batch | null = null;
    private active: Animation[] = [];

    get busy(): boolean {
        return this.current !== null || this.pending.length > 0;
    }

    /**
     * Enqueue one batch of concurrent animations.
     *
     * Enqueuing while busy appends rather than throwing, so a held-down
     * step button or an impatient click cannot desync the visuals from
     * the state they represent.
     */
    play(build: () => Animation[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.pending.push({ build, resolve, reject });
            this.start();
        });
    }

    /** Call once per frame. */
    update(deltaSeconds: number): void {
        this.start();
        if (!this.current) return;

        const dt = deltaSeconds * this.speed;
        for (const animation of this.active) animation.update(dt);

        // Retire only after this frame's update, so the final pose is
        // rendered before the caller is told the step is over.
        if (this.active.every((a) => a.done)) {
            const finished = this.current;
            this.current = null;
            this.active = [];
            finished.resolve();
            // Start the next batch in the same frame — no one-frame gap.
            this.start();
        }
    }

    /** Snap the in-flight batch to its end state, then drop the rest. */
    finishAll(): void {
        for (const animation of this.active) animation.finish();
        if (this.current) {
            this.current.resolve();
            this.current = null;
            this.active = [];
        }
        this.cancel();
    }

    /** Drop everything, rejecting each waiting caller with `RunCancelled`. */
    cancel(): void {
        const dropped = this.pending;
        this.pending = [];
        if (this.current) {
            const cancelled = this.current;
            this.current = null;
            this.active = [];
            cancelled.reject(new RunCancelled());
        }
        for (const batch of dropped) batch.reject(new RunCancelled());
    }

    private start(): void {
        if (this.current || this.pending.length === 0) return;
        const batch = this.pending.shift()!;
        this.current = batch;
        this.active = batch.build();
        // An empty or all-instant batch must still resolve, which the
        // next `update` handles.
        if (this.active.length === 0) {
            this.current = null;
            batch.resolve();
            this.start();
        }
    }
}
