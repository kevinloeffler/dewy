<script lang="ts">
	import { Panel, Progress, Topbar } from '$lib/components/index.js';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head>
	<title>Kurse · Dewy</title>
</svelte:head>

<Topbar account>
	{#snippet left()}
		<span class="chip">Kurse</span>
	{/snippet}
	{#snippet right()}
		{#if !data.signedIn}
			<a class="btn btn-ghost" href="/login">Anmelden, um den Fortschritt zu speichern</a>
		{/if}
	{/snippet}
</Topbar>

<main class="page">
	<h1 class="title">Kurs auswählen</h1>

	{#if data.courses.length === 0}
		<Panel>
			{#if data.isStudent}
				<p class="empty">
					Dir wurden noch keine Kurse zugewiesen. Sobald deine Lehrperson das tut, erscheinen sie
					hier.
				</p>
			{:else}
				<p class="empty">Es wurden noch keine Kurse veröffentlicht.</p>
			{/if}
		</Panel>
	{:else}
		<ul class="list">
			{#each data.courses as course (course.id)}
				{@const done = data.completed[course.id] ?? 0}
				<li>
					<a class="card" href="/courses/{course.id}">
						<Panel>
							<div class="card-body">
								<div class="card-text">
									<h2 class="card-title">{course.title}</h2>
									{#if course.description}
										<p class="card-desc">{course.description}</p>
									{/if}
									<p class="card-meta">
										{course.stageCount} Kapitel
										· {course.itemCount}
										{course.itemCount === 1 ? 'Element' : 'Elemente'}
									</p>
								</div>

								{#if data.signedIn && course.itemCount > 0}
									<div class="card-progress">
										<Progress
											value={done / course.itemCount}
											label="Fortschritt"
											sublabel="{done} / {course.itemCount}"
										/>
									</div>
								{/if}
							</div>
						</Panel>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		max-width: 820px;
		margin: 0 auto;
		padding: 32px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 24px;
		margin: 0 0 4px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.card {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.card:hover .card-title {
		color: var(--accent);
	}

	.card-body {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		flex-wrap: wrap;
	}

	.card-title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 18px;
		margin: 0;
	}

	.card-desc,
	.card-meta {
		margin: 5px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	.card-progress {
		min-width: 180px;
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
	}
</style>
