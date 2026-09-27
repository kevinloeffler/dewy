<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, MarkdownEditor, Topbar } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Seeded once from the loaded item; after that these fields own the text.
	// Reading them untracked matters after a save: `use:enhance` reruns `load`,
	// and re-seeding from the fresh `data` would fight whatever has been typed
	// since. `dirty` below still compares against the live `data.item`.
	let title = $state(untrack(() => data.item.title));
	let body = $state(untrack(() => data.item.body));

	const dirty = $derived(title !== data.item.title || body !== data.item.body);

	let saving = $state(false);
	let savedAt = $state<number | null>(null);

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

		<MarkdownEditor bind:value={body} heading={title} placeholder="Schreib die Lektion hier." />
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
