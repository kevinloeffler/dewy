import * as THREE from 'three'
import { type WorldState } from './worldState.svelte'
import type { Coord, Level, TileKey } from './level'
import type { LevelState } from './level-state'
import type { EventPlayer, WorldEvent, WorldEventKind } from './events'
import { coordKey, DIRECTION_YAW, tileAt } from './grid'
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
import { createRoboter, type Roboter } from '$lib/game/models/roboter'
import { createCrate } from '$lib/game/models/crate'
import { createKeycard } from '$lib/game/models/keycard'
import { TileFactory } from '$lib/game/models/tiles'


const ROBOT_SCALE = 1.5

/** The ground the world sits on, and the colour behind it. */
const BASE_COLOR = 0xcae5c5

/**
 * How far the base extends from the level centre, in tiles. Large enough to
 * run past the frustum at `maxZoom` on any sane aspect ratio, and still well
 * inside the camera's clip planes.
 */
const BASE_EXTENT = 500

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
    switch:      0.25,
    plate:       0.15,
    sensor:      0.30,
    crateDelivered: 0.35,
    bump:        0.25,
    crash:       0.90,
    goalReached: 0.50,
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
    private highlight: THREE.LineSegments | null = null
    /** The ground plane. Outlives a level, like the lights. */
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
    private platePads = new Map<TileKey, THREE.Object3D>()
    private sensorZones = new Map<string, THREE.Object3D[]>()
    /** The 'beltChevrons' group of every conveyor tile, scrolled by `tick`. */
    private beltChevrons: THREE.Object3D[] = []

    private lastZoom: number

    constructor(canvas: HTMLCanvasElement, view: WorldState) {
        this.canvas = canvas
        this.view = view
        this.lastZoom = view.zoom

        this.scene = new THREE.Scene()
        this.scene.add(this.tileRoot, this.itemRoot, this.actorRoot, this.editorRoot)

        this.camera = this.createCamera()
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

        this.observer = new ResizeObserver(() => {
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
        this.buildWalls(level)
        this.buildItems(level)
        this.buildSensors(level)

        this.roboter = createRoboter({
            scale: ROBOT_SCALE,
            bodyColor: 0xFF9600,
            accentColor: 0x402700,
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
                robot.pickUp()
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
        this.scene.remove(this.base)
        disposeObject(this.base)
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
        if (this.beltChevrons.length === 0) return

        const step = BELT_SCROLL * delta
        for (const belt of this.beltChevrons) {
            for (const chevron of belt.children) {
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

                const object = this.tiles.create(tile, coord)
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
                } else if (tile.kind === 'pressure_plate') {
                    const pad = object.getObjectByName('platePad')
                    if (pad) this.platePads.set(key, pad)
                } else if (tile.kind === 'conveyor' || tile.kind === 'cargo_conveyor') {
                    const chevrons = object.getObjectByName('beltChevrons')
                    if (chevrons) this.beltChevrons.push(chevrons)
                }
            }
        }
    }

    /** Backdrop only — not the level's `wall` tiles. */
    private buildWalls(level: Level) {
        const thickness = 0.15
        const height = 4
        const material = new THREE.MeshLambertMaterial({ color: 0x888888 })

        // Along Z, extended to fill the corner behind the back wall.
        const left = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, level.height + thickness), material)
        left.position.set(-0.5 - thickness / 2, height / 2 - 0.1, (level.height - 1 - thickness) / 2)
        this.tileRoot.add(left)

        // Along X.
        const back = new THREE.Mesh(new THREE.BoxGeometry(level.width, height, thickness), material)
        back.position.set((level.width - 1) / 2, height / 2 - 0.1, -0.5 - thickness / 2)
        this.tileRoot.add(back)
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
     * Tinted overlays marking each motion sensor's forbidden tiles.
     *
     * Built here rather than in `TileFactory` because a sensor spans many
     * tiles and sits *on top of* whatever tile is underneath it, which the
     * per-tile factory has no way to express.
     */
    private buildSensors(level: Level) {
        for (const sensor of level.motionSensors) {
            const zones: THREE.Object3D[] = []
            for (const coord of sensor.forbiddenTiles) {
                const material = new THREE.MeshBasicMaterial({
                    color: 0xff3b30,
                    transparent: true,
                    opacity: 0.28,
                    depthWrite: false,
                })
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.01, 0.94), material)
                mesh.position.set(coord.x, 0.012, coord.y)
                this.tileRoot.add(mesh)
                zones.push(mesh)
            }
            this.sensorZones.set(sensor.sensorId, zones)
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
        this.platePads.clear()
        this.sensorZones.clear()
        this.beltChevrons = []
        this.level = null
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
     * The ground the level sits on: one big quad plus a matching clear
     * colour, so the frame is filled at any zoom even if the quad ever runs
     * out at an extreme aspect ratio.
     *
     * Unlit on purpose — `MeshBasicMaterial` renders `BASE_COLOR` exactly,
     * where a lit material would tint it with the scene's three lights.
     */
    private createBase(): THREE.Mesh {
        this.scene.background = new THREE.Color(BASE_COLOR)

        const base = new THREE.Mesh(
            new THREE.PlaneGeometry(BASE_EXTENT * 2, BASE_EXTENT * 2),
            new THREE.MeshBasicMaterial({ color: BASE_COLOR }),
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
                return [hold(seconds)]
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

    private setSensorActive(sensorId: string, active: boolean, t: number) {
        const zones = this.sensorZones.get(sensorId)
        if (!zones) return
        const from = active ? 0 : 0.28
        const to = active ? 0.28 : 0
        for (const zone of zones) {
            const material = (zone as THREE.Mesh).material as THREE.MeshBasicMaterial
            material.opacity = lerp(from, to, t)
            zone.visible = material.opacity > 0.01
        }
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
        if (!lever) return
        const from = on ? 0.5 : -0.5
        const to = on ? -0.5 : 0.5
        lever.rotation.x = lerp(from, to, t)
    }
}


// ============================================================
// Helpers
// ============================================================

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Grid coord → scene position. `y` is the row, and becomes Three.js Z. */
const vec = (c: Coord) => new THREE.Vector3(c.x, 0, c.y)
