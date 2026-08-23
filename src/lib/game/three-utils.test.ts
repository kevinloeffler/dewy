import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clearGroup } from './three-utils';
import { TileFactory } from './models/tiles';

/**
 * Geometry and material disposal needs no WebGL context, so this runs in the
 * same plain-Node suite as the engine.
 */

function disposeSpy() {
    const disposed = new Set<object>();
    const watch = <T extends THREE.BufferGeometry | THREE.Material>(resource: T): T => {
        resource.addEventListener('dispose', () => disposed.add(resource));
        return resource;
    };
    return { disposed, watch };
}

describe('clearGroup', () => {
    it('disposes resources the level owns', () => {
        const { disposed, watch } = disposeSpy();
        const group = new THREE.Group();
        const geometry = watch(new THREE.BoxGeometry(1, 1, 1));
        const material = watch(new THREE.MeshBasicMaterial());
        group.add(new THREE.Mesh(geometry, material));

        clearGroup(group);

        expect(group.children).toHaveLength(0);
        expect(disposed.has(geometry)).toBe(true);
        expect(disposed.has(material)).toBe(true);
    });

    it('spares resources the tile factory memoises across levels', () => {
        const { disposed, watch } = disposeSpy();
        const factory = new TileFactory();
        const root = new THREE.Group();

        // Two floor tiles share one geometry and one material.
        root.add(factory.create({ kind: 'floor' }, { x: 0, y: 0 })!);
        root.add(factory.create({ kind: 'floor' }, { x: 2, y: 0 })!);

        const shared = factory.shared();
        expect(shared.size).toBeGreaterThan(0);
        for (const resource of shared) watch(resource as THREE.BufferGeometry);

        clearGroup(root, shared);

        // Tearing the level down must leave the cache usable, or the next
        // loadLevel rebuilds the scene out of freed GPU buffers.
        expect(disposed.size).toBe(0);

        factory.dispose();
        expect(disposed.size).toBe(shared.size);
    });

    it('still disposes per-instance resources when a keep set is given', () => {
        const { disposed, watch } = disposeSpy();
        const factory = new TileFactory();
        const root = new THREE.Group();

        root.add(factory.create({ kind: 'floor' }, { x: 0, y: 0 })!);

        const overlay = new THREE.Mesh(
            watch(new THREE.BoxGeometry(1, 0.01, 1)),
            watch(new THREE.MeshBasicMaterial()),
        );
        root.add(overlay);

        clearGroup(root, factory.shared());

        // The sensor overlay belongs to the level, not the factory.
        expect(disposed.size).toBe(2);
    });
});
