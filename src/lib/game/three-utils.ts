import * as THREE from 'three';

/**
 * Dispose every geometry and material reachable from `root`.
 *
 * Geometries and materials are shared freely across meshes (a tile factory
 * hands the same `BoxGeometry` to every floor tile), so each resource is
 * disposed exactly once.
 */
export function disposeObject(root: THREE.Object3D): void {
    const seen = new Set<{ dispose(): void }>();

    const dispose = (resource: { dispose(): void } | null | undefined) => {
        if (!resource || seen.has(resource)) return;
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
export function clearGroup(group: THREE.Object3D): void {
    for (const child of [...group.children]) {
        group.remove(child);
        disposeObject(child);
    }
}
