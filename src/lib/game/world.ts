import * as THREE from 'three'
import { type WorldState } from './worldState.svelte'
import type { Coord, Decoration, Level, TileKey } from './level'
import type { LevelState } from './level-state'
import type { EventPlayer, WorldEvent, WorldEventKind } from './events'
import { coordKey, DIRECTION_YAW, tileAt } from './grid'
import { footprintOf, railConnections } from './decorations'
import {
    AnimationQueue,
    easeInOutCubic,
    easeOutCubic,
    hold,
    instant,
    tween,
    type Animation,
} from './animation'
import { aimIsometricCamera, clearGroup, createIsometricCamera, disposeObject } from './three-utils'
import { pickTileFrom } from './editor/picking'
import type { Brush } from './editor/brush'
import { decorationPlacement, sensorPlacement } from './editor/operations'
import { sensorZone } from './sensors'
import { CELEBRATE_DURATION, createRoboter, type Roboter } from '$lib/game/models/roboter'
import { createCrate } from '$lib/game/models/crate'
import { createKeycard } from '$lib/game/models/keycard'
import {
    createMotionSensor,
    createSensorZoneTile,
    SENSOR_OFF,
    SENSOR_ON,
    zoneEdges,
    type MotionSensorModel,
} from '$lib/game/models/motion-sensor'
import { COLORS, TileFactory } from '$lib/game/models/tiles'
import { createDecoration } from '$lib/game/models/warehouse'
import { buildEnvironment } from '$lib/game/models/environment'
import { environmentKey, planEnvironment } from './environment'
import { wallShape } from './partitions'


/**
 * Tug is authored wide and squat — 0.88 across the tracks at scale 1, against
 * the 1-unit tile. This keeps the tracks inside the tile with a little margin
 * and leaves the loader claws reaching ahead of it, which is where they belong.
 */
const ROBOT_SCALE = 0.95

/**
 * Behind the facades' rooftops — the one place the world has no ground. The
 * kit's warm paper tone, cooled a little so it reads as sky.
 */
const SKY_COLOR = 0xe4e8e6

/**
 * The void under the level. The lot covers everything around the level, so
 * this only shows through a pit — the same near-black as the pit's plate.
 */
const VOID_COLOR = COLORS.void

/**
 * Base height. Below the plate a pit tile drops to (y = -0.6), so pits still
 * read as holes rather than filling in with ground.
 */
const BASE_Y = -0.75

/**
 * Zoom per unit of wheel delta, applied exponentially so a notch changes the
 * view by the same *proportion* whether we are close in or far out.
 */
const ZOOM_SENSITIVITY = 0.0015

/**
 * How fast belt chevrons scroll, in tiles per second. Ambient, so it is not
 * the speed anything actually travels at — it just has to read as "running".
 */
const BELT_SCROLL = 0.45

/**
 * The select tool's outline colours. Warm, so a selection never reads as the
 * white hover highlight it usually sits under — and a second, cooler one for
 * the tiles a selection only *points* at, which an edit and a delete leave
 * alone.
 */
const SELECTION_COLOR = 0xffa53c
const LINKED_COLOR = 0x7fb2ff

/**
 * How solid the designer's ghost preview is.
 *
 * Low enough to read as a promise rather than a placement, high enough that a
 * pallet's slats are still countable.
 */
const GHOST_OPACITY = 0.55

/** What a stopped belt's chevrons fade into: the slab they sit on. */
const BELT_DARK = new THREE.Color(COLORS.conveyor)

/** Seconds at speed 1. The queue applies the speed multiplier. */
const DURATIONS: Record<WorldEventKind, number> = {
    move:        0.40,
    push:        0.40,
    conveyRobot: 0.35,
    conveyCrate: 0.35,
    turn:        0.30,
    pick:        0.35,
    drop:        0.30,
    deliver:     0.45,
    pickKeycard: 0.25,
    door:        0.35,
    belt:        0.25,
    switch:      0.25,
    plate:       0.15,
    sensor:      0.30,
    crateDelivered: 0.35,
    bump:        0.25,
    crash:       0.90,
    goalReached: CELEBRATE_DURATION,
}


/**
 * One belt tile, as the renderer sees it.
 *
 * `beltId` is null for a belt nothing drives — it always runs forward and is
 * never dimmed, so it needs no material of its own and `material` is null too.
 */
type BeltVisual = {
    beltId: string | null
    chevrons: THREE.Object3D
    material: THREE.MeshLambertMaterial | null
    /** Base colour to fade back to when the belt is running. */
    litColor: THREE.Color
    running: boolean
    reversed: boolean
}


/**
 * Render at the screen's real resolution — without this a HiDPI display gets
 * a CSS-pixel image scaled up, and the scene looks soft. Capped at 2: a 3×
 * phone would pay more than twice the fill cost for a difference nobody sees.
 */
function pixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, 2)
}

/** What a ghost is cached against: rebuild it only when this changes. */
function ghostKey(brush: Brush): string {
    switch (brush.kind) {
        case 'tile': return `tile:${JSON.stringify(brush.tile)}`
        case 'item': return `item:${JSON.stringify(brush.item)}`
        // Not the facing: the robot's ghost is turned by its yaw, not rebuilt.
        case 'robot': return 'robot'
        // The zone is part of the preview, so its size is part of the key.
        case 'sensor': return `sensor:${brush.width}x${brush.depth}:${brush.initiallyActive}`
        default: return brush.kind
    }
}

/**
 * The sensor brush's preview: the device, plus the zone it would watch if it
 * stood on `at` — clipped to the grid by the same `sensorZone` the placed one
 * is drawn with. Built relative to `at`, since `setGhost` moves it there.
 */
