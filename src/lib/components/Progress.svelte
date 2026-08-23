<script lang="ts">
	interface Props {
		value: number;       // 0–1
		label?: string;
		sublabel?: string;
	}

	let { value, label, sublabel }: Props = $props();

	const pct = $derived(`${Math.min(1, Math.max(0, value)) * 100}%`);
</script>

{#if label || sublabel}
	<div class="progress-labels">
		{#if label}<span class="progress-label">{label}</span>{/if}
		{#if sublabel}<span class="progress-sublabel">{sublabel}</span>{/if}
	</div>
{/if}
<div class="progress">
	<div class="progress-fill" style="width: {pct}"></div>
</div>

<style>
	.progress-labels {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 6px;
		font-size: 0.75rem;
		font-family: var(--font-code);
		color: var(--text-muted);
	}

	.progress-sublabel {
		color: var(--text);
	}
</style>
