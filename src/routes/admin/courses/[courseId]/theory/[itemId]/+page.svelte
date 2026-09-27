<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Panel, Topbar } from '$lib/components/index.js';
	import { MARKDOWN_FEATURES, renderMarkdown } from '$lib/markdown';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Seeded once from the loaded item; after that these fields own the text.
	// Reading them untracked matters after a save: `use:enhance` reruns `load`,
	// and re-seeding from the fresh `data` would fight whatever has been typed
	// since. `dirty` below still compares against the live `data.item`.
	let title = $state(untrack(() => data.item.title));
	let body = $state(untrack(() => data.item.body));

	// The same renderer the student page uses, so the preview cannot drift.
	const preview = $derived(renderMarkdown(body));
	const dirty = $derived(title !== data.item.title || body !== data.item.body);

	let saving = $state(false);
	let savedAt = $state<number | null>(null);
	let showHelp = $state(false);

	function onkeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 's') {
			event.preventDefault();
			saveForm?.requestSubmit();
		}
	}

	let saveForm = $state<HTMLFormElement | undefined>();
</script>

<svelte:head>
	<title>{title} · Dewy</title>
</svelte:head>

<svelte:window {onkeydown} />

<Topbar brand={false}>
	{#snippet left()}
		<a class="crumb" href="/admin/courses/{data.context.course.id}">{data.context.course.title}</a>
		<span class="crumb-sep">›</span>
		<span class="crumb-current">{data.context.stage.title}</span>
	{/snippet}
	{#snippet right()}
		{#if saving}
			<span class="status">Speichern…</span>
		{:else if dirty}
			<span class="status">Ungespeicherte Änderungen</span>
		{:else if savedAt}
			<span class="status">Gespeichert</span>
		{/if}
		<a class="btn btn-ghost" href="/admin/courses/{data.context.course.id}">Zurück zum Kurs</a>
	{/snippet}
</Topbar>

<main class="page">
	<form
		bind:this={saveForm}
		class="editor-form"
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				if (result.type === 'success') savedAt = Date.now();
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="title" value={title} />
		<input type="hidden" name="body" value={body} />

		<div class="title-row">
			<input class="field field-title" bind:value={title} placeholder="Titel des Blocks" autocomplete="off" />
			<Button type="submit" disabled={saving}>Speichern</Button>
		</div>

		{#if form?.message}
			<p class="error">{form.message}</p>
		{/if}

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
					class="field source"
					bind:value={body}
					spellcheck="true"
					placeholder="Schreib die Lektion hier."
				></textarea>
			</section>

			<section class="pane">
				<header class="pane-head">
					<span class="hud-label">Vorschau</span>
				</header>
				<Panel>
					<article class="prose">
						<h1>{title}</h1>
						<!-- Safe by construction: `renderMarkdown` escapes every text run
						     and only ever emits tags it chose itself. -->
						{@html preview}
					</article>
				</Panel>
			</section>
		</div>
	</form>

	<form class="delete" method="POST" action="?/delete" use:enhance>
		<button class="btn btn-ghost danger" type="submit">Diesen Block löschen</button>
	</form>
</main>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: 24px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.crumb {
		color: var(--text-muted);
		text-decoration: none;
	}

	.crumb:hover {
		color: var(--accent);
	}

	.crumb-sep {
		color: var(--text-faint);
	}

	.crumb-current {
		color: var(--text);
	}

	.status {
		font-size: 13px;
		color: var(--text-muted);
	}

	.editor-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.title-row {
		display: flex;
		gap: 10px;
	}

	.field {
		font: inherit;
		font-family: var(--font-ui);
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 6px);
		padding: 9px 12px;
	}

	.field:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.field-title {
		flex: 1;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 18px;
	}

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
		min-height: 460px;
		font-family: var(--font-code);
		font-size: 13px;
		line-height: 1.6;
		resize: vertical;
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

	.error {
		margin: 0;
		color: var(--danger);
		font-size: 13px;
	}

	.delete {
		display: flex;
		justify-content: flex-end;
	}

	.danger {
		color: var(--danger);
	}
</style>
