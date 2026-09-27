import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

/**
 * Collapse a static model into one mesh per material.
 *
 * For scenery that never moves and is never picked — hundreds of small boxes
 * cost a draw call each, and the same geometry baked together costs one per
 * colour. Each mesh's transform relative to `root` is baked into its
 * vertices, the source geometries are disposed, and the materials carry over
 * untouched, so share one material between pieces to get anything out of
 * this. Every source geometry must be indexed, as three.js's built-in
 * primitives are.
 */
export function mergeStatic(root: THREE.Object3D): THREE.Group {
    root.updateMatrixWorld(true);
    const toRoot = root.matrixWorld.clone().invert();
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const sources = new Set<THREE.BufferGeometry>();

    root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        sources.add(mesh.geometry);
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
        const list = byMaterial.get(mesh.material) ?? [];
        list.push(geometry);
        byMaterial.set(mesh.material, list);
    });

    const merged = new THREE.Group();
    for (const [material, geometries] of byMaterial) {
        const geometry = mergeGeometries(geometries, false);
        for (const part of geometries) part.dispose();
        if (geometry) merged.add(new THREE.Mesh(geometry, material));
    }
    for (const geometry of sources) geometry.dispose();
    return merged;
}


/**
 * The game's fixed isometric view: an orthographic frustum looked at down
 * `(-1, -1, -1)`. Shared with the level designer's picking tests, so the
 * angle they verify against is the angle the game actually renders.
 */
export function createIsometricCamera(
    zoom: number,
    aspect: number,
    distance: number,
): THREE.OrthographicCamera {
    // The clip planes straddle the camera. An orthographic view of a ground
    // plane always has part of that plane *behind* the camera — the rays are
    // parallel, so the near half of the floor keeps going past the lens
    // instead of vanishing at a horizon. A positive near would cut the
    // world's base off across the bottom of the frame.
    const camera = new THREE.OrthographicCamera(
        -zoom * aspect,
        zoom * aspect,
        zoom,
        -zoom,
        -1000, 1000,
    )
    aimIsometricCamera(camera, new THREE.Vector3(0, 0, 0), distance)
    return camera
}

/** Point an isometric camera at `centre`, from `distance` along each axis. */
export function aimIsometricCamera(
    camera: THREE.OrthographicCamera,
    centre: THREE.Vector3,
    distance: number,
) {
    camera.position.set(centre.x + distance, distance, centre.z + distance)
    camera.lookAt(centre)
    camera.updateProjectionMatrix()
}
