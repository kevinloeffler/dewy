import type { CrateColor } from './crate-color';

// The interpreter calls this interface, knows nothing about Three.js
export interface RobotActions {
    moveForward(): ExecutionResult
    turnLeft(): ExecutionResult
    turnRight(): ExecutionResult
    pick(): ExecutionResult
    drop(): ExecutionResult
    open(): ExecutionResult
    toggle(): ExecutionResult
}

// The interpreter queries this interface for sensing
export interface RobotSensors {
    isBlocked(): boolean
    isCrate(): boolean
    isCarrying(): boolean
    isGoal(): boolean
    isDropOff(): boolean
    crateColor(): CrateColor | null
    isDangerous(): boolean
}

export type ExecutionResult =
    | { status: "ok" }
    | { status: "crash"; reason: string }
    | { status: "goal_reached" }
