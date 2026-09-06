<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: Snippet } = $props();

	const tabs = [
		{ href: '/admin/courses', label: 'Kurse' },
		{ href: '/admin/playgrounds', label: 'Playgrounds' },
		{ href: '/admin/classes', label: 'Klassen' },
		{ href: '/admin/people', label: 'Benutzer' }
	];

	const current = $derived(page.url.pathname);
</script>

<header class="nav">
	<a class="wordmark" href="/admin/courses">Dewy</a>
	<span class="nav-divider"></span>

	<nav class="tabs">
		{#each tabs as tab (tab.href)}
			<a class="tab" href={tab.href} class:is-current={current.startsWith(tab.href)}>
				{tab.label}
			</a>
		{/each}
	</nav>

	<span class="who">{data.user.name}</span>
	<form method="POST" action="/logout">
		<button class="btn btn-ghost" type="submit">Abmelden</button>
	</form>
</header>

{@render children()}

<style>
	.nav {
		display: flex;
		align-items: center;
		gap: 20px;
		height: 82px;
		padding: 0 40px;
		background: var(--panel);
		border-bottom: 1px solid var(--panel-border);
	}

	.wordmark {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 1.25rem;
		letter-spacing: -0.3px;
		color: var(--text);
		text-decoration: none;
	}

	.nav-divider {
		width: 1px;
		height: 26px;
		background: var(--panel-border);
	}

	.tabs {
		display: flex;
		align-items: center;
		gap: 28px;
	}

	.tab {
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text);
		text-decoration: none;
	}

	.tab:hover {
		color: var(--accent);
	}

	.tab.is-current {
		color: var(--accent);
	}

	.who {
		margin-left: auto;
		font-size: 0.9375rem;
		color: var(--text);
	}
</style>
