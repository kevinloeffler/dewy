<script lang="ts">
	import { Panel, Progress, Topbar } from '$lib/components/index.js';
	import { markdownExcerpt } from '$lib/markdown';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const course = $derived(data.course);
	const progress = $derived(data.progress);
</script>

<svelte:head>
	<title>{course.title} · Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<a class="topbar-wordmark" href="/courses">Dewy</a>
		<span class="divider-v"></span>
		<span class="chip">Kurs</span>
		<span class="mission">{course.title}</span>
	{/snippet}
	{#snippet right()}
		{#if data.signedIn}
			<span class="hud-label">Fortschritt</span>
			<span class="chip">{progress.completedCount} / {progress.total}</span>
		{:else}
			<a class="btn btn-ghost" href="/login">Anmelden, um den Fortschritt zu speichern</a>
		{/if}
		{#if progress.nextItemId}
			<a class="btn btn-primary" href="/courses/{course.id}/items/{progress.nextItemId}">
				{progress.completedCount > 0 ? 'Weiter' : 'Starten'}
			</a>
		{/if}
	{/snippet}
</Topbar>

<main class="page">
	<header class="head">
		<h1 class="title">{course.title}</h1>
		{#if course.description}
			<p class="lede">{course.description}</p>
		{/if}
		{#if data.signedIn && progress.total > 0}
			<div class="bar">
				<Progress
					value={progress.completedCount / progress.total}
					label="Kursfortschritt"
					sublabel="{progress.completedCount} / {progress.total} erledigt"
				/>
			</div>
		{/if}
	</header>

	{#each course.stages as stage, stageIndex (stage.id)}
		{@const lock = progress.stageLocks[stage.id] ?? null}
		<section class="stage">
			<h2 class="stage-title">
				<span class="stage-index">{stageIndex + 1}</span>
				{stage.title}
				{#if lock}
					<span class="stage-lock">🔒 Gesperrt</span>
				{:else if !stage.ordered}
					<span class="stage-tag">Beliebige Reihenfolge</span>
				{/if}
			</h2>
			{#if stage.description}
				<p class="stage-desc">{stage.description}</p>
			{/if}
			{#if lock}
				<p class="stage-gate">
					Schliess {lock.remaining === 1
						? 'das letzte Level'
						: `alle ${lock.remaining} verbleibenden Levels`} in „{lock.requiredStageTitle}“ ab, um
					dieses Kapitel zu öffnen.
				</p>
			{/if}

			{#if stage.items.length === 0}
				<Panel><p class="empty">In diesem Kapitel ist noch nichts drin.</p></Panel>
			{:else}
				<ol class="items">
					{#each stage.items as item (item.id)}
						{@const state = progress.state[item.id] ?? 'locked'}
						<li>
							<Panel>
								{#if state === 'locked'}
									<div class="item is-locked">
										<span class="mark">🔒</span>
										<div class="item-text">
											<span class="item-name"
												>{item.kind === 'theory' ? item.title : item.name}</span
											>
											<p class="item-meta">
												{#if lock}
													Gesperrt, bis „{lock.requiredStageTitle}“ abgeschlossen ist.
												{:else if stage.ordered}
													Schliess das Element davor ab, um dieses freizuschalten.
												{:else}
													Schliess das Kapitel davor ab, um dieses freizuschalten.
												{/if}
											</p>
										</div>
									</div>
								{:else}
									<a class="item" href="/courses/{course.id}/items/{item.id}">
										<span class="mark" class:is-done={state === 'complete'}>
											{state === 'complete' ? '✓' : item.kind === 'theory' ? '☰' : '▶'}
										</span>
										<div class="item-text">
											<span class="item-name"
												>{item.kind === 'theory' ? item.title : item.name}</span
											>
											<p class="item-meta">
												{#if item.kind === 'theory'}
													{markdownExcerpt(item.body, 90)}
												{:else}
													{item.description ?? 'Schreib ein Programm, das es löst.'}
												{/if}
											</p>
										</div>
										<span class="item-kind">{item.kind === 'theory' ? 'Text' : 'Level'}</span>
									</a>
								{/if}
							</Panel>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/each}
</main>

<style>
	.page {
		max-width: 820px;
		margin: 0 auto;
		padding: 32px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 26px;
		margin: 0;
	}

	.lede {
		margin: 8px 0 0;
		color: var(--text-muted);
	}

	.bar {
		margin-top: 16px;
		max-width: 340px;
	}

	.stage-title {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 17px;
		margin: 0 0 4px;
	}

	.stage-index {
		color: var(--text-faint);
	}

	.stage-desc {
		margin: 0 0 10px;
		font-size: 14px;
		color: var(--text-muted);
	}

	.stage-lock,
	.stage-tag {
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		background: var(--chip-bg);
		border-radius: 999px;
		padding: 3px 9px;
	}

	.stage-tag {
		color: var(--accent);
		background: var(--accent-soft);
	}

	.stage-gate {
		margin: 0 0 10px;
		font-size: 13px;
		color: var(--text-muted);
	}

	.items {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 14px;
		text-decoration: none;
		color: inherit;
	}

	.item.is-locked {
		opacity: 0.55;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		background: var(--chip-bg);
		font-size: 13px;
		flex-shrink: 0;
	}

	.mark.is-done {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.item-text {
		flex: 1;
		min-width: 0;
	}

	.item-name {
		font-weight: 600;
	}

	a.item:hover .item-name {
		color: var(--accent);
	}

	.item-meta {
		margin: 3px 0 0;
		font-size: 13px;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-kind {
		font-family: var(--font-code);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}
</style>
