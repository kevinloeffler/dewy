<script lang="ts">
	import { MARKDOWN_FEATURES, renderMarkdown } from '$lib/markdown';
	import Panel from './Panel.svelte';

	/**
	 * Markdown source beside a live preview — the theory block editor and the
	 * designer's level instructions share it, so both are written against the
	 * same renderer and the same documented subset.
	 */
	interface Props {
		value?: string;
		placeholder?: string;
		/** Rendered as the preview's `<h1>`, e.g. a theory block's title. */
		heading?: string;
		/** Starting height of the source textarea; it stays resizable. */
		minHeight?: string;
	}

	let { value = $bindable(''), placeholder, heading, minHeight = '460px' }: Props = $props();

	// The same renderer the student page uses, so the preview cannot drift.
	const preview = $derived(renderMarkdown(value));

	let showHelp = $state(false);
</script>

<div class="split">
	<section class="pane">
		<header class="pane-head">
			<span class="hud-label">Markdown</span>
			<button class="btn btn-ghost" type="button" onclick={() => (showHelp = !showHelp)}>
				{showHelp ? 'Ausblenden' : 'Formatierung'}
			</button>
		</header>

		{#if showHelp}
			<ul class="help">
				{#each MARKDOWN_FEATURES as feature (feature.syntax)}
					<li><code>{feature.syntax}</code><span>{feature.result}</span></li>
				{/each}
			</ul>
		{/if}

		<textarea
			class="source"
			style:min-height={minHeight}
			bind:value
			spellcheck="true"
			{placeholder}
		></textarea>
	</section>

	<section class="pane">
		<header class="pane-head">
			<span class="hud-label">Vorschau</span>
		</header>
		<Panel>
			<article class="prose">
				{#if heading !== undefined}
					<h1>{heading}</h1>
				{/if}
				<!-- Safe by construction: `renderMarkdown` escapes every text run
				     and only ever emits tags it chose itself. -->
				{@html preview}
			</article>
		</Panel>
	</section>
</div>

<style>
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-items: start;
	}

	@media (max-width: 900px) {
		.split {
			grid-template-columns: 1fr;
		}
	}

	.pane {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.pane-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 32px;
	}

	.source {
		font: inherit;
		font-family: var(--font-code);
		font-size: 13px;
		line-height: 1.6;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 6px);
		padding: 9px 12px;
		resize: vertical;
	}

	.source:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.help {
		list-style: none;
		margin: 0;
		padding: 10px 12px;
		background: var(--chip-bg);
		border-radius: calc(var(--radius) - 6px);
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
	}

	.help li {
		display: flex;
		gap: 10px;
	}

	.help code {
		font-family: var(--font-code);
		color: var(--text);
		min-width: 150px;
		white-space: pre;
	}

	.help span {
		color: var(--text-muted);
	}
</style>
