<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { javascript } from '@codemirror/lang-javascript';
	import { EditorState, Compartment } from '@codemirror/state';
	import { autocompletion } from '@codemirror/autocomplete';
	import { sageTheme, sageSyntax } from '$lib/codemirror/theme.js';
	import { robotCompletions } from '$lib/codemirror/completions.js';
	import { executingLineExtension, setExecutingLine } from '$lib/codemirror/executing-line.js';

	interface Props {
		/** Initial code string (controlled: changes replace editor content). */
		code?: string;
		/** 1-indexed line number to highlight as "currently executing". null = none. */
		activeLine?: number | null;
		/** Prevent editing while the program is running. */
		readonly?: boolean;
		filename?: string;
		height?: number | string;
		/** Called on every document change with the new full code string. */
		onchange?: (code: string) => void;
	}

	let {
		code = '',
		activeLine = null,
		readonly: isReadonly = false,
		filename = 'script.js',
		height = 400,
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
					autocompletion({ override: [robotCompletions()] }),
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

<div class="cm-wrap" style="height: {h}">
	<div class="cm-titlebar">
		<div class="cm-dots">
			<span class="cm-dot" style="background:#ff5d73"></span>
			<span class="cm-dot" style="background:#ffb86b"></span>
			<span class="cm-dot" style="background:#7ee787"></span>
		</div>
		<span class="cm-filename">{filename}</span>
		<span class="cm-lang">JavaScript</span>
	</div>
	<div class="cm-body" bind:this={container}></div>
</div>

<style>
	.cm-wrap {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: inset 0 0 0 1px var(--panel-border);
		background: #fdfbf6;
	}

	.cm-titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--panel-border);
		background: #fdfbf6;
		font-family: var(--font-ui);
		font-size: 0.6875rem;
		color: var(--text-muted);
		letter-spacing: 0.4px;
		flex-shrink: 0;
	}

	.cm-dots {
		display: flex;
		gap: 5px;
	}

	.cm-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: block;
	}

	.cm-filename {
		margin-left: 8px;
	}

	.cm-lang {
		margin-left: auto;
		font-size: 0.625rem;
		opacity: 0.7;
	}

	.cm-body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	/* CodeMirror injects .cm-editor into .cm-body */
	.cm-body :global(.cm-editor) {
		height: 100%;
		font-family: var(--font-code);
		font-size: 13px;
	}

	.cm-body :global(.cm-scroller) {
		overflow: auto;
		font-family: var(--font-code);
	}

	/* Executing line left border adjustments */
	.cm-body :global(.cm-executing-line) {
		/* Compensate for the 3px left border so text doesn't shift */
		padding-left: 1px;
	}

	/* Fold gutter tweak — pull it closer to line numbers */
	.cm-body :global(.cm-foldGutter) {
		width: 14px;
	}
</style>