function sensorGhost(
    level: Level,
    brush: Extract<Brush, { kind: 'sensor' }>,
    at: Coord,
): THREE.Object3D {
    const group = new THREE.Group()
    group.add(createMotionSensor({ active: brush.initiallyActive }).group)
    const zone = sensorZone(level, {
        sensorId: '',
        position: at,
        width: brush.width,
        depth: brush.depth,
        initiallyActive: brush.initiallyActive,
    })
    const edges = zoneEdges(zone)
    zone.forEach((coord, i) => {
        const tile = createSensorZoneTile(brush.initiallyActive, edges[i])
        tile.position.set(coord.x - at.x, 0.012, coord.y - at.y)
        group.add(tile)
    })
    return group
}

/**
 * Make a freshly built model read as a preview.
 *
 * Every material is *cloned* before it is made translucent: a tile ghost holds
 * the same memoised material as every floor slab in the level, and dimming it
 * in place would fade the level along with it. One clone per distinct material,
 * so a shelf's twenty meshes still share four.
 *
 * `depthTest` goes off on purpose. A preview has to be visible wherever it is
 * about to land — under a wall, down a pit — and the mild see-through look that
 * buys is what tells a teacher this is not placed yet.
 */
function ghostify(root: THREE.Object3D) {
    const clones = new Map<THREE.Material, THREE.Material>()

    root.traverse((object) => {
        const mesh = object as Partial<THREE.Mesh>
        if (!mesh.material || Array.isArray(mesh.material)) return

        let ghost = clones.get(mesh.material)
        if (!ghost) {
            ghost = mesh.material.clone()
            ghost.transparent = true
            ghost.opacity = GHOST_OPACITY
            ghost.depthWrite = false
            ghost.depthTest = false
            clones.set(mesh.material, ghost)
        }
        mesh.material = ghost
        object.renderOrder = 998
    })
}

/**
 * The model for one piece of furniture, turned but not yet placed.
 *
 * A guard rail is the exception that keeps this honest: its shape already says
 * which way it runs — `railConnections` answers in absolute directions — so
 * turning it would turn it twice.
 */
function decorationModel(level: Level, decoration: Decoration): THREE.Object3D {
    const rail = decoration.kind === 'guard_rail'
    const object = createDecoration(decoration.kind, {
        connections: rail ? railConnections(level, decoration) : undefined,
    })
    if (!rail) object.rotation.y = DIRECTION_YAW[decoration.facing]
    return object
}

/**
 * Centre a piece on the rectangle it covers — which for an even footprint is
 * a tile edge rather than a tile centre.
 */
function placeDecorationObject(object: THREE.Object3D, decoration: Decoration) {
    const { width, depth } = footprintOf(decoration.kind, decoration.facing)
    object.position.set(
        decoration.position.x + (width - 1) / 2,
        0,
        decoration.position.y + (depth - 1) / 2,
    )
}


/**
 * Renders a `Level` and animates it from engine events.
 *
 * `World` is a pure renderer: it holds no game state and never decides what
 * is legal. The engine mutates `LevelState` synchronously and hands over a
 * step of `WorldEvent`s; `play()` resolves once that step has finished
 * animating, so the interpreter can await each line and keep the editor's
 * line indicator honest.
 */
export class World implements EventPlayer {

    scene: THREE.Scene
    camera: THREE.OrthographicCamera
    renderer: THREE.WebGLRenderer
    frame: number | null = null

    private timer = new THREE.Timer()
    private view: WorldState
    private canvas: HTMLCanvasElement
    private observer: ResizeObserver
    private queue = new AnimationQueue()
    private tiles = new TileFactory()

    // Scene graph — rebuilt wholesale by loadLevel
    private tileRoot = new THREE.Group()
    private itemRoot = new THREE.Group()
    private actorRoot = new THREE.Group()
    /** Editor overlays. Outlives a level, so `disposeLevel` leaves it alone. */
    private editorRoot = new THREE.Group()
    /**
     * Walls, yard and street — see `environment.ts`. Kept out of `tileRoot`
     * so the designer's raycast never lands on a facade, and kept across
     * `loadLevel` while `environmentKey` is unchanged: the designer reloads
     * the level on every stroke, and the scenery depends on none of it.
     */
    private environmentRoot = new THREE.Group()
    private environmentKey = ''
    private highlight: THREE.LineSegments | null = null
    /** The brush preview under the pointer, and what it was built from. */
    private ghost: THREE.Object3D | null = null
    private ghostKey = ''
    /** One outline per selected tile, pooled — see `setSelection`. */
    private selectionOutlines: THREE.LineSegments[] = []
    private linkedOutlines: THREE.LineSegments[] = []
    private outlineGeometry: THREE.BufferGeometry | null = null
    private outlineMaterials = new Map<number, THREE.LineBasicMaterial>()
    /** The void floor under the level. Outlives a level, like the lights. */
    private base: THREE.Mesh
    private raycaster = new THREE.Raycaster()
    private pointer = new THREE.Vector2()

    private level: Level | null = null
    private roboter: Roboter | null = null

    // Lookups, so an event can find the object it refers to
    private crateMeshes = new Map<string, THREE.Object3D>()
    private keycardMeshes = new Map<string, THREE.Object3D>()
    private doorLeaves = new Map<string, THREE.Object3D[]>()
    private switchLevers = new Map<TileKey, THREE.Object3D>()
    private switchLights = new Map<TileKey, THREE.MeshStandardMaterial>()
    private platePads = new Map<TileKey, THREE.Object3D>()
    private sensorZones = new Map<string, THREE.Object3D[]>()
    private sensorDevices = new Map<string, MotionSensorModel>()
    /** One entry per conveyor tile, scrolled by `tick` and dimmed by `setBeltState`. */
    private belts: BeltVisual[] = []

