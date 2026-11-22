<script lang="ts" module>
	/** What a page hands in: `LlmConfigView` from `$lib/server/llm/config`, as it crosses to the browser. */
	export interface LlmConfigSummary {
		baseUrl: string;
		model: string;
		reasoningEffort: string | null;
		keyHint: string;
		keyReadable: boolean;
		lastError: string | null;
		lastErrorAt: Date | null;
		lastOkAt: Date | null;
		updatedAt: Date;
	}
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { REASONING_EFFORTS } from '$lib/llm';
	import Button from './Button.svelte';
	import Callout from './Callout.svelte';
	import Field from './Field.svelte';
	import Select, { type SelectOption } from './Select.svelte';

	/**
	 * Editing one LLM config: the school's default or a course's override.
	 *
	 * The key field is write-only. It starts empty whatever is stored, the hint
	 * says which key that is, and leaving it empty on save keeps it. The page's
	 * actions decide where a save goes; this only names them.
	 */
	interface Props {
		config: LlmConfigSummary | null;
		/** Form actions, e.g. `?/saveLlm`. */
		saveAction: string;
		testAction: string;
		clearAction: string;
		/** The last action's answer, from the page's `form`. */
		message?: string | null;
		ok?: boolean;
		disabled?: boolean;
		/** Placeholder for the base URL. */
		urlPlaceholder?: string;
		clearLabel?: string;
	}

	let {
		config,
		saveAction,
		testAction,
		clearAction,
		message = null,
		ok = false,
		disabled = false,
		urlPlaceholder = 'https://api.openai.com/v1',
		clearLabel = 'Entfernen'
	}: Props = $props();

	// Seeded once per stored version. A save changes `updatedAt`, and the page
	// re-mounts this through its `{#key}`, so the fields show what was stored.
	// svelte-ignore state_referenced_locally
	let baseUrl = $state(config?.baseUrl ?? '');
	// svelte-ignore state_referenced_locally
	let model = $state(config?.model ?? '');
	// svelte-ignore state_referenced_locally
	let effort = $state(config?.reasoningEffort ?? '');
	let apiKey = $state('');
	let busy = $state(false);

	const effortOptions: SelectOption[] = [
		{ value: '', label: 'Nicht senden', hint: 'Für Modelle ohne Reasoning' },
		...REASONING_EFFORTS.map((value) => ({ value, label: value }))
	];

	const time = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short' });

	const keyPlaceholder = $derived(
		config?.keyReadable
			? `•••• ${config.keyHint || 'gespeichert'} (leer lassen zum Behalten)`
			: 'sk-…'
	);

	/** Keeps what was typed when a save is refused; the test is slow, so say it is running. */
	const submit: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<div class="llm">
	{#if config}
		<dl class="status">
			<dt>Modell</dt>
			<dd>{config.model}{config.reasoningEffort ? ` · ${config.reasoningEffort}` : ''}</dd>
			<dt>Zuletzt erfolgreich</dt>
			<dd>{config.lastOkAt ? time.format(config.lastOkAt) : '–'}</dd>
		</dl>
		{#if !config.keyReadable}
			<Callout variant="warn">
				Der gespeicherte API-Schlüssel lässt sich nicht mehr entschlüsseln, wahrscheinlich weil
				<code>LLM_SECRET_KEY</code> geändert wurde. Gib ihn neu ein.
			</Callout>
		{:else if config.lastError}
			<Callout variant="warn">
				<strong>Letzter Fehler</strong>
				{config.lastErrorAt ? `(${time.format(config.lastErrorAt)})` : ''}: {config.lastError}
			</Callout>
		{/if}
	{/if}

	{#if message}
		<Callout variant={ok ? 'info' : 'danger'}>{message}</Callout>
	{/if}

	<form class="fields" method="POST" action={saveAction} use:enhance={submit}>
		<Field
			label="Basis-URL"
			name="baseUrl"
			bind:value={baseUrl}
			placeholder={urlPlaceholder}
			hint="Ein Endpunkt, der die OpenAI Chat Completions API spricht."
			autocomplete="off"
			required
			{disabled}
		/>
		<Field
			label="API-Schlüssel"
			name="apiKey"
			type="password"
			bind:value={apiKey}
			placeholder={keyPlaceholder}
			autocomplete="new-password"
			required={!config?.keyReadable}
			{disabled}
		/>
		<Field
			label="Modell"
			name="model"
			bind:value={model}
			placeholder="z. B. gpt-5-mini"
			autocomplete="off"
			required
			{disabled}
		/>
		<Select
			label="Reasoning-Effort"
			name="reasoningEffort"
			options={effortOptions}
			bind:value={effort}
			searchable={false}
			hint="Optional. Nur für Modelle, die es unterstützen."
			{disabled}
		/>

		<div class="actions">
			<Button type="submit" disabled={disabled || busy}>
				{busy ? 'Wird getestet …' : 'Testen und speichern'}
			</Button>
			{#if config}
				<button class="btn btn-ghost" type="submit" formaction={testAction} formnovalidate disabled={disabled || busy}>
					Gespeicherten testen
				</button>
				<button
					class="btn btn-danger push-right"
					type="submit"
					formaction={clearAction}
					formnovalidate
					disabled={disabled || busy}
				>
					{clearLabel}
				</button>
			{/if}
		</div>
	</form>
</div>

<style>
	.llm {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.status {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 16px;
		margin: 0;
		font-size: 0.875rem;
	}

	.status dt {
		color: var(--text-muted);
	}

	.status dd {
		margin: 0;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-top: 4px;
	}

	.push-right {
		margin-left: auto;
	}
</style>
