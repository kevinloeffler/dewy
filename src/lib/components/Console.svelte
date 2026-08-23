<script lang="ts">
	import { tick } from 'svelte';

	export type LogKind = 'info' | 'cmd' | 'ok' | 'err' | 'warn';

	export interface LogEntry {
		kind: LogKind;
		text: string;
	}

	interface Props {
		logs: LogEntry[];
		height?: number | string;
	}

	let { logs, height = 120 }: Props = $props();

	let el = $state<HTMLDivElement | undefined>();

	$effect(() => {
		// track logs reactively, scroll to bottom on change
		void logs.length;
		tick().then(() => {
			if (el) el.scrollTop = el.scrollHeight;
		});
	});

	const h = $derived(typeof height === 'number' ? `${height}px` : height);
</script>

<div class="console" bind:this={el} style="height: {h}">
	{#each logs as log}
		<div class="console-line-{log.kind}">{log.text}</div>
	{/each}
</div>
