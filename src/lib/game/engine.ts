import type { Coord, Level, TileKey } from './level';
import type { CrateColor } from './crate-color';
import type { LevelState, DoorState, MotionSensorState, GoalConditionState } from './level-state';
import type { WorldEvent } from './events';
import { createLevelState } from './level-state';
import { ahead, coordKey, sameCoord, tileAt, turn } from './grid';
import { crash, type CrashReason } from './crash-reasons';
import {
    bayAccepts,
    beltDirection,
    crateAt,
    crateById,
    crateBlockedBy,
    keycardAt,
    platePressedAt,
    sensorForbidding,
    tileBlocksCrate,
    tileBlocksRobot,
    type Blocker,
} from './rules';

/**
 * The rules of the game — the only place that decides what is legal.
 *
 * Deliberately synchronous and free of Three.js, Svelte and promises: it
 * mutates `LevelState` and returns the `WorldEvent`s describing what
 * happened. `robot-api.ts` wraps it to await the animation of each step,
 * and `World` draws them. That split is what lets the whole rule set be
 * unit-tested in plain Node.
 */

/**
 * Safety net, not a game rule: how far an *unbudgeted* run may go before we
 * call it a runaway loop. A level that authors `energy` bounds itself, so
 * this only applies when it does not.
 */
const RUNAWAY_ACTION_CAP = 500;

/** Settle is a fixpoint loop; this bounds it if a rule ever oscillates. */
const SETTLE_PASSES = 8;

export type StepOutcome = {
    status: 'ok' | 'crash' | 'complete';
    reason: CrashReason | null;
    /**
     * A list of *steps*. Events inside one step animate together; the steps
     * themselves play in order. One action can produce several: move, then
     * the plate under the robot opening a door, then a sensor firing.
     */
    events: WorldEvent[][];
};

/**
 * Something a belt is trying to move this tick.
 *
 * `key` is the occupancy key rather than the crate id, so a crate authored
 * with the id `"robot"` cannot shadow the robot itself.
 */
type Rider = {
    key: string;
    crateId: string | null;
    from: Coord;
    to: Coord;
};

/**
 * Tiles each rider has already crossed during the current ride, keyed as
 * `Rider.key`. A belt that loops back on itself would otherwise carry its
 * rider round forever; stopping one the moment it would revisit a tile ends
 * the loop after exactly one lap, and bounds every ride to the grid.
 */
type BeltRide = Map<string, Set<TileKey>>;

const ROBOT_KEY = 'robot';

function crateKey(crateId: string): string {
    return `crate:${crateId}`;
}

/** What `moveForward` is about to do — also the answer to `isBlocked()`. */
type MoveCheck =
    | { kind: 'move'; target: Coord }
    | { kind: 'push'; target: Coord; crateId: string; behind: Coord }
    | { kind: 'fall'; target: Coord }
    | { kind: 'blocked'; target: Coord; reason: CrashReason };


export class GameEngine {

    readonly level: Level;
    private levelState: LevelState;
    /** The level's authored battery, in commands. `null` means unlimited. */
    private readonly energy: number | null;

    /**
     * Safety net on the belt ride, not a game rule: no rider may revisit a
     * tile, so a ride is already bounded — this only stops a future rule from
     * hanging the loop.
     */
    private readonly rideCap: number;

    /** Authored door/sensor values, so settle can express either polarity. */
    private readonly initialDoorOpen = new Map<string, boolean>();
    private readonly initialSensorActive = new Map<string, boolean>();

    constructor(level: Level, options: { energy?: number | null } = {}) {
        this.level = level;
        this.energy = options.energy ?? null;
        this.rideCap = level.width * level.height + 1;

        for (const tile of Object.values(level.tiles)) {
            if (tile?.kind === 'door') this.initialDoorOpen.set(tile.doorId, tile.initiallyOpen);
        }
        for (const sensor of level.motionSensors) {
            this.initialSensorActive.set(sensor.sensorId, sensor.initiallyActive);
        }

        this.levelState = createLevelState(level);
        this.initialize();
    }

    get state(): LevelState {
        return this.levelState;
    }

    /**
     * Bring derived state to a fixpoint before anything runs.
     *
     * Without this, a crate authored standing on a pressure plate renders
     * with its door shut and only springs open on the first move, and a
     * level whose robot starts on the goal tile can never complete.
     *
     * Returns the events that got it there. Callers loading a fresh level
     * should ignore them and snap the scene with `World.applyState` instead.
     */
    initialize(): WorldEvent[][] {
        const steps: WorldEvent[][] = [];
        const settled = this.settle();
        if (settled.length > 0) steps.push(settled);
        if (this.latchGoals()) {
            this.levelState.completed = true;
            steps.push([{ kind: 'goalReached' }]);
        }
        return steps;
    }

