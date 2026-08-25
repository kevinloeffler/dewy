<script lang="ts">
	import { Panel, Topbar } from '$lib/components/index.js';
</script>

<svelte:head>
	<title>Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<span class="topbar-logo">D</span>
		<span class="topbar-wordmark">Dewy</span>
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
		<a class="card" href="/admin/courses">
			<Panel>
				<h2 class="card-title">Build a course</h2>
				<p class="card-desc">Design levels and write theory blocks for a class.</p>
			</Panel>
		</a>
		<a class="card" href="/level/tutorial-01">
			<Panel>
				<h2 class="card-title">Try a level</h2>
				<p class="card-desc">Jump straight into the tutorial, no account needed.</p>
			</Panel>
		</a>
	</div>
</main>

<style>
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
