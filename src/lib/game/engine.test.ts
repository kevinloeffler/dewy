import { describe, expect, it } from 'vitest';
import { GameEngine, type StepOutcome } from './engine';
import { createRobotApi, LevelComplete, RobotCrash } from './robot-api';
import { nullPlayer, RunCancelled, type EventPlayer } from './events';
import { validateLevel } from './rules';
import { tutorial01 } from './levels/tutorial-01';
import type {
    Coord, GoalCondition, Item, Level, MotionSensor, RobotConfig, Tile, TileKey,
} from './level';


// ============================================================
// Fixtures
// ============================================================

/** A 5×5 open floor with a walled perimeter is enough for almost everything. */
function makeLevel(opts: {
    width?: number;
    height?: number;
    tiles?: Partial<Record<TileKey, Tile>>;
    items?: Item[];
    motionSensors?: MotionSensor[];
    robot?: RobotConfig;
    goals?: GoalCondition[];
} = {}): Level {
    const width = opts.width ?? 5;
    const height = opts.height ?? 5;

    return {
        id: 'test',
        name: 'Test',
        description: null,
        width,
        height,
        tiles: opts.tiles ?? {},
        items: opts.items ?? [],
        motionSensors: opts.motionSensors ?? [],
        robot: opts.robot ?? { position: { x: 1, y: 1 }, facing: 'east' },
        options: { lineBudget: null, showInventory: false, languageStage: 5 },
        goals: opts.goals ?? [],
    };
}

/** Event kinds per step — the shape assertions care about. */
function shape(outcome: StepOutcome): string[][] {
    return outcome.events.map((step) => step.map((event) => event.kind));
}

function at(engine: GameEngine): Coord {
    return engine.state.robot.position;
}


// ============================================================
// Passability and crashing
// ============================================================

describe('moveForward', () => {
    it('walks onto plain floor', () => {
        const engine = new GameEngine(makeLevel());
        const outcome = engine.moveForward();

        expect(outcome.status).toBe('ok');
        expect(shape(outcome)).toEqual([['move']]);
        expect(at(engine)).toEqual({ x: 2, y: 1 });
    });

    it('walks onto goal, drop-off, plate, conveyor and robot_gap tiles', () => {
        for (const tile of [
            { kind: 'goal' },
            { kind: 'drop_off', color: null },
            { kind: 'pressure_plate', targetId: 'none' },
            { kind: 'conveyor', direction: 'east' },
            { kind: 'robot_gap' },
        ] as Tile[]) {
            const engine = new GameEngine(makeLevel({ tiles: { '2,1': tile } }));
            expect(engine.moveForward().status, tile.kind).toBe('ok');
            expect(at(engine)).toEqual({ x: 2, y: 1 });
        }
    });

    const blockers: [string, Tile | null, string][] = [
        ['wall',           { kind: 'wall' },                                'wall'],
        ['closed door',    { kind: 'door', doorId: 'd', initiallyOpen: false }, 'door_closed'],
        ['switch',         { kind: 'switch', targetId: 't', initiallyOn: false }, 'switch_blocked'],
        ['cargo belt',     { kind: 'cargo_conveyor', direction: 'east' },    'cargo_belt'],
    ];

    for (const [label, tile, code] of blockers) {
        it(`bumps and crashes on a ${label}`, () => {
            const engine = new GameEngine(makeLevel({ tiles: { '2,1': tile! } }));
            const outcome = engine.moveForward();

            expect(outcome.status).toBe('crash');
            expect(outcome.reason?.code).toBe(code);
            expect(shape(outcome)).toEqual([['bump'], ['crash']]);
            expect(at(engine)).toEqual({ x: 1, y: 1 });
            expect(engine.state.failed).toBe(true);
            expect(engine.state.failReason).toBe(outcome.reason?.message);
        });
    }

    it('crashes at the world edge in every direction', () => {
        for (const facing of ['north', 'east', 'south', 'west'] as const) {
            const engine = new GameEngine(makeLevel({
                width: 1, height: 1, robot: { position: { x: 0, y: 0 }, facing },
            }));
            const outcome = engine.moveForward();
            expect(outcome.reason?.code, facing).toBe('edge');
            expect(shape(outcome)).toEqual([['bump'], ['crash']]);
        }
    });

    it('drives into a pit and takes the robot with it', () => {
        const engine = new GameEngine(makeLevel({ tiles: { '2,1': { kind: 'pit' } } }));
        const outcome = engine.moveForward();

        expect(outcome.status).toBe('crash');
        expect(outcome.reason?.code).toBe('pit');
        expect(shape(outcome)).toEqual([['move'], ['crash']]);
        // The robot really is in the hole — state must not contradict the screen.
        expect(at(engine)).toEqual({ x: 2, y: 1 });
    });

    it('walks through an open door', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'door', doorId: 'd', initiallyOpen: true } },
        }));
        expect(engine.moveForward().status).toBe('ok');
    });

    it('treats an unauthored in-bounds tile as floor', () => {
        const engine = new GameEngine(makeLevel({ tiles: {} }));
        expect(engine.moveForward().status).toBe('ok');
    });
});