    /** Start over. Equivalent to constructing a new engine for this level. */
    reset(): void {
        this.levelState = createLevelState(this.level);
        this.initialize();
    }


    // ========================================================
    // Actions
    // ========================================================

    moveForward(): StepOutcome {
        const halted = this.beginAction();
        if (halted) return halted;

        const robot = this.levelState.robot;
        const from = { ...robot.position };
        const check = this.checkMove();

        if (check.kind === 'blocked') {
            return this.fail([[{ kind: 'bump', at: from, toward: { ...check.target } }]], check.reason);
        }

        if (check.kind === 'fall') {
            // The robot really does end up in the pit. Leaving state behind
            // the screen would let `applyState` snap it back out of the hole.
            robot.position = { ...check.target };
            this.syncCarried();
            return this.fail([[{ kind: 'move', from, to: { ...check.target } }]], crash('pit'));
        }

        const step: WorldEvent[] = [{ kind: 'move', from, to: { ...check.target } }];

        if (check.kind === 'push') {
            const crate = crateById(this.levelState, check.crateId)!;
            crate.position = { ...check.behind };
            step.push({
                kind: 'push',
                crateId: crate.id,
                from: { ...check.target },
                to: { ...check.behind },
            });
        }

        robot.position = { ...check.target };
        this.syncCarried();
        return this.finish([step]);
    }

    turnLeft(): StepOutcome {
        return this.rotate('left');
    }

    turnRight(): StepOutcome {
        return this.rotate('right');
    }

    pick(): StepOutcome {
        const halted = this.beginAction();
        if (halted) return halted;

        const robot = this.levelState.robot;
        const target = this.tileAhead();

        const crate = crateAt(this.levelState, target);
        if (crate) {
            if (crate.delivered) return this.fail([], crash('crate_delivered'));
            if (robot.carrying) return this.fail([], crash('already_carrying'));

            crate.carried = true;
            crate.position = { ...robot.position };
            robot.carrying = crate.id;
            return this.finish([[{ kind: 'pick', crateId: crate.id, from: { ...target } }]]);
        }

        // Keycards are pocketed even with a crate in hand — robot.md allows
        // holding a crate and carrying keycards at the same time.
        const keycard = keycardAt(this.levelState, target);
        if (keycard) {
            keycard.collected = true;
            robot.inventory.push(keycard.doorId);
            return this.finish([[{ kind: 'pickKeycard', keycardId: keycard.id, from: { ...target } }]]);
        }

        return this.fail([], crash('nothing_to_pick'));
    }

    drop(): StepOutcome {
        const halted = this.beginAction();
        if (halted) return halted;

        const robot = this.levelState.robot;
        if (!robot.carrying) return this.fail([], crash('not_carrying'));

        const crate = crateById(this.levelState, robot.carrying)!;
        const target = this.tileAhead();

        const blocker = crateBlockedBy(this.level, this.levelState, target);
        if (blocker) return this.fail([], reasonFor(blocker));

        crate.carried = false;
        crate.position = { ...target };
        robot.carrying = null;

        const tile = tileAt(this.level, target)!;
        if (tile.kind === 'drop_off' && bayAccepts(tile, crate)) {
            // Latched here rather than in settle, so the delivery plays as
            // the arc out of the robot's hand instead of a second flourish.
            crate.delivered = true;
            return this.finish([[{ kind: 'deliver', crateId: crate.id, to: { ...target } }]]);
        }

        return this.finish([[{ kind: 'drop', crateId: crate.id, to: { ...target } }]]);
    }

    open(): StepOutcome {
        const halted = this.beginAction();
        if (halted) return halted;

        const robot = this.levelState.robot;
        const target = this.tileAhead();
        const tile = tileAt(this.level, target);
        if (tile?.kind !== 'door') return this.fail([], crash('not_a_door'));

        const door = this.levelState.doors.find((d) => d.doorId === tile.doorId)!;
        const held = robot.inventory.indexOf(tile.doorId);

        if (held === -1) {
            if (door.unlocked) return this.finish([]);
            const exists = this.level.items.some(
                (item) => item.kind === 'keycard' && item.doorId === tile.doorId,
            );
            return this.fail([], crash(exists ? 'no_keycard' : 'no_keyhole'));
        }

        // Spend the card even if the door currently reads open — a door held
        // open by a plate would otherwise slam shut the moment the robot
        // stepped off, with the keycard still in its pocket.
        robot.inventory.splice(held, 1);
        door.unlocked = true;
        return this.finish([]);
    }

