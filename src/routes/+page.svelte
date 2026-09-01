<script lang="ts">
	import { Panel, Topbar } from '$lib/components/index.js';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head>
	<title>Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<span class="topbar-logo">D</span>
		<span class="topbar-wordmark">Dewy</span>
	{/snippet}
	{#snippet right()}
		{#if data.signedIn}
			<span class="who">{data.name}</span>
			<form method="POST" action="/logout">
				<button class="btn btn-ghost" type="submit">Sign out</button>
			</form>
		{:else}
			<a class="btn btn-ghost" href="/login">Sign in</a>
		{/if}
	{/snippet}
</Topbar>

<main class="page">
	<h1 class="title">Learn to program a robot.</h1>
	<p class="lede">
		Write JavaScript to move a robot through a tile world — one level at a time, grouped into
		courses.
	</p>

	<div class="cards">
		<a class="card" href="/courses">
			<Panel>
				<h2 class="card-title">Courses</h2>
				<p class="card-desc">Work through a course, stage by stage.</p>
			</Panel>
		</a>
		{#if data.isStaff}
			<a class="card" href="/admin/courses">
				<Panel>
					<h2 class="card-title">Build a course</h2>
					<p class="card-desc">Design levels and write theory blocks for a class.</p>
				</Panel>
			</a>
		{:else if !data.signedIn}
			<a class="card" href="/login">
				<Panel>
					<h2 class="card-title">Sign in</h2>
					<p class="card-desc">
						Students sign in with the username their teacher gave them. Teachers use their email.
					</p>
				</Panel>
			</a>
		{/if}
		<a class="card" href="/level/tutorial-01">
			<Panel>
				<h2 class="card-title">Try a level</h2>
				<p class="card-desc">Jump straight into the tutorial, no account needed.</p>
			</Panel>
		</a>
	</div>
</main>

<style>
	.who {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.page {
		max-width: 820px;
		margin: 0 auto;
		padding: 56px 24px 64px;
	}

	.title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 30px;
		margin: 0;
	}

	.lede {
		margin: 10px 0 32px;
		color: var(--text-muted);
		max-width: 52ch;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 14px;
	}

	.card {
		text-decoration: none;
		color: inherit;
	}

	.card:hover .card-title {
		color: var(--accent);
	}

	.card-title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 17px;
		margin: 0;
	}

	.card-desc {
		margin: 6px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}
</style>
