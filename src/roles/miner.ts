import "./types";
const roomUtils = require('utils.roomUtils');

export const roleMiner: CreepRole = {
    run(creep: Creep): void {
        // Ensure the creep has a source assigned
        if (!creep.memory.sourceId) {
            this.assignSource(creep);
            return;
        }
        
        // If the creep doesn't have a home room set, set it
        if (!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
        
        // If the source is in another room, travel there
        const source = Game.getObjectById(creep.memory.sourceId) as Source;
        if (!source) {
            // Source doesn't exist anymore, reassign
            delete creep.memory.sourceId;
            return;
        }
        
        // If we're in a different room, move to the target room
        if (source.room.name !== creep.room.name) {
            const exitDir = Game.map.findExit(creep.room, source.room.name);
            const exit = creep.pos.findClosestByPath(exitDir);
            if (exit) {
                creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }
        
        // Check for hostiles in the room if it's not our own
        if (!creep.room.controller || !creep.room.controller.my) {
            const hostiles = roomUtils.findHostiles(creep.room);
            if (hostiles.length > 0) {
                // Retreat to home room
                if (creep.memory.homeRoom) {
                    const exitDir = Game.map.findExit(creep.room, creep.memory.homeRoom);
                    const exit = creep.pos.findClosestByPath(exitDir);
                    if (exit) {
                        creep.moveTo(exit, { visualizePathStyle: { stroke: '#ff0000' } });
                    }
                }
                return;
            }
        }
        
        // Find a container at the source
        const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: (s: Structure) => s.structureType === STRUCTURE_CONTAINER
        }) as StructureContainer[];
        
        // If there's a container
        if (containers.length > 0) {
            const container = containers[0];
            
            // If not on top of the container, move to it
            if (!creep.pos.isEqualTo(container.pos)) {
                creep.moveTo(container, { visualizePathStyle: { stroke: '#ffaa00' } });
                return;
            }
            
            // Mine the source
            creep.harvest(source);
        } 
        // No container, just get within range of the source
        else {
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            
            // If we're full, drop the resource
            if (creep.store.getFreeCapacity() === 0) {
                creep.drop(RESOURCE_ENERGY);
            }
            
            // If we're at the source and there's no container, maybe build one
            if (creep.pos.inRangeTo(source, 1)) {
                // Check if there's a construction site for a container
                const sites = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
                    filter: (s: ConstructionSite) => s.structureType === STRUCTURE_CONTAINER
                });
                
                // If no construction site, create one
                if (sites.length === 0 && creep.room.controller && creep.room.controller.my) {
                    creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
                }
            }
        }
    },
    
    assignSource(creep: Creep): boolean {
        if (!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
        
        const room = Game.rooms[creep.memory.homeRoom];
        if (!room) return false;
        
        // First look for sources in current room that don't have a miner
        const sources = room.find(FIND_SOURCES);
        
        // Count miners already assigned to each source
        const sourceAssignments: { [sourceId: string]: number } = {};
        for (const name in Game.creeps) {
            const otherCreep = Game.creeps[name];
            if (otherCreep.memory.role === 'miner' && otherCreep.memory.sourceId) {
                sourceAssignments[otherCreep.memory.sourceId] = (sourceAssignments[otherCreep.memory.sourceId] || 0) + 1;
            }
        }
        
        // Find an unassigned or least assigned source
        let bestSource: Source | null = null;
        let lowestCount = Infinity;
        
        for (const source of sources) {
            const count = sourceAssignments[source.id] || 0;
            if (count < lowestCount) {
                lowestCount = count;
                bestSource = source;
            }
        }
        
        // If all sources in this room have at least one miner, look for remote sources
        if (lowestCount >= 1) {
            for (const roomName in Memory.rooms) {
                // Skip the current room
                if (roomName === creep.memory.homeRoom) continue;
                
                const roomMem = Memory.rooms[roomName];
                // Skip rooms with hostiles or reserved/owned controllers
                if (roomMem.hostilePresence || 
                    (roomMem.controller && 
                     (roomMem.controller.owner || roomMem.controller.reservation))) {
                    continue;
                }
                
                // Check sources in this room
                if (roomMem.sources) {
                    for (const sourceData of roomMem.sources) {
                        const count = sourceAssignments[sourceData.id] || 0;
                        if (count < lowestCount) {
                            lowestCount = count;
                            // For remote sources, we just store the ID
                            bestSource = { id: sourceData.id } as any;
                        }
                    }
                }
            }
        }
        
        // Assign the best source
        if (bestSource) {
            creep.memory.sourceId = bestSource.id;
            return true;
        }
        
        return false;
    }
};

module.exports = roleMiner;