    toggle(): StepOutcome {
        const halted = this.beginAction();
        if (halted) return halted;

        const target = this.tileAhead();
        const tile = tileAt(this.level, target);
        if (tile?.kind !== 'switch') return this.fail([], crash('not_a_switch'));

        const lever = this.levelState.switches.find((s) => sameCoord(s.position, target))!;
        lever.on = !lever.on;
        return this.finish([[{ kind: 'switch', position: { ...target }, on: lever.on }]]);
    }


    // ========================================================
    // Sensing — synchronous, no mutation, no events, no step cost
    // ========================================================

    /**
     * Whether moving forward would stop the robot.
     *
     * Physical obstruction only. A motion sensor's zone is walkable floor
     * that happens to be fatal, and `isDangerous()` is what reports it —
     * otherwise `isDangerous()` would have nothing left to say.
     */
    isBlocked(): boolean {
        const check = this.checkMove();
        return check.kind === 'blocked' || check.kind === 'fall';
    }

    isCrate(): boolean {
        return crateAt(this.levelState, this.tileAhead()) !== null;
    }

    isCarrying(): boolean {
        return this.levelState.robot.carrying !== null;
    }

    /** The one sensor that reads the robot's *current* tile. */
    isGoal(): boolean {
        return tileAt(this.level, this.levelState.robot.position)?.kind === 'goal';
    }

    isDropOff(): boolean {
        return tileAt(this.level, this.tileAhead())?.kind === 'drop_off';
    }

    crateColor(): CrateColor | null {
        const id = this.levelState.robot.carrying;
        if (!id) return null;
        const crate = crateById(this.levelState, id);
        return crate?.kind === 'crate_colour' ? crate.color : null;
    }

    isDangerous(): boolean {
        return sensorForbidding(this.level, this.levelState, this.tileAhead()) !== null;
    }


    // ========================================================
    // Move planning — shared by moveForward and isBlocked
    // ========================================================

    private checkMove(): MoveCheck {
        const { position, facing } = this.levelState.robot;
        const target = ahead(position, facing);

        const crate = crateAt(this.levelState, target);
        if (crate) {
            if (crate.delivered) {
                return { kind: 'blocked', target, reason: crash('crate_delivered') };
            }
            // No chain-pushing: a crate behind a crate is itself a blocker.
            const behind = ahead(target, facing);
            const crateBlocker = crateBlockedBy(this.level, this.levelState, behind);
            if (crateBlocker) {
                return { kind: 'blocked', target, reason: crash('crate_blocked') };
            }
            // The robot still has to be able to stand where the crate was —
            // a crate sitting on a cargo belt cannot be pushed off it.
            const ownBlocker = tileBlocksRobot(this.level, this.levelState, target);
            if (ownBlocker) {
                return { kind: 'blocked', target, reason: reasonFor(ownBlocker) };
            }
            return { kind: 'push', target, crateId: crate.id, behind };
        }

        const blocker = tileBlocksRobot(this.level, this.levelState, target);
        if (!blocker) return { kind: 'move', target };
        if (blocker.kind === 'pit') return { kind: 'fall', target };
        return { kind: 'blocked', target, reason: reasonFor(blocker) };
    }


    // ========================================================
    // The shared postlude
    // ========================================================

    private beginAction(): StepOutcome | null {
        const state = this.levelState;
        if (state.failed) return { status: 'crash', reason: null, events: [] };
        if (state.completed) return { status: 'complete', reason: null, events: [] };

        state.steps++;
        if (this.energy !== null) {
            if (state.steps > this.energy) return this.fail([], crash('out_of_energy'));
        } else if (state.steps > RUNAWAY_ACTION_CAP) {
            return this.fail([], crash('runaway'));
        }
        return null;
    }

