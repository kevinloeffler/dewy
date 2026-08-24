<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Panel, Topbar } from '$lib/components/index.js';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let name = $state('');
</script>

<svelte:head>
	<title>Level designer · Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<span class="topbar-wordmark">Dewy</span>
		<span class="chip">Level designer</span>
	{/snippet}
	{#snippet right()}
		<a class="btn btn-ghost" href="/playground">Playground</a>
	{/snippet}
</Topbar>

<main class="page">
	<Panel>
		<h2 class="section-title">New level</h2>
		<form class="new-level" method="POST" action="?/create" use:enhance>
			<input
				class="field"
				name="name"
				placeholder="Level name"
				bind:value={name}
				autocomplete="off"
			/>
			<Button type="submit">Create</Button>
		</form>
	</Panel>

	<h2 class="section-title">Levels</h2>

	{#if data.levels.length === 0}
		<Panel>
			<p class="empty">No levels yet. Create one above to start designing.</p>
		</Panel>
	{:else}
		<ul class="levels">
			{#each data.levels as level (level.id)}
				<li>
					<Panel>
						<div class="level">
							<div class="level-text">
								<a class="level-name" href="/designer/{level.id}">{level.name}</a>
								<p class="level-meta">
									{level.width} × {level.height}
									· edited {level.updatedAt.toLocaleDateString()}
								</p>
								{#if level.description}
									<p class="level-desc">{level.description}</p>
								{/if}
							</div>

							<div class="level-actions">
								<a class="btn btn-ghost" href="/playground?level={level.id}">Test play</a>
								<a class="btn btn-primary" href="/designer/{level.id}">Edit</a>
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={level.id} />
									<button class="btn btn-ghost danger" type="submit">Delete</button>
								</form>
							</div>
						</div>
					</Panel>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		max-width: 880px;
		margin: 0 auto;
		padding: 28px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.section-title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 15px;
		color: var(--text-muted);
		margin: 8px 0 0;
	}

	.new-level {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}

	.field {
		flex: 1;
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

	.levels {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.level {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}

	.level-name {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 17px;
		color: var(--text);
		text-decoration: none;
	}

	.level-name:hover {
		color: var(--accent);
	}

	.level-meta,
	.level-desc {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	.level-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.danger {
		color: var(--danger);
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
	}
</style>
