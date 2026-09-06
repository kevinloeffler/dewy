<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Callout, Modal } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let creating = $state(false);
	// Holds the row rather than a flag: the warning names the level it is about.
	let deleting = $state<{ id: string; name: string } | null>(null);

	const date = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' });
</script>

<svelte:head>
	<title>Playgrounds · Dewy</title>
</svelte:head>

<main class="page">
	{#if form?.message}
		<Callout variant="danger">{form.message}</Callout>
	{/if}

	<header class="head">
		<h1 class="head-title">Playgrounds</h1>
		<Button onclick={() => (creating = true)}>Neues Playground</Button>
	</header>

	<p class="hint">
		Einzelne Levels, die zu keinem Kurs gehören — zum Ausprobieren, für eine Vertretungsstunde oder
		als Knobelaufgabe zwischendurch. Du bearbeitest sie im Designer und kannst den Link zum Spielen
		direkt weitergeben.
	</p>

	{#if data.playgrounds.length === 0}
		<section class="panel card">
			<p class="empty">Noch keine Playgrounds. Leg eines an, um ein Level ohne Kurs zu bauen.</p>
		</section>
	{:else}
		<ul class="list">
			{#each data.playgrounds as level (level.id)}
				<li class="panel card">
					<div class="row">
						<div class="row-text">
							<p class="row-head">
								<a class="row-name" href="/designer/{level.id}">{level.name}</a>
								{#if level.ownerName}
									<span class="chip">{level.ownerName}</span>
								{:else}
									<span class="chip">Ohne Besitzer</span>
								{/if}
							</p>
							<p class="row-meta">
								{level.width} × {level.height} · bearbeitet {date.format(level.updatedAt)}
							</p>
							{#if level.description}
								<p class="row-desc">{level.description}</p>
							{/if}
						</div>

						<div class="controls">
							<a class="btn btn-ghost act" href="/level/{level.id}">Spielen</a>
							<a class="btn btn-ghost act" href="/designer/{level.id}">Bearbeiten</a>
							<button
								class="btn btn-danger act"
								type="button"
								onclick={() => (deleting = { id: level.id, name: level.name })}
							>
								Löschen
							</button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<Modal bind:open={creating} title="Neues Playground">
	<form class="dialog-form" method="POST" action="?/create" use:enhance>
		<label class="field-label" for="new-playground-name">Levelname</label>
		<input
			class="field"
			id="new-playground-name"
			name="name"
			placeholder="z. B. Kisten sortieren"
			autocomplete="off"
		/>
		<div class="dialog-actions">
			<Button type="button" variant="ghost" onclick={() => (creating = false)}>Abbrechen</Button>
			<Button type="submit">Erstellen und öffnen</Button>
		</div>
	</form>
</Modal>

<Modal open={deleting !== null} title="Playground löschen?" onclose={() => (deleting = null)}>
	<p class="hint">
		„{deleting?.name}“ wird gelöscht. Das lässt sich nicht rückgängig machen.
	</p>
	<form class="dialog-actions" method="POST" action="?/delete" use:enhance>
		<input type="hidden" name="id" value={deleting?.id} />
		<Button type="button" variant="ghost" onclick={() => (deleting = null)}>Abbrechen</Button>
		<button class="btn btn-danger" type="submit">Endgültig löschen</button>
	</form>
</Modal>

<style>
	/* Deliberately the course list's metrics: the two tabs sit next to each
	   other in the nav and should not read as different pages. */
	.page {
		max-width: 929px;
		margin: 0 auto;
		padding: 44px 32px 80px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.head-title {
		font-size: 1.375rem;
		font-weight: 700;
	}

	.card {
		padding: 24px 32px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}

	.row-text {
		flex: 1;
		min-width: 220px;
	}

	.row-head {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.row-name {
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--text);
		text-decoration: none;
	}

	.row-name:hover {
		color: var(--accent);
	}

	.row-meta,
	.row-desc {
		margin-top: 4px;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	.act {
		justify-content: center;
		min-width: 98px;
		height: 43px;
		padding: 0 12px;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.empty,
	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.hint {
		font-size: 0.8125rem;
		line-height: 1.55;
	}

	.field {
		height: 43px;
		border-radius: 8px;
		font-size: 1rem;
		padding: 0 14px;
	}

	.dialog-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}
</style>
