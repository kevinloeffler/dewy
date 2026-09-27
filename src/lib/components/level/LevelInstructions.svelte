<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	/**
	 * The level's markdown instructions, above the run controls. Capped at 40vh
	 * so a long text scrolls inside the block instead of squeezing the editor,
	 * and collapsible so it can give that room back once it has been read.
	 */
	interface Props {
		source: string;
	}

	let { source }: Props = $props();

	const html = $derived(renderMarkdown(source));

	let open = $state(true);
</script>

<section class="instructions panel">
	<header class="head">
		<span class="hud-label">Anleitung</span>
		<button
			class="toggle"
			type="button"
			aria-expanded={open}
			aria-controls="level-instructions"
			onclick={() => (open = !open)}
		>
			{open ? 'Ausblenden' : 'Anzeigen'}
		</button>
	</header>

	{#if open}
		<div class="body" id="level-instructions">
			<!-- Safe by construction: `renderMarkdown` escapes every text run and
			     only ever emits tags it chose itself. -->
			<article class="prose">{@html html}</article>
		</div>
	{/if}
</section>

<style>
	.instructions {
		display: flex;
		flex-direction: column;
		max-height: 40vh;
		min-height: 0;
		overflow: hidden;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px 8px 20px;
	}

	.toggle {
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
		background: none;
		border: 0;
		border-radius: 6px;
		padding: 4px 8px;
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--chip-bg);
		color: var(--text);
	}

	.body {
		overflow: auto;
		min-height: 0;
		padding: 0 20px 16px;
	}

	/* The column is narrow; a theory page's headings would dominate it. */
	.body :global(.prose h1) {
		font-size: 1.25rem;
	}

	.body :global(.prose h2) {
		font-size: 1.0625rem;
	}
</style>