    /**
     * Runs after every action that changed the world — then once more for
     * every tile of belt the world carries anything along.
     *
     * One turn of the loop is one tick of the world, and the order inside it
     * is load-bearing. Settle first, so stepping onto a plate that suppresses
     * a sensor works within the same action, and so a door the ride's own
     * weight opens is open before the ride reaches it. Then the sensor check,
     * which beats goals — a run that both delivers the last crate and trips a
     * sensor is a crash. The belt tick comes last, so a forbidden tile the
     * ride merely passes *through* still fires, and a goal it crosses still
     * counts.
     */
    private finish(steps: WorldEvent[][]): StepOutcome {
        const ride: BeltRide = new Map();

        for (let tick = 0; tick <= this.rideCap; tick++) {
            const settled = this.settle();
            if (settled.length > 0) steps.push(settled);

            const tripped = sensorForbidding(this.level, this.levelState, this.levelState.robot.position);
            if (tripped) return this.fail(steps, crash('motion_sensor'));

            if (this.latchGoals()) {
                this.levelState.completed = true;
                steps.push([{ kind: 'goalReached' }]);
                return { status: 'complete', reason: null, events: steps };
            }

            // Each tile of the ride is its own step, so it plays out tile by
            // tile on screen rather than teleporting to the end of the belt.
            const conveyed = this.convey(ride);
            if (conveyed.length === 0) break;
            steps.push(conveyed);
        }

        return { status: 'ok', reason: null, events: steps };
    }

    private fail(steps: WorldEvent[][], reason: CrashReason): StepOutcome {
        this.levelState.failed = true;
        this.levelState.failReason = reason.message;
        steps.push([{
            kind: 'crash',
            at: { ...this.levelState.robot.position },
            reason: reason.message,
        }]);
        return { status: 'crash', reason, events: steps };
    }

    /**
     * Recompute everything derived, emitting only what actually changed.
     *
     * A loop rather than a single pass: nothing today moves anything during
     * settle, but conveyor motion will, and moving a crate changes which
     * plates are pressed. Bounded so a future oscillating rule cannot hang.
     */
    private settle(): WorldEvent[] {
        const events: WorldEvent[] = [];
        const state = this.levelState;

        for (let pass = 0; pass < SETTLE_PASSES; pass++) {
            let changed = false;

            for (const plate of state.plates) {
                const pressed = platePressedAt(state, plate.position);
                if (pressed === plate.pressed) continue;
                plate.pressed = pressed;
                events.push({ kind: 'plate', position: { ...plate.position }, pressed });
                changed = true;
            }

            for (const door of state.doors) {
                const open = this.doorShouldBeOpen(door);
                if (open === door.open) continue;
                // A door never closes on whoever is standing in it. Without
                // this the robot ends up inside a shut door and — since
                // passability is checked on the target tile — walks straight
                // back out, which reads as "you can walk through doors".
                if (!open && this.doorwayOccupied(door.doorId)) continue;
                door.open = open;
                events.push({ kind: 'door', doorId: door.doorId, open });
                changed = true;
            }

            for (const sensor of state.motionSensors) {
                const active = this.sensorShouldBeActive(sensor);
                if (active === sensor.active) continue;
                sensor.active = active;
                events.push({ kind: 'sensor', sensorId: sensor.sensorId, active });
                changed = true;
            }

            // Delivery by *pushing* a crate onto a bay. Hand-drops latch in
            // `drop()` so they animate as one arc instead of two flourishes.
            for (const crate of state.crates) {
                if (crate.carried || crate.delivered) continue;
                const tile = tileAt(this.level, crate.position);
                if (tile?.kind !== 'drop_off' || !bayAccepts(tile, crate)) continue;
                crate.delivered = true;
                events.push({ kind: 'crateDelivered', crateId: crate.id });
                changed = true;
            }

            if (!changed) break;
        }

        return events;
    }

    /**
     * `unlocked` wins outright; otherwise a linked control *inverts* the
     * authored value. Inverting rather than OR-ing is what keeps a door
     * authored `initiallyOpen` from slamming shut on the first action, and
     * gives authors "plate closes the door" as well as "plate opens it".
     */
    private doorShouldBeOpen(door: DoorState): boolean {
        if (door.unlocked) return true;
        const initial = this.initialDoorOpen.get(door.doorId) ?? false;
        return this.anyControlAsserted(door.doorId) ? !initial : initial;
    }

    private sensorShouldBeActive(sensor: MotionSensorState): boolean {
        const initial = this.initialSensorActive.get(sensor.sensorId) ?? false;
        return this.anyControlAsserted(sensor.sensorId) ? !initial : initial;
    }