    private lastZoom: number

    constructor(canvas: HTMLCanvasElement, view: WorldState) {
        this.canvas = canvas
        this.view = view
        this.lastZoom = view.zoom

        this.scene = new THREE.Scene()
        this.scene.add(this.tileRoot, this.itemRoot, this.actorRoot, this.editorRoot, this.environmentRoot)

        this.camera = this.createCamera()
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
        this.renderer.setPixelRatio(pixelRatio())
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

        this.observer = new ResizeObserver(() => {
            // Re-read: dragging the window to another screen changes it.
            this.renderer.setPixelRatio(pixelRatio())
            this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
            this.updateFrustum()
        })
        this.observer.observe(canvas)

        // Not passive: zooming has to swallow the scroll, or the page moves
        // under the pointer instead of the camera.
        canvas.addEventListener('wheel', this.onWheel, { passive: false })

        this.createLights()
        this.base = this.createBase()
        this.tick()
    }


    // ========================================================
    // Level lifecycle
    // ========================================================

    /** The level currently on screen, if any. */
    get currentLevel(): Level | null {
        return this.level
    }

    /** Tear down whatever is rendered and build `level` from scratch. */
    loadLevel(level: Level, state: LevelState) {
        this.queue.cancel()
        this.disposeLevel()
        this.level = level

        this.buildTiles(level)
        this.buildEnvironment(level)
        this.buildDecorations(level)
        this.buildItems(level)
        this.buildSensors(level)

        this.roboter = createRoboter({
            // Cream shell and mint lenses are Tug's own palette; the accent is
            // overridden to Dewy's orange so the stripe, hubs and claws still
            // carry the product colour.
            scale: ROBOT_SCALE,
            accentColor: 0xFF9600,
        })
        this.actorRoot.add(this.roboter.group)

        this.frameCamera(level)
        this.applyState(state)
    }

    /** Snap everything to `state` with no animation — initial load and reset. */
    applyState(state: LevelState) {
        const robot = this.roboter
        if (!robot) return

        robot.resetPose()
        robot.setPosition(state.robot.position.x, state.robot.position.y)
        robot.setYaw(DIRECTION_YAW[state.robot.facing])

        for (const crate of state.crates) {
            const mesh = this.crateMeshes.get(crate.id)
            if (!mesh) continue
            if (crate.carried) {
                robot.carrySlot.attach(mesh)
                mesh.position.set(0, 0, 0)
                robot.pickUp(true)   // snap: applyState animates nothing
            } else {
                this.itemRoot.attach(mesh)
                mesh.position.set(crate.position.x, 0, crate.position.y)
            }
            mesh.visible = true
        }

        for (const keycard of state.keycards) {
            const mesh = this.keycardMeshes.get(keycard.id)
            if (mesh) mesh.visible = !keycard.collected
        }

        for (const door of state.doors) this.setDoorOpen(door.doorId, door.open, 1)
        for (const sw of state.switches) this.setSwitchOn(coordKey(sw.position), sw.on, 1)
        for (const plate of state.plates) this.setPlatePressed(coordKey(plate.position), plate.pressed, 1)
        for (const belt of state.belts) this.setBeltState(belt.beltId, belt.running, belt.reversed, 1)
        for (const sensor of state.motionSensors) this.setSensorActive(sensor.sensorId, sensor.active, 1)
        for (const crate of state.crates) {
            if (crate.delivered) this.markDelivered(crate.id)
        }
    }

    /**
     * Abandon the current run: snap in-flight animations to their end state,
     * reject anything still waiting with `RunCancelled` — which unwinds an
     * interpreter parked in a `while` loop — then re-apply a fresh state.
     */
    reset(state: LevelState) {
        this.queue.finishAll()
        this.applyState(state)
    }


    // ========================================================
    // Playback
    // ========================================================

    /**
     * Animate one step. Every event in `events` runs simultaneously;
     * successive calls run in order. Resolves when the step is done.
     */
    play(events: WorldEvent[]): Promise<void> {
        // Built lazily: an animation's start values are only known once the
        // preceding step has actually finished.
        return this.queue.play(() => events.flatMap((event) => this.animate(event)))
    }

    setPaused(paused: boolean) {
        this.view.paused = paused
    }


    // ========================================================
    // Frame loop
    // ========================================================

    tick(timestamp = 0) {
        this.frame = requestAnimationFrame((ts) => this.tick(ts))

        this.timer.update(timestamp)
        const delta = this.timer.getDelta()

        if (this.view.zoom !== this.lastZoom) {
            this.lastZoom = this.view.zoom
            this.updateFrustum()
        }

        this.queue.speed = Math.max(0.1, this.view.speed)
        if (!this.view.paused) this.queue.update(delta)

        // Ambient motion runs even while paused, so the robot never looks dead.
        this.roboter?.update(delta)
        this.scrollBelts(delta)

        this.renderer.render(this.scene, this.camera)
    }

    destroy() {
        if (this.frame !== null) cancelAnimationFrame(this.frame)
        this.frame = null
        this.queue.cancel()
        this.observer.disconnect()
        this.canvas.removeEventListener('wheel', this.onWheel)
        clearGroup(this.editorRoot)
        this.highlight = null
        this.selectionOutlines = []
        this.linkedOutlines = []
        this.outlineGeometry = null
        this.outlineMaterials.clear()
        this.scene.remove(this.base)
        disposeObject(this.base)
        clearGroup(this.environmentRoot)
        this.disposeLevel()
        this.tiles.dispose()
        this.renderer.dispose()
    }


