import type { Coord, Direction } from './level';

/**
 * What the engine tells the renderer happened.
 *
 * Events carry no durations: how long a move takes to draw is a
 * presentation concern, so `World` owns the timing table and the speed
 * multiplier. That keeps the engine renderable-agnostic and headlessly
 * testable, and makes a speed slider and a step button fall out for free.
 *
 * A *step* is a `WorldEvent[]` whose events animate **simultaneously** —
 * walking into a crate is one step of `[move, push]`. Successive steps
 * animate one after another.
 */
export type WorldEvent =
    | { kind: 'move';        from: Coord; to: Coord }
    | { kind: 'push';        crateId: string; from: Coord; to: Coord }
    /**
     * Belt motion — the world moving something rather than the robot moving
     * itself. Its own kinds rather than a reused `move`/`push` because it is
     * drawn differently: a conveyed robot is carried, so its wheels do not
     * roll, and a conveyed crate has no one pushing it.
     */
    | { kind: 'conveyRobot'; from: Coord; to: Coord }
    | { kind: 'conveyCrate'; crateId: string; from: Coord; to: Coord }
    | { kind: 'turn';        from: Direction; to: Direction; rotation: 'left' | 'right' }
    | { kind: 'pick';        crateId: string; from: Coord }
    | { kind: 'pickKeycard'; keycardId: string; from: Coord }
    | { kind: 'drop';        crateId: string; to: Coord }
    | { kind: 'deliver';     crateId: string; to: Coord }
    | { kind: 'door';        doorId: string; open: boolean }
    | { kind: 'switch';      position: Coord; on: boolean }
    | { kind: 'plate';       position: Coord; pressed: boolean }
    | { kind: 'sensor';      sensorId: string; active: boolean }
    /**
     * A crate delivered by being *pushed* onto a bay — a flourish only, with
     * no motion of its own. It cannot reuse `deliver`: a step animates its
     * events simultaneously, so `[push, deliver]` would put two tweens on one
     * mesh, and `deliver` also re-parents the crate out of the robot's hands,
     * which never held it.
     */
    | { kind: 'crateDelivered'; crateId: string }
    | { kind: 'bump';        at: Coord; toward: Coord }
    | { kind: 'crash';       at: Coord; reason: string }
    | { kind: 'goalReached' };

export type WorldEventKind = WorldEvent['kind'];

/**
 * The renderer, as the engine sees it. `World` implements this; so does
 * `nullPlayer`, which lets the engine run with no canvas at all.
 */
export interface EventPlayer {
    /** Resolves once this step has finished animating. */
    play(events: WorldEvent[]): Promise<void>;
}

/**
 * Rejection used when a run is torn down mid-step (reset, level change,
 * `destroy`). It is what lets a Stop button unwind an interpreter parked
 * inside `while (true) { moveForward(); }` — the run driver catches this
 * and returns quietly, while every other error propagates.
 */
export class RunCancelled extends Error {
    constructor() {
        super('Run cancelled');
        this.name = 'RunCancelled';
    }
}

/** Headless player — every step completes immediately. For engine tests. */
export const nullPlayer: EventPlayer = {
    play: () => Promise.resolve(),
};
