<script lang="ts">
	import { Panel, Topbar } from '$lib/components/index.js';
	import { ROBOT_API, type RobotApiEntry } from '$lib/codemirror/completions.js';
	import { tokenizeLine } from '$lib/utils/tokenize.js';

	/*
		The robot commands come from `ROBOT_API` — the same list the editor's
		autocomplete offers — so a command added there shows up here too.
		The language constructs below are written out by hand; their stages
		mirror `FEATURE_STAGE` in `$lib/game/script/parser.ts`.
	*/
	const actions = ROBOT_API.filter((entry) => entry.type === 'function' && entry.stage < 3);
	const sensors = ROBOT_API.filter((entry) => entry.type === 'function' && entry.stage >= 3);

	type Construct = {
		id: string;
		title: string;
		stage: number;
		text: string;
		example: string;
	};

	const constructs: Construct[] = [
		{
			id: 'reihenfolge',
			title: 'Befehle nacheinander',
			stage: 1,
			text: 'Jeder Befehl steht auf einer eigenen Zeile und endet mit einem Semikolon. Der Roboter führt sie von oben nach unten aus.',
			example: 'moveForward();\nturnRight();\nmoveForward();',
		},
		{
			id: 'repeat',
			title: 'repeat — wiederholen',
			stage: 2,
			text: 'Führt alles zwischen den geschweiften Klammern so oft aus, wie die Zahl sagt.',
			example: 'repeat(4) {\n    moveForward();\n}',
		},
		{
			id: 'if',
			title: 'if / else — entscheiden',
			stage: 3,
			text: 'Führt den ersten Block nur aus, wenn die Bedingung wahr ist. Sonst wird der else-Block ausgeführt — den darfst du auch weglassen.',
			example: 'if (isBlocked()) {\n    turnLeft();\n} else {\n    moveForward();\n}',
		},
		{
			id: 'while',
			title: 'while — wiederholen, solange …',
			stage: 4,
			text: 'Wiederholt den Block, solange die Bedingung wahr ist. Achte darauf, dass sie irgendwann falsch wird, sonst hört die Schleife nie auf.',
			example: 'while (!isGoal()) {\n    moveForward();\n}',
		},
		{
			id: 'let',
			title: 'let — Variablen',
			stage: 4,
			text: 'Mit let merkst du dir einen Wert unter einem Namen. Später kannst du ihm mit = einen neuen Wert geben.',
			example: 'let steps = 0;\nwhile (!isBlocked()) {\n    moveForward();\n    steps = steps + 1;\n}',
		},
		{
			id: 'function',
			title: 'function — eigene Befehle',
			stage: 5,
			text: 'Fasst mehrere Befehle unter einem neuen Namen zusammen. In den Klammern kann eine Funktion Werte entgegennehmen, und mit return gibt sie einen Wert zurück.',
			example:
				'function turnAround() {\n    turnLeft();\n    turnLeft();\n}\n\nfunction walk(n) {\n    repeat(n) {\n        moveForward();\n    }\n}\n\nturnAround();\nwalk(3);',
		},
	];

	const operators: { symbol: string; meaning: string }[] = [
		{ symbol: '!', meaning: 'nicht — kehrt wahr und falsch um' },
		{ symbol: '&&', meaning: 'und — beide Seiten müssen wahr sein' },
		{ symbol: '||', meaning: 'oder — eine Seite muss wahr sein' },
		{ symbol: '===', meaning: 'ist gleich' },
		{ symbol: '!==', meaning: 'ist nicht gleich' },
		{ symbol: '< > <= >=', meaning: 'kleiner, grösser, kleiner-gleich, grösser-gleich' },
		{ symbol: '+ - * / %', meaning: 'rechnen (% ist der Rest einer Division)' },
	];

	const tokenClass: Record<string, string> = {
		comment: 'tok-comment',
		kw: 'tok-keyword',
		fn: 'tok-fn',
		ident: 'tok-ident',
		number: 'tok-number',
		string: 'tok-string',
		punct: 'tok-punct',
	};

	/** `repeat` is not JavaScript, so the shared highlighter does not know it. */
	function classFor(token: { t: string; s: string }): string {
		return token.s === 'repeat' ? 'tok-keyword' : (tokenClass[token.t] ?? '');
	}
</script>

<svelte:head>
	<title>Befehle · Dewy</title>
</svelte:head>

