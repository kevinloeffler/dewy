<script lang="ts">
	import { Panel } from '$lib/components/index.js';
	import type { ItemState } from '$lib/progress';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const dateFormat = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' });

	/**
	 * The course as columns.
	 *
	 * Numbered continuously across the whole course rather than restarting each
	 * stage, because that is the order a student walks it in and the number is
	 * what a teacher says out loud ("bist du schon bei 7?"). Empty stages produce
	 * no columns and so are left out of the header entirely.
	 */
	const groups = $derived(
		(data.progress?.outline.stages ?? [])
			.filter((stage) => stage.items.length > 0)
			.map((stage) => ({ id: stage.id, title: stage.title, items: stage.items }))
	);

	const columns = $derived(
		groups.flatMap((group) => group.items).map((item, index) => ({ item, number: index + 1 }))
	);

	const students = $derived(data.progress?.rows ?? []);
	const total = $derived(data.progress?.total ?? 0);

	/**
	 * Where the class is bunched: the item most of them are sitting on right now.
	 *
	 * Not the same question as "which item has the fewest completions" — that one
	 * always answers "the last one". A pile-up on a single item is the thing worth
	 * walking over to look at.
	 */
	const stuck = $derived.by(() => {
		const waiting = new Map<string, number>();
		for (const row of students) {
			if (!row.nextItemId) continue;
			waiting.set(row.nextItemId, (waiting.get(row.nextItemId) ?? 0) + 1);
		}

		let worst: { itemId: string; count: number } | null = null;
		for (const [itemId, count] of waiting) {
			if (!worst || count > worst.count) worst = { itemId, count };
		}
		// One or two students spread across a course is just a class in motion.
		return worst && worst.count > 1 ? worst : null;
	});

	const stuckColumn = $derived(columns.find((column) => column.item.id === stuck?.itemId));

	const finished = $derived(students.filter((row) => row.completedCount === total).length);

	// Two Marie Musters in one class is normal; a column of two identical names is
	// not readable. Only the ambiguous ones get their username spelled out.
	const duplicated = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const row of students) seen.set(row.name, (seen.get(row.name) ?? 0) + 1);
		return new Set([...seen].filter(([, count]) => count > 1).map(([name]) => name));
	});

	const labels: Record<ItemState, string> = {
		complete: 'erledigt',
		available: 'offen',
		locked: 'gesperrt'
	};

	const glyphs: Record<ItemState, string> = {
		complete: '●',
		available: '○',
		locked: '·'
	};

	function itemName(item: (typeof columns)[number]['item']): string {
		return item.kind === 'theory' ? item.title : item.name;
	}

	function cellTitle(row: (typeof students)[number], itemId: string): string {
		const state = row.state[itemId] ?? 'locked';
		const done = row.done[itemId];
		if (!done) return labels[state];

		const attempts = done.attempts === 1 ? '1 Versuch' : `${done.attempts} Versuche`;
		return `erledigt am ${dateFormat.format(done.completedAt)} · ${attempts}`;
	}
</script>

<svelte:head>
	<title>Fortschritt · {data.group.name} · Dewy</title>
</svelte:head>

