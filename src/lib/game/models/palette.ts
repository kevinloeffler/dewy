import * as THREE from 'three';

/**
 * The warehouse design kit's shared palette: every piece of dressing — the
 * decorations, the walls, the yard, the street — is built from these few
 * materials, which is most of why the kit reads as one set.
 *
 * Fresh instances per call, so whoever builds with them owns them and
 * `clearGroup` disposes them along with the meshes.
 */
const KIT: Record<KitMaterialName, THREE.MeshStandardMaterialParameters> = {
    shell:  { color: 0xf2ece1, roughness: 0.45, metalness: 0.05 },
    accent: { color: 0xf07a3c, roughness: 0.40, metalness: 0.05 },
    dark:   { color: 0x3a3f47, roughness: 0.60, metalness: 0.25 },
    wood:   { color: 0xc79a63, roughness: 0.75, metalness: 0.00 },
    glass:  { color: 0x2fb8b0, roughness: 0.20, metalness: 0.30, emissive: 0x0d4f4c, emissiveIntensity: 0.6 },
    ground: { color: 0xd6c9b2, roughness: 0.95, metalness: 0.00 },
    // Not the kit's: Dewy's own, for the lot around the warehouse. Darker
    // than it renders — the scene's strong ambient light lifts it a lot.
    grass:  { color: 0xa9b89c, roughness: 1.00, metalness: 0.00 },
    // The warehouse walls: the kit's cream, greyed down towards the light
    // floor tiles so the room reads as one space rather than a bright frame.
    wall:   { color: 0xd9d6d0, roughness: 0.60, metalness: 0.00 },
    // The warehouse windows: the kit's glass, desaturated, so large panes
    // don't outshout the small glowing lamps that keep the full teal.
    pane:   { color: 0xbcd3d1, roughness: 0.30, metalness: 0.00, emissive: 0x2e4d4b, emissiveIntensity: 0.3 },
    // Also Dewy's: the neighbouring buildings, kept neutral so the warehouse
    // is the only thing on screen with colour in it.
    greyLight: { color: 0xc4c4c4, roughness: 0.90, metalness: 0.00 },
    greyMid:   { color: 0xa2a2a2, roughness: 0.90, metalness: 0.00 },
    greyDark:  { color: 0x838383, roughness: 0.90, metalness: 0.00 },
};

export type KitMaterialName =
    | 'shell' | 'accent' | 'dark' | 'wood' | 'glass' | 'ground'
    | 'grass' | 'wall' | 'pane' | 'greyLight' | 'greyMid' | 'greyDark';

export function kitMaterial(name: KitMaterialName): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial(KIT[name]);
}

export function kitMaterials(): Record<KitMaterialName, THREE.MeshStandardMaterial> {
    return {
        shell: kitMaterial('shell'),
        accent: kitMaterial('accent'),
        dark: kitMaterial('dark'),
        wood: kitMaterial('wood'),
        glass: kitMaterial('glass'),
        ground: kitMaterial('ground'),
        grass: kitMaterial('grass'),
        wall: kitMaterial('wall'),
        pane: kitMaterial('pane'),
        greyLight: kitMaterial('greyLight'),
        greyMid: kitMaterial('greyMid'),
        greyDark: kitMaterial('greyDark'),
    };
}

export type KitMaterials = ReturnType<typeof kitMaterials>;
