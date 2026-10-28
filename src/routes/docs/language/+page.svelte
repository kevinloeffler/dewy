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

	/**
		What the accordion under an entry holds. Text in `backticks` is set as
		code. Everything here follows `robot.md`, which is the spec.
	*/
	type Details = {
		text?: string[];
		values?: { value: string; meaning: string }[];
		example?: string;
	};

	const commandDetails: Record<string, Details> = {
		moveForward: {
			text: [
				'Steht eine Kiste vor dem Roboter, schiebt er sie ein Feld weiter — aber nur, wenn das Feld dahinter frei ist. Landet die Kiste dabei auf einer passenden Abgabestelle, ist sie abgeliefert, genau wie mit `drop()`. Ein Trichter schluckt sie.',
				'Der Roboter stürzt ab bei einer Wand, einer geschlossenen Türe, einem Loch, dem Rand der Welt, einem Schalter, einem Trichter, einem Kistenband oder einer Kisten-Lücke — und bei einer Dewy-Lücke, wenn er eine Kiste trägt.',
			],
			example: 'moveForward();\nmoveForward(); // schiebt die Kiste davor weiter',
		},
		turnLeft: {
			text: ['Der Roboter bleibt auf seinem Feld stehen und schaut danach in eine neue Richtung. Viermal drehen bringt ihn zurück zur alten Richtung.'],
			example: '// umdrehen\nturnLeft();\nturnLeft();',
		},
		turnRight: {
			text: ['Drei Rechtsdrehungen sind dasselbe wie eine Linksdrehung — nur teurer.'],
			example: 'turnRight();\nmoveForward();',
		},
		pick: {
			text: [
				'Der Roboter kann nur eine Kiste aufs Mal tragen. Keycards kann er dagegen beliebig viele einstecken, auch während er eine Kiste trägt.',
				'Liegen auf dem Feld davor eine Kiste und eine Keycard, nimmt er zuerst die Kiste. Hebt er eine schon abgelieferte Kiste wieder auf, zählt sie nicht mehr als abgeliefert.',
				'Liegt nichts davor oder trägt er schon eine Kiste, schaut er verwirrt.',
			],
			example: 'pick();       // Kiste in die Hände\nturnLeft();\nturnLeft();\nmoveForward();\ndrop();',
		},
		drop: {
			text: [
				'Ist das Feld davor eine passende Abgabestelle, ist die Kiste abgeliefert. Eine Abgabestelle in einer anderen Farbe ist kein Absturz — die Kiste steht dann einfach dort, und du kannst sie wieder aufheben.',
				'Ein Trichter ist eine Abgabestelle für viele Kisten: Er schluckt jede passende Kiste, die hineinfällt, geschoben oder vom Band gebracht wird. Die Zahl darüber zeigt, wie viele er schon hat und wie viele er braucht. Eine geschluckte Kiste kommt nicht wieder heraus — und auch ein voller Trichter schluckt weiter.',
				'Der Roboter stürzt ab, wenn das Feld keine Kiste aufnehmen kann: eine andere Kiste, eine Wand, eine geschlossene Türe, ein Loch, ein Schalter, eine Dewy-Lücke oder der Rand der Welt. Eine Kisten-Lücke geht.',
			],
			example: 'pick();\nturnRight();\ndrop();',
		},
		open: {
			text: [
				'Jede Keycard passt zu genau einer Türe. Beim Öffnen wird sie verbraucht — für eine zweite Türe brauchst du eine zweite Keycard.',
				'Steht keine Türe davor oder fehlt die passende Keycard, schaut der Roboter verwirrt.',
			],
			example: 'pick();        // Keycard einstecken\nturnRight();\nopen();        // Türe davor öffnen\nmoveForward();',
		},
		toggle: {
			text: ['Ein Schalter steuert eine Türe, einen Bewegungsmelder oder ein Förderband. Jedes `toggle()` schaltet ihn um: aus wird ein, ein wird aus. Auf einen Schalter fahren kann der Roboter nicht — er steht davor.'],
			example: 'toggle();      // Bewegungsmelder aus\nmoveForward();\nmoveForward();',
		},
		wait: {
			text: ['Nützlich auf einem Förderband: Der Roboter lässt sich ein Feld weitertragen, ohne Batterie zu verbrauchen.'],
			example: 'repeat(3) {\n    wait();\n}',
		},
		isBlocked: {
			text: [
				'Prüft nur, ob etwas im Weg steht. Die Sperrzone eines Bewegungsmelders ist begehbarer Boden — dafür gibt es `isDangerous()`.',
			],
			values: [
				{ value: 'true', meaning: 'Ein Schritt vorwärts gäbe einen Absturz.' },
				{ value: 'false', meaning: 'Der Weg ist frei, oder davor steht eine Kiste, die sich schieben lässt.' },
			],
			example: 'if (isBlocked()) {\n    turnLeft();\n} else {\n    moveForward();\n}',
		},
		isCrate: {
			values: [
				{ value: 'true', meaning: 'Auf dem Feld davor steht eine Kiste, egal ob grau oder farbig.' },
				{ value: 'false', meaning: 'Davor steht keine Kiste.' },
			],
			example: 'if (isCrate()) {\n    pick();\n}',
		},
		isCarrying: {
			values: [
				{ value: 'true', meaning: 'Der Roboter hat eine Kiste in den Händen.' },
				{ value: 'false', meaning: 'Die Hände sind leer. Keycards im Inventar ändern daran nichts.' },
			],
			example: 'if (!isCarrying()) {\n    pick();\n}',
		},
		isGoal: {
			text: ['Alle anderen Sensoren schauen auf das Feld davor. `isGoal()` schaut auf das Feld, auf dem der Roboter steht — er erreicht das Ziel, indem er darauf fährt.'],
			values: [
				{ value: 'true', meaning: 'Der Roboter steht auf dem Zielfeld.' },
				{ value: 'false', meaning: 'Er steht anderswo.' },
			],
			example: 'while (!isGoal()) {\n    moveForward();\n}',
		},
		isDropOff: {
			text: [
				'Sagt nicht, ob die Abgabestelle zur Kiste passt: Eine graue Abgabestelle nimmt jede Kiste, eine farbige nur Kisten in ihrer Farbe.',
				'Auch vor einem Trichter meldet `isDropOff()` true. In einen Trichter fahren kann der Roboter nicht — `isBlocked()` ist dort ebenfalls true.',
			],
			values: [
				{ value: 'true', meaning: 'Das Feld davor ist eine Abgabestelle.' },
				{ value: 'false', meaning: 'Das Feld davor ist keine.' },
			],
			example: 'while (!isDropOff()) {\n    moveForward();\n}\ndrop();',
		},
		crateColor: {
			text: [
				'Die Farbe kommt als Text in Anführungszeichen und immer auf Englisch. Vergleiche sie mit `===`. Ein einfaches `==` gibt es nicht.',
			],
			values: [
				{ value: '"red"', meaning: 'rot' },
				{ value: '"green"', meaning: 'grün' },
				{ value: '"blue"', meaning: 'blau' },
				{ value: '"purple"', meaning: 'lila' },
				{ value: '"pink"', meaning: 'pink' },
				{ value: '"yellow"', meaning: 'gelb' },
				{ value: 'null', meaning: 'eine graue Kiste, oder der Roboter trägt nichts' },
			],
			example:
				'pick();\nif (crateColor() === "red") {\n    turnLeft();\n} else if (crateColor() === "blue") {\n    turnRight();\n} else if (crateColor() === null) {\n    // graue Kiste: zurückstellen\n    drop();\n}',
		},
		isDangerous: {
			text: ['Ein Bewegungsmelder, der mit einem Schalter oder einer Druckplatte ausgeschaltet wurde, ist ungefährlich — dann meldet `isDangerous()` false.'],
			values: [
				{ value: 'true', meaning: 'Das Feld davor liegt in der Sperrzone eines eingeschalteten Bewegungsmelders.' },
				{ value: 'false', meaning: 'Das Feld davor ist sicher.' },
			],
			example: 'if (isDangerous()) {\n    turnLeft();\n} else {\n    moveForward();\n}',
		},
	};

	type Construct = {
		id: string;
		title: string;
		stage: number;
		text: string;
		example: string;
		details?: Details;
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
			details: {
				text: [
					'Schleifen dürfen ineinander stehen: Die innere läuft bei jeder Runde der äusseren ganz durch. Ab Stufe 4 darf statt einer Zahl auch eine Variable in den Klammern stehen.',
				],
				example: '// ein Quadrat abfahren\nrepeat(4) {\n    repeat(3) {\n        moveForward();\n    }\n    turnRight();\n}',
			},
		},
		{
			id: 'if',
			title: 'if / else — entscheiden',
			stage: 3,
			text: 'Führt den ersten Block nur aus, wenn die Bedingung wahr ist. Sonst wird der else-Block ausgeführt — den darfst du auch weglassen.',
			example: 'if (isBlocked()) {\n    turnLeft();\n} else {\n    moveForward();\n}',
			details: {
				text: [
					'Mit `else if` prüfst du mehrere Fälle nacheinander. Es wird nur der erste Block ausgeführt, dessen Bedingung wahr ist.',
					'Bedingungen lassen sich mit `&&` (und), `||` (oder) und `!` (nicht) verbinden — siehe Operatoren.',
				],
				example:
					'if (isCrate() && !isCarrying()) {\n    pick();\n} else if (isBlocked()) {\n    turnLeft();\n} else {\n    moveForward();\n}',
			},
		},
		{
			id: 'while',
			title: 'while — wiederholen, solange …',
			stage: 4,
			text: 'Wiederholt den Block, solange die Bedingung wahr ist. Achte darauf, dass sie irgendwann falsch wird, sonst hört die Schleife nie auf.',
			example: 'while (!isGoal()) {\n    moveForward();\n}',
			details: {
				text: [
					'Die Bedingung wird vor jeder Runde geprüft. Ist sie schon am Anfang falsch, läuft der Block kein einziges Mal.',
					'Eine Schleife, die nie aufhört, bricht Dewy irgendwann ab — gelöst ist das Level dann nicht.',
				],
				example:
					'// geradeaus, bis eine Wand kommt, dann links\nwhile (!isGoal()) {\n    if (isBlocked()) {\n        turnLeft();\n    } else {\n        moveForward();\n    }\n}',
			},
		},
		{
			id: 'let',
			title: 'let — Variablen',
			stage: 4,
			text: 'Mit let merkst du dir einen Wert unter einem Namen. Später kannst du ihm mit = einen neuen Wert geben.',
			example: 'let steps = 0;\nwhile (!isBlocked()) {\n    moveForward();\n    steps = steps + 1;\n}',
			details: {
				text: [
					'Eine Variable kann eine Zahl, einen Text wie `"red"`, true/false oder null speichern. Mit `let` legst du sie einmal an; danach schreibst du nur noch den Namen.',
					'Eine Variable, die du in einem Block anlegst, gibt es nur in diesem Block.',
				],
				example:
					'// die Farbe merken, bevor die Kiste weg ist\npick();\nlet color = crateColor();\nturnLeft();\ndrop();\nif (color === "red") {\n    turnRight();\n}',
			},
		},
		{
			id: 'function',
			title: 'function — eigene Befehle',
			stage: 5,
			text: 'Fasst mehrere Befehle unter einem neuen Namen zusammen. In den Klammern kann eine Funktion Werte entgegennehmen, und mit return gibt sie einen Wert zurück.',
			example:
				'function turnAround() {\n    turnLeft();\n    turnLeft();\n}\n\nfunction walk(n) {\n    repeat(n) {\n        moveForward();\n    }\n}\n\nturnAround();\nwalk(3);',
			details: {
				text: [
					'Mit `return` gibt eine Funktion einen Wert zurück und hört sofort auf. So baust du dir eigene Sensoren.',
					'Du darfst eine Funktion schon aufrufen, bevor sie im Programm steht.',
				],
				example:
					'function isFree() {\n    return !isBlocked() && !isDangerous();\n}\n\nwhile (!isGoal()) {\n    if (isFree()) {\n        moveForward();\n    } else {\n        turnRight();\n    }\n}',
			},
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

	/** Which "Mehr dazu" sections are open, by the id of the entry they belong to. */
	const expanded = $state<Record<string, boolean>>({});
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

{#snippet rich(text: string)}
	{#each text.split('`') as part, index (index)}{#if index % 2 === 1}<code>{part}</code
			>{:else}{part}{/if}{/each}
{/snippet}

{#snippet toggle(id: string, details: Details | undefined)}
	{#if details}
		<button
			type="button"
			class="more-toggle"
			aria-expanded={expanded[id] ?? false}
			aria-controls="{id}-more"
			onclick={() => (expanded[id] = !expanded[id])}
		>
			Mehr dazu
		</button>
	{/if}
{/snippet}

{#snippet more(id: string, details: Details | undefined)}
	{#if details && expanded[id]}
		<div class="more-body" id="{id}-more">
				{#each details.text ?? [] as paragraph, index (index)}
					<p class="command-info">{@render rich(paragraph)}</p>
				{/each}
				{#if details.values}
					<p class="values-title">Mögliche Werte</p>
					<table class="values">
						<tbody>
							{#each details.values as row (row.value)}
								<tr>
									<td><code class="command-name">{row.value}</code></td>
									<td>{row.meaning}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
				{#if details.example}
					{@render code(details.example)}
				{/if}
		</div>
	{/if}
{/snippet}

{#snippet command(entry: RobotApiEntry)}
	<li class="command" id={entry.label}>
		<div class="command-head">
			<div>
				<code class="command-name">{entry.label}{entry.detail}</code>
				<p class="command-info">{entry.info}</p>
			</div>
			<div class="command-side">
				<span class="stage">ab Stufe {entry.stage}</span>
				{@render toggle(entry.label, commandDetails[entry.label])}
			</div>
		</div>
		{@render more(entry.label, commandDetails[entry.label])}
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
			Fährt der Roboter gegen etwas oder in ein Loch, stürzt er ab und das Programm hält an.
			Findet eine Aktion nichts, worauf sie wirken kann — <code>open()</code> ohne Tür —, schaut er
			verwirrt, die Aktion kostet trotzdem Batterie, und das Programm läuft weiter.
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
							<div>
								<h3 class="construct-title">{construct.title}</h3>
								<p class="command-info">{construct.text}</p>
							</div>
							<div class="command-side">
								<span class="stage">ab Stufe {construct.stage}</span>
								{@render toggle(construct.id, construct.details)}
							</div>
						</div>
						{@render code(construct.example)}
						{@render more(construct.id, construct.details)}
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

	.command-side {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}

	.more-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
		color: var(--text-faint);
		user-select: none;
	}

	.more-toggle::before {
		content: '';
		width: 6px;
		height: 6px;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		transform: rotate(-45deg);
		transition: transform 0.15s ease;
	}

	.more-toggle[aria-expanded='true']::before {
		transform: rotate(45deg);
	}

	.more-toggle:hover {
		color: var(--text);
	}

	.more-toggle:focus-visible {
		outline: 2px solid var(--text-faint);
		outline-offset: 2px;
		border-radius: 4px;
	}

	.more-body {
		padding: 4px 0 0 12px;
		border-left: 2px solid var(--panel-border);
		margin-top: 8px;
	}

	.values-title {
		margin: 12px 0 4px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.values {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.values td {
		padding: 4px 0;
		vertical-align: baseline;
	}

	.values td:first-child {
		width: 120px;
		white-space: nowrap;
	}

	p code {
		font-family: var(--font-code);
		font-size: 0.8125rem;
		color: var(--text);
	}
</style>
