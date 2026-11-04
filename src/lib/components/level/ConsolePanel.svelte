<script lang="ts" module>
	/** One line `say` wrote, and the line of code that wrote it. */
	export type ConsoleLine = { text: string; line: number };
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { MAX_OUTPUT_LINES } from '$lib/game/script';

	interface Props {
		lines: ConsoleLine[];
		/** The run said more than `MAX_OUTPUT_LINES`; the rest was dropped. */
		full?: boolean;
	}

	let { lines, full = false }: Props = $props();

	/**
	 * Collapsed or not is the student's preference, not the level's, so it is
	 * one key for every level. Storage may be blocked — then it is open.
	 */
	const OPEN_KEY = 'dewy:console:open';
	let open = $state(readOpen());

	function readOpen(): boolean {
		if (!browser) return true;
		try {
			return localStorage.getItem(OPEN_KEY) !== 'false';
		} catch {
			return true;
		}
	}

	function toggle() {
		open = !open;
		try {
			localStorage.setItem(OPEN_KEY, String(open));
		} catch {
			// A private window: the choice lasts until reload.
		}
	}

	let body = $state<HTMLOListElement | null>(null);
	/**
	 * Follow new lines only while the student is at the bottom: someone who
	 * scrolled up to read an earlier line keeps their place.
	 */
	let pinned = true;

	function onscroll() {
		if (!body) return;
		pinned = body.scrollHeight - body.scrollTop - body.clientHeight < 4;
	}

	$effect(() => {
		// Re-run on every new line, and when the panel opens.
		void lines.length;
		if (!open || !body) return;
		if (lines.length === 0) pinned = true;
		if (!pinned) return;
		const target = body;
		void tick().then(() => (target.scrollTop = target.scrollHeight));
	});

	const count = $derived(
		lines.length === 1 ? '1 Zeile' : `${lines.length}${full ? '+' : ''} Zeilen`
	);
</script>

<div class="output-panel" class:is-open={open} role="region" aria-label="Konsole">
	<button class="header" type="button" aria-expanded={open} onclick={toggle}>
		<svg class="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		<span class="title">Konsole</span>
		{#if lines.length > 0}
			<span class="count">{count}</span>
		{/if}
	</button>

	{#if open}
		<ol class="body" bind:this={body} {onscroll} aria-live="polite">
			{#each lines as entry, index (index)}
				<li class="entry">
					<span class="where" title="Zeile {entry.line}">{entry.line}</span>
					<span class="text">{entry.text}</span>
				</li>
			{:else}
				<li class="empty">
					Noch nichts gesagt. <code>say("Hallo")</code> schreibt hierhin.
				</li>
			{/each}
			{#if full}
				<li class="empty">… nach {MAX_OUTPUT_LINES} Zeilen abgeschnitten.</li>
			{/if}
		</ol>
	{/if}
</div>

<style>
	.output-panel {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		background: var(--editor-bg);
		border-top: 1px solid var(--panel-border);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 32px;
		padding: 0 12px;
		border: 0;
		background: var(--editor-gutter);
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.3px;
		text-transform: uppercase;
		text-align: left;
		cursor: pointer;
	}

	.header:hover {
		color: var(--text);
	}

	.header:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.chevron {
		transform: rotate(-90deg);
		transition: transform 120ms ease;
	}

	.is-open .chevron {
		transform: none;
	}

	.count {
		margin-left: auto;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-faint);
	}

	/* Five lines tall: enough to read a loop's last few, not enough to crowd the code. */
	.body {
		height: calc(5 * 20px + 12px);
		margin: 0;
		padding: 6px 0;
		list-style: none;
		overflow-y: auto;
		font-family: var(--font-code);
		font-size: 13px;
		line-height: 20px;
		color: var(--editor-text);
	}

	.entry {
		display: flex;
		gap: 12px;
		padding: 0 12px;
	}

	.where {
		flex-shrink: 0;
		min-width: 2ch;
		text-align: right;
		color: var(--text-faint);
		user-select: none;
	}

	.text {
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.empty {
		padding: 0 12px;
		color: var(--text-faint);
		font-family: var(--font-ui);
	}

	.empty code {
		font-family: var(--font-code);
		color: var(--text-muted);
	}
</style>
