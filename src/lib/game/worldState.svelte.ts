/**
 * Presentation state only — camera and playback.
 *
 * Game state deliberately does not live here. `LevelState` is owned by the
 * engine, which must stay Svelte-free so it can be unit-tested in plain
 * Node, and `World` reads it 60×/s where a deep rune proxy would only cost.
 * `World` is a plain class that polls these fields each frame.
 */
export type WorldState = {
    /** Half-height of the orthographic frustum. Smaller = closer in. */
    zoom: number;
    /** Bounds the wheel zoom stays inside. Closest in / furthest out. */
    minZoom: number;
    maxZoom: number;
    /** Distance of the camera along each axis from the level centre. */
    cameraPosition: number;
    /** Animation speed multiplier. 2 = twice as fast. */
    speed: number;
    paused: boolean;
};

export function createWorldState(init: Partial<WorldState> = {}): WorldState {
    // `$state` must initialize a declaration — it cannot be returned directly.
    const state = $state({
        zoom: 6,
        minZoom: 2,
        maxZoom: 12,
        cameraPosition: 10,
        speed: 1,
        paused: false,
        ...init,
    });
    return state;
}
