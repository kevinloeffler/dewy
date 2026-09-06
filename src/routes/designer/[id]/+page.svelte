<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { Button, Callout, Modal, Panel, Topbar } from '$lib/components/index.js';
	import DesignerCanvas from '$lib/components/designer/DesignerCanvas.svelte';
	import GoalEditor from '$lib/components/designer/GoalEditor.svelte';
	import LevelInspector from '$lib/components/designer/LevelInspector.svelte';
	import TilePalette from '$lib/components/designer/TilePalette.svelte';
	import ValidationList from '$lib/components/designer/ValidationList.svelte';
	import { createLevelDraft } from '$lib/game/editor/draft.svelte';
	import {
		BRUSH_GROUPS,
		buildBrush,
		defaultBrushOptions,
		type BrushId,
		type BrushOptions
	} from '$lib/game/editor/brush';
	import { armIds, deleteSelection, setSelectionOption } from '$lib/game/editor/operations';
	import { selectAt } from '$lib/game/editor/selection';
	import { validateLevel } from '$lib/game/rules';
	import type { Coord } from '$lib/game/level';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	// Created once. Re-deriving it whenever `data` is invalidated would throw
	// away the undo history along with any unsaved work.
	const draft = createLevelDraft(untrack(() => data.level));

	// False when this level was reached through a share — its author keeps it.
	const canEdit = $derived(data.canEdit);

	let sharing = $state(false);
	const sharedWith = $derived(new Set(data.shares.map((row) => row.teacherId)));
	const shareable = $derived(data.teachers.filter((row) => !sharedWith.has(row.id)));

	let selected = $state<BrushId>('wall');
	let options = $state(defaultBrushOptions());
	let brush = $derived(buildBrush(selected, options));

	// Only the clicked tile is remembered; the selection itself is re-read from
	// the current level. That is what keeps it honest for free — deleting a
	// belt empties it, and undoing the delete brings it back.
	let seed = $state<Coord | null>(null);
	let selection = $derived(seed && selected === 'select' ? selectAt(draft.level, seed) : null);

	/**
	 * Move the palette on to a free id once the level has claimed the one it
	 * was holding. Called from the keyboard and after every stroke; the palette
	 * does the same for its own clicks. A no-op unless there is work to do.
	 */
	function armBrush() {
		options = armIds(draft.level, selected, options);
	}

	function editSelection(patch: Partial<BrushOptions>) {
		if (!selection) return;
		const target = selection;
		draft.edit((level) => setSelectionOption(level, target, patch));
	}

	function removeSelection() {
		if (!selection) return;
		const doomed = selection;
		draft.edit((level) => deleteSelection(level, doomed));
	}

	let problems = $derived(validateLevel(draft.level));

	let saveForm: HTMLFormElement;
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let playAfterSave = false;

	const shortcutBrushes = BRUSH_GROUPS.flatMap((group) => group.ids).slice(0, 9);

	function save() {
		saveForm.requestSubmit();
	}

	function testPlay() {
		playAfterSave = true;
		save();
	}

	function onkeydown(event: KeyboardEvent) {
		const meta = event.metaKey || event.ctrlKey;

		if (meta && event.key.toLowerCase() === 's') {
			event.preventDefault();
			save();
			return;
		}

		// Everything below would fight with typing in the inspector.
		const target = event.target;
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		) {
			return;
		}

		if (meta && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) draft.redo();
			else draft.undo();
			return;
		}

		if (selection && (event.key === 'Backspace' || event.key === 'Delete')) {
			event.preventDefault();
			removeSelection();
			return;
		}

		if (event.key === 'Escape') {
			// One Escape drops the selection, a second reaches for the eraser.
			if (selection) seed = null;
			else selected = 'erase';
			return;
		}

		const slot = Number(event.key);
		if (slot >= 1 && slot <= shortcutBrushes.length) {
			selected = shortcutBrushes[slot - 1];
			armBrush();
		}
	}
</script>

<svelte:head>
	<title>{draft.level.name} · Level-Designer</title>
</svelte:head>

<svelte:window {onkeydown} />

