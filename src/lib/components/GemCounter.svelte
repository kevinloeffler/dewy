<script lang="ts">
	interface Props {
		collected: number;
		total: number;
	}

	let { collected, total }: Props = $props();
</script>

<div class="gem-counter">
	{#each { length: total } as _, i}
		<div class="gem" class:is-collected={i < collected}></div>
	{/each}
</div>

<style>
	.gem-counter {
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
