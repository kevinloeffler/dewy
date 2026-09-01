<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Panel, Topbar } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<a class="topbar-wordmark" href="/">Dewy</a>
	{/snippet}
</Topbar>

<main class="page">
	<Panel padding="lg">
		<h1 class="title">Sign in</h1>
		<p class="lede">Students use their username. Teachers use their email address.</p>

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
			{#if data.redirectTo}
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
			{/if}

			<label class="label" for="identifier">Username or email</label>
			<input
				class="field"
				id="identifier"
				name="identifier"
				value={form?.identifier ?? ''}
				autocomplete="username"
				autocapitalize="none"
				autocorrect="off"
				spellcheck="false"
				required
			/>

			<label class="label" for="password">Password</label>
			<input
				class="field"
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
			/>

			{#if form?.message}
				<p class="error" role="alert">{form.message}</p>
			{/if}

			<Button type="submit" disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>

		<p class="foot">
			No account? Accounts are created by your teacher — ask them to set one up for you.
		</p>
	</Panel>
</main>

<style>
	.page {
		max-width: 420px;
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

	.error {
		margin: 12px 0 0;
		color: var(--danger);
		font-size: 0.8125rem;
	}

	form :global(.btn) {
		margin-top: 18px;
		justify-content: center;
	}

	.foot {
		margin: 24px 0 0;
		color: var(--text-faint);
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>