describe('pushing', () => {
    const crateAtThree = (): Item[] => [{ kind: 'crate_grey', id: 'c', position: { x: 3, y: 1 } }];

    function pushSetup(behind?: Tile, extra: Item[] = []) {
        return new GameEngine(makeLevel({
            robot: { position: { x: 2, y: 1 }, facing: 'east' },
            tiles: behind ? { '4,1': behind } : {},
            items: [...crateAtThree(), ...extra],
        }));
    }

    it('moves robot and crate together in a single step', () => {
        const engine = pushSetup();
        const outcome = engine.moveForward();

        expect(outcome.status).toBe('ok');
        // One step containing both — they must animate simultaneously.
        expect(shape(outcome)).toEqual([['move', 'push']]);
        expect(at(engine)).toEqual({ x: 3, y: 1 });
        expect(engine.state.crates[0].position).toEqual({ x: 4, y: 1 });
    });

    const unpushable: [string, Tile][] = [
        ['a wall',      { kind: 'wall' }],
        ['a pit',       { kind: 'pit' }],
        ['a robot gap', { kind: 'robot_gap' }],
        ['a switch',    { kind: 'switch', targetId: 't', initiallyOn: false }],
        ['a closed door', { kind: 'door', doorId: 'd', initiallyOpen: false }],
    ];

    for (const [label, tile] of unpushable) {
        it(`crashes pushing a crate into ${label}`, () => {
            const engine = pushSetup(tile);
            const outcome = engine.moveForward();

            expect(outcome.status).toBe('crash');
            expect(outcome.reason?.code).toBe('crate_blocked');
            expect(engine.state.crates[0].position).toEqual({ x: 3, y: 1 });
        });
    }

    it('will not chain-push — a crate behind a crate is a wall', () => {
        const engine = pushSetup(undefined, [
            { kind: 'crate_grey', id: 'c2', position: { x: 4, y: 1 } },
        ]);
        expect(engine.moveForward().reason?.code).toBe('crate_blocked');
    });

    it('crashes pushing a crate off the world edge', () => {
        const engine = new GameEngine(makeLevel({
            width: 4, height: 3,
            robot: { position: { x: 1, y: 1 }, facing: 'east' },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        // crate would land on x=3 (fine), so push once more from x=2
        engine.moveForward();
        expect(engine.moveForward().reason?.code).toBe('crate_blocked');
    });

    it('pushes a crate onto a cargo belt but will not follow it there', () => {
        const belt: Tile = { kind: 'cargo_conveyor', direction: 'east' };
        const onto = new GameEngine(makeLevel({
            robot: { position: { x: 2, y: 1 }, facing: 'east' },
            tiles: { '4,1': belt },
            items: crateAtThree(),
        }));
        expect(onto.moveForward().status).toBe('ok');

        const follow = new GameEngine(makeLevel({
            robot: { position: { x: 2, y: 1 }, facing: 'east' },
            tiles: { '3,1': belt },
            items: crateAtThree(),
        }));
        expect(follow.moveForward().reason?.code).toBe('cargo_belt');
    });

    it('will not push a crate that has already been delivered', () => {
        const engine = new GameEngine(makeLevel({
            robot: { position: { x: 2, y: 1 }, facing: 'east' },
            tiles: { '3,1': { kind: 'drop_off', color: 'red' } },
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 3, y: 1 } }],
        }));
        // Settled at t=0: the crate is already sitting in its bay.
        expect(engine.state.crates[0].delivered).toBe(true);
        expect(engine.moveForward().reason?.code).toBe('crate_delivered');
    });

    it('delivers a crate pushed onto a matching bay', () => {
        const engine = new GameEngine(makeLevel({
            robot: { position: { x: 2, y: 1 }, facing: 'east' },
            tiles: { '4,1': { kind: 'drop_off', color: 'red' } },
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 3, y: 1 } }],
        }));
        const outcome = engine.moveForward();

        expect(engine.state.crates[0].delivered).toBe(true);
        // The flourish is its own step — a push and a deliver in one step
        // would put two tweens on the same mesh.
        expect(shape(outcome)).toEqual([['move', 'push'], ['crateDelivered']]);
    });
});


