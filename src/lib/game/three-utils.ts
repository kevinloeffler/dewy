import * as THREE from 'three';

/** Anything with a `dispose()` — geometries and materials, here. */
type Disposable = { dispose(): void };

/**
 * Dispose every geometry and material reachable from `root`.
 *
 * Resources are shared freely across meshes (a tile factory hands the same
 * `BoxGeometry` to every floor tile), so each is disposed exactly once.
 *
 * `keep` is for resources that outlive the objects using them. `TileFactory`
 * memoises its geometries and materials across levels and disposes them
 * itself, so tearing a level down must not take them with it — otherwise the
 * next `loadLevel` rebuilds the scene out of freed GPU buffers.
 */
export function disposeObject(root: THREE.Object3D, keep?: ReadonlySet<Disposable>): void {
    const seen = new Set<Disposable>();

    const dispose = (resource: Disposable | null | undefined) => {
        if (!resource || seen.has(resource) || keep?.has(resource)) return;
        seen.add(resource);
        resource.dispose();
    };

    root.traverse((object) => {
        const mesh = object as Partial<THREE.Mesh>;
        if (mesh.geometry) dispose(mesh.geometry);
        if (!mesh.material) return;
        if (Array.isArray(mesh.material)) {
            for (const material of mesh.material) dispose(material);
        } else {
            dispose(mesh.material);
        }
    });
}

/** Detach and dispose every child of `group`, leaving the group empty. */
export function clearGroup(group: THREE.Object3D, keep?: ReadonlySet<Disposable>): void {
    for (const child of [...group.children]) {
        group.remove(child);
        disposeObject(child, keep);
    }
}
