<script lang="ts">
	import { Panel, Topbar } from '$lib/components/index.js';
	import { ROBOT_API } from '$lib/codemirror/completions.js';
	import type { LanguageStage } from '$lib/game/level';

	/*
		What each language stage adds, for a teacher picking one in the level
		designer. Robot commands come from `ROBOT_API`; the constructs mirror
		`FEATURE_STAGE` in `$lib/game/script/parser.ts`, which is what actually
		enforces them.
	*/
	type Stage = {
		stage: LanguageStage;
		name: string;
		constructs: string[];
		example: string;
	};

	const STAGES: Stage[] = [
		{ stage: 1, name: 'Sequenz', constructs: [], example: 'moveForward();' },
		{ stage: 2, name: 'Wiederholung', constructs: ['repeat (n) { … }'], example: 'repeat(4) { moveForward(); }' },
		{
			stage: 3,
			name: 'Bedingungen',
			constructs: ['if', 'else', 'else if'],
			example: 'if (isBlocked()) { turnLeft(); }',
		},
		{
			stage: 4,
			name: 'Schleifen & Variablen',
			constructs: ['while', 'let', 'x = …'],
			example: 'while (!isGoal()) { moveForward(); }',
		},
		{
			stage: 5,
			name: 'Funktionen',
			constructs: ['function', 'return', 'Parameter'],
			example: 'function deliver() { … }',
		},
	];

	const commandsAt = (stage: LanguageStage) =>
		ROBOT_API.filter((entry) => entry.type === 'function' && entry.stage === stage).map(
			(entry) => `${entry.label}()`
		);
</script>

<svelte:head>
	<title>Sprachstufen · Dewy</title>
</svelte:head>

<Topbar account>
	{#snippet left()}
		<span class="chip">Hilfe</span>
	{/snippet}
</Topbar>

<main class="page">
	<header>
		<h1 class="title">Sprachstufen</h1>
		<p class="lead">
			Die Sprachstufe eines Levels legt fest, was Schüler:innen darin schreiben dürfen. Jede Stufe
			enthält alles aus den Stufen davor. Was darüber liegt, wird beim Start mit einer Meldung
			abgelehnt, bevor sich der Roboter bewegt. Die ausführliche Beschreibung jedes Befehls steht unter
			<a href="/docs/language">Befehle</a>.
		</p>
	</header>

	<Panel>
		<div class="table-wrap">
			<table class="stages">
				<thead>
					<tr>
						<th>Stufe</th>
						<th>Neu dazu</th>
						<th>Beispiel</th>
					</tr>
				</thead>
				<tbody>
					{#each STAGES as row (row.stage)}
						{@const commands = commandsAt(row.stage)}
						<tr>
							<td class="stage">
								<span class="stage-number">{row.stage}</span>
								<span class="stage-name">{row.name}</span>
							</td>
							<td>
								<div class="tokens">
									{#each row.constructs as construct (construct)}
										<code class="token is-construct">{construct}</code>
									{/each}
									{#each commands as command (command)}
										<code class="token">{command}</code>
									{/each}
								</div>
							</td>
							<td><code class="example">{row.example}</code></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Panel>

	<ul class="notes">
		<li>
			<strong>Aktionen</strong> (Stufe 1) kosten je eine Einheit Batterie. <strong>Sensoren</strong>
			(Stufe 3) sind gratis — ein Level mit knapper Batterie belohnt also, zuerst nachzuschauen.
		</li>
		<li>
			Das <strong>Speicherlimit</strong> zählt Anweisungen, nicht Zeilen. Ab Stufe 2 macht es
			<code>repeat</code> lohnend, ab Stufe 5 eigene Funktionen.
		</li>
		<li>
			<strong>Operatoren</strong> (<code>! && || === !== &lt; &gt; + - * / %</code>) sind an keine
			Stufe gebunden — <code>repeat(2 * 3)</code> geht schon auf Stufe 2. Variablen gibt es aber
			erst ab Stufe 4.
		</li>
	</ul>
</main>

<style>
	.page {
		max-width: 920px;
		margin: 0 auto;
		padding: 32px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 24px;
		margin: 0 0 8px;
	}

	.lead {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.lead a {
		color: var(--accent);
	}

	.table-wrap {
		overflow-x: auto;
	}

	.stages {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.stages th {
		text-align: left;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-faint);
		padding: 0 12px 10px 0;
	}

	.stages td {
		padding: 12px 12px 12px 0;
		border-top: 1px solid var(--panel-border);
		vertical-align: top;
	}

	.stages tr:last-child td {
		padding-bottom: 0;
	}

	.stage {
		white-space: nowrap;
	}

	.stage-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		margin-right: 8px;
		border-radius: 6px;
		background: var(--chip-bg);
		color: var(--chip-text);
		font-family: var(--font-code);
		font-weight: 700;
		font-size: 0.75rem;
	}

	.stage-name {
		font-weight: 700;
		color: var(--text);
	}

	.tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.token {
		padding: 2px 6px;
		border-radius: 5px;
		border: 1px solid var(--panel-border);
		font-family: var(--font-code);
		font-size: 0.75rem;
		color: var(--text);
		white-space: nowrap;
	}

	.token.is-construct {
		color: var(--tok-keyword);
		background: var(--editor-bg);
	}

	.example {
		font-family: var(--font-code);
		font-size: 0.75rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.notes {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.notes code {
		font-family: var(--font-code);
		font-size: 0.8125rem;
		color: var(--text);
	}
</style>