describe('carrying', () => {
    function carrying() {
        const engine = new GameEngine(makeLevel({
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 2, y: 1 } }],
        }));
        engine.pick();
        return engine;
    }

    it('keeps the carried crate on the robot tile as a copy, not an alias', () => {
        const engine = carrying();
        engine.moveForward();

        const crate = engine.state.crates[0];
        expect(crate.position).toEqual(at(engine));
        expect(crate.position).not.toBe(at(engine));

        crate.position.x = 99;
        expect(at(engine).x).not.toBe(99);
    });

    it('emits no push for the crate in its own hands', () => {
        const engine = carrying();
        expect(shape(engine.moveForward())).toEqual([['move']]);
    });

    it('does not press a plate with a carried crate', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '3,1': { kind: 'pressure_plate', targetId: 'd' } },
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 2, y: 1 } }],
        }));
        engine.pick();
        engine.moveForward();     // robot to (2,1), crate rides along
        expect(engine.state.plates[0].pressed).toBe(false);
    });

    it('does not deliver a crate merely carried across a bay', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '3,1': { kind: 'drop_off', color: 'red' } },
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 2, y: 1 } }],
        }));
        engine.pick();
        engine.moveForward();
        engine.moveForward();     // standing on the bay, crate still in hand
        expect(at(engine)).toEqual({ x: 3, y: 1 });
        expect(engine.state.crates[0].delivered).toBe(false);
    });
});


describe('pick', () => {
    it('lifts a crate into the hands', () => {
        const engine = new GameEngine(makeLevel({
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        const outcome = engine.pick();

        expect(shape(outcome)).toEqual([['pick']]);
        expect(engine.state.robot.carrying).toBe('c');
        expect(engine.state.crates[0].carried).toBe(true);
    });

    it('pockets a keycard, even with a crate already in hand', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '3,1': { kind: 'door', doorId: 'd', initiallyOpen: false } },
            items: [
                { kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } },
                { kind: 'keycard', id: 'k', doorId: 'd', position: { x: 1, y: 2 } },
            ],
        }));
        engine.pick();                 // crate ahead (east)
        engine.turnRight();            // face south, keycard at (1,2)
        const outcome = engine.pick();

        expect(shape(outcome)).toEqual([['pickKeycard']]);
        expect(engine.state.robot.inventory).toEqual(['d']);
        expect(engine.state.robot.carrying).toBe('c');
    });

    it('crashes picking a second crate', () => {
        const engine = new GameEngine(makeLevel({
            items: [
                { kind: 'crate_grey', id: 'a', position: { x: 2, y: 1 } },
                { kind: 'crate_grey', id: 'b', position: { x: 1, y: 2 } },
            ],
        }));
        engine.pick();
        engine.turnRight();
        expect(engine.pick().reason?.code).toBe('already_carrying');
    });

    it('crashes on an empty tile', () => {
        const engine = new GameEngine(makeLevel());
        expect(engine.pick().reason?.code).toBe('nothing_to_pick');
    });

    it('prefers the crate when a tile holds both', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '3,1': { kind: 'door', doorId: 'd', initiallyOpen: false } },
            items: [
                { kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } },
                { kind: 'keycard', id: 'k', doorId: 'd', position: { x: 2, y: 1 } },
            ],
        }));
        expect(shape(engine.pick())).toEqual([['pick']]);
        expect(engine.state.keycards[0].collected).toBe(false);
    });
});


describe('drop', () => {
    /**
     * Robot at (1,1) holding a crate, facing east at (2,1) — where `tiles`
     * puts whatever it is about to be dropped onto. The crate starts south
     * of the robot rather than on the target, or a bay there would deliver
     * it before the run even begins.
     */
    function holding(tiles: Partial<Record<TileKey, Tile>> = {}, color: 'red' | null = 'red') {
        const engine = new GameEngine(makeLevel({
            tiles,
            items: [
                color === null
                    ? { kind: 'crate_grey', id: 'c', position: { x: 1, y: 2 } }
                    : { kind: 'crate_colour', id: 'c', color, position: { x: 1, y: 2 } },
            ],
        }));
        engine.turnRight();     // face south
        engine.pick();
        engine.turnLeft();      // face east again
        return engine;
    }

    it('crashes when the hands are empty', () => {
        expect(new GameEngine(makeLevel()).drop().reason?.code).toBe('not_carrying');
    });

    it('places the crate on the tile ahead', () => {
        const engine = holding();
        expect(shape(engine.drop())).toEqual([['drop']]);
        expect(engine.state.crates[0].position).toEqual({ x: 2, y: 1 });
        expect(engine.state.robot.carrying).toBeNull();
    });

    it('delivers onto a matching colour bay', () => {
        const engine = holding({ '2,1': { kind: 'drop_off', color: 'red' } });
        expect(shape(engine.drop())).toEqual([['deliver']]);
        expect(engine.state.crates[0].delivered).toBe(true);
    });

    it('delivers a colour crate onto a plain bay', () => {
        const engine = holding({ '2,1': { kind: 'drop_off', color: null } });
        expect(shape(engine.drop())).toEqual([['deliver']]);
        expect(engine.state.crates[0].delivered).toBe(true);
    });

    it('never delivers a grey crate, even onto a plain bay', () => {
        const engine = holding({ '2,1': { kind: 'drop_off', color: null } }, null);
        expect(shape(engine.drop())).toEqual([['drop']]);
        expect(engine.state.crates[0].delivered).toBe(false);
    });

    it('treats a mismatched bay as an ordinary drop, not a crash', () => {
        const engine = holding({ '2,1': { kind: 'drop_off', color: 'blue' } });
        const outcome = engine.drop();
        expect(outcome.status).toBe('ok');
        expect(shape(outcome)).toEqual([['drop']]);
        expect(engine.state.crates[0].delivered).toBe(false);
    });

    const undroppable: [string, Tile][] = [
        ['a wall',        { kind: 'wall' }],
        ['a pit',         { kind: 'pit' }],
        ['a closed door', { kind: 'door', doorId: 'd', initiallyOpen: false }],
        ['a robot gap',   { kind: 'robot_gap' }],
        ['a switch',      { kind: 'switch', targetId: 't', initiallyOn: false }],
    ];

    for (const [label, tile] of undroppable) {
        it(`crashes dropping onto ${label}`, () => {
            expect(holding({ '2,1': tile }).drop().status).toBe('crash');
        });
    }

    it('crashes dropping over the world edge', () => {
        const engine = new GameEngine(makeLevel({
            width: 3, height: 3,
            robot: { position: { x: 2, y: 1 }, facing: 'east' },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 1, y: 1 } }],
        }));
        engine.turnRight(); engine.turnRight();   // face west
        engine.pick();
        engine.turnRight(); engine.turnRight();   // face east again, edge ahead
        expect(engine.drop().reason?.code).toBe('edge');
    });
});