    /**
     * Slide every belt's chevrons along its direction of travel.
     *
     * Ambient, like the robot's idle motion: belts are machinery and a level
     * full of frozen ones reads as broken. They are *not* what moves anything
     * — that is `conveyRobot` / `conveyCrate`, one step per tile of the ride.
     *
     * The wrap period is the tile pitch, not the chevron spacing, and every
     * belt shares one phase. That is what makes a run of belts look like a
     * single loop: the chevron that jumps back at a tile's seam lands exactly
     * where its neighbour's chevron was leaving, so nothing visibly pops.
     */
    private scrollBelts(delta: number) {
        if (this.belts.length === 0) return

        for (const belt of this.belts) {
            // A stopped belt is the one thing on screen that *should* look
            // dead: it is inert floor, and the frozen chevrons are how the
            // student reads that before stepping on.
            if (!belt.running) continue

            const step = BELT_SCROLL * delta * (belt.reversed ? -1 : 1)
            for (const chevron of belt.chevrons.children) {
                // Modulo rather than one subtraction: a backgrounded tab hands
                // us a delta of several seconds on the frame it wakes up.
                const z = chevron.position.z + step + 0.5
                chevron.position.z = ((z % 1) + 1) % 1 - 0.5
            }
        }
    }


    // ========================================================
    // Scene construction
    // ========================================================

    private buildTiles(level: Level) {
        for (let x = 0; x < level.width; x++) {
            for (let y = 0; y < level.height; y++) {
                const coord = { x, y }
                const tile = tileAt(level, coord)
                if (!tile) continue

                const shape = tile.kind === 'wall' || tile.kind === 'robot_gap'
                    ? wallShape(level, coord)
                    : undefined
                const object = this.tiles.create(tile, coord, shape)
                if (!object) continue
                object.position.x += x
                object.position.z += y
                // What `pickTile` reads back. Stamped on the tile's root
                // object; a raycast hit on a child walks up to find it.
                object.userData.coord = coord
                this.tileRoot.add(object)

                const key = coordKey(coord)
                if (tile.kind === 'door') {
                    const leaves = object.getObjectByName('doorLeaves')
                    if (leaves) {
                        const existing = this.doorLeaves.get(tile.doorId) ?? []
                        existing.push(leaves)
                        this.doorLeaves.set(tile.doorId, existing)
                    }
                } else if (tile.kind === 'switch') {
                    const lever = object.getObjectByName('switchLever')
                    if (lever) this.switchLevers.set(key, lever)
                    const light = object.getObjectByName('switchLight')
                    if (light instanceof THREE.Mesh) this.switchLights.set(key, light.material as THREE.MeshStandardMaterial)
                } else if (tile.kind === 'pressure_plate') {
                    const pad = object.getObjectByName('platePad')
                    if (pad) this.platePads.set(key, pad)
                } else if (tile.kind === 'conveyor' || tile.kind === 'cargo_conveyor') {
                    const chevrons = object.getObjectByName('beltChevrons')
                    if (chevrons) {
                        // `TileFactory` clones the material for a driven belt
                        // precisely so this one can be faded on its own.
                        const mesh = chevrons.children[0] as THREE.Mesh | undefined
                        const material = tile.control
                            ? (mesh?.material as THREE.MeshLambertMaterial ?? null)
                            : null
                        this.belts.push({
                            beltId: tile.control?.beltId ?? null,
                            chevrons,
                            material,
                            litColor: material?.color.clone() ?? new THREE.Color(),
                            running: true,
                            reversed: false,
                        })
                    }
                }
            }
        }
    }

    /**
     * The backdrop walls, the yard and the street around the level — not the
     * level's `wall` tiles. Rebuilt only when what it is planned from changes.
     */
    private buildEnvironment(level: Level) {
        const key = environmentKey(level)
        if (key === this.environmentKey) return
        clearGroup(this.environmentRoot)
        this.environmentRoot.add(buildEnvironment(planEnvironment(level)))
        this.environmentKey = key
    }

    /**
     * The furniture in `level.decorations`.
     *
     * Built into `tileRoot` rather than `itemRoot`, and stamped with the
     * coord of its north-west tile, so the designer's raycast finds it: a
     * shelf stands 1.5 units tall, and anything the ray does not hit reads
     * back as whatever tile lies a diagonal behind it. Stamping the corner
     * means a click anywhere on a shelf acts on the shelf.
     */
    private buildDecorations(level: Level) {
        for (const decoration of level.decorations) {
            const object = decorationModel(level, decoration)
            placeDecorationObject(object, decoration)
            object.userData.coord = { ...decoration.position }
            this.tileRoot.add(object)
        }
    }

    private buildItems(level: Level) {
        for (const item of level.items) {
            if (item.kind === 'keycard') {
                const mesh = createKeycard()
                mesh.position.set(item.position.x, 0, item.position.y)
                this.itemRoot.add(mesh)
                this.keycardMeshes.set(item.id, mesh)
            } else {
                const mesh = createCrate({ color: item.kind === 'crate_colour' ? item.color : undefined })
                mesh.position.set(item.position.x, 0, item.position.y)
                this.itemRoot.add(mesh)
                this.crateMeshes.set(item.id, mesh)
            }
        }
    }

