/**
 * The one error type a student is ever shown for a problem in their own code.
 *
 * Deliberately separate from `RobotCrash`: a crash means the program was
 * valid and the world said no, while a `ScriptError` means the program
 * itself does not make sense. The UI colours and words them differently.
 *
 * `line` is 1-indexed to match CodeMirror's `doc.line()` and the executing
 * line decoration, so it can be handed straight to the editor.
 */
export class ScriptError extends Error {
    constructor(
        message: string,
        readonly line: number,
        readonly column: number = 1,
    ) {
        super(message);
        this.name = 'ScriptError';
    }
}
