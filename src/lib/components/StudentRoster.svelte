<script lang="ts">
	import Button from './Button.svelte';
	import { assignUsernames, parseRoster } from '$lib/roster';

	interface Props {
		/**
		 * Every username already spoken for. The preview resolves against these
		 * *and* against the rest of the paste, so it cannot promise a handle the
		 * server would not mint.
		 */
		taken: string[];
		/** Bound, so a caller can empty the box once a batch has landed whole. */
		value?: string;
		submitting?: boolean;
		error?: string;
	}

	let { taken, value = $bindable(''), submitting = false, error }: Props = $props();

	// The same two functions the server runs on submit.
	const preview = $derived(assignUsernames(parseRoster(value), taken));

	const uid = $props.id();
</script>

<div class="roster">
	<label class="field-label" for={uid}>Namen</label>
	<textarea
		class="field"
		id={uid}
		name="roster"
		rows="10"
		placeholder={'Marie Muster\nTom Meier\nAylin Yilmaz'}
		bind:value
	></textarea>
	<p class="field-hint">
		Eine Person pro Zeile. Benutzernamen und Passwörter werden automatisch erzeugt. Willst du einen
		Benutzernamen selbst festlegen, schreib ihn nach einem Komma:
		<code>Marie Muster, mmuster</code>
	</p>

	{#if preview.length > 0}
		<div class="preview">
			<h2 class="preview-title">
				{preview.length}
				{preview.length === 1 ? 'Schüler/in' : 'Schüler/innen'}
			</h2>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr>
							<th>Name</th>
							<th>Benutzername</th>
						</tr>
					</thead>
					<tbody>
						{#each preview as row, index (index)}
							<tr>
								<td>{row.name}</td>
								<td class="mono">{row.username}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	{#if error}
		<p class="field-error">{error}</p>
	{/if}

	<Button type="submit" disabled={submitting || preview.length === 0}>
		{submitting
			? 'Wird erstellt…'
			: `${preview.length || ''} ${preview.length === 1 ? 'Konto' : 'Konten'} erstellen`}
	</Button>
</div>

<style>
	.preview {
		margin-top: 16px;
		border-top: 1px solid var(--panel-border);
		padding-top: 14px;
	}

	.preview-title {
		margin: 0 0 8px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.table-wrap {
		overflow-x: auto;
		max-height: 320px;
		overflow-y: auto;
	}

	.mono {
		font-family: var(--font-code);
		font-size: 0.8125rem;
	}

	.roster :global(.btn) {
		margin-top: 18px;
	}
</style>
