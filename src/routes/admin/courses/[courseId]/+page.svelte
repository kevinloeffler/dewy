<script lang="ts">
	import { enhance } from '$app/forms';
	import { Badge, Button, Callout, Modal, Panel, Topbar } from '$lib/components/index.js';
	import { markdownExcerpt } from '$lib/markdown';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const course = $derived(data.course);
	const itemCount = $derived(course.stages.reduce((total, s) => total + s.items.length, 0));

	/**
	 * False when this course reached us as a clone — a live read-only link to
	 * somebody else's work. Every control below keys off it, so read-only is one
	 * flag rather than a parallel template.
	 */
	const canEdit = $derived(data.canEdit);

	let newStage = $state('');
	// Keyed by stage id, so each stage's two "add" fields keep their own text.
	let newLevel = $state<Record<string, string>>({});
	let newTheory = $state<Record<string, string>>({});
	// Which shared level each stage's picker has selected.
	let borrowed = $state<Record<string, string>>({});

	let sharing = $state(false);
	const sharedWith = $derived(new Set(data.shares.map((row) => row.teacherId)));
	const shareable = $derived(data.teachers.filter((row) => !sharedWith.has(row.id)));
</script>

<svelte:head>
	<title>{course.title} · Dewy</title>
</svelte:head>

