<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Panel, Topbar } from '$lib/components/index.js';
	import LevelPlayer from '$lib/components/level/LevelPlayer.svelte';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const context = $derived(data.context);
	const item = $derived(data.context.item);
	const courseId = $derived(data.context.course.id);

	const nextHref = $derived(
		context.nextItemId ? `/courses/${courseId}/items/${context.nextItemId}` : `/courses/${courseId}`
	);
	const prevHref = $derived(
		context.prevItemId ? `/courses/${courseId}/items/${context.prevItemId}` : null
	);
	const isComplete = $derived(data.progress.state[item.id] === 'complete');

	// Levels record completion without navigating: the student should get to
	// watch their program finish. Submitted from `oncomplete` rather than a
	// click, which is the same trick `/designer/[id]` uses to save.
	let recordForm = $state<HTMLFormElement | undefined>();
	let solvedCode = $state('');
	let justSolved = $state(false);

	function record(info: { code: string; steps: number }) {
		solvedCode = info.code;
		justSolved = true;
		recordForm?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{item.kind === 'theory' ? item.title : item.name} · Dewy</title>
</svelte:head>

{#if item.kind === 'theory'}
	<Topbar>
		{#snippet left()}
			<a class="topbar-wordmark" href="/courses">Dewy</a>
			<span class="divider-v"></span>
			<a class="crumb" href="/courses/{courseId}">{context.course.title}</a>
			<span class="crumb-sep">›</span>
			<span class="crumb-current">{context.stage.title}</span>
		{/snippet}
		{#snippet right()}
			<span class="chip">{context.index} / {context.total}</span>
			{#if prevHref}
				<a class="btn btn-ghost" href={prevHref}>Back</a>
			{/if}
		{/snippet}
	</Topbar>

	<main class="reader">
		<Panel>
			<article class="prose">
				<h1>{item.title}</h1>
				<!-- Safe by construction: `renderMarkdown` escapes every text run and
				     only emits tags it chose itself. -->
				{@html data.html}
			</article>
		</Panel>

		<form
			class="advance"
			method="POST"
			action="?/complete"
			use:enhance={() => async ({ result, update }) => {
				// A redirect is the success path here; let SvelteKit follow it.
				if (result.type === 'redirect') await update();
				else await update({ reset: false });
			}}
		>
			<input type="hidden" name="advance" value="true" />
			{#if isComplete}
				<span class="done">✓ Completed</span>
			{/if}
			<Button type="submit">
				{context.nextItemId ? 'Continue' : 'Finish course'}
			</Button>
		</form>
	</main>
{:else if data.context.level}
	<!--
		Keyed on the item id. Without this, stepping from one level item to the
		next is a route-param change, so SvelteKit reuses the component instance —
		and `LevelPlayer` reads its level once, at construction, to build the world
		and the engine. The student would land on the next item still playing the
		previous level.
	-->
	{#key item.id}
		<LevelPlayer level={data.context.level} oncomplete={record}>
			{#snippet titleExtra()}
				<span class="crumb-sep">·</span>
				<a class="crumb" href="/courses/{courseId}">{context.course.title}</a>
				<span class="chip">{context.index} / {context.total}</span>
			{/snippet}

			{#snippet actions()}
				{#if isComplete || justSolved}
					<Badge variant="chapter">Complete</Badge>
				{/if}
				{#if prevHref}
					<a class="btn btn-ghost" href={prevHref}>Back</a>
				{/if}
				<a class="btn" class:btn-primary={isComplete || justSolved} class:btn-ghost={!(isComplete || justSolved)} href={nextHref}>
					{context.nextItemId ? 'Next' : 'Finish'}
				</a>
			{/snippet}
		</LevelPlayer>
	{/key}

	<form
		bind:this={recordForm}
		class="sr-only"
		method="POST"
		action="?/complete"
		use:enhance={() => async ({ update }) => {
			// Keep the player mounted — only the progress data needs refreshing.
			await update({ reset: false });
		}}
	>
		<input type="hidden" name="code" value={solvedCode} />
	</form>
{/if}

<style>
	.reader {
		max-width: 820px;
		margin: 0 auto;
		padding: 32px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.crumb {
		color: var(--text-muted);
		text-decoration: none;
	}

	.crumb:hover {
		color: var(--accent);
	}

	.crumb-sep {
		color: var(--text-faint);
	}

	.crumb-current {
		color: var(--text);
	}

	.advance {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
	}

	.done {
		font-size: 13px;
		color: var(--accent);
	}
</style>
