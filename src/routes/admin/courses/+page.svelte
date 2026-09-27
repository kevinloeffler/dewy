<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, Callout, Modal } from '$lib/components/index.js';
	import { dismiss } from '$lib/dismiss.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let creating = $state(false);
	// The course the delete dialog is asking about — it names it in the warning,
	// so it holds the row rather than just a flag.
	let deleting = $state<{ id: string; title: string } | null>(null);

	const date = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' });

	function plural(count: number, one: string, many: string) {
		return `${count} ${count === 1 ? one : many}`;
	}
</script>

<svelte:head>
	<title>Kurse · Dewy</title>
</svelte:head>

<main class="page">
	{#if form?.message}
		<Callout variant="danger">{form.message}</Callout>
	{/if}

	<header class="head">
		<h1 class="head-title">Kurse</h1>
		<Button onclick={() => (creating = true)}>Neuer Kurs</Button>
	</header>

	{#if data.courses.length === 0}
		<section class="panel card">
			<p class="empty">
				Noch keine Kurse. Leg einen an, um mit dem Aufbau eines Lehrplans zu beginnen.
			</p>
		</section>
	{:else}
		<ul class="list">
			{#each data.courses as course (course.id)}
				<li class="panel card">
					<div class="row">
						<div class="row-text">
							<p class="row-head">
								<a class="row-name" href="/admin/courses/{course.id}">{course.title}</a>
								<span class="chip">{course.published ? 'Veröffentlicht' : 'Entwurf'}</span>
							</p>
							<p class="row-meta">
								{plural(course.stageCount, 'Kapitel', 'Kapitel')}
								· {plural(course.itemCount, 'Element', 'Elemente')}
								· bearbeitet {date.format(course.updatedAt)}
							</p>
							{#if course.description}
								<p class="row-desc">{course.description}</p>
							{/if}
						</div>

						<div class="controls">
							<form method="POST" action="?/publish" use:enhance>
								<input type="hidden" name="id" value={course.id} />
								<input type="hidden" name="published" value={course.published ? 'false' : 'true'} />
								<button class="btn btn-ghost act" type="submit">
									{course.published ? 'Archivieren' : 'Veröffentlichen'}
								</button>
							</form>
							<a class="btn btn-ghost act" href="/admin/courses/{course.id}">Bearbeiten</a>
							<button
								class="btn btn-danger act"
								type="button"
								onclick={() => (deleting = { id: course.id, title: course.title })}
							>
								Löschen
							</button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.shared.length > 0}
		<h2 class="section-title">Mit mir geteilt</h2>
		<p class="hint">
			Live-Verknüpfungen auf die Kurse anderer Lehrpersonen. Du kannst sie deinen Klassen zuweisen
			und spätere Änderungen der Autorin oder des Autors erreichen dich, aber ändern kannst du sie
			nicht. Erstelle eine Kopie, um sie zu deinen zu machen.
		</p>
		<ul class="list">
			{#each data.shared as course (course.id)}
				<li class="panel card">
					<div class="row">
						<div class="row-text">
							<p class="row-head">
								<a class="row-name" href="/admin/courses/{course.id}">{course.title}</a>
								<span class="chip">
									Nur lesen{course.ownerName ? ` · ${course.ownerName}` : ''}
								</span>
							</p>
							<p class="row-meta">
								{plural(course.stageCount, 'Kapitel', 'Kapitel')}
								· {plural(course.itemCount, 'Element', 'Elemente')}
							</p>
							{#if course.description}
								<p class="row-desc">{course.description}</p>
							{/if}
						</div>

						<div class="controls">
							<a class="btn btn-ghost act" href="/admin/courses/{course.id}">Ansehen</a>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

</main>

<Modal bind:open={creating} title="Neuer Kurs">
	<form
		class="dialog-form"
		method="POST"
		action="?/create"
		use:enhance={dismiss(() => (creating = false))}
	>
		<label class="field-label" for="new-course-title">Kursname</label>
		<input
			class="field"
			id="new-course-title"
			name="title"
			placeholder="z. B. Einführung ins Programmieren"
			autocomplete="off"
		/>
		<div class="dialog-actions">
			<Button type="button" variant="ghost" onclick={() => (creating = false)}>Abbrechen</Button>
			<Button type="submit">Kurs erstellen</Button>
		</div>
	</form>
</Modal>

<Modal
	open={deleting !== null}
	title="Kurs löschen?"
	onclose={() => (deleting = null)}
>
	<p class="hint">
		„{deleting?.title}“ und damit jedes Kapitel, jeden Theorieblock und jedes Level darin werden
		gelöscht. Das lässt sich nicht rückgängig machen.
	</p>
	<form
		class="dialog-actions"
		method="POST"
		action="?/delete"
		use:enhance={dismiss(() => (deleting = null))}
	>
		<input type="hidden" name="id" value={deleting?.id} />
		<Button type="button" variant="ghost" onclick={() => (deleting = null)}>Abbrechen</Button>
		<button class="btn btn-danger" type="submit">Endgültig löschen</button>
	</form>
</Modal>

<style>
	.page {
		max-width: 929px;
		margin: 0 auto;
		padding: 44px 32px 80px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.head-title {
		font-size: 1.375rem;
		font-weight: 700;
	}

	.section-title {
		font-size: 1.0625rem;
		font-weight: 700;
		margin-top: 12px;
	}

	.card {
		padding: 24px 32px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}

	.row-text {
		/* Without this the description's max-content width pushes the buttons
		   onto their own line. */
		flex: 1;
		min-width: 220px;
	}

	.row-head {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.row-name {
		font-weight: 700;
		font-size: 1.125rem;
		color: var(--text);
		text-decoration: none;
	}

	.row-name:hover {
		color: var(--accent);
	}

	.row-meta,
	.row-desc {
		margin-top: 4px;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	/* Same button metrics as the course editor, so the two pages read as one. */
	.act {
		justify-content: center;
		min-width: 98px;
		height: 43px;
		padding: 0 12px;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.empty,
	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.hint {
		font-size: 0.8125rem;
		line-height: 1.55;
	}

	.field {
		height: 43px;
		border-radius: 8px;
		font-size: 1rem;
		padding: 0 14px;
	}

	.dialog-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}
</style>
