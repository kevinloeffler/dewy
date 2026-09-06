<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import CirclePlay from '@lucide/svelte/icons/circle-play';
	import { autosave, SaveTracker } from '$lib/autosave.svelte.js';
	import { Button, Callout, Modal } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const course = $derived(data.course);

	/**
	 * False when this course reached us as a clone — a live read-only link to
	 * somebody else's work. Every control below keys off it, so read-only is one
	 * flag rather than a parallel template.
	 */
	const canEdit = $derived(data.canEdit);

	/**
	 * There is no save button any more, so the page has to say for itself when a
	 * rename has landed. One tracker for the whole page: the indicator is a
	 * single line in the corner, not a badge per field.
	 */
	const saves = new SaveTracker();

	// Which dialog is open. `stageId` carries the stage the item is being added
	// to, so the two item dialogs are one each rather than one per stage.
	let addingStage = $state(false);
	let addingLevel = $state<string | null>(null);
	let addingTheory = $state<string | null>(null);
	let deletingCourse = $state(false);
	let sharing = $state(false);

	// Which shared level the "new level" dialog has selected.
	let borrowed = $state('');

	const sharedWith = $derived(new Set(data.shares.map((row) => row.teacherId)));
	const shareable = $derived(data.teachers.filter((row) => !sharedWith.has(row.id)));
</script>

<svelte:head>
	<title>{course.title} · Dewy</title>
</svelte:head>