{#snippet code(source: string)}
	<pre class="code"><code
			>{#each source.split('\n') as line, index (index)}{#each tokenizeLine(line) as token, t (t)}{#if token.t === 'ws'}{token.s}{:else}<span
							class={classFor(token)}>{token.s}</span
						>{/if}{/each}{'\n'}{/each}</code
		></pre>
{/snippet}

{#snippet command(entry: RobotApiEntry)}
	<li class="command" id={entry.label}>
		<div class="command-head">
			<code class="command-name">{entry.label}{entry.detail}</code>
			<span class="stage">ab Stufe {entry.stage}</span>
		</div>
		<p class="command-info">{entry.info}</p>
	</li>
{/snippet}

<Topbar account>
	{#snippet left()}
		<span class="chip">Hilfe</span>
	{/snippet}
</Topbar>

<main class="page">
	<header>
		<h1 class="title">Befehle</h1>
		<p class="lead">
			Alles, was du dem Roboter sagen kannst. Nicht jedes Level schaltet alles frei — die Stufe
			zeigt, ab wann ein Befehl dazukommt. Ein Befehl, der noch gesperrt ist, meldet das beim
			Start.
		</p>
	</header>

	<section class="section">
		<h2 class="section-title">Aktionen</h2>
		<p class="section-lead">
			Jede Aktion kostet eine Einheit Batterie und wirkt auf das Feld <strong>vor</strong> dem Roboter.
			Geht eine Aktion nicht, stürzt der Roboter ab und das Programm hält an.
		</p>
		<Panel>
			<ul class="commands">
				{#each actions as entry (entry.label)}
					{@render command(entry)}
				{/each}
			</ul>
		</Panel>
	</section>

	<section class="section">
		<h2 class="section-title">Sensoren</h2>
		<p class="section-lead">
			Sensoren fragen etwas ab, ohne dass sich der Roboter bewegt, und kosten keine Batterie. Du
			brauchst sie in Bedingungen, zum Beispiel in <code>if</code> oder <code>while</code>.
		</p>
		<Panel>
			<ul class="commands">
				{#each sensors as entry (entry.label)}
					{@render command(entry)}
				{/each}
			</ul>
		</Panel>
	</section>

	<section class="section">
		<h2 class="section-title">Sprache</h2>
		<div class="constructs">
			{#each constructs as construct (construct.id)}
				<Panel>
					<article class="construct" id={construct.id}>
						<div class="command-head">
							<h3 class="construct-title">{construct.title}</h3>
							<span class="stage">ab Stufe {construct.stage}</span>
						</div>
						<p class="command-info">{construct.text}</p>
						{@render code(construct.example)}
					</article>
				</Panel>
			{/each}
		</div>
	</section>

	<section class="section">
		<h2 class="section-title">Operatoren</h2>
		<Panel>
			<table class="operators">
				<tbody>
					{#each operators as operator (operator.symbol)}
						<tr>
							<td><code class="command-name">{operator.symbol}</code></td>
							<td>{operator.meaning}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</Panel>
	</section>

	<section class="section">
		<h2 class="section-title">Kommentare</h2>
		<Panel>
			<p class="command-info">
				Alles nach <code>//</code> bis zum Ende der Zeile ignoriert der Roboter. Längere Notizen
				schreibst du zwischen <code>/*</code> und <code>*/</code>.
			</p>
			{@render code('// Zuerst zur Kiste\nmoveForward();\npick(); // aufheben')}
		</Panel>
	</section>
</main>

<style>
	.page {
		max-width: 820px;
		margin: 0 auto;
		padding: 32px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 24px;
		margin: 0 0 8px;
	}

	.lead,
	.section-lead {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 18px;
		margin: 0;
	}

	.commands {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.command {
		padding: 12px 0;
		border-top: 1px solid var(--panel-border);
	}

	.command:first-child {
		padding-top: 0;
		border-top: none;
	}

	.command:last-child {
		padding-bottom: 0;
	}

	.command-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.command-name {
		font-family: var(--font-code);
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text);
	}

	.command-info {
		margin: 4px 0 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.stage {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--text-faint);
	}

	.constructs {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.construct-title {
		font-family: var(--font-code);
		font-size: 0.9375rem;
		margin: 0;
	}

	.code {
		margin: 12px 0 0;
		padding: 12px 14px;
		background: var(--editor-bg);
		border: 1px solid var(--panel-border);
		border-radius: 8px;
		font-family: var(--font-code);
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--editor-text);
		overflow-x: auto;
	}

	.operators {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.operators td {
		padding: 8px 0;
		border-top: 1px solid var(--panel-border);
		vertical-align: baseline;
	}

	.operators tr:first-child td {
		padding-top: 0;
		border-top: none;
	}

	.operators tr:last-child td {
		padding-bottom: 0;
	}

	.operators td:first-child {
		width: 120px;
		white-space: nowrap;
	}

	p code {
		font-family: var(--font-code);
		font-size: 0.8125rem;
		color: var(--text);
	}
</style>