// ============================================================
// Derived state
// ============================================================

describe('doors, switches and plates', () => {
    it('opens a door from a pressure plate and closes it again', () => {
        const engine = new GameEngine(makeLevel({
            robot: { position: { x: 1, y: 1 }, facing: 'east' },
            tiles: {
                '2,1': { kind: 'pressure_plate', targetId: 'd' },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
        }));
        expect(engine.state.doors[0].open).toBe(false);

        const stepOn = engine.moveForward();
        expect(engine.state.plates[0].pressed).toBe(true);
        expect(engine.state.doors[0].open).toBe(true);
        expect(shape(stepOn)).toEqual([['move'], ['plate', 'door']]);

        const stepOff = engine.moveForward();
        expect(engine.state.doors[0].open).toBe(false);
        expect(shape(stepOff)).toEqual([['move'], ['plate', 'door']]);
    });

    it('will not close a door on whoever is standing in it', () => {
        const engine = new GameEngine(makeLevel({
            robot: { position: { x: 1, y: 1 }, facing: 'east' },
            tiles: {
                '1,1': { kind: 'pressure_plate', targetId: 'd' },
                '2,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
        }));
        // Standing on the plate from the start, so the door settles open.
        expect(engine.state.doors[0].open).toBe(true);

        engine.moveForward();                       // into the doorway
        expect(at(engine)).toEqual({ x: 2, y: 1 });
        expect(engine.state.plates[0].pressed).toBe(false);
        expect(engine.state.doors[0].open).toBe(true);   // held open by the robot

        engine.moveForward();                       // out the far side
        expect(engine.state.doors[0].open).toBe(false);
    });

    it('holds a door open with a crate on the plate', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '3,1': { kind: 'pressure_plate', targetId: 'd' },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        engine.moveForward();                       // push the crate onto the plate
        expect(engine.state.crates[0].position).toEqual({ x: 3, y: 1 });
        expect(engine.state.doors[0].open).toBe(true);
    });

    it('settles a crate already standing on a plate before anything runs', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '3,3': { kind: 'pressure_plate', targetId: 'd' },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 3, y: 3 } }],
        }));
        expect(engine.state.plates[0].pressed).toBe(true);
        expect(engine.state.doors[0].open).toBe(true);
        // ...and the first move must not emit a phantom change.
        expect(shape(engine.moveForward())).toEqual([['move']]);
    });

    it('leaves an initiallyOpen door open when its switch starts off', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '2,1': { kind: 'door', doorId: 'd', initiallyOpen: true },
                '1,2': { kind: 'switch', targetId: 'd', initiallyOn: false },
            },
        }));
        expect(engine.state.doors[0].open).toBe(true);
        // No spurious close on the first action.
        expect(shape(engine.turnLeft())).toEqual([['turn']]);
        expect(engine.state.doors[0].open).toBe(true);
    });

    it('lets a control invert the authored value in both directions', () => {
        const closes = new GameEngine(makeLevel({
            tiles: {
                '2,1': { kind: 'switch', targetId: 'd', initiallyOn: false },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: true },
            },
        }));
        expect(closes.state.doors[0].open).toBe(true);
        closes.toggle();
        expect(closes.state.doors[0].open).toBe(false);
    });

    it('flips the switch on the tile ahead and no other', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '2,1': { kind: 'switch', targetId: 'd', initiallyOn: false },
                '1,2': { kind: 'switch', targetId: 'd', initiallyOn: false },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
        }));
        const outcome = engine.toggle();
        expect(shape(outcome)).toEqual([['switch'], ['door']]);
        expect(engine.state.switches.find((s) => s.position.x === 2)?.on).toBe(true);
        expect(engine.state.switches.find((s) => s.position.y === 2)?.on).toBe(false);
    });

    it('composes two switches on one target as OR', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '2,1': { kind: 'switch', targetId: 'd', initiallyOn: false },
                '1,2': { kind: 'switch', targetId: 'd', initiallyOn: false },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
        }));
        engine.toggle();                 // east switch on  → open
        engine.turnRight();
        engine.toggle();                 // south switch on → still open
        expect(engine.state.doors[0].open).toBe(true);

        engine.toggle();                 // south switch off → east still holds it
        expect(engine.state.doors[0].open).toBe(true);
    });

    it('crashes toggling something that is not a switch', () => {
        expect(new GameEngine(makeLevel()).toggle().reason?.code).toBe('not_a_switch');
    });

    it('lets the robot toggle while carrying a crate', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '1,2': { kind: 'switch', targetId: 'd', initiallyOn: false },
                '4,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        engine.pick();
        engine.turnRight();
        expect(engine.toggle().status).toBe('ok');
        expect(engine.state.doors[0].open).toBe(true);
    });
});


