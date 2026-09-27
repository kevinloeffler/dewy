<script lang="ts">
	import { isImageType, MAX_IMAGE_BYTES } from '$lib/images';
	import { MARKDOWN_FEATURES, renderMarkdown } from '$lib/markdown';
	import Panel from './Panel.svelte';

	/**
	 * Markdown source beside a live preview — the theory block editor and the
	 * designer's level instructions share it, so both are written against the
	 * same renderer and the same documented subset.
	 */
	interface Props {
		value?: string;
		placeholder?: string;
		/** Rendered as the preview's `<h1>`, e.g. a theory block's title. */
		heading?: string;
		/** Starting height of the source textarea; it stays resizable. */
		minHeight?: string;
	}

	let { value = $bindable(''), placeholder, heading, minHeight = '460px' }: Props = $props();

	// The same renderer the student page uses, so the preview cannot drift.
	const preview = $derived(renderMarkdown(value));

	let showHelp = $state(false);

	// ── Image upload by drop or paste ──────────────────────────
	let textarea = $state<HTMLTextAreaElement>();
	let dragging = $state(false);
	let uploadError = $state<string | null>(null);
	let pendingUploads = 0;

	function imagesIn(files: FileList | null | undefined): File[] {
		return Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
	}

	function hasFiles(event: DragEvent): boolean {
		return event.dataTransfer?.types.includes('Files') ?? false;
	}

	function ondragover(event: DragEvent) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		dragging = true;
	}

	function ondrop(event: DragEvent) {
		dragging = false;
		const files = imagesIn(event.dataTransfer?.files);
		if (files.length === 0) return;
		event.preventDefault();
		// A drop moves the caret to the drop point before this fires, so the
		// selection is where the image belongs.
		insertImages(files);
	}

	function onpaste(event: ClipboardEvent) {
		const files = imagesIn(event.clipboardData?.files);
		if (files.length === 0) return;
		event.preventDefault();
		insertImages(files);
	}

	function insertImages(files: File[]) {
		uploadError = null;
		const at = textarea?.selectionStart ?? value.length;

		const placeholders = files.map((file) => `![Wird hochgeladen: ${altFor(file)} #${++pendingUploads}]()`);
		const inserted = placeholders.join('\n');
		value = value.slice(0, at) + inserted + value.slice(textarea?.selectionEnd ?? at);

		files.forEach((file, i) => upload(file, placeholders[i]));
	}

	async function upload(file: File, placeholder: string) {
		const replace = (text: string) => (value = value.replace(placeholder, text));

		if (!isImageType(file.type)) {
			replace('');
			uploadError = 'Nur PNG, JPEG, GIF und WebP werden unterstützt.';
			return;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			replace('');
			uploadError = `«${file.name}» ist zu gross (max. ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`;
			return;
		}

		const body = new FormData();
		body.append('file', file);
		try {
			const response = await fetch('/api/images', { method: 'POST', body });
			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.message ?? 'Das Hochladen ist fehlgeschlagen.');
			replace(`![${altFor(file)}](${result.url})`);
		} catch (cause) {
			replace('');
			uploadError = cause instanceof Error ? cause.message : 'Das Hochladen ist fehlgeschlagen.';
		}
	}

	/** The file name without its extension, minus characters that would end the alt text. */
	function altFor(file: File): string {
		return file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '') || 'Bild';
	}
</script>

<div class="split">
	<section class="pane">
		<header class="pane-head">
			<span class="hud-label">Markdown</span>
			<button class="btn btn-ghost" type="button" onclick={() => (showHelp = !showHelp)}>
				{showHelp ? 'Ausblenden' : 'Formatierung'}
			</button>
		</header>

		{#if showHelp}
			<ul class="help">
				{#each MARKDOWN_FEATURES as feature (feature.syntax)}
					<li><code>{feature.syntax}</code><span>{feature.result}</span></li>
				{/each}
			</ul>
		{/if}

		{#if uploadError}
			<p class="upload-error" role="alert">{uploadError}</p>
		{/if}

		<textarea
			class="source"
			class:dragging
			style:min-height={minHeight}
			bind:this={textarea}
			bind:value
			{ondragover}
			ondragleave={() => (dragging = false)}
			{ondrop}
			{onpaste}
			spellcheck="true"
			{placeholder}
		></textarea>
	</section>

	<section class="pane">
		<header class="pane-head">
			<span class="hud-label">Vorschau</span>
		</header>
		<Panel>
			<article class="prose">
				{#if heading !== undefined}
					<h1>{heading}</h1>
				{/if}
				<!-- Safe by construction: `renderMarkdown` escapes every text run
				     and only ever emits tags it chose itself. -->
				{@html preview}
			</article>
		</Panel>
	</section>
</div>

<style>
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		align-items: start;
	}

	@media (max-width: 900px) {
		.split {
			grid-template-columns: 1fr;
		}
	}

	.pane {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.pane-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 32px;
	}

	.source {
		font: inherit;
		font-family: var(--font-code);
		font-size: 13px;
		line-height: 1.6;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 6px);
		padding: 9px 12px;
		resize: vertical;
	}

	.source.dragging {
		outline: 2px dashed var(--accent);
		outline-offset: 1px;
	}

	.upload-error {
		margin: 0;
		font-size: 12px;
		color: var(--danger);
	}

	.source:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.help {
		list-style: none;
		margin: 0;
		padding: 10px 12px;
		background: var(--chip-bg);
		border-radius: calc(var(--radius) - 6px);
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
	}

	.help li {
		display: flex;
		gap: 10px;
	}

	.help code {
		font-family: var(--font-code);
		color: var(--text);
		min-width: 150px;
		white-space: pre;
	}

	.help span {
		color: var(--text-muted);
	}
</style>
