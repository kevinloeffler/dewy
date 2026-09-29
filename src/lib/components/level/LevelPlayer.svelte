<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { World } from '$lib/game/world';
	import { createWorldState } from '$lib/game/worldState.svelte';
	import { GameEngine } from '$lib/game/engine';
	import { createRobotApi, type RobotApi } from '$lib/game/robot-api';
	import { measureMemory, runScript, type RunResult } from '$lib/game/script';
	import type { CrateColor } from '$lib/game/crate-color';
	import type { GoalCondition, Level } from '$lib/game/level';
	import { CodeMirrorEditor, Kbd, Topbar } from '$lib/components/index.js';
	import RunControls from './RunControls.svelte';
	import LevelInstructions from './LevelInstructions.svelte';
	import LevelComplete from './LevelComplete.svelte';

	interface Props {
		level: Level;
		/**
		 * Whose draft this is. Drafts live in `localStorage`, and a school
		 * computer is shared: keyed by level alone, the next student to sign in
		 * would open the previous one's program. Left out, the draft is anonymous.
		 */
		userId?: string | null;
		/**
		 * The program that last solved this level, from the server. Used when
		 * this browser holds no draft — a student who changes computers gets
		 * their solution back rather than the starter code.
		 */
		savedCode?: string | null;
		/** Fires on every transition into a completed run. */
		oncomplete?: (info: { code: string; steps: number }) => void;
		/** Breadcrumb trail in front of the level name — course, then stage. */
		crumbs?: { label: string; href?: string }[];
		/** Pill beside the breadcrumb — the item's place in the course, e.g. `1 / 3`. */
		counter?: string;
		/** Solved in an earlier session. Drives the "Gelöst" pill in the topbar. */
		solved?: boolean;
		/** Rendered top-right — prev/next navigation. */
		actions?: Snippet;
		/** The "Weiter" button on the completion sheet. Left out, it only closes. */
		next?: { href: string; label: string; pending?: boolean };
	}

	let props: Props = $props();

	// Read once: the engine and the scene are built from these in `onMount`, so
	// swapping levels means a fresh navigation, not a reactive update.
	//
	// That makes this component's identity load-bearing. A route that keeps the
	// same component across a param change — `/courses/[id]/items/[itemId]`
	// stepping to the next item — MUST wrap it in `{#key}`, or the student will
	// navigate to a new item and keep playing the previous level.
	const level = untrack(() => props.level);
	const storageKey = untrack(() =>
		props.userId ? `dewy:${props.userId}:level:${level.id}:code` : `dewy:level:${level.id}:code`
	);
	const savedCode = untrack(() => props.savedCode);

	let canvas: HTMLCanvasElement;
	let world: World | undefined;
	let engine: GameEngine | undefined;
	let robot: RobotApi | undefined;

	const view = createWorldState();

	// The engine owns `LevelState` and is deliberately not reactive — it is
	// read 60×/s by the renderer, where a rune proxy would only cost. The UI
	// mirrors the parts it shows into runes after every action instead.
	let code = $state(loadCode());
	let activeLine = $state<number | null>(null);
	let running = $state(false);
	let outcome = $state<RunResult | null>(null);

	/** The one place anything goes wrong out loud — the toast over the editor. */
	let notice = $state<{ kind: 'error'; text: string } | null>(null);
	/** The sheet a solved run opens. Closing it leaves the solved world in view. */
	let celebrating = $state(false);
	// Only what the UI still reads: the world itself shows the robot's pose.
	let hud = $state({
		/** One flag per `level.goals`, in order. */
		goals: level.goals.map(() => false),
		steps: 0,
	});

	// Memory is a property of the source, not of the run, so it is measured
	// straight from `code`. Programs are a few dozen statements at most, so
	// re-parsing on every keystroke costs nothing worth saving.
	const memoryUsed = $derived(measureMemory(code, level.options.languageStage));
	const overMemory = $derived(
		level.options.memory !== null && memoryUsed !== null && memoryUsed > level.options.memory
	);

	onMount(() => {
		const instance = new World(canvas, view);
		const game = new GameEngine(level, { energy: level.options.energy });

		world = instance;
		engine = game;
		robot = synced(createRobotApi(game, instance));

		// The engine has already settled its derived state, so snapping the
		// scene from it is enough — no need to animate `initialize()`.
		instance.loadLevel(level, game.state);
		sync();

		return () => instance.destroy();
	});

	$effect(() => {
		// Storage can be full or blocked (private windows); the draft is a
		// convenience, never a reason for the editor to throw.
		try {
			localStorage.setItem(storageKey, code);
		} catch {
			// Keep the draft in memory only.
		}
	});

	// ========================================================
	// Running the student's program
	// ========================================================

	/**
	 * Run pacing. `Step` hands the interpreter exactly one statement at a
	 * time by parking it in `gate`; `Run` opens the gate and leaves it open.
	 * `Stop` only closes it again: the run parks before its next statement, so
	 * Step and Run carry on from that line. Only Reset ends a run early.
	 */
	let controller: AbortController | null = null;
	let active: Promise<void> | null = null;
	/** The gate is open — the run is going on its own, not waiting on Step. */
	let playing = $state(false);
	let starting = false;
	let credits = 0;
	let waiting: (() => void) | null = null;

	function gate(): void | Promise<void> {
		if (playing) return;
		if (credits > 0) {
			credits--;
			return;
		}
		return new Promise<void>((resolve) => (waiting = resolve));
	}

	/** Lets a parked run continue. Returns false if it was not parked. */
	function release(): boolean {
		if (!waiting) return false;
		const resume = waiting;
		waiting = null;
		resume();
		return true;
	}

	function run() {
		playing = true;
		if (running) {
			release();
			return;
		}
		begin();
	}

	function step() {
		playing = false;
		if (running) {
			if (!release()) credits++;
			return;
		}
		credits = 1;
		begin();
	}

	/**
	 * Every run starts from the level as authored. Continuing from wherever
	 * the last run left the robot would make the same program do something
	 * different each time it is pressed, which is the opposite of the point.
	 */
	async function begin() {
		// One gate for Run, Step and Cmd+Enter alike: a program too big for the
		// robot's memory never starts. Typing it is fine — only running is not.
		// Run and Step are already disabled here; this catches Cmd+Enter.
		if (overMemory) {
			notice = {
				kind: 'error',
				text: `Das Programm ist zu lang für Dewys Speicher — ${memoryUsed} Anweisungen, Dewy fasst ${level.options.memory}.`,
			};
			playing = false;
			return;
		}

		// `running` only goes up once `execute` is under way, and the reset
		// below yields before that — so a second click needs its own guard.
		if (!engine || !robot || running || starting) return;
		starting = true;

		try {
			const state = engine.state;
			if (state.steps > 0 || state.failed || state.completed) await reset();
		} finally {
			starting = false;
		}

		active = execute();
	}

	/** Pauses: the run finishes its current statement and parks at the gate. */
	function stop() {
		playing = false;
	}

	async function reset() {
		if (active) {
			controller?.abort();
			release();
			await active;
		}
		if (!engine || !world) return;

		engine.reset();
		world.reset(engine.state);
		activeLine = null;
		outcome = null;
		notice = null;
		celebrating = false;
		sync();
	}

	async function execute() {
		if (!robot) return;

		controller = new AbortController();
		running = true;
		outcome = null;
		notice = null;

		const result = await runScript(code, {
			api: robot,
			stage: level.options.languageStage,
			signal: controller.signal,
			onLine: (line) => (activeLine = line),
			onStatement: gate,
		});

		running = false;
		playing = false;
		credits = 0;
		waiting = null;
		controller = null;
		active = null;

		sync();
		report(result);
		outcome = result;
	}

	/** Settles the UI after a run: the toast or the sheet, the line marker. */
	function report(result: RunResult) {
		switch (result.status) {
			case 'complete':
				celebrating = true;
				// Fires on every completion, not once per mount: recording it is
				// idempotent, and a student who resets and solves it again should
				// not silently stop counting.
				props.oncomplete?.({ code, steps: engine?.state.steps ?? 0 });
				break;
			case 'crash':
				activeLine = result.line;
				notice = { kind: 'error', text: result.reason.message };
				break;
			case 'error':
				activeLine = result.line;
				notice = { kind: 'error', text: `Zeile ${result.line}: ${result.message}` };
				break;
		}
	}

	/**
	 * Wraps the robot API so the HUD refreshes after every action. The
	 * interpreter stays unaware of any of it.
	 */
	function synced(api: RobotApi): RobotApi {
		const actions = ['moveForward', 'turnLeft', 'turnRight', 'pick', 'drop', 'open', 'toggle'] as const;

		const wrapped = { ...api };
		for (const name of actions) {
			wrapped[name] = async () => {
				try {
					await api[name]();
				} finally {
					sync();
				}
			};
		}
		return wrapped;
	}

	function sync() {
		if (!engine) return;
		const state = engine.state;
		hud = {
			goals: state.goals.map((goal) => goal.satisfied),
			steps: state.steps,
		};
	}

	function onkeydown(event: KeyboardEvent) {
		if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
		event.preventDefault();
		run();
	}

	// ========================================================
	// Static level copy
	// ========================================================

	function loadCode(): string {
		if (!browser) return savedCode ?? starterCode(level);
		let draft: string | null = null;
		try {
			draft = localStorage.getItem(storageKey);
		} catch {
			// Storage blocked: fall through to what the server remembers.
		}
		return draft ?? savedCode ?? starterCode(level);
	}

	function starterCode(target: Level): string {
		const lines = [`// ${target.name}`];
		if (target.description) lines.push(`// ${target.description}`);
		lines.push('//', '// Schreib dein Programm hier unten und drück dann auf Start.', '');
		return lines.join('\n');
	}

	const CRATE_COLOR_LABEL: Record<CrateColor, string> = {
		grey: 'graue',
		red: 'rote',
		green: 'grüne',
		blue: 'blaue',
		purple: 'lila',
		pink: 'pinke',
		yellow: 'gelbe',
	};

	function goalLabel(goal: GoalCondition): string {
		switch (goal.kind) {
			case 'reach_goal':
				return 'Erreiche das Ziel';
			case 'deliver_all':
				return 'Liefere alle Kisten aus';
			case 'deliver_specific':
				return `Liefere die ${CRATE_COLOR_LABEL[goal.color]} Kiste aus`;
		}
	}
