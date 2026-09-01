<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button, Callout, Panel } from '$lib/components/index.js';
	import { ROLES } from '$lib/roles';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const message = $derived(form && 'message' in form ? form.message : undefined);
	const saved = $derived(form && 'savedAt' in form);

	// Seeded once; the fields own their text after that.
	let name = $state(untrack(() => data.person.name));
	let username = $state(untrack(() => data.person.username ?? ''));
	let email = $state(untrack(() => data.person.email ?? ''));

	const memberOf = $derived(new Set(data.person.classes.map((row) => row.id)));
	const joinable = $derived(data.classes.filter((row) => !memberOf.has(row.id)));

	const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
</script>

<svelte:head>
	<title>{data.person.name} · People · Dewy</title>
</svelte:head>

<main class="page">
	<div class="head">
		<a class="back" href="/admin/people">‹ People</a>
	</div>

	<h1 class="title">
		{data.person.name}
		<span class="chip">{data.person.role}</span>
		{#if data.person.archivedAt}<span class="chip">Archived</span>{/if}
	</h1>

	<p class="meta">
		Joined {dateFormat.format(data.person.createdAt)}
		· {data.person.completedItems} completed
		{data.person.completedItems === 1 ? 'item' : 'items'}
		· {data.person.lastSignInAt
			? `last signed in ${dateFormat.format(data.person.lastSignInAt)}`
			: 'never signed in'}
	</p>

	{#if message}
		<Callout variant="danger">{message}</Callout>
	{/if}

	<h2 class="section-title">Details</h2>
	<Panel>
		<form method="POST" action="?/rename" use:enhance>
			<label class="field-label" for="name">Name</label>
			<input class="field" id="name" name="name" bind:value={name} />

			{#if data.person.role === 'student'}
				<label class="field-label spaced" for="username">Username</label>
				<input class="field" id="username" name="username" bind:value={username} autocapitalize="none" />
				<p class="field-hint">
					Changing this changes how they sign in. Their password is unaffected.
				</p>
			{:else}
				<label class="field-label spaced" for="email">Email</label>
				<input class="field" id="email" name="email" type="email" bind:value={email} />
			{/if}

			<Button type="submit" variant="ghost">Save</Button>
		</form>
	</Panel>

	<h2 class="section-title">Classes</h2>
	<Panel>
		{#if data.person.classes.length === 0}
			<p class="empty">Not in any class.</p>
		{:else}
			<ul class="chips">
				{#each data.person.classes as row (row.id)}
					<li>
						<a class="chip" href="/admin/classes/{row.id}">{row.name}</a>
						<form method="POST" action="?/removeFromClass" use:enhance>
							<input type="hidden" name="classId" value={row.id} />
							<button class="btn btn-ghost" type="submit">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.person.role === 'student' && joinable.length > 0}
			<form class="inline spaced" method="POST" action="?/addToClass" use:enhance>
				<select class="field" name="classId" aria-label="Class to join">
					{#each joinable as row (row.id)}
						<option value={row.id}>{row.name}</option>
					{/each}
				</select>
				<Button type="submit" variant="ghost">Add to class</Button>
			</form>
		{/if}
	</Panel>

	{#if data.isAdmin && !data.isSelf}
		<h2 class="section-title">Role</h2>
		<Panel>
			<form class="inline" method="POST" action="?/setRole" use:enhance>
				<select class="field" name="role" aria-label="Role">
					{#each ROLES as role (role)}
						<option value={role} selected={data.person.role === role}>{role}</option>
					{/each}
				</select>
				<Button type="submit" variant="ghost">Change role</Button>
			</form>
			<p class="field-hint">
				A teacher can create and archive students; an admin can do that to teachers too.
			</p>
		</Panel>
	{/if}

	<h2 class="section-title">Access</h2>
	<Panel>
		<div class="danger-row">
			<div>
				<p class="danger-title">Set a new password</p>
				<p class="danger-note">
					{data.isSelf
						? 'Choose your own. You stay signed in here.'
						: 'Choose it yourself and tell them. Signs them out everywhere else.'}
				</p>
			</div>
			<form class="inline" method="POST" action="?/setPassword" use:enhance>
				<input
					class="field"
					name="password"
					type="text"
					placeholder="New password"
					minlength="8"
					autocomplete="off"
					required
				/>
				<Button type="submit" variant="ghost">{saved ? 'Saved' : 'Set'}</Button>
			</form>
		</div>

		{#if !data.isSelf}
			<div class="danger-row">
				<div>
					<p class="danger-title">
						{data.person.archivedAt ? 'Restore account' : 'Archive account'}
					</p>
					<p class="danger-note">
						Archiving blocks sign-in and ends their sessions. Everything they have done stays —
						restoring puts them back exactly where they were.
					</p>
				</div>
				<form method="POST" action="?/archive" use:enhance>
					<input type="hidden" name="archived" value={data.person.archivedAt ? 'false' : 'true'} />
					<button class="btn btn-ghost" class:danger={!data.person.archivedAt} type="submit">
						{data.person.archivedAt ? 'Restore' : 'Archive'}
					</button>
				</form>
			</div>
		{/if}
	</Panel>
</main>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 28px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.head {
		display: flex;
	}

	.back {
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.title {
		margin: 0;
		font-size: 1.375rem;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.meta {
		margin: 0 0 8px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.section-title {
		margin: 8px 0 0;
		font-size: 15px;
		font-family: var(--font-display);
		color: var(--text-muted);
	}

	.spaced {
		margin-top: 14px;
	}

	.inline {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.inline .field {
		width: auto;
	}

	form :global(.btn) {
		margin-top: 0;
	}

	.chips {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.chips li {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.chips .chip {
		text-decoration: none;
	}

	.chips li form {
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
		max-width: 46ch;
	}

	.danger {
		color: var(--danger);
	}
</style>
