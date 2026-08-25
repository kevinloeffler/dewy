<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { Panel, Topbar } from '$lib/components/index.js';
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
		type BrushId
	} from '$lib/game/editor/brush';
	import { validateLevel } from '$lib/game/rules';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	// Created once. Re-deriving it whenever `data` is invalidated would throw
	// away the undo history along with any unsaved work.
	const draft = createLevelDraft(untrack(() => data.level));

	let selected = $state<BrushId>('wall');
	let options = $state(defaultBrushOptions());
	let brush = $derived(buildBrush(selected, options));

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

		if (event.key === 'Escape') {
			selected = 'erase';
			return;
		}

		const slot = Number(event.key);
		if (slot >= 1 && slot <= shortcutBrushes.length) selected = shortcutBrushes[slot - 1];
	}
</script>

<svelte:head>
	<title>{draft.level.name} · Level designer</title>
</svelte:head>

<svelte:window {onkeydown} />

<div class="shell">
	<Topbar>
		{#snippet left()}
			{#if data.owner}
				<a class="back" href="/admin/courses/{data.owner.courseId}">‹ {data.owner.courseTitle}</a>
				<span class="stage-crumb">{data.owner.stageTitle}</span>
			{:else}
				<a class="back" href="/admin/courses">‹ Courses</a>
			{/if}
			<span class="name">{draft.level.name}</span>
			{#if draft.dirty}
				<span class="chip">Unsaved</span>
			{/if}
		{/snippet}

		{#snippet right()}
			<div class="history">
				<button
					class="btn btn-ghost icon"
					type="button"
					title="Undo (⌘Z)"
					aria-label="Undo"
					disabled={!draft.canUndo}
					onclick={() => draft.undo()}>⟲</button
				>
				<button
					class="btn btn-ghost icon"
					type="button"
					title="Redo (⇧⌘Z)"
					aria-label="Redo"
					disabled={!draft.canRedo}
					onclick={() => draft.redo()}>⟳</button
				>
			</div>

			<span class="problems" class:bad={problems.length > 0}>
				{problems.length === 0 ? 'No problems' : `${problems.length} problem${problems.length === 1 ? '' : 's'}`}
			</span>

			<button class="btn btn-ghost" type="button" onclick={testPlay}>Test play</button>

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
								? String(result.data?.message ?? 'Save failed.')
								: 'Save failed.';
					};
				}}
			>
				<button class="btn btn-primary" type="submit" disabled={saving}>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</form>
		{/snippet}
	</Topbar>

	{#if saveError}
		<p class="save-error">{saveError}</p>
	{/if}

	<div class="editor">
		<aside class="column">
			<Panel padding="sm">
				<TilePalette level={draft.level} bind:selected bind:options />
			</Panel>
		</aside>

		<main class="stage">
			<DesignerCanvas {draft} {brush} />
		</main>

		<aside class="column">
			<Panel padding="sm">
				<h3 class="panel-title">Level</h3>
				<LevelInspector {draft} />
			</Panel>

			<Panel padding="sm">
				<h3 class="panel-title">Goals</h3>
				<GoalEditor {draft} />
			</Panel>

			<Panel padding="sm">
				<h3 class="panel-title">Problems</h3>
				<ValidationList {problems} />
			</Panel>
		</aside>
	</div>
</div>

<style>
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