describe('open', () => {
    function withDoor(opts: { held?: boolean; anyKeycard?: boolean; initiallyOpen?: boolean } = {}) {
        const items: Item[] = [];
        if (opts.anyKeycard ?? true) {
            items.push({ kind: 'keycard', id: 'k', doorId: 'd', position: { x: 1, y: 2 } });
        }
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'door', doorId: 'd', initiallyOpen: opts.initiallyOpen ?? false } },
            items,
        }));
        if (opts.held) {
            engine.turnRight();
            engine.pick();
            engine.turnLeft();
        }
        return engine;
    }

    it('unlocks the door and spends the keycard', () => {
        const engine = withDoor({ held: true });
        const outcome = engine.open();

        expect(outcome.status).toBe('ok');
        expect(shape(outcome)).toEqual([['door']]);
        expect(engine.state.doors[0].open).toBe(true);
        expect(engine.state.doors[0].unlocked).toBe(true);
        expect(engine.state.robot.inventory).toEqual([]);
        expect(engine.moveForward().status).toBe('ok');
    });

    it('crashes without the keycard', () => {
        expect(withDoor().open().reason?.code).toBe('no_keycard');
    });

    it('says the door has no keyhole when no keycard exists for it', () => {
        expect(withDoor({ anyKeycard: false }).open().reason?.code).toBe('no_keyhole');
    });

    it('crashes when the tile ahead is not a door', () => {
        expect(new GameEngine(makeLevel()).open().reason?.code).toBe('not_a_door');
    });

    it('spends the keycard on a door a plate is already holding open', () => {
        const engine = new GameEngine(makeLevel({
            robot: { position: { x: 1, y: 1 }, facing: 'east' },
            tiles: {
                '1,1': { kind: 'pressure_plate', targetId: 'd' },
                '2,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
            items: [{ kind: 'keycard', id: 'k', doorId: 'd', position: { x: 1, y: 2 } }],
        }));
        engine.turnRight(); engine.pick(); engine.turnLeft();
        expect(engine.state.doors[0].open).toBe(true);      // held by the plate

        engine.open();
        expect(engine.state.doors[0].unlocked).toBe(true);
        expect(engine.state.robot.inventory).toEqual([]);

        // Walking off the plate must not slam it shut with the card spent.
        engine.moveForward();
        engine.moveForward();
        expect(engine.state.doors[0].open).toBe(true);
    });

    it('opens every tile of a multi-tile door at once', () => {
        const engine = new GameEngine(makeLevel({
            tiles: {
                '2,1': { kind: 'door', doorId: 'd', initiallyOpen: false },
                '2,2': { kind: 'door', doorId: 'd', initiallyOpen: false },
            },
            items: [{ kind: 'keycard', id: 'k', doorId: 'd', position: { x: 1, y: 2 } }],
        }));
        engine.turnRight(); engine.pick(); engine.turnLeft();
        expect(shape(engine.open())).toEqual([['door']]);   // one event, both tiles
        expect(engine.moveForward().status).toBe('ok');
    });
});


