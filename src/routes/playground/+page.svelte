<script lang="ts">
    import { onMount } from 'svelte'
    import { World } from '$lib/game/world'
    import { createWorldState } from '$lib/game/worldState.svelte'
    import { createLevelState } from '$lib/game/level-state'
    import { tutorial01 } from '$lib/game/levels'
    import { ahead, sameCoord, turn } from '$lib/game/grid'
    import { RunCancelled, type WorldEvent } from '$lib/game/events'
    import type { Coord, Direction } from '$lib/game/level'

    let canvas: HTMLCanvasElement
    let world: World | undefined = $state()

    const view = createWorldState()
    const level = tutorial01

    onMount(() => {
        const instance = new World(canvas, view)
        instance.loadLevel(level, createLevelState(level))
        world = instance
        return () => instance.destroy()
    })

    // ────────────────────────────────────────────────────────────────
    // Temporary harness.
    //
    // This mirrors just enough robot state to emit coherent events, and
    // deliberately enforces no rules — walking into a wall walks into a
    // wall. Its whole job is to exercise the animation pipeline before the
    // engine exists; the engine replaces every line of it.
    // ────────────────────────────────────────────────────────────────

    let position: Coord = $state({ ...level.robot.position })
    let facing: Direction = $state(level.robot.facing)
    let carrying: string | null = $state(null)

    function send(events: WorldEvent[]) {
        world?.play(events).catch((error) => {
            if (!(error instanceof RunCancelled)) throw error
        })
    }

    function crateAt(coord: Coord): string | null {
        const crate = level.items.find((item) => item.kind !== 'keycard' && sameCoord(item.position, coord))
        return crate?.id ?? null
    }

    function moveForward() {
        const to = ahead(position, facing)
        const events: WorldEvent[] = [{ kind: 'move', from: position, to }]
        const pushed = carrying ? null : crateAt(to)
        if (pushed) events.push({ kind: 'push', crateId: pushed, from: to, to: ahead(to, facing) })
        position = to
        send(events)
    }

    function rotate(rotation: 'left' | 'right') {
        const to = turn(facing, rotation)
        send([{ kind: 'turn', from: facing, to, rotation }])
        facing = to
    }

    function pick() {
        const target = ahead(position, facing)
        const crateId = crateAt(target)
        if (!crateId || carrying) return
        carrying = crateId
        send([{ kind: 'pick', crateId, from: target }])
    }

    function drop() {
        if (!carrying) return
        send([{ kind: 'drop', crateId: carrying, to: ahead(position, facing) }])
        carrying = null
    }

    function crash() {
        send([{ kind: 'crash', at: position, reason: 'Test panic' }])
    }

    function reset() {
        position = { ...level.robot.position }
        facing = level.robot.facing
        carrying = null
        world?.reset(createLevelState(level))
    }
</script>

<div class="wrapper">
    <h1>Playground — {level.name}</h1>

    <canvas class="canvas" bind:this={canvas}></canvas>

    <div class="controls">
        <button onclick={moveForward}>Forward</button>
        <button onclick={() => rotate('left')}>Turn left</button>
        <button onclick={() => rotate('right')}>Turn right</button>
        <button onclick={pick} disabled={carrying !== null}>Pick</button>
        <button onclick={drop} disabled={carrying === null}>Drop</button>
        <button onclick={crash}>Crash</button>
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

    <p class="status">
        Robot at ({position.x}, {position.y}) facing {facing}
        {#if carrying}· carrying {carrying}{/if}
    </p>
</div>

<style>
    .wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 1.5rem 0;
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
        font: 0.85rem/1 system-ui, sans-serif;
        border: 1px solid #bbb;
        border-radius: 6px;
        background: #f6f6f6;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.45;
        cursor: default;
    }

    .status {
        font: 0.8rem/1 system-ui, sans-serif;
        color: #666;
    }
</style>
