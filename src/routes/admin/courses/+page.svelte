<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Panel, Topbar } from '$lib/components/index.js';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let title = $state('');
</script>

<svelte:head>
	<title>Courses · Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<span class="chip">Courses</span>
	{/snippet}
	{#snippet right()}
		<a class="btn btn-ghost" href="/courses">Student view</a>
	{/snippet}
</Topbar>

<main class="page">
	<Panel>
		<h2 class="section-title">New course</h2>
		<form class="new-course" method="POST" action="?/create" use:enhance>
			<input
				class="field"
				name="title"
				placeholder="Course name"
				bind:value={title}
				autocomplete="off"
			/>
			<Button type="submit">Create</Button>
		</form>
	</Panel>

	<h2 class="section-title">Courses</h2>

	{#if data.courses.length === 0}
		<Panel>
			<p class="empty">No courses yet. Create one above to start building a curriculum.</p>
		</Panel>
	{:else}
		<ul class="list">
			{#each data.courses as course (course.id)}
				<li>
					<Panel>
						<div class="row">
							<div class="row-text">
								<a class="row-name" href="/admin/courses/{course.id}">{course.title}</a>
								{#if course.published}
									<Badge variant="chapter">Published</Badge>
								{:else}
									<span class="chip">Draft</span>
								{/if}
								<p class="row-meta">
									{course.stageCount}
									{course.stageCount === 1 ? 'stage' : 'stages'}
									· {course.itemCount}
									{course.itemCount === 1 ? 'item' : 'items'}
									· edited {course.updatedAt.toLocaleDateString()}
								</p>
								{#if course.description}
									<p class="row-desc">{course.description}</p>
								{/if}
							</div>

							<div class="row-actions">
								<form method="POST" action="?/publish" use:enhance>
									<input type="hidden" name="id" value={course.id} />
									<input type="hidden" name="published" value={course.published ? 'false' : 'true'} />
									<button class="btn btn-ghost" type="submit">
										{course.published ? 'Unpublish' : 'Publish'}
									</button>
								</form>
								<a class="btn btn-primary" href="/admin/courses/{course.id}">Edit</a>
								<form method="POST" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={course.id} />
									<button class="btn btn-ghost danger" type="submit">Delete</button>
								</form>
							</div>
						</div>
					</Panel>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.shared.length > 0}
		<h2 class="section-title">Shared with me</h2>
		<p class="hint">
			Live links to another teacher's courses. You can assign these to your classes and their
			author's later edits reach you, but you cannot change them. Take a copy to make it yours.
		</p>
		<ul class="list">
			{#each data.shared as course (course.id)}
				<li>
					<Panel>
						<div class="row">
							<div class="row-text">
								<a class="row-name" href="/admin/courses/{course.id}">{course.title}</a>
								<span class="chip">Read-only{course.ownerName ? ` · ${course.ownerName}` : ''}</span>
								<p class="row-meta">
									{course.stageCount}
									{course.stageCount === 1 ? 'stage' : 'stages'}
									· {course.itemCount}
									{course.itemCount === 1 ? 'item' : 'items'}
								</p>
								{#if course.description}
									<p class="row-desc">{course.description}</p>
								{/if}
							</div>

							<div class="row-actions">
								<a class="btn btn-ghost" href="/admin/courses/{course.id}">View</a>
							</div>
						</div>
					</Panel>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.unowned.length > 0}
		<h2 class="section-title">Unassigned levels</h2>
		<Panel>
			<p class="hint">
				Levels that belong to no course — authored before courses existed, or left over from a
				deleted draft. They still open in the designer.
			</p>
			<ul class="loose">
				{#each data.unowned as level (level.id)}
					<li>
						<a href="/designer/{level.id}">{level.name}</a>
						<span class="row-meta">{level.width} × {level.height}</span>
						<a class="btn btn-ghost" href="/level/{level.id}">Play</a>
						<form method="POST" action="?/deleteLevel" use:enhance>
							<input type="hidden" name="id" value={level.id} />
							<button class="btn btn-ghost danger" type="submit">Delete</button>
						</form>
					</li>
				{/each}
			</ul>
		</Panel>
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

	.new-course {
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

	.list,
	.loose {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}

	.row-name {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 17px;
		color: var(--text);
		text-decoration: none;
		margin-right: 8px;
	}

	.row-name:hover {
		color: var(--accent);
	}

	.row-meta,
	.row-desc {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.danger {
		color: var(--danger);
	}

	.empty,
	.hint {
		margin: 0;
		color: var(--text-muted);
	}

	.hint {
		font-size: 13px;
		margin-bottom: 12px;
	}

	.loose {
		gap: 6px;
	}

	.loose li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.loose .row-meta {
		flex: 1;
	}

	.loose a {
		color: var(--text);
	}

	.loose a:hover {
		color: var(--accent);
	}
</style>
