/**
 * Every way a run can end badly, in one place.
 *
 * The same text has to reach three destinations — `WorldEvent.crash.reason`,
 * `LevelState.failReason` and the `RobotCrash` exception — so it is written
 * once here. The `code` is what tests assert on and what a future translation
 * layer keys off; the message is what the student reads.
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
    | 'crate_blocked'
    | 'crate_delivered'
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
};

const MESSAGES: Record<CrashCode, string> = {
    edge:            'Das ist der Rand der Lagerhalle.',
    wall:            'Da ist eine Wand im Weg.',
    door_closed:     'Diese Tür ist zu.',
    pit:             'Das ist ein Loch — Dewy ist hineingefallen!',
    cargo_belt:      'Förderbänder sind nur für Kisten — Dewy kann nicht darauf stehen.',
    switch_blocked:  'Da ist ein Schalter im Weg — betätige ihn, lauf nicht hinein.',
    robot_gap:       'Durch diese Lücke passt nur Dewy allein.',
    crate_blocked:   'Die Kiste kann nirgendwohin.',
    crate_delivered: 'Diese Kiste ist schon abgeliefert.',
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
export function crash(code: CrashCode): CrashReason {
    return { code, message: MESSAGES[code] };
}

/**
 * `obstacle`, naming the piece of furniture in the way.
 *
 * The generic message above is the fallback nothing should reach: an empty
 * stretch of floor with a pallet on it reads as a bug unless the crash says
 * what the pallet was. `name` comes from `DECORATION_NAMES`, article included.
 */
export function obstacleCrash(name: string): CrashReason {
    return { code: 'obstacle', message: `Da steht ${name} im Weg.` };
}
