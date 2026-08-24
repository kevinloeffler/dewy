<script lang="ts">
	interface Props {
		problems: string[];
	}

	let { problems }: Props = $props();
</script>

{#if problems.length === 0}
	<p class="ok">No problems — this level is sound.</p>
{:else}
	<ul>
		{#each problems as problem (problem)}
			<li>{problem}</li>
		{/each}
	</ul>
	<p class="note">Problems do not block saving — a half-built level is still worth keeping.</p>
{/if}

<style>
	.ok {
		margin: 0;
		font-size: 13px;
		color: var(--success);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	li {
		font-size: 12px;
		line-height: 1.45;
		color: var(--text);
		border-left: 2px solid var(--danger);
		padding-left: 8px;
	}

	.note {
		margin: 10px 0 0;
		font-size: 11px;
		color: var(--text-faint);
	}
</style>
