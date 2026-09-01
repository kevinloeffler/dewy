<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { Button, Callout, Checkbox, Panel } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	// Seeded once; after that this field owns the text, so a rename in flight is
	// not overwritten when `use:enhance` reruns `load`.
	let name = $state(untrack(() => data.group.name));

	let picked = $state(new SvelteSet<string>());
	const selectable = $derived(data.group.students.map((student) => student.id));
	const allPicked = $derived(selectable.length > 0 && picked.size === selectable.length);

	function toggleAll() {
		if (allPicked) picked.clear();
		else for (const id of selectable) picked.add(id);
	}

	function toggle(id: string) {
		if (picked.has(id)) picked.delete(id);
		else picked.add(id);
	}

	const assignedIds = $derived(new Set(data.group.courses.map((course) => course.id)));
	const assignable = $derived(data.courses.filter((course) => !assignedIds.has(course.id)));
</script>

<svelte:head>
	<title>{data.group.name} · Classes · Dewy</title>
</svelte:head>

<main class="page">
	<Panel>
		<h2 class="section-title">Class</h2>
		<form class="inline" method="POST" action="?/rename" use:enhance>
			<input class="field" name="name" bind:value={name} autocomplete="off" />
			<Button type="submit" variant="ghost">Rename</Button>
		</form>
		{#if data.group.archivedAt}
			<p class="note">
				Archived. Its students still have working accounts — the class is only out of the way.
			</p>
		{/if}
	</Panel>

	<div class="head">
		<h2 class="section-title">
			Students
			<span class="count">{data.group.students.length}</span>
		</h2>
		<a class="btn btn-primary" href="/admin/people/new?classId={data.group.id}">Add students</a>
	</div>

	{#if data.group.students.length === 0}
		<Panel>
			<p class="empty">Nobody in this class yet.</p>
		</Panel>
	{:else}
		<Panel padding="sm">
			<form method="POST" use:enhance={() => async ({ update }) => {
				picked.clear();
				await update({ reset: false });
			}}>
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr>
								<th class="tight">
									<Checkbox
										checked={allPicked}
										indeterminate={picked.size > 0 && !allPicked}
										label="Select all"
										onchange={toggleAll}
									/>
								</th>
								<th>Name</th>
								<th>Username</th>
								<th class="numeric">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.group.students as student (student.id)}
								<tr class:is-archived={student.archivedAt}>
									<td class="tight">
										<Checkbox
											name="userId"
											value={student.id}
											checked={picked.has(student.id)}
											label="Select {student.name}"
											onchange={() => toggle(student.id)}
										/>
									</td>
									<td>
										<a class="link" href="/admin/people/{student.id}">{student.name}</a>
									</td>
									<td class="mono">{student.username ?? '—'}</td>
									<td class="numeric">
										{#if student.archivedAt}
											<span class="chip">Archived</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if picked.size > 0}
					<div class="bar">
						<span class="bar-count">{picked.size} selected</span>
						<input
							class="field move"
							name="password"
							type="text"
							placeholder="New password"
							minlength="8"
							autocomplete="off"
							title="Sets this one password on every selected student."
						/>
						<button class="btn btn-ghost" type="submit" formaction="?/setPassword">
							Set password
						</button>
						{#if picked.size > 1}
							<span class="bar-note">— the same one for all picked.size</span>
						{/if}
						<select class="field move" name="toClassId" aria-label="Move to class">
							<option value="">Move to…</option>
							{#each data.otherClasses as other (other.id)}
								<option value={other.id}>{other.name}</option>
							{/each}
						</select>
						<button class="btn btn-ghost" type="submit" formaction="?/moveStudents">Move</button>
						<button class="btn btn-ghost" type="submit" formaction="?/removeStudents">
							Remove from class
						</button>
						<button class="btn btn-ghost danger" type="submit" formaction="?/archiveStudents">
							Archive
						</button>
					</div>
				{/if}
			</form>
		</Panel>
	{/if}

	<h2 class="section-title">Courses</h2>
	<Panel>
		{#if data.group.courses.length === 0}
			<p class="empty">
				No courses assigned. Until one is, this class sees every published course.
			</p>
		{:else}
			<ul class="assigned">
				{#each data.group.courses as course (course.id)}
					<li>
						<a class="link" href="/admin/courses/{course.id}">{course.title}</a>
						{#if !course.published}<span class="chip">Draft</span>{/if}
						<form method="POST" action="?/unassignCourse" use:enhance>
							<input type="hidden" name="courseId" value={course.id} />
							<button class="btn btn-ghost" type="submit">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if assignable.length > 0}
			<form class="inline assign" method="POST" action="?/assignCourse" use:enhance>
				<select class="field" name="courseId" aria-label="Course to assign">
					{#each assignable as course (course.id)}
						<option value={course.id}>{course.title}{course.published ? '' : ' (draft)'}</option>
					{/each}
				</select>
				<Button type="submit" variant="ghost">Assign</Button>
			</form>
		{/if}
	</Panel>

	{#if form && 'message' in form && form.message}
		<Callout variant="danger">{form.message}</Callout>
	{/if}

	<h2 class="section-title">Danger zone</h2>
	<Panel>
		<div class="danger-row">
			<div>
				<p class="danger-title">{data.group.archivedAt ? 'Restore class' : 'Archive class'}</p>
				<p class="danger-note">
					Archiving puts the class away at the end of a year. Nobody loses an account or any work.
				</p>
			</div>
			<form method="POST" action="?/archive" use:enhance>
				<input type="hidden" name="archived" value={data.group.archivedAt ? 'false' : 'true'} />
				<button class="btn btn-ghost" type="submit">
					{data.group.archivedAt ? 'Restore' : 'Archive'}
				</button>
			</form>
		</div>

		<div class="danger-row">
			<div>
				<p class="danger-title">Delete class</p>
				<p class="danger-note">Only possible once the class is empty.</p>
			</div>
			<form method="POST" action="?/delete" use:enhance>
				<button class="btn btn-ghost danger" type="submit">Delete</button>
			</form>
		</div>
	</Panel>
</main>

<style>
	.page {
		max-width: 940px;
		margin: 0 auto;
		padding: 28px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.head .section-title {
		flex: 1;
	}

	.section-title {
		margin: 8px 0 0;
		font-size: 15px;
		font-family: var(--font-display);
		color: var(--text-muted);
	}

	.count {
		font-family: var(--font-code);
		font-size: 0.75rem;
		color: var(--text-faint);
		margin-left: 4px;
	}

	.inline {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.assign {
		margin-top: 12px;
	}

	.note {
		margin: 10px 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.table-wrap {
		overflow-x: auto;
	}

	.mono {
		font-family: var(--font-code);
		font-size: 0.8125rem;
	}

	.link {
		color: var(--text);
		font-weight: 600;
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.bar {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding: 12px;
		margin-top: 8px;
		border-top: 1px solid var(--panel-border);
		background: var(--panel);
	}

	.bar-note {
		font-size: 0.75rem;
		color: var(--text-faint);
	}

	.bar-count {
		font-size: 0.75rem;
		font-family: var(--font-code);
		color: var(--text-muted);
		margin-right: 4px;
	}

	.move {
		width: auto;
	}

	.assigned {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.assigned li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.assigned li form {
		margin-left: auto;
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.danger-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.danger-row + .danger-row {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--panel-border);
	}

	.danger-row form {
		margin-left: auto;
	}

	.danger-title {
		margin: 0;
		font-weight: 700;
		font-size: 0.875rem;
	}

	.danger-note {
		margin: 3px 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.danger {
		color: var(--danger);
	}
</style>
