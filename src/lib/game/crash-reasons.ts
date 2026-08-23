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
    | 'battery';

export type CrashReason = {
    code: CrashCode;
    message: string;
};

const MESSAGES: Record<CrashCode, string> = {
    edge:            "That's the edge of the warehouse.",
    wall:            "There's a wall in the way.",
    door_closed:     'That door is closed.',
    pit:             "That's a pit — the robot fell in!",
    cargo_belt:      'Cargo belts are for crates only — the robot cannot stand on one.',
    switch_blocked:  'There is a switch in the way — flip it, do not walk into it.',
    robot_gap:       'Only the robot fits through that gap.',
    crate_blocked:   'The crate has nowhere to go.',
    crate_delivered: 'That crate has already been delivered.',

    nothing_to_pick:  "There's nothing here to pick up.",
    already_carrying: 'The robot is already carrying a crate.',
    not_carrying:     "The robot isn't carrying anything.",

    not_a_door:    "There's no door here to open.",
    no_keycard:    "You don't have the keycard for this door.",
    no_keyhole:    'This door has no keyhole — something else must open it.',
    not_a_switch:  "There's no switch here to flip.",

    motion_sensor: 'A motion sensor spotted the robot!',
    battery:       "The robot's battery ran out — is it stuck in a loop?",
};

export function crash(code: CrashCode): CrashReason {
    return { code, message: MESSAGES[code] };
}