describe('motion sensors', () => {
    const sensor = (tiles: Coord[], active = true): MotionSensor =>
        ({ sensorId: 's', forbiddenTiles: tiles, initiallyActive: active });

    it('fails the run on entering an active forbidden tile', () => {
        const engine = new GameEngine(makeLevel({
            motionSensors: [sensor([{ x: 2, y: 1 }])],
        }));
        const outcome = engine.moveForward();
        expect(outcome.reason?.code).toBe('motion_sensor');
        expect(shape(outcome)).toEqual([['move'], ['crash']]);
    });

    it('ignores an inactive sensor', () => {
        const engine = new GameEngine(makeLevel({
            motionSensors: [sensor([{ x: 2, y: 1 }], false)],
        }));
        expect(engine.moveForward().status).toBe('ok');
    });

    it('lets a switch suppress the sensor', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '1,2': { kind: 'switch', targetId: 's', initiallyOn: false } },
            motionSensors: [sensor([{ x: 2, y: 1 }])],
        }));
        engine.turnRight();
        engine.toggle();
        expect(engine.state.motionSensors[0].active).toBe(false);
        engine.turnLeft();
        expect(engine.moveForward().status).toBe('ok');
    });

    it('suppresses the sensor covering the very plate being stepped on', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'pressure_plate', targetId: 's' } },
            motionSensors: [sensor([{ x: 2, y: 1 }])],
        }));
        // Settling before the sensor check is what makes this survivable.
        expect(engine.moveForward().status).toBe('ok');
        expect(engine.state.motionSensors[0].active).toBe(false);
    });

    it('fires when a toggle re-arms a sensor under the robot', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '1,2': { kind: 'switch', targetId: 's', initiallyOn: true } },
            motionSensors: [sensor([{ x: 1, y: 1 }])],
        }));
        expect(engine.state.motionSensors[0].active).toBe(false);   // suppressed
        engine.turnRight();
        expect(engine.toggle().reason?.code).toBe('motion_sensor');
    });

    it('does not watch crates', () => {
        const engine = new GameEngine(makeLevel({
            robot: { position: { x: 1, y: 1 }, facing: 'east' },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
            motionSensors: [sensor([{ x: 3, y: 1 }])],
        }));
        expect(engine.moveForward().status).toBe('ok');
    });
});


// ============================================================
// Sensing
// ============================================================

describe('sensing', () => {
    it('agrees with moveForward for every blocker', () => {
        const cases: (Tile | undefined)[] = [
            undefined,
            { kind: 'wall' },
            { kind: 'pit' },
            { kind: 'switch', targetId: 't', initiallyOn: false },
            { kind: 'cargo_conveyor', direction: 'east' },
            { kind: 'door', doorId: 'd', initiallyOpen: false },
            { kind: 'door', doorId: 'd', initiallyOpen: true },
            { kind: 'goal' },
            { kind: 'robot_gap' },
        ];

        for (const tile of cases) {
            const build = () => new GameEngine(makeLevel(tile ? { tiles: { '2,1': tile } } : {}));
            const predicted = build().isBlocked();
            const actual = build().moveForward().status === 'crash';
            expect(predicted, tile?.kind ?? 'floor').toBe(actual);
        }
    });

    it('reports a pushable crate as not blocked, an unpushable one as blocked', () => {
        const free = new GameEngine(makeLevel({
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        expect(free.isBlocked()).toBe(false);

        const stuck = new GameEngine(makeLevel({
            tiles: { '3,1': { kind: 'wall' } },
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        expect(stuck.isBlocked()).toBe(true);
    });

    it('is not blocked by a motion sensor — that is isDangerous', () => {
        const engine = new GameEngine(makeLevel({
            motionSensors: [{ sensorId: 's', forbiddenTiles: [{ x: 2, y: 1 }], initiallyActive: true }],
        }));
        expect(engine.isBlocked()).toBe(false);
        expect(engine.isDangerous()).toBe(true);
    });

    it('isCrate excludes a carried crate and includes a delivered one', () => {
        const engine = new GameEngine(makeLevel({
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        expect(engine.isCrate()).toBe(true);
        engine.pick();
        expect(engine.isCrate()).toBe(false);

        const delivered = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'drop_off', color: 'red' } },
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 2, y: 1 } }],
        }));
        expect(delivered.state.crates[0].delivered).toBe(true);
        expect(delivered.isCrate()).toBe(true);
    });

    it('isGoal reads the current tile, not the one ahead', () => {
        const ahead = new GameEngine(makeLevel({ tiles: { '2,1': { kind: 'goal' } } }));
        expect(ahead.isGoal()).toBe(false);

        const under = new GameEngine(makeLevel({ tiles: { '1,1': { kind: 'goal' } } }));
        expect(under.isGoal()).toBe(true);
    });

    it('crateColor is null for grey crates and empty hands', () => {
        const empty = new GameEngine(makeLevel());
        expect(empty.crateColor()).toBeNull();

        const grey = new GameEngine(makeLevel({
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        grey.pick();
        expect(grey.crateColor()).toBeNull();
        expect(grey.isCarrying()).toBe(true);

        const red = new GameEngine(makeLevel({
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 2, y: 1 } }],
        }));
        red.pick();
        expect(red.crateColor()).toBe('red');
    });

    it('isDropOff reports any bay, matching or not', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'drop_off', color: 'blue' } },
        }));
        expect(engine.isDropOff()).toBe(true);
    });

    it('costs no step and emits nothing', () => {
        const engine = new GameEngine(makeLevel());
        engine.isBlocked(); engine.isCrate(); engine.isGoal();
        engine.isDropOff(); engine.crateColor(); engine.isDangerous(); engine.isCarrying();
        expect(engine.state.steps).toBe(0);
    });
});


