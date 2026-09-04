<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Callout, CredentialsSheet, Panel } from '$lib/components/index.js';
	import { assignUsernames, parseRoster } from '$lib/roster';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Seeded once, then owned by the textarea — re-seeding after a partial batch
	// would throw away the lines the teacher is in the middle of fixing.
	let roster = $state(untrack(() => (form && 'roster' in form ? form.roster : '') ?? ''));
	let classId = $state(untrack(() => data.preselectedClassId ?? data.classes[0]?.id ?? ''));
	let showTeacherForm = $state(false);

	// The action returns one of two shapes — a batch result or a failure — so
	// each field is read through a guard rather than asserted.
	const credentials = $derived(form && 'credentials' in form ? (form.credentials ?? []) : []);
	const failed = $derived(form && 'failed' in form ? (form.failed ?? []) : []);
	const message = $derived(form && 'message' in form ? form.message : undefined);
	const createdIn = $derived(form && 'classId' in form ? form.classId : null);

	// The same functions the server runs on submit, so the preview cannot promise
	// a username that will not be minted. It resolves against the usernames
	// already taken *and* against the rest of this paste.
	const preview = $derived(assignUsernames(parseRoster(roster), data.taken));

	const className = $derived(data.classes.find((row) => row.id === classId)?.name ?? '');

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Benutzer hinzufügen · Dewy</title>
</svelte:head>

<main class="page">
	{#if credentials.length > 0}
		<CredentialsSheet
			credentials={credentials}
			heading={createdIn ? `Neue Konten · ${className}` : 'Neues Konto'}
		/>
	{/if}

	{#if failed.length > 0}
		<Callout variant="danger">
			<strong>{failed.length} konnten nicht erstellt werden.</strong>
			<ul class="failed">
				{#each failed as row (row.name + row.reason)}
					<li>{row.name} — {row.reason}</li>
				{/each}
			</ul>
		</Callout>
	{/if}

	<h1 class="title">Schüler/innen hinzufügen</h1>

	<Panel>
		<form
			method="POST"
			action="?/students"
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					submitting = false;
					// Clear the box only when everything landed — a partial batch
					// needs its failed lines still visible to be fixed.
					if (result.type === 'success' && (result.data?.failed as unknown[])?.length === 0) {
						roster = '';
					}
					await update({ reset: false });
				};
			}}
		>
			{#if data.classes.length === 0}
				<Callout variant="warn">
					Du hast noch keine Klassen. <a href="/admin/classes">Leg zuerst eine an</a> — jede Schülerin
					und jeder Schüler kommt in eine Klasse, und darüber erhalten sie ihre Kurse.
				</Callout>
			{:else}
				<label class="field-label" for="classId">Klasse</label>
				<select class="field" id="classId" name="classId" bind:value={classId}>
					{#each data.classes as row (row.id)}
						<option value={row.id}>{row.name}</option>
					{/each}
				</select>

				<label class="field-label spaced" for="roster">Namen</label>
				<textarea
					class="field"
					id="roster"
					name="roster"
					rows="10"
					placeholder={'Marie Muster\nTom Meier\nAylin Yilmaz'}
					bind:value={roster}
				></textarea>
				<p class="field-hint">
					Eine Person pro Zeile. Benutzernamen und Passwörter werden automatisch erzeugt. Willst du
					einen Benutzernamen selbst festlegen, schreib ihn nach einem Komma:
					<code>Marie Muster, mmuster</code>
				</p>

				{#if preview.length > 0}
					<div class="preview">
						<h2 class="preview-title">
							{preview.length}
							{preview.length === 1 ? 'Schüler/in' : 'Schüler/innen'}
						</h2>
						<div class="table-wrap">
							<table class="table">
								<thead>
									<tr>
										<th>Name</th>
										<th>Benutzername</th>
									</tr>
								</thead>
								<tbody>
									{#each preview as row, index (index)}
										<tr>
											<td>{row.name}</td>
											<td class="mono">{row.username}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}

				{#if message}
					<p class="field-error">{message}</p>
				{/if}

				<Button type="submit" disabled={submitting || preview.length === 0}>
					{submitting
						? 'Wird erstellt…'
						: `${preview.length || ''} ${preview.length === 1 ? 'Konto' : 'Konten'} erstellen`}
				</Button>
			{/if}
		</form>
	</Panel>

	{#if data.canCreateTeachers}
		<h2 class="section-title">Lehrpersonen</h2>
		<Panel>
			{#if !showTeacherForm}
				<div class="teacher-prompt">
					<p class="empty">
						Lehrpersonen melden sich mit einer echten E-Mail-Adresse an und werden einzeln erstellt.
					</p>
					<Button variant="ghost" onclick={() => (showTeacherForm = true)}>Lehrperson hinzufügen</Button>
				</div>
			{:else}
				<form method="POST" action="?/teacher" use:enhance>
					<label class="field-label" for="name">Name</label>
					<input class="field" id="name" name="name" required />

					<label class="field-label spaced" for="email">E-Mail</label>
					<input class="field" id="email" name="email" type="email" required />

					<label class="field-label spaced" for="password">Passwort</label>
					<input class="field" id="password" name="password" placeholder="Leer lassen, um eines zu erzeugen" />

					<Button type="submit">Lehrperson erstellen</Button>
				</form>
			{/if}
		</Panel>
	{/if}
</main>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 28px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.title {
		margin: 0;
		font-size: 1.375rem;
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

	.preview {
		margin-top: 16px;
		border-top: 1px solid var(--panel-border);
		padding-top: 14px;
	}

	.preview-title {
		margin: 0 0 8px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.table-wrap {
		overflow-x: auto;
		max-height: 320px;
		overflow-y: auto;
	}

	.mono {
		font-family: var(--font-code);
		font-size: 0.8125rem;
	}

	.failed {
		margin: 6px 0 0;
		padding-left: 18px;
	}

	form :global(.btn) {
		margin-top: 18px;
	}

	.teacher-prompt {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.teacher-prompt :global(.btn) {
		margin-left: auto;
		flex: none;
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
