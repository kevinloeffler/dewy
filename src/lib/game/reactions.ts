/**
 * How Dewy reacts when a run goes wrong — the body language, not the words.
 *
 * Many crash codes share one reaction: a wall and a shelf are the same thing
 * to hit, and the student should read *what kind* of mistake it was at a
 * glance, not memorise twenty animations. `crash-reasons.ts` maps every code
 * to one of these; `models/roboter.ts` draws them.
 *
 * Framework-free, so the engine can name a reaction without pulling in Three.js.
 */
export type Reaction =
    /** Drove into something solid: recoil onto the rear tracks, dizzy wobble. */
    | 'collide'
    /** Pushed a crate that will not move: leans in, tracks spinning, gives up. */
    | 'strain'
    /** Drove into a hole: hangs a beat, eyes wide, then drops out of sight. Stays down. */
    | 'fall'
    /** A command that makes no sense here: head cocked, looking about, arms out, amber eyes. */
    | 'confused'
    /** Walked into a watched zone: freezes, hands up, alarm-red eyes. Stays caught. */
    | 'caught'
    /** Battery empty: eyes flicker out, head and arms droop. Stays off. */
    | 'power_down'
    /** A runaway loop: shakes harder and harder, steam, spinning head. */
    | 'overheat'
    /** The program ended short of the goal: a small shrug. Not a crash. */
    | 'shrug';

/** Every reaction, in the order the `/ci/robot` preview shows them. */
export const REACTIONS: readonly Reaction[] = [
    'collide', 'strain', 'fall', 'confused', 'caught', 'power_down', 'overheat', 'shrug',
];

