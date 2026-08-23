<script lang="ts">
	import { tokenizeLine } from '$lib/utils/tokenize.js';

	interface Props {
		code: string;
		activeLine?: number | null;   // 1-indexed line number
		filename?: string;
		fontSize?: number;
		height?: number | string;
	}

	let {
		code,
		activeLine = null,
		filename = 'script.js',
		fontSize = 13,
		height = '100%',
	}: Props = $props();

	const lines  = $derived(code.split('\n'));
	const lineH  = $derived(Math.round(fontSize * 1.6));
	const h      = $derived(typeof height === 'number' ? `${height}px` : height);

	const tokenClass: Record<string, string> = {
		comment: 'tok-comment',
		kw:      'tok-keyword',
		fn:      'tok-fn',
		ident:   'tok-ident',
		number:  'tok-number',
		string:  'tok-string',
		punct:   'tok-punct',
		ws:      '',
	};
</script>

<div class="editor" style="height: {h}; font-size: {fontSize}px">
	<div class="editor-titlebar">
		<div class="editor-titlebar-dots">
			<div class="editor-titlebar-dot" style="background:#ff5d73"></div>
			<div class="editor-titlebar-dot" style="background:#ffb86b"></div>
			<div class="editor-titlebar-dot" style="background:#7ee787"></div>
		</div>
		<span class="editor-filename">{filename}</span>
		<span class="editor-lang">JavaScript</span>
	</div>

	<div class="editor-body">
		{#each lines as line, idx}
			{@const num    = idx + 1}
			{@const active = activeLine === num}
			{@const tokens = tokenizeLine(line)}
			<div class="editor-line" class:is-active={active} style="height: {lineH}px">
				<div class="editor-gutter" style="height: {lineH}px; line-height: {lineH}px">
					{num}
				</div>
				<div class="editor-code" style="line-height: {lineH}px">
					{#each tokens as tok}
						{#if tok.t === 'ws'}
							{tok.s}
						{:else}
							<span class={tokenClass[tok.t] ?? ''}>{tok.s}</span>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.editor-filename {
		margin-left: 8px;
	}

	.editor-lang {
		margin-left: auto;
		font-size: 0.625rem;
		opacity: 0.7;
	}
</style>