    /**
     * Each motion sensor: the camera hanging over its tile, and a glowing
     * overlay on every tile it watches — one field with a lit rim, see
     * `createSensorZoneTile`.
     *
     * Built here rather than in `TileFactory` because a sensor spans many
     * tiles and sits *on top of* whatever tile is underneath it, which the
     * per-tile factory has no way to express.
     */
    private buildSensors(level: Level) {
        for (const sensor of level.motionSensors) {
            const zones: THREE.Object3D[] = []
            const tiles = sensorZone(level, sensor)
            const edges = zoneEdges(tiles)
            tiles.forEach((coord, i) => {
                const zone = createSensorZoneTile(sensor.initiallyActive, edges[i])
                zone.position.set(coord.x, 0.012, coord.y)
                this.tileRoot.add(zone)
                zones.push(zone)
            })
            this.sensorZones.set(sensor.sensorId, zones)

            const device = createMotionSensor({ active: sensor.initiallyActive })
            device.group.position.set(sensor.position.x, 0, sensor.position.y)
            // Stamped like a tile, so a click on the camera itself — which
            // hangs high enough to show a tile or two away from where it
            // hangs — picks the tile below it. See `pickTileFrom`.
            device.group.userData.coord = { ...sensor.position }
            this.tileRoot.add(device.group)
            this.sensorDevices.set(sensor.sensorId, device)
        }
    }

    private disposeLevel() {
        this.roboter?.dispose()
        this.roboter = null
        // The tile factory's cache is shared across levels and disposed by
        // `destroy`, so tearing this level down must leave it alone.
        const shared = this.tiles.shared()
        clearGroup(this.actorRoot)
        clearGroup(this.itemRoot)
        clearGroup(this.tileRoot, shared)
        this.crateMeshes.clear()
        this.keycardMeshes.clear()
        this.doorLeaves.clear()
        this.switchLevers.clear()
        this.switchLights.clear()
        this.platePads.clear()
        this.sensorZones.clear()
        this.sensorDevices.clear()
        this.belts = []
        this.level = null
        // Measured against the level that is going away — a rail ghost knows
        // which of its neighbours it joined. The canvas puts it back.
        this.clearGhost()
    }


    // ========================================================
    // Editor support
    //
    // Used by the level designer, never by the game. It lives here rather
    // than in `editor/` because picking needs the camera, the canvas and the
    // tile scene graph, and `World` owns all three.
    // ========================================================

    /**
     * The tile under a mouse position, or `null` when the pointer is off-world.
     *
     * Only the pixels-to-NDC step needs the canvas; the raycast itself lives
     * in `editor/picking.ts`, where it can be tested without a WebGL context.
     */
    pickTile(clientX: number, clientY: number): Coord | null {
        if (!this.level) return null

        const rect = this.canvas.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return null

        this.pointer.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        )

