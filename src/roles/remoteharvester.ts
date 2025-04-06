import "./types";
const roomUtils = require('utils.roomUtils');

export const roleRemoteHarvester: CreepRole = {
    run(creep: Creep): void {
        if (creep.memory.working === undefined) {
            creep.memory.working = false;
            creep.memory.homeRoom = creep.room.name;
            this.assignHarvestTarget(creep);
        }

        if (creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        if (creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }

        if (creep.memory.working) {
            if (creep.room.name !== creep.memory.homeRoom) {
                const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
                const exit = creep.pos.findClosestByPath(exitDir);
                if (exit) {
                    creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
                    filter: (s: Structure) => (
                        (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) &&
                        (s as StructureExtension | StructureSpawn).store.getFreeCapacity(RESOURCE_ENERGY) > 0
                    )
                }) as StructureExtension | StructureSpawn;

                if (target) {
                    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                } else if (creep.room.storage && 
                           creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.storage, { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                } else if (creep.room.controller && 
                           creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                }
            }
        } else {
            if (creep.memory.targetRoom && creep.memory.targetSource) {
                if (creep.room.name !== creep.memory.targetRoom) {
                    const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
                    const exit = creep.pos.findClosestByPath(exitDir);
                    if (exit) {
                        creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                } else {
                    const hostiles = roomUtils.findHostiles(creep.room);
                    if (hostiles.length > 0) {
                        Memory.rooms[creep.room.name].hostilePresence = true;
                        Memory.rooms[creep.room.name].lastHostileTime = Game.time;

                        const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
                        const exit = creep.pos.findClosestByPath(exitDir);
                        if (exit) {
                            creep.moveTo(exit, { visualizePathStyle: { stroke: '#ff0000' } });
                        }

                        delete creep.memory.targetRoom;
                        delete creep.memory.targetSource;
                    } else {
                        const source = Game.getObjectById(creep.memory.targetSource) as Source;
                        if (source) {
                            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
                            }
                        } else {
                            delete creep.memory.targetRoom;
                            delete creep.memory.targetSource;
                        }
                    }
                }
            } else {
                this.assignHarvestTarget(creep);
            }
        }
    },

    assignHarvestTarget(creep: Creep): boolean {
        if (!Memory.rooms) return false;

        let candidateRooms: { 
            name: string, 
            sources: SourceInfo[], 
            lastVisit: number 
        }[] = [];
        
        for (const roomName in Memory.rooms) {
            const roomMem = Memory.rooms[roomName];
            if (roomName === creep.memory.homeRoom) continue;
            if (roomMem.sources && !roomMem.hostilePresence &&
                (!roomMem.controller || (!roomMem.controller.owner && !roomMem.controller.reservation))) {
                candidateRooms.push({ 
                    name: roomName, 
                    sources: roomMem.sources, 
                    lastVisit: roomMem.lastVisit || 0 
                });
            }
        }

        candidateRooms.sort((a, b) => b.lastVisit - a.lastVisit);

        if (candidateRooms.length > 0) {
            const targetRoom = candidateRooms[0];
            const sourceIndex = creep.name.charCodeAt(creep.name.length - 1) % targetRoom.sources.length;
            creep.memory.targetRoom = targetRoom.name;
            creep.memory.targetSource = targetRoom.sources[sourceIndex].id;
            return true;
        }
        
        return false;
    }
};

module.exports = roleRemoteHarvester;
