<script lang="ts" module>
	import type { CodeConstraint, CodeConstruct, ConstraintOperator } from '$lib/game/level';

	/**
	 * One row as the designer edits it. The stored shape is just `count` or
	 * `name`; "Muss verwenden" and "Darf nicht verwenden" are `count` rules
	 * with `min 1` and `max 0`, kept as their own mode so switching a row to
	 * "Anzahl" does not snap straight back.
	 */
	export type ConstraintRow = {
		mode: 'use' | 'forbid' | 'count' | 'name';
		/** `construct:<name>` or `call:<name>`. */
		target: string;
		operator: ConstraintOperator;
		count: number;
		declaration: 'variable' | 'function';
		name: string;
		message: string;
	};

	export function toRow(constraint: CodeConstraint): ConstraintRow {
		const row: ConstraintRow = {
			mode: 'use',
			target: 'construct:if',
			operator: 'min',
			count: 1,
			declaration: 'variable',
			name: '',
			message: constraint.message ?? ''
		};
		if (constraint.kind === 'name') {
			return { ...row, mode: 'name', declaration: constraint.declaration, name: constraint.name };
		}
		const { target, operator, count } = constraint;
		const key = target.kind === 'construct' ? `construct:${target.construct}` : `call:${target.name}`;
		const mode =
			operator === 'min' && count === 1 ? 'use' : operator === 'max' && count === 0 ? 'forbid' : 'count';
		return { ...row, mode, target: key, operator, count };
	}

	export function fromRow(row: ConstraintRow): CodeConstraint {
		const message = row.message.trim() || null;
		if (row.mode === 'name') {
			return { kind: 'name', declaration: row.declaration, name: row.name.trim(), message };
		}
		const [kind, value] = row.target.split(':');
		const target =
			kind === 'construct'
				? { kind: 'construct' as const, construct: value as CodeConstruct }
				: { kind: 'call' as const, name: value };
		const [operator, count] =
			row.mode === 'use'
				? (['min', 1] as const)
				: row.mode === 'forbid'
					? (['max', 0] as const)
					: [row.operator, Math.max(0, Math.floor(row.count) || 0)];
		return { kind: 'count', target, operator, count, message };
	}

	export function newRow(): ConstraintRow {
		return toRow({
			kind: 'count',
			target: { kind: 'construct', construct: 'if' },
			operator: 'min',
			count: 1,
			message: null
		});
	}
</script>

<script lang="ts">
	import {
		CODE_CONSTRUCTS,
		CONSTRAINT_ACTIONS,
		CONSTRAINT_SENSORS,
		CONSTRUCT_NAME,
		constraintLabel,
		constraintProblems
	} from '$lib/game/constraints';
	import type { LevelOptions } from '$lib/game/level';
	import CodeText from '$lib/components/CodeText.svelte';

	interface Props {
		rows: ConstraintRow[];
		/** For the warnings — stage and memory decide what is satisfiable. */
		options: LevelOptions;
	}

	let { rows = $bindable(), options }: Props = $props();

	const built = $derived(rows.map(fromRow));
	const problems = $derived(constraintProblems({ options, constraints: built }));

	const OPERATOR_LABEL: Record<ConstraintOperator, string> = {
		min: 'mindestens',
		max: 'höchstens',
		eq: 'genau'
	};

	function remove(index: number) {
		rows = rows.filter((_, i) => i !== index);
	}
</script>

<div class="rules">
	<p class="intro">
		Regeln dazu, <em>womit</em> das Programm geschrieben ist. Gezählt wird, was im Code steht – nicht,
		wie oft es läuft. Verbote und Höchstzahlen sperren den Start; Pflichten müssen erst zum Lösen
		erfüllt sein.
	</p>

	{#if rows.length === 0}
		<p class="empty">Noch keine Regeln.</p>
	{:else}
		<ul class="rows">
			{#each rows as row, index (index)}
				<li class="row">
					<div class="line">
						<div class="fields">
							<select bind:value={row.mode} aria-label="Art der Regel">
								<option value="use">Muss verwenden</option>
								<option value="forbid">Darf nicht verwenden</option>
								<option value="count">Anzahl</option>
								<option value="name">Name existiert</option>
							</select>

							{#if row.mode === 'name'}
								<select bind:value={row.declaration} aria-label="Was deklariert wird">
									<option value="variable">Variable</option>
									<option value="function">Funktion</option>
								</select>
								<input class="name" bind:value={row.name} placeholder="Name" aria-label="Name" />
							{:else}
								{#if row.mode === 'count'}
									<select bind:value={row.operator} aria-label="Vergleich">
										{#each ['min', 'max', 'eq'] as const as operator (operator)}
											<option value={operator}>{OPERATOR_LABEL[operator]}</option>
										{/each}
									</select>
									<input
										class="count"
										type="number"
										min="0"
										bind:value={row.count}
										aria-label="Anzahl"
									/>
								{/if}
								<select bind:value={row.target} aria-label="Was gezählt wird">
									<optgroup label="Sprache">
										{#each CODE_CONSTRUCTS as construct (construct)}
											<option value={`construct:${construct}`}>
												{CONSTRUCT_NAME[construct].replaceAll('`', '')}
											</option>
										{/each}
									</optgroup>
									<optgroup label="Befehle">
										{#each CONSTRAINT_ACTIONS as name (name)}
											<option value={`call:${name}`}>{name}()</option>
										{/each}
									</optgroup>
									<optgroup label="Sensoren">
										{#each CONSTRAINT_SENSORS as name (name)}
											<option value={`call:${name}`}>{name}()</option>
										{/each}
									</optgroup>
								</select>
							{/if}
						</div>

						<button
							class="btn btn-ghost remove"
							type="button"
							onclick={() => remove(index)}
							aria-label="Regel entfernen"
							title="Regel entfernen">×</button
						>
					</div>

					<input
						class="message"
						bind:value={row.message}
						placeholder={constraintLabel(built[index]).replaceAll('`', '')}
						aria-label="Text für die Lernenden"
					/>
				</li>
			{/each}
		</ul>
	{/if}

	<button class="btn btn-ghost add" type="button" onclick={() => (rows = [...rows, newRow()])}>
		Regel hinzufügen
	</button>

	{#if problems.length > 0}
		<ul class="problems">
			{#each problems as problem, index (index)}
				<li><CodeText text={problem} /></li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.rules {
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-size: 13px;
	}

	.intro,
	.empty {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 8px);
	}

	.line {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.fields {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	select,
	input {
		font: inherit;
		font-family: var(--font-ui);
		font-size: 13px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 8px);
		padding: 6px 8px;
	}

	.count {
		width: 64px;
	}

	.name {
		flex: 1;
		min-width: 120px;
		font-family: var(--font-code);
	}

	.message {
		width: 100%;
	}

	.remove {
		flex-shrink: 0;
		padding: 4px 10px;
	}

	.add {
		align-self: flex-start;
		padding: 5px 10px;
		font-size: 12px;
	}

	.problems {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.problems li {
		font-size: 12px;
		line-height: 1.45;
		border-left: 2px solid var(--danger);
		padding-left: 8px;
	}
</style>
