<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import { Callout, Checkbox, Panel } from '$lib/components/index.js';
	import { ROLES } from '$lib/roles';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const message = $derived(form && 'message' in form ? form.message : undefined);

	let picked = $state(new SvelteSet<string>());
	const ids = $derived(data.people.map((person) => person.id));
	const allPicked = $derived(ids.length > 0 && picked.size === ids.length);

	function toggleAll() {
		if (allPicked) picked.clear();
		else for (const id of ids) picked.add(id);
	}

	function toggle(id: string) {
		if (picked.has(id)) picked.delete(id);
		else picked.add(id);
	}

	// The filter bar is a GET form, so the current view is always a URL a
	// teacher can bookmark or send to a colleague.
	const filteredByClass = $derived(data.filter.classId ?? '');
</script>

<svelte:head>
	<title>People · Dewy</title>
</svelte:head>

<main class="page">
	<div class="head">
		<h1 class="title">People</h1>
		<a class="btn btn-primary" href="/admin/people/new">Add people</a>
	</div>

	<Panel padding="sm">
		<form class="filters" method="GET">
			<input
				class="field search"
				name="q"
				placeholder="Search name or username"
				value={data.filter.search ?? ''}
			/>

			<select class="field" name="role" aria-label="Role">
				<option value="">All roles</option>
				{#each ROLES as role (role)}
					<option value={role} selected={data.filter.role === role}>{role}</option>
				{/each}
			</select>

			<select class="field" name="classId" aria-label="Class">
				<option value="">All classes</option>
				{#each data.classes as row (row.id)}
					<option value={row.id} selected={filteredByClass === row.id}>{row.name}</option>
				{/each}
			</select>

			<label class="toggle">
				<input type="checkbox" name="archived" value="1" checked={data.filter.archived} />
				Archived
			</label>

			<button class="btn btn-ghost" type="submit">Apply</button>
		</form>
	</Panel>

	{#if message}
		<Callout variant="danger">{message}</Callout>
	{/if}

	{#if data.people.length === 0}
		<Panel>
			<p class="empty">
				{data.filter.archived ? 'Nobody is archived.' : 'Nobody here yet.'}
			</p>
		</Panel>
	{:else}
		<Panel padding="sm">
			<form
				method="POST"
				use:enhance={() => async ({ update }) => {
					picked.clear();
					await update({ reset: false });
				}}
			>
				<input type="hidden" name="fromClassId" value={filteredByClass} />

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
								<th>Signs in with</th>
								<th>Role</th>
								<th>Classes</th>
								<th class="numeric">Done</th>
							</tr>
						</thead>
						<tbody>
							{#each data.people as person (person.id)}
								<tr class:is-archived={person.archivedAt}>
									<td class="tight">
										<Checkbox
											name="userId"
											value={person.id}
											checked={picked.has(person.id)}
											label="Select {person.name}"
											onchange={() => toggle(person.id)}
										/>
									</td>
									<td>
										<a class="link" href="/admin/people/{person.id}">{person.name}</a>
										{#if person.archivedAt}<span class="chip">Archived</span>{/if}
									</td>
									<td class="mono">{person.username ?? person.email ?? '—'}</td>
									<td><span class="chip">{person.role}</span></td>
									<td class="classes">
										{#each person.classes as row (row.id)}
											<a class="chip" href="/admin/people?classId={row.id}">{row.name}</a>
										{:else}
											<span class="none">—</span>
										{/each}
									</td>
									<td class="numeric">{person.completedItems}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if picked.size > 0}
					<div class="bar">
						<span class="bar-count">{picked.size} selected</span>

						<input
							class="field pick"
							name="password"
							type="text"
							placeholder="New password"
							minlength="8"
							autocomplete="off"
							title="Sets this one password on every selected account."
						/>
						<button class="btn btn-ghost" type="submit" formaction="?/setPassword">
							Set password
						</button>
						{#if picked.size > 1}
							<span class="bar-note">— the same one for all picked.size</span>
						{/if}

						<select class="field pick" name="classId" aria-label="Class">
							<option value="">Class…</option>
							{#each data.classes as row (row.id)}
								<option value={row.id}>{row.name}</option>
							{/each}
						</select>
						<button class="btn btn-ghost" type="submit" formaction="?/addToClass">Add</button>
						{#if filteredByClass}
							<button class="btn btn-ghost" type="submit" formaction="?/moveToClass">Move</button>
						{/if}

						{#if data.filter.archived}
							<button class="btn btn-ghost" type="submit" formaction="?/restore">Restore</button>
						{:else}
							<button class="btn btn-ghost danger" type="submit" formaction="?/archive">
								Archive
							</button>
						{/if}
					</div>
				{/if}
			</form>
		</Panel>
	{/if}
</main>

<style>
	.page {
		max-width: 1080px;
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

	.title {
		margin: 0;
		font-size: 1.375rem;
		flex: 1;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.filters .field {
		width: auto;
	}

	.search {
		flex: 1;
		min-width: 200px;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8125rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.toggle input {
		accent-color: var(--accent);
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

	.classes {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.classes .chip {
		text-decoration: none;
	}

	.none {
		color: var(--text-faint);
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

	.pick {
		width: auto;
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.danger {
		color: var(--danger);
	}
</style>
