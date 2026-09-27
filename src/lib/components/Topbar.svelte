<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Where the brand links to. `/` redirects a signed-in reader by role. */
		home?: string;
		/** `large` is the roomy header of the list pages; `default` suits dense workspaces. */
		size?: 'default' | 'large';
		/** Show the signed-in user's name and a sign-out button at the far right. */
		account?: boolean;
		/** Off only for a toolbar stacked under another Topbar, which already shows it. */
		brand?: boolean;
		left?: Snippet;
		center?: Snippet;
		right?: Snippet;
	}

	let {
		home = '/',
		size = 'default',
		account = false,
		brand = true,
		left,
		center,
		right
	}: Props = $props();

	// Loaded once by the root layout, so every page has it without asking.
	const viewer = $derived(page.data.viewer);
</script>

<header class="topbar" class:is-large={size === 'large'}>
	<div class="topbar-left">
		{#if brand}
			<a class="topbar-brand" href={home}>
				<span class="topbar-logo" aria-hidden="true">D</span>
				<span class="topbar-wordmark">Dewy</span>
			</a>
		{/if}

		{#if left}
			{#if brand}
				<span class="topbar-divider" aria-hidden="true"></span>
			{/if}
			{@render left()}
		{/if}
	</div>

	{#if center}
		<div class="topbar-center">
			{@render center()}
		</div>
	{/if}

	{#if right || (account && viewer)}
		<div class="topbar-right">
			{@render right?.()}

			{#if account && viewer}
				<span class="topbar-who">{viewer.name}</span>
				<form method="POST" action="/logout">
					<button class="btn btn-ghost" type="submit">Abmelden</button>
				</form>
			{/if}
		</div>
	{/if}
</header>

<style>
	.topbar.is-large {
		gap: 20px;
		min-height: 82px;
		padding: 0 40px;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.is-large .topbar-left {
		gap: 20px;
	}

	.topbar-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
		color: var(--text);
		text-decoration: none;
	}

	.is-large .topbar-brand .topbar-wordmark {
		font-family: var(--font-display);
		font-size: 1.25rem;
		letter-spacing: -0.3px;
	}

	.topbar-divider {
		width: 1px;
		height: 20px;
		flex-shrink: 0;
		background: var(--panel-border);
	}

	.is-large .topbar-divider {
		height: 26px;
	}

	.topbar-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-left: auto;
	}

	.topbar-who {
		font-size: 0.9375rem;
		color: var(--text);
	}
</style>