<Topbar>
	{#snippet left()}
		<a class="crumb" href="/admin/courses">Courses</a>
		<span class="crumb-sep">›</span>
		<span class="mission">{course.title}</span>
	{/snippet}
	{#snippet right()}
		{#if !canEdit}
			<span class="chip">Read-only</span>
		{:else if course.published}
			<Badge variant="chapter">Published</Badge>
		{:else}
			<span class="chip">Draft</span>
		{/if}

		{#if canEdit}
			<form method="POST" action="?/publish" use:enhance>
				<input type="hidden" name="published" value={course.published ? 'false' : 'true'} />
				<button class="btn btn-ghost" type="submit">
					{course.published ? 'Unpublish' : 'Publish'}
				</button>
			</form>
			<button class="btn btn-ghost" type="button" onclick={() => (sharing = true)}>Share</button>
		{/if}

		<form method="POST" action="?/duplicate" use:enhance>
			<button class="btn btn-ghost" type="submit">Take a copy</button>
		</form>

		<a class="btn btn-ghost" href="/courses/{course.id}">Preview</a>
	{/snippet}
</Topbar>

<main class="page">
	{#if !canEdit}
		<Callout>
			<strong>This course belongs to another teacher.</strong> You are seeing a live link to it, so
			their later edits show up here too. You can assign it to your classes and preview it; to change
			anything, take a copy.
		</Callout>
	{/if}

	{#if form?.message}
		<Callout variant="danger">{form.message}</Callout>
	{/if}

	<Panel>
		<h2 class="section-title">Course details</h2>
		<form class="details" method="POST" action="?/updateCourse" use:enhance>
			<input
				class="field"
				name="title"
				value={course.title}
				autocomplete="off"
				disabled={!canEdit}
			/>
			<textarea
				class="field"
				name="description"
				rows="2"
				placeholder="What this course covers"
				disabled={!canEdit}>{course.description ?? ''}</textarea
			>
			{#if canEdit}
				<div class="details-actions">
					<Button type="submit">Save</Button>
				</div>
			{/if}
		</form>
	</Panel>

	<div class="heading-row">
		<h2 class="section-title">
			Stages
			<span class="count">{course.stages.length} stages · {itemCount} items</span>
		</h2>
		{#if canEdit}
			<form class="add-stage" method="POST" action="?/addStage" use:enhance>
				<input
					class="field"
					name="title"
					placeholder="New stage name"
					bind:value={newStage}
					autocomplete="off"
				/>
				<Button type="submit" variant="ghost">Add stage</Button>
			</form>
		{/if}
	</div>

	{#if course.stages.length === 0}
		<Panel>
			<p class="empty">
				No stages yet. A stage is a chunk of the course — add one above, then fill it with levels
				and theory blocks.
			</p>
		</Panel>
	{/if}

	{#each course.stages as stage, stageIndex (stage.id)}
		<Panel>
			<header class="stage-head">
				<form class="stage-title" method="POST" action="?/updateStage" use:enhance>
					<input type="hidden" name="id" value={stage.id} />
					<span class="stage-index">{stageIndex + 1}</span>
					<input
						class="field field-inline"
						name="title"
						value={stage.title}
						autocomplete="off"
						disabled={!canEdit}
					/>
					{#if canEdit}
						<button class="btn btn-ghost" type="submit">Rename</button>
					{/if}
				</form>

				<div class="stage-actions" class:is-hidden={!canEdit}>
					<form method="POST" action="?/moveStage" use:enhance>
						<input type="hidden" name="id" value={stage.id} />
						<input type="hidden" name="direction" value="up" />
						<button class="btn btn-ghost" type="submit" disabled={stageIndex === 0} title="Move up"
							>↑</button
						>
					</form>
					<form method="POST" action="?/moveStage" use:enhance>
						<input type="hidden" name="id" value={stage.id} />
						<input type="hidden" name="direction" value="down" />
						<button
							class="btn btn-ghost"
							type="submit"
							disabled={stageIndex === course.stages.length - 1}
							title="Move down">↓</button
						>
					</form>
					<form method="POST" action="?/deleteStage" use:enhance>
						<input type="hidden" name="id" value={stage.id} />
						<button class="btn btn-ghost danger" type="submit">Delete stage</button>
					</form>
				</div>
			</header>

			{@const previous = stageIndex === 0 ? null : course.stages[stageIndex - 1]}
			{@const previousLevels = previous?.items.filter((i) => i.kind === 'level').length ?? 0}
			<div class="rules">
				<form class="rule" method="POST" action="?/gateStage" use:enhance>
					<input type="hidden" name="id" value={stage.id} />
					<input type="hidden" name="gated" value={stage.gated ? 'false' : 'true'} />
					<label class="rule-toggle">
						<input
							type="checkbox"
							checked={stage.gated}
							disabled={previous === null || !canEdit}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						/>
						<span>Gate this stage</span>
					</label>
					<span class="rule-note">
						{#if previous === null}
							The first stage has nothing in front of it.
						{:else if previousLevels === 0}
							“{previous.title}” has no levels yet, so this gate would stay open.
						{:else if stage.gated}
							Shut until all {previousLevels}
							{previousLevels === 1 ? 'level' : 'levels'} in “{previous.title}” are complete.
						{:else}
							Off — students reach this stage item by item, as usual.
						{/if}
					</span>
				</form>

				<form class="rule" method="POST" action="?/orderStage" use:enhance>
					<input type="hidden" name="id" value={stage.id} />
					<input type="hidden" name="ordered" value={stage.ordered ? 'false' : 'true'} />
					<label class="rule-toggle">
						<input
							type="checkbox"
							checked={stage.ordered}
							disabled={!canEdit}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						/>
						<span>Keep this stage in order</span>
					</label>
					<span class="rule-note">
						{#if stage.ordered}
							Items open one at a time, top to bottom.
						{:else}
							Off — the stage opens at once, and the next one waits for all of it.
						{/if}
					</span>
				</form>
			</div>

			{#if stage.items.length === 0}
				<p class="empty indent">Empty stage — add a level or a theory block below.</p>
			{:else}
				<ol class="items">
					{#each stage.items as item, itemIndex (item.id)}
						<li class="item">
							<span class="item-kind" class:is-theory={item.kind === 'theory'}>
								{item.kind === 'theory' ? 'Text' : 'Level'}
							</span>

							<div class="item-text">
								{#if item.kind === 'theory'}
									<a class="item-name" href="/admin/courses/{course.id}/theory/{item.id}"
										>{item.title}</a
									>
									<p class="item-meta">{markdownExcerpt(item.body, 90)}</p>
								{:else}
									<a class="item-name" href="/designer/{item.levelId}">{item.name}</a>
									{#if item.linked}
										<span class="chip">Shared</span>
									{/if}
									{#if item.description}
										<p class="item-meta">{item.description}</p>
									{/if}
								{/if}
							</div>

							<div class="item-actions" class:is-hidden={!canEdit}>
								<form method="POST" action="?/moveItem" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<input type="hidden" name="direction" value="up" />
									<button
										class="btn btn-ghost"
										type="submit"
										disabled={itemIndex === 0}
										title="Move up">↑</button
									>
								</form>
								<form method="POST" action="?/moveItem" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										class="btn btn-ghost"
										type="submit"
										disabled={itemIndex === stage.items.length - 1}
										title="Move down">↓</button
									>
								</form>
								{#if item.kind === 'theory'}
									<a class="btn btn-ghost" href="/admin/courses/{course.id}/theory/{item.id}">Edit</a>
								{:else}
									<a class="btn btn-ghost" href="/designer/{item.levelId}">
										{item.linked ? 'View' : 'Edit'}
									</a>
								{/if}
								<form method="POST" action="?/deleteItem" use:enhance>
									<input type="hidden" name="id" value={item.id} />
									<button class="btn btn-ghost danger" type="submit">Remove</button>
								</form>
							</div>
						</li>
					{/each}
				</ol>
			{/if}

			{#if canEdit}
				<footer class="stage-add">
					<form method="POST" action="?/addLevel" use:enhance>
						<input type="hidden" name="stageId" value={stage.id} />
						<input
							class="field"
							name="name"
							placeholder="New level name"
							bind:value={newLevel[stage.id]}
							autocomplete="off"
						/>
						<button class="btn btn-ghost" type="submit">+ Level</button>
					</form>
					<form method="POST" action="?/addTheory" use:enhance>
						<input type="hidden" name="stageId" value={stage.id} />
						<input
							class="field"
							name="title"
							placeholder="New theory block title"
							bind:value={newTheory[stage.id]}
							autocomplete="off"
						/>
						<button class="btn btn-ghost" type="submit">+ Text</button>
					</form>

					{#if data.sharedLevels.length > 0}
						<form class="borrow" method="POST" use:enhance>
							<input type="hidden" name="stageId" value={stage.id} />
							<select class="field" name="levelId" bind:value={borrowed[stage.id]}
								aria-label="Shared level">
								<option value="">A level someone shared…</option>
								{#each data.sharedLevels as level (level.id)}
									<option value={level.id}>
										{level.name}{level.ownerName ? ` · ${level.ownerName}` : ''}
									</option>
								{/each}
							</select>
							<button
								class="btn btn-ghost"
								type="submit"
								formaction="?/linkLevel"
								disabled={!borrowed[stage.id]}
								title="Adds a live link. Its author keeps editing it; you cannot."
							>
								Link
							</button>
							<button
								class="btn btn-ghost"
								type="submit"
								formaction="?/copyLevel"
								disabled={!borrowed[stage.id]}
								title="Adds your own editable duplicate."
							>
								Copy
							</button>
						</form>
					{/if}
				</footer>
			{/if}
		</Panel>
	{/each}

	{#if canEdit}
		<Panel>
			<h2 class="section-title">Danger zone</h2>
			<div class="danger-zone">
				<p class="empty">
					Deleting this course also deletes every stage, theory block and level inside it.
				</p>
				<form method="POST" action="?/deleteCourse" use:enhance>
					<button class="btn btn-ghost danger" type="submit">Delete course</button>
				</form>
			</div>
		</Panel>
	{/if}
</main>

<Modal bind:open={sharing} title="Share “{course.title}”">
	<p class="share-note">
		A shared teacher sees this course as a <strong>live link</strong> — your later edits reach them
		— and can assign it to their classes, but cannot change it. They can always take their own
		editable copy.
	</p>

	{#if data.shares.length > 0}
		<ul class="share-list">
			{#each data.shares as row (row.teacherId)}
				<li>
					<span>{row.name}</span>
					<form method="POST" action="?/unshare" use:enhance>
						<input type="hidden" name="teacherId" value={row.teacherId} />
						<button class="btn btn-ghost" type="submit">Revoke</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="share-note">Not shared with anyone yet.</p>
	{/if}

	{#if shareable.length > 0}
		<form class="share-add" method="POST" action="?/share" use:enhance>
			<select class="field" name="teacherId" aria-label="Teacher to share with">
				{#each shareable as teacher (teacher.id)}
					<option value={teacher.id}>{teacher.name}</option>
				{/each}
			</select>
			<Button type="submit" variant="ghost">Share</Button>
		</form>
	{/if}
</Modal>

<style>
	.crumb {
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
	}

	.crumb:hover {
		color: var(--text);
	}

	.crumb-sep {
		color: var(--text-faint);
		font-size: 0.8125rem;
	}

	.mission {
		font-weight: 700;
		font-size: 0.875rem;
	}

	/* Read-only keeps the layout — the controls go, the rows do not shift. */
	.is-hidden {
		visibility: hidden;
	}

	.borrow {
		display: flex;
		gap: 6px;
		align-items: center;
		flex: 1;
		min-width: 260px;
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

	.page {
		max-width: 940px;
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
		margin: 0;
	}

	.count {
		font-family: var(--font-ui);
		font-weight: 400;
		font-size: 13px;
		color: var(--text-faint);
		margin-left: 8px;
	}

	.heading-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-top: 8px;
	}

	.details,
	.add-stage,
	.stage-add form {
		display: flex;
		gap: 10px;
	}

	.details {
		flex-direction: column;
		margin-top: 12px;
	}

	.details-actions {
		display: flex;
		justify-content: flex-end;
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
		resize: vertical;
	}

	.field:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.field-inline {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 16px;
	}

	.stage-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}

	.stage-title {
		flex: 1;
		align-items: center;
		min-width: 260px;
	}

	.stage-index {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		color: var(--text-faint);
		min-width: 18px;
	}

	.stage-actions,
	.item-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.rules {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 10px;
	}

	.rule {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.rule-toggle {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		min-width: 210px;
	}

	.rule-toggle:has(input:disabled) {
		opacity: 0.5;
	}

	.rule-note {
		font-size: 13px;
		color: var(--text-muted);
	}

	.items {
		list-style: none;
		margin: 14px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 6px);
		flex-wrap: wrap;
	}

	.item-kind {
		font-family: var(--font-code);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 3px 9px;
		white-space: nowrap;
	}

	.item-kind.is-theory {
		color: var(--text-muted);
		background: var(--chip-bg);
	}

	.item-text {
		flex: 1;
		min-width: 200px;
	}

	.item-name {
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
	}

	.item-name:hover {
		color: var(--accent);
	}

	.item-meta {
		margin: 3px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}

	.stage-add {
		display: flex;
		gap: 16px;
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px solid var(--panel-border);
		flex-wrap: wrap;
	}

	.stage-add form {
		flex: 1;
		min-width: 240px;
	}

	.danger-zone {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-top: 12px;
		flex-wrap: wrap;
	}

	.danger {
		color: var(--danger);
	}

	.empty {
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}

	.indent {
		margin-top: 12px;
	}
</style>