// ============================================================
// Goals and lifecycle
// ============================================================

describe('goals', () => {
    it('latches reach_goal so stepping off does not undo it', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'goal' } },
            goals: [{ kind: 'reach_goal' }, { kind: 'deliver_all' }],
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 4, y: 4 } }],
        }));
        engine.moveForward();
        expect(engine.state.goals[0].satisfied).toBe(true);
        engine.turnLeft(); engine.turnLeft();
        engine.moveForward();
        expect(engine.state.goals[0].satisfied).toBe(true);
    });

    it('ignores grey crates for deliver_all', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'drop_off', color: null } },
            items: [
                { kind: 'crate_colour', id: 'a', color: 'red', position: { x: 2, y: 1 } },
                { kind: 'crate_grey', id: 'b', position: { x: 4, y: 4 } },
            ],
            goals: [{ kind: 'deliver_all' }],
        }));
        expect(engine.state.completed).toBe(true);
    });

    it('completes only when every condition has latched', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'goal' }, '4,1': { kind: 'drop_off', color: 'red' } },
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 3, y: 1 } }],
            goals: [
                { kind: 'reach_goal' },
                { kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 4, y: 1 } },
            ],
        }));
        expect(engine.moveForward().status).toBe('ok');   // on the goal tile
        const outcome = engine.moveForward();             // push the crate into the bay
        expect(outcome.status).toBe('complete');
        expect(shape(outcome)).toEqual([['move', 'push'], ['crateDelivered'], ['goalReached']]);
    });

    it('never completes a level with no goals', () => {
        const engine = new GameEngine(makeLevel());
        expect(engine.moveForward().status).toBe('ok');
        expect(engine.state.completed).toBe(false);
    });
});


describe('lifecycle', () => {
    it('refuses to act once the run has ended', () => {
        const engine = new GameEngine(makeLevel({ tiles: { '2,1': { kind: 'wall' } } }));
        engine.moveForward();
        const after = engine.turnLeft();
        expect(after.status).toBe('crash');
        expect(after.events).toEqual([]);
        expect(engine.state.robot.facing).toBe('east');
    });

    it('stops the robot after the level is complete', () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'goal' }, '3,1': { kind: 'wall' } },
            goals: [{ kind: 'reach_goal' }],
        }));
        expect(engine.moveForward().status).toBe('complete');
        const after = engine.moveForward();
        expect(after.status).toBe('complete');
        expect(after.events).toEqual([]);
        expect(at(engine)).toEqual({ x: 2, y: 1 });   // no post-win crash into the wall
    });

    it('runs out of battery rather than looping forever', () => {
        const engine = new GameEngine(makeLevel(), { maxSteps: 3 });
        engine.turnLeft(); engine.turnLeft(); engine.turnLeft();
        const outcome = engine.turnLeft();
        expect(outcome.reason?.code).toBe('battery');
    });

    it('restores the start state on reset', () => {
        const engine = new GameEngine(makeLevel({
            items: [{ kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } }],
        }));
        engine.pick();
        engine.turnRight();
        engine.reset();

        expect(at(engine)).toEqual({ x: 1, y: 1 });
        expect(engine.state.robot.facing).toBe('east');
        expect(engine.state.robot.carrying).toBeNull();
        expect(engine.state.crates[0].position).toEqual({ x: 2, y: 1 });
        expect(engine.state.steps).toBe(0);
        expect(engine.state.failed).toBe(false);
    });

    it('never mutates the level literal', () => {
        const before = JSON.stringify(tutorial01);
        const engine = new GameEngine(tutorial01);
        engine.moveForward(); engine.moveForward(); engine.moveForward();
        engine.turnRight(); engine.moveForward(); engine.pick();
        engine.moveForward(); engine.moveForward();
        expect(JSON.stringify(tutorial01)).toBe(before);
    });
});


// ============================================================
// tutorial-01, end to end
// ============================================================

