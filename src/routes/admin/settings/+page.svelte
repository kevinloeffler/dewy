<script lang="ts">
	import { Callout, LlmConfigForm } from '$lib/components/index.js';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Einstellungen · Dewy</title>
</svelte:head>

<main class="page">
	<header class="head">
		<h1 class="head-title">Einstellungen</h1>
	</header>

	<section class="panel card">
		<h2 class="card-title">KI-Anbieter</h2>
		<p class="hint">
			Der Standard für die ganze Schule, z. B. für Erklärungen von Fehlermeldungen, Feedback oder
			das Bewerten von Lösungen. Lehrpersonen können für ihre eigenen Kurse einen eigenen Anbieter
			eintragen. Fällt er aus, springt dieser ein. Ohne Standard sind die KI-Funktionen überall
			ausgeschaltet, wo kein Kurs einen eigenen Anbieter hat.
		</p>

		{#if !data.secretKeyConfigured}
			<Callout variant="warn">
				Auf dem Server ist <code>LLM_SECRET_KEY</code> nicht gesetzt. Ohne ihn können keine
				API-Schlüssel gespeichert werden. Erzeuge einen mit <code>openssl rand -base64 32</code>.
			</Callout>
		{/if}

		{#key data.llm?.updatedAt}
			<LlmConfigForm
				config={data.llm}
				saveAction="?/saveLlm"
				testAction="?/testLlm"
				clearAction="?/clearLlm"
				message={form?.llm?.message}
				ok={form?.llm?.ok}
				disabled={!data.secretKeyConfigured}
				urlPlaceholder="https://api.openai.com/v1 oder http://localhost:11434/v1"
			/>
		{/key}
	</section>
</main>

<style>
	.page {
		max-width: 929px;
		margin: 0 auto;
		padding: 44px 32px 80px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.head-title {
		font-size: 1.375rem;
		font-weight: 700;
	}

	.card {
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.card-title {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.hint {
		font-size: 0.875rem;
		color: var(--text-muted);
	}
</style>
