// Global type declarations for Screeps

// Memory extensions
interface Memory {
    creeps: { [name: string]: CreepMemory };
    rooms: { [name: string]: RoomMemory };
    flags: { [name: string]: FlagMemory };
    spawns: { [name: string]: SpawnMemory };
}

// Creep memory
interface CreepMemory {
    role: string;
    working?: boolean;
    delivering?: boolean;
    homeRoom?: string;
    targetRoom?: string;
    targetSource?: string;
    sourceId?: string;
    exploring?: boolean;
    [key: string]: any;
}

// Room memory
interface RoomMemory {
    sources?: SourceInfo[];
    lastVisit?: number;
    needsExploration?: boolean;
    hostilePresence?: boolean;
    lastHostileTime?: number;
    controller?: ControllerInfo;
    haulerAssignments?: { [creepName: string]: string };
    [key: string]: any;
}

interface SourceInfo {
    id: string;
    pos: RoomPosition;
}

interface ControllerInfo {
    id: string;
    pos: RoomPosition;
    owner: string | null;
    reservation: string | null;
}

interface RoomPosition {
    x: number;
    y: number;
    roomName?: string;
}

// Flag memory
interface FlagMemory {
    [key: string]: any;
}

// Spawn memory
interface SpawnMemory {
    [key: string]: any;
}

// Module types
interface CreepRole {
    run(creep: Creep): void;
    [key: string]: any;
}

interface Manager {
    run(room: Room): void;
    [key: string]: any;
}

interface SpawnManagerType {
    run(spawn: StructureSpawn): void;
    countCreepsByRole(): { [role: string]: number };
    getNextCreepRole(counts: { [role: string]: number }, room: Room): string | null;
    getCreepBody(role: string, energy: number): BodyPartConstant[];
}

interface UtilsModule {
    [key: string]: any;
}

interface MovementModule {
    moveToRoom(creep: Creep, targetRoom: string): boolean;
    [key: string]: any;
}

// Export empty object to make this a module
export {};
