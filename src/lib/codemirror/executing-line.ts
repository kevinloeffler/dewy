import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

// Dispatch this effect to set (or clear) the executing line.
// Line numbers are 1-indexed to match CodeMirror's doc.line() API.
export const setExecutingLine = StateEffect.define<number | null>();

const executingLineMark = Decoration.line({ class: 'cm-executing-line' });

const executingLineField = StateField.define<DecorationSet>({
	create: () => Decoration.none,

	update(decs, tr) {
		// Remap decorations through any document changes so line numbers
		// stay correct while the user edits.
		decs = decs.map(tr.changes);

		for (const effect of tr.effects) {
			if (!effect.is(setExecutingLine)) continue;
			if (effect.value === null) return Decoration.none;
			try {
				const line = tr.state.doc.line(effect.value);
				return Decoration.set([executingLineMark.range(line.from)]);
			} catch {
				// Line number out of range — clear decoration gracefully.
				return Decoration.none;
			}
		}

		return decs;
	},

	provide: (field) => EditorView.decorations.from(field),
});

export const executingLineExtension: Extension = executingLineField;
