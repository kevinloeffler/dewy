<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Panel } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let name = $state('');
</script>

<svelte:head>
	<title>Classes · Dewy</title>
</svelte:head>

<main class="page">
	<Panel>
		<h2 class="section-title">New class</h2>
		<form class="new-class" method="POST" action="?/create" use:enhance>
			<input class="field" name="name" placeholder="Class name, e.g. 7b" bind:value={name} autocomplete="off" />
			<Button type="submit">Create</Button>
		</form>
		{#if form?.message}
			<p class="field-error">{form.message}</p>
		{/if}
	</Panel>

	<h2 class="section-title">Classes</h2>

	{#if data.classes.length === 0}
		<Panel>
			<p class="empty">No classes yet. Create one above, then add students to it.</p>
		</Panel>
	{:else}
		<ul class="list">
			{#each data.classes as row (row.id)}
				<li>
					<Panel>
						<div class="row">
							<div class="row-text">
								<a class="row-name" href="/admin/classes/{row.id}">{row.name}</a>
								<p class="row-meta">
									{row.studentCount}
									{row.studentCount === 1 ? 'student' : 'students'}
									· {row.courseCount}
									{row.courseCount === 1 ? 'course' : 'courses'}
									{#if row.ownerName}· {row.ownerName}{/if}
								</p>
							</div>
							<a class="btn btn-ghost" href="/admin/people/new?classId={row.id}">Add students</a>
						</div>
					</Panel>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.archived.length > 0}
		<h2 class="section-title">Archived</h2>
		<ul class="list">
			{#each data.archived as row (row.id)}
				<li>
					<Panel padding="sm">
						<div class="row">
							<div class="row-text">
								<a class="row-name muted" href="/admin/classes/{row.id}">{row.name}</a>
								<p class="row-meta">{row.studentCount} students · archived</p>
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
		margin: 8px 0 0;
		font-size: 15px;
		font-family: var(--font-display);
		color: var(--text-muted);
	}

	.new-class {
		display: flex;
		gap: 8px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.row-text {
		flex: 1;
		min-width: 0;
	}

	.row-name {
		font-weight: 700;
		color: var(--text);
		text-decoration: none;
	}

	.row-name:hover {
		text-decoration: underline;
	}

	.row-name.muted {
		color: var(--text-muted);
	}

	.row-meta {
		margin: 3px 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