</script>

<svelte:window {onkeydown} />

<div class="screen">
	<Topbar>
		{#snippet left()}
			<nav class="crumbs" aria-label="Kurs">
				{#each props.crumbs ?? [] as crumb, index (index)}
					{#if crumb.href}
						<a class="crumb" href={crumb.href}>{crumb.label}</a>
					{:else}
						<span class="crumb">{crumb.label}</span>
					{/if}
					<span class="crumb-sep" aria-hidden="true">/</span>
				{/each}
				<span class="crumb is-current">{level.name}</span>
			</nav>
			{#if props.counter}
				<span class="pill">{props.counter}</span>
			{/if}
		{/snippet}

		{#snippet right()}
			{#if props.solved || outcome?.status === 'complete'}
				<span class="pill is-solved">Gelöst</span>
			{/if}
			{@render props.actions?.()}
		{/snippet}
	</Topbar>

	<main class="stage">
		<section class="column">
			{#if level.instructions}
				<div class="instructions-cell">
					<LevelInstructions source={level.instructions} />
				</div>
			{/if}

			<div class="editor">
				<CodeMirrorEditor
					{code}
					{activeLine}
					readonly={running}
					stage={level.options.languageStage}
					height="100%"
					onchange={(next) => (code = next)}
				/>

				<div class="notice" role="status" aria-live="polite">
					{#if notice}
						<p class="toast">{notice.text}</p>
					{/if}
				</div>
			</div>

			<div class="controls-cell">
				<RunControls
					running={playing}
					steps={hud.steps}
					energy={level.options.energy}
					memory={level.options.memory}
					{memoryUsed}
					blocked={overMemory}
					bind:speed={view.speed}
					onrun={run}
					onstep={step}
					onstop={stop}
					onreset={reset}
				/>
			</div>
		</section>

		<section class="arena">
			<div class="viewport">
				<canvas bind:this={canvas}></canvas>
			</div>

			<ul class="goals panel">
				{#each level.goals as goal, index (index)}
					<li class="goal" class:is-done={hud.goals[index]}>
						<span class="goal-mark" aria-hidden="true"></span>
						{goalLabel(goal)}
					</li>
				{/each}
			</ul>
		</section>
	</main>

<LevelComplete bind:open={celebrating} steps={hud.steps} next={props.next} />

<!--	<footer class="footer">-->
<!--		<p class="hint">-->
<!--			<Kbd>⌘</Kbd>-->
<!--			<Kbd>↵</Kbd>-->
<!--			<span>run</span>-->
<!--		</p>-->
<!--	</footer>-->
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	/* ── Topbar ─────────────────────────────────────────────── */

	.crumbs {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.crumb {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	a.crumb:hover {
		color: var(--text);
	}

	.crumb.is-current {
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.crumb-sep {
		color: var(--text-faint);
	}

	.pill {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: 8px;
		background: var(--chip-bg);
		color: var(--chip-text);
		font-family: var(--font-ui);
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.pill.is-solved {
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	/* ── Main split ─────────────────────────────────────────── */

	/*
		Two independent columns. The left one stacks instructions, controls and
		editor; the right one stacks goals and viewport. Nothing is shared
		between them, so a tall instructions block only ever squeezes the
		editor — the world stays where it is.
	*/
	.stage {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 480px 1fr;
		gap: 16px;
		padding: 16px;
	}

	.column,
	.arena {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
		min-height: 0;
	}

	.instructions-cell {
		flex-shrink: 0;
	}

	.editor {
		flex: 1;
		position: relative;
		min-height: 0;
	}

	.controls-cell {
		flex-shrink: 0;
		height: 48px;
		display: flex;
		align-items: stretch;
	}

	/* Bottom-left of the editor, clear of the caret and the control row. */
	.notice {
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 20px;
		pointer-events: none;
	}

	.toast {
		--toast: var(--danger);
		/* Hugs short messages; wraps rather than growing past the editor. */
		width: fit-content;
		max-width: 380px;
		padding: 12px 16px;
		border-radius: 8px;
		background: var(--toast);
		box-shadow: 0 4px 10px -2px color-mix(in srgb, var(--toast) 60%, transparent);
		color: #fff;
		/* The editor sets a monospace family on everything inside it. */
		font-family: var(--font-ui);
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.35;
	}

	/*
		No panel chrome: the world is the scene and nothing else. The background
		only shows through before the first frame is painted.
	*/
	.viewport {
		flex: 1;
		position: relative;
		min-height: 0;
		background: var(--accent-soft);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.viewport canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.goals {
		flex-shrink: 0;
		min-height: 48px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 36px;
		margin: 0;
		padding: 8px 24px;
		list-style: none;
	}

	.goal {
		display: flex;
		align-items: center;
		gap: 11px;
		font-size: 0.9375rem;
		font-weight: 700;
		color: var(--text);
	}

	/* A square on its corner — the diamond the goal markers use in-world. */
	.goal-mark {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		border: 2px solid var(--text-faint);
		border-radius: 3px;
		rotate: 45deg;
		transition: background 200ms ease, border-color 200ms ease;
	}

	.goal.is-done {
		color: var(--text-muted);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	.goal.is-done .goal-mark {
		background: var(--success);
		border-color: var(--success);
	}

	/* ── Footer ─────────────────────────────────────────────── */

	.footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 0 22px 14px;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-code);
		font-size: 0.6875rem;
		color: var(--text-faint);
	}

	@media (max-width: 900px) {
		.screen {
			height: auto;
			overflow: visible;
		}

		.stage {
			grid-template-columns: 1fr;
		}

		/* Code first, then how to run it; the world, then what it asks for. */
		.editor {
			order: -1;
		}

		.instructions-cell {
			order: -2;
		}

		.goals {
			order: 1;
		}

		.editor {
			height: 360px;
		}

		.viewport {
			height: 420px;
		}
	}
</style>
