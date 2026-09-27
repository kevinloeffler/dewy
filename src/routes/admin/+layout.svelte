<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { Topbar } from '$lib/components/index.js';

	let { children }: { children: Snippet } = $props();

	const tabs = [
		{ href: '/admin/courses', label: 'Kurse' },
		{ href: '/admin/playgrounds', label: 'Playgrounds' },
		{ href: '/admin/classes', label: 'Klassen' },
		{ href: '/admin/people', label: 'Benutzer' }
	];

	const current = $derived(page.url.pathname);
</script>

<Topbar size="large" account>
	{#snippet left()}
		<nav class="tabs">
			{#each tabs as tab (tab.href)}
				<a class="tab" href={tab.href} class:is-current={current.startsWith(tab.href)}>
					{tab.label}
				</a>
			{/each}
		</nav>
	{/snippet}
</Topbar>

{@render children()}

<style>
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
</style>
