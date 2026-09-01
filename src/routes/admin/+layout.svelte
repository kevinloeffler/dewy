<script lang="ts">
	import { page } from '$app/state';
	import { Topbar } from '$lib/components/index.js';
	import type { Snippet } from 'svelte';
	import type { LayoutServerData } from './$types';

	let { data, children }: { data: LayoutServerData; children: Snippet } = $props();

	const tabs = [
		{ href: '/admin/courses', label: 'Courses' },
		{ href: '/admin/classes', label: 'Classes' },
		{ href: '/admin/people', label: 'People' }
	];

	const current = $derived(page.url.pathname);
</script>

<Topbar>
	{#snippet left()}
		<a class="topbar-wordmark" href="/admin/courses">Dewy</a>
		<span class="divider-v"></span>
		<nav class="tabs">
			{#each tabs as tab (tab.href)}
				<a class="tab" href={tab.href} class:is-current={current.startsWith(tab.href)}>
					{tab.label}
				</a>
			{/each}
		</nav>
	{/snippet}

	{#snippet right()}
		<span class="who">{data.user.name}</span>
		<span class="chip">{data.role}</span>
		<form method="POST" action="/logout">
			<button class="btn btn-ghost" type="submit">Sign out</button>
		</form>
	{/snippet}
</Topbar>

{@render children()}

<style>
	.tabs {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.tab {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
		text-decoration: none;
		padding: 6px 10px;
		border-radius: calc(var(--radius) - 8px);
	}

	.tab:hover {
		background: var(--chip-bg);
		color: var(--text);
	}

	.tab.is-current {
		background: var(--chip-bg);
		color: var(--chip-text);
	}

	.who {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
