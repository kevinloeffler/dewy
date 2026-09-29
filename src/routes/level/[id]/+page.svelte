<script lang="ts">
	import LevelPlayer from '$lib/components/level/LevelPlayer.svelte';
	import { page } from '$app/state';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	// Set by the designer's "Testen" button, so a test run leads back to the editor.
	const fromDesigner = $derived(page.url.searchParams.get('from') === 'designer');
</script>

<svelte:head>
	<title>{data.level.name} · Dewy</title>
</svelte:head>

<!--
	Standalone play: a level on its own, with no course around it. Built-in
	levels like `tutorial-01` only ever reach the player this way.

	No `{#key}` needed — `[id]` changing here is a full navigation between two
	standalone levels, and there is no sibling route sharing this component.
-->
<LevelPlayer level={data.level} userId={data.userId}>
	{#snippet actions()}
		{#if fromDesigner}
			<a class="btn btn-ghost" href="/designer/{data.level.id}">Zurück zum Designer</a>
		{/if}
	{/snippet}
</LevelPlayer>