    /**
     * Whether any switch or plate pointing at `targetId` is currently
     * asserted. Several controls on one target compose as OR — the second
     * cannot undo the first.
     */
    private anyControlAsserted(targetId: string): boolean {
        for (const lever of this.levelState.switches) {
            if (lever.targetId === targetId && lever.on) return true;
        }
        for (const plate of this.levelState.plates) {
            if (plate.targetId === targetId && plate.pressed) return true;
        }
        return false;
    }

    private doorwayOccupied(doorId: string): boolean {
        for (let x = 0; x < this.level.width; x++) {
            for (let y = 0; y < this.level.height; y++) {
                const coord = { x, y };
                const tile = tileAt(this.level, coord);
                if (tile?.kind !== 'door' || tile.doorId !== doorId) continue;
                if (sameCoord(this.levelState.robot.position, coord)) return true;
                if (crateAt(this.levelState, coord)) return true;
            }
        }
        return false;
    }


    // ========================================================
    // Belts
    // ========================================================

    /**
     * One tile of the belt ride: everything standing on a conveyor slides one
     * tile. `finish` calls this until it reports nothing moved, so a rider is
     * carried to the *end* of the belt — off it, or up against whatever stops
     * it — for the price of the single command that put it there. Sensing
     * never ticks belts: it costs no energy and changes nothing.
     *
     * Belts **jam** rather than crash. `game-mechanics.md` lists every way a
     * run can end and none of them is "the floor moved you", so a rider whose
     * way is blocked — wall, pit, closed door, a crate that is not itself
     * moving — simply stays put. That is also what lets crates pile up at the
     * end of a cargo belt instead of the level being lost to a stray push.
     *
     * A jammed rider is not out of the ride: it retries on the next tick, so
     * a queue of crates flows on as soon as the one in front steps off.
     */
    private convey(ride: BeltRide): WorldEvent[] {
        const state = this.levelState;
        const riders: Rider[] = [];

        /** Start this rider's trail at the tile it is setting off from. */
        const trail = (key: string, from: Coord): Set<TileKey> => {
            let seen = ride.get(key);
            if (!seen) {
                seen = new Set<TileKey>([coordKey(from)]);
                ride.set(key, seen);
            }
            return seen;
        };

        const robotBelt = beltDirection(this.level, state.robot.position, 'robot');
        if (robotBelt) {
            trail(ROBOT_KEY, state.robot.position);
            riders.push({
                key: ROBOT_KEY,
                crateId: null,
                from: { ...state.robot.position },
                to: ahead(state.robot.position, robotBelt),
            });
        }

        for (const crate of state.crates) {
            // A carried crate rides in the robot's hands; a delivered one is
            // inert and the belt runs underneath it.
            if (crate.carried || crate.delivered) continue;
            const belt = beltDirection(this.level, crate.position, 'crate');
            if (!belt) continue;
            trail(crateKey(crate.id), crate.position);
            riders.push({
                key: crateKey(crate.id),
                crateId: crate.id,
                from: { ...crate.position },
                to: ahead(crate.position, belt),
            });
        }

        if (riders.length === 0) return [];

        // Where everyone stands before anything moves — riders and bystanders
        // alike, since a stalled crate is what a rider behind it runs into.
        const occupants = new Map<TileKey, string>();
        occupants.set(coordKey(state.robot.position), ROBOT_KEY);
        for (const crate of state.crates) {
            if (crate.carried) continue;
            occupants.set(coordKey(crate.position), crateKey(crate.id));
        }

        const byKey = new Map(riders.map((rider) => [rider.key, rider]));
        const moving = new Set(riders.map((rider) => rider.key));

        // Jamming cascades — a rider stopped by a wall stops whoever is queued
        // behind it. Every pass drops at least one rider, so this terminates.
        for (let pass = 0; pass <= riders.length; pass++) {
            const claims = new Map<TileKey, number>();
            for (const rider of riders) {
                if (!moving.has(rider.key)) continue;
                const key = coordKey(rider.to);
                claims.set(key, (claims.get(key) ?? 0) + 1);
            }

            let changed = false;
            for (const rider of riders) {
                if (!moving.has(rider.key)) continue;
                if (!this.jams(rider, ride, occupants, byKey, moving, claims)) continue;
                moving.delete(rider.key);
                changed = true;
            }
            if (!changed) break;
        }

        const events: WorldEvent[] = [];
        for (const rider of riders) {
            if (!moving.has(rider.key)) continue;
            ride.get(rider.key)!.add(coordKey(rider.to));

            if (rider.crateId === null) {
                state.robot.position = { ...rider.to };
                events.push({ kind: 'conveyRobot', from: { ...rider.from }, to: { ...rider.to } });
            } else {
                crateById(state, rider.crateId)!.position = { ...rider.to };
                events.push({
                    kind: 'conveyCrate',
                    crateId: rider.crateId,
                    from: { ...rider.from },
                    to: { ...rider.to },
                });
            }
        }
        this.syncCarried();

        return events;
    }