<div class="shell">
	<Topbar>
		{#snippet left()}
			{#if data.owner}
				<a class="back" href="/admin/courses/{data.owner.courseId}">‹ {data.owner.courseTitle}</a>
				<span class="stage-crumb">{data.owner.stageTitle}</span>
			{:else}
				<!-- No course above it: this is a playground, so back goes to that list. -->
				<a class="back" href="/admin/playgrounds">‹ Playgrounds</a>
			{/if}
			<span class="name">{draft.level.name}</span>
			{#if !canEdit}
				<span class="chip">Nur lesen</span>
			{:else if draft.dirty}
				<span class="chip">Ungespeichert</span>
			{/if}
		{/snippet}

		{#snippet right()}
			<div class="history">
				<button
					class="btn btn-ghost icon"
					type="button"
					title="Rückgängig (⌘Z)"
					aria-label="Rückgängig"
					disabled={!draft.canUndo}
					onclick={() => draft.undo()}>⟲</button
				>
				<button
					class="btn btn-ghost icon"
					type="button"
					title="Wiederholen (⇧⌘Z)"
					aria-label="Wiederholen"
					disabled={!draft.canRedo}
					onclick={() => draft.redo()}>⟳</button
				>
			</div>

			<span class="problems" class:bad={problems.length > 0}>
				{problems.length === 0
					? 'Keine Probleme'
					: `${problems.length} ${problems.length === 1 ? 'Problem' : 'Probleme'}`}
			</span>

			<button class="btn btn-ghost" type="button" onclick={testPlay}>Testen</button>

			{#if canEdit}
				<button class="btn btn-ghost" type="button" onclick={() => (sharing = true)}>Teilen</button>
			{/if}

			<form
				bind:this={saveForm}
				method="POST"
				action="?/save"
				use:enhance={({ formData }) => {
					// The level lives in a rune, not in form fields — this is
					// the only place it becomes a payload.
					const submitted = draft.level;
					formData.set('level', JSON.stringify(submitted));
					saving = true;
					saveError = null;

					return async ({ result }) => {
						saving = false;

						if (result.type === 'success') {
							// Mark the level that was *submitted*, so anything
							// painted while the request was in flight stays dirty.
							draft.markSaved(submitted);
							if (playAfterSave) {
								playAfterSave = false;
								await goto(`/level/${data.level.id}`);
							}
							return;
						}

						playAfterSave = false;
						saveError =
							result.type === 'failure'
								? String(result.data?.message ?? 'Speichern fehlgeschlagen.')
								: 'Speichern fehlgeschlagen.';
					};
				}}
			>
				<button class="btn btn-primary" type="submit" disabled={saving || !canEdit}>
					{saving ? 'Speichern…' : 'Speichern'}
				</button>
			</form>
		{/snippet}
	</Topbar>

	{#if !canEdit}
		<div class="notice">
			<Callout>
				<strong>Dieses Level gehört einer anderen Lehrperson.</strong> Du siehst das Live-Original,
				spätere Änderungen erscheinen also auch hier. Um es zu ändern, füg deinem Kapitel eine Kopie
				statt einer Verknüpfung hinzu.
			</Callout>
		</div>
	{/if}

	{#if saveError}
		<p class="save-error">{saveError}</p>
	{/if}

	<div class="editor">
		<aside class="column">
			<Panel padding="sm">
				<TilePalette
					level={draft.level}
					bind:selected
					bind:options
					{selection}
					onedit={editSelection}
					ondelete={removeSelection}
				/>
			</Panel>
		</aside>

		<main class="stage">
			<DesignerCanvas
				{draft}
				{brush}
				{selection}
				onselect={(coord) => (seed = coord)}
				onstroke={armBrush}
			/>
		</main>

		<aside class="column">
			<Panel padding="sm">
				<h3 class="panel-title">Level</h3>
				<LevelInspector {draft} />
			</Panel>

			<Panel padding="sm">
				<h3 class="panel-title">Ziele</h3>
				<GoalEditor {draft} />
			</Panel>

			<Panel padding="sm">
				<h3 class="panel-title">Probleme</h3>
				<ValidationList {problems} />
			</Panel>
		</aside>
	</div>
</div>

<Modal bind:open={sharing} title="„{draft.level.name}“ teilen">
	<p class="share-note">
		Eine Lehrperson, mit der du teilst, kann dieses Level in ihre eigenen Kapitel aufnehmen — als
		<strong>Live-Verknüpfung</strong>, die deine Änderungen weiterhin übernimmt, oder als eigene,
		bearbeitbare Kopie. So oder so kann sie dieses hier nicht ändern.
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
		<p class="share-note">Noch mit niemandem geteilt.</p>
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

<style>
	.notice {
		padding: 12px 20px 0;
	}

	.share-note {
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

	.shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}

	.editor {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 210px minmax(0, 1fr) 290px;
		gap: 12px;
		padding: 12px;
	}

	.column {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.stage {
		min-width: 0;
		min-height: 0;
	}

	.panel-title {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 13px;
	}

	.back:hover {
		color: var(--accent);
	}

	.stage-crumb {
		color: var(--text-faint);
		font-size: 13px;
	}

	.name {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 15px;
		color: var(--text);
	}

	.history {
		display: flex;
		gap: 4px;
	}

	.icon {
		padding: 6px 10px;
		font-size: 14px;
		line-height: 1;
	}

	.icon:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.problems {
		font-size: 12px;
		color: var(--text-muted);
	}

	.problems.bad {
		color: var(--danger);
		font-weight: 600;
	}

	.save-error {
		margin: 0;
		padding: 8px 16px;
		font-size: 13px;
		color: var(--danger);
		background: var(--chip-bg);
	}
</style>
