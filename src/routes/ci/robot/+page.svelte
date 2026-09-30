<script lang="ts">
	import { Button, Checkbox } from '$lib/components/index.js';
	import { CRASH_REACTIONS, crash, type CrashCode } from '$lib/game/crash-reasons';
	import { REACTIONS, type Reaction } from '$lib/game/reactions';
	import { REACTION_DURATIONS } from '$lib/game/models/roboter';
	import ReactionStage from './ReactionStage.svelte';

	/**
	 * Every reaction Dewy can show, side by side, for review. The crash codes
	 * under each one come from `CRASH_REACTIONS`, so this page cannot fall out
	 * of step with what the engine actually plays.
	 */

	const LABELS: Record<Reaction, { title: string; what: string }> = {
		collide:    { title: 'Zusammenstoss', what: 'Bäumt sich auf die hinteren Ketten auf, federt zurück, Kopf kreist benommen.' },
		strain:     { title: 'Kiste klemmt',  what: 'Stemmt sich gegen die Kiste, Ketten drehen durch — dann ein Seufzer.' },
		fall:       { title: 'Absturz',       what: 'Hängt kurz über dem Loch, Augen weit, dann fällt er. Bleibt unten.' },
		confused:   { title: 'Verwirrt',      what: 'Kopf schief, schaut sich um, Arme offen, bernsteinfarbene Augen.' },
		caught:     { title: 'Erwischt',      what: 'Schreckt hoch, Hände hoch, zittert, Augen blinken rot. Bleibt so.' },
		power_down: { title: 'Batterie leer', what: 'Augen flackern und gehen aus, Kopf und Arme sacken ab. Bleibt aus.' },
		overheat:   { title: 'Überhitzt',     what: 'Zittert immer stärker, Dampf, Kopf dreht sich — dann erschöpft.' },
		shrug:      { title: 'Achselzucken',  what: 'Programm fertig, Ziel nicht erreicht. Kein Absturz, keine Meldung.' },
	};

	const codesFor = (reaction: Reaction) =>
		(Object.keys(CRASH_REACTIONS) as CrashCode[]).filter((code) => CRASH_REACTIONS[code] === reaction);

	let speed = $state(1);
	let loop = $state(true);
	let carrying = $state(false);
	let replayAll = $state(0);
	let replays = $state<Record<string, number>>({});
</script>

<svelte:head>
	<title>Robot Reactions · Dewy</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div class="page-header-inner">
			<a class="back" href="/ci">← Component Library</a>
			<div>
				<h1 class="page-title">Robot reactions</h1>
				<p class="page-subtitle">How Dewy shows each way a run can fail</p>
			</div>
		</div>
	</div>

	<main class="main">
		<div class="toolbar">
			<div class="speeds" role="group" aria-label="Geschwindigkeit">
				{#each [0.25, 0.5, 1, 2] as rate (rate)}
					<button class="speed" class:active={speed === rate} onclick={() => (speed = rate)}>
						{rate}×
					</button>
				{/each}
			</div>
			<Checkbox bind:checked={loop} label="Wiederholen" />
			<Checkbox bind:checked={carrying} label="Trägt Kiste" />
			<Button variant="ghost" onclick={() => replayAll++}>Alle neu starten</Button>
		</div>

		<div class="grid">
			{#each REACTIONS as reaction (reaction)}
				{@const codes = codesFor(reaction)}
				<article class="card">
					<ReactionStage
						{reaction}
						{speed}
						{loop}
						{carrying}
						replay={replayAll + (replays[reaction] ?? 0)}
					/>
					<div class="card-body">
						<div class="card-head">
							<h2 class="card-title">{LABELS[reaction].title}</h2>
							<code class="card-id">{reaction}</code>
							<span class="card-duration">{REACTION_DURATIONS[reaction]} s</span>
							<button
								class="replay"
								onclick={() => (replays[reaction] = (replays[reaction] ?? 0) + 1)}
								aria-label="{LABELS[reaction].title} neu starten"
							>↻</button>
						</div>
						<p class="card-what">{LABELS[reaction].what}</p>
						{#if codes.length > 0}
							<ul class="codes">
								{#each codes as code (code)}
									<li><code>{code}</code> <span>{crash(code).message}</span></li>
								{/each}
							</ul>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-ui);
	}

	.page-header {
		background: var(--panel);
		border-bottom: 1px solid var(--panel-border);
		padding: 20px 40px;
	}

	.page-header-inner {
		max-width: 1160px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 24px;
	}

	.back {
		font-size: 0.8125rem;
		color: var(--text-muted);
		text-decoration: none;
	}

	.back:hover {
		color: var(--text);
	}

	.page-title {
		font-size: 1.25rem;
		margin: 0 0 2px;
	}

	.page-subtitle {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0;
	}

	.main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 32px 40px 80px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px;
	}

	.speeds {
		display: inline-flex;
		border: 1px solid var(--panel-border);
		border-radius: 8px;
		overflow: hidden;
		background: var(--panel);
	}

	.speed {
		border: 0;
		background: none;
		padding: 6px 12px;
		font: inherit;
		font-size: 0.8125rem;
		color: var(--text-muted);
		cursor: pointer;
	}

	.speed.active {
		background: var(--accent-soft);
		color: var(--text);
		font-weight: 700;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 20px;
	}

	.card {
		background: var(--panel);
		border: 1px solid var(--panel-border);
		border-radius: 14px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.card-body {
		padding: 0 6px 6px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.card-head {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.card-title {
		font-size: 1rem;
		margin: 0;
	}

	.card-id {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.card-duration {
		font-size: 0.75rem;
		color: var(--text-faint);
		margin-left: auto;
	}

	.replay {
		border: 1px solid var(--panel-border);
		background: none;
		border-radius: 6px;
		width: 26px;
		height: 26px;
		cursor: pointer;
		color: var(--text-muted);
		align-self: center;
	}

	.replay:hover {
		color: var(--text);
	}

	.card-what {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0;
	}

	.codes {
		list-style: none;
		margin: 0;
		padding: 8px 0 0;
		border-top: 1px solid var(--panel-border);
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.75rem;
	}

	.codes code {
		color: var(--chapter-text);
	}

	.codes span {
		color: var(--text-muted);
	}

	@media (max-width: 640px) {
		.page-header,
		.main {
			padding-left: 16px;
			padding-right: 16px;
		}

		.page-header-inner {
			flex-direction: column;
			align-items: flex-start;
			gap: 8px;
		}
	}
</style>
