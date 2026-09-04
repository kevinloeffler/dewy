<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Callout, Panel } from '$lib/components/index.js';
	import { ROLES, ROLE_LABELS } from '$lib/roles';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const message = $derived(form && 'message' in form ? form.message : undefined);
	const saved = $derived(form && 'savedAt' in form);

	// Seeded once; the fields own their text after that.
	let name = $state(untrack(() => data.person.name));
	let username = $state(untrack(() => data.person.username ?? ''));
	let email = $state(untrack(() => data.person.email ?? ''));

	const memberOf = $derived(new Set(data.person.classes.map((row) => row.id)));
	const joinable = $derived(data.classes.filter((row) => !memberOf.has(row.id)));

	const dateFormat = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' });
</script>

<svelte:head>
	<title>{data.person.name} · Benutzer · Dewy</title>
</svelte:head>

<main class="page">
	<div class="head">
		<a class="back" href="/admin/people">‹ Benutzer</a>
	</div>

	<h1 class="title">
		{data.person.name}
		<span class="chip">{ROLE_LABELS[data.person.role]}</span>
		{#if data.person.archivedAt}<span class="chip">Archiviert</span>{/if}
	</h1>

	<p class="meta">
		Erstellt am {dateFormat.format(data.person.createdAt)}
		· {data.person.completedItems}
		{data.person.completedItems === 1 ? 'Element' : 'Elemente'} erledigt
		· {data.person.lastSignInAt
			? `zuletzt angemeldet am ${dateFormat.format(data.person.lastSignInAt)}`
			: 'noch nie angemeldet'}
	</p>

	{#if message}
		<Callout variant="danger">{message}</Callout>
	{/if}

	<h2 class="section-title">Details</h2>
	<Panel>
		<form method="POST" action="?/rename" use:enhance>
			<label class="field-label" for="name">Name</label>
			<input class="field" id="name" name="name" bind:value={name} />

			{#if data.person.role === 'student'}
				<label class="field-label spaced" for="username">Benutzername</label>
				<input class="field" id="username" name="username" bind:value={username} autocapitalize="none" />
				<p class="field-hint">
					Das ändert, womit sich die Person anmeldet. Das Passwort bleibt gleich.
				</p>
			{:else}
				<label class="field-label spaced" for="email">E-Mail</label>
				<input class="field" id="email" name="email" type="email" bind:value={email} />
			{/if}

			<Button type="submit" variant="ghost">Speichern</Button>
		</form>
	</Panel>

	<h2 class="section-title">Klassen</h2>
	<Panel>
		{#if data.person.classes.length === 0}
			<p class="empty">In keiner Klasse.</p>
		{:else}
			<ul class="chips">
				{#each data.person.classes as row (row.id)}
					<li>
						<a class="chip" href="/admin/classes/{row.id}">{row.name}</a>
						<form method="POST" action="?/removeFromClass" use:enhance>
							<input type="hidden" name="classId" value={row.id} />
							<button class="btn btn-ghost" type="submit">Entfernen</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.person.role === 'student' && joinable.length > 0}
			<form class="inline spaced" method="POST" action="?/addToClass" use:enhance>
				<select class="field" name="classId" aria-label="Klasse, der beigetreten wird">
					{#each joinable as row (row.id)}
						<option value={row.id}>{row.name}</option>
					{/each}
				</select>
				<Button type="submit" variant="ghost">Zur Klasse hinzufügen</Button>
			</form>
		{/if}
	</Panel>

	{#if data.isAdmin && !data.isSelf}
		<h2 class="section-title">Rolle</h2>
		<Panel>
			<form class="inline" method="POST" action="?/setRole" use:enhance>
				<select class="field" name="role" aria-label="Rolle">
					{#each ROLES as role (role)}
						<option value={role} selected={data.person.role === role}>{ROLE_LABELS[role]}</option>
					{/each}
				</select>
				<Button type="submit" variant="ghost">Rolle ändern</Button>
			</form>
			<p class="field-hint">
				Eine Lehrperson kann Schüler/innen erstellen und archivieren; die Administration kann das auch
				mit Lehrpersonen.
			</p>
		</Panel>
	{/if}

	<h2 class="section-title">Zugang</h2>
	<Panel>
		<div class="danger-row">
			<div>
				<p class="danger-title">Neues Passwort setzen</p>
				<p class="danger-note">
					{data.isSelf
						? 'Wähl dein eigenes. Du bleibst hier angemeldet.'
						: 'Wähl es selbst und teile es der Person mit. Sie wird überall abgemeldet.'}
				</p>
			</div>
			<form class="inline" method="POST" action="?/setPassword" use:enhance>
				<input
					class="field"
					name="password"
					type="text"
					placeholder="Neues Passwort"
					minlength="8"
					autocomplete="off"
					required
				/>
				<Button type="submit" variant="ghost">{saved ? 'Gespeichert' : 'Setzen'}</Button>
			</form>
		</div>

		{#if !data.isSelf}
			<div class="danger-row">
				<div>
					<p class="danger-title">
						{data.person.archivedAt ? 'Konto wiederherstellen' : 'Konto archivieren'}
					</p>
					<p class="danger-note">
						Archivieren sperrt die Anmeldung und beendet alle Sitzungen. Alles Erarbeitete bleibt
						erhalten — beim Wiederherstellen geht es genau dort weiter.
					</p>
				</div>
				<form method="POST" action="?/archive" use:enhance>
					<input type="hidden" name="archived" value={data.person.archivedAt ? 'false' : 'true'} />
					<button class="btn btn-ghost" class:danger={!data.person.archivedAt} type="submit">
						{data.person.archivedAt ? 'Wiederherstellen' : 'Archivieren'}
					</button>
				</form>
			</div>
		{/if}
	</Panel>
</main>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 28px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.head {
		display: flex;
	}

	.back {
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.title {
		margin: 0;
		font-size: 1.375rem;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.meta {
		margin: 0 0 8px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.section-title {
		margin: 8px 0 0;
		font-size: 15px;
		font-family: var(--font-display);
		color: var(--text-muted);
	}

	.spaced {
		margin-top: 14px;
	}

	.inline {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.inline .field {
		width: auto;
	}

	form :global(.btn) {
		margin-top: 0;
	}

	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.chips li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.chips .chip {
		text-decoration: none;
	}

	.chips li form {
		margin-left: auto;
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.danger-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.danger-row + .danger-row {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--panel-border);
	}

	.danger-row form {
		margin-left: auto;
	}

	.danger-title {
		margin: 0;
		font-weight: 700;
		font-size: 0.875rem;
	}

	.danger-note {
		margin: 3px 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
		max-width: 46ch;
	}

	.danger {
		color: var(--danger);
	}
</style>