<main class="page">
	{#if !canEdit}
		<Callout>
			<strong>Dieser Kurs gehört einer anderen Lehrperson.</strong> Du siehst eine Live-Verknüpfung
			darauf, spätere Änderungen erscheinen also auch hier. Du kannst den Kurs deinen Klassen
			zuweisen und ihn ansehen; um etwas zu ändern, erstelle eine Kopie.
		</Callout>
	{/if}

	{#if form?.message}
		<Callout variant="danger">{form.message}</Callout>
	{/if}

	<!-- ── The course itself ───────────────────────────────── -->

	<section class="panel card">
		<h2 class="card-title">Kurs</h2>

		<form class="fields" method="POST" action="?/updateCourse" use:enhance={saves.enhance('course')}>
			<input
				class="field"
				name="title"
				value={course.title}
				placeholder="Kursname"
				aria-label="Kursname"
				autocomplete="off"
				disabled={!canEdit}
				use:autosave
			/>
			<textarea
				class="field description"
				name="description"
				rows="2"
				placeholder="Beschreibung…"
				aria-label="Kursbeschreibung"
				disabled={!canEdit}
				use:autosave>{course.description ?? ''}</textarea
			>
		</form>

		<div class="card-actions">
			{#if canEdit}
				<form method="POST" action="?/publish" use:enhance>
					<input type="hidden" name="published" value={course.published ? 'false' : 'true'} />
					<button class="btn btn-ghost act" type="submit">
						{course.published ? 'Archivieren' : 'Veröffentlichen'}
					</button>
				</form>
				<button class="btn btn-ghost act" type="button" onclick={() => (sharing = true)}>
					Teilen
				</button>
			{/if}

			<a class="btn btn-ghost act" href="/courses/{course.id}">Vorschau</a>

			<form method="POST" action="?/duplicate" use:enhance>
				<button class="btn btn-ghost act" type="submit">Kopie erstellen</button>
			</form>

			{#if canEdit}
				<button
					class="btn btn-danger act push-right"
					type="button"
					onclick={() => (deletingCourse = true)}
				>
					Löschen
				</button>
			{/if}
		</div>
	</section>

	<!-- ── Its stages ──────────────────────────────────────── -->

	{#if course.stages.length === 0}
		<section class="panel card">
			<p class="empty">
				Noch keine Kapitel. Ein Kapitel ist ein Abschnitt des Kurses — leg eines an und füll es mit
				Levels und Theorieblöcken.
			</p>
		</section>
	{/if}

	{#each course.stages as stage, stageIndex (stage.id)}
		<section class="panel card">
			<header class="stage-head">
				<form
					class="stage-title"
					method="POST"
					action="?/updateStage"
					use:enhance={saves.enhance(stage.id)}
				>
					<input type="hidden" name="id" value={stage.id} />
					<input
						class="field field-strong"
						name="title"
						value={stage.title}
						placeholder="Kapitelname"
						aria-label="Kapitelname"
						autocomplete="off"
						disabled={!canEdit}
						use:autosave
					/>
				</form>

				<div class="controls" class:is-hidden={!canEdit}>
					<form method="POST" action="?/moveStage" use:enhance>
						<input type="hidden" name="id" value={stage.id} />
						<input type="hidden" name="direction" value="down" />
						<button
							class="btn btn-ghost icon-btn"
							type="submit"
							disabled={stageIndex === course.stages.length - 1}
							aria-label="Kapitel nach unten"
						>
							<ArrowDown size={18} />
						</button>
					</form>
					<form method="POST" action="?/moveStage" use:enhance>
						<input type="hidden" name="id" value={stage.id} />
						<input type="hidden" name="direction" value="up" />
						<button
							class="btn btn-ghost icon-btn"
							type="submit"
							disabled={stageIndex === 0}
							aria-label="Kapitel nach oben"
						>
							<ArrowUp size={18} />
						</button>
					</form>
					<form method="POST" action="?/deleteStage" use:enhance>
						<input type="hidden" name="id" value={stage.id} />
						<button class="btn btn-danger act" type="submit">Löschen</button>
					</form>
				</div>
			</header>

			<div class="rules">
				<form method="POST" action="?/gateStage" use:enhance>
					<input type="hidden" name="id" value={stage.id} />
					<input type="hidden" name="gated" value={stage.gated ? 'false' : 'true'} />
					<label class="rule">
						<input
							type="checkbox"
							checked={stage.gated}
							disabled={stageIndex === 0 || !canEdit}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						/>
						<span>Blockiere dieses Kapitel bis das vorherige abgeschlossen ist</span>
					</label>
				</form>

				<form method="POST" action="?/orderStage" use:enhance>
					<input type="hidden" name="id" value={stage.id} />
					<input type="hidden" name="ordered" value={stage.ordered ? 'false' : 'true'} />
					<label class="rule">
						<input
							type="checkbox"
							checked={stage.ordered}
							disabled={!canEdit}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						/>
						<span>Reihenfolge der Levels einhalten</span>
					</label>
				</form>
			</div>

			<hr class="rule-line" />

			{#if stage.items.length === 0}
				<p class="empty">Noch nichts drin — füg ein Level oder einen Theorieblock hinzu.</p>
			{:else}
				<ol class="items">
					{#each stage.items as item, itemIndex (item.id)}
						{@const href =
							item.kind === 'theory'
								? `/admin/courses/${course.id}/theory/${item.id}`
								: `/designer/${item.levelId}`}
						<li class="item">
							<a class="item-link" {href}>
								<span class="item-icon">
									{#if item.kind === 'theory'}
										<BookOpen size={20} />
									{:else}
										<CirclePlay size={20} />
									{/if}
								</span>
								<span class="item-name">
									{item.kind === 'theory' ? item.title : item.name}
								</span>
							</a>

							{#if item.kind === 'level' && item.linked}
								<span class="chip">Geteilt</span>
							{/if}

							<div class="controls" class:is-hidden={!canEdit}>
								<form method="POST" action="?/moveItem" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										class="btn btn-ghost icon-btn"
										type="submit"
										disabled={itemIndex === stage.items.length - 1}
										aria-label="Nach unten"
									>
										<ArrowDown size={18} />
									</button>
								</form>
								<form method="POST" action="?/moveItem" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<input type="hidden" name="direction" value="up" />
									<button
										class="btn btn-ghost icon-btn"
										type="submit"
										disabled={itemIndex === 0}
										aria-label="Nach oben"
									>
										<ArrowUp size={18} />
									</button>
								</form>
								<form method="POST" action="?/deleteItem" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<button class="btn btn-danger act" type="submit">Löschen</button>
								</form>
							</div>
						</li>
					{/each}
				</ol>
			{/if}

			{#if canEdit}
				<footer class="stage-add">
					<button
						class="btn btn-add add"
						type="button"
						onclick={() => {
							borrowed = '';
							addingLevel = stage.id;
						}}
					>
						+ Level
					</button>
					<button class="btn btn-add add" type="button" onclick={() => (addingTheory = stage.id)}>
						+ Theorie
					</button>
				</footer>
			{/if}
		</section>
	{/each}

	{#if canEdit}
		<div class="page-add">
			<button class="btn btn-add add wide" type="button" onclick={() => (addingStage = true)}>
				Neues Kapitel
			</button>
		</div>
	{/if}
</main>

<!--
	The save indicator. Autosave took the save button away, so this is the only
	place the page admits a write happened — quiet, and out of the layout.
-->
{#if saves.busy || saves.settled}
	<p class="save-state" aria-live="polite">{saves.busy ? 'Speichern…' : 'Gespeichert'}</p>
{/if}

<!-- ── Dialogs ─────────────────────────────────────────────── -->

<Modal bind:open={addingStage} title="Neues Kapitel">
	<form class="dialog-form" method="POST" action="?/addStage" use:enhance>
		<label class="field-label" for="new-stage-title">Kapitelname</label>
		<input
			class="field"
			id="new-stage-title"
			name="title"
			placeholder="z. B. Einführung"
			autocomplete="off"
		/>
		<div class="dialog-actions">
			<Button type="button" variant="ghost" onclick={() => (addingStage = false)}>Abbrechen</Button>
			<Button type="submit">Kapitel erstellen</Button>
		</div>
	</form>
</Modal>

<Modal open={addingLevel !== null} title="Neues Level" onclose={() => (addingLevel = null)}>
	<form class="dialog-form" method="POST" action="?/addLevel" use:enhance>
		<input type="hidden" name="stageId" value={addingLevel} />
		<label class="field-label" for="new-level-name">Levelname</label>
		<input
			class="field"
			id="new-level-name"
			name="name"
			placeholder="z. B. Erste Schritte"
			autocomplete="off"
		/>
		<p class="dialog-note">Das leere Level öffnet sich danach direkt im Designer.</p>
		<div class="dialog-actions">
			<Button type="button" variant="ghost" onclick={() => (addingLevel = null)}>Abbrechen</Button>
			<Button type="submit">Level erstellen</Button>
		</div>
	</form>

	{#if data.sharedLevels.length > 0}
		<form class="dialog-form borrow" method="POST" use:enhance>
			<input type="hidden" name="stageId" value={addingLevel} />
			<label class="field-label" for="borrow-level">Oder ein geteiltes Level übernehmen</label>
			<select class="field" id="borrow-level" name="levelId" bind:value={borrowed}>
				<option value="">Geteiltes Level wählen…</option>
				{#each data.sharedLevels as level (level.id)}
					<option value={level.id}>
						{level.name}{level.ownerName ? ` · ${level.ownerName}` : ''}
					</option>
				{/each}
			</select>
			<div class="dialog-actions">
				<button
					class="btn btn-ghost"
					type="submit"
					formaction="?/linkLevel"
					disabled={!borrowed}
					title="Fügt eine Live-Verknüpfung ein. Die Autorin oder der Autor bearbeitet das Level weiter, du nicht."
				>
					Verknüpfen
				</button>
				<button
					class="btn btn-ghost"
					type="submit"
					formaction="?/copyLevel"
					disabled={!borrowed}
					title="Fügt eine eigene, bearbeitbare Kopie ein."
				>
					Kopieren
				</button>
			</div>
		</form>
	{/if}
</Modal>

<Modal open={addingTheory !== null} title="Neuer Theorieblock" onclose={() => (addingTheory = null)}>
	<form class="dialog-form" method="POST" action="?/addTheory" use:enhance>
		<input type="hidden" name="stageId" value={addingTheory} />
		<label class="field-label" for="new-theory-title">Titel</label>
		<input
			class="field"
			id="new-theory-title"
			name="title"
			placeholder="z. B. Was ist eine Schleife?"
			autocomplete="off"
		/>
		<p class="dialog-note">Der Texteditor öffnet sich danach direkt.</p>
		<div class="dialog-actions">
			<Button type="button" variant="ghost" onclick={() => (addingTheory = null)}>Abbrechen</Button>
			<Button type="submit">Theorieblock erstellen</Button>
		</div>
	</form>
</Modal>

<Modal bind:open={sharing} title="„{course.title}“ teilen">
	<p class="dialog-note">
		Eine Lehrperson, mit der du teilst, sieht diesen Kurs als <strong>Live-Verknüpfung</strong> —
		deine späteren Änderungen erreichen sie — und kann ihn ihren Klassen zuweisen, aber nicht
		ändern. Eine eigene, bearbeitbare Kopie kann sie sich jederzeit erstellen.
	</p>

	{#if data.shares.length > 0}
		<ul class="share-list">
			{#each data.shares as row (row.teacherId)}
				<li>
					<span>{row.name}</span>
					<form method="POST" action="?/unshare" use:enhance>
						<input type="hidden" name="teacherId" value={row.teacherId} />
						<button class="btn btn-ghost" type="submit">Entziehen</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="dialog-note">Noch mit niemandem geteilt.</p>
	{/if}

	{#if shareable.length > 0}
		<form class="share-add" method="POST" action="?/share" use:enhance>
			<select class="field" name="teacherId" aria-label="Lehrperson zum Teilen">
				{#each shareable as teacher (teacher.id)}
					<option value={teacher.id}>{teacher.name}</option>
				{/each}
			</select>
			<Button type="submit" variant="ghost">Teilen</Button>
		</form>
	{/if}
</Modal>

<!--
	Deleting the course takes every stage, theory block and level with it, and
	the button for it now sits next to "Vorschau" rather than in a danger zone —
	so it asks first.
-->
<Modal bind:open={deletingCourse} title="Kurs löschen?">
	<p class="dialog-note">
		„{course.title}“ und damit jedes Kapitel, jeden Theorieblock und jedes Level darin werden
		gelöscht. Das lässt sich nicht rückgängig machen.
	</p>
	<form class="dialog-actions" method="POST" action="?/deleteCourse" use:enhance>
		<Button type="button" variant="ghost" onclick={() => (deletingCourse = false)}>Abbrechen</Button
		>
		<button class="btn btn-danger" type="submit">Endgültig löschen</button>
	</form>
</Modal>

<style>
	.page {
		max-width: 929px; /* 865px of content plus the 32px gutters */
		margin: 0 auto;
		padding: 44px 32px 80px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card {
		padding: 32px 32px 20px;
	}

	.card-title {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 16px;
	}

	/* ── The course card ─────────────────────────────────── */

	.fields {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 8px;
		padding-bottom: 12px;
	}

	.push-right {
		margin-left: auto;
	}

	/* ── Stages ──────────────────────────────────────────── */

	.stage-head {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	.stage-title {
		flex: 1;
		min-width: 180px;
	}

	.rules {
		display: flex;
		flex-direction: column;
		margin-top: 9px;
	}

	.rule {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.875rem;
		line-height: 1.35;
	}

	.rule:has(input:disabled) {
		color: var(--text-faint);
	}

	.rule input {
		accent-color: var(--accent);
	}

	.rule-line {
		border: 0;
		border-top: 1px solid var(--panel-border);
		margin: 10px 0 16px;
	}

	/* ── Items ───────────────────────────────────────────── */

	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 9px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 59px;
		padding: 8px 8px 8px 16px;
		background: var(--bg);
		border-radius: 8px;
	}

	.item-link {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 16px;
		text-decoration: none;
		color: var(--text);
	}

	.item-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--accent-soft);
		color: var(--accent);
	}

	.item-name {
		font-weight: 700;
		font-size: 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-link:hover .item-name {
		color: var(--accent);
	}

	.stage-add {
		display: flex;
		justify-content: center;
		gap: 9px;
		margin-top: 9px;
	}

	.page-add {
		display: flex;
		justify-content: center;
	}

	/* ── Controls ────────────────────────────────────────── */

	.controls {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	/* Read-only keeps the layout — the controls go, the rows do not shift. */
	.is-hidden {
		visibility: hidden;
	}

	.field {
		height: 43px;
		border-radius: 8px;
		font-size: 1rem;
		padding: 0 14px;
	}

	.field-strong {
		font-weight: 700;
		font-size: 1.0625rem;
	}

	/* `textarea.field` in the global sheet is monospace, for the theory editor's
	   markdown body. A course description is prose, so it says otherwise. */
	.description {
		height: auto;
		min-height: 89px;
		padding: 12px 14px;
		font-family: var(--font-ui);
		font-size: 1rem;
		line-height: 1.5;
		resize: vertical;
	}

	/* The design sizes every button in the editor alike: 43px tall, and wide
	   enough that "Teilen" and "Archivieren" line up as one row of tiles. */
	.act {
		justify-content: center;
		min-width: 98px;
		height: 43px;
		padding: 0 12px;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
	}

	.icon-btn {
		justify-content: center;
		width: 43px;
		height: 43px;
		min-width: 0;
		padding: 0;
		border-radius: 8px;
	}

	.add {
		justify-content: center;
		min-width: 80px;
		height: 31px;
		padding: 0 14px;
		border-radius: 8px;
		font-size: 0.8125rem;
	}

	.wide {
		min-width: 168px;
	}

	/* ── Odds and ends ───────────────────────────────────── */

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.save-state {
		position: fixed;
		right: 20px;
		bottom: 20px;
		padding: 7px 14px;
		border-radius: 999px;
		background: var(--panel);
		border: 1px solid var(--panel-border);
		box-shadow: var(--panel-shadow);
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.dialog-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.borrow {
		border-top: 1px solid var(--panel-border);
		padding-top: 14px;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}

	.dialog-note {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		line-height: 1.55;
	}

	.share-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.share-list li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.875rem;
	}

	.share-list li form {
		margin-left: auto;
	}

	.share-add {
		display: flex;
		gap: 8px;
		align-items: center;
		border-top: 1px solid var(--panel-border);
		padding-top: 12px;
	}
</style>
