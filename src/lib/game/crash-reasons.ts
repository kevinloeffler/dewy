import type { Reaction } from './reactions';

/**
 * Every way an action can go wrong, in one place.
 *
 * The same text has to reach three destinations — `WorldEvent.crash.reason`,
 * `LevelState.failReason` and the `RobotCrash` exception — so it is written
 * once here. The `code` is what tests assert on and what a future translation
 * layer keys off; the message is what the student reads.
 *
 * Not every code ends the run. Running into the world is **fatal**; a command
 * that finds nothing to act on — `open()` with no door ahead, `pick()` on an
 * empty tile — is a **fumble**: Dewy looks confused, the command still costs
 * its energy, and the program carries on. `FUMBLES` is that list.
 */
export type CrashCode =
    // moving
    | 'edge'
    | 'wall'
    | 'door_closed'
    | 'pit'
    | 'cargo_belt'
    | 'switch_blocked'
    | 'robot_gap'
    | 'robot_gap_carrying'
    | 'crate_gap'
    | 'crate_blocked'
    | 'crate_chain'
    | 'obstacle'
    // carrying
    | 'nothing_to_pick'
    | 'already_carrying'
    | 'not_carrying'
    // doors and switches
    | 'not_a_door'
    | 'no_keycard'
    | 'no_keyhole'
    | 'not_a_switch'
    // the world fighting back
    | 'motion_sensor'
    | 'out_of_energy'
    | 'runaway';

export type CrashReason = {
    code: CrashCode;
    message: string;
    /** How Dewy shows it — see `reactions.ts`. */
    reaction: Reaction;
    /** Ends the run. False for a fumble, which the program carries on past. */
    fatal: boolean;
};

const MESSAGES: Record<CrashCode, string> = {
    edge:            'Das ist der Rand der Lagerhalle.',
    wall:            'Da ist eine Wand im Weg.',
    door_closed:     'Diese Tür ist zu.',
    pit:             'Das ist ein Loch — Dewy ist hineingefallen!',
    cargo_belt:      'Förderbänder sind nur für Kisten — Dewy kann nicht darauf stehen.',
    switch_blocked:  'Da ist ein Schalter im Weg — betätige ihn, lauf nicht hinein.',
    robot_gap:       'Diese Lücke hat genau Dewys Form — eine Kiste passt da nicht hindurch.',
    robot_gap_carrying: 'Mit einer Kiste passt Dewy nicht hindurch. Stell die Kiste zuerst ab.',
    crate_gap:       'Diese Lücke ist zu niedrig für Dewy. Vielleicht passt ja etwas anderes hindurch?',
    crate_blocked:   'Die Kiste kann nirgendwohin.',
    crate_chain:     'Hinter dieser Kiste steht noch eine — Dewy ist nicht stark genug, um zwei Kisten auf einmal zu schieben.',
    obstacle:        'Da steht etwas im Weg.',

    nothing_to_pick:  'Hier gibt es nichts zum Aufheben.',
    already_carrying: 'Dewy trägt schon eine Kiste.',
    not_carrying:     'Dewy trägt nichts.',

    not_a_door:    'Hier ist keine Tür zum Öffnen.',
    no_keycard:    'Du hast keine Keycard für diese Tür.',
    no_keyhole:    'Diese Tür hat kein Schlüsselloch — etwas anderes muss sie öffnen.',
    not_a_switch:  'Hier ist kein Schalter zum Betätigen.',

    motion_sensor: 'Ein Bewegungsmelder hat Dewy entdeckt!',
    out_of_energy: 'Dewy hat keine Batterie mehr. Verwende weniger Befehle um das Level zu lösen.',
    runaway:       'Dewy läuft und läuft — ist das eine Endlosschleife?',
};
/** Which reaction each crash plays — several codes share one, see `reactions.ts`. */
export const CRASH_REACTIONS: Record<CrashCode, Reaction> = {
    edge:            'collide',
    wall:            'collide',
    door_closed:     'collide',
    switch_blocked:  'collide',
    robot_gap:       'collide',
    robot_gap_carrying: 'collide',
    crate_gap:       'collide',
    obstacle:        'collide',
    crate_blocked:   'strain',
    crate_chain:     'strain',
    pit:             'fall',
    // The belt is not solid — Dewy just cannot use it, so it is a
    // misunderstanding rather than a collision.
    cargo_belt:      'confused',

    nothing_to_pick:  'confused',
    already_carrying: 'confused',
    not_carrying:     'confused',

    not_a_door:    'confused',
    no_keycard:    'confused',
    no_keyhole:    'confused',
    not_a_switch:  'confused',

    motion_sensor: 'caught',
    out_of_energy: 'power_down',
    runaway:       'overheat',
};

/**
 * The commands that had nothing to act on — every one of them a no-op that
 * leaves the world untouched, which is what makes carrying on safe. A `drop()`
 * into a wall is *not* here: that is the crate hitting something.
 */
const FUMBLES: ReadonlySet<CrashCode> = new Set<CrashCode>([
    'nothing_to_pick',
    'already_carrying',
    'not_carrying',
    'not_a_door',
    'no_keycard',
    'no_keyhole',
    'not_a_switch',
]);

export function crash(code: CrashCode): CrashReason {
    return { code, message: MESSAGES[code], reaction: CRASH_REACTIONS[code], fatal: !FUMBLES.has(code) };
}

/**
 * `obstacle`, naming the piece of furniture in the way.
 *
 * The generic message above is the fallback nothing should reach: an empty
 * stretch of floor with a pallet on it reads as a bug unless the crash says
 * what the pallet was. `name` comes from `DECORATION_NAMES`, article included.
 */
export function obstacleCrash(name: string): CrashReason {
    return { code: 'obstacle', message: `Da steht ${name} im Weg.`, reaction: CRASH_REACTIONS.obstacle, fatal: true };
}
