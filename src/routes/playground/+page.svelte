<script lang="ts">
    import { onMount, untrack } from 'svelte'
    import { World } from '$lib/game/world'
    import { createWorldState } from '$lib/game/worldState.svelte'
    import { GameEngine } from '$lib/game/engine'
    import { createRobotApi, LevelComplete, RobotCrash, type RobotApi } from '$lib/game/robot-api'
    import { RunCancelled } from '$lib/game/events'
    import Console from '$lib/components/Console.svelte'
    import type { LogEntry } from '$lib/components/Console.svelte'
    import type { PageServerData } from './$types'

    let { data }: { data: PageServerData } = $props()

    let canvas: HTMLCanvasElement
    let world: World | undefined
    let engine: GameEngine | undefined
    let robot: RobotApi | undefined

    const view = createWorldState()
    // Read once: the engine and the scene are built from it in `onMount`, so
    // swapping levels means a fresh navigation, not a reactive update.
    const level = untrack(() => data.level)

    // The engine owns `LevelState` and is deliberately not reactive — it is
    // read 60×/s by the renderer, where a rune proxy would only cost. The UI
    // mirrors the parts it shows into runes after every action instead.
    let logs: LogEntry[] = $state([])
    let busy = $state(false)
    let over = $state(false)
    let view_ = $state({
        x: 0, y: 0,
        facing: 'north' as string,
        carrying: null as string | null,
        inventory: [] as string[],
        satisfied: 0,
        goals: 0,
        steps: 0,
    })
    let sensors = $state({
        isBlocked: false, isCrate: false, isCarrying: false,
        isGoal: false, isDropOff: false, isDangerous: false,
        crateColor: null as string | null,
    })

    onMount(() => {
        const instance = new World(canvas, view)
        const game = new GameEngine(level)

        world = instance
        engine = game
        robot = createRobotApi(game, instance)

        // The engine has already settled its derived state, so snapping the
        // scene from it is enough — no need to animate `initialize()`.
        instance.loadLevel(level, game.state)
        sync()

        return () => instance.destroy()
    })

    function sync() {
        if (!engine || !robot) return
        const state = engine.state
        view_ = {
            x: state.robot.position.x,
            y: state.robot.position.y,
            facing: state.robot.facing,
            carrying: state.robot.carrying,
            inventory: [...state.robot.inventory],
            satisfied: state.goals.filter((goal) => goal.satisfied).length,
            goals: state.goals.length,
            steps: state.steps,
        }
        sensors = {
            isBlocked: robot.isBlocked(),
            isCrate: robot.isCrate(),
            isCarrying: robot.isCarrying(),
            isGoal: robot.isGoal(),
            isDropOff: robot.isDropOff(),
            isDangerous: robot.isDangerous(),
            crateColor: robot.crateColor(),
        }
        over = state.failed || state.completed
    }

    function log(kind: LogEntry['kind'], text: string) {
        logs = [...logs, { kind, text }]
    }

    async function act(name: string, run: () => Promise<void>) {
        if (!engine || busy || over) return
        busy = true
        log('cmd', `${name}();`)

        const deliveredBefore = engine.state.crates.filter((crate) => crate.delivered).length

        try {
            await run()
        } catch (error) {
            if (error instanceof RobotCrash) log('err', error.message)
            else if (error instanceof LevelComplete) log('ok', 'Level complete!')
            else if (!(error instanceof RunCancelled)) throw error
        } finally {
            const deliveredAfter = engine.state.crates.filter((crate) => crate.delivered).length
            if (deliveredAfter > deliveredBefore) log('ok', 'Crate delivered.')
            sync()
            busy = false
        }
    }

    function reset() {
        if (!engine || !world) return
        engine.reset()
        world.reset(engine.state)
        logs = []
        busy = false
        sync()
    }

    const actions: [string, () => Promise<void>][] = [
        ['moveForward', () => robot!.moveForward()],
        ['turnLeft',    () => robot!.turnLeft()],
        ['turnRight',   () => robot!.turnRight()],
        ['pick',        () => robot!.pick()],
        ['drop',        () => robot!.drop()],
        ['open',        () => robot!.open()],
        ['toggle',      () => robot!.toggle()],
    ]
</script>

<div class="wrapper">
    <h1>Playground — {level.name}</h1>
    <p class="brief">{level.description}</p>

    <canvas class="canvas" bind:this={canvas}></canvas>

    <div class="controls">
        {#each actions as [name, run] (name)}
            <button onclick={() => act(name, run)} disabled={over}>{name}()</button>
        {/each}
        <button onclick={reset}>Reset</button>
        <button onclick={() => (view.paused = !view.paused)}>
            {view.paused ? 'Resume' : 'Pause'}
        </button>
    </div>

    <div class="sliders">
        <label>
            Zoom <output>{view.zoom.toFixed(1)}</output>
            <input type="range" min="2" max="20" step="0.5" bind:value={view.zoom} />
        </label>
        <label>
            Speed <output>{view.speed.toFixed(2)}×</output>
            <input type="range" min="0.25" max="4" step="0.25" bind:value={view.speed} />
        </label>
    </div>

    <div class="panels">
        <div class="panel">
            <Console {logs} height={160} />
        </div>

        <dl class="readout">
            <dt>at</dt>
            <dd>({view_.x}, {view_.y}) facing {view_.facing}</dd>
            <dt>carrying</dt>
            <dd>{view_.carrying ?? '—'}</dd>
            <dt>inventory</dt>
            <dd>{view_.inventory.length ? view_.inventory.join(', ') : '—'}</dd>
            <dt>goals</dt>
            <dd>{view_.satisfied} / {view_.goals}</dd>
            <dt>energy</dt>
            <dd>{view_.steps}{level.options.energy === null ? '' : ` / ${level.options.energy}`}</dd>
            <dt>memory</dt>
            <dd>{level.options.memory === null ? 'unlimited' : level.options.memory}</dd>
            <dt>sensing</dt>
            <dd class="sensing">
                {#each Object.entries(sensors) as [name, value] (name)}
                    <span class:on={value === true}>{name}: {value === null ? 'null' : value}</span>
                {/each}
            </dd>
        </dl>
    </div>
</div>

<style>
    .wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 1.5rem 0;
    }

    .brief {
        margin: 0;
        font: 0.85rem/1.4 system-ui, sans-serif;
        color: #666;
    }

    .canvas {
        width: min(90vw, 1000px);
        height: min(60vh, 800px);
    }

    .controls,
    .sliders {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        align-items: center;
        justify-content: center;
    }

    .sliders label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font: 0.85rem/1 system-ui, sans-serif;
    }

    .sliders output {
        min-width: 3.5ch;
        font-variant-numeric: tabular-nums;
    }

    button {
        padding: 0.4rem 0.8rem;
        font: 0.85rem/1 ui-monospace, monospace;
        border: 1px solid #bbb;
        border-radius: 6px;
        background: #f6f6f6;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .panels {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: flex-start;
        width: min(90vw, 1000px);
    }

    .panel {
        flex: 1 1 22rem;
        min-width: 0;
    }

    .readout {
        flex: 1 1 18rem;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.2rem 0.75rem;
        margin: 0;
        font: 0.78rem/1.5 ui-monospace, monospace;
        color: #444;
    }

    .readout dt {
        color: #999;
    }

    .readout dd {
        margin: 0;
    }

    .sensing {
        display: flex;
        flex-wrap: wrap;
        gap: 0.15rem 0.6rem;
        color: #aaa;
    }

    .sensing .on {
        color: #d97757;
        font-weight: 600;
    }
</style>
