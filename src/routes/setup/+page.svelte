<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Panel, Topbar } from '$lib/components/index.js';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Erstes Admin-Konto · Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<span class="chip">Einrichtung</span>
	{/snippet}
</Topbar>

<main class="page">
	<Panel padding="lg">
		<h1 class="title">Erstes Admin-Konto erstellen</h1>
		<p class="lede">
			In dieser Datenbank gibt es noch keine Konten. Lege hier das Administrationskonto an — danach
			verschwindet diese Seite, und jedes weitere Konto wird in der App erstellt.
		</p>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			<label class="label" for="name">Name</label>
			<input class="field" id="name" name="name" value={form?.name ?? ''} required />

			<label class="label" for="email">E-Mail</label>
			<input
				class="field"
				id="email"
				name="email"
				type="email"
				value={form?.email ?? ''}
				autocomplete="username"
				required
			/>

			<label class="label" for="password">Passwort</label>
			<input
				class="field"
				id="password"
				name="password"
				type="password"
				autocomplete="new-password"
				minlength="8"
				required
			/>
			<p class="hint">Mindestens 8 Zeichen.</p>

			{#if form?.message}
				<p class="error" role="alert">{form.message}</p>
			{/if}

			<Button type="submit" disabled={submitting}>
				{submitting ? 'Wird erstellt…' : 'Admin erstellen'}
			</Button>
		</form>
	</Panel>
</main>

<style>
	.page {
		max-width: 460px;
		margin: 0 auto;
		padding: 48px 24px 64px;
	}

	.title {
		margin: 0 0 4px;
		font-size: 1.5rem;
	}

	.lede {
		margin: 0 0 24px;
		color: var(--text-muted);
		font-size: 0.875rem;
		line-height: 1.55;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.label:not(:first-of-type) {
		margin-top: 10px;
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

	.hint {
		margin: 2px 0 0;
		color: var(--text-faint);
		font-size: 0.75rem;
	}

	.error {
		margin: 12px 0 0;
		color: var(--danger);
		font-size: 0.8125rem;
	}

	form :global(.btn) {
		margin-top: 18px;
		justify-content: center;
	}
</style>