        return pickTileFrom(this.raycaster, this.camera, this.tileRoot, this.pointer, this.level)
    }

    /** Outline one tile, or clear the outline with `null`. */
    setHighlight(coord: Coord | null) {
        const outline = this.highlight ??= this.createHighlight()
        outline.visible = coord !== null
        if (coord) outline.position.set(coord.x, 0, coord.y)
    }

    /**
     * Show a translucent preview of what `brush` would put on `coord`.
     *
     * Built from the very same model factories the level is built from, so the
     * preview is the thing itself rather than a stand-in: a pallet's ghost is
     * three tiles wide because the pallet is, and a conveyor's chevrons point
     * where the belt would run. `null` for either argument clears it, as do the
     * two tools that paint nothing.
     *
     * The model is cached against what it was built from and only rebuilt when
     * that changes, so dragging across a level moves one object rather than
     * rebuilding a shelf per tile.
     */
    setGhost(brush: Brush | null, coord: Coord | null) {
        const level = this.level
        if (!level || !brush || !coord || brush.kind === 'select' || brush.kind === 'erase') {
            this.clearGhost()
            return
        }

        if (brush.kind === 'sensor') {
            // Asked of the same function the click will use, like furniture:
            // a tile that cannot take a sensor shows no ghost at all.
            if (!sensorPlacement(level, coord, brush)) {
                this.clearGhost()
                return
            }
            // Keyed by tile as well: the zone is clipped to the grid, so the
            // same brush previews differently next to a wall.
            const ghost = this.ensureGhost(
                `${ghostKey(brush)}:${coordKey(coord)}`,
                () => sensorGhost(level, brush, coord),
            )
            if (ghost) ghost.position.set(coord.x, 0, coord.y)
            return
        }

        if (brush.kind === 'decoration') {
            // Asked of the same function the click will use, so the ghost can
            // never show a placement the click then refuses — including the
            // slide back onto the grid near an edge.
            const placement = decorationPlacement(level, coord, brush.decoration, brush.facing)
            if (!placement) {
                this.clearGhost()
                return
            }
            // A rail's shape depends on the rails beside it, so its preview is
            // keyed by where it would stand as well as by what it is.
            const site = brush.decoration === 'guard_rail' ? coordKey(placement.position) : ''
            const ghost = this.ensureGhost(
                `deco:${brush.decoration}:${brush.facing}:${site}`,
                () => decorationModel(level, placement),
            )
            if (ghost) placeDecorationObject(ghost, placement)
            return
        }

        const ghost = this.ensureGhost(ghostKey(brush), () => this.ghostModel(brush))
        if (!ghost) return
        ghost.position.set(coord.x, 0, coord.y)
        // The robot model is the one thing built facing a fixed way; the rest
        // carry their direction in the object the factory handed back.
        if (brush.kind === 'robot') ghost.rotation.y = DIRECTION_YAW[brush.facing]
    }

    /** The scene object a non-decoration brush would add, unpositioned. */
    private ghostModel(brush: Brush): THREE.Object3D | null {
        switch (brush.kind) {
            case 'tile':
                // Coord only decides the checkerboard shade of a floor slab,
                // which a translucent preview has no use for.
                return this.tiles.create(brush.tile, { x: 0, y: 0 })
            case 'item':
                return brush.item.kind === 'keycard'
                    ? createKeycard()
                    : createCrate({
                          color: brush.item.kind === 'crate_colour' ? brush.item.color : undefined,
                      })
            case 'robot':
                return createRoboter({ scale: ROBOT_SCALE, accentColor: 0xff9600 }).group
            default:
                return null
        }
    }

    /**
     * The cached ghost for `key`, building it on the first ask.
     *
     * `build` may answer `null` — a pit's floorless tile has no model — in
     * which case there is simply nothing to show.
     */
    private ensureGhost(key: string, build: () => THREE.Object3D | null): THREE.Object3D | null {
        if (this.ghost && this.ghostKey === key) return this.ghost

        this.clearGhost()
        const object = build()
        if (!object) return null

        ghostify(object)
        this.editorRoot.add(object)
        this.ghost = object
        this.ghostKey = key
        return object
    }

    private clearGhost() {
        if (!this.ghost) return
        this.editorRoot.remove(this.ghost)
        // The tile factory's memoised resources are shared with the level and
        // must survive the preview that borrowed them. `ghostify` cloned every
        // material it touched, so the clones are not on that list and go.
        disposeObject(this.ghost, this.tiles.shared())
        this.ghost = null
        this.ghostKey = ''
    }

    /**
     * Outline a selection, or clear it with empty lists.
     *
     * `linked` is drawn in its own colour: those tiles are what the selected
     * thing drives, shown so the mechanism is visible, but an edit and a delete
     * only ever reach `coords`. Two colours is the only honest way to say that.
     */
    setSelection(coords: readonly Coord[], linked: readonly Coord[] = []) {
        this.placeOutlines(this.selectionOutlines, coords, SELECTION_COLOR)
        this.placeOutlines(this.linkedOutlines, linked, LINKED_COLOR)
    }

    /**
     * Move a pool of outlines onto `coords`, growing it if it is short.
     *
     * Pooled rather than rebuilt: a selection changes on every click of the
     * select tool, and growing to the largest selection seen costs a handful of
     * line loops. Surplus outlines are hidden, not removed, so the next
     * selection reuses them.
     */
    private placeOutlines(
        pool: THREE.LineSegments[],
        coords: readonly Coord[],
        color: number,
    ) {
        while (pool.length < coords.length) pool.push(this.createOutline(color))

        pool.forEach((outline, index) => {
            const coord = coords[index]
            outline.visible = coord !== undefined
            if (coord) outline.position.set(coord.x, 0, coord.y)
        })
    }

    /**
     * Geometry and material are made once and shared by every outline of a
     * colour — a selection is one object, and it should look like one.
     */
    private createOutline(color: number): THREE.LineSegments {
        if (!this.outlineGeometry) {
            const box = new THREE.BoxGeometry(1.04, 0.06, 1.04)
            this.outlineGeometry = new THREE.EdgesGeometry(box)
            box.dispose()
        }

        let material = this.outlineMaterials.get(color)
        if (!material) {
            material = new THREE.LineBasicMaterial({ color, depthTest: false })
            this.outlineMaterials.set(color, material)
        }

        const outline = new THREE.LineSegments(this.outlineGeometry, material)
        // Above the hover highlight, which shares these tiles while the
        // pointer is over the selection.
        outline.renderOrder = 1000
        outline.visible = false

        this.editorRoot.add(outline)
        return outline
    }

    private createHighlight(): THREE.LineSegments {
        const box = new THREE.BoxGeometry(1.02, 0.04, 1.02)
        const geometry = new THREE.EdgesGeometry(box)
        box.dispose()

        // `depthTest: false` keeps the outline readable on a tile tucked
        // behind a wall, which the fixed camera angle makes common.
        const material = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false })
        const outline = new THREE.LineSegments(geometry, material)
        outline.renderOrder = 999
        outline.visible = false

        this.editorRoot.add(outline)
        return outline
    }


    // ========================================================
    // Camera
    // ========================================================

    private createCamera() {
        return createIsometricCamera(this.view.zoom, this.aspect(), this.view.cameraPosition)
    }

    /** Centre the view on the level rather than on its corner tile. */
    private frameCamera(level: Level) {
        const centre = new THREE.Vector3((level.width - 1) / 2, 0, (level.height - 1) / 2)
        aimIsometricCamera(this.camera, centre, this.view.cameraPosition)
        this.base.position.set(centre.x, BASE_Y, centre.z)
        // Only a tile wider than the hole the lot leaves — enough to catch a
        // sightline down an edge pit, which runs on under the lot. Any bigger
        // and it would show past the lot's far edges, where the sky belongs.
        this.base.scale.set(level.width + 2, level.height + 2, 1)
    }

    /**
     * Scroll to zoom. Writes `view.zoom`; `tick` notices and rebuilds the
     * frustum, so the same path serves a slider or any other caller.
     */
    private onWheel = (event: WheelEvent) => {
        event.preventDefault()

        // Firefox reports lines, and page-at-a-time exists too.
        const perUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1
        const next = this.view.zoom * Math.exp(event.deltaY * perUnit * ZOOM_SENSITIVITY)

        this.view.zoom = Math.min(Math.max(next, this.view.minZoom), this.view.maxZoom)
    }

    private aspect() {
        const { clientWidth, clientHeight } = this.canvas
        return clientHeight > 0 ? clientWidth / clientHeight : 1
    }

    private updateFrustum() {
        const aspect = this.aspect()
        this.camera.left = -this.view.zoom * aspect
        this.camera.right = this.view.zoom * aspect
        this.camera.top = this.view.zoom
        this.camera.bottom = -this.view.zoom
        this.camera.updateProjectionMatrix()
    }

    /**
     * The floor of the void under the level, seen only down a pit: the lot
     * from `environment.ts` covers everything else. Outlives a level, since
     * it is framed rather than rebuilt.
     *
     * Unlit on purpose — `MeshBasicMaterial` renders `VOID_COLOR` exactly,
     * where a lit material would tint it with the scene's three lights.
     */
    private createBase(): THREE.Mesh {
        this.scene.background = new THREE.Color(SKY_COLOR)

        const base = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ color: VOID_COLOR }),
        )
        base.rotation.x = -Math.PI / 2
        base.position.y = BASE_Y
        this.scene.add(base)
        return base
    }

    private createLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 3))

        const dirLight = new THREE.DirectionalLight(0xffffff, 1)
        dirLight.position.set(100, 100, -100).normalize()
        dirLight.target.position.set(0, 0, 0)
        this.scene.add(dirLight)

        const topLight = new THREE.DirectionalLight(0xffffff, 1)
        topLight.position.set(0, 100, 0).normalize()
        this.scene.add(topLight)
    }


    // ========================================================
    // Event → animation
    // ========================================================

    private animate(event: WorldEvent): Animation[] {
        const robot = this.roboter
        if (!robot) return []
        const seconds = DURATIONS[event.kind]

        switch (event.kind) {
            case 'move': {
                const from = vec(event.from)
                const to = vec(event.to)
                const distance = from.distanceTo(to)
                let rolled = 0
                return [tween({
                    durationSeconds: seconds,
                    ease: easeInOutCubic,
                    onUpdate: (t) => {
                        robot.setPosition(lerp(from.x, to.x, t), lerp(from.z, to.z, t))
                        const travelled = distance * t
                        robot.rollWheels(travelled - rolled)
                        rolled = travelled
                    },
                })]
            }

            case 'push': {
                const mesh = this.crateMeshes.get(event.crateId)
                if (!mesh) return []
                const from = vec(event.from)
                const to = vec(event.to)
                return [tween({
                    durationSeconds: seconds,
                    ease: easeInOutCubic,
                    onUpdate: (t) => mesh.position.set(lerp(from.x, to.x, t), 0, lerp(from.z, to.z, t)),
                })]
            }

            case 'conveyRobot': {
                const from = vec(event.from)
                const to = vec(event.to)
                // Linear, and no wheel roll: the belt is doing the moving, and
                // a robot whose wheels spin while it is carried reads as
                // driving. Nothing eases, because a belt runs at one speed.
                return [tween({
                    durationSeconds: seconds,
                    onUpdate: (t) => robot.setPosition(lerp(from.x, to.x, t), lerp(from.z, to.z, t)),
                })]
            }

            case 'conveyCrate': {
                const mesh = this.crateMeshes.get(event.crateId)
                if (!mesh) return []
                const from = vec(event.from)
                const to = vec(event.to)
                return [tween({
                    durationSeconds: seconds,
                    onUpdate: (t) => mesh.position.set(lerp(from.x, to.x, t), 0, lerp(from.z, to.z, t)),
                })]
            }

            case 'turn': {
                // Tween by a fixed ±90° from the current yaw rather than to an
                // absolute angle, so a turn can never take the long way round.
                const start = robot.getYaw()
                const delta = (event.rotation === 'right' ? -1 : 1) * Math.PI / 2
                return [tween({
                    durationSeconds: seconds,
                    ease: easeInOutCubic,
                    onUpdate: (t) => robot.setYaw(start + delta * t),
                })]
            }

            case 'pick': {
                const mesh = this.crateMeshes.get(event.crateId)
                if (!mesh) return []
                const start = mesh.position.clone()
                const target = new THREE.Vector3()
                robot.pickUp()
                return [tween({
                    durationSeconds: seconds,
                    ease: easeInOutCubic,
                    onUpdate: (t) => {
                        // Recomputed every frame: the arms are still rising.
                        robot.carrySlot.getWorldPosition(target)
                        mesh.position.lerpVectors(start, target, t)
                        mesh.position.y += Math.sin(t * Math.PI) * 0.15
                    },
                    // attach, not add — it preserves world scale under the
                    // robot's own scaling.
                    onDone: () => robot.carrySlot.attach(mesh),
                })]
            }

            case 'drop':
            case 'deliver': {
                const mesh = this.crateMeshes.get(event.crateId)
                if (!mesh) return []
                this.itemRoot.attach(mesh)
                const start = mesh.position.clone()
                const end = vec(event.to)
                robot.lower()
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => mesh.position.lerpVectors(start, end, t),
                })]
            }

            case 'pickKeycard': {
                const mesh = this.keycardMeshes.get(event.keycardId)
                if (!mesh) return []
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => {
                        mesh.scale.setScalar(1 - t)
                        mesh.position.y = t * 0.4
                    },
                    onDone: () => {
                        mesh.visible = false
                        mesh.scale.setScalar(1)
                        mesh.position.y = 0
                    },
                })]
            }

            case 'door':
                return [tween({
                    durationSeconds: seconds,
                    ease: easeInOutCubic,
                    onUpdate: (t) => this.setDoorOpen(event.doorId, event.open, t),
                })]

            case 'belt':
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => this.setBeltState(event.beltId, event.running, event.reversed, t),
                })]

            case 'switch': {
                const key = coordKey(event.position)
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => this.setSwitchOn(key, event.on, t),
                })]
            }

            case 'plate': {
                const pad = this.platePads.get(coordKey(event.position))
                if (!pad) return []
                const from = pad.position.y
                const to = event.pressed ? 0.012 : 0.035
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => { pad.position.y = lerp(from, to, t) },
                })]
            }

            case 'sensor': {
                const zones = this.sensorZones.get(event.sensorId)
                if (!zones) return []
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => this.setSensorActive(event.sensorId, event.active, t),
                })]
            }

            case 'crateDelivered': {
                // Pushed onto the bay rather than placed — the crate is
                // already where it belongs, so this is a settle, not a move.
                const mesh = this.crateMeshes.get(event.crateId)
                if (!mesh) return []
                const base = mesh.position.y
                return [tween({
                    durationSeconds: seconds,
                    ease: easeOutCubic,
                    onUpdate: (t) => { mesh.position.y = base + Math.sin(t * Math.PI) * 0.12 },
                    onDone: () => {
                        mesh.position.y = base
                        this.markDelivered(event.crateId)
                    },
                })]
            }

            case 'bump': {
                const at = vec(event.at)
                const toward = vec(event.toward)
                const nudge = 0.22
                return [tween({
                    durationSeconds: seconds,
                    onUpdate: (t) => {
                        // Out and back within the tile.
                        const amount = Math.sin(t * Math.PI) * nudge
                        robot.setPosition(
                            at.x + (toward.x - at.x) * amount,
                            at.z + (toward.z - at.z) * amount,
                        )
                    },
                })]
            }

            case 'crash':
                return [instant(() => robot.panic()), hold(seconds)]

            case 'goalReached':
                // Self-timed like the crash. At speed 1 the hold covers it
                // exactly, so the level-complete sheet opens as Dewy lands;
                // faster, the sheet opens while it is still finishing.
                return [instant(() => robot.celebrate()), hold(seconds)]
        }
    }

    /** `t` is animation progress; pass 1 to snap. */
    private setDoorOpen(doorId: string, open: boolean, t: number) {
        const groups = this.doorLeaves.get(doorId)
        if (!groups) return
        const progress = open ? t : 1 - t
        for (const group of groups) {
            group.children.forEach((leaf, index) => {
                const side = index === 0 ? -1 : 1
                leaf.position.x = side * lerp(0.25, 0.72, progress)
            })
        }
    }

    private setPlatePressed(key: TileKey, pressed: boolean, t: number) {
        const pad = this.platePads.get(key)
        if (!pad) return
        const from = pressed ? 0.035 : 0.012
        const to = pressed ? 0.012 : 0.035
        pad.position.y = lerp(from, to, t)
    }

    /**
     * Fade a driven belt's chevrons between lit and the slab colour underneath,
     * and hand `scrollBelts` the flags it reads next frame.
     *
     * The running/reversed flags flip at `t === 0` rather than at the end, so
     * the belt visibly starts moving as it lights up instead of after. Which
     * way it travels reads purely from the scroll: the chevrons are symmetric
     * slabs, so there is no arrow to turn round.
     */
    private setBeltState(beltId: string, running: boolean, reversed: boolean, t: number) {
        for (const belt of this.belts) {
            if (belt.beltId !== beltId) continue
            belt.running = running
            belt.reversed = reversed
            if (!belt.material) continue

            const from = running ? BELT_DARK : belt.litColor
            const to = running ? belt.litColor : BELT_DARK
            belt.material.color.lerpColors(from, to, t)
        }
    }

    /**
     * Fade a sensor between green (off) and red (on). The zone stays visible
     * either way: an inactive zone is still where a switch could arm one, and
     * the level has to show that before it happens.
     */
    private setSensorActive(sensorId: string, active: boolean, t: number) {
        const amount = active ? t : 1 - t
        for (const zone of this.sensorZones.get(sensorId) ?? []) {
            const material = (zone as THREE.Mesh).material as THREE.MeshBasicMaterial
            material.color.copy(SENSOR_OFF).lerp(SENSOR_ON, amount)
        }
        this.sensorDevices.get(sensorId)?.setActive(amount)
    }

    /** A delivered crate is inert — dim it so it reads as locked in. */
    private markDelivered(crateId: string) {
        const mesh = this.crateMeshes.get(crateId)
        mesh?.traverse((child) => {
            const material = (child as THREE.Mesh).material
            if (material && !Array.isArray(material) && 'emissive' in material) {
                const standard = material as THREE.MeshStandardMaterial
                standard.emissive.setHex(0x224422)
                standard.emissiveIntensity = 0.45
            }
        })
    }

    private setSwitchOn(key: TileKey, on: boolean, t: number) {
        const lever = this.switchLevers.get(key)
        if (lever) {
            const from = on ? 0.5 : -0.5
            const to = on ? -0.5 : 0.5
            lever.rotation.x = lerp(from, to, t)
        }

        // The light snaps once the lever is past halfway, like a real contact.
        const light = this.switchLights.get(key)
        if (light) {
            const color = (t >= 0.5) === on ? COLORS.switchOn : COLORS.switchOff
            light.color.setHex(color)
            light.emissive.setHex(color)
        }
    }
}


// ============================================================
// Helpers
// ============================================================

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Grid coord → scene position. `y` is the row, and becomes Three.js Z. */
const vec = (c: Coord) => new THREE.Vector3(c.x, 0, c.y)
