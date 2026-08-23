import * as THREE from 'three';

/**
 * Placeholder keycard — a small tilted card hovering above its tile.
 * Origin convention: base-centre, y=0 is the floor plane.
 */
export function createKeycard(options: { scale?: number; color?: number } = {}): THREE.Group {
    const { scale = 1, color = 0xf0d060 } = options;

    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.3,
        flatShading: true,
    });
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.18), material);
    card.position.y = 0.22;
    card.rotation.set(-0.5, 0.4, 0);
    group.add(card);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.022, 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2a32, flatShading: true }));
    stripe.position.set(0, 0.222, 0.05);
    stripe.rotation.copy(card.rotation);
    group.add(stripe);

    group.scale.setScalar(scale);
    return group;
}
