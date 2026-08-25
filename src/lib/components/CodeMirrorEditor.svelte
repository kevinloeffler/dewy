<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { javascript } from '@codemirror/lang-javascript';
	import { EditorState, Compartment } from '@codemirror/state';
	import { autocompletion } from '@codemirror/autocomplete';
	import { sageTheme, sageSyntax } from '$lib/codemirror/theme.js';
	import { robotCompletions } from '$lib/codemirror/completions.js';
	import { executingLineExtension, setExecutingLine } from '$lib/codemirror/executing-line.js';
	import type { LanguageStage } from '$lib/game/level';

	interface Props {
		/** Initial code string (controlled: changes replace editor content). */
		code?: string;
		/** 1-indexed line number to highlight as "currently executing". null = none. */
		activeLine?: number | null;
		/** Prevent editing while the program is running. */
		readonly?: boolean;
		height?: number | string;
		/** Only offer commands the level's language stage has introduced. */
		stage?: LanguageStage;
		/** Called on every document change with the new full code string. */
		onchange?: (code: string) => void;
	}

	let {
		code = '',
		activeLine = null,
		readonly: isReadonly = false,
		height = 400,
		stage = 5,
		onchange,
	}: Props = $props();

	let container = $state<HTMLDivElement>();
	let view: EditorView | undefined;
	let mounted = $state(false);
	const readonlyComp = new Compartment();

	onMount(() => {
		view = new EditorView({
			state: EditorState.create({
				doc: code,
				extensions: [
					basicSetup,
					javascript(),
					sageTheme,
					sageSyntax,
					executingLineExtension,
					readonlyComp.of(EditorState.readOnly.of(isReadonly)),
					autocompletion({ override: [robotCompletions(stage)] }),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onchange?.(update.state.doc.toString());
					}),
				],
			}),
			parent: container!,
		});

		mounted = true;    // triggers the reactive effects below
		return () => view?.destroy();
	});

	// Sync executing line decoration
	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({ effects: setExecutingLine.of(activeLine ?? null) });
	});

	// Sync readonly state
	$effect(() => {
		if (!mounted || !view) return;
		view.dispatch({
			effects: readonlyComp.reconfigure(EditorState.readOnly.of(isReadonly)),
		});
	});

	// Sync external code changes (e.g. mission reset)
	$effect(() => {
		if (!mounted || !view) return;
		if (view.state.doc.toString() === code) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: code },
		});
	});

	const h = $derived(typeof height === 'number' ? `${height}px` : height);
</script>

<div class="cm-wrap" style="height: {h}" bind:this={container}></div>

<style>
	/* No frame of its own: the editor sits on whatever surface holds it. */
	.cm-wrap {
		min-height: 0;
		overflow: hidden;
		border-radius: var(--radius);
	}

	/* CodeMirror injects .cm-editor into .cm-wrap */
	.cm-wrap :global(.cm-editor) {
		height: 100%;
		font-family: var(--font-code);
		font-size: 13px;
	}

	.cm-wrap :global(.cm-scroller) {
		overflow: auto;
		font-family: var(--font-code);
	}

	/* Executing line left border adjustments */
	.cm-wrap :global(.cm-executing-line) {
		/* Compensate for the 3px left border so text doesn't shift */
		padding-left: 1px;
	}

	/* Fold gutter tweak — pull it closer to line numbers */
	.cm-wrap :global(.cm-foldGutter) {
		width: 14px;
	}
</style>