<main class="page">
	<div class="head">
		<a class="back" href="/admin/classes/{data.group.id}">‹ {data.group.name}</a>
	</div>

	<h1 class="title">Fortschritt</h1>

	{#if data.trackable.length === 0}
		<Panel>
			<p class="empty">
				Es gibt noch keinen Kurs, den diese Klasse machen könnte. Weis der Klasse einen Kurs zu, dann
				steht hier, wie weit sie ist.
			</p>
		</Panel>
	{:else}
		<nav class="courses" aria-label="Kurs auswählen">
			{#each data.trackable as course (course.id)}
				<a
					class="course"
					class:is-current={course.id === data.selectedCourseId}
					aria-current={course.id === data.selectedCourseId ? 'page' : undefined}
					href="?courseId={course.id}"
				>
					{course.title}
					{#if !course.published}<span class="chip">Entwurf</span>{/if}
				</a>
			{/each}
		</nav>

		{#if students.length === 0}
			<Panel>
				<p class="empty">Niemand in dieser Klasse, dessen Fortschritt es zu zeigen gäbe.</p>
			</Panel>
		{:else if columns.length === 0}
			<Panel>
				<p class="empty">Dieser Kurs hat noch keine Elemente.</p>
			</Panel>
		{:else}
			<Panel padding="sm">
				<!--
					Read as a stat line rather than a sentence: "0 von 1 Schüler/in sind
					durch" makes German pick between a singular noun and a plural verb,
					and there is no phrasing that stays right for every count.
				-->
				<p class="summary">
					Fertig: <strong>{finished} von {students.length}</strong>
					· {total}
					{total === 1 ? 'Element' : 'Elemente'} im Kurs
					{#if stuck && stuckColumn}
						· <span class="warn"
							>{stuck.count} hängen bei {stuckColumn.number}
							„{itemName(stuckColumn.item)}“</span
						>
					{/if}
				</p>

				<div class="grid-wrap">
					<table class="grid">
						<thead>
							<tr>
								<th class="corner" rowspan="2" scope="col">Schüler/in</th>
								{#each groups as group (group.id)}
									<th class="stage" colspan={group.items.length} scope="colgroup">
										{group.title}
									</th>
								{/each}
								<th class="tally" rowspan="2" scope="col">Erledigt</th>
							</tr>
							<tr>
								{#each columns as column (column.item.id)}
									<th
										class="col"
										class:is-theory={column.item.kind === 'theory'}
										class:is-stuck={column.item.id === stuck?.itemId}
										scope="col"
										title="{itemName(column.item)}{column.item.kind === 'theory'
											? ' (Theorie)'
											: ''}"
									>
										{column.number}
									</th>
								{/each}
							</tr>
						</thead>

						<tbody>
							{#each students as row (row.id)}
								<tr>
									<th class="who" scope="row">
										<a class="link" href="/admin/people/{row.id}">{row.name}</a>
										{#if duplicated.has(row.name) && row.username}
											<span class="handle">{row.username}</span>
										{/if}
									</th>
									{#each columns as column (column.item.id)}
										{@const state = row.state[column.item.id] ?? 'locked'}
										<td
											class="cell is-{state}"
											class:is-next={row.nextItemId === column.item.id}
											title={cellTitle(row, column.item.id)}
										>
											<span aria-hidden="true">{glyphs[state]}</span>
											<span class="sr-only">{labels[state]}</span>
										</td>
									{/each}
									<td class="tally">{row.completedCount}/{total}</td>
								</tr>
							{/each}
						</tbody>

						<tfoot>
							<tr>
								<th class="who" scope="row">Klasse</th>
								{#each columns as column (column.item.id)}
									<td class="cell count" class:is-stuck={column.item.id === stuck?.itemId}>
										{data.progress?.doneByItem[column.item.id] ?? 0}
									</td>
								{/each}
								<td class="tally"></td>
							</tr>
						</tfoot>
					</table>
				</div>
			</Panel>

			<p class="legend">
				<span class="key is-complete">●</span> erledigt
				<span class="key is-available">○</span> offen
				<span class="key is-locked">·</span> gesperrt
				· Theorie-Elemente sind heller · die letzte Zeile zählt, wie viele der Klasse das Element
				geschafft haben
				{#if data.archivedCount > 0}
					· {data.archivedCount}
					{data.archivedCount === 1 ? 'archivierte/r Schüler/in' : 'archivierte Schüler/innen'} nicht
					mitgezählt
				{/if}
			</p>

			<Panel>
				<p class="caveat">
					Gezählt wird, was erledigt <em>wurde</em>. Ein offenes Element heisst „noch nicht fertig“ —
					nicht „noch nicht angefangen“: wer ein Level öffnet und stecken bleibt, hinterlässt bis zur
					Lösung keine Spur.
				</p>
			</Panel>
		{/if}
	{/if}
</main>

<style>
	.page {
		max-width: 1100px;
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

	.back {
		font-size: 0.875rem;
		color: var(--text-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--accent);
	}

	.title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 1.5rem;
		color: var(--text);
	}

	.empty {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	/* ── Course picker ─────────────────────────────────────── */

	.courses {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.course {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border: 1px solid var(--panel-border);
		border-radius: 999px;
		background: var(--panel);
		font-size: 0.875rem;
		color: var(--text-muted);
		text-decoration: none;
	}

	.course:hover {
		color: var(--text);
	}

	.course.is-current {
		border-color: var(--accent);
		color: var(--text);
	}

	.chip {
		font-size: 0.6875rem;
	}

	/* ── Summary ───────────────────────────────────────────── */

	.summary {
		margin: 0 0 12px;
		padding: 0 4px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.summary strong {
		color: var(--text);
	}

	.warn {
		color: var(--danger);
	}

	/* ── The grid ──────────────────────────────────────────── */

	.grid-wrap {
		overflow-x: auto;
	}

	.grid {
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.grid th {
		font-weight: 700;
		color: var(--text-faint);
	}

	.stage {
		padding: 0 8px 6px;
		font-size: 0.6875rem;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		text-align: left;
		white-space: nowrap;
		border-left: 1px solid var(--panel-border);
	}

	.col {
		width: 28px;
		padding: 0 0 8px;
		font-family: var(--font-code);
		font-size: 0.6875rem;
		text-align: center;
		font-weight: 500;
	}

	.col.is-theory {
		color: var(--text-faint);
		opacity: 0.55;
	}

	.col.is-stuck {
		color: var(--danger);
	}

	/* The name column stays put while the course scrolls past it. */
	.corner,
	.who {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--panel);
		text-align: left;
		white-space: nowrap;
		padding: 0 16px 8px 4px;
		font-size: 0.6875rem;
		letter-spacing: 0.6px;
		text-transform: uppercase;
	}

	.who {
		padding: 8px 16px 8px 4px;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.875rem;
		font-weight: 500;
		border-top: 1px solid var(--panel-border);
	}

	.handle {
		display: block;
		font-family: var(--font-code);
		font-size: 0.6875rem;
		font-weight: 400;
		color: var(--text-faint);
	}

	.link {
		color: var(--text);
		text-decoration: none;
	}

	.link:hover {
		color: var(--accent);
		text-decoration: underline;
	}

	.cell {
		padding: 8px 0;
		text-align: center;
		border-top: 1px solid var(--panel-border);
		line-height: 1;
	}

	.cell.is-complete {
		color: var(--success);
	}

	.cell.is-available {
		color: var(--text-muted);
	}

	.cell.is-locked {
		color: var(--text-faint);
		opacity: 0.5;
	}

	/* Where this student is right now. */
	.cell.is-next span[aria-hidden] {
		display: inline-block;
		border-radius: 999px;
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.tally {
		padding: 8px 4px 8px 16px;
		text-align: right;
		font-family: var(--font-code);
		font-size: 0.75rem;
		color: var(--text-muted);
		white-space: nowrap;
		border-top: 1px solid var(--panel-border);
	}

	tfoot .who,
	tfoot .cell {
		border-top: 1px solid var(--panel-border);
		color: var(--text-faint);
	}

	tfoot .count {
		font-family: var(--font-code);
		font-size: 0.75rem;
	}

	tfoot .count.is-stuck {
		color: var(--danger);
	}

	tbody tr:hover .cell,
	tbody tr:hover .who {
		background: var(--chip-bg);
	}

	/* ── Legend and caveat ─────────────────────────────────── */

	.legend {
		margin: 0;
		padding: 0 4px;
		font-size: 0.75rem;
		color: var(--text-faint);
	}

	.key {
		margin-left: 8px;
	}

	.key.is-complete {
		color: var(--success);
	}

	.key.is-available {
		color: var(--text-muted);
	}

	.caveat {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.55;
		color: var(--text-muted);
	}
</style>