    /**
     * Why a rider stays put: its own trail, the tile ahead, a bystander, or
     * another rider.
     */
    private jams(
        rider: Rider,
        ride: BeltRide,
        occupants: Map<TileKey, string>,
        byKey: Map<string, Rider>,
        moving: Set<string>,
        claims: Map<TileKey, number>,
    ): boolean {
        const key = coordKey(rider.to);

        // A belt laid out in a ring would carry its rider round for ever.
        // Stopping at the first tile it would cross twice ends the ride after
        // one lap — and is what guarantees the ride terminates at all.
        if (ride.get(rider.key)?.has(key)) return true;

        // Two belts feeding one tile: neither rider wins, or the order they
        // happen to be listed in would silently decide the level.
        if ((claims.get(key) ?? 0) > 1) return true;

        const blocked = rider.crateId === null
            ? tileBlocksRobot(this.level, this.levelState, rider.to)
            : tileBlocksCrate(this.level, this.levelState, rider.to);
        if (blocked) return true;

        const occupant = occupants.get(key);
        if (occupant === undefined || occupant === rider.key) return false;

        // Following someone who is leaving is fine — that is a train of crates
        // on one belt. Trading places is not: they would pass through each
        // other, so two belts pointing at each other deadlock, as they should.
        if (!moving.has(occupant)) return true;
        return sameCoord(byKey.get(occupant)!.to, rider.from);
    }


    // ========================================================
    // Goals
    // ========================================================

    /**
     * Latch every newly satisfied goal and report whether all of them are.
     *
     * Latching is load-bearing, not a nicety: tutorial-01 wants the robot on
     * the goal tile *and* the red crate in the bay, and it cannot be in two
     * places at once.
     */
    private latchGoals(): boolean {
        const goals = this.levelState.goals;
        for (const goal of goals) {
            if (!goal.satisfied && this.isSatisfied(goal)) goal.satisfied = true;
        }
        return goals.length > 0 && goals.every((goal) => goal.satisfied);
    }

    private isSatisfied(goal: GoalConditionState): boolean {
        const state = this.levelState;

        switch (goal.condition.kind) {
            case 'reach_goal':
                return this.isGoal();

            case 'deliver_all':
                // Grey crates have no delivery goal, so they never count.
                return state.crates
                    .filter((crate) => crate.kind === 'crate_colour')
                    .every((crate) => crate.delivered);

            case 'deliver_specific': {
                const { color, dropOffPosition } = goal.condition;
                return state.crates.some(
                    (crate) =>
                        crate.kind === 'crate_colour' &&
                        crate.color === color &&
                        crate.delivered &&
                        sameCoord(crate.position, dropOffPosition),
                );
            }
        }
    }


    // ========================================================
    // Helpers
    // ========================================================

    private rotate(rotation: 'left' | 'right'): StepOutcome {
        const halted = this.beginAction();
        if (halted) return halted;

        const from = this.levelState.robot.facing;
        const to = turn(from, rotation);
        this.levelState.robot.facing = to;
        return this.finish([[{ kind: 'turn', from, to, rotation }]]);
    }

    private tileAhead(): Coord {
        const { position, facing } = this.levelState.robot;
        return ahead(position, facing);
    }

    /** Keep the carried crate on the robot's tile — as a copy, never an alias. */
    private syncCarried(): void {
        const id = this.levelState.robot.carrying;
        if (!id) return;
        const crate = crateById(this.levelState, id);
        if (crate) crate.position = { ...this.levelState.robot.position };
    }
}


function reasonFor(blocker: Blocker): CrashReason {
    switch (blocker.kind) {
        case 'edge':       return crash('edge');
        case 'wall':       return crash('wall');
        case 'door':       return crash('door_closed');
        case 'pit':        return crash('pit');
        case 'cargo_belt': return crash('cargo_belt');
        case 'gap':        return crash('robot_gap');
        case 'switch':     return crash('switch_blocked');
        case 'crate':      return crash('crate_blocked');
    }
}