describe('tutorial-01', () => {
    it('passes validation', () => {
        expect(validateLevel(tutorial01)).toEqual([]);
    });

    it('completes with the intended twelve-statement solution', () => {
        const engine = new GameEngine(tutorial01);
        const script = [
            () => engine.moveForward(),   // (1,3)
            () => engine.moveForward(),   // (1,2)
            () => engine.moveForward(),   // (1,1) — the goal tile
            () => engine.turnRight(),     // face east
            () => engine.moveForward(),   // (2,1)
            () => engine.pick(),          // red crate at (3,1)
            () => engine.moveForward(),   // (3,1)
            () => engine.moveForward(),   // (4,1)
            () => engine.turnRight(),     // face south
            () => engine.moveForward(),   // (4,2)
            () => engine.moveForward(),   // (4,3)
            () => engine.drop(),          // into the red bay at (4,4)
        ];

        let last: StepOutcome | null = null;
        script.forEach((step, index) => {
            last = step();
            if (index < script.length - 1) {
                expect(last.status, `statement ${index + 1}`).toBe('ok');
            }
        });

        expect(last!.status).toBe('complete');
        expect(engine.state.goals.every((goal) => goal.satisfied)).toBe(true);
        expect(engine.state.steps).toBe(12);
        expect(tutorial01.options.lineBudget).toBeGreaterThanOrEqual(12);
    });

    it('crashes into the pit at (2,2)', () => {
        const engine = new GameEngine(tutorial01);
        engine.turnRight();           // north → east
        engine.moveForward();         // (2,4)
        engine.turnLeft();            // face north
        engine.moveForward();         // (2,3)
        const outcome = engine.moveForward();   // (2,2) is a pit
        expect(outcome.reason?.code).toBe('pit');
    });

    it('crashes pushing the grey crate into the pit', () => {
        const engine = new GameEngine(tutorial01);
        engine.turnRight();           // east
        engine.moveForward();         // (2,4)
        engine.moveForward();         // (3,4)
        engine.turnLeft();            // north
        const outcome = engine.moveForward();   // crate at (3,3) → pit at (3,2)
        expect(outcome.reason?.code).toBe('crate_blocked');
    });
});


// ============================================================
// The async facade
// ============================================================

describe('robot-api', () => {
    it('plays every step before reporting a crash', async () => {
        const played: string[][] = [];
        const player: EventPlayer = {
            play: async (events) => { played.push(events.map((e) => e.kind)); },
        };
        const engine = new GameEngine(makeLevel({ tiles: { '2,1': { kind: 'wall' } } }));
        const robot = createRobotApi(engine, player);

        await expect(robot.moveForward()).rejects.toBeInstanceOf(RobotCrash);
        expect(played).toEqual([['bump'], ['crash']]);
    });

    it('carries the same message the crash event does', async () => {
        const engine = new GameEngine(makeLevel({ tiles: { '2,1': { kind: 'wall' } } }));
        const robot = createRobotApi(engine, nullPlayer);

        await robot.moveForward().catch((error: unknown) => {
            expect(error).toBeInstanceOf(RobotCrash);
            expect((error as RobotCrash).message).toBe(engine.state.failReason);
            expect((error as RobotCrash).reason.code).toBe('wall');
        });
    });

    it('throws LevelComplete once every goal is satisfied', async () => {
        const engine = new GameEngine(makeLevel({
            tiles: { '2,1': { kind: 'goal' } },
            goals: [{ kind: 'reach_goal' }],
        }));
        const robot = createRobotApi(engine, nullPlayer);
        await expect(robot.moveForward()).rejects.toBeInstanceOf(LevelComplete);
    });

    it('lets RunCancelled through rather than dressing it up as a crash', async () => {
        const player: EventPlayer = { play: () => Promise.reject(new RunCancelled()) };
        const engine = new GameEngine(makeLevel());
        const robot = createRobotApi(engine, player);
        await expect(robot.moveForward()).rejects.toBeInstanceOf(RunCancelled);
    });

    it('exposes sensing synchronously', () => {
        const engine = new GameEngine(makeLevel({ tiles: { '2,1': { kind: 'wall' } } }));
        const robot = createRobotApi(engine, nullPlayer);
        expect(robot.isBlocked()).toBe(true);
        expect(robot.isCarrying()).toBe(false);
    });
});


// ============================================================
// Level validation
// ============================================================

describe('validateLevel', () => {
    it('flags a deliver_specific pointing at no bay', () => {
        const problems = validateLevel(makeLevel({
            items: [{ kind: 'crate_colour', id: 'c', color: 'red', position: { x: 2, y: 1 } }],
            goals: [{ kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 3, y: 3 } }],
        }));
        expect(problems.join(' ')).toContain('not a drop-off bay');
    });

    it('flags reach_goal with no goal tile', () => {
        const problems = validateLevel(makeLevel({ goals: [{ kind: 'reach_goal' }] }));
        expect(problems.join(' ')).toContain('no goal tile');
    });

    it('flags duplicate ids and stacked items', () => {
        const problems = validateLevel(makeLevel({
            items: [
                { kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } },
                { kind: 'crate_grey', id: 'c', position: { x: 2, y: 1 } },
            ],
        }));
        expect(problems.join(' ')).toContain('duplicate item id');
        expect(problems.join(' ')).toContain('two items share tile');
    });

    it('flags a keycard for a door that does not exist', () => {
        const problems = validateLevel(makeLevel({
            items: [{ kind: 'keycard', id: 'k', doorId: 'ghost', position: { x: 2, y: 1 } }],
        }));
        expect(problems.join(' ')).toContain('has no door tile');
    });
});
