<script lang="ts">
	interface Props {
		active?: boolean;
		label?: string;
	}

	let { active = false, label }: Props = $props();
</script>

<span class="status-wrap">
	<span class="status-dot" class:is-active={active}></span>
	{#if label}
		<span class="status-label">{label}</span>
	{/if}
</span>

<style>
	.status-wrap {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.status-label {
		font-family: var(--font-code);
		font-size: 0.6875rem;
		color: var(--text-muted);
		letter-spacing: 0.6px;
		text-transform: uppercase;
	}
</style>
