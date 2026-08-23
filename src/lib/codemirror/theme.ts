import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// ── Editor chrome ────────────────────────────────────────────
export const sageTheme: Extension = EditorView.theme(
	{
		'&': {
			color: '#2d3a2e',
			backgroundColor: '#fdfbf6',
		},
		'&.cm-focused': { outline: 'none' },

		'.cm-content': {
			caretColor: '#2d3a2e',
			padding: '4px 0',
		},

		'.cm-cursor, .cm-dropCursor': {
			borderLeftColor: '#2d3a2e',
			borderLeftWidth: '2px',
		},

		'.cm-selectionBackground': {
			backgroundColor: 'rgba(107, 158, 122, 0.25)',
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: 'rgba(107, 158, 122, 0.3)',
		},
		'.cm-content ::selection': {
			backgroundColor: 'rgba(107, 158, 122, 0.3)',
		},

		'.cm-gutters': {
			backgroundColor: '#f3eee2',
			color: '#a0aaa1',
			border: 'none',
			borderRight: '1px solid rgba(45, 58, 46, 0.08)',
		},
		'.cm-lineNumbers .cm-gutterElement': {
			padding: '0 10px 0 6px',
			minWidth: '36px',
			fontSize: '12px',
		},
		'.cm-foldGutter .cm-gutterElement': {
			padding: '0 4px',
		},

		'.cm-activeLineGutter': {
			backgroundColor: 'rgba(217, 119, 87, 0.14)',
			color: '#d97757',
			fontWeight: '700',
		},
		'.cm-activeLine': {
			backgroundColor: 'rgba(217, 119, 87, 0.06)',
		},

		// Executing line (program counter decoration)
		'.cm-executing-line': {
			backgroundColor: 'rgba(217, 119, 87, 0.13)',
			borderLeft: '3px solid #d97757',
		},

		'.cm-selectionMatch': {
			backgroundColor: 'rgba(107, 158, 122, 0.18)',
		},
		'.cm-matchingBracket, .cm-nonmatchingBracket': {
			backgroundColor: 'rgba(107, 158, 122, 0.22)',
			outline: '1px solid rgba(107, 158, 122, 0.45)',
		},

		'.cm-foldPlaceholder': {
			backgroundColor: '#eef3e8',
			border: '1px solid rgba(45, 58, 46, 0.14)',
			color: '#6c7a6e',
			borderRadius: '3px',
			padding: '0 5px',
		},

		// Autocomplete popup
		'.cm-tooltip': {
			backgroundColor: '#ffffff',
			border: '1px solid rgba(45, 58, 46, 0.1)',
			borderRadius: '8px',
			boxShadow: '0 4px 16px rgba(45, 58, 46, 0.14)',
		},
		'.cm-tooltip.cm-tooltip-autocomplete > ul': {
			fontFamily: '"JetBrains Mono", ui-monospace, monospace',
			fontSize: '12.5px',
			maxHeight: '200px',
		},
		'.cm-tooltip-autocomplete ul li[aria-selected]': {
			backgroundColor: 'rgba(107, 158, 122, 0.18)',
			color: '#2d3a2e',
		},
		'.cm-completionLabel': {
			color: '#2d3a2e',
		},
		'.cm-completionMatchedText': {
			textDecoration: 'none',
			color: '#6b9e7a',
			fontWeight: '700',
		},
		'.cm-completionDetail': {
			color: '#a0aaa1',
			fontStyle: 'italic',
			fontSize: '11px',
		},
		'.cm-completionIcon': {
			opacity: '0.6',
		},

		// Search panel
		'.cm-panels': {
			backgroundColor: '#f3eee2',
			color: '#2d3a2e',
			borderTop: '1px solid rgba(45, 58, 46, 0.08)',
		},
		'.cm-searchMatch': {
			backgroundColor: 'rgba(217, 119, 87, 0.2)',
			outline: '1px solid rgba(217, 119, 87, 0.4)',
			borderRadius: '2px',
		},
		'.cm-searchMatch.cm-searchMatch-selected': {
			backgroundColor: 'rgba(217, 119, 87, 0.4)',
		},
	},
	{ dark: false },
);

// ── Syntax token colors ──────────────────────────────────────
export const sageSyntax: Extension = syntaxHighlighting(
	HighlightStyle.define([
		{ tag: t.keyword,                                 color: '#a4732a', fontWeight: '600' },
		{ tag: [t.function(t.variableName),
		        t.function(t.propertyName)],              color: '#2d3a2e', fontWeight: '500' },
		{ tag: [t.propertyName, t.name],                  color: '#3e5340' },
		{ tag: [t.string, t.inserted, t.special(t.string)], color: '#6b9e7a' },
		{ tag: [t.number, t.changed],                     color: '#d97757' },
		{ tag: t.bool,                                    color: '#d97757', fontWeight: '600' },
		{ tag: t.null,                                    color: '#a0aaa1' },
		{ tag: [t.comment, t.lineComment,
		        t.blockComment, t.docComment],            color: '#a0aaa1', fontStyle: 'italic' },
		{ tag: t.operator,                                color: '#2d3a2e' },
		{ tag: [t.punctuation, t.separator],              color: '#3e5340' },
		{ tag: [t.typeName, t.className],                 color: '#a4732a' },
		{ tag: t.self,                                    color: '#a4732a' },
		{ tag: t.regexp,                                  color: '#d97757' },
		{ tag: t.invalid,                                 color: '#d14343',
		  textDecoration: 'underline dotted #d14343' },
	]),
);
