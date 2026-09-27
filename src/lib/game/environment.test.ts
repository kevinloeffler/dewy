import { describe, expect, it } from 'vitest';
import {
    DOOR_MIN_WIDTH,
    FACADE_FRONT,
    WORLD_REACH,
    doorSlots,
    drivewayRect,
    planEnvironment,
    type EnvironmentPlan,
} from './environment';
import { createRng, hashString } from './random';

const level = (id: string, width = 8, height = 6) => ({ id, width, height });

/** A spread of shapes and seeds, so a property holds beyond one lucky layout. */
function samples(): EnvironmentPlan[] {
    const plans: EnvironmentPlan[] = [];
    for (const [w, h] of [[1, 1], [3, 3], [4, 2], [8, 6], [12, 4], [20, 20]]) {
        for (let i = 0; i < 25; i++) plans.push(planEnvironment(level(`level-${i}`, w, h)));
    }
    return plans;
}

describe('random', () => {
    it('repeats a sequence for the same seed', () => {
        const a = createRng(hashString('abc'));
        const b = createRng(hashString('abc'));
        for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    });

    it('stays inside its ranges', () => {
        const rng = createRng(1);
        for (let i = 0; i < 500; i++) {
            const n = rng.int(2, 5);
            expect(n).toBeGreaterThanOrEqual(2);
            expect(n).toBeLessThanOrEqual(5);
            const x = rng.next();
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(1);
        }
    });
});

describe('planEnvironment', () => {
    it('is deterministic per level id', () => {
        expect(planEnvironment(level('a'))).toEqual(planEnvironment(level('a')));
    });

    it('differs between levels', () => {
        expect(planEnvironment(level('a'))).not.toEqual(planEnvironment(level('b')));
    });

    it('only cuts a door into a wide enough back wall, clear of both ends', () => {
        for (const plan of samples()) {
            if (plan.width < DOOR_MIN_WIDTH) {
                expect(plan.door).toBeNull();
                continue;
            }
            expect(plan.door).not.toBeNull();
            const [a, b] = doorSlots(plan.door!);
            expect(a).toBeGreaterThanOrEqual(1);
            expect(b).toBeLessThanOrEqual(plan.width - 2);
        }
    });

    it('never overlaps two wall props, or a prop and the door', () => {
        for (const plan of samples()) {
            for (const wall of ['back', 'left'] as const) {
                const length = wall === 'back' ? plan.width : plan.height;
                const used = new Set<number>();
                if (wall === 'back' && plan.door !== null) doorSlots(plan.door).forEach((s) => used.add(s));

                for (const prop of plan.wallProps.filter((p) => p.wall === wall)) {
                    for (let s = prop.slot; s < prop.slot + prop.span; s++) {
                        expect(s).toBeGreaterThanOrEqual(0);
                        expect(s).toBeLessThan(length);
                        expect(used.has(s)).toBe(false);
                        used.add(s);
                    }
                }
            }
        }
    });

    it('keeps the yard outside the level, clear of the driveway, and apart', () => {
        for (const plan of samples()) {
            const driveway = plan.door === null ? null : drivewayRect(plan.door);
            for (const prop of plan.yardProps) {
                // Behind one of the two walls: never on the level's own floor.
                expect(prop.x < -0.5 || prop.z < -0.5).toBe(true);
                // Never into the facades.
                expect(prop.x - prop.radius).toBeGreaterThan(FACADE_FRONT);
                expect(prop.z - prop.radius).toBeGreaterThan(FACADE_FRONT);

                if (driveway && prop.kind !== 'forklift') {
                    const inside = prop.x + prop.radius > driveway.x0 && prop.x - prop.radius < driveway.x1
                        && prop.z + prop.radius > driveway.z0 && prop.z - prop.radius < driveway.z1;
                    expect(inside).toBe(false);
                }
            }

            const scattered = plan.yardProps.filter((p) => p.kind !== 'guard_rail');
            for (let i = 0; i < scattered.length; i++) {
                for (let j = i + 1; j < scattered.length; j++) {
                    const a = scattered[i], b = scattered[j];
                    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(a.radius + b.radius);
                }
            }
        }
    });

    it('runs both facade rows past the frame without overlapping', () => {
        for (const plan of samples()) {
            for (const row of ['back', 'left'] as const) {
                const facades = plan.facades.filter((f) => f.row === row).sort((a, b) => a.start - b.start);
                const reach = (row === 'back' ? plan.width : plan.height) + WORLD_REACH;
                expect(facades.at(-1)!.end).toBeCloseTo(reach);
                for (let i = 1; i < facades.length; i++) {
                    expect(facades[i].start).toBeGreaterThanOrEqual(facades[i - 1].end - 1e-9);
                }
                for (const f of facades) expect(f.end - f.start).toBeGreaterThan(0.5);
            }
        }
    });

    it('leaves the street open where the driveway meets it', () => {
        for (const plan of samples()) {
            if (plan.door === null) continue;
            const { x0, x1 } = drivewayRect(plan.door);
            for (const f of plan.facades.filter((f) => f.row === 'back')) {
                expect(f.end <= x0 || f.start >= x1).toBe(true);
            }
        }
    });
});
