/**
 * A small seeded random source, for anything the renderer invents rather than
 * reads from the level — see `environment.ts`.
 *
 * Seeded so the invention is stable: the same level must look the same to
 * every student on every reload, and a teacher's screenshot must match what
 * the class sees. Nothing here touches `Math.random`.
 */

/** FNV-1a: turns a string (a level id) into a 32-bit seed. */
export function hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

export type Rng = {
    /** Uniform in [0, 1). */
    next(): number;
    /** Uniform in [min, max). */
    range(min: number, max: number): number;
    /** Uniform integer in [min, max], both ends included. */
    int(min: number, max: number): number;
    chance(probability: number): boolean;
    pick<T>(values: readonly T[]): T;
    /** A shuffled copy; the input is left alone. */
    shuffle<T>(values: readonly T[]): T[];
};

/** Mulberry32: tiny, fast, and plenty for scattering props. */
export function createRng(seed: number): Rng {
    let state = seed >>> 0;

    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));

    return {
        next,
        range: (min, max) => min + next() * (max - min),
        int,
        chance: (probability) => next() < probability,
        pick: (values) => values[int(0, values.length - 1)],
        shuffle: (values) => {
            const copy = [...values];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = int(0, i);
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        },
    };
}
